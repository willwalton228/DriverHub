/**
 * Workforce Planning Metrics Aggregation Service
 *
 * Gathers live operational, driver, recruiting, and business metrics for a
 * given market string and returns a structured MarketMetrics object suitable
 * for feeding into the AI recommendation engine.
 */

import { db } from "../db";
import {
  drivers,
  recruitingRequisitions,
  recruitingApplications,
  recruitingInterviews,
  customers,
  marketWorkforceRecommendations,
  type MarketWorkforceRecommendation,
} from "@shared/schema";
import { eq, and, gte, isNull, count, sql, inArray, or } from "drizzle-orm";
import OpenAI from "openai";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface OperationalMetrics {
  openMoves: number;
  scheduledMoves7d: number;
  unassignedMoves: number;
  dispatchFillRatePct: number | null;
  avgFillTimeHours: number | null;
  slaCompliancePct: number | null;
}

export interface DriverMetrics {
  activeDrivers: number;
  eligibleDrivers: number;
  availableDrivers: number;
  shiftDrivers: number;
  onDemandDrivers: number;
  hybridDrivers: number;
  avgReliabilityScore: number | null;
  offerAcceptanceRatePct: number | null;
  turnover90dPct: number | null;
  attendancePct: number | null;
}

export interface RecruitingMetrics {
  openRequisitions: number;
  candidatesInPipeline: number;
  interviewsScheduled: number;
  offersExtended: number;
  hires30d: number;
  hires60d: number;
  hires90d: number;
  avgTimeToHireDays: number | null;
}

export interface BusinessMetrics {
  newAccounts60d: number;
  newAccounts90d: number;
  totalAccounts: number;
  seasonalFlag: string; // 'peak_summer' | 'peak_q4' | 'normal' | 'slow'
}

export interface MarketMetrics {
  market: string;
  collectedAt: string;
  operational: OperationalMetrics;
  drivers: DriverMetrics;
  recruiting: RecruitingMetrics;
  business: BusinessMetrics;
}

// ── Seasonal flag helper ───────────────────────────────────────────────────────

function getSeasonalFlag(): string {
  const month = new Date().getMonth() + 1; // 1-12
  if (month >= 6 && month <= 8) return "peak_summer";
  if (month >= 10 && month <= 12) return "peak_q4";
  if (month === 1 || month === 2) return "slow";
  return "normal";
}

// ── Main aggregation ───────────────────────────────────────────────────────────

export async function getMarketMetrics(market: string): Promise<MarketMetrics> {
  const now = new Date();
  const ago90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const ago60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const ago30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const next7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // ── Driver metrics ──────────────────────────────────────────────────────────
  const allMarketDrivers = await db
    .select({
      status: drivers.status,
      driverType: drivers.driverType,
      safetyScore: drivers.safetyScore,
    })
    .from(drivers)
    .where(
      and(
        sql`LOWER(${drivers.market}) = LOWER(${market})`,
        eq(drivers.isDeleted, false),
      ),
    );

  const activeDrivers = allMarketDrivers.filter((d) => d.status === "active");
  const activeCount = activeDrivers.length;

  const shiftCount = activeDrivers.filter((d) =>
    d.driverType?.toLowerCase().includes("shift"),
  ).length;
  const onDemandCount = activeDrivers.filter((d) =>
    d.driverType?.toLowerCase().includes("ondemand") ||
    d.driverType?.toLowerCase().includes("on demand") ||
    d.driverType?.toLowerCase().includes("on-demand"),
  ).length;
  const hybridCount = activeDrivers.filter((d) =>
    d.driverType?.toLowerCase().includes("hybrid"),
  ).length;

  const driverMetrics: DriverMetrics = {
    activeDrivers: activeCount,
    eligibleDrivers: allMarketDrivers.filter((d) =>
      d.status === "active" || d.status === "inactive",
    ).length,
    availableDrivers: activeCount, // approximation — no real-time availability table
    shiftDrivers: shiftCount,
    onDemandDrivers: onDemandCount,
    hybridDrivers: hybridCount,
    avgReliabilityScore: null, // Coming Soon metrics
    offerAcceptanceRatePct: null,
    turnover90dPct: null,
    attendancePct: null,
  };

  // ── Recruiting metrics ──────────────────────────────────────────────────────
  const openReqs = await db
    .select({ id: recruitingRequisitions.id })
    .from(recruitingRequisitions)
    .where(
      and(
        sql`LOWER(${recruitingRequisitions.market}) = LOWER(${market})`,
        eq(recruitingRequisitions.isArchived, false),
        inArray(recruitingRequisitions.status, ["open", "approved"]),
      ),
    );

  const openReqIds = openReqs.map((r) => r.id);

  // Pipeline counts
  let pipelineCount = 0;
  let offersExtended = 0;
  let hires30d = 0;
  let hires60d = 0;
  let hires90d = 0;

  if (openReqIds.length > 0) {
    const apps = await db
      .select({
        currentStage: recruitingApplications.currentStage,
        disposition: recruitingApplications.disposition,
        disposedAt: recruitingApplications.disposedAt,
        createdAt: recruitingApplications.createdAt,
      })
      .from(recruitingApplications)
      .where(inArray(recruitingApplications.requisitionId, openReqIds));

    for (const app of apps) {
      if (!app.disposition) pipelineCount++;
      if (app.currentStage === "offer" || app.currentStage === "offer_extended") offersExtended++;
      if (app.disposition === "hired" && app.disposedAt) {
        const hiredDate = new Date(app.disposedAt);
        if (hiredDate >= ago30) hires30d++;
        if (hiredDate >= ago60) hires60d++;
        if (hiredDate >= ago90) hires90d++;
      }
    }
  }

  // Interviews scheduled
  let interviewsScheduled = 0;
  if (openReqIds.length > 0) {
    // Get application IDs for those requisitions
    const appIds = await db
      .select({ id: recruitingApplications.id })
      .from(recruitingApplications)
      .where(
        and(
          inArray(recruitingApplications.requisitionId, openReqIds),
          isNull(recruitingApplications.disposition),
        ),
      );
    if (appIds.length > 0) {
      const [interviewRow] = await db
        .select({ cnt: count() })
        .from(recruitingInterviews)
        .where(
          and(
            inArray(recruitingInterviews.applicationId, appIds.map((a) => a.id)),
            eq(recruitingInterviews.status, "scheduled"),
            gte(recruitingInterviews.startTime, now),
          ),
        );
      interviewsScheduled = Number(interviewRow?.cnt ?? 0);
    }
  }

  // All reqs for this market (for time-to-hire)
  const allReqsForMarket = await db
    .select({ id: recruitingRequisitions.id })
    .from(recruitingRequisitions)
    .where(sql`LOWER(${recruitingRequisitions.market}) = LOWER(${market})`);

  let avgTimeToHireDays: number | null = null;
  if (allReqsForMarket.length > 0) {
    const hiredApps = await db
      .select({
        createdAt: recruitingApplications.createdAt,
        disposedAt: recruitingApplications.disposedAt,
      })
      .from(recruitingApplications)
      .where(
        and(
          inArray(recruitingApplications.requisitionId, allReqsForMarket.map((r) => r.id)),
          eq(recruitingApplications.disposition, "hired"),
          gte(recruitingApplications.disposedAt, ago90),
        ),
      );

    if (hiredApps.length > 0) {
      const totalDays = hiredApps.reduce((sum, a) => {
        if (!a.disposedAt || !a.createdAt) return sum;
        return sum + (new Date(a.disposedAt).getTime() - new Date(a.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      }, 0);
      avgTimeToHireDays = Math.round(totalDays / hiredApps.length);
    }
  }

  const recruitingMetrics: RecruitingMetrics = {
    openRequisitions: openReqs.length,
    candidatesInPipeline: pipelineCount,
    interviewsScheduled,
    offersExtended,
    hires30d,
    hires60d,
    hires90d,
    avgTimeToHireDays,
  };

  // ── Business metrics ────────────────────────────────────────────────────────
  const [total60, total90, totalAll] = await Promise.all([
    db
      .select({ cnt: count() })
      .from(customers)
      .where(
        and(
          or(
            sql`LOWER(${customers.customerCity}) = LOWER(${market})`,
            sql`LOWER(${customers.customerState}) = LOWER(${market})`,
          ),
          gte(customers.createdAt, ago60),
        ),
      ),
    db
      .select({ cnt: count() })
      .from(customers)
      .where(
        and(
          or(
            sql`LOWER(${customers.customerCity}) = LOWER(${market})`,
            sql`LOWER(${customers.customerState}) = LOWER(${market})`,
          ),
          gte(customers.createdAt, ago90),
        ),
      ),
    db
      .select({ cnt: count() })
      .from(customers)
      .where(
        or(
          sql`LOWER(${customers.customerCity}) = LOWER(${market})`,
          sql`LOWER(${customers.customerState}) = LOWER(${market})`,
        ),
      ),
  ]);

  const businessMetrics: BusinessMetrics = {
    newAccounts60d: Number(total60[0]?.cnt ?? 0),
    newAccounts90d: Number(total90[0]?.cnt ?? 0),
    totalAccounts: Number(totalAll[0]?.cnt ?? 0),
    seasonalFlag: getSeasonalFlag(),
  };

  // ── Operational metrics (approximated from available data) ──────────────────
  // Real-time move data is not currently indexed by market — return nulls for
  // Coming Soon fields; the AI will work with what's available.
  const operationalMetrics: OperationalMetrics = {
    openMoves: 0,
    scheduledMoves7d: 0,
    unassignedMoves: 0,
    dispatchFillRatePct: null,
    avgFillTimeHours: null,
    slaCompliancePct: null,
  };

  return {
    market,
    collectedAt: now.toISOString(),
    operational: operationalMetrics,
    drivers: driverMetrics,
    recruiting: recruitingMetrics,
    business: businessMetrics,
  };
}

// ── AI recommendation generation ───────────────────────────────────────────────

export interface RecommendedAction {
  action: string;
  driverType?: string;
  count?: number;
  rationale: string;
  priority: "high" | "medium" | "low";
}

export interface WorkforceRecommendationResult {
  narrativeSummary: string;
  recommendedActions: RecommendedAction[];
  estimatedDaysToBalance: number | null;
  confidenceScore: number;
  aiModel: string;
}

export async function generateMarketRecommendation(
  market: string,
): Promise<WorkforceRecommendationResult> {
  const metrics = await getMarketMetrics(market);

  const prompt = `You are a workforce planning AI for a transportation staffing company. Analyze the following market metrics and generate actionable workforce recommendations.

Market: ${market}
Data collected at: ${metrics.collectedAt}
Seasonal context: ${metrics.business.seasonalFlag}

DRIVER METRICS:
- Active Drivers: ${metrics.drivers.activeDrivers}
- Shift Drivers: ${metrics.drivers.shiftDrivers}
- OnDemand Drivers: ${metrics.drivers.onDemandDrivers}
- Hybrid Drivers: ${metrics.drivers.hybridDrivers}

RECRUITING METRICS:
- Open Requisitions: ${metrics.recruiting.openRequisitions}
- Candidates in Pipeline: ${metrics.recruiting.candidatesInPipeline}
- Interviews Scheduled: ${metrics.recruiting.interviewsScheduled}
- Offers Extended: ${metrics.recruiting.offersExtended}
- Hires (last 30 days): ${metrics.recruiting.hires30d}
- Hires (last 60 days): ${metrics.recruiting.hires60d}
- Hires (last 90 days): ${metrics.recruiting.hires90d}
- Avg Time to Hire: ${metrics.recruiting.avgTimeToHireDays != null ? `${metrics.recruiting.avgTimeToHireDays} days` : "Unknown"}

BUSINESS METRICS:
- New Accounts (60 days): ${metrics.business.newAccounts60d}
- New Accounts (90 days): ${metrics.business.newAccounts90d}
- Total Accounts in Market: ${metrics.business.totalAccounts}

Respond ONLY with a valid JSON object in this exact structure:
{
  "narrativeSummary": "A 1-2 sentence market insight referencing specific numbers and timeframes. Example: 'Demand in ${market} has increased with ${metrics.business.newAccounts60d} new accounts added in the last 60 days, but recruiting pipeline is thin with only ${metrics.recruiting.candidatesInPipeline} candidates.'",
  "recommendedActions": [
    {
      "action": "Hire X Hybrid Drivers",
      "driverType": "Hybrid",
      "count": 5,
      "rationale": "Brief reason why",
      "priority": "high"
    }
  ],
  "estimatedDaysToBalance": 21,
  "confidenceScore": 0.75
}

Rules:
- recommendedActions must be an array of 2-5 specific actions
- Each action must have "action" (string), "rationale" (string), "priority" ("high"|"medium"|"low")
- Include driverType and count only for hiring actions
- estimatedDaysToBalance must be a number (7-90) or null if market is balanced
- confidenceScore must be 0.0-1.0
- Be specific and data-driven. Reference actual numbers from the metrics above.
- If metrics show adequate staffing, recommend retention/optimization actions instead of hiring`;

  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

  if (!apiKey) {
    throw new Error("AI_INTEGRATIONS_OPENAI_API_KEY not configured");
  }

  const openai = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI returned invalid JSON");
  }

  return {
    narrativeSummary: String(parsed.narrativeSummary ?? ""),
    recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions : [],
    estimatedDaysToBalance: typeof parsed.estimatedDaysToBalance === "number" ? parsed.estimatedDaysToBalance : null,
    confidenceScore: typeof parsed.confidenceScore === "number" ? Math.max(0, Math.min(1, parsed.confidenceScore)) : 0.5,
    aiModel: response.model ?? "gpt-4o-mini",
  };
}

// ── Upsert recommendation ──────────────────────────────────────────────────────

export async function generateAndSaveRecommendation(
  market: string,
): Promise<MarketWorkforceRecommendation> {
  const result = await generateMarketRecommendation(market);
  const metrics = await getMarketMetrics(market);

  // Mark previous recommendations for this market as inactive
  await db
    .update(marketWorkforceRecommendations)
    .set({ isActive: false })
    .where(eq(marketWorkforceRecommendations.market, market));

  const [saved] = await db
    .insert(marketWorkforceRecommendations)
    .values({
      market,
      generatedAt: new Date(),
      aiModel: result.aiModel,
      metricsSnapshot: metrics as any,
      narrativeSummary: result.narrativeSummary,
      recommendedActions: result.recommendedActions as any,
      estimatedDaysToBalance: result.estimatedDaysToBalance,
      confidenceScore: result.confidenceScore,
      isActive: true,
    })
    .returning();

  return saved;
}

