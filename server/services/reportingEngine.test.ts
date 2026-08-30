import { describe, it, expect, beforeEach } from 'vitest';
import {
  createAccessToken,
  validateToken,
  useToken,
  revokeToken,
  getToken,
  listTokens,
  isReportAllowed,
  getAllowedReportTypes,
  filterSensitiveFields,
  generateReport,
  generateReportPacket,
  accessReportPacket,
  getReport,
  getAuditRecords,
  getTokenStats,
  clearReportingData,
  type ReportAudience,
  type ReportType,
  type AccessTokenScope,
} from './reportingEngine';

// ============================================
// TOKEN MANAGEMENT TESTS
// ============================================

describe('Access Token Management', () => {
  beforeEach(() => {
    clearReportingData();
  });

  describe('createAccessToken', () => {
    it('should create a token with correct properties', () => {
      const token = createAccessToken(
        'CUSTOMER',
        'cust-123',
        'Acme Corp',
        { marketIds: ['denver'] },
        'admin-user'
      );
      
      expect(token.id).toBeTruthy();
      expect(token.token).toMatch(/^rpt_/);
      expect(token.audience).toBe('CUSTOMER');
      expect(token.entityId).toBe('cust-123');
      expect(token.entityName).toBe('Acme Corp');
      expect(token.isActive).toBe(true);
      expect(token.usageCount).toBe(0);
    });

    it('should set expiration correctly', () => {
      const token = createAccessToken(
        'OEM',
        'oem-123',
        'OEM Partner',
        {},
        'admin',
        7
      );
      
      const expiresAt = new Date(token.expiresAt);
      const createdAt = new Date(token.createdAt);
      const diff = expiresAt.getTime() - createdAt.getTime();
      const days = diff / (24 * 60 * 60 * 1000);
      
      expect(days).toBeCloseTo(7, 0);
    });

    it('should scope token to markets', () => {
      const token = createAccessToken(
        'PARTNER',
        'partner-123',
        'Partner Co',
        { marketIds: ['denver', 'phoenix'] },
        'admin'
      );
      
      expect(token.scope.marketIds).toEqual(['denver', 'phoenix']);
    });
  });

  describe('validateToken', () => {
    it('should validate active token', () => {
      const token = createAccessToken('CUSTOMER', 'cust-123', 'Acme', {}, 'admin');
      
      const result = validateToken(token.token);
      expect(result.valid).toBe(true);
      expect(result.token?.id).toBe(token.id);
    });

    it('should reject invalid token', () => {
      const result = validateToken('invalid-token');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token not found');
    });

    it('should reject revoked token', () => {
      const token = createAccessToken('CUSTOMER', 'cust-123', 'Acme', {}, 'admin');
      revokeToken(token.id, 'admin');
      
      const result = validateToken(token.token);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token has been revoked');
    });

    it('should reject expired token', () => {
      const token = createAccessToken('CUSTOMER', 'cust-123', 'Acme', {}, 'admin', 0);
      // Force expiration
      const stored = getToken(token.id);
      if (stored) {
        stored.expiresAt = new Date(Date.now() - 1000).toISOString();
      }
      
      const result = validateToken(token.token);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token has expired');
    });
  });

  describe('useToken', () => {
    it('should increment usage count', () => {
      const token = createAccessToken('CUSTOMER', 'cust-123', 'Acme', {}, 'admin');
      
      useToken(token.token);
      useToken(token.token);
      
      const updated = getToken(token.id);
      expect(updated?.usageCount).toBe(2);
    });

    it('should update last used timestamp', () => {
      const token = createAccessToken('CUSTOMER', 'cust-123', 'Acme', {}, 'admin');
      
      useToken(token.token);
      
      const updated = getToken(token.id);
      expect(updated?.lastUsedAt).toBeTruthy();
    });
  });

  describe('revokeToken', () => {
    it('should revoke a token', () => {
      const token = createAccessToken('CUSTOMER', 'cust-123', 'Acme', {}, 'admin');
      
      const result = revokeToken(token.id, 'admin');
      expect(result).toBe(true);
      
      const updated = getToken(token.id);
      expect(updated?.isActive).toBe(false);
    });

    it('should return false for non-existent token', () => {
      const result = revokeToken('nonexistent', 'admin');
      expect(result).toBe(false);
    });
  });

  describe('listTokens', () => {
    it('should list all tokens', () => {
      createAccessToken('CUSTOMER', 'cust-1', 'Acme', {}, 'admin');
      createAccessToken('CUSTOMER', 'cust-2', 'Beta', {}, 'admin');
      
      const tokens = listTokens();
      expect(tokens.length).toBe(2);
    });

    it('should filter by entity ID', () => {
      createAccessToken('CUSTOMER', 'cust-1', 'Acme', {}, 'admin');
      createAccessToken('CUSTOMER', 'cust-2', 'Beta', {}, 'admin');
      
      const tokens = listTokens('cust-1');
      expect(tokens.length).toBe(1);
      expect(tokens[0].entityId).toBe('cust-1');
    });
  });
});

// ============================================
// REPORT ACCESS CONTROL TESTS
// ============================================

describe('Report Access Control', () => {
  beforeEach(() => {
    clearReportingData();
  });

  describe('isReportAllowed', () => {
    it('should allow customer report types', () => {
      expect(isReportAllowed('CUSTOMER', 'DELIVERY_SUMMARY')).toBe(true);
      expect(isReportAllowed('CUSTOMER', 'PERFORMANCE_METRICS')).toBe(true);
      expect(isReportAllowed('CUSTOMER', 'SERVICE_QUALITY')).toBe(true);
    });

    it('should deny customer access to internal reports', () => {
      expect(isReportAllowed('CUSTOMER', 'UTILIZATION_REPORT')).toBe(false);
      expect(isReportAllowed('CUSTOMER', 'MARKET_OVERVIEW')).toBe(false);
    });

    it('should allow OEM access to safety reports', () => {
      expect(isReportAllowed('OEM', 'SAFETY_OVERVIEW')).toBe(true);
      expect(isReportAllowed('OEM', 'COMPLIANCE_STATUS')).toBe(true);
    });

    it('should allow internal access to all reports', () => {
      expect(isReportAllowed('INTERNAL', 'DELIVERY_SUMMARY')).toBe(true);
      expect(isReportAllowed('INTERNAL', 'MARKET_OVERVIEW')).toBe(true);
      expect(isReportAllowed('INTERNAL', 'COMPLIANCE_STATUS')).toBe(true);
    });
  });

  describe('getAllowedReportTypes', () => {
    it('should return customer report types', () => {
      const types = getAllowedReportTypes('CUSTOMER');
      expect(types).toContain('DELIVERY_SUMMARY');
      expect(types).not.toContain('MARKET_OVERVIEW');
    });

    it('should return all types for internal', () => {
      const types = getAllowedReportTypes('INTERNAL');
      expect(types.length).toBe(8);
    });
  });

  describe('filterSensitiveFields', () => {
    it('should filter margin fields for customers', () => {
      const data = { name: 'test', margin: 50, costPerMove: 100 };
      const filtered = filterSensitiveFields(data, 'CUSTOMER');
      
      expect(filtered.name).toBe('test');
      expect(filtered.margin).toBeUndefined();
      expect(filtered.costPerMove).toBeUndefined();
    });

    it('should not filter for internal users', () => {
      const data = { name: 'test', margin: 50, profit: 100 };
      const filtered = filterSensitiveFields(data, 'INTERNAL');
      
      expect(filtered.margin).toBe(50);
      expect(filtered.profit).toBe(100);
    });
  });
});

// ============================================
// REPORT GENERATION TESTS
// ============================================

describe('Report Generation', () => {
  beforeEach(() => {
    clearReportingData();
  });

  describe('generateReport', () => {
    it('should generate delivery summary report', () => {
      const report = generateReport('DELIVERY_SUMMARY', 'CUSTOMER');
      
      expect(report).not.toBeNull();
      expect(report?.reportType).toBe('DELIVERY_SUMMARY');
      expect(report?.data).toHaveProperty('totalDeliveries');
    });

    it('should generate performance metrics report', () => {
      const report = generateReport('PERFORMANCE_METRICS', 'CUSTOMER');
      
      expect(report).not.toBeNull();
      expect(report?.data).toHaveProperty('overallScore');
    });

    it('should generate safety overview report', () => {
      const report = generateReport('SAFETY_OVERVIEW', 'OEM');
      
      expect(report).not.toBeNull();
      expect(report?.data).toHaveProperty('safetyScore');
    });

    it('should generate utilization report', () => {
      const report = generateReport('UTILIZATION_REPORT', 'PARTNER');
      
      expect(report).not.toBeNull();
      expect(report?.data).toHaveProperty('averageUtilization');
    });

    it('should generate volume analysis report', () => {
      const report = generateReport('VOLUME_ANALYSIS', 'OEM');
      
      expect(report).not.toBeNull();
      expect(report?.data).toHaveProperty('totalVolume');
    });

    it('should generate service quality report', () => {
      const report = generateReport('SERVICE_QUALITY', 'CUSTOMER');
      
      expect(report).not.toBeNull();
      expect(report?.data).toHaveProperty('qualityScore');
    });

    it('should generate compliance status report', () => {
      const report = generateReport('COMPLIANCE_STATUS', 'OEM');
      
      expect(report).not.toBeNull();
      expect(report?.data).toHaveProperty('overallCompliance');
    });

    it('should generate market overview report', () => {
      const report = generateReport('MARKET_OVERVIEW', 'PARTNER');
      
      expect(report).not.toBeNull();
      expect(report?.data).toHaveProperty('marketsActive');
    });

    it('should return null for unauthorized report', () => {
      const report = generateReport('MARKET_OVERVIEW', 'CUSTOMER');
      expect(report).toBeNull();
    });

    it('should include metadata', () => {
      const report = generateReport('DELIVERY_SUMMARY', 'CUSTOMER');
      
      expect(report?.metadata.title).toBeTruthy();
      expect(report?.metadata.description).toBeTruthy();
      expect(report?.metadata.generationTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================
// REPORT PACKET TESTS
// ============================================

describe('Report Packet Generation', () => {
  beforeEach(() => {
    clearReportingData();
  });

  describe('generateReportPacket', () => {
    it('should generate JSON packet', () => {
      const token = createAccessToken('CUSTOMER', 'cust-123', 'Acme', {}, 'admin');
      
      const packet = generateReportPacket(
        token.token,
        ['DELIVERY_SUMMARY', 'PERFORMANCE_METRICS'],
        'JSON'
      );
      
      expect('error' in packet).toBe(false);
      if (!('error' in packet)) {
        expect(packet.format).toBe('JSON');
        expect(packet.contentType).toBe('application/json');
        expect(packet.reports.length).toBe(2);
      }
    });

    it('should generate CSV packet', () => {
      const token = createAccessToken('CUSTOMER', 'cust-123', 'Acme', {}, 'admin');
      
      const packet = generateReportPacket(
        token.token,
        ['DELIVERY_SUMMARY'],
        'CSV'
      );
      
      expect('error' in packet).toBe(false);
      if (!('error' in packet)) {
        expect(packet.format).toBe('CSV');
        expect(packet.contentType).toBe('text/csv');
        expect(packet.content).toContain('Delivery Summary Report');
      }
    });

    it('should generate PDF-ready packet', () => {
      const token = createAccessToken('CUSTOMER', 'cust-123', 'Acme', {}, 'admin');
      
      const packet = generateReportPacket(
        token.token,
        ['DELIVERY_SUMMARY'],
        'PDF_READY'
      );
      
      expect('error' in packet).toBe(false);
      if (!('error' in packet)) {
        expect(packet.format).toBe('PDF_READY');
        const content = JSON.parse(packet.content);
        expect(content.sections).toBeDefined();
      }
    });

    it('should reject invalid token', () => {
      const packet = generateReportPacket('invalid-token', ['DELIVERY_SUMMARY'], 'JSON');
      
      expect('error' in packet).toBe(true);
    });

    it('should filter unauthorized report types', () => {
      const token = createAccessToken('CUSTOMER', 'cust-123', 'Acme', {}, 'admin');
      
      const packet = generateReportPacket(
        token.token,
        ['DELIVERY_SUMMARY', 'MARKET_OVERVIEW'],
        'JSON'
      );
      
      expect('error' in packet).toBe(false);
      if (!('error' in packet)) {
        expect(packet.reports.length).toBe(1);
        expect(packet.reports[0].reportType).toBe('DELIVERY_SUMMARY');
      }
    });

    it('should enforce market scope', () => {
      const token = createAccessToken(
        'CUSTOMER',
        'cust-123',
        'Acme',
        { marketIds: ['denver'] },
        'admin'
      );
      
      const packet = generateReportPacket(
        token.token,
        ['DELIVERY_SUMMARY'],
        'JSON',
        { marketId: 'phoenix' }
      );
      
      expect('error' in packet).toBe(true);
      if ('error' in packet) {
        expect(packet.error).toContain('Market not within token scope');
      }
    });

    it('should increment token usage', () => {
      const token = createAccessToken('CUSTOMER', 'cust-123', 'Acme', {}, 'admin');
      
      generateReportPacket(token.token, ['DELIVERY_SUMMARY'], 'JSON');
      
      const updated = getToken(token.id);
      expect(updated?.usageCount).toBe(1);
    });
  });

  describe('accessReportPacket', () => {
    it('should allow access with valid token', () => {
      const token = createAccessToken('CUSTOMER', 'cust-123', 'Acme', {}, 'admin');
      const packet = generateReportPacket(token.token, ['DELIVERY_SUMMARY'], 'JSON');
      
      if (!('error' in packet)) {
        const accessed = accessReportPacket(packet.id, token.token);
        expect('error' in accessed).toBe(false);
      }
    });

    it('should deny access with different token', () => {
      const token1 = createAccessToken('CUSTOMER', 'cust-1', 'Acme', {}, 'admin');
      const token2 = createAccessToken('CUSTOMER', 'cust-2', 'Beta', {}, 'admin');
      
      const packet = generateReportPacket(token1.token, ['DELIVERY_SUMMARY'], 'JSON');
      
      if (!('error' in packet)) {
        const accessed = accessReportPacket(packet.id, token2.token);
        expect('error' in accessed).toBe(true);
      }
    });

    it('should deny access to non-existent packet', () => {
      const token = createAccessToken('CUSTOMER', 'cust-123', 'Acme', {}, 'admin');
      
      const accessed = accessReportPacket('nonexistent', token.token);
      expect('error' in accessed).toBe(true);
    });
  });
});

// ============================================
// AUDIT TRAIL TESTS
// ============================================

describe('Audit Trail', () => {
  beforeEach(() => {
    clearReportingData();
  });

  describe('getAuditRecords', () => {
    it('should record token creation', () => {
      createAccessToken('CUSTOMER', 'cust-123', 'Acme', {}, 'admin');
      
      const records = getAuditRecords({ action: 'TOKEN_CREATED' });
      expect(records.length).toBe(1);
    });

    it('should record token usage', () => {
      const token = createAccessToken('CUSTOMER', 'cust-123', 'Acme', {}, 'admin');
      useToken(token.token);
      
      const records = getAuditRecords({ action: 'TOKEN_USED' });
      expect(records.length).toBe(1);
    });

    it('should record report generation', () => {
      const token = createAccessToken('CUSTOMER', 'cust-123', 'Acme', {}, 'admin');
      generateReportPacket(token.token, ['DELIVERY_SUMMARY'], 'JSON');
      
      const records = getAuditRecords({ action: 'REPORT_GENERATED' });
      expect(records.length).toBeGreaterThan(0);
    });

    it('should record packet creation', () => {
      const token = createAccessToken('CUSTOMER', 'cust-123', 'Acme', {}, 'admin');
      generateReportPacket(token.token, ['DELIVERY_SUMMARY'], 'JSON');
      
      const records = getAuditRecords({ action: 'PACKET_CREATED' });
      expect(records.length).toBe(1);
    });

    it('should record access denied', () => {
      generateReportPacket('invalid-token', ['DELIVERY_SUMMARY'], 'JSON');
      
      const records = getAuditRecords({ action: 'ACCESS_DENIED' });
      expect(records.length).toBe(1);
    });

    it('should filter by audience', () => {
      createAccessToken('CUSTOMER', 'cust-1', 'Acme', {}, 'admin');
      createAccessToken('OEM', 'oem-1', 'OEM', {}, 'admin');
      
      const records = getAuditRecords({ audience: 'CUSTOMER' });
      expect(records.every(r => r.audience === 'CUSTOMER')).toBe(true);
    });

    it('should filter by date range', () => {
      createAccessToken('CUSTOMER', 'cust-123', 'Acme', {}, 'admin');
      
      const records = getAuditRecords({
        startDate: new Date(Date.now() - 1000).toISOString(),
      });
      expect(records.length).toBeGreaterThan(0);
    });
  });

  describe('getTokenStats', () => {
    it('should return token statistics', () => {
      const token = createAccessToken('CUSTOMER', 'cust-123', 'Acme', {}, 'admin');
      useToken(token.token);
      generateReportPacket(token.token, ['DELIVERY_SUMMARY'], 'JSON');
      
      const stats = getTokenStats(token.id);
      
      expect(stats).not.toBeNull();
      expect(stats?.totalAccesses).toBeGreaterThan(0);
      expect(stats?.packetsCreated).toBe(1);
    });

    it('should return null for non-existent token', () => {
      const stats = getTokenStats('nonexistent');
      expect(stats).toBeNull();
    });
  });
});

// ============================================
// AUDIENCE-SPECIFIC REPORT TESTS
// ============================================

describe('Audience-Specific Reports', () => {
  beforeEach(() => {
    clearReportingData();
  });

  it('should generate customer-appropriate reports', () => {
    const token = createAccessToken('CUSTOMER', 'cust-123', 'Acme', {}, 'admin');
    const packet = generateReportPacket(
      token.token,
      getAllowedReportTypes('CUSTOMER'),
      'JSON'
    );
    
    expect('error' in packet).toBe(false);
    if (!('error' in packet)) {
      expect(packet.reports.length).toBe(3);
    }
  });

  it('should generate OEM-appropriate reports', () => {
    const token = createAccessToken('OEM', 'oem-123', 'OEM Corp', {}, 'admin');
    const packet = generateReportPacket(
      token.token,
      getAllowedReportTypes('OEM'),
      'JSON'
    );
    
    expect('error' in packet).toBe(false);
    if (!('error' in packet)) {
      expect(packet.reports.length).toBe(5);
    }
  });

  it('should generate partner-appropriate reports', () => {
    const token = createAccessToken('PARTNER', 'partner-123', 'Partner Co', {}, 'admin');
    const packet = generateReportPacket(
      token.token,
      getAllowedReportTypes('PARTNER'),
      'JSON'
    );
    
    expect('error' in packet).toBe(false);
    if (!('error' in packet)) {
      expect(packet.reports.length).toBe(4);
    }
  });

  it('should generate internal reports', () => {
    const token = createAccessToken('INTERNAL', 'int-123', 'Internal', {}, 'admin');
    const packet = generateReportPacket(
      token.token,
      getAllowedReportTypes('INTERNAL'),
      'JSON'
    );
    
    expect('error' in packet).toBe(false);
    if (!('error' in packet)) {
      expect(packet.reports.length).toBe(8);
    }
  });
});
