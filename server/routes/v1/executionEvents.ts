/**
 * DriverConnect Integration API v1 — Execution Events, Exceptions & Driver Status Module
 *
 *   POST /api/v1/execution-events      — Record a move execution event (write:execution)
 *   POST /api/v1/exceptions            — Report a field exception against a move (write:exceptions)
 *   POST /api/v1/driver-status-events  — Record a driver duty-status change (write:execution)
 *
 * Supported event types (DriverConnect contract names):
 *   driver_accepted  — driver accepted an offered move       (assignmentState: OFFERED → ASSIGNED)
 *   driver_declined  — driver declined an offered move       (assignmentState: OFFERED → UNASSIGNED)
 *   en_route         — driver en route to pickup             (executionState:  READY → EN_ROUTE_PICKUP)
 *   arrived          — driver arrived at pickup or delivery  (executionState:  EN_ROUTE_PICKUP → AT_PICKUP
 *                                                                              EN_ROUTE_DESTINATION → AT_DESTINATION)
 *   trip_started     — driver departed pickup with vehicle   (executionState:  AT_PICKUP → EN_ROUTE_DESTINATION)
 *   trip_completed   — move completed                        (executionState:  AT_DESTINATION → COMPLETED)
 *   trip_cancelled   — move cancelled                        (executionState:  any → CANCELLED)
 *   delayed          — informational delay notice            (no state change)
 *   no_show          — driver did not appear                 (executionState + assignmentState → CANCELLED)
 *
 * Contract standards:
 *   • Bearer / X-API-Key auth (applied by parent router)
 *   • Response envelope applied by v1ResponseTransform middleware
 *   • X-Idempotency-Key supported (24-hour window; idempotency_key unique constraint on DB)
 *   • moveId accepts UUID or move number (e.g. "MV-000006")
 *   • actor.id accepts UUID or driver number
 */

import { Router, Request, Response } from 'express';
import { db } from '../../db';
import {
  trips, drivers, users,
  v1ExecutionEvents, v1Exceptions, v1DriverStatusEvents, v1AuditLog, moveOfferAudit,
} from '@shared/schema';
import { eq, and, ne, desc } from 'drizzle-orm';
import { requireScope } from '../../middleware/v1ApiKeyAuth';
import { dispatchWebhook } from '../../services/webhookService';
import { logIntegrationEvent } from '../../services/integrationLogger';

const router = Router();

// ─── Contract event type → internal state machine mapping ────────────────────

/** All valid contract event type names. */
const CONTRACT_EVENT_TYPES = [
  'driver_accepted', 'driver_declined',
  'en_route', 'arrived', 'trip_started',
  'trip_completed', 'trip_cancelled',
  'delayed', 'no_show',
] as const;
type ContractEventType = typeof CONTRACT_EVENT_TYPES[number];

/** Internal DB execution states. */
type ExecState = 'READY' | 'EN_ROUTE_PICKUP' | 'AT_PICKUP' | 'EN_ROUTE_DESTINATION' | 'AT_DESTINATION' | 'COMPLETED' | 'CANCELLED';

const TERMINAL_STATES: ExecState[] = ['COMPLETED', 'CANCELLED'];

/**
 * Derive the target executionState given the contract event type and the move's
 * current executionState.  Returns null when the event is informational (no DB
 * state change) or when the transition is driver-action-only.
 */
function resolveTargetExecState(
  eventType: ContractEventType,
  current: ExecState,
): { targetExec: ExecState | null; error?: string } {
  switch (eventType) {
    case 'driver_accepted':
    case 'driver_declined':
    case 'delayed':
      return { targetExec: null }; // handled separately / informational

    case 'no_show':
    case 'trip_cancelled':
      return { targetExec: 'CANCELLED' };

    case 'en_route':
      if (current === 'READY') return { targetExec: 'EN_ROUTE_PICKUP' };
      return {
        targetExec: null,
        error: `Cannot record 'en_route' — move is in '${current}' state (expected READY).`,
      };

    case 'arrived':
      if (current === 'EN_ROUTE_PICKUP')        return { targetExec: 'AT_PICKUP' };
      if (current === 'EN_ROUTE_DESTINATION')   return { targetExec: 'AT_DESTINATION' };
      return {
        targetExec: null,
        error: `Cannot record 'arrived' — move is in '${current}' state (expected EN_ROUTE_PICKUP or EN_ROUTE_DESTINATION).`,
      };

    case 'trip_started':
      if (current === 'AT_PICKUP') return { targetExec: 'EN_ROUTE_DESTINATION' };
      return {
        targetExec: null,
        error: `Cannot record 'trip_started' — move is in '${current}' state (expected AT_PICKUP).`,
      };

    case 'trip_completed':
      if (current === 'AT_DESTINATION') return { targetExec: 'COMPLETED' };
      return {
        targetExec: null,
        error: `Cannot record 'trip_completed' — move is in '${current}' state (expected AT_DESTINATION).`,
      };

    default:
      return { targetExec: null, error: `Unrecognised event type '${eventType}'.` };
  }
}

/** Map internal executionState → contract-facing status label. */
const EXEC_STATE_TO_STATUS: Record<string, string> = {
  READY:                'unassigned',
  EN_ROUTE_PICKUP:      'en_route',
  AT_PICKUP:            'arrived',
  EN_ROUTE_DESTINATION: 'in_progress',
  AT_DESTINATION:       'arrived',
  COMPLETED:            'completed',
  CANCELLED:            'cancelled',
};

// ─── Local helpers ────────────────────────────────────────────────────────────

/** Resolve a moveId that may be a UUID or move number like "MV-000001". */
async function resolveMove(raw: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
  const [row] = await db
    .select({
      id:              trips.id,
      moveNumber:      trips.moveNumber,
      driverId:        trips.driverId,
      assignmentState: trips.assignmentState,
      executionState:  trips.executionState,
      status:          trips.status,
    })
    .from(trips)
    .where(isUuid ? eq(trips.id, raw) : eq(trips.moveNumber, raw.toUpperCase()))
    .limit(1);
  return row ?? null;
}

/** Resolve actor.id (UUID or driver number) → internal UUID. */
async function resolveActorDriverId(raw: string): Promise<string | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
  const [row] = await db
    .select({ id: drivers.id })
    .from(drivers)
    .where(isUuid ? eq(drivers.id, raw) : eq(drivers.driverNumber, raw))
    .limit(1);
  return row?.id ?? null;
}

/** Write to move_offer_audit. Non-blocking. */
async function auditMove(
  moveId: string,
  eventType: string,
  driverId: string | null,
  actorUserId: string | null,
  oldState: string,
  newState: string,
  note: string | null,
) {
  await db.insert(moveOfferAudit).values({
    moveId, eventType, driverId, actorUserId,
    oldState, newState, note,
    metadata: { source: 'execution_event_api' },
  }).catch(err => console.error('[executionEvents] audit log failed:', err.message));
}

/** Write to v1_audit_log. Non-blocking. */
async function writeAuditLog(req: Request, action: string, resourceId: string, statusCode: number) {
  const ctx = req.v1ApiKey;
  await db.insert(v1AuditLog).values({
    apiKeyId:       ctx?.apiKeyId,
    keyName:        ctx?.keyName,
    orgId:          ctx?.orgId,
    action,
    resource:       'execution_events',
    resourceId,
    requestBody:    req.body as any,
    responseStatus: statusCode,
    idempotencyKey: req.headers['x-idempotency-key'] as string,
    ipAddress:      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
    userAgent:      req.headers['user-agent'],
  }).catch(err => console.error('[executionEvents] v1 audit log failed:', err.message));
}

// ─── POST /api/v1/execution-events ───────────────────────────────────────────
router.post(
  '/execution-events',
  requireScope('write:execution'),
  async (req: Request, res: Response) => {
    const idempotencyKey = (req.headers['x-idempotency-key'] as string) ?? '';
    const orgId          = req.v1ApiKey?.orgId ?? null;

    // ── Idempotency: check unique constraint first (fast path) ────────────────
    // The v1_execution_events table has a UNIQUE constraint on idempotency_key.
    // If we find an existing row, return the stored response from v1_audit_log.
    // Simpler approach: try to look up an existing event with this key.
    if (idempotencyKey) {
      const [existing] = await db
        .select({ id: v1ExecutionEvents.id, moveId: v1ExecutionEvents.moveId, createdAt: v1ExecutionEvents.createdAt, payload: v1ExecutionEvents.payload })
        .from(v1ExecutionEvents)
        .where(eq(v1ExecutionEvents.idempotencyKey, idempotencyKey))
        .limit(1);

      if (existing) {
        const cached = existing.payload as any;
        return res.status(200).json({
          success: true,
          data: {
            moveId:          existing.moveId,
            currentStatus:   cached?.currentStatus ?? cached?.eventType ?? null,
            recordedEventId: existing.id,
            recordedAt:      existing.createdAt ? new Date(existing.createdAt).toISOString() : null,
          },
        });
      }
    }

    // ── Input validation ──────────────────────────────────────────────────────
    const { moveId: rawMoveId, eventType: rawEventType, eventTimestamp, actor, location, notes, metadata } = req.body ?? {};

    if (!rawMoveId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELD', message: '`moveId` is required.' },
      });
    }
    if (!rawEventType) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELD', message: '`eventType` is required.' },
      });
    }
    const eventType = String(rawEventType).toLowerCase() as ContractEventType;
    if (!(CONTRACT_EVENT_TYPES as readonly string[]).includes(eventType)) {
      return res.status(400).json({
        success: false,
        error: {
          code:         'INVALID_EVENT_TYPE',
          message:      `'${rawEventType}' is not a valid event type.`,
          validValues:  [...CONTRACT_EVENT_TYPES],
        },
      });
    }

    // ── Resolve move ──────────────────────────────────────────────────────────
    const move = await resolveMove(String(rawMoveId));
    if (!move) {
      return res.status(422).json({
        success: false,
        error: { code: 'MOVE_NOT_FOUND', message: `Move '${rawMoveId}' not found.` },
      });
    }

    const currentExec = (move.executionState ?? 'READY') as ExecState;

    // ── Terminal-state guard ──────────────────────────────────────────────────
    if (TERMINAL_STATES.includes(currentExec)) {
      return res.status(409).json({
        success: false,
        error: {
          code:    'MOVE_IN_TERMINAL_STATE',
          message: `Move '${move.moveNumber}' is already ${currentExec.toLowerCase()} — no further events can be recorded.`,
          details: { currentExecutionState: currentExec },
        },
      });
    }

    // ── Resolve actor driver ID (if provided) ─────────────────────────────────
    let resolvedDriverId: string | null = move.driverId ?? null;
    if (actor?.id && actor?.type === 'driver') {
      const actorId = await resolveActorDriverId(String(actor.id));
      if (actorId) resolvedDriverId = actorId;
      // Non-fatal if not found — fall back to the move's assigned driver
    }

    // ── Parse timestamp ───────────────────────────────────────────────────────
    const eventTs = eventTimestamp ? new Date(eventTimestamp) : new Date();
    const now      = new Date();

    // ── Lat / lng ─────────────────────────────────────────────────────────────
    const lat = location?.latitude  != null ? String(location.latitude)  : null;
    const lng = location?.longitude != null ? String(location.longitude) : null;

    // ── Build trip updates and fire state machine ─────────────────────────────
    const tripUpdates: Record<string, any> = { updatedAt: now };
    let   currentStatus = eventType as string;   // default: echo event type

    // ── Driver-action events ──────────────────────────────────────────────────
    if (eventType === 'driver_accepted') {
      if (move.assignmentState !== 'OFFERED') {
        return res.status(409).json({
          success: false,
          error: {
            code:    'INVALID_STATE',
            message: `'driver_accepted' can only be recorded when the move is in OFFERED state. Current state: ${move.assignmentState}.`,
            details: { currentAssignmentState: move.assignmentState },
          },
        });
      }
      tripUpdates.assignmentState = 'ASSIGNED';
      currentStatus = 'accepted';

    } else if (eventType === 'driver_declined') {
      if (move.assignmentState !== 'OFFERED') {
        return res.status(409).json({
          success: false,
          error: {
            code:    'INVALID_STATE',
            message: `'driver_declined' can only be recorded when the move is in OFFERED state. Current state: ${move.assignmentState}.`,
            details: { currentAssignmentState: move.assignmentState },
          },
        });
      }
      tripUpdates.assignmentState = 'UNASSIGNED';
      tripUpdates.driverId        = null;
      currentStatus = 'unassigned';

    } else if (eventType === 'delayed') {
      // Informational — no state change
      currentStatus = 'delayed';

    } else if (eventType === 'no_show') {
      tripUpdates.executionState  = 'CANCELLED';
      tripUpdates.assignmentState = 'CANCELLED';
      tripUpdates.status          = 'exception';
      currentStatus = 'exception';

    } else {
      // ── State-transition events ───────────────────────────────────────────
      const { targetExec, error: transitionError } = resolveTargetExecState(eventType, currentExec);

      if (transitionError || targetExec === null) {
        return res.status(409).json({
          success: false,
          error: {
            code:    'INVALID_TRANSITION',
            message: transitionError ?? `Cannot process event '${eventType}' in current state.`,
            details: {
              currentExecutionState: currentExec,
              event:                 eventType,
            },
          },
        });
      }

      tripUpdates.executionState = targetExec;
      if (targetExec === 'COMPLETED') {
        tripUpdates.status          = 'completed';
        tripUpdates.assignmentState = 'ASSIGNED';
      } else if (targetExec === 'CANCELLED') {
        tripUpdates.status          = 'cancelled';
        tripUpdates.assignmentState = 'CANCELLED';
      } else {
        tripUpdates.status = 'in_progress';
      }
      currentStatus = EXEC_STATE_TO_STATUS[targetExec] ?? eventType;
    }

    // ── Insert execution event record ─────────────────────────────────────────
    // Spec Section 9: explicit columns for event_timestamp, actor_type, actor_id, notes
    const [eventRecord] = await db
      .insert(v1ExecutionEvents)
      .values({
        idempotencyKey:  idempotencyKey || undefined,
        apiKeyId:        req.v1ApiKey?.apiKeyId,
        orgId:           orgId ?? undefined,
        moveId:          move.id,
        driverId:        resolvedDriverId ?? undefined,
        eventType:       eventType.toUpperCase(),
        eventTimestamp:  eventTs,
        actorType:       actor?.type  ?? undefined,
        actorId:         actor?.id    ? String(actor.id) : undefined,
        notes:           notes        ?? undefined,
        lat:             lat ?? undefined,
        lng:             lng ?? undefined,
        payload: {
          contractEventType: eventType,
          moveId:            move.id,
          externalId:        move.moveNumber,
          currentStatus,
          actor:             actor ?? null,
          location:          location ?? null,
          notes:             notes ?? null,
          metadata:          metadata ?? null,
          eventTimestamp:    eventTs.toISOString(),
        },
        processedAt: now,
      })
      .returning({ id: v1ExecutionEvents.id, createdAt: v1ExecutionEvents.createdAt });

    // ── Log to integration_event_log (non-blocking) ───────────────────────────
    logIntegrationEvent({
      sourceSystem: 'driverconnect',
      targetSystem: 'driverhub',
      entityType:   'move',
      entityId:     move.id,
      eventType:    `execution_event.${eventType}`,
      payloadJson:  { eventType, actor: actor ?? null, eventTimestamp: eventTs.toISOString() },
      status:       'processed',
    });

    // ── Apply trip state updates ──────────────────────────────────────────────
    if (Object.keys(tripUpdates).length > 1) { // >1 because updatedAt always present
      await db.update(trips).set(tripUpdates).where(eq(trips.id, move.id));
    }

    // ── Audit trail (move_offer_audit) — only for meaningful state changes ────
    const oldExec = move.executionState ?? 'READY';
    const newExec = tripUpdates.executionState ?? oldExec;
    if (newExec !== oldExec || tripUpdates.assignmentState) {
      await auditMove(
        move.id,
        eventType.toUpperCase(),
        resolvedDriverId,
        actor?.type === 'dispatcher' ? actor.id : null,
        oldExec,
        newExec,
        notes ?? null,
      );
    }

    await writeAuditLog(req, `execution_event.${eventType}`, eventRecord.id, 201);

    // ── Webhook ───────────────────────────────────────────────────────────────
    const webhookEvent = eventType === 'trip_completed' ? 'trip.completed'
      : eventType === 'trip_cancelled' || eventType === 'no_show' ? 'move.updated'
      : 'move.updated';

    dispatchWebhook(orgId ?? '', webhookEvent, {
      moveId:       move.id,
      externalId:   move.moveNumber,
      eventType,
      currentStatus,
      driverId:     resolvedDriverId,
      lat:          location?.latitude  ?? null,
      lng:          location?.longitude ?? null,
      recordedAt:   eventTs.toISOString(),
    }).catch((err: Error) =>
      console.error('[executionEvents] webhook failed:', err.message),
    );

    // ── Response ──────────────────────────────────────────────────────────────
    return res.status(201).json({
      success: true,
      data: {
        moveId:          move.id,
        externalId:      move.moveNumber,
        currentStatus,
        recordedEventId: eventRecord.id,
        recordedAt:      eventTs.toISOString(),
      },
    });
  },
);

// ─── POST /api/v1/exceptions ─────────────────────────────────────────────────
//
// Contract exception types → internal DB reason codes
// The DB stores uppercase REASON_CODES; the contract exposes lowercase snake_case names.
const EXCEPTION_TYPE_TO_REASON: Record<string, string> = {
  customer_not_ready:  'CUSTOMER_UNAVAILABLE',
  customer_no_show:    'CUSTOMER_UNAVAILABLE',
  vehicle_issue:       'VEHICLE_BREAKDOWN',
  traffic_delay:       'TRAFFIC_DELAY',
  weather_delay:       'WEATHER_HAZARD',
  address_problem:     'ROUTE_BLOCKED',
  documentation_issue: 'CUSTOMER_DISPUTE',
  other:               'OTHER',
};

const CONTRACT_EXCEPTION_TYPES = Object.keys(EXCEPTION_TYPE_TO_REASON);
const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

router.post(
  '/exceptions',
  requireScope('write:exceptions'),
  async (req: Request, res: Response) => {
    const idempotencyKey = (req.headers['x-idempotency-key'] as string) ?? '';
    const orgId          = req.v1ApiKey?.orgId ?? null;

    // ── Idempotency: look up existing record by unique key ──────────────────
    if (idempotencyKey) {
      const [existing] = await db
        .select({
          id:        v1Exceptions.id,
          moveId:    v1Exceptions.moveId,
          status:    v1Exceptions.status,
          createdAt: v1Exceptions.createdAt,
          payload:   v1Exceptions.payload,
        })
        .from(v1Exceptions)
        .where(eq(v1Exceptions.idempotencyKey, idempotencyKey))
        .limit(1);

      if (existing) {
        const p = existing.payload as any;
        return res.status(200).json({
          success: true,
          data: {
            exceptionId: existing.id,
            moveId:      existing.moveId,
            externalId:  p?.externalId ?? null,
            status:      (existing.status ?? 'OPEN').toLowerCase(),
            createdAt:   existing.createdAt ? new Date(existing.createdAt).toISOString() : null,
          },
        });
      }
    }

    // ── Input validation ────────────────────────────────────────────────────
    const {
      moveId: rawMoveId,
      exceptionType: rawType,
      severity: rawSeverity = 'medium',
      reportedAt,
      actor,
      location,
      notes,
    } = req.body ?? {};

    if (!rawType) {
      return res.status(400).json({
        success: false,
        error: {
          code:       'MISSING_FIELD',
          message:    '`exceptionType` is required.',
          validValues: CONTRACT_EXCEPTION_TYPES,
        },
      });
    }

    const exceptionType = String(rawType).toLowerCase();
    if (!CONTRACT_EXCEPTION_TYPES.includes(exceptionType)) {
      return res.status(400).json({
        success: false,
        error: {
          code:       'INVALID_EXCEPTION_TYPE',
          message:    `'${rawType}' is not a valid exception type.`,
          validValues: CONTRACT_EXCEPTION_TYPES,
        },
      });
    }

    const severity = String(rawSeverity).toLowerCase();
    if (!(VALID_SEVERITIES as readonly string[]).includes(severity)) {
      return res.status(400).json({
        success: false,
        error: {
          code:       'INVALID_SEVERITY',
          message:    `Severity must be one of: ${VALID_SEVERITIES.join(', ')}.`,
          validValues: [...VALID_SEVERITIES],
        },
      });
    }

    // ── Resolve move (optional) ─────────────────────────────────────────────
    let resolvedMoveId:     string | null = null;
    let resolvedMoveNumber: string | null = null;
    if (rawMoveId) {
      const move = await resolveMove(String(rawMoveId));
      if (!move) {
        return res.status(422).json({
          success: false,
          error: { code: 'MOVE_NOT_FOUND', message: `Move '${rawMoveId}' not found.` },
        });
      }
      resolvedMoveId     = move.id;
      resolvedMoveNumber = move.moveNumber ?? null;
    }

    // ── Resolve actor driver ID (optional) ──────────────────────────────────
    let resolvedDriverId: string | null = null;
    if (actor?.id && actor?.type === 'driver') {
      resolvedDriverId = await resolveActorDriverId(String(actor.id));
      // Non-fatal if not found
    }

    // ── Map contract type → internal reason code ────────────────────────────
    const reasonCode = EXCEPTION_TYPE_TO_REASON[exceptionType]!;
    const now        = new Date();
    const reportedTs = reportedAt ? new Date(reportedAt) : now;

    // ── Insert exception record ─────────────────────────────────────────────
    const [exc] = await db
      .insert(v1Exceptions)
      .values({
        idempotencyKey:  idempotencyKey || undefined,
        apiKeyId:        req.v1ApiKey?.apiKeyId,
        orgId:           orgId ?? undefined,
        moveId:          resolvedMoveId   ?? undefined,
        driverId:        resolvedDriverId ?? undefined,
        reasonCode,
        description:     notes ?? `${exceptionType} exception recorded via API`,
        severity:        severity.toUpperCase(),
        status:          'OPEN',
        lat:             location?.latitude  != null ? String(location.latitude)  : undefined,
        lng:             location?.longitude != null ? String(location.longitude) : undefined,
        payload: {
          contractExceptionType: exceptionType,
          externalId:            resolvedMoveNumber,
          actor:                 actor  ?? null,
          location:              location ?? null,
          notes:                 notes  ?? null,
          reportedAt:            reportedTs.toISOString(),
        },
        reportedAt: reportedTs,
      })
      .returning({ id: v1Exceptions.id, createdAt: v1Exceptions.createdAt });

    await writeAuditLog(req, `exception.create.${exceptionType}`, exc.id, 201);

    // ── Webhook ─────────────────────────────────────────────────────────────
    dispatchWebhook(orgId ?? '', 'exception.opened', {
      exceptionId:   exc.id,
      moveId:        resolvedMoveId,
      externalId:    resolvedMoveNumber,
      exceptionType,
      reasonCode,
      severity,
      driverId:      resolvedDriverId,
      reportedAt:    reportedTs.toISOString(),
    }).catch((err: Error) =>
      console.error('[exceptions] webhook failed:', err.message),
    );

    return res.status(201).json({
      success: true,
      data: {
        exceptionId: exc.id,
        moveId:      resolvedMoveId,
        externalId:  resolvedMoveNumber,
        status:      'open',
        createdAt:   reportedTs.toISOString(),
      },
    });
  },
);

// ─── POST /api/v1/driver-status-events ───────────────────────────────────────
//
// Contract duty status values (lowercase) → internal DB values (uppercase).
// Both forms are accepted; the value is normalised to uppercase for storage.
const CONTRACT_DUTY_STATUSES: Record<string, string> = {
  available:   'AVAILABLE',
  assigned:    'ASSIGNED',
  in_progress: 'IN_PROGRESS',
  unavailable: 'UNAVAILABLE',
  off_shift:   'OFF_SHIFT',
};

/** Valid short reason codes stored in the payload alongside notes. */
const VALID_REASON_CODES = [
  'breakdown', 'traffic', 'weather', 'personal', 'mechanical', 'fuel',
  'end_of_shift', 'start_of_shift', 'lunch_break', 'other',
];

/**
 * Resolve a driverId that may be a UUID or a driver number.
 * Returns full driver details needed for the response and DB insert.
 */
async function resolveDriver(raw: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
  const [row] = await db
    .select({
      id:           drivers.id,
      driverNumber: drivers.driverNumber,
      firstName:    users.firstName,
      lastName:     users.lastName,
    })
    .from(drivers)
    .leftJoin(users, eq(drivers.userId, users.id))
    .where(
      and(
        isUuid ? eq(drivers.id, raw) : eq(drivers.driverNumber, raw),
        eq(drivers.isDeleted, false),
      ),
    )
    .limit(1);
  return row ?? null;
}

router.post(
  '/driver-status-events',
  requireScope('write:execution'),
  async (req: Request, res: Response) => {
    const idempotencyKey = (req.headers['x-idempotency-key'] as string) ?? '';
    const orgId          = req.v1ApiKey?.orgId ?? null;

    // ── Idempotency: look up existing record by unique key ──────────────────
    if (idempotencyKey) {
      const [existing] = await db
        .select({
          id:             v1DriverStatusEvents.id,
          driverId:       v1DriverStatusEvents.driverId,
          status:         v1DriverStatusEvents.status,
          previousStatus: v1DriverStatusEvents.previousStatus,
          eventTimestamp: v1DriverStatusEvents.eventTimestamp,
          payload:        v1DriverStatusEvents.payload,
        })
        .from(v1DriverStatusEvents)
        .where(eq(v1DriverStatusEvents.idempotencyKey, idempotencyKey))
        .limit(1);

      if (existing) {
        const p = existing.payload as any;
        return res.status(200).json({
          success: true,
          data: {
            eventId:        existing.id,
            driverId:       existing.driverId,
            externalId:     p?.externalId ?? null,
            driverName:     p?.driverName ?? null,
            status:         (existing.status ?? '').toLowerCase(),
            previousStatus: existing.previousStatus
              ? existing.previousStatus.toLowerCase()
              : null,
            recordedAt: existing.eventTimestamp
              ? new Date(existing.eventTimestamp).toISOString()
              : null,
          },
        });
      }
    }

    // ── Input validation ────────────────────────────────────────────────────
    const {
      driverId: rawDriverId,
      status:   rawStatus,
      effectiveAt,
      reason,
      notes,
    } = req.body ?? {};

    if (!rawDriverId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELD', message: '`driverId` is required.' },
      });
    }
    if (!rawStatus) {
      return res.status(400).json({
        success: false,
        error: {
          code:       'MISSING_FIELD',
          message:    '`status` is required.',
          validValues: Object.keys(CONTRACT_DUTY_STATUSES),
        },
      });
    }

    const normalizedStatus = String(rawStatus).toLowerCase();
    if (!CONTRACT_DUTY_STATUSES[normalizedStatus]) {
      return res.status(400).json({
        success: false,
        error: {
          code:       'INVALID_STATUS',
          message:    `'${rawStatus}' is not a valid driver status.`,
          validValues: Object.keys(CONTRACT_DUTY_STATUSES),
        },
      });
    }

    if (reason && !VALID_REASON_CODES.includes(String(reason).toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: {
          code:       'INVALID_REASON',
          message:    `'${reason}' is not a valid reason code.`,
          validValues: VALID_REASON_CODES,
        },
      });
    }

    const dbStatus = CONTRACT_DUTY_STATUSES[normalizedStatus]!;

    // ── Resolve driver ──────────────────────────────────────────────────────
    const driver = await resolveDriver(String(rawDriverId));
    if (!driver) {
      return res.status(422).json({
        success: false,
        error: { code: 'DRIVER_NOT_FOUND', message: `Driver '${rawDriverId}' not found.` },
      });
    }

    const externalId  = driver.driverNumber ? `DH-DR-${driver.driverNumber}` : null;
    const driverName  = [driver.firstName, driver.lastName].filter(Boolean).join(' ') || null;
    const effectiveTs = effectiveAt ? new Date(effectiveAt) : new Date();

    // ── Get previous status (latest event for this driver) ──────────────────
    const [lastEvent] = await db
      .select({ status: v1DriverStatusEvents.status })
      .from(v1DriverStatusEvents)
      .where(eq(v1DriverStatusEvents.driverId, driver.id))
      .orderBy(desc(v1DriverStatusEvents.createdAt))
      .limit(1);

    const previousDbStatus    = lastEvent?.status ?? null;
    const previousStatus      = previousDbStatus ? previousDbStatus.toLowerCase() : null;

    // ── Insert status event ─────────────────────────────────────────────────
    const [eventRecord] = await db
      .insert(v1DriverStatusEvents)
      .values({
        idempotencyKey:  idempotencyKey || undefined,
        apiKeyId:        req.v1ApiKey?.apiKeyId,
        orgId:           orgId ?? undefined,
        driverId:        driver.id,
        status:          dbStatus,
        previousStatus:  previousDbStatus ?? undefined,
        eventTimestamp:  effectiveTs,
        notes:           notes ?? undefined,
        payload: {
          externalId,
          driverName,
          reason:      reason ?? null,
          notes:       notes  ?? null,
          effectiveAt: effectiveTs.toISOString(),
          previousStatus,
        },
      })
      .returning({ id: v1DriverStatusEvents.id, eventTimestamp: v1DriverStatusEvents.eventTimestamp });

    await writeAuditLog(req, `driver_status.${normalizedStatus}`, eventRecord.id, 201);

    // ── Webhook ─────────────────────────────────────────────────────────────
    dispatchWebhook(orgId ?? '', 'driver.status_changed', {
      driverId:       driver.id,
      externalId,
      status:         normalizedStatus,
      previousStatus,
      reason:         reason ?? null,
      recordedAt:     effectiveTs.toISOString(),
    }).catch((err: Error) =>
      console.error('[driverStatus] webhook failed:', err.message),
    );

    return res.status(201).json({
      success: true,
      data: {
        eventId:        eventRecord.id,
        driverId:       driver.id,
        externalId,
        driverName,
        status:         normalizedStatus,
        previousStatus,
        recordedAt:     effectiveTs.toISOString(),
      },
    });
  },
);

export default router;


