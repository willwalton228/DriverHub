/**
 * rideshareCanonicalService.ts
 *
 * CANONICAL QUERY LAYER for Rideshare Reconciliation.
 *
 * ALL widgets, reports, exports, and billing calculations MUST route through
 * this service.  This is the single source of truth that guarantees number
 * consistency across every UI surface.
 *
 * Source of truth table: rideshare_transactions (NOT rideshare_rides)
 * Baseline invariant:    is_archived = false
 *
 * Status taxonomy enforced here:
 *   Import status  → imported | rejected | duplicate_skipped
 *   Link status    → linked | exception | employee_expense | unmatched
 *   Billing status → unreviewed | ready_for_billing | billed | excluded
 */

import { db } from "../db";
import {
  rideshareTransactions,
  rideshareImportBatches,
  rideshareRejectedRows,
} from "@shared/schema";
import {
  and, eq, gte, lte, sql, count, inArray,
  type SQL,
} from "drizzle-orm";

// ─── Filter Types ─────────────────────────────────────────────────────────────

export interface CanonicalFilters {
  /** 'uber' | 'lyft' */
  provider?: string;
  /** YYYY-MM-DD inclusive start */
  dateFrom?: string;
  /** YYYY-MM-DD inclusive end */
  dateTo?: string;
  /** customers.id */
  accountId?: string;
  /** unreviewed | ready_for_billing | billed | excluded */
  billingStatus?: string;
  /**
   * Derived link status filter:
   *   linked | exception | employee_expense | unmatched
   * Translated to match_status / exception_reason conditions at query time.
   */
  linkStatus?: string;
  /** rideshare_import_batches.id */
  importBatchId?: string;
}

// ─── Standardised Link-Status Derivation ─────────────────────────────────────
//
// The canonical link_status is derived from two persisted columns:
//   match_status    → auto_matched | manual_matched | exception | unmatched
//   exception_reason → free text; "employee expense" substring = employee_expense
//
// Precedence (top wins):
//   1. exception_reason ILIKE '%employee%expense%' → employee_expense
//   2. match_status IN (auto_matched, manual_matched)  → linked
//   3. match_status = exception                         → exception
//   4. otherwise                                        → unmatched

/** SQL CASE expression that computes the canonical link_status for a row. */
export const derivedLinkStatusSql: SQL<string> = sql<string>`
  CASE
    WHEN ${rideshareTransactions.exceptionReason} ILIKE '%employee%expense%'
      THEN 'employee_expense'
    WHEN ${rideshareTransactions.matchStatus} IN ('auto_matched','manual_matched')
      THEN 'linked'
    WHEN ${rideshareTransactions.matchStatus} = 'exception'
      THEN 'exception'
    ELSE 'unmatched'
  END
`;

// ─── Canonical Base Condition ─────────────────────────────────────────────────

/**
 * Always-present baseline filter.
 * Every canonical query MUST include this condition.
 */
export function canonicalBaseCondition() {
  return eq(rideshareTransactions.isArchived, false);
}

// ─── Filter Builder ───────────────────────────────────────────────────────────

/**
 * Convert a CanonicalFilters object into a Drizzle conditions array.
 * The is_archived = false baseline is always included.
 */
export function buildCanonicalConditions(filters: CanonicalFilters = {}): SQL[] {
  const conds: SQL[] = [canonicalBaseCondition()];

  if (filters.provider)
    conds.push(eq(rideshareTransactions.provider, filters.provider));

  if (filters.dateFrom)
    conds.push(gte(rideshareTransactions.rideDate, filters.dateFrom));

  if (filters.dateTo)
    conds.push(lte(rideshareTransactions.rideDate, filters.dateTo));

  if (filters.accountId)
    conds.push(eq(rideshareTransactions.matchedAccountId, filters.accountId));

  if (filters.billingStatus)
    conds.push(eq(rideshareTransactions.billingStatus, filters.billingStatus));

  if (filters.importBatchId)
    conds.push(eq(rideshareTransactions.importBatchId, filters.importBatchId));

  if (filters.linkStatus) {
    switch (filters.linkStatus) {
      case "linked":
        conds.push(inArray(rideshareTransactions.matchStatus, ["auto_matched", "manual_matched"]));
        break;
      case "employee_expense":
        conds.push(sql`${rideshareTransactions.exceptionReason} ILIKE '%employee%expense%'`);
        break;
      case "exception":
        conds.push(eq(rideshareTransactions.matchStatus, "exception"));
        conds.push(sql`(${rideshareTransactions.exceptionReason} IS NULL OR ${rideshareTransactions.exceptionReason} NOT ILIKE '%employee%expense%')`);
        break;
      case "unmatched":
        conds.push(eq(rideshareTransactions.matchStatus, "unmatched"));
        conds.push(sql`(${rideshareTransactions.exceptionReason} IS NULL OR ${rideshareTransactions.exceptionReason} NOT ILIKE '%employee%expense%')`);
        break;
    }
  }

  return conds;
}

// ─── Widget Summary ───────────────────────────────────────────────────────────

export interface WidgetSummaryResult {
  // Totals
  totalRides: number;
  totalSpend: string;
  // Link status breakdown
  totalLinked: number;
  totalExceptions: number;
  totalEmployeeExpenseCount: number;
  totalEmployeeExpenseAmount: string;
  totalUnmatched: number;
  // Billing status breakdown
  totalUnreviewed: number;
  totalReadyForBilling: number;
  totalBilled: number;
  totalExcluded: number;
  // Provider breakdown
  uberRides: number;
  lyftRides: number;
  uberSpend: string;
  lyftSpend: string;
  // Derived rates
  matchPct: number;
  exceptionPct: number;
  billedPct: number;
  avgFare: string | null;
}

/**
 * Returns authoritative widget summary stats.
 * All KPI widgets MUST call this function — never compute stats from a
 * paginated result set.
 */
export async function getWidgetSummary(filters: CanonicalFilters = {}): Promise<WidgetSummaryResult> {
  const conds = buildCanonicalConditions(filters);
  const where = and(...conds);

  const [row] = await db.select({
    totalRides: count(),
    totalSpend: sql<string>`COALESCE(SUM(CAST(${rideshareTransactions.totalFare} AS NUMERIC)), 0)::text`,
    totalLinked: sql<number>`COUNT(*) FILTER (
      WHERE ${rideshareTransactions.matchStatus} IN ('auto_matched','manual_matched')
      AND (${rideshareTransactions.exceptionReason} IS NULL
           OR ${rideshareTransactions.exceptionReason} NOT ILIKE '%employee%expense%')
    )`,
    totalExceptions: sql<number>`COUNT(*) FILTER (
      WHERE ${rideshareTransactions.matchStatus} IN ('exception','unmatched')
      AND ${rideshareTransactions.billingStatus} NOT IN ('excluded')
      AND (${rideshareTransactions.exceptionReason} IS NULL
           OR ${rideshareTransactions.exceptionReason} NOT ILIKE '%employee%expense%')
    )`,
    totalEmployeeExpenseCount: sql<number>`COUNT(*) FILTER (
      WHERE ${rideshareTransactions.exceptionReason} ILIKE '%employee%expense%'
    )`,
    totalEmployeeExpenseAmount: sql<string>`COALESCE(SUM(CAST(${rideshareTransactions.totalFare} AS NUMERIC)) FILTER (
      WHERE ${rideshareTransactions.exceptionReason} ILIKE '%employee%expense%'
    ), 0)::text`,
    totalUnmatched: sql<number>`COUNT(*) FILTER (
      WHERE ${rideshareTransactions.matchStatus} = 'unmatched'
      AND (${rideshareTransactions.exceptionReason} IS NULL
           OR ${rideshareTransactions.exceptionReason} NOT ILIKE '%employee%expense%')
    )`,
    totalUnreviewed:      sql<number>`COUNT(*) FILTER (WHERE ${rideshareTransactions.billingStatus} = 'unreviewed')`,
    totalReadyForBilling: sql<number>`COUNT(*) FILTER (WHERE ${rideshareTransactions.billingStatus} = 'ready_for_billing')`,
    totalBilled:          sql<number>`COUNT(*) FILTER (WHERE ${rideshareTransactions.billingStatus} = 'billed')`,
    totalExcluded:        sql<number>`COUNT(*) FILTER (WHERE ${rideshareTransactions.billingStatus} = 'excluded')`,
    uberRides:  sql<number>`COUNT(*) FILTER (WHERE ${rideshareTransactions.provider} = 'uber')`,
    lyftRides:  sql<number>`COUNT(*) FILTER (WHERE ${rideshareTransactions.provider} = 'lyft')`,
    uberSpend:  sql<string>`COALESCE(SUM(CAST(${rideshareTransactions.totalFare} AS NUMERIC)) FILTER (WHERE ${rideshareTransactions.provider} = 'uber'), 0)::text`,
    lyftSpend:  sql<string>`COALESCE(SUM(CAST(${rideshareTransactions.totalFare} AS NUMERIC)) FILTER (WHERE ${rideshareTransactions.provider} = 'lyft'), 0)::text`,
    avgFare:    sql<string | null>`AVG(CAST(${rideshareTransactions.totalFare} AS NUMERIC))::text`,
  }).from(rideshareTransactions).where(where);

  const totalRides           = Number(row?.totalRides ?? 0);
  const totalLinked          = Number(row?.totalLinked ?? 0);
  const totalExceptions      = Number(row?.totalExceptions ?? 0);
  const totalBilled          = Number(row?.totalBilled ?? 0);
  const totalReadyForBilling = Number(row?.totalReadyForBilling ?? 0);

  return {
    totalRides,
    totalSpend:                row?.totalSpend ?? "0",
    totalLinked,
    totalExceptions,
    totalEmployeeExpenseCount: Number(row?.totalEmployeeExpenseCount ?? 0),
    totalEmployeeExpenseAmount: row?.totalEmployeeExpenseAmount ?? "0",
    totalUnmatched:            Number(row?.totalUnmatched ?? 0),
    totalUnreviewed:           Number(row?.totalUnreviewed ?? 0),
    totalReadyForBilling,
    totalBilled,
    totalExcluded:             Number(row?.totalExcluded ?? 0),
    uberRides:   Number(row?.uberRides ?? 0),
    lyftRides:   Number(row?.lyftRides ?? 0),
    uberSpend:   row?.uberSpend ?? "0",
    lyftSpend:   row?.lyftSpend ?? "0",
    avgFare:     row?.avgFare ?? null,
    matchPct:     totalRides > 0 ? +(totalLinked / totalRides * 100).toFixed(1) : 0,
    exceptionPct: totalRides > 0 ? +(totalExceptions / totalRides * 100).toFixed(1) : 0,
    billedPct:    totalRides > 0 ? +((totalBilled + totalReadyForBilling) / totalRides * 100).toFixed(1) : 0,
  };
}

// ─── Batch Summary ────────────────────────────────────────────────────────────

export interface BatchSummaryResult {
  batchId: string;
  provider: string;
  sourceFileName: string;
  uploadedAt: Date | null;
  processingStatus: string;
  /** Total rows in the source file (from rideshare_import_batches.total_rows) */
  sourceRowCount: number;
  /** Active (non-archived) transactions for this batch */
  activeRowCount: number;
  /** Rows rejected during import (rideshare_rejected_rows) */
  rejectedRowCount: number;
  /** Rejected rows with rejection_code = 'duplicate_trip_id' */
  duplicateSkippedCount: number;
  /** Sum of total_fare for active transactions */
  totalActiveFare: string;
  /** True when every transaction for this batch is archived */
  isBatchDeleted: boolean;
}

/**
 * Returns a canonical summary for a single import batch.
 * Joins rideshare_import_batches ↔ rideshare_transactions ↔ rideshare_rejected_rows.
 */
export async function getBatchSummary(batchId: string): Promise<BatchSummaryResult | null> {
  const [batch] = await db
    .select()
    .from(rideshareImportBatches)
    .where(eq(rideshareImportBatches.id, batchId))
    .limit(1);

  if (!batch) return null;

  const [txStats] = await db.select({
    activeRowCount: sql<number>`COUNT(*) FILTER (WHERE ${rideshareTransactions.isArchived} = false)`,
    totalRowCount:  count(),
    totalActiveFare: sql<string>`COALESCE(SUM(CAST(${rideshareTransactions.totalFare} AS NUMERIC)) FILTER (WHERE ${rideshareTransactions.isArchived} = false), 0)::text`,
  }).from(rideshareTransactions)
    .where(eq(rideshareTransactions.importBatchId, batchId));

  const [rejStats] = await db.select({
    rejectedRowCount:      count(),
    duplicateSkippedCount: sql<number>`COUNT(*) FILTER (WHERE ${rideshareRejectedRows.rejectionCode} = 'duplicate_trip_id')`,
  }).from(rideshareRejectedRows)
    .where(eq(rideshareRejectedRows.batchId, batchId));

  const activeRowCount  = Number(txStats?.activeRowCount  ?? 0);
  const totalRowCount   = Number(txStats?.totalRowCount   ?? 0);
  const isBatchDeleted  = totalRowCount > 0 && activeRowCount === 0;

  return {
    batchId,
    provider:             batch.provider,
    sourceFileName:       batch.sourceFileName,
    uploadedAt:           batch.uploadedAt,
    processingStatus:     batch.processingStatus,
    sourceRowCount:       batch.totalRows ?? 0,
    activeRowCount,
    rejectedRowCount:     Number(rejStats?.rejectedRowCount ?? 0),
    duplicateSkippedCount: Number(rejStats?.duplicateSkippedCount ?? 0),
    totalActiveFare:      txStats?.totalActiveFare ?? "0",
    isBatchDeleted,
  };
}

// ─── Employee Expense Query ───────────────────────────────────────────────────

export interface EmployeeExpenseResult {
  totalSpend: number;
  rideCount: number;
  byPassenger: Array<{ passengerName: string | null; totalSpend: string; rideCount: number }>;
  byMonth: Array<{ month: string; totalSpend: string; rideCount: number }>;
}

/**
 * Returns canonical employee expense stats from rideshare_transactions.
 * Employee expenses are rows where exception_reason ILIKE '%employee%expense%'.
 */
export async function getEmployeeExpenses(
  filters: Pick<CanonicalFilters, "dateFrom" | "dateTo" | "importBatchId">
): Promise<EmployeeExpenseResult> {
  const baseConds = buildCanonicalConditions(filters);
  baseConds.push(sql`${rideshareTransactions.exceptionReason} ILIKE '%employee%expense%'`);
  const where = and(...baseConds);

  const [summary] = await db.select({
    totalSpend: sql<string>`COALESCE(SUM(CAST(${rideshareTransactions.totalFare} AS NUMERIC)), 0)::text`,
    rideCount:  count(),
  }).from(rideshareTransactions).where(where);

  const byPassenger = await db.select({
    passengerName: rideshareTransactions.riderName,
    totalSpend:    sql<string>`COALESCE(SUM(CAST(${rideshareTransactions.totalFare} AS NUMERIC)), 0)::text`,
    rideCount:     count(),
  }).from(rideshareTransactions)
    .where(where)
    .groupBy(rideshareTransactions.riderName)
    .orderBy(sql`SUM(CAST(${rideshareTransactions.totalFare} AS NUMERIC)) DESC NULLS LAST`);

  const byMonth = await db.select({
    month:     sql<string>`TO_CHAR(${rideshareTransactions.rideDate}::date, 'YYYY-MM')`,
    totalSpend: sql<string>`COALESCE(SUM(CAST(${rideshareTransactions.totalFare} AS NUMERIC)), 0)::text`,
    rideCount:  count(),
  }).from(rideshareTransactions)
    .where(where)
    .groupBy(sql`TO_CHAR(${rideshareTransactions.rideDate}::date, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${rideshareTransactions.rideDate}::date, 'YYYY-MM')`);

  return {
    totalSpend: parseFloat(summary?.totalSpend ?? "0") || 0,
    rideCount:  Number(summary?.rideCount ?? 0),
    byPassenger: byPassenger.map(r => ({
      passengerName: r.passengerName,
      totalSpend:    r.totalSpend,
      rideCount:     Number(r.rideCount),
    })),
    byMonth: byMonth.map(r => ({
      month:     r.month,
      totalSpend: r.totalSpend,
      rideCount:  Number(r.rideCount),
    })),
  };
}
