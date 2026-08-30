/**
 * Integration Event Logger
 *
 * Writes durable trace records to integration_event_log for every inbound
 * event processed through the DriverConnect Integration Module.
 *
 * Usage:
 *   await logIntegrationEvent({ sourceSystem: 'driverconnect', targetSystem: 'driverhub',
 *     entityType: 'move', entityId: move.id, eventType: 'execution_event.received',
 *     payloadJson: payload, status: 'processed' });
 */
import { db } from '../db';
import { integrationEventLog } from '../../shared/schema';

export interface IntegrationEventParams {
  sourceSystem: string;
  targetSystem: string;
  entityType:   string;
  entityId?:    string | null;
  eventType:    string;
  payloadJson?: Record<string, unknown> | null;
  status:       'received' | 'processed' | 'failed';
  errorMessage?: string | null;
  attemptCount?: number;
}

export async function logIntegrationEvent(params: IntegrationEventParams): Promise<void> {
  try {
    await db.insert(integrationEventLog).values({
      sourceSystem: params.sourceSystem,
      targetSystem: params.targetSystem,
      entityType:   params.entityType,
      entityId:     params.entityId ?? undefined,
      eventType:    params.eventType,
      payloadJson:  params.payloadJson ?? undefined,
      status:       params.status,
      errorMessage: params.errorMessage ?? undefined,
      attemptCount: params.attemptCount ?? 0,
      processedAt:  params.status !== 'received' ? new Date() : undefined,
    });
  } catch (err) {
    // Non-fatal: logging should never break the primary request flow
    console.error('[integrationLogger] Failed to write event log:', err);
  }
}
