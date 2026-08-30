import { db } from "../db";
import { invoices, payments, paymentApplications, depositBatches, reconciliationRuns } from "@shared/schema";
import { sql, eq, and, or, not, inArray } from "drizzle-orm";

export interface ReconciliationResult {
  status: "balanced" | "discrepancy";
  totalOutstandingCalc: number;
  totalOutstandingDashboard: number;
  totalPaymentsApplied: number;
  totalPaymentsLedger: number;
  depositBatchesBalanced: boolean;
  discrepancies: ReconciliationDiscrepancy[];
  executionTimeMs: number;
}

interface ReconciliationDiscrepancy {
  type: string;
  expected: number;
  actual: number;
  difference: number;
  details?: string;
}

export async function runReconciliation(triggeredBy: string = "scheduler"): Promise<ReconciliationResult> {
  const startTime = Date.now();
  const discrepancies: ReconciliationDiscrepancy[] = [];

  const balanceDueResult = await db.select({
    total: sql<string>`COALESCE(SUM(CAST(COALESCE(balance_due, total_amount) AS numeric)), 0)`
  }).from(invoices).where(
    not(inArray(invoices.status, ['paid', 'void', 'written_off', 'draft']))
  );
  const totalOutstandingCalc = parseFloat(balanceDueResult[0]?.total || '0');

  const derivedResult = await db.select({
    total: sql<string>`COALESCE(SUM(CAST(total_amount AS numeric) - CAST(COALESCE(paid_amount, '0') AS numeric)), 0)`
  }).from(invoices).where(
    not(inArray(invoices.status, ['paid', 'void', 'written_off', 'draft']))
  );
  const totalOutstandingDashboard = parseFloat(derivedResult[0]?.total || '0');

  if (Math.abs(totalOutstandingCalc - totalOutstandingDashboard) > 0.01) {
    discrepancies.push({
      type: "outstanding_balance_drift",
      expected: totalOutstandingDashboard,
      actual: totalOutstandingCalc,
      difference: totalOutstandingCalc - totalOutstandingDashboard,
      details: "Invoice balance_due has drifted from (total_amount - paid_amount). This indicates a data integrity issue where balance_due was not updated correctly after a payment."
    });
  }

  const appliedResult = await db.select({
    total: sql<string>`COALESCE(SUM(CAST(amount AS numeric)), 0)`
  }).from(paymentApplications);
  const totalPaymentsApplied = parseFloat(appliedResult[0]?.total || '0');

  const ledgerResult = await db.select({
    total: sql<string>`COALESCE(SUM(CAST(applied_amount AS numeric)), 0)`
  }).from(payments).where(eq(payments.status, 'completed'));
  const totalPaymentsLedger = parseFloat(ledgerResult[0]?.total || '0');

  if (Math.abs(totalPaymentsApplied - totalPaymentsLedger) > 0.01) {
    discrepancies.push({
      type: "payment_applied_mismatch",
      expected: totalPaymentsLedger,
      actual: totalPaymentsApplied,
      difference: totalPaymentsLedger - totalPaymentsApplied,
      details: "Sum of payment_applications does not match completed payments applied_amount"
    });
  }

  let depositBatchesBalanced = true;
  const batchResults = await db.select({
    batchId: depositBatches.id,
    batchTotal: depositBatches.totalAmount,
    batchStatus: depositBatches.status,
  }).from(depositBatches).where(
    or(eq(depositBatches.status, 'reconciled'), eq(depositBatches.status, 'closed'))
  );

  for (const batch of batchResults) {
    const batchPaymentSum = await db.select({
      total: sql<string>`COALESCE(SUM(CAST(amount AS numeric)), 0)`
    }).from(payments).where(eq(payments.depositBatchId, batch.batchId));
    const paymentTotal = parseFloat(batchPaymentSum[0]?.total || '0');
    const batchExpected = parseFloat(batch.batchTotal || '0');

    if (Math.abs(paymentTotal - batchExpected) > 0.01) {
      depositBatchesBalanced = false;
      discrepancies.push({
        type: "deposit_batch_mismatch",
        expected: batchExpected,
        actual: paymentTotal,
        difference: batchExpected - paymentTotal,
        details: `Deposit batch ${batch.batchId} total does not match sum of payments in batch`
      });
    }
  }

  const invoicePaidAmountsCheck = await db.select({
    invoiceId: invoices.id,
    invoiceNumber: invoices.invoiceNumber,
    paidAmount: invoices.paidAmount,
    appliedTotal: sql<string>`COALESCE((SELECT SUM(CAST(pa.amount AS numeric)) FROM payment_applications pa WHERE pa.invoice_id = invoices.id), 0)`
  }).from(invoices).where(
    not(inArray(invoices.status, ['draft', 'void', 'written_off']))
  );

  for (const inv of invoicePaidAmountsCheck) {
    const paidAmount = parseFloat(inv.paidAmount || '0');
    const appliedTotal = parseFloat(inv.appliedTotal || '0');
    if (Math.abs(paidAmount - appliedTotal) > 0.01) {
      discrepancies.push({
        type: "invoice_paid_amount_mismatch",
        expected: appliedTotal,
        actual: paidAmount,
        difference: appliedTotal - paidAmount,
        details: `Invoice ${inv.invoiceNumber} paid_amount ($${paidAmount.toFixed(2)}) != sum of applications ($${appliedTotal.toFixed(2)})`
      });
    }
  }

  const executionTimeMs = Date.now() - startTime;

  const [run] = await db.insert(reconciliationRuns).values({
    status: discrepancies.length > 0 ? "discrepancy" : "balanced",
    totalOutstandingCalc: totalOutstandingCalc.toFixed(2),
    totalOutstandingDashboard: totalOutstandingDashboard.toFixed(2),
    totalPaymentsApplied: totalPaymentsApplied.toFixed(2),
    totalPaymentsLedger: totalPaymentsLedger.toFixed(2),
    depositBatchesBalanced,
    discrepanciesFound: discrepancies.length,
    discrepancyDetails: discrepancies.length > 0 ? discrepancies : null,
    executionTimeMs,
    triggeredBy,
  }).returning();

  if (discrepancies.length > 0) {
    console.warn(`[Reconciliation] ${discrepancies.length} discrepancies found in run ${run.id}:`, 
      discrepancies.map(d => `${d.type}: expected=${d.expected}, actual=${d.actual}, diff=${d.difference}`));
  } else {
    console.log(`[Reconciliation] Run ${run.id} completed - all balanced (${executionTimeMs}ms)`);
  }

  return {
    status: discrepancies.length > 0 ? "discrepancy" : "balanced",
    totalOutstandingCalc,
    totalOutstandingDashboard,
    totalPaymentsApplied,
    totalPaymentsLedger,
    depositBatchesBalanced,
    discrepancies,
    executionTimeMs,
  };
}
