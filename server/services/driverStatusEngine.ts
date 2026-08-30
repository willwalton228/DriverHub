/**
 * Driver Status Engine — Scheduling Intelligence
 *
 * Derives real-time shift status for one or many drivers by joining
 * wiw_shifts + wiw_times. All timestamps are stored UTC in Postgres;
 * the engine compares against `NOW()` at query time — no client-side
 * caching, no stale offsets.
 *
 * Status hierarchy (evaluated in order):
 *   ON_SHIFT                 → active shift + clocked in (no clock_out)
 *   SCHEDULED_NOT_CLOCKED_IN → active shift + within grace period + no clock-in
 *   LATE                     → active shift + past grace period  + no clock-in
 *   NO_SHOW                  → shift ended today + never clocked in
 *   OFF_SHIFT                → no qualifying shift
 *
 * Shift matching strategy:
 *   1. Use wiw_times.wiw_shift_id FK when populated (preferred)
 *   2. Fall back to user + time-window overlap (wiw_times.clock_in within
 *      [shift.start_time − 1h, shift.end_time))
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

export type ShiftStatus =
  | "ON_SHIFT"
  | "SCHEDULED_NOT_CLOCKED_IN"
  | "LATE"
  | "NO_SHOW"
  | "OFF_SHIFT";

const GRACE_MINUTES = 10; // minutes after shift start before LATE kicks in

export interface DriverShiftStatusResult {
  driverId: string;
  wiwUserId: string | null;
  status: ShiftStatus;
  /** UTC ISO string of current/most-relevant shift start */
  shiftStart: string | null;
  /** UTC ISO string of current/most-relevant shift end */
  shiftEnd: string | null;
  /** UTC ISO string of actual clock-in, if present */
  clockIn: string | null;
  /** UTC ISO string of clock-out, if present and applicable */
  clockOut: string | null;
  /** Minutes late past grace period, only set when status === LATE */
  minutesLate: number | null;
  /** Internal wiw_shifts.id of the relevant shift */
  shiftId: string | null;
  /** IANA timezone of the shift location (e.g. "America/New_York") */
  locationTimezone: string | null;
  evaluatedAt: string;
}

// ── Single-driver lookup ─────────────────────────────────────────────────────

/**
 * Resolve the wiw_users.id for a given driverId.
 * Returns null if the driver has no WIW link.
 */
export async function resolveWiwUserId(driverId: string): Promise<string | null> {
  // Data Governance Rule 3: only resolve links to active WIW users.
  // A driver linked to an inactive/deleted WIW record must be treated as OFF_SHIFT.
  const result = await db.execute(sql`
    SELECT id FROM wiw_users WHERE driver_id = ${driverId} AND wiw_status = 'active' LIMIT 1
  `);
  const rows = ((result as any).rows ?? result) as { id: string }[];
  return rows[0]?.id ?? null;
}

/**
 * Compute shift status for a single driver.
 */
export async function getDriverShiftStatus(
  driverId: string
): Promise<DriverShiftStatusResult> {
  const wiwUserId = await resolveWiwUserId(driverId);
  const evaluatedAt = new Date().toISOString();

  if (!wiwUserId) {
    return {
      driverId,
      wiwUserId: null,
      status: "OFF_SHIFT",
      shiftStart: null,
      shiftEnd: null,
      clockIn: null,
      clockOut: null,
      minutesLate: null,
      shiftId: null,
      locationTimezone: null,
      evaluatedAt,
    };
  }

  return computeStatusForUser(driverId, wiwUserId, evaluatedAt);
}

// ── Batch lookup ─────────────────────────────────────────────────────────────

/**
 * Compute shift status for many drivers at once.
 *
 * @param driverIds  Optional filter. If omitted, all drivers with WIW links
 *                   are evaluated (use carefully in large datasets).
 */
export async function getBatchShiftStatus(
  driverIds?: string[]
): Promise<DriverShiftStatusResult[]> {
  const evaluatedAt = new Date().toISOString();

  // Resolve driverId → wiwUserId mapping in one query.
  // Data Governance Rule 3: only active WIW users participate in operational views.
  const mappingResult = await db.execute(
    driverIds && driverIds.length > 0
      ? sql`
          SELECT driver_id, id AS wiw_user_id
          FROM wiw_users
          WHERE driver_id = ANY(${sql.raw(`ARRAY[${driverIds.map(id => `'${id.replace(/'/g, "''")}'`).join(",")}]`)})
            AND driver_id IS NOT NULL
            AND wiw_status = 'active'
        `
      : sql`
          SELECT driver_id, id AS wiw_user_id
          FROM wiw_users
          WHERE driver_id IS NOT NULL
            AND wiw_status = 'active'
        `
  );
  const mappingRows = ((mappingResult as any).rows ?? mappingResult) as {
    driver_id: string;
    wiw_user_id: string;
  }[];

  if (mappingRows.length === 0) {
    const ids = driverIds ?? [];
    return ids.map(driverId => ({
      driverId,
      wiwUserId: null,
      status: "OFF_SHIFT" as ShiftStatus,
      shiftStart: null,
      shiftEnd: null,
      clockIn: null,
      clockOut: null,
      minutesLate: null,
      shiftId: null,
      locationTimezone: null,
      evaluatedAt,
    }));
  }

  const wiwUserIds = mappingRows.map(r => r.wiw_user_id);
  const userIdToDriverId: Record<string, string> = {};
  for (const r of mappingRows) userIdToDriverId[r.wiw_user_id] = r.driver_id;

  // Pull relevant shifts and matching times in one query
  const shiftRows = await fetchRelevantShifts(wiwUserIds);

  // Group by wiw_user_id and compute status for each
  const grouped = groupByUser(shiftRows);
  const results: DriverShiftStatusResult[] = [];

  for (const wiwUserId of wiwUserIds) {
    const driverId = userIdToDriverId[wiwUserId];
    const userShifts = grouped[wiwUserId] ?? [];
    const statusResult = deriveStatus(driverId, wiwUserId, userShifts, evaluatedAt);
    results.push(statusResult);
  }

  // Include OFF_SHIFT entries for driverIds that have no WIW mapping
  if (driverIds) {
    const mappedDriverIds = new Set(mappingRows.map(r => r.driver_id));
    for (const driverId of driverIds) {
      if (!mappedDriverIds.has(driverId)) {
        results.push({
          driverId,
          wiwUserId: null,
          status: "OFF_SHIFT",
          shiftStart: null,
          shiftEnd: null,
          clockIn: null,
          clockOut: null,
          minutesLate: null,
          shiftId: null,
          locationTimezone: null,
          evaluatedAt,
        });
      }
    }
  }

  return results;
}

// ── Core status computation ──────────────────────────────────────────────────

async function computeStatusForUser(
  driverId: string,
  wiwUserId: string,
  evaluatedAt: string
): Promise<DriverShiftStatusResult> {
  const rows = await fetchRelevantShifts([wiwUserId]);
  return deriveStatus(driverId, wiwUserId, rows, evaluatedAt);
}

interface ShiftRow {
  shift_id: string;
  wiw_user_id: string;
  start_time: string;   // ISO UTC
  end_time: string;     // ISO UTC
  clock_in: string | null;
  clock_out: string | null;
  location_timezone: string | null;
}

async function fetchRelevantShifts(wiwUserIds: string[]): Promise<ShiftRow[]> {
  if (wiwUserIds.length === 0) return [];

  // Build safe array literal for IN clause
  const idList = wiwUserIds.map(id => `'${id.replace(/'/g, "''")}'`).join(",");

  /**
   * Fetch shifts for today ± 1 day window so we can identify:
   *   - Currently active shifts (start <= now < end)
   *   - Shifts that ended today (for NO_SHOW detection)
   *   - Upcoming shifts (for SCHEDULED status)
   *
   * LEFT JOIN wiw_times in two ways:
   *   a) via wiw_shift_id FK (most accurate)
   *   b) via user + clock_in window overlap (fallback)
   *
   * We prefer the FK path; the COALESCE handles the fallback.
   */
  const result = await db.execute(sql.raw(`
    SELECT
      s.id                                    AS shift_id,
      s.wiw_user_id,
      s.start_time                            AT TIME ZONE 'UTC' AS start_time,
      s.end_time                              AT TIME ZONE 'UTC' AS end_time,
      COALESCE(t_fk.clock_in, t_win.clock_in)     AS clock_in,
      COALESCE(t_fk.clock_out, t_win.clock_out)   AS clock_out,
      l.timezone                              AS location_timezone
    FROM wiw_shifts s

    -- Method A: direct FK match (wiw_times.wiw_shift_id = wiw_shifts.id)
    LEFT JOIN wiw_times t_fk
      ON t_fk.wiw_shift_id = s.id

    -- Method B: time-window overlap when FK not set
    LEFT JOIN wiw_times t_win
      ON t_win.wiw_user_id = s.wiw_user_id
      AND t_fk.id IS NULL                        -- only use if Method A found nothing
      AND t_win.clock_in >= s.start_time - INTERVAL '1 hour'
      AND t_win.clock_in <  s.end_time

    LEFT JOIN wiw_locations l ON l.id = s.wiw_location_id

    WHERE
      s.wiw_user_id IN (${idList})
      AND s.status != 'deleted'
      -- window: shifts that started in last 24h OR end within next 24h
      AND s.start_time >= NOW() - INTERVAL '24 hours'
      AND s.end_time   <= NOW() + INTERVAL '24 hours'

    ORDER BY s.start_time DESC
  `));

  return ((result as any).rows ?? result) as ShiftRow[];
}

function groupByUser(rows: ShiftRow[]): Record<string, ShiftRow[]> {
  const map: Record<string, ShiftRow[]> = {};
  for (const row of rows) {
    if (!map[row.wiw_user_id]) map[row.wiw_user_id] = [];
    map[row.wiw_user_id].push(row);
  }
  return map;
}

function deriveStatus(
  driverId: string,
  wiwUserId: string,
  shifts: ShiftRow[],
  evaluatedAt: string
): DriverShiftStatusResult {
  const now = new Date(evaluatedAt);
  const gracePeriodMs = GRACE_MINUTES * 60 * 1000;

  // Deduplicate: if multiple time records matched the same shift, prefer
  // the one with a clock_in (non-null wins over null).
  const byShiftId: Record<string, ShiftRow> = {};
  for (const row of shifts) {
    const existing = byShiftId[row.shift_id];
    if (!existing || (row.clock_in !== null && existing.clock_in === null)) {
      byShiftId[row.shift_id] = row;
    }
  }
  const deduped = Object.values(byShiftId);

  // ── 1. Partition shifts ────────────────────────────────────────────────────
  const activeShifts  = deduped.filter(s => new Date(s.start_time) <= now && new Date(s.end_time) > now);
  const pastShifts    = deduped.filter(s => new Date(s.end_time) <= now);

  // ── 2. ON_SHIFT ────────────────────────────────────────────────────────────
  //   Active shift + clock_in present + no clock_out
  const onShift = activeShifts.find(s => s.clock_in !== null && s.clock_out === null);
  if (onShift) {
    return {
      driverId, wiwUserId, evaluatedAt,
      status: "ON_SHIFT",
      shiftId: onShift.shift_id,
      shiftStart: toIso(onShift.start_time),
      shiftEnd:   toIso(onShift.end_time),
      clockIn:    toIso(onShift.clock_in!),
      clockOut:   null,
      minutesLate: null,
      locationTimezone: onShift.location_timezone,
    };
  }

  // ── 3. Active shift with NO clock-in ─────────────────────────────────────
  //   Sort by start_time desc to pick the most recent active shift
  const noClockInActive = activeShifts
    .filter(s => s.clock_in === null)
    .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())[0];

  if (noClockInActive) {
    const shiftStart = new Date(noClockInActive.start_time);
    const msSinceStart = now.getTime() - shiftStart.getTime();

    if (msSinceStart <= gracePeriodMs) {
      // Within grace window → SCHEDULED_NOT_CLOCKED_IN
      return {
        driverId, wiwUserId, evaluatedAt,
        status: "SCHEDULED_NOT_CLOCKED_IN",
        shiftId: noClockInActive.shift_id,
        shiftStart: toIso(noClockInActive.start_time),
        shiftEnd:   toIso(noClockInActive.end_time),
        clockIn:    null,
        clockOut:   null,
        minutesLate: null,
        locationTimezone: noClockInActive.location_timezone,
      };
    }

    // Past grace window → LATE
    const minutesLate = Math.floor((msSinceStart - gracePeriodMs) / 60000);
    return {
      driverId, wiwUserId, evaluatedAt,
      status: "LATE",
      shiftId: noClockInActive.shift_id,
      shiftStart: toIso(noClockInActive.start_time),
      shiftEnd:   toIso(noClockInActive.end_time),
      clockIn:    null,
      clockOut:   null,
      minutesLate,
      locationTimezone: noClockInActive.location_timezone,
    };
  }

  // ── 4. NO_SHOW ─────────────────────────────────────────────────────────────
  //   Shift ended today (within last 24h) + no clock-in for that shift
  const noShows = pastShifts.filter(s => s.clock_in === null);
  // Pick the most recently-ended shift for context
  const latestNoShow = noShows.sort(
    (a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime()
  )[0];

  if (latestNoShow) {
    return {
      driverId, wiwUserId, evaluatedAt,
      status: "NO_SHOW",
      shiftId: latestNoShow.shift_id,
      shiftStart: toIso(latestNoShow.start_time),
      shiftEnd:   toIso(latestNoShow.end_time),
      clockIn:    null,
      clockOut:   null,
      minutesLate: null,
      locationTimezone: latestNoShow.location_timezone,
    };
  }

  // ── 5. OFF_SHIFT ──────────────────────────────────────────────────────────
  return {
    driverId, wiwUserId, evaluatedAt,
    status: "OFF_SHIFT",
    shiftId: null,
    shiftStart: null,
    shiftEnd:   null,
    clockIn:    null,
    clockOut:   null,
    minutesLate: null,
    locationTimezone: null,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toIso(val: string | null): string | null {
  if (!val) return null;
  try {
    return new Date(val).toISOString();
  } catch {
    return val;
  }
}
