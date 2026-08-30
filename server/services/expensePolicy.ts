/**
 * Expense Policy Engine
 * 
 * Determines reimbursability based on expense and policy rules.
 */

import type { DriverExpenseCategory, EmployeeExpenseCategory, ExpenseType } from '@shared/schema';

// ============================================
// TYPES
// ============================================

/** Policy configuration for expense reimbursement */
export interface ExpensePolicy {
  /** Policy identifier */
  id: string;
  /** Policy name */
  name: string;
  /** Whether this policy is active */
  isActive: boolean;
  /** Allowed expense categories for reimbursement */
  allowedCategories: string[];
  /** Maximum amount per expense in cents (null = no limit) */
  maxAmountCents: number | null;
  /** Maximum amount per category per period in cents (null = no limit) */
  maxCategoryAmountCents: number | null;
  /** Require receipt for amounts over this threshold in cents (null = always require) */
  receiptRequiredThresholdCents: number | null;
  /** Whether pre-approval is required */
  requiresPreApproval: boolean;
  /** Expense types this policy applies to */
  appliesToExpenseTypes: ExpenseType[];
  /** Blocked merchant names or patterns */
  blockedMerchants: string[];
  /** Days after expense date that submission is allowed (null = no limit) */
  submissionWindowDays: number | null;
}

/** Expense record for reimbursability check */
export interface ExpenseForPolicy {
  /** Expense type: 'driver' or 'employee' */
  expenseType: ExpenseType;
  /** Expense category */
  category: string;
  /** Amount in cents */
  amountCents: number;
  /** Whether a receipt is attached */
  hasReceipt: boolean;
  /** Merchant/vendor name */
  merchantName?: string | null;
  /** Date of the expense */
  expenseDate: Date | string;
  /** Date of submission */
  submittedAt?: Date | string | null;
  /** Whether pre-approved */
  isPreApproved?: boolean;
}

/** Result of reimbursability check */
export interface ReimbursabilityResult {
  /** Whether the expense is reimbursable */
  isReimbursable: boolean;
  /** Reasons why not reimbursable (if applicable) */
  denialReasons: string[];
  /** Warnings that don't block reimbursement */
  warnings: string[];
}

// ============================================
// REIMBURSABILITY CHECK
// ============================================

/**
 * Determine if an expense is reimbursable under a given policy.
 * 
 * @param expense - The expense to check
 * @param policy - The policy to apply
 * @returns boolean - true if reimbursable
 */
export function isReimbursable(
  expense: ExpenseForPolicy,
  policy: ExpensePolicy
): boolean {
  const result = checkReimbursability(expense, policy);
  return result.isReimbursable;
}

/**
 * Perform detailed reimbursability check with reasons.
 * 
 * @param expense - The expense to check
 * @param policy - The policy to apply
 * @returns ReimbursabilityResult with detailed reasons
 */
export function checkReimbursability(
  expense: ExpenseForPolicy,
  policy: ExpensePolicy
): ReimbursabilityResult {
  const denialReasons: string[] = [];
  const warnings: string[] = [];

  // 1. Check if policy is active
  if (!policy.isActive) {
    denialReasons.push('Policy is not active');
    return { isReimbursable: false, denialReasons, warnings };
  }

  // 2. Check if expense type is covered by policy
  if (!policy.appliesToExpenseTypes.includes(expense.expenseType)) {
    denialReasons.push(`Policy does not cover ${expense.expenseType} expenses`);
  }

  // 3. Check if category is allowed
  if (!policy.allowedCategories.includes(expense.category)) {
    denialReasons.push(`Category '${expense.category}' is not reimbursable under this policy`);
  }

  // 4. Check maximum amount per expense
  if (policy.maxAmountCents !== null && expense.amountCents > policy.maxAmountCents) {
    denialReasons.push(
      `Amount $${(expense.amountCents / 100).toFixed(2)} exceeds maximum $${(policy.maxAmountCents / 100).toFixed(2)}`
    );
  }

  // 5. Check receipt requirement
  if (policy.receiptRequiredThresholdCents !== null) {
    if (expense.amountCents >= policy.receiptRequiredThresholdCents && !expense.hasReceipt) {
      denialReasons.push(
        `Receipt required for expenses $${(policy.receiptRequiredThresholdCents / 100).toFixed(2)} or more`
      );
    }
  } else if (!expense.hasReceipt) {
    // Always require receipt
    denialReasons.push('Receipt is required');
  }

  // 6. Check pre-approval requirement
  if (policy.requiresPreApproval && !expense.isPreApproved) {
    denialReasons.push('Pre-approval is required for this expense');
  }

  // 7. Check blocked merchants
  if (expense.merchantName && policy.blockedMerchants.length > 0) {
    const merchantLower = expense.merchantName.toLowerCase();
    const isBlocked = policy.blockedMerchants.some(blocked => 
      merchantLower.includes(blocked.toLowerCase())
    );
    if (isBlocked) {
      denialReasons.push(`Merchant '${expense.merchantName}' is blocked by policy`);
    }
  }

  // 8. Check submission window
  if (policy.submissionWindowDays !== null && expense.submittedAt) {
    const expenseDate = typeof expense.expenseDate === 'string' 
      ? new Date(expense.expenseDate) 
      : expense.expenseDate;
    const submittedAt = typeof expense.submittedAt === 'string'
      ? new Date(expense.submittedAt)
      : expense.submittedAt;
    
    const daysDiff = Math.floor(
      (submittedAt.getTime() - expenseDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysDiff > policy.submissionWindowDays) {
      denialReasons.push(
        `Expense submitted ${daysDiff} days after expense date; policy allows ${policy.submissionWindowDays} days`
      );
    }
  }

  return {
    isReimbursable: denialReasons.length === 0,
    denialReasons,
    warnings,
  };
}

// ============================================
// DEFAULT POLICY
// ============================================

/**
 * Create a default permissive policy for testing or fallback.
 */
export function createDefaultPolicy(): ExpensePolicy {
  return {
    id: 'default',
    name: 'Default Policy',
    isActive: true,
    allowedCategories: [
      // Driver categories
      'fuel', 'tolls', 'parking', 'meals', 'lodging', 'vehicle_maintenance',
      'supplies', 'equipment', 'uniform', 'communication', 'training', 'other',
      // Employee categories
      'office_supplies', 'software', 'travel', 'professional_development',
      'team_building', 'client_entertainment', 'home_office', 'health_wellness',
    ],
    maxAmountCents: null, // No limit
    maxCategoryAmountCents: null,
    receiptRequiredThresholdCents: 2500, // $25
    requiresPreApproval: false,
    appliesToExpenseTypes: ['driver', 'employee'],
    blockedMerchants: [],
    submissionWindowDays: 90,
  };
}
