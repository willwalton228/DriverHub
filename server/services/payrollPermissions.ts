/**
 * Centralized Permission Matrix for Payroll Operations (ITEM 17)
 * 
 * Provides a single source of truth for all payroll-related permissions.
 * Standardizes authorization logic based on user email and roles.
 */

// Hardcoded authorized users for critical payroll actions
export const AUTHORIZED_PAY_PERIOD_PROCESSORS = [
  'will.walton@driverhub360.com',
  'david.forman@driverhub360.com',
  'luis.valdez@driverhub360.com'
];

export const AUTHORIZED_PAY_PERIOD_LOCKERS = [
  'will.walton@driverhub360.com',
  'david.forman@driverhub360.com'
];

/**
 * Check if a user can open/create a new pay period
 */
export function canOpenPayPeriod(user: { email: string; role?: string }): boolean {
  if (!user.email) return false;
  const email = user.email.toLowerCase();
  return AUTHORIZED_PAY_PERIOD_PROCESSORS.includes(email);
}

/**
 * Check if a user can start processing a pay period
 */
export function canStartProcessing(
  user: { email: string; role?: string }, 
  payPeriod: { status: string }
): boolean {
  if (!user.email) return false;
  const email = user.email.toLowerCase();
  
  // Only processors can start processing
  if (!AUTHORIZED_PAY_PERIOD_PROCESSORS.includes(email)) return false;
  
  // Can only start processing if it's currently OPEN
  return payPeriod.status === 'OPEN';
}

/**
 * Check if a user can lock a pay period
 */
export function canLockPayPeriod(
  user: { email: string; role?: string }, 
  payPeriod: { status: string }
): boolean {
  if (!user.email) return false;
  const email = user.email.toLowerCase();
  
  // Only lockers can lock
  if (!AUTHORIZED_PAY_PERIOD_LOCKERS.includes(email)) return false;
  
  // Can only lock if it's currently PROCESSING
  return payPeriod.status === 'PROCESSING';
}

/**
 * Check if a user can export payroll data
 */
export function canExportPayroll(
  user: { email: string; role?: string }, 
  payPeriod: { status: string }
): boolean {
  if (!user.email) return false;
  const email = user.email.toLowerCase();
  
  // Only lockers/processors can export (usually lockers)
  if (!AUTHORIZED_PAY_PERIOD_LOCKERS.includes(email)) return false;
  
  // Can only export if it's LOCKED
  return payPeriod.status === 'LOCKED';
}

/**
 * Check if a user has general corporate access
 */
const corporateRoles = [
  "corporate", "Corporate", "corporate_admin", "super_user", "super_admin", "admin", "Admin",
  "regional_cl", "network_cl", "dealer_cl", "certification_liaison",
  "custom_user_list", "testing", "employee", "Employee",
  "ops", "operations", "ops_manager", "finance", "Finance"
];

export function hasCorporateAccess(role: string | null | undefined): boolean {
  return !!role && corporateRoles.includes(role);
}
