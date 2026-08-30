import { Router, Request, Response } from 'express';
import { db, pool } from '../db';
import { trips, drivers, users, customers, moveOfferAudit } from '@shared/schema';
import { eq, and, or, isNull, lte, sql } from 'drizzle-orm';
import { resolveDriverForUser, getDriverIdForUser, NotADriverError } from '../utils/driverResolution';

const router = Router();

// Valid assignment state transitions
const ASSIGNMENT_STATES = ['UNASSIGNED', 'OFFERED', 'ASSIGNED', 'REASSIGNING', 'CANCELLED'] as const;
type AssignmentState = typeof ASSIGNMENT_STATES[number];

// Valid execution state transitions
const EXECUTION_STATES = ['READY', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'EN_ROUTE_DESTINATION', 'AT_DESTINATION', 'COMPLETED', 'CANCELLED'] as const;
type ExecutionState = typeof EXECUTION_STATES[number];

// Valid decline reason codes
const DECLINE_REASON_CODES = ['SCHEDULE_CONFLICT', 'TOO_FAR', 'PAY_TOO_LOW', 'VEHICLE_ISSUE', 'OTHER'] as const;

// Valid execution state transitions (only forward movement allowed)
const EXECUTION_STATE_TRANSITIONS: Record<ExecutionState, ExecutionState[]> = {
  'READY': ['EN_ROUTE_PICKUP', 'CANCELLED'],
  'EN_ROUTE_PICKUP': ['AT_PICKUP', 'CANCELLED'],
  'AT_PICKUP': ['EN_ROUTE_DESTINATION', 'CANCELLED'],
  'EN_ROUTE_DESTINATION': ['AT_DESTINATION', 'CANCELLED'],
  'AT_DESTINATION': ['COMPLETED', 'CANCELLED'],
  'COMPLETED': [], // Terminal state
  'CANCELLED': [], // Terminal state
};

// Helper: Get current server time
function getServerTime(): string {
  return new Date().toISOString();
}

// Helper: Calculate TTL seconds remaining
function getTtlSecondsRemaining(offerExpiresAt: Date | string | null): number | null {
  if (!offerExpiresAt) return null;
  const expiresAt = new Date(offerExpiresAt);
  const now = new Date();
  const seconds = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
  return Math.max(0, seconds);
}

// Helper: Check and enforce TTL for a move
async function enforceOfferTtl(moveId: string): Promise<boolean> {
  const move = await db.select().from(trips).where(eq(trips.id, moveId)).limit(1);
  
  if (!move.length) return false;
  
  const m = move[0];
  
  // Check if offer has expired
  if (m.assignmentState === 'OFFERED' && m.offerExpiresAt) {
    const now = new Date();
    const expiresAt = new Date(m.offerExpiresAt);
    
    if (expiresAt < now) {
      // Auto-revert to UNASSIGNED
      await db.update(trips)
        .set({
          assignmentState: 'UNASSIGNED',
          offeredToDriverId: null,
          offerExpiresAt: null,
          offeredAt: null,
          updatedAt: new Date(),
        })
        .where(eq(trips.id, moveId));
      
      // Write audit event
      await db.insert(moveOfferAudit).values({
        moveId: moveId,
        eventType: 'OFFER_EXPIRED',
        driverId: m.offeredToDriverId,
        oldState: 'OFFERED',
        newState: 'UNASSIGNED',
        metadata: { 
          expired_at: expiresAt.toISOString(),
          detected_at: now.toISOString() 
        },
      });
      
      return true; // TTL was enforced
    }
  }
  
  return false; // No TTL enforcement needed
}

// Note: getDriverIdForUser and resolveDriverForUser are imported from utils/driverResolution

// Helper: Build move payload with pay estimate
function buildMovePayload(move: any, serverTime: string) {
  // Parse JSON fields
  let waitTimeRules = null;
  let payEstimateBreakdown = null;
  
  try {
    if (move.waitTimeRulesJson) waitTimeRules = JSON.parse(move.waitTimeRulesJson);
  } catch (e) { /* ignore parse errors */ }
  
  try {
    if (move.payEstimateBreakdownJson) payEstimateBreakdown = JSON.parse(move.payEstimateBreakdownJson);
  } catch (e) { /* ignore parse errors */ }
  
  return {
    move_id: move.id,
    move_number: move.moveNumber,
    assignment_state: move.assignmentState || 'UNASSIGNED',
    execution_state: move.executionState || 'READY',
    offer_expires_at: move.offerExpiresAt?.toISOString() || null,
    server_time: serverTime,
    ttl_seconds_remaining: getTtlSecondsRemaining(move.offerExpiresAt),
    
    market_code: move.marketId,
    zone_code: move.zoneId,
    
    service_datetime: move.tripDate?.toISOString(),
    estimated_minutes_snapshot: move.estimatedMinutes,
    
    pay_estimate: move.payEstimateTotal ? {
      currency: move.payEstimateCurrency || 'USD',
      estimated_total: parseFloat(move.payEstimateTotal),
      rate_basis: move.payEstimateRateBasis,
      breakdown: payEstimateBreakdown,
    } : null,
    
    origin: {
      address: move.origin,
      lat: move.originLat ? parseFloat(move.originLat) : null,
      lng: move.originLng ? parseFloat(move.originLng) : null,
    },
    destination: {
      address: move.destination,
      lat: move.destinationLat ? parseFloat(move.destinationLat) : null,
      lng: move.destinationLng ? parseFloat(move.destinationLng) : null,
    },
    
    return_to_origin_required: move.returnToOriginRequired || false,
    wait_time_rules: waitTimeRules,
    
    customer_name: move.customerName || null,
    instructions: move.customerInstructions || move.notes,
  };
}

// Middleware: Ensure user is authenticated
function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  next();
}

// Helper: Get user ID from request (handles OIDC claims structure)
function getUserId(req: Request): string | null {
  const user = req.user as any;
  // OIDC claims structure: user.claims.sub
  if (user?.claims?.sub) {
    return user.claims.sub;
  }
  // Direct ID property
  if (user?.id) {
    return user.id;
  }
  return null;
}

// GET /api/v1/me - Get current user info
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const user = req.user as any;
    
    res.json({
      user_id: userId,
      email: user?.claims?.email || user?.email,
      first_name: user?.claims?.first_name || user?.firstName,
      last_name: user?.claims?.last_name || user?.lastName,
      role: user?.role,
      server_time: getServerTime(),
    });
  } catch (error) {
    console.error('[API v1] GET /me error:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch user info' });
  }
});

// GET /api/v1/drivers/me - Get current driver profile
router.get('/drivers/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User ID not found' });
    }
    const driverId = await getDriverIdForUser(userId);
    
    if (!driverId) {
      return res.status(404).json({ error: 'NOT_A_DRIVER', message: 'No driver profile found for this user' });
    }
    
    const driverRows = await db.select()
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    
    if (!driverRows.length) {
      return res.status(404).json({ error: 'DRIVER_NOT_FOUND', message: 'Driver profile not found' });
    }
    
    const driver = driverRows[0];
    
    res.json({
      driver_id: driver.id,
      driver_number: driver.driverNumber,
      safety_state: driver.safetyState || 'ACTIVE',
      driver_type: driver.driverType,
      driver_classification: driver.driverClassification,
      market: driver.market,
      status: driver.status,
      server_time: getServerTime(),
    });
  } catch (error) {
    console.error('[API v1] GET /drivers/me error:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch driver info' });
  }
});

// GET /api/v1/moves/assigned - Get OFFERED + ASSIGNED moves for this driver
router.get('/moves/assigned', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User ID not found' });
    }
    const driverId = await getDriverIdForUser(userId);
    
    if (!driverId) {
      return res.status(404).json({ error: 'NOT_A_DRIVER', message: 'No driver profile found for this user' });
    }
    
    const serverTime = getServerTime();
    
    // Get moves where this driver is assigned OR offered
    const assignedMoves = await db.select({
      id: trips.id,
      moveNumber: trips.moveNumber,
      assignmentState: trips.assignmentState,
      executionState: trips.executionState,
      offerExpiresAt: trips.offerExpiresAt,
      offeredAt: trips.offeredAt,
      acceptedAt: trips.acceptedAt,
      tripDate: trips.tripDate,
      origin: trips.origin,
      destination: trips.destination,
      originLat: trips.originLat,
      originLng: trips.originLng,
      destinationLat: trips.destinationLat,
      destinationLng: trips.destinationLng,
      marketId: trips.marketId,
      zoneId: trips.zoneId,
      estimatedMinutes: trips.estimatedMinutes,
      returnToOriginRequired: trips.returnToOriginRequired,
      waitTimeRulesJson: trips.waitTimeRulesJson,
      customerInstructions: trips.customerInstructions,
      notes: trips.notes,
      payEstimateCurrency: trips.payEstimateCurrency,
      payEstimateTotal: trips.payEstimateTotal,
      payEstimateRateBasis: trips.payEstimateRateBasis,
      payEstimateBreakdownJson: trips.payEstimateBreakdownJson,
      customerName: customers.customerName,
    })
    .from(trips)
    .leftJoin(customers, eq(trips.customerId, customers.id))
    .where(
      and(
        or(
          and(eq(trips.assignmentState, 'ASSIGNED'), eq(trips.driverId, driverId)),
          and(eq(trips.assignmentState, 'OFFERED'), eq(trips.offeredToDriverId, driverId))
        ),
        // Exclude completed/cancelled
        or(
          isNull(trips.executionState),
          sql`${trips.executionState} NOT IN ('COMPLETED', 'CANCELLED')`
        )
      )
    );
    
    // Check TTL for each move and filter out expired ones
    const validMoves = [];
    for (const move of assignedMoves) {
      const wasExpired = await enforceOfferTtl(move.id);
      if (!wasExpired) {
        validMoves.push(buildMovePayload(move, serverTime));
      }
    }
    
    res.json({
      moves: validMoves,
      count: validMoves.length,
      server_time: serverTime,
    });
  } catch (error) {
    console.error('[API v1] GET /moves/assigned error:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch assigned moves' });
  }
});

// GET /api/v1/moves/queue - Get claimable UNASSIGNED READY moves filtered by zone
router.get('/moves/queue', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User ID not found' });
    }
    const driverId = await getDriverIdForUser(userId);
    
    if (!driverId) {
      return res.status(404).json({ error: 'NOT_A_DRIVER', message: 'No driver profile found for this user' });
    }
    
    const { zone, market } = req.query;
    const serverTime = getServerTime();
    
    // Get driver to check eligibility
    const driverRows = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    if (!driverRows.length) {
      return res.status(404).json({ error: 'DRIVER_NOT_FOUND', message: 'Driver not found' });
    }
    const driver = driverRows[0];
    
    // Check driver is eligible to work
    if (driver.safetyState && driver.safetyState !== 'ACTIVE') {
      return res.status(403).json({ 
        error: 'DRIVER_NOT_ELIGIBLE', 
        message: `Driver safety state is ${driver.safetyState}`,
        safety_state: driver.safetyState 
      });
    }
    
    // Build query conditions
    let conditions = and(
      eq(trips.assignmentState, 'UNASSIGNED'),
      or(
        isNull(trips.executionState),
        eq(trips.executionState, 'READY')
      ),
      eq(trips.eligibilityStatus, 'PASS')
    );
    
    // Add zone filter if provided
    if (zone) {
      conditions = and(conditions, eq(trips.zoneId, zone as string));
    }
    
    // Add market filter if provided
    if (market) {
      conditions = and(conditions, eq(trips.marketId, market as string));
    }
    
    // Get available moves
    const availableMoves = await db.select({
      id: trips.id,
      moveNumber: trips.moveNumber,
      assignmentState: trips.assignmentState,
      executionState: trips.executionState,
      offerExpiresAt: trips.offerExpiresAt,
      tripDate: trips.tripDate,
      origin: trips.origin,
      destination: trips.destination,
      originLat: trips.originLat,
      originLng: trips.originLng,
      destinationLat: trips.destinationLat,
      destinationLng: trips.destinationLng,
      marketId: trips.marketId,
      zoneId: trips.zoneId,
      estimatedMinutes: trips.estimatedMinutes,
      returnToOriginRequired: trips.returnToOriginRequired,
      waitTimeRulesJson: trips.waitTimeRulesJson,
      customerInstructions: trips.customerInstructions,
      notes: trips.notes,
      payEstimateCurrency: trips.payEstimateCurrency,
      payEstimateTotal: trips.payEstimateTotal,
      payEstimateRateBasis: trips.payEstimateRateBasis,
      payEstimateBreakdownJson: trips.payEstimateBreakdownJson,
      workType: trips.workType,
      executionMode: trips.executionMode,
      customerName: customers.customerName,
    })
    .from(trips)
    .leftJoin(customers, eq(trips.customerId, customers.id))
    .where(conditions)
    .limit(50);
    
    // All PASS-eligible moves are available (eligibility already filtered in query)
    const movesPayload = availableMoves.map(move => buildMovePayload(move, serverTime));
    
    res.json({
      moves: movesPayload,
      count: movesPayload.length,
      filters: { zone: zone || null, market: market || null },
      server_time: serverTime,
    });
  } catch (error) {
    console.error('[API v1] GET /moves/queue error:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch move queue' });
  }
});

// POST /api/v1/moves/:id/accept - Accept an offered move
router.post('/moves/:id/accept', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User ID not found' });
    }
    const { id: moveId } = req.params;
    const driverId = await getDriverIdForUser(userId);
    
    if (!driverId) {
      return res.status(404).json({ error: 'NOT_A_DRIVER', message: 'No driver profile found for this user' });
    }
    
    // Check TTL first
    const wasExpired = await enforceOfferTtl(moveId);
    if (wasExpired) {
      return res.status(410).json({ 
        error: 'OFFER_EXPIRED', 
        message: 'This offer has expired and is no longer available' 
      });
    }
    
    // Get the move
    const moveRows = await db.select().from(trips).where(eq(trips.id, moveId)).limit(1);
    if (!moveRows.length) {
      return res.status(404).json({ error: 'MOVE_NOT_FOUND', message: 'Move not found' });
    }
    
    const move = moveRows[0];
    
    // Validate the move is offered to this driver
    if (move.assignmentState !== 'OFFERED') {
      return res.status(409).json({ 
        error: 'INVALID_STATE', 
        message: `Move is in ${move.assignmentState} state, not OFFERED`,
        current_state: move.assignmentState
      });
    }
    
    if (move.offeredToDriverId !== driverId) {
      return res.status(403).json({ 
        error: 'NOT_OFFERED_TO_YOU', 
        message: 'This move is not offered to you' 
      });
    }
    
    // Accept the offer
    const acceptedAt = new Date();
    await db.update(trips)
      .set({
        assignmentState: 'ASSIGNED',
        driverId: driverId,
        acceptedAt: acceptedAt,
        offeredToDriverId: null,
        offerExpiresAt: null,
        updatedAt: acceptedAt,
      })
      .where(eq(trips.id, moveId));
    
    // Write audit event
    await db.insert(moveOfferAudit).values({
      moveId: moveId,
      eventType: 'ACCEPTED',
      driverId: driverId,
      actorUserId: user.id,
      oldState: 'OFFERED',
      newState: 'ASSIGNED',
    });
    
    res.json({
      success: true,
      move_id: moveId,
      assignment_state: 'ASSIGNED',
      accepted_at: acceptedAt.toISOString(),
      server_time: getServerTime(),
    });
  } catch (error) {
    console.error('[API v1] POST /moves/:id/accept error:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to accept move' });
  }
});

// POST /api/v1/moves/:id/decline - Decline an offered move
router.post('/moves/:id/decline', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User ID not found' });
    }
    const { id: moveId } = req.params;
    const { reason_code, note } = req.body;
    const driverId = await getDriverIdForUser(userId);
    
    if (!driverId) {
      return res.status(404).json({ error: 'NOT_A_DRIVER', message: 'No driver profile found for this user' });
    }
    
    // Validate reason_code is provided
    if (!reason_code) {
      return res.status(400).json({ 
        error: 'REASON_REQUIRED', 
        message: 'reason_code is required',
        valid_codes: DECLINE_REASON_CODES
      });
    }
    
    if (!DECLINE_REASON_CODES.includes(reason_code)) {
      return res.status(400).json({ 
        error: 'INVALID_REASON_CODE', 
        message: `Invalid reason_code. Must be one of: ${DECLINE_REASON_CODES.join(', ')}`,
        valid_codes: DECLINE_REASON_CODES
      });
    }
    
    // Get the move (TTL check will revert if expired, but we still let driver decline)
    await enforceOfferTtl(moveId);
    
    const moveRows = await db.select().from(trips).where(eq(trips.id, moveId)).limit(1);
    if (!moveRows.length) {
      return res.status(404).json({ error: 'MOVE_NOT_FOUND', message: 'Move not found' });
    }
    
    const move = moveRows[0];
    
    // If already unassigned (expired), just return success
    if (move.assignmentState === 'UNASSIGNED') {
      return res.json({
        success: true,
        move_id: moveId,
        assignment_state: 'UNASSIGNED',
        message: 'Move already returned to queue (may have expired)',
        server_time: getServerTime(),
      });
    }
    
    // Validate the move is offered to this driver
    if (move.assignmentState !== 'OFFERED') {
      return res.status(409).json({ 
        error: 'INVALID_STATE', 
        message: `Move is in ${move.assignmentState} state, not OFFERED`,
        current_state: move.assignmentState
      });
    }
    
    if (move.offeredToDriverId !== driverId) {
      return res.status(403).json({ 
        error: 'NOT_OFFERED_TO_YOU', 
        message: 'This move is not offered to you' 
      });
    }
    
    // Decline the offer - return to UNASSIGNED
    const declinedAt = new Date();
    await db.update(trips)
      .set({
        assignmentState: 'UNASSIGNED',
        offeredToDriverId: null,
        offerExpiresAt: null,
        offeredAt: null,
        declinedAt: declinedAt,
        declineReasonCode: reason_code,
        declineNote: note || null,
        updatedAt: declinedAt,
      })
      .where(eq(trips.id, moveId));
    
    // Write audit event
    await db.insert(moveOfferAudit).values({
      moveId: moveId,
      eventType: 'DECLINED',
      driverId: driverId,
      actorUserId: user.id,
      oldState: 'OFFERED',
      newState: 'UNASSIGNED',
      reasonCode: reason_code,
      note: note || null,
    });
    
    res.json({
      success: true,
      move_id: moveId,
      assignment_state: 'UNASSIGNED',
      declined_at: declinedAt.toISOString(),
      server_time: getServerTime(),
    });
  } catch (error) {
    console.error('[API v1] POST /moves/:id/decline error:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to decline move' });
  }
});

// POST /api/v1/moves/:id/status - Update execution status
router.post('/moves/:id/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User ID not found' });
    }
    const { id: moveId } = req.params;
    const { status } = req.body;
    const driverId = await getDriverIdForUser(userId);
    
    if (!driverId) {
      return res.status(404).json({ error: 'NOT_A_DRIVER', message: 'No driver profile found for this user' });
    }
    
    // Validate status is provided
    if (!status) {
      return res.status(400).json({ 
        error: 'STATUS_REQUIRED', 
        message: 'status is required',
        valid_statuses: EXECUTION_STATES
      });
    }
    
    if (!EXECUTION_STATES.includes(status as ExecutionState)) {
      return res.status(400).json({ 
        error: 'INVALID_STATUS', 
        message: `Invalid status. Must be one of: ${EXECUTION_STATES.join(', ')}`,
        valid_statuses: EXECUTION_STATES
      });
    }
    
    // Get the move
    const moveRows = await db.select().from(trips).where(eq(trips.id, moveId)).limit(1);
    if (!moveRows.length) {
      return res.status(404).json({ error: 'MOVE_NOT_FOUND', message: 'Move not found' });
    }
    
    const move = moveRows[0];
    
    // Validate the move is ASSIGNED to this driver
    if (move.assignmentState !== 'ASSIGNED') {
      return res.status(409).json({ 
        error: 'NOT_ASSIGNED', 
        message: `Move is in ${move.assignmentState} state, not ASSIGNED`,
        current_assignment_state: move.assignmentState
      });
    }
    
    if (move.driverId !== driverId) {
      return res.status(403).json({ 
        error: 'NOT_ASSIGNED_TO_YOU', 
        message: 'This move is not assigned to you' 
      });
    }
    
    const currentState = (move.executionState || 'READY') as ExecutionState;
    const newState = status as ExecutionState;
    
    // Validate state transition
    const allowedTransitions = EXECUTION_STATE_TRANSITIONS[currentState] || [];
    if (!allowedTransitions.includes(newState)) {
      return res.status(409).json({ 
        error: 'INVALID_TRANSITION', 
        message: `Cannot transition from ${currentState} to ${newState}`,
        current_state: currentState,
        allowed_transitions: allowedTransitions
      });
    }
    
    // Update execution state
    const updatedAt = new Date();
    await db.update(trips)
      .set({
        executionState: newState,
        status: newState === 'COMPLETED' ? 'completed' : (newState === 'CANCELLED' ? 'cancelled' : 'in-progress'),
        updatedAt: updatedAt,
      })
      .where(eq(trips.id, moveId));
    
    // Write audit event
    await db.insert(moveOfferAudit).values({
      moveId: moveId,
      eventType: 'STATUS_UPDATE',
      driverId: driverId,
      actorUserId: user.id,
      oldState: currentState,
      newState: newState,
    });
    
    res.json({
      success: true,
      move_id: moveId,
      execution_state: newState,
      previous_state: currentState,
      updated_at: updatedAt.toISOString(),
      server_time: getServerTime(),
    });
  } catch (error) {
    console.error('[API v1] POST /moves/:id/status error:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to update move status' });
  }
});

// ============================================
// DISPATCH ENDPOINTS (for corporate/dispatch users)
// ============================================

// POST /api/v1/dispatch/moves/:id/offer - Create offer for a move
router.post('/dispatch/moves/:id/offer', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
    }
    
    const moveId = req.params.id;
    const { driver_id, ttl_seconds } = req.body;
    
    // Validate required fields
    if (!driver_id) {
      return res.status(400).json({ 
        error: 'DRIVER_ID_REQUIRED', 
        message: 'driver_id is required' 
      });
    }
    
    // Default TTL is 5 minutes (300 seconds), max 30 minutes
    const ttl = Math.min(Math.max(ttl_seconds || 300, 60), 1800);
    
    // Verify the driver exists and is eligible
    const driverRows = await db.select().from(drivers).where(eq(drivers.id, driver_id)).limit(1);
    if (!driverRows.length) {
      return res.status(404).json({ 
        error: 'DRIVER_NOT_FOUND', 
        message: 'Driver not found' 
      });
    }
    
    const driver = driverRows[0];
    
    // Check driver safety state
    if (driver.safetyState && driver.safetyState !== 'ACTIVE') {
      return res.status(403).json({ 
        error: 'DRIVER_NOT_ELIGIBLE', 
        message: `Driver safety state is ${driver.safetyState}, cannot receive offers`,
        driver_safety_state: driver.safetyState
      });
    }
    
    // Get the move and enforce TTL first
    await enforceOfferTtl(moveId);
    
    const moveRows = await db.select().from(trips).where(eq(trips.id, moveId)).limit(1);
    if (!moveRows.length) {
      return res.status(404).json({ error: 'MOVE_NOT_FOUND', message: 'Move not found' });
    }
    
    const move = moveRows[0];
    
    // Validate move is UNASSIGNED
    if (move.assignmentState !== 'UNASSIGNED') {
      return res.status(409).json({ 
        error: 'MOVE_NOT_AVAILABLE', 
        message: `Move is in ${move.assignmentState} state, cannot create offer`,
        current_assignment_state: move.assignmentState
      });
    }
    
    // Calculate expiration time
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttl * 1000);
    
    // Update move to OFFERED state
    await db.update(trips)
      .set({
        assignmentState: 'OFFERED',
        offeredToDriverId: driver_id,
        offerExpiresAt: expiresAt,
        offeredAt: now,
        updatedAt: now,
      })
      .where(eq(trips.id, moveId));
    
    // Write audit event
    await db.insert(moveOfferAudit).values({
      moveId: moveId,
      eventType: 'OFFERED',
      driverId: driver_id,
      actorUserId: user.id,
      oldState: 'UNASSIGNED',
      newState: 'OFFERED',
      metadata: { 
        ttl_seconds: ttl,
        expires_at: expiresAt.toISOString(),
        offered_by: user.email || user.id
      },
    });
    
    res.json({
      success: true,
      move_id: moveId,
      driver_id: driver_id,
      assignment_state: 'OFFERED',
      offered_at: now.toISOString(),
      offer_expires_at: expiresAt.toISOString(),
      ttl_seconds: ttl,
      server_time: getServerTime(),
    });
  } catch (error) {
    console.error('[API v1] POST /dispatch/moves/:id/offer error:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to create offer' });
  }
});

// ============================================================
// SCHEDULING ENDPOINTS (driver-facing — session auth)
// Rule: DriverConnect never calls When I Work directly.
//       All data is served from DriverHub canonical tables.
// ============================================================

async function resolveDriverIdFromSession(req: Request): Promise<string | null> {
  try {
    return await getDriverIdForUser((req as any).user);
  } catch {
    return null;
  }
}

function paginationQ(req: Request) {
  const page     = Math.max(1, parseInt((req.query.page as string) || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt((req.query.page_size as string) || '25', 10)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

// GET /api/v1/scheduling/shifts — driver's own upcoming and recent shifts
router.get('/scheduling/shifts', requireAuth, async (req: Request, res: Response) => {
  try {
    const driverId = await resolveDriverIdFromSession(req);
    if (!driverId) {
      return res.status(403).json({ error: 'NOT_A_DRIVER', message: 'Authenticated user is not linked to a driver record.' });
    }

    const { page, pageSize, offset } = paginationQ(req);
    const start  = (req.query.start  as string) || '';
    const end    = (req.query.end    as string) || '';
    const status = (req.query.status as string) || '';

    const conditions = [`u.driver_id = $1`];
    const params: any[] = [driverId];
    let pi = 2;

    if (status) { conditions.push(`s.status = $${pi++}`);    params.push(status); }
    if (start)  { conditions.push(`s.start_time >= $${pi++}`); params.push(start); }
    if (end)    { conditions.push(`s.start_time < ($${pi++}::date + interval '1 day')`); params.push(end); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [rowsQ, countQ] = await Promise.all([
      pool.query(`
        SELECT
          s.id              AS shift_id,
          s.external_shift_id,
          s.start_time,
          s.end_time,
          s.scheduled_minutes,
          s.status,
          s.is_open,
          s.notes,
          l.name            AS location_name,
          l.address         AS location_address,
          p.name            AS position_name
        FROM wiw_shifts s
        LEFT JOIN wiw_users     u ON u.id = s.wiw_user_id
        LEFT JOIN wiw_locations l ON l.id = s.wiw_location_id
        LEFT JOIN wiw_positions p ON p.id = s.wiw_position_id
        ${where}
        ORDER BY s.start_time ASC
        LIMIT $${pi} OFFSET $${pi + 1}
      `, [...params, pageSize, offset]),
      pool.query(
        `SELECT count(*)::int AS total FROM wiw_shifts s LEFT JOIN wiw_users u ON u.id = s.wiw_user_id ${where}`,
        params
      ),
    ]);

    const total = countQ.rows[0]?.total ?? 0;
    res.json({
      success: true,
      data: rowsQ.rows,
      meta: { page, pageSize, total, hasMore: page * pageSize < total },
    });
  } catch (err: any) {
    console.error('[DC driver] scheduling/shifts error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err?.message });
  }
});

// GET /api/v1/scheduling/times — driver's own approved clock-in/out records
router.get('/scheduling/times', requireAuth, async (req: Request, res: Response) => {
  try {
    const driverId = await resolveDriverIdFromSession(req);
    if (!driverId) {
      return res.status(403).json({ error: 'NOT_A_DRIVER', message: 'Authenticated user is not linked to a driver record.' });
    }

    const { page, pageSize, offset } = paginationQ(req);
    const start = (req.query.start as string) || '';
    const end   = (req.query.end   as string) || '';

    const conditions = [`u.driver_id = $1`, `t.approval_status = 'approved'`]; // APPROVED ONLY
    const params: any[] = [driverId];
    let pi = 2;

    if (start) { conditions.push(`t.clock_in >= $${pi++}`); params.push(start); }
    if (end)   { conditions.push(`t.clock_in < ($${pi++}::date + interval '1 day')`); params.push(end); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [rowsQ, countQ] = await Promise.all([
      pool.query(`
        SELECT
          t.id              AS time_id,
          t.external_time_id,
          t.clock_in,
          t.clock_out,
          t.total_minutes,
          t.auto_clock_out,
          t.notes,
          t.approved_at,
          s.start_time      AS shift_start,
          s.end_time        AS shift_end
        FROM wiw_times t
        LEFT JOIN wiw_users  u ON u.id = t.wiw_user_id
        LEFT JOIN wiw_shifts s ON s.id = t.wiw_shift_id
        ${where}
        ORDER BY t.clock_in DESC NULLS LAST
        LIMIT $${pi} OFFSET $${pi + 1}
      `, [...params, pageSize, offset]),
      pool.query(
        `SELECT count(*)::int AS total FROM wiw_times t LEFT JOIN wiw_users u ON u.id = t.wiw_user_id ${where}`,
        params
      ),
    ]);

    const total = countQ.rows[0]?.total ?? 0;
    res.json({
      success: true,
      data: rowsQ.rows,
      meta: { page, pageSize, total, hasMore: page * pageSize < total },
    });
  } catch (err: any) {
    console.error('[DC driver] scheduling/times error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err?.message });
  }
});

// GET /api/v1/scheduling/absences — driver's own absence records
router.get('/scheduling/absences', requireAuth, async (req: Request, res: Response) => {
  try {
    const driverId = await resolveDriverIdFromSession(req);
    if (!driverId) {
      return res.status(403).json({ error: 'NOT_A_DRIVER', message: 'Authenticated user is not linked to a driver record.' });
    }

    const { page, pageSize, offset } = paginationQ(req);
    const start  = (req.query.start  as string) || '';
    const end    = (req.query.end    as string) || '';
    const status = (req.query.status as string) || '';

    const conditions = [`u.driver_id = $1`];
    const params: any[] = [driverId];
    let pi = 2;

    if (status) { conditions.push(`a.status = $${pi++}`); params.push(status); }
    if (start)  { conditions.push(`a.date >= $${pi++}`);  params.push(start);  }
    if (end)    { conditions.push(`a.date <= $${pi++}`);  params.push(end);    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [rowsQ, countQ] = await Promise.all([
      pool.query(`
        SELECT
          a.id              AS absence_id,
          a.external_absence_id,
          a.date,
          a.reason,
          a.duration_minutes,
          a.status,
          a.notes
        FROM wiw_absences a
        LEFT JOIN wiw_users u ON u.id = a.wiw_user_id
        ${where}
        ORDER BY a.date DESC NULLS LAST
        LIMIT $${pi} OFFSET $${pi + 1}
      `, [...params, pageSize, offset]),
      pool.query(
        `SELECT count(*)::int AS total FROM wiw_absences a LEFT JOIN wiw_users u ON u.id = a.wiw_user_id ${where}`,
        params
      ),
    ]);

    const total = countQ.rows[0]?.total ?? 0;
    res.json({
      success: true,
      data: rowsQ.rows,
      meta: { page, pageSize, total, hasMore: page * pageSize < total },
    });
  } catch (err: any) {
    console.error('[DC driver] scheduling/absences error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err?.message });
  }
});

// GET /api/v1/scheduling/notices — driver's own attendance notices
router.get('/scheduling/notices', requireAuth, async (req: Request, res: Response) => {
  try {
    const driverId = await resolveDriverIdFromSession(req);
    if (!driverId) {
      return res.status(403).json({ error: 'NOT_A_DRIVER', message: 'Authenticated user is not linked to a driver record.' });
    }

    const { page, pageSize, offset } = paginationQ(req);
    const start = (req.query.start as string) || '';
    const end   = (req.query.end   as string) || '';
    const type  = (req.query.type  as string) || '';

    const conditions = [`u.driver_id = $1`];
    const params: any[] = [driverId];
    let pi = 2;

    if (type)  { conditions.push(`n.type = $${pi++}`);          params.push(type);  }
    if (start) { conditions.push(`n.occurred_at >= $${pi++}`);  params.push(start); }
    if (end)   { conditions.push(`n.occurred_at < ($${pi++}::date + interval '1 day')`); params.push(end); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [rowsQ, countQ] = await Promise.all([
      pool.query(`
        SELECT
          n.id              AS notice_id,
          n.external_notice_id,
          n.type,
          n.occurred_at,
          n.minutes_late,
          n.notes
        FROM wiw_attendance_notices n
        LEFT JOIN wiw_users u ON u.id = n.wiw_user_id
        ${where}
        ORDER BY n.occurred_at DESC NULLS LAST
        LIMIT $${pi} OFFSET $${pi + 1}
      `, [...params, pageSize, offset]),
      pool.query(
        `SELECT count(*)::int AS total FROM wiw_attendance_notices n LEFT JOIN wiw_users u ON u.id = n.wiw_user_id ${where}`,
        params
      ),
    ]);

    const total = countQ.rows[0]?.total ?? 0;
    res.json({
      success: true,
      data: rowsQ.rows,
      meta: { page, pageSize, total, hasMore: page * pageSize < total },
    });
  } catch (err: any) {
    console.error('[DC driver] scheduling/notices error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err?.message });
  }
});

// ── Attendance (System of Record) ──────────────────────────────────────────
// Backed entirely by driver_attendance_records / driver_attendance_metrics —
// derived tables maintained by attendanceRecordService/attendanceMetricsService.
// Never queries WIW directly.

// GET /api/v1/attendance/history — driver's own unified attendance records
router.get('/attendance/history', requireAuth, async (req: Request, res: Response) => {
  try {
    const driverId = await resolveDriverIdFromSession(req);
    if (!driverId) {
      return res.status(403).json({ error: 'NOT_A_DRIVER', message: 'Authenticated user is not linked to a driver record.' });
    }

    const { page, pageSize, offset } = paginationQ(req);
    const start  = (req.query.start  as string) || '';
    const end    = (req.query.end    as string) || '';
    const status = (req.query.status as string) || '';

    const conditions = [`ar.driver_id = $1`];
    const params: any[] = [driverId];
    let pi = 2;

    if (status) { conditions.push(`ar.outcome_status = $${pi++}`); params.push(status); }
    if (start)  { conditions.push(`ar.shift_date >= $${pi++}`);    params.push(start);  }
    if (end)    { conditions.push(`ar.shift_date <= $${pi++}`);    params.push(end);    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [rowsQ, countQ] = await Promise.all([
      pool.query(`
        SELECT
          ar.id                AS attendance_id,
          ar.shift_date,
          ar.scheduled_start,
          ar.scheduled_end,
          ar.scheduled_minutes,
          ar.actual_clock_in,
          ar.actual_clock_out,
          ar.actual_minutes,
          ar.late_minutes,
          ar.early_out_minutes,
          ar.variance_minutes,
          ar.outcome_status,
          ar.notes,
          l.name              AS location_name,
          p.name              AS position_name,
          ar.derived_at
        FROM driver_attendance_records ar
        LEFT JOIN wiw_locations l ON l.id = ar.wiw_location_id
        LEFT JOIN wiw_positions p ON p.id = ar.wiw_position_id
        ${where}
        ORDER BY ar.scheduled_start DESC
        LIMIT $${pi} OFFSET $${pi + 1}
      `, [...params, pageSize, offset]),
      pool.query(
        `SELECT count(*)::int AS total FROM driver_attendance_records ar ${where}`,
        params
      ),
    ]);

    const total = countQ.rows[0]?.total ?? 0;
    res.json({
      success: true,
      data: rowsQ.rows,
      meta: { page, pageSize, total, hasMore: page * pageSize < total },
    });
  } catch (err: any) {
    console.error('[DC driver] attendance/history error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err?.message });
  }
});

// GET /api/v1/attendance/metrics — driver's own current attendance metrics snapshot
router.get('/attendance/metrics', requireAuth, async (req: Request, res: Response) => {
  try {
    const driverId = await resolveDriverIdFromSession(req);
    if (!driverId) {
      return res.status(403).json({ error: 'NOT_A_DRIVER', message: 'Authenticated user is not linked to a driver record.' });
    }

    const result = await pool.query(
      `SELECT
         driver_id, window_days, total_shifts, completed_count, late_count,
         early_out_count, no_show_count, missed_count, call_off_count,
         attendance_pct, on_time_pct, consecutive_issues, trend, last_calculated_at
       FROM driver_attendance_metrics
       WHERE driver_id = $1
       LIMIT 1`,
      [driverId]
    );

    if (!result.rows[0]) {
      return res.json({
        success: true,
        data: {
          driverId,
          windowDays: 90,
          totalShifts: 0,
          completedCount: 0,
          lateCount: 0,
          earlyOutCount: 0,
          noShowCount: 0,
          missedCount: 0,
          callOffCount: 0,
          attendancePct: 0,
          onTimePct: 0,
          consecutiveIssues: 0,
          trend: 'stable',
          lastCalculatedAt: null,
        },
      });
    }

    const row = result.rows[0];
    res.json({
      success: true,
      data: {
        driverId: row.driver_id,
        windowDays: row.window_days,
        totalShifts: row.total_shifts,
        completedCount: row.completed_count,
        lateCount: row.late_count,
        earlyOutCount: row.early_out_count,
        noShowCount: row.no_show_count,
        missedCount: row.missed_count,
        callOffCount: row.call_off_count,
        attendancePct: row.attendance_pct != null ? Number(row.attendance_pct) : 0,
        onTimePct: row.on_time_pct != null ? Number(row.on_time_pct) : 0,
        consecutiveIssues: row.consecutive_issues,
        trend: row.trend,
        lastCalculatedAt: row.last_calculated_at,
      },
    });
  } catch (err: any) {
    console.error('[DC driver] attendance/metrics error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err?.message });
  }
});

export default router;
