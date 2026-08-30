/**
 * Environment Configuration
 *
 * APP_ENV controls which environment this server instance belongs to.
 * Set this in secrets/environment variables:
 *   - development  (default, local dev)
 *   - staging      (staging Replit project)
 *   - production   (production Replit deployment)
 *
 * NODE_ENV is kept as "production" in all deployed Replit environments;
 * APP_ENV is the correct discriminator between staging and prod.
 */

export type AppEnvironment = "development" | "staging" | "production";

function resolveAppEnv(): AppEnvironment {
  const raw = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase();
  if (raw === "staging") return "staging";
  if (raw === "production") return "production";
  return "development";
}

export const APP_ENV: AppEnvironment = resolveAppEnv();
export const IS_PRODUCTION = APP_ENV === "production";
export const IS_STAGING    = APP_ENV === "staging";
export const IS_DEV        = APP_ENV === "development";

/**
 * Log prefix for environment-specific output.
 * Staging and production are clearly labelled; dev is unlabelled to avoid noise.
 */
export const ENV_LOG_PREFIX = IS_PRODUCTION ? "[PROD]" : IS_STAGING ? "[STAGING]" : "[DEV]";

/**
 * Resolve the correct database URL for this environment.
 *
 * Priority order per environment:
 *   production  → NEON_DATABASE_URL           (existing secret)
 *   staging     → NEON_DATABASE_URL_STAGING   (set in staging Repl secrets)
 *   development → NEON_DATABASE_URL           (dev uses same Neon project by default)
 *                 Override with NEON_DATABASE_URL_DEV for full isolation.
 *
 * Falls back to DATABASE_URL if none of the above are set.
 */
export function resolveDbUrl(): string {
  const stagingUrl = process.env.NEON_DATABASE_URL_STAGING;
  const devUrl     = process.env.NEON_DATABASE_URL_DEV;
  const neonUrl    = process.env.NEON_DATABASE_URL;
  const fallback   = process.env.DATABASE_URL;

  if (IS_STAGING && stagingUrl) return stagingUrl;
  if (IS_DEV     && devUrl)     return devUrl;
  return neonUrl ?? fallback ?? "";
}

/**
 * WhenIWork API token for this environment.
 * Each environment should have its OWN token pointing to its own WIW account/sub-account.
 * Never share a WIW token across environments.
 *
 * WHENIWORK_API_TOKEN        → production (existing)
 * WHENIWORK_API_TOKEN_STAGING → staging
 */
export function resolveWiwToken(): string | undefined {
  if (IS_STAGING) return process.env.WHENIWORK_API_TOKEN_STAGING ?? process.env.WHENIWORK_API_TOKEN;
  return process.env.WHENIWORK_API_TOKEN;
}

/**
 * Driver data encryption key for this environment.
 * MUST be different per environment — staging must never decrypt prod data.
 *
 * DRIVER_DATA_ENCRYPTION_KEY          → production (existing)
 * DRIVER_DATA_ENCRYPTION_KEY_STAGING  → staging
 */
export function resolveEncryptionKey(): string | undefined {
  if (IS_STAGING) return process.env.DRIVER_DATA_ENCRYPTION_KEY_STAGING ?? process.env.DRIVER_DATA_ENCRYPTION_KEY;
  return process.env.DRIVER_DATA_ENCRYPTION_KEY;
}

/**
 * DriverConnect API base URL for this environment.
 * Prevents cross-environment API calls between DriverConnect and DriverHub.
 */
export function resolveDriverConnectOrigin(): string {
  if (IS_PRODUCTION) return process.env.DRIVERCONNECT_ORIGIN_PROD ?? "";
  if (IS_STAGING)    return process.env.DRIVERCONNECT_ORIGIN_STAGING ?? "";
  return process.env.DRIVERCONNECT_ORIGIN_DEV ?? "http://localhost:3001";
}

/**
 * Session secret for this environment. Never share across environments.
 */
export function resolveSessionSecret(): string {
  return process.env.SESSION_SECRET ?? "dev-fallback-session-secret-change-me";
}

// ── Startup banner ─────────────────────────────────────────────────────────────
export function printEnvironmentBanner(): void {
  const dbUrl = resolveDbUrl();
  const dbHost = dbUrl ? dbUrl.replace(/postgresql?:\/\/[^@]+@/, "").split("/")[0].split(":")[0] : "NOT SET";
  const wiwConfigured = !!resolveWiwToken();

  const lines = [
    `┌${"─".repeat(60)}┐`,
    `│  DriverHub 360 — ${APP_ENV.toUpperCase().padEnd(42)}│`,
    `│  DB host : ${dbHost.slice(0, 48).padEnd(48)}│`,
    `│  WIW API : ${(wiwConfigured ? "CONFIGURED" : "NOT SET (sync disabled)").padEnd(48)}│`,
    `│  Encrypt : ${(resolveEncryptionKey() ? "CONFIGURED" : "WARNING: using dev fallback").padEnd(48)}│`,
    `└${"─".repeat(60)}┘`,
  ];
  lines.forEach(l => console.log(l));
}
