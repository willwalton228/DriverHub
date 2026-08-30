/**
 * WIW Location → DriverHub Account Matcher
 *
 * Auto-match strategy (in order of confidence):
 *  1. Account number extracted from WIW location name (e.g. "Bill Knight Lincoln - 447")
 *     matched to customers.customer_number → confidence 95
 *  2. Normalized name exact match → confidence 80
 *  3. Partial name match (dealership name without number) → confidence 60
 *
 * The mapping is stored in wiw_location_account_map.
 * wiw_locations.account_id is kept in sync for backward-compat query joins.
 */

import { pool } from "../db";

export type MatchedBy = "store_number" | "driver_email" | "exact_name" | "normalized_name" | "manual" | "unresolved";

export interface LocationMapping {
  id: string;
  wiwWorkplaceId: number | null;
  wiwLocationId: string;
  wiwLocationName: string;
  driverHubAccountId: string | null;
  accountName: string | null;
  customerNumber: string | null;
  mappingStatus: "mapped" | "unmapped" | "ambiguous";
  confidenceScore: number;
  matchReason: string | null;
  matchedBy: MatchedBy;
  notes: string | null;
  lastSeenAt: string | null;
  updatedAt: string;
}

export interface AutoMatchResult {
  processed: number;
  matched: number;
  unmatched: number;
  ambiguous: number;
  errors: number;
}

// ── Normalization helpers ──────────────────────────────────────────────────────

function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")   // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract trailing number from a name like "Bill Knight Lincoln - 447" → "447" */
function extractTrailingNumber(name: string): string | null {
  const m = name.match(/[-–]\s*(\d+)\s*$/);
  return m ? m[1] : null;
}

/** Strip trailing number from name: "Bill Knight Lincoln - 447" → "bill knight lincoln" */
function stripTrailingNumber(name: string): string {
  return normalize(name.replace(/[-–]\s*\d+\s*$/, ""));
}

// ── Core auto-match logic ──────────────────────────────────────────────────────

interface MatchCandidate {
  accountId: string;
  customerNumber: string;
  customerName: string;
  confidence: number;
  reason: string;
  matchedBy: MatchedBy;
}

async function findBestMatch(locationName: string, wiwLocationId: string): Promise<MatchCandidate | null> {
  const candidates: MatchCandidate[] = [];

  const trailingNum = extractTrailingNumber(locationName);
  const baseName    = stripTrailingNumber(locationName);

  // Strategy 1: Account number extraction (highest confidence — 95)
  if (trailingNum) {
    const r = await pool.query(
      `SELECT id, customer_number, customer_name FROM customers
       WHERE customer_number = $1 OR dealer_id = $1
       LIMIT 2`,
      [trailingNum]
    );
    if (r.rows.length === 1) {
      candidates.push({
        accountId:      r.rows[0].id,
        customerNumber: r.rows[0].customer_number,
        customerName:   r.rows[0].customer_name,
        confidence:     95,
        reason:         `Account/dealer number match: ${trailingNum}`,
        matchedBy:      "store_number",
      });
    } else if (r.rows.length > 1) {
      // Multiple accounts with same number — ambiguous
      return null;
    }
  }

  // Strategy 2: Driver-email match (confidence 92)
  // Account → driver_accounts → drivers → wiw_users (email-matched) → wiw_shifts at this location
  // If all matched drivers working this location belong to exactly one DriverHub account, map it.
  {
    const driverMatchQ = await pool.query(
      `SELECT DISTINCT da.account_id, c.customer_number, c.customer_name
       FROM wiw_shifts ws
       JOIN wiw_users wu ON wu.id = ws.wiw_user_id AND wu.driver_id IS NOT NULL
       JOIN driver_accounts da ON da.driver_id = wu.driver_id AND da.assignment_ended_at IS NULL
       JOIN customers c ON c.id = da.account_id
       WHERE ws.wiw_location_id = $1`,
      [wiwLocationId]
    );
    if (driverMatchQ.rows.length === 1) {
      const row = driverMatchQ.rows[0];
      candidates.push({
        accountId:      row.account_id,
        customerNumber: row.customer_number,
        customerName:   row.customer_name,
        confidence:     92,
        reason:         `Driver email match: drivers assigned to this account have shifts at this WIW location`,
        matchedBy:      "driver_email",
      });
    }
    // If rows.length > 1, drivers at this location span multiple accounts — don't add a candidate
  }

  // Strategy 3: Normalized exact name match (confidence 80)
  const normLoc = normalize(locationName);
  const r2 = await pool.query(
    `SELECT id, customer_number, customer_name FROM customers
     WHERE lower(regexp_replace(customer_name, '[^a-zA-Z0-9 ]', ' ', 'g')) = $1
     LIMIT 2`,
    [normLoc]
  );
  if (r2.rows.length === 1) {
    candidates.push({
      accountId:      r2.rows[0].id,
      customerNumber: r2.rows[0].customer_number,
      customerName:   r2.rows[0].customer_name,
      confidence:     80,
      reason:         `Normalized name exact match`,
      matchedBy:      "normalized_name",
    });
  }

  // Strategy 4: Base name (without number) partial match (confidence 60)
  if (baseName.length > 5) {
    const r3 = await pool.query(
      `SELECT id, customer_number, customer_name FROM customers
       WHERE lower(regexp_replace(customer_name, '[^a-zA-Z0-9 ]', ' ', 'g')) = $1
       LIMIT 2`,
      [baseName]
    );
    if (r3.rows.length === 1) {
      candidates.push({
        accountId:      r3.rows[0].id,
        customerNumber: r3.rows[0].customer_number,
        customerName:   r3.rows[0].customer_name,
        confidence:     60,
        reason:         `Base name match (number stripped)`,
        matchedBy:      "normalized_name",
      });
    }
  }

  if (candidates.length === 0) return null;

  // Deduplicate — if all candidates point to the same account, take the best confidence
  const uniqueAccounts = new Set(candidates.map(c => c.accountId));
  if (uniqueAccounts.size > 1) return null; // conflicting matches → ambiguous

  // Return highest confidence
  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates[0];
}

// ── Main auto-match function ───────────────────────────────────────────────────

export async function autoMatchWiwLocations(opts: {
  dryRun?: boolean;
  onlyUnmapped?: boolean;
} = {}): Promise<AutoMatchResult> {
  const { dryRun = false, onlyUnmapped = false } = opts;
  const result: AutoMatchResult = { processed: 0, matched: 0, unmatched: 0, ambiguous: 0, errors: 0 };

  // Fetch all WIW locations that need processing
  const whereClause = onlyUnmapped
    ? `AND (lam.mapping_status IS NULL OR lam.mapping_status = 'unmapped')`
    : "";

  const locQ = await pool.query(`
    SELECT
      wl.id             AS wiw_location_id,
      wl.name           AS name,
      wl.wiw_account_id AS wiw_workplace_id,
      lam.id            AS map_id,
      lam.mapping_status
    FROM wiw_locations wl
    LEFT JOIN wiw_location_account_map lam ON lam.wiw_location_id = wl.id
    WHERE 1=1 ${whereClause}
    ORDER BY wl.name
  `);

  for (const loc of locQ.rows) {
    result.processed++;
    try {
      const best = await findBestMatch(loc.name, loc.wiw_location_id);

      let status: string;
      let confidence: number;
      let reason: string | null;
      let accountId: string | null;
      let matchedBy: MatchedBy;

      if (best) {
        status     = "mapped";
        confidence = best.confidence;
        reason     = best.reason;
        accountId  = best.accountId;
        matchedBy  = best.matchedBy;
        result.matched++;
      } else {
        const trailingNum = extractTrailingNumber(loc.name);
        if (trailingNum) {
          const ambiguousQ = await pool.query(
            `SELECT COUNT(*) FROM customers WHERE customer_number = $1`, [trailingNum]
          );
          if (parseInt(ambiguousQ.rows[0].count, 10) > 1) {
            status     = "ambiguous";
            confidence = 0;
            reason     = `Multiple accounts match customer_number=${trailingNum}`;
            accountId  = null;
            matchedBy  = "unresolved";
            result.ambiguous++;
          } else {
            status     = "unmapped";
            confidence = 0;
            reason     = null;
            accountId  = null;
            matchedBy  = "unresolved";
            result.unmatched++;
          }
        } else {
          status     = "unmapped";
          confidence = 0;
          reason     = null;
          accountId  = null;
          matchedBy  = "unresolved";
          result.unmatched++;
        }
      }

      if (!dryRun) {
        // Upsert into wiw_location_account_map
        await pool.query(`
          INSERT INTO wiw_location_account_map
            (wiw_location_id, wiw_location_name, wiw_workplace_id, driverhub_account_id,
             mapping_status, confidence_score, match_reason, matched_by, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
          ON CONFLICT (wiw_location_id) DO UPDATE SET
            wiw_location_name    = EXCLUDED.wiw_location_name,
            wiw_workplace_id     = EXCLUDED.wiw_workplace_id,
            driverhub_account_id = CASE
              WHEN wiw_location_account_map.matched_by = 'manual'
              THEN wiw_location_account_map.driverhub_account_id
              ELSE EXCLUDED.driverhub_account_id
            END,
            mapping_status = CASE
              WHEN wiw_location_account_map.matched_by = 'manual'
              THEN wiw_location_account_map.mapping_status
              ELSE EXCLUDED.mapping_status
            END,
            confidence_score = CASE
              WHEN wiw_location_account_map.matched_by = 'manual'
              THEN wiw_location_account_map.confidence_score
              ELSE EXCLUDED.confidence_score
            END,
            match_reason = CASE
              WHEN wiw_location_account_map.matched_by = 'manual'
              THEN wiw_location_account_map.match_reason
              ELSE EXCLUDED.match_reason
            END,
            matched_by = CASE
              WHEN wiw_location_account_map.matched_by = 'manual'
              THEN wiw_location_account_map.matched_by
              ELSE EXCLUDED.matched_by
            END,
            updated_at = now()
        `, [loc.wiw_location_id, loc.name, loc.wiw_workplace_id, accountId, status, confidence, reason, matchedBy]);

        // Keep wiw_locations.account_id in sync for backward-compat joins
        await pool.query(
          `UPDATE wiw_locations SET account_id = $1, updated_at = now() WHERE id = $2`,
          [accountId, loc.wiw_location_id]
        );
      }
    } catch (err: any) {
      result.errors++;
      console.error(`[WIWLocationMatcher] Error processing ${loc.name}:`, err?.message);
    }
  }

  console.log(`[WIWLocationMatcher] Auto-match complete: ${JSON.stringify(result)}`);
  return result;
}

// ── Query helpers ─────────────────────────────────────────────────────────────

export async function getAllLocationMappings(opts: {
  status?: string;
  accountId?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ mappings: LocationMapping[]; total: number }> {
  const conditions: string[] = ["1=1"];
  const params: any[] = [];

  if (opts.status && opts.status !== "all") {
    params.push(opts.status);
    conditions.push(`lam.mapping_status = $${params.length}`);
  }
  if (opts.accountId) {
    params.push(opts.accountId);
    conditions.push(`lam.driverhub_account_id = $${params.length}`);
  }

  const where = conditions.join(" AND ");
  const limit  = opts.limit  ?? 100;
  const offset = opts.offset ?? 0;

  params.push(limit, offset);

  const [rowsQ, countQ] = await Promise.all([
    pool.query(`
      SELECT
        lam.id,
        lam.wiw_workplace_id,
        lam.wiw_location_id,
        lam.wiw_location_name,
        lam.driverhub_account_id,
        c.customer_name  AS account_name,
        c.customer_number,
        lam.mapping_status,
        lam.confidence_score::float AS confidence_score,
        lam.match_reason,
        lam.matched_by,
        lam.notes,
        wl.last_seen_at,
        lam.updated_at
      FROM wiw_location_account_map lam
      LEFT JOIN customers c ON c.id = lam.driverhub_account_id
      LEFT JOIN wiw_locations wl ON wl.id = lam.wiw_location_id
      WHERE ${where}
      ORDER BY lam.mapping_status, lam.wiw_location_name
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params),
    pool.query(`
      SELECT COUNT(*)::int AS total
      FROM wiw_location_account_map lam
      WHERE ${where}
    `, params.slice(0, -2)),
  ]);

  return {
    mappings: rowsQ.rows.map(r => ({
      id:                 r.id,
      wiwWorkplaceId:     r.wiw_workplace_id,
      wiwLocationId:      r.wiw_location_id,
      wiwLocationName:    r.wiw_location_name,
      driverHubAccountId: r.driverhub_account_id,
      accountName:        r.account_name,
      customerNumber:     r.customer_number,
      mappingStatus:      r.mapping_status,
      confidenceScore:    r.confidence_score ?? 0,
      matchReason:        r.match_reason,
      matchedBy:          (r.matched_by ?? "unresolved") as MatchedBy,
      notes:              r.notes ?? null,
      lastSeenAt:         r.last_seen_at ?? null,
      updatedAt:          r.updated_at,
    })),
    total: countQ.rows[0]?.total ?? 0,
  };
}

export async function getAccountLocationMappings(accountId: string): Promise<{
  mapped: LocationMapping[];
  unmappedCount: number;
  ambiguousCount: number;
}> {
  const [mappedQ, unmappedQ, ambiguousQ] = await Promise.all([
    pool.query(`
      SELECT
        lam.id, lam.wiw_workplace_id, lam.wiw_location_id,
        lam.wiw_location_name, lam.driverhub_account_id,
        c.customer_name AS account_name, c.customer_number,
        lam.mapping_status, lam.confidence_score::float AS confidence_score,
        lam.match_reason, lam.matched_by, lam.notes,
        wl.last_seen_at, lam.updated_at
      FROM wiw_location_account_map lam
      LEFT JOIN customers c ON c.id = lam.driverhub_account_id
      LEFT JOIN wiw_locations wl ON wl.id = lam.wiw_location_id
      WHERE lam.driverhub_account_id = $1
      ORDER BY lam.wiw_location_name
    `, [accountId]),
    pool.query(`SELECT COUNT(*)::int AS n FROM wiw_location_account_map WHERE mapping_status = 'unmapped'`),
    pool.query(`SELECT COUNT(*)::int AS n FROM wiw_location_account_map WHERE mapping_status = 'ambiguous'`),
  ]);

  return {
    mapped: mappedQ.rows.map(r => ({
      id:                 r.id,
      wiwWorkplaceId:     r.wiw_workplace_id,
      wiwLocationId:      r.wiw_location_id,
      wiwLocationName:    r.wiw_location_name,
      driverHubAccountId: r.driverhub_account_id,
      accountName:        r.account_name,
      customerNumber:     r.customer_number,
      mappingStatus:      r.mapping_status,
      confidenceScore:    r.confidence_score ?? 0,
      matchReason:        r.match_reason,
      matchedBy:          (r.matched_by ?? "unresolved") as MatchedBy,
      notes:              r.notes ?? null,
      lastSeenAt:         r.last_seen_at ?? null,
      updatedAt:          r.updated_at,
    })),
    unmappedCount:  unmappedQ.rows[0]?.n ?? 0,
    ambiguousCount: ambiguousQ.rows[0]?.n ?? 0,
  };
}

export async function setLocationMapping(
  mapId: string,
  accountId: string | null,
  overrideReason?: string
): Promise<void> {
  const status        = accountId ? "mapped" : "unmapped";
  const govStatus     = accountId ? "active_mapped" : "unmapped";
  const confidence    = accountId ? 100 : 0;
  const reason        = accountId ? (overrideReason ?? "Manual mapping by administrator") : null;
  const matchedBy     = accountId ? "manual" : "unresolved";

  await pool.query(`
    UPDATE wiw_location_account_map
    SET driverhub_account_id  = $1,
        mapping_status        = $2,
        wiw_location_status   = $3,
        confidence_score      = $4,
        match_reason          = $5,
        matched_by            = $6,
        last_reviewed_at      = now(),
        updated_at            = now()
    WHERE id = $7
  `, [accountId, status, govStatus, confidence, reason, matchedBy, mapId]);

  // Sync wiw_locations.account_id
  await pool.query(`
    UPDATE wiw_locations
    SET account_id = $1, updated_at = now()
    WHERE id = (SELECT wiw_location_id FROM wiw_location_account_map WHERE id = $2)
  `, [accountId, mapId]);
}

/** Update governance classification without changing the account mapping */
export async function setGovernanceStatus(
  mapId: string,
  wiwLocationStatus: string,
  statusReason: string | null,
  driverHubAccountId?: string | null,
  reviewedByUserId?: string | null
): Promise<void> {
  const isActiveMapped = wiwLocationStatus === "active_mapped";
  const mappingStatus  = isActiveMapped ? "mapped" : "unmapped";
  const matchedBy      = isActiveMapped ? "manual" : "unresolved";

  if (driverHubAccountId !== undefined) {
    // Full update including account mapping
    await pool.query(`
      UPDATE wiw_location_account_map
      SET wiw_location_status   = $1,
          status_reason         = $2,
          driverhub_account_id  = $3,
          mapping_status        = $4,
          matched_by            = $5,
          confidence_score      = CASE WHEN $3::varchar IS NOT NULL THEN 100 ELSE 0 END,
          last_reviewed_at      = now(),
          reviewed_by_user_id   = $6,
          updated_at            = now()
      WHERE id = $7
    `, [wiwLocationStatus, statusReason, driverHubAccountId, mappingStatus, matchedBy, reviewedByUserId ?? null, mapId]);

    // Sync wiw_locations.account_id
    await pool.query(`
      UPDATE wiw_locations SET account_id = $1, updated_at = now()
      WHERE id = (SELECT wiw_location_id FROM wiw_location_account_map WHERE id = $2)
    `, [driverHubAccountId, mapId]);
  } else {
    // Status-only update, preserve existing account mapping
    await pool.query(`
      UPDATE wiw_location_account_map
      SET wiw_location_status   = $1,
          status_reason         = $2,
          last_reviewed_at      = now(),
          reviewed_by_user_id   = $3,
          updated_at            = now()
      WHERE id = $4
    `, [wiwLocationStatus, statusReason, reviewedByUserId ?? null, mapId]);
  }
}
