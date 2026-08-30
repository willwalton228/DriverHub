/**
 * Finance Permissions Service
 *
 * Provides explicit, per-user Finance module access control.
 * No role inherits Finance access automatically — every user requires
 * an explicit row in `finance_permissions` granted by a super_user.
 *
 * Super users (role = super_user) bypass the DB check and always have full access.
 */

import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import { financePermissions, users, FinancePermission, InsertFinancePermission } from "../../shared/schema";
import { sql } from "drizzle-orm";

// ── Constants ──────────────────────────────────────────────────────────────────

export const FINANCE_PERM_DEFAULTS: Omit<InsertFinancePermission, "userId"> = {
  canViewModule:    false,
  canViewDashboard: false,
  canViewRevenue:   false,
  canViewExpenses:  false,
  canViewMargin:    false,
  canExport:        false,
  canManageQbSync:  false,
  canManageProducts: false,
};

export const FINANCE_PERM_FULL: Omit<InsertFinancePermission, "userId"> = {
  canViewModule:    true,
  canViewDashboard: true,
  canViewRevenue:   true,
  canViewExpenses:  true,
  canViewMargin:    true,
  canExport:        true,
  canManageQbSync:  true,
  canManageProducts: true,
};

// ── Type ───────────────────────────────────────────────────────────────────────

export type FinancePermsResult = Omit<FinancePermission, "id" | "userId" | "grantedBy" | "grantedAt" | "updatedBy" | "updatedAt"> & {
  isSuperAdmin: boolean;
};

// ── Core helpers ───────────────────────────────────────────────────────────────

/**
 * Returns true if the user role is super_user — bypasses all explicit checks.
 */
export function isSuperUserRole(role: string | null | undefined): boolean {
  return role === "super_user";
}

/**
 * Fetch the Finance permission row for a user. Returns null if none granted.
 */
export async function getFinancePermissions(userId: string): Promise<FinancePermission | null> {
  const [row] = await db.select().from(financePermissions)
    .where(eq(financePermissions.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * Resolve effective Finance permissions for a user.
 * Super users always get full access without a DB row.
 * All other users must have an explicit row with canViewModule=true.
 */
export async function resolveFinanceAccess(userId: string, role: string | null | undefined): Promise<FinancePermsResult> {
  if (isSuperUserRole(role)) {
    return { ...FINANCE_PERM_FULL, isSuperAdmin: true };
  }
  const row = await getFinancePermissions(userId);
  if (!row || !row.canViewModule) {
    return { ...FINANCE_PERM_DEFAULTS, isSuperAdmin: false };
  }
  return {
    canViewModule:    row.canViewModule,
    canViewDashboard: row.canViewDashboard,
    canViewRevenue:   row.canViewRevenue,
    canViewExpenses:  row.canViewExpenses,
    canViewMargin:    row.canViewMargin,
    canExport:        row.canExport,
    canManageQbSync:  row.canManageQbSync,
    canManageProducts: row.canManageProducts,
    isSuperAdmin: false,
  };
}

/**
 * Quick check: does the user have any Finance module access?
 */
export async function hasFinanceModuleAccess(userId: string, role: string | null | undefined): Promise<boolean> {
  if (isSuperUserRole(role)) return true;
  const row = await getFinancePermissions(userId);
  return !!(row?.canViewModule);
}

/**
 * Quick check: does the user have QB sync management access?
 */
export async function hasQbSyncManageAccess(userId: string, role: string | null | undefined): Promise<boolean> {
  if (isSuperUserRole(role)) return true;
  const row = await getFinancePermissions(userId);
  return !!(row?.canViewModule && row?.canManageQbSync);
}

/**
 * Product Library management is separate from read-only Finance access.
 */
export async function hasProductManagementAccess(userId: string, role: string | null | undefined): Promise<boolean> {
  if (isSuperUserRole(role)) return true;
  const row = await getFinancePermissions(userId);
  return !!(row?.canViewModule && row?.canManageProducts);
}

// ── Admin operations (super_user only) ────────────────────────────────────────

/**
 * Grant or update Finance permissions for a user.
 */
export async function upsertFinancePermissions(
  targetUserId: string,
  perms: Partial<Omit<InsertFinancePermission, "userId" | "grantedBy" | "updatedBy">>,
  grantedByUserId: string,
): Promise<FinancePermission> {
  const now = new Date();
  const values = {
    userId:           targetUserId,
    canViewModule:    perms.canViewModule    ?? false,
    canViewDashboard: perms.canViewDashboard ?? false,
    canViewRevenue:   perms.canViewRevenue   ?? false,
    canViewExpenses:  perms.canViewExpenses  ?? false,
    canViewMargin:    perms.canViewMargin    ?? false,
    canExport:        perms.canExport        ?? false,
    canManageQbSync:  perms.canManageQbSync  ?? false,
    canManageProducts: perms.canManageProducts ?? false,
    grantedBy:        grantedByUserId,
    grantedAt:        now,
    updatedBy:        grantedByUserId,
    updatedAt:        now,
  };

  const [row] = await db.insert(financePermissions)
    .values(values)
    .onConflictDoUpdate({
      target: financePermissions.userId,
      set: {
        canViewModule:    values.canViewModule,
        canViewDashboard: values.canViewDashboard,
        canViewRevenue:   values.canViewRevenue,
        canViewExpenses:  values.canViewExpenses,
        canViewMargin:    values.canViewMargin,
        canExport:        values.canExport,
        canManageQbSync:  values.canManageQbSync,
        canManageProducts: values.canManageProducts,
        updatedBy:        values.updatedBy,
        updatedAt:        values.updatedAt,
      },
    })
    .returning();
  return row;
}

/**
 * Revoke all Finance permissions for a user.
 */
export async function revokeFinancePermissions(targetUserId: string): Promise<void> {
  await db.delete(financePermissions)
    .where(eq(financePermissions.userId, targetUserId));
}

/**
 * List all users who have Finance permission rows, joined with user info.
 */
export async function listAllFinancePermissions(): Promise<Array<FinancePermission & {
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  userRole: string | null;
  grantedByEmail: string | null;
}>> {
  const result = await db.execute(sql`
    SELECT
      fp.*,
      u.email          AS user_email,
      u.first_name     AS user_first_name,
      u.last_name      AS user_last_name,
      u.role           AS user_role,
      g.email          AS granted_by_email
    FROM finance_permissions fp
    JOIN users u ON u.id = fp.user_id
    LEFT JOIN users g ON g.id = fp.granted_by
    ORDER BY fp.updated_at DESC
  `);
  return (result.rows ?? result) as any[];
}
