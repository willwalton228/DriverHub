/**
 * Accounting Payload Builder
 * 
 * Builds journal entry payloads from pay periods for accounting system integration.
 */

import type { WorkerType } from '@shared/schema';
import type { PayLineRecord, PayPeriodRecord } from './payPeriodProcessor';

// ============================================
// TYPES
// ============================================

/** Single journal entry line */
export interface JournalLine {
  /** Account code/number */
  accountCode: string;
  /** Account name */
  accountName: string;
  /** Debit amount in cents (positive = debit) */
  debitCents: number;
  /** Credit amount in cents (positive = credit) */
  creditCents: number;
  /** Line memo/description */
  memo: string;
  /** Department or cost center */
  department?: string;
  /** Class/location for tracking */
  class?: string;
}

/** Complete journal entry payload */
export interface JournalPayload {
  /** Unique transaction reference */
  transactionRef: string;
  /** Journal entry date (typically period end date) */
  entryDate: string;
  /** Pay period reference */
  payPeriodId: string;
  /** Pay period start date */
  periodStart: string;
  /** Pay period end date */
  periodEnd: string;
  /** Entry description/memo */
  memo: string;
  /** Journal entry lines */
  lines: JournalLine[];
  /** Total debits (should equal credits) */
  totalDebitsCents: number;
  /** Total credits (should equal debits) */
  totalCreditsCents: number;
  /** Whether entry is balanced */
  isBalanced: boolean;
  /** Metadata for audit */
  metadata: {
    generatedAt: string;
    workerTypes: WorkerType[];
    driverCount: number;
    payLineCount: number;
  };
}

/** Account mapping configuration */
export interface AccountMapping {
  /** Payroll expense account for W2 drivers */
  w2PayrollExpense: { code: string; name: string };
  /** Payroll expense account for IC drivers */
  icContractorExpense: { code: string; name: string };
  /** Payroll liability account (wages payable) */
  payrollLiability: { code: string; name: string };
  /** Accounts payable for IC settlements */
  accountsPayable: { code: string; name: string };
}

// ============================================
// DEFAULT ACCOUNT MAPPING
// ============================================

/** Default chart of accounts mapping */
export const DEFAULT_ACCOUNT_MAPPING: AccountMapping = {
  w2PayrollExpense: { code: '6100', name: 'Driver Wages Expense' },
  icContractorExpense: { code: '6200', name: 'Contractor Expense' },
  payrollLiability: { code: '2100', name: 'Wages Payable' },
  accountsPayable: { code: '2000', name: 'Accounts Payable' },
};

// ============================================
// PAYLOAD BUILDER
// ============================================

/**
 * Build an accounting journal payload from a pay period.
 * 
 * Creates a balanced double-entry journal with:
 * - DEBIT: Payroll/Contractor expense accounts
 * - CREDIT: Wages Payable / Accounts Payable
 * 
 * @param payPeriod - The pay period record
 * @param payLines - All pay lines for the period
 * @param accountMapping - Optional custom account mapping
 * @returns JournalPayload ready for accounting system
 */
export function buildAccountingPayload(
  payPeriod: PayPeriodRecord,
  payLines: PayLineRecord[],
  accountMapping: AccountMapping = DEFAULT_ACCOUNT_MAPPING
): JournalPayload {
  const lines: JournalLine[] = [];
  
  // Aggregate totals by worker type
  const w2TotalCents = payLines
    .filter(pl => pl.workerType === 'W2_DRIVER')
    .reduce((sum, pl) => sum + pl.finalPayCents, 0);
  
  const icTotalCents = payLines
    .filter(pl => pl.workerType === 'IC_DRIVER')
    .reduce((sum, pl) => sum + pl.finalPayCents, 0);
  
  // Count unique drivers
  const w2Drivers = new Set(
    payLines.filter(pl => pl.workerType === 'W2_DRIVER').map(pl => pl.driverId)
  );
  const icDrivers = new Set(
    payLines.filter(pl => pl.workerType === 'IC_DRIVER').map(pl => pl.driverId)
  );
  
  // Build journal lines for W2 drivers (if any)
  if (w2TotalCents > 0) {
    // DEBIT: Payroll Expense
    lines.push({
      accountCode: accountMapping.w2PayrollExpense.code,
      accountName: accountMapping.w2PayrollExpense.name,
      debitCents: w2TotalCents,
      creditCents: 0,
      memo: `W2 Driver wages for period ${payPeriod.periodStart} - ${payPeriod.periodEnd}`,
      department: 'Operations',
    });
    
    // CREDIT: Wages Payable
    lines.push({
      accountCode: accountMapping.payrollLiability.code,
      accountName: accountMapping.payrollLiability.name,
      debitCents: 0,
      creditCents: w2TotalCents,
      memo: `W2 Driver wages payable for period ${payPeriod.periodStart} - ${payPeriod.periodEnd}`,
      department: 'Operations',
    });
  }
  
  // Build journal lines for IC drivers (if any)
  if (icTotalCents > 0) {
    // DEBIT: Contractor Expense
    lines.push({
      accountCode: accountMapping.icContractorExpense.code,
      accountName: accountMapping.icContractorExpense.name,
      debitCents: icTotalCents,
      creditCents: 0,
      memo: `IC Driver settlements for period ${payPeriod.periodStart} - ${payPeriod.periodEnd}`,
      department: 'Operations',
    });
    
    // CREDIT: Accounts Payable
    lines.push({
      accountCode: accountMapping.accountsPayable.code,
      accountName: accountMapping.accountsPayable.name,
      debitCents: 0,
      creditCents: icTotalCents,
      memo: `IC Driver settlements payable for period ${payPeriod.periodStart} - ${payPeriod.periodEnd}`,
      department: 'Operations',
    });
  }
  
  // Calculate totals
  const totalDebitsCents = lines.reduce((sum, l) => sum + l.debitCents, 0);
  const totalCreditsCents = lines.reduce((sum, l) => sum + l.creditCents, 0);
  
  // Determine worker types present
  const workerTypes: WorkerType[] = [];
  if (w2TotalCents > 0) workerTypes.push('W2_DRIVER');
  if (icTotalCents > 0) workerTypes.push('IC_DRIVER');
  
  return {
    transactionRef: `PAY-${payPeriod.id}-${Date.now()}`,
    entryDate: payPeriod.periodEnd,
    payPeriodId: payPeriod.id,
    periodStart: payPeriod.periodStart,
    periodEnd: payPeriod.periodEnd,
    memo: `Payroll journal entry for pay period ${payPeriod.periodStart} to ${payPeriod.periodEnd}`,
    lines,
    totalDebitsCents,
    totalCreditsCents,
    isBalanced: totalDebitsCents === totalCreditsCents,
    metadata: {
      generatedAt: new Date().toISOString(),
      workerTypes,
      driverCount: w2Drivers.size + icDrivers.size,
      payLineCount: payLines.length,
    },
  };
}

/**
 * Validate that a journal payload is balanced and complete.
 */
export function validateJournalPayload(payload: JournalPayload): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // Check balance
  if (!payload.isBalanced) {
    errors.push(
      `Journal is unbalanced: debits $${(payload.totalDebitsCents / 100).toFixed(2)} ` +
      `!= credits $${(payload.totalCreditsCents / 100).toFixed(2)}`
    );
  }
  
  // Check for empty journal
  if (payload.lines.length === 0) {
    errors.push('Journal has no lines');
  }
  
  // Check all lines have account codes
  for (let i = 0; i < payload.lines.length; i++) {
    const line = payload.lines[i];
    if (!line.accountCode) {
      errors.push(`Line ${i + 1} missing account code`);
    }
    if (line.debitCents === 0 && line.creditCents === 0) {
      errors.push(`Line ${i + 1} has zero amount`);
    }
    if (line.debitCents > 0 && line.creditCents > 0) {
      errors.push(`Line ${i + 1} has both debit and credit`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Format journal payload as a summary string for logging.
 */
export function formatJournalSummary(payload: JournalPayload): string {
  const lines = [
    `Journal Entry: ${payload.transactionRef}`,
    `Period: ${payload.periodStart} to ${payload.periodEnd}`,
    `Entry Date: ${payload.entryDate}`,
    ``,
    `Lines:`,
  ];
  
  for (const line of payload.lines) {
    const debit = line.debitCents > 0 ? `DR $${(line.debitCents / 100).toFixed(2)}` : '';
    const credit = line.creditCents > 0 ? `CR $${(line.creditCents / 100).toFixed(2)}` : '';
    lines.push(`  ${line.accountCode} ${line.accountName}: ${debit}${credit}`);
  }
  
  lines.push(``);
  lines.push(`Totals: DR $${(payload.totalDebitsCents / 100).toFixed(2)} / CR $${(payload.totalCreditsCents / 100).toFixed(2)}`);
  lines.push(`Balanced: ${payload.isBalanced ? 'Yes' : 'NO'}`);
  lines.push(`Drivers: ${payload.metadata.driverCount}, Pay Lines: ${payload.metadata.payLineCount}`);
  
  return lines.join('\n');
}
