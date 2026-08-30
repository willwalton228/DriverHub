/**
 * Safety Enforcement & Automatic Consequences Engine (INCREMENT 8)
 * 
 * Backend-only system for:
 * 1. SafetyEvent model and rolling claim window calculations
 * 2. Penalty rules engine based on at-fault claims (30/60/90 day windows)
 * 3. Automatic driver safety states: ACTIVE, RESTRICTED, SUSPENDED, DISQUALIFIED
 * 4. Eligibility gate isDriverEligible(driver_id, date)
 * 5. Safety multipliers, tier freezes, and suspensions
 * 6. Full audit trail for every safety action
 * 
 * NOT implementing: manual overrides, appeals workflow, telematics ingestion
 */

// ============================================
// TYPES & CONSTANTS
// ============================================

/** Safety event types */
export type SafetyEventType = 
  | 'AT_FAULT_CLAIM'
  | 'NOT_AT_FAULT_CLAIM'
  | 'PREVENTABLE_INCIDENT'
  | 'MOVING_VIOLATION'
  | 'SAFETY_TRAINING_COMPLETED'
  | 'CLEAN_DRIVING_BONUS';

/** Severity levels for safety events */
export type SafetyEventSeverity = 'MINOR' | 'MODERATE' | 'MAJOR' | 'SEVERE';

/** Driver safety states */
export type DriverSafetyState = 'ACTIVE' | 'RESTRICTED' | 'SUSPENDED' | 'DISQUALIFIED';

/** Safety event record */
export interface SafetyEvent {
  id: string;
  driverId: string;
  eventType: SafetyEventType;
  severity: SafetyEventSeverity;
  eventDate: string; // YYYY-MM-DD
  description: string;
  atFault: boolean;
  claimAmountCents: number | null;
  recordedAt: string; // ISO timestamp
  recordedBy: string; // userId or 'SYSTEM'
}

/** Rolling window configuration */
export interface ClaimWindow {
  windowDays: number;
  label: string;
}

/** Standard claim windows for penalty calculation */
export const CLAIM_WINDOWS: ClaimWindow[] = [
  { windowDays: 30, label: '30-day' },
  { windowDays: 60, label: '60-day' },
  { windowDays: 90, label: '90-day' },
];

/** Penalty threshold configuration */
export interface PenaltyThreshold {
  windowDays: number;
  atFaultClaimCount: number;
  resultingState: DriverSafetyState;
  safetyMultiplier: number;
  tierFreeze: boolean;
  description: string;
}

/** Default penalty thresholds (promotion-only, no demotions) */
export const PENALTY_THRESHOLDS: PenaltyThreshold[] = [
  // 30-day window thresholds
  { windowDays: 30, atFaultClaimCount: 1, resultingState: 'RESTRICTED', safetyMultiplier: 0.90, tierFreeze: true, description: '1 at-fault claim in 30 days: Restricted status, 10% pay reduction, tier frozen' },
  { windowDays: 30, atFaultClaimCount: 2, resultingState: 'SUSPENDED', safetyMultiplier: 0.00, tierFreeze: true, description: '2 at-fault claims in 30 days: Suspended, no pay' },
  
  // 60-day window thresholds
  { windowDays: 60, atFaultClaimCount: 2, resultingState: 'RESTRICTED', safetyMultiplier: 0.85, tierFreeze: true, description: '2 at-fault claims in 60 days: Restricted status, 15% pay reduction, tier frozen' },
  { windowDays: 60, atFaultClaimCount: 3, resultingState: 'SUSPENDED', safetyMultiplier: 0.00, tierFreeze: true, description: '3 at-fault claims in 60 days: Suspended, no pay' },
  
  // 90-day window thresholds
  { windowDays: 90, atFaultClaimCount: 3, resultingState: 'RESTRICTED', safetyMultiplier: 0.85, tierFreeze: true, description: '3 at-fault claims in 90 days: Restricted status, 15% pay reduction, tier frozen' },
  { windowDays: 90, atFaultClaimCount: 4, resultingState: 'SUSPENDED', safetyMultiplier: 0.00, tierFreeze: true, description: '4 at-fault claims in 90 days: Suspended, no pay' },
  { windowDays: 90, atFaultClaimCount: 5, resultingState: 'DISQUALIFIED', safetyMultiplier: 0.00, tierFreeze: true, description: '5+ at-fault claims in 90 days: Disqualified from driving' },
];

/** Severity-based point values */
export const SEVERITY_POINTS: Record<SafetyEventSeverity, number> = {
  MINOR: 1,
  MODERATE: 2,
  MAJOR: 3,
  SEVERE: 5,
};

/** Driver safety status result */
export interface DriverSafetyStatus {
  driverId: string;
  evaluationDate: string;
  currentState: DriverSafetyState;
  safetyMultiplier: number;
  tierFrozen: boolean;
  isEligible: boolean;
  eligibilityReason: string;
  claimCounts: {
    window30Day: number;
    window60Day: number;
    window90Day: number;
  };
  triggeredThreshold: PenaltyThreshold | null;
  evaluatedAt: string;
}

/** Safety audit action types */
export type SafetyAuditAction = 
  | 'STATE_CHANGE'
  | 'ELIGIBILITY_CHECK'
  | 'CLAIM_RECORDED'
  | 'MULTIPLIER_APPLIED'
  | 'TIER_FROZEN'
  | 'AUTOMATIC_EVALUATION';

/** Safety audit entry */
export interface SafetyAuditEntry {
  id: string;
  driverId: string;
  action: SafetyAuditAction;
  previousState: DriverSafetyState | null;
  newState: DriverSafetyState | null;
  details: Record<string, any>;
  triggeredBy: string; // 'SYSTEM' or userId
  createdAt: string;
}

// ============================================
// ROLLING WINDOW CALCULATIONS
// ============================================

/**
 * Calculate the start date for a rolling window.
 */
export function getWindowStartDate(evaluationDate: string, windowDays: number): string {
  const date = new Date(evaluationDate);
  date.setDate(date.getDate() - windowDays);
  return date.toISOString().split('T')[0];
}

/**
 * Filter events within a rolling window.
 */
export function filterEventsInWindow(
  events: SafetyEvent[],
  evaluationDate: string,
  windowDays: number
): SafetyEvent[] {
  const windowStart = getWindowStartDate(evaluationDate, windowDays);
  return events.filter(e => e.eventDate >= windowStart && e.eventDate <= evaluationDate);
}

/**
 * Count at-fault claims in a rolling window.
 */
export function countAtFaultClaimsInWindow(
  events: SafetyEvent[],
  evaluationDate: string,
  windowDays: number
): number {
  const windowEvents = filterEventsInWindow(events, evaluationDate, windowDays);
  return windowEvents.filter(e => e.atFault && e.eventType === 'AT_FAULT_CLAIM').length;
}

/**
 * Calculate claim counts for all standard windows.
 */
export function calculateClaimCounts(
  events: SafetyEvent[],
  evaluationDate: string
): { window30Day: number; window60Day: number; window90Day: number } {
  return {
    window30Day: countAtFaultClaimsInWindow(events, evaluationDate, 30),
    window60Day: countAtFaultClaimsInWindow(events, evaluationDate, 60),
    window90Day: countAtFaultClaimsInWindow(events, evaluationDate, 90),
  };
}

// ============================================
// PENALTY RULES ENGINE
// ============================================

/**
 * Determine the most severe triggered penalty threshold.
 * Returns the threshold that results in the worst state for the driver.
 */
export function determineTriggeredThreshold(
  claimCounts: { window30Day: number; window60Day: number; window90Day: number }
): PenaltyThreshold | null {
  const stateRank: Record<DriverSafetyState, number> = {
    ACTIVE: 0,
    RESTRICTED: 1,
    SUSPENDED: 2,
    DISQUALIFIED: 3,
  };

  let worstThreshold: PenaltyThreshold | null = null;
  let worstRank = -1;

  for (const threshold of PENALTY_THRESHOLDS) {
    let claimCount = 0;
    if (threshold.windowDays === 30) claimCount = claimCounts.window30Day;
    else if (threshold.windowDays === 60) claimCount = claimCounts.window60Day;
    else if (threshold.windowDays === 90) claimCount = claimCounts.window90Day;

    if (claimCount >= threshold.atFaultClaimCount) {
      const rank = stateRank[threshold.resultingState];
      if (rank > worstRank) {
        worstRank = rank;
        worstThreshold = threshold;
      }
    }
  }

  return worstThreshold;
}

/**
 * Determine driver safety state from claim counts.
 */
export function determineSafetyState(
  claimCounts: { window30Day: number; window60Day: number; window90Day: number }
): DriverSafetyState {
  const threshold = determineTriggeredThreshold(claimCounts);
  return threshold?.resultingState ?? 'ACTIVE';
}

/**
 * Get the safety multiplier for a given state.
 */
export function getSafetyStateMultiplier(state: DriverSafetyState): number {
  switch (state) {
    case 'ACTIVE':
      return 1.00;
    case 'RESTRICTED':
      return 0.85;
    case 'SUSPENDED':
    case 'DISQUALIFIED':
      return 0.00;
  }
}

/**
 * Check if tier progression is frozen for a given state.
 */
export function isTierFrozen(state: DriverSafetyState): boolean {
  return state !== 'ACTIVE';
}

// ============================================
// DRIVER SAFETY STATUS EVALUATION
// ============================================

/**
 * Evaluate a driver's full safety status based on their events.
 */
export function evaluateDriverSafetyStatus(
  driverId: string,
  events: SafetyEvent[],
  evaluationDate: string
): DriverSafetyStatus {
  const claimCounts = calculateClaimCounts(events, evaluationDate);
  const triggeredThreshold = determineTriggeredThreshold(claimCounts);
  const currentState = triggeredThreshold?.resultingState ?? 'ACTIVE';
  const safetyMultiplier = triggeredThreshold?.safetyMultiplier ?? 1.00;
  const tierFrozen = triggeredThreshold?.tierFreeze ?? false;

  const isEligible = currentState === 'ACTIVE' || currentState === 'RESTRICTED';
  let eligibilityReason = '';

  switch (currentState) {
    case 'ACTIVE':
      eligibilityReason = 'Driver is in good standing with no restrictions';
      break;
    case 'RESTRICTED':
      eligibilityReason = 'Driver has restrictions due to recent at-fault claims but may continue working';
      break;
    case 'SUSPENDED':
      eligibilityReason = 'Driver is suspended due to safety violations and cannot be assigned work';
      break;
    case 'DISQUALIFIED':
      eligibilityReason = 'Driver is permanently disqualified from driving due to safety record';
      break;
  }

  return {
    driverId,
    evaluationDate,
    currentState,
    safetyMultiplier,
    tierFrozen,
    isEligible,
    eligibilityReason,
    claimCounts,
    triggeredThreshold,
    evaluatedAt: new Date().toISOString(),
  };
}

// ============================================
// ELIGIBILITY GATE
// ============================================

/**
 * Check if a driver is eligible for assignment on a given date.
 * This is the primary gate function used before assigning work.
 * 
 * @param driverId - The driver's unique identifier
 * @param evaluationDate - The date to evaluate eligibility (YYYY-MM-DD)
 * @param events - The driver's safety events
 * @returns boolean - true if driver can be assigned work
 */
export function isDriverEligible(
  driverId: string,
  evaluationDate: string,
  events: SafetyEvent[]
): boolean {
  const status = evaluateDriverSafetyStatus(driverId, events, evaluationDate);
  return status.isEligible;
}

/**
 * Get detailed eligibility result with reason.
 */
export function checkDriverEligibility(
  driverId: string,
  evaluationDate: string,
  events: SafetyEvent[]
): { eligible: boolean; state: DriverSafetyState; reason: string } {
  const status = evaluateDriverSafetyStatus(driverId, events, evaluationDate);
  return {
    eligible: status.isEligible,
    state: status.currentState,
    reason: status.eligibilityReason,
  };
}

// ============================================
// SAFETY MULTIPLIER APPLICATION
// ============================================

/**
 * Apply safety-based pay adjustment.
 * Returns the adjusted pay amount in cents.
 */
export function applySafetyMultiplier(
  basePayCents: number,
  safetyMultiplier: number
): number {
  return Math.round(basePayCents * safetyMultiplier);
}

/**
 * Calculate effective pay after safety state is applied.
 */
export function calculateSafetyAdjustedPay(
  driverId: string,
  evaluationDate: string,
  events: SafetyEvent[],
  basePayCents: number
): { adjustedPayCents: number; multiplierApplied: number; state: DriverSafetyState } {
  const status = evaluateDriverSafetyStatus(driverId, events, evaluationDate);
  const adjustedPayCents = applySafetyMultiplier(basePayCents, status.safetyMultiplier);
  
  return {
    adjustedPayCents,
    multiplierApplied: status.safetyMultiplier,
    state: status.currentState,
  };
}

// ============================================
// AUDIT TRAIL
// ============================================

let auditIdCounter = 0;

/**
 * Generate unique audit entry ID.
 */
function generateAuditId(): string {
  auditIdCounter++;
  return `audit-${Date.now()}-${auditIdCounter}`;
}

/**
 * Create an audit entry for a safety action.
 */
export function createSafetyAuditEntry(
  driverId: string,
  action: SafetyAuditAction,
  previousState: DriverSafetyState | null,
  newState: DriverSafetyState | null,
  details: Record<string, any>,
  triggeredBy: string = 'SYSTEM'
): SafetyAuditEntry {
  return {
    id: generateAuditId(),
    driverId,
    action,
    previousState,
    newState,
    details,
    triggeredBy,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Create audit entry for eligibility check.
 */
export function auditEligibilityCheck(
  driverId: string,
  evaluationDate: string,
  eligible: boolean,
  state: DriverSafetyState,
  reason: string
): SafetyAuditEntry {
  return createSafetyAuditEntry(
    driverId,
    'ELIGIBILITY_CHECK',
    null,
    null,
    { evaluationDate, eligible, state, reason }
  );
}

/**
 * Create audit entry for state change.
 */
export function auditStateChange(
  driverId: string,
  previousState: DriverSafetyState,
  newState: DriverSafetyState,
  claimCounts: { window30Day: number; window60Day: number; window90Day: number },
  triggeredThreshold: PenaltyThreshold | null
): SafetyAuditEntry {
  return createSafetyAuditEntry(
    driverId,
    'STATE_CHANGE',
    previousState,
    newState,
    { claimCounts, triggeredThreshold }
  );
}

/**
 * Create audit entry for claim recorded.
 */
export function auditClaimRecorded(
  driverId: string,
  event: SafetyEvent
): SafetyAuditEntry {
  return createSafetyAuditEntry(
    driverId,
    'CLAIM_RECORDED',
    null,
    null,
    { eventId: event.id, eventType: event.eventType, severity: event.severity, atFault: event.atFault }
  );
}

/**
 * Create audit entry for automatic evaluation.
 */
export function auditAutomaticEvaluation(
  driverId: string,
  status: DriverSafetyStatus
): SafetyAuditEntry {
  return createSafetyAuditEntry(
    driverId,
    'AUTOMATIC_EVALUATION',
    null,
    status.currentState,
    {
      evaluationDate: status.evaluationDate,
      claimCounts: status.claimCounts,
      safetyMultiplier: status.safetyMultiplier,
      tierFrozen: status.tierFrozen,
      isEligible: status.isEligible,
    }
  );
}

// ============================================
// NEXT-TIER REQUIREMENTS (READ-ONLY)
// ============================================

/** Requirements to reach next tier/state */
export interface NextStateRequirements {
  currentState: DriverSafetyState;
  targetState: DriverSafetyState | null;
  canProgress: boolean;
  requirements: string[];
  daysUntilOldestClaimExpires: number | null;
}

/**
 * Calculate requirements to return to ACTIVE state.
 * Since we don't implement demotions, this shows what needs to happen
 * for claims to age out of the window.
 */
export function calculateNextStateRequirements(
  driverId: string,
  events: SafetyEvent[],
  evaluationDate: string
): NextStateRequirements {
  const status = evaluateDriverSafetyStatus(driverId, events, evaluationDate);
  
  if (status.currentState === 'ACTIVE') {
    return {
      currentState: 'ACTIVE',
      targetState: null,
      canProgress: true,
      requirements: ['Driver is in good standing - no action required'],
      daysUntilOldestClaimExpires: null,
    };
  }

  if (status.currentState === 'DISQUALIFIED') {
    return {
      currentState: 'DISQUALIFIED',
      targetState: null,
      canProgress: false,
      requirements: ['Driver is permanently disqualified - no progression possible'],
      daysUntilOldestClaimExpires: null,
    };
  }

  // Find oldest at-fault claim in 90-day window
  const windowStart = getWindowStartDate(evaluationDate, 90);
  const recentClaims = events
    .filter(e => e.atFault && e.eventType === 'AT_FAULT_CLAIM' && e.eventDate >= windowStart)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  const requirements: string[] = [];
  let daysUntilExpires: number | null = null;

  if (recentClaims.length > 0) {
    const oldestClaim = recentClaims[0];
    const oldestDate = new Date(oldestClaim.eventDate);
    const evalDate = new Date(evaluationDate);
    const expirationDate = new Date(oldestDate);
    expirationDate.setDate(expirationDate.getDate() + 90);
    
    daysUntilExpires = Math.ceil((expirationDate.getTime() - evalDate.getTime()) / (1000 * 60 * 60 * 24));
    
    requirements.push(`Wait ${daysUntilExpires} days for oldest at-fault claim to expire from 90-day window`);
    requirements.push(`Maintain safe driving record with no new at-fault incidents`);
  }

  if (status.currentState === 'SUSPENDED') {
    requirements.push(`Complete required safety retraining (when implemented)`);
  }

  return {
    currentState: status.currentState,
    targetState: 'ACTIVE',
    canProgress: daysUntilExpires !== null && daysUntilExpires > 0,
    requirements,
    daysUntilOldestClaimExpires: daysUntilExpires,
  };
}
