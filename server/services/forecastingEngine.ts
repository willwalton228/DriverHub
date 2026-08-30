/**
 * Forecasting & Stress Testing Engine (INCREMENT 15)
 * 
 * Backend-only system for:
 * 1. Deterministic forward projections of labor cost, claims exposure, and profitability
 * 2. Scenario simulation engine (what-if analysis) without affecting live rules
 * 3. Predefined stress tests for claims spikes, labor shortages, and volume swings
 * 4. Risk bands, breakpoints, and advisory recommendations
 * 5. Read-only outputs only; no automatic enforcement
 * 
 * NOT implementing: ML models, automated rule changes, revenue forecasting
 */

import {
  type AggregatedMarketMetrics,
  type MarketProfitScore,
  type ProfitTier,
  type ThrottleAction,
  aggregateMarketMetrics,
  createLaborMetrics,
  createClaimsMetrics,
  createVolumeMetrics,
  determineProfitTier,
  PROFITABILITY_BENCHMARKS,
  SCORE_WEIGHTS,
} from './marketProfitabilityEngine';

// ============================================
// TYPES & CONSTANTS
// ============================================

/** Projection horizon */
export type ProjectionHorizon = '4_WEEKS' | '8_WEEKS' | '12_WEEKS' | '26_WEEKS';

/** Stress test type */
export type StressTestType = 
  | 'CLAIMS_SPIKE'
  | 'LABOR_SHORTAGE'
  | 'VOLUME_DROP'
  | 'VOLUME_SURGE'
  | 'COST_INFLATION'
  | 'COMBINED_ADVERSE';

/** Risk band level */
export type RiskBand = 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'CRITICAL';

/** Advisory priority */
export type AdvisoryPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

// ============================================
// FORWARD PROJECTION TYPES
// ============================================

/** Weekly projection data point */
export interface WeeklyProjection {
  weekNumber: number;
  weekStartDate: string;
  
  // Labor projections
  projectedLaborCostCents: number;
  projectedDriverCount: number;
  projectedUtilization: number;
  
  // Claims projections
  projectedClaimsCostCents: number;
  projectedClaimsPer100Moves: number;
  
  // Volume projections
  projectedMoves: number;
  projectedGrowthRate: number;
  
  // Derived metrics
  projectedCostPerMove: number;
  projectedProfitScore: number;
  projectedTier: ProfitTier;
}

/** Forward projection result */
export interface ForwardProjection {
  marketId: string;
  generatedAt: string;
  horizon: ProjectionHorizon;
  baselineDate: string;
  
  // Baseline metrics (current state)
  baseline: {
    laborCostCents: number;
    claimsCostCents: number;
    moves: number;
    profitScore: number;
    tier: ProfitTier;
  };
  
  // Weekly projections
  weeklyProjections: WeeklyProjection[];
  
  // Summary statistics
  summary: {
    avgProfitScore: number;
    minProfitScore: number;
    maxProfitScore: number;
    endingTier: ProfitTier;
    totalProjectedLaborCost: number;
    totalProjectedClaimsCost: number;
    totalProjectedMoves: number;
  };
  
  // Assumptions used
  assumptions: ProjectionAssumptions;
}

/** Projection assumptions */
export interface ProjectionAssumptions {
  laborCostGrowthRate: number;     // Weekly % change
  claimsGrowthRate: number;        // Weekly % change
  volumeGrowthRate: number;        // Weekly % change
  utilizationTrend: number;        // Weekly % change
  inflationFactor: number;         // Annual cost inflation
}

// ============================================
// STRESS TEST TYPES
// ============================================

/** Stress test parameters */
export interface StressTestParams {
  type: StressTestType;
  severity: 'MILD' | 'MODERATE' | 'SEVERE' | 'EXTREME';
  duration: number; // weeks
  rampUp: boolean;  // gradual or immediate
}

/** Stress test result */
export interface StressTestResult {
  marketId: string;
  testType: StressTestType;
  severity: string;
  executedAt: string;
  
  // Pre-stress state
  preStressScore: number;
  preStressTier: ProfitTier;
  
  // Post-stress state
  postStressScore: number;
  postStressTier: ProfitTier;
  scoreImpact: number;
  
  // Impact breakdown
  impactBreakdown: {
    laborEfficiencyImpact: number;
    claimsPerformanceImpact: number;
    utilizationImpact: number;
    volumeGrowthImpact: number;
  };
  
  // Throttle implications
  wouldTriggerThrottles: ThrottleAction[];
  
  // Recovery projection
  recoveryWeeks: number;
  recoveryPath: WeeklyProjection[];
  
  // Risk assessment
  riskBand: RiskBand;
  breakpointReached: boolean;
  breakpointDetails: string | null;
}

// ============================================
// RISK BANDS & BREAKPOINTS
// ============================================

/** Risk band definition */
export interface RiskBandDefinition {
  band: RiskBand;
  minScore: number;
  maxScore: number;
  description: string;
  implications: string[];
}

/** Breakpoint definition */
export interface Breakpoint {
  name: string;
  threshold: number;
  metricType: 'SCORE' | 'COST_PER_MOVE' | 'CLAIMS_RATE' | 'UTILIZATION';
  direction: 'ABOVE' | 'BELOW';
  consequence: string;
  throttleAction: ThrottleAction | null;
}

/** Breakpoint analysis result */
export interface BreakpointAnalysis {
  marketId: string;
  analyzedAt: string;
  currentScore: number;
  
  breakpoints: {
    breakpoint: Breakpoint;
    currentValue: number;
    distanceToBreakpoint: number;
    percentBuffer: number;
    weeksUntilBreakpoint: number | null;
    atRisk: boolean;
  }[];
  
  nearestBreakpoint: string | null;
  overallRiskBand: RiskBand;
}

// ============================================
// ADVISORY RECOMMENDATIONS
// ============================================

/** Advisory recommendation */
export interface AdvisoryRecommendation {
  id: string;
  marketId: string;
  generatedAt: string;
  priority: AdvisoryPriority;
  category: string;
  title: string;
  description: string;
  rationale: string;
  expectedImpact: string;
  timeframe: string;
  metrics: {
    currentValue: number;
    targetValue: number;
    unit: string;
  };
}

/** Forecast advisory report */
export interface ForecastAdvisoryReport {
  marketId: string;
  generatedAt: string;
  
  projection: ForwardProjection;
  stressTestResults: StressTestResult[];
  breakpointAnalysis: BreakpointAnalysis;
  recommendations: AdvisoryRecommendation[];
  
  executiveSummary: string;
  riskAssessment: string;
  outlook: 'POSITIVE' | 'STABLE' | 'CAUTIONARY' | 'CONCERNING';
}

// ============================================
// CONSTANTS
// ============================================

/** Horizon weeks mapping */
export const HORIZON_WEEKS: Record<ProjectionHorizon, number> = {
  '4_WEEKS': 4,
  '8_WEEKS': 8,
  '12_WEEKS': 12,
  '26_WEEKS': 26,
};

/** Default projection assumptions */
export const DEFAULT_ASSUMPTIONS: ProjectionAssumptions = {
  laborCostGrowthRate: 0.005,     // 0.5% weekly
  claimsGrowthRate: 0.0,          // Stable claims
  volumeGrowthRate: 0.02,         // 2% weekly growth
  utilizationTrend: 0.0,          // Stable utilization
  inflationFactor: 0.03,          // 3% annual inflation
};

/** Risk band definitions */
export const RISK_BANDS: RiskBandDefinition[] = [
  {
    band: 'LOW',
    minScore: 85,
    maxScore: 100,
    description: 'Excellent profitability with minimal risk',
    implications: ['Maintain current strategy', 'Consider expansion opportunities'],
  },
  {
    band: 'MODERATE',
    minScore: 70,
    maxScore: 84,
    description: 'Good profitability with manageable risks',
    implications: ['Monitor key metrics', 'Address minor inefficiencies'],
  },
  {
    band: 'ELEVATED',
    minScore: 55,
    maxScore: 69,
    description: 'Adequate profitability but requires attention',
    implications: ['Implement cost controls', 'Review operational efficiency'],
  },
  {
    band: 'HIGH',
    minScore: 40,
    maxScore: 54,
    description: 'Marginal profitability with significant risks',
    implications: ['Immediate action required', 'Cost reduction initiatives'],
  },
  {
    band: 'CRITICAL',
    minScore: 0,
    maxScore: 39,
    description: 'Poor profitability threatening viability',
    implications: ['Emergency intervention', 'Consider market restructuring'],
  },
];

/** Predefined breakpoints */
export const BREAKPOINTS: Breakpoint[] = [
  {
    name: 'HIRING_FREEZE_THRESHOLD',
    threshold: 25,
    metricType: 'SCORE',
    direction: 'BELOW',
    consequence: 'Complete freeze on new hiring',
    throttleAction: 'HIRING_FREEZE',
  },
  {
    name: 'HIRING_LIMIT_THRESHOLD',
    threshold: 40,
    metricType: 'SCORE',
    direction: 'BELOW',
    consequence: 'Hiring limited to replacement only',
    throttleAction: 'HIRING_LIMIT',
  },
  {
    name: 'RATE_CAP_THRESHOLD',
    threshold: 35,
    metricType: 'SCORE',
    direction: 'BELOW',
    consequence: 'Rate increases capped',
    throttleAction: 'RATE_CAP',
  },
  {
    name: 'COST_PER_MOVE_CRITICAL',
    threshold: 10000,
    metricType: 'COST_PER_MOVE',
    direction: 'ABOVE',
    consequence: 'Cost per move exceeds maximum threshold',
    throttleAction: 'ENHANCED_REVIEW',
  },
  {
    name: 'CLAIMS_RATE_CRITICAL',
    threshold: 5.0,
    metricType: 'CLAIMS_RATE',
    direction: 'ABOVE',
    consequence: 'Claims rate exceeds safety threshold',
    throttleAction: 'ENHANCED_REVIEW',
  },
  {
    name: 'UTILIZATION_MINIMUM',
    threshold: 0.60,
    metricType: 'UTILIZATION',
    direction: 'BELOW',
    consequence: 'Utilization below minimum viable level',
    throttleAction: 'CAPACITY_REDUCTION',
  },
];

/** Stress test severity multipliers */
export const STRESS_SEVERITY_MULTIPLIERS: Record<string, number> = {
  'MILD': 1.25,
  'MODERATE': 1.50,
  'SEVERE': 2.0,
  'EXTREME': 3.0,
};

// ============================================
// FORWARD PROJECTION ENGINE
// ============================================

/**
 * Generate forward projections for a market.
 */
export function generateForwardProjection(
  marketId: string,
  currentMetrics: AggregatedMarketMetrics,
  currentScore: MarketProfitScore,
  horizon: ProjectionHorizon = '12_WEEKS',
  assumptions: ProjectionAssumptions = DEFAULT_ASSUMPTIONS
): ForwardProjection {
  const weeks = HORIZON_WEEKS[horizon];
  const weeklyProjections: WeeklyProjection[] = [];
  
  // Extract baseline values
  let laborCost = currentMetrics.labor.totalLaborCostCents;
  let claimsCost = currentMetrics.claims.totalIncurredCents;
  let moves = currentMetrics.volume.completedMoves;
  let utilization = currentMetrics.labor.utilizationRate;
  let driverCount = currentMetrics.labor.totalDriverCount;
  let claimsRate = currentMetrics.claims.claimsPer100Moves;
  let growthRate = currentMetrics.volume.weekOverWeekGrowth;
  
  const baseDate = new Date();
  
  // Weekly inflation factor
  const weeklyInflation = Math.pow(1 + assumptions.inflationFactor, 1/52) - 1;
  
  for (let week = 1; week <= weeks; week++) {
    // Apply growth rates
    laborCost *= (1 + assumptions.laborCostGrowthRate + weeklyInflation);
    claimsCost *= (1 + assumptions.claimsGrowthRate);
    moves *= (1 + assumptions.volumeGrowthRate);
    utilization = Math.min(1.0, Math.max(0, utilization + assumptions.utilizationTrend));
    
    // Calculate derived metrics
    const costPerMove = (laborCost + claimsCost) / Math.max(moves, 1);
    
    // Calculate projected profit score
    const projectedScore = calculateSimpleScore(
      costPerMove,
      claimsRate,
      utilization,
      growthRate
    );
    
    const projectedTier = determineProfitTier(projectedScore);
    
    const weekStart = new Date(baseDate);
    weekStart.setDate(weekStart.getDate() + (week * 7));
    
    weeklyProjections.push({
      weekNumber: week,
      weekStartDate: weekStart.toISOString().split('T')[0],
      projectedLaborCostCents: Math.round(laborCost),
      projectedDriverCount: driverCount,
      projectedUtilization: utilization,
      projectedClaimsCostCents: Math.round(claimsCost),
      projectedClaimsPer100Moves: claimsRate,
      projectedMoves: Math.round(moves),
      projectedGrowthRate: assumptions.volumeGrowthRate,
      projectedCostPerMove: Math.round(costPerMove),
      projectedProfitScore: projectedScore,
      projectedTier,
    });
  }
  
  // Calculate summary statistics
  const scores = weeklyProjections.map(w => w.projectedProfitScore);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  
  return {
    marketId,
    generatedAt: new Date().toISOString(),
    horizon,
    baselineDate: baseDate.toISOString().split('T')[0],
    baseline: {
      laborCostCents: currentMetrics.labor.totalLaborCostCents,
      claimsCostCents: currentMetrics.claims.totalIncurredCents,
      moves: currentMetrics.volume.completedMoves,
      profitScore: currentScore.score,
      tier: currentScore.tier,
    },
    weeklyProjections,
    summary: {
      avgProfitScore: Math.round(avgScore),
      minProfitScore: Math.min(...scores),
      maxProfitScore: Math.max(...scores),
      endingTier: weeklyProjections[weeklyProjections.length - 1].projectedTier,
      totalProjectedLaborCost: weeklyProjections.reduce((sum, w) => sum + w.projectedLaborCostCents, 0),
      totalProjectedClaimsCost: weeklyProjections.reduce((sum, w) => sum + w.projectedClaimsCostCents, 0),
      totalProjectedMoves: weeklyProjections.reduce((sum, w) => sum + w.projectedMoves, 0),
    },
    assumptions,
  };
}

/**
 * Calculate a simple profit score from metrics (for projections).
 */
function calculateSimpleScore(
  costPerMove: number,
  claimsRate: number,
  utilization: number,
  growthRate: number
): number {
  const { targetCostPerMoveCents, maxCostPerMoveCents, targetClaimsPer100Moves, maxClaimsPer100Moves,
    targetUtilization, minAcceptableUtilization, targetGrowthRate, minAcceptableGrowthRate } = PROFITABILITY_BENCHMARKS;
  
  // Labor efficiency score
  let laborScore: number;
  if (costPerMove <= targetCostPerMoveCents) {
    laborScore = 100 - ((costPerMove / targetCostPerMoveCents) * 20);
  } else if (costPerMove >= maxCostPerMoveCents) {
    laborScore = 0;
  } else {
    laborScore = 80 * (1 - (costPerMove - targetCostPerMoveCents) / (maxCostPerMoveCents - targetCostPerMoveCents));
  }
  
  // Claims score
  let claimsScore: number;
  if (claimsRate <= targetClaimsPer100Moves) {
    claimsScore = 100 - ((claimsRate / targetClaimsPer100Moves) * 20);
  } else if (claimsRate >= maxClaimsPer100Moves) {
    claimsScore = 0;
  } else {
    claimsScore = 80 * (1 - (claimsRate - targetClaimsPer100Moves) / (maxClaimsPer100Moves - targetClaimsPer100Moves));
  }
  
  // Utilization score
  let utilizationScore: number;
  if (utilization >= targetUtilization) {
    utilizationScore = Math.max(60, 100 - ((utilization - targetUtilization) * 100));
  } else if (utilization <= minAcceptableUtilization) {
    utilizationScore = 20 * (utilization / minAcceptableUtilization);
  } else {
    utilizationScore = 20 + 65 * ((utilization - minAcceptableUtilization) / (targetUtilization - minAcceptableUtilization));
  }
  
  // Volume growth score
  let growthScore: number;
  if (growthRate >= targetGrowthRate) {
    growthScore = Math.min(100, 80 + ((growthRate - targetGrowthRate) * 200));
  } else if (growthRate <= minAcceptableGrowthRate) {
    growthScore = 0;
  } else {
    growthScore = 80 * ((growthRate - minAcceptableGrowthRate) / (targetGrowthRate - minAcceptableGrowthRate));
  }
  
  // Weighted score
  const score = Math.round(
    laborScore * SCORE_WEIGHTS.laborEfficiency +
    claimsScore * SCORE_WEIGHTS.claimsPerformance +
    utilizationScore * SCORE_WEIGHTS.utilization +
    growthScore * SCORE_WEIGHTS.volumeGrowth
  );
  
  return Math.max(0, Math.min(100, score));
}

// ============================================
// STRESS TEST ENGINE
// ============================================

/** Predefined stress test configurations */
export const PREDEFINED_STRESS_TESTS: Record<StressTestType, {
  name: string;
  description: string;
  impacts: {
    claimsMultiplier: number;
    laborCostMultiplier: number;
    volumeMultiplier: number;
    utilizationDelta: number;
  };
}> = {
  'CLAIMS_SPIKE': {
    name: 'Claims Spike',
    description: 'Sudden increase in claims frequency and severity',
    impacts: { claimsMultiplier: 2.0, laborCostMultiplier: 1.0, volumeMultiplier: 1.0, utilizationDelta: 0 },
  },
  'LABOR_SHORTAGE': {
    name: 'Labor Shortage',
    description: 'Reduced driver availability and increased labor costs',
    impacts: { claimsMultiplier: 1.0, laborCostMultiplier: 1.5, volumeMultiplier: 0.85, utilizationDelta: -0.15 },
  },
  'VOLUME_DROP': {
    name: 'Volume Drop',
    description: 'Significant decrease in move volume',
    impacts: { claimsMultiplier: 1.0, laborCostMultiplier: 1.0, volumeMultiplier: 0.7, utilizationDelta: -0.20 },
  },
  'VOLUME_SURGE': {
    name: 'Volume Surge',
    description: 'Rapid increase in demand exceeding capacity',
    impacts: { claimsMultiplier: 1.3, laborCostMultiplier: 1.25, volumeMultiplier: 1.5, utilizationDelta: 0.15 },
  },
  'COST_INFLATION': {
    name: 'Cost Inflation',
    description: 'General increase in operating costs',
    impacts: { claimsMultiplier: 1.2, laborCostMultiplier: 1.4, volumeMultiplier: 1.0, utilizationDelta: 0 },
  },
  'COMBINED_ADVERSE': {
    name: 'Combined Adverse Scenario',
    description: 'Multiple negative factors occurring simultaneously',
    impacts: { claimsMultiplier: 1.5, laborCostMultiplier: 1.3, volumeMultiplier: 0.8, utilizationDelta: -0.10 },
  },
};

/**
 * Run a stress test on market metrics.
 */
export function runStressTest(
  marketId: string,
  currentMetrics: AggregatedMarketMetrics,
  currentScore: MarketProfitScore,
  params: StressTestParams
): StressTestResult {
  const testConfig = PREDEFINED_STRESS_TESTS[params.type];
  const severityMultiplier = STRESS_SEVERITY_MULTIPLIERS[params.severity];
  
  // Apply stress multipliers
  const stressedLabor = createLaborMetrics(marketId, '', '', {
    ...currentMetrics.labor,
    totalLaborCostCents: Math.round(
      currentMetrics.labor.totalLaborCostCents * 
      Math.pow(testConfig.impacts.laborCostMultiplier, severityMultiplier - 1) * 
      testConfig.impacts.laborCostMultiplier
    ),
    utilizationRate: Math.max(0, Math.min(1, 
      currentMetrics.labor.utilizationRate + 
      (testConfig.impacts.utilizationDelta * severityMultiplier)
    )),
  });
  
  const stressedClaims = createClaimsMetrics(marketId, '', '', {
    ...currentMetrics.claims,
    claimsPer100Moves: currentMetrics.claims.claimsPer100Moves * 
      Math.pow(testConfig.impacts.claimsMultiplier, severityMultiplier - 1) * 
      testConfig.impacts.claimsMultiplier,
    totalIncurredCents: Math.round(
      currentMetrics.claims.totalIncurredCents * 
      Math.pow(testConfig.impacts.claimsMultiplier, severityMultiplier - 1) * 
      testConfig.impacts.claimsMultiplier
    ),
  });
  
  const stressedVolume = createVolumeMetrics(marketId, '', '', {
    ...currentMetrics.volume,
    completedMoves: Math.round(
      currentMetrics.volume.completedMoves * 
      testConfig.impacts.volumeMultiplier
    ),
    weekOverWeekGrowth: testConfig.impacts.volumeMultiplier > 1 
      ? currentMetrics.volume.weekOverWeekGrowth + 0.05 
      : currentMetrics.volume.weekOverWeekGrowth - 0.05,
  });
  
  // Aggregate stressed metrics
  const stressedMetrics = aggregateMarketMetrics(stressedLabor, stressedClaims, stressedVolume);
  
  // Calculate stressed score
  const stressedScore = calculateSimpleScore(
    stressedMetrics.costPerMove,
    stressedClaims.claimsPer100Moves,
    stressedLabor.utilizationRate,
    stressedVolume.weekOverWeekGrowth
  );
  const stressedTier = determineProfitTier(stressedScore);
  
  // Calculate impact breakdown
  const laborImpact = calculateSimpleScore(
    stressedMetrics.costPerMove,
    currentMetrics.claims.claimsPer100Moves,
    currentMetrics.labor.utilizationRate,
    currentMetrics.volume.weekOverWeekGrowth
  ) - currentScore.score;
  
  const claimsImpact = calculateSimpleScore(
    currentMetrics.costPerMove,
    stressedClaims.claimsPer100Moves,
    currentMetrics.labor.utilizationRate,
    currentMetrics.volume.weekOverWeekGrowth
  ) - currentScore.score;
  
  const utilizationImpact = calculateSimpleScore(
    currentMetrics.costPerMove,
    currentMetrics.claims.claimsPer100Moves,
    stressedLabor.utilizationRate,
    currentMetrics.volume.weekOverWeekGrowth
  ) - currentScore.score;
  
  const volumeImpact = calculateSimpleScore(
    currentMetrics.costPerMove,
    currentMetrics.claims.claimsPer100Moves,
    currentMetrics.labor.utilizationRate,
    stressedVolume.weekOverWeekGrowth
  ) - currentScore.score;
  
  // Determine throttles that would be triggered
  const wouldTriggerThrottles: ThrottleAction[] = [];
  if (stressedScore < 25) wouldTriggerThrottles.push('HIRING_FREEZE');
  if (stressedScore < 40) wouldTriggerThrottles.push('HIRING_LIMIT');
  if (stressedScore < 35) wouldTriggerThrottles.push('RATE_CAP');
  if (stressedScore < 30) wouldTriggerThrottles.push('EXPANSION_HOLD');
  if (stressedScore < 55) wouldTriggerThrottles.push('ENHANCED_REVIEW');
  
  // Calculate recovery projection
  const recoveryPath = generateRecoveryProjection(
    marketId,
    stressedMetrics,
    stressedScore,
    currentScore.score
  );
  const recoveryWeeks = recoveryPath.length;
  
  // Determine risk band
  const riskBand = determineRiskBand(stressedScore);
  
  // Check if breakpoint reached
  const breakpointReached = stressedScore < 25 || 
    stressedMetrics.costPerMove > PROFITABILITY_BENCHMARKS.maxCostPerMoveCents ||
    stressedClaims.claimsPer100Moves > PROFITABILITY_BENCHMARKS.maxClaimsPer100Moves;
  
  let breakpointDetails: string | null = null;
  if (stressedScore < 25) {
    breakpointDetails = 'Critical profit score threshold breached';
  } else if (stressedMetrics.costPerMove > PROFITABILITY_BENCHMARKS.maxCostPerMoveCents) {
    breakpointDetails = 'Maximum cost per move exceeded';
  } else if (stressedClaims.claimsPer100Moves > PROFITABILITY_BENCHMARKS.maxClaimsPer100Moves) {
    breakpointDetails = 'Maximum claims rate exceeded';
  }
  
  return {
    marketId,
    testType: params.type,
    severity: params.severity,
    executedAt: new Date().toISOString(),
    preStressScore: currentScore.score,
    preStressTier: currentScore.tier,
    postStressScore: stressedScore,
    postStressTier: stressedTier,
    scoreImpact: stressedScore - currentScore.score,
    impactBreakdown: {
      laborEfficiencyImpact: laborImpact,
      claimsPerformanceImpact: claimsImpact,
      utilizationImpact,
      volumeGrowthImpact: volumeImpact,
    },
    wouldTriggerThrottles,
    recoveryWeeks,
    recoveryPath,
    riskBand,
    breakpointReached,
    breakpointDetails,
  };
}

/**
 * Generate recovery projection from stressed state.
 */
function generateRecoveryProjection(
  marketId: string,
  stressedMetrics: AggregatedMarketMetrics,
  stressedScore: number,
  targetScore: number
): WeeklyProjection[] {
  const recoveryPath: WeeklyProjection[] = [];
  let currentScore = stressedScore;
  let laborCost = stressedMetrics.labor.totalLaborCostCents;
  let claimsCost = stressedMetrics.claims.totalIncurredCents;
  let moves = stressedMetrics.volume.completedMoves;
  let utilization = stressedMetrics.labor.utilizationRate;
  let week = 0;
  
  // Recovery rate: improve ~3-5 points per week
  const recoveryRate = 0.03; // 3% improvement per week
  
  while (currentScore < targetScore && week < 52) {
    week++;
    
    // Gradual recovery
    laborCost *= (1 - recoveryRate * 0.5);
    claimsCost *= (1 - recoveryRate * 0.3);
    utilization = Math.min(0.85, utilization + 0.02);
    
    const costPerMove = (laborCost + claimsCost) / Math.max(moves, 1);
    currentScore = calculateSimpleScore(
      costPerMove,
      stressedMetrics.claims.claimsPer100Moves * Math.pow(0.95, week),
      utilization,
      0.02
    );
    
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() + (week * 7));
    
    recoveryPath.push({
      weekNumber: week,
      weekStartDate: weekStart.toISOString().split('T')[0],
      projectedLaborCostCents: Math.round(laborCost),
      projectedDriverCount: stressedMetrics.labor.totalDriverCount,
      projectedUtilization: utilization,
      projectedClaimsCostCents: Math.round(claimsCost),
      projectedClaimsPer100Moves: stressedMetrics.claims.claimsPer100Moves * Math.pow(0.95, week),
      projectedMoves: moves,
      projectedGrowthRate: 0.02,
      projectedCostPerMove: Math.round(costPerMove),
      projectedProfitScore: currentScore,
      projectedTier: determineProfitTier(currentScore),
    });
    
    if (currentScore >= targetScore) break;
  }
  
  return recoveryPath;
}

/**
 * Run all predefined stress tests.
 */
export function runAllStressTests(
  marketId: string,
  currentMetrics: AggregatedMarketMetrics,
  currentScore: MarketProfitScore,
  severity: 'MILD' | 'MODERATE' | 'SEVERE' | 'EXTREME' = 'MODERATE'
): StressTestResult[] {
  const results: StressTestResult[] = [];
  
  for (const testType of Object.keys(PREDEFINED_STRESS_TESTS) as StressTestType[]) {
    const result = runStressTest(marketId, currentMetrics, currentScore, {
      type: testType,
      severity,
      duration: 4,
      rampUp: false,
    });
    results.push(result);
  }
  
  return results;
}

// ============================================
// RISK BANDS & BREAKPOINTS
// ============================================

/**
 * Determine risk band from profit score.
 */
export function determineRiskBand(score: number): RiskBand {
  for (const band of RISK_BANDS) {
    if (score >= band.minScore && score <= band.maxScore) {
      return band.band;
    }
  }
  return 'CRITICAL';
}

/**
 * Analyze breakpoints for a market.
 */
export function analyzeBreakpoints(
  marketId: string,
  currentMetrics: AggregatedMarketMetrics,
  currentScore: MarketProfitScore,
  projection?: ForwardProjection
): BreakpointAnalysis {
  const breakpointResults = BREAKPOINTS.map(bp => {
    let currentValue: number;
    let distanceToBreakpoint: number;
    let atRisk: boolean;
    
    switch (bp.metricType) {
      case 'SCORE':
        currentValue = currentScore.score;
        distanceToBreakpoint = bp.direction === 'BELOW' 
          ? currentValue - bp.threshold 
          : bp.threshold - currentValue;
        atRisk = bp.direction === 'BELOW' 
          ? currentValue < bp.threshold + 10 
          : currentValue > bp.threshold - 10;
        break;
      case 'COST_PER_MOVE':
        currentValue = currentMetrics.costPerMove;
        distanceToBreakpoint = bp.direction === 'ABOVE' 
          ? bp.threshold - currentValue 
          : currentValue - bp.threshold;
        atRisk = bp.direction === 'ABOVE' 
          ? currentValue > bp.threshold * 0.8 
          : currentValue < bp.threshold * 1.2;
        break;
      case 'CLAIMS_RATE':
        currentValue = currentMetrics.claims.claimsPer100Moves;
        distanceToBreakpoint = bp.direction === 'ABOVE' 
          ? bp.threshold - currentValue 
          : currentValue - bp.threshold;
        atRisk = bp.direction === 'ABOVE' 
          ? currentValue > bp.threshold * 0.8 
          : currentValue < bp.threshold * 1.2;
        break;
      case 'UTILIZATION':
        currentValue = currentMetrics.labor.utilizationRate;
        distanceToBreakpoint = bp.direction === 'BELOW' 
          ? currentValue - bp.threshold 
          : bp.threshold - currentValue;
        atRisk = bp.direction === 'BELOW' 
          ? currentValue < bp.threshold + 0.10 
          : currentValue > bp.threshold - 0.10;
        break;
      default:
        currentValue = 0;
        distanceToBreakpoint = 0;
        atRisk = false;
    }
    
    const percentBuffer = Math.abs(distanceToBreakpoint / bp.threshold) * 100;
    
    // Estimate weeks until breakpoint (if applicable from projection)
    let weeksUntilBreakpoint: number | null = null;
    if (projection && atRisk) {
      for (let i = 0; i < projection.weeklyProjections.length; i++) {
        const week = projection.weeklyProjections[i];
        if (bp.metricType === 'SCORE' && bp.direction === 'BELOW' && week.projectedProfitScore < bp.threshold) {
          weeksUntilBreakpoint = i + 1;
          break;
        }
      }
    }
    
    return {
      breakpoint: bp,
      currentValue,
      distanceToBreakpoint,
      percentBuffer: Math.round(percentBuffer * 10) / 10,
      weeksUntilBreakpoint,
      atRisk,
    };
  });
  
  // Find nearest breakpoint
  const atRiskBreakpoints = breakpointResults.filter(br => br.atRisk);
  const nearestBreakpoint = atRiskBreakpoints.length > 0 
    ? atRiskBreakpoints.sort((a, b) => a.distanceToBreakpoint - b.distanceToBreakpoint)[0].breakpoint.name 
    : null;
  
  return {
    marketId,
    analyzedAt: new Date().toISOString(),
    currentScore: currentScore.score,
    breakpoints: breakpointResults,
    nearestBreakpoint,
    overallRiskBand: determineRiskBand(currentScore.score),
  };
}

// ============================================
// ADVISORY RECOMMENDATIONS
// ============================================

/**
 * Generate advisory recommendations based on analysis.
 */
export function generateAdvisoryRecommendations(
  marketId: string,
  currentMetrics: AggregatedMarketMetrics,
  currentScore: MarketProfitScore,
  projection: ForwardProjection,
  stressResults: StressTestResult[]
): AdvisoryRecommendation[] {
  const recommendations: AdvisoryRecommendation[] = [];
  let idCounter = 1;
  
  const generateId = () => `adv-${marketId}-${idCounter++}`;
  
  // Labor efficiency recommendations
  if (currentScore.laborEfficiencyScore < 60) {
    recommendations.push({
      id: generateId(),
      marketId,
      generatedAt: new Date().toISOString(),
      priority: currentScore.laborEfficiencyScore < 40 ? 'URGENT' : 'HIGH',
      category: 'Labor Efficiency',
      title: 'Reduce Cost Per Move',
      description: 'Implement scheduling optimization to reduce labor costs',
      rationale: `Current cost per move (${formatCurrency(currentMetrics.costPerMove)}) exceeds target`,
      expectedImpact: '10-15% reduction in labor costs',
      timeframe: '4-8 weeks',
      metrics: {
        currentValue: currentMetrics.costPerMove,
        targetValue: PROFITABILITY_BENCHMARKS.targetCostPerMoveCents,
        unit: 'cents',
      },
    });
  }
  
  // Claims recommendations
  if (currentScore.claimsPerformanceScore < 60) {
    recommendations.push({
      id: generateId(),
      marketId,
      generatedAt: new Date().toISOString(),
      priority: currentScore.claimsPerformanceScore < 40 ? 'URGENT' : 'HIGH',
      category: 'Safety & Claims',
      title: 'Reduce Claims Rate',
      description: 'Implement enhanced driver safety training program',
      rationale: `Claims rate (${currentMetrics.claims.claimsPer100Moves.toFixed(2)}/100 moves) exceeds target`,
      expectedImpact: '20-30% reduction in claims frequency',
      timeframe: '8-12 weeks',
      metrics: {
        currentValue: currentMetrics.claims.claimsPer100Moves,
        targetValue: PROFITABILITY_BENCHMARKS.targetClaimsPer100Moves,
        unit: 'claims per 100 moves',
      },
    });
  }
  
  // Utilization recommendations
  if (currentScore.utilizationScore < 60) {
    recommendations.push({
      id: generateId(),
      marketId,
      generatedAt: new Date().toISOString(),
      priority: 'MEDIUM',
      category: 'Capacity Planning',
      title: 'Improve Driver Utilization',
      description: 'Optimize dispatch and routing to increase driver utilization',
      rationale: `Utilization (${(currentMetrics.labor.utilizationRate * 100).toFixed(1)}%) below target`,
      expectedImpact: '10-15% improvement in utilization',
      timeframe: '4-6 weeks',
      metrics: {
        currentValue: currentMetrics.labor.utilizationRate,
        targetValue: PROFITABILITY_BENCHMARKS.targetUtilization,
        unit: 'rate',
      },
    });
  }
  
  // Volume growth recommendations
  if (currentScore.volumeGrowthScore < 50) {
    recommendations.push({
      id: generateId(),
      marketId,
      generatedAt: new Date().toISOString(),
      priority: 'MEDIUM',
      category: 'Growth',
      title: 'Improve Volume Growth',
      description: 'Focus on customer retention and market expansion',
      rationale: `Week-over-week growth (${(currentMetrics.volume.weekOverWeekGrowth * 100).toFixed(1)}%) below target`,
      expectedImpact: '5-10% improvement in weekly volume',
      timeframe: '8-12 weeks',
      metrics: {
        currentValue: currentMetrics.volume.weekOverWeekGrowth,
        targetValue: PROFITABILITY_BENCHMARKS.targetGrowthRate,
        unit: 'rate',
      },
    });
  }
  
  // Stress test vulnerability recommendations
  const vulnerableTests = stressResults.filter(r => r.scoreImpact < -20);
  if (vulnerableTests.length > 0) {
    const worstTest = vulnerableTests.sort((a, b) => a.scoreImpact - b.scoreImpact)[0];
    recommendations.push({
      id: generateId(),
      marketId,
      generatedAt: new Date().toISOString(),
      priority: 'HIGH',
      category: 'Risk Mitigation',
      title: `Build Resilience to ${PREDEFINED_STRESS_TESTS[worstTest.testType].name}`,
      description: `Market is vulnerable to ${worstTest.testType.toLowerCase().replace('_', ' ')} scenarios`,
      rationale: `Stress test shows ${Math.abs(worstTest.scoreImpact)} point score drop`,
      expectedImpact: 'Improved resilience to adverse conditions',
      timeframe: '12-16 weeks',
      metrics: {
        currentValue: worstTest.postStressScore,
        targetValue: worstTest.preStressScore,
        unit: 'profit score',
      },
    });
  }
  
  // Projection trend recommendations
  if (projection.summary.endingTier === 'POOR' || projection.summary.endingTier === 'CRITICAL') {
    recommendations.push({
      id: generateId(),
      marketId,
      generatedAt: new Date().toISOString(),
      priority: 'URGENT',
      category: 'Strategic Planning',
      title: 'Address Projected Profitability Decline',
      description: 'Current trajectory leads to concerning profitability levels',
      rationale: `Projected ending tier is ${projection.summary.endingTier}`,
      expectedImpact: 'Stabilize profitability trajectory',
      timeframe: '4-8 weeks',
      metrics: {
        currentValue: currentScore.score,
        targetValue: 55,
        unit: 'profit score',
      },
    });
  }
  
  // If no major issues, add maintenance recommendation
  if (recommendations.length === 0) {
    recommendations.push({
      id: generateId(),
      marketId,
      generatedAt: new Date().toISOString(),
      priority: 'LOW',
      category: 'Maintenance',
      title: 'Maintain Current Performance',
      description: 'Continue monitoring key metrics and maintain operational standards',
      rationale: 'Market is performing well with no immediate concerns',
      expectedImpact: 'Sustained profitability',
      timeframe: 'Ongoing',
      metrics: {
        currentValue: currentScore.score,
        targetValue: currentScore.score,
        unit: 'profit score',
      },
    });
  }
  
  return recommendations;
}

/**
 * Format cents to currency.
 */
function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ============================================
// COMPLETE FORECAST REPORT
// ============================================

/**
 * Generate complete forecast advisory report.
 */
export function generateForecastReport(
  marketId: string,
  currentMetrics: AggregatedMarketMetrics,
  currentScore: MarketProfitScore,
  horizon: ProjectionHorizon = '12_WEEKS',
  stressSeverity: 'MILD' | 'MODERATE' | 'SEVERE' | 'EXTREME' = 'MODERATE'
): ForecastAdvisoryReport {
  // Generate forward projection
  const projection = generateForwardProjection(marketId, currentMetrics, currentScore, horizon);
  
  // Run all stress tests
  const stressTestResults = runAllStressTests(marketId, currentMetrics, currentScore, stressSeverity);
  
  // Analyze breakpoints
  const breakpointAnalysis = analyzeBreakpoints(marketId, currentMetrics, currentScore, projection);
  
  // Generate recommendations
  const recommendations = generateAdvisoryRecommendations(
    marketId, currentMetrics, currentScore, projection, stressTestResults
  );
  
  // Determine outlook
  let outlook: 'POSITIVE' | 'STABLE' | 'CAUTIONARY' | 'CONCERNING';
  if (projection.summary.avgProfitScore >= 70 && !breakpointAnalysis.nearestBreakpoint) {
    outlook = 'POSITIVE';
  } else if (projection.summary.avgProfitScore >= 55) {
    outlook = 'STABLE';
  } else if (projection.summary.avgProfitScore >= 40) {
    outlook = 'CAUTIONARY';
  } else {
    outlook = 'CONCERNING';
  }
  
  // Generate executive summary
  const executiveSummary = generateExecutiveSummaryText(
    currentScore, projection, stressTestResults, breakpointAnalysis, outlook
  );
  
  // Generate risk assessment
  const riskAssessment = generateRiskAssessmentText(breakpointAnalysis, stressTestResults);
  
  return {
    marketId,
    generatedAt: new Date().toISOString(),
    projection,
    stressTestResults,
    breakpointAnalysis,
    recommendations,
    executiveSummary,
    riskAssessment,
    outlook,
  };
}

/**
 * Generate executive summary text.
 */
function generateExecutiveSummaryText(
  currentScore: MarketProfitScore,
  projection: ForwardProjection,
  stressResults: StressTestResult[],
  breakpointAnalysis: BreakpointAnalysis,
  outlook: string
): string {
  const lines: string[] = [];
  
  lines.push(`Market ${currentScore.marketId} Current State: Score ${currentScore.score} (${currentScore.tier})`);
  lines.push(`${projection.horizon.replace('_', ' ')} Outlook: ${outlook}`);
  lines.push(`Projected Average Score: ${projection.summary.avgProfitScore}`);
  lines.push(`Risk Band: ${breakpointAnalysis.overallRiskBand}`);
  
  const vulnerableTests = stressResults.filter(r => r.scoreImpact < -15);
  if (vulnerableTests.length > 0) {
    lines.push(`Stress Vulnerabilities: ${vulnerableTests.map(t => t.testType).join(', ')}`);
  }
  
  if (breakpointAnalysis.nearestBreakpoint) {
    lines.push(`Nearest Breakpoint: ${breakpointAnalysis.nearestBreakpoint}`);
  }
  
  return lines.join('\n');
}

/**
 * Generate risk assessment text.
 */
function generateRiskAssessmentText(
  breakpointAnalysis: BreakpointAnalysis,
  stressResults: StressTestResult[]
): string {
  const lines: string[] = [];
  
  lines.push(`Overall Risk Band: ${breakpointAnalysis.overallRiskBand}`);
  
  const atRiskBreakpoints = breakpointAnalysis.breakpoints.filter(b => b.atRisk);
  if (atRiskBreakpoints.length > 0) {
    lines.push(`At-Risk Breakpoints: ${atRiskBreakpoints.length}`);
    for (const bp of atRiskBreakpoints) {
      lines.push(`  - ${bp.breakpoint.name}: ${bp.percentBuffer}% buffer remaining`);
    }
  }
  
  const breakpointReachingTests = stressResults.filter(r => r.breakpointReached);
  if (breakpointReachingTests.length > 0) {
    lines.push(`Stress scenarios reaching breakpoints: ${breakpointReachingTests.length}/${stressResults.length}`);
  }
  
  return lines.join('\n');
}
