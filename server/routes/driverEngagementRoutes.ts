/**
 * Driver Engagement & Retention Report — DH-002006
 *
 * Measures engagement using authoritative WIW shift data.
 * Account attribution uses wiw_locations.account_id (never wiw_location_account_map).
 *
 * Architecture note: engagement_status and all three rolling windows are computed
 * server-side so future Move metrics can be added without redesigning this contract.
 */
import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { isAuthenticated } from "../replitAuth";

const router = Router();

// ── Centrally-defined engagement thresholds ───────────────────────────────────
// Change these constants to adjust classification without touching UI code.
const THRESHOLDS = {
  ACTIVE_HOURS_30D: 0,    // > this value → Active
  DECLINING_HOURS_90D: 0, // > this value in 90d window but 0 in 30d → Declining
  ACTIVE_MOVES_30D: 0,    // > this many completed moves in 30d → Active
  DECLINING_MOVES_90D: 0, // > this many completed moves in 90d (but none in 30d) → Declining
} as const;

// Shared CTE: completed moves per driver over rolling 30/60/90-day windows.
// Same trips-table pattern as opsReportingRoutes driver_moves.
//
// Boundary alignment: windows use inclusive CALENDAR dates (CURRENT_DATE, UTC)
// rather than NOW()-based timestamps, and are capped at today, so the counts
// exactly match the Move List deep link (?driverId=…&startDate=…&endDate=…),
// which filters trip_date by inclusive whole days.
const DRIVER_MOVES_CTE = sql`
  driver_moves AS (
    SELECT
      t.driver_id,
      COUNT(*) FILTER (WHERE t.trip_date >= CURRENT_DATE - INTERVAL '30 days')::int AS moves_30d,
      COUNT(*) FILTER (WHERE t.trip_date >= CURRENT_DATE - INTERVAL '60 days')::int AS moves_60d,
      COUNT(*) FILTER (WHERE t.trip_date >= CURRENT_DATE - INTERVAL '90 days')::int AS moves_90d,
      MAX(t.trip_date) AS last_move_date
    FROM trips t
    WHERE t.driver_id IS NOT NULL
      AND lower(t.status) = 'completed'
      AND t.trip_date < CURRENT_DATE + INTERVAL '1 day'
    GROUP BY t.driver_id
  )
`;

// Authoritative Driver Detail account resolution:
// 1) explicitly primary driver_accounts row, 2) newest assigned account,
// 3) legacy drivershift_customer_id only when no assignment exists.
// This is deliberately independent of recent shift activity.
const PRIMARY_ACCOUNT_CTE = sql`
  primary_account AS (
    SELECT
      d.id AS driver_id,
      c.id AS account_id,
      c.customer_name AS account_name,
      c.network AS network
    FROM drivers d
    LEFT JOIN LATERAL (
      SELECT da.account_id
      FROM driver_accounts da
      WHERE da.driver_id = d.id
        AND da.assignment_ended_at IS NULL
      ORDER BY da.is_primary DESC, da.created_at DESC
      LIMIT 1
    ) assigned_account ON TRUE
    LEFT JOIN customers c
      ON c.id = COALESCE(assigned_account.account_id, d.drivershift_customer_id)
  )
`;

// Combined shift + move engagement classification (used identically in all 3 queries).
const ENGAGEMENT_CASE = sql`
  CASE
    WHEN ds.driver_id IS NULL AND dm.driver_id IS NULL THEN 'never_worked'
    WHEN COALESCE(ds.hours_30d, 0) > ${THRESHOLDS.ACTIVE_HOURS_30D}
      OR COALESCE(dm.moves_30d, 0) > ${THRESHOLDS.ACTIVE_MOVES_30D}   THEN 'active'
    WHEN COALESCE(ds.hours_90d, 0) > ${THRESHOLDS.DECLINING_HOURS_90D}
      OR COALESCE(dm.moves_90d, 0) > ${THRESHOLDS.DECLINING_MOVES_90D} THEN 'declining'
    WHEN ds.last_shift_time IS NOT NULL OR dm.last_move_date IS NOT NULL THEN 'no_recent_activity'
    ELSE 'never_worked'
  END
`;

// ── GET /api/reports/driver-engagement ───────────────────────────────────────
// Main report: one row per driver with 30/60/90-day rolling shift hours,
// engagement classification, and primary account.
router.get("/", isAuthenticated, async (req, res) => {
  const {
    search,
    driverStatus,
    driverType,
    classification,
    accountId,
    network,
    engagement,
    activeOnly,
    sortBy = "driver_name",
    sortDir = "asc",
    page = "1",
    pageSize = "200",
  } = req.query as Record<string, string>;

  const limit  = Math.min(500, Math.max(1, parseInt(pageSize) || 200));
  const offset = (Math.max(1, parseInt(page) || 1) - 1) * limit;
  const searchPat = search ? `%${search}%` : null;

  const ALLOWED_SORT_COLS: Record<string, string> = {
    driver_name:       "ed.driver_name",
    driver_status:     "ed.driver_status",
    driver_type:       "ed.driver_type",
    classification:    "ed.driver_classification",
    network:           "ed.network",
    account_name:      "ed.account_name",
    last_shift_time:   "ed.last_shift_time",
    hours_30d:         "ed.hours_30d",
    hours_60d:         "ed.hours_60d",
    hours_90d:         "ed.hours_90d",
    moves_30d:         "ed.moves_30d",
    moves_60d:         "ed.moves_60d",
    moves_90d:         "ed.moves_90d",
    last_move_date:    "ed.last_move_date",
    engagement_status: "ed.engagement_status",
  };

  const orderCol = ALLOWED_SORT_COLS[sortBy] ?? "ed.driver_name";
  const orderDir = sortDir?.toLowerCase() === "desc" ? sql`DESC NULLS LAST` : sql`ASC NULLS LAST`;

  try {
    const [dataRows, countRow, summaryRow] = await Promise.all([
      // ── Main paginated result ───────────────────────────────────────────
      db.execute(sql`
        WITH driver_shifts AS (
          -- Aggregate qualifying shift hours per driver over rolling windows.
          -- "Qualifying" = not deleted/cancelled and has scheduled minutes.
          -- No date cap on last_shift_time so we can detect >90-day inactivity.
          SELECT
            wu.driver_id,
            ROUND(
              SUM(CASE WHEN ws.start_time >= NOW() - INTERVAL '30 days'
                        THEN COALESCE(ws.scheduled_minutes, 0) ELSE 0 END) / 60.0, 1
            ) AS hours_30d,
            ROUND(
              SUM(CASE WHEN ws.start_time >= NOW() - INTERVAL '60 days'
                        THEN COALESCE(ws.scheduled_minutes, 0) ELSE 0 END) / 60.0, 1
            ) AS hours_60d,
            ROUND(
              SUM(CASE WHEN ws.start_time >= NOW() - INTERVAL '90 days'
                        THEN COALESCE(ws.scheduled_minutes, 0) ELSE 0 END) / 60.0, 1
            ) AS hours_90d,
            MAX(ws.start_time) AS last_shift_time
          FROM wiw_users wu
          JOIN wiw_shifts ws ON ws.wiw_user_id = wu.id
          WHERE ws.status NOT IN ('deleted', 'cancelled')
            AND COALESCE(ws.scheduled_minutes, 0) > 0
          GROUP BY wu.driver_id
        ),
        ${DRIVER_MOVES_CTE},
        ${PRIMARY_ACCOUNT_CTE},
        engagement_data AS (
          SELECT
            d.id                                             AS driver_id,
            CONCAT(u.first_name, ' ', u.last_name)          AS driver_name,
            d.status                                         AS driver_status,
            d.driver_type,
            d.driver_classification,
            d.employment_type,
            pa.account_id,
            pa.account_name,
            pa.network,
            COALESCE(ds.hours_30d, 0)::float                AS hours_30d,
            COALESCE(ds.hours_60d, 0)::float                AS hours_60d,
            COALESCE(ds.hours_90d, 0)::float                AS hours_90d,
            ds.last_shift_time,
            COALESCE(dm.moves_30d, 0)                       AS moves_30d,
            COALESCE(dm.moves_60d, 0)                       AS moves_60d,
            COALESCE(dm.moves_90d, 0)                       AS moves_90d,
            dm.last_move_date,
            ${ENGAGEMENT_CASE}                              AS engagement_status
          FROM drivers d
          JOIN users u ON u.id = d.user_id
          LEFT JOIN driver_shifts  ds ON ds.driver_id = d.id
          LEFT JOIN driver_moves   dm ON dm.driver_id = d.id
          LEFT JOIN primary_account pa ON pa.driver_id = d.id
          WHERE d.status != 'archived'
        )
        SELECT *
        FROM engagement_data ed
        WHERE 1=1
          ${searchPat        ? sql`AND ed.driver_name ILIKE ${searchPat}`            : sql``}
          ${driverStatus     ? sql`AND ed.driver_status = ${driverStatus}`           : sql``}
          ${activeOnly === "true" ? sql`AND ed.driver_status = 'active'`             : sql``}
          ${driverType       ? sql`AND ed.driver_type = ${driverType}`               : sql``}
          ${classification   ? sql`AND ed.driver_classification = ${classification}` : sql``}
          ${accountId        ? sql`AND ed.account_id = ${accountId}`                 : sql``}
          ${network          ? sql`AND ed.network = ${network}`                      : sql``}
          ${engagement       ? sql`AND ed.engagement_status = ${engagement}`         : sql``}
        ORDER BY ${sql.raw(orderCol)} ${orderDir}
        LIMIT  ${limit}
        OFFSET ${offset}
      `),

      // ── Total count for pagination ──────────────────────────────────────
      db.execute(sql`
        WITH driver_shifts AS (
          SELECT
            wu.driver_id,
            ROUND(SUM(CASE WHEN ws.start_time >= NOW() - INTERVAL '30 days' THEN COALESCE(ws.scheduled_minutes, 0) ELSE 0 END) / 60.0, 1) AS hours_30d,
            ROUND(SUM(CASE WHEN ws.start_time >= NOW() - INTERVAL '90 days' THEN COALESCE(ws.scheduled_minutes, 0) ELSE 0 END) / 60.0, 1) AS hours_90d,
            MAX(ws.start_time) AS last_shift_time
          FROM wiw_users wu
          JOIN wiw_shifts ws ON ws.wiw_user_id = wu.id
          WHERE ws.status NOT IN ('deleted', 'cancelled')
            AND COALESCE(ws.scheduled_minutes, 0) > 0
          GROUP BY wu.driver_id
        ),
        ${DRIVER_MOVES_CTE},
        ${PRIMARY_ACCOUNT_CTE},
        engagement_data AS (
          SELECT
            d.id AS driver_id,
            CONCAT(u.first_name, ' ', u.last_name) AS driver_name,
            d.status AS driver_status, d.driver_type, d.driver_classification,
            pa.account_id,
            pa.network,
            ${ENGAGEMENT_CASE} AS engagement_status
          FROM drivers d
          JOIN users u ON u.id = d.user_id
          LEFT JOIN driver_shifts ds ON ds.driver_id = d.id
          LEFT JOIN driver_moves  dm ON dm.driver_id = d.id
          LEFT JOIN primary_account pa ON pa.driver_id = d.id
          WHERE d.status != 'archived'
        )
        SELECT COUNT(*) AS total
        FROM engagement_data ed
        WHERE 1=1
          ${searchPat        ? sql`AND ed.driver_name ILIKE ${searchPat}`            : sql``}
          ${driverStatus     ? sql`AND ed.driver_status = ${driverStatus}`           : sql``}
          ${activeOnly === "true" ? sql`AND ed.driver_status = 'active'`             : sql``}
          ${driverType       ? sql`AND ed.driver_type = ${driverType}`               : sql``}
          ${classification   ? sql`AND ed.driver_classification = ${classification}` : sql``}
          ${accountId        ? sql`AND ed.account_id = ${accountId}`                 : sql``}
          ${network          ? sql`AND ed.network = ${network}`                      : sql``}
          ${engagement       ? sql`AND ed.engagement_status = ${engagement}`         : sql``}
      `),

      // ── Summary counts across all matching rows ─────────────────────────
      db.execute(sql`
        WITH driver_shifts AS (
          SELECT
            wu.driver_id,
            ROUND(SUM(CASE WHEN ws.start_time >= NOW() - INTERVAL '30 days' THEN COALESCE(ws.scheduled_minutes, 0) ELSE 0 END) / 60.0, 1) AS hours_30d,
            ROUND(SUM(CASE WHEN ws.start_time >= NOW() - INTERVAL '90 days' THEN COALESCE(ws.scheduled_minutes, 0) ELSE 0 END) / 60.0, 1) AS hours_90d,
            MAX(ws.start_time) AS last_shift_time
          FROM wiw_users wu
          JOIN wiw_shifts ws ON ws.wiw_user_id = wu.id
          WHERE ws.status NOT IN ('deleted', 'cancelled')
            AND COALESCE(ws.scheduled_minutes, 0) > 0
          GROUP BY wu.driver_id
        ),
        ${DRIVER_MOVES_CTE},
        ${PRIMARY_ACCOUNT_CTE},
        engagement_data AS (
          SELECT
            d.id AS driver_id,
            CONCAT(u.first_name, ' ', u.last_name) AS driver_name,
            d.status AS driver_status, d.driver_type, d.driver_classification,
            pa.account_id,
            pa.network,
            ${ENGAGEMENT_CASE} AS engagement_status
          FROM drivers d
          JOIN users u ON u.id = d.user_id
          LEFT JOIN driver_shifts ds ON ds.driver_id = d.id
          LEFT JOIN driver_moves  dm ON dm.driver_id = d.id
          LEFT JOIN primary_account pa ON pa.driver_id = d.id
          WHERE d.status != 'archived'
        )
        SELECT
          COUNT(*)                                                               AS total,
          COUNT(*) FILTER (WHERE engagement_status = 'active')                  AS active,
          COUNT(*) FILTER (WHERE engagement_status = 'declining')               AS declining,
          COUNT(*) FILTER (WHERE engagement_status = 'no_recent_activity')      AS no_recent_activity,
          COUNT(*) FILTER (WHERE engagement_status = 'never_worked')            AS never_worked
        FROM engagement_data ed
        WHERE 1=1
          ${searchPat        ? sql`AND ed.driver_name ILIKE ${searchPat}`            : sql``}
          ${driverStatus     ? sql`AND ed.driver_status = ${driverStatus}`           : sql``}
          ${activeOnly === "true" ? sql`AND ed.driver_status = 'active'`             : sql``}
          ${driverType       ? sql`AND ed.driver_type = ${driverType}`               : sql``}
          ${classification   ? sql`AND ed.driver_classification = ${classification}` : sql``}
          ${accountId        ? sql`AND ed.account_id = ${accountId}`                 : sql``}
          ${network          ? sql`AND ed.network = ${network}`                      : sql``}
          ${engagement       ? sql`AND ed.engagement_status = ${engagement}`         : sql``}
      `),
    ]);

    return res.json({
      rows:    dataRows.rows,
      total:   parseInt(String(countRow.rows[0]?.total ?? "0")),
      page:    parseInt(page) || 1,
      pageSize: limit,
      summary: summaryRow.rows[0] ?? { total: 0, active: 0, declining: 0, no_recent_activity: 0, never_worked: 0 },
    });
  } catch (e: any) {
    console.error("[driver-engagement] report error:", e);
    return res.status(500).json({ error: e.message });
  }
});

// ── GET /api/reports/driver-engagement/shifts/:driverId ──────────────────────
// Drill-down: list of qualifying shifts for one driver in a rolling window.
// ?window=30|60|90 (default 30)
router.get("/shifts/:driverId", isAuthenticated, async (req, res) => {
  const driverId = req.params.driverId;
  const windowDays = [30, 60, 90].includes(parseInt(req.query.window as string))
    ? parseInt(req.query.window as string)
    : 30;

  try {
    const result = await db.execute(sql`
      SELECT
        ws.id                                     AS shift_id,
        ws.start_time,
        ws.end_time,
        COALESCE(ws.scheduled_minutes, 0)         AS scheduled_minutes,
        ROUND(COALESCE(ws.scheduled_minutes, 0) / 60.0, 2) AS scheduled_hours,
        ws.status,
        ws.notes,
        wl.name                                   AS location_name,
        c.id                                      AS account_id,
        c.customer_name                           AS account_name,
        wp.name                                   AS position_name
      FROM drivers d
      JOIN wiw_users  wu  ON wu.driver_id   = d.id
      JOIN wiw_shifts ws  ON ws.wiw_user_id = wu.id
      LEFT JOIN wiw_locations wl ON wl.id        = ws.wiw_location_id
      LEFT JOIN customers     c  ON c.id         = wl.account_id
      LEFT JOIN wiw_positions wp ON wp.id        = ws.wiw_position_id
      WHERE d.id = ${driverId}
        AND ws.status NOT IN ('deleted', 'cancelled')
        AND COALESCE(ws.scheduled_minutes, 0) > 0
        AND ws.start_time >= NOW() - (${windowDays} || ' days')::interval
      ORDER BY ws.start_time DESC
    `);

    return res.json({ driverId, window: windowDays, shifts: result.rows });
  } catch (e: any) {
    console.error("[driver-engagement] shifts drill-down error:", e);
    return res.status(500).json({ error: e.message });
  }
});

// ── GET /api/reports/driver-engagement/filter-options ────────────────────────
// Returns distinct driver types, classifications, networks, and accounts for
// populating filter dropdowns without a separate heavy query from the frontend.
router.get("/filter-options", isAuthenticated, async (req, res) => {
  try {
    const [types, classifications, networks, accounts] = await Promise.all([
      db.execute(sql`SELECT DISTINCT driver_type FROM drivers WHERE driver_type IS NOT NULL AND status != 'archived' ORDER BY driver_type`),
      db.execute(sql`SELECT DISTINCT driver_classification FROM drivers WHERE driver_classification IS NOT NULL AND status != 'archived' ORDER BY driver_classification`),
      db.execute(sql`
        SELECT DISTINCT c.network
        FROM drivers d
        JOIN users u ON u.id = d.user_id
        LEFT JOIN LATERAL (
          SELECT da.account_id
          FROM driver_accounts da
          WHERE da.driver_id = d.id
            AND da.assignment_ended_at IS NULL
          ORDER BY da.is_primary DESC, da.created_at DESC
          LIMIT 1
        ) assigned_account ON TRUE
        JOIN customers c ON c.id = COALESCE(assigned_account.account_id, d.drivershift_customer_id)
        WHERE d.status != 'archived'
          AND c.network IS NOT NULL
          AND c.network != ''
        ORDER BY c.network
      `),
      db.execute(sql`
        WITH ${PRIMARY_ACCOUNT_CTE}
        SELECT DISTINCT c.id, c.customer_name
        FROM primary_account pa
        JOIN customers c ON c.id = pa.account_id
        WHERE c.customer_name IS NOT NULL
        ORDER BY c.customer_name
      `),
    ]);
    return res.json({
      driverTypes:     types.rows.map((r: any) => r.driver_type),
      classifications: classifications.rows.map((r: any) => r.driver_classification),
      networks:        networks.rows.map((r: any) => r.network),
      accounts:        accounts.rows.map((r: any) => ({ id: r.id, name: r.customer_name })),
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
