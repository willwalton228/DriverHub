/**
 * Marketplace & Partner Integrations Engine
 * 
 * Manages capacity offers, partner request intake, and acceptance gates for
 * controlled partner work distribution. This engine enforces market, safety,
 * profitability, and capacity rules with no bypass capability.
 * 
 * Key Components:
 * - Capacity Offer Engine: Generate offers by market/zone/execution_mode
 * - Partner Request Intake: Read-only request processing for partners
 * - Hard Acceptance Gate: Enforce all business rules before acceptance
 * - Rate & Hiring Protection: No bypass of rate floors or hiring controls
 * - Full Audit Trail: Track all partner demand and outcomes
 * 
 * NOT Implemented (by design):
 * - Dynamic bidding
 * - Partner pricing control
 * - Open marketplaces
 */

// =============================================================================
// TYPES
// =============================================================================

export type ExecutionMode = 
  | 'STANDARD'
  | 'EXPRESS'
  | 'DEDICATED'
  | 'OVERFLOW'
  | 'SURGE';

export type OfferStatus = 
  | 'DRAFT'
  | 'PUBLISHED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'EXPIRED'
  | 'WITHDRAWN';

export type RequestStatus =
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED';

export type RejectionReason =
  | 'MARKET_NOT_ACTIVE'
  | 'ZONE_NOT_COVERED'
  | 'CAPACITY_EXCEEDED'
  | 'SAFETY_THRESHOLD_VIOLATED'
  | 'PROFITABILITY_BELOW_MINIMUM'
  | 'RATE_BELOW_FLOOR'
  | 'HIRING_FREEZE_ACTIVE'
  | 'PARTNER_NOT_QUALIFIED'
  | 'PARTNER_BLOCKED'
  | 'VOLUME_LIMIT_EXCEEDED'
  | 'EXECUTION_MODE_UNAVAILABLE'
  | 'OFFER_EXPIRED'
  | 'OFFER_WITHDRAWN'
  | 'UTILIZATION_BOUNDS_VIOLATED';

export type AccessRole = 'PARTNER' | 'OPERATIONS' | 'SALES' | 'EXECUTIVE' | 'SYSTEM';

export interface CapacityOffer {
  id: string;
  marketId: string;
  zoneId: string | null;
  executionMode: ExecutionMode;
  status: OfferStatus;
  availableCapacity: number;
  reservedCapacity: number;
  minRate: number;
  maxRate: number;
  targetRate: number;
  currency: string;
  unit: string;
  effectiveDate: string;
  expiresAt: string;
  terms: OfferTerms;
  restrictions: OfferRestrictions;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface OfferTerms {
  minVolume: number;
  maxVolume: number;
  commitmentPeriodDays: number;
  paymentTermsDays: number;
  cancellationNoticeDays: number;
  qualityRequirements: string[];
}

export interface OfferRestrictions {
  qualifiedPartnersOnly: boolean;
  minPartnerRating: number | null;
  minPartnerTenureDays: number | null;
  excludedPartners: string[];
  requiredCertifications: string[];
}

export interface PartnerRequest {
  id: string;
  partnerId: string;
  offerId: string;
  marketId: string;
  zoneId: string | null;
  executionMode: ExecutionMode;
  requestedVolume: number;
  proposedRate: number;
  currency: string;
  unit: string;
  startDate: string;
  endDate: string | null;
  status: RequestStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReasons: RejectionReason[];
  rejectionDetails: string[];
  acceptedVolume: number | null;
  acceptedRate: number | null;
  metadata: Record<string, unknown>;
}

export interface PartnerProfile {
  partnerId: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED' | 'PENDING_APPROVAL';
  rating: number;
  tenureDays: number;
  certifications: string[];
  qualifiedMarkets: string[];
  blockedMarkets: string[];
  volumeLimit: number;
  currentVolume: number;
  safetyScore: number;
  createdAt: string;
}

export interface MarketCapacity {
  marketId: string;
  zoneId: string | null;
  totalCapacity: number;
  usedCapacity: number;
  reservedCapacity: number;
  availableCapacity: number;
  utilizationRate: number;
  isActive: boolean;
  hiringFreezeActive: boolean;
  safetyThreshold: number;
  profitabilityMinimum: number;
  rateFloor: number;
}

export interface AcceptanceGateInput {
  request: PartnerRequest;
  offer: CapacityOffer;
  partner: PartnerProfile;
  marketCapacity: MarketCapacity;
  currentSafetyScore?: number;
  currentProfitabilityScore?: number;
}

export interface AcceptanceGateResult {
  accepted: boolean;
  rejectionReasons: RejectionReason[];
  rejectionDetails: string[];
  gateChecks: GateCheck[];
  acceptedVolume: number | null;
  acceptedRate: number | null;
  warnings: string[];
}

export interface GateCheck {
  name: string;
  passed: boolean;
  reason: string;
  value?: unknown;
  threshold?: unknown;
}

export interface PartnerDemandRecord {
  id: string;
  partnerId: string;
  marketId: string;
  zoneId: string | null;
  executionMode: ExecutionMode;
  requestId: string;
  offerId: string;
  requestedVolume: number;
  proposedRate: number;
  outcome: 'ACCEPTED' | 'REJECTED' | 'PARTIAL' | 'EXPIRED' | 'CANCELLED';
  acceptedVolume: number | null;
  acceptedRate: number | null;
  rejectionReasons: RejectionReason[];
  timestamp: string;
}

export interface MarketplaceAuditRecord {
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

const capacityOffers = new Map<string, CapacityOffer>();
const partnerRequests = new Map<string, PartnerRequest>();
const partnerProfiles = new Map<string, PartnerProfile>();
const marketCapacities = new Map<string, MarketCapacity>();
const demandRecords: PartnerDemandRecord[] = [];
const auditRecords: MarketplaceAuditRecord[] = [];

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function getMarketCapacityKey(marketId: string, zoneId: string | null): string {
  return zoneId ? `${marketId}:${zoneId}` : marketId;
}

function addAuditRecord(record: Omit<MarketplaceAuditRecord, 'id' | 'timestamp'>): void {
  auditRecords.push({
    ...record,
    id: generateId('audit'),
    timestamp: new Date().toISOString(),
  });
}

function addDemandRecord(record: Omit<PartnerDemandRecord, 'id' | 'timestamp'>): void {
  demandRecords.push({
    ...record,
    id: generateId('demand'),
    timestamp: new Date().toISOString(),
  });
}

// =============================================================================
// ACCESS CONTROL
// =============================================================================

/**
 * Validate partner read access (partners can only view, not modify).
 */
export function validatePartnerReadAccess(role: AccessRole): boolean {
  return role === 'PARTNER' || role === 'OPERATIONS' || role === 'SALES' || role === 'EXECUTIVE' || role === 'SYSTEM';
}

/**
 * Validate write access (partners cannot write).
 */
export function validateWriteAccess(role: AccessRole): boolean {
  return role === 'OPERATIONS' || role === 'EXECUTIVE' || role === 'SYSTEM';
}

/**
 * Assert write access or throw.
 */
export function assertWriteAccess(role: AccessRole, action: string): void {
  if (!validateWriteAccess(role)) {
    throw new Error(`ACCESS_DENIED: Role ${role} cannot perform ${action}`);
  }
}

/**
 * Validate partner can only access their own requests.
 */
export function validatePartnerOwnAccess(role: AccessRole, requestPartnerId: string, actingPartnerId: string): boolean {
  if (role !== 'PARTNER') return true;
  return requestPartnerId === actingPartnerId;
}

// =============================================================================
// PARTNER PROFILE MANAGEMENT
// =============================================================================

/**
 * Register or update a partner profile.
 */
export function upsertPartnerProfile(
  profile: Omit<PartnerProfile, 'createdAt'> & { createdAt?: string },
  actor: string,
  role: AccessRole
): PartnerProfile {
  assertWriteAccess(role, 'UPSERT_PARTNER');
  
  const existing = partnerProfiles.get(profile.partnerId);
  
  const fullProfile: PartnerProfile = {
    ...profile,
    createdAt: existing?.createdAt ?? profile.createdAt ?? new Date().toISOString(),
  };
  
  partnerProfiles.set(profile.partnerId, fullProfile);
  
  addAuditRecord({
    action: existing ? 'PARTNER_UPDATED' : 'PARTNER_REGISTERED',
    entityType: 'PARTNER',
    entityId: profile.partnerId,
    actor,
    accessRole: role,
    details: { profile: fullProfile },
  });
  
  return fullProfile;
}

/**
 * Get a partner profile.
 */
export function getPartnerProfile(partnerId: string): PartnerProfile | undefined {
  return partnerProfiles.get(partnerId);
}

// =============================================================================
// MARKET CAPACITY MANAGEMENT
// =============================================================================

/**
 * Configure market capacity.
 */
export function configureMarketCapacity(
  capacity: MarketCapacity,
  actor: string,
  role: AccessRole
): MarketCapacity {
  assertWriteAccess(role, 'CONFIGURE_CAPACITY');
  
  const key = getMarketCapacityKey(capacity.marketId, capacity.zoneId);
  marketCapacities.set(key, capacity);
  
  addAuditRecord({
    action: 'CAPACITY_CONFIGURED',
    entityType: 'MARKET_CAPACITY',
    entityId: key,
    actor,
    accessRole: role,
    details: { capacity },
  });
  
  return capacity;
}

/**
 * Get market capacity.
 */
export function getMarketCapacity(marketId: string, zoneId: string | null): MarketCapacity | undefined {
  const key = getMarketCapacityKey(marketId, zoneId);
  let capacity = marketCapacities.get(key);
  
  // Fall back to market-level if zone-specific not found
  if (!capacity && zoneId) {
    capacity = marketCapacities.get(marketId);
  }
  
  return capacity;
}

/**
 * Update capacity usage.
 */
export function updateCapacityUsage(
  marketId: string,
  zoneId: string | null,
  usedDelta: number,
  reservedDelta: number,
  actor: string,
  role: AccessRole
): MarketCapacity {
  assertWriteAccess(role, 'UPDATE_CAPACITY');
  
  const capacity = getMarketCapacity(marketId, zoneId);
  if (!capacity) {
    throw new Error(`Market capacity not found for ${marketId}${zoneId ? ':' + zoneId : ''}`);
  }
  
  const updated: MarketCapacity = {
    ...capacity,
    usedCapacity: capacity.usedCapacity + usedDelta,
    reservedCapacity: capacity.reservedCapacity + reservedDelta,
    availableCapacity: capacity.totalCapacity - (capacity.usedCapacity + usedDelta) - (capacity.reservedCapacity + reservedDelta),
    utilizationRate: (capacity.usedCapacity + usedDelta) / capacity.totalCapacity,
  };
  
  const key = getMarketCapacityKey(marketId, zoneId);
  marketCapacities.set(key, updated);
  
  addAuditRecord({
    action: 'CAPACITY_UPDATED',
    entityType: 'MARKET_CAPACITY',
    entityId: key,
    actor,
    accessRole: role,
    details: { usedDelta, reservedDelta, before: capacity, after: updated },
  });
  
  return updated;
}

// =============================================================================
// CAPACITY OFFER ENGINE
// =============================================================================

/**
 * Create a capacity offer by market/zone/execution_mode.
 */
export function createCapacityOffer(
  input: {
    marketId: string;
    zoneId?: string | null;
    executionMode: ExecutionMode;
    availableCapacity: number;
    minRate: number;
    maxRate: number;
    targetRate: number;
    currency?: string;
    unit?: string;
    effectiveDays?: number;
    terms?: Partial<OfferTerms>;
    restrictions?: Partial<OfferRestrictions>;
  },
  actor: string,
  role: AccessRole
): CapacityOffer {
  assertWriteAccess(role, 'CREATE_OFFER');
  
  const now = new Date();
  const effectiveDays = input.effectiveDays ?? 7;
  const expiresAt = new Date(now.getTime() + effectiveDays * 24 * 60 * 60 * 1000);
  
  const offer: CapacityOffer = {
    id: generateId('offer'),
    marketId: input.marketId,
    zoneId: input.zoneId ?? null,
    executionMode: input.executionMode,
    status: 'DRAFT',
    availableCapacity: input.availableCapacity,
    reservedCapacity: 0,
    minRate: input.minRate,
    maxRate: input.maxRate,
    targetRate: input.targetRate,
    currency: input.currency ?? 'USD',
    unit: input.unit ?? 'per_mile',
    effectiveDate: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    terms: {
      minVolume: input.terms?.minVolume ?? 100,
      maxVolume: input.terms?.maxVolume ?? input.availableCapacity,
      commitmentPeriodDays: input.terms?.commitmentPeriodDays ?? 30,
      paymentTermsDays: input.terms?.paymentTermsDays ?? 30,
      cancellationNoticeDays: input.terms?.cancellationNoticeDays ?? 7,
      qualityRequirements: input.terms?.qualityRequirements ?? [],
    },
    restrictions: {
      qualifiedPartnersOnly: input.restrictions?.qualifiedPartnersOnly ?? true,
      minPartnerRating: input.restrictions?.minPartnerRating ?? 3.5,
      minPartnerTenureDays: input.restrictions?.minPartnerTenureDays ?? 30,
      excludedPartners: input.restrictions?.excludedPartners ?? [],
      requiredCertifications: input.restrictions?.requiredCertifications ?? [],
    },
    createdBy: actor,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    metadata: {},
  };
  
  capacityOffers.set(offer.id, offer);
  
  addAuditRecord({
    action: 'OFFER_CREATED',
    entityType: 'CAPACITY_OFFER',
    entityId: offer.id,
    actor,
    accessRole: role,
    details: { offer },
  });
  
  return offer;
}

/**
 * Publish an offer (make it available to partners).
 */
export function publishOffer(offerId: string, actor: string, role: AccessRole): CapacityOffer {
  assertWriteAccess(role, 'PUBLISH_OFFER');
  
  const offer = capacityOffers.get(offerId);
  if (!offer) throw new Error(`Offer not found: ${offerId}`);
  if (offer.status !== 'DRAFT' && offer.status !== 'PAUSED') {
    throw new Error(`Cannot publish offer in ${offer.status} status`);
  }
  
  const updated: CapacityOffer = {
    ...offer,
    status: 'ACTIVE',
    updatedAt: new Date().toISOString(),
  };
  
  capacityOffers.set(offerId, updated);
  
  addAuditRecord({
    action: 'OFFER_PUBLISHED',
    entityType: 'CAPACITY_OFFER',
    entityId: offerId,
    actor,
    accessRole: role,
    details: { previousStatus: offer.status },
  });
  
  return updated;
}

/**
 * Pause an active offer.
 */
export function pauseOffer(offerId: string, actor: string, role: AccessRole): CapacityOffer {
  assertWriteAccess(role, 'PAUSE_OFFER');
  
  const offer = capacityOffers.get(offerId);
  if (!offer) throw new Error(`Offer not found: ${offerId}`);
  if (offer.status !== 'ACTIVE') {
    throw new Error(`Cannot pause offer in ${offer.status} status`);
  }
  
  const updated: CapacityOffer = {
    ...offer,
    status: 'PAUSED',
    updatedAt: new Date().toISOString(),
  };
  
  capacityOffers.set(offerId, updated);
  
  addAuditRecord({
    action: 'OFFER_PAUSED',
    entityType: 'CAPACITY_OFFER',
    entityId: offerId,
    actor,
    accessRole: role,
    details: {},
  });
  
  return updated;
}

/**
 * Withdraw an offer.
 */
export function withdrawOffer(offerId: string, actor: string, role: AccessRole): CapacityOffer {
  assertWriteAccess(role, 'WITHDRAW_OFFER');
  
  const offer = capacityOffers.get(offerId);
  if (!offer) throw new Error(`Offer not found: ${offerId}`);
  if (offer.status === 'WITHDRAWN' || offer.status === 'EXPIRED') {
    throw new Error(`Offer already ${offer.status}`);
  }
  
  const updated: CapacityOffer = {
    ...offer,
    status: 'WITHDRAWN',
    updatedAt: new Date().toISOString(),
  };
  
  capacityOffers.set(offerId, updated);
  
  addAuditRecord({
    action: 'OFFER_WITHDRAWN',
    entityType: 'CAPACITY_OFFER',
    entityId: offerId,
    actor,
    accessRole: role,
    details: { previousStatus: offer.status },
  });
  
  return updated;
}

/**
 * Get an offer by ID.
 */
export function getOffer(offerId: string): CapacityOffer | undefined {
  return capacityOffers.get(offerId);
}

/**
 * List offers with filters.
 */
export function listOffers(filters?: {
  marketId?: string;
  zoneId?: string | null;
  executionMode?: ExecutionMode;
  status?: OfferStatus;
  activeOnly?: boolean;
}): CapacityOffer[] {
  const now = new Date().toISOString();
  let results = Array.from(capacityOffers.values());
  
  if (filters?.marketId) {
    results = results.filter(o => o.marketId === filters.marketId);
  }
  if (filters?.zoneId !== undefined) {
    results = results.filter(o => o.zoneId === filters.zoneId);
  }
  if (filters?.executionMode) {
    results = results.filter(o => o.executionMode === filters.executionMode);
  }
  if (filters?.status) {
    results = results.filter(o => o.status === filters.status);
  }
  if (filters?.activeOnly) {
    results = results.filter(o => o.status === 'ACTIVE' && o.expiresAt > now);
  }
  
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Get available offers for a partner (read-only view).
 */
export function getAvailableOffersForPartner(
  partnerId: string,
  marketId?: string
): CapacityOffer[] {
  const partner = partnerProfiles.get(partnerId);
  if (!partner) return [];
  if (partner.status !== 'ACTIVE') return [];
  
  const now = new Date().toISOString();
  
  return Array.from(capacityOffers.values())
    .filter(offer => {
      // Must be active and not expired
      if (offer.status !== 'ACTIVE') return false;
      if (offer.expiresAt <= now) return false;
      
      // Market filter
      if (marketId && offer.marketId !== marketId) return false;
      
      // Partner must be qualified for market
      if (!partner.qualifiedMarkets.includes(offer.marketId)) return false;
      
      // Partner not blocked
      if (partner.blockedMarkets.includes(offer.marketId)) return false;
      if (offer.restrictions.excludedPartners.includes(partnerId)) return false;
      
      // Check restrictions
      if (offer.restrictions.qualifiedPartnersOnly) {
        if (offer.restrictions.minPartnerRating && partner.rating < offer.restrictions.minPartnerRating) {
          return false;
        }
        if (offer.restrictions.minPartnerTenureDays && partner.tenureDays < offer.restrictions.minPartnerTenureDays) {
          return false;
        }
        if (offer.restrictions.requiredCertifications.length > 0) {
          const hasAllCerts = offer.restrictions.requiredCertifications.every(
            cert => partner.certifications.includes(cert)
          );
          if (!hasAllCerts) return false;
        }
      }
      
      // Has available capacity
      if (offer.availableCapacity - offer.reservedCapacity <= 0) return false;
      
      return true;
    })
    .sort((a, b) => b.targetRate - a.targetRate);
}

// =============================================================================
// PARTNER REQUEST INTAKE
// =============================================================================

/**
 * Submit a partner request for capacity.
 * Partners can submit requests but cannot modify outcomes.
 */
export function submitPartnerRequest(
  input: {
    partnerId: string;
    offerId: string;
    requestedVolume: number;
    proposedRate: number;
    startDate: string;
    endDate?: string | null;
  },
  actor: string,
  role: AccessRole
): PartnerRequest {
  // Partners can submit their own requests
  if (role === 'PARTNER' && actor !== input.partnerId) {
    throw new Error('ACCESS_DENIED: Partners can only submit requests for themselves');
  }
  
  const offer = capacityOffers.get(input.offerId);
  if (!offer) throw new Error(`Offer not found: ${input.offerId}`);
  
  const partner = partnerProfiles.get(input.partnerId);
  if (!partner) throw new Error(`Partner not found: ${input.partnerId}`);
  
  const request: PartnerRequest = {
    id: generateId('request'),
    partnerId: input.partnerId,
    offerId: input.offerId,
    marketId: offer.marketId,
    zoneId: offer.zoneId,
    executionMode: offer.executionMode,
    requestedVolume: input.requestedVolume,
    proposedRate: input.proposedRate,
    currency: offer.currency,
    unit: offer.unit,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
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
  
  partnerRequests.set(request.id, request);
  
  addAuditRecord({
    action: 'REQUEST_SUBMITTED',
    entityType: 'PARTNER_REQUEST',
    entityId: request.id,
    actor,
    accessRole: role,
    details: { request },
  });
  
  return request;
}

/**
 * Get a partner request by ID.
 * Partners can only see their own requests.
 */
export function getRequest(
  requestId: string,
  actingPartnerId?: string,
  role?: AccessRole
): PartnerRequest | undefined {
  const request = partnerRequests.get(requestId);
  if (!request) return undefined;
  
  if (role === 'PARTNER' && actingPartnerId && request.partnerId !== actingPartnerId) {
    return undefined; // Partners can only see their own requests
  }
  
  return request;
}

/**
 * List partner requests.
 * Partners can only see their own requests.
 */
export function listRequests(
  filters: {
    partnerId?: string;
    offerId?: string;
    marketId?: string;
    status?: RequestStatus;
    limit?: number;
  },
  actingPartnerId?: string,
  role?: AccessRole
): PartnerRequest[] {
  let results = Array.from(partnerRequests.values());
  
  // Partners can only see their own requests
  if (role === 'PARTNER' && actingPartnerId) {
    results = results.filter(r => r.partnerId === actingPartnerId);
  }
  
  if (filters.partnerId) {
    results = results.filter(r => r.partnerId === filters.partnerId);
  }
  if (filters.offerId) {
    results = results.filter(r => r.offerId === filters.offerId);
  }
  if (filters.marketId) {
    results = results.filter(r => r.marketId === filters.marketId);
  }
  if (filters.status) {
    results = results.filter(r => r.status === filters.status);
  }
  
  results.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  
  if (filters.limit) {
    results = results.slice(0, filters.limit);
  }
  
  return results;
}

// =============================================================================
// HARD ACCEPTANCE GATE
// =============================================================================

/**
 * Evaluate the hard acceptance gate.
 * This enforces ALL business rules with no bypass capability.
 */
export function evaluateAcceptanceGate(input: AcceptanceGateInput): AcceptanceGateResult {
  const { request, offer, partner, marketCapacity } = input;
  const rejectionReasons: RejectionReason[] = [];
  const rejectionDetails: string[] = [];
  const gateChecks: GateCheck[] = [];
  const warnings: string[] = [];
  
  // Gate 1: Market Active
  gateChecks.push({
    name: 'MARKET_ACTIVE',
    passed: marketCapacity.isActive,
    reason: marketCapacity.isActive ? 'Market is active' : 'Market is not active',
    value: marketCapacity.isActive,
  });
  if (!marketCapacity.isActive) {
    rejectionReasons.push('MARKET_NOT_ACTIVE');
    rejectionDetails.push(`Market ${request.marketId} is not active for partner work`);
  }
  
  // Gate 2: Offer Status
  const offerValid = offer.status === 'ACTIVE' && offer.expiresAt > new Date().toISOString();
  gateChecks.push({
    name: 'OFFER_VALID',
    passed: offerValid,
    reason: offerValid ? 'Offer is active' : `Offer status: ${offer.status}`,
    value: offer.status,
  });
  if (offer.status === 'WITHDRAWN') {
    rejectionReasons.push('OFFER_WITHDRAWN');
    rejectionDetails.push('Offer has been withdrawn');
  } else if (offer.status === 'EXPIRED' || offer.expiresAt <= new Date().toISOString()) {
    rejectionReasons.push('OFFER_EXPIRED');
    rejectionDetails.push('Offer has expired');
  }
  
  // Gate 3: Partner Status
  const partnerActive = partner.status === 'ACTIVE';
  gateChecks.push({
    name: 'PARTNER_ACTIVE',
    passed: partnerActive,
    reason: partnerActive ? 'Partner is active' : `Partner status: ${partner.status}`,
    value: partner.status,
  });
  if (partner.status === 'BLOCKED') {
    rejectionReasons.push('PARTNER_BLOCKED');
    rejectionDetails.push('Partner is blocked');
  } else if (partner.status !== 'ACTIVE') {
    rejectionReasons.push('PARTNER_NOT_QUALIFIED');
    rejectionDetails.push(`Partner status ${partner.status} does not qualify`);
  }
  
  // Gate 4: Partner Qualifications
  const meetsRating = !offer.restrictions.minPartnerRating || partner.rating >= offer.restrictions.minPartnerRating;
  gateChecks.push({
    name: 'PARTNER_RATING',
    passed: meetsRating,
    reason: meetsRating ? 'Rating requirement met' : 'Rating below minimum',
    value: partner.rating,
    threshold: offer.restrictions.minPartnerRating,
  });
  if (!meetsRating) {
    rejectionReasons.push('PARTNER_NOT_QUALIFIED');
    rejectionDetails.push(`Partner rating ${partner.rating} below minimum ${offer.restrictions.minPartnerRating}`);
  }
  
  // Gate 5: Capacity Check
  const remainingCapacity = offer.availableCapacity - offer.reservedCapacity;
  const hasCapacity = request.requestedVolume <= remainingCapacity;
  gateChecks.push({
    name: 'CAPACITY_AVAILABLE',
    passed: hasCapacity,
    reason: hasCapacity ? 'Capacity available' : 'Requested volume exceeds available',
    value: request.requestedVolume,
    threshold: remainingCapacity,
  });
  if (!hasCapacity) {
    rejectionReasons.push('CAPACITY_EXCEEDED');
    rejectionDetails.push(`Requested ${request.requestedVolume} exceeds available ${remainingCapacity}`);
  }
  
  // Gate 6: Rate Floor (NO BYPASS)
  const rateAboveFloor = request.proposedRate >= offer.minRate;
  gateChecks.push({
    name: 'RATE_FLOOR',
    passed: rateAboveFloor,
    reason: rateAboveFloor ? 'Rate meets floor' : 'Rate below floor - NO BYPASS ALLOWED',
    value: request.proposedRate,
    threshold: offer.minRate,
  });
  if (!rateAboveFloor) {
    rejectionReasons.push('RATE_BELOW_FLOOR');
    rejectionDetails.push(`Proposed rate $${request.proposedRate.toFixed(2)} below floor $${offer.minRate.toFixed(2)} - NO BYPASS`);
  }
  
  // Gate 7: Hiring Freeze (NO BYPASS)
  gateChecks.push({
    name: 'HIRING_FREEZE',
    passed: !marketCapacity.hiringFreezeActive,
    reason: !marketCapacity.hiringFreezeActive ? 'No hiring freeze' : 'Hiring freeze active - NO BYPASS ALLOWED',
    value: marketCapacity.hiringFreezeActive,
  });
  if (marketCapacity.hiringFreezeActive) {
    rejectionReasons.push('HIRING_FREEZE_ACTIVE');
    rejectionDetails.push('Hiring freeze is active for this market - NO BYPASS');
  }
  
  // Gate 8: Safety Threshold
  const safetyScore = input.currentSafetyScore ?? partner.safetyScore;
  const meetsSafety = safetyScore >= marketCapacity.safetyThreshold;
  gateChecks.push({
    name: 'SAFETY_THRESHOLD',
    passed: meetsSafety,
    reason: meetsSafety ? 'Safety threshold met' : 'Safety score below threshold',
    value: safetyScore,
    threshold: marketCapacity.safetyThreshold,
  });
  if (!meetsSafety) {
    rejectionReasons.push('SAFETY_THRESHOLD_VIOLATED');
    rejectionDetails.push(`Safety score ${safetyScore} below threshold ${marketCapacity.safetyThreshold}`);
  }
  
  // Gate 9: Profitability Minimum
  const profitabilityScore = input.currentProfitabilityScore ?? 70;
  const meetsProfitability = profitabilityScore >= marketCapacity.profitabilityMinimum;
  gateChecks.push({
    name: 'PROFITABILITY_MINIMUM',
    passed: meetsProfitability,
    reason: meetsProfitability ? 'Profitability threshold met' : 'Profitability below minimum',
    value: profitabilityScore,
    threshold: marketCapacity.profitabilityMinimum,
  });
  if (!meetsProfitability) {
    rejectionReasons.push('PROFITABILITY_BELOW_MINIMUM');
    rejectionDetails.push(`Profitability score ${profitabilityScore} below minimum ${marketCapacity.profitabilityMinimum}`);
  }
  
  // Gate 10: Partner Volume Limit
  const withinVolumeLimit = partner.currentVolume + request.requestedVolume <= partner.volumeLimit;
  gateChecks.push({
    name: 'VOLUME_LIMIT',
    passed: withinVolumeLimit,
    reason: withinVolumeLimit ? 'Within volume limit' : 'Volume limit exceeded',
    value: partner.currentVolume + request.requestedVolume,
    threshold: partner.volumeLimit,
  });
  if (!withinVolumeLimit) {
    rejectionReasons.push('VOLUME_LIMIT_EXCEEDED');
    rejectionDetails.push(`Adding ${request.requestedVolume} would exceed partner volume limit of ${partner.volumeLimit}`);
  }
  
  // Gate 11: Utilization Bounds
  const projectedUtilization = (marketCapacity.usedCapacity + request.requestedVolume) / marketCapacity.totalCapacity;
  const withinUtilization = projectedUtilization <= 0.95;
  gateChecks.push({
    name: 'UTILIZATION_BOUNDS',
    passed: withinUtilization,
    reason: withinUtilization ? 'Utilization within bounds' : 'Would exceed utilization ceiling',
    value: projectedUtilization,
    threshold: 0.95,
  });
  if (!withinUtilization) {
    rejectionReasons.push('UTILIZATION_BOUNDS_VIOLATED');
    rejectionDetails.push(`Projected utilization ${(projectedUtilization * 100).toFixed(1)}% exceeds 95% ceiling`);
  }
  
  // Determine acceptance
  const accepted = rejectionReasons.length === 0;
  
  // Add warnings for near-threshold conditions
  if (accepted) {
    if (projectedUtilization > 0.85) {
      warnings.push(`Utilization approaching limit: ${(projectedUtilization * 100).toFixed(1)}%`);
    }
    if (remainingCapacity - request.requestedVolume < offer.terms.minVolume) {
      warnings.push('Remaining capacity after acceptance will be below minimum volume threshold');
    }
  }
  
  return {
    accepted,
    rejectionReasons,
    rejectionDetails,
    gateChecks,
    acceptedVolume: accepted ? request.requestedVolume : null,
    acceptedRate: accepted ? request.proposedRate : null,
    warnings,
  };
}

/**
 * Process a partner request through the acceptance gate.
 * This is the main entry point for request processing.
 */
export function processRequest(
  requestId: string,
  actor: string,
  role: AccessRole
): { request: PartnerRequest; gateResult: AcceptanceGateResult } {
  assertWriteAccess(role, 'PROCESS_REQUEST');
  
  const request = partnerRequests.get(requestId);
  if (!request) throw new Error(`Request not found: ${requestId}`);
  if (request.status !== 'PENDING') {
    throw new Error(`Request already processed: ${request.status}`);
  }
  
  const offer = capacityOffers.get(request.offerId);
  if (!offer) throw new Error(`Offer not found: ${request.offerId}`);
  
  const partner = partnerProfiles.get(request.partnerId);
  if (!partner) throw new Error(`Partner not found: ${request.partnerId}`);
  
  const marketCapacity = getMarketCapacity(request.marketId, request.zoneId);
  if (!marketCapacity) throw new Error(`Market capacity not found: ${request.marketId}`);
  
  // Evaluate the gate
  const gateResult = evaluateAcceptanceGate({
    request,
    offer,
    partner,
    marketCapacity,
  });
  
  // Update request status
  const updatedRequest: PartnerRequest = {
    ...request,
    status: gateResult.accepted ? 'ACCEPTED' : 'REJECTED',
    reviewedAt: new Date().toISOString(),
    reviewedBy: actor,
    rejectionReasons: gateResult.rejectionReasons,
    rejectionDetails: gateResult.rejectionDetails,
    acceptedVolume: gateResult.acceptedVolume,
    acceptedRate: gateResult.acceptedRate,
  };
  
  partnerRequests.set(requestId, updatedRequest);
  
  // Update capacity if accepted
  if (gateResult.accepted && gateResult.acceptedVolume) {
    // Reserve capacity on the offer
    const updatedOffer: CapacityOffer = {
      ...offer,
      reservedCapacity: offer.reservedCapacity + gateResult.acceptedVolume,
      updatedAt: new Date().toISOString(),
    };
    capacityOffers.set(offer.id, updatedOffer);
  }
  
  // Record demand
  addDemandRecord({
    partnerId: request.partnerId,
    marketId: request.marketId,
    zoneId: request.zoneId,
    executionMode: request.executionMode,
    requestId: request.id,
    offerId: request.offerId,
    requestedVolume: request.requestedVolume,
    proposedRate: request.proposedRate,
    outcome: gateResult.accepted ? 'ACCEPTED' : 'REJECTED',
    acceptedVolume: gateResult.acceptedVolume,
    acceptedRate: gateResult.acceptedRate,
    rejectionReasons: gateResult.rejectionReasons,
  });
  
  addAuditRecord({
    action: gateResult.accepted ? 'REQUEST_ACCEPTED' : 'REQUEST_REJECTED',
    entityType: 'PARTNER_REQUEST',
    entityId: requestId,
    actor,
    accessRole: role,
    details: {
      gateResult,
      request: updatedRequest,
    },
  });
  
  return { request: updatedRequest, gateResult };
}

// =============================================================================
// DEMAND & OUTCOME TRACKING
// =============================================================================

/**
 * Get demand records for analysis.
 */
export function getDemandRecords(filters?: {
  partnerId?: string;
  marketId?: string;
  outcome?: PartnerDemandRecord['outcome'];
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): PartnerDemandRecord[] {
  let results = [...demandRecords];
  
  if (filters?.partnerId) {
    results = results.filter(r => r.partnerId === filters.partnerId);
  }
  if (filters?.marketId) {
    results = results.filter(r => r.marketId === filters.marketId);
  }
  if (filters?.outcome) {
    results = results.filter(r => r.outcome === filters.outcome);
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

/**
 * Get demand summary by market.
 */
export function getDemandSummary(marketId: string): {
  totalRequests: number;
  accepted: number;
  rejected: number;
  acceptanceRate: number;
  totalRequestedVolume: number;
  totalAcceptedVolume: number;
  topRejectionReasons: { reason: RejectionReason; count: number }[];
} {
  const records = demandRecords.filter(r => r.marketId === marketId);
  
  const accepted = records.filter(r => r.outcome === 'ACCEPTED').length;
  const rejected = records.filter(r => r.outcome === 'REJECTED').length;
  
  const totalRequestedVolume = records.reduce((sum, r) => sum + r.requestedVolume, 0);
  const totalAcceptedVolume = records
    .filter(r => r.acceptedVolume)
    .reduce((sum, r) => sum + (r.acceptedVolume ?? 0), 0);
  
  // Count rejection reasons
  const reasonCounts = new Map<RejectionReason, number>();
  for (const record of records) {
    for (const reason of record.rejectionReasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }
  
  const topRejectionReasons = Array.from(reasonCounts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  return {
    totalRequests: records.length,
    accepted,
    rejected,
    acceptanceRate: records.length > 0 ? accepted / records.length : 0,
    totalRequestedVolume,
    totalAcceptedVolume,
    topRejectionReasons,
  };
}

// =============================================================================
// AUDIT TRAIL
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
}): MarketplaceAuditRecord[] {
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
export function clearMarketplaceData(): void {
  capacityOffers.clear();
  partnerRequests.clear();
  partnerProfiles.clear();
  marketCapacities.clear();
  demandRecords.length = 0;
  auditRecords.length = 0;
}
