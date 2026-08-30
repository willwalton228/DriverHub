/**
 * Governance, Overrides & Executive Controls Engine (INCREMENT 11)
 * 
 * Backend-only system for:
 * 1. Override framework with strict expiration, approval, and reason requirements
 * 2. Apply overrides after policy resolution but before final pay calc
 * 3. Enforce hard caps on override magnitude and duration
 * 4. Surface overrides in audit trails and driver transparency views
 * 5. Provide read-only executive summaries of active overrides and impact
 * 
 * NOT implementing: permanent overrides, hidden exceptions, UI-heavy dashboards
 */

// ============================================
// TYPES & CONSTANTS
// ============================================

/** Override types */
export type OverrideType = 
  | 'BASE_RATE_ADJUSTMENT'
  | 'VOLUME_MULTIPLIER_OVERRIDE'
  | 'SAFETY_MULTIPLIER_OVERRIDE'
  | 'HOURLY_FLOOR_OVERRIDE'
  | 'TIER_FREEZE'
  | 'ELIGIBILITY_OVERRIDE';

/** Override status */
export type OverrideStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'REJECTED';

/** Override scope */
export type OverrideScope = 'DRIVER' | 'MARKET' | 'GLOBAL';

/** Override magnitude limits */
export interface OverrideLimits {
  maxPercentageIncrease: number; // e.g., 0.25 = 25% max increase
  maxPercentageDecrease: number; // e.g., 0.15 = 15% max decrease
  maxAbsoluteIncreaseCents: number | null; // e.g., 500 = $5/hr max increase
  maxAbsoluteDecreaseCents: number | null;
  maxDurationDays: number; // Maximum duration in days
}

/** Default override limits */
export const DEFAULT_OVERRIDE_LIMITS: Record<OverrideType, OverrideLimits> = {
  BASE_RATE_ADJUSTMENT: {
    maxPercentageIncrease: 0.25,
    maxPercentageDecrease: 0.15,
    maxAbsoluteIncreaseCents: 500,
    maxAbsoluteDecreaseCents: 300,
    maxDurationDays: 90,
  },
  VOLUME_MULTIPLIER_OVERRIDE: {
    maxPercentageIncrease: 0.10,
    maxPercentageDecrease: 0.10,
    maxAbsoluteIncreaseCents: null,
    maxAbsoluteDecreaseCents: null,
    maxDurationDays: 30,
  },
  SAFETY_MULTIPLIER_OVERRIDE: {
    maxPercentageIncrease: 0.10,
    maxPercentageDecrease: 0.10,
    maxAbsoluteIncreaseCents: null,
    maxAbsoluteDecreaseCents: null,
    maxDurationDays: 30,
  },
  HOURLY_FLOOR_OVERRIDE: {
    maxPercentageIncrease: 0.20,
    maxPercentageDecrease: 0.10,
    maxAbsoluteIncreaseCents: 300,
    maxAbsoluteDecreaseCents: 200,
    maxDurationDays: 60,
  },
  TIER_FREEZE: {
    maxPercentageIncrease: 0,
    maxPercentageDecrease: 0,
    maxAbsoluteIncreaseCents: null,
    maxAbsoluteDecreaseCents: null,
    maxDurationDays: 180,
  },
  ELIGIBILITY_OVERRIDE: {
    maxPercentageIncrease: 0,
    maxPercentageDecrease: 0,
    maxAbsoluteIncreaseCents: null,
    maxAbsoluteDecreaseCents: null,
    maxDurationDays: 30, // Short duration for eligibility overrides
  },
};

/** Override record */
export interface Override {
  id: string;
  type: OverrideType;
  scope: OverrideScope;
  targetId: string; // driverId, marketId, or 'GLOBAL'
  status: OverrideStatus;
  
  // Value changes
  adjustmentType: 'PERCENTAGE' | 'ABSOLUTE' | 'FIXED_VALUE' | 'BOOLEAN';
  adjustmentValue: number; // percentage (0.10 = 10%), cents, or 0/1 for boolean
  originalValue: number | null;
  
  // Approval requirements
  reason: string; // Required
  justification: string; // Required detailed explanation
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  
  // Time bounds (required - no permanent overrides)
  effectiveDate: string;
  expirationDate: string;
  
  // Audit
  createdBy: string;
  createdAt: string;
  revokedBy: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
}

/** Override validation error */
export interface OverrideValidationError {
  code: string;
  field: string;
  message: string;
  limit?: number;
  actual?: number;
}

/** Override application result */
export interface OverrideApplicationResult {
  originalValue: number;
  adjustedValue: number;
  overridesApplied: Override[];
  totalAdjustment: number;
  adjustmentPercentage: number;
}

/** Executive summary */
export interface ExecutiveSummary {
  generatedAt: string;
  totalActiveOverrides: number;
  byType: Record<OverrideType, number>;
  byScope: Record<OverrideScope, number>;
  byStatus: Record<OverrideStatus, number>;
  totalImpactCents: number;
  driversAffected: number;
  marketsAffected: number;
  expiringWithin7Days: number;
  recentlyCreated: Override[];
  highestImpactOverrides: OverrideImpact[];
}

/** Override impact for executive view */
export interface OverrideImpact {
  override: Override;
  estimatedWeeklyImpactCents: number;
  affectedDriverCount: number;
}

/** Override audit entry */
export interface OverrideAuditEntry {
  id: string;
  overrideId: string;
  action: 'CREATED' | 'APPROVED' | 'REJECTED' | 'APPLIED' | 'EXPIRED' | 'REVOKED';
  performedBy: string;
  performedAt: string;
  previousStatus: OverrideStatus | null;
  newStatus: OverrideStatus | null;
  metadata: Record<string, any>;
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate an override against limits and requirements.
 */
export function validateOverride(
  override: Partial<Override>,
  limits: OverrideLimits = DEFAULT_OVERRIDE_LIMITS[override.type || 'BASE_RATE_ADJUSTMENT']
): OverrideValidationError[] {
  const errors: OverrideValidationError[] = [];
  
  // Required fields
  if (!override.reason || override.reason.trim().length < 10) {
    errors.push({
      code: 'REASON_REQUIRED',
      field: 'reason',
      message: 'Reason is required and must be at least 10 characters',
    });
  }
  
  if (!override.justification || override.justification.trim().length < 25) {
    errors.push({
      code: 'JUSTIFICATION_REQUIRED',
      field: 'justification',
      message: 'Detailed justification is required (minimum 25 characters)',
    });
  }
  
  // Expiration required (no permanent overrides)
  if (!override.expirationDate) {
    errors.push({
      code: 'EXPIRATION_REQUIRED',
      field: 'expirationDate',
      message: 'Expiration date is required - permanent overrides are not allowed',
    });
  }
  
  // Duration check
  if (override.effectiveDate && override.expirationDate) {
    const effectiveDate = new Date(override.effectiveDate);
    const expirationDate = new Date(override.expirationDate);
    const durationDays = Math.ceil((expirationDate.getTime() - effectiveDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (durationDays > limits.maxDurationDays) {
      errors.push({
        code: 'DURATION_EXCEEDED',
        field: 'expirationDate',
        message: `Duration (${durationDays} days) exceeds maximum allowed (${limits.maxDurationDays} days)`,
        limit: limits.maxDurationDays,
        actual: durationDays,
      });
    }
    
    if (durationDays <= 0) {
      errors.push({
        code: 'INVALID_DURATION',
        field: 'expirationDate',
        message: 'Expiration date must be after effective date',
      });
    }
  }
  
  // Magnitude checks for percentage adjustments
  if (override.adjustmentType === 'PERCENTAGE' && override.adjustmentValue !== undefined) {
    if (override.adjustmentValue > 0 && override.adjustmentValue > limits.maxPercentageIncrease) {
      errors.push({
        code: 'MAGNITUDE_EXCEEDED',
        field: 'adjustmentValue',
        message: `Percentage increase (${(override.adjustmentValue * 100).toFixed(1)}%) exceeds maximum (${(limits.maxPercentageIncrease * 100).toFixed(1)}%)`,
        limit: limits.maxPercentageIncrease,
        actual: override.adjustmentValue,
      });
    }
    
    if (override.adjustmentValue < 0 && Math.abs(override.adjustmentValue) > limits.maxPercentageDecrease) {
      errors.push({
        code: 'MAGNITUDE_EXCEEDED',
        field: 'adjustmentValue',
        message: `Percentage decrease (${(Math.abs(override.adjustmentValue) * 100).toFixed(1)}%) exceeds maximum (${(limits.maxPercentageDecrease * 100).toFixed(1)}%)`,
        limit: limits.maxPercentageDecrease,
        actual: Math.abs(override.adjustmentValue),
      });
    }
  }
  
  // Magnitude checks for absolute adjustments
  if (override.adjustmentType === 'ABSOLUTE' && override.adjustmentValue !== undefined) {
    if (override.adjustmentValue > 0 && limits.maxAbsoluteIncreaseCents !== null) {
      if (override.adjustmentValue > limits.maxAbsoluteIncreaseCents) {
        errors.push({
          code: 'MAGNITUDE_EXCEEDED',
          field: 'adjustmentValue',
          message: `Absolute increase ($${(override.adjustmentValue / 100).toFixed(2)}) exceeds maximum ($${(limits.maxAbsoluteIncreaseCents / 100).toFixed(2)})`,
          limit: limits.maxAbsoluteIncreaseCents,
          actual: override.adjustmentValue,
        });
      }
    }
    
    if (override.adjustmentValue < 0 && limits.maxAbsoluteDecreaseCents !== null) {
      if (Math.abs(override.adjustmentValue) > limits.maxAbsoluteDecreaseCents) {
        errors.push({
          code: 'MAGNITUDE_EXCEEDED',
          field: 'adjustmentValue',
          message: `Absolute decrease ($${(Math.abs(override.adjustmentValue) / 100).toFixed(2)}) exceeds maximum ($${(limits.maxAbsoluteDecreaseCents / 100).toFixed(2)})`,
          limit: limits.maxAbsoluteDecreaseCents,
          actual: Math.abs(override.adjustmentValue),
        });
      }
    }
  }
  
  return errors;
}

/**
 * Check if an override is currently active.
 */
export function isOverrideActive(override: Override, checkDate: string): boolean {
  if (override.status !== 'ACTIVE') {
    return false;
  }
  
  if (checkDate < override.effectiveDate) {
    return false;
  }
  
  if (checkDate > override.expirationDate) {
    return false;
  }
  
  return true;
}

// ============================================
// OVERRIDE APPLICATION
// ============================================

/**
 * Apply overrides to a base value.
 * Called AFTER policy resolution but BEFORE final pay calculation.
 */
export function applyOverrides(
  baseValue: number,
  overrides: Override[],
  date: string,
  targetId: string,
  overrideType: OverrideType
): OverrideApplicationResult {
  let adjustedValue = baseValue;
  const appliedOverrides: Override[] = [];
  
  // Filter and sort applicable overrides
  const applicableOverrides = overrides
    .filter(o => o.type === overrideType)
    .filter(o => isOverrideActive(o, date))
    .filter(o => o.targetId === targetId || o.targetId === 'GLOBAL' || o.scope === 'GLOBAL')
    .sort((a, b) => {
      // Apply GLOBAL first, then MARKET, then DRIVER (most specific wins)
      const scopeOrder: Record<OverrideScope, number> = { GLOBAL: 0, MARKET: 1, DRIVER: 2 };
      return scopeOrder[a.scope] - scopeOrder[b.scope];
    });
  
  for (const override of applicableOverrides) {
    let adjustment = 0;
    
    switch (override.adjustmentType) {
      case 'PERCENTAGE':
        adjustment = Math.round(adjustedValue * override.adjustmentValue);
        adjustedValue += adjustment;
        break;
      case 'ABSOLUTE':
        adjustment = override.adjustmentValue;
        adjustedValue += adjustment;
        break;
      case 'FIXED_VALUE':
        adjustment = override.adjustmentValue - adjustedValue;
        adjustedValue = override.adjustmentValue;
        break;
      case 'BOOLEAN':
        // For boolean overrides, value is already set
        break;
    }
    
    appliedOverrides.push(override);
  }
  
  return {
    originalValue: baseValue,
    adjustedValue,
    overridesApplied: appliedOverrides,
    totalAdjustment: adjustedValue - baseValue,
    adjustmentPercentage: baseValue !== 0 ? (adjustedValue - baseValue) / baseValue : 0,
  };
}

/**
 * Get all active overrides for a driver.
 */
export function getDriverOverrides(
  driverId: string,
  allOverrides: Override[],
  date: string
): Override[] {
  return allOverrides.filter(o => 
    isOverrideActive(o, date) && 
    (o.targetId === driverId || o.scope === 'GLOBAL')
  );
}

/**
 * Get all active overrides for a market.
 */
export function getMarketOverrides(
  marketId: string,
  allOverrides: Override[],
  date: string
): Override[] {
  return allOverrides.filter(o => 
    isOverrideActive(o, date) && 
    (o.targetId === marketId || o.scope === 'GLOBAL') &&
    o.scope !== 'DRIVER'
  );
}

// ============================================
// OVERRIDE LIFECYCLE
// ============================================

/**
 * Create a new override (pending approval).
 */
export function createOverride(
  input: Omit<Override, 'id' | 'status' | 'approvedBy' | 'approvedAt' | 'rejectedBy' | 'rejectedAt' | 'rejectionReason' | 'revokedBy' | 'revokedAt' | 'revocationReason' | 'createdAt' | 'createdBy'>,
  createdBy: string
): Override | OverrideValidationError[] {
  const errors = validateOverride(input);
  
  if (errors.length > 0) {
    return errors;
  }
  
  return {
    ...input,
    id: `ovr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    status: 'PENDING_APPROVAL',
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectionReason: null,
    revokedBy: null,
    revokedAt: null,
    revocationReason: null,
    createdAt: new Date().toISOString(),
    createdBy,
  } as Override;
}

/**
 * Approve an override.
 */
export function approveOverride(
  override: Override,
  approvedBy: string
): Override {
  if (override.status !== 'PENDING_APPROVAL') {
    throw new OverrideStatusError(`Cannot approve override in status: ${override.status}`);
  }
  
  if (override.createdBy === approvedBy) {
    throw new OverrideApprovalError('Cannot approve your own override - requires separate approver');
  }
  
  return {
    ...override,
    status: 'ACTIVE',
    approvedBy,
    approvedAt: new Date().toISOString(),
  };
}

/**
 * Reject an override.
 */
export function rejectOverride(
  override: Override,
  rejectedBy: string,
  rejectionReason: string
): Override {
  if (override.status !== 'PENDING_APPROVAL') {
    throw new OverrideStatusError(`Cannot reject override in status: ${override.status}`);
  }
  
  if (!rejectionReason || rejectionReason.trim().length < 10) {
    throw new OverrideValidationException('Rejection reason must be at least 10 characters');
  }
  
  return {
    ...override,
    status: 'REJECTED',
    rejectedBy,
    rejectedAt: new Date().toISOString(),
    rejectionReason,
  };
}

/**
 * Revoke an active override.
 */
export function revokeOverride(
  override: Override,
  revokedBy: string,
  revocationReason: string
): Override {
  if (override.status !== 'ACTIVE') {
    throw new OverrideStatusError(`Cannot revoke override in status: ${override.status}`);
  }
  
  if (!revocationReason || revocationReason.trim().length < 10) {
    throw new OverrideValidationException('Revocation reason must be at least 10 characters');
  }
  
  return {
    ...override,
    status: 'REVOKED',
    revokedBy,
    revokedAt: new Date().toISOString(),
    revocationReason,
  };
}

/**
 * Check and update expired overrides.
 */
export function processExpiredOverrides(
  overrides: Override[],
  currentDate: string
): { updated: Override[]; expiredCount: number } {
  const updated: Override[] = [];
  let expiredCount = 0;
  
  for (const override of overrides) {
    if (override.status === 'ACTIVE' && currentDate > override.expirationDate) {
      updated.push({
        ...override,
        status: 'EXPIRED',
      });
      expiredCount++;
    } else {
      updated.push(override);
    }
  }
  
  return { updated, expiredCount };
}

// ============================================
// ERROR CLASSES
// ============================================

export class OverrideStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OverrideStatusError';
  }
}

export class OverrideApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OverrideApprovalError';
  }
}

export class OverrideValidationException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OverrideValidationException';
  }
}

// ============================================
// AUDIT TRAIL
// ============================================

/** In-memory audit log */
const overrideAuditLog: OverrideAuditEntry[] = [];

/**
 * Create an audit entry for an override action.
 */
export function createOverrideAuditEntry(
  overrideId: string,
  action: 'CREATED' | 'APPROVED' | 'REJECTED' | 'APPLIED' | 'EXPIRED' | 'REVOKED',
  performedBy: string,
  previousStatus: OverrideStatus | null,
  newStatus: OverrideStatus | null,
  metadata: Record<string, any> = {}
): OverrideAuditEntry {
  const entry: OverrideAuditEntry = {
    id: `oa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    overrideId,
    action,
    performedBy,
    performedAt: new Date().toISOString(),
    previousStatus,
    newStatus,
    metadata,
  };
  
  overrideAuditLog.push(entry);
  return entry;
}

/**
 * Get audit entries for an override.
 */
export function getOverrideAuditEntries(overrideId: string): OverrideAuditEntry[] {
  return overrideAuditLog
    .filter(e => e.overrideId === overrideId)
    .sort((a, b) => a.performedAt.localeCompare(b.performedAt));
}

/**
 * Clear audit log (for testing).
 */
export function clearOverrideAuditLog(): void {
  overrideAuditLog.length = 0;
}

// ============================================
// EXECUTIVE SUMMARY
// ============================================

/**
 * Generate executive summary of all overrides.
 */
export function generateExecutiveSummary(
  overrides: Override[],
  currentDate: string,
  driverCount: number = 0,
  marketCount: number = 0
): ExecutiveSummary {
  const activeOverrides = overrides.filter(o => isOverrideActive(o, currentDate));
  
  // Count by type
  const byType: Record<OverrideType, number> = {
    BASE_RATE_ADJUSTMENT: 0,
    VOLUME_MULTIPLIER_OVERRIDE: 0,
    SAFETY_MULTIPLIER_OVERRIDE: 0,
    HOURLY_FLOOR_OVERRIDE: 0,
    TIER_FREEZE: 0,
    ELIGIBILITY_OVERRIDE: 0,
  };
  
  for (const o of activeOverrides) {
    byType[o.type]++;
  }
  
  // Count by scope
  const byScope: Record<OverrideScope, number> = {
    DRIVER: 0,
    MARKET: 0,
    GLOBAL: 0,
  };
  
  for (const o of activeOverrides) {
    byScope[o.scope]++;
  }
  
  // Count by status
  const byStatus: Record<OverrideStatus, number> = {
    PENDING_APPROVAL: 0,
    ACTIVE: 0,
    EXPIRED: 0,
    REVOKED: 0,
    REJECTED: 0,
  };
  
  for (const o of overrides) {
    byStatus[o.status]++;
  }
  
  // Calculate expiring within 7 days
  const sevenDaysFromNow = new Date(currentDate);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  const sevenDaysStr = sevenDaysFromNow.toISOString().split('T')[0];
  
  const expiringWithin7Days = activeOverrides.filter(
    o => o.expirationDate <= sevenDaysStr
  ).length;
  
  // Recently created (last 7 days)
  const sevenDaysAgo = new Date(currentDate);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString();
  
  const recentlyCreated = overrides
    .filter(o => o.createdAt >= sevenDaysAgoStr)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);
  
  // Calculate total impact
  let totalImpactCents = 0;
  const highestImpactOverrides: OverrideImpact[] = [];
  
  for (const o of activeOverrides) {
    let estimatedImpact = 0;
    
    if (o.adjustmentType === 'ABSOLUTE') {
      estimatedImpact = Math.abs(o.adjustmentValue);
    } else if (o.adjustmentType === 'PERCENTAGE' && o.originalValue) {
      estimatedImpact = Math.abs(o.originalValue * o.adjustmentValue);
    }
    
    totalImpactCents += estimatedImpact;
    
    highestImpactOverrides.push({
      override: o,
      estimatedWeeklyImpactCents: estimatedImpact,
      affectedDriverCount: o.scope === 'GLOBAL' ? driverCount : (o.scope === 'DRIVER' ? 1 : 0),
    });
  }
  
  // Sort by impact
  highestImpactOverrides.sort((a, b) => b.estimatedWeeklyImpactCents - a.estimatedWeeklyImpactCents);
  
  // Count unique affected drivers and markets
  const affectedDriverIds = new Set(
    activeOverrides.filter(o => o.scope === 'DRIVER').map(o => o.targetId)
  );
  const affectedMarketIds = new Set(
    activeOverrides.filter(o => o.scope === 'MARKET').map(o => o.targetId)
  );
  
  return {
    generatedAt: new Date().toISOString(),
    totalActiveOverrides: activeOverrides.length,
    byType,
    byScope,
    byStatus,
    totalImpactCents,
    driversAffected: activeOverrides.some(o => o.scope === 'GLOBAL') ? driverCount : affectedDriverIds.size,
    marketsAffected: activeOverrides.some(o => o.scope === 'GLOBAL') ? marketCount : affectedMarketIds.size,
    expiringWithin7Days,
    recentlyCreated,
    highestImpactOverrides: highestImpactOverrides.slice(0, 10),
  };
}

// ============================================
// DRIVER TRANSPARENCY VIEW
// ============================================

/** Override info for driver view */
export interface DriverOverrideView {
  driverId: string;
  activeOverrides: DriverOverrideDetail[];
  pendingOverrides: DriverOverrideDetail[];
  recentlyExpired: DriverOverrideDetail[];
}

/** Override detail for driver transparency */
export interface DriverOverrideDetail {
  overrideId: string;
  type: OverrideType;
  description: string;
  effectiveDate: string;
  expirationDate: string;
  status: OverrideStatus;
  impactDescription: string;
  reason: string;
}

/**
 * Generate driver-facing override view.
 */
export function getDriverOverrideView(
  driverId: string,
  allOverrides: Override[],
  currentDate: string
): DriverOverrideView {
  const driverOverrides = allOverrides.filter(
    o => o.targetId === driverId || o.scope === 'GLOBAL'
  );
  
  const activeOverrides: DriverOverrideDetail[] = [];
  const pendingOverrides: DriverOverrideDetail[] = [];
  const recentlyExpired: DriverOverrideDetail[] = [];
  
  const thirtyDaysAgo = new Date(currentDate);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
  
  for (const o of driverOverrides) {
    const detail = formatOverrideForDriver(o);
    
    if (isOverrideActive(o, currentDate)) {
      activeOverrides.push(detail);
    } else if (o.status === 'PENDING_APPROVAL') {
      pendingOverrides.push(detail);
    } else if (o.status === 'EXPIRED' && o.expirationDate >= thirtyDaysAgoStr) {
      recentlyExpired.push(detail);
    }
  }
  
  return {
    driverId,
    activeOverrides: activeOverrides.sort((a, b) => a.expirationDate.localeCompare(b.expirationDate)),
    pendingOverrides: pendingOverrides.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)),
    recentlyExpired: recentlyExpired.sort((a, b) => b.expirationDate.localeCompare(a.expirationDate)),
  };
}

/**
 * Format override for driver-facing display.
 */
function formatOverrideForDriver(override: Override): DriverOverrideDetail {
  const typeDescriptions: Record<OverrideType, string> = {
    BASE_RATE_ADJUSTMENT: 'Base Rate Adjustment',
    VOLUME_MULTIPLIER_OVERRIDE: 'Volume Bonus Adjustment',
    SAFETY_MULTIPLIER_OVERRIDE: 'Safety Bonus Adjustment',
    HOURLY_FLOOR_OVERRIDE: 'Hourly Minimum Adjustment',
    TIER_FREEZE: 'Tier Status Freeze',
    ELIGIBILITY_OVERRIDE: 'Eligibility Status Override',
  };
  
  let impactDescription = '';
  if (override.adjustmentType === 'PERCENTAGE') {
    const sign = override.adjustmentValue >= 0 ? '+' : '';
    impactDescription = `${sign}${(override.adjustmentValue * 100).toFixed(1)}%`;
  } else if (override.adjustmentType === 'ABSOLUTE') {
    const sign = override.adjustmentValue >= 0 ? '+' : '-';
    impactDescription = `${sign}$${(Math.abs(override.adjustmentValue) / 100).toFixed(2)}/hr`;
  } else if (override.adjustmentType === 'BOOLEAN') {
    impactDescription = override.adjustmentValue ? 'Enabled' : 'Disabled';
  } else if (override.adjustmentType === 'FIXED_VALUE') {
    impactDescription = `Set to $${(override.adjustmentValue / 100).toFixed(2)}/hr`;
  }
  
  return {
    overrideId: override.id,
    type: override.type,
    description: typeDescriptions[override.type],
    effectiveDate: override.effectiveDate,
    expirationDate: override.expirationDate,
    status: override.status,
    impactDescription,
    reason: override.reason,
  };
}
