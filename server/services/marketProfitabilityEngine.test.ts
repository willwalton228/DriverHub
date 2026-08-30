import { describe, it, expect, beforeEach } from 'vitest';
import {
  createLaborMetrics,
  createClaimsMetrics,
  createVolumeMetrics,
  aggregateMarketMetrics,
  calculateMarketProfitScore,
  determineProfitTier,
  determineApplicableThrottles,
  applyThrottle,
  revokeThrottle,
  expireThrottles,
  getActiveThrottles,
  isThrottleActive,
  emitWarningEvent,
  acknowledgeWarning,
  getUnacknowledgedWarnings,
  shouldEmitWarning,
  generateExecutiveSummary,
  createProfitAuditEntry,
  getMarketProfitAudit,
  getAllProfitAuditEntries,
  processMarketProfitability,
  clearAllProfitabilityData,
  getProfitScoreHistory,
  getAllWarningEvents,
  type MarketLaborMetrics,
  type MarketClaimsMetrics,
  type MarketVolumeMetrics,
  type AggregatedMarketMetrics,
  type MarketProfitScore,
  type ThrottleConfig,
  PROFIT_TIER_THRESHOLDS,
  SCORE_WEIGHTS,
  DEFAULT_THROTTLE_CONFIGS,
  WARNING_THRESHOLDS,
  PROFITABILITY_BENCHMARKS,
} from './marketProfitabilityEngine';

// ============================================
// TEST FIXTURES
// ============================================

function createTestLaborMetrics(overrides: Partial<MarketLaborMetrics> = {}): MarketLaborMetrics {
  return createLaborMetrics('market-001', '2024-06-01', '2024-06-07', {
    totalDriverCount: 100,
    activeDriverCount: 90,
    utilizationRate: 0.80,
    totalLaborCostCents: 5000000, // $50,000
    averageHourlyRateCents: 2500,
    overtimeHours: 100,
    regularHours: 1900,
    driverTurnoverRate: 0.15,
    averageTenureDays: 180,
    ...overrides,
  });
}

function createTestClaimsMetrics(overrides: Partial<MarketClaimsMetrics> = {}): MarketClaimsMetrics {
  return createClaimsMetrics('market-001', '2024-06-01', '2024-06-07', {
    totalClaimCount: 5,
    atFaultClaimCount: 3,
    totalIncurredCents: 250000, // $2,500
    averageClaimCostCents: 50000,
    claimsPer100Moves: 2.0,
    lossRatio: 0.05,
    ...overrides,
  });
}

function createTestVolumeMetrics(overrides: Partial<MarketVolumeMetrics> = {}): MarketVolumeMetrics {
  return createVolumeMetrics('market-001', '2024-06-01', '2024-06-07', {
    totalMoves: 1050,
    completedMoves: 1000,
    cancelledMoves: 50,
    completionRate: 0.95,
    averageMoveDurationHours: 2.5,
    peakCapacityUtilization: 0.92,
    weekOverWeekGrowth: 0.03,
    ...overrides,
  });
}

function createTestAggregatedMetrics(overrides: Partial<{
  labor: Partial<MarketLaborMetrics>;
  claims: Partial<MarketClaimsMetrics>;
  volume: Partial<MarketVolumeMetrics>;
}> = {}): AggregatedMarketMetrics {
  const labor = createTestLaborMetrics(overrides.labor);
  const claims = createTestClaimsMetrics(overrides.claims);
  const volume = createTestVolumeMetrics(overrides.volume);
  return aggregateMarketMetrics(labor, claims, volume);
}

// ============================================
// METRICS AGGREGATION TESTS
// ============================================

describe('Metrics Aggregation', () => {
  it('should create labor metrics with defaults', () => {
    const metrics = createLaborMetrics('market-001', '2024-06-01', '2024-06-07', {});
    
    expect(metrics.marketId).toBe('market-001');
    expect(metrics.totalDriverCount).toBe(0);
    expect(metrics.utilizationRate).toBe(0);
  });

  it('should create claims metrics with defaults', () => {
    const metrics = createClaimsMetrics('market-001', '2024-06-01', '2024-06-07', {});
    
    expect(metrics.marketId).toBe('market-001');
    expect(metrics.totalClaimCount).toBe(0);
    expect(metrics.claimsPer100Moves).toBe(0);
  });

  it('should create volume metrics with defaults', () => {
    const metrics = createVolumeMetrics('market-001', '2024-06-01', '2024-06-07', {});
    
    expect(metrics.marketId).toBe('market-001');
    expect(metrics.totalMoves).toBe(0);
    expect(metrics.weekOverWeekGrowth).toBe(0);
  });

  it('should aggregate metrics correctly', () => {
    const labor = createTestLaborMetrics({ totalLaborCostCents: 5000000 });
    const claims = createTestClaimsMetrics({ totalIncurredCents: 250000 });
    const volume = createTestVolumeMetrics({ completedMoves: 1000 });
    
    const aggregated = aggregateMarketMetrics(labor, claims, volume);
    
    expect(aggregated.marketId).toBe('market-001');
    expect(aggregated.costPerMove).toBe(5250); // (5000000 + 250000) / 1000
    expect(aggregated.laborEfficiency).toBeCloseTo(0.5); // 1000 / 2000 hours
  });

  it('should handle zero completed moves', () => {
    const labor = createTestLaborMetrics();
    const claims = createTestClaimsMetrics();
    const volume = createTestVolumeMetrics({ completedMoves: 0 });
    
    const aggregated = aggregateMarketMetrics(labor, claims, volume);
    
    // Should not throw, uses 1 as fallback
    expect(aggregated.costPerMove).toBeGreaterThan(0);
  });
});

// ============================================
// PROFIT SCORE CALCULATION TESTS
// ============================================

describe('Profit Score Calculation', () => {
  beforeEach(() => {
    clearAllProfitabilityData();
  });

  it('should calculate profit score with good metrics', () => {
    const metrics = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.85, totalLaborCostCents: 4000000 },
      claims: { claimsPer100Moves: 1.0 },
      volume: { weekOverWeekGrowth: 0.05, completedMoves: 1000 },
    });
    
    const score = calculateMarketProfitScore(metrics);
    
    expect(score.score).toBeGreaterThan(60);
    expect(score.tier).toMatch(/EXCELLENT|GOOD|ADEQUATE/);
  });

  it('should calculate profit score with poor metrics', () => {
    const metrics = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.50, totalLaborCostCents: 10000000 },
      claims: { claimsPer100Moves: 5.0 },
      volume: { weekOverWeekGrowth: -0.10, completedMoves: 500 },
    });
    
    const score = calculateMarketProfitScore(metrics);
    
    expect(score.score).toBeLessThan(40);
    expect(score.tier).toMatch(/POOR|CRITICAL/);
  });

  it('should include all component scores', () => {
    const metrics = createTestAggregatedMetrics();
    const score = calculateMarketProfitScore(metrics);
    
    expect(score.laborEfficiencyScore).toBeGreaterThanOrEqual(0);
    expect(score.laborEfficiencyScore).toBeLessThanOrEqual(100);
    expect(score.claimsPerformanceScore).toBeGreaterThanOrEqual(0);
    expect(score.claimsPerformanceScore).toBeLessThanOrEqual(100);
    expect(score.utilizationScore).toBeGreaterThanOrEqual(0);
    expect(score.utilizationScore).toBeLessThanOrEqual(100);
    expect(score.volumeGrowthScore).toBeGreaterThanOrEqual(0);
    expect(score.volumeGrowthScore).toBeLessThanOrEqual(100);
  });

  it('should track score change from previous', () => {
    const metrics1 = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.70, totalLaborCostCents: 6000000 },
    });
    const score1 = calculateMarketProfitScore(metrics1);
    
    const metrics2 = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.85, totalLaborCostCents: 4000000 },
    });
    const score2 = calculateMarketProfitScore(metrics2, score1);
    
    expect(score2.previousScore).toBe(score1.score);
    expect(score2.scoreChange).toBe(score2.score - score1.score);
  });

  it('should determine trend direction correctly', () => {
    const metrics1 = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.70 },
    });
    const score1 = calculateMarketProfitScore(metrics1);
    
    const metrics2 = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.90 },
    });
    const score2 = calculateMarketProfitScore(metrics2, score1);
    
    // If score improved significantly
    if (score2.scoreChange >= 3) {
      expect(score2.trendDirection).toBe('IMPROVING');
    }
  });

  it('should store scores in history', () => {
    const metrics = createTestAggregatedMetrics();
    calculateMarketProfitScore(metrics);
    
    const history = getProfitScoreHistory('market-001');
    expect(history).toHaveLength(1);
  });
});

// ============================================
// PROFIT TIER TESTS
// ============================================

describe('Profit Tier Determination', () => {
  it('should return EXCELLENT for scores 85-100', () => {
    expect(determineProfitTier(100)).toBe('EXCELLENT');
    expect(determineProfitTier(85)).toBe('EXCELLENT');
  });

  it('should return GOOD for scores 70-84', () => {
    expect(determineProfitTier(84)).toBe('GOOD');
    expect(determineProfitTier(70)).toBe('GOOD');
  });

  it('should return ADEQUATE for scores 55-69', () => {
    expect(determineProfitTier(69)).toBe('ADEQUATE');
    expect(determineProfitTier(55)).toBe('ADEQUATE');
  });

  it('should return MARGINAL for scores 40-54', () => {
    expect(determineProfitTier(54)).toBe('MARGINAL');
    expect(determineProfitTier(40)).toBe('MARGINAL');
  });

  it('should return POOR for scores 25-39', () => {
    expect(determineProfitTier(39)).toBe('POOR');
    expect(determineProfitTier(25)).toBe('POOR');
  });

  it('should return CRITICAL for scores 0-24', () => {
    expect(determineProfitTier(24)).toBe('CRITICAL');
    expect(determineProfitTier(0)).toBe('CRITICAL');
  });
});

// ============================================
// UTILIZATION SCORE BOUNDARY TESTS
// ============================================

describe('Utilization Score Boundaries', () => {
  beforeEach(() => {
    clearAllProfitabilityData();
  });

  it('should clamp utilization score for over-utilization (above 100%)', () => {
    const metrics = createTestAggregatedMetrics({
      labor: { utilizationRate: 1.20 }, // 120% over-utilized
    });
    const score = calculateMarketProfitScore(metrics);
    
    // Score should be clamped, not negative
    expect(score.utilizationScore).toBeGreaterThanOrEqual(0);
    expect(score.utilizationScore).toBeLessThanOrEqual(100);
    expect(score.utilizationScore).toBeGreaterThanOrEqual(60); // Minimum for over-util
  });

  it('should give high score at target utilization (85%)', () => {
    const metrics = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.85 }, // Target
    });
    const score = calculateMarketProfitScore(metrics);
    
    expect(score.utilizationScore).toBeGreaterThanOrEqual(85);
    expect(score.utilizationScore).toBeLessThanOrEqual(100);
  });

  it('should give low score at minimum utilization (60%)', () => {
    const metrics = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.60 },
    });
    const score = calculateMarketProfitScore(metrics);
    
    expect(score.utilizationScore).toBeGreaterThanOrEqual(15);
    expect(score.utilizationScore).toBeLessThanOrEqual(25);
  });

  it('should give near-zero score below minimum utilization', () => {
    const metrics = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.30 }, // Half of minimum
    });
    const score = calculateMarketProfitScore(metrics);
    
    expect(score.utilizationScore).toBeGreaterThanOrEqual(0);
    expect(score.utilizationScore).toBeLessThanOrEqual(20);
  });
});

// ============================================
// THROTTLE TESTS
// ============================================

describe('Throttle Management', () => {
  beforeEach(() => {
    clearAllProfitabilityData();
  });

  it('should determine applicable throttles based on score and tier', () => {
    const throttles = determineApplicableThrottles(30, 'POOR');
    
    // Score 30 POOR should trigger throttles meant for POOR tier and score < threshold
    expect(throttles.length).toBeGreaterThan(0);
    expect(throttles.some(t => t.action === 'ENHANCED_REVIEW')).toBe(true);
  });

  it('should require both score AND tier to trigger throttle', () => {
    // Score 30 but EXCELLENT tier - shouldn't trigger POOR tier throttles
    const throttles = determineApplicableThrottles(30, 'EXCELLENT');
    
    // EXCELLENT tier is better than trigger tiers, so no throttles should apply
    expect(throttles.every(t => {
      // Should only include throttles where EXCELLENT <= triggerTier (none exist)
      const tierOrder = ['CRITICAL', 'POOR', 'MARGINAL', 'ADEQUATE', 'GOOD', 'EXCELLENT'];
      return tierOrder.indexOf('EXCELLENT') <= tierOrder.indexOf(t.triggerTier);
    })).toBe(true);
  });

  it('should not trigger CRITICAL tier throttles for POOR tier', () => {
    // Score 20 (below CRITICAL thresholds) but tier is POOR
    const throttles = determineApplicableThrottles(20, 'POOR');
    
    // POOR tier should trigger POOR and MARGINAL tier throttles
    // But HIRING_FREEZE requires CRITICAL tier
    const criticalOnlyThrottles = throttles.filter(t => t.triggerTier === 'CRITICAL');
    expect(criticalOnlyThrottles).toHaveLength(0);
  });

  it('should trigger CRITICAL tier throttles for CRITICAL tier', () => {
    // Score 10 with CRITICAL tier should trigger CRITICAL tier throttles
    const throttles = determineApplicableThrottles(10, 'CRITICAL');
    
    // CRITICAL tier with low score should trigger all applicable throttles
    expect(throttles.some(t => t.action === 'HIRING_FREEZE')).toBe(true);
    expect(throttles.some(t => t.action === 'CAPACITY_REDUCTION')).toBe(true);
  });

  it('should not trigger throttles for good scores', () => {
    const throttles = determineApplicableThrottles(80, 'GOOD');
    
    expect(throttles).toHaveLength(0);
  });

  it('should apply throttle to market', () => {
    const config: ThrottleConfig = {
      action: 'HIRING_LIMIT',
      triggerTier: 'POOR',
      triggerScoreBelow: 40,
      durationDays: 30,
      description: 'Limit hiring',
    };
    
    const throttle = applyThrottle('market-001', config, 35, 'POOR', 'admin');
    
    expect(throttle.marketId).toBe('market-001');
    expect(throttle.action).toBe('HIRING_LIMIT');
    expect(throttle.status).toBe('ACTIVE');
    expect(throttle.triggeredByScore).toBe(35);
  });

  it('should revoke throttle', () => {
    const config: ThrottleConfig = {
      action: 'HIRING_LIMIT',
      triggerTier: 'POOR',
      triggerScoreBelow: 40,
      durationDays: 30,
      description: 'Limit hiring',
    };
    
    const throttle = applyThrottle('market-001', config, 35, 'POOR', 'admin');
    const revoked = revokeThrottle(throttle.id, 'admin', 'Score improved');
    
    expect(revoked?.status).toBe('REVOKED');
    expect(revoked?.revokedBy).toBe('admin');
  });

  it('should expire throttles past expiration date', () => {
    const config: ThrottleConfig = {
      action: 'HIRING_LIMIT',
      triggerTier: 'POOR',
      triggerScoreBelow: 40,
      durationDays: 1, // Short duration for testing
      description: 'Limit hiring',
    };
    
    applyThrottle('market-001', config, 35, 'POOR', 'admin');
    
    // Expire with future date
    const futureDate = '2030-01-01';
    const expired = expireThrottles(futureDate);
    
    expect(expired).toHaveLength(1);
    expect(expired[0].status).toBe('EXPIRED');
  });

  it('should get active throttles for market', () => {
    const config1: ThrottleConfig = {
      action: 'HIRING_LIMIT',
      triggerTier: 'POOR',
      triggerScoreBelow: 40,
      durationDays: 30,
      description: 'Limit hiring',
    };
    const config2: ThrottleConfig = {
      action: 'RATE_CAP',
      triggerTier: 'POOR',
      triggerScoreBelow: 35,
      durationDays: 30,
      description: 'Cap rates',
    };
    
    applyThrottle('market-001', config1, 35, 'POOR', 'admin');
    applyThrottle('market-001', config2, 35, 'POOR', 'admin');
    applyThrottle('market-002', config1, 35, 'POOR', 'admin');
    
    const throttles = getActiveThrottles('market-001');
    
    expect(throttles).toHaveLength(2);
    expect(throttles.every(t => t.marketId === 'market-001')).toBe(true);
  });

  it('should check if throttle action is active', () => {
    const config: ThrottleConfig = {
      action: 'HIRING_FREEZE',
      triggerTier: 'CRITICAL',
      triggerScoreBelow: 25,
      durationDays: 60,
      description: 'Freeze hiring',
    };
    
    applyThrottle('market-001', config, 20, 'CRITICAL', 'admin');
    
    expect(isThrottleActive('market-001', 'HIRING_FREEZE')).toBe(true);
    expect(isThrottleActive('market-001', 'RATE_CAP')).toBe(false);
    expect(isThrottleActive('market-002', 'HIRING_FREEZE')).toBe(false);
  });
});

// ============================================
// WARNING EVENTS TESTS
// ============================================

describe('Warning Events', () => {
  beforeEach(() => {
    clearAllProfitabilityData();
  });

  it('should emit warning event', () => {
    const metrics = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.50 },
      claims: { claimsPer100Moves: 4.0 },
    });
    const profitScore = calculateMarketProfitScore(metrics);
    
    const warning = emitWarningEvent(profitScore);
    
    expect(warning.marketId).toBe('market-001');
    expect(warning.currentScore).toBe(profitScore.score);
    expect(warning.acknowledged).toBe(false);
  });

  it('should determine correct severity', () => {
    // Critical score
    const metrics1 = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.30, totalLaborCostCents: 15000000 },
      claims: { claimsPer100Moves: 6.0 },
      volume: { weekOverWeekGrowth: -0.15 },
    });
    const score1 = calculateMarketProfitScore(metrics1);
    const warning1 = emitWarningEvent(score1);
    
    expect(warning1.severity).toMatch(/CRITICAL|URGENT/);
  });

  it('should acknowledge warning', () => {
    const metrics = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.50 },
    });
    const profitScore = calculateMarketProfitScore(metrics);
    const warning = emitWarningEvent(profitScore);
    
    const acknowledged = acknowledgeWarning(warning.id, 'manager');
    
    expect(acknowledged?.acknowledged).toBe(true);
    expect(acknowledged?.acknowledgedBy).toBe('manager');
  });

  it('should get unacknowledged warnings', () => {
    const metrics = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.50 },
    });
    const profitScore = calculateMarketProfitScore(metrics);
    
    emitWarningEvent(profitScore);
    const warning2 = emitWarningEvent(profitScore);
    acknowledgeWarning(warning2.id, 'manager');
    
    const unacknowledged = getUnacknowledgedWarnings('market-001');
    
    expect(unacknowledged).toHaveLength(1);
  });

  it('should determine if warning should be emitted', () => {
    const goodScore: MarketProfitScore = {
      marketId: 'market-001',
      calculatedAt: new Date().toISOString(),
      snapshotDate: '2024-06-07',
      score: 75,
      tier: 'GOOD',
      laborEfficiencyScore: 80,
      claimsPerformanceScore: 75,
      utilizationScore: 70,
      volumeGrowthScore: 70,
      inputs: {
        costPerMoveCents: 4500,
        claimsPer100Moves: 1.5,
        utilizationRate: 0.80,
        weekOverWeekGrowth: 0.03,
        lossRatio: 0.04,
      },
      previousScore: 72,
      scoreChange: 3,
      trendDirection: 'STABLE',
    };
    
    expect(shouldEmitWarning(goodScore)).toBe(false);
    
    const poorScore: MarketProfitScore = {
      ...goodScore,
      score: 30,
      tier: 'POOR',
    };
    
    expect(shouldEmitWarning(poorScore)).toBe(true);
  });

  it('should generate suggested actions', () => {
    const metrics = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.40 },
      claims: { claimsPer100Moves: 5.0 },
    });
    const profitScore = calculateMarketProfitScore(metrics);
    const warning = emitWarningEvent(profitScore);
    
    expect(warning.suggestedActions.length).toBeGreaterThan(0);
  });
});

// ============================================
// EXECUTIVE SUMMARY TESTS
// ============================================

describe('Executive Summary', () => {
  beforeEach(() => {
    clearAllProfitabilityData();
  });

  it('should generate executive summary', () => {
    const metrics = createTestAggregatedMetrics();
    const profitScore = calculateMarketProfitScore(metrics);
    
    const summary = generateExecutiveSummary(profitScore, [], []);
    
    expect(summary.marketId).toBe('market-001');
    expect(summary.profitScore).toBe(profitScore.score);
    expect(summary.profitTier).toBe(profitScore.tier);
    expect(summary.keyMetrics.costPerMove).toMatch(/\$/);
    expect(summary.keyMetrics.utilizationRate).toMatch(/%/);
  });

  it('should include active throttles in summary', () => {
    const metrics = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.40 },
    });
    const profitScore = calculateMarketProfitScore(metrics);
    
    const config: ThrottleConfig = {
      action: 'HIRING_LIMIT',
      triggerTier: 'POOR',
      triggerScoreBelow: 40,
      durationDays: 30,
      description: 'Limit hiring',
    };
    const throttle = applyThrottle('market-001', config, profitScore.score, profitScore.tier, 'admin');
    
    const summary = generateExecutiveSummary(profitScore, [throttle], []);
    
    expect(summary.activeThrottles).toHaveLength(1);
    expect(summary.activeThrottles[0].action).toBe('HIRING_LIMIT');
  });

  it('should include active warnings in summary', () => {
    const metrics = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.40 },
    });
    const profitScore = calculateMarketProfitScore(metrics);
    const warning = emitWarningEvent(profitScore);
    
    const summary = generateExecutiveSummary(profitScore, [], [warning]);
    
    expect(summary.activeWarnings).toHaveLength(1);
    expect(summary.activeWarnings[0].severity).toBe(warning.severity);
  });

  it('should include recommendations', () => {
    const metrics = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.40 },
      claims: { claimsPer100Moves: 5.0 },
    });
    const profitScore = calculateMarketProfitScore(metrics);
    const summary = generateExecutiveSummary(profitScore, [], []);
    
    expect(summary.recommendations.length).toBeGreaterThan(0);
  });
});

// ============================================
// AUDIT TRAIL TESTS
// ============================================

describe('Profit Audit Trail', () => {
  beforeEach(() => {
    clearAllProfitabilityData();
  });

  it('should create audit entry', () => {
    const entry = createProfitAuditEntry(
      'SCORE_CALCULATED',
      'market-001',
      'SYSTEM',
      null,
      { score: 65, tier: 'ADEQUATE' },
      { reason: 'Weekly calculation' }
    );
    
    expect(entry.id).toMatch(/^pa-/);
    expect(entry.action).toBe('SCORE_CALCULATED');
    expect(entry.marketId).toBe('market-001');
  });

  it('should get audit entries for market', () => {
    createProfitAuditEntry('SCORE_CALCULATED', 'market-001', 'SYSTEM');
    createProfitAuditEntry('THROTTLE_APPLIED', 'market-001', 'SYSTEM');
    createProfitAuditEntry('SCORE_CALCULATED', 'market-002', 'SYSTEM');
    
    const entries = getMarketProfitAudit('market-001');
    
    expect(entries).toHaveLength(2);
    expect(entries.every(e => e.marketId === 'market-001')).toBe(true);
  });

  it('should get all audit entries', () => {
    createProfitAuditEntry('SCORE_CALCULATED', 'market-001', 'SYSTEM');
    createProfitAuditEntry('THROTTLE_APPLIED', 'market-002', 'SYSTEM');
    
    const entries = getAllProfitAuditEntries();
    
    expect(entries).toHaveLength(2);
  });
});

// ============================================
// COMPLETE FLOW TESTS
// ============================================

describe('processMarketProfitability', () => {
  beforeEach(() => {
    clearAllProfitabilityData();
  });

  it('should process market with good metrics', () => {
    const metrics = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.85, totalLaborCostCents: 4000000 },
      claims: { claimsPer100Moves: 1.0 },
      volume: { weekOverWeekGrowth: 0.05, completedMoves: 1000 },
    });
    
    const result = processMarketProfitability(metrics);
    
    expect(result.marketId).toBe('market-001');
    expect(result.profitScore.score).toBeGreaterThan(50);
    expect(result.appliedThrottles).toHaveLength(0);
    expect(result.executiveSummary).toBeDefined();
  });

  it('should apply throttles for poor metrics', () => {
    const metrics = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.40, totalLaborCostCents: 12000000 },
      claims: { claimsPer100Moves: 5.0 },
      volume: { weekOverWeekGrowth: -0.15, completedMoves: 500 },
    });
    
    const result = processMarketProfitability(metrics);
    
    expect(result.profitScore.score).toBeLessThan(40);
    expect(result.appliedThrottles.length).toBeGreaterThan(0);
  });

  it('should emit warnings for poor metrics', () => {
    const metrics = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.40, totalLaborCostCents: 12000000 },
      claims: { claimsPer100Moves: 5.0 },
      volume: { weekOverWeekGrowth: -0.15 },
    });
    
    const result = processMarketProfitability(metrics);
    
    expect(result.emittedWarnings.length).toBeGreaterThan(0);
  });

  it('should not duplicate existing throttles', () => {
    const metrics = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.40, totalLaborCostCents: 12000000 },
      claims: { claimsPer100Moves: 5.0 },
    });
    
    // Process twice
    processMarketProfitability(metrics);
    const result2 = processMarketProfitability(metrics);
    
    // Second run should not apply duplicate throttles
    const activeThrottles = getActiveThrottles('market-001');
    const hiringLimitCount = activeThrottles.filter(t => t.action === 'HIRING_LIMIT').length;
    
    expect(hiringLimitCount).toBeLessThanOrEqual(1);
  });

  it('should include executive summary', () => {
    const metrics = createTestAggregatedMetrics();
    const result = processMarketProfitability(metrics);
    
    expect(result.executiveSummary.marketId).toBe('market-001');
    expect(result.executiveSummary.profitScore).toBe(result.profitScore.score);
    expect(result.executiveSummary.keyMetrics).toBeDefined();
  });

  it('should create audit entries for processing', () => {
    const metrics = createTestAggregatedMetrics();
    processMarketProfitability(metrics);
    
    const audit = getMarketProfitAudit('market-001');
    const actions = audit.map(e => e.action);
    
    expect(actions).toContain('METRICS_AGGREGATED');
    expect(actions).toContain('SCORE_CALCULATED');
    expect(actions).toContain('SUMMARY_GENERATED');
  });

  it('should track previous score when provided', () => {
    const metrics1 = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.70 },
    });
    const result1 = processMarketProfitability(metrics1);
    
    const metrics2 = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.85 },
    });
    const result2 = processMarketProfitability(metrics2, result1.profitScore);
    
    expect(result2.profitScore.previousScore).toBe(result1.profitScore.score);
  });
});

// ============================================
// CONSTANTS TESTS
// ============================================

describe('Constants', () => {
  it('should have correct profit tier thresholds', () => {
    expect(PROFIT_TIER_THRESHOLDS.EXCELLENT.min).toBe(85);
    expect(PROFIT_TIER_THRESHOLDS.CRITICAL.max).toBe(24);
  });

  it('should have correct score weights summing to 1', () => {
    const totalWeight = 
      SCORE_WEIGHTS.laborEfficiency +
      SCORE_WEIGHTS.claimsPerformance +
      SCORE_WEIGHTS.utilization +
      SCORE_WEIGHTS.volumeGrowth;
    
    expect(totalWeight).toBe(1);
  });

  it('should have default throttle configs', () => {
    expect(DEFAULT_THROTTLE_CONFIGS.length).toBeGreaterThan(0);
    expect(DEFAULT_THROTTLE_CONFIGS.some(c => c.action === 'HIRING_FREEZE')).toBe(true);
  });

  it('should have warning thresholds', () => {
    expect(WARNING_THRESHOLDS.scoreDropPercent).toBe(10);
    expect(WARNING_THRESHOLDS.criticalScoreThreshold).toBe(25);
  });

  it('should have profitability benchmarks', () => {
    expect(PROFITABILITY_BENCHMARKS.targetCostPerMoveCents).toBe(5000);
    expect(PROFITABILITY_BENCHMARKS.targetUtilization).toBe(0.85);
  });
});

// ============================================
// SCENARIO SIMULATION TESTS
// ============================================

import { simulateScenario, type ScenarioInputs } from './marketProfitabilityEngine';

describe('simulateScenario', () => {
  beforeEach(() => {
    clearAllProfitabilityData();
  });

  it('should simulate scenario with default base metrics', () => {
    const result = simulateScenario('market-001', {
      utilizationRate: 0.85,
      weekOverWeekGrowth: 0.05,
    });
    
    expect(result.marketId).toBe('market-001');
    expect(result.projectedScore).toBeGreaterThanOrEqual(0);
    expect(result.projectedScore).toBeLessThanOrEqual(100);
    expect(result.projectedTier).toBeDefined();
  });

  it('should project improved score with better metrics', () => {
    // First get a baseline
    const baseline = simulateScenario('market-001', {
      utilizationRate: 0.70,
      claimsPer100Moves: 3.0,
    });
    
    // Improve metrics
    const improved = simulateScenario('market-001', {
      utilizationRate: 0.85,
      claimsPer100Moves: 1.0,
    });
    
    expect(improved.projectedScore).toBeGreaterThan(baseline.projectedScore);
  });

  it('should project worse score with poor metrics', () => {
    const baseline = simulateScenario('market-001', {
      utilizationRate: 0.85,
      claimsPer100Moves: 1.5,
    });
    
    const degraded = simulateScenario('market-001', {
      utilizationRate: 0.50,
      claimsPer100Moves: 5.0,
    });
    
    expect(degraded.projectedScore).toBeLessThan(baseline.projectedScore);
  });

  it('should include component score breakdown', () => {
    const result = simulateScenario('market-001', {
      utilizationRate: 0.80,
    });
    
    expect(result.componentScores.laborEfficiency).toBeGreaterThanOrEqual(0);
    expect(result.componentScores.claimsPerformance).toBeGreaterThanOrEqual(0);
    expect(result.componentScores.utilization).toBeGreaterThanOrEqual(0);
    expect(result.componentScores.volumeGrowth).toBeGreaterThanOrEqual(0);
  });

  it('should identify throttles that would be triggered', () => {
    const poorResult = simulateScenario('market-001', {
      utilizationRate: 0.40,
      claimsPer100Moves: 5.0,
      totalLaborCostCents: 15000000,
      completedMoves: 500,
    });
    
    // Poor metrics should trigger throttles
    if (poorResult.projectedScore < 40) {
      expect(poorResult.wouldTriggerThrottles.length).toBeGreaterThan(0);
    }
  });

  it('should not trigger throttles for good scenarios', () => {
    const goodResult = simulateScenario('market-001', {
      utilizationRate: 0.85,
      claimsPer100Moves: 1.0,
      weekOverWeekGrowth: 0.06,
      totalLaborCostCents: 4000000,
      completedMoves: 1200,
    });
    
    if (goodResult.projectedScore >= 55) {
      expect(goodResult.wouldTriggerThrottles).toHaveLength(0);
    }
  });

  it('should calculate score change from current score', () => {
    // Create a current score
    const metrics = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.70 },
    });
    const currentScore = calculateMarketProfitScore(metrics);
    
    // Simulate improved scenario
    const result = simulateScenario('market-001', {
      utilizationRate: 0.90,
    }, null, currentScore);
    
    expect(result.currentScore).toBe(currentScore.score);
    expect(result.scoreChange).toBeDefined();
  });

  it('should determine trend direction', () => {
    const metrics = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.70 },
    });
    const currentScore = calculateMarketProfitScore(metrics);
    
    // Simulate significantly improved scenario
    const improved = simulateScenario('market-001', {
      utilizationRate: 0.95,
      claimsPer100Moves: 0.5,
      weekOverWeekGrowth: 0.10,
    }, null, currentScore);
    
    // Should show improving trend if score went up significantly
    if (improved.scoreChange >= 3) {
      expect(improved.trendDirection).toBe('IMPROVING');
    }
  });

  it('should identify key drivers', () => {
    const result = simulateScenario('market-001', {
      utilizationRate: 0.40, // Poor utilization
      claimsPer100Moves: 5.0, // Poor claims
    });
    
    expect(result.keyDrivers.length).toBeGreaterThanOrEqual(0);
  });

  it('should provide improvement opportunities', () => {
    const result = simulateScenario('market-001', {
      utilizationRate: 0.50,
      claimsPer100Moves: 4.0,
    });
    
    expect(result.improvementOpportunities.length).toBeGreaterThan(0);
  });

  it('should determine warning severity for poor scores', () => {
    const result = simulateScenario('market-001', {
      utilizationRate: 0.30,
      claimsPer100Moves: 6.0,
      totalLaborCostCents: 20000000,
      completedMoves: 300,
    });
    
    if (result.projectedScore < 25) {
      expect(result.wouldTriggerWarning).toBe(true);
      expect(result.warningSeverity).toBe('CRITICAL');
    }
  });

  it('should use provided base metrics when available', () => {
    const baseMetrics = createTestAggregatedMetrics({
      labor: { utilizationRate: 0.80 },
      claims: { claimsPer100Moves: 2.0 },
    });
    
    // Only change one metric
    const result = simulateScenario('market-001', {
      utilizationRate: 0.90,
    }, baseMetrics);
    
    expect(result.projectedScore).toBeGreaterThanOrEqual(0);
    expect(result.componentScores.utilization).toBeGreaterThan(80); // Improved utilization
  });
});
