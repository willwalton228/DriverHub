/**
 * Invoice HTML Template — Driver on Demand
 * Reusable HTML/CSS invoice template used by:
 *   - PDF generation (Puppeteer)
 *   - Email preview
 *
 * All styling is inline or in a <style> block so it survives both
 * email clients and Puppeteer's CSS handling.
 */

import { BILLING_BRAND, resolveBrand } from "../config/billingBrand";

export interface InvoiceTemplateLineItem {
  description:    string;
  dateOfService?: string | null;
  quantity:       string | number;
  unitPrice:      string | number;
  totalPrice:     string | number;
}

export interface InvoiceTemplateData {
  invoiceNumber:      string;
  invoiceDate:        string;
  dueDate:            string;
  terms?:             string | null;
  customerName:       string;
  customerAddress?:   string | null;
  customerEmail?:     string | null;
  customerMemo?:      string | null;
  status:             string;
  subtotalAmount:     string | number;
  taxAmount?:         string | number | null;
  adjustmentAmount?:  string | number | null;
  totalAmount:        string | number;
  paidAmount?:        string | number | null;
  balanceDue:         string | number;
  lineItems:          InvoiceTemplateLineItem[];
  paymentLink?:       string | null;
  w9Url?:             string | null;
  billingEntity?: {
    dbaName?:         string | null;
    legalName?:       string;
    taxId?:           string | null;
    email?:           string | null;
    website?:         string | null;
    addressLine1?:    string | null;
    city?:            string | null;
    state?:           string | null;
    postalCode?:      string | null;
    remitAddressLine1?: string | null;
    remitCity?:       string | null;
    remitState?:      string | null;
    remitPostalCode?: string | null;
    primaryColor?:    string | null;
    remittanceInstructions?: string | null;
    footerNotes?:     string | null;
  } | null;
  logoBase64?: string | null;    // base64 encoded PNG/JPG for PDF embedding
  mode?: "pdf" | "email";       // controls minor layout differences
}

function fmt(v: string | number | null | undefined): string {
  const n = parseFloat(String(v ?? "0"));
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(isNaN(n) ? 0 : n);
}

function statusLabel(s: string): { text: string; color: string } {
  switch (s) {
    case "paid":          return { text: "PAID",           color: "#16a34a" };
    case "partially_paid":return { text: "PARTIAL",        color: "#ca8a04" };
    case "overdue":       return { text: "OVERDUE",        color: "#dc2626" };
    case "void":          return { text: "VOID",           color: "#6b7280" };
    case "draft":         return { text: "DRAFT",          color: "#6b7280" };
    case "written_off":   return { text: "WRITTEN OFF",    color: "#6b7280" };
    default:              return { text: "INVOICE",        color: "#1F2A6D" };
  }
}

export function buildInvoiceHtml(data: InvoiceTemplateData): string {
  const brand = resolveBrand(data.billingEntity);
  const NAVY  = brand.navy;
  const mode  = data.mode ?? "pdf";
  const isPdf = mode === "pdf";
  const status = statusLabel(data.status ?? "sent");

  // Logo — base64 embedded or hidden
  const logoHtml = data.logoBase64
    ? `<img src="data:image/png;base64,${data.logoBase64}" alt="${brand.displayName}" style="max-height:52px;max-width:180px;object-fit:contain;" />`
    : `<span style="font-size:22px;font-weight:800;color:${NAVY};letter-spacing:-0.5px;">${brand.displayName}</span>`;

  // Remittance address for pay-by-check instructions
  const remitAddress = [brand.addressLine1, `${brand.city}, ${brand.state} ${brand.postalCode}`].filter(Boolean).join("\n");

  // Custom ACH/remittance instructions from entity, or default
  const remittanceText = data.billingEntity?.remittanceInstructions
    || `ACH available — contact ${brand.billingEmail} for banking details`;

  const lineItemRows = data.lineItems.map((li, i) => {
    const bg = i % 2 === 0 ? "#FFFFFF" : "#F9FAFB";
    const desc = li.dateOfService
      ? `${li.description}<br/><span style="font-size:11px;color:#9ca3af;">${li.dateOfService}</span>`
      : li.description;
    return `
      <tr style="background:${bg};">
        <td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#111111;line-height:1.4;">${desc}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#374151;text-align:center;white-space:nowrap;">${li.quantity}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#374151;text-align:right;white-space:nowrap;">${fmt(li.unitPrice)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#111111;text-align:right;font-weight:600;white-space:nowrap;">${fmt(li.totalPrice)}</td>
      </tr>`;
  }).join("");

  const tax       = parseFloat(String(data.taxAmount ?? "0"));
  const adj       = parseFloat(String(data.adjustmentAmount ?? "0"));
  const paid      = parseFloat(String(data.paidAmount ?? "0"));
  const balance   = parseFloat(String(data.balanceDue));

  const taxRow = tax > 0 ? `
    <tr>
      <td colspan="2" style="padding:6px 14px;font-size:13px;color:#374151;text-align:right;">Tax</td>
      <td style="padding:6px 14px;font-size:13px;color:#111111;text-align:right;">${fmt(tax)}</td>
    </tr>` : "";

  const adjRow = adj !== 0 ? `
    <tr>
      <td colspan="2" style="padding:6px 14px;font-size:13px;color:#374151;text-align:right;">Adjustments</td>
      <td style="padding:6px 14px;font-size:13px;color:#111111;text-align:right;">${fmt(adj)}</td>
    </tr>` : "";

  const paidRow = paid > 0 ? `
    <tr>
      <td colspan="2" style="padding:6px 14px;font-size:13px;color:#16a34a;text-align:right;">Paid</td>
      <td style="padding:6px 14px;font-size:13px;color:#16a34a;text-align:right;">- ${fmt(paid)}</td>
    </tr>` : "";

  const paySection = data.paymentLink ? `
    <div style="margin-top:${isPdf ? "22px" : "18px"};background:#F5F6F8;border-radius:6px;padding:20px 24px;border:1px solid #E2E4E8;">
      <p style="margin:0 0 12px 0;font-size:12px;font-weight:700;color:${NAVY};text-transform:uppercase;letter-spacing:0.6px;">Payment Options</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:top;padding-right:16px;width:50%;">
            <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#374151;">Pay Online</p>
            ${isPdf
              ? `<p style="margin:0;font-size:11px;color:#1F2A6D;word-break:break-all;">${data.paymentLink}</p>`
              : `<a href="${data.paymentLink}" style="font-size:13px;color:${NAVY};font-weight:700;text-decoration:underline;">View &amp; Pay Invoice</a>`
            }
            <p style="margin:4px 0 0 0;font-size:11px;color:#666;">Credit card &amp; ACH bank transfer accepted</p>
          </td>
          <td style="vertical-align:top;padding-left:16px;border-left:1px solid #E2E4E8;">
            <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#374151;">Pay by Check</p>
            <p style="margin:0;font-size:11px;color:#374151;white-space:pre-line;">Make payable to: ${brand.displayName}\n${remitAddress}</p>
          </td>
        </tr>
      </table>
      ${remittanceText ? `<p style="margin:12px 0 0 0;font-size:11px;color:#666;">${remittanceText}</p>` : ""}
      ${data.w9Url ? `
      <p style="margin:12px 0 0 0;font-size:11px;color:#374151;">
        Billing Documents: <a href="${data.w9Url}" style="color:${NAVY};font-weight:600;">Download W-9</a>
      </p>` : ""}
    </div>` : "";

  const footerNote = data.billingEntity?.footerNotes
    || `Questions? Contact ${brand.billingEmail}`;

  // PDF-specific page CSS
  const pdfCss = isPdf ? `
    @page { size: Letter; margin: 44px; }
    body { margin: 0; padding: 0; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Invoice #${data.invoiceNumber} — ${brand.displayName}</title>
<style>
  ${pdfCss}
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 13px;
    color: #111111;
    background: #FFFFFF;
    line-height: 1.5;
  }
  .page { max-width: ${isPdf ? "100%" : "760px"}; margin: 0 auto; padding: ${isPdf ? "0" : "32px 24px"}; }
  table { border-collapse: collapse; width: 100%; }
</style>
</head>
<body>
<div class="page">

  <!-- ── HEADER ────────────────────────────────────────────── -->
  <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:0;">
    <tr>
      <td style="vertical-align:middle;padding-bottom:8px;">
        ${logoHtml}
        <div style="margin-top:4px;font-size:11px;color:#666;">
          ${brand.legalName}
        </div>
      </td>
      <td style="text-align:right;vertical-align:top;padding-bottom:8px;">
        <div style="font-size:11px;color:#666;line-height:1.7;">
          ${brand.displayName}<br/>
          ${brand.addressLine1}<br/>
          ${brand.city}, ${brand.state} ${brand.postalCode}<br/>
          EIN: ${brand.ein}
        </div>
      </td>
    </tr>
  </table>

  <!-- ── NAVY DIVIDER ───────────────────────────────────────── -->
  <div style="height:3px;background:${NAVY};border-radius:2px;margin-bottom:20px;"></div>

  <!-- ── BILL TO + INVOICE META ─────────────────────────────── -->
  <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
    <tr>
      <td style="vertical-align:top;width:55%;">
        <p style="margin:0 0 4px 0;font-size:10px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.8px;">Bill To</p>
        <p style="margin:0;font-size:14px;font-weight:700;color:#111111;">${data.customerName}</p>
        ${data.customerAddress ? `<p style="margin:2px 0 0 0;font-size:12px;color:#374151;white-space:pre-line;">${data.customerAddress}</p>` : ""}
        ${data.customerEmail ? `<p style="margin:2px 0 0 0;font-size:11px;color:#666;">${data.customerEmail}</p>` : ""}
      </td>
      <td style="vertical-align:top;text-align:right;width:45%;">
        <div style="display:inline-block;text-align:left;">
          <!-- Status badge -->
          <div style="display:inline-block;background:${NAVY};color:#fff;font-size:11px;font-weight:700;letter-spacing:1px;padding:3px 10px;border-radius:3px;margin-bottom:10px;text-transform:uppercase;">${status.text}</div>
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:12px;color:#666;padding:3px 0;white-space:nowrap;">Invoice #</td>
              <td style="font-size:12px;font-weight:700;color:#111;padding:3px 0 3px 16px;white-space:nowrap;">${data.invoiceNumber}</td>
            </tr>
            <tr>
              <td style="font-size:12px;color:#666;padding:3px 0;white-space:nowrap;">Invoice Date</td>
              <td style="font-size:12px;color:#111;padding:3px 0 3px 16px;white-space:nowrap;">${data.invoiceDate}</td>
            </tr>
            <tr>
              <td style="font-size:12px;color:#666;padding:3px 0;white-space:nowrap;">Due Date</td>
              <td style="font-size:12px;font-weight:700;color:#111;padding:3px 0 3px 16px;white-space:nowrap;">${data.dueDate}</td>
            </tr>
            ${data.terms ? `<tr>
              <td style="font-size:12px;color:#666;padding:3px 0;white-space:nowrap;">Terms</td>
              <td style="font-size:12px;color:#111;padding:3px 0 3px 16px;white-space:nowrap;">${data.terms}</td>
            </tr>` : ""}
          </table>
        </div>
      </td>
    </tr>
  </table>

  <!-- ── CHARGES TABLE ─────────────────────────────────────── -->
  <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #E5E7EB;border-radius:4px;overflow:hidden;margin-bottom:0;">
    <thead>
      <tr style="background:${NAVY};">
        <th style="padding:11px 14px;font-size:11px;font-weight:700;color:#fff;text-align:left;text-transform:uppercase;letter-spacing:0.6px;">Description</th>
        <th style="padding:11px 14px;font-size:11px;font-weight:700;color:#fff;text-align:center;text-transform:uppercase;letter-spacing:0.6px;white-space:nowrap;">Qty</th>
        <th style="padding:11px 14px;font-size:11px;font-weight:700;color:#fff;text-align:right;text-transform:uppercase;letter-spacing:0.6px;white-space:nowrap;">Rate</th>
        <th style="padding:11px 14px;font-size:11px;font-weight:700;color:#fff;text-align:right;text-transform:uppercase;letter-spacing:0.6px;white-space:nowrap;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${lineItemRows}
    </tbody>
  </table>

  <!-- ── TOTALS ─────────────────────────────────────────────── -->
  <table cellpadding="0" cellspacing="0" style="width:100%;margin-top:0;">
    <tr>
      <td style="width:55%;"></td>
      <td style="width:45%;">
        <table cellpadding="0" cellspacing="0" style="width:100%;border-left:1px solid #E5E7EB;border-right:1px solid #E5E7EB;border-bottom:1px solid #E5E7EB;border-radius:0 0 4px 4px;overflow:hidden;">
          <tr>
            <td colspan="2" style="padding:8px 14px;font-size:13px;color:#374151;text-align:right;border-bottom:1px solid #E5E7EB;">Subtotal</td>
            <td style="padding:8px 14px;font-size:13px;color:#111;text-align:right;border-bottom:1px solid #E5E7EB;">${fmt(data.subtotalAmount)}</td>
          </tr>
          ${taxRow}
          ${adjRow}
          <tr style="border-top:2px solid #E5E7EB;">
            <td colspan="2" style="padding:10px 14px;font-size:14px;font-weight:700;color:#111;text-align:right;">Total Due</td>
            <td style="padding:10px 14px;font-size:14px;font-weight:700;color:#111;text-align:right;">${fmt(data.totalAmount)}</td>
          </tr>
          ${paidRow}
          <tr style="background:${NAVY};">
            <td colspan="2" style="padding:12px 14px;font-size:14px;font-weight:700;color:#fff;text-align:right;">Outstanding Balance</td>
            <td style="padding:12px 14px;font-size:16px;font-weight:800;color:#fff;text-align:right;">${fmt(balance)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- ── CUSTOMER MEMO ─────────────────────────────────────── -->
  ${data.customerMemo ? `
  <div style="margin-top:18px;padding:14px;background:#F9FAFB;border-radius:4px;border:1px solid #E5E7EB;">
    <p style="margin:0 0 4px 0;font-size:10px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.8px;">Notes</p>
    <p style="margin:0;font-size:12px;color:#374151;white-space:pre-line;">${data.customerMemo}</p>
  </div>` : ""}

  <!-- ── PAYMENT SECTION ─────────────────────────────────────── -->
  ${paySection}

  <!-- ── FOOTER ─────────────────────────────────────────────── -->
  <div style="margin-top:24px;padding-top:14px;border-top:1px solid #E2E4E8;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9CA3AF;">${footerNote}</p>
    <p style="margin:4px 0 0 0;font-size:10px;color:#D1D5DB;">&copy; ${new Date().getFullYear()} ${brand.displayName} / ${brand.legalName} &nbsp;&middot;&nbsp; EIN ${brand.ein}</p>
  </div>

</div>
</body>
</html>`;
}
