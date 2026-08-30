import type { User } from "@shared/schema";

const AUTOMATIC_CORPORATE_ACCESS_ROLES = new Set([
  "super_user",
  "super_admin",
  "admin",
  "corporate_admin",
  "corporate",
  "employee",
  "finance",
  "recruiter",
  "recruiting_admin",
  "ops_manager",
  "payroll_admin",
  "dispatcher",
  "regional_cl",
  "network_cl",
  "dealer_cl",
  "certification_liaison",
  "custom_user_list",
  "testing",
]);

export function hasAutomaticCorporateAccess(
  user: Pick<User, "status" | "role" | "orgId" | "hasDriverHubAccess" | "pendingActivation">,
): boolean {
  return user.status === "ACTIVE"
    && !!user.orgId
    && !!user.role
    && AUTOMATIC_CORPORATE_ACCESS_ROLES.has(user.role)
    && user.hasDriverHubAccess !== false
    && user.pendingActivation !== true;
}

export function isUserProvisionedForAccess(
  user: Pick<User, "status" | "role" | "orgId" | "isProvisioned" | "hasDriverHubAccess" | "pendingActivation">,
): boolean {
  if (hasAutomaticCorporateAccess(user)) return true;

  return user.status === "ACTIVE"
    && !!user.isProvisioned
    && !!user.orgId
    && !!user.role
    && user.hasDriverHubAccess !== false
    && user.pendingActivation !== true;
}