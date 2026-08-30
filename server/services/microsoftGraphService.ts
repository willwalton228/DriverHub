/**
 * Microsoft Graph Email Service
 *
 * Sends email via Microsoft Graph API using client credentials (app-level auth).
 * Requires four environment secrets:
 *   MICROSOFT_TENANT_ID
 *   MICROSOFT_CLIENT_ID
 *   MICROSOFT_CLIENT_SECRET
 *   MICROSOFT_SENDER_EMAIL
 *   MICROSOFT_SENDER_OBJECT_ID  (optional – Azure AD object ID for the sender mailbox;
 *                                required when the shared-mailbox UPN differs from its
 *                                Azure AD UserPrincipalName, e.g. ErrorInvalidUser 404)
 *
 * Degrades gracefully: if any credential is absent, sendEmail() resolves with
 * { ok: false, skipped: true } so the calling service can log accordingly.
 *
 * Configuration override: DB row in ms365_config takes precedence over env vars.
 * This allows Super Admins to update credentials from the UI without restarting.
 */

import { db, pool } from "../db";
import { recruitingAuditEvents } from "@shared/schema";
import {
  getRecruitingExternalDeliverySuppressionReason,
  isRecruitingExternalDeliverySuppressed,
} from "./recruitingDeliverySafety";

interface EmailAttachment {
  name: string;
  contentType: string;
  contentBytes: string; // Base64-encoded
}

interface SendEmailOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  attachments?: EmailAttachment[];
  /** Override the default sender. When set, Graph sends from this address instead of cfg.senderEmail. */
  fromEmail?: string;
  /** Present only for Recruiting workflow messages that require non-production delivery auditing. */
  recruitingAudit?: {
    actionType: string;
    entityType: string;
    entityId: string;
    userId?: string | null;
    userEmail?: string | null;
    actorRole?: string | null;
    trigger: string;
  };
}

interface SendEmailResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

// ── Effective config (DB override > env vars) ─────────────────────────────────

interface Ms365Config {
  tenantId: string | null;
  clientId: string | null;
  clientSecret: string | null;
  senderEmail: string | null;
  /** Azure AD object ID for the sender mailbox (used in Graph API URL instead of email) */
  senderObjectId: string | null;
}

export async function getEffectiveMs365Config(): Promise<Ms365Config> {
  // Default senderObjectId from env var
  let senderObjectId: string | null = process.env.MICROSOFT_SENDER_OBJECT_ID || null;

  try {
    const { rows } = await pool.query(
      "SELECT tenant_id, client_id, client_secret, sender_email FROM ms365_config WHERE id = 1",
    );
    if (rows.length > 0) {
      const row = rows[0];

      // Read sender_mailbox_id separately so a missing column doesn't break main config
      try {
        const { rows: midRows } = await pool.query(
          "SELECT sender_mailbox_id FROM ms365_config WHERE id = 1",
        );
        if (midRows.length > 0 && midRows[0].sender_mailbox_id) {
          senderObjectId = midRows[0].sender_mailbox_id;
        }
      } catch {
        // Column not yet added — env var fallback stays
      }

      return {
        tenantId:       row.tenant_id     || process.env.MICROSOFT_TENANT_ID     || null,
        clientId:       row.client_id     || process.env.MICROSOFT_CLIENT_ID     || null,
        clientSecret:   row.client_secret || process.env.MICROSOFT_CLIENT_SECRET || null,
        senderEmail:    row.sender_email  || process.env.MICROSOFT_SENDER_EMAIL  || null,
        senderObjectId,
      };
    }
  } catch {
    // Fall through to env vars on any DB error
  }
  return {
    tenantId:       process.env.MICROSOFT_TENANT_ID        || null,
    clientId:       process.env.MICROSOFT_CLIENT_ID        || null,
    clientSecret:   process.env.MICROSOFT_CLIENT_SECRET    || null,
    senderEmail:    process.env.MICROSOFT_SENDER_EMAIL      || null,
    senderObjectId: process.env.MICROSOFT_SENDER_OBJECT_ID || null,
  };
}

// ── Update config (DB) ────────────────────────────────────────────────────────

function maskValue(value: string | null | undefined, field: string): string {
  if (!value) return "(not set)";
  if (field === "client_secret") return "****";
  if (field === "sender_email" || field === "sender_mailbox_id") return value;
  // GUIDs: show first 4 + "..." + last 4
  if (value.length > 8) return `${value.slice(0, 4)}...${value.slice(-4)}`;
  return "****";
}

export interface UpdateMs365ConfigInput {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  senderEmail?: string;
  /** Azure AD object ID for the sender mailbox */
  senderObjectId?: string;
}

export async function updateMs365Config(
  updates: UpdateMs365ConfigInput,
  calledByUserId: string,
): Promise<void> {
  // Ensure the optional column exists (safe no-op if already present)
  try {
    await pool.query(
      "ALTER TABLE ms365_config ADD COLUMN IF NOT EXISTS sender_mailbox_id VARCHAR(255)",
    );
  } catch { /* ignore — table may not exist yet */ }

  // Fetch current values for audit
  const current = await getEffectiveMs365Config();

  const dbFieldMap: Record<keyof UpdateMs365ConfigInput, string> = {
    tenantId:       "tenant_id",
    clientId:       "client_id",
    clientSecret:   "client_secret",
    senderEmail:    "sender_email",
    senderObjectId: "sender_mailbox_id",
  };

  const currentDbFieldMap: Record<string, string | null> = {
    tenant_id:        current.tenantId,
    client_id:        current.clientId,
    client_secret:    current.clientSecret,
    sender_email:     current.senderEmail,
    sender_mailbox_id: current.senderObjectId,
  };

  // Upsert config row
  const setClauses: string[] = ["updated_at = NOW()", "updated_by = $1"];
  const values: any[] = [calledByUserId];
  let paramIdx = 2;

  if (updates.tenantId !== undefined) {
    setClauses.push(`tenant_id = $${paramIdx++}`);
    values.push(updates.tenantId);
  }
  if (updates.clientId !== undefined) {
    setClauses.push(`client_id = $${paramIdx++}`);
    values.push(updates.clientId);
  }
  if (updates.clientSecret !== undefined) {
    setClauses.push(`client_secret = $${paramIdx++}`);
    values.push(updates.clientSecret);
  }
  if (updates.senderEmail !== undefined) {
    setClauses.push(`sender_email = $${paramIdx++}`);
    values.push(updates.senderEmail);
  }
  if (updates.senderObjectId !== undefined) {
    setClauses.push(`sender_mailbox_id = $${paramIdx++}`);
    values.push(updates.senderObjectId);
  }

  await pool.query(
    `INSERT INTO ms365_config (id, updated_by, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET ${setClauses.join(", ")}`,
    values,
  );

  // Audit log each changed field
  for (const [key, dbField] of Object.entries(dbFieldMap)) {
    const newVal = updates[key as keyof UpdateMs365ConfigInput];
    if (newVal === undefined) continue;
    const prevMasked = maskValue(currentDbFieldMap[dbField], dbField);
    const newMasked  = maskValue(newVal, dbField);
    await pool.query(
      `INSERT INTO ms365_config_audit
         (changed_at, changed_by_user_id, field_changed, previous_value_masked, new_value_masked)
       VALUES (NOW(), $1, $2, $3, $4)`,
      [calledByUserId, dbField, prevMasked, newMasked],
    );
  }

  // Invalidate the in-process token cache so next send uses new credentials
  _cachedToken     = null;
  _tokenExpiresAt  = 0;
}

// ── OAuth token cache (in-process, expires at token expiry) ──────────────────
let _cachedToken: string | null = null;
let _tokenExpiresAt: number = 0;

async function getAccessToken(): Promise<string | null> {
  const cfg = await getEffectiveMs365Config();
  const { tenantId, clientId, clientSecret } = cfg;

  if (!tenantId || !clientId || !clientSecret) return null;

  const now = Date.now();
  if (_cachedToken && now < _tokenExpiresAt - 30_000) return _cachedToken;

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type:    "client_credentials",
    client_id:     clientId,
    client_secret: clientSecret,
    scope:         "https://graph.microsoft.com/.default",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[MSGraph] OAuth token request failed:", res.status, text);
    return null;
  }

  const data: any = await res.json();
  _cachedToken    = data.access_token ?? null;
  _tokenExpiresAt = now + (data.expires_in ?? 3600) * 1000;
  return _cachedToken;
}

// ── Send email ────────────────────────────────────────────────────────────────
export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  if (opts.recruitingAudit && isRecruitingExternalDeliverySuppressed()) {
    const reason = getRecruitingExternalDeliverySuppressionReason();
    try {
      await db.insert(recruitingAuditEvents).values({
        actionType: opts.recruitingAudit.actionType,
        entityType: opts.recruitingAudit.entityType,
        entityId: opts.recruitingAudit.entityId,
        userId: opts.recruitingAudit.userId || null,
        userEmail: opts.recruitingAudit.userEmail || null,
        actorRole: opts.recruitingAudit.actorRole || null,
        source: "system",
        reason,
        metadata: {
          deliveryStatus: "suppressed",
          provider: "microsoft_graph",
          trigger: opts.recruitingAudit.trigger,
          recipients: opts.to,
          recipientCount: opts.to.length,
          subject: opts.subject,
          environment: process.env.NODE_ENV || "development",
        },
      });
    } catch (auditError) {
      console.error("[Recruiting Delivery Safety] Failed to record suppressed Microsoft Graph delivery:", auditError);
    }

    console.info(
      `[Recruiting Delivery Safety] Suppressed Microsoft Graph email for ${opts.recruitingAudit.trigger}; recipients=${opts.to.length}`,
    );
    return { ok: false, skipped: true, error: "RECRUITING_EXTERNAL_DELIVERY_SUPPRESSED" };
  }

  const cfg = await getEffectiveMs365Config();

  // Use caller-provided fromEmail when specified (per-profile sends); fall back to global config
  const senderEmail = opts.fromEmail?.trim() || cfg.senderEmail;

  if (!senderEmail) {
    return { ok: false, skipped: true };
  }

  const token = await getAccessToken();
  if (!token) {
    return { ok: false, skipped: true };
  }

  const toRecipients = opts.to.map(addr => ({
    emailAddress: { address: addr },
  }));

  const ccRecipients = (opts.cc ?? []).map(addr => ({
    emailAddress: { address: addr },
  }));
  const bccRecipients = (opts.bcc ?? []).map(addr => ({
    emailAddress: { address: addr },
  }));

  const attachments = (opts.attachments ?? []).map(a => ({
    "@odata.type":  "#microsoft.graph.fileAttachment",
    name:           a.name,
    contentType:    a.contentType,
    contentBytes:   a.contentBytes,
  }));

  // ── Resolve acting mailbox and optional "from" override ─────────────────────
  //
  // Three send modes:
  //
  //   1. No fromEmail supplied → use the global service account (senderObjectId or senderEmail).
  //      No "from" field in payload — Graph uses the acting mailbox address automatically.
  //
  //   2. fromEmail supplied, resolves to a User / Shared Mailbox → call /users/{fromEmail}/sendMail
  //      directly.  The fromEmail IS the acting mailbox.  No separate "from" override needed.
  //
  //   3. fromEmail supplied, resolves to a Microsoft 365 Group → Groups have no /sendMail endpoint.
  //      Must use the global service account as the acting mailbox and inject
  //      `message.from = { emailAddress: { address: fromEmail } }` into the payload.
  //      Requires "Send As" permission granted to the service account on the Group in
  //      Exchange Admin Center.  Graph will honour the from-override and deliver as the Group.
  //
  // We detect the Group case by probing /v1.0/users/{fromEmail} — if that returns 404 we fall
  // back to the service-account + from-override path (same result whether it is a Group or any
  // other non-user address that has Send As delegation wired up).

  let mailboxIdentifier: string;
  let fromOverride: { emailAddress: { address: string } } | undefined;

  if (opts.fromEmail?.trim()) {
    const fromAddr = opts.fromEmail.trim();

    // Quick probe: is this address a user/shared-mailbox object in the directory?
    let isUserMailbox = true; // assume user; flip to false if 404
    try {
      const probeUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromAddr)}?$select=id`;
      const probeRes = await fetch(probeUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (probeRes.status === 404) isUserMailbox = false;
      // 403 (no User.Read.All) → leave isUserMailbox = true and use direct path; worst case Graph rejects it
    } catch { /* network error — fall through to direct path */ }

    if (isUserMailbox) {
      // Mode 2: direct send from this mailbox
      mailboxIdentifier = fromAddr;
      fromOverride      = undefined;
    } else {
      // Mode 3: Group (or any non-user address) — use service account + from override
      mailboxIdentifier = cfg.senderObjectId ?? cfg.senderEmail!;
      fromOverride      = { emailAddress: { address: fromAddr } };
    }
  } else {
    // Mode 1: default service account
    mailboxIdentifier = cfg.senderObjectId ?? senderEmail!;
    fromOverride      = undefined;
  }

  const messageBody: Record<string, unknown> = {
    subject: opts.subject,
    body: {
      contentType: "HTML",
      content:     opts.bodyHtml,
    },
    toRecipients,
    ccRecipients,
    bccRecipients,
    attachments,
  };

  // Inject from-override for Group sends (Send As delegation path)
  if (fromOverride) {
    messageBody.from = fromOverride;
  }

  const payload = {
    message:         messageBody,
    saveToSentItems: false,
  };

  const url = `https://graph.microsoft.com/v1.0/users/${mailboxIdentifier}/sendMail`;

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[MSGraph] sendMail failed:", res.status, text);
    return { ok: false, error: `${res.status}: ${text.slice(0, 200)}` };
  }

  return { ok: true };
}

export function isMicrosoftGraphConfigured(): boolean {
  return !!(
    process.env.MICROSOFT_TENANT_ID &&
    process.env.MICROSOFT_CLIENT_ID &&
    process.env.MICROSOFT_CLIENT_SECRET &&
    process.env.MICROSOFT_SENDER_EMAIL
  );
}

// ── Test email attempt logger ─────────────────────────────────────────────────

async function logTestEmailAttempt(params: {
  calledByUserId: string;
  senderEmail: string | null;
  senderProfile?: string;
  recipientEmail: string;
  status: "sent" | "blocked" | "failed";
  message: string;
  technicalError?: string;
  graphResponseId?: string;
}): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ms365_test_email_log (
        id SERIAL PRIMARY KEY,
        attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        attempted_by_user_id TEXT,
        sender_email TEXT,
        sender_profile TEXT,
        recipient_email TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT,
        technical_error TEXT,
        graph_response_id TEXT
      )
    `);
    await pool.query(
      `ALTER TABLE ms365_test_email_log ADD COLUMN IF NOT EXISTS sender_profile TEXT`,
    ).catch(() => {});
    await pool.query(
      `INSERT INTO ms365_test_email_log
         (attempted_by_user_id, sender_email, sender_profile, recipient_email, status, message, technical_error, graph_response_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        params.calledByUserId,
        params.senderEmail,
        params.senderProfile ?? null,
        params.recipientEmail,
        params.status,
        params.message,
        params.technicalError ?? null,
        params.graphResponseId ?? null,
      ],
    );
  } catch { /* log errors must never fail the caller */ }
}

// ── Validation engine ─────────────────────────────────────────────────────────

export type ValidationStatus = "pass" | "fail" | "warning" | "not_checked";

export type OverallStatus =
  | "failed"
  | "partially_operational"
  | "not_checked"
  | "fully_operational";

export interface ValidationCheck {
  key: string;
  label: string;
  status: ValidationStatus;
  message: string;
  technicalError?: string;
  canEditField: boolean;
  relatedFields: string[];
}

export interface MailboxResult {
  profile: string;
  email: string;
  /**
   * Directory object type resolved during validation.
   * - "user"    — regular user or licensed mailbox
   * - "shared"  — shared mailbox (still a /users/ object in Graph)
   * - "group"   — Microsoft 365 Group (lives under /groups/, NOT /users/)
   * - "unknown" — resolved but type indeterminate
   */
  mailboxType?: "user" | "shared" | "group" | "unknown";
  /** Aggregate status for this mailbox (fail if found/mailEnabled fail; warning if mailSend unconfirmed) */
  status: "pass" | "fail" | "warning";
  checks: {
    found:       ValidationStatus;
    mailEnabled: ValidationStatus;
    mailSend:    ValidationStatus;
  };
  message: string;
  technicalError?: string;
}

export interface ValidationResult {
  overallStatus: OverallStatus;
  checkedAt: string;
  /** Global checks: secrets present, OAuth token valid */
  checks: ValidationCheck[];
  /** Per-profile sender mailbox results */
  mailboxes?: MailboxResult[];
}

// ── Fixed sender profiles ──────────────────────────────────────────────────────
const SENDER_PROFILES = [
  { profile: "Reports",    email: "reports@driverondemand.co"    },
  { profile: "Data",       email: "data@driverondemand.co"       },
  { profile: "Support",    email: "support@driverondemand.co"    },
  { profile: "Dispatch",   email: "dispatch@driverondemand.co"   },
  { profile: "Recruiting", email: "recruiting@driverondemand.co" },
] as const;

/** The exact set of valid profile keys, used for route-level validation. */
export const VALID_MAILBOX_PROFILES = SENDER_PROFILES.map(p => p.profile);

const REQUIRED_SECRET_KEYS = [
  "MICROSOFT_TENANT_ID",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_SENDER_EMAIL",
] as const;

// ── Per-profile mailbox override store ────────────────────────────────────────

/** Ensures the per-profile override table exists and returns profile→email overrides. */
async function getMailboxProfileOverrides(): Promise<Map<string, string>> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ms365_mailbox_config (
        profile     TEXT PRIMARY KEY,
        email       TEXT NOT NULL,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by  TEXT
      )
    `);
    const { rows } = await pool.query(`SELECT profile, email FROM ms365_mailbox_config`);
    return new Map(rows.map((r: any) => [r.profile as string, r.email as string]));
  } catch {
    return new Map();
  }
}

/** Upserts a single per-profile email override and logs the change. */
export async function updateMailboxProfileEmail(
  profile: string,
  email: string,
  calledByUserId: string,
): Promise<void> {
  await getMailboxProfileOverrides(); // ensure table exists
  const prevRow = await pool.query(
    `SELECT email FROM ms365_mailbox_config WHERE profile = $1`,
    [profile],
  );
  const prevEmail = prevRow.rows[0]?.email ?? "(not set)";
  await pool.query(
    `INSERT INTO ms365_mailbox_config (profile, email, updated_at, updated_by)
       VALUES ($1, $2, NOW(), $3)
       ON CONFLICT (profile) DO UPDATE SET email = $2, updated_at = NOW(), updated_by = $3`,
    [profile, email, calledByUserId],
  );
  // Audit log (re-uses ms365_config_audit, field_changed = "mailbox:{profile}:email")
  try {
    await pool.query(
      `INSERT INTO ms365_config_audit
         (changed_at, changed_by_user_id, field_changed, previous_value_masked, new_value_masked)
       VALUES (NOW(), $1, $2, $3, $4)`,
      [calledByUserId, `mailbox:${profile}:email`, prevEmail, email],
    );
  } catch { /* audit errors must never fail the caller */ }
}

/**
 * Acquires a fresh OAuth token (bypasses cache) for validation purposes.
 * Accepts explicit config so it can use DB-override values.
 */
async function acquireFreshToken(cfg: Ms365Config): Promise<string> {
  const { tenantId, clientId, clientSecret } = cfg;

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type:    "client_credentials",
    client_id:     clientId!,
    client_secret: clientSecret!,
    scope:         "https://graph.microsoft.com/.default",
  });

  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    let hint    = "";
    try {
      const j    = JSON.parse(text);
      const code = (j.error_codes ?? [])[0];
      detail     = j.error_description ?? j.error ?? text;
      // Translate common AADSTS codes into actionable hints
      if (code === 7000215) hint = "HINT: The stored Client Secret appears to be the secret ID (a GUID), not the secret value. Go to Azure → App Registration → Certificates & Secrets, create a new secret, and copy the Value column (long random string).";
      else if (code === 7000222) hint = "HINT: The Client Secret has expired. Go to Azure → App Registration → Certificates & Secrets, create a new secret, and copy the Value column.";
      else if (code === 90002)   hint = "HINT: Tenant not found. Check the Tenant ID — it should be the Directory (tenant) GUID from Azure AD.";
      else if (code === 700016)  hint = "HINT: Application not found in tenant. Check the Client ID — it should match the Application (client) ID in Azure App Registrations.";
      else if (code === 700011)  hint = "HINT: Application not found in the specified tenant. Verify both Tenant ID and Client ID are correct.";
    } catch {}
    const fullMsg = hint ? `${detail.slice(0, 300)}\n\n${hint}` : detail.slice(0, 300);
    throw new Error(`OAuth token request failed (${res.status}): ${fullMsg}`);
  }

  const data: any = JSON.parse(text);
  if (!data.access_token) throw new Error("Token response did not include access_token.");
  return data.access_token as string;
}

/**
 * Full validation of the Microsoft 365 email integration pipeline.
 * Uses DB-override config values (falls back to env vars).
 * SECURITY: Never returns secret values — only names, statuses, and safe messages.
 * PERMISSION: Caller must verify Super Admin before invoking.
 */
export async function validateMicrosoft365EmailIntegration(
  calledByUserId?: string,
): Promise<ValidationResult> {
  const checkedAt = new Date().toISOString();
  const checks: ValidationCheck[] = [];

  // Load effective config (DB overrides env vars)
  const cfg = await getEffectiveMs365Config();

  // ── 1. Secrets Present ───────────────────────────────────────────────────
  const configValues: Record<string, string | null> = {
    MICROSOFT_TENANT_ID:     cfg.tenantId,
    MICROSOFT_CLIENT_ID:     cfg.clientId,
    MICROSOFT_CLIENT_SECRET: cfg.clientSecret,
    MICROSOFT_SENDER_EMAIL:  cfg.senderEmail,
  };
  const missingSecrets = REQUIRED_SECRET_KEYS.filter(k => !configValues[k]);
  const secretsCheck: ValidationCheck = {
    key:           "secrets_present",
    label:         "Secrets Present",
    canEditField:  missingSecrets.length > 0,
    relatedFields: missingSecrets.length > 0 ? [...missingSecrets] : [...REQUIRED_SECRET_KEYS],
    status:        missingSecrets.length === 0 ? "pass" : "fail",
    message:
      missingSecrets.length === 0
        ? "All required configuration values are present."
        : `Missing: ${missingSecrets.join(", ")}.`,
  };
  checks.push(secretsCheck);

  if (secretsCheck.status === "fail") {
    const skipped = (key: string, label: string): ValidationCheck => ({
      key,
      label,
      status:        "not_checked",
      message:       "Skipped — configuration must be complete first.",
      canEditField:  false,
      relatedFields: [],
    });
    checks.push(skipped("oauth_token_valid",           "OAuth Token Valid"));
    checks.push(skipped("sender_mailbox_found",        "Sender Mailbox Found"));
    checks.push(skipped("sender_mailbox_mail_enabled", "Sender Mailbox Mail-Enabled"));
    checks.push(skipped("mail_send_permission_valid",  "Mail.Send Permission Valid"));
    checks.push(skipped("test_email_successful",       "Test Email Successful"));

    return {
      overallStatus: "failed",
      checkedAt,
      checks,
    };
  }

  // ── 2. OAuth Token Valid ─────────────────────────────────────────────────
  let token: string | null = null;
  let oauthCheck: ValidationCheck;
  try {
    token = await acquireFreshToken(cfg);
    oauthCheck = {
      key:           "oauth_token_valid",
      label:         "OAuth Token Valid",
      status:        "pass",
      message:       "Microsoft Graph OAuth token acquired successfully.",
      canEditField:  false,
      relatedFields: ["MICROSOFT_TENANT_ID", "MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    };
  } catch (err: any) {
    oauthCheck = {
      key:            "oauth_token_valid",
      label:          "OAuth Token Valid",
      status:         "fail",
      message:        "Could not acquire a Microsoft Graph access token. Check your tenant ID, client ID, and client secret.",
      technicalError: err.message,
      canEditField:   true,
      relatedFields:  ["MICROSOFT_TENANT_ID", "MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    };
  }
  checks.push(oauthCheck);

  if (oauthCheck.status === "fail") {
    const skipped = (key: string, label: string): ValidationCheck => ({
      key,
      label,
      status:        "not_checked",
      message:       "Skipped — OAuth token must be valid first.",
      canEditField:  false,
      relatedFields: [],
    });
    checks.push(skipped("sender_mailbox_found",        "Sender Mailbox Found"));
    checks.push(skipped("sender_mailbox_mail_enabled", "Sender Mailbox Mail-Enabled"));
    checks.push(skipped("mail_send_permission_valid",  "Mail.Send Permission Valid"));
    checks.push(skipped("test_email_successful",       "Test Email Successful"));

    return { overallStatus: "failed", checkedAt, checks };
  }

  // ── 3–5. Per-mailbox validation (all 5 fixed sender profiles) ────────────
  const profileOverrides = await getMailboxProfileOverrides();

  // Pre-fetch per-profile test email history (latest result per profile)
  const profileTestStatuses = new Map<string, "sent" | "failed">();
  try {
    await pool.query(
      `ALTER TABLE ms365_test_email_log ADD COLUMN IF NOT EXISTS sender_profile TEXT`,
    ).catch(() => {});
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (sender_profile) sender_profile, status
      FROM ms365_test_email_log
      WHERE sender_profile IS NOT NULL
      ORDER BY sender_profile, attempted_at DESC
    `);
    for (const row of rows) {
      if (row.status === "sent" || row.status === "failed") {
        profileTestStatuses.set(row.sender_profile, row.status);
      }
    }
  } catch { /* table may not exist yet — treat as no history */ }

  const mailboxResults: MailboxResult[] = [];

  for (const { profile, email: defaultEmail } of SENDER_PROFILES) {
    // Use DB-stored email override when available, else fall back to default
    const email = profileOverrides.get(profile) ?? defaultEmail;
    let foundStatus:       ValidationStatus = "fail";
    let mailEnabledStatus: ValidationStatus = "not_checked";
    let mbMessage   = "";
    let mbTechError: string | undefined;

    let mailboxType: MailboxResult["mailboxType"] = "unknown";

    try {
      const userUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}?$select=id,mail,userPrincipalName,accountEnabled,userType`;
      const userRes = await fetch(userUrl, { headers: { Authorization: `Bearer ${token}` } });

      if (userRes.status === 404) {
        // ── Not in /users/ — check whether it is a Microsoft 365 Group ──────────
        // M365 Groups live under /groups/, not /users/, so /users/ always 404s for them.
        // We must NOT report "not found" without first querying /groups/.
        let groupFound = false;
        try {
          const groupUrl = `https://graph.microsoft.com/v1.0/groups?$filter=mail eq '${email}'&$select=id,mail,mailEnabled&$top=1`;
          const groupRes = await fetch(groupUrl, { headers: { Authorization: `Bearer ${token}` } });

          if (groupRes.ok) {
            const gData = await groupRes.json();
            const group = gData.value?.[0];
            if (group) {
              groupFound    = true;
              mailboxType   = "group";
              foundStatus   = "pass";

              if (group.mailEnabled) {
                // Group exists and is mail-enabled, but cannot use /users/sendMail directly.
                // Sending requires "Send As" permission granted to the service account on this
                // Group in Exchange Admin Center, plus the from-override send path.
                mailEnabledStatus = "warning";
                mbMessage =
                  `Microsoft 365 Group detected (${email}). ` +
                  `Groups cannot send via the standard /users/sendMail endpoint. ` +
                  `Two supported paths: (A) Convert to Shared Mailbox in Exchange Admin — zero code changes required; ` +
                  `(B) Grant "Send As" on this Group to the service account — send-as-group path is supported by this system.`;
              } else {
                mailEnabledStatus = "fail";
                mbMessage =
                  `Microsoft 365 Group detected (${email}) but it is not mail-enabled. ` +
                  `Enable mail on the Group before using it as a sender.`;
              }
            }
          }
        } catch { /* group lookup error — fall through to original not-found */ }

        if (!groupFound) {
          // Not a user/shared mailbox AND not a group — genuinely missing
          const body = await userRes.text();
          let graphCode = "ErrorInvalidUser";
          let graphMsg  = body;
          try { const j = JSON.parse(body); graphCode = j.error?.code ?? graphCode; graphMsg = j.error?.message ?? graphMsg; } catch {}
          foundStatus = "fail";
          mbMessage   = `Address not found as a User, Shared Mailbox, or Microsoft 365 Group in this tenant.`;
          mbTechError = `${graphCode}: ${graphMsg.slice(0, 300)}`;
        }

      } else if (userRes.status === 403) {
        // App lacks User.Read.All — cannot verify but email may still work
        foundStatus       = "warning";
        mailEnabledStatus = "warning";
        mbMessage = "Mailbox verification skipped — app lacks User.Read.All permission. Email sending may still work.";

      } else if (!userRes.ok) {
        const body = await userRes.text();
        foundStatus = "fail";
        mbMessage   = `Graph returned an unexpected error (HTTP ${userRes.status}).`;
        mbTechError = body.slice(0, 300);

      } else {
        const mailboxData = await userRes.json();
        foundStatus = "pass";

        // Distinguish shared mailbox from regular user by checking userType / accountEnabled pattern.
        // Shared mailboxes typically have accountEnabled=false and no assignable userType.
        const isShared = mailboxData.accountEnabled === false &&
                         (!mailboxData.userType || mailboxData.userType === "Member");
        mailboxType = isShared ? "shared" : "user";

        const hasMailAddress  = !!(mailboxData.mail || mailboxData.userPrincipalName);
        const accountEnabled  = mailboxData.accountEnabled !== false;

        if (!hasMailAddress) {
          mailEnabledStatus = "fail";
          mbMessage = "Mailbox found but does not have a usable mail address or UPN.";
        } else if (!accountEnabled && !isShared) {
          // Shared mailboxes are normally disabled at the user-account level; that is expected.
          mailEnabledStatus = "fail";
          mbMessage = "Mailbox found but the account is disabled in the tenant — it must be enabled to send mail.";
        } else {
          mailEnabledStatus = "pass";
          mbMessage = `${isShared ? "Shared mailbox" : "User mailbox"} verified (${mailboxData.mail ?? mailboxData.userPrincipalName}).`;
        }
      }
    } catch (err: any) {
      foundStatus = "fail";
      mbMessage   = "An unexpected error occurred while looking up the mailbox.";
      mbTechError = err.message;
    }

    // Determine per-profile mailSend status from test email history
    const profileTest = profileTestStatuses.get(profile);
    const mailSendStatus: ValidationStatus =
      profileTest === "sent"   ? "pass"
      : profileTest === "failed" ? "fail"
      : "warning"; // warning = not yet confirmed

    // Aggregate mailbox status
    let mbStatus: "pass" | "fail" | "warning";
    if (foundStatus === "fail" || mailEnabledStatus === "fail") {
      mbStatus = "fail";
    } else if (mailSendStatus === "fail") {
      mbStatus = "warning"; // found+enabled OK, but send test failed — still operational with caveat
    } else if (mailSendStatus === "pass") {
      mbStatus = "pass"; // fully confirmed
    } else {
      mbStatus = "warning"; // found+enabled OK, mailSend not yet confirmed
    }

    const result: MailboxResult = {
      profile,
      email,
      mailboxType,
      status: mbStatus,
      checks: {
        found:       foundStatus,
        mailEnabled: mailEnabledStatus,
        mailSend:    mailSendStatus,
      },
      message: mbMessage,
    };
    if (mbTechError) result.technicalError = mbTechError;
    mailboxResults.push(result);
  }

  // ── Overall status ───────────────────────────────────────────────────────
  const globalFail       = checks.some(c => c.status === "fail");
  const allMailboxesFail = mailboxResults.every(m => m.status === "fail");
  const someMailboxesFail = mailboxResults.some(m => m.status === "fail");
  // fully_operational = no global failures, no mailbox failures, all mailboxes have mailSend confirmed
  const allMailSendConfirmed = mailboxResults.every(m => m.checks.mailSend === "pass");

  const overallStatus: OverallStatus =
    globalFail
      ? "failed"
      : allMailboxesFail
        ? "failed"
        : someMailboxesFail
          ? "partially_operational"
          : allMailSendConfirmed
            ? "fully_operational"
            : "partially_operational";

  return { overallStatus, checkedAt, checks, mailboxes: mailboxResults };
}

// ── Pre-send integration guard ────────────────────────────────────────────────

export interface Ms365OperationalCheck {
  ok:               boolean;
  reason?:          string;
  failedChecks?:    string[];
  validationResult?: ValidationResult;
}

/**
 * Hard gate for any report send path.
 * Runs a full validation and returns { ok: false } if the integration is not
 * fully_operational. Logs every blocked attempt to report_send_block_log.
 * PERMISSION: caller must verify admin role before invoking.
 */
export async function assertMs365FullyOperational(opts?: {
  reportType?:          string;
  accountScopeCount?:   number;
  attemptedByUserId?:   string;
}): Promise<Ms365OperationalCheck> {
  try {
    const result = await validateMicrosoft365EmailIntegration(opts?.attemptedByUserId);

    if (result.overallStatus === "fully_operational") {
      return { ok: true, validationResult: result };
    }

    const failedChecks = result.checks
      .filter(c => c.status !== "pass")
      .map(c => `${c.label}: ${c.status}`);

    const reason =
      "Report delivery blocked. Microsoft 365 Email integration is not fully operational. " +
      "Please validate configuration in Platform Admin → Microsoft 365 Email before sending.";

    // Log the blocked attempt
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS report_send_block_log (
          id                    SERIAL PRIMARY KEY,
          attempted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          attempted_by_user_id  TEXT,
          report_type           TEXT,
          account_scope_count   INTEGER,
          status                TEXT NOT NULL DEFAULT 'blocked',
          reason                TEXT,
          validation_summary    JSONB,
          overall_status        TEXT,
          sender_email          TEXT
        )
      `);
      const cfg = await getEffectiveMs365Config();
      await pool.query(
        `INSERT INTO report_send_block_log
           (attempted_by_user_id, report_type, account_scope_count, status, reason,
            validation_summary, overall_status, sender_email)
         VALUES ($1, $2, $3, 'blocked', $4, $5, $6, $7)`,
        [
          opts?.attemptedByUserId ?? null,
          opts?.reportType ?? null,
          opts?.accountScopeCount ?? null,
          reason,
          JSON.stringify({ overallStatus: result.overallStatus, failedChecks }),
          result.overallStatus,
          cfg.senderEmail,
        ],
      );
    } catch { /* log errors must never fail the caller */ }

    return { ok: false, reason, failedChecks, validationResult: result };
  } catch (err: any) {
    return {
      ok:     false,
      reason: `Microsoft 365 Email validation check failed: ${err.message}`,
    };
  }
}

/**
 * Lightweight gate: checks only global prerequisites (secrets present + OAuth valid).
 * Used at batch-level — individual accounts still check per-mailbox status.
 */
export async function assertMs365GlobalPrereqs(opts?: {
  reportType?:        string;
  attemptedByUserId?: string;
}): Promise<Ms365OperationalCheck> {
  try {
    const result = await validateMicrosoft365EmailIntegration(opts?.attemptedByUserId);
    const getCheck = (key: string) => result.checks.find(c => c.key === key);
    const secretsOk = getCheck("secrets_present")?.status === "pass";
    const oauthOk   = getCheck("oauth_token_valid")?.status === "pass";

    if (secretsOk && oauthOk) {
      return { ok: true, validationResult: result };
    }

    const failedChecks = result.checks
      .filter(c => ["secrets_present", "oauth_token_valid"].includes(c.key) && c.status !== "pass")
      .map(c => `${c.label}: ${c.status}`);

    const reason = "Report delivery blocked. Microsoft 365 credentials or OAuth token are not operational.";
    return { ok: false, reason, failedChecks, validationResult: result };
  } catch (err: any) {
    return { ok: false, reason: `Microsoft 365 prerequisite check failed: ${err.message}` };
  }
}

/**
 * Per-mailbox gate: blocks send if the specific profile mailbox is not fully pass
 * (found + mailEnabled + mailSend must all be "pass").
 * Returns { ok, reason, failedChecks, resolvedEmail } for callers that need the profile email.
 */
export async function assertMailboxOperational(
  senderProfile: string,
  opts?: {
    reportType?:        string;
    accountId?:         string;
    attemptedByUserId?: string;
  },
): Promise<Ms365OperationalCheck & { resolvedEmail?: string }> {
  try {
    const result = await validateMicrosoft365EmailIntegration(opts?.attemptedByUserId);

    // Global prereqs first
    const getCheck = (key: string) => result.checks.find(c => c.key === key);
    if (getCheck("secrets_present")?.status !== "pass" || getCheck("oauth_token_valid")?.status !== "pass") {
      return {
        ok: false,
        reason: "Report blocked. Microsoft 365 credentials or OAuth token are not operational.",
        validationResult: result,
      };
    }

    const mailbox = result.mailboxes?.find(m => m.profile === senderProfile);
    if (!mailbox) {
      return {
        ok: false,
        reason: `Report blocked. Sender mailbox profile "${senderProfile}" is not recognised.`,
        validationResult: result,
      };
    }

    if (mailbox.status !== "pass") {
      const blockedChecks: string[] = [];
      if (mailbox.checks.found !== "pass")       blockedChecks.push(`${senderProfile} mailbox not found (${mailbox.checks.found})`);
      if (mailbox.checks.mailEnabled !== "pass")  blockedChecks.push(`${senderProfile} mailbox not mail-enabled (${mailbox.checks.mailEnabled})`);
      if (mailbox.checks.mailSend !== "pass")     blockedChecks.push(`${senderProfile} Mail.Send not confirmed — send a test email first`);

      const reason = `Report blocked. Selected sender mailbox is not operational. (${senderProfile} — ${mailbox.email})`;

      // Log to report_send_block_log
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS report_send_block_log (
            id SERIAL PRIMARY KEY,
            attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            attempted_by_user_id TEXT,
            report_type TEXT,
            account_scope_count INTEGER,
            status TEXT NOT NULL DEFAULT 'blocked',
            reason TEXT,
            validation_summary JSONB,
            overall_status TEXT,
            sender_email TEXT
          )
        `);
        await pool.query(
          `INSERT INTO report_send_block_log
             (attempted_by_user_id, report_type, status, reason, validation_summary, overall_status, sender_email)
           VALUES ($1, $2, 'blocked', $3, $4, $5, $6)`,
          [
            opts?.attemptedByUserId ?? null,
            opts?.reportType ?? null,
            reason,
            JSON.stringify({ senderProfile, mailboxStatus: mailbox.status, blockedChecks }),
            mailbox.status,
            mailbox.email,
          ],
        );
      } catch { /* log errors must never fail the caller */ }

      return { ok: false, reason, failedChecks: blockedChecks, validationResult: result };
    }

    return { ok: true, resolvedEmail: mailbox.email, validationResult: result };
  } catch (err: any) {
    return { ok: false, reason: `Mailbox validation check failed: ${err.message}` };
  }
}

// ── Send test email (with pre-validation + result logging) ────────────────────

export interface TestEmailSendResult {
  ok: boolean;
  blocked?: boolean;
  blockedReason?: string;
  sentAt?: string;
  recipientEmail: string;
  senderEmail?: string;
  senderProfile?: string;
  message?: string;
  error?: string;
  technicalError?: string;
  validationResult: ValidationResult;
}

/**
 * Validates the integration (steps 1–4), then attempts a real send.
 * Updates mail_send_permission_valid and test_email_successful based on the outcome.
 * Logs every attempt to ms365_test_email_log.
 * SECURITY: Never returns tokens or secret values.
 * PERMISSION: Caller must verify Super Admin before invoking.
 */
export async function sendTestEmail(
  recipientEmail: string,
  subject: string,
  bodyHtml: string,
  calledByUserId: string,
  senderProfile: string,
): Promise<TestEmailSendResult> {
  // ── Step 1: Pre-flight validation ─────────────────────────────────────────
  const preValidation = await validateMicrosoft365EmailIntegration(calledByUserId);
  const getCheck = (key: string) => preValidation.checks.find(c => c.key === key);

  const secretsOk = getCheck("secrets_present")?.status === "pass";
  const oauthOk   = getCheck("oauth_token_valid")?.status === "pass";

  // Resolve the effective email for the selected profile
  const profileOverrides  = await getMailboxProfileOverrides();
  const defaultProfileEntry = SENDER_PROFILES.find(p => p.profile === senderProfile);
  const senderEmail = profileOverrides.get(senderProfile) ?? defaultProfileEntry?.email ?? null;

  // Check that the selected mailbox found+mailEnabled are not fail
  const mailboxResult = preValidation.mailboxes?.find(m => m.profile === senderProfile);
  const mailboxOk =
    mailboxResult
      ? mailboxResult.checks.found !== "fail" && mailboxResult.checks.mailEnabled !== "fail"
      : false;

  if (!secretsOk || !oauthOk || !senderEmail || !mailboxOk) {
    let blockedReason = "Test email blocked — Microsoft 365 Email integration is not operational.";
    if (!senderEmail) {
      blockedReason = `No email address configured for the ${senderProfile} profile.`;
    } else if (!mailboxOk) {
      blockedReason = `The ${senderProfile} mailbox (${senderEmail}) is not verified — fix the mailbox before sending.`;
    }
    await logTestEmailAttempt({
      calledByUserId,
      senderEmail,
      senderProfile,
      recipientEmail,
      status:  "blocked",
      message: blockedReason,
    });
    return {
      ok:            false,
      blocked:       true,
      blockedReason,
      recipientEmail,
      senderEmail:   senderEmail ?? undefined,
      senderProfile,
      validationResult: preValidation,
    };
  }

  // ── Step 2: Attempt the Graph sendMail from the selected profile mailbox ──
  const sentAt = new Date().toISOString();
  let sendOk        = false;
  let plainError: string | undefined;
  let techError: string | undefined;
  let graphResponseId: string | undefined;

  try {
    const token = await getAccessToken();
    if (!token) throw new Error("Could not acquire OAuth token for send.");

    // Use the profile email directly as the Graph mailbox identifier
    const url = `https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`;

    const graphRes = await fetch(url, {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body:         { contentType: "HTML", content: bodyHtml },
          toRecipients: [{ emailAddress: { address: recipientEmail } }],
        },
        saveToSentItems: false,
      }),
    });

    // Capture Graph request-id for audit logging (available on both success and failure)
    graphResponseId =
      graphRes.headers.get("request-id") ??
      graphRes.headers.get("client-request-id") ??
      graphRes.headers.get("x-ms-request-id") ??
      undefined;

    if (graphRes.ok) {
      sendOk = true;
    } else {
      const text = await graphRes.text();
      plainError = "Email send failed. Verify mailbox and permissions.";
      techError  = `HTTP ${graphRes.status}: ${text.slice(0, 400)}`;
      try {
        const j    = JSON.parse(text);
        const code = j.error?.code;
        const msg  = j.error?.message;
        if (code) techError = `${code}: ${(msg ?? text).slice(0, 300)}`;
      } catch {}
    }
  } catch (err: any) {
    plainError = "Email send failed. Verify mailbox and permissions.";
    techError  = err.message;
  }

  // ── Step 3: Log with sender_profile and graph_response_id ────────────────
  await logTestEmailAttempt({
    calledByUserId,
    senderEmail,
    senderProfile,
    recipientEmail,
    status:         sendOk ? "sent" : "failed",
    message:        sendOk ? `Test email sent successfully from ${senderProfile}` : (plainError ?? "Send failed"),
    technicalError: techError,
    graphResponseId,
  });

  // ── Step 4: Re-run validation so mailSend reflects the actual outcome ─────
  const freshValidation = await validateMicrosoft365EmailIntegration(calledByUserId);

  return {
    ok:          sendOk,
    sentAt:      sendOk ? sentAt : undefined,
    recipientEmail,
    senderEmail:  senderEmail ?? undefined,
    senderProfile,
    message:      sendOk
      ? `Test email sent successfully from ${senderProfile}`
      : plainError,
    error:        sendOk ? undefined : plainError,
    technicalError: sendOk ? undefined : techError,
    validationResult: freshValidation,
  };
}
