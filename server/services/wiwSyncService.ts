/**
 * WIW Sync Service  (Tickets 4, 5, 8-gap-closure)
 *
 * Pulls data from the When I Work REST API and upserts into canonical tables.
 *
 * Entities synced:
 *  1. Locations   → wiw_locations       (reference data — sync first)
 *  2. Positions   → wiw_positions       (reference data — sync first)
 *  3. Shifts      → wiw_shifts          (FK-resolved after locations/positions)
 *  4. Times       → wiw_times           (FK-resolved after shifts)
 *  5. Absences    → wiw_absences        (from /requests endpoint)
 *  6. Notices     → wiw_attendance_notices (from /attendances endpoint)
 *
 * Deduplication: UNIQUE(external_*_id) + ON CONFLICT DO UPDATE (true upsert)
 * FK resolution:  cache maps built per sync run; shifts need user/location/position maps
 *
 * ── DATA GOVERNANCE (AutoNition Post-Acquisition) ─────────────────────────────
 * AutoNition acquired the business on 2026-02-09 (America/Chicago).
 * ALL WIW data prior to this date belongs to the prior entity and MUST NOT
 * appear in any DriverHub operational table, view, or report.
 *
 * Rules enforced here:
 *  1. Hard date cutoff: WIW_ACQUISITION_CUTOFF_DATE is the mandatory lower bound
 *     for every time-windowed sync (shifts, times, absences, notices).
 *  2. Active-record protection: inactive/deleted WIW users may NOT overwrite an
 *     already-active record's operational status in wiw_users.
 *  3. Driver matching: only active WIW users (wiw_status = 'active') are eligible
 *     for auto-matching to DriverHub drivers — see wiwUserMatcher.ts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * AutoNition acquisition date (America/Chicago local midnight → UTC floor is
 * 2026-02-09T06:00:00Z, but we store and compare YYYY-MM-DD strings so using the
 * calendar date is sufficient for all date-range API calls and SQL comparisons).
 *
 * Exported so other services (driverWeeklyHoursService, routes, etc.) can
 * reference the same canonical constant instead of hard-coding the date.
 */
import { pool } from "../db";
import { decryptToken } from "./wiwApiService";
import { ENV_LOG_PREFIX } from "../config/environment";

export const WIW_ACQUISITION_CUTOFF_DATE = "2026-02-09";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SyncOptions {
  /** YYYY-MM-DD inclusive start. Defaults to 30 days ago. */
  start?: string;
  /** YYYY-MM-DD inclusive end. Defaults to today. */
  end?: string;
  /** ISO timestamp — pass last sync time for incremental runs */
  updatedSince?: string;
  /** No-Show refreshes need current operational users, not deleted history. */
  includeDeletedUsers?: boolean;
}

export interface SyncResult {
  entity: "users" | "locations" | "positions" | "shifts" | "times" | "absences" | "notices" | "all";
  fetched: number;
  inserted: number;
  updated: number;
  errors: number;
  errorMessages: string[];
  syncedAt: string;
  children?: Record<string, SyncResult>;
}

// WIW shift status codes → human label (numeric, used by some WIW API versions / attendance-level statuses)
const SHIFT_STATUS_NUMERIC: Record<number, string> = {
  0: "unpublished",
  1: "published",
  2: "confirmed",
  3: "denied",
  4: "late",
  5: "absent",
  6: "started",
  7: "finished",
};

/**
 * Derive a canonical DriverHub shift status from a raw WIW v2 API shift object.
 *
 * WIW v2 does NOT return a numeric `status` field for most shifts; instead it
 * exposes three boolean/integer flags:
 *   published    (boolean)  – shift has been sent to the driver
 *   alerted      (boolean)  – driver has been notified via the app
 *   acknowledged (0 | 1)    – driver has accepted/confirmed the shift
 *
 * Priority order (highest → lowest):
 *   1. Numeric `status` field — only present for attendance-state shifts
 *      (late, absent, started, finished).  Mapped through SHIFT_STATUS_NUMERIC.
 *   2. acknowledged === 1  → "accepted"
 *   3. alerted === true    → "alerted"   (pending driver response)
 *   4. published === true  → "published" (sent, not yet alerted)
 *   5. published === false → "unpublished"
 */
function deriveShiftStatus(shift: Record<string, unknown>): string {
  // 1. Prefer explicit numeric status for attendance-level states (≥3 maps to
  //    denied / late / absent / started / finished — not derivable from flags).
  if (typeof shift.status === "number") {
    const numMapped = SHIFT_STATUS_NUMERIC[shift.status as number];
    // Status codes 0-2 are superseded by the flag-based derivation below
    // because the flags carry more precise info for those states.
    if (numMapped && (shift.status as number) >= 3) {
      return numMapped;
    }
  }

  // 2-5. Derive from boolean flags (WIW v2 API standard).
  const published    = !!shift.published;
  const alerted      = !!shift.alerted;
  const acknowledged = shift.acknowledged === 1 || shift.acknowledged === true;

  if (!published)    return "unpublished";
  if (acknowledged)  return "accepted";
  if (alerted)       return "alerted";
  return "published";
}

/**
 * Log a warning when an unrecognised raw status value is encountered so that
 * future WIW API changes surface in the server logs immediately.
 */
function logUnknownShiftStatus(shiftId: unknown, rawStatus: unknown): void {
  console.warn(
    `[WIW] Shift ${shiftId}: unrecognised numeric status value ${rawStatus}. ` +
    `Status derived from published/alerted/acknowledged flags instead. ` +
    `Update SHIFT_STATUS_NUMERIC if this is a new WIW status code.`
  );
}

// ── Credentials ───────────────────────────────────────────────────────────────

/**
 * One context per WIW workplace/account.
 * W-UserId is Will's account-specific user ID for that workplace —
 * it tells the WIW API v2 which account context to operate in.
 * Without it, every request defaults to the primary account (3725440).
 */
interface WiwAccountContext {
  token: string;
  wUserId: string;   // Will's account-specific user ID → W-UserId header
  accountId: number; // WIW account / workplace ID (for tagging synced records)
  baseUrl: string;
}

// Cached session token + per-account contexts from the login response users array
let _cachedToken: string | null = null;
let _cachedContexts: WiwAccountContext[] = [];
let _contextExpiry: Date | null = null;

const WIW_BASE_URL = "https://api.wheniwork.com/2";

/**
 * Login with username/password. The WIW login response contains a top-level
 * `users` array — one entry per workplace the user belongs to, each carrying
 * a distinct `id` (account-specific user ID) and `account_id`.
 * We cache these as WiwAccountContext objects and use them to switch context
 * on every subsequent API request via the W-UserId header.
 */
async function loginAndBuildContexts(): Promise<WiwAccountContext[]> {
  const username = process.env.WHENIWORK_USERNAME;
  const password = process.env.WHENIWORK_PASSWORD;
  const appKey   = process.env.WHENIWORK_API_TOKEN;

  if (!username || !password) {
    throw new Error("WHENIWORK_USERNAME and WHENIWORK_PASSWORD are required for login");
  }

  const body: Record<string, string> = { username, password };
  if (appKey) body["key"] = appKey;

  const res = await fetch(`${WIW_BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data?.login?.token) {
    const msg = data?.error ?? `HTTP ${res.status}`;
    throw new Error(`WIW login failed: ${msg}`);
  }

  const token: string = data.login.token;

  // Build one context per workplace from the top-level `users` array.
  // Each entry has: { id: <account-specific user ID>, account_id: <workplace ID> }
  const perAccountUsers: Array<{ id: number; account_id: number }> = data.users ?? [];
  let contexts: WiwAccountContext[] = perAccountUsers
    .filter(u => u.id && u.account_id)
    .map(u => ({
      token,
      wUserId: String(u.id),
      accountId: u.account_id,
      baseUrl: WIW_BASE_URL,
    }));

  // Fall back: if login response has no `users` array (e.g., older API key flow),
  // create a single context with no W-UserId (default account behaviour).
  if (contexts.length === 0) {
    contexts = [{ token, wUserId: "", accountId: 0, baseUrl: WIW_BASE_URL }];
  }

  _cachedToken    = token;
  _cachedContexts = contexts;
  _contextExpiry  = new Date(Date.now() + 23 * 60 * 60 * 1000); // 23 h

  console.log(
    `[WIW] Login ok — ${contexts.length} workplace context(s): ` +
    contexts.map(c => `${c.accountId}(uid:${c.wUserId})`).join(", ")
  );
  return contexts;
}

/**
 * Returns all account contexts.
 * Uses cached contexts if still valid; re-authenticates otherwise.
 * Falls back to a single encrypted-token context if no env credentials.
 */
async function getAllAccountContexts(): Promise<WiwAccountContext[]> {
  // 1. Serve from cache if still fresh
  if (_cachedContexts.length > 0 && _contextExpiry && _contextExpiry > new Date()) {
    return _cachedContexts;
  }

  // 2. Try username/password login
  const username = process.env.WHENIWORK_USERNAME;
  const password = process.env.WHENIWORK_PASSWORD;
  if (username && password) {
    try {
      return await loginAndBuildContexts();
    } catch (loginErr: any) {
      console.warn("[WIW] Login attempt failed:", loginErr.message);
    }
  }

  // 3. Fall back to stored encrypted token (single context, no W-UserId)
  const row = await pool.query(
    `SELECT token_encrypted, token_iv, token_tag, base_url FROM wiw_api_config LIMIT 1`
  );
  if (!row.rows[0]?.token_encrypted) {
    throw new Error("No WIW credentials available. Configure username/password or save an API token in Connected Apps.");
  }
  const { token_encrypted, token_iv, token_tag, base_url } = row.rows[0];
  const token = decryptToken(token_encrypted, token_iv, token_tag);
  return [{ token, wUserId: "", accountId: 0, baseUrl: base_url ?? WIW_BASE_URL }];
}

async function wiwApiFetch(
  ctx: WiwAccountContext,
  path: string,
  params: Record<string, string> = {}
): Promise<any> {
  const url = new URL(`${ctx.baseUrl}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const headers: Record<string, string> = {
    "W-Token": ctx.token,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  if (ctx.wUserId) headers["W-UserId"] = ctx.wUserId;

  const res = await fetch(url.toString(), { headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error ?? body?.message ?? `HTTP ${res.status}`;
    // Invalidate cached contexts on 401 so next call re-authenticates
    if (res.status === 401) {
      _cachedToken    = null;
      _cachedContexts = [];
      _contextExpiry  = null;
    }
    throw new Error(`WIW API error (${path}) [acct ${ctx.accountId}]: ${msg}`);
  }

  return res.json();
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function buildDateWindow(opts: SyncOptions): { start: string; end: string } {
  const now = new Date();
  // Look 2 weeks ahead so upcoming shifts are always captured
  const defaultEnd = new Date(now);
  defaultEnd.setDate(defaultEnd.getDate() + 14);
  const end = opts.end ?? defaultEnd.toISOString().split("T")[0];
  const defaultStart = new Date(now);
  defaultStart.setDate(defaultStart.getDate() - 30);
  const rawStart = opts.start ?? defaultStart.toISOString().split("T")[0];
  // Data Governance Rule 1: enforce acquisition date as hard floor.
  // Even if a caller explicitly passes an earlier start, we clamp it.
  const start = rawStart < WIW_ACQUISITION_CUTOFF_DATE ? WIW_ACQUISITION_CUTOFF_DATE : rawStart;
  if (rawStart < WIW_ACQUISITION_CUTOFF_DATE) {
    console.warn(
      `[WIW][Governance] Requested start ${rawStart} is before acquisition cutoff ` +
      `${WIW_ACQUISITION_CUTOFF_DATE}. Clamped to cutoff date.`
    );
  }
  return { start, end };
}

function parseWiwDate(val: string | null | undefined): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Extract the LOCAL calendar date (YYYY-MM-DD) from a WIW timestamp string
 * WITHOUT converting through UTC.
 *
 * WIW sends RFC 2822 timestamps like "Fri, 19 Jun 2026 23:59:59 -0400".
 * Using Date.toISOString() converts to UTC first, which shifts "23:59:59 -0400"
 * to the NEXT day (00:59:59 UTC next day). This function reads the date portion
 * directly from the raw string so the local calendar date is preserved.
 *
 * Falls back to UTC-based extraction if the string format is unrecognised.
 */
function extractWiwLocalDate(rawVal: string | null | undefined, fallback: Date): string {
  if (rawVal) {
    const m = rawVal.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/i);
    if (m) {
      const monthMap: Record<string, string> = {
        jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
        jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
      };
      const month = monthMap[m[2].toLowerCase()];
      if (month) return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
    }
  }
  return fallback.toISOString().split("T")[0];
}

/**
 * DEPRECATED — DO NOT USE.
 *
 * This function was built on a faulty premise: it stripped the WIW timezone
 * offset and re-interpreted the wall-clock value in the account's local
 * timezone.  In practice, WIW correctly encodes UTC via the offset in its
 * timestamps (e.g. "10:00:00 -0400" for a 7 AM PDT shift).  Stripping that
 * offset and re-interpreting "10:00" as LA local time introduced a 3-hour
 * forward error for Pacific accounts.
 *
 * Use parseWiwDate() instead — it calls new Date(val) which correctly
 * respects the original WIW offset and produces the true UTC.
 *
 * @deprecated Use parseWiwDate directly.
 */
function parseWiwDateAsAccountLocal(
  val: string | null | undefined,
  _accountTimezone: string | null,
): Date | null {
  return parseWiwDate(val);
}

/** Loads a driverhub_account_id → IANA timezone map from the customers table. */
async function buildAccountTimezoneMap(accountIds: string[]): Promise<Map<string, string>> {
  if (accountIds.length === 0) return new Map();
  const ids = [...new Set(accountIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const rows = await pool.query(
    `SELECT id, timezone FROM customers WHERE id = ANY($1::text[]) AND timezone IS NOT NULL`,
    [ids],
  );
  return new Map(rows.rows.map((r: any) => [r.id, r.timezone as string]));
}

// ── FK resolution helpers ─────────────────────────────────────────────────────

async function buildUserIdMap(externalIds: string[]): Promise<Map<string, string>> {
  if (externalIds.length === 0) return new Map();
  const ids = [...new Set(externalIds)];
  const rows = await pool.query(
    `SELECT id, external_user_id FROM wiw_users WHERE external_user_id = ANY($1::text[])`,
    [ids]
  );
  return new Map(rows.rows.map((r) => [r.external_user_id, r.id]));
}

async function buildShiftIdMap(externalIds: string[]): Promise<Map<string, string>> {
  if (externalIds.length === 0) return new Map();
  const ids = [...new Set(externalIds)];
  const rows = await pool.query(
    `SELECT id, external_shift_id FROM wiw_shifts WHERE external_shift_id = ANY($1::text[])`,
    [ids]
  );
  return new Map(rows.rows.map((r) => [r.external_shift_id, r.id]));
}

interface ShiftAccountCtx { accountId: string | null; locationId: string | null; mapStatus: string; }
/** Returns a Map of (wiw_shifts.id → account context) for resolving time records. */
async function buildShiftAccountContextMap(internalShiftIds: string[]): Promise<Map<string, ShiftAccountCtx>> {
  if (internalShiftIds.length === 0) return new Map();
  const ids = [...new Set(internalShiftIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const rows = await pool.query(
    `SELECT id, driverhub_account_id, wiw_location_id, mapping_status
     FROM wiw_shifts WHERE id = ANY($1::text[])`,
    [ids]
  );
  return new Map(rows.rows.map((r) => [r.id, {
    accountId:  r.driverhub_account_id ?? null,
    locationId: r.wiw_location_id ?? null,
    mapStatus:  r.mapping_status ?? "unmapped",
  }]));
}

async function buildLocationIdMap(externalIds: string[]): Promise<Map<string, string>> {
  if (externalIds.length === 0) return new Map();
  const ids = [...new Set(externalIds)];
  const rows = await pool.query(
    `SELECT id, external_location_id FROM wiw_locations WHERE external_location_id = ANY($1::text[])`,
    [ids]
  );
  return new Map(rows.rows.map((r) => [r.external_location_id, r.id]));
}

/** Returns the authoritative account assignment for each canonical WIW location. */
async function buildLocationAccountMap(internalLocationIds: string[]): Promise<Map<string, string | null>> {
  if (internalLocationIds.length === 0) return new Map();
  const ids = [...new Set(internalLocationIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const rows = await pool.query(
    `SELECT id, account_id
     FROM wiw_locations
     WHERE id = ANY($1::text[])`,
    [ids]
  );
  return new Map(rows.rows.map((r) => [r.id, r.account_id ?? null]));
}

async function buildPositionIdMap(externalIds: string[]): Promise<Map<string, string>> {
  if (externalIds.length === 0) return new Map();
  const ids = [...new Set(externalIds)];
  const rows = await pool.query(
    `SELECT id, external_position_id FROM wiw_positions WHERE external_position_id = ANY($1::text[])`,
    [ids]
  );
  return new Map(rows.rows.map((r) => [r.external_position_id, r.id]));
}

function touchLastSync(): void {
  pool.query(
    `UPDATE wiw_api_config SET last_sync_at = now() WHERE id IN (SELECT id FROM wiw_api_config LIMIT 1)`
  ).catch(() => { /* non-fatal */ });
}

// ── Sync run tracking ──────────────────────────────────────────────────────────

/** Create a 'running' row in wiw_sync_runs and return its id. */
async function startSyncRun(
  entity: string,
  triggerType: string,
  updatedSince: Date | null
): Promise<string> {
  const res = await pool.query(
    `INSERT INTO wiw_sync_runs (entity, trigger_type, status, started_at, updated_since)
     VALUES ($1, $2, 'running', now(), $3)
     RETURNING id`,
    [entity, triggerType, updatedSince]
  );
  return res.rows[0].id as string;
}

/** Mark a run row as succeeded with final stats. */
async function finishSyncRun(runId: string, result: SyncResult): Promise<void> {
  const deleted = (result as ReconcileResult).deleted ?? 0;
  await pool.query(
    `UPDATE wiw_sync_runs
     SET status = 'success', completed_at = now(),
         fetched = $2, inserted = $3, updated = $4, errors = $5,
         deleted = $6,
         error_message = $7
     WHERE id = $1`,
    [runId, result.fetched, result.inserted, result.updated, result.errors, deleted,
     result.errorMessages.length ? result.errorMessages.join("; ") : null]
  ).catch(() => { /* non-fatal — don't let tracking failure break the sync */ });
}

/** Mark a run row as errored. */
async function failSyncRun(runId: string, message: string): Promise<void> {
  await pool.query(
    `UPDATE wiw_sync_runs
     SET status = 'error', completed_at = now(), error_message = $2
     WHERE id = $1`,
    [runId, message]
  ).catch(() => { /* non-fatal */ });
}

/**
 * Returns the completed_at timestamp from the most recent successful run for
 * the given entity — to be used as updatedSince for the next incremental pull.
 * Returns null if no successful run exists (triggers full pull).
 */
export async function getLastCursorForEntity(entity: string): Promise<Date | null> {
  const res = await pool.query(
    `SELECT completed_at FROM wiw_sync_runs
     WHERE entity = $1 AND status = 'success'
     ORDER BY completed_at DESC LIMIT 1`,
    [entity]
  );
  return res.rows[0]?.completed_at ? new Date(res.rows[0].completed_at) : null;
}

/**
 * Returns the most recent sync run row per entity for the UI summary table.
 */
export async function getEntitySyncStatus(): Promise<Record<string, any>> {
  const entities = ["users", "locations", "positions", "shifts", "times", "absences", "notices"];
  const res = await pool.query(`
    SELECT DISTINCT ON (entity)
      entity, trigger_type, status, started_at, completed_at,
      fetched, inserted, updated, errors, error_message, updated_since
    FROM wiw_sync_runs
    ORDER BY entity, started_at DESC
  `);
  const byEntity: Record<string, any> = {};
  for (const e of entities) byEntity[e] = null;
  for (const row of res.rows) byEntity[row.entity] = row;
  return byEntity;
}

/**
 * Unified dispatcher — runs the right sync function for an entity, with full
 * run tracking and automatic incremental cursor from the last successful run.
 *
 * triggerType: 'scheduled' | 'manual' | 'webhook_backfill'
 */
export async function runEntitySync(
  entity: SyncResult["entity"],
  triggerType: "scheduled" | "manual" | "webhook_backfill",
  overrideOpts?: SyncOptions
): Promise<SyncResult> {
  // For non-ref entities, use last successful run as incremental cursor
  const cursorEntities = ["shifts", "times", "absences", "notices"];
  let cursor: Date | null = null;
  if (cursorEntities.includes(entity) && !overrideOpts?.updatedSince) {
    cursor = await getLastCursorForEntity(entity);
  }

  const opts: SyncOptions = {
    ...overrideOpts,
    updatedSince: overrideOpts?.updatedSince ?? (cursor ? cursor.toISOString() : undefined),
  };

  const runId = await startSyncRun(entity, triggerType, cursor);
  try {
    let result: SyncResult;
    switch (entity) {
      case "users":     result = await syncUsers({ includeDeleted: overrideOpts?.includeDeletedUsers }); break;
      case "locations": result = await syncLocations();      break;
      case "positions": result = await syncPositions();      break;
      case "shifts":    result = await reconcileShifts(opts); break;
      case "times":     result = await syncTimes(opts);      break;
      case "absences":  result = await syncAbsences(opts);   break;
      case "notices":   result = await syncNotices(opts);    break;
      default:          result = await syncAll(opts);        break;
    }
    await finishSyncRun(runId, result);

    // Attendance system-of-record hook: after any shifts/times/absences/notices
    // sync, re-derive attendance records + metrics for the affected drivers so
    // DriverConnect sees updates without requiring a manual sync step.
    if (cursorEntities.includes(entity)) {
      triggerAttendanceRederivation(
        entity as "shifts" | "times" | "absences" | "notices",
        opts.updatedSince
      ).catch((err) =>
        console.error(`[WIW Sync] Attendance rederivation failed for ${entity}:`, err)
      );
    }

    return result;
  } catch (err: any) {
    await failSyncRun(runId, err?.message ?? "Unknown error");
    throw err;
  }
}

/**
 * Fire-and-forget: after an incremental WIW sync touches shifts/times/absences
 * /notices, resolve the affected drivers and re-derive their attendance
 * records + metrics. Never blocks the sync itself and never throws upward.
 */
async function triggerAttendanceRederivation(
  entity: "shifts" | "times" | "absences" | "notices",
  updatedSince?: string
): Promise<void> {
  const { resolveDriverIdsForEntity, deriveAttendanceRecords } = await import(
    "./attendanceRecordService"
  );
  const { computeMetricsForDrivers } = await import("./attendanceMetricsService");

  // Widen the lookback slightly to be safe (rows may have been updated just
  // before the cursor timestamp was captured).
  const since = updatedSince
    ? new Date(new Date(updatedSince).getTime() - 5 * 60 * 1000).toISOString()
    : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const driverIds = await resolveDriverIdsForEntity(entity, since);
  if (driverIds.length === 0) return;

  await deriveAttendanceRecords({ driverIds, sinceDate: since.slice(0, 10) });
  await computeMetricsForDrivers(driverIds);
}

// ── 0. Sync Users ─────────────────────────────────────────────────────────────
// Must run first — all other entities FK into wiw_users.
//
// Post-Acquisition Governance (2026-02-09):
//  Rule 1 — Only active (is_active=true, is_deleted=false) WIW users are valid
//            for operational use. Inactive/deleted records are synced for history
//            but logged to wiw_sync_audit and never used for driver matching.
//  Rule 2 — Active-record protection: an inactive/deleted incoming record may NOT
//            downgrade an already-active wiw_users row.
//  Rule 3 — Duplicate suppression: if multiple WIW users share the same email
//            address, only the active one is the canonical record. All other
//            (inactive/deleted) records sharing that email are logged as duplicates.

/** Write a row to wiw_sync_audit without throwing (fire-and-forget). */
async function logSyncAudit(params: {
  syncRunId?: string | null;
  accountId: number | null;
  externalUserId: string;
  name: string;
  email: string | null;
  wiwStatus: string;
  reason: "inactive" | "deleted" | "duplicate" | "pre_cutoff";
  primaryExternalUserId?: string | null;
  notes?: string | null;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO wiw_sync_audit
         (sync_run_id, account_id, external_user_id, name, email, wiw_status,
          reason, primary_external_user_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        params.syncRunId ?? null,
        params.accountId,
        params.externalUserId,
        params.name,
        params.email,
        params.wiwStatus,
        params.reason,
        params.primaryExternalUserId ?? null,
        params.notes ?? null,
      ]
    );
  } catch (e: any) {
    console.warn(`[WIW] Failed to write sync audit for ${params.externalUserId}: ${e?.message}`);
  }
}

export async function syncUsers(options: { includeDeleted?: boolean } = {}): Promise<SyncResult> {
  const syncedAt = new Date().toISOString();
  const result: SyncResult = { entity: "users", fetched: 0, inserted: 0, updated: 0, errors: 0, errorMessages: [], syncedAt };

  try {
    const contexts = await getAllAccountContexts();

    for (const ctx of contexts) {
      try {
        // The standard reference sync includes deleted history. The targeted
        // No-Show refresh only requests current operational WIW users.
        // We upsert returned users with strict
        // governance rules: inactive/deleted are logged to audit and excluded
        // from driver matching; duplicates sharing an email are suppressed.
        const body = await wiwApiFetch(ctx, "/users", {
          show_deleted: options.includeDeleted === false ? "false" : "true",
        });
        const allUsers: any[] = body.users ?? [];
        result.fetched += allUsers.length;

        const accountId = ctx.accountId || null;

        // ── Classify every user ──────────────────────────────────────────────
        type ClassifiedUser = {
          raw: any;
          extUserId: string;
          name: string;
          email: string | null;
          phone: string | null;
          employeeCode: string | null;
          isDeleted: boolean;
          isActive: boolean;
          wiwStatus: string;
        };

        const classified: ClassifiedUser[] = allUsers.map((u: any) => {
          const extUserId    = String(u.id);
          const firstName    = (u.first_name ?? "").trim();
          const lastName     = (u.last_name  ?? "").trim();
          const name         = [firstName, lastName].filter(Boolean).join(" ") || `User-${extUserId}`;
          const email        = u.email         ? String(u.email).toLowerCase().trim() : null;
          const phone        = u.phone_number  ? String(u.phone_number).trim()         : null;
          const employeeCode = u.employee_code ? String(u.employee_code).trim()        : null;
          const isDeleted    = u.is_deleted === true || u.is_deleted === 1;
          const isActive     = !isDeleted && (u.is_active === true || u.is_active === 1);
          const wiwStatus    = isDeleted ? "deleted" : isActive ? "active" : "inactive";
          return { raw: u, extUserId, name, email, phone, employeeCode, isDeleted, isActive, wiwStatus };
        });

        const activeCnt  = classified.filter(c =>  c.isActive).length;
        const inactiveCnt = classified.filter(c => !c.isActive && !c.isDeleted).length;
        const deletedCnt  = classified.filter(c =>  c.isDeleted).length;
        console.log(`[WIW] syncUsers acct ${accountId}: ${allUsers.length} total (${activeCnt} active, ${inactiveCnt} inactive, ${deletedCnt} deleted)`);

        // ── Duplicate detection (email-based) ────────────────────────────────
        // For each email that appears in multiple ACTIVE records, pick the
        // canonical one (lowest external_user_id as stable tiebreak) and mark
        // the rest as suppressed duplicates. Inactive/deleted records sharing
        // the same email as an active user are also logged as duplicates.
        const emailToActive = new Map<string, ClassifiedUser>();   // email → canonical active user
        const suppressedIds = new Set<string>();                   // external_user_ids to suppress

        // First pass: assign canonical active record per email
        for (const c of classified) {
          if (!c.isActive || !c.email) continue;
          const existing = emailToActive.get(c.email);
          if (!existing) {
            emailToActive.set(c.email, c);
          } else {
            // Keep the lower external_user_id as the stable canonical record
            if (c.extUserId < existing.extUserId) {
              suppressedIds.add(existing.extUserId);
              emailToActive.set(c.email, c);
            } else {
              suppressedIds.add(c.extUserId);
            }
          }
        }

        // Second pass: inactive/deleted records sharing an email with an active record = duplicate
        for (const c of classified) {
          if (c.isActive) continue;
          if (c.email && emailToActive.has(c.email)) {
            suppressedIds.add(c.extUserId);
          }
        }

        // ── Per-user upsert + audit ──────────────────────────────────────────
        for (const c of classified) {
          try {
            const { extUserId, name, email, phone, employeeCode, isActive, isDeleted, wiwStatus } = c;

            // Rule 3: Suppress detected duplicates (still upsert for history, but log)
            if (suppressedIds.has(extUserId)) {
              const primaryEmailMatch = email ? emailToActive.get(email) : undefined;
              await logSyncAudit({
                accountId,
                externalUserId: extUserId,
                name,
                email,
                wiwStatus,
                reason: "duplicate",
                primaryExternalUserId: primaryEmailMatch?.extUserId ?? null,
                notes: `Duplicate record suppressed. Canonical active record: ${primaryEmailMatch?.extUserId ?? "none"}`,
              });
              // Fall through to upsert so the record is preserved in wiw_users history
              // but is_active will be forced false for suppressed duplicates
            } else if (!isActive) {
              // Rule 1: Log inactive/deleted non-duplicates to audit
              await logSyncAudit({
                accountId,
                externalUserId: extUserId,
                name,
                email,
                wiwStatus,
                reason: isDeleted ? "deleted" : "inactive",
                notes: `User excluded from operational dataset: ${wiwStatus}`,
              });
            }

            // Determine effective is_active for upsert:
            // Suppressed duplicates are stored as inactive regardless of API value
            const effectiveIsActive = suppressedIds.has(extUserId) ? false : isActive;
            const effectiveStatus   = suppressedIds.has(extUserId) ? "inactive" : wiwStatus;

            // Data Governance Rule 2: Protect active records.
            // If the existing row is active and the incoming data would downgrade it,
            // keep the existing active flags so the record stays visible in ops.
            const upsertRes = await pool.query(
              `INSERT INTO wiw_users (
                 external_user_id, name, email, phone, employee_code, is_active,
                 wiw_status, wiw_account_id, synced_at, updated_at
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),now())
               ON CONFLICT (external_user_id) DO UPDATE SET
                 name           = EXCLUDED.name,
                 email          = EXCLUDED.email,
                 phone          = EXCLUDED.phone,
                 employee_code  = EXCLUDED.employee_code,
                 is_active      = CASE
                                    WHEN wiw_users.is_active = true
                                     AND wiw_users.wiw_status = 'active'
                                     AND EXCLUDED.wiw_status IN ('inactive','deleted')
                                    THEN true
                                    ELSE EXCLUDED.is_active
                                  END,
                 wiw_status     = CASE
                                    WHEN wiw_users.is_active = true
                                     AND wiw_users.wiw_status = 'active'
                                     AND EXCLUDED.wiw_status IN ('inactive','deleted')
                                    THEN 'active'
                                    ELSE EXCLUDED.wiw_status
                                  END,
                 wiw_account_id = EXCLUDED.wiw_account_id,
                 synced_at      = now(),
                 updated_at     = now()
               RETURNING (xmax = 0) AS inserted`,
              [extUserId, name, email, phone, employeeCode, effectiveIsActive, effectiveStatus, accountId]
            );

            if (upsertRes.rows[0]?.inserted === true) result.inserted++;
            else result.updated++;
          } catch (err: any) {
            result.errors++;
            result.errorMessages.push(`User ${c.extUserId} [acct ${accountId}]: ${err?.message ?? "unknown"}`);
          }
        }
      } catch (ctxErr: any) {
        result.errors++;
        result.errorMessages.push(`Account ${ctx.accountId} users: ${ctxErr?.message ?? "unknown"}`);
      }
    }

    // ── Auto-match newly synced users to DriverHub drivers ───────────────────
    // Run after every user sync so newly added WIW users are immediately linked
    // to drivers without requiring a manual admin trigger.
    try {
      const { autoMatchWiwUsers } = await import("./wiwUserMatcher");
      const matchResult = await autoMatchWiwUsers();
      console.log(`[WIW] syncUsers: auto-match completed — matched: ${matchResult.matched}, unmatched: ${matchResult.unmatched}, ambiguous: ${matchResult.ambiguous}`);
    } catch (matchErr: any) {
      console.warn(`[WIW] syncUsers: auto-match failed (non-fatal): ${matchErr?.message}`);
    }

    // ── Update driver WIW fields ─────────────────────────────────────────────
    // After all accounts are synced (and auto-match has run), propagate the
    // canonical WIW user back to the matched driver row.
    try {
      // Set synced on drivers that have an active WIW user matched to them
      await pool.query(`
        UPDATE drivers d
        SET wiw_user_id      = wu.id,
            wiw_email        = wu.email,
            wiw_workplace_id = wu.wiw_account_id::text,
            wiw_sync_status  = 'synced',
            wiw_last_seen_at = now()
        FROM wiw_users wu
        WHERE wu.driver_id    = d.id
          AND wu.is_active    = true
          AND wu.wiw_status   = 'active'
      `);

      // Reset drivers whose previously-matched WIW user is no longer active
      await pool.query(`
        UPDATE drivers d
        SET wiw_sync_status = 'unmatched',
            wiw_last_seen_at = now()
        WHERE d.wiw_sync_status = 'synced'
          AND NOT EXISTS (
            SELECT 1 FROM wiw_users wu
            WHERE wu.driver_id  = d.id
              AND wu.is_active  = true
              AND wu.wiw_status = 'active'
          )
      `);

      console.log("[WIW] syncUsers: driver WIW fields updated");
    } catch (driverErr: any) {
      console.warn(`[WIW] syncUsers driver field update failed: ${driverErr?.message}`);
    }
  } catch (err: any) {
    result.errors++;
    result.errorMessages.push(err?.message ?? "Users sync failed");
  }

  touchLastSync();
  return result;
}

// ── 1. Sync Locations ─────────────────────────────────────────────────────────

/** IANA timezone by US state code.
 *  Covers all 50 states using the dominant timezone for each.
 *  Edge cases (Indiana county splits, etc.) are acceptable; the admin
 *  can override per location in the WIW Governance Console. */
const US_STATE_TIMEZONE: Record<string, string> = {
  AL: "America/Chicago",    AK: "America/Anchorage",  AZ: "America/Phoenix",
  AR: "America/Chicago",    CA: "America/Los_Angeles", CO: "America/Denver",
  CT: "America/New_York",   DE: "America/New_York",   FL: "America/New_York",
  GA: "America/New_York",   HI: "Pacific/Honolulu",   ID: "America/Boise",
  IL: "America/Chicago",    IN: "America/Indiana/Indianapolis", IA: "America/Chicago",
  KS: "America/Chicago",    KY: "America/Kentucky/Louisville", LA: "America/Chicago",
  ME: "America/New_York",   MD: "America/New_York",   MA: "America/New_York",
  MI: "America/Detroit",    MN: "America/Chicago",    MS: "America/Chicago",
  MO: "America/Chicago",    MT: "America/Denver",     NE: "America/Chicago",
  NV: "America/Los_Angeles", NH: "America/New_York",  NJ: "America/New_York",
  NM: "America/Denver",     NY: "America/New_York",   NC: "America/New_York",
  ND: "America/Chicago",    OH: "America/New_York",   OK: "America/Chicago",
  OR: "America/Los_Angeles", PA: "America/New_York",  RI: "America/New_York",
  SC: "America/New_York",   SD: "America/Chicago",    TN: "America/Chicago",
  TX: "America/Chicago",    UT: "America/Denver",     VT: "America/New_York",
  VA: "America/New_York",   WA: "America/Los_Angeles", WV: "America/New_York",
  WI: "America/Chicago",    WY: "America/Denver",     DC: "America/New_York",
};

export async function syncLocations(): Promise<SyncResult> {
  const syncedAt = new Date().toISOString();
  const result: SyncResult = { entity: "locations", fetched: 0, inserted: 0, updated: 0, errors: 0, errorMessages: [], syncedAt };

  try {
    const contexts = await getAllAccountContexts();

    for (const ctx of contexts) {
      try {
        const body = await wiwApiFetch(ctx, "/locations");
        const locations: any[] = body.locations ?? [];
        result.fetched += locations.length;

        const accountId = ctx.accountId || null;

        for (const loc of locations) {
          try {
            const extLocId = String(loc.id);
            const name     = loc.name     ?? "Unknown Location";
            const address  = loc.address  ?? null;
            // WhenIWork API v2 does NOT include a timezone field in the location object.
            // We derive the IANA timezone from the state code in loc.place.region.
            const stateCode: string | undefined = loc.place?.region;
            const timezone: string | null = stateCode ? US_STATE_TIMEZONE[stateCode] ?? null : null;

            const upsertRes = await pool.query(
              `INSERT INTO wiw_locations (external_location_id, name, address, timezone, wiw_account_id, synced_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, now(), now())
               ON CONFLICT (external_location_id) DO UPDATE SET
                 name           = EXCLUDED.name,
                 address        = EXCLUDED.address,
                 timezone       = EXCLUDED.timezone,
                 wiw_account_id = EXCLUDED.wiw_account_id,
                 synced_at      = now(),
                 updated_at     = now()
               RETURNING (xmax = 0) AS inserted`,
              [extLocId, name, address, timezone, accountId]
            );
            if (upsertRes.rows[0]?.inserted === true) result.inserted++;
            else result.updated++;
          } catch (err: any) {
            result.errors++;
            result.errorMessages.push(`Location ${loc.id} [acct ${accountId}]: ${err?.message ?? "unknown"}`);
          }
        }
      } catch (ctxErr: any) {
        result.errors++;
        result.errorMessages.push(`Account ${ctx.accountId} locations: ${ctxErr?.message ?? "unknown"}`);
      }
    }
  } catch (err: any) {
    result.errors++;
    result.errorMessages.push(err?.message ?? "Locations sync failed");
  }

  // After syncing locations, run auto-match to populate wiw_location_account_map
  try {
    const { autoMatchWiwLocations } = await import("./wiwLocationMatcher");
    await autoMatchWiwLocations({ dryRun: false, onlyUnmapped: false });
  } catch (matchErr: any) {
    console.warn("[WIW] syncLocations auto-match warning:", matchErr?.message);
  }

  touchLastSync();
  return result;
}

// ── 2. Sync Positions ─────────────────────────────────────────────────────────

export async function syncPositions(): Promise<SyncResult> {
  const syncedAt = new Date().toISOString();
  const result: SyncResult = { entity: "positions", fetched: 0, inserted: 0, updated: 0, errors: 0, errorMessages: [], syncedAt };

  try {
    const contexts = await getAllAccountContexts();

    for (const ctx of contexts) {
      try {
        const body = await wiwApiFetch(ctx, "/positions");
        const positions: any[] = body.positions ?? [];
        result.fetched += positions.length;

        const accountId = ctx.accountId || null;

        for (const pos of positions) {
          try {
            const extPosId = String(pos.id);
            const name     = pos.name ?? "Unknown Position";

            const upsertRes = await pool.query(
              `INSERT INTO wiw_positions (external_position_id, name, wiw_account_id, synced_at, updated_at)
               VALUES ($1, $2, $3, now(), now())
               ON CONFLICT (external_position_id) DO UPDATE SET
                 name           = EXCLUDED.name,
                 wiw_account_id = EXCLUDED.wiw_account_id,
                 synced_at      = now(),
                 updated_at     = now()
               RETURNING (xmax = 0) AS inserted`,
              [extPosId, name, accountId]
            );
            if (upsertRes.rows[0]?.inserted === true) result.inserted++;
            else result.updated++;
          } catch (err: any) {
            result.errors++;
            result.errorMessages.push(`Position ${pos.id} [acct ${accountId}]: ${err?.message ?? "unknown"}`);
          }
        }
      } catch (ctxErr: any) {
        result.errors++;
        result.errorMessages.push(`Account ${ctx.accountId} positions: ${ctxErr?.message ?? "unknown"}`);
      }
    }
  } catch (err: any) {
    result.errors++;
    result.errorMessages.push(err?.message ?? "Positions sync failed");
  }

  touchLastSync();
  return result;
}

// ── 3. Sync Shifts ────────────────────────────────────────────────────────────

export async function syncShifts(opts: SyncOptions = {}): Promise<SyncResult> {
  const syncedAt = new Date().toISOString();
  const result: SyncResult = { entity: "shifts", fetched: 0, inserted: 0, updated: 0, errors: 0, errorMessages: [], syncedAt };

  try {
    const contexts = await getAllAccountContexts();
    const { start, end } = buildDateWindow(opts);

    for (const ctx of contexts) {
      try {
        const params: Record<string, string> = { start, end, include_open: "1", deleted: "0" };
        if (opts.updatedSince) params.updated_since = opts.updatedSince;

        const body = await wiwApiFetch(ctx, "/shifts", params);
        const shifts: any[] = body.shifts ?? [];
        result.fetched += shifts.length;

        if (shifts.length === 0) continue;

        const accountId = ctx.accountId || null;

        // Build all FK maps in parallel for this account's batch
        const externalUserIds = shifts.map(s => String(s.user_id)).filter(Boolean);
        const externalLocIds  = shifts.map(s => s.location_id ? String(s.location_id) : null).filter((v): v is string => v !== null);
        const externalPosIds  = shifts.map(s => s.position_id ? String(s.position_id) : null).filter((v): v is string => v !== null);

        const [userIdMap, locationIdMap, positionIdMap] = await Promise.all([
          buildUserIdMap(externalUserIds),
          buildLocationIdMap(externalLocIds),
          buildPositionIdMap(externalPosIds),
        ]);

        // Build location → account map for resolved driverhub_account_id
        const internalLocIds = externalLocIds.map(extId => locationIdMap.get(extId)).filter((v): v is string => !!v);
        const locationAcctMap = await buildLocationAccountMap(internalLocIds);

        for (const shift of shifts) {
          try {
            const extShiftId = String(shift.id);
            const extUserId  = shift.user_id    ? String(shift.user_id)    : null;
            const extLocId   = shift.location_id ? String(shift.location_id) : null;
            const extPosId   = shift.position_id ? String(shift.position_id) : null;

            const wiwUserId   = extUserId ? (userIdMap.get(extUserId)   ?? null) : null;
            const wiwLocId    = extLocId  ? (locationIdMap.get(extLocId) ?? null) : null;
            const wiwPosId    = extPosId  ? (positionIdMap.get(extPosId) ?? null) : null;

            // Resolve account via location mapping
            const resolvedAccountId = wiwLocId ? (locationAcctMap.get(wiwLocId) ?? null) : null;
            const resolvedMapStatus = resolvedAccountId ? "mapped" : (wiwLocId ? "unmapped" : "unmapped");

            // Parse WIW timestamps respecting the original offset.
            // WIW encodes times in the account's configured timezone (Eastern)
            // and sends the correct UTC via the offset (e.g. "10:00:00 -0400"
            // = 14:00 UTC = 7 AM PDT). new Date() handles this correctly.
            const startTime = parseWiwDate(shift.start_time);
            const endTime   = parseWiwDate(shift.end_time);
            if (!startTime || !endTime) {
              result.errors++;
              result.errorMessages.push(`Shift ${extShiftId}: invalid start/end times`);
              continue;
            }

            const scheduledMins = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
            // Derive status from WIW v2 boolean flags (published / alerted / acknowledged).
            // Log a warning if the numeric status field contains an unrecognised value.
            if (typeof shift.status === "number" && !(shift.status in SHIFT_STATUS_NUMERIC)) {
              logUnknownShiftStatus(shift.id, shift.status);
            }
            const statusLabel   = deriveShiftStatus(shift as Record<string, unknown>);
            const isOpen        = !!shift.is_open;
            const notes         = shift.notes ?? null;

            const upsertRes = await pool.query(
              `INSERT INTO wiw_shifts (
                 external_shift_id, wiw_user_id, wiw_location_id, wiw_position_id,
                 external_user_id, external_loc_id, external_pos_id,
                 start_time, end_time, scheduled_minutes,
                 status, notes, is_open, wiw_account_id,
                 driverhub_account_id, mapping_status,
                 raw_payload, synced_at, updated_at
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,now(),now())
               ON CONFLICT (external_shift_id) DO UPDATE SET
                 wiw_user_id          = EXCLUDED.wiw_user_id,
                 wiw_location_id      = EXCLUDED.wiw_location_id,
                 wiw_position_id      = EXCLUDED.wiw_position_id,
                 external_user_id     = EXCLUDED.external_user_id,
                 external_loc_id      = EXCLUDED.external_loc_id,
                 external_pos_id      = EXCLUDED.external_pos_id,
                 start_time           = EXCLUDED.start_time,
                 end_time             = EXCLUDED.end_time,
                 scheduled_minutes    = EXCLUDED.scheduled_minutes,
                 status               = EXCLUDED.status,
                 notes                = EXCLUDED.notes,
                 is_open              = EXCLUDED.is_open,
                 wiw_account_id       = EXCLUDED.wiw_account_id,
                 driverhub_account_id = EXCLUDED.driverhub_account_id,
                 mapping_status       = EXCLUDED.mapping_status,
                 raw_payload          = EXCLUDED.raw_payload,
                 synced_at            = now(),
                 updated_at           = now()
               RETURNING (xmax = 0) AS inserted`,
              [
                extShiftId, wiwUserId, wiwLocId, wiwPosId,
                extUserId, extLocId, extPosId,
                startTime.toISOString(), endTime.toISOString(), scheduledMins,
                statusLabel, notes, isOpen, accountId,
                resolvedAccountId, resolvedMapStatus,
                JSON.stringify(shift),
              ]
            );

            if (upsertRes.rows[0]?.inserted === true) result.inserted++;
            else result.updated++;
          } catch (err: any) {
            result.errors++;
            result.errorMessages.push(`Shift ${shift.id} [acct ${accountId}]: ${err?.message ?? "unknown"}`);
          }
        }
      } catch (ctxErr: any) {
        result.errors++;
        result.errorMessages.push(`Account ${ctx.accountId} shifts: ${ctxErr?.message ?? "unknown"}`);
      }
    }
  } catch (err: any) {
    result.errors++;
    result.errorMessages.push(err?.message ?? "Sync failed");
  }

  touchLastSync();
  return result;
}

// ── 4. Sync Times ─────────────────────────────────────────────────────────────

export async function syncTimes(opts: SyncOptions = {}): Promise<SyncResult> {
  const syncedAt = new Date().toISOString();
  const result: SyncResult = { entity: "times", fetched: 0, inserted: 0, updated: 0, errors: 0, errorMessages: [], syncedAt };

  try {
    const contexts = await getAllAccountContexts();
    const { start, end } = buildDateWindow(opts);

    for (const ctx of contexts) {
      try {
        const params: Record<string, string> = { start, end };
        if (opts.updatedSince) params.updated_since = opts.updatedSince;

        const body = await wiwApiFetch(ctx, "/times", params);
        const times: any[] = body.times ?? [];
        result.fetched += times.length;

        if (times.length === 0) continue;

        const accountId = ctx.accountId || null;

        const externalUserIds  = times.map(t => String(t.user_id)).filter(Boolean);
        const externalShiftIds = times.map(t => t.shift_id ? String(t.shift_id) : null).filter((v): v is string => v !== null);

        const [userIdMap, shiftIdMap] = await Promise.all([
          buildUserIdMap(externalUserIds),
          buildShiftIdMap(externalShiftIds),
        ]);

        // Build shift account context for resolving driverhub_account_id on time records
        const internalShiftIds = externalShiftIds.map(extId => shiftIdMap.get(extId)).filter((v): v is string => !!v);
        const shiftAcctCtxMap = await buildShiftAccountContextMap(internalShiftIds);

        for (const time of times) {
          try {
            const extTimeId  = String(time.id);
            const extUserId  = time.user_id  ? String(time.user_id)  : null;
            const extShiftId = time.shift_id ? String(time.shift_id) : null;
            const wiwUserId  = extUserId  ? (userIdMap.get(extUserId)   ?? null) : null;
            const wiwShiftId = extShiftId ? (shiftIdMap.get(extShiftId) ?? null) : null;

            // Resolve account/location via shift context
            const shiftCtx = wiwShiftId ? (shiftAcctCtxMap.get(wiwShiftId) ?? null) : null;
            const timeAccountId  = shiftCtx?.accountId  ?? null;
            const timeLocationId = shiftCtx?.locationId ?? null;
            const timeMapStatus  = timeAccountId ? "mapped" : "unmapped";

            const clockIn  = parseWiwDate(time.start_time ?? time.clock_in);
            const clockOut = parseWiwDate(time.end_time   ?? time.clock_out);
            // WIW API returns `length` in fractional hours (e.g. 4 = 4 h), not minutes.
            const totalMins: number | null =
              time.length != null        ? Math.round(Number(time.length) * 60) :
              time.total_minutes != null ? Math.round(Number(time.total_minutes)) :
              (clockIn && clockOut)      ? Math.round((clockOut.getTime() - clockIn.getTime()) / 60000) :
              null;
            const autoClockOut = !!(time.auto_clockout ?? time.auto_clock_out);
            const notes = time.notes ?? null;

            // ── Approval status mapping (WIW source of truth) ─────────────────
            // WIW returns `is_approved` as a boolean. Map directly — no defaults.
            // Per ticket: if field is absent/unexpected, store 'unknown' and log.
            let approvalStatus: string;
            if (time.is_approved === true) {
              approvalStatus = "approved";
            } else if (time.is_approved === false) {
              approvalStatus = "unreviewed";
            } else {
              approvalStatus = "unknown";
              console.error(
                `[WIW times] Approval status missing or unexpected — ` +
                `driver_id=${wiwUserId ?? "?"} wiw_record_id=${extTimeId} ` +
                `raw is_approved=${JSON.stringify(time.is_approved)}`
              );
            }

            const upsertRes = await pool.query(
              `INSERT INTO wiw_times (
                 external_time_id, wiw_user_id, wiw_shift_id,
                 external_user_id, external_shift_id,
                 clock_in, clock_out, total_minutes,
                 auto_clock_out, notes, approval_status,
                 wiw_account_id, wiw_location_id, driverhub_account_id,
                 mapping_status, raw_payload, synced_at, updated_at
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,now(),now())
               ON CONFLICT (external_time_id) DO UPDATE SET
                 wiw_user_id          = EXCLUDED.wiw_user_id,
                 wiw_shift_id         = EXCLUDED.wiw_shift_id,
                 external_user_id     = EXCLUDED.external_user_id,
                 external_shift_id    = EXCLUDED.external_shift_id,
                 clock_in             = EXCLUDED.clock_in,
                 clock_out            = EXCLUDED.clock_out,
                 total_minutes        = EXCLUDED.total_minutes,
                 auto_clock_out       = EXCLUDED.auto_clock_out,
                 notes                = EXCLUDED.notes,
                 approval_status      = EXCLUDED.approval_status,
                 wiw_account_id       = EXCLUDED.wiw_account_id,
                 wiw_location_id      = EXCLUDED.wiw_location_id,
                 driverhub_account_id = EXCLUDED.driverhub_account_id,
                 mapping_status       = EXCLUDED.mapping_status,
                 raw_payload          = EXCLUDED.raw_payload,
                 synced_at            = now(),
                 updated_at           = now()
               RETURNING (xmax = 0) AS inserted`,
              [extTimeId, wiwUserId, wiwShiftId, extUserId, extShiftId,
               clockIn?.toISOString() ?? null, clockOut?.toISOString() ?? null,
               totalMins, autoClockOut, notes, approvalStatus, accountId,
               timeLocationId, timeAccountId, timeMapStatus,
               JSON.stringify(time)]
            );

            if (upsertRes.rows[0]?.inserted === true) result.inserted++;
            else result.updated++;
          } catch (err: any) {
            result.errors++;
            result.errorMessages.push(`Time ${time.id} [acct ${accountId}]: ${err?.message ?? "unknown"}`);
          }
        }
      } catch (ctxErr: any) {
        result.errors++;
        result.errorMessages.push(`Account ${ctx.accountId} times: ${ctxErr?.message ?? "unknown"}`);
      }
    }
  } catch (err: any) {
    result.errors++;
    result.errorMessages.push(err?.message ?? "Sync failed");
  }

  touchLastSync();
  return result;
}

// ── 5. Sync Absences (from /requests endpoint) ────────────────────────────────

export async function syncAbsences(opts: SyncOptions = {}): Promise<SyncResult> {
  const syncedAt = new Date().toISOString();
  const result: SyncResult = { entity: "absences", fetched: 0, inserted: 0, updated: 0, errors: 0, errorMessages: [], syncedAt };

  try {
    const contexts = await getAllAccountContexts();
    const { start, end } = buildDateWindow(opts);

    for (const ctx of contexts) {
      try {
        const body = await wiwApiFetch(ctx, "/requests", { start_time: start, end_time: end });
        const requests: any[] = body.requests ?? [];
        result.fetched += requests.length;

        if (requests.length === 0) continue;

        const accountId = ctx.accountId || null;
        const externalUserIds = requests.map(r => r.user_id ? String(r.user_id) : null).filter((v): v is string => v !== null);
        const userIdMap = await buildUserIdMap(externalUserIds);

        for (const req of requests) {
          try {
            const extAbsenceId = String(req.id);
            const extUserId    = req.user_id ? String(req.user_id) : null;
            const wiwUserId    = extUserId ? (userIdMap.get(extUserId) ?? null) : null;

            const startDt = parseWiwDate(req.start_time);
            if (!startDt) {
              result.errors++;
              result.errorMessages.push(`Request ${extAbsenceId}: missing start_time`);
              continue;
            }
            const dateStr = startDt.toISOString().split("T")[0];

            let durationMins: number | null = null;
            const endDt = parseWiwDate(req.end_time);
            if (startDt && endDt) {
              durationMins = Math.round((endDt.getTime() - startDt.getTime()) / 60000);
            } else if (req.hours != null) {
              durationMins = Math.round(Number(req.hours) * 60);
            }

            const reason = req.type_name ?? req.type_label ?? req.reason ?? String(req.type ?? "time_off");
            const status = req.status   ?? "pending";
            const notes  = req.notes    ?? null;

            const upsertRes = await pool.query(
              `INSERT INTO wiw_absences (
                 external_absence_id, wiw_user_id, external_user_id,
                 date, reason, duration_minutes, status, notes,
                 wiw_account_id, raw_payload, synced_at, updated_at
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,now(),now())
               ON CONFLICT (external_absence_id) DO UPDATE SET
                 wiw_user_id      = EXCLUDED.wiw_user_id,
                 external_user_id = EXCLUDED.external_user_id,
                 date             = EXCLUDED.date,
                 reason           = EXCLUDED.reason,
                 duration_minutes = EXCLUDED.duration_minutes,
                 status           = EXCLUDED.status,
                 notes            = EXCLUDED.notes,
                 wiw_account_id   = EXCLUDED.wiw_account_id,
                 raw_payload      = EXCLUDED.raw_payload,
                 synced_at        = now(),
                 updated_at       = now()
               RETURNING (xmax = 0) AS inserted`,
              [extAbsenceId, wiwUserId, extUserId, dateStr, reason, durationMins, status, notes, accountId, JSON.stringify(req)]
            );

            if (upsertRes.rows[0]?.inserted === true) result.inserted++;
            else result.updated++;
          } catch (err: any) {
            result.errors++;
            result.errorMessages.push(`Request ${req.id} [acct ${accountId}]: ${err?.message ?? "unknown"}`);
          }
        }
      } catch (ctxErr: any) {
        result.errors++;
        result.errorMessages.push(`Account ${ctx.accountId} absences: ${ctxErr?.message ?? "unknown"}`);
      }
    }
  } catch (err: any) {
    result.errors++;
    result.errorMessages.push(err?.message ?? "Absences sync failed");
  }

  touchLastSync();
  return result;
}

// ── 5b. Sync Time-Off Requests (full multi-day range into dedicated table) ────
// Parallel to syncAbsences but writes to wiw_time_off_requests with proper
// start/end range, partial-day timestamps, total_hours/days, driver_id linkage,
// and the full status set (pending / approved / denied / cancelled).

export async function syncTimeOffRequests(opts: SyncOptions = {}): Promise<SyncResult> {
  const syncedAt = new Date().toISOString();
  const result: SyncResult = { entity: "absences", fetched: 0, inserted: 0, updated: 0, errors: 0, errorMessages: [], syncedAt };

  try {
    const contexts = await getAllAccountContexts();
    const { start, end } = buildDateWindow(opts);

    for (const ctx of contexts) {
      try {
        const body = await wiwApiFetch(ctx, "/requests", { start_time: start, end_time: end });
        const requests: any[] = body.requests ?? [];
        result.fetched += requests.length;
        if (requests.length === 0) continue;

        const accountId = ctx.accountId || null;
        const extUserIds = requests
          .map(r => r.user_id ? String(r.user_id) : null)
          .filter((v): v is string => v !== null);
        const userIdMap = await buildUserIdMap(extUserIds);

        // Build driver_id map: wiw_user_id → driver.id via drivers.wiw_user_id
        const wiwUserIds = [...new Set([...userIdMap.values()])].filter(Boolean);
        let driverIdMap = new Map<string, string>();
        if (wiwUserIds.length > 0) {
          const dRes = await pool.query<{ wiw_user_id: string; id: string }>(
            `SELECT wiw_user_id, id FROM drivers WHERE wiw_user_id = ANY($1)`,
            [wiwUserIds]
          );
          for (const row of dRes.rows) {
            if (row.wiw_user_id) driverIdMap.set(row.wiw_user_id, row.id);
          }
        }

        for (const req of requests) {
          try {
            const extReqId   = String(req.id);
            const extUserId  = req.user_id ? String(req.user_id) : null;
            const wiwUserId  = extUserId ? (userIdMap.get(extUserId) ?? null) : null;
            const driverId   = wiwUserId ? (driverIdMap.get(wiwUserId) ?? null) : null;

            const startDt = parseWiwDate(req.start_time);
            if (!startDt) {
              result.errors++;
              result.errorMessages.push(`TimeOff ${extReqId}: missing start_time`);
              continue;
            }
            const endDt = parseWiwDate(req.end_time) ?? startDt;

            // Use local calendar date extracted directly from WIW's raw string so that
            // "23:59:59 -0400" end-times are not shifted to the following UTC day.
            const startDateStr = extractWiwLocalDate(req.start_time, startDt);
            const endDateStr   = extractWiwLocalDate(req.end_time,   endDt);

            // Total hours: prefer API-provided hours, fall back to duration
            let totalHours: number | null = null;
            if (req.hours != null && Number(req.hours) > 0) {
              totalHours = Number(req.hours);
            } else {
              const mins = Math.round((endDt.getTime() - startDt.getTime()) / 60000);
              if (mins > 0) totalHours = Math.round(mins / 60 * 100) / 100;
            }

            // Total days: prefer WIW-provided days_requested (authoritative), then
            // compute from local calendar dates (avoids UTC off-by-one on 23:59:59 end times).
            let totalDays: number | null = null;
            if (req.days_requested != null && Number(req.days_requested) > 0) {
              totalDays = Number(req.days_requested);
            } else {
              const s = new Date(startDateStr + "T00:00:00Z");
              const e = new Date(endDateStr   + "T00:00:00Z");
              const dayDiff = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
              totalDays = dayDiff > 0 ? dayDiff : (totalHours != null ? Math.round(totalHours / 8 * 100) / 100 : null);
            }

            const requestType = req.type_name ?? req.type_label ?? req.reason ?? (req.type != null ? String(req.type) : "time_off");
            const rawStatus   = String(req.status ?? "pending").toLowerCase();
            // WIW numeric statuses for /requests endpoint:
            //   0 = pending (not yet reviewed)
            //   1 = approved (future/upcoming)
            //   2 = approved (completed — time has already passed; confirmed via raw_payload.completed=1)
            //   3 = denied
            //   4 = cancelled
            const numStatus: Record<string, string> = { "0": "pending", "1": "approved", "2": "approved", "3": "denied", "4": "cancelled" };
            const status = numStatus[rawStatus] ?? rawStatus;

            const submittedAt     = parseWiwDate(req.created_at) ?? null;
            const approvedDeniedAt = (status === "approved" || status === "denied")
              ? (parseWiwDate(req.updated_at) ?? null) : null;

            // Partial-day: only set when same-day and start/end are meaningful datetimes
            const isPartialDay = startDateStr === endDateStr && totalHours != null && totalHours < 8;
            const startTime    = isPartialDay ? startDt : null;
            const endTime      = isPartialDay ? endDt   : null;

            await pool.query(
              `INSERT INTO wiw_time_off_requests (
                 external_request_id, wiw_user_id, external_user_id, driver_id,
                 start_date, end_date, start_time, end_time,
                 total_hours, total_days, request_type, status,
                 submitted_at, approved_denied_at, notes,
                 wiw_account_id, raw_payload, synced_at, updated_at
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,now(),now())
               ON CONFLICT (external_request_id) DO UPDATE SET
                 wiw_user_id       = EXCLUDED.wiw_user_id,
                 external_user_id  = EXCLUDED.external_user_id,
                 driver_id         = EXCLUDED.driver_id,
                 start_date        = EXCLUDED.start_date,
                 end_date          = EXCLUDED.end_date,
                 start_time        = EXCLUDED.start_time,
                 end_time          = EXCLUDED.end_time,
                 total_hours       = EXCLUDED.total_hours,
                 total_days        = EXCLUDED.total_days,
                 request_type      = EXCLUDED.request_type,
                 status            = EXCLUDED.status,
                 submitted_at      = EXCLUDED.submitted_at,
                 approved_denied_at= EXCLUDED.approved_denied_at,
                 notes             = EXCLUDED.notes,
                 wiw_account_id    = EXCLUDED.wiw_account_id,
                 raw_payload       = EXCLUDED.raw_payload,
                 synced_at         = now(),
                 updated_at        = now()
               RETURNING (xmax = 0) AS inserted`,
              [
                extReqId, wiwUserId, extUserId, driverId,
                startDateStr, endDateStr,
                startTime ? startTime.toISOString() : null,
                endTime   ? endTime.toISOString()   : null,
                totalHours, totalDays, requestType, status,
                submittedAt ? submittedAt.toISOString() : null,
                approvedDeniedAt ? approvedDeniedAt.toISOString() : null,
                req.notes ?? null,
                accountId, JSON.stringify(req),
              ]
            ).then(r => {
              if (r.rows[0]?.inserted === true) result.inserted++;
              else result.updated++;
            });
          } catch (err: any) {
            result.errors++;
            result.errorMessages.push(`TimeOff req ${req.id} [acct ${accountId}]: ${err?.message ?? "unknown"}`);
          }
        }
      } catch (ctxErr: any) {
        result.errors++;
        result.errorMessages.push(`Account ${ctx.accountId} time-off: ${ctxErr?.message ?? "unknown"}`);
      }
    }
  } catch (err: any) {
    result.errors++;
    result.errorMessages.push(err?.message ?? "Time-off sync failed");
  }

  touchLastSync();
  return result;
}

// ── 6. Sync Attendance Notices (from /attendances endpoint) ───────────────────

export async function syncNotices(opts: SyncOptions = {}): Promise<SyncResult> {
  const syncedAt = new Date().toISOString();
  const result: SyncResult = { entity: "notices", fetched: 0, inserted: 0, updated: 0, errors: 0, errorMessages: [], syncedAt };

  try {
    const contexts = await getAllAccountContexts();
    const { start, end } = buildDateWindow(opts);

    for (const ctx of contexts) {
      try {
        const body = await wiwApiFetch(ctx, "/attendances", { start_time: start, end_time: end });
        const attendances: any[] = body.attendances ?? [];
        result.fetched += attendances.length;

        if (attendances.length === 0) continue;

        const accountId = ctx.accountId || null;
        const externalUserIds = attendances.map(a => a.user_id ? String(a.user_id) : null).filter((v): v is string => v !== null);
        const userIdMap = await buildUserIdMap(externalUserIds);

        for (const att of attendances) {
          try {
            const extNoticeId = String(att.id);
            const extUserId   = att.user_id ? String(att.user_id) : null;
            const wiwUserId   = extUserId ? (userIdMap.get(extUserId) ?? null) : null;

            const type = att.type ?? att.attendance_type ?? "unknown";
            const occurredAt = parseWiwDate(att.start_time ?? att.time ?? att.created_at);

            const minutesLate: number | null = att.late_time != null
              ? Math.round(Number(att.late_time))
              : att.minutes_late != null
                ? Math.round(Number(att.minutes_late))
                : null;

            const notes = att.notes ?? null;

            const upsertRes = await pool.query(
              `INSERT INTO wiw_attendance_notices (
                 external_notice_id, wiw_user_id, external_user_id,
                 type, occurred_at, minutes_late, notes,
                 wiw_account_id, raw_payload, synced_at, updated_at
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now(),now())
               ON CONFLICT (external_notice_id) DO UPDATE SET
                 wiw_user_id      = EXCLUDED.wiw_user_id,
                 external_user_id = EXCLUDED.external_user_id,
                 type             = EXCLUDED.type,
                 occurred_at      = EXCLUDED.occurred_at,
                 minutes_late     = EXCLUDED.minutes_late,
                 notes            = EXCLUDED.notes,
                 wiw_account_id   = EXCLUDED.wiw_account_id,
                 raw_payload      = EXCLUDED.raw_payload,
                 synced_at        = now(),
                 updated_at       = now()
               RETURNING (xmax = 0) AS inserted`,
              [extNoticeId, wiwUserId, extUserId, type, occurredAt?.toISOString() ?? null, minutesLate, notes, accountId, JSON.stringify(att)]
            );

            if (upsertRes.rows[0]?.inserted === true) result.inserted++;
            else result.updated++;
          } catch (err: any) {
            result.errors++;
            result.errorMessages.push(`Attendance ${att.id} [acct ${accountId}]: ${err?.message ?? "unknown"}`);
          }
        }
      } catch (ctxErr: any) {
        result.errors++;
        result.errorMessages.push(`Account ${ctx.accountId} notices: ${ctxErr?.message ?? "unknown"}`);
      }
    }
  } catch (err: any) {
    result.errors++;
    result.errorMessages.push(err?.message ?? "Notices sync failed");
  }

  touchLastSync();
  return result;
}

// ── 7. Reconcile shifts ───────────────────────────────────────────────────────
// Full reconciliation: upsert everything WIW returns, then soft-delete any DB
// shifts whose external_shift_id was NOT present in the WIW response for that
// account + date window.  This is the only correct way to remove cancelled or
// deleted shifts — a plain sync (upsert-only) will never purge orphans.

export interface ReconcileResult extends SyncResult {
  deleted: number;
}

export async function reconcileShifts(opts: SyncOptions = {}): Promise<ReconcileResult> {
  // Phase 1 — pull fresh data from WIW and upsert (same logic as syncShifts).
  const syncResult = await syncShifts(opts);

  // Phase 2 — purge orphans.
  const { start, end } = buildDateWindow(opts);
  const contexts = await getAllAccountContexts();
  let deleted = 0;
  const deletedExternalIds: string[] = [];

  for (const ctx of contexts) {
    try {
      const params: Record<string, string> = { start, end, include_open: "1", deleted: "0" };
      const body = await wiwApiFetch(ctx, "/shifts", params);
      const wiwShifts: any[] = body.shifts ?? [];

      // Safety guard: if WIW returned zero shifts for this account + window,
      // skip the purge entirely.  An empty response might signal an API issue,
      // not genuine absence of all shifts, so we don't want to wipe good data.
      if (wiwShifts.length === 0) continue;

      // Collect every external shift ID WIW knows about for this window.
      const liveIds: string[] = wiwShifts.map((s: any) => String(s.id));

      // Soft-delete any DB shift for this account + window that WIW no longer returns.
      // != ALL(array) is PostgreSQL for "not in the array".
      const purgeRes = await pool.query(
        `UPDATE wiw_shifts
            SET status     = 'deleted',
                updated_at = now()
          WHERE wiw_account_id       = $1
            AND start_time          >= $2::date
            AND start_time           < ($3::date + INTERVAL '1 day')::timestamptz
            AND status              != 'deleted'
            AND external_shift_id   != ALL($4::text[])
          RETURNING external_shift_id`,
        [ctx.accountId, start, end, liveIds],
      );

      const count = purgeRes.rowCount ?? 0;
      if (count > 0) {
        const ids = purgeRes.rows.map((r: any) => r.external_shift_id as string);
        deletedExternalIds.push(...ids);
        deleted += count;
        console.log(
          `[WIW Reconcile] Account ${ctx.accountId}: soft-deleted ${count} stale shift(s) ` +
          `[${ids.join(", ")}] from window ${start}–${end}`,
        );
      }
    } catch (err: any) {
      console.error(`[WIW Reconcile] Account ${ctx.accountId}:`, err?.message);
      syncResult.errors++;
      syncResult.errorMessages.push(`Account ${ctx.accountId} reconcile: ${err?.message ?? "unknown"}`);
    }
  }

  return {
    ...syncResult,
    entity: "shifts",
    deleted,
    errorMessages: [
      ...syncResult.errorMessages,
      ...(deletedExternalIds.length ? [`Soft-deleted IDs: ${deletedExternalIds.join(", ")}`] : []),
    ],
  };
}

// ── 8. Sync all entities ──────────────────────────────────────────────────────
// Order: users must come first (all others FK into wiw_users).
//        locations + positions before shifts (FK resolution for wiw_location_id / wiw_position_id).

export async function syncAll(opts: SyncOptions = {}): Promise<SyncResult> {
  const users     = await syncUsers();
  const locations = await syncLocations();
  const positions = await syncPositions();
  const shifts    = await reconcileShifts(opts);
  const times     = await syncTimes(opts);
  const absences  = await syncAbsences(opts);
  const notices   = await syncNotices(opts);

  const children = { users, locations, positions, shifts, times, absences, notices };

  return {
    entity:   "all",
    fetched:  Object.values(children).reduce((s, r) => s + r.fetched,  0),
    inserted: Object.values(children).reduce((s, r) => s + r.inserted, 0),
    updated:  Object.values(children).reduce((s, r) => s + r.updated,  0),
    errors:   Object.values(children).reduce((s, r) => s + r.errors,   0),
    errorMessages: Object.values(children).flatMap(r => r.errorMessages),
    syncedAt: new Date().toISOString(),
    children,
  };
}

// ── 8. Sync status ────────────────────────────────────────────────────────────

export interface SyncStatus {
  lastSyncAt:       string | null;
  connectionStatus: string;
  syncEnabled:      boolean;
  usersCount:       number;
  shiftsCount:      number;
  timesCount:       number;
  locationsCount:   number;
  positionsCount:   number;
  absencesCount:    number;
  noticesCount:     number;
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const [cfg, counts] = await Promise.all([
    pool.query(`SELECT last_sync_at, connection_status, sync_enabled FROM wiw_api_config LIMIT 1`),
    pool.query(`
      SELECT
        (SELECT count(*) FROM wiw_users)::int               AS users_count,
        (SELECT count(*) FROM wiw_shifts)::int              AS shifts_count,
        (SELECT count(*) FROM wiw_times)::int               AS times_count,
        (SELECT count(*) FROM wiw_locations)::int           AS locations_count,
        (SELECT count(*) FROM wiw_positions)::int           AS positions_count,
        (SELECT count(*) FROM wiw_absences)::int            AS absences_count,
        (SELECT count(*) FROM wiw_attendance_notices)::int  AS notices_count
    `),
  ]);

  const cfgRow = cfg.rows[0] ?? {};
  const cntRow = counts.rows[0] ?? {};

  return {
    lastSyncAt:       cfgRow.last_sync_at ? new Date(cfgRow.last_sync_at).toISOString() : null,
    connectionStatus: cfgRow.connection_status ?? "not_connected",
    syncEnabled:      cfgRow.sync_enabled ?? false,
    usersCount:       Number(cntRow.users_count     ?? 0),
    shiftsCount:      Number(cntRow.shifts_count    ?? 0),
    timesCount:       Number(cntRow.times_count     ?? 0),
    locationsCount:   Number(cntRow.locations_count ?? 0),
    positionsCount:   Number(cntRow.positions_count ?? 0),
    absencesCount:    Number(cntRow.absences_count  ?? 0),
    noticesCount:     Number(cntRow.notices_count   ?? 0),
  };
}

/**
 * One-time backfill: re-interprets all existing wiw_shifts start_time / end_time
 * values using the new account-local timezone rule, correcting records that were
 * stored under the old (WIW-account-offset-respecting) parsing logic.
 *
 * Reads the raw WIW start/end strings from raw_payload, looks up the resolved
 * account's timezone, and updates start_time / end_time / scheduled_minutes in
 * place.  Idempotent — safe to run multiple times.
 */
export async function backfillShiftTimezones(): Promise<{
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
}> {
  const result = { processed: 0, updated: 0, skipped: 0, errors: 0 };

  // Load all shifts that have a resolved account and a raw_payload
  const rows = await pool.query(`
    SELECT
      ws.id,
      ws.driverhub_account_id,
      ws.raw_payload->>'start_time' AS raw_start,
      ws.raw_payload->>'end_time'   AS raw_end
    FROM wiw_shifts ws
    WHERE ws.driverhub_account_id IS NOT NULL
      AND ws.raw_payload IS NOT NULL
    ORDER BY ws.start_time DESC
  `);

  if (rows.rows.length === 0) return result;

  for (const row of rows.rows) {
    result.processed++;
    try {
      // Use parseWiwDate which respects the original WIW offset (e.g. "-0400")
      // and produces the correct UTC directly.  No account timezone lookup needed.
      const newStart = parseWiwDate(row.raw_start);
      const newEnd   = parseWiwDate(row.raw_end);
      if (!newStart || !newEnd) { result.skipped++; continue; }

      const newMins = Math.round((newEnd.getTime() - newStart.getTime()) / 60000);

      await pool.query(
        `UPDATE wiw_shifts
            SET start_time        = $1,
                end_time          = $2,
                scheduled_minutes = $3,
                updated_at        = now()
          WHERE id = $4`,
        [newStart.toISOString(), newEnd.toISOString(), newMins, row.id],
      );
      result.updated++;
    } catch {
      result.errors++;
    }
  }

  return result;
}
