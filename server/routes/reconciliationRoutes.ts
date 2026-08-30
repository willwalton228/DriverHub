/**
 * Invoice & DriverReturn Reconciliation — exception-report API.
 *
 * Mounts at: /api/reconciliation
 *
 * Ten validation rules:
 *  1  duplicate_dr            – DriverReturn records sharing the same redcap_id (or key fields)
 *  2  dr_no_move              – DriverReturn not linked to any Move
 *  3  move_no_dr              – Move (redcap import) with no linked DriverReturn
 *  4  date_mismatch           – DriverReturn.tripDate ≠ linked Move.tripDate
 *  5  duplicate_charges       – Multiple billable_charges rows for the same trip source_id
 *  6  dr_not_invoiced         – Completed+linked DriverReturn whose trip has no billed charge
 *  7  move_not_invoiced       – Move with revenue > 0 but no invoiced charge
 *  8  invoice_amount_mismatch – Invoice.totalAmount ≠ Σ line_items.totalPrice
 *  9  revenue_mismatch        – Trip.revenue ≠ Σ billable_charges.amount for that trip
 * 10  driver_pay_mismatch     – Trip.driverCost ≠ Trip.driverPay
 *
 * Endpoints:
 *   GET /api/reconciliation/summary          – count per rule for date range
 *   GET /api/reconciliation/exceptions       – paginated rows for one rule (?rule=X&dateFrom&dateTo&page&limit)
 */
import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = Router();

// ─── helpers ───────────────────────────────────────────────────────────────────

function dateFilter(col: string, from?: string, to?: string) {
  const parts: ReturnType<typeof sql>[] = [];
  if (from) parts.push(sql.raw(`AND ${col} >= '${from}'::date`));
  if (to)   parts.push(sql.raw(`AND ${col} <= '${to}'::date`));
  return parts;
}

// Safely build pagination
function pagination(page = "1", limit = "50") {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  return { offset: (p - 1) * l, limit: l, page: p };
}

// ─── SUMMARY ──────────────────────────────────────────────────────────────────

router.get("/summary", async (req, res) => {
  const { dateFrom, dateTo } = req.query as Record<string, string>;
  const df = dateFrom || "";
  const dt = dateTo   || "";

  try {
    // Run all 10 count queries in parallel using Promise.all
    const [
      r1, r2, r3, r4, r5, r6, r7, r8, r9, r10,
    ] = await Promise.all([

      // 1. Duplicate DRs
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM (
          SELECT redcap_id FROM driver_return_entries
          WHERE is_superseded = false
            ${df ? sql`AND trip_date >= ${df}::date` : sql``}
            ${dt ? sql`AND trip_date <= ${dt}::date` : sql``}
          GROUP BY redcap_id HAVING COUNT(*) > 1
        ) s`),

      // 2. DR without move
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM driver_return_entries
        WHERE is_superseded = false
          AND linked_trip_id IS NULL
          AND lower(status) NOT IN ('cancelled')
          ${df ? sql`AND trip_date >= ${df}::date` : sql``}
          ${dt ? sql`AND trip_date <= ${dt}::date` : sql``}`),

      // 3. Move without DR
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM trips t
        WHERE t.is_deleted = false
          AND t.source_system = 'redcap'
          ${df ? sql`AND t.trip_date::date >= ${df}::date` : sql``}
          ${dt ? sql`AND t.trip_date::date <= ${dt}::date` : sql``}
          AND NOT EXISTS (
            SELECT 1 FROM driver_return_entries d
            WHERE d.linked_trip_id = t.id AND d.is_superseded = false
          )`),

      // 4. Date mismatch
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM driver_return_entries dre
        JOIN trips t ON t.id = dre.linked_trip_id
        WHERE dre.is_superseded = false
          AND dre.trip_date IS NOT NULL
          AND dre.trip_date != t.trip_date::date
          ${df ? sql`AND dre.trip_date >= ${df}::date` : sql``}
          ${dt ? sql`AND dre.trip_date <= ${dt}::date` : sql``}`),

      // 5. Duplicate charges
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM (
          SELECT source_id FROM billable_charges
          WHERE source_type = 'trip'
            AND billing_status != 'voided'
            ${df ? sql`AND charge_date >= ${df}::date` : sql``}
            ${dt ? sql`AND charge_date <= ${dt}::date` : sql``}
          GROUP BY source_id HAVING COUNT(*) > 1
        ) s`),

      // 6. DR not invoiced (completed, linked, but trip has no invoiced charge)
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM driver_return_entries dre
        WHERE dre.is_superseded = false
          AND lower(dre.status) = 'completed'
          AND dre.linked_trip_id IS NOT NULL
          ${df ? sql`AND dre.trip_date >= ${df}::date` : sql``}
          ${dt ? sql`AND dre.trip_date <= ${dt}::date` : sql``}
          AND NOT EXISTS (
            SELECT 1 FROM billable_charges bc
            WHERE bc.source_id = dre.linked_trip_id
              AND bc.source_type = 'trip'
              AND bc.invoice_id IS NOT NULL
          )`),

      // 7. Move not invoiced
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM trips t
        WHERE t.is_deleted = false
          AND t.source_system = 'redcap'
          AND COALESCE(t.revenue, 0) > 0
          ${df ? sql`AND t.trip_date::date >= ${df}::date` : sql``}
          ${dt ? sql`AND t.trip_date::date <= ${dt}::date` : sql``}
          AND NOT EXISTS (
            SELECT 1 FROM billable_charges bc
            WHERE bc.source_id = t.id
              AND bc.source_type = 'trip'
              AND bc.invoice_id IS NOT NULL
          )`),

      // 8. Invoice amount mismatch
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM (
          SELECT i.id FROM invoices i
          LEFT JOIN invoice_line_items li ON li.invoice_id = i.id
          WHERE i.is_deleted = false
            ${df ? sql`AND i.invoice_date >= ${df}::date` : sql``}
            ${dt ? sql`AND i.invoice_date <= ${dt}::date` : sql``}
          GROUP BY i.id, i.total_amount
          HAVING ABS(i.total_amount::numeric - COALESCE(SUM(li.total_price::numeric), 0)) > 0.01
        ) s`),

      // 9. Revenue mismatch
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM (
          SELECT t.id FROM trips t
          LEFT JOIN billable_charges bc ON bc.source_id = t.id
            AND bc.source_type = 'trip' AND bc.billing_status != 'voided'
          WHERE t.is_deleted = false
            AND t.source_system = 'redcap'
            AND COALESCE(t.revenue, 0) > 0
            ${df ? sql`AND t.trip_date::date >= ${df}::date` : sql``}
            ${dt ? sql`AND t.trip_date::date <= ${dt}::date` : sql``}
          GROUP BY t.id, t.revenue
          HAVING ABS(COALESCE(t.revenue::numeric, 0) - COALESCE(SUM(bc.amount::numeric), 0)) > 0.01
        ) s`),

      // 10. Driver pay mismatch
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM trips t
        WHERE t.is_deleted = false
          AND t.source_system = 'redcap'
          AND COALESCE(t.driver_pay, 0) > 0
          AND COALESCE(t.driver_cost, 0) > 0
          AND ABS(COALESCE(t.driver_cost::numeric, 0) - COALESCE(t.driver_pay::numeric, 0)) > 0.01
          ${df ? sql`AND t.trip_date::date >= ${df}::date` : sql``}
          ${dt ? sql`AND t.trip_date::date <= ${dt}::date` : sql``}`),
    ]);

    const count = (r: any) => Number(r.rows[0]?.cnt ?? 0);

    return res.json({
      dateFrom: df || null,
      dateTo:   dt || null,
      rules: {
        duplicate_dr:            count(r1),
        dr_no_move:              count(r2),
        move_no_dr:              count(r3),
        date_mismatch:           count(r4),
        duplicate_charges:       count(r5),
        dr_not_invoiced:         count(r6),
        move_not_invoiced:       count(r7),
        invoice_amount_mismatch: count(r8),
        revenue_mismatch:        count(r9),
        driver_pay_mismatch:     count(r10),
      },
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── EXCEPTIONS ───────────────────────────────────────────────────────────────

router.get("/exceptions", async (req, res) => {
  const { rule, dateFrom, dateTo, page, limit } = req.query as Record<string, string>;
  const { offset, limit: lim } = pagination(page, limit);
  const df = dateFrom || "";
  const dt = dateTo   || "";

  if (!rule) return res.status(400).json({ error: "rule is required" });

  try {
    let rows: any[] = [];
    let total = 0;

    // ── 1. Duplicate DRs ──────────────────────────────────────────────────────
    if (rule === "duplicate_dr") {
      const q = await db.execute(sql`
        SELECT
          redcap_id,
          COUNT(*)                                         AS occurrence_count,
          STRING_AGG(id, ', ' ORDER BY created_at)        AS entry_ids,
          MIN(driver_name)                                 AS driver_name,
          MIN(trip_date::text)                             AS trip_date,
          MIN(dealer_name)                                 AS dealer_name,
          SUM(customer_total)                              AS total_billed,
          MIN(status)                                      AS sample_status,
          COUNT(*) OVER ()                                 AS total_count
        FROM driver_return_entries
        WHERE is_superseded = false
          ${df ? sql`AND trip_date >= ${df}::date` : sql``}
          ${dt ? sql`AND trip_date <= ${dt}::date` : sql``}
        GROUP BY redcap_id
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC, MIN(trip_date) DESC
        LIMIT ${lim} OFFSET ${offset}`);
      rows  = q.rows as any[];
      total = Number(rows[0]?.total_count ?? rows.length);
    }

    // ── 2. DR without Move ────────────────────────────────────────────────────
    else if (rule === "dr_no_move") {
      const q = await db.execute(sql`
        SELECT
          id, redcap_id, driver_name, trip_date, dealer_name,
          status, customer_total, customer_billed,
          trip_type_group, source_system_key,
          COUNT(*) OVER () AS total_count
        FROM driver_return_entries
        WHERE is_superseded = false
          AND linked_trip_id IS NULL
          AND lower(status) NOT IN ('cancelled')
          ${df ? sql`AND trip_date >= ${df}::date` : sql``}
          ${dt ? sql`AND trip_date <= ${dt}::date` : sql``}
        ORDER BY trip_date DESC
        LIMIT ${lim} OFFSET ${offset}`);
      rows  = q.rows as any[];
      total = Number(rows[0]?.total_count ?? rows.length);
    }

    // ── 3. Move without DR ────────────────────────────────────────────────────
    else if (rule === "move_no_dr") {
      const q = await db.execute(sql`
        SELECT
          t.id, t.move_number, t.trip_date::date AS trip_date,
          t.status, t.revenue, t.customer_charges,
          t.driver_pay, t.gross_profit,
          c.name AS customer_name,
          COUNT(*) OVER () AS total_count
        FROM trips t
        LEFT JOIN customers c ON c.id = t.customer_id
        WHERE t.is_deleted = false
          AND t.source_system = 'redcap'
          ${df ? sql`AND t.trip_date::date >= ${df}::date` : sql``}
          ${dt ? sql`AND t.trip_date::date <= ${dt}::date` : sql``}
          AND NOT EXISTS (
            SELECT 1 FROM driver_return_entries d
            WHERE d.linked_trip_id = t.id AND d.is_superseded = false
          )
        ORDER BY t.trip_date DESC
        LIMIT ${lim} OFFSET ${offset}`);
      rows  = q.rows as any[];
      total = Number(rows[0]?.total_count ?? rows.length);
    }

    // ── 4. Date Mismatch ──────────────────────────────────────────────────────
    else if (rule === "date_mismatch") {
      const q = await db.execute(sql`
        SELECT
          dre.id               AS dr_id,
          dre.driver_name,
          dre.trip_date        AS dr_date,
          t.trip_date::date    AS move_date,
          t.move_number,
          t.id                 AS trip_id,
          dre.customer_total,
          dre.dealer_name,
          (dre.trip_date - t.trip_date::date) AS day_delta,
          COUNT(*) OVER ()     AS total_count
        FROM driver_return_entries dre
        JOIN trips t ON t.id = dre.linked_trip_id
        WHERE dre.is_superseded = false
          AND dre.trip_date IS NOT NULL
          AND dre.trip_date != t.trip_date::date
          ${df ? sql`AND dre.trip_date >= ${df}::date` : sql``}
          ${dt ? sql`AND dre.trip_date <= ${dt}::date` : sql``}
        ORDER BY ABS(dre.trip_date - t.trip_date::date) DESC, dre.trip_date DESC
        LIMIT ${lim} OFFSET ${offset}`);
      rows  = q.rows as any[];
      total = Number(rows[0]?.total_count ?? rows.length);
    }

    // ── 5. Duplicate Charges ──────────────────────────────────────────────────
    else if (rule === "duplicate_charges") {
      const q = await db.execute(sql`
        SELECT
          bc.source_id         AS trip_id,
          t.move_number,
          COUNT(bc.id)         AS charge_count,
          SUM(bc.amount)       AS total_charged,
          MAX(bc.charge_date)  AS latest_charge_date,
          STRING_AGG(bc.id, ', ' ORDER BY bc.created_at) AS charge_ids,
          COUNT(*) OVER ()     AS total_count
        FROM billable_charges bc
        LEFT JOIN trips t ON t.id = bc.source_id
        WHERE bc.source_type = 'trip'
          AND bc.billing_status != 'voided'
          ${df ? sql`AND bc.charge_date >= ${df}::date` : sql``}
          ${dt ? sql`AND bc.charge_date <= ${dt}::date` : sql``}
        GROUP BY bc.source_id, t.move_number
        HAVING COUNT(bc.id) > 1
        ORDER BY COUNT(bc.id) DESC
        LIMIT ${lim} OFFSET ${offset}`);
      rows  = q.rows as any[];
      total = Number(rows[0]?.total_count ?? rows.length);
    }

    // ── 6. DR Not Invoiced ────────────────────────────────────────────────────
    else if (rule === "dr_not_invoiced") {
      const q = await db.execute(sql`
        SELECT
          dre.id, dre.driver_name, dre.trip_date, dre.dealer_name,
          dre.customer_total, dre.customer_billed, dre.linked_trip_id,
          t.move_number, t.revenue AS trip_revenue,
          COUNT(*) OVER () AS total_count
        FROM driver_return_entries dre
        LEFT JOIN trips t ON t.id = dre.linked_trip_id
        WHERE dre.is_superseded = false
          AND lower(dre.status) = 'completed'
          AND dre.linked_trip_id IS NOT NULL
          ${df ? sql`AND dre.trip_date >= ${df}::date` : sql``}
          ${dt ? sql`AND dre.trip_date <= ${dt}::date` : sql``}
          AND NOT EXISTS (
            SELECT 1 FROM billable_charges bc
            WHERE bc.source_id = dre.linked_trip_id
              AND bc.source_type = 'trip'
              AND bc.invoice_id IS NOT NULL
          )
        ORDER BY dre.trip_date DESC
        LIMIT ${lim} OFFSET ${offset}`);
      rows  = q.rows as any[];
      total = Number(rows[0]?.total_count ?? rows.length);
    }

    // ── 7. Move Not Invoiced ──────────────────────────────────────────────────
    else if (rule === "move_not_invoiced") {
      const q = await db.execute(sql`
        SELECT
          t.id, t.move_number, t.trip_date::date AS trip_date,
          t.status, t.revenue, t.customer_charges, t.gross_profit,
          c.name AS customer_name,
          COUNT(*) OVER () AS total_count
        FROM trips t
        LEFT JOIN customers c ON c.id = t.customer_id
        WHERE t.is_deleted = false
          AND t.source_system = 'redcap'
          AND COALESCE(t.revenue, 0) > 0
          ${df ? sql`AND t.trip_date::date >= ${df}::date` : sql``}
          ${dt ? sql`AND t.trip_date::date <= ${dt}::date` : sql``}
          AND NOT EXISTS (
            SELECT 1 FROM billable_charges bc
            WHERE bc.source_id = t.id
              AND bc.source_type = 'trip'
              AND bc.invoice_id IS NOT NULL
          )
        ORDER BY t.trip_date DESC
        LIMIT ${lim} OFFSET ${offset}`);
      rows  = q.rows as any[];
      total = Number(rows[0]?.total_count ?? rows.length);
    }

    // ── 8. Invoice Amount Mismatch ────────────────────────────────────────────
    else if (rule === "invoice_amount_mismatch") {
      const q = await db.execute(sql`
        SELECT
          i.id, i.invoice_number, i.customer_name, i.invoice_date,
          i.status,
          i.total_amount::numeric                             AS invoice_total,
          COALESCE(SUM(li.total_price::numeric), 0)          AS line_items_total,
          ABS(i.total_amount::numeric - COALESCE(SUM(li.total_price::numeric), 0)) AS variance,
          COUNT(*) OVER ()                                    AS total_count
        FROM invoices i
        LEFT JOIN invoice_line_items li ON li.invoice_id = i.id
        WHERE i.is_deleted = false
          ${df ? sql`AND i.invoice_date >= ${df}::date` : sql``}
          ${dt ? sql`AND i.invoice_date <= ${dt}::date` : sql``}
        GROUP BY i.id, i.invoice_number, i.customer_name, i.invoice_date, i.status, i.total_amount
        HAVING ABS(i.total_amount::numeric - COALESCE(SUM(li.total_price::numeric), 0)) > 0.01
        ORDER BY variance DESC
        LIMIT ${lim} OFFSET ${offset}`);
      rows  = q.rows as any[];
      total = Number(rows[0]?.total_count ?? rows.length);
    }

    // ── 9. Revenue Mismatch ───────────────────────────────────────────────────
    else if (rule === "revenue_mismatch") {
      const q = await db.execute(sql`
        SELECT
          t.id, t.move_number, t.trip_date::date AS trip_date,
          t.status, t.revenue::numeric            AS trip_revenue,
          COALESCE(SUM(bc.amount::numeric), 0)   AS charged_amount,
          ABS(COALESCE(t.revenue::numeric, 0) - COALESCE(SUM(bc.amount::numeric), 0)) AS variance,
          c.name                                  AS customer_name,
          COUNT(*) OVER ()                        AS total_count
        FROM trips t
        LEFT JOIN customers c ON c.id = t.customer_id
        LEFT JOIN billable_charges bc ON bc.source_id = t.id
          AND bc.source_type = 'trip' AND bc.billing_status != 'voided'
        WHERE t.is_deleted = false
          AND t.source_system = 'redcap'
          AND COALESCE(t.revenue, 0) > 0
          ${df ? sql`AND t.trip_date::date >= ${df}::date` : sql``}
          ${dt ? sql`AND t.trip_date::date <= ${dt}::date` : sql``}
        GROUP BY t.id, t.move_number, t.trip_date, t.status, t.revenue, c.name
        HAVING ABS(COALESCE(t.revenue::numeric, 0) - COALESCE(SUM(bc.amount::numeric), 0)) > 0.01
        ORDER BY variance DESC
        LIMIT ${lim} OFFSET ${offset}`);
      rows  = q.rows as any[];
      total = Number(rows[0]?.total_count ?? rows.length);
    }

    // ── 10. Driver Pay Mismatch ───────────────────────────────────────────────
    else if (rule === "driver_pay_mismatch") {
      const q = await db.execute(sql`
        SELECT
          t.id, t.move_number, t.trip_date::date AS trip_date,
          t.status,
          t.driver_pay::numeric    AS driver_pay,
          t.driver_cost::numeric   AS driver_cost,
          ABS(COALESCE(t.driver_cost::numeric, 0) - COALESCE(t.driver_pay::numeric, 0)) AS variance,
          d.first_name || ' ' || d.last_name AS driver_name,
          c.name AS customer_name,
          COUNT(*) OVER () AS total_count
        FROM trips t
        LEFT JOIN drivers d ON d.id = t.driver_id
        LEFT JOIN customers c ON c.id = t.customer_id
        WHERE t.is_deleted = false
          AND t.source_system = 'redcap'
          AND COALESCE(t.driver_pay, 0) > 0
          AND COALESCE(t.driver_cost, 0) > 0
          AND ABS(COALESCE(t.driver_cost::numeric, 0) - COALESCE(t.driver_pay::numeric, 0)) > 0.01
          ${df ? sql`AND t.trip_date::date >= ${df}::date` : sql``}
          ${dt ? sql`AND t.trip_date::date <= ${dt}::date` : sql``}
        ORDER BY variance DESC
        LIMIT ${lim} OFFSET ${offset}`);
      rows  = q.rows as any[];
      total = Number(rows[0]?.total_count ?? rows.length);
    }

    else {
      return res.status(400).json({ error: `Unknown rule: ${rule}` });
    }

    // Strip the window-function column before sending
    const data = rows.map(({ total_count, ...rest }) => rest);
    return res.json({ rule, total, page: Number(page || 1), limit: lim, data });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
