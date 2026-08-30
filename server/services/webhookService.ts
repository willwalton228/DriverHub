import crypto from 'crypto';
import { db } from '../db';
import { webhookEndpoints, webhookDeliveryLog } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

export type WebhookEventType =
  | 'move.created'
  | 'move.updated'
  | 'move.completed'
  | 'move.cancelled'
  | 'move.driver_accepted'
  | 'move.driver_declined'
  | 'trip.assigned'
  | 'trip.reassigned'
  | 'trip.unassigned'
  | 'trip.completed'
  | 'driver.status_changed'
  | 'account.updated'
  | 'invoice.created'
  | 'payment.issued'
  | 'payment.updated'
  | 'exception.opened'
  | 'time_event.created'
  | 'expense.created'
  | 'pod.submitted';

// Production-grade retry delays (ms): 10s, 60s, 10m, 60m, 4h
const RETRY_DELAYS_MS = [10_000, 60_000, 600_000, 3_600_000, 14_400_000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1; // 5 retries = 6 total attempts

export async function dispatchWebhook(
  orgId: string,
  eventType: WebhookEventType,
  payload: Record<string, any>
): Promise<void> {
  try {
    const endpoints = await db
      .select()
      .from(webhookEndpoints)
      .where(and(eq(webhookEndpoints.orgId, orgId), eq(webhookEndpoints.isActive, true)));

    const subscribed = endpoints.filter(ep => {
      const events = (ep.events as string[]) || [];
      return events.includes('*') || events.includes(eventType);
    });

    if (!subscribed.length) return;

    const eventId = `wh_${crypto.randomBytes(8).toString('hex')}`;
    const eventPayload = {
      eventId,
      eventType,
      occurredAt: new Date().toISOString(),
      tenantId: orgId,
      data: payload,
    };

    for (const endpoint of subscribed) {
      const [logEntry] = await db
        .insert(webhookDeliveryLog)
        .values({
          endpointId: endpoint.id,
          eventType,
          payload: eventPayload,
          status: 'pending',
          attempts: 0,
        })
        .returning({ id: webhookDeliveryLog.id });

      // Fire-and-forget with 5-attempt retry
      deliverWithRetry(
        logEntry.id,
        endpoint.url,
        endpoint.secret as string,
        eventPayload,
        1
      ).catch(err =>
        console.error(`[Webhook] Background delivery failed for ${logEntry.id}:`, err.message)
      );
    }
  } catch (err: any) {
    console.error('[Webhook] dispatchWebhook error:', err.message);
  }
}

async function deliverWithRetry(
  logId: string,
  url: string,
  secret: string,
  payload: Record<string, any>,
  attempt: number
): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event':     payload.eventType ?? payload.event ?? 'webhook',
        'X-Webhook-Id':        payload.eventId  ?? logId,
        'X-DriverHub-Attempt': String(attempt),
        'User-Agent': 'DriverHub360/1.0 Webhook',
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const responseBody = await response.text().catch(() => '');
    const delivered = response.ok;
    const isFinalAttempt = attempt >= MAX_ATTEMPTS;

    await db
      .update(webhookDeliveryLog)
      .set({
        status: delivered ? 'delivered' : isFinalAttempt ? 'dead_letter' : 'failed',
        attempts: attempt,
        lastAttemptAt: new Date(),
        deliveredAt: delivered ? new Date() : undefined,
        responseStatus: response.status,
        responseBody: responseBody.slice(0, 2000),
        nextRetryAt:
          !delivered && !isFinalAttempt
            ? new Date(Date.now() + RETRY_DELAYS_MS[attempt - 1])
            : undefined,
      })
      .where(eq(webhookDeliveryLog.id, logId));

    if (!delivered && !isFinalAttempt) {
      const delay = RETRY_DELAYS_MS[attempt - 1];
      setTimeout(() => deliverWithRetry(logId, url, secret, payload, attempt + 1), delay);
    }
  } catch (err: any) {
    const isAbort = err.name === 'AbortError';
    const isFinalAttempt = attempt >= MAX_ATTEMPTS;

    await db
      .update(webhookDeliveryLog)
      .set({
        status: isFinalAttempt ? 'dead_letter' : 'failed',
        attempts: attempt,
        lastAttemptAt: new Date(),
        responseBody: isAbort ? 'TIMEOUT_10s' : err.message?.slice(0, 500),
        nextRetryAt:
          !isFinalAttempt
            ? new Date(Date.now() + RETRY_DELAYS_MS[attempt - 1])
            : undefined,
      })
      .where(eq(webhookDeliveryLog.id, logId));

    if (!isFinalAttempt) {
      const delay = RETRY_DELAYS_MS[attempt - 1];
      setTimeout(() => deliverWithRetry(logId, url, secret, payload, attempt + 1), delay);
    }
  }
}

/**
 * Manually redeliver a specific delivery (for dead-letter / failed items).
 * Looks up the delivery, fetches its endpoint, and re-dispatches.
 * Returns true if the redeliver attempt was queued, false if not found.
 */
export async function redeliverWebhook(deliveryId: string): Promise<{
  queued: boolean;
  error?: string;
}> {
  try {
    const [delivery] = await db
      .select()
      .from(webhookDeliveryLog)
      .where(eq(webhookDeliveryLog.id, deliveryId))
      .limit(1);

    if (!delivery) return { queued: false, error: 'Delivery record not found.' };

    const [endpoint] = await db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.id, delivery.endpointId!))
      .limit(1);

    if (!endpoint) return { queued: false, error: 'Webhook endpoint not found or deleted.' };

    // Reset to pending, restart the attempt counter from 1 (fresh retry cycle)
    await db
      .update(webhookDeliveryLog)
      .set({ status: 'pending', attempts: 0, nextRetryAt: null })
      .where(eq(webhookDeliveryLog.id, deliveryId));

    deliverWithRetry(
      deliveryId,
      endpoint.url,
      endpoint.secret as string,
      delivery.payload as Record<string, any>,
      1  // always restart from attempt 1 for manual redelivers
    ).catch(err =>
      console.error(`[Webhook] Redeliver failed for ${deliveryId}:`, err.message)
    );

    return { queued: true };
  } catch (err: any) {
    return { queued: false, error: err.message };
  }
}

export function validateWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): boolean {
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Directly deliver a test payload to a single webhook endpoint (synchronous, for testing).
 */
export async function dispatchWebhookDirect(
  endpoint: { id: string; url: string; secret?: string | null; signingSecret?: string | null },
  payload: Record<string, any>
): Promise<{ success: boolean; statusCode?: number; durationMs: number; error?: string }> {
  const body = JSON.stringify(payload);
  const secret = endpoint.secret || endpoint.signingSecret || 'test-secret';
  const signature = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  const start = Date.now();
  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event':     payload.eventType ?? payload.event ?? 'webhook.test',
        'X-Webhook-Id':        payload.eventId  ?? `test-${Date.now()}`,
        'X-DriverHub-Attempt': '1',
        'User-Agent': 'DriverHub360/1.0 Webhook',
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    return { success: response.ok, statusCode: response.status, durationMs: Date.now() - start };
  } catch (err: any) {
    return { success: false, durationMs: Date.now() - start, error: err.message };
  }
}
