/**
 * Unit Tests for Driver Transparency & Auditability Engine (INCREMENT 6)
 */

import { describe, it, expect } from 'vitest';
import {
  findVolumeTier,
  findSafetyTier,
  calculateClampedMultiplier,
  buildPayMetricInputs,
  buildPolicyProvenance,
  describeMatchPath,
  formatCents,
  formatHours,
  buildPayLineBreakdown,
  buildPayPeriodSummary,
  buildDriverPayBreakdown,
  generatePayExplanationPacket,
  checkReadOnlyAccess,
  enforceReadOnly,
  getAvailableActions,
  VOLUME_MULTIPLIER_TIERS,
  SAFETY_MULTIPLIER_TIERS,
  type PayMetricInputs,
  type PolicyProvenance,
} from './transparencyEngine';
import type { PayLineRecord, PayPeriodRecord } from './payPeriodProcessor';
import { PayPeriodLockedError } from './payPeriodProcessor';

// ============================================
// TEST DATA
// ============================================

const mockPayPeriod: PayPeriodRecord = {
  id: 'pp-001',
  payGroup: 'weekly',
  periodStart: '2026-01-20',
  periodEnd: '2026-01-26',
  status: 'LOCKED',
  lockedAt: new Date('2026-01-27T00:00:00Z'),
};

const mockOpenPayPeriod: PayPeriodRecord = {
  ...mockPayPeriod,
  id: 'pp-002',
  status: 'OPEN',
  lockedAt: null,
};

const mockPayLine: PayLineRecord = {
  id: 'pl-001',
  payPeriodId: 'pp-001',
  driverId: 'driver-1',
  workerType: 'W2_DRIVER',
  paidMinutes: 480,
  baseRateCents: 2500,
  basePayCents: 20000,
  volumeMultiplier: '1.05',
  safetyMultiplier: '1.00',
  effectiveMultiplier: '1.0500',
  adjustedPayCents: 21000,
  finalPayCents: 21000,
  floorApplied: false,
  capApplied: false,
};

// ============================================
// 1. MULTIPLIER TIER TESTS
// ============================================

describe('findVolumeTier', () => {
  it('should return Very Low tier for 0-4 volume', () => {
    expect(findVolumeTier(0).tierName).toBe('Very Low');
    expect(findVolumeTier(4).tierName).toBe('Very Low');
  });

  it('should return Low tier for 5-9 volume', () => {
    expect(findVolumeTier(5).tierName).toBe('Low');
    expect(findVolumeTier(9).tierName).toBe('Low');
  });

  it('should return Standard tier for 10-19 volume', () => {
    expect(findVolumeTier(10).tierName).toBe('Standard');
    expect(findVolumeTier(15).tierName).toBe('Standard');
    expect(findVolumeTier(19).tierName).toBe('Standard');
  });

  it('should return High tier for 20-29 volume', () => {
    expect(findVolumeTier(20).tierName).toBe('High');
    expect(findVolumeTier(29).tierName).toBe('High');
  });

  it('should return Very High tier for 30+ volume', () => {
    expect(findVolumeTier(30).tierName).toBe('Very High');
    expect(findVolumeTier(100).tierName).toBe('Very High');
  });

  it('should return correct multipliers', () => {
    expect(findVolumeTier(3).multiplier).toBe('0.90');
    expect(findVolumeTier(15).multiplier).toBe('1.00');
    expect(findVolumeTier(25).multiplier).toBe('1.05');
  });
});

describe('findSafetyTier', () => {
  it('should return Critical tier for 0-69 score', () => {
    expect(findSafetyTier(0).tierName).toBe('Critical');
    expect(findSafetyTier(69).tierName).toBe('Critical');
  });

  it('should return Needs Improvement tier for 70-79 score', () => {
    expect(findSafetyTier(70).tierName).toBe('Needs Improvement');
    expect(findSafetyTier(79).tierName).toBe('Needs Improvement');
  });

  it('should return Standard tier for 80-89 score', () => {
    expect(findSafetyTier(80).tierName).toBe('Standard');
    expect(findSafetyTier(89).tierName).toBe('Standard');
  });

  it('should return Good tier for 90-94 score', () => {
    expect(findSafetyTier(90).tierName).toBe('Good');
    expect(findSafetyTier(94).tierName).toBe('Good');
  });

  it('should return Excellent tier for 95-100 score', () => {
    expect(findSafetyTier(95).tierName).toBe('Excellent');
    expect(findSafetyTier(100).tierName).toBe('Excellent');
  });

  it('should return correct multipliers', () => {
    expect(findSafetyTier(60).multiplier).toBe('0.85');
    expect(findSafetyTier(85).multiplier).toBe('1.00');
    expect(findSafetyTier(98).multiplier).toBe('1.05');
  });
});

describe('calculateClampedMultiplier', () => {
  it('should calculate raw multiplier correctly', () => {
    const result = calculateClampedMultiplier('1.05', '1.00');
    expect(result.raw).toBe('1.0500');
  });

  it('should not clamp values within range', () => {
    const result = calculateClampedMultiplier('1.00', '1.00');
    expect(result.clamped).toBe('1.0000');
    expect(result.clampApplied).toBe(false);
  });

  it('should clamp high values to 1.15', () => {
    const result = calculateClampedMultiplier('1.10', '1.10');
    expect(parseFloat(result.raw)).toBeCloseTo(1.21, 2);
    expect(result.clamped).toBe('1.1500');
    expect(result.clampApplied).toBe(true);
  });

  it('should clamp low values to 0.85', () => {
    const result = calculateClampedMultiplier('0.90', '0.85');
    expect(parseFloat(result.raw)).toBeCloseTo(0.765, 2);
    expect(result.clamped).toBe('0.8500');
    expect(result.clampApplied).toBe(true);
  });
});

describe('buildPayMetricInputs', () => {
  it('should build complete metric inputs', () => {
    const inputs = buildPayMetricInputs(15, 85);
    
    expect(inputs.weeklyVolume).toBe(15);
    expect(inputs.volumeTier.tierName).toBe('Standard');
    expect(inputs.volumeMultiplier).toBe('1.00');
    expect(inputs.safetyScore30Day).toBe(85);
    expect(inputs.safetyTier.tierName).toBe('Standard');
    expect(inputs.safetyMultiplier).toBe('1.00');
    expect(inputs.clampApplied).toBe(false);
  });

  it('should detect when clamping is applied', () => {
    const inputs = buildPayMetricInputs(35, 98); // Very High + Excellent
    
    expect(inputs.volumeMultiplier).toBe('1.10');
    expect(inputs.safetyMultiplier).toBe('1.05');
    expect(inputs.clampApplied).toBe(true);
    expect(inputs.clampedCombinedMultiplier).toBe('1.1500');
  });
});

// ============================================
// 2. POLICY PROVENANCE TESTS
// ============================================

describe('buildPolicyProvenance', () => {
  it('should build exact match provenance', () => {
    const provenance = buildPolicyProvenance(
      'pv-001',
      'Standard Driver Policy',
      'exact',
      '2026-01-01',
      null,
      'market-1',
      'LOCAL_MOVE',
      'STANDARD',
      'market-1',
      'LOCAL_MOVE',
      'STANDARD'
    );

    expect(provenance.policyVersionId).toBe('pv-001');
    expect(provenance.matchLevel).toBe('exact');
    expect(provenance.fallbackUsed).toBe(false);
  });

  it('should detect fallback for execution_mode_null', () => {
    const provenance = buildPolicyProvenance(
      'pv-001',
      'Default Policy',
      'execution_mode_null',
      '2026-01-01',
      null,
      'market-1',
      'LOCAL_MOVE',
      'STANDARD',
      'market-1',
      'LOCAL_MOVE',
      null
    );

    expect(provenance.fallbackUsed).toBe(true);
    expect(provenance.matchLevel).toBe('execution_mode_null');
  });

  it('should detect fallback for market_id_null', () => {
    const provenance = buildPolicyProvenance(
      'pv-002',
      'Global Fallback Policy',
      'market_id_null',
      '2026-01-01',
      '2027-01-01',
      'unknown-market',
      'LOCAL_MOVE',
      'STANDARD',
      null,
      null,
      null
    );

    expect(provenance.fallbackUsed).toBe(true);
    expect(provenance.matchLevel).toBe('market_id_null');
    expect(provenance.expiresAt).toBe('2027-01-01');
  });
});

describe('describeMatchPath', () => {
  it('should describe exact match', () => {
    const provenance = buildPolicyProvenance(
      'pv-001', 'Policy', 'exact', '2026-01-01', null,
      'market-1', 'LOCAL_MOVE', 'STANDARD',
      'market-1', 'LOCAL_MOVE', 'STANDARD'
    );

    const description = describeMatchPath(provenance);
    expect(description).toContain('Exact match');
  });

  it('should describe execution mode fallback', () => {
    const provenance = buildPolicyProvenance(
      'pv-001', 'Policy', 'execution_mode_null', '2026-01-01', null,
      'market-1', 'LOCAL_MOVE', 'STANDARD',
      'market-1', 'LOCAL_MOVE', null
    );

    const description = describeMatchPath(provenance);
    expect(description).toContain('Fallback');
    expect(description).toContain('Execution mode');
  });

  it('should describe market fallback', () => {
    const provenance = buildPolicyProvenance(
      'pv-001', 'Policy', 'market_id_null', '2026-01-01', null,
      'unknown', 'LOCAL_MOVE', 'STANDARD',
      null, null, null
    );

    const description = describeMatchPath(provenance);
    expect(description).toContain('Fallback');
    expect(description).toContain('Market');
  });
});

// ============================================
// 3. FORMATTING TESTS
// ============================================

describe('formatCents', () => {
  it('should format cents to currency', () => {
    expect(formatCents(10000)).toBe('$100.00');
    expect(formatCents(2550)).toBe('$25.50');
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(99)).toBe('$0.99');
  });
});

describe('formatHours', () => {
  it('should format minutes to hours', () => {
    expect(formatHours(60)).toBe('1.00');
    expect(formatHours(90)).toBe('1.50');
    expect(formatHours(480)).toBe('8.00');
    expect(formatHours(0)).toBe('0.00');
  });
});

// ============================================
// 4. PAY LINE BREAKDOWN TESTS
// ============================================

describe('buildPayLineBreakdown', () => {
  it('should build complete pay line breakdown', () => {
    const breakdown = buildPayLineBreakdown(mockPayLine, '2026-01-20 to 2026-01-26');

    expect(breakdown.payLineId).toBe('pl-001');
    expect(breakdown.paidHours).toBe('8.00');
    expect(breakdown.baseRateFormatted).toBe('$25.00/hr');
    expect(breakdown.finalPayFormatted).toBe('$210.00');
    expect(breakdown.guardrailNote).toBe('No guardrails applied.');
  });

  it('should note when floor is applied', () => {
    const payLineWithFloor: PayLineRecord = {
      ...mockPayLine,
      floorApplied: true,
    };
    const breakdown = buildPayLineBreakdown(payLineWithFloor, 'period');

    expect(breakdown.guardrailNote).toContain('Hourly floor applied');
  });

  it('should note when cap is applied', () => {
    const payLineWithCap: PayLineRecord = {
      ...mockPayLine,
      capApplied: true,
    };
    const breakdown = buildPayLineBreakdown(payLineWithCap, 'period');

    expect(breakdown.guardrailNote).toContain('On-demand cap applied');
  });

  it('should note when both guardrails are applied', () => {
    const payLineWithBoth: PayLineRecord = {
      ...mockPayLine,
      floorApplied: true,
      capApplied: true,
    };
    const breakdown = buildPayLineBreakdown(payLineWithBoth, 'period');

    expect(breakdown.guardrailNote).toContain('Both');
  });
});

// ============================================
// 5. PAY PERIOD SUMMARY TESTS
// ============================================

describe('buildPayPeriodSummary', () => {
  it('should build summary with correct totals', () => {
    const payLines: PayLineRecord[] = [
      { ...mockPayLine, finalPayCents: 21000 },
      { ...mockPayLine, id: 'pl-002', finalPayCents: 15000 },
    ];

    const summary = buildPayPeriodSummary(mockPayPeriod, payLines);

    expect(summary.totalPayLines).toBe(2);
    expect(summary.totalFinalPayCents).toBe(36000);
    expect(summary.isLocked).toBe(true);
  });

  it('should calculate average multiplier', () => {
    const payLines: PayLineRecord[] = [
      { ...mockPayLine, effectiveMultiplier: '1.00' },
      { ...mockPayLine, id: 'pl-002', effectiveMultiplier: '1.10' },
    ];

    const summary = buildPayPeriodSummary(mockPayPeriod, payLines);

    expect(summary.averageEffectiveMultiplier).toBe('1.0500');
  });

  it('should count floor and cap applications', () => {
    const payLines: PayLineRecord[] = [
      { ...mockPayLine, floorApplied: true, capApplied: false },
      { ...mockPayLine, id: 'pl-002', floorApplied: false, capApplied: true },
      { ...mockPayLine, id: 'pl-003', floorApplied: true, capApplied: false },
    ];

    const summary = buildPayPeriodSummary(mockPayPeriod, payLines);

    expect(summary.floorAppliedCount).toBe(2);
    expect(summary.capAppliedCount).toBe(1);
  });

  it('should handle empty pay lines', () => {
    const summary = buildPayPeriodSummary(mockPayPeriod, []);

    expect(summary.totalPayLines).toBe(0);
    expect(summary.totalFinalPayCents).toBe(0);
    expect(summary.averageEffectiveMultiplier).toBe('1.0000');
  });
});

// ============================================
// 6. DRIVER PAY BREAKDOWN TESTS
// ============================================

describe('buildDriverPayBreakdown', () => {
  it('should build complete driver breakdown', () => {
    const metricInputs = buildPayMetricInputs(15, 85);
    const provenance = buildPolicyProvenance(
      'pv-001', 'Standard Policy', 'exact', '2026-01-01', null,
      'market-1', 'LOCAL_MOVE', 'STANDARD',
      'market-1', 'LOCAL_MOVE', 'STANDARD'
    );

    const breakdown = buildDriverPayBreakdown(
      'driver-1',
      'John Doe',
      'W2_DRIVER',
      mockPayPeriod,
      [mockPayLine],
      metricInputs,
      provenance
    );

    expect(breakdown.driverId).toBe('driver-1');
    expect(breakdown.driverName).toBe('John Doe');
    expect(breakdown.workerType).toBe('W2_DRIVER');
    expect(breakdown.summary.totalPayLines).toBe(1);
    expect(breakdown.payLines).toHaveLength(1);
    expect(breakdown.metricInputs.weeklyVolume).toBe(15);
    expect(breakdown.policyProvenance.policyVersionId).toBe('pv-001');
    expect(breakdown.generatedAt).toBeDefined();
  });

  it('should filter pay lines for specific driver', () => {
    const payLines: PayLineRecord[] = [
      { ...mockPayLine, driverId: 'driver-1' },
      { ...mockPayLine, id: 'pl-002', driverId: 'driver-2' },
      { ...mockPayLine, id: 'pl-003', driverId: 'driver-1' },
    ];

    const metricInputs = buildPayMetricInputs(15, 85);
    const provenance = buildPolicyProvenance(
      'pv-001', 'Policy', 'exact', '2026-01-01', null,
      null, null, null, null, null, null
    );

    const breakdown = buildDriverPayBreakdown(
      'driver-1', 'Driver 1', 'W2_DRIVER',
      mockPayPeriod, payLines, metricInputs, provenance
    );

    expect(breakdown.payLines).toHaveLength(2);
    expect(breakdown.summary.totalPayLines).toBe(2);
  });
});

// ============================================
// 7. PAY EXPLANATION PACKET TESTS
// ============================================

describe('generatePayExplanationPacket', () => {
  const metricInputs = buildPayMetricInputs(15, 85);
  const provenance = buildPolicyProvenance(
    'pv-001', 'Standard Policy', 'exact', '2026-01-01', null,
    'market-1', 'LOCAL_MOVE', 'STANDARD',
    'market-1', 'LOCAL_MOVE', 'STANDARD'
  );
  const breakdown = buildDriverPayBreakdown(
    'driver-1', 'John Doe', 'W2_DRIVER',
    mockPayPeriod, [mockPayLine], metricInputs, provenance
  );

  it('should generate JSON packet', () => {
    const packet = generatePayExplanationPacket(breakdown, 'json');

    expect(packet.format).toBe('json');
    expect(packet.isReadOnly).toBe(true);
    expect(JSON.parse(packet.content)).toBeDefined();
    expect(packet.content).toContain('driver-1');
  });

  it('should generate Markdown packet', () => {
    const packet = generatePayExplanationPacket(breakdown, 'markdown');

    expect(packet.format).toBe('markdown');
    expect(packet.content).toContain('# Pay Statement');
    expect(packet.content).toContain('John Doe');
    expect(packet.content).toContain('## Summary');
    expect(packet.content).toContain('## Performance Metrics');
    expect(packet.content).toContain('## Policy Details');
  });

  it('should generate HTML packet', () => {
    const packet = generatePayExplanationPacket(breakdown, 'html');

    expect(packet.format).toBe('html');
    expect(packet.content).toContain('<!DOCTYPE html>');
    expect(packet.content).toContain('Pay Statement');
    expect(packet.content).toContain('John Doe');
    expect(packet.content).toContain('<table>');
  });

  it('should include multiplier tier references in Markdown', () => {
    const packet = generatePayExplanationPacket(breakdown, 'markdown');

    expect(packet.content).toContain('## Reference: Multiplier Tiers');
    expect(packet.content).toContain('Volume Tiers');
    expect(packet.content).toContain('Safety Tiers');
  });

  it('should default to JSON format', () => {
    const packet = generatePayExplanationPacket(breakdown);
    expect(packet.format).toBe('json');
  });
});

// ============================================
// 8. READ-ONLY ACCESS TESTS
// ============================================

describe('checkReadOnlyAccess', () => {
  it('should allow read access for LOCKED period', () => {
    const result = checkReadOnlyAccess(mockPayPeriod);

    expect(result.allowed).toBe(true);
    expect(result.payPeriodStatus).toBe('LOCKED');
    expect(result.reason).toContain('locked');
  });

  it('should allow read access for OPEN period', () => {
    const result = checkReadOnlyAccess(mockOpenPayPeriod);

    expect(result.allowed).toBe(true);
    expect(result.payPeriodStatus).toBe('OPEN');
    expect(result.reason).toContain('OPEN');
  });
});

describe('enforceReadOnly', () => {
  it('should throw for LOCKED period', () => {
    expect(() => enforceReadOnly(mockPayPeriod, 'modify pay line')).toThrow(PayPeriodLockedError);
  });

  it('should not throw for OPEN period', () => {
    expect(() => enforceReadOnly(mockOpenPayPeriod, 'modify pay line')).not.toThrow();
  });
});

describe('getAvailableActions', () => {
  it('should return correct actions for OPEN period', () => {
    const actions = getAvailableActions(mockOpenPayPeriod);

    expect(actions.canView).toBe(true);
    expect(actions.canEdit).toBe(true);
    expect(actions.canExport).toBe(false);
    expect(actions.canLock).toBe(false);
  });

  it('should return correct actions for PROCESSING period', () => {
    const processingPeriod: PayPeriodRecord = { ...mockPayPeriod, status: 'PROCESSING' };
    const actions = getAvailableActions(processingPeriod);

    expect(actions.canView).toBe(true);
    expect(actions.canEdit).toBe(false);
    expect(actions.canExport).toBe(true);
    expect(actions.canLock).toBe(true);
  });

  it('should return correct actions for LOCKED period', () => {
    const actions = getAvailableActions(mockPayPeriod);

    expect(actions.canView).toBe(true);
    expect(actions.canEdit).toBe(false);
    expect(actions.canExport).toBe(true);
    expect(actions.canLock).toBe(false);
  });
});

// ============================================
// 9. MULTIPLIER TIER CONSTANTS TESTS
// ============================================

describe('VOLUME_MULTIPLIER_TIERS', () => {
  it('should have 5 tiers', () => {
    expect(VOLUME_MULTIPLIER_TIERS).toHaveLength(5);
  });

  it('should cover all volume ranges without gaps', () => {
    for (let i = 0; i < VOLUME_MULTIPLIER_TIERS.length - 1; i++) {
      const current = VOLUME_MULTIPLIER_TIERS[i];
      const next = VOLUME_MULTIPLIER_TIERS[i + 1];
      expect(current.maxValue + 1).toBe(next.minValue);
    }
  });
});

describe('SAFETY_MULTIPLIER_TIERS', () => {
  it('should have 5 tiers', () => {
    expect(SAFETY_MULTIPLIER_TIERS).toHaveLength(5);
  });

  it('should cover 0-100 range without gaps', () => {
    expect(SAFETY_MULTIPLIER_TIERS[0].minValue).toBe(0);
    expect(SAFETY_MULTIPLIER_TIERS[SAFETY_MULTIPLIER_TIERS.length - 1].maxValue).toBe(100);
    
    for (let i = 0; i < SAFETY_MULTIPLIER_TIERS.length - 1; i++) {
      const current = SAFETY_MULTIPLIER_TIERS[i];
      const next = SAFETY_MULTIPLIER_TIERS[i + 1];
      expect(current.maxValue + 1).toBe(next.minValue);
    }
  });
});

// ============================================
// 10. DRIVER TIER EVALUATION TESTS
// ============================================

import {
  evaluateDriverTier,
  findOverallTier,
  policyRateFor,
  getTierRateConfig,
  OVERALL_TIER_THRESHOLDS,
  TIER_BASE_RATES,
  type DriverTierEvaluation,
  type OverallDriverTier,
} from './transparencyEngine';

describe('findOverallTier', () => {
  it('should return Elite for multiplier >= 1.10', () => {
    expect(findOverallTier(1.15)).toBe('Elite');
    expect(findOverallTier(1.10)).toBe('Elite');
  });

  it('should return High Performer for multiplier 1.03-1.099', () => {
    expect(findOverallTier(1.05)).toBe('High Performer');
    expect(findOverallTier(1.03)).toBe('High Performer');
  });

  it('should return Standard for multiplier 0.95-1.029', () => {
    expect(findOverallTier(1.00)).toBe('Standard');
    expect(findOverallTier(0.95)).toBe('Standard');
  });

  it('should return Developing for multiplier 0.90-0.949', () => {
    expect(findOverallTier(0.92)).toBe('Developing');
    expect(findOverallTier(0.90)).toBe('Developing');
  });

  it('should return At Risk for multiplier <= 0.899', () => {
    expect(findOverallTier(0.85)).toBe('At Risk');
    expect(findOverallTier(0.87)).toBe('At Risk');
  });
});

describe('OVERALL_TIER_THRESHOLDS', () => {
  it('should have 5 tiers', () => {
    expect(OVERALL_TIER_THRESHOLDS).toHaveLength(5);
  });

  it('should have descriptions for all tiers', () => {
    for (const threshold of OVERALL_TIER_THRESHOLDS) {
      expect(threshold.description.length).toBeGreaterThan(0);
    }
  });
});

describe('evaluateDriverTier', () => {
  const driverId = 'driver-123';
  const evaluationDate = '2026-01-23';

  it('should evaluate Elite tier for high volume and high safety', () => {
    const result = evaluateDriverTier(driverId, evaluationDate, 30, 95);
    
    expect(result.driverId).toBe(driverId);
    expect(result.evaluationDate).toBe(evaluationDate);
    expect(result.overallTier).toBe('Elite');
    expect(result.volumeTier.tierName).toBe('Very High');
    expect(result.safetyTier.tierName).toBe('Excellent');
    expect(parseFloat(result.combinedMultiplier)).toBeGreaterThanOrEqual(1.10);
  });

  it('should evaluate High Performer tier for good volume and safety', () => {
    const result = evaluateDriverTier(driverId, evaluationDate, 20, 90);
    
    expect(result.overallTier).toBe('High Performer');
    expect(result.volumeTier.tierName).toBe('High');
    expect(result.safetyTier.tierName).toBe('Good');
  });

  it('should evaluate Standard tier for average metrics', () => {
    const result = evaluateDriverTier(driverId, evaluationDate, 15, 85);
    
    expect(result.overallTier).toBe('Standard');
    expect(result.volumeTier.tierName).toBe('Standard');
    expect(result.safetyTier.tierName).toBe('Standard');
    expect(result.combinedMultiplier).toBe('1.0000');
  });

  it('should evaluate Developing tier for below average metrics', () => {
    const result = evaluateDriverTier(driverId, evaluationDate, 5, 75);
    
    expect(result.overallTier).toBe('Developing');
    expect(result.volumeTier.tierName).toBe('Low');
    expect(result.safetyTier.tierName).toBe('Needs Improvement');
  });

  it('should evaluate At Risk tier for poor metrics', () => {
    const result = evaluateDriverTier(driverId, evaluationDate, 2, 65);
    
    expect(result.overallTier).toBe('At Risk');
    expect(result.volumeTier.tierName).toBe('Very Low');
    expect(result.safetyTier.tierName).toBe('Critical');
    expect(result.clampApplied).toBe(true);
  });

  it('should apply clamping for extreme multipliers', () => {
    const lowResult = evaluateDriverTier(driverId, evaluationDate, 0, 50);
    expect(lowResult.clampApplied).toBe(true);
    expect(parseFloat(lowResult.combinedMultiplier)).toBe(0.85);
  });

  it('should include metrics in result', () => {
    const result = evaluateDriverTier(driverId, evaluationDate, 25, 92);
    
    expect(result.metrics.weeklyVolume).toBe(25);
    expect(result.metrics.safetyScore30Day).toBe(92);
  });

  it('should include evaluatedAt timestamp', () => {
    const result = evaluateDriverTier(driverId, evaluationDate, 15, 85);
    
    expect(result.evaluatedAt).toBeDefined();
    expect(new Date(result.evaluatedAt).getTime()).not.toBeNaN();
  });

  it('should handle boundary cases correctly', () => {
    expect(evaluateDriverTier(driverId, evaluationDate, 4, 69).volumeTier.tierName).toBe('Very Low');
    expect(evaluateDriverTier(driverId, evaluationDate, 5, 70).volumeTier.tierName).toBe('Low');
    expect(evaluateDriverTier(driverId, evaluationDate, 9, 79).safetyTier.tierName).toBe('Needs Improvement');
    expect(evaluateDriverTier(driverId, evaluationDate, 10, 80).safetyTier.tierName).toBe('Standard');
  });
});

// ============================================
// 11. TIER-BASED RATE POLICY TESTS
// ============================================

describe('TIER_BASE_RATES', () => {
  it('should have 5 rate tiers', () => {
    expect(TIER_BASE_RATES).toHaveLength(5);
  });

  it('should have rates in descending order by tier', () => {
    expect(TIER_BASE_RATES[0].tier).toBe('Elite');
    expect(TIER_BASE_RATES[4].tier).toBe('At Risk');
  });

  it('should have Elite as highest rate and At Risk as lowest', () => {
    const eliteRate = TIER_BASE_RATES.find(r => r.tier === 'Elite')!.baseRateCents;
    const atRiskRate = TIER_BASE_RATES.find(r => r.tier === 'At Risk')!.baseRateCents;
    expect(eliteRate).toBeGreaterThan(atRiskRate);
  });

  it('should have descriptions for all tiers', () => {
    for (const config of TIER_BASE_RATES) {
      expect(config.description.length).toBeGreaterThan(0);
    }
  });
});

describe('policyRateFor', () => {
  it('should return 3000 cents for Elite tier', () => {
    expect(policyRateFor('Elite')).toBe(3000);
  });

  it('should return 2750 cents for High Performer tier', () => {
    expect(policyRateFor('High Performer')).toBe(2750);
  });

  it('should return 2500 cents for Standard tier', () => {
    expect(policyRateFor('Standard')).toBe(2500);
  });

  it('should return 2250 cents for Developing tier', () => {
    expect(policyRateFor('Developing')).toBe(2250);
  });

  it('should return 2000 cents for At Risk tier', () => {
    expect(policyRateFor('At Risk')).toBe(2000);
  });

  it('should default to Standard rate for unknown tier', () => {
    expect(policyRateFor('Unknown' as any)).toBe(2500);
  });
});

describe('getTierRateConfig', () => {
  it('should return full config for Elite tier', () => {
    const config = getTierRateConfig('Elite');
    expect(config.tier).toBe('Elite');
    expect(config.baseRateCents).toBe(3000);
    expect(config.description).toContain('$30.00');
  });

  it('should return full config for At Risk tier', () => {
    const config = getTierRateConfig('At Risk');
    expect(config.tier).toBe('At Risk');
    expect(config.baseRateCents).toBe(2000);
    expect(config.description).toContain('$20.00');
  });

  it('should default to Standard config for unknown tier', () => {
    const config = getTierRateConfig('Unknown' as any);
    expect(config.tier).toBe('Standard');
    expect(config.baseRateCents).toBe(2500);
  });
});
