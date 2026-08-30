export const DRIVER_FULL_SSN_PERMISSION = "view_full_driver_ssn" as const;
export const DRIVER_FULL_SSN_AUDIT_EVENT = "driver_full_ssn_viewed" as const;

/**
 * Full Driver SSN/EIN access is an explicit per-user grant. This helper has no
 * schema dependency so the security boundary can be tested independently.
 */
export function hasExplicitFullDriverSsnAccess(user: any): boolean {
  if (!user || user.status !== "ACTIVE") return false;
  return user.actionPermissions?.[DRIVER_FULL_SSN_PERMISSION] === true;
}

/**
 * Update the explicit Driver SSN permission without dropping unrelated action
 * permissions stored on the same user record.
 */
export function withExplicitFullDriverSsnAccess(
  actionPermissions: unknown,
  enabled: boolean,
): Record<string, boolean> {
  const existing = actionPermissions && typeof actionPermissions === "object"
    ? actionPermissions as Record<string, boolean>
    : {};

  return {
    ...existing,
    [DRIVER_FULL_SSN_PERMISSION]: enabled,
  };
}

/**
 * Ordinary Driver responses must never contain either the encrypted storage
 * value or an accidental plaintext alias. The last four digits remain safe
 * for the masked Driver Detail display.
 */
export function redactDriverSsnFields<T extends Record<string, any>>(response: T): Omit<T, "ssnOrEin" | "ssnOrEinEncrypted"> {
  const redacted = { ...response };
  delete redacted.ssnOrEin;
  delete redacted.ssnOrEinEncrypted;
  return redacted;
}

export function buildDriverSsnViewAuditMetadata() {
  return {
    action: "Full SSN Viewed",
    field: "ssn_or_ein",
  } as const;
}