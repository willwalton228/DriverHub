/**
 * Intro Media Analysis Service
 * Transcribes audio/video intros using OpenAI Whisper and generates
 * a structured AI summary for recruiter review.
 *
 * AI IS ADVISORY ONLY — no automated hiring decisions are made.
 */

import OpenAI, { toFile } from "openai";
import { db } from "../db";
import { applications } from "../../shared/schema";
import { eq } from "drizzle-orm";

function getOpenAI(): OpenAI {
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

export interface IntroAiSummary {
  drivingExperience: string;
  availability: string;
  confidenceClarity: string;
  redFlags: string;
  generatedAt: string;
  modelUsed: string;
}

/**
 * Transcribes the audio buffer using OpenAI Whisper.
 * Returns the plain-text transcript, or null on failure.
 */
async function transcribeAudio(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<string | null> {
  const openai = getOpenAI();
  try {
    const file = await toFile(buffer, filename, { type: mimeType });
    const response = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      response_format: "text",
    });
    // response is a string when response_format = "text"
    return typeof response === "string" ? response.trim() : null;
  } catch (err) {
    console.error("[IntroAnalysis] Whisper transcription failed:", err);
    return null;
  }
}

/**
 * Generates a structured recruiter summary from the transcript using GPT-4o.
 * Returns an IntroAiSummary object, or null on failure.
 */
async function generateSummary(transcript: string): Promise<IntroAiSummary | null> {
  const openai = getOpenAI();
  const systemPrompt = `You are an objective recruiting assistant helping a team screen driver candidates. 
Your role is STRICTLY advisory — you assist human recruiters in reviewing candidate-recorded introductions.
You DO NOT make hiring decisions. Your observations are non-decisional.

Analyze the candidate's spoken introduction transcript and return a JSON object with exactly these fields:
- drivingExperience: A concise factual summary of any driving experience the candidate mentioned (vehicle types, years, CDL, delivery, rideshare, etc.). If none mentioned, say "No driving experience discussed."
- availability: A factual summary of availability signals mentioned (full-time, part-time, shift preferences, start date, constraints). If none mentioned, say "No availability details discussed."
- confidenceClarity: A neutral, objective observation about the candidate's communication — clarity, pace, structure. Keep this descriptive, not evaluative.
- redFlags: Any factual observations about content that may warrant recruiter follow-up (e.g., contradictions, vague safety references, unclear timeline). If none, say "No notable observations." This is purely informational and non-decisional.

IMPORTANT RULES:
- Be factual and objective. Never recommend for or against hiring.
- Do not infer protected characteristics (race, age, gender, disability, etc.).
- Do not score or rank the candidate.
- Each field should be 1–3 sentences max.
- Respond ONLY with valid JSON. No markdown, no explanation.`;

  const userPrompt = `Candidate intro transcript:\n\n${transcript.slice(0, 4000)}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 600,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return {
      drivingExperience: parsed.drivingExperience || "Unable to analyze.",
      availability: parsed.availability || "Unable to analyze.",
      confidenceClarity: parsed.confidenceClarity || "Unable to analyze.",
      redFlags: parsed.redFlags || "No notable observations.",
      generatedAt: new Date().toISOString(),
      modelUsed: "gpt-4o",
    };
  } catch (err) {
    console.error("[IntroAnalysis] GPT summary generation failed:", err);
    return null;
  }
}

/**
 * Main entry point — transcribes media, generates AI summary, and persists
 * both to the application record. Designed to run fire-and-forget.
 */
export async function analyzeIntroMedia(
  applicationId: string,
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<void> {
  console.log(`[IntroAnalysis] Starting analysis for application ${applicationId}`);

  try {
    // Step 1: Transcribe
    const transcript = await transcribeAudio(buffer, filename, mimeType);
    if (!transcript) {
      console.warn(`[IntroAnalysis] Transcription returned null for ${applicationId}`);
      return;
    }

    console.log(`[IntroAnalysis] Transcription complete for ${applicationId} (${transcript.length} chars)`);

    // Step 2: AI summary
    const aiSummary = await generateSummary(transcript);

    // Step 3: Persist to DB
    const updatePayload: Record<string, unknown> = {
      introTranscript: transcript,
    };
    if (aiSummary) {
      updatePayload.introAiSummary = aiSummary;
    }

    await db.update(applications)
      .set(updatePayload as any)
      .where(eq(applications.id, applicationId));

    console.log(`[IntroAnalysis] Analysis saved for application ${applicationId}`);

    // Re-run pre-screen scoring now that we have richer transcript data
    import("./prescreenScoringService").then(({ runPrescreenScoring }) => {
      runPrescreenScoring(applicationId)
        .catch((e: unknown) => console.error("[IntroAnalysis] Pre-screen re-score error:", e));
    }).catch(() => {});
  } catch (err) {
    console.error(`[IntroAnalysis] Analysis pipeline failed for ${applicationId}:`, err);
    // Non-blocking — do not rethrow
  }
}
