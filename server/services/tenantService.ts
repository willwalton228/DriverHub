/**
 * Tenant Scoping Service
 *
 * All finance operations are scoped to the authenticated user's organization (tenant).
 * - Each user's orgId (from the users table) determines their tenant.
 * - Super admins and platform-level roles see all tenants.
 * - Finance records are always written with the user's tenantId.
 * - Reads are always filtered to the user's tenantId (or unscoped for super admins).
 */

import { db } from "../db";
import { users, organizations } from "@shared/schema";
import { eq } from "drizzle-orm";

// Roles that bypass tenant isolation (can see all tenants)
const SUPER_ROLES = new Set(["super_user", "super_admin"]);

// Roles that can access Account Reports (read + use)
const ACCOUNT_REPORTS_ROLES = new Set(["super_user", "super_admin", "corporate", "corporate_admin"]);

export interface TenantContext {
  tenantId: string | null;
  isSuperAdmin: boolean;
  userId: string;
  userRole: string | null;
}

/**
 * Returns true if the tenant context grants access to the Account Reports module.
 * Allowed: super_user, super_admin, corporate, corporate_admin.
 */
export function canAccessAccountReports(ctx: TenantContext): boolean {
  return ACCOUNT_REPORTS_ROLES.has(ctx.userRole ?? "");
}

/**
 * Resolves the tenant context for a given user.
 * Returns the user's orgId as tenantId, null for users without an org.
 * Super admins bypass all tenant checks.
 */
export async function resolveTenantContext(userId: string): Promise<TenantContext> {
  const [user] = await db
    .select({ orgId: users.orgId, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw Object.assign(new Error("User not found"), { statusCode: 401 });
  }

  const isSuperAdmin = SUPER_ROLES.has(user.role ?? "");

  return {
    tenantId: user.orgId ?? null,
    isSuperAdmin,
    userId,
    userRole: user.role ?? null,
  };
}

/**
 * Builds a Drizzle WHERE clause fragment for tenant-scoped queries.
 * Super admins get all records; others get only their org's records.
 *
 * Usage:
 *   const tenantCtx = await resolveTenantContext(userId);
 *   const filter = buildTenantFilter(table, tenantCtx);
 *   // filter is either undefined (no filter) or a SQL condition
 */
export function buildTenantFilter<T extends { tenantId: any }>(
  table: T,
  ctx: TenantContext
): ReturnType<typeof eq> | undefined {
  if (ctx.isSuperAdmin) return undefined;
  if (!ctx.tenantId) return undefined;
  return eq(table.tenantId, ctx.tenantId);
}

/**
 * Validates that a record belongs to the requesting user's tenant.
 * Throws 403 if there is a mismatch and the user is not a super admin.
 */
export function assertTenantAccess(
  ctx: TenantContext,
  recordTenantId: string | null | undefined
): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.tenantId) return;
  if (!recordTenantId) return;
  if (recordTenantId !== ctx.tenantId) {
    throw Object.assign(new Error("Access denied: cross-tenant access not allowed"), {
      statusCode: 403,
      errorCode: "CROSS_TENANT_ACCESS",
    });
  }
}

/**
 * Express middleware helper — resolves tenant context from req.user.
 * Attaches tenantCtx to req for downstream use.
 */
export async function withTenantContext(
  req: any
): Promise<TenantContext> {
  // Support both session-based auth (req.session.userId) and Replit OIDC (req.user.claims.sub)
  const userId = req.session?.userId || req.user?.claims?.sub;
  if (!userId) {
    throw Object.assign(new Error("Authentication required"), { statusCode: 401 });
  }
  return resolveTenantContext(userId);
}

/**
 * Finance module access check — explicit DB permission only.
 *
 * No role inherits Finance access automatically. Every user requires an
 * explicit row in `finance_permissions` with canViewModule=true, granted
 * by a super_user. Only users with role=super_user bypass the DB check.
 */
export async function hasFinanceAccess(
  userId: string,
  role: string | null | undefined
): Promise<boolean> {
  const { hasFinanceModuleAccess } = await import("./financePermissionsService");
  return hasFinanceModuleAccess(userId, role);
}
