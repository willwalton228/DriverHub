/**
 * Reimbursement Engine (INCREMENT 5)
 * 
 * Normalizes approved expenses into reimbursement lines tied to pay periods,
 * enforces eligibility, creates accounting mappings, and generates journal payloads.
 */

import { createHash } from 'crypto';
import type { ExpenseType, DriverExpenseCategory, EmployeeExpenseCategory } from '@shared/schema';

// ============================================
// TYPES
// ============================================

/** Worker classification for reimbursement eligibility */
export type ReimbursableWorkerType = 'W2_DRIVER' | 'IC_DRIVER' | 'CORP_EMPLOYEE';

/** Approved expense ready for reimbursement processing */
export interface ApprovedExpense {
  id: string;
  expenseType: ExpenseType;
  category: string;
  amountCents: number;
  description: string;
  expenseDate: string; // ISO date
  approvedAt: string; // ISO datetime
  approvedBy: string;
  /** Driver or employee ID */
  submitterId: string;
  /** Worker type of the submitter */
  workerType: ReimbursableWorkerType;
  /** Customer/account if applicable */
  customerId?: string | null;
  /** Trip/move if applicable */
  tripId?: string | null;
}

/** Reimbursement line tied to a pay period */
export interface ReimbursementLine {
  id: string;
  expenseId: string;
  payPeriodId: string;
  submitterId: string;
  workerType: ReimbursableWorkerType;
  expenseType: ExpenseType;
  category: string;
  amountCents: number;
  description: string;
  glAccountCode: string;
  glAccountName: string;
  expenseDate: string;
  approvedAt: string;
  createdAt: string;
}

/** Policy flags for reimbursement eligibility */
export interface ReimbursementPolicy {
  /** Whether W2 drivers can receive expense reimbursements */
  allowW2DriverReimbursement: boolean;
  /** Whether IC drivers can receive expense reimbursements */
  allowICDriverReimbursement: boolean;
  /** Whether corp employees can receive expense reimbursements */
  allowCorpEmployeeReimbursement: boolean;
  /** Categories excluded from reimbursement */
  excludedCategories: string[];
  /** Minimum amount in cents for reimbursement */
  minimumAmountCents: number;
  /** Maximum age in days for expense to be reimbursable */
  maxExpenseAgeDays: number | null;
}

/** GL Account mapping for expense categories */
export interface GLAccountMapping {
  code: string;
  name: string;
  expenseTypes: ExpenseType[];
  categories: string[];
}

/** Journal line for accounting payload */
export interface ReimbursementJournalLine {
  accountCode: string;
  accountName: string;
  debitCents: number;
  creditCents: number;
  memo: string;
  submitterId?: string;
  expenseCategory?: string;
}

/** Complete journal payload for QuickBooks import */
export interface ReimbursementJournalPayload {
  transactionRef: string;
  entryDate: string;
  payPeriodId: string;
  periodStart: string;
  periodEnd: string;
  memo: string;
  lines: ReimbursementJournalLine[];
  totalDebitsCents: number;
  totalCreditsCents: number;
  isBalanced: boolean;
  metadata: {
    generatedAt: string;
    expenseCount: number;
    reimbursementLineCount: number;
    workerTypes: ReimbursableWorkerType[];
    totalReimbursementCents: number;
  };
}

/** Audit entry for reimbursement processing */
export interface ReimbursementAuditEntry {
  id: string;
  payPeriodId: string;
  processedAt: string;
  processedBy: string;
  payloadHash: string;
  totalAmountCents: number;
  lineCount: number;
  expenseIds: string[];
  journalPayloadJson: string;
  csvPayload: string;
}

/** Eligibility check result */
export interface EligibilityResult {
  isEligible: boolean;
  reasons: string[];
}

// ============================================
// DEFAULT CONFIGURATIONS
// ============================================

/** Default reimbursement policy */
export const DEFAULT_REIMBURSEMENT_POLICY: ReimbursementPolicy = {
  allowW2DriverReimbursement: true,
  allowICDriverReimbursement: true,
  allowCorpEmployeeReimbursement: true,
  excludedCategories: [],
  minimumAmountCents: 100, // $1 minimum
  maxExpenseAgeDays: 90,
};

/** Default GL account mappings by expense type and category */
export const DEFAULT_GL_MAPPINGS: GLAccountMapping[] = [
  // Driver expense accounts
  { code: '6310', name: 'Driver Fuel Expense', expenseTypes: ['driver'], categories: ['fuel'] },
  { code: '6320', name: 'Driver Tolls & Parking', expenseTypes: ['driver'], categories: ['tolls', 'parking'] },
  { code: '6330', name: 'Driver Meals & Lodging', expenseTypes: ['driver'], categories: ['meals', 'lodging'] },
  { code: '6340', name: 'Driver Vehicle Maintenance', expenseTypes: ['driver'], categories: ['vehicle_maintenance'] },
  { code: '6350', name: 'Driver Supplies & Equipment', expenseTypes: ['driver'], categories: ['supplies', 'equipment', 'uniform'] },
  { code: '6360', name: 'Driver Communication & Training', expenseTypes: ['driver'], categories: ['communication', 'training'] },
  { code: '6390', name: 'Driver Other Expense', expenseTypes: ['driver'], categories: ['other'] },
  
  // Employee expense accounts
  { code: '6410', name: 'Office Supplies Expense', expenseTypes: ['employee'], categories: ['office_supplies'] },
  { code: '6420', name: 'Software & Subscriptions', expenseTypes: ['employee'], categories: ['software'] },
  { code: '6430', name: 'Employee Travel Expense', expenseTypes: ['employee'], categories: ['travel', 'meals', 'lodging'] },
  { code: '6440', name: 'Professional Development', expenseTypes: ['employee'], categories: ['professional_development', 'training'] },
  { code: '6450', name: 'Team Building & Entertainment', expenseTypes: ['employee'], categories: ['team_building', 'client_entertainment'] },
  { code: '6460', name: 'Home Office Expense', expenseTypes: ['employee'], categories: ['home_office'] },
  { code: '6470', name: 'Health & Wellness', expenseTypes: ['employee'], categories: ['health_wellness'] },
  { code: '6490', name: 'Employee Other Expense', expenseTypes: ['employee'], categories: ['other'] },
];

/** Liability accounts for reimbursements */
export const REIMBURSEMENT_LIABILITY_ACCOUNTS = {
  w2Driver: { code: '2110', name: 'Driver Reimbursements Payable' },
  icDriver: { code: '2120', name: 'Contractor Reimbursements Payable' },
  corpEmployee: { code: '2130', name: 'Employee Reimbursements Payable' },
};

// ============================================
// 1. ELIGIBILITY CHECKS
// ============================================

/**
 * Check if an expense is eligible for reimbursement based on worker type and policy.
 */
export function checkReimbursementEligibility(
  expense: ApprovedExpense,
  policy: ReimbursementPolicy = DEFAULT_REIMBURSEMENT_POLICY,
  currentDate: Date = new Date()
): EligibilityResult {
  const reasons: string[] = [];

  // Check worker type eligibility
  if (expense.workerType === 'W2_DRIVER' && !policy.allowW2DriverReimbursement) {
    reasons.push('W2 drivers are not eligible for expense reimbursements');
  }
  if (expense.workerType === 'IC_DRIVER' && !policy.allowICDriverReimbursement) {
    reasons.push('IC drivers are not eligible for expense reimbursements');
  }
  if (expense.workerType === 'CORP_EMPLOYEE' && !policy.allowCorpEmployeeReimbursement) {
    reasons.push('Corporate employees are not eligible for expense reimbursements');
  }

  // Check excluded categories
  if (policy.excludedCategories.includes(expense.category)) {
    reasons.push(`Category '${expense.category}' is excluded from reimbursement`);
  }

  // Check minimum amount
  if (expense.amountCents < policy.minimumAmountCents) {
    reasons.push(
      `Amount $${(expense.amountCents / 100).toFixed(2)} is below minimum ` +
      `$${(policy.minimumAmountCents / 100).toFixed(2)}`
    );
  }

  // Check expense age
  if (policy.maxExpenseAgeDays !== null) {
    const expenseDate = new Date(expense.expenseDate);
    const daysDiff = Math.floor(
      (currentDate.getTime() - expenseDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysDiff > policy.maxExpenseAgeDays) {
      reasons.push(
        `Expense is ${daysDiff} days old; maximum allowed is ${policy.maxExpenseAgeDays} days`
      );
    }
  }

  return {
    isEligible: reasons.length === 0,
    reasons,
  };
}

/**
 * Simple boolean check for eligibility.
 */
export function isEligibleForReimbursement(
  expense: ApprovedExpense,
  policy: ReimbursementPolicy = DEFAULT_REIMBURSEMENT_POLICY
): boolean {
  return checkReimbursementEligibility(expense, policy).isEligible;
}

// ============================================
// 2. GL ACCOUNT MAPPING
// ============================================

/**
 * Find the GL account for an expense based on type and category.
 */
export function findGLAccount(
  expenseType: ExpenseType,
  category: string,
  mappings: GLAccountMapping[] = DEFAULT_GL_MAPPINGS
): { code: string; name: string } {
  // Find specific mapping
  const mapping = mappings.find(
    m => m.expenseTypes.includes(expenseType) && m.categories.includes(category)
  );

  if (mapping) {
    return { code: mapping.code, name: mapping.name };
  }

  // Fallback to "other" category
  const fallback = mappings.find(
    m => m.expenseTypes.includes(expenseType) && m.categories.includes('other')
  );

  if (fallback) {
    return { code: fallback.code, name: fallback.name };
  }

  // Ultimate fallback
  return { code: '6999', name: 'Miscellaneous Expense' };
}

/**
 * Get the liability account for a worker type.
 */
export function getReimbursementLiabilityAccount(
  workerType: ReimbursableWorkerType
): { code: string; name: string } {
  switch (workerType) {
    case 'W2_DRIVER':
      return REIMBURSEMENT_LIABILITY_ACCOUNTS.w2Driver;
    case 'IC_DRIVER':
      return REIMBURSEMENT_LIABILITY_ACCOUNTS.icDriver;
    case 'CORP_EMPLOYEE':
      return REIMBURSEMENT_LIABILITY_ACCOUNTS.corpEmployee;
    default:
      return REIMBURSEMENT_LIABILITY_ACCOUNTS.corpEmployee;
  }
}

// ============================================
// 3. NORMALIZE EXPENSES TO REIMBURSEMENT LINES
// ============================================

/**
 * Generate a unique ID for a reimbursement line.
 */
function generateReimbursementLineId(expenseId: string, payPeriodId: string): string {
  return `rl-${expenseId}-${payPeriodId}`;
}

/**
 * Normalize approved expenses into reimbursement lines tied to a pay period.
 * Only includes eligible expenses.
 */
export function normalizeExpensesToReimbursementLines(
  expenses: ApprovedExpense[],
  payPeriodId: string,
  policy: ReimbursementPolicy = DEFAULT_REIMBURSEMENT_POLICY,
  glMappings: GLAccountMapping[] = DEFAULT_GL_MAPPINGS
): { lines: ReimbursementLine[]; skipped: { expense: ApprovedExpense; reasons: string[] }[] } {
  const lines: ReimbursementLine[] = [];
  const skipped: { expense: ApprovedExpense; reasons: string[] }[] = [];
  const now = new Date().toISOString();

  for (const expense of expenses) {
    const eligibility = checkReimbursementEligibility(expense, policy);
    
    if (!eligibility.isEligible) {
      skipped.push({ expense, reasons: eligibility.reasons });
      continue;
    }

    const glAccount = findGLAccount(expense.expenseType, expense.category, glMappings);

    lines.push({
      id: generateReimbursementLineId(expense.id, payPeriodId),
      expenseId: expense.id,
      payPeriodId,
      submitterId: expense.submitterId,
      workerType: expense.workerType,
      expenseType: expense.expenseType,
      category: expense.category,
      amountCents: expense.amountCents,
      description: expense.description,
      glAccountCode: glAccount.code,
      glAccountName: glAccount.name,
      expenseDate: expense.expenseDate,
      approvedAt: expense.approvedAt,
      createdAt: now,
    });
  }

  return { lines, skipped };
}

// ============================================
// 4. AGGREGATION
// ============================================

/** Aggregated totals by GL account */
export interface GLAccountAggregate {
  accountCode: string;
  accountName: string;
  totalCents: number;
  lineCount: number;
}

/** Aggregated totals by worker type */
export interface WorkerTypeAggregate {
  workerType: ReimbursableWorkerType;
  totalCents: number;
  lineCount: number;
  submitterCount: number;
}

/**
 * Aggregate reimbursement lines by GL account.
 */
export function aggregateByGLAccount(lines: ReimbursementLine[]): GLAccountAggregate[] {
  const aggregates = new Map<string, GLAccountAggregate>();

  for (const line of lines) {
    const key = line.glAccountCode;
    const existing = aggregates.get(key) || {
      accountCode: line.glAccountCode,
      accountName: line.glAccountName,
      totalCents: 0,
      lineCount: 0,
    };
    existing.totalCents += line.amountCents;
    existing.lineCount += 1;
    aggregates.set(key, existing);
  }

  return Array.from(aggregates.values()).sort((a, b) => a.accountCode.localeCompare(b.accountCode));
}

/**
 * Aggregate reimbursement lines by worker type.
 */
export function aggregateByWorkerType(lines: ReimbursementLine[]): WorkerTypeAggregate[] {
  const aggregates = new Map<ReimbursableWorkerType, WorkerTypeAggregate>();

  for (const line of lines) {
    const key = line.workerType;
    const existing = aggregates.get(key) || {
      workerType: line.workerType,
      totalCents: 0,
      lineCount: 0,
      submitterCount: 0,
    };
    existing.totalCents += line.amountCents;
    existing.lineCount += 1;
    aggregates.set(key, existing);
  }

  // Count unique submitters per worker type
  const submittersByType = new Map<ReimbursableWorkerType, Set<string>>();
  for (const line of lines) {
    if (!submittersByType.has(line.workerType)) {
      submittersByType.set(line.workerType, new Set());
    }
    submittersByType.get(line.workerType)!.add(line.submitterId);
  }

  for (const [type, aggregate] of Array.from(aggregates.entries())) {
    aggregate.submitterCount = submittersByType.get(type)?.size || 0;
  }

  return Array.from(aggregates.values());
}

// ============================================
// 5. JOURNAL PAYLOAD GENERATION
// ============================================

/**
 * Build a balanced journal payload for QuickBooks import.
 * 
 * Creates entries:
 * - DEBIT: Expense accounts (by category)
 * - CREDIT: Reimbursement liability accounts (by worker type)
 */
export function buildReimbursementJournalPayload(
  lines: ReimbursementLine[],
  payPeriodId: string,
  periodStart: string,
  periodEnd: string
): ReimbursementJournalPayload {
  const journalLines: ReimbursementJournalLine[] = [];

  // Aggregate by GL account for debits (expense accounts)
  const glAggregates = aggregateByGLAccount(lines);
  for (const agg of glAggregates) {
    journalLines.push({
      accountCode: agg.accountCode,
      accountName: agg.accountName,
      debitCents: agg.totalCents,
      creditCents: 0,
      memo: `Expense reimbursements - ${agg.accountName} (${agg.lineCount} items)`,
      expenseCategory: agg.accountName,
    });
  }

  // Aggregate by worker type for credits (liability accounts)
  const workerAggregates = aggregateByWorkerType(lines);
  for (const agg of workerAggregates) {
    const liabilityAccount = getReimbursementLiabilityAccount(agg.workerType);
    journalLines.push({
      accountCode: liabilityAccount.code,
      accountName: liabilityAccount.name,
      debitCents: 0,
      creditCents: agg.totalCents,
      memo: `${agg.workerType} reimbursements payable (${agg.submitterCount} recipients)`,
    });
  }

  // Calculate totals
  const totalDebitsCents = journalLines.reduce((sum, l) => sum + l.debitCents, 0);
  const totalCreditsCents = journalLines.reduce((sum, l) => sum + l.creditCents, 0);
  const workerTypes = Array.from(new Set(lines.map(l => l.workerType)));

  return {
    transactionRef: `REIMB-${payPeriodId}-${Date.now()}`,
    entryDate: periodEnd,
    payPeriodId,
    periodStart,
    periodEnd,
    memo: `Expense reimbursements for period ${periodStart} to ${periodEnd}`,
    lines: journalLines,
    totalDebitsCents,
    totalCreditsCents,
    isBalanced: totalDebitsCents === totalCreditsCents,
    metadata: {
      generatedAt: new Date().toISOString(),
      expenseCount: new Set(lines.map(l => l.expenseId)).size,
      reimbursementLineCount: lines.length,
      workerTypes,
      totalReimbursementCents: totalDebitsCents,
    },
  };
}

// ============================================
// 6. CSV EXPORT FOR QUICKBOOKS
// ============================================

const QB_JOURNAL_CSV_HEADERS = [
  'TransactionRef',
  'EntryDate',
  'AccountCode',
  'AccountName',
  'Debit',
  'Credit',
  'Memo',
  'Class',
] as const;

/**
 * Generate QuickBooks-compatible CSV from journal payload.
 */
export function generateQBJournalCsv(payload: ReimbursementJournalPayload): string {
  const rows: string[] = [QB_JOURNAL_CSV_HEADERS.join(',')];

  for (const line of payload.lines) {
    const debit = line.debitCents > 0 ? (line.debitCents / 100).toFixed(2) : '';
    const credit = line.creditCents > 0 ? (line.creditCents / 100).toFixed(2) : '';

    rows.push([
      payload.transactionRef,
      payload.entryDate,
      line.accountCode,
      escapeCSV(line.accountName),
      debit,
      credit,
      escapeCSV(line.memo),
      'Operations', // Default class
    ].join(','));
  }

  return rows.join('\n');
}

/**
 * Escape a value for CSV.
 */
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ============================================
// 7. AUDIT ENTRY GENERATION
// ============================================

/**
 * Generate SHA-256 hash of content for audit.
 */
export function generatePayloadHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Create an audit entry for reimbursement processing.
 */
export function createReimbursementAuditEntry(
  payPeriodId: string,
  lines: ReimbursementLine[],
  journalPayload: ReimbursementJournalPayload,
  csvPayload: string,
  processedBy: string
): ReimbursementAuditEntry {
  const jsonPayload = JSON.stringify(journalPayload);
  const combinedHash = generatePayloadHash(jsonPayload + csvPayload);

  return {
    id: `audit-reimb-${payPeriodId}-${Date.now()}`,
    payPeriodId,
    processedAt: new Date().toISOString(),
    processedBy,
    payloadHash: combinedHash,
    totalAmountCents: journalPayload.totalDebitsCents,
    lineCount: lines.length,
    expenseIds: lines.map(l => l.expenseId),
    journalPayloadJson: jsonPayload,
    csvPayload,
  };
}

// ============================================
// 8. IDEMPOTENCY CHECK
// ============================================

/**
 * Check if a set of expenses has already been processed.
 * Uses expense IDs and pay period to detect duplicates.
 */
export function checkIdempotency(
  expenseIds: string[],
  existingAuditEntries: ReimbursementAuditEntry[]
): { isDuplicate: boolean; existingEntryId: string | null } {
  // Sort expense IDs for consistent comparison
  const sortedIds = [...expenseIds].sort();
  const idsKey = sortedIds.join(',');

  for (const entry of existingAuditEntries) {
    const existingIds = [...entry.expenseIds].sort().join(',');
    if (existingIds === idsKey) {
      return { isDuplicate: true, existingEntryId: entry.id };
    }
  }

  return { isDuplicate: false, existingEntryId: null };
}

/**
 * Generate a deterministic hash for a set of expense IDs.
 * Used for idempotency checks.
 */
export function generateExpenseSetHash(expenseIds: string[]): string {
  const sorted = [...expenseIds].sort().join(',');
  return generatePayloadHash(sorted);
}

// ============================================
// 9. COMPLETE PROCESSING FUNCTION
// ============================================

/** Result of processing expenses for reimbursement */
export interface ReimbursementProcessingResult {
  success: boolean;
  reimbursementLines: ReimbursementLine[];
  skippedExpenses: { expense: ApprovedExpense; reasons: string[] }[];
  journalPayload: ReimbursementJournalPayload;
  csvPayload: string;
  auditEntry: ReimbursementAuditEntry;
  error?: string;
}

/**
 * Process approved expenses into reimbursements for a pay period.
 * Complete pipeline: eligibility → normalization → journal → CSV → audit.
 */
export function processExpensesForReimbursement(
  expenses: ApprovedExpense[],
  payPeriodId: string,
  periodStart: string,
  periodEnd: string,
  processedBy: string,
  policy: ReimbursementPolicy = DEFAULT_REIMBURSEMENT_POLICY,
  glMappings: GLAccountMapping[] = DEFAULT_GL_MAPPINGS,
  existingAuditEntries: ReimbursementAuditEntry[] = []
): ReimbursementProcessingResult {
  // Check for empty input
  if (expenses.length === 0) {
    const emptyPayload: ReimbursementJournalPayload = {
      transactionRef: `REIMB-${payPeriodId}-${Date.now()}`,
      entryDate: periodEnd,
      payPeriodId,
      periodStart,
      periodEnd,
      memo: 'No expenses to process',
      lines: [],
      totalDebitsCents: 0,
      totalCreditsCents: 0,
      isBalanced: true,
      metadata: {
        generatedAt: new Date().toISOString(),
        expenseCount: 0,
        reimbursementLineCount: 0,
        workerTypes: [],
        totalReimbursementCents: 0,
      },
    };

    return {
      success: true,
      reimbursementLines: [],
      skippedExpenses: [],
      journalPayload: emptyPayload,
      csvPayload: QB_JOURNAL_CSV_HEADERS.join(','),
      auditEntry: createReimbursementAuditEntry(
        payPeriodId, [], emptyPayload, QB_JOURNAL_CSV_HEADERS.join(','), processedBy
      ),
    };
  }

  // Check idempotency
  const expenseIds = expenses.map(e => e.id);
  const idempotencyCheck = checkIdempotency(expenseIds, existingAuditEntries);
  if (idempotencyCheck.isDuplicate) {
    return {
      success: false,
      reimbursementLines: [],
      skippedExpenses: [],
      journalPayload: {} as ReimbursementJournalPayload,
      csvPayload: '',
      auditEntry: {} as ReimbursementAuditEntry,
      error: `Duplicate processing detected. Existing entry: ${idempotencyCheck.existingEntryId}`,
    };
  }

  // Normalize expenses to reimbursement lines
  const { lines, skipped } = normalizeExpensesToReimbursementLines(
    expenses, payPeriodId, policy, glMappings
  );

  // Build journal payload
  const journalPayload = buildReimbursementJournalPayload(
    lines, payPeriodId, periodStart, periodEnd
  );

  // Generate CSV
  const csvPayload = generateQBJournalCsv(journalPayload);

  // Create audit entry
  const auditEntry = createReimbursementAuditEntry(
    payPeriodId, lines, journalPayload, csvPayload, processedBy
  );

  return {
    success: true,
    reimbursementLines: lines,
    skippedExpenses: skipped,
    journalPayload,
    csvPayload,
    auditEntry,
  };
}
