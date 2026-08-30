/**
 * Driver Attendance Metrics Service
 *
 * Computes and persists a rolling per-driver attendance metrics snapshot into
 * `driver_attendance_metrics`, sourced entirely from `driver_attendance_records`
 * (the derived system-of-record table — never from raw WIW tables directly).
 */

import { pool } from "../db";

const METRICS_WINDOW_DAYS = 90;
const CONSECUTIVE_ISSUE_STATUSES = new Set(["late", "early_out", "no_show", "missed"]);
const ISSUE_STATUSES = new Set(["late", "early_out", "no_show", "missed"]);

interface AttendanceRow {
  shift_date: string;
  scheduled_start: string;
  outcome_status: string;
}

export interface DriverAttendanceMetricsResult {
  driverId: string;
  windowDays: number;
  totalShifts: number;
  completedCount: number;
  lateCount: number;
  earlyOutCount: number;
  noShowCount: number;
  missedCount: number;
  callOffCount: number;
  attendancePct: number;
  onTimePct: number;
  consecutiveIssues: number;
  trend: "improving" | "stable" | "declining";
}

/**
 * Recompute and upsert the metrics snapshot for a single driver.
 */
export async function computeDriverAttendanceMetrics(
  driverId: string,
  windowDays: number = METRICS_WINDOW_DAYS
): Promise<DriverAttendanceMetricsResult> {
  const res = await pool.query(
    `SELECT shift_date, scheduled_start, outcome_status
     FROM driver_attendance_records
     WHERE driver_id = $1
       AND outcome_status != 'scheduled'
       AND scheduled_start >= now() - ($2 || ' days')::interval
     ORDER BY scheduled_start ASC`,
    [driverId, windowDays]
  );

  const rows: AttendanceRow[] = res.rows;
  const result = summarize(driverId, windowDays, rows);
  await upsertMetrics(result);
  return result;
}

function summarize(
  driverId: string,
  windowDays: number,
  rows: AttendanceRow[]
): DriverAttendanceMetricsResult {
  const totalShifts = rows.length;
  let completedCount = 0;
  let lateCount = 0;
  let earlyOutCount = 0;
  let noShowCount = 0;
  let missedCount = 0;
  let callOffCount = 0;

  for (const row of rows) {
    switch (row.outcome_status) {
      case "completed":
        completedCount++;
        break;
      case "late":
        lateCount++;
        break;
      case "early_out":
        earlyOutCount++;
        break;
      case "no_show":
        noShowCount++;
        break;
      case "missed":
        missedCount++;
        break;
      case "call_off":
        callOffCount++;
        break;
    }
  }

  // Attendance % excludes call-offs from the denominator (planned absence, not
  // a reliability failure) — counts completed/late/early-out as "attended".
  const attendanceEligible = totalShifts - callOffCount;
  const attendedCount = completedCount + lateCount + earlyOutCount;
  const attendancePct =
    attendanceEligible > 0
      ? Number(((attendedCount / attendanceEligible) * 100).toFixed(2))
      : 0;

  const onTimePct =
    totalShifts > 0 ? Number(((completedCount / totalShifts) * 100).toFixed(2)) : 0;

  // Consecutive issues: walk backwards (most recent first) counting a streak
  // of issue outcomes, stopping at the first completed/call_off.
  let consecutiveIssues = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const status = rows[i].outcome_status;
    if (CONSECUTIVE_ISSUE_STATUSES.has(status)) {
      consecutiveIssues++;
    } else {
      break;
    }
  }

  // Trend: compare issue rate in the first half of the window vs the second
  // half (chronologically), same approach as schedulingReliabilityService.
  let trend: "improving" | "stable" | "declining" = "stable";
  if (totalShifts >= 4) {
    const mid = Math.floor(rows.length / 2);
    const firstHalf = rows.slice(0, mid);
    const secondHalf = rows.slice(mid);
    const firstIssueRate =
      firstHalf.length > 0
        ? firstHalf.filter((r) => ISSUE_STATUSES.has(r.outcome_status)).length / firstHalf.length
        : 0;
    const secondIssueRate =
      secondHalf.length > 0
        ? secondHalf.filter((r) => ISSUE_STATUSES.has(r.outcome_status)).length / secondHalf.length
        : 0;

    if (secondIssueRate < firstIssueRate * 0.7) trend = "improving";
    else if (secondIssueRate > firstIssueRate * 1.3) trend = "declining";
  }

  return {
    driverId,
    windowDays,
    totalShifts,
    completedCount,
    lateCount,
    earlyOutCount,
    noShowCount,
    missedCount,
    callOffCount,
    attendancePct,
    onTimePct,
    consecutiveIssues,
    trend,
  };
}

async function upsertMetrics(m: DriverAttendanceMetricsResult): Promise<void> {
  await pool.query(
    `INSERT INTO driver_attendance_metrics (
       driver_id, window_days, total_shifts, completed_count, late_count,
       early_out_count, no_show_count, missed_count, call_off_count,
       attendance_pct, on_time_pct, consecutive_issues, trend,
       last_calculated_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9,
       $10, $11, $12, $13,
       now(), now()
     )
     ON CONFLICT (driver_id) DO UPDATE SET
       window_days         = EXCLUDED.window_days,
       total_shifts        = EXCLUDED.total_shifts,
       completed_count     = EXCLUDED.completed_count,
       late_count          = EXCLUDED.late_count,
       early_out_count     = EXCLUDED.early_out_count,
       no_show_count       = EXCLUDED.no_show_count,
       missed_count        = EXCLUDED.missed_count,
       call_off_count      = EXCLUDED.call_off_count,
       attendance_pct      = EXCLUDED.attendance_pct,
       on_time_pct         = EXCLUDED.on_time_pct,
       consecutive_issues  = EXCLUDED.consecutive_issues,
       trend               = EXCLUDED.trend,
       last_calculated_at  = now(),
       updated_at          = now()`,
    [
      m.driverId,
      m.windowDays,
      m.totalShifts,
      m.completedCount,
      m.lateCount,
      m.earlyOutCount,
      m.noShowCount,
      m.missedCount,
      m.callOffCount,
      m.attendancePct,
      m.onTimePct,
      m.consecutiveIssues,
      m.trend,
    ]
  );
}

/**
 * Recompute metrics for a specific set of drivers.
 */
export async function computeMetricsForDrivers(driverIds: string[]): Promise<void> {
  for (const driverId of driverIds) {
    try {
      await computeDriverAttendanceMetrics(driverId);
    } catch (err) {
      console.error(`[AttendanceMetrics] Failed to compute metrics for driver ${driverId}:`, err);
    }
  }
}

/**
 * Recompute metrics for every active driver (used by the nightly full
 * reconciliation job).
 */
export async function computeMetricsForAllActiveDrivers(): Promise<{ processed: number; errors: number }> {
  const res = await pool.query(
    `SELECT id FROM drivers WHERE status = 'active'`
  );
  let processed = 0;
  let errors = 0;
  for (const row of res.rows) {
    try {
      await computeDriverAttendanceMetrics(row.id);
      processed++;
    } catch (err) {
      console.error(`[AttendanceMetrics] Failed to compute metrics for driver ${row.id}:`, err);
      errors++;
    }
  }
  return { processed, errors };
}
