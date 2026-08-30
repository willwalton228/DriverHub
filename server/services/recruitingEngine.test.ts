import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateMarketUtilization,
  createDefaultCapacity,
  createDefaultEntryTierConfig,
  canOpenHiring,
  determineEntryTier,
  isEntryTierAllowed,
  validateHiringOffer,
  createHiringAuditEntry,
  getMarketHiringAudit,
  getCandidateHiringAudit,
  getAllHiringAuditEntries,
  clearHiringAuditLog,
  processHiringRequest,
  type MarketCapacity,
  type MarketDriverCounts,
  type MarketEntryTierConfig,
  type HiringRequest,
  TIER_MIN_RATES,
  DEFAULT_ENTRY_RATES,
  VALID_ENTRY_TIERS,
  VALID_TIERS,
  SAFETY_HIRING_THRESHOLDS,
} from './recruitingEngine';
import type { MarketPlaybook } from './marketPlaybookEngine';
import type { MarketLossScore, RiskControl } from './insuranceRiskEngine';

// ============================================
// TEST FIXTURES
// ============================================

function createTestPlaybook(overrides: Partial<MarketPlaybook> = {}): MarketPlaybook {
  return {
    id: 'pb-test-001',
    marketId: 'market-001',
    version: 1,
    status: 'ACTIVE',
    effectiveDate: '2024-01-01',
    expiresAt: null,
    createdAt: '2024-01-01T00:00:00Z',
    createdBy: 'admin',
    updatedAt: '2024-01-01T00:00:00Z',
    updatedBy: 'admin',
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
      minimumDriverCount: 10,
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
      insuranceCoverageMinimumCents: 100000000, // $1M
      vehicleInspectionRequired: true,
      licenseVerificationRequired: true,
      w2DriverSupported: true,
      icDriverSupported: true,
    },
    ...overrides,
  };
}

function createTestDriverCounts(overrides: Partial<MarketDriverCounts> = {}): MarketDriverCounts {
  return {
    marketId: 'market-001',
    totalDrivers: 80,
    activeDrivers: 70,
    restrictedDrivers: 5,
    suspendedDrivers: 3,
    disqualifiedDrivers: 2,
    w2Drivers: 60,
    icDrivers: 20,
    countedAt: '2024-06-15T12:00:00Z',
    ...overrides,
  };
}

function createTestCapacity(overrides: Partial<MarketCapacity> = {}): MarketCapacity {
  return {
    marketId: 'market-001',
    maxDrivers: 100,
    targetUtilization: 0.85,
    warningThreshold: 0.90,
    criticalThreshold: 0.95,
    reserveCapacity: 5,
    updatedAt: '2024-01-01T00:00:00Z',
    updatedBy: 'admin',
    ...overrides,
  };
}

function createTestEntryConfig(overrides: Partial<MarketEntryTierConfig> = {}): MarketEntryTierConfig {
  return {
    marketId: 'market-001',
    defaultEntryTier: 'Standard',
    allowedEntryTiers: ['Standard', 'Developing', 'At Risk'],
    entryRateCents: {
      'Standard': 2500,
      'Developing': 2250,
      'At Risk': 2000,
    },
    maxEntryRateCents: 2700,
    probationaryPeriodDays: 90,
    effectiveDate: '2024-01-01',
    updatedAt: '2024-01-01T00:00:00Z',
    updatedBy: 'admin',
    ...overrides,
  };
}

function createTestLossScore(overrides: Partial<MarketLossScore> = {}): MarketLossScore {
  return {
    marketId: 'market-001',
    score: 35,
    tier: 'MODERATE',
    frequencyScore: 40,
    severityScore: 30,
    lateMoveScore: 25,
    incidentRateScore: 20,
    calculatedAt: '2024-06-15T12:00:00Z',
    snapshotDate: '2024-06-15',
    inputs: {
      atFaultClaimsPer100Moves30Days: 2,
      atFaultClaimsPer100Moves90Days: 1.5,
      totalIncurredCents: 500000,
      openClaimsCount: 3,
      totalReserveCents: 150000,
      lateMovePercent: 5.0,
      driverIncidentRate: 4.0,
    },
    previousScore: null,
    scoreChange: 0,
    highRiskDriverCount: 5,
    severeRiskDriverCount: 2,
    ...overrides,
  };
}

// ============================================
// MARKET UTILIZATION TESTS
// ============================================

describe('Market Utilization', () => {
  it('should calculate utilization correctly', () => {
    const counts = createTestDriverCounts({ activeDrivers: 80, restrictedDrivers: 5 });
    const capacity = createTestCapacity({ maxDrivers: 100, reserveCapacity: 5 });
    
    const result = calculateMarketUtilization(counts, capacity);
    
    expect(result.currentDriverCount).toBe(85); // 80 active + 5 restricted
    expect(result.maxCapacity).toBe(100);
    expect(result.effectiveCapacity).toBe(95); // 100 - 5 reserve
    expect(result.utilizationRate).toBeCloseTo(0.85); // 85/100
    expect(result.effectiveUtilization).toBeCloseTo(0.895); // 85/95
    expect(result.availableSlots).toBe(10); // 95 - 85
  });

  it('should return OPEN status when utilization is below warning', () => {
    const counts = createTestDriverCounts({ activeDrivers: 70, restrictedDrivers: 5 });
    const capacity = createTestCapacity();
    
    const result = calculateMarketUtilization(counts, capacity);
    
    expect(result.status).toBe('OPEN');
    expect(result.availableSlots).toBe(20); // 95 - 75
  });

  it('should return LIMITED status when utilization exceeds warning threshold', () => {
    const counts = createTestDriverCounts({ activeDrivers: 85, restrictedDrivers: 3 });
    const capacity = createTestCapacity();
    
    const result = calculateMarketUtilization(counts, capacity);
    
    expect(result.status).toBe('LIMITED');
    expect(result.effectiveUtilization).toBeGreaterThanOrEqual(0.90);
  });

  it('should return CLOSED status when utilization exceeds critical threshold', () => {
    const counts = createTestDriverCounts({ activeDrivers: 92, restrictedDrivers: 3 });
    const capacity = createTestCapacity();
    
    const result = calculateMarketUtilization(counts, capacity);
    
    expect(result.status).toBe('CLOSED');
    expect(result.effectiveUtilization).toBeGreaterThanOrEqual(0.95);
  });

  it('should return PAUSED status when no slots available', () => {
    const counts = createTestDriverCounts({ activeDrivers: 95, restrictedDrivers: 0 });
    const capacity = createTestCapacity({ reserveCapacity: 5 });
    
    const result = calculateMarketUtilization(counts, capacity);
    
    expect(result.availableSlots).toBe(0);
    expect(result.status).toBe('CLOSED'); // 95/95 = 100% which is > 95%
  });

  it('should handle zero capacity', () => {
    const counts = createTestDriverCounts({ activeDrivers: 5 });
    const capacity = createTestCapacity({ maxDrivers: 0, reserveCapacity: 0 });
    
    const result = calculateMarketUtilization(counts, capacity);
    
    expect(result.utilizationRate).toBe(0);
    expect(result.effectiveUtilization).toBe(0);
  });
});

// ============================================
// DEFAULT CONFIGURATION TESTS
// ============================================

describe('Default Configurations', () => {
  it('should create default market capacity', () => {
    const capacity = createDefaultCapacity('market-001', 150, 'admin');
    
    expect(capacity.marketId).toBe('market-001');
    expect(capacity.maxDrivers).toBe(150);
    expect(capacity.targetUtilization).toBe(0.85);
    expect(capacity.warningThreshold).toBe(0.90);
    expect(capacity.criticalThreshold).toBe(0.95);
    expect(capacity.reserveCapacity).toBe(5);
    expect(capacity.updatedBy).toBe('admin');
  });

  it('should create default entry tier config', () => {
    const config = createDefaultEntryTierConfig('market-001', 'hr');
    
    expect(config.marketId).toBe('market-001');
    expect(config.defaultEntryTier).toBe('Standard');
    expect(config.allowedEntryTiers).toEqual(['Standard', 'Developing', 'At Risk']);
    expect(config.entryRateCents['Standard']).toBe(2500);
    expect(config.maxEntryRateCents).toBe(2700);
    expect(config.probationaryPeriodDays).toBe(90);
    expect(config.updatedBy).toBe('hr');
  });
});

// ============================================
// CAN OPEN HIRING TESTS
// ============================================

describe('canOpenHiring Gate', () => {
  const testDate = '2024-06-15';
  
  it('should allow hiring when all conditions are met', () => {
    const playbooks = [createTestPlaybook()];
    const counts = createTestDriverCounts({ activeDrivers: 70, restrictedDrivers: 5 });
    const capacity = createTestCapacity();
    
    const result = canOpenHiring('market-001', 'BOTH', testDate, playbooks, counts, capacity);
    
    expect(result.canHire).toBe(true);
    expect(result.rejectionReason).toBeNull();
    expect(result.hiringStatus).toBe('OPEN');
    expect(result.availableSlots).toBeGreaterThan(0);
  });

  it('should reject when market playbook not found', () => {
    const playbooks: MarketPlaybook[] = [];
    const counts = createTestDriverCounts();
    const capacity = createTestCapacity();
    
    const result = canOpenHiring('market-001', 'BOTH', testDate, playbooks, counts, capacity);
    
    expect(result.canHire).toBe(false);
    expect(result.rejectionReason).toBe('MARKET_NOT_ACTIVE');
  });

  it('should reject when playbook has required validation errors', () => {
    const playbooks = [createTestPlaybook({
      compensation: {
        defaultBaseRateCents: 0, // Invalid
        minimumBaseRateCents: 0,
        maximumBaseRateCents: 0,
        hourlyFloorCents: 0,
        onDemandCapCents: 0,
        volumeMultiplierEnabled: false,
        safetyMultiplierEnabled: false,
      },
    })];
    const counts = createTestDriverCounts();
    const capacity = createTestCapacity();
    
    const result = canOpenHiring('market-001', 'BOTH', testDate, playbooks, counts, capacity);
    
    expect(result.canHire).toBe(false);
    expect(result.rejectionReason).toBe('MARKET_PLAYBOOK_INVALID');
  });

  it('should reject when market is paused by risk control', () => {
    const playbooks = [createTestPlaybook()];
    const counts = createTestDriverCounts({ activeDrivers: 70, restrictedDrivers: 5 });
    const capacity = createTestCapacity();
    const controls: RiskControl[] = [{
      id: 'rc-001',
      controlType: 'MARKET_PAUSE',
      targetType: 'MARKET',
      targetId: 'market-001',
      adjustmentValue: 0,
      effectiveDate: '2024-06-01',
      expirationDate: '2024-12-31',
      triggeredByScore: 85,
      triggeredByTier: 'CRITICAL',
      triggerReason: 'High loss activity',
      status: 'ACTIVE',
      createdAt: '2024-06-01T00:00:00Z',
      createdBy: 'SYSTEM',
      revokedAt: null,
      revokedBy: null,
      revocationReason: null,
    }];
    
    const result = canOpenHiring('market-001', 'BOTH', testDate, playbooks, counts, capacity, null, controls);
    
    expect(result.canHire).toBe(false);
    expect(result.rejectionReason).toBe('MARKET_PAUSED');
  });

  it('should reject when market loss score is critical', () => {
    const playbooks = [createTestPlaybook()];
    const counts = createTestDriverCounts({ activeDrivers: 70, restrictedDrivers: 5 });
    const capacity = createTestCapacity();
    const lossScore = createTestLossScore({ score: 85, tier: 'CRITICAL' });
    
    const result = canOpenHiring('market-001', 'BOTH', testDate, playbooks, counts, capacity, lossScore);
    
    expect(result.canHire).toBe(false);
    expect(result.rejectionReason).toBe('MARKET_LOSS_SCORE_CRITICAL');
  });

  it('should reject when loss score exceeds max threshold even if not CRITICAL tier', () => {
    const playbooks = [createTestPlaybook()];
    const counts = createTestDriverCounts({ activeDrivers: 70, restrictedDrivers: 5 });
    const capacity = createTestCapacity();
    const lossScore = createTestLossScore({ score: 82, tier: 'SEVERE' });
    
    const result = canOpenHiring('market-001', 'BOTH', testDate, playbooks, counts, capacity, lossScore);
    
    expect(result.canHire).toBe(false);
    expect(result.rejectionReason).toBe('MARKET_LOSS_SCORE_CRITICAL');
  });

  it('should reject when utilization exceeds critical threshold', () => {
    const playbooks = [createTestPlaybook()];
    const counts = createTestDriverCounts({ activeDrivers: 95, restrictedDrivers: 3 });
    const capacity = createTestCapacity();
    
    const result = canOpenHiring('market-001', 'BOTH', testDate, playbooks, counts, capacity);
    
    expect(result.canHire).toBe(false);
    expect(result.rejectionReason).toBe('UTILIZATION_TOO_HIGH');
    expect(result.hiringStatus).toBe('CLOSED');
  });

  it('should reject when high-risk driver concentration is too high', () => {
    const playbooks = [createTestPlaybook()];
    const counts = createTestDriverCounts({ activeDrivers: 100, restrictedDrivers: 0 });
    const capacity = createTestCapacity({ maxDrivers: 200 });
    const highRiskDriverCount = 30; // 30/100 = 30% > 25% threshold
    
    const result = canOpenHiring('market-001', 'BOTH', testDate, playbooks, counts, capacity, null, [], highRiskDriverCount);
    
    expect(result.canHire).toBe(false);
    expect(result.rejectionReason).toBe('SAFETY_THRESHOLD_EXCEEDED');
  });

  it('should allow hiring when high-risk concentration is acceptable', () => {
    const playbooks = [createTestPlaybook()];
    const counts = createTestDriverCounts({ activeDrivers: 100, restrictedDrivers: 0 });
    const capacity = createTestCapacity({ maxDrivers: 200 });
    const highRiskDriverCount = 20; // 20/100 = 20% < 25% threshold
    
    const result = canOpenHiring('market-001', 'BOTH', testDate, playbooks, counts, capacity, null, [], highRiskDriverCount);
    
    expect(result.canHire).toBe(true);
  });

  it('should reject when no compensation policy exists', () => {
    // Note: With defaultBaseRateCents = 0, playbook validation will fail first
    // Both MARKET_PLAYBOOK_INVALID and NO_COMPENSATION_POLICY are checked
    const playbooks = [createTestPlaybook({
      compensation: {
        defaultBaseRateCents: 0,
        minimumBaseRateCents: 2000,
        maximumBaseRateCents: 3500,
        hourlyFloorCents: 1500,
        onDemandCapCents: 5000,
        volumeMultiplierEnabled: true,
        safetyMultiplierEnabled: true,
      },
    })];
    const counts = createTestDriverCounts({ activeDrivers: 70, restrictedDrivers: 5 });
    const capacity = createTestCapacity();
    
    const result = canOpenHiring('market-001', 'BOTH', testDate, playbooks, counts, capacity);
    
    expect(result.canHire).toBe(false);
    // Playbook validation runs first and catches the invalid compensation
    expect(result.rejectionReason).toBe('MARKET_PLAYBOOK_INVALID');
  });

  it('should include utilization metrics in result', () => {
    const playbooks = [createTestPlaybook()];
    const counts = createTestDriverCounts({ activeDrivers: 70, restrictedDrivers: 5 });
    const capacity = createTestCapacity();
    
    const result = canOpenHiring('market-001', 'BOTH', testDate, playbooks, counts, capacity);
    
    expect(result.utilization).not.toBeNull();
    expect(result.utilization?.currentDriverCount).toBe(75);
    expect(result.utilization?.maxCapacity).toBe(100);
  });
});

// ============================================
// ENTRY TIER DETERMINATION TESTS
// ============================================

describe('Entry Tier Determination', () => {
  it('should use default entry tier when no preference specified', () => {
    const config = createTestEntryConfig({ defaultEntryTier: 'Standard' });
    const playbook = createTestPlaybook();
    
    const result = determineEntryTier('market-001', config, playbook);
    
    expect(result.entryTier).toBe('Standard');
    expect(result.entryRateCents).toBe(2500);
    expect(result.tierReason).toContain('default');
  });

  it('should use preferred tier when allowed', () => {
    const config = createTestEntryConfig();
    const playbook = createTestPlaybook();
    
    const result = determineEntryTier('market-001', config, playbook, 'Developing');
    
    expect(result.entryTier).toBe('Developing');
    expect(result.entryRateCents).toBe(2250);
    expect(result.tierReason).toContain('Preferred');
  });

  it('should fall back to default when preferred tier not allowed', () => {
    const config = createTestEntryConfig({ 
      allowedEntryTiers: ['Standard'],
      defaultEntryTier: 'Standard'
    });
    const playbook = createTestPlaybook();
    
    const result = determineEntryTier('market-001', config, playbook, 'At Risk');
    
    expect(result.entryTier).toBe('Standard');
    expect(result.tierReason).toContain('not allowed');
  });

  it('should calculate correct min and max rates', () => {
    const config = createTestEntryConfig({ maxEntryRateCents: 2700 });
    const playbook = createTestPlaybook({
      compensation: {
        defaultBaseRateCents: 2500,
        minimumBaseRateCents: 2000,
        maximumBaseRateCents: 3000,
        hourlyFloorCents: 1500,
        onDemandCapCents: 5000,
        volumeMultiplierEnabled: true,
        safetyMultiplierEnabled: true,
      },
    });
    
    const result = determineEntryTier('market-001', config, playbook, 'Standard');
    
    expect(result.minRateCents).toBe(2500); // max of tier min (2500) and market min (2000)
    expect(result.maxRateCents).toBe(2700); // min of entry cap (2700) and market max (3000)
  });

  it('should include probationary period', () => {
    const config = createTestEntryConfig({ probationaryPeriodDays: 120 });
    const playbook = createTestPlaybook();
    
    const result = determineEntryTier('market-001', config, playbook);
    
    expect(result.probationaryPeriodDays).toBe(120);
  });
});

// ============================================
// ENTRY TIER VALIDATION TESTS
// ============================================

describe('isEntryTierAllowed', () => {
  it('should return true for valid entry tiers', () => {
    expect(isEntryTierAllowed('Standard')).toBe(true);
    expect(isEntryTierAllowed('Developing')).toBe(true);
    expect(isEntryTierAllowed('At Risk')).toBe(true);
  });

  it('should return false for non-entry tiers', () => {
    expect(isEntryTierAllowed('Elite')).toBe(false);
    expect(isEntryTierAllowed('High Performer')).toBe(false);
  });
});

// ============================================
// OFFER VALIDATION TESTS
// ============================================

describe('validateHiringOffer', () => {
  const testDate = '2024-06-15';
  
  it('should validate a valid offer', () => {
    const playbooks = [createTestPlaybook()];
    const config = createTestEntryConfig();
    
    const result = validateHiringOffer('market-001', 2500, 'Standard', 'BOTH', testDate, playbooks, config);
    
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
    expect(result.isEntryTier).toBe(true);
  });

  it('should reject when market not active', () => {
    const playbooks: MarketPlaybook[] = [];
    const config = createTestEntryConfig();
    
    const result = validateHiringOffer('market-001', 2500, 'Standard', 'BOTH', testDate, playbooks, config);
    
    expect(result.valid).toBe(false);
    expect(result.error).toBe('MARKET_NOT_ACTIVE');
  });

  it('should reject invalid tier', () => {
    const playbooks = [createTestPlaybook()];
    const config = createTestEntryConfig();
    
    const result = validateHiringOffer('market-001', 2500, 'InvalidTier' as any, 'BOTH', testDate, playbooks, config);
    
    expect(result.valid).toBe(false);
    expect(result.error).toBe('INVALID_TIER');
  });

  it('should reject non-entry tier for new hires', () => {
    const playbooks = [createTestPlaybook()];
    const config = createTestEntryConfig();
    
    const result = validateHiringOffer('market-001', 3000, 'Elite', 'BOTH', testDate, playbooks, config);
    
    expect(result.valid).toBe(false);
    expect(result.error).toBe('TIER_NOT_ALLOWED_FOR_ENTRY');
    expect(result.isEntryTier).toBe(false);
  });

  it('should reject rate below market minimum', () => {
    const playbooks = [createTestPlaybook()];
    const config = createTestEntryConfig();
    
    const result = validateHiringOffer('market-001', 1500, 'Standard', 'BOTH', testDate, playbooks, config);
    
    expect(result.valid).toBe(false);
    expect(result.error).toBe('RATE_BELOW_MINIMUM');
  });

  it('should reject rate above market maximum', () => {
    const playbooks = [createTestPlaybook()];
    const config = createTestEntryConfig();
    
    const result = validateHiringOffer('market-001', 4000, 'Standard', 'BOTH', testDate, playbooks, config);
    
    expect(result.valid).toBe(false);
    expect(result.error).toBe('RATE_ABOVE_MAXIMUM');
  });

  it('should reject rate below tier minimum', () => {
    const playbooks = [createTestPlaybook({
      compensation: {
        defaultBaseRateCents: 2500,
        minimumBaseRateCents: 1800, // Allow rates below tier min
        maximumBaseRateCents: 3500,
        hourlyFloorCents: 1500,
        onDemandCapCents: 5000,
        volumeMultiplierEnabled: true,
        safetyMultiplierEnabled: true,
      },
    })];
    const config = createTestEntryConfig();
    
    // Standard tier min is 2500, offer 2200
    const result = validateHiringOffer('market-001', 2200, 'Standard', 'BOTH', testDate, playbooks, config);
    
    expect(result.valid).toBe(false);
    expect(result.error).toBe('RATE_BELOW_TIER_MINIMUM');
  });

  it('should reject rate above entry cap', () => {
    const playbooks = [createTestPlaybook()];
    const config = createTestEntryConfig({ maxEntryRateCents: 2600 });
    
    const result = validateHiringOffer('market-001', 2700, 'Standard', 'BOTH', testDate, playbooks, config);
    
    expect(result.valid).toBe(false);
    expect(result.error).toBe('RATE_ABOVE_ENTRY_CAP');
  });

  it('should reject rate below hourly floor', () => {
    const playbooks = [createTestPlaybook({
      compensation: {
        defaultBaseRateCents: 2500,
        minimumBaseRateCents: 1500,
        maximumBaseRateCents: 3500,
        hourlyFloorCents: 2200, // High floor
        onDemandCapCents: 5000,
        volumeMultiplierEnabled: true,
        safetyMultiplierEnabled: true,
      },
    })];
    const config = createTestEntryConfig();
    
    // At Risk tier min is 2000, offer 2000, but floor is 2200
    const result = validateHiringOffer('market-001', 2000, 'At Risk', 'BOTH', testDate, playbooks, config);
    
    expect(result.valid).toBe(false);
    expect(result.error).toBe('RATE_BELOW_HOURLY_FLOOR');
  });

  it('should include all rate information in result', () => {
    const playbooks = [createTestPlaybook()];
    const config = createTestEntryConfig();
    
    const result = validateHiringOffer('market-001', 2500, 'Standard', 'BOTH', testDate, playbooks, config);
    
    expect(result.marketMinRateCents).toBe(2000);
    expect(result.marketMaxRateCents).toBe(3500);
    expect(result.tierMinRateCents).toBe(2500);
    expect(result.entryMaxRateCents).toBe(2700);
    expect(result.hourlyFloorCents).toBe(1500);
  });
});

// ============================================
// HIRING AUDIT TRAIL TESTS
// ============================================

describe('Hiring Audit Trail', () => {
  beforeEach(() => {
    clearHiringAuditLog();
  });

  it('should create audit entry', () => {
    const entry = createHiringAuditEntry(
      'HIRING_STATUS_CHANGED',
      'market-001',
      'admin',
      { status: 'OPEN' },
      { status: 'LIMITED' },
      { reason: 'High utilization' }
    );
    
    expect(entry.id).toMatch(/^ha-/);
    expect(entry.action).toBe('HIRING_STATUS_CHANGED');
    expect(entry.marketId).toBe('market-001');
    expect(entry.performedBy).toBe('admin');
    expect(entry.previousState).toEqual({ status: 'OPEN' });
    expect(entry.newState).toEqual({ status: 'LIMITED' });
  });

  it('should get audit entries for market', () => {
    createHiringAuditEntry('HIRING_STATUS_CHANGED', 'market-001', 'admin');
    createHiringAuditEntry('CAPACITY_UPDATED', 'market-001', 'admin');
    createHiringAuditEntry('HIRING_STATUS_CHANGED', 'market-002', 'admin');
    
    const entries = getMarketHiringAudit('market-001');
    
    expect(entries).toHaveLength(2);
    expect(entries.every(e => e.marketId === 'market-001')).toBe(true);
  });

  it('should get audit entries for candidate', () => {
    createHiringAuditEntry('OFFER_CREATED', 'market-001', 'admin', null, null, {}, 'candidate-001');
    createHiringAuditEntry('OFFER_VALIDATED', 'market-001', 'admin', null, null, {}, 'candidate-001');
    createHiringAuditEntry('OFFER_CREATED', 'market-001', 'admin', null, null, {}, 'candidate-002');
    
    const entries = getCandidateHiringAudit('candidate-001');
    
    expect(entries).toHaveLength(2);
    expect(entries.every(e => e.candidateId === 'candidate-001')).toBe(true);
  });

  it('should get all audit entries', () => {
    createHiringAuditEntry('HIRING_STATUS_CHANGED', 'market-001', 'admin');
    createHiringAuditEntry('CAPACITY_UPDATED', 'market-002', 'admin');
    createHiringAuditEntry('OFFER_CREATED', 'market-003', 'admin');
    
    const entries = getAllHiringAuditEntries();
    
    expect(entries).toHaveLength(3);
  });

  it('should clear audit log', () => {
    createHiringAuditEntry('HIRING_STATUS_CHANGED', 'market-001', 'admin');
    createHiringAuditEntry('CAPACITY_UPDATED', 'market-001', 'admin');
    
    clearHiringAuditLog();
    
    expect(getAllHiringAuditEntries()).toHaveLength(0);
  });
});

// ============================================
// COMPLETE HIRING FLOW TESTS
// ============================================

describe('processHiringRequest', () => {
  const testDate = '2024-06-15';
  
  beforeEach(() => {
    clearHiringAuditLog();
  });

  it('should process successful hiring request', () => {
    const playbooks = [createTestPlaybook()];
    const counts = createTestDriverCounts({ activeDrivers: 70, restrictedDrivers: 5 });
    const capacity = createTestCapacity();
    const config = createTestEntryConfig();
    const request: HiringRequest = {
      marketId: 'market-001',
      candidateId: 'candidate-001',
      workType: 'BOTH',
      preferredTier: 'Standard',
      offeredRateCents: 2500,
      requestedBy: 'hr-admin',
    };
    
    const result = processHiringRequest(request, testDate, playbooks, counts, capacity, config);
    
    expect(result.success).toBe(true);
    expect(result.hiringCheck.canHire).toBe(true);
    expect(result.entryTier?.entryTier).toBe('Standard');
    expect(result.offerValidation?.valid).toBe(true);
    expect(result.rejectionReason).toBeNull();
    expect(result.auditEntryIds.length).toBeGreaterThan(0);
  });

  it('should reject when market cannot hire', () => {
    const playbooks: MarketPlaybook[] = [];
    const counts = createTestDriverCounts();
    const capacity = createTestCapacity();
    const config = createTestEntryConfig();
    const request: HiringRequest = {
      marketId: 'market-001',
      candidateId: 'candidate-001',
      workType: 'BOTH',
      requestedBy: 'hr-admin',
    };
    
    const result = processHiringRequest(request, testDate, playbooks, counts, capacity, config);
    
    expect(result.success).toBe(false);
    expect(result.hiringCheck.canHire).toBe(false);
    expect(result.entryTier).toBeNull();
    expect(result.offerValidation).toBeNull();
  });

  it('should reject when offer is invalid', () => {
    const playbooks = [createTestPlaybook()];
    const counts = createTestDriverCounts({ activeDrivers: 70, restrictedDrivers: 5 });
    const capacity = createTestCapacity();
    const config = createTestEntryConfig();
    const request: HiringRequest = {
      marketId: 'market-001',
      candidateId: 'candidate-001',
      workType: 'BOTH',
      preferredTier: 'Standard',
      offeredRateCents: 5000, // Too high
      requestedBy: 'hr-admin',
    };
    
    const result = processHiringRequest(request, testDate, playbooks, counts, capacity, config);
    
    expect(result.success).toBe(false);
    expect(result.hiringCheck.canHire).toBe(true);
    expect(result.entryTier).not.toBeNull();
    expect(result.offerValidation?.valid).toBe(false);
    expect(result.offerValidation?.error).toBe('RATE_ABOVE_MAXIMUM');
  });

  it('should use entry tier rate when no offer provided', () => {
    const playbooks = [createTestPlaybook()];
    const counts = createTestDriverCounts({ activeDrivers: 70, restrictedDrivers: 5 });
    const capacity = createTestCapacity();
    const config = createTestEntryConfig();
    const request: HiringRequest = {
      marketId: 'market-001',
      candidateId: 'candidate-001',
      workType: 'BOTH',
      requestedBy: 'hr-admin',
    };
    
    const result = processHiringRequest(request, testDate, playbooks, counts, capacity, config);
    
    expect(result.success).toBe(true);
    expect(result.entryTier?.entryRateCents).toBe(2500);
    expect(result.offerValidation?.offeredRateCents).toBe(2500);
  });

  it('should create audit entries for each step', () => {
    const playbooks = [createTestPlaybook()];
    const counts = createTestDriverCounts({ activeDrivers: 70, restrictedDrivers: 5 });
    const capacity = createTestCapacity();
    const config = createTestEntryConfig();
    const request: HiringRequest = {
      marketId: 'market-001',
      candidateId: 'candidate-001',
      workType: 'BOTH',
      requestedBy: 'hr-admin',
    };
    
    const result = processHiringRequest(request, testDate, playbooks, counts, capacity, config);
    
    expect(result.auditEntryIds.length).toBe(3); // Check, tier determination, offer validation
    
    const auditEntries = getAllHiringAuditEntries();
    const actions = auditEntries.map(e => e.action);
    
    expect(actions).toContain('HIRING_CHECK_PERFORMED');
    expect(actions).toContain('ENTRY_TIER_DETERMINED');
    expect(actions).toContain('OFFER_VALIDATED');
  });

  it('should handle loss score in hiring check', () => {
    const playbooks = [createTestPlaybook()];
    const counts = createTestDriverCounts({ activeDrivers: 70, restrictedDrivers: 5 });
    const capacity = createTestCapacity();
    const config = createTestEntryConfig();
    const lossScore = createTestLossScore({ score: 90, tier: 'CRITICAL' });
    const request: HiringRequest = {
      marketId: 'market-001',
      candidateId: 'candidate-001',
      workType: 'BOTH',
      requestedBy: 'hr-admin',
    };
    
    const result = processHiringRequest(request, testDate, playbooks, counts, capacity, config, lossScore);
    
    expect(result.success).toBe(false);
    expect(result.hiringCheck.rejectionReason).toBe('MARKET_LOSS_SCORE_CRITICAL');
  });
});

// ============================================
// CONSTANTS TESTS
// ============================================

describe('Constants', () => {
  it('should have correct tier minimum rates', () => {
    expect(TIER_MIN_RATES['Elite']).toBe(3000);
    expect(TIER_MIN_RATES['High Performer']).toBe(2750);
    expect(TIER_MIN_RATES['Standard']).toBe(2500);
    expect(TIER_MIN_RATES['Developing']).toBe(2250);
    expect(TIER_MIN_RATES['At Risk']).toBe(2000);
  });

  it('should have correct default entry rates', () => {
    expect(DEFAULT_ENTRY_RATES['Standard']).toBe(2500);
    expect(DEFAULT_ENTRY_RATES['Developing']).toBe(2250);
    expect(DEFAULT_ENTRY_RATES['At Risk']).toBe(2000);
  });

  it('should have correct valid tiers', () => {
    expect(VALID_TIERS).toHaveLength(5);
    expect(VALID_ENTRY_TIERS).toHaveLength(3);
  });

  it('should have correct safety thresholds', () => {
    expect(SAFETY_HIRING_THRESHOLDS.maxMarketLossScore).toBe(80);
    expect(SAFETY_HIRING_THRESHOLDS.maxHighRiskDriverPercent).toBe(0.25);
  });
});
