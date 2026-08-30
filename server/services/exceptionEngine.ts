/**
 * Financial Exception Detection Engine
 *
 * Creates and stores financial anomaly flags in the `financial_exceptions` table
 * in real-time as events occur (payment creation, edits, reversals, etc.).
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExceptionSeverity = "error" | "warning";
type ExceptionStatus = "open" | "resolved" | "dismissed";

interface FlagInput {
  type: string;
  severity?: ExceptionSeverity;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  description: string;
  amount?: number | null;
  customerId?: string | null;
  metadata?: Record<string, unknown>;
}

// ─── Core storage ─────────────────────────────────────────────────────────────

/**
 * Upsert an exception record. If an open exception of the same type + entityId
 * already exists, it is left as-is (idempotent). Returns the inserted/existing id.
 */
export async function flagException(input: FlagInput): Promise<void> {
  try {
    await db.execute(sql.raw(`
      INSERT INTO financial_exceptions
        (type, severity, entity_type, entity_id, entity_label,
         description, amount, customer_id, status, metadata)
      SELECT
        '${esc(input.type)}',
        '${esc(input.severity ?? "warning")}',
        '${esc(input.entityType)}',
        '${esc(input.entityId)}',
        ${input.entityLabel ? `'${esc(input.entityLabel)}'` : "NULL"},
        '${esc(input.description)}',
        ${input.amount != null ? input.amount : "NULL"},
        ${input.customerId ? `'${esc(input.customerId)}'` : "NULL"},
        'open',
        ${input.metadata ? `'${esc(JSON.stringify(input.metadata))}'::jsonb` : "NULL"}
      WHERE NOT EXISTS (
        SELECT 1 FROM financial_exceptions
        WHERE type = '${esc(input.type)}'
          AND entity_id = '${esc(input.entityId)}'
          AND status = 'open'
      )
    `));
  } catch (err) {
    console.error("[ExceptionEngine] flagException failed:", err);
  }
}

/**
 * Clear (auto-resolve) an open exception when the underlying condition is fixed.
 */
export async function clearException(type: string, entityId: string, note?: string): Promise<void> {
  try {
    await db.execute(sql.raw(`
      UPDATE financial_exceptions
      SET status = 'resolved',
          resolved_at = NOW(),
          resolution_note = ${note ? `'${esc(note)}'` : "'Auto-resolved by system'"}
      WHERE type = '${esc(type)}'
        AND entity_id = '${esc(entityId)}'
        AND status = 'open'
    `));
  } catch (err) {
    console.error("[ExceptionEngine] clearException failed:", err);
  }
}

// ─── Event Handlers ───────────────────────────────────────────────────────────

/**
 * Called when any payment is created.
 * Flags: payment_without_invoice (if no allocations), duplicate_payment, manual_payment
 */
export async function onPaymentCreated(payment: {
  id: string;
  paymentNumber?: string | null;
  customerId: string;
  amount: string | number;
  paymentMethod?: string | null;
  appliedAmount?: string | number | null;
  isManualEntry?: boolean;
  checkNumber?: string | null;
  referenceNumber?: string | null;
  paymentDate?: string | null;
}): Promise<void> {
  const label = payment.paymentNumber
    ? `#${payment.paymentNumber}`
    : `Payment ${payment.id.slice(0, 8)}`;
  const amount = parseFloat(String(payment.amount));
  const applied = parseFloat(String(payment.appliedAmount ?? 0));

  // Rule 1: Payment without invoice (unapplied)
  if (applied === 0) {
    await flagException({
      type: "payment_without_invoice",
      severity: "warning",
      entityType: "payment",
      entityId: payment.id,
      entityLabel: label,
      description: `Payment ${label} of $${amount.toFixed(2)} was received but not applied to any invoice`,
      amount,
      customerId: payment.customerId,
      metadata: { paymentMethod: payment.paymentMethod, paymentDate: payment.paymentDate },
    });
  }

  // Rule 5: Duplicate within time window — check for existing similar payment
  try {
    const dupeRows = await db.execute(sql.raw(`
      SELECT id, payment_number, payment_date::text
      FROM payments
      WHERE id != '${esc(payment.id)}'
        AND customer_id = '${esc(payment.customerId)}'
        AND is_deleted = false
        AND is_reversal = false
        AND status = 'completed'
        AND ABS(amount::numeric - ${amount}) < (${amount} * 0.01)
        AND ABS(EXTRACT(EPOCH FROM (payment_date::date - ${payment.paymentDate ? `'${esc(payment.paymentDate)}'::date` : "CURRENT_DATE"}))) < 172800
      LIMIT 1
    `)) as any[];

    if (dupeRows.length > 0) {
      const dupe = dupeRows[0] as any;
      await flagException({
        type: "duplicate_payment",
        severity: "error",
        entityType: "payment",
        entityId: payment.id,
        entityLabel: label,
        description: `Possible duplicate of #${dupe.payment_number ?? dupe.id.slice(0, 8)} (${dupe.payment_date}) — same customer and amount ($${amount.toFixed(2)}) within 48 hours`,
        amount,
        customerId: payment.customerId,
        metadata: { possibleOriginalId: dupe.id, possibleOriginalNumber: dupe.payment_number },
      });
    }
  } catch (_) {}

  // Rule 6: Manual payment entry (offline methods)
  const manualMethods = ["check", "wire", "ach_manual", "cash", "other"];
  if (payment.paymentMethod && manualMethods.includes(payment.paymentMethod)) {
    await flagException({
      type: "manual_payment",
      severity: "warning",
      entityType: "payment",
      entityId: payment.id,
      entityLabel: label,
      description: `Manual ${payment.paymentMethod.toUpperCase()} payment ${label} of $${amount.toFixed(2)} entered — verify against bank records`,
      amount,
      customerId: payment.customerId,
      metadata: { paymentMethod: payment.paymentMethod, checkNumber: payment.checkNumber, referenceNumber: payment.referenceNumber },
    });
  }
}

/**
 * Called when a payment is edited (adjustment_reason set).
 * Flags: payment_edited_after_creation
 */
export async function onPaymentEdited(payment: {
  id: string;
  paymentNumber?: string | null;
  customerId?: string | null;
  amount?: string | number | null;
  reason: string;
}): Promise<void> {
  const label = payment.paymentNumber
    ? `#${payment.paymentNumber}`
    : `Payment ${payment.id.slice(0, 8)}`;
  const amount = payment.amount ? parseFloat(String(payment.amount)) : null;

  await flagException({
    type: "payment_edited_after_creation",
    severity: "warning",
    entityType: "payment",
    entityId: payment.id,
    entityLabel: label,
    description: `Payment ${label} was manually edited after creation — Reason: ${payment.reason}`,
    amount,
    customerId: payment.customerId ?? null,
    metadata: { reason: payment.reason },
  });
}

/**
 * Called when a reversal is created.
 * Flags: payment_reversal on the reversal entry, clears payment_without_invoice for original.
 */
export async function onPaymentReversed(
  originalPayment: { id: string; paymentNumber?: string | null; customerId?: string | null; amount: string | number },
  reversalEntry: { id: string; paymentNumber?: string | null }
): Promise<void> {
  const reversalLabel = reversalEntry.paymentNumber
    ? `#${reversalEntry.paymentNumber}`
    : `Payment ${reversalEntry.id.slice(0, 8)}`;
  const amount = parseFloat(String(originalPayment.amount));

  await flagException({
    type: "payment_reversal",
    severity: "warning",
    entityType: "payment",
    entityId: reversalEntry.id,
    entityLabel: reversalLabel,
    description: `Reversal entry created for original payment ${originalPayment.paymentNumber ?? originalPayment.id.slice(0, 8)} — $${amount.toFixed(2)}`,
    amount,
    customerId: originalPayment.customerId ?? null,
    metadata: { originalPaymentId: originalPayment.id, originalPaymentNumber: originalPayment.paymentNumber },
  });

  // Auto-clear the payment_without_invoice exception for the original (it's now reversed)
  await clearException("payment_without_invoice", originalPayment.id, "Payment reversed — original closed out");
}

/**
 * Called when a payment is removed from a deposit batch.
 * Flags: payment_removed_from_batch
 */
export async function onPaymentRemovedFromBatch(
  paymentId: string,
  batchId: string,
  context?: { paymentNumber?: string | null; amount?: number | null; customerId?: string | null; batchName?: string | null }
): Promise<void> {
  const label = context?.paymentNumber ? `#${context.paymentNumber}` : `Payment ${paymentId.slice(0, 8)}`;
  const batchLabel = context?.batchName ?? batchId.slice(0, 8);

  await flagException({
    type: "payment_removed_from_batch",
    severity: "warning",
    entityType: "payment",
    entityId: paymentId,
    entityLabel: label,
    description: `Payment ${label} was removed from deposit batch ${batchLabel} — verify batch integrity`,
    amount: context?.amount ?? null,
    customerId: context?.customerId ?? null,
    metadata: { batchId, batchName: context?.batchName },
  });
}

/**
 * Called when an invoice is adjusted (PATCH) when it already has payments applied.
 * Flags: invoice_adjusted_after_payment
 */
export async function onInvoiceAdjusted(invoice: {
  id: string;
  invoiceNumber?: string | null;
  customerId?: string | null;
  totalAmount?: string | number | null;
  paidAmount?: string | number | null;
  changedFields: string[];
}): Promise<void> {
  const paid = parseFloat(String(invoice.paidAmount ?? 0));
  if (paid <= 0) return; // Only flag if payment was already applied

  const label = invoice.invoiceNumber ? `Invoice #${invoice.invoiceNumber}` : `Invoice ${invoice.id.slice(0, 8)}`;

  await flagException({
    type: "invoice_adjusted_after_payment",
    severity: "warning",
    entityType: "invoice",
    entityId: invoice.id,
    entityLabel: label,
    description: `${label} was adjusted after payment — changed fields: ${invoice.changedFields.join(", ")}. Review balance integrity.`,
    amount: invoice.totalAmount ? parseFloat(String(invoice.totalAmount)) : null,
    customerId: invoice.customerId ?? null,
    metadata: { changedFields: invoice.changedFields, paidAmount: paid },
  });
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return String(s).replace(/'/g, "''");
}

// ─── Full Scan ────────────────────────────────────────────────────────────────

/**
 * On-demand full scan — detects exceptions not covered by real-time hooks
 * (e.g., historical data or conditions that existed before engine was deployed).
 * Returns the count of new exceptions inserted.
 */
export async function runFullExceptionScan(): Promise<number> {
  let newCount = 0;

  try {
    // Scan 1: All unapplied completed payments
    const unapplied = await db.execute(sql.raw(`
      SELECT p.id, p.amount::numeric, p.payment_number,
             p.customer_id, p.payment_method, p.payment_date::text,
             p.check_number, p.reference_number
      FROM payments p
      WHERE p.status = 'completed'
        AND p.is_deleted = false
        AND p.is_reversal = false
        AND COALESCE(p.applied_amount, 0) = 0
        AND NOT EXISTS (
          SELECT 1 FROM financial_exceptions fe
          WHERE fe.type = 'payment_without_invoice'
            AND fe.entity_id = p.id
            AND fe.status = 'open'
        )
      LIMIT 500
    `)) as any[];

    for (const r of unapplied as any[]) {
      await flagException({
        type: "payment_without_invoice",
        severity: "warning",
        entityType: "payment",
        entityId: r.id,
        entityLabel: r.payment_number ? `#${r.payment_number}` : `Payment ${r.id.slice(0, 8)}`,
        description: `Payment of $${parseFloat(r.amount).toFixed(2)} was received but not applied to any invoice`,
        amount: parseFloat(r.amount),
        customerId: r.customer_id,
        metadata: { paymentMethod: r.payment_method, paymentDate: r.payment_date },
      });
      newCount++;
    }

    // Scan 2: All edited payments not yet flagged
    const edited = await db.execute(sql.raw(`
      SELECT p.id, p.amount::numeric, p.payment_number, p.customer_id, p.adjustment_reason
      FROM payments p
      WHERE p.adjustment_reason IS NOT NULL
        AND p.is_reversal = false
        AND p.is_deleted = false
        AND NOT EXISTS (
          SELECT 1 FROM financial_exceptions fe
          WHERE fe.type = 'payment_edited_after_creation'
            AND fe.entity_id = p.id
            AND fe.status = 'open'
        )
      LIMIT 500
    `)) as any[];

    for (const r of edited as any[]) {
      await flagException({
        type: "payment_edited_after_creation",
        severity: "warning",
        entityType: "payment",
        entityId: r.id,
        entityLabel: r.payment_number ? `#${r.payment_number}` : `Payment ${r.id.slice(0, 8)}`,
        description: `Payment was manually edited — Reason: ${r.adjustment_reason}`,
        amount: parseFloat(r.amount),
        customerId: r.customer_id,
        metadata: { reason: r.adjustment_reason },
      });
      newCount++;
    }

    // Scan 3: All reversal entries not yet flagged
    const reversals = await db.execute(sql.raw(`
      SELECT p.id, p.amount::numeric, p.payment_number, p.customer_id,
             p.reversal_reason, p.reversal_of_payment_id, p.payment_date::text
      FROM payments p
      WHERE p.is_reversal = true
        AND p.is_deleted = false
        AND NOT EXISTS (
          SELECT 1 FROM financial_exceptions fe
          WHERE fe.type = 'payment_reversal'
            AND fe.entity_id = p.id
            AND fe.status = 'open'
        )
      LIMIT 500
    `)) as any[];

    for (const r of reversals as any[]) {
      await flagException({
        type: "payment_reversal",
        severity: "warning",
        entityType: "payment",
        entityId: r.id,
        entityLabel: r.payment_number ? `#${r.payment_number}` : `Payment ${r.id.slice(0, 8)}`,
        description: `Reversal entry — $${Math.abs(parseFloat(r.amount)).toFixed(2)} ${r.reversal_reason ? `— Reason: ${r.reversal_reason}` : ""}`,
        amount: Math.abs(parseFloat(r.amount)),
        customerId: r.customer_id,
        metadata: { originalPaymentId: r.reversal_of_payment_id, reason: r.reversal_reason },
      });
      newCount++;
    }

    // Scan 4: Potential duplicate payments
    const dupes = await db.execute(sql.raw(`
      SELECT p1.id, p1.amount::numeric, p1.payment_number,
             p1.customer_id, p1.payment_date::text, p1.payment_method,
             p2.payment_number AS original_number
      FROM payments p1
      JOIN payments p2
        ON p1.customer_id = p2.customer_id
        AND p1.id != p2.id
        AND p1.id > p2.id
        AND ABS(p1.amount - p2.amount) < (p1.amount * 0.01)
        AND ABS(EXTRACT(EPOCH FROM (p1.payment_date::date - p2.payment_date::date))) < 172800
      WHERE p1.is_deleted = false AND p2.is_deleted = false
        AND p1.is_reversal = false AND p2.is_reversal = false
        AND p1.status = 'completed' AND p2.status = 'completed'
        AND NOT EXISTS (
          SELECT 1 FROM financial_exceptions fe
          WHERE fe.type = 'duplicate_payment'
            AND fe.entity_id = p1.id
            AND fe.status = 'open'
        )
      LIMIT 200
    `)) as any[];

    for (const r of dupes as any[]) {
      await flagException({
        type: "duplicate_payment",
        severity: "error",
        entityType: "payment",
        entityId: r.id,
        entityLabel: r.payment_number ? `#${r.payment_number}` : `Payment ${r.id.slice(0, 8)}`,
        description: `Possible duplicate of #${r.original_number ?? "unknown"} — same customer, amount $${parseFloat(r.amount).toFixed(2)}, within 48 hours`,
        amount: parseFloat(r.amount),
        customerId: r.customer_id,
        metadata: { originalNumber: r.original_number, paymentDate: r.payment_date },
      });
      newCount++;
    }

    // Scan 5: Stale manual/offline payments unapplied > 7 days
    const stale = await db.execute(sql.raw(`
      SELECT p.id, p.amount::numeric, p.payment_number, p.customer_id,
             p.payment_method, p.payment_date::text, p.check_number
      FROM payments p
      WHERE p.payment_method IN ('check', 'wire', 'ach_manual', 'cash', 'other')
        AND p.status = 'completed'
        AND p.is_deleted = false
        AND p.is_reversal = false
        AND COALESCE(p.applied_amount, 0) = 0
        AND p.payment_date < NOW() - INTERVAL '7 days'
        AND NOT EXISTS (
          SELECT 1 FROM financial_exceptions fe
          WHERE fe.type = 'manual_payment'
            AND fe.entity_id = p.id
            AND fe.status = 'open'
        )
      LIMIT 300
    `)) as any[];

    for (const r of stale as any[]) {
      await flagException({
        type: "manual_payment",
        severity: "warning",
        entityType: "payment",
        entityId: r.id,
        entityLabel: r.check_number ? `Check #${r.check_number}` : r.payment_number ? `#${r.payment_number}` : `Payment ${r.id.slice(0, 8)}`,
        description: `Manual ${r.payment_method.toUpperCase()} payment of $${parseFloat(r.amount).toFixed(2)} from ${r.payment_date} has not been applied to any invoice (>7 days old)`,
        amount: parseFloat(r.amount),
        customerId: r.customer_id,
        metadata: { paymentMethod: r.payment_method, paymentDate: r.payment_date },
      });
      newCount++;
    }

    console.log(`[ExceptionEngine] Full scan completed — ${newCount} new exceptions flagged`);
  } catch (err) {
    console.error("[ExceptionEngine] runFullExceptionScan error:", err);
  }

  return newCount;
}
