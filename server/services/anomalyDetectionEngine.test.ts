import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordMetricData,
  calculateBaseline,
  getBaseline,
  getAllBaselines,
  initializeDefaultRules,
  upsertRule,
  getRule,
  getAllRules,
  setRuleEnabled,
  detectAnomaly,
  runDetection,
  runBatchDetection,
  getAnomaly,
  getAnomalies,
  acknowledgeAnomaly,
  getActiveSoftResponses,
  applySoftResponse,
  hasOverrideFriction,
  requiresReview,
  requiresManagerAttention,
  getAuditRecords,
  reproduceDetection,
  getAnomalySummary,
  clearAnomalyData,
  type MetricDataPoint,
  type DetectionRule,
  type RollingBaseline,
} from './anomalyDetectionEngine';

// ============================================
// TEST SETUP
// ============================================

function createDataPoints(
  metricType: 'PAY_PER_MOVE' | 'MINUTES_PER_MOVE' | 'SAFETY_INCIDENTS',
  values: number[],
  marketId: string = 'denver'
): MetricDataPoint[] {
  const now = new Date();
  return values.map((value, i) => ({
    timestamp: new Date(now.getTime() - (values.length - i) * 24 * 60 * 60 * 1000).toISOString(),
    value,
    scope: { marketId },
    metricType,
  }));
}

// ============================================
// BASELINE TESTS
// ============================================

describe('Rolling Baselines', () => {
  beforeEach(() => {
    clearAnomalyData();
  });

  describe('recordMetricData', () => {
    it('should record metric data points', () => {
      const points = createDataPoints('PAY_PER_MOVE', [100, 105, 110]);
      recordMetricData(points);
      
      const baseline = calculateBaseline('PAY_PER_MOVE', { marketId: 'denver' });
      expect(baseline.dataPoints).toBe(3);
    });

    it('should record data for multiple scopes', () => {
      const denverPoints = createDataPoints('PAY_PER_MOVE', [100, 105], 'denver');
      const phoenixPoints = createDataPoints('PAY_PER_MOVE', [200, 210], 'phoenix');
      
      recordMetricData(denverPoints);
      recordMetricData(phoenixPoints);
      
      const denverBaseline = calculateBaseline('PAY_PER_MOVE', { marketId: 'denver' });
      const phoenixBaseline = calculateBaseline('PAY_PER_MOVE', { marketId: 'phoenix' });
      
      expect(denverBaseline.mean).toBe(102.5);
      expect(phoenixBaseline.mean).toBe(205);
    });
  });

  describe('calculateBaseline', () => {
    it('should calculate mean correctly', () => {
      const points = createDataPoints('PAY_PER_MOVE', [100, 110, 120]);
      recordMetricData(points);
      
      const baseline = calculateBaseline('PAY_PER_MOVE', { marketId: 'denver' });
      expect(baseline.mean).toBe(110);
    });

    it('should calculate median correctly', () => {
      const points = createDataPoints('PAY_PER_MOVE', [100, 110, 200]);
      recordMetricData(points);
      
      const baseline = calculateBaseline('PAY_PER_MOVE', { marketId: 'denver' });
      expect(baseline.median).toBe(110);
    });

    it('should calculate standard deviation', () => {
      const points = createDataPoints('PAY_PER_MOVE', [100, 100, 100, 100]);
      recordMetricData(points);
      
      const baseline = calculateBaseline('PAY_PER_MOVE', { marketId: 'denver' });
      expect(baseline.stdDev).toBe(0);
    });

    it('should calculate min and max', () => {
      const points = createDataPoints('PAY_PER_MOVE', [50, 100, 150]);
      recordMetricData(points);
      
      const baseline = calculateBaseline('PAY_PER_MOVE', { marketId: 'denver' });
      expect(baseline.min).toBe(50);
      expect(baseline.max).toBe(150);
    });

    it('should calculate percentiles', () => {
      const points = createDataPoints('PAY_PER_MOVE', [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
      recordMetricData(points);
      
      const baseline = calculateBaseline('PAY_PER_MOVE', { marketId: 'denver' });
      expect(baseline.percentile25).toBeCloseTo(32.5, 1);
      expect(baseline.percentile75).toBeCloseTo(77.5, 1);
    });

    it('should detect increasing trend', () => {
      const points = createDataPoints('PAY_PER_MOVE', [100, 110, 120, 130, 140]);
      recordMetricData(points);
      
      const baseline = calculateBaseline('PAY_PER_MOVE', { marketId: 'denver' });
      expect(baseline.trend).toBe('INCREASING');
    });

    it('should detect decreasing trend', () => {
      const points = createDataPoints('PAY_PER_MOVE', [140, 130, 120, 110, 100]);
      recordMetricData(points);
      
      const baseline = calculateBaseline('PAY_PER_MOVE', { marketId: 'denver' });
      expect(baseline.trend).toBe('DECREASING');
    });

    it('should handle empty data', () => {
      const baseline = calculateBaseline('PAY_PER_MOVE', { marketId: 'empty' });
      expect(baseline.dataPoints).toBe(0);
      expect(baseline.mean).toBe(0);
    });
  });

  describe('getBaseline', () => {
    it('should retrieve stored baseline', () => {
      const points = createDataPoints('PAY_PER_MOVE', [100]);
      recordMetricData(points);
      calculateBaseline('PAY_PER_MOVE', { marketId: 'denver' });
      
      const baseline = getBaseline('PAY_PER_MOVE', { marketId: 'denver' });
      expect(baseline).not.toBeNull();
    });

    it('should return null for non-existent baseline', () => {
      const baseline = getBaseline('PAY_PER_MOVE', { marketId: 'nonexistent' });
      expect(baseline).toBeNull();
    });
  });

  describe('getAllBaselines', () => {
    it('should return all baselines', () => {
      recordMetricData(createDataPoints('PAY_PER_MOVE', [100], 'denver'));
      recordMetricData(createDataPoints('PAY_PER_MOVE', [200], 'phoenix'));
      
      calculateBaseline('PAY_PER_MOVE', { marketId: 'denver' });
      calculateBaseline('PAY_PER_MOVE', { marketId: 'phoenix' });
      
      const baselines = getAllBaselines();
      expect(baselines.length).toBe(2);
    });
  });
});

// ============================================
// DETECTION RULES TESTS
// ============================================

describe('Detection Rules', () => {
  beforeEach(() => {
    clearAnomalyData();
  });

  describe('initializeDefaultRules', () => {
    it('should create default rules', () => {
      initializeDefaultRules();
      const rules = getAllRules();
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should create rules for multiple metric types', () => {
      initializeDefaultRules();
      const rules = getAllRules();
      const metricTypes = new Set(rules.map(r => r.metricType));
      expect(metricTypes.size).toBeGreaterThan(3);
    });
  });

  describe('upsertRule', () => {
    it('should create a new rule', () => {
      const rule = upsertRule({
        name: 'Test Rule',
        description: 'Test description',
        metricType: 'PAY_PER_MOVE',
        method: 'THRESHOLD_BREACH',
        enabled: true,
        thresholds: { absoluteMax: 200 },
        severity: 'HIGH',
        softResponses: ['VISIBILITY_FLAG'],
      });
      
      expect(rule.id).toBeTruthy();
      expect(rule.name).toBe('Test Rule');
    });

    it('should update existing rule', () => {
      const rule1 = upsertRule({
        name: 'Test Rule',
        description: 'Test',
        metricType: 'PAY_PER_MOVE',
        method: 'THRESHOLD_BREACH',
        enabled: true,
        thresholds: {},
        severity: 'LOW',
        softResponses: [],
      });
      
      const rule2 = upsertRule({
        id: rule1.id,
        name: 'Updated Rule',
        description: 'Test',
        metricType: 'PAY_PER_MOVE',
        method: 'THRESHOLD_BREACH',
        enabled: true,
        thresholds: {},
        severity: 'LOW',
        softResponses: [],
      });
      
      expect(rule2.id).toBe(rule1.id);
      expect(rule2.name).toBe('Updated Rule');
    });
  });

  describe('setRuleEnabled', () => {
    it('should enable/disable a rule', () => {
      initializeDefaultRules();
      const rules = getAllRules();
      const ruleId = rules[0].id;
      
      setRuleEnabled(ruleId, false);
      expect(getRule(ruleId)?.enabled).toBe(false);
      
      setRuleEnabled(ruleId, true);
      expect(getRule(ruleId)?.enabled).toBe(true);
    });

    it('should return false for non-existent rule', () => {
      const result = setRuleEnabled('nonexistent', false);
      expect(result).toBe(false);
    });
  });
});

// ============================================
// ANOMALY DETECTION TESTS
// ============================================

describe('Anomaly Detection', () => {
  beforeEach(() => {
    clearAnomalyData();
  });

  describe('detectAnomaly - THRESHOLD_BREACH', () => {
    it('should detect value above max threshold', () => {
      const rule: DetectionRule = {
        id: 'test-rule',
        name: 'Max Threshold',
        description: 'Test',
        metricType: 'PAY_PER_MOVE',
        method: 'THRESHOLD_BREACH',
        enabled: true,
        thresholds: { absoluteMax: 100 },
        severity: 'HIGH',
        softResponses: ['VISIBILITY_FLAG'],
      };
      
      const event = detectAnomaly(rule, 150, null, { marketId: 'denver' });
      expect(event).not.toBeNull();
      expect(event?.severity).toBe('CRITICAL');
    });

    it('should detect value below min threshold', () => {
      const rule: DetectionRule = {
        id: 'test-rule',
        name: 'Min Threshold',
        description: 'Test',
        metricType: 'PAY_PER_MOVE',
        method: 'THRESHOLD_BREACH',
        enabled: true,
        thresholds: { absoluteMin: 50 },
        severity: 'HIGH',
        softResponses: [],
      };
      
      const event = detectAnomaly(rule, 30, null, { marketId: 'denver' });
      expect(event).not.toBeNull();
    });

    it('should not detect value within thresholds', () => {
      const rule: DetectionRule = {
        id: 'test-rule',
        name: 'Test',
        description: 'Test',
        metricType: 'PAY_PER_MOVE',
        method: 'THRESHOLD_BREACH',
        enabled: true,
        thresholds: { absoluteMin: 50, absoluteMax: 100 },
        severity: 'HIGH',
        softResponses: [],
      };
      
      const event = detectAnomaly(rule, 75, null, { marketId: 'denver' });
      expect(event).toBeNull();
    });
  });

  describe('detectAnomaly - PERCENT_DEVIATION', () => {
    it('should detect critical percent deviation', () => {
      const baseline: RollingBaseline = {
        id: 'baseline-1',
        metricType: 'PAY_PER_MOVE',
        scope: { marketId: 'denver' },
        windowDays: 30,
        dataPoints: 30,
        mean: 100,
        median: 100,
        stdDev: 10,
        min: 80,
        max: 120,
        percentile25: 90,
        percentile75: 110,
        percentile90: 115,
        percentile95: 118,
        trend: 'STABLE',
        trendStrength: 0,
        lastUpdated: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      
      const rule: DetectionRule = {
        id: 'test-rule',
        name: 'Percent Deviation',
        description: 'Test',
        metricType: 'PAY_PER_MOVE',
        method: 'PERCENT_DEVIATION',
        enabled: true,
        thresholds: { percentDeviationWarning: 20, percentDeviationCritical: 50 },
        severity: 'MEDIUM',
        softResponses: [],
      };
      
      const event = detectAnomaly(rule, 160, baseline, { marketId: 'denver' });
      expect(event).not.toBeNull();
      expect(event?.severity).toBe('CRITICAL');
    });

    it('should detect warning percent deviation', () => {
      const baseline: RollingBaseline = {
        id: 'baseline-1',
        metricType: 'PAY_PER_MOVE',
        scope: { marketId: 'denver' },
        windowDays: 30,
        dataPoints: 30,
        mean: 100,
        median: 100,
        stdDev: 10,
        min: 80,
        max: 120,
        percentile25: 90,
        percentile75: 110,
        percentile90: 115,
        percentile95: 118,
        trend: 'STABLE',
        trendStrength: 0,
        lastUpdated: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      
      const rule: DetectionRule = {
        id: 'test-rule',
        name: 'Percent Deviation',
        description: 'Test',
        metricType: 'PAY_PER_MOVE',
        method: 'PERCENT_DEVIATION',
        enabled: true,
        thresholds: { percentDeviationWarning: 20, percentDeviationCritical: 50 },
        severity: 'MEDIUM',
        softResponses: [],
      };
      
      const event = detectAnomaly(rule, 125, baseline, { marketId: 'denver' });
      expect(event).not.toBeNull();
      expect(event?.severity).toBe('MEDIUM');
    });
  });

  describe('detectAnomaly - STANDARD_DEVIATION', () => {
    it('should detect value outside std dev threshold', () => {
      const baseline: RollingBaseline = {
        id: 'baseline-1',
        metricType: 'MINUTES_PER_MOVE',
        scope: { marketId: 'denver' },
        windowDays: 30,
        dataPoints: 30,
        mean: 50,
        median: 50,
        stdDev: 5,
        min: 40,
        max: 60,
        percentile25: 45,
        percentile75: 55,
        percentile90: 58,
        percentile95: 59,
        trend: 'STABLE',
        trendStrength: 0,
        lastUpdated: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      
      const rule: DetectionRule = {
        id: 'test-rule',
        name: 'Std Dev',
        description: 'Test',
        metricType: 'MINUTES_PER_MOVE',
        method: 'STANDARD_DEVIATION',
        enabled: true,
        thresholds: { stdDevWarning: 2, stdDevCritical: 3 },
        severity: 'LOW',
        softResponses: [],
      };
      
      const event = detectAnomaly(rule, 70, baseline, { marketId: 'denver' }); // 4 std devs
      expect(event).not.toBeNull();
      expect(event?.severity).toBe('CRITICAL');
    });
  });

  describe('detectAnomaly - SUDDEN_CHANGE', () => {
    it('should detect sudden increase', () => {
      const rule: DetectionRule = {
        id: 'test-rule',
        name: 'Sudden Change',
        description: 'Test',
        metricType: 'SAFETY_INCIDENTS',
        method: 'SUDDEN_CHANGE',
        enabled: true,
        thresholds: { suddenChangePercent: 50 },
        severity: 'HIGH',
        softResponses: [],
      };
      
      const recentValues = [10, 10, 10, 20];
      const event = detectAnomaly(rule, 20, null, { marketId: 'denver' }, recentValues);
      expect(event).not.toBeNull();
      expect(event?.explanation).toContain('increase');
    });
  });

  describe('runDetection', () => {
    it('should run all applicable rules', () => {
      initializeDefaultRules();
      
      const events = runDetection('PAY_PER_HOUR', 15000, { marketId: 'denver' }); // $150/hr
      expect(events.length).toBeGreaterThan(0);
    });

    it('should skip disabled rules', () => {
      initializeDefaultRules();
      const rules = getAllRules();
      for (const rule of rules) {
        setRuleEnabled(rule.id, false);
      }
      
      const events = runDetection('PAY_PER_HOUR', 15000, { marketId: 'denver' });
      expect(events.length).toBe(0);
    });
  });

  describe('runBatchDetection', () => {
    it('should detect anomalies in batch', () => {
      initializeDefaultRules();
      
      const points: MetricDataPoint[] = [
        { timestamp: new Date().toISOString(), value: 15000, scope: { marketId: 'denver' }, metricType: 'PAY_PER_HOUR' },
      ];
      
      const events = runBatchDetection(points);
      expect(events.length).toBeGreaterThan(0);
    });
  });
});

// ============================================
// ANOMALY MANAGEMENT TESTS
// ============================================

describe('Anomaly Management', () => {
  beforeEach(() => {
    clearAnomalyData();
    initializeDefaultRules();
  });

  describe('getAnomalies', () => {
    it('should filter by severity', () => {
      runDetection('PAY_PER_HOUR', 15000, { marketId: 'denver' });
      
      const criticalEvents = getAnomalies({ severity: 'CRITICAL' });
      expect(criticalEvents.every(e => e.severity === 'CRITICAL')).toBe(true);
    });

    it('should filter by acknowledged status', () => {
      runDetection('PAY_PER_HOUR', 15000, { marketId: 'denver' });
      
      const unacknowledged = getAnomalies({ acknowledged: false });
      expect(unacknowledged.every(e => !e.acknowledged)).toBe(true);
    });
  });

  describe('acknowledgeAnomaly', () => {
    it('should acknowledge an anomaly', () => {
      const events = runDetection('PAY_PER_HOUR', 15000, { marketId: 'denver' });
      const anomalyId = events[0].id;
      
      const result = acknowledgeAnomaly(anomalyId, 'test-user', 'Reviewed and accepted');
      expect(result).toBe(true);
      
      const anomaly = getAnomaly(anomalyId);
      expect(anomaly?.acknowledged).toBe(true);
      expect(anomaly?.acknowledgedBy).toBe('test-user');
    });

    it('should return false for non-existent anomaly', () => {
      const result = acknowledgeAnomaly('nonexistent', 'user');
      expect(result).toBe(false);
    });
  });
});

// ============================================
// SOFT RESPONSES TESTS
// ============================================

describe('Soft Responses', () => {
  beforeEach(() => {
    clearAnomalyData();
  });

  describe('applySoftResponse', () => {
    it('should apply a soft response', () => {
      const response = applySoftResponse('driver-123', {
        type: 'OVERRIDE_FRICTION',
        reason: 'High deviation detected',
      });
      
      expect(response.appliedAt).toBeTruthy();
      expect(response.type).toBe('OVERRIDE_FRICTION');
    });
  });

  describe('getActiveSoftResponses', () => {
    it('should return active responses', () => {
      applySoftResponse('driver-123', { type: 'VISIBILITY_FLAG', reason: 'Test' });
      applySoftResponse('driver-123', { type: 'REVIEW_REQUIRED', reason: 'Test' });
      
      const responses = getActiveSoftResponses('driver-123');
      expect(responses.length).toBe(2);
    });

    it('should filter expired responses', () => {
      applySoftResponse('driver-123', {
        type: 'VISIBILITY_FLAG',
        reason: 'Test',
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      });
      
      const responses = getActiveSoftResponses('driver-123');
      expect(responses.length).toBe(0);
    });
  });

  describe('hasOverrideFriction', () => {
    it('should detect override friction', () => {
      applySoftResponse('driver-123', { type: 'OVERRIDE_FRICTION', reason: 'Test' });
      
      expect(hasOverrideFriction('driver-123')).toBe(true);
      expect(hasOverrideFriction('driver-456')).toBe(false);
    });
  });

  describe('requiresReview', () => {
    it('should detect review required', () => {
      applySoftResponse('driver-123', { type: 'REVIEW_REQUIRED', reason: 'Test' });
      
      expect(requiresReview('driver-123')).toBe(true);
    });
  });

  describe('requiresManagerAttention', () => {
    it('should detect manager attention', () => {
      applySoftResponse('driver-123', { type: 'MANAGER_ATTENTION', reason: 'Test' });
      
      expect(requiresManagerAttention('driver-123')).toBe(true);
    });
  });
});

// ============================================
// AUDIT & REPRODUCIBILITY TESTS
// ============================================

describe('Audit & Reproducibility', () => {
  beforeEach(() => {
    clearAnomalyData();
  });

  describe('getAuditRecords', () => {
    it('should record baseline operations', () => {
      recordMetricData(createDataPoints('PAY_PER_MOVE', [100]));
      calculateBaseline('PAY_PER_MOVE', { marketId: 'denver' });
      
      const records = getAuditRecords({ action: 'BASELINE_CREATED' });
      expect(records.length).toBeGreaterThan(0);
    });

    it('should record rule operations', () => {
      initializeDefaultRules();
      
      const records = getAuditRecords({ action: 'RULE_CREATED' });
      expect(records.length).toBeGreaterThan(0);
    });

    it('should record anomaly detection', () => {
      initializeDefaultRules();
      runDetection('PAY_PER_HOUR', 15000, { marketId: 'denver' });
      
      const records = getAuditRecords({ action: 'ANOMALY_DETECTED' });
      expect(records.length).toBeGreaterThan(0);
    });

    it('should filter by date range', () => {
      initializeDefaultRules();
      
      const records = getAuditRecords({
        startDate: new Date(Date.now() - 1000).toISOString(),
      });
      expect(records.length).toBeGreaterThan(0);
    });
  });

  describe('reproduceDetection', () => {
    it('should reproduce detection run', () => {
      initializeDefaultRules();
      runDetection('PAY_PER_HOUR', 15000, { marketId: 'denver' });
      
      const records = getAuditRecords({ action: 'DETECTION_RUN' });
      const result = reproduceDetection(records[0].id);
      
      expect(result?.success).toBe(true);
      expect(result?.match).toBe(true);
    });

    it('should return null for non-detection records', () => {
      initializeDefaultRules();
      
      const records = getAuditRecords({ action: 'RULE_CREATED' });
      const result = reproduceDetection(records[0].id);
      
      expect(result).toBeNull();
    });
  });
});

// ============================================
// SUMMARY TESTS
// ============================================

describe('Anomaly Summary', () => {
  beforeEach(() => {
    clearAnomalyData();
    initializeDefaultRules();
  });

  it('should generate summary', () => {
    runDetection('PAY_PER_HOUR', 15000, { marketId: 'denver' });
    runDetection('PAY_PER_HOUR', 12000, { marketId: 'phoenix' });
    
    const summary = getAnomalySummary();
    expect(summary.totalAnomalies).toBeGreaterThan(0);
    expect(summary.unacknowledged).toBeGreaterThan(0);
  });

  it('should count by severity', () => {
    runDetection('PAY_PER_HOUR', 15000, { marketId: 'denver' });
    
    const summary = getAnomalySummary();
    const totalBySeverity = Object.values(summary.bySeverity).reduce((a, b) => a + b, 0);
    expect(totalBySeverity).toBe(summary.totalAnomalies);
  });

  it('should identify top affected scopes', () => {
    runDetection('PAY_PER_HOUR', 15000, { marketId: 'denver' });
    
    const summary = getAnomalySummary();
    expect(summary.topAffectedScopes.length).toBeGreaterThan(0);
  });
});
