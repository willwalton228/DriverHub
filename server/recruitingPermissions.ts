import { db } from "./db";
import { eq, and, inArray } from "drizzle-orm";
import {
  userRecruitingMarkets,
  systemIntegrationUsers,
  recruitingPermissionAuditLog,
  type UserRecruitingMarket,
} from "@shared/schema";
import crypto from "crypto";

export type RecruitingPermission = "read" | "write" | "approve" | "export" | "admin";
export type RecruitingRole = "viewer" | "recruiter" | "hiring_manager" | "admin" | "system";

export interface UserRecruitingContext {
  userId: string;
  userRole: string;
  isAdmin: boolean;
  isSystemUser: boolean;
  authorizedMarkets: string[];
  permissions: RecruitingPermission[];
  canExport: boolean;
  canBulkAction: boolean;
}

const roleDefaultPermissions: Record<RecruitingRole, RecruitingPermission[]> = {
  viewer: ["read"],
  recruiter: ["read", "write"],
  hiring_manager: ["read", "write", "approve"],
  admin: ["read", "write", "approve", "export", "admin"],
  system: ["read"],
};

export async function getUserRecruitingContext(userId: string, userRole: string): Promise<UserRecruitingContext> {
  const isGlobalAdmin = userRole === "admin" || userRole === "super_admin";
  
  if (isGlobalAdmin) {
    return {
      userId,
      userRole,
      isAdmin: true,
      isSystemUser: false,
      authorizedMarkets: [], // Empty means all markets for admin
      permissions: ["read", "write", "approve", "export", "admin"],
      canExport: true,
      canBulkAction: true,
    };
  }

  const marketAssignments = await db.select()
    .from(userRecruitingMarkets)
    .where(eq(userRecruitingMarkets.userId, userId));

  if (marketAssignments.length === 0) {
    return {
      userId,
      userRole,
      isAdmin: false,
      isSystemUser: false,
      authorizedMarkets: [],
      permissions: [],
      canExport: false,
      canBulkAction: false,
    };
  }

  const authorizedMarkets = Array.from(new Set(marketAssignments.map(m => m.market)));
  const allPermissions = Array.from(new Set(marketAssignments.flatMap(m => m.permissions || [])));
  const canExport = marketAssignments.some(m => m.canExport);
  const canBulkAction = marketAssignments.some(m => m.canBulkAction);
  const hasAdminRole = marketAssignments.some(m => m.role === "admin");

  return {
    userId,
    userRole,
    isAdmin: hasAdminRole,
    isSystemUser: false,
    authorizedMarkets,
    permissions: allPermissions as RecruitingPermission[],
    canExport,
    canBulkAction,
  };
}

export async function getSystemUserContext(apiKey: string): Promise<UserRecruitingContext | null> {
  const apiKeyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
  
  const [systemUser] = await db.select()
    .from(systemIntegrationUsers)
    .where(and(
      eq(systemIntegrationUsers.apiKeyHash, apiKeyHash),
      eq(systemIntegrationUsers.isActive, true)
    ));

  if (!systemUser) {
    return null;
  }

  await db.update(systemIntegrationUsers)
    .set({ lastUsedAt: new Date() })
    .where(eq(systemIntegrationUsers.id, systemUser.id));

  return {
    userId: systemUser.id,
    userRole: "system",
    isAdmin: false,
    isSystemUser: true,
    authorizedMarkets: systemUser.markets || [],
    permissions: ["read"],
    canExport: false,
    canBulkAction: false,
  };
}

export function hasPermission(context: UserRecruitingContext, permission: RecruitingPermission): boolean {
  if (context.isAdmin) return true;
  return context.permissions.includes(permission);
}

/**
 * Read-only discovery is a Recruiting capability, not general Corporate access.
 * Keep this separate from account/driver administration so selector endpoints can
 * grant the minimum access needed by an authorized recruiter.
 */
export function hasRecruitingDiscoveryAccess(context: UserRecruitingContext): boolean {
  return hasPermission(context, "read");
}

/**
 * Legacy Campaign/Request routes predate market-scoped permission records.
 * Preserve their existing Corporate and Recruiting role access while ensuring
 * an unrelated authenticated role cannot enter the Recruiting module.
 */
const RECRUITING_MODULE_READ_ROLES = new Set([
  "corporate",
  "admin",
  "super_user",
  "super_admin",
  "root_super_admin",
  "corporate_admin",
  "manager",
  "recruiter",
  "recruiting_admin",
  "hiring_manager",
  // Employee is a corporate-portal role. Recruiting dashboard statistics and
  // requisitions already admit it through hasCorporateAccess; legacy Campaign
  // reads must apply the same authenticated role decision.
  "employee",
]);

export function hasRecruitingModuleReadAccess(context: UserRecruitingContext): boolean {
  return hasPermission(context, "read") || RECRUITING_MODULE_READ_ROLES.has(context.userRole);
}

/**
 * Job Postings belong to the legacy Campaign workflow, whose records frequently
 * do not have an authoritative market. Keep mutations limited to established
 * Recruiting management roles (or an explicit Recruiting write grant) without
 * treating a missing Campaign market as an authorization failure.
 */
const RECRUITING_JOB_POSTING_WRITE_ROLES = new Set([
  "super_user",
  "super_admin",
  "root_super_admin",
  "admin",
  "corporate_admin",
  "manager",
  "recruiter",
  "recruiting_admin",
  "hiring_manager",
]);

export function hasRecruitingJobPostingWriteAccess(context: UserRecruitingContext): boolean {
  return hasPermission(context, "write")
    || RECRUITING_JOB_POSTING_WRITE_ROLES.has(context.userRole);
}

export function hasMarketAccess(context: UserRecruitingContext, market: string): boolean {
  if (context.isAdmin) return true;
  if (context.authorizedMarkets.length === 0 && !context.isAdmin) return false;
  return context.authorizedMarkets.includes(market);
}

/**
 * Confirms that a Recruiting permission is present and that the trusted record
 * belongs to a market the actor may access. Non-admin users may not act on
 * records without a market because that would bypass market scoping.
 */
export function hasRecruitingRecordAccess(
  context: UserRecruitingContext,
  permission: RecruitingPermission,
  market: string | null | undefined,
): boolean {
  if (!hasPermission(context, permission)) return false;
  if (context.isAdmin) return true;
  return !!market && hasMarketAccess(context, market);
}

export function hasMultiMarketAccess(context: UserRecruitingContext, markets: string[]): boolean {
  if (context.isAdmin) return true;
  return markets.every(market => context.authorizedMarkets.includes(market));
}

export function filterByAuthorizedMarkets<T extends { market?: string | null }>(
  items: T[],
  context: UserRecruitingContext
): T[] {
  if (context.isAdmin) return items;
  if (context.authorizedMarkets.length === 0) return [];
  return items.filter(item => item.market && context.authorizedMarkets.includes(item.market));
}

export function getMarketFilter(context: UserRecruitingContext): string[] | null {
  if (context.isAdmin) return null;
  if (context.authorizedMarkets.length === 0) return [];
  return context.authorizedMarkets;
}

export async function checkBulkActionPermission(
  applicationIds: string[],
  context: UserRecruitingContext
): Promise<{ allowed: boolean; reason?: string; unauthorizedIds?: string[] }> {
  if (!context.canBulkAction && !context.isAdmin) {
    return { allowed: false, reason: "User does not have bulk action permission" };
  }

  // Admin users have access to all markets
  if (context.isAdmin) {
    return { allowed: true };
  }

  // Fetch application markets from database
  const { recruitingApplications, recruitingRequisitions } = await import("@shared/schema");
  const applications = await db.select({
    id: recruitingApplications.id,
    market: recruitingRequisitions.market,
  })
  .from(recruitingApplications)
  .innerJoin(recruitingRequisitions, eq(recruitingApplications.requisitionId, recruitingRequisitions.id))
  .where(inArray(recruitingApplications.id, applicationIds));

  // Verify all requested IDs were found (prevent unknown/missing IDs from bypassing checks)
  const foundIds = new Set(applications.map(a => a.id));
  const missingIds = applicationIds.filter(id => !foundIds.has(id));
  if (missingIds.length > 0) {
    return {
      allowed: false,
      reason: `${missingIds.length} application ID(s) not found or inaccessible`,
      unauthorizedIds: missingIds
    };
  }

  // Check if all applications are in authorized markets
  const unauthorizedIds: string[] = [];
  for (const app of applications) {
    // Treat null/undefined market as unauthorized to prevent leakage
    if (!app.market || !context.authorizedMarkets.includes(app.market)) {
      unauthorizedIds.push(app.id);
    }
  }

  if (unauthorizedIds.length > 0) {
    return { 
      allowed: false, 
      reason: `User does not have access to ${unauthorizedIds.length} application(s) in unauthorized markets`,
      unauthorizedIds
    };
  }

  return { allowed: true };
}

export function checkExportPermission(
  context: UserRecruitingContext,
  requestedMarket?: string | null
): { allowed: boolean; reason?: string } {
  if (!context.canExport && !context.isAdmin) {
    return { allowed: false, reason: "User does not have export permission" };
  }

  // Admin users can export any market
  if (context.isAdmin) {
    return { allowed: true };
  }

  // If a specific market is requested, check access
  if (requestedMarket && !context.authorizedMarkets.includes(requestedMarket)) {
    return { 
      allowed: false, 
      reason: `Cannot export data from unauthorized market: ${requestedMarket}` 
    };
  }

  // If no market specified, exports will be automatically filtered to authorized markets
  return { allowed: true };
}

export async function logPermissionChange(
  userId: string,
  action: "grant" | "revoke" | "modify",
  market: string | null,
  oldPermissions: string[] | null,
  newPermissions: string[] | null,
  oldRole: string | null,
  newRole: string | null,
  reason: string | null,
  performedBy: string
): Promise<void> {
  await db.insert(recruitingPermissionAuditLog).values({
    userId,
    action,
    market,
    oldPermissions,
    newPermissions,
    oldRole,
    newRole,
    reason,
    performedBy,
  });
}

export async function grantMarketAccess(
  userId: string,
  market: string,
  role: RecruitingRole,
  options: { canExport?: boolean; canBulkAction?: boolean } = {},
  performedBy: string
): Promise<UserRecruitingMarket> {
  const permissions = roleDefaultPermissions[role];
  
  const [existing] = await db.select()
    .from(userRecruitingMarkets)
    .where(and(
      eq(userRecruitingMarkets.userId, userId),
      eq(userRecruitingMarkets.market, market)
    ));

  if (existing) {
    const [updated] = await db.update(userRecruitingMarkets)
      .set({
        role,
        permissions,
        canExport: options.canExport ?? existing.canExport,
        canBulkAction: options.canBulkAction ?? existing.canBulkAction,
        updatedAt: new Date(),
      })
      .where(eq(userRecruitingMarkets.id, existing.id))
      .returning();

    await logPermissionChange(
      userId, "modify", market,
      existing.permissions, permissions,
      existing.role, role,
      "Market access updated",
      performedBy
    );

    return updated;
  }

  const [created] = await db.insert(userRecruitingMarkets)
    .values({
      userId,
      market,
      role,
      permissions,
      canExport: options.canExport ?? false,
      canBulkAction: options.canBulkAction ?? false,
      createdBy: performedBy,
    })
    .returning();

  await logPermissionChange(
    userId, "grant", market,
    null, permissions,
    null, role,
    "Market access granted",
    performedBy
  );

  return created;
}

export async function revokeMarketAccess(
  userId: string,
  market: string,
  reason: string,
  performedBy: string
): Promise<void> {
  const [existing] = await db.select()
    .from(userRecruitingMarkets)
    .where(and(
      eq(userRecruitingMarkets.userId, userId),
      eq(userRecruitingMarkets.market, market)
    ));

  if (!existing) return;

  await db.delete(userRecruitingMarkets)
    .where(eq(userRecruitingMarkets.id, existing.id));

  await logPermissionChange(
    userId, "revoke", market,
    existing.permissions, null,
    existing.role, null,
    reason,
    performedBy
  );
}

export async function getUserMarketAssignments(userId: string): Promise<UserRecruitingMarket[]> {
  return await db.select()
    .from(userRecruitingMarkets)
    .where(eq(userRecruitingMarkets.userId, userId));
}

export async function getMarketUsers(market: string): Promise<UserRecruitingMarket[]> {
  return await db.select()
    .from(userRecruitingMarkets)
    .where(eq(userRecruitingMarkets.market, market));
}

export function validateEndpointAccess(
  systemUser: { allowedEndpoints: string[]; allowedMethods: string[] },
  endpoint: string,
  method: string
): boolean {
  const methodAllowed = systemUser.allowedMethods.includes(method) || 
                       systemUser.allowedMethods.includes("*");
  
  if (!methodAllowed) return false;

  for (const pattern of systemUser.allowedEndpoints) {
    if (pattern === "*") return true;
    if (pattern === endpoint) return true;
    if (pattern.endsWith("*") && endpoint.startsWith(pattern.slice(0, -1))) return true;
  }

  return false;
}
