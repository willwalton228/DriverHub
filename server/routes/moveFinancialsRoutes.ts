import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { isAuthenticated } from "../replitAuth";

const router = Router();

function safeStr(v: unknown): string | null {
  if (!v) return null;
  return String(v).replace(/'/g, "''");
}

function fmtDate(d: string | null | undefined): string {
  return d ? `'${safeStr(d)}'` : "NULL";
}

function deriveStatus(hasRevenue: boolean, hasCost: boolean, hasException: boolean): string {
  if (hasException) return "exception";
  if (hasRevenue && hasCost) return "matched";
  if (hasRevenue && !hasCost) return "revenue_only";
  if (!hasRevenue && hasCost) return "costed_only";
  return "unpriced";
}

// ═════════════════════════════════════════════════════════════════════════════
//  POST /run-engine — Batch recalculate all eligible moves
// ═════════════════════════════════════════════════════════════════════════════
router.post("/run-engine", isAuthenticated, async (req: any, res) => {
  try {
    const movesResult = await db.execute(sql.raw(`
      SELECT
        t.id                    AS move_id,
        t.customer_id           AS account_id,
        c.account_number,
        c.name                  AS account_name,
        t.trip_date::date       AS move_date,
        t.move_type,
        t.driver_id,
        t.market_id             AS market,
        mlca.driver_type,
        t.bill_rate,
        mlca.move_labor_cost    AS labor_cost,
        mlca.id                 AS labor_cost_source_id,
        mlca.costing_method
      FROM trips t
      LEFT JOIN move_labor_cost_allocations mlca ON mlca.move_id = t.id
      LEFT JOIN customers c ON c.id = t.customer_id
      WHERE t.status = 'completed'
        AND mlca.id IS NOT NULL
    `));

    const moves = ((movesResult as any).rows ?? []) as any[];

    if (moves.length === 0) {
      return res.json({ message: "No moves with labor cost found. Engine ran with 0 rows.", processed: 0, exceptions: 0 });
    }

    // Revenue map — equal_split per invoice
    const invoiceResult = await db.execute(sql.raw(`
      SELECT
        i.id                  AS invoice_id,
        i.customer_id         AS account_id,
        i.billing_period_start,
        i.billing_period_end,
        i.total_amount        AS invoice_total,
        COUNT(t2.id)::int     AS move_count_in_period
      FROM invoices i
      LEFT JOIN trips t2
        ON t2.customer_id = i.customer_id AND t2.status = 'completed'
        AND (i.billing_period_start IS NULL
             OR t2.trip_date::date BETWEEN
                i.billing_period_start::date
                AND COALESCE(i.billing_period_end::date, i.billing_period_start::date))
      GROUP BY i.id, i.customer_id, i.billing_period_start, i.billing_period_end, i.total_amount
    `));

    const invoiceMap = new Map<string, any[]>();
    for (const inv of ((invoiceResult as any).rows ?? []) as any[]) {
      const perMove = inv.move_count_in_period > 0
        ? parseFloat(inv.invoice_total ?? "0") / inv.move_count_in_period : 0;
      const list = invoiceMap.get(inv.account_id) ?? [];
      list.push({ invoiceId: inv.invoice_id, start: inv.billing_period_start, end: inv.billing_period_end, perMoveRevenue: perMove });
      invoiceMap.set(inv.account_id, list);
    }

    // Rideshare pool
    const rideshareResult = await db.execute(sql.raw(`
      SELECT id, matched_account_id AS account_id, ride_date::date AS ride_date, total_fare
      FROM rideshare_transactions
      WHERE billing_status IN ('billed','invoiced','approved','reviewed')
        AND matched_account_id IS NOT NULL AND move_id IS NULL
      ORDER BY ride_date ASC
    `));
    const ridesharePool: any[] = ((rideshareResult as any).rows ?? []).map((r: any) => ({
      id: r.id, accountId: r.account_id, rideDate: r.ride_date,
      fare: parseFloat(r.total_fare ?? "0"), used: false,
    }));

    let exceptionCount = 0;

    for (const move of moves) {
      const laborCost  = parseFloat(move.labor_cost ?? "0");
      const billRate   = parseFloat(move.bill_rate ?? "0");
      const moveDate   = move.move_date ? String(move.move_date) : null;

      let revenueAmount = billRate;
      let invoiceId: string | null = null;
      let billingStart: string | null = null, billingEnd: string | null = null;
      let allocationMethod = "direct";

      if (!billRate) {
        const acctInvoices = invoiceMap.get(move.account_id) ?? [];
        if (acctInvoices.length > 0) {
          const inv = acctInvoices[0];
          revenueAmount = inv.perMoveRevenue;
          invoiceId = inv.invoiceId;
          billingStart = inv.start;
          billingEnd = inv.end;
          allocationMethod = "equal_split";
        }
      }

      let rideshareCost = 0, rideshareId: string | null = null;
      if (moveDate && move.account_id) {
        const match = ridesharePool.find(r =>
          !r.used && r.accountId === move.account_id &&
          Math.abs(new Date(r.rideDate).getTime() - new Date(moveDate).getTime()) <= 2 * 86400000
        );
        if (match) { match.used = true; rideshareCost = match.fare; rideshareId = match.id; }
      }

      const totalDirectCost = laborCost + rideshareCost;
      const grossProfit = revenueAmount - totalDirectCost;
      const marginPct = revenueAmount !== 0 ? (grossProfit / revenueAmount) * 100 : null;

      const hasRevenue = revenueAmount > 0;
      const hasCost    = totalDirectCost > 0;
      const isNeg      = marginPct !== null && marginPct < -5;
      const hasExc     = !hasRevenue || !hasCost || isNeg;
      const financialStatus = deriveStatus(hasRevenue, hasCost, hasExc);

      const anomalyCodes: string[] = [];
      if (!hasRevenue) anomalyCodes.push("MISSING_REVENUE");
      if (!hasCost)    anomalyCodes.push("MISSING_COST");
      if (isNeg)       anomalyCodes.push("NEGATIVE_MARGIN");

      const anomalyArr = anomalyCodes.length > 0
        ? `ARRAY[${anomalyCodes.map(c => `'${c}'`).join(",")}]`
        : "ARRAY[]::text[]";

      await db.execute(sql.raw(`
        INSERT INTO move_financials (
          move_id, account_id, account_number, account_name,
          move_date, move_type, driver_id, driver_type, market,
          revenue_amount, allocation_method,
          invoice_id, billing_period_start, billing_period_end,
          labor_cost, rideshare_cost, total_cost, total_direct_cost,
          gross_profit, margin_pct, financial_status,
          labor_cost_source_id, rideshare_transaction_id,
          anomaly_flag, anomaly_codes,
          calculated_at, last_updated_at
        ) VALUES (
          ${fmtDate(move.move_id)}, ${fmtDate(move.account_id)},
          ${move.account_number ? `'${safeStr(move.account_number)}'` : "NULL"},
          ${move.account_name ? `'${safeStr(move.account_name)}'` : "NULL"},
          ${fmtDate(moveDate)},
          ${move.move_type ? `'${safeStr(move.move_type)}'` : "NULL"},
          ${fmtDate(move.driver_id)},
          ${move.driver_type ? `'${safeStr(move.driver_type)}'` : "NULL"},
          ${move.market ? `'${safeStr(move.market)}'` : "NULL"},
          ${revenueAmount}, '${allocationMethod}',
          ${invoiceId ? `'${invoiceId}'` : "NULL"},
          ${fmtDate(billingStart)}, ${fmtDate(billingEnd)},
          ${laborCost}, ${rideshareCost}, ${totalDirectCost}, ${totalDirectCost},
          ${grossProfit}, ${marginPct ?? "NULL"}, '${financialStatus}',
          ${move.labor_cost_source_id ? `'${move.labor_cost_source_id}'` : "NULL"},
          ${rideshareId ? `'${rideshareId}'` : "NULL"},
          ${anomalyCodes.length > 0}, ${anomalyArr},
          now(), now()
        )
        ON CONFLICT (move_id) WHERE move_id IS NOT NULL
        DO UPDATE SET
          revenue_amount        = EXCLUDED.revenue_amount,
          allocation_method     = EXCLUDED.allocation_method,
          invoice_id            = EXCLUDED.invoice_id,
          billing_period_start  = EXCLUDED.billing_period_start,
          billing_period_end    = EXCLUDED.billing_period_end,
          labor_cost            = EXCLUDED.labor_cost,
          rideshare_cost        = EXCLUDED.rideshare_cost,
          total_cost            = EXCLUDED.total_cost,
          total_direct_cost     = EXCLUDED.total_direct_cost,
          gross_profit          = EXCLUDED.gross_profit,
          margin_pct            = EXCLUDED.margin_pct,
          financial_status      = EXCLUDED.financial_status,
          driver_id             = EXCLUDED.driver_id,
          market                = EXCLUDED.market,
          labor_cost_source_id  = EXCLUDED.labor_cost_source_id,
          rideshare_transaction_id = EXCLUDED.rideshare_transaction_id,
          anomaly_flag          = EXCLUDED.anomaly_flag,
          anomaly_codes         = EXCLUDED.anomaly_codes,
          last_updated_at       = now()
      `));

      if (hasExc) {
        exceptionCount++;
        const mfRow = await db.execute(sql.raw(
          `SELECT id FROM move_financials WHERE move_id = '${safeStr(move.move_id)}' LIMIT 1`
        ));
        const mfId = ((mfRow as any).rows?.[0] as any)?.id;
        if (mfId) {
          for (const code of anomalyCodes) {
            const exType = code === "MISSING_REVENUE" ? "missing_revenue"
              : code === "MISSING_COST" ? "missing_cost" : "negative_margin";
            const desc = code === "MISSING_REVENUE" ? "Move has no revenue linked"
              : code === "MISSING_COST" ? "Move has no cost allocation"
              : `Gross margin is ${marginPct?.toFixed(1)}%`;
            await db.execute(sql.raw(`
              INSERT INTO margin_exceptions (
                move_financial_id, move_id, account_id, exception_type,
                severity, description, resolution_status, auto_detected,
                move_date, account_name, margin_pct, created_at, updated_at
              )
              SELECT '${mfId}', '${safeStr(move.move_id)}',
                ${fmtDate(move.account_id)}, '${exType}',
                'warning', '${safeStr(desc)}', 'open', true,
                ${fmtDate(moveDate)},
                ${move.account_name ? `'${safeStr(move.account_name)}'` : "NULL"},
                ${marginPct ?? "NULL"}, now(), now()
              WHERE NOT EXISTS (
                SELECT 1 FROM margin_exceptions
                WHERE move_financial_id = '${mfId}'
                  AND exception_type    = '${exType}'
                  AND resolution_status = 'open'
              )
            `));
          }
        }
      }
    }

    return res.json({ message: "Move financials engine completed", processed: moves.length, exceptions: exceptionCount });
  } catch (err: any) {
    console.error("[move-financials/run-engine]", err);
    return res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  POST /calculate/:moveId — Per-move calculation using driver_earnings
// ═════════════════════════════════════════════════════════════════════════════
router.post("/calculate/:moveId", isAuthenticated, async (req: any, res) => {
  try {
    const moveId = safeStr(req.params.moveId);
    if (!moveId) return res.status(400).json({ message: "moveId required" });

    const tripRes = await db.execute(sql.raw(`
      SELECT t.*, c.account_number, c.name AS account_name
      FROM trips t LEFT JOIN customers c ON c.id = t.customer_id
      WHERE t.id = '${moveId}' LIMIT 1
    `));
    const trip = ((tripRes as any).rows?.[0] as any);
    if (!trip) return res.status(404).json({ message: "Move not found" });

    let revenueAmount = parseFloat(trip.bill_rate ?? "0");
    let invoiceId: string | null = null, invoiceLineId: string | null = null;
    let billingStart: string | null = null, billingEnd: string | null = null;
    let allocationMethod = "direct";

    if (!revenueAmount) {
      try {
        const invRes = await db.execute(sql.raw(`
          SELECT i.id AS invoice_id, il.id AS invoice_line_id,
                 i.billing_period_start, i.billing_period_end,
                 COALESCE(il.total_amount, i.total_amount, 0) AS rev
          FROM invoices i
          LEFT JOIN invoice_lines il ON il.invoice_id = i.id
          WHERE i.customer_id = '${safeStr(trip.customer_id)}'
          LIMIT 1
        `));
        if ((invRes as any).rows?.length) {
          const il = (invRes as any).rows[0] as any;
          revenueAmount = parseFloat(il.rev ?? "0");
          invoiceId = il.invoice_id;
          invoiceLineId = il.invoice_line_id;
          billingStart = il.billing_period_start;
          billingEnd = il.billing_period_end;
          allocationMethod = "direct_invoice_line";
        }
      } catch { /* invoice lookup optional */ }
    }

    let laborCost = 0, driverEarningsId: string | null = null;
    try {
      const earnRes = await db.execute(sql.raw(`
        SELECT id, total_amount FROM driver_earnings
        WHERE move_id = '${moveId}' AND status != 'voided'
        ORDER BY created_at DESC LIMIT 1
      `));
      if ((earnRes as any).rows?.length) {
        const e = (earnRes as any).rows[0] as any;
        laborCost = parseFloat(e.total_amount ?? "0");
        driverEarningsId = e.id;
      }
    } catch { /* fallback */ }

    let rideshareCost = 0;
    try {
      const rsRes = await db.execute(sql.raw(
        `SELECT total_fare FROM rideshare_transactions WHERE move_id = '${moveId}' LIMIT 1`
      ));
      if ((rsRes as any).rows?.length) {
        rideshareCost = parseFloat(((rsRes as any).rows[0] as any).total_fare ?? "0");
      }
    } catch { /* optional */ }

    const reposition = parseFloat(req.body?.repositionCost ?? "0");
    const incentive  = parseFloat(req.body?.incentiveCost  ?? "0");
    const adjustment = parseFloat(req.body?.adjustmentCost ?? "0");
    const totalDirectCost = laborCost + rideshareCost + reposition + incentive + adjustment;
    const grossProfit = revenueAmount - totalDirectCost;
    const marginPct = revenueAmount !== 0 ? (grossProfit / revenueAmount) * 100 : null;

    const hasRevenue = revenueAmount > 0;
    const hasCost    = totalDirectCost > 0;
    const isNeg      = marginPct !== null && marginPct < -5;
    const financialStatus = deriveStatus(hasRevenue, hasCost, !hasRevenue || !hasCost || isNeg);

    const anomalyCodes: string[] = [];
    if (!hasRevenue) anomalyCodes.push("missing_revenue");
    if (!hasCost)    anomalyCodes.push("missing_cost");
    if (isNeg)       anomalyCodes.push("negative_margin");

    const anomalyArr = anomalyCodes.length > 0
      ? `ARRAY[${anomalyCodes.map(c => `'${c}'`).join(",")}]`
      : "ARRAY[]::text[]";

    await db.execute(sql.raw(`
      INSERT INTO move_financials (
        move_id, account_id, account_number, account_name,
        move_date, move_type, driver_id,
        revenue_amount, allocation_method,
        invoice_id, invoice_line_id,
        billing_period_start, billing_period_end,
        labor_cost, rideshare_cost,
        reposition_cost_amount, incentive_cost_amount, adjustment_cost_amount,
        total_cost, total_direct_cost,
        gross_profit, margin_pct, financial_status,
        driver_earnings_id,
        anomaly_flag, anomaly_codes,
        calculated_at, last_updated_at
      ) VALUES (
        '${moveId}',
        ${fmtDate(trip.customer_id)},
        ${trip.account_number ? `'${safeStr(trip.account_number)}'` : "NULL"},
        ${trip.account_name ? `'${safeStr(trip.account_name)}'` : "NULL"},
        '${String(trip.trip_date).slice(0,10)}',
        ${trip.move_type ? `'${safeStr(trip.move_type)}'` : "NULL"},
        ${trip.driver_id ? `'${safeStr(trip.driver_id)}'` : "NULL"},
        ${revenueAmount}, '${allocationMethod}',
        ${invoiceId ? `'${invoiceId}'` : "NULL"},
        ${invoiceLineId ? `'${invoiceLineId}'` : "NULL"},
        ${fmtDate(billingStart)}, ${fmtDate(billingEnd)},
        ${laborCost}, ${rideshareCost},
        ${reposition}, ${incentive}, ${adjustment},
        ${totalDirectCost}, ${totalDirectCost},
        ${grossProfit}, ${marginPct ?? "NULL"}, '${financialStatus}',
        ${driverEarningsId ? `'${driverEarningsId}'` : "NULL"},
        ${anomalyCodes.length > 0}, ${anomalyArr},
        now(), now()
      )
      ON CONFLICT (move_id) WHERE move_id IS NOT NULL
      DO UPDATE SET
        revenue_amount          = EXCLUDED.revenue_amount,
        allocation_method       = EXCLUDED.allocation_method,
        invoice_id              = EXCLUDED.invoice_id,
        invoice_line_id         = EXCLUDED.invoice_line_id,
        billing_period_start    = EXCLUDED.billing_period_start,
        billing_period_end      = EXCLUDED.billing_period_end,
        labor_cost              = EXCLUDED.labor_cost,
        rideshare_cost          = EXCLUDED.rideshare_cost,
        reposition_cost_amount  = EXCLUDED.reposition_cost_amount,
        incentive_cost_amount   = EXCLUDED.incentive_cost_amount,
        adjustment_cost_amount  = EXCLUDED.adjustment_cost_amount,
        total_cost              = EXCLUDED.total_cost,
        total_direct_cost       = EXCLUDED.total_direct_cost,
        gross_profit            = EXCLUDED.gross_profit,
        margin_pct              = EXCLUDED.margin_pct,
        financial_status        = EXCLUDED.financial_status,
        driver_earnings_id      = EXCLUDED.driver_earnings_id,
        anomaly_flag            = EXCLUDED.anomaly_flag,
        anomaly_codes           = EXCLUDED.anomaly_codes,
        last_updated_at         = now()
    `));

    const mfRow = await db.execute(sql.raw(
      `SELECT * FROM move_financials WHERE move_id = '${moveId}' LIMIT 1`
    ));

    return res.json({
      record: ((mfRow as any).rows?.[0] as any),
      calculation: { revenueAmount, laborCost, rideshareCost, totalDirectCost, grossProfit, marginPct, financialStatus, anomalyCodes },
    });
  } catch (err: any) {
    console.error("[move-financials/calculate]", err);
    return res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  PATCH /:id/status — Update financial_status, notes, or pass-through flag
// ═════════════════════════════════════════════════════════════════════════════
router.patch("/:id/status", isAuthenticated, async (req: any, res) => {
  try {
    const id = safeStr(req.params.id);
    const { financialStatus, notes, passThrough } = req.body;
    const VALID = ["unpriced","costed_only","revenue_only","matched","exception","finalized"];
    if (financialStatus && !VALID.includes(financialStatus)) {
      return res.status(400).json({ message: `Invalid financialStatus` });
    }
    const parts: string[] = ["last_updated_at = now()"];
    if (financialStatus) parts.push(`financial_status = '${safeStr(financialStatus)}'`);
    if (notes !== undefined) parts.push(`notes = ${notes ? `'${safeStr(notes)}'` : "NULL"}`);
    if (passThrough !== undefined) parts.push(`pass_through = ${passThrough ? "true" : "false"}`);

    const result = await db.execute(sql.raw(
      `UPDATE move_financials SET ${parts.join(", ")} WHERE id = '${id}' RETURNING *`
    ));
    if (!(result as any).rows?.length) return res.status(404).json({ message: "Record not found" });
    return res.json((result as any).rows[0]);
  } catch (err: any) {
    console.error("[move-financials/status PATCH]", err);
    return res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  GET /summary — KPI stats
// ═════════════════════════════════════════════════════════════════════════════
router.get("/summary", isAuthenticated, async (req: any, res) => {
  try {
    const result = await db.execute(sql.raw(`
      SELECT
        COUNT(*)::int                                                         AS total_moves,
        COALESCE(SUM(revenue_amount),0)::numeric(14,2)                        AS total_revenue,
        COALESCE(SUM(total_direct_cost),0)::numeric(14,2)                     AS total_cost,
        COALESCE(SUM(gross_profit),0)::numeric(14,2)                          AS total_profit,
        CASE WHEN SUM(revenue_amount) > 0
          THEN ROUND((SUM(gross_profit)/SUM(revenue_amount))*100,2) ELSE 0 END AS overall_margin_pct,
        COUNT(*) FILTER (WHERE anomaly_flag = true)::int                      AS anomaly_count,
        COUNT(*) FILTER (WHERE gross_profit < 0)::int                         AS negative_margin_count,
        COUNT(*) FILTER (WHERE financial_status = 'unpriced')::int            AS unpriced_count,
        COUNT(*) FILTER (WHERE financial_status = 'matched')::int             AS matched_count,
        COUNT(*) FILTER (WHERE financial_status = 'exception')::int           AS exception_count,
        MIN(move_date)                                                         AS earliest_date,
        MAX(move_date)                                                         AS latest_date
      FROM move_financials
    `));
    return res.json((result as any).rows?.[0] ?? {});
  } catch (err: any) {
    console.error("[move-financials/summary]", err);
    return res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  GET /dashboard — Dashboard widget data
// ═════════════════════════════════════════════════════════════════════════════
router.get("/dashboard", isAuthenticated, async (req: any, res) => {
  try {
    const [weekRes, monthRes, lowestRes, negRes, exRes, marketRes] = await Promise.all([
      db.execute(sql.raw(`
        SELECT COALESCE(SUM(revenue_amount),0)::numeric(14,2) AS revenue,
               COALESCE(SUM(total_direct_cost),0)::numeric(14,2) AS cost,
               COALESCE(SUM(gross_profit),0)::numeric(14,2) AS profit,
               CASE WHEN SUM(revenue_amount)>0 THEN ROUND((SUM(gross_profit)/SUM(revenue_amount))*100,2) ELSE 0 END AS margin_pct,
               COUNT(*)::int AS moves
        FROM move_financials
        WHERE move_date >= date_trunc('week', CURRENT_DATE)
          AND move_date <  date_trunc('week', CURRENT_DATE) + interval '7 days'
      `)),
      db.execute(sql.raw(`
        SELECT COALESCE(SUM(revenue_amount),0)::numeric(14,2) AS revenue,
               COALESCE(SUM(total_direct_cost),0)::numeric(14,2) AS cost,
               COALESCE(SUM(gross_profit),0)::numeric(14,2) AS profit,
               CASE WHEN SUM(revenue_amount)>0 THEN ROUND((SUM(gross_profit)/SUM(revenue_amount))*100,2) ELSE 0 END AS margin_pct,
               COUNT(*)::int AS moves
        FROM move_financials
        WHERE move_date >= date_trunc('month', CURRENT_DATE)
          AND move_date <  date_trunc('month', CURRENT_DATE) + interval '1 month'
      `)),
      db.execute(sql.raw(`
        SELECT account_id, account_name,
               COUNT(*)::int AS moves,
               SUM(revenue_amount)::numeric(14,2) AS revenue,
               SUM(gross_profit)::numeric(14,2)   AS profit,
               CASE WHEN SUM(revenue_amount)>0 THEN ROUND((SUM(gross_profit)/SUM(revenue_amount))*100,2) ELSE 0 END AS margin_pct
        FROM move_financials
        WHERE move_date >= CURRENT_DATE - 30 AND revenue_amount > 0 AND account_id IS NOT NULL
        GROUP BY account_id, account_name HAVING COUNT(*) >= 2
        ORDER BY margin_pct ASC LIMIT 10
      `)),
      db.execute(sql.raw(`
        SELECT id, move_id, account_name, move_date,
               revenue_amount, total_direct_cost, gross_profit, margin_pct, financial_status
        FROM move_financials
        WHERE gross_profit < 0 AND move_date >= CURRENT_DATE - 30
        ORDER BY gross_profit ASC LIMIT 25
      `)),
      db.execute(sql.raw(`
        SELECT exception_type, severity, COUNT(*)::int AS cnt
        FROM margin_exceptions
        WHERE resolution_status = 'open'
        GROUP BY exception_type, severity ORDER BY cnt DESC
      `)),
      db.execute(sql.raw(`
        SELECT COALESCE(market,'Unknown') AS market,
               COUNT(*)::int AS moves,
               SUM(revenue_amount)::numeric(14,2) AS revenue,
               SUM(gross_profit)::numeric(14,2) AS profit,
               CASE WHEN SUM(revenue_amount)>0 THEN ROUND((SUM(gross_profit)/SUM(revenue_amount))*100,2) ELSE 0 END AS margin_pct
        FROM move_financials
        WHERE move_date >= CURRENT_DATE - 30
        GROUP BY market ORDER BY revenue DESC LIMIT 15
      `)),
    ]);

    return res.json({
      week:            ((weekRes  as any).rows?.[0] as any) ?? {},
      month:           ((monthRes as any).rows?.[0] as any) ?? {},
      lowestAccounts:  (lowestRes as any).rows ?? [],
      negativeMoves:   (negRes   as any).rows ?? [],
      exceptionSummary:(exRes    as any).rows ?? [],
      byMarket:        (marketRes as any).rows ?? [],
    });
  } catch (err: any) {
    console.error("[move-financials/dashboard]", err);
    return res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  GET /account/:accountId/summary — Account margin rollup
// ═════════════════════════════════════════════════════════════════════════════
router.get("/account/:accountId/summary", isAuthenticated, async (req: any, res) => {
  try {
    const accountId = safeStr(req.params.accountId);
    const { from, to } = req.query as Record<string, string>;
    const dc = [from ? `AND move_date >= '${safeStr(from)}'` : "", to ? `AND move_date <= '${safeStr(to)}'` : ""].join(" ");

    const [summRes, trendRes, statusRes] = await Promise.all([
      db.execute(sql.raw(`
        SELECT COUNT(*)::int AS total_moves,
               COALESCE(SUM(revenue_amount),0)::numeric(14,2) AS total_revenue,
               COALESCE(SUM(total_direct_cost),0)::numeric(14,2) AS total_cost,
               COALESCE(SUM(gross_profit),0)::numeric(14,2) AS total_profit,
               CASE WHEN SUM(revenue_amount)>0 THEN ROUND((SUM(gross_profit)/SUM(revenue_amount))*100,2) ELSE 0 END AS margin_pct,
               COUNT(*) FILTER (WHERE gross_profit < 0)::int AS negative_margin_count,
               COUNT(*) FILTER (WHERE anomaly_flag)::int     AS exception_count,
               AVG(margin_pct)::numeric(8,4)                  AS avg_margin_pct
        FROM move_financials
        WHERE account_id = '${accountId}' ${dc}
      `)),
      db.execute(sql.raw(`
        SELECT date_trunc('week', move_date)::date AS week,
               COUNT(*)::int AS moves,
               SUM(revenue_amount)::numeric(14,2) AS revenue,
               SUM(gross_profit)::numeric(14,2)   AS profit,
               CASE WHEN SUM(revenue_amount)>0 THEN ROUND((SUM(gross_profit)/SUM(revenue_amount))*100,2) ELSE 0 END AS margin_pct
        FROM move_financials
        WHERE account_id = '${accountId}' AND move_date >= CURRENT_DATE - 84
        GROUP BY 1 ORDER BY 1 DESC LIMIT 12
      `)),
      db.execute(sql.raw(`
        SELECT financial_status, COUNT(*)::int AS cnt
        FROM move_financials WHERE account_id = '${accountId}' ${dc}
        GROUP BY financial_status
      `)),
    ]);

    return res.json({
      summary:         ((summRes as any).rows?.[0] as any) ?? {},
      weeklyTrend:     (trendRes  as any).rows ?? [],
      statusBreakdown: (statusRes as any).rows ?? [],
    });
  } catch (err: any) {
    console.error("[move-financials/account-summary]", err);
    return res.status(500).json({ message: err.message });
  }
});

// ─── Exception Work Queue helpers ─────────────────────────────────────────────

async function logExceptionAction(
  exceptionId: string,
  actionType: string,
  actorId: string | null,
  actorName: string | null,
  description: string,
  beforeData?: object | null,
  afterData?: object | null
) {
  const beforeJson = beforeData ? `'${JSON.stringify(beforeData).replace(/'/g, "''")}'` : "NULL";
  const afterJson  = afterData  ? `'${JSON.stringify(afterData).replace(/'/g, "''")}'`  : "NULL";
  await db.execute(sql.raw(`
    INSERT INTO margin_exception_audit_log
      (exception_id, action_type, actor_user_id, actor_name, description, before_data, after_data)
    VALUES (
      '${safeStr(exceptionId)}',
      '${safeStr(actionType)}',
      ${actorId   ? `'${safeStr(actorId)}'`   : "NULL"},
      ${actorName ? `'${safeStr(actorName)}'` : "NULL"},
      '${safeStr(description)}',
      ${beforeJson}::jsonb, ${afterJson}::jsonb
    )
  `));
}

// ═════════════════════════════════════════════════════════════════════════════
//  GET /exceptions/:id/detail — Full reconciliation panel data
// ═════════════════════════════════════════════════════════════════════════════
router.get("/exceptions/:id/detail", isAuthenticated, async (req: any, res) => {
  try {
    const id = safeStr(req.params.id);

    // Exception row
    const exRes = await db.execute(sql.raw(`
      SELECT me.*,
             CONCAT(au.first_name,' ',au.last_name) AS assigned_user_name
      FROM margin_exceptions me
      LEFT JOIN users au ON au.id = me.assigned_to
      WHERE me.id = '${id}' LIMIT 1
    `));
    if (!(exRes as any).rows?.length) return res.status(404).json({ message: "Exception not found" });
    const ex = (exRes as any).rows[0] as any;

    // Move financial + move context
    const mfRes = await db.execute(sql.raw(`
      SELECT mf.*,
             t.move_number, t.origin, t.destination, t.status AS move_status,
             t.execution_mode, t.trip_date, t.distance, t.duration,
             t.bill_rate, t.pay_rate,
             CONCAT(u.first_name,' ',u.last_name) AS driver_name,
             c.name AS account_name_full, c.account_number
      FROM move_financials mf
      LEFT JOIN trips t    ON t.id  = mf.move_id
      LEFT JOIN drivers d  ON d.id  = mf.driver_id
      LEFT JOIN users u    ON u.id  = d.user_id
      LEFT JOIN customers c ON c.id = mf.account_id
      WHERE mf.id = '${ex.move_financial_id}' LIMIT 1
    `));
    const mf = (mfRes as any).rows?.[0] ?? null;

    // Invoice lines linked to this invoice
    const invoiceLinesRes = await db.execute(sql.raw(`
      SELECT il.id, il.description, il.quantity, il.unit_price, il.total_amount,
             il.service_date, il.product_id,
             inv.invoice_number, inv.billing_period_start, inv.billing_period_end
      FROM invoice_lines il
      JOIN invoices inv ON inv.id = il.invoice_id
      WHERE inv.id = '${safeStr(mf?.invoice_id ?? "")}'
      ORDER BY il.service_date
    `));

    // All invoices for account (for re-link action)
    const invoicesRes = await db.execute(sql.raw(`
      SELECT id, invoice_number, total_amount, billing_period_start, billing_period_end, status
      FROM invoices
      WHERE customer_id = '${safeStr(mf?.account_id ?? "")}'
      ORDER BY created_at DESC LIMIT 20
    `));

    // Driver earnings linked + candidates
    const earningsRes = await db.execute(sql.raw(`
      SELECT de.id, de.pay_type, de.pay_date, de.total_amount, de.base_amount,
             de.ot_amount, de.bonus_amount, de.adjustment_amount, de.status,
             CONCAT(u2.first_name,' ',u2.last_name) AS driver_name
      FROM driver_earnings de
      LEFT JOIN drivers d2 ON d2.id  = de.driver_id
      LEFT JOIN users u2   ON u2.id  = d2.user_id
      WHERE de.id = '${safeStr(mf?.driver_earnings_id ?? "")}'
         OR (de.move_id = '${safeStr(ex.move_id ?? "")}' AND de.status != 'voided')
      ORDER BY de.created_at DESC LIMIT 10
    `));

    // Earnings candidates (same driver, same date ±3 days, unlinked)
    const earningsCandRes = await db.execute(sql.raw(`
      SELECT de.id, de.pay_type, de.pay_date, de.total_amount, de.status,
             CONCAT(u2.first_name,' ',u2.last_name) AS driver_name
      FROM driver_earnings de
      LEFT JOIN drivers d2 ON d2.id = de.driver_id
      LEFT JOIN users u2   ON u2.id = d2.user_id
      WHERE de.driver_id = '${safeStr(mf?.driver_id ?? "")}'
        AND de.move_id IS NULL
        AND de.status != 'voided'
        AND de.pay_date BETWEEN '${mf?.move_date ?? "1970-01-01"}'::date - 3
                             AND '${mf?.move_date ?? "1970-01-01"}'::date + 3
      LIMIT 10
    `));

    // Rideshare costs linked
    const rideshareRes = await db.execute(sql.raw(`
      SELECT rt.id, rt.provider, rt.total_fare, rt.ride_date, rt.rider_name,
             rt.pickup_address_raw, rt.dropoff_address_raw
      FROM rideshare_transactions rt
      WHERE rt.id = '${safeStr(mf?.rideshare_transaction_id ?? "")}'
        OR rt.move_id = '${safeStr(ex.move_id ?? "")}'
      LIMIT 5
    `));

    // Audit log
    const auditRes = await db.execute(sql.raw(`
      SELECT * FROM margin_exception_audit_log
      WHERE exception_id = '${id}'
      ORDER BY created_at DESC LIMIT 30
    `));

    return res.json({
      exception:         ex,
      moveFinancial:     mf,
      invoiceLines:      (invoiceLinesRes  as any).rows ?? [],
      invoices:          (invoicesRes      as any).rows ?? [],
      linkedEarnings:    (earningsRes      as any).rows ?? [],
      earningsCandidates:(earningsCandRes  as any).rows ?? [],
      rideshareItems:    (rideshareRes     as any).rows ?? [],
      auditLog:          (auditRes         as any).rows ?? [],
    });
  } catch (err: any) {
    console.error("[move-financials/exceptions/detail]", err);
    return res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  PATCH /exceptions/:id — Update status / assignment / notes
// ═════════════════════════════════════════════════════════════════════════════
router.patch("/exceptions/:id", isAuthenticated, async (req: any, res) => {
  try {
    const id      = safeStr(req.params.id);
    const actorId = req.user?.claims?.sub || (req.session as any)?.userId;
    const { resolutionStatus, assignedTo, resolutionNote } = req.body;

    // Fetch current for audit
    const curRes = await db.execute(sql.raw(
      `SELECT * FROM margin_exceptions WHERE id = '${id}' LIMIT 1`
    ));
    if (!(curRes as any).rows?.length) return res.status(404).json({ message: "Exception not found" });
    const cur = (curRes as any).rows[0] as any;

    const VALID_STATUSES = ["open","in_review","resolved","dismissed"];
    if (resolutionStatus && !VALID_STATUSES.includes(resolutionStatus)) {
      return res.status(400).json({ message: "Invalid resolutionStatus" });
    }

    const parts: string[] = ["updated_at = now()"];

    if (resolutionStatus && resolutionStatus !== cur.resolution_status) {
      parts.push(`resolution_status = '${resolutionStatus}'`);
      if (resolutionStatus === "in_review") {
        parts.push(`in_progress_at = now()`);
        if (actorId) parts.push(`in_progress_by = '${safeStr(actorId)}'`);
      }
      if (["resolved","dismissed"].includes(resolutionStatus)) {
        parts.push(`resolved_by = ${actorId ? `'${safeStr(actorId)}'` : "NULL"}`);
        parts.push("resolved_at = now()");
      }
    }

    if (assignedTo !== undefined) {
      parts.push(`assigned_to = ${assignedTo ? `'${safeStr(assignedTo)}'` : "NULL"}`);
      parts.push(`assigned_at = ${assignedTo ? "now()" : "NULL"}`);
    }

    if (resolutionNote !== undefined) {
      parts.push(`resolution_note = ${resolutionNote ? `'${safeStr(resolutionNote)}'` : "NULL"}`);
    }

    const updateRes = await db.execute(sql.raw(
      `UPDATE margin_exceptions SET ${parts.join(", ")} WHERE id = '${id}' RETURNING *`
    ));
    const updated = (updateRes as any).rows[0] as any;

    // Get actor name
    let actorName: string | null = null;
    if (actorId) {
      try {
        const uRes = await db.execute(sql.raw(
          `SELECT CONCAT(first_name,' ',last_name) AS name FROM users WHERE id = '${safeStr(actorId)}' LIMIT 1`
        ));
        actorName = ((uRes as any).rows?.[0] as any)?.name ?? null;
      } catch {}
    }

    const changes: string[] = [];
    if (resolutionStatus && resolutionStatus !== cur.resolution_status)
      changes.push(`status ${cur.resolution_status} → ${resolutionStatus}`);
    if (assignedTo !== undefined)
      changes.push(`assigned to ${assignedTo ?? "unassigned"}`);
    if (resolutionNote !== undefined)
      changes.push("resolution note updated");

    if (changes.length) {
      await logExceptionAction(id!, "status_change", actorId, actorName,
        changes.join("; "),
        { resolution_status: cur.resolution_status, assigned_to: cur.assigned_to },
        { resolution_status: resolutionStatus, assigned_to: assignedTo }
      );
    }

    return res.json(updated);
  } catch (err: any) {
    console.error("[move-financials/exceptions/PATCH]", err);
    return res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  GET /exceptions/:id/audit-log — Activity log for an exception
// ═════════════════════════════════════════════════════════════════════════════
router.get("/exceptions/:id/audit-log", isAuthenticated, async (req: any, res) => {
  try {
    const id = safeStr(req.params.id);
    const result = await db.execute(sql.raw(`
      SELECT * FROM margin_exception_audit_log
      WHERE exception_id = '${id}'
      ORDER BY created_at DESC LIMIT 50
    `));
    return res.json((result as any).rows ?? []);
  } catch (err: any) {
    console.error("[move-financials/exceptions/audit-log]", err);
    return res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  POST /exceptions/:id/actions/link-invoice-line — Link invoice line to move
// ═════════════════════════════════════════════════════════════════════════════
router.post("/exceptions/:id/actions/link-invoice-line", isAuthenticated, async (req: any, res) => {
  try {
    const id      = safeStr(req.params.id);
    const actorId = req.user?.claims?.sub || (req.session as any)?.userId;
    const { invoiceId, invoiceLineId, allocationMethod, notes } = req.body;
    if (!invoiceId) return res.status(400).json({ message: "invoiceId required" });

    // Get exception → move_financial
    const exRes = await db.execute(sql.raw(
      `SELECT * FROM margin_exceptions WHERE id = '${id}' LIMIT 1`
    ));
    if (!(exRes as any).rows?.length) return res.status(404).json({ message: "Exception not found" });
    const ex = (exRes as any).rows[0] as any;
    if (!ex.move_financial_id) return res.status(400).json({ message: "No move_financial linked to this exception" });

    // Fetch invoice amount
    let revenueAmount = 0;
    const invRes = await db.execute(sql.raw(`
      SELECT i.total_amount AS inv_total, il.total_amount AS line_total
      FROM invoices i
      LEFT JOIN invoice_lines il ON il.id = '${safeStr(invoiceLineId ?? "")}'
      WHERE i.id = '${safeStr(invoiceId)}' LIMIT 1
    `));
    if ((invRes as any).rows?.length) {
      const ir = (invRes as any).rows[0] as any;
      revenueAmount = parseFloat(ir.line_total ?? ir.inv_total ?? "0");
    }

    // Update move_financials
    await db.execute(sql.raw(`
      UPDATE move_financials SET
        invoice_id         = '${safeStr(invoiceId)}',
        invoice_line_id    = ${invoiceLineId ? `'${safeStr(invoiceLineId)}'` : "NULL"},
        revenue_amount     = ${revenueAmount},
        allocation_method  = '${safeStr(allocationMethod ?? "direct_invoice_line")}',
        last_updated_at    = now()
      WHERE id = '${ex.move_financial_id}'
    `));

    // Recalculate gross profit/margin
    await db.execute(sql.raw(`
      UPDATE move_financials SET
        gross_profit   = revenue_amount - total_direct_cost,
        margin_pct     = CASE WHEN revenue_amount > 0 THEN ROUND(((revenue_amount - total_direct_cost)/revenue_amount)*100, 4) ELSE NULL END,
        financial_status = CASE WHEN revenue_amount > 0 AND total_direct_cost > 0 THEN 'matched'
                                WHEN revenue_amount > 0 THEN 'revenue_only' ELSE financial_status END,
        last_updated_at = now()
      WHERE id = '${ex.move_financial_id}'
    `));

    // Auto-resolve the missing_revenue exception if applicable
    if (ex.exception_type === "missing_revenue") {
      await db.execute(sql.raw(`
        UPDATE margin_exceptions SET
          resolution_status = 'resolved',
          resolved_by       = ${actorId ? `'${safeStr(actorId)}'` : "NULL"},
          resolved_at       = now(),
          resolution_note   = 'Invoice line linked',
          revenue_amount    = ${revenueAmount},
          updated_at        = now()
        WHERE id = '${id}'
      `));
    }

    let actorName: string | null = null;
    if (actorId) {
      try {
        const uRes = await db.execute(sql.raw(`SELECT CONCAT(first_name,' ',last_name) AS name FROM users WHERE id = '${safeStr(actorId)}' LIMIT 1`));
        actorName = ((uRes as any).rows?.[0] as any)?.name ?? null;
      } catch {}
    }

    await logExceptionAction(id!, "linked_invoice_line", actorId, actorName,
      `Linked invoice ${safeStr(invoiceId)}${invoiceLineId ? ` line ${safeStr(invoiceLineId)}` : ""} (${notes ?? ""})`,
      { invoice_id: ex.invoice_id ?? null },
      { invoice_id: invoiceId, invoice_line_id: invoiceLineId ?? null, revenue_amount: revenueAmount }
    );

    return res.json({ success: true, message: "Invoice line linked and move financial recalculated" });
  } catch (err: any) {
    console.error("[move-financials/exceptions/link-invoice-line]", err);
    return res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  POST /exceptions/:id/actions/link-earnings — Link driver earnings to move
// ═════════════════════════════════════════════════════════════════════════════
router.post("/exceptions/:id/actions/link-earnings", isAuthenticated, async (req: any, res) => {
  try {
    const id      = safeStr(req.params.id);
    const actorId = req.user?.claims?.sub || (req.session as any)?.userId;
    const { earningsId, notes } = req.body;
    if (!earningsId) return res.status(400).json({ message: "earningsId required" });

    const exRes = await db.execute(sql.raw(
      `SELECT * FROM margin_exceptions WHERE id = '${id}' LIMIT 1`
    ));
    if (!(exRes as any).rows?.length) return res.status(404).json({ message: "Exception not found" });
    const ex = (exRes as any).rows[0] as any;
    if (!ex.move_financial_id) return res.status(400).json({ message: "No move_financial linked" });

    // Get earnings amount
    const earnRes = await db.execute(sql.raw(`
      SELECT total_amount, driver_id, move_id FROM driver_earnings WHERE id = '${safeStr(earningsId)}' LIMIT 1
    `));
    if (!(earnRes as any).rows?.length) return res.status(404).json({ message: "Earnings record not found" });
    const earn = (earnRes as any).rows[0] as any;
    const laborCost = parseFloat(earn.total_amount ?? "0");

    // Update driver_earnings to link to move
    await db.execute(sql.raw(`
      UPDATE driver_earnings SET move_id = '${safeStr(ex.move_id)}', updated_at = now()
      WHERE id = '${safeStr(earningsId)}'
    `));

    // Update move_financials
    await db.execute(sql.raw(`
      UPDATE move_financials SET
        driver_earnings_id = '${safeStr(earningsId)}',
        labor_cost         = ${laborCost},
        total_cost         = ${laborCost} + COALESCE(rideshare_cost, 0),
        total_direct_cost  = ${laborCost} + COALESCE(rideshare_cost, 0),
        gross_profit       = revenue_amount - (${laborCost} + COALESCE(rideshare_cost, 0)),
        margin_pct         = CASE WHEN revenue_amount > 0
                             THEN ROUND(((revenue_amount - (${laborCost} + COALESCE(rideshare_cost,0)))/revenue_amount)*100,4)
                             ELSE NULL END,
        financial_status   = CASE WHEN revenue_amount > 0 AND (${laborCost} + COALESCE(rideshare_cost,0)) > 0 THEN 'matched'
                                  WHEN revenue_amount <= 0 THEN 'costed_only' ELSE financial_status END,
        last_updated_at    = now()
      WHERE id = '${ex.move_financial_id}'
    `));

    // Auto-resolve missing_cost exception
    if (ex.exception_type === "missing_cost") {
      await db.execute(sql.raw(`
        UPDATE margin_exceptions SET
          resolution_status = 'resolved',
          resolved_by       = ${actorId ? `'${safeStr(actorId)}'` : "NULL"},
          resolved_at       = now(),
          resolution_note   = 'Driver earnings linked',
          cost_amount       = ${laborCost},
          updated_at        = now()
        WHERE id = '${id}'
      `));
    }

    let actorName: string | null = null;
    if (actorId) {
      try {
        const uRes = await db.execute(sql.raw(`SELECT CONCAT(first_name,' ',last_name) AS name FROM users WHERE id = '${safeStr(actorId)}' LIMIT 1`));
        actorName = ((uRes as any).rows?.[0] as any)?.name ?? null;
      } catch {}
    }

    await logExceptionAction(id!, "linked_earnings", actorId, actorName,
      `Linked earnings record ${safeStr(earningsId)} (labor $${laborCost.toFixed(2)}) ${notes ?? ""}`,
      { driver_earnings_id: ex.driver_earnings_id ?? null },
      { driver_earnings_id: earningsId, labor_cost: laborCost }
    );

    return res.json({ success: true, message: "Earnings linked and move financial recalculated" });
  } catch (err: any) {
    console.error("[move-financials/exceptions/link-earnings]", err);
    return res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  POST /exceptions/:id/actions/add-adjustment — Manual cost/revenue adjustment
// ═════════════════════════════════════════════════════════════════════════════
router.post("/exceptions/:id/actions/add-adjustment", isAuthenticated, async (req: any, res) => {
  try {
    const id      = safeStr(req.params.id);
    const actorId = req.user?.claims?.sub || (req.session as any)?.userId;
    const { adjustmentType, amount, notes } = req.body;
    // adjustmentType: 'reposition' | 'incentive' | 'adjustment' | 'revenue_override'
    if (!adjustmentType || amount === undefined) {
      return res.status(400).json({ message: "adjustmentType and amount required" });
    }
    const amt = parseFloat(amount);

    const exRes = await db.execute(sql.raw(
      `SELECT * FROM margin_exceptions WHERE id = '${id}' LIMIT 1`
    ));
    if (!(exRes as any).rows?.length) return res.status(404).json({ message: "Exception not found" });
    const ex = (exRes as any).rows[0] as any;
    if (!ex.move_financial_id) return res.status(400).json({ message: "No move_financial linked" });

    let setClause = "";
    if (adjustmentType === "reposition") {
      setClause = `reposition_cost_amount = COALESCE(reposition_cost_amount,0) + ${amt}`;
    } else if (adjustmentType === "incentive") {
      setClause = `incentive_cost_amount = COALESCE(incentive_cost_amount,0) + ${amt}`;
    } else if (adjustmentType === "adjustment") {
      setClause = `adjustment_cost_amount = COALESCE(adjustment_cost_amount,0) + ${amt}`;
    } else if (adjustmentType === "revenue_override") {
      setClause = `revenue_amount = ${amt}`;
    } else {
      return res.status(400).json({ message: "Invalid adjustmentType" });
    }

    await db.execute(sql.raw(`
      UPDATE move_financials SET
        ${setClause},
        total_direct_cost = labor_cost + COALESCE(rideshare_cost,0)
                          + COALESCE(reposition_cost_amount,0)
                          + COALESCE(incentive_cost_amount,0)
                          + COALESCE(adjustment_cost_amount,0)
                          ${adjustmentType === "adjustment" ? `+ ${amt}` : ""},
        last_updated_at = now()
      WHERE id = '${ex.move_financial_id}'
    `));

    await db.execute(sql.raw(`
      UPDATE move_financials SET
        total_cost   = total_direct_cost,
        gross_profit = revenue_amount - total_direct_cost,
        margin_pct   = CASE WHEN revenue_amount > 0
                       THEN ROUND(((revenue_amount - total_direct_cost)/revenue_amount)*100,4)
                       ELSE NULL END,
        financial_status = CASE WHEN revenue_amount > 0 AND total_direct_cost > 0 THEN 'matched'
                                ELSE financial_status END,
        last_updated_at = now()
      WHERE id = '${ex.move_financial_id}'
    `));

    let actorName: string | null = null;
    if (actorId) {
      try {
        const uRes = await db.execute(sql.raw(`SELECT CONCAT(first_name,' ',last_name) AS name FROM users WHERE id = '${safeStr(actorId)}' LIMIT 1`));
        actorName = ((uRes as any).rows?.[0] as any)?.name ?? null;
      } catch {}
    }

    await logExceptionAction(id!, "added_adjustment", actorId, actorName,
      `Added ${adjustmentType} adjustment: $${amt.toFixed(2)}. ${notes ?? ""}`,
      null,
      { adjustment_type: adjustmentType, amount: amt }
    );

    return res.json({ success: true, message: `Adjustment applied and financials recalculated` });
  } catch (err: any) {
    console.error("[move-financials/exceptions/add-adjustment]", err);
    return res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  POST /exceptions/:id/actions/mark-pass-through — Toggle pass-through
// ═════════════════════════════════════════════════════════════════════════════
router.post("/exceptions/:id/actions/mark-pass-through", isAuthenticated, async (req: any, res) => {
  try {
    const id      = safeStr(req.params.id);
    const actorId = req.user?.claims?.sub || (req.session as any)?.userId;
    const { passThrough, notes } = req.body;

    const exRes = await db.execute(sql.raw(
      `SELECT * FROM margin_exceptions WHERE id = '${id}' LIMIT 1`
    ));
    if (!(exRes as any).rows?.length) return res.status(404).json({ message: "Exception not found" });
    const ex = (exRes as any).rows[0] as any;
    if (!ex.move_financial_id) return res.status(400).json({ message: "No move_financial linked" });

    await db.execute(sql.raw(`
      UPDATE move_financials SET
        pass_through    = ${passThrough ? "true" : "false"},
        financial_status = ${passThrough ? "'finalized'" : "financial_status"},
        notes           = ${notes ? `'${safeStr(notes)}'` : "notes"},
        last_updated_at = now()
      WHERE id = '${ex.move_financial_id}'
    `));

    if (ex.exception_type === "pass_through_issue") {
      await db.execute(sql.raw(`
        UPDATE margin_exceptions SET
          resolution_status = 'resolved',
          resolved_by = ${actorId ? `'${safeStr(actorId)}'` : "NULL"},
          resolved_at = now(),
          resolution_note = 'Marked as pass-through',
          updated_at = now()
        WHERE id = '${id}'
      `));
    }

    let actorName: string | null = null;
    if (actorId) {
      try {
        const uRes = await db.execute(sql.raw(`SELECT CONCAT(first_name,' ',last_name) AS name FROM users WHERE id = '${safeStr(actorId)}' LIMIT 1`));
        actorName = ((uRes as any).rows?.[0] as any)?.name ?? null;
      } catch {}
    }

    await logExceptionAction(id!, "marked_pass_through", actorId, actorName,
      `Pass-through ${passThrough ? "enabled" : "disabled"}. ${notes ?? ""}`,
      null, { pass_through: passThrough }
    );

    return res.json({ success: true, passThrough });
  } catch (err: any) {
    console.error("[move-financials/exceptions/mark-pass-through]", err);
    return res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  POST /exceptions/:id/actions/recalculate — Force recalculate move financials
// ═════════════════════════════════════════════════════════════════════════════
router.post("/exceptions/:id/actions/recalculate", isAuthenticated, async (req: any, res) => {
  try {
    const id      = safeStr(req.params.id);
    const actorId = req.user?.claims?.sub || (req.session as any)?.userId;

    const exRes = await db.execute(sql.raw(
      `SELECT * FROM margin_exceptions WHERE id = '${id}' LIMIT 1`
    ));
    if (!(exRes as any).rows?.length) return res.status(404).json({ message: "Exception not found" });
    const ex = (exRes as any).rows[0] as any;
    if (!ex.move_financial_id) return res.status(400).json({ message: "No move_financial linked" });

    // Snapshot before
    const beforeRes = await db.execute(sql.raw(
      `SELECT gross_profit, margin_pct, financial_status FROM move_financials WHERE id = '${ex.move_financial_id}' LIMIT 1`
    ));
    const before = (beforeRes as any).rows?.[0] ?? {};

    // Recalc
    await db.execute(sql.raw(`
      UPDATE move_financials SET
        total_direct_cost = labor_cost
                          + COALESCE(rideshare_cost,0)
                          + COALESCE(reposition_cost_amount,0)
                          + COALESCE(incentive_cost_amount,0)
                          + COALESCE(adjustment_cost_amount,0),
        total_cost        = labor_cost
                          + COALESCE(rideshare_cost,0)
                          + COALESCE(reposition_cost_amount,0)
                          + COALESCE(incentive_cost_amount,0)
                          + COALESCE(adjustment_cost_amount,0),
        gross_profit      = revenue_amount - (
                              labor_cost + COALESCE(rideshare_cost,0)
                              + COALESCE(reposition_cost_amount,0)
                              + COALESCE(incentive_cost_amount,0)
                              + COALESCE(adjustment_cost_amount,0)
                            ),
        margin_pct        = CASE WHEN revenue_amount > 0
                            THEN ROUND(((revenue_amount - (
                              labor_cost + COALESCE(rideshare_cost,0)
                              + COALESCE(reposition_cost_amount,0)
                              + COALESCE(incentive_cost_amount,0)
                              + COALESCE(adjustment_cost_amount,0)
                            ))/revenue_amount)*100,4)
                            ELSE NULL END,
        financial_status  = CASE
          WHEN revenue_amount > 0 AND (labor_cost + COALESCE(rideshare_cost,0)) > 0 THEN 'matched'
          WHEN revenue_amount > 0 AND (labor_cost + COALESCE(rideshare_cost,0)) = 0 THEN 'revenue_only'
          WHEN revenue_amount <= 0 AND (labor_cost + COALESCE(rideshare_cost,0)) > 0 THEN 'costed_only'
          ELSE 'unpriced' END,
        anomaly_flag      = CASE WHEN revenue_amount <= 0 OR (labor_cost + COALESCE(rideshare_cost,0)) <= 0 THEN true
                            ELSE false END,
        calculated_at     = now(),
        last_updated_at   = now()
      WHERE id = '${ex.move_financial_id}'
    `));

    const afterRes = await db.execute(sql.raw(
      `SELECT gross_profit, margin_pct, financial_status FROM move_financials WHERE id = '${ex.move_financial_id}' LIMIT 1`
    ));
    const after = (afterRes as any).rows?.[0] ?? {};

    let actorName: string | null = null;
    if (actorId) {
      try {
        const uRes = await db.execute(sql.raw(`SELECT CONCAT(first_name,' ',last_name) AS name FROM users WHERE id = '${safeStr(actorId)}' LIMIT 1`));
        actorName = ((uRes as any).rows?.[0] as any)?.name ?? null;
      } catch {}
    }

    await logExceptionAction(id!, "recalculated", actorId, actorName,
      `Move financials recalculated. Margin: ${Number(before.margin_pct ?? 0).toFixed(1)}% → ${Number(after.margin_pct ?? 0).toFixed(1)}%`,
      { gross_profit: before.gross_profit, margin_pct: before.margin_pct, financial_status: before.financial_status },
      { gross_profit: after.gross_profit, margin_pct: after.margin_pct, financial_status: after.financial_status }
    );

    return res.json({ success: true, before, after });
  } catch (err: any) {
    console.error("[move-financials/exceptions/recalculate]", err);
    return res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  GET /exceptions — Exception queue with filters
// ═════════════════════════════════════════════════════════════════════════════
router.get("/exceptions", isAuthenticated, async (req: any, res) => {
  try {
    const { status, exceptionType, accountId, limit: lim, offset: off } = req.query as Record<string,string>;
    const limit  = Math.min(parseInt(lim ?? "50", 10) || 50, 200);
    const offset = parseInt(off ?? "0", 10) || 0;
    const conds: string[] = [];
    if (status)        conds.push(`resolution_status = '${safeStr(status)}'`);
    if (exceptionType) conds.push(`exception_type = '${safeStr(exceptionType)}'`);
    if (accountId)     conds.push(`account_id = '${safeStr(accountId)}'`);
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

    const [rowsRes, countRes] = await Promise.all([
      db.execute(sql.raw(`
        SELECT * FROM margin_exceptions ${where}
        ORDER BY CASE severity WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
                 created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `)),
      db.execute(sql.raw(`SELECT COUNT(*)::int AS total FROM margin_exceptions ${where}`)),
    ]);

    return res.json({
      exceptions: (rowsRes as any).rows ?? [],
      total:      ((countRes as any).rows?.[0] as any)?.total ?? 0,
      limit, offset,
    });
  } catch (err: any) {
    console.error("[move-financials/exceptions]", err);
    return res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  PATCH /exceptions/:id/resolve — Resolve / dismiss an exception
// ═════════════════════════════════════════════════════════════════════════════
router.patch("/exceptions/:id/resolve", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub || (req.session as any)?.userId;
    const id = safeStr(req.params.id);
    const { resolutionStatus, resolutionNote } = req.body;
    const VALID = ["open","in_review","resolved","dismissed"];
    if (!VALID.includes(resolutionStatus)) {
      return res.status(400).json({ message: `resolutionStatus must be one of: ${VALID.join(",")}` });
    }
    const result = await db.execute(sql.raw(`
      UPDATE margin_exceptions
      SET resolution_status = '${safeStr(resolutionStatus)}',
          resolution_note   = ${resolutionNote ? `'${safeStr(resolutionNote)}'` : "NULL"},
          resolved_by       = ${userId ? `'${safeStr(userId)}'` : "NULL"},
          resolved_at       = ${["resolved","dismissed"].includes(resolutionStatus) ? "now()" : "NULL"},
          updated_at        = now()
      WHERE id = '${id}' RETURNING *
    `));
    if (!(result as any).rows?.length) return res.status(404).json({ message: "Exception not found" });
    return res.json((result as any).rows[0]);
  } catch (err: any) {
    console.error("[move-financials/exceptions/resolve]", err);
    return res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  GET / — List with rich filters
// ═════════════════════════════════════════════════════════════════════════════
router.get("/", isAuthenticated, async (req: any, res) => {
  try {
    const { accountId, financialStatus, anomalyOnly, from, to, passThrough,
            limit: lim, offset: off, sortBy, sortDir } = req.query as Record<string, string>;

    const limit  = Math.min(parseInt(lim ?? "50", 10) || 50, 200);
    const offset = parseInt(off ?? "0", 10) || 0;
    const conds: string[] = [];
    if (accountId)       conds.push(`mf.account_id = '${safeStr(accountId)}'`);
    if (financialStatus) conds.push(`mf.financial_status = '${safeStr(financialStatus)}'`);
    if (anomalyOnly === "true") conds.push("mf.anomaly_flag = true");
    if (passThrough === "true") conds.push("mf.pass_through = true");
    if (from) conds.push(`mf.move_date >= '${safeStr(from)}'`);
    if (to)   conds.push(`mf.move_date <= '${safeStr(to)}'`);
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

    const validSorts: Record<string, string> = {
      margin_pct: "mf.margin_pct", move_date: "mf.move_date",
      gross_profit: "mf.gross_profit", revenue_amount: "mf.revenue_amount",
      account_name: "mf.account_name",
    };
    const orderCol = validSorts[sortBy ?? ""] ?? "mf.move_date";
    const orderDir = sortDir === "asc" ? "ASC" : "DESC";

    const [rowsResult, countResult] = await Promise.all([
      db.execute(sql.raw(`
        SELECT mf.*,
               t.move_number, t.origin, t.destination,
               CONCAT(u.first_name,' ',u.last_name) AS driver_name
        FROM move_financials mf
        LEFT JOIN trips t   ON t.id  = mf.move_id
        LEFT JOIN drivers d ON d.id  = mf.driver_id
        LEFT JOIN users u   ON u.id  = d.user_id
        ${where}
        ORDER BY ${orderCol} ${orderDir} NULLS LAST
        LIMIT ${limit} OFFSET ${offset}
      `)),
      db.execute(sql.raw(`SELECT COUNT(*)::int AS total FROM move_financials mf ${where}`)),
    ]);

    return res.json({
      rows:  (rowsResult as any).rows ?? [],
      total: ((countResult as any).rows?.[0] as any)?.total ?? 0,
      limit, offset,
    });
  } catch (err: any) {
    console.error("[move-financials/list]", err);
    return res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  GET /:moveId — Single move detail
// ═════════════════════════════════════════════════════════════════════════════
router.get("/:moveId", isAuthenticated, async (req: any, res) => {
  try {
    const moveId = safeStr(req.params.moveId);

    const mfResult = await db.execute(sql.raw(`
      SELECT mf.*,
             t.move_number, t.origin, t.destination, t.status, t.execution_mode,
             t.bill_rate, t.pay_rate, t.distance, t.duration,
             CONCAT(u.first_name,' ',u.last_name) AS driver_name,
             inv.invoice_number,
             inv.billing_period_start AS inv_period_start,
             inv.billing_period_end   AS inv_period_end,
             rt.provider              AS rideshare_provider,
             rt.rider_name,
             de.total_amount          AS earnings_total_amount,
             de.pay_type              AS earnings_pay_type,
             de.status                AS earnings_status
      FROM move_financials mf
      LEFT JOIN trips t     ON t.id  = mf.move_id
      LEFT JOIN drivers d   ON d.id  = mf.driver_id
      LEFT JOIN users u     ON u.id  = d.user_id
      LEFT JOIN invoices inv ON inv.id = mf.invoice_id
      LEFT JOIN rideshare_transactions rt ON rt.id = mf.rideshare_transaction_id
      LEFT JOIN driver_earnings de ON de.id = mf.driver_earnings_id
      WHERE mf.move_id = '${moveId}' LIMIT 1
    `));

    if (!(mfResult as any).rows?.length) {
      return res.status(404).json({ message: "Move financial record not found." });
    }

    const excRes = await db.execute(sql.raw(
      `SELECT * FROM margin_exceptions WHERE move_id = '${moveId}' ORDER BY created_at DESC`
    ));

    return res.json({
      ...((mfResult as any).rows[0] as any),
      exceptions: (excRes as any).rows ?? [],
    });
  } catch (err: any) {
    console.error("[move-financials/detail]", err);
    return res.status(500).json({ message: err.message });
  }
});

export default router;
