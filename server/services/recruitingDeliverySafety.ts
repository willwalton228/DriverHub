export const RECRUITING_EXTERNAL_DELIVERY_MODE_ENV = "RECRUITING_EXTERNAL_DELIVERY_MODE";

/**
 * Non-production Recruiting delivery is fail-closed. Production is intentionally
 * excluded so staging safety controls can never suppress live delivery.
 */
export function isRecruitingExternalDeliverySuppressed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV !== "production";
}

export function getRecruitingExternalDeliverySuppressionReason(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configuredMode = env[RECRUITING_EXTERNAL_DELIVERY_MODE_ENV] || "default_fail_closed";
  return `Recruiting external delivery suppressed in non-production (${configuredMode})`;
}