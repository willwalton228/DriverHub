/**
 * WIW Shift Invoice PDF Service
 * Generates a branded Driver on Demand shift invoice PDF using Puppeteer.
 *
 * Billing logic: Straight time only (ICs). No overtime.
 * Bill Amount = Total Hours × Bill Rate (one row per driver per date)
 */

import puppeteer from "puppeteer";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

export interface ShiftRow {
  date: string;
  dateISO: string;
  positionName: string;
  driverName: string;
  scheduledStart: string;
  scheduledEnd: string;
  clockIn: string | null;
  clockOut: string | null;
  billableHrs: number;
  approvalStatus: string | null;
}

export interface WiwShiftInvoicePdfOptions {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  weekEnding: string;
  dealerId: string;
  billRate: number;
  accountName: string;
  shifts: ShiftRow[];
}

// ── Logo loader ───────────────────────────────────────────────────────────────

function loadLogoBase64(): string {
  const candidates = [
    path.resolve("server/assets/dod-logo.png"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const buf = fs.readFileSync(p);
      return `data:image/png;base64,${buf.toString("base64")}`;
    }
  }
  return ""; // no logo available
}

// ── Currency formatter ────────────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

// ── HTML template ─────────────────────────────────────────────────────────────

function buildHtml(opts: WiwShiftInvoicePdfOptions): string {
  const { invoiceNumber, invoiceDate, dueDate, weekEnding, dealerId, billRate, accountName, shifts } = opts;

  const logoDataUri = loadLogoBase64();

  // Sort by date then driver name
  const sorted = [...shifts].sort((a, b) => {
    const dateCmp = (a.dateISO || a.date).localeCompare(b.dateISO || b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.driverName.localeCompare(b.driverName);
  });

  // Calculate amounts
  const rows = sorted.map((s) => ({
    ...s,
    startTime:  s.clockIn ?? s.scheduledStart,
    endTime:    s.clockOut ?? s.scheduledEnd,
    billAmount: Math.round(s.billableHrs * billRate * 100) / 100,
  }));

  const grandTotal = rows.reduce((sum, r) => sum + r.billAmount, 0);
  const totalHours = rows.reduce((sum, r) => sum + r.billableHrs, 0);

  // Group by date for subtotals
  const dateGroups: Record<string, typeof rows> = {};
  for (const row of rows) {
    const key = row.dateISO || row.date;
    if (!dateGroups[key]) dateGroups[key] = [];
    dateGroups[key].push(row);
  }

  // Build table rows with date grouping
  let tableRows = "";
  for (const [, dayRows] of Object.entries(dateGroups)) {
    for (const row of dayRows) {
      const approvedMark = row.approvalStatus === "approved" ? "✓" : "";
      tableRows += `
        <tr>
          <td>${row.date}</td>
          <td>${row.positionName}</td>
          <td>${row.driverName}</td>
          <td>${row.startTime}</td>
          <td>${row.endTime}</td>
          <td class="num">${fmtCurrency(billRate)}</td>
          <td class="num">${row.billableHrs.toFixed(2)}</td>
          <td class="num amt">${fmtCurrency(row.billAmount)}</td>
        </tr>`;
    }
    // Day subtotal
    const dayTotal = dayRows.reduce((s, r) => s + r.billAmount, 0);
    const dayHrs   = dayRows.reduce((s, r) => s + r.billableHrs, 0);
    tableRows += `
      <tr class="subtotal-row">
        <td colspan="6" class="subtotal-label">Daily Total — ${dayRows[0].date}</td>
        <td class="num">${dayHrs.toFixed(2)}</td>
        <td class="num">${fmtCurrency(dayTotal)}</td>
      </tr>`;
  }

  const formattedInvoiceDate = new Date(invoiceDate + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const formattedDueDate     = new Date(dueDate     + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const formattedWeekEnding  = new Date(weekEnding  + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 10pt;
    color: #1B1B1B;
    background: #fff;
    padding: 32px 40px;
  }

  /* ── Header ── */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 28px;
    padding-bottom: 20px;
    border-bottom: 3px solid #0067B8;
  }
  .header-left img.logo {
    max-height: 70px;
    max-width: 220px;
    object-fit: contain;
  }
  .header-left .company-name {
    font-size: 18pt;
    font-weight: 700;
    color: #0067B8;
    letter-spacing: -0.5px;
    margin-bottom: 2px;
  }
  .header-left .company-sub {
    font-size: 9pt;
    color: #555;
  }
  .header-right {
    text-align: right;
  }
  .invoice-title {
    font-size: 26pt;
    font-weight: 700;
    color: #0067B8;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  .invoice-meta {
    margin-top: 6px;
    font-size: 9pt;
    color: #444;
    line-height: 1.6;
  }
  .invoice-meta strong { color: #1B1B1B; }

  /* ── Bill To / From ── */
  .parties {
    display: flex;
    justify-content: space-between;
    gap: 32px;
    margin-bottom: 24px;
  }
  .party-block {
    flex: 1;
  }
  .party-label {
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #0067B8;
    margin-bottom: 5px;
    padding-bottom: 3px;
    border-bottom: 1px solid #0067B8;
  }
  .party-name {
    font-size: 10.5pt;
    font-weight: 700;
    color: #1B1B1B;
    margin-bottom: 2px;
  }
  .party-detail {
    font-size: 9pt;
    color: #555;
    line-height: 1.5;
  }
  .dealer-badge {
    display: inline-block;
    background: #0067B8;
    color: #fff;
    font-size: 8.5pt;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 3px;
    margin-top: 5px;
    letter-spacing: 0.5px;
  }

  /* ── Period banner ── */
  .period-banner {
    background: #f0f5fb;
    border-left: 4px solid #0067B8;
    padding: 8px 14px;
    margin-bottom: 20px;
    border-radius: 0 4px 4px 0;
    font-size: 9.5pt;
  }
  .period-banner strong { color: #0067B8; }

  /* ── Data table ── */
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
    font-size: 9pt;
  }
  thead tr {
    background: #0067B8;
    color: #fff;
  }
  thead th {
    padding: 7px 8px;
    text-align: left;
    font-weight: 600;
    font-size: 8.5pt;
    letter-spacing: 0.3px;
    white-space: nowrap;
  }
  thead th.num { text-align: right; }

  tbody tr { border-bottom: 1px solid #e8ecf0; }
  tbody tr:nth-child(even) { background: #f7f9fc; }
  tbody tr:hover { background: #edf3fb; }

  td {
    padding: 6px 8px;
    vertical-align: middle;
    white-space: nowrap;
  }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.amt { font-weight: 600; color: #1B1B1B; }

  tr.subtotal-row {
    background: #dce8f5 !important;
    border-bottom: 2px solid #0067B8;
    border-top: 1px solid #b3cde8;
  }
  tr.subtotal-row td {
    font-weight: 600;
    font-size: 9pt;
    color: #003d7a;
    padding: 5px 8px;
  }
  td.subtotal-label { font-style: italic; }

  /* ── Totals block ── */
  .totals-section {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 24px;
  }
  .totals-box {
    width: 300px;
    border: 1px solid #c5d8ed;
    border-radius: 4px;
    overflow: hidden;
  }
  .totals-row {
    display: flex;
    justify-content: space-between;
    padding: 7px 14px;
    font-size: 9.5pt;
    border-bottom: 1px solid #e0ecf7;
  }
  .totals-row:last-child { border-bottom: none; }
  .totals-row.grand {
    background: #0067B8;
    color: #fff;
    font-size: 11pt;
    font-weight: 700;
  }
  .totals-row .lbl { color: inherit; }
  .totals-row .val { font-variant-numeric: tabular-nums; font-weight: 600; }

  /* ── Footer ── */
  .footer {
    margin-top: 28px;
    padding-top: 14px;
    border-top: 2px solid #0067B8;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    font-size: 8.5pt;
    color: #666;
  }
  .footer-notes { max-width: 65%; line-height: 1.5; }
  .footer-right { text-align: right; }
  .footer-right .thank-you {
    font-size: 10pt;
    font-weight: 700;
    color: #0067B8;
    margin-bottom: 2px;
  }

  .badge-ic {
    display: inline-block;
    background: #fff3cd;
    color: #856404;
    border: 1px solid #ffc107;
    border-radius: 3px;
    font-size: 8pt;
    font-weight: 600;
    padding: 1px 6px;
    margin-left: 6px;
  }
</style>
</head>
<body>

<!-- ── Header ── -->
<div class="header">
  <div class="header-left">
    ${logoDataUri
      ? `<img class="logo" src="${logoDataUri}" alt="Driver on Demand" />`
      : `<div class="company-name">Driver on Demand</div><div class="company-sub">Transportation Staffing Solutions</div>`}
  </div>
  <div class="header-right">
    <div class="invoice-title">Invoice</div>
    <div class="invoice-meta">
      <strong>Invoice #</strong> ${invoiceNumber}<br/>
      <strong>Invoice Date</strong> ${formattedInvoiceDate}<br/>
      <strong>Due Date</strong> ${formattedDueDate}<br/>
      <strong>Terms</strong> Net 30
    </div>
  </div>
</div>

<!-- ── Bill To / From ── -->
<div class="parties">
  <div class="party-block">
    <div class="party-label">Bill To</div>
    <div class="party-name">${accountName}</div>
    <div class="party-detail">
      <div class="dealer-badge">Dealer ID: ${dealerId}</div>
    </div>
  </div>
  <div class="party-block">
    <div class="party-label">Bill From</div>
    <div class="party-name">Driver on Demand</div>
    <div class="party-detail">
      Transportation Staffing Solutions<br/>
      accounts@driverondemand.co<br/>
      www.driverondemand.co
    </div>
  </div>
</div>

<!-- ── Period banner ── -->
<div class="period-banner">
  <strong>Billing Period:</strong> Services rendered for the week ending <strong>${formattedWeekEnding}</strong>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  <strong>Rate Type:</strong> Straight Time <span class="badge-ic">IC</span>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  <strong>Bill Rate:</strong> ${fmtCurrency(billRate)}/hr
</div>

<!-- ── Line Items Table ── -->
<table>
  <thead>
    <tr>
      <th>Shift Date</th>
      <th>Position</th>
      <th>Driver Name</th>
      <th>Start Time</th>
      <th>End Time</th>
      <th class="num">Bill Rate</th>
      <th class="num">Total Hours</th>
      <th class="num">Bill Amount</th>
    </tr>
  </thead>
  <tbody>
    ${tableRows}
  </tbody>
  <tfoot>
    <tr style="background:#e8f0f8; border-top:2px solid #0067B8;">
      <td colspan="6" style="font-weight:700; padding:8px; color:#003d7a;">Grand Total</td>
      <td class="num" style="font-weight:700; color:#003d7a;">${totalHours.toFixed(2)}</td>
      <td class="num" style="font-weight:700; color:#003d7a; font-size:10.5pt;">${fmtCurrency(grandTotal)}</td>
    </tr>
  </tfoot>
</table>

<!-- ── Totals block ── -->
<div class="totals-section">
  <div class="totals-box">
    <div class="totals-row">
      <span class="lbl">Total Hours</span>
      <span class="val">${totalHours.toFixed(2)} hrs</span>
    </div>
    <div class="totals-row">
      <span class="lbl">Bill Rate</span>
      <span class="val">${fmtCurrency(billRate)}/hr</span>
    </div>
    <div class="totals-row">
      <span class="lbl">Subtotal</span>
      <span class="val">${fmtCurrency(grandTotal)}</span>
    </div>
    <div class="totals-row grand">
      <span class="lbl">Amount Due</span>
      <span class="val">${fmtCurrency(grandTotal)}</span>
    </div>
  </div>
</div>

<!-- ── Footer ── -->
<div class="footer">
  <div class="footer-notes">
    All workers on this invoice are Independent Contractors (ICs). Hours are billed at straight time only — no overtime applies.
    Please remit payment within 30 days. Questions? Contact accounts@driverondemand.co.
  </div>
  <div class="footer-right">
    <div class="thank-you">Thank you for your business!</div>
    <div>Driver on Demand &mdash; Transportation Staffing Solutions</div>
  </div>
</div>

</body>
</html>`;
}

// ── Puppeteer launcher (reuses pattern from invoicePdfService) ────────────────

let _browser: any = null;

async function getBrowser() {
  if (_browser) {
    try { await _browser.pages(); return _browser; } catch { _browser = null; }
  }
  const { execSync } = await import("child_process");
  let executablePath: string | undefined;
  try {
    executablePath = execSync("which chromium || which chromium-browser || which google-chrome", { encoding: "utf8" }).trim().split("\n")[0] || undefined;
  } catch { executablePath = undefined; }

  _browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
    ],
  });
  return _browser;
}

export async function generateWiwShiftInvoicePdf(opts: WiwShiftInvoicePdfOptions): Promise<Buffer> {
  const html    = buildHtml(opts);
  const browser = await getBrowser();
  const page    = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "Letter",
      margin: { top: "0.5in", right: "0.5in", bottom: "0.6in", left: "0.5in" },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: `
        <div style="font-size:8pt;color:#888;width:100%;text-align:center;padding:0 40px;">
          Driver on Demand &mdash; Confidential &mdash; Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>`,
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await page.close();
  }
}
