/**
 * Margin Intelligence Routes
 * Serves pre-computed snapshots from margin analysis tables.
 * POST /run triggers a fresh analysis.
 */

import { Router, Request, Response } from "express";
import { db } from "../db";
import { sql, eq, desc } from "drizzle-orm";
import { runMarginEngine } from "../services/marginEngine";
import { marginAccountAnalysis, marginDriverAnalysis, marginTripAnalysis } from "@shared/schema";

const router = Router();

// ── POST /run — trigger a full margin analysis ────────────────────────────────
router.post("/run", async (req: any, res: Response) => {
  try {
    const orgId = req.user?.orgId ?? null;
    console.log("[MarginEngine] Starting analysis…");
    const result = await runMarginEngine({ orgId, periodMonths: 12 });
    console.log("[MarginEngine] Done:", result);
    res.json({ success: true, ...result, snapshotDate: new Date().toISOString() });
  } catch (err: any) {
    console.error("[margin/run]", err);
    res.status(500).json({ message: err.message || "Margin analysis failed" });
  }
});

// ── GET /accounts — latest account margin snapshot ───────────────────────────
router.get("/accounts", async (req: any, res: Response) => {
  try {
    const orgId = req.user?.orgId ?? null;

    // Try the snapshot table first
    const snapRows = await db.execute(sql`
      SELECT DISTINCT ON (account_id)
        id, account_id, account_name, period_start, period_end,
        revenue::float, driver_cost::float, payroll_burden::float,
        contractor_cost::float, vendor_allocation::float,
        claims_allocation::float, admin_allocation::float,
        total_cost::float, contribution_margin::float,
        margin_pct::float, invoice_count, driver_count,
        flag_for_repricing, snapshot_date
      FROM margin_account_analysis
      WHERE ${orgId ? sql`org_id = ${orgId}` : sql`1=1`}
      ORDER BY account_id, snapshot_date DESC
    `);

    if ((snapRows.rows as any[]).length > 0) {
      return res.json(snapRows.rows);
    }

    // Fallback: live computation (no DB write)
    const now = new Date();
    const start = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().split("T")[0];

    const liveRows = await db.execute(sql`
      SELECT
        i.customer_id AS account_id,
        COALESCE(c.customer_name, i.customer_name, 'Unknown') AS account_name,
        COALESCE(SUM(CAST(i.total_amount AS numeric)), 0)::float AS revenue,
        COUNT(i.id)::int AS invoice_count,
        c.health, c.status
      FROM invoices i
      LEFT JOIN customers c ON c.id = i.customer_id AND c.is_deleted = false
      WHERE i.invoice_date >= ${start}::date
        AND i.status IN ('paid', 'sent', 'approved')
        AND i.is_deleted = false
      GROUP BY i.customer_id, i.customer_name, c.customer_name, c.health, c.status
      ORDER BY revenue DESC
      LIMIT 100
    `);

    const live = (liveRows.rows as any[]).map(row => {
      const revenue = Number(row.revenue);
      const contractorCost   = revenue * 0.55;
      const payrollBurden    = revenue * 0.07;
      const vendorAllocation = revenue * 0.03;
      const claimsAllocation = revenue * 0.02;
      const adminAllocation  = revenue * 0.04;
      const totalCost        = contractorCost + payrollBurden + vendorAllocation + claimsAllocation + adminAllocation;
      const contributionMargin = revenue - totalCost;
      const marginPct = revenue > 0 ? contributionMargin / revenue : 0;
      return {
        account_id: row.account_id, account_name: row.account_name,
        period_start: start, period_end: new Date().toISOString().split("T")[0],
        revenue, driver_cost: payrollBurden, payroll_burden: payrollBurden,
        contractor_cost: contractorCost, vendor_allocation: vendorAllocation,
        claims_allocation: claimsAllocation, admin_allocation: adminAllocation,
        total_cost: totalCost, contribution_margin: contributionMargin,
        margin_pct: marginPct, invoice_count: row.invoice_count,
        driver_count: 0, flag_for_repricing: marginPct < 0.15 && revenue > 1000,
        snapshot_date: null, health: row.health, status: row.status,
      };
    });

    res.json(live);
  } catch (err: any) {
    console.error("[margin/accounts]", err);
    res.status(500).json({ message: "Failed to load account margins" });
  }
});

// ── GET /drivers — latest driver margin snapshot ──────────────────────────────
router.get("/drivers", async (req: any, res: Response) => {
  try {
    const orgId = req.user?.orgId ?? null;

    const snapRows = await db.execute(sql`
      SELECT DISTINCT ON (driver_id)
        id, driver_id, driver_name, driver_number, classification,
        period_start, period_end,
        revenue_attributed::float, driver_cost::float, payroll_burden::float,
        claims_allocation::float, admin_allocation::float,
        total_cost::float, contribution_margin::float,
        margin_pct::float, hours_worked::float, trips_count, snapshot_date
      FROM margin_driver_analysis
      WHERE ${orgId ? sql`org_id = ${orgId}` : sql`1=1`}
      ORDER BY driver_id, snapshot_date DESC
    `);

    if ((snapRows.rows as any[]).length > 0) {
      return res.json(snapRows.rows);
    }

    // Fallback: live driver data
    const fallback = await db.execute(sql`
      SELECT
        d.id AS driver_id,
        COALESCE(u.first_name || ' ' || u.last_name, d.driver_number, 'Unknown') AS driver_name,
        d.driver_number,
        d.driver_classification AS classification,
        COALESCE(CAST(d.pay_rate AS numeric), CAST(d.driver_shift_pay_rate AS numeric), 0)::float AS pay_rate,
        COALESCE(d.hours_ytd, 0)::float AS hours_worked,
        COALESCE(d.hours_mtd, 0)::float AS hours_mtd
      FROM drivers d
      LEFT JOIN users u ON u.id = d.user_id
      WHERE d.is_deleted = false AND d.status = 'Active'
      ORDER BY hours_worked DESC
      LIMIT 100
    `);

    const live = (fallback.rows as any[]).map(r => {
      const driverCost = Number(r.pay_rate) * Number(r.hours_worked);
      const isEmployee = !r.classification?.includes("Independent");
      const payrollBurden = isEmployee ? driverCost * 0.22 : 0;
      const totalCost = driverCost + payrollBurden;
      return {
        driver_id: r.driver_id, driver_name: r.driver_name, driver_number: r.driver_number,
        classification: r.classification, revenue_attributed: 0, driver_cost: driverCost,
        payroll_burden: payrollBurden, claims_allocation: 0, admin_allocation: driverCost * 0.04,
        total_cost: totalCost, contribution_margin: null, margin_pct: null,
        hours_worked: r.hours_worked, trips_count: 0, snapshot_date: null,
      };
    });

    res.json(live);
  } catch (err: any) {
    console.error("[margin/drivers]", err);
    res.status(500).json({ message: "Failed to load driver margins" });
  }
});

// ── GET /trips — latest trip margin snapshot ──────────────────────────────────
router.get("/trips", async (req: any, res: Response) => {
  try {
    const orgId = req.user?.orgId ?? null;
    const { accountId, limit = "200" } = req.query as any;

    const rows = await db.execute(sql`
      SELECT
        id, invoice_line_id, invoice_id, account_id, account_name,
        trip_date, revenue::float, driver_cost::float,
        overhead_allocation::float, claims_allocation::float,
        contribution_margin::float, margin_pct::float, snapshot_date
      FROM margin_trip_analysis
      WHERE ${orgId ? sql`org_id = ${orgId}` : sql`1=1`}
        ${accountId ? sql`AND account_id = ${accountId}` : sql``}
      ORDER BY snapshot_date DESC, trip_date DESC
      LIMIT ${parseInt(limit)}
    `);

    // Aggregate for summary stats
    const all = rows.rows as any[];
    const totRevenue = all.reduce((s, r) => s + Number(r.revenue), 0);
    const totContrib = all.reduce((s, r) => s + Number(r.contribution_margin), 0);
    const avgMargin  = totRevenue > 0 ? totContrib / totRevenue : 0;

    res.json({
      trips: all,
      summary: {
        tripCount: all.length,
        totalRevenue: totRevenue,
        totalContributionMargin: totContrib,
        avgMarginPct: avgMargin,
        hasSnapshot: all.length > 0,
      },
    });
  } catch (err: any) {
    console.error("[margin/trips]", err);
    res.status(500).json({ message: "Failed to load trip margins" });
  }
});

// ── GET /last-snapshot — when was the last run? ───────────────────────────────
router.get("/last-snapshot", async (req: any, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT MAX(snapshot_date) AS last_run FROM margin_account_analysis
    `);
    const lastRun = (rows.rows[0] as any)?.last_run ?? null;
    res.json({ lastRun });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to check snapshot" });
  }
});

export default router;
