/**
 * Heymarket Inbound Message Service
 *
 * Processes inbound SMS webhook payloads from Heymarket's `message.received` event.
 * Matches the sender phone number to a known driver record, then persists the message
 * in `communication_messages` (direction = 'inbound') and `communication_recipients`.
 */

import { pool, db } from "../db";
import { sql } from "drizzle-orm";
import { communicationMessages, communicationRecipients } from "../../shared/schema";

export interface HeymarketWebhookPayload {
  event?: string;                  // e.g. "message.received" or "message_received"
  timestamp?: string;
  data?: {
    id?: number | string;
    chatId?: number | string;
    body?: string;
    direction?: string;            // "incoming" | "outgoing" | "inbound" | "outbound"
    channel?: string;
    status?: string;
    createdAt?: string;
    from?: {
      phoneNumber?: string;
      name?: string;
      contactId?: number | string;
    };
    to?: {
      phoneNumber?: string;
      inboxId?: number | string;
    };
    media?: any[];
  };
  // Some Heymarket plan tiers send flat payloads
  body?: string;
  phone_number?: string;
  direction?: string;
  chat_url?: string;
}

export interface InboundResult {
  status: "accepted" | "ignored" | "failed";
  messageId?: string;
  driverId?: string;
  reason?: string;
}

/**
 * Normalise a phone number to E.164 (+1XXXXXXXXXX).
 * Heymarket sends numbers with or without the leading "+".
 */
function normalisePhone(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === "1") return `+${digits}`;
  if (digits.length >= 10) return `+${digits}`;
  return null;
}

/**
 * Look up a driver by their normalised mobile phone number.
 * Also checks wiw_users.phone as a fallback since Heymarket contacts
 * are sometimes created from WIW data.
 */
async function findDriverByPhone(normalised: string): Promise<{ driverId: string; driverName: string } | null> {
  // Primary: drivers.mobile_phone_normalized — join users for display name.
  // No status filter: SMS history is retained for ALL drivers regardless of employment
  // state (active, inactive, terminated, former IC, former employee). Threads are tied
  // to the driver record itself, not to their current employment status.
  const driverRes = await pool.query<{ id: string; first_name: string; last_name: string }>(
    `SELECT d.id, u.first_name, u.last_name
     FROM drivers d
     LEFT JOIN users u ON u.id = d.user_id
     WHERE d.mobile_phone_normalized = $1
     LIMIT 1`,
    [normalised]
  );
  if (driverRes.rows.length > 0) {
    const d = driverRes.rows[0];
    return { driverId: d.id, driverName: `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim() || "Driver" };
  }

  // Fallback: wiw_users.phone (normalised within WIW sync)
  const wiwRes = await pool.query<{ driver_id: string; name: string }>(
    `SELECT wu.driver_id, wu.name
     FROM wiw_users wu
     WHERE wu.phone = $1
       AND wu.driver_id IS NOT NULL
     LIMIT 1`,
    [normalised]
  );
  if (wiwRes.rows.length > 0) {
    const w = wiwRes.rows[0];
    return { driverId: w.driver_id, driverName: w.name ?? "Driver" };
  }

  return null;
}

/**
 * Main entry point — called by the webhook handler.
 * Idempotent: the provider_message_id unique-check prevents duplicate inserts.
 */
export async function processInboundMessage(payload: HeymarketWebhookPayload): Promise<InboundResult> {
  try {
    // ── 1. Determine event type ───────────────────────────────────────────
    const event = (payload.event ?? "").toLowerCase().replace(/[._-]/g, "");
    const isInboundEvent = event.includes("messagereceived") || event.includes("inbound");

    // ── 2. Extract fields (nested "data" or flat payload) ─────────────────
    const data = payload.data ?? {};
    const rawBody      = data.body      ?? payload.body      ?? "";
    const rawPhone     = data.from?.phoneNumber ?? payload.phone_number ?? "";
    const rawDirection = data.direction ?? payload.direction ?? "";
    const providerMsgId = data.id != null ? String(data.id) : null;
    const heymarketChatId = data.chatId != null ? String(data.chatId) : null;
    const inboxId = data.to?.inboxId != null ? String(data.to.inboxId) : null;
    const receivedAt = data.createdAt ?? payload.timestamp ?? new Date().toISOString();
    const senderName  = data.from?.name ?? "Driver";

    // ── 3. Only act on inbound messages ───────────────────────────────────
    const dirLower = rawDirection.toLowerCase();
    const isInbound = isInboundEvent
      || dirLower === "inbound"
      || dirLower === "incoming"
      || dirLower === "received";

    if (!isInbound) {
      console.log(`[Heymarket Inbound] Ignoring outbound/other event: ${payload.event} direction="${rawDirection}"`);
      return { status: "ignored", reason: `Not an inbound message (direction="${rawDirection}", event="${payload.event}")` };
    }

    if (!rawBody.trim()) {
      return { status: "ignored", reason: "Empty message body" };
    }

    // ── 4. Idempotency guard — check if already stored ────────────────────
    if (providerMsgId) {
      const existing = await pool.query(
        `SELECT id FROM communication_messages WHERE provider_message_id = $1 AND direction = 'inbound' LIMIT 1`,
        [providerMsgId]
      );
      if (existing.rows.length > 0) {
        console.log(`[Heymarket Inbound] Already processed message id=${providerMsgId}`);
        return { status: "accepted", messageId: existing.rows[0].id, reason: "duplicate — already stored" };
      }
    }

    // ── 5. Normalise and match phone to driver ────────────────────────────
    const normalisedPhone = normalisePhone(rawPhone);
    let driverId: string | null = null;
    let driverName = senderName;

    if (normalisedPhone) {
      const match = await findDriverByPhone(normalisedPhone);
      if (match) {
        driverId   = match.driverId;
        driverName = match.driverName;
      } else {
        console.warn(`[Heymarket Inbound] No driver match for phone ${normalisedPhone}`);
      }
    }

    // ── 6. Persist to communication_messages ──────────────────────────────
    const [inserted] = await db.insert(communicationMessages).values({
      channel:           "sms",
      provider:          "heymarket",
      direction:         "inbound",
      status:            "received",
      fromIdentity:      normalisedPhone ?? rawPhone,
      body:              rawBody.trim(),
      relatedModule:     "driver_inbound_sms",
      relatedEntityType: driverId ? "driver" : null,
      relatedEntityId:   driverId ?? null,
      providerMessageId: providerMsgId,
      providerRawResponse: payload as any,
      sentAt:            new Date(receivedAt),
      createdAt:         new Date(),
      updatedAt:         new Date(),
    }).returning({ id: communicationMessages.id });

    const messageId = inserted.id;

    // ── 7. Persist to communication_recipients ────────────────────────────
    await db.insert(communicationRecipients).values({
      communicationMessageId: messageId,
      recipientType:          driverId ? "driver" : "unknown",
      recipientId:            driverId ?? null,
      destinationRaw:         rawPhone,
      destinationNormalized:  normalisedPhone ?? rawPhone,
      deliveryStatus:         "received",
      providerMessageId:      providerMsgId,
      deliveredAt:            new Date(receivedAt),
      createdAt:              new Date(),
    });

    console.log(
      `[Heymarket Inbound] Stored message id=${messageId} ` +
      `driver=${driverId ?? "unmatched"} phone=${normalisedPhone} chatId=${heymarketChatId}`
    );

    // ── 8. Weekend Monday Reminder response processor (fire-and-forget) ──────
    if (driverId) {
      import("./weekendMondayResponseProcessor").then(({ processReminderResponse }) => {
        processReminderResponse(driverId!, messageId, rawBody.trim()).catch(err => {
          console.error("[Heymarket Inbound] Response processor error:", err?.message);
        });
      }).catch(() => { /* import errors must not affect delivery */ });
    }

    return { status: "accepted", messageId, driverId: driverId ?? undefined };
  } catch (err: any) {
    console.error("[Heymarket Inbound] Processing error:", err);
    return { status: "failed", reason: err.message };
  }
}
