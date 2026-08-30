/**
 * lossAccrualReportService.ts
 *
 * Generates and delivers the Weekly Loss Accrual Report via the DriverHub
 * centralized email infrastructure (Microsoft Graph).
 *
 * FINANCIAL FIELD MAPPING:
 *   Total Estimated Loss  → accidents.probable_cost
 *   Paid to Date          → accidents.actual_cost (NULL treated as $0)
 *   Outstanding Exposure  → MAX(0, probable_cost - actual_cost)
 *   Missing Estimate      → probable_cost IS NULL — excluded from totals
 *
 * REPORT SCOPE:
 *   Open claims only: claimStatus NOT IN {CLOSED, PAID, DENIED}
 *   Incident date:    >= 2026-02-09 (DriverHub acquisition date)
 */

import { pool } from "../db";

const ACQUISITION_DATE = "2026-02-09";

const CLOSED_STATUSES = new Set([
  "CLOSED", "PAID", "DENIED",
  "closed", "denied", "denied_abandoned", "abandoned",
  "driver_paid", "dod_paid", "insurance_paid", "paid_other_insurance", "paid_jri",
]);

interface ReportRow {
  id: string;
  displayClaimId: string | null;
  redcapId: string | null;
  incidentDate: string | null;
  driverName: string;
  driverId: string | null;
  effectiveStatus: string;
  probableCost: number | null;
  actualCost: number;
  outstanding: number | null;
  missingEstimate: boolean;
}

interface ReportSummary {
  openClaims: number;
  totalEstimated: number;
  totalPaid: number;
  totalOutstanding: number;
  missingEstimateCount: number;
}

export async function buildLossAccrualReportData(): Promise<{ rows: ReportRow[]; summary: ReportSummary; reportDate: Date }> {
  const reportDate = new Date();

  // Fetch qualifying open claims with resolved driver name
  const result = await pool.query(
    `SELECT
       a.id,
       a.display_claim_id,
       a.redcap_id,
       COALESCE(a.incident_date::text, a.accident_date::text) AS incident_date,
       a.claim_status,
       a.status AS operational_status,
       a.probable_cost,
       COALESCE(a.actual_cost, 0) AS actual_cost,
       a.driver_id,
       a.resolved_driver_id,
       a.driver_name,
       COALESCE(a.driver_name, TRIM(CONCAT(u.first_name, ' ', u.last_name)), 'Unassigned') AS resolved_driver_name
     FROM accidents a
     LEFT JOIN drivers d ON d.id = COALESCE(a.resolved_driver_id, a.driver_id)
     LEFT JOIN users u ON u.id = d.user_id
     WHERE
       COALESCE(a.incident_date, a.accident_date) >= $1
     ORDER BY COALESCE(a.incident_date, a.accident_date) DESC`,
    [ACQUISITION_DATE]
  );

  const rows: ReportRow[] = [];
  let totalEstimated = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;
  let missingEstimateCount = 0;

  for (const r of result.rows) {
    const cs = (r.claim_status || "").toUpperCase();
    const os = (r.operational_status || "").toLowerCase();
    if (CLOSED_STATUSES.has(cs) || CLOSED_STATUSES.has(os)) continue;

    const prob = r.probable_cost !== null && r.probable_cost !== undefined ? parseFloat(r.probable_cost) : null;
    const act = parseFloat(r.actual_cost ?? "0");
    const missingEst = prob === null || isNaN(prob);
    const exp = missingEst ? null : Math.max(0, prob! - (isNaN(act) ? 0 : act));
    const effectiveStatus = r.operational_status || r.claim_status || "DRAFT";

    if (missingEst) {
      missingEstimateCount++;
    } else {
      totalEstimated += prob!;
      totalPaid += isNaN(act) ? 0 : act;
      totalOutstanding += exp!;
    }

    rows.push({
      id: r.id,
      displayClaimId: r.display_claim_id,
      redcapId: r.redcap_id,
      incidentDate: r.incident_date,
      driverName: r.resolved_driver_name || "Unassigned",
      driverId: r.resolved_driver_id || r.driver_id,
      effectiveStatus,
      probableCost: missingEst ? null : prob,
      actualCost: isNaN(act) ? 0 : act,
      outstanding: exp,
      missingEstimate: missingEst,
    });
  }

  return {
    rows,
    summary: {
      openClaims: rows.length,
      totalEstimated,
      totalPaid,
      totalOutstanding,
      missingEstimateCount,
    },
    reportDate,
  };
}

function buildCsv(rows: ReportRow[], reportDate: Date): string {
  const fmt$ = (n: number | null) =>
    n === null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
  const fmtDate = (s: string | null) => {
    if (!s) return "—";
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  };
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rptDate = reportDate.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });

  const header = `Weekly Loss Accrual Report,Report Date: ${rptDate}`;
  const col = ["Claim #", "Incident Date", "Driver", "Claim Status", "Total Estimated Loss", "Paid to Date", "Outstanding Exposure", "Notes"].join(",");
  const dataRows = rows.map(r => {
    const claimNum = r.displayClaimId || r.redcapId || r.id.slice(0, 8);
    const notes = r.missingEstimate ? "Missing estimated loss" : "";
    return [
      q(claimNum),
      q(fmtDate(r.incidentDate)),
      q(r.driverName),
      q(r.effectiveStatus),
      r.probableCost === null ? "—" : r.probableCost.toFixed(2),
      r.actualCost.toFixed(2),
      r.outstanding === null ? "—" : r.outstanding.toFixed(2),
      q(notes),
    ].join(",");
  });

  return [header, col, ...dataRows].join("\n");
}

function buildEmailHtml(summary: ReportSummary, reportDate: Date, rows: ReportRow[]): string {
  const fmt$ = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
  const rptDate = reportDate.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });

  const warning = summary.missingEstimateCount > 0
    ? `<p style="color:#b45309;background:#fffbeb;border:1px solid #fcd34d;padding:8px 12px;border-radius:6px;font-size:13px;margin-bottom:16px;">
        ⚠️ <strong>${summary.missingEstimateCount} claim(s)</strong> are missing estimated loss data and are excluded from totals.
       </p>`
    : "";

  return `<!DOCTYPE html><html><body style="font-family:sans-serif;color:#182039;max-width:600px;margin:0 auto;padding:24px;">
    <h2 style="margin:0 0 4px;font-size:18px;">Weekly Loss Accrual Report</h2>
    <p style="margin:0 0 20px;color:#64748b;font-size:13px;">Report Date: ${rptDate}</p>
    ${warning}
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
      <tr style="background:#f7f8fc;"><th style="text-align:left;padding:8px;border:1px solid #e4e7ee;">Open Claims</th><td style="text-align:right;padding:8px;border:1px solid #e4e7ee;font-weight:600;">${summary.openClaims.toLocaleString()}</td></tr>
      <tr><th style="text-align:left;padding:8px;border:1px solid #e4e7ee;">Total Estimated Losses</th><td style="text-align:right;padding:8px;border:1px solid #e4e7ee;">${fmt$(summary.totalEstimated)}</td></tr>
      <tr style="background:#f7f8fc;"><th style="text-align:left;padding:8px;border:1px solid #e4e7ee;">Total Paid to Date</th><td style="text-align:right;padding:8px;border:1px solid #e4e7ee;">${fmt$(summary.totalPaid)}</td></tr>
      <tr style="border-top:2px solid #5737f2;"><th style="text-align:left;padding:8px;border:1px solid #e4e7ee;font-weight:700;">Total Outstanding Exposure</th><td style="text-align:right;padding:8px;border:1px solid #e4e7ee;font-weight:700;color:#5737f2;">${fmt$(summary.totalOutstanding)}</td></tr>
    </table>
    <p style="font-size:12px;color:#94a3b8;">The full claim detail is attached as a CSV file. Log in to DriverHub for interactive drill-down.</p>
  </body></html>`;
}

export async function runLossAccrualReportDelivery(): Promise<void> {
  // Load schedule config
  const cfgResult = await pool.query(
    "SELECT * FROM claim_report_schedules WHERE report_type = 'loss_accrual' LIMIT 1"
  );
  if (cfgResult.rows.length === 0) {
    console.log("[LossAccrualReport] No schedule config found — skipping delivery");
    return;
  }
  const cfg = cfgResult.rows[0];
  if (!cfg.enabled) {
    console.log("[LossAccrualReport] Delivery disabled — skipping");
    return;
  }
  const recipients: string[] = Array.isArray(cfg.recipients) ? cfg.recipients : JSON.parse(cfg.recipients || "[]");
  if (recipients.length === 0) {
    console.log("[LossAccrualReport] No recipients configured — skipping delivery");
    return;
  }

  let status: "sent" | "failed" = "failed";
  let errorMessage: string | undefined;
  let reportData: { rows: ReportRow[]; summary: ReportSummary; reportDate: Date } | undefined;

  try {
    reportData = await buildLossAccrualReportData();
    const { rows, summary, reportDate } = reportData;

    const rptDate = reportDate.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
    const subject = (cfg.email_subject as string).replace(/\{\{date\}\}/gi, rptDate);
    const csvContent = buildCsv(rows, reportDate);
    const htmlBody = buildEmailHtml(summary, reportDate, rows);
    const csvBase64 = Buffer.from(csvContent, "utf-8").toString("base64");

    const { sendEmail, isMicrosoftGraphConfigured } = await import("./microsoftGraphService");
    if (!isMicrosoftGraphConfigured()) {
      throw new Error("Microsoft Graph email is not configured");
    }

    await sendEmail({
      to: recipients,
      subject,
      bodyHtml: htmlBody,
      attachments: [
        {
          name: `loss-accrual-report-${rptDate.replace(/\//g, "-")}.csv`,
          contentType: "text/csv",
          contentBase64: csvBase64,
        },
      ],
    });

    status = "sent";
    console.log(`[LossAccrualReport] Delivered to ${recipients.length} recipient(s): ${recipients.join(", ")}`);

    // Update last_sent_at
    await pool.query(
      "UPDATE claim_report_schedules SET last_sent_at = NOW(), updated_at = NOW() WHERE report_type = 'loss_accrual'"
    );
  } catch (err: any) {
    errorMessage = err?.message || String(err);
    console.error("[LossAccrualReport] Delivery failed:", errorMessage);
  }

  // Log delivery attempt
  try {
    await pool.query(
      `INSERT INTO claim_report_delivery_log (report_type, status, recipients, error_message, claim_count, total_exposure)
       VALUES ('loss_accrual', $1, $2, $3, $4, $5)`,
      [
        status,
        JSON.stringify(recipients),
        errorMessage || null,
        reportData?.summary.openClaims ?? null,
        reportData?.summary.totalOutstanding ?? null,
      ]
    );
  } catch (logErr) {
    console.error("[LossAccrualReport] Failed to write delivery log:", logErr);
  }
}
