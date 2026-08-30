/**
 * When I Work API Service
 *
 * Handles:
 *   - AES-256-GCM encryption/decryption of API tokens
 *   - Live connection test against the WIW API
 *   - CRUD for wiw_api_config table
 */

import * as crypto from "crypto";
import { pool } from "../db";

const ALGORITHM = "aes-256-gcm";
const FALLBACK_KEY = "driverhub-dev-fallback-key-32bytes!"; // 32 bytes dev only

function getEncryptionKey(): Buffer {
  const raw = process.env.DRIVER_DATA_ENCRYPTION_KEY ?? FALLBACK_KEY;
  // Derive a 32-byte key via SHA-256 so any length secret works
  return crypto.createHash("sha256").update(raw).digest();
}

// ── Encryption helpers ─────────────────────────────────────────────────────────

export function encryptToken(plain: string): { encrypted: string; iv: string; tag: string } {
  const key = getEncryptionKey();
  const iv  = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: encrypted.toString("base64"),
    iv:        iv.toString("base64"),
    tag:       tag.toString("base64"),
  };
}

export function decryptToken(encrypted: string, iv: string, tag: string): string {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}

// ── WIW API types ─────────────────────────────────────────────────────────────

export interface WiwConfig {
  id: string;
  orgId: string | null;
  baseUrl: string;
  accountId: string | null;
  connectionStatus: "connected" | "not_connected" | "error";
  lastTestedAt: string | null;
  lastError: string | null;
  lastSyncAt: string | null;
  syncEnabled: boolean;
  syncMode: "manual" | "scheduled" | "webhook+scheduled";
  hasToken: boolean;       // never send the raw token
  hasWebhookSecret: boolean; // never send the raw secret
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface WiwAccountInfo {
  id: number | string;
  name: string;
  company: string | null;
  subdomain: string | null;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

function rowToConfig(row: any): WiwConfig {
  return {
    id:               row.id,
    orgId:            row.org_id ?? null,
    baseUrl:          row.base_url ?? "https://api.wheniwork.com/2",
    accountId:        row.account_id ?? null,
    connectionStatus: row.connection_status ?? "not_connected",
    lastTestedAt:     row.last_tested_at ? new Date(row.last_tested_at).toISOString() : null,
    lastError:        row.last_error ?? null,
    lastSyncAt:       row.last_sync_at ? new Date(row.last_sync_at).toISOString() : null,
    syncEnabled:      row.sync_enabled ?? false,
    syncMode:         row.sync_mode ?? "scheduled",
    hasToken:         !!row.token_encrypted,
    hasWebhookSecret: !!row.webhook_secret,
    createdAt:        row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt:        row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
    createdBy:        row.created_by ?? null,
    updatedBy:        row.updated_by ?? null,
  };
}

// ── Get config (creates a blank row if none exists) ───────────────────────────

export async function getWiwConfig(orgId?: string): Promise<WiwConfig | null> {
  const result = await pool.query(
    `SELECT * FROM wiw_api_config ORDER BY created_at ASC LIMIT 1`
  );
  if (result.rows.length === 0) return null;
  return rowToConfig(result.rows[0]);
}

// ── Save / upsert config ──────────────────────────────────────────────────────

export async function saveWiwConfig(
  opts: {
    token?:      string;
    baseUrl?:    string;
    accountId?:  string;
    syncEnabled?: boolean;
    updatedBy?:  string;
    orgId?:      string;
  }
): Promise<WiwConfig> {
  // Check if a row exists
  const existing = await pool.query(`SELECT id FROM wiw_api_config LIMIT 1`);

  let tokenFields: Record<string, any> = {};
  if (opts.token) {
    const { encrypted, iv, tag } = encryptToken(opts.token);
    tokenFields = {
      token_encrypted: encrypted,
      token_iv:        iv,
      token_tag:       tag,
    };
  }

  if (existing.rows.length === 0) {
    // Insert fresh row
    const { encrypted, iv, tag } = opts.token
      ? encryptToken(opts.token)
      : { encrypted: null, iv: null, tag: null };

    const res = await pool.query(
      `INSERT INTO wiw_api_config
         (org_id, token_encrypted, token_iv, token_tag, base_url, account_id, sync_enabled, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       RETURNING *`,
      [
        opts.orgId   ?? null,
        encrypted,
        iv,
        tag,
        opts.baseUrl    ?? "https://api.wheniwork.com/2",
        opts.accountId  ?? null,
        opts.syncEnabled ?? false,
        opts.updatedBy  ?? null,
      ]
    );
    return rowToConfig(res.rows[0]);
  } else {
    // Update
    const id = existing.rows[0].id;
    const setParts: string[] = ["updated_at = now()", "updated_by = $1"];
    const params: any[] = [opts.updatedBy ?? null];

    function addParam(val: any) { params.push(val); return `$${params.length}`; }

    if (opts.token) {
      const { encrypted, iv, tag } = encryptToken(opts.token);
      setParts.push(`token_encrypted = ${addParam(encrypted)}`);
      setParts.push(`token_iv = ${addParam(iv)}`);
      setParts.push(`token_tag = ${addParam(tag)}`);
      // Reset status when a new token is saved
      setParts.push(`connection_status = ${addParam("not_connected")}`);
      setParts.push(`last_error = NULL`);
    }
    if (opts.baseUrl    !== undefined) setParts.push(`base_url = ${addParam(opts.baseUrl)}`);
    if (opts.accountId  !== undefined) setParts.push(`account_id = ${addParam(opts.accountId)}`);
    if (opts.syncEnabled !== undefined) setParts.push(`sync_enabled = ${addParam(opts.syncEnabled)}`);

    const res = await pool.query(
      `UPDATE wiw_api_config SET ${setParts.join(", ")} WHERE id = ${addParam(id)} RETURNING *`,
      params
    );
    return rowToConfig(res.rows[0]);
  }
}

// ── Save sync mode + webhook secret ──────────────────────────────────────────

export async function saveSyncMode(opts: {
  syncMode?: "manual" | "scheduled" | "webhook+scheduled";
  webhookSecret?: string | null;
  syncEnabled?: boolean;
}): Promise<WiwConfig> {
  const setParts: string[] = ["updated_at = now()"];
  const params: any[] = [];
  const addParam = (v: any) => { params.push(v); return `$${params.length}`; };

  if (opts.syncMode !== undefined)     setParts.push(`sync_mode = ${addParam(opts.syncMode)}`);
  if (opts.webhookSecret !== undefined) setParts.push(`webhook_secret = ${addParam(opts.webhookSecret)}`);
  if (opts.syncEnabled !== undefined)   setParts.push(`sync_enabled = ${addParam(opts.syncEnabled)}`);

  const res = await pool.query(
    `UPDATE wiw_api_config SET ${setParts.join(", ")}
     WHERE id IN (SELECT id FROM wiw_api_config LIMIT 1)
     RETURNING *`
  , params);

  if (!res.rows[0]) throw new Error("No WIW config row found — save token first");
  return rowToConfig(res.rows[0]);
}

// ── Test connection against WIW API ───────────────────────────────────────────

async function loginWithUsernamePassword(baseUrl: string): Promise<string | null> {
  const username = process.env.WHENIWORK_USERNAME;
  const password = process.env.WHENIWORK_PASSWORD;
  const appKey   = process.env.WHENIWORK_API_TOKEN;
  if (!username || !password) return null;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const loginBody: Record<string, string> = { username, password };
  if (appKey) loginBody["key"] = appKey;

  try {
    const res = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers,
      body: JSON.stringify(loginBody),
    });
    const data = await res.json().catch(() => ({}));
    return data?.login?.token ?? null;
  } catch {
    return null;
  }
}

export async function testWiwConnection(tokenOverride?: string): Promise<{
  ok: boolean;
  account?: WiwAccountInfo;
  error?: string;
}> {
  const baseUrl = "https://api.wheniwork.com/2";

  // Resolve token: use override → username/password login → stored encrypted token
  let token = tokenOverride ?? null;
  if (!token) {
    // Try username/password login first
    token = await loginWithUsernamePassword(baseUrl);
  }
  if (!token) {
    const row = await pool.query(
      `SELECT token_encrypted, token_iv, token_tag FROM wiw_api_config LIMIT 1`
    );
    if (!row.rows[0]?.token_encrypted) {
      return { ok: false, error: "No API token or credentials configured." };
    }
    const { token_encrypted, token_iv, token_tag } = row.rows[0];
    try {
      token = decryptToken(token_encrypted, token_iv, token_tag);
    } catch {
      return { ok: false, error: "Failed to decrypt stored API token." };
    }
  }

  // Hit WIW API
  try {
    const response = await fetch(`${baseUrl}/account`, {
      headers: {
        "W-Token": token,
        "Content-Type": "application/json",
      },
    });

    const body = await response.json().catch(() => ({}));

    if (response.ok) {
      // Update stored status → connected
      await pool.query(
        `UPDATE wiw_api_config
           SET connection_status = 'connected', last_tested_at = now(), last_error = NULL
         WHERE id IN (SELECT id FROM wiw_api_config LIMIT 1)`
      );
      return {
        ok: true,
        account: {
          id:        body.account?.id        ?? body.id        ?? "—",
          name:      body.account?.name      ?? body.name      ?? "When I Work",
          company:   body.account?.company   ?? body.company   ?? null,
          subdomain: body.account?.subdomain ?? body.subdomain ?? null,
        },
      };
    } else {
      const errMsg = body?.error ?? body?.message ?? `HTTP ${response.status}`;
      await pool.query(
        `UPDATE wiw_api_config
           SET connection_status = 'error', last_tested_at = now(), last_error = $1
         WHERE id IN (SELECT id FROM wiw_api_config LIMIT 1)`,
        [errMsg]
      );
      return { ok: false, error: errMsg };
    }
  } catch (err: any) {
    const errMsg = err?.message ?? "Network error";
    await pool.query(
      `UPDATE wiw_api_config
         SET connection_status = 'error', last_tested_at = now(), last_error = $1
       WHERE id IN (SELECT id FROM wiw_api_config LIMIT 1)`,
      [errMsg]
    );
    return { ok: false, error: errMsg };
  }
}
