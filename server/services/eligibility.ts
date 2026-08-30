/**
 * Eligibility & Hard Enforcement Engine (INCREMENT 25B)
 * 
 * Server-enforced gates that prevent DB updates when conditions are not met.
 * All gates return structured error responses with codes and reasons.
 * 
 * Gates:
 * 1. canAssignWork(driverId, moveId) - Work assignment eligibility
 * 2. canOpenHiring(marketId) - Hiring/recruiting gate
 * 3. canLockPayPeriod(payPeriodId) - Pay period lock preconditions
 * 4. canExportPayroll(payPeriodId) - Payroll export rules
 */

import { 
  isDriverEligible, 
  evaluateDriverSafetyStatus, 
  type SafetyEvent, 
  type DriverSafetyStatus 
} from './safetyEnforcementEngine';
import { 
  findEffectivePlaybook, 
  canActivateMarket,
  type MarketPlaybook 
} from './marketPlaybookEngine';
import {
  type MarketLossScore,
  type RiskControl,
  getActiveMarketControls,
} from './insuranceRiskEngine';

// ============================================
// TYPES & CONSTANTS
// ============================================

/** Error codes for work assignment */
export type WorkAssignmentErrorCode = 
  | 'DRIVER_SAFETY_STATE_NOT_ACTIVE'
  | 'DRIVER_SUSPENDED'
  | 'DRIVER_DISQUALIFIED'
  | 'DRIVER_RESTRICTED'
  | 'DRIVER_NOT_ELIGIBLE_FOR_MARKET'
  | 'DRIVER_NOT_ELIGIBLE_FOR_ZONE'
  | 'DRIVER_NOT_ELIGIBLE_FOR_WORK_TYPE'
  | 'DRIVER_NOT_ELIGIBLE_FOR_EXECUTION_MODE'
  | 'DRIVER_HAS_ACTIVE_BLOCK'
  | 'DRIVER_HAS_OVERRIDE_BLOCK'
  | 'MARKET_NOT_ACTIVE'
  | 'MARKET_PLAYBOOK_INVALID'
  | 'MOVE_NOT_FOUND'
  | 'DRIVER_NOT_FOUND'
  | 'ELIGIBILITY_FAIL_SAFETY'
  | 'ELIGIBILITY_FAIL_WORK_TYPE'
  | 'ELIGIBILITY_FAIL_BLOCK';

/** Error codes for hiring gate */
export type HiringErrorCode = 
  | 'MARKET_NOT_FOUND'
  | 'MARKET_HIRING_FROZEN'
  | 'MARKET_THROTTLE_ACTIVE'
  | 'MARKET_NOT_ACTIVE'
  | 'MARKET_PLAYBOOK_INVALID'
  | 'MARKET_AT_CAPACITY'
  | 'MARKET_LOSS_SCORE_CRITICAL'
  | 'UTILIZATION_TOO_HIGH'
  | 'SAFETY_THRESHOLD_EXCEEDED';

/** Error codes for payroll operations */
export type PayrollErrorCode = 
  | 'PAY_PERIOD_NOT_FOUND'
  | 'PAY_PERIOD_NOT_PROCESSING'
  | 'PAY_PERIOD_NOT_LOCKED'
  | 'PAY_PERIOD_ALREADY_LOCKED'
  | 'PAY_PERIOD_ALREADY_EXPORTED'
  | 'MOVES_NOT_RECONCILED'
  | 'EXPENSES_NOT_APPROVED'
  | 'LOCKED_PERIOD_IMMUTABLE'
  | 'PAY_PERIOD_EMPTY'
  | 'PAY_PERIOD_INVALID_TRANSITION';

/** Work assignment check result */
export interface WorkAssignmentResult {
  allowed: boolean;
  driverId: string;
  moveId: string;
  checkedAt: string;
  code: WorkAssignmentErrorCode | null;
  reasons: string[];
  driverStatus?: DriverSafetyStatus;
  marketPlaybook?: MarketPlaybook | null;
}

/** Hiring check result */
export interface HiringCheckResult {
  allowed: boolean;
  marketId: string;
  checkedAt: string;
  code: HiringErrorCode | null;
  reasons: string[];
  hiringGateStatus?: string;
  throttleActive?: boolean;
}

/** Pay period check result */
export interface PayPeriodCheckResult {
  allowed: boolean;
  payPeriodId: string;
  checkedAt: string;
  code: PayrollErrorCode | null;
  reasons: string[];
  currentStatus?: string;
  requiredStatus?: string;
}

/** Driver block/override info */
export interface DriverBlock {
  id: string;
  driverId: string;
  blockType: 'SAFETY' | 'COMPLIANCE' | 'MANUAL' | 'OVERRIDE';
  reason: string;
  startDate: string;
  endDate?: string;
  isActive: boolean;
  createdBy: string;
}

/** Move details for assignment check */
export interface MoveDetails {
  id: string;
  marketId: string;
  zoneId?: string;
  workType: string; // 'ON_DEMAND' | 'SCHEDULED' | 'MANUAL'
  executionMode: string; // 'COMPANY_VEHICLE' | 'DRIVER_VEHICLE' | 'CUSTOMER_VEHICLE'
}

/** Driver eligibility info */
export interface DriverEligibility {
  driverId: string;
  safetyState: string;
  eligibleMarkets: string[];
  eligibleZones: string[];
  eligibleWorkTypes: string[];
  eligibleExecutionModes: string[];
  blocks: DriverBlock[];
}

/** Market hiring gate info */
export interface MarketHiringGate {
  marketId: string;
  hiringGateStatus: 'OPEN' | 'LIMITED' | 'FROZEN' | 'CLOSED';
  throttleActive: boolean;
  throttleReason?: string;
  currentCapacity: number;
  maxCapacity: number;
  utilizationRate: number;
}

// ============================================
// WORK ASSIGNMENT GATE
// ============================================

/**
 * canAssignWork - Hard enforcement gate for work assignment
 * 
 * Validates:
 * 1. Driver safety_state is ACTIVE
 * 2. Driver is eligible for the move's market/zone/work_type/execution_mode
 * 3. Driver has no active block or override
 * 
 * @returns 409 Conflict with {allowed: false, code, reasons[]} if not allowed
 */
export function canAssignWork(
  driver: DriverEligibility,
  move: MoveDetails,
  safetyEvents?: SafetyEvent[],
  marketPlaybooks?: MarketPlaybook[]
): WorkAssignmentResult {
  const checkedAt = new Date().toISOString();
  const reasons: string[] = [];
  let code: WorkAssignmentErrorCode | null = null;
  
  // 1. Check driver safety state is ACTIVE
  if (driver.safetyState !== 'ACTIVE') {
    switch (driver.safetyState) {
      case 'SUSPENDED':
        code = 'DRIVER_SUSPENDED';
        reasons.push('Driver is currently suspended and cannot accept assignments');
        break;
      case 'DISQUALIFIED':
        code = 'DRIVER_DISQUALIFIED';
        reasons.push('Driver has been permanently disqualified');
        break;
      case 'RESTRICTED':
        code = 'DRIVER_RESTRICTED';
        reasons.push('Driver is in restricted status and cannot accept new assignments');
        break;
      default:
        code = 'DRIVER_SAFETY_STATE_NOT_ACTIVE';
        reasons.push(`Driver safety state (${driver.safetyState}) does not allow assignments`);
    }
    
    return {
      allowed: false,
      driverId: driver.driverId,
      moveId: move.id,
      checkedAt,
      code,
      reasons,
    };
  }
  
  // 2a. Check driver is eligible for move's market
  if (!driver.eligibleMarkets.includes(move.marketId)) {
    return {
      allowed: false,
      driverId: driver.driverId,
      moveId: move.id,
      checkedAt,
      code: 'DRIVER_NOT_ELIGIBLE_FOR_MARKET',
      reasons: [`Driver is not eligible to work in market ${move.marketId}`],
    };
  }
  
  // 2b. Check driver is eligible for move's zone (if specified)
  if (move.zoneId && driver.eligibleZones.length > 0 && !driver.eligibleZones.includes(move.zoneId)) {
    return {
      allowed: false,
      driverId: driver.driverId,
      moveId: move.id,
      checkedAt,
      code: 'DRIVER_NOT_ELIGIBLE_FOR_ZONE',
      reasons: [`Driver is not eligible to work in zone ${move.zoneId}`],
    };
  }
  
  // 2c. Check driver is eligible for work type
  if (!driver.eligibleWorkTypes.includes(move.workType)) {
    return {
      allowed: false,
      driverId: driver.driverId,
      moveId: move.id,
      checkedAt,
      code: 'DRIVER_NOT_ELIGIBLE_FOR_WORK_TYPE',
      reasons: [`Driver is not eligible for work type ${move.workType}`],
    };
  }
  
  // 2d. Check driver is eligible for execution mode
  if (!driver.eligibleExecutionModes.includes(move.executionMode)) {
    return {
      allowed: false,
      driverId: driver.driverId,
      moveId: move.id,
      checkedAt,
      code: 'DRIVER_NOT_ELIGIBLE_FOR_EXECUTION_MODE',
      reasons: [`Driver is not eligible for execution mode ${move.executionMode}`],
    };
  }
  
  // 3. Check for active blocks or overrides
  const activeBlocks = driver.blocks.filter(b => b.isActive);
  if (activeBlocks.length > 0) {
    const blockTypes = activeBlocks.map(b => b.blockType);
    if (blockTypes.includes('OVERRIDE')) {
      return {
        allowed: false,
        driverId: driver.driverId,
        moveId: move.id,
        checkedAt,
        code: 'DRIVER_HAS_OVERRIDE_BLOCK',
        reasons: activeBlocks.filter(b => b.blockType === 'OVERRIDE').map(b => `Override block: ${b.reason}`),
      };
    }
    return {
      allowed: false,
      driverId: driver.driverId,
      moveId: move.id,
      checkedAt,
      code: 'DRIVER_HAS_ACTIVE_BLOCK',
      reasons: activeBlocks.map(b => `${b.blockType} block: ${b.reason}`),
    };
  }
  
  // 4. Optional: Check market playbook validity
  if (marketPlaybooks && marketPlaybooks.length > 0) {
    const effectivePlaybook = findEffectivePlaybook(marketPlaybooks, move.marketId, new Date().toISOString().split('T')[0]);
    if (!effectivePlaybook) {
      return {
        allowed: false,
        driverId: driver.driverId,
        moveId: move.id,
        checkedAt,
        code: 'MARKET_NOT_ACTIVE',
        reasons: [`No active market playbook found for market ${move.marketId}`],
        marketPlaybook: null,
      };
    }
    
    const playbookValidation = canActivateMarket(effectivePlaybook);
    if (Array.isArray(playbookValidation)) {
      return {
        allowed: false,
        driverId: driver.driverId,
        moveId: move.id,
        checkedAt,
        code: 'MARKET_PLAYBOOK_INVALID',
        reasons: [`Market playbook has ${playbookValidation.length} validation errors`],
        marketPlaybook: effectivePlaybook,
      };
    }
  }
  
  // All checks passed
  return {
    allowed: true,
    driverId: driver.driverId,
    moveId: move.id,
    checkedAt,
    code: null,
    reasons: [],
  };
}

// ============================================
// HIRING GATE
// ============================================

/**
 * canOpenHiring - Hard enforcement gate for recruiting/driver activation
 * 
 * Blocks when:
 * 1. Market hiring_gate_status is FROZEN
 * 2. Market has active throttle
 * 
 * @returns 403/409 with structured reasons if blocked
 */
export function canOpenHiring(
  marketId: string,
  hiringGate: MarketHiringGate,
  marketPlaybooks?: MarketPlaybook[],
  marketLossScore?: MarketLossScore | null
): HiringCheckResult {
  const checkedAt = new Date().toISOString();
  const reasons: string[] = [];
  
  // 1. Check if hiring gate is FROZEN
  if (hiringGate.hiringGateStatus === 'FROZEN') {
    return {
      allowed: false,
      marketId,
      checkedAt,
      code: 'MARKET_HIRING_FROZEN',
      reasons: ['Market hiring has been frozen by administration'],
      hiringGateStatus: hiringGate.hiringGateStatus,
      throttleActive: hiringGate.throttleActive,
    };
  }
  
  // 2. Check if throttle is active
  if (hiringGate.throttleActive) {
    return {
      allowed: false,
      marketId,
      checkedAt,
      code: 'MARKET_THROTTLE_ACTIVE',
      reasons: [hiringGate.throttleReason || 'Market is under active throttle'],
      hiringGateStatus: hiringGate.hiringGateStatus,
      throttleActive: true,
    };
  }
  
  // 3. Check hiring gate is CLOSED
  if (hiringGate.hiringGateStatus === 'CLOSED') {
    return {
      allowed: false,
      marketId,
      checkedAt,
      code: 'MARKET_AT_CAPACITY',
      reasons: ['Market is at capacity and hiring is closed'],
      hiringGateStatus: hiringGate.hiringGateStatus,
      throttleActive: false,
    };
  }
  
  // 4. Check utilization rate (critical threshold typically 95%)
  if (hiringGate.utilizationRate >= 0.95) {
    return {
      allowed: false,
      marketId,
      checkedAt,
      code: 'UTILIZATION_TOO_HIGH',
      reasons: [`Market utilization (${(hiringGate.utilizationRate * 100).toFixed(1)}%) exceeds critical threshold`],
      hiringGateStatus: hiringGate.hiringGateStatus,
      throttleActive: false,
    };
  }
  
  // 5. Check market playbook validity (if provided)
  if (marketPlaybooks && marketPlaybooks.length > 0) {
    const effectivePlaybook = findEffectivePlaybook(marketPlaybooks, marketId, new Date().toISOString().split('T')[0]);
    if (!effectivePlaybook) {
      return {
        allowed: false,
        marketId,
        checkedAt,
        code: 'MARKET_NOT_ACTIVE',
        reasons: [`No active market playbook found for market ${marketId}`],
        hiringGateStatus: hiringGate.hiringGateStatus,
        throttleActive: false,
      };
    }
    
    const playbookValidation = canActivateMarket(effectivePlaybook);
    if (Array.isArray(playbookValidation)) {
      return {
        allowed: false,
        marketId,
        checkedAt,
        code: 'MARKET_PLAYBOOK_INVALID',
        reasons: [`Market playbook has ${playbookValidation.length} validation errors`],
        hiringGateStatus: hiringGate.hiringGateStatus,
        throttleActive: false,
      };
    }
  }
  
  // 6. Check market loss score (if provided) - critical threshold blocks hiring
  // Score is 0-100 scale, critical threshold is 80+
  if (marketLossScore && marketLossScore.score >= 80) {
    return {
      allowed: false,
      marketId,
      checkedAt,
      code: 'MARKET_LOSS_SCORE_CRITICAL',
      reasons: [`Market loss score (${marketLossScore.score.toFixed(1)}) exceeds critical threshold (80)`],
      hiringGateStatus: hiringGate.hiringGateStatus,
      throttleActive: false,
    };
  }
  
  // All checks passed
  return {
    allowed: true,
    marketId,
    checkedAt,
    code: null,
    reasons: [],
    hiringGateStatus: hiringGate.hiringGateStatus,
    throttleActive: false,
  };
}

// ============================================
// PAYROLL ENFORCEMENT
// ============================================

/** Pay period info for lock check */
export interface PayPeriodInfo {
  id: string;
  status: string;
  lockedAt?: Date | null;
  exportedAt?: Date | null;
  exportStatus?: string;
  movesReconciled?: boolean;
  expensesApproved?: boolean;
}

/**
 * canLockPayPeriod - Enforce LOCK preconditions
 * 
 * Requirements:
 * 1. Pay period must be in PROCESSING status
 * 2. All moves must be reconciled
 * 3. All expenses must be approved
 * 4. Cannot lock if already locked
 * 
 * @returns structured error if preconditions not met
 */
export function canLockPayPeriod(payPeriod: PayPeriodInfo): PayPeriodCheckResult {
  const checkedAt = new Date().toISOString();
  const reasons: string[] = [];
  
  // 1. Check if already locked
  const normalizedStatus = payPeriod.status?.toUpperCase();
  if (normalizedStatus === 'LOCKED') {
    return {
      allowed: false,
      payPeriodId: payPeriod.id,
      checkedAt,
      code: 'PAY_PERIOD_ALREADY_LOCKED',
      reasons: ['Pay period is already locked and cannot be locked again'],
      currentStatus: payPeriod.status,
      requiredStatus: 'PROCESSING',
    };
  }
  
  // 2. Check if in PROCESSING status
  if (normalizedStatus !== 'PROCESSING') {
    return {
      allowed: false,
      payPeriodId: payPeriod.id,
      checkedAt,
      code: 'PAY_PERIOD_NOT_PROCESSING',
      reasons: [`Pay period must be in PROCESSING status to lock. Current: ${payPeriod.status}`],
      currentStatus: payPeriod.status,
      requiredStatus: 'PROCESSING',
    };
  }
  
  // 3. Check moves reconciled (if info available)
  if (payPeriod.movesReconciled === false) {
    reasons.push('All moves must be reconciled before locking');
  }
  
  // 4. Check expenses approved (if info available)
  if (payPeriod.expensesApproved === false) {
    reasons.push('All expenses must be approved before locking');
  }
  
  if (reasons.length > 0) {
    return {
      allowed: false,
      payPeriodId: payPeriod.id,
      checkedAt,
      code: 'MOVES_NOT_RECONCILED', // Use first applicable code
      reasons,
      currentStatus: payPeriod.status,
      requiredStatus: 'PROCESSING',
    };
  }
  
  // All checks passed
  return {
    allowed: true,
    payPeriodId: payPeriod.id,
    checkedAt,
    code: null,
    reasons: [],
    currentStatus: payPeriod.status,
    requiredStatus: 'LOCKED', // Target status
  };
}

/**
 * canExportPayroll - Enforce export rules
 * 
 * Requirements:
 * 1. Pay period must be LOCKED
 * 2. Cannot export if already exported (immutable)
 * 
 * @returns structured error if preconditions not met
 */
export function canExportPayroll(payPeriod: PayPeriodInfo): PayPeriodCheckResult {
  const checkedAt = new Date().toISOString();
  
  // 1. Check if in LOCKED status
  const normalizedStatus = payPeriod.status?.toUpperCase();
  if (normalizedStatus !== 'LOCKED') {
    return {
      allowed: false,
      payPeriodId: payPeriod.id,
      checkedAt,
      code: 'PAY_PERIOD_NOT_LOCKED',
      reasons: [`Pay period must be LOCKED before export. Current: ${payPeriod.status}`],
      currentStatus: payPeriod.status,
      requiredStatus: 'LOCKED',
    };
  }
  
  // 2. Check if already exported
  const normalizedExportStatus = payPeriod.exportStatus?.toUpperCase();
  if (normalizedExportStatus === 'EXPORTED') {
    return {
      allowed: false,
      payPeriodId: payPeriod.id,
      checkedAt,
      code: 'PAY_PERIOD_ALREADY_EXPORTED',
      reasons: ['Pay period has already been exported and is immutable'],
      currentStatus: payPeriod.status,
    };
  }
  
  // All checks passed
  return {
    allowed: true,
    payPeriodId: payPeriod.id,
    checkedAt,
    code: null,
    reasons: [],
    currentStatus: payPeriod.status,
  };
}

/**
 * isLockedPeriodImmutable - Check if pay period data can be modified
 * 
 * LOCK is immutable - no modifications allowed after locking
 */
export function isLockedPeriodImmutable(payPeriod: PayPeriodInfo): boolean {
  const normalizedStatus = payPeriod.status?.toUpperCase();
  return normalizedStatus === 'LOCKED';
}

/**
 * canModifyPayPeriodData - Check if pay period data (pay lines, etc.) can be modified
 * 
 * @returns structured error if period is locked
 */
export function canModifyPayPeriodData(payPeriod: PayPeriodInfo): PayPeriodCheckResult {
  const checkedAt = new Date().toISOString();
  
  if (isLockedPeriodImmutable(payPeriod)) {
    return {
      allowed: false,
      payPeriodId: payPeriod.id,
      checkedAt,
      code: 'LOCKED_PERIOD_IMMUTABLE',
      reasons: ['Locked pay periods are immutable and cannot be modified'],
      currentStatus: payPeriod.status,
    };
  }
  
  return {
    allowed: true,
    payPeriodId: payPeriod.id,
    checkedAt,
    code: null,
    reasons: [],
    currentStatus: payPeriod.status,
  };
}

// ============================================
// HTTP RESPONSE HELPERS
// ============================================

/** Build 409 Conflict response for work assignment */
export function buildWorkAssignmentError(result: WorkAssignmentResult): {
  statusCode: number;
  body: { allowed: boolean; code: string; reasons: string[]; driverId: string; moveId: string };
} {
  return {
    statusCode: 409,
    body: {
      allowed: false,
      code: result.code || 'UNKNOWN_ERROR',
      reasons: result.reasons,
      driverId: result.driverId,
      moveId: result.moveId,
    },
  };
}

/** Build 403/409 response for hiring gate */
export function buildHiringError(result: HiringCheckResult): {
  statusCode: number;
  body: { allowed: boolean; code: string; reasons: string[]; marketId: string };
} {
  const statusCode = result.code === 'MARKET_HIRING_FROZEN' ? 403 : 409;
  return {
    statusCode,
    body: {
      allowed: false,
      code: result.code || 'UNKNOWN_ERROR',
      reasons: result.reasons,
      marketId: result.marketId,
    },
  };
}

/** Build error response for payroll operations */
export function buildPayrollError(result: PayPeriodCheckResult): {
  statusCode: number;
  body: { allowed: boolean; code: string; reasons: string[]; payPeriodId: string; currentStatus?: string };
} {
  return {
    statusCode: 409,
    body: {
      allowed: false,
      code: result.code || 'UNKNOWN_ERROR',
      reasons: result.reasons,
      payPeriodId: result.payPeriodId,
      currentStatus: result.currentStatus,
    },
  };
}

// ============================================
// INCREMENT 25B: MOVE ELIGIBILITY SNAPSHOT (INGESTION GATE)
// ============================================

/** Eligibility status for moves - snapshotted at ingestion, immutable after */
export type EligibilityStatus = 'PASS' | 'WARN' | 'FAIL';

/** Move eligibility snapshot - persisted with move at ingest time */
export interface MoveEligibilitySnapshot {
  eligibilityStatus: EligibilityStatus;
  eligibilityReasons: string[];
  eligibilityCheckedAt: string;
  eligibilityPolicyVersionId: string;
  errorCode?: WorkAssignmentErrorCode;
}

/** Move context for eligibility evaluation */
export interface MoveContext {
  moveNumber?: string;
  marketId?: string;
  zoneId?: string;
  workType?: string;
  executionMode?: string;
}

/** Fallback policy version - used if no active version in DB */
const FALLBACK_POLICY_VERSION = 'v25b.1';

/**
 * evaluateMoveEligibility - GATE 1: Ingestion Eligibility Evaluation
 * 
 * PASS/WARN/FAIL v1 (A1 — NO LOSS SCORE) Rules:
 * 
 * FAIL if any:
 * - driver.safety_state != ACTIVE
 * - driver has active block (expires_at null or > now)
 * - driver.work_type != move.work_type
 * - (optional) driver cannot do move.execution_mode (only if capability flags exist)
 * 
 * PASS otherwise.
 * 
 * Called when moves are ingested (CSV upload, scheduled import, manual entry).
 * Returns an immutable snapshot to persist with the move.
 * 
 * @param driverEligibility - Driver's eligibility info (or null if no driver assigned)
 * @param moveContext - Move details for evaluation
 * @param activePolicyId - Explicit policy version ID from DB (Gate 1 enforcement)
 * @returns Immutable eligibility snapshot
 */
export function evaluateMoveEligibility(
  driverEligibility: DriverEligibility | null,
  moveContext: MoveContext,
  activePolicyId?: string
): MoveEligibilitySnapshot {
  const checkedAt = new Date().toISOString();
  const reasons: string[] = [];
  const policyVersionId = activePolicyId || FALLBACK_POLICY_VERSION;
  
  // If no driver assigned, PASS (no eligibility to check - unassigned move)
  if (!driverEligibility) {
    return {
      eligibilityStatus: 'PASS',
      eligibilityReasons: [],
      eligibilityCheckedAt: checkedAt,
      eligibilityPolicyVersionId: policyVersionId,
    };
  }
  
  // 1. FAIL if driver.safety_state != ACTIVE
  if (driverEligibility.safetyState !== 'ACTIVE') {
    reasons.push(`Driver safety state is ${driverEligibility.safetyState}, not ACTIVE`);
    return {
      eligibilityStatus: 'FAIL',
      eligibilityReasons: reasons,
      eligibilityCheckedAt: checkedAt,
      eligibilityPolicyVersionId: policyVersionId,
      errorCode: 'ELIGIBILITY_FAIL_SAFETY',
    };
  }

  // 2. FAIL if driver has active block
  const now = new Date();
  const activeBlocks = driverEligibility.blocks.filter(b => {
    if (!b.endDate) return true;
    return new Date(b.endDate) > now;
  });
  if (activeBlocks.length > 0) {
    reasons.push(`Driver has ${activeBlocks.length} active block(s)`);
    return {
      eligibilityStatus: 'FAIL',
      eligibilityReasons: reasons,
      eligibilityCheckedAt: checkedAt,
      eligibilityPolicyVersionId: policyVersionId,
      errorCode: 'ELIGIBILITY_FAIL_BLOCK',
    };
  }

  // 3. FAIL if driver.work_type != move.work_type
  if (moveContext.workType) {
    const driverWorkTypes = driverEligibility.eligibleWorkTypes || [];
    if (!driverWorkTypes.includes(moveContext.workType)) {
      reasons.push(`Driver not eligible for work type ${moveContext.workType}`);
      return {
        eligibilityStatus: 'FAIL',
        eligibilityReasons: reasons,
        eligibilityCheckedAt: checkedAt,
        eligibilityPolicyVersionId: policyVersionId,
        errorCode: 'ELIGIBILITY_FAIL_WORK_TYPE',
      };
    }
  }
  
  // 4. FAIL if driver cannot do move.execution_mode
  if (moveContext.executionMode) {
    const driverExecutionModes = driverEligibility.eligibleExecutionModes || [];
    if (driverExecutionModes.length > 0 && !driverExecutionModes.includes(moveContext.executionMode)) {
      reasons.push(`Driver not eligible for execution mode ${moveContext.executionMode}`);
      return {
        eligibilityStatus: 'FAIL',
        eligibilityReasons: reasons,
        eligibilityCheckedAt: checkedAt,
        eligibilityPolicyVersionId: policyVersionId,
        errorCode: 'DRIVER_NOT_ELIGIBLE_FOR_EXECUTION_MODE',
      };
    }
  }

  // All checks passed
  return {
    eligibilityStatus: 'PASS',
    eligibilityReasons: [],
    eligibilityCheckedAt: checkedAt,
    eligibilityPolicyVersionId: policyVersionId,
  };
}

// ============================================
// INCREMENT 25B: ROSTER EXPORT GATE
// ============================================

/** Driver roster eligibility info */
export interface DriverRosterInfo {
  driverId: string;
  safetyState: string;
  eligibilityState?: string; // ACTIVE, INACTIVE, etc.
  hasActiveBlock: boolean;
  marketHiringGateStatus?: string;
}

/** Roster export exclusion result */
export interface RosterExclusionResult {
  driverId: string;
  excluded: boolean;
  reasons: string[];
}

/**
 * canIncludeInRoster - GATE 2: Roster Export Filter
 * 
 * Determines if a driver should be included in roster/availability exports.
 * 
 * Excludes drivers unless:
 * - eligibility_state = ACTIVE
 * - safety_state = ACTIVE  
 * - no active block
 * - market hiring gate = OPEN
 */
export function canIncludeInRoster(driver: DriverRosterInfo): RosterExclusionResult {
  const reasons: string[] = [];
  
  // Check safety state
  if (driver.safetyState !== 'ACTIVE') {
    reasons.push(`Safety state is ${driver.safetyState}, not ACTIVE`);
  }
  
  // Check eligibility state
  if (driver.eligibilityState && driver.eligibilityState !== 'ACTIVE') {
    reasons.push(`Eligibility state is ${driver.eligibilityState}, not ACTIVE`);
  }
  
  // Check for active blocks
  if (driver.hasActiveBlock) {
    reasons.push('Driver has an active block');
  }
  
  // Check market hiring gate
  if (driver.marketHiringGateStatus && driver.marketHiringGateStatus !== 'OPEN') {
    reasons.push(`Market hiring gate is ${driver.marketHiringGateStatus}, not OPEN`);
  }
  
  return {
    driverId: driver.driverId,
    excluded: reasons.length > 0,
    reasons,
  };
}

/**
 * filterRosterExport - Filters drivers for roster export
 * 
 * @param drivers - Array of driver roster info
 * @returns Object with included drivers and exclusion log
 */
export function filterRosterExport(drivers: DriverRosterInfo[]): {
  included: DriverRosterInfo[];
  excluded: RosterExclusionResult[];
} {
  const included: DriverRosterInfo[] = [];
  const excluded: RosterExclusionResult[] = [];
  
  for (const driver of drivers) {
    const result = canIncludeInRoster(driver);
    if (result.excluded) {
      excluded.push(result);
    } else {
      included.push(driver);
    }
  }
  
  return { included, excluded };
}

// ============================================
// INCREMENT 25B: PAYROLL EXPORT GATE
// ============================================

/** Move info for payroll export check */
export interface MoveForPayroll {
  tripId: string;
  moveNumber: string;
  driverId: string;
  eligibilityStatus: EligibilityStatus | null;
  eligibilityReasons: string[] | null;
  payRate?: string | number;
}

/** Payroll exception entry */
export interface PayrollExceptionEntry {
  tripId: string;
  moveNumber: string;
  driverId: string;
  exceptionType: 'ELIGIBILITY_FAIL' | 'ELIGIBILITY_WARN' | 'MANUAL_HOLD';
  eligibilityReasons: string[];
  originalEligibilityStatus: EligibilityStatus;
}

/** Payroll export result */
export interface PayrollExportResult {
  allowed: boolean;
  payPeriodId: string;
  payPeriodStatus: string;
  includedMoves: MoveForPayroll[];
  exceptions: PayrollExceptionEntry[];
  code: PayrollErrorCode | null;
  reasons: string[];
}

/** Authorized payroll override users */
const PAYROLL_OVERRIDE_AUTHORIZED_EMAILS = [
  'will.walton@driverhub360.com',
  'david.forman@driverhub360.com',
];

/**
 * canOverridePayrollException - Check if user can approve payroll exceptions
 * 
 * Only Will Walton and David Forman can override payroll exceptions.
 */
export function canOverridePayrollException(userEmail: string): boolean {
  return PAYROLL_OVERRIDE_AUTHORIZED_EMAILS.some(
    email => email.toLowerCase() === userEmail.toLowerCase()
  );
}

/**
 * filterMovesForPayrollExport - GATE 3: Payroll Export Filter
 * 
 * Filters moves for payroll export:
 * - Only from LOCKED pay periods
 * - Excludes moves where eligibility_status ≠ PASS
 * - Routes excluded moves to Payroll Exceptions
 * 
 * @param payPeriod - Pay period info
 * @param moves - Moves to export
 * @returns PayrollExportResult with included moves and exceptions
 */
export function filterMovesForPayrollExport(
  payPeriod: PayPeriodInfo,
  moves: MoveForPayroll[]
): PayrollExportResult {
  // Check pay period is LOCKED
  if (payPeriod.status !== 'LOCKED') {
    return {
      allowed: false,
      payPeriodId: payPeriod.id,
      payPeriodStatus: payPeriod.status,
      includedMoves: [],
      exceptions: [],
      code: 'PAY_PERIOD_NOT_LOCKED',
      reasons: [`Pay period must be LOCKED for export, current status: ${payPeriod.status}`],
    };
  }
  
  const includedMoves: MoveForPayroll[] = [];
  const exceptions: PayrollExceptionEntry[] = [];
  
  for (const move of moves) {
    // Only include PASS moves
    if (move.eligibilityStatus === 'PASS' || move.eligibilityStatus === null) {
      // null eligibility status means pre-25B move, include for backward compatibility
      includedMoves.push(move);
    } else {
      // WARN or FAIL - route to exceptions
      const exceptionType: PayrollExceptionEntry['exceptionType'] = 
        move.eligibilityStatus === 'FAIL' ? 'ELIGIBILITY_FAIL' : 'ELIGIBILITY_WARN';
      
      exceptions.push({
        tripId: move.tripId,
        moveNumber: move.moveNumber,
        driverId: move.driverId,
        exceptionType,
        eligibilityReasons: move.eligibilityReasons || [],
        originalEligibilityStatus: move.eligibilityStatus,
      });
    }
  }
  
  return {
    allowed: true,
    payPeriodId: payPeriod.id,
    payPeriodStatus: payPeriod.status,
    includedMoves,
    exceptions,
    code: null,
    reasons: [],
  };
}

/** Override approval result */
export interface OverrideApprovalResult {
  allowed: boolean;
  tripId: string;
  approvedBy: string;
  approvedAt: string;
  reason: string;
  code: string | null;
  message: string;
}

/**
 * approvePayrollException - Approve a payroll exception override
 * 
 * Only Will Walton and David Forman can approve.
 * Requires a reason for audit trail.
 */
export function approvePayrollException(
  tripId: string,
  userEmail: string,
  reason: string
): OverrideApprovalResult {
  const approvedAt = new Date().toISOString();
  
  if (!canOverridePayrollException(userEmail)) {
    return {
      allowed: false,
      tripId,
      approvedBy: userEmail,
      approvedAt,
      reason,
      code: 'UNAUTHORIZED_OVERRIDE',
      message: 'Only Will Walton or David Forman can approve payroll exceptions',
    };
  }
  
  if (!reason || reason.trim().length < 10) {
    return {
      allowed: false,
      tripId,
      approvedBy: userEmail,
      approvedAt,
      reason,
      code: 'REASON_REQUIRED',
      message: 'A detailed reason (minimum 10 characters) is required for override approval',
    };
  }
  
  return {
    allowed: true,
    tripId,
    approvedBy: userEmail,
    approvedAt,
    reason: reason.trim(),
    code: null,
    message: 'Override approved successfully',
  };
}
