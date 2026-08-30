/**
 * Anomaly & Drift Detection Engine (INCREMENT 17)
 * 
 * Features:
 * 1. Rolling baselines for pay, minutes, safety, reimbursements by market/zone
 * 2. Deterministic drift detection rules with configurable thresholds
 * 3. AnomalyEvent records with severity and explanations
 * 4. Soft responses only (visibility, override friction)
 * 5. Full auditability and reproducibility
 * 
 * NOT implementing:
 * - ML models
 * - Automatic rule enforcement
 * - Alerting systems
 */

// ============================================
// TYPES & ENUMS
// ============================================

/** Metric types for baseline tracking */
export type MetricType = 
  | 'PAY_PER_MOVE'
  | 'PAY_PER_HOUR'
  | 'MINUTES_PER_MOVE'
  | 'MOVES_PER_DAY'
  | 'SAFETY_INCIDENTS'
  | 'SAFETY_SCORE'
  | 'REIMBURSEMENT_RATE'
  | 'REIMBURSEMENT_AMOUNT'
  | 'OVERTIME_RATIO'
  | 'BONUS_RATIO'
  | 'CLAIMS_RATE'
  | 'UTILIZATION';

/** Anomaly severity levels */
export type AnomalySeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Anomaly detection method */
export type DetectionMethod = 
  | 'THRESHOLD_BREACH'
  | 'PERCENT_DEVIATION'
  | 'STANDARD_DEVIATION'
  | 'TREND_REVERSAL'
  | 'SUDDEN_CHANGE'
  | 'CONSECUTIVE_OUTLIERS';

/** Soft response type */
export type SoftResponseType = 
  | 'VISIBILITY_FLAG'
  | 'OVERRIDE_FRICTION'
  | 'REVIEW_REQUIRED'
  | 'EXPLANATION_REQUIRED'
  | 'MANAGER_ATTENTION';

/** Scope for baselines */
export interface BaselineScope {
  marketId?: string;
  zoneId?: string;
  driverId?: string;
  employeeType?: 'W2' | 'IC';
}

/** Metric data point */
export interface MetricDataPoint {
  timestamp: string;
  value: number;
  scope: BaselineScope;
  metricType: MetricType;
  source?: string;
}

/** Rolling baseline statistics */
export interface RollingBaseline {
  id: string;
  metricType: MetricType;
  scope: BaselineScope;
  windowDays: number;
  dataPoints: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  percentile25: number;
  percentile75: number;
  percentile90: number;
  percentile95: number;
  trend: 'INCREASING' | 'DECREASING' | 'STABLE';
  trendStrength: number;
  lastUpdated: string;
  createdAt: string;
}

/** Detection rule configuration */
export interface DetectionRule {
  id: string;
  name: string;
  description: string;
  metricType: MetricType;
  method: DetectionMethod;
  enabled: boolean;
  thresholds: RuleThresholds;
  severity: AnomalySeverity;
  softResponses: SoftResponseType[];
  scope?: BaselineScope;
}

/** Rule thresholds */
export interface RuleThresholds {
  /** Absolute threshold for breach detection */
  absoluteMin?: number;
  absoluteMax?: number;
  /** Percent deviation from baseline */
  percentDeviationWarning?: number;
  percentDeviationCritical?: number;
  /** Standard deviations from mean */
  stdDevWarning?: number;
  stdDevCritical?: number;
  /** Consecutive outlier count */
  consecutiveOutlierCount?: number;
  /** Minimum change for sudden change detection */
  suddenChangePercent?: number;
}

/** Anomaly event */
export interface AnomalyEvent {
  id: string;
  timestamp: string;
  metricType: MetricType;
  scope: BaselineScope;
  detectedValue: number;
  baselineValue: number;
  deviation: number;
  deviationPercent: number;
  severity: AnomalySeverity;
  method: DetectionMethod;
  ruleId: string;
  ruleName: string;
  explanation: string;
  context: AnomalyContext;
  softResponses: SoftResponse[];
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  notes?: string;
}

/** Context for anomaly */
export interface AnomalyContext {
  baselineStats: {
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
  };
  recentValues: number[];
  historicalRange: { min: number; max: number };
  affectedRecordCount?: number;
  relatedAnomalies?: string[];
}

/** Soft response applied */
export interface SoftResponse {
  type: SoftResponseType;
  appliedAt: string;
  expiresAt?: string;
  targetEntity?: string;
  reason: string;
}

/** Audit record */
export interface AnomalyAuditRecord {
  id: string;
  timestamp: string;
  action: 'BASELINE_CREATED' | 'BASELINE_UPDATED' | 'RULE_CREATED' | 'RULE_UPDATED' | 
          'ANOMALY_DETECTED' | 'ANOMALY_ACKNOWLEDGED' | 'SOFT_RESPONSE_APPLIED' | 
          'SOFT_RESPONSE_EXPIRED' | 'DETECTION_RUN';
  entityType: 'BASELINE' | 'RULE' | 'ANOMALY' | 'SOFT_RESPONSE';
  entityId: string;
  actor: string;
  details: Record<string, unknown>;
  reproducibilityHash?: string;
}

// ============================================
// STORAGE
// ============================================

const baselines: Map<string, RollingBaseline> = new Map();
const metricHistory: Map<string, MetricDataPoint[]> = new Map();
const detectionRules: Map<string, DetectionRule> = new Map();
const anomalyEvents: Map<string, AnomalyEvent> = new Map();
const softResponses: Map<string, SoftResponse[]> = new Map();
const auditLog: AnomalyAuditRecord[] = [];

// ============================================
// UTILITY FUNCTIONS
// ============================================

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getScopeKey(scope: BaselineScope): string {
  const parts: string[] = [];
  if (scope.marketId) parts.push(`m:${scope.marketId}`);
  if (scope.zoneId) parts.push(`z:${scope.zoneId}`);
  if (scope.driverId) parts.push(`d:${scope.driverId}`);
  if (scope.employeeType) parts.push(`e:${scope.employeeType}`);
  return parts.length > 0 ? parts.join('|') : 'global';
}

function getBaselineKey(metricType: MetricType, scope: BaselineScope): string {
  return `${metricType}::${getScopeKey(scope)}`;
}

function calculatePercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  const index = (percentile / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

function calculateStdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

function calculateTrend(values: number[]): { direction: 'INCREASING' | 'DECREASING' | 'STABLE'; strength: number } {
  if (values.length < 3) return { direction: 'STABLE', strength: 0 };
  
  // Simple linear regression
  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const meanY = sumY / n;
  const normalizedSlope = meanY !== 0 ? slope / meanY : 0;
  
  if (Math.abs(normalizedSlope) < 0.01) {
    return { direction: 'STABLE', strength: 0 };
  }
  
  return {
    direction: normalizedSlope > 0 ? 'INCREASING' : 'DECREASING',
    strength: Math.min(Math.abs(normalizedSlope) * 10, 1),
  };
}

function createReproducibilityHash(data: Record<string, unknown>): string {
  const str = JSON.stringify(data, Object.keys(data).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function addAuditRecord(record: Omit<AnomalyAuditRecord, 'id' | 'timestamp'>): void {
  const fullRecord: AnomalyAuditRecord = {
    ...record,
    id: generateId('audit'),
    timestamp: new Date().toISOString(),
    reproducibilityHash: createReproducibilityHash(record.details),
  };
  auditLog.push(fullRecord);
}

// ============================================
// BASELINE MANAGEMENT
// ============================================

/**
 * Add metric data points to history.
 */
export function recordMetricData(dataPoints: MetricDataPoint[]): void {
  for (const point of dataPoints) {
    const key = getBaselineKey(point.metricType, point.scope);
    const existing = metricHistory.get(key) || [];
    existing.push(point);
    metricHistory.set(key, existing);
  }
}

/**
 * Calculate rolling baseline from metric history.
 */
export function calculateBaseline(
  metricType: MetricType,
  scope: BaselineScope,
  windowDays: number = 30
): RollingBaseline {
  const key = getBaselineKey(metricType, scope);
  const history = metricHistory.get(key) || [];
  
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffStr = cutoff.toISOString();
  
  const relevantPoints = history.filter(p => p.timestamp >= cutoffStr);
  const values = relevantPoints.map(p => p.value);
  
  if (values.length === 0) {
    const baseline: RollingBaseline = {
      id: generateId('baseline'),
      metricType,
      scope,
      windowDays,
      dataPoints: 0,
      mean: 0,
      median: 0,
      stdDev: 0,
      min: 0,
      max: 0,
      percentile25: 0,
      percentile75: 0,
      percentile90: 0,
      percentile95: 0,
      trend: 'STABLE',
      trendStrength: 0,
      lastUpdated: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    baselines.set(key, baseline);
    return baseline;
  }
  
  const sortedValues = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const median = calculatePercentile(sortedValues, 50);
  const stdDev = calculateStdDev(values, mean);
  const { direction: trend, strength: trendStrength } = calculateTrend(values);
  
  const existing = baselines.get(key);
  const isUpdate = !!existing;
  
  const baseline: RollingBaseline = {
    id: existing?.id || generateId('baseline'),
    metricType,
    scope,
    windowDays,
    dataPoints: values.length,
    mean,
    median,
    stdDev,
    min: sortedValues[0],
    max: sortedValues[sortedValues.length - 1],
    percentile25: calculatePercentile(sortedValues, 25),
    percentile75: calculatePercentile(sortedValues, 75),
    percentile90: calculatePercentile(sortedValues, 90),
    percentile95: calculatePercentile(sortedValues, 95),
    trend,
    trendStrength,
    lastUpdated: new Date().toISOString(),
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
  
  baselines.set(key, baseline);
  
  addAuditRecord({
    action: isUpdate ? 'BASELINE_UPDATED' : 'BASELINE_CREATED',
    entityType: 'BASELINE',
    entityId: baseline.id,
    actor: 'SYSTEM',
    details: {
      metricType,
      scope,
      windowDays,
      dataPoints: values.length,
      mean,
      stdDev,
    },
  });
  
  return baseline;
}

/**
 * Get baseline for metric and scope.
 */
export function getBaseline(metricType: MetricType, scope: BaselineScope): RollingBaseline | null {
  const key = getBaselineKey(metricType, scope);
  return baselines.get(key) || null;
}

/**
 * Get all baselines.
 */
export function getAllBaselines(): RollingBaseline[] {
  return Array.from(baselines.values());
}

// ============================================
// DETECTION RULES
// ============================================

/** Default detection rules */
const DEFAULT_RULES: Omit<DetectionRule, 'id'>[] = [
  {
    name: 'Pay Per Move Deviation',
    description: 'Detect significant deviation in pay per move from baseline',
    metricType: 'PAY_PER_MOVE',
    method: 'PERCENT_DEVIATION',
    enabled: true,
    thresholds: { percentDeviationWarning: 20, percentDeviationCritical: 50 },
    severity: 'MEDIUM',
    softResponses: ['VISIBILITY_FLAG', 'REVIEW_REQUIRED'],
  },
  {
    name: 'Pay Per Hour Threshold',
    description: 'Detect pay per hour outside acceptable range',
    metricType: 'PAY_PER_HOUR',
    method: 'THRESHOLD_BREACH',
    enabled: true,
    thresholds: { absoluteMin: 1500, absoluteMax: 10000 }, // $15-$100/hr in cents
    severity: 'HIGH',
    softResponses: ['VISIBILITY_FLAG', 'OVERRIDE_FRICTION', 'EXPLANATION_REQUIRED'],
  },
  {
    name: 'Minutes Per Move Outlier',
    description: 'Detect unusual time per move using standard deviation',
    metricType: 'MINUTES_PER_MOVE',
    method: 'STANDARD_DEVIATION',
    enabled: true,
    thresholds: { stdDevWarning: 2, stdDevCritical: 3 },
    severity: 'LOW',
    softResponses: ['VISIBILITY_FLAG'],
  },
  {
    name: 'Safety Incidents Spike',
    description: 'Detect sudden increase in safety incidents',
    metricType: 'SAFETY_INCIDENTS',
    method: 'SUDDEN_CHANGE',
    enabled: true,
    thresholds: { suddenChangePercent: 50 },
    severity: 'HIGH',
    softResponses: ['VISIBILITY_FLAG', 'MANAGER_ATTENTION'],
  },
  {
    name: 'Reimbursement Rate Outlier',
    description: 'Detect unusual reimbursement rates',
    metricType: 'REIMBURSEMENT_RATE',
    method: 'PERCENT_DEVIATION',
    enabled: true,
    thresholds: { percentDeviationWarning: 30, percentDeviationCritical: 75 },
    severity: 'MEDIUM',
    softResponses: ['VISIBILITY_FLAG', 'REVIEW_REQUIRED'],
  },
  {
    name: 'Overtime Ratio High',
    description: 'Detect excessive overtime ratios',
    metricType: 'OVERTIME_RATIO',
    method: 'THRESHOLD_BREACH',
    enabled: true,
    thresholds: { absoluteMax: 0.25 }, // 25% max
    severity: 'MEDIUM',
    softResponses: ['VISIBILITY_FLAG', 'REVIEW_REQUIRED'],
  },
  {
    name: 'Claims Rate Critical',
    description: 'Detect critical claims rate thresholds',
    metricType: 'CLAIMS_RATE',
    method: 'THRESHOLD_BREACH',
    enabled: true,
    thresholds: { absoluteMax: 0.05 }, // 5% max
    severity: 'CRITICAL',
    softResponses: ['VISIBILITY_FLAG', 'OVERRIDE_FRICTION', 'MANAGER_ATTENTION'],
  },
  {
    name: 'Utilization Drop',
    description: 'Detect significant drops in utilization',
    metricType: 'UTILIZATION',
    method: 'TREND_REVERSAL',
    enabled: true,
    thresholds: { percentDeviationCritical: 30 },
    severity: 'MEDIUM',
    softResponses: ['VISIBILITY_FLAG'],
  },
];

/**
 * Initialize default detection rules.
 */
export function initializeDefaultRules(): void {
  for (const ruleDef of DEFAULT_RULES) {
    const id = generateId('rule');
    const rule: DetectionRule = { ...ruleDef, id };
    detectionRules.set(id, rule);
    
    addAuditRecord({
      action: 'RULE_CREATED',
      entityType: 'RULE',
      entityId: id,
      actor: 'SYSTEM',
      details: { name: rule.name, metricType: rule.metricType },
    });
  }
}

/**
 * Create or update detection rule.
 */
export function upsertRule(rule: Omit<DetectionRule, 'id'> & { id?: string }): DetectionRule {
  const id = rule.id || generateId('rule');
  const isUpdate = detectionRules.has(id);
  
  const fullRule: DetectionRule = { ...rule, id };
  detectionRules.set(id, fullRule);
  
  addAuditRecord({
    action: isUpdate ? 'RULE_UPDATED' : 'RULE_CREATED',
    entityType: 'RULE',
    entityId: id,
    actor: 'SYSTEM',
    details: { name: fullRule.name, enabled: fullRule.enabled },
  });
  
  return fullRule;
}

/**
 * Get detection rule by ID.
 */
export function getRule(ruleId: string): DetectionRule | null {
  return detectionRules.get(ruleId) || null;
}

/**
 * Get all detection rules.
 */
export function getAllRules(): DetectionRule[] {
  return Array.from(detectionRules.values());
}

/**
 * Enable/disable a rule.
 */
export function setRuleEnabled(ruleId: string, enabled: boolean): boolean {
  const rule = detectionRules.get(ruleId);
  if (!rule) return false;
  
  rule.enabled = enabled;
  detectionRules.set(ruleId, rule);
  
  addAuditRecord({
    action: 'RULE_UPDATED',
    entityType: 'RULE',
    entityId: ruleId,
    actor: 'SYSTEM',
    details: { enabled },
  });
  
  return true;
}

// ============================================
// ANOMALY DETECTION
// ============================================

/**
 * Run detection for a single rule against a value.
 */
export function detectAnomaly(
  rule: DetectionRule,
  currentValue: number,
  baseline: RollingBaseline | null,
  scope: BaselineScope,
  recentValues: number[] = []
): AnomalyEvent | null {
  if (!rule.enabled) return null;
  
  const { thresholds, method } = rule;
  let isAnomaly = false;
  let severity = rule.severity;
  let deviation = 0;
  let deviationPercent = 0;
  let explanation = '';
  
  const baselineValue = baseline?.mean || 0;
  
  switch (method) {
    case 'THRESHOLD_BREACH': {
      if (thresholds.absoluteMin !== undefined && currentValue < thresholds.absoluteMin) {
        isAnomaly = true;
        deviation = thresholds.absoluteMin - currentValue;
        deviationPercent = thresholds.absoluteMin !== 0 ? (deviation / thresholds.absoluteMin) * 100 : 100;
        explanation = `Value ${currentValue} is below minimum threshold ${thresholds.absoluteMin}`;
      } else if (thresholds.absoluteMax !== undefined && currentValue > thresholds.absoluteMax) {
        isAnomaly = true;
        deviation = currentValue - thresholds.absoluteMax;
        deviationPercent = thresholds.absoluteMax !== 0 ? (deviation / thresholds.absoluteMax) * 100 : 100;
        explanation = `Value ${currentValue} exceeds maximum threshold ${thresholds.absoluteMax}`;
        severity = 'CRITICAL';
      }
      break;
    }
    
    case 'PERCENT_DEVIATION': {
      if (!baseline || baseline.dataPoints === 0) break;
      
      deviation = Math.abs(currentValue - baselineValue);
      deviationPercent = baselineValue !== 0 ? (deviation / baselineValue) * 100 : 0;
      
      if (thresholds.percentDeviationCritical && deviationPercent >= thresholds.percentDeviationCritical) {
        isAnomaly = true;
        severity = 'CRITICAL';
        explanation = `Value deviates ${deviationPercent.toFixed(1)}% from baseline (critical threshold: ${thresholds.percentDeviationCritical}%)`;
      } else if (thresholds.percentDeviationWarning && deviationPercent >= thresholds.percentDeviationWarning) {
        isAnomaly = true;
        explanation = `Value deviates ${deviationPercent.toFixed(1)}% from baseline (warning threshold: ${thresholds.percentDeviationWarning}%)`;
      }
      break;
    }
    
    case 'STANDARD_DEVIATION': {
      if (!baseline || baseline.stdDev === 0) break;
      
      const zScore = Math.abs(currentValue - baselineValue) / baseline.stdDev;
      deviation = currentValue - baselineValue;
      deviationPercent = baselineValue !== 0 ? (deviation / baselineValue) * 100 : 0;
      
      if (thresholds.stdDevCritical && zScore >= thresholds.stdDevCritical) {
        isAnomaly = true;
        severity = 'CRITICAL';
        explanation = `Value is ${zScore.toFixed(2)} standard deviations from mean (critical: ${thresholds.stdDevCritical})`;
      } else if (thresholds.stdDevWarning && zScore >= thresholds.stdDevWarning) {
        isAnomaly = true;
        explanation = `Value is ${zScore.toFixed(2)} standard deviations from mean (warning: ${thresholds.stdDevWarning})`;
      }
      break;
    }
    
    case 'SUDDEN_CHANGE': {
      if (recentValues.length < 2) break;
      
      const previousValue = recentValues[recentValues.length - 2];
      deviation = currentValue - previousValue;
      deviationPercent = previousValue !== 0 ? (deviation / previousValue) * 100 : 0;
      
      if (thresholds.suddenChangePercent && Math.abs(deviationPercent) >= thresholds.suddenChangePercent) {
        isAnomaly = true;
        explanation = `Sudden ${deviationPercent > 0 ? 'increase' : 'decrease'} of ${Math.abs(deviationPercent).toFixed(1)}% from previous value`;
      }
      break;
    }
    
    case 'CONSECUTIVE_OUTLIERS': {
      if (!baseline || recentValues.length < (thresholds.consecutiveOutlierCount || 3)) break;
      
      const count = thresholds.consecutiveOutlierCount || 3;
      const lastN = recentValues.slice(-count);
      const outlierThreshold = baseline.stdDev * 2;
      
      const allOutliers = lastN.every(v => Math.abs(v - baselineValue) > outlierThreshold);
      
      if (allOutliers) {
        isAnomaly = true;
        deviation = currentValue - baselineValue;
        deviationPercent = baselineValue !== 0 ? (deviation / baselineValue) * 100 : 0;
        explanation = `${count} consecutive values outside normal range`;
      }
      break;
    }
    
    case 'TREND_REVERSAL': {
      if (!baseline || baseline.trend === 'STABLE') break;
      
      const recentTrend = calculateTrend(recentValues.slice(-5));
      
      if (baseline.trend !== recentTrend.direction && recentTrend.direction !== 'STABLE') {
        if (thresholds.percentDeviationCritical && baseline.trendStrength >= thresholds.percentDeviationCritical / 100) {
          isAnomaly = true;
          deviation = currentValue - baselineValue;
          deviationPercent = baselineValue !== 0 ? (deviation / baselineValue) * 100 : 0;
          explanation = `Trend reversed from ${baseline.trend} to ${recentTrend.direction}`;
        }
      }
      break;
    }
  }
  
  if (!isAnomaly) return null;
  
  const event: AnomalyEvent = {
    id: generateId('anomaly'),
    timestamp: new Date().toISOString(),
    metricType: rule.metricType,
    scope,
    detectedValue: currentValue,
    baselineValue,
    deviation,
    deviationPercent,
    severity,
    method,
    ruleId: rule.id,
    ruleName: rule.name,
    explanation,
    context: {
      baselineStats: baseline ? {
        mean: baseline.mean,
        median: baseline.median,
        stdDev: baseline.stdDev,
        min: baseline.min,
        max: baseline.max,
      } : { mean: 0, median: 0, stdDev: 0, min: 0, max: 0 },
      recentValues: recentValues.slice(-10),
      historicalRange: baseline ? { min: baseline.min, max: baseline.max } : { min: 0, max: 0 },
    },
    softResponses: rule.softResponses.map(type => ({
      type,
      appliedAt: new Date().toISOString(),
      reason: explanation,
    })),
    acknowledged: false,
  };
  
  anomalyEvents.set(event.id, event);
  
  addAuditRecord({
    action: 'ANOMALY_DETECTED',
    entityType: 'ANOMALY',
    entityId: event.id,
    actor: 'SYSTEM',
    details: {
      metricType: event.metricType,
      scope,
      severity,
      detectedValue: currentValue,
      baselineValue,
      deviationPercent,
      ruleId: rule.id,
    },
  });
  
  return event;
}

/**
 * Run all detection rules for a metric type and scope.
 */
export function runDetection(
  metricType: MetricType,
  currentValue: number,
  scope: BaselineScope,
  recentValues: number[] = []
): AnomalyEvent[] {
  const events: AnomalyEvent[] = [];
  const baseline = getBaseline(metricType, scope);
  
  const applicableRules = Array.from(detectionRules.values()).filter(
    r => r.enabled && r.metricType === metricType
  );
  
  for (const rule of applicableRules) {
    // Check if rule scope matches
    if (rule.scope) {
      if (rule.scope.marketId && rule.scope.marketId !== scope.marketId) continue;
      if (rule.scope.zoneId && rule.scope.zoneId !== scope.zoneId) continue;
      if (rule.scope.employeeType && rule.scope.employeeType !== scope.employeeType) continue;
    }
    
    const event = detectAnomaly(rule, currentValue, baseline, scope, recentValues);
    if (event) {
      events.push(event);
    }
  }
  
  addAuditRecord({
    action: 'DETECTION_RUN',
    entityType: 'ANOMALY',
    entityId: generateId('run'),
    actor: 'SYSTEM',
    details: {
      metricType,
      scope,
      currentValue,
      rulesChecked: applicableRules.length,
      anomaliesDetected: events.length,
    },
  });
  
  return events;
}

/**
 * Batch detection for multiple data points.
 */
export function runBatchDetection(dataPoints: MetricDataPoint[]): AnomalyEvent[] {
  const events: AnomalyEvent[] = [];
  
  // Group by metric type and scope
  const groups = new Map<string, MetricDataPoint[]>();
  
  for (const point of dataPoints) {
    const key = getBaselineKey(point.metricType, point.scope);
    const existing = groups.get(key) || [];
    existing.push(point);
    groups.set(key, existing);
  }
  
  // Run detection for each group
  for (const [_key, points] of Array.from(groups.entries())) {
    const sortedPoints = [...points].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const values = sortedPoints.map(p => p.value);
    
    for (let i = 0; i < sortedPoints.length; i++) {
      const point = sortedPoints[i];
      const recentValues = values.slice(0, i + 1);
      const detected = runDetection(point.metricType, point.value, point.scope, recentValues);
      events.push(...detected);
    }
  }
  
  return events;
}

// ============================================
// ANOMALY MANAGEMENT
// ============================================

/**
 * Get anomaly by ID.
 */
export function getAnomaly(anomalyId: string): AnomalyEvent | null {
  return anomalyEvents.get(anomalyId) || null;
}

/**
 * Get all anomalies with optional filters.
 */
export function getAnomalies(filters?: {
  metricType?: MetricType;
  severity?: AnomalySeverity;
  scope?: BaselineScope;
  acknowledged?: boolean;
  startDate?: string;
  endDate?: string;
}): AnomalyEvent[] {
  let results = Array.from(anomalyEvents.values());
  
  if (filters) {
    if (filters.metricType) {
      results = results.filter(e => e.metricType === filters.metricType);
    }
    if (filters.severity) {
      results = results.filter(e => e.severity === filters.severity);
    }
    if (filters.acknowledged !== undefined) {
      results = results.filter(e => e.acknowledged === filters.acknowledged);
    }
    if (filters.startDate) {
      results = results.filter(e => e.timestamp >= filters.startDate!);
    }
    if (filters.endDate) {
      results = results.filter(e => e.timestamp <= filters.endDate!);
    }
    if (filters.scope) {
      results = results.filter(e => {
        if (filters.scope!.marketId && e.scope.marketId !== filters.scope!.marketId) return false;
        if (filters.scope!.zoneId && e.scope.zoneId !== filters.scope!.zoneId) return false;
        if (filters.scope!.driverId && e.scope.driverId !== filters.scope!.driverId) return false;
        return true;
      });
    }
  }
  
  return results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * Acknowledge an anomaly.
 */
export function acknowledgeAnomaly(
  anomalyId: string,
  acknowledgedBy: string,
  notes?: string
): boolean {
  const event = anomalyEvents.get(anomalyId);
  if (!event) return false;
  
  event.acknowledged = true;
  event.acknowledgedBy = acknowledgedBy;
  event.acknowledgedAt = new Date().toISOString();
  event.notes = notes;
  
  anomalyEvents.set(anomalyId, event);
  
  addAuditRecord({
    action: 'ANOMALY_ACKNOWLEDGED',
    entityType: 'ANOMALY',
    entityId: anomalyId,
    actor: acknowledgedBy,
    details: { notes },
  });
  
  return true;
}

// ============================================
// SOFT RESPONSES
// ============================================

/**
 * Get active soft responses for an entity.
 */
export function getActiveSoftResponses(entityKey: string): SoftResponse[] {
  const responses = softResponses.get(entityKey) || [];
  const now = new Date().toISOString();
  return responses.filter(r => !r.expiresAt || r.expiresAt > now);
}

/**
 * Apply a soft response to an entity.
 */
export function applySoftResponse(
  entityKey: string,
  response: Omit<SoftResponse, 'appliedAt'>
): SoftResponse {
  const fullResponse: SoftResponse = {
    ...response,
    appliedAt: new Date().toISOString(),
  };
  
  const existing = softResponses.get(entityKey) || [];
  existing.push(fullResponse);
  softResponses.set(entityKey, existing);
  
  addAuditRecord({
    action: 'SOFT_RESPONSE_APPLIED',
    entityType: 'SOFT_RESPONSE',
    entityId: entityKey,
    actor: 'SYSTEM',
    details: { type: response.type, reason: response.reason },
  });
  
  return fullResponse;
}

/**
 * Check if override friction is active for an entity.
 */
export function hasOverrideFriction(entityKey: string): boolean {
  const responses = getActiveSoftResponses(entityKey);
  return responses.some(r => r.type === 'OVERRIDE_FRICTION');
}

/**
 * Check if review is required for an entity.
 */
export function requiresReview(entityKey: string): boolean {
  const responses = getActiveSoftResponses(entityKey);
  return responses.some(r => r.type === 'REVIEW_REQUIRED');
}

/**
 * Check if manager attention is needed.
 */
export function requiresManagerAttention(entityKey: string): boolean {
  const responses = getActiveSoftResponses(entityKey);
  return responses.some(r => r.type === 'MANAGER_ATTENTION');
}

// ============================================
// AUDIT & REPRODUCIBILITY
// ============================================

/**
 * Get audit records with optional filters.
 */
export function getAuditRecords(filters?: {
  action?: AnomalyAuditRecord['action'];
  entityType?: AnomalyAuditRecord['entityType'];
  entityId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): AnomalyAuditRecord[] {
  let results = [...auditLog];
  
  if (filters) {
    if (filters.action) {
      results = results.filter(r => r.action === filters.action);
    }
    if (filters.entityType) {
      results = results.filter(r => r.entityType === filters.entityType);
    }
    if (filters.entityId) {
      results = results.filter(r => r.entityId === filters.entityId);
    }
    if (filters.startDate) {
      results = results.filter(r => r.timestamp >= filters.startDate!);
    }
    if (filters.endDate) {
      results = results.filter(r => r.timestamp <= filters.endDate!);
    }
  }
  
  results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  
  if (filters?.limit) {
    results = results.slice(0, filters.limit);
  }
  
  return results;
}

/**
 * Reproduce detection from audit record.
 */
export function reproduceDetection(auditRecordId: string): {
  success: boolean;
  originalHash: string;
  reproducedHash: string;
  match: boolean;
} | null {
  const record = auditLog.find(r => r.id === auditRecordId);
  if (!record || record.action !== 'DETECTION_RUN') return null;
  
  const reproducedHash = createReproducibilityHash(record.details);
  
  return {
    success: true,
    originalHash: record.reproducibilityHash || '',
    reproducedHash,
    match: record.reproducibilityHash === reproducedHash,
  };
}

// ============================================
// SUMMARY & REPORTING
// ============================================

/** Anomaly summary */
export interface AnomalySummary {
  totalAnomalies: number;
  unacknowledged: number;
  bySeverity: Record<AnomalySeverity, number>;
  byMetricType: Record<string, number>;
  recentTrend: 'INCREASING' | 'DECREASING' | 'STABLE';
  topAffectedScopes: { scope: string; count: number }[];
}

/**
 * Get summary of anomalies.
 */
export function getAnomalySummary(): AnomalySummary {
  const all = Array.from(anomalyEvents.values());
  
  const bySeverity: Record<AnomalySeverity, number> = {
    INFO: 0,
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };
  
  const byMetricType: Record<string, number> = {};
  const byScope: Record<string, number> = {};
  
  for (const event of all) {
    bySeverity[event.severity]++;
    byMetricType[event.metricType] = (byMetricType[event.metricType] || 0) + 1;
    const scopeKey = getScopeKey(event.scope);
    byScope[scopeKey] = (byScope[scopeKey] || 0) + 1;
  }
  
  const topAffectedScopes = Object.entries(byScope)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([scope, count]) => ({ scope, count }));
  
  // Calculate trend (last 7 days vs previous 7 days)
  const now = new Date();
  const week1End = now.toISOString();
  const week1Start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const week2Start = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  
  const week1Count = all.filter(e => e.timestamp >= week1Start && e.timestamp <= week1End).length;
  const week2Count = all.filter(e => e.timestamp >= week2Start && e.timestamp < week1Start).length;
  
  let recentTrend: 'INCREASING' | 'DECREASING' | 'STABLE' = 'STABLE';
  if (week1Count > week2Count * 1.2) recentTrend = 'INCREASING';
  else if (week1Count < week2Count * 0.8) recentTrend = 'DECREASING';
  
  return {
    totalAnomalies: all.length,
    unacknowledged: all.filter(e => !e.acknowledged).length,
    bySeverity,
    byMetricType,
    recentTrend,
    topAffectedScopes,
  };
}

// ============================================
// CLEANUP
// ============================================

/**
 * Clear all data (for testing).
 */
export function clearAnomalyData(): void {
  baselines.clear();
  metricHistory.clear();
  detectionRules.clear();
  anomalyEvents.clear();
  softResponses.clear();
  auditLog.length = 0;
}
