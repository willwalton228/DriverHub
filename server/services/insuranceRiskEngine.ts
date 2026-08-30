/**
 * Insurance Feedback Loop & Risk Pricing Engine (INCREMENT 12)
 * 
 * Backend-only system for:
 * 1. Normalize insurance/claim events and rolling loss metrics
 * 2. Compute driver and market loss scores
 * 3. Apply automatic risk controls to markets and drivers (prospective only)
 * 4. Emit internal warning events when thresholds are crossed
 * 5. Record full audit trail of insurance-driven control changes
 * 
 * NOT implementing: carrier APIs, premium billing, customer pricing
 */

// ============================================
// TYPES & CONSTANTS
// ============================================

/** Insurance claim types */
export type ClaimType = 
  | 'COLLISION'
  | 'PROPERTY_DAMAGE'
  | 'BODILY_INJURY'
  | 'CARGO_DAMAGE'
  | 'COMPREHENSIVE'
  | 'UNINSURED_MOTORIST';

/** Claim status */
export type ClaimStatus = 
  | 'REPORTED'
  | 'UNDER_INVESTIGATION'
  | 'APPROVED'
  | 'DENIED'
  | 'SETTLED'
  | 'CLOSED';

/** Fault determination */
export type FaultDetermination = 'AT_FAULT' | 'NOT_AT_FAULT' | 'SHARED_FAULT' | 'UNDETERMINED';

/** Normalized insurance event */
export interface InsuranceEvent {
  id: string;
  driverId: string;
  marketId: string;
  claimType: ClaimType;
  status: ClaimStatus;
  faultDetermination: FaultDetermination;
  
  // Financial data (in cents)
  claimAmountCents: number;
  reserveAmountCents: number;
  paidAmountCents: number;
  deductibleCents: number;
  
  // Dates
  incidentDate: string;
  reportedDate: string;
  closedDate: string | null;
  
  // Metadata
  description: string;
  externalClaimId: string | null;
  recordedAt: string;
  recordedBy: string;
}

/** Rolling loss metrics for a driver */
export interface DriverLossMetrics {
  driverId: string;
  calculatedAt: string;
  
  // Claim counts by window
  claims30Days: number;
  claims90Days: number;
  claims365Days: number;
  
  // At-fault claim counts
  atFaultClaims30Days: number;
  atFaultClaims90Days: number;
  atFaultClaims365Days: number;
  
  // Financial metrics (cents)
  totalIncurredCents30Days: number;
  totalIncurredCents90Days: number;
  totalIncurredCents365Days: number;
  
  // Averages
  averageClaimCents: number;
  claimsPerMonth: number;
  
  // INCREMENT: Enhanced inputs for driver_loss_score
  // Preventable incidents (at-fault accidents, preventable damages)
  preventableIncidents30Days: number;
  preventableIncidents90Days: number;
  
  // Safety violations (documented safety policy violations)
  safetyViolations30Days: number;
  safetyViolations90Days: number;
  
  // Late/failed moves (missed SLA, incomplete deliveries)
  lateOrFailedMoves30Days: number;
  lateOrFailedMoves90Days: number;
  totalMoves30Days: number;
  totalMoves90Days: number;
}

/** Rolling loss metrics for a market */
export interface MarketLossMetrics {
  marketId: string;
  calculatedAt: string;
  
  // Counts
  totalDrivers: number;
  driversWithClaims: number;
  
  // Claim metrics
  claims30Days: number;
  claims90Days: number;
  claims365Days: number;
  
  // Open claims for risk assessment
  openClaimsCount: number;
  totalReserveCents: number;
  
  // Financial metrics (cents)
  totalIncurredCents30Days: number;
  totalIncurredCents90Days: number;
  totalIncurredCents365Days: number;
  
  // Per-driver averages
  claimsPerDriverMonth: number;
  incurredPerDriverMonth: number;
  
  // Loss ratio (incurred / earned premium estimate)
  estimatedLossRatio: number;
  
  // INCREMENT: Enhanced inputs for market_loss_score
  // Late move % (missed SLA rate)
  lateMovePercent: number;
  lateMoves30Days: number;
  totalMoves30Days: number;
  
  // Driver incident rate (incidents per 100 drivers)
  driverIncidentRate: number;
  totalIncidents30Days: number;
}

/** 
 * Driver loss score (0-100, higher = worse)
 * 
 * DESIGN PRINCIPLE: Loss scores are SIGNALS, not LEVERS.
 * They gate eligibility and multipliers but NEVER directly calculate pay.
 * This prevents double-penalizing drivers, opaque pay math, and legal exposure.
 * 
 * Component weights:
 * - Frequency (60%): at-fault claims count, time-weighted (recent claims count more)
 * - Severity (40%): severity-weighted cost, normalized
 * 
 * Scores apply PROSPECTIVELY ONLY. Never recompute historical pay using updated scores.
 */
export interface DriverLossScore {
  driverId: string;
  calculatedAt: string;
  snapshotDate: string; // Date this score applies to
  
  // Score (0-100, higher = worse)
  score: number;
  
  // Risk tier
  tier: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE' | 'CRITICAL';
  
  // Score components (each 0-100, then weighted)
  // Enhanced weighting: Frequency 40% + Severity 25% + Incidents 20% + Violations 15%
  frequencyScore: number;  // 40% weight - at-fault claims frequency
  severityScore: number;   // 25% weight - severity-weighted cost
  incidentScore: number;   // 20% weight - preventable incidents + late/failed moves
  violationScore: number;  // 15% weight - safety violations
  
  // Inputs for audit trail
  inputs: {
    atFaultClaims30Days: number;
    atFaultClaims90Days: number;
    severityWeightedCostCents: number;
    recencyMultiplier: number;
    preventableIncidents90Days: number;
    safetyViolations90Days: number;
    lateOrFailedMoves90Days: number;
    lateMovePercent: number;
  };
  
  // Previous score for trend
  previousScore: number | null;
  scoreChange: number;
}

/** 
 * Market loss score (0-100, higher = worse)
 * 
 * DESIGN PRINCIPLE: Measures aggregate market risk, NOT profitability.
 * Does NOT include revenue, margin, customer pricing, or labor efficiency.
 * 
 * Component weights:
 * - Frequency (50%): at-fault claims per 100 moves
 * - Severity (30%): total incurred claim dollars (gross + deductible exposure)
 * - Volatility (20%): trend acceleration (week-over-week delta)
 * 
 * Scores apply PROSPECTIVELY ONLY.
 */
export interface MarketLossScore {
  marketId: string;
  calculatedAt: string;
  snapshotDate: string; // Date this score applies to
  
  // Score (0-100, higher = worse)
  score: number;
  
  // Risk tier
  tier: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE' | 'CRITICAL';
  
  // Score components (each 0-100, then weighted)
  // Enhanced weighting: Frequency 35% + Severity 25% + LateMoves 20% + IncidentRate 20%
  frequencyScore: number;     // 35% weight - claims per 100 moves
  severityScore: number;      // 25% weight - incurred dollars + reserve exposure
  lateMoveScore: number;      // 20% weight - late move % (missed SLA)
  incidentRateScore: number;  // 20% weight - driver incident rate
  
  // Inputs for audit trail
  inputs: {
    atFaultClaimsPer100Moves30Days: number;
    atFaultClaimsPer100Moves90Days: number;
    totalIncurredCents: number;
    openClaimsCount: number;
    totalReserveCents: number;
    lateMovePercent: number;
    driverIncidentRate: number;
  };
  
  // Previous score for trend
  previousScore: number | null;
  scoreChange: number;
  
  // Driver distribution
  highRiskDriverCount: number;
  severeRiskDriverCount: number;
}

/** Risk control types */
export type RiskControlType = 
  | 'RATE_ADJUSTMENT'
  | 'DEDUCTIBLE_INCREASE'
  | 'COVERAGE_RESTRICTION'
  | 'ASSIGNMENT_RESTRICTION'
  | 'ENHANCED_MONITORING'
  | 'MARKET_PAUSE';

/** Risk control */
export interface RiskControl {
  id: string;
  controlType: RiskControlType;
  targetType: 'DRIVER' | 'MARKET';
  targetId: string;
  
  // Control parameters
  adjustmentValue: number; // percentage or amount depending on type
  
  // Time bounds (prospective only)
  effectiveDate: string;
  expirationDate: string;
  
  // Trigger info
  triggeredByScore: number;
  triggeredByTier: string;
  triggerReason: string;
  
  // Status
  status: 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  
  // Audit
  createdAt: string;
  createdBy: string;
  revokedAt: string | null;
  revokedBy: string | null;
  revocationReason: string | null;
}

/** Warning event types */
export type WarningEventType = 
  | 'SCORE_THRESHOLD_CROSSED'
  | 'TIER_CHANGE'
  | 'CLAIM_FREQUENCY_SPIKE'
  | 'SEVERITY_SPIKE'
  | 'LOSS_RATIO_WARNING'
  | 'CONTROL_TRIGGERED';

/** Warning event */
export interface WarningEvent {
  id: string;
  eventType: WarningEventType;
  targetType: 'DRIVER' | 'MARKET';
  targetId: string;
  
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  
  // Threshold data
  thresholdValue: number;
  actualValue: number;
  
  // Related data
  relatedScoreId: string | null;
  relatedControlId: string | null;
  
  emittedAt: string;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
}

/** Insurance audit entry */
export interface InsuranceAuditEntry {
  id: string;
  action: 'CLAIM_RECORDED' | 'SCORE_CALCULATED' | 'CONTROL_APPLIED' | 'CONTROL_REVOKED' | 'WARNING_EMITTED' | 'THRESHOLD_UPDATED';
  targetType: 'DRIVER' | 'MARKET' | 'SYSTEM';
  targetId: string;
  
  performedBy: string;
  performedAt: string;
  
  previousValue: any;
  newValue: any;
  
  metadata: Record<string, any>;
}

// ============================================
// THRESHOLDS & CONSTANTS
// ============================================

/** Default thresholds for automatic controls (0-100 scale) */
export const DEFAULT_THRESHOLDS = {
  // Driver thresholds
  driver: {
    moderateScoreThreshold: 30,
    highScoreThreshold: 50,
    severeScoreThreshold: 70,
    criticalScoreThreshold: 85,
    
    claimsPerMonthWarning: 0.5,
    claimsPerMonthCritical: 1.0,
    
    atFaultRatioWarning: 0.5,
    atFaultRatioCritical: 0.75,
  },
  
  // Market thresholds
  market: {
    moderateScoreThreshold: 25,
    highScoreThreshold: 40,
    severeScoreThreshold: 60,
    criticalScoreThreshold: 80,
    
    lossRatioWarning: 0.65,
    lossRatioCritical: 0.85,
    
    highRiskDriverPercentWarning: 0.15,
    highRiskDriverPercentCritical: 0.25,
  },
};

/** Score tier mappings (0-100 scale) */
export const SCORE_TIERS = {
  LOW: { min: 0, max: 29 },
  MODERATE: { min: 30, max: 49 },
  HIGH: { min: 50, max: 69 },
  SEVERE: { min: 70, max: 84 },
  CRITICAL: { min: 85, max: 100 },
};

// ============================================
// CLAIM NORMALIZATION
// ============================================

/**
 * Normalize a raw claim event into standard format.
 */
export function normalizeClaimEvent(
  raw: {
    driverId: string;
    marketId: string;
    claimType: ClaimType;
    faultDetermination: FaultDetermination;
    incidentDate: string;
    claimAmountCents: number;
    reserveAmountCents?: number;
    description?: string;
    externalClaimId?: string;
  },
  recordedBy: string
): InsuranceEvent {
  return {
    id: `ins-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    driverId: raw.driverId,
    marketId: raw.marketId,
    claimType: raw.claimType,
    status: 'REPORTED',
    faultDetermination: raw.faultDetermination,
    claimAmountCents: raw.claimAmountCents,
    reserveAmountCents: raw.reserveAmountCents ?? raw.claimAmountCents,
    paidAmountCents: 0,
    deductibleCents: 0,
    incidentDate: raw.incidentDate,
    reportedDate: new Date().toISOString().split('T')[0],
    closedDate: null,
    description: raw.description ?? '',
    externalClaimId: raw.externalClaimId ?? null,
    recordedAt: new Date().toISOString(),
    recordedBy,
  };
}

/**
 * Update claim status.
 */
export function updateClaimStatus(
  event: InsuranceEvent,
  newStatus: ClaimStatus,
  paidAmountCents?: number
): InsuranceEvent {
  const updated = { ...event, status: newStatus };
  
  if (paidAmountCents !== undefined) {
    updated.paidAmountCents = paidAmountCents;
  }
  
  if (newStatus === 'SETTLED' || newStatus === 'CLOSED' || newStatus === 'DENIED') {
    updated.closedDate = new Date().toISOString().split('T')[0];
  }
  
  return updated;
}

// ============================================
// ROLLING LOSS METRICS
// ============================================

/**
 * Filter events within a date window.
 */
function filterEventsByWindow(
  events: InsuranceEvent[],
  endDate: string,
  days: number
): InsuranceEvent[] {
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);
  const startStr = startDate.toISOString().split('T')[0];
  
  return events.filter(e => e.incidentDate >= startStr && e.incidentDate <= endDate);
}

/**
 * Calculate incurred amount (reserve for open, paid for closed).
 */
function calculateIncurred(event: InsuranceEvent): number {
  if (event.status === 'CLOSED' || event.status === 'SETTLED') {
    return event.paidAmountCents;
  }
  if (event.status === 'DENIED') {
    return 0;
  }
  return event.reserveAmountCents;
}

/** Optional additional driver data for enhanced loss metrics */
export interface DriverOperationalData {
  preventableIncidents30Days?: number;
  preventableIncidents90Days?: number;
  safetyViolations30Days?: number;
  safetyViolations90Days?: number;
  lateOrFailedMoves30Days?: number;
  lateOrFailedMoves90Days?: number;
  totalMoves30Days?: number;
  totalMoves90Days?: number;
}

/**
 * Calculate driver loss metrics from events and operational data.
 */
export function calculateDriverLossMetrics(
  driverId: string,
  events: InsuranceEvent[],
  asOfDate: string,
  operationalData: DriverOperationalData = {}
): DriverLossMetrics {
  const driverEvents = events.filter(e => e.driverId === driverId);
  
  const events30 = filterEventsByWindow(driverEvents, asOfDate, 30);
  const events90 = filterEventsByWindow(driverEvents, asOfDate, 90);
  const events365 = filterEventsByWindow(driverEvents, asOfDate, 365);
  
  const atFault30 = events30.filter(e => e.faultDetermination === 'AT_FAULT').length;
  const atFault90 = events90.filter(e => e.faultDetermination === 'AT_FAULT').length;
  const atFault365 = events365.filter(e => e.faultDetermination === 'AT_FAULT').length;
  
  const incurred30 = events30.reduce((sum, e) => sum + calculateIncurred(e), 0);
  const incurred90 = events90.reduce((sum, e) => sum + calculateIncurred(e), 0);
  const incurred365 = events365.reduce((sum, e) => sum + calculateIncurred(e), 0);
  
  return {
    driverId,
    calculatedAt: new Date().toISOString(),
    claims30Days: events30.length,
    claims90Days: events90.length,
    claims365Days: events365.length,
    atFaultClaims30Days: atFault30,
    atFaultClaims90Days: atFault90,
    atFaultClaims365Days: atFault365,
    totalIncurredCents30Days: incurred30,
    totalIncurredCents90Days: incurred90,
    totalIncurredCents365Days: incurred365,
    averageClaimCents: events365.length > 0 ? Math.round(incurred365 / events365.length) : 0,
    claimsPerMonth: events365.length / 12,
    // Enhanced inputs
    preventableIncidents30Days: operationalData.preventableIncidents30Days ?? 0,
    preventableIncidents90Days: operationalData.preventableIncidents90Days ?? 0,
    safetyViolations30Days: operationalData.safetyViolations30Days ?? 0,
    safetyViolations90Days: operationalData.safetyViolations90Days ?? 0,
    lateOrFailedMoves30Days: operationalData.lateOrFailedMoves30Days ?? 0,
    lateOrFailedMoves90Days: operationalData.lateOrFailedMoves90Days ?? 0,
    totalMoves30Days: operationalData.totalMoves30Days ?? 0,
    totalMoves90Days: operationalData.totalMoves90Days ?? 0,
  };
}

/** Optional additional market data for enhanced loss metrics */
export interface MarketOperationalData {
  lateMoves30Days?: number;
  totalMoves30Days?: number;
  totalIncidents30Days?: number;
}

/**
 * Calculate market loss metrics from events.
 */
export function calculateMarketLossMetrics(
  marketId: string,
  events: InsuranceEvent[],
  driverIds: string[],
  asOfDate: string,
  estimatedEarnedPremiumCents: number = 0,
  operationalData: MarketOperationalData = {}
): MarketLossMetrics {
  const marketEvents = events.filter(e => e.marketId === marketId);
  const marketDriverIds = new Set(driverIds);
  
  const events30 = filterEventsByWindow(marketEvents, asOfDate, 30);
  const events90 = filterEventsByWindow(marketEvents, asOfDate, 90);
  const events365 = filterEventsByWindow(marketEvents, asOfDate, 365);
  
  const incurred30 = events30.reduce((sum, e) => sum + calculateIncurred(e), 0);
  const incurred90 = events90.reduce((sum, e) => sum + calculateIncurred(e), 0);
  const incurred365 = events365.reduce((sum, e) => sum + calculateIncurred(e), 0);
  
  // Count open claims and total reserves
  const openClaims = marketEvents.filter(e => 
    e.status === 'REPORTED' || e.status === 'UNDER_INVESTIGATION' || e.status === 'APPROVED'
  );
  const openClaimsCount = openClaims.length;
  const totalReserveCents = openClaims.reduce((sum, e) => sum + e.reserveAmountCents, 0);
  
  const driversWithClaims = new Set(events365.map(e => e.driverId)).size;
  const totalDrivers = marketDriverIds.size || 1;
  
  const claimsPerDriverMonth = (events365.length / totalDrivers) / 12;
  const incurredPerDriverMonth = Math.round((incurred365 / totalDrivers) / 12);
  
  const estimatedLossRatio = estimatedEarnedPremiumCents > 0 
    ? incurred365 / estimatedEarnedPremiumCents 
    : 0;
  
  // Enhanced inputs: late move % and incident rate
  const lateMoves30Days = operationalData.lateMoves30Days ?? 0;
  const totalMoves30Days = operationalData.totalMoves30Days ?? 0;
  const lateMovePercent = totalMoves30Days > 0 ? (lateMoves30Days / totalMoves30Days) * 100 : 0;
  
  const totalIncidents30Days = operationalData.totalIncidents30Days ?? 0;
  const driverIncidentRate = totalDrivers > 0 ? (totalIncidents30Days / totalDrivers) * 100 : 0;
  
  return {
    marketId,
    calculatedAt: new Date().toISOString(),
    totalDrivers,
    driversWithClaims,
    claims30Days: events30.length,
    claims90Days: events90.length,
    claims365Days: events365.length,
    openClaimsCount,
    totalReserveCents,
    totalIncurredCents30Days: incurred30,
    totalIncurredCents90Days: incurred90,
    totalIncurredCents365Days: incurred365,
    claimsPerDriverMonth,
    incurredPerDriverMonth,
    estimatedLossRatio,
    // Enhanced inputs
    lateMovePercent,
    lateMoves30Days,
    totalMoves30Days,
    driverIncidentRate,
    totalIncidents30Days,
  };
}

// ============================================
// LOSS SCORE CALCULATION
// ============================================

/**
 * Determine tier from score.
 */
export function getTierFromScore(score: number): 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE' | 'CRITICAL' {
  if (score <= SCORE_TIERS.LOW.max) return 'LOW';
  if (score <= SCORE_TIERS.MODERATE.max) return 'MODERATE';
  if (score <= SCORE_TIERS.HIGH.max) return 'HIGH';
  if (score <= SCORE_TIERS.SEVERE.max) return 'SEVERE';
  return 'CRITICAL';
}

/**
 * Calculate driver loss score (0-100, higher = worse).
 * 
 * Enhanced Components (v2):
 * - Frequency (40%): at-fault claims count, time-weighted (recent claims count more)
 * - Severity (25%): severity-weighted cost, normalized
 * - Incidents (20%): preventable incidents + late/failed moves
 * - Violations (15%): safety violations
 * 
 * DESIGN: Scores are SIGNALS, not LEVERS. They gate eligibility and multipliers
 * but NEVER directly calculate pay. Read-only for reporting in v1.
 */
export function calculateDriverLossScore(
  metrics: DriverLossMetrics,
  asOfDate: string,
  previousScore: DriverLossScore | null = null
): DriverLossScore {
  // Time-weighted at-fault claims: 30d claims count 3x, 90d claims count 1x
  // This gives recency bonus - recent claims count more
  const recencyMultiplier = 3.0;
  const timeWeightedClaims = (metrics.atFaultClaims30Days * recencyMultiplier) + 
                             (metrics.atFaultClaims90Days - metrics.atFaultClaims30Days);
  
  // Frequency score (0-100): 1 time-weighted claim = ~25 points, 4+ = 100
  const frequencyScore = Math.min(100, Math.round(timeWeightedClaims * 25));
  
  // Severity score (0-100): based on severity-weighted cost
  // $10,000 average claim = 50 points, $20,000 = 100 points
  const severityWeightedCostCents = metrics.totalIncurredCents90Days;
  const severityScore = Math.min(100, Math.round((severityWeightedCostCents / 2000000) * 100));
  
  // Incident score (0-100): preventable incidents + late/failed moves
  // Combines preventable incidents (weighted higher) and late/failed moves
  const totalIncidentPoints = (metrics.preventableIncidents90Days * 30) + 
                               (metrics.lateOrFailedMoves90Days * 10);
  const incidentScore = Math.min(100, totalIncidentPoints);
  
  // Violation score (0-100): safety violations
  // 1 violation = 25 points, 4+ = 100
  const violationScore = Math.min(100, Math.round(metrics.safetyViolations90Days * 25));
  
  // Calculate late move percent for audit trail
  const lateMovePercent = metrics.totalMoves90Days > 0 
    ? (metrics.lateOrFailedMoves90Days / metrics.totalMoves90Days) * 100 
    : 0;
  
  // Weighted total: Frequency 40% + Severity 25% + Incidents 20% + Violations 15%
  const totalScore = Math.min(100, Math.round(
    (frequencyScore * 0.40) + 
    (severityScore * 0.25) + 
    (incidentScore * 0.20) + 
    (violationScore * 0.15)
  ));
  
  const tier = getTierFromScore(totalScore);
  const scoreChange = previousScore ? totalScore - previousScore.score : 0;
  
  return {
    driverId: metrics.driverId,
    calculatedAt: new Date().toISOString(),
    snapshotDate: asOfDate,
    score: totalScore,
    tier,
    frequencyScore,
    severityScore,
    incidentScore,
    violationScore,
    inputs: {
      atFaultClaims30Days: metrics.atFaultClaims30Days,
      atFaultClaims90Days: metrics.atFaultClaims90Days,
      severityWeightedCostCents,
      recencyMultiplier,
      preventableIncidents90Days: metrics.preventableIncidents90Days,
      safetyViolations90Days: metrics.safetyViolations90Days,
      lateOrFailedMoves90Days: metrics.lateOrFailedMoves90Days,
      lateMovePercent,
    },
    previousScore: previousScore?.score ?? null,
    scoreChange,
  };
}

/**
 * Calculate market loss score (0-100, higher = worse).
 * 
 * Enhanced Components (v2):
 * - Frequency (35%): at-fault claims per 100 moves
 * - Severity (25%): total incurred dollars + reserve exposure
 * - LateMoves (20%): late move % (missed SLA)
 * - IncidentRate (20%): driver incident rate
 * 
 * DESIGN: Measures aggregate market RISK, not profitability.
 * Does NOT include revenue, margin, customer pricing, or labor efficiency.
 * Read-only for reporting in v1.
 */
export function calculateMarketLossScore(
  metrics: MarketLossMetrics,
  driverScores: DriverLossScore[],
  asOfDate: string,
  moveCount30Days: number = 0,
  moveCount90Days: number = 0,
  previousWeekIncurredCents: number = 0,
  previousScore: MarketLossScore | null = null
): MarketLossScore {
  // Frequency score (0-100): at-fault claims per 100 moves
  // 1 claim per 100 moves = 30 points, ~3.3+ = 100
  const atFaultClaimsPer100Moves30Days = moveCount30Days > 0 
    ? (metrics.claims30Days / moveCount30Days) * 100 
    : 0;
  const atFaultClaimsPer100Moves90Days = moveCount90Days > 0 
    ? (metrics.claims90Days / moveCount90Days) * 100 
    : 0;
  const frequencyScore = Math.min(100, Math.round(atFaultClaimsPer100Moves30Days * 30));
  
  // Severity score (0-100): based on total incurred dollars + reserve exposure
  // Combines incurred costs with open claim reserves for full risk picture
  const totalIncurredCents = metrics.totalIncurredCents90Days;
  const totalExposureCents = totalIncurredCents + metrics.totalReserveCents;
  // $50,000 exposure = 50 points, $100,000 = 100 points
  const severityScore = Math.min(100, Math.round((totalExposureCents / 10000000) * 100));
  
  // Late move score (0-100): based on late move percentage
  // 5% late = 25 points, 10% = 50 points, 20%+ = 100 points
  const lateMoveScore = Math.min(100, Math.round(metrics.lateMovePercent * 5));
  
  // Incident rate score (0-100): based on driver incident rate per 100 drivers
  // 5 incidents per 100 drivers = 25 points, 20+ = 100 points
  const incidentRateScore = Math.min(100, Math.round(metrics.driverIncidentRate * 5));
  
  // Weighted total: Frequency 35% + Severity 25% + LateMoves 20% + IncidentRate 20%
  const totalScore = Math.min(100, Math.round(
    (frequencyScore * 0.35) + 
    (severityScore * 0.25) + 
    (lateMoveScore * 0.20) + 
    (incidentRateScore * 0.20)
  ));
  
  const tier = getTierFromScore(totalScore);
  
  // Count high-risk drivers
  const highRiskDriverCount = driverScores.filter(d => d.tier === 'HIGH' || d.tier === 'SEVERE').length;
  const severeRiskDriverCount = driverScores.filter(d => d.tier === 'SEVERE' || d.tier === 'CRITICAL').length;
  
  const scoreChange = previousScore ? totalScore - previousScore.score : 0;
  
  return {
    marketId: metrics.marketId,
    calculatedAt: new Date().toISOString(),
    snapshotDate: asOfDate,
    score: totalScore,
    tier,
    frequencyScore,
    severityScore,
    lateMoveScore,
    incidentRateScore,
    inputs: {
      atFaultClaimsPer100Moves30Days,
      atFaultClaimsPer100Moves90Days,
      totalIncurredCents,
      openClaimsCount: metrics.openClaimsCount,
      totalReserveCents: metrics.totalReserveCents,
      lateMovePercent: metrics.lateMovePercent,
      driverIncidentRate: metrics.driverIncidentRate,
    },
    previousScore: previousScore?.score ?? null,
    scoreChange,
    highRiskDriverCount,
    severeRiskDriverCount,
  };
}

// ============================================
// AUTOMATIC RISK CONTROLS
// ============================================

/** Risk control configuration */
export interface RiskControlConfig {
  controlType: RiskControlType;
  triggerTier: 'MODERATE' | 'HIGH' | 'SEVERE' | 'CRITICAL';
  adjustmentValue: number;
  durationDays: number;
  applyToDriver: boolean;
  applyToMarket: boolean;
}

/** Default risk control configurations */
export const DEFAULT_RISK_CONTROLS: RiskControlConfig[] = [
  {
    controlType: 'ENHANCED_MONITORING',
    triggerTier: 'MODERATE',
    adjustmentValue: 1, // flag
    durationDays: 30,
    applyToDriver: true,
    applyToMarket: false,
  },
  {
    controlType: 'RATE_ADJUSTMENT',
    triggerTier: 'HIGH',
    adjustmentValue: 0.10, // 10% increase
    durationDays: 60,
    applyToDriver: true,
    applyToMarket: false,
  },
  {
    controlType: 'DEDUCTIBLE_INCREASE',
    triggerTier: 'SEVERE',
    adjustmentValue: 0.50, // 50% increase
    durationDays: 90,
    applyToDriver: true,
    applyToMarket: true,
  },
  {
    controlType: 'ASSIGNMENT_RESTRICTION',
    triggerTier: 'CRITICAL',
    adjustmentValue: 1, // restricted
    durationDays: 30,
    applyToDriver: true,
    applyToMarket: false,
  },
  {
    controlType: 'MARKET_PAUSE',
    triggerTier: 'CRITICAL',
    adjustmentValue: 1, // paused
    durationDays: 14,
    applyToDriver: false,
    applyToMarket: true,
  },
];

/**
 * Determine applicable controls for a driver score.
 */
export function determineDriverControls(
  score: DriverLossScore,
  effectiveDate: string,
  configs: RiskControlConfig[] = DEFAULT_RISK_CONTROLS
): RiskControl[] {
  const controls: RiskControl[] = [];
  
  const tierOrder: Record<string, number> = {
    LOW: 0,
    MODERATE: 1,
    HIGH: 2,
    SEVERE: 3,
    CRITICAL: 4,
  };
  
  const currentTierLevel = tierOrder[score.tier];
  
  for (const config of configs) {
    if (!config.applyToDriver) continue;
    
    const triggerLevel = tierOrder[config.triggerTier];
    if (currentTierLevel >= triggerLevel) {
      const expirationDate = new Date(effectiveDate);
      expirationDate.setDate(expirationDate.getDate() + config.durationDays);
      
      controls.push({
        id: `rc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        controlType: config.controlType,
        targetType: 'DRIVER',
        targetId: score.driverId,
        adjustmentValue: config.adjustmentValue,
        effectiveDate,
        expirationDate: expirationDate.toISOString().split('T')[0],
        triggeredByScore: score.score,
        triggeredByTier: score.tier,
        triggerReason: `Driver loss score ${score.score} in tier ${score.tier} triggered ${config.controlType}`,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        createdBy: 'SYSTEM',
        revokedAt: null,
        revokedBy: null,
        revocationReason: null,
      });
    }
  }
  
  return controls;
}

/**
 * Determine applicable controls for a market score.
 */
export function determineMarketControls(
  score: MarketLossScore,
  effectiveDate: string,
  configs: RiskControlConfig[] = DEFAULT_RISK_CONTROLS
): RiskControl[] {
  const controls: RiskControl[] = [];
  
  const tierOrder: Record<string, number> = {
    LOW: 0,
    MODERATE: 1,
    HIGH: 2,
    SEVERE: 3,
    CRITICAL: 4,
  };
  
  const currentTierLevel = tierOrder[score.tier];
  
  for (const config of configs) {
    if (!config.applyToMarket) continue;
    
    const triggerLevel = tierOrder[config.triggerTier];
    if (currentTierLevel >= triggerLevel) {
      const expirationDate = new Date(effectiveDate);
      expirationDate.setDate(expirationDate.getDate() + config.durationDays);
      
      controls.push({
        id: `rc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        controlType: config.controlType,
        targetType: 'MARKET',
        targetId: score.marketId,
        adjustmentValue: config.adjustmentValue,
        effectiveDate,
        expirationDate: expirationDate.toISOString().split('T')[0],
        triggeredByScore: score.score,
        triggeredByTier: score.tier,
        triggerReason: `Market loss score ${score.score} in tier ${score.tier} triggered ${config.controlType}`,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        createdBy: 'SYSTEM',
        revokedAt: null,
        revokedBy: null,
        revocationReason: null,
      });
    }
  }
  
  return controls;
}

/**
 * Activate a pending control (makes it effective on the effective date).
 */
export function activateControl(control: RiskControl): RiskControl {
  if (control.status !== 'PENDING') {
    throw new Error(`Cannot activate control in status: ${control.status}`);
  }
  
  return {
    ...control,
    status: 'ACTIVE',
  };
}

/**
 * Revoke an active control.
 */
export function revokeControl(
  control: RiskControl,
  revokedBy: string,
  reason: string
): RiskControl {
  if (control.status !== 'ACTIVE' && control.status !== 'PENDING') {
    throw new Error(`Cannot revoke control in status: ${control.status}`);
  }
  
  return {
    ...control,
    status: 'REVOKED',
    revokedAt: new Date().toISOString(),
    revokedBy,
    revocationReason: reason,
  };
}

/**
 * Check if control is currently active.
 */
export function isControlActive(control: RiskControl, checkDate: string): boolean {
  if (control.status !== 'ACTIVE') return false;
  if (checkDate < control.effectiveDate) return false;
  if (checkDate > control.expirationDate) return false;
  return true;
}

/**
 * Get all active controls for a driver.
 */
export function getActiveDriverControls(
  driverId: string,
  controls: RiskControl[],
  checkDate: string
): RiskControl[] {
  return controls.filter(c => 
    c.targetType === 'DRIVER' && 
    c.targetId === driverId && 
    isControlActive(c, checkDate)
  );
}

/**
 * Get all active controls for a market.
 */
export function getActiveMarketControls(
  marketId: string,
  controls: RiskControl[],
  checkDate: string
): RiskControl[] {
  return controls.filter(c => 
    c.targetType === 'MARKET' && 
    c.targetId === marketId && 
    isControlActive(c, checkDate)
  );
}

// ============================================
// WARNING EVENT EMISSION
// ============================================

/** In-memory warning events */
const warningEvents: WarningEvent[] = [];

/**
 * Emit a warning event.
 */
export function emitWarningEvent(
  eventType: WarningEventType,
  targetType: 'DRIVER' | 'MARKET',
  targetId: string,
  severity: 'INFO' | 'WARNING' | 'CRITICAL',
  message: string,
  thresholdValue: number,
  actualValue: number,
  relatedScoreId: string | null = null,
  relatedControlId: string | null = null
): WarningEvent {
  const event: WarningEvent = {
    id: `warn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    eventType,
    targetType,
    targetId,
    severity,
    message,
    thresholdValue,
    actualValue,
    relatedScoreId,
    relatedControlId,
    emittedAt: new Date().toISOString(),
    acknowledged: false,
    acknowledgedBy: null,
    acknowledgedAt: null,
  };
  
  warningEvents.push(event);
  return event;
}

/**
 * Check thresholds and emit warnings for driver score.
 */
export function checkDriverThresholdsAndWarn(
  score: DriverLossScore,
  previousScore: DriverLossScore | null,
  thresholds: typeof DEFAULT_THRESHOLDS.driver = DEFAULT_THRESHOLDS.driver
): WarningEvent[] {
  const events: WarningEvent[] = [];
  
  // Tier change warning
  if (previousScore && score.tier !== previousScore.tier) {
    const tierOrder = ['LOW', 'MODERATE', 'HIGH', 'SEVERE', 'CRITICAL'];
    const previousIdx = tierOrder.indexOf(previousScore.tier);
    const currentIdx = tierOrder.indexOf(score.tier);
    
    if (currentIdx > previousIdx) {
      events.push(emitWarningEvent(
        'TIER_CHANGE',
        'DRIVER',
        score.driverId,
        currentIdx >= 3 ? 'CRITICAL' : 'WARNING',
        `Driver tier changed from ${previousScore.tier} to ${score.tier}`,
        previousIdx,
        currentIdx
      ));
    }
  }
  
  // Score threshold warnings
  if (score.score >= thresholds.criticalScoreThreshold) {
    events.push(emitWarningEvent(
      'SCORE_THRESHOLD_CROSSED',
      'DRIVER',
      score.driverId,
      'CRITICAL',
      `Driver score ${score.score} exceeds critical threshold ${thresholds.criticalScoreThreshold}`,
      thresholds.criticalScoreThreshold,
      score.score
    ));
  } else if (score.score >= thresholds.severeScoreThreshold) {
    events.push(emitWarningEvent(
      'SCORE_THRESHOLD_CROSSED',
      'DRIVER',
      score.driverId,
      'WARNING',
      `Driver score ${score.score} exceeds severe threshold ${thresholds.severeScoreThreshold}`,
      thresholds.severeScoreThreshold,
      score.score
    ));
  }
  
  return events;
}

/**
 * Check thresholds and emit warnings for market score.
 */
export function checkMarketThresholdsAndWarn(
  score: MarketLossScore,
  metrics: MarketLossMetrics,
  previousScore: MarketLossScore | null,
  thresholds: typeof DEFAULT_THRESHOLDS.market = DEFAULT_THRESHOLDS.market
): WarningEvent[] {
  const events: WarningEvent[] = [];
  
  // Tier change warning
  if (previousScore && score.tier !== previousScore.tier) {
    const tierOrder = ['LOW', 'MODERATE', 'HIGH', 'SEVERE', 'CRITICAL'];
    const previousIdx = tierOrder.indexOf(previousScore.tier);
    const currentIdx = tierOrder.indexOf(score.tier);
    
    if (currentIdx > previousIdx) {
      events.push(emitWarningEvent(
        'TIER_CHANGE',
        'MARKET',
        score.marketId,
        currentIdx >= 3 ? 'CRITICAL' : 'WARNING',
        `Market tier changed from ${previousScore.tier} to ${score.tier}`,
        previousIdx,
        currentIdx
      ));
    }
  }
  
  // Loss ratio warning
  if (metrics.estimatedLossRatio >= thresholds.lossRatioCritical) {
    events.push(emitWarningEvent(
      'LOSS_RATIO_WARNING',
      'MARKET',
      score.marketId,
      'CRITICAL',
      `Market loss ratio ${(metrics.estimatedLossRatio * 100).toFixed(1)}% exceeds critical threshold`,
      thresholds.lossRatioCritical,
      metrics.estimatedLossRatio
    ));
  } else if (metrics.estimatedLossRatio >= thresholds.lossRatioWarning) {
    events.push(emitWarningEvent(
      'LOSS_RATIO_WARNING',
      'MARKET',
      score.marketId,
      'WARNING',
      `Market loss ratio ${(metrics.estimatedLossRatio * 100).toFixed(1)}% exceeds warning threshold`,
      thresholds.lossRatioWarning,
      metrics.estimatedLossRatio
    ));
  }
  
  // High risk driver concentration warning
  const highRiskPercent = metrics.totalDrivers > 0 
    ? score.highRiskDriverCount / metrics.totalDrivers 
    : 0;
  
  if (highRiskPercent >= thresholds.highRiskDriverPercentCritical) {
    events.push(emitWarningEvent(
      'SEVERITY_SPIKE',
      'MARKET',
      score.marketId,
      'CRITICAL',
      `${(highRiskPercent * 100).toFixed(1)}% of drivers are high-risk`,
      thresholds.highRiskDriverPercentCritical,
      highRiskPercent
    ));
  }
  
  return events;
}

/**
 * Acknowledge a warning event.
 */
export function acknowledgeWarning(
  eventId: string,
  acknowledgedBy: string
): WarningEvent | null {
  const event = warningEvents.find(e => e.id === eventId);
  if (!event) return null;
  
  event.acknowledged = true;
  event.acknowledgedBy = acknowledgedBy;
  event.acknowledgedAt = new Date().toISOString();
  
  return event;
}

/**
 * Get unacknowledged warnings.
 */
export function getUnacknowledgedWarnings(
  targetType?: 'DRIVER' | 'MARKET',
  targetId?: string
): WarningEvent[] {
  return warningEvents.filter(e => {
    if (e.acknowledged) return false;
    if (targetType && e.targetType !== targetType) return false;
    if (targetId && e.targetId !== targetId) return false;
    return true;
  });
}

/**
 * Clear all warning events (for testing).
 */
export function clearWarningEvents(): void {
  warningEvents.length = 0;
}

// ============================================
// AUDIT TRAIL
// ============================================

/** In-memory audit log */
const insuranceAuditLog: InsuranceAuditEntry[] = [];

/**
 * Create an audit entry.
 */
export function createInsuranceAuditEntry(
  action: InsuranceAuditEntry['action'],
  targetType: 'DRIVER' | 'MARKET' | 'SYSTEM',
  targetId: string,
  performedBy: string,
  previousValue: any,
  newValue: any,
  metadata: Record<string, any> = {}
): InsuranceAuditEntry {
  const entry: InsuranceAuditEntry = {
    id: `ia-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    action,
    targetType,
    targetId,
    performedBy,
    performedAt: new Date().toISOString(),
    previousValue,
    newValue,
    metadata,
  };
  
  insuranceAuditLog.push(entry);
  return entry;
}

/**
 * Get audit entries for a target.
 */
export function getInsuranceAuditEntries(
  targetType: 'DRIVER' | 'MARKET' | 'SYSTEM',
  targetId: string
): InsuranceAuditEntry[] {
  return insuranceAuditLog
    .filter(e => e.targetType === targetType && e.targetId === targetId)
    .sort((a, b) => a.performedAt.localeCompare(b.performedAt));
}

/**
 * Get all audit entries.
 */
export function getAllInsuranceAuditEntries(): InsuranceAuditEntry[] {
  return [...insuranceAuditLog].sort((a, b) => a.performedAt.localeCompare(b.performedAt));
}

/**
 * Clear audit log (for testing).
 */
export function clearInsuranceAuditLog(): void {
  insuranceAuditLog.length = 0;
}

// ============================================
// COMPLETE PROCESSING PIPELINE
// ============================================

/** Processing result */
export interface InsuranceProcessingResult {
  driverMetrics: DriverLossMetrics[];
  driverScores: DriverLossScore[];
  marketMetrics: MarketLossMetrics[];
  marketScores: MarketLossScore[];
  controlsGenerated: RiskControl[];
  warningsEmitted: WarningEvent[];
  auditEntries: InsuranceAuditEntry[];
}

/**
 * Process all insurance events and generate scores, controls, and warnings.
 */
export function processInsuranceEvents(
  events: InsuranceEvent[],
  driverIdsByMarket: Map<string, string[]>,
  asOfDate: string,
  previousDriverScores: Map<string, DriverLossScore> = new Map(),
  previousMarketScores: Map<string, MarketLossScore> = new Map(),
  earnedPremiumByMarket: Map<string, number> = new Map()
): InsuranceProcessingResult {
  const driverMetrics: DriverLossMetrics[] = [];
  const driverScores: DriverLossScore[] = [];
  const marketMetrics: MarketLossMetrics[] = [];
  const marketScores: MarketLossScore[] = [];
  const controlsGenerated: RiskControl[] = [];
  const warningsEmitted: WarningEvent[] = [];
  const auditEntries: InsuranceAuditEntry[] = [];
  
  // Calculate next day as effective date for prospective controls
  const effectiveDate = new Date(asOfDate);
  effectiveDate.setDate(effectiveDate.getDate() + 1);
  const effectiveDateStr = effectiveDate.toISOString().split('T')[0];
  
  // Get all unique driver IDs
  const allDriverIds = new Set<string>();
  Array.from(driverIdsByMarket.values()).forEach(driverIds => {
    driverIds.forEach((id: string) => allDriverIds.add(id));
  });
  
  // Process each driver
  for (const driverId of Array.from(allDriverIds)) {
    const metrics = calculateDriverLossMetrics(driverId, events, asOfDate);
    driverMetrics.push(metrics);
    
    const previousScore = previousDriverScores.get(driverId) ?? null;
    const score = calculateDriverLossScore(metrics, asOfDate, previousScore);
    driverScores.push(score);
    
    // Create audit entry for score calculation
    auditEntries.push(createInsuranceAuditEntry(
      'SCORE_CALCULATED',
      'DRIVER',
      driverId,
      'SYSTEM',
      previousScore,
      score,
      { metrics }
    ));
    
    // Check thresholds and emit warnings
    const warnings = checkDriverThresholdsAndWarn(score, previousScore);
    warningsEmitted.push(...warnings);
    
    // Determine controls
    const controls = determineDriverControls(score, effectiveDateStr);
    controlsGenerated.push(...controls);
    
    for (const control of controls) {
      auditEntries.push(createInsuranceAuditEntry(
        'CONTROL_APPLIED',
        'DRIVER',
        driverId,
        'SYSTEM',
        null,
        control,
        { triggeredByScore: score.score }
      ));
    }
  }
  
  // Process each market
  for (const [marketId, driverIds] of Array.from(driverIdsByMarket.entries())) {
    const earnedPremium = earnedPremiumByMarket.get(marketId) ?? 0;
    const metrics = calculateMarketLossMetrics(marketId, events, driverIds, asOfDate, earnedPremium);
    marketMetrics.push(metrics);
    
    const marketDriverScores = driverScores.filter(s => 
      driverIds.includes(s.driverId)
    );
    
    const previousScore = previousMarketScores.get(marketId) ?? null;
    // Pass minimal move counts for simplified processing (can be enhanced later)
    const score = calculateMarketLossScore(metrics, marketDriverScores, asOfDate, 0, 0, 0, previousScore);
    marketScores.push(score);
    
    // Create audit entry
    auditEntries.push(createInsuranceAuditEntry(
      'SCORE_CALCULATED',
      'MARKET',
      marketId,
      'SYSTEM',
      previousScore,
      score,
      { metrics }
    ));
    
    // Check thresholds and emit warnings
    const warnings = checkMarketThresholdsAndWarn(score, metrics, previousScore);
    warningsEmitted.push(...warnings);
    
    // Determine controls
    const controls = determineMarketControls(score, effectiveDateStr);
    controlsGenerated.push(...controls);
    
    for (const control of controls) {
      auditEntries.push(createInsuranceAuditEntry(
        'CONTROL_APPLIED',
        'MARKET',
        marketId,
        'SYSTEM',
        null,
        control,
        { triggeredByScore: score.score }
      ));
    }
  }
  
  return {
    driverMetrics,
    driverScores,
    marketMetrics,
    marketScores,
    controlsGenerated,
    warningsEmitted,
    auditEntries,
  };
}
