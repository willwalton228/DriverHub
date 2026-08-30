/**
 * Unit Tests for Safety Enforcement & Automatic Consequences Engine (INCREMENT 8)
 */

import { describe, it, expect } from 'vitest';
import {
  getWindowStartDate,
  filterEventsInWindow,
  countAtFaultClaimsInWindow,
  calculateClaimCounts,
  determineTriggeredThreshold,
  determineSafetyState,
  getSafetyStateMultiplier,
  isTierFrozen,
  evaluateDriverSafetyStatus,
  isDriverEligible,
  checkDriverEligibility,
  applySafetyMultiplier,
  calculateSafetyAdjustedPay,
  createSafetyAuditEntry,
  auditEligibilityCheck,
  auditStateChange,
  auditClaimRecorded,
  auditAutomaticEvaluation,
  calculateNextStateRequirements,
  CLAIM_WINDOWS,
  PENALTY_THRESHOLDS,
  SEVERITY_POINTS,
  type SafetyEvent,
  type DriverSafetyState,
} from './safetyEnforcementEngine';

// ============================================
// TEST DATA
// ============================================

const createEvent = (
  id: string,
  driverId: string,
  eventDate: string,
  atFault: boolean = true,
  severity: 'MINOR' | 'MODERATE' | 'MAJOR' | 'SEVERE' = 'MODERATE'
): SafetyEvent => ({
  id,
  driverId,
  eventType: atFault ? 'AT_FAULT_CLAIM' : 'NOT_AT_FAULT_CLAIM',
  severity,
  eventDate,
  description: `Test event ${id}`,
  atFault,
  claimAmountCents: 50000,
  recordedAt: new Date().toISOString(),
  recordedBy: 'SYSTEM',
});

// ============================================
// 1. ROLLING WINDOW CALCULATIONS
// ============================================

describe('getWindowStartDate', () => {
  it('should calculate 30-day window start', () => {
    expect(getWindowStartDate('2026-01-30', 30)).toBe('2025-12-31');
  });

  it('should calculate 60-day window start', () => {
    expect(getWindowStartDate('2026-03-01', 60)).toBe('2025-12-31');
  });

  it('should calculate 90-day window start', () => {
    expect(getWindowStartDate('2026-04-01', 90)).toBe('2026-01-01');
  });
});

describe('filterEventsInWindow', () => {
  const driverId = 'driver-1';
  const events: SafetyEvent[] = [
    createEvent('e1', driverId, '2026-01-01'),
    createEvent('e2', driverId, '2026-01-15'),
    createEvent('e3', driverId, '2026-01-20'),
    createEvent('e4', driverId, '2026-02-01'),
  ];

  it('should filter events within 30-day window', () => {
    const filtered = filterEventsInWindow(events, '2026-02-01', 30);
    expect(filtered).toHaveLength(3);
    expect(filtered.map(e => e.id)).toContain('e2');
    expect(filtered.map(e => e.id)).toContain('e3');
    expect(filtered.map(e => e.id)).toContain('e4');
  });

  it('should filter events within 60-day window', () => {
    const filtered = filterEventsInWindow(events, '2026-02-01', 60);
    expect(filtered).toHaveLength(4);
  });

  it('should return empty array when no events in window', () => {
    const filtered = filterEventsInWindow(events, '2025-01-01', 30);
    expect(filtered).toHaveLength(0);
  });
});

describe('countAtFaultClaimsInWindow', () => {
  const driverId = 'driver-1';
  
  it('should count only at-fault claims', () => {
    const events: SafetyEvent[] = [
      createEvent('e1', driverId, '2026-01-15', true),
      createEvent('e2', driverId, '2026-01-20', false),
      createEvent('e3', driverId, '2026-01-25', true),
    ];
    
    const count = countAtFaultClaimsInWindow(events, '2026-01-30', 30);
    expect(count).toBe(2);
  });

  it('should return 0 when no at-fault claims', () => {
    const events: SafetyEvent[] = [
      createEvent('e1', driverId, '2026-01-15', false),
      createEvent('e2', driverId, '2026-01-20', false),
    ];
    
    const count = countAtFaultClaimsInWindow(events, '2026-01-30', 30);
    expect(count).toBe(0);
  });
});

describe('calculateClaimCounts', () => {
  const driverId = 'driver-1';
  
  it('should calculate counts for all windows', () => {
    const events: SafetyEvent[] = [
      createEvent('e1', driverId, '2026-01-01', true), // 90-day only
      createEvent('e2', driverId, '2026-02-01', true), // 60 and 90-day
      createEvent('e3', driverId, '2026-03-01', true), // all windows
      createEvent('e4', driverId, '2026-03-15', true), // all windows
    ];
    
    const counts = calculateClaimCounts(events, '2026-03-20');
    expect(counts.window30Day).toBe(2);
    expect(counts.window60Day).toBe(3);
    expect(counts.window90Day).toBe(4);
  });
});

// ============================================
// 2. PENALTY RULES ENGINE
// ============================================

describe('determineTriggeredThreshold', () => {
  it('should return null for clean record', () => {
    const counts = { window30Day: 0, window60Day: 0, window90Day: 0 };
    expect(determineTriggeredThreshold(counts)).toBeNull();
  });

  it('should trigger RESTRICTED for 1 claim in 30 days', () => {
    const counts = { window30Day: 1, window60Day: 1, window90Day: 1 };
    const threshold = determineTriggeredThreshold(counts);
    expect(threshold?.resultingState).toBe('RESTRICTED');
  });

  it('should trigger SUSPENDED for 2 claims in 30 days', () => {
    const counts = { window30Day: 2, window60Day: 2, window90Day: 2 };
    const threshold = determineTriggeredThreshold(counts);
    expect(threshold?.resultingState).toBe('SUSPENDED');
  });

  it('should trigger DISQUALIFIED for 5+ claims in 90 days', () => {
    const counts = { window30Day: 0, window60Day: 0, window90Day: 5 };
    const threshold = determineTriggeredThreshold(counts);
    expect(threshold?.resultingState).toBe('DISQUALIFIED');
  });

  it('should return most severe threshold when multiple apply', () => {
    const counts = { window30Day: 2, window60Day: 3, window90Day: 5 };
    const threshold = determineTriggeredThreshold(counts);
    expect(threshold?.resultingState).toBe('DISQUALIFIED');
  });
});

describe('determineSafetyState', () => {
  it('should return ACTIVE for clean record', () => {
    expect(determineSafetyState({ window30Day: 0, window60Day: 0, window90Day: 0 })).toBe('ACTIVE');
  });

  it('should return RESTRICTED for 1 claim in 30 days', () => {
    expect(determineSafetyState({ window30Day: 1, window60Day: 1, window90Day: 1 })).toBe('RESTRICTED');
  });

  it('should return SUSPENDED for 2 claims in 30 days', () => {
    expect(determineSafetyState({ window30Day: 2, window60Day: 2, window90Day: 2 })).toBe('SUSPENDED');
  });

  it('should return DISQUALIFIED for 5+ claims in 90 days', () => {
    expect(determineSafetyState({ window30Day: 0, window60Day: 0, window90Day: 5 })).toBe('DISQUALIFIED');
  });
});

describe('getSafetyStateMultiplier', () => {
  it('should return 1.00 for ACTIVE', () => {
    expect(getSafetyStateMultiplier('ACTIVE')).toBe(1.00);
  });

  it('should return 0.85 for RESTRICTED', () => {
    expect(getSafetyStateMultiplier('RESTRICTED')).toBe(0.85);
  });

  it('should return 0.00 for SUSPENDED', () => {
    expect(getSafetyStateMultiplier('SUSPENDED')).toBe(0.00);
  });

  it('should return 0.00 for DISQUALIFIED', () => {
    expect(getSafetyStateMultiplier('DISQUALIFIED')).toBe(0.00);
  });
});

describe('isTierFrozen', () => {
  it('should return false for ACTIVE', () => {
    expect(isTierFrozen('ACTIVE')).toBe(false);
  });

  it('should return true for RESTRICTED', () => {
    expect(isTierFrozen('RESTRICTED')).toBe(true);
  });

  it('should return true for SUSPENDED', () => {
    expect(isTierFrozen('SUSPENDED')).toBe(true);
  });

  it('should return true for DISQUALIFIED', () => {
    expect(isTierFrozen('DISQUALIFIED')).toBe(true);
  });
});

// ============================================
// 3. DRIVER SAFETY STATUS EVALUATION
// ============================================

describe('evaluateDriverSafetyStatus', () => {
  const driverId = 'driver-1';

  it('should return ACTIVE status for clean record', () => {
    const status = evaluateDriverSafetyStatus(driverId, [], '2026-01-30');
    
    expect(status.currentState).toBe('ACTIVE');
    expect(status.safetyMultiplier).toBe(1.00);
    expect(status.tierFrozen).toBe(false);
    expect(status.isEligible).toBe(true);
    expect(status.claimCounts.window30Day).toBe(0);
  });

  it('should return RESTRICTED status for 1 at-fault claim in 30 days', () => {
    const events = [createEvent('e1', driverId, '2026-01-20', true)];
    const status = evaluateDriverSafetyStatus(driverId, events, '2026-01-30');
    
    expect(status.currentState).toBe('RESTRICTED');
    expect(status.safetyMultiplier).toBe(0.90);
    expect(status.tierFrozen).toBe(true);
    expect(status.isEligible).toBe(true);
  });

  it('should return SUSPENDED status for 2 at-fault claims in 30 days', () => {
    const events = [
      createEvent('e1', driverId, '2026-01-15', true),
      createEvent('e2', driverId, '2026-01-20', true),
    ];
    const status = evaluateDriverSafetyStatus(driverId, events, '2026-01-30');
    
    expect(status.currentState).toBe('SUSPENDED');
    expect(status.safetyMultiplier).toBe(0.00);
    expect(status.isEligible).toBe(false);
  });

  it('should return DISQUALIFIED status for 5+ at-fault claims in 90 days', () => {
    const events = [
      createEvent('e1', driverId, '2026-01-05', true),
      createEvent('e2', driverId, '2026-01-15', true),
      createEvent('e3', driverId, '2026-01-25', true),
      createEvent('e4', driverId, '2026-02-05', true),
      createEvent('e5', driverId, '2026-02-15', true),
    ];
    const status = evaluateDriverSafetyStatus(driverId, events, '2026-03-01');
    
    expect(status.currentState).toBe('DISQUALIFIED');
    expect(status.isEligible).toBe(false);
  });

  it('should include evaluatedAt timestamp', () => {
    const status = evaluateDriverSafetyStatus(driverId, [], '2026-01-30');
    expect(status.evaluatedAt).toBeDefined();
    expect(new Date(status.evaluatedAt).getTime()).not.toBeNaN();
  });
});

// ============================================
// 4. ELIGIBILITY GATE
// ============================================

describe('isDriverEligible', () => {
  const driverId = 'driver-1';

  it('should return true for clean record', () => {
    expect(isDriverEligible(driverId, '2026-01-30', [])).toBe(true);
  });

  it('should return true for RESTRICTED driver', () => {
    const events = [createEvent('e1', driverId, '2026-01-20', true)];
    expect(isDriverEligible(driverId, '2026-01-30', events)).toBe(true);
  });

  it('should return false for SUSPENDED driver', () => {
    const events = [
      createEvent('e1', driverId, '2026-01-15', true),
      createEvent('e2', driverId, '2026-01-20', true),
    ];
    expect(isDriverEligible(driverId, '2026-01-30', events)).toBe(false);
  });

  it('should return false for DISQUALIFIED driver', () => {
    const events = Array.from({ length: 5 }, (_, i) => 
      createEvent(`e${i}`, driverId, `2026-01-${(i + 1).toString().padStart(2, '0')}`, true)
    );
    expect(isDriverEligible(driverId, '2026-03-01', events)).toBe(false);
  });
});

describe('checkDriverEligibility', () => {
  const driverId = 'driver-1';

  it('should return detailed eligibility with reason', () => {
    const result = checkDriverEligibility(driverId, '2026-01-30', []);
    
    expect(result.eligible).toBe(true);
    expect(result.state).toBe('ACTIVE');
    expect(result.reason).toContain('good standing');
  });

  it('should explain SUSPENDED ineligibility', () => {
    const events = [
      createEvent('e1', driverId, '2026-01-15', true),
      createEvent('e2', driverId, '2026-01-20', true),
    ];
    const result = checkDriverEligibility(driverId, '2026-01-30', events);
    
    expect(result.eligible).toBe(false);
    expect(result.state).toBe('SUSPENDED');
    expect(result.reason).toContain('suspended');
  });
});

// ============================================
// 5. SAFETY MULTIPLIER APPLICATION
// ============================================

describe('applySafetyMultiplier', () => {
  it('should apply 1.00 multiplier correctly', () => {
    expect(applySafetyMultiplier(10000, 1.00)).toBe(10000);
  });

  it('should apply 0.85 multiplier correctly', () => {
    expect(applySafetyMultiplier(10000, 0.85)).toBe(8500);
  });

  it('should apply 0.90 multiplier correctly', () => {
    expect(applySafetyMultiplier(10000, 0.90)).toBe(9000);
  });

  it('should apply 0.00 multiplier correctly', () => {
    expect(applySafetyMultiplier(10000, 0.00)).toBe(0);
  });

  it('should round to nearest cent', () => {
    expect(applySafetyMultiplier(10001, 0.85)).toBe(8501);
  });
});

describe('calculateSafetyAdjustedPay', () => {
  const driverId = 'driver-1';

  it('should return full pay for ACTIVE driver', () => {
    const result = calculateSafetyAdjustedPay(driverId, '2026-01-30', [], 10000);
    
    expect(result.adjustedPayCents).toBe(10000);
    expect(result.multiplierApplied).toBe(1.00);
    expect(result.state).toBe('ACTIVE');
  });

  it('should apply 90% for RESTRICTED driver', () => {
    const events = [createEvent('e1', driverId, '2026-01-20', true)];
    const result = calculateSafetyAdjustedPay(driverId, '2026-01-30', events, 10000);
    
    expect(result.adjustedPayCents).toBe(9000);
    expect(result.multiplierApplied).toBe(0.90);
    expect(result.state).toBe('RESTRICTED');
  });

  it('should apply 0% for SUSPENDED driver', () => {
    const events = [
      createEvent('e1', driverId, '2026-01-15', true),
      createEvent('e2', driverId, '2026-01-20', true),
    ];
    const result = calculateSafetyAdjustedPay(driverId, '2026-01-30', events, 10000);
    
    expect(result.adjustedPayCents).toBe(0);
    expect(result.multiplierApplied).toBe(0.00);
    expect(result.state).toBe('SUSPENDED');
  });
});

// ============================================
// 6. AUDIT TRAIL
// ============================================

describe('createSafetyAuditEntry', () => {
  it('should create audit entry with required fields', () => {
    const entry = createSafetyAuditEntry(
      'driver-1',
      'STATE_CHANGE',
      'ACTIVE',
      'RESTRICTED',
      { reason: 'test' }
    );
    
    expect(entry.id).toBeDefined();
    expect(entry.driverId).toBe('driver-1');
    expect(entry.action).toBe('STATE_CHANGE');
    expect(entry.previousState).toBe('ACTIVE');
    expect(entry.newState).toBe('RESTRICTED');
    expect(entry.triggeredBy).toBe('SYSTEM');
    expect(entry.createdAt).toBeDefined();
  });

  it('should generate unique IDs', () => {
    const entry1 = createSafetyAuditEntry('driver-1', 'ELIGIBILITY_CHECK', null, null, {});
    const entry2 = createSafetyAuditEntry('driver-1', 'ELIGIBILITY_CHECK', null, null, {});
    
    expect(entry1.id).not.toBe(entry2.id);
  });
});

describe('auditEligibilityCheck', () => {
  it('should create eligibility check audit', () => {
    const entry = auditEligibilityCheck('driver-1', '2026-01-30', true, 'ACTIVE', 'Good standing');
    
    expect(entry.action).toBe('ELIGIBILITY_CHECK');
    expect(entry.details.eligible).toBe(true);
    expect(entry.details.state).toBe('ACTIVE');
  });
});

describe('auditStateChange', () => {
  it('should create state change audit', () => {
    const entry = auditStateChange(
      'driver-1',
      'ACTIVE',
      'RESTRICTED',
      { window30Day: 1, window60Day: 1, window90Day: 1 },
      null
    );
    
    expect(entry.action).toBe('STATE_CHANGE');
    expect(entry.previousState).toBe('ACTIVE');
    expect(entry.newState).toBe('RESTRICTED');
    expect(entry.details.claimCounts.window30Day).toBe(1);
  });
});

describe('auditClaimRecorded', () => {
  it('should create claim recorded audit', () => {
    const event = createEvent('e1', 'driver-1', '2026-01-20', true);
    const entry = auditClaimRecorded('driver-1', event);
    
    expect(entry.action).toBe('CLAIM_RECORDED');
    expect(entry.details.eventId).toBe('e1');
    expect(entry.details.atFault).toBe(true);
  });
});

describe('auditAutomaticEvaluation', () => {
  it('should create automatic evaluation audit', () => {
    const status = evaluateDriverSafetyStatus('driver-1', [], '2026-01-30');
    const entry = auditAutomaticEvaluation('driver-1', status);
    
    expect(entry.action).toBe('AUTOMATIC_EVALUATION');
    expect(entry.newState).toBe('ACTIVE');
    expect(entry.details.isEligible).toBe(true);
  });
});

// ============================================
// 7. NEXT STATE REQUIREMENTS
// ============================================

describe('calculateNextStateRequirements', () => {
  const driverId = 'driver-1';

  it('should show no action required for ACTIVE driver', () => {
    const result = calculateNextStateRequirements(driverId, [], '2026-01-30');
    
    expect(result.currentState).toBe('ACTIVE');
    expect(result.targetState).toBeNull();
    expect(result.canProgress).toBe(true);
    expect(result.requirements[0]).toContain('good standing');
  });

  it('should show no progression possible for DISQUALIFIED driver', () => {
    const events = Array.from({ length: 5 }, (_, i) => 
      createEvent(`e${i}`, driverId, `2026-01-${(i + 1).toString().padStart(2, '0')}`, true)
    );
    const result = calculateNextStateRequirements(driverId, events, '2026-03-01');
    
    expect(result.currentState).toBe('DISQUALIFIED');
    expect(result.canProgress).toBe(false);
    expect(result.requirements[0]).toContain('permanently disqualified');
  });

  it('should calculate days until claim expires for RESTRICTED driver', () => {
    const events = [createEvent('e1', driverId, '2026-01-20', true)];
    const result = calculateNextStateRequirements(driverId, events, '2026-01-30');
    
    expect(result.currentState).toBe('RESTRICTED');
    expect(result.targetState).toBe('ACTIVE');
    expect(result.daysUntilOldestClaimExpires).toBe(80); // 90 - 10 days elapsed
    expect(result.requirements.length).toBeGreaterThan(0);
  });
});

// ============================================
// 8. CONSTANTS VALIDATION
// ============================================

describe('CLAIM_WINDOWS', () => {
  it('should have 3 standard windows', () => {
    expect(CLAIM_WINDOWS).toHaveLength(3);
    expect(CLAIM_WINDOWS.map(w => w.windowDays)).toEqual([30, 60, 90]);
  });
});

describe('PENALTY_THRESHOLDS', () => {
  it('should have thresholds for all windows', () => {
    const windows = new Set(PENALTY_THRESHOLDS.map(t => t.windowDays));
    expect(windows.has(30)).toBe(true);
    expect(windows.has(60)).toBe(true);
    expect(windows.has(90)).toBe(true);
  });

  it('should include DISQUALIFIED threshold', () => {
    const disqualified = PENALTY_THRESHOLDS.find(t => t.resultingState === 'DISQUALIFIED');
    expect(disqualified).toBeDefined();
    expect(disqualified?.atFaultClaimCount).toBe(5);
  });
});

describe('SEVERITY_POINTS', () => {
  it('should have correct point values', () => {
    expect(SEVERITY_POINTS.MINOR).toBe(1);
    expect(SEVERITY_POINTS.MODERATE).toBe(2);
    expect(SEVERITY_POINTS.MAJOR).toBe(3);
    expect(SEVERITY_POINTS.SEVERE).toBe(5);
  });
});
