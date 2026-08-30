/**
 * Projected Overtime Alert Service
 *
 * Runs hourly via cron. For every W-2 employee with a manager:
 *   1. Fetches worked hours (WIW API first → local timePunches fallback)
 *   2. Fetches remaining future scheduled hours (WIW API first → local schedulingAssignments fallback)
 *   3. Computes projected OT = max(0, worked + remaining - threshold)
 *   4. Upserts projected_overtime_alerts row
 *   5. Sends in-app notification to manager (dedupe: 6h window + 0.25h change guard)
 */

import { db } from "../db";
import {
  employees,
  users,
  notifications,
  otAlertLog,
  projectedOvertimeAlerts,
  timePunches,
  schedulingAssignments,
  schedulingShifts,
  laborRules,
  wiwEmployeeMap,
} from "@shared/schema";
import { eq, and, gte, lte, isNotNull, inArray, desc, sql } from "drizzle-orm";
import {
  isWiwApiConfigured,
  fetchWorkedHoursByUser,
  fetchRemainingScheduledHoursByUser,
} from "./wiwApiClient";

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_OT_THRESHOLD = 40.0;
const DEDUPE_HOURS = 6;
const CHANGE_THRESHOLD_HOURS = 0.25;

// ─── Week bounds (Monday–Sunday, America/Chicago) ─────────────────────────────
export function getWeekBounds(referenceDate?: Date): {
  weekStart: Date;
  weekEnd: Date;
  weekStartIso: string;
  weekEndIso: string;
} {
  const now = referenceDate ?? new Date();

  // Convert to America/Chicago local time to determine the week
  const chicagoStr = now.toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [month, day, year] = chicagoStr.split("/").map(Number);
  const localDate = new Date(year, month - 1, day);
  const dayOfWeek = localDate.getDay(); // 0=Sun, 1=Mon
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const weekStart = new Date(localDate);
  weekStart.setDate(localDate.getDate() + diffToMonday);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const toIso = (d: Date) => d.toISOString().split("T")[0];
  return {
    weekStart,
    weekEnd,
    weekStartIso: toIso(weekStart),
    weekEndIso: toIso(weekEnd),
  };
}

// ─── OT threshold from laborRules ────────────────────────────────────────────
async function getOTThreshold(): Promise<number> {
  try {
    const [rule] = await db
      .select({ weeklyOvertimeThreshold: laborRules.weeklyOvertimeThreshold })
      .from(laborRules)
      .where(eq(laborRules.isActive, true))
      .orderBy(laborRules.createdAt)
      .limit(1);
    if (rule?.weeklyOvertimeThreshold) {
      return parseFloat(String(rule.weeklyOvertimeThreshold));
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_OT_THRESHOLD;
}

// ─── Hours computation ────────────────────────────────────────────────────────
interface HoursBreakdown {
  workedHours: number;
  remainingScheduledHours: number;
  projectedTotal: number;
  dataSource: "wiw_api" | "local" | "mixed";
}

async function computeProjectedHours(
  employeeId: string,
  wiwUserId: string | null | undefined,
  weekStartIso: string,
  weekEndIso: string,
  weekEnd: Date,
  wiwWorkedMap: Map<string, number>,
  wiwRemainingMap: Map<string, number>
): Promise<HoursBreakdown> {
  const now = new Date();
  let workedHours = 0;
  let remainingScheduledHours = 0;
  let workedSource: "wiw" | "local" = "local";
  let remainingSource: "wiw" | "local" = "local";

  // ── Worked hours ──────────────────────────────────────────────────────────
  if (wiwUserId && wiwWorkedMap.has(wiwUserId)) {
    workedHours = wiwWorkedMap.get(wiwUserId)!;
    workedSource = "wiw";
  } else {
    // Fallback: sum from local timePunches table (week-to-date)
    const punchRows = await db
      .select({ workedHours: timePunches.workedHours })
      .from(timePunches)
      .where(
        and(
          eq(timePunches.employeeId, employeeId),
          gte(timePunches.punchDate, weekStartIso),
          lte(timePunches.punchDate, weekEndIso)
        )
      );
    workedHours = punchRows.reduce(
      (sum, r) => sum + (r.workedHours ? parseFloat(String(r.workedHours)) : 0),
      0
    );
  }

  // ── Remaining scheduled hours ─────────────────────────────────────────────
  if (wiwUserId && wiwRemainingMap.has(wiwUserId)) {
    remainingScheduledHours = wiwRemainingMap.get(wiwUserId)!;
    remainingSource = "wiw";
  } else {
    // Fallback: sum from local schedulingAssignments + schedulingShifts
    try {
      const futureAssignments = await db
        .select({
          startTime: schedulingShifts.startTime,
          endTime: schedulingShifts.endTime,
        })
        .from(schedulingAssignments)
        .innerJoin(schedulingShifts, eq(schedulingAssignments.shiftId, schedulingShifts.id))
        .where(
          and(
            eq(schedulingAssignments.employeeId, employeeId),
            inArray(schedulingAssignments.status, ["assigned", "confirmed"]),
            gte(schedulingShifts.startTime, now),
            lte(schedulingShifts.endTime, weekEnd)
          )
        );

      for (const a of futureAssignments) {
        const durationMs =
          new Date(a.endTime).getTime() - new Date(a.startTime).getTime();
        const durationHours = durationMs / (1000 * 60 * 60);
        if (durationHours > 0) remainingScheduledHours += durationHours;
      }
    } catch {
      // If scheduling table has no data, remaining = 0
    }
  }

  const dataSource: "wiw_api" | "local" | "mixed" =
    workedSource === "wiw" && remainingSource === "wiw"
      ? "wiw_api"
      : workedSource === "local" && remainingSource === "local"
      ? "local"
      : "mixed";

  return {
    workedHours,
    remainingScheduledHours,
    projectedTotal: workedHours + remainingScheduledHours,
    dataSource,
  };
}

// ─── Main scan result types ───────────────────────────────────────────────────
export interface OTAlertDetail {
  employeeId: string;
  employeeName: string;
  projectedOtHours: number;
  workedHours: number;
  remainingScheduledHours: number;
  dataSource: string;
  action: "sent" | "skipped" | "upserted_only" | "error";
  reason?: string;
}

export interface OTScanResult {
  ranAt: string;
  weekStart: string;
  weekEnd: string;
  otThreshold: number;
  wiwApiUsed: boolean;
  employeesScanned: number;
  alertsSent: number;
  alertsSkipped: number;
  upsertedRecords: number;
  errors: string[];
  details: OTAlertDetail[];
}

// ─── Main scan function ───────────────────────────────────────────────────────
export async function runOTAlertScan(): Promise<OTScanResult> {
  const { weekStart, weekEnd, weekStartIso, weekEndIso } = getWeekBounds();
  const otThreshold = await getOTThreshold();
  const now = new Date();
  const wiwConfigured = isWiwApiConfigured();

  const result: OTScanResult = {
    ranAt: now.toISOString(),
    weekStart: weekStartIso,
    weekEnd: weekEndIso,
    otThreshold,
    wiwApiUsed: false,
    employeesScanned: 0,
    alertsSent: 0,
    alertsSkipped: 0,
    upsertedRecords: 0,
    errors: [],
    details: [],
  };

  // ── Prefetch WIW data for the whole week in one batch ────────────────────
  let wiwWorkedMap = new Map<string, number>();
  let wiwRemainingMap = new Map<string, number>();

  if (wiwConfigured) {
    try {
      [wiwWorkedMap, wiwRemainingMap] = await Promise.all([
        fetchWorkedHoursByUser(weekStartIso, weekEndIso),
        fetchRemainingScheduledHoursByUser(weekStartIso, weekEndIso, now),
      ]);
      result.wiwApiUsed = wiwWorkedMap.size > 0 || wiwRemainingMap.size > 0;
      console.log(
        `[OTAlerts] WIW API: worked=${wiwWorkedMap.size} employees, remaining=${wiwRemainingMap.size} employees`
      );
    } catch (err) {
      result.errors.push(`WIW API prefetch failed: ${err}`);
      console.warn("[OTAlerts] WIW API prefetch failed, using local data only:", err);
    }
  }

  // ── Load WIW→DriverHub employee ID mappings ───────────────────────────────
  let wiwMappings: Array<{ driverhubEmployeeId: string | null; wiwUserId: string | null }> = [];
  try {
    wiwMappings = await db
      .select({
        driverhubEmployeeId: wiwEmployeeMap.driverhubEmployeeId,
        wiwUserId: wiwEmployeeMap.wiwUserId,
      })
      .from(wiwEmployeeMap);
  } catch {
    // proceed without mappings — will fall back to local data
  }
  const empToWiwId = new Map<string, string>();
  for (const m of wiwMappings) {
    if (m.driverhubEmployeeId && m.wiwUserId) {
      empToWiwId.set(m.driverhubEmployeeId, m.wiwUserId);
    }
  }

  // ── Fetch all employees with a manager ───────────────────────────────────
  let w2Employees: Array<{
    id: string;
    firstName: string;
    lastName: string;
    directManagerId: string | null;
  }> = [];

  try {
    w2Employees = await db
      .select({
        id: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        directManagerId: employees.directManagerId,
      })
      .from(employees)
      .where(and(isNotNull(employees.directManagerId), isNotNull(employees.firstName)));
  } catch (err) {
    result.errors.push(`Failed to fetch employees: ${err}`);
    return result;
  }

  // ── Process each employee ─────────────────────────────────────────────────
  for (const emp of w2Employees) {
    result.employeesScanned++;
    const employeeName = `${emp.firstName} ${emp.lastName}`.trim();

    if (!emp.directManagerId) {
      result.alertsSkipped++;
      continue;
    }

    // Resolve manager's userId
    let managerUserId: string | null = null;
    try {
      const [mgr] = await db
        .select({ userId: employees.userId })
        .from(employees)
        .where(eq(employees.id, emp.directManagerId));
      managerUserId = mgr?.userId ?? null;
    } catch {
      // skip
    }

    // Compute hours
    const wiwUserId = empToWiwId.get(emp.id) ?? null;
    let hours: HoursBreakdown;
    try {
      hours = await computeProjectedHours(
        emp.id,
        wiwUserId,
        weekStartIso,
        weekEndIso,
        weekEnd,
        wiwWorkedMap,
        wiwRemainingMap
      );
    } catch (err) {
      result.errors.push(`computeProjectedHours failed for ${employeeName}: ${err}`);
      result.details.push({
        employeeId: emp.id,
        employeeName,
        projectedOtHours: 0,
        workedHours: 0,
        remainingScheduledHours: 0,
        dataSource: "local",
        action: "error",
        reason: String(err),
      });
      continue;
    }

    const projectedOT = Math.max(0, hours.projectedTotal - otThreshold);
    const projectedOTRounded = Math.round(projectedOT * 100) / 100;
    const status =
      projectedOTRounded <= 0
        ? "under_threshold"
        : projectedOTRounded < 2
        ? "warning"
        : "over_threshold";

    // ── Upsert projected_overtime_alerts ────────────────────────────────────
    try {
      const existingAlert = await db
        .select()
        .from(projectedOvertimeAlerts)
        .where(
          and(
            eq(projectedOvertimeAlerts.employeeId, emp.id),
            eq(projectedOvertimeAlerts.weekStart, weekStartIso)
          )
        )
        .limit(1);

      if (existingAlert.length === 0) {
        await db.insert(projectedOvertimeAlerts).values({
          employeeId: emp.id,
          employeeName,
          weekStart: weekStartIso,
          otThreshold: String(otThreshold),
          workedHours: String(Math.round(hours.workedHours * 100) / 100),
          remainingScheduledHours: String(Math.round(hours.remainingScheduledHours * 100) / 100),
          projectedTotalHours: String(Math.round(hours.projectedTotal * 100) / 100),
          projectedOtHours: String(projectedOTRounded),
          dataSource: hours.dataSource,
          status,
          managerUserId: managerUserId ?? undefined,
          lastComputedAt: now,
        });
      } else {
        await db
          .update(projectedOvertimeAlerts)
          .set({
            employeeName,
            workedHours: String(Math.round(hours.workedHours * 100) / 100),
            remainingScheduledHours: String(Math.round(hours.remainingScheduledHours * 100) / 100),
            projectedTotalHours: String(Math.round(hours.projectedTotal * 100) / 100),
            projectedOtHours: String(projectedOTRounded),
            dataSource: hours.dataSource,
            status,
            managerUserId: managerUserId ?? undefined,
            lastComputedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(projectedOvertimeAlerts.employeeId, emp.id),
              eq(projectedOvertimeAlerts.weekStart, weekStartIso)
            )
          );
      }
      result.upsertedRecords++;
    } catch (err) {
      result.errors.push(`Upsert failed for ${employeeName}: ${err}`);
    }

    // ── Notification gate: only if OT > 0 and manager exists ────────────────
    if (projectedOTRounded <= 0 || !managerUserId) {
      result.alertsSkipped++;
      result.details.push({
        employeeId: emp.id,
        employeeName,
        projectedOtHours: projectedOTRounded,
        workedHours: hours.workedHours,
        remainingScheduledHours: hours.remainingScheduledHours,
        dataSource: hours.dataSource,
        action: "upserted_only",
        reason: projectedOTRounded <= 0 ? "Under OT threshold" : "No manager user account",
      });
      continue;
    }

    // ── Dedupe check ─────────────────────────────────────────────────────────
    try {
      const [existingLog] = await db
        .select()
        .from(otAlertLog)
        .where(
          and(
            eq(otAlertLog.employeeId, emp.id),
            eq(otAlertLog.weekStart, weekStartIso)
          )
        );

      if (existingLog) {
        const hoursSinceSent =
          (now.getTime() - new Date(existingLog.sentAt).getTime()) / (1000 * 60 * 60);
        const previousOT = parseFloat(String(existingLog.projectedOtHours));
        const otChange = Math.abs(projectedOTRounded - previousOT);

        // Status threshold change check
        const previousStatus =
          previousOT <= 0 ? "under_threshold" : previousOT < 2 ? "warning" : "over_threshold";
        const statusChanged = status !== previousStatus;

        const shouldSend =
          hoursSinceSent >= DEDUPE_HOURS || otChange >= CHANGE_THRESHOLD_HOURS || statusChanged;

        if (!shouldSend) {
          result.alertsSkipped++;
          result.details.push({
            employeeId: emp.id,
            employeeName,
            projectedOtHours: projectedOTRounded,
            workedHours: hours.workedHours,
            remainingScheduledHours: hours.remainingScheduledHours,
            dataSource: hours.dataSource,
            action: "skipped",
            reason: `Last sent ${hoursSinceSent.toFixed(1)}h ago, OT delta ${otChange.toFixed(2)}h, status unchanged`,
          });
          continue;
        }
      }

      // ── Send notification ─────────────────────────────────────────────────
      const displayOT = projectedOTRounded.toFixed(1);
      const actionUrl = `/scheduling?employeeId=${emp.id}&week=${weekStartIso}`;

      await db.insert(notifications).values({
        userId: managerUserId,
        type: "projected_overtime",
        title: `Projected Overtime for ${employeeName}`,
        message: `We project that ${employeeName} will work ${displayOT} overtime hours this week, based on already worked hours and remaining scheduled hours. Check the schedule to make any needed adjustments.`,
        isRead: false,
        relatedEntityType: "employee",
        relatedEntityId: emp.id,
        actionUrl,
      });

      // Update ot_alert_log (upsert)
      if (existingLog) {
        await db
          .update(otAlertLog)
          .set({
            projectedOtHours: String(projectedOTRounded),
            sentAt: now,
            managerUserId,
          })
          .where(
            and(
              eq(otAlertLog.employeeId, emp.id),
              eq(otAlertLog.weekStart, weekStartIso)
            )
          );
      } else {
        await db.insert(otAlertLog).values({
          employeeId: emp.id,
          managerUserId,
          weekStart: weekStartIso,
          projectedOtHours: String(projectedOTRounded),
          sentAt: now,
        });
      }

      // Update notification count on projected_overtime_alerts
      await db
        .update(projectedOvertimeAlerts)
        .set({
          lastNotifiedAt: now,
          lastNotifiedManagerAt: now,
          notificationCount: sql`${projectedOvertimeAlerts.notificationCount} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(projectedOvertimeAlerts.employeeId, emp.id),
            eq(projectedOvertimeAlerts.weekStart, weekStartIso)
          )
        );

      result.alertsSent++;
      result.details.push({
        employeeId: emp.id,
        employeeName,
        projectedOtHours: projectedOTRounded,
        workedHours: hours.workedHours,
        remainingScheduledHours: hours.remainingScheduledHours,
        dataSource: hours.dataSource,
        action: "sent",
      });
    } catch (err) {
      result.errors.push(`Notification send failed for ${employeeName}: ${err}`);
      result.details.push({
        employeeId: emp.id,
        employeeName,
        projectedOtHours: projectedOTRounded,
        workedHours: hours.workedHours,
        remainingScheduledHours: hours.remainingScheduledHours,
        dataSource: hours.dataSource,
        action: "error",
        reason: String(err),
      });
    }
  }

  console.log(
    `[OTAlerts] Scan complete: scanned=${result.employeesScanned}, upserted=${result.upsertedRecords}, sent=${result.alertsSent}, skipped=${result.alertsSkipped}, errors=${result.errors.length}`
  );

  return result;
}
