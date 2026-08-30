/**
 * White-Labeling & Platformization Engine
 * 
 * Provides multi-tenant infrastructure for the NexCopy platform including:
 * - Tenant/instance isolation model
 * - Feature flag framework by tenant
 * - Light branding configuration (cosmetic only, no logic changes)
 * - Usage metering for licensing
 * - Core enforcement logic protection from tenant override
 * 
 * NOT Implemented (by design):
 * - Tenant-specific forks
 * - Billing systems
 * - Custom features per tenant
 */

// =============================================================================
// TYPES
// =============================================================================

export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'TRIAL' | 'PENDING_SETUP';

export type TenantTier = 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE' | 'CUSTOM';

export type FeatureFlagStatus = 'ENABLED' | 'DISABLED' | 'BETA';

export type MeterEventType = 
  | 'API_CALL'
  | 'DRIVER_CREATED'
  | 'PAY_RECORD_PROCESSED'
  | 'DOCUMENT_UPLOADED'
  | 'REPORT_GENERATED'
  | 'NOTIFICATION_SENT'
  | 'INTEGRATION_SYNC'
  | 'STORAGE_USED_MB'
  | 'ACTIVE_USER_SESSION';

export type CoreEnforcementCategory =
  | 'RATE_FLOOR'
  | 'HIRING_FREEZE'
  | 'SAFETY_THRESHOLD'
  | 'PROFITABILITY_MINIMUM'
  | 'CAPACITY_LIMIT'
  | 'VOLUME_LIMIT'
  | 'UTILIZATION_BOUNDS';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  tier: TenantTier;
  createdAt: string;
  activatedAt: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  contactEmail: string;
  contactName: string;
  metadata: Record<string, unknown>;
}

export interface TenantConfiguration {
  tenantId: string;
  branding: BrandingConfiguration;
  featureFlags: FeatureFlag[];
  limits: TenantLimits;
  updatedAt: string;
  updatedBy: string;
}

export interface BrandingConfiguration {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  companyName: string;
  productName: string;
  supportEmail: string;
  supportUrl: string | null;
  customCss: string | null;
  footerText: string | null;
}

export interface FeatureFlag {
  key: string;
  status: FeatureFlagStatus;
  description: string;
  enabledAt: string | null;
  disabledAt: string | null;
  betaPercentage: number | null;
}

export interface TenantLimits {
  maxDrivers: number;
  maxUsers: number;
  maxStorageMb: number;
  maxApiCallsPerDay: number;
  maxMarketsActive: number;
  retentionDays: number;
}

export interface UsageMeter {
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  meters: MeterReading[];
  lastUpdated: string;
}

export interface MeterReading {
  eventType: MeterEventType;
  count: number;
  limit: number | null;
  percentage: number | null;
  lastRecorded: string;
}

export interface MeterEvent {
  id: string;
  tenantId: string;
  eventType: MeterEventType;
  quantity: number;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface CoreEnforcementRule {
  category: CoreEnforcementCategory;
  description: string;
  isProtected: boolean;
  canTenantModify: boolean;
  tenantOverrideLimit: number | null;
}

export interface TenantOverrideAttempt {
  id: string;
  tenantId: string;
  category: CoreEnforcementCategory;
  attemptedValue: unknown;
  blocked: boolean;
  reason: string;
  timestamp: string;
  actor: string;
}

export interface PlatformAuditRecord {
  id: string;
  timestamp: string;
  tenantId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  actor: string;
  details: Record<string, unknown>;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Default feature flags for new tenants by tier.
 */
const DEFAULT_FEATURES_BY_TIER: Record<TenantTier, string[]> = {
  STARTER: [
    'DRIVER_PORTAL',
    'BASIC_REPORTING',
    'DOCUMENT_UPLOAD',
    'NOTIFICATIONS',
  ],
  PROFESSIONAL: [
    'DRIVER_PORTAL',
    'BASIC_REPORTING',
    'ADVANCED_REPORTING',
    'DOCUMENT_UPLOAD',
    'NOTIFICATIONS',
    'PAYROLL_PROCESSING',
    'EXPENSE_REIMBURSEMENT',
    'SAFETY_TRACKING',
  ],
  ENTERPRISE: [
    'DRIVER_PORTAL',
    'BASIC_REPORTING',
    'ADVANCED_REPORTING',
    'DOCUMENT_UPLOAD',
    'NOTIFICATIONS',
    'PAYROLL_PROCESSING',
    'EXPENSE_REIMBURSEMENT',
    'SAFETY_TRACKING',
    'MARKET_MANAGEMENT',
    'PARTNER_INTEGRATIONS',
    'FORECASTING',
    'AI_RECOMMENDATIONS',
    'CAPITAL_REPORTING',
    'CUSTOM_BRANDING',
  ],
  CUSTOM: [], // Configured individually
};

/**
 * Default limits by tier.
 */
const DEFAULT_LIMITS_BY_TIER: Record<TenantTier, TenantLimits> = {
  STARTER: {
    maxDrivers: 50,
    maxUsers: 5,
    maxStorageMb: 1024, // 1GB
    maxApiCallsPerDay: 10000,
    maxMarketsActive: 1,
    retentionDays: 365,
  },
  PROFESSIONAL: {
    maxDrivers: 500,
    maxUsers: 25,
    maxStorageMb: 10240, // 10GB
    maxApiCallsPerDay: 100000,
    maxMarketsActive: 5,
    retentionDays: 730,
  },
  ENTERPRISE: {
    maxDrivers: -1, // Unlimited
    maxUsers: -1,
    maxStorageMb: 102400, // 100GB
    maxApiCallsPerDay: -1,
    maxMarketsActive: -1,
    retentionDays: 2555, // 7 years
  },
  CUSTOM: {
    maxDrivers: 100,
    maxUsers: 10,
    maxStorageMb: 5120,
    maxApiCallsPerDay: 50000,
    maxMarketsActive: 3,
    retentionDays: 365,
  },
};

/**
 * Core enforcement rules that cannot be bypassed by tenants.
 */
const CORE_ENFORCEMENT_RULES: CoreEnforcementRule[] = [
  {
    category: 'RATE_FLOOR',
    description: 'Minimum rate floor for partner work',
    isProtected: true,
    canTenantModify: false,
    tenantOverrideLimit: null,
  },
  {
    category: 'HIRING_FREEZE',
    description: 'Hiring freeze enforcement',
    isProtected: true,
    canTenantModify: false,
    tenantOverrideLimit: null,
  },
  {
    category: 'SAFETY_THRESHOLD',
    description: 'Minimum safety score requirement',
    isProtected: true,
    canTenantModify: false,
    tenantOverrideLimit: null,
  },
  {
    category: 'PROFITABILITY_MINIMUM',
    description: 'Minimum profitability threshold',
    isProtected: true,
    canTenantModify: false,
    tenantOverrideLimit: null,
  },
  {
    category: 'CAPACITY_LIMIT',
    description: 'Market capacity limits',
    isProtected: true,
    canTenantModify: false,
    tenantOverrideLimit: null,
  },
  {
    category: 'VOLUME_LIMIT',
    description: 'Partner volume limits',
    isProtected: true,
    canTenantModify: false,
    tenantOverrideLimit: null,
  },
  {
    category: 'UTILIZATION_BOUNDS',
    description: 'Utilization ceiling enforcement',
    isProtected: true,
    canTenantModify: false,
    tenantOverrideLimit: null,
  },
];

/**
 * Default branding configuration.
 */
const DEFAULT_BRANDING: BrandingConfiguration = {
  primaryColor: '#FF6B35',
  secondaryColor: '#4A5568',
  accentColor: '#48BB78',
  logoUrl: null,
  faviconUrl: null,
  companyName: 'NexCopy',
  productName: 'DriverHub 360',
  supportEmail: 'support@driverhub360.com',
  supportUrl: null,
  customCss: null,
  footerText: null,
};

// =============================================================================
// IN-MEMORY STORAGE
// =============================================================================

const tenants = new Map<string, Tenant>();
const tenantConfigs = new Map<string, TenantConfiguration>();
const usageMeters = new Map<string, UsageMeter>();
const meterEvents: MeterEvent[] = [];
const overrideAttempts: TenantOverrideAttempt[] = [];
const auditRecords: PlatformAuditRecord[] = [];

// Current tenant context (thread-local simulation)
let currentTenantId: string | null = null;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function addAuditRecord(record: Omit<PlatformAuditRecord, 'id' | 'timestamp'>): void {
  auditRecords.push({
    ...record,
    id: generateId('audit'),
    timestamp: new Date().toISOString(),
  });
}

function getCurrentPeriodBounds(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

// =============================================================================
// TENANT CONTEXT
// =============================================================================

/**
 * Set the current tenant context.
 * All operations will be scoped to this tenant.
 */
export function setCurrentTenant(tenantId: string | null): void {
  currentTenantId = tenantId;
}

/**
 * Get the current tenant ID.
 */
export function getCurrentTenantId(): string | null {
  return currentTenantId;
}

/**
 * Execute a function within a tenant context.
 */
export function withTenantContext<T>(tenantId: string, fn: () => T): T {
  const previousTenantId = currentTenantId;
  try {
    currentTenantId = tenantId;
    return fn();
  } finally {
    currentTenantId = previousTenantId;
  }
}

/**
 * Assert that a tenant context is set.
 */
export function assertTenantContext(): string {
  if (!currentTenantId) {
    throw new Error('TENANT_CONTEXT_REQUIRED: No tenant context set');
  }
  return currentTenantId;
}

/**
 * Validate that the current tenant matches the expected tenant.
 */
export function validateTenantIsolation(expectedTenantId: string): void {
  const currentId = assertTenantContext();
  if (currentId !== expectedTenantId) {
    throw new Error(`TENANT_ISOLATION_VIOLATION: Expected ${expectedTenantId}, got ${currentId}`);
  }
}

// =============================================================================
// TENANT MANAGEMENT
// =============================================================================

/**
 * Create a new tenant.
 */
export function createTenant(input: {
  name: string;
  slug: string;
  tier: TenantTier;
  contactEmail: string;
  contactName: string;
  status?: TenantStatus;
}, actor: string): Tenant {
  // Validate slug uniqueness
  const existing = Array.from(tenants.values()).find(t => t.slug === input.slug);
  if (existing) {
    throw new Error(`Tenant slug '${input.slug}' already exists`);
  }
  
  const tenant: Tenant = {
    id: generateId('tenant'),
    name: input.name,
    slug: input.slug,
    status: input.status ?? 'PENDING_SETUP',
    tier: input.tier,
    createdAt: new Date().toISOString(),
    activatedAt: null,
    suspendedAt: null,
    suspendedReason: null,
    contactEmail: input.contactEmail,
    contactName: input.contactName,
    metadata: {},
  };
  
  tenants.set(tenant.id, tenant);
  
  // Create default configuration
  initializeTenantConfiguration(tenant.id, tenant.tier, actor);
  
  // Initialize usage meter
  initializeUsageMeter(tenant.id);
  
  addAuditRecord({
    tenantId: tenant.id,
    action: 'TENANT_CREATED',
    entityType: 'TENANT',
    entityId: tenant.id,
    actor,
    details: { tenant },
  });
  
  return tenant;
}

/**
 * Get a tenant by ID.
 */
export function getTenant(tenantId: string): Tenant | undefined {
  return tenants.get(tenantId);
}

/**
 * Get a tenant by slug.
 */
export function getTenantBySlug(slug: string): Tenant | undefined {
  return Array.from(tenants.values()).find(t => t.slug === slug);
}

/**
 * List all tenants.
 */
export function listTenants(filters?: {
  status?: TenantStatus;
  tier?: TenantTier;
}): Tenant[] {
  let results = Array.from(tenants.values());
  
  if (filters?.status) {
    results = results.filter(t => t.status === filters.status);
  }
  if (filters?.tier) {
    results = results.filter(t => t.tier === filters.tier);
  }
  
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Activate a tenant.
 */
export function activateTenant(tenantId: string, actor: string): Tenant {
  const tenant = tenants.get(tenantId);
  if (!tenant) throw new Error(`Tenant not found: ${tenantId}`);
  
  const updated: Tenant = {
    ...tenant,
    status: 'ACTIVE',
    activatedAt: new Date().toISOString(),
    suspendedAt: null,
    suspendedReason: null,
  };
  
  tenants.set(tenantId, updated);
  
  addAuditRecord({
    tenantId,
    action: 'TENANT_ACTIVATED',
    entityType: 'TENANT',
    entityId: tenantId,
    actor,
    details: { previousStatus: tenant.status },
  });
  
  return updated;
}

/**
 * Suspend a tenant.
 */
export function suspendTenant(tenantId: string, reason: string, actor: string): Tenant {
  const tenant = tenants.get(tenantId);
  if (!tenant) throw new Error(`Tenant not found: ${tenantId}`);
  
  const updated: Tenant = {
    ...tenant,
    status: 'SUSPENDED',
    suspendedAt: new Date().toISOString(),
    suspendedReason: reason,
  };
  
  tenants.set(tenantId, updated);
  
  addAuditRecord({
    tenantId,
    action: 'TENANT_SUSPENDED',
    entityType: 'TENANT',
    entityId: tenantId,
    actor,
    details: { reason, previousStatus: tenant.status },
  });
  
  return updated;
}

/**
 * Update tenant tier.
 */
export function updateTenantTier(tenantId: string, tier: TenantTier, actor: string): Tenant {
  const tenant = tenants.get(tenantId);
  if (!tenant) throw new Error(`Tenant not found: ${tenantId}`);
  
  const previousTier = tenant.tier;
  const updated: Tenant = {
    ...tenant,
    tier,
  };
  
  tenants.set(tenantId, updated);
  
  // Update configuration with new tier defaults
  const config = tenantConfigs.get(tenantId);
  if (config) {
    const updatedConfig: TenantConfiguration = {
      ...config,
      limits: DEFAULT_LIMITS_BY_TIER[tier],
      featureFlags: createDefaultFeatureFlags(tier),
      updatedAt: new Date().toISOString(),
      updatedBy: actor,
    };
    tenantConfigs.set(tenantId, updatedConfig);
  }
  
  addAuditRecord({
    tenantId,
    action: 'TENANT_TIER_CHANGED',
    entityType: 'TENANT',
    entityId: tenantId,
    actor,
    details: { previousTier, newTier: tier },
  });
  
  return updated;
}

// =============================================================================
// TENANT CONFIGURATION
// =============================================================================

/**
 * Create default feature flags for a tier.
 */
function createDefaultFeatureFlags(tier: TenantTier): FeatureFlag[] {
  const enabledFeatures = DEFAULT_FEATURES_BY_TIER[tier];
  const allFeatures = [
    'DRIVER_PORTAL',
    'BASIC_REPORTING',
    'ADVANCED_REPORTING',
    'DOCUMENT_UPLOAD',
    'NOTIFICATIONS',
    'PAYROLL_PROCESSING',
    'EXPENSE_REIMBURSEMENT',
    'SAFETY_TRACKING',
    'MARKET_MANAGEMENT',
    'PARTNER_INTEGRATIONS',
    'FORECASTING',
    'AI_RECOMMENDATIONS',
    'CAPITAL_REPORTING',
    'CUSTOM_BRANDING',
  ];
  
  return allFeatures.map(key => ({
    key,
    status: enabledFeatures.includes(key) ? 'ENABLED' as const : 'DISABLED' as const,
    description: `Feature: ${key}`,
    enabledAt: enabledFeatures.includes(key) ? new Date().toISOString() : null,
    disabledAt: null,
    betaPercentage: null,
  }));
}

/**
 * Initialize tenant configuration with defaults.
 */
function initializeTenantConfiguration(tenantId: string, tier: TenantTier, actor: string): TenantConfiguration {
  const config: TenantConfiguration = {
    tenantId,
    branding: { ...DEFAULT_BRANDING },
    featureFlags: createDefaultFeatureFlags(tier),
    limits: { ...DEFAULT_LIMITS_BY_TIER[tier] },
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };
  
  tenantConfigs.set(tenantId, config);
  return config;
}

/**
 * Get tenant configuration.
 */
export function getTenantConfiguration(tenantId: string): TenantConfiguration | undefined {
  return tenantConfigs.get(tenantId);
}

/**
 * Update tenant branding (cosmetic only).
 */
export function updateBranding(
  tenantId: string,
  branding: Partial<BrandingConfiguration>,
  actor: string
): TenantConfiguration {
  const config = tenantConfigs.get(tenantId);
  if (!config) throw new Error(`Tenant configuration not found: ${tenantId}`);
  
  // Check if tenant has CUSTOM_BRANDING feature
  const hasCustomBranding = isFeatureEnabled(tenantId, 'CUSTOM_BRANDING');
  if (!hasCustomBranding) {
    throw new Error('FEATURE_NOT_ENABLED: Custom branding requires CUSTOM_BRANDING feature');
  }
  
  const updated: TenantConfiguration = {
    ...config,
    branding: {
      ...config.branding,
      ...branding,
    },
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };
  
  tenantConfigs.set(tenantId, updated);
  
  addAuditRecord({
    tenantId,
    action: 'BRANDING_UPDATED',
    entityType: 'TENANT_CONFIG',
    entityId: tenantId,
    actor,
    details: { changes: branding },
  });
  
  return updated;
}

/**
 * Get branding for a tenant (with defaults).
 */
export function getBranding(tenantId: string): BrandingConfiguration {
  const config = tenantConfigs.get(tenantId);
  if (!config) return { ...DEFAULT_BRANDING };
  return config.branding;
}

// =============================================================================
// FEATURE FLAGS
// =============================================================================

/**
 * Check if a feature is enabled for a tenant.
 */
export function isFeatureEnabled(tenantId: string, featureKey: string): boolean {
  const config = tenantConfigs.get(tenantId);
  if (!config) return false;
  
  const flag = config.featureFlags.find(f => f.key === featureKey);
  if (!flag) return false;
  
  if (flag.status === 'ENABLED') return true;
  if (flag.status === 'DISABLED') return false;
  
  // BETA: Check percentage rollout
  if (flag.status === 'BETA' && flag.betaPercentage !== null) {
    // Deterministic based on tenant ID for consistency
    const hash = tenantId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return (hash % 100) < flag.betaPercentage;
  }
  
  return false;
}

/**
 * Get all feature flags for a tenant.
 */
export function getFeatureFlags(tenantId: string): FeatureFlag[] {
  const config = tenantConfigs.get(tenantId);
  if (!config) return [];
  return config.featureFlags;
}

/**
 * Set feature flag status for a tenant.
 */
export function setFeatureFlag(
  tenantId: string,
  featureKey: string,
  status: FeatureFlagStatus,
  actor: string,
  betaPercentage?: number
): FeatureFlag {
  const config = tenantConfigs.get(tenantId);
  if (!config) throw new Error(`Tenant configuration not found: ${tenantId}`);
  
  const flagIndex = config.featureFlags.findIndex(f => f.key === featureKey);
  if (flagIndex === -1) {
    throw new Error(`Feature flag not found: ${featureKey}`);
  }
  
  const updatedFlag: FeatureFlag = {
    ...config.featureFlags[flagIndex],
    status,
    enabledAt: status === 'ENABLED' ? new Date().toISOString() : config.featureFlags[flagIndex].enabledAt,
    disabledAt: status === 'DISABLED' ? new Date().toISOString() : null,
    betaPercentage: status === 'BETA' ? (betaPercentage ?? 50) : null,
  };
  
  const updatedFlags = [...config.featureFlags];
  updatedFlags[flagIndex] = updatedFlag;
  
  const updatedConfig: TenantConfiguration = {
    ...config,
    featureFlags: updatedFlags,
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };
  
  tenantConfigs.set(tenantId, updatedConfig);
  
  addAuditRecord({
    tenantId,
    action: 'FEATURE_FLAG_CHANGED',
    entityType: 'FEATURE_FLAG',
    entityId: featureKey,
    actor,
    details: { previousStatus: config.featureFlags[flagIndex].status, newStatus: status },
  });
  
  return updatedFlag;
}

/**
 * Assert that a feature is enabled, throw if not.
 */
export function assertFeatureEnabled(tenantId: string, featureKey: string): void {
  if (!isFeatureEnabled(tenantId, featureKey)) {
    throw new Error(`FEATURE_NOT_ENABLED: ${featureKey} is not enabled for tenant ${tenantId}`);
  }
}

// =============================================================================
// USAGE METERING
// =============================================================================

/**
 * Initialize usage meter for a tenant.
 */
function initializeUsageMeter(tenantId: string): UsageMeter {
  const { start, end } = getCurrentPeriodBounds();
  
  const meter: UsageMeter = {
    tenantId,
    periodStart: start,
    periodEnd: end,
    meters: [
      { eventType: 'API_CALL', count: 0, limit: null, percentage: null, lastRecorded: start },
      { eventType: 'DRIVER_CREATED', count: 0, limit: null, percentage: null, lastRecorded: start },
      { eventType: 'PAY_RECORD_PROCESSED', count: 0, limit: null, percentage: null, lastRecorded: start },
      { eventType: 'DOCUMENT_UPLOADED', count: 0, limit: null, percentage: null, lastRecorded: start },
      { eventType: 'REPORT_GENERATED', count: 0, limit: null, percentage: null, lastRecorded: start },
      { eventType: 'NOTIFICATION_SENT', count: 0, limit: null, percentage: null, lastRecorded: start },
      { eventType: 'INTEGRATION_SYNC', count: 0, limit: null, percentage: null, lastRecorded: start },
      { eventType: 'STORAGE_USED_MB', count: 0, limit: null, percentage: null, lastRecorded: start },
      { eventType: 'ACTIVE_USER_SESSION', count: 0, limit: null, percentage: null, lastRecorded: start },
    ],
    lastUpdated: new Date().toISOString(),
  };
  
  usageMeters.set(tenantId, meter);
  return meter;
}

/**
 * Record a meter event.
 */
export function recordMeterEvent(
  tenantId: string,
  eventType: MeterEventType,
  quantity: number = 1,
  metadata: Record<string, unknown> = {}
): MeterEvent {
  const event: MeterEvent = {
    id: generateId('meter'),
    tenantId,
    eventType,
    quantity,
    timestamp: new Date().toISOString(),
    metadata,
  };
  
  meterEvents.push(event);
  
  // Update meter reading
  let meter = usageMeters.get(tenantId);
  if (!meter) {
    meter = initializeUsageMeter(tenantId);
  }
  
  const readingIndex = meter.meters.findIndex(m => m.eventType === eventType);
  if (readingIndex !== -1) {
    const config = tenantConfigs.get(tenantId);
    const limits = config?.limits ?? DEFAULT_LIMITS_BY_TIER['STARTER'];
    
    let limit: number | null = null;
    if (eventType === 'API_CALL') limit = limits.maxApiCallsPerDay;
    if (eventType === 'DRIVER_CREATED') limit = limits.maxDrivers;
    if (eventType === 'STORAGE_USED_MB') limit = limits.maxStorageMb;
    
    const newCount = meter.meters[readingIndex].count + quantity;
    const updatedReading: MeterReading = {
      ...meter.meters[readingIndex],
      count: newCount,
      limit,
      percentage: limit && limit > 0 ? (newCount / limit) * 100 : null,
      lastRecorded: event.timestamp,
    };
    
    const updatedMeters = [...meter.meters];
    updatedMeters[readingIndex] = updatedReading;
    
    const updatedMeter: UsageMeter = {
      ...meter,
      meters: updatedMeters,
      lastUpdated: event.timestamp,
    };
    
    usageMeters.set(tenantId, updatedMeter);
  }
  
  return event;
}

/**
 * Get usage meter for a tenant.
 */
export function getUsageMeter(tenantId: string): UsageMeter | undefined {
  return usageMeters.get(tenantId);
}

/**
 * Get meter events with optional filters.
 */
export function getMeterEvents(filters?: {
  tenantId?: string;
  eventType?: MeterEventType;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): MeterEvent[] {
  let results = [...meterEvents];
  
  if (filters?.tenantId) {
    results = results.filter(e => e.tenantId === filters.tenantId);
  }
  if (filters?.eventType) {
    results = results.filter(e => e.eventType === filters.eventType);
  }
  if (filters?.fromDate) {
    results = results.filter(e => e.timestamp >= filters.fromDate!);
  }
  if (filters?.toDate) {
    results = results.filter(e => e.timestamp <= filters.toDate!);
  }
  
  results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  
  if (filters?.limit) {
    results = results.slice(0, filters.limit);
  }
  
  return results;
}

/**
 * Check if tenant is within usage limits.
 */
export function checkUsageLimits(tenantId: string): {
  withinLimits: boolean;
  violations: { eventType: MeterEventType; current: number; limit: number }[];
  warnings: { eventType: MeterEventType; current: number; limit: number; percentage: number }[];
} {
  const meter = usageMeters.get(tenantId);
  const violations: { eventType: MeterEventType; current: number; limit: number }[] = [];
  const warnings: { eventType: MeterEventType; current: number; limit: number; percentage: number }[] = [];
  
  if (!meter) {
    return { withinLimits: true, violations, warnings };
  }
  
  for (const reading of meter.meters) {
    if (reading.limit !== null && reading.limit > 0) {
      const percentage = (reading.count / reading.limit) * 100;
      
      if (reading.count >= reading.limit) {
        violations.push({
          eventType: reading.eventType,
          current: reading.count,
          limit: reading.limit,
        });
      } else if (percentage >= 80) {
        warnings.push({
          eventType: reading.eventType,
          current: reading.count,
          limit: reading.limit,
          percentage,
        });
      }
    }
  }
  
  return {
    withinLimits: violations.length === 0,
    violations,
    warnings,
  };
}

/**
 * Get usage summary for licensing.
 */
export function getUsageSummary(tenantId: string): {
  tenantId: string;
  tier: TenantTier | null;
  periodStart: string;
  periodEnd: string;
  totalApiCalls: number;
  totalDrivers: number;
  totalDocuments: number;
  totalReports: number;
  storageUsedMb: number;
  activeUsers: number;
  withinLimits: boolean;
} {
  const tenant = tenants.get(tenantId);
  const meter = usageMeters.get(tenantId);
  const { start, end } = getCurrentPeriodBounds();
  
  const getMeterCount = (type: MeterEventType): number => {
    if (!meter) return 0;
    const reading = meter.meters.find(m => m.eventType === type);
    return reading?.count ?? 0;
  };
  
  const limits = checkUsageLimits(tenantId);
  
  return {
    tenantId,
    tier: tenant?.tier ?? null,
    periodStart: start,
    periodEnd: end,
    totalApiCalls: getMeterCount('API_CALL'),
    totalDrivers: getMeterCount('DRIVER_CREATED'),
    totalDocuments: getMeterCount('DOCUMENT_UPLOADED'),
    totalReports: getMeterCount('REPORT_GENERATED'),
    storageUsedMb: getMeterCount('STORAGE_USED_MB'),
    activeUsers: getMeterCount('ACTIVE_USER_SESSION'),
    withinLimits: limits.withinLimits,
  };
}

// =============================================================================
// CORE ENFORCEMENT PROTECTION
// =============================================================================

/**
 * Get core enforcement rules.
 */
export function getCoreEnforcementRules(): CoreEnforcementRule[] {
  return [...CORE_ENFORCEMENT_RULES];
}

/**
 * Check if a core enforcement can be overridden by tenant.
 */
export function canTenantOverride(category: CoreEnforcementCategory): boolean {
  const rule = CORE_ENFORCEMENT_RULES.find(r => r.category === category);
  return rule?.canTenantModify ?? false;
}

/**
 * Attempt to override a core enforcement rule.
 * This will ALWAYS be blocked for protected rules.
 */
export function attemptCoreOverride(
  tenantId: string,
  category: CoreEnforcementCategory,
  attemptedValue: unknown,
  actor: string
): { allowed: boolean; reason: string } {
  const rule = CORE_ENFORCEMENT_RULES.find(r => r.category === category);
  
  if (!rule) {
    return { allowed: false, reason: `Unknown enforcement category: ${category}` };
  }
  
  const blocked = rule.isProtected || !rule.canTenantModify;
  const reason = blocked
    ? `PROTECTED: ${rule.description} cannot be overridden by tenants`
    : 'Override allowed';
  
  const attempt: TenantOverrideAttempt = {
    id: generateId('override'),
    tenantId,
    category,
    attemptedValue,
    blocked,
    reason,
    timestamp: new Date().toISOString(),
    actor,
  };
  
  overrideAttempts.push(attempt);
  
  addAuditRecord({
    tenantId,
    action: blocked ? 'OVERRIDE_BLOCKED' : 'OVERRIDE_ALLOWED',
    entityType: 'CORE_ENFORCEMENT',
    entityId: category,
    actor,
    details: { attemptedValue, blocked, reason },
  });
  
  return { allowed: !blocked, reason };
}

/**
 * Get override attempts for audit.
 */
export function getOverrideAttempts(filters?: {
  tenantId?: string;
  category?: CoreEnforcementCategory;
  blocked?: boolean;
  limit?: number;
}): TenantOverrideAttempt[] {
  let results = [...overrideAttempts];
  
  if (filters?.tenantId) {
    results = results.filter(a => a.tenantId === filters.tenantId);
  }
  if (filters?.category) {
    results = results.filter(a => a.category === filters.category);
  }
  if (filters?.blocked !== undefined) {
    results = results.filter(a => a.blocked === filters.blocked);
  }
  
  results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  
  if (filters?.limit) {
    results = results.slice(0, filters.limit);
  }
  
  return results;
}

/**
 * Assert that an enforcement rule is protected.
 * Throws if a tenant tries to modify it.
 */
export function assertEnforcementProtected(category: CoreEnforcementCategory): void {
  const rule = CORE_ENFORCEMENT_RULES.find(r => r.category === category);
  if (!rule) {
    throw new Error(`Unknown enforcement category: ${category}`);
  }
  if (!rule.isProtected) {
    throw new Error(`Enforcement ${category} is not protected`);
  }
  // Rule is protected - this is expected
}

// =============================================================================
// TENANT LIMITS
// =============================================================================

/**
 * Get tenant limits.
 */
export function getTenantLimits(tenantId: string): TenantLimits {
  const config = tenantConfigs.get(tenantId);
  if (!config) {
    return { ...DEFAULT_LIMITS_BY_TIER['STARTER'] };
  }
  return config.limits;
}

/**
 * Update tenant limits (platform admin only).
 */
export function updateTenantLimits(
  tenantId: string,
  limits: Partial<TenantLimits>,
  actor: string
): TenantConfiguration {
  const config = tenantConfigs.get(tenantId);
  if (!config) throw new Error(`Tenant configuration not found: ${tenantId}`);
  
  const updated: TenantConfiguration = {
    ...config,
    limits: {
      ...config.limits,
      ...limits,
    },
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };
  
  tenantConfigs.set(tenantId, updated);
  
  addAuditRecord({
    tenantId,
    action: 'LIMITS_UPDATED',
    entityType: 'TENANT_CONFIG',
    entityId: tenantId,
    actor,
    details: { changes: limits },
  });
  
  return updated;
}

// =============================================================================
// AUDIT TRAIL
// =============================================================================

/**
 * Get audit records.
 */
export function getAuditRecords(filters?: {
  tenantId?: string;
  action?: string;
  entityType?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): PlatformAuditRecord[] {
  let results = [...auditRecords];
  
  if (filters?.tenantId) {
    results = results.filter(r => r.tenantId === filters.tenantId);
  }
  if (filters?.action) {
    results = results.filter(r => r.action === filters.action);
  }
  if (filters?.entityType) {
    results = results.filter(r => r.entityType === filters.entityType);
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
export function clearPlatformData(): void {
  tenants.clear();
  tenantConfigs.clear();
  usageMeters.clear();
  meterEvents.length = 0;
  overrideAttempts.length = 0;
  auditRecords.length = 0;
  currentTenantId = null;
}
