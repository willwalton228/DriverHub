import { db } from "../db";
import { invoices, payments, creditMemos, arLedgerEntries, customerStatements, customers, paymentApplications, users } from "@shared/schema";
import { eq, and, desc, sql, asc } from "drizzle-orm";
import PDFDocument from 'pdfkit';

export interface StatementGenerationParams {
  customerId: string;
  periodStartDate: string;
  periodEndDate: string;
  statementType: "monthly" | "custom";
  generatedBy: string;
}

export interface TransactionDetail {
  type: "invoice" | "payment" | "credit" | "adjustment";
  date: string;
  reference: string;
  description: string;
  debit: string;
  credit: string;
  runningBalance: string;
}

export interface StatementData {
  statementNumber: string;
  customerId: string;
  customerName: string;
  statementType: string;
  snapshotVersion: number;
  periodStartDate: string;
  periodEndDate: string;
  openingBalance: string;
  totalInvoicesIssued: string;
  totalPaymentsReceived: string;
  totalCreditsAdjustments: string;
  closingBalance: string;
  agingCurrent: string;
  aging1to30: string;
  aging31to60: string;
  aging61to90: string;
  agingOver90: string;
  invoiceCountDraft: number;
  invoiceCountSent: number;
  invoiceCountPaid: number;
  invoiceCountOverdue: number;
  invoiceCountApproved: number;
  invoiceCountPartiallyPaid: number;
  transactionDetails: TransactionDetail[];
  // A/R Reconciliation (computed, not stored)
  totalOpenAR: string;
  agingTotal: string;
  arVariance: string;
  arReconciled: boolean;
  warning?: string;
}

// ── Status constants ─────────────────────────────────────────────────────────
// Statuses that mean the invoice is cancelled/void and should be excluded from all A/R calculations
const CANCELLED_STATUSES = `('draft', 'void', 'voided', 'cancelled', 'written_off')`;
// Statuses that mean fully paid (balance = 0)
const PAID_STATUSES = `('paid')`;
// For aging: exclude draft + cancelled/void + paid
const NON_AGING_STATUSES = `('draft', 'void', 'voided', 'cancelled', 'written_off', 'paid')`;

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDateStr(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

// Compute the open balance of an invoice (handles NULL balanceDue)
function invoiceOpenBalance(inv: { balanceDue?: string | null; totalAmount?: string | null; paidAmount?: string | null }): number {
  const balanceDue = parseFloat(inv.balanceDue || "0");
  if (balanceDue > 0) return balanceDue;
  // Fall back to totalAmount - paidAmount
  const total = parseFloat(inv.totalAmount || "0");
  const paid  = parseFloat(inv.paidAmount || "0");
  return Math.max(0, total - paid);
}

export async function generateStatementNumber(): Promise<string> {
  const [result] = await db.select({
    count: sql<number>`count(*)::int`
  }).from(customerStatements);
  const seq = (result?.count || 0) + 1;
  return `STMT-${String(seq).padStart(6, '0')}`;
}

export async function getNextSnapshotVersion(customerId: string, periodStartDate: string, periodEndDate: string): Promise<number> {
  const [result] = await db.select({
    maxVersion: sql<number>`coalesce(max(${customerStatements.snapshotVersion}), 0)::int`
  })
    .from(customerStatements)
    .where(and(
      eq(customerStatements.customerId, customerId),
      eq(customerStatements.periodStartDate, periodStartDate),
      eq(customerStatements.periodEndDate, periodEndDate)
    ));
  return (result?.maxVersion || 0) + 1;
}

export async function generateStatement(params: StatementGenerationParams): Promise<StatementData> {
  const { customerId, periodStartDate, periodEndDate, statementType, generatedBy } = params;

  console.log(`[Statement] Generating statement for customer=${customerId}, period=${periodStartDate} to ${periodEndDate}, type=${statementType}`);

  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!customer) throw new Error("Customer not found");

  // ── Opening Balance ────────────────────────────────────────────────────────
  // Try AR ledger first, fall back to invoices - payments before period
  const openingBalanceResult = await db.select({
    total: sql<string>`coalesce(sum(${arLedgerEntries.amount}::numeric), 0)::text`
  })
    .from(arLedgerEntries)
    .where(and(
      eq(arLedgerEntries.customerId, customerId),
      sql`${arLedgerEntries.entryDate}::date < ${periodStartDate}::date`
    ));
  let openingBalance = parseFloat(openingBalanceResult[0]?.total || "0");

  if (openingBalance === 0) {
    // Sum up invoices before period (using totalAmount — payments offset this separately)
    const [invBeforePeriod] = await db.select({
      total: sql<string>`coalesce(sum(${invoices.totalAmount}::numeric), 0)::text`
    }).from(invoices).where(and(
      eq(invoices.customerId, customerId),
      sql`${invoices.invoiceDate}::date < ${periodStartDate}::date`,
      sql`coalesce(${invoices.status}, 'draft') NOT IN ${sql.raw(CANCELLED_STATUSES)}`
    ));
    // Sum up payments received before period (exclude deleted)
    const [pmtBeforePeriod] = await db.select({
      total: sql<string>`coalesce(sum(${payments.amount}::numeric - coalesce(${payments.refundedAmount}::numeric, 0)), 0)::text`
    }).from(payments).where(and(
      eq(payments.customerId, customerId),
      sql`${payments.paymentDate}::date < ${periodStartDate}::date`,
      eq(payments.status, "completed"),
      eq(payments.isDeleted, false)
    ));
    const invTotal = parseFloat(invBeforePeriod?.total || "0");
    const pmtTotal = parseFloat(pmtBeforePeriod?.total || "0");
    // Only set opening balance if there's actual pre-period activity
    if (invTotal > 0 || pmtTotal > 0) {
      openingBalance = invTotal - pmtTotal;
    }
  }

  // ── Period Invoices ────────────────────────────────────────────────────────
  // Include all billed invoices (exclude draft + cancelled/void)
  const periodInvoices = await db.select()
    .from(invoices)
    .where(and(
      eq(invoices.customerId, customerId),
      sql`${invoices.invoiceDate}::date >= ${periodStartDate}::date`,
      sql`${invoices.invoiceDate}::date <= ${periodEndDate}::date`,
      sql`coalesce(${invoices.status}, 'draft') NOT IN ${sql.raw(CANCELLED_STATUSES)}`
    ))
    .orderBy(asc(invoices.invoiceDate));

  console.log(`[Statement] Found ${periodInvoices.length} invoices in period (statuses: ${periodInvoices.map(i => i.status).join(', ') || 'none'})`);

  const allInvoicesForCustomer = await db.select({
    count: sql<number>`count(*)::int`,
    statuses: sql<string>`string_agg(distinct coalesce(${invoices.status}, 'NULL'), ', ')`,
    dateRange: sql<string>`coalesce(min(${invoices.invoiceDate})::text, 'N/A') || ' to ' || coalesce(max(${invoices.invoiceDate})::text, 'N/A')`
  }).from(invoices).where(eq(invoices.customerId, customerId));
  console.log(`[Statement] Customer total invoices: count=${allInvoicesForCustomer[0]?.count}, statuses=[${allInvoicesForCustomer[0]?.statuses}], dates=${allInvoicesForCustomer[0]?.dateRange}`);

  // ── Period Payments ────────────────────────────────────────────────────────
  // Completed payments only, exclude deleted, net of refunds
  const periodPayments = await db.select()
    .from(payments)
    .where(and(
      eq(payments.customerId, customerId),
      sql`${payments.paymentDate}::date >= ${periodStartDate}::date`,
      sql`${payments.paymentDate}::date <= ${periodEndDate}::date`,
      eq(payments.status, "completed"),
      eq(payments.isDeleted, false)
    ))
    .orderBy(asc(payments.paymentDate));

  console.log(`[Statement] Found ${periodPayments.length} payments in period`);

  // ── Period Credits ─────────────────────────────────────────────────────────
  const periodCredits = await db.select()
    .from(creditMemos)
    .where(and(
      eq(creditMemos.customerId, customerId),
      sql`${creditMemos.creditDate}::date >= ${periodStartDate}::date`,
      sql`${creditMemos.creditDate}::date <= ${periodEndDate}::date`,
      sql`coalesce(${creditMemos.status}, '') != 'cancelled'`
    ))
    .orderBy(asc(creditMemos.creditDate));

  // ── Balance Calculations ───────────────────────────────────────────────────
  const totalInvoicesIssued = periodInvoices.reduce((sum, inv) => sum + parseFloat(inv.totalAmount || "0"), 0);
  // Use amount - refundedAmount for net payments received
  const totalPaymentsReceived = periodPayments.reduce((sum, pmt) => {
    const net = parseFloat(pmt.amount || "0") - parseFloat((pmt as any).refundedAmount || "0");
    return sum + Math.max(0, net);
  }, 0);
  const totalCreditsAdjustments = periodCredits.reduce((sum, cr) => sum + parseFloat(cr.amount || "0"), 0);
  const closingBalance = openingBalance + totalInvoicesIssued - totalPaymentsReceived - totalCreditsAdjustments;

  // ── Transaction Detail Ledger ──────────────────────────────────────────────
  const transactions: TransactionDetail[] = [];
  let runningBalance = openingBalance;

  type TxEntry = { type: TransactionDetail["type"]; date: string; reference: string; description: string; amount: number };
  const allEntries: TxEntry[] = [];

  for (const inv of periodInvoices) {
    allEntries.push({
      type: "invoice",
      date: inv.invoiceDate,
      reference: inv.invoiceNumber,
      description: `Invoice ${inv.invoiceNumber}${inv.status ? ` (${inv.status})` : ''}`,
      amount: parseFloat(inv.totalAmount || "0"),
    });
  }

  for (const pmt of periodPayments) {
    const net = parseFloat(pmt.amount || "0") - parseFloat((pmt as any).refundedAmount || "0");
    if (net <= 0) continue;
    allEntries.push({
      type: "payment",
      date: pmt.paymentDate,
      reference: pmt.paymentNumber,
      description: `Payment ${pmt.paymentNumber} (${pmt.paymentMethod || "check"})${(pmt as any).isManualEntry ? ' [manual]' : ''}`,
      amount: -net,
    });
  }

  for (const cr of periodCredits) {
    allEntries.push({
      type: "credit",
      date: cr.creditDate,
      reference: cr.creditMemoNumber,
      description: `Credit ${cr.creditMemoNumber}${cr.reason ? ` - ${cr.reason}` : ""}`,
      amount: -parseFloat(cr.amount || "0"),
    });
  }

  allEntries.sort((a, b) => a.date.localeCompare(b.date));

  for (const entry of allEntries) {
    runningBalance += entry.amount;
    transactions.push({
      type: entry.type,
      date: entry.date,
      reference: entry.reference,
      description: entry.description,
      debit: entry.amount > 0 ? entry.amount.toFixed(2) : "0.00",
      credit: entry.amount < 0 ? Math.abs(entry.amount).toFixed(2) : "0.00",
      runningBalance: runningBalance.toFixed(2),
    });
  }

  // ── Aging Calculation (as of period end) ──────────────────────────────────
  // Fetch all open invoices as of period end date
  // Exclude: draft, void, voided, cancelled, written_off, AND paid (balance = 0)
  const endDate = new Date(periodEndDate + 'T23:59:59');
  let agingCurrent = 0, aging1to30 = 0, aging31to60 = 0, aging61to90 = 0, agingOver90 = 0;
  let countDraft = 0, countSent = 0, countPaid = 0, countOverdue = 0, countApproved = 0, countPartiallyPaid = 0;

  const openInvoices = await db.select()
    .from(invoices)
    .where(and(
      eq(invoices.customerId, customerId),
      sql`${invoices.invoiceDate}::date <= ${periodEndDate}::date`,
      sql`coalesce(${invoices.status}, 'draft') NOT IN ${sql.raw(NON_AGING_STATUSES)}`
    ));

  for (const inv of openInvoices) {
    const balance = invoiceOpenBalance(inv);
    if (balance <= 0.005) continue; // skip fully paid within tolerance

    // Guard against NULL dueDate — treat as current (not overdue)
    if (!inv.dueDate) {
      agingCurrent += balance;
      continue;
    }

    const dueDate = new Date(inv.dueDate + 'T00:00:00');
    if (isNaN(dueDate.getTime())) {
      agingCurrent += balance;
      continue;
    }

    const daysPastDue = Math.floor((endDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysPastDue <= 0) agingCurrent += balance;
    else if (daysPastDue <= 30) aging1to30 += balance;
    else if (daysPastDue <= 60) aging31to60 += balance;
    else if (daysPastDue <= 90) aging61to90 += balance;
    else agingOver90 += balance;
  }

  // ── Invoice Status Counts (all invoices up to period end) ─────────────────
  const allPeriodInvoices = await db.select({ id: invoices.id, status: invoices.status })
    .from(invoices)
    .where(and(
      eq(invoices.customerId, customerId),
      sql`${invoices.invoiceDate}::date <= ${periodEndDate}::date`
    ));

  for (const inv of allPeriodInvoices) {
    const s = (inv.status || 'draft').toLowerCase();
    if (s === 'draft') countDraft++;
    else if (s === 'approved') countApproved++;
    else if (s === 'sent' || s === 'viewed' || s === 'exported') countSent++;
    else if (s === 'overdue' || s === 'disputed') countOverdue++;
    else if (s === 'paid') countPaid++;
    else if (s === 'partially_paid') countPartiallyPaid++;
    // void/voided/cancelled/written_off: intentionally not counted
  }

  // ── A/R Reconciliation ────────────────────────────────────────────────────
  // Total aging should match closing balance (net amount owed as of period end)
  const agingTotal  = agingCurrent + aging1to30 + aging31to60 + aging61to90 + agingOver90;
  const arVariance  = Math.abs(closingBalance - agingTotal);
  const arReconciled = arVariance < 1.00; // reconciled within $1 tolerance

  if (!arReconciled) {
    console.log(`[Statement] A/R VARIANCE DETECTED: closingBalance=${closingBalance.toFixed(2)}, agingTotal=${agingTotal.toFixed(2)}, variance=${arVariance.toFixed(2)}`);
  }

  // ── Persist Statement ─────────────────────────────────────────────────────
  const snapshotVersion = await getNextSnapshotVersion(customerId, periodStartDate, periodEndDate);
  const statementNumber = await generateStatementNumber();

  const [created] = await db.insert(customerStatements).values({
    statementNumber,
    customerId,
    customerName: customer.customerName || "Unknown",
    statementType,
    snapshotVersion,
    periodStartDate,
    periodEndDate,
    openingBalance: openingBalance.toFixed(2),
    totalInvoicesIssued: totalInvoicesIssued.toFixed(2),
    totalPaymentsReceived: totalPaymentsReceived.toFixed(2),
    totalCreditsAdjustments: totalCreditsAdjustments.toFixed(2),
    closingBalance: closingBalance.toFixed(2),
    agingCurrent: agingCurrent.toFixed(2),
    aging1to30: aging1to30.toFixed(2),
    aging31to60: aging31to60.toFixed(2),
    aging61to90: aging61to90.toFixed(2),
    agingOver90: agingOver90.toFixed(2),
    invoiceCountDraft: countDraft,
    invoiceCountSent: countSent + countApproved, // legacy column: combine sent + approved
    invoiceCountPaid: countPaid,
    invoiceCountOverdue: countOverdue + countPartiallyPaid, // legacy column: combine overdue + partial
    transactionDetails: transactions,
    createdBy: generatedBy,
  }).returning();

  // ── Warning Detection ─────────────────────────────────────────────────────
  let warning: string | undefined;
  if (totalInvoicesIssued === 0 && totalPaymentsReceived > 0) {
    const [draftInfo] = await db.select({
      draftCount: sql<number>`count(*)::int`,
      draftTotal: sql<string>`coalesce(sum(total_amount::numeric), 0)::text`,
    }).from(invoices).where(and(
      eq(invoices.customerId, customerId),
      sql`${invoices.invoiceDate}::date >= ${periodStartDate}::date`,
      sql`${invoices.invoiceDate}::date <= ${periodEndDate}::date`,
      sql`coalesce(${invoices.status}, '') IN ('draft')`
    ));
    const draftCount = draftInfo?.draftCount || 0;
    const draftTotal = parseFloat(draftInfo?.draftTotal || "0");
    if (draftCount > 0) {
      warning = `No approved/sent invoices found. ${draftCount} draft invoice(s) totaling $${draftTotal.toFixed(2)} exist but are excluded. Approve or send them to include in statements.`;
    } else {
      warning = `No invoices found for this period (${periodStartDate} to ${periodEndDate}). Payments of $${totalPaymentsReceived.toFixed(2)} were recorded. Verify invoice status and date range.`;
    }
    console.log(`[Statement] WARNING: ${warning}`);
  } else if (totalInvoicesIssued === 0 && totalPaymentsReceived === 0 && totalCreditsAdjustments === 0) {
    const [totalActivity] = await db.select({
      invoiceCount: sql<number>`(SELECT count(*) FROM invoices WHERE customer_id = ${customerId} AND coalesce(status, '') NOT IN ('draft', 'void', 'voided', 'cancelled', 'written_off'))::int`,
      paymentCount: sql<number>`(SELECT count(*) FROM payments WHERE customer_id = ${customerId} AND status = 'completed' AND is_deleted = false)::int`,
      draftCount: sql<number>`(SELECT count(*) FROM invoices WHERE customer_id = ${customerId} AND coalesce(status, '') = 'draft')::int`,
    }).from(sql`(SELECT 1) AS _dummy`);
    if ((totalActivity?.invoiceCount || 0) > 0 || (totalActivity?.paymentCount || 0) > 0) {
      const [dateRange] = await db.select({
        minInvDate: sql<string>`(SELECT min(invoice_date) FROM invoices WHERE customer_id = ${customerId} AND coalesce(status, '') NOT IN ('draft', 'void', 'voided', 'cancelled', 'written_off'))`,
        maxInvDate: sql<string>`(SELECT max(invoice_date) FROM invoices WHERE customer_id = ${customerId} AND coalesce(status, '') NOT IN ('draft', 'void', 'voided', 'cancelled', 'written_off'))`,
      }).from(sql`(SELECT 1) AS _dummy`);
      warning = `No activity found in the selected period (${periodStartDate} to ${periodEndDate}). This customer has invoices between ${dateRange?.minInvDate || 'N/A'} and ${dateRange?.maxInvDate || 'N/A'}. Verify the date range.`;
    } else if ((totalActivity?.draftCount || 0) > 0) {
      warning = `No activity found. This customer has ${totalActivity?.draftCount} draft invoice(s) excluded from statements. Approve or send them to include.`;
    }
  }
  if (!arReconciled) {
    const reconcileMsg = `A/R variance of $${arVariance.toFixed(2)} detected: statement closing balance ($${closingBalance.toFixed(2)}) differs from open invoice aging total ($${agingTotal.toFixed(2)}). This may indicate unapplied credits or data corrections.`;
    warning = warning ? `${warning} | ${reconcileMsg}` : reconcileMsg;
  }

  return {
    statementNumber: created.statementNumber,
    customerId: created.customerId,
    customerName: created.customerName,
    statementType: created.statementType || "monthly",
    snapshotVersion: created.snapshotVersion || 1,
    periodStartDate: created.periodStartDate,
    periodEndDate: created.periodEndDate,
    openingBalance: created.openingBalance,
    totalInvoicesIssued: created.totalInvoicesIssued,
    totalPaymentsReceived: created.totalPaymentsReceived,
    totalCreditsAdjustments: created.totalCreditsAdjustments,
    closingBalance: created.closingBalance,
    agingCurrent: created.agingCurrent || "0.00",
    aging1to30: created.aging1to30 || "0.00",
    aging31to60: created.aging31to60 || "0.00",
    aging61to90: created.aging61to90 || "0.00",
    agingOver90: created.agingOver90 || "0.00",
    invoiceCountDraft: created.invoiceCountDraft || 0,
    invoiceCountSent: created.invoiceCountSent || 0,
    invoiceCountPaid: created.invoiceCountPaid || 0,
    invoiceCountOverdue: created.invoiceCountOverdue || 0,
    invoiceCountApproved: countApproved,
    invoiceCountPartiallyPaid: countPartiallyPaid,
    transactionDetails: (created.transactionDetails as TransactionDetail[]) || [],
    totalOpenAR: agingTotal.toFixed(2),
    agingTotal: agingTotal.toFixed(2),
    arVariance: arVariance.toFixed(2),
    arReconciled,
    ...(warning ? { warning } : {}),
  };
}

// ── Preview (compute without saving) ─────────────────────────────────────────
export async function previewStatement(params: Omit<StatementGenerationParams, 'generatedBy'>): Promise<Omit<StatementData, 'statementNumber' | 'snapshotVersion'> & { statementNumber: null; snapshotVersion: null }> {
  const stub = await generateStatement({ ...params, generatedBy: 'preview' });
  // Delete the saved record immediately (it's preview-only)
  await db.delete(customerStatements)
    .where(sql`statement_number = ${stub.statementNumber}`);
  return { ...stub, statementNumber: null, snapshotVersion: null };
}

export async function getStatements(filters?: {
  customerId?: string;
  statementType?: string;
}): Promise<any[]> {
  let query = db.select().from(customerStatements).orderBy(desc(customerStatements.createdAt));

  const conditions = [];
  if (filters?.customerId) conditions.push(eq(customerStatements.customerId, filters.customerId));
  if (filters?.statementType) conditions.push(eq(customerStatements.statementType, filters.statementType));

  if (conditions.length > 0) {
    return db.select().from(customerStatements)
      .where(and(...conditions))
      .orderBy(desc(customerStatements.createdAt));
  }

  return query;
}

export async function getStatement(id: string) {
  const [statement] = await db.select().from(customerStatements).where(eq(customerStatements.id, id));
  return statement || null;
}

// ── Compute live A/R reconciliation for a customer ────────────────────────────
export async function computeARBalance(customerId: string, asOfDate?: string): Promise<{
  totalOpenAR: string;
  agingCurrent: string;
  aging1to30: string;
  aging31to60: string;
  aging61to90: string;
  agingOver90: string;
  openInvoiceCount: number;
}> {
  const effectiveDate = asOfDate || new Date().toISOString().split('T')[0];
  const now = new Date(effectiveDate + 'T23:59:59');

  const openInvoices = await db.select()
    .from(invoices)
    .where(and(
      eq(invoices.customerId, customerId),
      sql`${invoices.invoiceDate}::date <= ${effectiveDate}::date`,
      sql`coalesce(${invoices.status}, 'draft') NOT IN ${sql.raw(NON_AGING_STATUSES)}`
    ));

  let agingCurrent = 0, aging1to30 = 0, aging31to60 = 0, aging61to90 = 0, agingOver90 = 0;
  let openCount = 0;

  for (const inv of openInvoices) {
    const balance = invoiceOpenBalance(inv);
    if (balance <= 0.005) continue;
    openCount++;

    if (!inv.dueDate) { agingCurrent += balance; continue; }
    const dueDate = new Date(inv.dueDate + 'T00:00:00');
    if (isNaN(dueDate.getTime())) { agingCurrent += balance; continue; }

    const daysPastDue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysPastDue <= 0) agingCurrent += balance;
    else if (daysPastDue <= 30) aging1to30 += balance;
    else if (daysPastDue <= 60) aging31to60 += balance;
    else if (daysPastDue <= 90) aging61to90 += balance;
    else agingOver90 += balance;
  }

  const totalOpenAR = agingCurrent + aging1to30 + aging31to60 + aging61to90 + agingOver90;
  return {
    totalOpenAR: totalOpenAR.toFixed(2),
    agingCurrent: agingCurrent.toFixed(2),
    aging1to30: aging1to30.toFixed(2),
    aging31to60: aging31to60.toFixed(2),
    aging61to90: aging61to90.toFixed(2),
    agingOver90: agingOver90.toFixed(2),
    openInvoiceCount: openCount,
  };
}

export function generateStatementPDF(statement: any): PDFKit.PDFDocument {
  const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
  const transactions = (statement.transactionDetails || []) as TransactionDetail[];

  doc.fontSize(20).text('Billing Statement', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#666');
  doc.text(`Statement #: ${statement.statementNumber}`, { align: 'center' });
  doc.text(`Period: ${formatDateStr(statement.periodStartDate)} - ${formatDateStr(statement.periodEndDate)}`, { align: 'center' });
  doc.text(`Generated: ${new Date(statement.createdAt).toLocaleDateString('en-US')}`, { align: 'center' });
  if (statement.snapshotVersion > 1) {
    doc.text(`Version: ${statement.snapshotVersion}`, { align: 'center' });
  }
  doc.moveDown();

  doc.fillColor('#000').fontSize(12).text('Customer Information', { underline: true });
  doc.fontSize(10);
  doc.text(`Customer: ${statement.customerName}`);
  doc.text(`Statement Type: ${statement.statementType === 'monthly' ? 'Monthly' : 'Custom Date Range'}`);
  doc.moveDown();

  doc.fontSize(12).text('Balance Summary', { underline: true });
  doc.fontSize(10);
  doc.text(`Opening Balance:           ${formatCurrency(parseFloat(statement.openingBalance || '0'))}`);
  doc.text(`Invoices Issued:         + ${formatCurrency(parseFloat(statement.totalInvoicesIssued || '0'))}`);
  doc.text(`Payments Received:       - ${formatCurrency(parseFloat(statement.totalPaymentsReceived || '0'))}`);
  doc.text(`Credits/Adjustments:     - ${formatCurrency(parseFloat(statement.totalCreditsAdjustments || '0'))}`);
  doc.moveDown(0.3);
  doc.fontSize(11).text(`Closing Balance:           ${formatCurrency(parseFloat(statement.closingBalance || '0'))}`, { underline: true });
  doc.moveDown();

  doc.fontSize(12).text('Aging Summary (Open A/R)', { underline: true });
  doc.fontSize(10);
  doc.text(`Current:        ${formatCurrency(parseFloat(statement.agingCurrent || '0'))}`);
  doc.text(`1-30 Days:      ${formatCurrency(parseFloat(statement.aging1to30 || '0'))}`);
  doc.text(`31-60 Days:     ${formatCurrency(parseFloat(statement.aging31to60 || '0'))}`);
  doc.text(`61-90 Days:     ${formatCurrency(parseFloat(statement.aging61to90 || '0'))}`);
  doc.text(`Over 90 Days:   ${formatCurrency(parseFloat(statement.agingOver90 || '0'))}`);
  const agingTotal = (parseFloat(statement.agingCurrent || '0') + parseFloat(statement.aging1to30 || '0') +
    parseFloat(statement.aging31to60 || '0') + parseFloat(statement.aging61to90 || '0') + parseFloat(statement.agingOver90 || '0'));
  doc.moveDown(0.3);
  doc.text(`Total Open A/R: ${formatCurrency(agingTotal)}`, { underline: true });
  doc.moveDown();

  if (transactions.length > 0) {
    doc.fontSize(12).text('Transaction Details', { underline: true });
    doc.moveDown(0.5);

    const tableTop = doc.y;
    const colWidths = [65, 70, 150, 65, 65, 75];
    const headers = ['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'];

    doc.fillColor('#333').fontSize(8);
    let x = 40;
    headers.forEach((header, i) => {
      doc.text(header, x, tableTop, { width: colWidths[i], align: i >= 3 ? 'right' : 'left' });
      x += colWidths[i];
    });

    doc.moveTo(40, tableTop + 12).lineTo(530, tableTop + 12).stroke();

    let y = tableTop + 16;
    doc.fillColor('#000');

    const displayCount = Math.min(transactions.length, 60);
    for (let i = 0; i < displayCount; i++) {
      const tx = transactions[i];
      if (y > 700) {
        doc.addPage();
        y = 40;
      }

      x = 40;
      const debitVal = parseFloat(tx.debit || '0');
      const creditVal = parseFloat(tx.credit || '0');
      const balVal = parseFloat(tx.runningBalance || '0');
      const rowData = [
        formatDateStr(tx.date),
        tx.reference,
        tx.description.substring(0, 30),
        debitVal > 0 ? formatCurrency(debitVal) : '',
        creditVal > 0 ? formatCurrency(creditVal) : '',
        formatCurrency(balVal),
      ];

      rowData.forEach((cell, j) => {
        doc.text(String(cell), x, y, { width: colWidths[j], align: j >= 3 ? 'right' : 'left' });
        x += colWidths[j];
      });

      y += 14;
    }

    if (transactions.length > 60) {
      doc.moveDown();
      doc.text(`... and ${transactions.length - 60} more transactions.`);
    }
  } else {
    doc.fontSize(10).text('No transactions during this period.');
  }

  doc.moveDown(2);
  doc.fontSize(8).fillColor('#999');
  doc.text('This statement is an immutable snapshot generated by DriverHub 360.', { align: 'center' });
  doc.text('Regenerating a statement creates a new version without altering historical records.', { align: 'center' });

  return doc;
}
