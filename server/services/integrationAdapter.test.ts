import { describe, it, expect, beforeEach } from 'vitest';
import {
  BaseIntegrationAdapter,
  registerAdapter,
  unregisterAdapter,
  getAdapter,
  listAdapters,
  clearAdapterRegistry,
  createReceipt,
  updateReceiptStatus,
  addReceiptError,
  getReceipt,
  listReceiptsByAdapter,
  listFailedReceipts,
  listRetryableReceipts,
  clearAllReceipts,
  executeIntegration,
  retryIntegration,
  executeBatch,
  getAdapterStatistics,
  type AdapterConfig,
  type ValidationResult,
  type TransformationResult,
  type TransmissionResult,
  type ConfirmationResult,
  type IntegrationReceipt,
  type ExecutionOptions,
} from './integrationAdapter';

// ============================================
// TEST ADAPTERS
// ============================================

interface TestInput {
  id: string;
  name: string;
  value: number;
}

interface TestOutput {
  externalId: string;
  displayName: string;
  amount: number;
}

class SuccessfulTestAdapter extends BaseIntegrationAdapter<TestInput, TestOutput> {
  readonly config: AdapterConfig = {
    id: 'test-success',
    name: 'Successful Test Adapter',
    description: 'A test adapter that always succeeds',
    version: '1.0.0',
    enabled: true,
    maxRetries: 3,
    retryDelayMs: 1000,
    timeoutMs: 30000,
    validateBeforeTransform: true,
    requireConfirmation: true,
  };
  
  validate(payload: TestInput): ValidationResult {
    if (!payload.id) {
      return this.validationFailure([
        this.createValidationError('id', 'ID is required', 'REQUIRED_FIELD'),
      ]);
    }
    if (payload.value < 0) {
      return this.validationFailure([
        this.createValidationError('value', 'Value must be positive', 'INVALID_VALUE'),
      ]);
    }
    return this.validationSuccess();
  }
  
  transform(payload: TestInput): TransformationResult<TestOutput> {
    return this.transformSuccess({
      externalId: `EXT_${payload.id}`,
      displayName: payload.name.toUpperCase(),
      amount: payload.value * 100,
    }, [
      { sourceField: 'id', targetField: 'externalId', transformation: 'prefix', sourceValue: payload.id, targetValue: `EXT_${payload.id}` },
      { sourceField: 'name', targetField: 'displayName', transformation: 'uppercase', sourceValue: payload.name, targetValue: payload.name.toUpperCase() },
      { sourceField: 'value', targetField: 'amount', transformation: 'multiply', sourceValue: payload.value, targetValue: payload.value * 100 },
    ]);
  }
  
  transmit(payload: TestOutput): TransmissionResult {
    return this.createTransmissionResult(true, 200, { success: true, id: payload.externalId }, `txn_${Date.now()}`, 150);
  }
  
  confirm(receipt: TransmissionResult): ConfirmationResult {
    return this.createConfirmationResult(true, `conf_${Date.now()}`, { verified: true });
  }
}

class FailingValidationAdapter extends BaseIntegrationAdapter<TestInput, TestOutput> {
  readonly config: AdapterConfig = {
    id: 'test-fail-validation',
    name: 'Failing Validation Adapter',
    description: 'A test adapter that fails validation',
    version: '1.0.0',
    enabled: true,
    maxRetries: 3,
    retryDelayMs: 1000,
    timeoutMs: 30000,
    validateBeforeTransform: true,
    requireConfirmation: true,
  };
  
  validate(payload: TestInput): ValidationResult {
    return this.validationFailure([
      this.createValidationError('always', 'This always fails', 'ALWAYS_FAILS'),
    ]);
  }
  
  transform(payload: TestInput): TransformationResult<TestOutput> {
    return this.transformSuccess({ externalId: 'x', displayName: 'x', amount: 0 });
  }
  
  transmit(payload: TestOutput): TransmissionResult {
    return this.createTransmissionResult(true, 200, {}, 'txn', 100);
  }
  
  confirm(receipt: TransmissionResult): ConfirmationResult {
    return this.createConfirmationResult(true);
  }
}

class FailingTransmissionAdapter extends BaseIntegrationAdapter<TestInput, TestOutput> {
  readonly config: AdapterConfig = {
    id: 'test-fail-transmission',
    name: 'Failing Transmission Adapter',
    description: 'A test adapter that fails transmission',
    version: '1.0.0',
    enabled: true,
    maxRetries: 3,
    retryDelayMs: 1000,
    timeoutMs: 30000,
    validateBeforeTransform: true,
    requireConfirmation: true,
  };
  
  validate(payload: TestInput): ValidationResult {
    return this.validationSuccess();
  }
  
  transform(payload: TestInput): TransformationResult<TestOutput> {
    return this.transformSuccess({ externalId: 'x', displayName: 'x', amount: 0 });
  }
  
  transmit(payload: TestOutput): TransmissionResult {
    return this.createTransmissionResult(false, 500, { error: 'Server Error' }, null, 200);
  }
  
  confirm(receipt: TransmissionResult): ConfirmationResult {
    return this.createConfirmationResult(true);
  }
}

class DisabledAdapter extends BaseIntegrationAdapter<TestInput, TestOutput> {
  readonly config: AdapterConfig = {
    id: 'test-disabled',
    name: 'Disabled Adapter',
    description: 'A disabled adapter',
    version: '1.0.0',
    enabled: false,
    maxRetries: 0,
    retryDelayMs: 0,
    timeoutMs: 30000,
    validateBeforeTransform: true,
    requireConfirmation: true,
  };
  
  validate(payload: TestInput): ValidationResult {
    return this.validationSuccess();
  }
  
  transform(payload: TestInput): TransformationResult<TestOutput> {
    return this.transformSuccess({ externalId: 'x', displayName: 'x', amount: 0 });
  }
  
  transmit(payload: TestOutput): TransmissionResult {
    return this.createTransmissionResult(true, 200, {}, 'txn', 100);
  }
  
  confirm(receipt: TransmissionResult): ConfirmationResult {
    return this.createConfirmationResult(true);
  }
}

// ============================================
// TESTS
// ============================================

describe('IntegrationAdapter', () => {
  beforeEach(() => {
    clearAdapterRegistry();
    clearAllReceipts();
  });

  describe('Adapter Registration', () => {
    it('should register an adapter', () => {
      const adapter = new SuccessfulTestAdapter();
      registerAdapter(adapter);
      
      const retrieved = getAdapter<TestInput, TestOutput, TransmissionResult>('test-success');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.config.id).toBe('test-success');
    });

    it('should prevent duplicate registration', () => {
      const adapter = new SuccessfulTestAdapter();
      registerAdapter(adapter);
      
      expect(() => registerAdapter(adapter)).toThrow("already registered");
    });

    it('should unregister an adapter', () => {
      const adapter = new SuccessfulTestAdapter();
      registerAdapter(adapter);
      
      const result = unregisterAdapter('test-success');
      expect(result).toBe(true);
      
      const retrieved = getAdapter('test-success');
      expect(retrieved).toBeNull();
    });

    it('should list all registered adapters', () => {
      registerAdapter(new SuccessfulTestAdapter());
      registerAdapter(new FailingValidationAdapter());
      
      const adapters = listAdapters();
      expect(adapters).toHaveLength(2);
      expect(adapters.map(a => a.id)).toContain('test-success');
      expect(adapters.map(a => a.id)).toContain('test-fail-validation');
    });

    it('should return null for non-existent adapter', () => {
      const adapter = getAdapter('non-existent');
      expect(adapter).toBeNull();
    });
  });

  describe('Validation', () => {
    it('should validate valid input', () => {
      const adapter = new SuccessfulTestAdapter();
      const result = adapter.validate({ id: '123', name: 'Test', value: 100 });
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing required fields', () => {
      const adapter = new SuccessfulTestAdapter();
      const result = adapter.validate({ id: '', name: 'Test', value: 100 });
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('REQUIRED_FIELD');
    });

    it('should reject invalid values', () => {
      const adapter = new SuccessfulTestAdapter();
      const result = adapter.validate({ id: '123', name: 'Test', value: -10 });
      
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_VALUE');
    });
  });

  describe('Transformation', () => {
    it('should transform input to output format', () => {
      const adapter = new SuccessfulTestAdapter();
      const result = adapter.transform({ id: '123', name: 'Test', value: 100 });
      
      expect(result.success).toBe(true);
      expect(result.output).not.toBeNull();
      expect(result.output?.externalId).toBe('EXT_123');
      expect(result.output?.displayName).toBe('TEST');
      expect(result.output?.amount).toBe(10000);
    });

    it('should record field mappings', () => {
      const adapter = new SuccessfulTestAdapter();
      const result = adapter.transform({ id: '123', name: 'Test', value: 100 });
      
      expect(result.mappings.length).toBeGreaterThan(0);
      const idMapping = result.mappings.find(m => m.sourceField === 'id');
      expect(idMapping?.transformation).toBe('prefix');
    });
  });

  describe('Transmission', () => {
    it('should transmit successfully', () => {
      const adapter = new SuccessfulTestAdapter();
      const result = adapter.transmit({ externalId: 'EXT_123', displayName: 'TEST', amount: 10000 });
      
      expect(result.success).toBe(true);
      expect(result.transactionId).toBeTruthy();
      expect(result.statusCode).toBe(200);
    });

    it('should report transmission failure', () => {
      const adapter = new FailingTransmissionAdapter();
      const result = adapter.transmit({ externalId: 'x', displayName: 'x', amount: 0 });
      
      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(500);
    });
  });

  describe('Confirmation', () => {
    it('should confirm successfully', () => {
      const adapter = new SuccessfulTestAdapter();
      const transmitResult = adapter.transmit({ externalId: 'EXT_123', displayName: 'TEST', amount: 10000 });
      const result = adapter.confirm(transmitResult);
      
      expect(result.confirmed).toBe(true);
      expect(result.confirmationId).toBeTruthy();
      expect(result.confirmationTimestamp).toBeTruthy();
    });
  });

  describe('Receipt Management', () => {
    it('should create a receipt', () => {
      const receipt = createReceipt<TestInput, TestOutput>(
        'test-adapter',
        'Test Adapter',
        { id: '123', name: 'Test', value: 100 },
        3
      );
      
      expect(receipt.id).toBeTruthy();
      expect(receipt.status).toBe('PENDING');
      expect(receipt.originalPayload.id).toBe('123');
    });

    it('should update receipt status', () => {
      const receipt = createReceipt<TestInput, TestOutput>(
        'test-adapter',
        'Test Adapter',
        { id: '123', name: 'Test', value: 100 },
        3
      );
      
      const updated = updateReceiptStatus(receipt.id, 'VALIDATED');
      expect(updated?.status).toBe('VALIDATED');
    });

    it('should add errors to receipt', () => {
      const receipt = createReceipt<TestInput, TestOutput>(
        'test-adapter',
        'Test Adapter',
        { id: '123', name: 'Test', value: 100 },
        3
      );
      
      addReceiptError(receipt.id, 'VALIDATION', 'Test error', 'TEST_ERROR');
      
      const retrieved = getReceipt<TestInput, TestOutput>(receipt.id);
      expect(retrieved?.errors).toHaveLength(1);
      expect(retrieved?.lastError).toBe('Test error');
    });

    it('should list receipts by adapter', () => {
      createReceipt('adapter-1', 'Adapter 1', {}, 3);
      createReceipt('adapter-1', 'Adapter 1', {}, 3);
      createReceipt('adapter-2', 'Adapter 2', {}, 3);
      
      const receipts = listReceiptsByAdapter('adapter-1');
      expect(receipts).toHaveLength(2);
    });

    it('should list failed receipts', () => {
      const receipt1 = createReceipt('adapter-1', 'Adapter 1', {}, 3);
      const receipt2 = createReceipt('adapter-1', 'Adapter 1', {}, 3);
      
      updateReceiptStatus(receipt1.id, 'FAILED');
      updateReceiptStatus(receipt2.id, 'CONFIRMED');
      
      const failed = listFailedReceipts();
      expect(failed).toHaveLength(1);
      expect(failed[0].id).toBe(receipt1.id);
    });

    it('should list retryable receipts', () => {
      const receipt = createReceipt('adapter-1', 'Adapter 1', {}, 3);
      updateReceiptStatus(receipt.id, 'FAILED');
      addReceiptError(receipt.id, 'TRANSMISSION', 'Recoverable error', 'ERROR', {}, true);
      
      const retryable = listRetryableReceipts();
      expect(retryable).toHaveLength(1);
    });

    it('should not list non-recoverable as retryable', () => {
      const receipt = createReceipt('adapter-1', 'Adapter 1', {}, 3);
      updateReceiptStatus(receipt.id, 'FAILED');
      addReceiptError(receipt.id, 'VALIDATION', 'Non-recoverable error', 'ERROR', {}, false);
      
      const retryable = listRetryableReceipts();
      expect(retryable).toHaveLength(0);
    });
  });

  describe('Execution Orchestration', () => {
    it('should execute integration successfully', async () => {
      registerAdapter(new SuccessfulTestAdapter());
      
      const receipt = await executeIntegration<TestInput, TestOutput, TransmissionResult>(
        'test-success',
        { id: '123', name: 'Test', value: 100 }
      );
      
      expect(receipt.status).toBe('CONFIRMED');
      expect(receipt.transformedPayload).not.toBeNull();
      expect(receipt.transmission?.success).toBe(true);
    });

    it('should fail on validation error', async () => {
      registerAdapter(new FailingValidationAdapter());
      
      const receipt = await executeIntegration<TestInput, TestOutput, TransmissionResult>(
        'test-fail-validation',
        { id: '123', name: 'Test', value: 100 }
      );
      
      expect(receipt.status).toBe('FAILED');
      expect(receipt.validation?.valid).toBe(false);
    });

    it('should fail on transmission error', async () => {
      registerAdapter(new FailingTransmissionAdapter());
      
      const receipt = await executeIntegration<TestInput, TestOutput, TransmissionResult>(
        'test-fail-transmission',
        { id: '123', name: 'Test', value: 100 }
      );
      
      expect(receipt.status).toBe('FAILED');
      expect(receipt.transmission?.success).toBe(false);
    });

    it('should throw for non-existent adapter', async () => {
      await expect(executeIntegration('non-existent', {})).rejects.toThrow('not found');
    });

    it('should throw for disabled adapter', async () => {
      registerAdapter(new DisabledAdapter());
      
      await expect(executeIntegration('test-disabled', {})).rejects.toThrow('disabled');
    });

    it('should support dry run', async () => {
      registerAdapter(new SuccessfulTestAdapter());
      
      const receipt = await executeIntegration<TestInput, TestOutput, TransmissionResult>(
        'test-success',
        { id: '123', name: 'Test', value: 100 },
        { dryRun: true }
      );
      
      expect(receipt.status).toBe('VALIDATED');
      expect(receipt.transmission).toBeNull();
    });

    it('should skip validation when requested', async () => {
      registerAdapter(new FailingValidationAdapter());
      
      const receipt = await executeIntegration<TestInput, TestOutput, TransmissionResult>(
        'test-fail-validation',
        { id: '123', name: 'Test', value: 100 },
        { skipValidation: true }
      );
      
      // Should proceed past validation
      expect(receipt.status).not.toBe('FAILED');
      expect(receipt.validation).toBeNull();
    });

    it('should include metadata in receipt', async () => {
      registerAdapter(new SuccessfulTestAdapter());
      
      const receipt = await executeIntegration<TestInput, TestOutput, TransmissionResult>(
        'test-success',
        { id: '123', name: 'Test', value: 100 },
        { metadata: { source: 'test', requestId: 'req_123' } }
      );
      
      expect(receipt.metadata.source).toBe('test');
      expect(receipt.metadata.requestId).toBe('req_123');
    });
  });

  describe('Retry Functionality', () => {
    it('should retry failed integration', async () => {
      registerAdapter(new SuccessfulTestAdapter());
      
      // Create a failed receipt manually
      const failedReceipt = createReceipt<TestInput, TestOutput>(
        'test-success',
        'Successful Test Adapter',
        { id: '123', name: 'Test', value: 100 },
        3
      );
      updateReceiptStatus(failedReceipt.id, 'FAILED');
      addReceiptError(failedReceipt.id, 'TRANSMISSION', 'Temporary error', 'TEMP_ERROR', {}, true);
      
      const newReceipt = await retryIntegration<TestInput, TestOutput, TransmissionResult>(failedReceipt.id);
      
      expect(newReceipt).not.toBeNull();
      expect(newReceipt?.status).toBe('CONFIRMED');
    });

    it('should not retry non-failed receipt', async () => {
      registerAdapter(new SuccessfulTestAdapter());
      
      const receipt = await executeIntegration<TestInput, TestOutput, TransmissionResult>(
        'test-success',
        { id: '123', name: 'Test', value: 100 }
      );
      
      await expect(retryIntegration(receipt.id)).rejects.toThrow('Cannot retry');
    });

    it('should return null for non-existent receipt', async () => {
      const result = await retryIntegration('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('Batch Execution', () => {
    it('should execute batch successfully', async () => {
      registerAdapter(new SuccessfulTestAdapter());
      
      const payloads: TestInput[] = [
        { id: '1', name: 'First', value: 100 },
        { id: '2', name: 'Second', value: 200 },
        { id: '3', name: 'Third', value: 300 },
      ];
      
      const result = await executeBatch<TestInput, TestOutput, TransmissionResult>('test-success', payloads);
      
      expect(result.totalCount).toBe(3);
      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(0);
      expect(result.receipts).toHaveLength(3);
    });

    it('should handle partial batch failures', async () => {
      registerAdapter(new SuccessfulTestAdapter());
      
      const payloads: TestInput[] = [
        { id: '1', name: 'Valid', value: 100 },
        { id: '', name: 'Invalid', value: 100 }, // Missing ID
        { id: '3', name: 'Valid', value: 300 },
      ];
      
      const result = await executeBatch<TestInput, TestOutput, TransmissionResult>('test-success', payloads);
      
      expect(result.totalCount).toBe(3);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
    });
  });

  describe('Adapter Statistics', () => {
    it('should return null for non-existent adapter', () => {
      const stats = getAdapterStatistics('non-existent');
      expect(stats).toBeNull();
    });

    it('should calculate statistics for adapter', async () => {
      registerAdapter(new SuccessfulTestAdapter());
      
      await executeIntegration<TestInput, TestOutput, TransmissionResult>(
        'test-success',
        { id: '1', name: 'Test', value: 100 }
      );
      await executeIntegration<TestInput, TestOutput, TransmissionResult>(
        'test-success',
        { id: '2', name: 'Test', value: 200 }
      );
      
      const stats = getAdapterStatistics('test-success');
      
      expect(stats).not.toBeNull();
      expect(stats?.totalExecutions).toBe(2);
      expect(stats?.successfulExecutions).toBe(2);
      expect(stats?.successRate).toBe(100);
    });

    it('should track failure rates', async () => {
      registerAdapter(new FailingValidationAdapter());
      
      await executeIntegration<TestInput, TestOutput, TransmissionResult>(
        'test-fail-validation',
        { id: '1', name: 'Test', value: 100 }
      );
      
      const stats = getAdapterStatistics('test-fail-validation');
      
      expect(stats?.failedExecutions).toBe(1);
      expect(stats?.successRate).toBe(0);
    });
  });

  describe('Base Adapter Helper Methods', () => {
    it('should create validation errors correctly', () => {
      const adapter = new SuccessfulTestAdapter();
      const result = adapter.validate({ id: '', name: 'Test', value: 100 });
      
      expect(result.errors[0].field).toBe('id');
      expect(result.errors[0].severity).toBe('ERROR');
    });

    it('should handle warnings in validation', () => {
      class WarningAdapter extends BaseIntegrationAdapter<TestInput, TestOutput> {
        readonly config: AdapterConfig = {
          id: 'warning-adapter',
          name: 'Warning Adapter',
          description: 'Test',
          version: '1.0.0',
          enabled: true,
          maxRetries: 0,
          retryDelayMs: 0,
          timeoutMs: 30000,
          validateBeforeTransform: true,
          requireConfirmation: false,
        };
        
        validate(payload: TestInput): ValidationResult {
          return this.validationSuccess([
            this.createValidationError('name', 'Name could be longer', 'SHORT_NAME', 'WARNING'),
          ]);
        }
        
        transform(payload: TestInput): TransformationResult<TestOutput> {
          return this.transformSuccess({ externalId: 'x', displayName: 'x', amount: 0 });
        }
        
        transmit(payload: TestOutput): TransmissionResult {
          return this.createTransmissionResult(true, 200, {}, 'txn', 100);
        }
        
        confirm(receipt: TransmissionResult): ConfirmationResult {
          return this.createConfirmationResult(true);
        }
      }
      
      const adapter = new WarningAdapter();
      const result = adapter.validate({ id: '123', name: 'T', value: 100 });
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].severity).toBe('WARNING');
    });
  });
});
