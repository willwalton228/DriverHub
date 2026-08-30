/**
 * Invoicing Permissions Service (TICKET 24)
 * 
 * Provides fine-grained permission checks for all invoicing operations.
 * Implements role-based access control with audit trail support.
 */

export const INVOICING_PERMISSIONS = [
  'invoice:create_draft',
  'invoice:edit_draft',
  'invoice:approve',
  'invoice:send',
  'invoice:void',
  'invoice:issue_credit',
  'payment:record_offline',
  'payment:record_check',
  'payment:record_wire',
  'payment:refund',
  'payment:edit',
  'payment:reverse',
  'payment:remove_from_batch',
  'billing_profile:view',
  'billing_profile:edit',
  'billing_entity:manage',
  'integration:quickbooks',
  'integration:payment_processor',
  'invoicing:view_reports',
  'invoicing:admin',
  'invoicing:recon_view',
  'invoicing:recon_actions',
] as const;

export type InvoicingPermission = typeof INVOICING_PERMISSIONS[number];

export interface InvoicingUser {
  id: string;
  email: string;
  role?: string | null;
  permissions?: string[];
}

/**
 * Default permissions by role
 * These are the built-in permission assignments.
 * Custom permissions can be added per-user via the permissions table.
 */
const DEFAULT_ROLE_PERMISSIONS: Record<string, InvoicingPermission[]> = {
  super_user: [
    'invoice:create_draft',
    'invoice:edit_draft',
    'invoice:approve',
    'invoice:send',
    'invoice:void',
    'invoice:issue_credit',
    'payment:record_offline',
    'payment:record_check',
    'payment:record_wire',
    'payment:refund',
    'payment:edit',
    'payment:reverse',
    'payment:remove_from_batch',
    'billing_profile:view',
    'billing_profile:edit',
    'billing_entity:manage',
    'integration:quickbooks',
    'integration:payment_processor',
    'invoicing:view_reports',
    'invoicing:admin',
    'invoicing:recon_view',
    'invoicing:recon_actions',
  ],
  admin: [
    'invoice:create_draft',
    'invoice:edit_draft',
    'invoice:approve',
    'invoice:send',
    'invoice:void',
    'invoice:issue_credit',
    'payment:record_offline',
    'payment:record_check',
    'payment:record_wire',
    'payment:refund',
    'payment:edit',
    'payment:reverse',
    'payment:remove_from_batch',
    'billing_profile:view',
    'billing_profile:edit',
    'billing_entity:manage',
    'integration:quickbooks',
    'integration:payment_processor',
    'invoicing:view_reports',
    'invoicing:admin',
  ],
  finance: [
    'invoice:create_draft',
    'invoice:edit_draft',
    'invoice:approve',
    'invoice:send',
    'invoice:void',
    'invoice:issue_credit',
    'payment:record_offline',
    'payment:record_check',
    'payment:record_wire',
    'payment:refund',
    'payment:edit',
    'payment:reverse',
    'billing_profile:view',
    'billing_profile:edit',
    'invoicing:view_reports',
  ],
  operations: [
    'invoice:create_draft',
    'invoice:edit_draft',
    'invoice:send',
    'payment:record_offline',
    'payment:record_check',
    'billing_profile:view',
    'invoicing:view_reports',
  ],
  ops: [
    'invoice:create_draft',
    'invoice:edit_draft',
    'invoice:send',
    'payment:record_offline',
    'payment:record_check',
    'billing_profile:view',
    'invoicing:view_reports',
  ],
  regional_cl: [
    'invoice:create_draft',
    'invoice:edit_draft',
    'invoice:send',
    'billing_profile:view',
    'invoicing:view_reports',
  ],
  network_cl: [
    'invoice:create_draft',
    'invoice:edit_draft',
    'billing_profile:view',
    'invoicing:view_reports',
  ],
  dealer_cl: [
    'invoice:create_draft',
    'invoice:edit_draft',
    'billing_profile:view',
  ],
  employee: [
    'invoice:create_draft',
    'invoice:edit_draft',
    'billing_profile:view',
  ],
  driver: [],
  recruiter: [],
  certification_liaison: [
    'billing_profile:view',
  ],
  custom_user_list: [
    'invoice:create_draft',
    'invoice:edit_draft',
    'billing_profile:view',
  ],
  testing: [
    'invoice:create_draft',
    'invoice:edit_draft',
    'invoice:approve',
    'invoice:send',
    'payment:record_offline',
    'billing_profile:view',
    'billing_profile:edit',
    'invoicing:view_reports',
  ],
};

/**
 * Get all permissions for a user based on their role and any custom permissions
 */
const ROLE_ALIASES: Record<string, string> = {
  corporate_admin: 'admin',
  super_admin: 'super_user',
  Admin: 'admin',
  corporate: 'admin',
};

export function getUserInvoicingPermissions(user: InvoicingUser): InvoicingPermission[] {
  const rawRole = user.role || '';
  const normalizedRole = ROLE_ALIASES[rawRole] || rawRole;
  const rolePermissions = DEFAULT_ROLE_PERMISSIONS[normalizedRole] || [];
  const customPermissions = (user.permissions || []) as InvoicingPermission[];
  
  const allPermissions = new Set([...rolePermissions, ...customPermissions]);
  return Array.from(allPermissions);
}

/**
 * Check if a user has a specific invoicing permission
 */
export function hasInvoicingPermission(
  user: InvoicingUser,
  permission: InvoicingPermission
): boolean {
  const permissions = getUserInvoicingPermissions(user);
  return permissions.includes(permission);
}

/**
 * Check if a user has any of the specified permissions
 */
export function hasAnyInvoicingPermission(
  user: InvoicingUser,
  permissions: InvoicingPermission[]
): boolean {
  const userPermissions = getUserInvoicingPermissions(user);
  return permissions.some(p => userPermissions.includes(p));
}

/**
 * Check if a user has all of the specified permissions
 */
export function hasAllInvoicingPermissions(
  user: InvoicingUser,
  permissions: InvoicingPermission[]
): boolean {
  const userPermissions = getUserInvoicingPermissions(user);
  return permissions.every(p => userPermissions.includes(p));
}

/**
 * Permission check helpers for specific actions
 */
export const InvoicingPermissionChecks = {
  canCreateDraft: (user: InvoicingUser) => hasInvoicingPermission(user, 'invoice:create_draft'),
  canEditDraft: (user: InvoicingUser) => hasInvoicingPermission(user, 'invoice:edit_draft'),
  canApproveInvoice: (user: InvoicingUser) => hasInvoicingPermission(user, 'invoice:approve'),
  canSendInvoice: (user: InvoicingUser) => hasInvoicingPermission(user, 'invoice:send'),
  canVoidInvoice: (user: InvoicingUser) => hasInvoicingPermission(user, 'invoice:void'),
  canIssueCreditMemo: (user: InvoicingUser) => hasInvoicingPermission(user, 'invoice:issue_credit'),
  canRecordOfflinePayment: (user: InvoicingUser) => hasInvoicingPermission(user, 'payment:record_offline'),
  canRecordCheckPayment: (user: InvoicingUser) => hasInvoicingPermission(user, 'payment:record_check'),
  canRecordWirePayment: (user: InvoicingUser) => hasInvoicingPermission(user, 'payment:record_wire'),
  canRefundPayment: (user: InvoicingUser) => hasInvoicingPermission(user, 'payment:refund'),
  canViewBillingProfile: (user: InvoicingUser) => hasInvoicingPermission(user, 'billing_profile:view'),
  canEditBillingProfile: (user: InvoicingUser) => hasInvoicingPermission(user, 'billing_profile:edit'),
  canManageBillingEntities: (user: InvoicingUser) => hasInvoicingPermission(user, 'billing_entity:manage'),
  canManageQuickBooks: (user: InvoicingUser) => hasInvoicingPermission(user, 'integration:quickbooks'),
  canManagePaymentProcessor: (user: InvoicingUser) => hasInvoicingPermission(user, 'integration:payment_processor'),
  canViewReports: (user: InvoicingUser) => hasInvoicingPermission(user, 'invoicing:view_reports'),
  isAdmin: (user: InvoicingUser) => hasInvoicingPermission(user, 'invoicing:admin'),
};

/**
 * Get readable permission name for display
 */
export function getPermissionDisplayName(permission: InvoicingPermission): string {
  const displayNames: Record<InvoicingPermission, string> = {
    'invoice:create_draft': 'Create Draft Invoices',
    'invoice:edit_draft': 'Edit Draft Invoices',
    'invoice:approve': 'Approve Invoices',
    'invoice:send': 'Send Invoices',
    'invoice:void': 'Void Invoices',
    'invoice:issue_credit': 'Issue Credit Memos',
    'payment:record_offline': 'Record Offline Payments',
    'payment:record_check': 'Record Check Payments',
    'payment:record_wire': 'Record Wire Transfers',
    'payment:refund': 'Process Refunds',
    'billing_profile:view': 'View Billing Profiles',
    'billing_profile:edit': 'Edit Billing Profiles',
    'billing_entity:manage': 'Manage Billing Entities',
    'integration:quickbooks': 'Manage QuickBooks Integration',
    'integration:payment_processor': 'Manage Payment Processor',
    'invoicing:view_reports': 'View Invoicing Reports',
    'invoicing:admin': 'Invoicing Administration',
  };
  return displayNames[permission] || permission;
}

/**
 * Get all roles with their permissions for admin view
 */
export function getAllRolePermissions(): Record<string, { permissions: InvoicingPermission[], displayNames: string[] }> {
  const result: Record<string, { permissions: InvoicingPermission[], displayNames: string[] }> = {};
  
  for (const [role, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    result[role] = {
      permissions,
      displayNames: permissions.map(getPermissionDisplayName),
    };
  }
  
  return result;
}

/**
 * Get a specific role's permissions
 */
export function getRolePermissions(role: string): InvoicingPermission[] {
  return DEFAULT_ROLE_PERMISSIONS[role] || [];
}

/**
 * MFA/SSO Readiness Hooks
 * Framework placeholders for future enterprise authentication
 */
export interface MfaSsoSettings {
  mfaEnabled: boolean;
  mfaRequiredForActions: InvoicingPermission[];
  ssoProvider?: 'okta' | 'azure_ad' | 'google' | null;
  ssoEnforced: boolean;
  sessionTimeoutMinutes: number;
  requireReauthForSensitiveActions: boolean;
}

export const DEFAULT_MFA_SSO_SETTINGS: MfaSsoSettings = {
  mfaEnabled: false,
  mfaRequiredForActions: [
    'invoice:void',
    'invoice:issue_credit',
    'payment:refund',
    'integration:quickbooks',
    'integration:payment_processor',
    'invoicing:admin',
  ],
  ssoProvider: null,
  ssoEnforced: false,
  sessionTimeoutMinutes: 60,
  requireReauthForSensitiveActions: false,
};

/**
 * Check if MFA is required for a specific action
 * Placeholder for future MFA enforcement
 */
export function isMfaRequiredForAction(
  settings: MfaSsoSettings,
  action: InvoicingPermission
): boolean {
  if (!settings.mfaEnabled) return false;
  return settings.mfaRequiredForActions.includes(action);
}

/**
 * Validate session for sensitive action
 * Placeholder for future re-authentication requirement
 */
export function requiresReauthentication(
  settings: MfaSsoSettings,
  action: InvoicingPermission,
  lastAuthTimestamp?: Date
): boolean {
  if (!settings.requireReauthForSensitiveActions) return false;
  
  const sensitiveActions: InvoicingPermission[] = [
    'invoice:void',
    'invoice:issue_credit',
    'payment:refund',
    'billing_entity:manage',
  ];
  
  if (!sensitiveActions.includes(action)) return false;
  
  if (!lastAuthTimestamp) return true;
  
  const minutesSinceAuth = (Date.now() - lastAuthTimestamp.getTime()) / (1000 * 60);
  return minutesSinceAuth > 15;
}

/**
 * Permission denied error with details
 */
export class InvoicingPermissionError extends Error {
  constructor(
    public permission: InvoicingPermission,
    public userId: string,
    public action: string
  ) {
    super(`Permission denied: User ${userId} lacks '${permission}' permission for action '${action}'`);
    this.name = 'InvoicingPermissionError';
  }
}

/**
 * Assert that a user has a permission, throwing if not
 */
export function assertInvoicingPermission(
  user: InvoicingUser,
  permission: InvoicingPermission,
  action: string
): void {
  if (!hasInvoicingPermission(user, permission)) {
    throw new InvoicingPermissionError(permission, user.id, action);
  }
}

// ─── Reconciliation Access Control ────────────────────────────────────────────

/**
 * Reconciliation Dashboard is restricted to super_user (Owner / Super Admin) only.
 * No other role — including admin, finance — may access reconciliation data,
 * take reconciliation actions, or edit/reverse financial records through the
 * reconciliation layer.
 */
export function isReconAdmin(role?: string | null): boolean {
  // Also honour the super_admin alias used in ROLE_ALIASES
  return role === 'super_user' || role === 'super_admin';
}

/**
 * Payment Controller check — determines who may perform controlled payment
 * actions: edit amount, reverse, remove-from-invoice, and reassign.
 *
 * Owner  (super_user / super_admin)   → full authority
 * Controller (admin / corporate_admin / finance) → controlled actions
 *
 * All other roles are denied.
 */
export function isPaymentController(role?: string | null): boolean {
  return (
    role === 'super_user' ||
    role === 'super_admin' ||
    role === 'admin' ||
    role === 'corporate_admin' ||
    role === 'finance'
  );
}

/**
 * Deposit Batch — Billing Team check
 * Determines who may CREATE deposit batches and EDIT drafts (add payments,
 * update metadata such as deposit date / bank account / deposit method).
 *
 * Includes finance-adjacent roles that need to assemble batches day-to-day.
 * Controller/Owner roles are a strict superset of this set.
 */
export const DEPOSIT_BILLING_TEAM_ROLES = new Set([
  'billing',
  'finance',
  'admin',
  'corporate_admin',
  'super_admin',
  'super_user',
  'root_super_admin',
  'account_manager',
]);

export function isDepositBillingTeam(role?: string | null): boolean {
  return !!role && DEPOSIT_BILLING_TEAM_ROLES.has(role);
}

/**
 * Deposit Batch — Controller / Owner check
 * Determines who may SUBMIT, LOCK, RECONCILE batches and REMOVE payments
 * from a batch (destructive operations that affect financial records).
 *
 * This is intentionally the same gate as isPaymentController so that a
 * single "Controller" concept is consistent across the invoicing module.
 */
export function isDepositBatchController(role?: string | null): boolean {
  return isPaymentController(role);
}

export class ReconAccessDeniedError extends Error {
  public readonly code = 'RECON_ACCESS_DENIED';
  constructor(userId?: string | null) {
    super(`Reconciliation access denied for user ${userId ?? 'unknown'}. Requires super_user role.`);
    this.name = 'ReconAccessDeniedError';
  }
}

export function assertReconAccess(role?: string | null, userId?: string | null): void {
  if (!isReconAdmin(role)) {
    throw new ReconAccessDeniedError(userId);
  }
}

// ─── Fraud Pattern Playbook Access ──────────────────────────────────────────

/**
 * Owner-only roles that may access the Fraud Pattern Playbook.
 * super_user  = Owner (primary)
 * super_admin = Super Admin (Owner tier)
 * root_super_admin = Root super admin (highest privilege)
 */
const FRAUD_PLAYBOOK_OWNER_ROLES = new Set([
  'super_user',
  'super_admin',
  'root_super_admin',
]);

/**
 * Controller-tier roles that may optionally be granted access
 * when the platform config flag `fraud.playbook.allow_controller` is true.
 */
const FRAUD_PLAYBOOK_CONTROLLER_ROLES = new Set([
  'finance',
  'admin',
  'corporate_admin',
  'super_user',
  'super_admin',
  'root_super_admin',
]);

/**
 * Returns true if the given role may access the Fraud Pattern Playbook.
 *
 * @param role              The user's role string.
 * @param allowController   When true (set via platform config flag), also
 *                          grants access to Controller-tier roles.
 *                          Defaults to false — Owner-only.
 */
export function isFraudPlaybookAllowed(role?: string | null, allowController = false): boolean {
  if (!role) return false;
  if (FRAUD_PLAYBOOK_OWNER_ROLES.has(role)) return true;
  if (allowController && FRAUD_PLAYBOOK_CONTROLLER_ROLES.has(role)) return true;
  return false;
}

export class FraudPlaybookAccessDeniedError extends Error {
  public readonly code = 'FRAUD_PLAYBOOK_ACCESS_DENIED';
  constructor(userId?: string | null) {
    super(`Fraud Pattern Playbook access denied for user ${userId ?? 'unknown'}. Requires Owner role.`);
    this.name = 'FraudPlaybookAccessDeniedError';
  }
}

export function assertFraudPlaybookAccess(role?: string | null, userId?: string | null, allowController = false): void {
  if (!isFraudPlaybookAllowed(role, allowController)) {
    throw new FraudPlaybookAccessDeniedError(userId);
  }
}
