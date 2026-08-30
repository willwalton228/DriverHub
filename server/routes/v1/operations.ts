/**
 * DriverConnect Integration API v1 — Operations Endpoints
 *
 * Moves & Bookings:
 *   GET  /api/v1/moves               — Active move list (read:moves)
 *   GET  /api/v1/moves/:id           — Move detail + assignment history
 *   POST /api/v1/bookings            — Create booking (write:moves)
 *   GET  /api/v1/bookings            — List bookings (read:moves)
 *   GET  /api/v1/bookings/:id        — Single booking (read:moves)
 *   PATCH /api/v1/bookings/:id/status — Update booking status (write:moves)
 *
 * Dispatch:
 *   POST /api/v1/dispatch/assign     — Assign driver to move (write:dispatch)
 *   POST /api/v1/dispatch/reassign   — Reassign driver (write:dispatch)
 *   GET  /api/v1/dispatch            — Assigned moves queue (read:moves)
 *   GET  /api/v1/dispatch/history/:move_id — Assignment history log (read:moves)
 *
 * Execution & Field Events:
 *   POST /api/v1/execution-events    — Trip execution state updates + driver action events (write:execution)
 *   GET  /api/v1/execution-events    — Event history with filters (read:execution)
 *   GET  /api/v1/execution-events/:move_id/history — Full event log for a move (read:execution)
 *   POST /api/v1/exceptions          — Field exceptions with reason codes (write:exceptions)
 *   GET  /api/v1/exceptions          — List exceptions (read:execution)
 *   POST /api/v1/driver-status-events — Driver duty status changes (write:execution)
 *   GET  /api/v1/driver-status-events — Driver status history (read:execution)
 *   POST /api/v1/time-events         — Clock in/out events (write:time)
 *   POST /api/v1/expense-events      — Driver expense submissions (write:expenses)
 *   GET  /api/v1/time-events         — List time events (read:time)
 *   GET  /api/v1/expense-events      — List expense events (read:expenses)
 */
import { Router, Request, Response } from 'express';
import { db } from '../../db';
import {
  trips, drivers, users, customers, expenses, timeClockEvents,
  moveOfferAudit, v1AuditLog, v1ExecutionEvents, v1IdempotencyKeys,
  v1Exceptions, v1DriverStatusEvents, workLocations,
} from '@shared/schema';
import { eq, and, sql, desc, asc, or, ilike, gte, lte, ne, notInArray, inArray } from 'drizzle-orm';
import { requireScope } from '../../middleware/v1ApiKeyAuth';
import { dispatchWebhook } from '../../services/webhookService';

const router = Router();

// ─── Constants ────────────────────────────────────────────────────────────────
const VALID_SERVICE_TYPES = [
  'DELIVERY', 'PICKUP', 'TRANSFER', 'RETURN',
  'SCHEDULED_ROUTE', 'ON_DEMAND', 'SHUTTLE', 'LAST_MILE',
] as const;

const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

// Execution state machine: valid forward transitions
const EXECUTION_STATE_MACHINE: Record<string, string[]> = {
  READY:                  ['EN_ROUTE_PICKUP', 'CANCELLED'],
  EN_ROUTE_PICKUP:        ['AT_PICKUP', 'CANCELLED'],
  AT_PICKUP:              ['EN_ROUTE_DESTINATION', 'CANCELLED'],
  EN_ROUTE_DESTINATION:   ['AT_DESTINATION', 'CANCELLED'],
  AT_DESTINATION:         ['COMPLETED', 'CANCELLED'],
  COMPLETED:              [],
  CANCELLED:              [],
};

// Driver action events — handled differently from state transitions
const DRIVER_ACTION_EVENTS = ['ACCEPTED', 'DECLINED', 'DELAYED', 'NO_SHOW'] as const;

const VALID_EXECUTION_STATES = [
  'READY', 'EN_ROUTE_PICKUP', 'AT_PICKUP',
  'EN_ROUTE_DESTINATION', 'AT_DESTINATION', 'COMPLETED', 'CANCELLED',
] as const;

const TERMINAL_EXECUTION_STATES = ['COMPLETED', 'CANCELLED'];

const EXCEPTION_REASON_CODES = [
  'VEHICLE_BREAKDOWN', 'TRAFFIC_DELAY', 'CUSTOMER_UNAVAILABLE', 'SAFETY_CONCERN',
  'WEATHER_HAZARD', 'ROUTE_BLOCKED', 'DRIVER_EMERGENCY', 'CARGO_DAMAGE',
  'ACCESS_DENIED', 'MECHANICAL_FAILURE', 'FUEL_ISSUE', 'ACCIDENT',
  'NAVIGATION_ERROR', 'CUSTOMER_DISPUTE', 'OTHER',
] as const;

const EXCEPTION_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const EXCEPTION_STATUSES   = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'ESCALATED'] as const;

const DRIVER_DUTY_STATUSES = [
  'AVAILABLE', 'ASSIGNED', 'IN_PROGRESS', 'UNAVAILABLE', 'OFF_SHIFT',
] as const;

// ─── Pagination helpers ───────────────────────────────────────────────────────
function parsePagination(query: Record<string, any>) {
  const page = Math.max(1, parseInt(query.page as string) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit as string) || 50));
  return { limit, offset: (page - 1) * limit, page };
}
function paginatedResponse(data: any[], total: number, page: number, limit: number) {
  return { success: true, data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
}

// ─── Move DTO ─────────────────────────────────────────────────────────────────
function toMoveDTO(row: any) {
  return {
    id: row.id,
    tripId: row.id,
    moveNumber: row.moveNumber,
    account: row.account ?? { id: row.customerId, name: null },
    driver: row.driver ?? (row.driverId ? { id: row.driverId, name: null } : null),
    serviceType: row.moveType,
    origin: {
      address: row.origin,
      lat: row.originLat ?? null,
      lng: row.originLng ?? null,
    },
    destination: {
      address: row.destination,
      lat: row.destinationLat ?? null,
      lng: row.destinationLng ?? null,
    },
    scheduledTime: row.tripDate,
    estimatedMinutes: row.estimatedMinutes ?? null,
    priority: row.priority ?? 'normal',
    status: row.status,
    assignmentState: row.assignmentState,
    executionState: row.executionState,
    vehicleType: row.vehicleType ?? null,
    distance: row.distance ?? null,
    billRate: row.billRate ?? null,
    payRate: row.payRate ?? null,
    payEstimateTotal: row.payEstimateTotal ?? null,
    payEstimateRateBasis: row.payEstimateRateBasis ?? null,
    customerInstructions: row.customerInstructions ?? null,
    notes: row.notes ?? null,
    ingestSource: row.ingestSource ?? null,
    offeredToDriverId: row.offeredToDriverId ?? null,
    offerExpiresAt: row.offerExpiresAt ?? null,
    acceptedAt: row.acceptedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? null,
  };
}

// ─── Validation helpers ───────────────────────────────────────────────────────
async function validateAccount(customerId: string): Promise<{ valid: boolean; error?: string; name?: string }> {
  if (!customerId) return { valid: false, error: 'account_id is required.' };
  const [acct] = await db
    .select({ id: customers.id, name: customers.customerName, status: customers.status })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  if (!acct) return { valid: false, error: `Account '${customerId}' not found.` };
  const statusLower = (acct.status ?? '').toLowerCase();
  if (statusLower !== 'active') {
    const label = statusLower || 'unknown';
    return { valid: false, error: `Account '${acct.name}' is ${label} and cannot accept new moves. Only active accounts are eligible.` };
  }
  return { valid: true, name: acct.name };
}

async function validateDriver(driverId: string): Promise<{ valid: boolean; error?: string; name?: string; driver?: any }> {
  if (!driverId) return { valid: false, error: 'driver_id is required.' };
  const [drv] = await db
    .select({
      id: drivers.id,
      userId: drivers.userId,
      driverNumber: drivers.driverNumber,
      isDeleted: drivers.isDeleted,
      status: drivers.status,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(drivers)
    .leftJoin(users, eq(drivers.userId, users.id))
    .where(eq(drivers.id, driverId))
    .limit(1);

  if (!drv) return { valid: false, error: `Driver '${driverId}' not found.` };
  const displayName = `${drv.firstName || ''} ${drv.lastName || ''}`.trim() || drv.driverNumber || driverId;
  if (drv.isDeleted) return { valid: false, error: `Driver '${displayName}' has been removed from the system.` };
  const driverStatus = (drv.status || '').toLowerCase();
  if (driverStatus && ['inactive', 'terminated', 'suspended'].includes(driverStatus)) {
    return { valid: false, error: `Driver '${displayName}' is ${drv.status} and cannot be assigned.` };
  }
  return { valid: true, name: displayName, driver: drv };
}

/**
 * Scheduling conflict check — returns true when the driver has an active assigned
 * move whose scheduled window overlaps with the requested tripDate ± estimatedMinutes.
 *
 * Overlap window: (tripDate - buffer) to (tripDate + estimatedMinutes + buffer)
 * Buffer: 30 minutes default, to account for travel/transition time.
 */
async function checkSchedulingConflict(
  driverId: string,
  tripDate: Date,
  estimatedMinutes = 90,
  excludeTripId?: string,
): Promise<{ conflict: boolean; conflictingMoveId?: string; conflictingMoveNumber?: string; scheduledTime?: Date }> {
  const bufferMs = 30 * 60 * 1000;
  const tripMs = estimatedMinutes * 60 * 1000;
  const windowStart = new Date(tripDate.getTime() - bufferMs);
  const windowEnd = new Date(tripDate.getTime() + tripMs + bufferMs);

  const baseConditions: any[] = [
    eq(trips.driverId, driverId),
    eq(trips.assignmentState, 'ASSIGNED'),
    sql`${trips.executionState} NOT IN ('COMPLETED', 'CANCELLED')`,
    sql`${trips.tripDate} BETWEEN ${windowStart.toISOString()}::timestamptz AND ${windowEnd.toISOString()}::timestamptz`,
  ];
  if (excludeTripId) {
    baseConditions.push(ne(trips.id, excludeTripId));
  }

  const [conflict] = await db
    .select({ id: trips.id, moveNumber: trips.moveNumber, tripDate: trips.tripDate })
    .from(trips)
    .where(and(...baseConditions))
    .limit(1);

  if (conflict) {
    return { conflict: true, conflictingMoveId: conflict.id, conflictingMoveNumber: conflict.moveNumber ?? undefined, scheduledTime: conflict.tripDate ?? undefined };
  }
  return { conflict: false };
}

// ─── Idempotency helpers ──────────────────────────────────────────────────────
async function checkIdempotency(key: string, orgId: string | null): Promise<{ cached: true; statusCode: number; response: any } | null> {
  if (!key) return null;
  const [row] = await db.select().from(v1IdempotencyKeys).where(eq(v1IdempotencyKeys.key, key)).limit(1);
  if (row?.response) return { cached: true, statusCode: row.statusCode || 200, response: row.response };
  return null;
}

async function saveIdempotency(key: string, orgId: string | null, statusCode: number, response: any) {
  if (!key) return;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(v1IdempotencyKeys)
    .values({ key, orgId, response, statusCode, expiresAt })
    .onConflictDoNothing();
}

// ─── Audit log helper ─────────────────────────────────────────────────────────
async function auditWrite(req: Request, action: string, resource: string, resourceId?: string, statusCode = 200) {
  const ctx = req.v1ApiKey;
  await db.insert(v1AuditLog).values({
    apiKeyId: ctx?.apiKeyId,
    keyName: ctx?.keyName,
    orgId: ctx?.orgId,
    action,
    resource,
    resourceId,
    requestBody: req.body as any,
    responseStatus: statusCode,
    idempotencyKey: req.headers['idempotency-key'] as string,
    ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
    userAgent: req.headers['user-agent'],
  }).catch(err => console.error('[v1 Audit] Failed:', err.message));
}

// ─── Assignment history logger ────────────────────────────────────────────────
async function logAssignment(moveId: string, eventType: string, driverId: string | null, oldState: string, newState: string, meta: Record<string, any>) {
  await db.insert(moveOfferAudit).values({
    moveId,
    eventType,
    driverId,
    oldState,
    newState,
    metadata: meta,
  }).catch(err => console.error('[v1 AssignLog] Failed:', err.message));
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOOKINGS — Create and manage trip bookings
// ═══════════════════════════════════════════════════════════════════════════════

// ─── POST /api/v1/bookings ────────────────────────────────────────────────────

// ─── POST /api/v1/bookings ───────────────────────────────────────────────────
// DriverConnect contract body (camelCase):
//   accountId, serviceType, scheduledTime, priority,
//   customer { firstName, lastName, phone, email },
//   vehicle  { year, make, model, vin, color },
//   origin   { name, address1, city, state, postalCode },
//   destination { name?, address1?, city?, state?, postalCode?, locationId? },
//   notes (string), driverId (optional)
//
// Legacy snake_case body still accepted for backward compatibility.
//
// Response (creation ack — minimal):
//   { id, externalId, status: "unassigned"|"assigned", createdAt }
router.post('/bookings', requireScope('write:moves'), async (req: Request, res: Response) => {
  const idemKey = req.headers['x-idempotency-key'] as string || req.headers['idempotency-key'] as string;
  const orgId = req.v1ApiKey?.orgId ?? null;

  if (idemKey) {
    const cached = await checkIdempotency(idemKey, orgId);
    if (cached) return res.status(cached.statusCode).json(cached.response);
  }

  try {
    // ── Parse body — accept both contract camelCase and legacy snake_case ──
    const body = req.body ?? {};

    // Contract camelCase
    const accountId       = body.accountId;
    const contractSvcType = body.serviceType;
    const scheduledTime   = body.scheduledTime;
    const contractPriority = body.priority;
    const customerObj     = body.customer   ?? {};
    const vehicleObj      = body.vehicle    ?? {};
    const originObj       = body.origin     ?? {};
    const destObj         = body.destination ?? {};
    const contractNotes   = body.notes;    // string
    const contractDriverId = body.driverId;

    // Legacy snake_case
    const legacy_account_id  = body.account_id || body.customer_id;
    const legacy_origin      = body.origin   && typeof body.origin   === 'string' ? body.origin   : null;
    const legacy_destination = body.destination && typeof body.destination === 'string' ? body.destination : null;
    const legacy_trip_date   = body.trip_date;
    const legacy_service_type = body.service_type || body.move_type;
    const legacy_driver_id   = body.driver_id;
    const legacy_vehicle_type = body.vehicle_type;
    const legacy_priority    = body.priority;    // shared key, taken from contractPriority first
    const legacy_notes       = body.notes && typeof body.notes === 'string' ? body.notes : null;
    const legacy_customer_instructions = body.customer_instructions;
    const bill_rate          = body.bill_rate;
    const pay_rate           = body.pay_rate;
    const estimated_minutes  = body.estimated_minutes;
    const origin_lat         = body.origin_lat;
    const origin_lng         = body.origin_lng;
    const destination_lat    = body.destination_lat;
    const destination_lng    = body.destination_lng;
    const pay_estimate_total = body.pay_estimate_total;
    const pay_estimate_rate_basis = body.pay_estimate_rate_basis;

    // ── Resolve unified values ─────────────────────────────────────────────
    const resolvedAccountId   = accountId   || legacy_account_id;
    const resolvedServiceType = contractSvcType || legacy_service_type;
    const resolvedDriverId    = contractDriverId || legacy_driver_id;
    const resolvedNotes       = typeof contractNotes === 'string' ? contractNotes
                               : typeof legacy_notes === 'string' ? legacy_notes
                               : null;

    // scheduledTime can be ISO-8601 string (contract) or trip_date (legacy)
    const resolvedTripDateStr = scheduledTime || legacy_trip_date;

    // ── Required field validation ──────────────────────────────────────────
    const missing: string[] = [];
    if (!resolvedAccountId)  missing.push('accountId');
    if (!resolvedTripDateStr) missing.push('scheduledTime');

    // At minimum we need either origin.address1 or legacy origin string
    const hasOrigin = (originObj && originObj.address1) || legacy_origin;
    if (!hasOrigin) missing.push('origin');

    // destination: locationId OR address1 OR legacy string
    const hasDestination = (destObj && (destObj.locationId || destObj.address1)) || legacy_destination;
    if (!hasDestination) missing.push('destination');

    if (missing.length) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: `Missing required fields: ${missing.join(', ')}.`,
        required: missing,
      });
    }

    // ── Date parse ────────────────────────────────────────────────────────
    const tripDateObj = new Date(resolvedTripDateStr);
    if (isNaN(tripDateObj.getTime())) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'scheduledTime must be a valid ISO 8601 date.' });
    }

    // ── Priority validation ────────────────────────────────────────────────
    const resolvedPriority = contractPriority || legacy_priority || 'normal';
    if (!VALID_PRIORITIES.includes(resolvedPriority as any)) {
      return res.status(400).json({
        error: 'INVALID_PRIORITY',
        message: `priority must be one of: ${VALID_PRIORITIES.join(', ')}.`,
        valid_values: VALID_PRIORITIES,
      });
    }

    // ── Account validation ─────────────────────────────────────────────────
    const acctResult = await validateAccount(resolvedAccountId);
    if (!acctResult.valid) {
      return res.status(422).json({ error: 'INVALID_ACCOUNT', message: acctResult.error });
    }

    // ── serviceType validation ─────────────────────────────────────────────
    if (resolvedServiceType) {
      const svcUpper = String(resolvedServiceType).toUpperCase();
      if (!(VALID_SERVICE_TYPES as readonly string[]).includes(svcUpper)) {
        return res.status(400).json({
          error: 'INVALID_SERVICE_TYPE',
          message: `'${resolvedServiceType}' is not a valid serviceType.`,
          validServiceTypes: [...VALID_SERVICE_TYPES].map(s => s.toLowerCase()),
        });
      }
    }

    // ── Resolve destination.locationId → work_locations ───────────────────
    let resolvedDestName:   string | null = destObj.name   ?? null;
    let resolvedDestAddr1:  string | null = destObj.address1 ?? null;
    let resolvedDestCity:   string | null = destObj.city   ?? null;
    let resolvedDestState:  string | null = destObj.state  ?? null;
    let resolvedDestPostal: string | null = destObj.postalCode ?? null;
    let resolvedDestLocId:  string | null = destObj.locationId ?? null;

    if (destObj.locationId) {
      const [loc] = await db
        .select({
          id:       workLocations.id,
          name:     workLocations.name,
          address:  workLocations.address,
          city:     workLocations.city,
          state:    workLocations.state,
        })
        .from(workLocations)
        .where(eq(workLocations.id, destObj.locationId))
        .limit(1);

      if (!loc) {
        return res.status(422).json({
          error: 'INVALID_LOCATION',
          message: `destination.locationId '${destObj.locationId}' not found.`,
        });
      }
      // Prefer explicitly provided fields; fall back to looked-up values
      resolvedDestName   = resolvedDestName   || loc.name   || null;
      resolvedDestAddr1  = resolvedDestAddr1  || loc.address || null;
      resolvedDestCity   = resolvedDestCity   || loc.city   || null;
      resolvedDestState  = resolvedDestState  || loc.state  || null;
    }

    // ── Build legacy flat strings for backward-compat columns ─────────────
    // origin flat string: prefer structured addr1, fall back to legacy
    const flatOrigin = originObj.address1
      ? [`${originObj.address1}`, originObj.city, originObj.state].filter(Boolean).join(', ')
      : (legacy_origin ?? '');
    // destination flat string
    const flatDest = resolvedDestAddr1
      ? [`${resolvedDestAddr1}`, resolvedDestCity, resolvedDestState].filter(Boolean).join(', ')
      : (legacy_destination ?? '');

    // ── Driver validation + conflict check ────────────────────────────────
    let driverName: string | null = null;
    if (resolvedDriverId) {
      const drvResult = await validateDriver(resolvedDriverId);
      if (!drvResult.valid) {
        return res.status(422).json({ error: 'INVALID_DRIVER', message: drvResult.error });
      }
      driverName = drvResult.name ?? null;

      const conflictResult = await checkSchedulingConflict(resolvedDriverId, tripDateObj, estimated_minutes);
      if (conflictResult.conflict) {
        return res.status(409).json({
          error: 'SCHEDULING_CONFLICT',
          message: "The driver already has an active assignment that overlaps with this trip's scheduled time.",
          conflicting_move_id: conflictResult.conflictingMoveId,
          conflicting_move_number: conflictResult.conflictingMoveNumber,
          conflicting_scheduled_time: conflictResult.scheduledTime,
        });
      }
    }

    // ── Generate move number ───────────────────────────────────────────────
    const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(trips);
    const moveNumber = `MV-${String(Number(countRow?.count || 0) + 1).padStart(6, '0')}`;

    // ── Insert move ────────────────────────────────────────────────────────
    const [newMove] = await db.insert(trips).values({
      moveNumber,
      customerId:  resolvedAccountId,
      driverId:    resolvedDriverId ?? null,
      // ── Legacy flat columns (backward compat) ───────────────────────────
      origin:      flatOrigin || 'N/A',
      destination: flatDest   || 'N/A',
      // ── Contract structured columns ─────────────────────────────────────
      originName:       (originObj.name       ?? null) || null,
      originAddress1:   (originObj.address1   ?? null) || null,
      originCity:       (originObj.city       ?? null) || null,
      originState:      (originObj.state      ?? null) || null,
      originPostalCode: (originObj.postalCode ?? null) || null,
      originLat:        origin_lat ?? null,
      originLng:        origin_lng ?? null,
      destinationName:        resolvedDestName   || null,
      destinationAddress1:    resolvedDestAddr1  || null,
      destinationCity:        resolvedDestCity   || null,
      destinationState:       resolvedDestState  || null,
      destinationPostalCode:  resolvedDestPostal || null,
      destinationLocationId:  resolvedDestLocId  || null,
      destinationLat:         destination_lat ?? null,
      destinationLng:         destination_lng ?? null,
      // ── Customer contact ─────────────────────────────────────────────────
      customerFirstName: (customerObj.firstName ?? null) || null,
      customerLastName:  (customerObj.lastName  ?? null) || null,
      customerPhone:     (customerObj.phone     ?? null) || null,
      customerEmail:     (customerObj.email     ?? null) || null,
      // ── Vehicle ──────────────────────────────────────────────────────────
      vehicleYear:  customerObj.year  ?? vehicleObj.year  ?? null,  // accept on either obj (typo guard)
      vehicleMake:  vehicleObj.make   ?? null,
      vehicleModel: vehicleObj.model  ?? null,
      vehicleVin:   vehicleObj.vin    ?? null,
      vehicleColor: vehicleObj.color  ?? null,
      vehicleType:  legacy_vehicle_type ?? null,
      // ── Service / dispatch ───────────────────────────────────────────────
      // Service types (for example DELIVERY or PICKUP) are not Move Types.
      // Only DriverShift and DriverDash may be persisted to trips.move_type.
      priority:   resolvedPriority,
      tripDate:   tripDateObj,
      notes:      resolvedNotes,
      customerInstructions: legacy_customer_instructions ?? null,
      // ── Financial ────────────────────────────────────────────────────────
      billRate:             bill_rate              ?? null,
      payRate:              pay_rate               ?? null,
      estimatedMinutes:     estimated_minutes      ?? null,
      payEstimateTotal:     pay_estimate_total     ?? null,
      payEstimateRateBasis: pay_estimate_rate_basis ?? null,
      // ── State machine ────────────────────────────────────────────────────
      assignmentState: resolvedDriverId ? 'ASSIGNED' : 'UNASSIGNED',
      executionState:  'READY',
      status:          resolvedDriverId ? 'assigned' : 'unassigned',
      ingestSource:    'API_V1',
      ingestedAt:      new Date(),
    }).returning();

    // ── Log assignment audit record ───────────────────────────────────────
    if (resolvedDriverId) {
      await logAssignment(newMove.id, 'ASSIGNED', resolvedDriverId, 'UNASSIGNED', 'ASSIGNED', {
        source: 'API_V1_BOOKING_CREATE',
        api_key: req.v1ApiKey?.keyName,
      });
    }

    // ── Contract response (minimal creation ack) ───────────────────────────
    const contractStatus = resolvedDriverId ? 'assigned' : 'unassigned';

    const response = {
      success: true,
      data: {
        id:         newMove.id,
        externalId: newMove.moveNumber,
        status:     contractStatus,
        createdAt:  newMove.createdAt ? new Date(newMove.createdAt).toISOString() : null,
      },
    };

    await auditWrite(req, 'CREATE', 'move', newMove.id, 201);
    await saveIdempotency(idemKey, orgId, 201, response);

    if (orgId) {
      dispatchWebhook(orgId, 'move.created', {
        move_id:    newMove.id,
        move_number: moveNumber,
        account_id: resolvedAccountId,
      }).catch(() => {});
    }

    return res.status(201).json(response);
  } catch (err: any) {
    console.error('[v1] POST /bookings error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to create booking.' });
  }
});


// ─── GET /api/v1/bookings ─────────────────────────────────────────────────────
router.get('/bookings', requireScope('read:moves'), async (req: Request, res: Response) => {
  try {
    const { limit, offset, page } = parsePagination(req.query);
    const { status, assignment_state, execution_state, driver_id, customer_id, account_id, from_date, to_date, priority } = req.query as Record<string, string>;
    const conditions: any[] = [];
    if (status) conditions.push(eq(trips.status, status));
    if (assignment_state) conditions.push(eq(trips.assignmentState, assignment_state));
    if (execution_state) conditions.push(eq(trips.executionState, execution_state));
    if (driver_id) conditions.push(eq(trips.driverId, driver_id));
    if (customer_id || account_id) conditions.push(eq(trips.customerId, (customer_id || account_id)!));
    if (priority) conditions.push(eq(trips.priority, priority));
    if (from_date) conditions.push(sql`${trips.tripDate} >= ${from_date}::timestamp`);
    if (to_date) conditions.push(sql`${trips.tripDate} <= ${to_date}::timestamp`);
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [rows, countRes] = await Promise.all([
      db.select({
        id: trips.id,
        moveNumber: trips.moveNumber,
        driverId: trips.driverId,
        customerId: trips.customerId,
        tripDate: trips.tripDate,
        origin: trips.origin,
        destination: trips.destination,
        distance: trips.distance,
        status: trips.status,
        priority: trips.priority,
        assignmentState: trips.assignmentState,
        executionState: trips.executionState,
        moveType: trips.moveType,
        vehicleType: trips.vehicleType,
        billRate: trips.billRate,
        estimatedMinutes: trips.estimatedMinutes,
        notes: trips.notes,
        createdAt: trips.createdAt,
      }).from(trips).where(whereClause).orderBy(desc(trips.tripDate)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(trips).where(whereClause),
    ]);

    return res.json(paginatedResponse(rows, Number(countRes[0]?.count || 0), page, limit));
  } catch (err: any) {
    console.error('[v1] GET /bookings error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch bookings.' });
  }
});

// ─── GET /api/v1/bookings/:id ─────────────────────────────────────────────────
router.get('/bookings/:id', requireScope('read:moves'), async (req: Request, res: Response) => {
  try {
    const [row] = await db.select({
      id: trips.id,
      moveNumber: trips.moveNumber,
      driverId: trips.driverId,
      customerId: trips.customerId,
      tripDate: trips.tripDate,
      origin: trips.origin,
      destination: trips.destination,
      originLat: trips.originLat,
      originLng: trips.originLng,
      destinationLat: trips.destinationLat,
      destinationLng: trips.destinationLng,
      distance: trips.distance,
      status: trips.status,
      priority: trips.priority,
      assignmentState: trips.assignmentState,
      executionState: trips.executionState,
      moveType: trips.moveType,
      vehicleType: trips.vehicleType,
      billRate: trips.billRate,
      payRate: trips.payRate,
      payEstimateTotal: trips.payEstimateTotal,
      payEstimateRateBasis: trips.payEstimateRateBasis,
      estimatedMinutes: trips.estimatedMinutes,
      notes: trips.notes,
      customerInstructions: trips.customerInstructions,
      ingestSource: trips.ingestSource,
      offeredToDriverId: trips.offeredToDriverId,
      offerExpiresAt: trips.offerExpiresAt,
      acceptedAt: trips.acceptedAt,
      createdAt: trips.createdAt,
    }).from(trips).where(eq(trips.id, req.params.id)).limit(1);

    if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'Booking not found.' });
    return res.json({ success: true, data: row });
  } catch (err: any) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch booking.' });
  }
});

// ─── PATCH /api/v1/bookings/:id/status ───────────────────────────────────────
router.patch('/bookings/:id/status', requireScope('write:moves'), async (req: Request, res: Response) => {
  try {
    const { status, execution_state, assignment_state } = req.body;
    const updateFields: Record<string, any> = {};
    if (status) updateFields.status = status;
    if (execution_state) {
      if (!VALID_EXECUTION_STATES.includes(execution_state)) {
        return res.status(400).json({ error: 'INVALID_STATE', message: `execution_state must be one of: ${VALID_EXECUTION_STATES.join(', ')}.` });
      }
      updateFields.executionState = execution_state;
    }
    if (assignment_state) updateFields.assignmentState = assignment_state;
    if (!Object.keys(updateFields).length) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'At least one of status, execution_state, or assignment_state is required.' });
    }
    const [updated] = await db
      .update(trips)
      .set(updateFields)
      .where(eq(trips.id, req.params.id))
      .returning({ id: trips.id, status: trips.status, executionState: trips.executionState, assignmentState: trips.assignmentState, priority: trips.priority });
    if (!updated) return res.status(404).json({ error: 'NOT_FOUND', message: 'Booking not found.' });
    await auditWrite(req, 'UPDATE', 'booking', req.params.id);
    // Dispatch move.updated for any status/state transition
    const orgId = req.v1ApiKey?.orgId ?? null;
    if (orgId) {
      dispatchWebhook(orgId, 'move.updated', {
        move_id: req.params.id,
        status: updated.status,
        execution_state: updated.executionState,
        assignment_state: updated.assignmentState,
      }).catch(() => {});
    }
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to update booking status.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DISPATCH — Assign and manage driver-to-move assignments
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/v1/dispatch ─────────────────────────────────────────────────────
router.get('/dispatch', requireScope('read:moves'), async (req: Request, res: Response) => {
  try {
    const { limit, offset, page } = parsePagination(req.query);
    const { assignment_state, execution_state, driver_id, priority } = req.query as Record<string, string>;
    const conditions: any[] = [];
    if (assignment_state) conditions.push(eq(trips.assignmentState, assignment_state));
    else conditions.push(sql`${trips.assignmentState} NOT IN ('UNASSIGNED', 'CANCELLED')`);
    if (execution_state) conditions.push(eq(trips.executionState, execution_state));
    if (driver_id) conditions.push(eq(trips.driverId, driver_id));
    if (priority) conditions.push(eq(trips.priority, priority));
    const whereClause = and(...conditions);

    const [rows, countRes] = await Promise.all([
      db.select({
        id: trips.id,
        moveNumber: trips.moveNumber,
        driverId: trips.driverId,
        customerId: trips.customerId,
        offeredToDriverId: trips.offeredToDriverId,
        tripDate: trips.tripDate,
        origin: trips.origin,
        destination: trips.destination,
        priority: trips.priority,
        assignmentState: trips.assignmentState,
        executionState: trips.executionState,
        status: trips.status,
        estimatedMinutes: trips.estimatedMinutes,
      }).from(trips).where(whereClause).orderBy(asc(trips.tripDate)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(trips).where(whereClause),
    ]);

    return res.json(paginatedResponse(rows, Number(countRes[0]?.count || 0), page, limit));
  } catch (err: any) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch dispatch assignments.' });
  }
});

// ─── GET /api/v1/dispatch/history/:move_id ────────────────────────────────────
router.get('/dispatch/history/:move_id', requireScope('read:moves'), async (req: Request, res: Response) => {
  try {
    const { move_id } = req.params;

    // Verify move exists
    const [move] = await db.select({ id: trips.id, moveNumber: trips.moveNumber }).from(trips).where(eq(trips.id, move_id)).limit(1);
    if (!move) return res.status(404).json({ error: 'NOT_FOUND', message: 'Move not found.' });

    const history = await db
      .select()
      .from(moveOfferAudit)
      .where(eq(moveOfferAudit.moveId, move_id))
      .orderBy(desc(moveOfferAudit.createdAt));

    return res.json({
      success: true,
      move_id,
      move_number: move.moveNumber,
      data: history.map(h => ({
        id: h.id,
        eventType: h.eventType,
        driverId: h.driverId,
        oldState: h.oldState,
        newState: h.newState,
        reasonCode: h.reasonCode,
        note: h.note,
        metadata: h.metadata,
        createdAt: h.createdAt,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch assignment history.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTION EVENTS — Trip status progression
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/v1/execution-events/:move_id/history ────────────────────────────
router.get('/execution-events/:move_id/history', requireScope('read:execution'), async (req: Request, res: Response) => {
  try {
    const { move_id } = req.params;
    const [move] = await db.select({ id: trips.id, moveNumber: trips.moveNumber })
      .from(trips).where(eq(trips.id, move_id)).limit(1);
    if (!move) return res.status(404).json({ error: 'NOT_FOUND', message: 'Move not found.' });

    const events = await db
      .select({
        id: v1ExecutionEvents.id,
        eventType: v1ExecutionEvents.eventType,
        driverId: v1ExecutionEvents.driverId,
        lat: v1ExecutionEvents.lat,
        lng: v1ExecutionEvents.lng,
        payload: v1ExecutionEvents.payload,
        recordedAt: v1ExecutionEvents.createdAt,
      })
      .from(v1ExecutionEvents)
      .where(eq(v1ExecutionEvents.moveId, move_id))
      .orderBy(asc(v1ExecutionEvents.createdAt));

    return res.json({
      success: true,
      move_id,
      move_number: move.moveNumber,
      data: events,
      meta: { total: events.length },
    });
  } catch (err: any) {
    console.error('[v1] GET /execution-events/:move_id/history error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch event history.' });
  }
});

// ─── POST /api/v1/time-events ─────────────────────────────────────────────────
router.post('/time-events', requireScope('write:time'), async (req: Request, res: Response) => {
  const idemKey = req.headers['idempotency-key'] as string;
  const orgId = req.v1ApiKey?.orgId ?? null;

  if (idemKey) {
    const cached = await checkIdempotency(idemKey, orgId);
    if (cached) return res.status(cached.statusCode).json(cached.response);
  }

  try {
    const { driver_id, user_id, event_type, timestamp: eventTs, lat, lng, location_id, shift_id, notes } = req.body;
    if (!event_type || !eventTs) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'event_type and timestamp are required.' });
    }

    const validTimeEvents = ['CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END'];
    if (!validTimeEvents.includes(event_type)) {
      return res.status(400).json({ error: 'INVALID_EVENT_TYPE', message: `event_type must be one of: ${validTimeEvents.join(', ')}` });
    }

    let resolvedUserId = user_id;
    if (!resolvedUserId && driver_id) {
      const [drv] = await db.select({ userId: drivers.userId }).from(drivers).where(eq(drivers.id, driver_id)).limit(1);
      resolvedUserId = drv?.userId;
    }
    if (!resolvedUserId) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'user_id is required (or driver_id must map to a user).' });
    }

    const [clockEvent] = await db.insert(timeClockEvents).values({
      userId: resolvedUserId,
      eventType: event_type,
      eventTime: new Date(eventTs),
      latitude: lat?.toString(),
      longitude: lng?.toString(),
      locationId: location_id,
      shiftId: shift_id,
      notes,
    }).returning({ id: timeClockEvents.id });

    const response = { success: true, event_id: clockEvent.id, event_type, timestamp: eventTs };
    await auditWrite(req, 'CREATE', 'time_event', clockEvent.id, 201);
    await saveIdempotency(idemKey, orgId, 201, response);

    if (orgId) {
      dispatchWebhook(orgId, 'time_event.created' as any, { event_id: clockEvent.id, driver_id, event_type }).catch(() => {});
    }

    return res.status(201).json(response);
  } catch (err: any) {
    console.error('[v1] POST /time-events error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to record time event.' });
  }
});

// ─── POST /api/v1/expense-events ──────────────────────────────────────────────
router.post('/expense-events', requireScope('write:expenses'), async (req: Request, res: Response) => {
  const idemKey = req.headers['idempotency-key'] as string;
  const orgId = req.v1ApiKey?.orgId ?? null;

  if (idemKey) {
    const cached = await checkIdempotency(idemKey, orgId);
    if (cached) return res.status(cached.statusCode).json(cached.response);
  }

  try {
    const { driver_id, amount, category, description, move_id, trip_id, date: expenseDate, receipt_url, notes } = req.body;

    if (!amount || !category || !description) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'amount, category, and description are required.' });
    }

    let submittedByUserId = null;
    if (driver_id) {
      const [drv] = await db.select({ userId: drivers.userId }).from(drivers).where(eq(drivers.id, driver_id)).limit(1);
      submittedByUserId = drv?.userId;
    }
    if (!submittedByUserId) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'driver_id is required and must map to a registered user.' });
    }

    const [expense] = await db.insert(expenses).values({
      expenseType: 'driver',
      submittedBy: submittedByUserId,
      driverId: driver_id,
      amount: amount.toString(),
      category,
      description,
      tripId: move_id || trip_id,
      expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
      receiptUrl: receipt_url,
      notes,
      status: 'pending',
    }).returning({ id: expenses.id });

    const response = { success: true, expense_id: expense.id, driver_id, amount, category };
    await auditWrite(req, 'CREATE', 'expense', expense.id, 201);
    await saveIdempotency(idemKey, orgId, 201, response);

    if (orgId) {
      dispatchWebhook(orgId, 'expense.created' as any, { expense_id: expense.id, driver_id, amount, category }).catch(() => {});
    }

    return res.status(201).json(response);
  } catch (err: any) {
    console.error('[v1] POST /expense-events error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to record expense.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// READ ENDPOINTS — Execution Events, Exceptions, Time, Expenses
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/v1/execution-events ─────────────────────────────────────────────
router.get('/execution-events', requireScope('read:execution'), async (req: Request, res: Response) => {
  try {
    const { limit, offset, page } = parsePagination(req.query);
    const { move_id, driver_id, event_type, from_date, to_date } = req.query as Record<string, string>;
    const conditions: any[] = [];
    if (move_id) conditions.push(eq(v1ExecutionEvents.moveId, move_id));
    if (driver_id) conditions.push(eq(v1ExecutionEvents.driverId, driver_id));
    if (event_type) conditions.push(eq(v1ExecutionEvents.eventType, event_type));
    if (from_date) conditions.push(gte(v1ExecutionEvents.createdAt, new Date(from_date)));
    if (to_date) conditions.push(lte(v1ExecutionEvents.createdAt, new Date(to_date)));
    const whereClause = conditions.length ? and(...conditions) : undefined;
    const [rows, countRes] = await Promise.all([
      db.select({
        id: v1ExecutionEvents.id,
        moveId: v1ExecutionEvents.moveId,
        driverId: v1ExecutionEvents.driverId,
        eventType: v1ExecutionEvents.eventType,
        lat: v1ExecutionEvents.lat,
        lng: v1ExecutionEvents.lng,
        payload: v1ExecutionEvents.payload,
        recordedAt: v1ExecutionEvents.createdAt,
      }).from(v1ExecutionEvents).where(whereClause).orderBy(desc(v1ExecutionEvents.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(v1ExecutionEvents).where(whereClause),
    ]);
    return res.json(paginatedResponse(rows, Number(countRes[0]?.count || 0), page, limit));
  } catch (err: any) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch execution events.' });
  }
});

// ─── GET /api/v1/exceptions ────────────────────────────────────────────────────
router.get('/exceptions', requireScope('read:execution'), async (req: Request, res: Response) => {
  try {
    const { limit, offset, page } = parsePagination(req.query);
    const { move_id, driver_id, status, severity, reason_code } = req.query as Record<string, string>;
    const conditions: any[] = [];
    if (move_id)      conditions.push(eq(v1Exceptions.moveId, move_id));
    if (driver_id)    conditions.push(eq(v1Exceptions.driverId, driver_id));
    if (status)       conditions.push(eq(v1Exceptions.status, status));
    if (severity)     conditions.push(eq(v1Exceptions.severity, severity));
    if (reason_code)  conditions.push(eq(v1Exceptions.reasonCode, reason_code));
    const whereClause = conditions.length ? and(...conditions) : undefined;
    const [rows, countRes] = await Promise.all([
      db.select({
        id: v1Exceptions.id,
        moveId: v1Exceptions.moveId,
        driverId: v1Exceptions.driverId,
        reasonCode: v1Exceptions.reasonCode,
        description: v1Exceptions.description,
        severity: v1Exceptions.severity,
        status: v1Exceptions.status,
        lat: v1Exceptions.lat,
        lng: v1Exceptions.lng,
        reportedAt: v1Exceptions.reportedAt,
        resolvedAt: v1Exceptions.resolvedAt,
      }).from(v1Exceptions).where(whereClause).orderBy(desc(v1Exceptions.reportedAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(v1Exceptions).where(whereClause),
    ]);
    return res.json(paginatedResponse(rows, Number(countRes[0]?.count || 0), page, limit));
  } catch (err: any) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch exceptions.' });
  }
});

// ─── GET /api/v1/driver-status-events ─────────────────────────────────────────
router.get('/driver-status-events', requireScope('read:execution'), async (req: Request, res: Response) => {
  try {
    const { limit, offset, page } = parsePagination(req.query);
    const { driver_id, status, from_date, to_date } = req.query as Record<string, string>;
    const conditions: any[] = [];
    if (driver_id) conditions.push(eq(v1DriverStatusEvents.driverId, driver_id));
    if (status)    conditions.push(eq(v1DriverStatusEvents.status, status));
    if (from_date) conditions.push(gte(v1DriverStatusEvents.eventTimestamp, new Date(from_date)));
    if (to_date)   conditions.push(lte(v1DriverStatusEvents.eventTimestamp, new Date(to_date)));
    const whereClause = conditions.length ? and(...conditions) : undefined;
    const [rows, countRes] = await Promise.all([
      db.select({
        id: v1DriverStatusEvents.id,
        driverId: v1DriverStatusEvents.driverId,
        status: v1DriverStatusEvents.status,
        previousStatus: v1DriverStatusEvents.previousStatus,
        eventTimestamp: v1DriverStatusEvents.eventTimestamp,
        lat: v1DriverStatusEvents.lat,
        lng: v1DriverStatusEvents.lng,
        notes: v1DriverStatusEvents.notes,
        recordedAt: v1DriverStatusEvents.createdAt,
      }).from(v1DriverStatusEvents).where(whereClause).orderBy(desc(v1DriverStatusEvents.eventTimestamp)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(v1DriverStatusEvents).where(whereClause),
    ]);
    return res.json(paginatedResponse(rows, Number(countRes[0]?.count || 0), page, limit));
  } catch (err: any) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch driver status events.' });
  }
});

router.get('/time-events', requireScope('read:time'), async (req: Request, res: Response) => {
  try {
    const { limit, offset, page } = parsePagination(req.query);
    const { from_date, to_date, event_type, location_id } = req.query as Record<string, string>;
    const conditions: any[] = [];
    if (from_date) conditions.push(sql`${timeClockEvents.eventTime} >= ${from_date}::timestamp`);
    if (to_date) conditions.push(sql`${timeClockEvents.eventTime} <= ${to_date}::timestamp`);
    if (event_type) conditions.push(eq(timeClockEvents.eventType, event_type));
    if (location_id) conditions.push(eq(timeClockEvents.locationId, location_id));
    const whereClause = conditions.length ? and(...conditions) : undefined;
    const [rows, countRes] = await Promise.all([
      db.select({
        id: timeClockEvents.id,
        userId: timeClockEvents.userId,
        locationId: timeClockEvents.locationId,
        shiftId: timeClockEvents.shiftId,
        eventType: timeClockEvents.eventType,
        eventTime: timeClockEvents.eventTime,
        latitude: timeClockEvents.latitude,
        longitude: timeClockEvents.longitude,
        isWithinGeofence: timeClockEvents.isWithinGeofence,
        overtimeFlag: timeClockEvents.overtimeFlag,
        longShiftFlag: timeClockEvents.longShiftFlag,
        notes: timeClockEvents.notes,
        createdAt: timeClockEvents.createdAt,
      }).from(timeClockEvents).where(whereClause).orderBy(desc(timeClockEvents.eventTime)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(timeClockEvents).where(whereClause),
    ]);
    return res.json(paginatedResponse(rows, Number(countRes[0]?.count || 0), page, limit));
  } catch (err: any) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch time events.' });
  }
});

router.get('/expense-events', requireScope('read:expenses'), async (req: Request, res: Response) => {
  try {
    const { limit, offset, page } = parsePagination(req.query);
    const { status, from_date, to_date, driver_id } = req.query as Record<string, string>;
    const conditions: any[] = [];
    if (status) conditions.push(eq(expenses.status, status));
    if (driver_id) conditions.push(eq(expenses.driverId, driver_id));
    if (from_date) conditions.push(sql`${expenses.expenseDate} >= ${from_date}::date`);
    if (to_date) conditions.push(sql`${expenses.expenseDate} <= ${to_date}::date`);
    const whereClause = conditions.length ? and(...conditions) : undefined;
    const [rows, countRes] = await Promise.all([
      db.select({
        id: expenses.id,
        driverId: expenses.driverId,
        category: expenses.category,
        amount: expenses.amount,
        expenseDate: expenses.expenseDate,
        description: expenses.description,
        status: expenses.status,
        receiptUrl: expenses.receiptUrl,
        createdAt: expenses.createdAt,
      }).from(expenses).where(whereClause).orderBy(desc(expenses.expenseDate)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(expenses).where(whereClause),
    ]);
    return res.json(paginatedResponse(rows, Number(countRes[0]?.count || 0), page, limit));
  } catch (err: any) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch expense events.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MOVES — Full trip read layer with account/driver name enrichment
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/v1/moves ───────────────────────────────────────────────────────
// DriverConnect contract params (camelCase):
//   page, pageSize, status, date, driverId, accountId, serviceType,
//   priority, updatedAfter
// Legacy snake_case params accepted silently for backward compat:
//   driver_id, customer_id, assignment_state, execution_state,
//   from_date, to_date, search, service_type
//
// DTO shape:
//   id, externalId, account{id,name}, serviceType, priority, status,
//   scheduledTime (ISO-8601), origin{name,address1,city,state},
//   destination{name,address1,city,state}, assignedDriver{id,name}|null,
//   readinessStatus, notesIndicator, exceptionFlag, updatedAt
router.get('/moves', requireScope('read:moves'), async (req: Request, res: Response) => {
  try {
    const { limit, offset, page } = parsePagination(req.query);
    const {
      // ── Contract camelCase ───────────────────────────────────────────
      status, priority,
      date, driverId, accountId, serviceType, updatedAfter,
      // ── Legacy snake_case aliases ────────────────────────────────────
      driver_id, customer_id, assignment_state, execution_state,
      from_date, to_date, search, service_type,
    } = req.query as Record<string, string>;

    const conditions: any[] = [
      // Exclude soft-deleted rows
    ];

    // ── Contract filters ─────────────────────────────────────────────────
    // status is a derived contract value — map back to DB columns
    if (status) {
      switch (status) {
        case 'unassigned':
          conditions.push(eq(trips.assignmentState, 'UNASSIGNED'));
          break;
        case 'assigned':
          conditions.push(and(eq(trips.assignmentState, 'ASSIGNED'), eq(trips.executionState, 'READY'))!);
          break;
        case 'accepted':
        case 'en_route':
        case 'arrived':
        case 'delayed':
          conditions.push(eq(trips.status, status));
          break;
        case 'in_progress':
          conditions.push(and(
            ne(trips.executionState, 'READY'),
            ne(trips.executionState, 'COMPLETED'),
            ne(trips.executionState, 'CANCELLED'),
          )!);
          break;
        case 'completed':
          conditions.push(or(eq(trips.status, 'completed'), eq(trips.executionState, 'COMPLETED'))!);
          break;
        case 'cancelled':
          conditions.push(or(eq(trips.status, 'cancelled'), eq(trips.executionState, 'CANCELLED'))!);
          break;
        case 'exception':
          conditions.push(eq(trips.status, 'exception'));
          break;
        default:
          // Unknown contract status — fall back to raw DB match
          conditions.push(eq(trips.status, status));
      }
    }
    if (priority)     conditions.push(eq(trips.priority, priority));
    if (driverId)     conditions.push(eq(trips.driverId, driverId));
    if (accountId)    conditions.push(eq(trips.customerId, accountId));
    if (serviceType)  conditions.push(ilike(trips.moveType, serviceType));
    if (date) {
      // Exact calendar day — cast trip_date to date for comparison
      conditions.push(sql`date(trips.trip_date) = ${date}::date`);
    }
    if (updatedAfter) conditions.push(gte(trips.updatedAt, new Date(updatedAfter)));

    // ── Legacy filters ───────────────────────────────────────────────────
    if (driver_id)        conditions.push(eq(trips.driverId, driver_id));
    if (customer_id)      conditions.push(eq(trips.customerId, customer_id));
    if (assignment_state) conditions.push(eq(trips.assignmentState, assignment_state));
    if (execution_state)  conditions.push(eq(trips.executionState, execution_state));
    if (service_type)     conditions.push(ilike(trips.moveType, service_type));
    if (from_date)        conditions.push(gte(trips.tripDate, new Date(from_date)));
    if (to_date)          conditions.push(lte(trips.tripDate, new Date(to_date)));
    if (search) {
      conditions.push(or(
        ilike(trips.moveNumber, `%${search}%`),
        ilike(trips.origin,     `%${search}%`),
        ilike(trips.destination,`%${search}%`),
      ));
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;

    // ── Fetch rows + total count ─────────────────────────────────────────
    const [rows, countRes] = await Promise.all([
      db.select({
        id:              trips.id,
        moveNumber:      trips.moveNumber,
        driverId:        trips.driverId,
        customerId:      trips.customerId,
        tripDate:        trips.tripDate,
        origin:          trips.origin,
        destination:     trips.destination,
        status:          trips.status,
        priority:        trips.priority,
        moveType:        trips.moveType,
        assignmentState: trips.assignmentState,
        executionState:  trips.executionState,
        notes:           trips.notes,
        updatedAt:       trips.updatedAt,
        // ── Structured origin/destination (spec Section 7) ───────────────
        originName:             trips.originName,
        originAddress1:         trips.originAddress1,
        originCity:             trips.originCity,
        originState:            trips.originState,
        originPostalCode:       trips.originPostalCode,
        destinationName:        trips.destinationName,
        destinationAddress1:    trips.destinationAddress1,
        destinationCity:        trips.destinationCity,
        destinationState:       trips.destinationState,
        destinationPostalCode:  trips.destinationPostalCode,
        destinationLocationId:  trips.destinationLocationId,
        // ── Customer data (spec Section 7) ─────────────────────────────
        customerFirstName: trips.customerFirstName,
        customerLastName:  trips.customerLastName,
        customerPhone:     trips.customerPhone,
        // ── Vehicle data (spec Section 7) ──────────────────────────────
        vehicleYear:  trips.vehicleYear,
        vehicleMake:  trips.vehicleMake,
        vehicleModel: trips.vehicleModel,
        vehicleVin:   trips.vehicleVin,
        vehicleColor: trips.vehicleColor,
      })
        .from(trips)
        .where(whereClause)
        .orderBy(desc(trips.updatedAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(trips).where(whereClause),
    ]);

    // ── Batch-enrich: account names, driver names, exception flags ────────
    const accountIds = [...new Set(rows.map(r => r.customerId).filter(Boolean))] as string[];
    const driverIds  = [...new Set(rows.map(r => r.driverId).filter(Boolean))]  as string[];
    const moveIds    = rows.map(r => r.id);

    const [accounts, driverRows, openExceptions] = await Promise.all([
      accountIds.length
        ? db.select({ id: customers.id, name: customers.customerName })
            .from(customers).where(inArray(customers.id, accountIds))
        : Promise.resolve([]),
      driverIds.length
        ? db.select({ id: drivers.id, firstName: users.firstName, lastName: users.lastName })
            .from(drivers)
            .leftJoin(users, eq(drivers.userId, users.id))
            .where(inArray(drivers.id, driverIds))
        : Promise.resolve([]),
      moveIds.length
        ? db.select({ moveId: v1Exceptions.moveId })
            .from(v1Exceptions)
            .where(and(
              inArray(v1Exceptions.moveId, moveIds),
              eq(v1Exceptions.status, 'OPEN'),
            ))
        : Promise.resolve([]),
    ]);

    const accountMap  = Object.fromEntries(accounts.map(a => [a.id, a.name]));
    const driverMap   = Object.fromEntries(
      driverRows.map(d => [d.id, [d.firstName, d.lastName].filter(Boolean).join(' ')])
    );
    const excMoveSet  = new Set(openExceptions.map(e => e.moveId).filter(Boolean));

    // ── Derive contract status from DB state ─────────────────────────────
    function deriveMoveStatus(dbStatus: string | null, assignmentState: string | null, executionState: string | null): string {
      const CANONICAL = ['accepted','en_route','arrived','in_progress','delayed','exception'];
      if (dbStatus && CANONICAL.includes(dbStatus)) return dbStatus;
      if (dbStatus === 'completed'  || executionState === 'COMPLETED')  return 'completed';
      if (dbStatus === 'cancelled'  || executionState === 'CANCELLED')  return 'cancelled';
      if (executionState && executionState !== 'READY') return 'in_progress';
      if (assignmentState === 'ASSIGNED')               return 'assigned';
      return 'unassigned';
    }

    // ── Derive readinessStatus from executionState ────────────────────────
    const READINESS_MAP: Record<string, string> = {
      READY:                'ready',
      EN_ROUTE_PICKUP:      'en_route_pickup',
      AT_PICKUP:            'at_pickup',
      EN_ROUTE_DESTINATION: 'en_route_destination',
      AT_DESTINATION:       'at_destination',
      COMPLETED:            'completed',
      CANCELLED:            'cancelled',
    };

    // ── Shape the DTO ─────────────────────────────────────────────────────
    const data = rows.map(r => ({
      // ── Core identity ───────────────────────────────────────────────────
      id:         r.id,
      externalId: r.moveNumber ?? null,

      // ── Account ─────────────────────────────────────────────────────────
      account: r.customerId
        ? { id: r.customerId, name: accountMap[r.customerId] ?? null }
        : null,

      // ── Service & classification ─────────────────────────────────────────
      serviceType: r.moveType ? r.moveType.toLowerCase() : null,
      priority:    r.priority ?? 'normal',

      // ── Derived lifecycle status ─────────────────────────────────────────
      status: deriveMoveStatus(r.status, r.assignmentState, r.executionState),

      // ── Time ─────────────────────────────────────────────────────────────
      scheduledTime: r.tripDate ? r.tripDate.toISOString() : null,

      // ── Location objects — prefer structured fields, fall back to flat string
      // Spec Section 7: origin/destination with name, address1, city, state, postalCode
      origin: {
        name:       r.originName      ?? null,
        address1:   r.originAddress1  ?? r.origin ?? null,
        city:       r.originCity      ?? null,
        state:      r.originState     ?? null,
        postalCode: r.originPostalCode ?? null,
      },
      destination: {
        name:         r.destinationName        ?? null,
        address1:     r.destinationAddress1    ?? r.destination ?? null,
        city:         r.destinationCity        ?? null,
        state:        r.destinationState       ?? null,
        postalCode:   r.destinationPostalCode  ?? null,
        locationId:   r.destinationLocationId  ?? null,
      },

      // ── Driver ───────────────────────────────────────────────────────────
      assignedDriver: r.driverId
        ? { id: r.driverId, name: driverMap[r.driverId] ?? null }
        : null,

      // ── Customer contact (spec Section 7) ────────────────────────────────
      customer: (r.customerFirstName || r.customerLastName || r.customerPhone)
        ? {
            firstName: r.customerFirstName ?? null,
            lastName:  r.customerLastName  ?? null,
            phone:     r.customerPhone     ?? null,
          }
        : null,

      // ── Vehicle (spec Section 7) ─────────────────────────────────────────
      vehicle: (r.vehicleMake || r.vehicleModel || r.vehicleVin)
        ? {
            year:  r.vehicleYear  ?? null,
            make:  r.vehicleMake  ?? null,
            model: r.vehicleModel ?? null,
            vin:   r.vehicleVin   ?? null,
            color: r.vehicleColor ?? null,
          }
        : null,

      // ── Readiness & indicators ───────────────────────────────────────────
      readinessStatus: r.executionState ? (READINESS_MAP[r.executionState] ?? r.executionState.toLowerCase()) : null,
      notesIndicator:  !!(r.notes && r.notes.trim().length > 0),
      exceptionFlag:   excMoveSet.has(r.id),

      // ── Timestamps ───────────────────────────────────────────────────────
      updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    }));

    return res.json(paginatedResponse(data, Number(countRes[0]?.count || 0), page, limit));
  } catch (err: any) {
    console.error('[v1] GET /moves error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch moves.' });
  }
});


// ─── GET /api/v1/moves/:id ───────────────────────────────────────────────────
// Contract DTO:
//   id, externalId, account{id,name}, serviceType, priority, status (derived),
//   scheduledTime, origin{name,address1,city,state,postalCode},
//   destination{name,address1,city,state,postalCode},
//   assignedDriver{id,name}|null,
//   customer{firstName,lastName,phone}  (null — not stored inline in trips),
//   vehicle{year,make,model,vin,color,type} (vin/year/make/model/color null — not stored),
//   notes[]  (trips.notes text wrapped as single array item if present),
//   eventHistory[]  (move_offer_audit + v1_execution_events merged, ordered by timestamp),
//   updatedAt
router.get('/moves/:id', requireScope('read:moves'), async (req: Request, res: Response) => {
  try {
    const moveId = req.params.id;

    // ── Fetch core row ────────────────────────────────────────────────────
    const [row] = await db.select({
      id:                trips.id,
      moveNumber:        trips.moveNumber,
      driverId:          trips.driverId,
      customerId:        trips.customerId,
      tripDate:          trips.tripDate,
      origin:            trips.origin,
      destination:       trips.destination,
      originLat:         trips.originLat,
      originLng:         trips.originLng,
      destinationLat:    trips.destinationLat,
      destinationLng:    trips.destinationLng,
      distance:          trips.distance,
      estimatedMinutes:  trips.estimatedMinutes,
      status:            trips.status,
      priority:          trips.priority,
      moveType:          trips.moveType,
      vehicleType:       trips.vehicleType,
      assignmentState:   trips.assignmentState,
      executionState:    trips.executionState,
      notes:             trips.notes,
      customerInstructions: trips.customerInstructions,
      billRate:          trips.billRate,
      payRate:           trips.payRate,
      payEstimateTotal:  trips.payEstimateTotal,
      ingestSource:      trips.ingestSource,
      offeredToDriverId: trips.offeredToDriverId,
      acceptedAt:        trips.acceptedAt,
      createdAt:         trips.createdAt,
      updatedAt:         trips.updatedAt,
      // ── Structured fields (populated by POST /bookings v2) ─────────────
      customerFirstName: trips.customerFirstName,
      customerLastName:  trips.customerLastName,
      customerPhone:     trips.customerPhone,
      customerEmail:     trips.customerEmail,
      vehicleYear:       trips.vehicleYear,
      vehicleMake:       trips.vehicleMake,
      vehicleModel:      trips.vehicleModel,
      vehicleVin:        trips.vehicleVin,
      vehicleColor:      trips.vehicleColor,
      originName:        trips.originName,
      originAddress1:    trips.originAddress1,
      originCity:        trips.originCity,
      originState:       trips.originState,
      originPostalCode:  trips.originPostalCode,
      destinationName:       trips.destinationName,
      destinationAddress1:   trips.destinationAddress1,
      destinationCity:       trips.destinationCity,
      destinationState:      trips.destinationState,
      destinationPostalCode: trips.destinationPostalCode,
    })
      .from(trips)
      .where(and(eq(trips.id, moveId)))
      .limit(1);

    if (!row) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Move not found.' });
    }

    // ── Parallel enrichment ───────────────────────────────────────────────
    const [account, assignedDriver, auditEvents, execEvents] = await Promise.all([
      // Account
      row.customerId
        ? db.select({ id: customers.id, name: customers.customerName })
            .from(customers)
            .where(eq(customers.id, row.customerId))
            .limit(1)
            .then(r => r[0] ?? null)
        : Promise.resolve(null),

      // Assigned driver + user name
      row.driverId
        ? db.select({
            id:          drivers.id,
            firstName:   users.firstName,
            lastName:    users.lastName,
            phoneNumber: drivers.phoneNumber,
          })
            .from(drivers)
            .leftJoin(users, eq(drivers.userId, users.id))
            .where(eq(drivers.id, row.driverId))
            .limit(1)
            .then(r => r[0] ?? null)
        : Promise.resolve(null),

      // move_offer_audit — assignment lifecycle events
      db.select({
          id:          moveOfferAudit.id,
          eventType:   moveOfferAudit.eventType,
          driverId:    moveOfferAudit.driverId,
          actorUserId: moveOfferAudit.actorUserId,
          oldState:    moveOfferAudit.oldState,
          newState:    moveOfferAudit.newState,
          reasonCode:  moveOfferAudit.reasonCode,
          note:        moveOfferAudit.note,
          createdAt:   moveOfferAudit.createdAt,
          // Actor name via LEFT JOIN to users
          actorFirstName: users.firstName,
          actorLastName:  users.lastName,
        })
          .from(moveOfferAudit)
          .leftJoin(users, eq(moveOfferAudit.actorUserId, users.id))
          .where(eq(moveOfferAudit.moveId, moveId))
          .orderBy(asc(moveOfferAudit.createdAt))
          .limit(50),

      // v1_execution_events — field execution events
      db.select({
          id:        v1ExecutionEvents.id,
          eventType: v1ExecutionEvents.eventType,
          driverId:  v1ExecutionEvents.driverId,
          createdAt: v1ExecutionEvents.createdAt,
          payload:   v1ExecutionEvents.payload,
        })
          .from(v1ExecutionEvents)
          .where(eq(v1ExecutionEvents.moveId, moveId))
          .orderBy(asc(v1ExecutionEvents.createdAt))
          .limit(50),
    ]);

    // ── Derive contract status ────────────────────────────────────────────
    function deriveMoveStatus(dbStatus: string | null, assignState: string | null, execState: string | null): string {
      const CANONICAL = ['accepted','en_route','arrived','in_progress','delayed','exception'];
      if (dbStatus && CANONICAL.includes(dbStatus)) return dbStatus;
      if (dbStatus === 'completed'  || execState === 'COMPLETED')  return 'completed';
      if (dbStatus === 'cancelled'  || execState === 'CANCELLED')  return 'cancelled';
      if (execState && execState !== 'READY')                      return 'in_progress';
      if (assignState === 'ASSIGNED')                              return 'assigned';
      return 'unassigned';
    }

    // ── Derive readiness status ───────────────────────────────────────────
    const READINESS_MAP: Record<string, string> = {
      READY:                'ready',
      EN_ROUTE_PICKUP:      'en_route_pickup',
      AT_PICKUP:            'at_pickup',
      EN_ROUTE_DESTINATION: 'en_route_destination',
      AT_DESTINATION:       'at_destination',
      COMPLETED:            'completed',
      CANCELLED:            'cancelled',
    };

    // ── Build event history (merge audit + execution events by timestamp) ─
    const auditItems = auditEvents.map(h => {
      const first = (h.actorFirstName ?? '').trim();
      const last  = (h.actorLastName  ?? '').trim();
      const actorName = [first, last].filter(Boolean).join(' ') || null;
      return {
        id:        h.id,
        eventType: h.eventType,
        timestamp: h.createdAt ? new Date(h.createdAt).toISOString() : null,
        actorType: h.actorUserId ? 'dispatcher' : h.driverId ? 'driver' : 'system',
        actorId:   h.actorUserId ?? h.driverId ?? null,
        actorName: actorName,
        note:      h.note      ?? null,
        oldState:  h.oldState  ?? null,
        newState:  h.newState  ?? null,
        source:    'assignment',
      };
    });

    const execItems = execEvents.map(e => ({
      id:        e.id,
      eventType: e.eventType,
      timestamp: e.createdAt ? new Date(e.createdAt).toISOString() : null,
      actorType: e.driverId ? 'driver' : 'system',
      actorId:   e.driverId ?? null,
      actorName: null as string | null,
      note:      null as string | null,
      oldState:  null as string | null,
      newState:  null as string | null,
      source:    'execution',
    }));

    // Merge and sort by timestamp ascending
    const eventHistory = [...auditItems, ...execItems].sort((a, b) => {
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0;
    });

    // ── Wrap trips.notes text as structured array (if present) ────────────
    const notesArray = row.notes && row.notes.trim()
      ? [{
          id:        `${row.id}-note`,
          text:      row.notes.trim(),
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
          createdBy: null,
        }]
      : [];

    // ── Shape DTO ─────────────────────────────────────────────────────────
    const driverName = assignedDriver
      ? [(assignedDriver.firstName ?? '').trim(), (assignedDriver.lastName ?? '').trim()].filter(Boolean).join(' ') || null
      : null;

    const data = {
      // ── Core identity ───────────────────────────────────────────────────
      id:         row.id,
      externalId: row.moveNumber ?? null,

      // ── Account ─────────────────────────────────────────────────────────
      account: account
        ? { id: account.id, name: account.name ?? null }
        : row.customerId ? { id: row.customerId, name: null } : null,

      // ── Classification ───────────────────────────────────────────────────
      serviceType: row.moveType ? row.moveType.toLowerCase() : null,
      priority:    row.priority ?? 'normal',
      status:      deriveMoveStatus(row.status, row.assignmentState, row.executionState),

      // ── Scheduling ───────────────────────────────────────────────────────
      scheduledTime: row.tripDate ? row.tripDate.toISOString() : null,

      // ── Location — structured fields from v2 bookings; falls back to flat string ──
      origin: {
        name:       row.originName       || null,
        address1:   row.originAddress1   || row.origin || null,
        city:       row.originCity       || null,
        state:      row.originState      || null,
        postalCode: row.originPostalCode || null,
        lat:        row.originLat        ?? null,
        lng:        row.originLng        ?? null,
      },
      destination: {
        name:       row.destinationName       || null,
        address1:   row.destinationAddress1   || row.destination || null,
        city:       row.destinationCity       || null,
        state:      row.destinationState      || null,
        postalCode: row.destinationPostalCode || null,
        lat:        row.destinationLat        ?? null,
        lng:        row.destinationLng        ?? null,
      },

      // ── Driver ───────────────────────────────────────────────────────────
      assignedDriver: row.driverId
        ? { id: row.driverId, name: driverName }
        : null,

      // ── End-customer contact (populated by POST /bookings v2) ────────────
      customer: {
        firstName: row.customerFirstName || null,
        lastName:  row.customerLastName  || null,
        phone:     row.customerPhone     || null,
        email:     row.customerEmail     || null,
      },

      // ── Vehicle (structured fields from v2 bookings; type always available) ──
      vehicle: {
        year:  row.vehicleYear  ?? null,
        make:  row.vehicleMake  || null,
        model: row.vehicleModel || null,
        vin:   row.vehicleVin   || null,
        color: row.vehicleColor || null,
        type:  row.vehicleType  ?? null,
      },

      // ── Notes ────────────────────────────────────────────────────────────
      notes: notesArray,

      // ── Event history ────────────────────────────────────────────────────
      eventHistory,

      // ── Operational context ───────────────────────────────────────────────
      readinessStatus:      row.executionState ? (READINESS_MAP[row.executionState] ?? row.executionState.toLowerCase()) : null,
      customerInstructions: row.customerInstructions ?? null,
      distance:             row.distance        ?? null,
      estimatedMinutes:     row.estimatedMinutes ?? null,
      billRate:             row.billRate         ?? null,
      payRate:              row.payRate          ?? null,
      payEstimateTotal:     row.payEstimateTotal ?? null,
      ingestSource:         row.ingestSource     ?? null,

      // ── Timestamps ───────────────────────────────────────────────────────
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    };

    return res.json({ success: true, data });
  } catch (err: any) {
    console.error('[v1] GET /moves/:id error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch move.' });
  }
});


export default router;
