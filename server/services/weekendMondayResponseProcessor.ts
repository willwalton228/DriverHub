/**
 * Weekend Monday Reminder — Inbound Response Processor (DH-002053)
 *
 * Called after the Heymarket inbound webhook stores an inbound SMS for a known driver.
 * Performs:
 *   1. Checks if this driver has a recent weekend-Monday-reminder comm (within 5 days).
 *   2. AI-classifies the response via OpenAI.
 *   3. Writes a Driver Note.
 *   4. If classified as "Unavailable", creates a needs_coverage record for each
 *      pending Monday shift.
 *   5. Updates the weekend_monday_comms record with response + classification.
 */

import { pool, db } from "../db";
import { weekendMondayComms, needsCoverage } from "../../shared/schema";
import { eq, and, gte, isNull } from "drizzle-orm";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey:  process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export type ResponseClassification =
  | "Available/Confirmed"
  | "Unavailable"
  | "Running Late"
  | "Question"
  | "General Response"
  | "Other";

// ── AI classifier ──────────────────────────────────────────────────────────────

async function classifyResponse(messageText: string): Promise<{
  classification: ResponseClassification;
  confidence:     number;
}> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You classify driver SMS responses to Monday shift reminders into one of these categories:
- "Available/Confirmed": driver confirms they will be there
- "Unavailable": driver says they cannot make the shift, are sick, or will not show
- "Running Late": driver indicates they will be late but will still come
- "Question": driver is asking a question about their schedule or the process
- "General Response": acknowledgement or other non-specific reply
- "Other": anything that doesn't fit above

Respond ONLY with JSON in this exact format:
{"classification": "<one of the categories above>", "confidence": <0.0 to 1.0>}`,
        },
        { role: "user", content: messageText },
      ],
      max_tokens: 80,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const classification = parsed.classification as ResponseClassification ?? "Other";
    const confidence     = Math.min(1, Math.max(0, Number(parsed.confidence ?? 0.5)));
    return { classification, confidence };
  } catch (err: any) {
    console.error("[ResponseProcessor] AI classification failed:", err?.message);
    return { classification: "Other", confidence: 0 };
  }
}

// ── Driver note writer ─────────────────────────────────────────────────────────

async function writeDriverNote(driverId: string, messageText: string, classification: ResponseClassification): Promise<string | null> {
  try {
    const noteText = `[Weekend Monday Reminder Response]\nClassification: ${classification}\n\nMessage:\n${messageText}`;
    const result = await pool.query<{ id: string }>(`
      INSERT INTO driver_notes (driver_id, note_text, note_type, author_name, created_at, updated_at)
      VALUES ($1, $2, 'Driver Comments', 'DriverHub Automation', NOW(), NOW())
      RETURNING id
    `, [driverId, noteText]);
    return result.rows[0]?.id ?? null;
  } catch (err: any) {
    console.error("[ResponseProcessor] Failed to write driver note:", err?.message);
    return null;
  }
}

// ── Needs Coverage creator ─────────────────────────────────────────────────────

async function createNeedsCoverageRecords(
  driverId:     string,
  commRecords:  Array<{ id: string; shift_id: string | null; assignment_id: string | null; schedule_id: string | null; account_name: string | null; start_time: Date | null; end_time: Date | null; shift_date: Date | null; driver_name: string | null; driver_classification: string | null }>,
  reason:       string,
): Promise<void> {
  for (const comm of commRecords) {
    await db.insert(needsCoverage).values({
      shiftId:              comm.shift_id ?? undefined,
      assignmentId:         comm.assignment_id ?? undefined,
      scheduleId:           comm.schedule_id ?? undefined,
      driverId,
      driverName:           comm.driver_name ?? undefined,
      driverClassification: comm.driver_classification ?? undefined,
      shiftDate:            comm.shift_date ? new Date(comm.shift_date) : undefined,
      startTime:            comm.start_time ? new Date(comm.start_time) : undefined,
      endTime:              comm.end_time   ? new Date(comm.end_time)   : undefined,
      accountName:          comm.account_name ?? undefined,
      reason,
      reportedBy:           "AI",
      dateFlagged:          new Date(),
      status:               "open",
      sourceType:           "weekend_monday_reminder",
      sourceCommId:         comm.id,
    } as any);
    console.log(`[ResponseProcessor] Created needs_coverage for shift=${comm.shift_id} driver=${driverId}`);
  }
}

function expandCommunicationShifts(
  commRecords: Array<{
    id: string; shift_id: string | null; assignment_id: string | null; schedule_id: string | null;
    account_name: string | null; start_time: Date | null; end_time: Date | null;
    shift_date: Date | null; driver_name: string | null; driver_classification: string | null;
    schedule_details?: unknown;
  }>,
) {
  return commRecords.flatMap((comm) => {
    const details = Array.isArray(comm.schedule_details) ? comm.schedule_details : [];
    if (!details.length) return [comm];
    return details.map((detail: any) => ({
      ...comm,
      shift_id: detail.shiftId ?? null,
      assignment_id: detail.assignmentId ?? null,
      schedule_id: detail.scheduleId ?? null,
      account_name: detail.accountName ?? null,
      start_time: detail.startTime ? new Date(detail.startTime) : null,
      end_time: detail.endTime ? new Date(detail.endTime) : null,
    }));
  });
}

// ── Notify dispatch (driver note on a sentinel driver record or system log) ────

async function notifyDispatch(driverId: string, driverName: string, shiftsAffected: number): Promise<void> {
  // Log a structured event that dispatch can see via the communication timeline.
  // In a future iteration this could trigger a push notification via the notification engine.
  console.log(JSON.stringify({
    event:          "needs_coverage_created",
    driverId,
    driverName,
    shiftsAffected,
    trigger:        "weekend_monday_reminder_response",
    ts:             new Date().toISOString(),
  }));
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function processReminderResponse(
  driverId:  string,
  messageId: string,
  rawBody:   string,
): Promise<void> {
  try {
    // 1. Look for recent weekend_monday_comms for this driver (within 5 days)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 5);

    const commsResult = await pool.query<{
      id: string; shift_id: string | null; assignment_id: string | null; schedule_id: string | null;
      account_name: string | null; start_time: Date | null; end_time: Date | null;
      shift_date: Date | null; driver_name: string | null; driver_classification: string | null;
      schedule_details: unknown;
    }>(`
       SELECT id, shift_id, assignment_id, schedule_id, account_name, schedule_details,
             start_time, end_time, shift_date, driver_name, driver_classification
      FROM weekend_monday_comms
      WHERE driver_id  = $1
        AND created_at >= $2
        AND response_received = FALSE
      ORDER BY created_at DESC
    `, [driverId, cutoff.toISOString()]);

    if (commsResult.rows.length === 0) {
      // Not a reminder response — nothing to do
      return;
    }

    // 2. AI classify
    const { classification, confidence } = await classifyResponse(rawBody);
    console.log(`[ResponseProcessor] driver=${driverId} classification="${classification}" confidence=${confidence}`);

    // 3. Write Driver Note
    const noteId = await writeDriverNote(driverId, rawBody, classification);

    // 4. Update weekend_monday_comms rows with response + classification
    await pool.query(`
      UPDATE weekend_monday_comms
      SET response_received  = TRUE,
          response_at        = NOW(),
          response_text      = $1,
          response_source    = 'sms',
          ai_classification  = $2,
          ai_confidence      = $3,
          ai_processed_at    = NOW(),
          driver_note_id     = $4,
          updated_at         = NOW()
      WHERE driver_id = $5
        AND created_at >= $6
        AND response_received = FALSE
    `, [rawBody, classification, confidence, noteId, driverId, cutoff.toISOString()]);

    // 5. If unavailable → create needs_coverage + notify dispatch
    if (classification === "Unavailable") {
      const driverName = commsResult.rows[0]?.driver_name ?? driverId;
      const affectedShifts = expandCommunicationShifts(commsResult.rows);
      await createNeedsCoverageRecords(driverId, affectedShifts, rawBody);
      await notifyDispatch(driverId, driverName, affectedShifts.length);
    }
  } catch (err: any) {
    console.error("[ResponseProcessor] Unhandled error:", err?.message);
  }
}
