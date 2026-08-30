/**
 * Unit Tests for Automation, Scheduling & Enforcement Hooks Engine (INCREMENT 10)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  canAssignWork,
  canOpenHiring,
  validateOffer,
  isValidTransition,
  transitionPayPeriod,
  TransitionError,
  getAutomaticNextState,
  createAuditEntry,
  getAuditEntries,
  clearAuditLog,
  createJobExecution,
  completeJobExecution,
  processBatch,
  evaluateDailyEligibility,
  checkDocumentExpirations,
  registerEventHook,
  clearEventHooks,
  auditAndTrigger,
  DEFAULT_SCHEDULED_JOBS,
  VALID_TRANSITIONS,
  type PayPeriodLifecycle,
  type DriverMarketQualification,
  type WorkType,
  type MarketCapacityConfig,
  type DriverTier,
} from './automationEngine';
import {
  type MarketLossScore,
  type RiskControl,
} from './insuranceRiskEngine';
import {
  type SafetyEvent,
} from './safetyEnforcementEngine';
import {
  createReadyPlaybook,
  type MarketPlaybook,
} from './marketPlaybookEngine';

// ============================================
// TEST DATA
// ============================================

const createTestSafetyEvents = (driverId: string, atFaultCount: number = 0): SafetyEvent[] => {
  const events: SafetyEvent[] = [];
  for (let i = 0; i < atFaultCount; i++) {
    events.push({
      id: `event-${i}`,
      driverId,
      eventType: 'AT_FAULT_CLAIM',
      severity: 'MODERATE',
      eventDate: '2026-01-15',
      description: `Test claim ${i + 1}`,
      atFault: true,
      claimAmountCents: 50000,
      recordedAt: '2026-01-15T00:00:00Z',
      recordedBy: 'SYSTEM',
    });
  }
  return events;
};

const createTestPlaybooks = (marketId: string, status: 'ACTIVE' | 'DRAFT' = 'ACTIVE'): MarketPlaybook[] => {
  const playbook = createReadyPlaybook(marketId, 'admin-1', '2026-01-01', 'sp-v1');
  return [{ ...playbook, status }];
};

const createTestQualification = (qualified: boolean = true): DriverMarketQualification => ({
  driverId: 'driver-1',
  marketId: 'market-1',
  isQualified: qualified,
  backgroundCheckComplete: true,
  drivingRecordCheckComplete: true,
  trainingComplete: true,
  documentsValid: true,
  documentExpirations: [],
});

// ============================================
// 1. SCHEDULED JOB DEFINITIONS
// ============================================

describe('DEFAULT_SCHEDULED_JOBS', () => {
  it('should define at least 4 scheduled jobs', () => {
    expect(DEFAULT_SCHEDULED_JOBS.length).toBeGreaterThanOrEqual(4);
  });

  it('should include weekly pay period close job', () => {
    const job = DEFAULT_SCHEDULED_JOBS.find(j => j.jobType === 'WEEKLY_PAY_PERIOD_CLOSE');
    expect(job).toBeDefined();
    expect(job?.enabled).toBe(true);
  });

  it('should include daily eligibility check job', () => {
    const job = DEFAULT_SCHEDULED_JOBS.find(j => j.jobType === 'DAILY_ELIGIBILITY_CHECK');
    expect(job).toBeDefined();
    expect(job?.cronExpression).toBeDefined();
  });
});

// ============================================
// 2. ASSIGNMENT GATE - canAssignWork
// ============================================

describe('canAssignWork', () => {
  it('should allow assignment for eligible driver in active market', () => {
    const result = canAssignWork(
      'driver-1',
      'market-1',
      '2026-01-20',
      [], // No safety events
      createTestPlaybooks('market-1', 'ACTIVE')
    );
    
    expect(result.canAssign).toBe(true);
    expect(result.rejectionReason).toBeNull();
  });

  it('should reject suspended driver', () => {
    const events = createTestSafetyEvents('driver-1', 2); // 2 claims = SUSPENDED
    
    const result = canAssignWork(
      'driver-1',
      'market-1',
      '2026-01-20',
      events,
      createTestPlaybooks('market-1', 'ACTIVE')
    );
    
    expect(result.canAssign).toBe(false);
    expect(result.rejectionReason).toBe('DRIVER_SUSPENDED');
  });

  it('should reject when no active market playbook', () => {
    const result = canAssignWork(
      'driver-1',
      'market-1',
      '2026-01-20',
      [],
      createTestPlaybooks('market-1', 'DRAFT') // Not ACTIVE
    );
    
    expect(result.canAssign).toBe(false);
    expect(result.rejectionReason).toBe('MARKET_NOT_ACTIVE');
  });

  it('should reject driver not qualified for market', () => {
    const result = canAssignWork(
      'driver-1',
      'market-1',
      '2026-01-20',
      [],
      createTestPlaybooks('market-1', 'ACTIVE'),
      createTestQualification(false)
    );
    
    expect(result.canAssign).toBe(false);
    expect(result.rejectionReason).toBe('DRIVER_NOT_QUALIFIED_FOR_MARKET');
  });

  it('should reject driver with expired documents', () => {
    const qual = createTestQualification(true);
    qual.documentExpirations = [{
      documentType: 'Driver License',
      expirationDate: '2026-01-01',
      isExpired: true,
      daysUntilExpiration: -19,
    }];
    
    const result = canAssignWork(
      'driver-1',
      'market-1',
      '2026-01-20',
      [],
      createTestPlaybooks('market-1', 'ACTIVE'),
      qual
    );
    
    expect(result.canAssign).toBe(false);
    expect(result.rejectionReason).toBe('DRIVER_DOCUMENT_EXPIRED');
  });

  it('should include driver status in result', () => {
    const result = canAssignWork(
      'driver-1',
      'market-1',
      '2026-01-20',
      [],
      createTestPlaybooks('market-1', 'ACTIVE')
    );
    
    expect(result.driverStatus).toBeDefined();
    expect(result.checkedAt).toBeDefined();
  });
});

// ============================================
// 2B. HIRING GATE - canOpenHiring
// ============================================

const createTestMarketLossScore = (score: number, tier: string): MarketLossScore => ({
  marketId: 'market-1',
  calculatedAt: new Date().toISOString(),
  snapshotDate: '2026-01-20',
  score,
  tier: tier as any,
  frequencyScore: score * 0.5,
  severityScore: score * 0.3,
  volatilityScore: score * 0.2,
  inputs: {
    atFaultClaimsPer100Moves30Days: 1,
    atFaultClaimsPer100Moves90Days: 1,
    totalIncurredCents: 500000,
    weekOverWeekDelta: 0.1,
  },
  previousScore: null,
  scoreChange: 0,
  highRiskDriverCount: 0,
  severeRiskDriverCount: 0,
});

const createTestRiskControl = (controlType: string, marketId: string): RiskControl => ({
  id: `rc-${Date.now()}`,
  controlType: controlType as any,
  targetType: 'MARKET',
  targetId: marketId,
  adjustmentValue: 0,
  effectiveDate: '2026-01-01',
  expirationDate: '2026-12-31',
  triggeredByScore: 80,
  triggeredByTier: 'SEVERE',
  triggerReason: 'High risk',
  status: 'ACTIVE',
  createdAt: new Date().toISOString(),
  createdBy: 'SYSTEM',
  revokedAt: null,
  revokedBy: null,
  revocationReason: null,
});

describe('canOpenHiring', () => {
  it('should allow hiring for active market with valid playbook', () => {
    const result = canOpenHiring(
      'market-1',
      'W2_EMPLOYEE',
      '2026-01-20',
      createTestPlaybooks('market-1', 'ACTIVE')
    );
    
    expect(result.canHire).toBe(true);
    expect(result.rejectionReason).toBeNull();
    expect(result.marketPlaybook).toBeDefined();
  });

  it('should reject when no active market playbook', () => {
    const result = canOpenHiring(
      'market-1',
      'W2_EMPLOYEE',
      '2026-01-20',
      createTestPlaybooks('market-1', 'DRAFT')
    );
    
    expect(result.canHire).toBe(false);
    expect(result.rejectionReason).toBe('MARKET_NOT_ACTIVE');
  });

  it('should reject when market has CRITICAL loss score', () => {
    const criticalScore = createTestMarketLossScore(90, 'CRITICAL');
    
    const result = canOpenHiring(
      'market-1',
      'W2_EMPLOYEE',
      '2026-01-20',
      createTestPlaybooks('market-1', 'ACTIVE'),
      criticalScore
    );
    
    expect(result.canHire).toBe(false);
    expect(result.rejectionReason).toBe('MARKET_LOSS_SCORE_CRITICAL');
    expect(result.marketLossScore).toBe(90);
    expect(result.marketLossTier).toBe('CRITICAL');
  });

  it('should allow hiring when market has SEVERE (non-CRITICAL) loss score', () => {
    const severeScore = createTestMarketLossScore(75, 'SEVERE');
    
    const result = canOpenHiring(
      'market-1',
      'W2_EMPLOYEE',
      '2026-01-20',
      createTestPlaybooks('market-1', 'ACTIVE'),
      severeScore
    );
    
    expect(result.canHire).toBe(true);
    expect(result.marketLossTier).toBe('SEVERE');
  });

  it('should reject when market is paused', () => {
    const pauseControl = createTestRiskControl('MARKET_PAUSE', 'market-1');
    
    const result = canOpenHiring(
      'market-1',
      'W2_EMPLOYEE',
      '2026-01-20',
      createTestPlaybooks('market-1', 'ACTIVE'),
      null,
      [pauseControl]
    );
    
    expect(result.canHire).toBe(false);
    expect(result.rejectionReason).toBe('MARKET_PAUSED');
  });

  it('should allow hiring with non-pause risk controls', () => {
    const rateControl = createTestRiskControl('RATE_ADJUSTMENT', 'market-1');
    
    const result = canOpenHiring(
      'market-1',
      'W2_EMPLOYEE',
      '2026-01-20',
      createTestPlaybooks('market-1', 'ACTIVE'),
      null,
      [rateControl]
    );
    
    expect(result.canHire).toBe(true);
  });

  it('should reject when market is at capacity', () => {
    const capacityConfig: MarketCapacityConfig = {
      maxDrivers: 50,
      currentDriverCount: 50,
    };
    
    const result = canOpenHiring(
      'market-1',
      'W2_EMPLOYEE',
      '2026-01-20',
      createTestPlaybooks('market-1', 'ACTIVE'),
      null,
      [],
      capacityConfig
    );
    
    expect(result.canHire).toBe(false);
    expect(result.rejectionReason).toBe('MARKET_AT_CAPACITY');
  });

  it('should allow hiring when below capacity', () => {
    const capacityConfig: MarketCapacityConfig = {
      maxDrivers: 50,
      currentDriverCount: 25,
    };
    
    const result = canOpenHiring(
      'market-1',
      'W2_EMPLOYEE',
      '2026-01-20',
      createTestPlaybooks('market-1', 'ACTIVE'),
      null,
      [],
      capacityConfig
    );
    
    expect(result.canHire).toBe(true);
  });

  it('should include market loss score in result when provided', () => {
    const moderateScore = createTestMarketLossScore(40, 'MODERATE');
    
    const result = canOpenHiring(
      'market-1',
      'W2_EMPLOYEE',
      '2026-01-20',
      createTestPlaybooks('market-1', 'ACTIVE'),
      moderateScore
    );
    
    expect(result.canHire).toBe(true);
    expect(result.marketLossScore).toBe(40);
    expect(result.marketLossTier).toBe('MODERATE');
  });

  it('should work with BOTH work type when market supports both', () => {
    const result = canOpenHiring(
      'market-1',
      'BOTH',
      '2026-01-20',
      createTestPlaybooks('market-1', 'ACTIVE')
    );
    
    expect(result.canHire).toBe(true);
  });

  it('should work with IC_CONTRACTOR work type', () => {
    const result = canOpenHiring(
      'market-1',
      'IC_CONTRACTOR',
      '2026-01-20',
      createTestPlaybooks('market-1', 'ACTIVE')
    );
    
    expect(result.canHire).toBe(true);
  });
});

// ============================================
// 2C. OFFER VALIDATION GATE - validateOffer
// ============================================

describe('validateOffer', () => {
  it('should validate offer within market bounds for tier', () => {
    const result = validateOffer(
      'market-1',
      2500, // $25.00/hr - matches Standard tier
      'Standard',
      '2026-01-20',
      createTestPlaybooks('market-1', 'ACTIVE')
    );
    
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
    expect(result.tierMinRateCents).toBe(2500);
  });

  it('should reject when no active market playbook', () => {
    const result = validateOffer(
      'market-1',
      2500,
      'Standard',
      '2026-01-20',
      createTestPlaybooks('market-1', 'DRAFT')
    );
    
    expect(result.valid).toBe(false);
    expect(result.error).toBe('MARKET_NOT_ACTIVE');
  });

  it('should reject rate below market minimum', () => {
    const result = validateOffer(
      'market-1',
      1500, // Below market min of 2000
      'Standard',
      '2026-01-20',
      createTestPlaybooks('market-1', 'ACTIVE')
    );
    
    expect(result.valid).toBe(false);
    expect(result.error).toBe('RATE_BELOW_MINIMUM');
    expect(result.marketMinRateCents).toBe(2000);
  });

  it('should reject rate above market maximum', () => {
    const result = validateOffer(
      'market-1',
      5000, // Above market max of 3500
      'Elite',
      '2026-01-20',
      createTestPlaybooks('market-1', 'ACTIVE')
    );
    
    expect(result.valid).toBe(false);
    expect(result.error).toBe('RATE_ABOVE_MAXIMUM');
    expect(result.marketMaxRateCents).toBe(3500);
  });

  it('should reject rate below tier minimum', () => {
    const result = validateOffer(
      'market-1',
      2400, // Below Elite tier minimum of 3000
      'Elite',
      '2026-01-20',
      createTestPlaybooks('market-1', 'ACTIVE')
    );
    
    expect(result.valid).toBe(false);
    expect(result.error).toBe('RATE_BELOW_TIER_MINIMUM');
    expect(result.tierMinRateCents).toBe(3000);
  });

  it('should validate Elite tier rate', () => {
    const result = validateOffer(
      'market-1',
      3000, // Elite minimum
      'Elite',
      '2026-01-20',
      createTestPlaybooks('market-1', 'ACTIVE')
    );
    
    expect(result.valid).toBe(true);
    expect(result.tierMinRateCents).toBe(3000);
  });

  it('should validate At Risk tier rate', () => {
    const result = validateOffer(
      'market-1',
      2000, // At Risk minimum
      'At Risk',
      '2026-01-20',
      createTestPlaybooks('market-1', 'ACTIVE')
    );
    
    expect(result.valid).toBe(true);
    expect(result.tierMinRateCents).toBe(2000);
  });

  it('should include all rate bounds in result', () => {
    const result = validateOffer(
      'market-1',
      2750,
      'High Performer',
      '2026-01-20',
      createTestPlaybooks('market-1', 'ACTIVE')
    );
    
    expect(result.valid).toBe(true);
    expect(result.marketMinRateCents).toBe(2000);
    expect(result.marketMaxRateCents).toBe(3500);
    expect(result.tierMinRateCents).toBe(2750);
    expect(result.hourlyFloorCents).toBe(1500);
  });

  it('should validate Developing tier rate', () => {
    const result = validateOffer(
      'market-1',
      2250,
      'Developing',
      '2026-01-20',
      createTestPlaybooks('market-1', 'ACTIVE')
    );
    
    expect(result.valid).toBe(true);
    expect(result.tierMinRateCents).toBe(2250);
  });

  it('should allow rate above tier minimum', () => {
    const result = validateOffer(
      'market-1',
      2800, // Above Standard tier minimum of 2500
      'Standard',
      '2026-01-20',
      createTestPlaybooks('market-1', 'ACTIVE')
    );
    
    expect(result.valid).toBe(true);
  });
});

// ============================================
// 3. PAY PERIOD LIFECYCLE
// ============================================

describe('VALID_TRANSITIONS', () => {
  it('should allow OPEN to PROCESSING', () => {
    expect(VALID_TRANSITIONS.OPEN).toContain('PROCESSING');
  });

  it('should allow PROCESSING to LOCKED', () => {
    expect(VALID_TRANSITIONS.PROCESSING).toContain('LOCKED');
  });

  it('should allow PROCESSING to OPEN (reopen)', () => {
    expect(VALID_TRANSITIONS.PROCESSING).toContain('OPEN');
  });

  it('should not allow transitions from EXPORTED', () => {
    expect(VALID_TRANSITIONS.EXPORTED).toHaveLength(0);
  });
});

describe('isValidTransition', () => {
  it('should return true for valid transitions', () => {
    expect(isValidTransition('OPEN', 'PROCESSING')).toBe(true);
    expect(isValidTransition('PROCESSING', 'LOCKED')).toBe(true);
    expect(isValidTransition('LOCKED', 'EXPORTED')).toBe(true);
  });

  it('should return false for invalid transitions', () => {
    expect(isValidTransition('OPEN', 'LOCKED')).toBe(false);
    expect(isValidTransition('LOCKED', 'OPEN')).toBe(false);
    expect(isValidTransition('EXPORTED', 'OPEN')).toBe(false);
  });
});

describe('transitionPayPeriod', () => {
  const createLifecycle = (): PayPeriodLifecycle => ({
    payPeriodId: 'pp-2026-w03',
    currentState: 'OPEN',
    weekStartDate: '2026-01-13',
    weekEndDate: '2026-01-19',
    stateTransitions: [],
  });

  it('should transition OPEN to PROCESSING', () => {
    const lifecycle = createLifecycle();
    const result = transitionPayPeriod(lifecycle, 'PROCESSING', 'SCHEDULER', 'Weekly close');
    
    expect(result).not.toBeInstanceOf(TransitionError);
    const updated = result as PayPeriodLifecycle;
    expect(updated.currentState).toBe('PROCESSING');
    expect(updated.stateTransitions).toHaveLength(1);
  });

  it('should return error for invalid transition', () => {
    const lifecycle = createLifecycle();
    const result = transitionPayPeriod(lifecycle, 'LOCKED', 'admin-1', 'Invalid');
    
    expect(result).toBeInstanceOf(TransitionError);
  });

  it('should record transition details', () => {
    const lifecycle = createLifecycle();
    const result = transitionPayPeriod(lifecycle, 'PROCESSING', 'admin-1', 'Manual close');
    
    const updated = result as PayPeriodLifecycle;
    expect(updated.stateTransitions[0].fromState).toBe('OPEN');
    expect(updated.stateTransitions[0].toState).toBe('PROCESSING');
    expect(updated.stateTransitions[0].transitionedBy).toBe('admin-1');
  });
});

describe('getAutomaticNextState', () => {
  it('should return PROCESSING when week has ended and state is OPEN', () => {
    const nextState = getAutomaticNextState('OPEN', '2026-01-19', '2026-01-20');
    expect(nextState).toBe('PROCESSING');
  });

  it('should return null when week has not ended', () => {
    const nextState = getAutomaticNextState('OPEN', '2026-01-19', '2026-01-18');
    expect(nextState).toBeNull();
  });

  it('should return null when not in OPEN state', () => {
    const nextState = getAutomaticNextState('PROCESSING', '2026-01-19', '2026-01-20');
    expect(nextState).toBeNull();
  });
});

// ============================================
// 4. AUTOMATION AUDIT LOGGING
// ============================================

describe('Automation Audit Logging', () => {
  beforeEach(() => {
    clearAuditLog();
  });

  it('should create audit entry', () => {
    const entry = createAuditEntry(
      'PAY_PERIOD_TRANSITIONED',
      'SCHEDULER',
      'PAY_PERIOD',
      'pp-2026-w03',
      'Transitioned to PROCESSING',
      { state: 'OPEN' },
      { state: 'PROCESSING' }
    );
    
    expect(entry.id).toBeDefined();
    expect(entry.eventType).toBe('PAY_PERIOD_TRANSITIONED');
    expect(entry.success).toBe(true);
  });

  it('should retrieve audit entries by target', () => {
    createAuditEntry('JOB_STARTED', 'SCHEDULER', 'JOB', 'job-1', 'Started', null, null);
    createAuditEntry('JOB_COMPLETED', 'SCHEDULER', 'JOB', 'job-1', 'Completed', null, null);
    createAuditEntry('JOB_STARTED', 'SCHEDULER', 'JOB', 'job-2', 'Started', null, null);
    
    const entries = getAuditEntries('JOB', 'job-1');
    expect(entries).toHaveLength(2);
  });

  it('should record error in audit entry', () => {
    const entry = createAuditEntry(
      'JOB_FAILED',
      'SCHEDULER',
      'JOB',
      'job-1',
      'Job failed',
      null,
      null,
      {},
      false,
      'Connection timeout'
    );
    
    expect(entry.success).toBe(false);
    expect(entry.errorMessage).toBe('Connection timeout');
  });
});

// ============================================
// 5. JOB EXECUTION
// ============================================

describe('Job Execution', () => {
  it('should create job execution record', () => {
    const execution = createJobExecution('job-1', 'WEEKLY_PAY_PERIOD_CLOSE');
    
    expect(execution.id).toBeDefined();
    expect(execution.status).toBe('RUNNING');
    expect(execution.startedAt).toBeDefined();
    expect(execution.completedAt).toBeNull();
  });

  it('should complete job execution successfully', () => {
    const execution = createJobExecution('job-1', 'DAILY_ELIGIBILITY_CHECK');
    const completed = completeJobExecution(execution, 100, 0);
    
    expect(completed.status).toBe('COMPLETED');
    expect(completed.itemsProcessed).toBe(100);
    expect(completed.itemsFailed).toBe(0);
    expect(completed.completedAt).toBeDefined();
  });

  it('should mark failed job execution', () => {
    const execution = createJobExecution('job-1', 'WEEKLY_SAFETY_ENFORCEMENT');
    const completed = completeJobExecution(execution, 50, 5, 'Database error');
    
    expect(completed.status).toBe('FAILED');
    expect(completed.errorMessage).toBe('Database error');
  });
});

// ============================================
// 6. BATCH PROCESSING
// ============================================

describe('processBatch', () => {
  it('should process all items successfully', async () => {
    const items = [{ id: '1', value: 10 }, { id: '2', value: 20 }];
    
    const result = await processBatch(
      items,
      item => item.id,
      item => item.value * 2
    );
    
    expect(result.totalItems).toBe(2);
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(0);
  });

  it('should handle failures without stopping batch', async () => {
    const items = [{ id: '1', value: 10 }, { id: '2', value: -1 }];
    
    const result = await processBatch(
      items,
      item => item.id,
      item => {
        if (item.value < 0) throw new Error('Negative value');
        return item.value * 2;
      }
    );
    
    expect(result.totalItems).toBe(2);
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(1);
    expect(result.errors).toHaveLength(1);
  });

  it('should record error details', async () => {
    const items = [{ id: 'test', value: 0 }];
    
    const result = await processBatch(
      items,
      item => item.id,
      () => { throw new Error('Test error'); }
    );
    
    expect(result.errors[0].errorMessage).toBe('Test error');
    expect(result.errors[0].itemId).toBe('test');
  });
});

// ============================================
// 7. DAILY ELIGIBILITY RE-EVALUATION
// ============================================

describe('evaluateDailyEligibility', () => {
  it('should detect eligibility changes', () => {
    const driverIds = ['driver-1', 'driver-2'];
    const events = createTestSafetyEvents('driver-1', 2); // driver-1 becomes suspended
    const previousEligibility = new Map([
      ['driver-1', true],
      ['driver-2', true],
    ]);
    
    const changes = evaluateDailyEligibility(driverIds, '2026-01-20', events, previousEligibility);
    
    expect(changes).toHaveLength(1);
    expect(changes[0].driverId).toBe('driver-1');
    expect(changes[0].previouslyEligible).toBe(true);
    expect(changes[0].currentlyEligible).toBe(false);
  });

  it('should return empty array when no changes', () => {
    const driverIds = ['driver-1'];
    const previousEligibility = new Map([['driver-1', true]]);
    
    const changes = evaluateDailyEligibility(driverIds, '2026-01-20', [], previousEligibility);
    
    expect(changes).toHaveLength(0);
  });
});

// ============================================
// 8. DOCUMENT EXPIRATION CHECKING
// ============================================

describe('checkDocumentExpirations', () => {
  it('should identify urgent expirations (within 7 days)', () => {
    const documents = [{
      driverId: 'driver-1',
      documentType: 'Driver License',
      expirationDate: '2026-01-25',
    }];
    
    const warnings = checkDocumentExpirations(documents, '2026-01-20');
    
    expect(warnings).toHaveLength(1);
    expect(warnings[0].warningLevel).toBe('URGENT');
    expect(warnings[0].daysUntilExpiration).toBe(5);
  });

  it('should identify warning expirations (8-14 days)', () => {
    const documents = [{
      driverId: 'driver-1',
      documentType: 'Insurance',
      expirationDate: '2026-02-01',
    }];
    
    const warnings = checkDocumentExpirations(documents, '2026-01-20');
    
    expect(warnings[0].warningLevel).toBe('WARNING');
  });

  it('should identify notice expirations (15-30 days)', () => {
    const documents = [{
      driverId: 'driver-1',
      documentType: 'Insurance',
      expirationDate: '2026-02-15',
    }];
    
    const warnings = checkDocumentExpirations(documents, '2026-01-20');
    
    expect(warnings[0].warningLevel).toBe('NOTICE');
  });

  it('should not include already expired documents', () => {
    const documents = [{
      driverId: 'driver-1',
      documentType: 'Driver License',
      expirationDate: '2026-01-15', // Already expired
    }];
    
    const warnings = checkDocumentExpirations(documents, '2026-01-20');
    
    expect(warnings).toHaveLength(0);
  });

  it('should sort by days until expiration', () => {
    const documents = [
      { driverId: 'driver-1', documentType: 'Insurance', expirationDate: '2026-02-15' },
      { driverId: 'driver-2', documentType: 'License', expirationDate: '2026-01-25' },
    ];
    
    const warnings = checkDocumentExpirations(documents, '2026-01-20');
    
    expect(warnings[0].documentType).toBe('License'); // Expires sooner
  });
});

// ============================================
// 9. EVENT HOOKS
// ============================================

describe('Event Hooks', () => {
  beforeEach(() => {
    clearEventHooks();
    clearAuditLog();
  });

  it('should register and trigger event hooks', async () => {
    let triggered = false;
    
    registerEventHook('JOB_STARTED', () => {
      triggered = true;
    });
    
    await auditAndTrigger(
      'JOB_STARTED',
      'SCHEDULER',
      'JOB',
      'job-1',
      'Started',
      null,
      null
    );
    
    expect(triggered).toBe(true);
  });

  it('should trigger multiple hooks for same event', async () => {
    let count = 0;
    
    registerEventHook('JOB_COMPLETED', () => { count++; });
    registerEventHook('JOB_COMPLETED', () => { count++; });
    
    await auditAndTrigger(
      'JOB_COMPLETED',
      'SCHEDULER',
      'JOB',
      'job-1',
      'Completed',
      null,
      null
    );
    
    expect(count).toBe(2);
  });

  it('should not fail if hook throws error', async () => {
    registerEventHook('JOB_FAILED', () => {
      throw new Error('Hook error');
    });
    
    // Should not throw
    const entry = await auditAndTrigger(
      'JOB_FAILED',
      'SCHEDULER',
      'JOB',
      'job-1',
      'Failed',
      null,
      null
    );
    
    expect(entry).toBeDefined();
  });
});
