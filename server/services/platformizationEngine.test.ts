/**
 * White-Labeling & Platformization Engine Tests
 * 
 * Tests for:
 * - Tenant/instance isolation model
 * - Feature flag framework by tenant
 * - Light branding configuration
 * - Usage metering for licensing
 * - Core enforcement protection from tenant override
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Types
  type TenantTier,
  type TenantStatus,
  type FeatureFlagStatus,
  type MeterEventType,
  type CoreEnforcementCategory,
  
  // Tenant context
  setCurrentTenant,
  getCurrentTenantId,
  withTenantContext,
  assertTenantContext,
  validateTenantIsolation,
  
  // Tenant management
  createTenant,
  getTenant,
  getTenantBySlug,
  listTenants,
  activateTenant,
  suspendTenant,
  updateTenantTier,
  
  // Configuration
  getTenantConfiguration,
  updateBranding,
  getBranding,
  
  // Feature flags
  isFeatureEnabled,
  getFeatureFlags,
  setFeatureFlag,
  assertFeatureEnabled,
  
  // Usage metering
  recordMeterEvent,
  getUsageMeter,
  getMeterEvents,
  checkUsageLimits,
  getUsageSummary,
  
  // Core enforcement
  getCoreEnforcementRules,
  canTenantOverride,
  attemptCoreOverride,
  getOverrideAttempts,
  assertEnforcementProtected,
  
  // Tenant limits
  getTenantLimits,
  updateTenantLimits,
  
  // Audit
  getAuditRecords,
  
  // Test utilities
  clearPlatformData,
} from './platformizationEngine';

// =============================================================================
// TESTS
// =============================================================================

describe('White-Labeling & Platformization Engine', () => {
  beforeEach(() => {
    clearPlatformData();
  });
  
  // ===========================================================================
  // TENANT CONTEXT
  // ===========================================================================
  
  describe('Tenant Context', () => {
    it('should set and get current tenant', () => {
      setCurrentTenant('TENANT_001');
      expect(getCurrentTenantId()).toBe('TENANT_001');
    });
    
    it('should clear tenant context', () => {
      setCurrentTenant('TENANT_001');
      setCurrentTenant(null);
      expect(getCurrentTenantId()).toBeNull();
    });
    
    it('should execute function within tenant context', () => {
      setCurrentTenant('TENANT_001');
      
      const result = withTenantContext('TENANT_002', () => {
        return getCurrentTenantId();
      });
      
      expect(result).toBe('TENANT_002');
      expect(getCurrentTenantId()).toBe('TENANT_001'); // Restored
    });
    
    it('should throw when asserting context without tenant', () => {
      expect(() => assertTenantContext()).toThrow('TENANT_CONTEXT_REQUIRED');
    });
    
    it('should validate tenant isolation', () => {
      setCurrentTenant('TENANT_001');
      
      expect(() => validateTenantIsolation('TENANT_001')).not.toThrow();
      expect(() => validateTenantIsolation('TENANT_002')).toThrow('TENANT_ISOLATION_VIOLATION');
    });
  });
  
  // ===========================================================================
  // TENANT MANAGEMENT
  // ===========================================================================
  
  describe('Tenant Management', () => {
    it('should create a tenant', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'PROFESSIONAL',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      expect(tenant.id).toBeDefined();
      expect(tenant.name).toBe('Acme Corp');
      expect(tenant.status).toBe('PENDING_SETUP');
    });
    
    it('should prevent duplicate slugs', () => {
      createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'PROFESSIONAL',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      expect(() => {
        createTenant({
          name: 'Another Acme',
          slug: 'acme-corp',
          tier: 'STARTER',
          contactEmail: 'other@acme.com',
          contactName: 'Jane Doe',
        }, 'admin');
      }).toThrow("already exists");
    });
    
    it('should get tenant by ID', () => {
      const created = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'PROFESSIONAL',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      const tenant = getTenant(created.id);
      
      expect(tenant).toBeDefined();
      expect(tenant?.name).toBe('Acme Corp');
    });
    
    it('should get tenant by slug', () => {
      createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'PROFESSIONAL',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      const tenant = getTenantBySlug('acme-corp');
      
      expect(tenant).toBeDefined();
      expect(tenant?.name).toBe('Acme Corp');
    });
    
    it('should list tenants with filters', () => {
      createTenant({
        name: 'Tenant A',
        slug: 'tenant-a',
        tier: 'STARTER',
        contactEmail: 'a@test.com',
        contactName: 'A',
      }, 'admin');
      
      createTenant({
        name: 'Tenant B',
        slug: 'tenant-b',
        tier: 'ENTERPRISE',
        contactEmail: 'b@test.com',
        contactName: 'B',
      }, 'admin');
      
      const allTenants = listTenants();
      const starterTenants = listTenants({ tier: 'STARTER' });
      
      expect(allTenants.length).toBe(2);
      expect(starterTenants.length).toBe(1);
    });
    
    it('should activate a tenant', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'PROFESSIONAL',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      const activated = activateTenant(tenant.id, 'admin');
      
      expect(activated.status).toBe('ACTIVE');
      expect(activated.activatedAt).not.toBeNull();
    });
    
    it('should suspend a tenant', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'PROFESSIONAL',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      const suspended = suspendTenant(tenant.id, 'Payment overdue', 'admin');
      
      expect(suspended.status).toBe('SUSPENDED');
      expect(suspended.suspendedReason).toBe('Payment overdue');
    });
    
    it('should update tenant tier', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'STARTER',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      const updated = updateTenantTier(tenant.id, 'ENTERPRISE', 'admin');
      
      expect(updated.tier).toBe('ENTERPRISE');
      
      // Configuration should be updated with new tier defaults
      const config = getTenantConfiguration(tenant.id);
      expect(config?.limits.maxDrivers).toBe(-1); // Enterprise = unlimited
    });
  });
  
  // ===========================================================================
  // TENANT CONFIGURATION
  // ===========================================================================
  
  describe('Tenant Configuration', () => {
    it('should initialize configuration with defaults', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'PROFESSIONAL',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      const config = getTenantConfiguration(tenant.id);
      
      expect(config).toBeDefined();
      expect(config?.featureFlags.length).toBeGreaterThan(0);
      expect(config?.limits.maxDrivers).toBe(500); // Professional tier
    });
    
    it('should get default branding', () => {
      const branding = getBranding('non-existent');
      
      expect(branding.primaryColor).toBe('#FF6B35');
      expect(branding.companyName).toBe('NexCopy');
    });
    
    it('should require CUSTOM_BRANDING feature to update branding', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'STARTER', // No CUSTOM_BRANDING
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      expect(() => {
        updateBranding(tenant.id, { primaryColor: '#123456' }, 'admin');
      }).toThrow('FEATURE_NOT_ENABLED');
    });
    
    it('should update branding for enterprise tenants', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'ENTERPRISE',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      const config = updateBranding(tenant.id, {
        primaryColor: '#123456',
        companyName: 'Acme Corp',
        productName: 'Acme Driver Hub',
      }, 'admin');
      
      expect(config.branding.primaryColor).toBe('#123456');
      expect(config.branding.companyName).toBe('Acme Corp');
    });
  });
  
  // ===========================================================================
  // FEATURE FLAGS
  // ===========================================================================
  
  describe('Feature Flags', () => {
    it('should check if feature is enabled', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'PROFESSIONAL',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      // Professional tier has PAYROLL_PROCESSING
      expect(isFeatureEnabled(tenant.id, 'PAYROLL_PROCESSING')).toBe(true);
      
      // Professional tier does NOT have AI_RECOMMENDATIONS
      expect(isFeatureEnabled(tenant.id, 'AI_RECOMMENDATIONS')).toBe(false);
    });
    
    it('should get all feature flags', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'STARTER',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      const flags = getFeatureFlags(tenant.id);
      
      expect(flags.length).toBeGreaterThan(0);
      expect(flags.find(f => f.key === 'DRIVER_PORTAL')?.status).toBe('ENABLED');
    });
    
    it('should set feature flag status', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'STARTER',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      const flag = setFeatureFlag(tenant.id, 'ADVANCED_REPORTING', 'ENABLED', 'admin');
      
      expect(flag.status).toBe('ENABLED');
      expect(isFeatureEnabled(tenant.id, 'ADVANCED_REPORTING')).toBe(true);
    });
    
    it('should support beta flags with percentage', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'STARTER',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      const flag = setFeatureFlag(tenant.id, 'ADVANCED_REPORTING', 'BETA', 'admin', 100);
      
      expect(flag.status).toBe('BETA');
      expect(flag.betaPercentage).toBe(100);
    });
    
    it('should throw when asserting disabled feature', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'STARTER',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      expect(() => {
        assertFeatureEnabled(tenant.id, 'AI_RECOMMENDATIONS');
      }).toThrow('FEATURE_NOT_ENABLED');
    });
    
    it('should enable all features for enterprise tier', () => {
      const tenant = createTenant({
        name: 'Enterprise Corp',
        slug: 'enterprise-corp',
        tier: 'ENTERPRISE',
        contactEmail: 'admin@enterprise.com',
        contactName: 'Boss',
      }, 'admin');
      
      expect(isFeatureEnabled(tenant.id, 'DRIVER_PORTAL')).toBe(true);
      expect(isFeatureEnabled(tenant.id, 'AI_RECOMMENDATIONS')).toBe(true);
      expect(isFeatureEnabled(tenant.id, 'CAPITAL_REPORTING')).toBe(true);
      expect(isFeatureEnabled(tenant.id, 'CUSTOM_BRANDING')).toBe(true);
    });
  });
  
  // ===========================================================================
  // USAGE METERING
  // ===========================================================================
  
  describe('Usage Metering', () => {
    it('should record meter events', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'STARTER',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      const event = recordMeterEvent(tenant.id, 'API_CALL', 1);
      
      expect(event.tenantId).toBe(tenant.id);
      expect(event.eventType).toBe('API_CALL');
      expect(event.quantity).toBe(1);
    });
    
    it('should accumulate meter readings', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'STARTER',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      recordMeterEvent(tenant.id, 'API_CALL', 5);
      recordMeterEvent(tenant.id, 'API_CALL', 10);
      
      const meter = getUsageMeter(tenant.id);
      const apiReading = meter?.meters.find(m => m.eventType === 'API_CALL');
      
      expect(apiReading?.count).toBe(15);
    });
    
    it('should get meter events with filters', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'STARTER',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      recordMeterEvent(tenant.id, 'API_CALL', 1);
      recordMeterEvent(tenant.id, 'DRIVER_CREATED', 1);
      recordMeterEvent(tenant.id, 'API_CALL', 1);
      
      const apiEvents = getMeterEvents({ eventType: 'API_CALL' });
      
      expect(apiEvents.length).toBe(2);
    });
    
    it('should check usage limits', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'STARTER',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      // Starter tier has maxDrivers: 50
      for (let i = 0; i < 55; i++) {
        recordMeterEvent(tenant.id, 'DRIVER_CREATED', 1);
      }
      
      const limits = checkUsageLimits(tenant.id);
      
      expect(limits.withinLimits).toBe(false);
      expect(limits.violations.some(v => v.eventType === 'DRIVER_CREATED')).toBe(true);
    });
    
    it('should warn when approaching limits', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'STARTER',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      // Starter tier has maxDrivers: 50, record 45 (90%)
      recordMeterEvent(tenant.id, 'DRIVER_CREATED', 45);
      
      const limits = checkUsageLimits(tenant.id);
      
      expect(limits.withinLimits).toBe(true);
      expect(limits.warnings.some(w => w.eventType === 'DRIVER_CREATED')).toBe(true);
    });
    
    it('should get usage summary', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'PROFESSIONAL',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      recordMeterEvent(tenant.id, 'API_CALL', 100);
      recordMeterEvent(tenant.id, 'DRIVER_CREATED', 10);
      recordMeterEvent(tenant.id, 'DOCUMENT_UPLOADED', 25);
      
      const summary = getUsageSummary(tenant.id);
      
      expect(summary.tenantId).toBe(tenant.id);
      expect(summary.tier).toBe('PROFESSIONAL');
      expect(summary.totalApiCalls).toBe(100);
      expect(summary.totalDrivers).toBe(10);
      expect(summary.totalDocuments).toBe(25);
    });
  });
  
  // ===========================================================================
  // CORE ENFORCEMENT PROTECTION
  // ===========================================================================
  
  describe('Core Enforcement Protection', () => {
    it('should list all core enforcement rules', () => {
      const rules = getCoreEnforcementRules();
      
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.find(r => r.category === 'RATE_FLOOR')).toBeDefined();
      expect(rules.find(r => r.category === 'HIRING_FREEZE')).toBeDefined();
    });
    
    it('should mark all core rules as protected', () => {
      const rules = getCoreEnforcementRules();
      
      for (const rule of rules) {
        expect(rule.isProtected).toBe(true);
        expect(rule.canTenantModify).toBe(false);
      }
    });
    
    it('should not allow tenant override of any core rule', () => {
      const categories: CoreEnforcementCategory[] = [
        'RATE_FLOOR',
        'HIRING_FREEZE',
        'SAFETY_THRESHOLD',
        'PROFITABILITY_MINIMUM',
        'CAPACITY_LIMIT',
        'VOLUME_LIMIT',
        'UTILIZATION_BOUNDS',
      ];
      
      for (const category of categories) {
        expect(canTenantOverride(category)).toBe(false);
      }
    });
    
    it('should block override attempts', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'ENTERPRISE',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      const result = attemptCoreOverride(
        tenant.id,
        'RATE_FLOOR',
        { minRate: 0.50 },
        'tenant_admin'
      );
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('PROTECTED');
    });
    
    it('should record all override attempts', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'ENTERPRISE',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      attemptCoreOverride(tenant.id, 'RATE_FLOOR', { minRate: 0.50 }, 'admin');
      attemptCoreOverride(tenant.id, 'HIRING_FREEZE', false, 'admin');
      
      const attempts = getOverrideAttempts({ tenantId: tenant.id });
      
      expect(attempts.length).toBe(2);
      expect(attempts.every(a => a.blocked)).toBe(true);
    });
    
    it('should filter override attempts', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'ENTERPRISE',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      attemptCoreOverride(tenant.id, 'RATE_FLOOR', { minRate: 0.50 }, 'admin');
      attemptCoreOverride(tenant.id, 'HIRING_FREEZE', false, 'admin');
      
      const rateFloorAttempts = getOverrideAttempts({ category: 'RATE_FLOOR' });
      
      expect(rateFloorAttempts.length).toBe(1);
    });
    
    it('should assert enforcement is protected', () => {
      expect(() => assertEnforcementProtected('RATE_FLOOR')).not.toThrow();
      expect(() => assertEnforcementProtected('HIRING_FREEZE')).not.toThrow();
    });
  });
  
  // ===========================================================================
  // TENANT LIMITS
  // ===========================================================================
  
  describe('Tenant Limits', () => {
    it('should get tenant limits', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'PROFESSIONAL',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      const limits = getTenantLimits(tenant.id);
      
      expect(limits.maxDrivers).toBe(500);
      expect(limits.maxUsers).toBe(25);
    });
    
    it('should return default limits for unknown tenant', () => {
      const limits = getTenantLimits('unknown');
      
      expect(limits.maxDrivers).toBe(50); // Starter defaults
    });
    
    it('should update tenant limits', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'PROFESSIONAL',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      const config = updateTenantLimits(tenant.id, { maxDrivers: 1000 }, 'admin');
      
      expect(config.limits.maxDrivers).toBe(1000);
    });
    
    it('should have unlimited limits for enterprise', () => {
      const tenant = createTenant({
        name: 'Enterprise Corp',
        slug: 'enterprise-corp',
        tier: 'ENTERPRISE',
        contactEmail: 'admin@enterprise.com',
        contactName: 'Boss',
      }, 'admin');
      
      const limits = getTenantLimits(tenant.id);
      
      expect(limits.maxDrivers).toBe(-1); // Unlimited
      expect(limits.maxUsers).toBe(-1);
      expect(limits.maxApiCallsPerDay).toBe(-1);
    });
  });
  
  // ===========================================================================
  // AUDIT TRAIL
  // ===========================================================================
  
  describe('Audit Trail', () => {
    it('should record tenant creation', () => {
      createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'STARTER',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      const records = getAuditRecords({ action: 'TENANT_CREATED' });
      
      expect(records.length).toBe(1);
    });
    
    it('should record feature flag changes', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'STARTER',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      setFeatureFlag(tenant.id, 'ADVANCED_REPORTING', 'ENABLED', 'admin');
      
      const records = getAuditRecords({ action: 'FEATURE_FLAG_CHANGED' });
      
      expect(records.length).toBe(1);
    });
    
    it('should record override attempts', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'ENTERPRISE',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      attemptCoreOverride(tenant.id, 'RATE_FLOOR', { minRate: 0.50 }, 'admin');
      
      const records = getAuditRecords({ action: 'OVERRIDE_BLOCKED' });
      
      expect(records.length).toBe(1);
    });
    
    it('should filter audit records by tenant', () => {
      const tenant1 = createTenant({
        name: 'Tenant 1',
        slug: 'tenant-1',
        tier: 'STARTER',
        contactEmail: 'a@test.com',
        contactName: 'A',
      }, 'admin');
      
      createTenant({
        name: 'Tenant 2',
        slug: 'tenant-2',
        tier: 'STARTER',
        contactEmail: 'b@test.com',
        contactName: 'B',
      }, 'admin');
      
      recordMeterEvent(tenant1.id, 'API_CALL', 1);
      
      const tenant1Records = getAuditRecords({ tenantId: tenant1.id });
      
      // Should have TENANT_CREATED record
      expect(tenant1Records.length).toBeGreaterThan(0);
      expect(tenant1Records.every(r => r.tenantId === tenant1.id)).toBe(true);
    });
  });
  
  // ===========================================================================
  // NO TENANT-SPECIFIC FORKS
  // ===========================================================================
  
  describe('No Tenant-Specific Features', () => {
    it('should not expose tenant fork functions', () => {
      const exportedFunctions = [
        'createTenant',
        'getTenant',
        'getTenantBySlug',
        'listTenants',
        'activateTenant',
        'suspendTenant',
        'updateTenantTier',
        'getTenantConfiguration',
        'updateBranding',
        'getBranding',
        'isFeatureEnabled',
        'getFeatureFlags',
        'setFeatureFlag',
        'assertFeatureEnabled',
        'recordMeterEvent',
        'getUsageMeter',
        'getMeterEvents',
        'checkUsageLimits',
        'getUsageSummary',
        'getCoreEnforcementRules',
        'canTenantOverride',
        'attemptCoreOverride',
        'getOverrideAttempts',
        'assertEnforcementProtected',
        'getTenantLimits',
        'updateTenantLimits',
        'getAuditRecords',
        'clearPlatformData',
      ];
      
      const forbiddenPatterns = [
        'customFeature',
        'tenantFork',
        'billing',
        'payment',
        'invoice',
        'subscription',
      ];
      
      for (const func of exportedFunctions) {
        for (const pattern of forbiddenPatterns) {
          expect(func.toLowerCase()).not.toContain(pattern.toLowerCase());
        }
      }
    });
    
    it('should use same feature flag set for all tenants', () => {
      const tenant1 = createTenant({
        name: 'Tenant 1',
        slug: 'tenant-1',
        tier: 'ENTERPRISE',
        contactEmail: 'a@test.com',
        contactName: 'A',
      }, 'admin');
      
      const tenant2 = createTenant({
        name: 'Tenant 2',
        slug: 'tenant-2',
        tier: 'ENTERPRISE',
        contactEmail: 'b@test.com',
        contactName: 'B',
      }, 'admin');
      
      const flags1 = getFeatureFlags(tenant1.id).map(f => f.key).sort();
      const flags2 = getFeatureFlags(tenant2.id).map(f => f.key).sort();
      
      expect(flags1).toEqual(flags2);
    });
    
    it('should not allow custom enforcement rules per tenant', () => {
      const tenant = createTenant({
        name: 'Acme Corp',
        slug: 'acme-corp',
        tier: 'ENTERPRISE',
        contactEmail: 'admin@acme.com',
        contactName: 'John Doe',
      }, 'admin');
      
      // All categories should be protected regardless of tenant
      const categories: CoreEnforcementCategory[] = [
        'RATE_FLOOR',
        'HIRING_FREEZE',
        'SAFETY_THRESHOLD',
        'PROFITABILITY_MINIMUM',
        'CAPACITY_LIMIT',
        'VOLUME_LIMIT',
        'UTILIZATION_BOUNDS',
      ];
      
      for (const category of categories) {
        const result = attemptCoreOverride(tenant.id, category, 'bypass_value', 'admin');
        expect(result.allowed).toBe(false);
      }
    });
  });
  
  // ===========================================================================
  // TIER-BASED FEATURES
  // ===========================================================================
  
  describe('Tier-Based Features', () => {
    it('should enable only basic features for STARTER tier', () => {
      const tenant = createTenant({
        name: 'Starter Corp',
        slug: 'starter-corp',
        tier: 'STARTER',
        contactEmail: 'admin@starter.com',
        contactName: 'John',
      }, 'admin');
      
      expect(isFeatureEnabled(tenant.id, 'DRIVER_PORTAL')).toBe(true);
      expect(isFeatureEnabled(tenant.id, 'BASIC_REPORTING')).toBe(true);
      expect(isFeatureEnabled(tenant.id, 'PAYROLL_PROCESSING')).toBe(false);
      expect(isFeatureEnabled(tenant.id, 'AI_RECOMMENDATIONS')).toBe(false);
    });
    
    it('should enable more features for PROFESSIONAL tier', () => {
      const tenant = createTenant({
        name: 'Pro Corp',
        slug: 'pro-corp',
        tier: 'PROFESSIONAL',
        contactEmail: 'admin@pro.com',
        contactName: 'John',
      }, 'admin');
      
      expect(isFeatureEnabled(tenant.id, 'DRIVER_PORTAL')).toBe(true);
      expect(isFeatureEnabled(tenant.id, 'PAYROLL_PROCESSING')).toBe(true);
      expect(isFeatureEnabled(tenant.id, 'EXPENSE_REIMBURSEMENT')).toBe(true);
      expect(isFeatureEnabled(tenant.id, 'AI_RECOMMENDATIONS')).toBe(false);
    });
    
    it('should enable all features for ENTERPRISE tier', () => {
      const tenant = createTenant({
        name: 'Enterprise Corp',
        slug: 'enterprise-corp',
        tier: 'ENTERPRISE',
        contactEmail: 'admin@enterprise.com',
        contactName: 'John',
      }, 'admin');
      
      expect(isFeatureEnabled(tenant.id, 'DRIVER_PORTAL')).toBe(true);
      expect(isFeatureEnabled(tenant.id, 'AI_RECOMMENDATIONS')).toBe(true);
      expect(isFeatureEnabled(tenant.id, 'CAPITAL_REPORTING')).toBe(true);
      expect(isFeatureEnabled(tenant.id, 'CUSTOM_BRANDING')).toBe(true);
    });
  });
});
