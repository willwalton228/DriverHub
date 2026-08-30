import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { isAuthenticated } from "../replitAuth";

const router = Router();

function safeDate(d: string | undefined, fallback: string) {
  if (!d) return fallback;
  return d.replace(/'/g, "");
}

// ═════════════════════════════════════════════════════════════════════════════
//  GET /widgets  — returns all widget data in a single response
// ═════════════════════════════════════════════════════════════════════════════
router.get("/widgets", isAuthenticated, async (req: any, res) => {
  try {
    const now = new Date();
    const defaultEnd   = now.toISOString().slice(0, 10);
    const d90 = new Date(now); d90.setDate(now.getDate() - 90);
    const defaultStart = d90.toISOString().slice(0, 10);

    const dateFrom = safeDate(req.query.dateFrom as string, defaultStart);
    const dateTo   = safeDate(req.query.dateTo   as string, defaultEnd);

    // Run all widget queries in parallel
    const [
      accountAlerts,
      topExceptions,
      rideshareSpend,
      laborMix,
      payReconSummary,
      costPerMoveAccounts,
      chaseOpportunity,
      utilization,
    ] = await Promise.all([

      // W1 — Account Profitability Alerts (low margin + negative profit)
      db.execute(sql.raw(`
        SELECT
          s.id, s.account_number, s.account_name, s.account_id,
          ROUND(s.total_revenue::numeric, 2)    AS total_revenue,
          ROUND(s.total_cost::numeric, 2)       AS total_cost,
          ROUND(s.gross_profit::numeric, 2)     AS gross_profit,
          ROUND(s.margin_pct::numeric * 100, 1) AS margin_pct_display,
          s.anomaly_codes, s.period_start, s.period_end
        FROM account_financial_summary s
        WHERE s.anomaly_flag = true
          AND s.period_start >= '${dateFrom}'::date
          AND s.period_end   <= '${dateTo}'::date
        ORDER BY s.gross_profit ASC NULLS LAST
        LIMIT 15
      `)),

      // W6 — Top Exceptions (critical + oldest)
      db.execute(sql.raw(`
        SELECT
          e.id, e.exception_type, e.exception_category, e.severity,
          e.entity_type, e.entity_id, e.description, e.source_module, e.status,
          EXTRACT(DAY FROM now() - e.created_at)::int AS age_days
        FROM system_exceptions e
        WHERE e.status NOT IN ('resolved','ignored')
        ORDER BY
          CASE e.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END ASC,
          e.created_at ASC
        LIMIT 10
      `)),

      // W7 — Rideshare Spend Summary
      db.execute(sql.raw(`
        SELECT
          COUNT(rt.id)::int                                         AS total_rides,
          ROUND(SUM(rt.total_fare::numeric), 2)                    AS total_spend,
          ROUND(SUM(CASE WHEN rt.billing_status IN ('billed','invoiced','approved','reviewed')
                         THEN rt.total_fare::numeric ELSE 0 END), 2) AS billed_spend,
          ROUND(SUM(CASE WHEN rt.billing_status NOT IN ('billed','invoiced','approved','reviewed')
                         THEN rt.total_fare::numeric ELSE 0 END), 2) AS unbilled_spend,
          ROUND(AVG(rt.total_fare::numeric), 2)                    AS avg_cost_per_ride,
          COUNT(CASE WHEN rt.provider = 'uber' THEN 1 END)::int   AS uber_rides,
          ROUND(SUM(CASE WHEN rt.provider = 'uber'
                         THEN rt.total_fare::numeric ELSE 0 END), 2) AS uber_spend,
          COUNT(CASE WHEN rt.provider = 'lyft' THEN 1 END)::int   AS lyft_rides,
          ROUND(SUM(CASE WHEN rt.provider = 'lyft'
                         THEN rt.total_fare::numeric ELSE 0 END), 2) AS lyft_spend
        FROM rideshare_transactions rt
        WHERE rt.ride_date BETWEEN '${dateFrom}'::date AND '${dateTo}'::date
      `)),

      // W8 — Labor vs Rideshare Mix
      db.execute(sql.raw(`
        SELECT
          ROUND(SUM(s.total_labor_cost::numeric), 2)     AS total_labor_cost,
          ROUND(SUM(s.total_rideshare_cost::numeric), 2) AS total_rideshare_cost,
          ROUND(SUM(s.total_revenue::numeric), 2)        AS total_revenue,
          ROUND(SUM(s.gross_profit::numeric), 2)         AS total_gross_profit,
          COUNT(s.id)::int                                AS account_count
        FROM account_financial_summary s
        WHERE s.period_start >= '${dateFrom}'::date
          AND s.period_end   <= '${dateTo}'::date
      `)),

      // W5 — Pay Reconciliation Summary (openforce)
      db.execute(sql.raw(`
        SELECT
          COUNT(orr.id)::int                               AS total_drivers,
          ROUND(SUM(orr.openforce_gross_pay::numeric), 2) AS total_gross_pay,
          COUNT(CASE WHEN orr.overall_status = 'reconciled' THEN 1 END)::int AS reconciled_count,
          COUNT(CASE WHEN orr.overall_status = 'variance'   THEN 1 END)::int AS variance_count,
          COUNT(CASE WHEN orr.overall_status = 'anomaly'    THEN 1 END)::int AS anomaly_count,
          ROUND(AVG(orr.effective_hourly_rate::numeric), 2)  AS avg_hourly_rate,
          ROUND(AVG(orr.effective_trip_rate::numeric), 2)    AS avg_trip_rate
        FROM openforce_reconciliation_results orr
        WHERE orr.pay_period_start >= '${dateFrom}'::date
      `)),

      // W4 — Cost Per Move Account Aggregation (top 10 by high CPM)
      db.execute(sql.raw(`
        SELECT
          mlca.account_id,
          c.name                                          AS account_name,
          c.account_number,
          COUNT(DISTINCT mlca.move_id)::int              AS total_moves,
          ROUND(SUM(mlca.move_labor_cost::numeric), 2)  AS total_labor_cost,
          ROUND(AVG(mlca.move_labor_cost::numeric), 2)  AS avg_cpm,
          COUNT(CASE WHEN mlca.costing_method = 'shift_fixed_cost' THEN 1 END)::int  AS shift_moves,
          COUNT(CASE WHEN mlca.costing_method = 'ic_gross_pay'     THEN 1 END)::int  AS ondemand_moves
        FROM move_labor_cost_allocations mlca
        LEFT JOIN customers c ON c.id = mlca.account_id
        WHERE mlca.trip_date::date BETWEEN '${dateFrom}'::date AND '${dateTo}'::date
        GROUP BY mlca.account_id, c.name, c.account_number
        HAVING COUNT(DISTINCT mlca.move_id) > 0
        ORDER BY avg_cpm DESC NULLS LAST
        LIMIT 10
      `)),

      // W2 — Chase Driver Opportunity (top 8 by savings)
      db.execute(sql.raw(`
        WITH chase AS (
          SELECT
            rt.matched_account_id                                     AS account_id,
            c.name                                                    AS account_name,
            c.account_number,
            COUNT(rt.id)::int                                        AS ride_count,
            ROUND(SUM(rt.total_fare::numeric), 2)                   AS total_spend,
            ROUND(AVG(rt.total_fare::numeric), 2)                   AS avg_fare,
            ROUND(SUM(rt.total_fare::numeric) / NULLIF(COUNT(DISTINCT rt.ride_date), 0), 2)
                                                                     AS avg_daily_spend
          FROM rideshare_transactions rt
          LEFT JOIN customers c ON c.id = rt.matched_account_id
          WHERE rt.ride_date BETWEEN '${dateFrom}'::date AND '${dateTo}'::date
            AND rt.matched_account_id IS NOT NULL
            AND rt.total_fare > 0
          GROUP BY rt.matched_account_id, c.name, c.account_number
        )
        SELECT
          ch.*,
          ROUND(ch.avg_daily_spend * 0.6, 2)             AS est_driver_cost,
          ROUND(ch.avg_daily_spend * 0.4, 2)             AS est_daily_savings,
          CASE
            WHEN ch.avg_daily_spend >= 200 THEN '8hr'
            WHEN ch.avg_daily_spend >= 100 THEN '6hr'
            ELSE '4hr'
          END                                            AS recommended_shift,
          CASE
            WHEN ch.avg_daily_spend >= 150 THEN 0.85
            WHEN ch.avg_daily_spend >= 80  THEN 0.70
            ELSE 0.55
          END                                            AS confidence
        FROM chase ch
        WHERE ch.avg_daily_spend > 50
        ORDER BY est_daily_savings DESC
        LIMIT 8
      `)),

      // W3 — Driver Utilization & Recovery (top 8 accounts by recoverable spend)
      db.execute(sql.raw(`
        SELECT
          rt.matched_account_id                                   AS account_id,
          c.name                                                  AS account_name,
          c.account_number,
          COUNT(rt.id)::int                                       AS ride_count,
          ROUND(SUM(rt.total_fare::numeric), 2)                  AS rideshare_spend,
          ROUND(SUM(rt.total_fare::numeric) * 0.35, 2)           AS recoverable_spend
        FROM rideshare_transactions rt
        LEFT JOIN customers c ON c.id = rt.matched_account_id
        WHERE rt.ride_date BETWEEN '${dateFrom}'::date AND '${dateTo}'::date
          AND rt.matched_account_id IS NOT NULL
          AND rt.total_fare > 0
        GROUP BY rt.matched_account_id, c.name, c.account_number
        ORDER BY recoverable_spend DESC
        LIMIT 8
      `)),
    ]);

    // KPI totals for the exceptions widget
    const exceptionKpis = await db.execute(sql.raw(`
      SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('resolved','ignored'))::int AS total_open,
        COUNT(*) FILTER (WHERE severity = 'critical' AND status NOT IN ('resolved','ignored'))::int AS critical,
        COUNT(*) FILTER (WHERE severity = 'high'     AND status NOT IN ('resolved','ignored'))::int AS high
      FROM system_exceptions
    `));

    return res.json({
      dateFrom,
      dateTo,
      widgets: {
        accountAlerts:      accountAlerts.rows,
        topExceptions:      topExceptions.rows,
        exceptionKpis:      exceptionKpis.rows[0] ?? {},
        rideshareSpend:     rideshareSpend.rows[0] ?? {},
        laborMix:           laborMix.rows[0] ?? {},
        payReconSummary:    payReconSummary.rows[0] ?? {},
        costPerMoveAccounts: costPerMoveAccounts.rows,
        chaseOpportunity:   chaseOpportunity.rows,
        utilization:        utilization.rows,
      },
    });
  } catch (err: any) {
    console.error("[dashboard-widgets]", err);
    return res.status(500).json({ message: err.message });
  }
});

export default router;
