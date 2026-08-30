/**
 * Weekly Delivery Service  —  Upcoming-Week Schedule Send
 *
 * Runs every hour at :12. For each DriverShift / Hybrid account that has
 * automated delivery enabled:
 *
 * Distribution Rules (both must be true to send):
 *   A. Account Status = Active  (non-Active accounts are logged as skipped, not sent)
 *   B. At least one shift scheduled for the reporting week via wiw_locations.account_id
 *      (zero-shift accounts are logged as skipped, not sent — no empty reports)
 *
 *   1. Timezone-aware scheduling: checks current time in the account's
 *      own timezone against configured send-day + send-time (±30 min).
 *   2. Deduplication: skips accounts already sent successfully this week
 *      (any triggered_by — catches sends made by any service).
 *   3. Recipients: weekly_report_recipients table (TO / CC split),
 *      falls back to legacy email fields if table has no rows.
 *   4. Shift count gate: skips before PDF generation if 0 shifts for the week.
 *   5. Generates the UPCOMING week's schedule PDF (never Excel for this job).
 *   6. Sends via Microsoft Graph with 1 automatic retry.
 *   7. Logs to account_report_logs (triggered_by = 'automated_delivery').
 *   8. Logs to account_report_campaign_runs + account_report_run_deliveries
 *      for Delivery History dashboard visibility.
 *
 * Per-run logging — every due account is logged as one of:
 *   Sent            — Active account with scheduled shifts; email delivered
 *   Skipped         — Account not Active
 *   Skipped         — No scheduled shifts for reporting week
 *   Skipped         — Any other eligibility/config gate (dedup, no recipients, etc.)
 *
 * Dry-run mode: performs all eligibility + recipient resolution checks
 * but skips PDF generation, email send, and logging.
 *
 * Guarantees:
 *  - Per-account isolation — one failure never blocks others.
 *  - Idempotent within a week (dedup via account_report_logs, any trigger).
 *  - PDF only — Excel is never included in this report type.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { sendEmail, isMicrosoftGraphConfigured, assertMs365GlobalPrereqs, assertMailboxOperational, VALID_MAILBOX_PROFILES } from "./microsoftGraphService";
import { getUpcomingWeekBounds } from "./weeklyGenerationService";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DeliveryAccountResult {
  accountId:       string;
  accountName:     string;
  status:          "sent" | "skipped" | "failed" | "dry_run" | "blocked";
  skippedReason?:  string;
  pdfGenerated:    boolean;
  emailStatus:     "success" | "failed" | "skipped" | null;
  emailError?:     string;
  recipients:      string[];
  weekStart:       string;
  weekEnd:         string;
  dryRun:          boolean;
}

export interface DeliveryBatchResult {
  runAt:          string;
  dryRun:         boolean;
  weekStart:      string;
  weekEnd:        string;
  evaluated:      number;
  eligible:       number;
  sent:           number;
  skipped:        number;
  failed:         number;
  accounts:       DeliveryAccountResult[];
  blocked?:       boolean;
  blockedReason?: string;
  blockedChecks?: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

// ── Timezone-aware schedule check ─────────────────────────────────────────────

function isDueForDelivery(account: {
  timezone:         string | null;
  report_send_day:  string | null;
  report_send_time: string | null;
}): boolean {
  const tz = account.timezone?.trim() || "America/Chicago";
  const now = new Date();
  let localDate: Date;
  try {
    localDate = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  } catch {
    localDate = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
  }
  const DAYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const localDayName = DAYS[localDate.getDay()];
  const localMins    = localDate.getHours() * 60 + localDate.getMinutes();
  const configDay    = (account.report_send_day ?? "monday").toLowerCase().trim();
  if (localDayName !== configDay) return false;
  const parts      = (account.report_send_time ?? "08:00").split(":").map(Number);
  const configMins = (parts[0] ?? 8) * 60 + (parts[1] ?? 0);
  return Math.abs(localMins - configMins) <= 30;
}

// ── Deduplication — checks ALL triggered_by values ────────────────────────────
// Any successful delivery for this account/week from ANY service counts as delivered.
// This prevents double-sends when weeklyGenerationService already sent at :08.

async function alreadyDeliveredThisWeek(accountId: string, weekStart: string): Promise<boolean> {
  const rows = await db.execute(sql`
    SELECT id FROM account_report_logs
    WHERE account_id   = ${accountId}
      AND report_week  = ${weekStart}::date
      AND email_status = 'success'
    LIMIT 1
  `);
  return ((rows as any).rows ?? rows).length > 0;
}

// ── Recipients ────────────────────────────────────────────────────────────────

const GLOBAL_CC_EMAIL = "da@driverondemand.co";

async function resolveRecipients(
  accountId: string,
  legacyAcc: any,
): Promise<{ to: string[]; cc: string[] }> {
  const raw = await db.execute(sql`
    SELECT recipient_email, recipient_type
    FROM weekly_report_recipients
    WHERE account_id = ${accountId} AND active = true
    ORDER BY recipient_type, recipient_email
  `);
  const rows: any[] = (raw as any).rows ?? [];
  if (rows.length > 0) {
    const to = rows.filter(r => r.recipient_type === "TO").map(r => r.recipient_email);
    const cc = rows.filter(r => r.recipient_type === "CC").map(r => r.recipient_email);
    if (!to.includes(GLOBAL_CC_EMAIL) && !cc.includes(GLOBAL_CC_EMAIL)) cc.push(GLOBAL_CC_EMAIL);
    return { to, cc };
  }

  let legacyTo: string[] = [];
  try { legacyTo = JSON.parse(legacyAcc.report_primary_emails ?? "[]"); } catch {}
  if (legacyTo.length === 0 && legacyAcc.report_primary_email) legacyTo = [legacyAcc.report_primary_email];
  if (legacyTo.length === 0 && legacyAcc.primary_contact_email) legacyTo = [legacyAcc.primary_contact_email];

  let legacyCc: string[] = [];
  try { legacyCc = JSON.parse(legacyAcc.report_cc_emails ?? "[]"); } catch {}

  if (!legacyTo.includes(GLOBAL_CC_EMAIL) && !legacyCc.includes(GLOBAL_CC_EMAIL)) {
    legacyCc.push(GLOBAL_CC_EMAIL);
  }
  return { to: legacyTo, cc: legacyCc };
}

// ── Write to account_report_logs ──────────────────────────────────────────────

async function writeLog(opts: {
  accountId:         string;
  weekStart:         string;
  pdfGenerated:      boolean;
  status:            "success" | "partial" | "failed" | "skipped";
  errorMessage:      string | null;
  emailSent:         boolean;
  emailSentAt:       Date | null;
  emailStatus:       "success" | "failed" | "skipped" | null;
  emailErrorMessage: string | null;
  recipientsJson:    string | null;
}): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO account_report_logs
        (account_id, report_week, pdf_generated, excel_generated, status, error_message,
         triggered_by, email_sent, email_sent_at, email_status, email_error_message,
         recipients_json)
      VALUES
        (${opts.accountId}, ${opts.weekStart}::date,
         ${opts.pdfGenerated}, false,
         ${opts.status}, ${opts.errorMessage},
         'automated_delivery',
         ${opts.emailSent},
         ${opts.emailSentAt ? opts.emailSentAt.toISOString() : null}::timestamptz,
         ${opts.emailStatus},
         ${opts.emailErrorMessage},
         ${opts.recipientsJson})
      ON CONFLICT DO NOTHING
    `);
  } catch (e: any) {
    console.error("[DeliveryJob] Log write failed:", e.message);
  }
}

// ── Campaign / Run / Delivery tracking ────────────────────────────────────────

const AUTOMATED_CAMPAIGN_NAME = "Automated Weekly Schedule";

async function getOrCreateAutomatedCampaign(): Promise<string> {
  try {
    const existing = await db.execute(sql`
      SELECT id FROM account_report_campaigns
      WHERE campaign_name = ${AUTOMATED_CAMPAIGN_NAME}
      LIMIT 1
    `);
    const rows: any[] = (existing as any).rows ?? existing;
    if (rows.length > 0) return rows[0].id;

    const id = randomUUID();
    await db.execute(sql`
      INSERT INTO account_report_campaigns
        (id, campaign_name, report_type, sender_profile, status, schedule_type, created_at, updated_at)
      VALUES
        (${id}, ${AUTOMATED_CAMPAIGN_NAME}, 'WEEKLY_ACCOUNT_SCHEDULE', 'Reports',
         'active', 'automated', NOW(), NOW())
      ON CONFLICT DO NOTHING
    `);
    const check = await db.execute(sql`
      SELECT id FROM account_report_campaigns WHERE campaign_name = ${AUTOMATED_CAMPAIGN_NAME} LIMIT 1
    `);
    const checkRows: any[] = (check as any).rows ?? check;
    return checkRows[0]?.id ?? id;
  } catch (e: any) {
    console.error("[DeliveryJob] Campaign create failed:", e.message);
    return randomUUID();
  }
}

async function createCampaignRun(
  campaignId: string,
  weekStart:  string,
  weekEnd:    string,
  triggeredBy: string,
): Promise<string> {
  const id = randomUUID();
  try {
    await db.execute(sql`
      INSERT INTO account_report_campaign_runs
        (id, campaign_id, run_type, status, schedule_week_start, schedule_week_end,
         triggered_by, started_at, created_at)
      VALUES
        (${id}, ${campaignId}, 'automated', 'sending',
         ${weekStart}::date, ${weekEnd}::date,
         ${triggeredBy}, NOW(), NOW())
    `);
  } catch (e: any) {
    console.error("[DeliveryJob] Campaign run create failed:", e.message);
  }
  return id;
}

// ── Error classification ──────────────────────────────────────────────────────

function classifyEmailError(
  error: string | null | undefined,
  deliveryStatus?: string,
): string | null {
  if (deliveryStatus === "blocked") return "blocked";
  if (deliveryStatus === "not_sent") return null;
  if (!error) return null;
  const e = error.toLowerCase();
  if (e.includes("no recipient") || e.includes("no active recipient") || e.includes("no_recipient") || e.includes("no email"))
    return "no_recipient";
  if ((e.includes("invalid") || e.includes("malformed")) && (e.includes("email") || e.includes("address") || e.includes("recipient")))
    return "invalid_email";
  if (e.includes("mailbox") && (e.includes("not found") || e.includes("unavailable") || e.includes("does not exist")))
    return "mailbox_not_found";
  if (e.includes("bounce") || e.includes("550") || e.includes("permanent"))
    return "bounced";
  if (e.includes("blocked") || e.includes("firewall") || e.includes("spam") || e.includes("rejected"))
    return "blocked";
  if (e.includes("graph") || e.includes("statuscode") || e.includes("429") || e.includes("503") || e.includes("request failed"))
    return "graph_error";
  if (error) return "unknown";
  return null;
}

async function writeCampaignRunDelivery(opts: {
  runId:           string;
  accountId:       string;
  recipientEmail:  string | null;
  recipientName?:  string | null;
  status:          "delivered" | "failed" | "blocked" | "not_sent";
  sentAt:          Date | null;
  errorMessage:    string | null;
  failureType?:    string | null;
}): Promise<void> {
  const failureType = opts.failureType ?? classifyEmailError(opts.errorMessage, opts.status);
  try {
    await db.execute(sql`
      INSERT INTO account_report_run_deliveries
        (id, run_id, account_id, status, recipient_email, recipient_name, sent_at, error_message, failure_type, created_at)
      VALUES
        (${randomUUID()}, ${opts.runId}, ${opts.accountId}, ${opts.status},
         ${opts.recipientEmail},
         ${opts.recipientName ?? null},
         ${opts.sentAt ? opts.sentAt.toISOString() : null}::timestamptz,
         ${opts.errorMessage},
         ${failureType},
         NOW())
    `);
  } catch (e: any) {
    console.error("[DeliveryJob] Run delivery record failed:", e.message);
  }
}

async function finalizeCampaignRun(runId: string, counts: {
  total:     number;
  delivered: number;
  failed:    number;
  notSent:   number;
  blocked:   number;
}): Promise<void> {
  const hasAnySuccess = counts.delivered > 0;
  const hasAnyFailure = counts.failed > 0 || counts.blocked > 0;
  const status = hasAnySuccess
    ? (hasAnyFailure ? "completed" : "completed")
    : (hasAnyFailure ? "failed" : "completed");
  try {
    await db.execute(sql`
      UPDATE account_report_campaign_runs
      SET status          = ${status},
          total_accounts  = ${counts.total},
          delivered_count = ${counts.delivered},
          failed_count    = ${counts.failed},
          not_sent_count  = ${counts.notSent},
          blocked_count   = ${counts.blocked},
          completed_at    = NOW()
      WHERE id = ${runId}
    `);
  } catch (e: any) {
    console.error("[DeliveryJob] Run finalize failed:", e.message);
  }
}

// ── Send with 1 retry ─────────────────────────────────────────────────────────

async function attemptSend(
  payload: Parameters<typeof sendEmail>[0],
): Promise<{ ok: boolean; error?: string }> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await sendEmail(payload);
      if (r.ok) return { ok: true };
      const err = r.error ?? "Send failed";
      if (attempt === 2) return { ok: false, error: err };
      console.warn(`[DeliveryJob] Send attempt ${attempt} failed (${err}), retrying…`);
    } catch (e: any) {
      const err = e?.message ?? String(e);
      if (attempt === 2) return { ok: false, error: err };
      console.warn(`[DeliveryJob] Send attempt ${attempt} threw (${err}), retrying…`);
    }
  }
  return { ok: false, error: "Exhausted retries" };
}

// ── Email body ────────────────────────────────────────────────────────────────

function buildEmailBody(accountName: string, weekStart: string, weekEnd: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; color: #333; font-size: 14px; line-height: 1.6; margin: 0; padding: 0; }
  .header { background-color: #1F2A6D; color: white; padding: 20px 30px; }
  .header h1 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.01em; }
  .header p  { margin: 4px 0 0; font-size: 13px; opacity: 0.75; }
  .body   { padding: 28px 30px; }
  .footer { padding: 16px 30px; font-size: 11px; color: #aaa; border-top: 1px solid #eee; }
</style></head>
<body>
  <div class="header">
    <h1>Upcoming Week Driver Schedule</h1>
    <p>${accountName} &mdash; Week of ${fmtDate(weekStart)}</p>
  </div>
  <div class="body">
    <p>Hello,</p>
    <p>Attached is the driver schedule for <strong>${accountName}</strong> for the upcoming week of ${fmtDate(weekStart)}.</p>
    <p>Please reach out if you have any questions or need adjustments.</p>
    <p>Best regards,<br>Driver on Demand Team</p>
  </div>
  <div class="footer">
    Generated by DriverHub 360 &mdash; Week: ${weekStart} &ndash; ${weekEnd}
  </div>
</body>
</html>`.trim();
}

// ── Per-account delivery ──────────────────────────────────────────────────────

export async function deliverReportForAccount(opts: {
  accountId:   string;
  weekStart?:  string;
  weekEnd?:    string;
  forceSend?:  boolean;
  dryRun?:     boolean;
  runId?:      string;   // if provided, writes to account_report_run_deliveries
}): Promise<DeliveryAccountResult> {
  const { accountId, forceSend = false, dryRun = false, runId } = opts;
  const { weekStart: ws, weekEnd: we } = opts.weekStart && opts.weekEnd
    ? { weekStart: opts.weekStart, weekEnd: opts.weekEnd }
    : getUpcomingWeekBounds();

  const base: DeliveryAccountResult = {
    accountId, accountName: "Unknown", status: "skipped",
    pdfGenerated: false, emailStatus: null, recipients: [],
    weekStart: ws, weekEnd: we, dryRun,
  };

  const accRaw = await db.execute(sql`
    SELECT c.id, c.customer_name, c.driver_model, c.timezone,
           c.send_weekly_report, c.report_send_day, c.report_send_time,
           c.report_contact_name, c.primary_contact_name,
           c.report_primary_email, c.report_primary_emails, c.report_cc_emails,
           c.primary_contact_email, c.report_sender_profile,
           (SELECT COUNT(*)
            FROM driver_accounts da
            INNER JOIN drivers d ON d.id = da.driver_id
            WHERE da.account_id = c.id
              AND da.assignment_ended_at IS NULL
              AND LOWER(d.status) = 'active') AS active_driver_count
    FROM customers c
    WHERE c.id = ${accountId} AND c.is_deleted = false
    LIMIT 1
  `);
  const acc: any = ((accRaw as any).rows ?? accRaw)[0];

  if (!acc) {
    return { ...base, accountName: "Unknown", status: "failed", skippedReason: "Account not found" };
  }

  base.accountName = acc.customer_name;

  const driverCount = parseInt(acc.active_driver_count ?? "0", 10);
  if (driverCount < 1) {
    if (runId) await writeCampaignRunDelivery({ runId, accountId, recipientEmail: null, status: "not_sent", sentAt: null, errorMessage: "No active drivers assigned" });
    return { ...base, accountName: acc.customer_name, status: "skipped", skippedReason: "No active drivers assigned" };
  }

  // Dedup: check ALL triggered_by values
  if (!dryRun && !forceSend && await alreadyDeliveredThisWeek(accountId, ws)) {
    if (runId) await writeCampaignRunDelivery({ runId, accountId, recipientEmail: null, status: "not_sent", sentAt: null, errorMessage: "Already delivered this week" });
    return { ...base, accountName: acc.customer_name, status: "skipped", skippedReason: "Already delivered this week" };
  }

  const senderProfile = VALID_MAILBOX_PROFILES.includes(acc.report_sender_profile ?? "")
    ? acc.report_sender_profile
    : "Reports";

  let fromEmail: string | undefined;
  if (!dryRun) {
    const gate = await assertMailboxOperational(senderProfile, { reportType: "automated_delivery", accountId });
    if (!gate.ok) {
      const reason = gate.reason ?? "Report blocked. Selected sender mailbox is not operational.";
      await writeLog({
        accountId, weekStart: ws, pdfGenerated: false, status: "failed",
        errorMessage: reason, emailSent: false, emailSentAt: null,
        emailStatus: "skipped", emailErrorMessage: reason, recipientsJson: null,
      });
      if (runId) await writeCampaignRunDelivery({ runId, accountId, recipientEmail: null, status: "blocked", sentAt: null, errorMessage: reason });
      return { ...base, accountName: acc.customer_name, status: "blocked", skippedReason: reason };
    }
    fromEmail = gate.resolvedEmail;
  }

  const { to: toList, cc: ccList } = await resolveRecipients(accountId, acc);
  const allRecipients = [...toList, ...ccList];
  base.recipients = allRecipients;

  if (!isMicrosoftGraphConfigured()) {
    const reason = "Microsoft Graph not configured";
    if (!dryRun) {
      await writeLog({ accountId, weekStart: ws, pdfGenerated: false, status: "skipped",
        errorMessage: reason, emailSent: false, emailSentAt: null,
        emailStatus: "skipped", emailErrorMessage: reason, recipientsJson: JSON.stringify(allRecipients) });
      if (runId) await writeCampaignRunDelivery({ runId, accountId, recipientEmail: toList[0] ?? null, status: "not_sent", sentAt: null, errorMessage: reason });
    }
    return { ...base, status: "skipped", skippedReason: reason, emailStatus: "skipped" };
  }

  if (toList.length === 0) {
    const reason = "No active recipients configured";
    if (!dryRun) {
      await writeLog({ accountId, weekStart: ws, pdfGenerated: false, status: "skipped",
        errorMessage: reason, emailSent: false, emailSentAt: null,
        emailStatus: "skipped", emailErrorMessage: reason, recipientsJson: null });
      if (runId) await writeCampaignRunDelivery({ runId, accountId, recipientEmail: null, status: "not_sent", sentAt: null, errorMessage: reason });
    }
    return { ...base, status: "skipped", skippedReason: reason, emailStatus: "skipped" };
  }

  if (dryRun) {
    return {
      ...base, status: "dry_run", pdfGenerated: false, emailStatus: null,
      skippedReason: `Would send to: ${allRecipients.join(", ")}`,
    };
  }

  // ── Shift count gate ─────────────────────────────────────────────────────────
  // Rule: do not send if 0 shifts are scheduled for the reporting week.
  // This check runs before PDF generation so no work is wasted on empty schedules.
  {
    try {
      const nextDayForShiftGate = new Date(we);
      nextDayForShiftGate.setDate(nextDayForShiftGate.getDate() + 1);
      const weExclusiveForShiftGate = nextDayForShiftGate.toISOString().slice(0, 10);

      const shiftGateRaw = await db.execute(sql`
        SELECT COUNT(*) AS shift_count
        FROM wiw_shifts s
        JOIN wiw_locations wl ON wl.id = s.wiw_location_id
        WHERE wl.account_id::text = ${accountId}
          AND s.start_time >= ${ws}::date
          AND s.start_time <  ${weExclusiveForShiftGate}::date
          AND s.status NOT IN ('deleted', 'cancelled')
      `);
      const scheduledShiftCount = parseInt(
        String(((shiftGateRaw as any).rows ?? shiftGateRaw)[0]?.shift_count ?? "0"), 10
      );

      if (scheduledShiftCount < 1) {
        const reason = "Skipped — No scheduled shifts for reporting week";
        console.log(`[DeliveryJob] ${acc.customer_name}: ${reason}`);
        await writeLog({
          accountId, weekStart: ws, pdfGenerated: false,
          status: "skipped", errorMessage: reason,
          emailSent: false, emailSentAt: null,
          emailStatus: "skipped", emailErrorMessage: reason,
          recipientsJson: JSON.stringify(allRecipients),
        });
        if (runId) await writeCampaignRunDelivery({ runId, accountId, recipientEmail: null, status: "not_sent", sentAt: null, errorMessage: reason });
        return { ...base, status: "skipped", skippedReason: reason, emailStatus: "skipped" };
      }
    } catch (shiftGateErr: any) {
      // Non-fatal: log the warning and continue to PDF generation.
      // If the query fails, we allow delivery to proceed rather than blocking.
      console.warn(`[DeliveryJob] ${acc.customer_name}: shift count gate query failed (non-fatal):`, shiftGateErr.message);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Pre-send mapping health validation ──────────────────────────────────────
  // Block delivery if wiw_locations.account_id returns 0 shifts for the week
  // but the legacy wiw_location_account_map returns > 0 — this indicates a
  // stale/conflicting mapping that would produce a blank schedule PDF.
  try {
    const nextDay = new Date(we);
    nextDay.setDate(nextDay.getDate() + 1);
    const weDayAfter = nextDay.toISOString().slice(0, 10);

    const checkRows = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM wiw_shifts s
         JOIN wiw_locations wl ON wl.id = s.wiw_location_id
         WHERE wl.account_id::text = ${accountId}
           AND s.start_time >= ${ws}::date AND s.start_time < ${weDayAfter}::date
           AND s.status NOT IN ('deleted','cancelled')
        ) AS wl_count,
        (SELECT COUNT(*) FROM wiw_shifts s
         JOIN wiw_location_account_map lam ON lam.wiw_location_id = s.wiw_location_id
         WHERE lam.driverhub_account_id = ${accountId}
           AND lam.mapping_status = 'mapped'
           AND s.start_time >= ${ws}::date AND s.start_time < ${weDayAfter}::date
           AND s.status NOT IN ('deleted','cancelled')
        ) AS lam_count
    `);

    const chk = ((checkRows as any).rows ?? checkRows)[0] ?? {};
    const wlCount  = parseInt(String(chk.wl_count  ?? "0"), 10);
    const lamCount = parseInt(String(chk.lam_count ?? "0"), 10);

    if (wlCount === 0 && lamCount > 0) {
      const reason = `Mapping conflict: ${lamCount} shift(s) found via legacy location map but 0 via wiw_locations.account_id. Update wiw_locations to resolve before this account can receive schedule reports.`;
      console.warn(`[DeliveryJob] MAPPING_CONFLICT ${acc.customer_name}: ${reason}`);
      await writeLog({
        accountId, weekStart: ws, pdfGenerated: false, status: "skipped",
        errorMessage: reason, emailSent: false, emailSentAt: null,
        emailStatus: "skipped", emailErrorMessage: reason,
        recipientsJson: JSON.stringify(allRecipients),
      });
      if (runId) await writeCampaignRunDelivery({ runId, accountId, recipientEmail: toList[0] ?? null, status: "not_sent", sentAt: null, errorMessage: reason });
      return { ...base, status: "skipped", skippedReason: reason };
    }
  } catch (mappingCheckErr: any) {
    console.warn(`[DeliveryJob] ${acc.customer_name}: mapping health check failed (non-fatal):`, mappingCheckErr.message);
  }
  // ────────────────────────────────────────────────────────────────────────────

  let pdfResult: { buffer: Buffer; fileName: string; shiftCount: number; driverCount: number } | null = null;
  const errors: string[] = [];

  try {
    const { generateSchedulePdf } = await import("./scheduleReportPdfService");
    pdfResult = await generateSchedulePdf({
      customerId: accountId, accountName: acc.customer_name, weekStart: ws, weekEnd: we,
    });
    base.pdfGenerated = true;
  } catch (e: any) {
    errors.push(`PDF: ${e.message}`);
  }

  if (pdfResult && pdfResult.buffer.length > 100) {
    try {
      const { storeScheduleReport } = await import("./scheduleReportStorageService");
      await storeScheduleReport({
        customerId: accountId, accountName: acc.customer_name, weekStart: ws, weekEnd: we,
        buffer: pdfResult.buffer, fileName: pdfResult.fileName,
        shiftCount: pdfResult.shiftCount, driverCount: pdfResult.driverCount,
        uploadedByUserId: null,
      });
    } catch (e: any) {
      console.warn(`[DeliveryJob] ${acc.customer_name}: Archive failed (non-fatal):`, e.message);
    }
  }

  if (!pdfResult || pdfResult.buffer.length <= 100) {
    const reason = errors.length > 0 ? errors.join("; ") : "No schedule data available for this week";
    const st = errors.length > 0 ? "failed" : "skipped";
    await writeLog({ accountId, weekStart: ws, pdfGenerated: false,
      status: st, errorMessage: reason,
      emailSent: false, emailSentAt: null, emailStatus: "skipped", emailErrorMessage: reason,
      recipientsJson: JSON.stringify(allRecipients) });
    if (runId) await writeCampaignRunDelivery({ runId, accountId, recipientEmail: toList[0] ?? null, status: st === "failed" ? "failed" : "not_sent", sentAt: null, errorMessage: reason });
    return { ...base, status: st as "failed" | "skipped",
      skippedReason: reason, emailStatus: "skipped" };
  }

  const slug      = (acc.customer_name as string).replace(/[^a-z0-9]/gi, "_");
  const weekLabel = ws.replace(/-/g, "");
  const subject   = `Upcoming Week Driver Schedule \u2013 ${acc.customer_name} \u2013 Week of ${fmtDate(ws)}`;
  const bodyHtml  = buildEmailBody(acc.customer_name, ws, we);

  const sendResult = await attemptSend({
    to:          toList,
    cc:          ccList.length > 0 ? ccList : undefined,
    subject,
    bodyHtml,
    fromEmail,
    attachments: [{
      name:         `Schedule_${slug}_${weekLabel}.pdf`,
      contentType:  "application/pdf",
      contentBytes: pdfResult.buffer.toString("base64"),
    }],
  });

  const emailOk = sendResult.ok;
  const sentAt  = emailOk ? new Date() : null;

  if (emailOk) {
    console.log(`[DeliveryJob] ${acc.customer_name}: sent → ${toList.join(", ")}`);
  } else {
    errors.push(`Email: ${sendResult.error}`);
    console.error(`[DeliveryJob] ${acc.customer_name}: email failed — ${sendResult.error}`);
  }

  const overallStatus = emailOk ? "success" : base.pdfGenerated ? "partial" : "failed";
  await writeLog({
    accountId, weekStart: ws,
    pdfGenerated:      base.pdfGenerated,
    status:            overallStatus,
    errorMessage:      errors.length > 0 ? errors.join("; ") : null,
    emailSent:         emailOk,
    emailSentAt:       sentAt,
    emailStatus:       emailOk ? "success" : "failed",
    emailErrorMessage: sendResult.error ?? null,
    recipientsJson:    JSON.stringify(allRecipients),
  });

  // Write per-TO-recipient delivery records when part of a campaign run
  if (runId) {
    // Build name map for TO recipients from weekly_report_recipients
    const nameMap = new Map<string, string | null>();
    try {
      const nameRows = await db.execute(sql`
        SELECT recipient_email, recipient_name
        FROM weekly_report_recipients
        WHERE account_id = ${accountId} AND active = true
      `);
      const nr: any[] = (nameRows as any).rows ?? nameRows;
      for (const r of nr) nameMap.set(r.recipient_email, r.recipient_name ?? null);
    } catch {}

    if (toList.length > 0) {
      for (const email of toList) {
        await writeCampaignRunDelivery({
          runId, accountId,
          recipientEmail: email,
          recipientName:  nameMap.get(email) ?? null,
          status:         emailOk ? "delivered" : "failed",
          sentAt,
          errorMessage:   sendResult.error ?? null,
        });
      }
    } else {
      await writeCampaignRunDelivery({
        runId, accountId,
        recipientEmail: null,
        status:         emailOk ? "delivered" : "failed",
        sentAt,
        errorMessage:   sendResult.error ?? null,
      });
    }
  }

  return {
    ...base,
    status:       emailOk ? "sent" : "failed",
    emailStatus:  emailOk ? "success" : "failed",
    emailError:   sendResult.error,
  };
}

// ── Hourly poll — called by scheduler ─────────────────────────────────────────

export async function runWeeklyDeliveryPoll(): Promise<void> {
  console.log(`[DeliveryJob] Poll starting at ${new Date().toISOString()}`);
  try {
    const gate = await assertMs365GlobalPrereqs({ reportType: "automated_delivery_poll" });
    if (!gate.ok) {
      console.warn("[DeliveryJob] Poll BLOCKED — MS365 credentials/OAuth not operational.");
      console.warn(`[DeliveryJob] Reason: ${gate.reason}`);
      if (gate.failedChecks?.length) console.warn(`[DeliveryJob] Failed checks: ${gate.failedChecks.join("; ")}`);
      return;
    }

    // Query ALL send_weekly_report accounts (not pre-filtered by status) so that
    // non-Active accounts that are due can be explicitly logged as skipped.
    const accountsRaw = await db.execute(sql`
      SELECT c.id, c.customer_name, c.driver_model, c.timezone,
             c.report_send_day, c.report_send_time, c.status
      FROM customers c
      WHERE c.send_weekly_report = true
        AND c.is_deleted = false
      ORDER BY c.customer_name
    `);
    const accounts: any[] = (accountsRaw as any).rows ?? [];
    const due = accounts.filter(isDueForDelivery);

    if (due.length === 0) {
      console.log("[DeliveryJob] Poll: no accounts due at this time.");
      return;
    }

    // Separate Active from non-Active — non-Active are skipped and logged, not delivered.
    const activeAccounts    = due.filter((a: any) => (a.status ?? "").toLowerCase() === "active");
    const nonActiveAccounts = due.filter((a: any) => (a.status ?? "").toLowerCase() !== "active");

    console.log(
      `[DeliveryJob] ${due.length} account(s) due — ` +
      `${activeAccounts.length} Active, ` +
      `${nonActiveAccounts.length} non-Active (will be skipped)`
    );

    const { weekStart: ws, weekEnd: we } = getUpcomingWeekBounds();
    const campaignId = await getOrCreateAutomatedCampaign();
    const runId      = await createCampaignRun(campaignId, ws, we, "scheduler");

    let delivered = 0, failed = 0, notSent = 0, blocked = 0;

    // ── Log non-Active accounts as skipped ────────────────────────────────────
    // Rule: only Active accounts may receive the weekly Shift Schedule report.
    for (const acc of nonActiveAccounts) {
      const reason = `Skipped — Account not Active (status: ${acc.status ?? "unknown"})`;
      console.log(`[DeliveryJob] ${acc.customer_name}: ${reason}`);
      try {
        // Write to account_report_logs (same table zero-shift skips use) so
        // all skip reasons appear in the same per-account delivery history.
        await writeLog({
          accountId: acc.id,
          weekStart: ws,
          pdfGenerated: false,
          status: "skipped",
          errorMessage: reason,
          emailSent: false,
          emailSentAt: null,
          emailStatus: "skipped",
          emailErrorMessage: reason,
          recipientsJson: null,
        });
        await writeCampaignRunDelivery({
          runId, accountId: acc.id, recipientEmail: null,
          status: "not_sent", sentAt: null, errorMessage: reason,
        });
      } catch (e: any) {
        console.warn(`[DeliveryJob] ${acc.customer_name}: failed to log non-Active skip:`, e.message);
      }
      notSent++;
    }

    // ── Deliver to Active accounts ─────────────────────────────────────────────
    for (const acc of activeAccounts) {
      try {
        const r = await deliverReportForAccount({ accountId: acc.id, runId });
        const note      = r.skippedReason ? ` (${r.skippedReason})` : "";
        const emailNote = r.emailStatus === "success" ? " | email sent"
          : r.emailStatus === "failed"  ? ` | email failed: ${r.emailError}`
          : r.emailStatus === "skipped" ? " | email skipped"
          : "";
        console.log(`[DeliveryJob] ${acc.customer_name}: ${r.status}${note}${emailNote}`);

        if      (r.status === "sent")    delivered++;
        else if (r.status === "blocked") blocked++;
        else if (r.status === "skipped") notSent++;
        else                             failed++;
      } catch (e: any) {
        failed++;
        await writeCampaignRunDelivery({ runId, accountId: acc.id, recipientEmail: null, status: "failed", sentAt: null, errorMessage: e.message });
        console.error(`[DeliveryJob] ${acc.customer_name}: error:`, e.message);
      }
    }

    await finalizeCampaignRun(runId, {
      total: due.length, delivered, failed, notSent, blocked,
    });

  } catch (e: any) {
    console.error("[DeliveryJob] Poll error:", e.message);
  }
}

// ── Manual / batch run ─────────────────────────────────────────────────────────

export async function runDeliveryBatch(opts: {
  weekStart?:  string;
  weekEnd?:    string;
  forceSend?:  boolean;
  dryRun?:     boolean;
  accountIds?: string[];
}): Promise<DeliveryBatchResult> {
  const { weekStart: ws, weekEnd: we } = opts.weekStart && opts.weekEnd
    ? { weekStart: opts.weekStart, weekEnd: opts.weekEnd }
    : getUpcomingWeekBounds();

  const dryRun    = opts.dryRun    ?? false;
  const forceSend = opts.forceSend ?? false;

  if (!dryRun) {
    const gate = await assertMs365GlobalPrereqs({ reportType: "delivery_batch" });
    if (!gate.ok) {
      console.warn("[DeliveryJob] Batch BLOCKED — MS365 credentials/OAuth not operational.");
      return {
        runAt: new Date().toISOString(), dryRun, weekStart: ws, weekEnd: we,
        evaluated: 0, eligible: 0, sent: 0, skipped: 0, failed: 0, accounts: [],
        blocked: true, blockedReason: gate.reason, blockedChecks: gate.failedChecks,
      };
    }
  }

  const idFilter = opts.accountIds && opts.accountIds.length > 0
    ? sql`AND c.id = ANY(${opts.accountIds})`
    : sql``;

  const accountsRaw = await db.execute(sql`
    SELECT c.id, c.customer_name
    FROM customers c
    WHERE c.send_weekly_report = true
      AND c.is_deleted = false
      AND c.status = 'Active'
      AND EXISTS (
        SELECT 1 FROM driver_accounts da
        INNER JOIN drivers d ON d.id = da.driver_id
        WHERE da.account_id = c.id
          AND da.assignment_ended_at IS NULL
          AND LOWER(d.status) = 'active'
      )
      ${idFilter}
    ORDER BY c.customer_name
  `);
  const accounts: any[] = (accountsRaw as any).rows ?? [];

  const batch: DeliveryBatchResult = {
    runAt: new Date().toISOString(), dryRun, weekStart: ws, weekEnd: we,
    evaluated: accounts.length, eligible: 0, sent: 0, skipped: 0, failed: 0,
    accounts: [],
  };

  // Create campaign/run record for non-dry-run batches
  let runId: string | undefined;
  if (!dryRun && accounts.length > 0) {
    const campaignId = await getOrCreateAutomatedCampaign();
    runId = await createCampaignRun(campaignId, ws, we, "manual");
  }

  let delivered = 0, failed = 0, notSent = 0, blocked = 0;

  for (const acc of accounts) {
    try {
      const r = await deliverReportForAccount({ accountId: acc.id, weekStart: ws, weekEnd: we, forceSend, dryRun, runId });
      batch.accounts.push(r);
      if      (r.status === "sent")     { batch.sent++;     batch.eligible++; delivered++; }
      else if (r.status === "dry_run")  { batch.eligible++; }
      else if (r.status === "skipped")  { batch.skipped++;  notSent++; }
      else if (r.status === "blocked")  { batch.skipped++;  blocked++; }
      else                              { batch.failed++;   failed++; }
    } catch (e: any) {
      batch.failed++;
      failed++;
      batch.accounts.push({
        accountId: acc.id, accountName: acc.customer_name,
        status: "failed", skippedReason: e.message,
        pdfGenerated: false, emailStatus: null, recipients: [],
        weekStart: ws, weekEnd: we, dryRun,
      });
      if (runId) await writeCampaignRunDelivery({ runId, accountId: acc.id, recipientEmail: null, status: "failed", sentAt: null, errorMessage: e.message });
    }
  }

  if (runId) {
    await finalizeCampaignRun(runId, {
      total: accounts.length, delivered, failed, notSent, blocked,
    });
  }

  console.log(
    `[DeliveryJob] Batch ${dryRun ? "(DRY RUN) " : ""}complete: ` +
    `evaluated=${batch.evaluated}, eligible=${batch.eligible}, sent=${batch.sent}, ` +
    `skipped=${batch.skipped}, failed=${batch.failed}`,
  );

  return batch;
}
