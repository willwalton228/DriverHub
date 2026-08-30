import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { isAuthenticated } from "../replitAuth";

const router = Router();

// ── Anomaly thresholds ────────────────────────────────────────────────────────
const MARGIN_LOW_THRESHOLD   = 0.05;   // flag if margin < 5%
const CPM_HIGH_THRESHOLD     = 75;     // flag if cost_per_move > $75
const RS_LABOR_RATIO_HIGH    = 0.5;    // flag if rideshare > 50% of labor cost

// ═════════════════════════════════════════════════════════════════════════════
//   ACCOUNT FINANCIAL ENGINE
// ═════════════════════════════════════════════════════════════════════════════
async function runAccountFinancialEngine(options: {
  periodStart: string;
  periodEnd: string;
  accountId?: string;
}): Promise<{ processed: number }> {
  const { periodStart, periodEnd, accountId } = options;

  // Determine which accounts to process
  const accountFilter = accountId ? `AND c.id = '${accountId.replace(/'/g,"''")}'` : "";

  // Gather all accounts that have any data in the period
  const accountsResult = await db.execute(sql.raw(`
    SELECT DISTINCT c.id AS account_id, c.account_number, c.name AS account_name
    FROM customers c
    WHERE c.is_archived = false
      ${accountFilter}
      AND (
        EXISTS (
          SELECT 1 FROM invoices i
          WHERE i.customer_id = c.id
            AND i.status NOT IN ('draft','void')
            AND COALESCE(i.billing_period_start, i.invoice_date) >= '${periodStart}'::date
            AND COALESCE(i.billing_period_end, i.invoice_date) <= '${periodEnd}'::date
        )
        OR EXISTS (
          SELECT 1 FROM move_labor_cost_allocations mlca
          WHERE mlca.account_id = c.id
            AND mlca.trip_date::date BETWEEN '${periodStart}'::date AND '${periodEnd}'::date
        )
        OR EXISTS (
          SELECT 1 FROM rideshare_transactions rt
          WHERE rt.matched_account_id = c.id
            AND rt.ride_date BETWEEN '${periodStart}'::date AND '${periodEnd}'::date
        )
        OR EXISTS (
          SELECT 1 FROM trips t
          WHERE t.customer_id = c.id
            AND t.status = 'completed'
            AND t.trip_date::date BETWEEN '${periodStart}'::date AND '${periodEnd}'::date
        )
      )
  `));

  // Clear existing summaries for this period (and optionally this account)
  if (accountId) {
    await db.execute(sql.raw(`
      DELETE FROM account_financial_summary
      WHERE period_start = '${periodStart}'::date AND period_end = '${periodEnd}'::date
        AND account_id = '${accountId.replace(/'/g,"''")}' 
    `));
  } else {
    await db.execute(sql.raw(`
      DELETE FROM account_financial_summary
      WHERE period_start = '${periodStart}'::date AND period_end = '${periodEnd}'::date
    `));
  }

  let processed = 0;

  for (const acc of accountsResult.rows as any[]) {
    const aid  = acc.account_id;
    const anum = acc.account_number || null;
    const anam = (acc.account_name || "").replace(/'/g,"''");

    // 1. Revenue — sum of non-draft/void invoice totals
    const revResult = await db.execute(sql.raw(`
      SELECT
        COALESCE(SUM(i.total_amount::numeric), 0) AS total_revenue,
        COUNT(i.id)::int                          AS invoice_count
      FROM invoices i
      WHERE i.customer_id = '${aid}'
        AND i.status NOT IN ('draft','void')
        AND COALESCE(i.billing_period_start, i.invoice_date) >= '${periodStart}'::date
        AND COALESCE(i.billing_period_end,   i.invoice_date) <= '${periodEnd}'::date
    `));
    const totalRevenue   = parseFloat(revResult.rows[0]?.total_revenue || "0");
    const invoiceCount   = parseInt(revResult.rows[0]?.invoice_count || "0");

    // 2. Labor cost — sum from move_labor_cost_allocations
    const laborResult = await db.execute(sql.raw(`
      SELECT COALESCE(SUM(mlca.move_labor_cost::numeric), 0) AS total_labor
      FROM move_labor_cost_allocations mlca
      WHERE mlca.account_id = '${aid}'
        AND mlca.trip_date::date BETWEEN '${periodStart}'::date AND '${periodEnd}'::date
        AND mlca.anomaly_flag = false
    `));
    const totalLaborCost = parseFloat(laborResult.rows[0]?.total_labor || "0");

    // 3. Rideshare cost — sum of billed rideshare transactions
    const rsResult = await db.execute(sql.raw(`
      SELECT
        COALESCE(SUM(rt.total_fare::numeric), 0) AS total_rideshare_cost,
        COUNT(rt.id)::int                         AS ride_count
      FROM rideshare_transactions rt
      WHERE rt.matched_account_id = '${aid}'
        AND rt.ride_date BETWEEN '${periodStart}'::date AND '${periodEnd}'::date
        AND rt.billing_status IN ('billed','invoiced','approved','reviewed')
    `));
    const totalRideshareCost = parseFloat(rsResult.rows[0]?.total_rideshare_cost || "0");
    const rideshareRideCount = parseInt(rsResult.rows[0]?.ride_count || "0");

    // 4. Completed moves
    const movesResult = await db.execute(sql.raw(`
      SELECT COUNT(t.id)::int AS total_moves
      FROM trips t
      WHERE t.customer_id = '${aid}'
        AND t.status = 'completed'
        AND t.trip_date::date BETWEEN '${periodStart}'::date AND '${periodEnd}'::date
    `));
    const totalMoves = parseInt(movesResult.rows[0]?.total_moves || "0");

    // 5. Derived calculations
    const totalCost    = totalLaborCost + totalRideshareCost;
    const grossProfit  = totalRevenue - totalCost;
    const marginPct    = totalRevenue > 0 ? grossProfit / totalRevenue : null;
    const costPerMove  = totalMoves > 0 ? totalCost / totalMoves : null;

    // 6. Anomaly detection
    const anomalyCodes: string[] = [];
    if (marginPct !== null && marginPct < MARGIN_LOW_THRESHOLD) anomalyCodes.push("low_margin");
    if (grossProfit < 0) anomalyCodes.push("negative_profit");
    if (costPerMove !== null && costPerMove > CPM_HIGH_THRESHOLD) anomalyCodes.push("high_cost_per_move");
    if (totalLaborCost > 0 && totalRideshareCost / totalLaborCost > RS_LABOR_RATIO_HIGH) anomalyCodes.push("high_rideshare_cost");
    if (totalRevenue > 0 && totalLaborCost / totalRevenue > 0.8) anomalyCodes.push("high_labor_cost");
    const anomalyFlag  = anomalyCodes.length > 0;
    const anomalyCodesStr = anomalyCodes.join("|") || null;

    // 7. Upsert
    await db.execute(sql.raw(`
      INSERT INTO account_financial_summary
        (account_id, account_number, account_name, period_start, period_end,
         total_revenue, invoice_count, total_labor_cost, total_rideshare_cost, total_cost,
         total_moves, rideshare_ride_count, cost_per_move, gross_profit, margin_pct,
         anomaly_flag, anomaly_codes, calculated_at, last_updated_at)
      VALUES (
        '${aid}',
        ${anum ? `'${anum}'` : "NULL"},
        '${anam}',
        '${periodStart}'::date, '${periodEnd}'::date,
        ${totalRevenue}, ${invoiceCount},
        ${totalLaborCost}, ${totalRideshareCost}, ${totalCost},
        ${totalMoves}, ${rideshareRideCount},
        ${costPerMove !== null ? costPerMove : "NULL"},
        ${grossProfit},
        ${marginPct !== null ? marginPct : "NULL"},
        ${anomalyFlag},
        ${anomalyCodesStr ? `'${anomalyCodesStr}'` : "NULL"},
        now(), now()
      )
      ON CONFLICT DO NOTHING
    `));

    processed++;
  }

  return { processed };
}

// ─── POST /run-engine ─────────────────────────────────────────────────────────
router.post("/run-engine", isAuthenticated, async (req: any, res) => {
  try {
    const { periodStart, periodEnd, accountId } = req.body as Record<string, string>;
    if (!periodStart || !periodEnd) return res.status(400).json({ message: "periodStart and periodEnd required" });
    const result = await runAccountFinancialEngine({ periodStart, periodEnd, accountId });
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[account-profitability-engine]", err);
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /summary ─────────────────────────────────────────────────────────────
// KPI cards across all accounts for the selected period
router.get("/summary", isAuthenticated, async (req: any, res) => {
  try {
    const { periodStart, periodEnd, accountId } = req.query as Record<string, string>;
    const conds: string[] = [];
    if (periodStart) conds.push(`s.period_start >= '${periodStart}'::date`);
    if (periodEnd)   conds.push(`s.period_end   <= '${periodEnd}'::date`);
    if (accountId)   conds.push(`s.account_id = '${accountId.replace(/'/g,"''")}'`);
    const where = conds.length ? "WHERE " + conds.join(" AND ") : "";

    const kpis = await db.execute(sql.raw(`
      SELECT
        COUNT(*)::int                                   AS total_accounts,
        ROUND(SUM(s.total_revenue), 2)                  AS total_revenue,
        ROUND(SUM(s.total_labor_cost), 2)               AS total_labor_cost,
        ROUND(SUM(s.total_rideshare_cost), 2)           AS total_rideshare_cost,
        ROUND(SUM(s.total_cost), 2)                     AS total_cost,
        ROUND(SUM(s.gross_profit), 2)                   AS total_gross_profit,
        SUM(s.total_moves)::int                         AS total_moves,
        CASE WHEN SUM(s.total_revenue) > 0
          THEN ROUND(SUM(s.gross_profit) / SUM(s.total_revenue) * 100, 2)
          ELSE NULL
        END                                             AS overall_margin_pct,
        ROUND(AVG(s.margin_pct) * 100, 2)              AS avg_margin_pct,
        SUM(CASE WHEN s.anomaly_flag THEN 1 ELSE 0 END)::int AS anomaly_count,
        SUM(CASE WHEN s.gross_profit < 0 THEN 1 ELSE 0 END)::int AS negative_profit_count
      FROM account_financial_summary s
      ${where}
    `));

    const anomalyBreakdown = await db.execute(sql.raw(`
      SELECT unnest(string_to_array(s.anomaly_codes, '|')) AS code, COUNT(*)::int AS count
      FROM account_financial_summary s
      ${where} ${conds.length ? "AND" : "WHERE"} s.anomaly_flag = true AND s.anomaly_codes IS NOT NULL
      GROUP BY code
      ORDER BY count DESC
    `));

    return res.json({ kpis: kpis.rows[0] ?? {}, anomalyBreakdown: anomalyBreakdown.rows });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET / ────────────────────────────────────────────────────────────────────
// Main grid
router.get("/", isAuthenticated, async (req: any, res) => {
  try {
    const {
      periodStart, periodEnd, accountId,
      lowMarginOnly, negativeProfitOnly, anomalyOnly,
      sortBy = "margin_pct", order = "asc",
      limit = "200", offset = "0",
    } = req.query as Record<string, string>;

    const conds: string[] = [];
    if (periodStart) conds.push(`s.period_start >= '${periodStart}'::date`);
    if (periodEnd)   conds.push(`s.period_end   <= '${periodEnd}'::date`);
    if (accountId)   conds.push(`s.account_id = '${accountId.replace(/'/g,"''")}'`);
    if (lowMarginOnly === "true") conds.push(`(s.margin_pct IS NULL OR s.margin_pct < 0.05)`);
    if (negativeProfitOnly === "true") conds.push(`s.gross_profit < 0`);
    if (anomalyOnly === "true") conds.push(`s.anomaly_flag = true`);
    const where = conds.length ? "WHERE " + conds.join(" AND ") : "";

    // Safe sort column whitelist
    const sortCols: Record<string, string> = {
      margin_pct: "s.margin_pct",
      gross_profit: "s.gross_profit",
      total_revenue: "s.total_revenue",
      total_cost: "s.total_cost",
      cost_per_move: "s.cost_per_move",
      account_name: "s.account_name",
      period_start: "s.period_start",
    };
    const sortCol = sortCols[sortBy] ?? "s.margin_pct";
    const sortDir = order === "desc" ? "DESC" : "ASC";

    const rows = await db.execute(sql.raw(`
      SELECT s.*
      FROM account_financial_summary s
      ${where}
      ORDER BY ${sortCol} ${sortDir} NULLS LAST
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `));

    const total = await db.execute(sql.raw(`
      SELECT COUNT(*)::int AS n FROM account_financial_summary s ${where}
    `));

    return res.json({ rows: rows.rows, total: total.rows[0]?.n ?? 0 });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /alerts ─────────────────────────────────────────────────────────────
// Dashboard widget — low margin + negative profit accounts
router.get("/alerts", isAuthenticated, async (req: any, res) => {
  try {
    const { periodStart, periodEnd, limit = "20" } = req.query as Record<string, string>;
    const conds: string[] = ["s.anomaly_flag = true"];
    if (periodStart) conds.push(`s.period_start >= '${periodStart}'::date`);
    if (periodEnd)   conds.push(`s.period_end   <= '${periodEnd}'::date`);
    const where = "WHERE " + conds.join(" AND ");

    const rows = await db.execute(sql.raw(`
      SELECT s.*
      FROM account_financial_summary s
      ${where}
      ORDER BY s.gross_profit ASC NULLS LAST
      LIMIT ${parseInt(limit)}
    `));

    return res.json({ alerts: rows.rows });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
// Account detail — revenue breakdown, labor, rideshare, moves
router.get("/:id", isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { periodStart, periodEnd } = req.query as Record<string, string>;

    // The summary record
    const summaryResult = await db.execute(sql.raw(`
      SELECT * FROM account_financial_summary WHERE id = '${id.replace(/'/g,"''")}'
    `));
    if (!summaryResult.rows.length) return res.status(404).json({ message: "Not found" });
    const summary = summaryResult.rows[0] as any;
    const aid  = summary.account_id;
    const pst  = summary.period_start;
    const pend = summary.period_end;

    // Revenue breakdown — invoices
    const invoicesResult = await db.execute(sql.raw(`
      SELECT i.id, i.invoice_number, i.invoice_date, i.billing_period_start, i.billing_period_end,
             i.total_amount, i.status, i.subtotal_amount
      FROM invoices i
      WHERE i.customer_id = '${aid}'
        AND i.status NOT IN ('draft','void')
        AND COALESCE(i.billing_period_start, i.invoice_date) >= '${pst}'::date
        AND COALESCE(i.billing_period_end,   i.invoice_date) <= '${pend}'::date
      ORDER BY i.invoice_date DESC
      LIMIT 50
    `));

    // Labor cost breakdown — by method
    const laborBreakdownResult = await db.execute(sql.raw(`
      SELECT
        mlca.costing_method,
        mlca.driver_type,
        COUNT(DISTINCT mlca.driver_id)::int  AS driver_count,
        COUNT(DISTINCT mlca.move_id)::int    AS move_count,
        ROUND(SUM(mlca.move_labor_cost), 2)  AS total_labor_cost,
        ROUND(AVG(mlca.move_labor_cost), 4)  AS avg_labor_per_move
      FROM move_labor_cost_allocations mlca
      WHERE mlca.account_id = '${aid}'
        AND mlca.trip_date::date BETWEEN '${pst}'::date AND '${pend}'::date
      GROUP BY mlca.costing_method, mlca.driver_type
    `));

    // Rideshare breakdown
    const rideshareBreakdownResult = await db.execute(sql.raw(`
      SELECT
        rt.billing_status,
        COUNT(rt.id)::int                     AS ride_count,
        ROUND(SUM(rt.total_fare), 2)          AS total_cost,
        ROUND(AVG(rt.total_fare), 2)          AS avg_fare
      FROM rideshare_transactions rt
      WHERE rt.matched_account_id = '${aid}'
        AND rt.ride_date BETWEEN '${pst}'::date AND '${pend}'::date
      GROUP BY rt.billing_status
    `));

    // Move summary
    const movesSummaryResult = await db.execute(sql.raw(`
      SELECT
        COUNT(t.id)::int                         AS total_moves,
        AVG(EXTRACT(EPOCH FROM (t.trip_date - t.trip_date)) / 60)::int AS avg_duration_min,
        COUNT(CASE WHEN t.move_type IS NOT NULL THEN 1 END)::int AS typed_moves
      FROM trips t
      WHERE t.customer_id = '${aid}'
        AND t.status = 'completed'
        AND t.trip_date::date BETWEEN '${pst}'::date AND '${pend}'::date
    `));

    // Move type distribution
    const moveTypesResult = await db.execute(sql.raw(`
      SELECT
        COALESCE(t.move_type, 'Unknown') AS move_type,
        COUNT(t.id)::int                  AS move_count
      FROM trips t
      WHERE t.customer_id = '${aid}'
        AND t.status = 'completed'
        AND t.trip_date::date BETWEEN '${pst}'::date AND '${pend}'::date
      GROUP BY t.move_type
      ORDER BY move_count DESC
    `));

    return res.json({
      summary,
      invoices: invoicesResult.rows,
      laborBreakdown: laborBreakdownResult.rows,
      rideshareBreakdown: rideshareBreakdownResult.rows,
      movesSummary: movesSummaryResult.rows[0] ?? {},
      moveTypes: moveTypesResult.rows,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
