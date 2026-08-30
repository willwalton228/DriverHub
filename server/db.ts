import { Pool, neonConfig, types } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
import { resolveDbUrl, APP_ENV } from "./config/environment";

neonConfig.webSocketConstructor = ws;

// ── Prevent UTC→local timezone shift on DATE columns ───────────────────────
// By default, pg converts PostgreSQL `date` values (e.g. "2024-12-27") into
// JavaScript Date objects at UTC midnight ("2024-12-27T00:00:00.000Z"). When
// JSON-serialised and rendered in a US browser (UTC-6), that midnight-UTC
// instant falls on the *previous* day (Dec 26). Returning the raw ISO string
// instead means the value is always transmitted as "2024-12-27" and never
// misread across timezones.
types.setTypeParser(1082, (val: string) => val); // date          → "YYYY-MM-DD"
types.setTypeParser(1114, (val: string) => val); // timestamp     → "YYYY-MM-DD HH:MM:SS"
types.setTypeParser(1184, (val: string) => val); // timestamptz   → "YYYY-MM-DD HH:MM:SS+TZ"
// Allow Neon compute extra time to wake from scale-to-zero before giving up
neonConfig.poolQueryViaFetch = true;

// Resolve DB URL based on APP_ENV:
//   production  → NEON_DATABASE_URL
//   staging     → NEON_DATABASE_URL_STAGING
//   development → NEON_DATABASE_URL (or NEON_DATABASE_URL_DEV if set)
const resolvedDbUrl = resolveDbUrl();

if (!resolvedDbUrl) {
  throw new Error(
    `No database URL found for environment "${APP_ENV}". ` +
    `Set NEON_DATABASE_URL${APP_ENV === "staging" ? "_STAGING" : ""} in your secrets.`,
  );
}

const dbHostShort = resolvedDbUrl.replace(/postgresql?:\/\/[^@]+@/, "").split("/")[0].split(":")[0];
console.log(`[DB] Using ${APP_ENV.toUpperCase()} database → host: ${dbHostShort}`);

export const DB_URL = resolvedDbUrl;

export const pool = new Pool({
  connectionString: resolvedDbUrl,
  // Give Neon compute up to 10s to wake from scale-to-zero
  connectionTimeoutMillis: 10000,
  // Keep idle connections alive longer to avoid repeat cold starts
  idleTimeoutMillis: 60000,
  max: 10,
});

export const db = drizzle({ client: pool, schema });

// Retry wrapper for DB operations that may hit Neon cold-start errors.
// Catches "endpoint has been disabled" (cold-start) and retries with backoff.
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const msg: string = err?.message || "";
      const isNeonColdStart =
        msg.includes("endpoint has been disabled") ||
        msg.includes("Control plane request failed") ||
        msg.includes("endpoint is disabled");

      if (isNeonColdStart && attempt < maxAttempts) {
        const delay = 1000 * attempt; // 1s, 2s, 3s
        console.warn(
          `[DB] Neon cold-start detected (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms...`,
        );
        await new Promise((r) => setTimeout(r, delay));
        lastError = err;
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}
