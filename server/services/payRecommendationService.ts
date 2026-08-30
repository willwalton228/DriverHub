/**
 * AI Pay Recommendation Service — Ticket 16
 *
 * Analyzes historical internal fill data + market context to produce
 * a recruiter-advisory pay range, time-to-fill estimate, and market
 * competitiveness rating for a given requisition profile.
 *
 * IMPORTANT:
 * - Output is advisory only. Recruiter / admin makes the final call.
 * - The model does not use or infer protected characteristics.
 */

import OpenAI from "openai";
import { db } from "../db";
import { recruitingRequisitions } from "../../shared/schema";
import { and, eq, not, isNull, gte } from "drizzle-orm";

function getOpenAI(): OpenAI {
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

// ── Public types ───────────────────────────────────────────────────────────────

export interface PayRecommendationInputs {
  market: string;
  roleType?: string | null;
  workerType: string; // W2_DRIVER | IC_DRIVER | CORP_EMPLOYEE
  cdlRequired: boolean;
  employmentType?: string | null; // full_time | part_time | contract | seasonal
  targetFillDays?: number | null;
}

export interface PayRecommendationResult {
  payMin: number;
  payMax: number;
  payUnit: "hourly" | "salary" | "per_move";
  medianEstimate: number;
  timeToFillEstimate: number; // days
  competitivenessRating: "below_market" | "competitive" | "premium";
  narrativeSummary: string;
  flaggedConcerns: string[];
  historicalContext: {
    samplesFound: number;
    historicalAvgMin?: number;
    historicalAvgMax?: number;
  };
}

// ── Historical data pull ───────────────────────────────────────────────────────

async function pullHistoricalData(inputs: PayRecommendationInputs) {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 2); // last 2 years

  const rows = await db
    .select({
      compensationMin: recruitingRequisitions.compensationMin,
      compensationMax: recruitingRequisitions.compensationMax,
      compensationType: recruitingRequisitions.compensationType,
      requisitionType: recruitingRequisitions.requisitionType,
      market: recruitingRequisitions.market,
      openedAt: recruitingRequisitions.openedAt,
      closedAt: recruitingRequisitions.closedAt,
      targetFillDate: recruitingRequisitions.targetFillDate,
      currentHires: recruitingRequisitions.currentHires,
      targetHires: recruitingRequisitions.targetHires,
      workerType: recruitingRequisitions.workerType,
    })
    .from(recruitingRequisitions)
    .where(
      and(
        eq(recruitingRequisitions.market, inputs.market),
        eq(recruitingRequisitions.workerType, inputs.workerType as any),
        not(eq(recruitingRequisitions.isArchived, true)),
        isNull(recruitingRequisitions.archivedAt) as any,
        gte(recruitingRequisitions.createdAt, cutoff),
      )
    )
    .limit(50);

  const withComp = rows.filter(r => r.compensationMin || r.compensationMax);
  const mins = withComp.map(r => parseFloat(r.compensationMin || "0")).filter(v => v > 0);
  const maxs = withComp.map(r => parseFloat(r.compensationMax || "0")).filter(v => v > 0);

  // Time-to-fill: days between openedAt and closedAt for filled requisitions
  const filled = rows.filter(r => r.openedAt && r.closedAt && r.currentHires && r.currentHires > 0);
  const ttfDays = filled.map(r => {
    const open = new Date(r.openedAt!);
    const close = new Date(r.closedAt!);
    return Math.round((close.getTime() - open.getTime()) / (1000 * 60 * 60 * 24));
  }).filter(d => d > 0 && d < 365);

  return {
    samplesFound: rows.length,
    withCompCount: withComp.length,
    historicalAvgMin: mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : null,
    historicalAvgMax: maxs.length ? maxs.reduce((a, b) => a + b, 0) / maxs.length : null,
    avgTimeToFill: ttfDays.length ? Math.round(ttfDays.reduce((a, b) => a + b, 0) / ttfDays.length) : null,
    compensationTypes: [...new Set(withComp.map(r => r.compensationType).filter(Boolean))],
  };
}

// ── AI generation ──────────────────────────────────────────────────────────────

export async function generatePayRecommendation(
  inputs: PayRecommendationInputs,
): Promise<PayRecommendationResult> {
  const historical = await pullHistoricalData(inputs);

  const workerLabel = inputs.workerType === "IC_DRIVER" ? "Independent Contractor (1099)"
    : inputs.workerType === "W2_DRIVER" ? "W2 Employee"
    : "Corporate Employee";

  const historicalSection = historical.samplesFound > 0
    ? `Historical internal data (last 2 years, same market + worker type):
  - Requisitions found: ${historical.samplesFound}
  - With compensation data: ${historical.withCompCount}
  - Average min compensation: ${historical.historicalAvgMin ? `$${historical.historicalAvgMin.toFixed(2)}` : "N/A"}
  - Average max compensation: ${historical.historicalAvgMax ? `$${historical.historicalAvgMax.toFixed(2)}` : "N/A"}
  - Common compensation types: ${historical.compensationTypes.join(", ") || "N/A"}
  - Average time-to-fill (filled reqs): ${historical.avgTimeToFill ? `${historical.avgTimeToFill} days` : "N/A"}`
    : "No historical internal data found for this market + worker type combination.";

  const prompt = `You are a compensation analyst for a transportation and logistics company. Provide a data-driven pay recommendation for a driver recruiting requisition. Your output is advisory only — a recruiter or admin will make the final decision.

REQUISITION PROFILE:
- Market / City: ${inputs.market}
- Role Type: ${inputs.roleType || "Driver"}
- Worker Classification: ${workerLabel}
- CDL Required: ${inputs.cdlRequired ? "Yes" : "No"}
- Employment Type: ${inputs.employmentType || "full_time"}
- Target Time-to-Fill: ${inputs.targetFillDays ? `${inputs.targetFillDays} days` : "Not specified"}

${historicalSection}

INSTRUCTIONS:
- Estimate a competitive pay range (min and max) based on the profile and historical data.
- Choose the most appropriate pay unit: "hourly" for W2/IC shift drivers, "salary" for management/corporate roles, "per_move" for on-demand IC drivers.
- Estimate time-to-fill in days based on market conditions and historical patterns.
- Rate market competitiveness: "below_market" means the recommended range would attract fewer candidates; "competitive" is market-rate; "premium" is above-market to accelerate hiring.
- If target fill days is aggressive (< 14 days), bias toward "premium".
- Write a brief narrative summary (2–4 sentences) explaining the recommendation and key factors.
- Flag any concerns (e.g., tight timeline, limited historical data, market saturation).
- Do NOT consider protected characteristics (age, race, gender, etc.) in any recommendation.

Respond with ONLY valid JSON matching exactly this schema:
{
  "payMin": <number>,
  "payMax": <number>,
  "payUnit": "hourly" | "salary" | "per_move",
  "medianEstimate": <number>,
  "timeToFillEstimate": <number>,
  "competitivenessRating": "below_market" | "competitive" | "premium",
  "narrativeSummary": "<string>",
  "flaggedConcerns": ["<string>", ...]
}`;

  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const raw = response.choices[0]?.message?.content || "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI returned invalid JSON for pay recommendation");
  }

  return {
    payMin: Number(parsed.payMin) || 0,
    payMax: Number(parsed.payMax) || 0,
    payUnit: (["hourly", "salary", "per_move"].includes(parsed.payUnit) ? parsed.payUnit : "hourly") as any,
    medianEstimate: Number(parsed.medianEstimate) || Math.round((Number(parsed.payMin) + Number(parsed.payMax)) / 2),
    timeToFillEstimate: Number(parsed.timeToFillEstimate) || 21,
    competitivenessRating: (["below_market", "competitive", "premium"].includes(parsed.competitivenessRating)
      ? parsed.competitivenessRating : "competitive") as any,
    narrativeSummary: String(parsed.narrativeSummary || ""),
    flaggedConcerns: Array.isArray(parsed.flaggedConcerns) ? parsed.flaggedConcerns.map(String) : [],
    historicalContext: {
      samplesFound: historical.samplesFound,
      historicalAvgMin: historical.historicalAvgMin ?? undefined,
      historicalAvgMax: historical.historicalAvgMax ?? undefined,
    },
  };
}
