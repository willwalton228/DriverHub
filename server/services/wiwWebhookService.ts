/**
 * WIW Webhook Service
 *
 * Handles inbound webhook events from When I Work:
 *   1. Validate HMAC signature (if webhook_secret configured)
 *   2. Log raw payload to wiw_webhook_events
 *   3. Process event → update canonical tables via narrow incremental sync
 *   4. Retry/replay support for failed events
 *
 * WIW webhook event types (subset):
 *   shift.created | shift.updated | shift.deleted
 *   time.created  | time.updated  | time.deleted
 *   user.created  | user.updated
 *   request.created | request.updated   (absences)
 *   attendance.created | attendance.updated (notices)
 *
 * Signature: WIW sends X-WIW-Signature header = HMAC-SHA256(raw body, webhook_secret)
 */

import crypto from "crypto";
import { pool } from "../db";
import { runEntitySync } from "./wiwSyncService";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface IngestResult {
  eventId: string;
  signatureValid: boolean | null;
  status: "processed" | "failed" | "skipped";
  error?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getWebhookSecret(): Promise<string | null> {
  const res = await pool.query(
    `SELECT webhook_secret FROM wiw_api_config LIMIT 1`
  );
  return res.rows[0]?.webhook_secret ?? null;
}

function verifySignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): boolean {
  try {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("hex");
    // Support both bare hex and "sha256=<hex>" prefixed formats
    const received = signatureHeader.startsWith("sha256=")
      ? signatureHeader.slice(7)
      : signatureHeader;
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(received, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Derive which sync entity to trigger based on the WIW event type prefix.
 * Returns null for event types we don't need to act on.
 */
function eventTypeToEntity(
  eventType: string
): "shifts" | "times" | "absences" | "notices" | "users" | null {
  const t = eventType.toLowerCase();
  if (t.startsWith("shift"))      return "shifts";
  if (t.startsWith("time"))       return "times";
  if (t.startsWith("request"))    return "absences";
  if (t.startsWith("attendance")) return "notices";
  if (t.startsWith("user"))       return "users";
  return null;
}

/** Log the event to wiw_webhook_events and return its id. */
async function logEvent(
  eventType: string,
  externalEntityId: string | null,
  payload: object,
  signatureHeader: string | null,
  signatureValid: boolean | null
): Promise<string> {
  const res = await pool.query(
    `INSERT INTO wiw_webhook_events
       (event_type, external_entity_id, payload, signature_header, signature_valid, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING id`,
    [eventType, externalEntityId, JSON.stringify(payload), signatureHeader, signatureValid]
  );
  return res.rows[0].id as string;
}

async function markEventProcessed(eventId: string): Promise<void> {
  await pool.query(
    `UPDATE wiw_webhook_events
     SET status = 'processed', processed_at = now(), updated_at = now()
     WHERE id = $1`,
    [eventId]
  );
}

async function markEventFailed(eventId: string, error: string): Promise<void> {
  await pool.query(
    `UPDATE wiw_webhook_events
     SET status = 'failed', last_error = $2, retry_count = retry_count + 1, updated_at = now()
     WHERE id = $1`,
    [eventId, error]
  );
}

async function markEventSkipped(eventId: string, reason: string): Promise<void> {
  await pool.query(
    `UPDATE wiw_webhook_events
     SET status = 'skipped', last_error = $2, processed_at = now(), updated_at = now()
     WHERE id = $1`,
    [eventId, reason]
  );
}

// ── Core processing ────────────────────────────────────────────────────────────

/**
 * Process a single event: run a narrow incremental sync (last 2 hours) for the
 * affected entity. This ensures the webhook acts as a near-real-time trigger
 * while the scheduled sync serves as the reconciliation backstop.
 */
async function processEvent(
  eventId: string,
  eventType: string,
  _payload: object
): Promise<void> {
  const entity = eventTypeToEntity(eventType);
  if (!entity) {
    await markEventSkipped(eventId, `Unhandled event type: ${eventType}`);
    return;
  }

  // Narrow window: last 2 hours to pick up the change without a full pull
  const updatedSince = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  await runEntitySync(entity, "webhook_backfill", { updatedSince });
  // Note: runEntitySync already triggers attendance record/metrics
  // rederivation for affected drivers as a fire-and-forget hook.
  await markEventProcessed(eventId);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Main entry point — called by the webhook POST route.
 * rawBody must be the unparsed request body string for signature verification.
 */
export async function ingestWebhook(
  rawBody: string,
  parsedPayload: Record<string, any>,
  signatureHeader: string | null
): Promise<IngestResult> {
  // 1. Validate signature if secret is configured
  const secret = await getWebhookSecret();
  let signatureValid: boolean | null = null;
  if (secret && signatureHeader) {
    signatureValid = verifySignature(rawBody, signatureHeader, secret);
    if (!signatureValid) {
      // Log the rejected event but refuse processing
      const eventId = await logEvent(
        parsedPayload.action ?? parsedPayload.event ?? "unknown",
        String(parsedPayload.id ?? parsedPayload.shift?.id ?? parsedPayload.user?.id ?? ""),
        parsedPayload,
        signatureHeader,
        false
      );
      await markEventFailed(eventId, "HMAC signature verification failed");
      return { eventId, signatureValid: false, status: "failed", error: "Invalid signature" };
    }
  } else if (secret && !signatureHeader) {
    // Secret configured but no header sent — reject
    const eventId = await logEvent("unknown", null, parsedPayload, null, false);
    await markEventFailed(eventId, "Webhook secret configured but no X-WIW-Signature header received");
    return { eventId, signatureValid: false, status: "failed", error: "Missing signature header" };
  }

  // 2. Determine event type from payload
  const eventType: string =
    parsedPayload.action ??
    parsedPayload.event ??
    parsedPayload.type ??
    "unknown";

  const externalEntityId: string | null =
    String(
      parsedPayload.id ??
      parsedPayload.shift?.id ??
      parsedPayload.user?.id ??
      parsedPayload.time?.id ??
      ""
    ) || null;

  // 3. Log raw event
  const eventId = await logEvent(
    eventType,
    externalEntityId,
    parsedPayload,
    signatureHeader,
    signatureValid
  );

  // 4. Process immediately
  try {
    await processEvent(eventId, eventType, parsedPayload);
    return { eventId, signatureValid, status: "processed" };
  } catch (err: any) {
    const errMsg = err?.message ?? "Processing failed";
    await markEventFailed(eventId, errMsg);
    return { eventId, signatureValid, status: "failed", error: errMsg };
  }
}

/**
 * Retry a single failed/pending webhook event by its id.
 */
export async function retryWebhookEvent(eventId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await pool.query(
    `SELECT event_type, payload FROM wiw_webhook_events WHERE id = $1`,
    [eventId]
  );
  if (!res.rows[0]) return { ok: false, error: "Event not found" };

  const { event_type, payload } = res.rows[0];
  // Reset to pending before retry
  await pool.query(
    `UPDATE wiw_webhook_events SET status = 'pending', updated_at = now() WHERE id = $1`,
    [eventId]
  );

  try {
    await processEvent(eventId, event_type, payload);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message };
  }
}

/**
 * Scheduled batch retry for failed events.
 * Retries up to maxAttempts (default 5) times; skips permanently after that.
 */
export async function retryFailedEvents(maxAttempts = 5): Promise<void> {
  const res = await pool.query(
    `SELECT id, event_type, payload FROM wiw_webhook_events
     WHERE status = 'failed' AND retry_count < $1
     ORDER BY received_at ASC
     LIMIT 50`,
    [maxAttempts]
  );

  for (const row of res.rows) {
    try {
      await pool.query(
        `UPDATE wiw_webhook_events SET status = 'pending', updated_at = now() WHERE id = $1`,
        [row.id]
      );
      await processEvent(row.id, row.event_type, row.payload);
    } catch {
      // markEventFailed already called inside processEvent on error; continue
    }
  }

  // Permanently skip events that have exceeded maxAttempts
  await pool.query(
    `UPDATE wiw_webhook_events
     SET status = 'skipped', last_error = 'Max retry attempts exceeded', updated_at = now()
     WHERE status = 'failed' AND retry_count >= $1`,
    [maxAttempts]
  );
}

/**
 * List recent webhook events for the UI (paginated).
 */
export async function listWebhookEvents(opts: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ events: any[]; total: number }> {
  const conditions: string[] = [];
  const params: any[] = [];

  if (opts.status) {
    params.push(opts.status);
    conditions.push(`status = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const [dataRes, countRes] = await Promise.all([
    pool.query(
      `SELECT id, event_type, external_entity_id, received_at, status,
              processed_at, retry_count, last_error, signature_valid
       FROM wiw_webhook_events
       ${where}
       ORDER BY received_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    ),
    pool.query(
      `SELECT count(*)::int AS total FROM wiw_webhook_events ${where}`,
      params
    ),
  ]);

  return { events: dataRes.rows, total: countRes.rows[0]?.total ?? 0 };
}
