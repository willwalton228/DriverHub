/**
 * Autonomous Rolling 12-Month Forecast Engine
 * Runs nightly — pulls live data from all operational modules and generates
 * a 12-month rolling forecast stored in forecast_snapshots.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the first day of a month offset from today */
function monthStart(offsetMonths: number): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() + offsetMonths);
  return d;
}

/** Format a Date as YYYY-MM-DD */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Simple linear-regression slope over an ordered numeric series */
function slope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** Clamp a number to [min, max] */
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ─────────────────────────────────────────────────────────────────────────────
// Data-Pull Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface MonthlyRevenue {
  monthKey: string;   // 'YYYY-MM'
  total: number;
}

/** Trailing 12 months of invoiced revenue grouped by month */
async function fetchMonthlyRevenue(): Promise<MonthlyRevenue[]> {
  const rows = await db.execute(sql`
    SELECT
      to_char(invoice_date, 'YYYY-MM') AS month_key,
      SUM(total_amount::numeric)       AS total
    FROM invoices
    WHERE
      invoice_date >= NOW() - INTERVAL '12 months'
      AND is_voided IS NOT TRUE
      AND status NOT IN ('draft', 'cancelled')
    GROUP BY month_key
    ORDER BY month_key ASC
  `);
  return (rows.rows as any[]).map((r) => ({
    monthKey: r.month_key,
    total: parseFloat(r.total ?? "0"),
  }));
}

interface EmployeeStats {
  activeCount: number;
  avgMonthlyCost: number; // fully-burdened
  hasData: boolean;
}

/** Active employee count + average monthly labor cost */
async function fetchEmployeeStats(): Promise<EmployeeStats> {
  const countRow = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM employees WHERE status = 'active'
  `);
  const activeCount = parseInt((countRow.rows[0] as any)?.cnt ?? "0", 10);

  if (activeCount === 0) {
    return { activeCount: 0, avgMonthlyCost: 0, hasData: false };
  }

  // Avg hourly rate × FTE hours (173/mo) + 25% burden; fallback $5,500/mo
  const rateRow = await db.execute(sql`
    SELECT AVG(hourly_rate::numeric) AS avg_rate FROM employees
    WHERE status = 'active' AND hourly_rate IS NOT NULL AND hourly_rate > 0
  `);
  const avgRate = parseFloat((rateRow.rows[0] as any)?.avg_rate ?? "0");
  const avgMonthlyCost = avgRate > 0
    ? avgRate * 173 * 1.25
    : 5500;

  return { activeCount, avgMonthlyCost, hasData: true };
}

interface ContractorStats {
  activeCount: number;
  avgMonthlyPay: number;
  scheduledMonthly: number; // actual scheduled cost if available
  hasData: boolean;
}

/** Active IC driver count + avg monthly contractor cost */
async function fetchContractorStats(): Promise<ContractorStats> {
  const countRow = await db.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM drivers
    WHERE status = 'active'
      AND driver_type ILIKE '%independent%'
      AND is_deleted IS NOT TRUE
  `);
  const activeCount = parseInt((countRow.rows[0] as any)?.cnt ?? "0", 10);

  // Try to get avg pay rate
  const rateRow = await db.execute(sql`
    SELECT AVG(pay_rate::numeric) AS avg_rate
    FROM drivers
    WHERE status = 'active'
      AND driver_type ILIKE '%independent%'
      AND pay_rate IS NOT NULL AND pay_rate > 0
      AND is_deleted IS NOT TRUE
  `);
  const avgRate = parseFloat((rateRow.rows[0] as any)?.avg_rate ?? "0");
  const avgMonthlyPay = avgRate > 0
    ? avgRate * 120    // 120 hrs/mo typical IC utilization
    : activeCount > 0 ? 3200 : 0;

  // Scheduled cost from scheduling_assignments in last 30 days
  const schedRow = await db.execute(sql`
    SELECT COALESCE(SUM(estimated_cost::numeric), 0) AS scheduled
    FROM scheduling_assignments
    WHERE created_at >= NOW() - INTERVAL '30 days'
      AND estimated_cost IS NOT NULL
  `);
  const scheduledMonthly = parseFloat((schedRow.rows[0] as any)?.scheduled ?? "0");

  return {
    activeCount,
    avgMonthlyPay,
    scheduledMonthly,
    hasData: activeCount > 0 || scheduledMonthly > 0,
  };
}

interface VendorCostStats {
  monthlyFixed: number;    // subscription + flat contracts
  hasData: boolean;
}

/** Active vendor contract pricing — monthly equivalent */
async function fetchVendorCostStats(): Promise<VendorCostStats> {
  const today = toDateStr(new Date());

  const rows = await db.execute(sql`
    SELECT pricing_type, unit_rate::numeric AS rate
    FROM vendor_pricing
    WHERE (effective_end IS NULL OR effective_end >= ${today}::date)
      AND unit_rate IS NOT NULL AND unit_rate > 0
  `);

  let monthlyFixed = 0;
  for (const r of rows.rows as any[]) {
    const rate = parseFloat(r.rate ?? "0");
    switch (r.pricing_type) {
      case "subscription": monthlyFixed += rate; break;
      case "flat":         monthlyFixed += rate / 12; break; // annualized
      case "hourly":       monthlyFixed += rate * 40 * 4.33; break; // estimated usage
      case "per_trip":     monthlyFixed += rate * 200; break; // estimated 200 trips/mo
      case "usage":        monthlyFixed += rate * 1000; break; // estimated units
    }
  }

  return { monthlyFixed, hasData: (rows.rows as any[]).length > 0 };
}

interface ClaimsStats {
  monthlyExposure: number;
  trend: number;     // slope of monthly exposure — positive = rising
  hasData: boolean;
}

/** Trailing 12-month claims exposure (insurance reserve / probable cost) */
async function fetchClaimsStats(): Promise<ClaimsStats> {
  const rows = await db.execute(sql`
    SELECT
      to_char(COALESCE(accident_date, created_at), 'YYYY-MM') AS month_key,
      SUM(
        COALESCE(insurance_reserve, probable_cost, total_estimate, 0)::numeric
      ) AS exposure
    FROM accidents
    WHERE
      COALESCE(accident_date, created_at) >= NOW() - INTERVAL '12 months'
      AND is_deleted IS NOT TRUE
    GROUP BY month_key
    ORDER BY month_key ASC
  `);

  const months = (rows.rows as any[]).map((r) => parseFloat(r.exposure ?? "0"));
  if (months.length === 0) {
    return { monthlyExposure: 0, trend: 0, hasData: false };
  }

  const avg = months.reduce((a, b) => a + b, 0) / months.length;
  const trendSlope = slope(months);

  return { monthlyExposure: avg, trend: trendSlope, hasData: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Engine
// ─────────────────────────────────────────────────────────────────────────────

interface ForecastMonth {
  periodMonth: string;       // YYYY-MM-DD (first of month)
  revenue: number;
  laborCost: number;
  contractorCost: number;
  vendorCost: number;
  claimsCost: number;
  overhead: number;
  netProfit: number;
  confidence: number;
}

async function buildForecast(): Promise<ForecastMonth[]> {
  // Gather all live data in parallel
  const [monthlyRevenue, empStats, contractorStats, vendorStats, claimsStats] = await Promise.all([
    fetchMonthlyRevenue(),
    fetchEmployeeStats(),
    fetchContractorStats(),
    fetchVendorCostStats(),
    fetchClaimsStats(),
  ]);

  // ── Revenue baseline ─────────────────────────────────────────────────────
  const revenueValues = monthlyRevenue.map((m) => m.total);
  const ttmRevenue = revenueValues.reduce((a, b) => a + b, 0);
  const baseMonthlyRevenue = revenueValues.length > 0
    ? ttmRevenue / revenueValues.length
    : 0;

  // Trend from last 6 data-points (more recent weight)
  const recentValues = revenueValues.slice(-6);
  const revenueTrend = slope(recentValues);
  const revenueTrendPct = baseMonthlyRevenue > 0
    ? clamp(revenueTrend / baseMonthlyRevenue, -0.05, 0.10) // cap ±5–10%/mo
    : 0;

  // ── Contractor monthly cost ──────────────────────────────────────────────
  // Prefer actual scheduled data if it's >= 50% of IC count × default
  const contractorBase = contractorStats.scheduledMonthly > 0
    ? (contractorStats.scheduledMonthly + contractorStats.avgMonthlyPay * contractorStats.activeCount) / 2
    : contractorStats.avgMonthlyPay * contractorStats.activeCount;

  // ── Confidence score (0–100) ─────────────────────────────────────────────
  let confidence = 0;
  if (revenueValues.length >= 6) confidence += 35;
  else if (revenueValues.length > 0) confidence += 15;
  if (contractorStats.hasData) confidence += 20;
  if (empStats.hasData) confidence += 15;
  if (vendorStats.hasData) confidence += 15;
  if (claimsStats.hasData) confidence += 15;
  confidence = Math.min(100, confidence);

  // ── Build 12 monthly projections ─────────────────────────────────────────
  const forecast: ForecastMonth[] = [];
  for (let i = 1; i <= 12; i++) {
    const periodDate = monthStart(i);
    const periodMonth = toDateStr(periodDate);

    // Revenue: base + compounding trend
    const revenue = Math.max(0,
      baseMonthlyRevenue * Math.pow(1 + revenueTrendPct, i)
    );

    // Labor: employee cost is relatively stable — slight headcount drift assumption
    const laborCost = empStats.activeCount * empStats.avgMonthlyCost;

    // Contractor: IC cost scales loosely with revenue growth
    const contractorCost = contractorBase * Math.pow(1 + clamp(revenueTrendPct * 0.8, -0.03, 0.05), i);

    // Vendor: fixed contracts + minor inflation (0.2%/mo)
    const vendorCost = vendorStats.monthlyFixed * Math.pow(1.002, i);

    // Claims: base exposure + trend extrapolation
    const claimsCost = Math.max(0,
      claimsStats.monthlyExposure + claimsStats.trend * i
    );

    // Overhead: 5% of revenue (variable SG&A) + $500/employee fixed
    const overhead = revenue * 0.05 + empStats.activeCount * 500;

    // Net profit
    const netProfit = revenue - laborCost - contractorCost - vendorCost - claimsCost - overhead;

    forecast.push({
      periodMonth,
      revenue,
      laborCost,
      contractorCost,
      vendorCost,
      claimsCost,
      overhead,
      netProfit,
      confidence,
    });
  }

  return forecast;
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot Writer
// ─────────────────────────────────────────────────────────────────────────────

async function writeForecastSnapshots(
  snapshotDate: string,
  months: ForecastMonth[]
): Promise<void> {
  // Delete any existing snapshots for this snapshot_date (idempotent re-runs)
  await db.execute(sql`
    DELETE FROM forecast_snapshots WHERE snapshot_date = ${snapshotDate}::date
  `);

  for (const m of months) {
    await db.execute(sql`
      INSERT INTO forecast_snapshots (
        id, snapshot_date, period_month,
        revenue_forecast, labor_cost_forecast, contractor_cost_forecast,
        vendor_cost_forecast, claims_cost_forecast, overhead_forecast,
        net_profit_forecast, forecast_confidence, created_at
      ) VALUES (
        gen_random_uuid(),
        ${snapshotDate}::date,
        ${m.periodMonth}::date,
        ${m.revenue.toFixed(2)},
        ${m.laborCost.toFixed(2)},
        ${m.contractorCost.toFixed(2)},
        ${m.vendorCost.toFixed(2)},
        ${m.claimsCost.toFixed(2)},
        ${m.overhead.toFixed(2)},
        ${m.netProfit.toFixed(2)},
        ${m.confidence},
        NOW()
      )
    `);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public Entry Point
// ─────────────────────────────────────────────────────────────────────────────

export interface ForecastRunResult {
  snapshotDate: string;
  monthsGenerated: number;
  confidence: number;
  totalRevenueForecast: number;
  totalNetProfitForecast: number;
}

export async function runForecastEngine(): Promise<ForecastRunResult> {
  const snapshotDate = toDateStr(new Date());
  console.log(`[ForecastEngine] Running forecast snapshot for ${snapshotDate}…`);

  const months = await buildForecast();
  await writeForecastSnapshots(snapshotDate, months);

  const totalRevenue = months.reduce((s, m) => s + m.revenue, 0);
  const totalNetProfit = months.reduce((s, m) => s + m.netProfit, 0);
  const confidence = months[0]?.confidence ?? 0;

  console.log(
    `[ForecastEngine] Snapshot complete: ${months.length} months, ` +
    `confidence=${confidence}, annualRevenue=$${Math.round(totalRevenue).toLocaleString()}`
  );

  return {
    snapshotDate,
    monthsGenerated: months.length,
    confidence,
    totalRevenueForecast: totalRevenue,
    totalNetProfitForecast: totalNetProfit,
  };
}
