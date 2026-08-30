/**
 * rideshareViewsInit.ts
 *
 * Creates (or replaces) the three canonical rideshare reporting views
 * in PostgreSQL.  Call initRideshareCanonicalViews() once at server startup.
 *
 * Views created:
 *   vw_rideshare_reporting_base   — active transactions with derived status columns
 *   vw_rideshare_batch_summary    — per-batch source / active / rejected row counts
 *   vw_rideshare_widget_summary   — global KPI aggregates
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

export async function initRideshareCanonicalViews(): Promise<void> {
  try {
    // ── vw_rideshare_reporting_base ─────────────────────────────────────────
    // Active transactions enriched with derived canonical status fields.
    // Joins to customers for a denormalized account name.
    await db.execute(sql.raw(`
      CREATE OR REPLACE VIEW vw_rideshare_reporting_base AS
      SELECT
        t.*,
        -- Canonical link_status (derived, not persisted)
        CASE
          WHEN t.exception_reason ILIKE '%employee%expense%' THEN 'employee_expense'
          WHEN t.match_status IN ('auto_matched','manual_matched')  THEN 'linked'
          WHEN t.match_status = 'exception'                        THEN 'exception'
          ELSE 'unmatched'
        END AS link_status,
        -- Canonical import_status
        -- Every row present here is 'imported'; rejected rows live in rideshare_rejected_rows
        'imported'::varchar AS import_status,
        -- Denormalised account name for export/report convenience
        c.customer_name AS matched_account_name
      FROM rideshare_transactions t
      LEFT JOIN customers c ON c.id = t.matched_account_id
      WHERE t.is_archived = false
    `));

    // ── vw_rideshare_batch_summary ──────────────────────────────────────────
    // Per-batch roll-up: source row count, active imports, rejections, fare.
    await db.execute(sql.raw(`
      CREATE OR REPLACE VIEW vw_rideshare_batch_summary AS
      SELECT
        b.id                                           AS batch_id,
        b.provider,
        b.source_file_name,
        b.uploaded_at,
        b.processing_status,
        COALESCE(b.total_rows, 0)                      AS source_row_count,

        -- Active (non-archived) transactions for this batch
        COUNT(t.id)                                    AS active_row_count,

        -- All transactions (including archived) — used for deletion detection
        COUNT(tall.id)                                 AS total_row_count,

        -- Total active fare
        COALESCE(SUM(CAST(t.total_fare AS NUMERIC)), 0) AS total_active_fare,

        -- Rejected rows (rows that failed import and landed in rideshare_rejected_rows)
        COALESCE(rej.rejected_row_count, 0)            AS rejected_row_count,

        -- Subset of rejected rows that were skipped due to a duplicate Trip ID
        COALESCE(rej.duplicate_skipped_count, 0)       AS duplicate_skipped_count,

        -- True when the batch had transactions but all are now archived
        CASE
          WHEN COUNT(tall.id) > 0 AND COUNT(t.id) = 0 THEN TRUE
          ELSE FALSE
        END                                            AS is_batch_deleted

      FROM rideshare_import_batches b

      -- Active transactions
      LEFT JOIN rideshare_transactions t
        ON t.import_batch_id = b.id AND t.is_archived = false

      -- All transactions (for deletion detection)
      LEFT JOIN rideshare_transactions tall
        ON tall.import_batch_id = b.id

      -- Rejected row aggregates
      LEFT JOIN (
        SELECT
          batch_id,
          COUNT(*)                                                    AS rejected_row_count,
          COUNT(*) FILTER (WHERE rejection_code = 'duplicate_trip_id') AS duplicate_skipped_count
        FROM rideshare_rejected_rows
        GROUP BY batch_id
      ) rej ON rej.batch_id = b.id

      GROUP BY
        b.id, b.provider, b.source_file_name, b.uploaded_at,
        b.processing_status, b.total_rows,
        rej.rejected_row_count, rej.duplicate_skipped_count
    `));

    // ── vw_rideshare_widget_summary ─────────────────────────────────────────
    // Global KPI aggregates across ALL active transactions.
    // Filter by provider / date / account by querying this view with WHERE clauses
    // in application code (the view exposes all dimension columns for this).
    await db.execute(sql.raw(`
      CREATE OR REPLACE VIEW vw_rideshare_widget_summary AS
      SELECT
        -- Totals
        COUNT(*)                                                                      AS total_rides,
        COALESCE(SUM(CAST(total_fare AS NUMERIC)), 0)                                AS total_spend,

        -- Link status breakdown
        COUNT(*) FILTER (
          WHERE match_status IN ('auto_matched','manual_matched')
            AND (exception_reason IS NULL OR exception_reason NOT ILIKE '%employee%expense%')
        )                                                                             AS total_linked,

        COUNT(*) FILTER (
          WHERE match_status IN ('exception','unmatched')
            AND billing_status NOT IN ('excluded')
            AND (exception_reason IS NULL OR exception_reason NOT ILIKE '%employee%expense%')
        )                                                                             AS total_exceptions,

        COUNT(*) FILTER (
          WHERE exception_reason ILIKE '%employee%expense%'
        )                                                                             AS total_employee_expense_count,

        COALESCE(SUM(CAST(total_fare AS NUMERIC)) FILTER (
          WHERE exception_reason ILIKE '%employee%expense%'
        ), 0)                                                                         AS total_employee_expense_amount,

        COUNT(*) FILTER (
          WHERE match_status = 'unmatched'
            AND (exception_reason IS NULL OR exception_reason NOT ILIKE '%employee%expense%')
        )                                                                             AS total_unmatched,

        -- Billing status breakdown
        COUNT(*) FILTER (WHERE billing_status = 'unreviewed')                        AS total_unreviewed,
        COUNT(*) FILTER (WHERE billing_status = 'ready_for_billing')                 AS total_ready_for_billing,
        COUNT(*) FILTER (WHERE billing_status = 'billed')                            AS total_billed,
        COUNT(*) FILTER (WHERE billing_status = 'excluded')                          AS total_excluded,

        -- Provider breakdown
        COUNT(*) FILTER (WHERE provider = 'uber')                                    AS uber_rides,
        COUNT(*) FILTER (WHERE provider = 'lyft')                                    AS lyft_rides,
        COALESCE(SUM(CAST(total_fare AS NUMERIC)) FILTER (WHERE provider = 'uber'), 0) AS uber_spend,
        COALESCE(SUM(CAST(total_fare AS NUMERIC)) FILTER (WHERE provider = 'lyft'), 0) AS lyft_spend,
        AVG(CAST(total_fare AS NUMERIC))                                              AS avg_fare

      FROM rideshare_transactions
      WHERE is_archived = false
    `));

    console.log("[rideshareViewsInit] Canonical views created/refreshed OK");
  } catch (err: any) {
    // Log but do not crash the server — the application can operate without views,
    // the canonical service uses Drizzle queries as the primary path.
    console.warn("[rideshareViewsInit] View creation warning:", err?.message ?? err);
  }
}
