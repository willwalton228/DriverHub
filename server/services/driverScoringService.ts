/**
 * Driver Performance Scoring Service
 *
 * Computes a composite 0–100 performance score for each active driver.
 * Inputs:
 *   - Attendance  (35%): WIW absence rate over last 90 days
 *   - Adherence   (40%): Worked vs scheduled hours ratio over last 30 days
 *   - OT Freq     (25%): Weeks in overtime (worked > 40h) over last 90 days
 *   - Claims       (0%): Reserved for future integration
 *
 * Tiers:  Excellent 80–100 | Good 60–79 | Fair 40–59 | At-Risk 20–39 | Critical 0–19
 */

import { db } from "../db";
import { sql, eq, and, gte, isNull, isNotNull } from "drizzle-orm";
import {
  drivers,
  wiwUsers,
  wiwTimes,
  wiwShifts,
  wiwAbsences,
  driverPerformanceScores,
} from "../../shared/schema";

// ── Weights ──────────────────────────────────────────────────────────────────
const W_ATTENDANCE = 0.35;
const W_ADHERENCE  = 0.40;
const W_OT         = 0.25;
const W_CLAIMS     = 0.00; // reserved

// ── Tier thresholds ───────────────────────────────────────────────────────────
export function scoreTier(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  if (score >= 20) return "At-Risk";
  return "Critical";
}

// ── Component calculators ─────────────────────────────────────────────────────

/** Attendance: penalise absences over last 90 days. 0 abs → 100, each adds penalty. */
function attendanceScore(absences90d: number): number {
  if (absences90d === 0)  return 100;
  if (absences90d === 1)  return 82;
  if (absences90d === 2)  return 65;
  if (absences90d === 3)  return 50;
  return Math.max(0, 50 - (absences90d - 3) * 12);
}

/** Adherence: worked / scheduled ratio over last 30 days. Optimal = 85–110%. */
function adherenceScore(workedMin: number, scheduledMin: number): number {
  if (scheduledMin === 0 && workedMin === 0) return 50; // no data — neutral
  if (scheduledMin === 0) return 65;                    // worked without schedule
  const ratio = workedMin / scheduledMin;
  if (ratio >= 0.85 && ratio <= 1.10) return 100;
  if (ratio >= 0.75 && ratio <= 1.20) return 85;
  if (ratio >= 0.65 && ratio <= 1.30) return 70;
  if (ratio >= 0.55 && ratio <= 1.40) return 55;
  return 40;
}

/** OT Frequency: weeks over 40h / total weeks tracked (last 90d). */
function otScore(otWeeks: number, totalWeeks: number): number {
  if (totalWeeks === 0) return 50; // no data — neutral
  const rate = otWeeks / totalWeeks;
  if (rate === 0)      return 100;
  if (rate <= 0.15)    return 88;
  if (rate <= 0.30)    return 75;
  if (rate <= 0.50)    return 60;
  if (rate <= 0.70)    return 45;
  return 30;
}

/** Claims: placeholder — returns neutral 50 until claims data is integrated. */
function claimsScore(): number {
  return 50;
}

/** Composite: weighted sum of all components. */
function compositeScore(att: number, adh: number, ot: number, claims: number): number {
  return Math.round(W_ATTENDANCE * att + W_ADHERENCE * adh + W_OT * ot + W_CLAIMS * claims);
}

// ── Per-driver computation ────────────────────────────────────────────────────

interface DriverScoreResult {
  driverId:          string;
  score:             number;
  tier:              string;
  attendanceScore:   number;
  adherenceScore:    number;
  otScore:           number;
  claimsScore:       number;
  absences90d:       number;
  workedHours30d:    number;
  scheduledHours30d: number;
  otWeeksCount:      number;
  totalWeeksCount:   number;
  wiwLinked:         boolean;
}

async function computeForDriver(driverId: string): Promise<DriverScoreResult> {
  const NEUTRAL: DriverScoreResult = {
    driverId, score: 50, tier: "Fair",
    attendanceScore: 50, adherenceScore: 50, otScore: 50, claimsScore: 50,
    absences90d: 0, workedHours30d: 0, scheduledHours30d: 0,
    otWeeksCount: 0, totalWeeksCount: 0, wiwLinked: false,
  };

  // WIW link?
  const wiwRow = await db.select({ id: wiwUsers.id })
    .from(wiwUsers).where(eq(wiwUsers.driverId, driverId)).limit(1);

  if (!wiwRow.length) return NEUTRAL;

  const wiwUserId = wiwRow[0].id;
  const now = new Date();
  const thirtyDaysAgo  = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo  = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // ── 1. Absences last 90d ─────────────────────────────────────────────────
  const absResult = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt
    FROM wiw_absences
    WHERE wiw_user_id = ${wiwUserId}
      AND date >= ${ninetyDaysAgo.toISOString().split("T")[0]}::date
  `);
  const absences90d: number = (absResult.rows[0] as any)?.cnt ?? 0;

  // ── 2. Worked vs scheduled (last 30d, separate queries to avoid cross-join) ─
  const workedResult = await db.execute(sql`
    SELECT COALESCE(SUM(total_minutes), 0)::numeric AS total
    FROM wiw_times
    WHERE wiw_user_id = ${wiwUserId}
      AND clock_in >= ${thirtyDaysAgo.toISOString()}::timestamptz
  `);
  const workedMin: number = parseFloat((workedResult.rows[0] as any)?.total ?? "0");

  const schedResult = await db.execute(sql`
    SELECT COALESCE(SUM(scheduled_minutes), 0)::numeric AS total
    FROM wiw_shifts
    WHERE wiw_user_id = ${wiwUserId}
      AND start_time >= ${thirtyDaysAgo.toISOString()}::timestamptz
      AND status NOT IN ('deleted')
  `);
  const scheduledMin: number = parseFloat((schedResult.rows[0] as any)?.total ?? "0");

  // ── 3. OT weeks (last 90d) ────────────────────────────────────────────────
  const otResult = await db.execute(sql`
    SELECT
      date_trunc('week', clock_in AT TIME ZONE 'America/Chicago') AS week_start,
      SUM(total_minutes) AS week_minutes
    FROM wiw_times
    WHERE wiw_user_id = ${wiwUserId}
      AND clock_in >= ${ninetyDaysAgo.toISOString()}::timestamptz
    GROUP BY date_trunc('week', clock_in AT TIME ZONE 'America/Chicago')
  `);
  const weeks: Array<{ week_minutes: string }> = (otResult.rows as any[]);
  const totalWeeksCount = weeks.length;
  const otWeeksCount    = weeks.filter(w => parseFloat(w.week_minutes ?? "0") > 40 * 60).length;

  // ── Compute component scores ─────────────────────────────────────────────
  const att    = attendanceScore(absences90d);
  const adh    = adherenceScore(workedMin, scheduledMin);
  const ot     = otScore(otWeeksCount, totalWeeksCount);
  const claims = claimsScore();
  const score  = compositeScore(att, adh, ot, claims);
  const tier   = scoreTier(score);

  return {
    driverId,
    score,
    tier,
    attendanceScore:   att,
    adherenceScore:    adh,
    otScore:           ot,
    claimsScore:       claims,
    absences90d,
    workedHours30d:    Math.round(workedMin / 60 * 100) / 100,
    scheduledHours30d: Math.round(scheduledMin / 60 * 100) / 100,
    otWeeksCount,
    totalWeeksCount,
    wiwLinked: true,
  };
}

// ── Upsert helper ─────────────────────────────────────────────────────────────
async function upsertScore(result: DriverScoreResult, weekStart: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO driver_performance_scores (
      driver_id, score, tier,
      attendance_score, adherence_score, ot_score, claims_score,
      attendance_weight, adherence_weight, ot_weight, claims_weight,
      absences_90d, worked_hours_30d, scheduled_hours_30d,
      ot_weeks_count, total_weeks_count, wiw_linked,
      computed_at, computed_for_week_start
    ) VALUES (
      ${result.driverId}, ${result.score}, ${result.tier},
      ${result.attendanceScore}, ${result.adherenceScore}, ${result.otScore}, ${result.claimsScore},
      ${W_ATTENDANCE}, ${W_ADHERENCE}, ${W_OT}, ${W_CLAIMS},
      ${result.absences90d}, ${result.workedHours30d}, ${result.scheduledHours30d},
      ${result.otWeeksCount}, ${result.totalWeeksCount}, ${result.wiwLinked},
      NOW(), ${weekStart}::date
    )
    ON CONFLICT (driver_id) DO UPDATE SET
      score                    = EXCLUDED.score,
      tier                     = EXCLUDED.tier,
      attendance_score         = EXCLUDED.attendance_score,
      adherence_score          = EXCLUDED.adherence_score,
      ot_score                 = EXCLUDED.ot_score,
      claims_score             = EXCLUDED.claims_score,
      attendance_weight        = EXCLUDED.attendance_weight,
      adherence_weight         = EXCLUDED.adherence_weight,
      ot_weight                = EXCLUDED.ot_weight,
      claims_weight            = EXCLUDED.claims_weight,
      absences_90d             = EXCLUDED.absences_90d,
      worked_hours_30d         = EXCLUDED.worked_hours_30d,
      scheduled_hours_30d      = EXCLUDED.scheduled_hours_30d,
      ot_weeks_count           = EXCLUDED.ot_weeks_count,
      total_weeks_count        = EXCLUDED.total_weeks_count,
      wiw_linked               = EXCLUDED.wiw_linked,
      computed_at              = EXCLUDED.computed_at,
      computed_for_week_start  = EXCLUDED.computed_for_week_start
  `);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Compute + persist score for a single driver. */
export async function computeAndSaveScoreForDriver(driverId: string): Promise<DriverScoreResult> {
  const now = new Date();
  const chicagoDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const dow = chicagoDate.getDay();
  const daysToMonday = dow === 0 ? -6 : 1 - dow;
  const weekStart = new Date(chicagoDate);
  weekStart.setDate(chicagoDate.getDate() + daysToMonday);
  const weekStartStr = weekStart.toISOString().split("T")[0];

  const result = await computeForDriver(driverId);
  await upsertScore(result, weekStartStr);
  return result;
}

/** Compute + persist scores for ALL active drivers. Returns count. */
export async function computeAllDriverScores(): Promise<{ computed: number; errors: number }> {
  const now = new Date();
  const chicagoDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const dow = chicagoDate.getDay();
  const daysToMonday = dow === 0 ? -6 : 1 - dow;
  const weekStart = new Date(chicagoDate);
  weekStart.setDate(chicagoDate.getDate() + daysToMonday);
  const weekStartStr = weekStart.toISOString().split("T")[0];

  const activeDrivers = await db.select({ id: drivers.id })
    .from(drivers)
    .where(eq(drivers.status, "active"));

  let computed = 0;
  let errors   = 0;

  for (const driver of activeDrivers) {
    try {
      const result = await computeForDriver(driver.id);
      await upsertScore(result, weekStartStr);
      computed++;
    } catch (err) {
      console.error(`[DriverScoring] Error computing score for driver ${driver.id}:`, err);
      errors++;
    }
  }

  console.log(`[DriverScoring] Computed scores: ${computed} OK, ${errors} errors`);
  return { computed, errors };
}

/** Get current score from DB (no recompute). Returns null if not yet scored. */
export async function getDriverScore(driverId: string) {
  const rows = await db.select()
    .from(driverPerformanceScores)
    .where(eq(driverPerformanceScores.driverId, driverId))
    .limit(1);
  return rows[0] ?? null;
}
