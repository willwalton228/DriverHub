import { db } from "./db";
import { 
  ingestedEvents, moveExecutionLedger, moveCurrentState, moveProofsIndex,
  timeEntries, cases, PROCESSING_CONFIG
} from "@shared/schema";
import { eq, and, or, sql, lt, isNull, desc } from "drizzle-orm";

type EventPayload = Record<string, any>;

interface ProcessingResult {
  success: boolean;
  error?: string;
}

interface EventHandler {
  (eventId: string, eventType: string, payload: EventPayload, moveId: string | null, driverId: string | null): Promise<ProcessingResult>;
}

const eventHandlers: Record<string, EventHandler> = {
  "move.assigned": handleMoveStateEvent,
  "move.started": handleMoveStateEvent,
  "move.pickup_arrived": handleMoveStateEvent,
  "move.pickup_completed": handleMoveStateEvent,
  "move.dropoff_arrived": handleMoveStateEvent,
  "move.dropoff_completed": handleMoveStateEvent,
  "move.completed": handleMoveStateEvent,
  "move.cancelled": handleMoveStateEvent,
  "shift.clock_in": handleClockEvent,
  "shift.clock_out": handleClockEvent,
  "shift.break_start": handleBreakEvent,
  "shift.break_end": handleBreakEvent,
  "proof.photo_captured": handleProofEvent,
  "proof.signature_captured": handleProofEvent,
  "incident.reported": handleIncidentEvent,
  "location.updated": handleLocationEvent,
};

async function handleMoveStateEvent(
  eventId: string, 
  eventType: string, 
  payload: EventPayload, 
  moveId: string | null, 
  driverId: string | null
): Promise<ProcessingResult> {
  try {
    if (!moveId) {
      return { success: false, error: "Move ID is required for move state events" };
    }

    const occurredAt = payload.occurred_at ? new Date(payload.occurred_at) : new Date();
    const state = eventType.replace("move.", "");

    await db.insert(moveExecutionLedger).values({
      moveId,
      driverId,
      eventId,
      eventType,
      occurredAt,
      payloadJson: payload,
    }).onConflictDoNothing();

    await db.insert(moveCurrentState).values({
      moveId,
      driverId,
      currentState: state,
      stateChangedAt: occurredAt,
      sourceEventId: eventId,
    }).onConflictDoUpdate({
      target: moveCurrentState.moveId,
      set: {
        driverId,
        currentState: state,
        stateChangedAt: occurredAt,
        sourceEventId: eventId,
        lastUpdatedAt: new Date(),
      },
    });

    return { success: true };
  } catch (error) {
    console.error("[Orchestrator] Move state handler error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function handleClockEvent(
  eventId: string,
  eventType: string,
  payload: EventPayload,
  moveId: string | null,
  driverId: string | null
): Promise<ProcessingResult> {
  try {
    if (!driverId) {
      return { success: false, error: "Driver ID is required for clock events" };
    }

    const occurredAt = payload.occurred_at ? new Date(payload.occurred_at) : new Date();
    const isClockIn = eventType === "shift.clock_in";

    if (isClockIn) {
      await db.insert(timeEntries).values({
        driverId,
        startAt: occurredAt,
        clockInEventId: eventId,
        clockInLat: payload.latitude ? Number(payload.latitude) : null,
        clockInLng: payload.longitude ? Number(payload.longitude) : null,
        marketId: payload.market_id || null,
      });
    } else {
      const [activeEntry] = await db.select()
        .from(timeEntries)
        .where(and(
          eq(timeEntries.driverId, driverId),
          isNull(timeEntries.endAt)
        ))
        .orderBy(desc(timeEntries.startAt))
        .limit(1);

      if (activeEntry) {
        const durationMs = occurredAt.getTime() - new Date(activeEntry.startAt).getTime();
        const durationMinutes = Math.round(durationMs / 60000);
        
        await db.update(timeEntries)
          .set({ 
            endAt: occurredAt,
            durationMinutes,
            clockOutEventId: eventId,
            clockOutLat: payload.latitude ? Number(payload.latitude) : null,
            clockOutLng: payload.longitude ? Number(payload.longitude) : null,
            updatedAt: new Date(),
          })
          .where(eq(timeEntries.id, activeEntry.id));
      }
    }

    return { success: true };
  } catch (error) {
    console.error("[Orchestrator] Clock event handler error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function handleBreakEvent(
  eventId: string,
  eventType: string,
  payload: EventPayload,
  moveId: string | null,
  driverId: string | null
): Promise<ProcessingResult> {
  try {
    if (!driverId) {
      return { success: false, error: "Driver ID is required for break events" };
    }

    return { success: true };
  } catch (error) {
    console.error("[Orchestrator] Break event handler error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function handleProofEvent(
  eventId: string,
  eventType: string,
  payload: EventPayload,
  moveId: string | null,
  driverId: string | null
): Promise<ProcessingResult> {
  try {
    const occurredAt = payload.occurred_at ? new Date(payload.occurred_at) : new Date();
    const proofType = eventType === "proof.photo_captured" ? "photo" : "signature";

    await db.insert(moveProofsIndex).values({
      moveId: moveId || "unknown",
      driverId,
      proofType,
      mediaRef: payload.media_ref || payload.media_url || null,
      occurredAt,
      eventId,
      geoLat: payload.latitude ? Number(payload.latitude) : null,
      geoLng: payload.longitude ? Number(payload.longitude) : null,
      metadata: payload.metadata || null,
    });

    return { success: true };
  } catch (error) {
    console.error("[Orchestrator] Proof event handler error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function handleIncidentEvent(
  eventId: string,
  eventType: string,
  payload: EventPayload,
  moveId: string | null,
  driverId: string | null
): Promise<ProcessingResult> {
  try {
    await db.insert(cases).values({
      moveId: moveId || null,
      driverId,
      customerId: payload.customer_id || null,
      caseType: "QA",
      severity: payload.severity || "medium",
      status: "open",
      title: `Incident: ${payload.incident_type || "Reported"}`,
      description: payload.description || `Incident reported: ${payload.incident_type || "unknown"}`,
      triggerEventId: eventId,
      triggerType: "incident_reported",
      exceptionType: payload.incident_type || payload.exception_type || "incident",
      supportingEventIds: [eventId],
      proofRefs: payload.proof_refs || [],
    });

    return { success: true };
  } catch (error) {
    console.error("[Orchestrator] Incident event handler error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function handleLocationEvent(
  eventId: string,
  eventType: string,
  payload: EventPayload,
  moveId: string | null,
  driverId: string | null
): Promise<ProcessingResult> {
  return { success: true };
}

export async function processEvent(event: {
  eventId: string;
  eventType: string;
  payloadJson: Record<string, any>;
  moveId: string | null;
  driverId: string | null;
}): Promise<ProcessingResult> {
  const handler = eventHandlers[event.eventType];
  
  if (!handler) {
    console.warn(`[Orchestrator] No handler for event type: ${event.eventType}`);
    return { success: true };
  }

  return handler(
    event.eventId,
    event.eventType,
    event.payloadJson,
    event.moveId,
    event.driverId
  );
}

export async function processPendingEvents(): Promise<{
  processed: number;
  failed: number;
  movedToDlq: number;
}> {
  const stats = { processed: 0, failed: 0, movedToDlq: 0 };

  const pendingEvents = await db.select()
    .from(ingestedEvents)
    .where(
      or(
        eq(ingestedEvents.processingStatus, "received"),
        and(
          eq(ingestedEvents.processingStatus, "failed"),
          lt(ingestedEvents.retryCount, PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS)
        )
      )
    )
    .limit(PROCESSING_CONFIG.BATCH_SIZE);

  for (const event of pendingEvents) {
    if (event.mappingStatus === "failed_driver" || event.mappingStatus === "failed_move") {
      continue;
    }

    await db.update(ingestedEvents)
      .set({ processingStatus: "processing" })
      .where(eq(ingestedEvents.eventId, event.eventId));

    const result = await processEvent({
      eventId: event.eventId,
      eventType: event.eventType,
      payloadJson: event.payloadJson as Record<string, any>,
      moveId: event.moveId,
      driverId: event.driverId,
    });

    if (result.success) {
      await db.update(ingestedEvents)
        .set({
          processingStatus: "processed",
          processedAt: new Date(),
          lastError: null,
        })
        .where(eq(ingestedEvents.eventId, event.eventId));
      stats.processed++;
    } else {
      const newRetryCount = (event.retryCount || 0) + 1;
      const shouldMoveToDlq = newRetryCount >= PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS;

      await db.update(ingestedEvents)
        .set({
          processingStatus: shouldMoveToDlq ? "dlq" : "failed",
          retryCount: newRetryCount,
          lastError: result.error || "Unknown processing error",
        })
        .where(eq(ingestedEvents.eventId, event.eventId));

      if (shouldMoveToDlq) {
        stats.movedToDlq++;
        console.log(`[Orchestrator] Event ${event.eventId} moved to DLQ after ${newRetryCount} attempts`);
      } else {
        stats.failed++;
      }
    }
  }

  return stats;
}

export async function requeueDlqEvent(eventId: string): Promise<boolean> {
  try {
    const [event] = await db.select()
      .from(ingestedEvents)
      .where(and(
        eq(ingestedEvents.eventId, eventId),
        eq(ingestedEvents.processingStatus, "dlq")
      ))
      .limit(1);

    if (!event) {
      return false;
    }

    await db.update(ingestedEvents)
      .set({
        processingStatus: "received",
        retryCount: 0,
        lastError: null,
      })
      .where(eq(ingestedEvents.eventId, eventId));

    console.log(`[Orchestrator] Event ${eventId} requeued from DLQ`);
    return true;
  } catch (error) {
    console.error("[Orchestrator] Error requeuing DLQ event:", error);
    return false;
  }
}

export async function getProcessingStats(): Promise<{
  received: number;
  processing: number;
  processed: number;
  failed: number;
  dlq: number;
}> {
  const [result] = await db.select({
    received: sql<number>`COUNT(*) FILTER (WHERE ${ingestedEvents.processingStatus} = 'received')`,
    processing: sql<number>`COUNT(*) FILTER (WHERE ${ingestedEvents.processingStatus} = 'processing')`,
    processed: sql<number>`COUNT(*) FILTER (WHERE ${ingestedEvents.processingStatus} = 'processed')`,
    failed: sql<number>`COUNT(*) FILTER (WHERE ${ingestedEvents.processingStatus} = 'failed')`,
    dlq: sql<number>`COUNT(*) FILTER (WHERE ${ingestedEvents.processingStatus} = 'dlq')`,
  }).from(ingestedEvents);

  return {
    received: Number(result?.received || 0),
    processing: Number(result?.processing || 0),
    processed: Number(result?.processed || 0),
    failed: Number(result?.failed || 0),
    dlq: Number(result?.dlq || 0),
  };
}

export async function getDlqEvents(limit = 50): Promise<typeof ingestedEvents.$inferSelect[]> {
  return db.select()
    .from(ingestedEvents)
    .where(eq(ingestedEvents.processingStatus, "dlq"))
    .orderBy(desc(ingestedEvents.receivedAt))
    .limit(limit);
}

export async function getFailedEvents(limit = 50): Promise<typeof ingestedEvents.$inferSelect[]> {
  return db.select()
    .from(ingestedEvents)
    .where(eq(ingestedEvents.processingStatus, "failed"))
    .orderBy(desc(ingestedEvents.receivedAt))
    .limit(limit);
}

let isProcessorRunning = false;
let processorInterval: NodeJS.Timeout | null = null;

export function startProcessor(): void {
  if (isProcessorRunning) {
    console.log("[Orchestrator] Processor already running");
    return;
  }

  isProcessorRunning = true;
  console.log("[Orchestrator] Starting event processor...");

  processorInterval = setInterval(async () => {
    try {
      const stats = await processPendingEvents();
      if (stats.processed > 0 || stats.failed > 0 || stats.movedToDlq > 0) {
        console.log(`[Orchestrator] Batch complete: ${stats.processed} processed, ${stats.failed} failed, ${stats.movedToDlq} moved to DLQ`);
      }
    } catch (error) {
      console.error("[Orchestrator] Processing error:", error);
    }
  }, PROCESSING_CONFIG.POLL_INTERVAL_MS);
}

export function stopProcessor(): void {
  if (processorInterval) {
    clearInterval(processorInterval);
    processorInterval = null;
  }
  isProcessorRunning = false;
  console.log("[Orchestrator] Processor stopped");
}

export function isProcessorActive(): boolean {
  return isProcessorRunning;
}
