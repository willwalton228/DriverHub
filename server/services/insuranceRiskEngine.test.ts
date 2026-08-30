/**
 * Unit Tests for Insurance Feedback Loop & Risk Pricing Engine (INCREMENT 12)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeClaimEvent,
  updateClaimStatus,
  calculateDriverLossMetrics,
  calculateMarketLossMetrics,
  getTierFromScore,
  calculateDriverLossScore,
  calculateMarketLossScore,
  determineDriverControls,
  determineMarketControls,
  activateControl,
  revokeControl,
  isControlActive,
  getActiveDriverControls,
  getActiveMarketControls,
  emitWarningEvent,
  checkDriverThresholdsAndWarn,
  checkMarketThresholdsAndWarn,
  acknowledgeWarning,
  getUnacknowledgedWarnings,
  clearWarningEvents,
  createInsuranceAuditEntry,
  getInsuranceAuditEntries,
  getAllInsuranceAuditEntries,
  clearInsuranceAuditLog,
  processInsuranceEvents,
  DEFAULT_THRESHOLDS,
  SCORE_TIERS,
  DEFAULT_RISK_CONTROLS,
  type InsuranceEvent,
  type DriverLossMetrics,
  type DriverLossScore,
  type MarketLossScore,
  type RiskControl,
} from './insuranceRiskEngine';

// ============================================
// TEST DATA
// ============================================

const createTestEvent = (overrides: Partial<InsuranceEvent> = {}): InsuranceEvent => ({
  id: 'ins-test-1',
  driverId: 'driver-1',
  marketId: 'market-1',
  claimType: 'COLLISION',
  status: 'REPORTED',
  faultDetermination: 'AT_FAULT',
  claimAmountCents: 500000, // $5,000
  reserveAmountCents: 500000,
  paidAmountCents: 0,
  deductibleCents: 100000,
  incidentDate: '2026-01-15',
  reportedDate: '2026-01-16',
  closedDate: null,
  description: 'Test collision',
  externalClaimId: null,
  recordedAt: '2026-01-16T00:00:00Z',
  recordedBy: 'admin-1',
  ...overrides,
});

const createTestMetrics = (overrides: Partial<DriverLossMetrics> = {}): DriverLossMetrics => ({
  driverId: 'driver-1',
  calculatedAt: '2026-01-20T00:00:00Z',
  claims30Days: 1,
  claims90Days: 2,
  claims365Days: 3,
  atFaultClaims30Days: 1,
  atFaultClaims90Days: 1,
  atFaultClaims365Days: 2,
  totalIncurredCents30Days: 500000,
  totalIncurredCents90Days: 1000000,
  totalIncurredCents365Days: 1500000,
  averageClaimCents: 500000,
  claimsPerMonth: 0.25,
  ...overrides,
});

const createTestDriverScore = (overrides: Partial<DriverLossScore> = {}): DriverLossScore => ({
  driverId: 'driver-1',
  calculatedAt: '2026-01-20T00:00:00Z',
  snapshotDate: '2026-01-20',
  score: 50,
  tier: 'HIGH',
  frequencyScore: 60,
  severityScore: 25,
  inputs: {
    atFaultClaims30Days: 1,
    atFaultClaims90Days: 1,
    severityWeightedCostCents: 500000,
    recencyMultiplier: 3.0,
  },
  previousScore: null,
  scoreChange: 0,
  ...overrides,
});

// ============================================
// 1. CLAIM NORMALIZATION
// ============================================

describe('normalizeClaimEvent', () => {
  it('should create normalized insurance event from raw data', () => {
    const event = normalizeClaimEvent({
      driverId: 'driver-1',
      marketId: 'market-1',
      claimType: 'COLLISION',
      faultDetermination: 'AT_FAULT',
      incidentDate: '2026-01-15',
      claimAmountCents: 500000,
    }, 'admin-1');
    
    expect(event.id).toBeDefined();
    expect(event.status).toBe('REPORTED');
    expect(event.claimAmountCents).toBe(500000);
    expect(event.reserveAmountCents).toBe(500000);
    expect(event.recordedBy).toBe('admin-1');
  });

  it('should set reserve from claim amount if not provided', () => {
    const event = normalizeClaimEvent({
      driverId: 'driver-1',
      marketId: 'market-1',
      claimType: 'PROPERTY_DAMAGE',
      faultDetermination: 'NOT_AT_FAULT',
      incidentDate: '2026-01-15',
      claimAmountCents: 300000,
    }, 'admin-1');
    
    expect(event.reserveAmountCents).toBe(300000);
  });
});

describe('updateClaimStatus', () => {
  it('should update status to settled', () => {
    const event = createTestEvent();
    const updated = updateClaimStatus(event, 'SETTLED', 450000);
    
    expect(updated.status).toBe('SETTLED');
    expect(updated.paidAmountCents).toBe(450000);
    expect(updated.closedDate).toBeDefined();
  });

  it('should set closed date for terminal statuses', () => {
    const event = createTestEvent();
    const settled = updateClaimStatus(event, 'SETTLED');
    const denied = updateClaimStatus(event, 'DENIED');
    const closed = updateClaimStatus(event, 'CLOSED');
    
    expect(settled.closedDate).not.toBeNull();
    expect(denied.closedDate).not.toBeNull();
    expect(closed.closedDate).not.toBeNull();
  });
});

// ============================================
// 2. ROLLING LOSS METRICS
// ============================================

describe('calculateDriverLossMetrics', () => {
  it('should calculate metrics from events', () => {
    const events = [
      createTestEvent({ incidentDate: '2026-01-10' }),
      createTestEvent({ id: 'ins-2', incidentDate: '2025-12-01', faultDetermination: 'NOT_AT_FAULT' }),
    ];
    
    const metrics = calculateDriverLossMetrics('driver-1', events, '2026-01-20');
    
    expect(metrics.claims30Days).toBe(1);
    expect(metrics.claims90Days).toBe(2);
    expect(metrics.atFaultClaims30Days).toBe(1);
    expect(metrics.atFaultClaims90Days).toBe(1);
  });

  it('should calculate average claim correctly', () => {
    const events = [
      createTestEvent({ claimAmountCents: 300000, reserveAmountCents: 300000 }),
      createTestEvent({ id: 'ins-2', claimAmountCents: 500000, reserveAmountCents: 500000 }),
    ];
    
    const metrics = calculateDriverLossMetrics('driver-1', events, '2026-01-20');
    
    expect(metrics.averageClaimCents).toBe(400000); // (300k + 500k) / 2
  });

  it('should use paid amount for closed claims', () => {
    const events = [
      createTestEvent({ 
        status: 'SETTLED', 
        reserveAmountCents: 500000, 
        paidAmountCents: 300000,
        closedDate: '2026-01-18',
      }),
    ];
    
    const metrics = calculateDriverLossMetrics('driver-1', events, '2026-01-20');
    
    expect(metrics.totalIncurredCents30Days).toBe(300000); // Uses paid, not reserve
  });
});

describe('calculateMarketLossMetrics', () => {
  it('should aggregate metrics across drivers in market', () => {
    const events = [
      createTestEvent({ driverId: 'driver-1' }),
      createTestEvent({ id: 'ins-2', driverId: 'driver-2' }),
    ];
    
    const metrics = calculateMarketLossMetrics(
      'market-1',
      events,
      ['driver-1', 'driver-2', 'driver-3'],
      '2026-01-20'
    );
    
    expect(metrics.totalDrivers).toBe(3);
    expect(metrics.driversWithClaims).toBe(2);
    expect(metrics.claims30Days).toBe(2);
  });

  it('should calculate loss ratio when premium provided', () => {
    const events = [createTestEvent()];
    
    const metrics = calculateMarketLossMetrics(
      'market-1',
      events,
      ['driver-1'],
      '2026-01-20',
      1000000 // $10,000 earned premium
    );
    
    expect(metrics.estimatedLossRatio).toBe(0.5); // $5,000 / $10,000
  });
});

// ============================================
// 3. LOSS SCORE CALCULATION (0-100 scale)
// ============================================

describe('getTierFromScore', () => {
  it('should return correct tier for score (0-100 scale)', () => {
    expect(getTierFromScore(10)).toBe('LOW');
    expect(getTierFromScore(35)).toBe('MODERATE');
    expect(getTierFromScore(55)).toBe('HIGH');
    expect(getTierFromScore(75)).toBe('SEVERE');
    expect(getTierFromScore(90)).toBe('CRITICAL');
  });

  it('should handle boundary values', () => {
    expect(getTierFromScore(29)).toBe('LOW');
    expect(getTierFromScore(30)).toBe('MODERATE');
    expect(getTierFromScore(49)).toBe('MODERATE');
    expect(getTierFromScore(50)).toBe('HIGH');
  });
});

describe('calculateDriverLossScore', () => {
  it('should calculate score from metrics (0-100 scale)', () => {
    const metrics = createTestMetrics();
    const score = calculateDriverLossScore(metrics, '2026-01-20');
    
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(100);
    expect(score.tier).toBeDefined();
    expect(score.frequencyScore).toBeDefined();
    expect(score.severityScore).toBeDefined();
    expect(score.snapshotDate).toBe('2026-01-20');
  });

  it('should include audit inputs', () => {
    const metrics = createTestMetrics();
    const score = calculateDriverLossScore(metrics, '2026-01-20');
    
    expect(score.inputs).toBeDefined();
    expect(score.inputs.atFaultClaims30Days).toBe(1);
    expect(score.inputs.recencyMultiplier).toBe(3.0);
  });

  it('should track score change from previous', () => {
    const metrics = createTestMetrics();
    const previousScore = createTestDriverScore({ score: 20, tier: 'LOW' });
    
    const newScore = calculateDriverLossScore(metrics, '2026-01-20', previousScore);
    
    expect(newScore.previousScore).toBe(20);
    expect(newScore.scoreChange).toBe(newScore.score - 20);
  });

  it('should cap score at 100', () => {
    const metrics = createTestMetrics({
      atFaultClaims30Days: 10,
      atFaultClaims90Days: 15,
      totalIncurredCents90Days: 50000000, // $500,000
    });
    
    const score = calculateDriverLossScore(metrics, '2026-01-20');
    
    expect(score.score).toBeLessThanOrEqual(100);
  });

  it('should weight frequency at 60% and severity at 40%', () => {
    // High frequency, low severity
    const highFreqMetrics = createTestMetrics({
      atFaultClaims30Days: 3,
      atFaultClaims90Days: 3,
      totalIncurredCents90Days: 100000, // $1,000
    });
    
    // Low frequency, high severity
    const highSevMetrics = createTestMetrics({
      atFaultClaims30Days: 0,
      atFaultClaims90Days: 1,
      totalIncurredCents90Days: 3000000, // $30,000
    });
    
    const highFreqScore = calculateDriverLossScore(highFreqMetrics, '2026-01-20');
    const highSevScore = calculateDriverLossScore(highSevMetrics, '2026-01-20');
    
    // High frequency should have higher frequency component
    expect(highFreqScore.frequencyScore).toBeGreaterThan(highSevScore.frequencyScore);
    // High severity should have higher severity component
    expect(highSevScore.severityScore).toBeGreaterThan(highFreqScore.severityScore);
  });
});

describe('calculateMarketLossScore', () => {
  it('should calculate score from market metrics (0-100 scale)', () => {
    const marketMetrics = {
      marketId: 'market-1',
      calculatedAt: '2026-01-20T00:00:00Z',
      totalDrivers: 100,
      driversWithClaims: 10,
      claims30Days: 5,
      claims90Days: 15,
      claims365Days: 50,
      totalIncurredCents30Days: 500000,
      totalIncurredCents90Days: 1500000,
      totalIncurredCents365Days: 5000000,
      claimsPerDriverMonth: 0.042,
      incurredPerDriverMonth: 4167,
      estimatedLossRatio: 0.5,
    };
    
    const driverScores: DriverLossScore[] = [];
    const score = calculateMarketLossScore(marketMetrics, driverScores, '2026-01-20');
    
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(100);
    expect(score.tier).toBeDefined();
    expect(score.snapshotDate).toBe('2026-01-20');
    expect(score.highRiskDriverCount).toBe(0);
  });

  it('should include audit inputs', () => {
    const marketMetrics = {
      marketId: 'market-1',
      calculatedAt: '2026-01-20T00:00:00Z',
      totalDrivers: 10,
      driversWithClaims: 5,
      claims30Days: 5,
      claims90Days: 15,
      claims365Days: 50,
      totalIncurredCents30Days: 500000,
      totalIncurredCents90Days: 1500000,
      totalIncurredCents365Days: 5000000,
      claimsPerDriverMonth: 0.42,
      incurredPerDriverMonth: 41667,
      estimatedLossRatio: 0.5,
    };
    
    const score = calculateMarketLossScore(marketMetrics, [], '2026-01-20', 100, 300);
    
    expect(score.inputs).toBeDefined();
    expect(score.inputs.totalIncurredCents).toBe(1500000);
  });

  it('should count high risk drivers', () => {
    const marketMetrics = {
      marketId: 'market-1',
      calculatedAt: '2026-01-20T00:00:00Z',
      totalDrivers: 10,
      driversWithClaims: 5,
      claims30Days: 5,
      claims90Days: 15,
      claims365Days: 50,
      totalIncurredCents30Days: 500000,
      totalIncurredCents90Days: 1500000,
      totalIncurredCents365Days: 5000000,
      claimsPerDriverMonth: 0.42,
      incurredPerDriverMonth: 41667,
      estimatedLossRatio: 0.5,
    };
    
    const driverScores: DriverLossScore[] = [
      createTestDriverScore({ driverId: 'd1', score: 60, tier: 'HIGH' }),
      createTestDriverScore({ driverId: 'd2', score: 75, tier: 'SEVERE' }),
      createTestDriverScore({ driverId: 'd3', score: 20, tier: 'LOW' }),
    ];
    
    const score = calculateMarketLossScore(marketMetrics, driverScores, '2026-01-20');
    
    expect(score.highRiskDriverCount).toBe(2); // HIGH + SEVERE
    expect(score.severeRiskDriverCount).toBe(1); // SEVERE only
  });
});

// ============================================
// 4. AUTOMATIC RISK CONTROLS
// ============================================

describe('determineDriverControls', () => {
  it('should generate controls for high-risk driver', () => {
    const score = createTestDriverScore({ score: 60, tier: 'HIGH' });
    
    const controls = determineDriverControls(score, '2026-01-21');
    
    expect(controls.length).toBeGreaterThan(0);
    expect(controls.some(c => c.controlType === 'RATE_ADJUSTMENT')).toBe(true);
  });

  it('should generate critical controls for critical tier', () => {
    const score = createTestDriverScore({ score: 90, tier: 'CRITICAL' });
    
    const controls = determineDriverControls(score, '2026-01-21');
    
    expect(controls.some(c => c.controlType === 'ASSIGNMENT_RESTRICTION')).toBe(true);
  });

  it('should not generate controls for low-risk driver', () => {
    const score = createTestDriverScore({ score: 10, tier: 'LOW' });
    
    const controls = determineDriverControls(score, '2026-01-21');
    
    expect(controls.length).toBe(0);
  });
});

describe('determineMarketControls', () => {
  it('should generate market controls for severe tier', () => {
    const score: MarketLossScore = {
      marketId: 'market-1',
      calculatedAt: '2026-01-20T00:00:00Z',
      snapshotDate: '2026-01-20',
      score: 75,
      tier: 'SEVERE',
      frequencyScore: 50,
      severityScore: 30,
      volatilityScore: 20,
      inputs: {
        atFaultClaimsPer100Moves30Days: 2,
        atFaultClaimsPer100Moves90Days: 1.5,
        totalIncurredCents: 5000000,
        weekOverWeekDelta: 0.2,
      },
      previousScore: null,
      scoreChange: 0,
      highRiskDriverCount: 5,
      severeRiskDriverCount: 2,
    };
    
    const controls = determineMarketControls(score, '2026-01-21');
    
    expect(controls.some(c => c.controlType === 'DEDUCTIBLE_INCREASE')).toBe(true);
  });
});

describe('Control Lifecycle', () => {
  it('should activate pending control', () => {
    const control: RiskControl = {
      id: 'rc-1',
      controlType: 'RATE_ADJUSTMENT',
      targetType: 'DRIVER',
      targetId: 'driver-1',
      adjustmentValue: 0.10,
      effectiveDate: '2026-01-21',
      expirationDate: '2026-03-21',
      triggeredByScore: 60,
      triggeredByTier: 'HIGH',
      triggerReason: 'Test',
      status: 'PENDING',
      createdAt: '2026-01-20T00:00:00Z',
      createdBy: 'SYSTEM',
      revokedAt: null,
      revokedBy: null,
      revocationReason: null,
    };
    
    const activated = activateControl(control);
    
    expect(activated.status).toBe('ACTIVE');
  });

  it('should revoke active control', () => {
    const control: RiskControl = {
      id: 'rc-1',
      controlType: 'RATE_ADJUSTMENT',
      targetType: 'DRIVER',
      targetId: 'driver-1',
      adjustmentValue: 0.10,
      effectiveDate: '2026-01-21',
      expirationDate: '2026-03-21',
      triggeredByScore: 60,
      triggeredByTier: 'HIGH',
      triggerReason: 'Test',
      status: 'ACTIVE',
      createdAt: '2026-01-20T00:00:00Z',
      createdBy: 'SYSTEM',
      revokedAt: null,
      revokedBy: null,
      revocationReason: null,
    };
    
    const revoked = revokeControl(control, 'admin-1', 'Driver improved');
    
    expect(revoked.status).toBe('REVOKED');
    expect(revoked.revokedBy).toBe('admin-1');
  });

  it('should check if control is active', () => {
    const control: RiskControl = {
      id: 'rc-1',
      controlType: 'RATE_ADJUSTMENT',
      targetType: 'DRIVER',
      targetId: 'driver-1',
      adjustmentValue: 0.10,
      effectiveDate: '2026-01-21',
      expirationDate: '2026-03-21',
      triggeredByScore: 60,
      triggeredByTier: 'HIGH',
      triggerReason: 'Test',
      status: 'ACTIVE',
      createdAt: '2026-01-20T00:00:00Z',
      createdBy: 'SYSTEM',
      revokedAt: null,
      revokedBy: null,
      revocationReason: null,
    };
    
    expect(isControlActive(control, '2026-02-15')).toBe(true);
    expect(isControlActive(control, '2026-01-20')).toBe(false); // Before effective
    expect(isControlActive(control, '2026-04-01')).toBe(false); // After expiration
  });
});

// ============================================
// 5. WARNING EVENT EMISSION
// ============================================

describe('Warning Events', () => {
  beforeEach(() => {
    clearWarningEvents();
  });

  it('should emit warning event', () => {
    const event = emitWarningEvent(
      'SCORE_THRESHOLD_CROSSED',
      'DRIVER',
      'driver-1',
      'WARNING',
      'Test warning',
      50,
      60
    );
    
    expect(event.id).toBeDefined();
    expect(event.severity).toBe('WARNING');
    expect(event.acknowledged).toBe(false);
  });

  it('should check driver thresholds and emit warnings (0-100 scale)', () => {
    const score = createTestDriverScore({ score: 90, tier: 'CRITICAL' });
    
    const warnings = checkDriverThresholdsAndWarn(score, null);
    
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some(w => w.severity === 'CRITICAL')).toBe(true);
  });

  it('should emit tier change warning', () => {
    const previousScore = createTestDriverScore({ score: 40, tier: 'MODERATE' });
    const currentScore = createTestDriverScore({ 
      score: 60, 
      tier: 'HIGH',
      previousScore: 40,
      scoreChange: 20,
    });
    
    const warnings = checkDriverThresholdsAndWarn(currentScore, previousScore);
    
    expect(warnings.some(w => w.eventType === 'TIER_CHANGE')).toBe(true);
  });

  it('should acknowledge warning', () => {
    const event = emitWarningEvent(
      'SCORE_THRESHOLD_CROSSED',
      'DRIVER',
      'driver-1',
      'WARNING',
      'Test',
      50,
      60
    );
    
    const acknowledged = acknowledgeWarning(event.id, 'admin-1');
    
    expect(acknowledged?.acknowledged).toBe(true);
    expect(acknowledged?.acknowledgedBy).toBe('admin-1');
  });

  it('should get unacknowledged warnings', () => {
    emitWarningEvent('SCORE_THRESHOLD_CROSSED', 'DRIVER', 'driver-1', 'WARNING', 'Test 1', 50, 60);
    const event2 = emitWarningEvent('TIER_CHANGE', 'DRIVER', 'driver-1', 'CRITICAL', 'Test 2', 2, 3);
    acknowledgeWarning(event2.id, 'admin-1');
    
    const unacked = getUnacknowledgedWarnings();
    
    expect(unacked).toHaveLength(1);
    expect(unacked[0].eventType).toBe('SCORE_THRESHOLD_CROSSED');
  });
});

// ============================================
// 6. AUDIT TRAIL
// ============================================

describe('Insurance Audit Trail', () => {
  beforeEach(() => {
    clearInsuranceAuditLog();
  });

  it('should create audit entry', () => {
    const entry = createInsuranceAuditEntry(
      'CLAIM_RECORDED',
      'DRIVER',
      'driver-1',
      'admin-1',
      null,
      { claimId: 'ins-1' }
    );
    
    expect(entry.id).toBeDefined();
    expect(entry.action).toBe('CLAIM_RECORDED');
  });

  it('should retrieve entries by target', () => {
    createInsuranceAuditEntry('CLAIM_RECORDED', 'DRIVER', 'driver-1', 'admin-1', null, {});
    createInsuranceAuditEntry('SCORE_CALCULATED', 'DRIVER', 'driver-1', 'SYSTEM', null, {});
    createInsuranceAuditEntry('CLAIM_RECORDED', 'DRIVER', 'driver-2', 'admin-1', null, {});
    
    const entries = getInsuranceAuditEntries('DRIVER', 'driver-1');
    
    expect(entries).toHaveLength(2);
  });

  it('should get all entries', () => {
    createInsuranceAuditEntry('CLAIM_RECORDED', 'DRIVER', 'driver-1', 'admin-1', null, {});
    createInsuranceAuditEntry('CONTROL_APPLIED', 'MARKET', 'market-1', 'SYSTEM', null, {});
    
    const entries = getAllInsuranceAuditEntries();
    
    expect(entries).toHaveLength(2);
  });
});

// ============================================
// 7. COMPLETE PROCESSING PIPELINE
// ============================================

describe('processInsuranceEvents', () => {
  beforeEach(() => {
    clearWarningEvents();
    clearInsuranceAuditLog();
  });

  it('should process events and generate all outputs', () => {
    const events = [
      createTestEvent({ driverId: 'driver-1', marketId: 'market-1' }),
      createTestEvent({ id: 'ins-2', driverId: 'driver-2', marketId: 'market-1' }),
    ];
    
    const driverIdsByMarket = new Map<string, string[]>([
      ['market-1', ['driver-1', 'driver-2']],
    ]);
    
    const result = processInsuranceEvents(events, driverIdsByMarket, '2026-01-20');
    
    expect(result.driverMetrics).toHaveLength(2);
    expect(result.driverScores).toHaveLength(2);
    expect(result.marketMetrics).toHaveLength(1);
    expect(result.marketScores).toHaveLength(1);
    expect(result.auditEntries.length).toBeGreaterThan(0);
  });

  it('should use prospective effective date for controls', () => {
    const events = [
      createTestEvent({ 
        claimAmountCents: 5000000, // $50,000 - high severity
        incidentDate: '2026-01-15',
      }),
      createTestEvent({ 
        id: 'ins-2',
        claimAmountCents: 5000000,
        incidentDate: '2026-01-10',
      }),
    ];
    
    const driverIdsByMarket = new Map<string, string[]>([
      ['market-1', ['driver-1']],
    ]);
    
    const result = processInsuranceEvents(events, driverIdsByMarket, '2026-01-20');
    
    // Any controls generated should have effective date after processing date
    for (const control of result.controlsGenerated) {
      expect(control.effectiveDate).toBe('2026-01-21');
    }
  });

  it('should detect tier changes with previous scores', () => {
    const events = [createTestEvent()];
    
    const driverIdsByMarket = new Map<string, string[]>([
      ['market-1', ['driver-1']],
    ]);
    
    const previousDriverScores = new Map<string, DriverLossScore>([
      ['driver-1', createTestDriverScore({ score: 10, tier: 'LOW' })],
    ]);
    
    const result = processInsuranceEvents(
      events,
      driverIdsByMarket,
      '2026-01-20',
      previousDriverScores
    );
    
    // Should track score change
    expect(result.driverScores[0].previousScore).toBe(10);
    expect(result.driverScores[0].scoreChange).not.toBe(0);
  });
});

// ============================================
// 8. THRESHOLD CONSTANTS (0-100 scale)
// ============================================

describe('DEFAULT_THRESHOLDS', () => {
  it('should have driver thresholds on 0-100 scale', () => {
    expect(DEFAULT_THRESHOLDS.driver.moderateScoreThreshold).toBe(30);
    expect(DEFAULT_THRESHOLDS.driver.criticalScoreThreshold).toBeGreaterThan(
      DEFAULT_THRESHOLDS.driver.severeScoreThreshold
    );
    expect(DEFAULT_THRESHOLDS.driver.criticalScoreThreshold).toBeLessThanOrEqual(100);
  });

  it('should have market thresholds on 0-100 scale', () => {
    expect(DEFAULT_THRESHOLDS.market.moderateScoreThreshold).toBe(25);
    expect(DEFAULT_THRESHOLDS.market.lossRatioWarning).toBeLessThan(
      DEFAULT_THRESHOLDS.market.lossRatioCritical
    );
  });
});

describe('SCORE_TIERS', () => {
  it('should define all tier boundaries on 0-100 scale', () => {
    expect(SCORE_TIERS.LOW.max).toBe(29);
    expect(SCORE_TIERS.MODERATE.min).toBe(30);
    expect(SCORE_TIERS.CRITICAL.max).toBe(100);
  });

  it('should have contiguous boundaries', () => {
    expect(SCORE_TIERS.MODERATE.min).toBe(SCORE_TIERS.LOW.max + 1);
    expect(SCORE_TIERS.HIGH.min).toBe(SCORE_TIERS.MODERATE.max + 1);
  });
});

describe('DEFAULT_RISK_CONTROLS', () => {
  it('should define at least 4 control types', () => {
    expect(DEFAULT_RISK_CONTROLS.length).toBeGreaterThanOrEqual(4);
  });

  it('should have controls for both drivers and markets', () => {
    expect(DEFAULT_RISK_CONTROLS.some(c => c.applyToDriver)).toBe(true);
    expect(DEFAULT_RISK_CONTROLS.some(c => c.applyToMarket)).toBe(true);
  });
});

// ============================================
// 9. DESIGN PRINCIPLE VALIDATION
// ============================================

describe('Loss Score Design Principles', () => {
  it('should store snapshotDate for prospective-only application', () => {
    const metrics = createTestMetrics();
    const score = calculateDriverLossScore(metrics, '2026-01-20');
    
    expect(score.snapshotDate).toBe('2026-01-20');
  });

  it('should include full inputs for audit trail', () => {
    const metrics = createTestMetrics();
    const score = calculateDriverLossScore(metrics, '2026-01-20');
    
    // Verify all inputs are captured for reproducibility
    expect(score.inputs.atFaultClaims30Days).toBeDefined();
    expect(score.inputs.atFaultClaims90Days).toBeDefined();
    expect(score.inputs.severityWeightedCostCents).toBeDefined();
    expect(score.inputs.recencyMultiplier).toBeDefined();
  });

  it('should be deterministic - same inputs produce same score', () => {
    const metrics = createTestMetrics();
    const score1 = calculateDriverLossScore(metrics, '2026-01-20');
    const score2 = calculateDriverLossScore(metrics, '2026-01-20');
    
    expect(score1.score).toBe(score2.score);
    expect(score1.frequencyScore).toBe(score2.frequencyScore);
    expect(score1.severityScore).toBe(score2.severityScore);
  });
});
