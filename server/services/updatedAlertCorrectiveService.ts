/**
 * One-time corrective "Updated Alert" send for the August 24, 2026 Monday schedule.
 *
 * This deliberately does not share the recurring Saturday 2 PM reminder's delivery
 * key. It has its own driver/date/channel idempotency namespace, its own run for
 * each timezone wave, and records the exact email envelope used for audit.
 */

import { pool } from "../db";
import { randomUUID } from "node:crypto";
import { sendEmail as graphSendEmail, getEffectiveMs365Config } from "./microsoftGraphService";
import { sendBulkSms } from "./communicationsService";

const REMINDER_TYPE = "updated_alert_corrective";
const TRIGGER = "updated_alert_corrective";
// Emergency kill switch: this one-time corrective campaign must not send until
// it is deliberately re-enabled after a fresh review of recipients and timing.
const CORRECTIVE_SENDS_ENABLED = false;
const REPORTS_EMAIL = "reports@driverondemand.co";
const EMAIL_BCC = ["Will@driverondemand.co", "dispatch@driverondemand.co"];
const EXPECTED_DRIVER_COUNT = 62;
const EXPECTED_SHIFT_COUNT = 84;

const WAVES = [
  { key: "central", label: "Central", timezones: ["America/Chicago"] },
  { key: "mountain", label: "Mountain", timezones: ["America/Denver", "America/Phoenix"] },
  { key: "pacific", label: "Pacific", timezones: ["America/Los_Angeles"] },
] as const;

type Channel = "sms" | "email";

interface CorrectiveShift {
  driver_id: string;
  driver_name: string;
  driver_classification: string;
  driver_email: string | null;
  phone_normalized: string | null;
  shift_id: string;
  location_id: string | null;
  location_name: string | null;
  account_id: string | null;
  account_name: string | null;
  start_time: Date | string;
  end_time: Date | string;
  scheduling_timezone: string;
}

interface CorrectiveDriver {
  driverId: string;
  driverName: string;
  driverClassification: string;
  driverEmail: string;
  mobile: string;
  timezone: string;
  wave: (typeof WAVES)[number]["key"];
  shifts: CorrectiveShift[];
  hasMissingAccountMapping: boolean;
}

interface RunCounts {
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

interface ChannelResult {
  channel: Channel;
  outcome: "sent" | "failed" | "skipped";
  attempted: boolean;
}

export interface UpdatedAlertPreflight {
  mondayDate: string;
  generatedAt: string;
  expectedDriverCount: number;
  expectedShiftCount: number;
  driverCount: number;
  shiftCount: number;
  waves: Array<{
    key: string;
    label: string;
    timezones: string[];
    drivers: number;
    shifts: number;
    missingEmail: number;
    missingMobile: number;
    missingAccountMappings: string[];
    multipleShiftDrivers: Array<{ driverName: string; shiftCount: number; totalHours: number }>;
  }>;
  blockingIssues: string[];
  warnings: string[];
  driversByWave: Map<string, CorrectiveDriver[]>;
}

export interface UpdatedAlertWaveReport {
  wave: string;
  runId: string;
  timezones: string[];
  actualExecutionStartedAt: string;
  actualExecutionCompletedAt: string;
  driversEligible: number;
  smsSuccessful: number;
  smsFailed: number;
  smsSkipped: number;
  emailSuccessful: number;
  emailFailed: number;
  emailSkipped: number;
  duplicateSendsPrevented: number;
}

function emptyCounts(): RunCounts {
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

function waveForTimezone(timezone: string): (typeof WAVES)[number]["key"] | null {
  return WAVES.find((wave) => wave.timezones.includes(timezone as never))?.key ?? null;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "Driver";
}

function formatDate(mondayDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${mondayDate}T12:00:00Z`));
}

function formatTime(value: Date | string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

function scheduledHours(shift: CorrectiveShift): number {
  return Math.round(((new Date(shift.end_time).getTime() - new Date(shift.start_time).getTime()) / 3_600_000) * 100) / 100;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function accountLabel(shift: CorrectiveShift): string {
  return shift.account_id && shift.account_name?.trim()
    ? shift.account_name.trim()
    : "Account mapping pending";
}

function buildSms(driver: CorrectiveDriver, mondayDate: string): string {
  const lines = [
    "UPDATED ALERT",
    "",
    `Hi ${firstName(driver.driverName)}, we identified an issue with the timing of our earlier Monday schedule reminder. Please use this updated alert as your current schedule reminder.`,
    "",
    formatDate(mondayDate),
    "",
  ];

  for (const shift of driver.shifts) {
    lines.push(accountLabel(shift));
    lines.push(`${formatTime(shift.start_time, driver.timezone)} – ${formatTime(shift.end_time, driver.timezone)}`);
    lines.push("");
  }

  lines.push("If your availability has changed, please reply to this message as soon as possible so Dispatch can make any necessary adjustments.");
  lines.push("");
  lines.push("Thank you for your patience, and we apologize for any confusion.");
  lines.push("");
  lines.push("Driver on Demand");
  return lines.join("\n");
}

function buildEmailHtml(driver: CorrectiveDriver, mondayDate: string): string {
  const rows = driver.shifts.map((shift) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e6e6e6;font-weight:600;">${escapeHtml(accountLabel(shift))}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e6e6e6;">${escapeHtml(formatTime(shift.start_time, driver.timezone))} – ${escapeHtml(formatTime(shift.end_time, driver.timezone))}</td>
    </tr>
  `).join("");

  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Updated Alert — Monday Driving Assignments</title></head>
  <body style="margin:0;padding:0;background:#f5f5f7;font-family:Segoe UI,Arial,sans-serif;color:#252525;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fff;border-radius:8px;overflow:hidden;">
          <tr><td style="background:#1a1a2e;padding:24px 32px;color:#fff;">
            <div style="font-size:22px;font-weight:700;">Driver on Demand</div>
            <div style="font-size:13px;color:#c9ced8;margin-top:4px;">UPDATED ALERT</div>
          </td></tr>
          <tr><td style="padding:32px;">
            <p style="margin:0 0 18px;font-size:16px;">Hello ${escapeHtml(firstName(driver.driverName))},</p>
            <p style="margin:0 0 22px;line-height:1.6;">We identified an issue with the timing of our earlier Monday schedule reminder. Please use this updated alert as your current schedule reminder.</p>
            <p style="margin:0 0 12px;font-size:17px;font-weight:700;">Your Monday Schedule — ${escapeHtml(formatDate(mondayDate))}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6e6e6;border-radius:6px;overflow:hidden;margin:0 0 22px;">
              <tr style="background:#f7f7f9;">
                <th style="padding:10px 12px;text-align:left;font-size:12px;color:#555;">ACCOUNT</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;color:#555;">SHIFT</th>
              </tr>
              ${rows}
            </table>
            <p style="margin:0 0 20px;line-height:1.6;">If your availability has changed, please reply to this email as soon as possible so Dispatch can make any necessary adjustments.</p>
            <p style="margin:0 0 20px;line-height:1.6;">Thank you for your patience, and we apologize for any confusion.</p>
            <p style="margin:0;">Driver on Demand</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

async function getShifts(mondayDate: string, timezones: readonly string[]): Promise<CorrectiveShift[]> {
  const result = await pool.query<CorrectiveShift>(`
    SELECT DISTINCT ON (s.id)
      d.id AS driver_id,
      CONCAT(TRIM(COALESCE(u.first_name, '')), ' ', TRIM(COALESCE(u.last_name, ''))) AS driver_name,
      COALESCE(d.driver_classification, 'IC') AS driver_classification,
      u.email AS driver_email,
      d.mobile_phone_normalized AS phone_normalized,
      s.id AS shift_id,
      l.id AS location_id,
      l.name AS location_name,
      l.account_id,
      c.customer_name AS account_name,
      s.start_time,
      s.end_time,
      COALESCE(NULLIF(l.timezone, ''), NULLIF(c.timezone, '')) AS scheduling_timezone
    FROM wiw_shifts s
    JOIN wiw_users wu ON wu.id = s.wiw_user_id
    JOIN drivers d ON d.id = wu.driver_id
    JOIN users u ON u.id = d.user_id
    LEFT JOIN wiw_locations l ON l.id = s.wiw_location_id
    LEFT JOIN customers c ON c.id = l.account_id
    WHERE (s.start_time AT TIME ZONE COALESCE(NULLIF(l.timezone, ''), NULLIF(c.timezone, '')))::date = $1::date
      AND COALESCE(NULLIF(l.timezone, ''), NULLIF(c.timezone, '')) = ANY($2::text[])
      AND s.status NOT IN ('deleted', 'cancelled')
      AND COALESCE(s.is_open, FALSE) = FALSE
      AND d.driver_type = 'DriverShift'
      AND d.status = 'active'
    ORDER BY s.id, s.start_time
  `, [mondayDate, timezones]);
  return result.rows;
}

function groupDrivers(rows: CorrectiveShift[]): Map<string, CorrectiveDriver[]> {
  const byWave = new Map<string, CorrectiveDriver[]>();
  const byDriver = new Map<string, CorrectiveDriver>();

  for (const shift of rows) {
    const wave = waveForTimezone(shift.scheduling_timezone);
    if (!wave) continue;
    const existing = byDriver.get(shift.driver_id);
    if (existing) {
      if (existing.timezone !== shift.scheduling_timezone) {
        throw new Error(`Driver ${shift.driver_id} has qualifying shifts in multiple corrective timezones.`);
      }
      existing.shifts.push(shift);
      existing.hasMissingAccountMapping ||= !shift.account_id;
      continue;
    }
    const driver: CorrectiveDriver = {
      driverId: shift.driver_id,
      driverName: shift.driver_name.trim(),
      driverClassification: shift.driver_classification,
      driverEmail: shift.driver_email?.trim() ?? "",
      mobile: shift.phone_normalized?.trim() ?? "",
      timezone: shift.scheduling_timezone,
      wave,
      shifts: [shift],
      hasMissingAccountMapping: !shift.account_id,
    };
    byDriver.set(driver.driverId, driver);
    const waveDrivers = byWave.get(wave) ?? [];
    waveDrivers.push(driver);
    byWave.set(wave, waveDrivers);
  }

  for (const drivers of Array.from(byWave.values())) {
    for (const driver of drivers) {
      driver.shifts.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    }
    drivers.sort((a, b) => a.driverName.localeCompare(b.driverName));
  }
  return byWave;
}

function localHour(timezone: string, now = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  }).formatToParts(now).find((part) => part.type === "hour")?.value;
  return Number(hour);
}

function assertWaveTiming(wave: typeof WAVES[number], now = new Date()): void {
  const early = wave.timezones.filter((timezone) => localHour(timezone, now) < 11);
  if (early.length) {
    throw new Error(`Refusing ${wave.label} Updated Alert wave before 11:00 AM local time (${early.join(", ")}).`);
  }
}

export async function getUpdatedAlertCorrectivePreflight(mondayDate: string): Promise<UpdatedAlertPreflight> {
  const targetTimezones = WAVES.flatMap((wave) => wave.timezones);
  const rows = await getShifts(mondayDate, targetTimezones);
  const uniqueRows = Array.from(new Map(rows.map((row) => [row.shift_id, row])).values());
  if (rows.length !== uniqueRows.length) {
    throw new Error("Preflight found duplicate qualifying shift IDs.");
  }

  const driversByWave = groupDrivers(uniqueRows);
  const drivers = Array.from(driversByWave.values()).flat();
  const blockingIssues: string[] = [];
  const warnings: string[] = [];

  if (drivers.length !== EXPECTED_DRIVER_COUNT) {
    blockingIssues.push(`Expected ${EXPECTED_DRIVER_COUNT} eligible drivers, found ${drivers.length}.`);
  }
  if (uniqueRows.length !== EXPECTED_SHIFT_COUNT) {
    blockingIssues.push(`Expected ${EXPECTED_SHIFT_COUNT} qualifying shifts, found ${uniqueRows.length}.`);
  }
  const missingEmail = drivers.filter((driver) => !driver.driverEmail);
  const missingMobile = drivers.filter((driver) => !driver.mobile);
  if (missingEmail.length) blockingIssues.push(`Missing email for ${missingEmail.length} eligible driver(s).`);
  if (missingMobile.length) blockingIssues.push(`Missing mobile for ${missingMobile.length} eligible driver(s).`);
  const missingAccountDrivers = drivers.filter((driver) => driver.hasMissingAccountMapping);
  if (missingAccountDrivers.length) {
    warnings.push(`Account mapping is missing for ${missingAccountDrivers.map((driver) => driver.driverName).join(", ")}; included by explicit approval and rendered as "Account mapping pending".`);
  }

  const ms365 = await getEffectiveMs365Config();
  if (!ms365.tenantId || !ms365.clientId || !ms365.clientSecret || !ms365.senderEmail) {
    blockingIssues.push("Microsoft 365 production email configuration is incomplete.");
  }

  const waves = WAVES.map((wave) => {
    const waveDrivers = driversByWave.get(wave.key) ?? [];
    const waveShifts = waveDrivers.flatMap((driver) => driver.shifts);
    return {
      key: wave.key,
      label: wave.label,
      timezones: [...wave.timezones],
      drivers: waveDrivers.length,
      shifts: waveShifts.length,
      missingEmail: waveDrivers.filter((driver) => !driver.driverEmail).length,
      missingMobile: waveDrivers.filter((driver) => !driver.mobile).length,
      missingAccountMappings: waveDrivers.filter((driver) => driver.hasMissingAccountMapping).map((driver) => driver.driverName),
      multipleShiftDrivers: waveDrivers
        .filter((driver) => driver.shifts.length > 1)
        .map((driver) => ({
          driverName: driver.driverName,
          shiftCount: driver.shifts.length,
          totalHours: driver.shifts.reduce((total, shift) => total + scheduledHours(shift), 0),
        })),
    };
  });

  return {
    mondayDate,
    generatedAt: new Date().toISOString(),
    expectedDriverCount: EXPECTED_DRIVER_COUNT,
    expectedShiftCount: EXPECTED_SHIFT_COUNT,
    driverCount: drivers.length,
    shiftCount: uniqueRows.length,
    waves,
    blockingIssues,
    warnings,
    driversByWave,
  };
}

async function createRun(mondayDate: string, timezones: readonly string[]): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO weekend_monday_reminder_runs
       (id, trigger_source, monday_schedule_date, applicable_timezones)
     VALUES ($1, 'manual', $2::date, $3::text[])`,
    [id, mondayDate, timezones],
  );
  return id;
}

async function finishRun(runId: string, counts: RunCounts, status: "completed" | "failed", error: string | null): Promise<void> {
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
      runId,
    ],
  );
}

async function ensureParent(driver: CorrectiveDriver, mondayDate: string, runId: string): Promise<string> {
  const first = driver.shifts[0];
  const result = await pool.query<{ id: string }>(
    `INSERT INTO weekend_monday_comms
       (driver_id, driver_name, driver_classification, shift_date, shift_id, assignment_id, schedule_id,
        account_name, start_time, end_time, schedule_details, trigger, idempotency_key, run_id, trigger_source,
        applicable_timezone, sms_status, email_status, sender_mailbox)
     VALUES
       ($1, $2, $3, $4::date, $5, NULL, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, 'manual',
        $14, 'pending', 'pending', $15)
     ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
     DO UPDATE SET
       schedule_details = EXCLUDED.schedule_details,
       account_name = EXCLUDED.account_name,
       applicable_timezone = EXCLUDED.applicable_timezone,
       updated_at = NOW()
     RETURNING id`,
    [
      driver.driverId,
      driver.driverName,
      driver.driverClassification,
      mondayDate,
      driver.shifts.length === 1 ? first.shift_id : null,
      driver.shifts.length === 1 ? first.location_id : null,
      Array.from(new Set(driver.shifts.map(accountLabel))).join(" / "),
      driver.shifts.length === 1 ? new Date(first.start_time).toISOString() : null,
      driver.shifts.length === 1 ? new Date(first.end_time).toISOString() : null,
      JSON.stringify({
        correctiveAlert: true,
        emailEnvelope: { from: REPORTS_EMAIL, to: driver.driverEmail, bcc: EMAIL_BCC, cc: [] },
        shifts: driver.shifts.map((shift) => ({
          shiftId: shift.shift_id,
          accountId: shift.account_id,
          accountName: accountLabel(shift),
          locationId: shift.location_id,
          locationName: shift.location_name,
          schedulingTimezone: driver.timezone,
          startUtc: new Date(shift.start_time).toISOString(),
          endUtc: new Date(shift.end_time).toISOString(),
          localStart: formatTime(shift.start_time, driver.timezone),
          localEnd: formatTime(shift.end_time, driver.timezone),
          scheduledHours: scheduledHours(shift),
        })),
      }),
      TRIGGER,
      `${REMINDER_TYPE}:${driver.driverId}:${mondayDate}`,
      runId,
      driver.timezone,
      REPORTS_EMAIL,
    ],
  );
  return result.rows[0].id;
}

async function claimDelivery(
  driverId: string,
  mondayDate: string,
  channel: Channel,
  parentId: string,
  runId: string,
): Promise<{ id: string | null; existingStatus: string | null }> {
  await pool.query(
    `INSERT INTO weekend_monday_driver_deliveries
       (weekend_monday_comm_id, driver_id, monday_date, channel, reminder_type, status, last_run_id, last_trigger_source)
     VALUES ($1, $2, $3::date, $4, $5, 'pending', $6, 'manual')
     ON CONFLICT (driver_id, monday_date, channel, reminder_type) DO NOTHING`,
    [parentId, driverId, mondayDate, channel, REMINDER_TYPE, runId],
  );
  const claimed = await pool.query<{ id: string }>(
    `UPDATE weekend_monday_driver_deliveries
        SET status = 'sending',
            claimed_at = NOW(),
            attempt_count = attempt_count + 1,
            last_run_id = $5,
            last_trigger_source = 'manual',
            weekend_monday_comm_id = $4,
            skip_reason = NULL,
            updated_at = NOW()
      WHERE driver_id = $1
        AND monday_date = $2::date
        AND channel = $3
        AND reminder_type = $6
        AND status IN ('pending', 'failed', 'skipped')
      RETURNING id`,
    [driverId, mondayDate, channel, parentId, runId, REMINDER_TYPE],
  );
  if (claimed.rows[0]) return { id: claimed.rows[0].id, existingStatus: null };
  const existing = await pool.query<{ status: string }>(
    `SELECT status
       FROM weekend_monday_driver_deliveries
      WHERE driver_id = $1 AND monday_date = $2::date AND channel = $3 AND reminder_type = $4`,
    [driverId, mondayDate, channel, REMINDER_TYPE],
  );
  return { id: null, existingStatus: existing.rows[0]?.status ?? "unknown" };
}

async function completeDelivery(
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

async function recordAttempt(
  runId: string,
  parentId: string,
  driverId: string,
  mondayDate: string,
  channel: Channel,
  outcome: "sent" | "failed" | "skipped",
  deliveryId: string | null,
  options: { skipReason?: string; externalId?: string | null; error?: string | null } = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO weekend_monday_reminder_attempts
       (run_id, delivery_id, weekend_monday_comm_id, driver_id, monday_date, channel, outcome, skip_reason, external_id, error)
     VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10)`,
    [
      runId,
      deliveryId,
      parentId,
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

async function syncParent(parentId: string, driverId: string, mondayDate: string): Promise<void> {
  const result = await pool.query<{
    channel: Channel;
    status: string;
    sent_at: Date | null;
    external_id: string | null;
    error: string | null;
    last_run_id: string | null;
  }>(
    `SELECT channel, status, sent_at, external_id, error, last_run_id
       FROM weekend_monday_driver_deliveries
      WHERE driver_id = $1 AND monday_date = $2::date AND reminder_type = $3`,
    [driverId, mondayDate, REMINDER_TYPE],
  );
  const byChannel = new Map(result.rows.map((row) => [row.channel, row]));
  const sms = byChannel.get("sms");
  const email = byChannel.get("email");
  await pool.query(
    `UPDATE weekend_monday_comms
        SET sms_sent = $1, sms_sent_at = $2, sms_status = $3, sms_external_id = $4, sms_error = $5, sms_run_id = $6,
            email_sent = $7, email_sent_at = $8, email_status = $9, email_external_id = $10, email_error = $11, email_run_id = $12,
            updated_at = NOW()
      WHERE id = $13`,
    [
      sms?.status === "sent", sms?.sent_at ?? null, sms?.status ?? "pending", sms?.external_id ?? null, sms?.error ?? null, sms?.last_run_id ?? null,
      email?.status === "sent", email?.sent_at ?? null, email?.status ?? "pending", email?.external_id ?? null, email?.error ?? null, email?.last_run_id ?? null,
      parentId,
    ],
  );
}

function countChannelResult(counts: RunCounts, result: ChannelResult): void {
  if (result.channel === "sms") {
    if (result.attempted) counts.smsAttempted++;
    if (result.outcome === "sent") counts.smsSuccessful++;
    else if (result.outcome === "failed") counts.smsFailed++;
    else counts.smsSkipped++;
    return;
  }

  if (result.attempted) counts.emailAttempted++;
  if (result.outcome === "sent") counts.emailSuccessful++;
  else if (result.outcome === "failed") counts.emailFailed++;
  else counts.emailSkipped++;
}

async function sendDriver(driver: CorrectiveDriver, mondayDate: string, runId: string): Promise<ChannelResult[]> {
  const parentId = await ensureParent(driver, mondayDate, runId);
  const results: ChannelResult[] = [];

  for (const channel of ["sms", "email"] as const) {
    const claim = await claimDelivery(driver.driverId, mondayDate, channel, parentId, runId);
    if (!claim.id) {
      const reason = claim.existingStatus === "sent"
        ? "Updated Alert Already Sent"
        : claim.existingStatus === "sending"
          ? "Updated Alert Already In Progress"
          : "Updated Alert Not Claimable";
      await recordAttempt(runId, parentId, driver.driverId, mondayDate, channel, "skipped", null, { skipReason: reason });
      results.push({ channel, outcome: "skipped", attempted: false });
      continue;
    }

    try {
      if (channel === "sms") {
        const sms = await sendBulkSms({
          accountId: null,
          driverIds: [driver.driverId],
          message: buildSms(driver, mondayDate),
          sentByUserId: null,
          contextModule: TRIGGER,
          contextEntityId: parentId,
        });
        const recipient = sms.recipientResults[0];
        const sent = recipient?.status === "sent";
        const error = recipient?.error ?? (sent ? null : `SMS delivery status: ${recipient?.status ?? "no recipient result"}`);
        await completeDelivery(claim.id, sent ? "sent" : "failed", recipient?.externalMessageId ?? null, error);
        await recordAttempt(runId, parentId, driver.driverId, mondayDate, channel, sent ? "sent" : "failed", claim.id, {
          externalId: recipient?.externalMessageId ?? null,
          error,
        });
        results.push({ channel, outcome: sent ? "sent" : "failed", attempted: true });
      } else {
        const email = await graphSendEmail({
          to: [driver.driverEmail],
          bcc: EMAIL_BCC,
          subject: "Updated Alert — Monday Driving Assignments",
          bodyHtml: buildEmailHtml(driver, mondayDate),
          fromEmail: REPORTS_EMAIL,
        });
        const sent = email.ok;
        await completeDelivery(claim.id, sent ? "sent" : "failed", null, email.error ?? null);
        await recordAttempt(runId, parentId, driver.driverId, mondayDate, channel, sent ? "sent" : "failed", claim.id, {
          error: email.error ?? null,
        });
        results.push({ channel, outcome: sent ? "sent" : "failed", attempted: true });
      }
    } catch (error: any) {
      const message = error?.message ?? String(error);
      await completeDelivery(claim.id, "failed", null, message);
      await recordAttempt(runId, parentId, driver.driverId, mondayDate, channel, "failed", claim.id, { error: message });
      results.push({ channel, outcome: "failed", attempted: true });
    }
  }

  await syncParent(parentId, driver.driverId, mondayDate);
  return results;
}

async function readWaveReport(
  wave: typeof WAVES[number],
  runId: string,
): Promise<UpdatedAlertWaveReport> {
  const run = await pool.query<{
    execution_started_at: Date;
    execution_completed_at: Date;
    drivers_eligible: number;
    sms_successful: number;
    sms_failed: number;
    sms_skipped: number;
    email_successful: number;
    email_failed: number;
    email_skipped: number;
  }>(
    `SELECT execution_started_at, execution_completed_at, drivers_eligible,
            sms_successful, sms_failed, sms_skipped, email_successful, email_failed, email_skipped
       FROM weekend_monday_reminder_runs WHERE id = $1`,
    [runId],
  );
  const row = run.rows[0];
  return {
    wave: wave.label,
    runId,
    timezones: [...wave.timezones],
    actualExecutionStartedAt: row.execution_started_at.toISOString(),
    actualExecutionCompletedAt: row.execution_completed_at.toISOString(),
    driversEligible: row.drivers_eligible,
    smsSuccessful: row.sms_successful,
    smsFailed: row.sms_failed,
    smsSkipped: row.sms_skipped,
    emailSuccessful: row.email_successful,
    emailFailed: row.email_failed,
    emailSkipped: row.email_skipped,
    duplicateSendsPrevented: row.sms_skipped + row.email_skipped,
  };
}

/**
 * Runs the approved production corrective communication immediately, in
 * Central → Mountain → Pacific order. This function has a hard preflight and
 * checks local time before each wave. It does not alter recurring scheduling.
 */
export async function runUpdatedAlertCorrectiveSend(mondayDate: string): Promise<{
  preflight: Omit<UpdatedAlertPreflight, "driversByWave">;
  waves: UpdatedAlertWaveReport[];
}> {
  if (!CORRECTIVE_SENDS_ENABLED) {
    throw new Error("Updated Alert corrective sends are disabled.");
  }
  const preflight = await getUpdatedAlertCorrectivePreflight(mondayDate);
  if (preflight.blockingIssues.length) {
    throw new Error(`Updated Alert preflight blocked: ${preflight.blockingIssues.join(" ")}`);
  }

  const reports: UpdatedAlertWaveReport[] = [];
  for (const wave of WAVES) {
    assertWaveTiming(wave);
    const runId = await createRun(mondayDate, wave.timezones);
    const counts = emptyCounts();
    const errors: string[] = [];
    const drivers = preflight.driversByWave.get(wave.key) ?? [];
    counts.driversEvaluated = drivers.length;
    counts.driversEligible = drivers.length;

    try {
      for (const driver of drivers) {
        try {
          const results = await sendDriver(driver, mondayDate, runId);
          results.forEach((result) => countChannelResult(counts, result));
        } catch (error: any) {
          errors.push(`${driver.driverId}: ${error?.message ?? String(error)}`);
        }
      }
      await finishRun(runId, counts, errors.length ? "failed" : "completed", errors.join("\n") || null);
    } catch (error: any) {
      await finishRun(runId, counts, "failed", error?.message ?? String(error));
      throw error;
    }
    reports.push(await readWaveReport(wave, runId));
  }

  const { driversByWave: _driversByWave, ...serializablePreflight } = preflight;
  return { preflight: serializablePreflight, waves: reports };
}