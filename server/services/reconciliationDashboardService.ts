import { db } from "../db";
import { sql } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReconSummary {
  totalInvoices: number;
  totalInvoiceAmount: number;
  totalPaid: number;
  totalCreditApplied: number;
  openAR: number;
  totalPayments: number;
  totalPaymentAmount: number;
  totalApplied: number;
  totalUnapplied: number;
  totalDeposited: number;
  totalUndeposited: number;
  depositBatches: number;
  variance: number;
  exceptionsCount: number;
  asOf: string;
}

export interface InvoiceReconRow {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string | null;
  customerName: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  creditApplied: number;
  storedBalanceDue: number;
  computedBalance: number;
  balanceMismatch: boolean;
  isOverpaid: boolean;
  applicationCount: number;
}

export interface PaymentReconRow {
  paymentId: string;
  customerId: string;
  customerName: string;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  status: string;
  appliedAmount: number;
  unappliedAmount: number;
  depositBatchId: string | null;
  depositBatchStatus: string | null;
  applicationCount: number;
  isUnlinked: boolean;
  isUndeposited: boolean;
  checkNumber: string | null;
  referenceNumber: string | null;
}

export interface DepositReconRow {
  batchId: string;
  batchName: string;
  depositDate: string | null;
  status: string;
  totalAmount: number;
  paymentCount: number;
  paymentSum: number;
  variance: number;
  hasVariance: boolean;
  bankAccountName: string | null;
  depositMethod: string | null;
}

export interface ReconciliationException {
  id: string;
  type:
    | "unlinked_payment"
    | "invoice_balance_mismatch"
    | "invoice_overpaid"
    | "undeposited_payment"
    | "batch_sum_mismatch"
    | "failed_payment_on_invoice";
  severity: "error" | "warning";
  entityType: "payment" | "invoice" | "deposit_batch";
  entityId: string;
  entityLabel: string;
  description: string;
  amount: number | null;
  customerId: string | null;
  customerName: string | null;
  createdAt: string | null;
  actionable: boolean;
  actions: string[];
}

export interface ReconFilters {
  customerId?: string;
  asOf?: string;
  limit?: number;
  offset?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function n(v: unknown): number {
  const parsed = parseFloat(String(v ?? "0"));
  return isNaN(parsed) ? 0 : parsed;
}

function trim(v: unknown): number {
  return Math.round(n(v) * 100) / 100;
}

function TOLERANCE(a: number, b: number) {
  return Math.abs(a - b) > 0.01;
}

// ─── Summary ──────────────────────────────────────────────────────────────────

export async function getReconSummary(filters: ReconFilters = {}): Promise<ReconSummary> {
  const cutoff = filters.asOf ? `'${filters.asOf}'::date` : "CURRENT_DATE";
  const custClause = filters.customerId ? `AND i.customer_id = '${filters.customerId}'` : "";
  const custClauseP = filters.customerId ? `AND p.customer_id = '${filters.customerId}'` : "";

  const [invRow] = await db.execute(sql.raw(`
    SELECT
      COUNT(*)::int                                   AS total_invoices,
      COALESCE(SUM(i.total_amount), 0)::numeric       AS total_invoice_amount,
      COALESCE(SUM(i.paid_amount), 0)::numeric        AS total_paid,
      COALESCE(SUM(COALESCE(i.credit_applied, 0)), 0)::numeric AS total_credit,
      COALESCE(SUM(GREATEST(i.total_amount - COALESCE(i.paid_amount,0) - COALESCE(i.credit_applied,0), 0)), 0)::numeric AS open_ar
    FROM invoices i
    WHERE i.status NOT IN ('cancelled','voided','written_off','draft')
      AND i.invoice_date <= ${cutoff}
      ${custClause}
  `)) as any;

  const [payRow] = await db.execute(sql.raw(`
    SELECT
      COUNT(*)::int                                           AS total_payments,
      COALESCE(SUM(p.amount), 0)::numeric                    AS total_payment_amount,
      COALESCE(SUM(COALESCE(p.applied_amount, 0)), 0)::numeric AS total_applied,
      COALESCE(SUM(GREATEST(p.amount - COALESCE(p.applied_amount, 0), 0)), 0)::numeric AS total_unapplied,
      COALESCE(SUM(CASE WHEN p.deposit_batch_id IS NOT NULL THEN p.amount ELSE 0 END), 0)::numeric AS total_deposited,
      COALESCE(SUM(CASE WHEN p.deposit_batch_id IS NULL    THEN p.amount ELSE 0 END), 0)::numeric AS total_undeposited
    FROM payments p
    WHERE p.status = 'completed'
      AND p.is_deleted = false
      AND p.payment_date <= ${cutoff}
      ${custClauseP}
  `)) as any;

  const [batchRow] = await db.execute(sql.raw(`
    SELECT COUNT(*)::int AS deposit_batches
    FROM deposit_batches
    WHERE status NOT IN ('cancelled','voided')
  `)) as any;

  const [excRow] = await db.execute(sql.raw(`
    SELECT
      (
        -- unlinked completed payments
        (SELECT COUNT(*) FROM payments p
         WHERE p.status='completed' AND p.is_deleted=false
           AND COALESCE(p.applied_amount,0) < p.amount ${custClauseP})
        +
        -- overpaid invoices
        (SELECT COUNT(*) FROM invoices i
         WHERE COALESCE(i.paid_amount,0) > i.total_amount
           AND i.status NOT IN ('cancelled','voided','written_off') ${custClause})
        +
        -- balance mismatches
        (SELECT COUNT(*) FROM invoices i
         WHERE ABS((i.total_amount - COALESCE(i.paid_amount,0) - COALESCE(i.credit_applied,0)) - COALESCE(i.balance_due, i.total_amount - COALESCE(i.paid_amount,0))) > 0.01
           AND i.status NOT IN ('cancelled','voided','written_off','draft') ${custClause})
        +
        -- batch sum mismatches
        (SELECT COUNT(*) FROM deposit_batches db2
         WHERE db2.status NOT IN ('cancelled','voided')
           AND ABS(db2.total_amount - COALESCE((SELECT SUM(p2.amount) FROM payments p2 WHERE p2.deposit_batch_id=db2.id AND p2.is_deleted=false),0)) > 0.01)
        +
        -- payment reversals
        (SELECT COUNT(*) FROM payments p
         WHERE p.is_reversal=true AND p.is_deleted=false ${custClauseP})
        +
        -- edited payments
        (SELECT COUNT(*) FROM payments p
         WHERE p.adjustment_reason IS NOT NULL AND p.is_reversal=false AND p.is_deleted=false ${custClauseP})
        +
        -- potential duplicate payments
        (SELECT COUNT(*) FROM payments p1
         WHERE p1.is_deleted=false AND p1.is_reversal=false AND p1.status='completed'
           AND EXISTS (
             SELECT 1 FROM payments p2
             WHERE p2.customer_id=p1.customer_id AND p2.id != p1.id AND p2.id < p1.id
               AND ABS(p2.amount - p1.amount) < (p1.amount * 0.01)
               AND ABS(EXTRACT(EPOCH FROM (p1.payment_date::date - p2.payment_date::date))) < 172800
               AND p2.is_deleted=false AND p2.is_reversal=false AND p2.status='completed'
           )
           ${filters.customerId ? `AND p1.customer_id = '${filters.customerId}'` : ""})
        +
        -- stale manual unmatched payments
        (SELECT COUNT(*) FROM payments p
         WHERE p.payment_method IN ('check','wire','ach_manual','cash','other')
           AND p.status='completed' AND p.is_deleted=false AND p.is_reversal=false
           AND COALESCE(p.applied_amount,0)=0
           AND p.payment_date < NOW() - INTERVAL '7 days'
           ${custClauseP})
      )::int AS exceptions_count
  `)) as any;

  const row = invRow as any;
  const prow = payRow as any;
  const brow = batchRow as any;
  const erow = excRow as any;

  const openAR = n(row?.open_ar);
  const totalUnapplied = n(prow?.total_unapplied);
  const variance = trim(openAR - totalUnapplied);

  return {
    totalInvoices: n(row?.total_invoices),
    totalInvoiceAmount: n(row?.total_invoice_amount),
    totalPaid: n(row?.total_paid),
    totalCreditApplied: n(row?.total_credit),
    openAR,
    totalPayments: n(prow?.total_payments),
    totalPaymentAmount: n(prow?.total_payment_amount),
    totalApplied: n(prow?.total_applied),
    totalUnapplied,
    totalDeposited: n(prow?.total_deposited),
    totalUndeposited: n(prow?.total_undeposited),
    depositBatches: n(brow?.deposit_batches),
    variance,
    exceptionsCount: n(erow?.exceptions_count),
    asOf: filters.asOf ?? new Date().toISOString().split("T")[0],
  };
}

// ─── Invoice Reconciliation ───────────────────────────────────────────────────

export async function getInvoiceReconciliation(
  filters: ReconFilters = {}
): Promise<{ rows: InvoiceReconRow[]; total: number }> {
  const custClause = filters.customerId ? `AND i.customer_id = '${filters.customerId}'` : "";
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;

  const rows = await db.execute(sql.raw(`
    SELECT
      i.id                                                      AS invoice_id,
      i.invoice_number,
      i.customer_id,
      i.customer_name,
      i.invoice_date::text,
      i.due_date::text,
      i.status,
      i.total_amount::numeric,
      COALESCE(i.paid_amount,0)::numeric                        AS paid_amount,
      COALESCE(i.credit_applied,0)::numeric                     AS credit_applied,
      COALESCE(i.balance_due, i.total_amount - COALESCE(i.paid_amount,0))::numeric AS stored_balance_due,
      (i.total_amount - COALESCE(i.paid_amount,0) - COALESCE(i.credit_applied,0))::numeric AS computed_balance,
      ABS((i.total_amount - COALESCE(i.paid_amount,0) - COALESCE(i.credit_applied,0))
          - COALESCE(i.balance_due, i.total_amount - COALESCE(i.paid_amount,0))) > 0.01 AS balance_mismatch,
      COALESCE(i.paid_amount,0) > i.total_amount                AS is_overpaid,
      COUNT(pa.id)::int                                          AS application_count
    FROM invoices i
    LEFT JOIN payment_applications pa ON pa.invoice_id = i.id
    WHERE i.status NOT IN ('cancelled','voided','written_off','draft')
      ${custClause}
    GROUP BY i.id
    ORDER BY
      (ABS((i.total_amount - COALESCE(i.paid_amount,0) - COALESCE(i.credit_applied,0))
           - COALESCE(i.balance_due, i.total_amount - COALESCE(i.paid_amount,0))) > 0.01) DESC,
      (COALESCE(i.paid_amount,0) > i.total_amount) DESC,
      i.invoice_date DESC
    LIMIT ${limit} OFFSET ${offset}
  `)) as any;

  const [countRow] = await db.execute(sql.raw(`
    SELECT COUNT(*)::int AS total
    FROM invoices i
    WHERE i.status NOT IN ('cancelled','voided','written_off','draft')
      ${custClause}
  `)) as any;

  return {
    rows: (rows as any[]).map((r) => ({
      invoiceId: r.invoice_id,
      invoiceNumber: r.invoice_number,
      customerId: r.customer_id,
      customerName: r.customer_name,
      invoiceDate: r.invoice_date,
      dueDate: r.due_date,
      status: r.status,
      totalAmount: n(r.total_amount),
      paidAmount: n(r.paid_amount),
      creditApplied: n(r.credit_applied),
      storedBalanceDue: n(r.stored_balance_due),
      computedBalance: n(r.computed_balance),
      balanceMismatch: !!r.balance_mismatch,
      isOverpaid: !!r.is_overpaid,
      applicationCount: n(r.application_count),
    })),
    total: n((countRow as any)?.total),
  };
}

// ─── Payment Reconciliation ───────────────────────────────────────────────────

export async function getPaymentReconciliation(
  filters: ReconFilters = {}
): Promise<{ rows: PaymentReconRow[]; total: number }> {
  const custClause = filters.customerId ? `AND p.customer_id = '${filters.customerId}'` : "";
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;

  const rows = await db.execute(sql.raw(`
    SELECT
      p.id                                                       AS payment_id,
      p.customer_id,
      COALESCE(c.name, p.customer_id)                           AS customer_name,
      p.payment_date::text,
      p.amount::numeric,
      p.payment_method,
      p.status,
      COALESCE(p.applied_amount, 0)::numeric                    AS applied_amount,
      GREATEST(p.amount - COALESCE(p.applied_amount, 0), 0)::numeric AS unapplied_amount,
      p.deposit_batch_id,
      db.status                                                  AS deposit_batch_status,
      COUNT(pa.id)::int                                          AS application_count,
      (COALESCE(p.applied_amount, 0) < p.amount)                AS is_unlinked,
      (p.deposit_batch_id IS NULL)                               AS is_undeposited,
      p.check_number,
      p.reference_number
    FROM payments p
    LEFT JOIN customers c ON c.id = p.customer_id
    LEFT JOIN deposit_batches db ON db.id = p.deposit_batch_id
    LEFT JOIN payment_applications pa ON pa.payment_id = p.id
    WHERE p.status = 'completed'
      AND p.is_deleted = false
      ${custClause}
    GROUP BY p.id, c.name, db.status
    ORDER BY
      (COALESCE(p.applied_amount, 0) < p.amount) DESC,
      (p.deposit_batch_id IS NULL) DESC,
      p.payment_date DESC
    LIMIT ${limit} OFFSET ${offset}
  `)) as any;

  const [countRow] = await db.execute(sql.raw(`
    SELECT COUNT(*)::int AS total
    FROM payments p
    WHERE p.status = 'completed'
      AND p.is_deleted = false
      ${custClause}
  `)) as any;

  return {
    rows: (rows as any[]).map((r) => ({
      paymentId: r.payment_id,
      customerId: r.customer_id,
      customerName: r.customer_name,
      paymentDate: r.payment_date,
      amount: n(r.amount),
      paymentMethod: r.payment_method,
      status: r.status,
      appliedAmount: n(r.applied_amount),
      unappliedAmount: n(r.unapplied_amount),
      depositBatchId: r.deposit_batch_id ?? null,
      depositBatchStatus: r.deposit_batch_status ?? null,
      applicationCount: n(r.application_count),
      isUnlinked: !!r.is_unlinked,
      isUndeposited: !!r.is_undeposited,
      checkNumber: r.check_number ?? null,
      referenceNumber: r.reference_number ?? null,
    })),
    total: n((countRow as any)?.total),
  };
}

// ─── Deposit Reconciliation ───────────────────────────────────────────────────

export async function getDepositReconciliation(
  filters: ReconFilters = {}
): Promise<{ rows: DepositReconRow[]; total: number }> {
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;

  const rows = await db.execute(sql.raw(`
    SELECT
      db.id                                                      AS batch_id,
      COALESCE(db.batch_name, db.id)                            AS batch_name,
      db.deposit_date::text,
      db.status,
      db.total_amount::numeric,
      COUNT(p.id)::int                                           AS payment_count,
      COALESCE(SUM(p.amount), 0)::numeric                       AS payment_sum,
      (db.total_amount - COALESCE(SUM(p.amount), 0))::numeric   AS variance,
      ABS(db.total_amount - COALESCE(SUM(p.amount), 0)) > 0.01  AS has_variance,
      db.bank_account_name,
      db.deposit_method
    FROM deposit_batches db
    LEFT JOIN payments p ON p.deposit_batch_id = db.id AND p.is_deleted = false
    WHERE db.status NOT IN ('cancelled','voided')
    GROUP BY db.id
    ORDER BY
      (ABS(db.total_amount - COALESCE(SUM(p.amount), 0)) > 0.01) DESC,
      db.deposit_date DESC NULLS LAST
    LIMIT ${limit} OFFSET ${offset}
  `)) as any;

  const [countRow] = await db.execute(sql.raw(`
    SELECT COUNT(*)::int AS total
    FROM deposit_batches
    WHERE status NOT IN ('cancelled','voided')
  `)) as any;

  return {
    rows: (rows as any[]).map((r) => ({
      batchId: r.batch_id,
      batchName: r.batch_name,
      depositDate: r.deposit_date ?? null,
      status: r.status,
      totalAmount: n(r.total_amount),
      paymentCount: n(r.payment_count),
      paymentSum: n(r.payment_sum),
      variance: n(r.variance),
      hasVariance: !!r.has_variance,
      bankAccountName: r.bank_account_name ?? null,
      depositMethod: r.deposit_method ?? null,
    })),
    total: n((countRow as any)?.total),
  };
}

// ─── Exceptions ───────────────────────────────────────────────────────────────

export async function getReconciliationExceptions(
  filters: ReconFilters = {}
): Promise<{ exceptions: ReconciliationException[]; total: number }> {
  const custClause = filters.customerId ? `AND p.customer_id = '${filters.customerId}'` : "";
  const custClauseI = filters.customerId ? `AND i.customer_id = '${filters.customerId}'` : "";

  const exceptions: ReconciliationException[] = [];

  // 1. Unlinked payments (completed, unapplied funds)
  const unlinkedPayments = await db.execute(sql.raw(`
    SELECT p.id, p.amount, COALESCE(p.applied_amount,0) AS applied_amount,
           p.customer_id, COALESCE(c.name, p.customer_id) AS customer_name,
           p.payment_date::text, p.payment_method, p.check_number, p.reference_number
    FROM payments p
    LEFT JOIN customers c ON c.id = p.customer_id
    WHERE p.status = 'completed'
      AND p.is_deleted = false
      AND COALESCE(p.applied_amount, 0) < p.amount
      ${custClause}
    ORDER BY p.payment_date DESC
    LIMIT 200
  `)) as any;

  for (const r of unlinkedPayments as any[]) {
    const unapplied = trim(n(r.amount) - n(r.applied_amount));
    exceptions.push({
      id: `unlinked_payment:${r.id}`,
      type: "unlinked_payment",
      severity: "warning",
      entityType: "payment",
      entityId: r.id,
      entityLabel: r.check_number
        ? `Check #${r.check_number}`
        : r.reference_number
        ? `Ref: ${r.reference_number}`
        : `Payment ${r.id.slice(0, 8)}`,
      description: `$${unapplied.toFixed(2)} unapplied — ${r.payment_method} payment from ${r.payment_date ?? "unknown date"}`,
      amount: unapplied,
      customerId: r.customer_id,
      customerName: r.customer_name,
      createdAt: r.payment_date,
      actionable: true,
      actions: ["assign_to_invoice", "mark_resolved"],
    });
  }

  // 2. Overpaid invoices
  const overpaid = await db.execute(sql.raw(`
    SELECT i.id, i.invoice_number, i.customer_id, i.customer_name,
           i.total_amount::numeric, COALESCE(i.paid_amount,0)::numeric AS paid_amount,
           i.invoice_date::text
    FROM invoices i
    WHERE COALESCE(i.paid_amount,0) > i.total_amount
      AND i.status NOT IN ('cancelled','voided','written_off')
      ${custClauseI}
    ORDER BY i.invoice_date DESC
    LIMIT 100
  `)) as any;

  for (const r of overpaid as any[]) {
    const excess = trim(n(r.paid_amount) - n(r.total_amount));
    exceptions.push({
      id: `invoice_overpaid:${r.id}`,
      type: "invoice_overpaid",
      severity: "error",
      entityType: "invoice",
      entityId: r.id,
      entityLabel: `Invoice #${r.invoice_number}`,
      description: `Overpaid by $${excess.toFixed(2)} — total $${n(r.total_amount).toFixed(2)}, paid $${n(r.paid_amount).toFixed(2)}`,
      amount: excess,
      customerId: r.customer_id,
      customerName: r.customer_name,
      createdAt: r.invoice_date,
      actionable: true,
      actions: ["issue_credit", "adjust_invoice", "mark_resolved"],
    });
  }

  // 3. Balance mismatches
  const mismatches = await db.execute(sql.raw(`
    SELECT i.id, i.invoice_number, i.customer_id, i.customer_name,
           i.total_amount::numeric,
           COALESCE(i.paid_amount,0)::numeric AS paid_amount,
           COALESCE(i.credit_applied,0)::numeric AS credit_applied,
           COALESCE(i.balance_due, i.total_amount - COALESCE(i.paid_amount,0))::numeric AS stored_balance,
           (i.total_amount - COALESCE(i.paid_amount,0) - COALESCE(i.credit_applied,0))::numeric AS computed_balance,
           i.invoice_date::text
    FROM invoices i
    WHERE ABS(
      (i.total_amount - COALESCE(i.paid_amount,0) - COALESCE(i.credit_applied,0))
      - COALESCE(i.balance_due, i.total_amount - COALESCE(i.paid_amount,0))
    ) > 0.01
      AND i.status NOT IN ('cancelled','voided','written_off','draft')
      ${custClauseI}
    ORDER BY i.invoice_date DESC
    LIMIT 100
  `)) as any;

  for (const r of mismatches as any[]) {
    const diff = trim(n(r.computed_balance) - n(r.stored_balance));
    exceptions.push({
      id: `invoice_balance_mismatch:${r.id}`,
      type: "invoice_balance_mismatch",
      severity: "error",
      entityType: "invoice",
      entityId: r.id,
      entityLabel: `Invoice #${r.invoice_number}`,
      description: `Balance mismatch: stored $${n(r.stored_balance).toFixed(2)} vs computed $${n(r.computed_balance).toFixed(2)} (diff $${diff.toFixed(2)})`,
      amount: diff,
      customerId: r.customer_id,
      customerName: r.customer_name,
      createdAt: r.invoice_date,
      actionable: true,
      actions: ["recalculate_balance", "mark_resolved"],
    });
  }

  // 4. Undeposited completed payments
  const undeposited = await db.execute(sql.raw(`
    SELECT p.id, p.amount::numeric, p.customer_id,
           COALESCE(c.name, p.customer_id) AS customer_name,
           p.payment_date::text, p.payment_method, p.check_number
    FROM payments p
    LEFT JOIN customers c ON c.id = p.customer_id
    WHERE p.status = 'completed'
      AND p.is_deleted = false
      AND p.deposit_batch_id IS NULL
      ${custClause}
    ORDER BY p.payment_date DESC
    LIMIT 200
  `)) as any;

  for (const r of undeposited as any[]) {
    exceptions.push({
      id: `undeposited_payment:${r.id}`,
      type: "undeposited_payment",
      severity: "warning",
      entityType: "payment",
      entityId: r.id,
      entityLabel: r.check_number
        ? `Check #${r.check_number}`
        : `Payment ${r.id.slice(0, 8)}`,
      description: `$${n(r.amount).toFixed(2)} ${r.payment_method} payment from ${r.payment_date} has not been assigned to a deposit batch`,
      amount: n(r.amount),
      customerId: r.customer_id,
      customerName: r.customer_name,
      createdAt: r.payment_date,
      actionable: true,
      actions: ["assign_to_batch", "mark_resolved"],
    });
  }

  // 5. Batch sum mismatches
  const batchMismatches = await db.execute(sql.raw(`
    SELECT db.id, COALESCE(db.batch_name, db.id) AS batch_name,
           db.total_amount::numeric,
           COALESCE(SUM(p.amount), 0)::numeric AS payment_sum,
           db.deposit_date::text
    FROM deposit_batches db
    LEFT JOIN payments p ON p.deposit_batch_id = db.id AND p.is_deleted = false
    WHERE db.status NOT IN ('cancelled','voided')
    GROUP BY db.id
    HAVING ABS(db.total_amount - COALESCE(SUM(p.amount), 0)) > 0.01
    ORDER BY db.deposit_date DESC NULLS LAST
    LIMIT 100
  `)) as any;

  for (const r of batchMismatches as any[]) {
    const diff = trim(n(r.total_amount) - n(r.payment_sum));
    exceptions.push({
      id: `batch_sum_mismatch:${r.id}`,
      type: "batch_sum_mismatch",
      severity: "error",
      entityType: "deposit_batch",
      entityId: r.id,
      entityLabel: r.batch_name,
      description: `Batch total $${n(r.total_amount).toFixed(2)} vs actual payment sum $${n(r.payment_sum).toFixed(2)} (gap $${Math.abs(diff).toFixed(2)})`,
      amount: diff,
      customerId: null,
      customerName: null,
      createdAt: r.deposit_date,
      actionable: true,
      actions: ["view_batch", "mark_resolved"],
    });
  }

  // 6. Payment reversals (reversal entries created by controller actions)
  const reversals = await db.execute(sql.raw(`
    SELECT p.id, p.amount::numeric, p.payment_number,
           p.customer_id, COALESCE(c.name, p.customer_id) AS customer_name,
           p.payment_date::text, p.payment_method,
           p.reversal_reason, p.reversed_at::text,
           p.reversal_of_payment_id
    FROM payments p
    LEFT JOIN customers c ON c.id = p.customer_id
    WHERE p.is_reversal = true
      AND p.is_deleted = false
      ${custClause}
    ORDER BY p.payment_date DESC
    LIMIT 100
  `)) as any;

  for (const r of reversals as any[]) {
    exceptions.push({
      id: `payment_reversal:${r.id}`,
      type: "payment_reversal",
      severity: "warning",
      entityType: "payment",
      entityId: r.id,
      entityLabel: r.payment_number ? `#${r.payment_number}` : `Payment ${r.id.slice(0, 8)}`,
      description: `Reversal entry for ${r.payment_method} payment — ${r.reversal_reason ? `Reason: ${r.reversal_reason}` : "no reason recorded"}`,
      amount: n(r.amount),
      customerId: r.customer_id,
      customerName: r.customer_name,
      createdAt: r.payment_date,
      actionable: true,
      actions: ["view_original_payment", "mark_resolved"],
    });
  }

  // 7. Edited payments (adjustment reason set by controller)
  const editedPayments = await db.execute(sql.raw(`
    SELECT p.id, p.amount::numeric, p.payment_number,
           p.customer_id, COALESCE(c.name, p.customer_id) AS customer_name,
           p.payment_date::text, p.payment_method,
           p.adjustment_reason
    FROM payments p
    LEFT JOIN customers c ON c.id = p.customer_id
    WHERE p.adjustment_reason IS NOT NULL
      AND p.is_reversal = false
      AND p.is_deleted = false
      ${custClause}
    ORDER BY p.payment_date DESC
    LIMIT 100
  `)) as any;

  for (const r of editedPayments as any[]) {
    exceptions.push({
      id: `payment_edited:${r.id}`,
      type: "payment_edited",
      severity: "warning",
      entityType: "payment",
      entityId: r.id,
      entityLabel: r.payment_number ? `#${r.payment_number}` : `Payment ${r.id.slice(0, 8)}`,
      description: `Payment was manually edited — Reason: ${r.adjustment_reason}`,
      amount: n(r.amount),
      customerId: r.customer_id,
      customerName: r.customer_name,
      createdAt: r.payment_date,
      actionable: true,
      actions: ["view_payment", "mark_resolved"],
    });
  }

  // 8. Potential duplicate payments (same customer, same amount ±1%, within 2 days)
  const dupes = await db.execute(sql.raw(`
    SELECT p1.id, p1.amount::numeric, p1.payment_number,
           p1.customer_id, COALESCE(c.name, p1.customer_id) AS customer_name,
           p1.payment_date::text, p1.payment_method,
           p2.payment_number AS original_number,
           p2.payment_date::text AS original_date
    FROM payments p1
    JOIN payments p2
      ON p1.customer_id = p2.customer_id
      AND p1.id != p2.id
      AND p1.id > p2.id
      AND ABS(p1.amount - p2.amount) < (p1.amount * 0.01)
      AND ABS(EXTRACT(EPOCH FROM (p1.payment_date::date - p2.payment_date::date))) < 172800
    LEFT JOIN customers c ON c.id = p1.customer_id
    WHERE p1.is_deleted = false AND p2.is_deleted = false
      AND p1.is_reversal = false AND p2.is_reversal = false
      AND p1.status = 'completed' AND p2.status = 'completed'
      ${filters.customerId ? `AND p1.customer_id = '${filters.customerId}'` : ""}
    ORDER BY p1.payment_date DESC
    LIMIT 50
  `)) as any;

  for (const r of dupes as any[]) {
    exceptions.push({
      id: `duplicate_payment:${r.id}`,
      type: "duplicate_payment",
      severity: "error",
      entityType: "payment",
      entityId: r.id,
      entityLabel: r.payment_number ? `#${r.payment_number}` : `Payment ${r.id.slice(0, 8)}`,
      description: `Possible duplicate of #${r.original_number ?? "unknown"} from ${r.original_date} — same customer, same amount ($${n(r.amount).toFixed(2)}), within 48 hours`,
      amount: n(r.amount),
      customerId: r.customer_id,
      customerName: r.customer_name,
      createdAt: r.payment_date,
      actionable: true,
      actions: ["view_payment", "mark_resolved"],
    });
  }

  // 9. Stale manual payments (offline methods unapplied for more than 7 days)
  const staleManual = await db.execute(sql.raw(`
    SELECT p.id, p.amount::numeric, p.payment_number,
           p.customer_id, COALESCE(c.name, p.customer_id) AS customer_name,
           p.payment_date::text, p.payment_method,
           p.check_number, p.reference_number,
           COALESCE(p.applied_amount, 0)::numeric AS applied_amount
    FROM payments p
    LEFT JOIN customers c ON c.id = p.customer_id
    WHERE p.payment_method IN ('check', 'wire', 'ach_manual', 'cash', 'other')
      AND p.status = 'completed'
      AND p.is_deleted = false
      AND p.is_reversal = false
      AND COALESCE(p.applied_amount, 0) = 0
      AND p.payment_date < NOW() - INTERVAL '7 days'
      ${custClause}
    ORDER BY p.payment_date ASC
    LIMIT 100
  `)) as any;

  for (const r of staleManual as any[]) {
    const label = r.check_number
      ? `Check #${r.check_number}`
      : r.payment_number
      ? `#${r.payment_number}`
      : `Payment ${r.id.slice(0, 8)}`;
    exceptions.push({
      id: `manual_payment_unmatched:${r.id}`,
      type: "manual_payment_unmatched",
      severity: "warning",
      entityType: "payment",
      entityId: r.id,
      entityLabel: label,
      description: `${r.payment_method.toUpperCase()} payment of $${n(r.amount).toFixed(2)} received ${r.payment_date} has not been applied to any invoice for over 7 days`,
      amount: n(r.amount),
      customerId: r.customer_id,
      customerName: r.customer_name,
      createdAt: r.payment_date,
      actionable: true,
      actions: ["assign_to_invoice", "assign_to_batch", "mark_resolved"],
    });
  }

  // Sort: errors first, then by amount descending
  exceptions.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
    return (b.amount ?? 0) - (a.amount ?? 0);
  });

  return { exceptions, total: exceptions.length };
}
