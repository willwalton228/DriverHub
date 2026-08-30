/**
 * Account Upsell Engine
 *
 * Generates revenue and efficiency recommendations for each account based on:
 *   - Labor hours (WIW via driver_accounts → wiw_users → wiw_times/wiw_shifts)
 *   - Revenue (DriverHub invoices)
 *   - Driver assignment depth (driver_accounts)
 *   - Account profile (tenure, health, type, driver model)
 *
 * Recommendation types:
 *   price_increase      — market-rate pricing review opportunity
 *   dedicated_driver    — migrate to dedicated driver pool model
 *   premium_window      — add premium on-demand scheduling window
 *   re_engagement       — account gone quiet, revenue recovery opportunity
 *   volume_commitment   — annual commitment contract for billing stability
 *
 * Impact estimates are conservative and labelled as estimates throughout.
 */

import { pool } from "../db";

export type UpsellRecommendationType =
  | "price_increase"
  | "dedicated_driver"
  | "premium_window"
  | "re_engagement"
  | "volume_commitment";

export type RecommendationPriority = "high" | "medium" | "low";
export type RecommendationConfidence = "high" | "medium" | "low";

export interface UpsellRecommendation {
  id: string;
  type: UpsellRecommendationType;
  priority: RecommendationPriority;
  title: string;
  description: string;
  signals: string[];
  impactDollars: number;
  impactPercent: number;
  cta: string;
  confidence: RecommendationConfidence;
}

export interface AccountUpsellData {
  customerId: string;
  generatedAt: string;
  recommendations: UpsellRecommendation[];
  dataQuality: {
    hasInvoices: boolean;
    hasWiwData: boolean;
    hasDrivers: boolean;
    invoiceMonths: number;
  };
}

interface AccountMetrics {
  customerId: string;
  customerName: string;
  status: string | null;
  health: string | null;
  customerType: string | null;
  driverModel: string | null;
  implementationDate: string | null;
  // Invoice signals
  invoiceCount: number;
  totalRevenue: number;
  avgInvoice: number;
  latestInvoiceDate: string | null;
  invoiceCount90d: number;
  totalRevenue90d: number;
  // Driver / WIW signals
  assignedDriverCount: number;
  wiwLinkedDriverCount: number;
  workedHours30d: number;
  scheduledHours30d: number;
  scheduledShifts30d: number;
}

async function fetchAccountMetrics(customerId: string): Promise<AccountMetrics | null> {
  const result = await pool.query<AccountMetrics>(`
    WITH
    customer AS (
      SELECT
        id AS "customerId",
        customer_name AS "customerName",
        status,
        health,
        customer_type AS "customerType",
        driver_model AS "driverModel",
        implementation_date AS "implementationDate"
      FROM customers
      WHERE id = $1
    ),
    invoice_stats AS (
      SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('draft','void','cancelled')) AS "invoiceCount",
        COALESCE(SUM(total_amount::numeric) FILTER (WHERE status NOT IN ('draft','void','cancelled')), 0) AS "totalRevenue",
        COALESCE(AVG(total_amount::numeric) FILTER (WHERE status NOT IN ('draft','void','cancelled')), 0) AS "avgInvoice",
        MAX(invoice_date) FILTER (WHERE status NOT IN ('draft','void','cancelled')) AS "latestInvoiceDate",
        COUNT(*) FILTER (
          WHERE status NOT IN ('draft','void','cancelled')
          AND invoice_date >= CURRENT_DATE - INTERVAL '90 days'
        ) AS "invoiceCount90d",
        COALESCE(SUM(total_amount::numeric) FILTER (
          WHERE status NOT IN ('draft','void','cancelled')
          AND invoice_date >= CURRENT_DATE - INTERVAL '90 days'
        ), 0) AS "totalRevenue90d"
      FROM invoices
      WHERE customer_id = $1
    ),
    driver_stats AS (
      SELECT
        COUNT(DISTINCT da.driver_id) AS "assignedDriverCount",
        COUNT(DISTINCT wu.id) FILTER (WHERE wu.id IS NOT NULL) AS "wiwLinkedDriverCount"
      FROM driver_accounts da
      LEFT JOIN wiw_users wu ON wu.driver_id = da.driver_id AND wu.is_active = true
      WHERE da.account_id = $1
        AND da.assignment_ended_at IS NULL
    ),
    wiw_stats AS (
      SELECT
        COALESCE(SUM(wt.total_minutes) / 60.0, 0)::numeric AS "workedHours30d",
        COALESCE(SUM(EXTRACT(EPOCH FROM (ws.end_time - ws.start_time)) / 3600), 0)::numeric AS "scheduledHours30d",
        COUNT(DISTINCT ws.id) AS "scheduledShifts30d"
      FROM driver_accounts da
      JOIN wiw_users wu ON wu.driver_id = da.driver_id AND wu.is_active = true
      LEFT JOIN wiw_times wt ON wt.wiw_user_id = wu.id
        AND wt.clock_in >= NOW() - INTERVAL '30 days'
      LEFT JOIN wiw_shifts ws ON ws.wiw_user_id = wu.id
        AND ws.start_time >= NOW() - INTERVAL '30 days'
      WHERE da.account_id = $1
        AND da.assignment_ended_at IS NULL
    )
    SELECT
      c.*,
      i."invoiceCount"::int,
      i."totalRevenue"::float,
      i."avgInvoice"::float,
      i."latestInvoiceDate"::text,
      i."invoiceCount90d"::int,
      i."totalRevenue90d"::float,
      d."assignedDriverCount"::int,
      d."wiwLinkedDriverCount"::int,
      w."workedHours30d"::float,
      w."scheduledHours30d"::float,
      w."scheduledShifts30d"::int
    FROM customer c
    CROSS JOIN invoice_stats i
    CROSS JOIN driver_stats d
    CROSS JOIN wiw_stats w
  `, [customerId]);

  return result.rows[0] ?? null;
}

function tenureMonths(implementationDate: string | null): number {
  if (!implementationDate) return 0;
  const impl = new Date(implementationDate);
  const now = new Date();
  return (now.getFullYear() - impl.getFullYear()) * 12 + (now.getMonth() - impl.getMonth());
}

function daysSinceInvoice(latestInvoiceDate: string | null): number | null {
  if (!latestInvoiceDate) return null;
  const latest = new Date(latestInvoiceDate);
  const now = new Date();
  return Math.floor((now.getTime() - latest.getTime()) / (1000 * 60 * 60 * 24));
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export async function generateUpsellRecommendations(customerId: string): Promise<AccountUpsellData> {
  const m = await fetchAccountMetrics(customerId);

  if (!m) {
    return {
      customerId,
      generatedAt: new Date().toISOString(),
      recommendations: [],
      dataQuality: { hasInvoices: false, hasWiwData: false, hasDrivers: false, invoiceMonths: 0 },
    };
  }

  const tenure = tenureMonths(m.implementationDate);
  const daysSince = daysSinceInvoice(m.latestInvoiceDate);
  const monthlyRevenue = m.totalRevenue > 0 ? m.totalRevenue / Math.max(tenure, 1) : 0;
  const recommendations: UpsellRecommendation[] = [];

  // ──────────────────────────────────────────────────────────────────────────
  // 1. PRICE INCREASE
  //    Trigger: health=green + tenure >= 6mo + avg invoice >= $300 + 2+ invoices
  // ──────────────────────────────────────────────────────────────────────────
  if (
    m.health === "green" &&
    tenure >= 6 &&
    m.invoiceCount >= 2 &&
    m.avgInvoice >= 300
  ) {
    const impactDollars = Math.round(monthlyRevenue * 0.05 * 12);
    const signals: string[] = [
      `${tenure}-month client relationship`,
      `Health rating: green`,
      `Average invoice: $${fmt(m.avgInvoice)}`,
    ];
    if (m.invoiceCount > 0) signals.push(`${m.invoiceCount} paid invoices on record`);

    recommendations.push({
      id: "price_increase",
      type: "price_increase",
      priority: "high",
      title: "Pricing Review Opportunity",
      description:
        `This account has been with you for ${tenure} months and is in good standing. ` +
        `Market rates have increased 4–7% over the past year. A modest price adjustment ` +
        `of 5% is realistic and unlikely to impact retention for a healthy, tenured account.`,
      signals,
      impactDollars,
      impactPercent: 5,
      cta: "Schedule Pricing Review",
      confidence: m.invoiceCount >= 4 ? "high" : "medium",
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. DEDICATED DRIVER POOL
  //    Trigger: 3+ drivers assigned + not already on dedicated model + 2+ invoices
  // ──────────────────────────────────────────────────────────────────────────
  const isDedicatedModel =
    m.driverModel?.toLowerCase().includes("dedicated") ?? false;

  if (
    m.assignedDriverCount >= 3 &&
    !isDedicatedModel &&
    m.invoiceCount >= 2
  ) {
    const premiumPerDriver = 450;
    const impactDollars = m.assignedDriverCount * premiumPerDriver * 12;
    const signals: string[] = [
      `${m.assignedDriverCount} drivers currently assigned`,
      `Current model: ${m.driverModel || "on-demand / shared pool"}`,
    ];
    if (m.wiwLinkedDriverCount > 0) {
      signals.push(`${m.wiwLinkedDriverCount} WIW-scheduled drivers`);
    }

    recommendations.push({
      id: "dedicated_driver",
      type: "dedicated_driver",
      priority: "high",
      title: "Dedicated Driver Pool",
      description:
        `With ${m.assignedDriverCount} drivers regularly serving this account, migrating to a ` +
        `dedicated driver model reduces churn, improves service consistency, and commands a ` +
        `premium. Dedicated pools typically add $350–550/driver/month to billing.`,
      signals,
      impactDollars,
      impactPercent: Math.round((impactDollars / Math.max(monthlyRevenue * 12, impactDollars)) * 100),
      cta: "Propose Dedicated Model",
      confidence: m.assignedDriverCount >= 5 ? "high" : "medium",
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. PREMIUM SERVICE WINDOW
  //    Trigger: WIW hours > 80/mo + health=green + 15+ shifts scheduled
  // ──────────────────────────────────────────────────────────────────────────
  if (
    m.wiwLinkedDriverCount > 0 &&
    m.workedHours30d > 80 &&
    m.scheduledShifts30d >= 15 &&
    m.health !== "red"
  ) {
    const premiumRatePerHour = 3.5;
    const impactDollars = Math.round(m.workedHours30d * premiumRatePerHour * 12);
    const signals: string[] = [
      `${fmt(m.workedHours30d)} hours worked in last 30 days`,
      `${m.scheduledShifts30d} scheduled shifts in last 30 days`,
      `${m.wiwLinkedDriverCount} WIW-linked driver(s)`,
    ];

    recommendations.push({
      id: "premium_window",
      type: "premium_window",
      priority: "medium",
      title: "Premium Scheduling Window",
      description:
        `This account has consistent high-volume scheduling activity. Offering a guaranteed ` +
        `priority scheduling window — particularly for early-morning or weekend coverage — ` +
        `at a small premium captures revenue that otherwise goes unbilled.`,
      signals,
      impactDollars,
      impactPercent: Math.round((m.workedHours30d * premiumRatePerHour * 12) / Math.max(monthlyRevenue * 12, 1) * 100),
      cta: "Design Premium SLA",
      confidence: "medium",
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. RE-ENGAGEMENT
  //    Trigger: Active status + (no invoices OR last invoice > 45d)
  // ──────────────────────────────────────────────────────────────────────────
  const isQuiet =
    m.invoiceCount === 0 ||
    (daysSince !== null && daysSince > 45);

  if (isQuiet && m.status === "Active") {
    const baselineMonthly = m.avgInvoice > 0 ? m.avgInvoice : 1800;
    const impactDollars = Math.round(baselineMonthly * 3);
    const signals: string[] = [`Account status: Active`];
    if (m.invoiceCount === 0) {
      signals.push("No invoices on record yet");
      if (tenure > 0) signals.push(`Implemented ${tenure} months ago`);
    } else if (daysSince !== null) {
      signals.push(`Last invoice ${daysSince} days ago`);
    }

    recommendations.push({
      id: "re_engagement",
      type: "re_engagement",
      priority: "high",
      title: "Re-engagement Opportunity",
      description:
        `This account is marked Active but billing activity is low or stale. ` +
        `A proactive outreach call — focused on unmet needs, expansion, or ` +
        `onboarding gaps — can recover $1,500–$2,500/month in dormant revenue.`,
      signals,
      impactDollars,
      impactPercent: 100,
      cta: "Schedule Outreach Call",
      confidence: m.invoiceCount === 0 ? "low" : "medium",
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. VOLUME COMMITMENT CONTRACT
  //    Trigger: 3+ invoices in last 90d (high-frequency billing)
  // ──────────────────────────────────────────────────────────────────────────
  if (m.invoiceCount90d >= 3 && m.totalRevenue90d > 0) {
    const annualizedRevenue = (m.totalRevenue90d / 90) * 365;
    const discountOffered = annualizedRevenue * 0.025;
    const avcLocked = annualizedRevenue - discountOffered;
    const signals: string[] = [
      `${m.invoiceCount90d} invoices in the last 90 days`,
      `$${fmt(m.totalRevenue90d)} billed in last 90 days`,
      `Annualized run-rate ~$${fmt(annualizedRevenue)}`,
    ];

    recommendations.push({
      id: "volume_commitment",
      type: "volume_commitment",
      priority: "medium",
      title: "Annual Volume Commitment",
      description:
        `This account has a strong, predictable billing cadence. Proposing an annual ` +
        `commitment contract — with a 2–3% volume discount — locks in ~$${fmt(avcLocked)} ` +
        `in guaranteed annual revenue while rewarding the client with pricing stability.`,
      signals,
      impactDollars: Math.round(avcLocked),
      impactPercent: -3,
      cta: "Draft Commitment Proposal",
      confidence: "high",
    });
  }

  // Sort by priority: high → medium → low, then by impactDollars desc
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => {
    const po = priorityOrder[a.priority] - priorityOrder[b.priority];
    return po !== 0 ? po : b.impactDollars - a.impactDollars;
  });

  return {
    customerId,
    generatedAt: new Date().toISOString(),
    recommendations,
    dataQuality: {
      hasInvoices: m.invoiceCount > 0,
      hasWiwData: m.wiwLinkedDriverCount > 0,
      hasDrivers: m.assignedDriverCount > 0,
      invoiceMonths: Math.min(tenure, 12),
    },
  };
}
