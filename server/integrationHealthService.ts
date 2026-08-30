import { db } from "./db";
import { moveLifecycleEvents, executionOutcomes } from "@shared/schema";
import { desc, eq, sql } from "drizzle-orm";

const DEGRADED_THRESHOLD_MINUTES = 30;
const STALLED_THRESHOLD_MINUTES = 120;

export type SyncHealth = 'healthy' | 'degraded' | 'stalled' | 'unknown';

export interface IntegrationHealthStatus {
  status: SyncHealth;
  lastCheckedAt: string;
  outbound: {
    lastSuccessfulEventAt: string | null;
    lastEventId: string | null;
    eventType: string | null;
    pendingCount: number;
    failedCount: number;
    status: SyncHealth;
    stalledMinutes: number | null;
  };
  inbound: {
    lastSuccessfulIngestAt: string | null;
    lastOutcomeId: string | null;
    moveId: string | null;
    pendingCount: number;
    failedCount: number;
    status: SyncHealth;
    stalledMinutes: number | null;
  };
  summary: string;
}

function calculateHealth(lastEventTime: Date | null, now: Date): { status: SyncHealth; stalledMinutes: number | null } {
  if (!lastEventTime) {
    return { status: 'unknown', stalledMinutes: null };
  }

  const minutesSinceLastEvent = Math.floor((now.getTime() - lastEventTime.getTime()) / (1000 * 60));

  if (minutesSinceLastEvent <= DEGRADED_THRESHOLD_MINUTES) {
    return { status: 'healthy', stalledMinutes: null };
  } else if (minutesSinceLastEvent <= STALLED_THRESHOLD_MINUTES) {
    return { status: 'degraded', stalledMinutes: minutesSinceLastEvent };
  } else {
    return { status: 'stalled', stalledMinutes: minutesSinceLastEvent };
  }
}

function combineStatuses(outboundStatus: SyncHealth, inboundStatus: SyncHealth): SyncHealth {
  if (outboundStatus === 'stalled' || inboundStatus === 'stalled') return 'stalled';
  if (outboundStatus === 'degraded' || inboundStatus === 'degraded') return 'degraded';
  if (outboundStatus === 'unknown' || inboundStatus === 'unknown') return 'unknown';
  return 'healthy';
}

function generateSummary(health: IntegrationHealthStatus): string {
  const parts: string[] = [];

  if (health.status === 'healthy') {
    parts.push('Integration sync is healthy.');
  } else if (health.status === 'degraded') {
    parts.push('Integration sync is degraded.');
  } else if (health.status === 'stalled') {
    parts.push('Integration sync is stalled - immediate attention required.');
  } else {
    parts.push('Integration sync status unknown.');
  }

  if (health.outbound.status === 'unknown') {
    parts.push('Outbound: No events recorded.');
  } else if (health.outbound.status !== 'healthy' && health.outbound.stalledMinutes) {
    parts.push(`Outbound: ${health.outbound.stalledMinutes} minutes since last event.`);
  }

  if (health.inbound.status === 'unknown') {
    parts.push('Inbound: No outcomes received.');
  } else if (health.inbound.status !== 'healthy' && health.inbound.stalledMinutes) {
    parts.push(`Inbound: ${health.inbound.stalledMinutes} minutes since last ingest.`);
  }

  if (health.outbound.failedCount > 0) {
    parts.push(`${health.outbound.failedCount} failed outbound events.`);
  }

  if (health.inbound.failedCount > 0) {
    parts.push(`${health.inbound.failedCount} failed inbound outcomes.`);
  }

  return parts.join(' ');
}

export async function getIntegrationHealth(): Promise<IntegrationHealthStatus> {
  const now = new Date();

  const [
    lastDeliveredEvent,
    lastEmittedEvent,
    outboundPendingCount,
    outboundFailedCount,
    lastProcessedOutcome,
    lastIngestedOutcome,
    inboundPendingCount,
    inboundFailedCount,
  ] = await Promise.all([
    db.select()
      .from(moveLifecycleEvents)
      .where(eq(moveLifecycleEvents.status, 'delivered'))
      .orderBy(desc(moveLifecycleEvents.deliveredAt))
      .limit(1),

    db.select()
      .from(moveLifecycleEvents)
      .orderBy(desc(moveLifecycleEvents.emittedAt))
      .limit(1),

    db.select({ count: sql<number>`count(*)::int` })
      .from(moveLifecycleEvents)
      .where(eq(moveLifecycleEvents.status, 'pending')),

    db.select({ count: sql<number>`count(*)::int` })
      .from(moveLifecycleEvents)
      .where(eq(moveLifecycleEvents.status, 'failed')),

    db.select()
      .from(executionOutcomes)
      .where(eq(executionOutcomes.processingStatus, 'processed'))
      .orderBy(desc(executionOutcomes.processedAt))
      .limit(1),

    db.select()
      .from(executionOutcomes)
      .orderBy(desc(executionOutcomes.receivedAt))
      .limit(1),

    db.select({ count: sql<number>`count(*)::int` })
      .from(executionOutcomes)
      .where(eq(executionOutcomes.processingStatus, 'received')),

    db.select({ count: sql<number>`count(*)::int` })
      .from(executionOutcomes)
      .where(eq(executionOutcomes.processingStatus, 'failed')),
  ]);

  const outboundEvent = lastDeliveredEvent[0] || lastEmittedEvent[0] || null;
  const inboundOutcome = lastProcessedOutcome[0] || lastIngestedOutcome[0] || null;

  const outboundLastTime = lastDeliveredEvent[0]?.deliveredAt || lastEmittedEvent[0]?.emittedAt || null;
  const inboundLastTime = lastProcessedOutcome[0]?.processedAt || lastIngestedOutcome[0]?.receivedAt || null;

  const outboundHealth = calculateHealth(outboundLastTime, now);
  const inboundHealth = calculateHealth(inboundLastTime, now);

  const overallStatus = combineStatuses(outboundHealth.status, inboundHealth.status);

  const health: IntegrationHealthStatus = {
    status: overallStatus,
    lastCheckedAt: now.toISOString(),
    outbound: {
      lastSuccessfulEventAt: outboundLastTime?.toISOString() || null,
      lastEventId: outboundEvent?.eventId || null,
      eventType: outboundEvent?.eventType || null,
      pendingCount: outboundPendingCount[0]?.count || 0,
      failedCount: outboundFailedCount[0]?.count || 0,
      status: outboundHealth.status,
      stalledMinutes: outboundHealth.stalledMinutes,
    },
    inbound: {
      lastSuccessfulIngestAt: inboundLastTime?.toISOString() || null,
      lastOutcomeId: inboundOutcome?.outcomeId || null,
      moveId: inboundOutcome?.moveId || null,
      pendingCount: inboundPendingCount[0]?.count || 0,
      failedCount: inboundFailedCount[0]?.count || 0,
      status: inboundHealth.status,
      stalledMinutes: inboundHealth.stalledMinutes,
    },
    summary: '',
  };

  health.summary = generateSummary(health);

  return health;
}
