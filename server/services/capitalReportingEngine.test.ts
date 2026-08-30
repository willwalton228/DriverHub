import { describe, it, expect, beforeEach } from 'vitest';
import {
  initializeDefaultCovenants,
  upsertCovenant,
  getCovenant,
  getAllCovenants,
  evaluateCovenant,
  evaluateAllCovenants,
  evaluateRYG,
  evaluateAllRYG,
  getRYGSummary,
  getAllFlags,
  resolveFlag,
  generateLenderPack,
  generateCapitalPack,
  generateInsurancePack,
  generateDiligencePack,
  generateCarveOut,
  createDataRoomToken,
  validateDataRoomToken,
  accessPackWithToken,
  revokeDataRoomToken,
  getDataRoomToken,
  listDataRoomTokens,
  createDistribution,
  acknowledgeDistribution,
  getDistribution,
  listDistributions,
  getReportPack,
  listReportPacks,
  verifyPackIntegrity,
  getDataContract,
  listDataContracts,
  validateAgainstContract,
  getAuditRecords,
  clearCapitalReportingData,
} from './capitalReportingEngine';

// ============================================
// TEST SETUP
// ============================================

function createTestMetrics(): Record<string, number> {
  return {
    REVENUE: 1000000,
    REVENUE_GROWTH: 0.15,
    GROSS_MARGIN: 0.35,
    OPERATING_EXPENSES: 250000,
    EBITDA: 150000,
    EBITDA_MARGIN: 0.15,
    CASH_POSITION: 500000,
    ACCOUNTS_RECEIVABLE: 200000,
    ACCOUNTS_PAYABLE: 150000,
    DAYS_RECEIVABLE: 35,
    DAYS_PAYABLE: 30,
    TOTAL_MOVES: 5000,
    MOVE_GROWTH: 0.12,
    ACTIVE_DRIVERS: 100,
    DRIVER_TURNOVER: 0.18,
    REVENUE_PER_MOVE: 200,
    UTILIZATION: 0.82,
    ON_TIME_RATE: 0.94,
    CUSTOMER_RETENTION: 0.92,
    MARKET_COUNT: 5,
    CAPITAL_DEPLOYED: 2000000,
    CAPITAL_EFFICIENCY: 0.50,
    RETURN_ON_CAPITAL: 0.075,
    WORKING_CAPITAL_DAYS: 25,
    DEBT_TO_EQUITY: 1.5,
    INTEREST_COVERAGE: 3.5,
    QUICK_RATIO: 1.2,
    CURRENT_RATIO: 1.5,
    INCIDENT_RATE: 0.03,
    TOTAL_INCIDENTS: 15,
    CLAIMS_FREQUENCY: 0.02,
    CLAIMS_SEVERITY: 5000,
    SAFETY_SCORE: 88,
    LOSS_RATIO: 0.55,
    TRAINING_COMPLETION: 0.92,
    DOCUMENT_COMPLIANCE: 0.96,
    TOP_CUSTOMER_REVENUE: 0.12,
    TOP_MARKET_REVENUE: 0.28,
    AUDIT_FINDINGS: 1,
    POLICY_CURRENCY: 0.95,
  };
}

// ============================================
// COVENANT TESTS
// ============================================

describe('Covenant Management', () => {
  beforeEach(() => {
    clearCapitalReportingData();
  });

  describe('initializeDefaultCovenants', () => {
    it('should create default covenants', () => {
      initializeDefaultCovenants();
      const covenants = getAllCovenants();
      expect(covenants.length).toBeGreaterThan(0);
    });

    it('should create covenants with required properties', () => {
      initializeDefaultCovenants();
      const covenants = getAllCovenants();
      
      for (const covenant of covenants) {
        expect(covenant.id).toBeTruthy();
        expect(covenant.name).toBeTruthy();
        expect(covenant.metricType).toBeTruthy();
        expect(covenant.operator).toBeTruthy();
        expect(covenant.threshold).toBeDefined();
      }
    });
  });

  describe('upsertCovenant', () => {
    it('should create a new covenant', () => {
      const covenant = upsertCovenant({
        name: 'Test Covenant',
        description: 'Test description',
        metricType: 'TEST_METRIC',
        operator: 'GTE',
        threshold: 100,
        frequency: 'MONTHLY',
        gracePeriodDays: 15,
        severity: 'MINOR',
      });
      
      expect(covenant.id).toBeTruthy();
      expect(covenant.name).toBe('Test Covenant');
    });

    it('should update existing covenant', () => {
      const covenant1 = upsertCovenant({
        name: 'Original',
        description: 'Test',
        metricType: 'TEST',
        operator: 'GTE',
        threshold: 100,
        frequency: 'MONTHLY',
        gracePeriodDays: 15,
        severity: 'MINOR',
      });
      
      const covenant2 = upsertCovenant({
        id: covenant1.id,
        name: 'Updated',
        description: 'Test',
        metricType: 'TEST',
        operator: 'GTE',
        threshold: 200,
        frequency: 'MONTHLY',
        gracePeriodDays: 15,
        severity: 'MINOR',
      });
      
      expect(covenant2.id).toBe(covenant1.id);
      expect(covenant2.name).toBe('Updated');
      expect(covenant2.threshold).toBe(200);
    });
  });

  describe('evaluateCovenant', () => {
    it('should evaluate GTE compliance correctly', () => {
      const covenant = upsertCovenant({
        name: 'Min EBITDA',
        description: 'Test',
        metricType: 'EBITDA',
        operator: 'GTE',
        threshold: 100000,
        frequency: 'QUARTERLY',
        gracePeriodDays: 30,
        severity: 'MATERIAL',
      });
      
      const result = evaluateCovenant(covenant.id, 150000, '2024-03-31');
      expect(result?.compliant).toBe(true);
      
      const result2 = evaluateCovenant(covenant.id, 80000, '2024-03-31');
      expect(result2?.compliant).toBe(false);
    });

    it('should evaluate LTE compliance correctly', () => {
      const covenant = upsertCovenant({
        name: 'Max Ratio',
        description: 'Test',
        metricType: 'DEBT_TO_EBITDA',
        operator: 'LTE',
        threshold: 3.0,
        frequency: 'QUARTERLY',
        gracePeriodDays: 30,
        severity: 'CRITICAL',
      });
      
      const result = evaluateCovenant(covenant.id, 2.5, '2024-03-31');
      expect(result?.compliant).toBe(true);
      
      const result2 = evaluateCovenant(covenant.id, 3.5, '2024-03-31');
      expect(result2?.compliant).toBe(false);
    });

    it('should calculate margin percent', () => {
      const covenant = upsertCovenant({
        name: 'Test',
        description: 'Test',
        metricType: 'TEST',
        operator: 'GTE',
        threshold: 100,
        frequency: 'MONTHLY',
        gracePeriodDays: 15,
        severity: 'MINOR',
      });
      
      const result = evaluateCovenant(covenant.id, 120, '2024-03-31');
      expect(result?.marginPercent).toBe(20);
    });

    it('should detect trend', () => {
      const covenant = upsertCovenant({
        name: 'Test',
        description: 'Test',
        metricType: 'TEST',
        operator: 'GTE',
        threshold: 100,
        frequency: 'MONTHLY',
        gracePeriodDays: 15,
        severity: 'MINOR',
      });
      
      const result = evaluateCovenant(covenant.id, 120, '2024-03-31', 100);
      expect(result?.trend).toBe('IMPROVING');
      
      const result2 = evaluateCovenant(covenant.id, 80, '2024-03-31', 100);
      expect(result2?.trend).toBe('DECLINING');
    });
  });

  describe('evaluateAllCovenants', () => {
    it('should evaluate all applicable covenants', () => {
      initializeDefaultCovenants();
      const metrics = createTestMetrics();
      
      const results = evaluateAllCovenants(metrics, '2024-03-31');
      expect(results.length).toBeGreaterThan(0);
    });
  });
});

// ============================================
// RYG FLAGGING TESTS
// ============================================

describe('RYG Flagging', () => {
  beforeEach(() => {
    clearCapitalReportingData();
  });

  describe('evaluateRYG', () => {
    it('should flag green for good metrics', () => {
      const flag = evaluateRYG('UTILIZATION', 0.85);
      expect(flag?.status).toBe('GREEN');
    });

    it('should flag yellow for concerning metrics', () => {
      const flag = evaluateRYG('UTILIZATION', 0.70);
      expect(flag?.status).toBe('YELLOW');
    });

    it('should flag red for critical metrics', () => {
      const flag = evaluateRYG('UTILIZATION', 0.50);
      expect(flag?.status).toBe('RED');
    });

    it('should return null for unknown metrics', () => {
      const flag = evaluateRYG('UNKNOWN_METRIC', 100);
      expect(flag).toBeNull();
    });
  });

  describe('evaluateAllRYG', () => {
    it('should evaluate all metrics', () => {
      const metrics = createTestMetrics();
      const flags = evaluateAllRYG(metrics);
      expect(flags.length).toBeGreaterThan(0);
    });

    it('should categorize flags correctly', () => {
      const metrics = createTestMetrics();
      const flags = evaluateAllRYG(metrics);
      
      const categories = new Set(flags.map(f => f.category));
      expect(categories.size).toBeGreaterThan(1);
    });
  });

  describe('getRYGSummary', () => {
    it('should summarize flags', () => {
      const metrics = createTestMetrics();
      const flags = evaluateAllRYG(metrics);
      const summary = getRYGSummary(flags);
      
      expect(summary.overall).toBeTruthy();
      expect(summary.redFlags).toBeDefined();
      expect(summary.yellowFlags).toBeDefined();
      expect(summary.greenFlags).toBeDefined();
    });

    it('should group by category', () => {
      const metrics = createTestMetrics();
      const flags = evaluateAllRYG(metrics);
      const summary = getRYGSummary(flags);
      
      expect(summary.byCategory.length).toBeGreaterThan(0);
    });
  });

  describe('resolveFlag', () => {
    it('should resolve a flag', () => {
      const metrics = { UTILIZATION: 0.50 };
      const flags = evaluateAllRYG(metrics);
      const redFlag = flags.find(f => f.status === 'RED');
      
      if (redFlag) {
        const result = resolveFlag(redFlag.id, 'admin');
        expect(result).toBe(true);
        
        const allFlags = getAllFlags();
        expect(allFlags.find(f => f.id === redFlag.id)).toBeUndefined();
      }
    });
  });
});

// ============================================
// REPORT PACK GENERATION TESTS
// ============================================

describe('Report Pack Generation', () => {
  beforeEach(() => {
    clearCapitalReportingData();
    initializeDefaultCovenants();
  });

  describe('generateLenderPack', () => {
    it('should generate lender quarterly pack', () => {
      const metrics = createTestMetrics();
      const pack = generateLenderPack('2024-01-01', '2024-03-31', metrics);
      
      expect(pack.id).toBeTruthy();
      expect(pack.packType).toBe('LENDER_QUARTERLY');
      expect(pack.contentHash).toBeTruthy();
    });

    it('should include financial summary', () => {
      const metrics = createTestMetrics();
      const pack = generateLenderPack('2024-01-01', '2024-03-31', metrics);
      
      expect(pack.financialSummary.revenue).toBe(metrics.REVENUE);
      expect(pack.financialSummary.ebitda).toBe(metrics.EBITDA);
    });

    it('should include covenant compliance', () => {
      const metrics = createTestMetrics();
      const pack = generateLenderPack('2024-01-01', '2024-03-31', metrics);
      
      expect(pack.covenantCompliance.length).toBeGreaterThan(0);
    });

    it('should include risk flags', () => {
      const metrics = createTestMetrics();
      metrics.UTILIZATION = 0.50; // Force a red flag
      const pack = generateLenderPack('2024-01-01', '2024-03-31', metrics);
      
      expect(pack.riskFlags.length).toBeGreaterThan(0);
    });
  });

  describe('generateCapitalPack', () => {
    it('should generate capital summary pack', () => {
      const metrics = createTestMetrics();
      const pack = generateCapitalPack('2024-01-01', '2024-03-31', metrics);
      
      expect(pack.id).toBeTruthy();
      expect(pack.packType).toBe('CAPITAL_SUMMARY');
      expect(pack.capitalMetrics).toBeDefined();
      expect(pack.safetyOverview).toBeDefined();
      expect(pack.governanceStatus).toBeDefined();
    });
  });

  describe('generateInsurancePack', () => {
    it('should generate insurance renewal pack', () => {
      const metrics = createTestMetrics();
      const pack = generateInsurancePack(
        '2024-01-01',
        '2024-03-31',
        { totalClaims: 10, totalClaimsAmount: 50000 },
        { activeRestrictedDrivers: 5 },
        { totalExposure: 1000000 },
        metrics
      );
      
      expect(pack.id).toBeTruthy();
      expect(pack.packType).toBe('INSURANCE_RENEWAL');
      expect(pack.claimsHistory).toBeDefined();
      expect(pack.enforcementActions).toBeDefined();
      expect(pack.exposureAnalysis).toBeDefined();
      expect(pack.lossRatios).toBeDefined();
    });
  });

  describe('generateDiligencePack', () => {
    it('should generate full diligence pack', () => {
      const metrics = createTestMetrics();
      const pack = generateDiligencePack('2024-01-01', '2024-03-31', metrics, { full: true });
      
      expect(pack.id).toBeTruthy();
      expect(pack.packType).toBe('DILIGENCE_FULL');
      expect(pack.executiveSummary).toBeDefined();
      expect(pack.operationalDiligence).toBeDefined();
      expect(pack.financialDiligence).toBeDefined();
      expect(pack.safetyDiligence).toBeDefined();
      expect(pack.governanceDiligence).toBeDefined();
      expect(pack.rygSummary).toBeDefined();
    });

    it('should generate summary diligence pack', () => {
      const metrics = createTestMetrics();
      const pack = generateDiligencePack('2024-01-01', '2024-03-31', metrics, { full: false });
      
      expect(pack.packType).toBe('DILIGENCE_SUMMARY');
    });

    it('should include material findings for red flags', () => {
      const metrics = createTestMetrics();
      metrics.UTILIZATION = 0.50; // Force a red flag
      const pack = generateDiligencePack('2024-01-01', '2024-03-31', metrics);
      
      expect(pack.materialFindings.length).toBeGreaterThan(0);
    });
  });

  describe('generateCarveOut', () => {
    it('should generate carve-out export', () => {
      const scope = {
        entityType: 'MARKET' as const,
        entityIds: ['denver', 'phoenix'],
        includeHistorical: true,
        historicalPeriods: 12,
        dataCategories: ['financial', 'operational'],
      };
      
      const entities = [
        { entityId: 'denver', entityName: 'Denver Market', entityType: 'MARKET', status: 'ACTIVE', metrics: {}, relationships: [] },
        { entityId: 'phoenix', entityName: 'Phoenix Market', entityType: 'MARKET', status: 'ACTIVE', metrics: {}, relationships: [] },
      ];
      
      const pack = generateCarveOut(
        scope,
        entities,
        { allocatedRevenue: 500000 },
        { totalMoves: 2000 }
      );
      
      expect(pack.id).toBeTruthy();
      expect(pack.packType).toBe('CARVE_OUT');
      expect(pack.entityData.length).toBe(2);
      expect(pack.dataContract).toBeDefined();
    });
  });
});

// ============================================
// DATA ROOM ACCESS TESTS
// ============================================

describe('Data Room Access', () => {
  beforeEach(() => {
    clearCapitalReportingData();
    initializeDefaultCovenants();
  });

  describe('createDataRoomToken', () => {
    it('should create access token', () => {
      const token = createDataRoomToken(
        'LENDER',
        'lender-123',
        'First Bank',
        'admin'
      );
      
      expect(token.id).toBeTruthy();
      expect(token.token).toMatch(/^dr_/);
      expect(token.audience).toBe('LENDER');
      expect(token.isActive).toBe(true);
    });

    it('should set expiration', () => {
      const token = createDataRoomToken(
        'LENDER',
        'lender-123',
        'First Bank',
        'admin',
        { expiresInDays: 7 }
      );
      
      const expiresAt = new Date(token.expiresAt);
      const grantedAt = new Date(token.grantedAt);
      const diff = expiresAt.getTime() - grantedAt.getTime();
      const days = diff / (24 * 60 * 60 * 1000);
      
      expect(days).toBeCloseTo(7, 0);
    });

    it('should set access level', () => {
      const token = createDataRoomToken(
        'DILIGENCE_TEAM',
        'team-123',
        'Due Diligence LLC',
        'admin',
        { accessLevel: 'DOWNLOAD' }
      );
      
      expect(token.accessLevel).toBe('DOWNLOAD');
    });

    it('should set allowed packs', () => {
      const token = createDataRoomToken(
        'CAPITAL_PROVIDER',
        'fund-123',
        'Growth Fund',
        'admin',
        { allowedPacks: ['DILIGENCE_FULL', 'CAPITAL_SUMMARY'] }
      );
      
      expect(token.allowedPacks).toContain('DILIGENCE_FULL');
      expect(token.allowedPacks).toContain('CAPITAL_SUMMARY');
    });
  });

  describe('validateDataRoomToken', () => {
    it('should validate active token', () => {
      const token = createDataRoomToken('LENDER', 'lender-123', 'Bank', 'admin');
      
      const result = validateDataRoomToken(token.token);
      expect(result.valid).toBe(true);
      expect(result.token?.id).toBe(token.id);
    });

    it('should reject invalid token', () => {
      const result = validateDataRoomToken('invalid-token');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token not found');
    });

    it('should reject revoked token', () => {
      const token = createDataRoomToken('LENDER', 'lender-123', 'Bank', 'admin');
      revokeDataRoomToken(token.id, 'admin');
      
      const result = validateDataRoomToken(token.token);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token has been revoked');
    });

    it('should enforce IP restrictions', () => {
      const token = createDataRoomToken(
        'LENDER',
        'lender-123',
        'Bank',
        'admin',
        { ipRestrictions: ['192.168.1.1'] }
      );
      
      const result = validateDataRoomToken(token.token, '10.0.0.1');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('IP');
    });
  });

  describe('accessPackWithToken', () => {
    it('should allow access to allowed pack', () => {
      const token = createDataRoomToken(
        'LENDER',
        'lender-123',
        'Bank',
        'admin',
        { allowedPacks: ['LENDER_QUARTERLY'] }
      );
      
      const metrics = createTestMetrics();
      const pack = generateLenderPack('2024-01-01', '2024-03-31', metrics);
      
      const result = accessPackWithToken(token.token, pack.id);
      expect(result.success).toBe(true);
      expect(result.pack).toBeDefined();
    });

    it('should deny access to unauthorized pack type', () => {
      const token = createDataRoomToken(
        'LENDER',
        'lender-123',
        'Bank',
        'admin',
        { allowedPacks: ['LENDER_QUARTERLY'] }
      );
      
      const metrics = createTestMetrics();
      const pack = generateDiligencePack('2024-01-01', '2024-03-31', metrics);
      
      const result = accessPackWithToken(token.token, pack.id);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not allowed');
    });

    it('should include watermark when enabled', () => {
      const token = createDataRoomToken(
        'LENDER',
        'lender-123',
        'First Bank',
        'admin',
        { allowedPacks: ['LENDER_QUARTERLY'], watermarkEnabled: true }
      );
      
      const metrics = createTestMetrics();
      const pack = generateLenderPack('2024-01-01', '2024-03-31', metrics);
      
      const result = accessPackWithToken(token.token, pack.id);
      expect(result.watermark).toContain('First Bank');
    });

    it('should increment usage count', () => {
      const token = createDataRoomToken(
        'LENDER',
        'lender-123',
        'Bank',
        'admin',
        { allowedPacks: ['LENDER_QUARTERLY'] }
      );
      
      const metrics = createTestMetrics();
      const pack = generateLenderPack('2024-01-01', '2024-03-31', metrics);
      
      accessPackWithToken(token.token, pack.id);
      accessPackWithToken(token.token, pack.id);
      
      const updated = getDataRoomToken(token.id);
      expect(updated?.usageCount).toBe(2);
    });
  });

  describe('listDataRoomTokens', () => {
    it('should list all tokens', () => {
      createDataRoomToken('LENDER', 'lender-1', 'Bank 1', 'admin');
      createDataRoomToken('LENDER', 'lender-2', 'Bank 2', 'admin');
      
      const tokens = listDataRoomTokens();
      expect(tokens.length).toBe(2);
    });

    it('should filter by audience', () => {
      createDataRoomToken('LENDER', 'lender-1', 'Bank', 'admin');
      createDataRoomToken('INSURANCE_CARRIER', 'insurer-1', 'Insurance Co', 'admin');
      
      const tokens = listDataRoomTokens({ audience: 'LENDER' });
      expect(tokens.length).toBe(1);
      expect(tokens[0].audience).toBe('LENDER');
    });

    it('should filter by active status', () => {
      const token1 = createDataRoomToken('LENDER', 'lender-1', 'Bank 1', 'admin');
      createDataRoomToken('LENDER', 'lender-2', 'Bank 2', 'admin');
      revokeDataRoomToken(token1.id, 'admin');
      
      const activeTokens = listDataRoomTokens({ isActive: true });
      expect(activeTokens.length).toBe(1);
    });
  });
});

// ============================================
// DISTRIBUTION TESTS
// ============================================

describe('Distribution Management', () => {
  beforeEach(() => {
    clearCapitalReportingData();
    initializeDefaultCovenants();
  });

  describe('createDistribution', () => {
    it('should create distribution record', () => {
      const metrics = createTestMetrics();
      const pack = generateLenderPack('2024-01-01', '2024-03-31', metrics);
      
      const distribution = createDistribution(
        pack.id,
        'lender-123',
        'First Bank',
        'LENDER',
        'admin',
        'DATA_ROOM'
      );
      
      expect(distribution?.id).toBeTruthy();
      expect(distribution?.packId).toBe(pack.id);
      expect(distribution?.contentHash).toBe(pack.contentHash);
    });

    it('should return null for non-existent pack', () => {
      const distribution = createDistribution(
        'nonexistent',
        'lender-123',
        'Bank',
        'LENDER',
        'admin',
        'DATA_ROOM'
      );
      
      expect(distribution).toBeNull();
    });
  });

  describe('acknowledgeDistribution', () => {
    it('should acknowledge distribution', () => {
      const metrics = createTestMetrics();
      const pack = generateLenderPack('2024-01-01', '2024-03-31', metrics);
      const distribution = createDistribution(pack.id, 'lender-123', 'Bank', 'LENDER', 'admin', 'DATA_ROOM');
      
      const result = acknowledgeDistribution(distribution!.id);
      expect(result).toBe(true);
      
      const updated = getDistribution(distribution!.id);
      expect(updated?.acknowledged).toBe(true);
      expect(updated?.acknowledgedAt).toBeTruthy();
    });
  });

  describe('listDistributions', () => {
    it('should list distributions', () => {
      const metrics = createTestMetrics();
      const pack = generateLenderPack('2024-01-01', '2024-03-31', metrics);
      
      createDistribution(pack.id, 'lender-1', 'Bank 1', 'LENDER', 'admin', 'DATA_ROOM');
      createDistribution(pack.id, 'lender-2', 'Bank 2', 'LENDER', 'admin', 'SECURE_DOWNLOAD');
      
      const distributions = listDistributions();
      expect(distributions.length).toBe(2);
    });

    it('should filter by pack', () => {
      const metrics = createTestMetrics();
      const pack1 = generateLenderPack('2024-01-01', '2024-03-31', metrics);
      const pack2 = generateCapitalPack('2024-01-01', '2024-03-31', metrics);
      
      createDistribution(pack1.id, 'lender-1', 'Bank', 'LENDER', 'admin', 'DATA_ROOM');
      createDistribution(pack2.id, 'fund-1', 'Fund', 'CAPITAL_PROVIDER', 'admin', 'DATA_ROOM');
      
      const distributions = listDistributions({ packId: pack1.id });
      expect(distributions.length).toBe(1);
    });
  });
});

// ============================================
// PACK INTEGRITY TESTS
// ============================================

describe('Pack Integrity', () => {
  beforeEach(() => {
    clearCapitalReportingData();
    initializeDefaultCovenants();
  });

  describe('verifyPackIntegrity', () => {
    it('should verify valid pack', () => {
      const metrics = createTestMetrics();
      const pack = generateLenderPack('2024-01-01', '2024-03-31', metrics);
      
      const result = verifyPackIntegrity(pack.id);
      expect(result.valid).toBe(true);
      expect(result.storedHash).toBe(result.computedHash);
    });

    it('should return invalid for non-existent pack', () => {
      const result = verifyPackIntegrity('nonexistent');
      expect(result.valid).toBe(false);
    });
  });

  describe('listReportPacks', () => {
    it('should list all packs', () => {
      const metrics = createTestMetrics();
      generateLenderPack('2024-01-01', '2024-03-31', metrics);
      generateCapitalPack('2024-01-01', '2024-03-31', metrics);
      
      const packs = listReportPacks();
      expect(packs.length).toBe(2);
    });

    it('should filter by pack type', () => {
      const metrics = createTestMetrics();
      generateLenderPack('2024-01-01', '2024-03-31', metrics);
      generateCapitalPack('2024-01-01', '2024-03-31', metrics);
      
      const packs = listReportPacks({ packType: 'LENDER_QUARTERLY' });
      expect(packs.length).toBe(1);
      expect(packs[0].packType).toBe('LENDER_QUARTERLY');
    });
  });
});

// ============================================
// DATA CONTRACT TESTS
// ============================================

describe('Data Contracts', () => {
  beforeEach(() => {
    clearCapitalReportingData();
  });

  describe('carve-out data contracts', () => {
    it('should create data contract with carve-out', () => {
      const scope = {
        entityType: 'MARKET' as const,
        entityIds: ['denver'],
        includeHistorical: true,
        historicalPeriods: 12,
        dataCategories: ['financial'],
      };
      
      const pack = generateCarveOut(scope, [], {}, {});
      
      expect(pack.dataContract).toBeDefined();
      expect(pack.dataContract.version).toBeTruthy();
      expect(pack.dataContract.schemaHash).toBeTruthy();
      expect(pack.dataContract.fields.length).toBeGreaterThan(0);
    });

    it('should list data contracts', () => {
      const scope = {
        entityType: 'MARKET' as const,
        entityIds: ['denver'],
        includeHistorical: true,
        historicalPeriods: 12,
        dataCategories: ['financial'],
      };
      
      generateCarveOut(scope, [], {}, {});
      
      const contracts = listDataContracts();
      expect(contracts.length).toBeGreaterThan(0);
    });
  });

  describe('validateAgainstContract', () => {
    it('should validate data against contract', () => {
      const scope = {
        entityType: 'MARKET' as const,
        entityIds: ['denver'],
        includeHistorical: true,
        historicalPeriods: 12,
        dataCategories: ['financial'],
      };
      
      const pack = generateCarveOut(scope, [], {}, {});
      
      const validData = {
        entityId: 'test-123',
        entityName: 'Test Entity',
        entityType: 'MARKET',
        status: 'ACTIVE',
        metrics: {},
      };
      
      const result = validateAgainstContract(validData, pack.dataContract.version);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should detect missing required fields', () => {
      const scope = {
        entityType: 'MARKET' as const,
        entityIds: ['denver'],
        includeHistorical: true,
        historicalPeriods: 12,
        dataCategories: ['financial'],
      };
      
      const pack = generateCarveOut(scope, [], {}, {});
      
      const invalidData = {
        entityId: 'test-123',
        // missing entityName, entityType, status, metrics
      };
      
      const result = validateAgainstContract(invalidData, pack.dataContract.version);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

// ============================================
// AUDIT TRAIL TESTS
// ============================================

describe('Audit Trail', () => {
  beforeEach(() => {
    clearCapitalReportingData();
    initializeDefaultCovenants();
  });

  describe('getAuditRecords', () => {
    it('should record pack generation', () => {
      const metrics = createTestMetrics();
      generateLenderPack('2024-01-01', '2024-03-31', metrics);
      
      const records = getAuditRecords({ action: 'PACK_GENERATED' });
      expect(records.length).toBeGreaterThan(0);
    });

    it('should record token creation', () => {
      createDataRoomToken('LENDER', 'lender-123', 'Bank', 'admin');
      
      const records = getAuditRecords({ action: 'TOKEN_CREATED' });
      expect(records.length).toBe(1);
    });

    it('should record pack access', () => {
      const token = createDataRoomToken('LENDER', 'lender-123', 'Bank', 'admin', { allowedPacks: ['LENDER_QUARTERLY'] });
      const metrics = createTestMetrics();
      const pack = generateLenderPack('2024-01-01', '2024-03-31', metrics);
      
      accessPackWithToken(token.token, pack.id);
      
      const records = getAuditRecords({ action: 'PACK_ACCESSED' });
      expect(records.length).toBe(1);
    });

    it('should record distribution', () => {
      const metrics = createTestMetrics();
      const pack = generateLenderPack('2024-01-01', '2024-03-31', metrics);
      createDistribution(pack.id, 'lender-123', 'Bank', 'LENDER', 'admin', 'DATA_ROOM');
      
      const records = getAuditRecords({ action: 'PACK_DISTRIBUTED' });
      expect(records.length).toBe(1);
    });

    it('should filter by audience', () => {
      createDataRoomToken('LENDER', 'lender-123', 'Bank', 'admin');
      createDataRoomToken('INSURANCE_CARRIER', 'insurer-123', 'Insurance', 'admin');
      
      const records = getAuditRecords({ audience: 'LENDER' });
      expect(records.length).toBe(1);
    });

    it('should include content hash', () => {
      const metrics = createTestMetrics();
      const pack = generateLenderPack('2024-01-01', '2024-03-31', metrics);
      
      const records = getAuditRecords({ action: 'PACK_GENERATED' });
      expect(records[0].contentHash).toBe(pack.contentHash);
    });
  });
});
