import { describe, it, expect, beforeEach } from 'vitest';
import {
  ADPPayrollAdapter,
  OpenForceAdapter,
  ACHBankAdapter,
  QuickBooksAdapter,
  detectDrift,
  detectArrayDrift,
  createBaseline,
  getBaseline,
  checkIntegrationHealth,
  getAllIntegrationHealth,
  clearHealthData,
  initializeAdapters,
  getPayrollAdapter,
  type PayrollExportRecord,
  type AccountingEntry,
  type ACHPaymentRecord,
  type DriftEvent,
} from './externalIntegrations';

import { clearAdapterRegistry, clearAllReceipts, registerAdapter, executeIntegration } from './integrationAdapter';

// ============================================
// TEST FIXTURES
// ============================================

function createW2PayrollRecord(overrides: Partial<PayrollExportRecord> = {}): PayrollExportRecord {
  return {
    employeeId: 'EMP001',
    employeeType: 'W2',
    firstName: 'John',
    lastName: 'Doe',
    ssn: '123-45-6789',
    payPeriodStart: '2024-01-01',
    payPeriodEnd: '2024-01-14',
    regularHours: 80,
    overtimeHours: 5,
    regularPayCents: 200000,
    overtimePayCents: 37500,
    bonusCents: 5000,
    deductionsCents: 50000,
    netPayCents: 192500,
    marketId: 'denver',
    costCenter: 'DENVER01',
    ...overrides,
  };
}

function createICPayrollRecord(overrides: Partial<PayrollExportRecord> = {}): PayrollExportRecord {
  return {
    employeeId: 'IC001',
    employeeType: 'IC',
    firstName: 'Jane',
    lastName: 'Smith',
    ssn: '987-65-4321',
    payPeriodStart: '2024-01-01',
    payPeriodEnd: '2024-01-14',
    regularHours: 0,
    overtimeHours: 0,
    regularPayCents: 0,
    overtimePayCents: 0,
    bonusCents: 0,
    deductionsCents: 0,
    netPayCents: 250000,
    marketId: 'phoenix',
    ...overrides,
  };
}

function createAccountingEntry(overrides: Partial<AccountingEntry> = {}): AccountingEntry {
  return {
    entryId: 'JE-001',
    date: '2024-01-15',
    description: 'Payroll expense',
    reference: 'PAY-2024-01',
    source: 'PayrollEngine',
    lineItems: [
      { accountCode: '6000', accountName: 'Wages Expense', debitCents: 100000, creditCents: 0, description: 'Regular wages' },
      { accountCode: '2000', accountName: 'Cash', debitCents: 0, creditCents: 100000, description: 'Cash payment' },
    ],
    ...overrides,
  };
}

function createACHPayment(overrides: Partial<ACHPaymentRecord> = {}): ACHPaymentRecord {
  return {
    paymentId: 'PAY001',
    recipientId: 'RCP001',
    recipientName: 'John Doe',
    routingNumber: '123456789',
    accountNumber: '9876543210',
    accountType: 'CHECKING',
    amountCents: 100000,
    effectiveDate: '2024-01-15',
    description: 'Payroll',
    ...overrides,
  };
}

// ============================================
// ADP ADAPTER TESTS
// ============================================

describe('ADP Payroll Adapter', () => {
  let adapter: ADPPayrollAdapter;
  
  beforeEach(() => {
    adapter = new ADPPayrollAdapter();
    clearAdapterRegistry();
    clearAllReceipts();
  });

  describe('Configuration', () => {
    it('should have correct adapter config', () => {
      expect(adapter.config.id).toBe('adp-payroll');
      expect(adapter.config.enabled).toBe(true);
      expect(adapter.config.validateBeforeTransform).toBe(true);
    });

    it('should allow setting company code', () => {
      adapter.setCompanyCode('TESTCO');
      const result = adapter.transform(createW2PayrollRecord());
      expect(result.output?.companyCode).toBe('TESTCO');
    });
  });

  describe('Validation', () => {
    it('should validate valid W2 record', () => {
      const result = adapter.validate(createW2PayrollRecord());
      expect(result.valid).toBe(true);
    });

    it('should reject IC employees', () => {
      const result = adapter.validate(createICPayrollRecord());
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_EMPLOYEE_TYPE');
    });

    it('should require employee ID', () => {
      const result = adapter.validate(createW2PayrollRecord({ employeeId: '' }));
      expect(result.valid).toBe(false);
    });

    it('should require name', () => {
      const result = adapter.validate(createW2PayrollRecord({ firstName: '' }));
      expect(result.valid).toBe(false);
    });

    it('should reject negative net pay', () => {
      const result = adapter.validate(createW2PayrollRecord({ netPayCents: -100 }));
      expect(result.valid).toBe(false);
    });

    it('should warn on missing SSN', () => {
      const result = adapter.validate(createW2PayrollRecord({ ssn: undefined }));
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Transformation', () => {
    it('should transform to ADP format', () => {
      const result = adapter.transform(createW2PayrollRecord());
      expect(result.success).toBe(true);
      expect(result.output).not.toBeNull();
    });

    it('should format name correctly', () => {
      const result = adapter.transform(createW2PayrollRecord({ firstName: 'john', lastName: 'doe' }));
      expect(result.output?.firstName).toBe('JOHN');
      expect(result.output?.lastName).toBe('DOE');
    });

    it('should calculate gross pay', () => {
      const record = createW2PayrollRecord({
        regularPayCents: 200000,
        overtimePayCents: 50000,
        bonusCents: 10000,
      });
      const result = adapter.transform(record);
      expect(result.output?.grossPay).toBe('2600.00');
    });

    it('should format SSN without dashes', () => {
      const result = adapter.transform(createW2PayrollRecord({ ssn: '123-45-6789' }));
      expect(result.output?.ssn).toBe('123456789');
    });

    it('should pad file number', () => {
      const result = adapter.transform(createW2PayrollRecord({ employeeId: '123' }));
      expect(result.output?.fileNumber).toBe('000000123');
    });
  });

  describe('Transmission', () => {
    it('should transmit successfully', () => {
      const transformed = adapter.transform(createW2PayrollRecord());
      const result = adapter.transmit(transformed.output!);
      expect(result.success).toBe(true);
      expect(result.transactionId).toBeTruthy();
    });
  });

  describe('Confirmation', () => {
    it('should confirm successful transmission', () => {
      const transformed = adapter.transform(createW2PayrollRecord());
      const transmission = adapter.transmit(transformed.output!);
      const result = adapter.confirm(transmission);
      expect(result.confirmed).toBe(true);
      expect(result.confirmationId).toBeTruthy();
    });
  });

  describe('CSV Generation', () => {
    it('should generate valid CSV', () => {
      const records = [
        adapter.transform(createW2PayrollRecord()).output!,
        adapter.transform(createW2PayrollRecord({ employeeId: 'EMP002' })).output!,
      ];
      const csv = ADPPayrollAdapter.generateCSV(records);
      expect(csv).toContain('CompanyCode');
      expect(csv.split('\n').length).toBe(3);
    });
  });
});

// ============================================
// OPENFORCE ADAPTER TESTS
// ============================================

describe('OpenForce Adapter', () => {
  let adapter: OpenForceAdapter;
  
  beforeEach(() => {
    adapter = new OpenForceAdapter();
    clearAdapterRegistry();
    clearAllReceipts();
  });

  describe('Validation', () => {
    it('should validate valid IC record', () => {
      const result = adapter.validate(createICPayrollRecord());
      expect(result.valid).toBe(true);
    });

    it('should reject W2 employees', () => {
      const result = adapter.validate(createW2PayrollRecord());
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_EMPLOYEE_TYPE');
    });

    it('should require positive payment', () => {
      const result = adapter.validate(createICPayrollRecord({ netPayCents: 0 }));
      expect(result.valid).toBe(false);
    });
  });

  describe('Transformation', () => {
    it('should transform to OpenForce format', () => {
      const result = adapter.transform(createICPayrollRecord());
      expect(result.success).toBe(true);
      expect(result.output?.contractorId).toBe('IC001');
    });

    it('should format name correctly', () => {
      const result = adapter.transform(createICPayrollRecord({ firstName: 'Jane', lastName: 'Smith' }));
      expect(result.output?.contractorName).toBe('Smith, Jane');
    });

    it('should convert cents to dollars', () => {
      const result = adapter.transform(createICPayrollRecord({ netPayCents: 250000 }));
      expect(result.output?.grossAmountUSD).toBe('2500.00');
    });
  });

  describe('CSV Generation', () => {
    it('should generate valid CSV', () => {
      const records = [adapter.transform(createICPayrollRecord()).output!];
      const csv = OpenForceAdapter.generateCSV(records);
      expect(csv).toContain('ClientId');
    });
  });
});

// ============================================
// ACH ADAPTER TESTS
// ============================================

describe('ACH Bank Adapter', () => {
  let adapter: ACHBankAdapter;
  
  beforeEach(() => {
    adapter = new ACHBankAdapter();
    clearAdapterRegistry();
    clearAllReceipts();
  });

  describe('Configuration', () => {
    it('should be disabled by default', () => {
      expect(adapter.config.enabled).toBe(false);
    });

    it('should allow configuration', () => {
      adapter.configure('12345678', 'TEST COMPANY', '1234567890');
      const result = adapter.transform([createACHPayment()]);
      expect(result.output?.companyName).toBe('TEST COMPANY');
    });
  });

  describe('Validation', () => {
    it('should validate valid payments', () => {
      const result = adapter.validate([createACHPayment()]);
      expect(result.valid).toBe(true);
    });

    it('should reject empty batch', () => {
      const result = adapter.validate([]);
      expect(result.valid).toBe(false);
    });

    it('should validate routing number length', () => {
      const result = adapter.validate([createACHPayment({ routingNumber: '12345' })]);
      expect(result.valid).toBe(false);
    });

    it('should validate account number length', () => {
      const result = adapter.validate([createACHPayment({ accountNumber: '12' })]);
      expect(result.valid).toBe(false);
    });

    it('should reject zero amount', () => {
      const result = adapter.validate([createACHPayment({ amountCents: 0 })]);
      expect(result.valid).toBe(false);
    });

    it('should warn on large amounts', () => {
      const result = adapter.validate([createACHPayment({ amountCents: 100000000 })]);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Transformation', () => {
    it('should create NACHA batch', () => {
      const result = adapter.transform([createACHPayment()]);
      expect(result.success).toBe(true);
      expect(result.output?.records.length).toBeGreaterThan(0);
    });

    it('should calculate total credits', () => {
      const payments = [
        createACHPayment({ amountCents: 100000 }),
        createACHPayment({ amountCents: 200000 }),
      ];
      const result = adapter.transform(payments);
      expect(result.output?.totalCreditCents).toBe(300000);
    });
  });

  describe('Transmission', () => {
    it('should fail when disabled', () => {
      const batch = adapter.transform([createACHPayment()]).output!;
      const result = adapter.transmit(batch);
      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(403);
    });
  });
});

// ============================================
// QUICKBOOKS ADAPTER TESTS
// ============================================

describe('QuickBooks Adapter', () => {
  let adapter: QuickBooksAdapter;
  
  beforeEach(() => {
    adapter = new QuickBooksAdapter();
    clearAdapterRegistry();
    clearAllReceipts();
  });

  describe('Validation', () => {
    it('should validate valid entry', () => {
      const result = adapter.validate(createAccountingEntry());
      expect(result.valid).toBe(true);
    });

    it('should require entry ID', () => {
      const result = adapter.validate(createAccountingEntry({ entryId: '' }));
      expect(result.valid).toBe(false);
    });

    it('should require balanced entry', () => {
      const result = adapter.validate(createAccountingEntry({
        lineItems: [
          { accountCode: '6000', accountName: 'Expense', debitCents: 100000, creditCents: 0, description: 'test' },
          { accountCode: '2000', accountName: 'Cash', debitCents: 0, creditCents: 50000, description: 'test' },
        ],
      }));
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('UNBALANCED_ENTRY');
    });

    it('should require line items', () => {
      const result = adapter.validate(createAccountingEntry({ lineItems: [] }));
      expect(result.valid).toBe(false);
    });
  });

  describe('Transformation', () => {
    it('should transform to QB format', () => {
      const result = adapter.transform(createAccountingEntry());
      expect(result.success).toBe(true);
      expect(result.output?.txnDate).toBe('2024-01-15');
    });

    it('should separate debits and credits', () => {
      const result = adapter.transform(createAccountingEntry());
      const debits = result.output?.lineItems.filter(l => l.postingType === 'Debit');
      const credits = result.output?.lineItems.filter(l => l.postingType === 'Credit');
      expect(debits?.length).toBeGreaterThan(0);
      expect(credits?.length).toBeGreaterThan(0);
    });
  });

  describe('CSV/IIF Generation', () => {
    it('should generate IIF', () => {
      const entries = [adapter.transform(createAccountingEntry()).output!];
      const iif = QuickBooksAdapter.generateIIF(entries);
      expect(iif).toContain('!TRNS');
      expect(iif).toContain('ENDTRNS');
    });

    it('should generate CSV', () => {
      const entries = [adapter.transform(createAccountingEntry()).output!];
      const csv = QuickBooksAdapter.generateCSV(entries);
      expect(csv).toContain('Date');
      expect(csv).toContain('Journal Entry');
    });
  });
});

// ============================================
// DRIFT DETECTION TESTS
// ============================================

describe('Drift Detection', () => {
  beforeEach(() => {
    clearHealthData();
  });

  describe('detectDrift', () => {
    it('should detect missing fields', () => {
      const baseline = { name: 'test', value: 100 };
      const current = { name: 'test' };
      
      const events = detectDrift(current, baseline);
      expect(events.some(e => e.type === 'MISSING_FIELD' && e.field === 'value')).toBe(true);
    });

    it('should detect extra fields', () => {
      const baseline = { name: 'test' };
      const current = { name: 'test', newField: 'extra' };
      
      const events = detectDrift(current, baseline);
      expect(events.some(e => e.type === 'EXTRA_FIELD' && e.field === 'newField')).toBe(true);
    });

    it('should detect type mismatches', () => {
      const baseline = { value: 100 };
      const current = { value: '100' };
      
      const events = detectDrift(current, baseline);
      expect(events.some(e => e.type === 'TYPE_MISMATCH')).toBe(true);
    });

    it('should detect value drift', () => {
      const baseline = { value: 100 };
      const current = { value: 150 };
      
      const events = detectDrift(current, baseline);
      expect(events.some(e => e.type === 'VALUE_DRIFT')).toBe(true);
    });

    it('should not flag small value changes', () => {
      const baseline = { value: 100 };
      const current = { value: 105 };
      
      const events = detectDrift(current, baseline);
      expect(events.filter(e => e.type === 'VALUE_DRIFT').length).toBe(0);
    });

    it('should detect string field changes', () => {
      const baseline = { name: 'test' };
      const current = { name: 'changed' };
      
      const events = detectDrift(current, baseline);
      expect(events.some(e => e.type === 'FIELD_MISMATCH')).toBe(true);
    });

    it('should include adapter ID when provided', () => {
      const baseline = { value: 100 };
      const current = { value: 200 };
      
      const events = detectDrift(current, baseline, 'test-adapter');
      expect(events[0].adapterId).toBe('test-adapter');
    });
  });

  describe('detectArrayDrift', () => {
    it('should detect count mismatch', () => {
      const baseline = [{ id: 1 }, { id: 2 }];
      const current = [{ id: 1 }];
      
      const events = detectArrayDrift(current, baseline);
      expect(events.some(e => e.type === 'COUNT_MISMATCH')).toBe(true);
    });

    it('should detect schema changes', () => {
      const baseline = [{ id: 1, name: 'test' }];
      const current = [{ id: 1, title: 'test' }];
      
      const events = detectArrayDrift(current, baseline);
      expect(events.some(e => e.type === 'SCHEMA_CHANGE')).toBe(true);
    });
  });
});

// ============================================
// BASELINE MANAGEMENT TESTS
// ============================================

describe('Baseline Management', () => {
  beforeEach(() => {
    clearHealthData();
  });

  it('should create baseline from object', () => {
    const data = { name: 'test', value: 100 };
    const baseline = createBaseline('test-adapter', data);
    
    expect(baseline.adapterId).toBe('test-adapter');
    expect(baseline.schema.name).toBe('string');
    expect(baseline.schema.value).toBe('number');
  });

  it('should create baseline from array', () => {
    const data = [{ id: 1 }, { id: 2 }];
    const baseline = createBaseline('test-adapter', data);
    
    expect(baseline.recordCount).toBe(2);
  });

  it('should retrieve stored baseline', () => {
    createBaseline('test-adapter', { value: 100 });
    const baseline = getBaseline('test-adapter');
    
    expect(baseline).not.toBeNull();
    expect(baseline?.adapterId).toBe('test-adapter');
  });

  it('should return null for missing baseline', () => {
    const baseline = getBaseline('non-existent');
    expect(baseline).toBeNull();
  });
});

// ============================================
// INTEGRATION HEALTH TESTS
// ============================================

describe('Integration Health', () => {
  beforeEach(() => {
    clearAdapterRegistry();
    clearAllReceipts();
    clearHealthData();
  });

  it('should check health for registered adapter', () => {
    registerAdapter(new ADPPayrollAdapter());
    const health = checkIntegrationHealth('adp-payroll');
    
    expect(health.adapterId).toBe('adp-payroll');
    expect(health.adapterName).toBe('ADP Payroll Export');
  });

  it('should return unknown status for unregistered adapter', () => {
    const health = checkIntegrationHealth('non-existent');
    expect(health.status).toBe('UNKNOWN');
  });

  it('should get all integration health', () => {
    initializeAdapters();
    const health = getAllIntegrationHealth();
    
    expect(health.length).toBeGreaterThan(0);
  });

  it('should track success rate', async () => {
    registerAdapter(new ADPPayrollAdapter());
    
    await executeIntegration('adp-payroll', createW2PayrollRecord());
    
    const health = checkIntegrationHealth('adp-payroll');
    expect(health.successRate24h).toBeGreaterThan(0);
  });
});

// ============================================
// ADAPTER INITIALIZATION TESTS
// ============================================

describe('Adapter Initialization', () => {
  beforeEach(() => {
    clearAdapterRegistry();
    clearAllReceipts();
    clearHealthData();
  });

  it('should initialize all adapters', () => {
    initializeAdapters();
    
    expect(getPayrollAdapter('W2')).toBe('adp-payroll');
    expect(getPayrollAdapter('IC')).toBe('openforce-payments');
  });

  it('should handle double initialization', () => {
    initializeAdapters();
    expect(() => initializeAdapters()).not.toThrow();
  });
});

// ============================================
// FULL INTEGRATION TESTS
// ============================================

describe('Full Integration Flow', () => {
  beforeEach(() => {
    clearAdapterRegistry();
    clearAllReceipts();
    clearHealthData();
    initializeAdapters();
  });

  it('should execute ADP integration end-to-end', async () => {
    const receipt = await executeIntegration('adp-payroll', createW2PayrollRecord());
    
    expect(receipt.status).toBe('CONFIRMED');
    expect(receipt.transformedPayload).not.toBeNull();
  });

  it('should execute OpenForce integration end-to-end', async () => {
    const receipt = await executeIntegration('openforce-payments', createICPayrollRecord());
    
    expect(receipt.status).toBe('CONFIRMED');
  });

  it('should execute QuickBooks integration end-to-end', async () => {
    const receipt = await executeIntegration('quickbooks-accounting', createAccountingEntry());
    
    expect(receipt.status).toBe('CONFIRMED');
  });

  it('should route to correct adapter by employee type', async () => {
    const w2Receipt = await executeIntegration(getPayrollAdapter('W2'), createW2PayrollRecord());
    const icReceipt = await executeIntegration(getPayrollAdapter('IC'), createICPayrollRecord());
    
    expect(w2Receipt.adapterName).toBe('ADP Payroll Export');
    expect(icReceipt.adapterName).toBe('OpenForce IC Payments');
  });
});
