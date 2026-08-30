/**
 * Weekend Monday Reminder Service (DH-002053)
 *
 * Polls on Saturdays and sends one SMS + one email at 2:00 PM in each driver's
 * authoritative WIW/account scheduling timezone. All qualifying Monday shifts
 * are consolidated into that driver's individual communication.
 *
 * SMS  → Heymarket, individually to each driver
 * Email → Microsoft Graph (reports@driverondemand.co), individually to each driver
 */

import { pool, db } from "../db";
import { weekendMondayComms } from "../../shared/schema";
import { sendEmail as graphSendEmail } from "./microsoftGraphService";
import { sendBulkSms } from "./communicationsService";
import { randomUUID } from "node:crypto";

const REPORTS_EMAIL = "reports@driverondemand.co";
const EMAIL_DISPATCH_SIGNATURE = "Driver on Demand Dispatch";
const UAT_TEST_RECIPIENT = "Will@driverondemand.co";
const REMINDER_TYPE = "weekend_monday_reminder";

// ── Date helpers ───────────────────────────────────────────────────────────────

function isValidIanaTimezone(value: string | null | undefined): value is string {
  if (!value?.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function localDateParts(date: Date, timezone: string): { weekday: string; date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return {
    weekday: part("weekday"),
    date: `${part("year")}-${part("month")}-${part("day")}`,
    hour: Number(part("hour")),
  };
}

/** Returns the upcoming Monday date in the supplied scheduling timezone. */
function getUpcomingMonday(timezone: string, from: Date = new Date()): string {
  const local = localDateParts(from, timezone);
  const date = new Date(`${local.date}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 2);
  return date.toISOString().slice(0, 10);
}

export function getWeekendReminderExpectedSendAt(mondayDate: string, timezone: string): Date {
  const saturday = new Date(`${mondayDate}T12:00:00Z`);
  saturday.setUTCDate(saturday.getUTCDate() - 2);
  const date = saturday.toISOString().slice(0, 10);
  const offsetName = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(`${date}T20:00:00Z`)).find((part) => part.type === "timeZoneName")?.value;
  if (!offsetName || offsetName === "GMT") {
    return new Date(`${date}T14:00:00Z`);
  }
  const match = offsetName.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) return new Date(`${date}T14:00:00Z`);
  const offsetMinutes = (Number(match[2]) * 60 + Number(match[3])) * (match[1] === "+" ? 1 : -1);
  return new Date(Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    14,
    0,
  ) - offsetMinutes * 60_000);
}

/** Format a source WIW local-time value such as "Mon, 24 Aug 2026 07:00:00 -0400". */
function fmtWiwSourceTime(sourceTime?: string | null): string | null {
  if (!sourceTime) return null;
  const match = sourceTime.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s[+-]\d{4}\s*$/);
  if (!match) return null;
  const hour24 = Number(match[1]);
  const minute = match[2];
  if (!Number.isInteger(hour24) || hour24 < 0 || hour24 > 23) return null;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute} ${suffix}`;
}

/** Format a timestamp as "8:00 AM", preserving WIW's displayed shift time when available. */
function fmtTime(ts: Date | string, sourceTime?: string | null, timezone?: string): string {
  const sourceDisplayTime = fmtWiwSourceTime(sourceTime);
  if (sourceDisplayTime) return sourceDisplayTime;
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });
}

/** Format date as "Monday, August 11, 2025" */
function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year:    "numeric",
    month:   "long",
    day:     "numeric",
    timeZone: "UTC",
  });
}

// ── Query ─────────────────────────────────────────────────────────────────────

interface MondayShiftRow {
  driver_id:             string;
  driver_name:           string;
  driver_classification: string;
  driver_email:          string | null;
  phone_normalized:      string | null;
  shift_id:              string;
  assignment_id:         string;
  schedule_id:           string;
  account_name:          string;
  start_time:            Date | string;
  end_time:              Date | string;
  source_start_time:     string | null;
  source_end_time:       string | null;
  scheduling_timezone:   string;
}

async function getSchedulingTimezones(): Promise<string[]> {
  const result = await pool.query<{ scheduling_timezone: string | null }>(`
    SELECT DISTINCT COALESCE(NULLIF(l.timezone, ''), NULLIF(c.timezone, '')) AS scheduling_timezone
      FROM wiw_locations l
      LEFT JOIN customers c ON c.id = l.account_id
  `);
  return Array.from(new Set(
    result.rows
      .map((row) => row.scheduling_timezone?.trim() ?? "")
      .filter(isValidIanaTimezone),
  ));
}

export function isWeekendReminderDue(timezone: string, now: Date = new Date()): boolean {
  const local = localDateParts(now, timezone);
  return local.weekday === "Sat" && local.hour >= 14;
}

function zonesReadyForSaturdayTwoPm(timezones: string[], now: Date): string[] {
  return timezones.filter((timezone) => {
    return isWeekendReminderDue(timezone, now);
  });
}

async function getMondayShifts(mondayDate: string, timezone: string): Promise<MondayShiftRow[]> {
  // Use the canonical WIW sync tables as the authoritative source.
  // Filter:  shift falls on mondayDate in the canonical WIW/account timezone
  //          shift is assigned and not deleted/cancelled
  //          drivers.driver_type = 'DriverShift'
   //          drivers.status = 'active' — only currently active drivers qualify
  const result = await pool.query<MondayShiftRow>(`
    SELECT DISTINCT ON (s.id)
      d.id                                                    AS driver_id,
      CONCAT(TRIM(COALESCE(u.first_name, '')), ' ', TRIM(COALESCE(u.last_name, '')))
                                                              AS driver_name,
      COALESCE(d.driver_classification, 'IC')                AS driver_classification,
      u.email                                                 AS driver_email,
      d.mobile_phone_normalized                               AS phone_normalized,
      s.id                                                    AS shift_id,
      NULL::varchar                                           AS assignment_id,
      l.id                                                    AS schedule_id,
      COALESCE(c.customer_name, l.name, 'Unknown')            AS account_name,
      s.start_time,
      s.end_time,
      s.raw_payload->>'start_time'                            AS source_start_time,
       s.raw_payload->>'end_time'                              AS source_end_time,
       COALESCE(NULLIF(l.timezone, ''), NULLIF(c.timezone, '')) AS scheduling_timezone
    FROM wiw_shifts s
    JOIN wiw_users  wu ON wu.id = s.wiw_user_id
    JOIN drivers     d  ON d.id = wu.driver_id
    LEFT JOIN users  u  ON u.id = d.user_id
    LEFT JOIN wiw_locations l ON l.id = s.wiw_location_id
    LEFT JOIN customers c ON c.id = l.account_id
     WHERE (s.start_time AT TIME ZONE $2)::date = $1::date
       AND COALESCE(NULLIF(l.timezone, ''), NULLIF(c.timezone, '')) = $2
      AND s.status NOT IN ('deleted', 'cancelled')
      AND COALESCE(s.is_open, FALSE) = FALSE
      AND d.driver_type      = 'DriverShift'
       AND d.status = 'active'
    ORDER BY s.id, s.start_time
  `, [mondayDate, timezone]);
  return result.rows;
}

// ── Message builders ───────────────────────────────────────────────────────────

function buildSmsBody(firstName: string, shifts: MondayShiftRow[]): string {
  const lines: string[] = [
    `Hello ${firstName},`,
    "",
    "This is a courtesy reminder of your upcoming driving assignments for Monday.",
    "",
    "Monday Schedule",
    "",
  ];
  for (const s of shifts) {
    lines.push(s.account_name);
    lines.push(`${fmtTime(s.start_time, s.source_start_time, s.scheduling_timezone)} – ${fmtTime(s.end_time, s.source_end_time, s.scheduling_timezone)}`);
    lines.push("");
  }
  lines.push("If your availability has changed, please reply to this text as soon as possible so Dispatch can make any necessary adjustments.");
  lines.push("");
  lines.push(`Thank you,`);
  lines.push("");
  return lines.join("\n");
}

function buildEmailHtml(driverName: string, mondayDateStr: string, shifts: MondayShiftRow[]): string {
  const mondayLabel = fmtDate(mondayDateStr);
  const shiftRows = shifts.map(s => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-weight:600;color:#1a1a2e;">${s.account_name}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;color:#444;">${fmtTime(s.start_time, s.source_start_time, s.scheduling_timezone)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;color:#444;">${fmtTime(s.end_time, s.source_end_time, s.scheduling_timezone)}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Courtesy Reminder – Monday Driving Assignments</title></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#1a1a2e;padding:24px 32px;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Driver on Demand</p>
            <p style="margin:4px 0 0;font-size:13px;color:#a0aec0;">Dispatch Operations</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1a1a2e;">Courtesy Reminder</p>
            <p style="margin:0 0 24px;font-size:15px;color:#555;">Hi ${driverName},</p>
            <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.6;">
              This is a courtesy reminder of your upcoming driving assignments for <strong>${mondayLabel}</strong>.
              Please review your schedule below.
            </p>
            <!-- Schedule table -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;margin-bottom:24px;">
              <tr style="background:#f8f8fa;">
                <th style="padding:10px 12px;text-align:left;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e8e8e8;">Account</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e8e8e8;">Start</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e8e8e8;">End</th>
              </tr>
              ${shiftRows}
            </table>
            <!-- CTA -->
            <div style="background:#fff8f0;border-left:4px solid #ff6b35;padding:16px 20px;border-radius:0 6px 6px 0;margin-bottom:24px;">
              <p style="margin:0;font-size:14px;color:#444;line-height:1.6;">
                <strong>If your availability has changed</strong>, please reply to this email or contact Dispatch
                as soon as possible so we can make any necessary adjustments before Monday.
              </p>
            </div>
            <p style="margin:0;font-size:14px;color:#666;">Thank you for your continued partnership.</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8f8fa;padding:20px 32px;border-top:1px solid #eee;">
            <p style="margin:0;font-size:13px;color:#888;">${EMAIL_DISPATCH_SIGNATURE}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#aaa;">This is an automated courtesy communication from DriverHub.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildScheduleDetails(shifts: MondayShiftRow[]) {
  return shifts.map((shift) => ({
    shiftId: shift.shift_id,
    assignmentId: shift.assignment_id,
    scheduleId: shift.schedule_id,
    accountName: shift.account_name,
    schedulingTimezone: shift.scheduling_timezone,
    startTime: new Date(shift.start_time).toISOString(),
    endTime: new Date(shift.end_time).toISOString(),
  }));
}

async function getMondayShiftsAcrossTimezones(mondayDate: string): Promise<MondayShiftRow[]> {
  const timezones = await getSchedulingTimezones();
  const batches = await Promise.all(timezones.map((timezone) => getMondayShifts(mondayDate, timezone)));
  return Array.from(new Map(batches.flat().map((shift) => [shift.shift_id, shift])).values());
}

// ── Per-driver-cycle, per-channel durable delivery ───────────────────────────────

type ReminderChannel = "sms" | "email";

interface ClaimedDelivery {
  id: string;
  channel: ReminderChannel;
}

interface ReminderRunContext {
  id: string;
  source: "scheduler" | "manual";
  mondayDate: string;
  applicableTimezones: string[];
}

interface ExistingDelivery {
  id: string;
  status: string;
}

interface ChannelResult {
  channel: ReminderChannel;
  outcome: "sent" | "failed" | "skipped";
  attempted: boolean;
}

interface ReminderRunCounts {
  driversEvaluated: number;
  driversEligible: number;
  smsAttempted: number;
  smsSuccessful: number;
  smsFailed: number;
  smsSkipped: number;
  emailAttempted: number;
  emailSuccessful: number;
  emailFailed: number;
  emailSkipped: number;
}

function emptyRunCounts(): ReminderRunCounts {
  return {
    driversEvaluated: 0,
    driversEligible: 0,
    smsAttempted: 0,
    smsSuccessful: 0,
    smsFailed: 0,
    smsSkipped: 0,
    emailAttempted: 0,
    emailSuccessful: 0,
    emailFailed: 0,
    emailSkipped: 0,
  };
}

function reminderParentKey(driverId: string, mondayDate: string): string {
  return `${REMINDER_TYPE}:${driverId}:${mondayDate}`;
}

async function createReminderRun(run: ReminderRunContext): Promise<void> {
  await pool.query(
    `INSERT INTO weekend_monday_reminder_runs
       (id, trigger_source, monday_schedule_date, applicable_timezones)
     VALUES ($1, $2, $3::date, $4::text[])`,
    [run.id, run.source, run.mondayDate, run.applicableTimezones],
  );
}

async function finishReminderRun(
  run: ReminderRunContext,
  counts: ReminderRunCounts,
  status: "completed" | "failed",
  error: string | null = null,
): Promise<void> {
  await pool.query(
    `UPDATE weekend_monday_reminder_runs
        SET status = $1,
            execution_completed_at = NOW(),
            drivers_evaluated = $2,
            drivers_eligible = $3,
            sms_attempted = $4,
            sms_successful = $5,
            sms_failed = $6,
            sms_skipped = $7,
            email_attempted = $8,
            email_successful = $9,
            email_failed = $10,
            email_skipped = $11,
            error = $12
      WHERE id = $13`,
    [
      status,
      counts.driversEvaluated,
      counts.driversEligible,
      counts.smsAttempted,
      counts.smsSuccessful,
      counts.smsFailed,
      counts.smsSkipped,
      counts.emailAttempted,
      counts.emailSuccessful,
      counts.emailFailed,
      counts.emailSkipped,
      error,
      run.id,
    ],
  );
}

/**
 * Atomically claim one driver-cycle/channel. A successful cycle record is never
 * claimable again. "sending" is intentionally not retried automatically: a
 * process may have reached the provider before crashing.
 */
async function claimReminderDelivery(
  driverId: string,
  mondayDate: string,
  channel: ReminderChannel,
  commId: string,
  run: ReminderRunContext,
): Promise<{ claim: ClaimedDelivery | null; existing: ExistingDelivery }> {
  await pool.query(
    `INSERT INTO weekend_monday_driver_deliveries
       (weekend_monday_comm_id, driver_id, monday_date, channel, reminder_type, status, last_run_id, last_trigger_source)
     VALUES ($1, $2, $3::date, $4, $5, 'pending', $6, $7)
      ON CONFLICT (driver_id, monday_date, channel, reminder_type) DO NOTHING`,
    [commId, driverId, mondayDate, channel, REMINDER_TYPE, run.id, run.source],
  );

  const claimed = await pool.query<{ id: string }>(
    `UPDATE weekend_monday_driver_deliveries
        SET status = 'sending',
            claimed_at = NOW(),
            attempt_count = attempt_count + 1,
             last_run_id = $6,
             last_trigger_source = $7,
             weekend_monday_comm_id = $5,
             skip_reason = NULL,
            updated_at = NOW()
       WHERE driver_id = $1
         AND monday_date = $2::date
         AND channel = $3
         AND reminder_type = $4
        AND status IN ('pending', 'failed', 'skipped')
      RETURNING id`,
    [driverId, mondayDate, channel, REMINDER_TYPE, commId, run.id, run.source],
  );

  if (claimed.rows[0]) {
    return { claim: { id: claimed.rows[0].id, channel }, existing: { id: claimed.rows[0].id, status: "sending" } };
  }

  const existing = await pool.query<ExistingDelivery>(
    `SELECT id, status
       FROM weekend_monday_driver_deliveries
      WHERE driver_id = $1
        AND monday_date = $2::date
        AND channel = $3
        AND reminder_type = $4`,
    [driverId, mondayDate, channel, REMINDER_TYPE],
  );
  return {
    claim: null,
    existing: existing.rows[0] ?? { id: "", status: "unknown" },
  };
}

async function ensureReminderLog(
  shifts: MondayShiftRow[],
  mondayDate: string,
  run: ReminderRunContext,
): Promise<string> {
  const firstShift = shifts[0];
  const driverName = firstShift.driver_name.trim() || "Driver";
  const hasOneShift = shifts.length === 1;
  const accountNames = Array.from(new Set(shifts.map((shift) => shift.account_name))).join(" / ");
  const result = await pool.query<{ id: string }>(
    `INSERT INTO weekend_monday_comms
       (driver_id, driver_name, driver_classification, shift_date, shift_id,
        assignment_id, schedule_id, account_name, start_time, end_time,
         schedule_details, trigger, idempotency_key, run_id, trigger_source,
         applicable_timezone, expected_send_at, sms_status, email_status, sender_mailbox)
     VALUES
       ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13,
         $14, $15, $16, $17, 'pending', 'pending', $18)
     ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
     DO UPDATE SET
       driver_name = EXCLUDED.driver_name,
       driver_classification = EXCLUDED.driver_classification,
       account_name = EXCLUDED.account_name,
       start_time = EXCLUDED.start_time,
       end_time = EXCLUDED.end_time,
       schedule_details = EXCLUDED.schedule_details,
        applicable_timezone = EXCLUDED.applicable_timezone,
        expected_send_at = EXCLUDED.expected_send_at,
       updated_at = NOW()
     RETURNING id`,
    [
      firstShift.driver_id,
      driverName,
      firstShift.driver_classification,
      mondayDate,
      hasOneShift ? firstShift.shift_id : null,
      hasOneShift ? firstShift.assignment_id : null,
      hasOneShift ? firstShift.schedule_id : null,
      accountNames,
      hasOneShift ? new Date(firstShift.start_time).toISOString() : null,
      hasOneShift ? new Date(firstShift.end_time).toISOString() : null,
      JSON.stringify(buildScheduleDetails(shifts)),
      REMINDER_TYPE,
      reminderParentKey(firstShift.driver_id, mondayDate),
      run.id,
      run.source,
      firstShift.scheduling_timezone,
      getWeekendReminderExpectedSendAt(mondayDate, firstShift.scheduling_timezone).toISOString(),
      REPORTS_EMAIL,
    ],
  );
  return result.rows[0].id;
}

async function finishReminderDelivery(
  deliveryId: string,
  status: "sent" | "failed" | "skipped",
  externalId: string | null,
  error: string | null,
  skipReason: string | null = null,
): Promise<void> {
  await pool.query(
    `UPDATE weekend_monday_driver_deliveries
        SET status = $1,
            sent_at = CASE WHEN $1 = 'sent' THEN NOW() ELSE NULL END,
            failed_at = CASE WHEN $1 = 'failed' THEN NOW() ELSE NULL END,
            external_id = $2,
            error = $3,
            skip_reason = $4,
            updated_at = NOW()
      WHERE id = $5`,
    [status, externalId, error, skipReason, deliveryId],
  );
}

async function recordReminderAttempt(
  run: ReminderRunContext,
  driverId: string,
  mondayDate: string,
  channel: ReminderChannel,
  outcome: "sent" | "failed" | "skipped",
  deliveryId: string | null,
  commId: string,
  options: { skipReason?: string | null; externalId?: string | null; error?: string | null } = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO weekend_monday_reminder_attempts
       (run_id, delivery_id, weekend_monday_comm_id, driver_id, monday_date, channel, outcome, skip_reason, external_id, error)
     VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10)`,
    [
      run.id,
      deliveryId,
      commId,
      driverId,
      mondayDate,
      channel,
      outcome,
      options.skipReason ?? null,
      options.externalId ?? null,
      options.error ?? null,
    ],
  );
}

async function syncReminderLogChannels(commId: string, driverId: string, mondayDate: string): Promise<void> {
  const deliveries = await pool.query<{
    channel: ReminderChannel;
    status: string;
    sent_at: Date | null;
    external_id: string | null;
    error: string | null;
    last_run_id: string | null;
  }>(
    `SELECT channel, status, sent_at, external_id, error
            , last_run_id
       FROM weekend_monday_driver_deliveries
      WHERE driver_id = $1
         AND monday_date = $2::date
        AND reminder_type = $3`,
    [driverId, mondayDate, REMINDER_TYPE],
  );
  const byChannel = new Map(deliveries.rows.map((delivery) => [delivery.channel, delivery]));
  const sms = byChannel.get("sms");
  const email = byChannel.get("email");

  await pool.query(
    `UPDATE weekend_monday_comms
        SET sms_sent = $1,
            sms_sent_at = $2,
            sms_status = $3,
            sms_external_id = $4,
            sms_error = $5,
            email_sent = $6,
            email_sent_at = $7,
            email_status = $8,
            email_external_id = $9,
            email_error = $10,
             sms_run_id = $11,
             email_run_id = $12,
             updated_at = NOW()
       WHERE id = $13`,
    [
      sms?.status === "sent",
      sms?.sent_at ?? null,
      sms?.status ?? "pending",
      sms?.external_id ?? null,
      sms?.error ?? null,
      email?.status === "sent",
      email?.sent_at ?? null,
      email?.status ?? "pending",
      email?.external_id ?? null,
      email?.error ?? null,
      sms?.last_run_id ?? null,
      email?.last_run_id ?? null,
      commId,
    ],
  );
}

function incrementChannelCounts(counts: ReminderRunCounts, result: ChannelResult): void {
  if (result.channel === "sms") {
    if (result.attempted) counts.smsAttempted++;
    if (result.outcome === "sent") counts.smsSuccessful++;
    else if (result.outcome === "failed") counts.smsFailed++;
    else counts.smsSkipped++;
  } else {
    if (result.attempted) counts.emailAttempted++;
    if (result.outcome === "sent") counts.emailSuccessful++;
    else if (result.outcome === "failed") counts.emailFailed++;
    else counts.emailSkipped++;
  }
}

async function sendReminderForDriver(
  shifts: MondayShiftRow[],
  mondayDate: string,
  run: ReminderRunContext,
): Promise<ChannelResult[]> {
  const firstShift = shifts[0];
  const commId = await ensureReminderLog(shifts, mondayDate, run);
  const driverName = firstShift.driver_name.trim() || "Driver";
  const smsBody = buildSmsBody(driverName.split(" ")[0] || driverName, shifts);
  const emailHtml = buildEmailHtml(driverName, mondayDate, shifts);
  const results: ChannelResult[] = [];

  for (const channel of ["sms", "email"] as const) {
    const { claim, existing } = await claimReminderDelivery(
      firstShift.driver_id,
      mondayDate,
      channel,
      commId,
      run,
    );
    if (!claim) {
      const skipReason = existing.status === "sent"
        ? "already_sent"
        : existing.status === "sending"
          ? "already_in_progress"
          : existing.status === "skipped"
            ? "already_skipped"
            : "not_claimable";
      await recordReminderAttempt(run, firstShift.driver_id, mondayDate, channel, "skipped", existing.id || null, commId, { skipReason });
      results.push({ channel, outcome: "skipped", attempted: false });
      continue;
    }

    if (channel === "sms") {
      if (!firstShift.phone_normalized) {
        await finishReminderDelivery(claim.id, "skipped", null, "no_phone", "no_phone");
        await recordReminderAttempt(run, firstShift.driver_id, mondayDate, channel, "skipped", claim.id, commId, { skipReason: "no_phone" });
        results.push({ channel, outcome: "skipped", attempted: false });
        continue;
      }
      try {
        const smsResult = await sendBulkSms({
          accountId: null,
          driverIds: [firstShift.driver_id],
          message: smsBody,
          sentByUserId: null,
          contextModule: REMINDER_TYPE,
          contextEntityId: commId,
        });
        const recipient = smsResult.recipientResults[0];
        const sent = recipient?.status === "sent";
        await finishReminderDelivery(
          claim.id,
          sent ? "sent" : "failed",
          recipient?.externalMessageId ?? null,
          recipient?.error ?? (sent ? null : `SMS delivery status: ${recipient?.status ?? "no recipient result"}`),
        );
        await recordReminderAttempt(
          run,
          firstShift.driver_id,
          mondayDate,
          channel,
          sent ? "sent" : "failed",
          claim.id,
          commId,
          {
            externalId: recipient?.externalMessageId ?? null,
            error: recipient?.error ?? (sent ? null : `SMS delivery status: ${recipient?.status ?? "no recipient result"}`),
          },
        );
        results.push({ channel, outcome: sent ? "sent" : "failed", attempted: true });
      } catch (error: any) {
        const message = error?.message ?? String(error);
        await finishReminderDelivery(claim.id, "failed", null, message);
        await recordReminderAttempt(run, firstShift.driver_id, mondayDate, channel, "failed", claim.id, commId, { error: message });
        results.push({ channel, outcome: "failed", attempted: true });
      }
    } else {
      if (!firstShift.driver_email) {
        await finishReminderDelivery(claim.id, "skipped", null, "no_email", "no_email");
        await recordReminderAttempt(run, firstShift.driver_id, mondayDate, channel, "skipped", claim.id, commId, { skipReason: "no_email" });
        results.push({ channel, outcome: "skipped", attempted: false });
        continue;
      }
      try {
        const emailResult = await graphSendEmail({
          to: [firstShift.driver_email],
          subject: "Courtesy Reminder – Monday Driving Assignments",
          bodyHtml: emailHtml,
          fromEmail: REPORTS_EMAIL,
        });
        await finishReminderDelivery(
          claim.id,
          emailResult.ok ? "sent" : "failed",
          null,
          emailResult.error ?? null,
        );
        await recordReminderAttempt(
          run,
          firstShift.driver_id,
          mondayDate,
          channel,
          emailResult.ok ? "sent" : "failed",
          claim.id,
          commId,
          { error: emailResult.error ?? null },
        );
        results.push({ channel, outcome: emailResult.ok ? "sent" : "failed", attempted: true });
      } catch (error: any) {
        const message = error?.message ?? String(error);
        await finishReminderDelivery(claim.id, "failed", null, message);
        await recordReminderAttempt(run, firstShift.driver_id, mondayDate, channel, "failed", claim.id, commId, { error: message });
        results.push({ channel, outcome: "failed", attempted: true });
      }
    }
  }

  await syncReminderLogChannels(commId, firstShift.driver_id, mondayDate);
  console.log(`[WeekendReminder] driver=${firstShift.driver_id} shifts=${shifts.length} channels=${results.map((result) => `${result.channel}:${result.outcome}`).join(",")}`);
  return results;
}

/**
 * Sends the approved controlled UAT email to Will only.
 * This deliberately cannot run the production reminder batch or dispatch SMS.
 */
export async function sendWeekendMondayUatEmail(mondayDate: string): Promise<{
  driverId: string;
  driverName: string;
  mondayDate: string;
  shiftCount: number;
}> {
  const rows = await getMondayShiftsAcrossTimezones(mondayDate);
  const willRows = rows.filter(
    (row) => row.driver_email?.trim().toLowerCase() === UAT_TEST_RECIPIENT.toLowerCase(),
  );
  const driverIds = new Set(willRows.map((row) => row.driver_id));

  if (willRows.length === 0 || driverIds.size !== 1) {
    throw new Error(
      `No single eligible DriverShift schedule was found for ${UAT_TEST_RECIPIENT} on ${mondayDate}.`,
    );
  }

  const firstShift = willRows[0];
  const driverName = firstShift.driver_name.trim() || "Will Walton";
  const emailResult = await graphSendEmail({
    to: [UAT_TEST_RECIPIENT],
    subject: "Courtesy Reminder – Monday Driving Assignments",
    bodyHtml: buildEmailHtml(driverName, mondayDate, willRows),
    fromEmail: REPORTS_EMAIL,
  });

  if (!emailResult.ok) {
    throw new Error(emailResult.error ?? "Microsoft 365 did not confirm the UAT email send.");
  }

  await db.insert(weekendMondayComms).values({
    driverId: firstShift.driver_id,
    driverName,
    driverClassification: firstShift.driver_classification,
    shiftDate: new Date(mondayDate),
    shiftId: willRows.length === 1 ? firstShift.shift_id : undefined,
    assignmentId: willRows.length === 1 ? firstShift.assignment_id : undefined,
    scheduleId: willRows.length === 1 ? firstShift.schedule_id : undefined,
    accountName: willRows.length === 1 ? firstShift.account_name : undefined,
    startTime: willRows.length === 1 ? new Date(firstShift.start_time) : undefined,
    endTime: willRows.length === 1 ? new Date(firstShift.end_time) : undefined,
    scheduleDetails: buildScheduleDetails(willRows),
    trigger: "weekend_monday_reminder_uat",
    smsSent: false,
    smsStatus: "not_sent_uat",
    emailSent: true,
    emailSentAt: new Date(),
    emailStatus: "sent",
    senderMailbox: REPORTS_EMAIL,
  } as any);

  console.log(
    `[WeekendReminder:UAT] email-only test sent to ${UAT_TEST_RECIPIENT}; ` +
    `driver=${firstShift.driver_id} shifts=${willRows.length}`,
  );
  return {
    driverId: firstShift.driver_id,
    driverName,
    mondayDate,
    shiftCount: willRows.length,
  };
}

/**
 * Sends the approved controlled UAT SMS to Will only.
 * This deliberately cannot run the production reminder batch or send email.
 */
export async function sendWeekendMondayUatSms(
  mondayDate: string,
  options: { allowResend?: boolean } = {},
): Promise<{
  driverId: string;
  driverName: string;
  mondayDate: string;
  shiftCount: number;
  smsExternalId: string | null;
}> {
  const rows = await getMondayShiftsAcrossTimezones(mondayDate);
  const willRows = rows.filter(
    (row) => row.driver_email?.trim().toLowerCase() === UAT_TEST_RECIPIENT.toLowerCase(),
  );
  const driverIds = new Set(willRows.map((row) => row.driver_id));

  if (willRows.length === 0 || driverIds.size !== 1) {
    throw new Error(
      `No single eligible DriverShift schedule was found for ${UAT_TEST_RECIPIENT} on ${mondayDate}.`,
    );
  }

  const firstShift = willRows[0];
  const driverName = firstShift.driver_name.trim() || "Will Walton";
  const existing = await pool.query<{ sms_sent: boolean }>(
    `SELECT sms_sent
       FROM weekend_monday_comms
      WHERE driver_id = $1
        AND shift_date = $2::date
        AND trigger = 'weekend_monday_reminder_uat'
      ORDER BY created_at DESC
      LIMIT 1`,
    [firstShift.driver_id, mondayDate],
  );
  if (existing.rows[0]?.sms_sent && !options.allowResend) {
    throw new Error("The controlled UAT SMS has already been sent; refusing to send a duplicate.");
  }

  const smsResult = await sendBulkSms({
    accountId: null,
    driverIds: [firstShift.driver_id],
    message: buildSmsBody(driverName.split(" ")[0] || driverName, willRows),
    sentByUserId: null,
    contextModule: "weekend_monday_reminder_uat",
    contextEntityId: firstShift.shift_id,
  });
  const recipient = smsResult.recipientResults[0];
  if (!recipient || recipient.status !== "sent") {
    throw new Error(recipient?.error ?? `Heymarket SMS was not sent (${recipient?.status ?? "no recipient result"}).`);
  }

  if (existing.rows[0]?.sms_sent && options.allowResend) {
    await db.insert(weekendMondayComms).values({
      driverId: firstShift.driver_id,
      driverName,
      driverClassification: firstShift.driver_classification,
      shiftDate: new Date(mondayDate),
      shiftId: willRows.length === 1 ? firstShift.shift_id : undefined,
      assignmentId: willRows.length === 1 ? firstShift.assignment_id : undefined,
      scheduleId: willRows.length === 1 ? firstShift.schedule_id : undefined,
      accountName: willRows.length === 1 ? firstShift.account_name : undefined,
      startTime: willRows.length === 1 ? new Date(firstShift.start_time) : undefined,
      endTime: willRows.length === 1 ? new Date(firstShift.end_time) : undefined,
      scheduleDetails: buildScheduleDetails(willRows),
      trigger: "weekend_monday_reminder_uat",
      smsSent: true,
      smsSentAt: new Date(),
      smsStatus: recipient.status,
      smsExternalId: recipient.externalMessageId,
      emailSent: false,
      emailStatus: "not_sent_uat",
      senderMailbox: REPORTS_EMAIL,
    } as any);
  } else {
    await pool.query(
      `UPDATE weekend_monday_comms
          SET sms_sent = TRUE,
              sms_sent_at = NOW(),
              sms_status = $1,
              sms_external_id = $2,
              sms_error = NULL,
              updated_at = NOW()
        WHERE id = (
          SELECT id
            FROM weekend_monday_comms
           WHERE driver_id = $3
             AND shift_date = $4::date
             AND trigger = 'weekend_monday_reminder_uat'
           ORDER BY created_at DESC
           LIMIT 1
        )`,
      [recipient.status, recipient.externalMessageId, firstShift.driver_id, mondayDate],
    );
  }

  console.log(
    `[WeekendReminder:UAT] SMS-only test sent to ${UAT_TEST_RECIPIENT}; ` +
    `driver=${firstShift.driver_id} shifts=${willRows.length}`,
  );
  return {
    driverId: firstShift.driver_id,
    driverName,
    mondayDate,
    shiftCount: willRows.length,
    smsExternalId: recipient.externalMessageId,
  };
}

// ── Main entry point ───────────────────────────────────────────────────────────

export async function runWeekendMondayReminders(
  overrideMondayDate?: string,
  triggerSource: ReminderRunContext["source"] = "scheduler",
): Promise<{
  runId: string;
  triggerSource: ReminderRunContext["source"];
  mondayDate: string;
  driversFound: number;
  shiftsFound: number;
  applicableTimezones: string[];
  errors: string[];
}> {
  const now = new Date();
  const allTimezones = await getSchedulingTimezones();
  const applicableTimezones = overrideMondayDate
    ? allTimezones
    : zonesReadyForSaturdayTwoPm(allTimezones, now);
  const mondayDate = overrideMondayDate ?? getUpcomingMonday(
    applicableTimezones[0] ?? allTimezones[0] ?? "UTC",
    now,
  );
  const run: ReminderRunContext = {
    id: randomUUID(),
    source: triggerSource,
    mondayDate,
    applicableTimezones,
  };
  console.log(`[WeekendReminder] Starting ${run.source} run=${run.id} for Monday ${mondayDate}`);

  const counts = emptyRunCounts();
  const errors: string[] = [];
  await createReminderRun(run);
  try {
    const rows = Array.from(new Map(
      (await Promise.all(applicableTimezones.map((timezone) => getMondayShifts(mondayDate, timezone))))
        .flat()
        .map((row) => [row.shift_id, row]),
    ).values());
    const shiftsByDriver = new Map<string, MondayShiftRow[]>();
    for (const shift of rows) {
      const grouped = shiftsByDriver.get(shift.driver_id) ?? [];
      grouped.push(shift);
      shiftsByDriver.set(shift.driver_id, grouped);
    }

    counts.driversEvaluated = shiftsByDriver.size;
    counts.driversEligible = shiftsByDriver.size;
    console.log(`[WeekendReminder] Found ${rows.length} unique shift assignments for ${mondayDate} across ${applicableTimezones.join(", ") || "no eligible timezones"}`);

    for (const [driverId, shifts] of Array.from(shiftsByDriver.entries())) {
      try {
        const channelResults = await sendReminderForDriver(shifts, mondayDate, run);
        channelResults.forEach((result) => incrementChannelCounts(counts, result));
      } catch (err: any) {
        const msg = `driver=${driverId}: ${err?.message ?? String(err)}`;
        console.error("[WeekendReminder] Error:", msg);
        errors.push(msg);
      }
    }

    await finishReminderRun(run, counts, errors.length === 0 ? "completed" : "failed", errors.join("\n") || null);
    console.log(`[WeekendReminder] Done — drivers=${counts.driversEligible} shifts=${rows.length} errors=${errors.length}`);
    return {
      runId: run.id,
      triggerSource: run.source,
      mondayDate,
      driversFound: counts.driversEligible,
      shiftsFound: rows.length,
      applicableTimezones,
      errors,
    };
  } catch (error: any) {
    const message = error?.message ?? String(error);
    await finishReminderRun(run, counts, "failed", message);
    throw error;
  }
}
