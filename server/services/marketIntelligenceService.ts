/**
 * Market Intelligence Service — Ticket 27
 *
 * Aggregates live pipeline/requisition context for a given geography and
 * calls GPT-4o to synthesize an AI-driven market intelligence snapshot
 * covering pay range, source/channel recommendations, time-to-fill,
 * supply risk, and launch readiness.
 *
 * Advisory only — recruiting leadership retains full decision authority.
 */

import OpenAI from "openai";
import { pool } from "../db";
import { db } from "../db";
import { marketIntelligenceSnapshots } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";

function getOpenAI(): OpenAI {
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

// ── Context builder ──────────────────────────────────────────────────────────

export interface MarketContext {
  geography: string;
  openRequisitions: number;
  totalRequisitions: number;
  pipelineByStage: Record<string, number>;
  totalActive: number;
  hiredCount: number;
  avgDaysToHire: number | null;
  roleTypeBreakdown: Record<string, number>;
  availabilityBreakdown: Record<string, number>;
  cdlRequiredCount: number;
  shuttleDriverCount: number;
}

async function gatherMarketContext(geography: string): Promise<MarketContext> {
  // Requisition counts for this geography
  const reqResult = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status IN ('open','active')) AS open_count,
       COUNT(*) FILTER (WHERE role_type = 'shuttle_driver') AS shuttle_count,
       COUNT(*) FILTER (WHERE cdl_required = true) AS cdl_count
     FROM recruiting_requisitions
     WHERE work_state ILIKE $1 OR title ILIKE $2`,
    [geography, `%${geography}%`]
  );
  const reqRow = reqResult.rows[0] || {};

  // Pipeline by stage
  const stageResult = await pool.query(
    `SELECT ra.current_stage, COUNT(*) AS cnt
     FROM recruiting_applications ra
     JOIN recruiting_requisitions rr ON ra.requisition_id = rr.id
     WHERE rr.work_state ILIKE $1 OR rr.title ILIKE $2
     GROUP BY ra.current_stage`,
    [geography, `%${geography}%`]
  );
  const pipelineByStage: Record<string, number> = {};
  for (const row of stageResult.rows) {
    pipelineByStage[row.current_stage || "new"] = parseInt(row.cnt, 10);
  }
  const totalActive = stageResult.rows
    .filter((r) => !["hired", "rejected", "withdrawn"].includes(r.current_stage || "new"))
    .reduce((s, r) => s + parseInt(r.cnt, 10), 0);
  const hiredCount = parseInt(pipelineByStage["hired"] || "0", 10);

  // Avg days from application to hire
  const daysResult = await pool.query(
    `SELECT AVG(EXTRACT(EPOCH FROM (ra.updated_at - ra.created_at))/86400) AS avg_days
     FROM recruiting_applications ra
     JOIN recruiting_requisitions rr ON ra.requisition_id = rr.id
     WHERE ra.current_stage = 'hired'
       AND (rr.work_state ILIKE $1 OR rr.title ILIKE $2)`,
    [geography, `%${geography}%`]
  );
  const avgDaysToHire = daysResult.rows[0]?.avg_days
    ? Math.round(parseFloat(daysResult.rows[0].avg_days))
    : null;

  // Role type breakdown
  const roleResult = await pool.query(
    `SELECT role_type, COUNT(*) AS cnt
     FROM recruiting_requisitions
     WHERE work_state ILIKE $1 OR title ILIKE $2
     GROUP BY role_type`,
    [geography, `%${geography}%`]
  );
  const roleTypeBreakdown: Record<string, number> = {};
  for (const row of roleResult.rows) {
    roleTypeBreakdown[row.role_type || "vehicle_movement"] = parseInt(row.cnt, 10);
  }

  // Availability breakdown
  const availResult = await pool.query(
    `SELECT availability_pattern, COUNT(*) AS cnt
     FROM recruiting_requisitions
     WHERE work_state ILIKE $1 OR title ILIKE $2
     GROUP BY availability_pattern`,
    [geography, `%${geography}%`]
  );
  const availabilityBreakdown: Record<string, number> = {};
  for (const row of availResult.rows) {
    availabilityBreakdown[row.availability_pattern || "standard"] = parseInt(row.cnt, 10);
  }

  return {
    geography,
    openRequisitions: parseInt(reqRow.open_count || "0", 10),
    totalRequisitions: parseInt(reqRow.total || "0", 10),
    pipelineByStage,
    totalActive,
    hiredCount,
    avgDaysToHire,
    roleTypeBreakdown,
    availabilityBreakdown,
    cdlRequiredCount: parseInt(reqRow.cdl_count || "0", 10),
    shuttleDriverCount: parseInt(reqRow.shuttle_count || "0", 10),
  };
}

// ── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(ctx: MarketContext): string {
  const stagesSummary = Object.entries(ctx.pipelineByStage)
    .map(([s, c]) => `${s}: ${c}`)
    .join(", ") || "no pipeline data";
  const rolesSummary = Object.entries(ctx.roleTypeBreakdown)
    .map(([r, c]) => `${r}: ${c}`)
    .join(", ") || "vehicle_movement (default)";
  const availSummary = Object.entries(ctx.availabilityBreakdown)
    .map(([a, c]) => `${a}: ${c}`)
    .join(", ") || "standard";

  return `You are an expert transportation workforce strategist. Analyze the recruiting market data below for "${ctx.geography}" and produce a structured market intelligence report.

MARKET DATA:
- Geography / Market: ${ctx.geography}
- Total Requisitions: ${ctx.totalRequisitions} (${ctx.openRequisitions} currently open)
- CDL Required: ${ctx.cdlRequiredCount} requisitions
- Shuttle Driver Role: ${ctx.shuttleDriverCount} requisitions
- Role Type Breakdown: ${rolesSummary}
- Availability Pattern Breakdown: ${availSummary}
- Pipeline By Stage: ${stagesSummary}
- Active Applicants (not hired/rejected/withdrawn): ${ctx.totalActive}
- Total Hired: ${ctx.hiredCount}
- Avg Days to Hire (observed): ${ctx.avgDaysToHire !== null ? ctx.avgDaysToHire + " days" : "insufficient data"}

Produce a JSON object with EXACTLY these fields:
{
  "payRangeMin": <number — minimum competitive hourly/per-move pay for this market>,
  "payRangeMax": <number — maximum competitive hourly/per-move pay for this market>,
  "payUnit": <"hourly" | "per_move" | "salary">,
  "payCompetitiveness": <"below_market" | "competitive" | "premium">,
  "payNarrative": <string — 2-3 sentences on pay strategy for this market>,
  "topChannel": <string — single best ad/sourcing channel for this market>,
  "rankedChannels": [
    {
      "channel": <string>,
      "priority": <"primary" | "secondary" | "supplemental">,
      "rationale": <string — 1 sentence>
    }
  ],
  "channelNarrative": <string — 2-3 sentences on sourcing strategy>,
  "expectedTimeToFill": <integer — realistic days to fill open reqs at current pipeline velocity>,
  "timeToFillNarrative": <string — 2-3 sentences explaining the estimate>,
  "supplyRiskLevel": <"low" | "moderate" | "high" | "critical">,
  "supplyRiskFactors": [<string — concise risk factor>],
  "supplyRiskNarrative": <string — 2-3 sentences on supply risk>,
  "launchReadinessScore": <integer 0-100 — overall readiness to launch/scale in this market>,
  "launchReadinessLabel": <"ready" | "at_risk" | "blocked">,
  "launchReadinessBlockers": [<string — specific blocker or gap>],
  "overallNarrative": <string — 3-4 sentence executive summary of market position>,
  "strategicPriorities": [<string — actionable priority, max 5 items>]
}

RULES:
- No protected characteristics (race, gender, age, etc.) in any output
- All pay figures are USD
- If pipeline data is thin, flag it in supply risk
- rankedChannels must have 3-6 entries
- strategicPriorities must have 3-5 entries
- Respond with valid JSON only — no markdown, no prose outside the JSON`;
}

// ── Main generation function ─────────────────────────────────────────────────

export async function generateMarketIntelligence(
  geography: string,
  generatedBy?: string
): Promise<MarketIntelligenceSnapshot> {
  const ctx = await gatherMarketContext(geography);
  const prompt = buildPrompt(ctx);

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are an expert transportation workforce strategist. Always respond with valid JSON only.",
      },
      { role: "user", content: prompt },
    ],
  });

  const raw = JSON.parse(completion.choices[0].message.content || "{}");

  // Persist snapshot
  const [snapshot] = await db
    .insert(marketIntelligenceSnapshots)
    .values({
      geography,
      activeRequisitions: ctx.openRequisitions,
      activePipeline: ctx.totalActive,
      hiredCount: ctx.hiredCount,
      payRangeMin: String(raw.payRangeMin ?? null),
      payRangeMax: String(raw.payRangeMax ?? null),
      payUnit: raw.payUnit ?? "hourly",
      payCompetitiveness: raw.payCompetitiveness ?? null,
      payNarrative: raw.payNarrative ?? null,
      topChannel: raw.topChannel ?? null,
      rankedChannels: raw.rankedChannels ?? [],
      channelNarrative: raw.channelNarrative ?? null,
      expectedTimeToFill: raw.expectedTimeToFill ?? null,
      timeToFillNarrative: raw.timeToFillNarrative ?? null,
      supplyRiskLevel: raw.supplyRiskLevel ?? null,
      supplyRiskFactors: raw.supplyRiskFactors ?? [],
      supplyRiskNarrative: raw.supplyRiskNarrative ?? null,
      launchReadinessScore: raw.launchReadinessScore ?? null,
      launchReadinessLabel: raw.launchReadinessLabel ?? null,
      launchReadinessBlockers: raw.launchReadinessBlockers ?? [],
      overallNarrative: raw.overallNarrative ?? null,
      strategicPriorities: raw.strategicPriorities ?? [],
      generatedBy: generatedBy ?? null,
      aiModel: completion.model,
    })
    .returning();

  return snapshot;
}

export type MarketIntelligenceSnapshot = typeof marketIntelligenceSnapshots.$inferSelect;

// ── Query helpers ────────────────────────────────────────────────────────────

export async function getLatestSnapshot(
  geography: string
): Promise<MarketIntelligenceSnapshot | null> {
  const [snapshot] = await db
    .select()
    .from(marketIntelligenceSnapshots)
    .where(eq(marketIntelligenceSnapshots.geography, geography))
    .orderBy(desc(marketIntelligenceSnapshots.generatedAt))
    .limit(1);
  return snapshot ?? null;
}

export async function getSnapshotHistory(
  geography: string,
  limit = 10
): Promise<MarketIntelligenceSnapshot[]> {
  return db
    .select()
    .from(marketIntelligenceSnapshots)
    .where(eq(marketIntelligenceSnapshots.geography, geography))
    .orderBy(desc(marketIntelligenceSnapshots.generatedAt))
    .limit(limit);
}

export async function listGeographies(): Promise<string[]> {
  const result = await pool.query(
    `SELECT DISTINCT work_state AS geo
     FROM recruiting_requisitions
     WHERE work_state IS NOT NULL AND work_state != ''
     UNION
     SELECT DISTINCT geography AS geo
     FROM market_intelligence_snapshots
     WHERE geography IS NOT NULL
     ORDER BY geo`
  );
  const geos = result.rows.map((r) => r.geo as string).filter(Boolean);
  if (geos.length === 0) {
    return ["National", "Northeast", "Southeast", "Midwest", "Southwest", "West Coast"];
  }
  return geos;
}
