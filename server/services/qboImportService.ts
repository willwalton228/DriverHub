/**
 * QB Import Service — Phase 1 Read-Only Local Mirror
 *
 * Pulls AR-side data (customers, invoices, payments) from QuickBooks and
 * upserts into DriverHub local tables. QuickBooks is the system of record.
 *
 * Core rules enforced here:
 *  - NEVER modify QB transactions (read-only)
 *  - Retain all original QB identifiers (Id, SyncToken, DocNumber, RefNumber)
 *  - Staleness protection: skip upsert if QB's LastUpdatedTime hasn't changed
 *  - Partial sync protection: failures never overwrite valid existing records
 *  - Duplicate prevention: upsert on unique QB identifiers
 *  - source_system = 'quickbooks' on every record
 */

import { db } from "../db";
import { sql, eq, and, gte, lte } from "drizzle-orm";
import {
  qboCustomers, qboArTransactions, qboArTransactionLines,
  financeDailySnapshots,
  InsertQboCustomer, InsertQboArTransaction, InsertQboArTransactionLine,
} from "../../shared/schema";
import {
  getValidTokens,
  fetchCustomers, fetchInvoices, fetchPaymentsReceived, fetchCreditMemos,
  QBOCustomer, QBOInvoice, QBOPaymentReceived,
} from "./qboApiClient";

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseQboDate(d: string | undefined): Date | null {
  if (!d) return null;
  const p = new Date(d);
  return isNaN(p.getTime()) ? null : p;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Customer import ────────────────────────────────────────────────────────────

export async function importCustomers(syncRunId?: string): Promise<{
  fetched: number; upserted: number; skipped: number; errors: string[];
}> {
  const result = { fetched: 0, upserted: 0, skipped: 0, errors: [] as string[] };
  const tokens = await getValidTokens();
  if (!tokens) {
    result.errors.push("QuickBooks not connected — cannot import customers");
    return result;
  }

  let customers: QBOCustomer[] = [];
  try {
    customers = await fetchCustomers(tokens);
    result.fetched = customers.length;
  } catch (err: any) {
    result.errors.push(`QB fetch failed: ${err.message}`);
    return result;
  }

  const now = new Date();
  const BATCH = 100;

  for (let i = 0; i < customers.length; i += BATCH) {
    const batch = customers.slice(i, i + BATCH);

    for (const c of batch) {
      try {
        const qboLastModified = parseQboDate(c.MetaData?.LastUpdatedTime) ?? now;

        // Staleness protection: check if existing record is already up-to-date
        const existing = await db.select({
          id: qboCustomers.id,
          qboLastModifiedAt: qboCustomers.qboLastModifiedAt,
        })
          .from(qboCustomers)
          .where(eq(qboCustomers.qboCustomerId, c.Id))
          .limit(1);

        if (existing.length > 0 && existing[0].qboLastModifiedAt) {
          const existingModified = new Date(existing[0].qboLastModifiedAt);
          if (existingModified >= qboLastModified) {
            result.skipped++;
            continue; // QB hasn't changed — don't overwrite
          }
        }

        const row: InsertQboCustomer = {
          qboCustomerId:      c.Id,
          qboSyncToken:       c.SyncToken,
          displayName:        c.DisplayName,
          companyName:        c.CompanyName ?? null,
          firstName:          c.GivenName ?? null,
          lastName:           c.FamilyName ?? null,
          email:              c.PrimaryEmailAddr?.Address ?? null,
          phone:              c.PrimaryPhone?.FreeFormNumber ?? null,
          billAddrLine1:      c.BillAddr?.Line1 ?? null,
          billAddrCity:       c.BillAddr?.City ?? null,
          billAddrState:      c.BillAddr?.CountrySubDivisionCode ?? null,
          billAddrZip:        c.BillAddr?.PostalCode ?? null,
          isActive:           c.Active,
          balance:            c.Balance != null ? String(c.Balance) : null,
          balanceWithJobs:    c.BalanceWithJobs != null ? String(c.BalanceWithJobs) : null,
          sourceSystem:       "quickbooks",
          syncStatus:         "ok",
          qboLastModifiedAt:  qboLastModified,
          lastSyncAt:         now,
          syncRunId:          syncRunId ?? null,
          qboRealmId:         tokens.realmId ?? null,
        };

        await db.insert(qboCustomers)
          .values(row)
          .onConflictDoUpdate({
            target: qboCustomers.qboCustomerId,
            set: {
              qboSyncToken:      row.qboSyncToken,
              displayName:       row.displayName,
              companyName:       row.companyName,
              firstName:         row.firstName,
              lastName:          row.lastName,
              email:             row.email,
              phone:             row.phone,
              billAddrLine1:     row.billAddrLine1,
              billAddrCity:      row.billAddrCity,
              billAddrState:     row.billAddrState,
              billAddrZip:       row.billAddrZip,
              isActive:          row.isActive,
              balance:           row.balance,
              balanceWithJobs:   row.balanceWithJobs,
              syncStatus:        "ok",
              qboLastModifiedAt: row.qboLastModifiedAt,
              lastSyncAt:        row.lastSyncAt,
              syncRunId:         row.syncRunId,
              updatedAt:         now,
            },
          });

        result.upserted++;
      } catch (err: any) {
        result.errors.push(`Customer ${c.Id} (${c.DisplayName}): ${err.message}`);
      }
    }
  }

  return result;
}

// ── AR transactions import ─────────────────────────────────────────────────────

async function upsertArTransaction(
  txn: QBOInvoice | QBOPaymentReceived,
  txnType: "Invoice" | "Payment" | "CreditMemo",
  syncRunId?: string,
  realmId?: string,
): Promise<"upserted" | "skipped" | "error"> {
  const now = new Date();
  const qboLastModified = parseQboDate(txn.MetaData?.LastUpdatedTime) ?? now;

  try {
    // Staleness check
    const existing = await db.select({
      id: qboArTransactions.id,
      qboLastModifiedAt: qboArTransactions.qboLastModifiedAt,
    })
      .from(qboArTransactions)
      .where(and(
        eq(qboArTransactions.qboTxnId, txn.Id),
        eq(qboArTransactions.qboTxnType, txnType),
      ))
      .limit(1);

    if (existing.length > 0 && existing[0].qboLastModifiedAt) {
      const existingModified = new Date(existing[0].qboLastModifiedAt);
      if (existingModified >= qboLastModified) {
        return "skipped";
      }
    }

    const inv = txn as QBOInvoice;
    const pmt = txn as QBOPaymentReceived;

    const linkedTxnIds: string[] = (inv.LinkedTxn ?? []).map(l => `${l.TxnType}:${l.TxnId}`);

    const row: InsertQboArTransaction = {
      qboTxnId:          txn.Id,
      qboTxnType:        txnType,
      qboSyncToken:      txn.SyncToken,
      qboDocNumber:      inv.DocNumber ?? null,
      qboRefNumber:      inv.DocNumber ?? null,
      txnDate:           (inv.TxnDate ?? pmt.TxnDate) as any,
      dueDate:           inv.DueDate ? inv.DueDate as any : null,
      qboCustomerId:     (inv.CustomerRef ?? pmt.CustomerRef)?.value ?? null,
      customerName:      (inv.CustomerRef ?? pmt.CustomerRef)?.name ?? null,
      customerRef:       (inv.CustomerRef ?? pmt.CustomerRef)?.value ?? null,
      totalAmount:       String(txn.TotalAmt ?? 0),
      balance:           inv.Balance != null ? String(inv.Balance) : null,
      taxAmount:         inv.TxnTaxDetail?.TotalTax != null ? String(inv.TxnTaxDetail.TotalTax) : null,
      txnStatus:         (txn as any).BillStatus ?? null,
      isPaid:            txnType === "Payment" || (inv.Balance != null && inv.Balance <= 0),
      isVoided:          (txn as any).PrivateNote === "Voided",
      linkedTxnIds:      linkedTxnIds.length > 0 ? linkedTxnIds : null,
      memo:              inv.CustomerMemo?.value ?? inv.PrivateNote ?? null,
      privateNote:       inv.PrivateNote ?? null,
      className:         inv.ClassRef?.name ?? null,
      departmentName:    inv.DepartmentRef?.name ?? null,
      rawPayload:        txn as any,
      sourceSystem:      "quickbooks",
      syncStatus:        "ok",
      qboLastModifiedAt: qboLastModified,
      lastSyncAt:        now,
      syncRunId:         syncRunId ?? null,
      qboRealmId:        realmId ?? null,
    };

    const [arRow] = await db.insert(qboArTransactions)
      .values(row)
      .onConflictDoUpdate({
        target: [qboArTransactions.qboTxnId, qboArTransactions.qboTxnType],
        set: {
          qboSyncToken:      row.qboSyncToken,
          qboDocNumber:      row.qboDocNumber,
          qboRefNumber:      row.qboRefNumber,
          dueDate:           row.dueDate,
          qboCustomerId:     row.qboCustomerId,
          customerName:      row.customerName,
          totalAmount:       row.totalAmount,
          balance:           row.balance,
          taxAmount:         row.taxAmount,
          txnStatus:         row.txnStatus,
          isPaid:            row.isPaid,
          isVoided:          row.isVoided,
          linkedTxnIds:      row.linkedTxnIds,
          memo:              row.memo,
          privateNote:       row.privateNote,
          rawPayload:        row.rawPayload,
          syncStatus:        "ok",
          qboLastModifiedAt: row.qboLastModifiedAt,
          lastSyncAt:        row.lastSyncAt,
          syncRunId:         row.syncRunId,
          updatedAt:         now,
        },
      })
      .returning({ id: qboArTransactions.id });

    // Import line items for invoices
    if (txnType === "Invoice" && inv.Line && arRow?.id) {
      await importArLines(arRow.id, txn.Id, inv.Line, now);
    }

    return "upserted";
  } catch (err: any) {
    console.error(`[QBOImport] AR txn ${txnType}:${txn.Id} error:`, err.message);
    return "error";
  }
}

async function importArLines(
  arTransactionId: string,
  qboTxnId: string,
  lines: QBOInvoice["Line"],
  now: Date,
): Promise<void> {
  if (!lines?.length) return;
  // Delete existing lines and re-insert (idempotent)
  await db.delete(qboArTransactionLines)
    .where(eq(qboArTransactionLines.arTransactionId, arTransactionId));

  const lineRows: InsertQboArTransactionLine[] = lines
    .filter(l => l.DetailType === "SalesItemLineDetail" || l.Amount > 0)
    .map((l, idx) => ({
      arTransactionId,
      qboTxnId,
      qboLineId:    l.Id ?? null,
      lineNum:      l.LineNum ?? idx + 1,
      qboItemId:    l.SalesItemLineDetail?.ItemRef?.value ?? null,
      itemName:     l.SalesItemLineDetail?.ItemRef?.name ?? null,
      description:  l.Description ?? null,
      quantity:     l.SalesItemLineDetail?.Qty != null ? String(l.SalesItemLineDetail.Qty) : null,
      unitPrice:    l.SalesItemLineDetail?.UnitPrice != null ? String(l.SalesItemLineDetail.UnitPrice) : null,
      amount:       String(l.Amount),
      qboAccountId: null,
      accountName:  null,
      className:    l.SalesItemLineDetail?.ClassRef?.name ?? null,
      sourceSystem: "quickbooks",
      lastSyncAt:   now,
    }));

  if (lineRows.length > 0) {
    await db.insert(qboArTransactionLines).values(lineRows);
  }
}

export async function importARTransactions(
  since: string,
  until: string,
  syncRunId?: string,
): Promise<{ fetched: number; upserted: number; skipped: number; errors: string[] }> {
  const result = { fetched: 0, upserted: 0, skipped: 0, errors: [] as string[] };
  const tokens = await getValidTokens();
  if (!tokens) {
    result.errors.push("QuickBooks not connected — cannot import AR transactions");
    return result;
  }

  // Fetch all AR transaction types in parallel
  let invoices: QBOInvoice[] = [];
  let payments: QBOPaymentReceived[] = [];
  let creditMemos: QBOInvoice[] = [];

  try {
    [invoices, payments, creditMemos] = await Promise.all([
      fetchInvoices(tokens, since, until),
      fetchPaymentsReceived(tokens, since, until),
      fetchCreditMemos(tokens, since, until),
    ]);
  } catch (err: any) {
    result.errors.push(`QB fetch failed: ${err.message}`);
    return result;
  }

  result.fetched = invoices.length + payments.length + creditMemos.length;
  const realmId = tokens.realmId;

  for (const inv of invoices) {
    const r = await upsertArTransaction(inv, "Invoice", syncRunId, realmId);
    if (r === "upserted") result.upserted++;
    else if (r === "skipped") result.skipped++;
    else result.errors.push(`Invoice ${inv.Id} failed`);
  }

  for (const pmt of payments) {
    const r = await upsertArTransaction(pmt, "Payment", syncRunId, realmId);
    if (r === "upserted") result.upserted++;
    else if (r === "skipped") result.skipped++;
    else result.errors.push(`Payment ${pmt.Id} failed`);
  }

  for (const cm of creditMemos) {
    const r = await upsertArTransaction(cm, "CreditMemo", syncRunId, realmId);
    if (r === "upserted") result.upserted++;
    else if (r === "skipped") result.skipped++;
    else result.errors.push(`CreditMemo ${cm.Id} failed`);
  }

  return result;
}

// ── Daily snapshot generation ──────────────────────────────────────────────────
// Aggregates KPIs from local tables — never hits QB API.
// Safe to run anytime; overwrites today's snapshot via UPSERT.

export async function generateDailySnapshot(
  snapshotDate: string = today(),
  syncRunId?: string,
): Promise<void> {
  try {
    const result = await db.execute(sql`
      WITH
        ar_invoiced AS (
          SELECT
            COALESCE(SUM(total_amount), 0)   AS total_invoiced,
            COALESCE(SUM(CASE WHEN balance > 0 AND due_date < CURRENT_DATE THEN balance ELSE 0 END), 0) AS total_overdue,
            COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) AS total_ar_balance,
            COUNT(*)                          AS invoice_count,
            COUNT(CASE WHEN is_paid THEN 1 END) AS paid_count,
            COUNT(CASE WHEN balance > 0 AND due_date < CURRENT_DATE THEN 1 END) AS overdue_count
          FROM qbo_ar_transactions
          WHERE qbo_txn_type = 'Invoice'
            AND is_voided = false
            AND sync_status = 'ok'
        ),
        ar_paid AS (
          SELECT COALESCE(SUM(total_amount), 0) AS total_paid
          FROM qbo_ar_transactions
          WHERE qbo_txn_type = 'Payment'
            AND txn_date = ${snapshotDate}::date
            AND sync_status = 'ok'
        ),
        ap_expenses AS (
          SELECT
            COALESCE(SUM(total_amount), 0) AS total_expenses,
            COUNT(*)                        AS expense_count
          FROM qbo_expense_transactions
          WHERE txn_date = ${snapshotDate}::date
            AND sync_status != 'excluded'
        ),
        ap_bills_paid AS (
          SELECT COALESCE(SUM(total_amount), 0) AS total_bills_paid
          FROM qbo_expense_transactions
          WHERE txn_date = ${snapshotDate}::date
            AND is_bill_payment = true
            AND sync_status != 'excluded'
        ),
        vendors_active AS (
          SELECT COUNT(*) AS cnt FROM qbo_vendors WHERE is_active = true
        )
      SELECT
        inv.total_invoiced, inv.total_overdue, inv.total_ar_balance,
        inv.invoice_count, inv.paid_count, inv.overdue_count,
        paid.total_paid,
        exp.total_expenses, exp.expense_count,
        bpaid.total_bills_paid,
        (paid.total_paid - bpaid.total_bills_paid) AS net_cash_flow,
        inv.total_ar_balance AS total_ap_balance,
        va.cnt AS active_vendor_count
      FROM ar_invoiced inv, ar_paid paid, ap_expenses exp, ap_bills_paid bpaid, vendors_active va
    `);

    const row = (result.rows ?? result as any[])[0];
    if (!row) return;

    await db.insert(financeDailySnapshots)
      .values({
        snapshotDate:      snapshotDate as any,
        totalArBalance:    String(row.total_ar_balance ?? 0),
        totalInvoiced:     String(row.total_invoiced   ?? 0),
        totalPaid:         String(row.total_paid        ?? 0),
        totalOverdue:      String(row.total_overdue     ?? 0),
        invoiceCount:      Number(row.invoice_count     ?? 0),
        paidCount:         Number(row.paid_count        ?? 0),
        overdueCount:      Number(row.overdue_count     ?? 0),
        totalApBalance:    String(row.total_ap_balance  ?? 0),
        totalExpenses:     String(row.total_expenses    ?? 0),
        totalBillsPaid:    String(row.total_bills_paid  ?? 0),
        expenseCount:      Number(row.expense_count     ?? 0),
        netCashFlow:       String(row.net_cash_flow     ?? 0),
        activeVendorCount: Number(row.active_vendor_count ?? 0),
        syncRunId:         syncRunId ?? null,
        sourceSystem:      "quickbooks",
      })
      .onConflictDoUpdate({
        target: financeDailySnapshots.snapshotDate,
        set: {
          totalArBalance:    String(row.total_ar_balance ?? 0),
          totalInvoiced:     String(row.total_invoiced   ?? 0),
          totalPaid:         String(row.total_paid        ?? 0),
          totalOverdue:      String(row.total_overdue     ?? 0),
          invoiceCount:      Number(row.invoice_count     ?? 0),
          paidCount:         Number(row.paid_count        ?? 0),
          overdueCount:      Number(row.overdue_count     ?? 0),
          totalApBalance:    String(row.total_ap_balance  ?? 0),
          totalExpenses:     String(row.total_expenses    ?? 0),
          totalBillsPaid:    String(row.total_bills_paid  ?? 0),
          expenseCount:      Number(row.expense_count     ?? 0),
          netCashFlow:       String(row.net_cash_flow     ?? 0),
          activeVendorCount: Number(row.active_vendor_count ?? 0),
          generatedAt:       new Date(),
          syncRunId:         syncRunId ?? null,
        },
      });

    console.log(`[QBOImport] Daily snapshot generated for ${snapshotDate}`);
  } catch (err: any) {
    console.error(`[QBOImport] Snapshot generation failed for ${snapshotDate}:`, err.message);
  }
}

// ── Local data query helpers (used by Finance dashboard API routes) ────────────
// These query local tables — never hits QB API. Dashboards call these.

export async function getLocalCustomers(opts: {
  search?: string; mappingStatus?: string; limit?: number; offset?: number;
}) {
  const { search, mappingStatus, limit = 100, offset = 0 } = opts;
  const result = await db.execute(sql`
    SELECT
      qc.qbo_customer_id, qc.display_name, qc.company_name, qc.email, qc.phone,
      qc.balance, qc.balance_with_jobs, qc.is_active,
      qc.mapping_status, qc.dh_account_id, qc.mapping_note,
      qc.last_sync_at, qc.sync_status,
      c.company_name AS dh_company_name
    FROM qbo_customers qc
    LEFT JOIN customers c ON c.id = qc.dh_account_id
    WHERE (${search ?? null} IS NULL OR qc.display_name ILIKE ${'%' + (search ?? '') + '%'})
      AND (${mappingStatus ?? null} IS NULL OR qc.mapping_status = ${mappingStatus ?? ''})
    ORDER BY qc.display_name
    LIMIT ${limit} OFFSET ${offset}
  `);
  return result.rows as any[];
}

export async function getLocalARTransactions(opts: {
  since: string; until: string; txnType?: string; customerId?: string;
  isPaid?: boolean; limit?: number; offset?: number;
}) {
  const { since, until, txnType, customerId, isPaid, limit = 100, offset = 0 } = opts;
  const result = await db.execute(sql`
    SELECT
      qbo_txn_id, qbo_txn_type, qbo_doc_number, txn_date::text, due_date::text,
      customer_name, total_amount::numeric, balance::numeric, tax_amount::numeric,
      txn_status, is_paid, is_voided,
      memo, class_name, dh_account_id, dh_invoice_id,
      sync_status, last_sync_at
    FROM qbo_ar_transactions
    WHERE txn_date >= ${since}::date AND txn_date <= ${until}::date
      AND is_voided = false
      AND (${txnType ?? null} IS NULL OR qbo_txn_type = ${txnType ?? ''})
      AND (${customerId ?? null} IS NULL OR qbo_customer_id = ${customerId ?? ''})
      AND (${isPaid ?? null} IS NULL OR is_paid = ${isPaid ?? null})
    ORDER BY txn_date DESC, total_amount DESC
    LIMIT ${limit} OFFSET ${offset}
  `);
  return result.rows as any[];
}

export async function getSnapshotTrend(opts: { days?: number } = {}): Promise<any[]> {
  const days = opts.days ?? 30;
  const result = await db.execute(sql`
    SELECT
      snapshot_date::text,
      total_ar_balance::numeric,
      total_invoiced::numeric,
      total_paid::numeric,
      total_overdue::numeric,
      total_expenses::numeric,
      net_cash_flow::numeric,
      invoice_count,
      overdue_count,
      expense_count
    FROM finance_daily_snapshots
    WHERE snapshot_date >= (CURRENT_DATE - (${days} || ' days')::interval)::date
    ORDER BY snapshot_date ASC
  `);
  return result.rows as any[];
}
