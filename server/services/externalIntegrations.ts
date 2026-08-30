/**
 * External Integrations Layer (INCREMENT 16)
 * 
 * Adapter-based integrations for external systems:
 * 1. ADP adapter for W2 employee payroll
 * 2. OpenForce/OpenMarket adapter for independent contractors
 * 3. ACH/Bank adapter (optional, controlled)
 * 4. QuickBooks adapter for accounting payloads (CSV/API)
 * 5. Integration health monitoring with drift detection
 * 
 * NO business logic inside adapters - pure data transformation only.
 * NO vendor-driven rule changes.
 */

import {
  BaseIntegrationAdapter,
  type AdapterConfig,
  type ValidationResult,
  type TransformationResult,
  type TransmissionResult,
  type ConfirmationResult,
  type FieldMapping,
  registerAdapter,
  getAdapter,
  listAdapters,
  getAdapterStatistics,
  type AdapterStatistics,
} from './integrationAdapter';

// ============================================
// SHARED TYPES
// ============================================

/** Employee type for routing */
export type EmployeeType = 'W2' | 'IC';

/** Pay period record for export */
export interface PayrollExportRecord {
  employeeId: string;
  employeeType: EmployeeType;
  firstName: string;
  lastName: string;
  ssn?: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  regularHours: number;
  overtimeHours: number;
  regularPayCents: number;
  overtimePayCents: number;
  bonusCents: number;
  deductionsCents: number;
  netPayCents: number;
  marketId: string;
  costCenter?: string;
}

/** Accounting journal entry */
export interface AccountingEntry {
  entryId: string;
  date: string;
  description: string;
  lineItems: AccountingLineItem[];
  reference: string;
  source: string;
}

/** Accounting line item */
export interface AccountingLineItem {
  accountCode: string;
  accountName: string;
  debitCents: number;
  creditCents: number;
  description: string;
  department?: string;
  class?: string;
}

/** ACH payment record */
export interface ACHPaymentRecord {
  paymentId: string;
  recipientId: string;
  recipientName: string;
  routingNumber: string;
  accountNumber: string;
  accountType: 'CHECKING' | 'SAVINGS';
  amountCents: number;
  effectiveDate: string;
  description: string;
  addendaRecord?: string;
}

// ============================================
// ADP ADAPTER (W2 Employees)
// ============================================

/** ADP payroll format */
export interface ADPPayrollRecord {
  companyCode: string;
  batchId: string;
  fileNumber: string;
  employeeId: string;
  lastName: string;
  firstName: string;
  ssn: string;
  payDate: string;
  periodBeginDate: string;
  periodEndDate: string;
  hoursWorked: string;
  regularEarnings: string;
  overtimeEarnings: string;
  otherEarnings: string;
  grossPay: string;
  deptCode: string;
}

export class ADPPayrollAdapter extends BaseIntegrationAdapter<PayrollExportRecord, ADPPayrollRecord> {
  readonly config: AdapterConfig = {
    id: 'adp-payroll',
    name: 'ADP Payroll Export',
    description: 'Export W2 employee payroll to ADP format',
    version: '1.0.0',
    enabled: true,
    maxRetries: 3,
    retryDelayMs: 5000,
    timeoutMs: 60000,
    validateBeforeTransform: true,
    requireConfirmation: true,
  };
  
  private companyCode: string = 'DH360';
  
  setCompanyCode(code: string): void {
    this.companyCode = code;
  }
  
  validate(payload: PayrollExportRecord): ValidationResult {
    const errors = [];
    
    if (payload.employeeType !== 'W2') {
      errors.push(this.createValidationError('employeeType', 'ADP adapter only accepts W2 employees', 'INVALID_EMPLOYEE_TYPE'));
    }
    
    if (!payload.employeeId) {
      errors.push(this.createValidationError('employeeId', 'Employee ID is required', 'REQUIRED_FIELD'));
    }
    
    if (!payload.firstName || !payload.lastName) {
      errors.push(this.createValidationError('name', 'First and last name are required', 'REQUIRED_FIELD'));
    }
    
    if (!payload.payPeriodStart || !payload.payPeriodEnd) {
      errors.push(this.createValidationError('payPeriod', 'Pay period dates are required', 'REQUIRED_FIELD'));
    }
    
    if (payload.netPayCents < 0) {
      errors.push(this.createValidationError('netPayCents', 'Net pay cannot be negative', 'INVALID_VALUE'));
    }
    
    const warnings = [];
    if (!payload.ssn) {
      warnings.push(this.createValidationError('ssn', 'SSN not provided, will use placeholder', 'MISSING_SSN', 'WARNING'));
    }
    
    if (errors.length > 0) {
      return this.validationFailure(errors, warnings);
    }
    
    return this.validationSuccess(warnings);
  }
  
  transform(payload: PayrollExportRecord): TransformationResult<ADPPayrollRecord> {
    const mappings: FieldMapping[] = [];
    
    const totalHours = payload.regularHours + payload.overtimeHours;
    const grossPay = payload.regularPayCents + payload.overtimePayCents + payload.bonusCents;
    
    const output: ADPPayrollRecord = {
      companyCode: this.companyCode,
      batchId: `BATCH_${new Date().toISOString().split('T')[0].replace(/-/g, '')}`,
      fileNumber: payload.employeeId.substring(0, 9).padStart(9, '0'),
      employeeId: payload.employeeId,
      lastName: payload.lastName.toUpperCase().substring(0, 20),
      firstName: payload.firstName.toUpperCase().substring(0, 15),
      ssn: payload.ssn?.replace(/-/g, '') || '000000000',
      payDate: payload.payPeriodEnd,
      periodBeginDate: payload.payPeriodStart,
      periodEndDate: payload.payPeriodEnd,
      hoursWorked: totalHours.toFixed(2),
      regularEarnings: (payload.regularPayCents / 100).toFixed(2),
      overtimeEarnings: (payload.overtimePayCents / 100).toFixed(2),
      otherEarnings: (payload.bonusCents / 100).toFixed(2),
      grossPay: (grossPay / 100).toFixed(2),
      deptCode: payload.costCenter || payload.marketId.substring(0, 6).toUpperCase(),
    };
    
    mappings.push(
      { sourceField: 'employeeId', targetField: 'fileNumber', transformation: 'padStart', sourceValue: payload.employeeId, targetValue: output.fileNumber },
      { sourceField: 'regularPayCents', targetField: 'regularEarnings', transformation: 'centsToDecimal', sourceValue: payload.regularPayCents, targetValue: output.regularEarnings },
      { sourceField: 'marketId', targetField: 'deptCode', transformation: 'substring', sourceValue: payload.marketId, targetValue: output.deptCode }
    );
    
    return this.transformSuccess(output, mappings);
  }
  
  transmit(payload: ADPPayrollRecord): TransmissionResult {
    // In production, this would call ADP's API or generate SFTP file
    // For now, simulates successful transmission
    const transactionId = `ADP_${Date.now()}_${payload.fileNumber}`;
    
    return this.createTransmissionResult(
      true,
      200,
      { accepted: true, transactionId, fileNumber: payload.fileNumber },
      transactionId,
      Math.random() * 200 + 100
    );
  }
  
  confirm(receipt: TransmissionResult): ConfirmationResult {
    if (!receipt.success || !receipt.transactionId) {
      return this.createConfirmationResult(false, null, { error: 'Transmission failed' });
    }
    
    return this.createConfirmationResult(
      true,
      `ADP_CONF_${receipt.transactionId}`,
      { processedAt: new Date().toISOString(), status: 'ACCEPTED' }
    );
  }
  
  /** Generate CSV content for batch export */
  static generateCSV(records: ADPPayrollRecord[]): string {
    const headers = [
      'CompanyCode', 'BatchId', 'FileNumber', 'EmployeeId', 'LastName', 'FirstName',
      'SSN', 'PayDate', 'PeriodBegin', 'PeriodEnd', 'Hours', 'RegularPay',
      'OvertimePay', 'OtherPay', 'GrossPay', 'DeptCode'
    ];
    
    const rows = records.map(r => [
      r.companyCode, r.batchId, r.fileNumber, r.employeeId, r.lastName, r.firstName,
      r.ssn, r.payDate, r.periodBeginDate, r.periodEndDate, r.hoursWorked,
      r.regularEarnings, r.overtimeEarnings, r.otherEarnings, r.grossPay, r.deptCode
    ].join(','));
    
    return [headers.join(','), ...rows].join('\n');
  }
}

// ============================================
// OPENFORCE/OPENMARKET ADAPTER (ICs)
// ============================================

/** OpenForce payment format */
export interface OpenForcePaymentRecord {
  clientId: string;
  batchReference: string;
  contractorId: string;
  taxId: string;
  contractorName: string;
  invoicePeriodStart: string;
  invoicePeriodEnd: string;
  serviceDescription: string;
  grossAmountUSD: string;
  paymentMethod: 'ACH' | 'CHECK';
  paymentDate: string;
  marketCode: string;
}

export class OpenForceAdapter extends BaseIntegrationAdapter<PayrollExportRecord, OpenForcePaymentRecord> {
  readonly config: AdapterConfig = {
    id: 'openforce-payments',
    name: 'OpenForce IC Payments',
    description: 'Export independent contractor payments to OpenForce/OpenMarket',
    version: '1.0.0',
    enabled: true,
    maxRetries: 3,
    retryDelayMs: 5000,
    timeoutMs: 60000,
    validateBeforeTransform: true,
    requireConfirmation: true,
  };
  
  private clientId: string = 'DH360_CLIENT';
  
  setClientId(id: string): void {
    this.clientId = id;
  }
  
  validate(payload: PayrollExportRecord): ValidationResult {
    const errors = [];
    
    if (payload.employeeType !== 'IC') {
      errors.push(this.createValidationError('employeeType', 'OpenForce adapter only accepts IC contractors', 'INVALID_EMPLOYEE_TYPE'));
    }
    
    if (!payload.employeeId) {
      errors.push(this.createValidationError('employeeId', 'Contractor ID is required', 'REQUIRED_FIELD'));
    }
    
    if (!payload.firstName || !payload.lastName) {
      errors.push(this.createValidationError('name', 'Contractor name is required', 'REQUIRED_FIELD'));
    }
    
    if (payload.netPayCents <= 0) {
      errors.push(this.createValidationError('netPayCents', 'Payment amount must be positive', 'INVALID_VALUE'));
    }
    
    if (errors.length > 0) {
      return this.validationFailure(errors);
    }
    
    return this.validationSuccess();
  }
  
  transform(payload: PayrollExportRecord): TransformationResult<OpenForcePaymentRecord> {
    const mappings: FieldMapping[] = [];
    
    const output: OpenForcePaymentRecord = {
      clientId: this.clientId,
      batchReference: `OF_${new Date().toISOString().split('T')[0].replace(/-/g, '')}_${payload.marketId}`,
      contractorId: payload.employeeId,
      taxId: payload.ssn?.replace(/-/g, '') || '',
      contractorName: `${payload.lastName}, ${payload.firstName}`,
      invoicePeriodStart: payload.payPeriodStart,
      invoicePeriodEnd: payload.payPeriodEnd,
      serviceDescription: `Driver services for period ${payload.payPeriodStart} to ${payload.payPeriodEnd}`,
      grossAmountUSD: (payload.netPayCents / 100).toFixed(2),
      paymentMethod: 'ACH',
      paymentDate: payload.payPeriodEnd,
      marketCode: payload.marketId.toUpperCase(),
    };
    
    mappings.push(
      { sourceField: 'employeeId', targetField: 'contractorId', transformation: 'direct', sourceValue: payload.employeeId, targetValue: output.contractorId },
      { sourceField: 'netPayCents', targetField: 'grossAmountUSD', transformation: 'centsToDecimal', sourceValue: payload.netPayCents, targetValue: output.grossAmountUSD }
    );
    
    return this.transformSuccess(output, mappings);
  }
  
  transmit(payload: OpenForcePaymentRecord): TransmissionResult {
    // In production, this would call OpenForce API
    const transactionId = `OF_${Date.now()}_${payload.contractorId}`;
    
    return this.createTransmissionResult(
      true,
      201,
      { status: 'QUEUED', transactionId, estimatedProcessingDate: payload.paymentDate },
      transactionId,
      Math.random() * 300 + 150
    );
  }
  
  confirm(receipt: TransmissionResult): ConfirmationResult {
    if (!receipt.success || !receipt.transactionId) {
      return this.createConfirmationResult(false, null, { error: 'Transmission failed' });
    }
    
    return this.createConfirmationResult(
      true,
      `OF_CONF_${receipt.transactionId}`,
      { status: 'CONFIRMED', queuedAt: new Date().toISOString() }
    );
  }
  
  /** Generate CSV for batch export */
  static generateCSV(records: OpenForcePaymentRecord[]): string {
    const headers = [
      'ClientId', 'BatchRef', 'ContractorId', 'TaxId', 'Name',
      'PeriodStart', 'PeriodEnd', 'Description', 'Amount', 'PayMethod', 'PayDate', 'Market'
    ];
    
    const rows = records.map(r => [
      r.clientId, r.batchReference, r.contractorId, r.taxId, `"${r.contractorName}"`,
      r.invoicePeriodStart, r.invoicePeriodEnd, `"${r.serviceDescription}"`,
      r.grossAmountUSD, r.paymentMethod, r.paymentDate, r.marketCode
    ].join(','));
    
    return [headers.join(','), ...rows].join('\n');
  }
}

// ============================================
// ACH/BANK ADAPTER
// ============================================

/** NACHA ACH file format */
export interface NACHARecord {
  recordType: '1' | '5' | '6' | '8' | '9';
  content: string;
}

/** ACH batch for transmission */
export interface ACHBatch {
  fileId: string;
  createdAt: string;
  originatingDFI: string;
  companyName: string;
  companyId: string;
  effectiveDate: string;
  records: NACHARecord[];
  totalDebitCents: number;
  totalCreditCents: number;
  entryCount: number;
}

export class ACHBankAdapter extends BaseIntegrationAdapter<ACHPaymentRecord[], ACHBatch> {
  readonly config: AdapterConfig = {
    id: 'ach-bank',
    name: 'ACH Bank Payments',
    description: 'Process ACH payments through banking system',
    version: '1.0.0',
    enabled: false, // Disabled by default - requires explicit enablement
    maxRetries: 1,  // ACH should not auto-retry
    retryDelayMs: 0,
    timeoutMs: 120000,
    validateBeforeTransform: true,
    requireConfirmation: true,
  };
  
  private originatingDFI: string = '00000000';
  private companyName: string = 'DRIVERHUB 360';
  private companyId: string = '0000000000';
  
  configure(dfi: string, companyName: string, companyId: string): void {
    this.originatingDFI = dfi;
    this.companyName = companyName;
    this.companyId = companyId;
  }
  
  validate(payments: ACHPaymentRecord[]): ValidationResult {
    const errors = [];
    const warnings = [];
    
    if (payments.length === 0) {
      errors.push(this.createValidationError('payments', 'At least one payment is required', 'EMPTY_BATCH'));
      return this.validationFailure(errors);
    }
    
    for (let i = 0; i < payments.length; i++) {
      const p = payments[i];
      
      if (!p.routingNumber || p.routingNumber.length !== 9) {
        errors.push(this.createValidationError(`payments[${i}].routingNumber`, 'Invalid routing number', 'INVALID_ROUTING'));
      }
      
      if (!p.accountNumber || p.accountNumber.length < 4 || p.accountNumber.length > 17) {
        errors.push(this.createValidationError(`payments[${i}].accountNumber`, 'Invalid account number', 'INVALID_ACCOUNT'));
      }
      
      if (p.amountCents <= 0) {
        errors.push(this.createValidationError(`payments[${i}].amountCents`, 'Amount must be positive', 'INVALID_AMOUNT'));
      }
      
      if (p.amountCents > 99999999) {
        warnings.push(this.createValidationError(`payments[${i}].amountCents`, 'Large payment amount', 'LARGE_AMOUNT', 'WARNING'));
      }
    }
    
    if (errors.length > 0) {
      return this.validationFailure(errors, warnings);
    }
    
    return this.validationSuccess(warnings);
  }
  
  transform(payments: ACHPaymentRecord[]): TransformationResult<ACHBatch> {
    const fileId = `ACH_${Date.now()}`;
    const now = new Date();
    const effectiveDate = payments[0]?.effectiveDate || now.toISOString().split('T')[0];
    
    const records: NACHARecord[] = [];
    let totalCreditCents = 0;
    
    // File Header (Record Type 1)
    records.push({
      recordType: '1',
      content: `101 ${this.originatingDFI}${this.companyId}${now.toISOString().replace(/[-:T]/g, '').substring(2, 12)}A094101${this.companyName.padEnd(23)}DRIVERHUB360`,
    });
    
    // Batch Header (Record Type 5)
    records.push({
      recordType: '5',
      content: `5200${this.companyName.padEnd(16)}${this.companyId}PPD PAYROLL   ${effectiveDate.replace(/-/g, '')}   1${this.originatingDFI}0000001`,
    });
    
    // Entry Details (Record Type 6)
    for (const payment of payments) {
      const transactionCode = payment.accountType === 'CHECKING' ? '22' : '32';
      totalCreditCents += payment.amountCents;
      
      records.push({
        recordType: '6',
        content: `6${transactionCode}${payment.routingNumber}${payment.accountNumber.padEnd(17)}${payment.amountCents.toString().padStart(10, '0')}${payment.recipientId.padEnd(15)}${payment.recipientName.substring(0, 22).padEnd(22)}  0${this.originatingDFI}`,
      });
    }
    
    // Batch Control (Record Type 8)
    records.push({
      recordType: '8',
      content: `8200${payments.length.toString().padStart(6, '0')}${totalCreditCents.toString().padStart(12, '0')}${'0'.repeat(12)}${this.companyId}                         ${this.originatingDFI}0000001`,
    });
    
    // File Control (Record Type 9)
    records.push({
      recordType: '9',
      content: `9000001000001${payments.length.toString().padStart(8, '0')}${totalCreditCents.toString().padStart(12, '0')}${'0'.repeat(12)}`,
    });
    
    const batch: ACHBatch = {
      fileId,
      createdAt: now.toISOString(),
      originatingDFI: this.originatingDFI,
      companyName: this.companyName,
      companyId: this.companyId,
      effectiveDate,
      records,
      totalDebitCents: 0,
      totalCreditCents,
      entryCount: payments.length,
    };
    
    return this.transformSuccess(batch);
  }
  
  transmit(batch: ACHBatch): TransmissionResult {
    // In production, this would transmit to bank SFTP
    // ACH adapter is disabled by default and requires explicit bank configuration
    
    if (!this.config.enabled) {
      return this.createTransmissionResult(
        false,
        403,
        { error: 'ACH adapter is disabled. Enable in configuration.' },
        null,
        0
      );
    }
    
    return this.createTransmissionResult(
      true,
      200,
      { fileId: batch.fileId, accepted: true, entryCount: batch.entryCount },
      batch.fileId,
      Math.random() * 500 + 200
    );
  }
  
  confirm(receipt: TransmissionResult): ConfirmationResult {
    if (!receipt.success) {
      return this.createConfirmationResult(false, null, { error: 'ACH transmission failed' });
    }
    
    return this.createConfirmationResult(
      true,
      `ACH_CONF_${receipt.transactionId}`,
      { submittedAt: new Date().toISOString(), status: 'PENDING_SETTLEMENT' }
    );
  }
  
  /** Generate NACHA file content */
  static generateNACHAFile(batch: ACHBatch): string {
    return batch.records.map(r => r.content).join('\n');
  }
}

// ============================================
// QUICKBOOKS ADAPTER
// ============================================

/** QuickBooks journal entry format */
export interface QBJournalEntry {
  txnDate: string;
  docNumber: string;
  privateNote: string;
  lineItems: QBLineItem[];
}

/** QuickBooks line item */
export interface QBLineItem {
  description: string;
  amount: string;
  postingType: 'Debit' | 'Credit';
  accountRef: string;
  classRef?: string;
  departmentRef?: string;
}

export class QuickBooksAdapter extends BaseIntegrationAdapter<AccountingEntry, QBJournalEntry> {
  readonly config: AdapterConfig = {
    id: 'quickbooks-accounting',
    name: 'QuickBooks Accounting',
    description: 'Post accounting entries to QuickBooks',
    version: '1.0.0',
    enabled: true,
    maxRetries: 3,
    retryDelayMs: 3000,
    timeoutMs: 30000,
    validateBeforeTransform: true,
    requireConfirmation: true,
  };
  
  validate(entry: AccountingEntry): ValidationResult {
    const errors = [];
    
    if (!entry.entryId) {
      errors.push(this.createValidationError('entryId', 'Entry ID is required', 'REQUIRED_FIELD'));
    }
    
    if (!entry.date) {
      errors.push(this.createValidationError('date', 'Entry date is required', 'REQUIRED_FIELD'));
    }
    
    if (!entry.lineItems || entry.lineItems.length === 0) {
      errors.push(this.createValidationError('lineItems', 'At least one line item is required', 'EMPTY_ENTRY'));
    }
    
    // Validate debits = credits
    let totalDebits = 0;
    let totalCredits = 0;
    
    for (const item of entry.lineItems || []) {
      totalDebits += item.debitCents;
      totalCredits += item.creditCents;
      
      if (!item.accountCode) {
        errors.push(this.createValidationError('lineItems.accountCode', 'Account code is required', 'REQUIRED_FIELD'));
      }
    }
    
    if (totalDebits !== totalCredits) {
      errors.push(this.createValidationError('balance', `Debits (${totalDebits}) must equal credits (${totalCredits})`, 'UNBALANCED_ENTRY'));
    }
    
    if (errors.length > 0) {
      return this.validationFailure(errors);
    }
    
    return this.validationSuccess();
  }
  
  transform(entry: AccountingEntry): TransformationResult<QBJournalEntry> {
    const lineItems: QBLineItem[] = [];
    
    for (const item of entry.lineItems) {
      if (item.debitCents > 0) {
        lineItems.push({
          description: item.description,
          amount: (item.debitCents / 100).toFixed(2),
          postingType: 'Debit',
          accountRef: item.accountCode,
          classRef: item.class,
          departmentRef: item.department,
        });
      }
      
      if (item.creditCents > 0) {
        lineItems.push({
          description: item.description,
          amount: (item.creditCents / 100).toFixed(2),
          postingType: 'Credit',
          accountRef: item.accountCode,
          classRef: item.class,
          departmentRef: item.department,
        });
      }
    }
    
    const output: QBJournalEntry = {
      txnDate: entry.date,
      docNumber: entry.entryId,
      privateNote: `${entry.description} | Ref: ${entry.reference} | Source: ${entry.source}`,
      lineItems,
    };
    
    return this.transformSuccess(output);
  }
  
  transmit(entry: QBJournalEntry): TransmissionResult {
    // In production, this would call QuickBooks API
    const transactionId = `QB_${Date.now()}_${entry.docNumber}`;
    
    return this.createTransmissionResult(
      true,
      200,
      { id: transactionId, docNumber: entry.docNumber, status: 'POSTED' },
      transactionId,
      Math.random() * 150 + 50
    );
  }
  
  confirm(receipt: TransmissionResult): ConfirmationResult {
    if (!receipt.success) {
      return this.createConfirmationResult(false, null, { error: 'QuickBooks posting failed' });
    }
    
    return this.createConfirmationResult(
      true,
      `QB_CONF_${receipt.transactionId}`,
      { postedAt: new Date().toISOString(), status: 'CONFIRMED' }
    );
  }
  
  /** Generate IIF (Intuit Interchange Format) for import */
  static generateIIF(entries: QBJournalEntry[]): string {
    const lines: string[] = [];
    
    lines.push('!TRNS\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tMEMO');
    lines.push('!SPL\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tMEMO');
    lines.push('!ENDTRNS');
    
    for (const entry of entries) {
      for (const item of entry.lineItems) {
        const amount = item.postingType === 'Debit' ? item.amount : `-${item.amount}`;
        lines.push(`TRNS\tGENERAL JOURNAL\t${entry.txnDate}\t${item.accountRef}\t${amount}\t${item.description}`);
      }
      lines.push('ENDTRNS');
    }
    
    return lines.join('\n');
  }
  
  /** Generate CSV for QuickBooks Online import */
  static generateCSV(entries: QBJournalEntry[]): string {
    const headers = ['Date', 'Transaction Type', 'Num', 'Account', 'Debit', 'Credit', 'Memo'];
    const rows: string[] = [headers.join(',')];
    
    for (const entry of entries) {
      for (const item of entry.lineItems) {
        const debit = item.postingType === 'Debit' ? item.amount : '';
        const credit = item.postingType === 'Credit' ? item.amount : '';
        rows.push([
          entry.txnDate,
          'Journal Entry',
          entry.docNumber,
          item.accountRef,
          debit,
          credit,
          `"${item.description}"`
        ].join(','));
      }
    }
    
    return rows.join('\n');
  }
}

// ============================================
// INTEGRATION HEALTH MONITORING
// ============================================

/** Drift event type */
export type DriftEventType = 
  | 'FIELD_MISMATCH'
  | 'MISSING_FIELD'
  | 'EXTRA_FIELD'
  | 'TYPE_MISMATCH'
  | 'VALUE_DRIFT'
  | 'COUNT_MISMATCH'
  | 'SCHEMA_CHANGE';

/** Drift severity */
export type DriftSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

/** Drift event */
export interface DriftEvent {
  id: string;
  type: DriftEventType;
  severity: DriftSeverity;
  timestamp: string;
  field: string;
  baselineValue: unknown;
  currentValue: unknown;
  description: string;
  adapterId?: string;
}

/** Baseline snapshot for drift detection */
export interface BaselineSnapshot {
  id: string;
  adapterId: string;
  createdAt: string;
  schema: Record<string, string>; // field -> type
  sampleValues: Record<string, unknown>;
  recordCount: number;
  checksum?: string;
}

/** Integration health status */
export interface IntegrationHealth {
  adapterId: string;
  adapterName: string;
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN';
  lastCheck: string;
  lastSuccess: string | null;
  lastFailure: string | null;
  successRate24h: number;
  avgLatencyMs: number;
  recentDriftEvents: DriftEvent[];
  errorCount24h: number;
}

// Storage for baselines and health data
const baselineSnapshots: Map<string, BaselineSnapshot> = new Map();
const healthChecks: Map<string, IntegrationHealth> = new Map();

/** Generate drift event ID */
function generateDriftId(): string {
  return `drift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Detect drift between current data and baseline.
 */
export function detectDrift(
  current: Record<string, unknown>,
  baseline: Record<string, unknown>,
  adapterId?: string
): DriftEvent[] {
  const events: DriftEvent[] = [];
  const now = new Date().toISOString();
  
  const currentKeys = Object.keys(current);
  const baselineKeys = Object.keys(baseline);
  const currentKeySet = new Set(currentKeys);
  const baselineKeySet = new Set(baselineKeys);
  
  // Check for missing fields (in baseline but not in current)
  for (const key of baselineKeys) {
    if (!currentKeySet.has(key)) {
      events.push({
        id: generateDriftId(),
        type: 'MISSING_FIELD',
        severity: 'WARNING',
        timestamp: now,
        field: key,
        baselineValue: baseline[key],
        currentValue: undefined,
        description: `Field '${key}' is missing from current data`,
        adapterId,
      });
    }
  }
  
  // Check for extra fields (in current but not in baseline)
  for (const key of currentKeys) {
    if (!baselineKeySet.has(key)) {
      events.push({
        id: generateDriftId(),
        type: 'EXTRA_FIELD',
        severity: 'INFO',
        timestamp: now,
        field: key,
        baselineValue: undefined,
        currentValue: current[key],
        description: `New field '${key}' found in current data`,
        adapterId,
      });
    }
  }
  
  // Check for type and value drift
  for (const key of currentKeys) {
    if (baselineKeySet.has(key)) {
      const currentVal = current[key];
      const baselineVal = baseline[key];
      
      const currentType = typeof currentVal;
      const baselineType = typeof baselineVal;
      
      if (currentType !== baselineType) {
        events.push({
          id: generateDriftId(),
          type: 'TYPE_MISMATCH',
          severity: 'ERROR',
          timestamp: now,
          field: key,
          baselineValue: baselineVal,
          currentValue: currentVal,
          description: `Type changed from '${baselineType}' to '${currentType}' for field '${key}'`,
          adapterId,
        });
      } else if (currentType === 'number') {
        // Check for significant value drift (>10% change)
        const numBaseline = baselineVal as number;
        const numCurrent = currentVal as number;
        
        if (numBaseline !== 0) {
          const drift = Math.abs((numCurrent - numBaseline) / numBaseline);
          if (drift > 0.1) {
            events.push({
              id: generateDriftId(),
              type: 'VALUE_DRIFT',
              severity: drift > 0.5 ? 'WARNING' : 'INFO',
              timestamp: now,
              field: key,
              baselineValue: numBaseline,
              currentValue: numCurrent,
              description: `Value drift of ${(drift * 100).toFixed(1)}% detected for field '${key}'`,
              adapterId,
            });
          }
        }
      } else if (currentType === 'string' && currentVal !== baselineVal) {
        events.push({
          id: generateDriftId(),
          type: 'FIELD_MISMATCH',
          severity: 'INFO',
          timestamp: now,
          field: key,
          baselineValue: baselineVal,
          currentValue: currentVal,
          description: `Value changed for field '${key}'`,
          adapterId,
        });
      }
    }
  }
  
  return events;
}

/**
 * Detect drift between arrays of records.
 */
export function detectArrayDrift(
  current: Record<string, unknown>[],
  baseline: Record<string, unknown>[],
  adapterId?: string
): DriftEvent[] {
  const events: DriftEvent[] = [];
  const now = new Date().toISOString();
  
  // Check count mismatch
  if (current.length !== baseline.length) {
    events.push({
      id: generateDriftId(),
      type: 'COUNT_MISMATCH',
      severity: Math.abs(current.length - baseline.length) > baseline.length * 0.2 ? 'WARNING' : 'INFO',
      timestamp: now,
      field: 'recordCount',
      baselineValue: baseline.length,
      currentValue: current.length,
      description: `Record count changed from ${baseline.length} to ${current.length}`,
      adapterId,
    });
  }
  
  // Check schema drift using first record of each
  if (current.length > 0 && baseline.length > 0) {
    const schemaDrift = detectDrift(
      Object.fromEntries(Object.keys(current[0]).map(k => [k, typeof current[0][k]])),
      Object.fromEntries(Object.keys(baseline[0]).map(k => [k, typeof baseline[0][k]])),
      adapterId
    );
    
    for (const event of schemaDrift) {
      if (event.type === 'MISSING_FIELD' || event.type === 'EXTRA_FIELD' || event.type === 'TYPE_MISMATCH') {
        events.push({
          ...event,
          type: 'SCHEMA_CHANGE',
          severity: 'WARNING',
          description: `Schema change: ${event.description}`,
        });
      }
    }
  }
  
  return events;
}

/**
 * Create a baseline snapshot from current data.
 */
export function createBaseline(
  adapterId: string,
  data: Record<string, unknown> | Record<string, unknown>[]
): BaselineSnapshot {
  const isArray = Array.isArray(data);
  const sample = isArray ? (data[0] || {}) : data;
  
  const schema: Record<string, string> = {};
  for (const [key, value] of Object.entries(sample)) {
    schema[key] = typeof value;
  }
  
  const baseline: BaselineSnapshot = {
    id: `baseline_${adapterId}_${Date.now()}`,
    adapterId,
    createdAt: new Date().toISOString(),
    schema,
    sampleValues: sample,
    recordCount: isArray ? data.length : 1,
  };
  
  baselineSnapshots.set(adapterId, baseline);
  return baseline;
}

/**
 * Get baseline for an adapter.
 */
export function getBaseline(adapterId: string): BaselineSnapshot | null {
  return baselineSnapshots.get(adapterId) || null;
}

/**
 * Check integration health for an adapter.
 */
export function checkIntegrationHealth(adapterId: string): IntegrationHealth {
  const adapter = getAdapter(adapterId);
  const stats = getAdapterStatistics(adapterId);
  const baseline = getBaseline(adapterId);
  
  const now = new Date().toISOString();
  
  let status: IntegrationHealth['status'] = 'UNKNOWN';
  let successRate24h = 0;
  let avgLatencyMs = 0;
  let errorCount24h = 0;
  let recentDriftEvents: DriftEvent[] = [];
  
  if (stats) {
    successRate24h = stats.successRate;
    avgLatencyMs = stats.averageLatencyMs;
    errorCount24h = stats.failedExecutions;
    
    if (successRate24h >= 95) {
      status = 'HEALTHY';
    } else if (successRate24h >= 80) {
      status = 'DEGRADED';
    } else if (successRate24h > 0) {
      status = 'UNHEALTHY';
    }
  }
  
  if (!adapter) {
    status = 'UNKNOWN';
  }
  
  const health: IntegrationHealth = {
    adapterId,
    adapterName: adapter?.config.name || 'Unknown',
    status,
    lastCheck: now,
    lastSuccess: stats?.totalExecutions ? now : null,
    lastFailure: stats?.failedExecutions ? now : null,
    successRate24h,
    avgLatencyMs,
    recentDriftEvents,
    errorCount24h,
  };
  
  healthChecks.set(adapterId, health);
  return health;
}

/**
 * Get all integration health statuses.
 */
export function getAllIntegrationHealth(): IntegrationHealth[] {
  const adapters = listAdapters();
  return adapters.map(a => checkIntegrationHealth(a.id));
}

/**
 * Clear all health and baseline data (for testing).
 */
export function clearHealthData(): void {
  baselineSnapshots.clear();
  healthChecks.clear();
}

// ============================================
// ADAPTER INITIALIZATION
// ============================================

/** Initialize and register all adapters */
export function initializeAdapters(): void {
  try { registerAdapter(new ADPPayrollAdapter()); } catch (e) { /* Already registered */ }
  try { registerAdapter(new OpenForceAdapter()); } catch (e) { /* Already registered */ }
  try { registerAdapter(new ACHBankAdapter()); } catch (e) { /* Already registered */ }
  try { registerAdapter(new QuickBooksAdapter()); } catch (e) { /* Already registered */ }
}

/** Get adapter by type */
export function getPayrollAdapter(employeeType: EmployeeType): string {
  return employeeType === 'W2' ? 'adp-payroll' : 'openforce-payments';
}
