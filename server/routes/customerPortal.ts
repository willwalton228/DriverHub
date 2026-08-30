import { Router, Request, Response } from "express";
import { db } from "../db";
import { trips, moveOfferAudit, customers, users, moveExceptions, feedbackTickets, feedbackComments, customerUsers, EXCEPTION_TYPES, EXCEPTION_SEVERITIES } from "@shared/schema";
import { eq, and, asc, desc, isNotNull, sql, max } from "drizzle-orm";
import { 
  normalizeMoveStatus, 
  auditEventToCanonicalStatus, 
  getCanonicalStatusLabel,
  getTimelineEventLabel,
  type CanonicalMoveStatus 
} from "@shared/canonicalStatus";
import { z } from "zod";

// Customer issue type to feedback type/area mapping
const CUSTOMER_ISSUE_TYPE_MAPPING: Record<string, { type: string; area: string }> = {
  SERVICE: { type: 'FEEDBACK', area: 'OTHER' },
  BILLING: { type: 'FEEDBACK', area: 'PAYMENT' },
  DRIVER: { type: 'FEEDBACK', area: 'OTHER' },
  VEHICLE: { type: 'FEEDBACK', area: 'OTHER' },
  OTHER: { type: 'FEEDBACK', area: 'OTHER' },
};

const CUSTOMER_ISSUE_TYPE_LABELS: Record<string, string> = {
  SERVICE: 'Service Issue',
  BILLING: 'Billing Question',
  DRIVER: 'Driver Concern',
  VEHICLE: 'Vehicle Issue',
  OTHER: 'Other',
};

const router = Router();

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  next();
}

function getUserId(req: Request): string | null {
  const user = req.user as any;
  if (user?.claims?.sub) {
    return user.claims.sub;
  }
  if (user?.id) {
    return user.id;
  }
  return null;
}

function getServerTime(): string {
  return new Date().toISOString();
}

interface TimelineEvent {
  at: string;
  canonical_status: CanonicalMoveStatus;
  label: string;
  note_public?: string;
}

router.get('/moves/:moveId/timeline', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User ID not found' });
    }
    
    const { moveId } = req.params;
    
    const moveRows = await db.select()
      .from(trips)
      .where(eq(trips.id, moveId))
      .limit(1);
    
    if (!moveRows.length) {
      return res.status(404).json({ error: 'MOVE_NOT_FOUND', message: 'Move not found' });
    }
    
    const move = moveRows[0];
    
    const userRows = await db.select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    
    if (!userRows.length) {
      return res.status(401).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
    }
    
    const user = userRows[0];
    
    let hasAccess = false;
    
    const userRole = user.role;
    if (userRole === 'admin' || userRole === 'ops_manager') {
      hasAccess = true;
    }
    
    if (!hasAccess && move.customerId) {
      const customerRows = await db.select()
        .from(customers)
        .where(eq(customers.id, move.customerId))
        .limit(1);
      
      if (customerRows.length) {
        const customer = customerRows[0];
        if (customer.accountOwnerId === userId) {
          hasAccess = true;
        }
      }
    }
    
    if (!hasAccess) {
      return res.status(403).json({ 
        error: 'ACCESS_DENIED', 
        message: 'You do not have permission to view this move' 
      });
    }
    
    const auditEvents = await db.select()
      .from(moveOfferAudit)
      .where(eq(moveOfferAudit.moveId, moveId))
      .orderBy(asc(moveOfferAudit.createdAt));
    
    const events: TimelineEvent[] = [];
    
    if (move.createdAt) {
      events.push({
        at: move.createdAt.toISOString(),
        canonical_status: 'CREATED',
        label: 'Move Created',
      });
    }
    
    for (const audit of auditEvents) {
      const canonicalStatus = auditEventToCanonicalStatus(audit.eventType, audit.newState);
      const event: TimelineEvent = {
        at: audit.createdAt?.toISOString() || getServerTime(),
        canonical_status: canonicalStatus,
        label: getTimelineEventLabel(audit.eventType, audit.newState),
      };
      
      if (audit.note && !audit.note.toLowerCase().includes('internal')) {
        event.note_public = audit.note;
      }
      
      events.push(event);
    }
    
    if (events.length === 0) {
      events.push({
        at: getServerTime(),
        canonical_status: 'CREATED',
        label: 'Move Created',
      });
    }
    
    if (move.assignmentState === 'ASSIGNED' && !events.some(e => e.canonical_status === 'ASSIGNED')) {
      if (move.acceptedAt) {
        events.push({
          at: move.acceptedAt.toISOString(),
          canonical_status: 'ASSIGNED',
          label: 'Driver Assigned',
        });
      }
    }
    
    if (move.executionState === 'COMPLETED' && !events.some(e => e.canonical_status === 'COMPLETED')) {
      events.push({
        at: move.updatedAt?.toISOString() || getServerTime(),
        canonical_status: 'COMPLETED',
        label: 'Move Completed',
      });
    }
    
    events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    
    const lastEvent = events[events.length - 1];
    
    const currentCanonicalStatus = normalizeMoveStatus(
      move.assignmentState,
      move.executionState,
      move.status
    );
    
    res.json({
      move_id: move.id,
      move_number: move.moveNumber,
      current_status: currentCanonicalStatus,
      current_status_label: getCanonicalStatusLabel(currentCanonicalStatus),
      eta_text: null,
      last_updated_at: lastEvent?.at || move.updatedAt?.toISOString() || getServerTime(),
      origin: move.origin,
      destination: move.destination,
      trip_date: move.tripDate?.toISOString(),
      customer_instructions: move.customerInstructions,
      events,
      server_time: getServerTime(),
    });
  } catch (error) {
    console.error('[Customer Portal] GET /moves/:moveId/timeline error:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch move timeline' });
  }
});

router.get('/moves', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User ID not found' });
    }
    
    const userRows = await db.select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    
    if (!userRows.length) {
      return res.status(401).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
    }
    
    const user = userRows[0];
    
    const customerIds: string[] = [];
    
    const ownedCustomers = await db.select({ id: customers.id })
      .from(customers)
      .where(eq(customers.accountOwnerId, userId));
    
    customerIds.push(...ownedCustomers.map(c => c.id));
    
    if (customerIds.length === 0) {
      return res.json({
        moves: [],
        total: 0,
        server_time: getServerTime(),
      });
    }
    
    const { status, limit = '50', offset = '0' } = req.query;
    const limitNum = Math.min(parseInt(limit as string) || 50, 100);
    const offsetNum = parseInt(offset as string) || 0;
    
    let query = db.select({
      id: trips.id,
      moveNumber: trips.moveNumber,
      origin: trips.origin,
      destination: trips.destination,
      tripDate: trips.tripDate,
      assignmentState: trips.assignmentState,
      executionState: trips.executionState,
      status: trips.status,
      updatedAt: trips.updatedAt,
    })
    .from(trips)
    .orderBy(desc(trips.tripDate))
    .limit(limitNum)
    .offset(offsetNum);
    
    const moves = await query;
    
    const filteredMoves = moves.filter(m => customerIds.some(cid => true));
    
    res.json({
      moves: filteredMoves.map(m => {
        const canonicalStatus = normalizeMoveStatus(m.assignmentState, m.executionState, m.status);
        return {
          move_id: m.id,
          move_number: m.moveNumber,
          origin: m.origin,
          destination: m.destination,
          trip_date: m.tripDate?.toISOString(),
          current_status: canonicalStatus,
          current_status_label: getCanonicalStatusLabel(canonicalStatus),
          last_updated_at: m.updatedAt?.toISOString(),
        };
      }),
      total: filteredMoves.length,
      server_time: getServerTime(),
    });
  } catch (error) {
    console.error('[Customer Portal] GET /moves error:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch moves' });
  }
});

// GET customer-visible exceptions (only items with public_message)
router.get('/moves/:moveId/exceptions', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User ID not found' });
    }
    
    const { moveId } = req.params;
    
    const moveRows = await db.select()
      .from(trips)
      .where(eq(trips.id, moveId))
      .limit(1);
    
    if (!moveRows.length) {
      return res.status(404).json({ error: 'MOVE_NOT_FOUND', message: 'Move not found' });
    }
    
    const move = moveRows[0];
    
    const userRows = await db.select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    
    if (!userRows.length) {
      return res.status(401).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
    }
    
    const user = userRows[0];
    
    let hasAccess = false;
    
    const userRole = user.role;
    if (userRole === 'admin' || userRole === 'ops_manager') {
      hasAccess = true;
    }
    
    if (!hasAccess && move.customerId) {
      const customerRows = await db.select()
        .from(customers)
        .where(eq(customers.id, move.customerId))
        .limit(1);
      
      if (customerRows.length) {
        const customer = customerRows[0];
        if (customer.accountOwnerId === userId) {
          hasAccess = true;
        }
      }
    }
    
    if (!hasAccess) {
      return res.status(403).json({ 
        error: 'ACCESS_DENIED', 
        message: 'You do not have permission to view this move' 
      });
    }
    
    // Customer-facing endpoint only returns exceptions with public messages
    const exceptions = await db.select({
      id: moveExceptions.id,
      type: moveExceptions.type,
      severity: moveExceptions.severity,
      publicMessage: moveExceptions.publicMessage,
      createdAt: moveExceptions.createdAt,
    })
      .from(moveExceptions)
      .where(and(
        eq(moveExceptions.moveId, moveId),
        isNotNull(moveExceptions.publicMessage)
      ))
      .orderBy(desc(moveExceptions.createdAt));
    
    res.json({
      exceptions: exceptions.map(e => ({
        id: e.id,
        type: e.type,
        severity: e.severity,
        message: e.publicMessage,
        created_at: e.createdAt?.toISOString(),
      })),
      server_time: getServerTime(),
    });
  } catch (error) {
    console.error('[Customer Portal] GET /moves/:moveId/exceptions error:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch move exceptions' });
  }
});

// ============================================
// CUSTOMER SUPPORT TICKET ENDPOINTS
// ============================================

const customerIssueSchema = z.object({
  issueType: z.enum(['SERVICE', 'BILLING', 'DRIVER', 'VEHICLE', 'OTHER']),
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(10, 'Please provide more detail (at least 10 characters)').max(5000),
  impactLevel: z.enum(['MINOR', 'SLOWS_WORK', 'BLOCKS', 'INCORRECT_DATA', 'MONEY_PAYROLL', 'CLIENT_FACING', 'COMPLIANCE_RISK']),
  impactDetail: z.string().min(1, 'Impact detail is required').max(1000),
});

// POST /api/customer/support/tickets - Submit a new support ticket
router.post('/support/tickets', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User ID not found' });
    }

    // Check if user is a customer user and verify they have ADMIN role
    const [customerUser] = await db.select()
      .from(customerUsers)
      .where(eq(customerUsers.userId, userId));
    
    if (customerUser && customerUser.role === 'ACCOUNT_VIEWER') {
      return res.status(403).json({ 
        error: 'FORBIDDEN', 
        message: 'Viewers cannot submit support tickets. Contact your account admin.' 
      });
    }

    // Validate request body
    const validationResult = customerIssueSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'VALIDATION_ERROR', 
        message: validationResult.error.errors[0]?.message || 'Invalid request data' 
      });
    }

    const { issueType, title, description, impactLevel, impactDetail } = validationResult.data;

    // Get user info
    const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!userRows.length) {
      return res.status(401).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
    }
    const user = userRows[0];

    // Find customer account associated with this user
    let customerAccountId: string | null = null;
    const customerRows = await db.select()
      .from(customers)
      .where(eq(customers.accountOwnerId, userId))
      .limit(1);
    
    if (customerRows.length) {
      customerAccountId = customerRows[0].id;
    }

    // Get next ticket number
    const maxTicketResult = await db.select({ max: max(feedbackTickets.ticketNumber) })
      .from(feedbackTickets);
    const nextTicketNumber = (maxTicketResult[0]?.max || 0) + 1;

    // Map customer issue type to internal type/area
    const mapping = CUSTOMER_ISSUE_TYPE_MAPPING[issueType] || { type: 'FEEDBACK', area: 'OTHER' };

    const createdByName = user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.email || 'Customer';

    // Create ticket
    const [newTicket] = await db.insert(feedbackTickets).values({
      ticketNumber: nextTicketNumber,
      createdByUserId: userId,
      createdByName,
      createdByEmail: user.email,
      type: mapping.type as any,
      area: mapping.area as any,
      title,
      description,
      impactLevel: impactLevel as any,
      impactDetail,
      urgency: 'MEDIUM' as any,
      priority: 'P3' as any,
      status: 'NEW' as any,
      ticketSource: 'CUSTOMER' as any,
      customerIssueType: issueType as any,
      customerAccountId,
      customerUserId: userId,
    }).returning();

    console.log(`[Customer Portal] Created support ticket #${nextTicketNumber} for user ${userId}`);

    res.status(201).json({
      ticket_id: newTicket.id,
      ticket_number: newTicket.ticketNumber,
      title: newTicket.title,
      issue_type: issueType,
      issue_type_label: CUSTOMER_ISSUE_TYPE_LABELS[issueType],
      status: 'NEW',
      created_at: newTicket.createdAt?.toISOString(),
      message: `Your support request #${newTicket.ticketNumber} has been submitted. We will respond shortly.`,
    });
  } catch (error) {
    console.error('[Customer Portal] POST /support/tickets error:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to submit support ticket' });
  }
});

// GET /api/customer/support/tickets - Get customer's submitted tickets
router.get('/support/tickets', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User ID not found' });
    }

    // Get tickets created by this user with source CUSTOMER
    const tickets = await db.select()
      .from(feedbackTickets)
      .where(and(
        eq(feedbackTickets.customerUserId, userId),
        eq(feedbackTickets.ticketSource, 'CUSTOMER')
      ))
      .orderBy(desc(feedbackTickets.createdAt));

    res.json({
      tickets: tickets.map(t => ({
        id: t.id,
        ticket_number: t.ticketNumber,
        title: t.title,
        issue_type: t.customerIssueType,
        issue_type_label: t.customerIssueType ? CUSTOMER_ISSUE_TYPE_LABELS[t.customerIssueType] : 'Unknown',
        status: t.status,
        status_label: getStatusLabel(t.status),
        created_at: t.createdAt?.toISOString(),
        updated_at: t.updatedAt?.toISOString(),
      })),
      server_time: getServerTime(),
    });
  } catch (error) {
    console.error('[Customer Portal] GET /support/tickets error:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch support tickets' });
  }
});

// GET /api/customer/support/tickets/:id - Get single ticket with comments (only REQUESTER visibility)
router.get('/support/tickets/:ticketId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User ID not found' });
    }

    const { ticketId } = req.params;

    // Get ticket
    const ticketRows = await db.select()
      .from(feedbackTickets)
      .where(eq(feedbackTickets.id, ticketId))
      .limit(1);

    if (!ticketRows.length) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Ticket not found' });
    }

    const ticket = ticketRows[0];

    // Verify ownership
    if (ticket.customerUserId !== userId) {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: 'You do not have permission to view this ticket' });
    }

    // Get comments (only REQUESTER visibility)
    const comments = await db.select()
      .from(feedbackComments)
      .where(and(
        eq(feedbackComments.ticketId, ticketId),
        eq(feedbackComments.visibility, 'REQUESTER')
      ))
      .orderBy(asc(feedbackComments.createdAt));

    res.json({
      id: ticket.id,
      ticket_number: ticket.ticketNumber,
      title: ticket.title,
      description: ticket.description,
      issue_type: ticket.customerIssueType,
      issue_type_label: ticket.customerIssueType ? CUSTOMER_ISSUE_TYPE_LABELS[ticket.customerIssueType] : 'Unknown',
      impact_level: ticket.impactLevel,
      impact_detail: ticket.impactDetail,
      status: ticket.status,
      status_label: getStatusLabel(ticket.status),
      created_at: ticket.createdAt?.toISOString(),
      updated_at: ticket.updatedAt?.toISOString(),
      comments: comments.map(c => ({
        id: c.id,
        author_name: c.createdByName,
        content: c.body,
        created_at: c.createdAt?.toISOString(),
      })),
      server_time: getServerTime(),
    });
  } catch (error) {
    console.error('[Customer Portal] GET /support/tickets/:id error:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch ticket details' });
  }
});

// POST /api/customer/support/tickets/:id/comment - Add comment to ticket (customer reply)
router.post('/support/tickets/:ticketId/comment', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User ID not found' });
    }

    const { ticketId } = req.params;
    const { content } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length < 1) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Comment content is required' });
    }

    // Get ticket and verify ownership
    const ticketRows = await db.select()
      .from(feedbackTickets)
      .where(eq(feedbackTickets.id, ticketId))
      .limit(1);

    if (!ticketRows.length) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Ticket not found' });
    }

    const ticket = ticketRows[0];

    if (ticket.customerUserId !== userId) {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: 'You do not have permission to comment on this ticket' });
    }

    // Get user info
    const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!userRows.length) {
      return res.status(401).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
    }
    const user = userRows[0];

    const createdByName = user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.email || 'Customer';

    // Create comment with REQUESTER visibility
    const [newComment] = await db.insert(feedbackComments).values({
      ticketId,
      createdByUserId: userId,
      createdByName,
      visibility: 'REQUESTER' as any,
      body: content.trim(),
    }).returning();

    // Update ticket timestamp
    await db.update(feedbackTickets)
      .set({ updatedAt: new Date() })
      .where(eq(feedbackTickets.id, ticketId));

    res.status(201).json({
      id: newComment.id,
      author_name: newComment.createdByName,
      content: newComment.body,
      created_at: newComment.createdAt?.toISOString(),
    });
  } catch (error) {
    console.error('[Customer Portal] POST /support/tickets/:id/comment error:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to add comment' });
  }
});

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    NEW: 'New',
    TRIAGE: 'Under Review',
    NEEDS_INFO: 'Awaiting Your Response',
    PLANNED: 'Planned',
    IN_PROGRESS: 'In Progress',
    SHIPPED: 'Resolved',
    DECLINED: 'Closed',
  };
  return labels[status] || status;
}

export default router;
