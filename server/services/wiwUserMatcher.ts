/**
 * WIW User Matcher  (Ticket 2 — Full Active Driver Reconciliation)
 *
 * Reconciles all active WIW users to DriverHub drivers via a four-pass strategy:
 *  1. employee_code  → drivers.employee_id / independent_contractor_id (exact)
 *  2. email          → users.email          (exact, case-insensitive)
 *  3. phone          → drivers.phone_number (normalised digits only)
 *  4. name           → users.first_name + last_name (case-insensitive, fallback only)
 *
 * Ambiguity detection:
 *  - Email / phone matches are always 1:1 — no ambiguity possible on those passes.
 *  - Name pass: if a WIW user's full name matches more than one active driver the
 *    record is flagged as "ambiguous". No driverId is written for ambiguous users so
 *    they never silently acquire the wrong driver link.
 *
 * Persistence:
 *  - matchMethod (email | phone | name | employee_code | manual | unmatched)
 *  - matchStatus (matched | unmatched | ambiguous)
 *  are stored directly on wiw_users and returned in every list query.
 *
 * The single source-of-truth link is wiw_users.driver_id FK → drivers.id.
 */

import { db, pool } from "../db";
import { sql, eq } from "drizzle-orm";
import { wiwUsers } from "@shared/schema";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MatchMethod = "employee_code" | "email" | "phone" | "name" | "manual" | "unmatched";
export type MatchStatus = "matched" | "unmatched" | "ambiguous";
export type WiwIntegrationStatus = "ACTIVE_DRIVER" | "EXCLUDED_NON_DRIVER" | "PENDING_REVIEW";

export interface WiwUserWithMatch {
  id: string;
  externalUserId: string;
  name: string;
  email: string | null;
  phone: string | null;
  employeeCode: string | null;
  driverId: string | null;
  matchMethod: MatchMethod | null;
  matchStatus: MatchStatus;
  syncedAt: string;
  wiwStatus: "active" | "inactive" | "deleted";
  wiwAccountId: number | null;
  // Resolved driver info (null when unmatched/ambiguous)
  driverName: string | null;
  driverNumber: string | null;
  driverStatus: string | null;
  driverEmail: string | null;
  driverPhone: string | null;
  // Activity enrichment
  lastSeenAt: string | null;
  workplaceName: string | null;
  wiwIntegrationStatus: WiwIntegrationStatus;
}

export interface AutoMatchResult {
  attempted: number;
  matched: number;
  alreadyMatched: number;
  unmatched: number;
  ambiguous: number;
  dryRun?: boolean;
  details: {
    wiwUserId: string;
    wiwEmail: string | null;
    wiwPhone: string | null;
    name: string;
    method: MatchMethod | "skipped";
    matchStatus: MatchStatus;
    driverId: string | null;
    driverName: string | null;
    driverNumber: string | null;
    driverEmail: string | null;
    ambiguousCandidates?: string[]; // driver numbers that caused ambiguity
  }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalise a phone string to digits only for comparison. */
function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  // Strip leading country code (1) for US numbers if 11 digits
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits || null;
}

// ── Internal: fetch all active drivers + linked user ──────────────────────────

type DriverPoolRow = {
  driverId: string;
  employeeId: string | null;
  icId: string | null;
  userId: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  driverNumber: string | null;
  phoneNumber: string | null;
  status: string | null;
};

async function fetchDriverPool(): Promise<DriverPoolRow[]> {
  const rows = await db.execute(sql`
    SELECT
      d.id                           AS driver_id,
      d.employee_id,
      d.independent_contractor_id    AS ic_id,
      d.user_id,
      d.driver_number,
      d.status,
      d.phone_number,
      u.email,
      u.first_name,
      u.last_name
    FROM drivers d
    LEFT JOIN users u ON u.id = d.user_id
    WHERE d.status NOT IN ('terminated', 'inactive', 'rejected')
       OR d.status IS NULL
    ORDER BY d.driver_number
  `);
  return (rows.rows as any[]).map((r) => ({
    driverId:     r.driver_id,
    employeeId:   r.employee_id ?? null,
    icId:         r.ic_id ?? null,
    userId:       r.user_id ?? null,
    email:        r.email ?? null,
    firstName:    r.first_name ?? null,
    lastName:     r.last_name ?? null,
    driverNumber: r.driver_number ?? null,
    phoneNumber:  r.phone_number ?? null,
    status:       r.status ?? null,
  }));
}

// ── 1. Auto-match (reconciliation job) ────────────────────────────────────────

export async function autoMatchWiwUsers(
  opts: { dryRun?: boolean; limit?: number } = {}
): Promise<AutoMatchResult> {
  const { dryRun = false, limit } = opts;

  // Rule: only active WIW users are eligible. Inactive/deleted users must never
  // be linked to DriverHub drivers — they are pre-acquisition or removed employees.
  const [allActiveWiwUsers, drivers] = await Promise.all([
    db.select().from(wiwUsers).where(eq(wiwUsers.wiwStatus, "active")),
    fetchDriverPool(),
  ]);

  const result: AutoMatchResult = {
    attempted: 0,
    matched: 0,
    alreadyMatched: 0,
    unmatched: 0,
    ambiguous: 0,
    dryRun,
    details: [],
  };

  // ── Build lookup structures ────────────────────────────────────────────────

  // 1:1 maps — first match wins (employee_code, email, phone are deterministic)
  const byEmployeeId  = new Map<string, DriverPoolRow>();
  const byIcId        = new Map<string, DriverPoolRow>();
  const byEmail       = new Map<string, DriverPoolRow>();
  const byPhone       = new Map<string, DriverPoolRow>();

  // Name can collide → store all candidates to detect ambiguity
  const byFullName    = new Map<string, DriverPoolRow[]>();

  for (const d of drivers) {
    if (d.employeeId) byEmployeeId.set(d.employeeId.toLowerCase().trim(), d);
    if (d.icId)       byIcId.set(d.icId.toLowerCase().trim(), d);
    if (d.email)      byEmail.set(d.email.toLowerCase().trim(), d);

    const phone = normalisePhone(d.phoneNumber);
    if (phone && phone.length >= 7) byPhone.set(phone, d);

    const fullName = [d.firstName, d.lastName].filter(Boolean).join(" ").toLowerCase().trim();
    if (fullName) {
      const existing = byFullName.get(fullName) ?? [];
      existing.push(d);
      byFullName.set(fullName, existing);
    }
  }

  // Only process unmatched users (already matched = alreadyMatched)
  const unmatched   = allActiveWiwUsers.filter((wu) => !wu.driverId);
  result.alreadyMatched = allActiveWiwUsers.length - unmatched.length;
  const candidates  = limit ? unmatched.slice(0, limit) : unmatched;

  for (const wu of candidates) {
    result.attempted++;
    let match: DriverPoolRow | undefined;
    let method: MatchMethod = "unmatched";
    let status: MatchStatus = "unmatched";
    let ambiguousCandidates: string[] | undefined;

    // ── Pass 1 — employee_code ───────────────────────────────────────────────
    if (wu.employeeCode) {
      const code = wu.employeeCode.toLowerCase().trim();
      match = byEmployeeId.get(code) ?? byIcId.get(code);
      if (match) { method = "employee_code"; status = "matched"; }
    }

    // ── Pass 2 — email ───────────────────────────────────────────────────────
    if (!match && wu.email) {
      match = byEmail.get(wu.email.toLowerCase().trim());
      if (match) { method = "email"; status = "matched"; }
    }

    // ── Pass 3 — phone ───────────────────────────────────────────────────────
    if (!match) {
      const wPhone = normalisePhone((wu as any).phone);
      if (wPhone && wPhone.length >= 7) {
        match = byPhone.get(wPhone);
        if (match) { method = "phone"; status = "matched"; }
      }
    }

    // ── Pass 4 — full name (fallback — ambiguity-aware) ──────────────────────
    if (!match) {
      const wName = wu.name.toLowerCase().trim();
      const nameCandidates = byFullName.get(wName) ?? [];
      if (nameCandidates.length === 1) {
        match  = nameCandidates[0];
        method = "name";
        status = "matched";
      } else if (nameCandidates.length > 1) {
        // Ambiguous — multiple drivers share this name; do NOT auto-assign
        method              = "name";
        status              = "ambiguous";
        ambiguousCandidates = nameCandidates.map((d) => d.driverNumber ?? d.driverId);
      }
    }

    const driverName = match
      ? [match.firstName, match.lastName].filter(Boolean).join(" ") || match.driverNumber
      : null;

    if (!dryRun) {
      await db
        .update(wiwUsers)
        .set({
          driverId:    status === "matched" ? match!.driverId : null,
          matchMethod: method,
          matchStatus: status,
          updatedAt:   new Date(),
        })
        .where(eq(wiwUsers.id, wu.id));

      if (status === "matched" && match) {
        await pool.query(
          `UPDATE drivers
           SET wiw_user_id      = $1,
               wiw_email        = $2,
               wiw_workplace_id = $3,
               wiw_sync_status  = 'synced',
               wiw_last_seen_at = now()
           WHERE id = $4`,
          [wu.id, wu.email ?? null, wu.wiwAccountId ? String(wu.wiwAccountId) : null, match.driverId]
        );
      }
    }

    if (status === "matched") {
      result.matched++;
    } else if (status === "ambiguous") {
      result.ambiguous++;
    } else {
      result.unmatched++;
    }

    result.details.push({
      wiwUserId:           wu.id,
      wiwEmail:            wu.email,
      wiwPhone:            (wu as any).phone ?? null,
      name:                wu.name,
      method,
      matchStatus:         status,
      driverId:            status === "matched" ? (match?.driverId ?? null) : null,
      driverName:          driverName ?? null,
      driverNumber:        match?.driverNumber ?? null,
      driverEmail:         match?.email ?? null,
      ambiguousCandidates,
    });
  }

  return result;
}

// ── 2. Get all wiw_users with resolved driver info ────────────────────────────

export async function getWiwUserMappings(
  filter?: "all" | "matched" | "unmatched" | "ambiguous",
  status?: "active" | "inactive" | "deleted" | "all",
  integrationStatus?: WiwIntegrationStatus | "all"
): Promise<WiwUserWithMatch[]> {
  const statusFilter = status ?? "active";

  const rows = await db.execute(sql`
    SELECT
      wu.id,
      wu.external_user_id,
      wu.name,
      wu.email,
      wu.phone,
      wu.employee_code,
      wu.driver_id,
      wu.match_method,
      wu.match_status,
      wu.synced_at,
      wu.wiw_status,
      wu.wiw_account_id,
      -- resolved driver fields
      d.driver_number,
      d.status                                          AS driver_status,
      d.phone_number                                    AS driver_phone,
      u.email                                           AS driver_email,
      COALESCE(u.first_name || ' ' || u.last_name, d.driver_number) AS driver_name,
      -- activity enrichment
      GREATEST(
        (SELECT MAX(ws.start_time) FROM wiw_shifts ws WHERE ws.wiw_user_id = wu.id),
        (SELECT MAX(wt.clock_in)   FROM wiw_times  wt WHERE wt.wiw_user_id = wu.id)
      )                                                 AS last_seen_at,
      wl.name                                           AS workplace_name,
      wu.wiw_integration_status
    FROM wiw_users wu
    LEFT JOIN drivers       d  ON d.id  = wu.driver_id
    LEFT JOIN users         u  ON u.id  = d.user_id
    -- Derive workplace from the user's most recent shift (not account-level join which fans out)
    LEFT JOIN LATERAL (
      SELECT ws.wiw_location_id
      FROM wiw_shifts ws
      WHERE ws.wiw_user_id = wu.id
        AND ws.wiw_location_id IS NOT NULL
      ORDER BY ws.start_time DESC
      LIMIT 1
    ) recent_shift ON true
    LEFT JOIN wiw_locations wl ON wl.id = recent_shift.wiw_location_id
    WHERE (${statusFilter} = 'all' OR wu.wiw_status = ${statusFilter})
    ORDER BY
      CASE wu.match_status
        WHEN 'ambiguous' THEN 0
        WHEN 'unmatched' THEN 1
        ELSE 2
      END,
      wu.name
  `);

  let items = (rows.rows as any[]).map((r): WiwUserWithMatch => ({
    id:              r.id,
    externalUserId:  r.external_user_id,
    name:            r.name,
    email:           r.email ?? null,
    phone:           r.phone ?? null,
    employeeCode:    r.employee_code ?? null,
    driverId:        r.driver_id ?? null,
    matchMethod:     (r.match_method ?? null) as MatchMethod | null,
    matchStatus:     (r.match_status ?? "unmatched") as MatchStatus,
    syncedAt:        r.synced_at,
    wiwStatus:       (r.wiw_status ?? "active") as "active" | "inactive" | "deleted",
    wiwAccountId:    r.wiw_account_id ?? null,
    driverName:      r.driver_name ?? null,
    driverNumber:    r.driver_number ?? null,
    driverStatus:    r.driver_status ?? null,
    driverEmail:     r.driver_email ?? null,
    driverPhone:     r.driver_phone ?? null,
    lastSeenAt:           r.last_seen_at ? new Date(r.last_seen_at).toISOString() : null,
    workplaceName:        r.workplace_name ?? null,
    wiwIntegrationStatus: (r.wiw_integration_status ?? "PENDING_REVIEW") as WiwIntegrationStatus,
  }));

  if (filter === "matched")   items = items.filter(i => i.matchStatus === "matched");
  if (filter === "unmatched") items = items.filter(i => i.matchStatus === "unmatched");
  if (filter === "ambiguous") items = items.filter(i => i.matchStatus === "ambiguous");

  if (integrationStatus && integrationStatus !== "all") {
    items = items.filter(i => i.wiwIntegrationStatus === integrationStatus);
  }

  return items;
}

// ── 3. Manual map / unmap ─────────────────────────────────────────────────────

export async function setWiwUserDriver(
  wiwUserId: string,
  driverId: string | null
): Promise<WiwUserWithMatch> {
  const [wiwUser] = await db.select().from(wiwUsers).where(eq(wiwUsers.id, wiwUserId)).limit(1);
  if (!wiwUser) throw new Error("WIW user not found");

  await db
    .update(wiwUsers)
    .set({
      driverId,
      matchMethod:           driverId ? "manual" : null,
      matchStatus:           driverId ? "matched" : "unmatched",
      wiwIntegrationStatus:  driverId ? "ACTIVE_DRIVER" : "PENDING_REVIEW",
      updatedAt:             new Date(),
    })
    .where(eq(wiwUsers.id, wiwUserId));

  if (driverId) {
    await pool.query(
      `UPDATE drivers
       SET wiw_user_id      = $1,
           wiw_email        = $2,
           wiw_workplace_id = $3,
           wiw_sync_status  = 'synced',
           wiw_last_seen_at = now()
       WHERE id = $4`,
      [wiwUserId, wiwUser.email ?? null, wiwUser.wiwAccountId ? String(wiwUser.wiwAccountId) : null, driverId]
    );
  } else {
    const prevDriverId = wiwUser.driverId;
    if (prevDriverId) {
      await pool.query(
        `UPDATE drivers
         SET wiw_user_id      = NULL,
             wiw_email        = NULL,
             wiw_workplace_id = NULL,
             wiw_sync_status  = 'unmatched',
             wiw_last_seen_at = now()
         WHERE id = $1`,
        [prevDriverId]
      );
    }
  }

  const results = await getWiwUserMappings("all", "all");
  const updated = results.find(r => r.id === wiwUserId);
  if (!updated) throw new Error("WIW user not found after update");
  return updated;
}

// ── 4. Summary counts (for the UI header bar) ─────────────────────────────────

export async function getWiwMappingSummary(): Promise<{
  total: number;
  matched: number;
  unmatched: number;
  ambiguous: number;
  matchRate: number;
  activeCount: number;
  inactiveCount: number;
  deletedCount: number;
  activeDriverCount: number;
  excludedCount: number;
  pendingReviewCount: number;
}> {
  const rows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE wiw_status = 'active')                                                                                  AS active_count,
      COUNT(*) FILTER (WHERE wiw_status = 'inactive')                                                                               AS inactive_count,
      COUNT(*) FILTER (WHERE wiw_status = 'deleted')                                                                                AS deleted_count,
      COUNT(*) FILTER (WHERE wiw_status = 'active' AND match_status = 'matched'   AND wiw_integration_status != 'EXCLUDED_NON_DRIVER') AS matched,
      COUNT(*) FILTER (WHERE wiw_status = 'active' AND match_status = 'unmatched' AND wiw_integration_status != 'EXCLUDED_NON_DRIVER') AS unmatched,
      COUNT(*) FILTER (WHERE wiw_status = 'active' AND match_status = 'ambiguous' AND wiw_integration_status != 'EXCLUDED_NON_DRIVER') AS ambiguous,
      COUNT(*) FILTER (WHERE wiw_status = 'active' AND wiw_integration_status = 'ACTIVE_DRIVER')       AS active_driver_count,
      COUNT(*) FILTER (WHERE wiw_status = 'active' AND wiw_integration_status = 'EXCLUDED_NON_DRIVER') AS excluded_count,
      COUNT(*) FILTER (WHERE wiw_status = 'active' AND wiw_integration_status = 'PENDING_REVIEW')      AS pending_review_count
    FROM wiw_users
  `);
  const r              = (rows.rows as any[])[0] ?? {};
  const active         = Number(r.active_count ?? 0);
  const inactive       = Number(r.inactive_count ?? 0);
  const deleted        = Number(r.deleted_count ?? 0);
  const matched        = Number(r.matched ?? 0);
  const unmatched      = Number(r.unmatched ?? 0);
  const ambiguous      = Number(r.ambiguous ?? 0);
  const activeDrivers  = Number(r.active_driver_count ?? 0);
  const excluded       = Number(r.excluded_count ?? 0);
  const pendingReview  = Number(r.pending_review_count ?? 0);
  const driverTotal    = activeDrivers; // denominator for match rate
  return {
    total:              active,
    matched,
    unmatched,
    ambiguous,
    matchRate:          driverTotal > 0 ? Math.round((matched / driverTotal) * 100) : 0,
    activeCount:        active,
    inactiveCount:      inactive,
    deletedCount:       deleted,
    activeDriverCount:  activeDrivers,
    excludedCount:      excluded,
    pendingReviewCount: pendingReview,
  };
}
