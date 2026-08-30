/**
 * AI Pre-Screen Scoring Service
 * Generates an advisory 0–100 score, recommendation, and summary for recruiter review.
 *
 * IMPORTANT:
 * - AI is purely advisory. Recruiters remain the final decision-makers.
 * - The "reject_recommended" label is a suggestion only; no auto-rejection occurs.
 * - The model does not infer or use protected characteristics.
 */

import OpenAI from "openai";
import { db } from "../db";
import {
  recruitingApplications,
  recruitingCandidates,
  recruitingRequisitions,
} from "../../shared/schema";
import { eq } from "drizzle-orm";
import { detectRedFlags, formatFlagsForPrompt } from "./redFlagRulesEngine";

function getOpenAI(): OpenAI {
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

export interface PrescreenResult {
  score: number;
  recommendation: "advance" | "review" | "reject_recommended";
  summary: string;
}

function buildRecommendation(score: number): PrescreenResult["recommendation"] {
  if (score >= 68) return "advance";
  if (score >= 38) return "review";
  return "reject_recommended";
}

/**
 * Enriches scoring inputs from DB for a given recruiting_applications ID.
 */
async function fetchScoringInputs(applicationId: string) {
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

  return { application, candidate, requisition };
}

/**
 * Calls GPT-4o to produce a structured pre-screen score for a driver applicant.
 * Red flags detected by the rules engine are injected into the prompt to influence scoring.
 */
async function scoreWithAI(
  inputs: Awaited<ReturnType<typeof fetchScoringInputs>>,
  redFlagSummary: string
): Promise<PrescreenResult | null> {
  if (!inputs) return null;
  const { application, candidate, requisition } = inputs;

  const openai = getOpenAI();

  const systemPrompt = `You are an objective, non-discriminatory AI pre-screening assistant for a driver recruiting team.
Your role is to evaluate driver applicants against job requirements and produce an advisory numeric score.

RULES:
- Score range: 0–100. Higher = stronger fit.
- Do NOT make final hiring decisions. This is advisory only.
- Do NOT consider or infer protected characteristics (race, age, gender, national origin, disability, religion, etc.).
- Base your score ONLY on job-relevant, objective factors: license type, experience, availability, geo-eligibility, MVR record, vehicle access, and work authorization.
- "reject_recommended" is a soft signal for recruiter review, never an automatic rejection.
- Red flags detected by the rules engine are provided below and MUST be factored into your score. High-severity flags should materially lower the score. However, do not score to zero unless all factors are disqualifying.

SCORING GUIDANCE:
- 68–100 → advance: Strong match across most factors
- 38–67  → review:  Mixed signals; recruiter judgment needed
- 0–37   → reject_recommended: Significant gaps vs. requirements

OUTPUT: Respond ONLY with valid JSON. No markdown. No explanations outside the JSON.
Schema:
{
  "score": <integer 0-100>,
  "summary": "<2-3 sentence recruiter-facing explanation of the score, citing specific data points. Reference the job title. Do not use protected characteristics.>"
}`;

  const licenseInfo = candidate?.licenseClass
    ? `License class: ${candidate.licenseClass}${candidate.licenseState ? ` (${candidate.licenseState})` : ""}${candidate.hasCommercialLicense ? " — CDL holder" : ""}`
    : "License class: Not provided";

  const reqTitle = requisition?.title || "Driver";
  const reqMarket = requisition?.market || "Unknown";
  const workerType = requisition?.workerType || "Unknown";
  const workType = requisition?.workType || "Unknown";

  const yearsExp = candidate?.yearsExperience != null ? `${candidate.yearsExperience} years` : "Not specified";
  const mvrLicensed = candidate?.mvrYearsLicensed != null ? `${candidate.mvrYearsLicensed} years licensed` : "Not specified";
  const mvrViolations = candidate?.mvrViolations3yr != null ? `${candidate.mvrViolations3yr} violations (3yr)` : "Not specified";
  const mvrAtFault = candidate?.mvrAtFaultAccidents != null ? `${candidate.mvrAtFaultAccidents} at-fault accidents` : "Not specified";
  const mvrDui = candidate?.mvrDuiDwi === true ? "Yes" : candidate?.mvrDuiDwi === false ? "No" : "Not specified";
  const geoStatus = application.geoEligible === true ? "In-range" : application.geoEligible === false ? "Out-of-range" : "Unknown";
  const distanceMiles = application.distanceMiles != null ? `${application.distanceMiles} miles` : "Unknown";
  const licenseEligible = application.licenseEligible === true ? "Meets requirements" : application.licenseEligible === false ? `Does not meet — ${application.licenseMismatchReason || "reason unknown"}` : "Not evaluated";
  const readinessScore = application.readinessScore != null ? `${application.readinessScore}/100` : "Not calculated";
  const internalNotes = application.internalNotes?.trim() || "None";

  const userPrompt = `
POSITION: ${reqTitle} — Market: ${reqMarket}
Worker Type: ${workerType} | Work Type: ${workType}

CANDIDATE PROFILE:
- Driving experience: ${yearsExp}
- ${licenseInfo}
- Work authorization: ${candidate?.authorizedToWork === true ? "Authorized" : candidate?.authorizedToWork === false ? "Not authorized" : "Not verified"}
- Vehicle access: ${candidate?.accessToVehicle === true ? "Yes" : candidate?.accessToVehicle === false ? "No" : "Not specified"}
- Vehicle type: ${candidate?.vehicleType || "Not specified"}
- Trailer access: ${candidate?.trailerAccess === true ? "Yes" : "No"}
- MVR: ${mvrLicensed}, ${mvrViolations}, ${mvrAtFault}, DUI/DWI: ${mvrDui}

GEO & ELIGIBILITY:
- Geo-eligibility: ${geoStatus} (${distanceMiles} from market)
- License eligibility: ${licenseEligible}
- Readiness score: ${readinessScore}

RECRUITER NOTES:
${internalNotes.slice(0, 600)}

RULES-ENGINE RED FLAGS:
${redFlagSummary}

Score this applicant.`.trim();

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.15,
      max_tokens: 400,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const score = Math.min(100, Math.max(0, Math.round(Number(parsed.score))));
    const summary = String(parsed.summary || "").trim() || "No summary generated.";

    return {
      score,
      recommendation: buildRecommendation(score),
      summary,
    };
  } catch (err) {
    console.error("[PrescreenScoring] GPT call failed:", err);
    return null;
  }
}

/**
 * Main entry point. Scores the recruiting application and persists results.
 * Runs red-flag detection first, feeds flags into AI prompt, persists all together.
 * Designed to run fire-and-forget.
 */
export async function runPrescreenScoring(applicationId: string): Promise<void> {
  console.log(`[PrescreenScoring] Scoring recruiting application ${applicationId}`);
  try {
    const inputs = await fetchScoringInputs(applicationId);
    if (!inputs) {
      console.warn(`[PrescreenScoring] Recruiting application ${applicationId} not found`);
      return;
    }

    // ── Step 1: Run deterministic red-flag detection ──────────────────────────
    const redFlags = detectRedFlags({
      application: inputs.application as any,
      candidate: inputs.candidate as any,
      requisition: inputs.requisition as any,
    });
    const redFlagSummary = formatFlagsForPrompt(redFlags);
    console.log(`[PrescreenScoring] Detected ${redFlags.length} red flag(s) for ${applicationId}`);

    // ── Step 2: AI scoring with red flags injected ────────────────────────────
    const result = await scoreWithAI(inputs, redFlagSummary);
    if (!result) {
      // Still persist red flags even if AI scoring fails
      await db.update(recruitingApplications)
        .set({
          aiRedFlags: redFlags as any,
          aiRedFlagsDetectedAt: new Date(),
        } as any)
        .where(eq(recruitingApplications.id, applicationId));
      console.warn(`[PrescreenScoring] AI scoring returned null for ${applicationId}; red flags saved`);
      return;
    }

    // ── Step 3: Persist both scoring result and red flags ─────────────────────
    await db.update(recruitingApplications)
      .set({
        aiPrescreenScore: result.score,
        aiPrescreenRecommendation: result.recommendation,
        aiPrescreenSummary: result.summary,
        aiPrescreenGeneratedAt: new Date(),
        aiRedFlags: redFlags as any,
        aiRedFlagsDetectedAt: new Date(),
      } as any)
      .where(eq(recruitingApplications.id, applicationId));

    console.log(`[PrescreenScoring] Saved score=${result.score} rec=${result.recommendation} flags=${redFlags.length} for ${applicationId}`);
  } catch (err) {
    console.error(`[PrescreenScoring] Pipeline failed for ${applicationId}:`, err);
    // Non-blocking — do not rethrow
  }
}

/**
 * Re-runs only the red flag detection (no AI call) and persists.
 */
export async function runRedFlagDetection(applicationId: string): Promise<void> {
  console.log(`[RedFlags] Re-running detection for ${applicationId}`);
  try {
    const inputs = await fetchScoringInputs(applicationId);
    if (!inputs) {
      console.warn(`[RedFlags] Application ${applicationId} not found`);
      return;
    }

    const redFlags = detectRedFlags({
      application: inputs.application as any,
      candidate: inputs.candidate as any,
      requisition: inputs.requisition as any,
    });

    await db.update(recruitingApplications)
      .set({
        aiRedFlags: redFlags as any,
        aiRedFlagsDetectedAt: new Date(),
      } as any)
      .where(eq(recruitingApplications.id, applicationId));

    console.log(`[RedFlags] Saved ${redFlags.length} flag(s) for ${applicationId}`);
  } catch (err) {
    console.error(`[RedFlags] Detection failed for ${applicationId}:`, err);
  }
}
