/**
 * Returns the canonical base URL for this application.
 *
 * Priority:
 *   1. APP_BASE_URL  — set explicitly in the production environment
 *   2. http://localhost:5000 — dev fallback
 *
 * NEVER use REPLIT_DEV_DOMAIN for user-facing links — that is a temporary
 * workspace preview host that is inaccessible after the dev session ends.
 */
export function getAppBaseUrl(): string {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/$/, "");
  }
  return "http://localhost:5000";
}

/**
 * Builds a full accept-invite URL for the given token.
 */
export function buildInviteUrl(token: string): string {
  return `${getAppBaseUrl()}/accept-invite/${token}`;
}
