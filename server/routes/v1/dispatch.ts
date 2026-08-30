/**
 * DriverConnect Integration API v1 — Dispatch Module
 *
 *   POST /api/v1/dispatch/assign    — Assign a driver to a move    (write:moves)
 *   POST /api/v1/dispatch/reassign  — Reassign move to new driver  (write:moves)
 *
 * Contract standards:
 *   • Bearer / X-API-Key auth (applied by parent router)
 *   • Response envelope applied by v1ResponseTransform middleware
 *   • X-Idempotency-Key supported on all mutating endpoints
 *   • moveId / driverId accept either internal UUID or human-readable externalId
 *     (move number e.g. "MV-000006" or driver number e.g. "DRV-0042")
 */

import { Router, Request, Response } from 'express';
import { db } from '../../db';
import {
  trips, drivers, users, moveOfferAudit, v1AuditLog, v1IdempotencyKeys,
} from '@shared/schema';
import { eq, and, ne, sql, or } from 'drizzle-orm';
import { requireScope } from '../../middleware/v1ApiKeyAuth';
import { dispatchWebhook } from '../../services/webhookService';

const router = Router();

// ─── Local helpers ────────────────────────────────────────────────────────────

/** Resolve a moveId that may be a UUID or a move number like "MV-000001". */
async function resolveMove(raw: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
  const [row] = await db
    .select({
      id:              trips.id,
      moveNumber:      trips.moveNumber,
      driverId:        trips.driverId,
      assignmentState: trips.assignmentState,
      executionState:  trips.executionState,
      tripDate:        trips.tripDate,
      estimatedMinutes: trips.estimatedMinutes,
      updatedAt:       trips.updatedAt,
    })
    .from(trips)
    .where(isUuid ? eq(trips.id, raw) : eq(trips.moveNumber, raw.toUpperCase()))
    .limit(1);
  return row ?? null;
}

/** Resolve a driverId that may be a UUID or driver number. */
async function resolveDriver(raw: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
  const [row] = await db
    .select({
      id:           drivers.id,
      driverNumber: drivers.driverNumber,
      isDeleted:    drivers.isDeleted,
      status:       drivers.status,
      firstName:    users.firstName,
      lastName:     users.lastName,
      userOrgId:    users.orgId,
    })
    .from(drivers)
    .leftJoin(users, eq(drivers.userId, users.id))
    .where(isUuid ? eq(drivers.id, raw) : eq(drivers.driverNumber, raw))
    .limit(1);
  return row ?? null;
}

/** Returns a conflicting move if the driver is already assigned to an overlapping window. */
async function findSchedulingConflict(
  driverId: string,
  tripDate: Date | null,
  estimatedMinutes: number | null,
  excludeTripId: string,
) {
  if (!tripDate) return null;
  const bufferMs      = 30 * 60 * 1000;
  const durationMs    = (estimatedMinutes ?? 90) * 60 * 1000;
  const windowStart   = new Date(tripDate.getTime() - bufferMs);
  const windowEnd     = new Date(tripDate.getTime() + durationMs + bufferMs);

  const [conflict] = await db
    .select({ id: trips.id, moveNumber: trips.moveNumber, tripDate: trips.tripDate })
    .from(trips)
    .where(
      and(
        eq(trips.driverId, driverId),
        eq(trips.assignmentState, 'ASSIGNED'),
        sql`${trips.executionState} NOT IN ('COMPLETED','CANCELLED')`,
        sql`${trips.tripDate} BETWEEN ${windowStart.toISOString()}::timestamptz AND ${windowEnd.toISOString()}::timestamptz`,
        ne(trips.id, excludeTripId),
      ),
    )
    .limit(1);

  return conflict ?? null;
}

/** Append a row to move_offer_audit. Non-blocking (errors logged, not thrown). */
async function logAudit(
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
    oldState, newState,
    note,
    metadata: { source: 'dispatch_api' },
  }).catch(err => console.error('[dispatch] audit log failed:', err.message));
}

/** Idempotency: returns cached response if key was already processed. */
async function checkIdempotency(key: string) {
  if (!key) return null;
  const [row] = await db
    .select({ response: v1IdempotencyKeys.response, statusCode: v1IdempotencyKeys.statusCode })
    .from(v1IdempotencyKeys)
    .where(eq(v1IdempotencyKeys.key, key))
    .limit(1);
  return row?.response ? { statusCode: row.statusCode ?? 200, response: row.response } : null;
}

async function saveIdempotency(key: string, orgId: string | null, statusCode: number, response: any) {
  if (!key) return;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(v1IdempotencyKeys)
    .values({ key, orgId, response, statusCode, expiresAt })
    .onConflictDoNothing()
    .catch(err => console.error('[dispatch] idempotency save failed:', err.message));
}

/** Write to v1_audit_log. Non-blocking. */
async function writeAuditLog(req: Request, action: string, resourceId: string, statusCode: number) {
  const ctx = req.v1ApiKey;
  await db.insert(v1AuditLog).values({
    apiKeyId:       ctx?.apiKeyId,
    keyName:        ctx?.keyName,
    orgId:          ctx?.orgId,
    action,
    resource:       'moves',
    resourceId,
    requestBody:    req.body as any,
    responseStatus: statusCode,
    idempotencyKey: req.headers['x-idempotency-key'] as string,
    ipAddress:      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
    userAgent:      req.headers['user-agent'],
  }).catch(err => console.error('[dispatch] v1 audit log failed:', err.message));
}

// ─── POST /api/v1/dispatch/assign ────────────────────────────────────────────
router.post(
  '/dispatch/assign',
  requireScope('write:moves'),
  async (req: Request, res: Response) => {
    const idempotencyKey = (req.headers['x-idempotency-key'] as string) ?? '';
    const orgId          = req.v1ApiKey?.orgId ?? null;

    // ── Idempotency check ─────────────────────────────────────────────────────
    if (idempotencyKey) {
      const cached = await checkIdempotency(idempotencyKey);
      if (cached) {
        return res.status(cached.statusCode).json(cached.response);
      }
    }

    // ── Input validation ──────────────────────────────────────────────────────
    const { moveId: rawMoveId, driverId: rawDriverId, assignedByUserId, assignmentReason } = req.body ?? {};

    if (!rawMoveId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELD', message: '`moveId` is required.' },
      });
    }
    if (!rawDriverId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELD', message: '`driverId` is required.' },
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

    const terminalStates = ['COMPLETED', 'CANCELLED'];
    if (move.executionState && terminalStates.includes(move.executionState)) {
      return res.status(422).json({
        success: false,
        error: {
          code: 'MOVE_IN_TERMINAL_STATE',
          message: `Move '${move.moveNumber}' is ${move.executionState.toLowerCase()} and cannot be assigned.`,
        },
      });
    }
    if (move.assignmentState === 'CANCELLED') {
      return res.status(422).json({
        success: false,
        error: { code: 'MOVE_CANCELLED', message: `Move '${move.moveNumber}' has been cancelled.` },
      });
    }

    // ── Resolve driver ────────────────────────────────────────────────────────
    const driver = await resolveDriver(String(rawDriverId));
    if (!driver) {
      return res.status(422).json({
        success: false,
        error: { code: 'DRIVER_NOT_FOUND', message: `Driver '${rawDriverId}' not found.` },
      });
    }
    if (driver.isDeleted) {
      return res.status(422).json({
        success: false,
        error: { code: 'DRIVER_INACTIVE', message: `Driver has been removed from the system.` },
      });
    }
    const driverStatus = (driver.status ?? '').toLowerCase();
    if (['inactive', 'terminated', 'suspended'].includes(driverStatus)) {
      return res.status(422).json({
        success: false,
        error: { code: 'DRIVER_INACTIVE', message: `Driver is ${driver.status} and cannot be assigned.` },
      });
    }

    // ── Risk Restriction + Move Eligibility gate ──────────────────────────────
    try {
      const { getDriverRiskRestriction, checkMoveEligibility } = await import('../../services/riskEnforcementEngine');
      const riskStatus = await getDriverRiskRestriction(driver.id);
      if (riskStatus) {
        const eligibility = checkMoveEligibility(
          riskStatus.effectiveRestriction,
          riskStatus.riskTier,
          move.vehicleType ?? null,
          move.distance != null ? Number(move.distance) : null
        );
        if (!eligibility.eligible) {
          return res.status(422).json({
            success: false,
            error: {
              code: eligibility.errorCode ?? 'DRIVER_INELIGIBLE',
              message: eligibility.reason ?? 'Driver is not eligible for this move type based on their risk tier.',
            },
          });
        }
      }
    } catch {
      // Non-fatal: if the risk engine is unavailable, proceed with assignment
    }

    // ── Tenant scope check: driver must belong to the same org as the API key ─
    if (orgId && driver.userOrgId && driver.userOrgId !== orgId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'DRIVER_OUT_OF_SCOPE',
          message: `Driver '${rawDriverId}' does not belong to this tenant and cannot be assigned.`,
        },
      });
    }

    // ── Re-assignment idempotency: driver already assigned to this move ───────
    if (move.driverId === driver.id && move.assignmentState === 'ASSIGNED') {
      const driverName = `${driver.firstName ?? ''} ${driver.lastName ?? ''}`.trim() || (driver.driverNumber ?? driver.id);
      const payload = {
        success: true,
        data: {
          moveId:         move.id,
          externalId:     move.moveNumber,
          status:         'assigned',
          assignedDriver: { id: driver.id, name: driverName },
          assignedAt:     move.updatedAt ? new Date(move.updatedAt).toISOString() : new Date().toISOString(),
        },
      };
      if (idempotencyKey) await saveIdempotency(idempotencyKey, orgId, 200, payload);
      return res.status(200).json(payload);
    }

    // ── Scheduling conflict check ─────────────────────────────────────────────
    const conflict = await findSchedulingConflict(driver.id, move.tripDate ?? null, move.estimatedMinutes ?? null, move.id);
    if (conflict) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'SCHEDULING_CONFLICT',
          message: `Driver already has an assigned move (${conflict.moveNumber ?? conflict.id}) that overlaps with this time window.`,
          details: {
            conflictingMoveId:     conflict.id,
            conflictingMoveNumber: conflict.moveNumber,
            conflictingScheduledTime: conflict.tripDate ? new Date(conflict.tripDate).toISOString() : null,
          },
        },
      });
    }

    // ── Perform assignment ────────────────────────────────────────────────────
    const now = new Date();
    const previousAssignmentState = move.assignmentState ?? 'UNASSIGNED';
    const previousDriverId        = move.driverId ?? null;

    await db
      .update(trips)
      .set({
        driverId:        driver.id,
        assignmentState: 'ASSIGNED',
        updatedAt:       now,
      })
      .where(eq(trips.id, move.id));

    // ── Audit trail ───────────────────────────────────────────────────────────
    const isReassignment = previousDriverId !== null && previousDriverId !== driver.id;
    const eventType      = isReassignment ? 'REASSIGNED' : 'ASSIGNED';
    const noteText       = assignmentReason
      ? `Dispatch assignment via API. Reason: ${assignmentReason}`
      : 'Dispatch assignment via API.';

    await logAudit(move.id, eventType, driver.id, assignedByUserId ?? null, previousAssignmentState, 'ASSIGNED', noteText);
    await writeAuditLog(req, 'dispatch.assign', move.id, 201);

    // ── Webhook ───────────────────────────────────────────────────────────────
    dispatchWebhook(orgId ?? '', 'trip.assigned', {
      moveId:     move.id,
      status:     'assigned',
      driverId:   driver.id,
      driverName: `${driver.firstName ?? ''} ${driver.lastName ?? ''}`.trim() || driver.driverNumber,
    }).catch((err: Error) => console.error('[dispatch] webhook failed:', err.message));

    // ── Shape response ────────────────────────────────────────────────────────
    const driverName = `${driver.firstName ?? ''} ${driver.lastName ?? ''}`.trim() || (driver.driverNumber ?? driver.id);

    const responsePayload = {
      success: true,
      data: {
        moveId:         move.id,
        externalId:     move.moveNumber,
        status:         'assigned' as const,
        assignedDriver: { id: driver.id, name: driverName },
        assignedAt:     now.toISOString(),
        ...(isReassignment ? { previousDriverId } : {}),
      },
    };

    if (idempotencyKey) await saveIdempotency(idempotencyKey, orgId, 201, responsePayload);

    return res.status(201).json(responsePayload);
  },
);

// ─── POST /api/v1/dispatch/reassign ──────────────────────────────────────────
router.post(
  '/dispatch/reassign',
  requireScope('write:moves'),
  async (req: Request, res: Response) => {
    const idempotencyKey = (req.headers['x-idempotency-key'] as string) ?? '';
    const orgId          = req.v1ApiKey?.orgId ?? null;

    // ── Idempotency check ─────────────────────────────────────────────────────
    if (idempotencyKey) {
      const cached = await checkIdempotency(idempotencyKey);
      if (cached) return res.status(cached.statusCode).json(cached.response);
    }

    // ── Input validation ──────────────────────────────────────────────────────
    const {
      moveId:             rawMoveId,
      fromDriverId:       rawFromDriverId,
      toDriverId:         rawToDriverId,
      reassignedByUserId,
      reason,
    } = req.body ?? {};

    if (!rawMoveId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELD', message: '`moveId` is required.' },
      });
    }
    if (!rawToDriverId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELD', message: '`toDriverId` is required.' },
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

    const terminalStates = ['COMPLETED', 'CANCELLED'];
    if (
      (move.executionState  && terminalStates.includes(move.executionState)) ||
      (move.assignmentState === 'CANCELLED')
    ) {
      const state = move.executionState ?? move.assignmentState ?? 'terminal';
      return res.status(409).json({
        success: false,
        error: {
          code:    'MOVE_IN_TERMINAL_STATE',
          message: `Move '${move.moveNumber}' is ${state.toLowerCase()} and cannot be reassigned.`,
        },
      });
    }

    // ── fromDriverId concurrency guard (optimistic lock) ─────────────────────
    if (rawFromDriverId) {
      const fromDriver = await resolveDriver(String(rawFromDriverId));
      const fromId = fromDriver?.id ?? null;

      // The move's current driverId must match the resolved fromDriverId
      if (move.driverId !== fromId) {
        return res.status(409).json({
          success: false,
          error: {
            code:    'DRIVER_MISMATCH',
            message: 'The move\'s current driver does not match `fromDriverId`. The move may have been reassigned by another dispatcher.',
            details: {
              currentDriverId: move.driverId ?? null,
              providedFromDriverId: fromId,
            },
          },
        });
      }
    }

    // ── Resolve incoming driver ───────────────────────────────────────────────
    const toDriver = await resolveDriver(String(rawToDriverId));
    if (!toDriver) {
      return res.status(422).json({
        success: false,
        error: { code: 'DRIVER_NOT_FOUND', message: `Driver '${rawToDriverId}' not found.` },
      });
    }
    if (toDriver.isDeleted) {
      return res.status(422).json({
        success: false,
        error: { code: 'DRIVER_INACTIVE', message: 'Driver has been removed from the system.' },
      });
    }
    const toStatus = (toDriver.status ?? '').toLowerCase();
    if (['inactive', 'terminated', 'suspended'].includes(toStatus)) {
      return res.status(422).json({
        success: false,
        error: { code: 'DRIVER_INACTIVE', message: `Driver is ${toDriver.status} and cannot be assigned.` },
      });
    }

    // ── Risk Restriction + Move Eligibility gate ──────────────────────────────
    try {
      const { getDriverRiskRestriction, checkMoveEligibility } = await import('../../services/riskEnforcementEngine');
      const riskStatus = await getDriverRiskRestriction(toDriver.id);
      if (riskStatus) {
        const eligibility = checkMoveEligibility(
          riskStatus.effectiveRestriction,
          riskStatus.riskTier,
          move.vehicleType ?? null,
          move.distance != null ? Number(move.distance) : null
        );
        if (!eligibility.eligible) {
          return res.status(422).json({
            success: false,
            error: {
              code: eligibility.errorCode ?? 'DRIVER_INELIGIBLE',
              message: eligibility.reason ?? 'Driver is not eligible for this move type based on their risk tier.',
            },
          });
        }
      }
    } catch {
      // Non-fatal
    }

    // ── Tenant scope check for incoming driver ────────────────────────────────
    if (orgId && toDriver.userOrgId && toDriver.userOrgId !== orgId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'DRIVER_OUT_OF_SCOPE',
          message: `Driver '${rawToDriverId}' does not belong to this tenant and cannot be assigned.`,
        },
      });
    }

    // ── Same-driver guard ─────────────────────────────────────────────────────
    if (move.driverId === toDriver.id) {
      return res.status(409).json({
        success: false,
        error: {
          code:    'SAME_DRIVER',
          message: 'The specified driver is already assigned to this move. Use `/dispatch/assign` to force-assign or provide a different driver.',
          details: { currentDriverId: move.driverId },
        },
      });
    }

    // ── Scheduling conflict check for incoming driver ─────────────────────────
    const conflict = await findSchedulingConflict(toDriver.id, move.tripDate ?? null, move.estimatedMinutes ?? null, move.id);
    if (conflict) {
      return res.status(409).json({
        success: false,
        error: {
          code:    'SCHEDULING_CONFLICT',
          message: `Driver already has an assigned move (${conflict.moveNumber ?? conflict.id}) that overlaps with this time window.`,
          details: {
            conflictingMoveId:       conflict.id,
            conflictingMoveNumber:   conflict.moveNumber,
            conflictingScheduledTime: conflict.tripDate
              ? new Date(conflict.tripDate).toISOString()
              : null,
          },
        },
      });
    }

    // ── Perform reassignment ──────────────────────────────────────────────────
    const now              = new Date();
    const previousDriverId = move.driverId ?? null;

    await db
      .update(trips)
      .set({
        driverId:        toDriver.id,
        assignmentState: 'ASSIGNED',
        updatedAt:       now,
      })
      .where(eq(trips.id, move.id));

    // ── Audit trail ───────────────────────────────────────────────────────────
    const noteText = reason
      ? `Dispatch reassignment via API. Reason: ${reason}`
      : 'Dispatch reassignment via API.';

    await logAudit(
      move.id,
      'REASSIGNED',
      toDriver.id,
      reassignedByUserId ?? null,
      move.assignmentState ?? 'ASSIGNED',
      'ASSIGNED',
      noteText,
    );
    await writeAuditLog(req, 'dispatch.reassign', move.id, 200);

    // ── Webhook ───────────────────────────────────────────────────────────────
    dispatchWebhook(orgId ?? '', 'trip.reassigned', {
      moveId:          move.id,
      status:          'assigned',
      driverId:        toDriver.id,
      driverName:      `${toDriver.firstName ?? ''} ${toDriver.lastName ?? ''}`.trim() || toDriver.driverNumber,
      previousDriverId,
    }).catch((err: Error) =>
      console.error('[dispatch] reassign webhook failed:', err.message),
    );

    // ── Shape response ────────────────────────────────────────────────────────
    const toDriverName = `${toDriver.firstName ?? ''} ${toDriver.lastName ?? ''}`.trim()
      || (toDriver.driverNumber ?? toDriver.id);

    const responsePayload = {
      success: true,
      data: {
        moveId:         move.id,
        externalId:     move.moveNumber,
        status:         'assigned' as const,
        assignedDriver: { id: toDriver.id, name: toDriverName },
        reassignedAt:   now.toISOString(),
        previousDriverId,
      },
    };

    if (idempotencyKey) await saveIdempotency(idempotencyKey, orgId, 200, responsePayload);

    return res.status(200).json(responsePayload);
  },
);

export default router;
