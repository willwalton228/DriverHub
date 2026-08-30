import { db } from "./db";
import { 
  moveLifecycleEvents, 
  trips,
  customers,
  slaDefinitions,
  slaProgramOverrides,
  type MoveEventPayload,
  type MoveLifecycleEvent,
  type Trip
} from "@shared/schema";
import { eq, and, desc, gte, lte, sql, inArray } from "drizzle-orm";
import crypto from "crypto";

const EVENT_VERSION = "1.0";

function generateCreateEventId(moveId: string): string {
  const data = `MOVE_CREATED-${moveId}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

function generateUpdateEventId(moveId: string, move: Trip): string {
  const stateHash = JSON.stringify({
    origin: move.origin,
    destination: move.destination,
    tripDate: move.tripDate?.toISOString(),
    customerId: move.customerId,
    vehicleType: move.vehicleType,
    moveType: move.moveType,
    status: move.status,
    driverId: move.driverId,
    estimatedMinutes: move.estimatedMinutes,
  });
  const data = `MOVE_UPDATED-${moveId}-${stateHash}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

async function buildMovePayload(move: Trip): Promise<MoveEventPayload> {
  let customerName: string | undefined;
  let slaReferenceId: string | null = null;

  if (move.customerId) {
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, move.customerId)
    });
    customerName = customer?.customerName;

    const slaOverride = await db.query.slaProgramOverrides.findFirst({
      where: and(
        eq(slaProgramOverrides.customerId, move.customerId),
        eq(slaProgramOverrides.isActive, true)
      ),
      orderBy: [desc(slaProgramOverrides.effectiveFrom)]
    });

    if (slaOverride) {
      slaReferenceId = slaOverride.slaDefinitionId;
    } else {
      const globalSla = await db.query.slaDefinitions.findFirst({
        where: and(
          eq(slaDefinitions.isGlobal, true),
          eq(slaDefinitions.isActive, true),
          eq(slaDefinitions.slaType, 'pickup_time')
        ),
        orderBy: [desc(slaDefinitions.version)]
      });
      slaReferenceId = globalSla?.id || null;
    }
  }

  return {
    moveId: move.id,
    moveNumber: move.moveNumber,
    customerId: move.customerId,
    customerName,
    origin: move.origin,
    destination: move.destination,
    originLat: move.originLat,
    originLng: move.originLng,
    destinationLat: move.destinationLat,
    destinationLng: move.destinationLng,
    programId: move.customerId,
    plannedStartAt: move.tripDate?.toISOString() || null,
    plannedEndAt: null,
    slaReferenceId,
    moveType: move.moveType,
    vehicleType: move.vehicleType,
    estimatedMinutes: move.estimatedMinutes,
    customerInstructions: move.customerInstructions,
    returnToOriginRequired: move.returnToOriginRequired || false,
  };
}

export async function emitMoveCreatedEvent(
  moveId: string,
  emittedBy?: string
): Promise<MoveLifecycleEvent | null> {
  const move = await db.query.trips.findFirst({
    where: eq(trips.id, moveId)
  });

  if (!move) {
    console.error(`[MoveEventService] Move not found: ${moveId}`);
    return null;
  }

  const eventId = generateCreateEventId(moveId);

  const existing = await db.query.moveLifecycleEvents.findFirst({
    where: eq(moveLifecycleEvents.eventId, eventId)
  });
  if (existing) {
    console.log(`[MoveEventService] Duplicate MOVE_CREATED event detected for move ${moveId}`);
    return existing;
  }

  const payload = await buildMovePayload(move);

  const [event] = await db.insert(moveLifecycleEvents).values({
    eventId,
    eventType: 'MOVE_CREATED',
    eventVersion: EVENT_VERSION,
    moveId: move.id,
    moveNumber: move.moveNumber,
    payload: JSON.stringify(payload),
    emittedBy,
    status: 'pending',
  }).returning();

  console.log(`[MoveEventService] Emitted MOVE_CREATED event for move ${moveId}`);
  return event;
}

export async function emitMoveUpdatedEvent(
  moveId: string,
  changedFields: string[],
  emittedBy?: string
): Promise<MoveLifecycleEvent | null> {
  const move = await db.query.trips.findFirst({
    where: eq(trips.id, moveId)
  });

  if (!move) {
    console.error(`[MoveEventService] Move not found: ${moveId}`);
    return null;
  }

  if (changedFields.length === 0) {
    console.log(`[MoveEventService] No relevant fields changed for move ${moveId}, skipping event`);
    return null;
  }

  const eventId = generateUpdateEventId(moveId, move);

  const existing = await db.query.moveLifecycleEvents.findFirst({
    where: eq(moveLifecycleEvents.eventId, eventId)
  });
  if (existing) {
    console.log(`[MoveEventService] Duplicate MOVE_UPDATED event detected for move ${moveId}, same state already emitted`);
    return existing;
  }

  const payload = await buildMovePayload(move);

  const [event] = await db.insert(moveLifecycleEvents).values({
    eventId,
    eventType: 'MOVE_UPDATED',
    eventVersion: EVENT_VERSION,
    moveId: move.id,
    moveNumber: move.moveNumber,
    payload: JSON.stringify(payload),
    emittedBy,
    status: 'pending',
    changedFields,
  }).returning();

  console.log(`[MoveEventService] Emitted MOVE_UPDATED event for move ${moveId}, changed: ${changedFields.join(', ')}`);
  return event;
}

export async function getMoveEvents(
  moveId?: string,
  status?: string,
  limit: number = 100
): Promise<MoveLifecycleEvent[]> {
  let query = db.select().from(moveLifecycleEvents);
  
  const conditions = [];
  if (moveId) {
    conditions.push(eq(moveLifecycleEvents.moveId, moveId));
  }
  if (status) {
    conditions.push(eq(moveLifecycleEvents.status, status));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  return await query
    .orderBy(desc(moveLifecycleEvents.emittedAt))
    .limit(limit);
}

export async function markEventDelivered(eventId: string): Promise<void> {
  await db.update(moveLifecycleEvents)
    .set({
      status: 'delivered',
      deliveredAt: new Date(),
    })
    .where(eq(moveLifecycleEvents.eventId, eventId));
}

export async function markEventFailed(eventId: string, error: string): Promise<void> {
  const event = await db.query.moveLifecycleEvents.findFirst({
    where: eq(moveLifecycleEvents.eventId, eventId)
  });

  if (event) {
    await db.update(moveLifecycleEvents)
      .set({
        status: 'failed',
        deliveryAttempts: (event.deliveryAttempts || 0) + 1,
        lastError: error,
      })
      .where(eq(moveLifecycleEvents.eventId, eventId));
  }
}

export async function getPendingEvents(limit: number = 100): Promise<MoveLifecycleEvent[]> {
  return await db.select()
    .from(moveLifecycleEvents)
    .where(eq(moveLifecycleEvents.status, 'pending'))
    .orderBy(moveLifecycleEvents.emittedAt)
    .limit(limit);
}

export const RELEVANT_MOVE_FIELDS = [
  'origin',
  'destination',
  'tripDate',
  'customerId',
  'driverId',
  'status',
  'vehicleType',
  'moveType',
  'customerInstructions',
  'returnToOriginRequired',
  'originLat',
  'originLng',
  'destinationLat',
  'destinationLng',
  'estimatedMinutes',
] as const;

export function detectChangedFields(
  original: Record<string, unknown>,
  updated: Record<string, unknown>
): string[] {
  const changedFields: string[] = [];
  
  for (const field of RELEVANT_MOVE_FIELDS) {
    if (original[field] !== updated[field]) {
      changedFields.push(field);
    }
  }
  
  return changedFields;
}

// ============================================================================
// MOVE EVENT REPLAY / BACKFILL - Integration Resilience
// ============================================================================

export interface ReplayRequest {
  startTime: Date;
  endTime: Date;
  eventTypes?: ('MOVE_CREATED' | 'MOVE_UPDATED')[];
  moveIds?: string[];
  requestedBy?: string;
}

export interface ReplayResult {
  requestId: string;
  startTime: Date;
  endTime: Date;
  eventsReplayed: number;
  eventsBackfilled: number;
  moveIds: string[];
  errors: string[];
  completedAt: Date;
}

/**
 * Replay existing events for a time range.
 * Events are marked with status 'replayed' and can be re-fetched by Ops Console.
 * Idempotency is guaranteed by deterministic event IDs.
 */
export async function replayEventsForTimeRange(
  request: ReplayRequest
): Promise<ReplayResult> {
  const requestId = crypto.randomBytes(8).toString('hex');
  const errors: string[] = [];
  const replayedMoveIds: string[] = [];
  
  console.log(`[MoveEventReplay] Starting replay request ${requestId} for ${request.startTime.toISOString()} to ${request.endTime.toISOString()}`);

  const conditions = [
    gte(moveLifecycleEvents.emittedAt, request.startTime),
    lte(moveLifecycleEvents.emittedAt, request.endTime),
  ];

  if (request.eventTypes && request.eventTypes.length > 0) {
    conditions.push(inArray(moveLifecycleEvents.eventType, request.eventTypes));
  }

  if (request.moveIds && request.moveIds.length > 0) {
    conditions.push(inArray(moveLifecycleEvents.moveId, request.moveIds));
  }

  const existingEvents = await db.select()
    .from(moveLifecycleEvents)
    .where(and(...conditions))
    .orderBy(moveLifecycleEvents.emittedAt);

  // Mark existing events as pending for re-delivery (replay)
  for (const event of existingEvents) {
    try {
      await db.update(moveLifecycleEvents)
        .set({
          status: 'pending', // Reset to pending so Ops Console can re-fetch
          deliveredAt: null,
          lastError: null,
        })
        .where(eq(moveLifecycleEvents.id, event.id));
      
      if (!replayedMoveIds.includes(event.moveId)) {
        replayedMoveIds.push(event.moveId);
      }
    } catch (error) {
      errors.push(`Failed to replay event ${event.eventId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  console.log(`[MoveEventReplay] Completed replay request ${requestId}: ${existingEvents.length} events replayed`);

  return {
    requestId,
    startTime: request.startTime,
    endTime: request.endTime,
    eventsReplayed: existingEvents.length,
    eventsBackfilled: 0,
    moveIds: replayedMoveIds,
    errors,
    completedAt: new Date(),
  };
}

/**
 * Backfill missing events for moves created in a time range.
 * Creates MOVE_CREATED events for moves that don't have one.
 * Idempotency is guaranteed by deterministic event IDs.
 */
export async function backfillMissingEvents(
  request: ReplayRequest
): Promise<ReplayResult> {
  const requestId = crypto.randomBytes(8).toString('hex');
  const errors: string[] = [];
  const backfilledMoveIds: string[] = [];
  
  console.log(`[MoveEventBackfill] Starting backfill request ${requestId} for ${request.startTime.toISOString()} to ${request.endTime.toISOString()}`);

  // Find moves in the time range
  const moveConditions = [
    gte(trips.createdAt, request.startTime),
    lte(trips.createdAt, request.endTime),
  ];

  if (request.moveIds && request.moveIds.length > 0) {
    moveConditions.push(inArray(trips.id, request.moveIds));
  }

  const movesInRange = await db.select()
    .from(trips)
    .where(and(...moveConditions))
    .orderBy(trips.createdAt);

  // For each move, ensure a MOVE_CREATED event exists
  for (const move of movesInRange) {
    try {
      const eventId = generateCreateEventId(move.id);
      
      // Check if event already exists (idempotent check)
      const existing = await db.query.moveLifecycleEvents.findFirst({
        where: eq(moveLifecycleEvents.eventId, eventId)
      });

      if (!existing) {
        // Create the missing event
        const payload = await buildMovePayload(move);
        
        await db.insert(moveLifecycleEvents).values({
          eventId,
          eventType: 'MOVE_CREATED',
          eventVersion: EVENT_VERSION,
          moveId: move.id,
          moveNumber: move.moveNumber,
          payload: JSON.stringify(payload),
          emittedBy: request.requestedBy || 'backfill',
          status: 'pending',
        });

        backfilledMoveIds.push(move.id);
        console.log(`[MoveEventBackfill] Created missing event for move ${move.id}`);
      }
    } catch (error) {
      errors.push(`Failed to backfill move ${move.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  console.log(`[MoveEventBackfill] Completed backfill request ${requestId}: ${backfilledMoveIds.length} events created`);

  return {
    requestId,
    startTime: request.startTime,
    endTime: request.endTime,
    eventsReplayed: 0,
    eventsBackfilled: backfilledMoveIds.length,
    moveIds: backfilledMoveIds,
    errors,
    completedAt: new Date(),
  };
}

/**
 * Combined replay and backfill operation.
 * First backfills missing events, then replays all events for the range.
 */
export async function replayAndBackfill(
  request: ReplayRequest
): Promise<ReplayResult> {
  const requestId = crypto.randomBytes(8).toString('hex');
  
  console.log(`[MoveEventReplay] Starting combined replay+backfill request ${requestId}`);

  // First backfill any missing events
  const backfillResult = await backfillMissingEvents(request);
  
  // Then replay all events (including newly backfilled ones)
  const replayResult = await replayEventsForTimeRange(request);

  return {
    requestId,
    startTime: request.startTime,
    endTime: request.endTime,
    eventsReplayed: replayResult.eventsReplayed,
    eventsBackfilled: backfillResult.eventsBackfilled,
    moveIds: [...new Set([...backfillResult.moveIds, ...replayResult.moveIds])],
    errors: [...backfillResult.errors, ...replayResult.errors],
    completedAt: new Date(),
  };
}

/**
 * Get events for a time range (for Ops Console to pull).
 * Supports cursor-based pagination for large result sets.
 * 
 * @param cursor - Internal record ID (from nextCursor in previous response), NOT eventId
 */
export async function getEventsForTimeRange(options: {
  startTime: Date;
  endTime: Date;
  eventTypes?: ('MOVE_CREATED' | 'MOVE_UPDATED')[];
  status?: string;
  cursor?: string; // Internal record ID from previous response's nextCursor
  limit?: number;
}): Promise<{ events: MoveLifecycleEvent[]; nextCursor: string | null; hasMore: boolean }> {
  const limit = Math.min(options.limit || 100, 1000);
  
  const conditions = [
    gte(moveLifecycleEvents.emittedAt, options.startTime),
    lte(moveLifecycleEvents.emittedAt, options.endTime),
  ];

  if (options.eventTypes && options.eventTypes.length > 0) {
    conditions.push(inArray(moveLifecycleEvents.eventType, options.eventTypes));
  }

  if (options.status) {
    conditions.push(eq(moveLifecycleEvents.status, options.status));
  }

  if (options.cursor) {
    // Get events after the cursor (using ID for stable ordering)
    conditions.push(sql`${moveLifecycleEvents.id} > ${options.cursor}`);
  }

  const events = await db.select()
    .from(moveLifecycleEvents)
    .where(and(...conditions))
    .orderBy(moveLifecycleEvents.id)
    .limit(limit + 1); // Fetch one extra to check if there are more

  const hasMore = events.length > limit;
  const resultEvents = hasMore ? events.slice(0, limit) : events;
  const nextCursor = hasMore && resultEvents.length > 0 
    ? resultEvents[resultEvents.length - 1].id 
    : null;

  return {
    events: resultEvents,
    nextCursor,
    hasMore,
  };
}
