/**
 * Campaign Intelligence Service — Ticket 43
 *
 * Generates per-campaign market intelligence on request approval:
 *   - Recommended pay range
 *   - Expected time to fill (days)
 *   - Ranked channel recommendations with confidence
 *   - Supply risk level
 *   - Plain-language notes summary
 *
 * Uses OpenAI GPT-4o when available; falls back to heuristics otherwise.
 * Advisory only — recruiters retain full authority over final decisions.
 */

import OpenAI from "openai";
import { db } from "../db";
import { campaignMarketIntelligence } from "../../shared/schema";
import { eq } from "drizzle-orm";

function getOpenAI(): OpenAI {
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

export interface ChannelRecommendation {
  channel: string;
  confidence: "high" | "medium" | "low";
  rationale: string;
}

export interface IntelligenceOutput {
  payRangeMin: number;
  payRangeMax: number;
  expectedTimeToFill: number;
  recommendedChannels: ChannelRecommendation[];
  supplyRiskLevel: "low" | "medium" | "high" | "critical";
  notesSummary: string;
  generatedBy: "ai" | "heuristic";
}

// ── Heuristic fallback ───────────────────────────────────────────────────────

function buildHeuristicOutput(requestData: any): IntelligenceOutput {
  const payRate = parseFloat(requestData.payRate || "0") || 18;
  const urgency = parseInt(requestData.urgency || "3", 10);
  const campaignType = requestData.campaignType || "standard";

  const payRangeMin = Math.round(payRate * 0.9 * 100) / 100;
  const payRangeMax = Math.round(payRate * 1.15 * 100) / 100;

  const fillDaysMap: Record<string, number> = {
    expedite: 10, launch: 14, standard: 21, other: 21,
  };
  const baseDays = fillDaysMap[campaignType] ?? 21;
  const urgencyAdjust = urgency >= 5 ? -5 : urgency >= 4 ? -3 : urgency <= 1 ? 7 : 0;
  const expectedTimeToFill = Math.max(7, baseDays + urgencyAdjust);

  const supplyRiskMap: Record<number, "low" | "medium" | "high" | "critical"> = {
    1: "low", 2: "low", 3: "medium", 4: "high", 5: "critical",
  };
  const supplyRiskLevel = supplyRiskMap[urgency] ?? "medium";

  const recommendedChannels: ChannelRecommendation[] = [
    { channel: "Facebook Groups", confidence: "high",   rationale: "High engagement for shift and gig drivers." },
    { channel: "Indeed",          confidence: "high",   rationale: "Broad reach, cost-effective for driver roles." },
    { channel: "Craigslist",      confidence: "medium", rationale: "Strong local reach for non-CDL positions." },
    { channel: "ZipRecruiter",    confidence: "medium", rationale: "Algorithmic matching surfaces qualified candidates." },
    { channel: "Instagram",       confidence: "low",    rationale: "Useful for brand awareness in younger demographics." },
  ];

  const driverType = requestData.programType || requestData.driverType || "driver";
  const location = requestData.location || requestData.market || "the target market";

  const notesSummary = [
    `Based on the submitted pay rate of $${payRate}/hr and ${campaignType} campaign type,`,
    `the estimated pay range for ${driverType} roles in ${location} is $${payRangeMin}–$${payRangeMax}/hr.`,
    `With urgency level ${urgency}/5, the estimated fill time is ${expectedTimeToFill} days.`,
    supplyRiskLevel === "critical"
      ? "Supply risk is CRITICAL — consider expedited posting and bonus incentives immediately."
      : supplyRiskLevel === "high"
      ? "Supply risk is elevated. Prioritize high-confidence channels and consider a sign-on bonus."
      : supplyRiskLevel === "medium"
      ? "Supply risk is moderate. Standard multi-channel posting should be sufficient."
      : "Supply risk is low. A targeted single-channel approach may be adequate.",
    "These are AI-assisted recommendations — recruiter judgment should inform final decisions.",
  ].join(" ");

  return { payRangeMin, payRangeMax, expectedTimeToFill, recommendedChannels, supplyRiskLevel, notesSummary, generatedBy: "heuristic" };
}

// ── OpenAI generation ────────────────────────────────────────────────────────

async function buildAIOutput(requestData: any): Promise<IntelligenceOutput> {
  const openai = getOpenAI();

  const location       = requestData.location || requestData.market || "Unknown";
  const driverType     = requestData.programType || requestData.driverType || "driver";
  const targetCount    = requestData.targetDriverCount ?? 1;
  const payRate        = parseFloat(requestData.payRate || "0");
  const urgency        = parseInt(requestData.urgency || "3", 10);
  const campaignType   = requestData.campaignType || "standard";
  const targetDate     = requestData.targetDate || null;
  const schedule       = requestData.driverSchedule || null;
  const dealership     = requestData.dealershipName || null;
  const classification = requestData.driverClassification || null;
  const employmentType = requestData.employmentType || null;

  const prompt = `You are a recruiting market intelligence analyst for a transportation staffing company.
Generate market intelligence for this driver recruiting campaign.

Campaign details:
- Location: ${location}${dealership ? ` (Account: ${dealership})` : ""}
- Driver Type: ${driverType}${classification ? ` — ${classification}` : ""}
- Employment Type: ${employmentType || "Not specified"}
- Target Drivers: ${targetCount}
- Requested Pay Rate: ${payRate > 0 ? `$${payRate}/hr` : "Not specified"}
- Campaign Type: ${campaignType}
- Urgency: ${urgency}/5
- Target Fill Date: ${targetDate || "Not specified"}
- Schedule: ${schedule || "Not specified"}

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "payRangeMin": <number, dollars per hour>,
  "payRangeMax": <number, dollars per hour>,
  "expectedTimeToFill": <integer, days>,
  "recommendedChannels": [
    {"channel": "<name>", "confidence": "<high|medium|low>", "rationale": "<1 sentence>"},
    ... (3-5 channels, ranked by effectiveness for this role type/location)
  ],
  "supplyRiskLevel": "<low|medium|high|critical>",
  "notesSummary": "<2-3 sentence plain-language summary for the recruiter>"
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 800,
  });

  const raw = response.choices[0]?.message?.content?.trim() || "";
  const parsed = JSON.parse(raw);

  return {
    payRangeMin:         Number(parsed.payRangeMin)        || 0,
    payRangeMax:         Number(parsed.payRangeMax)        || 0,
    expectedTimeToFill:  parseInt(String(parsed.expectedTimeToFill), 10) || 21,
    recommendedChannels: Array.isArray(parsed.recommendedChannels) ? parsed.recommendedChannels : [],
    supplyRiskLevel:     (["low","medium","high","critical"].includes(parsed.supplyRiskLevel)
                           ? parsed.supplyRiskLevel : "medium") as IntelligenceOutput["supplyRiskLevel"],
    notesSummary:        String(parsed.notesSummary || ""),
    generatedBy:         "ai",
  };
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function generateCampaignIntelligence(
  requestId: string,
  requisitionId: string,
  requestData: any,
): Promise<CampaignMarketIntelligence | null> {
  let output: IntelligenceOutput;

  const hasOpenAI = !!(
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY
  );

  if (hasOpenAI) {
    try {
      output = await buildAIOutput(requestData);
    } catch (err) {
      console.warn("[CampaignIntel] OpenAI failed, using heuristic fallback:", err);
      output = buildHeuristicOutput(requestData);
    }
  } else {
    output = buildHeuristicOutput(requestData);
  }

  const channelsJson = JSON.stringify(output.recommendedChannels);

  // Upsert: if record already exists for this requisition, update it
  const existing = await db
    .select()
    .from(campaignMarketIntelligence)
    .where(eq(campaignMarketIntelligence.requisitionId, requisitionId))
    .limit(1);

  if (existing.length > 0 && !existing[0].isOverridden) {
    const [updated] = await db
      .update(campaignMarketIntelligence)
      .set({
        payRangeMin:         String(output.payRangeMin),
        payRangeMax:         String(output.payRangeMax),
        expectedTimeToFill:  output.expectedTimeToFill,
        recommendedChannels: channelsJson,
        supplyRiskLevel:     output.supplyRiskLevel,
        notesSummary:        output.notesSummary,
        generatedBy:         output.generatedBy,
        updatedAt:           new Date(),
      })
      .where(eq(campaignMarketIntelligence.requisitionId, requisitionId))
      .returning();
    return updated as any;
  }

  if (existing.length > 0 && existing[0].isOverridden) {
    return existing[0] as any;
  }

  const [created] = await db
    .insert(campaignMarketIntelligence)
    .values({
      requisitionId,
      requestId:           requestId || null,
      payRangeMin:         String(output.payRangeMin),
      payRangeMax:         String(output.payRangeMax),
      expectedTimeToFill:  output.expectedTimeToFill,
      recommendedChannels: channelsJson,
      supplyRiskLevel:     output.supplyRiskLevel,
      notesSummary:        output.notesSummary,
      generatedBy:         output.generatedBy,
    } as any)
    .returning();

  return created as any;
}
