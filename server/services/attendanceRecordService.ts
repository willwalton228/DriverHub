/**
 * Driver Attendance Record Derivation Service
 *
 * Derives/upserts canonical `driver_attendance_records` rows from the raw WIW
 * tables (wiw_shifts, wiw_times, wiw_absences, wiw_attendance_notices). This
 * is the system-of-record derivation layer — DriverConnect and any other
 * consumer read only from `driver_attendance_records` / `driver_attendance_metrics`,
 * never from raw WIW tables or the WIW API directly.
 *
 * Outcome status classification priority (first match wins):
 *   1. call_off   — an approved absence covers the shift date
 *   2. no_show    — an attendance notice of type 'no_show' exists for the shift,
 *                    OR the shift has ended with no linked time record and no absence/notice
 *   3. missed     — an attendance notice of type 'missed_punch' exists, OR a time
 *                    record exists but is missing clock_in or clock_out (and not
 *                    still in progress) once the shift has ended
 *   4. late       — clock_in occurred more than LATE_THRESHOLD_MINUTES after scheduled start
 *   5. early_out  — clock_out occurred more than EARLY_OUT_THRESHOLD_MINUTES before scheduled end
 *   6. completed  — clocked in/out within thresholds
 *   7. scheduled  — shift end time is still in the future (not yet resolvable)
 */

import { pool } from "../db";
import { WIW_ACQUISITION_CUTOFF_DATE } from "./wiwSyncService";

const LATE_THRESHOLD_MINUTES = 5;
const EARLY_OUT_THRESHOLD_MINUTES = 5;

export type OutcomeStatus =
  | "scheduled"
  | "completed"
  | "late"
  | "early_out"
  | "no_show"
  | "missed"
  | "call_off";

interface ShiftRow {
  shift_id: string;
  external_shift_id: string;
  wiw_user_id: string | null;
  wiw_location_id: string | null;
  wiw_position_id: string | null;
  start_time: string;
  end_time: string;
  scheduled_minutes: number | null;
  status: string;
  driver_id: string | null;
}

/**
 * Derive and upsert attendance records for shifts matching the given filter.
 * Pass `driverIds` to scope to specific drivers (used by the incremental
 * sync/webhook hooks), or omit for a full reconciliation pass.
 */
export async function deriveAttendanceRecords(opts: {
  driverIds?: string[];
  wiwUserIds?: string[];
  sinceDate?: string; // only re-derive shifts with start_time >= this date (defaults to cutoff)
  shiftIds?: string[]; // narrow to specific wiw_shifts.id values (webhook-narrow mode)
} = {}): Promise<{ processed: number; errors: number }> {
  const sinceDate =
    opts.sinceDate && opts.sinceDate > WIW_ACQUISITION_CUTOFF_DATE
      ? opts.sinceDate
      : WIW_ACQUISITION_CUTOFF_DATE;

  const conditions: string[] = [
    `s.status != 'deleted'`,
    `u.driver_id IS NOT NULL`,
    `s.start_time >= $1::date`,
  ];
  const params: any[] = [sinceDate];
  let pi = 2;

  if (opts.driverIds && opts.driverIds.length > 0) {
    conditions.push(`u.driver_id = ANY($${pi++}::varchar[])`);
    params.push(opts.driverIds);
  }
  if (opts.wiwUserIds && opts.wiwUserIds.length > 0) {
    conditions.push(`s.wiw_user_id = ANY($${pi++}::varchar[])`);
    params.push(opts.wiwUserIds);
  }
  if (opts.shiftIds && opts.shiftIds.length > 0) {
    conditions.push(`s.id = ANY($${pi++}::varchar[])`);
    params.push(opts.shiftIds);
  }

  const shiftsRes = await pool.query(
    `SELECT
       s.id AS shift_id,
       s.external_shift_id,
       s.wiw_user_id,
       s.wiw_location_id,
       s.wiw_position_id,
       s.start_time,
       s.end_time,
       s.scheduled_minutes,
       s.status,
       u.driver_id
     FROM wiw_shifts s
     LEFT JOIN wiw_users u ON u.id = s.wiw_user_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY s.start_time ASC`,
    params
  );

  const shifts: ShiftRow[] = shiftsRes.rows;
  let processed = 0;
  let errors = 0;

  for (const shift of shifts) {
    try {
      await deriveSingleShift(shift);
      processed++;
    } catch (err) {
      console.error(`[AttendanceRecords] Failed to derive shift ${shift.shift_id}:`, err);
      errors++;
    }
  }

  return { processed, errors };
}

async function deriveSingleShift(shift: ShiftRow): Promise<void> {
  const driverId = shift.driver_id!;
  const now = new Date();
  const scheduledStart = new Date(shift.start_time);
  const scheduledEnd = new Date(shift.end_time);
  const shiftDate = scheduledStart.toISOString().slice(0, 10);

  // 1. Look for a linked time (clock in/out) record
  const timeRes = await pool.query(
    `SELECT id, clock_in, clock_out, total_minutes
     FROM wiw_times
     WHERE wiw_shift_id = $1
     ORDER BY clock_in ASC NULLS LAST
     LIMIT 1`,
    [shift.shift_id]
  );
  const timeRow = timeRes.rows[0] ?? null;

  // 2. Look for an approved absence covering the shift date for this WIW user
  let absenceRow: { id: string } | null = null;
  if (shift.wiw_user_id) {
    const absenceRes = await pool.query(
      `SELECT id
       FROM wiw_absences
       WHERE wiw_user_id = $1
         AND date = $2::date
         AND status IN ('approved', 'confirmed')
       LIMIT 1`,
      [shift.wiw_user_id, shiftDate]
    );
    absenceRow = absenceRes.rows[0] ?? null;
  }

  // 3. Look for an attendance notice tied to this shift's user around the shift window
  let noticeRow: { id: string; type: string; minutes_late: number | null } | null = null;
  if (shift.wiw_user_id) {
    const noticeRes = await pool.query(
      `SELECT id, type, minutes_late
       FROM wiw_attendance_notices
       WHERE wiw_user_id = $1
         AND occurred_at >= $2::timestamptz - interval '4 hours'
         AND occurred_at <= $3::timestamptz + interval '4 hours'
       ORDER BY occurred_at DESC
       LIMIT 1`,
      [shift.wiw_user_id, scheduledStart.toISOString(), scheduledEnd.toISOString()]
    );
    noticeRow = noticeRes.rows[0] ?? null;
  }

  const shiftHasEnded = scheduledEnd.getTime() < now.getTime();

  let outcomeStatus: OutcomeStatus;
  let lateMinutes = 0;
  let earlyOutMinutes = 0;
  let actualMinutes: number | null = timeRow?.total_minutes ?? null;
  const clockIn = timeRow?.clock_in ?? null;
  const clockOut = timeRow?.clock_out ?? null;

  if (absenceRow) {
    outcomeStatus = "call_off";
  } else if (noticeRow?.type === "no_show") {
    outcomeStatus = "no_show";
  } else if (noticeRow?.type === "missed_punch") {
    outcomeStatus = "missed";
  } else if (!shiftHasEnded) {
    outcomeStatus = "scheduled";
  } else if (!timeRow || !clockIn) {
    outcomeStatus = "no_show";
  } else if (!clockOut) {
    outcomeStatus = "missed";
  } else {
    const clockInDiff = (new Date(clockIn).getTime() - scheduledStart.getTime()) / 60000;
    const clockOutDiff = (scheduledEnd.getTime() - new Date(clockOut).getTime()) / 60000;
    if (clockInDiff > LATE_THRESHOLD_MINUTES) {
      lateMinutes = Math.round(clockInDiff);
    }
    if (clockOutDiff > EARLY_OUT_THRESHOLD_MINUTES) {
      earlyOutMinutes = Math.round(clockOutDiff);
    }
    if (lateMinutes > 0) {
      outcomeStatus = "late";
    } else if (earlyOutMinutes > 0) {
      outcomeStatus = "early_out";
    } else {
      outcomeStatus = "completed";
    }
  }

  const varianceMinutes =
    actualMinutes != null && shift.scheduled_minutes != null
      ? actualMinutes - shift.scheduled_minutes
      : null;

  await pool.query(
    `INSERT INTO driver_attendance_records (
       driver_id, wiw_user_id, wiw_shift_id, wiw_time_id, wiw_location_id, wiw_position_id,
       source_absence_id, source_notice_id, shift_date, scheduled_start, scheduled_end,
       scheduled_minutes, actual_clock_in, actual_clock_out, actual_minutes,
       late_minutes, early_out_minutes, variance_minutes, outcome_status, derived_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11,
       $12, $13, $14, $15,
       $16, $17, $18, $19, now(), now()
     )
     ON CONFLICT (wiw_shift_id) DO UPDATE SET
       driver_id          = EXCLUDED.driver_id,
       wiw_user_id         = EXCLUDED.wiw_user_id,
       wiw_time_id         = EXCLUDED.wiw_time_id,
       wiw_location_id     = EXCLUDED.wiw_location_id,
       wiw_position_id     = EXCLUDED.wiw_position_id,
       source_absence_id   = EXCLUDED.source_absence_id,
       source_notice_id    = EXCLUDED.source_notice_id,
       shift_date          = EXCLUDED.shift_date,
       scheduled_start     = EXCLUDED.scheduled_start,
       scheduled_end       = EXCLUDED.scheduled_end,
       scheduled_minutes   = EXCLUDED.scheduled_minutes,
       actual_clock_in     = EXCLUDED.actual_clock_in,
       actual_clock_out    = EXCLUDED.actual_clock_out,
       actual_minutes      = EXCLUDED.actual_minutes,
       late_minutes        = EXCLUDED.late_minutes,
       early_out_minutes   = EXCLUDED.early_out_minutes,
       variance_minutes    = EXCLUDED.variance_minutes,
       outcome_status      = EXCLUDED.outcome_status,
       derived_at          = now(),
       updated_at          = now()`,
    [
      driverId,
      shift.wiw_user_id,
      shift.shift_id,
      timeRow?.id ?? null,
      shift.wiw_location_id,
      shift.wiw_position_id,
      absenceRow?.id ?? null,
      noticeRow?.id ?? null,
      shiftDate,
      scheduledStart.toISOString(),
      scheduledEnd.toISOString(),
      shift.scheduled_minutes,
      clockIn,
      clockOut,
      actualMinutes,
      lateMinutes,
      earlyOutMinutes,
      varianceMinutes,
      outcomeStatus,
    ]
  );
}

/**
 * Resolve the set of driver ids affected by a set of raw WIW row ids for a
 * given entity (used by the sync/webhook hooks to know which drivers to
 * re-derive attendance for after an incremental sync).
 */
export async function resolveDriverIdsForEntity(
  entity: "shifts" | "times" | "absences" | "notices",
  updatedSince: string
): Promise<string[]> {
  let query: string;
  switch (entity) {
    case "shifts":
      query = `SELECT DISTINCT u.driver_id
                FROM wiw_shifts s
                JOIN wiw_users u ON u.id = s.wiw_user_id
                WHERE s.updated_at >= $1 AND u.driver_id IS NOT NULL`;
      break;
    case "times":
      query = `SELECT DISTINCT u.driver_id
                FROM wiw_times t
                JOIN wiw_users u ON u.id = t.wiw_user_id
                WHERE t.updated_at >= $1 AND u.driver_id IS NOT NULL`;
      break;
    case "absences":
      query = `SELECT DISTINCT u.driver_id
                FROM wiw_absences a
                JOIN wiw_users u ON u.id = a.wiw_user_id
                WHERE a.updated_at >= $1 AND u.driver_id IS NOT NULL`;
      break;
    case "notices":
      query = `SELECT DISTINCT u.driver_id
                FROM wiw_attendance_notices n
                JOIN wiw_users u ON u.id = n.wiw_user_id
                WHERE n.updated_at >= $1 AND u.driver_id IS NOT NULL`;
      break;
  }
  const res = await pool.query(query, [updatedSince]);
  return res.rows.map((r) => r.driver_id);
}
