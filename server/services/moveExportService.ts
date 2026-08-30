/**
 * Move Export Service (Task #85)
 * Executes scheduled Move List email exports.
 * Uses getTripsForExport (capped at 5,000 rows per Task #84) and sends via Resend.
 */

import { storage } from "../storage";
import * as XLSX from "xlsx";
import { Resend } from "resend";
import { getAppBaseUrl } from "../appConfig";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const APP_NAME = "DriverHub 360";
const APP_URL = getAppBaseUrl();

const EXPORT_COLUMNS = [
  { header: "Move #",           key: "moveNumber" },
  { header: "Date",             key: "tripDate" },
  { header: "Account",          key: "customerName" },
  { header: "Driver",           key: "driverName" },
  { header: "Type",             key: "moveType" },
  { header: "Status",           key: "status" },
  { header: "Origin",           key: "origin" },
  { header: "Destination",      key: "destination" },
  { header: "Miles",            key: "distance" },
  { header: "Source",           key: "sourceSystem" },
  { header: "DR Count",         key: "driverReturnCount" },
  { header: "Charges ($)",      key: "customerCharges" },
  { header: "Driver Pay ($)",   key: "driverPay" },
  { header: "Gross Profit ($)", key: "grossProfit" },
  { header: "Margin (%)",       key: "grossMargin" },
  { header: "Import Batch",     key: "importBatchId" },
];

/** Resolve the date window into concrete startDate/endDate strings */
function resolveDateWindow(schedule: any): { startDate?: string; endDate?: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  switch (schedule.dateWindow) {
    case "today":
      return { startDate: fmt(today), endDate: fmt(today) };
    case "this_week": {
      const d = new Date(today);
      const day = d.getDay();
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      return { startDate: fmt(d), endDate: fmt(today) };
    }
    case "this_month": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { startDate: fmt(first), endDate: fmt(today) };
    }
    case "last_7_days": {
      const d = new Date(today);
      d.setDate(d.getDate() - 7);
      return { startDate: fmt(d), endDate: fmt(today) };
    }
    case "last_30_days": {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      return { startDate: fmt(d), endDate: fmt(today) };
    }
    case "custom":
      return {
        startDate: schedule.filterStartDate ?? undefined,
        endDate: schedule.filterEndDate ?? undefined,
      };
    default:
      return {};
  }
}

function buildExcelBuffer(rows: any[]): Buffer {
  const wsData = [
    EXPORT_COLUMNS.map((c) => c.header),
    ...rows.map((row) =>
      EXPORT_COLUMNS.map((c) => {
        const v = row[c.key];
        if (v === null || v === undefined) return "";
        return String(v);
      })
    ),
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "Moves");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

export async function runMoveExportSchedule(schedule: any): Promise<{
  status: string;
  rowCount: number;
  truncated: boolean;
  recipients: string;
  errorMessage?: string;
}> {
  const scheduleId = schedule.id;
  const recipients: string[] = schedule.recipients
    .split(",")
    .map((e: string) => e.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    const entry = { scheduleId, status: "failed", recipients: schedule.recipients, errorMessage: "No valid recipients" };
    await storage.appendMoveExportRunLog(entry);
    return { status: "failed", rowCount: 0, truncated: false, recipients: schedule.recipients, errorMessage: "No valid recipients" };
  }

  try {
    const dates = resolveDateWindow(schedule);
    const filters = {
      moveNumber:    schedule.filterMoveNumber   ?? undefined,
      driver:        schedule.filterDriver        ?? undefined,
      customer:      schedule.filterCustomer      ?? undefined,
      status:        schedule.filterStatus        ?? undefined,
      moveType:      schedule.filterMoveType      ?? undefined,
      sourceSystem:  schedule.filterSourceSystem  ?? undefined,
      startDate:     dates.startDate,
      endDate:       dates.endDate,
      sortBy:        "tripDate",
      sortDir:       "desc",
      limit:         5000,
    };

    const { rows, truncated, cap } = await storage.getTripsForExport(filters);
    const rowCount = rows.length;
    const excelBuffer = buildExcelBuffer(rows);
    const today = new Date().toISOString().split("T")[0];
    const filename = `moves-export-${today}.xlsx`;

    if (!resend) {
      console.warn("[MoveExportService] Email not configured — logging run but not sending");
      const entry = { scheduleId, status: "skipped", rowCount, truncated, recipients: recipients.join(", "), errorMessage: "Email service not configured" };
      await storage.appendMoveExportRunLog(entry);
      return { status: "skipped", rowCount, truncated, recipients: recipients.join(", "), errorMessage: "Email service not configured" };
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const truncatedNote = truncated
      ? `<p style="color:#b45309;font-size:13px;margin:8px 0 0 0;">⚠️ Export was capped at ${cap.toLocaleString()} rows. Narrow your filters to retrieve all data.</p>`
      : "";

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Move List Export</title></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',sans-serif;background:#f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,.1);">
        <tr><td style="background:#FF6B35;padding:30px 40px;border-radius:12px 12px 0 0;">
          <h1 style="margin:0;color:#fff;font-size:28px;font-weight:600;">${APP_NAME}</h1>
          <p style="margin:10px 0 0;color:#fff;font-size:16px;opacity:.9;">Scheduled Move Export: ${schedule.name}</p>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="margin:0 0 20px;color:#52525b;font-size:16px;line-height:1.6;">
            Your scheduled Move List export is attached. It contains <strong>${rowCount.toLocaleString()} move${rowCount !== 1 ? "s" : ""}</strong>
            for the <strong>${schedule.cronLabel ?? schedule.cronExpression}</strong> run.
          </p>
          ${truncatedNote}
          <p style="margin:24px 0 0;color:#71717a;font-size:13px;">
            View the full Move List at <a href="${APP_URL}/trips" style="color:#FF6B35;">${APP_URL}/trips</a>
          </p>
        </td></tr>
        <tr><td style="background:#fafafa;padding:20px 40px;border-radius:0 0 12px 12px;text-align:center;">
          <p style="margin:0;color:#a1a1aa;font-size:12px;">&copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const { error } = await resend.emails.send({
      from: `${APP_NAME} <${fromEmail}>`,
      to: recipients,
      subject: `Move Export: ${schedule.name} — ${today}`,
      html,
      attachments: [
        {
          filename,
          content: excelBuffer.toString("base64"),
        },
      ],
    });

    if (error) {
      const entry = { scheduleId, status: "failed", rowCount, truncated, recipients: recipients.join(", "), errorMessage: error.message };
      await storage.appendMoveExportRunLog(entry);
      return { status: "failed", rowCount, truncated, recipients: recipients.join(", "), errorMessage: error.message };
    }

    const entry = { scheduleId, status: "success", rowCount, truncated, recipients: recipients.join(", ") };
    await storage.appendMoveExportRunLog(entry);
    return { status: "success", rowCount, truncated, recipients: recipients.join(", ") };
  } catch (err: any) {
    const msg = err?.message ?? "Unknown error";
    const entry = { scheduleId, status: "failed", recipients: recipients.join(", "), errorMessage: msg };
    await storage.appendMoveExportRunLog(entry);
    return { status: "failed", rowCount: 0, truncated: false, recipients: recipients.join(", "), errorMessage: msg };
  }
}
