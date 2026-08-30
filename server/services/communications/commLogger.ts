/**
 * Core Communications Framework — Communication Logger
 * Ticket 3: Communication Logging Hooks and Message Audit Layer
 *
 * This module is the canonical data-layer for all writes to
 * communication_messages and communication_recipients.
 *
 * Every code path that needs to persist a communication event — the
 * CommunicationOrchestrator, future bulk-send services, import hooks, external
 * integration adapters — must go through these functions.
 *
 * Rule: ALL recipients must be passed through validateRecipients() before
 * createCommunicationRecipients() is called. This ensures every row written to
 * the DB has a known, intentional initial state — never silently invalid data.
 *
 * Do NOT duplicate INSERT/UPDATE SQL for these tables elsewhere.
 */

import { pool } from "../../db";
import type {
  CommChannel,
  CommProvider,
  CommDirection,
  CommStatus,
  CommDeliveryStatus,
  CommRecipientType,
  CommRecipientInput,
} from "./types";
import { COMM_RECIPIENT_TYPES } from "./types";

// ── Recipient validation ───────────────────────────────────────────────────────

/**
 * The result of validating a single recipient.
 *
 * valid === true  → row will be created as pending, ready for dispatch
 * valid === false → row will be created as excluded with exclusionReason set
 */
export interface ValidatedRecipient {
  input:            CommRecipientInput;
  valid:            boolean;
  exclusionReason?: string;   // populated only when valid === false
}

/**
 * Validate a list of CommRecipientInputs against the rules for the given channel.
 *
 * This is a pure, synchronous function — no DB access.
 * It MUST be called before createCommunicationRecipients().
 *
 * Per-recipient exclusion reasons:
 *   invalid_recipient_type  — recipientType not in the known set
 *   missing_destination     — no phone/email supplied at all
 *   phone_not_normalized    — SMS recipient has raw phone but no E.164 normalized form
 *   invalid_e164_format     — normalized phone present but fails E.164 regex
 *   invalid_email_format    — email address fails basic format check
 */
export function validateRecipients(
  channel:    CommChannel,
  recipients: CommRecipientInput[],
): ValidatedRecipient[] {
  return recipients.map(r => {
    // ── Type check ─────────────────────────────────────────────────────────
    if (!COMM_RECIPIENT_TYPES.includes(r.recipientType as any)) {
      return { input: r, valid: false, exclusionReason: "invalid_recipient_type" };
    }

    // ── Destination presence ────────────────────────────────────────────────
    const hasRaw        = !!r.destinationRaw?.trim();
    const hasNormalized = !!r.destinationNormalized?.trim();

    if (!hasRaw && !hasNormalized) {
      return { input: r, valid: false, exclusionReason: "missing_destination" };
    }

    // ── Channel-specific rules ──────────────────────────────────────────────
    if (channel === "sms") {
      if (!hasNormalized) {
        // Raw phone present but not yet normalized — cannot safely dispatch
        return { input: r, valid: false, exclusionReason: "phone_not_normalized" };
      }
      const e164 = r.destinationNormalized!.trim();
      if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
        return { input: r, valid: false, exclusionReason: "invalid_e164_format" };
      }
    }

    if (channel === "email") {
      const addr = (r.destinationNormalized ?? r.destinationRaw ?? "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
        return { input: r, valid: false, exclusionReason: "invalid_email_format" };
      }
    }

    return { input: r, valid: true };
  });
}

// ── Input / param types ───────────────────────────────────────────────────────

export interface CreateCommLogParams {
  channel:            CommChannel;
  provider?:          CommProvider;
  direction?:         CommDirection;    // defaults to "outbound"
  status?:            CommStatus;       // defaults to "draft"
  fromIdentity?:      string;
  subject?:           string;           // email only
  templateSlug?:      string;
  body:               string;

  // Context linkage
  relatedModule?:     string;
  relatedEntityType?: string;
  relatedEntityId?:   string;
  createdByUserId?:   string;
}

export interface UpdateCommMessageStatusParams {
  status:                CommStatus;
  providerMessageId?:    string | null;
  providerRawResponse?:  unknown;
  errorMessage?:         string | null;
}

export interface UpdateRecipientStatusParams {
  recipientRowId:       string;
  deliveryStatus:       CommDeliveryStatus;
  providerMessageId?:   string;
  errorMessage?:        string;
}

export interface MarkRecipientsExcludedParams {
  /** Exclude all recipients belonging to this message. */
  messageId?:       string;
  /** Exclude only these specific recipient row IDs. */
  recipientRowIds?: string[];
  reason:           string;
}

// ── Row types returned by reads ───────────────────────────────────────────────

export interface CommMessageRow {
  id:                   string;
  channel:              CommChannel;
  provider:             CommProvider | null;
  direction:            CommDirection;
  status:               CommStatus;
  fromIdentity:         string | null;
  subject:              string | null;
  templateSlug:         string | null;
  body:                 string;
  relatedModule:        string | null;
  relatedEntityType:    string | null;
  relatedEntityId:      string | null;
  createdByUserId:      string | null;
  sentAt:               Date | null;
  providerMessageId:    string | null;
  providerRawResponse:  unknown;
  errorMessage:         string | null;
  createdAt:            Date;
  updatedAt:            Date;
}

export interface CommRecipientRow {
  id:                     string;
  communicationMessageId: string;
  recipientType:          CommRecipientType;
  recipientId:            string | null;
  destinationRaw:         string | null;
  destinationNormalized:  string | null;
  deliveryStatus:         CommDeliveryStatus;
  excluded:               boolean;
  excludedReason:         string | null;
  providerMessageId:      string | null;
  deliveredAt:            Date | null;
  failedAt:               Date | null;
  errorMessage:           string | null;
  createdAt:              Date;
}

// ── Core write functions ───────────────────────────────────────────────────────

/**
 * Create a communication_messages record and return its ID.
 *
 * Default status is "draft" — callers that are about to dispatch immediately
 * should pass status "queued".
 */
export async function createCommunicationLog(
  params: CreateCommLogParams,
): Promise<string> {
  const res = await pool.query(
    `INSERT INTO communication_messages
       (channel, provider, direction, status, from_identity, subject, template_slug, body,
        related_module, related_entity_type, related_entity_id,
        created_by_user_id, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),now())
     RETURNING id`,
    [
      params.channel,
      params.provider           ?? null,
      params.direction          ?? "outbound",
      params.status             ?? "draft",
      params.fromIdentity       ?? null,
      params.subject            ?? null,
      params.templateSlug       ?? null,
      params.body,
      params.relatedModule      ?? null,
      params.relatedEntityType  ?? null,
      params.relatedEntityId    ?? null,
      params.createdByUserId    ?? null,
    ],
  );
  return res.rows[0].id as string;
}

/**
 * Create communication_recipients rows from pre-validated recipients.
 *
 * REQUIREMENT: recipients MUST have passed through validateRecipients() first.
 *
 * Row initial state is determined by the validation result:
 *   valid === true  → delivery_status = "pending", excluded = false
 *   valid === false → delivery_status = "excluded", excluded = true,
 *                     excluded_reason = validatedRecipient.exclusionReason
 *
 * Returns the newly created row IDs in the same order as the input array.
 */
export async function createCommunicationRecipients(
  messageId:  string,
  recipients: ValidatedRecipient[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const vr of recipients) {
    const deliveryStatus  = vr.valid ? "pending" : "excluded";
    const excluded        = !vr.valid;
    const excludedReason  = vr.valid ? null : (vr.exclusionReason ?? "unknown");

    const res = await pool.query(
      `INSERT INTO communication_recipients
         (communication_message_id, recipient_type, recipient_id,
          destination_raw, destination_normalized, delivery_status,
          excluded, excluded_reason, created_at)
       VALUES ($1,$2,$3,$4,$5,$6::varchar,$7,$8,now())
       RETURNING id`,
      [
        messageId,
        vr.input.recipientType,
        vr.input.recipientId            ?? null,
        vr.input.destinationRaw         ?? null,
        vr.input.destinationNormalized  ?? null,
        deliveryStatus,
        excluded,
        excludedReason,
      ],
    );
    ids.push(res.rows[0].id as string);
  }
  return ids;
}

/**
 * Update the status of a communication_messages record.
 *
 * - Sets sent_at automatically when status transitions to "sent" or "partial".
 * - provider_message_id and provider_raw_response are only overwritten when
 *   a non-null value is supplied (COALESCE semantics preserve existing data).
 * - error_message is always overwritten (null clears a prior error).
 */
export async function updateCommunicationMessageStatus(
  messageId: string,
  params:    UpdateCommMessageStatusParams,
): Promise<void> {
  await pool.query(
    `UPDATE communication_messages
        SET status                = $1::varchar,
            sent_at               = CASE WHEN $1::varchar = 'sent' OR $1::varchar = 'partial' THEN now() ELSE sent_at END,
            provider_message_id   = COALESCE($2, provider_message_id),
            provider_raw_response = COALESCE($3::jsonb, provider_raw_response),
            error_message         = $4,
            updated_at            = now()
      WHERE id = $5`,
    [
      params.status,
      params.providerMessageId   ?? null,
      params.providerRawResponse
        ? JSON.stringify(params.providerRawResponse)
        : null,
      params.errorMessage        ?? null,
      messageId,
    ],
  );
}

/**
 * Bulk-update delivery status on specific recipient rows by their row IDs.
 *
 * - Sets delivered_at when status is "sent".
 * - Sets failed_at when status is "failed".
 * - Preserves existing provider_message_id when none is supplied.
 */
export async function updateRecipientStatuses(
  updates: UpdateRecipientStatusParams[],
): Promise<void> {
  for (const u of updates) {
    await pool.query(
      `UPDATE communication_recipients
          SET delivery_status     = $1::varchar,
              provider_message_id = COALESCE($2, provider_message_id),
              error_message       = $3,
              delivered_at        = CASE WHEN $1::varchar = 'sent'   THEN now() ELSE delivered_at END,
              failed_at           = CASE WHEN $1::varchar = 'failed' THEN now() ELSE failed_at   END
        WHERE id = $4`,
      [
        u.deliveryStatus,
        u.providerMessageId ?? null,
        u.errorMessage      ?? null,
        u.recipientRowId,
      ],
    );
  }
}

/**
 * Mark communication_recipients rows as excluded with a reason.
 *
 * Accepts either:
 *   - messageId only      → excludes ALL recipients for that message
 *   - recipientRowIds only → excludes those specific rows regardless of message
 *   - both                → excludes the specific rows scoped to that message
 *
 * At least one of messageId or recipientRowIds must be supplied.
 *
 * NOTE: rows created via createCommunicationRecipients() for excluded recipients
 * already start with excluded = true. This function is for post-creation exclusions
 * (e.g., provider_not_configured, validation_failed at the provider level).
 */
export async function markRecipientsExcluded(
  params: MarkRecipientsExcludedParams,
): Promise<void> {
  const { messageId, recipientRowIds, reason } = params;

  if (!messageId && (!recipientRowIds || recipientRowIds.length === 0)) {
    throw new Error(
      "markRecipientsExcluded: supply at least one of messageId or recipientRowIds",
    );
  }

  if (messageId && recipientRowIds?.length) {
    await pool.query(
      `UPDATE communication_recipients
          SET excluded = true, excluded_reason = $1, delivery_status = 'excluded'
        WHERE communication_message_id = $2
          AND id = ANY($3::text[])`,
      [reason, messageId, recipientRowIds],
    );
    return;
  }

  if (messageId) {
    await pool.query(
      `UPDATE communication_recipients
          SET excluded = true, excluded_reason = $1, delivery_status = 'excluded'
        WHERE communication_message_id = $2`,
      [reason, messageId],
    );
    return;
  }

  await pool.query(
    `UPDATE communication_recipients
        SET excluded = true, excluded_reason = $1, delivery_status = 'excluded'
      WHERE id = ANY($2::text[])`,
    [reason, recipientRowIds!],
  );
}

// ── Read helpers ──────────────────────────────────────────────────────────────

/**
 * Fetch a single communication_messages row by ID.
 * Returns null if not found.
 */
export async function getCommunicationMessage(
  messageId: string,
): Promise<CommMessageRow | null> {
  const res = await pool.query(
    `SELECT id, channel, provider, direction, status, from_identity,
            subject, template_slug, body, related_module, related_entity_type, related_entity_id,
            created_by_user_id, sent_at, provider_message_id, provider_raw_response,
            error_message, created_at, updated_at
       FROM communication_messages
      WHERE id = $1`,
    [messageId],
  );
  if (!res.rows.length) return null;
  return mapMessageRow(res.rows[0]);
}

/**
 * Fetch all communication_recipients rows for a message, ordered by created_at.
 */
export async function getCommunicationRecipients(
  messageId: string,
): Promise<CommRecipientRow[]> {
  const res = await pool.query(
    `SELECT id, communication_message_id, recipient_type, recipient_id,
            destination_raw, destination_normalized, delivery_status,
            excluded, excluded_reason, provider_message_id,
            delivered_at, failed_at, error_message, created_at
       FROM communication_recipients
      WHERE communication_message_id = $1
      ORDER BY created_at`,
    [messageId],
  );
  return res.rows.map(mapRecipientRow);
}

// ── Private mappers ───────────────────────────────────────────────────────────

function mapMessageRow(r: Record<string, unknown>): CommMessageRow {
  return {
    id:                  r.id as string,
    channel:             r.channel as CommChannel,
    provider:            r.provider as CommProvider | null,
    direction:           r.direction as CommDirection,
    status:              r.status as CommStatus,
    fromIdentity:        r.from_identity as string | null,
    subject:             r.subject as string | null,
    templateSlug:        r.template_slug as string | null,
    body:                r.body as string,
    relatedModule:       r.related_module as string | null,
    relatedEntityType:   r.related_entity_type as string | null,
    relatedEntityId:     r.related_entity_id as string | null,
    createdByUserId:     r.created_by_user_id as string | null,
    sentAt:              r.sent_at as Date | null,
    providerMessageId:   r.provider_message_id as string | null,
    providerRawResponse: r.provider_raw_response,
    errorMessage:        r.error_message as string | null,
    createdAt:           r.created_at as Date,
    updatedAt:           r.updated_at as Date,
  };
}

function mapRecipientRow(r: Record<string, unknown>): CommRecipientRow {
  return {
    id:                     r.id as string,
    communicationMessageId: r.communication_message_id as string,
    recipientType:          r.recipient_type as CommRecipientType,
    recipientId:            r.recipient_id as string | null,
    destinationRaw:         r.destination_raw as string | null,
    destinationNormalized:  r.destination_normalized as string | null,
    deliveryStatus:         r.delivery_status as CommDeliveryStatus,
    excluded:               r.excluded as boolean,
    excludedReason:         r.excluded_reason as string | null,
    providerMessageId:      r.provider_message_id as string | null,
    deliveredAt:            r.delivered_at as Date | null,
    failedAt:               r.failed_at as Date | null,
    errorMessage:           r.error_message as string | null,
    createdAt:              r.created_at as Date,
  };
}
