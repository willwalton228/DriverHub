/**
 * DriverConnect Integration API v1 — Webhook Management
 *
 * Endpoints:
 *   GET    /api/v1/webhooks                       — list endpoints     (read:webhooks)
 *   POST   /api/v1/webhooks                       — register endpoint  (manage:webhooks)
 *   GET    /api/v1/webhooks/:id                   — get endpoint       (read:webhooks)
 *   PATCH  /api/v1/webhooks/:id                   — update endpoint    (manage:webhooks)
 *   DELETE /api/v1/webhooks/:id                   — deactivate         (manage:webhooks)
 *   POST   /api/v1/webhooks/:id/test              — fire test event    (manage:webhooks)
 *   GET    /api/v1/webhooks/:id/deliveries        — per-endpoint log   (read:webhooks)
 *   GET    /api/v1/webhook-deliveries             — global delivery log (read:webhooks)
 *   GET    /api/v1/webhook-deliveries/:id         — single delivery    (read:webhooks)
 *   POST   /api/v1/webhook-deliveries/:id/redeliver — redeliver item   (manage:webhooks)
 *   GET    /api/v1/webhook-event-catalog          — list all events    (read:webhooks)
 */
import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { webhookEndpoints, webhookDeliveryLog } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { requireScope } from '../../middleware/v1ApiKeyAuth';
import { dispatchWebhookDirect, redeliverWebhook } from '../../services/webhookService';
import crypto from 'crypto';

const router = Router();

export const SUPPORTED_EVENTS = [
  'move.created',
  'move.updated',
  'move.completed',
  'move.cancelled',
  'move.driver_accepted',
  'move.driver_declined',
  'trip.assigned',
  'trip.reassigned',
  'trip.unassigned',
  'trip.completed',
  'driver.status_changed',
  'account.updated',
  'invoice.created',
  'payment.issued',
  'payment.updated',
  'exception.opened',
  'time_event.created',
  'expense.created',
  'pod.submitted',
];

// Human-readable event catalog with descriptions
const EVENT_CATALOG: Record<string, { description: string; example_fields: string[] }> = {
  'move.created': {
    description: 'A new move/job has been created in DriverHub.',
    example_fields: ['move_id', 'move_number', 'account_id'],
  },
  'move.updated': {
    description: 'A move status, execution state, or assignment state has changed.',
    example_fields: ['move_id', 'status', 'execution_state', 'assignment_state'],
  },
  'move.completed': {
    description: 'A move has reached terminal COMPLETED state.',
    example_fields: ['move_id', 'move_number', 'driver_id', 'completed_at'],
  },
  'move.cancelled': {
    description: 'A move has been cancelled.',
    example_fields: ['move_id', 'move_number', 'cancelled_at'],
  },
  'move.driver_accepted': {
    description: 'A driver accepted a dispatch offer for a move.',
    example_fields: ['move_id', 'driver_id'],
  },
  'move.driver_declined': {
    description: 'A driver declined a dispatch offer for a move.',
    example_fields: ['move_id', 'driver_id'],
  },
  'trip.assigned': {
    description: 'A driver has been assigned to a trip/move.',
    example_fields: ['moveId', 'status', 'driverId', 'driverName'],
  },
  'trip.reassigned': {
    description: 'A move has been reassigned from one driver to another.',
    example_fields: ['moveId', 'status', 'driverId', 'driverName', 'previousDriverId'],
  },
  'trip.unassigned': {
    description: 'A driver has been removed from a trip/move.',
    example_fields: ['move_id', 'driver_id'],
  },
  'trip.completed': {
    description: 'A trip has been marked as completed by the driver.',
    example_fields: ['move_id', 'driver_id', 'completed_at'],
  },
  'driver.status_changed': {
    description: 'A driver\'s operational status has changed (e.g., active → suspended).',
    example_fields: ['driver_id', 'previous_status', 'new_status'],
  },
  'account.updated': {
    description: 'A customer account\'s profile or settings have been updated.',
    example_fields: ['account_id', 'account_name', 'changed_fields'],
  },
  'invoice.created': {
    description: 'A new invoice has been generated.',
    example_fields: ['invoice_id', 'invoice_number', 'customer_id', 'amount'],
  },
  'payment.issued': {
    description: 'A payment has been created.',
    example_fields: ['payment_id', 'amount', 'customer_id'],
  },
  'payment.updated': {
    description: 'A payment\'s status or details have been updated.',
    example_fields: ['payment_id', 'status', 'amount'],
  },
  'exception.opened': {
    description: 'A new exception/incident has been logged against a move.',
    example_fields: ['exception_id', 'move_id', 'exception_type', 'severity'],
  },
  'time_event.created': {
    description: 'A driver clock-in, clock-out, or shift entry has been recorded.',
    example_fields: ['time_event_id', 'driver_id', 'event_type', 'start_at'],
  },
  'expense.created': {
    description: 'A driver expense record has been submitted.',
    example_fields: ['expense_event_id', 'driver_id', 'expense_type', 'amount'],
  },
  'pod.submitted': {
    description: 'A Proof of Delivery document or signature has been submitted.',
    example_fields: ['document_id', 'move_id', 'driver_id', 'document_type'],
  },
};

// ─── GET /api/v1/webhook-event-catalog ────────────────────────────────────────
router.get('/webhook-event-catalog', requireScope('read:webhooks'), (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: SUPPORTED_EVENTS.map(e => ({
      event: e,
      description: EVENT_CATALOG[e]?.description ?? '',
      example_fields: EVENT_CATALOG[e]?.example_fields ?? [],
    })),
    meta: { total: SUPPORTED_EVENTS.length },
  });
});

// ─── GET /api/v1/webhooks ─────────────────────────────────────────────────────
router.get('/webhooks', requireScope('read:webhooks'), async (req: Request, res: Response) => {
  try {
    const orgId = req.v1ApiKey?.orgId;
    if (!orgId) return res.status(403).json({ error: 'TENANT_REQUIRED', message: 'API key must be scoped to an organization.' });

    const rows = await db
      .select({
        id: webhookEndpoints.id,
        name: webhookEndpoints.name,
        url: webhookEndpoints.url,
        events: webhookEndpoints.events,
        isActive: webhookEndpoints.isActive,
        description: webhookEndpoints.description,
        createdAt: webhookEndpoints.createdAt,
        updatedAt: webhookEndpoints.updatedAt,
      })
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.orgId, orgId))
      .orderBy(desc(webhookEndpoints.createdAt));

    res.json({ success: true, data: rows, meta: { total: rows.length } });
  } catch (err: any) {
    console.error('[v1] GET /webhooks error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch webhooks.' });
  }
});

// ─── POST /api/v1/webhooks ────────────────────────────────────────────────────
router.post('/webhooks', requireScope('manage:webhooks'), async (req: Request, res: Response) => {
  try {
    const orgId = req.v1ApiKey?.orgId;
    if (!orgId) return res.status(403).json({ error: 'TENANT_REQUIRED', message: 'API key must be scoped to an organization.' });

    const { name, url, events, description } = req.body;

    if (!name || !url || !events?.length) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'name, url, and events[] are required.' });
    }

    // URL validation
    try { new URL(url); } catch {
      return res.status(400).json({ error: 'INVALID_URL', message: 'url must be a valid HTTPS URL.' });
    }

    // Event validation
    const invalid = events.filter((e: string) => e !== '*' && !SUPPORTED_EVENTS.includes(e));
    if (invalid.length) {
      return res.status(400).json({
        error: 'INVALID_EVENTS',
        message: `Unsupported event types: ${invalid.join(', ')}`,
        supported_events: SUPPORTED_EVENTS,
      });
    }

    const secret = crypto.randomBytes(32).toString('hex');

    const [endpoint] = await db.insert(webhookEndpoints).values({
      orgId,
      name,
      url,
      secret,
      events,
      description,
      isActive: true,
    }).returning();

    res.status(201).json({
      success: true,
      data: { ...endpoint, secret },
      message: 'Store the signing_secret securely — it will not be shown again.',
    });
  } catch (err: any) {
    console.error('[v1] POST /webhooks error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to register webhook.' });
  }
});

// ─── GET /api/v1/webhooks/:id ─────────────────────────────────────────────────
router.get('/webhooks/:id', requireScope('read:webhooks'), async (req: Request, res: Response) => {
  try {
    const orgId = req.v1ApiKey?.orgId;
    const [row] = await db
      .select({
        id: webhookEndpoints.id,
        name: webhookEndpoints.name,
        url: webhookEndpoints.url,
        events: webhookEndpoints.events,
        isActive: webhookEndpoints.isActive,
        description: webhookEndpoints.description,
        createdAt: webhookEndpoints.createdAt,
        updatedAt: webhookEndpoints.updatedAt,
      })
      .from(webhookEndpoints)
      .where(and(
        eq(webhookEndpoints.id, req.params.id),
        orgId ? eq(webhookEndpoints.orgId, orgId) : sql`1=1`
      ))
      .limit(1);

    if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'Webhook endpoint not found.' });
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch webhook.' });
  }
});

// ─── PATCH /api/v1/webhooks/:id ───────────────────────────────────────────────
router.patch('/webhooks/:id', requireScope('manage:webhooks'), async (req: Request, res: Response) => {
  try {
    const orgId = req.v1ApiKey?.orgId;
    const { name, url, events, description, is_active } = req.body;

    const [existing] = await db
      .select()
      .from(webhookEndpoints)
      .where(and(
        eq(webhookEndpoints.id, req.params.id),
        orgId ? eq(webhookEndpoints.orgId, orgId) : sql`1=1`
      ))
      .limit(1);

    if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Webhook endpoint not found.' });

    // Validate events if provided
    if (events) {
      const invalid = events.filter((e: string) => e !== '*' && !SUPPORTED_EVENTS.includes(e));
      if (invalid.length) {
        return res.status(400).json({
          error: 'INVALID_EVENTS',
          message: `Unsupported event types: ${invalid.join(', ')}`,
          supported_events: SUPPORTED_EVENTS,
        });
      }
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (url !== undefined) updates.url = url;
    if (events !== undefined) updates.events = events;
    if (description !== undefined) updates.description = description;
    if (is_active !== undefined) updates.isActive = is_active;

    const [updated] = await db
      .update(webhookEndpoints)
      .set(updates)
      .where(eq(webhookEndpoints.id, req.params.id))
      .returning();

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to update webhook.' });
  }
});

// ─── DELETE /api/v1/webhooks/:id ──────────────────────────────────────────────
router.delete('/webhooks/:id', requireScope('manage:webhooks'), async (req: Request, res: Response) => {
  try {
    const orgId = req.v1ApiKey?.orgId;
    const [existing] = await db
      .select()
      .from(webhookEndpoints)
      .where(and(
        eq(webhookEndpoints.id, req.params.id),
        orgId ? eq(webhookEndpoints.orgId, orgId) : sql`1=1`
      ))
      .limit(1);

    if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Webhook endpoint not found.' });

    await db
      .update(webhookEndpoints)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(webhookEndpoints.id, req.params.id));

    res.json({ success: true, message: 'Webhook endpoint deactivated.' });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to deactivate webhook.' });
  }
});

// ─── POST /api/v1/webhooks/:id/test ───────────────────────────────────────────
router.post('/webhooks/:id/test', requireScope('manage:webhooks'), async (req: Request, res: Response) => {
  try {
    const [endpoint] = await db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.id, req.params.id))
      .limit(1);

    if (!endpoint) return res.status(404).json({ error: 'NOT_FOUND', message: 'Webhook endpoint not found.' });

    const testPayload = {
      event: 'webhook.test',
      test: true,
      timestamp: new Date().toISOString(),
      api_version: 'v1',
      webhook_id: endpoint.id,
      message: 'This is a test event from DriverHub Integration API.',
    };

    const result = await dispatchWebhookDirect(endpoint, testPayload);

    res.json({
      success: true,
      data: {
        webhook_id: endpoint.id,
        url: endpoint.url,
        status: result.success ? 'delivered' : 'failed',
        http_status: result.statusCode,
        duration_ms: result.durationMs,
        error: result.error ?? undefined,
      },
    });
  } catch (err: any) {
    console.error('[v1] POST /webhooks/:id/test error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to send test webhook.' });
  }
});

// ─── GET /api/v1/webhooks/:id/deliveries ──────────────────────────────────────
router.get('/webhooks/:id/deliveries', requireScope('read:webhooks'), async (req: Request, res: Response) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const { status, event_type } = req.query as Record<string, string>;

    const [exists] = await db
      .select({ id: webhookEndpoints.id })
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.id, req.params.id))
      .limit(1);

    if (!exists) return res.status(404).json({ error: 'NOT_FOUND', message: 'Webhook endpoint not found.' });

    const conditions: any[] = [eq(webhookDeliveryLog.endpointId, req.params.id)];
    if (status) conditions.push(eq(webhookDeliveryLog.status, status));
    if (event_type) conditions.push(eq(webhookDeliveryLog.eventType, event_type));
    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    const [rows, countRes] = await Promise.all([
      db.select().from(webhookDeliveryLog)
        .where(whereClause)
        .orderBy(desc(webhookDeliveryLog.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(webhookDeliveryLog).where(whereClause),
    ]);

    res.json({
      success: true,
      data: rows,
      meta: { page, limit, total: Number(countRes[0]?.count || 0), pages: Math.ceil(Number(countRes[0]?.count || 0) / limit) },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch webhook deliveries.' });
  }
});

// ─── GET /api/v1/webhook-deliveries ───────────────────────────────────────────
router.get('/webhook-deliveries', requireScope('read:webhooks'), async (req: Request, res: Response) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit  = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;
    const { status, event_type, endpoint_id } = req.query as Record<string, string>;

    const conditions: any[] = [];
    if (status) conditions.push(eq(webhookDeliveryLog.status, status));
    if (event_type) conditions.push(eq(webhookDeliveryLog.eventType, event_type));
    if (endpoint_id) conditions.push(eq(webhookDeliveryLog.endpointId, endpoint_id));
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [rows, countRes] = await Promise.all([
      db.select({
        id: webhookDeliveryLog.id,
        endpointId: webhookDeliveryLog.endpointId,
        eventType: webhookDeliveryLog.eventType,
        status: webhookDeliveryLog.status,
        attempts: webhookDeliveryLog.attempts,
        responseStatus: webhookDeliveryLog.responseStatus,
        deliveredAt: webhookDeliveryLog.deliveredAt,
        lastAttemptAt: webhookDeliveryLog.lastAttemptAt,
        nextRetryAt: webhookDeliveryLog.nextRetryAt,
        createdAt: webhookDeliveryLog.createdAt,
      })
        .from(webhookDeliveryLog)
        .where(whereClause)
        .orderBy(desc(webhookDeliveryLog.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(webhookDeliveryLog).where(whereClause),
    ]);

    const total = Number(countRes[0]?.count || 0);
    res.json({
      success: true,
      data: rows,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch delivery log.' });
  }
});

// ─── GET /api/v1/webhook-deliveries/:id ───────────────────────────────────────
router.get('/webhook-deliveries/:id', requireScope('read:webhooks'), async (req: Request, res: Response) => {
  try {
    const [delivery] = await db
      .select()
      .from(webhookDeliveryLog)
      .where(eq(webhookDeliveryLog.id, req.params.id))
      .limit(1);

    if (!delivery) return res.status(404).json({ error: 'NOT_FOUND', message: 'Delivery record not found.' });
    res.json({ success: true, data: delivery });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch delivery record.' });
  }
});

// ─── POST /api/v1/webhook-deliveries/:id/redeliver ────────────────────────────
router.post('/webhook-deliveries/:id/redeliver', requireScope('manage:webhooks'), async (req: Request, res: Response) => {
  try {
    const [delivery] = await db
      .select({ id: webhookDeliveryLog.id, status: webhookDeliveryLog.status })
      .from(webhookDeliveryLog)
      .where(eq(webhookDeliveryLog.id, req.params.id))
      .limit(1);

    if (!delivery) return res.status(404).json({ error: 'NOT_FOUND', message: 'Delivery record not found.' });

    const allowedStatuses = ['failed', 'dead_letter'];
    if (!allowedStatuses.includes(delivery.status ?? '')) {
      return res.status(409).json({
        error: 'CONFLICT',
        message: `Only failed or dead_letter deliveries can be redelivered. Current status: ${delivery.status}`,
      });
    }

    const result = await redeliverWebhook(req.params.id);
    if (!result.queued) {
      return res.status(500).json({ error: 'REDELIVER_FAILED', message: result.error || 'Failed to queue redeliver.' });
    }

    res.json({
      success: true,
      message: 'Redeliver queued.',
      data: { delivery_id: req.params.id, status: 'pending' },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to redeliver webhook.' });
  }
});

export default router;
