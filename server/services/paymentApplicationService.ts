import { db } from "../db";
import { invoices, payments, paymentApplications, arLedgerEntries } from "@shared/schema";
import { eq, and, inArray, asc, gt } from "drizzle-orm";

// Invoice statuses that are "open" and eligible for FIFO payment application
const OPEN_INVOICE_STATUSES = [
  "approved",
  "sent",
  "viewed",
  "partially_paid",
  "overdue",
  "payment_processing",
  "disputed",
];

export interface ApplicationResult {
  paymentId: string;
  invoiceId: string;
  invoiceNumber: string;
  appliedAmount: number;
  remainingInvoiceBalance: number;
  invoiceStatus: string;
}

export interface FIFORunResult {
  paymentId: string;
  paymentNumber: string;
  startingUnapplied: number;
  endingUnapplied: number;
  applications: ApplicationResult[];
  skippedReason?: string;
}

/**
 * Open invoices for a customer sorted FIFO (oldest invoice date first, then creation order).
 * Only includes invoices with a positive balance due.
 */
export async function getOpenInvoicesForCustomer(customerId: string) {
  return db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.customerId, customerId),
        inArray(invoices.status, OPEN_INVOICE_STATUSES),
        gt(invoices.balanceDue, "0")
      )
    )
    .orderBy(asc(invoices.invoiceDate), asc(invoices.createdAt));
}

/**
 * Payments for a customer with an unapplied balance > 0, sorted oldest-first.
 */
export async function getUnappliedPaymentsForCustomer(customerId: string) {
  return db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.customerId, customerId),
        inArray(payments.status, ["completed", "processing"]),
        gt(payments.unappliedAmount, "0")
      )
    )
    .orderBy(asc(payments.paymentDate), asc(payments.createdAt));
}

/**
 * Core FIFO engine: apply a single payment's unapplied balance to a customer's
 * oldest open invoices one by one.  Prevents overpayment on every invoice.
 */
export async function autoApplyPaymentFIFO(
  paymentId: string,
  userId: string
): Promise<FIFORunResult> {
  // Load payment snapshot
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
  if (!payment) throw new Error("Payment not found");
  if (!payment.customerId) throw new Error("Payment has no associated customer");

  const startingUnapplied = parseFloat(payment.unappliedAmount || "0");
  const originalApplied = parseFloat(payment.appliedAmount || "0");

  if (startingUnapplied < 0.01) {
    return {
      paymentId,
      paymentNumber: payment.paymentNumber || paymentId,
      startingUnapplied,
      endingUnapplied: startingUnapplied,
      applications: [],
      skippedReason: "No unapplied balance available",
    };
  }

  const openInvoices = await getOpenInvoicesForCustomer(payment.customerId);
  if (openInvoices.length === 0) {
    return {
      paymentId,
      paymentNumber: payment.paymentNumber || paymentId,
      startingUnapplied,
      endingUnapplied: startingUnapplied,
      applications: [],
      skippedReason: "No open invoices to apply payment to",
    };
  }

  const applicationResults: ApplicationResult[] = [];
  // Running total applied during this FIFO execution (starts at 0)
  let appliedThisRun = 0;
  const DEDUP_WINDOW_MS = 30_000;

  for (const invoice of openInvoices) {
    const remainingUnapplied = parseFloat((startingUnapplied - appliedThisRun).toFixed(2));
    if (remainingUnapplied < 0.01) break;

    const balanceDue = parseFloat(invoice.balanceDue || "0");
    if (balanceDue < 0.01) continue;

    // Prevent overpayment: apply the lesser of remaining unapplied vs invoice balance
    const applyAmount = parseFloat(Math.min(remainingUnapplied, balanceDue).toFixed(2));
    if (applyAmount < 0.01) continue;

    // Guard duplicate (same payment + same invoice within 30 s)
    const existingApps = await db
      .select()
      .from(paymentApplications)
      .where(
        and(
          eq(paymentApplications.paymentId, paymentId),
          eq(paymentApplications.invoiceId, invoice.id)
        )
      );
    const duplicate = existingApps.find(
      (a) =>
        Math.abs(parseFloat(a.amount) - applyAmount) < 0.005 &&
        a.appliedAt &&
        Date.now() - new Date(a.appliedAt).getTime() < DEDUP_WINDOW_MS
    );
    if (duplicate) continue;

    // Insert payment_applications record
    await db.insert(paymentApplications).values({
      paymentId,
      invoiceId: invoice.id,
      amount: applyAmount.toFixed(2),
      appliedBy: userId,
      matchMethod: "fifo_auto",
      matchConfidence: "100.00",
    });

    appliedThisRun = parseFloat((appliedThisRun + applyAmount).toFixed(2));

    // Update payment applied/unapplied using running totals (avoids stale read issues)
    const newPaymentApplied = (originalApplied + appliedThisRun).toFixed(2);
    const newPaymentUnapplied = parseFloat((startingUnapplied - appliedThisRun).toFixed(2));
    await db
      .update(payments)
      .set({
        appliedAmount: newPaymentApplied,
        unappliedAmount: newPaymentUnapplied.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(payments.id, paymentId));

    // Update invoice paidAmount / balanceDue / status
    const newPaid = parseFloat((parseFloat(invoice.paidAmount || "0") + applyAmount).toFixed(2));
    const newBalance = parseFloat(Math.max(0, parseFloat(invoice.totalAmount) - newPaid).toFixed(2));
    const newStatus = newBalance <= 0.005 ? "paid" : "partially_paid";

    await db
      .update(invoices)
      .set({
        paidAmount: newPaid.toFixed(2),
        balanceDue: newBalance.toFixed(2),
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoice.id));

    // Write AR ledger credit entry (negative = credit, decreases AR balance)
    await db.insert(arLedgerEntries).values({
      customerId: payment.customerId!,
      entryType: "payment",
      referenceType: "payment",
      referenceId: paymentId,
      entryDate: new Date().toISOString().split("T")[0],
      description: `Payment ${payment.paymentNumber || paymentId} applied to Invoice ${invoice.invoiceNumber} (FIFO)`,
      amount: (-applyAmount).toFixed(2),
      invoiceId: invoice.id,
      createdBy: userId,
    });

    applicationResults.push({
      paymentId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber || invoice.id,
      appliedAmount: applyAmount,
      remainingInvoiceBalance: newBalance,
      invoiceStatus: newStatus,
    });
  }

  return {
    paymentId,
    paymentNumber: payment.paymentNumber || paymentId,
    startingUnapplied,
    endingUnapplied: parseFloat((startingUnapplied - appliedThisRun).toFixed(2)),
    applications: applicationResults,
  };
}

/**
 * Run FIFO for ALL unapplied payments for a customer (oldest payment first).
 * Stops early if there are no more open invoices.
 */
export async function runCustomerFIFO(
  customerId: string,
  userId: string
): Promise<FIFORunResult[]> {
  const unappliedPayments = await getUnappliedPaymentsForCustomer(customerId);
  const results: FIFORunResult[] = [];

  for (const payment of unappliedPayments) {
    const result = await autoApplyPaymentFIFO(payment.id, userId);
    results.push(result);
    // If no invoices remain, all subsequent payments will also skip — bail early
    if (result.skippedReason === "No open invoices to apply payment to") break;
  }

  return results;
}
