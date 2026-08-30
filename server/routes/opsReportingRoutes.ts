/**
 * Operational Reporting — aggregation API for imported Move data.
 *
 * Sources: trips table (populated by Move Import), driver_return_entries,
 *          wiw_shifts (for clocked hours), drivers/users/customers for names.
 *
 * Mounts at: /api/ops-reporting
 */
import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = Router();

// ── MOVE REPORTING ─────────────────────────────────────────────────────────────

/** Aggregate KPIs across all moves matching the filter */
router.get("/moves/summary", async (req, res) => {
  const { dateFrom, dateTo, accountId, driverId } = req.query as Record<string, string>;
  try {
    const rows = await db.execute(sql`
      SELECT
        COUNT(*)                                                                  AS total_moves,
        COUNT(*) FILTER (WHERE lower(t.status) = 'completed')                    AS completed_moves,
        COUNT(*) FILTER (WHERE lower(t.status) = 'cancelled')                    AS cancelled_moves,
        COALESCE(SUM(t.revenue),       0)::numeric                               AS revenue,
        COALESCE(SUM(t.driver_cost),   0)::numeric                               AS driver_cost,
        COALESCE(SUM(t.gross_profit),  0)::numeric                               AS gross_profit,
        CASE WHEN SUM(t.revenue) > 0
          THEN ROUND(SUM(t.gross_profit) / SUM(t.revenue) * 100, 2) END          AS gross_margin_pct,
        ROUND(AVG(t.move_minutes)::numeric, 1)                                   AS avg_move_minutes,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(COALESCE(SUM(t.revenue), 0) / COUNT(*), 2) END             AS avg_rev_per_move,
        COUNT(DISTINCT DATE_TRUNC('day', t.trip_date))                           AS active_days
      FROM trips t
      WHERE 1=1
        ${dateFrom  ? sql`AND t.trip_date >= ${dateFrom}::date`          : sql``}
        ${dateTo    ? sql`AND t.trip_date <= ${dateTo}::date`            : sql``}
        ${accountId ? sql`AND t.customer_id = ${accountId}`              : sql``}
        ${driverId  ? sql`AND t.driver_id   = ${driverId}`               : sql``}
    `);
    return res.json(rows.rows[0] ?? {});
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/** Daily/weekly/monthly trend of move counts + revenue */
router.get("/moves/trend", async (req, res) => {
  const { dateFrom, dateTo, groupBy = "day", accountId, driverId } = req.query as Record<string, string>;
  const trunc = groupBy === "month" ? "month" : groupBy === "week" ? "week" : "day";
  try {
    const rows = await db.execute(sql`
      SELECT
        DATE_TRUNC(${trunc}, t.trip_date::timestamp)  AS period,
        COUNT(*)                                      AS moves,
        COUNT(*) FILTER (WHERE lower(t.status) = 'completed') AS completed,
        COUNT(*) FILTER (WHERE lower(t.status) = 'cancelled') AS cancelled,
        COALESCE(SUM(t.revenue),      0)::numeric     AS revenue,
        COALESCE(SUM(t.gross_profit), 0)::numeric     AS gross_profit
      FROM trips t
      WHERE t.trip_date IS NOT NULL
        ${dateFrom  ? sql`AND t.trip_date >= ${dateFrom}::date`  : sql``}
        ${dateTo    ? sql`AND t.trip_date <= ${dateTo}::date`    : sql``}
        ${accountId ? sql`AND t.customer_id = ${accountId}`      : sql``}
        ${driverId  ? sql`AND t.driver_id   = ${driverId}`       : sql``}
      GROUP BY 1
      ORDER BY 1
    `);
    return res.json(rows.rows);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/** Paginated drill-down list of individual moves */
router.get("/moves/list", async (req, res) => {
  const {
    dateFrom, dateTo, accountId, driverId,
    status, page = "1", pageSize = "50",
  } = req.query as Record<string, string>;
  const limit  = Math.min(200, Math.max(1, parseInt(pageSize)));
  const offset = (Math.max(1, parseInt(page)) - 1) * limit;
  try {
    const [countRows, dataRows] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*) AS total FROM trips t
        WHERE 1=1
          ${dateFrom  ? sql`AND t.trip_date >= ${dateFrom}::date`              : sql``}
          ${dateTo    ? sql`AND t.trip_date <= ${dateTo}::date`                : sql``}
          ${accountId ? sql`AND t.customer_id = ${accountId}`                  : sql``}
          ${driverId  ? sql`AND t.driver_id   = ${driverId}`                   : sql``}
          ${status    ? sql`AND lower(t.status) = ${status.toLowerCase()}`     : sql``}
      `),
      db.execute(sql`
        SELECT
          t.id, t.move_number, t.external_move_id, t.trip_date, t.status,
          t.source_system, t.import_batch_id,
          CONCAT(u.first_name, ' ', u.last_name) AS driver_name,
          c.customer_name                         AS account_name,
          t.revenue::numeric, t.driver_cost::numeric, t.gross_profit::numeric,
          t.gross_margin::numeric, t.move_minutes, t.move_hours::numeric
        FROM trips t
        LEFT JOIN drivers   d  ON d.id = t.driver_id
        LEFT JOIN users     u  ON u.id = d.user_id
        LEFT JOIN customers c  ON c.id = t.customer_id
        WHERE 1=1
          ${dateFrom  ? sql`AND t.trip_date >= ${dateFrom}::date`              : sql``}
          ${dateTo    ? sql`AND t.trip_date <= ${dateTo}::date`                : sql``}
          ${accountId ? sql`AND t.customer_id = ${accountId}`                  : sql``}
          ${driverId  ? sql`AND t.driver_id   = ${driverId}`                   : sql``}
          ${status    ? sql`AND lower(t.status) = ${status.toLowerCase()}`     : sql``}
        ORDER BY t.trip_date DESC NULLS LAST, t.id
        LIMIT  ${limit}
        OFFSET ${offset}
      `),
    ]);
    return res.json({
      total:    parseInt(String(countRows.rows[0]?.total ?? "0")),
      page:     parseInt(page),
      pageSize: limit,
      rows:     dataRows.rows,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ── ACCOUNT REPORTING ──────────────────────────────────────────────────────────

/** Per-account aggregated table */
router.get("/accounts/list", async (req, res) => {
  const { dateFrom, dateTo, search, page = "1", pageSize = "50" } = req.query as Record<string, string>;
  const limit  = Math.min(200, Math.max(1, parseInt(pageSize)));
  const offset = (Math.max(1, parseInt(page)) - 1) * limit;
  const searchPat = search ? `%${search}%` : null;
  try {
    const [countRows, dataRows] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(DISTINCT t.customer_id) AS total
        FROM trips t
        JOIN customers c ON c.id = t.customer_id
        WHERE t.customer_id IS NOT NULL
          ${dateFrom   ? sql`AND t.trip_date >= ${dateFrom}::date`   : sql``}
          ${dateTo     ? sql`AND t.trip_date <= ${dateTo}::date`     : sql``}
          ${searchPat  ? sql`AND c.customer_name ILIKE ${searchPat}` : sql``}
      `),
      db.execute(sql`
        WITH trip_agg AS (
          SELECT
            t.customer_id,
            COUNT(*)                                                                AS total_moves,
            COUNT(*) FILTER (WHERE lower(t.status) = 'completed')                  AS completed_moves,
            COALESCE(SUM(t.revenue),      0)::numeric                              AS revenue,
            COALESCE(SUM(t.driver_cost),  0)::numeric                              AS driver_cost,
            COALESCE(SUM(t.gross_profit), 0)::numeric                              AS gross_profit,
            CASE WHEN SUM(t.revenue) > 0
              THEN ROUND(SUM(t.gross_profit) / SUM(t.revenue) * 100, 2) END        AS gross_margin_pct,
            CASE WHEN COUNT(*) > 0
              THEN ROUND(COALESCE(SUM(t.revenue), 0) / COUNT(*), 2) END           AS avg_rev_per_move
          FROM trips t
          WHERE t.customer_id IS NOT NULL
            ${dateFrom ? sql`AND t.trip_date >= ${dateFrom}::date` : sql``}
            ${dateTo   ? sql`AND t.trip_date <= ${dateTo}::date`   : sql``}
          GROUP BY t.customer_id
          HAVING COUNT(*) > 0
        ),
        dr_agg AS (
          SELECT
            linked_dealer_id,
            COALESCE(SUM(customer_billed), 0)::numeric  AS driver_return_costs,
            COUNT(*)                                     AS driver_return_count
          FROM driver_return_entries
          WHERE is_superseded = false AND linked_dealer_id IS NOT NULL
            ${dateFrom ? sql`AND trip_date >= ${dateFrom}::date` : sql``}
            ${dateTo   ? sql`AND trip_date <= ${dateTo}::date`   : sql``}
          GROUP BY linked_dealer_id
        )
        SELECT
          c.id                                             AS customer_id,
          c.customer_name                                  AS account_name,
          c.account_number,
          ta.total_moves,
          ta.completed_moves,
          ta.revenue,
          ta.driver_cost,
          ta.gross_profit,
          ta.gross_margin_pct,
          ta.avg_rev_per_move,
          COALESCE(dr.driver_return_costs,  0)             AS driver_return_costs,
          COALESCE(dr.driver_return_count,  0)             AS driver_return_count
        FROM customers c
        INNER JOIN trip_agg ta ON ta.customer_id = c.id
        LEFT  JOIN dr_agg   dr ON dr.linked_dealer_id = c.id
        ${searchPat ? sql`WHERE c.customer_name ILIKE ${searchPat}` : sql``}
        ORDER BY ta.revenue DESC
        LIMIT  ${limit}
        OFFSET ${offset}
      `),
    ]);
    return res.json({
      total:    parseInt(String(countRows.rows[0]?.total ?? "0")),
      page:     parseInt(page),
      pageSize: limit,
      rows:     dataRows.rows,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/** Single-account drill-down: summary + top drivers + recent moves */
router.get("/accounts/:id/detail", async (req, res) => {
  const { dateFrom, dateTo } = req.query as Record<string, string>;
  const accountId = req.params.id;
  try {
    const [summaryRows, topDriverRows, recentMoveRows, drRows] = await Promise.all([
      db.execute(sql`
        SELECT
          c.id, c.customer_name, c.account_number,
          COUNT(t.id)                                                                     AS total_moves,
          COUNT(t.id) FILTER (WHERE lower(t.status) = 'completed')                       AS completed_moves,
          COUNT(t.id) FILTER (WHERE lower(t.status) = 'cancelled')                       AS cancelled_moves,
          COALESCE(SUM(t.revenue),      0)::numeric                                      AS revenue,
          COALESCE(SUM(t.driver_cost),  0)::numeric                                      AS driver_cost,
          COALESCE(SUM(t.gross_profit), 0)::numeric                                      AS gross_profit,
          CASE WHEN SUM(t.revenue) > 0
            THEN ROUND(SUM(t.gross_profit) / SUM(t.revenue) * 100, 2) END               AS gross_margin_pct,
          ROUND(AVG(t.move_minutes)::numeric, 1)                                         AS avg_move_minutes
        FROM customers c
        LEFT JOIN trips t ON t.customer_id = c.id AND 1=1
          ${dateFrom ? sql`AND t.trip_date >= ${dateFrom}::date` : sql``}
          ${dateTo   ? sql`AND t.trip_date <= ${dateTo}::date`   : sql``}
        WHERE c.id = ${accountId}
        GROUP BY c.id, c.customer_name, c.account_number
      `),
      db.execute(sql`
        SELECT
          d.id AS driver_id,
          CONCAT(u.first_name, ' ', u.last_name) AS driver_name,
          COUNT(t.id)                            AS move_count,
          COALESCE(SUM(t.revenue),      0)::numeric AS revenue,
          COALESCE(SUM(t.gross_profit), 0)::numeric AS gross_profit
        FROM trips t
        JOIN drivers  d ON d.id = t.driver_id
        JOIN users    u ON u.id = d.user_id
        WHERE t.customer_id = ${accountId}
          ${dateFrom ? sql`AND t.trip_date >= ${dateFrom}::date` : sql``}
          ${dateTo   ? sql`AND t.trip_date <= ${dateTo}::date`   : sql``}
        GROUP BY d.id, u.first_name, u.last_name
        ORDER BY move_count DESC
        LIMIT 10
      `),
      db.execute(sql`
        SELECT
          t.id, t.move_number, t.trip_date, t.status,
          CONCAT(u.first_name, ' ', u.last_name) AS driver_name,
          t.revenue::numeric, t.gross_profit::numeric, t.move_minutes
        FROM trips t
        LEFT JOIN drivers d ON d.id = t.driver_id
        LEFT JOIN users   u ON u.id = d.user_id
        WHERE t.customer_id = ${accountId}
          ${dateFrom ? sql`AND t.trip_date >= ${dateFrom}::date` : sql``}
          ${dateTo   ? sql`AND t.trip_date <= ${dateTo}::date`   : sql``}
        ORDER BY t.trip_date DESC NULLS LAST
        LIMIT 20
      `),
      db.execute(sql`
        SELECT
          COALESCE(SUM(customer_billed), 0)::numeric AS driver_return_costs,
          COUNT(*)                                   AS driver_return_count
        FROM driver_return_entries
        WHERE linked_dealer_id = ${accountId} AND is_superseded = false
          ${dateFrom ? sql`AND trip_date >= ${dateFrom}::date` : sql``}
          ${dateTo   ? sql`AND trip_date <= ${dateTo}::date`   : sql``}
      `),
    ]);
    const summary = summaryRows.rows[0] ?? null;
    if (summary) {
      summary.driver_return_costs = drRows.rows[0]?.driver_return_costs ?? 0;
      summary.driver_return_count = drRows.rows[0]?.driver_return_count ?? 0;
    }
    return res.json({ summary, topDrivers: topDriverRows.rows, recentMoves: recentMoveRows.rows });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ── DRIVER REPORTING ───────────────────────────────────────────────────────────

/** Per-driver aggregated table with WIW clocked hours */
router.get("/drivers/list", async (req, res) => {
  const { dateFrom, dateTo, search, page = "1", pageSize = "50" } = req.query as Record<string, string>;
  const limit    = Math.min(200, Math.max(1, parseInt(pageSize)));
  const offset   = (Math.max(1, parseInt(page)) - 1) * limit;
  const searchPat = search ? `%${search}%` : null;
  try {
    const [countRows, dataRows] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(DISTINCT t.driver_id) AS total
        FROM trips t
        JOIN drivers d ON d.id = t.driver_id
        JOIN users   u ON u.id = d.user_id
        WHERE t.driver_id IS NOT NULL
          ${dateFrom  ? sql`AND t.trip_date >= ${dateFrom}::date` : sql``}
          ${dateTo    ? sql`AND t.trip_date <= ${dateTo}::date`   : sql``}
          ${searchPat ? sql`AND CONCAT(u.first_name, ' ', u.last_name) ILIKE ${searchPat}` : sql``}
      `),
      db.execute(sql`
        WITH driver_moves AS (
          SELECT
            t.driver_id,
            COUNT(*)                                                                      AS total_moves,
            COUNT(*) FILTER (WHERE lower(t.status) = 'completed')                        AS completed_moves,
            COUNT(*) FILTER (WHERE lower(t.status) = 'cancelled')                        AS cancelled_moves,
            COALESCE(SUM(t.revenue),      0)::numeric                                    AS revenue,
            COALESCE(SUM(t.driver_pay),   0)::numeric                                    AS driver_pay,
            COALESCE(SUM(t.gross_profit), 0)::numeric                                    AS gross_profit,
            ROUND(COALESCE(SUM(t.move_hours::numeric), 0), 2)                            AS move_hours
          FROM trips t
          WHERE t.driver_id IS NOT NULL
            ${dateFrom ? sql`AND t.trip_date >= ${dateFrom}::date` : sql``}
            ${dateTo   ? sql`AND t.trip_date <= ${dateTo}::date`   : sql``}
          GROUP BY t.driver_id
          HAVING COUNT(*) > 0
        ),
        wiw_hours AS (
          SELECT
            wu.driver_id,
            ROUND(SUM(ws.scheduled_minutes) / 60.0, 2) AS clocked_hours
          FROM wiw_users wu
          JOIN wiw_shifts ws ON ws.wiw_user_id = wu.id
          WHERE ws.status != 'deleted'
            AND COALESCE(ws.scheduled_minutes, 0) > 0
            ${dateFrom ? sql`AND ws.start_time >= ${dateFrom}::timestamptz`                          : sql``}
            ${dateTo   ? sql`AND ws.start_time <= ${dateTo}::timestamptz + INTERVAL '1 day'`         : sql``}
          GROUP BY wu.driver_id
        )
        SELECT
          d.id                                              AS driver_id,
          CONCAT(u.first_name, ' ', u.last_name)           AS driver_name,
          d.driver_type,
          d.employment_type,
          dm.total_moves,
          dm.completed_moves,
          dm.cancelled_moves,
          dm.revenue,
          dm.driver_pay,
          dm.gross_profit,
          dm.move_hours,
          COALESCE(wh.clocked_hours, 0)                    AS clocked_hours,
          CASE WHEN COALESCE(wh.clocked_hours, 0) > 0
            THEN ROUND(dm.move_hours / wh.clocked_hours * 100, 1) END   AS utilization_pct,
          CASE WHEN dm.move_hours > 0
            THEN ROUND(dm.total_moves / dm.move_hours, 2) END           AS moves_per_hour
        FROM driver_moves dm
        JOIN drivers d ON d.id = dm.driver_id
        JOIN users   u ON u.id = d.user_id
        LEFT JOIN wiw_hours wh ON wh.driver_id = d.id
        ${searchPat ? sql`WHERE CONCAT(u.first_name, ' ', u.last_name) ILIKE ${searchPat}` : sql``}
        ORDER BY dm.revenue DESC
        LIMIT  ${limit}
        OFFSET ${offset}
      `),
    ]);
    return res.json({
      total:    parseInt(String(countRows.rows[0]?.total ?? "0")),
      page:     parseInt(page),
      pageSize: limit,
      rows:     dataRows.rows,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/** Single-driver drill-down: summary + WIW hours + top accounts + recent moves */
router.get("/drivers/:id/detail", async (req, res) => {
  const { dateFrom, dateTo } = req.query as Record<string, string>;
  const driverId = req.params.id;
  try {
    const [summaryRows, wiwRows, topAccountRows, recentMoveRows] = await Promise.all([
      db.execute(sql`
        SELECT
          CONCAT(u.first_name, ' ', u.last_name) AS driver_name,
          d.driver_type, d.employment_type,
          COUNT(t.id)                                                                    AS total_moves,
          COUNT(t.id) FILTER (WHERE lower(t.status) = 'completed')                      AS completed_moves,
          COUNT(t.id) FILTER (WHERE lower(t.status) = 'cancelled')                      AS cancelled_moves,
          COALESCE(SUM(t.revenue),      0)::numeric                                     AS revenue,
          COALESCE(SUM(t.driver_pay),   0)::numeric                                     AS driver_pay,
          COALESCE(SUM(t.gross_profit), 0)::numeric                                     AS gross_profit,
          ROUND(COALESCE(SUM(t.move_hours::numeric), 0), 2)                             AS move_hours,
          ROUND(AVG(t.move_minutes)::numeric, 1)                                        AS avg_move_minutes
        FROM drivers d
        JOIN users u ON u.id = d.user_id
        LEFT JOIN trips t ON t.driver_id = d.id AND 1=1
          ${dateFrom ? sql`AND t.trip_date >= ${dateFrom}::date` : sql``}
          ${dateTo   ? sql`AND t.trip_date <= ${dateTo}::date`   : sql``}
        WHERE d.id = ${driverId}
        GROUP BY u.first_name, u.last_name, d.driver_type, d.employment_type
      `),
      db.execute(sql`
        SELECT ROUND(COALESCE(SUM(ws.scheduled_minutes), 0) / 60.0, 2) AS clocked_hours
        FROM drivers  d
        JOIN wiw_users  wu ON wu.driver_id = d.id
        JOIN wiw_shifts ws ON ws.wiw_user_id = wu.id
        WHERE d.id = ${driverId}
          AND ws.status != 'deleted'
          AND COALESCE(ws.scheduled_minutes, 0) > 0
          ${dateFrom ? sql`AND ws.start_time >= ${dateFrom}::timestamptz`                        : sql``}
          ${dateTo   ? sql`AND ws.start_time <= ${dateTo}::timestamptz + INTERVAL '1 day'`       : sql``}
      `),
      db.execute(sql`
        SELECT
          c.id AS customer_id, c.customer_name AS account_name,
          COUNT(t.id) AS move_count,
          COALESCE(SUM(t.revenue), 0)::numeric AS revenue
        FROM trips t
        JOIN customers c ON c.id = t.customer_id
        WHERE t.driver_id = ${driverId}
          ${dateFrom ? sql`AND t.trip_date >= ${dateFrom}::date` : sql``}
          ${dateTo   ? sql`AND t.trip_date <= ${dateTo}::date`   : sql``}
        GROUP BY c.id, c.customer_name
        ORDER BY move_count DESC
        LIMIT 8
      `),
      db.execute(sql`
        SELECT
          t.id, t.move_number, t.trip_date, t.status,
          c.customer_name AS account_name,
          t.revenue::numeric, t.gross_profit::numeric, t.move_minutes
        FROM trips t
        LEFT JOIN customers c ON c.id = t.customer_id
        WHERE t.driver_id = ${driverId}
          ${dateFrom ? sql`AND t.trip_date >= ${dateFrom}::date` : sql``}
          ${dateTo   ? sql`AND t.trip_date <= ${dateTo}::date`   : sql``}
        ORDER BY t.trip_date DESC NULLS LAST
        LIMIT 20
      `),
    ]);

    const summary = summaryRows.rows[0] ?? null;
    if (summary) {
      const ch = parseFloat(String(wiwRows.rows[0]?.clocked_hours ?? "0"));
      const mh = parseFloat(String(summary.move_hours ?? "0"));
      summary.clocked_hours    = ch;
      summary.utilization_pct  = ch > 0 ? ((mh / ch) * 100).toFixed(1) : null;
      summary.moves_per_hour   = mh > 0 ? (parseFloat(String(summary.total_moves)) / mh).toFixed(2) : null;
    }
    return res.json({ summary, topAccounts: topAccountRows.rows, recentMoves: recentMoveRows.rows });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ── DASHBOARD WIDGETS (pre-aggregated, last 30 days) ─────────────────────────

router.get("/widgets/moves-kpi", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        COUNT(*)                                                     AS total_moves,
        COUNT(*) FILTER (WHERE lower(status) = 'completed')         AS completed_moves,
        COUNT(*) FILTER (WHERE lower(status) = 'cancelled')         AS cancelled_moves,
        COALESCE(SUM(revenue),      0)::numeric                     AS revenue,
        COALESCE(SUM(gross_profit), 0)::numeric                     AS gross_profit,
        CASE WHEN SUM(revenue) > 0
          THEN ROUND(SUM(gross_profit) / SUM(revenue) * 100, 1) END AS gross_margin_pct
      FROM trips
      WHERE trip_date >= NOW() - INTERVAL '30 days'
    `);
    return res.json(rows.rows[0] ?? {});
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.get("/widgets/top-accounts", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        c.customer_name AS account_name,
        COUNT(t.id)     AS moves,
        COALESCE(SUM(t.revenue), 0)::numeric AS revenue
      FROM trips t
      JOIN customers c ON c.id = t.customer_id
      WHERE t.trip_date >= NOW() - INTERVAL '30 days'
        AND t.customer_id IS NOT NULL
      GROUP BY c.id, c.customer_name
      ORDER BY revenue DESC
      LIMIT 5
    `);
    return res.json(rows.rows);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.get("/widgets/driver-productivity", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        CONCAT(u.first_name, ' ', u.last_name)       AS driver_name,
        COUNT(t.id)                                  AS moves,
        COALESCE(SUM(t.revenue), 0)::numeric         AS revenue,
        ROUND(COALESCE(SUM(t.move_hours::numeric), 0), 1) AS move_hours
      FROM trips t
      JOIN drivers d ON d.id = t.driver_id
      JOIN users   u ON u.id = d.user_id
      WHERE t.trip_date >= NOW() - INTERVAL '30 days'
        AND t.driver_id IS NOT NULL
      GROUP BY d.id, u.first_name, u.last_name
      ORDER BY moves DESC
      LIMIT 5
    `);
    return res.json(rows.rows);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ── Feature 3.2: Driver Intelligence ─────────────────────────────────────────
// Single-driver operational intelligence: workload, execution, DriverReturn,
// WIW hours, claims. WIW is the sole authoritative source for worked hours —
// if WIW data is unavailable the status field explains why; no silent fallback.
router.get("/drivers/intelligence", async (req: any, res) => {
  try {
    const { driverId, startDate, endDate, compareStartDate, compareEndDate } = req.query as Record<string, string>;
    if (!driverId) return res.status(400).json({ error: "driverId is required" });
    if (!startDate || !endDate) return res.status(400).json({ error: "startDate and endDate are required" });
    const data = await storage.getDriverIntelligenceData({
      driverId, startDate, endDate,
      compareStartDate: compareStartDate || undefined,
      compareEndDate:   compareEndDate   || undefined,
    });
    return res.json(data);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
