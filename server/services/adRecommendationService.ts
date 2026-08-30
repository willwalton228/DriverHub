/**
 * AI Ad Source Recommendation Service — Ticket 17
 *
 * Analyzes internal source-to-hire performance data and market context to
 * produce a ranked list of recommended advertising channels with confidence
 * scores and audience-fit notes.
 *
 * IMPORTANT:
 * - Advisory only. Recruiter / admin retains full decision authority.
 * - No protected characteristics are inferred or used.
 */

import OpenAI from "openai";
import { db } from "../db";
import {
  recruitingCandidates,
  recruitingApplications,
  recruitingRequisitions,
} from "../../shared/schema";
import { and, eq, sql } from "drizzle-orm";

function getOpenAI(): OpenAI {
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

// ── Channel catalogue ──────────────────────────────────────────────────────────

export const AD_CHANNELS = [
  "Indeed",
  "Craigslist",
  "Facebook Ads",
  "Facebook Groups",
  "Instagram",
  "TikTok",
  "LinkedIn",
  "ZipRecruiter",
  "Local / Community Boards",
  "Employee Referral Program",
  "Career Fair",
  "Company Website",
] as const;

export type AdChannel = (typeof AD_CHANNELS)[number];

// ── Public types ───────────────────────────────────────────────────────────────

export interface AdRecommendationInputs {
  market: string;
  roleType?: string | null;
  workerType: string; // W2_DRIVER | IC_DRIVER | CORP_EMPLOYEE
  cdlRequired: boolean;
  employmentType?: string | null;
  demographicStrategy?: string | null;
}

export interface RankedChannel {
  rank: number;
  channel: AdChannel;
  confidenceScore: number; // 0–100
  audienceFitNote: string;
  estimatedCostTier: "low" | "medium" | "high";
}

export interface AdRecommendationResult {
  rankedChannels: RankedChannel[];
  topChannel: AdChannel;
  narrativeSummary: string;
  historicalContext: {
    totalHiresSampled: number;
    sourceBreakdown: Record<string, number>;
  };
}

// ── Historical source-to-hire data pull ───────────────────────────────────────

async function pullSourceToHireData(market: string, workerType: string) {
  // Find requisitions in this market + worker type
  const reqs = await db
    .select({ id: recruitingRequisitions.id })
    .from(recruitingRequisitions)
    .where(
      and(
        eq(recruitingRequisitions.market, market),
        eq(recruitingRequisitions.workerType, workerType as any),
      )
    )
    .limit(200);

  if (reqs.length === 0) {
    return { totalHiresSampled: 0, sourceBreakdown: {} };
  }

  const reqIds = reqs.map(r => r.id);

  // Query candidates linked to applications on those requisitions that were hired
  const rows = await db
    .select({
      source: recruitingCandidates.source,
    })
    .from(recruitingApplications)
    .innerJoin(
      recruitingCandidates,
      eq(recruitingApplications.candidateId, recruitingCandidates.id)
    )
    .where(
      and(
        eq(recruitingCandidates.status, "hired"),
        sql`${recruitingApplications.requisitionId} = ANY(${sql.raw(`ARRAY[${reqIds.map(id => `'${id}'`).join(",")}]::varchar[]`)})`,
      )
    )
    .limit(500);

  const sourceBreakdown: Record<string, number> = {};
  for (const r of rows) {
    const src = r.source || "other";
    sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1;
  }

  return {
    totalHiresSampled: rows.length,
    sourceBreakdown,
  };
}

// ── AI generation ──────────────────────────────────────────────────────────────

export async function generateAdRecommendation(
  inputs: AdRecommendationInputs,
): Promise<AdRecommendationResult> {
  const historical = await pullSourceToHireData(inputs.market, inputs.workerType);

  const workerLabel =
    inputs.workerType === "IC_DRIVER"
      ? "Independent Contractor (1099)"
      : inputs.workerType === "W2_DRIVER"
        ? "W2 Employee"
        : "Corporate Employee";

  const historicalSection =
    historical.totalHiresSampled > 0
      ? `Internal source-to-hire data (same market + worker type):
  - Total hires sampled: ${historical.totalHiresSampled}
  - Breakdown by source:
${Object.entries(historical.sourceBreakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([src, count]) => `    • ${src}: ${count} hires`)
    .join("\n")}`
      : "No internal source-to-hire data found for this market and worker type combination.";

  const demographicNote = inputs.demographicStrategy
    ? `Candidate demographic strategy: ${inputs.demographicStrategy}`
    : "No specific demographic strategy provided — recommend broadly effective channels.";

  const prompt = `You are a recruiting strategy analyst for a transportation and logistics company. Recommend the best advertising channels for a driver recruiting requisition.

REQUISITION PROFILE:
- Market / City: ${inputs.market}
- Role Type: ${inputs.roleType || "Driver"}
- Worker Classification: ${workerLabel}
- CDL Required: ${inputs.cdlRequired ? "Yes — Class A or B commercial driver" : "No — non-CDL driver or support role"}
- Employment Type: ${inputs.employmentType || "full_time"}
- ${demographicNote}

${historicalSection}

AVAILABLE CHANNELS (rank all that are relevant, omit irrelevant ones):
${AD_CHANNELS.map((c, i) => `${i + 1}. ${c}`).join("\n")}

INSTRUCTIONS:
- Rank the channels from most to least recommended for this specific profile.
- Assign each a confidenceScore from 0–100 (100 = extremely strong fit).
- Write a brief audienceFitNote (1–2 sentences) explaining why each channel fits or doesn't.
- Assign estimatedCostTier: "low", "medium", or "high" per channel.
- Write a 2–3 sentence narrativeSummary covering the overall recommended strategy.
- CDL drivers are best reached on Indeed and Facebook Groups dedicated to truckers; TikTok skews younger and works for non-CDL / gig roles.
- For IC (1099) roles, Craigslist and Facebook Groups often outperform job boards.
- For W2 full-time, Indeed + company website typically yield the strongest qualified applicants.
- Include only channels with confidenceScore >= 30. Omit poor fits entirely.
- Do NOT consider protected characteristics (age, race, gender, etc.).

Respond with ONLY valid JSON:
{
  "rankedChannels": [
    {
      "rank": 1,
      "channel": "<exact channel name from list>",
      "confidenceScore": <0-100>,
      "audienceFitNote": "<string>",
      "estimatedCostTier": "low" | "medium" | "high"
    }
  ],
  "topChannel": "<exact channel name>",
  "narrativeSummary": "<string>"
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
    throw new Error("AI returned invalid JSON for ad recommendation");
  }

  const rankedChannels: RankedChannel[] = (parsed.rankedChannels || [])
    .map((c: any, idx: number) => ({
      rank: Number(c.rank) || idx + 1,
      channel: String(c.channel) as AdChannel,
      confidenceScore: Math.min(100, Math.max(0, Number(c.confidenceScore) || 50)),
      audienceFitNote: String(c.audienceFitNote || ""),
      estimatedCostTier: (["low", "medium", "high"].includes(c.estimatedCostTier)
        ? c.estimatedCostTier
        : "medium") as "low" | "medium" | "high",
    }))
    .sort((a: RankedChannel, b: RankedChannel) => a.rank - b.rank);

  return {
    rankedChannels,
    topChannel: (parsed.topChannel || rankedChannels[0]?.channel || "Indeed") as AdChannel,
    narrativeSummary: String(parsed.narrativeSummary || ""),
    historicalContext: historical,
  };
}
