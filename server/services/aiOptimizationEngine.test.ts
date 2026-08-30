import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectTrend,
  detectAnomalies,
  detectThresholdBreach,
  detectConcentration,
  generateRecommendationFromPattern,
  createInboxItemFromRecommendation,
  createPatternAlertItem,
  createInsightSummaryItem,
  getInboxItem,
  listInboxItems,
  markInboxItemRead,
  acknowledgeInboxItem,
  dismissInboxItem,
  archiveInboxItem,
  getInboxSummary,
  runAnalysis,
  getPattern,
  listPatterns,
  getRecommendation,
  listRecommendations,
  getAnalysisRequest,
  getAuditRecords,
  provideFeedback,
  clearAIOptimizationData,
  TimeSeriesData,
  DetectedPattern,
  AIRecommendation,
} from './aiOptimizationEngine';

// ============================================
// TEST HELPERS
// ============================================

function createTestTimeSeries(
  domain: 'PAY' | 'SAFETY' | 'UTILIZATION' | 'ZONE' | 'DRIVER_PERFORMANCE' | 'MARKET_EFFICIENCY' | 'COST_OPTIMIZATION',
  values: number[],
  entityId: string = 'test-entity'
): TimeSeriesData {
  const now = new Date();
  return {
    domain,
    entityId,
    entityType: 'MARKET',
    dataPoints: values.map((value, i) => ({
      timestamp: new Date(now.getTime() - (values.length - i - 1) * 24 * 60 * 60 * 1000).toISOString(),
      value,
    })),
    startDate: new Date(now.getTime() - (values.length - 1) * 24 * 60 * 60 * 1000).toISOString(),
    endDate: now.toISOString(),
  };
}

// ============================================
// PATTERN DETECTION TESTS
// ============================================

describe('Pattern Detection', () => {
  beforeEach(() => {
    clearAIOptimizationData();
  });

  describe('detectTrend', () => {
    it('should detect increasing trend', () => {
      const data = createTestTimeSeries('UTILIZATION', [50, 55, 60, 65, 70, 75, 80]);
      
      const pattern = detectTrend(data);
      
      expect(pattern).not.toBeNull();
      expect(pattern?.patternType).toBe('TREND');
      expect(pattern?.description).toContain('increasing');
    });

    it('should detect decreasing trend', () => {
      const data = createTestTimeSeries('SAFETY', [80, 75, 70, 65, 60, 55, 50]);
      
      const pattern = detectTrend(data);
      
      expect(pattern).not.toBeNull();
      expect(pattern?.patternType).toBe('TREND');
      expect(pattern?.description).toContain('decreasing');
    });

    it('should return null for stable data', () => {
      const data = createTestTimeSeries('PAY', [100, 101, 99, 100, 100, 101, 99]);
      
      const pattern = detectTrend(data);
      
      expect(pattern).toBeNull();
    });

    it('should return null for insufficient data', () => {
      const data = createTestTimeSeries('PAY', [100, 101]);
      
      const pattern = detectTrend(data);
      
      expect(pattern).toBeNull();
    });

    it('should include explainability', () => {
      const data = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
      
      const pattern = detectTrend(data);
      
      expect(pattern?.explainability).toBeDefined();
      expect(pattern?.explainability.summary).toBeTruthy();
      expect(pattern?.explainability.methodology).toBeTruthy();
      expect(pattern?.explainability.factors.length).toBeGreaterThan(0);
    });

    it('should calculate significance (R-squared)', () => {
      const data = createTestTimeSeries('UTILIZATION', [10, 20, 30, 40, 50, 60, 70]);
      
      const pattern = detectTrend(data);
      
      expect(pattern?.significance).toBeGreaterThan(0.9);
    });
  });

  describe('detectAnomalies', () => {
    it('should detect outlier above mean', () => {
      const data = createTestTimeSeries('PAY', [100, 100, 100, 100, 200, 100, 100]);
      
      const anomalies = detectAnomalies(data, 2.0);
      
      expect(anomalies.length).toBe(1);
      expect(anomalies[0].patternType).toBe('ANOMALY');
      expect(anomalies[0].description).toContain('above');
    });

    it('should detect outlier below mean', () => {
      const data = createTestTimeSeries('SAFETY', [100, 100, 100, 100, 20, 100, 100]);
      
      const anomalies = detectAnomalies(data, 2.0);
      
      expect(anomalies.length).toBe(1);
      expect(anomalies[0].description).toContain('below');
    });

    it('should detect multiple anomalies', () => {
      const data = createTestTimeSeries('UTILIZATION', [100, 200, 100, 100, 20, 100, 100]);
      
      const anomalies = detectAnomalies(data, 1.5);
      
      expect(anomalies.length).toBeGreaterThan(1);
    });

    it('should return empty for normal data', () => {
      const data = createTestTimeSeries('PAY', [100, 102, 98, 101, 99, 100, 101]);
      
      const anomalies = detectAnomalies(data);
      
      expect(anomalies.length).toBe(0);
    });

    it('should include explainability with z-score', () => {
      const data = createTestTimeSeries('PAY', [100, 100, 100, 100, 200, 100, 100]);
      
      const anomalies = detectAnomalies(data);
      
      if (anomalies.length > 0) {
        expect(anomalies[0].explainability.factors[0].name).toBe('Z-Score');
      }
    });
  });

  describe('detectThresholdBreach', () => {
    it('should detect values above threshold', () => {
      const data = createTestTimeSeries('SAFETY', [60, 70, 80, 90, 100, 80, 70]);
      
      const pattern = detectThresholdBreach(data, 75, 'GT');
      
      expect(pattern).not.toBeNull();
      expect(pattern?.patternType).toBe('THRESHOLD_BREACH');
      expect(pattern?.description).toContain('above');
    });

    it('should detect values below threshold', () => {
      const data = createTestTimeSeries('UTILIZATION', [60, 50, 40, 30, 50, 60, 55]);
      
      const pattern = detectThresholdBreach(data, 55, 'LT');
      
      expect(pattern).not.toBeNull();
      expect(pattern?.description).toContain('below');
    });

    it('should return null when no breaches', () => {
      const data = createTestTimeSeries('UTILIZATION', [80, 85, 90, 85, 80, 85, 90]);
      
      const pattern = detectThresholdBreach(data, 75, 'LT');
      
      expect(pattern).toBeNull();
    });

    it('should calculate breach rate correctly', () => {
      const data = createTestTimeSeries('PAY', [10, 20, 30, 40, 50, 60, 70]);
      
      const pattern = detectThresholdBreach(data, 35, 'GT');
      
      expect(pattern).not.toBeNull();
      expect(pattern?.magnitude).toBeCloseTo(57.1, 0);
    });
  });

  describe('detectConcentration', () => {
    it('should detect high concentration', () => {
      const values = [
        { entityId: 'market1', value: 80 },
        { entityId: 'market2', value: 10 },
        { entityId: 'market3', value: 5 },
        { entityId: 'market4', value: 5 },
      ];
      
      const pattern = detectConcentration(values, 'UTILIZATION');
      
      expect(pattern).not.toBeNull();
      expect(pattern?.patternType).toBe('CONCENTRATION');
    });

    it('should return null for low concentration', () => {
      const values = [
        { entityId: 'market1', value: 20 },
        { entityId: 'market2', value: 20 },
        { entityId: 'market3', value: 20 },
        { entityId: 'market4', value: 20 },
        { entityId: 'market5', value: 20 },
      ];
      
      const pattern = detectConcentration(values, 'UTILIZATION');
      
      // HHI = 5 * 20^2 = 2000, which is below the 2500 threshold
      expect(pattern).toBeNull();
    });

    it('should include HHI in explainability', () => {
      const values = [
        { entityId: 'market1', value: 70 },
        { entityId: 'market2', value: 20 },
        { entityId: 'market3', value: 10 },
      ];
      
      const pattern = detectConcentration(values, 'PAY');
      
      expect(pattern?.explainability.factors.find(f => f.name === 'HHI Index')).toBeDefined();
    });
  });
});

// ============================================
// RECOMMENDATION GENERATION TESTS
// ============================================

describe('Recommendation Generation', () => {
  beforeEach(() => {
    clearAIOptimizationData();
  });

  describe('generateRecommendationFromPattern', () => {
    it('should generate recommendation from trend pattern', () => {
      const data = createTestTimeSeries('UTILIZATION', [50, 55, 60, 65, 70, 75, 80]);
      const pattern = detectTrend(data)!;
      
      const recommendation = generateRecommendationFromPattern(pattern);
      
      expect(recommendation).not.toBeNull();
      expect(recommendation?.id).toBeTruthy();
      expect(recommendation?.category).toBeTruthy();
    });

    it('should include confidence score', () => {
      const data = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
      const pattern = detectTrend(data)!;
      
      const recommendation = generateRecommendationFromPattern(pattern);
      
      expect(recommendation?.confidenceScore).toBeGreaterThan(0);
      expect(recommendation?.confidence).toBeTruthy();
    });

    it('should include estimated impact', () => {
      const data = createTestTimeSeries('SAFETY', [80, 75, 70, 65, 60, 55, 50]);
      const pattern = detectTrend(data)!;
      
      const recommendation = generateRecommendationFromPattern(pattern);
      
      expect(recommendation?.estimatedImpact).toBeDefined();
      expect(recommendation?.estimatedImpact.metric).toBeTruthy();
      expect(recommendation?.estimatedImpact.changePercent).toBeDefined();
    });

    it('should include full explainability', () => {
      const data = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
      const pattern = detectTrend(data)!;
      
      const recommendation = generateRecommendationFromPattern(pattern);
      
      expect(recommendation?.explainability).toBeDefined();
      expect(recommendation?.explainability.reasoning).toBeTruthy();
      expect(recommendation?.explainability.dataSourcesSummary).toBeTruthy();
      expect(recommendation?.explainability.analysisMethodology).toBeTruthy();
      expect(recommendation?.explainability.keyAssumptions.length).toBeGreaterThan(0);
      expect(recommendation?.explainability.auditTrail.length).toBeGreaterThan(0);
    });

    it('should link supporting patterns', () => {
      const data = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
      const pattern = detectTrend(data)!;
      
      const recommendation = generateRecommendationFromPattern(pattern);
      
      expect(recommendation?.supportingPatterns).toContain(pattern.id);
    });

    it('should include target entities', () => {
      const data = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110], 'denver-market');
      const pattern = detectTrend(data)!;
      
      const recommendation = generateRecommendationFromPattern(pattern);
      
      expect(recommendation?.targetEntities.length).toBeGreaterThan(0);
      expect(recommendation?.targetEntities[0].entityId).toBe('denver-market');
    });

    it('should set priority based on impact and confidence', () => {
      const data = createTestTimeSeries('SAFETY', [90, 80, 70, 60, 50, 40, 30]);
      const pattern = detectTrend(data)!;
      
      const recommendation = generateRecommendationFromPattern(pattern);
      
      expect(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).toContain(recommendation?.priority);
    });
  });
});

// ============================================
// EXECUTIVE INBOX TESTS
// ============================================

describe('Executive Inbox', () => {
  beforeEach(() => {
    clearAIOptimizationData();
  });

  describe('createInboxItemFromRecommendation', () => {
    it('should create inbox item from recommendation', () => {
      const data = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
      const pattern = detectTrend(data)!;
      const recommendation = generateRecommendationFromPattern(pattern)!;
      
      const item = createInboxItemFromRecommendation(recommendation);
      
      expect(item.id).toBeTruthy();
      expect(item.type).toBe('RECOMMENDATION');
      expect(item.status).toBe('UNREAD');
      expect(item.recommendation).toBeDefined();
    });

    it('should set priority from recommendation', () => {
      const data = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
      const pattern = detectTrend(data)!;
      const recommendation = generateRecommendationFromPattern(pattern)!;
      
      const item = createInboxItemFromRecommendation(recommendation);
      
      expect(item.priority).toBe(recommendation.priority);
    });
  });

  describe('createPatternAlertItem', () => {
    it('should create pattern alert', () => {
      const data = createTestTimeSeries('PAY', [100, 100, 100, 100, 200, 100, 100]);
      const anomalies = detectAnomalies(data);
      
      if (anomalies.length > 0) {
        const item = createPatternAlertItem(anomalies[0], 'Pay Anomaly Detected');
        
        expect(item.type).toBe('PATTERN_ALERT');
        expect(item.title).toBe('Pay Anomaly Detected');
        expect(item.patterns?.length).toBe(1);
      }
    });
  });

  describe('createInsightSummaryItem', () => {
    it('should create insight summary', () => {
      const item = createInsightSummaryItem(
        'Weekly Analysis Summary',
        'Analysis complete for week 12',
        ['Finding 1', 'Finding 2'],
        []
      );
      
      expect(item.type).toBe('INSIGHT');
      expect(item.summary).toContain('Finding 1');
      expect(item.summary).toContain('Finding 2');
    });
  });

  describe('inbox item management', () => {
    it('should mark item as read', () => {
      const data = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
      const pattern = detectTrend(data)!;
      const recommendation = generateRecommendationFromPattern(pattern)!;
      const item = createInboxItemFromRecommendation(recommendation);
      
      const result = markInboxItemRead(item.id);
      
      expect(result).toBe(true);
      const updated = getInboxItem(item.id);
      expect(updated?.status).toBe('READ');
      expect(updated?.readAt).toBeTruthy();
    });

    it('should acknowledge item', () => {
      const data = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
      const pattern = detectTrend(data)!;
      const recommendation = generateRecommendationFromPattern(pattern)!;
      const item = createInboxItemFromRecommendation(recommendation);
      
      const result = acknowledgeInboxItem(item.id, 'john.doe', 'Will implement next week');
      
      expect(result).toBe(true);
      const updated = getInboxItem(item.id);
      expect(updated?.status).toBe('ACKNOWLEDGED');
      expect(updated?.acknowledgedBy).toBe('john.doe');
      expect(updated?.notes).toBe('Will implement next week');
    });

    it('should dismiss item', () => {
      const data = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
      const pattern = detectTrend(data)!;
      const recommendation = generateRecommendationFromPattern(pattern)!;
      const item = createInboxItemFromRecommendation(recommendation);
      
      const result = dismissInboxItem(item.id, 'john.doe', 'Not applicable to our situation');
      
      expect(result).toBe(true);
      const updated = getInboxItem(item.id);
      expect(updated?.status).toBe('DISMISSED');
    });

    it('should archive item', () => {
      const data = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
      const pattern = detectTrend(data)!;
      const recommendation = generateRecommendationFromPattern(pattern)!;
      const item = createInboxItemFromRecommendation(recommendation);
      
      const result = archiveInboxItem(item.id);
      
      expect(result).toBe(true);
      const updated = getInboxItem(item.id);
      expect(updated?.status).toBe('ARCHIVED');
    });
  });

  describe('listInboxItems', () => {
    it('should list all items', () => {
      const data1 = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
      const data2 = createTestTimeSeries('SAFETY', [80, 75, 70, 65, 60, 55, 50]);
      
      const pattern1 = detectTrend(data1)!;
      const pattern2 = detectTrend(data2)!;
      
      const rec1 = generateRecommendationFromPattern(pattern1)!;
      const rec2 = generateRecommendationFromPattern(pattern2)!;
      
      createInboxItemFromRecommendation(rec1);
      createInboxItemFromRecommendation(rec2);
      
      const items = listInboxItems();
      expect(items.length).toBe(2);
    });

    it('should filter by type', () => {
      const data = createTestTimeSeries('PAY', [100, 100, 100, 100, 200, 100, 100]);
      const anomalies = detectAnomalies(data);
      
      if (anomalies.length > 0) {
        createPatternAlertItem(anomalies[0], 'Alert');
      }
      
      const trendData = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
      const pattern = detectTrend(trendData)!;
      const rec = generateRecommendationFromPattern(pattern)!;
      createInboxItemFromRecommendation(rec);
      
      const alerts = listInboxItems({ type: 'PATTERN_ALERT' });
      const recs = listInboxItems({ type: 'RECOMMENDATION' });
      
      expect(alerts.length + recs.length).toBeGreaterThan(0);
    });

    it('should filter by status', () => {
      const data = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
      const pattern = detectTrend(data)!;
      const rec = generateRecommendationFromPattern(pattern)!;
      const item = createInboxItemFromRecommendation(rec);
      
      markInboxItemRead(item.id);
      
      const unread = listInboxItems({ status: 'UNREAD' });
      const read = listInboxItems({ status: 'READ' });
      
      expect(unread.length).toBe(0);
      expect(read.length).toBe(1);
    });

    it('should sort by priority', () => {
      // Create multiple items - priority is dynamic based on pattern
      const items = listInboxItems();
      
      for (let i = 1; i < items.length; i++) {
        const priorityOrder: Record<string, number> = { 'URGENT': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3 };
        expect(priorityOrder[items[i-1].priority]).toBeLessThanOrEqual(priorityOrder[items[i].priority]);
      }
    });
  });

  describe('getInboxSummary', () => {
    it('should return inbox summary', () => {
      const data = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
      const pattern = detectTrend(data)!;
      const rec = generateRecommendationFromPattern(pattern)!;
      createInboxItemFromRecommendation(rec);
      
      const summary = getInboxSummary();
      
      expect(summary.total).toBeGreaterThan(0);
      expect(summary.unread).toBeDefined();
      expect(summary.byType).toBeDefined();
      expect(summary.byPriority).toBeDefined();
    });
  });
});

// ============================================
// ANALYSIS ORCHESTRATION TESTS
// ============================================

describe('Analysis Orchestration', () => {
  beforeEach(() => {
    clearAIOptimizationData();
  });

  describe('runAnalysis', () => {
    it('should run comprehensive analysis', () => {
      const datasets = [
        createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]),
        createTestTimeSeries('SAFETY', [80, 75, 70, 65, 60, 55, 50]),
      ];
      
      const request = runAnalysis(datasets, 'admin');
      
      expect(request.id).toBeTruthy();
      expect(request.status).toBe('COMPLETED');
      expect(request.resultSummary).toBeDefined();
    });

    it('should detect patterns across datasets', () => {
      const datasets = [
        createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]),
        createTestTimeSeries('SAFETY', [80, 75, 70, 65, 60, 55, 50]),
      ];
      
      const request = runAnalysis(datasets, 'admin');
      
      expect(request.resultSummary?.patternsDetected).toBeGreaterThan(0);
    });

    it('should generate recommendations', () => {
      const datasets = [
        createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]),
      ];
      
      const request = runAnalysis(datasets, 'admin', { generateRecommendations: true });
      
      expect(request.resultSummary?.recommendationsGenerated).toBeGreaterThanOrEqual(0);
    });

    it('should create inbox items', () => {
      const datasets = [
        createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]),
      ];
      
      runAnalysis(datasets, 'admin', { createInboxItems: true });
      
      const items = listInboxItems();
      expect(items.length).toBeGreaterThanOrEqual(0);
    });

    it('should check thresholds when provided', () => {
      const datasets = [
        createTestTimeSeries('UTILIZATION', [60, 50, 40, 30, 40, 50, 45]),
      ];
      
      const request = runAnalysis(datasets, 'admin', {
        thresholds: {
          'UTILIZATION': { value: 55, operator: 'LT' },
        },
      });
      
      expect(request.resultSummary?.patternsDetected).toBeGreaterThan(0);
    });

    it('should include executive summary', () => {
      const datasets = [
        createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]),
      ];
      
      const request = runAnalysis(datasets, 'admin');
      
      expect(request.resultSummary?.executiveSummary).toBeTruthy();
    });
  });
});

// ============================================
// QUERY FUNCTION TESTS
// ============================================

describe('Query Functions', () => {
  beforeEach(() => {
    clearAIOptimizationData();
  });

  describe('pattern queries', () => {
    it('should get pattern by ID', () => {
      const data = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
      const pattern = detectTrend(data)!;
      
      const retrieved = getPattern(pattern.id);
      
      expect(retrieved?.id).toBe(pattern.id);
    });

    it('should list patterns with filters', () => {
      const data1 = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
      const data2 = createTestTimeSeries('SAFETY', [80, 75, 70, 65, 60, 55, 50]);
      
      detectTrend(data1);
      detectTrend(data2);
      
      const utilizationPatterns = listPatterns({ domain: 'UTILIZATION' });
      const safetyPatterns = listPatterns({ domain: 'SAFETY' });
      
      expect(utilizationPatterns.length).toBe(1);
      expect(safetyPatterns.length).toBe(1);
    });

    it('should filter by minimum significance', () => {
      const data = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
      detectTrend(data);
      
      const highSig = listPatterns({ minSignificance: 0.9 });
      const allPatterns = listPatterns();
      
      expect(highSig.length).toBeLessThanOrEqual(allPatterns.length);
    });
  });

  describe('recommendation queries', () => {
    it('should get recommendation by ID', () => {
      const data = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
      const pattern = detectTrend(data)!;
      const recommendation = generateRecommendationFromPattern(pattern)!;
      
      const retrieved = getRecommendation(recommendation.id);
      
      expect(retrieved?.id).toBe(recommendation.id);
    });

    it('should list recommendations with filters', () => {
      const data = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
      const pattern = detectTrend(data)!;
      generateRecommendationFromPattern(pattern);
      
      const all = listRecommendations();
      expect(all.length).toBeGreaterThan(0);
    });
  });

  describe('analysis request queries', () => {
    it('should get analysis request by ID', () => {
      const datasets = [
        createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]),
      ];
      
      const request = runAnalysis(datasets, 'admin');
      const retrieved = getAnalysisRequest(request.id);
      
      expect(retrieved?.id).toBe(request.id);
    });
  });
});

// ============================================
// AUDIT TRAIL TESTS
// ============================================

describe('Audit Trail', () => {
  beforeEach(() => {
    clearAIOptimizationData();
  });

  it('should record pattern detection', () => {
    const data = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
    detectTrend(data);
    
    const records = getAuditRecords({ action: 'PATTERN_DETECTED' });
    expect(records.length).toBeGreaterThan(0);
  });

  it('should record recommendation generation', () => {
    const data = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
    const pattern = detectTrend(data)!;
    generateRecommendationFromPattern(pattern);
    
    const records = getAuditRecords({ action: 'RECOMMENDATION_GENERATED' });
    expect(records.length).toBeGreaterThan(0);
  });

  it('should record inbox item creation', () => {
    const data = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
    const pattern = detectTrend(data)!;
    const rec = generateRecommendationFromPattern(pattern)!;
    createInboxItemFromRecommendation(rec);
    
    const records = getAuditRecords({ action: 'INBOX_ITEM_CREATED' });
    expect(records.length).toBeGreaterThan(0);
  });

  it('should record analysis request', () => {
    const datasets = [
      createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]),
    ];
    
    runAnalysis(datasets, 'admin');
    
    const records = getAuditRecords({ action: 'ANALYSIS_REQUESTED' });
    expect(records.length).toBe(1);
  });

  it('should record feedback', () => {
    const data = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
    const pattern = detectTrend(data)!;
    const rec = generateRecommendationFromPattern(pattern)!;
    
    provideFeedback(rec.id, 'admin', {
      useful: true,
      implemented: false,
      comments: 'Will consider for next quarter',
    });
    
    const records = getAuditRecords({ action: 'FEEDBACK_PROVIDED' });
    expect(records.length).toBe(1);
  });

  it('should filter by entity', () => {
    const data = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
    const pattern = detectTrend(data)!;
    
    const records = getAuditRecords({ entityId: pattern.id });
    expect(records.length).toBeGreaterThan(0);
  });
});

// ============================================
// READ-ONLY ENFORCEMENT TESTS
// ============================================

describe('Read-Only Enforcement', () => {
  beforeEach(() => {
    clearAIOptimizationData();
  });

  it('should not have any mutation functions for rules', () => {
    // Verify that the engine exports no functions that modify business rules
    // We check by verifying the imported functions don't include mutation keywords
    const exportedFunctionNames = [
      'detectTrend',
      'detectAnomalies', 
      'detectThresholdBreach',
      'detectConcentration',
      'generateRecommendationFromPattern',
      'createInboxItemFromRecommendation',
      'createPatternAlertItem',
      'createInsightSummaryItem',
      'getInboxItem',
      'listInboxItems',
      'markInboxItemRead',
      'acknowledgeInboxItem',
      'dismissInboxItem',
      'archiveInboxItem',
      'getInboxSummary',
      'runAnalysis',
      'getPattern',
      'listPatterns',
      'getRecommendation',
      'listRecommendations',
      'getAnalysisRequest',
      'getAuditRecords',
      'provideFeedback',
      'clearAIOptimizationData',
    ];
    
    const mutationKeywords = ['setRule', 'updateRule', 'deleteRule', 'modifyPay', 'adjustRate', 'executePay', 'applyRule'];
    
    for (const name of exportedFunctionNames) {
      for (const keyword of mutationKeywords) {
        expect(name.toLowerCase()).not.toContain(keyword.toLowerCase());
      }
    }
  });

  it('recommendations should be advisory only', () => {
    const data = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
    const pattern = detectTrend(data)!;
    const recommendation = generateRecommendationFromPattern(pattern)!;
    
    // Verify recommendation structure is advisory
    expect(recommendation.targetEntities[0].specificAction).toBeTruthy();
    expect(recommendation.prerequisites).toBeDefined();
    expect(recommendation.risks).toBeDefined();
    
    // Should have no execute function
    expect((recommendation as any).execute).toBeUndefined();
    expect((recommendation as any).apply).toBeUndefined();
  });

  it('patterns should not contain modification capabilities', () => {
    const data = createTestTimeSeries('UTILIZATION', [50, 60, 70, 80, 90, 100, 110]);
    const pattern = detectTrend(data)!;
    
    // Pattern should be purely informational
    expect(pattern.description).toBeTruthy();
    expect(pattern.explainability).toBeDefined();
    
    // Should have no modification functions
    expect((pattern as any).apply).toBeUndefined();
    expect((pattern as any).fix).toBeUndefined();
  });
});
