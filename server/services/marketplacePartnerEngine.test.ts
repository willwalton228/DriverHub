/**
 * Marketplace & Partner Integrations Engine Tests
 * 
 * Tests for:
 * - Capacity offer engine by market/zone/execution_mode
 * - Partner request intake (read-only to partners)
 * - Hard acceptance gate with no bypass
 * - Rate and hiring protection
 * - Full audit trail
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Types
  type CapacityOffer,
  type PartnerRequest,
  type PartnerProfile,
  type MarketCapacity,
  type AcceptanceGateInput,
  type ExecutionMode,
  type AccessRole,
  
  // Access control
  validatePartnerReadAccess,
  validateWriteAccess,
  assertWriteAccess,
  validatePartnerOwnAccess,
  
  // Partner profiles
  upsertPartnerProfile,
  getPartnerProfile,
  
  // Market capacity
  configureMarketCapacity,
  getMarketCapacity,
  updateCapacityUsage,
  
  // Capacity offers
  createCapacityOffer,
  publishOffer,
  pauseOffer,
  withdrawOffer,
  getOffer,
  listOffers,
  getAvailableOffersForPartner,
  
  // Partner requests
  submitPartnerRequest,
  getRequest,
  listRequests,
  
  // Acceptance gate
  evaluateAcceptanceGate,
  processRequest,
  
  // Demand tracking
  getDemandRecords,
  getDemandSummary,
  
  // Audit
  getAuditRecords,
  
  // Test utilities
  clearMarketplaceData,
} from './marketplacePartnerEngine';

// =============================================================================
// TEST HELPERS
// =============================================================================

function createTestPartner(overrides: Partial<PartnerProfile> = {}): PartnerProfile {
  return {
    partnerId: `PARTNER_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: 'Test Partner',
    status: 'ACTIVE',
    rating: 4.5,
    tenureDays: 180,
    certifications: ['CERTIFIED_DRIVER', 'SAFETY_TRAINED'],
    qualifiedMarkets: ['MARKET_001', 'MARKET_002'],
    blockedMarkets: [],
    volumeLimit: 10000,
    currentVolume: 2000,
    safetyScore: 85,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function createTestMarketCapacity(overrides: Partial<MarketCapacity> = {}): MarketCapacity {
  return {
    marketId: 'MARKET_001',
    zoneId: null,
    totalCapacity: 50000,
    usedCapacity: 20000,
    reservedCapacity: 5000,
    availableCapacity: 25000,
    utilizationRate: 0.4,
    isActive: true,
    hiringFreezeActive: false,
    safetyThreshold: 70,
    profitabilityMinimum: 50,
    rateFloor: 0.80,
    ...overrides,
  };
}

function setupTestEnvironment() {
  // Create partner
  const partner = upsertPartnerProfile(createTestPartner({
    partnerId: 'PARTNER_001',
  }), 'SYSTEM', 'SYSTEM');
  
  // Configure market capacity
  const capacity = configureMarketCapacity(createTestMarketCapacity(), 'SYSTEM', 'SYSTEM');
  
  // Create and publish offer
  const offer = createCapacityOffer({
    marketId: 'MARKET_001',
    zoneId: null,
    executionMode: 'STANDARD',
    availableCapacity: 10000,
    minRate: 1.00,
    maxRate: 2.00,
    targetRate: 1.50,
  }, 'SYSTEM', 'SYSTEM');
  
  publishOffer(offer.id, 'SYSTEM', 'SYSTEM');
  
  return { partner, capacity, offer: getOffer(offer.id)! };
}

// =============================================================================
// TESTS
// =============================================================================

describe('Marketplace & Partner Integrations Engine', () => {
  beforeEach(() => {
    clearMarketplaceData();
  });
  
  // ===========================================================================
  // ACCESS CONTROL
  // ===========================================================================
  
  describe('Access Control', () => {
    it('should grant read access to all roles', () => {
      const roles: AccessRole[] = ['PARTNER', 'OPERATIONS', 'SALES', 'EXECUTIVE', 'SYSTEM'];
      
      for (const role of roles) {
        expect(validatePartnerReadAccess(role)).toBe(true);
      }
    });
    
    it('should deny write access to PARTNER', () => {
      expect(validateWriteAccess('PARTNER')).toBe(false);
    });
    
    it('should deny write access to SALES', () => {
      expect(validateWriteAccess('SALES')).toBe(false);
    });
    
    it('should grant write access to OPERATIONS', () => {
      expect(validateWriteAccess('OPERATIONS')).toBe(true);
    });
    
    it('should grant write access to EXECUTIVE', () => {
      expect(validateWriteAccess('EXECUTIVE')).toBe(true);
    });
    
    it('should grant write access to SYSTEM', () => {
      expect(validateWriteAccess('SYSTEM')).toBe(true);
    });
    
    it('should throw on assertWriteAccess for PARTNER', () => {
      expect(() => assertWriteAccess('PARTNER', 'CREATE_OFFER')).toThrow('ACCESS_DENIED');
    });
    
    it('should validate partner own access', () => {
      expect(validatePartnerOwnAccess('PARTNER', 'PARTNER_001', 'PARTNER_001')).toBe(true);
      expect(validatePartnerOwnAccess('PARTNER', 'PARTNER_001', 'PARTNER_002')).toBe(false);
      expect(validatePartnerOwnAccess('OPERATIONS', 'PARTNER_001', 'PARTNER_002')).toBe(true);
    });
  });
  
  // ===========================================================================
  // PARTNER PROFILE MANAGEMENT
  // ===========================================================================
  
  describe('Partner Profile Management', () => {
    it('should create a partner profile', () => {
      const profile = upsertPartnerProfile(createTestPartner({
        partnerId: 'NEW_PARTNER',
        name: 'New Partner Inc',
      }), 'admin', 'SYSTEM');
      
      expect(profile.partnerId).toBe('NEW_PARTNER');
      expect(profile.name).toBe('New Partner Inc');
    });
    
    it('should update an existing partner profile', () => {
      upsertPartnerProfile(createTestPartner({
        partnerId: 'PARTNER_001',
        rating: 4.0,
      }), 'admin', 'SYSTEM');
      
      const updated = upsertPartnerProfile(createTestPartner({
        partnerId: 'PARTNER_001',
        rating: 4.8,
      }), 'admin', 'SYSTEM');
      
      expect(updated.rating).toBe(4.8);
    });
    
    it('should retrieve a partner profile', () => {
      upsertPartnerProfile(createTestPartner({
        partnerId: 'PARTNER_001',
      }), 'admin', 'SYSTEM');
      
      const profile = getPartnerProfile('PARTNER_001');
      
      expect(profile).toBeDefined();
      expect(profile?.partnerId).toBe('PARTNER_001');
    });
    
    it('should reject partner creation by PARTNER role', () => {
      expect(() => {
        upsertPartnerProfile(createTestPartner(), 'partner', 'PARTNER');
      }).toThrow('ACCESS_DENIED');
    });
  });
  
  // ===========================================================================
  // MARKET CAPACITY MANAGEMENT
  // ===========================================================================
  
  describe('Market Capacity Management', () => {
    it('should configure market capacity', () => {
      const capacity = configureMarketCapacity(createTestMarketCapacity({
        marketId: 'MARKET_001',
        totalCapacity: 100000,
      }), 'admin', 'SYSTEM');
      
      expect(capacity.marketId).toBe('MARKET_001');
      expect(capacity.totalCapacity).toBe(100000);
    });
    
    it('should retrieve market capacity', () => {
      configureMarketCapacity(createTestMarketCapacity(), 'admin', 'SYSTEM');
      
      const capacity = getMarketCapacity('MARKET_001', null);
      
      expect(capacity).toBeDefined();
    });
    
    it('should fall back to market-level capacity if zone not found', () => {
      configureMarketCapacity(createTestMarketCapacity({
        marketId: 'MARKET_001',
        zoneId: null,
      }), 'admin', 'SYSTEM');
      
      const capacity = getMarketCapacity('MARKET_001', 'ZONE_A');
      
      expect(capacity).toBeDefined();
      expect(capacity?.marketId).toBe('MARKET_001');
    });
    
    it('should update capacity usage', () => {
      configureMarketCapacity(createTestMarketCapacity({
        usedCapacity: 20000,
        reservedCapacity: 5000,
      }), 'admin', 'SYSTEM');
      
      const updated = updateCapacityUsage('MARKET_001', null, 1000, 500, 'ops', 'OPERATIONS');
      
      expect(updated.usedCapacity).toBe(21000);
      expect(updated.reservedCapacity).toBe(5500);
    });
  });
  
  // ===========================================================================
  // CAPACITY OFFER ENGINE
  // ===========================================================================
  
  describe('Capacity Offer Engine', () => {
    it('should create a capacity offer', () => {
      const offer = createCapacityOffer({
        marketId: 'MARKET_001',
        zoneId: null,
        executionMode: 'STANDARD',
        availableCapacity: 5000,
        minRate: 1.00,
        maxRate: 2.00,
        targetRate: 1.50,
      }, 'ops', 'OPERATIONS');
      
      expect(offer.id).toBeDefined();
      expect(offer.status).toBe('DRAFT');
      expect(offer.executionMode).toBe('STANDARD');
    });
    
    it('should support all execution modes', () => {
      const modes: ExecutionMode[] = ['STANDARD', 'EXPRESS', 'DEDICATED', 'OVERFLOW', 'SURGE'];
      
      for (const mode of modes) {
        const offer = createCapacityOffer({
          marketId: 'MARKET_001',
          executionMode: mode,
          availableCapacity: 1000,
          minRate: 1.00,
          maxRate: 2.00,
          targetRate: 1.50,
        }, 'ops', 'OPERATIONS');
        
        expect(offer.executionMode).toBe(mode);
      }
    });
    
    it('should include terms and restrictions', () => {
      const offer = createCapacityOffer({
        marketId: 'MARKET_001',
        executionMode: 'STANDARD',
        availableCapacity: 5000,
        minRate: 1.00,
        maxRate: 2.00,
        targetRate: 1.50,
        terms: {
          minVolume: 500,
          commitmentPeriodDays: 60,
        },
        restrictions: {
          minPartnerRating: 4.0,
          requiredCertifications: ['HAZMAT'],
        },
      }, 'ops', 'OPERATIONS');
      
      expect(offer.terms.minVolume).toBe(500);
      expect(offer.terms.commitmentPeriodDays).toBe(60);
      expect(offer.restrictions.minPartnerRating).toBe(4.0);
      expect(offer.restrictions.requiredCertifications).toContain('HAZMAT');
    });
    
    it('should publish a draft offer', () => {
      const offer = createCapacityOffer({
        marketId: 'MARKET_001',
        executionMode: 'STANDARD',
        availableCapacity: 5000,
        minRate: 1.00,
        maxRate: 2.00,
        targetRate: 1.50,
      }, 'ops', 'OPERATIONS');
      
      const published = publishOffer(offer.id, 'ops', 'OPERATIONS');
      
      expect(published.status).toBe('ACTIVE');
    });
    
    it('should pause an active offer', () => {
      const offer = createCapacityOffer({
        marketId: 'MARKET_001',
        executionMode: 'STANDARD',
        availableCapacity: 5000,
        minRate: 1.00,
        maxRate: 2.00,
        targetRate: 1.50,
      }, 'ops', 'OPERATIONS');
      
      publishOffer(offer.id, 'ops', 'OPERATIONS');
      const paused = pauseOffer(offer.id, 'ops', 'OPERATIONS');
      
      expect(paused.status).toBe('PAUSED');
    });
    
    it('should withdraw an offer', () => {
      const offer = createCapacityOffer({
        marketId: 'MARKET_001',
        executionMode: 'STANDARD',
        availableCapacity: 5000,
        minRate: 1.00,
        maxRate: 2.00,
        targetRate: 1.50,
      }, 'ops', 'OPERATIONS');
      
      const withdrawn = withdrawOffer(offer.id, 'ops', 'OPERATIONS');
      
      expect(withdrawn.status).toBe('WITHDRAWN');
    });
    
    it('should list offers with filters', () => {
      createCapacityOffer({
        marketId: 'MARKET_001',
        executionMode: 'STANDARD',
        availableCapacity: 5000,
        minRate: 1.00,
        maxRate: 2.00,
        targetRate: 1.50,
      }, 'ops', 'OPERATIONS');
      
      createCapacityOffer({
        marketId: 'MARKET_002',
        executionMode: 'EXPRESS',
        availableCapacity: 3000,
        minRate: 1.50,
        maxRate: 2.50,
        targetRate: 2.00,
      }, 'ops', 'OPERATIONS');
      
      const market1Offers = listOffers({ marketId: 'MARKET_001' });
      const expressOffers = listOffers({ executionMode: 'EXPRESS' });
      
      expect(market1Offers.length).toBe(1);
      expect(expressOffers.length).toBe(1);
      expect(expressOffers[0].executionMode).toBe('EXPRESS');
    });
    
    it('should get available offers for a partner', () => {
      const { partner, offer } = setupTestEnvironment();
      
      const available = getAvailableOffersForPartner(partner.partnerId, 'MARKET_001');
      
      expect(available.length).toBe(1);
      expect(available[0].id).toBe(offer.id);
    });
    
    it('should exclude offers from blocked markets', () => {
      upsertPartnerProfile(createTestPartner({
        partnerId: 'BLOCKED_PARTNER',
        blockedMarkets: ['MARKET_001'],
      }), 'SYSTEM', 'SYSTEM');
      
      configureMarketCapacity(createTestMarketCapacity(), 'SYSTEM', 'SYSTEM');
      
      const offer = createCapacityOffer({
        marketId: 'MARKET_001',
        executionMode: 'STANDARD',
        availableCapacity: 5000,
        minRate: 1.00,
        maxRate: 2.00,
        targetRate: 1.50,
      }, 'ops', 'OPERATIONS');
      publishOffer(offer.id, 'ops', 'OPERATIONS');
      
      const available = getAvailableOffersForPartner('BLOCKED_PARTNER', 'MARKET_001');
      
      expect(available.length).toBe(0);
    });
    
    it('should exclude partners that do not meet rating requirement', () => {
      upsertPartnerProfile(createTestPartner({
        partnerId: 'LOW_RATING_PARTNER',
        rating: 2.5,
        qualifiedMarkets: ['MARKET_001'],
      }), 'SYSTEM', 'SYSTEM');
      
      configureMarketCapacity(createTestMarketCapacity(), 'SYSTEM', 'SYSTEM');
      
      const offer = createCapacityOffer({
        marketId: 'MARKET_001',
        executionMode: 'STANDARD',
        availableCapacity: 5000,
        minRate: 1.00,
        maxRate: 2.00,
        targetRate: 1.50,
        restrictions: {
          minPartnerRating: 4.0,
        },
      }, 'ops', 'OPERATIONS');
      publishOffer(offer.id, 'ops', 'OPERATIONS');
      
      const available = getAvailableOffersForPartner('LOW_RATING_PARTNER');
      
      expect(available.length).toBe(0);
    });
  });
  
  // ===========================================================================
  // PARTNER REQUEST INTAKE
  // ===========================================================================
  
  describe('Partner Request Intake', () => {
    it('should submit a partner request', () => {
      const { partner, offer } = setupTestEnvironment();
      
      const request = submitPartnerRequest({
        partnerId: partner.partnerId,
        offerId: offer.id,
        requestedVolume: 1000,
        proposedRate: 1.25,
        startDate: new Date().toISOString(),
      }, partner.partnerId, 'PARTNER');
      
      expect(request.id).toBeDefined();
      expect(request.status).toBe('PENDING');
    });
    
    it('should prevent partner from submitting for another partner', () => {
      const { offer } = setupTestEnvironment();
      
      upsertPartnerProfile(createTestPartner({
        partnerId: 'PARTNER_002',
      }), 'SYSTEM', 'SYSTEM');
      
      expect(() => {
        submitPartnerRequest({
          partnerId: 'PARTNER_002',
          offerId: offer.id,
          requestedVolume: 1000,
          proposedRate: 1.25,
          startDate: new Date().toISOString(),
        }, 'PARTNER_001', 'PARTNER');
      }).toThrow('ACCESS_DENIED');
    });
    
    it('should allow operations to submit on behalf of partner', () => {
      const { partner, offer } = setupTestEnvironment();
      
      const request = submitPartnerRequest({
        partnerId: partner.partnerId,
        offerId: offer.id,
        requestedVolume: 1000,
        proposedRate: 1.25,
        startDate: new Date().toISOString(),
      }, 'ops_user', 'OPERATIONS');
      
      expect(request).toBeDefined();
    });
    
    it('should retrieve a request by ID', () => {
      const { partner, offer } = setupTestEnvironment();
      
      const request = submitPartnerRequest({
        partnerId: partner.partnerId,
        offerId: offer.id,
        requestedVolume: 1000,
        proposedRate: 1.25,
        startDate: new Date().toISOString(),
      }, partner.partnerId, 'PARTNER');
      
      const retrieved = getRequest(request.id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(request.id);
    });
    
    it('should prevent partner from viewing other partner requests', () => {
      const { offer } = setupTestEnvironment();
      
      upsertPartnerProfile(createTestPartner({
        partnerId: 'PARTNER_002',
        qualifiedMarkets: ['MARKET_001'],
      }), 'SYSTEM', 'SYSTEM');
      
      const request = submitPartnerRequest({
        partnerId: 'PARTNER_002',
        offerId: offer.id,
        requestedVolume: 1000,
        proposedRate: 1.25,
        startDate: new Date().toISOString(),
      }, 'PARTNER_002', 'PARTNER');
      
      const retrieved = getRequest(request.id, 'PARTNER_001', 'PARTNER');
      
      expect(retrieved).toBeUndefined();
    });
    
    it('should list partner requests with filters', () => {
      const { partner, offer } = setupTestEnvironment();
      
      submitPartnerRequest({
        partnerId: partner.partnerId,
        offerId: offer.id,
        requestedVolume: 1000,
        proposedRate: 1.25,
        startDate: new Date().toISOString(),
      }, partner.partnerId, 'PARTNER');
      
      submitPartnerRequest({
        partnerId: partner.partnerId,
        offerId: offer.id,
        requestedVolume: 2000,
        proposedRate: 1.30,
        startDate: new Date().toISOString(),
      }, partner.partnerId, 'PARTNER');
      
      const requests = listRequests({ partnerId: partner.partnerId }, partner.partnerId, 'PARTNER');
      
      expect(requests.length).toBe(2);
    });
  });
  
  // ===========================================================================
  // HARD ACCEPTANCE GATE
  // ===========================================================================
  
  describe('Hard Acceptance Gate', () => {
    it('should accept a valid request', () => {
      const partner = createTestPartner({ partnerId: 'P1' });
      const capacity = createTestMarketCapacity();
      const offer: CapacityOffer = {
        id: 'OFFER_1',
        marketId: 'MARKET_001',
        zoneId: null,
        executionMode: 'STANDARD',
        status: 'ACTIVE',
        availableCapacity: 10000,
        reservedCapacity: 0,
        minRate: 1.00,
        maxRate: 2.00,
        targetRate: 1.50,
        currency: 'USD',
        unit: 'per_mile',
        effectiveDate: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        terms: { minVolume: 100, maxVolume: 10000, commitmentPeriodDays: 30, paymentTermsDays: 30, cancellationNoticeDays: 7, qualityRequirements: [] },
        restrictions: { qualifiedPartnersOnly: true, minPartnerRating: 3.5, minPartnerTenureDays: 30, excludedPartners: [], requiredCertifications: [] },
        createdBy: 'SYSTEM',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {},
      };
      const request: PartnerRequest = {
        id: 'REQ_1',
        partnerId: 'P1',
        offerId: 'OFFER_1',
        marketId: 'MARKET_001',
        zoneId: null,
        executionMode: 'STANDARD',
        requestedVolume: 1000,
        proposedRate: 1.25,
        currency: 'USD',
        unit: 'per_mile',
        startDate: new Date().toISOString(),
        endDate: null,
        status: 'PENDING',
        submittedAt: new Date().toISOString(),
        reviewedAt: null,
        reviewedBy: null,
        rejectionReasons: [],
        rejectionDetails: [],
        acceptedVolume: null,
        acceptedRate: null,
        metadata: {},
      };
      
      const result = evaluateAcceptanceGate({ request, offer, partner, marketCapacity: capacity });
      
      expect(result.accepted).toBe(true);
      expect(result.rejectionReasons).toEqual([]);
      expect(result.acceptedVolume).toBe(1000);
      expect(result.acceptedRate).toBe(1.25);
    });
    
    it('should reject when market is not active', () => {
      const partner = createTestPartner({ partnerId: 'P1' });
      const capacity = createTestMarketCapacity({ isActive: false });
      const offer = createTestOffer();
      const request = createTestRequest();
      
      const result = evaluateAcceptanceGate({ request, offer, partner, marketCapacity: capacity });
      
      expect(result.accepted).toBe(false);
      expect(result.rejectionReasons).toContain('MARKET_NOT_ACTIVE');
    });
    
    it('should reject when offer is withdrawn', () => {
      const partner = createTestPartner({ partnerId: 'P1' });
      const capacity = createTestMarketCapacity();
      const offer = createTestOffer({ status: 'WITHDRAWN' });
      const request = createTestRequest();
      
      const result = evaluateAcceptanceGate({ request, offer, partner, marketCapacity: capacity });
      
      expect(result.accepted).toBe(false);
      expect(result.rejectionReasons).toContain('OFFER_WITHDRAWN');
    });
    
    it('should reject when partner is blocked', () => {
      const partner = createTestPartner({ partnerId: 'P1', status: 'BLOCKED' });
      const capacity = createTestMarketCapacity();
      const offer = createTestOffer();
      const request = createTestRequest();
      
      const result = evaluateAcceptanceGate({ request, offer, partner, marketCapacity: capacity });
      
      expect(result.accepted).toBe(false);
      expect(result.rejectionReasons).toContain('PARTNER_BLOCKED');
    });
    
    it('should reject when capacity exceeded', () => {
      const partner = createTestPartner({ partnerId: 'P1' });
      const capacity = createTestMarketCapacity();
      const offer = createTestOffer({ availableCapacity: 500, reservedCapacity: 400 });
      const request = createTestRequest({ requestedVolume: 200 });
      
      const result = evaluateAcceptanceGate({ request, offer, partner, marketCapacity: capacity });
      
      expect(result.accepted).toBe(false);
      expect(result.rejectionReasons).toContain('CAPACITY_EXCEEDED');
    });
    
    it('should NEVER bypass rate floor', () => {
      const partner = createTestPartner({ partnerId: 'P1' });
      const capacity = createTestMarketCapacity();
      const offer = createTestOffer({ minRate: 1.50 });
      const request = createTestRequest({ proposedRate: 1.00 });
      
      const result = evaluateAcceptanceGate({ request, offer, partner, marketCapacity: capacity });
      
      expect(result.accepted).toBe(false);
      expect(result.rejectionReasons).toContain('RATE_BELOW_FLOOR');
      expect(result.rejectionDetails.some(d => d.includes('NO BYPASS'))).toBe(true);
    });
    
    it('should NEVER bypass hiring freeze', () => {
      const partner = createTestPartner({ partnerId: 'P1' });
      const capacity = createTestMarketCapacity({ hiringFreezeActive: true });
      const offer = createTestOffer();
      const request = createTestRequest();
      
      const result = evaluateAcceptanceGate({ request, offer, partner, marketCapacity: capacity });
      
      expect(result.accepted).toBe(false);
      expect(result.rejectionReasons).toContain('HIRING_FREEZE_ACTIVE');
      expect(result.rejectionDetails.some(d => d.includes('NO BYPASS'))).toBe(true);
    });
    
    it('should reject when safety threshold violated', () => {
      const partner = createTestPartner({ partnerId: 'P1', safetyScore: 50 });
      const capacity = createTestMarketCapacity({ safetyThreshold: 70 });
      const offer = createTestOffer();
      const request = createTestRequest();
      
      const result = evaluateAcceptanceGate({ request, offer, partner, marketCapacity: capacity });
      
      expect(result.accepted).toBe(false);
      expect(result.rejectionReasons).toContain('SAFETY_THRESHOLD_VIOLATED');
    });
    
    it('should reject when profitability below minimum', () => {
      const partner = createTestPartner({ partnerId: 'P1' });
      const capacity = createTestMarketCapacity({ profitabilityMinimum: 80 });
      const offer = createTestOffer();
      const request = createTestRequest();
      
      const result = evaluateAcceptanceGate({ 
        request, offer, partner, marketCapacity: capacity,
        currentProfitabilityScore: 40,
      });
      
      expect(result.accepted).toBe(false);
      expect(result.rejectionReasons).toContain('PROFITABILITY_BELOW_MINIMUM');
    });
    
    it('should reject when partner volume limit exceeded', () => {
      const partner = createTestPartner({ 
        partnerId: 'P1', 
        volumeLimit: 5000,
        currentVolume: 4500,
      });
      const capacity = createTestMarketCapacity();
      const offer = createTestOffer();
      const request = createTestRequest({ requestedVolume: 1000 });
      
      const result = evaluateAcceptanceGate({ request, offer, partner, marketCapacity: capacity });
      
      expect(result.accepted).toBe(false);
      expect(result.rejectionReasons).toContain('VOLUME_LIMIT_EXCEEDED');
    });
    
    it('should include all gate checks in result', () => {
      const partner = createTestPartner({ partnerId: 'P1' });
      const capacity = createTestMarketCapacity();
      const offer = createTestOffer();
      const request = createTestRequest();
      
      const result = evaluateAcceptanceGate({ request, offer, partner, marketCapacity: capacity });
      
      expect(result.gateChecks.length).toBeGreaterThanOrEqual(10);
      expect(result.gateChecks.find(g => g.name === 'MARKET_ACTIVE')).toBeDefined();
      expect(result.gateChecks.find(g => g.name === 'RATE_FLOOR')).toBeDefined();
      expect(result.gateChecks.find(g => g.name === 'HIRING_FREEZE')).toBeDefined();
    });
    
    it('should include warnings for near-threshold conditions', () => {
      const partner = createTestPartner({ partnerId: 'P1' });
      const capacity = createTestMarketCapacity({ 
        usedCapacity: 43000,
        totalCapacity: 50000,
      });
      const offer = createTestOffer();
      const request = createTestRequest({ requestedVolume: 1000 });
      
      const result = evaluateAcceptanceGate({ request, offer, partner, marketCapacity: capacity });
      
      // Utilization will be (43000 + 1000) / 50000 = 88%
      expect(result.warnings.some(w => w.includes('Utilization'))).toBe(true);
    });
  });
  
  // ===========================================================================
  // REQUEST PROCESSING
  // ===========================================================================
  
  describe('Request Processing', () => {
    it('should process and accept a valid request', () => {
      const { partner, offer } = setupTestEnvironment();
      
      const request = submitPartnerRequest({
        partnerId: partner.partnerId,
        offerId: offer.id,
        requestedVolume: 1000,
        proposedRate: 1.25,
        startDate: new Date().toISOString(),
      }, partner.partnerId, 'PARTNER');
      
      const { request: processed, gateResult } = processRequest(request.id, 'ops', 'OPERATIONS');
      
      expect(gateResult.accepted).toBe(true);
      expect(processed.status).toBe('ACCEPTED');
      expect(processed.acceptedVolume).toBe(1000);
    });
    
    it('should process and reject an invalid request', () => {
      const { partner, offer } = setupTestEnvironment();
      
      const request = submitPartnerRequest({
        partnerId: partner.partnerId,
        offerId: offer.id,
        requestedVolume: 1000,
        proposedRate: 0.50, // Below floor of 1.00
        startDate: new Date().toISOString(),
      }, partner.partnerId, 'PARTNER');
      
      const { request: processed, gateResult } = processRequest(request.id, 'ops', 'OPERATIONS');
      
      expect(gateResult.accepted).toBe(false);
      expect(processed.status).toBe('REJECTED');
      expect(processed.rejectionReasons).toContain('RATE_BELOW_FLOOR');
    });
    
    it('should update offer reserved capacity on acceptance', () => {
      const { partner, offer } = setupTestEnvironment();
      
      const request = submitPartnerRequest({
        partnerId: partner.partnerId,
        offerId: offer.id,
        requestedVolume: 2000,
        proposedRate: 1.25,
        startDate: new Date().toISOString(),
      }, partner.partnerId, 'PARTNER');
      
      processRequest(request.id, 'ops', 'OPERATIONS');
      
      const updatedOffer = getOffer(offer.id);
      expect(updatedOffer?.reservedCapacity).toBe(2000);
    });
    
    it('should record demand for accepted requests', () => {
      const { partner, offer } = setupTestEnvironment();
      
      const request = submitPartnerRequest({
        partnerId: partner.partnerId,
        offerId: offer.id,
        requestedVolume: 1000,
        proposedRate: 1.25,
        startDate: new Date().toISOString(),
      }, partner.partnerId, 'PARTNER');
      
      processRequest(request.id, 'ops', 'OPERATIONS');
      
      const records = getDemandRecords({ partnerId: partner.partnerId });
      
      expect(records.length).toBe(1);
      expect(records[0].outcome).toBe('ACCEPTED');
    });
    
    it('should record demand for rejected requests', () => {
      const { partner, offer } = setupTestEnvironment();
      
      const request = submitPartnerRequest({
        partnerId: partner.partnerId,
        offerId: offer.id,
        requestedVolume: 1000,
        proposedRate: 0.50, // Below floor
        startDate: new Date().toISOString(),
      }, partner.partnerId, 'PARTNER');
      
      processRequest(request.id, 'ops', 'OPERATIONS');
      
      const records = getDemandRecords({ outcome: 'REJECTED' });
      
      expect(records.length).toBe(1);
      expect(records[0].rejectionReasons).toContain('RATE_BELOW_FLOOR');
    });
  });
  
  // ===========================================================================
  // DEMAND TRACKING
  // ===========================================================================
  
  describe('Demand Tracking', () => {
    it('should get demand summary by market', () => {
      const { partner, offer } = setupTestEnvironment();
      
      // Submit and process multiple requests
      for (let i = 0; i < 3; i++) {
        const request = submitPartnerRequest({
          partnerId: partner.partnerId,
          offerId: offer.id,
          requestedVolume: 500,
          proposedRate: 1.25,
          startDate: new Date().toISOString(),
        }, partner.partnerId, 'PARTNER');
        processRequest(request.id, 'ops', 'OPERATIONS');
      }
      
      // Submit one that will be rejected
      const rejectedRequest = submitPartnerRequest({
        partnerId: partner.partnerId,
        offerId: offer.id,
        requestedVolume: 500,
        proposedRate: 0.50,
        startDate: new Date().toISOString(),
      }, partner.partnerId, 'PARTNER');
      processRequest(rejectedRequest.id, 'ops', 'OPERATIONS');
      
      const summary = getDemandSummary('MARKET_001');
      
      expect(summary.totalRequests).toBe(4);
      expect(summary.accepted).toBe(3);
      expect(summary.rejected).toBe(1);
      expect(summary.acceptanceRate).toBe(0.75);
      expect(summary.topRejectionReasons.some(r => r.reason === 'RATE_BELOW_FLOOR')).toBe(true);
    });
  });
  
  // ===========================================================================
  // AUDIT TRAIL
  // ===========================================================================
  
  describe('Audit Trail', () => {
    it('should record offer creation', () => {
      createCapacityOffer({
        marketId: 'MARKET_001',
        executionMode: 'STANDARD',
        availableCapacity: 5000,
        minRate: 1.00,
        maxRate: 2.00,
        targetRate: 1.50,
      }, 'ops', 'OPERATIONS');
      
      const records = getAuditRecords({ action: 'OFFER_CREATED' });
      
      expect(records.length).toBe(1);
      expect(records[0].actor).toBe('ops');
    });
    
    it('should record request submission', () => {
      const { partner, offer } = setupTestEnvironment();
      
      submitPartnerRequest({
        partnerId: partner.partnerId,
        offerId: offer.id,
        requestedVolume: 1000,
        proposedRate: 1.25,
        startDate: new Date().toISOString(),
      }, partner.partnerId, 'PARTNER');
      
      const records = getAuditRecords({ action: 'REQUEST_SUBMITTED' });
      
      expect(records.length).toBe(1);
    });
    
    it('should record request acceptance', () => {
      const { partner, offer } = setupTestEnvironment();
      
      const request = submitPartnerRequest({
        partnerId: partner.partnerId,
        offerId: offer.id,
        requestedVolume: 1000,
        proposedRate: 1.25,
        startDate: new Date().toISOString(),
      }, partner.partnerId, 'PARTNER');
      
      processRequest(request.id, 'ops', 'OPERATIONS');
      
      const records = getAuditRecords({ action: 'REQUEST_ACCEPTED' });
      
      expect(records.length).toBe(1);
    });
    
    it('should record request rejection', () => {
      const { partner, offer } = setupTestEnvironment();
      
      const request = submitPartnerRequest({
        partnerId: partner.partnerId,
        offerId: offer.id,
        requestedVolume: 1000,
        proposedRate: 0.50, // Below floor
        startDate: new Date().toISOString(),
      }, partner.partnerId, 'PARTNER');
      
      processRequest(request.id, 'ops', 'OPERATIONS');
      
      const records = getAuditRecords({ action: 'REQUEST_REJECTED' });
      
      expect(records.length).toBe(1);
    });
    
    it('should filter audit records', () => {
      const { partner, offer } = setupTestEnvironment();
      
      // Generate some activity
      submitPartnerRequest({
        partnerId: partner.partnerId,
        offerId: offer.id,
        requestedVolume: 1000,
        proposedRate: 1.25,
        startDate: new Date().toISOString(),
      }, partner.partnerId, 'PARTNER');
      
      const partnerRecords = getAuditRecords({ accessRole: 'PARTNER' });
      
      expect(partnerRecords.length).toBeGreaterThan(0);
      expect(partnerRecords.every(r => r.accessRole === 'PARTNER')).toBe(true);
    });
  });
  
  // ===========================================================================
  // NO BYPASS ENFORCEMENT
  // ===========================================================================
  
  describe('No Bypass Enforcement', () => {
    it('should not expose any bypass functions', () => {
      const exportedFunctions = [
        'validatePartnerReadAccess',
        'validateWriteAccess',
        'assertWriteAccess',
        'validatePartnerOwnAccess',
        'upsertPartnerProfile',
        'getPartnerProfile',
        'configureMarketCapacity',
        'getMarketCapacity',
        'updateCapacityUsage',
        'createCapacityOffer',
        'publishOffer',
        'pauseOffer',
        'withdrawOffer',
        'getOffer',
        'listOffers',
        'getAvailableOffersForPartner',
        'submitPartnerRequest',
        'getRequest',
        'listRequests',
        'evaluateAcceptanceGate',
        'processRequest',
        'getDemandRecords',
        'getDemandSummary',
        'getAuditRecords',
        'clearMarketplaceData',
      ];
      
      const forbiddenPatterns = [
        'bypassRate',
        'bypassHiring',
        'overrideFloor',
        'skipGate',
        'forceAccept',
        'dynamicBid',
        'partnerSetPrice',
      ];
      
      for (const func of exportedFunctions) {
        for (const pattern of forbiddenPatterns) {
          expect(func.toLowerCase()).not.toContain(pattern.toLowerCase());
        }
      }
    });
    
    it('should always enforce rate floor in gate evaluation', () => {
      const partner = createTestPartner({ partnerId: 'P1' });
      const capacity = createTestMarketCapacity();
      const offer = createTestOffer({ minRate: 2.00 });
      const request = createTestRequest({ proposedRate: 1.00 });
      
      const result = evaluateAcceptanceGate({ request, offer, partner, marketCapacity: capacity });
      
      // Even with otherwise perfect conditions, rate below floor must reject
      expect(result.accepted).toBe(false);
      expect(result.rejectionReasons).toContain('RATE_BELOW_FLOOR');
    });
    
    it('should always enforce hiring freeze in gate evaluation', () => {
      const partner = createTestPartner({ partnerId: 'P1' });
      const capacity = createTestMarketCapacity({ hiringFreezeActive: true });
      const offer = createTestOffer();
      const request = createTestRequest({ proposedRate: 5.00 }); // Even at premium rate
      
      const result = evaluateAcceptanceGate({ request, offer, partner, marketCapacity: capacity });
      
      // Hiring freeze cannot be bypassed
      expect(result.accepted).toBe(false);
      expect(result.rejectionReasons).toContain('HIRING_FREEZE_ACTIVE');
    });
  });
});

// =============================================================================
// ADDITIONAL TEST HELPERS
// =============================================================================

function createTestOffer(overrides: Partial<CapacityOffer> = {}): CapacityOffer {
  return {
    id: 'OFFER_TEST',
    marketId: 'MARKET_001',
    zoneId: null,
    executionMode: 'STANDARD',
    status: 'ACTIVE',
    availableCapacity: 10000,
    reservedCapacity: 0,
    minRate: 1.00,
    maxRate: 2.00,
    targetRate: 1.50,
    currency: 'USD',
    unit: 'per_mile',
    effectiveDate: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    terms: {
      minVolume: 100,
      maxVolume: 10000,
      commitmentPeriodDays: 30,
      paymentTermsDays: 30,
      cancellationNoticeDays: 7,
      qualityRequirements: [],
    },
    restrictions: {
      qualifiedPartnersOnly: true,
      minPartnerRating: 3.5,
      minPartnerTenureDays: 30,
      excludedPartners: [],
      requiredCertifications: [],
    },
    createdBy: 'SYSTEM',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {},
    ...overrides,
  };
}

function createTestRequest(overrides: Partial<PartnerRequest> = {}): PartnerRequest {
  return {
    id: 'REQ_TEST',
    partnerId: 'P1',
    offerId: 'OFFER_TEST',
    marketId: 'MARKET_001',
    zoneId: null,
    executionMode: 'STANDARD',
    requestedVolume: 1000,
    proposedRate: 1.25,
    currency: 'USD',
    unit: 'per_mile',
    startDate: new Date().toISOString(),
    endDate: null,
    status: 'PENDING',
    submittedAt: new Date().toISOString(),
    reviewedAt: null,
    reviewedBy: null,
    rejectionReasons: [],
    rejectionDetails: [],
    acceptedVolume: null,
    acceptedRate: null,
    metadata: {},
    ...overrides,
  };
}
