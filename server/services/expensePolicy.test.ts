/**
 * Unit Tests for Expense Policy Engine
 */

import { describe, it, expect } from 'vitest';
import {
  isReimbursable,
  checkReimbursability,
  createDefaultPolicy,
  type ExpensePolicy,
  type ExpenseForPolicy,
} from './expensePolicy';

// ============================================
// TEST DATA
// ============================================

const defaultPolicy = createDefaultPolicy();

const validDriverExpense: ExpenseForPolicy = {
  expenseType: 'driver',
  category: 'fuel',
  amountCents: 5000, // $50
  hasReceipt: true,
  merchantName: 'Shell Gas Station',
  expenseDate: new Date('2025-01-20'),
  submittedAt: new Date('2025-01-21'),
  isPreApproved: false,
};

// ============================================
// isReimbursable TESTS
// ============================================

describe('isReimbursable', () => {
  it('should return true for valid expense under default policy', () => {
    expect(isReimbursable(validDriverExpense, defaultPolicy)).toBe(true);
  });

  it('should return false when policy is inactive', () => {
    const inactivePolicy: ExpensePolicy = {
      ...defaultPolicy,
      isActive: false,
    };
    expect(isReimbursable(validDriverExpense, inactivePolicy)).toBe(false);
  });

  it('should return false for disallowed category', () => {
    const restrictivePolicy: ExpensePolicy = {
      ...defaultPolicy,
      allowedCategories: ['tolls', 'parking'], // fuel not included
    };
    expect(isReimbursable(validDriverExpense, restrictivePolicy)).toBe(false);
  });

  it('should return false when amount exceeds maximum', () => {
    const capPolicy: ExpensePolicy = {
      ...defaultPolicy,
      maxAmountCents: 2500, // $25 max
    };
    expect(isReimbursable(validDriverExpense, capPolicy)).toBe(false);
  });

  it('should return true when amount is at maximum', () => {
    const capPolicy: ExpensePolicy = {
      ...defaultPolicy,
      maxAmountCents: 5000, // $50 max (exactly matches expense)
    };
    expect(isReimbursable(validDriverExpense, capPolicy)).toBe(true);
  });

  it('should return false when receipt required but missing', () => {
    const noReceiptExpense: ExpenseForPolicy = {
      ...validDriverExpense,
      hasReceipt: false,
    };
    expect(isReimbursable(noReceiptExpense, defaultPolicy)).toBe(false);
  });

  it('should return true when receipt not required for small amounts', () => {
    const smallExpense: ExpenseForPolicy = {
      ...validDriverExpense,
      amountCents: 1000, // $10 - below $25 threshold
      hasReceipt: false,
    };
    expect(isReimbursable(smallExpense, defaultPolicy)).toBe(true);
  });

  it('should return false when pre-approval required but missing', () => {
    const preApprovalPolicy: ExpensePolicy = {
      ...defaultPolicy,
      requiresPreApproval: true,
    };
    expect(isReimbursable(validDriverExpense, preApprovalPolicy)).toBe(false);
  });

  it('should return true when pre-approval required and provided', () => {
    const preApprovalPolicy: ExpensePolicy = {
      ...defaultPolicy,
      requiresPreApproval: true,
    };
    const approvedExpense: ExpenseForPolicy = {
      ...validDriverExpense,
      isPreApproved: true,
    };
    expect(isReimbursable(approvedExpense, preApprovalPolicy)).toBe(true);
  });

  it('should return false for blocked merchant', () => {
    const blockedMerchantPolicy: ExpensePolicy = {
      ...defaultPolicy,
      blockedMerchants: ['casino', 'liquor', 'shell'],
    };
    expect(isReimbursable(validDriverExpense, blockedMerchantPolicy)).toBe(false);
  });

  it('should return false when submitted outside window', () => {
    const strictWindowPolicy: ExpensePolicy = {
      ...defaultPolicy,
      submissionWindowDays: 7,
    };
    const lateExpense: ExpenseForPolicy = {
      ...validDriverExpense,
      expenseDate: new Date('2025-01-01'),
      submittedAt: new Date('2025-01-20'), // 19 days later
    };
    expect(isReimbursable(lateExpense, strictWindowPolicy)).toBe(false);
  });

  it('should return true when submitted within window', () => {
    const strictWindowPolicy: ExpensePolicy = {
      ...defaultPolicy,
      submissionWindowDays: 7,
    };
    const timelyExpense: ExpenseForPolicy = {
      ...validDriverExpense,
      expenseDate: new Date('2025-01-15'),
      submittedAt: new Date('2025-01-20'), // 5 days later
    };
    expect(isReimbursable(timelyExpense, strictWindowPolicy)).toBe(true);
  });

  it('should return false for wrong expense type', () => {
    const driverOnlyPolicy: ExpensePolicy = {
      ...defaultPolicy,
      appliesToExpenseTypes: ['driver'],
    };
    const employeeExpense: ExpenseForPolicy = {
      ...validDriverExpense,
      expenseType: 'employee',
      category: 'office_supplies',
    };
    expect(isReimbursable(employeeExpense, driverOnlyPolicy)).toBe(false);
  });
});

// ============================================
// checkReimbursability TESTS
// ============================================

describe('checkReimbursability', () => {
  it('should return empty denialReasons for valid expense', () => {
    const result = checkReimbursability(validDriverExpense, defaultPolicy);
    expect(result.isReimbursable).toBe(true);
    expect(result.denialReasons).toHaveLength(0);
  });

  it('should return multiple denial reasons when applicable', () => {
    const restrictivePolicy: ExpensePolicy = {
      ...defaultPolicy,
      allowedCategories: ['tolls'],
      maxAmountCents: 2000,
      requiresPreApproval: true,
    };
    
    const result = checkReimbursability(validDriverExpense, restrictivePolicy);
    
    expect(result.isReimbursable).toBe(false);
    expect(result.denialReasons.length).toBeGreaterThan(1);
    expect(result.denialReasons.some(r => r.includes('Category') || r.includes('category'))).toBe(true);
    expect(result.denialReasons.some(r => r.includes('exceeds') || r.includes('maximum'))).toBe(true);
    expect(result.denialReasons.some(r => r.includes('Pre-approval') || r.includes('pre-approval'))).toBe(true);
  });

  it('should provide specific denial reason for blocked merchant', () => {
    const blockedPolicy: ExpensePolicy = {
      ...defaultPolicy,
      blockedMerchants: ['Shell'],
    };
    
    const result = checkReimbursability(validDriverExpense, blockedPolicy);
    
    expect(result.isReimbursable).toBe(false);
    expect(result.denialReasons.some(r => r.includes('blocked'))).toBe(true);
    expect(result.denialReasons.some(r => r.includes('Shell'))).toBe(true);
  });

  it('should handle string dates correctly', () => {
    const expenseWithStringDates: ExpenseForPolicy = {
      ...validDriverExpense,
      expenseDate: '2025-01-15',
      submittedAt: '2025-01-20',
    };
    
    const result = checkReimbursability(expenseWithStringDates, defaultPolicy);
    expect(result.isReimbursable).toBe(true);
  });
});

// ============================================
// createDefaultPolicy TESTS
// ============================================

describe('createDefaultPolicy', () => {
  it('should return an active policy', () => {
    const policy = createDefaultPolicy();
    expect(policy.isActive).toBe(true);
  });

  it('should include common driver expense categories', () => {
    const policy = createDefaultPolicy();
    expect(policy.allowedCategories).toContain('fuel');
    expect(policy.allowedCategories).toContain('tolls');
    expect(policy.allowedCategories).toContain('meals');
  });

  it('should include common employee expense categories', () => {
    const policy = createDefaultPolicy();
    expect(policy.allowedCategories).toContain('office_supplies');
    expect(policy.allowedCategories).toContain('travel');
    expect(policy.allowedCategories).toContain('software');
  });

  it('should apply to both driver and employee expense types', () => {
    const policy = createDefaultPolicy();
    expect(policy.appliesToExpenseTypes).toContain('driver');
    expect(policy.appliesToExpenseTypes).toContain('employee');
  });

  it('should have reasonable receipt threshold', () => {
    const policy = createDefaultPolicy();
    expect(policy.receiptRequiredThresholdCents).toBe(2500); // $25
  });

  it('should have reasonable submission window', () => {
    const policy = createDefaultPolicy();
    expect(policy.submissionWindowDays).toBe(90);
  });
});
