/**
 * Market Profitability Scoring & Auto-Throttling Engine (INCREMENT 14)
 * 
 * Backend-only system for:
 * 1. Aggregate market-level labor, claims, utilization, and volume metrics
 * 2. Compute normalized market_profit_score (0-100)
 * 3. Define automatic throttle actions tied to score thresholds
 * 4. Apply throttles prospectively and log all actions
 * 5. Emit early-warning events and provide read-only executive summaries
 * 
 * NOT implementing: customer pricing, revenue modeling, financial statements
 */

// ============================================
// TYPES & CONSTANTS
// ============================================

/** Market profit score tier (0-100 scale) */
export type ProfitTier = 'EXCELLENT' | 'GOOD' | 'ADEQUATE' | 'MARGINAL' | 'POOR' | 'CRITICAL';

/** Throttle action types */
export type ThrottleAction = 
  | 'HIRING_FREEZE'
  | 'HIRING_LIMIT'
  | 'RATE_CAP'
  | 'EXPANSION_HOLD'
  | 'ENHANCED_REVIEW'
  | 'CAPACITY_REDUCTION';

/** Warning severity levels */
export type WarningSeverity = 'INFO' | 'WARNING' | 'URGENT' | 'CRITICAL';

/** Throttle status */
export type ThrottleStatus = 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';

/** Audit action types */
export type ProfitAuditAction = 
  | 'SCORE_CALCULATED'
  | 'THROTTLE_APPLIED'
  | 'THROTTLE_EXPIRED'
  | 'THROTTLE_REVOKED'
  | 'WARNING_EMITTED'
  | 'SUMMARY_GENERATED'
  | 'METRICS_AGGREGATED';

// ============================================
// MARKET METRICS AGGREGATION
// ============================================

/** Raw labor metrics for a market */
export interface MarketLaborMetrics {
  marketId: string;
  periodStart: string;
  periodEnd: string;
  
  totalDriverCount: number;
  activeDriverCount: number;
  utilizationRate: number; // 0.0-1.0
  
  totalLaborCostCents: number;
  averageHourlyRateCents: number;
  overtimeHours: number;
  regularHours: number;
  
  driverTurnoverRate: number; // annualized percentage
  averageTenureDays: number;
}

/** Raw claims metrics for a market */
export interface MarketClaimsMetrics {
  marketId: string;
  periodStart: string;
  periodEnd: string;
  
  totalClaimCount: number;
  atFaultClaimCount: number;
  totalIncurredCents: number;
  averageClaimCostCents: number;
  
  claimsPer100Moves: number;
  lossRatio: number; // claims cost / revenue proxy
}

/** Raw volume metrics for a market */
export interface MarketVolumeMetrics {
  marketId: string;
  periodStart: string;
  periodEnd: string;
  
  totalMoves: number;
  completedMoves: number;
  cancelledMoves: number;
  
  completionRate: number; // 0.0-1.0
  averageMoveDurationHours: number;
  peakCapacityUtilization: number;
  
  weekOverWeekGrowth: number; // percentage change
}

/** Aggregated market metrics */
export interface AggregatedMarketMetrics {
  marketId: string;
  aggregatedAt: string;
  periodStart: string;
  periodEnd: string;
  
  labor: MarketLaborMetrics;
  claims: MarketClaimsMetrics;
  volume: MarketVolumeMetrics;
  
  // Derived efficiency metrics
  costPerMove: number; // labor + claims cost / moves
  laborEfficiency: number; // moves per labor hour
  claimsEfficiency: number; // inverse of claims rate, normalized
}

// ============================================
// PROFIT SCORE
// ============================================

/** Market profit score result */
export interface MarketProfitScore {
  marketId: string;
  calculatedAt: string;
  snapshotDate: string;
  
  // Overall score (0-100, higher = better profitability)
  score: number;
  tier: ProfitTier;
  
  // Component scores (each 0-100)
  laborEfficiencyScore: number;   // 30% weight - cost per move efficiency
  claimsPerformanceScore: number; // 25% weight - claims cost control
  utilizationScore: number;       // 25% weight - capacity utilization
  volumeGrowthScore: number;      // 20% weight - growth trajectory
  
  // Inputs for audit trail
  inputs: {
    costPerMoveCents: number;
    claimsPer100Moves: number;
    utilizationRate: number;
    weekOverWeekGrowth: number;
    lossRatio: number;
  };
  
  // Trend
  previousScore: number | null;
  scoreChange: number;
  trendDirection: 'IMPROVING' | 'STABLE' | 'DECLINING';
}

// ============================================
// THROTTLE CONTROLS
// ============================================

/** Throttle configuration */
export interface ThrottleConfig {
  action: ThrottleAction;
  triggerTier: ProfitTier;
  triggerScoreBelow: number;
  durationDays: number;
  description: string;
}

/** Active throttle record */
export interface MarketThrottle {
  id: string;
  marketId: string;
  action: ThrottleAction;
  status: ThrottleStatus;
  
  triggeredByScore: number;
  triggeredByTier: ProfitTier;
  triggerReason: string;
  
  effectiveDate: string;
  expirationDate: string;
  
  createdAt: string;
  createdBy: string;
  revokedAt: string | null;
  revokedBy: string | null;
  revocationReason: string | null;
}

// ============================================
// EARLY WARNING EVENTS
// ============================================

/** Early warning event */
export interface ProfitWarningEvent {
  id: string;
  marketId: string;
  emittedAt: string;
  
  severity: WarningSeverity;
  warningType: string;
  message: string;
  
  currentScore: number;
  previousScore: number | null;
  scoreChange: number;
  
  suggestedActions: string[];
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

// ============================================
// EXECUTIVE SUMMARY
// ============================================

/** Market executive summary (read-only) */
export interface MarketExecutiveSummary {
  marketId: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  
  // Current state
  profitScore: number;
  profitTier: ProfitTier;
  trendDirection: 'IMPROVING' | 'STABLE' | 'DECLINING';
  
  // Key metrics
  keyMetrics: {
    costPerMove: string; // formatted currency
    utilizationRate: string; // formatted percentage
    claimsPer100Moves: string; // formatted number
    volumeGrowth: string; // formatted percentage
  };
  
  // Active throttles
  activeThrottles: {
    action: ThrottleAction;
    reason: string;
    expiresAt: string;
  }[];
  
  // Warnings
  activeWarnings: {
    severity: WarningSeverity;
    message: string;
  }[];
  
  // Recommendations
  recommendations: string[];
}

// ============================================
// AUDIT TRAIL
// ============================================

/** Profit audit entry */
export interface ProfitAuditEntry {
  id: string;
  timestamp: string;
  action: ProfitAuditAction;
  marketId: string;
  performedBy: string;
  previousState: unknown | null;
  newState: unknown | null;
  metadata: Record<string, unknown>;
}

// In-memory stores (would be database in production)
const profitAuditLog: ProfitAuditEntry[] = [];
const activeThrottles: MarketThrottle[] = [];
const warningEvents: ProfitWarningEvent[] = [];
const profitScoreHistory: MarketProfitScore[] = [];

// ============================================
// CONSTANTS
// ============================================

/** Profit tier thresholds (score ranges) */
export const PROFIT_TIER_THRESHOLDS: Record<ProfitTier, { min: number; max: number }> = {
  'EXCELLENT': { min: 85, max: 100 },
  'GOOD': { min: 70, max: 84 },
  'ADEQUATE': { min: 55, max: 69 },
  'MARGINAL': { min: 40, max: 54 },
  'POOR': { min: 25, max: 39 },
  'CRITICAL': { min: 0, max: 24 },
};

/** Score component weights */
export const SCORE_WEIGHTS = {
  laborEfficiency: 0.30,
  claimsPerformance: 0.25,
  utilization: 0.25,
  volumeGrowth: 0.20,
};

/** Default throttle configurations */
export const DEFAULT_THROTTLE_CONFIGS: ThrottleConfig[] = [
  {
    action: 'ENHANCED_REVIEW',
    triggerTier: 'MARGINAL',
    triggerScoreBelow: 55,
    durationDays: 14,
    description: 'Enhanced management review of market operations',
  },
  {
    action: 'HIRING_LIMIT',
    triggerTier: 'POOR',
    triggerScoreBelow: 40,
    durationDays: 30,
    description: 'Limit new hiring to replacement only',
  },
  {
    action: 'RATE_CAP',
    triggerTier: 'POOR',
    triggerScoreBelow: 35,
    durationDays: 30,
    description: 'Cap rate increases pending profitability improvement',
  },
  {
    action: 'EXPANSION_HOLD',
    triggerTier: 'POOR',
    triggerScoreBelow: 30,
    durationDays: 60,
    description: 'Hold market expansion plans',
  },
  {
    action: 'HIRING_FREEZE',
    triggerTier: 'CRITICAL',
    triggerScoreBelow: 25,
    durationDays: 60,
    description: 'Complete freeze on new hiring',
  },
  {
    action: 'CAPACITY_REDUCTION',
    triggerTier: 'CRITICAL',
    triggerScoreBelow: 15,
    durationDays: 90,
    description: 'Reduce market capacity through attrition',
  },
];

/** Warning thresholds */
export const WARNING_THRESHOLDS = {
  scoreDropPercent: 10, // Warn if score drops by this much
  criticalScoreThreshold: 25,
  urgentScoreThreshold: 40,
  warningScoreThreshold: 55,
};

/** Benchmarks for normalization (industry standards) */
export const PROFITABILITY_BENCHMARKS = {
  targetCostPerMoveCents: 5000,    // $50 target cost per move
  maxCostPerMoveCents: 10000,      // $100 max acceptable
  targetClaimsPer100Moves: 1.5,    // Target claims rate
  maxClaimsPer100Moves: 5.0,       // Max acceptable claims rate
  targetUtilization: 0.85,         // 85% target utilization
  minAcceptableUtilization: 0.60,  // 60% minimum
  targetGrowthRate: 0.05,          // 5% WoW growth target
  minAcceptableGrowthRate: -0.10,  // -10% min (decline limit)
};

// ============================================
// METRICS AGGREGATION
// ============================================

/**
 * Create labor metrics from raw data.
 */
export function createLaborMetrics(
  marketId: string,
  periodStart: string,
  periodEnd: string,
  data: Partial<MarketLaborMetrics>
): MarketLaborMetrics {
  return {
    marketId,
    periodStart,
    periodEnd,
    totalDriverCount: data.totalDriverCount ?? 0,
    activeDriverCount: data.activeDriverCount ?? 0,
    utilizationRate: data.utilizationRate ?? 0,
    totalLaborCostCents: data.totalLaborCostCents ?? 0,
    averageHourlyRateCents: data.averageHourlyRateCents ?? 0,
    overtimeHours: data.overtimeHours ?? 0,
    regularHours: data.regularHours ?? 0,
    driverTurnoverRate: data.driverTurnoverRate ?? 0,
    averageTenureDays: data.averageTenureDays ?? 0,
  };
}

/**
 * Create claims metrics from raw data.
 */
export function createClaimsMetrics(
  marketId: string,
  periodStart: string,
  periodEnd: string,
  data: Partial<MarketClaimsMetrics>
): MarketClaimsMetrics {
  return {
    marketId,
    periodStart,
    periodEnd,
    totalClaimCount: data.totalClaimCount ?? 0,
    atFaultClaimCount: data.atFaultClaimCount ?? 0,
    totalIncurredCents: data.totalIncurredCents ?? 0,
    averageClaimCostCents: data.averageClaimCostCents ?? 0,
    claimsPer100Moves: data.claimsPer100Moves ?? 0,
    lossRatio: data.lossRatio ?? 0,
  };
}

/**
 * Create volume metrics from raw data.
 */
export function createVolumeMetrics(
  marketId: string,
  periodStart: string,
  periodEnd: string,
  data: Partial<MarketVolumeMetrics>
): MarketVolumeMetrics {
  return {
    marketId,
    periodStart,
    periodEnd,
    totalMoves: data.totalMoves ?? 0,
    completedMoves: data.completedMoves ?? 0,
    cancelledMoves: data.cancelledMoves ?? 0,
    completionRate: data.completionRate ?? 0,
    averageMoveDurationHours: data.averageMoveDurationHours ?? 0,
    peakCapacityUtilization: data.peakCapacityUtilization ?? 0,
    weekOverWeekGrowth: data.weekOverWeekGrowth ?? 0,
  };
}

/**
 * Aggregate market metrics from labor, claims, and volume data.
 */
export function aggregateMarketMetrics(
  labor: MarketLaborMetrics,
  claims: MarketClaimsMetrics,
  volume: MarketVolumeMetrics
): AggregatedMarketMetrics {
  const totalCostCents = labor.totalLaborCostCents + claims.totalIncurredCents;
  const completedMoves = volume.completedMoves || 1; // Avoid division by zero
  const totalHours = labor.regularHours + labor.overtimeHours || 1;
  
  const costPerMove = totalCostCents / completedMoves;
  const laborEfficiency = completedMoves / totalHours;
  const claimsEfficiency = claims.claimsPer100Moves > 0 
    ? Math.min(100, 100 / claims.claimsPer100Moves) 
    : 100;
  
  return {
    marketId: labor.marketId,
    aggregatedAt: new Date().toISOString(),
    periodStart: labor.periodStart,
    periodEnd: labor.periodEnd,
    labor,
    claims,
    volume,
    costPerMove,
    laborEfficiency,
    claimsEfficiency,
  };
}

// ============================================
// PROFIT SCORE CALCULATION
// ============================================

/**
 * Calculate labor efficiency score (0-100).
 * Lower cost per move = higher score.
 */
function calculateLaborEfficiencyScore(costPerMoveCents: number): number {
  const { targetCostPerMoveCents, maxCostPerMoveCents } = PROFITABILITY_BENCHMARKS;
  
  if (costPerMoveCents <= targetCostPerMoveCents) {
    // At or below target = 80-100 score
    const ratio = costPerMoveCents / targetCostPerMoveCents;
    return Math.round(100 - (ratio * 20));
  } else if (costPerMoveCents >= maxCostPerMoveCents) {
    // At or above max = 0 score
    return 0;
  } else {
    // Between target and max = 0-80 score (linear interpolation)
    const range = maxCostPerMoveCents - targetCostPerMoveCents;
    const position = costPerMoveCents - targetCostPerMoveCents;
    return Math.round(80 * (1 - position / range));
  }
}

/**
 * Calculate claims performance score (0-100).
 * Lower claims rate = higher score.
 */
function calculateClaimsPerformanceScore(claimsPer100Moves: number): number {
  const { targetClaimsPer100Moves, maxClaimsPer100Moves } = PROFITABILITY_BENCHMARKS;
  
  if (claimsPer100Moves <= targetClaimsPer100Moves) {
    // At or below target = 80-100 score
    const ratio = claimsPer100Moves / targetClaimsPer100Moves;
    return Math.round(100 - (ratio * 20));
  } else if (claimsPer100Moves >= maxClaimsPer100Moves) {
    // At or above max = 0 score
    return 0;
  } else {
    // Between target and max = 0-80 score
    const range = maxClaimsPer100Moves - targetClaimsPer100Moves;
    const position = claimsPer100Moves - targetClaimsPer100Moves;
    return Math.round(80 * (1 - position / range));
  }
}

/**
 * Calculate utilization score (0-100).
 * Closer to target = higher score.
 */
function calculateUtilizationScore(utilizationRate: number): number {
  const { targetUtilization, minAcceptableUtilization } = PROFITABILITY_BENCHMARKS;
  
  if (utilizationRate >= targetUtilization) {
    // At or above target = 85-100 score
    // Perfect utilization at target = 100, slight penalty for over-utilization
    // Over-utilization beyond 1.0 is penalized more heavily
    const overUtil = utilizationRate - targetUtilization;
    const score = Math.round(100 - (overUtil * 100));
    // Clamp to valid range: minimum 60 for over-utilization (still acceptable), max 100
    return Math.max(60, Math.min(100, score));
  } else if (utilizationRate <= minAcceptableUtilization) {
    // At or below minimum = 0-20 score
    const ratio = utilizationRate / minAcceptableUtilization;
    return Math.max(0, Math.min(20, Math.round(20 * ratio)));
  } else {
    // Between min and target = 20-85 score
    const range = targetUtilization - minAcceptableUtilization;
    const position = utilizationRate - minAcceptableUtilization;
    const score = Math.round(20 + (65 * (position / range)));
    return Math.max(20, Math.min(85, score));
  }
}

/**
 * Calculate volume growth score (0-100).
 * Higher growth = higher score.
 */
function calculateVolumeGrowthScore(weekOverWeekGrowth: number): number {
  const { targetGrowthRate, minAcceptableGrowthRate } = PROFITABILITY_BENCHMARKS;
  
  if (weekOverWeekGrowth >= targetGrowthRate) {
    // At or above target = 80-100 score
    const overGrowth = weekOverWeekGrowth - targetGrowthRate;
    return Math.min(100, Math.round(80 + (overGrowth * 200)));
  } else if (weekOverWeekGrowth <= minAcceptableGrowthRate) {
    // At or below minimum = 0 score
    return 0;
  } else {
    // Between min and target = 0-80 score
    const range = targetGrowthRate - minAcceptableGrowthRate;
    const position = weekOverWeekGrowth - minAcceptableGrowthRate;
    return Math.round(80 * (position / range));
  }
}

/**
 * Determine profit tier from score.
 */
export function determineProfitTier(score: number): ProfitTier {
  for (const [tier, { min, max }] of Object.entries(PROFIT_TIER_THRESHOLDS)) {
    if (score >= min && score <= max) {
      return tier as ProfitTier;
    }
  }
  return 'CRITICAL';
}

/**
 * Determine trend direction from score change.
 */
function determineTrendDirection(scoreChange: number): 'IMPROVING' | 'STABLE' | 'DECLINING' {
  if (scoreChange >= 3) return 'IMPROVING';
  if (scoreChange <= -3) return 'DECLINING';
  return 'STABLE';
}

/**
 * Calculate market profit score.
 */
export function calculateMarketProfitScore(
  metrics: AggregatedMarketMetrics,
  previousScore?: MarketProfitScore | null
): MarketProfitScore {
  const laborEfficiencyScore = calculateLaborEfficiencyScore(metrics.costPerMove);
  const claimsPerformanceScore = calculateClaimsPerformanceScore(metrics.claims.claimsPer100Moves);
  const utilizationScore = calculateUtilizationScore(metrics.labor.utilizationRate);
  const volumeGrowthScore = calculateVolumeGrowthScore(metrics.volume.weekOverWeekGrowth);
  
  // Weighted average
  const score = Math.round(
    laborEfficiencyScore * SCORE_WEIGHTS.laborEfficiency +
    claimsPerformanceScore * SCORE_WEIGHTS.claimsPerformance +
    utilizationScore * SCORE_WEIGHTS.utilization +
    volumeGrowthScore * SCORE_WEIGHTS.volumeGrowth
  );
  
  const clampedScore = Math.max(0, Math.min(100, score));
  const tier = determineProfitTier(clampedScore);
  
  const prevScoreValue = previousScore?.score ?? null;
  const scoreChange = prevScoreValue !== null ? clampedScore - prevScoreValue : 0;
  const trendDirection = determineTrendDirection(scoreChange);
  
  const result: MarketProfitScore = {
    marketId: metrics.marketId,
    calculatedAt: new Date().toISOString(),
    snapshotDate: metrics.periodEnd,
    score: clampedScore,
    tier,
    laborEfficiencyScore,
    claimsPerformanceScore,
    utilizationScore,
    volumeGrowthScore,
    inputs: {
      costPerMoveCents: Math.round(metrics.costPerMove),
      claimsPer100Moves: metrics.claims.claimsPer100Moves,
      utilizationRate: metrics.labor.utilizationRate,
      weekOverWeekGrowth: metrics.volume.weekOverWeekGrowth,
      lossRatio: metrics.claims.lossRatio,
    },
    previousScore: prevScoreValue,
    scoreChange,
    trendDirection,
  };
  
  // Store in history
  profitScoreHistory.push(result);
  
  return result;
}

// ============================================
// THROTTLE MANAGEMENT
// ============================================

/**
 * Generate unique ID.
 */
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Determine which throttles should be applied based on score.
 */
/** Order of profit tiers from worst to best */
const TIER_ORDER: ProfitTier[] = ['CRITICAL', 'POOR', 'MARGINAL', 'ADEQUATE', 'GOOD', 'EXCELLENT'];

/**
 * Check if current tier is at or worse than trigger tier.
 * Tier ordering: CRITICAL (worst) < POOR < MARGINAL < ADEQUATE < GOOD < EXCELLENT (best)
 */
function isTierAtOrWorseThan(currentTier: ProfitTier, triggerTier: ProfitTier): boolean {
  const currentIndex = TIER_ORDER.indexOf(currentTier);
  const triggerIndex = TIER_ORDER.indexOf(triggerTier);
  // Lower index = worse tier
  return currentIndex <= triggerIndex;
}

export function determineApplicableThrottles(
  score: number,
  tier: ProfitTier,
  configs: ThrottleConfig[] = DEFAULT_THROTTLE_CONFIGS
): ThrottleConfig[] {
  return configs.filter(config => 
    score < config.triggerScoreBelow && isTierAtOrWorseThan(tier, config.triggerTier)
  );
}

/**
 * Apply throttle to a market prospectively.
 */
export function applyThrottle(
  marketId: string,
  config: ThrottleConfig,
  score: number,
  tier: ProfitTier,
  appliedBy: string
): MarketThrottle {
  const now = new Date();
  const expirationDate = new Date(now);
  expirationDate.setDate(expirationDate.getDate() + config.durationDays);
  
  const throttle: MarketThrottle = {
    id: generateId('thr'),
    marketId,
    action: config.action,
    status: 'ACTIVE',
    triggeredByScore: score,
    triggeredByTier: tier,
    triggerReason: config.description,
    effectiveDate: now.toISOString().split('T')[0],
    expirationDate: expirationDate.toISOString().split('T')[0],
    createdAt: now.toISOString(),
    createdBy: appliedBy,
    revokedAt: null,
    revokedBy: null,
    revocationReason: null,
  };
  
  activeThrottles.push(throttle);
  
  // Audit log
  createProfitAuditEntry(
    'THROTTLE_APPLIED',
    marketId,
    appliedBy,
    null,
    { action: config.action, score, tier },
    { throttleId: throttle.id, expirationDate: throttle.expirationDate }
  );
  
  return throttle;
}

/**
 * Revoke an active throttle.
 */
export function revokeThrottle(
  throttleId: string,
  revokedBy: string,
  reason: string
): MarketThrottle | null {
  const throttle = activeThrottles.find(t => t.id === throttleId);
  if (!throttle || throttle.status !== 'ACTIVE') {
    return null;
  }
  
  const previousState = { ...throttle };
  
  throttle.status = 'REVOKED';
  throttle.revokedAt = new Date().toISOString();
  throttle.revokedBy = revokedBy;
  throttle.revocationReason = reason;
  
  // Audit log
  createProfitAuditEntry(
    'THROTTLE_REVOKED',
    throttle.marketId,
    revokedBy,
    previousState,
    { status: 'REVOKED', reason },
    { throttleId }
  );
  
  return throttle;
}

/**
 * Expire throttles that have passed their expiration date.
 */
export function expireThrottles(currentDate: string): MarketThrottle[] {
  const expired: MarketThrottle[] = [];
  
  for (const throttle of activeThrottles) {
    if (throttle.status === 'ACTIVE' && throttle.expirationDate <= currentDate) {
      throttle.status = 'EXPIRED';
      expired.push(throttle);
      
      // Audit log
      createProfitAuditEntry(
        'THROTTLE_EXPIRED',
        throttle.marketId,
        'SYSTEM',
        { status: 'ACTIVE' },
        { status: 'EXPIRED' },
        { throttleId: throttle.id }
      );
    }
  }
  
  return expired;
}

/**
 * Get active throttles for a market.
 */
export function getActiveThrottles(marketId: string): MarketThrottle[] {
  return activeThrottles.filter(t => t.marketId === marketId && t.status === 'ACTIVE');
}

/**
 * Check if a specific throttle action is active for a market.
 */
export function isThrottleActive(marketId: string, action: ThrottleAction): boolean {
  return activeThrottles.some(
    t => t.marketId === marketId && t.action === action && t.status === 'ACTIVE'
  );
}

// ============================================
// EARLY WARNING EVENTS
// ============================================

/**
 * Determine warning severity based on score.
 */
function determineWarningSeverity(score: number, scoreChange: number): WarningSeverity {
  if (score < WARNING_THRESHOLDS.criticalScoreThreshold) return 'CRITICAL';
  if (score < WARNING_THRESHOLDS.urgentScoreThreshold) return 'URGENT';
  if (score < WARNING_THRESHOLDS.warningScoreThreshold) return 'WARNING';
  if (scoreChange <= -WARNING_THRESHOLDS.scoreDropPercent) return 'WARNING';
  return 'INFO';
}

/**
 * Generate suggested actions based on score components.
 */
function generateSuggestedActions(profitScore: MarketProfitScore): string[] {
  const actions: string[] = [];
  
  if (profitScore.laborEfficiencyScore < 50) {
    actions.push('Review labor costs and optimize scheduling');
    actions.push('Evaluate driver productivity and training needs');
  }
  
  if (profitScore.claimsPerformanceScore < 50) {
    actions.push('Implement enhanced safety training programs');
    actions.push('Review high-risk driver assignments');
  }
  
  if (profitScore.utilizationScore < 50) {
    actions.push('Optimize capacity planning and driver allocation');
    actions.push('Review demand forecasting accuracy');
  }
  
  if (profitScore.volumeGrowthScore < 50) {
    actions.push('Analyze volume trends and customer retention');
    actions.push('Review service quality metrics');
  }
  
  if (actions.length === 0) {
    actions.push('Continue monitoring - no immediate action required');
  }
  
  return actions;
}

/**
 * Emit early warning event for a market.
 */
export function emitWarningEvent(
  profitScore: MarketProfitScore,
  warningType: string = 'PROFITABILITY_ALERT'
): ProfitWarningEvent {
  const severity = determineWarningSeverity(profitScore.score, profitScore.scoreChange);
  const suggestedActions = generateSuggestedActions(profitScore);
  
  let message: string;
  if (profitScore.trendDirection === 'DECLINING') {
    message = `Market ${profitScore.marketId} profitability declining: score ${profitScore.score} (${profitScore.tier}), down ${Math.abs(profitScore.scoreChange)} points`;
  } else if (profitScore.tier === 'CRITICAL') {
    message = `Market ${profitScore.marketId} profitability critical: score ${profitScore.score}`;
  } else {
    message = `Market ${profitScore.marketId} profitability alert: score ${profitScore.score} (${profitScore.tier})`;
  }
  
  const event: ProfitWarningEvent = {
    id: generateId('warn'),
    marketId: profitScore.marketId,
    emittedAt: new Date().toISOString(),
    severity,
    warningType,
    message,
    currentScore: profitScore.score,
    previousScore: profitScore.previousScore,
    scoreChange: profitScore.scoreChange,
    suggestedActions,
    acknowledged: false,
    acknowledgedAt: null,
    acknowledgedBy: null,
  };
  
  warningEvents.push(event);
  
  // Audit log
  createProfitAuditEntry(
    'WARNING_EMITTED',
    profitScore.marketId,
    'SYSTEM',
    null,
    { severity, warningType },
    { eventId: event.id, score: profitScore.score }
  );
  
  return event;
}

/**
 * Acknowledge a warning event.
 */
export function acknowledgeWarning(
  eventId: string,
  acknowledgedBy: string
): ProfitWarningEvent | null {
  const event = warningEvents.find(e => e.id === eventId);
  if (!event) return null;
  
  event.acknowledged = true;
  event.acknowledgedAt = new Date().toISOString();
  event.acknowledgedBy = acknowledgedBy;
  
  return event;
}

/**
 * Get unacknowledged warnings for a market.
 */
export function getUnacknowledgedWarnings(marketId: string): ProfitWarningEvent[] {
  return warningEvents.filter(e => e.marketId === marketId && !e.acknowledged);
}

/**
 * Check if warning should be emitted based on score.
 */
export function shouldEmitWarning(profitScore: MarketProfitScore): boolean {
  // Emit warning if:
  // 1. Score is below warning threshold
  // 2. Score dropped significantly
  // 3. Tier is POOR or CRITICAL
  return (
    profitScore.score < WARNING_THRESHOLDS.warningScoreThreshold ||
    profitScore.scoreChange <= -WARNING_THRESHOLDS.scoreDropPercent ||
    profitScore.tier === 'POOR' ||
    profitScore.tier === 'CRITICAL'
  );
}

// ============================================
// EXECUTIVE SUMMARY
// ============================================

/**
 * Format cents to currency string.
 */
function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Format percentage.
 */
function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * Generate executive summary for a market.
 */
export function generateExecutiveSummary(
  profitScore: MarketProfitScore,
  throttles: MarketThrottle[],
  warnings: ProfitWarningEvent[]
): MarketExecutiveSummary {
  const summary: MarketExecutiveSummary = {
    marketId: profitScore.marketId,
    generatedAt: new Date().toISOString(),
    periodStart: profitScore.snapshotDate,
    periodEnd: profitScore.snapshotDate,
    profitScore: profitScore.score,
    profitTier: profitScore.tier,
    trendDirection: profitScore.trendDirection,
    keyMetrics: {
      costPerMove: formatCurrency(profitScore.inputs.costPerMoveCents),
      utilizationRate: formatPercent(profitScore.inputs.utilizationRate),
      claimsPer100Moves: profitScore.inputs.claimsPer100Moves.toFixed(2),
      volumeGrowth: formatPercent(profitScore.inputs.weekOverWeekGrowth),
    },
    activeThrottles: throttles
      .filter(t => t.status === 'ACTIVE')
      .map(t => ({
        action: t.action,
        reason: t.triggerReason,
        expiresAt: t.expirationDate,
      })),
    activeWarnings: warnings
      .filter(w => !w.acknowledged)
      .map(w => ({
        severity: w.severity,
        message: w.message,
      })),
    recommendations: generateSuggestedActions(profitScore),
  };
  
  // Audit log
  createProfitAuditEntry(
    'SUMMARY_GENERATED',
    profitScore.marketId,
    'SYSTEM',
    null,
    { score: profitScore.score, tier: profitScore.tier },
    {}
  );
  
  return summary;
}

// ============================================
// AUDIT TRAIL
// ============================================

/**
 * Create a profit audit entry.
 */
export function createProfitAuditEntry(
  action: ProfitAuditAction,
  marketId: string,
  performedBy: string,
  previousState: unknown | null = null,
  newState: unknown | null = null,
  metadata: Record<string, unknown> = {}
): ProfitAuditEntry {
  const entry: ProfitAuditEntry = {
    id: generateId('pa'),
    timestamp: new Date().toISOString(),
    action,
    marketId,
    performedBy,
    previousState,
    newState,
    metadata,
  };
  
  profitAuditLog.push(entry);
  return entry;
}

/**
 * Get profit audit entries for a market.
 */
export function getMarketProfitAudit(marketId: string): ProfitAuditEntry[] {
  return profitAuditLog.filter(e => e.marketId === marketId);
}

/**
 * Get all profit audit entries.
 */
export function getAllProfitAuditEntries(): ProfitAuditEntry[] {
  return [...profitAuditLog];
}

// ============================================
// COMPLETE FLOW
// ============================================

/** Result of processing market profitability */
export interface ProfitabilityProcessResult {
  marketId: string;
  processedAt: string;
  profitScore: MarketProfitScore;
  appliedThrottles: MarketThrottle[];
  emittedWarnings: ProfitWarningEvent[];
  executiveSummary: MarketExecutiveSummary;
}

/**
 * Process market profitability - complete flow.
 * 
 * 1. Aggregate metrics
 * 2. Calculate profit score
 * 3. Apply applicable throttles
 * 4. Emit warnings if needed
 * 5. Generate executive summary
 */
export function processMarketProfitability(
  metrics: AggregatedMarketMetrics,
  previousScore?: MarketProfitScore | null,
  throttleConfigs: ThrottleConfig[] = DEFAULT_THROTTLE_CONFIGS
): ProfitabilityProcessResult {
  const marketId = metrics.marketId;
  
  // 1. Calculate profit score
  const profitScore = calculateMarketProfitScore(metrics, previousScore);
  
  // Audit metrics aggregation
  createProfitAuditEntry(
    'METRICS_AGGREGATED',
    marketId,
    'SYSTEM',
    null,
    { score: profitScore.score, tier: profitScore.tier },
    { periodEnd: metrics.periodEnd }
  );
  
  // Audit score calculation
  createProfitAuditEntry(
    'SCORE_CALCULATED',
    marketId,
    'SYSTEM',
    previousScore ? { score: previousScore.score } : null,
    { score: profitScore.score, tier: profitScore.tier },
    {
      laborEfficiencyScore: profitScore.laborEfficiencyScore,
      claimsPerformanceScore: profitScore.claimsPerformanceScore,
      utilizationScore: profitScore.utilizationScore,
      volumeGrowthScore: profitScore.volumeGrowthScore,
    }
  );
  
  // 2. Determine and apply throttles
  const applicableThrottles = determineApplicableThrottles(
    profitScore.score,
    profitScore.tier,
    throttleConfigs
  );
  
  const existingActions = getActiveThrottles(marketId).map(t => t.action);
  const appliedThrottles: MarketThrottle[] = [];
  
  for (const config of applicableThrottles) {
    // Don't duplicate existing active throttles
    if (!existingActions.includes(config.action)) {
      const throttle = applyThrottle(marketId, config, profitScore.score, profitScore.tier, 'SYSTEM');
      appliedThrottles.push(throttle);
    }
  }
  
  // 3. Emit warnings if needed
  const emittedWarnings: ProfitWarningEvent[] = [];
  if (shouldEmitWarning(profitScore)) {
    const warning = emitWarningEvent(profitScore);
    emittedWarnings.push(warning);
  }
  
  // 4. Generate executive summary
  const allActiveThrottles = getActiveThrottles(marketId);
  const allActiveWarnings = getUnacknowledgedWarnings(marketId);
  const executiveSummary = generateExecutiveSummary(profitScore, allActiveThrottles, allActiveWarnings);
  
  return {
    marketId,
    processedAt: new Date().toISOString(),
    profitScore,
    appliedThrottles,
    emittedWarnings,
    executiveSummary,
  };
}

// ============================================
// SCENARIO SIMULATION
// ============================================

/** Scenario inputs for simulation */
export interface ScenarioInputs {
  // Labor metrics adjustments
  utilizationRate?: number;
  totalLaborCostCents?: number;
  totalDriverCount?: number;
  activeDriverCount?: number;
  regularHours?: number;
  overtimeHours?: number;
  
  // Claims metrics adjustments
  claimsPer100Moves?: number;
  totalIncurredCents?: number;
  lossRatio?: number;
  
  // Volume metrics adjustments
  completedMoves?: number;
  weekOverWeekGrowth?: number;
  completionRate?: number;
}

/** Projected outcomes from simulation */
export interface ProjectedOutcomes {
  marketId: string;
  simulatedAt: string;
  
  // Current state (before scenario)
  currentScore: number | null;
  currentTier: ProfitTier | null;
  
  // Projected state (after scenario)
  projectedScore: number;
  projectedTier: ProfitTier;
  scoreChange: number;
  trendDirection: 'IMPROVING' | 'STABLE' | 'DECLINING';
  
  // Component breakdown
  componentScores: {
    laborEfficiency: number;
    claimsPerformance: number;
    utilization: number;
    volumeGrowth: number;
  };
  
  // Impact analysis
  wouldTriggerThrottles: ThrottleConfig[];
  wouldRemoveThrottles: ThrottleAction[];
  wouldTriggerWarning: boolean;
  warningSeverity: WarningSeverity | null;
  
  // Recommendations
  keyDrivers: string[];
  improvementOpportunities: string[];
}

/**
 * Simulate a scenario with hypothetical inputs and project outcomes.
 * This is a read-only "what-if" analysis that does NOT apply any changes.
 */
export function simulateScenario(
  marketId: string,
  scenarioInputs: ScenarioInputs,
  baseMetrics?: AggregatedMarketMetrics | null,
  currentScore?: MarketProfitScore | null
): ProjectedOutcomes {
  // Use provided base metrics or create defaults
  const baseLabor = baseMetrics?.labor ?? createLaborMetrics(marketId, '', '', {
    utilizationRate: 0.75,
    totalLaborCostCents: 5000000,
    totalDriverCount: 100,
    activeDriverCount: 85,
    regularHours: 1700,
    overtimeHours: 300,
  });
  
  const baseClaims = baseMetrics?.claims ?? createClaimsMetrics(marketId, '', '', {
    claimsPer100Moves: 2.0,
    totalIncurredCents: 200000,
    lossRatio: 0.04,
  });
  
  const baseVolume = baseMetrics?.volume ?? createVolumeMetrics(marketId, '', '', {
    completedMoves: 1000,
    weekOverWeekGrowth: 0.02,
    completionRate: 0.95,
  });
  
  // Apply scenario adjustments
  const scenarioLabor = createLaborMetrics(marketId, baseLabor.periodStart, baseLabor.periodEnd, {
    ...baseLabor,
    utilizationRate: scenarioInputs.utilizationRate ?? baseLabor.utilizationRate,
    totalLaborCostCents: scenarioInputs.totalLaborCostCents ?? baseLabor.totalLaborCostCents,
    totalDriverCount: scenarioInputs.totalDriverCount ?? baseLabor.totalDriverCount,
    activeDriverCount: scenarioInputs.activeDriverCount ?? baseLabor.activeDriverCount,
    regularHours: scenarioInputs.regularHours ?? baseLabor.regularHours,
    overtimeHours: scenarioInputs.overtimeHours ?? baseLabor.overtimeHours,
  });
  
  const scenarioClaims = createClaimsMetrics(marketId, baseClaims.periodStart, baseClaims.periodEnd, {
    ...baseClaims,
    claimsPer100Moves: scenarioInputs.claimsPer100Moves ?? baseClaims.claimsPer100Moves,
    totalIncurredCents: scenarioInputs.totalIncurredCents ?? baseClaims.totalIncurredCents,
    lossRatio: scenarioInputs.lossRatio ?? baseClaims.lossRatio,
  });
  
  const scenarioVolume = createVolumeMetrics(marketId, baseVolume.periodStart, baseVolume.periodEnd, {
    ...baseVolume,
    completedMoves: scenarioInputs.completedMoves ?? baseVolume.completedMoves,
    weekOverWeekGrowth: scenarioInputs.weekOverWeekGrowth ?? baseVolume.weekOverWeekGrowth,
    completionRate: scenarioInputs.completionRate ?? baseVolume.completionRate,
  });
  
  // Aggregate scenario metrics
  const scenarioMetrics = aggregateMarketMetrics(scenarioLabor, scenarioClaims, scenarioVolume);
  
  // Calculate projected score (without storing in history)
  const projectedScore = calculateProjectedScore(scenarioMetrics, currentScore);
  
  // Determine score change
  const currentScoreValue = currentScore?.score ?? null;
  const scoreChange = currentScoreValue !== null 
    ? projectedScore.score - currentScoreValue 
    : 0;
  
  // Determine trend
  let trendDirection: 'IMPROVING' | 'STABLE' | 'DECLINING';
  if (scoreChange >= 3) trendDirection = 'IMPROVING';
  else if (scoreChange <= -3) trendDirection = 'DECLINING';
  else trendDirection = 'STABLE';
  
  // Determine which throttles would be triggered
  const wouldTriggerThrottles = determineApplicableThrottles(
    projectedScore.score,
    projectedScore.tier
  );
  
  // Determine which current throttles would be removed (score improved enough)
  const currentThrottles = getActiveThrottles(marketId);
  const wouldRemoveThrottles: ThrottleAction[] = [];
  for (const throttle of currentThrottles) {
    const config = DEFAULT_THROTTLE_CONFIGS.find(c => c.action === throttle.action);
    if (config && projectedScore.score >= config.triggerScoreBelow) {
      wouldRemoveThrottles.push(throttle.action);
    }
  }
  
  // Determine warning status
  const wouldTriggerWarning = shouldEmitWarning({
    ...projectedScore,
    previousScore: currentScoreValue,
    scoreChange,
    trendDirection,
  });
  
  let warningSeverity: WarningSeverity | null = null;
  if (wouldTriggerWarning) {
    if (projectedScore.score < WARNING_THRESHOLDS.criticalScoreThreshold) {
      warningSeverity = 'CRITICAL';
    } else if (projectedScore.score < WARNING_THRESHOLDS.urgentScoreThreshold) {
      warningSeverity = 'URGENT';
    } else if (projectedScore.score < WARNING_THRESHOLDS.warningScoreThreshold) {
      warningSeverity = 'WARNING';
    } else {
      warningSeverity = 'INFO';
    }
  }
  
  // Identify key drivers (what's impacting score most)
  const keyDrivers = identifyKeyDrivers(projectedScore);
  
  // Identify improvement opportunities
  const improvementOpportunities = identifyImprovementOpportunities(projectedScore);
  
  return {
    marketId,
    simulatedAt: new Date().toISOString(),
    currentScore: currentScoreValue,
    currentTier: currentScore?.tier ?? null,
    projectedScore: projectedScore.score,
    projectedTier: projectedScore.tier,
    scoreChange,
    trendDirection,
    componentScores: {
      laborEfficiency: projectedScore.laborEfficiencyScore,
      claimsPerformance: projectedScore.claimsPerformanceScore,
      utilization: projectedScore.utilizationScore,
      volumeGrowth: projectedScore.volumeGrowthScore,
    },
    wouldTriggerThrottles,
    wouldRemoveThrottles,
    wouldTriggerWarning,
    warningSeverity,
    keyDrivers,
    improvementOpportunities,
  };
}

/**
 * Calculate projected score without storing in history (for simulation).
 */
function calculateProjectedScore(
  metrics: AggregatedMarketMetrics,
  previousScore?: MarketProfitScore | null
): MarketProfitScore {
  const laborEfficiencyScore = calculateLaborEfficiencyScoreInternal(metrics.costPerMove);
  const claimsPerformanceScore = calculateClaimsPerformanceScoreInternal(metrics.claims.claimsPer100Moves);
  const utilizationScore = calculateUtilizationScoreInternal(metrics.labor.utilizationRate);
  const volumeGrowthScore = calculateVolumeGrowthScoreInternal(metrics.volume.weekOverWeekGrowth);
  
  const score = Math.round(
    laborEfficiencyScore * SCORE_WEIGHTS.laborEfficiency +
    claimsPerformanceScore * SCORE_WEIGHTS.claimsPerformance +
    utilizationScore * SCORE_WEIGHTS.utilization +
    volumeGrowthScore * SCORE_WEIGHTS.volumeGrowth
  );
  
  const clampedScore = Math.max(0, Math.min(100, score));
  const tier = determineProfitTier(clampedScore);
  
  const prevScoreValue = previousScore?.score ?? null;
  const scoreChange = prevScoreValue !== null ? clampedScore - prevScoreValue : 0;
  
  let trendDirection: 'IMPROVING' | 'STABLE' | 'DECLINING';
  if (scoreChange >= 3) trendDirection = 'IMPROVING';
  else if (scoreChange <= -3) trendDirection = 'DECLINING';
  else trendDirection = 'STABLE';
  
  return {
    marketId: metrics.marketId,
    calculatedAt: new Date().toISOString(),
    snapshotDate: metrics.periodEnd,
    score: clampedScore,
    tier,
    laborEfficiencyScore,
    claimsPerformanceScore,
    utilizationScore,
    volumeGrowthScore,
    inputs: {
      costPerMoveCents: Math.round(metrics.costPerMove),
      claimsPer100Moves: metrics.claims.claimsPer100Moves,
      utilizationRate: metrics.labor.utilizationRate,
      weekOverWeekGrowth: metrics.volume.weekOverWeekGrowth,
      lossRatio: metrics.claims.lossRatio,
    },
    previousScore: prevScoreValue,
    scoreChange,
    trendDirection,
  };
}

// Internal score calculation functions (for simulation without side effects)
function calculateLaborEfficiencyScoreInternal(costPerMoveCents: number): number {
  const { targetCostPerMoveCents, maxCostPerMoveCents } = PROFITABILITY_BENCHMARKS;
  
  if (costPerMoveCents <= targetCostPerMoveCents) {
    const ratio = costPerMoveCents / targetCostPerMoveCents;
    return Math.round(100 - (ratio * 20));
  } else if (costPerMoveCents >= maxCostPerMoveCents) {
    return 0;
  } else {
    const range = maxCostPerMoveCents - targetCostPerMoveCents;
    const position = costPerMoveCents - targetCostPerMoveCents;
    return Math.round(80 * (1 - position / range));
  }
}

function calculateClaimsPerformanceScoreInternal(claimsPer100Moves: number): number {
  const { targetClaimsPer100Moves, maxClaimsPer100Moves } = PROFITABILITY_BENCHMARKS;
  
  if (claimsPer100Moves <= targetClaimsPer100Moves) {
    const ratio = claimsPer100Moves / targetClaimsPer100Moves;
    return Math.round(100 - (ratio * 20));
  } else if (claimsPer100Moves >= maxClaimsPer100Moves) {
    return 0;
  } else {
    const range = maxClaimsPer100Moves - targetClaimsPer100Moves;
    const position = claimsPer100Moves - targetClaimsPer100Moves;
    return Math.round(80 * (1 - position / range));
  }
}

function calculateUtilizationScoreInternal(utilizationRate: number): number {
  const { targetUtilization, minAcceptableUtilization } = PROFITABILITY_BENCHMARKS;
  
  if (utilizationRate >= targetUtilization) {
    const overUtil = utilizationRate - targetUtilization;
    const score = Math.round(100 - (overUtil * 100));
    return Math.max(60, Math.min(100, score));
  } else if (utilizationRate <= minAcceptableUtilization) {
    const ratio = utilizationRate / minAcceptableUtilization;
    return Math.max(0, Math.min(20, Math.round(20 * ratio)));
  } else {
    const range = targetUtilization - minAcceptableUtilization;
    const position = utilizationRate - minAcceptableUtilization;
    const score = Math.round(20 + (65 * (position / range)));
    return Math.max(20, Math.min(85, score));
  }
}

function calculateVolumeGrowthScoreInternal(weekOverWeekGrowth: number): number {
  const { targetGrowthRate, minAcceptableGrowthRate } = PROFITABILITY_BENCHMARKS;
  
  if (weekOverWeekGrowth >= targetGrowthRate) {
    const overGrowth = weekOverWeekGrowth - targetGrowthRate;
    return Math.min(100, Math.round(80 + (overGrowth * 200)));
  } else if (weekOverWeekGrowth <= minAcceptableGrowthRate) {
    return 0;
  } else {
    const range = targetGrowthRate - minAcceptableGrowthRate;
    const position = weekOverWeekGrowth - minAcceptableGrowthRate;
    return Math.round(80 * (position / range));
  }
}

/**
 * Identify key drivers affecting the score.
 */
function identifyKeyDrivers(score: MarketProfitScore): string[] {
  const drivers: string[] = [];
  const scores = [
    { name: 'Labor Efficiency', score: score.laborEfficiencyScore, weight: 0.30 },
    { name: 'Claims Performance', score: score.claimsPerformanceScore, weight: 0.25 },
    { name: 'Utilization', score: score.utilizationScore, weight: 0.25 },
    { name: 'Volume Growth', score: score.volumeGrowthScore, weight: 0.20 },
  ];
  
  // Sort by weighted impact (low score * high weight = biggest drag)
  const sortedByImpact = scores
    .map(s => ({ ...s, impact: (100 - s.score) * s.weight }))
    .sort((a, b) => b.impact - a.impact);
  
  for (const s of sortedByImpact.slice(0, 2)) {
    if (s.score < 50) {
      drivers.push(`${s.name} is dragging score down (${s.score}/100)`);
    } else if (s.score >= 80) {
      drivers.push(`${s.name} is performing well (${s.score}/100)`);
    }
  }
  
  return drivers;
}

/**
 * Identify improvement opportunities.
 */
function identifyImprovementOpportunities(score: MarketProfitScore): string[] {
  const opportunities: string[] = [];
  
  if (score.laborEfficiencyScore < 60) {
    opportunities.push('Reduce cost per move through scheduling optimization');
  }
  if (score.claimsPerformanceScore < 60) {
    opportunities.push('Implement driver safety training to reduce claims');
  }
  if (score.utilizationScore < 60) {
    opportunities.push('Improve capacity planning to increase utilization');
  }
  if (score.volumeGrowthScore < 60) {
    opportunities.push('Focus on customer retention and volume growth');
  }
  
  if (opportunities.length === 0) {
    opportunities.push('Maintain current performance levels');
  }
  
  return opportunities;
}

// ============================================
// UTILITY FUNCTIONS FOR TESTING
// ============================================

/**
 * Clear all in-memory stores (for testing).
 */
export function clearAllProfitabilityData(): void {
  profitAuditLog.length = 0;
  activeThrottles.length = 0;
  warningEvents.length = 0;
  profitScoreHistory.length = 0;
}

/**
 * Get profit score history for a market.
 */
export function getProfitScoreHistory(marketId: string): MarketProfitScore[] {
  return profitScoreHistory.filter(s => s.marketId === marketId);
}

/**
 * Get all warning events for a market.
 */
export function getAllWarningEvents(marketId: string): ProfitWarningEvent[] {
  return warningEvents.filter(e => e.marketId === marketId);
}
