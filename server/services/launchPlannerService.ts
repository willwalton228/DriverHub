/**
 * Market Launch Rapid Deployment Planner Service — Ticket 21
 *
 * Generates an actionable hiring plan for new customer launches using
 * market context, role requirements, and historical performance signals.
 *
 * Advisory only — leadership / recruiting retains full decision authority.
 */

import OpenAI from "openai";
import { db } from "../db";
import { marketLaunchPlans, type LaunchPlanOutput } from "../../shared/schema";
import { eq } from "drizzle-orm";

function getOpenAI(): OpenAI {
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

export interface LaunchPlanInputs {
  market: string;
  customerName: string;
  customerStartDate: string; // ISO date string "YYYY-MM-DD"
  roleType: "on_demand" | "shuttle" | "cdl" | "mixed";
  roleCounts: Record<string, number>;   // e.g. { "on_demand": 8, "cdl_a": 4 }
  hoursRequirements: {
    dailyHours?: number;
    coverageStart?: string;     // e.g. "06:00"
    coverageEnd?: string;       // e.g. "22:00"
    peakDays?: string[];        // e.g. ["Monday", "Friday"]
    weekendRequired?: boolean;
    shiftsPerDay?: number;
    notes?: string;
  };
}

function buildSystemPrompt(): string {
  return `You are an expert transportation workforce strategist specializing in rapid driver deployment for logistics and delivery companies.
You produce structured hiring plans to help clients launch new markets on time.
No protected characteristics (race, gender, age, religion, national origin, disability) are to be inferred, targeted, or mentioned.
Always respond with valid JSON only — no markdown, no prose outside the JSON object.`;
}

function buildUserPrompt(inputs: LaunchPlanInputs, daysUntilStart: number): string {
  const rolesSummary = Object.entries(inputs.roleCounts)
    .map(([role, count]) => `${count}× ${role}`)
    .join(", ");

  const coverageNotes = [
    inputs.hoursRequirements.coverageStart && inputs.hoursRequirements.coverageEnd
      ? `Coverage window: ${inputs.hoursRequirements.coverageStart}–${inputs.hoursRequirements.coverageEnd}`
      : null,
    inputs.hoursRequirements.shiftsPerDay
      ? `${inputs.hoursRequirements.shiftsPerDay} shift(s) per day`
      : null,
    inputs.hoursRequirements.weekendRequired ? "Weekend coverage required" : null,
    inputs.hoursRequirements.peakDays?.length
      ? `Peak days: ${inputs.hoursRequirements.peakDays.join(", ")}`
      : null,
    inputs.hoursRequirements.notes || null,
  ]
    .filter(Boolean)
    .join(". ");

  return `Generate a rapid deployment hiring plan for a new customer launch.

LAUNCH DETAILS:
- Market: ${inputs.market}
- Customer: ${inputs.customerName || "New Customer"}
- Service Start Date: ${inputs.customerStartDate} (${daysUntilStart} days from today)
- Primary Role Type: ${inputs.roleType}
- Roles Needed: ${rolesSummary}
- Coverage Requirements: ${coverageNotes || "Standard operating hours"}

Produce a JSON object with EXACTLY these fields:
{
  "headcountTarget": <integer — total drivers to hire including 15% buffer for attrition>,
  "payRange": {
    "min": <number — hourly or per-move minimum>,
    "max": <number — hourly or per-move maximum>,
    "type": <"hourly" | "per_move" | "salary">
  },
  "adSources": [
    {
      "channel": <string — ad channel name>,
      "priority": <"primary" | "secondary" | "supplemental">,
      "rationale": <string — 1-sentence reason this channel fits this market/role>,
      "estimatedCostTier": <"low" | "medium" | "high">
    }
  ],
  "expectedTimeToFill": {
    "days": <integer — realistic days to reach full headcount>,
    "weeksLabel": <string e.g. "3–4 weeks">
  },
  "dailyApplicantTarget": <integer — applicants needed per day to hit headcount on time>,
  "weeklyApplicantTarget": <integer — applicants needed per week>,
  "weeklyMilestones": [
    {
      "week": <integer 1–N>,
      "goal": <string — main recruiting milestone for this week>,
      "applicantTarget": <integer — cumulative applicants by end of week>,
      "hireTarget": <integer — cumulative hires by end of week>
    }
  ],
  "keyRisks": [<string — each a concise risk factor specific to this market/role/timeline>],
  "strategicNotes": <string — 2–4 sentences of strategic guidance for recruiters>,
  "generatedAt": "${new Date().toISOString()}"
}

Rules:
- headcountTarget should be role count total × 1.15, rounded up
- Include 3–5 ad sources ranked by suitability
- Weekly milestones should cover the full expected time-to-fill window
- 2–4 key risks relevant to this specific market and role type
- If fewer than 14 days until start, flag urgency prominently in strategicNotes
- CDL roles have longer time-to-fill (30–45 days typical)
- On-demand roles typically fill in 14–21 days in active markets`;
}

export async function generateLaunchPlan(inputs: LaunchPlanInputs): Promise<LaunchPlanOutput> {
  const startDate = new Date(inputs.customerStartDate);
  const today = new Date();
  const daysUntilStart = Math.max(0, Math.ceil((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

  try {
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(inputs, daysUntilStart) },
      ],
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty AI response");

    const plan = JSON.parse(raw) as LaunchPlanOutput;
    return plan;
  } catch (err) {
    console.error("[LaunchPlanner] AI generation failed, using formula fallback:", err);
    return generateFallbackPlan(inputs, daysUntilStart);
  }
}

function generateFallbackPlan(inputs: LaunchPlanInputs, daysUntilStart: number): LaunchPlanOutput {
  const totalRoles = Object.values(inputs.roleCounts).reduce((s, v) => s + v, 0);
  const headcountTarget = Math.ceil(totalRoles * 1.15);
  const isCdl = inputs.roleType === "cdl";
  const fillDays = isCdl ? 35 : daysUntilStart < 14 ? 14 : 21;
  const weeklyApplicantTarget = Math.ceil((headcountTarget * 5) / Math.ceil(fillDays / 7));
  const dailyApplicantTarget = Math.ceil(weeklyApplicantTarget / 5);

  const weeks = Math.ceil(fillDays / 7);
  const milestones: LaunchPlanOutput["weeklyMilestones"] = Array.from({ length: weeks }, (_, i) => ({
    week: i + 1,
    goal: i === 0
      ? "Launch ad campaign and build pipeline"
      : i === weeks - 1
      ? "Final hires onboarding — ready for service start"
      : `Advance pipeline — screenings and interviews`,
    applicantTarget: Math.round(weeklyApplicantTarget * (i + 1)),
    hireTarget: Math.round((headcountTarget / weeks) * (i + 1)),
  }));

  return {
    headcountTarget,
    payRange: isCdl ? { min: 22, max: 28, type: "hourly" } : { min: 16, max: 20, type: "hourly" },
    adSources: [
      { channel: "Indeed", priority: "primary", rationale: "Largest driver candidate pool in most markets.", estimatedCostTier: "medium" },
      { channel: "Facebook Ads", priority: "secondary", rationale: "Effective for local reach and quick turnaround.", estimatedCostTier: "medium" },
      { channel: "Local / Community Boards", priority: "supplemental", rationale: "Low cost, targets area residents directly.", estimatedCostTier: "low" },
    ],
    expectedTimeToFill: { days: fillDays, weeksLabel: `${Math.ceil(fillDays / 7)} week${weeks > 1 ? "s" : ""}` },
    dailyApplicantTarget,
    weeklyApplicantTarget,
    weeklyMilestones: milestones,
    keyRisks: [
      daysUntilStart < 14 ? "Extremely tight timeline — immediate ad spend activation required." : "Compressed launch window requires rapid pipeline build.",
      isCdl ? "CDL candidate pool is limited; expand geographic sourcing radius." : "Driver churn risk — pre-screen availability carefully.",
      "Onboarding and credentialing time must be factored into offer timing.",
    ],
    strategicNotes: `This plan targets ${headcountTarget} drivers (including 15% attrition buffer) for ${inputs.market}. ${daysUntilStart < 14 ? "URGENT: fewer than 14 days remain — activate all primary channels immediately and consider premium placement on job boards." : "Activate primary channels on Day 1 and monitor daily applicant flow against targets."} Prioritize speed-to-interview to compress time-to-hire.`,
    generatedAt: new Date().toISOString(),
  };
}

export async function saveLaunchPlan(
  planId: string,
  plan: LaunchPlanOutput
): Promise<void> {
  await db.update(marketLaunchPlans)
    .set({ generatedPlan: plan, status: "active", updatedAt: new Date() })
    .where(eq(marketLaunchPlans.id, planId));
}

export async function getLaunchPlan(id: string) {
  return db.query.marketLaunchPlans.findFirst({
    where: eq(marketLaunchPlans.id, id),
  });
}

export async function listLaunchPlans(filters?: { market?: string; status?: string }) {
  return db.query.marketLaunchPlans.findMany({
    orderBy: (t, { desc }) => desc(t.createdAt),
  });
}
