import { db } from "./db";
import {
  executionOutcomes,
  trips,
  ExecutionOutcome,
  ExecutionOutcomePayload,
  executionOutcomeTypes,
  exceptionFlags as validExceptionFlags,
} from "@shared/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";

const PAYLOAD_VERSION = "1.0";

function validateOutcomeType(type: string): boolean {
  return executionOutcomeTypes.includes(type as typeof executionOutcomeTypes[number]);
}

function validateExceptionFlags(flags: string[] | undefined): string[] | undefined {
  if (!flags) return undefined;
  return flags.filter(flag => 
    validExceptionFlags.includes(flag as typeof validExceptionFlags[number])
  );
}

export async function ingestExecutionOutcome(
  payload: ExecutionOutcomePayload
): Promise<{ success: boolean; outcome?: ExecutionOutcome; error?: string; isDuplicate?: boolean }> {
  if (!payload.outcomeId) {
    return { success: false, error: "outcomeId is required for idempotency" };
  }

  if (!payload.moveId) {
    return { success: false, error: "moveId is required" };
  }

  if (!payload.outcomeType || !validateOutcomeType(payload.outcomeType)) {
    return { success: false, error: `Invalid outcomeType. Must be one of: ${executionOutcomeTypes.join(', ')}` };
  }

  const existing = await db.query.executionOutcomes.findFirst({
    where: eq(executionOutcomes.outcomeId, payload.outcomeId)
  });

  if (existing) {
    console.log(`[ExecutionOutcome] Duplicate outcome detected: ${payload.outcomeId}`);
    return { success: true, outcome: existing, isDuplicate: true };
  }

  const move = await db.query.trips.findFirst({
    where: eq(trips.id, payload.moveId)
  });

  if (!move) {
    return { success: false, error: `Move not found: ${payload.moveId}` };
  }

  const validatedFlags = validateExceptionFlags(payload.exceptionFlags);

  try {
    const [outcome] = await db.insert(executionOutcomes).values({
      outcomeId: payload.outcomeId,
      moveId: payload.moveId,
      moveNumber: payload.moveNumber || move.moveNumber,
      outcomeType: payload.outcomeType,
      actualStartAt: payload.actualStartAt ? new Date(payload.actualStartAt) : null,
      actualEndAt: payload.actualEndAt ? new Date(payload.actualEndAt) : null,
      actualPickupAt: payload.actualPickupAt ? new Date(payload.actualPickupAt) : null,
      actualDeliveryAt: payload.actualDeliveryAt ? new Date(payload.actualDeliveryAt) : null,
      actualDurationMinutes: payload.actualDurationMinutes,
      actualDistanceMiles: payload.actualDistanceMiles?.toString(),
      exceptionFlags: validatedFlags,
      exceptionNotes: payload.exceptionNotes,
      cancellationReason: payload.cancellationReason,
      cancelledBy: payload.cancelledBy,
      cancelledAt: payload.cancelledAt ? new Date(payload.cancelledAt) : null,
      slaReferenceId: payload.slaReferenceId,
      slaMet: payload.slaMet,
      slaBreachMinutes: payload.slaBreachMinutes,
      executedByDriverId: payload.executedByDriverId,
      billableMinutes: payload.billableMinutes,
      billableMiles: payload.billableMiles?.toString(),
      billableAmount: payload.billableAmount?.toString(),
      payloadVersion: PAYLOAD_VERSION,
      rawPayload: JSON.stringify(payload),
      processingStatus: 'received',
      sourceSystem: 'ops_console',
      sourceEventId: payload.sourceEventId,
    }).returning();

    console.log(`[ExecutionOutcome] Ingested outcome ${payload.outcomeId} for move ${payload.moveId}`);

    // Pass audit references to processOutcome for storage on the move record
    await processOutcome(outcome.id, {
      executionAuditId: payload.executionAuditId,
      slaBreachIndicator: payload.slaBreachIndicator,
      blockerSummary: payload.blockerSummary,
    });

    return { success: true, outcome };
  } catch (error) {
    console.error(`[ExecutionOutcome] Failed to ingest outcome:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function processOutcome(outcomeId: string, auditReferences?: {
  executionAuditId?: string;
  slaBreachIndicator?: boolean;
  blockerSummary?: string;
}): Promise<void> {
  try {
    const outcome = await db.query.executionOutcomes.findFirst({
      where: eq(executionOutcomes.id, outcomeId)
    });

    if (!outcome) return;

    const updateData: Record<string, unknown> = {};
    
    if (outcome.outcomeType === 'completed') {
      updateData.status = 'completed';
      updateData.executionState = 'COMPLETED';
    } else if (outcome.outcomeType === 'cancelled') {
      updateData.status = 'cancelled';
      updateData.executionState = 'CANCELLED';
    } else if (outcome.outcomeType === 'partial') {
      updateData.status = 'partial';
      updateData.executionState = 'COMPLETED';
    }
    
    // Store execution audit references on the move record
    // DriverHub points to the truth — it does not duplicate raw audit logs
    if (auditReferences?.executionAuditId) {
      updateData.executionAuditId = auditReferences.executionAuditId;
      updateData.executionAuditReceivedAt = new Date();
    }
    if (auditReferences?.slaBreachIndicator !== undefined) {
      updateData.slaBreachIndicator = auditReferences.slaBreachIndicator;
    }
    if (auditReferences?.blockerSummary) {
      updateData.blockerSummary = auditReferences.blockerSummary;
    }

    if (Object.keys(updateData).length > 0) {
      const result = await db.update(trips)
        .set(updateData)
        .where(eq(trips.id, outcome.moveId))
        .returning({ id: trips.id });
      
      if (result.length === 0) {
        console.warn(`[ExecutionOutcome] No trip found to update for move ${outcome.moveId}`);
      }
    }

    await db.update(executionOutcomes)
      .set({
        processedAt: new Date(),
        processingStatus: 'processed',
      })
      .where(eq(executionOutcomes.id, outcomeId));

    console.log(`[ExecutionOutcome] Processed outcome ${outcome.outcomeId}${auditReferences?.executionAuditId ? ` with audit ref ${auditReferences.executionAuditId}` : ''}`);
  } catch (error) {
    console.error(`[ExecutionOutcome] Processing error:`, error);
    
    await db.update(executionOutcomes)
      .set({
        processingStatus: 'failed',
        processingError: error instanceof Error ? error.message : 'Unknown error',
      })
      .where(eq(executionOutcomes.id, outcomeId));
  }
}

export async function getOutcomeByMoveId(moveId: string): Promise<ExecutionOutcome | null> {
  const outcome = await db.query.executionOutcomes.findFirst({
    where: eq(executionOutcomes.moveId, moveId),
    orderBy: [desc(executionOutcomes.receivedAt)],
  });
  return outcome || null;
}

export async function getOutcomeById(outcomeId: string): Promise<ExecutionOutcome | null> {
  const outcome = await db.query.executionOutcomes.findFirst({
    where: eq(executionOutcomes.outcomeId, outcomeId),
  });
  return outcome || null;
}

export async function getOutcomes(options: {
  limit?: number;
  offset?: number;
  outcomeType?: string;
  startDate?: Date;
  endDate?: Date;
  slaMet?: boolean;
}): Promise<{ outcomes: ExecutionOutcome[]; total: number }> {
  const conditions = [];

  if (options.outcomeType) {
    conditions.push(eq(executionOutcomes.outcomeType, options.outcomeType));
  }

  if (options.startDate) {
    conditions.push(gte(executionOutcomes.receivedAt, options.startDate));
  }

  if (options.endDate) {
    conditions.push(lte(executionOutcomes.receivedAt, options.endDate));
  }

  if (options.slaMet !== undefined) {
    conditions.push(eq(executionOutcomes.slaMet, options.slaMet));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const outcomes = await db.select()
    .from(executionOutcomes)
    .where(whereClause)
    .orderBy(desc(executionOutcomes.receivedAt))
    .limit(options.limit || 100)
    .offset(options.offset || 0);

  const countResult = await db.select()
    .from(executionOutcomes)
    .where(whereClause);

  return {
    outcomes,
    total: countResult.length,
  };
}

export async function getOutcomeStats(startDate?: Date, endDate?: Date): Promise<{
  total: number;
  completed: number;
  cancelled: number;
  partial: number;
  slaMet: number;
  slaBreached: number;
  avgDurationMinutes: number | null;
  totalBillableAmount: number;
}> {
  const conditions = [];
  
  if (startDate) {
    conditions.push(gte(executionOutcomes.receivedAt, startDate));
  }
  if (endDate) {
    conditions.push(lte(executionOutcomes.receivedAt, endDate));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const allOutcomes = await db.select()
    .from(executionOutcomes)
    .where(whereClause);

  const completed = allOutcomes.filter(o => o.outcomeType === 'completed').length;
  const cancelled = allOutcomes.filter(o => o.outcomeType === 'cancelled').length;
  const partial = allOutcomes.filter(o => o.outcomeType === 'partial').length;
  const slaMet = allOutcomes.filter(o => o.slaMet === true).length;
  const slaBreached = allOutcomes.filter(o => o.slaMet === false).length;

  const durationsWithValues = allOutcomes
    .filter(o => o.actualDurationMinutes !== null)
    .map(o => o.actualDurationMinutes!);
  
  const avgDurationMinutes = durationsWithValues.length > 0
    ? durationsWithValues.reduce((a, b) => a + b, 0) / durationsWithValues.length
    : null;

  const totalBillableAmount = allOutcomes
    .filter(o => o.billableAmount !== null)
    .reduce((sum, o) => sum + parseFloat(o.billableAmount || '0'), 0);

  return {
    total: allOutcomes.length,
    completed,
    cancelled,
    partial,
    slaMet,
    slaBreached,
    avgDurationMinutes,
    totalBillableAmount,
  };
}

export async function batchIngestOutcomes(
  payloads: ExecutionOutcomePayload[]
): Promise<{ 
  successful: number; 
  failed: number; 
  duplicates: number;
  errors: Array<{ outcomeId: string; error: string }>;
}> {
  let successful = 0;
  let failed = 0;
  let duplicates = 0;
  const errors: Array<{ outcomeId: string; error: string }> = [];

  for (const payload of payloads) {
    const result = await ingestExecutionOutcome(payload);
    
    if (result.success) {
      if (result.isDuplicate) {
        duplicates++;
      } else {
        successful++;
      }
    } else {
      failed++;
      errors.push({
        outcomeId: payload.outcomeId,
        error: result.error || 'Unknown error',
      });
    }
  }

  return { successful, failed, duplicates, errors };
}
