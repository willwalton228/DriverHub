/**
 * Capital, Lender & Insurance-Grade Reporting Engine (INCREMENT 19)
 * M&A Readiness & Diligence Portability Engine (INCREMENT 20)
 * 
 * INCREMENT 19 Features:
 * 1. Standardized lender and capital reporting packs (cost, utilization, safety)
 * 2. Insurance renewal datasets focused on claims, enforcement, and exposure
 * 3. Covenant and governance compliance indicators
 * 4. Versioned, reproducible report generation with hashes
 * 5. Secure, auditable distribution controls
 * 
 * INCREMENT 20 Features:
 * 1. Push-button diligence pack generator (ops, cost, safety, governance)
 * 2. Rules-based RYG flagging for risk signals
 * 3. Market/entity carve-out exports
 * 4. Stable data contracts with versioning and checksums
 * 5. Secure, auditable data room access controls
 * 
 * NOT implementing:
 * - Valuation models
 * - Fundraising materials
 * - Negotiation logic/tooling
 * - Legal drafting
 */

import * as crypto from 'crypto';

// ============================================
// TYPES & ENUMS
// ============================================

/** Report pack audience types */
export type InstitutionalAudience = 
  | 'LENDER'
  | 'CAPITAL_PROVIDER'
  | 'INSURANCE_CARRIER'
  | 'DILIGENCE_TEAM'
  | 'BOARD';

/** Report pack types */
export type ReportPackType = 
  | 'LENDER_QUARTERLY'
  | 'CAPITAL_SUMMARY'
  | 'INSURANCE_RENEWAL'
  | 'COVENANT_COMPLIANCE'
  | 'DILIGENCE_FULL'
  | 'DILIGENCE_SUMMARY'
  | 'CARVE_OUT';

/** RYG flag status (Red/Yellow/Green) */
export type RYGStatus = 'RED' | 'YELLOW' | 'GREEN';

/** Risk category for flagging */
export type RiskCategory = 
  | 'FINANCIAL'
  | 'OPERATIONAL'
  | 'SAFETY'
  | 'COMPLIANCE'
  | 'GOVERNANCE'
  | 'CONCENTRATION'
  | 'LITIGATION'
  | 'REGULATORY';

/** Data contract version */
export interface DataContractVersion {
  version: string;
  schemaHash: string;
  effectiveDate: string;
  deprecatedDate?: string;
  fields: DataContractField[];
}

/** Data contract field */
export interface DataContractField {
  name: string;
  type: string;
  required: boolean;
  description: string;
  format?: string;
  constraints?: Record<string, unknown>;
}

/** Covenant definition */
export interface CovenantDefinition {
  id: string;
  name: string;
  description: string;
  metricType: string;
  operator: 'GT' | 'GTE' | 'LT' | 'LTE' | 'EQ' | 'BETWEEN';
  threshold: number;
  upperThreshold?: number;
  frequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
  gracePeriodDays: number;
  severity: 'MINOR' | 'MATERIAL' | 'CRITICAL';
}

/** Covenant compliance result */
export interface CovenantResult {
  covenantId: string;
  covenantName: string;
  periodEnd: string;
  actualValue: number;
  threshold: number;
  compliant: boolean;
  marginPercent: number;
  severity: 'MINOR' | 'MATERIAL' | 'CRITICAL';
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
}

/** RYG flag */
export interface RYGFlag {
  id: string;
  category: RiskCategory;
  status: RYGStatus;
  title: string;
  description: string;
  metric?: string;
  currentValue?: number;
  threshold?: number;
  recommendation?: string;
  createdAt: string;
}

/** Lender report pack */
export interface LenderReportPack {
  id: string;
  packType: 'LENDER_QUARTERLY';
  version: string;
  generatedAt: string;
  contentHash: string;
  periodStart: string;
  periodEnd: string;
  financialSummary: FinancialSummary;
  operationalMetrics: OperationalMetrics;
  covenantCompliance: CovenantResult[];
  riskFlags: RYGFlag[];
}

/** Capital summary pack */
export interface CapitalSummaryPack {
  id: string;
  packType: 'CAPITAL_SUMMARY';
  version: string;
  generatedAt: string;
  contentHash: string;
  periodStart: string;
  periodEnd: string;
  capitalMetrics: CapitalMetrics;
  utilizationTrends: UtilizationTrend[];
  safetyOverview: SafetyMetrics;
  governanceStatus: GovernanceStatus;
}

/** Insurance renewal pack */
export interface InsuranceRenewalPack {
  id: string;
  packType: 'INSURANCE_RENEWAL';
  version: string;
  generatedAt: string;
  contentHash: string;
  periodStart: string;
  periodEnd: string;
  claimsHistory: ClaimsHistory;
  enforcementActions: EnforcementSummary;
  exposureAnalysis: ExposureAnalysis;
  riskMitigation: RiskMitigation;
  lossRatios: LossRatioData;
}

/** Diligence pack */
export interface DiligencePack {
  id: string;
  packType: 'DILIGENCE_FULL' | 'DILIGENCE_SUMMARY';
  version: string;
  generatedAt: string;
  contentHash: string;
  periodStart: string;
  periodEnd: string;
  executiveSummary: ExecutiveSummary;
  operationalDiligence: OperationalDiligence;
  financialDiligence: FinancialDiligence;
  safetyDiligence: SafetyDiligence;
  governanceDiligence: GovernanceDiligence;
  rygSummary: RYGSummary;
  materialFindings: MaterialFinding[];
}

/** Carve-out export */
export interface CarveOutExport {
  id: string;
  packType: 'CARVE_OUT';
  version: string;
  generatedAt: string;
  contentHash: string;
  scope: CarveOutScope;
  entityData: EntityData[];
  financialData: CarveOutFinancials;
  operationalData: CarveOutOperations;
  dataContract: DataContractVersion;
}

/** All pack types union */
export type ReportPack = 
  | LenderReportPack
  | CapitalSummaryPack
  | InsuranceRenewalPack
  | DiligencePack
  | CarveOutExport;

/** Financial summary */
export interface FinancialSummary {
  revenue: number;
  revenueGrowthPercent: number;
  grossMargin: number;
  operatingExpenses: number;
  ebitda: number;
  ebitdaMargin: number;
  cashPosition: number;
  accountsReceivable: number;
  accountsPayable: number;
  daysReceivable: number;
  daysPayable: number;
}

/** Operational metrics */
export interface OperationalMetrics {
  totalMoves: number;
  moveGrowthPercent: number;
  activeDrivers: number;
  driverTurnoverPercent: number;
  averageRevenuePerMove: number;
  utilizationRate: number;
  onTimeDeliveryRate: number;
  customerRetentionRate: number;
  marketCount: number;
  marketConcentration: { marketId: string; revenueShare: number }[];
}

/** Capital metrics */
export interface CapitalMetrics {
  totalCapitalDeployed: number;
  capitalEfficiency: number;
  returnOnCapital: number;
  workingCapitalDays: number;
  debtToEquity: number;
  interestCoverage: number;
  quickRatio: number;
  currentRatio: number;
}

/** Utilization trend */
export interface UtilizationTrend {
  period: string;
  utilization: number;
  capacity: number;
  demand: number;
}

/** Safety metrics */
export interface SafetyMetrics {
  incidentRate: number;
  incidentRateTrend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  totalIncidents: number;
  severityBreakdown: { severity: string; count: number }[];
  claimsFrequency: number;
  claimsSeverity: number;
  safetyScore: number;
}

/** Governance status */
export interface GovernanceStatus {
  boardMeetingsHeld: number;
  boardMeetingsRequired: number;
  auditStatus: 'CURRENT' | 'PENDING' | 'OVERDUE';
  policyReviewStatus: 'CURRENT' | 'PENDING' | 'OVERDUE';
  complianceTrainingPercent: number;
  openAuditFindings: number;
  materialWeaknesses: number;
}

/** Claims history */
export interface ClaimsHistory {
  totalClaims: number;
  totalClaimsAmount: number;
  claimsByYear: { year: number; count: number; amount: number }[];
  claimsByType: { type: string; count: number; amount: number }[];
  averageClaimAmount: number;
  maxClaimAmount: number;
  openClaimsCount: number;
  openClaimsReserve: number;
}

/** Enforcement summary */
export interface EnforcementSummary {
  activeRestrictedDrivers: number;
  activeSuspendedDrivers: number;
  disqualifiedLast12Months: number;
  enforcementActions: { type: string; count: number }[];
  complianceRate: number;
}

/** Exposure analysis */
export interface ExposureAnalysis {
  totalExposure: number;
  exposureByMarket: { marketId: string; exposure: number }[];
  exposureByRiskTier: { tier: string; exposure: number; driverCount: number }[];
  concentrationRisk: number;
  peakExposure: number;
  averageExposure: number;
}

/** Risk mitigation */
export interface RiskMitigation {
  safetyProgramsActive: number;
  trainingCompletionRate: number;
  vehicleInspectionRate: number;
  backgroundCheckCompliance: number;
  insuranceVerificationRate: number;
  mitigationInvestment: number;
}

/** Loss ratio data */
export interface LossRatioData {
  currentYearLossRatio: number;
  priorYearLossRatio: number;
  threeYearAverage: number;
  industryBenchmark: number;
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
}

/** Executive summary */
export interface ExecutiveSummary {
  companyOverview: string;
  keyStrengths: string[];
  keyRisks: string[];
  overallRating: RYGStatus;
  recommendedNextSteps: string[];
}

/** Operational diligence */
export interface OperationalDiligence {
  businessModel: string;
  marketPosition: string;
  competitiveAdvantages: string[];
  operationalMetrics: OperationalMetrics;
  scalabilityAssessment: string;
  technologyStack: string;
}

/** Financial diligence */
export interface FinancialDiligence {
  financialSummary: FinancialSummary;
  revenueQuality: string;
  costStructure: string;
  workingCapitalAnalysis: string;
  cashFlowAnalysis: string;
}

/** Safety diligence */
export interface SafetyDiligence {
  safetyMetrics: SafetyMetrics;
  safetyPrograms: string[];
  regulatoryCompliance: string;
  insuranceCoverage: string;
  claimsHistory: ClaimsHistory;
}

/** Governance diligence */
export interface GovernanceDiligence {
  corporateStructure: string;
  boardComposition: string;
  keyPersonnelRisk: string;
  policiesAndProcedures: string[];
  auditHistory: string;
  governanceStatus: GovernanceStatus;
}

/** RYG summary */
export interface RYGSummary {
  overall: RYGStatus;
  byCategory: { category: RiskCategory; status: RYGStatus; flagCount: number }[];
  redFlags: number;
  yellowFlags: number;
  greenFlags: number;
  criticalFindings: string[];
}

/** Material finding */
export interface MaterialFinding {
  id: string;
  category: RiskCategory;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  impact: string;
  recommendation: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
}

/** Carve-out scope */
export interface CarveOutScope {
  entityType: 'MARKET' | 'REGION' | 'BUSINESS_UNIT' | 'PRODUCT_LINE';
  entityIds: string[];
  includeHistorical: boolean;
  historicalPeriods: number;
  dataCategories: string[];
}

/** Entity data */
export interface EntityData {
  entityId: string;
  entityName: string;
  entityType: string;
  status: string;
  metrics: Record<string, number>;
  relationships: { type: string; targetId: string }[];
}

/** Carve-out financials */
export interface CarveOutFinancials {
  allocatedRevenue: number;
  allocatedCosts: number;
  directCosts: number;
  sharedCostsAllocated: number;
  allocationMethodology: string;
  standaloneCostEstimate: number;
}

/** Carve-out operations */
export interface CarveOutOperations {
  totalMoves: number;
  activeDrivers: number;
  activeCustomers: number;
  sharedResources: string[];
  transitionRequirements: string[];
}

/** Data room access token */
export interface DataRoomAccessToken {
  id: string;
  token: string;
  audience: InstitutionalAudience;
  entityId: string;
  entityName: string;
  grantedBy: string;
  grantedAt: string;
  expiresAt: string;
  accessLevel: 'VIEW_ONLY' | 'DOWNLOAD' | 'FULL';
  allowedPacks: ReportPackType[];
  ipRestrictions?: string[];
  watermarkEnabled: boolean;
  isActive: boolean;
  usageCount: number;
  lastAccessedAt?: string;
}

/** Distribution record */
export interface DistributionRecord {
  id: string;
  packId: string;
  packType: ReportPackType;
  recipientId: string;
  recipientName: string;
  recipientType: InstitutionalAudience;
  distributedAt: string;
  distributedBy: string;
  method: 'DATA_ROOM' | 'SECURE_DOWNLOAD' | 'EMAIL_ENCRYPTED';
  contentHash: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  accessCount: number;
}

/** Audit record */
export interface CapitalReportAuditRecord {
  id: string;
  timestamp: string;
  action: 'PACK_GENERATED' | 'PACK_ACCESSED' | 'PACK_DISTRIBUTED' | 
          'TOKEN_CREATED' | 'TOKEN_REVOKED' | 'TOKEN_USED' |
          'COVENANT_EVALUATED' | 'FLAG_CREATED' | 'FLAG_RESOLVED' |
          'DATA_ROOM_ACCESS' | 'DOWNLOAD_INITIATED' | 'CARVE_OUT_CREATED';
  entityType: 'PACK' | 'TOKEN' | 'COVENANT' | 'FLAG' | 'DISTRIBUTION';
  entityId: string;
  actor: string;
  audience?: InstitutionalAudience;
  ipAddress?: string;
  details: Record<string, unknown>;
  contentHash?: string;
}

// ============================================
// STORAGE
// ============================================

const reportPacks: Map<string, ReportPack> = new Map();
const covenants: Map<string, CovenantDefinition> = new Map();
const rygFlags: Map<string, RYGFlag> = new Map();
const accessTokens: Map<string, DataRoomAccessToken> = new Map();
const distributions: Map<string, DistributionRecord> = new Map();
const dataContracts: Map<string, DataContractVersion> = new Map();
const auditLog: CapitalReportAuditRecord[] = [];

// ============================================
// UTILITY FUNCTIONS
// ============================================

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'dr_';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateContentHash(content: unknown): string {
  const str = JSON.stringify(content, Object.keys(content as object).sort());
  return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
}

function generateSchemaHash(fields: DataContractField[]): string {
  const schema = fields.map(f => `${f.name}:${f.type}:${f.required}`).join('|');
  return crypto.createHash('sha256').update(schema).digest('hex').substring(0, 12);
}

function addAuditRecord(record: Omit<CapitalReportAuditRecord, 'id' | 'timestamp'>): void {
  const fullRecord: CapitalReportAuditRecord = {
    ...record,
    id: generateId('audit'),
    timestamp: new Date().toISOString(),
  };
  auditLog.push(fullRecord);
}

function getPackVersion(): string {
  return '1.0.0';
}

// ============================================
// COVENANT MANAGEMENT
// ============================================

/** Default covenants */
const DEFAULT_COVENANTS: Omit<CovenantDefinition, 'id'>[] = [
  {
    name: 'Minimum EBITDA',
    description: 'Quarterly EBITDA must exceed threshold',
    metricType: 'EBITDA',
    operator: 'GTE',
    threshold: 100000,
    frequency: 'QUARTERLY',
    gracePeriodDays: 30,
    severity: 'MATERIAL',
  },
  {
    name: 'Maximum Debt to EBITDA',
    description: 'Debt to EBITDA ratio must not exceed threshold',
    metricType: 'DEBT_TO_EBITDA',
    operator: 'LTE',
    threshold: 3.5,
    frequency: 'QUARTERLY',
    gracePeriodDays: 30,
    severity: 'CRITICAL',
  },
  {
    name: 'Minimum Interest Coverage',
    description: 'Interest coverage ratio must exceed threshold',
    metricType: 'INTEREST_COVERAGE',
    operator: 'GTE',
    threshold: 2.0,
    frequency: 'QUARTERLY',
    gracePeriodDays: 30,
    severity: 'MATERIAL',
  },
  {
    name: 'Minimum Utilization',
    description: 'Fleet utilization must exceed threshold',
    metricType: 'UTILIZATION',
    operator: 'GTE',
    threshold: 0.60,
    frequency: 'MONTHLY',
    gracePeriodDays: 15,
    severity: 'MINOR',
  },
  {
    name: 'Maximum Loss Ratio',
    description: 'Insurance loss ratio must not exceed threshold',
    metricType: 'LOSS_RATIO',
    operator: 'LTE',
    threshold: 0.65,
    frequency: 'ANNUALLY',
    gracePeriodDays: 60,
    severity: 'MATERIAL',
  },
  {
    name: 'Minimum Safety Score',
    description: 'Safety score must exceed threshold',
    metricType: 'SAFETY_SCORE',
    operator: 'GTE',
    threshold: 85,
    frequency: 'MONTHLY',
    gracePeriodDays: 15,
    severity: 'MATERIAL',
  },
];

/**
 * Initialize default covenants.
 */
export function initializeDefaultCovenants(): void {
  for (const covenantDef of DEFAULT_COVENANTS) {
    const id = generateId('cov');
    covenants.set(id, { ...covenantDef, id });
  }
}

/**
 * Add or update a covenant.
 */
export function upsertCovenant(covenant: Omit<CovenantDefinition, 'id'> & { id?: string }): CovenantDefinition {
  const id = covenant.id || generateId('cov');
  const full: CovenantDefinition = { ...covenant, id };
  covenants.set(id, full);
  return full;
}

/**
 * Get covenant by ID.
 */
export function getCovenant(id: string): CovenantDefinition | null {
  return covenants.get(id) || null;
}

/**
 * Get all covenants.
 */
export function getAllCovenants(): CovenantDefinition[] {
  return Array.from(covenants.values());
}

/**
 * Evaluate covenant compliance.
 */
export function evaluateCovenant(
  covenantId: string,
  actualValue: number,
  periodEnd: string,
  previousValue?: number
): CovenantResult | null {
  const covenant = covenants.get(covenantId);
  if (!covenant) return null;
  
  let compliant = false;
  
  switch (covenant.operator) {
    case 'GT':
      compliant = actualValue > covenant.threshold;
      break;
    case 'GTE':
      compliant = actualValue >= covenant.threshold;
      break;
    case 'LT':
      compliant = actualValue < covenant.threshold;
      break;
    case 'LTE':
      compliant = actualValue <= covenant.threshold;
      break;
    case 'EQ':
      compliant = actualValue === covenant.threshold;
      break;
    case 'BETWEEN':
      compliant = actualValue >= covenant.threshold && 
                  actualValue <= (covenant.upperThreshold || covenant.threshold);
      break;
  }
  
  const marginPercent = covenant.threshold !== 0 
    ? ((actualValue - covenant.threshold) / covenant.threshold) * 100 
    : 0;
  
  let trend: 'IMPROVING' | 'STABLE' | 'DECLINING' = 'STABLE';
  if (previousValue !== undefined) {
    const change = actualValue - previousValue;
    const changePercent = previousValue !== 0 ? (change / previousValue) * 100 : 0;
    if (Math.abs(changePercent) < 2) {
      trend = 'STABLE';
    } else if (covenant.operator === 'GTE' || covenant.operator === 'GT') {
      trend = change > 0 ? 'IMPROVING' : 'DECLINING';
    } else {
      trend = change < 0 ? 'IMPROVING' : 'DECLINING';
    }
  }
  
  const result: CovenantResult = {
    covenantId,
    covenantName: covenant.name,
    periodEnd,
    actualValue,
    threshold: covenant.threshold,
    compliant,
    marginPercent,
    severity: covenant.severity,
    trend,
  };
  
  addAuditRecord({
    action: 'COVENANT_EVALUATED',
    entityType: 'COVENANT',
    entityId: covenantId,
    actor: 'SYSTEM',
    details: { actualValue, threshold: covenant.threshold, compliant },
  });
  
  return result;
}

/**
 * Evaluate all covenants with provided metrics.
 */
export function evaluateAllCovenants(
  metrics: Record<string, number>,
  periodEnd: string,
  previousMetrics?: Record<string, number>
): CovenantResult[] {
  const results: CovenantResult[] = [];
  
  for (const covenant of Array.from(covenants.values())) {
    const actualValue = metrics[covenant.metricType];
    if (actualValue === undefined) continue;
    
    const previousValue = previousMetrics?.[covenant.metricType];
    const result = evaluateCovenant(covenant.id, actualValue, periodEnd, previousValue);
    if (result) results.push(result);
  }
  
  return results;
}

// ============================================
// RYG FLAGGING
// ============================================

/** RYG rule definitions */
interface RYGRule {
  category: RiskCategory;
  metricType: string;
  greenThreshold: number;
  yellowThreshold: number;
  operator: 'LT' | 'GT';
  title: string;
  description: string;
}

const RYG_RULES: RYGRule[] = [
  // Financial
  { category: 'FINANCIAL', metricType: 'EBITDA_MARGIN', greenThreshold: 0.15, yellowThreshold: 0.08, operator: 'GT', title: 'EBITDA Margin', description: 'Profitability indicator' },
  { category: 'FINANCIAL', metricType: 'REVENUE_GROWTH', greenThreshold: 0.10, yellowThreshold: 0.00, operator: 'GT', title: 'Revenue Growth', description: 'Year-over-year revenue growth' },
  { category: 'FINANCIAL', metricType: 'DAYS_RECEIVABLE', greenThreshold: 30, yellowThreshold: 45, operator: 'LT', title: 'Days Receivable', description: 'Collection efficiency' },
  
  // Operational
  { category: 'OPERATIONAL', metricType: 'UTILIZATION', greenThreshold: 0.80, yellowThreshold: 0.65, operator: 'GT', title: 'Fleet Utilization', description: 'Resource efficiency' },
  { category: 'OPERATIONAL', metricType: 'ON_TIME_RATE', greenThreshold: 0.95, yellowThreshold: 0.90, operator: 'GT', title: 'On-Time Delivery', description: 'Service reliability' },
  { category: 'OPERATIONAL', metricType: 'DRIVER_TURNOVER', greenThreshold: 0.15, yellowThreshold: 0.25, operator: 'LT', title: 'Driver Turnover', description: 'Workforce stability' },
  
  // Safety
  { category: 'SAFETY', metricType: 'INCIDENT_RATE', greenThreshold: 0.02, yellowThreshold: 0.05, operator: 'LT', title: 'Incident Rate', description: 'Safety performance' },
  { category: 'SAFETY', metricType: 'SAFETY_SCORE', greenThreshold: 90, yellowThreshold: 80, operator: 'GT', title: 'Safety Score', description: 'Overall safety rating' },
  { category: 'SAFETY', metricType: 'LOSS_RATIO', greenThreshold: 0.50, yellowThreshold: 0.65, operator: 'LT', title: 'Loss Ratio', description: 'Insurance performance' },
  
  // Compliance
  { category: 'COMPLIANCE', metricType: 'DOCUMENT_COMPLIANCE', greenThreshold: 0.98, yellowThreshold: 0.95, operator: 'GT', title: 'Document Compliance', description: 'Regulatory documentation' },
  { category: 'COMPLIANCE', metricType: 'TRAINING_COMPLETION', greenThreshold: 0.95, yellowThreshold: 0.85, operator: 'GT', title: 'Training Completion', description: 'Driver training status' },
  
  // Concentration
  { category: 'CONCENTRATION', metricType: 'TOP_CUSTOMER_REVENUE', greenThreshold: 0.15, yellowThreshold: 0.25, operator: 'LT', title: 'Customer Concentration', description: 'Revenue concentration risk' },
  { category: 'CONCENTRATION', metricType: 'TOP_MARKET_REVENUE', greenThreshold: 0.30, yellowThreshold: 0.50, operator: 'LT', title: 'Market Concentration', description: 'Geographic concentration' },
  
  // Governance
  { category: 'GOVERNANCE', metricType: 'AUDIT_FINDINGS', greenThreshold: 0, yellowThreshold: 2, operator: 'LT', title: 'Open Audit Findings', description: 'Governance health' },
  { category: 'GOVERNANCE', metricType: 'POLICY_CURRENCY', greenThreshold: 1.0, yellowThreshold: 0.90, operator: 'GT', title: 'Policy Currency', description: 'Policy review status' },
];

/**
 * Evaluate RYG status for a metric.
 */
export function evaluateRYG(
  metricType: string,
  value: number
): RYGFlag | null {
  const rule = RYG_RULES.find(r => r.metricType === metricType);
  if (!rule) return null;
  
  let status: RYGStatus;
  
  if (rule.operator === 'GT') {
    if (value >= rule.greenThreshold) status = 'GREEN';
    else if (value >= rule.yellowThreshold) status = 'YELLOW';
    else status = 'RED';
  } else {
    if (value <= rule.greenThreshold) status = 'GREEN';
    else if (value <= rule.yellowThreshold) status = 'YELLOW';
    else status = 'RED';
  }
  
  const flag: RYGFlag = {
    id: generateId('flag'),
    category: rule.category,
    status,
    title: rule.title,
    description: rule.description,
    metric: metricType,
    currentValue: value,
    threshold: status === 'GREEN' ? rule.greenThreshold : rule.yellowThreshold,
    createdAt: new Date().toISOString(),
  };
  
  if (status !== 'GREEN') {
    rygFlags.set(flag.id, flag);
    
    addAuditRecord({
      action: 'FLAG_CREATED',
      entityType: 'FLAG',
      entityId: flag.id,
      actor: 'SYSTEM',
      details: { category: rule.category, status, value },
    });
  }
  
  return flag;
}

/**
 * Evaluate all RYG flags for metrics.
 */
export function evaluateAllRYG(metrics: Record<string, number>): RYGFlag[] {
  const flags: RYGFlag[] = [];
  
  for (const rule of RYG_RULES) {
    const value = metrics[rule.metricType];
    if (value === undefined) continue;
    
    const flag = evaluateRYG(rule.metricType, value);
    if (flag) flags.push(flag);
  }
  
  return flags;
}

/**
 * Get RYG summary.
 */
export function getRYGSummary(flags: RYGFlag[]): RYGSummary {
  const redFlags = flags.filter(f => f.status === 'RED');
  const yellowFlags = flags.filter(f => f.status === 'YELLOW');
  const greenFlags = flags.filter(f => f.status === 'GREEN');
  
  const byCategory: { category: RiskCategory; status: RYGStatus; flagCount: number }[] = [];
  const categories: RiskCategory[] = ['FINANCIAL', 'OPERATIONAL', 'SAFETY', 'COMPLIANCE', 'GOVERNANCE', 'CONCENTRATION', 'LITIGATION', 'REGULATORY'];
  
  for (const category of categories) {
    const categoryFlags = flags.filter(f => f.category === category);
    if (categoryFlags.length === 0) continue;
    
    const hasRed = categoryFlags.some(f => f.status === 'RED');
    const hasYellow = categoryFlags.some(f => f.status === 'YELLOW');
    
    byCategory.push({
      category,
      status: hasRed ? 'RED' : hasYellow ? 'YELLOW' : 'GREEN',
      flagCount: categoryFlags.length,
    });
  }
  
  const overall: RYGStatus = redFlags.length > 0 ? 'RED' : yellowFlags.length > 0 ? 'YELLOW' : 'GREEN';
  
  return {
    overall,
    byCategory,
    redFlags: redFlags.length,
    yellowFlags: yellowFlags.length,
    greenFlags: greenFlags.length,
    criticalFindings: redFlags.map(f => f.title),
  };
}

/**
 * Get all flags.
 */
export function getAllFlags(): RYGFlag[] {
  return Array.from(rygFlags.values());
}

/**
 * Resolve a flag.
 */
export function resolveFlag(flagId: string, resolvedBy: string): boolean {
  const flag = rygFlags.get(flagId);
  if (!flag) return false;
  
  rygFlags.delete(flagId);
  
  addAuditRecord({
    action: 'FLAG_RESOLVED',
    entityType: 'FLAG',
    entityId: flagId,
    actor: resolvedBy,
    details: { category: flag.category, title: flag.title },
  });
  
  return true;
}

// ============================================
// REPORT PACK GENERATION
// ============================================

/**
 * Generate lender quarterly report pack.
 */
export function generateLenderPack(
  periodStart: string,
  periodEnd: string,
  metrics: Record<string, number>,
  previousMetrics?: Record<string, number>
): LenderReportPack {
  const covenantResults = evaluateAllCovenants(metrics, periodEnd, previousMetrics);
  const rygFlagsResult = evaluateAllRYG(metrics);
  
  const financialSummary: FinancialSummary = {
    revenue: metrics.REVENUE || 0,
    revenueGrowthPercent: metrics.REVENUE_GROWTH || 0,
    grossMargin: metrics.GROSS_MARGIN || 0,
    operatingExpenses: metrics.OPERATING_EXPENSES || 0,
    ebitda: metrics.EBITDA || 0,
    ebitdaMargin: metrics.EBITDA_MARGIN || 0,
    cashPosition: metrics.CASH_POSITION || 0,
    accountsReceivable: metrics.ACCOUNTS_RECEIVABLE || 0,
    accountsPayable: metrics.ACCOUNTS_PAYABLE || 0,
    daysReceivable: metrics.DAYS_RECEIVABLE || 0,
    daysPayable: metrics.DAYS_PAYABLE || 0,
  };
  
  const operationalMetrics: OperationalMetrics = {
    totalMoves: metrics.TOTAL_MOVES || 0,
    moveGrowthPercent: metrics.MOVE_GROWTH || 0,
    activeDrivers: metrics.ACTIVE_DRIVERS || 0,
    driverTurnoverPercent: metrics.DRIVER_TURNOVER || 0,
    averageRevenuePerMove: metrics.REVENUE_PER_MOVE || 0,
    utilizationRate: metrics.UTILIZATION || 0,
    onTimeDeliveryRate: metrics.ON_TIME_RATE || 0,
    customerRetentionRate: metrics.CUSTOMER_RETENTION || 0,
    marketCount: metrics.MARKET_COUNT || 0,
    marketConcentration: [],
  };
  
  const pack: LenderReportPack = {
    id: generateId('lender'),
    packType: 'LENDER_QUARTERLY',
    version: getPackVersion(),
    generatedAt: new Date().toISOString(),
    contentHash: '',
    periodStart,
    periodEnd,
    financialSummary,
    operationalMetrics,
    covenantCompliance: covenantResults,
    riskFlags: rygFlagsResult.filter(f => f.status !== 'GREEN'),
  };
  
  pack.contentHash = generateContentHash(pack);
  reportPacks.set(pack.id, pack);
  
  addAuditRecord({
    action: 'PACK_GENERATED',
    entityType: 'PACK',
    entityId: pack.id,
    actor: 'SYSTEM',
    details: { packType: 'LENDER_QUARTERLY', periodStart, periodEnd },
    contentHash: pack.contentHash,
  });
  
  return pack;
}

/**
 * Generate capital summary pack.
 */
export function generateCapitalPack(
  periodStart: string,
  periodEnd: string,
  metrics: Record<string, number>
): CapitalSummaryPack {
  const capitalMetrics: CapitalMetrics = {
    totalCapitalDeployed: metrics.CAPITAL_DEPLOYED || 0,
    capitalEfficiency: metrics.CAPITAL_EFFICIENCY || 0,
    returnOnCapital: metrics.RETURN_ON_CAPITAL || 0,
    workingCapitalDays: metrics.WORKING_CAPITAL_DAYS || 0,
    debtToEquity: metrics.DEBT_TO_EQUITY || 0,
    interestCoverage: metrics.INTEREST_COVERAGE || 0,
    quickRatio: metrics.QUICK_RATIO || 0,
    currentRatio: metrics.CURRENT_RATIO || 0,
  };
  
  const safetyOverview: SafetyMetrics = {
    incidentRate: metrics.INCIDENT_RATE || 0,
    incidentRateTrend: 'STABLE',
    totalIncidents: metrics.TOTAL_INCIDENTS || 0,
    severityBreakdown: [],
    claimsFrequency: metrics.CLAIMS_FREQUENCY || 0,
    claimsSeverity: metrics.CLAIMS_SEVERITY || 0,
    safetyScore: metrics.SAFETY_SCORE || 0,
  };
  
  const governanceStatus: GovernanceStatus = {
    boardMeetingsHeld: metrics.BOARD_MEETINGS_HELD || 0,
    boardMeetingsRequired: metrics.BOARD_MEETINGS_REQUIRED || 4,
    auditStatus: 'CURRENT',
    policyReviewStatus: 'CURRENT',
    complianceTrainingPercent: metrics.TRAINING_COMPLETION || 0,
    openAuditFindings: metrics.AUDIT_FINDINGS || 0,
    materialWeaknesses: metrics.MATERIAL_WEAKNESSES || 0,
  };
  
  const pack: CapitalSummaryPack = {
    id: generateId('capital'),
    packType: 'CAPITAL_SUMMARY',
    version: getPackVersion(),
    generatedAt: new Date().toISOString(),
    contentHash: '',
    periodStart,
    periodEnd,
    capitalMetrics,
    utilizationTrends: [],
    safetyOverview,
    governanceStatus,
  };
  
  pack.contentHash = generateContentHash(pack);
  reportPacks.set(pack.id, pack);
  
  addAuditRecord({
    action: 'PACK_GENERATED',
    entityType: 'PACK',
    entityId: pack.id,
    actor: 'SYSTEM',
    details: { packType: 'CAPITAL_SUMMARY', periodStart, periodEnd },
    contentHash: pack.contentHash,
  });
  
  return pack;
}

/**
 * Generate insurance renewal pack.
 */
export function generateInsurancePack(
  periodStart: string,
  periodEnd: string,
  claimsData: Partial<ClaimsHistory>,
  enforcementData: Partial<EnforcementSummary>,
  exposureData: Partial<ExposureAnalysis>,
  metrics: Record<string, number>
): InsuranceRenewalPack {
  const claimsHistory: ClaimsHistory = {
    totalClaims: claimsData.totalClaims || 0,
    totalClaimsAmount: claimsData.totalClaimsAmount || 0,
    claimsByYear: claimsData.claimsByYear || [],
    claimsByType: claimsData.claimsByType || [],
    averageClaimAmount: claimsData.averageClaimAmount || 0,
    maxClaimAmount: claimsData.maxClaimAmount || 0,
    openClaimsCount: claimsData.openClaimsCount || 0,
    openClaimsReserve: claimsData.openClaimsReserve || 0,
  };
  
  const enforcementActions: EnforcementSummary = {
    activeRestrictedDrivers: enforcementData.activeRestrictedDrivers || 0,
    activeSuspendedDrivers: enforcementData.activeSuspendedDrivers || 0,
    disqualifiedLast12Months: enforcementData.disqualifiedLast12Months || 0,
    enforcementActions: enforcementData.enforcementActions || [],
    complianceRate: enforcementData.complianceRate || 0,
  };
  
  const exposureAnalysis: ExposureAnalysis = {
    totalExposure: exposureData.totalExposure || 0,
    exposureByMarket: exposureData.exposureByMarket || [],
    exposureByRiskTier: exposureData.exposureByRiskTier || [],
    concentrationRisk: exposureData.concentrationRisk || 0,
    peakExposure: exposureData.peakExposure || 0,
    averageExposure: exposureData.averageExposure || 0,
  };
  
  const riskMitigation: RiskMitigation = {
    safetyProgramsActive: metrics.SAFETY_PROGRAMS || 0,
    trainingCompletionRate: metrics.TRAINING_COMPLETION || 0,
    vehicleInspectionRate: metrics.VEHICLE_INSPECTION_RATE || 0,
    backgroundCheckCompliance: metrics.BACKGROUND_CHECK_RATE || 0,
    insuranceVerificationRate: metrics.INSURANCE_VERIFICATION_RATE || 0,
    mitigationInvestment: metrics.MITIGATION_INVESTMENT || 0,
  };
  
  const lossRatios: LossRatioData = {
    currentYearLossRatio: metrics.LOSS_RATIO || 0,
    priorYearLossRatio: metrics.PRIOR_YEAR_LOSS_RATIO || 0,
    threeYearAverage: metrics.THREE_YEAR_LOSS_RATIO || 0,
    industryBenchmark: 0.60,
    trend: 'STABLE',
  };
  
  const pack: InsuranceRenewalPack = {
    id: generateId('insurance'),
    packType: 'INSURANCE_RENEWAL',
    version: getPackVersion(),
    generatedAt: new Date().toISOString(),
    contentHash: '',
    periodStart,
    periodEnd,
    claimsHistory,
    enforcementActions,
    exposureAnalysis,
    riskMitigation,
    lossRatios,
  };
  
  pack.contentHash = generateContentHash(pack);
  reportPacks.set(pack.id, pack);
  
  addAuditRecord({
    action: 'PACK_GENERATED',
    entityType: 'PACK',
    entityId: pack.id,
    actor: 'SYSTEM',
    details: { packType: 'INSURANCE_RENEWAL', periodStart, periodEnd },
    contentHash: pack.contentHash,
  });
  
  return pack;
}

/**
 * Generate diligence pack (push-button).
 */
export function generateDiligencePack(
  periodStart: string,
  periodEnd: string,
  metrics: Record<string, number>,
  options: { full: boolean } = { full: true }
): DiligencePack {
  const rygFlagsResult = evaluateAllRYG(metrics);
  const rygSummary = getRYGSummary(rygFlagsResult);
  
  const financialSummary: FinancialSummary = {
    revenue: metrics.REVENUE || 0,
    revenueGrowthPercent: metrics.REVENUE_GROWTH || 0,
    grossMargin: metrics.GROSS_MARGIN || 0,
    operatingExpenses: metrics.OPERATING_EXPENSES || 0,
    ebitda: metrics.EBITDA || 0,
    ebitdaMargin: metrics.EBITDA_MARGIN || 0,
    cashPosition: metrics.CASH_POSITION || 0,
    accountsReceivable: metrics.ACCOUNTS_RECEIVABLE || 0,
    accountsPayable: metrics.ACCOUNTS_PAYABLE || 0,
    daysReceivable: metrics.DAYS_RECEIVABLE || 0,
    daysPayable: metrics.DAYS_PAYABLE || 0,
  };
  
  const operationalMetrics: OperationalMetrics = {
    totalMoves: metrics.TOTAL_MOVES || 0,
    moveGrowthPercent: metrics.MOVE_GROWTH || 0,
    activeDrivers: metrics.ACTIVE_DRIVERS || 0,
    driverTurnoverPercent: metrics.DRIVER_TURNOVER || 0,
    averageRevenuePerMove: metrics.REVENUE_PER_MOVE || 0,
    utilizationRate: metrics.UTILIZATION || 0,
    onTimeDeliveryRate: metrics.ON_TIME_RATE || 0,
    customerRetentionRate: metrics.CUSTOMER_RETENTION || 0,
    marketCount: metrics.MARKET_COUNT || 0,
    marketConcentration: [],
  };
  
  const safetyMetrics: SafetyMetrics = {
    incidentRate: metrics.INCIDENT_RATE || 0,
    incidentRateTrend: 'STABLE',
    totalIncidents: metrics.TOTAL_INCIDENTS || 0,
    severityBreakdown: [],
    claimsFrequency: metrics.CLAIMS_FREQUENCY || 0,
    claimsSeverity: metrics.CLAIMS_SEVERITY || 0,
    safetyScore: metrics.SAFETY_SCORE || 0,
  };
  
  const governanceStatus: GovernanceStatus = {
    boardMeetingsHeld: metrics.BOARD_MEETINGS_HELD || 0,
    boardMeetingsRequired: metrics.BOARD_MEETINGS_REQUIRED || 4,
    auditStatus: 'CURRENT',
    policyReviewStatus: 'CURRENT',
    complianceTrainingPercent: metrics.TRAINING_COMPLETION || 0,
    openAuditFindings: metrics.AUDIT_FINDINGS || 0,
    materialWeaknesses: metrics.MATERIAL_WEAKNESSES || 0,
  };
  
  const executiveSummary: ExecutiveSummary = {
    companyOverview: 'Driver management platform providing logistics services',
    keyStrengths: [
      'Strong operational metrics',
      'Experienced management team',
      'Scalable technology platform',
    ],
    keyRisks: rygSummary.criticalFindings,
    overallRating: rygSummary.overall,
    recommendedNextSteps: [],
  };
  
  const materialFindings: MaterialFinding[] = rygFlagsResult
    .filter(f => f.status === 'RED')
    .map(f => ({
      id: generateId('finding'),
      category: f.category,
      severity: 'HIGH' as const,
      title: f.title,
      description: f.description,
      impact: 'Requires attention',
      recommendation: 'Address underlying issue',
      status: 'OPEN' as const,
    }));
  
  const pack: DiligencePack = {
    id: generateId('diligence'),
    packType: options.full ? 'DILIGENCE_FULL' : 'DILIGENCE_SUMMARY',
    version: getPackVersion(),
    generatedAt: new Date().toISOString(),
    contentHash: '',
    periodStart,
    periodEnd,
    executiveSummary,
    operationalDiligence: {
      businessModel: 'Asset-light driver management platform',
      marketPosition: 'Regional leader in vehicle transport logistics',
      competitiveAdvantages: ['Technology platform', 'Driver network', 'Customer relationships'],
      operationalMetrics,
      scalabilityAssessment: 'High scalability potential',
      technologyStack: 'Modern cloud-based architecture',
    },
    financialDiligence: {
      financialSummary,
      revenueQuality: 'Recurring customer base with high retention',
      costStructure: 'Variable cost model with low fixed costs',
      workingCapitalAnalysis: 'Efficient working capital management',
      cashFlowAnalysis: 'Positive operating cash flow',
    },
    safetyDiligence: {
      safetyMetrics,
      safetyPrograms: ['Driver training', 'Vehicle inspection', 'Incident response'],
      regulatoryCompliance: 'Full compliance with DOT and state regulations',
      insuranceCoverage: 'Comprehensive coverage with major carriers',
      claimsHistory: {
        totalClaims: 0,
        totalClaimsAmount: 0,
        claimsByYear: [],
        claimsByType: [],
        averageClaimAmount: 0,
        maxClaimAmount: 0,
        openClaimsCount: 0,
        openClaimsReserve: 0,
      },
    },
    governanceDiligence: {
      corporateStructure: 'Standard corporate structure',
      boardComposition: 'Experienced board with industry expertise',
      keyPersonnelRisk: 'Moderate - succession planning in place',
      policiesAndProcedures: ['Code of conduct', 'Safety policy', 'Data privacy policy'],
      auditHistory: 'Annual audits with no material findings',
      governanceStatus,
    },
    rygSummary,
    materialFindings,
  };
  
  pack.contentHash = generateContentHash(pack);
  reportPacks.set(pack.id, pack);
  
  addAuditRecord({
    action: 'PACK_GENERATED',
    entityType: 'PACK',
    entityId: pack.id,
    actor: 'SYSTEM',
    details: { packType: pack.packType, periodStart, periodEnd },
    contentHash: pack.contentHash,
  });
  
  return pack;
}

/**
 * Generate carve-out export.
 */
export function generateCarveOut(
  scope: CarveOutScope,
  entities: EntityData[],
  financials: Partial<CarveOutFinancials>,
  operations: Partial<CarveOutOperations>
): CarveOutExport {
  const dataContractFields: DataContractField[] = [
    { name: 'entityId', type: 'string', required: true, description: 'Unique entity identifier' },
    { name: 'entityName', type: 'string', required: true, description: 'Entity display name' },
    { name: 'entityType', type: 'string', required: true, description: 'Type classification' },
    { name: 'status', type: 'string', required: true, description: 'Current status' },
    { name: 'metrics', type: 'object', required: true, description: 'Key performance metrics' },
    { name: 'relationships', type: 'array', required: false, description: 'Entity relationships' },
  ];
  
  const dataContract: DataContractVersion = {
    version: '1.0.0',
    schemaHash: generateSchemaHash(dataContractFields),
    effectiveDate: new Date().toISOString(),
    fields: dataContractFields,
  };
  
  dataContracts.set(dataContract.version, dataContract);
  
  const pack: CarveOutExport = {
    id: generateId('carveout'),
    packType: 'CARVE_OUT',
    version: getPackVersion(),
    generatedAt: new Date().toISOString(),
    contentHash: '',
    scope,
    entityData: entities,
    financialData: {
      allocatedRevenue: financials.allocatedRevenue || 0,
      allocatedCosts: financials.allocatedCosts || 0,
      directCosts: financials.directCosts || 0,
      sharedCostsAllocated: financials.sharedCostsAllocated || 0,
      allocationMethodology: financials.allocationMethodology || 'Pro-rata by revenue',
      standaloneCostEstimate: financials.standaloneCostEstimate || 0,
    },
    operationalData: {
      totalMoves: operations.totalMoves || 0,
      activeDrivers: operations.activeDrivers || 0,
      activeCustomers: operations.activeCustomers || 0,
      sharedResources: operations.sharedResources || [],
      transitionRequirements: operations.transitionRequirements || [],
    },
    dataContract,
  };
  
  pack.contentHash = generateContentHash(pack);
  reportPacks.set(pack.id, pack);
  
  addAuditRecord({
    action: 'CARVE_OUT_CREATED',
    entityType: 'PACK',
    entityId: pack.id,
    actor: 'SYSTEM',
    details: { scope, entityCount: entities.length },
    contentHash: pack.contentHash,
  });
  
  return pack;
}

// ============================================
// DATA ROOM ACCESS CONTROLS
// ============================================

/**
 * Create data room access token.
 */
export function createDataRoomToken(
  audience: InstitutionalAudience,
  entityId: string,
  entityName: string,
  grantedBy: string,
  options: {
    expiresInDays?: number;
    accessLevel?: 'VIEW_ONLY' | 'DOWNLOAD' | 'FULL';
    allowedPacks?: ReportPackType[];
    ipRestrictions?: string[];
    watermarkEnabled?: boolean;
  } = {}
): DataRoomAccessToken {
  const id = generateId('drtoken');
  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (options.expiresInDays || 30) * 24 * 60 * 60 * 1000);
  
  const accessToken: DataRoomAccessToken = {
    id,
    token,
    audience,
    entityId,
    entityName,
    grantedBy,
    grantedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    accessLevel: options.accessLevel || 'VIEW_ONLY',
    allowedPacks: options.allowedPacks || ['LENDER_QUARTERLY', 'CAPITAL_SUMMARY'],
    ipRestrictions: options.ipRestrictions,
    watermarkEnabled: options.watermarkEnabled !== false,
    isActive: true,
    usageCount: 0,
  };
  
  accessTokens.set(id, accessToken);
  accessTokens.set(token, accessToken);
  
  addAuditRecord({
    action: 'TOKEN_CREATED',
    entityType: 'TOKEN',
    entityId: id,
    actor: grantedBy,
    audience,
    details: { accessLevel: accessToken.accessLevel, allowedPacks: accessToken.allowedPacks },
  });
  
  return accessToken;
}

/**
 * Validate data room token.
 */
export function validateDataRoomToken(
  token: string,
  ipAddress?: string
): { valid: boolean; token?: DataRoomAccessToken; error?: string } {
  const accessToken = accessTokens.get(token);
  
  if (!accessToken) {
    return { valid: false, error: 'Token not found' };
  }
  
  if (!accessToken.isActive) {
    return { valid: false, error: 'Token has been revoked' };
  }
  
  if (new Date(accessToken.expiresAt) < new Date()) {
    return { valid: false, error: 'Token has expired' };
  }
  
  if (accessToken.ipRestrictions && accessToken.ipRestrictions.length > 0 && ipAddress) {
    if (!accessToken.ipRestrictions.includes(ipAddress)) {
      addAuditRecord({
        action: 'DATA_ROOM_ACCESS',
        entityType: 'TOKEN',
        entityId: accessToken.id,
        actor: accessToken.entityName,
        audience: accessToken.audience,
        ipAddress,
        details: { error: 'IP restriction violation' },
      });
      return { valid: false, error: 'Access denied from this IP address' };
    }
  }
  
  return { valid: true, token: accessToken };
}

/**
 * Use data room token to access a pack.
 */
export function accessPackWithToken(
  token: string,
  packId: string,
  ipAddress?: string
): { success: boolean; pack?: ReportPack; error?: string; watermark?: string } {
  const validation = validateDataRoomToken(token, ipAddress);
  
  if (!validation.valid || !validation.token) {
    return { success: false, error: validation.error };
  }
  
  const accessToken = validation.token;
  const pack = reportPacks.get(packId);
  
  if (!pack) {
    return { success: false, error: 'Pack not found' };
  }
  
  if (!accessToken.allowedPacks.includes(pack.packType)) {
    addAuditRecord({
      action: 'DATA_ROOM_ACCESS',
      entityType: 'PACK',
      entityId: packId,
      actor: accessToken.entityName,
      audience: accessToken.audience,
      ipAddress,
      details: { error: 'Pack type not allowed', packType: pack.packType },
    });
    return { success: false, error: 'Access to this pack type not allowed' };
  }
  
  accessToken.usageCount++;
  accessToken.lastAccessedAt = new Date().toISOString();
  accessTokens.set(accessToken.id, accessToken);
  accessTokens.set(token, accessToken);
  
  let watermark: string | undefined;
  if (accessToken.watermarkEnabled) {
    watermark = `CONFIDENTIAL - ${accessToken.entityName} - ${new Date().toISOString()}`;
  }
  
  addAuditRecord({
    action: 'PACK_ACCESSED',
    entityType: 'PACK',
    entityId: packId,
    actor: accessToken.entityName,
    audience: accessToken.audience,
    ipAddress,
    details: { packType: pack.packType, accessLevel: accessToken.accessLevel },
    contentHash: pack.contentHash,
  });
  
  return { success: true, pack, watermark };
}

/**
 * Revoke data room token.
 */
export function revokeDataRoomToken(tokenId: string, revokedBy: string): boolean {
  const accessToken = accessTokens.get(tokenId);
  if (!accessToken) return false;
  
  accessToken.isActive = false;
  accessTokens.set(tokenId, accessToken);
  accessTokens.set(accessToken.token, accessToken);
  
  addAuditRecord({
    action: 'TOKEN_REVOKED',
    entityType: 'TOKEN',
    entityId: tokenId,
    actor: revokedBy,
    audience: accessToken.audience,
    details: {},
  });
  
  return true;
}

/**
 * Get data room token.
 */
export function getDataRoomToken(tokenId: string): DataRoomAccessToken | null {
  return accessTokens.get(tokenId) || null;
}

/**
 * List data room tokens.
 */
export function listDataRoomTokens(filters?: {
  audience?: InstitutionalAudience;
  isActive?: boolean;
}): DataRoomAccessToken[] {
  const tokens = Array.from(accessTokens.values());
  const uniqueTokens = new Map<string, DataRoomAccessToken>();
  
  for (const token of tokens) {
    if (!uniqueTokens.has(token.id)) {
      uniqueTokens.set(token.id, token);
    }
  }
  
  let results = Array.from(uniqueTokens.values());
  
  if (filters) {
    if (filters.audience) {
      results = results.filter(t => t.audience === filters.audience);
    }
    if (filters.isActive !== undefined) {
      results = results.filter(t => t.isActive === filters.isActive);
    }
  }
  
  return results.sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
}

// ============================================
// DISTRIBUTION MANAGEMENT
// ============================================

/**
 * Create distribution record.
 */
export function createDistribution(
  packId: string,
  recipientId: string,
  recipientName: string,
  recipientType: InstitutionalAudience,
  distributedBy: string,
  method: 'DATA_ROOM' | 'SECURE_DOWNLOAD' | 'EMAIL_ENCRYPTED'
): DistributionRecord | null {
  const pack = reportPacks.get(packId);
  if (!pack) return null;
  
  const record: DistributionRecord = {
    id: generateId('dist'),
    packId,
    packType: pack.packType,
    recipientId,
    recipientName,
    recipientType,
    distributedAt: new Date().toISOString(),
    distributedBy,
    method,
    contentHash: pack.contentHash,
    acknowledged: false,
    accessCount: 0,
  };
  
  distributions.set(record.id, record);
  
  addAuditRecord({
    action: 'PACK_DISTRIBUTED',
    entityType: 'DISTRIBUTION',
    entityId: record.id,
    actor: distributedBy,
    audience: recipientType,
    details: { packId, packType: pack.packType, method },
    contentHash: pack.contentHash,
  });
  
  return record;
}

/**
 * Acknowledge distribution.
 */
export function acknowledgeDistribution(distributionId: string): boolean {
  const record = distributions.get(distributionId);
  if (!record) return false;
  
  record.acknowledged = true;
  record.acknowledgedAt = new Date().toISOString();
  distributions.set(distributionId, record);
  
  return true;
}

/**
 * Get distribution record.
 */
export function getDistribution(distributionId: string): DistributionRecord | null {
  return distributions.get(distributionId) || null;
}

/**
 * List distributions.
 */
export function listDistributions(filters?: {
  packId?: string;
  recipientId?: string;
  recipientType?: InstitutionalAudience;
}): DistributionRecord[] {
  let results = Array.from(distributions.values());
  
  if (filters) {
    if (filters.packId) {
      results = results.filter(d => d.packId === filters.packId);
    }
    if (filters.recipientId) {
      results = results.filter(d => d.recipientId === filters.recipientId);
    }
    if (filters.recipientType) {
      results = results.filter(d => d.recipientType === filters.recipientType);
    }
  }
  
  return results.sort((a, b) => b.distributedAt.localeCompare(a.distributedAt));
}

// ============================================
// REPORT PACK MANAGEMENT
// ============================================

/**
 * Get report pack by ID.
 */
export function getReportPack(packId: string): ReportPack | null {
  return reportPacks.get(packId) || null;
}

/**
 * List report packs.
 */
export function listReportPacks(filters?: {
  packType?: ReportPackType;
  startDate?: string;
  endDate?: string;
}): ReportPack[] {
  let results = Array.from(reportPacks.values());
  
  if (filters) {
    if (filters.packType) {
      results = results.filter(p => p.packType === filters.packType);
    }
    if (filters.startDate) {
      results = results.filter(p => p.generatedAt >= filters.startDate!);
    }
    if (filters.endDate) {
      results = results.filter(p => p.generatedAt <= filters.endDate!);
    }
  }
  
  return results.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

/**
 * Verify pack integrity.
 */
export function verifyPackIntegrity(packId: string): { valid: boolean; storedHash: string; computedHash: string } {
  const pack = reportPacks.get(packId);
  if (!pack) {
    return { valid: false, storedHash: '', computedHash: '' };
  }
  
  const storedHash = pack.contentHash;
  const packCopy = { ...pack, contentHash: '' };
  const computedHash = generateContentHash(packCopy);
  
  return {
    valid: storedHash === computedHash,
    storedHash,
    computedHash,
  };
}

// ============================================
// DATA CONTRACTS
// ============================================

/**
 * Get data contract version.
 */
export function getDataContract(version: string): DataContractVersion | null {
  return dataContracts.get(version) || null;
}

/**
 * List data contracts.
 */
export function listDataContracts(): DataContractVersion[] {
  return Array.from(dataContracts.values());
}

/**
 * Validate data against contract.
 */
export function validateAgainstContract(
  data: Record<string, unknown>,
  contractVersion: string
): { valid: boolean; errors: string[] } {
  const contract = dataContracts.get(contractVersion);
  if (!contract) {
    return { valid: false, errors: ['Contract version not found'] };
  }
  
  const errors: string[] = [];
  
  for (const field of contract.fields) {
    if (field.required && !(field.name in data)) {
      errors.push(`Missing required field: ${field.name}`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}

// ============================================
// AUDIT TRAIL
// ============================================

/**
 * Get audit records.
 */
export function getAuditRecords(filters?: {
  action?: CapitalReportAuditRecord['action'];
  entityType?: CapitalReportAuditRecord['entityType'];
  entityId?: string;
  audience?: InstitutionalAudience;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): CapitalReportAuditRecord[] {
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
    if (filters.audience) {
      results = results.filter(r => r.audience === filters.audience);
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
// CLEANUP
// ============================================

/**
 * Clear all data (for testing).
 */
export function clearCapitalReportingData(): void {
  reportPacks.clear();
  covenants.clear();
  rygFlags.clear();
  accessTokens.clear();
  distributions.clear();
  dataContracts.clear();
  auditLog.length = 0;
}
