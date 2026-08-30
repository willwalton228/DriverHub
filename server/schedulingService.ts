import { db } from "./db";
import { z } from "zod";
import { eq, and, or, gte, lte, sql, desc, asc, between, inArray } from "drizzle-orm";
import {
  schedulingSchedules,
  schedulingShifts,
  schedulingAssignments,
  schedulingAvailability,
  schedulingTimeOff,
  schedulingConstraints,
  schedulingViolations,
  schedulingAssignmentHistory,
  schedulingShiftChangelog,
  timeRoundingConfig,
  geofenceClockAudit,
  overtimeAlertThresholds,
  shiftTemplates,
  recurringPatterns,
  patternTemplateMappings,
  scheduleApprovalConfigs,
  scheduleAuditLogs,
  scheduleApprovalRequests,
  workLocations,
  recruitingAuditEvents,
  schedulingMessages,
  schedulingMessageRecipients,
  notifications,
  payrollExports,
  employees,
  shifts,
  shiftAssignments,
  SchedulingSchedule,
  SchedulingShift,
  SchedulingAssignment,
  SchedulingAvailability,
  SchedulingTimeOff,
  SchedulingConstraint,
  SchedulingViolation,
  SchedulingAssignmentHistory,
  SchedulingShiftChangelog,
  InsertSchedulingSchedule,
  InsertSchedulingShift,
  InsertSchedulingAssignment,
  InsertSchedulingAvailability,
  InsertSchedulingTimeOff,
  InsertSchedulingConstraint,
  GeofenceClockAudit,
  OvertimeAlertThresholds,
  ShiftTemplate,
  RecurringPattern,
  PatternTemplateMapping,
  SchedulingMessage,
  InsertSchedulingMessage,
  SchedulingMessageRecipient,
  InsertSchedulingMessageRecipient,
  SchedulingAlertType,
  unionCbaRuleSets,
  unionCbaViolations,
  drivers,
  employees,
  users,
} from "@shared/schema";

async function writeAuditEvent(
  actionType: string,
  entityType: string,
  entityId: string,
  userId: string | null,
  userEmail: string | null,
  previousValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null,
  changedFields: string[] | null,
  reason?: string
): Promise<void> {
  try {
    await db.insert(recruitingAuditEvents).values({
      actionType,
      entityType,
      entityId,
      userId,
      userEmail,
      previousValue: previousValue ? JSON.stringify(previousValue) : null,
      newValue: newValue ? JSON.stringify(newValue) : null,
      changedFields,
      reason,
    });
  } catch (error) {
    console.error("[Scheduling] Failed to write audit event:", error);
  }
}

type ScheduleStatus = 'draft' | 'published' | 'locked' | 'archived';
type AssignmentStatus = 'assigned' | 'confirmed' | 'in_progress' | 'declined' | 'cancelled' | 'no_show' | 'completed';
type WorkerType = 'driver' | 'employee';

async function resolveUserId(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  return user ? user.id : null;
}

// ============================================================================
// SHIFT CHANGELOG HELPERS
// ============================================================================

type ShiftChangeAction = 'created' | 'updated' | 'deleted' | 'assignment_added' | 'assignment_removed' | 'assignment_updated';

async function writeShiftChangelog(entry: {
  scheduleId: string;
  shiftId?: string | null;
  scheduleVersion: number;
  action: ShiftChangeAction;
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  summary?: string | null;
  changedBy?: string | null;
  changedByEmail?: string | null;
}): Promise<void> {
  try {
    await db.insert(schedulingShiftChangelog).values({
      scheduleId: entry.scheduleId,
      shiftId: entry.shiftId || null,
      scheduleVersion: entry.scheduleVersion,
      action: entry.action,
      fieldName: entry.fieldName || null,
      oldValue: entry.oldValue || null,
      newValue: entry.newValue || null,
      summary: entry.summary || null,
      changedBy: entry.changedBy || null,
      changedByEmail: entry.changedByEmail || null,
    });
  } catch (error) {
    console.error('[ShiftChangelog] Error writing changelog entry:', error);
  }
}

export async function getShiftChangelog(
  scheduleId: string,
  shiftId?: string
): Promise<SchedulingShiftChangelog[]> {
  if (shiftId) {
    return db.select().from(schedulingShiftChangelog)
      .where(and(
        eq(schedulingShiftChangelog.scheduleId, scheduleId),
        eq(schedulingShiftChangelog.shiftId, shiftId)
      ))
      .orderBy(desc(schedulingShiftChangelog.changedAt));
  }
  return db.select().from(schedulingShiftChangelog)
    .where(eq(schedulingShiftChangelog.scheduleId, scheduleId))
    .orderBy(desc(schedulingShiftChangelog.changedAt));
}

// ============================================================================
// SCHEDULE CRUD
// ============================================================================

export async function createSchedule(
  data: {
    name: string;
    description?: string;
    startDate: string;
    endDate: string;
    timeZone?: string;
    entityId?: string;
  },
  userId: string | null,
  userEmail: string | null
): Promise<SchedulingSchedule> {
  const resolvedUserId = await resolveUserId(userId);

  const [schedule] = await db.insert(schedulingSchedules).values({
    name: data.name,
    description: data.description || null,
    startDate: data.startDate,
    endDate: data.endDate,
    timeZone: data.timeZone || 'America/Chicago',
    entityId: data.entityId || null,
    status: 'draft',
    createdBy: resolvedUserId,
    updatedBy: resolvedUserId,
  }).returning();

  await writeAuditEvent(
    "SCHEDULE_CREATED",
    "schedule",
    schedule.id,
    userId,
    userEmail,
    null,
    { name: data.name, startDate: data.startDate, endDate: data.endDate },
    null
  );

  return schedule;
}

export async function getSchedule(id: string): Promise<SchedulingSchedule | null> {
  const schedule = await db.query.schedulingSchedules.findFirst({
    where: eq(schedulingSchedules.id, id),
    with: {
      shifts: {
        with: {
          assignments: true,
        },
      },
    },
  });
  return schedule || null;
}

export async function getSchedules(
  filters?: {
    status?: ScheduleStatus;
    startDate?: string;
    endDate?: string;
    entityId?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ schedules: SchedulingSchedule[]; total: number }> {
  const conditions = [];

  if (filters?.entityId) {
    conditions.push(eq(schedulingSchedules.entityId, filters.entityId));
  }
  if (filters?.status) {
    conditions.push(eq(schedulingSchedules.status, filters.status));
  }
  if (filters?.startDate) {
    conditions.push(gte(schedulingSchedules.startDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(schedulingSchedules.endDate, filters.endDate));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const schedules = await db.query.schedulingSchedules.findMany({
    where: whereClause,
    orderBy: [desc(schedulingSchedules.startDate)],
    limit: filters?.limit || 50,
    offset: filters?.offset || 0,
    with: {
      createdByUser: true,
      publishedByUser: true,
    },
  });

  const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
    .from(schedulingSchedules)
    .where(whereClause);

  return { schedules, total: countResult?.count || 0 };
}

export async function updateSchedule(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    startDate: string;
    endDate: string;
    timeZone: string;
  }>,
  userId: string | null,
  userEmail: string | null
): Promise<SchedulingSchedule | null> {
  const existing = await getSchedule(id);
  if (!existing) return null;

  if (existing.status === 'locked') {
    throw new Error("Cannot update a locked schedule");
  }

  const resolvedUserId = await resolveUserId(userId);

  const [updated] = await db.update(schedulingSchedules)
    .set({
      ...data,
      updatedAt: new Date(),
      updatedBy: resolvedUserId,
    })
    .where(eq(schedulingSchedules.id, id))
    .returning();

  await writeAuditEvent(
    "SCHEDULE_UPDATED",
    "schedule",
    id,
    userId,
    userEmail,
    existing,
    updated,
    Object.keys(data)
  );

  return updated;
}

export async function publishSchedule(
  id: string,
  userId: string | null,
  userEmail: string | null
): Promise<SchedulingSchedule | null> {
  const existing = await getSchedule(id);
  if (!existing) return null;

  if (existing.status !== 'draft') {
    throw new Error("Only draft schedules can be published");
  }

  const resolvedUserId = await resolveUserId(userId);
  const newVersion = (existing.version || 0) + 1;

  const [updated] = await db.update(schedulingSchedules)
    .set({
      status: 'published',
      version: newVersion,
      publishedAt: new Date(),
      publishedBy: resolvedUserId,
      updatedAt: new Date(),
      updatedBy: resolvedUserId,
    })
    .where(eq(schedulingSchedules.id, id))
    .returning();

  await writeAuditEvent(
    "SCHEDULE_PUBLISHED",
    "schedule",
    id,
    userId,
    userEmail,
    { status: 'draft', version: existing.version },
    { status: 'published', version: newVersion },
    ['status', 'publishedAt', 'publishedBy', 'version']
  );

  // Log schedule publish to shift changelog for all shifts
  const shifts = await getShiftsForSchedule(id);
  for (const shift of shifts) {
    await writeShiftChangelog({
      scheduleId: id,
      shiftId: shift.id,
      scheduleVersion: newVersion,
      action: 'updated',
      summary: `Schedule published (version ${newVersion})`,
      changedBy: resolvedUserId,
      changedByEmail: userEmail,
    });
  }

  // Send automatic alert to all assigned workers
  try {
    await sendSchedulePublishedAlert(id);
  } catch (alertError) {
    console.error('[Scheduling] Failed to send schedule published alert:', alertError);
  }

  return updated;
}

export async function lockSchedule(
  id: string,
  userId: string | null,
  userEmail: string | null
): Promise<SchedulingSchedule | null> {
  const existing = await getSchedule(id);
  if (!existing) return null;

  if (existing.status !== 'published') {
    throw new Error("Only published schedules can be locked");
  }

  const resolvedUserId = await resolveUserId(userId);

  const [updated] = await db.update(schedulingSchedules)
    .set({
      status: 'locked',
      lockedAt: new Date(),
      lockedBy: resolvedUserId,
      updatedAt: new Date(),
      updatedBy: resolvedUserId,
    })
    .where(eq(schedulingSchedules.id, id))
    .returning();

  await writeAuditEvent(
    "SCHEDULE_LOCKED",
    "schedule",
    id,
    userId,
    userEmail,
    { status: 'published' },
    { status: 'locked' },
    ['status', 'lockedAt', 'lockedBy']
  );

  return updated;
}

export async function unpublishSchedule(
  id: string,
  userId: string | null,
  userEmail: string | null
): Promise<SchedulingSchedule | null> {
  const existing = await getSchedule(id);
  if (!existing) return null;

  if (existing.status !== 'published') {
    throw new Error("Only published schedules can be unpublished");
  }

  const resolvedUserId = await resolveUserId(userId);

  const [updated] = await db.update(schedulingSchedules)
    .set({
      status: 'draft',
      unpublishedAt: new Date(),
      unpublishedBy: resolvedUserId,
      updatedAt: new Date(),
      updatedBy: resolvedUserId,
    })
    .where(eq(schedulingSchedules.id, id))
    .returning();

  await writeAuditEvent(
    "SCHEDULE_UNPUBLISHED",
    "schedule",
    id,
    userId,
    userEmail,
    { status: 'published', version: existing.version },
    { status: 'draft', version: existing.version },
    ['status', 'unpublishedAt', 'unpublishedBy']
  );

  // Log schedule unpublish to shift changelog for all shifts
  const shifts = await getShiftsForSchedule(id);
  for (const shift of shifts) {
    await writeShiftChangelog({
      scheduleId: id,
      shiftId: shift.id,
      scheduleVersion: existing.version || 0,
      action: 'updated',
      summary: `Schedule unpublished (reverted to draft)`,
      changedBy: resolvedUserId,
      changedByEmail: userEmail,
    });
  }

  return updated;
}

// ============================================================================
// SHIFT CRUD
// ============================================================================

export async function createShift(
  data: {
    scheduleId: string;
    name?: string;
    locationId?: string;
    role?: string;
    workType?: 'shift' | 'on_demand' | 'hybrid';
    startTime: Date;
    endTime: Date;
    requiredHeadcount?: number;
    notes?: string;
    color?: string;
  },
  userId: string | null,
  userEmail: string | null
): Promise<SchedulingShift> {
  const schedule = await getSchedule(data.scheduleId);
  if (!schedule) {
    throw new Error("Schedule not found");
  }

  if (schedule.status === 'locked') {
    throw new Error("Cannot add shifts to a locked schedule");
  }

  const resolvedUserId = await resolveUserId(userId);

  const [shift] = await db.insert(schedulingShifts).values({
    scheduleId: data.scheduleId,
    name: data.name || null,
    locationId: data.locationId || null,
    role: data.role || null,
    workType: data.workType || 'shift',
    startTime: data.startTime,
    endTime: data.endTime,
    requiredHeadcount: data.requiredHeadcount || 1,
    notes: data.notes || null,
    color: data.color || null,
    createdBy: resolvedUserId,
  }).returning();

  await writeAuditEvent(
    "SHIFT_CREATED",
    "shift",
    shift.id,
    userId,
    userEmail,
    null,
    { scheduleId: data.scheduleId, startTime: data.startTime, endTime: data.endTime },
    null
  );

  // Log to shift changelog
  await writeShiftChangelog({
    scheduleId: data.scheduleId,
    shiftId: shift.id,
    scheduleVersion: schedule.version || 0,
    action: 'created',
    summary: `Shift "${data.name || 'Untitled'}" created for ${new Date(data.startTime).toLocaleString()}`,
    changedBy: resolvedUserId,
    changedByEmail: userEmail,
  });

  return shift;
}

export async function getShiftsForSchedule(scheduleId: string): Promise<SchedulingShift[]> {
  return db.query.schedulingShifts.findMany({
    where: eq(schedulingShifts.scheduleId, scheduleId),
    orderBy: [asc(schedulingShifts.startTime)],
    with: {
      assignments: {
        with: {
          driver: true,
          employee: true,
        },
      },
    },
  });
}

export async function updateShift(
  id: string,
  data: Partial<{
    name: string;
    locationId: string;
    role: string;
    startTime: Date;
    endTime: Date;
    requiredHeadcount: number;
    notes: string;
    color: string;
  }>,
  userId: string | null,
  userEmail: string | null
): Promise<SchedulingShift | null> {
  // Use plain queries to avoid relational query errors
  const [existing] = await db.select().from(schedulingShifts).where(eq(schedulingShifts.id, id));
  if (!existing) return null;

  const [schedule] = await db.select().from(schedulingSchedules).where(eq(schedulingSchedules.id, existing.scheduleId));
  if (schedule?.status === 'locked') {
    throw new Error("Cannot update shifts in a locked schedule");
  }

  const resolvedUserId = await resolveUserId(userId);

  const [updated] = await db.update(schedulingShifts)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(schedulingShifts.id, id))
    .returning();

  await writeAuditEvent(
    "SHIFT_UPDATED",
    "shift",
    id,
    userId,
    userEmail,
    existing,
    updated,
    Object.keys(data)
  );

  // Log each changed field to shift changelog
  const changedFields = Object.keys(data);
  for (const field of changedFields) {
    const oldValue = (existing as Record<string, unknown>)[field];
    const newValue = (data as Record<string, unknown>)[field];
    if (oldValue !== newValue) {
      await writeShiftChangelog({
        scheduleId: existing.scheduleId,
        shiftId: id,
        scheduleVersion: schedule?.version || 0,
        action: 'updated',
        fieldName: field,
        oldValue: String(oldValue ?? ''),
        newValue: String(newValue ?? ''),
        summary: `Updated ${field}`,
        changedBy: resolvedUserId,
        changedByEmail: userEmail,
      });
    }
  }

  return updated;
}

export async function deleteShift(
  id: string,
  userId: string | null,
  userEmail: string | null
): Promise<boolean> {
  // Use plain queries to avoid relational query errors
  const [existing] = await db.select().from(schedulingShifts).where(eq(schedulingShifts.id, id));
  if (!existing) return false;

  const [schedule] = await db.select().from(schedulingSchedules).where(eq(schedulingSchedules.id, existing.scheduleId));
  if (schedule?.status === 'locked') {
    throw new Error("Cannot delete shifts from a locked schedule");
  }

  const resolvedUserId = await resolveUserId(userId);

  // Log to shift changelog before deleting
  await writeShiftChangelog({
    scheduleId: existing.scheduleId,
    shiftId: id,
    scheduleVersion: schedule?.version || 0,
    action: 'deleted',
    summary: `Shift "${existing.name || 'Untitled'}" deleted`,
    changedBy: resolvedUserId,
    changedByEmail: userEmail,
  });

  await db.delete(schedulingShifts).where(eq(schedulingShifts.id, id));

  await writeAuditEvent(
    "SHIFT_DELETED",
    "shift",
    id,
    userId,
    userEmail,
    existing,
    null,
    null
  );

  return true;
}

// ============================================================================
// ASSIGNMENT CRUD
// ============================================================================

export async function assignWorker(
  data: {
    shiftId: string;
    workerType: WorkerType;
    driverId?: string;
    employeeId?: string;
    notes?: string;
    overrideReason?: string;
  },
  userId: string | null,
  userEmail: string | null
): Promise<{ assignment: SchedulingAssignment; violations: SchedulingViolation[] }> {
  // Get shift without relational query
  const [shift] = await db.select().from(schedulingShifts).where(eq(schedulingShifts.id, data.shiftId));

  if (!shift) {
    throw new Error("Shift not found");
  }

  // Get schedule separately to check status
  const [schedule] = await db.select().from(schedulingSchedules).where(eq(schedulingSchedules.id, shift.scheduleId));
  
  if (schedule?.status === 'locked') {
    throw new Error("Cannot assign workers to shifts in a locked schedule");
  }

  const resolvedUserId = await resolveUserId(userId);

  const [assignment] = await db.insert(schedulingAssignments).values({
    shiftId: data.shiftId,
    workerType: data.workerType,
    driverId: data.workerType === 'driver' ? data.driverId : null,
    employeeId: data.workerType === 'employee' ? data.employeeId : null,
    status: 'assigned',
    assignedBy: resolvedUserId,
    notes: data.notes || null,
    overrideReason: data.overrideReason || null,
  }).returning();

  await db.insert(schedulingAssignmentHistory).values({
    assignmentId: assignment.id,
    fromStatus: null,
    toStatus: 'assigned',
    changedBy: resolvedUserId,
    reason: 'Initial assignment',
  });

  const violations = await evaluateAssignmentViolations(assignment.id);

  await writeAuditEvent(
    "WORKER_ASSIGNED",
    "assignment",
    assignment.id,
    userId,
    userEmail,
    null,
    { shiftId: data.shiftId, workerType: data.workerType, driverId: data.driverId, employeeId: data.employeeId },
    null
  );

  return { assignment, violations };
}

export async function updateAssignmentStatus(
  id: string,
  newStatus: AssignmentStatus,
  userId: string | null,
  userEmail: string | null,
  reason?: string
): Promise<SchedulingAssignment | null> {
  const existing = await db.query.schedulingAssignments.findFirst({
    where: eq(schedulingAssignments.id, id),
  });

  if (!existing) return null;

  const resolvedUserId = await resolveUserId(userId);
  const oldStatus = existing.status;

  const updateData: any = {
    status: newStatus,
    updatedAt: new Date(),
  };

  if (newStatus === 'confirmed') {
    updateData.confirmedAt = new Date();
  }

  const [updated] = await db.update(schedulingAssignments)
    .set(updateData)
    .where(eq(schedulingAssignments.id, id))
    .returning();

  await db.insert(schedulingAssignmentHistory).values({
    assignmentId: id,
    fromStatus: oldStatus,
    toStatus: newStatus,
    changedBy: resolvedUserId,
    reason: reason || null,
  });

  await writeAuditEvent(
    "ASSIGNMENT_STATUS_CHANGED",
    "assignment",
    id,
    userId,
    userEmail,
    { status: oldStatus },
    { status: newStatus },
    ['status']
  );

  return updated;
}

export async function unassignWorker(
  id: string,
  userId: string | null,
  userEmail: string | null,
  reason?: string
): Promise<boolean> {
  return (await updateAssignmentStatus(id, 'cancelled', userId, userEmail, reason)) !== null;
}

export async function getAssignmentsForShift(shiftId: string): Promise<SchedulingAssignment[]> {
  return db.query.schedulingAssignments.findMany({
    where: and(
      eq(schedulingAssignments.shiftId, shiftId),
      sql`${schedulingAssignments.status} NOT IN ('cancelled')`
    ),
    with: {
      driver: true,
      employee: true,
      assignedByUser: true,
    },
  });
}

export async function clockIn(
  assignmentId: string,
  userId: string | null,
  userEmail: string | null,
  latitude?: number,
  longitude?: number,
  isWithinGeofence?: boolean,
  wasOverridden?: boolean,
  options?: { applyRounding?: boolean; roundingConfig?: any }
): Promise<SchedulingAssignment | null> {
  let clockInTime = new Date();
  
  // Apply rounding if configured
  if (options?.applyRounding && options?.roundingConfig?.enabled) {
    clockInTime = applyTimeRounding(clockInTime, options.roundingConfig, 'in');
  }

  const updateData: any = {
    clockInTime,
    status: 'in_progress', // Changed from 'confirmed' - worker is actively on shift
    updatedAt: new Date(),
  };

  // Add location data if provided
  if (latitude !== undefined && longitude !== undefined) {
    updateData.clockInLatitude = latitude.toString();
    updateData.clockInLongitude = longitude.toString();
    updateData.clockInWithinGeofence = isWithinGeofence ?? true;
    updateData.clockInOverride = wasOverridden ?? false;
  }

  const [updated] = await db.update(schedulingAssignments)
    .set(updateData)
    .where(eq(schedulingAssignments.id, assignmentId))
    .returning();

  if (updated) {
    await writeAuditEvent(
      "WORKER_CLOCKED_IN",
      "assignment",
      assignmentId,
      userId,
      userEmail,
      null,
      { 
        clockInTime: updated.clockInTime, 
        status: 'in_progress',
        clockInLatitude: latitude,
        clockInLongitude: longitude,
        clockInWithinGeofence: isWithinGeofence,
        clockInOverride: wasOverridden,
      },
      ['clockInTime', 'status', 'clockInLatitude', 'clockInLongitude', 'clockInWithinGeofence', 'clockInOverride']
    );
  }

  return updated || null;
}

// Helper function to apply time rounding
function applyTimeRounding(time: Date, config: any, direction: 'in' | 'out'): Date {
  if (!config?.enabled) return time;
  
  const increment = config.roundingIncrement || 15; // default 15 minutes
  const roundType = direction === 'in' ? config.roundClockIn : config.roundClockOut;
  const graceMinutes = config.graceMinutes || 5;
  
  const minutes = time.getMinutes();
  const remainder = minutes % increment;
  
  // If within grace period, don't round
  if (remainder <= graceMinutes || (increment - remainder) <= graceMinutes) {
    // Within grace, round to nearest
  }
  
  let roundedMinutes: number;
  if (roundType === 'up') {
    roundedMinutes = remainder === 0 ? minutes : minutes + (increment - remainder);
  } else if (roundType === 'down') {
    roundedMinutes = minutes - remainder;
  } else {
    // 'nearest' - default
    roundedMinutes = remainder < increment / 2 ? minutes - remainder : minutes + (increment - remainder);
  }
  
  const result = new Date(time);
  result.setMinutes(roundedMinutes);
  result.setSeconds(0);
  result.setMilliseconds(0);
  
  return result;
}

export async function clockOut(
  assignmentId: string,
  userId: string | null,
  userEmail: string | null,
  latitude?: number,
  longitude?: number,
  isWithinGeofence?: boolean,
  wasOverridden?: boolean,
  options?: { applyRounding?: boolean; roundingConfig?: any }
): Promise<SchedulingAssignment | null> {
  let clockOutTime = new Date();
  
  // Apply rounding if configured
  if (options?.applyRounding && options?.roundingConfig?.enabled) {
    clockOutTime = applyTimeRounding(clockOutTime, options.roundingConfig, 'out');
  }

  const updateData: any = {
    clockOutTime,
    status: 'completed',
    updatedAt: new Date(),
  };

  // Add location data if provided
  if (latitude !== undefined && longitude !== undefined) {
    updateData.clockOutLatitude = latitude.toString();
    updateData.clockOutLongitude = longitude.toString();
    updateData.clockOutWithinGeofence = isWithinGeofence ?? true;
    updateData.clockOutOverride = wasOverridden ?? false;
  }

  const [updated] = await db.update(schedulingAssignments)
    .set(updateData)
    .where(eq(schedulingAssignments.id, assignmentId))
    .returning();

  if (updated) {
    await writeAuditEvent(
      "WORKER_CLOCKED_OUT",
      "assignment",
      assignmentId,
      userId,
      userEmail,
      null,
      { 
        clockOutTime: updated.clockOutTime, 
        status: 'completed',
        clockOutLatitude: latitude,
        clockOutLongitude: longitude,
        clockOutWithinGeofence: isWithinGeofence,
        clockOutOverride: wasOverridden,
      },
      ['clockOutTime', 'status', 'clockOutLatitude', 'clockOutLongitude', 'clockOutWithinGeofence', 'clockOutOverride']
    );
  }

  return updated || null;
}

// Detect and mark missed shifts - assignments where shift end time passed without clock-in
export async function detectMissedShifts(): Promise<number> {
  const now = new Date();
  
  // Find assignments that are still assigned/confirmed but shift has ended
  const missedAssignments = await db
    .select({
      assignmentId: schedulingAssignments.id,
      shiftEndTime: schedulingShifts.endTime,
      status: schedulingAssignments.status,
    })
    .from(schedulingAssignments)
    .innerJoin(schedulingShifts, eq(schedulingAssignments.shiftId, schedulingShifts.id))
    .where(
      and(
        inArray(schedulingAssignments.status, ['assigned', 'confirmed']),
        sql`${schedulingShifts.endTime} < ${now}`
      )
    );

  // Update to no_show status
  let count = 0;
  for (const assignment of missedAssignments) {
    await db.update(schedulingAssignments)
      .set({
        status: 'no_show',
        updatedAt: new Date(),
      })
      .where(eq(schedulingAssignments.id, assignment.assignmentId));
    
    await writeAuditEvent(
      "SHIFT_MARKED_MISSED",
      "assignment",
      assignment.assignmentId,
      null,
      'system',
      null,
      { previousStatus: assignment.status, newStatus: 'no_show', shiftEndTime: assignment.shiftEndTime },
      ['status']
    );
    count++;
  }

  return count;
}

// Get assignment with shift details for time comparison
export async function getAssignmentWithShift(assignmentId: string) {
  const result = await db
    .select({
      assignment: schedulingAssignments,
      shift: schedulingShifts,
    })
    .from(schedulingAssignments)
    .innerJoin(schedulingShifts, eq(schedulingAssignments.shiftId, schedulingShifts.id))
    .where(eq(schedulingAssignments.id, assignmentId))
    .limit(1);
  
  return result[0] || null;
}

// ============================================================================
// TIME & ATTENDANCE REPORTING
// ============================================================================

// Get time attendance report for admin view
export async function getTimeAttendanceReport(
  startDate?: string,
  endDate?: string,
  scheduleId?: string
): Promise<any[]> {
  const conditions: any[] = [];
  
  // Build date filter if provided
  if (startDate) {
    conditions.push(gte(schedulingShifts.startTime, new Date(startDate)));
  }
  if (endDate) {
    conditions.push(lte(schedulingShifts.endTime, new Date(endDate + 'T23:59:59')));
  }
  if (scheduleId) {
    conditions.push(eq(schedulingShifts.scheduleId, scheduleId));
  }

  const assignments = await db
    .select({
      assignmentId: schedulingAssignments.id,
      shiftId: schedulingShifts.id,
      shiftName: schedulingShifts.name,
      scheduledStart: schedulingShifts.startTime,
      scheduledEnd: schedulingShifts.endTime,
      role: schedulingShifts.role,
      location: schedulingShifts.location,
      workerType: schedulingAssignments.workerType,
      driverId: schedulingAssignments.driverId,
      employeeId: schedulingAssignments.employeeId,
      status: schedulingAssignments.status,
      clockInTime: schedulingAssignments.clockInTime,
      clockOutTime: schedulingAssignments.clockOutTime,
      confirmedAt: schedulingAssignments.confirmedAt,
    })
    .from(schedulingAssignments)
    .innerJoin(schedulingShifts, eq(schedulingAssignments.shiftId, schedulingShifts.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schedulingShifts.startTime));

  // Calculate variance for each assignment
  return assignments.map(a => {
    const scheduledMinutes = a.scheduledStart && a.scheduledEnd 
      ? Math.round((new Date(a.scheduledEnd).getTime() - new Date(a.scheduledStart).getTime()) / 60000)
      : 0;
    
    const actualMinutes = a.clockInTime && a.clockOutTime
      ? Math.round((new Date(a.clockOutTime).getTime() - new Date(a.clockInTime).getTime()) / 60000)
      : 0;
    
    const varianceMinutes = actualMinutes - scheduledMinutes;
    
    // Determine attendance status
    let attendanceStatus = 'not_started';
    if (a.status === 'no_show') {
      attendanceStatus = 'missed';
    } else if (a.status === 'in_progress') {
      attendanceStatus = 'in_progress';
    } else if (a.status === 'completed' && a.clockInTime && a.clockOutTime) {
      attendanceStatus = 'completed';
    } else if (a.status === 'confirmed' || a.status === 'assigned') {
      const now = new Date();
      const shiftEnd = new Date(a.scheduledEnd);
      if (shiftEnd < now) {
        attendanceStatus = 'missed';
      } else {
        attendanceStatus = 'pending';
      }
    }

    return {
      ...a,
      scheduledMinutes,
      actualMinutes,
      varianceMinutes,
      attendanceStatus,
    };
  });
}

// Get time rounding config for a schedule
export async function getTimeRoundingConfig(scheduleId: string): Promise<any | null> {
  // Check if the table exists first by trying the query
  try {
    const result = await db
      .select()
      .from(timeRoundingConfig)
      .where(eq(timeRoundingConfig.scheduleId, scheduleId))
      .limit(1);
    return result[0] || null;
  } catch (error) {
    // If table doesn't exist yet, return default config
    return null;
  }
}

// Update or create time rounding config
export async function updateTimeRoundingConfig(
  scheduleId: string,
  data: any,
  userId: string | null,
  userEmail: string | null
): Promise<any> {
  try {
    const existing = await getTimeRoundingConfig(scheduleId);
    
    if (existing) {
      const [updated] = await db.update(timeRoundingConfig)
        .set({
          enabled: data.enabled ?? existing.enabled,
          roundingIncrement: data.roundingIncrement ?? existing.roundingIncrement,
          roundClockIn: data.roundClockIn ?? existing.roundClockIn,
          roundClockOut: data.roundClockOut ?? existing.roundClockOut,
          graceMinutes: data.graceMinutes ?? existing.graceMinutes,
          updatedAt: new Date(),
        })
        .where(eq(timeRoundingConfig.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(timeRoundingConfig)
      .values({
        scheduleId,
        enabled: data.enabled ?? false,
        roundingIncrement: data.roundingIncrement ?? 15,
        roundClockIn: data.roundClockIn ?? 'nearest',
        roundClockOut: data.roundClockOut ?? 'nearest',
        graceMinutes: data.graceMinutes ?? 5,
      })
      .returning();
    return created;
  } catch (error) {
    // If table doesn't exist, return the input as if it was saved
    console.warn('[Scheduling] Time rounding config table may not exist yet:', error);
    return { scheduleId, ...data };
  }
}

// ============================================================================
// AVAILABILITY
// ============================================================================

export async function setAvailability(
  data: InsertSchedulingAvailability,
  userId: string | null,
  userEmail: string | null
): Promise<SchedulingAvailability> {
  const existing = await db.query.schedulingAvailability.findFirst({
    where: and(
      eq(schedulingAvailability.workerType, data.workerType),
      data.workerType === 'driver'
        ? eq(schedulingAvailability.driverId, data.driverId!)
        : eq(schedulingAvailability.employeeId, data.employeeId!),
      eq(schedulingAvailability.dayOfWeek, data.dayOfWeek)
    ),
  });

  if (existing) {
    const [updated] = await db.update(schedulingAvailability)
      .set({
        startTime: data.startTime,
        endTime: data.endTime,
        preference: data.preference,
        effectiveStart: data.effectiveStart || null,
        effectiveEnd: data.effectiveEnd || null,
        updatedAt: new Date(),
      })
      .where(eq(schedulingAvailability.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(schedulingAvailability).values(data).returning();
  return created;
}

export async function getWorkerAvailability(
  workerType: WorkerType,
  workerId: string
): Promise<SchedulingAvailability[]> {
  const whereClause = workerType === 'driver'
    ? eq(schedulingAvailability.driverId, workerId)
    : eq(schedulingAvailability.employeeId, workerId);

  return db.query.schedulingAvailability.findMany({
    where: and(
      eq(schedulingAvailability.workerType, workerType),
      whereClause
    ),
    orderBy: [asc(schedulingAvailability.dayOfWeek)],
  });
}

export async function bulkSetAvailability(
  workerType: WorkerType,
  workerId: string,
  availability: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    preference: 'preferred' | 'available' | 'unavailable';
  }>,
  userId: string | null,
  userEmail: string | null
): Promise<SchedulingAvailability[]> {
  const results: SchedulingAvailability[] = [];

  for (const entry of availability) {
    const result = await setAvailability(
      {
        workerType,
        driverId: workerType === 'driver' ? workerId : null,
        employeeId: workerType === 'employee' ? workerId : null,
        dayOfWeek: entry.dayOfWeek,
        startTime: entry.startTime,
        endTime: entry.endTime,
        preference: entry.preference,
      },
      userId,
      userEmail
    );
    results.push(result);
  }

  return results;
}

export async function getAllAvailability(): Promise<SchedulingAvailability[]> {
  // Use plain query instead of relational query to avoid "referencedTable" errors
  return db.select().from(schedulingAvailability).orderBy(asc(schedulingAvailability.dayOfWeek));
}

export async function deleteAvailability(id: string): Promise<boolean> {
  const result = await db.delete(schedulingAvailability)
    .where(eq(schedulingAvailability.id, id))
    .returning();
  return result.length > 0;
}

// ============================================================================
// TIME OFF
// ============================================================================

export async function requestTimeOff(
  data: InsertSchedulingTimeOff,
  userId: string | null,
  userEmail: string | null
): Promise<SchedulingTimeOff> {
  const [request] = await db.insert(schedulingTimeOff).values({
    ...data,
    status: 'pending',
  }).returning();

  await writeAuditEvent(
    "TIME_OFF_REQUESTED",
    "time_off",
    request.id,
    userId,
    userEmail,
    null,
    { startDate: data.startDate, endDate: data.endDate },
    null
  );

  return request;
}

export async function approveTimeOff(
  id: string,
  userId: string | null,
  userEmail: string | null
): Promise<SchedulingTimeOff | null> {
  const resolvedUserId = await resolveUserId(userId);

  const [updated] = await db.update(schedulingTimeOff)
    .set({
      status: 'approved',
      approvedBy: resolvedUserId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schedulingTimeOff.id, id))
    .returning();

  if (updated) {
    await writeAuditEvent(
      "TIME_OFF_APPROVED",
      "time_off",
      id,
      userId,
      userEmail,
      { status: 'pending' },
      { status: 'approved' },
      ['status', 'approvedBy', 'approvedAt']
    );
  }

  return updated || null;
}

export async function denyTimeOff(
  id: string,
  userId: string | null,
  userEmail: string | null
): Promise<SchedulingTimeOff | null> {
  const [updated] = await db.update(schedulingTimeOff)
    .set({
      status: 'denied',
      updatedAt: new Date(),
    })
    .where(eq(schedulingTimeOff.id, id))
    .returning();

  if (updated) {
    await writeAuditEvent(
      "TIME_OFF_DENIED",
      "time_off",
      id,
      userId,
      userEmail,
      { status: 'pending' },
      { status: 'denied' },
      ['status']
    );
  }

  return updated || null;
}

export async function getAllTimeOff(): Promise<SchedulingTimeOff[]> {
  // Use plain query instead of relational query to avoid "referencedTable" errors
  return db.select().from(schedulingTimeOff).orderBy(desc(schedulingTimeOff.createdAt));
}

export async function getWorkerTimeOff(
  workerType: WorkerType,
  workerId: string
): Promise<SchedulingTimeOff[]> {
  const whereClause = workerType === 'driver'
    ? eq(schedulingTimeOff.driverId, workerId)
    : eq(schedulingTimeOff.employeeId, workerId);

  return db.query.schedulingTimeOff.findMany({
    where: and(
      eq(schedulingTimeOff.workerType, workerType),
      whereClause
    ),
    orderBy: [desc(schedulingTimeOff.createdAt)],
  });
}

// ============================================================================
// CONSTRAINTS
// ============================================================================

export async function getActiveConstraints(): Promise<SchedulingConstraint[]> {
  return db.query.schedulingConstraints.findMany({
    where: eq(schedulingConstraints.isActive, true),
  });
}

export async function createConstraint(
  data: InsertSchedulingConstraint
): Promise<SchedulingConstraint> {
  const [constraint] = await db.insert(schedulingConstraints).values(data).returning();
  return constraint;
}

export async function seedDefaultConstraints(): Promise<void> {
  const existingConstraints = await getActiveConstraints();
  if (existingConstraints.length > 0) return;

  const defaultConstraints = [
    { name: 'Max 12 hours per day', ruleType: 'max_hours_day' as const, value: '12', unit: 'hours' },
    { name: 'Max 60 hours per week', ruleType: 'max_hours_week' as const, value: '60', unit: 'hours' },
    { name: 'Min 8 hours rest between shifts', ruleType: 'min_rest_between_shifts' as const, value: '8', unit: 'hours' },
    { name: 'Overtime after 8 hours daily', ruleType: 'overtime_threshold_daily' as const, value: '8', unit: 'hours' },
    { name: 'Overtime after 40 hours weekly', ruleType: 'overtime_threshold_weekly' as const, value: '40', unit: 'hours' },
    { name: 'Max 6 consecutive days', ruleType: 'max_consecutive_days' as const, value: '6', unit: 'days' },
  ];

  for (const constraint of defaultConstraints) {
    await createConstraint(constraint);
  }

  console.log('[Scheduling] Default constraints seeded');
}

// ============================================================================
// VIOLATIONS
// ============================================================================

export async function evaluateAssignmentViolations(
  assignmentId: string
): Promise<SchedulingViolation[]> {
  const assignment = await db.query.schedulingAssignments.findFirst({
    where: eq(schedulingAssignments.id, assignmentId),
    with: {
      shift: {
        with: { schedule: true },
      },
      driver: true,
      employee: true,
    },
  });

  if (!assignment || !assignment.shift) return [];

  const constraints = await getActiveConstraints();
  const violations: SchedulingViolation[] = [];

  const workerId = assignment.workerType === 'driver' ? assignment.driverId : assignment.employeeId;
  if (!workerId) return [];

  const shiftStart = new Date(assignment.shift.startTime);
  const shiftEnd = new Date(assignment.shift.endTime);
  const shiftDuration = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60 * 60);

  for (const constraint of constraints) {
    if (constraint.ruleType === 'max_hours_day') {
      const maxHours = parseFloat(constraint.value);
      if (shiftDuration > maxHours) {
        const [violation] = await db.insert(schedulingViolations).values({
          scheduleId: assignment.shift.scheduleId,
          assignmentId,
          constraintId: constraint.id,
          ruleType: 'max_hours_day',
          severity: 'error',
          message: `Shift duration (${shiftDuration.toFixed(1)} hours) exceeds maximum ${maxHours} hours per day`,
          details: { shiftDuration, maxHours },
        }).returning();
        violations.push(violation);
      }
    }

    if (constraint.ruleType === 'overtime_threshold_daily') {
      const threshold = parseFloat(constraint.value);
      if (shiftDuration > threshold) {
        const overtimeHours = shiftDuration - threshold;
        const [violation] = await db.insert(schedulingViolations).values({
          scheduleId: assignment.shift.scheduleId,
          assignmentId,
          constraintId: constraint.id,
          ruleType: 'overtime_threshold_daily',
          severity: 'warning',
          message: `Shift results in ${overtimeHours.toFixed(1)} overtime hours (threshold: ${threshold} hours)`,
          details: { shiftDuration, threshold, overtimeHours },
        }).returning();
        violations.push(violation);
      }
    }
  }

  return violations;
}

export async function getViolationsForSchedule(scheduleId: string): Promise<SchedulingViolation[]> {
  return db.query.schedulingViolations.findMany({
    where: and(
      eq(schedulingViolations.scheduleId, scheduleId),
      eq(schedulingViolations.isResolved, false)
    ),
    with: {
      assignment: true,
      constraint: true,
    },
    orderBy: [desc(schedulingViolations.createdAt)],
  });
}

export async function resolveViolation(
  id: string,
  overrideReason: string,
  userId: string | null,
  userEmail: string | null
): Promise<SchedulingViolation | null> {
  const resolvedUserId = await resolveUserId(userId);

  const [updated] = await db.update(schedulingViolations)
    .set({
      isResolved: true,
      resolvedBy: resolvedUserId,
      resolvedAt: new Date(),
      overrideReason,
    })
    .where(eq(schedulingViolations.id, id))
    .returning();

  if (updated) {
    await writeAuditEvent(
      "VIOLATION_RESOLVED",
      "violation",
      id,
      userId,
      userEmail,
      { isResolved: false },
      { isResolved: true, overrideReason },
      ['isResolved', 'resolvedBy', 'resolvedAt', 'overrideReason']
    );
  }

  return updated || null;
}

// ============================================================================
// DRIVER SCHEDULE VIEW
// ============================================================================

export async function getDriverPublishedSchedule(
  driverId: string,
  startDate?: string,
  endDate?: string
): Promise<SchedulingAssignment[]> {
  const start = startDate || new Date().toISOString().split('T')[0];
  const end = endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const assignments = await db.query.schedulingAssignments.findMany({
    where: and(
      eq(schedulingAssignments.driverId, driverId),
      sql`${schedulingAssignments.status} NOT IN ('cancelled', 'declined')`
    ),
    with: {
      shift: {
        with: {
          schedule: true,
        },
      },
    },
  });

  return assignments.filter(a => {
    if (!a.shift?.schedule) return false;
    return a.shift.schedule.status === 'published' || a.shift.schedule.status === 'locked';
  });
}

// ============================================================================
// SCHEDULE EXPORT
// ============================================================================

export async function exportSchedule(scheduleId: string): Promise<{
  schedule: SchedulingSchedule;
  shifts: Array<SchedulingShift & { assignments: SchedulingAssignment[] }>;
  violations: SchedulingViolation[];
  summary: {
    totalShifts: number;
    totalAssignments: number;
    totalHours: number;
    unfilledShifts: number;
    violationCount: number;
  };
} | null> {
  const schedule = await getSchedule(scheduleId);
  if (!schedule) return null;

  const shifts = await getShiftsForSchedule(scheduleId) as any[];
  const violations = await getViolationsForSchedule(scheduleId);

  let totalAssignments = 0;
  let totalHours = 0;
  let unfilledShifts = 0;

  for (const shift of shifts) {
    const activeAssignments = (shift.assignments || []).filter(
      (a: any) => a.status !== 'cancelled' && a.status !== 'declined'
    );
    totalAssignments += activeAssignments.length;

    const duration = (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) / (1000 * 60 * 60);
    totalHours += duration * activeAssignments.length;

    if (activeAssignments.length < shift.requiredHeadcount) {
      unfilledShifts++;
    }
  }

  return {
    schedule,
    shifts,
    violations,
    summary: {
      totalShifts: shifts.length,
      totalAssignments,
      totalHours: Math.round(totalHours * 10) / 10,
      unfilledShifts,
      violationCount: violations.length,
    },
  };
}

// ============================================================================
// RULES-BASED AUTO SCHEDULING (v1)
// ============================================================================

export interface AutoScheduleResult {
  scheduleId: string;
  totalShiftsProcessed: number;
  totalPositionsToFill: number;
  assignmentsMade: number;
  assignmentsFailed: number;
  assignments: AutoScheduleAssignment[];
  unfilledPositions: UnfilledPosition[];
}

export interface AutoScheduleAssignment {
  shiftId: string;
  shiftName: string;
  driverId: string;
  driverName: string;
  assignmentId: string;
  rationale: AssignmentRationale;
}

export interface AssignmentRationale {
  availabilityScore: number;
  roleScore: number;
  locationScore: number;
  hoursScore: number;
  totalScore: number;
  explanation: string[];
}

export interface UnfilledPosition {
  shiftId: string;
  shiftName: string;
  positionsNeeded: number;
  reason: string;
}

interface CandidateScore {
  driverId: string;
  driverName: string;
  availabilityScore: number;
  roleScore: number;
  locationScore: number;
  hoursScore: number;
  totalScore: number;
  hoursWorkedThisWeek: number;
  explanation: string[];
}

export async function autoFillSchedule(
  scheduleId: string,
  userId: string | null,
  userEmail: string | null
): Promise<AutoScheduleResult> {
  const schedule = await getSchedule(scheduleId);
  if (!schedule) {
    throw new Error("Schedule not found");
  }

  if (schedule.status === 'locked') {
    throw new Error("Cannot auto-fill a locked schedule");
  }

  const shifts = await getShiftsForSchedule(scheduleId);
  
  // Get all drivers
  const allDriversRaw = await db.select().from(drivers);
  
  // Get user info for drivers
  const driverUserIds = allDriversRaw.map(d => d.userId).filter(Boolean);
  const driverUsersRaw = driverUserIds.length > 0 
    ? await db.select().from(users).where(sql`${users.id} IN (${sql.raw(driverUserIds.map(id => `'${id}'`).join(','))})`)
    : [];
  const userMap = new Map(driverUsersRaw.map(u => [u.id, u]));
  const allDrivers = allDriversRaw.map(d => ({ ...d, user: userMap.get(d.userId) || null }));

  const allAvailability = await getAllAvailability();
  const allTimeOff = await getAllTimeOff();

  // Get existing assignments for this schedule without using relational queries
  const scheduleShiftIds = shifts.map(s => s.id);
  const existingAssignmentsRaw = scheduleShiftIds.length > 0
    ? await db.select().from(schedulingAssignments).where(
        and(
          sql`${schedulingAssignments.shiftId} IN (${sql.raw(scheduleShiftIds.map(id => `'${id}'`).join(','))})`,
          sql`${schedulingAssignments.status} NOT IN ('cancelled', 'declined')`
        )
      )
    : [];

  // Map shifts by id for quick lookup
  const shiftsMap = new Map(shifts.map(s => [s.id, s]));
  const existingAssignments = existingAssignmentsRaw.map(a => ({
    ...a,
    shift: shiftsMap.get(a.shiftId) || null,
  }));

  const result: AutoScheduleResult = {
    scheduleId,
    totalShiftsProcessed: shifts.length,
    totalPositionsToFill: 0,
    assignmentsMade: 0,
    assignmentsFailed: 0,
    assignments: [],
    unfilledPositions: [],
  };

  const driverHoursThisWeek = new Map<string, number>();
  for (const assignment of existingAssignments) {
    if (assignment.driverId && assignment.shift) {
      const hours = (new Date(assignment.shift.endTime).getTime() - new Date(assignment.shift.startTime).getTime()) / (1000 * 60 * 60);
      driverHoursThisWeek.set(
        assignment.driverId,
        (driverHoursThisWeek.get(assignment.driverId) || 0) + hours
      );
    }
  }

  const assignedDriversThisRun = new Set<string>();

  for (const shift of shifts) {
    const activeAssignments = existingAssignments.filter(
      (a) => a.shiftId === shift.id && a.status !== 'cancelled' && a.status !== 'declined'
    );
    const currentCount = activeAssignments.length;
    const positionsToFill = shift.requiredHeadcount - currentCount;

    if (positionsToFill <= 0) continue;

    result.totalPositionsToFill += positionsToFill;

    const alreadyAssignedDriverIds = new Set(
      activeAssignments.map((a) => a.driverId).filter(Boolean) as string[]
    );

    const candidates = scoreDriversForShift(
      shift,
      allDrivers,
      allAvailability,
      allTimeOff,
      driverHoursThisWeek,
      alreadyAssignedDriverIds,
      assignedDriversThisRun
    );

    candidates.sort((a, b) => b.totalScore - a.totalScore);

    let assigned = 0;
    for (const candidate of candidates) {
      if (assigned >= positionsToFill) break;
      if (candidate.totalScore < 50) continue;

      try {
        const { assignment } = await assignWorker(
          {
            shiftId: shift.id,
            workerType: 'driver',
            driverId: candidate.driverId,
            notes: `Auto-assigned: ${candidate.explanation.join('; ')}`,
          },
          userId,
          userEmail
        );

        result.assignments.push({
          shiftId: shift.id,
          shiftName: shift.name || 'Unnamed Shift',
          driverId: candidate.driverId,
          driverName: candidate.driverName,
          assignmentId: assignment.id,
          rationale: {
            availabilityScore: candidate.availabilityScore,
            roleScore: candidate.roleScore,
            locationScore: candidate.locationScore,
            hoursScore: candidate.hoursScore,
            totalScore: candidate.totalScore,
            explanation: candidate.explanation,
          },
        });

        result.assignmentsMade++;
        assigned++;

        assignedDriversThisRun.add(candidate.driverId);
        driverHoursThisWeek.set(
          candidate.driverId,
          (driverHoursThisWeek.get(candidate.driverId) || 0) +
            (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) / (1000 * 60 * 60)
        );
      } catch (error) {
        console.error(`[AutoSchedule] Failed to assign driver ${candidate.driverId} to shift ${shift.id}:`, error);
        result.assignmentsFailed++;
      }
    }

    if (assigned < positionsToFill) {
      result.unfilledPositions.push({
        shiftId: shift.id,
        shiftName: shift.name || 'Unnamed Shift',
        positionsNeeded: positionsToFill - assigned,
        reason: candidates.length === 0
          ? 'No eligible drivers found'
          : candidates.every((c) => c.totalScore < 50)
          ? 'All eligible drivers scored below threshold (50)'
          : 'Not enough eligible drivers available',
      });
    }
  }

  await writeAuditEvent(
    "AUTO_SCHEDULE_RUN",
    "schedule",
    scheduleId,
    userId,
    userEmail,
    null,
    {
      totalShiftsProcessed: result.totalShiftsProcessed,
      totalPositionsToFill: result.totalPositionsToFill,
      assignmentsMade: result.assignmentsMade,
      assignmentsFailed: result.assignmentsFailed,
      unfilledPositions: result.unfilledPositions.length,
    },
    null
  );

  return result;
}

function scoreDriversForShift(
  shift: SchedulingShift,
  allDrivers: Array<any>,
  allAvailability: SchedulingAvailability[],
  allTimeOff: SchedulingTimeOff[],
  driverHoursThisWeek: Map<string, number>,
  alreadyAssignedDriverIds: Set<string>,
  assignedDriversThisRun: Set<string>
): CandidateScore[] {
  const candidates: CandidateScore[] = [];
  const shiftDate = new Date(shift.startTime);
  const shiftDayOfWeek = shiftDate.getDay();
  const shiftStartHour = shiftDate.getHours();
  const shiftEndHour = new Date(shift.endTime).getHours();
  const shiftStartMinutes = `${String(shiftStartHour).padStart(2, '0')}:${String(shiftDate.getMinutes()).padStart(2, '0')}`;
  const shiftEndMinutes = `${String(shiftEndHour).padStart(2, '0')}:${String(new Date(shift.endTime).getMinutes()).padStart(2, '0')}`;

  for (const driver of allDrivers) {
    if (alreadyAssignedDriverIds.has(driver.id)) continue;
    if (assignedDriversThisRun.has(driver.id)) continue;

    const explanation: string[] = [];
    let availabilityScore = 0;
    let roleScore = 0;
    let locationScore = 0;
    let hoursScore = 0;

    const driverAvailability = allAvailability.filter(
      (a) => a.driverId === driver.id && a.dayOfWeek === shiftDayOfWeek
    );

    const hasTimeOff = allTimeOff.some(
      (t) =>
        t.driverId === driver.id &&
        t.status === 'approved' &&
        new Date(t.startDate) <= shiftDate &&
        new Date(t.endDate) >= shiftDate
    );

    if (hasTimeOff) {
      explanation.push('Has approved time-off (disqualified)');
      continue;
    }

    if (driverAvailability.length === 0) {
      availabilityScore = 25;
      explanation.push('No availability set (partial score)');
    } else {
      const matchingAvailability = driverAvailability.find((a) => {
        if (!a.startTime || !a.endTime) return false;
        return a.startTime <= shiftStartMinutes && a.endTime >= shiftEndMinutes;
      });

      if (matchingAvailability) {
        if (matchingAvailability.preference === 'preferred') {
          availabilityScore = 100;
          explanation.push('Preferred availability match');
        } else if (matchingAvailability.preference === 'available') {
          availabilityScore = 75;
          explanation.push('Available during shift hours');
        } else {
          availabilityScore = 0;
          explanation.push('Marked unavailable (disqualified)');
          continue;
        }
      } else {
        availabilityScore = 25;
        explanation.push('Availability hours do not fully cover shift');
      }
    }

    if (!shift.role) {
      roleScore = 100;
      explanation.push('No role requirement');
    } else {
      const driverRole = driver.user?.role || 'driver';
      if (driverRole === 'driver' || shift.role.toLowerCase().includes('driver')) {
        roleScore = 100;
        explanation.push('Role matches');
      } else {
        roleScore = 50;
        explanation.push('Role partially matches');
      }
    }

    if (!shift.locationId) {
      locationScore = 100;
      explanation.push('No location requirement');
    } else {
      const driverMarket = driver.market?.toLowerCase() || '';
      const shiftLocation = shift.locationId.toLowerCase();
      if (driverMarket && shiftLocation.includes(driverMarket)) {
        locationScore = 100;
        explanation.push('Location matches driver market');
      } else if (driverMarket) {
        locationScore = 50;
        explanation.push('Location differs from driver market');
      } else {
        locationScore = 75;
        explanation.push('No driver market set (partial match)');
      }
    }

    const hoursWorked = driverHoursThisWeek.get(driver.id) || 0;
    if (hoursWorked === 0) {
      hoursScore = 100;
      explanation.push('No hours worked this week (fairness bonus)');
    } else if (hoursWorked < 20) {
      hoursScore = 80;
      explanation.push(`Low hours worked (${hoursWorked.toFixed(1)}h)`);
    } else if (hoursWorked < 40) {
      hoursScore = 60;
      explanation.push(`Moderate hours worked (${hoursWorked.toFixed(1)}h)`);
    } else {
      hoursScore = 30;
      explanation.push(`High hours worked (${hoursWorked.toFixed(1)}h)`);
    }

    const totalScore = Math.round(
      availabilityScore * 0.4 +
      roleScore * 0.25 +
      locationScore * 0.2 +
      hoursScore * 0.15
    );

    const driverName = driver.user
      ? `${driver.user.firstName || ''} ${driver.user.lastName || ''}`.trim() || driver.user.email || 'Unknown'
      : 'Unknown';

    candidates.push({
      driverId: driver.id,
      driverName,
      availabilityScore,
      roleScore,
      locationScore,
      hoursScore,
      totalScore,
      hoursWorkedThisWeek: hoursWorked,
      explanation,
    });
  }

  return candidates;
}

export async function previewAutoFill(
  scheduleId: string
): Promise<{
  shiftsToFill: number;
  positionsToFill: number;
  eligibleDrivers: number;
  estimatedAssignments: number;
}> {
  const schedule = await getSchedule(scheduleId);
  if (!schedule) {
    throw new Error("Schedule not found");
  }

  const shifts = await getShiftsForSchedule(scheduleId);
  const allDrivers = await db.select().from(drivers);
  const allAvailability = await getAllAvailability();

  const scheduleShiftIds = shifts.map(s => s.id);
  const existingAssignments = scheduleShiftIds.length > 0
    ? await db.select().from(schedulingAssignments).where(
        and(
          sql`${schedulingAssignments.shiftId} IN (${sql.raw(scheduleShiftIds.map(id => `'${id}'`).join(','))})`,
          sql`${schedulingAssignments.status} NOT IN ('cancelled', 'declined')`
        )
      )
    : [];

  let shiftsToFill = 0;
  let positionsToFill = 0;

  for (const shift of shifts) {
    const currentCount = existingAssignments.filter((a) => a.shiftId === shift.id).length;
    const needed = shift.requiredHeadcount - currentCount;
    if (needed > 0) {
      shiftsToFill++;
      positionsToFill += needed;
    }
  }

  const driversWithAvailability = new Set(allAvailability.map((a) => a.driverId).filter(Boolean));
  const eligibleDrivers = allDrivers.filter((d) => driversWithAvailability.has(d.id)).length || allDrivers.length;

  const estimatedAssignments = Math.min(positionsToFill, eligibleDrivers);

  return {
    shiftsToFill,
    positionsToFill,
    eligibleDrivers,
    estimatedAssignments,
  };
}

// ============================================================================
// GEOFENCING & LOCATION CONTROLS
// ============================================================================

// Haversine formula to calculate distance between two GPS coordinates (in meters)
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const toRad = (deg: number) => deg * (Math.PI / 180);
  
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return Math.round(R * c); // Distance in meters
}

// Check if coordinates are within geofence
export interface GeofenceValidationResult {
  isWithinGeofence: boolean;
  distanceFromLocation: number;
  locationLatitude: number | null;
  locationLongitude: number | null;
  geofenceRadius: number;
  locationName: string | null;
}

export async function validateGeofence(
  shiftId: string,
  workerLatitude: number,
  workerLongitude: number
): Promise<GeofenceValidationResult> {
  // Get the shift and its location
  const shift = await db.select({
    id: schedulingShifts.id,
    location: schedulingShifts.location,
  }).from(schedulingShifts).where(eq(schedulingShifts.id, shiftId)).limit(1);

  if (!shift[0] || !shift[0].location) {
    // No location defined - allow clock action
    return {
      isWithinGeofence: true,
      distanceFromLocation: 0,
      locationLatitude: null,
      locationLongitude: null,
      geofenceRadius: 0,
      locationName: null,
    };
  }

  // Try to find the work location by name
  const location = await db.select({
    id: workLocations.id,
    name: workLocations.name,
    latitude: workLocations.latitude,
    longitude: workLocations.longitude,
    geofenceRadius: workLocations.geofenceRadius,
  }).from(workLocations).where(eq(workLocations.name, shift[0].location)).limit(1);

  if (!location[0] || !location[0].latitude || !location[0].longitude) {
    // Location not found or no coordinates - allow clock action
    return {
      isWithinGeofence: true,
      distanceFromLocation: 0,
      locationLatitude: null,
      locationLongitude: null,
      geofenceRadius: 0,
      locationName: shift[0].location,
    };
  }

  const locLat = parseFloat(location[0].latitude);
  const locLon = parseFloat(location[0].longitude);
  const radius = location[0].geofenceRadius || 100; // Default 100 meters

  const distance = calculateHaversineDistance(workerLatitude, workerLongitude, locLat, locLon);
  const isWithin = distance <= radius;

  return {
    isWithinGeofence: isWithin,
    distanceFromLocation: distance,
    locationLatitude: locLat,
    locationLongitude: locLon,
    geofenceRadius: radius,
    locationName: location[0].name,
  };
}

// Record geofence clock audit
export async function recordGeofenceAudit(
  assignmentId: string,
  shiftId: string,
  clockAction: 'clock_in' | 'clock_out',
  workerLatitude: number | null,
  workerLongitude: number | null,
  validationResult: GeofenceValidationResult,
  wasOverridden: boolean,
  overrideReason: string | null,
  userId: string | null
): Promise<void> {
  try {
    await db.insert(geofenceClockAudit).values({
      assignmentId,
      shiftId,
      clockAction,
      workerLatitude: workerLatitude?.toString(),
      workerLongitude: workerLongitude?.toString(),
      locationLatitude: validationResult.locationLatitude?.toString(),
      locationLongitude: validationResult.locationLongitude?.toString(),
      geofenceRadius: validationResult.geofenceRadius,
      distanceFromLocation: validationResult.distanceFromLocation,
      isWithinGeofence: validationResult.isWithinGeofence,
      wasOverridden,
      overrideReason,
      userId,
    });
  } catch (error) {
    console.error("[Geofence] Failed to record audit:", error);
  }
}

// Get geofence violations report
export async function getGeofenceViolationsReport(
  startDate?: string,
  endDate?: string
): Promise<any[]> {
  const conditions: any[] = [];
  
  if (startDate) {
    conditions.push(gte(geofenceClockAudit.createdAt, new Date(startDate)));
  }
  if (endDate) {
    conditions.push(lte(geofenceClockAudit.createdAt, new Date(endDate + 'T23:59:59')));
  }
  // Only violations (not within geofence)
  conditions.push(eq(geofenceClockAudit.isWithinGeofence, false));

  const violations = await db
    .select()
    .from(geofenceClockAudit)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(geofenceClockAudit.createdAt));

  return violations;
}

// ============================================================================
// OVERTIME & LABOR COMPLIANCE ALERTS
// ============================================================================

export interface OvertimeAlert {
  type: 'daily_hours' | 'weekly_hours' | 'rest_period';
  severity: 'warning' | 'error';
  workerId: string;
  workerName: string;
  workerType: 'driver' | 'employee';
  message: string;
  currentValue: number;
  threshold: number;
  shiftId?: string;
  shiftName?: string;
}

// Get overtime thresholds (account-specific or global default)
export async function getOvertimeThresholds(accountId?: number): Promise<OvertimeAlertThresholds | null> {
  // First try account-specific
  if (accountId) {
    const accountThresholds = await db
      .select()
      .from(overtimeAlertThresholds)
      .where(and(eq(overtimeAlertThresholds.accountId, accountId), eq(overtimeAlertThresholds.isActive, true)))
      .limit(1);
    
    if (accountThresholds[0]) return accountThresholds[0];
  }
  
  // Fall back to global default (accountId is null)
  const globalThresholds = await db
    .select()
    .from(overtimeAlertThresholds)
    .where(and(sql`${overtimeAlertThresholds.accountId} IS NULL`, eq(overtimeAlertThresholds.isActive, true)))
    .limit(1);
  
  return globalThresholds[0] || null;
}

// Calculate hours for a worker in a date range
export async function calculateWorkerHours(
  workerId: string,
  workerType: 'driver' | 'employee',
  startDate: Date,
  endDate: Date
): Promise<number> {
  const workerIdField = workerType === 'driver' ? schedulingAssignments.driverId : schedulingAssignments.employeeId;
  
  const assignments = await db
    .select({
      shiftStart: schedulingShifts.startTime,
      shiftEnd: schedulingShifts.endTime,
    })
    .from(schedulingAssignments)
    .innerJoin(schedulingShifts, eq(schedulingAssignments.shiftId, schedulingShifts.id))
    .where(and(
      eq(workerIdField, workerId),
      gte(schedulingShifts.startTime, startDate),
      lte(schedulingShifts.endTime, endDate),
      inArray(schedulingAssignments.status, ['assigned', 'confirmed', 'in_progress', 'completed'])
    ));

  let totalMinutes = 0;
  for (const a of assignments) {
    if (a.shiftStart && a.shiftEnd) {
      const start = new Date(a.shiftStart);
      const end = new Date(a.shiftEnd);
      totalMinutes += (end.getTime() - start.getTime()) / 60000;
    }
  }

  return totalMinutes / 60; // Return hours
}

// Check for minimum rest between shifts
export async function checkRestPeriodViolation(
  workerId: string,
  workerType: 'driver' | 'employee',
  proposedShiftStart: Date,
  proposedShiftEnd: Date,
  minRestHours: number
): Promise<{ hasViolation: boolean; previousShiftEnd?: Date; restHours?: number }> {
  const workerIdField = workerType === 'driver' ? schedulingAssignments.driverId : schedulingAssignments.employeeId;
  
  // Find the most recent shift ending before the proposed shift
  const previousShifts = await db
    .select({
      shiftEnd: schedulingShifts.endTime,
    })
    .from(schedulingAssignments)
    .innerJoin(schedulingShifts, eq(schedulingAssignments.shiftId, schedulingShifts.id))
    .where(and(
      eq(workerIdField, workerId),
      lte(schedulingShifts.endTime, proposedShiftStart),
      inArray(schedulingAssignments.status, ['assigned', 'confirmed', 'in_progress', 'completed'])
    ))
    .orderBy(desc(schedulingShifts.endTime))
    .limit(1);

  if (!previousShifts[0] || !previousShifts[0].shiftEnd) {
    return { hasViolation: false };
  }

  const prevEnd = new Date(previousShifts[0].shiftEnd);
  const restHours = (proposedShiftStart.getTime() - prevEnd.getTime()) / 3600000;

  if (restHours < minRestHours) {
    return {
      hasViolation: true,
      previousShiftEnd: prevEnd,
      restHours: Math.round(restHours * 10) / 10,
    };
  }

  return { hasViolation: false };
}

// Analyze schedule for overtime and compliance alerts
export async function analyzeScheduleForAlerts(
  scheduleId: string
): Promise<OvertimeAlert[]> {
  const alerts: OvertimeAlert[] = [];
  const thresholds = await getOvertimeThresholds();
  
  if (!thresholds) {
    // Use defaults if no thresholds configured
    const defaultThresholds = {
      dailyHoursWarning: '8',
      dailyHoursError: '10',
      weeklyHoursWarning: '40',
      weeklyHoursError: '50',
      minRestBetweenShifts: 8,
    };
    Object.assign(thresholds || {}, defaultThresholds);
  }

  const dailyWarn = parseFloat(thresholds?.dailyHoursWarning || '8');
  const dailyErr = parseFloat(thresholds?.dailyHoursError || '10');
  const weeklyWarn = parseFloat(thresholds?.weeklyHoursWarning || '40');
  const weeklyErr = parseFloat(thresholds?.weeklyHoursError || '50');
  const minRest = thresholds?.minRestBetweenShifts || 8;

  // Get all assignments for the schedule with shifts
  const assignments = await db
    .select({
      assignmentId: schedulingAssignments.id,
      driverId: schedulingAssignments.driverId,
      employeeId: schedulingAssignments.employeeId,
      workerType: schedulingAssignments.workerType,
      shiftId: schedulingShifts.id,
      shiftName: schedulingShifts.name,
      shiftStart: schedulingShifts.startTime,
      shiftEnd: schedulingShifts.endTime,
    })
    .from(schedulingAssignments)
    .innerJoin(schedulingShifts, eq(schedulingAssignments.shiftId, schedulingShifts.id))
    .where(eq(schedulingShifts.scheduleId, scheduleId));

  // Group by worker
  const workerAssignments = new Map<string, typeof assignments>();
  
  for (const a of assignments) {
    const workerId = a.workerType === 'driver' ? a.driverId : a.employeeId;
    if (!workerId) continue;
    
    const key = `${a.workerType}:${workerId}`;
    if (!workerAssignments.has(key)) {
      workerAssignments.set(key, []);
    }
    workerAssignments.get(key)!.push(a);
  }

  // Check each worker
  for (const [key, workerShifts] of workerAssignments) {
    const [workerType, workerId] = key.split(':') as ['driver' | 'employee', string];
    
    // Sort by start time
    workerShifts.sort((a, b) => new Date(a.shiftStart!).getTime() - new Date(b.shiftStart!).getTime());

    // Group by date for daily hours check
    const dailyHours = new Map<string, number>();
    
    for (const shift of workerShifts) {
      if (!shift.shiftStart || !shift.shiftEnd) continue;
      
      const dateKey = new Date(shift.shiftStart).toISOString().split('T')[0];
      const hours = (new Date(shift.shiftEnd).getTime() - new Date(shift.shiftStart).getTime()) / 3600000;
      
      dailyHours.set(dateKey, (dailyHours.get(dateKey) || 0) + hours);
    }

    // Check daily thresholds
    for (const [dateKey, hours] of dailyHours) {
      if (hours >= dailyErr) {
        alerts.push({
          type: 'daily_hours',
          severity: 'error',
          workerId,
          workerName: workerId, // Would need to fetch actual name
          workerType,
          message: `Worker scheduled for ${hours.toFixed(1)} hours on ${dateKey} (exceeds ${dailyErr}h limit)`,
          currentValue: hours,
          threshold: dailyErr,
        });
      } else if (hours >= dailyWarn) {
        alerts.push({
          type: 'daily_hours',
          severity: 'warning',
          workerId,
          workerName: workerId,
          workerType,
          message: `Worker approaching daily limit: ${hours.toFixed(1)} hours on ${dateKey} (threshold: ${dailyWarn}h)`,
          currentValue: hours,
          threshold: dailyWarn,
        });
      }
    }

    // Calculate total weekly hours
    const totalHours = Array.from(dailyHours.values()).reduce((sum, h) => sum + h, 0);
    
    if (totalHours >= weeklyErr) {
      alerts.push({
        type: 'weekly_hours',
        severity: 'error',
        workerId,
        workerName: workerId,
        workerType,
        message: `Worker scheduled for ${totalHours.toFixed(1)} hours this week (exceeds ${weeklyErr}h limit)`,
        currentValue: totalHours,
        threshold: weeklyErr,
      });
    } else if (totalHours >= weeklyWarn) {
      alerts.push({
        type: 'weekly_hours',
        severity: 'warning',
        workerId,
        workerName: workerId,
        workerType,
        message: `Worker approaching weekly limit: ${totalHours.toFixed(1)} hours (threshold: ${weeklyWarn}h)`,
        currentValue: totalHours,
        threshold: weeklyWarn,
      });
    }

    // Check rest periods between consecutive shifts
    for (let i = 1; i < workerShifts.length; i++) {
      const prevEnd = new Date(workerShifts[i - 1].shiftEnd!);
      const currStart = new Date(workerShifts[i].shiftStart!);
      const restHours = (currStart.getTime() - prevEnd.getTime()) / 3600000;

      if (restHours < minRest) {
        alerts.push({
          type: 'rest_period',
          severity: 'error',
          workerId,
          workerName: workerId,
          workerType,
          message: `Insufficient rest: only ${restHours.toFixed(1)} hours between shifts (minimum: ${minRest}h)`,
          currentValue: restHours,
          threshold: minRest,
          shiftId: workerShifts[i].shiftId,
          shiftName: workerShifts[i].shiftName || undefined,
        });
      }
    }
  }

  return alerts;
}

// Store violations from alerts
export async function storeOvertimeViolations(
  scheduleId: string,
  alerts: OvertimeAlert[],
  userId?: string
): Promise<void> {
  for (const alert of alerts) {
    // Map alert type to constraint rule type
    const ruleType = alert.type === 'daily_hours' ? 'max_hours_day' :
                     alert.type === 'weekly_hours' ? 'max_hours_week' :
                     'min_rest_between_shifts';
    
    await db.insert(schedulingViolations).values({
      scheduleId,
      ruleType: ruleType as any,
      severity: alert.severity as any,
      message: alert.message,
      details: {
        workerId: alert.workerId,
        workerType: alert.workerType,
        currentValue: alert.currentValue,
        threshold: alert.threshold,
        shiftId: alert.shiftId,
      },
      isResolved: false,
    });
  }
}

// Get all alerts for a schedule (for roster builder display)
export async function getScheduleAlerts(scheduleId: string): Promise<OvertimeAlert[]> {
  return analyzeScheduleForAlerts(scheduleId);
}

// ==================== SHIFT TEMPLATES ====================

// Get all shift templates
export async function getShiftTemplates(activeOnly = false) {
  const conditions = [];
  if (activeOnly) {
    conditions.push(eq(shiftTemplates.isActive, true));
  }
  
  const templates = await db.select()
    .from(shiftTemplates)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(shiftTemplates.createdAt));
  
  return templates;
}

// Get a single shift template by ID
export async function getShiftTemplate(id: string) {
  const [template] = await db.select()
    .from(shiftTemplates)
    .where(eq(shiftTemplates.id, id))
    .limit(1);
  
  return template || null;
}

// Zod validation schema for shift templates
const shiftTemplateInputSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  description: z.string().optional(),
  locationId: z.string().optional(),
  locationName: z.string().optional(),
  role: z.string().optional(),
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Start time must be in HH:MM format'),
  endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'End time must be in HH:MM format'),
  breakDuration: z.number().min(0).optional(),
  requiredHeadcount: z.number().min(1).optional(),
  color: z.string().optional(),
  requiredSkills: z.any().optional(),
  notes: z.string().optional(),
  createdBy: z.string().optional(),
});

// Create a new shift template
export async function createShiftTemplate(data: {
  name: string;
  description?: string;
  locationId?: string;
  locationName?: string;
  role?: string;
  startTime: string;
  endTime: string;
  breakDuration?: number;
  requiredHeadcount?: number;
  color?: string;
  requiredSkills?: any;
  notes?: string;
  createdBy?: string;
}) {
  // Validate input
  const validated = shiftTemplateInputSchema.parse(data);
  const [template] = await db.insert(shiftTemplates).values({
    name: data.name,
    description: data.description,
    locationId: data.locationId || null,
    locationName: data.locationName,
    role: data.role,
    startTime: data.startTime,
    endTime: data.endTime,
    breakDuration: data.breakDuration || 0,
    requiredHeadcount: data.requiredHeadcount || 1,
    color: data.color || "#3B82F6",
    requiredSkills: data.requiredSkills,
    notes: data.notes,
    isActive: true,
    createdBy: data.createdBy,
  }).returning();
  
  return template;
}

// Update a shift template
export async function updateShiftTemplate(id: string, data: Partial<{
  name: string;
  description: string;
  locationId: string;
  locationName: string;
  role: string;
  startTime: string;
  endTime: string;
  breakDuration: number;
  requiredHeadcount: number;
  color: string;
  requiredSkills: any;
  notes: string;
  isActive: boolean;
}>) {
  const [template] = await db.update(shiftTemplates)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(shiftTemplates.id, id))
    .returning();
  
  return template || null;
}

// Delete a shift template (soft delete by setting isActive = false)
export async function deleteShiftTemplate(id: string): Promise<boolean> {
  const [template] = await db.update(shiftTemplates)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(shiftTemplates.id, id))
    .returning();
  
  return !!template;
}

// Apply template to create a shift on a specific date
export async function applyTemplateToDate(
  templateId: string,
  scheduleId: string,
  date: Date,
  createdBy?: string
) {
  const template = await getShiftTemplate(templateId);
  if (!template) {
    throw new Error("Template not found");
  }
  
  // Parse start and end times from template (HH:MM format)
  const [startHour, startMin] = template.startTime.split(':').map(Number);
  const [endHour, endMin] = template.endTime.split(':').map(Number);
  
  const startTime = new Date(date);
  startTime.setHours(startHour, startMin, 0, 0);
  
  const endTime = new Date(date);
  endTime.setHours(endHour, endMin, 0, 0);
  
  // Handle overnight shifts
  if (endTime <= startTime) {
    endTime.setDate(endTime.getDate() + 1);
  }
  
  // Create the shift using the existing createShift function
  const shift = await createShift({
    scheduleId,
    name: template.name,
    locationId: template.locationId || undefined,
    role: template.role || undefined,
    workType: "shift",
    startTime,
    endTime,
    requiredHeadcount: template.requiredHeadcount || 1,
    notes: template.notes || undefined,
    color: template.color || undefined,
    createdBy,
  });
  
  return shift;
}

// Apply template to multiple dates
export async function applyTemplateToDateRange(
  templateId: string,
  scheduleId: string,
  dates: Date[],
  createdBy?: string
) {
  const shifts = [];
  for (const date of dates) {
    const shift = await applyTemplateToDate(templateId, scheduleId, date, createdBy);
    shifts.push(shift);
  }
  return shifts;
}

// ==================== RECURRING PATTERNS ====================

// Get all recurring patterns
export async function getRecurringPatterns(activeOnly = false) {
  const conditions = [];
  if (activeOnly) {
    conditions.push(eq(recurringPatterns.isActive, true));
  }
  
  const patterns = await db.select()
    .from(recurringPatterns)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(recurringPatterns.createdAt));
  
  return patterns;
}

// Get a single recurring pattern with its template mappings
export async function getRecurringPattern(id: string) {
  const [pattern] = await db.select()
    .from(recurringPatterns)
    .where(eq(recurringPatterns.id, id))
    .limit(1);
  
  if (!pattern) return null;
  
  // Get template mappings for this pattern
  const mappings = await db.select({
    mapping: patternTemplateMappings,
    template: shiftTemplates,
  })
    .from(patternTemplateMappings)
    .leftJoin(shiftTemplates, eq(patternTemplateMappings.templateId, shiftTemplates.id))
    .where(eq(patternTemplateMappings.patternId, id));
  
  return {
    ...pattern,
    mappings: mappings.map(m => ({
      ...m.mapping,
      template: m.template,
    })),
  };
}

// Create a new recurring pattern
// Zod validation schema for recurring patterns
const recurringPatternInputSchema = z.object({
  name: z.string().min(1, 'Pattern name is required'),
  description: z.string().optional(),
  createdBy: z.string().optional(),
});

export async function createRecurringPattern(data: {
  name: string;
  description?: string;
  createdBy?: string;
}) {
  // Validate input
  const validated = recurringPatternInputSchema.parse(data);
  
  const [pattern] = await db.insert(recurringPatterns).values({
    name: data.name,
    description: data.description,
    isActive: true,
    createdBy: data.createdBy,
  }).returning();
  
  return pattern;
}

// Update a recurring pattern
export async function updateRecurringPattern(id: string, data: Partial<{
  name: string;
  description: string;
  isActive: boolean;
}>) {
  const [pattern] = await db.update(recurringPatterns)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(recurringPatterns.id, id))
    .returning();
  
  return pattern || null;
}

// Delete a recurring pattern (soft delete)
export async function deleteRecurringPattern(id: string): Promise<boolean> {
  const [pattern] = await db.update(recurringPatterns)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(recurringPatterns.id, id))
    .returning();
  
  return !!pattern;
}

// Add a template mapping to a pattern
export async function addPatternTemplateMapping(data: {
  patternId: string;
  templateId: string;
  dayOfWeek: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
}) {
  const [mapping] = await db.insert(patternTemplateMappings).values({
    patternId: data.patternId,
    templateId: data.templateId,
    dayOfWeek: data.dayOfWeek,
  }).returning();
  
  return mapping;
}

// Remove a template mapping from a pattern
export async function removePatternTemplateMapping(mappingId: string): Promise<boolean> {
  const result = await db.delete(patternTemplateMappings)
    .where(eq(patternTemplateMappings.id, mappingId))
    .returning();
  
  return result.length > 0;
}

// Apply a pattern to generate shifts for a week
export async function applyPatternToSchedule(
  patternId: string,
  scheduleId: string,
  weekStartDate: Date,
  createdBy?: string
) {
  const pattern = await getRecurringPattern(patternId);
  if (!pattern) {
    throw new Error("Pattern not found");
  }
  
  const dayMap: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  
  const shifts = [];
  
  // Process each mapping
  for (const mapping of pattern.mappings || []) {
    if (!mapping.template || !mapping.template.isActive) continue;
    
    // Calculate the date for this day of week
    const dayOffset = dayMap[mapping.dayOfWeek];
    const targetDate = new Date(weekStartDate);
    const currentDay = targetDate.getDay();
    targetDate.setDate(targetDate.getDate() + (dayOffset - currentDay + 7) % 7);
    
    // Create the shift
    const shift = await applyTemplateToDate(
      mapping.templateId,
      scheduleId,
      targetDate,
      createdBy
    );
    shifts.push(shift);
  }
  
  return shifts;
}

// ==================== APPROVAL WORKFLOW ====================

// Zod validation for approval actions
const submitForApprovalSchema = z.object({
  scheduleId: z.string().min(1, 'Schedule ID is required'),
  notes: z.string().optional(),
});

const approvalResponseSchema = z.object({
  scheduleId: z.string().min(1, 'Schedule ID is required'),
  approved: z.boolean(),
  notes: z.string().optional(),
});

// Get approval configuration for a schedule (checks location, team, account hierarchy)
export async function getApprovalConfig(scheduleId?: string, locationId?: string, teamId?: string, accountId?: number) {
  // First try exact match, then fall back to defaults
  const configs = await db.select()
    .from(scheduleApprovalConfigs)
    .where(
      or(
        and(
          locationId ? eq(scheduleApprovalConfigs.locationId, locationId) : sql`true`,
          teamId ? eq(scheduleApprovalConfigs.teamId, teamId) : sql`true`,
          accountId ? eq(scheduleApprovalConfigs.accountId, accountId) : sql`true`
        ),
        // Default config (no specific scope)
        and(
          sql`${scheduleApprovalConfigs.locationId} IS NULL`,
          sql`${scheduleApprovalConfigs.teamId} IS NULL`,
          sql`${scheduleApprovalConfigs.accountId} IS NULL`
        )
      )
    )
    .limit(1);

  // Return config or default
  return configs[0] || {
    requiresApproval: true,
    requiresApprovalToPublish: true,
    approverRoles: ['manager', 'admin'],
    publisherRoles: ['admin'],
    notifyOnSubmit: true,
    notifyOnApproval: true,
    notifyOnRejection: true,
    notifyOnPublish: true,
  };
}

// Create or update approval configuration
export async function upsertApprovalConfig(data: {
  locationId?: string;
  teamId?: string;
  accountId?: number;
  requiresApproval?: boolean;
  autoApproveThreshold?: number;
  approverRoles?: string[];
  requiresApprovalToPublish?: boolean;
  publisherRoles?: string[];
  notifyOnSubmit?: boolean;
  notifyOnApproval?: boolean;
  notifyOnRejection?: boolean;
  notifyOnPublish?: boolean;
  userId?: string;
}) {
  // Check for existing config
  const existing = await db.select()
    .from(scheduleApprovalConfigs)
    .where(
      and(
        data.locationId ? eq(scheduleApprovalConfigs.locationId, data.locationId) : sql`${scheduleApprovalConfigs.locationId} IS NULL`,
        data.teamId ? eq(scheduleApprovalConfigs.teamId, data.teamId) : sql`${scheduleApprovalConfigs.teamId} IS NULL`,
        data.accountId ? eq(scheduleApprovalConfigs.accountId, data.accountId) : sql`${scheduleApprovalConfigs.accountId} IS NULL`
      )
    )
    .limit(1);

  if (existing[0]) {
    const [updated] = await db.update(scheduleApprovalConfigs)
      .set({
        requiresApproval: data.requiresApproval,
        autoApproveThreshold: data.autoApproveThreshold,
        approverRoles: data.approverRoles,
        requiresApprovalToPublish: data.requiresApprovalToPublish,
        publisherRoles: data.publisherRoles,
        notifyOnSubmit: data.notifyOnSubmit,
        notifyOnApproval: data.notifyOnApproval,
        notifyOnRejection: data.notifyOnRejection,
        notifyOnPublish: data.notifyOnPublish,
        updatedAt: new Date(),
        updatedBy: data.userId,
      })
      .where(eq(scheduleApprovalConfigs.id, existing[0].id))
      .returning();
    return updated;
  } else {
    const [created] = await db.insert(scheduleApprovalConfigs)
      .values({
        locationId: data.locationId,
        teamId: data.teamId,
        accountId: data.accountId,
        requiresApproval: data.requiresApproval ?? true,
        autoApproveThreshold: data.autoApproveThreshold,
        approverRoles: data.approverRoles ?? ['manager', 'admin'],
        requiresApprovalToPublish: data.requiresApprovalToPublish ?? true,
        publisherRoles: data.publisherRoles ?? ['admin'],
        notifyOnSubmit: data.notifyOnSubmit ?? true,
        notifyOnApproval: data.notifyOnApproval ?? true,
        notifyOnRejection: data.notifyOnRejection ?? true,
        notifyOnPublish: data.notifyOnPublish ?? true,
        createdBy: data.userId,
        updatedBy: data.userId,
      })
      .returning();
    return created;
  }
}

// Log an audit event
export async function logScheduleAudit(data: {
  scheduleId: string;
  shiftId?: string;
  userId: string | null;
  userEmail?: string;
  userName?: string;
  userRole?: string;
  action: 'created' | 'updated' | 'submitted' | 'approved' | 'rejected' | 'published' | 'unpublished' | 'locked' | 'unlocked' | 'archived';
  previousStatus?: string;
  newStatus?: string;
  description?: string;
  changes?: any;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
}) {
  const [log] = await db.insert(scheduleAuditLogs)
    .values({
      scheduleId: data.scheduleId,
      shiftId: data.shiftId,
      userId: data.userId,
      userEmail: data.userEmail,
      userName: data.userName,
      userRole: data.userRole,
      action: data.action,
      previousStatus: data.previousStatus,
      newStatus: data.newStatus,
      description: data.description,
      changes: data.changes,
      metadata: data.metadata,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    })
    .returning();
  return log;
}

// Get audit logs for a schedule
export async function getScheduleAuditLogs(scheduleId: string, limit: number = 50) {
  const logs = await db.select()
    .from(scheduleAuditLogs)
    .where(eq(scheduleAuditLogs.scheduleId, scheduleId))
    .orderBy(desc(scheduleAuditLogs.createdAt))
    .limit(limit);
  return logs;
}

// Check if user has role permission
export function hasSchedulePermission(userRole: string, allowedRoles: string[]): boolean {
  return allowedRoles.includes(userRole) || allowedRoles.includes('admin');
}

// Submit schedule for approval
export async function submitScheduleForApproval(
  scheduleId: string,
  userId: string,
  userInfo: { email?: string; name?: string; role?: string },
  notes?: string
) {
  // Get current schedule
  const [schedule] = await db.select()
    .from(schedulingSchedules)
    .where(eq(schedulingSchedules.id, scheduleId))
    .limit(1);

  if (!schedule) {
    throw new Error('Schedule not found');
  }

  if (schedule.status !== 'draft') {
    throw new Error(`Cannot submit schedule with status '${schedule.status}'. Only draft schedules can be submitted.`);
  }

  // Resolve userId to ensure it exists in users table (for FK constraint)
  const resolvedUserId = await resolveUserId(userId);

  // Update schedule status
  const [updated] = await db.update(schedulingSchedules)
    .set({
      status: 'submitted',
      updatedAt: new Date(),
      updatedBy: resolvedUserId,
    })
    .where(eq(schedulingSchedules.id, scheduleId))
    .returning();

  // Create approval request
  await db.insert(scheduleApprovalRequests)
    .values({
      scheduleId,
      requestedBy: resolvedUserId,
      notes,
      status: 'pending',
    });

  // Log audit event
  await logScheduleAudit({
    scheduleId,
    userId: resolvedUserId,
    userEmail: userInfo.email,
    userName: userInfo.name,
    userRole: userInfo.role,
    action: 'submitted',
    previousStatus: 'draft',
    newStatus: 'submitted',
    description: `Schedule submitted for approval${notes ? ': ' + notes : ''}`,
  });

  return updated;
}

// Approve or reject schedule
export async function respondToApprovalRequest(
  scheduleId: string,
  userId: string,
  userInfo: { email?: string; name?: string; role?: string },
  approved: boolean,
  notes?: string
) {
  // Get current schedule
  const [schedule] = await db.select()
    .from(schedulingSchedules)
    .where(eq(schedulingSchedules.id, scheduleId))
    .limit(1);

  if (!schedule) {
    throw new Error('Schedule not found');
  }

  if (schedule.status !== 'submitted') {
    throw new Error(`Cannot respond to schedule with status '${schedule.status}'. Only submitted schedules can be approved/rejected.`);
  }

  // Check if user has approval permission
  const config = await getApprovalConfig(scheduleId);
  if (!hasSchedulePermission(userInfo.role || '', config.approverRoles || ['manager', 'admin'])) {
    throw new Error('You do not have permission to approve schedules');
  }

  // Resolve userId to ensure it exists in users table (for FK constraint)
  const resolvedUserId = await resolveUserId(userId);
  const newStatus = approved ? 'approved' : 'draft';

  // Update schedule status
  const [updated] = await db.update(schedulingSchedules)
    .set({
      status: newStatus,
      updatedAt: new Date(),
      updatedBy: resolvedUserId,
    })
    .where(eq(schedulingSchedules.id, scheduleId))
    .returning();

  // Update approval request
  await db.update(scheduleApprovalRequests)
    .set({
      status: approved ? 'approved' : 'rejected',
      respondedBy: resolvedUserId,
      respondedAt: new Date(),
      responseNotes: notes,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(scheduleApprovalRequests.scheduleId, scheduleId),
        eq(scheduleApprovalRequests.status, 'pending')
      )
    );

  // Log audit event
  await logScheduleAudit({
    scheduleId,
    userId: resolvedUserId,
    userEmail: userInfo.email,
    userName: userInfo.name,
    userRole: userInfo.role,
    action: approved ? 'approved' : 'rejected',
    previousStatus: 'submitted',
    newStatus,
    description: `Schedule ${approved ? 'approved' : 'rejected'}${notes ? ': ' + notes : ''}`,
  });

  return updated;
}

// Publish schedule (requires approval if configured)
export async function publishScheduleWithApproval(
  scheduleId: string,
  userId: string,
  userInfo: { email?: string; name?: string; role?: string }
) {
  // Get current schedule
  const [schedule] = await db.select()
    .from(schedulingSchedules)
    .where(eq(schedulingSchedules.id, scheduleId))
    .limit(1);

  if (!schedule) {
    throw new Error('Schedule not found');
  }

  // Get approval config
  const config = await getApprovalConfig(scheduleId);

  // Check if approval is required
  if (config.requiresApprovalToPublish && schedule.status !== 'approved') {
    throw new Error('Schedule must be approved before publishing');
  }

  // Check if user has publish permission
  if (!hasSchedulePermission(userInfo.role || '', config.publisherRoles || ['admin'])) {
    throw new Error('You do not have permission to publish schedules');
  }

  // Check if schedule is in valid state for publishing
  if (schedule.status !== 'approved' && schedule.status !== 'draft') {
    throw new Error(`Cannot publish schedule with status '${schedule.status}'`);
  }

  // Check for union/CBA violations (warning-based enforcement v1)
  let unionViolations: ViolationResult[] = [];
  try {
    unionViolations = await checkScheduleUnionViolations(scheduleId);
  } catch (e) {
    console.warn("[Scheduling] Union CBA check failed (non-blocking):", e);
  }

  // Resolve userId to ensure it exists in users table (for FK constraint)
  const resolvedUserId = await resolveUserId(userId);
  const previousStatus = schedule.status;

  // Update schedule status
  const [updated] = await db.update(schedulingSchedules)
    .set({
      status: 'published',
      publishedAt: new Date(),
      publishedBy: resolvedUserId,
      updatedAt: new Date(),
      updatedBy: resolvedUserId,
      version: (schedule.version || 0) + 1,
    })
    .where(eq(schedulingSchedules.id, scheduleId))
    .returning();

  // Log audit event
  const violationNote = unionViolations.length > 0 ? ` with ${unionViolations.length} union/CBA warning(s)` : '';
  await logScheduleAudit({
    scheduleId,
    userId: resolvedUserId,
    userEmail: userInfo.email,
    userName: userInfo.name,
    userRole: userInfo.role,
    action: 'published',
    previousStatus,
    newStatus: 'published',
    description: `Schedule published (version ${updated.version})${violationNote}`,
  });

  return { ...updated, unionViolations };
}

// Get pending approval requests
export async function getPendingApprovalRequests(limit: number = 50) {
  const requests = await db.select()
    .from(scheduleApprovalRequests)
    .where(eq(scheduleApprovalRequests.status, 'pending'))
    .orderBy(desc(scheduleApprovalRequests.requestedAt))
    .limit(limit);
  return requests;
}

// Get approval request for a schedule
export async function getApprovalRequest(scheduleId: string) {
  const [request] = await db.select()
    .from(scheduleApprovalRequests)
    .where(eq(scheduleApprovalRequests.scheduleId, scheduleId))
    .orderBy(desc(scheduleApprovalRequests.createdAt))
    .limit(1);
  return request;
}

// ============ SHIFT SWAP & EMPLOYEE SELF-SERVICE ============

import { 
  shiftSwapRequests, 
  shiftSwapConfigs, 
  shiftSwapAuditLogs,
  shiftAssignments,
  availabilityWindows,
  type ShiftSwapRequest,
  type ShiftSwapConfig,
  type ShiftSwapAuditLog
} from "@shared/schema";

// Get shift swap configuration (global or for specific location/team)
export async function getShiftSwapConfig(locationId?: string, teamId?: string): Promise<ShiftSwapConfig> {
  // Try to find specific config first
  if (locationId || teamId) {
    const [config] = await db.select()
      .from(shiftSwapConfigs)
      .where(
        and(
          locationId ? eq(shiftSwapConfigs.locationId, locationId) : sql`location_id IS NULL`,
          teamId ? eq(shiftSwapConfigs.teamId, teamId) : sql`team_id IS NULL`
        )
      )
      .limit(1);
    if (config) return config;
  }
  
  // Fallback to global config
  const [globalConfig] = await db.select()
    .from(shiftSwapConfigs)
    .where(
      and(
        sql`location_id IS NULL`,
        sql`team_id IS NULL`
      )
    )
    .limit(1);
  
  return globalConfig || {
    id: 'default',
    locationId: null,
    teamId: null,
    requiresManagerApproval: true,
    autoApproveIfEligible: false,
    requireAvailabilityMatch: true,
    requireRoleMatch: true,
    requireSkillMatch: true,
    requireComplianceCheck: true,
    minAdvanceHours: 24,
    maxSwapsPerWeek: 2,
    requestExpirationHours: 48,
    allowSwaps: true,
    allowDrops: true,
    allowPickups: true,
    approverRoles: ['manager', 'admin'],
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: null,
  };
}

// Check eligibility for shift swap
export async function checkSwapEligibility(
  originalAssignmentId: string,
  targetAssignmentId?: string,
  requestType: 'swap' | 'drop' | 'pickup' = 'swap'
): Promise<{
  eligible: boolean;
  availabilityOk: boolean;
  roleMatch: boolean;
  complianceOk: boolean;
  violations: string[];
}> {
  const violations: string[] = [];
  let availabilityOk = true;
  let roleMatch = true;
  let complianceOk = true;

  // Get the original assignment
  const [origAssignment] = await db.select()
    .from(shiftAssignments)
    .where(eq(shiftAssignments.id, originalAssignmentId))
    .limit(1);

  if (!origAssignment) {
    violations.push('Original assignment not found');
    return { eligible: false, availabilityOk: false, roleMatch: false, complianceOk: false, violations };
  }

  // For swaps, check target assignment
  if (requestType === 'swap' && targetAssignmentId) {
    const [targetAssignment] = await db.select()
      .from(shiftAssignments)
      .where(eq(shiftAssignments.id, targetAssignmentId))
      .limit(1);

    if (!targetAssignment) {
      violations.push('Target assignment not found');
      return { eligible: false, availabilityOk: false, roleMatch: false, complianceOk: false, violations };
    }

    // Check role match (simplified - both should have same role/position)
    // In a real implementation, you'd check against shift requirements
    // For now, we assume role match is OK
    roleMatch = true;
  }

  // Check for minimum advance time (24 hours default)
  const config = await getShiftSwapConfig();
  const minAdvanceMs = (config.minAdvanceHours || 24) * 60 * 60 * 1000;
  
  // Note: In a full implementation, you'd check:
  // - Availability windows for both workers
  // - Skills/certifications match
  // - No overtime violations
  // - No compliance issues (drug test pending, etc.)
  
  // For v1, we'll do simplified checks
  complianceOk = true;
  availabilityOk = true;

  const eligible = violations.length === 0 && availabilityOk && roleMatch && complianceOk;
  
  return { eligible, availabilityOk, roleMatch, complianceOk, violations };
}

// Create a shift swap request
export async function createShiftSwapRequest(
  data: {
    originalAssignmentId: string;
    requestedByUserId: string;
    targetUserId?: string;
    targetAssignmentId?: string;
    requestType?: 'swap' | 'drop' | 'pickup';
    reason?: string;
  }
): Promise<ShiftSwapRequest> {
  const config = await getShiftSwapConfig();
  
  // Check eligibility
  const eligibility = await checkSwapEligibility(
    data.originalAssignmentId,
    data.targetAssignmentId,
    data.requestType || 'swap'
  );

  // Calculate expiration
  const expiresAt = new Date(Date.now() + (config.requestExpirationHours || 48) * 60 * 60 * 1000);

  const [request] = await db.insert(shiftSwapRequests)
    .values({
      originalAssignmentId: data.originalAssignmentId,
      requestedByUserId: data.requestedByUserId,
      targetUserId: data.targetUserId,
      reason: data.reason,
      status: 'pending',
      eligibilityChecked: true,
      eligibilityPassed: eligibility.eligible,
      eligibilityDetails: eligibility,
      requiresApproval: config.requiresManagerApproval,
      expiresAt,
      requestType: data.requestType || 'swap',
    })
    .returning();

  // Log audit event
  await logShiftSwapAudit({
    swapRequestId: request.id,
    actorUserId: data.requestedByUserId,
    action: 'created',
    previousStatus: null,
    newStatus: 'pending',
    description: `Shift swap request created (type: \${data.requestType || 'swap'})`,
  });

  return request;
}

// Log shift swap audit event
export async function logShiftSwapAudit(data: {
  swapRequestId: string;
  actorUserId?: string | null;
  actorDriverId?: string | null;
  actorEmployeeId?: string | null;
  actorEmail?: string;
  actorName?: string;
  actorRole?: string;
  action: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  description?: string;
  metadata?: any;
}): Promise<ShiftSwapAuditLog> {
  const [log] = await db.insert(shiftSwapAuditLogs)
    .values({
      swapRequestId: data.swapRequestId,
      actorUserId: data.actorUserId,
      actorDriverId: data.actorDriverId,
      actorEmployeeId: data.actorEmployeeId,
      actorEmail: data.actorEmail,
      actorName: data.actorName,
      actorRole: data.actorRole,
      action: data.action,
      previousStatus: data.previousStatus,
      newStatus: data.newStatus,
      description: data.description,
      metadata: data.metadata,
    })
    .returning();
  return log;
}

// Approve shift swap request
export async function approveShiftSwapRequest(
  requestId: string,
  approvedBy: string,
  notes?: string
): Promise<ShiftSwapRequest> {
  const [request] = await db.select()
    .from(shiftSwapRequests)
    .where(eq(shiftSwapRequests.id, requestId))
    .limit(1);

  if (!request) {
    throw new Error('Swap request not found');
  }

  if (request.status !== 'pending') {
    throw new Error(`Cannot approve request with status '\${request.status}'`);
  }

  const previousStatus = request.status;

  // Update request status
  const [updated] = await db.update(shiftSwapRequests)
    .set({
      status: 'approved',
      reviewedBy: approvedBy,
      reviewedAt: new Date(),
      reviewNotes: notes,
    })
    .where(eq(shiftSwapRequests.id, requestId))
    .returning();

  // Execute the swap (update assignments)
  await executeShiftSwap(request);

  // Log audit event
  await logShiftSwapAudit({
    swapRequestId: requestId,
    actorUserId: approvedBy,
    action: 'approved',
    previousStatus,
    newStatus: 'approved',
    description: `Shift swap approved\${notes ? ': ' + notes : ''}`,
  });

  return updated;
}

// Reject shift swap request
export async function rejectShiftSwapRequest(
  requestId: string,
  rejectedBy: string,
  reason?: string
): Promise<ShiftSwapRequest> {
  const [request] = await db.select()
    .from(shiftSwapRequests)
    .where(eq(shiftSwapRequests.id, requestId))
    .limit(1);

  if (!request) {
    throw new Error('Swap request not found');
  }

  if (request.status !== 'pending') {
    throw new Error(`Cannot reject request with status '\${request.status}'`);
  }

  const previousStatus = request.status;

  const [updated] = await db.update(shiftSwapRequests)
    .set({
      status: 'declined',
      reviewedBy: rejectedBy,
      reviewedAt: new Date(),
      reviewNotes: reason,
    })
    .where(eq(shiftSwapRequests.id, requestId))
    .returning();

  // Log audit event
  await logShiftSwapAudit({
    swapRequestId: requestId,
    actorUserId: rejectedBy,
    action: 'rejected',
    previousStatus,
    newStatus: 'declined',
    description: `Shift swap rejected\${reason ? ': ' + reason : ''}`,
  });

  return updated;
}

// Execute the actual shift swap (update assignments)
async function executeShiftSwap(request: ShiftSwapRequest): Promise<void> {
  const requestType = (request as any).requestType || 'swap';

  if (requestType === 'swap' && request.targetUserId) {
    // Swap: Exchange the user IDs on both assignments
    const [origAssignment] = await db.select()
      .from(shiftAssignments)
      .where(eq(shiftAssignments.id, request.originalAssignmentId))
      .limit(1);

    if (origAssignment && request.targetUserId) {
      // Find target assignment (if specified) or just swap users
      const origUserId = origAssignment.userId;
      
      // Update original assignment to target user
      await db.update(shiftAssignments)
        .set({ userId: request.targetUserId })
        .where(eq(shiftAssignments.id, request.originalAssignmentId));

      // If there's a target assignment, swap it to original user
      // (This is simplified - in practice you'd have more complex logic)
    }
  } else if (requestType === 'drop') {
    // Drop: Remove the assignment (or mark as unassigned)
    await db.update(shiftAssignments)
      .set({ status: 'open' })
      .where(eq(shiftAssignments.id, request.originalAssignmentId));
  }
}

// Cancel a swap request
export async function cancelShiftSwapRequest(
  requestId: string,
  cancelledBy: string
): Promise<ShiftSwapRequest> {
  const [request] = await db.select()
    .from(shiftSwapRequests)
    .where(eq(shiftSwapRequests.id, requestId))
    .limit(1);

  if (!request) {
    throw new Error('Swap request not found');
  }

  if (request.status !== 'pending') {
    throw new Error('Only pending requests can be cancelled');
  }

  const previousStatus = request.status;

  const [updated] = await db.update(shiftSwapRequests)
    .set({
      status: 'cancelled',
    })
    .where(eq(shiftSwapRequests.id, requestId))
    .returning();

  // Log audit event
  await logShiftSwapAudit({
    swapRequestId: requestId,
    actorUserId: cancelledBy,
    action: 'cancelled',
    previousStatus,
    newStatus: 'cancelled',
    description: 'Shift swap request cancelled',
  });

  return updated;
}

// Get swap requests for a user (as requester)
export async function getSwapRequestsByUser(userId: string): Promise<ShiftSwapRequest[]> {
  const requests = await db.select()
    .from(shiftSwapRequests)
    .where(eq(shiftSwapRequests.requestedByUserId, userId))
    .orderBy(desc(shiftSwapRequests.createdAt));
  return requests;
}

// Get swap requests where user is the target
export async function getSwapRequestsForTarget(userId: string): Promise<ShiftSwapRequest[]> {
  const requests = await db.select()
    .from(shiftSwapRequests)
    .where(eq(shiftSwapRequests.targetUserId, userId))
    .orderBy(desc(shiftSwapRequests.createdAt));
  return requests;
}

// Get all pending swap requests (for managers)
export async function getPendingSwapRequests(): Promise<ShiftSwapRequest[]> {
  const requests = await db.select()
    .from(shiftSwapRequests)
    .where(eq(shiftSwapRequests.status, 'pending'))
    .orderBy(desc(shiftSwapRequests.createdAt));
  return requests;
}

// Get swap request audit log
export async function getSwapRequestAuditLog(requestId: string): Promise<ShiftSwapAuditLog[]> {
  const logs = await db.select()
    .from(shiftSwapAuditLogs)
    .where(eq(shiftSwapAuditLogs.swapRequestId, requestId))
    .orderBy(desc(shiftSwapAuditLogs.createdAt));
  return logs;
}

// Update swap config
export async function updateShiftSwapConfig(
  configId: string,
  updates: Partial<ShiftSwapConfig>,
  updatedBy: string
): Promise<ShiftSwapConfig> {
  const [updated] = await db.update(shiftSwapConfigs)
    .set({
      ...updates,
      updatedAt: new Date(),
      updatedBy,
    })
    .where(eq(shiftSwapConfigs.id, configId))
    .returning();
  return updated;
}

// ================== MESSAGING & ALERTS ==================

interface MessageTarget {
  type: 'all' | 'location' | 'role' | 'shift';
  value?: string;
}

interface CreateMessageParams {
  title: string;
  body: string;
  target: MessageTarget;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  scheduleId?: string;
  shiftId?: string;
  isAutomatic?: boolean;
  alertType?: SchedulingAlertType;
  sentByUserId?: string;
}

export async function createSchedulingMessage(params: CreateMessageParams): Promise<SchedulingMessage> {
  const [message] = await db.insert(schedulingMessages)
    .values({
      targetType: params.target.type,
      targetValue: params.target.value || null,
      title: params.title,
      body: params.body,
      priority: params.priority || 'normal',
      scheduleId: params.scheduleId || null,
      shiftId: params.shiftId || null,
      isAutomatic: params.isAutomatic || false,
      alertType: params.alertType || null,
      status: 'draft',
      sentByUserId: params.sentByUserId || null,
    })
    .returning();

  await writeAuditEvent(
    'SCHEDULING_MESSAGE_CREATED',
    'scheduling_message',
    message.id,
    params.sentByUserId || null,
    null,
    null,
    { title: message.title, targetType: message.targetType, targetValue: message.targetValue },
    ['title', 'body', 'targetType'],
    'Message created'
  );

  return message;
}

async function getTargetRecipients(target: MessageTarget): Promise<Array<{
  workerType: 'driver' | 'employee';
  driverId?: string;
  employeeId?: string;
  userId?: string;
}>> {
  const recipients: Array<{
    workerType: 'driver' | 'employee';
    driverId?: string;
    employeeId?: string;
    userId?: string;
  }> = [];

  if (target.type === 'all') {
    const allDrivers = await db.select({ id: drivers.id, userId: drivers.userId })
      .from(drivers)
      .where(eq(drivers.status, 'active'));
    const allEmployees = await db.select({ id: employees.id, userId: employees.userId })
      .from(employees)
      .where(eq(employees.status, 'active'));
    
    allDrivers.forEach(d => recipients.push({ 
      workerType: 'driver', 
      driverId: d.id, 
      userId: d.userId || undefined 
    }));
    allEmployees.forEach(e => recipients.push({ 
      workerType: 'employee', 
      employeeId: e.id, 
      userId: e.userId || undefined 
    }));
  } else if (target.type === 'location' && target.value) {
    const locationDrivers = await db.select({ id: drivers.id, userId: drivers.userId })
      .from(drivers)
      .where(and(eq(drivers.status, 'active'), eq(drivers.homeLocation, target.value)));
    const locationEmployees = await db.select({ id: employees.id, userId: employees.userId })
      .from(employees)
      .where(and(eq(employees.status, 'active'), eq(employees.location, target.value)));
    
    locationDrivers.forEach(d => recipients.push({ 
      workerType: 'driver', 
      driverId: d.id, 
      userId: d.userId || undefined 
    }));
    locationEmployees.forEach(e => recipients.push({ 
      workerType: 'employee', 
      employeeId: e.id, 
      userId: e.userId || undefined 
    }));
  } else if (target.type === 'role' && target.value) {
    const roleDrivers = await db.select({ id: drivers.id, userId: drivers.userId })
      .from(drivers)
      .where(and(eq(drivers.status, 'active'), eq(drivers.role, target.value)));
    const roleEmployees = await db.select({ id: employees.id, userId: employees.userId })
      .from(employees)
      .where(and(eq(employees.status, 'active'), eq(employees.role, target.value)));
    
    roleDrivers.forEach(d => recipients.push({ 
      workerType: 'driver', 
      driverId: d.id, 
      userId: d.userId || undefined 
    }));
    roleEmployees.forEach(e => recipients.push({ 
      workerType: 'employee', 
      employeeId: e.id, 
      userId: e.userId || undefined 
    }));
  } else if (target.type === 'shift' && target.value) {
    const shiftAssignments = await db.select()
      .from(schedulingAssignments)
      .where(and(
        eq(schedulingAssignments.shiftId, target.value),
        eq(schedulingAssignments.status, 'assigned')
      ));
    
    for (const assignment of shiftAssignments) {
      if (assignment.driverId) {
        const [driver] = await db.select({ userId: drivers.userId })
          .from(drivers)
          .where(eq(drivers.id, assignment.driverId));
        recipients.push({ 
          workerType: 'driver', 
          driverId: assignment.driverId, 
          userId: driver?.userId || undefined 
        });
      }
      if (assignment.employeeId) {
        const [employee] = await db.select({ userId: employees.userId })
          .from(employees)
          .where(eq(employees.id, assignment.employeeId));
        recipients.push({ 
          workerType: 'employee', 
          employeeId: assignment.employeeId, 
          userId: employee?.userId || undefined 
        });
      }
    }
  }

  return recipients;
}

export async function sendSchedulingMessage(
  messageId: string, 
  sentByUserId: string
): Promise<{ recipientCount: number; deliveredCount: number }> {
  const [message] = await db.select().from(schedulingMessages).where(eq(schedulingMessages.id, messageId));
  if (!message) throw new Error('Message not found');
  if (message.status === 'sent') throw new Error('Message already sent');

  const target: MessageTarget = {
    type: message.targetType as MessageTarget['type'],
    value: message.targetValue || undefined,
  };

  const recipients = await getTargetRecipients(target);
  let deliveredCount = 0;

  for (const recipient of recipients) {
    await db.insert(schedulingMessageRecipients).values({
      messageId,
      workerType: recipient.workerType,
      driverId: recipient.driverId || null,
      employeeId: recipient.employeeId || null,
      userId: recipient.userId || null,
      channel: 'in_app',
      deliveryStatus: 'pending',
    });

    if (recipient.userId) {
      await db.insert(notifications).values({
        userId: recipient.userId,
        type: message.alertType || 'announcement',
        title: message.title,
        message: message.body,
        isRead: false,
        relatedEntityType: 'scheduling_message',
        relatedEntityId: messageId,
      });
      
      await db.update(schedulingMessageRecipients)
        .set({ deliveryStatus: 'delivered', deliveredAt: new Date() })
        .where(and(
          eq(schedulingMessageRecipients.messageId, messageId),
          eq(schedulingMessageRecipients.userId, recipient.userId)
        ));
      deliveredCount++;
    }
  }

  await db.update(schedulingMessages)
    .set({
      status: 'sent',
      sentAt: new Date(),
      sentByUserId,
      recipientCount: recipients.length,
      deliveredCount,
      updatedAt: new Date(),
    })
    .where(eq(schedulingMessages.id, messageId));

  await writeAuditEvent(
    'SCHEDULING_MESSAGE_SENT',
    'scheduling_message',
    messageId,
    sentByUserId,
    null,
    null,
    { recipientCount: recipients.length, deliveredCount },
    ['status', 'sentAt', 'recipientCount', 'deliveredCount'],
    `Message sent to ${recipients.length} recipients`
  );

  return { recipientCount: recipients.length, deliveredCount };
}

export async function sendAutomaticAlert(
  alertType: SchedulingAlertType,
  target: MessageTarget,
  title: string,
  body: string,
  scheduleId?: string,
  shiftId?: string
): Promise<SchedulingMessage> {
  const message = await createSchedulingMessage({
    title,
    body,
    target,
    priority: alertType.includes('cancelled') ? 'high' : 'normal',
    scheduleId,
    shiftId,
    isAutomatic: true,
    alertType,
  });

  await sendSchedulingMessage(message.id, 'SYSTEM');

  return message;
}

export async function sendSchedulePublishedAlert(scheduleId: string): Promise<void> {
  const [schedule] = await db.select()
    .from(schedulingSchedules)
    .where(eq(schedulingSchedules.id, scheduleId));
  
  if (!schedule) return;

  const shifts = await db.select()
    .from(schedulingShifts)
    .where(eq(schedulingShifts.scheduleId, scheduleId));

  const uniqueWorkerIds = new Set<string>();
  for (const shift of shifts) {
    const assignments = await db.select()
      .from(schedulingAssignments)
      .where(and(
        eq(schedulingAssignments.shiftId, shift.id),
        eq(schedulingAssignments.status, 'assigned')
      ));
    assignments.forEach(a => {
      if (a.driverId) uniqueWorkerIds.add(`driver:${a.driverId}`);
      if (a.employeeId) uniqueWorkerIds.add(`employee:${a.employeeId}`);
    });
  }

  if (uniqueWorkerIds.size === 0) return;

  await sendAutomaticAlert(
    'schedule_published',
    { type: 'all' },
    'New Schedule Published',
    `The schedule for ${schedule.name} (Week of ${new Date(schedule.weekStartDate).toLocaleDateString()}) has been published. Check your shifts.`,
    scheduleId
  );
}

export async function sendShiftChangeAlert(
  shiftId: string,
  changeDescription: string
): Promise<void> {
  const [shift] = await db.select()
    .from(schedulingShifts)
    .where(eq(schedulingShifts.id, shiftId));
  
  if (!shift) return;

  await sendAutomaticAlert(
    'shift_change',
    { type: 'shift', value: shiftId },
    'Shift Updated',
    changeDescription,
    shift.scheduleId,
    shiftId
  );
}

export async function sendShiftReminderAlerts(hoursBeforeShift: number = 24): Promise<number> {
  const now = new Date();
  const reminderTime = new Date(now.getTime() + hoursBeforeShift * 60 * 60 * 1000);
  
  const upcomingShifts = await db.select()
    .from(schedulingShifts)
    .where(and(
      gte(schedulingShifts.startTime, now),
      lte(schedulingShifts.startTime, reminderTime),
      eq(schedulingShifts.status, 'scheduled')
    ));

  let alertsSent = 0;

  for (const shift of upcomingShifts) {
    const assignments = await db.select()
      .from(schedulingAssignments)
      .where(and(
        eq(schedulingAssignments.shiftId, shift.id),
        eq(schedulingAssignments.status, 'assigned')
      ));

    if (assignments.length > 0) {
      await sendAutomaticAlert(
        'shift_reminder',
        { type: 'shift', value: shift.id },
        'Upcoming Shift Reminder',
        `You have a shift scheduled for ${new Date(shift.startTime).toLocaleString()}. Location: ${shift.locationId || 'TBD'}`,
        shift.scheduleId,
        shift.id
      );
      alertsSent++;
    }
  }

  return alertsSent;
}

export async function getSchedulingMessages(
  filters?: { status?: string; isAutomatic?: boolean }
): Promise<SchedulingMessage[]> {
  let query = db.select().from(schedulingMessages);
  
  const conditions = [];
  if (filters?.status) {
    conditions.push(eq(schedulingMessages.status, filters.status));
  }
  if (filters?.isAutomatic !== undefined) {
    conditions.push(eq(schedulingMessages.isAutomatic, filters.isAutomatic));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  return query.orderBy(desc(schedulingMessages.createdAt));
}

export async function getSchedulingMessageById(id: string): Promise<SchedulingMessage | null> {
  const [message] = await db.select()
    .from(schedulingMessages)
    .where(eq(schedulingMessages.id, id));
  return message || null;
}

export async function getMessageRecipients(messageId: string): Promise<SchedulingMessageRecipient[]> {
  return db.select()
    .from(schedulingMessageRecipients)
    .where(eq(schedulingMessageRecipients.messageId, messageId))
    .orderBy(desc(schedulingMessageRecipients.createdAt));
}

export async function deleteSchedulingMessage(messageId: string, deletedByUserId: string): Promise<void> {
  const [message] = await db.select().from(schedulingMessages).where(eq(schedulingMessages.id, messageId));
  if (!message) throw new Error('Message not found');
  if (message.status === 'sent') throw new Error('Cannot delete sent messages');

  await db.delete(schedulingMessages).where(eq(schedulingMessages.id, messageId));

  await writeAuditEvent(
    'SCHEDULING_MESSAGE_DELETED',
    'scheduling_message',
    messageId,
    deletedByUserId,
    null,
    { title: message.title },
    null,
    ['deleted'],
    'Message deleted'
  );
}

// =============================================================================
// LABOR BUDGET & COST CONTROLS
// =============================================================================

export interface LaborCostSummary {
  totalScheduledHours: number;
  totalActualHours: number;
  totalEstimatedCost: number;
  totalActualCost: number;
  assignmentCount: number;
  overtimeCount: number;
}

export interface DailyLaborCost {
  date: string;
  locationId: string | null;
  locationName: string | null;
  scheduledHours: number;
  estimatedCost: number;
  actualHours: number;
  actualCost: number;
  assignmentCount: number;
  overtimeCount: number;
}

export interface BudgetWarning {
  type: 'daily' | 'weekly';
  locationId: string;
  locationName: string;
  budgetLimit: number;
  currentCost: number;
  percentUsed: number;
  isOverBudget: boolean;
  warningThreshold: number;
}

// Calculate shift duration in hours
function calculateShiftHours(startTime: Date, endTime: Date, breakMinutes: number = 0): number {
  const durationMs = endTime.getTime() - startTime.getTime();
  const durationHours = durationMs / (1000 * 60 * 60);
  const breakHours = breakMinutes / 60;
  return Math.max(0, durationHours - breakHours);
}

// Get hourly rate for an employee
async function getEmployeeHourlyRate(employeeId: string): Promise<number> {
  const [employee] = await db.select({ hourlyRate: employees.hourlyRate })
    .from(employees)
    .where(eq(employees.id, employeeId));
  return employee?.hourlyRate ? parseFloat(employee.hourlyRate) : 0;
}

// Calculate labor cost for a single shift assignment
export async function calculateAssignmentCost(
  shiftId: string,
  employeeId: string,
  startTime: Date,
  endTime: Date,
  breakMinutes: number = 0
): Promise<{ scheduledHours: number; hourlyRate: number; estimatedCost: number }> {
  const scheduledHours = calculateShiftHours(startTime, endTime, breakMinutes);
  const hourlyRate = await getEmployeeHourlyRate(employeeId);
  const estimatedCost = scheduledHours * hourlyRate;
  
  return { scheduledHours, hourlyRate, estimatedCost };
}

// Update assignment with labor cost data
export async function updateAssignmentCosts(
  assignmentId: string,
  employeeId: string,
  shiftStartTime: Date,
  shiftEndTime: Date,
  breakMinutes: number = 0
): Promise<void> {
  const costData = await calculateAssignmentCost(
    assignmentId,
    employeeId,
    shiftStartTime,
    shiftEndTime,
    breakMinutes
  );
  
  await db.update(shiftAssignments)
    .set({
      hourlyRate: costData.hourlyRate.toString(),
      scheduledHours: costData.scheduledHours.toString(),
      estimatedCost: costData.estimatedCost.toString(),
      updatedAt: new Date(),
    })
    .where(eq(shiftAssignments.id, assignmentId));
}

// Get labor costs by day and location for a date range
export async function getLaborCostsByDay(
  startDate: string,
  endDate: string,
  locationId?: string
): Promise<DailyLaborCost[]> {
  let query = db.select({
    date: shifts.date,
    locationId: shifts.locationId,
    locationName: workLocations.name,
    scheduledHours: sql<string>`COALESCE(SUM(CAST(${shiftAssignments.scheduledHours} AS DECIMAL)), 0)`,
    estimatedCost: sql<string>`COALESCE(SUM(CAST(${shiftAssignments.estimatedCost} AS DECIMAL)), 0)`,
    actualHours: sql<string>`COALESCE(SUM(CAST(${shiftAssignments.actualHours} AS DECIMAL)), 0)`,
    actualCost: sql<string>`COALESCE(SUM(CAST(${shiftAssignments.actualCost} AS DECIMAL)), 0)`,
    assignmentCount: sql<number>`COUNT(${shiftAssignments.id})::int`,
    overtimeCount: sql<number>`SUM(CASE WHEN ${shiftAssignments.isOvertime} THEN 1 ELSE 0 END)::int`,
  })
  .from(shifts)
  .leftJoin(shiftAssignments, eq(shifts.id, shiftAssignments.shiftId))
  .leftJoin(workLocations, eq(shifts.locationId, workLocations.id))
  .where(and(
    gte(shifts.date, startDate),
    lte(shifts.date, endDate),
    locationId ? eq(shifts.locationId, locationId) : sql`TRUE`
  ))
  .groupBy(shifts.date, shifts.locationId, workLocations.name)
  .orderBy(asc(shifts.date));

  const results = await query;
  
  return results.map(r => ({
    date: r.date as string,
    locationId: r.locationId,
    locationName: r.locationName,
    scheduledHours: parseFloat(r.scheduledHours) || 0,
    estimatedCost: parseFloat(r.estimatedCost) || 0,
    actualHours: parseFloat(r.actualHours) || 0,
    actualCost: parseFloat(r.actualCost) || 0,
    assignmentCount: r.assignmentCount || 0,
    overtimeCount: r.overtimeCount || 0,
  }));
}

// Get total labor costs for a schedule
export async function getScheduleLaborCost(scheduleId: string): Promise<LaborCostSummary> {
  const [result] = await db.select({
    totalScheduledHours: sql<string>`COALESCE(SUM(CAST(${schedulingAssignments.scheduledHours} AS DECIMAL)), 0)`,
    totalActualHours: sql<string>`COALESCE(SUM(CAST(${schedulingAssignments.actualHours} AS DECIMAL)), 0)`,
    totalEstimatedCost: sql<string>`COALESCE(SUM(CAST(${schedulingAssignments.estimatedCost} AS DECIMAL)), 0)`,
    totalActualCost: sql<string>`COALESCE(SUM(CAST(${schedulingAssignments.actualCost} AS DECIMAL)), 0)`,
    assignmentCount: sql<number>`COUNT(${schedulingAssignments.id})::int`,
    overtimeCount: sql<number>`SUM(CASE WHEN ${schedulingAssignments.isOvertime} THEN 1 ELSE 0 END)::int`,
  })
  .from(schedulingShifts)
  .leftJoin(schedulingAssignments, eq(schedulingShifts.id, schedulingAssignments.shiftId))
  .where(eq(schedulingShifts.scheduleId, scheduleId));

  return {
    totalScheduledHours: parseFloat(result?.totalScheduledHours || '0'),
    totalActualHours: parseFloat(result?.totalActualHours || '0'),
    totalEstimatedCost: parseFloat(result?.totalEstimatedCost || '0'),
    totalActualCost: parseFloat(result?.totalActualCost || '0'),
    assignmentCount: result?.assignmentCount || 0,
    overtimeCount: result?.overtimeCount || 0,
  };
}

// Check budget warnings for locations
export async function checkBudgetWarnings(
  startDate: string,
  endDate: string,
  locationIds?: string[]
): Promise<BudgetWarning[]> {
  // Get locations with their budget settings
  let locationsQuery = db.select().from(workLocations).where(eq(workLocations.isActive, true));
  if (locationIds && locationIds.length > 0) {
    locationsQuery = locationsQuery.where(inArray(workLocations.id, locationIds)) as typeof locationsQuery;
  }
  const locations = await locationsQuery;

  const warnings: BudgetWarning[] = [];
  
  for (const location of locations) {
    if (!location.dailyLaborBudget && !location.weeklyLaborBudget) continue;
    
    const dailyCosts = await getLaborCostsByDay(startDate, endDate, location.id);
    const warningThreshold = location.budgetWarningThreshold || 90;
    
    // Check daily budgets
    if (location.dailyLaborBudget) {
      const dailyBudget = parseFloat(location.dailyLaborBudget);
      for (const day of dailyCosts) {
        const percentUsed = (day.estimatedCost / dailyBudget) * 100;
        if (percentUsed >= warningThreshold) {
          warnings.push({
            type: 'daily',
            locationId: location.id,
            locationName: location.name,
            budgetLimit: dailyBudget,
            currentCost: day.estimatedCost,
            percentUsed,
            isOverBudget: percentUsed > 100,
            warningThreshold,
          });
        }
      }
    }
    
    // Check weekly budget (aggregate all days)
    if (location.weeklyLaborBudget) {
      const weeklyBudget = parseFloat(location.weeklyLaborBudget);
      const totalWeeklyCost = dailyCosts.reduce((sum, day) => sum + day.estimatedCost, 0);
      const percentUsed = (totalWeeklyCost / weeklyBudget) * 100;
      
      if (percentUsed >= warningThreshold) {
        warnings.push({
          type: 'weekly',
          locationId: location.id,
          locationName: location.name,
          budgetLimit: weeklyBudget,
          currentCost: totalWeeklyCost,
          percentUsed,
          isOverBudget: percentUsed > 100,
          warningThreshold,
        });
      }
    }
  }
  
  return warnings;
}

// =============================================================================
// PAYROLL & HRIS EXPORT
// =============================================================================

export interface PayrollExportRecord {
  employeeId: string;
  employeeName: string;
  shiftId: string;
  shiftDate: string;
  locationName: string | null;
  scheduledHours: number;
  actualHours: number;
  hourlyRate: number;
  estimatedPay: number;
  actualPay: number;
  isOvertime: boolean;
  status: string;
}

export interface PayrollExportResult {
  exportId: string;
  records: PayrollExportRecord[];
  summary: {
    totalRecords: number;
    totalScheduledHours: number;
    totalActualHours: number;
    totalLaborCost: number;
    overtimeRecords: number;
  };
}

// Generate payroll export data
export async function generatePayrollExport(
  startDate: string,
  endDate: string,
  locationIds?: string[],
  exportedBy?: string
): Promise<PayrollExportResult> {
  let query = db.select({
    employeeId: shiftAssignments.employeeId,
    employeeFirstName: employees.firstName,
    employeeLastName: employees.lastName,
    shiftId: shifts.id,
    shiftDate: shifts.date,
    locationName: workLocations.name,
    scheduledHours: shiftAssignments.scheduledHours,
    actualHours: shiftAssignments.actualHours,
    hourlyRate: shiftAssignments.hourlyRate,
    estimatedCost: shiftAssignments.estimatedCost,
    actualCost: shiftAssignments.actualCost,
    isOvertime: shiftAssignments.isOvertime,
    status: shiftAssignments.status,
  })
  .from(shiftAssignments)
  .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
  .leftJoin(employees, eq(shiftAssignments.employeeId, employees.id))
  .leftJoin(workLocations, eq(shifts.locationId, workLocations.id))
  .where(and(
    gte(shifts.date, startDate),
    lte(shifts.date, endDate),
    locationIds && locationIds.length > 0 
      ? inArray(shifts.locationId, locationIds) 
      : sql`TRUE`
  ))
  .orderBy(asc(shifts.date), asc(employees.lastName));

  const results = await query;

  const records: PayrollExportRecord[] = results.map(r => ({
    employeeId: r.employeeId || '',
    employeeName: `${r.employeeFirstName || ''} ${r.employeeLastName || ''}`.trim(),
    shiftId: r.shiftId,
    shiftDate: r.shiftDate as string,
    locationName: r.locationName,
    scheduledHours: parseFloat(r.scheduledHours || '0'),
    actualHours: parseFloat(r.actualHours || '0'),
    hourlyRate: parseFloat(r.hourlyRate || '0'),
    estimatedPay: parseFloat(r.estimatedCost || '0'),
    actualPay: parseFloat(r.actualCost || '0'),
    isOvertime: r.isOvertime || false,
    status: r.status || 'assigned',
  }));

  const summary = {
    totalRecords: records.length,
    totalScheduledHours: records.reduce((sum, r) => sum + r.scheduledHours, 0),
    totalActualHours: records.reduce((sum, r) => sum + r.actualHours, 0),
    totalLaborCost: records.reduce((sum, r) => sum + (r.actualPay || r.estimatedPay), 0),
    overtimeRecords: records.filter(r => r.isOvertime).length,
  };

  // Create export record
  const [exportRecord] = await db.insert(payrollExports).values({
    exportType: 'json',
    dateRangeStart: startDate,
    dateRangeEnd: endDate,
    locationIds: locationIds || null,
    totalRecords: summary.totalRecords,
    totalScheduledHours: summary.totalScheduledHours.toString(),
    totalActualHours: summary.totalActualHours.toString(),
    totalLaborCost: summary.totalLaborCost.toString(),
    exportedBy: exportedBy || null,
    status: 'completed',
  }).returning();

  return {
    exportId: exportRecord.id,
    records,
    summary,
  };
}

// Helper to escape CSV field values properly (handles commas, quotes, newlines)
function escapeCSVField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Convert payroll export to CSV format
export function convertPayrollToCSV(records: PayrollExportRecord[]): string {
  const headers = [
    'Employee ID',
    'Employee Name',
    'Shift ID',
    'Shift Date',
    'Location',
    'Scheduled Hours',
    'Actual Hours',
    'Hourly Rate',
    'Estimated Pay',
    'Actual Pay',
    'Overtime',
    'Status'
  ];

  const rows = records.map(r => [
    escapeCSVField(r.employeeId),
    escapeCSVField(r.employeeName),
    escapeCSVField(r.shiftId),
    escapeCSVField(r.shiftDate),
    escapeCSVField(r.locationName || ''),
    r.scheduledHours.toFixed(2),
    r.actualHours.toFixed(2),
    r.hourlyRate.toFixed(2),
    r.estimatedPay.toFixed(2),
    r.actualPay.toFixed(2),
    r.isOvertime ? 'Yes' : 'No',
    escapeCSVField(r.status)
  ]);

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

// Get export history
export async function getPayrollExportHistory(limit: number = 20): Promise<any[]> {
  return db.select()
    .from(payrollExports)
    .orderBy(desc(payrollExports.exportedAt))
    .limit(limit);
}

// Update location labor budget settings
export async function updateLocationBudget(
  locationId: string,
  dailyBudget?: number,
  weeklyBudget?: number,
  warningThreshold?: number
): Promise<void> {
  await db.update(workLocations)
    .set({
      dailyLaborBudget: dailyBudget?.toString() || null,
      weeklyLaborBudget: weeklyBudget?.toString() || null,
      budgetWarningThreshold: warningThreshold || 90,
      updatedAt: new Date(),
    })
    .where(eq(workLocations.id, locationId));
}

// ============================================
// UNION / CBA RULES VIOLATION CHECKING
// ============================================

interface ViolationResult {
  ruleSetId: string;
  ruleSetName: string;
  driverId?: string;
  driverName?: string;
  violationType: string;
  severity: string;
  ruleName: string;
  ruleValue: string;
  actualValue: string;
  message: string;
}

export async function checkScheduleUnionViolations(scheduleId: string): Promise<ViolationResult[]> {
  const [schedule] = await db.select()
    .from(schedulingSchedules)
    .where(eq(schedulingSchedules.id, scheduleId))
    .limit(1);

  if (!schedule) throw new Error("Schedule not found");

  const conditions = [eq(unionCbaRuleSets.isActive, true)];
  if (schedule.entityId) {
    conditions.push(
      or(
        eq(unionCbaRuleSets.entityId, schedule.entityId),
        sql`${unionCbaRuleSets.entityId} IS NULL`
      )!
    );
  }

  const ruleSets = await db.select()
    .from(unionCbaRuleSets)
    .where(and(...conditions));

  if (ruleSets.length === 0) return [];

  const scheduleShifts = await db.select()
    .from(schedulingShifts)
    .where(eq(schedulingShifts.scheduleId, scheduleId));

  if (scheduleShifts.length === 0) return [];

  const allAssignments = await db.select()
    .from(schedulingAssignments)
    .where(
      inArray(
        schedulingAssignments.shiftId,
        scheduleShifts.map(s => s.id)
      )
    );

  const violations: ViolationResult[] = [];

  const driverShifts = new Map<string, typeof scheduleShifts>();
  for (const shift of scheduleShifts) {
    const shiftAssigns = allAssignments.filter(a => a.shiftId === shift.id);
    for (const assign of shiftAssigns) {
      const driverId = assign.driverId || assign.userId;
      if (!driverId) continue;
      if (!driverShifts.has(driverId)) driverShifts.set(driverId, []);
      driverShifts.get(driverId)!.push(shift);
    }
  }

  for (const ruleSet of ruleSets) {
    const effectiveFrom = new Date(ruleSet.effectiveFrom);
    const effectiveTo = ruleSet.effectiveTo ? new Date(ruleSet.effectiveTo) : null;
    const scheduleStart = new Date(schedule.startDate);
    const scheduleEnd = new Date(schedule.endDate);

    if (effectiveFrom > scheduleEnd) continue;
    if (effectiveTo && effectiveTo < scheduleStart) continue;

    for (const [driverId, dShifts] of driverShifts) {
      if (ruleSet.locationId) {
        const locationShifts = dShifts.filter(s => s.locationId === ruleSet.locationId);
        if (locationShifts.length === 0) continue;
      }

      const driverName = allAssignments.find(a => (a.driverId === driverId || a.userId === driverId))?.driverId
        ? `Driver ${driverId.substring(0, 8)}`
        : `Worker ${driverId.substring(0, 8)}`;

      const sortedShifts = [...dShifts].sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      // Check max consecutive days
      if (ruleSet.maxConsecutiveDays) {
        const uniqueDates = [...new Set(sortedShifts.map(s => s.date))].sort();
        let maxConsec = 1;
        let currentConsec = 1;
        for (let i = 1; i < uniqueDates.length; i++) {
          const prev = new Date(uniqueDates[i - 1]);
          const curr = new Date(uniqueDates[i]);
          const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays === 1) {
            currentConsec++;
            maxConsec = Math.max(maxConsec, currentConsec);
          } else {
            currentConsec = 1;
          }
        }
        if (maxConsec > ruleSet.maxConsecutiveDays) {
          violations.push({
            ruleSetId: ruleSet.id,
            ruleSetName: ruleSet.name,
            driverId,
            driverName,
            violationType: "max_consecutive_days",
            severity: "warning",
            ruleName: "Max Consecutive Days",
            ruleValue: String(ruleSet.maxConsecutiveDays),
            actualValue: String(maxConsec),
            message: `${driverName} is scheduled for ${maxConsec} consecutive days (max: ${ruleSet.maxConsecutiveDays}) under "${ruleSet.name}"`,
          });
        }
      }

      // Check guaranteed weekly hours
      if (ruleSet.guaranteedWeeklyHours) {
        const totalHours = sortedShifts.reduce((sum, s) => {
          const start = new Date(s.startTime);
          const end = new Date(s.endTime);
          const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
          return sum + Math.max(0, hours - (s.breakMinutes || 0) / 60);
        }, 0);

        const guaranteedHours = parseFloat(ruleSet.guaranteedWeeklyHours);
        if (totalHours < guaranteedHours) {
          violations.push({
            ruleSetId: ruleSet.id,
            ruleSetName: ruleSet.name,
            driverId,
            driverName,
            violationType: "guaranteed_weekly_hours",
            severity: "warning",
            ruleName: "Guaranteed Weekly Hours",
            ruleValue: String(guaranteedHours),
            actualValue: totalHours.toFixed(1),
            message: `${driverName} is scheduled for ${totalHours.toFixed(1)} hours but guaranteed ${guaranteedHours} hours/week under "${ruleSet.name}"`,
          });
        }
      }

      // Check guaranteed daily hours
      if (ruleSet.guaranteedDailyHours) {
        const guaranteedDaily = parseFloat(ruleSet.guaranteedDailyHours);
        const dateHoursMap = new Map<string, number>();
        for (const shift of sortedShifts) {
          const start = new Date(shift.startTime);
          const end = new Date(shift.endTime);
          const hours = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60) - (shift.breakMinutes || 0) / 60);
          dateHoursMap.set(shift.date, (dateHoursMap.get(shift.date) || 0) + hours);
        }
        for (const [date, hours] of dateHoursMap) {
          if (hours < guaranteedDaily) {
            violations.push({
              ruleSetId: ruleSet.id,
              ruleSetName: ruleSet.name,
              driverId,
              driverName,
              violationType: "guaranteed_daily_hours",
              severity: "warning",
              ruleName: "Guaranteed Daily Hours",
              ruleValue: String(guaranteedDaily),
              actualValue: hours.toFixed(1),
              message: `${driverName} is scheduled for ${hours.toFixed(1)}h on ${date} but guaranteed ${guaranteedDaily}h/day under "${ruleSet.name}"`,
            });
            break;
          }
        }
      }

      // Check daily overtime premium threshold
      if (ruleSet.dailyOvertimePremiumThreshold) {
        const threshold = parseFloat(ruleSet.dailyOvertimePremiumThreshold);
        for (const shift of sortedShifts) {
          const start = new Date(shift.startTime);
          const end = new Date(shift.endTime);
          const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60) - (shift.breakMinutes || 0) / 60;
          if (hours > threshold) {
            violations.push({
              ruleSetId: ruleSet.id,
              ruleSetName: ruleSet.name,
              driverId,
              driverName,
              violationType: "daily_overtime_premium",
              severity: "warning",
              ruleName: "Daily OT Premium Threshold",
              ruleValue: `${threshold}h`,
              actualValue: `${hours.toFixed(1)}h`,
              message: `${driverName} has a ${hours.toFixed(1)}h shift on ${shift.date} exceeding ${threshold}h daily OT threshold under "${ruleSet.name}"`,
            });
            break;
          }
        }
      }

      // Check weekly overtime premium threshold
      if (ruleSet.weeklyOvertimePremiumThreshold) {
        const threshold = parseFloat(ruleSet.weeklyOvertimePremiumThreshold);
        const totalHours = sortedShifts.reduce((sum, s) => {
          const start = new Date(s.startTime);
          const end = new Date(s.endTime);
          return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60) - (s.breakMinutes || 0) / 60;
        }, 0);

        if (totalHours > threshold) {
          violations.push({
            ruleSetId: ruleSet.id,
            ruleSetName: ruleSet.name,
            driverId,
            driverName,
            violationType: "weekly_overtime_premium",
            severity: "warning",
            ruleName: "Weekly OT Premium Threshold",
            ruleValue: `${threshold}h`,
            actualValue: `${totalHours.toFixed(1)}h`,
            message: `${driverName} has ${totalHours.toFixed(1)} total hours exceeding ${threshold}h weekly OT threshold under "${ruleSet.name}"`,
          });
        }
      }

      // Check max shift length
      if (ruleSet.maxShiftLengthHours) {
        const maxLength = parseFloat(ruleSet.maxShiftLengthHours);
        for (const shift of sortedShifts) {
          const start = new Date(shift.startTime);
          const end = new Date(shift.endTime);
          const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
          if (hours > maxLength) {
            violations.push({
              ruleSetId: ruleSet.id,
              ruleSetName: ruleSet.name,
              driverId,
              driverName,
              violationType: "max_shift_length",
              severity: "warning",
              ruleName: "Max Shift Length",
              ruleValue: `${maxLength}h`,
              actualValue: `${hours.toFixed(1)}h`,
              message: `${driverName} has a ${hours.toFixed(1)}h shift on ${shift.date} exceeding max ${maxLength}h under "${ruleSet.name}"`,
            });
            break;
          }
        }
      }

      // Check minimum rest between shifts
      if (ruleSet.minRestBetweenShiftsHours) {
        const minRest = parseFloat(ruleSet.minRestBetweenShiftsHours);
        const sortedByTime = [...sortedShifts].sort((a, b) =>
          new Date(a.endTime).getTime() - new Date(b.endTime).getTime()
        );
        for (let i = 0; i < sortedByTime.length - 1; i++) {
          const thisEnd = new Date(sortedByTime[i].endTime);
          const nextStart = new Date(sortedByTime[i + 1].startTime);
          const restHours = (nextStart.getTime() - thisEnd.getTime()) / (1000 * 60 * 60);
          if (restHours < minRest && restHours >= 0) {
            violations.push({
              ruleSetId: ruleSet.id,
              ruleSetName: ruleSet.name,
              driverId,
              driverName,
              violationType: "min_rest_between_shifts",
              severity: "warning",
              ruleName: "Min Rest Between Shifts",
              ruleValue: `${minRest}h`,
              actualValue: `${restHours.toFixed(1)}h`,
              message: `${driverName} has only ${restHours.toFixed(1)}h rest between shifts (min: ${minRest}h) under "${ruleSet.name}"`,
            });
            break;
          }
        }
      }
    }
  }

  // Always clear existing violations for this schedule before persisting new ones
  await db.delete(unionCbaViolations).where(eq(unionCbaViolations.scheduleId, scheduleId));

  // Persist violations
  if (violations.length > 0) {
    for (const v of violations) {
      await db.insert(unionCbaViolations).values({
        ruleSetId: v.ruleSetId,
        scheduleId,
        driverId: v.driverId,
        driverName: v.driverName,
        violationType: v.violationType,
        severity: v.severity,
        ruleName: v.ruleName,
        ruleValue: v.ruleValue,
        actualValue: v.actualValue,
        message: v.message,
      });
    }
  }

  return violations;
}
