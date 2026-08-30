/**
 * DriverConnect Integration API v1 — Time, Expense & Financial Sync
 *
 * POST /api/v1/time-events      — Submit a time/clock event for a driver
 * POST /api/v1/expense-events   — Submit an expense record for a driver
 * GET  /api/v1/invoices         — Read-only invoice visibility (financial sync)
 * GET  /api/v1/payments         — Read-only payment visibility (financial sync)
 *
 * ── Time Event Types ─────────────────────────────────────────────────────────
 *   CLOCK_IN     — Driver starts a shift (start_at required, end_at omitted)
 *   CLOCK_OUT    — Driver ends a shift  (end_at required)
 *   SHIFT_ENTRY  — Complete time block  (start_at + end_at both required)
 *
 * ── Expense Types ────────────────────────────────────────────────────────────
 *   fuel | tolls | parking | maintenance | wait_time | damage | meal | other
 *
 * ── Approval Status (both) ───────────────────────────────────────────────────
 *   pending → approved / rejected
 *
 * ── Deduplication ────────────────────────────────────────────────────────────
 *   All POST endpoints support the `Idempotency-Key` header.
 *   Duplicate CLOCK_IN for the same driver + start_at window is rejected (409).
 *
 * ── Scopes ───────────────────────────────────────────────────────────────────
 *   write:time      POST /time-events
 *   read:time       GET  /time-events
 *   write:expenses  POST /expense-events
 *   read:expenses   GET  /expense-events
 *   read:invoices   GET  /invoices
 *   read:payments   GET  /payments
 */
import { Router, Request, Response } from 'express';
import { db } from '../../db';
import {
  v1TimeEvents, v1ExpenseEvents, v1AuditLog, v1IdempotencyKeys,
  drivers, trips, invoices, payments, timeEntries,
  payLines, payPeriods, users, customers,
} from '@shared/schema';
import { eq, and, desc, sql, gte, lte, ilike, or, sum, groupBy } from 'drizzle-orm';
import { requireScope } from '../../middleware/v1ApiKeyAuth';
import { dispatchWebhook } from '../../services/webhookService';

const router = Router();

// ─── Constants ────────────────────────────────────────────────────────────────
// Legacy uppercase types + new lowercase contract types
export const TIME_EVENT_TYPES = [
  // New contract types (lowercase)
  'trip_labor',      // Full time block for a move — startTime + endTime required
  'clock_in',        // Driver starts shift (startTime required, no endTime)
  'clock_out',       // Driver ends shift   (endTime required)
  'shift_entry',     // Complete time block  (startTime + endTime required)
  // Legacy uppercase variants (accepted for backward compat, normalised internally)
  'CLOCK_IN',
  'CLOCK_OUT',
  'SHIFT_ENTRY',
] as const;

export const EXPENSE_TYPES = [
  'fuel', 'tolls', 'parking', 'maintenance', 'wait_time', 'damage', 'meal', 'other',
] as const;

const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function paginate(query: Record<string, any>) {
  const page  = Math.max(1, parseInt(query.page as string) || 1);
  const rawLimit = query.pageSize ?? query.limit;
  const limit = Math.min(500, Math.max(1, parseInt(rawLimit as string) || 25));
  return { page, limit, offset: (page - 1) * limit };
}

function paginatedOk(data: any[], total: number, page: number, limit: number) {
  return {
    success: true,
    data,
    meta: {
      page,
      pageSize: limit,
      total,
      hasMore: page * limit < total,
    },
  };
}

async function checkIdempotencyKey(key: string, orgId: string | null) {
  try {
    const [cached] = await db
      .select({ statusCode: v1IdempotencyKeys.statusCode, response: v1IdempotencyKeys.response })
      .from(v1IdempotencyKeys)
      .where(
        orgId
          ? and(eq(v1IdempotencyKeys.key, key), eq(v1IdempotencyKeys.orgId, orgId))
          : eq(v1IdempotencyKeys.key, key)
      )
      .limit(1);
    return cached ?? null;
  } catch {
    return null;
  }
}

async function saveIdempotencyKey(
  key: string | undefined,
  orgId: string | null,
  statusCode: number,
  response: any
) {
  if (!key) return;
  await db
    .insert(v1IdempotencyKeys)
    .values({ key, orgId, statusCode, response, expiresAt: new Date(Date.now() + 24 * 3600 * 1000) })
    .onConflictDoNothing()
    .catch(() => {});
}

async function auditWrite(
  req: Request,
  action: string,
  resource: string,
  resourceId: string,
  statusCode: number
) {
  await db
    .insert(v1AuditLog)
    .values({
      apiKeyId:       req.v1ApiKey?.apiKeyId,
      keyName:        req.v1ApiKey?.keyName,
      orgId:          req.v1ApiKey?.orgId,
      action,
      resource,
      resourceId,
      requestBody:    req.body as any,
      responseStatus: statusCode,
      ipAddress:      ((req.headers['x-forwarded-for'] as string) || '').split(',')[0]?.trim() || req.ip,
      userAgent:      req.headers['user-agent'],
    })
    .catch(() => {});
}

// Resolve a driver by UUID or driver number (e.g. "DH-DR-42" or "42")
async function resolveDriver(raw: string): Promise<{ id: string } | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
  if (isUuid) {
    const [row] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.id, raw)).limit(1);
    return row ?? null;
  }
  // Extract numeric portion from "DH-DR-42" or accept bare number "42"
  const num = raw.replace(/^dh-dr-/i, '').replace(/^drv_?/i, '');
  const [row] = await db
    .select({ id: drivers.id })
    .from(drivers)
    .where(eq(drivers.driverNumber, isNaN(Number(num)) ? raw : num))
    .limit(1);
  return row ?? null;
}

// Legacy UUID-only validation (kept for internal use)
async function validateDriver(driverId: string): Promise<boolean> {
  const [row] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.id, driverId)).limit(1);
  return !!row;
}

// Resolve a move by UUID or move number (e.g. "MV-000006")
async function resolveMove(raw: string): Promise<{ id: string; moveNumber: string | null } | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
  const [row] = await db
    .select({ id: trips.id, moveNumber: trips.moveNumber })
    .from(trips)
    .where(isUuid ? eq(trips.id, raw) : eq(trips.moveNumber, raw.toUpperCase()))
    .limit(1);
  return row ?? null;
}

async function validateTrip(
  tripId: string,
  driverId: string
): Promise<{ valid: boolean; tripExists: boolean; assignedToDriver: boolean }> {
  const [row] = await db
    .select({ id: trips.id, driverId: trips.driverId })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!row) return { valid: false, tripExists: false, assignedToDriver: false };
  const assignedToDriver = row.driverId === driverId;
  return { valid: true, tripExists: true, assignedToDriver };
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/v1/time-events
//
// Submit a time/clock event for a driver. Events are immutably recorded in
// v1_time_events and (for SHIFT_ENTRY and CLOCK_OUT) linked to time_entries.
//
// Required: driver_id, event_type, start_at
// Conditional:
//   CLOCK_IN   — start_at required; end_at must be omitted
//   CLOCK_OUT  — end_at required; start_at should be the corresponding CLOCK_IN
//   SHIFT_ENTRY — start_at + end_at both required
// Optional: trip_id, notes, lat, lng
// Header: Idempotency-Key (strongly recommended)
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/time-events', requireScope('write:time'), async (req: Request, res: Response) => {
  // Accept X-Idempotency-Key (new) or Idempotency-Key (legacy)
  const idemKey = (req.headers['x-idempotency-key'] as string)
    || (req.headers['idempotency-key'] as string)
    || undefined;
  const orgId = req.v1ApiKey?.orgId ?? null;

  try {
    if (idemKey) {
      const cached = await checkIdempotencyKey(idemKey, orgId);
      if (cached) return res.status(cached.statusCode).json(cached.response);
    }

    // ── Field resolution: accept new camelCase OR legacy snake_case ─────────
    const rawDriverId  = req.body.driverId   || req.body.driver_id;
    const rawMoveId    = req.body.moveId      || req.body.trip_id;
    const accountId    = req.body.accountId   || null;   // metadata only; no DB column
    const rawEventType = req.body.eventType   || req.body.event_type;
    const rawStartTime = req.body.startTime   || req.body.start_at;
    const rawEndTime   = req.body.endTime     || req.body.end_at;
    const reqDuration  = req.body.durationMinutes ?? null;  // caller-supplied (optional)
    const lat          = req.body.lat   || null;
    const lng          = req.body.lng   || null;
    const notes        = req.body.notes || null;

    // ── Required field validation ─────────────────────────────────────────
    if (!rawDriverId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELD', message: '`driverId` is required.' },
      });
    }
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
    if (!rawStartTime) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELD', message: '`startTime` is required.' },
      });
    }

    // Normalise event type: lowercase contract → uppercase internal; keep existing uppercase as-is
    const eventTypeLower  = String(rawEventType).toLowerCase();
    const EVENT_TYPE_MAP: Record<string, string> = {
      trip_labor:  'SHIFT_ENTRY',   // trip_labor maps to SHIFT_ENTRY logic (full block)
      clock_in:    'CLOCK_IN',
      clock_out:   'CLOCK_OUT',
      shift_entry: 'SHIFT_ENTRY',
    };
    const event_type = EVENT_TYPE_MAP[eventTypeLower] ?? String(rawEventType).toUpperCase();

    const validInternalTypes = ['CLOCK_IN', 'CLOCK_OUT', 'SHIFT_ENTRY'];
    if (!validInternalTypes.includes(event_type)) {
      return res.status(400).json({
        success: false,
        error: {
          code:            'INVALID_EVENT_TYPE',
          message:         `'${rawEventType}' is not a valid eventType.`,
          validEventTypes: ['trip_labor', 'clock_in', 'clock_out', 'shift_entry'],
        },
      });
    }

    // ── Timestamp parsing ─────────────────────────────────────────────────
    const startDate = new Date(rawStartTime);
    const endDate   = rawEndTime ? new Date(rawEndTime) : null;
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_TIMESTAMP', message: '`startTime` is not a valid ISO-8601 timestamp.' } });
    }
    if (endDate && isNaN(endDate.getTime())) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_TIMESTAMP', message: '`endTime` is not a valid ISO-8601 timestamp.' } });
    }
    if (endDate && endDate <= startDate) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_TIMESTAMP', message: '`endTime` must be after `startTime`.' } });
    }

    // ── Event-type-specific validation ────────────────────────────────────
    if (event_type === 'CLOCK_IN' && endDate) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'CLOCK_IN (clock_in) must not include `endTime`. Use `shift_entry` or `clock_out` for a complete time block.' },
      });
    }
    if (event_type === 'CLOCK_OUT' && !endDate) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'CLOCK_OUT (clock_out) requires `endTime`.' },
      });
    }
    if (event_type === 'SHIFT_ENTRY' && !endDate) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: '`shift_entry` and `trip_labor` require both `startTime` and `endTime`.' },
      });
    }

    // ── Duration: caller-supplied takes priority; compute from timestamps ──
    if (reqDuration != null && Number(reqDuration) < 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_DURATION', message: '`durationMinutes` cannot be negative.' },
      });
    }
    const durationMinutes: number | null = reqDuration != null
      ? Number(reqDuration)
      : (endDate ? Math.round((endDate.getTime() - startDate.getTime()) / 60000) : null);

    // ── Driver resolution: UUID or driver number ──────────────────────────
    const resolvedDriver = await resolveDriver(String(rawDriverId));
    if (!resolvedDriver) {
      return res.status(404).json({
        success: false,
        error: { code: 'DRIVER_NOT_FOUND', message: `Driver '${rawDriverId}' not found.` },
      });
    }
    const driver_id = resolvedDriver.id;

    // ── Move resolution (optional): UUID or move number ───────────────────
    let trip_id: string | null = null;
    if (rawMoveId) {
      const resolvedMove = await resolveMove(String(rawMoveId));
      if (!resolvedMove) {
        return res.status(404).json({
          success: false,
          error: { code: 'MOVE_NOT_FOUND', message: `Move '${rawMoveId}' not found.` },
        });
      }
      trip_id = resolvedMove.id;
    }

    // ── Duplicate CLOCK_IN detection (±1-min window) ─────────────────────
    if (event_type === 'CLOCK_IN') {
      const windowStart = new Date(startDate.getTime() - 60_000);
      const windowEnd   = new Date(startDate.getTime() + 60_000);
      const [dup] = await db
        .select({ id: v1TimeEvents.id })
        .from(v1TimeEvents)
        .where(
          and(
            eq(v1TimeEvents.driverId, driver_id),
            eq(v1TimeEvents.eventType, 'CLOCK_IN'),
            sql`${v1TimeEvents.startAt} >= ${windowStart.toISOString()}`,
            sql`${v1TimeEvents.startAt} <= ${windowEnd.toISOString()}`,
            eq(v1TimeEvents.isVoided, false),
          )
        )
        .limit(1);
      if (dup) {
        return res.status(409).json({
          success: false,
          error: {
            code:       'DUPLICATE_CLOCK_IN',
            message:    `A CLOCK_IN event already exists for driver '${rawDriverId}' near startTime ${startDate.toISOString()}. Use X-Idempotency-Key for safe retries.`,
            existingId: dup.id,
          },
        });
      }
    }

    // ── Append accountId to notes if provided ─────────────────────────────
    const enrichedNotes = [
      notes,
      accountId ? `accountId:${accountId}` : null,
    ].filter(Boolean).join(' | ') || null;

    // ── Insert time event ─────────────────────────────────────────────────
    const [timeEvent] = await db
      .insert(v1TimeEvents)
      .values({
        idempotencyKey:  idemKey,
        apiKeyId:        req.v1ApiKey?.apiKeyId,
        orgId,
        driverId:        driver_id,
        tripId:          trip_id,
        eventType:       event_type,
        startAt:         startDate,
        endAt:           endDate,
        durationMinutes,
        lat:             lat ? String(lat) : null,
        lng:             lng ? String(lng) : null,
        notes:           enrichedNotes,
        approvalStatus:  'pending',
      })
      .returning();

    // ── Create linked time_entries record for SHIFT_ENTRY or CLOCK_OUT ────
    let timeEntryId: number | null = null;
    if ((event_type === 'SHIFT_ENTRY' || event_type === 'CLOCK_OUT') && endDate) {
      try {
        const [entry] = await db
          .insert(timeEntries)
          .values({
            driverId:        driver_id,
            startAt:         startDate,
            endAt:           endDate,
            durationMinutes: durationMinutes!,
            clockInLat:      lat ? Number(lat) : null,
            clockInLng:      lng ? Number(lng) : null,
            payrollStatus:   'pending',
          })
          .returning({ id: timeEntries.id });
        timeEntryId = entry.id;
        await db.update(v1TimeEvents).set({ timeEntryId }).where(eq(v1TimeEvents.id, timeEvent.id));
      } catch (entryErr) {
        console.warn('[v1] time_entries insert failed (non-fatal):', entryErr);
      }
    }

    await auditWrite(req, 'CREATE_TIME_EVENT', 'time_event', timeEvent.id, 201);

    if (orgId) {
      dispatchWebhook(orgId, 'time_event.created' as any, {
        timeEventId: timeEvent.id,
        driverId:    driver_id,
        moveId:      trip_id,
        eventType:   rawEventType,          // return the contract name the caller sent
        startTime:   startDate.toISOString(),
        endTime:     endDate?.toISOString() || null,
      }).catch(() => {});
    }

    // ── Contract-compliant response ───────────────────────────────────────
    // Returns compact data envelope; meta (requestId, timestamp) added by middleware
    const response = {
      success: true,
      data: {
        timeEventId:     timeEvent.id,
        status:          'recorded',
        createdAt:       timeEvent.createdAt instanceof Date
          ? timeEvent.createdAt.toISOString()
          : (timeEvent.createdAt ?? new Date().toISOString()),
      },
    };

    await saveIdempotencyKey(idemKey, orgId, 201, response);
    return res.status(201).json(response);
  } catch (err: any) {
    console.error('[v1] POST /time-events error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to record time event.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/v1/time-events
//
// List time events. Filterable by driver_id, trip_id, event_type, approval_status,
// from_date, to_date. Paginated.
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/time-events', requireScope('read:time'), async (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = paginate(req.query);
    const { driver_id, trip_id, event_type, approval_status, from_date, to_date } =
      req.query as Record<string, string>;

    const conditions: any[] = [eq(v1TimeEvents.isVoided, false)];
    if (driver_id)       conditions.push(eq(v1TimeEvents.driverId, driver_id));
    if (trip_id)         conditions.push(eq(v1TimeEvents.tripId, trip_id));
    if (event_type)      conditions.push(eq(v1TimeEvents.eventType, event_type.toUpperCase()));
    if (approval_status) conditions.push(eq(v1TimeEvents.approvalStatus, approval_status));
    if (from_date)       conditions.push(sql`${v1TimeEvents.startAt} >= ${from_date}::timestamptz`);
    if (to_date)         conditions.push(sql`${v1TimeEvents.startAt} <= ${to_date}::timestamptz`);

    const [rows, countRes] = await Promise.all([
      db.select().from(v1TimeEvents).where(and(...conditions))
        .orderBy(desc(v1TimeEvents.startAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(v1TimeEvents).where(and(...conditions)),
    ]);

    // DTO spec (Section 12): camelCase, trip_id → moveId, start_at → startTime,
    // end_at → endTime, duration_minutes → durationMinutes
    const data = rows.map(r => ({
      id:              r.id,
      driverId:        r.driverId,
      moveId:          r.tripId,
      eventType:       r.eventType,
      startTime:       r.startAt,
      endTime:         r.endAt,
      durationMinutes: r.durationMinutes,
      approvalStatus:  r.approvalStatus,
      timeEntryId:     r.timeEntryId,
      notes:           r.notes,
      createdAt:       r.createdAt,
    }));

    return res.json(paginatedOk(data, Number(countRes[0]?.count || 0), page, limit));
  } catch (err: any) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to list time events.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/v1/expense-events
//
// Submit an expense record for a driver. Immutably stored in v1_expense_events.
//
// Required: driver_id, expense_type, amount, expense_date
// Optional: trip_id, account_id, category, currency, description, receipt_url, rebillable
// Header:   Idempotency-Key (strongly recommended)
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/expense-events', requireScope('write:expenses'), async (req: Request, res: Response) => {
  // Accept X-Idempotency-Key (new contract) or Idempotency-Key (legacy)
  const idemKey = (req.headers['x-idempotency-key'] as string)
    || (req.headers['idempotency-key'] as string)
    || undefined;
  const orgId = req.v1ApiKey?.orgId ?? null;

  try {
    if (idemKey) {
      const cached = await checkIdempotencyKey(idemKey, orgId);
      if (cached) return res.status(cached.statusCode).json(cached.response);
    }

    // ── Field resolution: accept new camelCase OR legacy snake_case ─────────
    const rawDriverId   = req.body.driverId     || req.body.driver_id;
    const rawMoveId     = req.body.moveId       || req.body.trip_id;
    const rawAccountId  = req.body.accountId    || req.body.account_id   || null;
    const rawExpType    = req.body.expenseType  || req.body.expense_type;
    const rawAmount     = req.body.amount;
    const rawCurrency   = req.body.currency     || 'USD';
    const rawExpDate    = req.body.expenseDate  || req.body.expense_date;
    const rawRebillable = req.body.rebillable   ?? false;
    // `notes` is the new contract name; `description` is the legacy name
    const notes         = req.body.notes        || req.body.description  || null;
    const category      = req.body.category     || null;
    const receiptUrl    = req.body.receiptUrl   || req.body.receipt_url  || null;

    // ── Required field validation ─────────────────────────────────────────
    if (!rawDriverId) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELD', message: '`driverId` is required.' } });
    }
    if (!rawExpType) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELD', message: '`expenseType` is required.' } });
    }
    if (rawAmount === undefined || rawAmount === null) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELD', message: '`amount` is required.' } });
    }
    if (!rawExpDate) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELD', message: '`expenseDate` is required.' } });
    }

    // ── expenseType normalisation: contract aliases → canonical DB value ──
    // e.g. "toll" → "tolls", "wait-time" → "wait_time"
    const EXPENSE_TYPE_ALIASES: Record<string, string> = {
      toll:      'tolls',
      'wait-time': 'wait_time',
    };
    const expenseTypeRaw = String(rawExpType).toLowerCase().replace(/-/g, '_');
    const expense_type   = EXPENSE_TYPE_ALIASES[expenseTypeRaw] ?? expenseTypeRaw;

    if (!(EXPENSE_TYPES as readonly string[]).includes(expense_type)) {
      return res.status(400).json({
        success: false,
        error: {
          code:              'INVALID_EXPENSE_TYPE',
          message:           `'${rawExpType}' is not a valid expenseType.`,
          validExpenseTypes: [...EXPENSE_TYPES, 'toll'],  // show both canonical and alias
        },
      });
    }

    // ── Amount validation ─────────────────────────────────────────────────
    const parsedAmount = parseFloat(String(rawAmount));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_AMOUNT', message: '`amount` must be a positive number.' } });
    }
    if (parsedAmount > 50_000) {
      return res.status(400).json({
        success: false,
        error: { code: 'AMOUNT_EXCEEDS_LIMIT', message: 'Individual expense cannot exceed $50,000. Contact your admin for high-value expenses.', limit: 50000 },
      });
    }

    // ── expenseDate validation (YYYY-MM-DD) ───────────────────────────────
    const expDateParsed = new Date(rawExpDate);
    if (isNaN(expDateParsed.getTime())) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_DATE', message: '`expenseDate` must be a valid date (YYYY-MM-DD).' } });
    }
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    if (expDateParsed > tomorrow) {
      return res.status(400).json({ success: false, error: { code: 'FUTURE_DATE', message: '`expenseDate` cannot be more than 1 day in the future.' } });
    }

    // ── Driver resolution: UUID or driver number ──────────────────────────
    const resolvedDriver = await resolveDriver(String(rawDriverId));
    if (!resolvedDriver) {
      return res.status(404).json({ success: false, error: { code: 'DRIVER_NOT_FOUND', message: `Driver '${rawDriverId}' not found.` } });
    }
    const driver_id = resolvedDriver.id;

    // ── Move resolution (optional): UUID or move number ───────────────────
    let trip_id: string | null = null;
    if (rawMoveId) {
      const resolvedMove = await resolveMove(String(rawMoveId));
      if (!resolvedMove) {
        return res.status(404).json({ success: false, error: { code: 'MOVE_NOT_FOUND', message: `Move '${rawMoveId}' not found.` } });
      }
      trip_id = resolvedMove.id;
    }

    // ── Account validation (if provided) ─────────────────────────────────
    if (rawAccountId) {
      const [acct] = await db
        .select({ id: customers.id, status: customers.status })
        .from(customers)
        .where(eq(customers.id, rawAccountId))
        .limit(1);
      if (!acct) {
        return res.status(404).json({ success: false, error: { code: 'ACCOUNT_NOT_FOUND', message: `Account '${rawAccountId}' not found.` } });
      }
    }

    // ── Insert expense event ──────────────────────────────────────────────
    const [expEvent] = await db
      .insert(v1ExpenseEvents)
      .values({
        idempotencyKey: idemKey,
        apiKeyId:       req.v1ApiKey?.apiKeyId,
        orgId,
        driverId:       driver_id,
        tripId:         trip_id,
        accountId:      rawAccountId,
        expenseType:    expense_type,
        category:       category,
        amount:         String(parsedAmount.toFixed(2)),
        currency:       String(rawCurrency).toUpperCase(),
        description:    notes,
        expenseDate:    String(rawExpDate),
        receiptUrl:     receiptUrl,
        rebillable:     Boolean(rawRebillable),
        approvalStatus: 'pending',
      })
      .returning();

    await auditWrite(req, 'CREATE_EXPENSE_EVENT', 'expense_event', expEvent.id, 201);

    if (orgId) {
      dispatchWebhook(orgId, 'expense.created' as any, {
        expenseEventId: expEvent.id,
        driverId:       driver_id,
        moveId:         trip_id,
        expenseType:    expense_type,
        amount:         parsedAmount,
        currency:       String(rawCurrency).toUpperCase(),
        rebillable:     Boolean(rawRebillable),
      }).catch(() => {});
    }

    // ── Contract-compliant response ───────────────────────────────────────
    const response = {
      success: true,
      data: {
        expenseEventId: expEvent.id,
        status:         'recorded',
        createdAt:      expEvent.createdAt instanceof Date
          ? expEvent.createdAt.toISOString()
          : (expEvent.createdAt ?? new Date().toISOString()),
      },
    };

    await saveIdempotencyKey(idemKey, orgId, 201, response);
    return res.status(201).json(response);
  } catch (err: any) {
    console.error('[v1] POST /expense-events error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to record expense event.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/v1/expense-events
//
// List expense events. Filterable by driver_id, trip_id, expense_type, approval_status.
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/expense-events', requireScope('read:expenses'), async (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = paginate(req.query);
    const { driver_id, trip_id, expense_type, approval_status, from_date, to_date } =
      req.query as Record<string, string>;

    const conditions: any[] = [eq(v1ExpenseEvents.isVoided, false)];
    if (driver_id)       conditions.push(eq(v1ExpenseEvents.driverId, driver_id));
    if (trip_id)         conditions.push(eq(v1ExpenseEvents.tripId, trip_id));
    if (expense_type)    conditions.push(eq(v1ExpenseEvents.expenseType, expense_type));
    if (approval_status) conditions.push(eq(v1ExpenseEvents.approvalStatus, approval_status));
    if (from_date)       conditions.push(sql`${v1ExpenseEvents.expenseDate} >= ${from_date}::date`);
    if (to_date)         conditions.push(sql`${v1ExpenseEvents.expenseDate} <= ${to_date}::date`);

    const [rows, countRes] = await Promise.all([
      db.select().from(v1ExpenseEvents).where(and(...conditions))
        .orderBy(desc(v1ExpenseEvents.expenseDate)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(v1ExpenseEvents).where(and(...conditions)),
    ]);

    // DTO spec (Section 13): camelCase, trip_id → moveId, description → notes,
    // expense_type → expenseType, expense_date → expenseDate, receipt_url → receiptUrl
    const data = rows.map(r => ({
      id:             r.id,
      driverId:       r.driverId,
      moveId:         r.tripId,
      accountId:      r.accountId,
      expenseType:    r.expenseType,
      category:       r.category,
      amount:         r.amount,
      currency:       r.currency,
      notes:          r.description,
      expenseDate:    r.expenseDate,
      receiptUrl:     r.receiptUrl,
      rebillable:     r.rebillable,
      approvalStatus: r.approvalStatus,
      expenseId:      r.expenseId,
      createdAt:      r.createdAt,
    }));

    return res.json(paginatedOk(data, Number(countRes[0]?.count || 0), page, limit));
  } catch (err: any) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to list expense events.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/v1/invoices
//
// Read-only financial sync — list invoices visible to the API caller.
// Supports filtering by status, customer_id, account_id, date range, and search.
// Scope: read:invoices
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/invoices', requireScope('read:invoices'), async (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = paginate(req.query);
    const qp = req.query as Record<string, string>;

    // New contract params (camelCase) with legacy fallbacks
    const rawAccountId = qp.accountId || qp.account_id || qp.customer_id;
    const rawStatus    = qp.status;
    const rawDateFrom  = qp.dateFrom  || qp.from_date;
    const rawDateTo    = qp.dateTo    || qp.to_date;

    // Resolve accountId → internal customerId UUID
    // Accepts: UUID | DH-AC-{customerNumber} | bare customerNumber
    let resolvedCustomerId: string | null = null;
    if (rawAccountId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawAccountId);
      if (isUuid) {
        // Verify the customer exists
        const [cRow] = await db.select({ id: customers.id })
          .from(customers).where(eq(customers.id, rawAccountId)).limit(1);
        if (!cRow) {
          return res.status(404).json({
            success: false,
            error: { code: 'ACCOUNT_NOT_FOUND', message: `Account '${rawAccountId}' not found.` },
          });
        }
        resolvedCustomerId = cRow.id;
      } else {
        // Strip DH-AC- prefix and look up by customerNumber
        const num = rawAccountId.replace(/^dh-ac-/i, '').trim();
        const [cRow] = await db.select({ id: customers.id })
          .from(customers).where(eq(customers.customerNumber, num)).limit(1);
        if (!cRow) {
          return res.status(404).json({
            success: false,
            error: { code: 'ACCOUNT_NOT_FOUND', message: `Account '${rawAccountId}' not found.` },
          });
        }
        resolvedCustomerId = cRow.id;
      }
    }

    // Build WHERE conditions
    const conditions: any[] = [];
    if (resolvedCustomerId) conditions.push(eq(invoices.customerId, resolvedCustomerId));
    if (rawStatus)          conditions.push(eq(invoices.status, rawStatus));
    if (rawDateFrom)        conditions.push(sql`${invoices.invoiceDate} >= ${rawDateFrom}::date`);
    if (rawDateTo)          conditions.push(sql`${invoices.invoiceDate} <= ${rawDateTo}::date`);

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [rows, countRes] = await Promise.all([
      db.select({
        invoiceId:      invoices.id,
        invoiceNumber:  invoices.invoiceNumber,
        customerId:     invoices.customerId,
        customerName:   invoices.customerName,
        customerNumber: customers.customerNumber,
        invoiceDate:    invoices.invoiceDate,
        dueDate:        invoices.dueDate,
        totalAmount:    invoices.totalAmount,
        currency:       invoices.currency,
        status:         invoices.status,
      })
        .from(invoices)
        .leftJoin(customers, eq(invoices.customerId, customers.id))
        .where(whereClause)
        .orderBy(desc(invoices.invoiceDate))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` })
        .from(invoices)
        .leftJoin(customers, eq(invoices.customerId, customers.id))
        .where(whereClause),
    ]);

    // Shape the response — 8 contract fields only
    const data = rows.map(r => ({
      invoiceId:   r.invoiceId,
      accountId:   r.customerNumber
        ? `DH-AC-${r.customerNumber}`
        : (r.customerId ?? null),
      accountName: r.customerName,
      status:      r.status,
      invoiceDate: r.invoiceDate,
      dueDate:     r.dueDate,
      amount:      Number(r.totalAmount ?? 0),
      currency:    r.currency ?? 'USD',
    }));

    return res.json(paginatedOk(data, Number(countRes[0]?.count || 0), page, limit));
  } catch (err: any) {
    console.error('[v1] GET /invoices error:', err);
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch invoices.' } });
  }
});

// ─── GET /api/v1/invoices/:id ─────────────────────────────────────────────────
router.get('/invoices/:id', requireScope('read:invoices'), async (req: Request, res: Response) => {
  try {
    const [row] = await db.select().from(invoices).where(eq(invoices.id, req.params.id)).limit(1);
    if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'Invoice not found.' });
    return res.json({ success: true, data: row });
  } catch (err: any) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch invoice.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/v1/payments
//
// Read-only financial sync — list payments.
// Supports filtering by status, customer_id, payment_method, date range.
// Scope: read:payments
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/payments', requireScope('read:payments'), async (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = paginate(req.query);

    // New contract query params (camelCase) with legacy fallbacks
    const qp = req.query as Record<string, string>;
    const rawDriverId  = qp.driverId  || qp.driver_id;
    const rawStatus    = qp.status;
    const rawDateFrom  = qp.dateFrom  || qp.from_date;
    const rawDateTo    = qp.dateTo    || qp.to_date;

    // Resolve driverId (UUID or driver number → UUID)
    let resolvedDriverId: string | null = null;
    if (rawDriverId) {
      const driverRow = await resolveDriver(rawDriverId);
      if (!driverRow) {
        return res.status(404).json({
          success: false,
          error: { code: 'DRIVER_NOT_FOUND', message: `Driver '${rawDriverId}' not found.` },
        });
      }
      resolvedDriverId = driverRow.id;
    }

    // Map contract status → payPeriods.status (pay_period_status enum)
    const STATUS_MAP: Record<string, string> = {
      paid:       'LOCKED',
      processing: 'PROCESSING',
      pending:    'OPEN',
    };
    const periodStatus = rawStatus ? STATUS_MAP[rawStatus.toLowerCase()] : undefined;

    // Build WHERE conditions against pay_lines + pay_periods
    const conditions: any[] = [];
    if (resolvedDriverId) conditions.push(eq(payLines.driverId, resolvedDriverId));
    if (periodStatus)     conditions.push(eq(payPeriods.status, periodStatus as any));
    if (rawDateFrom)      conditions.push(sql`${payPeriods.periodEnd} >= ${rawDateFrom}::date`);
    if (rawDateTo)        conditions.push(sql`${payPeriods.periodEnd} <= ${rawDateTo}::date`);

    const whereClause = conditions.length ? and(...conditions) : undefined;

    // Aggregate payLines per driver per pay period
    const baseQuery = db
      .select({
        paymentId: sql<string>`md5(${payLines.driverId} || ${payLines.payPeriodId})`,
        driverId:  payLines.driverId,
        driverExternalId: sql<string>`concat('DH-DR-', ${drivers.driverNumber}::text)`,
        driverName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
        periodStatus: payPeriods.status,
        paymentDate:  payPeriods.periodEnd,
        totalCents:   sql<number>`sum(${payLines.finalPayCents})`,
        referenceNumber: sql<string>`concat('PMT-', upper(substring(${payPeriods.id}::text, 1, 8)))`,
        periodId:    payPeriods.id,
      })
      .from(payLines)
      .innerJoin(payPeriods, eq(payLines.payPeriodId, payPeriods.id))
      .innerJoin(drivers,   eq(payLines.driverId, drivers.id))
      .innerJoin(users,     eq(drivers.userId, users.id))
      .where(whereClause)
      .groupBy(
        payLines.driverId,
        payLines.payPeriodId,
        payPeriods.id,
        payPeriods.status,
        payPeriods.periodEnd,
        drivers.driverNumber,
        users.firstName,
        users.lastName,
      )
      .orderBy(desc(payPeriods.periodEnd));

    // Count distinct groups for pagination
    const countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(
        db
          .select({ _: sql`1` })
          .from(payLines)
          .innerJoin(payPeriods, eq(payLines.payPeriodId, payPeriods.id))
          .innerJoin(drivers,   eq(payLines.driverId, drivers.id))
          .innerJoin(users,     eq(drivers.userId, users.id))
          .where(whereClause)
          .groupBy(payLines.driverId, payLines.payPeriodId)
          .as('grp')
      );

    const [rows, countRes] = await Promise.all([
      baseQuery.limit(limit).offset(offset),
      countQuery,
    ]);

    // Map payPeriod status → contract status
    const CONTRACT_STATUS: Record<string, string> = {
      LOCKED:     'paid',
      PROCESSING: 'processing',
      OPEN:       'pending',
    };

    const data = rows.map(r => ({
      paymentId:       r.paymentId,
      driverId:        r.driverExternalId,
      driverName:      r.driverName,
      status:          CONTRACT_STATUS[r.periodStatus as string] ?? 'pending',
      paymentDate:     r.paymentDate,
      amount:          Math.round(Number(r.totalCents ?? 0)) / 100,
      currency:        'USD',
      referenceNumber: r.referenceNumber,
    }));

    return res.json(paginatedOk(data, Number(countRes[0]?.count || 0), page, limit));
  } catch (err: any) {
    console.error('[v1] GET /payments error:', err);
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch payments.' } });
  }
});

// ─── GET /api/v1/payments/:id ─────────────────────────────────────────────────
router.get('/payments/:id', requireScope('read:payments'), async (req: Request, res: Response) => {
  try {
    const [row] = await db.select().from(payments).where(eq(payments.id, req.params.id)).limit(1);
    if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'Payment not found.' });
    return res.json({ success: true, data: row });
  } catch (err: any) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch payment.' });
  }
});

export default router;
