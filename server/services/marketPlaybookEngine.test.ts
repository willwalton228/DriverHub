/**
 * Unit Tests for Market Launch Playbooks & Guardrails Engine (INCREMENT 9)
 */

import { describe, it, expect } from 'vitest';
import {
  validatePlaybook,
  validateCategory,
  canActivateMarket,
  getActivationResult,
  generateLaunchReadinessChecklist,
  generateLaunchReadinessReport,
  createPlaybookVersion,
  isPlaybookEffective,
  findEffectivePlaybook,
  createDraftPlaybook,
  createReadyPlaybook,
  ProspectiveChangeError,
  COMPENSATION_GUARDRAILS,
  OPERATIONS_GUARDRAILS,
  SAFETY_GUARDRAILS,
  COMPLIANCE_GUARDRAILS,
  ALL_GUARDRAILS,
  type MarketPlaybook,
  type ValidationError,
} from './marketPlaybookEngine';

// ============================================
// TEST DATA
// ============================================

const createValidPlaybook = (): MarketPlaybook => ({
  id: 'pb-market-1-v1',
  marketId: 'market-1',
  version: 1,
  status: 'DRAFT',
  effectiveDate: '2026-02-01',
  expiresAt: null,
  compensation: {
    defaultBaseRateCents: 2500,
    minimumBaseRateCents: 2000,
    maximumBaseRateCents: 3500,
    hourlyFloorCents: 1500,
    onDemandCapCents: 5000,
    volumeMultiplierEnabled: true,
    safetyMultiplierEnabled: true,
  },
  operations: {
    serviceAreaDefined: true,
    zonesConfigured: 3,
    dispatchRulesSet: true,
    minimumDriverCount: 5,
    maximumDriverCount: 100,
    operatingHoursSet: true,
  },
  safety: {
    safetyPolicyVersionId: 'sp-v1',
    backgroundCheckRequired: true,
    drivingRecordCheckRequired: true,
    minimumTenureDays: 0,
    trainingRequiredBeforeActivation: true,
  },
  compliance: {
    insuranceCoverageMinimumCents: 100000000,
    vehicleInspectionRequired: true,
    licenseVerificationRequired: true,
    w2DriverSupported: true,
    icDriverSupported: true,
  },
  createdAt: '2026-01-15T00:00:00Z',
  createdBy: 'admin-1',
  updatedAt: '2026-01-15T00:00:00Z',
  updatedBy: 'admin-1',
});

const createInvalidPlaybook = (): MarketPlaybook => ({
  ...createValidPlaybook(),
  compensation: {
    defaultBaseRateCents: 1000, // Below minimum
    minimumBaseRateCents: 2000,
    maximumBaseRateCents: 1500, // Less than minimum
    hourlyFloorCents: 0, // Invalid
    onDemandCapCents: 5000,
    volumeMultiplierEnabled: false,
    safetyMultiplierEnabled: true,
  },
  operations: {
    serviceAreaDefined: false,
    zonesConfigured: 0,
    dispatchRulesSet: false,
    minimumDriverCount: 0,
    maximumDriverCount: 100,
    operatingHoursSet: false,
  },
  safety: {
    safetyPolicyVersionId: null,
    backgroundCheckRequired: false,
    drivingRecordCheckRequired: false,
    minimumTenureDays: 0,
    trainingRequiredBeforeActivation: false,
  },
  compliance: {
    insuranceCoverageMinimumCents: 50000000, // Below minimum
    vehicleInspectionRequired: false,
    licenseVerificationRequired: false,
    w2DriverSupported: false,
    icDriverSupported: false,
  },
});

// ============================================
// 1. GUARDRAIL DEFINITIONS
// ============================================

describe('COMPENSATION_GUARDRAILS', () => {
  it('should have at least 4 compensation rules', () => {
    expect(COMPENSATION_GUARDRAILS.length).toBeGreaterThanOrEqual(4);
  });

  it('should have unique IDs', () => {
    const ids = COMPENSATION_GUARDRAILS.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('OPERATIONS_GUARDRAILS', () => {
  it('should have at least 4 operations rules', () => {
    expect(OPERATIONS_GUARDRAILS.length).toBeGreaterThanOrEqual(4);
  });
});

describe('SAFETY_GUARDRAILS', () => {
  it('should have at least 3 safety rules', () => {
    expect(SAFETY_GUARDRAILS.length).toBeGreaterThanOrEqual(3);
  });
});

describe('COMPLIANCE_GUARDRAILS', () => {
  it('should have at least 3 compliance rules', () => {
    expect(COMPLIANCE_GUARDRAILS.length).toBeGreaterThanOrEqual(3);
  });
});

describe('ALL_GUARDRAILS', () => {
  it('should combine all guardrail categories', () => {
    const expected = COMPENSATION_GUARDRAILS.length + 
                     OPERATIONS_GUARDRAILS.length + 
                     SAFETY_GUARDRAILS.length + 
                     COMPLIANCE_GUARDRAILS.length;
    expect(ALL_GUARDRAILS.length).toBe(expected);
  });
});

// ============================================
// 2. VALIDATION ENGINE
// ============================================

describe('validatePlaybook', () => {
  it('should return empty array for valid playbook', () => {
    const playbook = createValidPlaybook();
    const errors = validatePlaybook(playbook);
    expect(errors).toHaveLength(0);
  });

  it('should return errors for invalid playbook', () => {
    const playbook = createInvalidPlaybook();
    const errors = validatePlaybook(playbook);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should detect below-minimum base rate', () => {
    const playbook = createValidPlaybook();
    playbook.compensation.defaultBaseRateCents = 1000;
    const errors = validatePlaybook(playbook);
    
    expect(errors.some(e => e.code === 'COMP_001')).toBe(true);
  });

  it('should detect missing service area', () => {
    const playbook = createValidPlaybook();
    playbook.operations.serviceAreaDefined = false;
    const errors = validatePlaybook(playbook);
    
    expect(errors.some(e => e.code === 'OPS_001')).toBe(true);
  });

  it('should detect missing safety policy', () => {
    const playbook = createValidPlaybook();
    playbook.safety.safetyPolicyVersionId = null;
    const errors = validatePlaybook(playbook);
    
    expect(errors.some(e => e.code === 'SAFETY_001')).toBe(true);
  });

  it('should detect insufficient insurance', () => {
    const playbook = createValidPlaybook();
    playbook.compliance.insuranceCoverageMinimumCents = 50000000;
    const errors = validatePlaybook(playbook);
    
    expect(errors.some(e => e.code === 'COMPL_001')).toBe(true);
  });
});

describe('validateCategory', () => {
  it('should only validate compensation rules', () => {
    const playbook = createInvalidPlaybook();
    const errors = validateCategory(playbook, 'COMPENSATION');
    
    expect(errors.every(e => e.category === 'COMPENSATION')).toBe(true);
  });

  it('should only validate operations rules', () => {
    const playbook = createInvalidPlaybook();
    const errors = validateCategory(playbook, 'OPERATIONS');
    
    expect(errors.every(e => e.category === 'OPERATIONS')).toBe(true);
  });
});

// ============================================
// 3. canActivateMarket
// ============================================

describe('canActivateMarket', () => {
  it('should return true for valid playbook', () => {
    const playbook = createValidPlaybook();
    const result = canActivateMarket(playbook);
    
    expect(result).toBe(true);
  });

  it('should return errors array for invalid playbook', () => {
    const playbook = createInvalidPlaybook();
    const result = canActivateMarket(playbook);
    
    expect(Array.isArray(result)).toBe(true);
    expect((result as ValidationError[]).length).toBeGreaterThan(0);
  });

  it('should only include REQUIRED errors in failure', () => {
    const playbook = createValidPlaybook();
    playbook.compensation.volumeMultiplierEnabled = false; // Only RECOMMENDED
    const result = canActivateMarket(playbook);
    
    expect(result).toBe(true); // Should still pass
  });

  it('should fail if any REQUIRED guardrail fails', () => {
    const playbook = createValidPlaybook();
    playbook.safety.safetyPolicyVersionId = null;
    const result = canActivateMarket(playbook);
    
    expect(Array.isArray(result)).toBe(true);
    const errors = result as ValidationError[];
    expect(errors.some(e => e.code === 'SAFETY_001')).toBe(true);
  });
});

describe('getActivationResult', () => {
  it('should return canActivate: true for valid playbook', () => {
    const playbook = createValidPlaybook();
    const result = getActivationResult(playbook);
    
    expect(result.canActivate).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should return canActivate: false for invalid playbook', () => {
    const playbook = createInvalidPlaybook();
    const result = getActivationResult(playbook);
    
    expect(result.canActivate).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should separate errors and warnings', () => {
    const playbook = createValidPlaybook();
    playbook.compensation.volumeMultiplierEnabled = false;
    playbook.operations.operatingHoursSet = false;
    const result = getActivationResult(playbook);
    
    expect(result.canActivate).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should include launch readiness report', () => {
    const playbook = createValidPlaybook();
    const result = getActivationResult(playbook);
    
    expect(result.report).toBeDefined();
    expect(result.report.marketId).toBe(playbook.marketId);
  });
});

// ============================================
// 4. LAUNCH READINESS CHECKLIST
// ============================================

describe('generateLaunchReadinessChecklist', () => {
  it('should generate checklist with all guardrails', () => {
    const playbook = createValidPlaybook();
    const checklist = generateLaunchReadinessChecklist(playbook);
    
    expect(checklist.length).toBe(ALL_GUARDRAILS.length);
  });

  it('should mark passing items as PASS', () => {
    const playbook = createValidPlaybook();
    const checklist = generateLaunchReadinessChecklist(playbook);
    
    expect(checklist.every(c => c.status === 'PASS')).toBe(true);
  });

  it('should mark failing required items as FAIL', () => {
    const playbook = createValidPlaybook();
    playbook.safety.safetyPolicyVersionId = null;
    const checklist = generateLaunchReadinessChecklist(playbook);
    
    const safetyItem = checklist.find(c => c.id === 'SAFETY_001');
    expect(safetyItem?.status).toBe('FAIL');
  });

  it('should mark failing recommended items as WARNING', () => {
    const playbook = createValidPlaybook();
    playbook.compensation.volumeMultiplierEnabled = false;
    const checklist = generateLaunchReadinessChecklist(playbook);
    
    const compItem = checklist.find(c => c.id === 'COMP_005');
    expect(compItem?.status).toBe('WARNING');
  });
});

describe('generateLaunchReadinessReport', () => {
  it('should report READY for valid playbook', () => {
    const playbook = createValidPlaybook();
    const report = generateLaunchReadinessReport(playbook);
    
    expect(report.overallStatus).toBe('READY');
    expect(report.failCount).toBe(0);
  });

  it('should report NOT_READY for invalid playbook', () => {
    const playbook = createInvalidPlaybook();
    const report = generateLaunchReadinessReport(playbook);
    
    expect(report.overallStatus).toBe('NOT_READY');
    expect(report.failCount).toBeGreaterThan(0);
  });

  it('should report READY_WITH_WARNINGS for warnings only', () => {
    const playbook = createValidPlaybook();
    playbook.compensation.volumeMultiplierEnabled = false;
    const report = generateLaunchReadinessReport(playbook);
    
    expect(report.overallStatus).toBe('READY_WITH_WARNINGS');
    expect(report.warningCount).toBeGreaterThan(0);
  });

  it('should include counts', () => {
    const playbook = createValidPlaybook();
    const report = generateLaunchReadinessReport(playbook);
    
    expect(report.passCount).toBe(ALL_GUARDRAILS.length);
    expect(report.failCount).toBe(0);
    expect(report.warningCount).toBe(0);
  });

  it('should include evaluatedAt timestamp', () => {
    const playbook = createValidPlaybook();
    const report = generateLaunchReadinessReport(playbook);
    
    expect(report.evaluatedAt).toBeDefined();
    expect(new Date(report.evaluatedAt).getTime()).not.toBeNaN();
  });
});

// ============================================
// 5. VERSIONING & PROSPECTIVE CHANGES
// ============================================

describe('createPlaybookVersion', () => {
  it('should increment version number', () => {
    const current = createValidPlaybook();
    const newVersion = createPlaybookVersion(
      current,
      { status: 'PENDING_ACTIVATION' },
      '2026-03-01',
      'admin-2'
    );
    
    expect(newVersion.version).toBe(2);
  });

  it('should update effective date', () => {
    const current = createValidPlaybook();
    const newVersion = createPlaybookVersion(
      current,
      {},
      '2026-03-01',
      'admin-2'
    );
    
    expect(newVersion.effectiveDate).toBe('2026-03-01');
  });

  it('should merge compensation changes', () => {
    const current = createValidPlaybook();
    const newVersion = createPlaybookVersion(
      current,
      { compensation: { defaultBaseRateCents: 3000 } as any },
      '2026-03-01',
      'admin-2'
    );
    
    expect(newVersion.compensation.defaultBaseRateCents).toBe(3000);
    expect(newVersion.compensation.minimumBaseRateCents).toBe(2000); // Unchanged
  });

  it('should throw error for past effective date', () => {
    const current = createValidPlaybook();
    
    expect(() => {
      createPlaybookVersion(current, {}, '2020-01-01', 'admin-2');
    }).toThrow(ProspectiveChangeError);
  });

  it('should update updatedBy and updatedAt', () => {
    const current = createValidPlaybook();
    const newVersion = createPlaybookVersion(
      current,
      {},
      '2026-03-01',
      'admin-2'
    );
    
    expect(newVersion.updatedBy).toBe('admin-2');
    expect(newVersion.updatedAt).toBeDefined();
  });
});

describe('isPlaybookEffective', () => {
  it('should return true for date after effective date', () => {
    const playbook = createValidPlaybook();
    playbook.effectiveDate = '2026-01-01';
    
    expect(isPlaybookEffective(playbook, '2026-01-15')).toBe(true);
  });

  it('should return false for date before effective date', () => {
    const playbook = createValidPlaybook();
    playbook.effectiveDate = '2026-02-01';
    
    expect(isPlaybookEffective(playbook, '2026-01-15')).toBe(false);
  });

  it('should return true for date equal to effective date', () => {
    const playbook = createValidPlaybook();
    playbook.effectiveDate = '2026-01-15';
    
    expect(isPlaybookEffective(playbook, '2026-01-15')).toBe(true);
  });

  it('should return false for date after expiration', () => {
    const playbook = createValidPlaybook();
    playbook.effectiveDate = '2026-01-01';
    playbook.expiresAt = '2026-01-31';
    
    expect(isPlaybookEffective(playbook, '2026-02-15')).toBe(false);
  });
});

describe('findEffectivePlaybook', () => {
  it('should find the correct playbook for a date', () => {
    const playbooks: MarketPlaybook[] = [
      { ...createValidPlaybook(), id: 'pb-1', version: 1, effectiveDate: '2026-01-01', status: 'ACTIVE' },
      { ...createValidPlaybook(), id: 'pb-2', version: 2, effectiveDate: '2026-02-01', status: 'ACTIVE' },
    ];
    
    const result = findEffectivePlaybook(playbooks, 'market-1', '2026-01-15');
    expect(result?.version).toBe(1);
  });

  it('should return higher version when multiple are effective', () => {
    const playbooks: MarketPlaybook[] = [
      { ...createValidPlaybook(), id: 'pb-1', version: 1, effectiveDate: '2026-01-01', status: 'ACTIVE' },
      { ...createValidPlaybook(), id: 'pb-2', version: 2, effectiveDate: '2026-01-15', status: 'ACTIVE' },
    ];
    
    const result = findEffectivePlaybook(playbooks, 'market-1', '2026-02-01');
    expect(result?.version).toBe(2);
  });

  it('should return null when no playbook is effective', () => {
    const playbooks: MarketPlaybook[] = [
      { ...createValidPlaybook(), id: 'pb-1', version: 1, effectiveDate: '2026-02-01', status: 'ACTIVE' },
    ];
    
    const result = findEffectivePlaybook(playbooks, 'market-1', '2026-01-15');
    expect(result).toBeNull();
  });

  it('should only consider ACTIVE playbooks', () => {
    const playbooks: MarketPlaybook[] = [
      { ...createValidPlaybook(), id: 'pb-1', version: 1, effectiveDate: '2026-01-01', status: 'DRAFT' },
      { ...createValidPlaybook(), id: 'pb-2', version: 2, effectiveDate: '2026-01-01', status: 'ACTIVE' },
    ];
    
    const result = findEffectivePlaybook(playbooks, 'market-1', '2026-01-15');
    expect(result?.version).toBe(2);
  });
});

// ============================================
// 6. FACTORY FUNCTIONS
// ============================================

describe('createDraftPlaybook', () => {
  it('should create a draft playbook with defaults', () => {
    const playbook = createDraftPlaybook('market-1', 'admin-1', '2026-02-01');
    
    expect(playbook.marketId).toBe('market-1');
    expect(playbook.status).toBe('DRAFT');
    expect(playbook.version).toBe(1);
    expect(playbook.effectiveDate).toBe('2026-02-01');
  });

  it('should have sensible compensation defaults', () => {
    const playbook = createDraftPlaybook('market-1', 'admin-1', '2026-02-01');
    
    expect(playbook.compensation.defaultBaseRateCents).toBe(2500);
    expect(playbook.compensation.volumeMultiplierEnabled).toBe(true);
  });

  it('should have required safety checks enabled by default', () => {
    const playbook = createDraftPlaybook('market-1', 'admin-1', '2026-02-01');
    
    expect(playbook.safety.backgroundCheckRequired).toBe(true);
    expect(playbook.safety.drivingRecordCheckRequired).toBe(true);
  });
});

describe('createReadyPlaybook', () => {
  it('should create a playbook that passes all required guardrails', () => {
    const playbook = createReadyPlaybook('market-1', 'admin-1', '2026-02-01', 'sp-v1');
    const result = canActivateMarket(playbook);
    
    expect(result).toBe(true);
  });

  it('should have all operations configured', () => {
    const playbook = createReadyPlaybook('market-1', 'admin-1', '2026-02-01', 'sp-v1');
    
    expect(playbook.operations.serviceAreaDefined).toBe(true);
    expect(playbook.operations.zonesConfigured).toBeGreaterThan(0);
    expect(playbook.operations.dispatchRulesSet).toBe(true);
  });

  it('should have safety policy configured', () => {
    const playbook = createReadyPlaybook('market-1', 'admin-1', '2026-02-01', 'sp-v1');
    
    expect(playbook.safety.safetyPolicyVersionId).toBe('sp-v1');
  });
});

// ============================================
// 7. ERROR CLASS
// ============================================

describe('ProspectiveChangeError', () => {
  it('should have correct name', () => {
    const error = new ProspectiveChangeError('test message');
    expect(error.name).toBe('ProspectiveChangeError');
  });

  it('should have correct message', () => {
    const error = new ProspectiveChangeError('test message');
    expect(error.message).toBe('test message');
  });
});
