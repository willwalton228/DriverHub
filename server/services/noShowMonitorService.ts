/**
 * Scheduling — No Show Monitor, Phase 1
 *
 * This service evaluates the canonical WIW schedule and synchronized WIW time
 * records. It deliberately does not persist or classify a "No Show":
 * Dispatch confirmation is required in a later workflow.
 *
 * Data sources:
 *   - wiw_shifts: assigned schedule
 *   - wiw_users: active WIW user and DriverHub driver link
 *   - wiw_locations.account_id: authoritative account attribution
 *   - wiw_locations.timezone: authoritative local timezone
 *   - wiw_times: synchronized WIW clock records
 *
 * Freshness limitation:
 *   WIW shifts and times are currently synchronized every 15 minutes. The
 *   returned freshness block makes this visible to consumers; a record that
 *   has not reached DriverHub yet cannot be treated as a definitive absence.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

export const NO_SHOW_GRACE_MINUTES = 3;
export const WIW_MONITOR_SYNC_INTERVAL_MINUTES = 15;
export const NO_SHOW_EXCEPTION_DETECTION_WINDOW_MINUTES = 60;

export type AttendanceStatus =
  | "Upcoming"
  | "Grace Period"
  | "Clocked In"
  | "Clocked In Late"
  | "Clock Data Delayed"
  | "Not Clocked In / Action Required";

export type NoShowExceptionStatus = "OPEN" | "RESOLVED" | "CONFIRMED_NO_SHOW";
export const NO_SHOW_FINAL_DISPOSITIONS = [
  "Clocked In",
  "Late / Clocked In",
  "Confirmed No Show",
  "Schedule Error",
  "Clock-In Issue",
  "Shift Cancelled",
  "Other",
] as const;
export type NoShowFinalDisposition = typeof NO_SHOW_FINAL_DISPOSITIONS[number];

export interface NoShowExceptionSummary {
  id: string;
  status: NoShowExceptionStatus;
  first_detected_not_clocked_in: string | null;
  action: string | null;
  action_timestamp: string | null;
  final_disposition: string | null;
  marked_by: string | null;
  marked_at: string | null;
  note: string | null;
}

export interface NoShowMonitorRow {
  shift_id: string;
  driver_id: string;
  driver_name: string;
  driver_email?: string | null;
  worker_classification: string | null;
  account_id: string | null;
  account_name: string | null;
  network: string | null;
  wiw_location_id: string | null;
  wiw_location_name: string | null;
  wiw_timezone: string | null;
  shift_start_local: string | null;
  shift_start_utc: string;
  shift_start_et: string;
  grace_period_end_local: string | null;
  grace_period_end_et: string;
  clock_in_time_local: string | null;
  clock_in_time_et: string | null;
  attendance_status: AttendanceStatus;
  manual_no_show: {
    marked_at: string;
    marked_by: string;
    note: string | null;
  } | null;
  no_show_exception: NoShowExceptionSummary | null;
}

export interface NoShowStartGroup {
  shift_start_utc: string;
  dispatch_start_time_et: string;
  distinct_local_start_times: string[];
  timezones_represented: string[];
  accounts_represented: Array<{ account_id: string | null; account_name: string | null }>;
  assigned_driver_count: number;
  clocked_in_count: number;
  grace_period_count: number;
  not_clocked_in_count: number;
  evaluated_at: string;
  shifts: NoShowMonitorRow[];
}

export interface NoShowMonitorFreshness {
  times_last_sync: string | null;
  shifts_last_sync: string | null;
  sync_interval_minutes: number;
  expected_max_latency_minutes: number;
  is_stale: boolean;
  freshness_warning: string;
}

export interface NoShowMonitorResult {
  evaluated_at: string;
  window_start_utc: string;
  window_end_utc: string;
  data_freshness: NoShowMonitorFreshness;
  groups: NoShowStartGroup[];
}

export interface NoShowMonitorOptions {
  evaluatedAt?: Date;
  from?: Date | string;
  to?: Date | string;
  /** Route-only: refresh targeted WIW data before evaluating this window. */
  refreshWiw?: boolean;
}

export interface NoShowWiwRefreshResult {
  refreshed_at: string;
  window_start_date: string;
  window_end_date: string;
  users: { fetched: number; inserted: number; updated: number };
  shifts: { fetched: number; inserted: number; updated: number };
  times: { fetched: number; inserted: number; updated: number };
}

export class NoShowWiwRefreshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoShowWiwRefreshError";
  }
}

let activeNoShowWiwRefresh: Promise<NoShowWiwRefreshResult> | null = null;

interface MonitorDbRow {
  shift_id: string;
  driver_id: string;
  driver_name: string;
  driver_email: string | null;
  worker_classification: string | null;
  account_id: string | null;
  account_name: string | null;
  network: string | null;
  wiw_location_id: string | null;
  wiw_location_name: string | null;
  wiw_timezone: string | null;
  shift_start_utc: string | Date;
  grace_period_end_utc: string | Date;
  clock_in_utc: string | Date | null;
  manual_no_show_at?: string | Date | null;
  manual_no_show_by?: string | null;
  manual_no_show_note?: string | null;
  exception_id?: string | null;
  exception_status?: NoShowExceptionStatus | null;
  exception_first_detected_at?: string | Date | null;
  exception_action?: string | null;
  exception_action_timestamp?: string | Date | null;
  exception_final_disposition?: string | null;
}

function asDate(value: Date | string, fieldName: string): Date {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return parsed;
}

function syncDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function assertSuccessfulRefreshEntity(
  entity: string,
  result: { errors: number; errorMessages: string[] },
): void {
  if (result.errors > 0) {
    throw new Error(`${entity} refresh failed: ${result.errorMessages.join("; ") || "WIW returned one or more errors"}`);
  }
}

/**
 * Refresh only the WIW records needed to evaluate a No-Show date window.
 * A process-wide in-flight lock coalesces overlapping Dispatch requests so
 * multiple browser sessions cannot fan out duplicate WIW calls.
 */
export async function refreshNoShowMonitorWiw(
  options: Pick<NoShowMonitorOptions, "from" | "to">,
): Promise<NoShowWiwRefreshResult> {
  if (activeNoShowWiwRefresh) return activeNoShowWiwRefresh;

  const refresh = (async () => {
    const now = new Date();
    const from = options.from
      ? asDate(options.from, "from")
      : new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const to = options.to
      ? asDate(options.to, "to")
      : new Date(now.getTime() + 24 * 60 * 60 * 1000);
    if (from.getTime() > to.getTime()) throw new Error("from must be before to");

    // The selected ET day can span two UTC dates. Passing both dates keeps the
    // refresh operationally narrow while covering each represented WIW timezone.
    const syncOptions = {
      start: syncDate(from),
      end: syncDate(to),
      includeDeletedUsers: false,
    };
    const { runEntitySync } = await import("./wiwSyncService");

    // Users must precede shifts for FK resolution; shifts must precede times
    // so a new WIW time record can link to its canonical DriverHub shift.
    const users = await runEntitySync("users", "manual", syncOptions);
    assertSuccessfulRefreshEntity("WIW users", users);
    const shifts = await runEntitySync("shifts", "manual", syncOptions);
    assertSuccessfulRefreshEntity("WIW shifts", shifts);
    const times = await runEntitySync("times", "manual", syncOptions);
    assertSuccessfulRefreshEntity("WIW times", times);

    return {
      refreshed_at: new Date().toISOString(),
      window_start_date: syncOptions.start,
      window_end_date: syncOptions.end,
      users: { fetched: users.fetched, inserted: users.inserted, updated: users.updated },
      shifts: { fetched: shifts.fetched, inserted: shifts.inserted, updated: shifts.updated },
      times: { fetched: times.fetched, inserted: times.inserted, updated: times.updated },
    };
  })();

  activeNoShowWiwRefresh = refresh;
  try {
    return await refresh;
  } finally {
    if (activeNoShowWiwRefresh === refresh) activeNoShowWiwRefresh = null;
  }
}

function formatZoned(value: Date | string, timezone: string | null, includeZone = true): string | null {
  if (!timezone) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      ...(includeZone ? { timeZoneName: "short" as const } : {}),
    }).formatToParts(new Date(value));
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const date = `${values.year}-${values.month}-${values.day}`;
    const time = `${values.hour}:${values.minute} ${values.dayPeriod}`;
    return `${date} ${time}${includeZone && values.timeZoneName ? ` ${values.timeZoneName}` : ""}`;
  } catch {
    // Invalid/missing location timezone is a data-quality issue. Never fall
    // back to account, browser, server, or Eastern time.
    return null;
  }
}

function evaluateAttendanceStatus(
  shiftStart: Date,
  evaluatedAt: Date,
  clockIn: Date | null
): AttendanceStatus {
  if (evaluatedAt.getTime() < shiftStart.getTime()) return "Upcoming";

  const elapsedMs = evaluatedAt.getTime() - shiftStart.getTime();
  if (elapsedMs < NO_SHOW_GRACE_MINUTES * 60 * 1000) return "Grace Period";

  return clockIn && clockIn.getTime() <= evaluatedAt.getTime()
    ? clockIn.getTime() > shiftStart.getTime() ? "Clocked In Late" : "Clocked In"
    : "Not Clocked In / Action Required";
}

export function buildNoShowMonitorRow(
  row: MonitorDbRow,
  evaluatedAt: Date,
  options: { clockDataFresh?: boolean } = {},
): NoShowMonitorRow {
  const shiftStart = asDate(row.shift_start_utc, "shift_start_utc");
  const graceEnd = asDate(row.grace_period_end_utc, "grace_period_end_utc");
  const clockIn = row.clock_in_utc ? asDate(row.clock_in_utc, "clock_in_utc") : null;

  const noShowException = row.exception_id && row.exception_status
    ? {
        id: row.exception_id,
        status: row.exception_status,
        first_detected_not_clocked_in: row.exception_first_detected_at
          ? asDate(row.exception_first_detected_at, "exception_first_detected_at").toISOString()
          : null,
        action: row.exception_action ?? null,
        action_timestamp: row.exception_action_timestamp
          ? asDate(row.exception_action_timestamp, "exception_action_timestamp").toISOString()
          : null,
        final_disposition: row.exception_final_disposition ?? null,
        marked_by: row.manual_no_show_by ?? null,
        marked_at: row.manual_no_show_at
          ? asDate(row.manual_no_show_at, "manual_no_show_at").toISOString()
          : null,
        note: row.manual_no_show_note ?? null,
      } satisfies NoShowExceptionSummary
    : null;
  const calculatedStatus = evaluateAttendanceStatus(shiftStart, evaluatedAt, clockIn);
  const attendanceStatus: AttendanceStatus = noShowException?.status === "RESOLVED"
    && calculatedStatus === "Not Clocked In / Action Required"
    ? "Exception Resolved"
    : options.clockDataFresh === false && !clockIn && calculatedStatus === "Not Clocked In / Action Required"
      ? "Clock Data Delayed"
      : calculatedStatus;

  return {
    shift_id: row.shift_id,
    driver_id: row.driver_id,
    driver_name: row.driver_name,
    driver_email: row.driver_email ?? null,
    worker_classification: row.worker_classification,
    account_id: row.account_id,
    account_name: row.account_name,
      network: row.network,
    wiw_location_id: row.wiw_location_id,
    wiw_location_name: row.wiw_location_name,
    wiw_timezone: row.wiw_timezone,
    shift_start_local: formatZoned(shiftStart, row.wiw_timezone),
    shift_start_utc: shiftStart.toISOString(),
    shift_start_et: formatZoned(shiftStart, "America/New_York")!,
    grace_period_end_local: formatZoned(graceEnd, row.wiw_timezone),
    grace_period_end_et: formatZoned(graceEnd, "America/New_York")!,
    clock_in_time_local: clockIn ? formatZoned(clockIn, row.wiw_timezone) : null,
    clock_in_time_et: clockIn ? formatZoned(clockIn, "America/New_York") : null,
    attendance_status: attendanceStatus,
    manual_no_show: row.manual_no_show_at && row.manual_no_show_by
      ? {
          marked_at: asDate(row.manual_no_show_at, "manual_no_show_at").toISOString(),
          marked_by: row.manual_no_show_by,
          note: row.manual_no_show_note,
        }
      : null,
    no_show_exception: noShowException,
  };
}

export function groupNoShowMonitorRows(
  rows: NoShowMonitorRow[],
  evaluatedAt: Date
): NoShowStartGroup[] {
  const groups = new Map<string, NoShowMonitorRow[]>();
  for (const row of rows) {
    const group = groups.get(row.shift_start_utc) ?? [];
    group.push(row);
    groups.set(row.shift_start_utc, group);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([shiftStartUtc, shifts]) => {
      const localTimes = [...new Set(shifts.map(shift => shift.shift_start_local).filter(Boolean) as string[])].sort();
      const timezones = [...new Set(shifts.map(shift => shift.wiw_timezone).filter(Boolean) as string[])].sort();
      const accounts = new Map<string, { account_id: string | null; account_name: string | null }>();
      for (const shift of shifts) {
        const key = shift.account_id ?? "__unassigned__";
        accounts.set(key, { account_id: shift.account_id, account_name: shift.account_name });
      }

      return {
        shift_start_utc: shiftStartUtc,
        dispatch_start_time_et: shifts[0].shift_start_et,
        distinct_local_start_times: localTimes,
        timezones_represented: timezones,
        accounts_represented: [...accounts.values()].sort((left, right) => (left.account_name ?? "").localeCompare(right.account_name ?? "")),
        assigned_driver_count: shifts.length,
        clocked_in_count: shifts.filter(shift => shift.attendance_status === "Clocked In" || shift.attendance_status === "Clocked In Late").length,
        grace_period_count: shifts.filter(shift => shift.attendance_status === "Grace Period").length,
        not_clocked_in_count: shifts.filter(shift => shift.attendance_status === "Not Clocked In / Action Required").length,
        evaluated_at: evaluatedAt.toISOString(),
        shifts,
      };
    });
}

export async function getWiwAttendanceFreshness(): Promise<NoShowMonitorFreshness> {
  let timesLastSync: string | null = null;
  let shiftsLastSync: string | null = null;
  try {
    const result = await db.execute(sql`
      SELECT entity, MAX(completed_at) AS latest_completed_at
      FROM wiw_sync_runs
      WHERE status = 'success'
        AND entity IN ('times', 'shifts')
      GROUP BY entity
    `);
    const rows = ((result as any).rows ?? result) as Array<{ entity: string; latest_completed_at: string | null }>;
    timesLastSync = rows.find(row => row.entity === "times")?.latest_completed_at ?? null;
    shiftsLastSync = rows.find(row => row.entity === "shifts")?.latest_completed_at ?? null;
  } catch (error) {
    console.error("[WIW no-show-monitor] freshness check failed:", error);
  }

  const now = Date.now();
  const maxAgeMs = (WIW_MONITOR_SYNC_INTERVAL_MINUTES + 5) * 60 * 1000;
  const stale = !timesLastSync || !shiftsLastSync
    || now - new Date(timesLastSync).getTime() > maxAgeMs
    || now - new Date(shiftsLastSync).getTime() > maxAgeMs;

  return {
    times_last_sync: timesLastSync,
    shifts_last_sync: shiftsLastSync,
    sync_interval_minutes: WIW_MONITOR_SYNC_INTERVAL_MINUTES,
    expected_max_latency_minutes: WIW_MONITOR_SYNC_INTERVAL_MINUTES + 5,
    is_stale: stale,
    freshness_warning: stale
      ? "WIW clock data may be delayed."
      : "WIW shifts and times are synchronized every 15 minutes. A clock-in that has not reached DriverHub yet cannot be treated as a definitive absence.",
  };
}

export async function getNoShowMonitor(
  options: NoShowMonitorOptions = {}
): Promise<NoShowMonitorResult> {
  const requestedEvaluationTime = options.evaluatedAt
    ? asDate(options.evaluatedAt, "evaluatedAt")
    : new Date();
  const from = options.from
    ? asDate(options.from, "from")
    : new Date(requestedEvaluationTime.getTime() - 24 * 60 * 60 * 1000);
  const to = options.to
    ? asDate(options.to, "to")
    : new Date(requestedEvaluationTime.getTime() + 24 * 60 * 60 * 1000);
  if (from.getTime() > to.getTime()) throw new Error("from must be before to");
  if (options.refreshWiw) {
    try {
      await refreshNoShowMonitorWiw({ from, to });
    } catch (error: any) {
      throw new NoShowWiwRefreshError(error?.message ?? "WIW refresh failed");
    }
  }
  // A live refresh must complete before "now" is captured for the 3-minute
  // evaluation and the response's Last Updated timestamp.
  const evaluatedAt = options.evaluatedAt ? requestedEvaluationTime : new Date();

  const result = await db.execute(sql`
    SELECT
      s.id AS shift_id,
      wu.driver_id,
      wu.name AS driver_name,
       COALESCE(NULLIF(d.wiw_email, ''), driver_user.email, wu.email) AS driver_email,
      COALESCE(NULLIF(d.driver_classification, ''), NULLIF(d.driver_type, ''), 'Unknown') AS worker_classification,
      l.account_id,
      c.customer_name AS account_name,
      c.network,
      l.id AS wiw_location_id,
      l.name AS wiw_location_name,
      NULLIF(BTRIM(l.timezone), '') AS wiw_timezone,
      s.start_time AS shift_start_utc,
      s.start_time + (${NO_SHOW_GRACE_MINUTES} * INTERVAL '1 minute') AS grace_period_end_utc,
       clock_record.clock_in AS clock_in_utc,
       manual_action.id AS exception_id,
       manual_action.status AS exception_status,
       manual_action.first_detected_not_clocked_in_at AS exception_first_detected_at,
       manual_action.action AS exception_action,
       manual_action.action_timestamp AS exception_action_timestamp,
       manual_action.final_disposition AS exception_final_disposition,
       manual_action.marked_at AS manual_no_show_at,
       manual_action.marked_by AS manual_no_show_by,
       manual_action.note AS manual_no_show_note
    FROM wiw_shifts s
    JOIN wiw_users wu
      ON wu.id = s.wiw_user_id
     AND wu.driver_id IS NOT NULL
     AND wu.is_active = true
     AND wu.wiw_status = 'active'
    JOIN drivers d ON d.id = wu.driver_id
     LEFT JOIN users driver_user ON driver_user.id = d.user_id
    LEFT JOIN wiw_locations l ON l.id = s.wiw_location_id
    LEFT JOIN customers c ON c.id = l.account_id
    LEFT JOIN LATERAL (
      SELECT t.clock_in
      FROM wiw_times t
      WHERE t.clock_in IS NOT NULL
        AND t.clock_in <= ${evaluatedAt}
        AND (
          t.wiw_shift_id = s.id
          OR (
            t.wiw_shift_id IS NULL
            AND t.wiw_user_id = s.wiw_user_id
            AND t.clock_in >= s.start_time - INTERVAL '1 hour'
            AND t.clock_in < s.end_time
          )
        )
      ORDER BY
        CASE WHEN t.wiw_shift_id = s.id THEN 0 ELSE 1 END,
        t.clock_in ASC
      LIMIT 1
    ) clock_record ON true
     LEFT JOIN scheduling_manual_no_show_actions manual_action
       ON manual_action.wiw_shift_id = s.id
      AND manual_action.driver_id = wu.driver_id
    WHERE s.status NOT IN ('deleted', 'cancelled')
      AND s.wiw_user_id IS NOT NULL
      AND s.start_time >= ${from}
      AND s.start_time <= ${to}
    ORDER BY s.start_time ASC, wu.name ASC
  `);
  const rows = ((result as any).rows ?? result) as MonitorDbRow[];
  const freshness = await getWiwAttendanceFreshness();
  let monitorRows = rows.map(row => buildNoShowMonitorRow(row, evaluatedAt, {
    clockDataFresh: !freshness.is_stale,
  }));
  if (!freshness.is_stale) {
    const synchronized = await synchronizeNoShowExceptions(monitorRows, evaluatedAt);
    monitorRows = monitorRows.map((shift) => {
      const exception = synchronized.get(`${shift.shift_id}:${shift.driver_id}`);
      if (!exception) return shift;
      return {
        ...shift,
        no_show_exception: exception,
        manual_no_show: exception.status === "CONFIRMED_NO_SHOW"
          ? {
              marked_at: exception.marked_at ?? exception.action_timestamp ?? evaluatedAt.toISOString(),
              marked_by: exception.marked_by ?? "",
              note: exception.note,
            }
          : null,
      };
    });
  }

  return {
    evaluated_at: evaluatedAt.toISOString(),
    window_start_utc: from.toISOString(),
    window_end_utc: to.toISOString(),
    data_freshness: freshness,
    groups: groupNoShowMonitorRows(monitorRows, evaluatedAt),
  };
}

function exceptionSummaryFromRow(row: {
  id: string;
  status: NoShowExceptionStatus;
  first_detected_not_clocked_in_at: string | Date | null;
  action: string | null;
  action_timestamp: string | Date | null;
  final_disposition: string | null;
  marked_by: string | null;
  marked_at: string | Date | null;
  note: string | null;
}): NoShowExceptionSummary {
  return {
    id: row.id,
    status: row.status,
    first_detected_not_clocked_in: row.first_detected_not_clocked_in_at
      ? asDate(row.first_detected_not_clocked_in_at, "first_detected_not_clocked_in_at").toISOString()
      : null,
    action: row.action,
    action_timestamp: row.action_timestamp
      ? asDate(row.action_timestamp, "action_timestamp").toISOString()
      : null,
    final_disposition: row.final_disposition,
    marked_by: row.marked_by,
    marked_at: row.marked_at
      ? asDate(row.marked_at, "marked_at").toISOString()
      : null,
    note: row.note,
  };
}

async function insertNoShowHistory(input: {
  exceptionId: string;
  shift: Pick<NoShowMonitorRow, "shift_id" | "driver_id" | "account_id" | "shift_start_utc">;
  firstDetectedAt: Date | null;
  dispatchUser: string | null;
  action: string;
  actionTimestamp: Date;
  contactAttempt?: string | null;
  contactResult?: string | null;
  finalDisposition?: string | null;
  notes?: string | null;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO scheduling_no_show_action_history (
      exception_id,
      wiw_shift_id,
      driver_id,
      account_id,
      scheduled_start_at,
      grace_period_end_at,
      first_detected_not_clocked_in_at,
      dispatch_user,
      action,
      action_timestamp,
      contact_attempt,
      contact_result,
      final_disposition,
      notes
    )
    VALUES (
      ${input.exceptionId},
      ${input.shift.shift_id},
      ${input.shift.driver_id},
      ${input.shift.account_id},
      ${asDate(input.shift.shift_start_utc, "shift_start_utc")},
      ${new Date(asDate(input.shift.shift_start_utc, "shift_start_utc").getTime() + NO_SHOW_GRACE_MINUTES * 60_000)},
      ${input.firstDetectedAt},
      ${input.dispatchUser},
      ${input.action},
      ${input.actionTimestamp},
      ${input.contactAttempt ?? null},
      ${input.contactResult ?? null},
      ${input.finalDisposition ?? null},
      ${input.notes ?? null}
    )
  `);
}

async function synchronizeNoShowExceptions(
  rows: NoShowMonitorRow[],
  evaluatedAt: Date,
): Promise<Map<string, NoShowExceptionSummary>> {
  const synchronized = new Map<string, NoShowExceptionSummary>();
  for (const shift of rows) {
    const key = `${shift.shift_id}:${shift.driver_id}`;
    const scheduledStartAt = asDate(shift.shift_start_utc, "shift_start_utc");
    const gracePeriodEndAt = new Date(scheduledStartAt.getTime() + NO_SHOW_GRACE_MINUTES * 60_000);
    const withinDetectionWindow = evaluatedAt.getTime() - scheduledStartAt.getTime()
      <= NO_SHOW_EXCEPTION_DETECTION_WINDOW_MINUTES * 60_000;
    if (shift.attendance_status === "Not Clocked In / Action Required" && withinDetectionWindow) {
      const existingResult = await db.execute(sql`
        SELECT id, status, first_detected_not_clocked_in_at, action, action_timestamp,
               final_disposition, marked_by, marked_at, note
        FROM scheduling_manual_no_show_actions
        WHERE wiw_shift_id = ${shift.shift_id} AND driver_id = ${shift.driver_id}
        LIMIT 1
      `);
      const existingRows = ((existingResult as any).rows ?? existingResult) as Array<{
        id: string;
        status: NoShowExceptionStatus;
        first_detected_not_clocked_in_at: string | Date | null;
        action: string | null;
        action_timestamp: string | Date | null;
        final_disposition: string | null;
        marked_by: string | null;
        marked_at: string | Date | null;
        note: string | null;
      }>;
      if (existingRows[0]) {
        synchronized.set(key, exceptionSummaryFromRow(existingRows[0]));
        continue;
      }

      const firstDetectedAt = evaluatedAt;
      const insertedResult = await db.execute(sql`
        INSERT INTO scheduling_manual_no_show_actions (
          wiw_shift_id, driver_id, account_id, shift_start_at, grace_period_end_at,
          first_detected_not_clocked_in_at, marked_by, marked_at, source, status,
          action, action_timestamp, updated_at
        )
        VALUES (
          ${shift.shift_id},
          ${shift.driver_id},
          ${shift.account_id},
          ${scheduledStartAt},
          ${gracePeriodEndAt},
          ${firstDetectedAt},
          NULL,
          ${evaluatedAt},
          'Dispatch No Show Monitor',
          'OPEN',
          'ACTION_REQUIRED_DETECTED',
          ${evaluatedAt},
          ${evaluatedAt}
        )
        ON CONFLICT (wiw_shift_id, driver_id) DO NOTHING
        RETURNING id, status, first_detected_not_clocked_in_at, action, action_timestamp,
                  final_disposition, marked_by, marked_at, note
      `);
      const insertedRows = ((insertedResult as any).rows ?? insertedResult) as Array<{
        id: string;
        status: NoShowExceptionStatus;
        first_detected_not_clocked_in_at: string | Date | null;
        action: string | null;
        action_timestamp: string | Date | null;
        final_disposition: string | null;
        marked_by: string | null;
        marked_at: string | Date | null;
        note: string | null;
      }>;
      if (!insertedRows[0]) continue;
      const summary = exceptionSummaryFromRow(insertedRows[0]);
      synchronized.set(key, summary);
      await insertNoShowHistory({
        exceptionId: summary.id,
        shift,
        firstDetectedAt,
        dispatchUser: null,
        action: "ACTION_REQUIRED_DETECTED",
        actionTimestamp: evaluatedAt,
      });
    } else if (shift.attendance_status === "Clocked In Late") {
      const resolvedResult = await db.execute(sql`
        UPDATE scheduling_manual_no_show_actions
        SET status = 'RESOLVED',
            action = 'AUTO_RESOLVE_LATE_CLOCK_IN',
            action_timestamp = ${evaluatedAt},
            final_disposition = 'Late / Clocked In',
            resolved_at = ${evaluatedAt},
            updated_at = ${evaluatedAt}
        WHERE wiw_shift_id = ${shift.shift_id}
          AND driver_id = ${shift.driver_id}
          AND status = 'OPEN'
        RETURNING id, status, first_detected_not_clocked_in_at, action, action_timestamp,
                  final_disposition, marked_by, marked_at, note
      `);
      const resolvedRows = ((resolvedResult as any).rows ?? resolvedResult) as Array<{
        id: string;
        status: NoShowExceptionStatus;
        first_detected_not_clocked_in_at: string | Date | null;
        action: string | null;
        action_timestamp: string | Date | null;
        final_disposition: string | null;
        marked_by: string | null;
        marked_at: string | Date | null;
        note: string | null;
      }>;
      if (resolvedRows[0]) {
        const summary = exceptionSummaryFromRow(resolvedRows[0]);
        synchronized.set(key, summary);
        await insertNoShowHistory({
          exceptionId: summary.id,
          shift,
          firstDetectedAt: summary.first_detected_not_clocked_in ? new Date(summary.first_detected_not_clocked_in) : null,
          dispatchUser: null,
          action: "AUTO_RESOLVE_LATE_CLOCK_IN",
          actionTimestamp: evaluatedAt,
          finalDisposition: "Late / Clocked In",
        });
      } else if (shift.no_show_exception) {
        synchronized.set(key, shift.no_show_exception);
      }
    } else if (shift.no_show_exception) {
      synchronized.set(key, shift.no_show_exception);
    }
  }
  return synchronized;
}

export interface MarkNoShowMonitorActionInput {
  shiftId: string;
  driverId: string;
  markedBy: string;
  note?: string | null;
}

export interface MarkNoShowMonitorActionResult {
  id: string;
  wiw_shift_id: string;
  driver_id: string;
  account_id: string | null;
  marked_by: string;
  marked_at: string;
  source: string;
  note: string | null;
  already_marked: boolean;
}

export async function markNoShowMonitorAction(
  input: MarkNoShowMonitorActionInput,
): Promise<MarkNoShowMonitorActionResult> {
  const note = input.note?.trim() || null;
  const freshness = await getWiwAttendanceFreshness();
  if (freshness.is_stale) {
    throw new Error("WIW clock data may be delayed. Refresh after the WIW sync completes before confirming a No Show.");
  }
  const eligibilityResult = await db.execute(sql`
    SELECT
      s.id AS wiw_shift_id,
      wu.driver_id,
      l.account_id,
      s.start_time,
      clock_record.clock_in
    FROM wiw_shifts s
    JOIN wiw_users wu
      ON wu.id = s.wiw_user_id
     AND wu.driver_id = ${input.driverId}
    LEFT JOIN wiw_locations l ON l.id = s.wiw_location_id
    LEFT JOIN LATERAL (
      SELECT t.clock_in
      FROM wiw_times t
      WHERE t.clock_in IS NOT NULL
        AND t.clock_in <= NOW()
        AND (
          t.wiw_shift_id = s.id
          OR (
            t.wiw_shift_id IS NULL
            AND t.wiw_user_id = s.wiw_user_id
            AND t.clock_in >= s.start_time - INTERVAL '1 hour'
            AND t.clock_in < s.end_time
          )
        )
      ORDER BY CASE WHEN t.wiw_shift_id = s.id THEN 0 ELSE 1 END, t.clock_in ASC
      LIMIT 1
    ) clock_record ON true
    WHERE s.id = ${input.shiftId}
      AND s.status NOT IN ('deleted', 'cancelled')
    LIMIT 1
  `);
  const eligibilityRows = ((eligibilityResult as any).rows ?? eligibilityResult) as Array<{
    wiw_shift_id: string;
    driver_id: string;
    account_id: string | null;
    start_time: Date | string;
    clock_in: Date | string | null;
  }>;
  const shift = eligibilityRows[0];
  if (!shift) {
    throw new Error("The selected WIW shift is no longer assigned to this driver.");
  }
  if (shift.clock_in) {
    throw new Error("This driver has a recorded WIW clock-in and cannot be marked No Show.");
  }
  const shiftStart = asDate(shift.start_time, "shift start");
  if (Date.now() < shiftStart.getTime() + NO_SHOW_GRACE_MINUTES * 60 * 1000) {
    throw new Error(`A driver can only be marked No Show after the ${NO_SHOW_GRACE_MINUTES}-minute grace period.`);
  }
  const gracePeriodEnd = new Date(shiftStart.getTime() + NO_SHOW_GRACE_MINUTES * 60 * 1000);
  const actionAt = new Date();
  const auditShift: Pick<NoShowMonitorRow, "shift_id" | "driver_id" | "account_id" | "shift_start_utc"> = {
    shift_id: shift.wiw_shift_id,
    driver_id: shift.driver_id,
    account_id: shift.account_id,
    shift_start_utc: shiftStart.toISOString(),
  };

  const existingResult = await db.execute(sql`
    SELECT id, wiw_shift_id, driver_id, account_id, marked_by, marked_at, source, note, status,
           first_detected_not_clocked_in_at
    FROM scheduling_manual_no_show_actions
    WHERE wiw_shift_id = ${shift.wiw_shift_id}
      AND driver_id = ${shift.driver_id}
    LIMIT 1
  `);
  const existingRows = ((existingResult as any).rows ?? existingResult) as Array<Omit<MarkNoShowMonitorActionResult, "already_marked"> & {
    status: NoShowExceptionStatus;
    first_detected_not_clocked_in_at: Date | string | null;
  }>;
  const existing = existingRows[0];
  if (existing?.status === "CONFIRMED_NO_SHOW") {
    return {
      id: existing.id,
      wiw_shift_id: existing.wiw_shift_id,
      driver_id: existing.driver_id,
      account_id: existing.account_id,
      marked_by: existing.marked_by,
      marked_at: existing.marked_at,
      source: existing.source,
      note: existing.note,
      already_marked: true,
    };
  }
  if (existing?.status === "RESOLVED") {
    throw new Error("This exception is already resolved by a valid WIW clock-in and cannot be marked No Show.");
  }

  const actionResult = existing
    ? await db.execute(sql`
        UPDATE scheduling_manual_no_show_actions
        SET status = 'CONFIRMED_NO_SHOW',
            marked_by = ${input.markedBy},
            marked_at = ${actionAt},
            source = 'Dispatch No Show Monitor',
            action = 'MARK_NO_SHOW',
            action_timestamp = ${actionAt},
            final_disposition = 'Confirmed No Show',
            note = ${note},
            updated_at = ${actionAt}
        WHERE id = ${existing.id} AND status = 'OPEN'
        RETURNING id, wiw_shift_id, driver_id, account_id, marked_by, marked_at, source, note,
                  first_detected_not_clocked_in_at
      `)
    : await db.execute(sql`
        INSERT INTO scheduling_manual_no_show_actions (
          wiw_shift_id, driver_id, account_id, shift_start_at, grace_period_end_at,
          first_detected_not_clocked_in_at, marked_by, marked_at, source, status,
          action, action_timestamp, final_disposition, note, updated_at
        )
        VALUES (
          ${shift.wiw_shift_id},
          ${shift.driver_id},
          ${shift.account_id},
          ${shiftStart},
          ${gracePeriodEnd},
          ${actionAt},
          ${input.markedBy},
          ${actionAt},
          'Dispatch No Show Monitor',
          'CONFIRMED_NO_SHOW',
          'MARK_NO_SHOW',
          ${actionAt},
          'Confirmed No Show',
          ${note},
          ${actionAt}
        )
        ON CONFLICT (wiw_shift_id, driver_id) DO NOTHING
        RETURNING id, wiw_shift_id, driver_id, account_id, marked_by, marked_at, source, note,
                  first_detected_not_clocked_in_at
      `);
  const actionRows = ((actionResult as any).rows ?? actionResult) as Array<Omit<MarkNoShowMonitorActionResult, "already_marked"> & {
    first_detected_not_clocked_in_at: Date | string | null;
  }>;
  const action = actionRows[0];
  if (!action) {
    throw new Error("This No Show action changed before it could be confirmed. Refresh the monitor and try again.");
  }
  await insertNoShowHistory({
    exceptionId: action.id,
    shift: auditShift,
    firstDetectedAt: action.first_detected_not_clocked_in_at
      ? asDate(action.first_detected_not_clocked_in_at, "first_detected_not_clocked_in_at")
      : actionAt,
    dispatchUser: input.markedBy,
    action: "MARK_NO_SHOW",
    actionTimestamp: actionAt,
    finalDisposition: "Confirmed No Show",
    notes: note,
  });
  return {
    id: action.id,
    wiw_shift_id: action.wiw_shift_id,
    driver_id: action.driver_id,
    account_id: action.account_id,
    marked_by: action.marked_by,
    marked_at: action.marked_at,
    source: action.source,
    note: action.note,
    already_marked: false,
  };
}

export interface NoShowMonitorOperationalActionInput {
  shiftId: string;
  driverId: string;
  dispatchUser: string;
  note?: string | null;
}

export interface ResolveNoShowMonitorExceptionInput extends NoShowMonitorOperationalActionInput {
  disposition: Exclude<NoShowFinalDisposition, "Confirmed No Show">;
  contactAttempt?: string | null;
  contactResult?: string | null;
}

export interface NoShowMonitorOperationalActionResult {
  id: string;
  status: NoShowExceptionStatus;
  final_disposition: string | null;
  action: string | null;
  action_timestamp: string | Date | null;
  already_resolved?: boolean;
}

async function getOpenNoShowException(shiftId: string, driverId: string) {
  const result = await db.execute(sql`
    SELECT id, wiw_shift_id, driver_id, account_id, shift_start_at, grace_period_end_at,
           first_detected_not_clocked_in_at, status, final_disposition
    FROM scheduling_manual_no_show_actions
    WHERE wiw_shift_id = ${shiftId} AND driver_id = ${driverId}
    LIMIT 1
  `);
  return (((result as any).rows ?? result) as Array<{
    id: string;
    wiw_shift_id: string;
    driver_id: string;
    account_id: string | null;
    shift_start_at: Date | string;
    grace_period_end_at: Date | string | null;
    first_detected_not_clocked_in_at: Date | string | null;
    status: NoShowExceptionStatus;
    final_disposition: string | null;
  }>)[0] ?? null;
}

export async function recordNoShowMonitorContactAttempt(
  input: NoShowMonitorOperationalActionInput,
): Promise<NoShowMonitorOperationalActionResult> {
  const exception = await getOpenNoShowException(input.shiftId, input.driverId);
  if (!exception || exception.status !== "OPEN") {
    throw new Error("Only an open Action Required exception can record a contact attempt.");
  }
  const actionAt = new Date();
  const note = input.note?.trim() || null;
  const contactAttempt = "Email composer opened";
  const contactResult = "Pending";
  await db.execute(sql`
    UPDATE scheduling_manual_no_show_actions
    SET action = 'CONTACT_DRIVER',
        action_timestamp = ${actionAt},
        contact_attempt = ${contactAttempt},
        contact_result = ${contactResult},
        updated_at = ${actionAt}
    WHERE id = ${exception.id}
  `);
  const auditShift: Pick<NoShowMonitorRow, "shift_id" | "driver_id" | "account_id" | "shift_start_utc"> = {
    shift_id: exception.wiw_shift_id,
    driver_id: exception.driver_id,
    account_id: exception.account_id,
    shift_start_utc: asDate(exception.shift_start_at, "shift_start_at").toISOString(),
  };
  await insertNoShowHistory({
    exceptionId: exception.id,
    shift: auditShift,
    firstDetectedAt: exception.first_detected_not_clocked_in_at
      ? asDate(exception.first_detected_not_clocked_in_at, "first_detected_not_clocked_in_at")
      : null,
    dispatchUser: input.dispatchUser,
    action: "CONTACT_DRIVER",
    actionTimestamp: actionAt,
    contactAttempt,
    contactResult,
    notes: note,
  });
  return {
    id: exception.id,
    status: "OPEN",
    final_disposition: null,
    action: "CONTACT_DRIVER",
    action_timestamp: actionAt,
  };
}

export async function resolveNoShowMonitorException(
  input: ResolveNoShowMonitorExceptionInput,
): Promise<NoShowMonitorOperationalActionResult> {
  const exception = await getOpenNoShowException(input.shiftId, input.driverId);
  if (!exception) throw new Error("No No Show Monitor exception exists for this WIW shift.");
  if (exception.status === "CONFIRMED_NO_SHOW") {
    throw new Error("A confirmed No Show is historical and cannot be replaced with another disposition.");
  }
  if (exception.status === "RESOLVED") {
    return {
      id: exception.id,
      status: exception.status,
      final_disposition: exception.final_disposition,
      action: "DISPATCH_RESOLVED_EXCEPTION",
      action_timestamp: null,
      already_resolved: true,
    };
  }

  const actionAt = new Date();
  const note = input.note?.trim() || null;
  const contactAttempt = input.contactAttempt?.trim() || null;
  const contactResult = input.contactResult?.trim() || null;
  await db.execute(sql`
    UPDATE scheduling_manual_no_show_actions
    SET status = 'RESOLVED',
        action = 'DISPATCH_RESOLVED_EXCEPTION',
        action_timestamp = ${actionAt},
        contact_attempt = ${contactAttempt},
        contact_result = ${contactResult},
        final_disposition = ${input.disposition},
        note = COALESCE(${note}, note),
        resolved_at = ${actionAt},
        updated_at = ${actionAt}
    WHERE id = ${exception.id} AND status = 'OPEN'
  `);
  const auditShift: Pick<NoShowMonitorRow, "shift_id" | "driver_id" | "account_id" | "shift_start_utc"> = {
    shift_id: exception.wiw_shift_id,
    driver_id: exception.driver_id,
    account_id: exception.account_id,
    shift_start_utc: asDate(exception.shift_start_at, "shift_start_at").toISOString(),
  };
  await insertNoShowHistory({
    exceptionId: exception.id,
    shift: auditShift,
    firstDetectedAt: exception.first_detected_not_clocked_in_at
      ? asDate(exception.first_detected_not_clocked_in_at, "first_detected_not_clocked_in_at")
      : null,
    dispatchUser: input.dispatchUser,
    action: "DISPATCH_RESOLVED_EXCEPTION",
    actionTimestamp: actionAt,
    contactAttempt,
    contactResult,
    finalDisposition: input.disposition,
    notes: note,
  });
  return {
    id: exception.id,
    status: "RESOLVED",
    final_disposition: input.disposition,
    action: "DISPATCH_RESOLVED_EXCEPTION",
    action_timestamp: actionAt,
  };
}