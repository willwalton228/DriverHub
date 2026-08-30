/**
 * Margin Engine
 * Computes true per-account, per-driver, and per-trip profitability
 * from live transactional data and saves snapshots to analysis tables.
 *
 * Cost Allocation Model:
 *   Account margin = Revenue - Driver Cost - Payroll Burden - Contractor Cost
 *                             - Vendor Allocation - Claims Allocation - Admin Allocation
 *
 * Assumptions (industry benchmarks for transportation/logistics):
 *   - Employee payroll burden (taxes + benefits) = 22% on top of base salary
 *   - Admin overhead allocation = 4% of total org revenue spread proportionally
 *   - Vendor costs allocated proportionally by account revenue share
 */

import { db } from "../db";
import { sql, eq, gte, lte, and, or } from "drizzle-orm";
import { invoices, customers, employees, drivers, users } from "@shared/schema";

const PAYROLL_BURDEN_RATE = 0.22;   // 22% employer taxes + benefits on top of salary
const ADMIN_OVERHEAD_PCT  = 0.04;   // 4% of revenue allocated to admin overhead
const TARGET_MARGIN_PCT   = 0.15;   // 15% minimum healthy margin

interface EngineOptions {
  orgId?: string | null;
  periodMonths?: number; // default 12 (TTM)
}

interface OrgTotals {
  revenue: number;
  annualEmployeeCost: number;  // salaries + burden
  vendorCosts: number;
  totalClaims: number;
}

export async function runMarginEngine(opts: EngineOptions = {}): Promise<{
  accounts: number;
  drivers: number;
  trips: number;
}> {
  const periodMonths = opts.periodMonths ?? 12;
  const now = new Date();
  const periodStart = new Date(now.getFullYear() - Math.floor(periodMonths / 12), now.getMonth() - (periodMonths % 12), 1);
  const startStr = periodStart.toISOString().split("T")[0];
  const endStr   = now.toISOString().split("T")[0];

  // ── Step 1: Aggregate org-wide totals (for proportional allocations) ────────
  const orgTotals = await computeOrgTotals(startStr, endStr);

  // ── Step 2: Account margin analysis ─────────────────────────────────────────
  const accountCount = await computeAccountMargins(startStr, endStr, orgTotals, opts.orgId ?? null);

  // ── Step 3: Driver margin analysis ──────────────────────────────────────────
  const driverCount = await computeDriverMargins(startStr, endStr, orgTotals, opts.orgId ?? null);

  // ── Step 4: Trip margin analysis (invoice-line level) ───────────────────────
  const tripCount = await computeTripMargins(startStr, endStr, orgTotals, opts.orgId ?? null);

  return { accounts: accountCount, drivers: driverCount, trips: tripCount };
}

// ── Org-wide totals ──────────────────────────────────────────────────────────
async function computeOrgTotals(start: string, end: string): Promise<OrgTotals> {
  // Total revenue from invoices
  const revRows = await db.execute(sql`
    SELECT COALESCE(SUM(CAST(total_amount AS numeric)), 0) AS revenue
    FROM invoices
    WHERE invoice_date >= ${start}::date
      AND invoice_date <= ${end}::date
      AND status IN ('paid', 'sent', 'approved')
      AND is_deleted = false
  `);
  const revenue = Number((revRows.rows[0] as any)?.revenue ?? 0);

  // Employee cost: annual salary + burden (or hourly * estimated annual hours)
  const empRows = await db.execute(sql`
    SELECT
      COALESCE(SUM(
        CASE
          WHEN annual_salary IS NOT NULL AND annual_salary::numeric > 0
            THEN annual_salary::numeric * ${1 + PAYROLL_BURDEN_RATE}
          WHEN hourly_rate IS NOT NULL AND hourly_rate::numeric > 0
            THEN hourly_rate::numeric * 2080 * ${1 + PAYROLL_BURDEN_RATE}
          ELSE 0
        END
      ), 0) AS annual_employee_cost
    FROM employees
    WHERE status = 'Active' OR status IS NULL
  `);
  const annualEmployeeCost = Number((empRows.rows[0] as any)?.annual_employee_cost ?? 0);

  // Vendor costs from vendor_pricing (sum of active contracts)
  const vendorRows = await db.execute(sql`
    SELECT COALESCE(SUM(CAST(unit_rate AS numeric)), 0) AS vendor_costs
    FROM vendor_pricing
    WHERE (effective_end IS NULL OR effective_end >= ${start}::date)
      AND effective_start <= ${end}::date
  `);
  const vendorCosts = Number((vendorRows.rows[0] as any)?.vendor_costs ?? 0);

  // Total claims in period
  const claimsRows = await db.execute(sql`
    SELECT COALESCE(SUM(CAST(reserve_amount AS numeric)), 0) AS total_claims
    FROM claims
    WHERE created_at >= ${start}::timestamp
      AND created_at <= ${end}::timestamp
      AND is_deleted = false
  `);
  const totalClaims = Number((claimsRows.rows[0] as any)?.total_claims ?? 0);

  return { revenue, annualEmployeeCost, vendorCosts, totalClaims };
}

// ── Account margin ───────────────────────────────────────────────────────────
async function computeAccountMargins(
  start: string, end: string,
  org: OrgTotals, orgId: string | null
): Promise<number> {
  // Revenue per account
  const revenueRows = await db.execute(sql`
    SELECT
      i.customer_id AS account_id,
      COALESCE(MAX(c.customer_name), i.customer_name) AS account_name,
      COALESCE(SUM(CAST(i.total_amount AS numeric)), 0)  AS revenue,
      COUNT(i.id)::int                                   AS invoice_count
    FROM invoices i
    LEFT JOIN customers c ON c.id = i.customer_id AND c.is_deleted = false
    WHERE i.invoice_date >= ${start}::date
      AND i.invoice_date <= ${end}::date
      AND i.status IN ('paid', 'sent', 'approved')
      AND i.is_deleted = false
    GROUP BY i.customer_id, i.customer_name
    ORDER BY revenue DESC
    LIMIT 100
  `);

  // Claims per account
  const claimsRows = await db.execute(sql`
    SELECT account_id, COALESCE(SUM(CAST(reserve_amount AS numeric)), 0) AS claims
    FROM claims
    WHERE created_at >= ${start}::timestamp
      AND created_at <= ${end}::timestamp
      AND is_deleted = false
      AND account_id IS NOT NULL
    GROUP BY account_id
  `);
  const claimsMap: Record<string, number> = {};
  for (const r of claimsRows.rows as any[]) claimsMap[r.account_id] = Number(r.claims);

  // IC driver cost per account (driver_accounts + schedules + pay_rate)
  const icCostRows = await db.execute(sql`
    SELECT
      da.customer_id AS account_id,
      COALESCE(SUM(CAST(d.pay_rate AS numeric) * COALESCE(d.hours_ytd, 0)), 0) AS ic_cost,
      COUNT(DISTINCT da.driver_id)::int AS driver_count
    FROM driver_accounts da
    JOIN drivers d ON d.id = da.driver_id AND d.is_deleted = false
    WHERE d.driver_classification = 'Independent Contractor'
      AND da.assignment_ended_at IS NULL
    GROUP BY da.customer_id
  `);
  const icMap: Record<string, { cost: number; count: number }> = {};
  for (const r of icCostRows.rows as any[]) {
    icMap[r.account_id] = { cost: Number(r.ic_cost), count: Number(r.driver_count) };
  }

  // Employee driver count per account (for payroll burden allocation)
  const empDriverRows = await db.execute(sql`
    SELECT da.customer_id AS account_id, COUNT(DISTINCT da.driver_id)::int AS emp_driver_count
    FROM driver_accounts da
    JOIN drivers d ON d.id = da.driver_id AND d.is_deleted = false
    WHERE (d.driver_classification != 'Independent Contractor'
       OR d.driver_classification IS NULL)
      AND da.assignment_ended_at IS NULL
    GROUP BY da.customer_id
  `);
  const empDriverMap: Record<string, number> = {};
  for (const r of empDriverRows.rows as any[]) empDriverMap[r.account_id] = Number(r.emp_driver_count);

  // Org-wide driver count for proportional employee cost allocation
  const totalDriversResult = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM drivers WHERE is_deleted = false AND status = 'Active'`);
  const totalDrivers = Number((totalDriversResult.rows[0] as any)?.cnt ?? 1) || 1;

  // Delete previous snapshot for this period
  await db.execute(sql`
    DELETE FROM margin_account_analysis
    WHERE period_start = ${start}::date AND period_end = ${end}::date
  `);

  let count = 0;
  for (const row of revenueRows.rows as any[]) {
    const revenue = Number(row.revenue);
    if (revenue <= 0) continue;

    const accountId = row.account_id;
    const revShare  = org.revenue > 0 ? revenue / org.revenue : 0;

    // Driver cost (IC)
    const contractorCost = icMap[accountId]?.cost ?? (revenue * 0.35); // fallback 35% of revenue

    // Employee payroll burden: allocate proportional to driver count
    const empDriverCount   = empDriverMap[accountId] ?? 0;
    const acctDriverCount  = (icMap[accountId]?.count ?? 0) + empDriverCount;
    const payrollBurden    = totalDrivers > 0
      ? (org.annualEmployeeCost * empDriverCount / totalDrivers)
      : (revenue * 0.10); // fallback 10%

    // Driver cost (employee-type drivers) — already captured in payrollBurden
    const driverCost = payrollBurden; // same as payroll burden for employee drivers at account level

    // Vendor allocation: proportional by revenue share
    const vendorAllocation = org.vendorCosts * revShare;

    // Claims allocation: direct for account, remainder proportional
    const directClaims = claimsMap[accountId] ?? 0;
    const proRataClaims = (org.totalClaims - Object.values(claimsMap).reduce((a, b) => a + b, 0)) * revShare;
    const claimsAllocation = directClaims + Math.max(0, proRataClaims);

    // Admin allocation: 4% of this account's revenue
    const adminAllocation = revenue * ADMIN_OVERHEAD_PCT;

    const totalCost = contractorCost + payrollBurden + vendorAllocation + claimsAllocation + adminAllocation;
    const contributionMargin = revenue - totalCost;
    const marginPct = revenue > 0 ? contributionMargin / revenue : 0;
    const flagForRepricing = marginPct < TARGET_MARGIN_PCT && revenue > 1000;

    await db.execute(sql`
      INSERT INTO margin_account_analysis
        (id, org_id, account_id, account_name, period_start, period_end,
         revenue, driver_cost, payroll_burden, contractor_cost,
         vendor_allocation, claims_allocation, admin_allocation,
         total_cost, contribution_margin, margin_pct,
         invoice_count, driver_count, flag_for_repricing, snapshot_date)
      VALUES
        (gen_random_uuid(), ${orgId}, ${accountId}, ${row.account_name},
         ${start}::date, ${end}::date,
         ${revenue}, ${driverCost}, ${payrollBurden}, ${contractorCost},
         ${vendorAllocation}, ${claimsAllocation}, ${adminAllocation},
         ${totalCost}, ${contributionMargin}, ${marginPct},
         ${row.invoice_count}, ${acctDriverCount}, ${flagForRepricing}, NOW())
    `);
    count++;
  }

  return count;
}

// ── Driver margin ────────────────────────────────────────────────────────────
async function computeDriverMargins(
  start: string, end: string,
  org: OrgTotals, orgId: string | null
): Promise<number> {
  const driverRows = await db.execute(sql`
    SELECT
      d.id,
      COALESCE(u.first_name || ' ' || u.last_name, d.driver_number, 'Unknown') AS driver_name,
      d.driver_number,
      d.driver_classification AS classification,
      COALESCE(CAST(d.pay_rate AS numeric), CAST(d.driver_shift_pay_rate AS numeric), 0) AS pay_rate,
      COALESCE(d.hours_ytd, 0) AS hours_ytd,
      COALESCE(d.hours_mtd, 0) AS hours_mtd
    FROM drivers d
    LEFT JOIN users u ON u.id = d.user_id
    WHERE d.is_deleted = false
      AND d.status = 'Active'
    LIMIT 200
  `);

  // Claims per driver
  const claimsRows = await db.execute(sql`
    SELECT driver_id, COALESCE(SUM(CAST(reserve_amount AS numeric)), 0) AS claims
    FROM claims
    WHERE created_at >= ${start}::timestamp
      AND created_at <= ${end}::timestamp
      AND is_deleted = false
      AND driver_id IS NOT NULL
    GROUP BY driver_id
  `);
  const claimsMap: Record<string, number> = {};
  for (const r of claimsRows.rows as any[]) claimsMap[r.driver_id] = Number(r.claims);

  // Revenue attributed per driver (from accounts they serve)
  const revRows = await db.execute(sql`
    SELECT da.driver_id,
           COALESCE(SUM(CAST(i.total_amount AS numeric)), 0) AS revenue
    FROM driver_accounts da
    JOIN invoices i ON i.customer_id = da.customer_id
    WHERE i.invoice_date >= ${start}::date
      AND i.invoice_date <= ${end}::date
      AND i.status IN ('paid', 'sent', 'approved')
      AND i.is_deleted = false
      AND da.assignment_ended_at IS NULL
    GROUP BY da.driver_id
  `);
  const revMap: Record<string, number> = {};
  for (const r of revRows.rows as any[]) revMap[r.driver_id] = Number(r.revenue);

  // Delete previous snapshot
  await db.execute(sql`
    DELETE FROM margin_driver_analysis
    WHERE period_start = ${start}::date AND period_end = ${end}::date
  `);

  let count = 0;
  for (const row of driverRows.rows as any[]) {
    const payRate    = Number(row.pay_rate);
    const hoursYtd   = Number(row.hours_ytd);
    const driverCost = payRate * hoursYtd;
    const isEmployee = !row.classification?.includes("Independent");

    const payrollBurden  = isEmployee ? driverCost * PAYROLL_BURDEN_RATE : 0;
    const claimsAlloc    = claimsMap[row.id] ?? 0;
    const adminAlloc     = driverCost > 0 ? driverCost * ADMIN_OVERHEAD_PCT : 0;
    const totalCost      = driverCost + payrollBurden + claimsAlloc + adminAlloc;
    const revenueAttr    = revMap[row.id] ?? 0;
    const contribMargin  = revenueAttr - totalCost;
    const marginPct      = revenueAttr > 0 ? contribMargin / revenueAttr : 0;

    await db.execute(sql`
      INSERT INTO margin_driver_analysis
        (id, org_id, driver_id, driver_name, driver_number, classification,
         period_start, period_end,
         revenue_attributed, driver_cost, payroll_burden, claims_allocation,
         admin_allocation, total_cost, contribution_margin, margin_pct,
         hours_worked, trips_count, snapshot_date)
      VALUES
        (gen_random_uuid(), ${orgId}, ${row.id}, ${row.driver_name}, ${row.driver_number},
         ${row.classification},
         ${start}::date, ${end}::date,
         ${revenueAttr}, ${driverCost}, ${payrollBurden}, ${claimsAlloc},
         ${adminAlloc}, ${totalCost}, ${contribMargin}, ${marginPct},
         ${hoursYtd}, 0, NOW())
    `);
    count++;
  }

  return count;
}

// ── Trip margin (invoice-line level) ─────────────────────────────────────────
async function computeTripMargins(
  start: string, end: string,
  org: OrgTotals, orgId: string | null
): Promise<number> {
  const lineRows = await db.execute(sql`
    SELECT
      il.id AS line_id,
      il.invoice_id,
      i.customer_id AS account_id,
      COALESCE(c.customer_name, i.customer_name) AS account_name,
      i.invoice_date AS trip_date,
      COALESCE(CAST(il.total_amount AS numeric), 0) AS revenue
    FROM invoice_lines il
    JOIN invoices i ON i.id = il.invoice_id
    LEFT JOIN customers c ON c.id = i.customer_id
    WHERE i.invoice_date >= ${start}::date
      AND i.invoice_date <= ${end}::date
      AND i.status IN ('paid', 'sent', 'approved')
      AND i.is_deleted = false
    ORDER BY i.invoice_date DESC
    LIMIT 5000
  `);

  const totalRevenue = (lineRows.rows as any[]).reduce((s, r) => s + Number(r.revenue), 0) || 1;

  // Delete previous snapshot
  await db.execute(sql`
    DELETE FROM margin_trip_analysis
    WHERE trip_date >= ${start}::date
  `);

  // Insert in batches
  const rows = lineRows.rows as any[];
  let count = 0;

  for (const row of rows) {
    const revenue = Number(row.revenue);
    if (revenue <= 0) continue;

    const revShare = revenue / totalRevenue;

    // Driver cost = 62% of trip revenue (industry standard for IC-heavy model)
    const driverCost = revenue * 0.62;
    // Overhead: vendor + admin proportional to revenue share
    const overheadAlloc = (org.vendorCosts + org.annualEmployeeCost * ADMIN_OVERHEAD_PCT) * revShare;
    // Claims: proportional to revenue share
    const claimsAlloc = org.totalClaims * revShare;

    const contributionMargin = revenue - driverCost - overheadAlloc - claimsAlloc;
    const marginPct = revenue > 0 ? contributionMargin / revenue : 0;

    await db.execute(sql`
      INSERT INTO margin_trip_analysis
        (id, org_id, invoice_line_id, invoice_id, account_id, account_name,
         trip_date, revenue, driver_cost, overhead_allocation, claims_allocation,
         contribution_margin, margin_pct, snapshot_date)
      VALUES
        (gen_random_uuid(), ${orgId}, ${row.line_id}, ${row.invoice_id},
         ${row.account_id}, ${row.account_name}, ${row.trip_date}::date,
         ${revenue}, ${driverCost}, ${overheadAlloc}, ${claimsAlloc},
         ${contributionMargin}, ${marginPct}, NOW())
    `);
    count++;
  }

  return count;
}
