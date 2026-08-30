/**
 * Customer / OEM / Partner Reporting Engine (INCREMENT 18)
 * 
 * Features:
 * 1. Read-only reporting views segmented by audience (customer, OEM, partner)
 * 2. Controlled cost transparency metrics (no margins or pay)
 * 3. Report packet generator (JSON, CSV, PDF-ready)
 * 4. Token-based access with time and market scoping
 * 5. Full audit trail of report generation and access
 * 
 * NOT implementing:
 * - Customer dashboards
 * - Pricing logic
 * - Marketing visuals
 */

// ============================================
// TYPES & ENUMS
// ============================================

/** Report audience types */
export type ReportAudience = 'CUSTOMER' | 'OEM' | 'PARTNER' | 'INTERNAL';

/** Report types available */
export type ReportType = 
  | 'DELIVERY_SUMMARY'
  | 'PERFORMANCE_METRICS'
  | 'SAFETY_OVERVIEW'
  | 'UTILIZATION_REPORT'
  | 'VOLUME_ANALYSIS'
  | 'SERVICE_QUALITY'
  | 'COMPLIANCE_STATUS'
  | 'MARKET_OVERVIEW';

/** Report format */
export type ReportFormat = 'JSON' | 'CSV' | 'PDF_READY';

/** Access token scope */
export interface AccessTokenScope {
  marketIds?: string[];
  zoneIds?: string[];
  startDate?: string;
  endDate?: string;
  reportTypes?: ReportType[];
}

/** Access token */
export interface ReportAccessToken {
  id: string;
  token: string;
  audience: ReportAudience;
  entityId: string;
  entityName: string;
  scope: AccessTokenScope;
  createdAt: string;
  expiresAt: string;
  createdBy: string;
  isActive: boolean;
  lastUsedAt?: string;
  usageCount: number;
}

/** Report request */
export interface ReportRequest {
  tokenId: string;
  reportType: ReportType;
  format: ReportFormat;
  parameters?: ReportParameters;
}

/** Report parameters */
export interface ReportParameters {
  startDate?: string;
  endDate?: string;
  marketId?: string;
  zoneId?: string;
  groupBy?: 'DAY' | 'WEEK' | 'MONTH';
  includeComparison?: boolean;
  comparisonPeriod?: 'PREVIOUS_PERIOD' | 'YEAR_OVER_YEAR';
}

/** Report data - base */
export interface ReportData {
  reportId: string;
  reportType: ReportType;
  audience: ReportAudience;
  generatedAt: string;
  parameters: ReportParameters;
  metadata: ReportMetadata;
}

/** Report metadata */
export interface ReportMetadata {
  title: string;
  description: string;
  periodStart: string;
  periodEnd: string;
  marketsCovered: string[];
  dataPointCount: number;
  generationTimeMs: number;
}

/** Delivery summary report */
export interface DeliverySummaryReport extends ReportData {
  reportType: 'DELIVERY_SUMMARY';
  data: {
    totalDeliveries: number;
    completedDeliveries: number;
    cancelledDeliveries: number;
    completionRate: number;
    averageTimeMinutes: number;
    onTimeRate: number;
    byMarket?: { marketId: string; marketName: string; deliveries: number; completionRate: number }[];
    byPeriod?: { period: string; deliveries: number; completionRate: number }[];
  };
}

/** Performance metrics report */
export interface PerformanceMetricsReport extends ReportData {
  reportType: 'PERFORMANCE_METRICS';
  data: {
    overallScore: number;
    onTimePerformance: number;
    qualityScore: number;
    customerSatisfaction: number;
    efficiencyIndex: number;
    trends: { metric: string; current: number; previous: number; change: number }[];
  };
}

/** Safety overview report */
export interface SafetyOverviewReport extends ReportData {
  reportType: 'SAFETY_OVERVIEW';
  data: {
    incidentFreeRate: number;
    totalMoves: number;
    incidentCount: number;
    incidentRate: number;
    safetyScore: number;
    byCategory: { category: string; count: number; rate: number }[];
  };
}

/** Utilization report */
export interface UtilizationReport extends ReportData {
  reportType: 'UTILIZATION_REPORT';
  data: {
    averageUtilization: number;
    peakUtilization: number;
    capacityUsed: number;
    capacityAvailable: number;
    byPeriod: { period: string; utilization: number }[];
  };
}

/** Volume analysis report */
export interface VolumeAnalysisReport extends ReportData {
  reportType: 'VOLUME_ANALYSIS';
  data: {
    totalVolume: number;
    volumeGrowth: number;
    averageDailyVolume: number;
    peakDayVolume: number;
    byMarket: { marketId: string; volume: number; share: number }[];
    byPeriod: { period: string; volume: number; growth: number }[];
  };
}

/** Service quality report */
export interface ServiceQualityReport extends ReportData {
  reportType: 'SERVICE_QUALITY';
  data: {
    qualityScore: number;
    defectRate: number;
    firstTimeSuccessRate: number;
    customerComplaints: number;
    resolutionRate: number;
    byCategory: { category: string; score: number }[];
  };
}

/** Compliance status report */
export interface ComplianceStatusReport extends ReportData {
  reportType: 'COMPLIANCE_STATUS';
  data: {
    overallCompliance: number;
    documentsValid: number;
    documentsExpired: number;
    documentsPending: number;
    certificationRate: number;
    byRequirement: { requirement: string; compliant: number; total: number; rate: number }[];
  };
}

/** Market overview report */
export interface MarketOverviewReport extends ReportData {
  reportType: 'MARKET_OVERVIEW';
  data: {
    marketsActive: number;
    totalCapacity: number;
    utilizationRate: number;
    performanceScore: number;
    markets: {
      marketId: string;
      marketName: string;
      status: string;
      capacity: number;
      utilization: number;
      performance: number;
    }[];
  };
}

/** Union type for all reports */
export type Report = 
  | DeliverySummaryReport
  | PerformanceMetricsReport
  | SafetyOverviewReport
  | UtilizationReport
  | VolumeAnalysisReport
  | ServiceQualityReport
  | ComplianceStatusReport
  | MarketOverviewReport;

/** Report packet */
export interface ReportPacket {
  id: string;
  tokenId: string;
  audience: ReportAudience;
  format: ReportFormat;
  generatedAt: string;
  expiresAt: string;
  reports: Report[];
  content: string;
  contentType: string;
  sizeBytes: number;
}

/** Audit record */
export interface ReportAuditRecord {
  id: string;
  timestamp: string;
  action: 'TOKEN_CREATED' | 'TOKEN_REVOKED' | 'TOKEN_USED' | 'REPORT_GENERATED' | 
          'REPORT_ACCESSED' | 'PACKET_CREATED' | 'ACCESS_DENIED';
  tokenId?: string;
  reportId?: string;
  packetId?: string;
  audience: ReportAudience;
  entityId: string;
  actor: string;
  ipAddress?: string;
  details: Record<string, unknown>;
}

// ============================================
// STORAGE
// ============================================

const accessTokens: Map<string, ReportAccessToken> = new Map();
const generatedReports: Map<string, Report> = new Map();
const reportPackets: Map<string, ReportPacket> = new Map();
const auditLog: ReportAuditRecord[] = [];

// ============================================
// UTILITY FUNCTIONS
// ============================================

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'rpt_';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function addAuditRecord(record: Omit<ReportAuditRecord, 'id' | 'timestamp'>): void {
  const fullRecord: ReportAuditRecord = {
    ...record,
    id: generateId('audit'),
    timestamp: new Date().toISOString(),
  };
  auditLog.push(fullRecord);
}

/** Metrics visible to each audience */
const AUDIENCE_VISIBILITY: Record<ReportAudience, {
  reportTypes: ReportType[];
  excludeFields: string[];
}> = {
  CUSTOMER: {
    reportTypes: ['DELIVERY_SUMMARY', 'PERFORMANCE_METRICS', 'SERVICE_QUALITY'],
    excludeFields: ['costPerMove', 'laborCost', 'margin', 'profit', 'payRate', 'driverPay'],
  },
  OEM: {
    reportTypes: ['DELIVERY_SUMMARY', 'PERFORMANCE_METRICS', 'SAFETY_OVERVIEW', 'VOLUME_ANALYSIS', 'COMPLIANCE_STATUS'],
    excludeFields: ['margin', 'profit', 'payRate', 'driverPay', 'internalCost'],
  },
  PARTNER: {
    reportTypes: ['DELIVERY_SUMMARY', 'PERFORMANCE_METRICS', 'UTILIZATION_REPORT', 'MARKET_OVERVIEW'],
    excludeFields: ['margin', 'profit', 'internalCost', 'detailedFinancials'],
  },
  INTERNAL: {
    reportTypes: ['DELIVERY_SUMMARY', 'PERFORMANCE_METRICS', 'SAFETY_OVERVIEW', 'UTILIZATION_REPORT', 
                   'VOLUME_ANALYSIS', 'SERVICE_QUALITY', 'COMPLIANCE_STATUS', 'MARKET_OVERVIEW'],
    excludeFields: [],
  },
};

// ============================================
// TOKEN MANAGEMENT
// ============================================

/**
 * Create a new access token.
 */
export function createAccessToken(
  audience: ReportAudience,
  entityId: string,
  entityName: string,
  scope: AccessTokenScope,
  createdBy: string,
  expiresInDays: number = 30
): ReportAccessToken {
  const id = generateId('token');
  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);
  
  const accessToken: ReportAccessToken = {
    id,
    token,
    audience,
    entityId,
    entityName,
    scope,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    createdBy,
    isActive: true,
    usageCount: 0,
  };
  
  accessTokens.set(id, accessToken);
  accessTokens.set(token, accessToken); // Also index by token string
  
  addAuditRecord({
    action: 'TOKEN_CREATED',
    tokenId: id,
    audience,
    entityId,
    actor: createdBy,
    details: { scope, expiresAt: accessToken.expiresAt },
  });
  
  return accessToken;
}

/**
 * Validate and retrieve token.
 */
export function validateToken(token: string): { valid: boolean; token?: ReportAccessToken; error?: string } {
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
  
  return { valid: true, token: accessToken };
}

/**
 * Use a token (increments usage count).
 */
export function useToken(token: string): boolean {
  const accessToken = accessTokens.get(token);
  if (!accessToken) return false;
  
  accessToken.usageCount++;
  accessToken.lastUsedAt = new Date().toISOString();
  
  accessTokens.set(accessToken.id, accessToken);
  accessTokens.set(token, accessToken);
  
  addAuditRecord({
    action: 'TOKEN_USED',
    tokenId: accessToken.id,
    audience: accessToken.audience,
    entityId: accessToken.entityId,
    actor: accessToken.entityName,
    details: { usageCount: accessToken.usageCount },
  });
  
  return true;
}

/**
 * Revoke a token.
 */
export function revokeToken(tokenId: string, revokedBy: string): boolean {
  const accessToken = accessTokens.get(tokenId);
  if (!accessToken) return false;
  
  accessToken.isActive = false;
  accessTokens.set(tokenId, accessToken);
  accessTokens.set(accessToken.token, accessToken);
  
  addAuditRecord({
    action: 'TOKEN_REVOKED',
    tokenId,
    audience: accessToken.audience,
    entityId: accessToken.entityId,
    actor: revokedBy,
    details: {},
  });
  
  return true;
}

/**
 * Get token by ID.
 */
export function getToken(tokenId: string): ReportAccessToken | null {
  return accessTokens.get(tokenId) || null;
}

/**
 * List tokens for an entity.
 */
export function listTokens(entityId?: string): ReportAccessToken[] {
  const tokens = Array.from(accessTokens.values());
  const uniqueTokens = new Map<string, ReportAccessToken>();
  
  for (const token of tokens) {
    if (!uniqueTokens.has(token.id)) {
      uniqueTokens.set(token.id, token);
    }
  }
  
  let results = Array.from(uniqueTokens.values());
  
  if (entityId) {
    results = results.filter(t => t.entityId === entityId);
  }
  
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ============================================
// REPORT GENERATION
// ============================================

/**
 * Check if report type is allowed for audience.
 */
export function isReportAllowed(audience: ReportAudience, reportType: ReportType): boolean {
  return AUDIENCE_VISIBILITY[audience].reportTypes.includes(reportType);
}

/**
 * Get allowed report types for audience.
 */
export function getAllowedReportTypes(audience: ReportAudience): ReportType[] {
  return AUDIENCE_VISIBILITY[audience].reportTypes;
}

/**
 * Filter sensitive fields from report data.
 */
export function filterSensitiveFields<T extends Record<string, unknown>>(
  data: T,
  audience: ReportAudience
): T {
  const excludeFields = AUDIENCE_VISIBILITY[audience].excludeFields;
  const filtered = { ...data };
  
  for (const field of excludeFields) {
    delete (filtered as Record<string, unknown>)[field];
  }
  
  return filtered;
}

/**
 * Generate a report based on type.
 */
export function generateReport(
  reportType: ReportType,
  audience: ReportAudience,
  parameters: ReportParameters = {}
): Report | null {
  const startTime = Date.now();
  const reportId = generateId('report');
  
  if (!isReportAllowed(audience, reportType)) {
    return null;
  }
  
  const now = new Date();
  const periodEnd = parameters.endDate || now.toISOString().split('T')[0];
  const periodStart = parameters.startDate || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const baseMetadata: ReportMetadata = {
    title: getReportTitle(reportType),
    description: getReportDescription(reportType),
    periodStart,
    periodEnd,
    marketsCovered: parameters.marketId ? [parameters.marketId] : ['ALL'],
    dataPointCount: 0,
    generationTimeMs: 0,
  };
  
  let report: Report;
  
  switch (reportType) {
    case 'DELIVERY_SUMMARY':
      report = generateDeliverySummary(reportId, audience, parameters, baseMetadata);
      break;
    case 'PERFORMANCE_METRICS':
      report = generatePerformanceMetrics(reportId, audience, parameters, baseMetadata);
      break;
    case 'SAFETY_OVERVIEW':
      report = generateSafetyOverview(reportId, audience, parameters, baseMetadata);
      break;
    case 'UTILIZATION_REPORT':
      report = generateUtilizationReport(reportId, audience, parameters, baseMetadata);
      break;
    case 'VOLUME_ANALYSIS':
      report = generateVolumeAnalysis(reportId, audience, parameters, baseMetadata);
      break;
    case 'SERVICE_QUALITY':
      report = generateServiceQuality(reportId, audience, parameters, baseMetadata);
      break;
    case 'COMPLIANCE_STATUS':
      report = generateComplianceStatus(reportId, audience, parameters, baseMetadata);
      break;
    case 'MARKET_OVERVIEW':
      report = generateMarketOverview(reportId, audience, parameters, baseMetadata);
      break;
    default:
      return null;
  }
  
  report.metadata.generationTimeMs = Date.now() - startTime;
  generatedReports.set(reportId, report);
  
  addAuditRecord({
    action: 'REPORT_GENERATED',
    reportId,
    audience,
    entityId: parameters.marketId || 'ALL',
    actor: 'SYSTEM',
    details: { reportType, parameters, generationTimeMs: report.metadata.generationTimeMs },
  });
  
  return report;
}

// Report title/description helpers
function getReportTitle(reportType: ReportType): string {
  const titles: Record<ReportType, string> = {
    DELIVERY_SUMMARY: 'Delivery Summary Report',
    PERFORMANCE_METRICS: 'Performance Metrics Report',
    SAFETY_OVERVIEW: 'Safety Overview Report',
    UTILIZATION_REPORT: 'Utilization Report',
    VOLUME_ANALYSIS: 'Volume Analysis Report',
    SERVICE_QUALITY: 'Service Quality Report',
    COMPLIANCE_STATUS: 'Compliance Status Report',
    MARKET_OVERVIEW: 'Market Overview Report',
  };
  return titles[reportType];
}

function getReportDescription(reportType: ReportType): string {
  const descriptions: Record<ReportType, string> = {
    DELIVERY_SUMMARY: 'Summary of delivery operations including completion rates and timing metrics',
    PERFORMANCE_METRICS: 'Key performance indicators and trend analysis',
    SAFETY_OVERVIEW: 'Safety metrics and incident analysis',
    UTILIZATION_REPORT: 'Resource utilization and capacity metrics',
    VOLUME_ANALYSIS: 'Volume trends and distribution analysis',
    SERVICE_QUALITY: 'Service quality scores and customer feedback metrics',
    COMPLIANCE_STATUS: 'Document compliance and certification status',
    MARKET_OVERVIEW: 'Market-level summary of operations and performance',
  };
  return descriptions[reportType];
}

// Individual report generators (simulated data for demonstration)
function generateDeliverySummary(
  reportId: string,
  audience: ReportAudience,
  parameters: ReportParameters,
  metadata: ReportMetadata
): DeliverySummaryReport {
  const data = filterSensitiveFields({
    totalDeliveries: 1250,
    completedDeliveries: 1180,
    cancelledDeliveries: 70,
    completionRate: 94.4,
    averageTimeMinutes: 45,
    onTimeRate: 91.2,
    byMarket: [
      { marketId: 'denver', marketName: 'Denver', deliveries: 450, completionRate: 95.1 },
      { marketId: 'phoenix', marketName: 'Phoenix', deliveries: 380, completionRate: 93.8 },
      { marketId: 'seattle', marketName: 'Seattle', deliveries: 420, completionRate: 94.3 },
    ],
  }, audience);
  
  metadata.dataPointCount = 1250;
  
  return {
    reportId,
    reportType: 'DELIVERY_SUMMARY',
    audience,
    generatedAt: new Date().toISOString(),
    parameters,
    metadata,
    data,
  };
}

function generatePerformanceMetrics(
  reportId: string,
  audience: ReportAudience,
  parameters: ReportParameters,
  metadata: ReportMetadata
): PerformanceMetricsReport {
  const data = filterSensitiveFields({
    overallScore: 87.5,
    onTimePerformance: 91.2,
    qualityScore: 88.3,
    customerSatisfaction: 85.7,
    efficiencyIndex: 84.9,
    trends: [
      { metric: 'On-Time Performance', current: 91.2, previous: 89.5, change: 1.7 },
      { metric: 'Quality Score', current: 88.3, previous: 87.1, change: 1.2 },
      { metric: 'Customer Satisfaction', current: 85.7, previous: 86.2, change: -0.5 },
    ],
  }, audience);
  
  metadata.dataPointCount = 150;
  
  return {
    reportId,
    reportType: 'PERFORMANCE_METRICS',
    audience,
    generatedAt: new Date().toISOString(),
    parameters,
    metadata,
    data,
  };
}

function generateSafetyOverview(
  reportId: string,
  audience: ReportAudience,
  parameters: ReportParameters,
  metadata: ReportMetadata
): SafetyOverviewReport {
  const data = filterSensitiveFields({
    incidentFreeRate: 98.5,
    totalMoves: 1250,
    incidentCount: 19,
    incidentRate: 1.52,
    safetyScore: 92.3,
    byCategory: [
      { category: 'Minor Damage', count: 12, rate: 0.96 },
      { category: 'Property Contact', count: 5, rate: 0.40 },
      { category: 'Vehicle Incident', count: 2, rate: 0.16 },
    ],
  }, audience);
  
  metadata.dataPointCount = 1250;
  
  return {
    reportId,
    reportType: 'SAFETY_OVERVIEW',
    audience,
    generatedAt: new Date().toISOString(),
    parameters,
    metadata,
    data,
  };
}

function generateUtilizationReport(
  reportId: string,
  audience: ReportAudience,
  parameters: ReportParameters,
  metadata: ReportMetadata
): UtilizationReport {
  const data = filterSensitiveFields({
    averageUtilization: 78.5,
    peakUtilization: 95.2,
    capacityUsed: 785,
    capacityAvailable: 1000,
    byPeriod: [
      { period: 'Week 1', utilization: 75.3 },
      { period: 'Week 2', utilization: 79.8 },
      { period: 'Week 3', utilization: 82.1 },
      { period: 'Week 4', utilization: 76.8 },
    ],
  }, audience);
  
  metadata.dataPointCount = 30;
  
  return {
    reportId,
    reportType: 'UTILIZATION_REPORT',
    audience,
    generatedAt: new Date().toISOString(),
    parameters,
    metadata,
    data,
  };
}

function generateVolumeAnalysis(
  reportId: string,
  audience: ReportAudience,
  parameters: ReportParameters,
  metadata: ReportMetadata
): VolumeAnalysisReport {
  const data = filterSensitiveFields({
    totalVolume: 1250,
    volumeGrowth: 8.5,
    averageDailyVolume: 42,
    peakDayVolume: 68,
    byMarket: [
      { marketId: 'denver', volume: 450, share: 36 },
      { marketId: 'phoenix', volume: 380, share: 30.4 },
      { marketId: 'seattle', volume: 420, share: 33.6 },
    ],
    byPeriod: [
      { period: 'Week 1', volume: 285, growth: 5.2 },
      { period: 'Week 2', volume: 310, growth: 8.8 },
      { period: 'Week 3', volume: 335, growth: 8.1 },
      { period: 'Week 4', volume: 320, growth: -4.5 },
    ],
  }, audience);
  
  metadata.dataPointCount = 1250;
  
  return {
    reportId,
    reportType: 'VOLUME_ANALYSIS',
    audience,
    generatedAt: new Date().toISOString(),
    parameters,
    metadata,
    data,
  };
}

function generateServiceQuality(
  reportId: string,
  audience: ReportAudience,
  parameters: ReportParameters,
  metadata: ReportMetadata
): ServiceQualityReport {
  const data = filterSensitiveFields({
    qualityScore: 88.3,
    defectRate: 2.1,
    firstTimeSuccessRate: 94.5,
    customerComplaints: 15,
    resolutionRate: 93.3,
    byCategory: [
      { category: 'Timeliness', score: 91.2 },
      { category: 'Professionalism', score: 89.5 },
      { category: 'Communication', score: 86.8 },
      { category: 'Care & Handling', score: 85.7 },
    ],
  }, audience);
  
  metadata.dataPointCount = 200;
  
  return {
    reportId,
    reportType: 'SERVICE_QUALITY',
    audience,
    generatedAt: new Date().toISOString(),
    parameters,
    metadata,
    data,
  };
}

function generateComplianceStatus(
  reportId: string,
  audience: ReportAudience,
  parameters: ReportParameters,
  metadata: ReportMetadata
): ComplianceStatusReport {
  const data = filterSensitiveFields({
    overallCompliance: 94.2,
    documentsValid: 188,
    documentsExpired: 8,
    documentsPending: 4,
    certificationRate: 96.5,
    byRequirement: [
      { requirement: 'Driver License', compliant: 48, total: 50, rate: 96 },
      { requirement: 'Insurance', compliant: 50, total: 50, rate: 100 },
      { requirement: 'Vehicle Registration', compliant: 47, total: 50, rate: 94 },
      { requirement: 'Background Check', compliant: 45, total: 50, rate: 90 },
    ],
  }, audience);
  
  metadata.dataPointCount = 200;
  
  return {
    reportId,
    reportType: 'COMPLIANCE_STATUS',
    audience,
    generatedAt: new Date().toISOString(),
    parameters,
    metadata,
    data,
  };
}

function generateMarketOverview(
  reportId: string,
  audience: ReportAudience,
  parameters: ReportParameters,
  metadata: ReportMetadata
): MarketOverviewReport {
  const data = filterSensitiveFields({
    marketsActive: 3,
    totalCapacity: 150,
    utilizationRate: 78.5,
    performanceScore: 87.5,
    markets: [
      { marketId: 'denver', marketName: 'Denver', status: 'ACTIVE', capacity: 50, utilization: 82.3, performance: 88.1 },
      { marketId: 'phoenix', marketName: 'Phoenix', status: 'ACTIVE', capacity: 50, utilization: 75.8, performance: 86.5 },
      { marketId: 'seattle', marketName: 'Seattle', status: 'ACTIVE', capacity: 50, utilization: 77.4, performance: 87.9 },
    ],
  }, audience);
  
  metadata.dataPointCount = 3;
  
  return {
    reportId,
    reportType: 'MARKET_OVERVIEW',
    audience,
    generatedAt: new Date().toISOString(),
    parameters,
    metadata,
    data,
  };
}

// ============================================
// REPORT PACKET GENERATION
// ============================================

/**
 * Generate a report packet with multiple reports.
 */
export function generateReportPacket(
  token: string,
  reportTypes: ReportType[],
  format: ReportFormat,
  parameters: ReportParameters = {}
): ReportPacket | { error: string } {
  const validation = validateToken(token);
  
  if (!validation.valid || !validation.token) {
    addAuditRecord({
      action: 'ACCESS_DENIED',
      tokenId: token,
      audience: 'CUSTOMER',
      entityId: 'UNKNOWN',
      actor: 'SYSTEM',
      details: { error: validation.error },
    });
    return { error: validation.error || 'Invalid token' };
  }
  
  const accessToken = validation.token;
  useToken(token);
  
  // Validate report types are within scope
  const allowedTypes = accessToken.scope.reportTypes || getAllowedReportTypes(accessToken.audience);
  const requestedTypes = reportTypes.filter(t => allowedTypes.includes(t));
  
  if (requestedTypes.length === 0) {
    return { error: 'No valid report types requested' };
  }
  
  // Validate market scope
  if (parameters.marketId && accessToken.scope.marketIds) {
    if (!accessToken.scope.marketIds.includes(parameters.marketId)) {
      return { error: 'Market not within token scope' };
    }
  }
  
  // Validate date scope
  if (accessToken.scope.startDate && parameters.startDate) {
    if (parameters.startDate < accessToken.scope.startDate) {
      parameters.startDate = accessToken.scope.startDate;
    }
  }
  if (accessToken.scope.endDate && parameters.endDate) {
    if (parameters.endDate > accessToken.scope.endDate) {
      parameters.endDate = accessToken.scope.endDate;
    }
  }
  
  const reports: Report[] = [];
  
  for (const reportType of requestedTypes) {
    const report = generateReport(reportType, accessToken.audience, parameters);
    if (report) {
      reports.push(report);
    }
  }
  
  const packetId = generateId('packet');
  let content: string;
  let contentType: string;
  
  switch (format) {
    case 'JSON':
      content = JSON.stringify(reports, null, 2);
      contentType = 'application/json';
      break;
    case 'CSV':
      content = generateCSVContent(reports);
      contentType = 'text/csv';
      break;
    case 'PDF_READY':
      content = generatePDFReadyContent(reports);
      contentType = 'application/json';
      break;
  }
  
  const packet: ReportPacket = {
    id: packetId,
    tokenId: accessToken.id,
    audience: accessToken.audience,
    format,
    generatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    reports,
    content,
    contentType,
    sizeBytes: new TextEncoder().encode(content).length,
  };
  
  reportPackets.set(packetId, packet);
  
  addAuditRecord({
    action: 'PACKET_CREATED',
    packetId,
    tokenId: accessToken.id,
    audience: accessToken.audience,
    entityId: accessToken.entityId,
    actor: accessToken.entityName,
    details: { format, reportCount: reports.length, sizeBytes: packet.sizeBytes },
  });
  
  return packet;
}

/**
 * Generate CSV content from reports.
 */
function generateCSVContent(reports: Report[]): string {
  const lines: string[] = [];
  
  for (const report of reports) {
    lines.push(`# ${report.metadata.title}`);
    lines.push(`# Period: ${report.metadata.periodStart} to ${report.metadata.periodEnd}`);
    lines.push(`# Generated: ${report.generatedAt}`);
    lines.push('');
    
    const data = report.data as Record<string, unknown>;
    
    // Simple key-value pairs
    for (const [key, value] of Object.entries(data)) {
      if (typeof value !== 'object' || value === null) {
        lines.push(`${key},${value}`);
      }
    }
    
    // Arrays as tables
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value) && value.length > 0) {
        lines.push('');
        lines.push(`# ${key}`);
        const headers = Object.keys(value[0]);
        lines.push(headers.join(','));
        for (const row of value) {
          lines.push(headers.map(h => (row as Record<string, unknown>)[h]).join(','));
        }
      }
    }
    
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Generate PDF-ready content (structured JSON for PDF generation).
 */
function generatePDFReadyContent(reports: Report[]): string {
  const pdfData = {
    documentTitle: 'Report Packet',
    generatedAt: new Date().toISOString(),
    sections: reports.map(report => ({
      title: report.metadata.title,
      description: report.metadata.description,
      period: `${report.metadata.periodStart} to ${report.metadata.periodEnd}`,
      content: report.data,
      charts: getChartSuggestions(report),
    })),
  };
  
  return JSON.stringify(pdfData, null, 2);
}

/**
 * Get chart suggestions for PDF rendering.
 */
function getChartSuggestions(report: Report): { type: string; dataKey: string; title: string }[] {
  const suggestions: { type: string; dataKey: string; title: string }[] = [];
  
  const data = report.data as Record<string, unknown>;
  
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value) && value.length > 0) {
      if (key.includes('Period') || key.includes('period')) {
        suggestions.push({ type: 'line', dataKey: key, title: `${key} Trend` });
      } else if (key.includes('Market') || key.includes('market') || key.includes('Category') || key.includes('category')) {
        suggestions.push({ type: 'bar', dataKey: key, title: `${key} Distribution` });
      }
    }
  }
  
  return suggestions;
}

// ============================================
// REPORT ACCESS
// ============================================

/**
 * Get a report by ID.
 */
export function getReport(reportId: string): Report | null {
  return generatedReports.get(reportId) || null;
}

/**
 * Access a report packet.
 */
export function accessReportPacket(
  packetId: string,
  token: string
): ReportPacket | { error: string } {
  const validation = validateToken(token);
  
  if (!validation.valid || !validation.token) {
    addAuditRecord({
      action: 'ACCESS_DENIED',
      packetId,
      audience: 'CUSTOMER',
      entityId: 'UNKNOWN',
      actor: 'SYSTEM',
      details: { error: validation.error },
    });
    return { error: validation.error || 'Invalid token' };
  }
  
  const packet = reportPackets.get(packetId);
  
  if (!packet) {
    return { error: 'Packet not found' };
  }
  
  if (packet.tokenId !== validation.token.id) {
    addAuditRecord({
      action: 'ACCESS_DENIED',
      packetId,
      tokenId: validation.token.id,
      audience: validation.token.audience,
      entityId: validation.token.entityId,
      actor: validation.token.entityName,
      details: { error: 'Token does not match packet' },
    });
    return { error: 'Access denied' };
  }
  
  if (new Date(packet.expiresAt) < new Date()) {
    return { error: 'Packet has expired' };
  }
  
  useToken(token);
  
  addAuditRecord({
    action: 'REPORT_ACCESSED',
    packetId,
    tokenId: validation.token.id,
    audience: validation.token.audience,
    entityId: validation.token.entityId,
    actor: validation.token.entityName,
    details: { format: packet.format },
  });
  
  return packet;
}

// ============================================
// AUDIT TRAIL
// ============================================

/**
 * Get audit records with filters.
 */
export function getAuditRecords(filters?: {
  action?: ReportAuditRecord['action'];
  tokenId?: string;
  audience?: ReportAudience;
  entityId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): ReportAuditRecord[] {
  let results = [...auditLog];
  
  if (filters) {
    if (filters.action) {
      results = results.filter(r => r.action === filters.action);
    }
    if (filters.tokenId) {
      results = results.filter(r => r.tokenId === filters.tokenId);
    }
    if (filters.audience) {
      results = results.filter(r => r.audience === filters.audience);
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
 * Get access statistics for a token.
 */
export function getTokenStats(tokenId: string): {
  totalAccesses: number;
  reportsGenerated: number;
  packetsCreated: number;
  lastAccess: string | null;
} | null {
  const token = accessTokens.get(tokenId);
  if (!token) return null;
  
  const tokenAudit = auditLog.filter(r => r.tokenId === tokenId);
  
  return {
    totalAccesses: tokenAudit.filter(r => r.action === 'TOKEN_USED').length,
    reportsGenerated: tokenAudit.filter(r => r.action === 'REPORT_GENERATED').length,
    packetsCreated: tokenAudit.filter(r => r.action === 'PACKET_CREATED').length,
    lastAccess: token.lastUsedAt || null,
  };
}

// ============================================
// CLEANUP
// ============================================

/**
 * Clear all data (for testing).
 */
export function clearReportingData(): void {
  accessTokens.clear();
  generatedReports.clear();
  reportPackets.clear();
  auditLog.length = 0;
}
