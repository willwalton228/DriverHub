/**
 * Unit Tests for Governance, Overrides & Executive Controls Engine (INCREMENT 11)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateOverride,
  isOverrideActive,
  applyOverrides,
  getDriverOverrides,
  getMarketOverrides,
  createOverride,
  approveOverride,
  rejectOverride,
  revokeOverride,
  processExpiredOverrides,
  createOverrideAuditEntry,
  getOverrideAuditEntries,
  clearOverrideAuditLog,
  generateExecutiveSummary,
  getDriverOverrideView,
  OverrideStatusError,
  OverrideApprovalError,
  OverrideValidationException,
  DEFAULT_OVERRIDE_LIMITS,
  type Override,
  type OverrideType,
} from './overrideEngine';

// ============================================
// TEST DATA
// ============================================

const createTestOverride = (overrides: Partial<Override> = {}): Override => ({
  id: 'ovr-test-1',
  type: 'BASE_RATE_ADJUSTMENT',
  scope: 'DRIVER',
  targetId: 'driver-1',
  status: 'ACTIVE',
  adjustmentType: 'PERCENTAGE',
  adjustmentValue: 0.10, // +10%
  originalValue: 2500,
  reason: 'Performance bonus for excellent work',
  justification: 'Driver has maintained 5-star rating for 6 months with zero incidents',
  approvedBy: 'admin-2',
  approvedAt: '2026-01-15T00:00:00Z',
  rejectedBy: null,
  rejectedAt: null,
  rejectionReason: null,
  effectiveDate: '2026-01-15',
  expirationDate: '2026-04-15',
  createdBy: 'admin-1',
  createdAt: '2026-01-14T00:00:00Z',
  revokedBy: null,
  revokedAt: null,
  revocationReason: null,
  ...overrides,
});

// ============================================
// 1. OVERRIDE LIMITS
// ============================================

describe('DEFAULT_OVERRIDE_LIMITS', () => {
  it('should define limits for all override types', () => {
    const types: OverrideType[] = [
      'BASE_RATE_ADJUSTMENT',
      'VOLUME_MULTIPLIER_OVERRIDE',
      'SAFETY_MULTIPLIER_OVERRIDE',
      'HOURLY_FLOOR_OVERRIDE',
      'TIER_FREEZE',
      'ELIGIBILITY_OVERRIDE',
    ];
    
    for (const type of types) {
      expect(DEFAULT_OVERRIDE_LIMITS[type]).toBeDefined();
      expect(DEFAULT_OVERRIDE_LIMITS[type].maxDurationDays).toBeGreaterThan(0);
    }
  });

  it('should have reasonable max percentage limits', () => {
    const limits = DEFAULT_OVERRIDE_LIMITS.BASE_RATE_ADJUSTMENT;
    expect(limits.maxPercentageIncrease).toBeLessThanOrEqual(0.50);
    expect(limits.maxPercentageDecrease).toBeLessThanOrEqual(0.25);
  });
});

// ============================================
// 2. VALIDATION
// ============================================

describe('validateOverride', () => {
  it('should pass for valid override', () => {
    const override = createTestOverride();
    const errors = validateOverride(override);
    expect(errors).toHaveLength(0);
  });

  it('should require reason', () => {
    const override = createTestOverride({ reason: 'short' });
    const errors = validateOverride(override);
    expect(errors.some(e => e.code === 'REASON_REQUIRED')).toBe(true);
  });

  it('should require justification', () => {
    const override = createTestOverride({ justification: 'too short' });
    const errors = validateOverride(override);
    expect(errors.some(e => e.code === 'JUSTIFICATION_REQUIRED')).toBe(true);
  });

  it('should require expiration date', () => {
    const override = { ...createTestOverride(), expirationDate: undefined as any };
    const errors = validateOverride(override);
    expect(errors.some(e => e.code === 'EXPIRATION_REQUIRED')).toBe(true);
  });

  it('should reject excessive duration', () => {
    const override = createTestOverride({
      effectiveDate: '2026-01-01',
      expirationDate: '2027-01-01', // 365 days, exceeds 90 day limit
    });
    const errors = validateOverride(override);
    expect(errors.some(e => e.code === 'DURATION_EXCEEDED')).toBe(true);
  });

  it('should reject excessive percentage increase', () => {
    const override = createTestOverride({
      adjustmentType: 'PERCENTAGE',
      adjustmentValue: 0.50, // 50%, exceeds 25% limit
    });
    const errors = validateOverride(override);
    expect(errors.some(e => e.code === 'MAGNITUDE_EXCEEDED')).toBe(true);
  });

  it('should reject excessive percentage decrease', () => {
    const override = createTestOverride({
      adjustmentType: 'PERCENTAGE',
      adjustmentValue: -0.30, // -30%, exceeds 15% limit
    });
    const errors = validateOverride(override);
    expect(errors.some(e => e.code === 'MAGNITUDE_EXCEEDED')).toBe(true);
  });

  it('should reject excessive absolute increase', () => {
    const override = createTestOverride({
      adjustmentType: 'ABSOLUTE',
      adjustmentValue: 1000, // $10, exceeds $5 limit
    });
    const errors = validateOverride(override);
    expect(errors.some(e => e.code === 'MAGNITUDE_EXCEEDED')).toBe(true);
  });
});

describe('isOverrideActive', () => {
  it('should return true for active override within date range', () => {
    const override = createTestOverride({
      status: 'ACTIVE',
      effectiveDate: '2026-01-15',
      expirationDate: '2026-04-15',
    });
    
    expect(isOverrideActive(override, '2026-02-15')).toBe(true);
  });

  it('should return false for non-active status', () => {
    const override = createTestOverride({ status: 'PENDING_APPROVAL' });
    expect(isOverrideActive(override, '2026-02-15')).toBe(false);
  });

  it('should return false before effective date', () => {
    const override = createTestOverride({ effectiveDate: '2026-02-01' });
    expect(isOverrideActive(override, '2026-01-15')).toBe(false);
  });

  it('should return false after expiration date', () => {
    const override = createTestOverride({ expirationDate: '2026-02-01' });
    expect(isOverrideActive(override, '2026-03-01')).toBe(false);
  });
});

// ============================================
// 3. OVERRIDE APPLICATION
// ============================================

describe('applyOverrides', () => {
  it('should apply percentage increase', () => {
    const overrides = [createTestOverride({
      adjustmentType: 'PERCENTAGE',
      adjustmentValue: 0.10,
    })];
    
    const result = applyOverrides(2500, overrides, '2026-02-15', 'driver-1', 'BASE_RATE_ADJUSTMENT');
    
    expect(result.originalValue).toBe(2500);
    expect(result.adjustedValue).toBe(2750); // 2500 + 10%
    expect(result.overridesApplied).toHaveLength(1);
  });

  it('should apply absolute adjustment', () => {
    const overrides = [createTestOverride({
      adjustmentType: 'ABSOLUTE',
      adjustmentValue: 200, // +$2
    })];
    
    const result = applyOverrides(2500, overrides, '2026-02-15', 'driver-1', 'BASE_RATE_ADJUSTMENT');
    
    expect(result.adjustedValue).toBe(2700);
  });

  it('should apply fixed value', () => {
    const overrides = [createTestOverride({
      adjustmentType: 'FIXED_VALUE',
      adjustmentValue: 3000,
    })];
    
    const result = applyOverrides(2500, overrides, '2026-02-15', 'driver-1', 'BASE_RATE_ADJUSTMENT');
    
    expect(result.adjustedValue).toBe(3000);
  });

  it('should not apply inactive overrides', () => {
    const overrides = [createTestOverride({ status: 'EXPIRED' })];
    
    const result = applyOverrides(2500, overrides, '2026-02-15', 'driver-1', 'BASE_RATE_ADJUSTMENT');
    
    expect(result.adjustedValue).toBe(2500); // Unchanged
    expect(result.overridesApplied).toHaveLength(0);
  });

  it('should apply GLOBAL overrides to all targets', () => {
    const overrides = [createTestOverride({
      scope: 'GLOBAL',
      targetId: 'GLOBAL',
      adjustmentType: 'PERCENTAGE',
      adjustmentValue: 0.05,
    })];
    
    const result = applyOverrides(2500, overrides, '2026-02-15', 'any-driver', 'BASE_RATE_ADJUSTMENT');
    
    expect(result.adjustedValue).toBe(2625); // 2500 + 5%
  });

  it('should apply multiple overrides in order', () => {
    const overrides = [
      createTestOverride({
        id: 'ovr-1',
        scope: 'GLOBAL',
        targetId: 'GLOBAL',
        adjustmentType: 'PERCENTAGE',
        adjustmentValue: 0.10,
      }),
      createTestOverride({
        id: 'ovr-2',
        scope: 'DRIVER',
        targetId: 'driver-1',
        adjustmentType: 'ABSOLUTE',
        adjustmentValue: 100,
      }),
    ];
    
    const result = applyOverrides(2500, overrides, '2026-02-15', 'driver-1', 'BASE_RATE_ADJUSTMENT');
    
    expect(result.overridesApplied).toHaveLength(2);
    expect(result.adjustedValue).toBe(2850); // 2500 * 1.10 + 100 = 2850
  });
});

describe('getDriverOverrides', () => {
  it('should return driver-specific overrides', () => {
    const overrides = [
      createTestOverride({ targetId: 'driver-1' }),
      createTestOverride({ id: 'ovr-2', targetId: 'driver-2' }),
    ];
    
    const result = getDriverOverrides('driver-1', overrides, '2026-02-15');
    
    expect(result).toHaveLength(1);
    expect(result[0].targetId).toBe('driver-1');
  });

  it('should include global overrides', () => {
    const overrides = [
      createTestOverride({ targetId: 'driver-1' }),
      createTestOverride({ id: 'ovr-2', scope: 'GLOBAL', targetId: 'GLOBAL' }),
    ];
    
    const result = getDriverOverrides('driver-1', overrides, '2026-02-15');
    
    expect(result).toHaveLength(2);
  });
});

// ============================================
// 4. OVERRIDE LIFECYCLE
// ============================================

describe('createOverride', () => {
  it('should create pending override with valid input', () => {
    const input = {
      type: 'BASE_RATE_ADJUSTMENT' as const,
      scope: 'DRIVER' as const,
      targetId: 'driver-1',
      adjustmentType: 'PERCENTAGE' as const,
      adjustmentValue: 0.10,
      originalValue: 2500,
      reason: 'Performance bonus for excellent driving record',
      justification: 'Driver maintained 5-star rating for 12 months with zero safety incidents',
      effectiveDate: '2026-02-01',
      expirationDate: '2026-05-01',
    };
    
    const result = createOverride(input, 'admin-1');
    
    expect(Array.isArray(result)).toBe(false);
    const override = result as Override;
    expect(override.status).toBe('PENDING_APPROVAL');
    expect(override.createdBy).toBe('admin-1');
  });

  it('should return validation errors for invalid input', () => {
    const input = {
      type: 'BASE_RATE_ADJUSTMENT' as const,
      scope: 'DRIVER' as const,
      targetId: 'driver-1',
      adjustmentType: 'PERCENTAGE' as const,
      adjustmentValue: 0.10,
      originalValue: 2500,
      reason: 'short', // Too short
      justification: 'short', // Too short
      effectiveDate: '2026-02-01',
      expirationDate: '2026-05-01',
    };
    
    const result = createOverride(input, 'admin-1');
    
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('approveOverride', () => {
  it('should approve pending override', () => {
    const override = createTestOverride({ status: 'PENDING_APPROVAL' });
    const approved = approveOverride(override, 'admin-2');
    
    expect(approved.status).toBe('ACTIVE');
    expect(approved.approvedBy).toBe('admin-2');
    expect(approved.approvedAt).toBeDefined();
  });

  it('should throw error if not pending', () => {
    const override = createTestOverride({ status: 'ACTIVE' });
    expect(() => approveOverride(override, 'admin-2')).toThrow(OverrideStatusError);
  });

  it('should throw error if approver is creator', () => {
    const override = createTestOverride({ status: 'PENDING_APPROVAL', createdBy: 'admin-1' });
    expect(() => approveOverride(override, 'admin-1')).toThrow(OverrideApprovalError);
  });
});

describe('rejectOverride', () => {
  it('should reject pending override with reason', () => {
    const override = createTestOverride({ status: 'PENDING_APPROVAL' });
    const rejected = rejectOverride(override, 'admin-2', 'Insufficient justification for this adjustment');
    
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rejectedBy).toBe('admin-2');
    expect(rejected.rejectionReason).toBeDefined();
  });

  it('should throw error if reason too short', () => {
    const override = createTestOverride({ status: 'PENDING_APPROVAL' });
    expect(() => rejectOverride(override, 'admin-2', 'no')).toThrow(OverrideValidationException);
  });
});

describe('revokeOverride', () => {
  it('should revoke active override', () => {
    const override = createTestOverride({ status: 'ACTIVE' });
    const revoked = revokeOverride(override, 'admin-1', 'Circumstances have changed requiring revocation');
    
    expect(revoked.status).toBe('REVOKED');
    expect(revoked.revokedBy).toBe('admin-1');
  });

  it('should throw error if not active', () => {
    const override = createTestOverride({ status: 'EXPIRED' });
    expect(() => revokeOverride(override, 'admin-1', 'Some reason here')).toThrow(OverrideStatusError);
  });
});

describe('processExpiredOverrides', () => {
  it('should mark expired overrides as EXPIRED', () => {
    const overrides = [
      createTestOverride({ expirationDate: '2026-01-15' }),
      createTestOverride({ id: 'ovr-2', expirationDate: '2026-03-15' }),
    ];
    
    const { updated, expiredCount } = processExpiredOverrides(overrides, '2026-02-15');
    
    expect(expiredCount).toBe(1);
    expect(updated[0].status).toBe('EXPIRED');
    expect(updated[1].status).toBe('ACTIVE');
  });
});

// ============================================
// 5. AUDIT TRAIL
// ============================================

describe('Override Audit Trail', () => {
  beforeEach(() => {
    clearOverrideAuditLog();
  });

  it('should create audit entry', () => {
    const entry = createOverrideAuditEntry(
      'ovr-1',
      'APPROVED',
      'admin-2',
      'PENDING_APPROVAL',
      'ACTIVE'
    );
    
    expect(entry.id).toBeDefined();
    expect(entry.action).toBe('APPROVED');
  });

  it('should retrieve audit entries for override', () => {
    createOverrideAuditEntry('ovr-1', 'CREATED', 'admin-1', null, 'PENDING_APPROVAL');
    createOverrideAuditEntry('ovr-1', 'APPROVED', 'admin-2', 'PENDING_APPROVAL', 'ACTIVE');
    createOverrideAuditEntry('ovr-2', 'CREATED', 'admin-1', null, 'PENDING_APPROVAL');
    
    const entries = getOverrideAuditEntries('ovr-1');
    
    expect(entries).toHaveLength(2);
  });
});

// ============================================
// 6. EXECUTIVE SUMMARY
// ============================================

describe('generateExecutiveSummary', () => {
  it('should count active overrides', () => {
    const overrides = [
      createTestOverride({ status: 'ACTIVE' }),
      createTestOverride({ id: 'ovr-2', status: 'EXPIRED' }),
    ];
    
    const summary = generateExecutiveSummary(overrides, '2026-02-15');
    
    expect(summary.totalActiveOverrides).toBe(1);
    expect(summary.byStatus.ACTIVE).toBe(1);
    expect(summary.byStatus.EXPIRED).toBe(1);
  });

  it('should count by type', () => {
    const overrides = [
      createTestOverride({ type: 'BASE_RATE_ADJUSTMENT' }),
      createTestOverride({ id: 'ovr-2', type: 'VOLUME_MULTIPLIER_OVERRIDE' }),
    ];
    
    const summary = generateExecutiveSummary(overrides, '2026-02-15');
    
    expect(summary.byType.BASE_RATE_ADJUSTMENT).toBe(1);
    expect(summary.byType.VOLUME_MULTIPLIER_OVERRIDE).toBe(1);
  });

  it('should identify expiring overrides', () => {
    const overrides = [
      createTestOverride({ expirationDate: '2026-02-20' }), // Within 7 days
      createTestOverride({ id: 'ovr-2', expirationDate: '2026-04-15' }), // Not within 7 days
    ];
    
    const summary = generateExecutiveSummary(overrides, '2026-02-15');
    
    expect(summary.expiringWithin7Days).toBe(1);
  });

  it('should include recently created overrides', () => {
    const overrides = [
      createTestOverride({ createdAt: '2026-02-14T00:00:00Z' }),
    ];
    
    const summary = generateExecutiveSummary(overrides, '2026-02-15');
    
    expect(summary.recentlyCreated).toHaveLength(1);
  });
});

// ============================================
// 7. DRIVER TRANSPARENCY VIEW
// ============================================

describe('getDriverOverrideView', () => {
  it('should return active overrides for driver', () => {
    const overrides = [createTestOverride({ status: 'ACTIVE' })];
    
    const view = getDriverOverrideView('driver-1', overrides, '2026-02-15');
    
    expect(view.activeOverrides).toHaveLength(1);
    expect(view.activeOverrides[0].type).toBe('BASE_RATE_ADJUSTMENT');
  });

  it('should return pending overrides', () => {
    const overrides = [createTestOverride({ status: 'PENDING_APPROVAL' })];
    
    const view = getDriverOverrideView('driver-1', overrides, '2026-02-15');
    
    expect(view.pendingOverrides).toHaveLength(1);
  });

  it('should return recently expired overrides', () => {
    const overrides = [createTestOverride({
      status: 'EXPIRED',
      expirationDate: '2026-02-10', // Within last 30 days
    })];
    
    const view = getDriverOverrideView('driver-1', overrides, '2026-02-15');
    
    expect(view.recentlyExpired).toHaveLength(1);
  });

  it('should format override details for driver display', () => {
    const overrides = [createTestOverride({
      adjustmentType: 'PERCENTAGE',
      adjustmentValue: 0.10,
    })];
    
    const view = getDriverOverrideView('driver-1', overrides, '2026-02-15');
    
    expect(view.activeOverrides[0].impactDescription).toBe('+10.0%');
    expect(view.activeOverrides[0].description).toBe('Base Rate Adjustment');
  });
});
