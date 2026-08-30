/**
 * DriverConnect Integration Module API v1
 *
 * Contract standards (applied via response-transform middleware):
 *   Auth:        Authorization: Bearer <token>  |  X-API-Key: <token>  (both accepted)
 *   Tenant:      X-Tenant-Id: <org-uuid>        (optional; validated against key org when provided)
 *   Idempotency: X-Idempotency-Key: <uuid>      (preferred) | req.body.idempotencyKey (fallback)
 *   Success:     { success: true,  data: T, meta: { requestId, timestamp, page?, pageSize?, total?, hasMore? } }
 *   Error:       { success: false, error: { code, message, details? }, meta: { requestId, timestamp } }
 */
import { Router, Request, Response, NextFunction } from 'express';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db';
import { users, v1ApiKeys } from '../../../shared/schema';
import { requireScope, requireV1ApiKey } from '../../middleware/v1ApiKeyAuth';
import { v1RateLimit } from '../../middleware/v1RateLimit';
import { v1ResponseTransform } from '../../middleware/v1ResponseTransform';
import masterDataRouter from './masterData';
import operationsRouter from './operations';
import dispatchRouter from './dispatch';
import executionEventsRouter from './executionEvents';
import webhookRouter from './webhookRoutes';
import documentsRouter from './documents';
import financialRouter from './financial';
import timeExpenseRouter from './timeExpense';
import docsRouter from './docsRoutes';
import ssoRouter, { DC_ROLE_MAPPING, SSO_ROLES, APP_CODES } from './ssoIdentity';
import schedulingRouter from './scheduling';
import { getContractProducts } from '../../services/contractProductsService';

const __dirname_esm = dirname(fileURLToPath(import.meta.url));

const router = Router();

// ─── 0. Response contract transform (must be FIRST) ──────────────────────────
// Intercepts every res.json() call on v1 routes to:
//   • Add meta.requestId + meta.timestamp to all responses
//   • Normalise legacy error shape → { success: false, error: { code, message } }
//   • Rename meta.limit → meta.pageSize; add meta.hasMore
//   • Emit X-Request-Id response header
router.use(v1ResponseTransform);

// ─── Health check (no auth required) ─────────────────────────────────────────
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      api: 'DriverConnect Integration API',
      version: 'v1',
      auth: {
        bearer: 'Authorization: Bearer <token>',
        legacy: 'X-API-Key: <token>',
      },
      headers: {
        'X-Tenant-Id': 'optional — org UUID validated against token',
        'X-Idempotency-Key': 'required on transactional POST endpoints',
        'X-Request-Id': 'returned on every response for tracing',
      },
      links: {
        docs: '/api/v1/docs',
        openapi: '/api/v1/openapi.json',
        payloads: '/api/v1/docs/payloads',
        postman: '/api/v1/docs/postman',
        uat: '/api/v1/docs/uat-scenarios',
        error_codes: '/api/v1/docs/error-codes',
        dto_contracts: '/api/v1/docs/dto-contracts',
      },
    },
  });
});

// ─── POST /auth/login — DriverConnect V2 compatibility ───────────────────────
// Issues a scoped Bearer token without the web session cookie flow.
// DriverConnect V2 calls this first, caches the returned token, and uses it
// for all subsequent /api/v1/* requests.
router.post('/auth/login', async (req: Request, res: Response) => {
  const { username, password, emailOrUsername } = req.body ?? {};
  const loginId: string | undefined = (emailOrUsername || username)?.toString().trim().toLowerCase();

  if (!loginId || !password) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_CREDENTIALS', message: 'username and password are required.' },
    });
  }

  // Look up user by email or username
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, loginId))
    .limit(1)
    .catch(() => []);

  if (!user || !user.passwordHash) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' },
    });
  }

  if (user.status !== 'ACTIVE') {
    return res.status(403).json({
      success: false,
      error: { code: 'ACCOUNT_DISABLED', message: 'This account is not active.' },
    });
  }

  const passwordValid = await bcrypt.compare(String(password), user.passwordHash);
  if (!passwordValid) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' },
    });
  }

  // Rotate: deactivate any previous auto-issued DriverConnect V2 keys for this user
  await db
    .update(v1ApiKeys)
    .set({ isActive: false })
    .where(
      and(
        eq(v1ApiKeys.createdBy, user.id),
        eq(v1ApiKeys.description, 'driverconnect-v2-sync'),
        eq(v1ApiKeys.isActive, true),
      ),
    )
    .catch(() => null);

  // Generate a fresh scoped API key
  const rawKey = crypto.randomBytes(32).toString('hex');
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 8);
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days

  await db.insert(v1ApiKeys).values({
    name: 'DriverConnect V2 Sync',
    description: 'driverconnect-v2-sync',
    keyHash,
    keyPrefix,
    orgId: user.orgId ?? null,
    scopes: [
      'read:drivers',
      'read:accounts',
      'read:locations',
      'read:service-types',
      'read:schedules',
    ],
    isActive: true,
    expiresAt,
    createdBy: user.id,
  });

  return res.json({
    success: true,
    data: {
      token: rawKey,
      token_type: 'Bearer',
      expires_at: expiresAt.toISOString(),
      scopes: [
        'read:drivers',
        'read:accounts',
        'read:locations',
        'read:service-types',
        'read:schedules',
      ],
    },
  });
});

// ─── Documentation & QA support (no auth required) ───────────────────────────
router.use('/', docsRouter);

// ─── OpenAPI spec (no auth required) ─────────────────────────────────────────
router.get('/openapi.json', (_req: Request, res: Response) => {
  try {
    const specPath = join(__dirname_esm, '../../openapi/v1.json');
    const spec = JSON.parse(readFileSync(specPath, 'utf8'));
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(spec);
  } catch (err) {
    res.status(500).json({ error: 'SPEC_NOT_FOUND', message: 'Could not load OpenAPI specification.' });
  }
});

// ─── GET /api/v1/accounts/:id/contract-products ───────────────────────────────
// Auth is intentionally applied here, before the session passthrough middleware,
// so an unauthenticated request can never fall through to the SPA HTML shell.
router.get(
  '/accounts/:id/contract-products',
  requireV1ApiKey,
  requireScope('read:accounts'),
  async (req: Request, res: Response) => {
    try {
      const data = await getContractProducts(req.params.id);
      if (!data) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: `Account '${req.params.id}' not found.`,
        });
      }
      return res.json({ success: true, data });
    } catch (err) {
      console.error('[v1] GET /accounts/:id/contract-products error:', err);
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch contracted products.',
      });
    }
  },
);

// ─── Supported event types reference (no auth required) ───────────────────────
router.get('/event-types', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      categories: [
        {
          category: 'execution_state_transitions',
          description: 'State machine transitions for move execution. Must follow valid sequence.',
          state_machine: {
            READY: ['EN_ROUTE_PICKUP', 'CANCELLED'],
            EN_ROUTE_PICKUP: ['AT_PICKUP', 'CANCELLED'],
            AT_PICKUP: ['EN_ROUTE_DESTINATION', 'CANCELLED'],
            EN_ROUTE_DESTINATION: ['AT_DESTINATION', 'CANCELLED'],
            AT_DESTINATION: ['COMPLETED', 'CANCELLED'],
          },
          events: [
            { code: 'EN_ROUTE_PICKUP', label: 'En Route to Pickup', from: 'READY' },
            { code: 'AT_PICKUP', label: 'Arrived at Pickup', from: 'EN_ROUTE_PICKUP' },
            { code: 'EN_ROUTE_DESTINATION', label: 'En Route to Destination', from: 'AT_PICKUP' },
            { code: 'AT_DESTINATION', label: 'Arrived at Destination', from: 'EN_ROUTE_DESTINATION' },
            { code: 'COMPLETED', label: 'Trip Completed', from: 'AT_DESTINATION' },
            { code: 'CANCELLED', label: 'Trip Cancelled', from: 'any non-terminal' },
          ],
        },
        {
          category: 'driver_action_events',
          description: 'Driver responses to offer dispatch or informational field events.',
          events: [
            { code: 'ACCEPTED', label: 'Driver Accepted Offer', updates: 'assignmentState → ASSIGNED', requires: 'assignmentState = OFFERED' },
            { code: 'DECLINED', label: 'Driver Declined Offer', updates: 'assignmentState → UNASSIGNED, clears driver', requires: 'assignmentState = OFFERED' },
            { code: 'DELAYED', label: 'Delay Reported', updates: 'none (informational log only)' },
            { code: 'NO_SHOW', label: 'Driver No-Show', updates: 'executionState → CANCELLED, assignmentState → CANCELLED' },
          ],
        },
        {
          category: 'driver_duty_statuses',
          description: 'Driver availability and duty status values for POST /driver-status-events.',
          events: [
            { code: 'ON_DUTY', label: 'On Duty' },
            { code: 'OFF_DUTY', label: 'Off Duty' },
            { code: 'ON_BREAK', label: 'On Break' },
            { code: 'AVAILABLE', label: 'Available for Dispatch' },
            { code: 'UNAVAILABLE', label: 'Unavailable' },
            { code: 'DRIVE_MODE', label: 'Active Drive Mode' },
          ],
        },
        {
          category: 'exception_reason_codes',
          description: 'Standard reason codes for POST /exceptions.',
          events: [
            { code: 'VEHICLE_BREAKDOWN', label: 'Vehicle Breakdown' },
            { code: 'TRAFFIC_DELAY', label: 'Traffic Delay' },
            { code: 'CUSTOMER_UNAVAILABLE', label: 'Customer Unavailable' },
            { code: 'SAFETY_CONCERN', label: 'Safety Concern' },
            { code: 'WEATHER_HAZARD', label: 'Weather Hazard' },
            { code: 'ROUTE_BLOCKED', label: 'Route Blocked' },
            { code: 'DRIVER_EMERGENCY', label: 'Driver Emergency' },
            { code: 'CARGO_DAMAGE', label: 'Cargo Damage' },
            { code: 'ACCESS_DENIED', label: 'Access Denied' },
            { code: 'MECHANICAL_FAILURE', label: 'Mechanical Failure' },
            { code: 'FUEL_ISSUE', label: 'Fuel Issue' },
            { code: 'ACCIDENT', label: 'Accident' },
            { code: 'NAVIGATION_ERROR', label: 'Navigation Error' },
            { code: 'CUSTOMER_DISPUTE', label: 'Customer Dispute' },
            { code: 'OTHER', label: 'Other' },
          ],
        },
        {
          category: 'exception_severity_levels',
          description: 'Severity levels for exceptions.',
          events: [
            { code: 'LOW', label: 'Low — Minor disruption' },
            { code: 'MEDIUM', label: 'Medium — Notable issue, default' },
            { code: 'HIGH', label: 'High — Significant impact' },
            { code: 'CRITICAL', label: 'Critical — Immediate escalation required' },
          ],
        },
        {
          category: 'time_event_types',
          description: 'Clock event types for POST /time-events.',
          events: [
            { code: 'CLOCK_IN', label: 'Clock In' },
            { code: 'CLOCK_OUT', label: 'Clock Out' },
            { code: 'BREAK_START', label: 'Break Start' },
            { code: 'BREAK_END', label: 'Break End' },
          ],
        },
        {
          category: 'webhook_events',
          description: 'Available webhook event types.',
          events: [
            { code: 'move.created' }, { code: 'move.updated' }, { code: 'move.completed' }, { code: 'move.cancelled' },
            { code: 'move.driver_accepted' }, { code: 'move.driver_declined' },
            { code: 'trip.assigned' }, { code: 'trip.reassigned' }, { code: 'trip.unassigned' }, { code: 'trip.completed' },
            { code: 'driver.status_changed' }, { code: 'invoice.created' }, { code: 'payment.issued' },
            { code: 'exception.opened' }, { code: 'time_event.created' }, { code: 'expense.created' }, { code: 'pod.submitted' },
          ],
        },
      ],
    },
  });
});

// ─── SSO role-mapping (public, no auth) ───────────────────────────────────────
router.get('/sso/role-mapping', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      roles: Object.fromEntries(
        (SSO_ROLES as unknown as string[]).map((role) => [
          role,
          (DC_ROLE_MAPPING as Record<string, { dcRole: string; description: string; failSafe: boolean }>)[role],
        ])
      ),
      appCodes: [...APP_CODES],
    },
  });
});

// ─── Step 1: Passthrough / Auth ───────────────────────────────────────────────
// Skip API key auth if NEITHER Authorization: Bearer NOR X-API-Key is present,
// forwarding to session-auth routes. Otherwise authenticate.
router.use((req: Request, res: Response, next: NextFunction) => {
  const hasBearer = req.headers['authorization']?.startsWith('Bearer ');
  const hasApiKey = !!req.headers['x-api-key'];
  if (!hasBearer && !hasApiKey) {
    return next('router');
  }
  requireV1ApiKey(req, res, next);
});

// ─── Step 2: Rate limiting (per API key, 600 req/min) ────────────────────────
router.use(v1RateLimit(600));

// ─── Key info (authenticated) ─────────────────────────────────────────────────
router.get('/key-info', (req: Request, res: Response) => {
  const ctx = req.v1ApiKey!;
  res.json({
    success: true,
    data: {
      key_id: ctx.apiKeyId,
      key_name: ctx.keyName,
      org_id: ctx.orgId,
      tenant_id: req.v1TenantId ?? ctx.orgId,
      scopes: ctx.scopes,
      auth: {
        accepted_schemes: ['Authorization: Bearer <token>', 'X-API-Key: <token>'],
      },
    },
  });
});

// ─── Mount domain routers ─────────────────────────────────────────────────────
// timeExpenseRouter must come before operationsRouter — it owns /time-events
// and /expense-events with the full v1_time_events/v1_expense_events schema.
router.use('/', timeExpenseRouter);
router.use('/', masterDataRouter);
router.use('/', executionEventsRouter);
router.use('/', operationsRouter);
router.use('/', dispatchRouter);
router.use('/', webhookRouter);
router.use('/', documentsRouter);
router.use('/', financialRouter);
router.use('/sso', ssoRouter);
router.use('/', schedulingRouter);

export default router;
