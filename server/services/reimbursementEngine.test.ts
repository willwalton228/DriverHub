/**
 * Unit Tests for Reimbursement Engine (INCREMENT 5)
 */

import { describe, it, expect } from 'vitest';
import {
  checkReimbursementEligibility,
  isEligibleForReimbursement,
  findGLAccount,
  getReimbursementLiabilityAccount,
  normalizeExpensesToReimbursementLines,
  aggregateByGLAccount,
  aggregateByWorkerType,
  buildReimbursementJournalPayload,
  generateQBJournalCsv,
  generatePayloadHash,
  createReimbursementAuditEntry,
  checkIdempotency,
  generateExpenseSetHash,
  processExpensesForReimbursement,
  DEFAULT_REIMBURSEMENT_POLICY,
  DEFAULT_GL_MAPPINGS,
  type ApprovedExpense,
  type ReimbursementPolicy,
  type ReimbursementLine,
  type ReimbursementAuditEntry,
} from './reimbursementEngine';

// ============================================
// TEST DATA
// ============================================

const mockDriverExpense: ApprovedExpense = {
  id: 'exp-001',
  expenseType: 'driver',
  category: 'fuel',
  amountCents: 5000,
  description: 'Fuel for delivery route',
  expenseDate: '2026-01-20',
  approvedAt: '2026-01-21T10:00:00Z',
  approvedBy: 'manager-1',
  submitterId: 'driver-1',
  workerType: 'W2_DRIVER',
  tripId: 'trip-123',
};

const mockEmployeeExpense: ApprovedExpense = {
  id: 'exp-002',
  expenseType: 'employee',
  category: 'office_supplies',
  amountCents: 2500,
  description: 'Office supplies for home office',
  expenseDate: '2026-01-19',
  approvedAt: '2026-01-20T14:00:00Z',
  approvedBy: 'manager-2',
  submitterId: 'emp-1',
  workerType: 'CORP_EMPLOYEE',
};

const mockICExpense: ApprovedExpense = {
  id: 'exp-003',
  expenseType: 'driver',
  category: 'tolls',
  amountCents: 1500,
  description: 'Highway tolls',
  expenseDate: '2026-01-18',
  approvedAt: '2026-01-19T09:00:00Z',
  approvedBy: 'manager-1',
  submitterId: 'ic-driver-1',
  workerType: 'IC_DRIVER',
};

// ============================================
// 1. ELIGIBILITY TESTS
// ============================================

describe('checkReimbursementEligibility', () => {
  it('should return eligible for valid expense with default policy', () => {
    const result = checkReimbursementEligibility(mockDriverExpense);
    expect(result.isEligible).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('should reject W2 driver when policy disallows', () => {
    const policy: ReimbursementPolicy = {
      ...DEFAULT_REIMBURSEMENT_POLICY,
      allowW2DriverReimbursement: false,
    };
    const result = checkReimbursementEligibility(mockDriverExpense, policy);
    expect(result.isEligible).toBe(false);
    expect(result.reasons.some(r => r.includes('W2'))).toBe(true);
  });

  it('should reject IC driver when policy disallows', () => {
    const policy: ReimbursementPolicy = {
      ...DEFAULT_REIMBURSEMENT_POLICY,
      allowICDriverReimbursement: false,
    };
    const result = checkReimbursementEligibility(mockICExpense, policy);
    expect(result.isEligible).toBe(false);
    expect(result.reasons.some(r => r.includes('IC'))).toBe(true);
  });

  it('should reject corp employee when policy disallows', () => {
    const policy: ReimbursementPolicy = {
      ...DEFAULT_REIMBURSEMENT_POLICY,
      allowCorpEmployeeReimbursement: false,
    };
    const result = checkReimbursementEligibility(mockEmployeeExpense, policy);
    expect(result.isEligible).toBe(false);
    expect(result.reasons.some(r => r.includes('Corporate'))).toBe(true);
  });

  it('should reject excluded categories', () => {
    const policy: ReimbursementPolicy = {
      ...DEFAULT_REIMBURSEMENT_POLICY,
      excludedCategories: ['fuel'],
    };
    const result = checkReimbursementEligibility(mockDriverExpense, policy);
    expect(result.isEligible).toBe(false);
    expect(result.reasons.some(r => r.includes('excluded'))).toBe(true);
  });

  it('should reject expense below minimum amount', () => {
    const policy: ReimbursementPolicy = {
      ...DEFAULT_REIMBURSEMENT_POLICY,
      minimumAmountCents: 10000, // $100 minimum
    };
    const result = checkReimbursementEligibility(mockDriverExpense, policy);
    expect(result.isEligible).toBe(false);
    expect(result.reasons.some(r => r.includes('below minimum'))).toBe(true);
  });

  it('should reject expired expenses', () => {
    const policy: ReimbursementPolicy = {
      ...DEFAULT_REIMBURSEMENT_POLICY,
      maxExpenseAgeDays: 7,
    };
    // Check against a date far in the future
    const futureDate = new Date('2026-03-01');
    const result = checkReimbursementEligibility(mockDriverExpense, policy, futureDate);
    expect(result.isEligible).toBe(false);
    expect(result.reasons.some(r => r.includes('days old'))).toBe(true);
  });
});

describe('isEligibleForReimbursement', () => {
  it('should return true for eligible expense', () => {
    expect(isEligibleForReimbursement(mockDriverExpense)).toBe(true);
  });

  it('should return false for ineligible expense', () => {
    const policy: ReimbursementPolicy = {
      ...DEFAULT_REIMBURSEMENT_POLICY,
      allowW2DriverReimbursement: false,
    };
    expect(isEligibleForReimbursement(mockDriverExpense, policy)).toBe(false);
  });
});

// ============================================
// 2. GL ACCOUNT MAPPING TESTS
// ============================================

describe('findGLAccount', () => {
  it('should find correct account for driver fuel expense', () => {
    const account = findGLAccount('driver', 'fuel');
    expect(account.code).toBe('6310');
    expect(account.name).toBe('Driver Fuel Expense');
  });

  it('should find correct account for driver tolls', () => {
    const account = findGLAccount('driver', 'tolls');
    expect(account.code).toBe('6320');
  });

  it('should find correct account for employee office supplies', () => {
    const account = findGLAccount('employee', 'office_supplies');
    expect(account.code).toBe('6410');
  });

  it('should fallback to other category for unknown category', () => {
    const account = findGLAccount('driver', 'unknown_category');
    expect(account.code).toBe('6390'); // Driver Other Expense
  });

  it('should return misc expense for completely unknown type', () => {
    const account = findGLAccount('unknown' as any, 'unknown');
    expect(account.code).toBe('6999');
  });
});

describe('getReimbursementLiabilityAccount', () => {
  it('should return correct account for W2 driver', () => {
    const account = getReimbursementLiabilityAccount('W2_DRIVER');
    expect(account.code).toBe('2110');
  });

  it('should return correct account for IC driver', () => {
    const account = getReimbursementLiabilityAccount('IC_DRIVER');
    expect(account.code).toBe('2120');
  });

  it('should return correct account for corp employee', () => {
    const account = getReimbursementLiabilityAccount('CORP_EMPLOYEE');
    expect(account.code).toBe('2130');
  });
});

// ============================================
// 3. NORMALIZATION TESTS
// ============================================

describe('normalizeExpensesToReimbursementLines', () => {
  it('should create reimbursement lines from approved expenses', () => {
    const { lines, skipped } = normalizeExpensesToReimbursementLines(
      [mockDriverExpense],
      'pp-001'
    );
    
    expect(lines).toHaveLength(1);
    expect(skipped).toHaveLength(0);
    expect(lines[0].expenseId).toBe('exp-001');
    expect(lines[0].payPeriodId).toBe('pp-001');
    expect(lines[0].glAccountCode).toBe('6310');
  });

  it('should skip ineligible expenses', () => {
    const policy: ReimbursementPolicy = {
      ...DEFAULT_REIMBURSEMENT_POLICY,
      allowW2DriverReimbursement: false,
    };
    
    const { lines, skipped } = normalizeExpensesToReimbursementLines(
      [mockDriverExpense],
      'pp-001',
      policy
    );
    
    expect(lines).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].expense.id).toBe('exp-001');
    expect(skipped[0].reasons.length).toBeGreaterThan(0);
  });

  it('should process multiple expenses of different types', () => {
    const { lines, skipped } = normalizeExpensesToReimbursementLines(
      [mockDriverExpense, mockEmployeeExpense, mockICExpense],
      'pp-001'
    );
    
    expect(lines).toHaveLength(3);
    expect(skipped).toHaveLength(0);
  });

  it('should assign correct GL account to each line', () => {
    const { lines } = normalizeExpensesToReimbursementLines(
      [mockDriverExpense, mockEmployeeExpense],
      'pp-001'
    );
    
    const fuelLine = lines.find(l => l.expenseId === 'exp-001');
    const suppliesLine = lines.find(l => l.expenseId === 'exp-002');
    
    expect(fuelLine?.glAccountCode).toBe('6310');
    expect(suppliesLine?.glAccountCode).toBe('6410');
  });
});

// ============================================
// 4. AGGREGATION TESTS
// ============================================

describe('aggregateByGLAccount', () => {
  it('should aggregate lines by GL account', () => {
    const lines: ReimbursementLine[] = [
      { ...createMockLine('l1', 'exp-1', '6310', 5000) },
      { ...createMockLine('l2', 'exp-2', '6310', 3000) },
      { ...createMockLine('l3', 'exp-3', '6320', 1500) },
    ];
    
    const aggregates = aggregateByGLAccount(lines);
    
    expect(aggregates).toHaveLength(2);
    
    const fuelAgg = aggregates.find(a => a.accountCode === '6310');
    expect(fuelAgg?.totalCents).toBe(8000);
    expect(fuelAgg?.lineCount).toBe(2);
    
    const tollsAgg = aggregates.find(a => a.accountCode === '6320');
    expect(tollsAgg?.totalCents).toBe(1500);
    expect(tollsAgg?.lineCount).toBe(1);
  });

  it('should return empty array for no lines', () => {
    const aggregates = aggregateByGLAccount([]);
    expect(aggregates).toHaveLength(0);
  });
});

describe('aggregateByWorkerType', () => {
  it('should aggregate lines by worker type', () => {
    const lines: ReimbursementLine[] = [
      { ...createMockLine('l1', 'exp-1', '6310', 5000, 'W2_DRIVER', 'd1') },
      { ...createMockLine('l2', 'exp-2', '6310', 3000, 'W2_DRIVER', 'd2') },
      { ...createMockLine('l3', 'exp-3', '6320', 1500, 'IC_DRIVER', 'ic1') },
    ];
    
    const aggregates = aggregateByWorkerType(lines);
    
    expect(aggregates).toHaveLength(2);
    
    const w2Agg = aggregates.find(a => a.workerType === 'W2_DRIVER');
    expect(w2Agg?.totalCents).toBe(8000);
    expect(w2Agg?.submitterCount).toBe(2);
    
    const icAgg = aggregates.find(a => a.workerType === 'IC_DRIVER');
    expect(icAgg?.totalCents).toBe(1500);
    expect(icAgg?.submitterCount).toBe(1);
  });
});

// ============================================
// 5. JOURNAL PAYLOAD TESTS
// ============================================

describe('buildReimbursementJournalPayload', () => {
  const testLines: ReimbursementLine[] = [
    { ...createMockLine('l1', 'exp-1', '6310', 5000, 'W2_DRIVER', 'd1') },
    { ...createMockLine('l2', 'exp-2', '6320', 1500, 'IC_DRIVER', 'ic1') },
  ];

  it('should create balanced journal payload', () => {
    const payload = buildReimbursementJournalPayload(
      testLines, 'pp-001', '2025-01-20', '2025-01-26'
    );
    
    expect(payload.isBalanced).toBe(true);
    expect(payload.totalDebitsCents).toBe(6500);
    expect(payload.totalCreditsCents).toBe(6500);
  });

  it('should have debit lines for expense accounts', () => {
    const payload = buildReimbursementJournalPayload(
      testLines, 'pp-001', '2025-01-20', '2025-01-26'
    );
    
    const debitLines = payload.lines.filter(l => l.debitCents > 0);
    expect(debitLines.length).toBe(2); // 6310 and 6320
    expect(debitLines.every(l => l.creditCents === 0)).toBe(true);
  });

  it('should have credit lines for liability accounts', () => {
    const payload = buildReimbursementJournalPayload(
      testLines, 'pp-001', '2025-01-20', '2025-01-26'
    );
    
    const creditLines = payload.lines.filter(l => l.creditCents > 0);
    expect(creditLines.length).toBe(2); // 2110 and 2120
    expect(creditLines.every(l => l.debitCents === 0)).toBe(true);
  });

  it('should include metadata with counts', () => {
    const payload = buildReimbursementJournalPayload(
      testLines, 'pp-001', '2025-01-20', '2025-01-26'
    );
    
    expect(payload.metadata.reimbursementLineCount).toBe(2);
    expect(payload.metadata.workerTypes).toContain('W2_DRIVER');
    expect(payload.metadata.workerTypes).toContain('IC_DRIVER');
  });

  it('should handle empty lines gracefully', () => {
    const payload = buildReimbursementJournalPayload(
      [], 'pp-001', '2025-01-20', '2025-01-26'
    );
    
    expect(payload.isBalanced).toBe(true);
    expect(payload.totalDebitsCents).toBe(0);
    expect(payload.lines).toHaveLength(0);
  });
});

// ============================================
// 6. CSV EXPORT TESTS
// ============================================

describe('generateQBJournalCsv', () => {
  it('should generate CSV with headers', () => {
    const payload = buildReimbursementJournalPayload(
      [createMockLine('l1', 'exp-1', '6310', 5000, 'W2_DRIVER', 'd1')],
      'pp-001', '2025-01-20', '2025-01-26'
    );
    
    const csv = generateQBJournalCsv(payload);
    const lines = csv.split('\n');
    
    expect(lines[0]).toContain('TransactionRef');
    expect(lines[0]).toContain('AccountCode');
    expect(lines[0]).toContain('Debit');
    expect(lines[0]).toContain('Credit');
  });

  it('should format amounts correctly', () => {
    const payload = buildReimbursementJournalPayload(
      [createMockLine('l1', 'exp-1', '6310', 5000, 'W2_DRIVER', 'd1')],
      'pp-001', '2025-01-20', '2025-01-26'
    );
    
    const csv = generateQBJournalCsv(payload);
    
    expect(csv).toContain('50.00'); // $50.00
  });

  it('should include transaction reference', () => {
    const payload = buildReimbursementJournalPayload(
      [createMockLine('l1', 'exp-1', '6310', 5000, 'W2_DRIVER', 'd1')],
      'pp-001', '2025-01-20', '2025-01-26'
    );
    
    const csv = generateQBJournalCsv(payload);
    
    expect(csv).toContain('REIMB-pp-001');
  });
});

// ============================================
// 7. AUDIT ENTRY TESTS
// ============================================

describe('generatePayloadHash', () => {
  it('should generate consistent hash for same content', () => {
    const hash1 = generatePayloadHash('test content');
    const hash2 = generatePayloadHash('test content');
    expect(hash1).toBe(hash2);
  });

  it('should generate different hash for different content', () => {
    const hash1 = generatePayloadHash('content A');
    const hash2 = generatePayloadHash('content B');
    expect(hash1).not.toBe(hash2);
  });

  it('should return 64-character hex string', () => {
    const hash = generatePayloadHash('test');
    expect(hash.length).toBe(64);
    expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
  });
});

describe('createReimbursementAuditEntry', () => {
  it('should create audit entry with all required fields', () => {
    const lines = [createMockLine('l1', 'exp-1', '6310', 5000, 'W2_DRIVER', 'd1')];
    const payload = buildReimbursementJournalPayload(lines, 'pp-001', '2025-01-20', '2025-01-26');
    const csv = generateQBJournalCsv(payload);
    
    const audit = createReimbursementAuditEntry('pp-001', lines, payload, csv, 'user-1');
    
    expect(audit.payPeriodId).toBe('pp-001');
    expect(audit.processedBy).toBe('user-1');
    expect(audit.payloadHash.length).toBe(64);
    expect(audit.totalAmountCents).toBe(5000);
    expect(audit.lineCount).toBe(1);
    expect(audit.expenseIds).toContain('exp-1');
  });

  it('should include JSON and CSV payloads', () => {
    const lines = [createMockLine('l1', 'exp-1', '6310', 5000, 'W2_DRIVER', 'd1')];
    const payload = buildReimbursementJournalPayload(lines, 'pp-001', '2025-01-20', '2025-01-26');
    const csv = generateQBJournalCsv(payload);
    
    const audit = createReimbursementAuditEntry('pp-001', lines, payload, csv, 'user-1');
    
    expect(audit.journalPayloadJson).toContain('pp-001');
    expect(audit.csvPayload).toContain('TransactionRef');
  });
});

// ============================================
// 8. IDEMPOTENCY TESTS
// ============================================

describe('checkIdempotency', () => {
  const existingAudit: ReimbursementAuditEntry = {
    id: 'audit-1',
    payPeriodId: 'pp-001',
    processedAt: '2025-01-21T12:00:00Z',
    processedBy: 'user-1',
    payloadHash: 'abc123',
    totalAmountCents: 5000,
    lineCount: 2,
    expenseIds: ['exp-001', 'exp-002'],
    journalPayloadJson: '{}',
    csvPayload: '',
  };

  it('should detect duplicate expense set', () => {
    const result = checkIdempotency(['exp-001', 'exp-002'], [existingAudit]);
    
    expect(result.isDuplicate).toBe(true);
    expect(result.existingEntryId).toBe('audit-1');
  });

  it('should detect duplicate regardless of order', () => {
    const result = checkIdempotency(['exp-002', 'exp-001'], [existingAudit]);
    
    expect(result.isDuplicate).toBe(true);
  });

  it('should not flag different expense set as duplicate', () => {
    const result = checkIdempotency(['exp-003', 'exp-004'], [existingAudit]);
    
    expect(result.isDuplicate).toBe(false);
    expect(result.existingEntryId).toBeNull();
  });

  it('should not flag subset as duplicate', () => {
    const result = checkIdempotency(['exp-001'], [existingAudit]);
    
    expect(result.isDuplicate).toBe(false);
  });
});

describe('generateExpenseSetHash', () => {
  it('should generate same hash regardless of order', () => {
    const hash1 = generateExpenseSetHash(['exp-001', 'exp-002']);
    const hash2 = generateExpenseSetHash(['exp-002', 'exp-001']);
    
    expect(hash1).toBe(hash2);
  });

  it('should generate different hash for different sets', () => {
    const hash1 = generateExpenseSetHash(['exp-001', 'exp-002']);
    const hash2 = generateExpenseSetHash(['exp-001', 'exp-003']);
    
    expect(hash1).not.toBe(hash2);
  });
});

// ============================================
// 9. COMPLETE PROCESSING TESTS
// ============================================

describe('processExpensesForReimbursement', () => {
  it('should process expenses end-to-end', () => {
    const result = processExpensesForReimbursement(
      [mockDriverExpense, mockEmployeeExpense],
      'pp-001',
      '2025-01-20',
      '2025-01-26',
      'user-1'
    );
    
    expect(result.success).toBe(true);
    expect(result.reimbursementLines).toHaveLength(2);
    expect(result.journalPayload.isBalanced).toBe(true);
    expect(result.csvPayload).toContain('TransactionRef');
    expect(result.auditEntry.lineCount).toBe(2);
  });

  it('should skip ineligible expenses while processing eligible ones', () => {
    const policy: ReimbursementPolicy = {
      ...DEFAULT_REIMBURSEMENT_POLICY,
      allowW2DriverReimbursement: false,
    };
    
    const result = processExpensesForReimbursement(
      [mockDriverExpense, mockEmployeeExpense],
      'pp-001',
      '2025-01-20',
      '2025-01-26',
      'user-1',
      policy
    );
    
    expect(result.success).toBe(true);
    expect(result.reimbursementLines).toHaveLength(1);
    expect(result.skippedExpenses).toHaveLength(1);
    expect(result.skippedExpenses[0].expense.id).toBe('exp-001');
  });

  it('should detect duplicate processing', () => {
    const existingAudit: ReimbursementAuditEntry = {
      id: 'audit-existing',
      payPeriodId: 'pp-001',
      processedAt: '2025-01-21T12:00:00Z',
      processedBy: 'user-1',
      payloadHash: 'abc123',
      totalAmountCents: 5000,
      lineCount: 1,
      expenseIds: ['exp-001'],
      journalPayloadJson: '{}',
      csvPayload: '',
    };
    
    const result = processExpensesForReimbursement(
      [mockDriverExpense],
      'pp-001',
      '2025-01-20',
      '2025-01-26',
      'user-1',
      DEFAULT_REIMBURSEMENT_POLICY,
      DEFAULT_GL_MAPPINGS,
      [existingAudit]
    );
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Duplicate');
  });

  it('should handle empty expense list', () => {
    const result = processExpensesForReimbursement(
      [],
      'pp-001',
      '2025-01-20',
      '2025-01-26',
      'user-1'
    );
    
    expect(result.success).toBe(true);
    expect(result.reimbursementLines).toHaveLength(0);
    expect(result.journalPayload.isBalanced).toBe(true);
  });

  it('should create balanced journal with mixed worker types', () => {
    const result = processExpensesForReimbursement(
      [mockDriverExpense, mockEmployeeExpense, mockICExpense],
      'pp-001',
      '2025-01-20',
      '2025-01-26',
      'user-1'
    );
    
    expect(result.success).toBe(true);
    expect(result.journalPayload.isBalanced).toBe(true);
    expect(result.journalPayload.metadata.workerTypes).toHaveLength(3);
  });
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function createMockLine(
  id: string,
  expenseId: string,
  glCode: string,
  amountCents: number,
  workerType: 'W2_DRIVER' | 'IC_DRIVER' | 'CORP_EMPLOYEE' = 'W2_DRIVER',
  submitterId: string = 'submitter-1'
): ReimbursementLine {
  return {
    id,
    expenseId,
    payPeriodId: 'pp-001',
    submitterId,
    workerType,
    expenseType: 'driver',
    category: 'fuel',
    amountCents,
    description: 'Test expense',
    glAccountCode: glCode,
    glAccountName: 'Test Account',
    expenseDate: '2025-01-20',
    approvedAt: '2025-01-21T10:00:00Z',
    createdAt: new Date().toISOString(),
  };
}
