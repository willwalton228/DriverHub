/**
 * Unit Tests for Pay Period Processing + Export Packets v1 (INCREMENT 4)
 */

import { describe, it, expect } from 'vitest';
import {
  isValidTransition,
  validateStateTransition,
  enforceNotLocked,
  canAddPayLine,
  canModifyPayLine,
  generateAdpCsv,
  generateOpenForceCsv,
  generateFileHash,
  generateExportFileName,
  calculateExportTotals,
  generateExportsForPayPeriod,
  getWeekStartDate,
  getWeekEndDate,
  generateWeeklyPayPeriodDates,
  findPayPeriodForDate,
  findOpenPayPeriodForNewLines,
  PayPeriodLockedError,
  InvalidStateTransitionError,
  type PayPeriodRecord,
  type PayLineRecord,
  type DriverExportInfo,
} from './payPeriodProcessor';

// ============================================
// 1. STATE MACHINE TESTS
// ============================================

describe('isValidTransition', () => {
  it('should allow OPEN → PROCESSING', () => {
    expect(isValidTransition('OPEN', 'PROCESSING')).toBe(true);
  });

  it('should allow PROCESSING → LOCKED', () => {
    expect(isValidTransition('PROCESSING', 'LOCKED')).toBe(true);
  });

  it('should allow PROCESSING → OPEN (revert)', () => {
    expect(isValidTransition('PROCESSING', 'OPEN')).toBe(true);
  });

  it('should NOT allow OPEN → LOCKED (must go through PROCESSING)', () => {
    expect(isValidTransition('OPEN', 'LOCKED')).toBe(false);
  });

  it('should NOT allow LOCKED → any state', () => {
    expect(isValidTransition('LOCKED', 'OPEN')).toBe(false);
    expect(isValidTransition('LOCKED', 'PROCESSING')).toBe(false);
    expect(isValidTransition('LOCKED', 'LOCKED')).toBe(false);
  });
});

describe('validateStateTransition', () => {
  it('should return new status for valid transitions', () => {
    expect(validateStateTransition('pp-1', 'OPEN', 'PROCESSING')).toBe('PROCESSING');
    expect(validateStateTransition('pp-1', 'PROCESSING', 'LOCKED')).toBe('LOCKED');
  });

  it('should throw InvalidStateTransitionError for invalid transitions', () => {
    expect(() => validateStateTransition('pp-1', 'OPEN', 'LOCKED'))
      .toThrow(InvalidStateTransitionError);
  });

  it('should include context in InvalidStateTransitionError', () => {
    try {
      validateStateTransition('pp-123', 'LOCKED', 'OPEN');
      expect.fail('Should have thrown');
    } catch (error) {
      if (error instanceof InvalidStateTransitionError) {
        expect(error.payPeriodId).toBe('pp-123');
        expect(error.fromStatus).toBe('LOCKED');
        expect(error.toStatus).toBe('OPEN');
        expect(error.message).toContain('LOCKED');
        expect(error.message).toContain('OPEN');
      } else {
        throw error;
      }
    }
  });
});

// ============================================
// 2. IMMUTABILITY ENFORCEMENT TESTS
// ============================================

describe('enforceNotLocked', () => {
  const openPeriod: PayPeriodRecord = {
    id: 'pp-1',
    payGroup: 'DRIVERS_WEEKLY',
    periodStart: '2025-01-20',
    periodEnd: '2025-01-26',
    status: 'OPEN',
    lockedAt: null,
  };

  const lockedPeriod: PayPeriodRecord = {
    ...openPeriod,
    status: 'LOCKED',
    lockedAt: new Date(),
  };

  it('should not throw for OPEN periods', () => {
    expect(() => enforceNotLocked(openPeriod, 'add pay line')).not.toThrow();
  });

  it('should throw PayPeriodLockedError for LOCKED periods', () => {
    expect(() => enforceNotLocked(lockedPeriod, 'add pay line'))
      .toThrow(PayPeriodLockedError);
  });

  it('should include context in PayPeriodLockedError', () => {
    try {
      enforceNotLocked(lockedPeriod, 'modify totals');
      expect.fail('Should have thrown');
    } catch (error) {
      if (error instanceof PayPeriodLockedError) {
        expect(error.payPeriodId).toBe('pp-1');
        expect(error.action).toBe('modify totals');
        expect(error.message).toContain('modify totals');
      } else {
        throw error;
      }
    }
  });
});

describe('canAddPayLine / canModifyPayLine', () => {
  const periods: PayPeriodRecord[] = [
    { id: 'pp-1', payGroup: 'DRIVERS_WEEKLY', periodStart: '2025-01-20', periodEnd: '2025-01-26', status: 'OPEN', lockedAt: null },
    { id: 'pp-2', payGroup: 'DRIVERS_WEEKLY', periodStart: '2025-01-20', periodEnd: '2025-01-26', status: 'PROCESSING', lockedAt: null },
    { id: 'pp-3', payGroup: 'DRIVERS_WEEKLY', periodStart: '2025-01-20', periodEnd: '2025-01-26', status: 'LOCKED', lockedAt: new Date() },
  ];

  it('should allow adding/modifying only in OPEN status', () => {
    expect(canAddPayLine(periods[0])).toBe(true);
    expect(canAddPayLine(periods[1])).toBe(false);
    expect(canAddPayLine(periods[2])).toBe(false);

    expect(canModifyPayLine(periods[0])).toBe(true);
    expect(canModifyPayLine(periods[1])).toBe(false);
    expect(canModifyPayLine(periods[2])).toBe(false);
  });
});

// ============================================
// 3. EXPORT GENERATOR TESTS
// ============================================

const mockPayPeriod: PayPeriodRecord = {
  id: 'pp-test-123',
  payGroup: 'DRIVERS_WEEKLY',
  periodStart: '2025-01-20',
  periodEnd: '2025-01-26',
  status: 'LOCKED',
  lockedAt: new Date(),
};

const mockPayLines: PayLineRecord[] = [
  {
    id: 'pl-1',
    payPeriodId: 'pp-test-123',
    driverId: 'd-1',
    workerType: 'W2_DRIVER',
    paidMinutes: 480,
    baseRateCents: 2500,
    basePayCents: 20000,
    volumeMultiplier: '1.0000',
    safetyMultiplier: '1.0000',
    effectiveMultiplier: '1.0000',
    adjustedPayCents: 20000,
    finalPayCents: 20000,
    floorApplied: false,
    capApplied: false,
  },
  {
    id: 'pl-2',
    payPeriodId: 'pp-test-123',
    driverId: 'd-1',
    workerType: 'W2_DRIVER',
    paidMinutes: 240,
    baseRateCents: 2500,
    basePayCents: 10000,
    volumeMultiplier: '1.0500',
    safetyMultiplier: '1.0000',
    effectiveMultiplier: '1.0500',
    adjustedPayCents: 10500,
    finalPayCents: 10500,
    floorApplied: false,
    capApplied: false,
  },
  {
    id: 'pl-3',
    payPeriodId: 'pp-test-123',
    driverId: 'd-2',
    workerType: 'IC_DRIVER',
    paidMinutes: 360,
    baseRateCents: 2200,
    basePayCents: 13200,
    volumeMultiplier: '1.0000',
    safetyMultiplier: '1.0000',
    effectiveMultiplier: '1.0000',
    adjustedPayCents: 13200,
    finalPayCents: 13200,
    floorApplied: false,
    capApplied: false,
  },
];

const mockDriverInfo = new Map<string, DriverExportInfo>([
  ['d-1', { id: 'd-1', employeeId: 'EMP001', firstName: 'John', lastName: 'Doe' }],
  ['d-2', { id: 'd-2', independentContractorId: 'IC001', firstName: 'Jane', lastName: 'Smith' }],
]);

describe('generateAdpCsv', () => {
  it('should generate CSV with header row', () => {
    const csv = generateAdpCsv(mockPayPeriod, mockPayLines, mockDriverInfo);
    const lines = csv.split('\n');
    
    expect(lines[0]).toBe('Employee_ID,First_Name,Last_Name,Pay_Period_Start,Pay_Period_End,Hours_Worked,Gross_Pay,Pay_Type');
  });

  it('should only include W2 drivers', () => {
    const csv = generateAdpCsv(mockPayPeriod, mockPayLines, mockDriverInfo);
    const lines = csv.split('\n');
    
    // Header + 1 W2 driver (d-1)
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain('EMP001');
    expect(lines[1]).toContain('John');
    expect(lines[1]).not.toContain('IC001');
  });

  it('should aggregate multiple pay lines for same driver', () => {
    const csv = generateAdpCsv(mockPayPeriod, mockPayLines, mockDriverInfo);
    const lines = csv.split('\n');
    const dataRow = lines[1].split(',');
    
    // d-1 has 480 + 240 = 720 minutes = 12 hours
    expect(dataRow[5]).toBe('12.00');
    // d-1 has 20000 + 10500 = 30500 cents = $305.00
    expect(dataRow[6]).toBe('305.00');
  });

  it('should return only header when no W2 drivers', () => {
    const icOnlyLines = mockPayLines.filter(pl => pl.workerType === 'IC_DRIVER');
    const csv = generateAdpCsv(mockPayPeriod, icOnlyLines, mockDriverInfo);
    const lines = csv.split('\n');
    
    expect(lines.length).toBe(1); // Just header
  });
});

describe('generateOpenForceCsv', () => {
  it('should generate CSV with header row', () => {
    const csv = generateOpenForceCsv(mockPayPeriod, mockPayLines, mockDriverInfo);
    const lines = csv.split('\n');
    
    expect(lines[0]).toBe('Contractor_ID,First_Name,Last_Name,Pay_Period_Start,Pay_Period_End,Total_Minutes,Gross_Pay,Settlement_Type');
  });

  it('should only include IC drivers', () => {
    const csv = generateOpenForceCsv(mockPayPeriod, mockPayLines, mockDriverInfo);
    const lines = csv.split('\n');
    
    // Header + 1 IC driver (d-2)
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain('IC001');
    expect(lines[1]).toContain('Jane');
    expect(lines[1]).not.toContain('EMP001');
  });

  it('should include total minutes', () => {
    const csv = generateOpenForceCsv(mockPayPeriod, mockPayLines, mockDriverInfo);
    const lines = csv.split('\n');
    const dataRow = lines[1].split(',');
    
    // d-2 has 360 minutes
    expect(dataRow[5]).toBe('360');
    // d-2 has 13200 cents = $132.00
    expect(dataRow[6]).toBe('132.00');
  });
});

// ============================================
// 4. FILE HASH TESTS
// ============================================

describe('generateFileHash', () => {
  it('should generate consistent SHA-256 hash', () => {
    const content = 'test content';
    const hash1 = generateFileHash(content);
    const hash2 = generateFileHash(content);
    
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 hex length
  });

  it('should generate different hashes for different content', () => {
    const hash1 = generateFileHash('content A');
    const hash2 = generateFileHash('content B');
    
    expect(hash1).not.toBe(hash2);
  });

  it('should be stable for same CSV content', () => {
    const csv = generateAdpCsv(mockPayPeriod, mockPayLines, mockDriverInfo);
    const hash1 = generateFileHash(csv);
    const hash2 = generateFileHash(csv);
    
    expect(hash1).toBe(hash2);
  });
});

// ============================================
// 5. EXPORT TOTALS TESTS
// ============================================

describe('calculateExportTotals', () => {
  it('should count unique W2 drivers', () => {
    const totals = calculateExportTotals(mockPayLines, 'W2_DRIVER');
    
    expect(totals.rowCount).toBe(1); // Only d-1 is W2
    expect(totals.totalAmountCents).toBe(30500); // 20000 + 10500
  });

  it('should count unique IC drivers', () => {
    const totals = calculateExportTotals(mockPayLines, 'IC_DRIVER');
    
    expect(totals.rowCount).toBe(1); // Only d-2 is IC
    expect(totals.totalAmountCents).toBe(13200);
  });

  it('should return zero for no matching drivers', () => {
    const totals = calculateExportTotals(mockPayLines, 'CORP_EMPLOYEE');
    
    expect(totals.rowCount).toBe(0);
    expect(totals.totalAmountCents).toBe(0);
  });
});

// ============================================
// 6. GENERATE EXPORTS FOR PAY PERIOD TESTS
// ============================================

describe('generateExportsForPayPeriod', () => {
  it('should generate both ADP and OpenForce exports when both worker types present', () => {
    const artifacts = generateExportsForPayPeriod(mockPayPeriod, mockPayLines, mockDriverInfo);
    
    expect(artifacts.length).toBe(2);
    
    const adp = artifacts.find(a => a.exportType === 'ADP_CSV');
    const of = artifacts.find(a => a.exportType === 'OPENFORCE_CSV');
    
    expect(adp).toBeDefined();
    expect(of).toBeDefined();
  });

  it('should only generate ADP export when only W2 drivers', () => {
    const w2OnlyLines = mockPayLines.filter(pl => pl.workerType === 'W2_DRIVER');
    const artifacts = generateExportsForPayPeriod(mockPayPeriod, w2OnlyLines, mockDriverInfo);
    
    expect(artifacts.length).toBe(1);
    expect(artifacts[0].exportType).toBe('ADP_CSV');
  });

  it('should only generate OpenForce export when only IC drivers', () => {
    const icOnlyLines = mockPayLines.filter(pl => pl.workerType === 'IC_DRIVER');
    const artifacts = generateExportsForPayPeriod(mockPayPeriod, icOnlyLines, mockDriverInfo);
    
    expect(artifacts.length).toBe(1);
    expect(artifacts[0].exportType).toBe('OPENFORCE_CSV');
  });

  it('should include file hash in each artifact', () => {
    const artifacts = generateExportsForPayPeriod(mockPayPeriod, mockPayLines, mockDriverInfo);
    
    for (const artifact of artifacts) {
      expect(artifact.fileHash).toBeDefined();
      expect(artifact.fileHash.length).toBe(64);
    }
  });

  it('should include correct totals in each artifact', () => {
    const artifacts = generateExportsForPayPeriod(mockPayPeriod, mockPayLines, mockDriverInfo);
    
    const adp = artifacts.find(a => a.exportType === 'ADP_CSV')!;
    expect(adp.rowCount).toBe(1);
    expect(adp.totalAmountCents).toBe(30500);
    
    const of = artifacts.find(a => a.exportType === 'OPENFORCE_CSV')!;
    expect(of.rowCount).toBe(1);
    expect(of.totalAmountCents).toBe(13200);
  });
});

// ============================================
// 7. WEEKLY PAY PERIOD GENERATOR TESTS
// ============================================

describe('getWeekStartDate / getWeekEndDate', () => {
  it('should return Monday for any day in the week', () => {
    // Wednesday Jan 22, 2025
    const wed = new Date('2025-01-22');
    const monday = getWeekStartDate(wed);
    
    expect(monday.getDay()).toBe(1); // Monday
    expect(monday.toISOString().slice(0, 10)).toBe('2025-01-20');
  });

  it('should return Sunday for end date', () => {
    const wed = new Date('2025-01-22');
    const sunday = getWeekEndDate(wed);
    
    expect(sunday.getDay()).toBe(0); // Sunday
    expect(sunday.toISOString().slice(0, 10)).toBe('2025-01-26');
  });

  it('should handle Monday input', () => {
    const mon = new Date('2025-01-20');
    const start = getWeekStartDate(mon);
    const end = getWeekEndDate(mon);
    
    expect(start.toISOString().slice(0, 10)).toBe('2025-01-20');
    expect(end.toISOString().slice(0, 10)).toBe('2025-01-26');
  });

  it('should handle Sunday input', () => {
    const sun = new Date('2025-01-26');
    const start = getWeekStartDate(sun);
    const end = getWeekEndDate(sun);
    
    expect(start.toISOString().slice(0, 10)).toBe('2025-01-20');
    expect(end.toISOString().slice(0, 10)).toBe('2025-01-26');
  });
});

describe('generateWeeklyPayPeriodDates', () => {
  it('should generate Monday-Sunday period', () => {
    const dates = generateWeeklyPayPeriodDates(new Date('2025-01-22'));
    
    expect(dates.periodStart).toBe('2025-01-20');
    expect(dates.periodEnd).toBe('2025-01-26');
  });
});

describe('findPayPeriodForDate', () => {
  const periods: PayPeriodRecord[] = [
    { id: 'pp-1', payGroup: 'DRIVERS_WEEKLY', periodStart: '2025-01-13', periodEnd: '2025-01-19', status: 'LOCKED', lockedAt: new Date() },
    { id: 'pp-2', payGroup: 'DRIVERS_WEEKLY', periodStart: '2025-01-20', periodEnd: '2025-01-26', status: 'OPEN', lockedAt: null },
  ];

  it('should find matching pay period', () => {
    const result = findPayPeriodForDate(new Date('2025-01-22'), periods);
    
    expect(result?.id).toBe('pp-2');
  });

  it('should return null for date outside all periods', () => {
    const result = findPayPeriodForDate(new Date('2025-01-01'), periods);
    
    expect(result).toBeNull();
  });
});

describe('findOpenPayPeriodForNewLines', () => {
  it('should find most recent OPEN period', () => {
    const periods: PayPeriodRecord[] = [
      { id: 'pp-1', payGroup: 'DRIVERS_WEEKLY', periodStart: '2025-01-13', periodEnd: '2025-01-19', status: 'LOCKED', lockedAt: new Date() },
      { id: 'pp-2', payGroup: 'DRIVERS_WEEKLY', periodStart: '2025-01-20', periodEnd: '2025-01-26', status: 'OPEN', lockedAt: null },
      { id: 'pp-3', payGroup: 'DRIVERS_WEEKLY', periodStart: '2025-01-27', periodEnd: '2025-02-02', status: 'OPEN', lockedAt: null },
    ];

    const result = findOpenPayPeriodForNewLines(periods);
    
    expect(result?.id).toBe('pp-3'); // Most recent OPEN
  });

  it('should return null when all periods are locked', () => {
    const periods: PayPeriodRecord[] = [
      { id: 'pp-1', payGroup: 'DRIVERS_WEEKLY', periodStart: '2025-01-13', periodEnd: '2025-01-19', status: 'LOCKED', lockedAt: new Date() },
      { id: 'pp-2', payGroup: 'DRIVERS_WEEKLY', periodStart: '2025-01-20', periodEnd: '2025-01-26', status: 'LOCKED', lockedAt: new Date() },
    ];

    const result = findOpenPayPeriodForNewLines(periods);
    
    expect(result).toBeNull();
  });
});

// ============================================
// 8. EXPORT FILENAME TESTS
// ============================================

describe('generateExportFileName', () => {
  it('should include ADP prefix for ADP exports', () => {
    const fileName = generateExportFileName('pp-123', 'ADP_CSV', '2025-01-26');
    
    expect(fileName.startsWith('ADP_')).toBe(true);
    expect(fileName.endsWith('.csv')).toBe(true);
  });

  it('should include OpenForce prefix for OpenForce exports', () => {
    const fileName = generateExportFileName('pp-123', 'OPENFORCE_CSV', '2025-01-26');
    
    expect(fileName.startsWith('OpenForce_')).toBe(true);
    expect(fileName.endsWith('.csv')).toBe(true);
  });

  it('should include period end date', () => {
    const fileName = generateExportFileName('pp-123', 'ADP_CSV', '2025-01-26');
    
    expect(fileName).toContain('2025-01-26');
  });
});
