/**
 * Recruiting & Hiring Controls Engine (INCREMENT 13)
 * 
 * Backend-only system for:
 * 1. Market capacity model and utilization metrics
 * 2. canOpenHiring gate based on utilization, safety, and playbook rules
 * 3. Entry tier and rate determination per market
 * 4. Validate and reject out-of-policy offers
 * 5. Full hiring audit trail
 * 
 * NOT implementing: ATS integrations, onboarding UI, manual overrides
 */

import { 
  findEffectivePlaybook, 
  canActivateMarket,
  type MarketPlaybook 
} from './marketPlaybookEngine';
import { 
  type MarketLossScore,
  type RiskControl,
} from './insuranceRiskEngine';

// ============================================
// TYPES & CONSTANTS
// ============================================

/** Work type for hiring */
export type WorkType = 'W2_EMPLOYEE' | 'IC_CONTRACTOR' | 'BOTH';

/** Driver tier levels */
export type DriverTier = 'Elite' | 'High Performer' | 'Standard' | 'Developing' | 'At Risk';

/** Entry tier - new hires can only start at certain tiers */
export type EntryTier = 'Standard' | 'Developing' | 'At Risk';

/** Hiring status for a market */
export type HiringStatus = 'OPEN' | 'LIMITED' | 'PAUSED' | 'CLOSED';

/** Hiring rejection reason */
export type HiringRejectionReason = 
  | 'MARKET_NOT_ACTIVE'
  | 'MARKET_PLAYBOOK_INVALID'
  | 'MARKET_PAUSED'
  | 'MARKET_LOSS_SCORE_CRITICAL'
  | 'MARKET_AT_CAPACITY'
  | 'UTILIZATION_TOO_HIGH'
  | 'SAFETY_THRESHOLD_EXCEEDED'
  | 'WORK_TYPE_NOT_SUPPORTED'
  | 'NO_COMPENSATION_POLICY'
  | 'HIRING_FROZEN';

/** Offer validation error */
export type OfferValidationError = 
  | 'MARKET_NOT_ACTIVE'
  | 'RATE_BELOW_MINIMUM'
  | 'RATE_ABOVE_MAXIMUM'
  | 'RATE_BELOW_TIER_MINIMUM'
  | 'RATE_BELOW_HOURLY_FLOOR'
  | 'RATE_ABOVE_ENTRY_CAP'
  | 'INVALID_TIER'
  | 'TIER_NOT_ALLOWED_FOR_ENTRY';

/** Hiring audit action types */
export type HiringAuditAction = 
  | 'HIRING_STATUS_CHANGED'
  | 'CAPACITY_UPDATED'
  | 'OFFER_CREATED'
  | 'OFFER_VALIDATED'
  | 'OFFER_REJECTED'
  | 'OFFER_APPROVED'
  | 'HIRE_COMPLETED'
  | 'ENTRY_TIER_DETERMINED'
  | 'HIRING_CHECK_PERFORMED';

// ============================================
// MARKET CAPACITY MODEL
// ============================================

/** Market capacity configuration */
export interface MarketCapacity {
  marketId: string;
  maxDrivers: number;
  targetUtilization: number; // 0.0-1.0, e.g., 0.85 = 85%
  warningThreshold: number;  // Utilization level for warnings, e.g., 0.90
  criticalThreshold: number; // Utilization level to pause hiring, e.g., 0.95
  reserveCapacity: number;   // Number of drivers to keep as buffer
  updatedAt: string;
  updatedBy: string;
}

/** Current driver counts for a market */
export interface MarketDriverCounts {
  marketId: string;
  totalDrivers: number;
  activeDrivers: number;      // ACTIVE safety state
  restrictedDrivers: number;  // RESTRICTED safety state
  suspendedDrivers: number;   // SUSPENDED safety state
  disqualifiedDrivers: number; // DISQUALIFIED safety state
  w2Drivers: number;
  icDrivers: number;
  countedAt: string;
}

/** Utilization metrics for a market */
export interface MarketUtilization {
  marketId: string;
  calculatedAt: string;
  currentDriverCount: number;
  maxCapacity: number;
  utilizationRate: number;      // current / max, 0.0-1.0
  effectiveCapacity: number;    // max - reserve
  effectiveUtilization: number; // current / effective, 0.0-1.0
  availableSlots: number;       // effective - current
  status: HiringStatus;
  statusReason: string;
}

/** Entry tier configuration per market */
export interface MarketEntryTierConfig {
  marketId: string;
  defaultEntryTier: EntryTier;
  allowedEntryTiers: EntryTier[];
  entryRateCents: Record<EntryTier, number>;
  maxEntryRateCents: number;  // Cap for new hires
  probationaryPeriodDays: number;
  effectiveDate: string;
  updatedAt: string;
  updatedBy: string;
}

// ============================================
// HIRING CHECK RESULTS
// ============================================

/** Result of canOpenHiring check */
export interface HiringCheckResult {
  canHire: boolean;
  marketId: string;
  workType: WorkType;
  checkedAt: string;
  rejectionReason: HiringRejectionReason | null;
  rejectionDetails: string | null;
  marketPlaybook: MarketPlaybook | null;
  utilization: MarketUtilization | null;
  marketLossScore: number | null;
  marketLossTier: string | null;
  hiringStatus: HiringStatus;
  availableSlots: number;
}

/** Result of entry tier determination */
export interface EntryTierResult {
  marketId: string;
  determinedAt: string;
  entryTier: EntryTier;
  entryRateCents: number;
  maxRateCents: number;
  minRateCents: number;
  probationaryPeriodDays: number;
  tierReason: string;
}

/** Result of offer validation */
export interface OfferValidationResult {
  valid: boolean;
  marketId: string;
  offeredRateCents: number;
  tier: DriverTier;
  workType: WorkType;
  checkedAt: string;
  error: OfferValidationError | null;
  errorDetails: string | null;
  marketPlaybook: MarketPlaybook | null;
  marketMinRateCents: number | null;
  marketMaxRateCents: number | null;
  tierMinRateCents: number | null;
  entryMaxRateCents: number | null;
  hourlyFloorCents: number | null;
  isEntryTier: boolean;
}

// ============================================
// HIRING AUDIT TRAIL
// ============================================

/** Hiring audit entry */
export interface HiringAuditEntry {
  id: string;
  timestamp: string;
  action: HiringAuditAction;
  marketId: string;
  candidateId: string | null;
  performedBy: string;
  previousState: unknown | null;
  newState: unknown | null;
  metadata: Record<string, unknown>;
}

// In-memory audit log (would be database in production)
const hiringAuditLog: HiringAuditEntry[] = [];

// ============================================
// CONSTANTS
// ============================================

/** Default capacity configuration */
export const DEFAULT_CAPACITY_CONFIG: Omit<MarketCapacity, 'marketId' | 'updatedAt' | 'updatedBy'> = {
  maxDrivers: 100,
  targetUtilization: 0.85,
  warningThreshold: 0.90,
  criticalThreshold: 0.95,
  reserveCapacity: 5,
};

/** Tier minimum rates (cents per hour) */
export const TIER_MIN_RATES: Record<DriverTier, number> = {
  'Elite': 3000,
  'High Performer': 2750,
  'Standard': 2500,
  'Developing': 2250,
  'At Risk': 2000,
};

/** Default entry tier rates (cents per hour) */
export const DEFAULT_ENTRY_RATES: Record<EntryTier, number> = {
  'Standard': 2500,
  'Developing': 2250,
  'At Risk': 2000,
};

/** Valid entry tiers for new hires */
export const VALID_ENTRY_TIERS: EntryTier[] = ['Standard', 'Developing', 'At Risk'];

/** Valid tiers */
export const VALID_TIERS: DriverTier[] = ['Elite', 'High Performer', 'Standard', 'Developing', 'At Risk'];

/** Safety score thresholds for hiring */
export const SAFETY_HIRING_THRESHOLDS = {
  maxMarketLossScore: 80,      // Pause hiring if market loss score exceeds this
  maxHighRiskDriverPercent: 0.25, // Limit hiring if >25% drivers are high risk
};

// ============================================
// MARKET CAPACITY FUNCTIONS
// ============================================

/**
 * Calculate utilization metrics for a market.
 */
export function calculateMarketUtilization(
  driverCounts: MarketDriverCounts,
  capacity: MarketCapacity
): MarketUtilization {
  const currentDriverCount = driverCounts.activeDrivers + driverCounts.restrictedDrivers;
  const maxCapacity = capacity.maxDrivers;
  const effectiveCapacity = maxCapacity - capacity.reserveCapacity;
  
  const utilizationRate = maxCapacity > 0 ? currentDriverCount / maxCapacity : 0;
  const effectiveUtilization = effectiveCapacity > 0 ? currentDriverCount / effectiveCapacity : 0;
  const availableSlots = Math.max(0, effectiveCapacity - currentDriverCount);
  
  // Determine hiring status based on utilization
  let status: HiringStatus;
  let statusReason: string;
  
  if (effectiveUtilization >= capacity.criticalThreshold) {
    status = 'CLOSED';
    statusReason = `Utilization (${(effectiveUtilization * 100).toFixed(1)}%) exceeds critical threshold (${(capacity.criticalThreshold * 100).toFixed(0)}%)`;
  } else if (effectiveUtilization >= capacity.warningThreshold) {
    status = 'LIMITED';
    statusReason = `Utilization (${(effectiveUtilization * 100).toFixed(1)}%) exceeds warning threshold (${(capacity.warningThreshold * 100).toFixed(0)}%)`;
  } else if (availableSlots === 0) {
    status = 'PAUSED';
    statusReason = 'No available slots (at effective capacity)';
  } else {
    status = 'OPEN';
    statusReason = `${availableSlots} slots available`;
  }
  
  return {
    marketId: driverCounts.marketId,
    calculatedAt: new Date().toISOString(),
    currentDriverCount,
    maxCapacity,
    utilizationRate,
    effectiveCapacity,
    effectiveUtilization,
    availableSlots,
    status,
    statusReason,
  };
}

/**
 * Create default market capacity configuration.
 */
export function createDefaultCapacity(
  marketId: string,
  maxDrivers: number = 100,
  createdBy: string = 'SYSTEM'
): MarketCapacity {
  return {
    marketId,
    ...DEFAULT_CAPACITY_CONFIG,
    maxDrivers,
    updatedAt: new Date().toISOString(),
    updatedBy: createdBy,
  };
}

/**
 * Create default entry tier configuration for a market.
 */
export function createDefaultEntryTierConfig(
  marketId: string,
  createdBy: string = 'SYSTEM'
): MarketEntryTierConfig {
  return {
    marketId,
    defaultEntryTier: 'Standard',
    allowedEntryTiers: ['Standard', 'Developing', 'At Risk'],
    entryRateCents: { ...DEFAULT_ENTRY_RATES },
    maxEntryRateCents: 2700, // Cap slightly above Standard
    probationaryPeriodDays: 90,
    effectiveDate: new Date().toISOString().split('T')[0],
    updatedAt: new Date().toISOString(),
    updatedBy: createdBy,
  };
}

// ============================================
// ENHANCED HIRING GATE
// ============================================

/**
 * Enhanced hiring gate - determines if a market can open hiring.
 * 
 * Checks:
 * 1. Market playbook exists and is active
 * 2. Playbook is valid (no required errors)
 * 3. No MARKET_PAUSE risk control active
 * 4. Market loss score is not critical
 * 5. Utilization is below critical threshold
 * 6. Safety metrics are acceptable
 * 7. Compensation policy exists
 * 8. Available capacity exists
 */
export function canOpenHiring(
  marketId: string,
  workType: WorkType,
  date: string,
  marketPlaybooks: MarketPlaybook[],
  driverCounts: MarketDriverCounts,
  capacity: MarketCapacity,
  marketLossScore?: MarketLossScore | null,
  activeControls?: RiskControl[],
  highRiskDriverCount?: number
): HiringCheckResult {
  const checkedAt = new Date().toISOString();
  
  // Calculate utilization
  const utilization = calculateMarketUtilization(driverCounts, capacity);
  
  // 1. Check market playbook exists and is active
  const effectivePlaybook = findEffectivePlaybook(marketPlaybooks, marketId, date);
  
  if (!effectivePlaybook) {
    return buildHiringResult(false, marketId, workType, checkedAt, 
      'MARKET_NOT_ACTIVE', 
      `No active market playbook found for market ${marketId} on ${date}`,
      null, utilization, marketLossScore);
  }
  
  // 2. Check market playbook validity
  const playbookValidation = canActivateMarket(effectivePlaybook);
  if (Array.isArray(playbookValidation)) {
    const requiredErrors = playbookValidation.filter(e => e.severity === 'REQUIRED');
    if (requiredErrors.length > 0) {
      return buildHiringResult(false, marketId, workType, checkedAt,
        'MARKET_PLAYBOOK_INVALID',
        `Market playbook has ${requiredErrors.length} required validation errors`,
        effectivePlaybook, utilization, marketLossScore);
    }
  }
  
  // 3. Check for MARKET_PAUSE risk control
  if (activeControls && activeControls.length > 0) {
    const pauseControl = activeControls.find(
      c => c.controlType === 'MARKET_PAUSE' && 
           c.targetType === 'MARKET' && 
           c.targetId === marketId &&
           c.status === 'ACTIVE'
    );
    
    if (pauseControl) {
      return buildHiringResult(false, marketId, workType, checkedAt,
        'MARKET_PAUSED',
        `Market is paused due to risk control: ${pauseControl.triggerReason}`,
        effectivePlaybook, utilization, marketLossScore);
    }
  }
  
  // 4. Check market loss score - CRITICAL tier or high score blocks hiring
  if (marketLossScore) {
    if (marketLossScore.tier === 'CRITICAL' || marketLossScore.score >= SAFETY_HIRING_THRESHOLDS.maxMarketLossScore) {
      return buildHiringResult(false, marketId, workType, checkedAt,
        'MARKET_LOSS_SCORE_CRITICAL',
        `Market loss score (${marketLossScore.score}/100, tier: ${marketLossScore.tier}) exceeds hiring threshold`,
        effectivePlaybook, utilization, marketLossScore);
    }
  }
  
  // 5. Check utilization - critical threshold blocks hiring
  if (utilization.status === 'CLOSED') {
    return buildHiringResult(false, marketId, workType, checkedAt,
      'UTILIZATION_TOO_HIGH',
      utilization.statusReason,
      effectivePlaybook, utilization, marketLossScore);
  }
  
  // 6. Check safety - high-risk driver concentration
  if (highRiskDriverCount !== undefined && driverCounts.activeDrivers > 0) {
    const highRiskPercent = highRiskDriverCount / driverCounts.activeDrivers;
    if (highRiskPercent > SAFETY_HIRING_THRESHOLDS.maxHighRiskDriverPercent) {
      return buildHiringResult(false, marketId, workType, checkedAt,
        'SAFETY_THRESHOLD_EXCEEDED',
        `High-risk driver concentration (${(highRiskPercent * 100).toFixed(1)}%) exceeds threshold (${(SAFETY_HIRING_THRESHOLDS.maxHighRiskDriverPercent * 100).toFixed(0)}%)`,
        effectivePlaybook, utilization, marketLossScore);
    }
  }
  
  // 7. Check compensation policy exists
  if (!effectivePlaybook.compensation.defaultBaseRateCents || 
      effectivePlaybook.compensation.defaultBaseRateCents <= 0) {
    return buildHiringResult(false, marketId, workType, checkedAt,
      'NO_COMPENSATION_POLICY',
      'Market has no valid compensation policy configured',
      effectivePlaybook, utilization, marketLossScore);
  }
  
  // 8. Check available capacity
  if (utilization.availableSlots <= 0) {
    return buildHiringResult(false, marketId, workType, checkedAt,
      'MARKET_AT_CAPACITY',
      `Market is at capacity (${utilization.currentDriverCount}/${utilization.effectiveCapacity} effective slots)`,
      effectivePlaybook, utilization, marketLossScore);
  }
  
  // All checks passed - hiring can be opened
  return buildHiringResult(true, marketId, workType, checkedAt,
    null, null,
    effectivePlaybook, utilization, marketLossScore);
}

function buildHiringResult(
  canHire: boolean,
  marketId: string,
  workType: WorkType,
  checkedAt: string,
  rejectionReason: HiringRejectionReason | null,
  rejectionDetails: string | null,
  marketPlaybook: MarketPlaybook | null,
  utilization: MarketUtilization,
  marketLossScore?: MarketLossScore | null
): HiringCheckResult {
  return {
    canHire,
    marketId,
    workType,
    checkedAt,
    rejectionReason,
    rejectionDetails,
    marketPlaybook,
    utilization,
    marketLossScore: marketLossScore?.score ?? null,
    marketLossTier: marketLossScore?.tier ?? null,
    hiringStatus: utilization.status,
    availableSlots: utilization.availableSlots,
  };
}

// ============================================
// ENTRY TIER DETERMINATION
// ============================================

/**
 * Determine entry tier and rate for a new hire in a market.
 */
export function determineEntryTier(
  marketId: string,
  entryConfig: MarketEntryTierConfig,
  marketPlaybook: MarketPlaybook,
  preferredTier?: EntryTier
): EntryTierResult {
  let entryTier: EntryTier;
  let tierReason: string;
  
  if (preferredTier && entryConfig.allowedEntryTiers.includes(preferredTier)) {
    entryTier = preferredTier;
    tierReason = `Preferred entry tier (${preferredTier}) is allowed`;
  } else if (preferredTier && !entryConfig.allowedEntryTiers.includes(preferredTier)) {
    entryTier = entryConfig.defaultEntryTier;
    tierReason = `Preferred tier (${preferredTier}) not allowed; defaulting to ${entryConfig.defaultEntryTier}`;
  } else {
    entryTier = entryConfig.defaultEntryTier;
    tierReason = `Using market default entry tier (${entryConfig.defaultEntryTier})`;
  }
  
  const entryRateCents = entryConfig.entryRateCents[entryTier];
  const maxRateCents = Math.min(entryConfig.maxEntryRateCents, marketPlaybook.compensation.maximumBaseRateCents);
  const minRateCents = Math.max(TIER_MIN_RATES[entryTier], marketPlaybook.compensation.minimumBaseRateCents);
  
  return {
    marketId,
    determinedAt: new Date().toISOString(),
    entryTier,
    entryRateCents,
    maxRateCents,
    minRateCents,
    probationaryPeriodDays: entryConfig.probationaryPeriodDays,
    tierReason,
  };
}

/**
 * Check if a tier is allowed for entry (new hires).
 */
export function isEntryTierAllowed(tier: DriverTier): boolean {
  return VALID_ENTRY_TIERS.includes(tier as EntryTier);
}

// ============================================
// OFFER VALIDATION
// ============================================

/**
 * Validate an offer for a new hire.
 * 
 * Additional checks for new hires:
 * - Tier must be an allowed entry tier
 * - Rate cannot exceed entry cap
 */
export function validateHiringOffer(
  marketId: string,
  offeredRateCents: number,
  tier: DriverTier,
  workType: WorkType,
  date: string,
  marketPlaybooks: MarketPlaybook[],
  entryConfig: MarketEntryTierConfig
): OfferValidationResult {
  const checkedAt = new Date().toISOString();
  const isEntryTier = isEntryTierAllowed(tier);
  
  // 1. Check market playbook exists
  const effectivePlaybook = findEffectivePlaybook(marketPlaybooks, marketId, date);
  
  if (!effectivePlaybook) {
    return buildOfferResult(false, marketId, offeredRateCents, tier, workType, checkedAt,
      'MARKET_NOT_ACTIVE',
      `No active market playbook found for market ${marketId} on ${date}`,
      null, null, isEntryTier);
  }
  
  const marketMin = effectivePlaybook.compensation.minimumBaseRateCents;
  const marketMax = effectivePlaybook.compensation.maximumBaseRateCents;
  const hourlyFloor = effectivePlaybook.compensation.hourlyFloorCents;
  const tierMin = TIER_MIN_RATES[tier];
  const entryMax = entryConfig.maxEntryRateCents;
  
  // 2. Check tier is valid
  if (!VALID_TIERS.includes(tier)) {
    return buildOfferResult(false, marketId, offeredRateCents, tier, workType, checkedAt,
      'INVALID_TIER',
      `Invalid tier '${tier}'. Valid tiers: ${VALID_TIERS.join(', ')}`,
      effectivePlaybook, { marketMin, marketMax, tierMin, entryMax, hourlyFloor }, isEntryTier);
  }
  
  // 3. Check tier is allowed for entry (new hires)
  if (!isEntryTier) {
    return buildOfferResult(false, marketId, offeredRateCents, tier, workType, checkedAt,
      'TIER_NOT_ALLOWED_FOR_ENTRY',
      `Tier '${tier}' is not allowed for new hires. Entry tiers: ${VALID_ENTRY_TIERS.join(', ')}`,
      effectivePlaybook, { marketMin, marketMax, tierMin, entryMax, hourlyFloor }, isEntryTier);
  }
  
  // 4. Check rate is not below market minimum
  if (offeredRateCents < marketMin) {
    return buildOfferResult(false, marketId, offeredRateCents, tier, workType, checkedAt,
      'RATE_BELOW_MINIMUM',
      `Offered rate ($${(offeredRateCents / 100).toFixed(2)}/hr) is below market minimum ($${(marketMin / 100).toFixed(2)}/hr)`,
      effectivePlaybook, { marketMin, marketMax, tierMin, entryMax, hourlyFloor }, isEntryTier);
  }
  
  // 5. Check rate is not above market maximum
  if (offeredRateCents > marketMax) {
    return buildOfferResult(false, marketId, offeredRateCents, tier, workType, checkedAt,
      'RATE_ABOVE_MAXIMUM',
      `Offered rate ($${(offeredRateCents / 100).toFixed(2)}/hr) exceeds market maximum ($${(marketMax / 100).toFixed(2)}/hr)`,
      effectivePlaybook, { marketMin, marketMax, tierMin, entryMax, hourlyFloor }, isEntryTier);
  }
  
  // 6. Check rate is not below tier minimum
  if (offeredRateCents < tierMin) {
    return buildOfferResult(false, marketId, offeredRateCents, tier, workType, checkedAt,
      'RATE_BELOW_TIER_MINIMUM',
      `Offered rate ($${(offeredRateCents / 100).toFixed(2)}/hr) is below minimum for ${tier} tier ($${(tierMin / 100).toFixed(2)}/hr)`,
      effectivePlaybook, { marketMin, marketMax, tierMin, entryMax, hourlyFloor }, isEntryTier);
  }
  
  // 7. Check rate is not above entry cap (new hire specific)
  if (offeredRateCents > entryMax) {
    return buildOfferResult(false, marketId, offeredRateCents, tier, workType, checkedAt,
      'RATE_ABOVE_ENTRY_CAP',
      `Offered rate ($${(offeredRateCents / 100).toFixed(2)}/hr) exceeds entry rate cap ($${(entryMax / 100).toFixed(2)}/hr)`,
      effectivePlaybook, { marketMin, marketMax, tierMin, entryMax, hourlyFloor }, isEntryTier);
  }
  
  // 8. Check rate meets hourly floor
  if (offeredRateCents < hourlyFloor) {
    return buildOfferResult(false, marketId, offeredRateCents, tier, workType, checkedAt,
      'RATE_BELOW_HOURLY_FLOOR',
      `Offered rate ($${(offeredRateCents / 100).toFixed(2)}/hr) is below hourly floor ($${(hourlyFloor / 100).toFixed(2)}/hr)`,
      effectivePlaybook, { marketMin, marketMax, tierMin, entryMax, hourlyFloor }, isEntryTier);
  }
  
  // All checks passed - offer is valid
  return buildOfferResult(true, marketId, offeredRateCents, tier, workType, checkedAt,
    null, null,
    effectivePlaybook, { marketMin, marketMax, tierMin, entryMax, hourlyFloor }, isEntryTier);
}

function buildOfferResult(
  valid: boolean,
  marketId: string,
  offeredRateCents: number,
  tier: DriverTier,
  workType: WorkType,
  checkedAt: string,
  error: OfferValidationError | null,
  errorDetails: string | null,
  marketPlaybook: MarketPlaybook | null,
  rates: { marketMin: number; marketMax: number; tierMin: number; entryMax: number; hourlyFloor: number } | null,
  isEntryTier: boolean
): OfferValidationResult {
  return {
    valid,
    marketId,
    offeredRateCents,
    tier,
    workType,
    checkedAt,
    error,
    errorDetails,
    marketPlaybook,
    marketMinRateCents: rates?.marketMin ?? null,
    marketMaxRateCents: rates?.marketMax ?? null,
    tierMinRateCents: rates?.tierMin ?? null,
    entryMaxRateCents: rates?.entryMax ?? null,
    hourlyFloorCents: rates?.hourlyFloor ?? null,
    isEntryTier,
  };
}

// ============================================
// HIRING AUDIT TRAIL
// ============================================

/**
 * Generate unique ID for audit entries.
 */
function generateAuditId(): string {
  return `ha-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Create a hiring audit entry.
 */
export function createHiringAuditEntry(
  action: HiringAuditAction,
  marketId: string,
  performedBy: string,
  previousState: unknown | null = null,
  newState: unknown | null = null,
  metadata: Record<string, unknown> = {},
  candidateId: string | null = null
): HiringAuditEntry {
  const entry: HiringAuditEntry = {
    id: generateAuditId(),
    timestamp: new Date().toISOString(),
    action,
    marketId,
    candidateId,
    performedBy,
    previousState,
    newState,
    metadata,
  };
  
  hiringAuditLog.push(entry);
  return entry;
}

/**
 * Get hiring audit entries for a market.
 */
export function getMarketHiringAudit(marketId: string): HiringAuditEntry[] {
  return hiringAuditLog.filter(e => e.marketId === marketId);
}

/**
 * Get hiring audit entries for a candidate.
 */
export function getCandidateHiringAudit(candidateId: string): HiringAuditEntry[] {
  return hiringAuditLog.filter(e => e.candidateId === candidateId);
}

/**
 * Get all hiring audit entries.
 */
export function getAllHiringAuditEntries(): HiringAuditEntry[] {
  return [...hiringAuditLog];
}

/**
 * Clear hiring audit log (for testing).
 */
export function clearHiringAuditLog(): void {
  hiringAuditLog.length = 0;
}

// ============================================
// COMPLETE HIRING FLOW
// ============================================

/** Hiring request */
export interface HiringRequest {
  marketId: string;
  candidateId: string;
  workType: WorkType;
  preferredTier?: EntryTier;
  offeredRateCents?: number;
  requestedBy: string;
}

/** Hiring flow result */
export interface HiringFlowResult {
  success: boolean;
  marketId: string;
  candidateId: string;
  hiringCheck: HiringCheckResult;
  entryTier: EntryTierResult | null;
  offerValidation: OfferValidationResult | null;
  rejectionReason: string | null;
  auditEntryIds: string[];
}

/**
 * Process a complete hiring request.
 * 
 * 1. Check if market can hire
 * 2. Determine entry tier
 * 3. Validate offer (if provided)
 * 4. Record audit trail
 */
export function processHiringRequest(
  request: HiringRequest,
  date: string,
  marketPlaybooks: MarketPlaybook[],
  driverCounts: MarketDriverCounts,
  capacity: MarketCapacity,
  entryConfig: MarketEntryTierConfig,
  marketLossScore?: MarketLossScore | null,
  activeControls?: RiskControl[],
  highRiskDriverCount?: number
): HiringFlowResult {
  const auditEntryIds: string[] = [];
  
  // 1. Check if market can hire
  const hiringCheck = canOpenHiring(
    request.marketId,
    request.workType,
    date,
    marketPlaybooks,
    driverCounts,
    capacity,
    marketLossScore,
    activeControls,
    highRiskDriverCount
  );
  
  // Audit the check
  const checkAudit = createHiringAuditEntry(
    'HIRING_CHECK_PERFORMED',
    request.marketId,
    request.requestedBy,
    null,
    { canHire: hiringCheck.canHire, reason: hiringCheck.rejectionReason },
    { workType: request.workType, utilization: hiringCheck.utilization?.utilizationRate },
    request.candidateId
  );
  auditEntryIds.push(checkAudit.id);
  
  if (!hiringCheck.canHire) {
    return {
      success: false,
      marketId: request.marketId,
      candidateId: request.candidateId,
      hiringCheck,
      entryTier: null,
      offerValidation: null,
      rejectionReason: hiringCheck.rejectionDetails,
      auditEntryIds,
    };
  }
  
  // 2. Determine entry tier
  const entryTier = determineEntryTier(
    request.marketId,
    entryConfig,
    hiringCheck.marketPlaybook!,
    request.preferredTier
  );
  
  // Audit tier determination
  const tierAudit = createHiringAuditEntry(
    'ENTRY_TIER_DETERMINED',
    request.marketId,
    request.requestedBy,
    null,
    { tier: entryTier.entryTier, rate: entryTier.entryRateCents },
    { preferredTier: request.preferredTier, reason: entryTier.tierReason },
    request.candidateId
  );
  auditEntryIds.push(tierAudit.id);
  
  // 3. Validate offer if provided
  let offerValidation: OfferValidationResult | null = null;
  const offeredRate = request.offeredRateCents ?? entryTier.entryRateCents;
  const offerTier = request.preferredTier ?? entryTier.entryTier;
  
  offerValidation = validateHiringOffer(
    request.marketId,
    offeredRate,
    offerTier,
    request.workType,
    date,
    marketPlaybooks,
    entryConfig
  );
  
  // Audit offer validation
  const offerAudit = createHiringAuditEntry(
    offerValidation.valid ? 'OFFER_VALIDATED' : 'OFFER_REJECTED',
    request.marketId,
    request.requestedBy,
    null,
    { valid: offerValidation.valid, rate: offeredRate, tier: offerTier },
    { error: offerValidation.error, details: offerValidation.errorDetails },
    request.candidateId
  );
  auditEntryIds.push(offerAudit.id);
  
  if (!offerValidation.valid) {
    return {
      success: false,
      marketId: request.marketId,
      candidateId: request.candidateId,
      hiringCheck,
      entryTier,
      offerValidation,
      rejectionReason: offerValidation.errorDetails,
      auditEntryIds,
    };
  }
  
  // All checks passed
  return {
    success: true,
    marketId: request.marketId,
    candidateId: request.candidateId,
    hiringCheck,
    entryTier,
    offerValidation,
    rejectionReason: null,
    auditEntryIds,
  };
}
