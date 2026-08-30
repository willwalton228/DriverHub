/**
 * Payment Receipt Service
 *
 * Central dispatcher for payment receipt emails.
 * Called by every route that creates or applies a payment.
 *
 * Trigger points:
 *  - POST /api/corporate/invoicing/payments          (standard payment creation with invoiceId)
 *  - POST /api/corporate/invoicing/payments/manual   (manual/offline payment with allocations)
 *  - POST /api/corporate/invoicing/payments/:id/apply (single-invoice manual apply)
 *  - POST /api/corporate/invoicing/payments/:id/auto-apply (FIFO engine)
 *  - Stripe webhook payment_intent.succeeded         (handled inline in routes.ts)
 */

import { db } from "../db";
import { payments, invoices, customers, paymentApplications } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import type { PaymentReceiptInvoiceLine } from "../emailService";

/** Format a date string/Date for email display. */
function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/**
 * Resolve the best billing contact email for a customer record.
 */
function resolveCustomerEmail(customer: any): string | null {
  return (
    customer?.billingContactEmail ||
    customer?.primaryContactEmail ||
    customer?.customerEmail ||
    customer?.email ||
    null
  );
}

export interface ReceiptApplicationLine {
  invoiceId: string;
  invoiceNumber: string;
  appliedAmount: number;
  remainingBalance: number;
}

/**
 * Primary dispatcher.
 *
 * Pass the payment ID and optionally the list of application results
 * (invoice lines that this payment was applied to).
 *
 * If `applications` is omitted the service will look up
 * payment_applications records from the database.
 *
 * Returns silently — receipt failure must never block the payment flow.
 */
export async function dispatchPaymentReceipt(
  paymentId: string,
  applications?: ReceiptApplicationLine[]
): Promise<void> {
  try {
    // 1. Load payment
    const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
    if (!payment || !payment.customerId) return;

    // 2. Load customer
    const [customer] = await db.select().from(customers).where(eq(customers.id, payment.customerId));
    const toEmail = resolveCustomerEmail(customer);
    if (!toEmail) {
      console.log(`[Receipt] No billing email for customer ${payment.customerId} — skipping receipt`);
      return;
    }

    // 3. Resolve application lines
    let lines: ReceiptApplicationLine[] = applications ?? [];

    if (lines.length === 0) {
      // Fetch the most recent applications for this payment from the DB
      const apps = await db
        .select()
        .from(paymentApplications)
        .where(eq(paymentApplications.paymentId, paymentId))
        .orderBy(paymentApplications.appliedAt);

      if (apps.length > 0) {
        const invoiceIds = [...new Set(apps.map((a) => a.invoiceId))];
        const invRows = await db
          .select()
          .from(invoices)
          .where(inArray(invoices.id, invoiceIds));
        const invMap = new Map(invRows.map((i) => [i.id, i]));

        lines = apps.map((app) => {
          const inv = invMap.get(app.invoiceId);
          return {
            invoiceId: app.invoiceId,
            invoiceNumber: inv?.invoiceNumber || app.invoiceId,
            appliedAmount: parseFloat(app.amount),
            remainingBalance: parseFloat(inv?.balanceDue || "0"),
          };
        });
      }
    }

    if (lines.length === 0) {
      // Payment is unapplied — no invoice to reference, skip receipt
      console.log(`[Receipt] Payment ${payment.paymentNumber} has no applications yet — skipping receipt`);
      return;
    }

    // 4. Deduplicate by invoiceId (sum amounts if the same invoice appears multiple times)
    const deduped = new Map<string, ReceiptApplicationLine>();
    for (const line of lines) {
      if (deduped.has(line.invoiceId)) {
        const existing = deduped.get(line.invoiceId)!;
        existing.appliedAmount += line.appliedAmount;
        existing.remainingBalance = line.remainingBalance; // keep latest balance
      } else {
        deduped.set(line.invoiceId, { ...line });
      }
    }
    const dedupedLines = Array.from(deduped.values());

    // 5. Build receipt data
    const totalRemainingBalance = dedupedLines.reduce((sum, l) => sum + l.remainingBalance, 0);
    const primaryLine = dedupedLines[0];

    const invoiceLines: PaymentReceiptInvoiceLine[] = dedupedLines.map((l) => ({
      number: l.invoiceNumber,
      amount: l.appliedAmount.toFixed(2),
      remainingBalance: l.remainingBalance.toFixed(2),
    }));

    const { sendPaymentReceiptEmail } = await import("../emailService");
    await sendPaymentReceiptEmail({
      to: toEmail,
      customerName: customer?.customerName || customer?.name || "Valued Customer",
      paymentNumber: payment.paymentNumber || paymentId,
      invoiceNumber: primaryLine.invoiceNumber,          // single-invoice fallback
      paymentDate: fmtDate(payment.paymentDate),
      paymentMethod: payment.paymentMethod || "payment",
      amount: payment.amount,
      remainingBalance: totalRemainingBalance.toFixed(2),
      invoices: invoiceLines.length > 1 ? invoiceLines : undefined, // only pass multi-invoice array when needed
    });

    console.log(`[Receipt] Sent to ${toEmail} for payment ${payment.paymentNumber} (${dedupedLines.length} invoice(s))`);
  } catch (err: any) {
    // Receipt failure is non-fatal — log and swallow
    console.error("[Receipt] dispatch failed (non-fatal):", err.message);
  }
}
