/**
 * SQL Migration Runner
 * ─────────────────────────────────────────────────────────────────────────────
 * Applies numbered SQL migration files in order.
 * Tracks applied migrations in `schema_migrations` table so each file
 * runs exactly once, regardless of how many times the runner is invoked.
 *
 * Usage:
 *   npx tsx server/migrations/runner.ts
 *
 * Convention:
 *   Files must be named  NNNN_description.sql  (zero-padded 4-digit number).
 *   They are applied in ascending numeric order.
 *   Every migration file MUST be idempotent (use IF NOT EXISTS / IF EXISTS).
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

neonConfig.webSocketConstructor = ws;

const DB_URL = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("ERROR: NEON_DATABASE_URL (or DATABASE_URL) is not set.");
  process.exit(1);
}

const pool = new Pool({ connectionString: DB_URL });

async function run() {
  const client = await pool.connect();
  try {
    // Ensure tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     VARCHAR PRIMARY KEY,
        description VARCHAR,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // Discover migration files
    const migrationsDir = path.join(__dirname);
    const files = fs.readdirSync(migrationsDir)
      .filter(f => /^\d{4}_.*\.sql$/.test(f))
      .sort();

    if (files.length === 0) {
      console.log("[Migrations] No .sql files found in", migrationsDir);
      return;
    }

    // Fetch already-applied versions
    const { rows } = await client.query<{ version: string }>(
      "SELECT version FROM schema_migrations ORDER BY version"
    );
    const applied = new Set(rows.map(r => r.version));

    let ranCount = 0;
    for (const file of files) {
      const version     = file.replace(/\.sql$/, "");
      const description = version.replace(/^\d{4}_/, "").replace(/_/g, " ");

      if (applied.has(version)) {
        console.log(`[Migrations] ✓ ${version} (already applied)`);
        continue;
      }

      console.log(`[Migrations] ⟶ Applying ${version}…`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version, description) VALUES ($1, $2)",
          [version, description]
        );
        await client.query("COMMIT");
        console.log(`[Migrations] ✓ ${version} applied`);
        ranCount++;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`[Migrations] ✗ ${version} FAILED — rolled back:`, err);
        process.exit(1);
      }
    }

    if (ranCount === 0) {
      console.log("[Migrations] Database is up to date. Nothing to apply.");
    } else {
      console.log(`[Migrations] Done — ${ranCount} migration(s) applied.`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error("[Migrations] Unexpected error:", err);
  process.exit(1);
});
