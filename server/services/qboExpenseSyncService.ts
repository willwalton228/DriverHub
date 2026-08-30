/**
 * QBO Expense Sync Service — Phase 1 Read-Only
 * Pulls expense transactions from QuickBooks and upserts into qbo_expense_transactions.
 */

import { db } from "../db";
import {
  qboSyncRuns, qboVendors, qboChartOfAccounts, qboExpenseTransactions,
  InsertQboExpenseTransaction, InsertQboVendor, InsertQboChartOfAccount,
} from "../../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  getValidTokens, fetchBills, fetchBillPayments, fetchChecks,
  fetchJournalEntries, fetchVendors, fetchExpenseAccounts,
  QBOTransaction, QBOLine, QBOVendor, QBOAccount,
} from "./qboApiClient";

// ── Helpers ───────────────────────────────────────────────────────────────────

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function extractPaymentMethod(txn: QBOTransaction): string | null {
  if (txn.PaymentMethodRef?.name) return txn.PaymentMethodRef.name;
  if (txn.PayType) return txn.PayType; // 'Check' | 'CreditCard' | 'Cash' | 'EFT'
  return null;
}

function extractFirstExpenseLine(lines: QBOLine[] = []): { accountId: string | null; accountName: string | null; className: string | null; customerName: string | null } {
  for (const line of lines) {
    const detail = line.AccountBasedExpenseLineDetail;
    if (detail) {
      return {
        accountId:   detail.AccountRef?.value ?? null,
        accountName: detail.AccountRef?.name  ?? null,
        className:   detail.ClassRef?.name    ?? null,
        customerName: detail.CustomerRef?.name ?? null,
      };
    }
  }
  return { accountId: null, accountName: null, className: null, customerName: null };
}

function mapTxnToRow(
  txn: QBOTransaction,
  txnType: string,
  syncRunId: string,
  realmId?: string,
): InsertQboExpenseTransaction {
  const lineInfo = extractFirstExpenseLine(txn.Line);
  const vendorRef = txn.VendorRef ?? txn.EntityRef;

  return {
    qboTxnId:        txn.Id,
    qboTxnType:      txnType,
    txnDate:         txn.TxnDate,
    postingDate:     txn.TxnDate,
    vendorId:        vendorRef?.value ?? null,
    vendorName:      vendorRef?.name  ?? null,
    payeeName:       vendorRef?.name  ?? null,
    totalAmount:     String(txn.TotalAmt ?? 0),
    accountId:       (txn.AccountRef?.value ?? lineInfo.accountId) ?? null,
    accountName:     (txn.AccountRef?.name  ?? lineInfo.accountName) ?? null,
    accountType:     null,
    paymentMethod:   extractPaymentMethod(txn),
    bankAccountId:   txn.AccountRef?.value ?? null,
    bankAccountName: txn.AccountRef?.name  ?? null,
    checkNumber:     txn.DocNumber ?? null,
    referenceNumber: txn.DocNumber ?? null,
    memo:            txn.PrivateNote ?? txn.Memo ?? null,
    privateNote:     txn.PrivateNote ?? null,
    className:       lineInfo.className,
    locationName:    txn.DepartmentRef?.name ?? null,
    customerName:    lineInfo.customerName,
    docNumber:       txn.DocNumber ?? null,
    isPaid:          txnType === "BillPayment" || txnType === "Check" || txnType === "Purchase",
    isBillPayment:   txnType === "BillPayment",
    rawPayload:      txn as any,
    syncRunId,
    lastSyncAt:      new Date(),
    // Phase 1 data architecture requirements
    sourceSystem:      "quickbooks",
    syncStatus:        "ok",
    qboLastModifiedAt: txn.MetaData?.LastUpdatedTime ? new Date(txn.MetaData.LastUpdatedTime) : new Date(),
    qboSyncToken:      (txn as any).SyncToken ?? null,
    qboRealmId:        realmId ?? null,
  };
}

// ── Upsert helpers ────────────────────────────────────────────────────────────

async function upsertTransactions(rows: InsertQboExpenseTransaction[]): Promise<number> {
  if (!rows.length) return 0;
  let count = 0;
  // Process in batches of 100
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    await db.execute(sql`
      INSERT INTO qbo_expense_transactions (
        id, qbo_txn_id, qbo_txn_type, txn_date, posting_date,
        vendor_id, vendor_name, payee_name, total_amount,
        account_id, account_name, account_type,
        payment_method, bank_account_id, bank_account_name,
        check_number, reference_number, memo, private_note,
        class_name, location_name, customer_name,
        doc_number, is_paid, is_bill_payment, raw_payload, sync_run_id, last_sync_at,
        source_system, sync_status, qbo_last_modified_at, qbo_sync_token, qbo_realm_id
      )
      VALUES ${sql.join(batch.map(r => sql`(
        gen_random_uuid(), ${r.qboTxnId}, ${r.qboTxnType}, ${r.txnDate}, ${r.postingDate},
        ${r.vendorId}, ${r.vendorName}, ${r.payeeName}, ${r.totalAmount},
        ${r.accountId}, ${r.accountName}, ${r.accountType},
        ${r.paymentMethod}, ${r.bankAccountId}, ${r.bankAccountName},
        ${r.checkNumber}, ${r.referenceNumber}, ${r.memo}, ${r.privateNote},
        ${r.className}, ${r.locationName}, ${r.customerName},
        ${r.docNumber}, ${r.isPaid}, ${r.isBillPayment}, ${r.rawPayload ?? null}::jsonb, ${r.syncRunId}, now(),
        'quickbooks', 'ok', ${r.qboLastModifiedAt ?? null}, ${r.qboSyncToken ?? null}, ${r.qboRealmId ?? null}
      )`), sql`, `)}
      ON CONFLICT (qbo_txn_id, qbo_txn_type)
      DO UPDATE SET
        txn_date             = EXCLUDED.txn_date,
        vendor_name          = EXCLUDED.vendor_name,
        payee_name           = EXCLUDED.payee_name,
        total_amount         = EXCLUDED.total_amount,
        account_id           = EXCLUDED.account_id,
        account_name         = EXCLUDED.account_name,
        payment_method       = EXCLUDED.payment_method,
        bank_account_name    = EXCLUDED.bank_account_name,
        memo                 = EXCLUDED.memo,
        class_name           = EXCLUDED.class_name,
        customer_name        = EXCLUDED.customer_name,
        is_paid              = EXCLUDED.is_paid,
        raw_payload          = EXCLUDED.raw_payload,
        sync_run_id          = EXCLUDED.sync_run_id,
        last_sync_at         = now(),
        source_system        = 'quickbooks',
        sync_status          = 'ok',
        qbo_last_modified_at = EXCLUDED.qbo_last_modified_at,
        qbo_sync_token       = EXCLUDED.qbo_sync_token,
        qbo_realm_id         = COALESCE(EXCLUDED.qbo_realm_id, qbo_expense_transactions.qbo_realm_id),
        updated_at           = now()
      WHERE qbo_expense_transactions.qbo_last_modified_at IS NULL
         OR qbo_expense_transactions.qbo_last_modified_at <= EXCLUDED.qbo_last_modified_at
    `);
    count += batch.length;
  }
  return count;
}

async function upsertVendors(vendors: QBOVendor[]): Promise<void> {
  for (const v of vendors) {
    await db.execute(sql`
      INSERT INTO qbo_vendors (id, qbo_vendor_id, display_name, company_name, email, phone, is_active, last_sync_at)
      VALUES (gen_random_uuid(), ${v.Id}, ${v.DisplayName}, ${v.CompanyName ?? null},
              ${v.PrimaryEmailAddr?.Address ?? null}, ${v.PrimaryPhone?.FreeFormNumber ?? null},
              ${v.Active}, now())
      ON CONFLICT (qbo_vendor_id)
      DO UPDATE SET
        display_name     = EXCLUDED.display_name,
        company_name     = EXCLUDED.company_name,
        email            = EXCLUDED.email,
        phone            = EXCLUDED.phone,
        is_active        = EXCLUDED.is_active,
        source_system    = 'quickbooks',
        sync_status      = 'ok',
        last_sync_at     = now(),
        updated_at       = now()
    `);
  }
}

async function upsertAccounts(accounts: QBOAccount[]): Promise<void> {
  for (const a of accounts) {
    await db.execute(sql`
      INSERT INTO qbo_chart_of_accounts (id, qbo_account_id, name, fully_qualified_name, account_type, account_sub_type, classification, is_active, last_sync_at)
      VALUES (gen_random_uuid(), ${a.Id}, ${a.Name}, ${a.FullyQualifiedName ?? null},
              ${a.AccountType}, ${a.AccountSubType ?? null}, ${a.Classification ?? null},
              ${a.Active}, now())
      ON CONFLICT (qbo_account_id)
      DO UPDATE SET
        name                 = EXCLUDED.name,
        fully_qualified_name = EXCLUDED.fully_qualified_name,
        account_type         = EXCLUDED.account_type,
        account_sub_type     = EXCLUDED.account_sub_type,
        classification       = EXCLUDED.classification,
        is_active            = EXCLUDED.is_active,
        source_system        = 'quickbooks',
        sync_status          = 'ok',
        last_sync_at         = now(),
        updated_at           = now()
    `);
  }
}

// ── Main sync orchestrator ────────────────────────────────────────────────────

export interface SyncOptions {
  since?: string; // YYYY-MM-DD, defaults to 90 days ago
  until?: string; // YYYY-MM-DD, defaults to today
  triggeredBy?: string;
}

export interface SyncResult {
  syncRunId: string;
  status: "success" | "partial" | "failed";
  recordsFetched: number;
  recordsUpserted: number;
  error?: string;
  notConnected?: boolean;
}

export async function runQboExpenseSync(opts: SyncOptions = {}): Promise<SyncResult> {
  const tokens = await getValidTokens();

  if (!tokens) {
    return { syncRunId: "", status: "failed", recordsFetched: 0, recordsUpserted: 0, notConnected: true, error: "QuickBooks is not connected" };
  }

  const until = opts.until ?? dateStr(new Date());
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 90);
  const since = opts.since ?? dateStr(sinceDate);

  // Create sync run record
  const [run] = await db.insert(qboSyncRuns).values({
    syncType: "expense",
    status: "running",
    dateRangeStart: since,
    dateRangeEnd: until,
    triggeredBy: opts.triggeredBy ?? null,
  }).returning();

  let fetched = 0;
  let upserted = 0;
  const errors: string[] = [];

  try {
    // Pull reference data in parallel
    const [vendors, accounts] = await Promise.all([
      fetchVendors(tokens).catch(e => { errors.push(`Vendors: ${e.message}`); return [] as any[]; }),
      fetchExpenseAccounts(tokens).catch(e => { errors.push(`Accounts: ${e.message}`); return [] as any[]; }),
    ]);

    await Promise.all([
      upsertVendors(vendors),
      upsertAccounts(accounts),
    ]);

    // Pull all expense transaction types in parallel
    const [bills, billPayments, purchases, journals] = await Promise.all([
      fetchBills(tokens, since, until).catch(e => { errors.push(`Bills: ${e.message}`); return [] as any[]; }),
      fetchBillPayments(tokens, since, until).catch(e => { errors.push(`BillPayments: ${e.message}`); return [] as any[]; }),
      fetchChecks(tokens, since, until).catch(e => { errors.push(`Purchases/Checks: ${e.message}`); return [] as any[]; }),
      fetchJournalEntries(tokens, since, until).catch(e => { errors.push(`JournalEntries: ${e.message}`); return [] as any[]; }),
    ]);

    // Map and upsert each type — pass realmId for multi-entity future-proofing
    const billRows        = bills.map(t => mapTxnToRow(t, "Bill", run.id, tokens.realmId));
    const billPayRows     = billPayments.map(t => mapTxnToRow(t, "BillPayment", run.id, tokens.realmId));
    const purchaseRows    = purchases.map(t => mapTxnToRow(t, "Purchase", run.id, tokens.realmId));
    const journalRows     = journals.map(t => mapTxnToRow(t, "JournalEntry", run.id, tokens.realmId));

    const allRows = [...billRows, ...billPayRows, ...purchaseRows, ...journalRows];
    fetched = allRows.length;

    upserted = await upsertTransactions(allRows);

    const status = errors.length === 0 ? "success" : "partial";
    await db.update(qboSyncRuns)
      .set({ status, completedAt: new Date(), recordsFetched: fetched, recordsUpserted: upserted, errorMessage: errors.join("; ") || null })
      .where(eq(qboSyncRuns.id, run.id));

    console.log(`[QBO Expense Sync] ${status}: fetched=${fetched}, upserted=${upserted}, errors=${errors.length}`);
    return { syncRunId: run.id, status, recordsFetched: fetched, recordsUpserted: upserted, error: errors.join("; ") || undefined };

  } catch (err: any) {
    await db.update(qboSyncRuns)
      .set({ status: "failed", completedAt: new Date(), errorMessage: err.message })
      .where(eq(qboSyncRuns.id, run.id));
    return { syncRunId: run.id, status: "failed", recordsFetched: fetched, recordsUpserted: upserted, error: err.message };
  }
}

// ── Dashboard aggregation queries ─────────────────────────────────────────────

export async function getExpenseSummary(since: string, until: string) {
  const result = await db.execute(sql`
    SELECT
      COUNT(*)::int                           AS total_transactions,
      COALESCE(SUM(total_amount), 0)::numeric AS total_amount,
      COUNT(DISTINCT vendor_name)::int        AS unique_vendors,
      COUNT(DISTINCT account_name)::int       AS unique_categories,
      COUNT(CASE WHEN qbo_txn_type = 'Bill' THEN 1 END)::int           AS bills_count,
      COUNT(CASE WHEN qbo_txn_type = 'BillPayment' THEN 1 END)::int    AS bill_payments_count,
      COUNT(CASE WHEN qbo_txn_type = 'Purchase' AND payment_method = 'Check' THEN 1 END)::int AS checks_count,
      COUNT(CASE WHEN qbo_txn_type = 'Purchase' AND payment_method = 'CreditCard' THEN 1 END)::int AS credit_card_count,
      COUNT(CASE WHEN qbo_txn_type = 'JournalEntry' THEN 1 END)::int   AS journal_entries_count
    FROM qbo_expense_transactions
    WHERE txn_date >= ${since}::date AND txn_date <= ${until}::date
  `);
  return (result.rows as any[])[0];
}

export async function getExpensesByVendor(since: string, until: string, limit = 25) {
  const result = await db.execute(sql`
    SELECT
      COALESCE(vendor_name, 'Unknown') AS vendor_name,
      COUNT(*)::int                    AS transaction_count,
      SUM(total_amount)::numeric       AS total_amount,
      MAX(txn_date)::text              AS last_transaction_date,
      array_agg(DISTINCT qbo_txn_type) AS txn_types
    FROM qbo_expense_transactions
    WHERE txn_date >= ${since}::date AND txn_date <= ${until}::date
      AND vendor_name IS NOT NULL
    GROUP BY vendor_name
    ORDER BY total_amount DESC
    LIMIT ${limit}
  `);
  return result.rows as any[];
}

export async function getExpensesByCategory(since: string, until: string) {
  const result = await db.execute(sql`
    SELECT
      COALESCE(account_name, 'Uncategorized') AS category,
      COUNT(*)::int                            AS transaction_count,
      SUM(total_amount)::numeric               AS total_amount,
      ROUND(SUM(total_amount) * 100.0 / NULLIF(SUM(SUM(total_amount)) OVER (), 0), 1)::numeric AS pct_of_total
    FROM qbo_expense_transactions
    WHERE txn_date >= ${since}::date AND txn_date <= ${until}::date
    GROUP BY account_name
    ORDER BY total_amount DESC
    LIMIT 30
  `);
  return result.rows as any[];
}

export async function getDailyExpenses(since: string, until: string) {
  const result = await db.execute(sql`
    SELECT
      txn_date::text           AS date,
      COUNT(*)::int            AS transaction_count,
      SUM(total_amount)::numeric AS total_amount
    FROM qbo_expense_transactions
    WHERE txn_date >= ${since}::date AND txn_date <= ${until}::date
    GROUP BY txn_date
    ORDER BY txn_date ASC
  `);
  return result.rows as any[];
}

export async function getWeeklyExpenses(since: string, until: string) {
  const result = await db.execute(sql`
    SELECT
      DATE_TRUNC('week', txn_date)::date::text AS week_start,
      COUNT(*)::int                            AS transaction_count,
      SUM(total_amount)::numeric               AS total_amount
    FROM qbo_expense_transactions
    WHERE txn_date >= ${since}::date AND txn_date <= ${until}::date
    GROUP BY DATE_TRUNC('week', txn_date)
    ORDER BY week_start ASC
  `);
  return result.rows as any[];
}

export async function getMonthlyExpenses(since: string, until: string) {
  const result = await db.execute(sql`
    SELECT
      TO_CHAR(txn_date, 'YYYY-MM') AS month,
      COUNT(*)::int                AS transaction_count,
      SUM(total_amount)::numeric   AS total_amount
    FROM qbo_expense_transactions
    WHERE txn_date >= ${since}::date AND txn_date <= ${until}::date
    GROUP BY TO_CHAR(txn_date, 'YYYY-MM')
    ORDER BY month ASC
  `);
  return result.rows as any[];
}

export async function getExpenseExceptions(since: string, until: string) {
  const result = await db.execute(sql`
    SELECT
      qbo_txn_id, qbo_txn_type, txn_date::text, total_amount::numeric,
      vendor_name, payee_name, account_name, memo, doc_number,
      'unmapped_vendor'   AS exception_type,
      'Vendor not mapped to DriverHub account' AS exception_reason
    FROM qbo_expense_transactions
    WHERE txn_date >= ${since}::date AND txn_date <= ${until}::date
      AND vendor_name IS NULL

    UNION ALL

    SELECT
      qbo_txn_id, qbo_txn_type, txn_date::text, total_amount::numeric,
      vendor_name, payee_name, account_name, memo, doc_number,
      'uncategorized'     AS exception_type,
      'No expense account assigned' AS exception_reason
    FROM qbo_expense_transactions
    WHERE txn_date >= ${since}::date AND txn_date <= ${until}::date
      AND account_name IS NULL

    UNION ALL

    SELECT
      qbo_txn_id, qbo_txn_type, txn_date::text, total_amount::numeric,
      vendor_name, payee_name, account_name, memo, doc_number,
      'large_transaction' AS exception_type,
      'Transaction exceeds $10,000' AS exception_reason
    FROM qbo_expense_transactions
    WHERE txn_date >= ${since}::date AND txn_date <= ${until}::date
      AND total_amount >= 10000

    ORDER BY total_amount DESC
    LIMIT 100
  `);
  return result.rows as any[];
}

export async function getExpenseTransactions(opts: {
  since: string; until: string;
  vendorName?: string; accountName?: string; txnType?: string;
  limit?: number; offset?: number;
}) {
  const { since, until, vendorName, accountName, txnType, limit = 50, offset = 0 } = opts;
  const result = await db.execute(sql`
    SELECT
      qbo_txn_id, qbo_txn_type, txn_date::text, posting_date::text,
      vendor_name, payee_name, total_amount::numeric,
      account_name, payment_method, bank_account_name,
      check_number, reference_number, memo, class_name, customer_name,
      doc_number, is_paid, is_bill_payment
    FROM qbo_expense_transactions
    WHERE txn_date >= ${since}::date AND txn_date <= ${until}::date
      AND (${vendorName ?? null} IS NULL OR vendor_name ILIKE ${'%' + (vendorName ?? '') + '%'})
      AND (${accountName ?? null} IS NULL OR account_name ILIKE ${'%' + (accountName ?? '') + '%'})
      AND (${txnType ?? null} IS NULL OR qbo_txn_type = ${txnType ?? ''})
    ORDER BY txn_date DESC, total_amount DESC
    LIMIT ${limit} OFFSET ${offset}
  `);
  return result.rows as any[];
}

export async function getCashInOutByMonth(since: string, until: string) {
  const result = await db.execute(sql`
    WITH outflow AS (
      SELECT
        TO_CHAR(txn_date, 'YYYY-MM') AS month,
        SUM(total_amount)::numeric   AS cash_out,
        COUNT(*)::int                AS outflow_count
      FROM qbo_expense_transactions
      WHERE txn_date >= ${since}::date AND txn_date <= ${until}::date
        AND sync_status != 'excluded'
      GROUP BY TO_CHAR(txn_date, 'YYYY-MM')
    ),
    inflow AS (
      SELECT
        TO_CHAR(txn_date, 'YYYY-MM') AS month,
        SUM(total_amount)::numeric   AS cash_in,
        COUNT(*)::int                AS inflow_count
      FROM qbo_ar_transactions
      WHERE txn_date >= ${since}::date AND txn_date <= ${until}::date
        AND qbo_txn_type = 'Payment'
        AND sync_status != 'excluded'
      GROUP BY TO_CHAR(txn_date, 'YYYY-MM')
    ),
    months AS (
      SELECT month FROM outflow
      UNION
      SELECT month FROM inflow
    )
    SELECT
      m.month,
      COALESCE(i.cash_in,  0) AS cash_in,
      COALESCE(o.cash_out, 0) AS cash_out,
      COALESCE(i.cash_in, 0) - COALESCE(o.cash_out, 0) AS net_flow,
      COALESCE(i.inflow_count,  0) AS inflow_count,
      COALESCE(o.outflow_count, 0) AS outflow_count
    FROM months m
    LEFT JOIN inflow  i ON i.month = m.month
    LEFT JOIN outflow o ON o.month = m.month
    ORDER BY m.month ASC
  `);
  return result.rows as any[];
}

export async function getLastSyncRun() {
  const result = await db.execute(sql`
    SELECT id, status, started_at, completed_at, date_range_start, date_range_end,
           records_fetched, records_upserted, error_message
    FROM qbo_sync_runs
    WHERE sync_type = 'expense'
    ORDER BY started_at DESC
    LIMIT 1
  `);
  return (result.rows as any[])[0] ?? null;
}
