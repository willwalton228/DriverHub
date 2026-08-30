/**
 * Weekly Generation Service  (Ticket 2.3 + Ticket 3.3)
 *
 * Unified generate-then-email job per account.
 *
 * Flow per account:
 *   1. Generate PDF schedule (if include_schedule_pdf)
 *   2. Generate Excel hours  (if include_hours_excel)
 *   3. Archive both to Object Storage (best-effort)
 *   4. Send email with in-memory buffers (1 retry on failure)
 *   5. Log generation + email result to account_report_logs
 *
 * Key behaviours:
 *  - Per-account try/catch — one failure never blocks other accounts.
 *  - Email is skipped if: MS Graph not configured, no email address, no files generated.
 *  - Skipped email is logged (emailStatus = 'skipped') but not counted as an error.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { sendEmail, isMicrosoftGraphConfigured } from "./microsoftGraphService";

// ── Week bounds (Mon–Sun, America/Chicago) ─────────────────────────────────────
export function getWeekBounds(referenceDate?: Date): { weekStart: string; weekEnd: string } {
  const now = referenceDate ?? new Date();
  const chi = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const dow = chi.getDay(); // 0 = Sun
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const monDate = new Date(chi);
  monDate.setDate(chi.getDate() + diffToMon);
  monDate.setHours(0, 0, 0, 0);
  const sunDate = new Date(monDate);
  sunDate.setDate(monDate.getDate() + 6);
  return {
    weekStart: monDate.toISOString().split("T")[0],
    weekEnd:   sunDate.toISOString().split("T")[0],
  };
}

// ── Upcoming week bounds (Mon–Sun of the coming week, or today if Monday) ──────
export function getUpcomingWeekBounds(referenceDate?: Date): { weekStart: string; weekEnd: string } {
  const now = referenceDate ?? new Date();
  const chi = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const dow = chi.getDay(); // 0=Sun, 1=Mon, …, 6=Sat
  // If today is Monday (dow=1), offset=0 → this week; otherwise advance to next Monday
  const daysToMon = dow === 1 ? 0 : (8 - dow) % 7;
  const monDate = new Date(chi);
  monDate.setDate(chi.getDate() + daysToMon);
  monDate.setHours(0, 0, 0, 0);
  const sunDate = new Date(monDate);
  sunDate.setDate(monDate.getDate() + 6);
  return {
    weekStart: monDate.toISOString().split("T")[0],
    weekEnd:   sunDate.toISOString().split("T")[0],
  };
}

// ── Previous week bounds (Mon–Sun of the week before current) ─────────────────
export function getPreviousWeekBounds(referenceDate?: Date): { weekStart: string; weekEnd: string } {
  const { weekStart } = getWeekBounds(referenceDate);
  const [y, m, d] = weekStart.split("-").map(Number);
  const thisMonday = new Date(y, m - 1, d);
  const prevMonday = new Date(thisMonday);
  prevMonday.setDate(thisMonday.getDate() - 7);
  const prevSunday = new Date(prevMonday);
  prevSunday.setDate(prevMonday.getDate() + 6);
  return {
    weekStart: prevMonday.toISOString().split("T")[0],
    weekEnd:   prevSunday.toISOString().split("T")[0],
  };
}

// ── Current day/time in CST ────────────────────────────────────────────────────
function getCurrentCstDayTime(): { dayName: string; timeHHMM: string } {
  const now = new Date();
  const chi = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dayName = days[chi.getDay()];
  const hh = chi.getHours().toString().padStart(2, "0");
  const mm = chi.getMinutes().toString().padStart(2, "0");
  return { dayName, timeHHMM: `${hh}:${mm}` };
}

// ── Friendly date format — "March 31, 2026" ───────────────────────────────────
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

// ── Email body builder ────────────────────────────────────────────────────────
function buildEmailBody(
  accountName: string,
  weekStart:   string,
  weekEnd:     string,
  contactName: string,
  includePdf:  boolean,
  includeXls:  boolean,
): string {
  const attachmentList = [
    includePdf ? `<li><strong>Driver Schedule (PDF)</strong> &mdash; shift-by-shift schedule for the week</li>` : "",
    includeXls ? `<li><strong>Weekly Hours Summary (Excel)</strong> &mdash; detailed clock-in/out records and totals</li>` : "",
  ].filter(Boolean).join("\n");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; color: #333; font-size: 14px; line-height: 1.6; }
  .header { background-color: #1F2A6D; color: white; padding: 20px 30px; }
  .header h1 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.01em; }
  .header p { margin: 4px 0 0; font-size: 13px; opacity: 0.75; }
  .body { padding: 30px; }
  .body ul { margin: 12px 0; padding-left: 20px; }
  .body li { margin-bottom: 4px; }
  .footer { padding: 20px 30px; font-size: 11px; color: #888; border-top: 1px solid #eee; }
</style></head>
<body>
  <div class="header">
    <h1>Weekly Driver Schedule &amp; Hours</h1>
    <p>${accountName} &mdash; Week of ${fmtDate(weekStart)}</p>
  </div>
  <div class="body">
    <p>Hi ${contactName},</p>
    <p>Attached are your weekly reports for <strong>${accountName}</strong>:</p>
    <ul>
      ${attachmentList}
    </ul>
    <p>Please let us know if you have any questions or need adjustments.</p>
    <p>Best regards,<br>Driver on Demand Team</p>
  </div>
  <div class="footer">
    This report was generated automatically by DriverHub 360.
    Week: ${weekStart} &ndash; ${weekEnd}
  </div>
</body>
</html>`.trim();
}

// ── Insert / update account_report_logs row ────────────────────────────────────
async function logGeneration(opts: {
  accountId:          string;
  reportWeek:         string;
  pdfGenerated:       boolean;
  excelGenerated:     boolean;
  status:             "success" | "partial" | "failed" | "skipped";
  errorMessage?:      string | null;
  triggeredBy:        "scheduler" | "manual";
  emailSent:          boolean;
  emailSentAt?:       Date | null;
  emailStatus?:       "success" | "failed" | "skipped" | null;
  emailErrorMessage?: string | null;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO account_report_logs
      (account_id, report_week, pdf_generated, excel_generated, status, error_message, triggered_by,
       email_sent, email_sent_at, email_status, email_error_message)
    VALUES
      (${opts.accountId}, ${opts.reportWeek}::date, ${opts.pdfGenerated}, ${opts.excelGenerated},
       ${opts.status}, ${opts.errorMessage ?? null}, ${opts.triggeredBy},
       ${opts.emailSent}, ${opts.emailSentAt ? opts.emailSentAt.toISOString() : null}::timestamptz,
       ${opts.emailStatus ?? null}, ${opts.emailErrorMessage ?? null})
    ON CONFLICT DO NOTHING
  `);
}

// ── Attempt to send email — 1 retry on failure ─────────────────────────────────
async function attemptSendEmail(
  payload: Parameters<typeof sendEmail>[0],
): Promise<{ ok: boolean; error?: string }> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await sendEmail(payload);
      if (result.ok) return { ok: true };
      const err = result.error ?? "Send failed";
      if (attempt === 2) return { ok: false, error: err };
      console.warn(`[GenerationJob] Email attempt ${attempt} failed (${err}), retrying…`);
    } catch (e: any) {
      const err = e?.message ?? String(e);
      if (attempt === 2) return { ok: false, error: err };
      console.warn(`[GenerationJob] Email attempt ${attempt} threw (${err}), retrying…`);
    }
  }
  return { ok: false, error: "Exhausted retries" };
}

// ── Per-account generation result ─────────────────────────────────────────────
export interface AccountGenerationResult {
  accountId:      string;
  accountName:    string;
  status:         "success" | "partial" | "failed" | "skipped";
  pdfGenerated:   boolean;
  excelGenerated: boolean;
  emailSent:      boolean;
  emailStatus:    "success" | "failed" | "skipped" | null;
  emailError?:    string;
  errors:         string[];
}

// ── Core per-account function ──────────────────────────────────────────────────
export async function generateReportsForAccount(
  accountId:   string,
  weekStart?:  string,
  weekEnd?:    string,
  triggeredBy: "scheduler" | "manual" = "scheduler",
): Promise<AccountGenerationResult> {
  const { weekStart: ws, weekEnd: we } = weekStart && weekEnd
    ? { weekStart, weekEnd }
    : getUpcomingWeekBounds();

  const accRaw = await db.execute(sql`
    SELECT id, customer_name,
           report_contact_name, primary_contact_name,
           report_primary_email, report_primary_emails, report_cc_emails, primary_contact_email,
           include_schedule_pdf, include_hours_excel
    FROM customers
    WHERE id = ${accountId} AND is_deleted = false
    LIMIT 1
  `);
  const acc: any = ((accRaw as any).rows ?? accRaw)[0];

  if (!acc) {
    await logGeneration({
      accountId, reportWeek: ws,
      pdfGenerated: false, excelGenerated: false,
      status: "failed", errorMessage: "Account not found", triggeredBy,
      emailSent: false, emailStatus: null,
    });
    return {
      accountId, accountName: "Unknown", status: "failed",
      pdfGenerated: false, excelGenerated: false,
      emailSent: false, emailStatus: null,
      errors: ["Account not found"],
    };
  }

  const result: AccountGenerationResult = {
    accountId,
    accountName:    acc.customer_name,
    status:         "success",
    pdfGenerated:   false,
    excelGenerated: false,
    emailSent:      false,
    emailStatus:    null,
    errors:         [],
  };

  const includePdf   = acc.include_schedule_pdf !== false;
  const includeExcel = acc.include_hours_excel  !== false;

  // In-memory buffers for email attachments
  let pdfResult:  { buffer: Buffer; fileName: string; shiftCount: number; driverCount: number } | null = null;
  let xlsResult:  { buffer: Buffer; fileName: string; shiftCount: number; driverCount: number } | null = null;

  // ── Step 1: Generate PDF ───────────────────────────────────────────────────
  if (includePdf) {
    try {
      const { generateSchedulePdf } = await import("./scheduleReportPdfService");
      pdfResult = await generateSchedulePdf({
        customerId: accountId, accountName: acc.customer_name, weekStart: ws, weekEnd: we,
      });
      result.pdfGenerated = true;
    } catch (e: any) {
      result.errors.push(`PDF: ${e.message}`);
    }
  }

  // ── Step 2: Generate Excel ─────────────────────────────────────────────────
  if (includeExcel) {
    try {
      const { generateHoursExcel } = await import("./hoursReportExcelService");
      xlsResult = await generateHoursExcel({
        customerId: accountId, accountName: acc.customer_name, weekStart: ws, weekEnd: we,
      });
      result.excelGenerated = true;
    } catch (e: any) {
      result.errors.push(`Excel: ${e.message}`);
    }
  }

  // ── Step 3: Archive to Object Storage (best-effort) ───────────────────────
  try {
    const archiveJobs: Promise<any>[] = [];
    if (pdfResult && pdfResult.buffer.length > 100) {
      const { storeScheduleReport } = await import("./scheduleReportStorageService");
      archiveJobs.push(storeScheduleReport({
        customerId: accountId, accountName: acc.customer_name,
        weekStart: ws, weekEnd: we,
        buffer: pdfResult.buffer, fileName: pdfResult.fileName,
        shiftCount: pdfResult.shiftCount, driverCount: pdfResult.driverCount,
        uploadedByUserId: null,
      }));
    }
    if (xlsResult && xlsResult.buffer.length > 100) {
      const { storeHoursReport } = await import("./hoursReportStorageService");
      archiveJobs.push(storeHoursReport({
        customerId: accountId, accountName: acc.customer_name,
        weekStart: ws, weekEnd: we,
        buffer: xlsResult.buffer, fileName: xlsResult.fileName,
        entryCount: xlsResult.shiftCount, driverCount: xlsResult.driverCount,
        totalHours: 0, totalOtHours: 0,
        uploadedByUserId: null,
      }));
    }
    if (archiveJobs.length > 0) await Promise.all(archiveJobs);
  } catch (storErr: any) {
    console.warn(`[GenerationJob] ${acc.customer_name}: Archive failed (non-fatal):`, storErr.message);
  }

  // ── Step 4: Send email ────────────────────────────────────────────────────
  // Resolve To: addresses — multi-recipient array takes priority over legacy single field
  let toList: string[] = [];
  try { toList = JSON.parse(acc.report_primary_emails ?? "[]"); } catch {}
  if (toList.length === 0 && acc.report_primary_email) toList = [acc.report_primary_email];
  if (toList.length === 0 && acc.primary_contact_email) toList = [acc.primary_contact_email];
  const emailTo = toList[0] ?? null; // used for skipped checks

  if (!isMicrosoftGraphConfigured()) {
    result.emailStatus = "skipped";
    result.emailError  = "Microsoft Graph not configured";
    console.log(`[GenerationJob] ${acc.customer_name}: Email skipped — MS Graph not configured`);
  } else if (!emailTo) {
    result.emailStatus = "skipped";
    result.emailError  = "No email address configured for account";
    console.log(`[GenerationJob] ${acc.customer_name}: Email skipped — no email address`);
  } else {
    const hasFiles = (pdfResult && pdfResult.buffer.length > 100) || (xlsResult && xlsResult.buffer.length > 100);
    if (!hasFiles) {
      result.emailStatus = "skipped";
      result.emailError  = "No report files generated";
      console.log(`[GenerationJob] ${acc.customer_name}: Email skipped — no files to attach`);
    } else {
      // Build attachments from in-memory buffers
      const accountSlug = (acc.customer_name as string).replace(/[^a-z0-9]/gi, "_");
      const weekLabel   = ws.replace(/-/g, "");
      const attachments: { name: string; contentType: string; contentBytes: string }[] = [];
      let hasPdfAttach = false;
      let hasXlsAttach = false;

      if (pdfResult && pdfResult.buffer.length > 100) {
        attachments.push({
          name: `Schedule_${accountSlug}_${weekLabel}.pdf`,
          contentType: "application/pdf",
          contentBytes: pdfResult.buffer.toString("base64"),
        });
        hasPdfAttach = true;
      }
      if (xlsResult && xlsResult.buffer.length > 100) {
        attachments.push({
          name: `Hours_${accountSlug}_${weekLabel}.xlsx`,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          contentBytes: xlsResult.buffer.toString("base64"),
        });
        hasXlsAttach = true;
      }

      const contactName = acc.report_contact_name || acc.primary_contact_name || "there";
      let ccList: string[] = [];
      try { ccList = JSON.parse(acc.report_cc_emails ?? "[]"); } catch {}

      const subject  = `Weekly Driver Schedule & Hours \u2013 ${acc.customer_name} \u2013 Week of ${fmtDate(ws)}`;
      const bodyHtml = buildEmailBody(acc.customer_name, ws, we, contactName, hasPdfAttach, hasXlsAttach);

      const emailResult = await attemptSendEmail({
        to:          toList,
        cc:          ccList.length > 0 ? ccList : undefined,
        subject,
        bodyHtml,
        attachments,
      });

      if (emailResult.ok) {
        result.emailSent   = true;
        result.emailStatus = "success";
        console.log(`[GenerationJob] ${acc.customer_name}: Email sent → ${emailTo}`);
      } else {
        result.emailStatus = "failed";
        result.emailError  = emailResult.error;
        result.errors.push(`Email: ${emailResult.error}`);
        console.error(`[GenerationJob] ${acc.customer_name}: Email failed — ${emailResult.error}`);
      }
    }
  }

  // ── Step 5: Determine generation status ───────────────────────────────────
  const genErrors = result.errors.filter(e => !e.startsWith("Email:"));
  if (genErrors.length === 0 && (result.pdfGenerated || result.excelGenerated || (!includePdf && !includeExcel))) {
    result.status = (result.pdfGenerated || result.excelGenerated) ? "success" : "skipped";
  } else if (result.pdfGenerated || result.excelGenerated) {
    result.status = "partial";
  } else if (!includePdf && !includeExcel) {
    result.status = "skipped";
  } else {
    result.status = "failed";
  }

  // ── Step 5b: Log ──────────────────────────────────────────────────────────
  const logErrorMsg = result.errors.length > 0 ? result.errors.join("; ") : null;
  await logGeneration({
    accountId,
    reportWeek:         ws,
    pdfGenerated:       result.pdfGenerated,
    excelGenerated:     result.excelGenerated,
    status:             result.status,
    errorMessage:       logErrorMsg,
    triggeredBy,
    emailSent:          result.emailSent,
    emailSentAt:        result.emailSent ? new Date() : null,
    emailStatus:        result.emailStatus,
    emailErrorMessage:  result.emailError ?? null,
  });

  return result;
}

// ── Batch result type ──────────────────────────────────────────────────────────
export interface GenerationBatchResult {
  attempted:    number;
  succeeded:    number;
  partial:      number;
  skipped:      number;
  failed:       number;
  emailsSent:   number;
  emailsFailed: number;
  errors:       string[];
  weekStart:    string;
  weekEnd:      string;
}

// ── Full batch — all enabled accounts ─────────────────────────────────────────
export async function runWeeklyGenerationBatch(
  opts: { weekStart?: string; weekEnd?: string; triggeredBy?: "scheduler" | "manual" } = {}
): Promise<GenerationBatchResult> {
  const { weekStart: ws, weekEnd: we } = opts.weekStart && opts.weekEnd
    ? { weekStart: opts.weekStart, weekEnd: opts.weekEnd }
    : getUpcomingWeekBounds();

  const trigger = opts.triggeredBy ?? "scheduler";

  const result: GenerationBatchResult = {
    attempted: 0, succeeded: 0, partial: 0, skipped: 0, failed: 0,
    emailsSent: 0, emailsFailed: 0, errors: [], weekStart: ws, weekEnd: we,
  };

  try {
    const accountsRaw = await db.execute(sql`
      SELECT id, customer_name
      FROM customers
      WHERE send_weekly_report = true
        AND is_deleted = false
        AND status = 'Active'
      ORDER BY customer_name
    `);
    const accounts: any[] = (accountsRaw as any).rows ?? [];

    for (const acc of accounts) {
      result.attempted++;
      try {
        const r = await generateReportsForAccount(acc.id, ws, we, trigger);
        if      (r.status === "success") result.succeeded++;
        else if (r.status === "partial") result.partial++;
        else if (r.status === "skipped") result.skipped++;
        else {
          result.failed++;
          result.errors.push(`${acc.customer_name}: ${r.errors.join("; ")}`);
        }
        if (r.emailSent)                          result.emailsSent++;
        if (r.emailStatus === "failed")           result.emailsFailed++;
      } catch (e: any) {
        result.failed++;
        result.errors.push(`${acc.customer_name}: ${e?.message ?? String(e)}`);
      }
    }
  } catch (outerErr: any) {
    result.errors.push(`Batch init error: ${outerErr?.message ?? outerErr}`);
  }

  console.log(
    `[GenerationJob] Batch complete: attempted=${result.attempted}, success=${result.succeeded}, ` +
    `partial=${result.partial}, skipped=${result.skipped}, failed=${result.failed}, ` +
    `emailsSent=${result.emailsSent}, emailsFailed=${result.emailsFailed}`
  );

  return result;
}

// ── Scheduled hourly poll — runs accounts whose send_day+send_time matches now ──
export async function runScheduledGenerationPoll(): Promise<void> {
  const { dayName, timeHHMM } = getCurrentCstDayTime();

  const [currentHH, currentMM] = timeHHMM.split(":").map(Number);
  const currentTotalMins = currentHH * 60 + currentMM;

  try {
    const accountsRaw = await db.execute(sql`
      SELECT id, customer_name, report_send_day, report_send_time
      FROM customers
      WHERE send_weekly_report = true
        AND is_deleted = false
        AND status = 'Active'
        AND LOWER(report_send_day) = ${dayName}
    `);
    const accounts: any[] = (accountsRaw as any).rows ?? [];

    const due = accounts.filter(acc => {
      if (!acc.report_send_time) return false;
      const [hh, mm] = (acc.report_send_time as string).split(":").map(Number);
      const totalMins = hh * 60 + mm;
      return Math.abs(totalMins - currentTotalMins) <= 10; // ±10 min window
    });

    if (due.length === 0) return;

    console.log(`[GenerationPoll] ${due.length} account(s) due for generation+email at ${timeHHMM} CST`);

    const { weekStart: ws, weekEnd: we } = getUpcomingWeekBounds();
    for (const acc of due) {
      try {
        const r = await generateReportsForAccount(acc.id, ws, we, "scheduler");
        const emailNote = r.emailStatus === "success"
          ? " | email sent"
          : r.emailStatus === "skipped"
          ? " | email skipped"
          : r.emailStatus === "failed"
          ? ` | email failed: ${r.emailError}`
          : "";
        console.log(`[GenerationPoll] ${acc.customer_name}: ${r.status}${r.errors.filter(e => !e.startsWith("Email:")).length ? " — " + r.errors.join("; ") : ""}${emailNote}`);
      } catch (e: any) {
        console.error(`[GenerationPoll] ${acc.customer_name} error:`, e.message);
      }
    }
  } catch (e: any) {
    console.error("[GenerationPoll] Poll error:", e.message);
  }
}

// ── DriverShift Global Weekly Batch (Ticket 2.3) ───────────────────────────────
/**
 * Runs every Monday at 6:00 AM CST for ALL active DriverShift accounts.
 * Generates:
 *   1. Weekly Shift Report PDF  (weeklyShiftReportPdfService)
 *   2. Shift Detail Excel       (hoursReportExcelService)
 * Both reports cover the PREVIOUS full week (Mon–Sun).
 * Files are stored to account_documents; no email is sent.
 */

export interface DriverShiftBatchResult {
  attempted:   number;
  succeeded:   number;
  partial:     number;
  failed:      number;
  errors:      string[];
  weekStart:   string;
  weekEnd:     string;
  accounts:    Array<{
    accountId:   string;
    accountName: string;
    status:      "success" | "partial" | "failed";
    pdfOk:       boolean;
    excelOk:     boolean;
    error?:      string;
  }>;
}

async function logDriverShiftRun(opts: {
  accountId:    string;
  reportWeek:   string;
  pdfGenerated: boolean;
  excelGenerated: boolean;
  status:       string;
  errorMessage?: string | null;
}): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO account_report_logs
        (account_id, report_week, pdf_generated, excel_generated,
         status, error_message, triggered_by)
      VALUES
        (${opts.accountId}, ${opts.reportWeek}::date,
         ${opts.pdfGenerated}, ${opts.excelGenerated},
         ${opts.status}, ${opts.errorMessage ?? null},
         'drivershift_weekly')
      ON CONFLICT DO NOTHING
    `);
  } catch (logErr: any) {
    console.warn("[DriverShiftBatch] Log insert failed:", logErr?.message);
  }
}

export async function runDriverShiftWeeklyBatch(
  opts: { weekStart?: string; weekEnd?: string } = {}
): Promise<DriverShiftBatchResult> {
  // If dates provided explicitly (manual trigger / testing), use them.
  // Otherwise default to the previous full week.
  const { weekStart: ws, weekEnd: we } = (opts.weekStart && opts.weekEnd)
    ? { weekStart: opts.weekStart, weekEnd: opts.weekEnd }
    : getPreviousWeekBounds();

  const result: DriverShiftBatchResult = {
    attempted: 0, succeeded: 0, partial: 0, failed: 0,
    errors: [], weekStart: ws, weekEnd: we, accounts: [],
  };

  console.log(`[DriverShiftBatch] Starting — week ${ws} → ${we}`);

  // Query active DriverShift accounts (excludes Cancelled, Inactive, deleted)
  let accounts: any[];
  try {
    const raw = await db.execute(sql`
      SELECT id, customer_name,
             report_primary_emails, report_primary_email, primary_contact_email,
             report_contact_name,   primary_contact_name
      FROM customers
      WHERE driver_model = 'drivershift'
        AND is_deleted   = false
        AND status       = 'Active'
      ORDER BY customer_name
    `);
    accounts = (raw as any).rows ?? [];
  } catch (e: any) {
    const msg = `Query failed: ${e?.message}`;
    result.errors.push(msg);
    console.error("[DriverShiftBatch]", msg);
    return result;
  }

  console.log(`[DriverShiftBatch] ${accounts.length} eligible account(s) found`);

  for (const acc of accounts) {
    result.attempted++;
    let pdfOk    = false;
    let excelOk  = false;
    const errs: string[] = [];
    let pdfBuffer:  Buffer | null = null;
    let pdfFileName = "";
    let xlsBuffer:  Buffer | null = null;
    let xlsFileName = "";

    // ── Generate PDF ────────────────────────────────────────────────────────
    try {
      const { generateWeeklyShiftReport } = await import("./weeklyShiftReportPdfService");
      const pdfRes = await generateWeeklyShiftReport({
        customerId:  acc.id,
        accountName: acc.customer_name,
        weekStart:   ws,
        weekEnd:     we,
      });

      if (pdfRes.buffer.length > 500) {
        const { storeScheduleReport } = await import("./scheduleReportStorageService");
        await storeScheduleReport({
          customerId:  acc.id,
          accountName: acc.customer_name,
          weekStart:   ws,
          weekEnd:     we,
          buffer:      pdfRes.buffer,
          fileName:    pdfRes.fileName,
          shiftCount:  pdfRes.shiftCount,
          driverCount: pdfRes.driverCount,
        });
        pdfOk      = true;
        pdfBuffer  = pdfRes.buffer;
        pdfFileName = pdfRes.fileName;
        console.log(`[DriverShiftBatch] ${acc.customer_name}: PDF OK (${pdfRes.shiftCount} shifts)`);
      } else {
        errs.push("PDF: empty buffer");
      }
    } catch (e: any) {
      errs.push(`PDF: ${e?.message ?? String(e)}`);
      console.warn(`[DriverShiftBatch] ${acc.customer_name}: PDF failed — ${e?.message}`);
    }

    // ── Generate Excel ──────────────────────────────────────────────────────
    try {
      const { generateHoursExcel } = await import("./hoursReportExcelService");
      const xlRes = await generateHoursExcel({
        customerId:  acc.id,
        accountName: acc.customer_name,
        weekStart:   ws,
        weekEnd:     we,
      });

      if (xlRes.buffer.length > 500) {
        const { storeHoursReport } = await import("./hoursReportStorageService");
        await storeHoursReport({
          customerId:       acc.id,
          accountName:      acc.customer_name,
          weekStart:        ws,
          weekEnd:          we,
          buffer:           xlRes.buffer,
          fileName:         xlRes.fileName,
          entryCount:       xlRes.shiftCount,
          driverCount:      xlRes.driverCount,
          totalHours:       0,
          totalOtHours:     0,
          uploadedByUserId: null,
        });
        excelOk     = true;
        xlsBuffer   = xlRes.buffer;
        xlsFileName = xlRes.fileName;
        console.log(`[DriverShiftBatch] ${acc.customer_name}: Excel OK (${xlRes.shiftCount} shifts)`);
      } else {
        errs.push("Excel: empty buffer");
      }
    } catch (e: any) {
      errs.push(`Excel: ${e?.message ?? String(e)}`);
      console.warn(`[DriverShiftBatch] ${acc.customer_name}: Excel failed — ${e?.message}`);
    }

    // ── Email delivery ───────────────────────────────────────────────────────
    if (isMicrosoftGraphConfigured() && (pdfBuffer || xlsBuffer)) {
      // Resolve recipients
      let toList: string[] = [];
      try { toList = JSON.parse(acc.report_primary_emails ?? "[]"); } catch {}
      if (toList.length === 0 && acc.report_primary_email) toList = [acc.report_primary_email];
      if (toList.length === 0 && acc.primary_contact_email) toList = [acc.primary_contact_email];

      if (toList.length > 0) {
        try {
          const fmtMDY = (iso: string) => {
            const [y, m, d] = iso.split("-");
            return `${m}/${d}/${y}`;
          };
          const contactName = acc.report_contact_name || acc.primary_contact_name || "Team";
          const subject = `Weekly Driver Schedule Report – ${acc.customer_name} – ${fmtMDY(ws)} – ${fmtMDY(we)}`;
          const bodyHtml = `
<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; color: #333; font-size: 14px; line-height: 1.6; }
  .header { background-color: #1F2A6D; color: white; padding: 20px 30px; }
  .header h1 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.01em; }
  .header p  { margin: 4px 0 0; font-size: 13px; opacity: 0.75; }
  .body   { padding: 28px 30px; }
  .footer { padding: 16px 30px; font-size: 11px; color: #888; border-top: 1px solid #eee; }
</style></head>
<body>
  <div class="header">
    <h1>Weekly Driver Schedule Report</h1>
    <p>${acc.customer_name} &mdash; ${fmtMDY(ws)} &ndash; ${fmtMDY(we)}</p>
  </div>
  <div class="body">
    <p>Hello ${contactName},</p>
    <p>Attached is your Weekly Driver Schedule Report for the week of <strong>${fmtMDY(ws)} &ndash; ${fmtMDY(we)}</strong>.</p>
    <p>This report includes scheduled and completed shifts for your team.</p>
    <p>If you have any questions, please contact our team.</p>
    <p>Thank you,<br>Driver on Demand</p>
  </div>
  <div class="footer">Generated by DriverHub 360 &mdash; Week ${ws} &ndash; ${we}</div>
</body></html>`.trim();

          const attachments = [];
          if (pdfBuffer && pdfFileName) {
            attachments.push({
              name: pdfFileName,
              contentType: "application/pdf",
              contentBytes: pdfBuffer.toString("base64"),
            });
          }
          if (xlsBuffer && xlsFileName) {
            attachments.push({
              name: xlsFileName,
              contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              contentBytes: xlsBuffer.toString("base64"),
            });
          }

          const emailResult = await sendEmail({ to: toList, subject, bodyHtml, attachments });
          if (emailResult.ok) {
            console.log(`[DriverShiftBatch] ${acc.customer_name}: Email sent → ${toList.join(", ")}`);
          } else if (emailResult.skipped) {
            console.log(`[DriverShiftBatch] ${acc.customer_name}: Email skipped (Graph not configured)`);
          } else {
            console.warn(`[DriverShiftBatch] ${acc.customer_name}: Email failed — ${emailResult.error}`);
            errs.push(`Email: ${emailResult.error}`);
          }
        } catch (emailErr: any) {
          console.warn(`[DriverShiftBatch] ${acc.customer_name}: Email error — ${emailErr?.message}`);
          errs.push(`Email: ${emailErr?.message}`);
        }
      } else {
        console.log(`[DriverShiftBatch] ${acc.customer_name}: No recipients configured, skipping email`);
      }
    }

    // ── Determine account status ─────────────────────────────────────────────
    const status: "success" | "partial" | "failed" =
      pdfOk && excelOk ? "success" :
      pdfOk || excelOk ? "partial" :
                         "failed";

    if      (status === "success") result.succeeded++;
    else if (status === "partial") result.partial++;
    else {
      result.failed++;
      result.errors.push(`${acc.customer_name}: ${errs.join("; ")}`);
    }

    result.accounts.push({
      accountId:   acc.id,
      accountName: acc.customer_name,
      status,
      pdfOk,
      excelOk,
      error: errs.length > 0 ? errs.join("; ") : undefined,
    });

    // ── Log ──────────────────────────────────────────────────────────────────
    await logDriverShiftRun({
      accountId:     acc.id,
      reportWeek:    ws,
      pdfGenerated:  pdfOk,
      excelGenerated: excelOk,
      status,
      errorMessage:  errs.length > 0 ? errs.join("; ") : null,
    });
  }

  console.log(
    `[DriverShiftBatch] Done — attempted=${result.attempted}, ` +
    `success=${result.succeeded}, partial=${result.partial}, failed=${result.failed}`
  );

  return result;
}
