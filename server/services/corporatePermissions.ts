import type {
  CorporateModuleKey,
  ModuleAccessMap,
  SensitiveDataCategory,
  SensitiveFieldAccessMap,
  SensitiveFieldAccessEntry,
  ActionPermissionKey,
  ActionPermissionsMap,
  DriverPermissionKey,
  DriverPermissionsMap,
} from "@shared/schema";
import { FULL_ACCESS_ROLES, CORPORATE_MODULE_KEYS, SENSITIVE_DATA_CATEGORIES, ACTION_PERMISSION_KEYS, DRIVER_PERMISSION_KEYS } from "@shared/schema";
import { hasExplicitFullDriverSsnAccess } from "./driverSsnAccess";

export type RoleClass = 'SUPER_ADMIN' | 'CORPORATE' | 'DRIVER';

export interface EffectivePermissions {
  roleClass: RoleClass;
  role: string;
  modulesEnabled: CorporateModuleKey[];
  actionsAllowed: ActionPermissionKey[];
  driverPermissions: DriverPermissionKey[];
  sensitiveViewAllowed: SensitiveDataCategory[];
  sensitiveEditAllowed: SensitiveDataCategory[];
  isCorporateAccessAdmin: boolean;
  scope: {
    accountId: string | null;
    driverId: string | null;
    crossTenantAllowed: boolean;
  };
}

export interface AuthorizeContext {
  module?: CorporateModuleKey;
  action?: ActionPermissionKey;
  sensitiveView?: SensitiveDataCategory;
  sensitiveEdit?: SensitiveDataCategory;
  resourceOwnerId?: string;
  resourceAccountId?: string;
}

const BLOCKED_STATUSES = ['DISABLED', 'SUSPENDED', 'DEACTIVATED', 'LOCKED'];

function getRoleClass(role: string): RoleClass {
  if (role === 'super_user' || role === 'super_admin') return 'SUPER_ADMIN';
  if (role === 'driver') return 'DRIVER';
  return 'CORPORATE';
}

function isSuperAdmin(role: string): boolean {
  return role === "super_user" || role === "super_admin";
}

function hasFullAccess(role: string): boolean {
  return (FULL_ACCESS_ROLES as readonly string[]).includes(role);
}

function getExplicitDriverPermissions(user: any): DriverPermissionKey[] {
  const actionPerms = (user?.actionPermissions || {}) as DriverPermissionsMap;
  return DRIVER_PERMISSION_KEYS.filter((key) => actionPerms[key] === true);
}

export function canViewFullDriverSsn(user: any): boolean {
  return hasExplicitFullDriverSsnAccess(user);
}

export function computeEffectivePermissions(user: any): EffectivePermissions {
  const role = user?.role || '';
  const roleClass = getRoleClass(role);
  const status = user?.status || 'ACTIVE';

  if (BLOCKED_STATUSES.includes(status)) {
    return {
      roleClass,
      role,
      modulesEnabled: [],
      actionsAllowed: [],
      driverPermissions: [],
      sensitiveViewAllowed: [],
      sensitiveEditAllowed: [],
      isCorporateAccessAdmin: false,
      scope: {
        accountId: user?.orgId || null,
        driverId: user?.driverId || null,
        crossTenantAllowed: false,
      },
    };
  }

  if (roleClass === 'SUPER_ADMIN') {
    return {
      roleClass,
      role,
      modulesEnabled: [...CORPORATE_MODULE_KEYS],
      actionsAllowed: [...ACTION_PERMISSION_KEYS],
      driverPermissions: getExplicitDriverPermissions(user),
      sensitiveViewAllowed: [...SENSITIVE_DATA_CATEGORIES],
      sensitiveEditAllowed: [...SENSITIVE_DATA_CATEGORIES],
      isCorporateAccessAdmin: true,
      scope: {
        accountId: user?.orgId || null,
        driverId: null,
        crossTenantAllowed: true,
      },
    };
  }

  if (roleClass === 'DRIVER') {
    return {
      roleClass,
      role,
      modulesEnabled: [],
      actionsAllowed: [],
      driverPermissions: [],
      sensitiveViewAllowed: [],
      sensitiveEditAllowed: [],
      isCorporateAccessAdmin: false,
      scope: {
        accountId: user?.orgId || null,
        driverId: user?.driverId || null,
        crossTenantAllowed: false,
      },
    };
  }

  if (hasFullAccess(role)) {
    return {
      roleClass,
      role,
      modulesEnabled: [...CORPORATE_MODULE_KEYS],
      actionsAllowed: [...ACTION_PERMISSION_KEYS],
      driverPermissions: getExplicitDriverPermissions(user),
      sensitiveViewAllowed: [...SENSITIVE_DATA_CATEGORIES],
      sensitiveEditAllowed: [...SENSITIVE_DATA_CATEGORIES],
      isCorporateAccessAdmin: user?.corporateAccessAdmin === true,
      scope: {
        accountId: user?.orgId || null,
        driverId: null,
        crossTenantAllowed: false,
      },
    };
  }

  const moduleAccess = (user?.moduleAccess || {}) as ModuleAccessMap;
  const sensitiveAccess = (user?.sensitiveFieldAccess || {}) as SensitiveFieldAccessMap;
  const actionPerms = (user?.actionPermissions || {}) as ActionPermissionsMap;
  const driverPermissions = getExplicitDriverPermissions(user);

  const modulesEnabled = CORPORATE_MODULE_KEYS.filter(k => moduleAccess[k] === true);
  const actionsAllowed = ACTION_PERMISSION_KEYS.filter(k => actionPerms[k] === true);

  const sensitiveViewAllowed: SensitiveDataCategory[] = [];
  const sensitiveEditAllowed: SensitiveDataCategory[] = [];
  for (const cat of SENSITIVE_DATA_CATEGORIES) {
    const entry = sensitiveAccess[cat];
    if (entry?.edit) {
      sensitiveEditAllowed.push(cat);
      sensitiveViewAllowed.push(cat);
    } else if (entry?.view) {
      sensitiveViewAllowed.push(cat);
    }
  }

  return {
    roleClass,
    role,
    modulesEnabled,
    actionsAllowed,
    driverPermissions,
    sensitiveViewAllowed,
    sensitiveEditAllowed,
    isCorporateAccessAdmin: user?.corporateAccessAdmin === true,
    scope: {
      accountId: user?.orgId || null,
      driverId: null,
      crossTenantAllowed: false,
    },
  };
}

export function authorize(user: any, ctx: AuthorizeContext): { allowed: boolean; reason?: string } {
  if (!user || !user.role) {
    return { allowed: false, reason: 'Authentication required' };
  }

  const status = user.status || 'ACTIVE';
  if (BLOCKED_STATUSES.includes(status)) {
    return { allowed: false, reason: `Account is ${status.toLowerCase()}` };
  }

  const perms = computeEffectivePermissions(user);

  if (ctx.resourceAccountId && perms.scope.accountId) {
    if (ctx.resourceAccountId !== perms.scope.accountId && !perms.scope.crossTenantAllowed) {
      return { allowed: false, reason: 'Access denied: tenant boundary violation' };
    }
  }

  if (perms.roleClass === 'DRIVER') {
    if (ctx.resourceOwnerId && perms.scope.driverId) {
      if (ctx.resourceOwnerId !== perms.scope.driverId) {
        return { allowed: false, reason: 'You can only access your own records' };
      }
    }
    if (ctx.module) {
      return { allowed: false, reason: 'Driver role does not have module access' };
    }
  }

  if (ctx.module && !perms.modulesEnabled.includes(ctx.module)) {
    return { allowed: false, reason: `No access to ${ctx.module} module` };
  }

  if (ctx.action && !perms.actionsAllowed.includes(ctx.action)) {
    return { allowed: false, reason: `Not permitted: ${ctx.action.replace(/_/g, ' ')}` };
  }

  if (ctx.sensitiveView && !perms.sensitiveViewAllowed.includes(ctx.sensitiveView)) {
    return { allowed: false, reason: `Cannot view ${ctx.sensitiveView.replace(/_/g, ' ')} data` };
  }

  if (ctx.sensitiveEdit && !perms.sensitiveEditAllowed.includes(ctx.sensitiveEdit)) {
    return { allowed: false, reason: `Cannot edit ${ctx.sensitiveEdit.replace(/_/g, ' ')} data` };
  }

  return { allowed: true };
}

export function capPermissions(
  grantor: EffectivePermissions,
  requested: {
    modules?: CorporateModuleKey[];
    actions?: ActionPermissionKey[];
    sensitiveView?: SensitiveDataCategory[];
    sensitiveEdit?: SensitiveDataCategory[];
  }
): {
  granted: {
    modules: CorporateModuleKey[];
    actions: ActionPermissionKey[];
    sensitiveView: SensitiveDataCategory[];
    sensitiveEdit: SensitiveDataCategory[];
  };
  escalated: {
    modules: CorporateModuleKey[];
    actions: ActionPermissionKey[];
    sensitiveView: SensitiveDataCategory[];
    sensitiveEdit: SensitiveDataCategory[];
  };
  needsEscalation: boolean;
} {
  const grantedModules = (requested.modules || []).filter(m => grantor.modulesEnabled.includes(m));
  const escalatedModules = (requested.modules || []).filter(m => !grantor.modulesEnabled.includes(m));

  const grantedActions = (requested.actions || []).filter(a => grantor.actionsAllowed.includes(a));
  const escalatedActions = (requested.actions || []).filter(a => !grantor.actionsAllowed.includes(a));

  const grantedSensitiveView = (requested.sensitiveView || []).filter(s => grantor.sensitiveViewAllowed.includes(s));
  const escalatedSensitiveView = (requested.sensitiveView || []).filter(s => !grantor.sensitiveViewAllowed.includes(s));

  const grantedSensitiveEdit = (requested.sensitiveEdit || []).filter(s => grantor.sensitiveEditAllowed.includes(s));
  const escalatedSensitiveEdit = (requested.sensitiveEdit || []).filter(s => !grantor.sensitiveEditAllowed.includes(s));

  return {
    granted: {
      modules: grantedModules,
      actions: grantedActions,
      sensitiveView: grantedSensitiveView,
      sensitiveEdit: grantedSensitiveEdit,
    },
    escalated: {
      modules: escalatedModules,
      actions: escalatedActions,
      sensitiveView: escalatedSensitiveView,
      sensitiveEdit: escalatedSensitiveEdit,
    },
    needsEscalation: escalatedModules.length > 0 || escalatedActions.length > 0 ||
      escalatedSensitiveView.length > 0 || escalatedSensitiveEdit.length > 0,
  };
}

export function hasModuleAccess(user: any, moduleKey: CorporateModuleKey): boolean {
  if (!user || !user.role) return false;
  const perms = computeEffectivePermissions(user);
  return perms.modulesEnabled.includes(moduleKey);
}

export function getEnabledModules(user: any): CorporateModuleKey[] {
  if (!user || !user.role) return [];
  return computeEffectivePermissions(user).modulesEnabled;
}

export function canViewSensitiveField(user: any, category: SensitiveDataCategory): boolean {
  if (!user || !user.role) return false;
  return computeEffectivePermissions(user).sensitiveViewAllowed.includes(category);
}

export function canEditSensitiveField(user: any, category: SensitiveDataCategory): boolean {
  if (!user || !user.role) return false;
  return computeEffectivePermissions(user).sensitiveEditAllowed.includes(category);
}

export function getSensitiveFieldPermissions(user: any): Record<SensitiveDataCategory, { view: boolean; edit: boolean }> {
  const perms = computeEffectivePermissions(user);
  const result = {} as Record<SensitiveDataCategory, { view: boolean; edit: boolean }>;
  for (const cat of SENSITIVE_DATA_CATEGORIES) {
    result[cat] = {
      view: perms.sensitiveViewAllowed.includes(cat),
      edit: perms.sensitiveEditAllowed.includes(cat),
    };
  }
  return result;
}

export function hasActionPermission(user: any, action: ActionPermissionKey): boolean {
  if (!user || !user.role) return false;
  return computeEffectivePermissions(user).actionsAllowed.includes(action);
}

export function getActionPermissions(user: any): Record<ActionPermissionKey, boolean> {
  const perms = computeEffectivePermissions(user);
  const result = {} as Record<ActionPermissionKey, boolean>;
  for (const key of ACTION_PERMISSION_KEYS) {
    result[key] = perms.actionsAllowed.includes(key);
  }
  return result;
}

export function stripSensitiveFields(data: any, user: any): any {
  if (!data || typeof data !== "object") return data;
  const stripped = { ...data };

  if (!canViewSensitiveField(user, "ssn")) {
    if ("ssnOrEin" in stripped) stripped.ssnOrEin = null;
    if ("ssnOrEinLast4" in stripped) stripped.ssnOrEinLast4 = null;
    if ("ssnOrEinEncrypted" in stripped) stripped.ssnOrEinEncrypted = null;
  }

  if (!canViewSensitiveField(user, "banking_ach")) {
    if ("bankName" in stripped) stripped.bankName = null;
    if ("bankRoutingNumber" in stripped) stripped.bankRoutingNumber = null;
    if ("bankAccountNumber" in stripped) stripped.bankAccountNumber = null;
    if ("bankAccountType" in stripped) stripped.bankAccountType = null;
    if ("paymentId" in stripped) stripped.paymentId = null;
    if ("openforceId" in stripped) stripped.openforceId = null;
    if ("adpMarketplaceId" in stripped) stripped.adpMarketplaceId = null;
  }

  if (!canViewSensitiveField(user, "pay_rate")) {
    if ("payRate" in stripped) stripped.payRate = null;
    if ("payRateType" in stripped) stripped.payRateType = null;
    if ("payRateAmount" in stripped) stripped.payRateAmount = null;
    if ("compensationRate" in stripped) stripped.compensationRate = null;
    if ("basePayPerMile" in stripped) stripped.basePayPerMile = null;
    if ("fuelSurchargeRate" in stripped) stripped.fuelSurchargeRate = null;
    if ("networkPayRate" in stripped) stripped.networkPayRate = null;
    if ("billRate" in stripped) stripped.billRate = null;
    if ("grossProfit" in stripped) stripped.grossProfit = null;
  }

  if (!canViewSensitiveField(user, "background_check")) {
    if ("backgroundCheckStatus" in stripped) stripped.backgroundCheckStatus = null;
    if ("backgroundCheckDate" in stripped) stripped.backgroundCheckDate = null;
    if ("backgroundCheckNotes" in stripped) stripped.backgroundCheckNotes = null;
    if ("drugTestDate" in stripped) stripped.drugTestDate = null;
    if ("mvrDate" in stripped) stripped.mvrDate = null;
  }

  if (!canViewSensitiveField(user, "internal_risk_notes")) {
    if ("internalRiskNotes" in stripped) stripped.internalRiskNotes = null;
    if ("riskScore" in stripped) stripped.riskScore = null;
    if ("complianceNotes" in stripped) stripped.complianceNotes = null;
  }

  return stripped;
}

const DRIVER_ALLOWED_PROFILE_FIELDS = [
  'id', 'userId', 'driverNumber',
  'phoneNumber', 'address', 'city', 'state', 'zipCode',
  'dateOfBirth', 'licenseNumber', 'licenseState', 'licenseExpiration',
  'profilePhotoUrl', 'gender',
  'emergencyContactName', 'emergencyContactRelationship', 'emergencyContactPhone', 'emergencyContactEmail',
  'driverType', 'driverClassification',
  'market', 'hireDate', 'status',
  'hoursWtd', 'hoursMtd', 'hoursYtd', 'lifetimeHours', 'averageHoursPerWeek',
  'payLastWeek', 'payWtd', 'payMtd', 'payYtd', 'lifetimePay', 'averagePayPerWeek',
  'lifetimeMoveCount', 'currentMonthMoveCount', 'lastMonthMoveCount', 'firstMoveDate', 'lastMoveDate',
  'lastAccessAt', 'createdAt', 'updatedAt',
];

export function stripDriverInternalFields(data: any): any {
  if (!data || typeof data !== "object") return data;
  const result: Record<string, any> = {};
  for (const field of DRIVER_ALLOWED_PROFILE_FIELDS) {
    if (field in data) {
      result[field] = data[field];
    }
  }
  return result;
}

const DRIVER_ALLOWED_TRIP_FIELDS = [
  'id', 'moveNumber', 'driverId', 'customerId',
  'tripDate', 'origin', 'destination', 'distance', 'duration',
  'status', 'moveType', 'vehicleType',
  'notes', 'customerInstructions',
  'originLat', 'originLng', 'destinationLat', 'destinationLng',
  'estimatedMinutes', 'returnToOriginRequired',
  'assignmentState', 'executionState',
  'offeredAt', 'acceptedAt', 'offerExpiresAt',
  'payEstimateCurrency', 'payEstimateTotal', 'payEstimateRateBasis', 'payEstimateBreakdownJson',
  'createdAt',
];

export function stripDriverTripInternalFields(data: any): any {
  if (!data || typeof data !== "object") return data;
  const result: Record<string, any> = {};
  for (const field of DRIVER_ALLOWED_TRIP_FIELDS) {
    if (field in data) {
      result[field] = data[field];
    }
  }
  return result;
}

export function isDriverRole(role: string | null | undefined): boolean {
  return role === "driver";
}

export function requireDriverScoping() {
  return async (req: any, res: any, next: Function) => {
    const userId = req.user?.claims?.sub || (req.session as any)?.userId;
    if (!userId) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
    }
    const user = req.currentUser || await (await import("../storage")).storage.getUser(userId);
    if (!user) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "User not found" });
    }

    if (isDriverRole(user.role)) {
      const driverIdParam = req.params.driverId || req.params.id;
      if (driverIdParam && user.driverId && driverIdParam !== user.driverId) {
        return res.status(403).json({
          error: "ACCESS_DENIED",
          message: "You can only access your own records",
        });
      }
    }
    next();
  };
}

export function requireModule(moduleKey: CorporateModuleKey) {
  return (req: any, res: any, next: Function) => {
    const user = req.currentUser || req.user;
    if (!user) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
    }
    if (!hasModuleAccess(user, moduleKey)) {
      return res.status(403).json({
        error: "MODULE_ACCESS_DENIED",
        message: `You do not have access to the ${moduleKey} module`,
      });
    }
    next();
  };
}

export function requireAction(action: ActionPermissionKey) {
  return (req: any, res: any, next: Function) => {
    const user = req.currentUser || req.user;
    if (!user) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
    }
    if (!hasActionPermission(user, action)) {
      return res.status(403).json({
        error: "ACTION_DENIED",
        message: `You do not have permission to perform this action: ${action.replace(/_/g, " ")}`,
      });
    }
    next();
  };
}

export function requireSensitiveView(category: SensitiveDataCategory) {
  return (req: any, res: any, next: Function) => {
    const user = req.currentUser || req.user;
    if (!user) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
    }
    if (!canViewSensitiveField(user, category)) {
      return res.status(403).json({
        error: "SENSITIVE_DATA_DENIED",
        message: `You do not have permission to view ${category.replace(/_/g, " ")} data`,
      });
    }
    next();
  };
}

export function requireSensitiveEdit(category: SensitiveDataCategory) {
  return (req: any, res: any, next: Function) => {
    const user = req.currentUser || req.user;
    if (!user) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
    }
    if (!canEditSensitiveField(user, category)) {
      return res.status(403).json({
        error: "SENSITIVE_EDIT_DENIED",
        message: `You do not have permission to edit ${category.replace(/_/g, " ")} data`,
      });
    }
    next();
  };
}

export function authorizeMiddleware(ctx: AuthorizeContext | ((req: any) => AuthorizeContext)) {
  return async (req: any, res: any, next: Function) => {
    const userId = req.user?.claims?.sub || (req.session as any)?.userId;
    if (!userId) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
    }
    const user = req.currentUser || await (await import("../storage")).storage.getUser(userId);
    if (!user) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "User not found" });
    }
    req.currentUser = user;

    const resolvedCtx = typeof ctx === 'function' ? ctx(req) : ctx;
    const result = authorize(user, resolvedCtx);
    if (!result.allowed) {
      return res.status(403).json({ error: "ACCESS_DENIED", message: result.reason });
    }
    next();
  };
}
