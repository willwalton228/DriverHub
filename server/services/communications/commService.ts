/**
 * Communication Service — High-level Facade
 *
 * All modules should call these functions instead of touching the orchestrator,
 * microsoftGraphService, or notificationService directly.
 *
 * sendEmail(templateSlug, recipients, context)
 *   → loads template from DB, renders it, resolves recipient emails, dispatches via orchestrator
 *
 * createNotification(type, userIds, title, message, entityType?, entityId?, actionUrl?)
 *   → thin wrapper around notificationService.insertNotificationWithWPI
 */

import { pool } from "../../db";
import { communicationOrchestrator } from "./orchestrator";
import { renderTemplate } from "./templateEngine";
import { insertNotificationWithWPI } from "../notificationService";
import type { CommRecipientInput } from "./types";

const APP_URL = process.env.APP_BASE_URL || process.env.APP_URL || "";

// ── Recipient resolution ───────────────────────────────────────────────────────

export interface RecipientSpec {
  type: "user" | "role" | "email";
  value: string; // userId, role name, or raw email
}

/** Resolves a list of RecipientSpecs to email CommRecipientInputs. */
async function resolveEmailRecipients(specs: RecipientSpec[]): Promise<CommRecipientInput[]> {
  const recipients: CommRecipientInput[] = [];

  for (const spec of specs) {
    if (spec.type === "email") {
      recipients.push({
        recipientType:        "unknown",
        destinationRaw:       spec.value,
        destinationNormalized: spec.value.toLowerCase().trim(),
      });
    } else if (spec.type === "user") {
      const r = await pool.query(
        `SELECT id, email FROM users WHERE id = $1 AND email IS NOT NULL LIMIT 1`,
        [spec.value]
      );
      if (r.rows[0]?.email) {
        recipients.push({
          recipientType:        "employee",
          recipientId:           r.rows[0].id,
          destinationRaw:       r.rows[0].email,
          destinationNormalized: r.rows[0].email.toLowerCase().trim(),
        });
      }
    } else if (spec.type === "role") {
      const r = await pool.query(
        `SELECT id, email FROM users WHERE role = $1 AND email IS NOT NULL`,
        [spec.value]
      );
      for (const row of r.rows) {
        recipients.push({
          recipientType:        "employee",
          recipientId:           row.id,
          destinationRaw:       row.email,
          destinationNormalized: row.email.toLowerCase().trim(),
        });
      }
    }
  }

  return recipients;
}

// ── Recipient rules: load from DB ─────────────────────────────────────────────

export async function getRecipientRulesForEvent(eventSlug: string): Promise<RecipientSpec[]> {
  const r = await pool.query(
    `SELECT recipient_type AS type, recipient_value AS value
     FROM comm_recipient_rules
     WHERE event_slug = $1 AND enabled = true AND channel = 'email'`,
    [eventSlug]
  );
  return r.rows as RecipientSpec[];
}

// ── sendEmail ─────────────────────────────────────────────────────────────────

export interface SendEmailOptions {
  /** Slug of a comm_template (e.g. 'CLAIM_CREATED') */
  templateSlug: string;
  /** Explicit recipients — if omitted, loads from comm_recipient_rules for templateSlug */
  recipients?: RecipientSpec[];
  /** Template variable context */
  context: Record<string, string | number | null | undefined>;
  /** Link the send to a business entity for audit trail */
  relatedModule?:     string;
  relatedEntityType?: string;
  relatedEntityId?:   string;
  createdByUserId?:   string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<{ ok: boolean; error?: string }> {
  try {
    const rendered = await renderTemplate(opts.templateSlug, opts.context);
    if (!rendered) {
      return { ok: false, error: `Template not found: ${opts.templateSlug}` };
    }

    const specs = opts.recipients ?? await getRecipientRulesForEvent(opts.templateSlug);
    if (!specs.length) {
      console.warn(`[CommService] No recipients configured for event: ${opts.templateSlug}`);
      return { ok: false, error: "No recipients configured" };
    }

    const commRecipients = await resolveEmailRecipients(specs);
    if (!commRecipients.length) {
      console.warn(`[CommService] No resolvable email addresses for: ${opts.templateSlug}`);
      return { ok: false, error: "No resolvable email addresses" };
    }

    const result = await communicationOrchestrator.send({
      channel:   "email",
      provider:  "microsoft_365",
      subject:   rendered.subject,
      body:      rendered.bodyHtml,
      templateSlug: opts.templateSlug,
      recipients: commRecipients,
      relatedModule:     opts.relatedModule,
      relatedEntityType: opts.relatedEntityType,
      relatedEntityId:   opts.relatedEntityId,
      createdByUserId:   opts.createdByUserId,
    });

    const ok = result.status === "sent" || result.sent > 0;
    if (!ok) {
      console.error(`[CommService] Send failed for ${opts.templateSlug}:`, result.errors);
    }
    return { ok, error: ok ? undefined : result.errors.join("; ") };
  } catch (err: any) {
    console.error(`[CommService] sendEmail error for ${opts.templateSlug}:`, err.message);
    return { ok: false, error: err.message };
  }
}

// ── createNotification ────────────────────────────────────────────────────────

export interface CreateNotificationOptions {
  type: string;
  userIds: string[];
  title: string;
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  actionUrl?: string;
}

export async function createNotification(opts: CreateNotificationOptions): Promise<void> {
  for (const userId of opts.userIds) {
    try {
      await insertNotificationWithWPI({
        userId,
        type:              opts.type,
        title:             opts.title,
        message:           opts.message,
        relatedEntityType: opts.relatedEntityType,
        relatedEntityId:   opts.relatedEntityId,
        actionUrl:         opts.actionUrl,
      });
    } catch (err: any) {
      console.error(`[CommService] createNotification error for user ${userId}:`, err.message);
    }
  }
}

// ── resolveUserIdsForEvent ────────────────────────────────────────────────────

/** Returns user IDs from comm_recipient_rules for a given event slug. */
export async function resolveUserIdsForEvent(eventSlug: string): Promise<string[]> {
  const rules = await getRecipientRulesForEvent(eventSlug);
  const ids: string[] = [];

  for (const rule of rules) {
    if (rule.type === "user") {
      ids.push(rule.value);
    } else if (rule.type === "role") {
      const r = await pool.query(`SELECT id FROM users WHERE role = $1`, [rule.value]);
      ids.push(...r.rows.map((row: any) => row.id));
    }
  }

  return [...new Set(ids)];
}

export { APP_URL };
