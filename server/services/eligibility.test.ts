/**
 * Unit Tests for Eligibility & Hard Enforcement Engine (INCREMENT 25B)
 * 
 * Tests for:
 * 1. canAssignWork - Work assignment eligibility gate
 * 2. canOpenHiring - Hiring/recruiting gate
 * 3. canLockPayPeriod - Pay period lock preconditions
 * 4. canExportPayroll - Payroll export rules
 */

import { describe, it, expect } from 'vitest';
import {
  canAssignWork,
  canOpenHiring,
  canLockPayPeriod,
  canExportPayroll,
  canModifyPayPeriodData,
  isLockedPeriodImmutable,
  buildWorkAssignmentError,
  buildHiringError,
  buildPayrollError,
  type DriverEligibility,
  type MoveDetails,
  type MarketHiringGate,
  type PayPeriodInfo,
} from './eligibility';

// ============================================
// TEST HELPERS
// ============================================

function createTestDriver(overrides: Partial<DriverEligibility> = {}): DriverEligibility {
  return {
    driverId: 'driver-001',
    safetyState: 'ACTIVE',
    eligibleMarkets: ['market-001', 'market-002'],
    eligibleZones: ['zone-A', 'zone-B'],
    eligibleWorkTypes: ['ON_DEMAND', 'SCHEDULED', 'MANUAL'],
    eligibleExecutionModes: ['COMPANY_VEHICLE', 'DRIVER_VEHICLE', 'CUSTOMER_VEHICLE'],
    blocks: [],
    ...overrides,
  };
}

function createTestMove(overrides: Partial<MoveDetails> = {}): MoveDetails {
  return {
    id: 'move-001',
    marketId: 'market-001',
    workType: 'ON_DEMAND',
    executionMode: 'COMPANY_VEHICLE',
    ...overrides,
  };
}

function createTestHiringGate(overrides: Partial<MarketHiringGate> = {}): MarketHiringGate {
  return {
    marketId: 'market-001',
    hiringGateStatus: 'OPEN',
    throttleActive: false,
    currentCapacity: 50,
    maxCapacity: 100,
    utilizationRate: 0.5,
    ...overrides,
  };
}

function createTestPayPeriod(overrides: Partial<PayPeriodInfo> = {}): PayPeriodInfo {
  return {
    id: 'period-001',
    status: 'PROCESSING',
    lockedAt: null,
    exportedAt: null,
    exportStatus: 'NOT_EXPORTED',
    movesReconciled: true,
    expensesApproved: true,
    ...overrides,
  };
}

// ============================================
// canAssignWork TESTS
// ============================================

describe('canAssignWork', () => {
  describe('Driver Safety State Checks', () => {
    it('should allow assignment for ACTIVE driver', () => {
      const driver = createTestDriver({ safetyState: 'ACTIVE' });
      const move = createTestMove();
      
      const result = canAssignWork(driver, move);
      
      expect(result.allowed).toBe(true);
      expect(result.code).toBeNull();
      expect(result.reasons).toHaveLength(0);
    });

    it('should reject SUSPENDED driver with correct code', () => {
      const driver = createTestDriver({ safetyState: 'SUSPENDED' });
      const move = createTestMove();
      
      const result = canAssignWork(driver, move);
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('DRIVER_SUSPENDED');
      expect(result.reasons).toContain('Driver is currently suspended and cannot accept assignments');
    });

    it('should reject DISQUALIFIED driver with correct code', () => {
      const driver = createTestDriver({ safetyState: 'DISQUALIFIED' });
      const move = createTestMove();
      
      const result = canAssignWork(driver, move);
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('DRIVER_DISQUALIFIED');
      expect(result.reasons).toContain('Driver has been permanently disqualified');
    });

    it('should reject RESTRICTED driver with correct code', () => {
      const driver = createTestDriver({ safetyState: 'RESTRICTED' });
      const move = createTestMove();
      
      const result = canAssignWork(driver, move);
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('DRIVER_RESTRICTED');
      expect(result.reasons).toContain('Driver is in restricted status and cannot accept new assignments');
    });

    it('should reject other non-ACTIVE states', () => {
      const driver = createTestDriver({ safetyState: 'PROBATION' });
      const move = createTestMove();
      
      const result = canAssignWork(driver, move);
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('DRIVER_SAFETY_STATE_NOT_ACTIVE');
    });
  });

  describe('Market Eligibility Checks', () => {
    it('should allow assignment when driver is eligible for market', () => {
      const driver = createTestDriver({ eligibleMarkets: ['market-001'] });
      const move = createTestMove({ marketId: 'market-001' });
      
      const result = canAssignWork(driver, move);
      
      expect(result.allowed).toBe(true);
    });

    it('should reject when driver not eligible for market', () => {
      const driver = createTestDriver({ eligibleMarkets: ['market-002', 'market-003'] });
      const move = createTestMove({ marketId: 'market-001' });
      
      const result = canAssignWork(driver, move);
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('DRIVER_NOT_ELIGIBLE_FOR_MARKET');
      expect(result.reasons[0]).toContain('market-001');
    });
  });

  describe('Zone Eligibility Checks', () => {
    it('should allow assignment when driver is eligible for zone', () => {
      const driver = createTestDriver({ eligibleZones: ['zone-A', 'zone-B'] });
      const move = createTestMove({ zoneId: 'zone-A' });
      
      const result = canAssignWork(driver, move);
      
      expect(result.allowed).toBe(true);
    });

    it('should reject when driver not eligible for zone', () => {
      const driver = createTestDriver({ eligibleZones: ['zone-A', 'zone-B'] });
      const move = createTestMove({ zoneId: 'zone-C' });
      
      const result = canAssignWork(driver, move);
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('DRIVER_NOT_ELIGIBLE_FOR_ZONE');
    });

    it('should skip zone check when no zone specified on move', () => {
      const driver = createTestDriver({ eligibleZones: ['zone-A'] });
      const move = createTestMove({ zoneId: undefined });
      
      const result = canAssignWork(driver, move);
      
      expect(result.allowed).toBe(true);
    });
  });

  describe('Work Type Eligibility Checks', () => {
    it('should allow assignment for eligible work type', () => {
      const driver = createTestDriver({ eligibleWorkTypes: ['ON_DEMAND', 'SCHEDULED'] });
      const move = createTestMove({ workType: 'ON_DEMAND' });
      
      const result = canAssignWork(driver, move);
      
      expect(result.allowed).toBe(true);
    });

    it('should reject when driver not eligible for work type', () => {
      const driver = createTestDriver({ eligibleWorkTypes: ['SCHEDULED'] });
      const move = createTestMove({ workType: 'ON_DEMAND' });
      
      const result = canAssignWork(driver, move);
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('DRIVER_NOT_ELIGIBLE_FOR_WORK_TYPE');
    });
  });

  describe('Execution Mode Eligibility Checks', () => {
    it('should allow assignment for eligible execution mode', () => {
      const driver = createTestDriver({ eligibleExecutionModes: ['COMPANY_VEHICLE', 'DRIVER_VEHICLE'] });
      const move = createTestMove({ executionMode: 'COMPANY_VEHICLE' });
      
      const result = canAssignWork(driver, move);
      
      expect(result.allowed).toBe(true);
    });

    it('should reject when driver not eligible for execution mode', () => {
      const driver = createTestDriver({ eligibleExecutionModes: ['DRIVER_VEHICLE'] });
      const move = createTestMove({ executionMode: 'COMPANY_VEHICLE' });
      
      const result = canAssignWork(driver, move);
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('DRIVER_NOT_ELIGIBLE_FOR_EXECUTION_MODE');
    });
  });

  describe('Block/Override Checks', () => {
    it('should reject driver with active SAFETY block', () => {
      const driver = createTestDriver({
        blocks: [{
          id: 'block-1',
          driverId: 'driver-001',
          blockType: 'SAFETY',
          reason: 'Multiple safety violations',
          startDate: '2024-01-01',
          isActive: true,
          createdBy: 'system',
        }],
      });
      const move = createTestMove();
      
      const result = canAssignWork(driver, move);
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('DRIVER_HAS_ACTIVE_BLOCK');
      expect(result.reasons[0]).toContain('SAFETY block');
    });

    it('should reject driver with active OVERRIDE block with specific code', () => {
      const driver = createTestDriver({
        blocks: [{
          id: 'block-1',
          driverId: 'driver-001',
          blockType: 'OVERRIDE',
          reason: 'Administrative hold',
          startDate: '2024-01-01',
          isActive: true,
          createdBy: 'admin',
        }],
      });
      const move = createTestMove();
      
      const result = canAssignWork(driver, move);
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('DRIVER_HAS_OVERRIDE_BLOCK');
    });

    it('should allow driver with inactive blocks', () => {
      const driver = createTestDriver({
        blocks: [{
          id: 'block-1',
          driverId: 'driver-001',
          blockType: 'SAFETY',
          reason: 'Expired block',
          startDate: '2024-01-01',
          endDate: '2024-02-01',
          isActive: false,
          createdBy: 'system',
        }],
      });
      const move = createTestMove();
      
      const result = canAssignWork(driver, move);
      
      expect(result.allowed).toBe(true);
    });
  });
});

// ============================================
// canOpenHiring TESTS
// ============================================

describe('canOpenHiring', () => {
  describe('Hiring Gate Status Checks', () => {
    it('should allow hiring when gate is OPEN', () => {
      const gate = createTestHiringGate({ hiringGateStatus: 'OPEN' });
      
      const result = canOpenHiring('market-001', gate);
      
      expect(result.allowed).toBe(true);
      expect(result.code).toBeNull();
    });

    it('should allow hiring when gate is LIMITED', () => {
      const gate = createTestHiringGate({ hiringGateStatus: 'LIMITED' });
      
      const result = canOpenHiring('market-001', gate);
      
      expect(result.allowed).toBe(true);
    });

    it('should reject when gate is FROZEN', () => {
      const gate = createTestHiringGate({ hiringGateStatus: 'FROZEN' });
      
      const result = canOpenHiring('market-001', gate);
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('MARKET_HIRING_FROZEN');
      expect(result.hiringGateStatus).toBe('FROZEN');
    });

    it('should reject when gate is CLOSED', () => {
      const gate = createTestHiringGate({ hiringGateStatus: 'CLOSED' });
      
      const result = canOpenHiring('market-001', gate);
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('MARKET_AT_CAPACITY');
    });
  });

  describe('Throttle Checks', () => {
    it('should reject when throttle is active', () => {
      const gate = createTestHiringGate({ 
        hiringGateStatus: 'OPEN',
        throttleActive: true,
        throttleReason: 'High loss ratio in market',
      });
      
      const result = canOpenHiring('market-001', gate);
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('MARKET_THROTTLE_ACTIVE');
      expect(result.throttleActive).toBe(true);
      expect(result.reasons[0]).toContain('High loss ratio');
    });
  });

  describe('Utilization Checks', () => {
    it('should reject when utilization exceeds 95%', () => {
      const gate = createTestHiringGate({ 
        hiringGateStatus: 'OPEN',
        utilizationRate: 0.96,
      });
      
      const result = canOpenHiring('market-001', gate);
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('UTILIZATION_TOO_HIGH');
      expect(result.reasons[0]).toContain('96.0%');
    });

    it('should allow when utilization is below 95%', () => {
      const gate = createTestHiringGate({ 
        hiringGateStatus: 'OPEN',
        utilizationRate: 0.85,
      });
      
      const result = canOpenHiring('market-001', gate);
      
      expect(result.allowed).toBe(true);
    });
  });
});

// ============================================
// canLockPayPeriod TESTS
// ============================================

describe('canLockPayPeriod', () => {
  describe('Status Checks', () => {
    it('should allow locking PROCESSING period', () => {
      const period = createTestPayPeriod({ status: 'PROCESSING' });
      
      const result = canLockPayPeriod(period);
      
      expect(result.allowed).toBe(true);
      expect(result.code).toBeNull();
    });

    it('should reject already LOCKED period', () => {
      const period = createTestPayPeriod({ status: 'LOCKED' });
      
      const result = canLockPayPeriod(period);
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('PAY_PERIOD_ALREADY_LOCKED');
    });

    it('should reject OPEN period', () => {
      const period = createTestPayPeriod({ status: 'OPEN' });
      
      const result = canLockPayPeriod(period);
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('PAY_PERIOD_NOT_PROCESSING');
      expect(result.requiredStatus).toBe('PROCESSING');
    });
  });

  describe('Precondition Checks', () => {
    it('should reject when moves not reconciled', () => {
      const period = createTestPayPeriod({ 
        status: 'PROCESSING',
        movesReconciled: false,
      });
      
      const result = canLockPayPeriod(period);
      
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('All moves must be reconciled before locking');
    });

    it('should reject when expenses not approved', () => {
      const period = createTestPayPeriod({ 
        status: 'PROCESSING',
        expensesApproved: false,
      });
      
      const result = canLockPayPeriod(period);
      
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('All expenses must be approved before locking');
    });

    it('should reject when both moves and expenses not ready', () => {
      const period = createTestPayPeriod({ 
        status: 'PROCESSING',
        movesReconciled: false,
        expensesApproved: false,
      });
      
      const result = canLockPayPeriod(period);
      
      expect(result.allowed).toBe(false);
      expect(result.reasons).toHaveLength(2);
    });
  });
});

// ============================================
// canExportPayroll TESTS
// ============================================

describe('canExportPayroll', () => {
  describe('Status Checks', () => {
    it('should allow export for LOCKED period', () => {
      const period = createTestPayPeriod({ 
        status: 'LOCKED',
        exportStatus: 'NOT_EXPORTED',
      });
      
      const result = canExportPayroll(period);
      
      expect(result.allowed).toBe(true);
      expect(result.code).toBeNull();
    });

    it('should reject export for non-LOCKED period', () => {
      const period = createTestPayPeriod({ status: 'PROCESSING' });
      
      const result = canExportPayroll(period);
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('PAY_PERIOD_NOT_LOCKED');
      expect(result.requiredStatus).toBe('LOCKED');
    });

    it('should reject export for OPEN period', () => {
      const period = createTestPayPeriod({ status: 'OPEN' });
      
      const result = canExportPayroll(period);
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('PAY_PERIOD_NOT_LOCKED');
    });
  });

  describe('Export Immutability Checks', () => {
    it('should reject re-export of already exported period', () => {
      const period = createTestPayPeriod({ 
        status: 'LOCKED',
        exportStatus: 'EXPORTED',
        exportedAt: new Date(),
      });
      
      const result = canExportPayroll(period);
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('PAY_PERIOD_ALREADY_EXPORTED');
      expect(result.reasons).toContain('Pay period has already been exported and is immutable');
    });
  });
});

// ============================================
// LOCK IMMUTABILITY TESTS
// ============================================

describe('isLockedPeriodImmutable', () => {
  it('should return true for LOCKED period', () => {
    const period = createTestPayPeriod({ status: 'LOCKED' });
    expect(isLockedPeriodImmutable(period)).toBe(true);
  });

  it('should return false for PROCESSING period', () => {
    const period = createTestPayPeriod({ status: 'PROCESSING' });
    expect(isLockedPeriodImmutable(period)).toBe(false);
  });

  it('should return false for OPEN period', () => {
    const period = createTestPayPeriod({ status: 'OPEN' });
    expect(isLockedPeriodImmutable(period)).toBe(false);
  });
});

describe('canModifyPayPeriodData', () => {
  it('should allow modification of PROCESSING period', () => {
    const period = createTestPayPeriod({ status: 'PROCESSING' });
    
    const result = canModifyPayPeriodData(period);
    
    expect(result.allowed).toBe(true);
  });

  it('should reject modification of LOCKED period', () => {
    const period = createTestPayPeriod({ status: 'LOCKED' });
    
    const result = canModifyPayPeriodData(period);
    
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('LOCKED_PERIOD_IMMUTABLE');
    expect(result.reasons).toContain('Locked pay periods are immutable and cannot be modified');
  });
});

// ============================================
// HTTP RESPONSE BUILDER TESTS
// ============================================

describe('Error Response Builders', () => {
  describe('buildWorkAssignmentError', () => {
    it('should build 409 response with structured body', () => {
      const result = canAssignWork(
        createTestDriver({ safetyState: 'SUSPENDED' }),
        createTestMove()
      );
      
      const error = buildWorkAssignmentError(result);
      
      expect(error.statusCode).toBe(409);
      expect(error.body.allowed).toBe(false);
      expect(error.body.code).toBe('DRIVER_SUSPENDED');
      expect(error.body.driverId).toBe('driver-001');
      expect(error.body.moveId).toBe('move-001');
    });
  });

  describe('buildHiringError', () => {
    it('should build 403 for FROZEN gate', () => {
      const result = canOpenHiring(
        'market-001',
        createTestHiringGate({ hiringGateStatus: 'FROZEN' })
      );
      
      const error = buildHiringError(result);
      
      expect(error.statusCode).toBe(403);
      expect(error.body.code).toBe('MARKET_HIRING_FROZEN');
    });

    it('should build 409 for other rejections', () => {
      const result = canOpenHiring(
        'market-001',
        createTestHiringGate({ throttleActive: true })
      );
      
      const error = buildHiringError(result);
      
      expect(error.statusCode).toBe(409);
      expect(error.body.code).toBe('MARKET_THROTTLE_ACTIVE');
    });
  });

  describe('buildPayrollError', () => {
    it('should build 409 response with currentStatus', () => {
      const result = canLockPayPeriod(
        createTestPayPeriod({ status: 'OPEN' })
      );
      
      const error = buildPayrollError(result);
      
      expect(error.statusCode).toBe(409);
      expect(error.body.allowed).toBe(false);
      expect(error.body.currentStatus).toBe('OPEN');
      expect(error.body.payPeriodId).toBe('period-001');
    });
  });
});

// ============================================
// INCREMENT 25B: SYSTEM OF RECORD ENFORCEMENT TESTS
// ============================================

import {
  evaluateMoveEligibility,
  canIncludeInRoster,
  filterRosterExport,
  filterMovesForPayrollExport,
  canOverridePayrollException,
  approvePayrollException,
  type MoveContext,
  type DriverRosterInfo,
  type MoveForPayroll,
} from './eligibility';

describe('INCREMENT 25B: System of Record Enforcement', () => {
  // ============================================
  // GATE 1: INGESTION - Move Eligibility Evaluation
  // ============================================
  
  describe('evaluateMoveEligibility (GATE 1: Ingestion)', () => {
    it('should return PASS for eligible driver', () => {
      const driver = createTestDriver();
      const moveContext: MoveContext = {
        moveNumber: 'MOVE-001',
        marketId: 'market-001',
        workType: 'ON_DEMAND',
        executionMode: 'COMPANY_VEHICLE',
      };
      
      const result = evaluateMoveEligibility(driver, moveContext);
      
      expect(result.eligibilityStatus).toBe('PASS');
      expect(result.eligibilityReasons).toEqual([]);
      expect(result.eligibilityPolicyVersionId).toBe('v25b.1');
      expect(result.eligibilityCheckedAt).toBeDefined();
    });
    
    it('should return PASS for null driver (unassigned move)', () => {
      const moveContext: MoveContext = {
        moveNumber: 'MOVE-001',
        marketId: 'market-001',
      };
      
      const result = evaluateMoveEligibility(null, moveContext);
      
      // v1: Unassigned moves have no driver to check, so PASS
      expect(result.eligibilityStatus).toBe('PASS');
      expect(result.eligibilityReasons).toEqual([]);
    });
    
    it('should return FAIL for suspended driver', () => {
      const driver = createTestDriver({ safetyState: 'SUSPENDED' });
      const moveContext: MoveContext = { moveNumber: 'MOVE-001', marketId: 'market-001' };
      
      const result = evaluateMoveEligibility(driver, moveContext);
      
      expect(result.eligibilityStatus).toBe('FAIL');
      expect(result.eligibilityReasons.length).toBeGreaterThan(0);
    });
    
    it('should return FAIL for disqualified driver', () => {
      const driver = createTestDriver({ safetyState: 'DISQUALIFIED' });
      const moveContext: MoveContext = { moveNumber: 'MOVE-001', marketId: 'market-001' };
      
      const result = evaluateMoveEligibility(driver, moveContext);
      
      expect(result.eligibilityStatus).toBe('FAIL');
    });
    
    it('should return FAIL for driver not eligible for work type', () => {
      // v1: work_type mismatch is a FAIL condition
      const driver = createTestDriver({ eligibleWorkTypes: ['SCHEDULED'] });
      const moveContext: MoveContext = { 
        moveNumber: 'MOVE-001', 
        marketId: 'market-001',
        workType: 'ON_DEMAND',
      };
      
      const result = evaluateMoveEligibility(driver, moveContext);
      
      expect(result.eligibilityStatus).toBe('FAIL');
      expect(result.eligibilityReasons.some(r => r.includes('work type'))).toBe(true);
    });
    
    it('should return FAIL for driver with empty eligibleWorkTypes when move specifies work_type', () => {
      // v1: strict check - empty eligibleWorkTypes means FAIL when move has work_type
      const driver = createTestDriver({ eligibleWorkTypes: [] });
      const moveContext: MoveContext = { 
        moveNumber: 'MOVE-001', 
        marketId: 'market-001',
        workType: 'ON_DEMAND',
      };
      
      const result = evaluateMoveEligibility(driver, moveContext);
      
      expect(result.eligibilityStatus).toBe('FAIL');
      expect(result.eligibilityReasons.some(r => r.includes('no eligible work types'))).toBe(true);
    });
    
    it('should return FAIL for driver not eligible for execution mode with capability flags', () => {
      // v1: execution_mode mismatch is FAIL only if capability flags exist (non-empty array)
      const driver = createTestDriver({ eligibleExecutionModes: ['COMPANY_VEHICLE'] });
      const moveContext: MoveContext = { 
        moveNumber: 'MOVE-001', 
        marketId: 'market-001',
        executionMode: 'DRIVER_VEHICLE',
      };
      
      const result = evaluateMoveEligibility(driver, moveContext);
      
      expect(result.eligibilityStatus).toBe('FAIL');
      expect(result.eligibilityReasons.some(r => r.includes('execution mode'))).toBe(true);
    });
    
    it('should return PASS for execution mode if no capability flags defined', () => {
      // v1: If driver has empty eligibleExecutionModes, execution mode check is skipped
      const driver = createTestDriver({ eligibleExecutionModes: [] });
      const moveContext: MoveContext = { 
        moveNumber: 'MOVE-001', 
        marketId: 'market-001',
        executionMode: 'DRIVER_VEHICLE',
      };
      
      const result = evaluateMoveEligibility(driver, moveContext);
      
      expect(result.eligibilityStatus).toBe('PASS');
    });
    
    it('should return FAIL for driver with active block (any type)', () => {
      // v1: any active block causes FAIL
      const driver = createTestDriver({
        blocks: [{
          id: 'block-001',
          driverId: 'driver-001',
          blockType: 'SAFETY',
          reason: 'Safety violation',
          startDate: new Date().toISOString(),
          isActive: true,
          createdBy: 'admin-001',
        }],
      });
      const moveContext: MoveContext = { moveNumber: 'MOVE-001', marketId: 'market-001' };
      
      const result = evaluateMoveEligibility(driver, moveContext);
      
      expect(result.eligibilityStatus).toBe('FAIL');
      expect(result.eligibilityReasons.some(r => r.includes('active block'))).toBe(true);
    });
    
    it('should return PASS when block is not active (endDate in past)', () => {
      // v1: inactive blocks (endDate < now) do not cause FAIL
      const driver = createTestDriver({
        blocks: [{
          id: 'block-001',
          driverId: 'driver-001',
          blockType: 'SAFETY',
          reason: 'Past violation',
          startDate: new Date(Date.now() - 86400000).toISOString(),
          endDate: new Date(Date.now() - 3600000).toISOString(), // ended 1 hour ago
          isActive: true, // isActive flag may be stale, but endDate overrides
          createdBy: 'admin-001',
        }],
      });
      const moveContext: MoveContext = { moveNumber: 'MOVE-001', marketId: 'market-001' };
      
      const result = evaluateMoveEligibility(driver, moveContext);
      
      expect(result.eligibilityStatus).toBe('PASS');
    });
    
    it('should return FAIL when block has no endDate (permanent)', () => {
      // v1: blocks with null expires_at are active
      const driver = createTestDriver({
        blocks: [{
          id: 'block-001',
          driverId: 'driver-001',
          blockType: 'COMPLIANCE',
          reason: 'Permanent block',
          startDate: new Date().toISOString(),
          endDate: undefined, // no end date = permanent/active
          isActive: true,
          createdBy: 'admin-001',
        }],
      });
      const moveContext: MoveContext = { moveNumber: 'MOVE-001', marketId: 'market-001' };
      
      const result = evaluateMoveEligibility(driver, moveContext);
      
      expect(result.eligibilityStatus).toBe('FAIL');
    });
    
    it('should return FAIL when block has future endDate', () => {
      // v1: blocks with endDate > now are active
      const driver = createTestDriver({
        blocks: [{
          id: 'block-001',
          driverId: 'driver-001',
          blockType: 'MANUAL',
          reason: 'Temporary block',
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 86400000).toISOString(), // expires tomorrow
          isActive: true,
          createdBy: 'admin-001',
        }],
      });
      const moveContext: MoveContext = { moveNumber: 'MOVE-001', marketId: 'market-001' };
      
      const result = evaluateMoveEligibility(driver, moveContext);
      
      expect(result.eligibilityStatus).toBe('FAIL');
    });
    
    it('should return FAIL when isActive is false but endDate is in future (ignore stale flag)', () => {
      // v1: strict endDate evaluation - ignore isActive flag to avoid stale data
      const driver = createTestDriver({
        blocks: [{
          id: 'block-001',
          driverId: 'driver-001',
          blockType: 'COMPLIANCE',
          reason: 'Stale flag test',
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 86400000).toISOString(), // expires tomorrow
          isActive: false, // stale flag says inactive, but endDate says active
          createdBy: 'admin-001',
        }],
      });
      const moveContext: MoveContext = { moveNumber: 'MOVE-001', marketId: 'market-001' };
      
      const result = evaluateMoveEligibility(driver, moveContext);
      
      // v1: endDate > now means block is active regardless of isActive flag
      expect(result.eligibilityStatus).toBe('FAIL');
    });
    
    it('should return FAIL when isActive is false but no endDate (permanent block)', () => {
      // v1: no endDate = permanent block, active regardless of isActive flag
      const driver = createTestDriver({
        blocks: [{
          id: 'block-001',
          driverId: 'driver-001',
          blockType: 'OVERRIDE',
          reason: 'Permanent block stale flag test',
          startDate: new Date().toISOString(),
          endDate: undefined, // no end date = permanent
          isActive: false, // stale flag says inactive
          createdBy: 'admin-001',
        }],
      });
      const moveContext: MoveContext = { moveNumber: 'MOVE-001', marketId: 'market-001' };
      
      const result = evaluateMoveEligibility(driver, moveContext);
      
      // v1: no endDate means permanent block, active regardless of isActive flag
      expect(result.eligibilityStatus).toBe('FAIL');
    });
    
    it('should accumulate multiple FAIL reasons', () => {
      // v1: All conditions checked, multiple reasons accumulated
      const driver = createTestDriver({
        safetyState: 'SUSPENDED',
        eligibleWorkTypes: ['SCHEDULED'],
        blocks: [{
          id: 'block-001',
          driverId: 'driver-001',
          blockType: 'COMPLIANCE',
          reason: 'Document expired',
          startDate: new Date().toISOString(),
          isActive: true,
          createdBy: 'admin-001',
        }],
      });
      const moveContext: MoveContext = { 
        moveNumber: 'MOVE-001', 
        marketId: 'market-001',
        workType: 'ON_DEMAND',
      };
      
      const result = evaluateMoveEligibility(driver, moveContext);
      
      expect(result.eligibilityStatus).toBe('FAIL');
      expect(result.eligibilityReasons.length).toBeGreaterThanOrEqual(3);
    });
  });
  
  // ============================================
  // GATE 2: ROSTER EXPORT - Driver Filtering
  // ============================================
  
  describe('canIncludeInRoster (GATE 2: Roster Export)', () => {
    it('should include driver with all ACTIVE states', () => {
      const driver: DriverRosterInfo = {
        driverId: 'driver-001',
        safetyState: 'ACTIVE',
        eligibilityState: 'ACTIVE',
        hasActiveBlock: false,
        marketHiringGateStatus: 'OPEN',
      };
      
      const result = canIncludeInRoster(driver);
      
      expect(result.excluded).toBe(false);
      expect(result.reasons).toEqual([]);
    });
    
    it('should exclude driver with non-ACTIVE safety state', () => {
      const driver: DriverRosterInfo = {
        driverId: 'driver-001',
        safetyState: 'SUSPENDED',
        eligibilityState: 'ACTIVE',
        hasActiveBlock: false,
      };
      
      const result = canIncludeInRoster(driver);
      
      expect(result.excluded).toBe(true);
      expect(result.reasons.some(r => r.includes('Safety state'))).toBe(true);
    });
    
    it('should exclude driver with active block', () => {
      const driver: DriverRosterInfo = {
        driverId: 'driver-001',
        safetyState: 'ACTIVE',
        hasActiveBlock: true,
      };
      
      const result = canIncludeInRoster(driver);
      
      expect(result.excluded).toBe(true);
      expect(result.reasons).toContain('Driver has an active block');
    });
    
    it('should exclude driver with non-OPEN hiring gate', () => {
      const driver: DriverRosterInfo = {
        driverId: 'driver-001',
        safetyState: 'ACTIVE',
        hasActiveBlock: false,
        marketHiringGateStatus: 'FROZEN',
      };
      
      const result = canIncludeInRoster(driver);
      
      expect(result.excluded).toBe(true);
      expect(result.reasons.some(r => r.includes('hiring gate'))).toBe(true);
    });
  });
  
  describe('filterRosterExport', () => {
    it('should separate included and excluded drivers', () => {
      const drivers: DriverRosterInfo[] = [
        { driverId: '1', safetyState: 'ACTIVE', hasActiveBlock: false },
        { driverId: '2', safetyState: 'SUSPENDED', hasActiveBlock: false },
        { driverId: '3', safetyState: 'ACTIVE', hasActiveBlock: true },
      ];
      
      const result = filterRosterExport(drivers);
      
      expect(result.included.length).toBe(1);
      expect(result.excluded.length).toBe(2);
      expect(result.included[0].driverId).toBe('1');
    });
  });
  
  // ============================================
  // GATE 3: PAYROLL EXPORT - Move Filtering & Exceptions
  // ============================================
  
  describe('filterMovesForPayrollExport (GATE 3: Payroll Export)', () => {
    it('should reject non-LOCKED pay period', () => {
      const payPeriod = createTestPayPeriod({ status: 'PROCESSING' });
      const moves: MoveForPayroll[] = [];
      
      const result = filterMovesForPayrollExport(payPeriod, moves);
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('PAY_PERIOD_NOT_LOCKED');
    });
    
    it('should include PASS moves in export', () => {
      const payPeriod = createTestPayPeriod({ status: 'LOCKED' });
      const moves: MoveForPayroll[] = [
        { tripId: 't1', moveNumber: 'M001', driverId: 'd1', eligibilityStatus: 'PASS', eligibilityReasons: [] },
        { tripId: 't2', moveNumber: 'M002', driverId: 'd2', eligibilityStatus: 'PASS', eligibilityReasons: [] },
      ];
      
      const result = filterMovesForPayrollExport(payPeriod, moves);
      
      expect(result.allowed).toBe(true);
      expect(result.includedMoves.length).toBe(2);
      expect(result.exceptions.length).toBe(0);
    });
    
    it('should exclude FAIL moves and create exceptions', () => {
      const payPeriod = createTestPayPeriod({ status: 'LOCKED' });
      const moves: MoveForPayroll[] = [
        { tripId: 't1', moveNumber: 'M001', driverId: 'd1', eligibilityStatus: 'PASS', eligibilityReasons: [] },
        { tripId: 't2', moveNumber: 'M002', driverId: 'd2', eligibilityStatus: 'FAIL', eligibilityReasons: ['Driver suspended'] },
      ];
      
      const result = filterMovesForPayrollExport(payPeriod, moves);
      
      expect(result.allowed).toBe(true);
      expect(result.includedMoves.length).toBe(1);
      expect(result.exceptions.length).toBe(1);
      expect(result.exceptions[0].exceptionType).toBe('ELIGIBILITY_FAIL');
      expect(result.exceptions[0].moveNumber).toBe('M002');
    });
    
    it('should exclude WARN moves and create exceptions', () => {
      const payPeriod = createTestPayPeriod({ status: 'LOCKED' });
      const moves: MoveForPayroll[] = [
        { tripId: 't1', moveNumber: 'M001', driverId: 'd1', eligibilityStatus: 'WARN', eligibilityReasons: ['Market mismatch'] },
      ];
      
      const result = filterMovesForPayrollExport(payPeriod, moves);
      
      expect(result.exceptions.length).toBe(1);
      expect(result.exceptions[0].exceptionType).toBe('ELIGIBILITY_WARN');
    });
    
    it('should include moves with null eligibility (pre-25B backward compatibility)', () => {
      const payPeriod = createTestPayPeriod({ status: 'LOCKED' });
      const moves: MoveForPayroll[] = [
        { tripId: 't1', moveNumber: 'M001', driverId: 'd1', eligibilityStatus: null, eligibilityReasons: null },
      ];
      
      const result = filterMovesForPayrollExport(payPeriod, moves);
      
      expect(result.includedMoves.length).toBe(1);
      expect(result.exceptions.length).toBe(0);
    });
  });
  
  // ============================================
  // PAYROLL EXCEPTION OVERRIDE AUTHORIZATION
  // ============================================
  
  describe('canOverridePayrollException', () => {
    it('should allow Will Walton to override', () => {
      expect(canOverridePayrollException('will.walton@driverhub360.com')).toBe(true);
    });
    
    it('should allow David Forman to override', () => {
      expect(canOverridePayrollException('david.forman@driverhub360.com')).toBe(true);
    });
    
    it('should reject other users', () => {
      expect(canOverridePayrollException('other.user@driverhub360.com')).toBe(false);
    });
    
    it('should be case insensitive', () => {
      expect(canOverridePayrollException('WILL.WALTON@DRIVERHUB360.COM')).toBe(true);
    });
  });
  
  describe('approvePayrollException', () => {
    it('should approve for authorized user with valid reason', () => {
      const result = approvePayrollException(
        'trip-001',
        'will.walton@driverhub360.com',
        'This move was manually verified and approved for payment.'
      );
      
      expect(result.allowed).toBe(true);
      expect(result.code).toBeNull();
      expect(result.approvedBy).toBe('will.walton@driverhub360.com');
    });
    
    it('should reject for unauthorized user', () => {
      const result = approvePayrollException(
        'trip-001',
        'other.user@driverhub360.com',
        'This move was manually verified.'
      );
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED_OVERRIDE');
    });
    
    it('should reject for short reason', () => {
      const result = approvePayrollException(
        'trip-001',
        'will.walton@driverhub360.com',
        'OK'
      );
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('REASON_REQUIRED');
    });
    
    it('should reject for empty reason', () => {
      const result = approvePayrollException(
        'trip-001',
        'david.forman@driverhub360.com',
        ''
      );
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('REASON_REQUIRED');
    });
  });
});
