import { db } from "../db";
import { eq, and, gte, lte, sql, inArray, count } from "drizzle-orm";
import {
  absenceRisks,
  timeOffRequests,
  companyHolidays,
  leaveBalances,
  employees,
  users,
} from "@shared/schema";

export interface FlaggedPattern {
  rule: string;
  triggered: boolean;
  score: number;
  evidence: string;
  window: string;
}

export interface AbsenceRiskResult {
  employeeId: string;
  riskScore: number;
  flaggedPatterns: FlaggedPattern[];
  lastUpdated: Date;
}

export interface MarketIndicator {
  market: string;
  activeEmployees: number;
  sickRequestCount: number;
  absenceRate: number;
  threshold: number;
  exceeds: boolean;
}

const MARKET_ABSENCE_THRESHOLD = 0.15;
const LAST_MINUTE_DAYS = 2;

function dayOfWeek(dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.getUTCDay();
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

function dateDiffDays(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z");
  const db = new Date(b + "T00:00:00Z");
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export async function calculateEmployeeRisk(employeeId: string): Promise<AbsenceRiskResult> {
  const now = new Date();
  const today = formatDate(now);
  const sixtyDaysAgo = formatDate(new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000));
  const thirtyDaysAgo = formatDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
  const currentYear = now.getFullYear();

  const emp = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
  if (!emp.length) {
    return { employeeId, riskScore: 0, flaggedPatterns: [], lastUpdated: now };
  }
  const employee = emp[0];
  const userId = employee.userId;

  if (!userId) {
    return { employeeId, riskScore: 0, flaggedPatterns: [], lastUpdated: now };
  }

  const sickRequests = await db
    .select()
    .from(timeOffRequests)
    .where(
      and(
        eq(timeOffRequests.userId, userId),
        eq(timeOffRequests.requestType, "sick"),
        inArray(timeOffRequests.status, ["approved", "pending"]),
        gte(timeOffRequests.startDate, sixtyDaysAgo)
      )
    );

  const allRecentRequests = await db
    .select()
    .from(timeOffRequests)
    .where(
      and(
        eq(timeOffRequests.userId, userId),
        inArray(timeOffRequests.status, ["approved", "pending"]),
        gte(timeOffRequests.startDate, thirtyDaysAgo)
      )
    );

  const holidays = await db
    .select()
    .from(companyHolidays)
    .where(
      and(
        eq(companyHolidays.isActive, true),
        gte(companyHolidays.date, sixtyDaysAgo),
        lte(companyHolidays.date, today)
      )
    );

  const sickBalance = await db
    .select()
    .from(leaveBalances)
    .where(
      and(
        eq(leaveBalances.employeeId, userId),
        eq(leaveBalances.leaveType, "sick"),
        eq(leaveBalances.year, currentYear)
      )
    )
    .limit(1);

  const flags: FlaggedPattern[] = [];

  // Rule 1: ≥3 Monday or Friday sick days in 60 days
  let monFriCount = 0;
  const monFriDates: string[] = [];
  for (const req of sickRequests) {
    let d = req.startDate;
    const end = req.endDate;
    while (d <= end) {
      const dow = dayOfWeek(d);
      if (dow === 1 || dow === 5) {
        monFriCount++;
        monFriDates.push(d);
      }
      d = addDays(d, 1);
    }
  }
  flags.push({
    rule: "monday_friday_sick",
    triggered: monFriCount >= 3,
    score: monFriCount >= 3 ? 20 : 0,
    evidence: monFriCount >= 3
      ? `${monFriCount} Monday/Friday sick days: ${monFriDates.slice(0, 5).join(", ")}${monFriDates.length > 5 ? "..." : ""}`
      : `${monFriCount} Monday/Friday sick day(s) in window`,
    window: `${sixtyDaysAgo} to ${today}`,
  });

  // Rule 2: Sick day adjacent to holiday
  const holidayDates = new Set<string>();
  for (const h of holidays) {
    holidayDates.add(h.date);
    if (h.observedDate) holidayDates.add(h.observedDate);
  }
  let adjacentFound = false;
  const adjacentDetails: string[] = [];
  for (const req of sickRequests) {
    let d = req.startDate;
    const end = req.endDate;
    while (d <= end) {
      const before = addDays(d, -1);
      const after = addDays(d, 1);
      if (holidayDates.has(before) || holidayDates.has(after) || holidayDates.has(d)) {
        adjacentFound = true;
        adjacentDetails.push(d);
      }
      d = addDays(d, 1);
    }
  }
  flags.push({
    rule: "holiday_adjacent_sick",
    triggered: adjacentFound,
    score: adjacentFound ? 20 : 0,
    evidence: adjacentFound
      ? `Sick day(s) adjacent to holiday: ${adjacentDetails.slice(0, 3).join(", ")}`
      : "No holiday-adjacent sick days",
    window: `${sixtyDaysAgo} to ${today}`,
  });

  // Rule 3: ≥2 last-minute requests in 30 days
  let lastMinuteCount = 0;
  const lastMinuteDates: string[] = [];
  for (const req of allRecentRequests) {
    if (req.createdAt) {
      const createdDate = formatDate(req.createdAt);
      const diff = dateDiffDays(createdDate, req.startDate);
      if (diff <= LAST_MINUTE_DAYS) {
        lastMinuteCount++;
        lastMinuteDates.push(req.startDate);
      }
    }
  }
  flags.push({
    rule: "last_minute_requests",
    triggered: lastMinuteCount >= 2,
    score: lastMinuteCount >= 2 ? 20 : 0,
    evidence: lastMinuteCount >= 2
      ? `${lastMinuteCount} last-minute requests (≤${LAST_MINUTE_DAYS} days notice): ${lastMinuteDates.slice(0, 3).join(", ")}`
      : `${lastMinuteCount} last-minute request(s) in window`,
    window: `${thirtyDaysAgo} to ${today}`,
  });

  // Rule 4: Sick usage exceeds accrual
  let usageExceeds = false;
  let usageEvidence = "No sick leave balance found";
  if (sickBalance.length > 0) {
    const bal = sickBalance[0];
    const used = parseFloat(bal.usedHours || "0");
    const accrued = parseFloat(bal.accruedHours || "0");
    const remaining = parseFloat(bal.remainingHours || "0");
    usageExceeds = remaining < 0 || used > accrued;
    usageEvidence = usageExceeds
      ? `Used ${used}h of ${accrued}h accrued (${remaining}h remaining)`
      : `Used ${used}h of ${accrued}h accrued (${remaining}h remaining)`;
  }
  flags.push({
    rule: "sick_exceeds_accrual",
    triggered: usageExceeds,
    score: usageExceeds ? 20 : 0,
    evidence: usageEvidence,
    window: `Year ${currentYear}`,
  });

  // Rule 5: Market absence rate (using department as market grouping)
  const market = employee.department;
  let marketExceeds = false;
  let marketEvidence = "No department assigned";
  if (market) {
    const indicator = await calculateMarketIndicator(market);
    marketExceeds = indicator.exceeds;
    marketEvidence = marketExceeds
      ? `Department "${market}" absence rate ${(indicator.absenceRate * 100).toFixed(1)}% exceeds ${(indicator.threshold * 100).toFixed(1)}% threshold`
      : `Department "${market}" absence rate ${(indicator.absenceRate * 100).toFixed(1)}% within threshold`;
  }
  flags.push({
    rule: "market_absence_rate",
    triggered: marketExceeds,
    score: marketExceeds ? 20 : 0,
    evidence: marketEvidence,
    window: `${sixtyDaysAgo} to ${today}`,
  });

  const riskScore = Math.min(100, flags.reduce((sum, f) => sum + f.score, 0));

  return { employeeId, riskScore, flaggedPatterns: flags, lastUpdated: now };
}

export async function calculateMarketIndicator(market: string): Promise<MarketIndicator> {
  const now = new Date();
  const sixtyDaysAgo = formatDate(new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000));

  const activeEmps = await db
    .select({ id: employees.id, userId: employees.userId })
    .from(employees)
    .where(
      and(
        eq(employees.department, market),
        sql`lower(${employees.status}) = 'active'`
      )
    );

  const activeCount = activeEmps.length;
  if (activeCount === 0) {
    return { market, activeEmployees: 0, sickRequestCount: 0, absenceRate: 0, threshold: MARKET_ABSENCE_THRESHOLD, exceeds: false };
  }

  const userIds = activeEmps.map((e) => e.userId).filter(Boolean) as string[];
  if (userIds.length === 0) {
    return { market, activeEmployees: activeCount, sickRequestCount: 0, absenceRate: 0, threshold: MARKET_ABSENCE_THRESHOLD, exceeds: false };
  }

  const sickReqs = await db
    .select({ cnt: count() })
    .from(timeOffRequests)
    .where(
      and(
        inArray(timeOffRequests.userId, userIds),
        eq(timeOffRequests.requestType, "sick"),
        inArray(timeOffRequests.status, ["approved", "pending"]),
        gte(timeOffRequests.startDate, sixtyDaysAgo)
      )
    );

  const sickCount = Number(sickReqs[0]?.cnt || 0);
  const rate = sickCount / activeCount;

  return {
    market,
    activeEmployees: activeCount,
    sickRequestCount: sickCount,
    absenceRate: rate,
    threshold: MARKET_ABSENCE_THRESHOLD,
    exceeds: rate > MARKET_ABSENCE_THRESHOLD,
  };
}

export async function upsertAbsenceRisk(result: AbsenceRiskResult): Promise<void> {
  const existing = await db
    .select()
    .from(absenceRisks)
    .where(eq(absenceRisks.employeeId, result.employeeId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(absenceRisks)
      .set({
        riskScore: result.riskScore,
        flaggedPatterns: result.flaggedPatterns,
        lastUpdated: result.lastUpdated,
      })
      .where(eq(absenceRisks.employeeId, result.employeeId));
  } else {
    await db.insert(absenceRisks).values({
      employeeId: result.employeeId,
      riskScore: result.riskScore,
      flaggedPatterns: result.flaggedPatterns,
      lastUpdated: result.lastUpdated,
    });
  }
}

export async function recalculateAllEmployees(): Promise<number> {
  const allEmps = await db
    .select({ id: employees.id })
    .from(employees)
    .where(sql`lower(${employees.status}) = 'active'`);

  let processed = 0;
  for (const emp of allEmps) {
    const result = await calculateEmployeeRisk(emp.id);
    await upsertAbsenceRisk(result);
    processed++;
  }
  return processed;
}

export async function getAbsenceRisk(employeeId: string): Promise<AbsenceRiskResult | null> {
  const existing = await db
    .select()
    .from(absenceRisks)
    .where(eq(absenceRisks.employeeId, employeeId))
    .limit(1);

  if (existing.length > 0) {
    return {
      employeeId: existing[0].employeeId,
      riskScore: existing[0].riskScore,
      flaggedPatterns: existing[0].flaggedPatterns as FlaggedPattern[],
      lastUpdated: existing[0].lastUpdated,
    };
  }

  const result = await calculateEmployeeRisk(employeeId);
  await upsertAbsenceRisk(result);
  return result;
}
