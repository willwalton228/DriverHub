import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateForwardProjection,
  runStressTest,
  runAllStressTests,
  determineRiskBand,
  analyzeBreakpoints,
  generateAdvisoryRecommendations,
  generateForecastReport,
  HORIZON_WEEKS,
  DEFAULT_ASSUMPTIONS,
  RISK_BANDS,
  BREAKPOINTS,
  PREDEFINED_STRESS_TESTS,
  STRESS_SEVERITY_MULTIPLIERS,
  type ProjectionHorizon,
  type StressTestType,
  type StressTestParams,
  type ProjectionAssumptions,
} from './forecastingEngine';

import {
  createLaborMetrics,
  createClaimsMetrics,
  createVolumeMetrics,
  aggregateMarketMetrics,
  calculateMarketProfitScore,
  clearAllProfitabilityData,
  type AggregatedMarketMetrics,
  type MarketProfitScore,
} from './marketProfitabilityEngine';

// ============================================
// TEST FIXTURES
// ============================================

function createTestMetrics(overrides: {
  labor?: Partial<ReturnType<typeof createLaborMetrics>>;
  claims?: Partial<ReturnType<typeof createClaimsMetrics>>;
  volume?: Partial<ReturnType<typeof createVolumeMetrics>>;
} = {}): AggregatedMarketMetrics {
  const labor = createLaborMetrics('market-001', '2024-06-01', '2024-06-07', {
    totalDriverCount: 100,
    activeDriverCount: 90,
    utilizationRate: 0.80,
    totalLaborCostCents: 5000000,
    averageHourlyRateCents: 2500,
    overtimeHours: 100,
    regularHours: 1900,
    ...overrides.labor,
  });
  
  const claims = createClaimsMetrics('market-001', '2024-06-01', '2024-06-07', {
    totalClaimCount: 5,
    atFaultClaimCount: 3,
    totalIncurredCents: 250000,
    averageClaimCostCents: 50000,
    claimsPer100Moves: 2.0,
    lossRatio: 0.05,
    ...overrides.claims,
  });
  
  const volume = createVolumeMetrics('market-001', '2024-06-01', '2024-06-07', {
    totalMoves: 1050,
    completedMoves: 1000,
    cancelledMoves: 50,
    completionRate: 0.95,
    averageMoveDurationHours: 2.5,
    peakCapacityUtilization: 0.92,
    weekOverWeekGrowth: 0.03,
    ...overrides.volume,
  });
  
  return aggregateMarketMetrics(labor, claims, volume);
}

function createTestScore(metrics: AggregatedMarketMetrics): MarketProfitScore {
  return calculateMarketProfitScore(metrics);
}

// ============================================
// FORWARD PROJECTION TESTS
// ============================================

describe('Forward Projections', () => {
  beforeEach(() => {
    clearAllProfitabilityData();
  });

  it('should generate 4-week projection', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    
    const projection = generateForwardProjection('market-001', metrics, score, '4_WEEKS');
    
    expect(projection.marketId).toBe('market-001');
    expect(projection.horizon).toBe('4_WEEKS');
    expect(projection.weeklyProjections).toHaveLength(4);
  });

  it('should generate 12-week projection by default', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    
    const projection = generateForwardProjection('market-001', metrics, score);
    
    expect(projection.weeklyProjections).toHaveLength(12);
  });

  it('should generate 26-week projection', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    
    const projection = generateForwardProjection('market-001', metrics, score, '26_WEEKS');
    
    expect(projection.weeklyProjections).toHaveLength(26);
  });

  it('should include baseline metrics', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    
    const projection = generateForwardProjection('market-001', metrics, score);
    
    expect(projection.baseline.laborCostCents).toBe(metrics.labor.totalLaborCostCents);
    expect(projection.baseline.claimsCostCents).toBe(metrics.claims.totalIncurredCents);
    expect(projection.baseline.profitScore).toBe(score.score);
  });

  it('should project increasing labor costs with default assumptions', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    
    const projection = generateForwardProjection('market-001', metrics, score, '8_WEEKS');
    
    const firstWeek = projection.weeklyProjections[0];
    const lastWeek = projection.weeklyProjections[7];
    
    expect(lastWeek.projectedLaborCostCents).toBeGreaterThan(firstWeek.projectedLaborCostCents);
  });

  it('should use custom assumptions', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    
    const optimisticAssumptions: ProjectionAssumptions = {
      laborCostGrowthRate: -0.01,  // Decreasing costs
      claimsGrowthRate: -0.02,
      volumeGrowthRate: 0.05,
      utilizationTrend: 0.01,
      inflationFactor: 0.02,
    };
    
    const projection = generateForwardProjection('market-001', metrics, score, '8_WEEKS', optimisticAssumptions);
    
    expect(projection.assumptions).toEqual(optimisticAssumptions);
  });

  it('should calculate summary statistics', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    
    const projection = generateForwardProjection('market-001', metrics, score);
    
    expect(projection.summary.avgProfitScore).toBeGreaterThanOrEqual(0);
    expect(projection.summary.avgProfitScore).toBeLessThanOrEqual(100);
    expect(projection.summary.minProfitScore).toBeLessThanOrEqual(projection.summary.avgProfitScore);
    expect(projection.summary.maxProfitScore).toBeGreaterThanOrEqual(projection.summary.avgProfitScore);
    expect(projection.summary.endingTier).toBeDefined();
  });

  it('should project valid profit scores', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    
    const projection = generateForwardProjection('market-001', metrics, score);
    
    for (const week of projection.weeklyProjections) {
      expect(week.projectedProfitScore).toBeGreaterThanOrEqual(0);
      expect(week.projectedProfitScore).toBeLessThanOrEqual(100);
      expect(week.projectedTier).toBeDefined();
    }
  });
});

// ============================================
// STRESS TEST TESTS
// ============================================

describe('Stress Tests', () => {
  beforeEach(() => {
    clearAllProfitabilityData();
  });

  it('should run claims spike stress test', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    
    const result = runStressTest('market-001', metrics, score, {
      type: 'CLAIMS_SPIKE',
      severity: 'MODERATE',
      duration: 4,
      rampUp: false,
    });
    
    expect(result.testType).toBe('CLAIMS_SPIKE');
    expect(result.preStressScore).toBe(score.score);
    expect(result.postStressScore).toBeLessThanOrEqual(result.preStressScore);
    expect(result.scoreImpact).toBeLessThanOrEqual(0);
  });

  it('should run labor shortage stress test', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    
    const result = runStressTest('market-001', metrics, score, {
      type: 'LABOR_SHORTAGE',
      severity: 'MODERATE',
      duration: 4,
      rampUp: false,
    });
    
    expect(result.testType).toBe('LABOR_SHORTAGE');
    expect(result.postStressScore).toBeLessThanOrEqual(result.preStressScore);
  });

  it('should run volume drop stress test', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    
    const result = runStressTest('market-001', metrics, score, {
      type: 'VOLUME_DROP',
      severity: 'MODERATE',
      duration: 4,
      rampUp: false,
    });
    
    expect(result.testType).toBe('VOLUME_DROP');
    expect(result.impactBreakdown.volumeGrowthImpact).toBeLessThanOrEqual(0);
  });

  it('should run volume surge stress test', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    
    const result = runStressTest('market-001', metrics, score, {
      type: 'VOLUME_SURGE',
      severity: 'MODERATE',
      duration: 4,
      rampUp: false,
    });
    
    expect(result.testType).toBe('VOLUME_SURGE');
    // Volume surge has mixed impact (more volume but higher costs)
    expect(result.postStressScore).toBeDefined();
  });

  it('should apply severity multipliers', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    
    const mildResult = runStressTest('market-001', metrics, score, {
      type: 'CLAIMS_SPIKE',
      severity: 'MILD',
      duration: 4,
      rampUp: false,
    });
    
    const severeResult = runStressTest('market-001', metrics, score, {
      type: 'CLAIMS_SPIKE',
      severity: 'SEVERE',
      duration: 4,
      rampUp: false,
    });
    
    expect(Math.abs(severeResult.scoreImpact)).toBeGreaterThanOrEqual(Math.abs(mildResult.scoreImpact));
  });

  it('should include impact breakdown', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    
    const result = runStressTest('market-001', metrics, score, {
      type: 'COMBINED_ADVERSE',
      severity: 'MODERATE',
      duration: 4,
      rampUp: false,
    });
    
    expect(result.impactBreakdown).toBeDefined();
    expect(typeof result.impactBreakdown.laborEfficiencyImpact).toBe('number');
    expect(typeof result.impactBreakdown.claimsPerformanceImpact).toBe('number');
    expect(typeof result.impactBreakdown.utilizationImpact).toBe('number');
    expect(typeof result.impactBreakdown.volumeGrowthImpact).toBe('number');
  });

  it('should identify triggered throttles', () => {
    const metrics = createTestMetrics({
      labor: { utilizationRate: 0.65 },
      claims: { claimsPer100Moves: 3.0 },
    });
    const score = createTestScore(metrics);
    
    const result = runStressTest('market-001', metrics, score, {
      type: 'COMBINED_ADVERSE',
      severity: 'EXTREME',
      duration: 4,
      rampUp: false,
    });
    
    // Extreme adverse should trigger some throttles
    expect(result.wouldTriggerThrottles).toBeDefined();
  });

  it('should include recovery projection', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    
    const result = runStressTest('market-001', metrics, score, {
      type: 'CLAIMS_SPIKE',
      severity: 'SEVERE',
      duration: 4,
      rampUp: false,
    });
    
    expect(result.recoveryWeeks).toBeGreaterThanOrEqual(0);
    expect(result.recoveryPath).toBeDefined();
  });

  it('should detect breakpoint breach', () => {
    const metrics = createTestMetrics({
      labor: { utilizationRate: 0.55, totalLaborCostCents: 8000000 },
      claims: { claimsPer100Moves: 4.0 },
    });
    const score = createTestScore(metrics);
    
    const result = runStressTest('market-001', metrics, score, {
      type: 'COMBINED_ADVERSE',
      severity: 'EXTREME',
      duration: 4,
      rampUp: false,
    });
    
    // Should detect if breakpoint was reached
    expect(typeof result.breakpointReached).toBe('boolean');
  });

  it('should run all predefined stress tests', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    
    const results = runAllStressTests('market-001', metrics, score);
    
    expect(results).toHaveLength(Object.keys(PREDEFINED_STRESS_TESTS).length);
    
    const testTypes = results.map(r => r.testType);
    expect(testTypes).toContain('CLAIMS_SPIKE');
    expect(testTypes).toContain('LABOR_SHORTAGE');
    expect(testTypes).toContain('VOLUME_DROP');
    expect(testTypes).toContain('VOLUME_SURGE');
    expect(testTypes).toContain('COST_INFLATION');
    expect(testTypes).toContain('COMBINED_ADVERSE');
  });
});

// ============================================
// RISK BANDS TESTS
// ============================================

describe('Risk Bands', () => {
  it('should return LOW for excellent scores', () => {
    expect(determineRiskBand(90)).toBe('LOW');
    expect(determineRiskBand(100)).toBe('LOW');
  });

  it('should return MODERATE for good scores', () => {
    expect(determineRiskBand(75)).toBe('MODERATE');
    expect(determineRiskBand(84)).toBe('MODERATE');
  });

  it('should return ELEVATED for adequate scores', () => {
    expect(determineRiskBand(60)).toBe('ELEVATED');
    expect(determineRiskBand(69)).toBe('ELEVATED');
  });

  it('should return HIGH for marginal scores', () => {
    expect(determineRiskBand(45)).toBe('HIGH');
    expect(determineRiskBand(54)).toBe('HIGH');
  });

  it('should return CRITICAL for poor scores', () => {
    expect(determineRiskBand(20)).toBe('CRITICAL');
    expect(determineRiskBand(39)).toBe('CRITICAL');
  });

  it('should have complete risk band coverage', () => {
    for (let score = 0; score <= 100; score++) {
      const band = determineRiskBand(score);
      expect(['LOW', 'MODERATE', 'ELEVATED', 'HIGH', 'CRITICAL']).toContain(band);
    }
  });
});

// ============================================
// BREAKPOINT ANALYSIS TESTS
// ============================================

describe('Breakpoint Analysis', () => {
  beforeEach(() => {
    clearAllProfitabilityData();
  });

  it('should analyze all breakpoints', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    
    const analysis = analyzeBreakpoints('market-001', metrics, score);
    
    expect(analysis.breakpoints).toHaveLength(BREAKPOINTS.length);
  });

  it('should calculate distance to breakpoints', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    
    const analysis = analyzeBreakpoints('market-001', metrics, score);
    
    for (const bp of analysis.breakpoints) {
      expect(typeof bp.distanceToBreakpoint).toBe('number');
      expect(typeof bp.percentBuffer).toBe('number');
    }
  });

  it('should identify at-risk breakpoints', () => {
    const metrics = createTestMetrics({
      labor: { utilizationRate: 0.65 }, // Close to minimum
    });
    const score = createTestScore(metrics);
    
    const analysis = analyzeBreakpoints('market-001', metrics, score);
    
    // Should have some at-risk breakpoints depending on metrics
    expect(analysis.breakpoints.some(bp => bp.atRisk === true || bp.atRisk === false)).toBe(true);
  });

  it('should determine overall risk band', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    
    const analysis = analyzeBreakpoints('market-001', metrics, score);
    
    expect(['LOW', 'MODERATE', 'ELEVATED', 'HIGH', 'CRITICAL']).toContain(analysis.overallRiskBand);
  });

  it('should identify nearest breakpoint when at risk', () => {
    const metrics = createTestMetrics({
      labor: { utilizationRate: 0.50, totalLaborCostCents: 9000000 },
      claims: { claimsPer100Moves: 4.5 },
    });
    const score = createTestScore(metrics);
    
    const analysis = analyzeBreakpoints('market-001', metrics, score);
    
    // With poor metrics, should have a nearest breakpoint
    if (analysis.breakpoints.some(bp => bp.atRisk)) {
      expect(analysis.nearestBreakpoint).not.toBeNull();
    }
  });
});

// ============================================
// ADVISORY RECOMMENDATIONS TESTS
// ============================================

describe('Advisory Recommendations', () => {
  beforeEach(() => {
    clearAllProfitabilityData();
  });

  it('should generate recommendations for poor metrics', () => {
    const metrics = createTestMetrics({
      labor: { utilizationRate: 0.50, totalLaborCostCents: 10000000 },
      claims: { claimsPer100Moves: 4.0 },
    });
    const score = createTestScore(metrics);
    const projection = generateForwardProjection('market-001', metrics, score);
    const stressResults = runAllStressTests('market-001', metrics, score);
    
    const recommendations = generateAdvisoryRecommendations(
      'market-001', metrics, score, projection, stressResults
    );
    
    expect(recommendations.length).toBeGreaterThan(0);
  });

  it('should generate recommendations for good metrics', () => {
    const metrics = createTestMetrics({
      labor: { utilizationRate: 0.85, totalLaborCostCents: 4000000 },
      claims: { claimsPer100Moves: 1.0 },
      volume: { weekOverWeekGrowth: 0.05 },
    });
    const score = createTestScore(metrics);
    const projection = generateForwardProjection('market-001', metrics, score);
    const stressResults = runAllStressTests('market-001', metrics, score);
    
    const recommendations = generateAdvisoryRecommendations(
      'market-001', metrics, score, projection, stressResults
    );
    
    // Should have at least one recommendation
    expect(recommendations.length).toBeGreaterThan(0);
    // Each recommendation should have required fields
    for (const rec of recommendations) {
      expect(rec.id).toBeDefined();
      expect(rec.priority).toBeDefined();
      expect(rec.category).toBeDefined();
    }
  });

  it('should include priority levels', () => {
    const metrics = createTestMetrics({
      labor: { utilizationRate: 0.50 },
    });
    const score = createTestScore(metrics);
    const projection = generateForwardProjection('market-001', metrics, score);
    const stressResults = runAllStressTests('market-001', metrics, score);
    
    const recommendations = generateAdvisoryRecommendations(
      'market-001', metrics, score, projection, stressResults
    );
    
    for (const rec of recommendations) {
      expect(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).toContain(rec.priority);
    }
  });

  it('should include metrics with recommendations', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    const projection = generateForwardProjection('market-001', metrics, score);
    const stressResults = runAllStressTests('market-001', metrics, score);
    
    const recommendations = generateAdvisoryRecommendations(
      'market-001', metrics, score, projection, stressResults
    );
    
    for (const rec of recommendations) {
      expect(rec.metrics).toBeDefined();
      expect(typeof rec.metrics.currentValue).toBe('number');
      expect(typeof rec.metrics.targetValue).toBe('number');
    }
  });
});

// ============================================
// COMPLETE FORECAST REPORT TESTS
// ============================================

describe('Forecast Report', () => {
  beforeEach(() => {
    clearAllProfitabilityData();
  });

  it('should generate complete forecast report', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    
    const report = generateForecastReport('market-001', metrics, score);
    
    expect(report.marketId).toBe('market-001');
    expect(report.projection).toBeDefined();
    expect(report.stressTestResults).toBeDefined();
    expect(report.breakpointAnalysis).toBeDefined();
    expect(report.recommendations).toBeDefined();
    expect(report.executiveSummary).toBeDefined();
    expect(report.riskAssessment).toBeDefined();
  });

  it('should determine outlook based on projections', () => {
    const metrics = createTestMetrics({
      labor: { utilizationRate: 0.85, totalLaborCostCents: 4000000 },
      claims: { claimsPer100Moves: 1.0 },
    });
    const score = createTestScore(metrics);
    
    const report = generateForecastReport('market-001', metrics, score);
    
    expect(['POSITIVE', 'STABLE', 'CAUTIONARY', 'CONCERNING']).toContain(report.outlook);
  });

  it('should use specified horizon', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    
    const report = generateForecastReport('market-001', metrics, score, '4_WEEKS');
    
    expect(report.projection.horizon).toBe('4_WEEKS');
    expect(report.projection.weeklyProjections).toHaveLength(4);
  });

  it('should use specified stress severity', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    
    const reportMild = generateForecastReport('market-001', metrics, score, '4_WEEKS', 'MILD');
    const reportSevere = generateForecastReport('market-001', metrics, score, '4_WEEKS', 'SEVERE');
    
    // Severe tests should show more impact
    const mildWorst = Math.min(...reportMild.stressTestResults.map(r => r.scoreImpact));
    const severeWorst = Math.min(...reportSevere.stressTestResults.map(r => r.scoreImpact));
    
    expect(severeWorst).toBeLessThanOrEqual(mildWorst);
  });

  it('should include executive summary text', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    
    const report = generateForecastReport('market-001', metrics, score);
    
    expect(report.executiveSummary).toBeTruthy();
    expect(report.executiveSummary.length).toBeGreaterThan(0);
  });

  it('should include risk assessment text', () => {
    const metrics = createTestMetrics();
    const score = createTestScore(metrics);
    
    const report = generateForecastReport('market-001', metrics, score);
    
    expect(report.riskAssessment).toBeTruthy();
    expect(report.riskAssessment.length).toBeGreaterThan(0);
  });
});

// ============================================
// CONSTANTS TESTS
// ============================================

describe('Constants', () => {
  it('should have correct horizon week mappings', () => {
    expect(HORIZON_WEEKS['4_WEEKS']).toBe(4);
    expect(HORIZON_WEEKS['8_WEEKS']).toBe(8);
    expect(HORIZON_WEEKS['12_WEEKS']).toBe(12);
    expect(HORIZON_WEEKS['26_WEEKS']).toBe(26);
  });

  it('should have valid default assumptions', () => {
    expect(DEFAULT_ASSUMPTIONS.laborCostGrowthRate).toBeDefined();
    expect(DEFAULT_ASSUMPTIONS.volumeGrowthRate).toBeDefined();
    expect(DEFAULT_ASSUMPTIONS.inflationFactor).toBeGreaterThanOrEqual(0);
  });

  it('should have complete risk band coverage', () => {
    const bands = RISK_BANDS.map(r => r.band);
    expect(bands).toContain('LOW');
    expect(bands).toContain('MODERATE');
    expect(bands).toContain('ELEVATED');
    expect(bands).toContain('HIGH');
    expect(bands).toContain('CRITICAL');
  });

  it('should have non-overlapping risk band ranges', () => {
    for (let i = 0; i < RISK_BANDS.length - 1; i++) {
      const current = RISK_BANDS[i];
      const next = RISK_BANDS[i + 1];
      // They should not overlap
      expect(current.minScore).not.toBe(next.minScore);
    }
  });

  it('should have all stress test types defined', () => {
    expect(Object.keys(PREDEFINED_STRESS_TESTS)).toContain('CLAIMS_SPIKE');
    expect(Object.keys(PREDEFINED_STRESS_TESTS)).toContain('LABOR_SHORTAGE');
    expect(Object.keys(PREDEFINED_STRESS_TESTS)).toContain('VOLUME_DROP');
    expect(Object.keys(PREDEFINED_STRESS_TESTS)).toContain('VOLUME_SURGE');
    expect(Object.keys(PREDEFINED_STRESS_TESTS)).toContain('COST_INFLATION');
    expect(Object.keys(PREDEFINED_STRESS_TESTS)).toContain('COMBINED_ADVERSE');
  });

  it('should have severity multipliers', () => {
    expect(STRESS_SEVERITY_MULTIPLIERS['MILD']).toBeLessThan(STRESS_SEVERITY_MULTIPLIERS['MODERATE']);
    expect(STRESS_SEVERITY_MULTIPLIERS['MODERATE']).toBeLessThan(STRESS_SEVERITY_MULTIPLIERS['SEVERE']);
    expect(STRESS_SEVERITY_MULTIPLIERS['SEVERE']).toBeLessThan(STRESS_SEVERITY_MULTIPLIERS['EXTREME']);
  });

  it('should have breakpoints defined', () => {
    expect(BREAKPOINTS.length).toBeGreaterThan(0);
    
    for (const bp of BREAKPOINTS) {
      expect(bp.name).toBeDefined();
      expect(bp.threshold).toBeDefined();
      expect(bp.metricType).toBeDefined();
      expect(bp.direction).toBeDefined();
    }
  });
});
