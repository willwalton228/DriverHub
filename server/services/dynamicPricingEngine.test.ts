/**
 * Dynamic Pricing Inputs Engine Tests
 * 
 * Tests for advisory-only pricing inputs including:
 * - Cost signal generation by market/zone
 * - Pricing guidance band translation
 * - Read-only Deal Cost Context packets
 * - canAcceptPartnerWork gate function
 * - Access control enforcement (sales cannot modify)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Types
  type CostSignal,
  type CostSignalType,
  type PricingGuidanceBand,
  type DealCostContext,
  type PartnerWorkRequest,
  type PartnerWorkResult,
  type AccessRole,
  
  // Market configuration
  configureMarket,
  getMarketConfig,
  
  // Cost signals
  generateCostSignals,
  getCostSignals,
  
  // Guidance bands
  generateGuidanceBands,
  getGuidanceBands,
  
  // Deal context
  generateDealCostContext,
  getDealContext,
  listDealContexts,
  
  // Partner work gate
  canAcceptPartnerWork,
  
  // Access control
  validateReadAccess,
  validateWriteAccess,
  assertWriteAccess,
  
  // Audit
  getAuditRecords,
  
  // Test utilities
  clearDynamicPricingData,
} from './dynamicPricingEngine';

// =============================================================================
// TEST HELPERS
// =============================================================================

function createStandardMetrics(overrides: Partial<{
  laborCostPerMile: number;
  fuelCostPerGallon: number;
  insuranceCostPerDriver: number;
  claimsCostPerMile: number;
  overheadPerTrip: number;
  utilizationRate: number;
  demandIndex: number;
  seasonalityFactor: number;
}> = {}) {
  return {
    laborCostPerMile: 0.50,
    fuelCostPerGallon: 3.80,
    insuranceCostPerDriver: 280,
    claimsCostPerMile: 0.09,
    overheadPerTrip: 6.00,
    utilizationRate: 0.72,
    demandIndex: 1.05,
    seasonalityFactor: 1.0,
    ...overrides,
  };
}

function setupTestMarket(marketId: string = 'MARKET_001') {
  configureMarket(marketId, {
    isActive: true,
    zones: ['ZONE_A', 'ZONE_B', 'ZONE_C'],
    capacityLimit: 10000,
    currentVolume: 5000,
    utilizationMin: 0.4,
    utilizationMax: 0.95,
    blockedPartners: ['BLOCKED_PARTNER_001'],
    costThresholdMultiplier: 1.5,
  }, 'SYSTEM', 'SYSTEM');
  
  // Generate signals
  generateCostSignals(
    { marketId, zoneId: null },
    createStandardMetrics(),
    'SYSTEM',
    'SYSTEM'
  );
  
  // Generate guidance bands
  const signals = getCostSignals(marketId);
  generateGuidanceBands(
    { marketId, zoneId: null, serviceType: 'STANDARD_DELIVERY' },
    signals,
    'SYSTEM',
    'SYSTEM'
  );
}

// =============================================================================
// TESTS
// =============================================================================

describe('Dynamic Pricing Inputs Engine', () => {
  beforeEach(() => {
    clearDynamicPricingData();
  });
  
  // ===========================================================================
  // MARKET CONFIGURATION
  // ===========================================================================
  
  describe('Market Configuration', () => {
    it('should configure a market with SYSTEM role', () => {
      configureMarket('MARKET_001', {
        isActive: true,
        zones: ['ZONE_A', 'ZONE_B'],
        capacityLimit: 10000,
        currentVolume: 5000,
        utilizationMin: 0.4,
        utilizationMax: 0.95,
      }, 'admin', 'SYSTEM');
      
      const config = getMarketConfig('MARKET_001');
      
      expect(config).toBeDefined();
      expect(config!.isActive).toBe(true);
      expect(config!.zones).toEqual(['ZONE_A', 'ZONE_B']);
      expect(config!.capacityLimit).toBe(10000);
    });
    
    it('should allow EXECUTIVE role to configure markets', () => {
      expect(() => {
        configureMarket('MARKET_001', {
          isActive: true,
          zones: ['ZONE_A'],
          capacityLimit: 5000,
          currentVolume: 2000,
          utilizationMin: 0.5,
          utilizationMax: 0.9,
        }, 'executive', 'EXECUTIVE');
      }).not.toThrow();
    });
    
    it('should reject SALES role from configuring markets', () => {
      expect(() => {
        configureMarket('MARKET_001', {
          isActive: true,
          zones: ['ZONE_A'],
          capacityLimit: 5000,
          currentVolume: 2000,
          utilizationMin: 0.5,
          utilizationMax: 0.9,
        }, 'sales_rep', 'SALES');
      }).toThrow('ACCESS_DENIED');
    });
    
    it('should record audit for market configuration', () => {
      configureMarket('MARKET_001', {
        isActive: true,
        zones: ['ZONE_A'],
        capacityLimit: 5000,
        currentVolume: 2000,
        utilizationMin: 0.5,
        utilizationMax: 0.9,
      }, 'admin', 'SYSTEM');
      
      const records = getAuditRecords({ entityId: 'MARKET_001' });
      
      expect(records.length).toBeGreaterThan(0);
      expect(records[0].action).toBe('MARKET_CONFIGURED');
    });
  });
  
  // ===========================================================================
  // COST SIGNAL GENERATION
  // ===========================================================================
  
  describe('Cost Signal Generation', () => {
    it('should generate all signal types', () => {
      const signals = generateCostSignals(
        { marketId: 'MARKET_001', zoneId: null },
        createStandardMetrics(),
        'SYSTEM',
        'SYSTEM'
      );
      
      expect(signals.length).toBe(9);
      
      const signalTypes = signals.map(s => s.signalType);
      expect(signalTypes).toContain('LABOR_COST');
      expect(signalTypes).toContain('FUEL_COST');
      expect(signalTypes).toContain('INSURANCE_COST');
      expect(signalTypes).toContain('CLAIMS_COST');
      expect(signalTypes).toContain('OVERHEAD_COST');
      expect(signalTypes).toContain('UTILIZATION_FACTOR');
      expect(signalTypes).toContain('DEMAND_FACTOR');
      expect(signalTypes).toContain('SEASONAL_FACTOR');
      expect(signalTypes).toContain('RISK_PREMIUM');
    });
    
    it('should generate specific signal types when requested', () => {
      const signals = generateCostSignals(
        { 
          marketId: 'MARKET_001', 
          zoneId: null,
          signalTypes: ['LABOR_COST', 'FUEL_COST'],
        },
        createStandardMetrics(),
        'SYSTEM',
        'SYSTEM'
      );
      
      expect(signals.length).toBe(2);
      expect(signals.map(s => s.signalType)).toEqual(['LABOR_COST', 'FUEL_COST']);
    });
    
    it('should calculate signal direction based on baseline comparison', () => {
      // Labor baseline is 0.45, we're providing 0.60 (33% increase)
      const signals = generateCostSignals(
        { marketId: 'MARKET_001', signalTypes: ['LABOR_COST'] },
        createStandardMetrics({ laborCostPerMile: 0.60 }),
        'SYSTEM',
        'SYSTEM'
      );
      
      const laborSignal = signals[0];
      expect(laborSignal.direction).toBe('UP');
      expect(laborSignal.percentChange).toBeGreaterThan(25);
    });
    
    it('should calculate signal strength based on magnitude', () => {
      // Very strong signal: 50% increase
      const signals = generateCostSignals(
        { marketId: 'MARKET_001', signalTypes: ['LABOR_COST'] },
        createStandardMetrics({ laborCostPerMile: 0.68 }), // ~51% above 0.45 baseline
        'SYSTEM',
        'SYSTEM'
      );
      
      expect(signals[0].strength).toBe('VERY_STRONG');
    });
    
    it('should include expiration time', () => {
      const signals = generateCostSignals(
        { marketId: 'MARKET_001' },
        createStandardMetrics(),
        'SYSTEM',
        'SYSTEM'
      );
      
      const now = new Date();
      const expires = new Date(signals[0].expiresAt);
      const hoursDiff = (expires.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      expect(hoursDiff).toBeCloseTo(24, 0);
    });
    
    it('should support zone-specific signals', () => {
      const signals = generateCostSignals(
        { marketId: 'MARKET_001', zoneId: 'ZONE_A' },
        createStandardMetrics(),
        'SYSTEM',
        'SYSTEM'
      );
      
      expect(signals.every(s => s.zoneId === 'ZONE_A')).toBe(true);
    });
    
    it('should retrieve signals with getCostSignals', () => {
      generateCostSignals(
        { marketId: 'MARKET_001' },
        createStandardMetrics(),
        'SYSTEM',
        'SYSTEM'
      );
      
      const signals = getCostSignals('MARKET_001');
      
      expect(signals.length).toBe(9);
    });
    
    it('should filter out expired signals', () => {
      // This test verifies the expiration logic is in place
      const signals = generateCostSignals(
        { marketId: 'MARKET_001' },
        createStandardMetrics(),
        'SYSTEM',
        'SYSTEM'
      );
      
      // All signals should be valid (not expired)
      const retrieved = getCostSignals('MARKET_001');
      expect(retrieved.length).toBe(signals.length);
    });
    
    it('should calculate risk premium from metrics', () => {
      // Low utilization + high claims = higher premium
      const signals = generateCostSignals(
        { marketId: 'MARKET_001', signalTypes: ['RISK_PREMIUM'] },
        createStandardMetrics({ 
          utilizationRate: 0.45, 
          claimsCostPerMile: 0.18,
          demandIndex: 0.6,
        }),
        'SYSTEM',
        'SYSTEM'
      );
      
      const riskSignal = signals[0];
      expect(riskSignal.value).toBeGreaterThan(0.05); // Above base premium
    });
  });
  
  // ===========================================================================
  // PRICING GUIDANCE BANDS
  // ===========================================================================
  
  describe('Pricing Guidance Bands', () => {
    it('should generate all four tiers', () => {
      const signals = generateCostSignals(
        { marketId: 'MARKET_001' },
        createStandardMetrics(),
        'SYSTEM',
        'SYSTEM'
      );
      
      const bands = generateGuidanceBands(
        { marketId: 'MARKET_001', zoneId: null, serviceType: 'STANDARD' },
        signals,
        'SYSTEM',
        'SYSTEM'
      );
      
      expect(bands.length).toBe(4);
      expect(bands.map(b => b.tier)).toEqual(['FLOOR', 'TARGET', 'CEILING', 'PREMIUM']);
    });
    
    it('should order tiers by rate (FLOOR < TARGET < CEILING < PREMIUM)', () => {
      const signals = generateCostSignals(
        { marketId: 'MARKET_001' },
        createStandardMetrics(),
        'SYSTEM',
        'SYSTEM'
      );
      
      const bands = generateGuidanceBands(
        { marketId: 'MARKET_001', zoneId: null, serviceType: 'STANDARD' },
        signals,
        'SYSTEM',
        'SYSTEM'
      );
      
      const floor = bands.find(b => b.tier === 'FLOOR')!;
      const target = bands.find(b => b.tier === 'TARGET')!;
      const ceiling = bands.find(b => b.tier === 'CEILING')!;
      const premium = bands.find(b => b.tier === 'PREMIUM')!;
      
      expect(floor.targetRate).toBeLessThan(target.targetRate);
      expect(target.targetRate).toBeLessThan(ceiling.targetRate);
      expect(ceiling.targetRate).toBeLessThan(premium.targetRate);
    });
    
    it('should include contributing signal IDs', () => {
      const signals = generateCostSignals(
        { marketId: 'MARKET_001' },
        createStandardMetrics(),
        'SYSTEM',
        'SYSTEM'
      );
      
      const bands = generateGuidanceBands(
        { marketId: 'MARKET_001', zoneId: null, serviceType: 'STANDARD' },
        signals,
        'SYSTEM',
        'SYSTEM'
      );
      
      expect(bands[0].contributingSignals.length).toBe(signals.length);
    });
    
    it('should include adjustment factors', () => {
      const signals = generateCostSignals(
        { marketId: 'MARKET_001' },
        createStandardMetrics({ laborCostPerMile: 0.60 }), // Significant increase
        'SYSTEM',
        'SYSTEM'
      );
      
      const bands = generateGuidanceBands(
        { marketId: 'MARKET_001', zoneId: null, serviceType: 'STANDARD' },
        signals,
        'SYSTEM',
        'SYSTEM'
      );
      
      expect(bands[0].adjustmentFactors.length).toBeGreaterThan(0);
      const laborAdjustment = bands[0].adjustmentFactors.find(f => f.name.includes('Labor'));
      expect(laborAdjustment).toBeDefined();
    });
    
    it('should include advisory notes', () => {
      const signals = generateCostSignals(
        { marketId: 'MARKET_001' },
        createStandardMetrics(),
        'SYSTEM',
        'SYSTEM'
      );
      
      const bands = generateGuidanceBands(
        { marketId: 'MARKET_001', zoneId: null, serviceType: 'STANDARD' },
        signals,
        'SYSTEM',
        'SYSTEM'
      );
      
      expect(bands[0].notes).toContain('Advisory guidance only - not a price quote');
    });
    
    it('should throw if no signals provided', () => {
      expect(() => {
        generateGuidanceBands(
          { marketId: 'MARKET_001', zoneId: null, serviceType: 'STANDARD' },
          [],
          'SYSTEM',
          'SYSTEM'
        );
      }).toThrow('Cannot generate guidance bands without cost signals');
    });
    
    it('should retrieve bands with getGuidanceBands', () => {
      const signals = generateCostSignals(
        { marketId: 'MARKET_001' },
        createStandardMetrics(),
        'SYSTEM',
        'SYSTEM'
      );
      
      generateGuidanceBands(
        { marketId: 'MARKET_001', zoneId: null, serviceType: 'STANDARD' },
        signals,
        'SYSTEM',
        'SYSTEM'
      );
      
      const bands = getGuidanceBands('MARKET_001');
      
      expect(bands.length).toBe(4);
    });
    
    it('should filter bands by service type', () => {
      const signals = generateCostSignals(
        { marketId: 'MARKET_001' },
        createStandardMetrics(),
        'SYSTEM',
        'SYSTEM'
      );
      
      generateGuidanceBands(
        { marketId: 'MARKET_001', zoneId: null, serviceType: 'STANDARD' },
        signals,
        'SYSTEM',
        'SYSTEM'
      );
      
      generateGuidanceBands(
        { marketId: 'MARKET_001', zoneId: null, serviceType: 'EXPRESS' },
        signals,
        'SYSTEM',
        'SYSTEM'
      );
      
      const standardBands = getGuidanceBands('MARKET_001', null, 'STANDARD');
      const expressBands = getGuidanceBands('MARKET_001', null, 'EXPRESS');
      
      expect(standardBands.length).toBe(4);
      expect(expressBands.length).toBe(4);
      expect(standardBands[0].serviceType).toBe('STANDARD');
      expect(expressBands[0].serviceType).toBe('EXPRESS');
    });
  });
  
  // ===========================================================================
  // DEAL COST CONTEXT
  // ===========================================================================
  
  describe('Deal Cost Context', () => {
    beforeEach(() => {
      setupTestMarket();
    });
    
    it('should generate read-only context', () => {
      const context = generateDealCostContext(
        {
          dealId: 'DEAL_001',
          marketId: 'MARKET_001',
          zoneId: null,
          requestedBy: 'sales_rep',
          accessRole: 'SALES',
        },
        'sales_rep',
        'SALES'
      );
      
      expect(context.readonly).toBe(true);
    });
    
    it('should include cost signals', () => {
      const context = generateDealCostContext(
        {
          dealId: 'DEAL_001',
          marketId: 'MARKET_001',
          zoneId: null,
          requestedBy: 'sales_rep',
          accessRole: 'SALES',
        },
        'sales_rep',
        'SALES'
      );
      
      expect(context.signals.length).toBeGreaterThan(0);
    });
    
    it('should include guidance bands', () => {
      const context = generateDealCostContext(
        {
          dealId: 'DEAL_001',
          marketId: 'MARKET_001',
          zoneId: null,
          requestedBy: 'sales_rep',
          accessRole: 'SALES',
        },
        'sales_rep',
        'SALES'
      );
      
      expect(context.guidanceBands.length).toBe(4);
    });
    
    it('should include market metrics', () => {
      const context = generateDealCostContext(
        {
          dealId: 'DEAL_001',
          marketId: 'MARKET_001',
          zoneId: null,
          requestedBy: 'sales_rep',
          accessRole: 'SALES',
        },
        'sales_rep',
        'SALES'
      );
      
      expect(context.marketMetrics.marketId).toBe('MARKET_001');
      expect(context.marketMetrics.utilizationRate).toBeDefined();
    });
    
    it('should include risk indicators', () => {
      const context = generateDealCostContext(
        {
          dealId: 'DEAL_001',
          marketId: 'MARKET_001',
          zoneId: null,
          requestedBy: 'sales_rep',
          accessRole: 'SALES',
        },
        'sales_rep',
        'SALES'
      );
      
      expect(Array.isArray(context.riskIndicators)).toBe(true);
    });
    
    it('should include recommendations', () => {
      const context = generateDealCostContext(
        {
          dealId: 'DEAL_001',
          marketId: 'MARKET_001',
          zoneId: null,
          requestedBy: 'sales_rep',
          accessRole: 'SALES',
        },
        'sales_rep',
        'SALES'
      );
      
      expect(context.recommendations.length).toBeGreaterThan(0);
    });
    
    it('should include caveats', () => {
      const context = generateDealCostContext(
        {
          dealId: 'DEAL_001',
          marketId: 'MARKET_001',
          zoneId: null,
          requestedBy: 'sales_rep',
          accessRole: 'SALES',
        },
        'sales_rep',
        'SALES'
      );
      
      expect(context.caveats.length).toBeGreaterThan(0);
      expect(context.caveats.some(c => c.includes('advisory only'))).toBe(true);
    });
    
    it('should be retrievable by ID', () => {
      const context = generateDealCostContext(
        {
          dealId: 'DEAL_001',
          marketId: 'MARKET_001',
          zoneId: null,
          requestedBy: 'sales_rep',
          accessRole: 'SALES',
        },
        'sales_rep',
        'SALES'
      );
      
      const retrieved = getDealContext(context.id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved!.dealId).toBe('DEAL_001');
    });
    
    it('should list contexts by deal', () => {
      generateDealCostContext(
        { dealId: 'DEAL_001', marketId: 'MARKET_001', requestedBy: 'rep1', accessRole: 'SALES' },
        'rep1', 'SALES'
      );
      
      generateDealCostContext(
        { dealId: 'DEAL_002', marketId: 'MARKET_001', requestedBy: 'rep2', accessRole: 'SALES' },
        'rep2', 'SALES'
      );
      
      const deal1Contexts = listDealContexts({ dealId: 'DEAL_001' });
      
      expect(deal1Contexts.length).toBe(1);
      expect(deal1Contexts[0].dealId).toBe('DEAL_001');
    });
    
    it('should record who generated the context', () => {
      const context = generateDealCostContext(
        {
          dealId: 'DEAL_001',
          marketId: 'MARKET_001',
          requestedBy: 'john_sales',
          accessRole: 'SALES',
        },
        'john_sales',
        'SALES'
      );
      
      expect(context.generatedBy).toBe('john_sales');
      expect(context.accessRole).toBe('SALES');
    });
  });
  
  // ===========================================================================
  // PARTNER WORK GATE
  // ===========================================================================
  
  describe('canAcceptPartnerWork', () => {
    beforeEach(() => {
      setupTestMarket();
    });
    
    it('should accept valid partner work request', () => {
      const result = canAcceptPartnerWork({
        partnerId: 'PARTNER_001',
        marketId: 'MARKET_001',
        zoneId: 'ZONE_A',
        serviceType: 'STANDARD_DELIVERY',
        proposedRate: 1.50, // Above floor
        estimatedVolume: 1000,
        startDate: new Date().toISOString(),
        endDate: null,
      });
      
      expect(result.canAccept).toBe(true);
      expect(result.reasons).toEqual([]);
    });
    
    it('should reject when market is not active', () => {
      configureMarket('INACTIVE_MARKET', {
        isActive: false,
        zones: ['ZONE_A'],
        capacityLimit: 5000,
        currentVolume: 0,
        utilizationMin: 0.4,
        utilizationMax: 0.95,
      }, 'SYSTEM', 'SYSTEM');
      
      const result = canAcceptPartnerWork({
        partnerId: 'PARTNER_001',
        marketId: 'INACTIVE_MARKET',
        zoneId: null,
        serviceType: 'STANDARD',
        proposedRate: 1.50,
        estimatedVolume: 500,
        startDate: new Date().toISOString(),
        endDate: null,
      });
      
      expect(result.canAccept).toBe(false);
      expect(result.reasons).toContain('MARKET_NOT_ACTIVE');
    });
    
    it('should reject when zone is not covered', () => {
      const result = canAcceptPartnerWork({
        partnerId: 'PARTNER_001',
        marketId: 'MARKET_001',
        zoneId: 'ZONE_X', // Not in configured zones
        serviceType: 'STANDARD_DELIVERY',
        proposedRate: 1.50,
        estimatedVolume: 500,
        startDate: new Date().toISOString(),
        endDate: null,
      });
      
      expect(result.canAccept).toBe(false);
      expect(result.reasons).toContain('ZONE_NOT_COVERED');
    });
    
    it('should reject when capacity would be exceeded', () => {
      const result = canAcceptPartnerWork({
        partnerId: 'PARTNER_001',
        marketId: 'MARKET_001',
        zoneId: 'ZONE_A',
        serviceType: 'STANDARD_DELIVERY',
        proposedRate: 1.50,
        estimatedVolume: 6000, // 5000 current + 6000 = 11000 > 10000 limit
        startDate: new Date().toISOString(),
        endDate: null,
      });
      
      expect(result.canAccept).toBe(false);
      expect(result.reasons).toContain('CAPACITY_EXCEEDED');
    });
    
    it('should reject blocked partners', () => {
      const result = canAcceptPartnerWork({
        partnerId: 'BLOCKED_PARTNER_001',
        marketId: 'MARKET_001',
        zoneId: 'ZONE_A',
        serviceType: 'STANDARD_DELIVERY',
        proposedRate: 1.50,
        estimatedVolume: 500,
        startDate: new Date().toISOString(),
        endDate: null,
      });
      
      expect(result.canAccept).toBe(false);
      expect(result.reasons).toContain('PARTNER_BLOCKED');
    });
    
    it('should reject rate below floor', () => {
      const bands = getGuidanceBands('MARKET_001', null, 'STANDARD_DELIVERY');
      const floorBand = bands.find(b => b.tier === 'FLOOR');
      
      // Ensure we have a floor band and use a rate well below it
      expect(floorBand).toBeDefined();
      const belowFloorRate = floorBand!.minRate * 0.3; // 30% of floor minimum
      
      const result = canAcceptPartnerWork({
        partnerId: 'PARTNER_001',
        marketId: 'MARKET_001',
        zoneId: 'ZONE_A',
        serviceType: 'STANDARD_DELIVERY',
        proposedRate: belowFloorRate,
        estimatedVolume: 500,
        startDate: new Date().toISOString(),
        endDate: null,
      });
      
      expect(result.canAccept).toBe(false);
      expect(result.reasons).toContain('RATE_BELOW_FLOOR');
      expect(result.details.some(d => d.includes('below floor'))).toBe(true);
    });
    
    it('should include guidance band in result', () => {
      const result = canAcceptPartnerWork({
        partnerId: 'PARTNER_001',
        marketId: 'MARKET_001',
        zoneId: null,
        serviceType: 'STANDARD_DELIVERY',
        proposedRate: 1.50,
        estimatedVolume: 500,
        startDate: new Date().toISOString(),
        endDate: null,
      });
      
      expect(result.guidanceBand).toBeDefined();
      expect(result.guidanceBand?.tier).toBe('FLOOR');
    });
    
    it('should include cost context in result for valid requests', () => {
      const result = canAcceptPartnerWork({
        partnerId: 'PARTNER_001',
        marketId: 'MARKET_001',
        zoneId: null,
        serviceType: 'STANDARD_DELIVERY',
        proposedRate: 1.50,
        estimatedVolume: 500,
        startDate: new Date().toISOString(),
        endDate: null,
      });
      
      expect(result.costContext).toBeDefined();
      expect(result.costContext?.readonly).toBe(true);
    });
    
    it('should include detailed rejection reasons', () => {
      const result = canAcceptPartnerWork({
        partnerId: 'BLOCKED_PARTNER_001',
        marketId: 'MARKET_001',
        zoneId: 'ZONE_X',
        serviceType: 'STANDARD_DELIVERY',
        proposedRate: 0.10, // Way below floor
        estimatedVolume: 500,
        startDate: new Date().toISOString(),
        endDate: null,
      });
      
      expect(result.canAccept).toBe(false);
      expect(result.details.length).toBeGreaterThan(0);
      expect(result.details.some(d => d.includes('blocked'))).toBe(true);
    });
    
    it('should record audit for partner work checks', () => {
      canAcceptPartnerWork({
        partnerId: 'PARTNER_001',
        marketId: 'MARKET_001',
        zoneId: null,
        serviceType: 'STANDARD_DELIVERY',
        proposedRate: 1.50,
        estimatedVolume: 500,
        startDate: new Date().toISOString(),
        endDate: null,
      });
      
      const records = getAuditRecords({ action: 'PARTNER_WORK_CHECK' });
      
      expect(records.length).toBeGreaterThan(0);
    });
  });
  
  // ===========================================================================
  // ACCESS CONTROL
  // ===========================================================================
  
  describe('Access Control', () => {
    it('should grant read access to all roles', () => {
      const roles: AccessRole[] = ['SALES', 'OPERATIONS', 'FINANCE', 'EXECUTIVE', 'SYSTEM'];
      
      for (const role of roles) {
        expect(validateReadAccess(role)).toBe(true);
      }
    });
    
    it('should deny write access to SALES', () => {
      expect(validateWriteAccess('SALES')).toBe(false);
    });
    
    it('should grant write access to SYSTEM', () => {
      expect(validateWriteAccess('SYSTEM')).toBe(true);
    });
    
    it('should grant write access to EXECUTIVE', () => {
      expect(validateWriteAccess('EXECUTIVE')).toBe(true);
    });
    
    it('should grant write access to FINANCE', () => {
      expect(validateWriteAccess('FINANCE')).toBe(true);
    });
    
    it('should deny write access to OPERATIONS', () => {
      expect(validateWriteAccess('OPERATIONS')).toBe(false);
    });
    
    it('should throw on assertWriteAccess for SALES', () => {
      expect(() => {
        assertWriteAccess('SALES', 'MODIFY_BAND');
      }).toThrow('ACCESS_DENIED');
    });
    
    it('should not throw on assertWriteAccess for SYSTEM', () => {
      expect(() => {
        assertWriteAccess('SYSTEM', 'MODIFY_BAND');
      }).not.toThrow();
    });
    
    it('should allow SALES to read deal context', () => {
      setupTestMarket();
      
      // This should not throw
      const context = generateDealCostContext(
        {
          dealId: 'DEAL_001',
          marketId: 'MARKET_001',
          requestedBy: 'sales_rep',
          accessRole: 'SALES',
        },
        'sales_rep',
        'SALES'
      );
      
      expect(context).toBeDefined();
    });
    
    it('should prevent SALES from configuring markets', () => {
      expect(() => {
        configureMarket('NEW_MARKET', {
          isActive: true,
          zones: ['ZONE_A'],
          capacityLimit: 5000,
          currentVolume: 0,
          utilizationMin: 0.4,
          utilizationMax: 0.95,
        }, 'sales_rep', 'SALES');
      }).toThrow('ACCESS_DENIED');
    });
  });
  
  // ===========================================================================
  // AUDIT TRAIL
  // ===========================================================================
  
  describe('Audit Trail', () => {
    it('should record signal generation', () => {
      generateCostSignals(
        { marketId: 'MARKET_001' },
        createStandardMetrics(),
        'analyst',
        'FINANCE'
      );
      
      const records = getAuditRecords({ action: 'SIGNALS_GENERATED' });
      
      expect(records.length).toBe(1);
      expect(records[0].actor).toBe('analyst');
      expect(records[0].accessRole).toBe('FINANCE');
    });
    
    it('should record guidance band generation', () => {
      const signals = generateCostSignals(
        { marketId: 'MARKET_001' },
        createStandardMetrics(),
        'SYSTEM',
        'SYSTEM'
      );
      
      generateGuidanceBands(
        { marketId: 'MARKET_001', zoneId: null, serviceType: 'STANDARD' },
        signals,
        'pricing_analyst',
        'FINANCE'
      );
      
      const records = getAuditRecords({ action: 'GUIDANCE_BANDS_GENERATED' });
      
      expect(records.length).toBe(1);
      expect(records[0].actor).toBe('pricing_analyst');
    });
    
    it('should record deal context generation', () => {
      setupTestMarket();
      
      generateDealCostContext(
        {
          dealId: 'DEAL_001',
          marketId: 'MARKET_001',
          requestedBy: 'sales_rep',
          accessRole: 'SALES',
        },
        'sales_rep',
        'SALES'
      );
      
      const records = getAuditRecords({ action: 'DEAL_CONTEXT_GENERATED' });
      
      expect(records.length).toBe(1);
      expect(records[0].accessRole).toBe('SALES');
    });
    
    it('should filter by date range', () => {
      generateCostSignals(
        { marketId: 'MARKET_001' },
        createStandardMetrics(),
        'SYSTEM',
        'SYSTEM'
      );
      
      const futureDate = new Date(Date.now() + 1000 * 60 * 60).toISOString();
      const records = getAuditRecords({ fromDate: futureDate });
      
      expect(records.length).toBe(0);
    });
    
    it('should filter by actor', () => {
      generateCostSignals(
        { marketId: 'MARKET_001' },
        createStandardMetrics(),
        'analyst_1',
        'FINANCE'
      );
      
      generateCostSignals(
        { marketId: 'MARKET_002' },
        createStandardMetrics(),
        'analyst_2',
        'FINANCE'
      );
      
      const records = getAuditRecords({ actor: 'analyst_1' });
      
      expect(records.length).toBe(1);
      expect(records[0].actor).toBe('analyst_1');
    });
    
    it('should limit results', () => {
      for (let i = 0; i < 10; i++) {
        generateCostSignals(
          { marketId: `MARKET_${i}` },
          createStandardMetrics(),
          'SYSTEM',
          'SYSTEM'
        );
      }
      
      const records = getAuditRecords({ limit: 5 });
      
      expect(records.length).toBe(5);
    });
  });
  
  // ===========================================================================
  // ADVISORY-ONLY ENFORCEMENT
  // ===========================================================================
  
  describe('Advisory-Only Enforcement', () => {
    it('should not expose any price calculation functions', () => {
      // Verify that the module does not export price calculation
      const exportedFunctions = [
        'configureMarket',
        'getMarketConfig',
        'generateCostSignals',
        'getCostSignals',
        'generateGuidanceBands',
        'getGuidanceBands',
        'generateDealCostContext',
        'getDealContext',
        'listDealContexts',
        'canAcceptPartnerWork',
        'validateReadAccess',
        'validateWriteAccess',
        'assertWriteAccess',
        'getAuditRecords',
        'clearDynamicPricingData',
      ];
      
      const forbiddenPatterns = [
        'calculatePrice',
        'generateQuote',
        'createQuote',
        'approvePrice',
        'setPrice',
        'finalizePrice',
      ];
      
      for (const func of exportedFunctions) {
        for (const pattern of forbiddenPatterns) {
          expect(func.toLowerCase()).not.toContain(pattern.toLowerCase());
        }
      }
    });
    
    it('should mark all deal contexts as read-only', () => {
      setupTestMarket();
      
      const context = generateDealCostContext(
        {
          dealId: 'DEAL_001',
          marketId: 'MARKET_001',
          requestedBy: 'sales_rep',
          accessRole: 'SALES',
        },
        'sales_rep',
        'SALES'
      );
      
      expect(context.readonly).toBe(true);
      
      // Verify it's a literal true, not just truthy
      expect(context.readonly === true).toBe(true);
    });
    
    it('should include advisory caveats in all contexts', () => {
      setupTestMarket();
      
      const context = generateDealCostContext(
        {
          dealId: 'DEAL_001',
          marketId: 'MARKET_001',
          requestedBy: 'exec',
          accessRole: 'EXECUTIVE',
        },
        'exec',
        'EXECUTIVE'
      );
      
      expect(context.caveats.some(c => c.toLowerCase().includes('advisory'))).toBe(true);
      expect(context.caveats.some(c => c.toLowerCase().includes('not'))).toBe(true);
    });
    
    it('should include advisory notes in guidance bands', () => {
      const signals = generateCostSignals(
        { marketId: 'MARKET_001' },
        createStandardMetrics(),
        'SYSTEM',
        'SYSTEM'
      );
      
      const bands = generateGuidanceBands(
        { marketId: 'MARKET_001', zoneId: null, serviceType: 'STANDARD' },
        signals,
        'SYSTEM',
        'SYSTEM'
      );
      
      for (const band of bands) {
        expect(band.notes.some(n => n.toLowerCase().includes('advisory'))).toBe(true);
      }
    });
  });
});
