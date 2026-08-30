/**
 * Automation, Scheduling & Enforcement Hooks Engine (INCREMENT 10)
 * 
 * Backend-only system for:
 * 1. Scheduled jobs for weekly pay period processing, tier evaluation, safety enforcement
 * 2. Daily eligibility re-evaluation
 * 3. Hard assignment gate canAssignWork(driver_id, market_id, date)
 * 4. Automatic pay period lifecycle transitions (OPEN → PROCESSING → LOCKED)
 * 5. Internal event hooks + audit logs for all automated actions
 * 6. Robust error logging with no silent failures
 * 
 * NOT implementing: UI scheduling tools, customer communications, external task runners
 */

import { 
  isDriverEligible, 
  evaluateDriverSafetyStatus, 
  type SafetyEvent, 
  type DriverSafetyStatus 
} from './safetyEnforcementEngine';
import { 
  canActivateMarket, 
  findEffectivePlaybook, 
  type MarketPlaybook, 
  type ValidationError 
} from './marketPlaybookEngine';
import {
  type MarketLossScore,
  type RiskControl,
  getActiveMarketControls,
} from './insuranceRiskEngine';

// ============================================
// TYPES & CONSTANTS
// ============================================

/** Job types for scheduling */
export type ScheduledJobType = 
  | 'WEEKLY_PAY_PERIOD_CLOSE'
  | 'WEEKLY_TIER_EVALUATION'
  | 'WEEKLY_SAFETY_ENFORCEMENT'
  | 'DAILY_ELIGIBILITY_CHECK'
  | 'DAILY_DOCUMENT_EXPIRATION_CHECK';

/** Job execution status */
export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';

/** Pay period state transitions */
export type PayPeriodState = 'OPEN' | 'PROCESSING' | 'LOCKED' | 'EXPORTED';

/** Assignment rejection reason */
export type AssignmentRejectionReason = 
  | 'DRIVER_NOT_ELIGIBLE'
  | 'DRIVER_SUSPENDED'
  | 'DRIVER_DISQUALIFIED'
  | 'MARKET_NOT_ACTIVE'
  | 'MARKET_PLAYBOOK_INVALID'
  | 'DRIVER_NOT_QUALIFIED_FOR_MARKET'
  | 'DRIVER_DOCUMENT_EXPIRED';

/** Hiring rejection reason */
export type HiringRejectionReason = 
  | 'MARKET_NOT_ACTIVE'
  | 'MARKET_PLAYBOOK_INVALID'
  | 'MARKET_PAUSED'
  | 'MARKET_LOSS_SCORE_CRITICAL'
  | 'WORK_TYPE_NOT_SUPPORTED'
  | 'NO_COMPENSATION_POLICY'
  | 'MARKET_AT_CAPACITY';

/** Work type for hiring */
export type WorkType = 'W2_EMPLOYEE' | 'IC_CONTRACTOR' | 'BOTH';

/** Hiring check result */
export interface HiringCheckResult {
  canHire: boolean;
  marketId: string;
  workType: WorkType;
  checkedAt: string;
  rejectionReason: HiringRejectionReason | null;
  rejectionDetails: string | null;
  marketPlaybook: MarketPlaybook | null;
  marketLossScore: number | null;
  marketLossTier: string | null;
}

/** Driver tier levels */
export type DriverTier = 'Elite' | 'High Performer' | 'Standard' | 'Developing' | 'At Risk';

/** Offer validation error reason */
export type OfferValidationError = 
  | 'MARKET_NOT_ACTIVE'
  | 'RATE_BELOW_MINIMUM'
  | 'RATE_ABOVE_MAXIMUM'
  | 'RATE_BELOW_TIER_MINIMUM'
  | 'RATE_BELOW_HOURLY_FLOOR'
  | 'INVALID_TIER';

/** Offer validation result */
export interface OfferValidationResult {
  valid: boolean;
  marketId: string;
  offeredRateCents: number;
  tier: DriverTier;
  checkedAt: string;
  error: OfferValidationError | null;
  errorDetails: string | null;
  marketPlaybook: MarketPlaybook | null;
  marketMinRateCents: number | null;
  marketMaxRateCents: number | null;
  tierMinRateCents: number | null;
  hourlyFloorCents: number | null;
}

/** Scheduled job definition */
export interface ScheduledJob {
  id: string;
  jobType: ScheduledJobType;
  cronExpression: string;
  description: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: JobStatus | null;
  lastError: string | null;
}

/** Job execution record */
export interface JobExecution {
  id: string;
  jobId: string;
  jobType: ScheduledJobType;
  startedAt: string;
  completedAt: string | null;
  status: JobStatus;
  itemsProcessed: number;
  itemsFailed: number;
  errorMessage: string | null;
  errorDetails: string | null;
  executedBy: string; // 'SCHEDULER' or user ID for manual runs
}

/** Assignment check result */
export interface AssignmentCheckResult {
  canAssign: boolean;
  driverId: string;
  marketId: string;
  date: string;
  checkedAt: string;
  rejectionReason: AssignmentRejectionReason | null;
  rejectionDetails: string | null;
  driverStatus: DriverSafetyStatus | null;
  marketPlaybook: MarketPlaybook | null;
}

/** Automation audit entry */
export interface AutomationAuditEntry {
  id: string;
  timestamp: string;
  eventType: AutomationEventType;
  source: 'SCHEDULER' | 'MANUAL' | 'SYSTEM';
  targetType: 'DRIVER' | 'MARKET' | 'PAY_PERIOD' | 'JOB';
  targetId: string;
  action: string;
  previousState: any;
  newState: any;
  metadata: Record<string, any>;
  success: boolean;
  errorMessage: string | null;
}

/** Automation event types */
export type AutomationEventType = 
  | 'JOB_STARTED'
  | 'JOB_COMPLETED'
  | 'JOB_FAILED'
  | 'ELIGIBILITY_CHECKED'
  | 'ASSIGNMENT_GATE_CHECKED'
  | 'PAY_PERIOD_TRANSITIONED'
  | 'TIER_EVALUATED'
  | 'SAFETY_STATE_CHANGED'
  | 'DOCUMENT_EXPIRATION_WARNING';

/** Pay period lifecycle info */
export interface PayPeriodLifecycle {
  payPeriodId: string;
  currentState: PayPeriodState;
  weekStartDate: string;
  weekEndDate: string;
  stateTransitions: StateTransition[];
}

/** State transition record */
export interface StateTransition {
  fromState: PayPeriodState;
  toState: PayPeriodState;
  transitionedAt: string;
  transitionedBy: string;
  reason: string;
}

/** Driver market qualification (for market-specific requirements) */
export interface DriverMarketQualification {
  driverId: string;
  marketId: string;
  isQualified: boolean;
  backgroundCheckComplete: boolean;
  drivingRecordCheckComplete: boolean;
  trainingComplete: boolean;
  documentsValid: boolean;
  documentExpirations: DocumentExpiration[];
}

/** Document expiration info */
export interface DocumentExpiration {
  documentType: string;
  expirationDate: string;
  isExpired: boolean;
  daysUntilExpiration: number;
}

// ============================================
// SCHEDULED JOB DEFINITIONS
// ============================================

/** Default scheduled job configurations */
export const DEFAULT_SCHEDULED_JOBS: Omit<ScheduledJob, 'id' | 'lastRunAt' | 'nextRunAt' | 'lastStatus' | 'lastError'>[] = [
  {
    jobType: 'WEEKLY_PAY_PERIOD_CLOSE',
    cronExpression: '0 0 * * 0', // Sunday midnight
    description: 'Close current pay period, transition to PROCESSING, prepare for payroll',
    enabled: true,
  },
  {
    jobType: 'WEEKLY_TIER_EVALUATION',
    cronExpression: '0 1 * * 0', // Sunday 1 AM
    description: 'Evaluate driver tiers based on volume and safety metrics',
    enabled: true,
  },
  {
    jobType: 'WEEKLY_SAFETY_ENFORCEMENT',
    cronExpression: '0 2 * * 0', // Sunday 2 AM
    description: 'Re-evaluate all driver safety states, apply automatic consequences',
    enabled: true,
  },
  {
    jobType: 'DAILY_ELIGIBILITY_CHECK',
    cronExpression: '0 4 * * *', // Daily 4 AM
    description: 'Check all active drivers for eligibility changes',
    enabled: true,
  },
  {
    jobType: 'DAILY_DOCUMENT_EXPIRATION_CHECK',
    cronExpression: '0 5 * * *', // Daily 5 AM
    description: 'Check for expiring documents and send warnings',
    enabled: true,
  },
];

// ============================================
// ASSIGNMENT GATE
// ============================================

/**
 * Hard assignment gate - determines if a driver can be assigned work.
 * Checks driver eligibility, market activation, and qualification.
 */
export function canAssignWork(
  driverId: string,
  marketId: string,
  date: string,
  safetyEvents: SafetyEvent[],
  marketPlaybooks: MarketPlaybook[],
  driverQualification?: DriverMarketQualification
): AssignmentCheckResult {
  const checkedAt = new Date().toISOString();
  
  // 1. Check driver safety eligibility
  const driverEvents = safetyEvents.filter(e => e.driverId === driverId);
  const isEligible = isDriverEligible(driverId, date, driverEvents);
  const driverStatus = evaluateDriverSafetyStatus(driverId, driverEvents, date);
  
  if (!isEligible) {
    let rejectionReason: AssignmentRejectionReason;
    let rejectionDetails: string;
    
    if (driverStatus.currentState === 'DISQUALIFIED') {
      rejectionReason = 'DRIVER_DISQUALIFIED';
      rejectionDetails = 'Driver has been permanently disqualified due to safety violations';
    } else if (driverStatus.currentState === 'SUSPENDED') {
      rejectionReason = 'DRIVER_SUSPENDED';
      rejectionDetails = 'Driver is currently suspended and cannot accept assignments';
    } else {
      rejectionReason = 'DRIVER_NOT_ELIGIBLE';
      rejectionDetails = `Driver safety state (${driverStatus.currentState}) does not allow assignments`;
    }
    
    return {
      canAssign: false,
      driverId,
      marketId,
      date,
      checkedAt,
      rejectionReason,
      rejectionDetails,
      driverStatus,
      marketPlaybook: null,
    };
  }
  
  // 2. Check market activation
  const effectivePlaybook = findEffectivePlaybook(marketPlaybooks, marketId, date);
  
  if (!effectivePlaybook) {
    return {
      canAssign: false,
      driverId,
      marketId,
      date,
      checkedAt,
      rejectionReason: 'MARKET_NOT_ACTIVE',
      rejectionDetails: `No active market playbook found for market ${marketId} on ${date}`,
      driverStatus,
      marketPlaybook: null,
    };
  }
  
  // 3. Check market playbook validity
  const playbookValidation = canActivateMarket(effectivePlaybook);
  if (Array.isArray(playbookValidation)) {
    return {
      canAssign: false,
      driverId,
      marketId,
      date,
      checkedAt,
      rejectionReason: 'MARKET_PLAYBOOK_INVALID',
      rejectionDetails: `Market playbook has ${playbookValidation.length} validation errors`,
      driverStatus,
      marketPlaybook: effectivePlaybook,
    };
  }
  
  // 4. Check driver qualification for this market (if provided)
  if (driverQualification) {
    if (!driverQualification.isQualified) {
      return {
        canAssign: false,
        driverId,
        marketId,
        date,
        checkedAt,
        rejectionReason: 'DRIVER_NOT_QUALIFIED_FOR_MARKET',
        rejectionDetails: buildQualificationDetails(driverQualification, effectivePlaybook),
        driverStatus,
        marketPlaybook: effectivePlaybook,
      };
    }
    
    // Check for expired documents
    const expiredDocs = driverQualification.documentExpirations.filter(d => d.isExpired);
    if (expiredDocs.length > 0) {
      return {
        canAssign: false,
        driverId,
        marketId,
        date,
        checkedAt,
        rejectionReason: 'DRIVER_DOCUMENT_EXPIRED',
        rejectionDetails: `Expired documents: ${expiredDocs.map(d => d.documentType).join(', ')}`,
        driverStatus,
        marketPlaybook: effectivePlaybook,
      };
    }
  }
  
  // All checks passed
  return {
    canAssign: true,
    driverId,
    marketId,
    date,
    checkedAt,
    rejectionReason: null,
    rejectionDetails: null,
    driverStatus,
    marketPlaybook: effectivePlaybook,
  };
}

/**
 * Build qualification details message.
 */
function buildQualificationDetails(
  qual: DriverMarketQualification,
  playbook: MarketPlaybook
): string {
  const issues: string[] = [];
  
  if (playbook.safety.backgroundCheckRequired && !qual.backgroundCheckComplete) {
    issues.push('Background check not completed');
  }
  if (playbook.safety.drivingRecordCheckRequired && !qual.drivingRecordCheckComplete) {
    issues.push('Driving record check not completed');
  }
  if (playbook.safety.trainingRequiredBeforeActivation && !qual.trainingComplete) {
    issues.push('Required training not completed');
  }
  if (!qual.documentsValid) {
    issues.push('Required documents missing or invalid');
  }
  
  return issues.length > 0 ? issues.join('; ') : 'Driver not qualified for this market';
}

// ============================================
// HIRING GATE
// ============================================

/** Market capacity configuration */
export interface MarketCapacityConfig {
  maxDrivers: number;
  currentDriverCount: number;
}

/**
 * Hiring gate - determines if a market can open hiring for a specific work type.
 * Checks market activation, playbook validity, insurance risk, and capacity.
 * 
 * @param marketId - The market ID to check
 * @param workType - The work type to hire for (W2_EMPLOYEE, IC_CONTRACTOR, or BOTH)
 * @param date - The date to check eligibility for
 * @param marketPlaybooks - Available market playbooks
 * @param marketLossScore - Current market loss score (optional)
 * @param activeControls - Active risk controls for the market (optional)
 * @param capacityConfig - Market capacity configuration (optional)
 * @returns HiringCheckResult with canHire boolean and reason if rejected
 */
export function canOpenHiring(
  marketId: string,
  workType: WorkType,
  date: string,
  marketPlaybooks: MarketPlaybook[],
  marketLossScore?: MarketLossScore | null,
  activeControls?: RiskControl[],
  capacityConfig?: MarketCapacityConfig
): HiringCheckResult {
  const checkedAt = new Date().toISOString();
  
  // 1. Check market playbook exists and is active
  const effectivePlaybook = findEffectivePlaybook(marketPlaybooks, marketId, date);
  
  if (!effectivePlaybook) {
    return {
      canHire: false,
      marketId,
      workType,
      checkedAt,
      rejectionReason: 'MARKET_NOT_ACTIVE',
      rejectionDetails: `No active market playbook found for market ${marketId} on ${date}`,
      marketPlaybook: null,
      marketLossScore: null,
      marketLossTier: null,
    };
  }
  
  // 2. Check market playbook validity
  const playbookValidation = canActivateMarket(effectivePlaybook);
  if (Array.isArray(playbookValidation)) {
    const requiredErrors = playbookValidation.filter(e => e.severity === 'REQUIRED');
    if (requiredErrors.length > 0) {
      return {
        canHire: false,
        marketId,
        workType,
        checkedAt,
        rejectionReason: 'MARKET_PLAYBOOK_INVALID',
        rejectionDetails: `Market playbook has ${requiredErrors.length} required validation errors: ${requiredErrors.map(e => e.message).join('; ')}`,
        marketPlaybook: effectivePlaybook,
        marketLossScore: marketLossScore?.score ?? null,
        marketLossTier: marketLossScore?.tier ?? null,
      };
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
      return {
        canHire: false,
        marketId,
        workType,
        checkedAt,
        rejectionReason: 'MARKET_PAUSED',
        rejectionDetails: `Market is paused due to risk control: ${pauseControl.triggerReason}`,
        marketPlaybook: effectivePlaybook,
        marketLossScore: marketLossScore?.score ?? null,
        marketLossTier: marketLossScore?.tier ?? null,
      };
    }
  }
  
  // 4. Check market loss score - CRITICAL tier blocks hiring
  if (marketLossScore && marketLossScore.tier === 'CRITICAL') {
    return {
      canHire: false,
      marketId,
      workType,
      checkedAt,
      rejectionReason: 'MARKET_LOSS_SCORE_CRITICAL',
      rejectionDetails: `Market loss score is CRITICAL (${marketLossScore.score}/100). Hiring suspended until risk improves.`,
      marketPlaybook: effectivePlaybook,
      marketLossScore: marketLossScore.score,
      marketLossTier: marketLossScore.tier,
    };
  }
  
  // 5. Check compensation policy exists with valid base rate
  // Work type support is determined by market configuration (W2/IC can be handled based on policy)
  if (!effectivePlaybook.compensation.defaultBaseRateCents || 
      effectivePlaybook.compensation.defaultBaseRateCents <= 0) {
    return {
      canHire: false,
      marketId,
      workType,
      checkedAt,
      rejectionReason: 'NO_COMPENSATION_POLICY',
      rejectionDetails: 'Market has no valid compensation policy configured',
      marketPlaybook: effectivePlaybook,
      marketLossScore: marketLossScore?.score ?? null,
      marketLossTier: marketLossScore?.tier ?? null,
    };
  }
  
  // 7. Check market capacity (if provided)
  if (capacityConfig && capacityConfig.currentDriverCount >= capacityConfig.maxDrivers) {
    return {
      canHire: false,
      marketId,
      workType,
      checkedAt,
      rejectionReason: 'MARKET_AT_CAPACITY',
      rejectionDetails: `Market is at capacity (${capacityConfig.currentDriverCount}/${capacityConfig.maxDrivers} drivers)`,
      marketPlaybook: effectivePlaybook,
      marketLossScore: marketLossScore?.score ?? null,
      marketLossTier: marketLossScore?.tier ?? null,
    };
  }
  
  // All checks passed - hiring can be opened
  return {
    canHire: true,
    marketId,
    workType,
    checkedAt,
    rejectionReason: null,
    rejectionDetails: null,
    marketPlaybook: effectivePlaybook,
    marketLossScore: marketLossScore?.score ?? null,
    marketLossTier: marketLossScore?.tier ?? null,
  };
}

// ============================================
// OFFER VALIDATION GATE
// ============================================

/** Tier minimum rates (cents per hour) - from transparency engine */
const TIER_MIN_RATES: Record<DriverTier, number> = {
  'Elite': 3000,
  'High Performer': 2750,
  'Standard': 2500,
  'Developing': 2250,
  'At Risk': 2000,
};

/** Valid tiers for validation */
const VALID_TIERS: DriverTier[] = ['Elite', 'High Performer', 'Standard', 'Developing', 'At Risk'];

/**
 * Validate an offer rate for a given market and driver tier.
 * 
 * Checks:
 * 1. Market playbook exists and is active
 * 2. Tier is valid
 * 3. Rate is within market min/max bounds
 * 4. Rate is appropriate for the tier (not below tier minimum)
 * 5. Rate meets hourly floor
 * 
 * @param marketId - The market ID
 * @param offeredRateCents - The offered rate in cents per hour
 * @param tier - The driver's tier level
 * @param date - The date to validate for
 * @param marketPlaybooks - Available market playbooks
 * @returns OfferValidationResult with valid boolean and error if rejected
 */
export function validateOffer(
  marketId: string,
  offeredRateCents: number,
  tier: DriverTier,
  date: string,
  marketPlaybooks: MarketPlaybook[]
): OfferValidationResult {
  const checkedAt = new Date().toISOString();
  
  // 1. Check market playbook exists and is active
  const effectivePlaybook = findEffectivePlaybook(marketPlaybooks, marketId, date);
  
  if (!effectivePlaybook) {
    return {
      valid: false,
      marketId,
      offeredRateCents,
      tier,
      checkedAt,
      error: 'MARKET_NOT_ACTIVE',
      errorDetails: `No active market playbook found for market ${marketId} on ${date}`,
      marketPlaybook: null,
      marketMinRateCents: null,
      marketMaxRateCents: null,
      tierMinRateCents: null,
      hourlyFloorCents: null,
    };
  }
  
  // 2. Check tier is valid
  if (!VALID_TIERS.includes(tier)) {
    return {
      valid: false,
      marketId,
      offeredRateCents,
      tier,
      checkedAt,
      error: 'INVALID_TIER',
      errorDetails: `Invalid tier '${tier}'. Valid tiers: ${VALID_TIERS.join(', ')}`,
      marketPlaybook: effectivePlaybook,
      marketMinRateCents: effectivePlaybook.compensation.minimumBaseRateCents,
      marketMaxRateCents: effectivePlaybook.compensation.maximumBaseRateCents,
      tierMinRateCents: null,
      hourlyFloorCents: effectivePlaybook.compensation.hourlyFloorCents,
    };
  }
  
  const marketMin = effectivePlaybook.compensation.minimumBaseRateCents;
  const marketMax = effectivePlaybook.compensation.maximumBaseRateCents;
  const hourlyFloor = effectivePlaybook.compensation.hourlyFloorCents;
  const tierMin = TIER_MIN_RATES[tier];
  
  // 3. Check rate is not below market minimum
  if (offeredRateCents < marketMin) {
    return {
      valid: false,
      marketId,
      offeredRateCents,
      tier,
      checkedAt,
      error: 'RATE_BELOW_MINIMUM',
      errorDetails: `Offered rate ($${(offeredRateCents / 100).toFixed(2)}/hr) is below market minimum ($${(marketMin / 100).toFixed(2)}/hr)`,
      marketPlaybook: effectivePlaybook,
      marketMinRateCents: marketMin,
      marketMaxRateCents: marketMax,
      tierMinRateCents: tierMin,
      hourlyFloorCents: hourlyFloor,
    };
  }
  
  // 4. Check rate is not above market maximum
  if (offeredRateCents > marketMax) {
    return {
      valid: false,
      marketId,
      offeredRateCents,
      tier,
      checkedAt,
      error: 'RATE_ABOVE_MAXIMUM',
      errorDetails: `Offered rate ($${(offeredRateCents / 100).toFixed(2)}/hr) exceeds market maximum ($${(marketMax / 100).toFixed(2)}/hr)`,
      marketPlaybook: effectivePlaybook,
      marketMinRateCents: marketMin,
      marketMaxRateCents: marketMax,
      tierMinRateCents: tierMin,
      hourlyFloorCents: hourlyFloor,
    };
  }
  
  // 5. Check rate is not below tier minimum (protects driver)
  if (offeredRateCents < tierMin) {
    return {
      valid: false,
      marketId,
      offeredRateCents,
      tier,
      checkedAt,
      error: 'RATE_BELOW_TIER_MINIMUM',
      errorDetails: `Offered rate ($${(offeredRateCents / 100).toFixed(2)}/hr) is below minimum for ${tier} tier ($${(tierMin / 100).toFixed(2)}/hr)`,
      marketPlaybook: effectivePlaybook,
      marketMinRateCents: marketMin,
      marketMaxRateCents: marketMax,
      tierMinRateCents: tierMin,
      hourlyFloorCents: hourlyFloor,
    };
  }
  
  // 6. Check rate meets hourly floor
  if (offeredRateCents < hourlyFloor) {
    return {
      valid: false,
      marketId,
      offeredRateCents,
      tier,
      checkedAt,
      error: 'RATE_BELOW_HOURLY_FLOOR',
      errorDetails: `Offered rate ($${(offeredRateCents / 100).toFixed(2)}/hr) is below hourly floor ($${(hourlyFloor / 100).toFixed(2)}/hr)`,
      marketPlaybook: effectivePlaybook,
      marketMinRateCents: marketMin,
      marketMaxRateCents: marketMax,
      tierMinRateCents: tierMin,
      hourlyFloorCents: hourlyFloor,
    };
  }
  
  // All checks passed - offer is valid
  return {
    valid: true,
    marketId,
    offeredRateCents,
    tier,
    checkedAt,
    error: null,
    errorDetails: null,
    marketPlaybook: effectivePlaybook,
    marketMinRateCents: marketMin,
    marketMaxRateCents: marketMax,
    tierMinRateCents: tierMin,
    hourlyFloorCents: hourlyFloor,
  };
}

// ============================================
// PAY PERIOD LIFECYCLE
// ============================================

/** Valid pay period state transitions */
export const VALID_TRANSITIONS: Record<PayPeriodState, PayPeriodState[]> = {
  OPEN: ['PROCESSING'],
  PROCESSING: ['LOCKED', 'OPEN'], // Can reopen if issues found
  LOCKED: ['EXPORTED'],
  EXPORTED: [], // Terminal state
};

/**
 * Check if a pay period state transition is valid.
 */
export function isValidTransition(from: PayPeriodState, to: PayPeriodState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Transition a pay period to a new state.
 */
export function transitionPayPeriod(
  lifecycle: PayPeriodLifecycle,
  toState: PayPeriodState,
  transitionedBy: string,
  reason: string
): PayPeriodLifecycle | TransitionError {
  const fromState = lifecycle.currentState;
  
  if (!isValidTransition(fromState, toState)) {
    return new TransitionError(
      `Invalid transition: ${fromState} → ${toState}`,
      fromState,
      toState
    );
  }
  
  const transition: StateTransition = {
    fromState,
    toState,
    transitionedAt: new Date().toISOString(),
    transitionedBy,
    reason,
  };
  
  return {
    ...lifecycle,
    currentState: toState,
    stateTransitions: [...lifecycle.stateTransitions, transition],
  };
}

/**
 * Error for invalid state transitions.
 */
export class TransitionError extends Error {
  constructor(
    message: string,
    public fromState: PayPeriodState,
    public toState: PayPeriodState
  ) {
    super(message);
    this.name = 'TransitionError';
  }
}

/**
 * Get the automatic next state for a pay period based on schedule.
 */
export function getAutomaticNextState(
  currentState: PayPeriodState,
  weekEndDate: string,
  currentDate: string
): PayPeriodState | null {
  // If week has ended and still OPEN, should transition to PROCESSING
  if (currentState === 'OPEN' && currentDate > weekEndDate) {
    return 'PROCESSING';
  }
  
  return null;
}

// ============================================
// AUTOMATION AUDIT LOGGING
// ============================================

/** In-memory audit log (would be database in production) */
const automationAuditLog: AutomationAuditEntry[] = [];

/**
 * Create an automation audit entry.
 */
export function createAuditEntry(
  eventType: AutomationEventType,
  source: 'SCHEDULER' | 'MANUAL' | 'SYSTEM',
  targetType: 'DRIVER' | 'MARKET' | 'PAY_PERIOD' | 'JOB',
  targetId: string,
  action: string,
  previousState: any,
  newState: any,
  metadata: Record<string, any> = {},
  success: boolean = true,
  errorMessage: string | null = null
): AutomationAuditEntry {
  const entry: AutomationAuditEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    eventType,
    source,
    targetType,
    targetId,
    action,
    previousState,
    newState,
    metadata,
    success,
    errorMessage,
  };
  
  automationAuditLog.push(entry);
  return entry;
}

/**
 * Get audit entries for a target.
 */
export function getAuditEntries(
  targetType: 'DRIVER' | 'MARKET' | 'PAY_PERIOD' | 'JOB',
  targetId: string,
  limit: number = 100
): AutomationAuditEntry[] {
  return automationAuditLog
    .filter(e => e.targetType === targetType && e.targetId === targetId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}

/**
 * Get all audit entries within a date range.
 */
export function getAuditEntriesInRange(
  startDate: string,
  endDate: string
): AutomationAuditEntry[] {
  return automationAuditLog
    .filter(e => e.timestamp >= startDate && e.timestamp <= endDate)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * Clear audit log (for testing).
 */
export function clearAuditLog(): void {
  automationAuditLog.length = 0;
}

// ============================================
// JOB EXECUTION
// ============================================

/**
 * Create a job execution record.
 */
export function createJobExecution(
  jobId: string,
  jobType: ScheduledJobType,
  executedBy: string = 'SCHEDULER'
): JobExecution {
  return {
    id: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    jobId,
    jobType,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: 'RUNNING',
    itemsProcessed: 0,
    itemsFailed: 0,
    errorMessage: null,
    errorDetails: null,
    executedBy,
  };
}

/**
 * Complete a job execution.
 */
export function completeJobExecution(
  execution: JobExecution,
  itemsProcessed: number,
  itemsFailed: number,
  errorMessage: string | null = null,
  errorDetails: string | null = null
): JobExecution {
  const status: JobStatus = errorMessage ? 'FAILED' : (itemsFailed > 0 ? 'COMPLETED' : 'COMPLETED');
  
  return {
    ...execution,
    completedAt: new Date().toISOString(),
    status,
    itemsProcessed,
    itemsFailed,
    errorMessage,
    errorDetails,
  };
}

// ============================================
// BATCH PROCESSING HELPERS
// ============================================

/** Batch processing result */
export interface BatchProcessingResult<T> {
  totalItems: number;
  successCount: number;
  failureCount: number;
  results: BatchItemResult<T>[];
  errors: BatchError[];
}

/** Individual batch item result */
export interface BatchItemResult<T> {
  itemId: string;
  success: boolean;
  result: T | null;
  error: string | null;
}

/** Batch error record */
export interface BatchError {
  itemId: string;
  errorType: string;
  errorMessage: string;
  timestamp: string;
}

/**
 * Process items in batch with error handling.
 */
export async function processBatch<T, R>(
  items: T[],
  getItemId: (item: T) => string,
  processor: (item: T) => R | Promise<R>
): Promise<BatchProcessingResult<R>> {
  const results: BatchItemResult<R>[] = [];
  const errors: BatchError[] = [];
  
  for (const item of items) {
    const itemId = getItemId(item);
    try {
      const result = await processor(item);
      results.push({
        itemId,
        success: true,
        result,
        error: null,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      results.push({
        itemId,
        success: false,
        result: null,
        error: errorMessage,
      });
      errors.push({
        itemId,
        errorType: err instanceof Error ? err.name : 'UnknownError',
        errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  }
  
  return {
    totalItems: items.length,
    successCount: results.filter(r => r.success).length,
    failureCount: results.filter(r => !r.success).length,
    results,
    errors,
  };
}

// ============================================
// DAILY ELIGIBILITY RE-EVALUATION
// ============================================

/** Eligibility change record */
export interface EligibilityChange {
  driverId: string;
  date: string;
  previouslyEligible: boolean;
  currentlyEligible: boolean;
  previousState: string | null;
  currentState: string;
  reason: string;
}

/**
 * Re-evaluate eligibility for all drivers.
 */
export function evaluateDailyEligibility(
  driverIds: string[],
  date: string,
  safetyEvents: SafetyEvent[],
  previousEligibility: Map<string, boolean>
): EligibilityChange[] {
  const changes: EligibilityChange[] = [];
  
  for (const driverId of driverIds) {
    const driverEvents = safetyEvents.filter(e => e.driverId === driverId);
    const currentlyEligible = isDriverEligible(driverId, date, driverEvents);
    const previouslyEligible = previousEligibility.get(driverId) ?? true;
    
    if (currentlyEligible !== previouslyEligible) {
      const status = evaluateDriverSafetyStatus(driverId, driverEvents, date);
      changes.push({
        driverId,
        date,
        previouslyEligible,
        currentlyEligible,
        previousState: null,
        currentState: status.currentState,
        reason: currentlyEligible 
          ? 'Driver eligibility restored' 
          : `Driver no longer eligible: ${status.currentState}`,
      });
    }
  }
  
  return changes;
}

// ============================================
// DOCUMENT EXPIRATION CHECKING
// ============================================

/** Document expiration warning */
export interface DocumentExpirationWarning {
  driverId: string;
  documentType: string;
  expirationDate: string;
  daysUntilExpiration: number;
  warningLevel: 'URGENT' | 'WARNING' | 'NOTICE';
}

/**
 * Check for expiring documents.
 */
export function checkDocumentExpirations(
  documents: { driverId: string; documentType: string; expirationDate: string }[],
  checkDate: string
): DocumentExpirationWarning[] {
  const warnings: DocumentExpirationWarning[] = [];
  const checkDateObj = new Date(checkDate);
  
  for (const doc of documents) {
    const expirationDateObj = new Date(doc.expirationDate);
    const diffTime = expirationDateObj.getTime() - checkDateObj.getTime();
    const daysUntilExpiration = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let warningLevel: 'URGENT' | 'WARNING' | 'NOTICE' | null = null;
    
    if (daysUntilExpiration <= 0) {
      // Already expired - handled elsewhere
      continue;
    } else if (daysUntilExpiration <= 7) {
      warningLevel = 'URGENT';
    } else if (daysUntilExpiration <= 14) {
      warningLevel = 'WARNING';
    } else if (daysUntilExpiration <= 30) {
      warningLevel = 'NOTICE';
    }
    
    if (warningLevel) {
      warnings.push({
        driverId: doc.driverId,
        documentType: doc.documentType,
        expirationDate: doc.expirationDate,
        daysUntilExpiration,
        warningLevel,
      });
    }
  }
  
  return warnings.sort((a, b) => a.daysUntilExpiration - b.daysUntilExpiration);
}

// ============================================
// EVENT HOOKS
// ============================================

/** Event hook callback type */
export type EventHookCallback = (event: AutomationAuditEntry) => void | Promise<void>;

/** Registered event hooks */
const eventHooks: Map<AutomationEventType, EventHookCallback[]> = new Map();

/**
 * Register an event hook.
 */
export function registerEventHook(
  eventType: AutomationEventType,
  callback: EventHookCallback
): void {
  const hooks = eventHooks.get(eventType) ?? [];
  hooks.push(callback);
  eventHooks.set(eventType, hooks);
}

/**
 * Unregister all hooks for an event type.
 */
export function clearEventHooks(eventType?: AutomationEventType): void {
  if (eventType) {
    eventHooks.delete(eventType);
  } else {
    eventHooks.clear();
  }
}

/**
 * Trigger event hooks.
 */
export async function triggerEventHooks(entry: AutomationAuditEntry): Promise<void> {
  const hooks = eventHooks.get(entry.eventType) ?? [];
  
  for (const hook of hooks) {
    try {
      await hook(entry);
    } catch (err) {
      // Log but don't fail - hooks should not break main flow
      console.error(`Event hook error for ${entry.eventType}:`, err);
    }
  }
}

/**
 * Create and trigger an audit entry with hooks.
 */
export async function auditAndTrigger(
  eventType: AutomationEventType,
  source: 'SCHEDULER' | 'MANUAL' | 'SYSTEM',
  targetType: 'DRIVER' | 'MARKET' | 'PAY_PERIOD' | 'JOB',
  targetId: string,
  action: string,
  previousState: any,
  newState: any,
  metadata: Record<string, any> = {},
  success: boolean = true,
  errorMessage: string | null = null
): Promise<AutomationAuditEntry> {
  const entry = createAuditEntry(
    eventType,
    source,
    targetType,
    targetId,
    action,
    previousState,
    newState,
    metadata,
    success,
    errorMessage
  );
  
  await triggerEventHooks(entry);
  
  return entry;
}
