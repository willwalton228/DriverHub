import { db } from "../db";
import { eq, and, gte, lte, sql, count } from "drizzle-orm";
import {
  schedulingShifts,
  schedulingAssignments,
  schedulingSchedules,
  schedulingEntities,
  timeClockEvents,
  unionCbaViolations,
  unionCbaRuleSets,
} from "@shared/schema";

export interface InsuranceReportPeriod {
  startDate: string;
  endDate: string;
  periodType: "monthly" | "quarterly";
}

export interface OTRiskReport {
  reportType: "ot_risk_prevention";
  period: InsuranceReportPeriod;
  totalShifts: number;
  totalAssignments: number;
  shiftsExceedingOTThreshold: number;
  otPreventionRate: number;
  avgShiftDurationHours: number;
  maxShiftDurationHours: number;
  unionRuleViolations: number;
  unionRuleViolationsAcknowledged: number;
  details: Array<{
    date: string;
    shiftCount: number;
    avgHours: number;
    otExceedances: number;
  }>;
}

export interface BreakComplianceReport {
  reportType: "break_compliance";
  period: InsuranceReportPeriod;
  totalClockEvents: number;
  breakStartEvents: number;
  breakEndEvents: number;
  complianceRate: number;
  avgBreakDurationMinutes: number;
  shiftsWithBreaks: number;
  shiftsWithoutBreaks: number;
  details: Array<{
    date: string;
    breaksTaken: number;
    avgBreakMinutes: number;
  }>;
}

export interface FatigueIndicatorsReport {
  reportType: "fatigue_indicators";
  period: InsuranceReportPeriod;
  totalAssignments: number;
  consecutiveDayViolations: number;
  restPeriodViolations: number;
  longShiftCount: number;
  avgRestBetweenShiftsHours: number;
  fatigueRiskScore: number;
  details: Array<{
    indicator: string;
    count: number;
    severity: string;
    description: string;
  }>;
}

export interface NoShowMitigationReport {
  reportType: "no_show_mitigation";
  period: InsuranceReportPeriod;
  totalAssignments: number;
  noShowCount: number;
  noShowRate: number;
  confirmedAssignments: number;
  confirmationRate: number;
  declinedAssignments: number;
  cancelledAssignments: number;
  details: Array<{
    date: string;
    totalAssigned: number;
    noShows: number;
    confirmed: number;
  }>;
}

function getDateRange(periodType: string, periodStart: string): InsuranceReportPeriod {
  const start = new Date(periodStart);
  let end: Date;
  if (periodType === "quarterly") {
    end = new Date(start);
    end.setMonth(end.getMonth() + 3);
    end.setDate(end.getDate() - 1);
  } else {
    end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    end.setDate(end.getDate() - 1);
  }
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
    periodType: periodType as "monthly" | "quarterly",
  };
}

export async function generateOTRiskReport(
  entityId: string | null,
  periodType: string,
  periodStart: string
): Promise<OTRiskReport> {
  const period = getDateRange(periodType, periodStart);
  const OT_THRESHOLD_HOURS = 8;

  const scheduleConditions = [];
  if (entityId) scheduleConditions.push(eq(schedulingSchedules.entityId, entityId));
  scheduleConditions.push(gte(schedulingSchedules.startDate, period.startDate));
  scheduleConditions.push(lte(schedulingSchedules.endDate, period.endDate));

  const schedules = await db
    .select({ id: schedulingSchedules.id })
    .from(schedulingSchedules)
    .where(and(...scheduleConditions));

  const scheduleIds = schedules.map((s) => s.id);

  if (scheduleIds.length === 0) {
    return {
      reportType: "ot_risk_prevention",
      period,
      totalShifts: 0,
      totalAssignments: 0,
      shiftsExceedingOTThreshold: 0,
      otPreventionRate: 100,
      avgShiftDurationHours: 0,
      maxShiftDurationHours: 0,
      unionRuleViolations: 0,
      unionRuleViolationsAcknowledged: 0,
      details: [],
    };
  }

  const allShifts = await db
    .select()
    .from(schedulingShifts)
    .where(
      sql`${schedulingShifts.scheduleId} IN (${sql.join(
        scheduleIds.map((id) => sql`${id}`),
        sql`, `
      )})`
    );

  let allAssignments: any[] = [];
  if (allShifts.length > 0) {
    allAssignments = await db
      .select()
      .from(schedulingAssignments)
      .where(
        sql`${schedulingAssignments.shiftId} IN (${sql.join(
          allShifts.map((s) => sql`${s.id}`),
          sql`, `
        )})`
      );
  }

  let totalDurationHours = 0;
  let maxDuration = 0;
  let otExceedances = 0;
  const dateMap = new Map<string, { count: number; totalHours: number; otExceed: number }>();

  for (const shift of allShifts) {
    const start = new Date(shift.startTime);
    const end = new Date(shift.endTime);
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    totalDurationHours += hours;
    if (hours > maxDuration) maxDuration = hours;
    if (hours > OT_THRESHOLD_HOURS) otExceedances++;

    const dateKey = start.toISOString().split("T")[0];
    const existing = dateMap.get(dateKey) || { count: 0, totalHours: 0, otExceed: 0 };
    existing.count++;
    existing.totalHours += hours;
    if (hours > OT_THRESHOLD_HOURS) existing.otExceed++;
    dateMap.set(dateKey, existing);
  }

  let unionViolations = 0;
  let unionAcknowledged = 0;
  if (entityId) {
    const entityRuleSets = await db
      .select({ id: unionCbaRuleSets.id })
      .from(unionCbaRuleSets)
      .where(eq(unionCbaRuleSets.entityId, entityId));
    if (entityRuleSets.length > 0) {
      const violations = await db
        .select()
        .from(unionCbaViolations)
        .where(
          sql`${unionCbaViolations.ruleSetId} IN (${sql.join(
            entityRuleSets.map((rs) => sql`${rs.id}`),
            sql`, `
          )})`
        );
      unionViolations = violations.length;
      unionAcknowledged = violations.filter((v) => v.acknowledgedAt).length;
    }
  }

  const details = Array.from(dateMap.entries())
    .map(([date, data]) => ({
      date,
      shiftCount: data.count,
      avgHours: data.count > 0 ? Math.round((data.totalHours / data.count) * 10) / 10 : 0,
      otExceedances: data.otExceed,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    reportType: "ot_risk_prevention",
    period,
    totalShifts: allShifts.length,
    totalAssignments: allAssignments.length,
    shiftsExceedingOTThreshold: otExceedances,
    otPreventionRate:
      allShifts.length > 0
        ? Math.round(((allShifts.length - otExceedances) / allShifts.length) * 1000) / 10
        : 100,
    avgShiftDurationHours:
      allShifts.length > 0
        ? Math.round((totalDurationHours / allShifts.length) * 10) / 10
        : 0,
    maxShiftDurationHours: Math.round(maxDuration * 10) / 10,
    unionRuleViolations: unionViolations,
    unionRuleViolationsAcknowledged: unionAcknowledged,
    details,
  };
}

export async function generateBreakComplianceReport(
  entityId: string | null,
  periodType: string,
  periodStart: string
): Promise<BreakComplianceReport> {
  const period = getDateRange(periodType, periodStart);

  const clockConditions = [];
  clockConditions.push(gte(timeClockEvents.eventTime, new Date(period.startDate)));
  clockConditions.push(lte(timeClockEvents.eventTime, new Date(period.endDate + "T23:59:59")));

  const clockEvents = await db
    .select()
    .from(timeClockEvents)
    .where(and(...clockConditions));

  const breakStarts = clockEvents.filter((e) => e.eventType === "break_start");
  const breakEnds = clockEvents.filter((e) => e.eventType === "break_end");

  const breakPairs: Array<{ startTime: Date; endTime: Date; durationMin: number }> = [];
  const breakStartMap = new Map<string, typeof clockEvents>();

  for (const bs of breakStarts) {
    const key = bs.userId;
    if (!breakStartMap.has(key)) breakStartMap.set(key, []);
    breakStartMap.get(key)!.push(bs);
  }

  for (const be of breakEnds) {
    const userBreaks = breakStartMap.get(be.userId);
    if (userBreaks && userBreaks.length > 0) {
      const matchingStart = userBreaks.shift()!;
      const durationMin =
        (new Date(be.eventTime).getTime() - new Date(matchingStart.eventTime).getTime()) /
        (1000 * 60);
      breakPairs.push({
        startTime: new Date(matchingStart.eventTime),
        endTime: new Date(be.eventTime),
        durationMin: Math.round(durationMin * 10) / 10,
      });
    }
  }

  const avgBreakDuration =
    breakPairs.length > 0
      ? Math.round(
          (breakPairs.reduce((sum, p) => sum + p.durationMin, 0) / breakPairs.length) * 10
        ) / 10
      : 0;

  const scheduleConditions = [];
  if (entityId) scheduleConditions.push(eq(schedulingSchedules.entityId, entityId));
  scheduleConditions.push(gte(schedulingSchedules.startDate, period.startDate));
  scheduleConditions.push(lte(schedulingSchedules.endDate, period.endDate));

  const schedules = await db
    .select({ id: schedulingSchedules.id })
    .from(schedulingSchedules)
    .where(and(...scheduleConditions));

  let totalShiftsInPeriod = 0;
  if (schedules.length > 0) {
    const shifts = await db
      .select({ id: schedulingShifts.id })
      .from(schedulingShifts)
      .where(
        sql`${schedulingShifts.scheduleId} IN (${sql.join(
          schedules.map((s) => sql`${s.id}`),
          sql`, `
        )})`
      );
    totalShiftsInPeriod = shifts.length;
  }

  const shiftsWithBreaks = breakPairs.length;
  const shiftsWithoutBreaks = Math.max(0, totalShiftsInPeriod - shiftsWithBreaks);

  const dateBreakMap = new Map<string, { count: number; totalMin: number }>();
  for (const pair of breakPairs) {
    const dateKey = pair.startTime.toISOString().split("T")[0];
    const existing = dateBreakMap.get(dateKey) || { count: 0, totalMin: 0 };
    existing.count++;
    existing.totalMin += pair.durationMin;
    dateBreakMap.set(dateKey, existing);
  }

  const details = Array.from(dateBreakMap.entries())
    .map(([date, data]) => ({
      date,
      breaksTaken: data.count,
      avgBreakMinutes: data.count > 0 ? Math.round((data.totalMin / data.count) * 10) / 10 : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    reportType: "break_compliance",
    period,
    totalClockEvents: clockEvents.length,
    breakStartEvents: breakStarts.length,
    breakEndEvents: breakEnds.length,
    complianceRate:
      totalShiftsInPeriod > 0
        ? Math.round((shiftsWithBreaks / totalShiftsInPeriod) * 1000) / 10
        : 100,
    avgBreakDurationMinutes: avgBreakDuration,
    shiftsWithBreaks,
    shiftsWithoutBreaks,
    details,
  };
}

export async function generateFatigueReport(
  entityId: string | null,
  periodType: string,
  periodStart: string
): Promise<FatigueIndicatorsReport> {
  const period = getDateRange(periodType, periodStart);
  const LONG_SHIFT_HOURS = 10;
  const MIN_REST_HOURS = 8;

  const scheduleConditions = [];
  if (entityId) scheduleConditions.push(eq(schedulingSchedules.entityId, entityId));
  scheduleConditions.push(gte(schedulingSchedules.startDate, period.startDate));
  scheduleConditions.push(lte(schedulingSchedules.endDate, period.endDate));

  const schedules = await db
    .select({ id: schedulingSchedules.id })
    .from(schedulingSchedules)
    .where(and(...scheduleConditions));

  const scheduleIds = schedules.map((s) => s.id);
  if (scheduleIds.length === 0) {
    return {
      reportType: "fatigue_indicators",
      period,
      totalAssignments: 0,
      consecutiveDayViolations: 0,
      restPeriodViolations: 0,
      longShiftCount: 0,
      avgRestBetweenShiftsHours: 0,
      fatigueRiskScore: 0,
      details: [],
    };
  }

  const allShifts = await db
    .select()
    .from(schedulingShifts)
    .where(
      sql`${schedulingShifts.scheduleId} IN (${sql.join(
        scheduleIds.map((id) => sql`${id}`),
        sql`, `
      )})`
    );

  const shiftIds = allShifts.map((s) => s.id);
  let allAssignments: any[] = [];
  if (shiftIds.length > 0) {
    allAssignments = await db
      .select()
      .from(schedulingAssignments)
      .where(
        sql`${schedulingAssignments.shiftId} IN (${sql.join(
          shiftIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      );
  }

  let longShiftCount = 0;
  let restViolations = 0;
  let totalRestHours = 0;
  let restCount = 0;

  const shiftMap = new Map(allShifts.map((s) => [s.id, s]));

  const workerShifts = new Map<string, Array<{ start: Date; end: Date }>>();
  for (const assignment of allAssignments) {
    const shift = shiftMap.get(assignment.shiftId);
    if (!shift) continue;
    const workerId = assignment.driverId || assignment.employeeId || "unknown";
    if (!workerShifts.has(workerId)) workerShifts.set(workerId, []);
    workerShifts.get(workerId)!.push({
      start: new Date(shift.startTime),
      end: new Date(shift.endTime),
    });

    const hours =
      (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) /
      (1000 * 60 * 60);
    if (hours > LONG_SHIFT_HOURS) longShiftCount++;
  }

  let consecutiveDayViolations = 0;
  for (const [, shifts] of workerShifts) {
    shifts.sort((a, b) => a.start.getTime() - b.start.getTime());

    for (let i = 1; i < shifts.length; i++) {
      const restHours =
        (shifts[i].start.getTime() - shifts[i - 1].end.getTime()) / (1000 * 60 * 60);
      totalRestHours += Math.max(0, restHours);
      restCount++;
      if (restHours < MIN_REST_HOURS) restViolations++;
    }

    const daySet = new Set(shifts.map((s) => s.start.toISOString().split("T")[0]));
    const sortedDays = Array.from(daySet).sort();
    let maxConsecutive = 1;
    let current = 1;
    for (let i = 1; i < sortedDays.length; i++) {
      const prev = new Date(sortedDays[i - 1]);
      const curr = new Date(sortedDays[i]);
      const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (Math.abs(diff - 1) < 0.01) {
        current++;
        if (current > maxConsecutive) maxConsecutive = current;
      } else {
        current = 1;
      }
    }
    if (maxConsecutive > 6) consecutiveDayViolations++;
  }

  const avgRest = restCount > 0 ? Math.round((totalRestHours / restCount) * 10) / 10 : 0;

  const totalIssues = longShiftCount + restViolations + consecutiveDayViolations;
  const totalPossible = Math.max(1, allAssignments.length);
  const fatigueRiskScore = Math.min(100, Math.round((totalIssues / totalPossible) * 100));

  const details = [
    {
      indicator: "Long Shifts (>10h)",
      count: longShiftCount,
      severity: longShiftCount > 0 ? "warning" : "ok",
      description: `${longShiftCount} shift(s) exceeded 10 hours in the period`,
    },
    {
      indicator: "Insufficient Rest (<8h between shifts)",
      count: restViolations,
      severity: restViolations > 0 ? "warning" : "ok",
      description: `${restViolations} instance(s) of less than 8 hours rest between shifts`,
    },
    {
      indicator: "Consecutive Day Violations (>6 days)",
      count: consecutiveDayViolations,
      severity: consecutiveDayViolations > 0 ? "critical" : "ok",
      description: `${consecutiveDayViolations} worker(s) scheduled for more than 6 consecutive days`,
    },
  ];

  return {
    reportType: "fatigue_indicators",
    period,
    totalAssignments: allAssignments.length,
    consecutiveDayViolations,
    restPeriodViolations: restViolations,
    longShiftCount,
    avgRestBetweenShiftsHours: avgRest,
    fatigueRiskScore,
    details,
  };
}

export async function generateNoShowReport(
  entityId: string | null,
  periodType: string,
  periodStart: string
): Promise<NoShowMitigationReport> {
  const period = getDateRange(periodType, periodStart);

  const scheduleConditions = [];
  if (entityId) scheduleConditions.push(eq(schedulingSchedules.entityId, entityId));
  scheduleConditions.push(gte(schedulingSchedules.startDate, period.startDate));
  scheduleConditions.push(lte(schedulingSchedules.endDate, period.endDate));

  const schedules = await db
    .select({ id: schedulingSchedules.id })
    .from(schedulingSchedules)
    .where(and(...scheduleConditions));

  const scheduleIds = schedules.map((s) => s.id);
  if (scheduleIds.length === 0) {
    return {
      reportType: "no_show_mitigation",
      period,
      totalAssignments: 0,
      noShowCount: 0,
      noShowRate: 0,
      confirmedAssignments: 0,
      confirmationRate: 0,
      declinedAssignments: 0,
      cancelledAssignments: 0,
      details: [],
    };
  }

  const allShifts = await db
    .select()
    .from(schedulingShifts)
    .where(
      sql`${schedulingShifts.scheduleId} IN (${sql.join(
        scheduleIds.map((id) => sql`${id}`),
        sql`, `
      )})`
    );

  const shiftIds = allShifts.map((s) => s.id);
  let allAssignments: any[] = [];
  if (shiftIds.length > 0) {
    allAssignments = await db
      .select()
      .from(schedulingAssignments)
      .where(
        sql`${schedulingAssignments.shiftId} IN (${sql.join(
          shiftIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      );
  }

  const shiftMap = new Map(allShifts.map((s) => [s.id, s]));
  const noShows = allAssignments.filter((a) => a.status === "no_show");
  const confirmed = allAssignments.filter((a) => a.status === "confirmed" || a.status === "completed" || a.status === "in_progress");
  const declined = allAssignments.filter((a) => a.status === "declined");
  const cancelled = allAssignments.filter((a) => a.status === "cancelled");

  const dateMap = new Map<string, { total: number; noShows: number; confirmed: number }>();
  for (const assignment of allAssignments) {
    const shift = shiftMap.get(assignment.shiftId);
    if (!shift) continue;
    const dateKey = new Date(shift.startTime).toISOString().split("T")[0];
    const existing = dateMap.get(dateKey) || { total: 0, noShows: 0, confirmed: 0 };
    existing.total++;
    if (assignment.status === "no_show") existing.noShows++;
    if (["confirmed", "completed", "in_progress"].includes(assignment.status))
      existing.confirmed++;
    dateMap.set(dateKey, existing);
  }

  const details = Array.from(dateMap.entries())
    .map(([date, data]) => ({
      date,
      totalAssigned: data.total,
      noShows: data.noShows,
      confirmed: data.confirmed,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    reportType: "no_show_mitigation",
    period,
    totalAssignments: allAssignments.length,
    noShowCount: noShows.length,
    noShowRate:
      allAssignments.length > 0
        ? Math.round((noShows.length / allAssignments.length) * 1000) / 10
        : 0,
    confirmedAssignments: confirmed.length,
    confirmationRate:
      allAssignments.length > 0
        ? Math.round((confirmed.length / allAssignments.length) * 1000) / 10
        : 0,
    declinedAssignments: declined.length,
    cancelledAssignments: cancelled.length,
    details,
  };
}

export async function generateFullInsuranceReport(
  entityId: string | null,
  periodType: string,
  periodStart: string
) {
  const [otRisk, breakCompliance, fatigue, noShow] = await Promise.all([
    generateOTRiskReport(entityId, periodType, periodStart),
    generateBreakComplianceReport(entityId, periodType, periodStart),
    generateFatigueReport(entityId, periodType, periodStart),
    generateNoShowReport(entityId, periodType, periodStart),
  ]);

  const period = otRisk.period;

  let entityName = "All Entities";
  if (entityId) {
    const [entity] = await db
      .select({ legalName: schedulingEntities.legalName })
      .from(schedulingEntities)
      .where(eq(schedulingEntities.id, entityId));
    if (entity) entityName = entity.legalName;
  }

  return {
    generatedAt: new Date().toISOString(),
    entityId,
    entityName,
    periodType,
    periodStart: period.startDate,
    periodEnd: period.endDate,
    reports: {
      otRiskPrevention: otRisk,
      breakCompliance,
      fatigueIndicators: fatigue,
      noShowMitigation: noShow,
    },
    summary: {
      otPreventionRate: otRisk.otPreventionRate,
      breakComplianceRate: breakCompliance.complianceRate,
      fatigueRiskScore: fatigue.fatigueRiskScore,
      noShowRate: noShow.noShowRate,
      confirmationRate: noShow.confirmationRate,
      overallRiskLevel:
        fatigue.fatigueRiskScore > 50 || noShow.noShowRate > 10
          ? "elevated"
          : fatigue.fatigueRiskScore > 25 || noShow.noShowRate > 5
          ? "moderate"
          : "low",
    },
    dataSources: [
      "Scheduling shifts and assignments",
      "Time clock events (break tracking)",
      "Union/CBA rule violations",
      "Assignment status tracking (no-show, confirmed, declined)",
    ],
    methodology: {
      otThreshold: "8 hours per shift (standard daily OT threshold)",
      breakCompliance: "Calculated from time clock break_start/break_end events",
      fatigueIndicators:
        "Long shifts (>10h), rest periods (<8h between shifts), consecutive days (>6)",
      noShowRate: "Percentage of assignments with no_show status",
    },
  };
}

export function generateCSVExport(report: any): string {
  const lines: string[] = [];

  lines.push("SCHEDULING INSURANCE & UNDERWRITER REPORT");
  lines.push(`Entity,${report.entityName}`);
  lines.push(`Period,${report.periodStart} to ${report.periodEnd}`);
  lines.push(`Period Type,${report.periodType}`);
  lines.push(`Generated,${report.generatedAt}`);
  lines.push("");

  lines.push("EXECUTIVE SUMMARY");
  lines.push(`OT Prevention Rate,${report.summary.otPreventionRate}%`);
  lines.push(`Break Compliance Rate,${report.summary.breakComplianceRate}%`);
  lines.push(`Fatigue Risk Score,${report.summary.fatigueRiskScore}/100`);
  lines.push(`No-Show Rate,${report.summary.noShowRate}%`);
  lines.push(`Confirmation Rate,${report.summary.confirmationRate}%`);
  lines.push(`Overall Risk Level,${report.summary.overallRiskLevel.toUpperCase()}`);
  lines.push("");

  const ot = report.reports.otRiskPrevention;
  lines.push("OT RISK PREVENTION");
  lines.push(`Total Shifts,${ot.totalShifts}`);
  lines.push(`Total Assignments,${ot.totalAssignments}`);
  lines.push(`Shifts Exceeding OT Threshold,${ot.shiftsExceedingOTThreshold}`);
  lines.push(`Avg Shift Duration (hours),${ot.avgShiftDurationHours}`);
  lines.push(`Max Shift Duration (hours),${ot.maxShiftDurationHours}`);
  lines.push(`Union Rule Violations,${ot.unionRuleViolations}`);
  lines.push(`Union Violations Acknowledged,${ot.unionRuleViolationsAcknowledged}`);
  lines.push("");

  if (ot.details.length > 0) {
    lines.push("OT Risk Daily Detail");
    lines.push("Date,Shift Count,Avg Hours,OT Exceedances");
    for (const d of ot.details) {
      lines.push(`${d.date},${d.shiftCount},${d.avgHours},${d.otExceedances}`);
    }
    lines.push("");
  }

  const bc = report.reports.breakCompliance;
  lines.push("BREAK COMPLIANCE");
  lines.push(`Shifts With Breaks,${bc.shiftsWithBreaks}`);
  lines.push(`Shifts Without Breaks,${bc.shiftsWithoutBreaks}`);
  lines.push(`Avg Break Duration (minutes),${bc.avgBreakDurationMinutes}`);
  lines.push(`Compliance Rate,${bc.complianceRate}%`);
  lines.push("");

  const fi = report.reports.fatigueIndicators;
  lines.push("FATIGUE INDICATORS");
  lines.push(`Total Assignments,${fi.totalAssignments}`);
  lines.push(`Long Shift Count (>10h),${fi.longShiftCount}`);
  lines.push(`Rest Period Violations (<8h),${fi.restPeriodViolations}`);
  lines.push(`Consecutive Day Violations (>6),${fi.consecutiveDayViolations}`);
  lines.push(`Avg Rest Between Shifts (hours),${fi.avgRestBetweenShiftsHours}`);
  lines.push(`Fatigue Risk Score,${fi.fatigueRiskScore}/100`);
  lines.push("");

  if (fi.details.length > 0) {
    lines.push("Fatigue Indicator Detail");
    lines.push("Indicator,Count,Severity,Description");
    for (const d of fi.details) {
      lines.push(`"${d.indicator}",${d.count},${d.severity},"${d.description}"`);
    }
    lines.push("");
  }

  const ns = report.reports.noShowMitigation;
  lines.push("NO-SHOW MITIGATION");
  lines.push(`Total Assignments,${ns.totalAssignments}`);
  lines.push(`No-Show Count,${ns.noShowCount}`);
  lines.push(`No-Show Rate,${ns.noShowRate}%`);
  lines.push(`Confirmed Assignments,${ns.confirmedAssignments}`);
  lines.push(`Confirmation Rate,${ns.confirmationRate}%`);
  lines.push(`Declined,${ns.declinedAssignments}`);
  lines.push(`Cancelled,${ns.cancelledAssignments}`);
  lines.push("");

  lines.push("DATA SOURCES");
  for (const src of report.dataSources) {
    lines.push(`,"${src}"`);
  }
  lines.push("");

  lines.push("METHODOLOGY");
  lines.push(`OT Threshold,"${report.methodology.otThreshold}"`);
  lines.push(`Break Compliance,"${report.methodology.breakCompliance}"`);
  lines.push(`Fatigue Indicators,"${report.methodology.fatigueIndicators}"`);
  lines.push(`No-Show Rate,"${report.methodology.noShowRate}"`);

  return lines.join("\n");
}
