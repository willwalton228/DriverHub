/**
 * Recruiting Plan Service — Ticket 44
 *
 * Auto-generates a structured hiring plan on request approval.
 * Derives daily applicant targets, weekly hiring targets, estimated
 * readiness, and risk flags from request data + market intelligence.
 *
 * Advisory only — recruiters can adjust targets at any time.
 */

import { db } from "../db";
import { recruitingPlans } from "../../shared/schema";
import { eq } from "drizzle-orm";

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_MULTIPLIER      = 10;   // applicants needed per hire
const MIN_SCREENING_DAYS      = 5;    // minimum days for screening cycle
const MIN_SOURCING_DAYS       = 7;    // minimum days for sourcing cycle
const DEFAULT_WEEKS_IF_NO_DATE = 3;   // fallback when no target date set

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(targetDateStr: string | null | undefined): number {
  if (!targetDateStr) return DEFAULT_WEEKS_IF_NO_DATE * 7;
  const target = new Date(targetDateStr);
  if (isNaN(target.getTime())) return DEFAULT_WEEKS_IF_NO_DATE * 7;
  const diff = Math.ceil((target.getTime() - Date.now()) / 86_400_000);
  return Math.max(1, diff);
}

function parseChannels(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Handle both string[] and {channel, confidence, rationale}[]
      return parsed
        .map((c: any) => (typeof c === "string" ? c : c?.channel))
        .filter(Boolean);
    }
    return [];
  } catch {
    return [];
  }
}

interface MarketIntel {
  payRangeMin?:        string | null;
  payRangeMax?:        string | null;
  recommendedChannels?: string | null;
  supplyRiskLevel?:    string | null;
}

// ── Core plan computation ─────────────────────────────────────────────────────

export interface PlanComputation {
  requiredHeadcount:    number;
  dailyApplicantTarget: number;
  weeklyHiringTarget:   number;
  applicantMultiplier:  number;
  recommendedChannels:  string[];
  suggestedPayMin:      number | null;
  suggestedPayMax:      number | null;
  estimatedTimeToReady: number;
  daysUntilTarget:      number;
  targetDate:           string | null;
  riskFlags:            string[];
  generatedBy:          "auto";
}

function computePlan(
  requestData: any,
  marketIntel: MarketIntel | null,
): PlanComputation {
  // ── Inputs ───────────────────────────────────────────────────────────────
  const targetDriverCount = parseInt(String(
    requestData.targetDriverCount ??
    requestData.target_hires ??
    requestData.targetHires ??
    1
  ), 10) || 1;

  const targetDateStr: string | null =
    requestData.targetDate ??
    requestData.target_date ??
    requestData.targetFillDate ??
    null;

  const urgency      = parseInt(String(requestData.urgency ?? "3"), 10) || 3;
  const campaignType = String(requestData.campaignType ?? "standard");
  const driverType   = String(requestData.programType ?? requestData.driverType ?? requestData.workType ?? "").toLowerCase();
  const market       = String(requestData.location ?? requestData.market ?? "");

  const supplyRisk   = marketIntel?.supplyRiskLevel ?? null;
  const payMin       = marketIntel?.payRangeMin ? parseFloat(String(marketIntel.payRangeMin)) : null;
  const payMax       = marketIntel?.payRangeMax ? parseFloat(String(marketIntel.payRangeMax)) : null;

  // ── Time math ────────────────────────────────────────────────────────────
  const days         = daysUntil(targetDateStr);
  const weeks        = Math.max(0.5, days / 7);

  // ── Multiplier (adjustable by campaign type) ──────────────────────────────
  const multiplierMap: Record<string, number> = {
    expedite: 8,
    launch:   10,
    standard: 10,
    other:    12,
  };
  const multiplier = multiplierMap[campaignType] ?? DEFAULT_MULTIPLIER;

  // ── Derived targets ───────────────────────────────────────────────────────
  const dailyApplicantTarget = Math.ceil(targetDriverCount * multiplier / Math.max(1, days));
  const weeklyHiringTarget   = Math.ceil(targetDriverCount / weeks);

  // ── Estimated time to ready ───────────────────────────────────────────────
  // = max(screening cycle, sourcing cycle), capped by days until target
  const screeningDays = Math.max(MIN_SCREENING_DAYS, Math.ceil(targetDriverCount * 0.8));
  const sourcingDays  = Math.max(MIN_SOURCING_DAYS, Math.ceil(targetDriverCount * 1.2));
  const estimatedTimeToReady = Math.min(days, Math.max(screeningDays, sourcingDays));

  // ── Channels ─────────────────────────────────────────────────────────────
  const fromIntel = parseChannels(marketIntel?.recommendedChannels);
  const channels  = fromIntel.length > 0
    ? fromIntel
    : ["Facebook Groups", "Indeed", "Craigslist"];

  // ── Risk flags ────────────────────────────────────────────────────────────
  const riskFlags: string[] = [];

  if (supplyRisk === "critical") riskFlags.push("Critical supply shortage — expedite posting immediately");
  else if (supplyRisk === "high") riskFlags.push("High demand market — consider sign-on bonus");

  if (days < 14)  riskFlags.push("Tight timeline — fewer than 2 weeks to target date");
  else if (days < 21) riskFlags.push("Compressed timeline — less than 3 weeks to target date");

  if (targetDriverCount >= 15) riskFlags.push("Large headcount — consider parallel sourcing tracks");
  else if (targetDriverCount >= 8) riskFlags.push("Moderate headcount — multi-channel posting recommended");

  if (driverType.includes("cdl")) riskFlags.push("CDL required — smaller candidate pool expected");
  if (campaignType === "expedite") riskFlags.push("Expedited campaign — prioritize pre-screened candidates");
  if (urgency >= 5) riskFlags.push("Maximum urgency — activate all channels simultaneously");

  return {
    requiredHeadcount:    targetDriverCount,
    dailyApplicantTarget: Math.max(1, dailyApplicantTarget),
    weeklyHiringTarget:   Math.max(1, weeklyHiringTarget),
    applicantMultiplier:  multiplier,
    recommendedChannels:  channels,
    suggestedPayMin:      payMin,
    suggestedPayMax:      payMax,
    estimatedTimeToReady: Math.max(1, estimatedTimeToReady),
    daysUntilTarget:      days,
    targetDate:           targetDateStr,
    riskFlags,
    generatedBy:          "auto",
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function generateRecruitingPlan(
  requestId:    string,
  requisitionId: string,
  requestData:  any,
  marketIntel:  MarketIntel | null = null,
) {
  const plan = computePlan(requestData, marketIntel);

  // Check for existing non-manual record
  const existing = await db
    .select()
    .from(recruitingPlans)
    .where(eq(recruitingPlans.requisitionId, requisitionId))
    .limit(1);

  const row = {
    requiredHeadcount:    plan.requiredHeadcount,
    dailyApplicantTarget: plan.dailyApplicantTarget,
    weeklyHiringTarget:   String(plan.weeklyHiringTarget),
    applicantMultiplier:  String(plan.applicantMultiplier),
    recommendedChannels:  JSON.stringify(plan.recommendedChannels),
    suggestedPayMin:      plan.suggestedPayMin != null ? String(plan.suggestedPayMin) : null,
    suggestedPayMax:      plan.suggestedPayMax != null ? String(plan.suggestedPayMax) : null,
    estimatedTimeToReady: plan.estimatedTimeToReady,
    daysUntilTarget:      plan.daysUntilTarget,
    targetDate:           plan.targetDate ?? null,
    riskFlags:            JSON.stringify(plan.riskFlags),
    generatedBy:          plan.generatedBy,
    updatedAt:            new Date(),
  };

  if (existing.length > 0) {
    // Don't overwrite if manually edited (generatedBy === 'manual')
    if (existing[0].generatedBy === "manual") return existing[0];

    const [updated] = await db
      .update(recruitingPlans)
      .set(row)
      .where(eq(recruitingPlans.requisitionId, requisitionId))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(recruitingPlans)
    .values({
      requisitionId,
      requestId:  requestId || null,
      status:     "draft",
      ...row,
    } as any)
    .returning();

  return created;
}

// ── Recompute from live DB data ───────────────────────────────────────────────
// Used by the manual-regenerate endpoint.
export async function recomputePlan(
  requisitionId: string,
  requestData:   any,
  marketIntel:   MarketIntel | null = null,
) {
  const plan = computePlan(requestData, marketIntel);

  const row = {
    requiredHeadcount:    plan.requiredHeadcount,
    dailyApplicantTarget: plan.dailyApplicantTarget,
    weeklyHiringTarget:   String(plan.weeklyHiringTarget),
    applicantMultiplier:  String(plan.applicantMultiplier),
    recommendedChannels:  JSON.stringify(plan.recommendedChannels),
    suggestedPayMin:      plan.suggestedPayMin != null ? String(plan.suggestedPayMin) : null,
    suggestedPayMax:      plan.suggestedPayMax != null ? String(plan.suggestedPayMax) : null,
    estimatedTimeToReady: plan.estimatedTimeToReady,
    daysUntilTarget:      plan.daysUntilTarget,
    targetDate:           plan.targetDate ?? null,
    riskFlags:            JSON.stringify(plan.riskFlags),
    generatedBy:          "auto",
    updatedAt:            new Date(),
  };

  const [upserted] = await db
    .update(recruitingPlans)
    .set(row)
    .where(eq(recruitingPlans.requisitionId, requisitionId))
    .returning();

  return upserted;
}
