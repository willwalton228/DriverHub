/**
 * AI Screening Review Summary Service — Ticket 14
 *
 * After all three screening results (MVR, Background Check, Drug Test) have
 * arrived, generates an advisory AI summary for recruiter decision support.
 *
 * IMPORTANT:
 * - AI does NOT make a final pass/fail decision.
 * - Recruiter remains the decision-maker at all times.
 * - The model does not infer or use protected characteristics.
 */

import OpenAI from "openai";
import { db } from "../db";
import {
  recruitingApplications,
  recruitingCandidates,
  recruitingRequisitions,
  recruitingScreeningRequests,
} from "../../shared/schema";
import { eq } from "drizzle-orm";

function getOpenAI(): OpenAI {
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface ScreeningConcern {
  type: "mvr" | "background_check" | "drug_test" | "consistency" | "history";
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
}

export interface ScreeningReviewResult {
  overallSentiment: "clear" | "concerns" | "blockers";
  flaggedConcerns: ScreeningConcern[];
  consistencyObservations: string[];
  recruiterReviewFocus: string[];
  summaryNarrative: string;
  generatedAt: string;
}

// ── Terminal statuses — clock stops, result is known ─────────────────────────

const TERMINAL_STATUSES = new Set([
  "clear", "completed", "failed", "flagged", "waived",
]);

/**
 * Returns true if all three screening types have a terminal result.
 * Used to decide when to auto-trigger the AI review.
 */
export function allScreeningsHaveResults(
  requests: Array<{ screeningType: string; status: string }>
): boolean {
  const types = new Set(["mvr", "background_check", "drug_test"]);
  for (const t of types) {
    const req = requests.find((r) => r.screeningType === t);
    if (!req || !TERMINAL_STATUSES.has(req.status)) return false;
  }
  return true;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchReviewInputs(applicationId: string) {
  const [application] = await db
    .select()
    .from(recruitingApplications)
    .where(eq(recruitingApplications.id, applicationId))
    .limit(1);

  if (!application) return null;

  const [candidate] = await db
    .select()
    .from(recruitingCandidates)
    .where(eq(recruitingCandidates.id, application.candidateId))
    .limit(1);

  const [requisition] = await db
    .select()
    .from(recruitingRequisitions)
    .where(eq(recruitingRequisitions.id, application.requisitionId))
    .limit(1);

  const screeningRequests = await db
    .select()
    .from(recruitingScreeningRequests)
    .where(eq(recruitingScreeningRequests.applicationId, applicationId));

  return { application, candidate, requisition, screeningRequests };
}

// ── AI call ───────────────────────────────────────────────────────────────────

async function generateReviewWithAI(
  inputs: Awaited<ReturnType<typeof fetchReviewInputs>>
): Promise<ScreeningReviewResult | null> {
  if (!inputs) return null;
  const { application, candidate, requisition, screeningRequests } = inputs;

  const byType = (t: string) => screeningRequests.find((r) => r.screeningType === t);
  const mvr = byType("mvr");
  const bg = byType("background_check");
  const drug = byType("drug_test");

  function summarizeScreening(label: string, req: typeof mvr): string {
    if (!req) return `${label}: Not on record`;
    const parts: string[] = [
      `${label}: status=${req.status}`,
      req.result ? `result=${req.result}` : "",
      req.resultNotes ? `notes="${req.resultNotes.slice(0, 300)}"` : "",
      req.notes ? `internal_notes="${req.notes.slice(0, 200)}"` : "",
    ].filter(Boolean);
    return parts.join(", ");
  }

  const reqTitle = requisition?.title || "Driver";
  const reqMarket = requisition?.market || "Unknown";
  const workerType = requisition?.workerType || "Unknown";
  const firstName = candidate?.firstName || "Candidate";
  const lastName = candidate?.lastName || "";

  const mvrSelf = [
    candidate?.mvrViolations3yr != null ? `self-reported ${candidate.mvrViolations3yr} violations (3yr)` : "",
    candidate?.mvrAtFaultAccidents != null ? `${candidate.mvrAtFaultAccidents} at-fault accidents` : "",
    candidate?.mvrDuiDwi === true ? "DUI/DWI: Yes" : "",
    candidate?.mvrYearsLicensed != null ? `licensed ${candidate.mvrYearsLicensed} years` : "",
  ].filter(Boolean).join("; ") || "No self-reported MVR data";

  const systemPrompt = `You are an objective, non-discriminatory AI screening review assistant for a driver recruiting team.
Your role is to synthesize the results of background screening (MVR, background check, drug test) and produce an advisory summary for recruiter review.

RULES:
- Do NOT make a final pass/fail or hire/no-hire decision. This summary is advisory only.
- Do NOT consider or infer any protected characteristics (race, gender, age, national origin, disability, religion, etc.).
- Base observations ONLY on the objective screening data and job-relevant factors provided.
- "blockers" sentiment means at least one result is flagged/failed and the recruiter must review before proceeding.
- "concerns" means results are mixed or have notes worth reviewing, but no hard block.
- "clear" means all screens passed with no notable concerns.
- If any screening is "waived", note that in observations but do not treat as a blocker.
- Be concise and recruiter-focused. This summary will be read alongside the raw screening records.

OUTPUT: Respond ONLY with valid JSON. No markdown fences. No text outside the JSON.
Schema:
{
  "overallSentiment": "clear" | "concerns" | "blockers",
  "flaggedConcerns": [
    { "type": "mvr"|"background_check"|"drug_test"|"consistency"|"history", "severity": "high"|"medium"|"low", "title": "...", "detail": "..." }
  ],
  "consistencyObservations": ["<observation 1>", ...],
  "recruiterReviewFocus": ["<action item 1>", ...],
  "summaryNarrative": "<2-3 sentence overall recruiter-facing narrative>"
}`;

  const userPrompt = `
POSITION: ${reqTitle} — Market: ${reqMarket} | Worker Type: ${workerType}
APPLICANT: ${firstName} ${lastName}

SCREENING RESULTS:
${summarizeScreening("MVR", mvr)}
${summarizeScreening("Background Check", bg)}
${summarizeScreening("Drug Test", drug)}

CANDIDATE SELF-REPORTED MVR DATA (application form):
${mvrSelf}

PRIOR AI PRE-SCREEN SUMMARY (if available):
${(application as any).aiPrescreenSummary ? (application as any).aiPrescreenSummary.slice(0, 500) : "Not available"}

RECRUITER INTERNAL NOTES:
${(application as any).internalNotes?.trim()?.slice(0, 400) || "None"}

Generate the screening review summary.`.trim();

  try {
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.15,
      max_tokens: 700,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    return {
      overallSentiment: (["clear", "concerns", "blockers"].includes(parsed.overallSentiment)
        ? parsed.overallSentiment
        : "concerns") as ScreeningReviewResult["overallSentiment"],
      flaggedConcerns: Array.isArray(parsed.flaggedConcerns) ? parsed.flaggedConcerns.slice(0, 8) : [],
      consistencyObservations: Array.isArray(parsed.consistencyObservations)
        ? parsed.consistencyObservations.slice(0, 6)
        : [],
      recruiterReviewFocus: Array.isArray(parsed.recruiterReviewFocus)
        ? parsed.recruiterReviewFocus.slice(0, 5)
        : [],
      summaryNarrative: String(parsed.summaryNarrative || "").trim() || "No narrative generated.",
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[ScreeningReview] GPT call failed:", err);
    return null;
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Generates and persists the AI screening review for an application.
 * Designed to run fire-and-forget; non-blocking errors are swallowed.
 */
export async function runScreeningReview(applicationId: string): Promise<void> {
  console.log(`[ScreeningReview] Generating review for application ${applicationId}`);
  try {
    // Mark as generating so UI can show a spinner
    await db
      .update(recruitingApplications)
      .set({ aiScreeningReviewGenerating: true } as any)
      .where(eq(recruitingApplications.id, applicationId));

    const inputs = await fetchReviewInputs(applicationId);
    if (!inputs) {
      console.warn(`[ScreeningReview] Application ${applicationId} not found`);
      await db
        .update(recruitingApplications)
        .set({ aiScreeningReviewGenerating: false } as any)
        .where(eq(recruitingApplications.id, applicationId));
      return;
    }

    const result = await generateReviewWithAI(inputs);

    await db
      .update(recruitingApplications)
      .set({
        aiScreeningReview: result as any,
        aiScreeningReviewGeneratedAt: result ? new Date() : null,
        aiScreeningReviewGenerating: false,
      } as any)
      .where(eq(recruitingApplications.id, applicationId));

    console.log(
      `[ScreeningReview] Saved review sentiment=${result?.overallSentiment ?? "null"} concerns=${result?.flaggedConcerns?.length ?? 0} for ${applicationId}`
    );
  } catch (err) {
    console.error(`[ScreeningReview] Pipeline failed for ${applicationId}:`, err);
    // Always clear the generating flag even on error
    try {
      await db
        .update(recruitingApplications)
        .set({ aiScreeningReviewGenerating: false } as any)
        .where(eq(recruitingApplications.id, applicationId));
    } catch { /* ignore */ }
  }
}
