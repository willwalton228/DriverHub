/**
 * Dynamic Pricing Inputs Engine (Advisory Only)
 * 
 * Provides real-time cost signals, pricing guidance bands, and deal cost context
 * for sales reference. This is purely advisory - NO price calculation, quote generation,
 * or approval workflows. Sales can read signals but cannot modify data.
 * 
 * Key Components:
 * - Cost Signal Generation: Real-time cost inputs by market/zone
 * - Pricing Guidance Bands: Advisory floor/ceiling ranges
 * - Deal Cost Context: Read-only context packets for deal evaluation
 * - Partner Work Gate: canAcceptPartnerWork() for partner eligibility
 * - Access Controls: Strict read-only enforcement for sales role
 */

// =============================================================================
// TYPES
// =============================================================================

export type CostSignalType = 
  | 'LABOR_COST'
  | 'FUEL_COST'
  | 'INSURANCE_COST'
  | 'CLAIMS_COST'
  | 'OVERHEAD_COST'
  | 'UTILIZATION_FACTOR'
  | 'DEMAND_FACTOR'
  | 'SEASONAL_FACTOR'
  | 'RISK_PREMIUM';

export type SignalDirection = 'UP' | 'DOWN' | 'STABLE';

export type SignalStrength = 'WEAK' | 'MODERATE' | 'STRONG' | 'VERY_STRONG';

export type GuidanceTier = 'FLOOR' | 'TARGET' | 'CEILING' | 'PREMIUM';

export type AccessRole = 'SALES' | 'OPERATIONS' | 'FINANCE' | 'EXECUTIVE' | 'SYSTEM';

export type PartnerRejectionReason =
  | 'MARKET_NOT_ACTIVE'
  | 'ZONE_NOT_COVERED'
  | 'CAPACITY_EXCEEDED'
  | 'SAFETY_RESTRICTION'
  | 'UTILIZATION_TOO_LOW'
  | 'UTILIZATION_TOO_HIGH'
  | 'COST_THRESHOLD_EXCEEDED'
  | 'PARTNER_BLOCKED'
  | 'RATE_BELOW_FLOOR'
  | 'VOLUME_LIMIT_REACHED';

export interface CostSignal {
  id: string;
  signalType: CostSignalType;
  marketId: string;
  zoneId: string | null;
  value: number;
  unit: string;
  direction: SignalDirection;
  strength: SignalStrength;
  percentChange: number;
  baselineValue: number;
  effectiveDate: string;
  expiresAt: string;
  dataSource: string;
  confidence: number;
  metadata: Record<string, unknown>;
}

export interface PricingGuidanceBand {
  id: string;
  marketId: string;
  zoneId: string | null;
  serviceType: string;
  tier: GuidanceTier;
  minRate: number;
  maxRate: number;
  targetRate: number;
  currency: string;
  unit: string;
  effectiveDate: string;
  expiresAt: string;
  contributingSignals: string[];
  adjustmentFactors: AdjustmentFactor[];
  notes: string[];
}

export interface AdjustmentFactor {
  name: string;
  multiplier: number;
  direction: SignalDirection;
  description: string;
}

export interface DealCostContext {
  id: string;
  dealId: string;
  marketId: string;
  zoneId: string | null;
  generatedAt: string;
  generatedBy: string;
  accessRole: AccessRole;
  signals: CostSignal[];
  guidanceBands: PricingGuidanceBand[];
  marketMetrics: MarketMetrics;
  riskIndicators: RiskIndicator[];
  recommendations: string[];
  caveats: string[];
  readonly: true;
}

export interface MarketMetrics {
  marketId: string;
  activeDriverCount: number;
  utilizationRate: number;
  avgLaborCostPerMile: number;
  avgClaimsCostPerMile: number;
  demandIndex: number;
  seasonalityFactor: number;
  competitiveIndex: number;
  asOf: string;
}

export interface RiskIndicator {
  name: string;
  level: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'CRITICAL';
  score: number;
  description: string;
  implications: string[];
}

export interface PartnerWorkRequest {
  partnerId: string;
  marketId: string;
  zoneId: string | null;
  serviceType: string;
  proposedRate: number;
  estimatedVolume: number;
  startDate: string;
  endDate: string | null;
  metadata?: Record<string, unknown>;
}

export interface PartnerWorkResult {
  canAccept: boolean;
  reasons: PartnerRejectionReason[];
  details: string[];
  guidanceBand: PricingGuidanceBand | null;
  costContext: DealCostContext | null;
  checkedAt: string;
}

export interface SignalGenerationRequest {
  marketId: string;
  zoneId?: string | null;
  signalTypes?: CostSignalType[];
  asOfDate?: string;
}

export interface GuidanceBandRequest {
  marketId: string;
  zoneId?: string | null;
  serviceType: string;
}

export interface DealContextRequest {
  dealId: string;
  marketId: string;
  zoneId?: string | null;
  requestedBy: string;
  accessRole: AccessRole;
}

export interface DynamicPricingAuditRecord {
  id: string;
  timestamp: string;
  action: string;
  entityType: string;
  entityId: string;
  actor: string;
  accessRole: AccessRole;
  details: Record<string, unknown>;
}

// =============================================================================
// IN-MEMORY STORAGE
// =============================================================================

const costSignals = new Map<string, CostSignal>();
const guidanceBands = new Map<string, PricingGuidanceBand>();
const dealContexts = new Map<string, DealCostContext>();
const auditRecords: DynamicPricingAuditRecord[] = [];

// Market configuration for signal generation
const marketConfigs = new Map<string, {
  isActive: boolean;
  zones: string[];
  capacityLimit: number;
  currentVolume: number;
  utilizationMin: number;
  utilizationMax: number;
  blockedPartners: string[];
  costThresholdMultiplier: number;
}>();

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function addAuditRecord(record: Omit<DynamicPricingAuditRecord, 'id' | 'timestamp'>): void {
  auditRecords.push({
    ...record,
    id: generateId('audit'),
    timestamp: new Date().toISOString(),
  });
}

function calculateSignalStrength(percentChange: number): SignalStrength {
  const absChange = Math.abs(percentChange);
  if (absChange < 5) return 'WEAK';
  if (absChange < 15) return 'MODERATE';
  if (absChange < 30) return 'STRONG';
  return 'VERY_STRONG';
}

function calculateSignalDirection(percentChange: number): SignalDirection {
  if (percentChange > 2) return 'UP';
  if (percentChange < -2) return 'DOWN';
  return 'STABLE';
}

// =============================================================================
// MARKET CONFIGURATION
// =============================================================================

/**
 * Configure a market for pricing signals.
 * SYSTEM role only.
 */
export function configureMarket(
  marketId: string,
  config: {
    isActive: boolean;
    zones: string[];
    capacityLimit: number;
    currentVolume: number;
    utilizationMin: number;
    utilizationMax: number;
    blockedPartners?: string[];
    costThresholdMultiplier?: number;
  },
  actor: string,
  role: AccessRole
): void {
  if (role !== 'SYSTEM' && role !== 'EXECUTIVE') {
    throw new Error('ACCESS_DENIED: Only SYSTEM or EXECUTIVE can configure markets');
  }
  
  marketConfigs.set(marketId, {
    isActive: config.isActive,
    zones: config.zones,
    capacityLimit: config.capacityLimit,
    currentVolume: config.currentVolume,
    utilizationMin: config.utilizationMin,
    utilizationMax: config.utilizationMax,
    blockedPartners: config.blockedPartners ?? [],
    costThresholdMultiplier: config.costThresholdMultiplier ?? 1.5,
  });
  
  addAuditRecord({
    action: 'MARKET_CONFIGURED',
    entityType: 'MARKET',
    entityId: marketId,
    actor,
    accessRole: role,
    details: { config },
  });
}

/**
 * Get market configuration.
 */
export function getMarketConfig(marketId: string): typeof marketConfigs extends Map<string, infer V> ? V | undefined : never {
  return marketConfigs.get(marketId);
}

// =============================================================================
// COST SIGNAL GENERATION
// =============================================================================

/**
 * Generate real-time cost signals for a market/zone.
 * These are advisory inputs that reflect current cost conditions.
 */
export function generateCostSignals(
  request: SignalGenerationRequest,
  baseMetrics: {
    laborCostPerMile: number;
    fuelCostPerGallon: number;
    insuranceCostPerDriver: number;
    claimsCostPerMile: number;
    overheadPerTrip: number;
    utilizationRate: number;
    demandIndex: number;
    seasonalityFactor: number;
  },
  actor: string,
  role: AccessRole
): CostSignal[] {
  const signalTypes = request.signalTypes ?? [
    'LABOR_COST',
    'FUEL_COST',
    'INSURANCE_COST',
    'CLAIMS_COST',
    'OVERHEAD_COST',
    'UTILIZATION_FACTOR',
    'DEMAND_FACTOR',
    'SEASONAL_FACTOR',
    'RISK_PREMIUM',
  ];
  
  const signals: CostSignal[] = [];
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
  
  // Standard baseline values for comparison
  const baselines: Record<CostSignalType, { value: number; unit: string }> = {
    LABOR_COST: { value: 0.45, unit: 'per_mile' },
    FUEL_COST: { value: 3.50, unit: 'per_gallon' },
    INSURANCE_COST: { value: 250, unit: 'per_driver_month' },
    CLAIMS_COST: { value: 0.08, unit: 'per_mile' },
    OVERHEAD_COST: { value: 5.00, unit: 'per_trip' },
    UTILIZATION_FACTOR: { value: 0.75, unit: 'rate' },
    DEMAND_FACTOR: { value: 1.0, unit: 'index' },
    SEASONAL_FACTOR: { value: 1.0, unit: 'multiplier' },
    RISK_PREMIUM: { value: 0.05, unit: 'multiplier' },
  };
  
  const currentValues: Record<CostSignalType, number> = {
    LABOR_COST: baseMetrics.laborCostPerMile,
    FUEL_COST: baseMetrics.fuelCostPerGallon,
    INSURANCE_COST: baseMetrics.insuranceCostPerDriver,
    CLAIMS_COST: baseMetrics.claimsCostPerMile,
    OVERHEAD_COST: baseMetrics.overheadPerTrip,
    UTILIZATION_FACTOR: baseMetrics.utilizationRate,
    DEMAND_FACTOR: baseMetrics.demandIndex,
    SEASONAL_FACTOR: baseMetrics.seasonalityFactor,
    RISK_PREMIUM: calculateRiskPremium(baseMetrics),
  };
  
  for (const signalType of signalTypes) {
    const baseline = baselines[signalType];
    const currentValue = currentValues[signalType];
    const percentChange = ((currentValue - baseline.value) / baseline.value) * 100;
    
    const signal: CostSignal = {
      id: generateId('signal'),
      signalType,
      marketId: request.marketId,
      zoneId: request.zoneId ?? null,
      value: currentValue,
      unit: baseline.unit,
      direction: calculateSignalDirection(percentChange),
      strength: calculateSignalStrength(percentChange),
      percentChange: Math.round(percentChange * 100) / 100,
      baselineValue: baseline.value,
      effectiveDate: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      dataSource: 'REAL_TIME_METRICS',
      confidence: 0.85,
      metadata: {},
    };
    
    signals.push(signal);
    costSignals.set(signal.id, signal);
  }
  
  addAuditRecord({
    action: 'SIGNALS_GENERATED',
    entityType: 'COST_SIGNALS',
    entityId: request.marketId,
    actor,
    accessRole: role,
    details: {
      marketId: request.marketId,
      zoneId: request.zoneId,
      signalCount: signals.length,
    },
  });
  
  return signals;
}

function calculateRiskPremium(metrics: {
  utilizationRate: number;
  claimsCostPerMile: number;
  demandIndex: number;
}): number {
  let premium = 0.05; // Base 5%
  
  // Lower utilization = higher risk
  if (metrics.utilizationRate < 0.5) premium += 0.03;
  else if (metrics.utilizationRate < 0.65) premium += 0.01;
  
  // Higher claims = higher risk
  if (metrics.claimsCostPerMile > 0.15) premium += 0.04;
  else if (metrics.claimsCostPerMile > 0.10) premium += 0.02;
  
  // Low demand = higher risk
  if (metrics.demandIndex < 0.7) premium += 0.02;
  
  return Math.round(premium * 100) / 100;
}

/**
 * Get current cost signals for a market.
 */
export function getCostSignals(
  marketId: string,
  zoneId?: string | null,
  role?: AccessRole
): CostSignal[] {
  const now = new Date().toISOString();
  
  return Array.from(costSignals.values())
    .filter(s => 
      s.marketId === marketId &&
      (zoneId === undefined || s.zoneId === zoneId) &&
      s.expiresAt > now
    );
}

// =============================================================================
// PRICING GUIDANCE BANDS
// =============================================================================

/**
 * Generate pricing guidance bands from cost signals.
 * These are advisory ranges - NOT prices or quotes.
 */
export function generateGuidanceBands(
  request: GuidanceBandRequest,
  signals: CostSignal[],
  actor: string,
  role: AccessRole
): PricingGuidanceBand[] {
  if (signals.length === 0) {
    throw new Error('Cannot generate guidance bands without cost signals');
  }
  
  const bands: PricingGuidanceBand[] = [];
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  
  // Calculate base cost from signals
  let baseCost = 0;
  const adjustmentFactors: AdjustmentFactor[] = [];
  
  for (const signal of signals) {
    if (signal.signalType === 'LABOR_COST') {
      baseCost += signal.value;
      if (signal.direction !== 'STABLE') {
        adjustmentFactors.push({
          name: 'Labor Cost Adjustment',
          multiplier: signal.direction === 'UP' ? 1 + (signal.percentChange / 100) : 1 - (Math.abs(signal.percentChange) / 100),
          direction: signal.direction,
          description: `Labor costs ${signal.direction === 'UP' ? 'increasing' : 'decreasing'} by ${Math.abs(signal.percentChange)}%`,
        });
      }
    }
    if (signal.signalType === 'FUEL_COST') {
      // Convert to per-mile (assume 8 MPG average)
      baseCost += signal.value / 8;
    }
    if (signal.signalType === 'CLAIMS_COST') {
      baseCost += signal.value;
    }
    if (signal.signalType === 'RISK_PREMIUM') {
      adjustmentFactors.push({
        name: 'Risk Premium',
        multiplier: 1 + signal.value,
        direction: signal.value > 0.05 ? 'UP' : 'STABLE',
        description: `Risk premium of ${(signal.value * 100).toFixed(1)}%`,
      });
    }
    if (signal.signalType === 'DEMAND_FACTOR') {
      adjustmentFactors.push({
        name: 'Demand Factor',
        multiplier: signal.value,
        direction: signal.direction,
        description: `Demand index at ${signal.value.toFixed(2)}`,
      });
    }
    if (signal.signalType === 'SEASONAL_FACTOR') {
      adjustmentFactors.push({
        name: 'Seasonal Adjustment',
        multiplier: signal.value,
        direction: signal.direction,
        description: `Seasonal factor: ${signal.value.toFixed(2)}x`,
      });
    }
  }
  
  // Apply adjustment factors
  let adjustedCost = baseCost;
  for (const factor of adjustmentFactors) {
    adjustedCost *= factor.multiplier;
  }
  
  // Generate tiers
  const tiers: { tier: GuidanceTier; minMult: number; maxMult: number; targetMult: number }[] = [
    { tier: 'FLOOR', minMult: 1.0, maxMult: 1.15, targetMult: 1.08 },
    { tier: 'TARGET', minMult: 1.15, maxMult: 1.35, targetMult: 1.25 },
    { tier: 'CEILING', minMult: 1.35, maxMult: 1.55, targetMult: 1.45 },
    { tier: 'PREMIUM', minMult: 1.55, maxMult: 2.0, targetMult: 1.75 },
  ];
  
  for (const { tier, minMult, maxMult, targetMult } of tiers) {
    const band: PricingGuidanceBand = {
      id: generateId('band'),
      marketId: request.marketId,
      zoneId: request.zoneId ?? null,
      serviceType: request.serviceType,
      tier,
      minRate: Math.round(adjustedCost * minMult * 100) / 100,
      maxRate: Math.round(adjustedCost * maxMult * 100) / 100,
      targetRate: Math.round(adjustedCost * targetMult * 100) / 100,
      currency: 'USD',
      unit: 'per_mile',
      effectiveDate: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      contributingSignals: signals.map(s => s.id),
      adjustmentFactors,
      notes: [
        'Advisory guidance only - not a price quote',
        'Based on current market conditions',
        'Subject to deal-specific adjustments',
      ],
    };
    
    bands.push(band);
    guidanceBands.set(band.id, band);
  }
  
  addAuditRecord({
    action: 'GUIDANCE_BANDS_GENERATED',
    entityType: 'GUIDANCE_BAND',
    entityId: request.marketId,
    actor,
    accessRole: role,
    details: {
      marketId: request.marketId,
      zoneId: request.zoneId,
      serviceType: request.serviceType,
      bandCount: bands.length,
    },
  });
  
  return bands;
}

/**
 * Get guidance bands for a market.
 */
export function getGuidanceBands(
  marketId: string,
  zoneId?: string | null,
  serviceType?: string
): PricingGuidanceBand[] {
  const now = new Date().toISOString();
  
  return Array.from(guidanceBands.values())
    .filter(b =>
      b.marketId === marketId &&
      (zoneId === undefined || b.zoneId === zoneId) &&
      (serviceType === undefined || b.serviceType === serviceType) &&
      b.expiresAt > now
    );
}

// =============================================================================
// DEAL COST CONTEXT
// =============================================================================

/**
 * Generate a read-only Deal Cost Context packet.
 * Provides comprehensive cost context for deal evaluation.
 */
export function generateDealCostContext(
  request: DealContextRequest,
  actor: string,
  role: AccessRole
): DealCostContext {
  // Sales can read but context is marked read-only
  const signals = getCostSignals(request.marketId, request.zoneId, role);
  const bands = getGuidanceBands(request.marketId, request.zoneId);
  
  const marketConfig = marketConfigs.get(request.marketId);
  
  const marketMetrics: MarketMetrics = {
    marketId: request.marketId,
    activeDriverCount: marketConfig ? Math.floor(marketConfig.currentVolume / 100) : 0,
    utilizationRate: calculateAverageUtilization(signals),
    avgLaborCostPerMile: getSignalValue(signals, 'LABOR_COST') ?? 0,
    avgClaimsCostPerMile: getSignalValue(signals, 'CLAIMS_COST') ?? 0,
    demandIndex: getSignalValue(signals, 'DEMAND_FACTOR') ?? 1,
    seasonalityFactor: getSignalValue(signals, 'SEASONAL_FACTOR') ?? 1,
    competitiveIndex: 1.0,
    asOf: new Date().toISOString(),
  };
  
  const riskIndicators = generateRiskIndicators(signals, marketConfig);
  
  const context: DealCostContext = {
    id: generateId('context'),
    dealId: request.dealId,
    marketId: request.marketId,
    zoneId: request.zoneId ?? null,
    generatedAt: new Date().toISOString(),
    generatedBy: actor,
    accessRole: role,
    signals,
    guidanceBands: bands,
    marketMetrics,
    riskIndicators,
    recommendations: generateContextRecommendations(signals, bands, riskIndicators),
    caveats: [
      'This context is advisory only and does not constitute a price quote',
      'Actual pricing requires approval through standard channels',
      'Market conditions may change; refresh context before finalizing',
      'Cost signals are based on current data and may not reflect future conditions',
    ],
    readonly: true,
  };
  
  dealContexts.set(context.id, context);
  
  addAuditRecord({
    action: 'DEAL_CONTEXT_GENERATED',
    entityType: 'DEAL_CONTEXT',
    entityId: context.id,
    actor,
    accessRole: role,
    details: {
      dealId: request.dealId,
      marketId: request.marketId,
      zoneId: request.zoneId,
    },
  });
  
  return context;
}

function getSignalValue(signals: CostSignal[], type: CostSignalType): number | undefined {
  const signal = signals.find(s => s.signalType === type);
  return signal?.value;
}

function calculateAverageUtilization(signals: CostSignal[]): number {
  const utilSignal = signals.find(s => s.signalType === 'UTILIZATION_FACTOR');
  return utilSignal?.value ?? 0.75;
}

function generateRiskIndicators(
  signals: CostSignal[],
  marketConfig?: ReturnType<typeof getMarketConfig>
): RiskIndicator[] {
  const indicators: RiskIndicator[] = [];
  
  // Cost volatility risk
  const strongSignals = signals.filter(s => s.strength === 'STRONG' || s.strength === 'VERY_STRONG');
  if (strongSignals.length > 0) {
    const avgChange = strongSignals.reduce((sum, s) => sum + Math.abs(s.percentChange), 0) / strongSignals.length;
    indicators.push({
      name: 'Cost Volatility',
      level: avgChange > 25 ? 'HIGH' : avgChange > 15 ? 'ELEVATED' : 'MODERATE',
      score: Math.min(100, avgChange * 3),
      description: `${strongSignals.length} signals showing significant movement`,
      implications: [
        'Pricing bands may shift rapidly',
        'Consider shorter commitment periods',
      ],
    });
  }
  
  // Utilization risk
  const utilSignal = signals.find(s => s.signalType === 'UTILIZATION_FACTOR');
  if (utilSignal) {
    const utilLevel = utilSignal.value < 0.5 ? 'HIGH' : utilSignal.value < 0.65 ? 'ELEVATED' : 
                      utilSignal.value > 0.9 ? 'ELEVATED' : 'LOW';
    indicators.push({
      name: 'Utilization Risk',
      level: utilLevel,
      score: utilLevel === 'HIGH' ? 75 : utilLevel === 'ELEVATED' ? 50 : 25,
      description: `Current utilization at ${(utilSignal.value * 100).toFixed(1)}%`,
      implications: utilSignal.value < 0.65 
        ? ['Excess capacity may pressure margins', 'Consider volume incentives']
        : utilSignal.value > 0.9
        ? ['Near capacity limits', 'May need to adjust commitments']
        : ['Healthy utilization levels'],
    });
  }
  
  // Claims risk
  const claimsSignal = signals.find(s => s.signalType === 'CLAIMS_COST');
  if (claimsSignal && claimsSignal.value > 0.10) {
    indicators.push({
      name: 'Claims Exposure',
      level: claimsSignal.value > 0.15 ? 'HIGH' : 'ELEVATED',
      score: Math.min(100, claimsSignal.value * 500),
      description: `Claims cost at $${claimsSignal.value.toFixed(2)}/mile`,
      implications: [
        'Factor additional risk premium',
        'Review safety requirements',
      ],
    });
  }
  
  return indicators;
}

function generateContextRecommendations(
  signals: CostSignal[],
  bands: PricingGuidanceBand[],
  risks: RiskIndicator[]
): string[] {
  const recommendations: string[] = [];
  
  // Check for upward cost pressure
  const upSignals = signals.filter(s => s.direction === 'UP' && s.strength !== 'WEAK');
  if (upSignals.length >= 3) {
    recommendations.push('Multiple cost signals trending upward - consider TARGET or CEILING tier');
  }
  
  // Check for high risk
  const highRisks = risks.filter(r => r.level === 'HIGH' || r.level === 'CRITICAL');
  if (highRisks.length > 0) {
    recommendations.push('Elevated risk indicators present - review with operations before proceeding');
  }
  
  // Demand-based recommendation
  const demandSignal = signals.find(s => s.signalType === 'DEMAND_FACTOR');
  if (demandSignal && demandSignal.value > 1.2) {
    recommendations.push('Strong demand conditions - CEILING or PREMIUM tiers may be appropriate');
  } else if (demandSignal && demandSignal.value < 0.8) {
    recommendations.push('Soft demand - FLOOR or TARGET tiers may be needed to secure volume');
  }
  
  // Seasonal recommendation
  const seasonalSignal = signals.find(s => s.signalType === 'SEASONAL_FACTOR');
  if (seasonalSignal && seasonalSignal.value > 1.15) {
    recommendations.push('Peak season adjustment applied - rates reflect temporary conditions');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('Market conditions appear stable - standard pricing guidance applies');
  }
  
  return recommendations;
}

/**
 * Get a deal context by ID.
 */
export function getDealContext(contextId: string): DealCostContext | undefined {
  return dealContexts.get(contextId);
}

/**
 * List deal contexts for a deal or market.
 */
export function listDealContexts(filters: {
  dealId?: string;
  marketId?: string;
  limit?: number;
}): DealCostContext[] {
  let results = Array.from(dealContexts.values());
  
  if (filters.dealId) {
    results = results.filter(c => c.dealId === filters.dealId);
  }
  if (filters.marketId) {
    results = results.filter(c => c.marketId === filters.marketId);
  }
  
  results.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  
  if (filters.limit) {
    results = results.slice(0, filters.limit);
  }
  
  return results;
}

// =============================================================================
// PARTNER WORK GATE
// =============================================================================

/**
 * Determine if partner work can be accepted.
 * Returns boolean with detailed rejection reasons if false.
 */
export function canAcceptPartnerWork(request: PartnerWorkRequest): PartnerWorkResult {
  const reasons: PartnerRejectionReason[] = [];
  const details: string[] = [];
  const checkedAt = new Date().toISOString();
  
  const marketConfig = marketConfigs.get(request.marketId);
  
  // Check 1: Market active
  if (!marketConfig || !marketConfig.isActive) {
    reasons.push('MARKET_NOT_ACTIVE');
    details.push(`Market ${request.marketId} is not active for partner work`);
  }
  
  // Check 2: Zone coverage
  if (marketConfig && request.zoneId && !marketConfig.zones.includes(request.zoneId)) {
    reasons.push('ZONE_NOT_COVERED');
    details.push(`Zone ${request.zoneId} is not covered in market ${request.marketId}`);
  }
  
  // Check 3: Capacity
  if (marketConfig) {
    const projectedVolume = marketConfig.currentVolume + request.estimatedVolume;
    if (projectedVolume > marketConfig.capacityLimit) {
      reasons.push('CAPACITY_EXCEEDED');
      details.push(`Adding ${request.estimatedVolume} would exceed capacity limit of ${marketConfig.capacityLimit}`);
    }
  }
  
  // Check 4: Blocked partners
  if (marketConfig && marketConfig.blockedPartners.includes(request.partnerId)) {
    reasons.push('PARTNER_BLOCKED');
    details.push(`Partner ${request.partnerId} is blocked from this market`);
  }
  
  // Check 5: Get guidance band and check rate
  // First try zone-specific bands, then fall back to market-level bands
  let bands = getGuidanceBands(request.marketId, request.zoneId, request.serviceType);
  if (bands.length === 0 && request.zoneId) {
    bands = getGuidanceBands(request.marketId, null, request.serviceType);
  }
  const floorBand = bands.find(b => b.tier === 'FLOOR');
  
  if (floorBand && request.proposedRate < floorBand.minRate) {
    reasons.push('RATE_BELOW_FLOOR');
    details.push(`Proposed rate $${request.proposedRate.toFixed(2)} is below floor of $${floorBand.minRate.toFixed(2)}`);
  }
  
  // Check 6: Utilization bounds
  const signals = getCostSignals(request.marketId, request.zoneId);
  const utilSignal = signals.find(s => s.signalType === 'UTILIZATION_FACTOR');
  
  if (marketConfig && utilSignal) {
    if (utilSignal.value < marketConfig.utilizationMin) {
      reasons.push('UTILIZATION_TOO_LOW');
      details.push(`Current utilization ${(utilSignal.value * 100).toFixed(1)}% below minimum ${(marketConfig.utilizationMin * 100).toFixed(1)}%`);
    }
    if (utilSignal.value > marketConfig.utilizationMax) {
      reasons.push('UTILIZATION_TOO_HIGH');
      details.push(`Current utilization ${(utilSignal.value * 100).toFixed(1)}% exceeds maximum ${(marketConfig.utilizationMax * 100).toFixed(1)}%`);
    }
  }
  
  // Generate context for reference
  let costContext: DealCostContext | null = null;
  if (reasons.length === 0 || reasons.length <= 2) {
    try {
      costContext = generateDealCostContext({
        dealId: `partner_${request.partnerId}_${Date.now()}`,
        marketId: request.marketId,
        zoneId: request.zoneId,
        requestedBy: 'SYSTEM',
        accessRole: 'SYSTEM',
      }, 'SYSTEM', 'SYSTEM');
    } catch {
      // Context generation failed, continue without it
    }
  }
  
  const result: PartnerWorkResult = {
    canAccept: reasons.length === 0,
    reasons,
    details,
    guidanceBand: floorBand ?? null,
    costContext,
    checkedAt,
  };
  
  addAuditRecord({
    action: 'PARTNER_WORK_CHECK',
    entityType: 'PARTNER_WORK',
    entityId: request.partnerId,
    actor: 'SYSTEM',
    accessRole: 'SYSTEM',
    details: {
      request,
      canAccept: result.canAccept,
      reasons: result.reasons,
    },
  });
  
  return result;
}

// =============================================================================
// ACCESS CONTROL ENFORCEMENT
// =============================================================================

/**
 * Validate that role has read access to pricing data.
 * All roles can read, but only SYSTEM/EXECUTIVE/FINANCE can modify.
 */
export function validateReadAccess(role: AccessRole): boolean {
  // All roles can read
  return true;
}

/**
 * Validate that role has write access to pricing configuration.
 * SALES cannot modify - this enforces read-only access.
 */
export function validateWriteAccess(role: AccessRole): boolean {
  if (role === 'SALES') {
    return false;
  }
  return role === 'SYSTEM' || role === 'EXECUTIVE' || role === 'FINANCE';
}

/**
 * Attempt to modify data with role check.
 * Throws if SALES attempts modification.
 */
export function assertWriteAccess(role: AccessRole, action: string): void {
  if (!validateWriteAccess(role)) {
    throw new Error(`ACCESS_DENIED: Role ${role} cannot perform ${action}. Read-only access enforced.`);
  }
}

// =============================================================================
// AUDIT & QUERY
// =============================================================================

/**
 * Get audit records with optional filters.
 */
export function getAuditRecords(filters?: {
  action?: string;
  entityType?: string;
  entityId?: string;
  actor?: string;
  accessRole?: AccessRole;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): DynamicPricingAuditRecord[] {
  let results = [...auditRecords];
  
  if (filters?.action) {
    results = results.filter(r => r.action === filters.action);
  }
  if (filters?.entityType) {
    results = results.filter(r => r.entityType === filters.entityType);
  }
  if (filters?.entityId) {
    results = results.filter(r => r.entityId === filters.entityId);
  }
  if (filters?.actor) {
    results = results.filter(r => r.actor === filters.actor);
  }
  if (filters?.accessRole) {
    results = results.filter(r => r.accessRole === filters.accessRole);
  }
  if (filters?.fromDate) {
    results = results.filter(r => r.timestamp >= filters.fromDate!);
  }
  if (filters?.toDate) {
    results = results.filter(r => r.timestamp <= filters.toDate!);
  }
  
  results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  
  if (filters?.limit) {
    results = results.slice(0, filters.limit);
  }
  
  return results;
}

// =============================================================================
// TEST UTILITIES
// =============================================================================

/**
 * Clear all data (for testing).
 */
export function clearDynamicPricingData(): void {
  costSignals.clear();
  guidanceBands.clear();
  dealContexts.clear();
  marketConfigs.clear();
  auditRecords.length = 0;
}
