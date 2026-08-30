import type { VendorPermissionRole } from "@shared/schema";
import { db } from "./db";
import { userModulePermissions } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const VENDOR_ROLE_MAP: Record<string, VendorPermissionRole> = {
  super_user: "admin",
  super_admin: "admin",
  admin: "admin",
  Admin: "admin",
  finance: "finance",
  Finance: "finance",
  ops: "ops",
  operations: "ops",
  ops_manager: "ops",
};

export function getVendorRole(userRole?: string | null): VendorPermissionRole | null {
  if (!userRole) return null;
  return VENDOR_ROLE_MAP[userRole] || "readonly";
}

export function hasVendorAccess(userRole?: string | null): boolean {
  const corporateRoles = [
    "corporate", "Corporate", "super_user", "super_admin", "admin", "Admin",
    "regional_cl", "network_cl", "dealer_cl", "certification_liaison",
    "custom_user_list", "testing", "employee", "Employee",
    "ops", "operations", "ops_manager", "finance", "Finance",
  ];
  return !!userRole && corporateRoles.includes(userRole);
}

export type VendorAction =
  | "vendor:create" | "vendor:read" | "vendor:update" | "vendor:delete"
  | "contract:read" | "contract:create" | "contract:update"
  | "pricing:read" | "pricing:create" | "pricing:update"
  | "contact:read" | "contact:create" | "contact:update" | "contact:delete"
  | "document:read" | "document:upload" | "document:delete"
  | "note:read" | "note:create" | "note:update" | "note:pin" | "note:delete"
  | "alert:read" | "alert:dismiss" | "alert:scan" | "threshold:update"
  | "audit:read";

const PERMISSION_MATRIX: Record<VendorPermissionRole, Set<VendorAction>> = {
  admin: new Set([
    "vendor:create", "vendor:read", "vendor:update", "vendor:delete",
    "contract:read", "contract:create", "contract:update",
    "pricing:read", "pricing:create", "pricing:update",
    "contact:read", "contact:create", "contact:update", "contact:delete",
    "document:read", "document:upload", "document:delete",
    "note:read", "note:create", "note:update", "note:pin", "note:delete",
    "alert:read", "alert:dismiss", "alert:scan", "threshold:update",
    "audit:read",
  ]),
  finance: new Set([
    "vendor:read",
    "contract:read", "contract:create", "contract:update",
    "pricing:read", "pricing:create", "pricing:update",
    "contact:read",
    "document:read", "document:upload",
    "note:read",
    "alert:read", "alert:dismiss",
    "audit:read",
  ]),
  ops: new Set([
    "vendor:read",
    "contract:read",
    "pricing:read",
    "contact:read", "contact:create", "contact:update", "contact:delete",
    "document:read", "document:upload",
    "note:read", "note:create", "note:update", "note:pin", "note:delete",
    "alert:read", "alert:dismiss",
    "audit:read",
  ]),
  readonly: new Set([
    "vendor:read",
    "contract:read",
    "pricing:read",
    "contact:read",
    "document:read",
    "note:read",
    "alert:read",
    "audit:read",
  ]),
};

export function canPerformVendorAction(userRole: string | null | undefined, action: VendorAction): boolean {
  const vendorRole = getVendorRole(userRole);
  if (!vendorRole) return false;
  return PERMISSION_MATRIX[vendorRole]?.has(action) ?? false;
}

export function getPermissionDeniedMessage(action: VendorAction): string {
  return `Forbidden: Your role does not have permission for "${action}"`;
}

type ModulePermsShape = {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
  canManageContracts: boolean; canManagePricing: boolean; canManageDocuments: boolean;
  canManageNotes: boolean; canManageCompliance: boolean; canManageRenewals: boolean;
};

function modulePermGrantsVendorAction(p: ModulePermsShape, action: VendorAction): boolean {
  switch (action) {
    case "vendor:read":       return p.canView;
    case "vendor:create":     return p.canCreate;
    case "vendor:update":     return p.canEdit;
    case "vendor:delete":     return p.canDelete;
    case "contract:read":     return p.canView || p.canManageContracts;
    case "contract:create":   return p.canManageContracts;
    case "contract:update":   return p.canManageContracts;
    case "pricing:read":      return p.canView || p.canManagePricing;
    case "pricing:create":    return p.canManagePricing;
    case "pricing:update":    return p.canManagePricing;
    case "contact:read":      return p.canView;
    case "contact:create":    return p.canManageCompliance || p.canEdit;
    case "contact:update":    return p.canManageCompliance || p.canEdit;
    case "contact:delete":    return p.canManageCompliance || p.canDelete;
    case "document:read":     return p.canView || p.canManageDocuments;
    case "document:upload":   return p.canManageDocuments;
    case "document:delete":   return p.canManageDocuments && p.canDelete;
    case "note:read":         return p.canView || p.canManageNotes;
    case "note:create":       return p.canManageNotes;
    case "note:update":       return p.canManageNotes;
    case "note:pin":          return p.canManageNotes;
    case "note:delete":       return p.canManageNotes;
    case "alert:read":        return p.canView || p.canManageRenewals;
    case "alert:dismiss":     return p.canManageRenewals;
    case "alert:scan":        return p.canManageRenewals;
    case "threshold:update":  return p.canManageRenewals;
    case "audit:read":        return p.canView;
    default:                  return false;
  }
}

/**
 * Resolves vendor access by checking role-based permissions first (fast, sync path),
 * then falling back to per-user module permission overrides stored in the DB.
 * Super-admin / admin roles short-circuit immediately without a DB query.
 */
export async function resolveVendorAccess(
  userId: string,
  userRole: string | null | undefined,
  action: VendorAction,
): Promise<boolean> {
  if (canPerformVendorAction(userRole, action)) return true;
  try {
    const [row] = await db
      .select()
      .from(userModulePermissions)
      .where(and(
        eq(userModulePermissions.userId, userId),
        eq(userModulePermissions.moduleName, "vendors"),
      ))
      .limit(1);
    if (!row) return false;
    return modulePermGrantsVendorAction(row, action);
  } catch {
    return false;
  }
}
