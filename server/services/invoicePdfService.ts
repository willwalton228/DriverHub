/**
 * Invoice PDF Service — Puppeteer HTML/CSS → PDF
 * Ticket 3.3 — Uses a reusable HTML/CSS template rendered by headless Chrome.
 *
 * Delegates template generation to:  server/services/invoiceHtmlTemplate.ts
 * Uses centralized brand config from: server/config/billingBrand.ts
 */

import puppeteer from "puppeteer";
import { buildInvoiceHtml, InvoiceTemplateData } from "./invoiceHtmlTemplate";

// ─── Re-exported types (backward compat with routes) ─────────────────────────

export interface InvoicePdfLineItem {
  description:    string;
  quantity:       string | number;
  unitPrice:      string | number;
  totalPrice:     string | number;
  dateOfService?: string | null;
}

export interface InvoicePdfBillingEntity {
  legalName:               string;
  dbaName?:                string | null;
  taxId?:                  string | null;
  phone?:                  string | null;
  email?:                  string | null;
  website?:                string | null;
  addressLine1?:           string | null;
  addressLine2?:           string | null;
  city?:                   string | null;
  state?:                  string | null;
  postalCode?:             string | null;
  remitAddressLine1?:      string | null;
  remitAddressLine2?:      string | null;
  remitCity?:              string | null;
  remitState?:             string | null;
  remitPostalCode?:        string | null;
  primaryColor?:           string | null;
  logoBuffer?:             Buffer | null;
  remittanceInstructions?: string | null;
  footerNotes?:            string | null;
  defaultTermsText?:       string | null;
}

// The main options type used by routes.ts
export interface InvoicePdfData {
  invoiceNumber:       string;
  invoiceDate:         string;
  dueDate:             string;
  terms?:              string | null;
  customerName:        string;
  customerAddress?:    string | null;
  customerEmail?:      string | null;
  customerMemo?:       string | null;
  status:              string;
  subtotalAmount:      string | number | null;
  taxAmount?:          string | number | null;
  adjustmentAmount?:   string | number | null;
  totalAmount:         string | number;
  paidAmount?:         string | number | null;
  balanceDue:          string | number | null;
  paymentAccessToken?: string | null;
  lineItems:           InvoicePdfLineItem[];
  billingEntity?:      InvoicePdfBillingEntity | null;
  appBaseUrl?:         string;
  w9Url?:              string;
}

// ─── Core PDF Generation ──────────────────────────────────────────────────────

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const paymentLink = data.paymentAccessToken && data.appBaseUrl
    ? `${data.appBaseUrl}/pay/${data.paymentAccessToken}`
    : undefined;

  const logoBase64: string | null = data.billingEntity?.logoBuffer
    ? data.billingEntity.logoBuffer.toString("base64")
    : null;

  const templateData: InvoiceTemplateData = {
    invoiceNumber:    data.invoiceNumber,
    invoiceDate:      data.invoiceDate,
    dueDate:          data.dueDate,
    terms:            data.terms ?? data.billingEntity?.defaultTermsText ?? null,
    customerName:     data.customerName,
    customerAddress:  data.customerAddress ?? null,
    customerEmail:    data.customerEmail ?? null,
    customerMemo:     data.customerMemo ?? null,
    status:           data.status,
    subtotalAmount:   data.subtotalAmount ?? data.totalAmount,
    taxAmount:        data.taxAmount,
    adjustmentAmount: data.adjustmentAmount,
    totalAmount:      data.totalAmount,
    paidAmount:       data.paidAmount,
    balanceDue:       data.balanceDue ?? data.totalAmount,
    lineItems:        data.lineItems.map(li => ({
      description:   li.description,
      dateOfService: li.dateOfService,
      quantity:      li.quantity,
      unitPrice:     li.unitPrice,
      totalPrice:    li.totalPrice,
    })),
    paymentLink,
    w9Url:            data.w9Url,
    billingEntity:    data.billingEntity ? {
      dbaName:                data.billingEntity.dbaName,
      legalName:              data.billingEntity.legalName,
      taxId:                  data.billingEntity.taxId,
      email:                  data.billingEntity.email,
      website:                data.billingEntity.website,
      addressLine1:           data.billingEntity.addressLine1,
      city:                   data.billingEntity.city,
      state:                  data.billingEntity.state,
      postalCode:             data.billingEntity.postalCode,
      remitAddressLine1:      data.billingEntity.remitAddressLine1,
      remitCity:              data.billingEntity.remitCity,
      remitState:             data.billingEntity.remitState,
      remitPostalCode:        data.billingEntity.remitPostalCode,
      primaryColor:           data.billingEntity.primaryColor,
      remittanceInstructions: data.billingEntity.remittanceInstructions,
      footerNotes:            data.billingEntity.footerNotes,
    } : null,
    logoBase64,
    mode: "pdf",
  };

  const html = buildInvoiceHtml(templateData);
  return renderHtmlToPdf(html);
}

// ─── Puppeteer Browser Pool ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _browser: any = null;

async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;

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
      "--no-first-run",
      "--no-zygote",
      "--single-process",
    ],
  });

  _browser.on("disconnected", () => { _browser = null; });
  return _browser;
}

async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page    = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format:          "Letter",
      printBackground: true,
      margin:          { top: "44px", bottom: "44px", left: "44px", right: "44px" },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await page.close();
  }
}
