/**
 * DriverHub Communications Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Channel-based outbound messaging framework.
 *
 * Design principles:
 *   • Channel-based, not screen-based — same service powers SMS from any module
 *   • Provider-abstracted — swap or add providers without touching callers
 *   • Every send attempt is logged — including failures and exclusions
 *   • Feature-flag gated — SMS is disabled until flag + provider config are ready
 *   • Recipient validation runs before any send
 *
 * Initial providers:
 *   • SMS:   Heymarket (production) / pending_integration (flag off or unconfigured)
 *
 * Usage example (Assigned Drivers):
 *   const result = await sendBulkSms({
 *     accountId,
 *     driverIds: [...],
 *     message:   "Your shift starts tomorrow at 8 AM.",
 *     sentByUserId,
 *     contextModule: "assigned_drivers",
 *   });
 */

import { pool } from "../db";
import { randomUUID } from "crypto";
import { resolveConfig } from "./platformConfigService";
import { validatePhone } from "./phoneNormalizationService";

// ── Types ──────────────────────────────────────────────────────────────────

export type SmsStatus =
  | "sms_disabled"        // feature flag heymarket_texting_enabled is absent or false
  | "pending_integration" // flag is on but provider credentials not yet configured
  | "queued"              // ready to send, not yet dispatched
  | "sent"                // provider confirmed delivery
  | "failed";             // provider returned error

export interface RecipientResult {
  driverId:     string;
  name:         string;
  phone:        string | null;
  normalizedPhone: string | null;
  included:     boolean;
  exclusionReason: string | null; // 'missing_phone' | 'invalid_phone' | null
  status:       SmsStatus;
  externalMessageId: string | null;
  error:        string | null;
}

// Group signatures available for bulk/group sends.
// 1:1 sends never use these — they use the user's own Heymarket identity.
export const GROUP_SIGNATURES = [
  { value: "recruiting", label: "Recruiting - Driver on Demand", configKey: "sms.heymarket.group_creator.recruiting" },
  { value: "dispatch",   label: "Dispatch - Driver on Demand",   configKey: "sms.heymarket.group_creator.dispatch" },
  { value: "support",    label: "Support - Driver on Demand",    configKey: "sms.heymarket.group_creator.support" },
] as const;

export type GroupSignatureValue = typeof GROUP_SIGNATURES[number]["value"];

export interface BulkSmsRequest {
  accountId:      string | null;
  driverIds:      string[];
  message:        string;
  sentByUserId:   string | null;
  contextModule:  string;              // 'assigned_drivers' | 'scheduling' | 'dispatch' | 'driver_detail' | ...
  contextEntityId?: string;            // optional entity (shift/move/claim/driver ID)
  groupSignature?: GroupSignatureValue | null;  // required for bulk sends; null/omitted for 1:1
}

export interface BulkSmsResult {
  bulkSendId:        string;
  integrationActive: boolean;
  recipientResults:  RecipientResult[];
  included:          number;
  excluded:          number;
  sent:              number;
  failed:            number;
  summary:           string;
}

// ── Feature flag + provider config ────────────────────────────────────────

export async function isSmsEnabled(): Promise<boolean> {
  try {
    const flagConf = await resolveConfig("heymarket_texting_enabled");
    return flagConf?.configValue === true || flagConf?.configValue === "true";
  } catch {
    return false;
  }
}

interface HeymarketConfig {
  apiToken:  string;
  inboxId:   number;
  creatorId: number | null;
}

async function getHeymarketConfig(): Promise<HeymarketConfig | null> {
  // Primary: environment variable (most secure)
  const apiToken = process.env.HEYMARKET_API_TOKEN;
  // Inbox ID and creator ID from platform_configs (non-sensitive)
  let inboxId:   number | null = null;
  let creatorId: number | null = null;
  try {
    const [inboxConf, creatorConf] = await Promise.all([
      resolveConfig("sms.heymarket.inbox_id").catch(() => null),
      resolveConfig("sms.heymarket.creator_id").catch(() => null),
    ]);
    const rawInbox = inboxConf?.configValue;
    if (rawInbox) inboxId = parseInt(String(rawInbox), 10);
    const rawCreator = creatorConf?.configValue;
    if (rawCreator) creatorId = parseInt(String(rawCreator), 10);
  } catch { /* ignore */ }

  if (!apiToken || !inboxId) return null;
  return { apiToken, inboxId, creatorId };
}

// ── Heymarket provider ─────────────────────────────────────────────────────

interface HeymarketSendResult {
  success: boolean;
  messageId?: string;
  error?:    string;
  raw?:      Record<string, unknown>;
}

async function sendViaHeymarket(
  to:                string,
  message:           string,
  config:            HeymarketConfig,
  creatorIdOverride?: number | null,
): Promise<HeymarketSendResult> {
  try {
    // ── Per official Heymarket API docs (/v1/message/send) ──────────────────
    // Endpoint : POST /v1/message/send
    // Auth     : Authorization: Bearer <token>
    // Phone fmt: E.164 WITHOUT the + sign  (e.g. 13364423986)
    // Required : inbox_id (int), creator_id (int), phone_number (str), text (str)
    // local_id : UUID recommended for deduplication
    const ENDPOINT = "https://api.heymarket.com/v1/message/send";
    const authHeader = { "Authorization": `Bearer ${config.apiToken}` };

    // Normalise phone → 11-digit E.164 without "+"
    const rawDigits = to.replace(/\D/g, "");
    const phone = rawDigits.length === 10 ? `1${rawDigits}` : rawDigits;

    // creator_id resolution (priority: per-send override → global config → omit)
    // Per-send override comes from the sending user's own heymarket_member_id (1-to-1 sends),
    // ensuring the message appears from that specific user. Falls back to global config.
    const creatorId: number | null = creatorIdOverride ?? config.creatorId ?? null;
    if (creatorId !== null) {
      console.log(`[Heymarket] Using configured creator_id=${creatorId}`);
    } else {
      console.log(`[Heymarket] No creator_id configured — sending without creator_id`);
    }

    const body: Record<string, unknown> = {
      inbox_id:     config.inboxId,
      phone_number: phone,
      text:         message,
      local_id:     randomUUID(),
    };
    if (creatorId !== null) body.creator_id = creatorId;

    const resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body),
    });
    console.log(`[Heymarket] POST /v1/message/send → ${resp.status} | phone: ${phone} | creator_id: ${creatorId}`);
    const usedBody = body;

    const rawText = await resp.text();
    let raw: Record<string, unknown> = {};
    try { raw = JSON.parse(rawText); } catch { raw = { raw_response: rawText }; }

    if (!resp.ok) {
      const detail = (raw as any)?.message ?? (raw as any)?.error ?? (raw as any)?.detail ?? rawText;
      console.error(`[Heymarket] ${resp.status} — body:`, JSON.stringify(usedBody), "— response:", rawText);
      return {
        success: false,
        error:   `HTTP ${resp.status}: ${detail}`,
        raw,
      };
    }

    // Heymarket returns { id, ... } on success
    const messageId = String((raw as any)?.id ?? "");
    return { success: true, messageId, raw };
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) };
  }
}

// ── Logging helpers ────────────────────────────────────────────────────────

async function insertLog(params: {
  accountId:     string | null;
  driverId:      string | null;
  sentByUserId:  string | null;
  channel:       string;
  provider:      string;
  recipientPhone: string | null;
  recipientName:  string | null;
  messageBody:    string;
  status:         string;
  externalMessageId?: string | null;
  errorMessage?:  string | null;
  providerResponse?: Record<string, unknown> | null;
  contextModule?: string | null;
  contextEntityId?: string | null;
  bulkSendId?:    string | null;
  sentAt?:        Date | null;
  failedAt?:      Date | null;
  groupSignature?: string | null;  // null for 1:1 sends; set for group/bulk sends
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO driver_communication_logs
         (account_id, driver_id, sent_by_user_id, channel, provider,
          recipient_phone, recipient_name, message_body, status,
          external_message_id, error_message,
          context_module, context_entity_id, bulk_send_id,
          sent_at, failed_at, provider_response, group_signature, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now())`,
      [
        params.accountId,
        params.driverId,
        params.sentByUserId,
        params.channel,
        params.provider,
        params.recipientPhone,
        params.recipientName,
        params.messageBody,
        params.status,
        params.externalMessageId ?? null,
        params.errorMessage ?? null,
        params.contextModule ?? null,
        params.contextEntityId ?? null,
        params.bulkSendId ?? null,
        params.sentAt ?? null,
        params.failedAt ?? null,
        params.providerResponse ? JSON.stringify(params.providerResponse) : null,
        params.groupSignature ?? null,
      ],
    );
  } catch (logErr) {
    // Logging must never throw — silently catch
    console.error("[CommunicationsService] Failed to write log entry:", logErr);
  }
}

// ── Recipient resolver ─────────────────────────────────────────────────────

interface DriverPhoneRow {
  driver_id:           string;
  first_name:          string | null;
  last_name:           string | null;
  phone_number:        string | null;
  mobile_phone_normalized: string | null;
  mobile_phone_is_valid:   boolean | null;
  sms_eligible:        boolean | null;
  sms_invalid_reason:  string | null;
}

async function resolveRecipients(
  accountId:  string | null,
  driverIds:  string[],
): Promise<DriverPhoneRow[]> {
  if (!driverIds.length) return [];
  const placeholders = driverIds.map((_: any, i: number) => `$${i + 1}`).join(", ");

  // When accountId is null or the sentinel "driver_detail", resolve drivers directly
  // by ID without requiring a driver_accounts join (used for single-driver sends).
  if (!accountId || accountId === "driver_detail") {
    const { rows } = await pool.query<DriverPhoneRow>(
      `SELECT
         d.id AS driver_id,
         u.first_name, u.last_name,
         d.phone_number,
         d.mobile_phone_normalized,
         d.mobile_phone_is_valid,
         d.sms_eligible,
         d.sms_invalid_reason
       FROM drivers d
       LEFT JOIN users u ON u.id = d.user_id
       WHERE d.id IN (${placeholders})`,
      [...driverIds],
    );
    return rows;
  }

  const accountPlaceholders = driverIds.map((_: any, i: number) => `$${i + 2}`).join(", ");
  const { rows } = await pool.query<DriverPhoneRow>(
    `SELECT
       d.id AS driver_id,
       u.first_name, u.last_name,
       d.phone_number,
       d.mobile_phone_normalized,
       d.mobile_phone_is_valid,
       d.sms_eligible,
       d.sms_invalid_reason
     FROM driver_accounts da
     JOIN drivers d ON d.id = da.driver_id
     LEFT JOIN users u ON u.id = d.user_id
      WHERE da.account_id = $1
        AND da.assignment_ended_at IS NULL
        AND d.id IN (${accountPlaceholders})`,
    [accountId, ...driverIds],
  );
  return rows;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Send an SMS to a list of drivers (bulk or single).
 * Handles feature-flag checking, recipient validation, provider dispatch,
 * and full audit logging per recipient.
 */
export async function sendBulkSms(req: BulkSmsRequest): Promise<BulkSmsResult> {
  const bulkSendId = `sms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const integrationActive = await isSmsEnabled();
  const heymarketConfig   = integrationActive ? await getHeymarketConfig() : null;
  const provider          = heymarketConfig ? "heymarket" : "pending_integration";

  // Normalise accountId for the audit log: the "driver_detail" sentinel is a routing
  // signal for resolveRecipients only — it is NOT a valid FK into customers.id.
  // Using it in insertLog would trigger a FK violation and silently drop every log row.
  const logAccountId: string | null =
    (!req.accountId || req.accountId === "driver_detail") ? null : req.accountId;

  // ── Creator ID resolution ──────────────────────────────────────────────────
  // 1:1 sends → personal identity (user mapping → legacy field → global config)
  // Bulk sends → group signature identity (configured per-role creator ID)
  //
  // The shared sending line (DOD Driver Text Line inbox_id) is NEVER changed.
  let senderCreatorId: number | null = null;
  // Tracks how the 1:1 sender was resolved for structured audit logging.
  // Values: "mapping" | "legacy_user_field" | "global_fallback" | "omitted"
  let senderResolutionSource: "mapping" | "legacy_user_field" | "global_fallback" | "omitted" | null = null;
  const isIndividualSend = req.driverIds.length === 1;

  if (heymarketConfig) {
    if (isIndividualSend && req.sentByUserId) {
      // ── 1:1 send: resolve authenticated user's personal Heymarket identity ──
      try {
        const mappingRow = (await pool.query<{ heymarket_user_id: number; heymarket_name: string | null }>(
          "SELECT heymarket_user_id, heymarket_name FROM heymarket_user_mappings WHERE driverhub_user_id = $1",
          [req.sentByUserId],
        )).rows[0];

        if (mappingRow) {
          senderCreatorId = mappingRow.heymarket_user_id;
          senderResolutionSource = "mapping";
          console.log(`[Heymarket] 1:1 sender → mapping table: userId=${req.sentByUserId} → creator=${senderCreatorId} (${mappingRow.heymarket_name ?? "unknown"})`);
        } else {
          // Legacy fallback: users.heymarket_member_id
          const legacyRow = (await pool.query<{ heymarket_member_id: number | null }>(
            "SELECT heymarket_member_id FROM users WHERE id = $1",
            [req.sentByUserId],
          )).rows[0];

          if (legacyRow?.heymarket_member_id) {
            senderCreatorId = legacyRow.heymarket_member_id;
            senderResolutionSource = "legacy_user_field";
            console.log(`[Heymarket] 1:1 sender → legacy heymarket_member_id: userId=${req.sentByUserId} → creator=${senderCreatorId}`);
          } else {
            // Will fall through to global config creator_id inside sendViaHeymarket
            senderResolutionSource = heymarketConfig.creatorId !== null ? "global_fallback" : "omitted";
            console.log(`[Heymarket] 1:1 sender fallback: no mapping for userId=${req.sentByUserId} — using global config creator_id`);
          }
        }
      } catch (err) {
        senderResolutionSource = heymarketConfig.creatorId !== null ? "global_fallback" : "omitted";
        console.warn(`[Heymarket] 1:1 sender resolution error for userId=${req.sentByUserId}:`, err);
      }

      // Structured audit log for every 1:1 send attempt — required for traceability
      console.log(JSON.stringify({
        event: "heymarket_sender_resolved",
        sender_resolution_source: senderResolutionSource,
        ...(senderResolutionSource === "global_fallback" || senderResolutionSource === "omitted"
          ? { reason: "no_mapping" } : {}),
        driverhub_user_id: req.sentByUserId,
        resolved_heymarket_user_id: senderCreatorId ?? (senderResolutionSource === "global_fallback" ? heymarketConfig.creatorId : null),
        bulk_send_id: bulkSendId,
        ts: new Date().toISOString(),
      }));
    } else if (!isIndividualSend && req.groupSignature) {
      // ── Bulk/group send: resolve the selected group signature's creator ID ──
      const sigConfig = GROUP_SIGNATURES.find(s => s.value === req.groupSignature);
      if (sigConfig) {
        try {
          const confRow = await resolveConfig(sigConfig.configKey);
          const rawId = confRow?.configValue;
          if (rawId) {
            const parsed = parseInt(String(rawId), 10);
            if (!isNaN(parsed) && parsed > 0) {
              senderCreatorId = parsed;
              console.log(`[Heymarket] Bulk sender → group signature "${req.groupSignature}" (${sigConfig.label}): creator=${senderCreatorId}`);
            } else {
              console.log(`[Heymarket] Bulk sender fallback: group signature "${req.groupSignature}" config key "${sigConfig.configKey}" is not a valid integer — using global config creator_id`);
            }
          } else {
            console.log(`[Heymarket] Bulk sender fallback: group signature "${req.groupSignature}" not yet configured (${sigConfig.configKey}) — using global config creator_id`);
          }
        } catch (err) {
          console.warn(`[Heymarket] Bulk group signature resolution error:`, err);
        }
      }
    }
    // If neither branch resolves a creator, sendViaHeymarket falls through to global config creator_id.
  }

  // Resolve driver rows from DB
  const driverRows = await resolveRecipients(req.accountId, req.driverIds);

  const recipientResults: RecipientResult[] = [];

  for (const row of driverRows) {
    const name = [row.first_name, row.last_name].filter(Boolean).join(" ") || "Driver";

    // Determine the best phone number to use
    let phone = row.mobile_phone_normalized ?? null;
    let isValid = row.mobile_phone_is_valid ?? false;
    let smsEligible = row.sms_eligible ?? false;
    let invalidReason: string | null = row.sms_invalid_reason ?? null;

    // If normalization hasn't been run yet, run it now on-the-fly
    if (!phone && row.phone_number) {
      const val = validatePhone(row.phone_number);
      phone       = val.normalized;
      isValid     = val.isValid;
      smsEligible = val.smsEligible;
      invalidReason = val.invalidReason;
    }

    if (!phone || !smsEligible) {
      const reason = !phone
        ? "missing_phone"
        : isValid ? "sms_not_eligible" : "invalid_phone";

      await insertLog({
        accountId:     logAccountId,
        driverId:      row.driver_id,
        sentByUserId:  req.sentByUserId,
        channel:       "sms",
        provider,
        recipientPhone: row.phone_number,
        recipientName:  name,
        messageBody:   req.message,
        status:        "failed",
        errorMessage:  reason,
        contextModule: req.contextModule,
        contextEntityId: req.contextEntityId ?? null,
        bulkSendId,
        failedAt: new Date(),
        groupSignature: req.groupSignature ?? null,
      });

      recipientResults.push({
        driverId: row.driver_id, name,
        phone: row.phone_number, normalizedPhone: null,
        included: false, exclusionReason: reason,
        status: "failed", externalMessageId: null, error: reason,
      });
      continue;
    }

    // ── Included recipient ──────────────────────────────────────────────────

    // Case A: Feature flag is off — SMS is administratively disabled
    if (!integrationActive) {
      const blockReason = "SMS disabled by feature flag (heymarket_texting_enabled is not enabled). No message was sent.";
      await insertLog({
        accountId:      logAccountId,
        driverId:       row.driver_id,
        sentByUserId:   req.sentByUserId,
        channel:        "sms",
        provider:       "pending_integration",
        recipientPhone: phone,
        recipientName:  name,
        messageBody:    req.message,
        status:         "sms_disabled",
        errorMessage:   blockReason,
        contextModule:  req.contextModule,
        contextEntityId: req.contextEntityId ?? null,
        bulkSendId,
        failedAt: new Date(),
        groupSignature: req.groupSignature ?? null,
      });

      recipientResults.push({
        driverId: row.driver_id, name,
        phone: row.phone_number, normalizedPhone: phone,
        included: true, exclusionReason: null,
        status: "sms_disabled", externalMessageId: null, error: blockReason,
      });
      continue;
    }

    // Case B: Flag is on but provider credentials are not yet configured
    if (!heymarketConfig) {
      const blockReason = "Heymarket provider not configured (inbox_id or API token missing). Message logged but not sent.";
      await insertLog({
        accountId:      logAccountId,
        driverId:       row.driver_id,
        sentByUserId:   req.sentByUserId,
        channel:        "sms",
        provider:       "pending_integration",
        recipientPhone: phone,
        recipientName:  name,
        messageBody:    req.message,
        status:         "pending_integration",
        errorMessage:   blockReason,
        contextModule:  req.contextModule,
        contextEntityId: req.contextEntityId ?? null,
        bulkSendId,
        groupSignature: req.groupSignature ?? null,
      });

      recipientResults.push({
        driverId: row.driver_id, name,
        phone: row.phone_number, normalizedPhone: phone,
        included: true, exclusionReason: null,
        status: "pending_integration", externalMessageId: null, error: blockReason,
      });
      continue;
    }

    // ── Live send via Heymarket ─────────────────────────────────────────────
    // Pass senderCreatorId so 1-to-1 sends appear from the sending user's identity
    const sendResult = await sendViaHeymarket(phone, req.message, heymarketConfig, senderCreatorId);

    const status: SmsStatus = sendResult.success ? "sent" : "failed";

    await insertLog({
      accountId:     logAccountId,
      driverId:      row.driver_id,
      sentByUserId:  req.sentByUserId,
      channel:       "sms",
      provider:      "heymarket",
      recipientPhone: phone,
      recipientName:  name,
      messageBody:   req.message,
      status,
      externalMessageId: sendResult.messageId ?? null,
      errorMessage:  sendResult.error ?? null,
      providerResponse: sendResult.raw ?? null,
      contextModule: req.contextModule,
      contextEntityId: req.contextEntityId ?? null,
      bulkSendId,
      sentAt:   sendResult.success ? new Date() : null,
      failedAt: sendResult.success ? null : new Date(),
      groupSignature: req.groupSignature ?? null,
    });

    recipientResults.push({
      driverId: row.driver_id, name,
      phone: row.phone_number, normalizedPhone: phone,
      included: true, exclusionReason: null,
      status,
      externalMessageId: sendResult.messageId ?? null,
      error: sendResult.error ?? null,
    });
  }

  const included     = recipientResults.filter(r => r.included).length;
  const excluded     = recipientResults.filter(r => !r.included).length;
  const sent         = recipientResults.filter(r => r.status === "sent").length;
  const failed       = recipientResults.filter(r => r.status === "failed" && r.included).length;
  const smsDisabled  = recipientResults.filter(r => r.status === "sms_disabled").length;

  const summary = integrationActive && heymarketConfig
    ? `${sent} sent, ${failed} failed, ${excluded} excluded`
    : !integrationActive
      ? `${smsDisabled} blocked (SMS feature flag disabled), ${excluded} excluded`
      : `${included} logged (Heymarket credentials pending), ${excluded} excluded`;

  return {
    bulkSendId, integrationActive,
    recipientResults,
    included, excluded, sent, failed,
    summary,
  };
}

/**
 * Send a single test SMS to verify Heymarket connectivity.
 * Only available to super admins.
 */
export async function sendTestSms(
  toPhone:  string,
  message:  string,
  sentByUserId: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const val = validatePhone(toPhone);
  if (!val.normalized) return { success: false, error: "Invalid phone number format" };

  const config = await getHeymarketConfig();
  if (!config) return { success: false, error: "Heymarket not configured (check HEYMARKET_API_TOKEN and inbox_id)" };

  const result = await sendViaHeymarket(val.normalized, message, config);

  // Log the test send
  await insertLog({
    accountId:    null,
    driverId:     null,
    sentByUserId,
    channel:      "sms",
    provider:     "heymarket",
    recipientPhone: val.normalized,
    recipientName: "Test Recipient",
    messageBody:  message,
    status:       result.success ? "sent" : "failed",
    externalMessageId: result.messageId ?? null,
    errorMessage: result.error ?? null,
    contextModule: "platform_test",
    bulkSendId:   null,
    sentAt:   result.success ? new Date() : null,
    failedAt: result.success ? null : new Date(),
  });

  return result;
}

/**
 * Check Heymarket integration status — returns config completeness without revealing the token.
 */
export async function getHeymarketStatus(): Promise<{
  apiTokenPresent: boolean;
  inboxIdPresent:  boolean;
  inboxId:         number | null;
  creatorId:       number | null;
  featureFlagEnabled: boolean;
  ready:           boolean;
  groupCreators:   { recruiting: number | null; dispatch: number | null; support: number | null };
}> {
  const [flagEnabled, config] = await Promise.all([isSmsEnabled(), getHeymarketConfig()]);
  const inboxConf = await resolveConfig("sms.heymarket.inbox_id").catch(() => null);
  const rawInbox  = inboxConf?.configValue;
  const inboxId   = rawInbox ? parseInt(String(rawInbox), 10) : null;

  const [recruitingConf, dispatchConf, supportConf] = await Promise.all([
    resolveConfig("sms.heymarket.group_creator.recruiting").catch(() => null),
    resolveConfig("sms.heymarket.group_creator.dispatch").catch(() => null),
    resolveConfig("sms.heymarket.group_creator.support").catch(() => null),
  ]);
  const toInt = (v: any) => v?.configValue ? parseInt(String(v.configValue), 10) : null;

  return {
    apiTokenPresent:    !!process.env.HEYMARKET_API_TOKEN,
    inboxIdPresent:     !!inboxId,
    inboxId,
    creatorId:          config?.creatorId ?? null,
    featureFlagEnabled: flagEnabled,
    ready:              !!config && flagEnabled,
    groupCreators: {
      recruiting: toInt(recruitingConf),
      dispatch:   toInt(dispatchConf),
      support:    toInt(supportConf),
    },
  };
}
