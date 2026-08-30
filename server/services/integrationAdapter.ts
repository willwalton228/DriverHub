/**
 * Integration Adapter Framework
 * 
 * A reusable framework for external system integrations with:
 * - Validation: Verify payload structure and business rules
 * - Transformation: Convert to target system format
 * - Transmission: Send to external system
 * - Confirmation: Verify successful receipt
 * 
 * Provides audit trail, retry logic, and error handling.
 */

// ============================================
// TYPES & INTERFACES
// ============================================

/** Integration status */
export type IntegrationStatus = 
  | 'PENDING'
  | 'VALIDATING'
  | 'VALIDATED'
  | 'TRANSFORMING'
  | 'TRANSFORMED'
  | 'TRANSMITTING'
  | 'TRANSMITTED'
  | 'CONFIRMING'
  | 'CONFIRMED'
  | 'FAILED'
  | 'RETRYING';

/** Integration error severity */
export type ErrorSeverity = 'WARNING' | 'ERROR' | 'CRITICAL';

/** Validation result */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/** Validation error detail */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
  severity: ErrorSeverity;
}

/** Transformation result */
export interface TransformationResult<TOutput> {
  success: boolean;
  output: TOutput | null;
  mappings: FieldMapping[];
  unmappedFields: string[];
}

/** Field mapping record */
export interface FieldMapping {
  sourceField: string;
  targetField: string;
  transformation: string;
  sourceValue: unknown;
  targetValue: unknown;
}

/** Transmission result */
export interface TransmissionResult {
  success: boolean;
  transactionId: string | null;
  statusCode: number | null;
  responseBody: unknown;
  sentAt: string;
  receivedAt: string | null;
  latencyMs: number;
}

/** Confirmation result */
export interface ConfirmationResult {
  confirmed: boolean;
  confirmationId: string | null;
  confirmationTimestamp: string | null;
  details: Record<string, unknown>;
}

/** Integration receipt (full audit record) */
export interface IntegrationReceipt<TInput, TOutput> {
  id: string;
  adapterId: string;
  adapterName: string;
  status: IntegrationStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  
  // Input/Output
  originalPayload: TInput;
  transformedPayload: TOutput | null;
  
  // Phase results
  validation: ValidationResult | null;
  transformation: TransformationResult<TOutput> | null;
  transmission: TransmissionResult | null;
  confirmation: ConfirmationResult | null;
  
  // Error handling
  errors: IntegrationError[];
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  
  // Metadata
  metadata: Record<string, unknown>;
}

/** Integration error record */
export interface IntegrationError {
  phase: 'VALIDATION' | 'TRANSFORMATION' | 'TRANSMISSION' | 'CONFIRMATION';
  timestamp: string;
  message: string;
  code: string;
  details: unknown;
  recoverable: boolean;
}

/** Adapter configuration */
export interface AdapterConfig {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
  validateBeforeTransform: boolean;
  requireConfirmation: boolean;
}

/** Adapter execution options */
export interface ExecutionOptions {
  skipValidation?: boolean;
  skipConfirmation?: boolean;
  dryRun?: boolean;
  metadata?: Record<string, unknown>;
}

// ============================================
// INTEGRATION ADAPTER INTERFACE
// ============================================

/**
 * Base Integration Adapter interface.
 * Implement this interface for each external system integration.
 */
export interface IntegrationAdapter<TInput, TOutput, TReceipt = unknown> {
  /** Adapter configuration */
  readonly config: AdapterConfig;
  
  /**
   * Validate the input payload.
   * Check structure, required fields, and business rules.
   */
  validate(payload: TInput): Promise<ValidationResult> | ValidationResult;
  
  /**
   * Transform the input payload to target format.
   * Map fields, convert types, apply business logic.
   */
  transform(payload: TInput): Promise<TransformationResult<TOutput>> | TransformationResult<TOutput>;
  
  /**
   * Transmit the transformed payload to external system.
   * Handle HTTP calls, file uploads, API interactions.
   */
  transmit(payload: TOutput): Promise<TransmissionResult> | TransmissionResult;
  
  /**
   * Confirm successful receipt by external system.
   * Verify transaction completed, get confirmation details.
   */
  confirm(receipt: TReceipt): Promise<ConfirmationResult> | ConfirmationResult;
}

// ============================================
// BASE ADAPTER IMPLEMENTATION
// ============================================

/**
 * Abstract base adapter with common functionality.
 * Extend this class to implement specific integrations.
 */
export abstract class BaseIntegrationAdapter<TInput, TOutput, TReceipt = TransmissionResult> 
  implements IntegrationAdapter<TInput, TOutput, TReceipt> {
  
  abstract readonly config: AdapterConfig;
  
  /**
   * Validate the input payload (override in subclass).
   */
  abstract validate(payload: TInput): Promise<ValidationResult> | ValidationResult;
  
  /**
   * Transform the input to target format (override in subclass).
   */
  abstract transform(payload: TInput): Promise<TransformationResult<TOutput>> | TransformationResult<TOutput>;
  
  /**
   * Transmit to external system (override in subclass).
   */
  abstract transmit(payload: TOutput): Promise<TransmissionResult> | TransmissionResult;
  
  /**
   * Confirm receipt (override in subclass).
   */
  abstract confirm(receipt: TReceipt): Promise<ConfirmationResult> | ConfirmationResult;
  
  /**
   * Create a validation error.
   */
  protected createValidationError(
    field: string,
    message: string,
    code: string,
    severity: ErrorSeverity = 'ERROR'
  ): ValidationError {
    return { field, message, code, severity };
  }
  
  /**
   * Create a successful validation result.
   */
  protected validationSuccess(warnings: ValidationError[] = []): ValidationResult {
    return { valid: true, errors: [], warnings };
  }
  
  /**
   * Create a failed validation result.
   */
  protected validationFailure(errors: ValidationError[], warnings: ValidationError[] = []): ValidationResult {
    return { valid: false, errors, warnings };
  }
  
  /**
   * Create a successful transformation result.
   */
  protected transformSuccess(
    output: TOutput,
    mappings: FieldMapping[] = [],
    unmappedFields: string[] = []
  ): TransformationResult<TOutput> {
    return { success: true, output, mappings, unmappedFields };
  }
  
  /**
   * Create a failed transformation result.
   */
  protected transformFailure(unmappedFields: string[] = []): TransformationResult<TOutput> {
    return { success: false, output: null, mappings: [], unmappedFields };
  }
  
  /**
   * Create a transmission result.
   */
  protected createTransmissionResult(
    success: boolean,
    statusCode: number | null,
    responseBody: unknown,
    transactionId: string | null,
    latencyMs: number
  ): TransmissionResult {
    const now = new Date().toISOString();
    return {
      success,
      transactionId,
      statusCode,
      responseBody,
      sentAt: now,
      receivedAt: success ? now : null,
      latencyMs,
    };
  }
  
  /**
   * Create a confirmation result.
   */
  protected createConfirmationResult(
    confirmed: boolean,
    confirmationId: string | null = null,
    details: Record<string, unknown> = {}
  ): ConfirmationResult {
    return {
      confirmed,
      confirmationId,
      confirmationTimestamp: confirmed ? new Date().toISOString() : null,
      details,
    };
  }
}

// ============================================
// ADAPTER REGISTRY
// ============================================

/** Registered adapters by ID */
const adapterRegistry: Map<string, IntegrationAdapter<unknown, unknown, unknown>> = new Map();

/** Register an adapter */
export function registerAdapter<TInput, TOutput, TReceipt>(
  adapter: IntegrationAdapter<TInput, TOutput, TReceipt>
): void {
  if (adapterRegistry.has(adapter.config.id)) {
    throw new Error(`Adapter with ID '${adapter.config.id}' is already registered`);
  }
  adapterRegistry.set(adapter.config.id, adapter as IntegrationAdapter<unknown, unknown, unknown>);
}

/** Unregister an adapter */
export function unregisterAdapter(adapterId: string): boolean {
  return adapterRegistry.delete(adapterId);
}

/** Get an adapter by ID */
export function getAdapter<TInput, TOutput, TReceipt>(
  adapterId: string
): IntegrationAdapter<TInput, TOutput, TReceipt> | null {
  const adapter = adapterRegistry.get(adapterId);
  return adapter ? adapter as IntegrationAdapter<TInput, TOutput, TReceipt> : null;
}

/** List all registered adapters */
export function listAdapters(): AdapterConfig[] {
  return Array.from(adapterRegistry.values()).map(a => a.config);
}

/** Clear all adapters (for testing) */
export function clearAdapterRegistry(): void {
  adapterRegistry.clear();
}

// ============================================
// INTEGRATION AUDIT TRAIL
// ============================================

/** Integration receipts storage */
const integrationReceipts: Map<string, IntegrationReceipt<unknown, unknown>> = new Map();

/** Generate unique receipt ID */
function generateReceiptId(): string {
  return `rcpt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/** Create a new integration receipt */
export function createReceipt<TInput, TOutput>(
  adapterId: string,
  adapterName: string,
  payload: TInput,
  maxRetries: number,
  metadata: Record<string, unknown> = {}
): IntegrationReceipt<TInput, TOutput> {
  const now = new Date().toISOString();
  const receipt: IntegrationReceipt<TInput, TOutput> = {
    id: generateReceiptId(),
    adapterId,
    adapterName,
    status: 'PENDING',
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    originalPayload: payload,
    transformedPayload: null,
    validation: null,
    transformation: null,
    transmission: null,
    confirmation: null,
    errors: [],
    retryCount: 0,
    maxRetries,
    lastError: null,
    metadata,
  };
  
  integrationReceipts.set(receipt.id, receipt as IntegrationReceipt<unknown, unknown>);
  return receipt;
}

/** Update receipt status */
export function updateReceiptStatus<TInput, TOutput>(
  receiptId: string,
  status: IntegrationStatus,
  updates: Partial<IntegrationReceipt<TInput, TOutput>> = {}
): IntegrationReceipt<TInput, TOutput> | null {
  const receipt = integrationReceipts.get(receiptId);
  if (!receipt) return null;
  
  receipt.status = status;
  receipt.updatedAt = new Date().toISOString();
  
  if (status === 'CONFIRMED' || status === 'FAILED') {
    receipt.completedAt = new Date().toISOString();
  }
  
  Object.assign(receipt, updates);
  return receipt as IntegrationReceipt<TInput, TOutput>;
}

/** Add error to receipt */
export function addReceiptError(
  receiptId: string,
  phase: IntegrationError['phase'],
  message: string,
  code: string,
  details: unknown = {},
  recoverable: boolean = true
): void {
  const receipt = integrationReceipts.get(receiptId);
  if (!receipt) return;
  
  const error: IntegrationError = {
    phase,
    timestamp: new Date().toISOString(),
    message,
    code,
    details,
    recoverable,
  };
  
  receipt.errors.push(error);
  receipt.lastError = message;
  receipt.updatedAt = new Date().toISOString();
}

/** Get receipt by ID */
export function getReceipt<TInput, TOutput>(
  receiptId: string
): IntegrationReceipt<TInput, TOutput> | null {
  const receipt = integrationReceipts.get(receiptId);
  return receipt as IntegrationReceipt<TInput, TOutput> | null;
}

/** List receipts by adapter */
export function listReceiptsByAdapter(
  adapterId: string,
  limit: number = 100
): IntegrationReceipt<unknown, unknown>[] {
  return Array.from(integrationReceipts.values())
    .filter(r => r.adapterId === adapterId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

/** List failed receipts */
export function listFailedReceipts(limit: number = 100): IntegrationReceipt<unknown, unknown>[] {
  return Array.from(integrationReceipts.values())
    .filter(r => r.status === 'FAILED')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);
}

/** List pending receipts for retry */
export function listRetryableReceipts(): IntegrationReceipt<unknown, unknown>[] {
  return Array.from(integrationReceipts.values())
    .filter(r => r.status === 'FAILED' && r.retryCount < r.maxRetries)
    .filter(r => r.errors.some(e => e.recoverable))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** Clear all receipts (for testing) */
export function clearAllReceipts(): void {
  integrationReceipts.clear();
}

// ============================================
// EXECUTION ORCHESTRATOR
// ============================================

/**
 * Execute an integration through all phases.
 */
export async function executeIntegration<TInput, TOutput, TReceipt>(
  adapterId: string,
  payload: TInput,
  options: ExecutionOptions = {}
): Promise<IntegrationReceipt<TInput, TOutput>> {
  const adapter = getAdapter<TInput, TOutput, TReceipt>(adapterId);
  if (!adapter) {
    throw new Error(`Adapter '${adapterId}' not found`);
  }
  
  if (!adapter.config.enabled) {
    throw new Error(`Adapter '${adapterId}' is disabled`);
  }
  
  const receipt = createReceipt<TInput, TOutput>(
    adapter.config.id,
    adapter.config.name,
    payload,
    adapter.config.maxRetries,
    options.metadata || {}
  );
  
  try {
    // Phase 1: Validation
    if (!options.skipValidation && adapter.config.validateBeforeTransform) {
      updateReceiptStatus(receipt.id, 'VALIDATING');
      const validationResult = await adapter.validate(payload);
      updateReceiptStatus(receipt.id, validationResult.valid ? 'VALIDATED' : 'FAILED', {
        validation: validationResult,
      });
      
      if (!validationResult.valid) {
        for (const error of validationResult.errors) {
          addReceiptError(receipt.id, 'VALIDATION', error.message, error.code, error, error.severity !== 'CRITICAL');
        }
        return getReceipt<TInput, TOutput>(receipt.id)!;
      }
    }
    
    // Phase 2: Transformation
    updateReceiptStatus(receipt.id, 'TRANSFORMING');
    const transformResult = await adapter.transform(payload);
    updateReceiptStatus(receipt.id, transformResult.success ? 'TRANSFORMED' : 'FAILED', {
      transformation: transformResult,
      transformedPayload: transformResult.output,
    });
    
    if (!transformResult.success || !transformResult.output) {
      addReceiptError(receipt.id, 'TRANSFORMATION', 'Transformation failed', 'TRANSFORM_FAILED', {
        unmappedFields: transformResult.unmappedFields,
      });
      return getReceipt<TInput, TOutput>(receipt.id)!;
    }
    
    // Dry run stops here
    if (options.dryRun) {
      updateReceiptStatus(receipt.id, 'VALIDATED');
      return getReceipt<TInput, TOutput>(receipt.id)!;
    }
    
    // Phase 3: Transmission
    updateReceiptStatus(receipt.id, 'TRANSMITTING');
    const transmitResult = await adapter.transmit(transformResult.output);
    updateReceiptStatus(receipt.id, transmitResult.success ? 'TRANSMITTED' : 'FAILED', {
      transmission: transmitResult,
    });
    
    if (!transmitResult.success) {
      addReceiptError(receipt.id, 'TRANSMISSION', 'Transmission failed', 'TRANSMIT_FAILED', {
        statusCode: transmitResult.statusCode,
        response: transmitResult.responseBody,
      });
      return getReceipt<TInput, TOutput>(receipt.id)!;
    }
    
    // Phase 4: Confirmation
    if (!options.skipConfirmation && adapter.config.requireConfirmation) {
      updateReceiptStatus(receipt.id, 'CONFIRMING');
      const confirmResult = await adapter.confirm(transmitResult as TReceipt);
      updateReceiptStatus(receipt.id, confirmResult.confirmed ? 'CONFIRMED' : 'FAILED', {
        confirmation: confirmResult,
      });
      
      if (!confirmResult.confirmed) {
        addReceiptError(receipt.id, 'CONFIRMATION', 'Confirmation failed', 'CONFIRM_FAILED', confirmResult.details);
        return getReceipt<TInput, TOutput>(receipt.id)!;
      }
    } else {
      // Skip confirmation, mark as complete
      updateReceiptStatus(receipt.id, 'CONFIRMED');
    }
    
    return getReceipt<TInput, TOutput>(receipt.id)!;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    addReceiptError(receipt.id, 'TRANSMISSION', errorMessage, 'UNEXPECTED_ERROR', error, true);
    updateReceiptStatus(receipt.id, 'FAILED');
    return getReceipt<TInput, TOutput>(receipt.id)!;
  }
}

/**
 * Retry a failed integration.
 */
export async function retryIntegration<TInput, TOutput, TReceipt>(
  receiptId: string
): Promise<IntegrationReceipt<TInput, TOutput> | null> {
  const existingReceipt = getReceipt<TInput, TOutput>(receiptId);
  if (!existingReceipt) return null;
  
  if (existingReceipt.status !== 'FAILED') {
    throw new Error(`Cannot retry receipt in status '${existingReceipt.status}'`);
  }
  
  if (existingReceipt.retryCount >= existingReceipt.maxRetries) {
    throw new Error(`Maximum retry count (${existingReceipt.maxRetries}) exceeded`);
  }
  
  existingReceipt.retryCount++;
  updateReceiptStatus(receiptId, 'RETRYING');
  
  // Re-execute with original payload
  const newReceipt = await executeIntegration<TInput, TOutput, TReceipt>(
    existingReceipt.adapterId,
    existingReceipt.originalPayload,
    { metadata: { ...existingReceipt.metadata, retriedFrom: receiptId } }
  );
  
  return newReceipt;
}

// ============================================
// BATCH EXECUTION
// ============================================

/** Batch execution result */
export interface BatchExecutionResult<TInput, TOutput> {
  adapterId: string;
  startedAt: string;
  completedAt: string;
  totalCount: number;
  successCount: number;
  failureCount: number;
  receipts: IntegrationReceipt<TInput, TOutput>[];
}

/**
 * Execute integration for multiple payloads.
 */
export async function executeBatch<TInput, TOutput, TReceipt>(
  adapterId: string,
  payloads: TInput[],
  options: ExecutionOptions = {}
): Promise<BatchExecutionResult<TInput, TOutput>> {
  const startedAt = new Date().toISOString();
  const receipts: IntegrationReceipt<TInput, TOutput>[] = [];
  
  for (const payload of payloads) {
    const receipt = await executeIntegration<TInput, TOutput, TReceipt>(adapterId, payload, options);
    receipts.push(receipt);
  }
  
  const completedAt = new Date().toISOString();
  const successCount = receipts.filter(r => r.status === 'CONFIRMED').length;
  
  return {
    adapterId,
    startedAt,
    completedAt,
    totalCount: payloads.length,
    successCount,
    failureCount: payloads.length - successCount,
    receipts,
  };
}

// ============================================
// ADAPTER STATISTICS
// ============================================

/** Adapter statistics */
export interface AdapterStatistics {
  adapterId: string;
  adapterName: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  successRate: number;
  averageLatencyMs: number;
  statusBreakdown: Record<IntegrationStatus, number>;
  recentErrors: IntegrationError[];
}

/**
 * Get statistics for an adapter.
 */
export function getAdapterStatistics(adapterId: string): AdapterStatistics | null {
  const adapter = getAdapter(adapterId);
  if (!adapter) return null;
  
  const receipts = listReceiptsByAdapter(adapterId, 1000);
  
  const statusBreakdown: Record<IntegrationStatus, number> = {
    'PENDING': 0, 'VALIDATING': 0, 'VALIDATED': 0, 'TRANSFORMING': 0,
    'TRANSFORMED': 0, 'TRANSMITTING': 0, 'TRANSMITTED': 0, 'CONFIRMING': 0,
    'CONFIRMED': 0, 'FAILED': 0, 'RETRYING': 0,
  };
  
  let totalLatency = 0;
  let latencyCount = 0;
  const recentErrors: IntegrationError[] = [];
  
  for (const receipt of receipts) {
    statusBreakdown[receipt.status]++;
    
    if (receipt.transmission?.latencyMs) {
      totalLatency += receipt.transmission.latencyMs;
      latencyCount++;
    }
    
    if (receipt.errors.length > 0) {
      recentErrors.push(...receipt.errors.slice(-5));
    }
  }
  
  const successfulExecutions = statusBreakdown['CONFIRMED'];
  const failedExecutions = statusBreakdown['FAILED'];
  const totalExecutions = receipts.length;
  
  return {
    adapterId,
    adapterName: adapter.config.name,
    totalExecutions,
    successfulExecutions,
    failedExecutions,
    successRate: totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0,
    averageLatencyMs: latencyCount > 0 ? totalLatency / latencyCount : 0,
    statusBreakdown,
    recentErrors: recentErrors.slice(-20),
  };
}
