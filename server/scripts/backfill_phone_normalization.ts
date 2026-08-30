/**
 * Backfill: Driver Phone Normalization
 * ─────────────────────────────────────────────────────────────────────────────
 * Ticket 2: Driver Phone Normalization and SMS Validation Readiness
 *
 * One-time script — safe to re-run (idempotent).
 * Processes all driver records in batches of 500 to avoid table locks.
 * For each driver:
 *   1. Reads phone_number (raw)
 *   2. Normalizes to E.164
 *   3. Validates for SMS eligibility
 *   4. Writes: mobile_phone_normalized, mobile_phone_is_valid,
 *              sms_eligible, sms_invalid_reason, last_phone_validation_at
 *
 * Usage:
 *   npx tsx server/scripts/backfill_phone_normalization.ts
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

import { validatePhone } from "../services/phoneNormalizationService";

const DB_URL = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!DB_URL) { console.error("No DB URL"); process.exit(1); }

const pool = new Pool({ connectionString: DB_URL });
const BATCH_SIZE = 500;

type Reason = string | null;
interface Summary {
  total:    number;
  valid:    number;
  invalid:  number;
  byReason: Record<string, number>;
}

async function run() {
  const client = await pool.connect();
  const summary: Summary = { total: 0, valid: 0, invalid: 0, byReason: {} };

  try {
    console.log("[PhoneBackfill] Starting driver phone normalization backfill…");

    // Count total
    const countRow = await client.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM drivers"
    );
    const totalDrivers = parseInt(countRow.rows[0].count, 10);
    console.log(`[PhoneBackfill] Total drivers to process: ${totalDrivers}`);

    let offset = 0;
    while (true) {
      const batch = await client.query<{ id: string; phone_number: string | null }>(
        `SELECT id, phone_number FROM drivers ORDER BY created_at, id LIMIT $1 OFFSET $2`,
        [BATCH_SIZE, offset]
      );

      if (batch.rows.length === 0) break;

      for (const row of batch.rows) {
        const result = validatePhone(row.phone_number);
        const reason: Reason = result.invalidReason;

        await client.query(
          `UPDATE drivers
              SET mobile_phone_normalized  = $1,
                  mobile_phone_is_valid    = $2,
                  sms_eligible             = $3,
                  sms_invalid_reason       = $4,
                  last_phone_validation_at = now()
            WHERE id = $5`,
          [result.normalized, result.isValid, result.smsEligible, reason, row.id]
        );

        summary.total++;
        if (result.smsEligible) {
          summary.valid++;
        } else {
          summary.invalid++;
          const key = reason ?? "unknown";
          summary.byReason[key] = (summary.byReason[key] ?? 0) + 1;
        }
      }

      offset += BATCH_SIZE;
      const pct = Math.round((Math.min(offset, totalDrivers) / totalDrivers) * 100);
      console.log(`[PhoneBackfill] Processed ${Math.min(offset, totalDrivers)}/${totalDrivers} (${pct}%)`);
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log("\n══════════════════════════════════════════════");
    console.log("  BACKFILL COMPLETE — Phone Normalization");
    console.log("══════════════════════════════════════════════");
    console.log(`  Total drivers processed : ${summary.total}`);
    console.log(`  SMS eligible (valid)    : ${summary.valid}`);
    console.log(`  Invalid / ineligible    : ${summary.invalid}`);
    if (Object.keys(summary.byReason).length > 0) {
      console.log("\n  Breakdown by invalid reason:");
      for (const [reason, count] of Object.entries(summary.byReason).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${reason.padEnd(22)} : ${count}`);
      }
    }
    console.log("══════════════════════════════════════════════\n");

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error("[PhoneBackfill] Fatal error:", err);
  process.exit(1);
});
