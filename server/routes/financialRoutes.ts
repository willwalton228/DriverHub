import { Router, Request, Response } from "express";
import { db } from "../db";
import {
  financialForecasts, financialForecastItems,
  pnlUploads, pnlUploadLines,
  repricingFlags, forecastGoals,
  forecastSnapshots,
  invoices, customers, drivers, employees, users, organizations,
  accidents,
} from "../../shared/schema";
import { eq, desc, asc, sql, and, isNull, gte, lte, or, inArray } from "drizzle-orm";

const router = Router();

// ── helpers ────────────────────────────────────────────────────────────────────
function getOrgId(req: any): string | null {
  return req.user?.orgId ?? null;
}

function getUserId(req: any): string {
  return req.user?.claims?.sub ?? (req.session as any)?.userId ?? "";
}

// Month labels
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Dashboard Summary ─────────────────────────────────────────────────────────
router.get("/dashboard", async (req: any, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const now = new Date();
    const t12Start = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().split("T")[0];
    const pipeline90DaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const todayStr = now.toISOString().split("T")[0];

    // Run all queries in parallel
    const [
      latestForecastRes,
      t12RevenueRes,
      activeAccountsRes,
      activeDriversRes,
      openFlagsRes,
      pnlCountRes,
      forecastSnapshotRes,
      revenueAtRiskRes,
      pipelineRevenueRes,
      claimsExposureRes,
    ] = await Promise.all([
      // Latest forecast (legacy model)
      db.select().from(financialForecasts)
        .where(and(
          orgId ? eq(financialForecasts.orgId, orgId) : sql`1=1`,
          eq(financialForecasts.isLatest, true)
        ))
        .orderBy(desc(financialForecasts.generatedAt))
        .limit(1),

      // TTM Revenue from invoices
      db.select({ total: sql<number>`COALESCE(SUM(CAST(total_amount AS numeric)), 0)` })
        .from(invoices)
        .where(and(
          gte(invoices.invoiceDate, t12Start),
          or(eq(invoices.status, "paid"), eq(invoices.status, "sent"), eq(invoices.status, "approved"))
        )),

      // Active accounts count
      db.select({ count: sql<number>`COUNT(*)` })
        .from(customers)
        .where(and(eq(customers.status, "Active"), eq(customers.isDeleted, false))),

      // Active drivers count
      db.select({ count: sql<number>`COUNT(*)` })
        .from(drivers)
        .where(sql`status = 'Active' AND is_deleted = false`),

      // Open repricing flags count
      db.select({ count: sql<number>`COUNT(*)` })
        .from(repricingFlags)
        .where(and(
          orgId ? eq(repricingFlags.orgId, orgId) : sql`1=1`,
          eq(repricingFlags.status, "open")
        )),

      // P&L upload count
      db.select({ count: sql<number>`COUNT(*)` })
        .from(pnlUploads)
        .where(orgId ? eq(pnlUploads.orgId, orgId) : sql`1=1`),

      // Latest rolling forecast snapshot aggregate (future months only)
      db.execute(sql`
        SELECT
          COALESCE(SUM(CAST(revenue_forecast AS numeric)), 0)    AS forecast_revenue,
          COALESCE(SUM(CAST(net_profit_forecast AS numeric)), 0) AS forecast_net_profit,
          AVG(forecast_confidence)                               AS avg_confidence
        FROM forecast_snapshots
        WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM forecast_snapshots)
          AND period_month >= ${todayStr}
      `),

      // Revenue at risk (sum of estimated_revenue_adjustment from open repricing flags)
      db.execute(sql`
        SELECT COALESCE(SUM(CAST(estimated_revenue_adjustment AS numeric)), 0) AS revenue_at_risk
        FROM repricing_flags
        WHERE status = 'open'
          AND estimated_revenue_adjustment IS NOT NULL
      `),

      // Pipeline contribution — revenue from accounts created in last 90 days
      db.execute(sql`
        SELECT COALESCE(SUM(CAST(i.total_amount AS numeric)), 0) AS pipeline_revenue
        FROM invoices i
        JOIN customers c ON c.id = i.customer_id
        WHERE c.created_at >= ${pipeline90DaysAgo}::timestamp
          AND i.status IN ('paid', 'sent', 'approved')
          AND c.is_deleted = false
      `),

      // Claims exposure — open claims probable cost sum
      db.execute(sql`
        SELECT COALESCE(SUM(CAST(probable_cost AS numeric)), 0) AS claims_exposure
        FROM accidents
        WHERE is_deleted = false
          AND claim_status NOT IN ('PAID','CLOSED','DENIED')
          AND probable_cost IS NOT NULL
      `),
    ]);

    const latestForecast = latestForecastRes[0] ?? null;
    const t12Revenue = Number((t12RevenueRes[0] as any)?.total ?? 0);
    const activeAccounts = Number((activeAccountsRes[0] as any)?.count ?? 0);
    const activeDrivers = Number((activeDriversRes[0] as any)?.count ?? 0);
    const openRepricingFlags = Number((openFlagsRes[0] as any)?.count ?? 0);
    const pnlUploadsCount = Number((pnlCountRes[0] as any)?.count ?? 0);

    const snapRow = (forecastSnapshotRes as any[])[0] ?? {};
    const forecastRevenue = Number(snapRow.forecast_revenue ?? 0);
    const forecastNetProfit = Number(snapRow.forecast_net_profit ?? 0);
    const forecastNetMarginPct = forecastRevenue > 0 ? forecastNetProfit / forecastRevenue : null;
    const forecastConfidence = Number(snapRow.avg_confidence ?? 0);

    const revenueAtRisk = Number(((revenueAtRiskRes as any[])[0] ?? {}).revenue_at_risk ?? 0);
    const pipelineContribution = Number(((pipelineRevenueRes as any[])[0] ?? {}).pipeline_revenue ?? 0);
    const claimsExposure = Number(((claimsExposureRes as any[])[0] ?? {}).claims_exposure ?? 0);

    // Drivers needed — rough estimate: 1 driver per $X TTM revenue
    // Use actual ratio (ttmRevenue / activeDrivers) to compute forecasted need
    const revenuePerDriver = activeDrivers > 0 && t12Revenue > 0
      ? t12Revenue / activeDrivers
      : 70000; // fallback $70k per driver
    const driversNeeded = forecastRevenue > 0
      ? Math.max(0, Math.ceil(forecastRevenue / revenuePerDriver) - activeDrivers)
      : 0;

    res.json({
      latestForecast,
      ttmRevenue: t12Revenue,
      activeAccounts,
      activeDrivers,
      openRepricingFlags,
      pnlUploadsCount,
      // New KPI fields
      forecastRevenue,
      forecastNetMarginPct,
      forecastConfidence,
      revenueAtRisk,
      pipelineContribution,
      claimsExposure,
      driversNeeded,
    });
  } catch (err) {
    console.error("[financial/dashboard]", err);
    res.status(500).json({ message: "Failed to load dashboard" });
  }
});

// ── Forecast Engine ───────────────────────────────────────────────────────────
router.post("/forecast/generate", async (req: any, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { label, notes, assumptions } = req.body;

    // ── 1. Gather operational data ──
    const now = new Date();
    const forecastStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const forecastEnd = new Date(forecastStart.getFullYear() + 1, forecastStart.getMonth() - 1, 28);

    // Historical revenue: last 12 months of paid/sent invoices
    const histStart = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().split("T")[0];
    const revenueHistory = await db.select({
      yr: sql<number>`EXTRACT(YEAR FROM invoice_date::date)`,
      mo: sql<number>`EXTRACT(MONTH FROM invoice_date::date)`,
      total: sql<number>`COALESCE(SUM(CAST(total_amount AS numeric)), 0)`,
    }).from(invoices)
      .where(and(
        gte(invoices.invoiceDate, histStart),
        or(eq(invoices.status, "paid"), eq(invoices.status, "sent"), eq(invoices.status, "approved"))
      ))
      .groupBy(sql`EXTRACT(YEAR FROM invoice_date::date)`, sql`EXTRACT(MONTH FROM invoice_date::date)`);

    const monthlyRevHistoric = revenueHistory.map(r => Number(r.total));
    const avgMonthlyRevenue = monthlyRevHistoric.length
      ? monthlyRevHistoric.reduce((a, b) => a + b, 0) / monthlyRevHistoric.length
      : 0;

    // Active accounts by health
    const accountStats = await db.select({
      health: customers.health,
      count: sql<number>`COUNT(*)`,
    }).from(customers)
      .where(and(eq(customers.status, "Active"), eq(customers.isDeleted, false)))
      .groupBy(customers.health);

    const totalActiveAccounts = accountStats.reduce((s, r) => s + Number(r.count), 0);
    const redHealthCount = Number(accountStats.find(r => r.health === "red")?.count ?? 0);
    const yellowHealthCount = Number(accountStats.find(r => r.health === "yellow")?.count ?? 0);

    // Recent new accounts (last 90 days)
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const [newAccounts] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(customers)
      .where(and(
        eq(customers.status, "Active"),
        eq(customers.isDeleted, false),
        gte(customers.createdAt, new Date(ninetyDaysAgo))
      ));

    // Active drivers with pay rates
    const driverData = await db.select({
      count: sql<number>`COUNT(*)`,
      avgRate: sql<number>`COALESCE(AVG(CAST(driver_shift_pay_rate AS numeric)), 0)`,
    }).from(drivers).where(sql`status = 'Active' AND is_deleted = false`);

    const driverCount = Number(driverData[0]?.count ?? 0);
    const avgDriverHourlyRate = Number(driverData[0]?.avgRate ?? 22);
    const estimatedMonthlyHoursPerDriver = assumptions?.hoursPerDriver ?? 120;

    // Active employees
    const [empData] = await db.select({
      count: sql<number>`COUNT(*)`,
    }).from(employees)
      .innerJoin(users, eq(employees.userId, users.id))
      .where(and(
        orgId ? eq(users.orgId, orgId) : sql`1=1`,
        eq(employees.status, "active"),
        eq(employees.isDeleted, false)
      ));
    const employeeCount = Number(empData?.count ?? 0);
    const avgMonthlyEmployeeCost = assumptions?.avgMonthlyEmployeeCost ?? 5500;

    // Historical claims
    const claimsHistoric = await db.execute(sql`
      SELECT COALESCE(SUM(CAST(reserve_amount AS numeric)), 0) as total
      FROM claims
      WHERE created_at >= ${histStart}::timestamp
        AND is_deleted = false
    `);
    const ttmClaimsCost = Number((claimsHistoric as any)[0]?.total ?? 0);
    const avgMonthlyClaimsCost = ttmClaimsCost / 12;

    // ── 2. Build forecast items ──
    const growthRate = assumptions?.revenueGrowthRate ?? 0.02;    // 2% monthly growth
    const churnRate = assumptions?.churnRate ?? 0.03;              // 3% churn on risky accounts
    const payrollBurdenRate = assumptions?.payrollBurdenRate ?? 0.25; // 25% employer taxes/benefits
    const targetMarginPct = assumptions?.targetMarginPct ?? 0.18;  // 18% target margin

    const churnImpact = totalActiveAccounts > 0
      ? ((redHealthCount * 0.7 + yellowHealthCount * 0.3) / totalActiveAccounts) * churnRate * avgMonthlyRevenue
      : 0;

    const items: Array<{
      forecastId: string;
      categoryCode: string;
      periodYear: number;
      periodMonth: number;
      projectedAmount: string;
      driverAssumptions: string;
    }> = [];

    let cursor = new Date(forecastStart);
    for (let m = 0; m < 12; m++) {
      const yr = cursor.getFullYear();
      const mo = cursor.getMonth() + 1;
      const growth = Math.pow(1 + growthRate, m);

      // Revenue
      const activeRev = avgMonthlyRevenue * growth * (1 - churnRate * 0.3);
      const newAccRev = (Number(newAccounts?.count ?? 0) / 3) * (avgMonthlyRevenue / Math.max(totalActiveAccounts, 1)) * growth;
      const churnRisk = churnImpact * (1 + m * 0.01);

      // Labor
      const driverPay = driverCount * avgDriverHourlyRate * estimatedMonthlyHoursPerDriver;
      const empPayroll = employeeCount * avgMonthlyEmployeeCost;
      const burden = (driverPay + empPayroll) * payrollBurdenRate;

      // Claims
      const claimsForecast = avgMonthlyClaimsCost * (1 + 0.05 * m / 11);

      const categoryItems = [
        { code: "revenue.active_accounts", amount: activeRev,
          assumptions: `${totalActiveAccounts} active accounts × $${avgMonthlyRevenue.toFixed(0)} avg / month × ${(growth*100).toFixed(1)}% growth` },
        { code: "revenue.new_accounts", amount: newAccRev,
          assumptions: `${newAccounts?.count} new accounts in last 90 days` },
        { code: "revenue.churn_risk", amount: -churnRisk,
          assumptions: `${redHealthCount} red + ${yellowHealthCount} yellow health accounts` },
        { code: "labor.driver_pay", amount: -driverPay,
          assumptions: `${driverCount} drivers × $${avgDriverHourlyRate.toFixed(2)}/hr × ${estimatedMonthlyHoursPerDriver} hrs` },
        { code: "labor.employee_payroll", amount: -empPayroll,
          assumptions: `${employeeCount} employees × $${avgMonthlyEmployeeCost}/mo avg` },
        { code: "labor.payroll_burden", amount: -burden,
          assumptions: `${(payrollBurdenRate * 100).toFixed(0)}% burden on labor` },
        { code: "claims.total_reserve", amount: -claimsForecast,
          assumptions: `TTM claims: $${ttmClaimsCost.toFixed(0)} → $${claimsForecast.toFixed(0)}/mo projected` },
        { code: "operating.other", amount: -(activeRev * 0.05),
          assumptions: `5% of revenue for overhead / SG&A` },
      ];

      for (const cat of categoryItems) {
        items.push({
          forecastId: "", // will be replaced
          categoryCode: cat.code,
          periodYear: yr,
          periodMonth: mo,
          projectedAmount: cat.amount.toFixed(2),
          driverAssumptions: cat.assumptions,
        });
      }

      cursor.setMonth(cursor.getMonth() + 1);
    }

    // ── 3. Persist forecast ──
    await db.update(financialForecasts)
      .set({ isLatest: false })
      .where(orgId ? eq(financialForecasts.orgId, orgId) : sql`1=1`);

    const [forecast] = await db.insert(financialForecasts).values({
      orgId,
      generatedBy: userId,
      periodStart: forecastStart.toISOString().split("T")[0],
      periodEnd: forecastEnd.toISOString().split("T")[0],
      status: "published",
      snapshotLabel: label ?? `Forecast ${now.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`,
      notes,
      assumptionsJson: JSON.stringify({
        growthRate, churnRate, payrollBurdenRate, targetMarginPct,
        avgMonthlyRevenue, driverCount, employeeCount, avgDriverHourlyRate,
        estimatedMonthlyHoursPerDriver, avgMonthlyEmployeeCost, ttmClaimsCost,
        ...assumptions
      }),
      isLatest: true,
    }).returning();

    // Insert items with the real forecastId
    if (items.length > 0) {
      await db.insert(financialForecastItems).values(
        items.map(i => ({ ...i, forecastId: forecast.id }))
      );
    }

    res.json({ forecast, itemCount: items.length });
  } catch (err) {
    console.error("[financial/forecast/generate]", err);
    res.status(500).json({ message: "Failed to generate forecast" });
  }
});

router.get("/forecast/latest", async (req: any, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const [forecast] = await db.select()
      .from(financialForecasts)
      .where(and(
        orgId ? eq(financialForecasts.orgId, orgId) : sql`1=1`,
        eq(financialForecasts.isLatest, true)
      ))
      .orderBy(desc(financialForecasts.generatedAt))
      .limit(1);

    if (!forecast) return res.json({ forecast: null, items: [] });

    const items = await db.select().from(financialForecastItems)
      .where(eq(financialForecastItems.forecastId, forecast.id))
      .orderBy(asc(financialForecastItems.periodYear), asc(financialForecastItems.periodMonth));

    res.json({ forecast, items });
  } catch (err) {
    console.error("[financial/forecast/latest]", err);
    res.status(500).json({ message: "Failed to load forecast" });
  }
});

router.get("/forecast/history", async (req: any, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const forecasts = await db.select()
      .from(financialForecasts)
      .where(orgId ? eq(financialForecasts.orgId, orgId) : sql`1=1`)
      .orderBy(desc(financialForecasts.generatedAt))
      .limit(20);
    res.json(forecasts);
  } catch (err) {
    console.error("[financial/forecast/history]", err);
    res.status(500).json({ message: "Failed to load forecast history" });
  }
});

router.get("/forecast/:id", async (req: any, res: Response) => {
  try {
    const [forecast] = await db.select()
      .from(financialForecasts)
      .where(eq(financialForecasts.id, req.params.id))
      .limit(1);
    if (!forecast) return res.status(404).json({ message: "Not found" });

    const items = await db.select().from(financialForecastItems)
      .where(eq(financialForecastItems.forecastId, forecast.id))
      .orderBy(asc(financialForecastItems.periodYear), asc(financialForecastItems.periodMonth));

    res.json({ forecast, items });
  } catch (err) {
    console.error("[financial/forecast/:id]", err);
    res.status(500).json({ message: "Failed to load forecast" });
  }
});

// ── P&L Uploads ───────────────────────────────────────────────────────────────
router.get("/pnl", async (req: any, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const uploads = await db.select()
      .from(pnlUploads)
      .where(orgId ? eq(pnlUploads.orgId, orgId) : sql`1=1`)
      .orderBy(desc(pnlUploads.uploadedAt));
    res.json(uploads);
  } catch (err) {
    console.error("[financial/pnl]", err);
    res.status(500).json({ message: "Failed to load P&L uploads" });
  }
});

router.post("/pnl", async (req: any, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { periodYear, periodMonth, fileName, lines } = req.body;

    const [upload] = await db.insert(pnlUploads).values({
      orgId,
      uploadedBy: userId,
      periodYear: Number(periodYear),
      periodMonth: Number(periodMonth),
      fileName,
      status: "pending",
    }).returning();

    // Insert lines if provided
    if (lines && Array.isArray(lines) && lines.length > 0) {
      await db.insert(pnlUploadLines).values(
        lines.map((l: any) => ({
          uploadId: upload.id,
          rawLabel: l.rawLabel,
          rawAmount: String(l.rawAmount ?? 0),
          lineType: l.lineType ?? null,
          mappedCategoryCode: null,
          isIncluded: true,
        }))
      );

      // Calculate totals
      const revenueLines = lines.filter((l: any) => l.lineType === "revenue");
      const expenseLines = lines.filter((l: any) => l.lineType === "expense");
      const totalRevenue = revenueLines.reduce((s: number, l: any) => s + Number(l.rawAmount ?? 0), 0);
      const totalExpenses = expenseLines.reduce((s: number, l: any) => s + Math.abs(Number(l.rawAmount ?? 0)), 0);

      await db.update(pnlUploads).set({
        status: "mapped",
        totalRevenue: String(totalRevenue),
        totalExpenses: String(totalExpenses),
        netIncome: String(totalRevenue - totalExpenses),
      }).where(eq(pnlUploads.id, upload.id));
    }

    res.json(upload);
  } catch (err) {
    console.error("[financial/pnl POST]", err);
    res.status(500).json({ message: "Failed to create P&L upload" });
  }
});

router.get("/pnl/:id", async (req: any, res: Response) => {
  try {
    const [upload] = await db.select().from(pnlUploads)
      .where(eq(pnlUploads.id, req.params.id)).limit(1);
    if (!upload) return res.status(404).json({ message: "Not found" });

    const lines = await db.select().from(pnlUploadLines)
      .where(eq(pnlUploadLines.uploadId, upload.id));
    res.json({ upload, lines });
  } catch (err) {
    console.error("[financial/pnl/:id]", err);
    res.status(500).json({ message: "Failed to load P&L upload" });
  }
});

router.patch("/pnl/:id/mapping", async (req: any, res: Response) => {
  try {
    const { mapping } = req.body; // { lineId: categoryCode }
    for (const [lineId, catCode] of Object.entries(mapping)) {
      await db.update(pnlUploadLines)
        .set({ mappedCategoryCode: catCode as string })
        .where(eq(pnlUploadLines.id, lineId));
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[financial/pnl/:id/mapping]", err);
    res.status(500).json({ message: "Failed to update mapping" });
  }
});

// Apply P&L actuals to the latest forecast
router.post("/pnl/:id/apply", async (req: any, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const [upload] = await db.select().from(pnlUploads)
      .where(eq(pnlUploads.id, req.params.id)).limit(1);
    if (!upload) return res.status(404).json({ message: "Upload not found" });

    const [forecast] = await db.select().from(financialForecasts)
      .where(and(
        orgId ? eq(financialForecasts.orgId, orgId) : sql`1=1`,
        eq(financialForecasts.isLatest, true)
      )).limit(1);
    if (!forecast) return res.status(400).json({ message: "No active forecast to apply actuals to" });

    const lines = await db.select().from(pnlUploadLines)
      .where(and(eq(pnlUploadLines.uploadId, upload.id), eq(pnlUploadLines.isIncluded, true)));

    // Group by mapped category
    const byCategory: Record<string, number> = {};
    for (const line of lines) {
      if (!line.mappedCategoryCode) continue;
      byCategory[line.mappedCategoryCode] = (byCategory[line.mappedCategoryCode] ?? 0) + Number(line.rawAmount ?? 0);
    }

    // Update forecast items for the upload's period
    for (const [catCode, amount] of Object.entries(byCategory)) {
      const [existingItem] = await db.select().from(financialForecastItems)
        .where(and(
          eq(financialForecastItems.forecastId, forecast.id),
          eq(financialForecastItems.categoryCode, catCode),
          eq(financialForecastItems.periodYear, upload.periodYear),
          eq(financialForecastItems.periodMonth, upload.periodMonth)
        )).limit(1);

      if (existingItem) {
        const variance = amount - Number(existingItem.projectedAmount ?? 0);
        const projected = Number(existingItem.projectedAmount ?? 0);
        const variancePct = projected !== 0 ? variance / projected : 0;
        await db.update(financialForecastItems).set({
          actualAmount: String(amount),
          varianceAmount: String(variance),
          variancePct: String(variancePct),
        }).where(eq(financialForecastItems.id, existingItem.id));
      }
    }

    await db.update(pnlUploads).set({ status: "applied" }).where(eq(pnlUploads.id, upload.id));
    res.json({ ok: true, categoriesApplied: Object.keys(byCategory).length });
  } catch (err) {
    console.error("[financial/pnl/:id/apply]", err);
    res.status(500).json({ message: "Failed to apply actuals" });
  }
});

// ── Margin Intelligence ───────────────────────────────────────────────────────
router.get("/margin/accounts", async (req: any, res: Response) => {
  try {
    const now = new Date();
    const ttmStart = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().split("T")[0];

    // TTM revenue per account
    const revenueByAccount = await db.select({
      customerId: invoices.customerId,
      customerName: invoices.customerName,
      ttmRevenue: sql<number>`COALESCE(SUM(CAST(total_amount AS numeric)), 0)`,
      invoiceCount: sql<number>`COUNT(*)`,
    }).from(invoices)
      .where(and(
        gte(invoices.invoiceDate, ttmStart),
        or(eq(invoices.status, "paid"), eq(invoices.status, "sent"), eq(invoices.status, "approved"))
      ))
      .groupBy(invoices.customerId, invoices.customerName)
      .orderBy(sql`SUM(CAST(total_amount AS numeric)) DESC`)
      .limit(50);

    // Claims per account
    const claimsByAccount = await db.execute(sql`
      SELECT account_id, COALESCE(SUM(CAST(reserve_amount AS numeric)), 0) as ttm_claims
      FROM claims
      WHERE created_at >= ${ttmStart}::timestamp
        AND is_deleted = false
        AND account_id IS NOT NULL
      GROUP BY account_id
    `);
    const claimsMap: Record<string, number> = {};
    for (const row of (claimsByAccount as any[])) {
      claimsMap[row.account_id] = Number(row.ttm_claims ?? 0);
    }

    // Account health info
    const accountHealthRows = await db.select({
      id: customers.id,
      health: customers.health,
      status: customers.status,
      driverModel: customers.driverModel,
    }).from(customers).where(eq(customers.isDeleted, false));
    const healthMap: Record<string, typeof accountHealthRows[0]> = {};
    for (const a of accountHealthRows) healthMap[a.id ?? ""] = a;

    const LABOR_RATIO = 0.62; // estimated 62% of revenue goes to driver + employee labor

    const margins = revenueByAccount.map(row => {
      const revenue = Number(row.ttmRevenue);
      const claims = claimsMap[row.customerId ?? ""] ?? 0;
      const labor = revenue * LABOR_RATIO;
      const operating = revenue * 0.05;
      const totalCost = labor + claims + operating;
      const grossProfit = revenue - totalCost;
      const marginPct = revenue > 0 ? grossProfit / revenue : 0;
      const acct = healthMap[row.customerId ?? ""];
      return {
        accountId: row.customerId,
        accountName: row.customerName,
        ttmRevenue: revenue,
        ttmClaims: claims,
        estimatedLaborCost: labor,
        totalCost,
        grossProfit,
        marginPct,
        health: acct?.health ?? null,
        status: acct?.status ?? null,
        driverModel: acct?.driverModel ?? null,
        invoiceCount: Number(row.invoiceCount),
        flagForRepricing: marginPct < 0.15 && revenue > 1000,
      };
    });

    res.json(margins);
  } catch (err) {
    console.error("[financial/margin/accounts]", err);
    res.status(500).json({ message: "Failed to compute account margins" });
  }
});

router.get("/margin/drivers", async (req: any, res: Response) => {
  try {
    const driverRows = await db.execute(sql`
      SELECT
        d.id,
        u.first_name, u.last_name,
        d.driver_number,
        d.status,
        d.driver_classification,
        d.driver_shift_pay_rate as hourly_rate,
        d.hours_mtd,
        d.hours_ytd,
        COALESCE(d.hours_ytd, 0) * COALESCE(CAST(d.driver_shift_pay_rate AS numeric), 0) as estimated_ytd_pay
      FROM drivers d
      LEFT JOIN users u ON d.user_id = u.id
      WHERE d.is_deleted = false
        AND d.status = 'Active'
      ORDER BY estimated_ytd_pay DESC
      LIMIT 50
    `);

    res.json((driverRows as any[]).map(r => ({
      driverId: r.id,
      name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.driver_number || "Unknown",
      driverNumber: r.driver_number,
      classification: r.driver_classification,
      hourlyRate: Number(r.hourly_rate ?? 0),
      hoursMtd: Number(r.hours_mtd ?? 0),
      hoursYtd: Number(r.hours_ytd ?? 0),
      estimatedYtdPay: Number(r.estimated_ytd_pay ?? 0),
    })));
  } catch (err) {
    console.error("[financial/margin/drivers]", err);
    res.status(500).json({ message: "Failed to compute driver margins" });
  }
});

// ── Repricing ─────────────────────────────────────────────────────────────────
router.get("/repricing", async (req: any, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const flags = await db.select({
      flag: repricingFlags,
      accountName: customers.customerName,
      accountStatus: customers.status,
      health: customers.health,
    }).from(repricingFlags)
      .leftJoin(customers, eq(repricingFlags.accountId, customers.id))
      .where(orgId ? eq(repricingFlags.orgId, orgId) : sql`1=1`)
      .orderBy(desc(repricingFlags.flaggedAt));
    res.json(flags.map(r => ({
      ...r.flag,
      accountName: r.accountName,
      accountStatus: r.accountStatus,
      health: r.health,
    })));
  } catch (err) {
    console.error("[financial/repricing]", err);
    res.status(500).json({ message: "Failed to load repricing flags" });
  }
});

// Run repricing detection engine — 5 trigger categories
router.post("/repricing/detect", async (req: any, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const TARGET_MARGIN = Number(req.body.targetMarginPct ?? 0.15);
    const now = new Date();

    // Date windows
    const ttmStart    = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().split("T")[0];
    const priorStart  = new Date(now.getFullYear() - 2, now.getMonth(), 1).toISOString().split("T")[0];
    const priorEnd    = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().split("T")[0];
    const recent6Start = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().split("T")[0];
    const prior6Start  = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().split("T")[0];
    const prior6End    = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().split("T")[0];

    // ── Revenue data (TTM and prior year) ─────────────────────────────────────
    const ttmRevRows = await db.execute(sql`
      SELECT customer_id, COALESCE(SUM(CAST(total_amount AS numeric)),0) AS revenue
      FROM invoices
      WHERE invoice_date >= ${ttmStart}
        AND status IN ('paid','sent','approved')
        AND customer_id IS NOT NULL
      GROUP BY customer_id
    `);
    const priorRevRows = await db.execute(sql`
      SELECT customer_id, COALESCE(SUM(CAST(total_amount AS numeric)),0) AS revenue
      FROM invoices
      WHERE invoice_date >= ${priorStart} AND invoice_date < ${priorEnd}
        AND status IN ('paid','sent','approved')
        AND customer_id IS NOT NULL
      GROUP BY customer_id
    `);
    // Recent 6-month vs prior 6-month revenue for trend analysis
    const recent6Rev = await db.execute(sql`
      SELECT customer_id, COALESCE(SUM(CAST(total_amount AS numeric)),0) AS revenue
      FROM invoices
      WHERE invoice_date >= ${recent6Start}
        AND status IN ('paid','sent','approved')
        AND customer_id IS NOT NULL
      GROUP BY customer_id
    `);
    const prior6Rev = await db.execute(sql`
      SELECT customer_id, COALESCE(SUM(CAST(total_amount AS numeric)),0) AS revenue
      FROM invoices
      WHERE invoice_date >= ${prior6Start} AND invoice_date < ${prior6End}
        AND status IN ('paid','sent','approved')
        AND customer_id IS NOT NULL
      GROUP BY customer_id
    `);

    // ── Claims data (TTM and prior year) ──────────────────────────────────────
    const ttmClaimsRows = await db.execute(sql`
      SELECT account_id, COALESCE(SUM(CAST(reserve_amount AS numeric)),0) AS claims
      FROM claims
      WHERE created_at >= ${ttmStart}::timestamp AND is_deleted = false AND account_id IS NOT NULL
      GROUP BY account_id
    `);
    const priorClaimsRows = await db.execute(sql`
      SELECT account_id, COALESCE(SUM(CAST(reserve_amount AS numeric)),0) AS claims
      FROM claims
      WHERE created_at >= ${priorStart}::timestamp AND created_at < ${priorEnd}::timestamp
        AND is_deleted = false AND account_id IS NOT NULL
      GROUP BY account_id
    `);

    // ── Vendor cost data (TTM and prior year) — from vendor pricing contracts ──
    const ttmVendorRows = await db.execute(sql`
      SELECT vp.customer_id, COALESCE(SUM(CAST(vp.monthly_cost AS numeric) * 12),0) AS vendor_cost
      FROM vendor_pricing vp
      WHERE vp.effective_date <= ${ttmStart} OR vp.effective_date IS NULL
      GROUP BY vp.customer_id
    `).catch(() => ({ rows: [] as any[] }));
    const priorVendorRows = await db.execute(sql`
      SELECT vp.customer_id, COALESCE(SUM(CAST(vp.monthly_cost AS numeric) * 12),0) AS vendor_cost
      FROM vendor_pricing vp
      WHERE vp.effective_date <= ${priorEnd} OR vp.effective_date IS NULL
      GROUP BY vp.customer_id
    `).catch(() => ({ rows: [] as any[] }));

    // ── Build lookup maps ──────────────────────────────────────────────────────
    const ttmRevMap: Record<string, number> = {};
    const priorRevMap: Record<string, number> = {};
    const recent6Map: Record<string, number> = {};
    const prior6Map: Record<string, number> = {};
    const ttmClaimsMap: Record<string, number> = {};
    const priorClaimsMap: Record<string, number> = {};
    const ttmVendorMap: Record<string, number> = {};
    const priorVendorMap: Record<string, number> = {};

    for (const r of (ttmRevRows as any[])) ttmRevMap[r.customer_id] = Number(r.revenue);
    for (const r of (priorRevRows as any[])) priorRevMap[r.customer_id] = Number(r.revenue);
    for (const r of (recent6Rev as any[])) recent6Map[r.customer_id] = Number(r.revenue);
    for (const r of (prior6Rev as any[])) prior6Map[r.customer_id] = Number(r.revenue);
    for (const r of (ttmClaimsRows as any[])) ttmClaimsMap[r.account_id] = Number(r.claims);
    for (const r of (priorClaimsRows as any[])) priorClaimsMap[r.account_id] = Number(r.claims);
    for (const r of ((ttmVendorRows as any).rows ?? ttmVendorRows as any[])) ttmVendorMap[r.customer_id] = Number(r.vendor_cost);
    for (const r of ((priorVendorRows as any).rows ?? priorVendorRows as any[])) priorVendorMap[r.customer_id] = Number(r.vendor_cost);

    const LABOR_RATIO = 0.62; // estimated labor as % of revenue
    const ADMIN_RATIO = 0.04;
    let flaggedCount = 0;
    let updatedCount = 0;

    const allAccountIds = new Set([...Object.keys(ttmRevMap)]);

    for (const accountId of allAccountIds) {
      const ttmRev    = ttmRevMap[accountId]    ?? 0;
      const priorRev  = priorRevMap[accountId]  ?? 0;
      const recent6   = recent6Map[accountId]   ?? 0;
      const prior6    = prior6Map[accountId]    ?? 0;
      const ttmClaims = ttmClaimsMap[accountId] ?? 0;
      const priorClaims = priorClaimsMap[accountId] ?? 0;
      const ttmVendor   = ttmVendorMap[accountId]   ?? 0;
      const priorVendor = priorVendorMap[accountId] ?? 0;

      if (ttmRev < 500) continue;

      const ttmLabor    = ttmRev * LABOR_RATIO;
      const priorLabor  = priorRev > 0 ? priorRev * LABOR_RATIO : ttmLabor;
      const ttmCost     = ttmLabor + ttmClaims + ttmVendor + ttmRev * ADMIN_RATIO;
      const marginPct   = (ttmRev - ttmCost) / ttmRev;

      // ── Trigger 1: margin below threshold ─────────────────────────────────
      const T1_marginBelow = marginPct < TARGET_MARGIN;

      // ── Trigger 2: margin trending down (recent 6M vs prior 6M) ──────────
      const recent6Cost = recent6 * LABOR_RATIO + (ttmClaimsMap[accountId] ?? 0) * 0.5 + (ttmVendorMap[accountId] ?? 0) * 0.5 + recent6 * ADMIN_RATIO;
      const prior6Cost  = prior6  * LABOR_RATIO + (priorClaimsMap[accountId] ?? 0) * 0.5 + (priorVendorMap[accountId] ?? 0) * 0.5 + prior6  * ADMIN_RATIO;
      const recent6Margin = recent6 > 0 ? (recent6 - recent6Cost) / recent6 : 0;
      const prior6Margin  = prior6  > 0 ? (prior6  - prior6Cost)  / prior6  : 0;
      const T2_trending   = prior6 > 0 && recent6 > 0 && (recent6Margin - prior6Margin) < -0.03; // dropped >3pp

      // ── Trigger 3: labor cost increase >8% YoY ────────────────────────────
      const laborIncreasePct = priorLabor > 0 ? (ttmLabor - priorLabor) / priorLabor : 0;
      const T3_laborIncrease = laborIncreasePct > 0.08;

      // ── Trigger 4: vendor cost increase >10% YoY ──────────────────────────
      const vendorIncreasePct = priorVendor > 0 ? (ttmVendor - priorVendor) / priorVendor : 0;
      const T4_vendorIncrease = priorVendor > 0 && vendorIncreasePct > 0.10;

      // ── Trigger 5: claims cost increase >20% YoY ──────────────────────────
      const claimsIncreasePct = priorClaims > 0 ? (ttmClaims - priorClaims) / priorClaims : 0;
      const T5_claimsIncrease = priorClaims > 0 && claimsIncreasePct > 0.20;

      const triggersHit = [T1_marginBelow, T2_trending, T3_laborIncrease, T4_vendorIncrease, T5_claimsIncrease];
      const triggerCount = triggersHit.filter(Boolean).length;

      if (triggerCount === 0) continue;

      // ── Confidence score (0-100) ───────────────────────────────────────────
      let confidence = 40;
      if (T1_marginBelow) confidence += 20;
      if (T2_trending)    confidence += 15;
      if (T3_laborIncrease) confidence += 10;
      if (T4_vendorIncrease) confidence += 10;
      if (T5_claimsIncrease) confidence += 15;
      if (triggerCount >= 3) confidence += 10; // bonus for corroboration
      confidence = Math.min(confidence, 98);

      // ── Primary trigger type ──────────────────────────────────────────────
      let triggerType = "multiple";
      if (triggerCount === 1) {
        if (T1_marginBelow)    triggerType = "margin_below";
        if (T2_trending)       triggerType = "trending_down";
        if (T3_laborIncrease)  triggerType = "labor_increase";
        if (T4_vendorIncrease) triggerType = "vendor_increase";
        if (T5_claimsIncrease) triggerType = "claims_increase";
      }

      // ── Issue reason (human-readable primary issue) ─────────────────────
      const reasonParts: string[] = [];
      if (T1_marginBelow)    reasonParts.push(`Margin ${(marginPct * 100).toFixed(1)}% below ${(TARGET_MARGIN * 100).toFixed(0)}% target`);
      if (T2_trending)       reasonParts.push(`Margin trending down ${((prior6Margin - recent6Margin) * 100).toFixed(1)}pp over 6 months`);
      if (T3_laborIncrease)  reasonParts.push(`Labor cost up ${(laborIncreasePct * 100).toFixed(1)}% YoY`);
      if (T4_vendorIncrease) reasonParts.push(`Vendor costs up ${(vendorIncreasePct * 100).toFixed(1)}% YoY`);
      if (T5_claimsIncrease) reasonParts.push(`Claims up ${(claimsIncreasePct * 100).toFixed(1)}% YoY`);
      const issueReason = reasonParts[0] ?? "";

      // ── Estimated revenue adjustment to hit target margin ─────────────────
      // newRevenue = ttmCost / (1 - targetMargin); adjustment = newRevenue - ttmRev
      const neededRevenue = ttmCost / (1 - TARGET_MARGIN);
      const estimatedRevenueAdjustment = Math.max(0, neededRevenue - ttmRev);

      // ── Recommended action ─────────────────────────────────────────────────
      const recommendedAction = marginPct < 0 ? "exit" : marginPct < 0.05 ? "reprice" : "review";

      const reasonCodes = JSON.stringify(
        [
          T1_marginBelow    && "margin_below",
          T2_trending       && "trending_down",
          T3_laborIncrease  && "labor_increase",
          T4_vendorIncrease && "vendor_increase",
          T5_claimsIncrease && "claims_increase",
        ].filter(Boolean)
      );

      // ── Upsert ────────────────────────────────────────────────────────────
      const [existing] = await db.select().from(repricingFlags)
        .where(and(
          eq(repricingFlags.accountId, accountId),
          eq(repricingFlags.status, "open")
        )).limit(1);

      if (!existing) {
        await db.insert(repricingFlags).values({
          orgId,
          accountId,
          status: "open",
          triggerType,
          marginPct: String(marginPct),
          targetMarginPct: String(TARGET_MARGIN),
          ttmRevenue: String(ttmRev),
          ttmCost: String(ttmCost),
          estimatedRevenueAdjustment: String(estimatedRevenueAdjustment),
          reasonCodes,
          issueReason,
          aiConfidence: String(confidence),
          recommendedAction,
        });
        flaggedCount++;
      } else {
        await db.update(repricingFlags).set({
          triggerType,
          marginPct: String(marginPct),
          targetMarginPct: String(TARGET_MARGIN),
          ttmRevenue: String(ttmRev),
          ttmCost: String(ttmCost),
          estimatedRevenueAdjustment: String(estimatedRevenueAdjustment),
          reasonCodes,
          issueReason,
          aiConfidence: String(confidence),
          recommendedAction,
        }).where(eq(repricingFlags.id, existing.id));
        updatedCount++;
      }
    }

    res.json({ flaggedCount, updatedCount, targetMarginPct: TARGET_MARGIN });
  } catch (err) {
    console.error("[financial/repricing/detect]", err);
    res.status(500).json({ message: "Failed to run repricing detection" });
  }
});

router.patch("/repricing/:id", async (req: any, res: Response) => {
  try {
    const userId = getUserId(req);
    const { status, reviewNotes, dismissedReason } = req.body;
    await db.update(repricingFlags).set({
      status,
      reviewNotes,
      dismissedReason,
      reviewedBy: userId,
      reviewedAt: new Date(),
    }).where(eq(repricingFlags.id, req.params.id));
    const [updated] = await db.select().from(repricingFlags)
      .where(eq(repricingFlags.id, req.params.id)).limit(1);
    res.json(updated);
  } catch (err) {
    console.error("[financial/repricing/:id PATCH]", err);
    res.status(500).json({ message: "Failed to update repricing flag" });
  }
});

// ── Forecast Goals ────────────────────────────────────────────────────────────
router.get("/goals", async (req: any, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const goals = await db.select().from(forecastGoals)
      .where(orgId ? eq(forecastGoals.orgId, orgId) : sql`1=1`)
      .orderBy(desc(forecastGoals.createdAt));
    res.json(goals);
  } catch (err) {
    console.error("[financial/goals]", err);
    res.status(500).json({ message: "Failed to load goals" });
  }
});

router.post("/goals", async (req: any, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { forecastId, moduleTarget, metricName, targetValue, targetPeriodYear, targetPeriodMonth, notes } = req.body;
    const [goal] = await db.insert(forecastGoals).values({
      orgId,
      forecastId: forecastId ?? null,
      createdBy: userId,
      moduleTarget,
      metricName,
      targetValue: targetValue != null ? String(targetValue) : null,
      targetPeriodYear: targetPeriodYear ? Number(targetPeriodYear) : null,
      targetPeriodMonth: targetPeriodMonth ? Number(targetPeriodMonth) : null,
      notes,
      status: "draft",
    }).returning();
    res.json(goal);
  } catch (err) {
    console.error("[financial/goals POST]", err);
    res.status(500).json({ message: "Failed to create goal" });
  }
});

router.patch("/goals/:id", async (req: any, res: Response) => {
  try {
    const userId = getUserId(req);
    const updates: any = {};
    if (req.body.status !== undefined) updates.status = req.body.status;
    if (req.body.notes !== undefined) updates.notes = req.body.notes;
    if (req.body.targetValue !== undefined) updates.targetValue = String(req.body.targetValue);
    if (req.body.status === "approved") {
      updates.approvedBy = userId;
      updates.approvedAt = new Date();
    }
    if (req.body.status === "pushed") {
      updates.pushedAt = new Date();
    }
    await db.update(forecastGoals).set(updates).where(eq(forecastGoals.id, req.params.id));
    const [updated] = await db.select().from(forecastGoals)
      .where(eq(forecastGoals.id, req.params.id)).limit(1);
    res.json(updated);
  } catch (err) {
    console.error("[financial/goals/:id PATCH]", err);
    res.status(500).json({ message: "Failed to update goal" });
  }
});

// ── Revenue History (for charts) ──────────────────────────────────────────────
router.get("/revenue-history", async (req: any, res: Response) => {
  try {
    const months = Number(req.query.months ?? 12);
    const now = new Date();
    const start = new Date(now.getFullYear() - 1, now.getMonth() + 1 - months, 1).toISOString().split("T")[0];

    const rows = await db.select({
      yr: sql<number>`EXTRACT(YEAR FROM invoice_date::date)`,
      mo: sql<number>`EXTRACT(MONTH FROM invoice_date::date)`,
      total: sql<number>`COALESCE(SUM(CAST(total_amount AS numeric)), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(invoices)
      .where(and(
        gte(invoices.invoiceDate, start),
        or(eq(invoices.status, "paid"), eq(invoices.status, "sent"), eq(invoices.status, "approved"))
      ))
      .groupBy(sql`EXTRACT(YEAR FROM invoice_date::date)`, sql`EXTRACT(MONTH FROM invoice_date::date)`)
      .orderBy(sql`EXTRACT(YEAR FROM invoice_date::date)`, sql`EXTRACT(MONTH FROM invoice_date::date)`);

    res.json(rows.map(r => ({
      year: Number(r.yr),
      month: Number(r.mo),
      label: `${MONTHS[Number(r.mo) - 1]} ${r.yr}`,
      revenue: Number(r.total),
      invoiceCount: Number(r.count),
    })));
  } catch (err) {
    console.error("[financial/revenue-history]", err);
    res.status(500).json({ message: "Failed to load revenue history" });
  }
});

// ── Margin History (Rolling 12 months) ─────────────────────────────────────
/** GET /api/financial/margin-history — monthly revenue + estimated cost + margin% for charting */
router.get("/margin-history", async (req: any, res: Response) => {
  try {
    const months = Number(req.query.months ?? 12);
    const now = new Date();
    const start = new Date(now.getFullYear() - 1, now.getMonth() + 1 - months, 1).toISOString().split("T")[0];

    // Monthly revenue from invoices
    const revRows = await db.execute(sql`
      SELECT
        EXTRACT(YEAR FROM invoice_date::date)  AS yr,
        EXTRACT(MONTH FROM invoice_date::date) AS mo,
        COALESCE(SUM(CAST(total_amount AS numeric)), 0) AS revenue
      FROM invoices
      WHERE invoice_date >= ${start}
        AND status IN ('paid','sent','approved')
      GROUP BY yr, mo
      ORDER BY yr, mo
    `);

    // Monthly claims cost
    const claimRows = await db.execute(sql`
      SELECT
        EXTRACT(YEAR FROM created_at)  AS yr,
        EXTRACT(MONTH FROM created_at) AS mo,
        COALESCE(SUM(CAST(probable_cost AS numeric)), 0) AS claims
      FROM accidents
      WHERE created_at >= ${start}::timestamp
        AND is_deleted = false
        AND probable_cost IS NOT NULL
      GROUP BY yr, mo
      ORDER BY yr, mo
    `);

    const claimsMap: Record<string, number> = {};
    for (const r of claimRows as any[]) {
      claimsMap[`${r.yr}-${r.mo}`] = Number(r.claims);
    }

    const LABOR_RATIO = 0.62;
    const ADMIN_RATIO = 0.04;

    const result = (revRows as any[]).map(r => {
      const revenue = Number(r.revenue);
      const claims  = claimsMap[`${r.yr}-${r.mo}`] ?? 0;
      const labor   = revenue * LABOR_RATIO;
      const admin   = revenue * ADMIN_RATIO;
      const totalCost = labor + claims + admin;
      const netProfit = revenue - totalCost;
      const marginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;
      return {
        year: Number(r.yr),
        month: Number(r.mo),
        label: `${MONTHS[Number(r.mo) - 1]} ${r.yr}`,
        revenue,
        totalCost,
        netProfit,
        marginPct: Number(marginPct.toFixed(2)),
      };
    });

    res.json(result);
  } catch (err) {
    console.error("[financial/margin-history]", err);
    res.status(500).json({ message: "Failed to load margin history" });
  }
});

// ── Forecast vs Actual ────────────────────────────────────────────────────────
/** GET /api/financial/forecast-vs-actual — monthly forecast snapshot vs actual invoice revenue */
router.get("/forecast-vs-actual", async (req: any, res: Response) => {
  try {
    const months = Number(req.query.months ?? 12);
    const now = new Date();
    const start = new Date(now.getFullYear() - 1, now.getMonth() + 1 - months, 1).toISOString().split("T")[0];

    // Latest forecast snapshot data (most recent snapshot_date per period_month)
    const snapRows = await db.execute(sql`
      SELECT
        period_month,
        CAST(revenue_forecast AS numeric)    AS forecast_revenue,
        CAST(net_profit_forecast AS numeric) AS forecast_profit
      FROM forecast_snapshots
      WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM forecast_snapshots)
        AND period_month >= ${start}
      ORDER BY period_month
    `);

    // Actual invoice revenue per month
    const actualRows = await db.execute(sql`
      SELECT
        DATE_TRUNC('month', invoice_date::date) AS period_month,
        COALESCE(SUM(CAST(total_amount AS numeric)), 0) AS actual_revenue
      FROM invoices
      WHERE invoice_date >= ${start}
        AND status IN ('paid','sent','approved')
      GROUP BY DATE_TRUNC('month', invoice_date::date)
      ORDER BY period_month
    `);

    // Build actuals map
    const actualsMap: Record<string, number> = {};
    for (const r of actualRows as any[]) {
      const d = new Date(r.period_month);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      actualsMap[key] = Number(r.actual_revenue);
    }

    const result = (snapRows as any[]).map(r => {
      const d = new Date(r.period_month);
      const yr = d.getFullYear();
      const mo = d.getMonth() + 1;
      const key = `${yr}-${mo}`;
      const forecastRev = Number(r.forecast_revenue);
      const actualRev   = actualsMap[key] ?? null;
      return {
        label: `${MONTHS[mo - 1]} ${yr}`,
        forecastRevenue: forecastRev,
        actualRevenue: actualRev,
        variance: actualRev != null ? actualRev - forecastRev : null,
        variancePct: actualRev != null && forecastRev > 0 ? ((actualRev - forecastRev) / forecastRev) * 100 : null,
      };
    });

    res.json(result);
  } catch (err) {
    console.error("[financial/forecast-vs-actual]", err);
    res.status(500).json({ message: "Failed to load forecast vs actual" });
  }
});

// ── Forecast Snapshots ─────────────────────────────────────────────────────

/** GET /api/financial/snapshots — latest nightly forecast (most recent snapshot_date) */
router.get("/snapshots", async (req, res) => {
  try {
    const { db } = await import("../db");
    const { sql } = await import("drizzle-orm");

    // Find the most recent snapshot_date
    const latestRow = await db.execute(sql`
      SELECT snapshot_date FROM forecast_snapshots
      ORDER BY snapshot_date DESC LIMIT 1
    `);

    if ((latestRow.rows as any[]).length === 0) {
      return res.json({ snapshotDate: null, months: [] });
    }

    const snapshotDate = (latestRow.rows[0] as any).snapshot_date;

    const rows = await db.execute(sql`
      SELECT
        id,
        snapshot_date,
        period_month,
        revenue_forecast::float        AS revenue_forecast,
        labor_cost_forecast::float     AS labor_cost_forecast,
        contractor_cost_forecast::float AS contractor_cost_forecast,
        vendor_cost_forecast::float    AS vendor_cost_forecast,
        claims_cost_forecast::float    AS claims_cost_forecast,
        overhead_forecast::float       AS overhead_forecast,
        net_profit_forecast::float     AS net_profit_forecast,
        forecast_confidence,
        created_at
      FROM forecast_snapshots
      WHERE snapshot_date = ${snapshotDate}::date
      ORDER BY period_month ASC
    `);

    res.json({
      snapshotDate,
      months: rows.rows,
    });
  } catch (err) {
    console.error("[financial/snapshots]", err);
    res.status(500).json({ message: "Failed to load forecast snapshots" });
  }
});

/** GET /api/financial/snapshots/history — all snapshot dates (for comparison) */
router.get("/snapshots/history", async (req, res) => {
  try {
    const { db } = await import("../db");
    const { sql } = await import("drizzle-orm");

    const rows = await db.execute(sql`
      SELECT
        snapshot_date,
        COUNT(*)::int                              AS month_count,
        AVG(forecast_confidence)::int              AS avg_confidence,
        SUM(revenue_forecast::float)               AS total_revenue,
        SUM(net_profit_forecast::float)            AS total_net_profit
      FROM forecast_snapshots
      GROUP BY snapshot_date
      ORDER BY snapshot_date DESC
      LIMIT 30
    `);

    res.json(rows.rows);
  } catch (err) {
    console.error("[financial/snapshots/history]", err);
    res.status(500).json({ message: "Failed to load snapshot history" });
  }
});

/** POST /api/financial/snapshots/run — manually trigger forecast engine */
router.post("/snapshots/run", async (req, res) => {
  try {
    const { runForecastEngine } = await import("../services/forecastEngine");
    const result = await runForecastEngine();
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[financial/snapshots/run]", err);
    res.status(500).json({ message: err.message || "Forecast engine failed" });
  }
});

export default router;
