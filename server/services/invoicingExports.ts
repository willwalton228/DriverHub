/**
 * Invoicing Exports Service (TICKET 25)
 * 
 * Provides exportable audit/compliance packages for finance reviews,
 * customer disputes, and insurer/auditor requests.
 */

import PDFDocument from 'pdfkit';
import archiver from 'archiver';
import { Readable } from 'stream';

export interface ExportFilters {
  startDate?: string;
  endDate?: string;
  customerId?: string;
  billingEntityId?: string;
  locationId?: string;
}

export interface InvoiceLedgerRow {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  customerName: string;
  billingEntity: string;
  location: string;
  status: string;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  agingDays: number;
  agingBucket: string;
  createdBy: string;
  createdAt: string;
}

export interface PaymentLedgerRow {
  paymentId: string;
  paymentDate: string;
  invoiceNumber: string;
  customerName: string;
  paymentMethod: string;
  referenceNumber: string;
  amount: number;
  appliedAmount: number;
  status: string;
  recordedBy: string;
  recordedAt: string;
}

export interface CreditVoidRow {
  invoiceNumber: string;
  type: 'credit' | 'void';
  originalAmount: number;
  creditAmount?: number;
  reason: string;
  performedBy: string;
  performedAt: string;
  approvedBy?: string;
  notes?: string;
}

export interface CollectionsActivityRow {
  invoiceNumber: string;
  customerName: string;
  activityType: string;
  activityDate: string;
  performedBy: string;
  details: string;
  outcome?: string;
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatDate(dateStr: string | Date | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function calculateAgingBucket(dueDate: string): { days: number; bucket: string } {
  const due = new Date(dueDate);
  const today = new Date();
  const diffTime = today.getTime() - due.getTime();
  const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (days <= 0) return { days: 0, bucket: 'Current' };
  if (days <= 30) return { days, bucket: '1-30 Days' };
  if (days <= 60) return { days, bucket: '31-60 Days' };
  if (days <= 90) return { days, bucket: '61-90 Days' };
  return { days, bucket: '90+ Days' };
}

/**
 * Generate CSV content from data rows
 */
export function generateCSV<T extends Record<string, any>>(
  data: T[],
  columns: { key: keyof T; header: string; formatter?: (val: any) => string }[]
): string {
  const headers = columns.map(c => `"${c.header}"`).join(',');
  const rows = data.map(row => 
    columns.map(col => {
      const val = row[col.key];
      const formatted = col.formatter ? col.formatter(val) : String(val ?? '');
      return `"${formatted.replace(/"/g, '""')}"`;
    }).join(',')
  );
  return [headers, ...rows].join('\n');
}

/**
 * Generate Invoice Ledger CSV
 */
export function generateInvoiceLedgerCSV(invoices: InvoiceLedgerRow[]): string {
  return generateCSV(invoices, [
    { key: 'invoiceNumber', header: 'Invoice Number' },
    { key: 'invoiceDate', header: 'Invoice Date' },
    { key: 'dueDate', header: 'Due Date' },
    { key: 'customerName', header: 'Customer' },
    { key: 'billingEntity', header: 'Billing Entity' },
    { key: 'location', header: 'Location' },
    { key: 'status', header: 'Status' },
    { key: 'totalAmount', header: 'Total Amount', formatter: formatCurrency },
    { key: 'amountPaid', header: 'Amount Paid', formatter: formatCurrency },
    { key: 'balance', header: 'Balance', formatter: formatCurrency },
    { key: 'agingDays', header: 'Aging (Days)' },
    { key: 'agingBucket', header: 'Aging Bucket' },
    { key: 'createdBy', header: 'Created By' },
    { key: 'createdAt', header: 'Created At' },
  ]);
}

/**
 * Generate Payment Ledger CSV
 */
export function generatePaymentLedgerCSV(payments: PaymentLedgerRow[]): string {
  return generateCSV(payments, [
    { key: 'paymentId', header: 'Payment ID' },
    { key: 'paymentDate', header: 'Payment Date' },
    { key: 'invoiceNumber', header: 'Invoice Number' },
    { key: 'customerName', header: 'Customer' },
    { key: 'paymentMethod', header: 'Payment Method' },
    { key: 'referenceNumber', header: 'Reference Number' },
    { key: 'amount', header: 'Amount', formatter: formatCurrency },
    { key: 'appliedAmount', header: 'Applied Amount', formatter: formatCurrency },
    { key: 'status', header: 'Status' },
    { key: 'recordedBy', header: 'Recorded By' },
    { key: 'recordedAt', header: 'Recorded At' },
  ]);
}

/**
 * Generate Credits/Voids Report CSV
 */
export function generateCreditsVoidsCSV(items: CreditVoidRow[]): string {
  return generateCSV(items, [
    { key: 'invoiceNumber', header: 'Invoice Number' },
    { key: 'type', header: 'Type' },
    { key: 'originalAmount', header: 'Original Amount', formatter: formatCurrency },
    { key: 'creditAmount', header: 'Credit Amount', formatter: (v) => v ? formatCurrency(v) : '' },
    { key: 'reason', header: 'Reason' },
    { key: 'performedBy', header: 'Performed By' },
    { key: 'performedAt', header: 'Performed At' },
    { key: 'approvedBy', header: 'Approved By' },
    { key: 'notes', header: 'Notes' },
  ]);
}

/**
 * Generate Collections Activity CSV
 */
export function generateCollectionsActivityCSV(activities: CollectionsActivityRow[]): string {
  return generateCSV(activities, [
    { key: 'invoiceNumber', header: 'Invoice Number' },
    { key: 'customerName', header: 'Customer' },
    { key: 'activityType', header: 'Activity Type' },
    { key: 'activityDate', header: 'Date' },
    { key: 'performedBy', header: 'Performed By' },
    { key: 'details', header: 'Details' },
    { key: 'outcome', header: 'Outcome' },
  ]);
}

/**
 * Generate Invoice Ledger PDF
 */
export function generateInvoiceLedgerPDF(
  invoices: InvoiceLedgerRow[],
  filters: ExportFilters,
  totals: { totalInvoiced: number; totalPaid: number; totalBalance: number }
): PDFKit.PDFDocument {
  const doc = new PDFDocument({ margin: 40, size: 'LETTER', layout: 'landscape' });
  
  // Header
  doc.fontSize(18).text('Invoice Ledger Report', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#666');
  doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
  if (filters.startDate || filters.endDate) {
    doc.text(`Period: ${filters.startDate || 'Start'} to ${filters.endDate || 'End'}`, { align: 'center' });
  }
  doc.moveDown();
  
  // Summary
  doc.fillColor('#000').fontSize(12).text('Summary', { underline: true });
  doc.fontSize(10);
  doc.text(`Total Invoiced: ${formatCurrency(totals.totalInvoiced)}`);
  doc.text(`Total Paid: ${formatCurrency(totals.totalPaid)}`);
  doc.text(`Total Outstanding: ${formatCurrency(totals.totalBalance)}`);
  doc.text(`Invoice Count: ${invoices.length}`);
  doc.moveDown();
  
  // Table header
  const tableTop = doc.y;
  const colWidths = [80, 60, 60, 100, 80, 60, 60, 60, 60];
  const headers = ['Invoice #', 'Date', 'Due', 'Customer', 'Status', 'Total', 'Paid', 'Balance', 'Aging'];
  
  doc.fillColor('#333').fontSize(8);
  let x = 40;
  headers.forEach((header, i) => {
    doc.text(header, x, tableTop, { width: colWidths[i], align: 'left' });
    x += colWidths[i];
  });
  
  doc.moveTo(40, tableTop + 12).lineTo(760, tableTop + 12).stroke();
  
  // Data rows
  let y = tableTop + 16;
  doc.fillColor('#000');
  
  invoices.slice(0, 50).forEach((inv) => {
    if (y > 540) {
      doc.addPage();
      y = 40;
    }
    
    x = 40;
    const rowData = [
      inv.invoiceNumber,
      formatDate(inv.invoiceDate),
      formatDate(inv.dueDate),
      inv.customerName.substring(0, 15),
      inv.status,
      formatCurrency(inv.totalAmount),
      formatCurrency(inv.amountPaid),
      formatCurrency(inv.balance),
      inv.agingBucket,
    ];
    
    rowData.forEach((cell, i) => {
      doc.text(String(cell), x, y, { width: colWidths[i], align: 'left' });
      x += colWidths[i];
    });
    
    y += 14;
  });
  
  if (invoices.length > 50) {
    doc.moveDown();
    doc.text(`... and ${invoices.length - 50} more invoices. See CSV for complete data.`);
  }
  
  // Footer
  doc.fontSize(8).fillColor('#999');
  doc.text('DriverHub 360 - Invoicing Compliance Report', 40, 560, { align: 'center' });
  
  return doc;
}

/**
 * Generate Payment Ledger PDF
 */
export function generatePaymentLedgerPDF(
  payments: PaymentLedgerRow[],
  filters: ExportFilters,
  totals: { totalPayments: number; totalApplied: number }
): PDFKit.PDFDocument {
  const doc = new PDFDocument({ margin: 40, size: 'LETTER', layout: 'landscape' });
  
  doc.fontSize(18).text('Payment Ledger Report', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#666');
  doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
  if (filters.startDate || filters.endDate) {
    doc.text(`Period: ${filters.startDate || 'Start'} to ${filters.endDate || 'End'}`, { align: 'center' });
  }
  doc.moveDown();
  
  // Summary
  doc.fillColor('#000').fontSize(12).text('Summary', { underline: true });
  doc.fontSize(10);
  doc.text(`Total Payments: ${formatCurrency(totals.totalPayments)}`);
  doc.text(`Total Applied: ${formatCurrency(totals.totalApplied)}`);
  doc.text(`Payment Count: ${payments.length}`);
  doc.moveDown();
  
  // Table
  const tableTop = doc.y;
  const colWidths = [80, 60, 80, 100, 70, 80, 70, 70];
  const headers = ['Payment ID', 'Date', 'Invoice #', 'Customer', 'Method', 'Reference', 'Amount', 'Status'];
  
  doc.fillColor('#333').fontSize(8);
  let x = 40;
  headers.forEach((header, i) => {
    doc.text(header, x, tableTop, { width: colWidths[i], align: 'left' });
    x += colWidths[i];
  });
  
  doc.moveTo(40, tableTop + 12).lineTo(760, tableTop + 12).stroke();
  
  let y = tableTop + 16;
  doc.fillColor('#000');
  
  payments.slice(0, 50).forEach((pmt) => {
    if (y > 540) {
      doc.addPage();
      y = 40;
    }
    
    x = 40;
    const rowData = [
      pmt.paymentId.substring(0, 10),
      formatDate(pmt.paymentDate),
      pmt.invoiceNumber,
      pmt.customerName.substring(0, 15),
      pmt.paymentMethod,
      pmt.referenceNumber?.substring(0, 10) || '',
      formatCurrency(pmt.amount),
      pmt.status,
    ];
    
    rowData.forEach((cell, i) => {
      doc.text(String(cell), x, y, { width: colWidths[i], align: 'left' });
      x += colWidths[i];
    });
    
    y += 14;
  });
  
  if (payments.length > 50) {
    doc.moveDown();
    doc.text(`... and ${payments.length - 50} more payments. See CSV for complete data.`);
  }
  
  doc.fontSize(8).fillColor('#999');
  doc.text('DriverHub 360 - Payment Compliance Report', 40, 560, { align: 'center' });
  
  return doc;
}

/**
 * Generate Credits/Voids PDF
 */
export function generateCreditsVoidsPDF(
  items: CreditVoidRow[],
  filters: ExportFilters
): PDFKit.PDFDocument {
  const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
  
  doc.fontSize(18).text('Credits & Voids Report', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#666');
  doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
  if (filters.startDate || filters.endDate) {
    doc.text(`Period: ${filters.startDate || 'Start'} to ${filters.endDate || 'End'}`, { align: 'center' });
  }
  doc.moveDown();
  
  const voids = items.filter(i => i.type === 'void');
  const credits = items.filter(i => i.type === 'credit');
  
  doc.fillColor('#000').fontSize(12).text('Summary', { underline: true });
  doc.fontSize(10);
  doc.text(`Total Voids: ${voids.length}`);
  doc.text(`Total Credits: ${credits.length}`);
  doc.text(`Total Credit Amount: ${formatCurrency(credits.reduce((sum, c) => sum + (c.creditAmount || 0), 0))}`);
  doc.moveDown();
  
  // List items
  items.forEach((item, idx) => {
    if (doc.y > 700) {
      doc.addPage();
    }
    
    doc.fontSize(10).fillColor('#333');
    doc.text(`${idx + 1}. ${item.type.toUpperCase()} - Invoice #${item.invoiceNumber}`, { underline: true });
    doc.fontSize(9).fillColor('#000');
    doc.text(`   Original Amount: ${formatCurrency(item.originalAmount)}`);
    if (item.creditAmount) {
      doc.text(`   Credit Amount: ${formatCurrency(item.creditAmount)}`);
    }
    doc.text(`   Reason: ${item.reason}`);
    doc.text(`   Performed By: ${item.performedBy} on ${item.performedAt}`);
    if (item.approvedBy) {
      doc.text(`   Approved By: ${item.approvedBy}`);
    }
    if (item.notes) {
      doc.text(`   Notes: ${item.notes}`);
    }
    doc.moveDown(0.5);
  });
  
  doc.fontSize(8).fillColor('#999');
  doc.text('DriverHub 360 - Credits/Voids Audit Report', { align: 'center' });
  
  return doc;
}

/**
 * Generate Collections Activity PDF
 */
export function generateCollectionsActivityPDF(
  activities: CollectionsActivityRow[],
  filters: ExportFilters
): PDFKit.PDFDocument {
  const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
  
  doc.fontSize(18).text('Reminder & Collections Activity Log', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#666');
  doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
  if (filters.startDate || filters.endDate) {
    doc.text(`Period: ${filters.startDate || 'Start'} to ${filters.endDate || 'End'}`, { align: 'center' });
  }
  doc.moveDown();
  
  doc.fillColor('#000').fontSize(12).text('Summary', { underline: true });
  doc.fontSize(10);
  doc.text(`Total Activities: ${activities.length}`);
  
  const byType = activities.reduce((acc, a) => {
    acc[a.activityType] = (acc[a.activityType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  Object.entries(byType).forEach(([type, count]) => {
    doc.text(`  ${type}: ${count}`);
  });
  doc.moveDown();
  
  // Activity list
  activities.forEach((activity, idx) => {
    if (doc.y > 700) {
      doc.addPage();
    }
    
    doc.fontSize(9).fillColor('#333');
    doc.text(`${idx + 1}. [${activity.activityType}] ${activity.activityDate}`);
    doc.fontSize(8).fillColor('#000');
    doc.text(`   Invoice: ${activity.invoiceNumber} | Customer: ${activity.customerName}`);
    doc.text(`   By: ${activity.performedBy}`);
    doc.text(`   Details: ${activity.details}`);
    if (activity.outcome) {
      doc.text(`   Outcome: ${activity.outcome}`);
    }
    doc.moveDown(0.3);
  });
  
  doc.fontSize(8).fillColor('#999');
  doc.text('DriverHub 360 - Collections Activity Report', { align: 'center' });
  
  return doc;
}

/**
 * Create compliance bundle (ZIP) with all reports
 */
export async function createComplianceBundle(
  invoiceLedgerCSV: string,
  invoiceLedgerPDF: PDFKit.PDFDocument,
  paymentLedgerCSV: string,
  paymentLedgerPDF: PDFKit.PDFDocument,
  creditsVoidsCSV: string,
  creditsVoidsPDF: PDFKit.PDFDocument,
  collectionsActivityCSV: string,
  collectionsActivityPDF: PDFKit.PDFDocument,
  periodLabel: string
): Promise<archiver.Archiver> {
  const archive = archiver('zip', { zlib: { level: 9 } });
  
  // Add CSV files
  archive.append(invoiceLedgerCSV, { name: `invoice_ledger_${periodLabel}.csv` });
  archive.append(paymentLedgerCSV, { name: `payment_ledger_${periodLabel}.csv` });
  archive.append(creditsVoidsCSV, { name: `credits_voids_${periodLabel}.csv` });
  archive.append(collectionsActivityCSV, { name: `collections_activity_${periodLabel}.csv` });
  
  // Add PDF files (need to convert PDFDocument to buffer)
  const pdfToBuffer = (pdf: PDFKit.PDFDocument): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);
      pdf.end();
    });
  };
  
  const [invPdfBuf, pmtPdfBuf, cvPdfBuf, caPdfBuf] = await Promise.all([
    pdfToBuffer(invoiceLedgerPDF),
    pdfToBuffer(paymentLedgerPDF),
    pdfToBuffer(creditsVoidsPDF),
    pdfToBuffer(collectionsActivityPDF),
  ]);
  
  archive.append(invPdfBuf, { name: `invoice_ledger_${periodLabel}.pdf` });
  archive.append(pmtPdfBuf, { name: `payment_ledger_${periodLabel}.pdf` });
  archive.append(cvPdfBuf, { name: `credits_voids_${periodLabel}.pdf` });
  archive.append(caPdfBuf, { name: `collections_activity_${periodLabel}.pdf` });
  
  // Add manifest
  const manifest = {
    generatedAt: new Date().toISOString(),
    period: periodLabel,
    contents: [
      'invoice_ledger.csv - Complete invoice ledger with aging',
      'invoice_ledger.pdf - Invoice ledger summary report',
      'payment_ledger.csv - All payments with references',
      'payment_ledger.pdf - Payment summary report',
      'credits_voids.csv - Credits and voids with audit trail',
      'credits_voids.pdf - Credits/voids detail report',
      'collections_activity.csv - Reminder and collections log',
      'collections_activity.pdf - Collections activity report',
    ],
  };
  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
  
  return archive;
}

export { calculateAgingBucket, formatCurrency, formatDate };
