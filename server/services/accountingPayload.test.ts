/**
 * Unit Tests for Accounting Payload Builder
 */

import { describe, it, expect } from 'vitest';
import {
  buildAccountingPayload,
  validateJournalPayload,
  formatJournalSummary,
  DEFAULT_ACCOUNT_MAPPING,
  type JournalPayload,
} from './accountingPayload';
import type { PayPeriodRecord, PayLineRecord } from './payPeriodProcessor';

// ============================================
// TEST DATA
// ============================================

const mockPayPeriod: PayPeriodRecord = {
  id: 'pp-test-123',
  payGroup: 'DRIVERS_WEEKLY',
  periodStart: '2025-01-20',
  periodEnd: '2025-01-26',
  status: 'LOCKED',
  lockedAt: new Date(),
};

const w2PayLine: PayLineRecord = {
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
};

const icPayLine: PayLineRecord = {
  id: 'pl-2',
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
};

// ============================================
// buildAccountingPayload TESTS
// ============================================

describe('buildAccountingPayload', () => {
  it('should create balanced journal entry for W2 only', () => {
    const payload = buildAccountingPayload(mockPayPeriod, [w2PayLine]);
    
    expect(payload.isBalanced).toBe(true);
    expect(payload.totalDebitsCents).toBe(20000);
    expect(payload.totalCreditsCents).toBe(20000);
  });

  it('should create balanced journal entry for IC only', () => {
    const payload = buildAccountingPayload(mockPayPeriod, [icPayLine]);
    
    expect(payload.isBalanced).toBe(true);
    expect(payload.totalDebitsCents).toBe(13200);
    expect(payload.totalCreditsCents).toBe(13200);
  });

  it('should create balanced journal for mixed W2 and IC', () => {
    const payload = buildAccountingPayload(mockPayPeriod, [w2PayLine, icPayLine]);
    
    expect(payload.isBalanced).toBe(true);
    expect(payload.totalDebitsCents).toBe(33200); // 20000 + 13200
    expect(payload.totalCreditsCents).toBe(33200);
    expect(payload.lines.length).toBe(4); // 2 debits + 2 credits
  });

  it('should use correct account codes for W2 drivers', () => {
    const payload = buildAccountingPayload(mockPayPeriod, [w2PayLine]);
    
    const debitLine = payload.lines.find(l => l.debitCents > 0);
    const creditLine = payload.lines.find(l => l.creditCents > 0);
    
    expect(debitLine?.accountCode).toBe(DEFAULT_ACCOUNT_MAPPING.w2PayrollExpense.code);
    expect(creditLine?.accountCode).toBe(DEFAULT_ACCOUNT_MAPPING.payrollLiability.code);
  });

  it('should use correct account codes for IC drivers', () => {
    const payload = buildAccountingPayload(mockPayPeriod, [icPayLine]);
    
    const debitLine = payload.lines.find(l => l.debitCents > 0);
    const creditLine = payload.lines.find(l => l.creditCents > 0);
    
    expect(debitLine?.accountCode).toBe(DEFAULT_ACCOUNT_MAPPING.icContractorExpense.code);
    expect(creditLine?.accountCode).toBe(DEFAULT_ACCOUNT_MAPPING.accountsPayable.code);
  });

  it('should include pay period dates in payload', () => {
    const payload = buildAccountingPayload(mockPayPeriod, [w2PayLine]);
    
    expect(payload.payPeriodId).toBe('pp-test-123');
    expect(payload.periodStart).toBe('2025-01-20');
    expect(payload.periodEnd).toBe('2025-01-26');
    expect(payload.entryDate).toBe('2025-01-26');
  });

  it('should include transaction reference', () => {
    const payload = buildAccountingPayload(mockPayPeriod, [w2PayLine]);
    
    expect(payload.transactionRef).toContain('PAY-');
    expect(payload.transactionRef).toContain('pp-test-123');
  });

  it('should include metadata with driver count', () => {
    const multipleW2Lines: PayLineRecord[] = [
      w2PayLine,
      { ...w2PayLine, id: 'pl-1b', finalPayCents: 15000 },
    ];
    
    const payload = buildAccountingPayload(mockPayPeriod, multipleW2Lines);
    
    expect(payload.metadata.driverCount).toBe(1); // Same driver d-1
    expect(payload.metadata.payLineCount).toBe(2);
  });

  it('should aggregate multiple pay lines per driver', () => {
    const multipleW2Lines: PayLineRecord[] = [
      w2PayLine, // 20000
      { ...w2PayLine, id: 'pl-1b', finalPayCents: 15000 }, // 15000
    ];
    
    const payload = buildAccountingPayload(mockPayPeriod, multipleW2Lines);
    
    expect(payload.totalDebitsCents).toBe(35000); // 20000 + 15000
  });

  it('should return empty journal for empty pay lines', () => {
    const payload = buildAccountingPayload(mockPayPeriod, []);
    
    expect(payload.lines.length).toBe(0);
    expect(payload.totalDebitsCents).toBe(0);
    expect(payload.totalCreditsCents).toBe(0);
    expect(payload.isBalanced).toBe(true); // 0 = 0
  });

  it('should track worker types in metadata', () => {
    const mixedPayload = buildAccountingPayload(mockPayPeriod, [w2PayLine, icPayLine]);
    
    expect(mixedPayload.metadata.workerTypes).toContain('W2_DRIVER');
    expect(mixedPayload.metadata.workerTypes).toContain('IC_DRIVER');
  });

  it('should accept custom account mapping', () => {
    const customMapping = {
      w2PayrollExpense: { code: '7100', name: 'Custom Wages' },
      icContractorExpense: { code: '7200', name: 'Custom Contractor' },
      payrollLiability: { code: '3100', name: 'Custom Payable' },
      accountsPayable: { code: '3000', name: 'Custom AP' },
    };
    
    const payload = buildAccountingPayload(mockPayPeriod, [w2PayLine], customMapping);
    
    const debitLine = payload.lines.find(l => l.debitCents > 0);
    expect(debitLine?.accountCode).toBe('7100');
    expect(debitLine?.accountName).toBe('Custom Wages');
  });
});

// ============================================
// validateJournalPayload TESTS
// ============================================

describe('validateJournalPayload', () => {
  it('should validate balanced journal as valid', () => {
    const payload = buildAccountingPayload(mockPayPeriod, [w2PayLine]);
    const result = validateJournalPayload(payload);
    
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should catch unbalanced journal', () => {
    const payload = buildAccountingPayload(mockPayPeriod, [w2PayLine]);
    // Manually unbalance
    payload.totalDebitsCents = 25000;
    payload.isBalanced = false;
    
    const result = validateJournalPayload(payload);
    
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('unbalanced'))).toBe(true);
  });

  it('should catch empty journal', () => {
    const payload = buildAccountingPayload(mockPayPeriod, []);
    const result = validateJournalPayload(payload);
    
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('no lines'))).toBe(true);
  });

  it('should catch missing account code', () => {
    const payload = buildAccountingPayload(mockPayPeriod, [w2PayLine]);
    payload.lines[0].accountCode = '';
    
    const result = validateJournalPayload(payload);
    
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('missing account code'))).toBe(true);
  });

  it('should catch zero amount lines', () => {
    const payload = buildAccountingPayload(mockPayPeriod, [w2PayLine]);
    payload.lines.push({
      accountCode: '9999',
      accountName: 'Test',
      debitCents: 0,
      creditCents: 0,
      memo: 'Zero line',
    });
    
    const result = validateJournalPayload(payload);
    
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('zero amount'))).toBe(true);
  });

  it('should catch lines with both debit and credit', () => {
    const payload = buildAccountingPayload(mockPayPeriod, [w2PayLine]);
    payload.lines[0].creditCents = 1000; // Add credit to debit line
    
    const result = validateJournalPayload(payload);
    
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('both debit and credit'))).toBe(true);
  });
});

// ============================================
// formatJournalSummary TESTS
// ============================================

describe('formatJournalSummary', () => {
  it('should include transaction reference', () => {
    const payload = buildAccountingPayload(mockPayPeriod, [w2PayLine]);
    const summary = formatJournalSummary(payload);
    
    expect(summary).toContain('Journal Entry:');
    expect(summary).toContain('PAY-');
  });

  it('should include period dates', () => {
    const payload = buildAccountingPayload(mockPayPeriod, [w2PayLine]);
    const summary = formatJournalSummary(payload);
    
    expect(summary).toContain('2025-01-20');
    expect(summary).toContain('2025-01-26');
  });

  it('should show debit and credit amounts', () => {
    const payload = buildAccountingPayload(mockPayPeriod, [w2PayLine]);
    const summary = formatJournalSummary(payload);
    
    expect(summary).toContain('DR $200.00');
    expect(summary).toContain('CR $200.00');
  });

  it('should show balanced status', () => {
    const payload = buildAccountingPayload(mockPayPeriod, [w2PayLine]);
    const summary = formatJournalSummary(payload);
    
    expect(summary).toContain('Balanced: Yes');
  });

  it('should show driver count', () => {
    const payload = buildAccountingPayload(mockPayPeriod, [w2PayLine, icPayLine]);
    const summary = formatJournalSummary(payload);
    
    expect(summary).toContain('Drivers: 2');
  });
});
