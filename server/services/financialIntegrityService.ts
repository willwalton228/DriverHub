/**
 * Financial Integrity Service — Epic 2
 *
 * Central enforcement engine for:
 *  - Duplicate payment / invoice detection
 *  - Deposit batch balance validation
 *  - Ledger reconciliation
 *  - Financial freeze rule enforcement
 *  - Audit event emission
 */

import { db } from "../db";
import {
  invoices, payments, depositBatches, arLedgerEntries, creditMemos,
  paymentApplications, customers, billableCharges,
} from "@shared/schema";
import { eq, and, sql, not, ne } from "drizzle-orm";
import { writeSystemAuditEvent } from "./systemAuditLogService";

// ── Constants ──────────────────────────────────────────────────────────────────

/** Batch statuses where NO modifications to payments are allowed */
export const FROZEN_BATCH_STATUSES = ["submitted", "locked", "reconciled"] as const;
/** Batch statuses where edits to metadata (date, bank, method) revert to draft */
export const METADATA_REVERT_STATUSES = ["balanced"] as const;

/** Soft-duplicate window: flag if same customer+amount+method+date exists within this many days */
const SOFT_DUPLICATE_WINDOW_DAYS = 3;

// ── Freeze Rules ───────────────────────────────────────────────────────────────

export function isBatchFrozen(status: string | null | undefined): boolean {
  return FROZEN_BATCH_STATUSES.includes(status as any);
}

export function canAddRemovePayments(status: string | null | undefined): boolean {
  return status === "draft" || status === "balanced";
}

// ── Duplicate Detection ────────────────────────────────────────────────────────

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  isSoftDuplicate: boolean;
  duplicateId: string | null;
  duplicateRef: string | null;
  reason: string | null;
}

/**
 * Hard duplicate: same customer + same check number (non-deleted, completed/pending)
 * Soft duplicate: same customer + same amount + same date + same method within SOFT_DUPLICATE_WINDOW_DAYS
 */
export async function checkPaymentDuplicate(input: {
  customerId: string;
  amount: string | number;
  paymentDate: string;
  paymentMethod: string;
  checkNumber?: string | null;
  excludePaymentId?: string;
}): Promise<DuplicateCheckResult> {
  const { customerId, amount, paymentDate, paymentMethod, checkNumber, excludePaymentId } = input;

  // Hard duplicate: same check number
  if (checkNumber && checkNumber.trim()) {
    const [existing] = await db.select({ id: payments.id, paymentNumber: payments.paymentNumber })
      .from(payments)
      .where(and(
        eq(payments.customerId, customerId),
        eq(payments.checkNumber, checkNumber.trim()),
        eq(payments.isDeleted, false),
        ...(excludePaymentId ? [ne(payments.id, excludePaymentId)] : []),
      ))
      .limit(1);

    if (existing) {
      return {
        isDuplicate: true,
        isSoftDuplicate: false,
        duplicateId: existing.id,
        duplicateRef: existing.paymentNumber,
        reason: `Check number ${checkNumber} already recorded as payment ${existing.paymentNumber}`,
      };
    }
  }

  // Soft duplicate: same customer + amount + method + date within window
  const windowStart = new Date(paymentDate);
  windowStart.setDate(windowStart.getDate() - SOFT_DUPLICATE_WINDOW_DAYS);
  const windowEnd = new Date(paymentDate);
  windowEnd.setDate(windowEnd.getDate() + SOFT_DUPLICATE_WINDOW_DAYS);

  const amountStr = parseFloat(String(amount)).toFixed(2);
  const [softDup] = await db.select({ id: payments.id, paymentNumber: payments.paymentNumber, paymentDate: payments.paymentDate })
    .from(payments)
    .where(and(
      eq(payments.customerId, customerId),
      sql`${payments.amount}::numeric = ${amountStr}::numeric`,
      eq(payments.paymentMethod, paymentMethod),
      eq(payments.isDeleted, false),
      sql`${payments.paymentDate}::date BETWEEN ${windowStart.toISOString().split('T')[0]}::date AND ${windowEnd.toISOString().split('T')[0]}::date`,
      ...(excludePaymentId ? [ne(payments.id, excludePaymentId)] : []),
    ))
    .limit(1);

  if (softDup) {
    return {
      isDuplicate: false,
      isSoftDuplicate: true,
      duplicateId: softDup.id,
      duplicateRef: softDup.paymentNumber,
      reason: `Possible duplicate: payment ${softDup.paymentNumber} for same amount, method, and date (${softDup.paymentDate}) already exists`,
    };
  }

  return { isDuplicate: false, isSoftDuplicate: false, duplicateId: null, duplicateRef: null, reason: null };
}

/**
 * Hard duplicate: same customer + same reference/PO number (non-cancelled invoices)
 * Soft duplicate: same customer + same amount + same invoice date (within ±1 day)
 */
export async function checkInvoiceDuplicate(input: {
  customerId: string;
  amount: string | number;
  invoiceDate: string;
  referenceNumber?: string | null;
  poNumber?: string | null;
  excludeInvoiceId?: string;
}): Promise<DuplicateCheckResult> {
  const { customerId, amount, invoiceDate, referenceNumber, poNumber, excludeInvoiceId } = input;

  const CANCELLED = `('draft', 'void', 'voided', 'cancelled', 'written_off')`;

  // Hard duplicate: same reference number
  const refToCheck = referenceNumber?.trim() || poNumber?.trim();
  if (refToCheck) {
    const [existing] = await db.select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, referenceNumber: invoices.referenceNumber })
      .from(invoices)
      .where(and(
        eq(invoices.customerId, customerId),
        sql`coalesce(${invoices.status}, 'draft') NOT IN ${sql.raw(CANCELLED)}`,
        sql`(${invoices.referenceNumber} = ${refToCheck} OR ${invoices.poNumber} = ${refToCheck})`,
        ...(excludeInvoiceId ? [ne(invoices.id, excludeInvoiceId)] : []),
      ))
      .limit(1);

    if (existing) {
      return {
        isDuplicate: true,
        isSoftDuplicate: false,
        duplicateId: existing.id,
        duplicateRef: existing.invoiceNumber,
        reason: `Invoice ${existing.invoiceNumber} already exists with reference number "${refToCheck}"`,
      };
    }
  }

  // Soft duplicate: same amount + date (±1 day)
  const amountStr = parseFloat(String(amount)).toFixed(2);
  const dayBefore = new Date(invoiceDate);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const dayAfter = new Date(invoiceDate);
  dayAfter.setDate(dayAfter.getDate() + 1);

  const [softDup] = await db.select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, invoiceDate: invoices.invoiceDate })
    .from(invoices)
    .where(and(
      eq(invoices.customerId, customerId),
      sql`coalesce(${invoices.status}, 'draft') NOT IN ${sql.raw(CANCELLED)}`,
      sql`${invoices.totalAmount}::numeric = ${amountStr}::numeric`,
      sql`${invoices.invoiceDate}::date BETWEEN ${dayBefore.toISOString().split('T')[0]}::date AND ${dayAfter.toISOString().split('T')[0]}::date`,
      ...(excludeInvoiceId ? [ne(invoices.id, excludeInvoiceId)] : []),
    ))
    .limit(1);

  if (softDup) {
    return {
      isDuplicate: false,
      isSoftDuplicate: true,
      duplicateId: softDup.id,
      duplicateRef: softDup.invoiceNumber,
      reason: `Possible duplicate: invoice ${softDup.invoiceNumber} for same amount and date (${softDup.invoiceDate}) already exists`,
    };
  }

  return { isDuplicate: false, isSoftDuplicate: false, duplicateId: null, duplicateRef: null, reason: null };
}

/**
 * Soft duplicate detection for manually-entered billable charges.
 * Hard duplicate: same sourceReferenceId (cross-check for any source type).
 * Soft duplicate: same customer + same amount (within ±1%) + charge date within ±3 days.
 * Only runs the soft check when there is no sourceReferenceId (i.e. truly manual charges).
 */
export async function checkChargeDuplicate(input: {
  customerId: string;
  amount: string | number;
  chargeDate: string;
  sourceReferenceId?: string | null;
  excludeChargeId?: string;
}): Promise<DuplicateCheckResult> {
  const { customerId, amount, chargeDate, sourceReferenceId, excludeChargeId } = input;

  // Hard duplicate: same source reference (any source type)
  if (sourceReferenceId?.trim()) {
    const [existing] = await db.select({ id: billableCharges.id, billingStatus: billableCharges.billingStatus })
      .from(billableCharges)
      .where(and(
        eq(billableCharges.sourceReferenceId, sourceReferenceId.trim()),
        ...(excludeChargeId ? [ne(billableCharges.id, excludeChargeId)] : []),
      ))
      .limit(1);

    if (existing) {
      return {
        isDuplicate: true,
        isSoftDuplicate: false,
        duplicateId: existing.id,
        duplicateRef: sourceReferenceId.trim(),
        reason: `A charge with reference "${sourceReferenceId.trim()}" already exists (status: ${existing.billingStatus}).`,
      };
    }
  }

  // Soft duplicate: same customer + amount within ±1% + charge date within ±3 days
  const amtNum = parseFloat(String(amount));
  if (!isNaN(amtNum) && amtNum > 0) {
    const windowStart = new Date(chargeDate);
    windowStart.setDate(windowStart.getDate() - 3);
    const windowEnd = new Date(chargeDate);
    windowEnd.setDate(windowEnd.getDate() + 3);
    const amtLow  = (amtNum * 0.99).toFixed(2);
    const amtHigh = (amtNum * 1.01).toFixed(2);

    const [softDup] = await db.select({ id: billableCharges.id, chargeDate: billableCharges.chargeDate, amount: billableCharges.amount, description: billableCharges.description })
      .from(billableCharges)
      .where(and(
        eq(billableCharges.customerId, customerId),
        sql`${billableCharges.amount}::numeric BETWEEN ${amtLow}::numeric AND ${amtHigh}::numeric`,
        sql`${billableCharges.chargeDate}::date BETWEEN ${windowStart.toISOString().split("T")[0]}::date AND ${windowEnd.toISOString().split("T")[0]}::date`,
        sql`${billableCharges.billingStatus} NOT IN ('voided', 'void', 'cancelled')`,
        ...(excludeChargeId ? [ne(billableCharges.id, excludeChargeId)] : []),
      ))
      .limit(1);

    if (softDup) {
      return {
        isDuplicate: false,
        isSoftDuplicate: true,
        duplicateId: softDup.id,
        duplicateRef: null,
        reason: `Possible duplicate: a charge of similar amount ($${Number(softDup.amount).toFixed(2)}) already exists for this account on ${softDup.chargeDate}${softDup.description ? ` ("${softDup.description}")` : ""}.`,
      };
    }
  }

  return { isDuplicate: false, isSoftDuplicate: false, duplicateId: null, duplicateRef: null, reason: null };
}

// ── Deposit Batch Balance Validation ──────────────────────────────────────────

export interface BatchBalanceResult {
  valid: boolean;
  batchTotal: number;
  paymentSum: number;
  variance: number;
  itemCount: number;
  paymentCount: number;
  error?: string;
}

export async function validateDepositBatchBalance(batchId: string): Promise<BatchBalanceResult> {
  const [batch] = await db.select()
    .from(depositBatches)
    .where(eq(depositBatches.id, batchId));

  if (!batch) {
    return { valid: false, batchTotal: 0, paymentSum: 0, variance: 0, itemCount: 0, paymentCount: 0, error: "Batch not found" };
  }

  const [sumResult] = await db.select({
    paymentSum: sql<string>`coalesce(sum(p.amount::numeric - coalesce(p.refunded_amount::numeric, 0)), 0)::text`,
    paymentCount: sql<number>`count(*)::int`,
  }).from(sql`payments p`)
    .where(sql`p.deposit_batch_id = ${batchId} AND p.is_deleted = false AND p.status IN ('completed', 'pending')`);

  const batchTotal = parseFloat(batch.totalAmount || "0");
  const paymentSum = parseFloat(sumResult?.paymentSum || "0");
  const paymentCount = sumResult?.paymentCount || 0;
  const variance = Math.abs(batchTotal - paymentSum);

  if (paymentCount === 0) {
    return { valid: false, batchTotal, paymentSum, variance, itemCount: batch.itemCount || 0, paymentCount, error: "No payments in batch" };
  }

  // Allow up to $0.01 floating-point variance
  const valid = variance <= 0.01;
  const error = valid ? undefined : `Batch total (${batchTotal.toFixed(2)}) does not match sum of payments (${paymentSum.toFixed(2)}). Variance: $${variance.toFixed(2)}`;

  return { valid, batchTotal, paymentSum, variance, itemCount: batch.itemCount || 0, paymentCount, error };
}

// ── Ledger Reconciliation ──────────────────────────────────────────────────────

export interface LedgerReconciliationResult {
  asOf: string;
  customerId: string | null;
  // Invoicing totals
  totalInvoiced: string;
  totalCancelled: string;
  netInvoiced: string;
  // Payment totals
  totalPaymentsReceived: string;
  totalRefunded: string;
  netPayments: string;
  // Open A/R
  openAR: string;
  // Deposit tracking
  depositedAmount: string;          // sum in submitted/locked/reconciled batches
  undepositedAmount: string;        // completed payments not in any batch (or in draft/balanced batch)
  // Reconciliation check
  expectedBalance: string;           // netInvoiced - netPayments
  arVariance: string;                // |expectedBalance - openAR|
  arReconciled: boolean;
  // Credit memo totals
  totalCredits: string;
  // Individual flags
  undepositedPaymentCount: number;
  openInvoiceCount: number;
  overdueInvoiceCount: number;
  // System health
  status: "clean" | "warning" | "error";
  warnings: string[];
  errors: string[];
}

const CANCELLED_SQL = `('draft', 'void', 'voided', 'cancelled', 'written_off')`;

export async function runLedgerReconciliation(opts: {
  asOf?: string;
  customerId?: string;
}): Promise<LedgerReconciliationResult> {
  const asOf = opts.asOf || new Date().toISOString().split('T')[0];
  const customerId = opts.customerId || null;

  const customerFilter = customerId ? `AND customer_id = '${customerId}'` : '';

  // Total invoiced (non-cancelled, as of date)
  const [invResult] = await db.execute(sql.raw(`
    SELECT
      coalesce(sum(CASE WHEN coalesce(status,'draft') NOT IN ${CANCELLED_SQL} THEN total_amount::numeric ELSE 0 END), 0)::text AS total_invoiced,
      coalesce(sum(CASE WHEN coalesce(status,'draft') IN ${CANCELLED_SQL} THEN total_amount::numeric ELSE 0 END), 0)::text AS total_cancelled,
      count(CASE WHEN coalesce(status,'draft') NOT IN ${CANCELLED_SQL} AND coalesce(status,'draft') != 'paid' THEN 1 END)::int AS open_invoice_count,
      count(CASE WHEN coalesce(status,'draft') = 'overdue' THEN 1 END)::int AS overdue_invoice_count
    FROM invoices
    WHERE invoice_date::date <= '${asOf}'::date ${customerFilter}
  `)) as any;

  // Total paid amount on non-cancelled invoices (balance_due or total_amount - paid_amount)
  const [openARResult] = await db.execute(sql.raw(`
    SELECT coalesce(sum(
      CASE 
        WHEN coalesce(status,'draft') NOT IN ${CANCELLED_SQL} AND coalesce(status,'draft') != 'paid'
        THEN GREATEST(coalesce(balance_due::numeric, total_amount::numeric - coalesce(paid_amount::numeric, 0)), 0)
        ELSE 0
      END
    ), 0)::text AS open_ar
    FROM invoices
    WHERE invoice_date::date <= '${asOf}'::date ${customerFilter}
  `)) as any;

  // Payment totals
  const [pmtResult] = await db.execute(sql.raw(`
    SELECT
      coalesce(sum(amount::numeric), 0)::text AS total_received,
      coalesce(sum(coalesce(refunded_amount::numeric, 0)), 0)::text AS total_refunded,
      coalesce(sum(CASE WHEN coalesce(deposit_batch_id, '') = '' THEN amount::numeric - coalesce(refunded_amount::numeric,0) ELSE 0 END), 0)::text AS undeposited_amount,
      count(CASE WHEN coalesce(deposit_batch_id, '') = '' THEN 1 END)::int AS undeposited_count
    FROM payments
    WHERE status = 'completed' AND is_deleted = false AND payment_date::date <= '${asOf}'::date ${customerFilter}
  `)) as any;

  // Deposited amount in submitted/locked/reconciled batches
  const [batchResult] = await db.execute(sql.raw(`
    SELECT coalesce(sum(p.amount::numeric - coalesce(p.refunded_amount::numeric,0)), 0)::text AS deposited_amount
    FROM payments p
    JOIN deposit_batches db ON db.id = p.deposit_batch_id
    WHERE p.status = 'completed' AND p.is_deleted = false
      AND db.status IN ('submitted', 'locked', 'reconciled')
      AND p.payment_date::date <= '${asOf}'::date ${customerFilter.replace('customer_id', 'p.customer_id')}
  `)) as any;

  // Credit memos
  const [creditResult] = await db.execute(sql.raw(`
    SELECT coalesce(sum(amount::numeric), 0)::text AS total_credits
    FROM credit_memos
    WHERE coalesce(status,'') != 'cancelled' AND credit_date::date <= '${asOf}'::date ${customerFilter.replace('customer_id', 'customer_id')}
  `)) as any;

  const totalInvoiced = parseFloat(invResult?.total_invoiced || "0");
  const totalCancelled = parseFloat(invResult?.total_cancelled || "0");
  const netInvoiced = totalInvoiced;

  const totalReceived = parseFloat(pmtResult?.total_received || "0");
  const totalRefunded = parseFloat(pmtResult?.total_refunded || "0");
  const netPayments = totalReceived - totalRefunded;

  const totalCredits = parseFloat(creditResult?.total_credits || "0");
  const openAR = parseFloat(openARResult?.open_ar || "0");
  const depositedAmount = parseFloat(batchResult?.deposited_amount || "0");
  const undepositedAmount = parseFloat(pmtResult?.undeposited_amount || "0");

  // Expected balance: net invoiced - net payments - credits
  const expectedBalance = netInvoiced - netPayments - totalCredits;
  const arVariance = Math.abs(expectedBalance - openAR);
  const arReconciled = arVariance <= 1.00;

  const undepositedPaymentCount = invResult?.undeposited_count || pmtResult?.undeposited_count || 0;
  const openInvoiceCount = invResult?.open_invoice_count || 0;
  const overdueInvoiceCount = invResult?.overdue_invoice_count || 0;

  // Build warnings/errors
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!arReconciled) {
    errors.push(`A/R variance of $${arVariance.toFixed(2)}: expected balance $${expectedBalance.toFixed(2)} vs open A/R $${openAR.toFixed(2)}`);
  }
  if (undepositedAmount > 0) {
    warnings.push(`$${undepositedAmount.toFixed(2)} in undeposited payments (${undepositedPaymentCount} payment(s) not in any finalized batch)`);
  }
  if (overdueInvoiceCount > 0) {
    warnings.push(`${overdueInvoiceCount} overdue invoice(s) with outstanding balances`);
  }

  const status: LedgerReconciliationResult["status"] =
    errors.length > 0 ? "error" :
    warnings.length > 0 ? "warning" : "clean";

  return {
    asOf,
    customerId,
    totalInvoiced: totalInvoiced.toFixed(2),
    totalCancelled: totalCancelled.toFixed(2),
    netInvoiced: netInvoiced.toFixed(2),
    totalPaymentsReceived: totalReceived.toFixed(2),
    totalRefunded: totalRefunded.toFixed(2),
    netPayments: netPayments.toFixed(2),
    openAR: openAR.toFixed(2),
    depositedAmount: depositedAmount.toFixed(2),
    undepositedAmount: undepositedAmount.toFixed(2),
    expectedBalance: expectedBalance.toFixed(2),
    arVariance: arVariance.toFixed(2),
    arReconciled,
    totalCredits: totalCredits.toFixed(2),
    undepositedPaymentCount,
    openInvoiceCount,
    overdueInvoiceCount,
    status,
    warnings,
    errors,
  };
}

// ── Financial Audit Event ─────────────────────────────────────────────────────

export async function writeFinancialAuditEvent(event: {
  eventType: string;           // e.g. "invoice.created" — will be stored as "financial.<eventType>"
  actorUserId: string | null;
  actorUserEmail?: string | null;
  actorUserName?: string | null;
  targetEntityType: string;    // "invoice" | "payment" | "deposit_batch" | "credit_memo" | "payment_application" | ...
  targetEntityId: string;
  targetEntityLabel?: string | null;
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  notes?: string | null;       // stored as `reason` in systemAuditLog
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
}): Promise<void> {
  // Strip any accidental "financial." prefix the caller may have added — we always add it here
  const rawType = event.eventType.startsWith("financial.")
    ? event.eventType.slice("financial.".length)
    : event.eventType;

  const enrichedMetadata: Record<string, unknown> = { ...(event.metadata ?? {}) };
  if (event.actorUserName) enrichedMetadata.actorUserName = event.actorUserName;

  await writeSystemAuditEvent({
    eventType: `financial.${rawType}`,
    actorUserId: event.actorUserId ?? null,
    actorUserEmail: event.actorUserEmail ?? null,
    targetEntityType: event.targetEntityType,
    targetEntityId: event.targetEntityId,
    targetEntityLabel: event.targetEntityLabel ?? null,
    reason: event.notes ?? null,
    previousValue: event.previousValue ?? null,
    newValue: event.newValue ?? null,
    metadata: Object.keys(enrichedMetadata).length > 0 ? enrichedMetadata : null,
    ipAddress: event.ipAddress ?? null,
  });
}
