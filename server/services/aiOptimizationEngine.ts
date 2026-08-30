/**
 * AI-Assisted Optimization & Decision Support Engine (INCREMENT 21)
 * 
 * Features:
 * 1. Analyze historical pay, safety, zone, and utilization data for patterns
 * 2. Generate ranked recommendations with metrics, confidence, and estimated impact
 * 3. Enforce explainability for every recommendation
 * 4. Present results in a read-only executive inbox
 * 5. AI cannot modify rules, pay, or enforcement (read-only advisory)
 * 
 * NOT implementing:
 * - AI auto-execution
 * - Rule changes
 * - Pay adjustments
 */

// ============================================
// TYPES & ENUMS
// ============================================

/** Data domain for analysis */
export type AnalysisDomain = 
  | 'PAY'
  | 'SAFETY'
  | 'UTILIZATION'
  | 'ZONE'
  | 'DRIVER_PERFORMANCE'
  | 'MARKET_EFFICIENCY'
  | 'COST_OPTIMIZATION';

/** Pattern type detected */
export type PatternType = 
  | 'TREND'
  | 'SEASONALITY'
  | 'ANOMALY'
  | 'CORRELATION'
  | 'THRESHOLD_BREACH'
  | 'CONCENTRATION'
  | 'DEGRADATION';

/** Recommendation category */
export type RecommendationCategory = 
  | 'COST_REDUCTION'
  | 'SAFETY_IMPROVEMENT'
  | 'UTILIZATION_OPTIMIZATION'
  | 'MARKET_EXPANSION'
  | 'DRIVER_RETENTION'
  | 'OPERATIONAL_EFFICIENCY'
  | 'RISK_MITIGATION';

/** Confidence level */
export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

/** Priority level */
export type PriorityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

/** Inbox item status */
export type InboxItemStatus = 'UNREAD' | 'READ' | 'ACKNOWLEDGED' | 'DISMISSED' | 'ARCHIVED';

/** Data point for analysis */
export interface DataPoint {
  timestamp: string;
  value: number;
  metadata?: Record<string, unknown>;
}

/** Time series data */
export interface TimeSeriesData {
  domain: AnalysisDomain;
  entityId: string;
  entityType: 'DRIVER' | 'MARKET' | 'ZONE' | 'COMPANY';
  dataPoints: DataPoint[];
  startDate: string;
  endDate: string;
}

/** Detected pattern */
export interface DetectedPattern {
  id: string;
  domain: AnalysisDomain;
  patternType: PatternType;
  entityId: string;
  entityType: string;
  description: string;
  startDate: string;
  endDate: string;
  magnitude: number;
  significance: number;
  dataPoints: DataPoint[];
  explainability: PatternExplainability;
  detectedAt: string;
}

/** Pattern explainability */
export interface PatternExplainability {
  summary: string;
  factors: ExplainabilityFactor[];
  methodology: string;
  dataQuality: 'HIGH' | 'MEDIUM' | 'LOW';
  limitations: string[];
}

/** Explainability factor */
export interface ExplainabilityFactor {
  name: string;
  contribution: number;
  direction: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  description: string;
}

/** AI recommendation */
export interface AIRecommendation {
  id: string;
  category: RecommendationCategory;
  title: string;
  description: string;
  priority: PriorityLevel;
  confidence: ConfidenceLevel;
  confidenceScore: number;
  estimatedImpact: ImpactEstimate;
  explainability: RecommendationExplainability;
  supportingPatterns: string[];
  targetEntities: TargetEntity[];
  timeframe: string;
  prerequisites: string[];
  risks: string[];
  createdAt: string;
  expiresAt?: string;
}

/** Impact estimate */
export interface ImpactEstimate {
  metric: string;
  currentValue: number;
  projectedValue: number;
  changePercent: number;
  monetaryImpact?: number;
  timeToRealize: string;
  confidenceRange: { low: number; high: number };
}

/** Recommendation explainability */
export interface RecommendationExplainability {
  reasoning: string;
  dataSourcesSummary: string;
  analysisMethodology: string;
  keyAssumptions: string[];
  alternativesConsidered: AlternativeOption[];
  sensitivityFactors: SensitivityFactor[];
  auditTrail: ExplainabilityAuditEntry[];
}

/** Alternative option considered */
export interface AlternativeOption {
  description: string;
  whyNotChosen: string;
  impactComparison: string;
}

/** Sensitivity factor */
export interface SensitivityFactor {
  factor: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
}

/** Explainability audit entry */
export interface ExplainabilityAuditEntry {
  step: string;
  input: string;
  output: string;
  timestamp: string;
}

/** Target entity for recommendation */
export interface TargetEntity {
  entityId: string;
  entityType: 'DRIVER' | 'MARKET' | 'ZONE' | 'POLICY';
  entityName: string;
  specificAction?: string;
}

/** Executive inbox item */
export interface ExecutiveInboxItem {
  id: string;
  type: 'RECOMMENDATION' | 'PATTERN_ALERT' | 'INSIGHT' | 'SUMMARY';
  title: string;
  summary: string;
  priority: PriorityLevel;
  status: InboxItemStatus;
  recommendation?: AIRecommendation;
  patterns?: DetectedPattern[];
  receivedAt: string;
  readAt?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  notes?: string;
}

/** Analysis request */
export interface AnalysisRequest {
  id: string;
  domains: AnalysisDomain[];
  entityFilter?: { entityType: string; entityIds?: string[] };
  dateRange: { startDate: string; endDate: string };
  requestedBy: string;
  requestedAt: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  completedAt?: string;
  resultSummary?: AnalysisSummary;
}

/** Analysis summary */
export interface AnalysisSummary {
  patternsDetected: number;
  recommendationsGenerated: number;
  topPriority: PriorityLevel;
  domains: AnalysisDomain[];
  keyFindings: string[];
  executiveSummary: string;
}

/** Audit record */
export interface AIOptimizationAuditRecord {
  id: string;
  timestamp: string;
  action: 'ANALYSIS_REQUESTED' | 'PATTERN_DETECTED' | 'RECOMMENDATION_GENERATED' |
          'INBOX_ITEM_CREATED' | 'INBOX_ITEM_READ' | 'INBOX_ITEM_ACKNOWLEDGED' |
          'RECOMMENDATION_DISMISSED' | 'FEEDBACK_PROVIDED';
  entityType: 'ANALYSIS' | 'PATTERN' | 'RECOMMENDATION' | 'INBOX_ITEM';
  entityId: string;
  actor: string;
  details: Record<string, unknown>;
}

// ============================================
// STORAGE
// ============================================

const patterns: Map<string, DetectedPattern> = new Map();
const recommendations: Map<string, AIRecommendation> = new Map();
const inboxItems: Map<string, ExecutiveInboxItem> = new Map();
const analysisRequests: Map<string, AnalysisRequest> = new Map();
const auditLog: AIOptimizationAuditRecord[] = [];

// ============================================
// UTILITY FUNCTIONS
// ============================================

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function addAuditRecord(record: Omit<AIOptimizationAuditRecord, 'id' | 'timestamp'>): void {
  const fullRecord: AIOptimizationAuditRecord = {
    ...record,
    id: generateId('audit'),
    timestamp: new Date().toISOString(),
  };
  auditLog.push(fullRecord);
}

function calculateConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.85) return 'VERY_HIGH';
  if (score >= 0.70) return 'HIGH';
  if (score >= 0.50) return 'MEDIUM';
  return 'LOW';
}

function calculatePriority(
  impactMagnitude: number,
  confidence: number,
  urgency: number
): PriorityLevel {
  const score = impactMagnitude * 0.4 + confidence * 0.3 + urgency * 0.3;
  if (score >= 0.80) return 'URGENT';
  if (score >= 0.60) return 'HIGH';
  if (score >= 0.40) return 'MEDIUM';
  return 'LOW';
}

// ============================================
// PATTERN DETECTION
// ============================================

/**
 * Analyze time series data for trends.
 */
export function detectTrend(data: TimeSeriesData): DetectedPattern | null {
  if (data.dataPoints.length < 3) return null;
  
  const values = data.dataPoints.map(d => d.value);
  const n = values.length;
  
  // Simple linear regression
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (values[i] - yMean);
    denominator += (i - xMean) ** 2;
  }
  
  const slope = denominator !== 0 ? numerator / denominator : 0;
  const slopePercent = yMean !== 0 ? (slope / yMean) * 100 : 0;
  
  // Only report significant trends
  if (Math.abs(slopePercent) < 2) return null;
  
  const direction = slope > 0 ? 'increasing' : 'decreasing';
  const magnitude = Math.abs(slopePercent);
  
  // Calculate R-squared for significance
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = yMean + slope * (i - xMean);
    ssRes += (values[i] - predicted) ** 2;
    ssTot += (values[i] - yMean) ** 2;
  }
  const rSquared = ssTot !== 0 ? 1 - (ssRes / ssTot) : 0;
  
  const pattern: DetectedPattern = {
    id: generateId('pattern'),
    domain: data.domain,
    patternType: 'TREND',
    entityId: data.entityId,
    entityType: data.entityType,
    description: `${direction} trend of ${magnitude.toFixed(1)}% detected in ${data.domain.toLowerCase()} data`,
    startDate: data.startDate,
    endDate: data.endDate,
    magnitude,
    significance: rSquared,
    dataPoints: data.dataPoints,
    explainability: {
      summary: `Linear regression analysis detected a ${direction} trend with ${(rSquared * 100).toFixed(0)}% confidence`,
      factors: [
        {
          name: 'Slope',
          contribution: magnitude,
          direction: slope > 0 ? 'POSITIVE' : 'NEGATIVE',
          description: `Average change of ${slope.toFixed(2)} per period`,
        },
      ],
      methodology: 'Ordinary least squares linear regression',
      dataQuality: n >= 10 ? 'HIGH' : n >= 5 ? 'MEDIUM' : 'LOW',
      limitations: [
        'Assumes linear relationship',
        `Based on ${n} data points`,
      ],
    },
    detectedAt: new Date().toISOString(),
  };
  
  patterns.set(pattern.id, pattern);
  
  addAuditRecord({
    action: 'PATTERN_DETECTED',
    entityType: 'PATTERN',
    entityId: pattern.id,
    actor: 'SYSTEM',
    details: { patternType: 'TREND', magnitude, significance: rSquared },
  });
  
  return pattern;
}

/**
 * Detect anomalies in data.
 */
export function detectAnomalies(
  data: TimeSeriesData,
  stdDevThreshold: number = 2.0
): DetectedPattern[] {
  if (data.dataPoints.length < 5) return [];
  
  const values = data.dataPoints.map(d => d.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  
  const anomalies: DetectedPattern[] = [];
  
  for (let i = 0; i < data.dataPoints.length; i++) {
    const point = data.dataPoints[i];
    const zScore = stdDev !== 0 ? (point.value - mean) / stdDev : 0;
    
    if (Math.abs(zScore) >= stdDevThreshold) {
      const direction = zScore > 0 ? 'above' : 'below';
      
      const pattern: DetectedPattern = {
        id: generateId('pattern'),
        domain: data.domain,
        patternType: 'ANOMALY',
        entityId: data.entityId,
        entityType: data.entityType,
        description: `Anomaly detected: value ${Math.abs(zScore).toFixed(1)} standard deviations ${direction} mean`,
        startDate: point.timestamp,
        endDate: point.timestamp,
        magnitude: Math.abs(zScore),
        significance: Math.min(1, Math.abs(zScore) / 4),
        dataPoints: [point],
        explainability: {
          summary: `Statistical outlier detected using z-score analysis`,
          factors: [
            {
              name: 'Z-Score',
              contribution: Math.abs(zScore),
              direction: zScore > 0 ? 'POSITIVE' : 'NEGATIVE',
              description: `Value is ${Math.abs(zScore).toFixed(1)}σ from the mean of ${mean.toFixed(2)}`,
            },
          ],
          methodology: 'Z-score outlier detection',
          dataQuality: values.length >= 20 ? 'HIGH' : 'MEDIUM',
          limitations: [
            'Assumes normal distribution',
            'Sensitive to sample size',
          ],
        },
        detectedAt: new Date().toISOString(),
      };
      
      patterns.set(pattern.id, pattern);
      anomalies.push(pattern);
      
      addAuditRecord({
        action: 'PATTERN_DETECTED',
        entityType: 'PATTERN',
        entityId: pattern.id,
        actor: 'SYSTEM',
        details: { patternType: 'ANOMALY', zScore, value: point.value },
      });
    }
  }
  
  return anomalies;
}

/**
 * Detect threshold breaches.
 */
export function detectThresholdBreach(
  data: TimeSeriesData,
  threshold: number,
  operator: 'GT' | 'LT' | 'GTE' | 'LTE'
): DetectedPattern | null {
  const breaches = data.dataPoints.filter(dp => {
    switch (operator) {
      case 'GT': return dp.value > threshold;
      case 'LT': return dp.value < threshold;
      case 'GTE': return dp.value >= threshold;
      case 'LTE': return dp.value <= threshold;
    }
  });
  
  if (breaches.length === 0) return null;
  
  const breachRate = breaches.length / data.dataPoints.length;
  const operatorText = operator === 'GT' ? 'above' : operator === 'LT' ? 'below' : 
                       operator === 'GTE' ? 'at or above' : 'at or below';
  
  const pattern: DetectedPattern = {
    id: generateId('pattern'),
    domain: data.domain,
    patternType: 'THRESHOLD_BREACH',
    entityId: data.entityId,
    entityType: data.entityType,
    description: `Threshold breach: ${(breachRate * 100).toFixed(0)}% of values ${operatorText} ${threshold}`,
    startDate: data.startDate,
    endDate: data.endDate,
    magnitude: breachRate * 100,
    significance: breachRate,
    dataPoints: breaches,
    explainability: {
      summary: `${breaches.length} of ${data.dataPoints.length} values breached threshold`,
      factors: [
        {
          name: 'Breach Rate',
          contribution: breachRate,
          direction: 'NEGATIVE',
          description: `${(breachRate * 100).toFixed(1)}% of observations exceeded threshold`,
        },
      ],
      methodology: 'Threshold comparison analysis',
      dataQuality: 'HIGH',
      limitations: [
        'Static threshold may not account for seasonality',
      ],
    },
    detectedAt: new Date().toISOString(),
  };
  
  patterns.set(pattern.id, pattern);
  
  addAuditRecord({
    action: 'PATTERN_DETECTED',
    entityType: 'PATTERN',
    entityId: pattern.id,
    actor: 'SYSTEM',
    details: { patternType: 'THRESHOLD_BREACH', threshold, breachRate },
  });
  
  return pattern;
}

/**
 * Detect concentration risk.
 */
export function detectConcentration(
  values: { entityId: string; value: number }[],
  domain: AnalysisDomain
): DetectedPattern | null {
  if (values.length < 2) return null;
  
  const total = values.reduce((sum, v) => sum + v.value, 0);
  if (total === 0) return null;
  
  const shares = values.map(v => ({ ...v, share: v.value / total }));
  shares.sort((a, b) => b.share - a.share);
  
  // Calculate Herfindahl-Hirschman Index (HHI)
  const hhi = shares.reduce((sum, v) => sum + (v.share * 100) ** 2, 0);
  
  // HHI > 2500 indicates high concentration
  // HHI > 2500 indicates high concentration per DOJ/FTC guidelines
  if (hhi < 2500) return null;
  
  const topEntity = shares[0];
  const top3Share = shares.slice(0, 3).reduce((sum, v) => sum + v.share, 0);
  
  const pattern: DetectedPattern = {
    id: generateId('pattern'),
    domain,
    patternType: 'CONCENTRATION',
    entityId: topEntity.entityId,
    entityType: 'MARKET',
    description: `Concentration risk: Top entity holds ${(topEntity.share * 100).toFixed(1)}% share (HHI: ${hhi.toFixed(0)})`,
    startDate: new Date().toISOString(),
    endDate: new Date().toISOString(),
    magnitude: topEntity.share * 100,
    significance: Math.min(1, hhi / 5000),
    dataPoints: shares.map(s => ({ 
      timestamp: new Date().toISOString(), 
      value: s.share * 100,
      metadata: { entityId: s.entityId },
    })),
    explainability: {
      summary: `Market concentration analysis using HHI index`,
      factors: [
        {
          name: 'HHI Index',
          contribution: hhi,
          direction: hhi > 2500 ? 'NEGATIVE' : 'NEUTRAL',
          description: `HHI of ${hhi.toFixed(0)} indicates ${hhi > 2500 ? 'high' : hhi > 1500 ? 'moderate' : 'low'} concentration`,
        },
        {
          name: 'Top 3 Share',
          contribution: top3Share * 100,
          direction: top3Share > 0.7 ? 'NEGATIVE' : 'NEUTRAL',
          description: `Top 3 entities control ${(top3Share * 100).toFixed(1)}% of total`,
        },
      ],
      methodology: 'Herfindahl-Hirschman Index calculation',
      dataQuality: 'HIGH',
      limitations: [
        'Point-in-time snapshot',
        'Does not account for market dynamics',
      ],
    },
    detectedAt: new Date().toISOString(),
  };
  
  patterns.set(pattern.id, pattern);
  
  addAuditRecord({
    action: 'PATTERN_DETECTED',
    entityType: 'PATTERN',
    entityId: pattern.id,
    actor: 'SYSTEM',
    details: { patternType: 'CONCENTRATION', hhi, topShare: topEntity.share },
  });
  
  return pattern;
}

// ============================================
// RECOMMENDATION GENERATION
// ============================================

/** Recommendation template */
interface RecommendationTemplate {
  category: RecommendationCategory;
  titleTemplate: string;
  descriptionTemplate: string;
  applicablePatterns: PatternType[];
  domains: AnalysisDomain[];
  impactMetric: string;
}

const RECOMMENDATION_TEMPLATES: RecommendationTemplate[] = [
  {
    category: 'COST_REDUCTION',
    titleTemplate: 'Optimize labor costs in {entity}',
    descriptionTemplate: 'Historical analysis shows opportunity to reduce labor costs by {impact}% through schedule optimization',
    applicablePatterns: ['TREND', 'ANOMALY'],
    domains: ['PAY', 'UTILIZATION'],
    impactMetric: 'LABOR_COST',
  },
  {
    category: 'SAFETY_IMPROVEMENT',
    titleTemplate: 'Address safety concerns in {entity}',
    descriptionTemplate: 'Pattern analysis indicates elevated safety risk requiring attention',
    applicablePatterns: ['TREND', 'THRESHOLD_BREACH', 'DEGRADATION'],
    domains: ['SAFETY'],
    impactMetric: 'INCIDENT_RATE',
  },
  {
    category: 'UTILIZATION_OPTIMIZATION',
    titleTemplate: 'Improve utilization in {entity}',
    descriptionTemplate: 'Utilization analysis shows potential for {impact}% improvement through better scheduling',
    applicablePatterns: ['TREND', 'ANOMALY'],
    domains: ['UTILIZATION'],
    impactMetric: 'UTILIZATION_RATE',
  },
  {
    category: 'RISK_MITIGATION',
    titleTemplate: 'Reduce concentration risk',
    descriptionTemplate: 'Diversification recommended to reduce dependency on top {count} entities',
    applicablePatterns: ['CONCENTRATION'],
    domains: ['PAY', 'UTILIZATION', 'ZONE'],
    impactMetric: 'CONCENTRATION_INDEX',
  },
  {
    category: 'DRIVER_RETENTION',
    titleTemplate: 'Improve driver retention in {entity}',
    descriptionTemplate: 'Analysis suggests retention improvements could reduce turnover by {impact}%',
    applicablePatterns: ['TREND', 'DEGRADATION'],
    domains: ['DRIVER_PERFORMANCE', 'PAY'],
    impactMetric: 'TURNOVER_RATE',
  },
  {
    category: 'OPERATIONAL_EFFICIENCY',
    titleTemplate: 'Enhance operational efficiency in {entity}',
    descriptionTemplate: 'Identified opportunity for {impact}% efficiency gain through process optimization',
    applicablePatterns: ['TREND', 'ANOMALY', 'THRESHOLD_BREACH'],
    domains: ['MARKET_EFFICIENCY', 'UTILIZATION'],
    impactMetric: 'EFFICIENCY_SCORE',
  },
];

/**
 * Generate recommendation from pattern.
 */
export function generateRecommendationFromPattern(
  pattern: DetectedPattern,
  additionalContext?: Record<string, unknown>
): AIRecommendation | null {
  // Find applicable template
  const template = RECOMMENDATION_TEMPLATES.find(
    t => t.applicablePatterns.includes(pattern.patternType) && 
         t.domains.includes(pattern.domain)
  );
  
  if (!template) return null;
  
  const estimatedImpact = calculateEstimatedImpact(pattern, template);
  const confidenceScore = pattern.significance * 0.7 + 0.3;
  const urgency = pattern.patternType === 'THRESHOLD_BREACH' ? 0.9 : 
                  pattern.patternType === 'ANOMALY' ? 0.7 : 0.5;
  
  const recommendation: AIRecommendation = {
    id: generateId('rec'),
    category: template.category,
    title: template.titleTemplate.replace('{entity}', pattern.entityId),
    description: template.descriptionTemplate
      .replace('{entity}', pattern.entityId)
      .replace('{impact}', estimatedImpact.changePercent.toFixed(1))
      .replace('{count}', '3'),
    priority: calculatePriority(pattern.magnitude / 100, confidenceScore, urgency),
    confidence: calculateConfidenceLevel(confidenceScore),
    confidenceScore,
    estimatedImpact,
    explainability: {
      reasoning: generateReasoning(pattern, template),
      dataSourcesSummary: `Analysis based on ${pattern.dataPoints.length} data points from ${pattern.startDate} to ${pattern.endDate}`,
      analysisMethodology: pattern.explainability.methodology,
      keyAssumptions: [
        'Historical patterns will continue',
        'No major external disruptions',
        'Implementation is feasible within timeframe',
      ],
      alternativesConsidered: [
        {
          description: 'No action',
          whyNotChosen: 'Continued degradation expected',
          impactComparison: 'No improvement vs projected gain',
        },
      ],
      sensitivityFactors: [
        {
          factor: 'Market conditions',
          impact: 'MEDIUM',
          description: 'External market changes could affect outcome',
        },
        {
          factor: 'Implementation timing',
          impact: 'HIGH',
          description: 'Faster implementation increases benefit',
        },
      ],
      auditTrail: [
        {
          step: 'Pattern Detection',
          input: `${pattern.dataPoints.length} data points`,
          output: `${pattern.patternType} pattern detected`,
          timestamp: pattern.detectedAt,
        },
        {
          step: 'Recommendation Generation',
          input: `Pattern ID: ${pattern.id}`,
          output: `Recommendation category: ${template.category}`,
          timestamp: new Date().toISOString(),
        },
      ],
    },
    supportingPatterns: [pattern.id],
    targetEntities: [
      {
        entityId: pattern.entityId,
        entityType: pattern.entityType as 'DRIVER' | 'MARKET' | 'ZONE' | 'POLICY',
        entityName: pattern.entityId,
        specificAction: `Address ${pattern.patternType.toLowerCase()} in ${pattern.domain.toLowerCase()}`,
      },
    ],
    timeframe: estimatedImpact.timeToRealize,
    prerequisites: [
      'Review supporting data',
      'Validate assumptions',
      'Assess resource requirements',
    ],
    risks: [
      'Implementation complexity',
      'Resource constraints',
      'External factors beyond control',
    ],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
  
  recommendations.set(recommendation.id, recommendation);
  
  addAuditRecord({
    action: 'RECOMMENDATION_GENERATED',
    entityType: 'RECOMMENDATION',
    entityId: recommendation.id,
    actor: 'SYSTEM',
    details: { 
      category: recommendation.category,
      priority: recommendation.priority,
      confidenceScore,
      patternId: pattern.id,
    },
  });
  
  return recommendation;
}

function calculateEstimatedImpact(
  pattern: DetectedPattern,
  template: RecommendationTemplate
): ImpactEstimate {
  const baseImpact = pattern.magnitude * 0.5;
  const confidenceMultiplier = pattern.significance;
  
  const changePercent = baseImpact * confidenceMultiplier;
  const currentValue = 100;
  const projectedValue = currentValue * (1 + changePercent / 100);
  
  return {
    metric: template.impactMetric,
    currentValue,
    projectedValue,
    changePercent,
    monetaryImpact: Math.round(changePercent * 1000),
    timeToRealize: changePercent > 10 ? '1-3 months' : '3-6 months',
    confidenceRange: {
      low: changePercent * 0.7,
      high: changePercent * 1.3,
    },
  };
}

function generateReasoning(
  pattern: DetectedPattern,
  template: RecommendationTemplate
): string {
  const parts = [
    `Analysis of ${pattern.domain.toLowerCase()} data detected a ${pattern.patternType.toLowerCase()} pattern.`,
    pattern.explainability.summary,
    `This pattern has a significance score of ${(pattern.significance * 100).toFixed(0)}%.`,
    `Based on historical data and ${template.category.toLowerCase().replace('_', ' ')} best practices,`,
    `we recommend taking action to address this pattern.`,
  ];
  
  return parts.join(' ');
}

// ============================================
// EXECUTIVE INBOX
// ============================================

/**
 * Create inbox item from recommendation.
 */
export function createInboxItemFromRecommendation(
  recommendation: AIRecommendation
): ExecutiveInboxItem {
  const item: ExecutiveInboxItem = {
    id: generateId('inbox'),
    type: 'RECOMMENDATION',
    title: recommendation.title,
    summary: recommendation.description,
    priority: recommendation.priority,
    status: 'UNREAD',
    recommendation,
    receivedAt: new Date().toISOString(),
  };
  
  inboxItems.set(item.id, item);
  
  addAuditRecord({
    action: 'INBOX_ITEM_CREATED',
    entityType: 'INBOX_ITEM',
    entityId: item.id,
    actor: 'SYSTEM',
    details: { type: item.type, priority: item.priority },
  });
  
  return item;
}

/**
 * Create inbox item from pattern alert.
 */
export function createPatternAlertItem(
  pattern: DetectedPattern,
  alertTitle: string
): ExecutiveInboxItem {
  const item: ExecutiveInboxItem = {
    id: generateId('inbox'),
    type: 'PATTERN_ALERT',
    title: alertTitle,
    summary: pattern.description,
    priority: pattern.significance > 0.8 ? 'URGENT' : 
              pattern.significance > 0.6 ? 'HIGH' : 'MEDIUM',
    status: 'UNREAD',
    patterns: [pattern],
    receivedAt: new Date().toISOString(),
  };
  
  inboxItems.set(item.id, item);
  
  addAuditRecord({
    action: 'INBOX_ITEM_CREATED',
    entityType: 'INBOX_ITEM',
    entityId: item.id,
    actor: 'SYSTEM',
    details: { type: item.type, patternId: pattern.id },
  });
  
  return item;
}

/**
 * Create insight summary item.
 */
export function createInsightSummaryItem(
  title: string,
  summary: string,
  findings: string[],
  supportingPatterns: DetectedPattern[]
): ExecutiveInboxItem {
  const item: ExecutiveInboxItem = {
    id: generateId('inbox'),
    type: 'INSIGHT',
    title,
    summary: `${summary}\n\nKey Findings:\n${findings.map(f => `• ${f}`).join('\n')}`,
    priority: 'MEDIUM',
    status: 'UNREAD',
    patterns: supportingPatterns,
    receivedAt: new Date().toISOString(),
  };
  
  inboxItems.set(item.id, item);
  
  addAuditRecord({
    action: 'INBOX_ITEM_CREATED',
    entityType: 'INBOX_ITEM',
    entityId: item.id,
    actor: 'SYSTEM',
    details: { type: item.type, findingsCount: findings.length },
  });
  
  return item;
}

/**
 * Get inbox item.
 */
export function getInboxItem(itemId: string): ExecutiveInboxItem | null {
  return inboxItems.get(itemId) || null;
}

/**
 * List inbox items.
 */
export function listInboxItems(filters?: {
  type?: ExecutiveInboxItem['type'];
  status?: InboxItemStatus;
  priority?: PriorityLevel;
  limit?: number;
}): ExecutiveInboxItem[] {
  let results = Array.from(inboxItems.values());
  
  if (filters) {
    if (filters.type) {
      results = results.filter(i => i.type === filters.type);
    }
    if (filters.status) {
      results = results.filter(i => i.status === filters.status);
    }
    if (filters.priority) {
      results = results.filter(i => i.priority === filters.priority);
    }
  }
  
  // Sort by priority then date
  const priorityOrder: Record<PriorityLevel, number> = {
    'URGENT': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3,
  };
  
  results.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.receivedAt.localeCompare(a.receivedAt);
  });
  
  if (filters?.limit) {
    results = results.slice(0, filters.limit);
  }
  
  return results;
}

/**
 * Mark inbox item as read.
 */
export function markInboxItemRead(itemId: string): boolean {
  const item = inboxItems.get(itemId);
  if (!item) return false;
  
  item.status = 'READ';
  item.readAt = new Date().toISOString();
  inboxItems.set(itemId, item);
  
  addAuditRecord({
    action: 'INBOX_ITEM_READ',
    entityType: 'INBOX_ITEM',
    entityId: itemId,
    actor: 'USER',
    details: {},
  });
  
  return true;
}

/**
 * Acknowledge inbox item.
 */
export function acknowledgeInboxItem(
  itemId: string,
  acknowledgedBy: string,
  notes?: string
): boolean {
  const item = inboxItems.get(itemId);
  if (!item) return false;
  
  item.status = 'ACKNOWLEDGED';
  item.acknowledgedBy = acknowledgedBy;
  item.acknowledgedAt = new Date().toISOString();
  if (notes) item.notes = notes;
  inboxItems.set(itemId, item);
  
  addAuditRecord({
    action: 'INBOX_ITEM_ACKNOWLEDGED',
    entityType: 'INBOX_ITEM',
    entityId: itemId,
    actor: acknowledgedBy,
    details: { notes },
  });
  
  return true;
}

/**
 * Dismiss inbox item.
 */
export function dismissInboxItem(
  itemId: string,
  dismissedBy: string,
  reason?: string
): boolean {
  const item = inboxItems.get(itemId);
  if (!item) return false;
  
  item.status = 'DISMISSED';
  item.notes = reason || 'Dismissed by user';
  inboxItems.set(itemId, item);
  
  addAuditRecord({
    action: 'RECOMMENDATION_DISMISSED',
    entityType: 'INBOX_ITEM',
    entityId: itemId,
    actor: dismissedBy,
    details: { reason },
  });
  
  return true;
}

/**
 * Archive inbox item.
 */
export function archiveInboxItem(itemId: string): boolean {
  const item = inboxItems.get(itemId);
  if (!item) return false;
  
  item.status = 'ARCHIVED';
  inboxItems.set(itemId, item);
  
  return true;
}

/**
 * Get inbox summary.
 */
export function getInboxSummary(): {
  total: number;
  unread: number;
  urgent: number;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
} {
  const items = Array.from(inboxItems.values());
  
  const byType: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  
  for (const item of items) {
    byType[item.type] = (byType[item.type] || 0) + 1;
    byPriority[item.priority] = (byPriority[item.priority] || 0) + 1;
  }
  
  return {
    total: items.length,
    unread: items.filter(i => i.status === 'UNREAD').length,
    urgent: items.filter(i => i.priority === 'URGENT' && i.status !== 'ARCHIVED').length,
    byType,
    byPriority,
  };
}

// ============================================
// ANALYSIS ORCHESTRATION
// ============================================

/**
 * Run comprehensive analysis.
 */
export function runAnalysis(
  datasets: TimeSeriesData[],
  requestedBy: string,
  options?: {
    thresholds?: Record<string, { value: number; operator: 'GT' | 'LT' | 'GTE' | 'LTE' }>;
    generateRecommendations?: boolean;
    createInboxItems?: boolean;
  }
): AnalysisRequest {
  const requestId = generateId('analysis');
  
  const request: AnalysisRequest = {
    id: requestId,
    domains: Array.from(new Set(datasets.map(d => d.domain))),
    dateRange: {
      startDate: datasets.reduce((min, d) => d.startDate < min ? d.startDate : min, datasets[0]?.startDate || ''),
      endDate: datasets.reduce((max, d) => d.endDate > max ? d.endDate : max, datasets[0]?.endDate || ''),
    },
    requestedBy,
    requestedAt: new Date().toISOString(),
    status: 'IN_PROGRESS',
  };
  
  analysisRequests.set(requestId, request);
  
  addAuditRecord({
    action: 'ANALYSIS_REQUESTED',
    entityType: 'ANALYSIS',
    entityId: requestId,
    actor: requestedBy,
    details: { domains: request.domains, datasetCount: datasets.length },
  });
  
  const detectedPatterns: DetectedPattern[] = [];
  const generatedRecommendations: AIRecommendation[] = [];
  
  // Analyze each dataset
  for (const dataset of datasets) {
    // Detect trends
    const trend = detectTrend(dataset);
    if (trend) detectedPatterns.push(trend);
    
    // Detect anomalies
    const anomalies = detectAnomalies(dataset);
    detectedPatterns.push(...anomalies);
    
    // Check thresholds
    if (options?.thresholds?.[dataset.domain]) {
      const thresholdConfig = options.thresholds[dataset.domain];
      const breach = detectThresholdBreach(dataset, thresholdConfig.value, thresholdConfig.operator);
      if (breach) detectedPatterns.push(breach);
    }
  }
  
  // Generate recommendations if requested
  if (options?.generateRecommendations !== false) {
    for (const pattern of detectedPatterns) {
      if (pattern.significance >= 0.5) {
        const recommendation = generateRecommendationFromPattern(pattern);
        if (recommendation) {
          generatedRecommendations.push(recommendation);
          
          if (options?.createInboxItems !== false) {
            createInboxItemFromRecommendation(recommendation);
          }
        }
      }
    }
  }
  
  // Create pattern alerts for significant patterns without recommendations
  if (options?.createInboxItems !== false) {
    for (const pattern of detectedPatterns) {
      if (pattern.significance >= 0.7 && pattern.patternType === 'ANOMALY') {
        createPatternAlertItem(pattern, `Anomaly Alert: ${pattern.domain}`);
      }
    }
  }
  
  // Update request with results
  request.status = 'COMPLETED';
  request.completedAt = new Date().toISOString();
  request.resultSummary = {
    patternsDetected: detectedPatterns.length,
    recommendationsGenerated: generatedRecommendations.length,
    topPriority: generatedRecommendations.length > 0 
      ? generatedRecommendations.sort((a, b) => {
          const order: Record<PriorityLevel, number> = { 'URGENT': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3 };
          return order[a.priority] - order[b.priority];
        })[0].priority 
      : 'LOW',
    domains: request.domains,
    keyFindings: detectedPatterns.slice(0, 5).map(p => p.description),
    executiveSummary: generateExecutiveSummary(detectedPatterns, generatedRecommendations),
  };
  
  analysisRequests.set(requestId, request);
  
  return request;
}

function generateExecutiveSummary(
  patterns: DetectedPattern[],
  recommendations: AIRecommendation[]
): string {
  if (patterns.length === 0) {
    return 'Analysis complete. No significant patterns detected requiring attention.';
  }
  
  const parts = [
    `Analysis identified ${patterns.length} pattern(s) and generated ${recommendations.length} recommendation(s).`,
  ];
  
  const urgentRecs = recommendations.filter(r => r.priority === 'URGENT' || r.priority === 'HIGH');
  if (urgentRecs.length > 0) {
    parts.push(`${urgentRecs.length} high-priority action(s) require attention.`);
  }
  
  const domains = Array.from(new Set(patterns.map(p => p.domain)));
  parts.push(`Patterns were detected across ${domains.length} domain(s): ${domains.join(', ')}.`);
  
  return parts.join(' ');
}

// ============================================
// QUERY FUNCTIONS
// ============================================

/**
 * Get pattern by ID.
 */
export function getPattern(patternId: string): DetectedPattern | null {
  return patterns.get(patternId) || null;
}

/**
 * List patterns.
 */
export function listPatterns(filters?: {
  domain?: AnalysisDomain;
  patternType?: PatternType;
  minSignificance?: number;
  limit?: number;
}): DetectedPattern[] {
  let results = Array.from(patterns.values());
  
  if (filters) {
    if (filters.domain) {
      results = results.filter(p => p.domain === filters.domain);
    }
    if (filters.patternType) {
      results = results.filter(p => p.patternType === filters.patternType);
    }
    if (filters.minSignificance !== undefined) {
      results = results.filter(p => p.significance >= filters.minSignificance!);
    }
  }
  
  results.sort((a, b) => b.significance - a.significance);
  
  if (filters?.limit) {
    results = results.slice(0, filters.limit);
  }
  
  return results;
}

/**
 * Get recommendation by ID.
 */
export function getRecommendation(recommendationId: string): AIRecommendation | null {
  return recommendations.get(recommendationId) || null;
}

/**
 * List recommendations.
 */
export function listRecommendations(filters?: {
  category?: RecommendationCategory;
  priority?: PriorityLevel;
  minConfidence?: number;
  limit?: number;
}): AIRecommendation[] {
  let results = Array.from(recommendations.values());
  
  if (filters) {
    if (filters.category) {
      results = results.filter(r => r.category === filters.category);
    }
    if (filters.priority) {
      results = results.filter(r => r.priority === filters.priority);
    }
    if (filters.minConfidence !== undefined) {
      results = results.filter(r => r.confidenceScore >= filters.minConfidence!);
    }
  }
  
  // Sort by priority then confidence
  const priorityOrder: Record<PriorityLevel, number> = {
    'URGENT': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3,
  };
  
  results.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.confidenceScore - a.confidenceScore;
  });
  
  if (filters?.limit) {
    results = results.slice(0, filters.limit);
  }
  
  return results;
}

/**
 * Get analysis request.
 */
export function getAnalysisRequest(requestId: string): AnalysisRequest | null {
  return analysisRequests.get(requestId) || null;
}

/**
 * Get audit records.
 */
export function getAuditRecords(filters?: {
  action?: AIOptimizationAuditRecord['action'];
  entityType?: AIOptimizationAuditRecord['entityType'];
  entityId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): AIOptimizationAuditRecord[] {
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

// ============================================
// FEEDBACK
// ============================================

/**
 * Provide feedback on recommendation.
 */
export function provideFeedback(
  recommendationId: string,
  feedbackBy: string,
  feedback: {
    useful: boolean;
    implemented: boolean;
    actualImpact?: number;
    comments?: string;
  }
): boolean {
  const recommendation = recommendations.get(recommendationId);
  if (!recommendation) return false;
  
  addAuditRecord({
    action: 'FEEDBACK_PROVIDED',
    entityType: 'RECOMMENDATION',
    entityId: recommendationId,
    actor: feedbackBy,
    details: feedback,
  });
  
  return true;
}

// ============================================
// CLEANUP
// ============================================

/**
 * Clear all data (for testing).
 */
export function clearAIOptimizationData(): void {
  patterns.clear();
  recommendations.clear();
  inboxItems.clear();
  analysisRequests.clear();
  auditLog.length = 0;
}
