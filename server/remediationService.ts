import { db } from "./db";
import { driverIncidents, correctiveActions, correctiveActionAuditLogs, accidents } from "@shared/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import type { CorrectiveActionType, CorrectiveActionStatus, InsertDriverIncident, InsertCorrectiveAction } from "@shared/schema";

export interface RemediationRule {
  condition: string;
  action: CorrectiveActionType;
  dueDays: number;
}

export const REMEDIATION_RULES: RemediationRule[] = [
  {
    condition: ">1 preventable claim in 90 days",
    action: "coaching_required",
    dueDays: 14,
  },
  {
    condition: "severe claim",
    action: "training_required",
    dueDays: 30,
  },
  {
    condition: "repeat severe within 180 days",
    action: "probation",
    dueDays: 90,
  },
];

export async function createDriverIncident(
  claimId: string,
  driverId: string,
  severity: string,
  incidentDate: Date,
  preventableFlag: boolean,
  createdByUserId: string,
  notes?: string
): Promise<string> {
  const safetyReviewRequired = severity === "severe";

  const [incident] = await db.insert(driverIncidents).values({
    claimId,
    driverId,
    severity,
    preventableFlag,
    incidentDate,
    notes,
    safetyReviewRequired,
    createdByUserId,
  }).returning();

  await applyAutomationRules(incident.id, driverId, severity, preventableFlag, createdByUserId);

  return incident.id;
}

async function applyAutomationRules(
  incidentId: string,
  driverId: string,
  severity: string,
  preventableFlag: boolean,
  createdByUserId: string
): Promise<void> {
  const now = new Date();
  const actionsToCreate: { type: CorrectiveActionType; rule: string; dueDays: number }[] = [];

  if (severity === "severe") {
    actionsToCreate.push({
      type: "training_required",
      rule: "severe claim",
      dueDays: 30,
    });

    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const previousSevereIncidents = await db
      .select()
      .from(driverIncidents)
      .where(
        and(
          eq(driverIncidents.driverId, driverId),
          eq(driverIncidents.severity, "severe"),
          gte(driverIncidents.incidentDate, sixMonthsAgo)
        )
      );

    if (previousSevereIncidents.length > 1) {
      actionsToCreate.push({
        type: "probation",
        rule: "repeat severe within 180 days",
        dueDays: 90,
      });
    }
  }

  if (preventableFlag) {
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const preventableIncidents = await db
      .select()
      .from(driverIncidents)
      .where(
        and(
          eq(driverIncidents.driverId, driverId),
          eq(driverIncidents.preventableFlag, true),
          gte(driverIncidents.incidentDate, ninetyDaysAgo)
        )
      );

    if (preventableIncidents.length > 1) {
      actionsToCreate.push({
        type: "coaching_required",
        rule: ">1 preventable claim in 90 days",
        dueDays: 14,
      });
    }
  }

  for (const action of actionsToCreate) {
    const dueDate = new Date(now.getTime() + action.dueDays * 24 * 60 * 60 * 1000);
    
    const [created] = await db.insert(correctiveActions).values({
      driverIncidentId: incidentId,
      driverId,
      actionType: action.type,
      status: "open",
      dueDate,
      automationRule: action.rule,
      createdByUserId,
    }).returning();

    await db.insert(correctiveActionAuditLogs).values({
      correctiveActionId: created.id,
      userId: createdByUserId,
      actionType: "CREATED",
      newValue: action.type,
      notes: `Auto-created by rule: ${action.rule}`,
    });
  }
}

export async function updateCorrectiveActionStatus(
  actionId: string,
  newStatus: CorrectiveActionStatus,
  userId: string,
  notes?: string,
  waivedReason?: string
): Promise<void> {
  const [existing] = await db.select().from(correctiveActions).where(eq(correctiveActions.id, actionId));
  
  if (!existing) {
    throw new Error("Corrective action not found");
  }

  const previousStatus = existing.status;
  const updateData: Partial<typeof correctiveActions.$inferSelect> = {
    status: newStatus,
    updatedAt: new Date(),
  };

  if (newStatus === "completed") {
    updateData.completedAt = new Date();
    updateData.completedByUserId = userId;
  } else if (newStatus === "waived") {
    updateData.waivedAt = new Date();
    updateData.waivedByUserId = userId;
    updateData.waivedReason = waivedReason || notes;
  }

  await db.update(correctiveActions).set(updateData).where(eq(correctiveActions.id, actionId));

  await db.insert(correctiveActionAuditLogs).values({
    correctiveActionId: actionId,
    userId,
    actionType: "STATUS_CHANGED",
    previousValue: previousStatus,
    newValue: newStatus,
    notes,
  });
}

export async function getDriverIncidentHistory(driverId: string): Promise<any[]> {
  const incidents = await db
    .select({
      incident: driverIncidents,
      claimId: driverIncidents.claimId,
    })
    .from(driverIncidents)
    .where(eq(driverIncidents.driverId, driverId))
    .orderBy(desc(driverIncidents.incidentDate));

  return incidents;
}

export async function getCorrectiveActionsForDriver(driverId: string): Promise<any[]> {
  const actions = await db
    .select()
    .from(correctiveActions)
    .where(eq(correctiveActions.driverId, driverId))
    .orderBy(desc(correctiveActions.createdAt));

  return actions;
}

export async function getCorrectiveActionsForIncident(incidentId: string): Promise<any[]> {
  const actions = await db
    .select()
    .from(correctiveActions)
    .where(eq(correctiveActions.driverIncidentId, incidentId))
    .orderBy(desc(correctiveActions.createdAt));

  return actions;
}

export async function getOverdueActions(): Promise<any[]> {
  const now = new Date();
  const actions = await db
    .select()
    .from(correctiveActions)
    .where(
      and(
        sql`${correctiveActions.status} IN ('open', 'in_progress')`,
        sql`${correctiveActions.dueDate} < ${now}`
      )
    )
    .orderBy(correctiveActions.dueDate);

  return actions;
}

export async function getRepeatIncidentDrivers(): Promise<any[]> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  
  const result = await db.execute(sql`
    SELECT 
      di.driver_id,
      COUNT(*) as incident_count,
      COUNT(*) FILTER (WHERE di.preventable_flag = true) as preventable_count,
      COUNT(*) FILTER (WHERE di.severity = 'severe') as severe_count,
      MAX(di.incident_date) as last_incident_date
    FROM driver_incidents di
    WHERE di.incident_date >= ${ninetyDaysAgo}
    GROUP BY di.driver_id
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 20
  `);

  return result.rows as any[];
}

export async function createManualCorrectiveAction(
  driverIncidentId: string,
  driverId: string,
  actionType: CorrectiveActionType,
  dueDate: Date | null,
  assignedToUserId: string | null,
  notes: string | null,
  createdByUserId: string
): Promise<string> {
  const [created] = await db.insert(correctiveActions).values({
    driverIncidentId,
    driverId,
    actionType,
    status: "open",
    dueDate,
    assignedToUserId,
    notes,
    createdByUserId,
  }).returning();

  await db.insert(correctiveActionAuditLogs).values({
    correctiveActionId: created.id,
    userId: createdByUserId,
    actionType: "CREATED",
    newValue: actionType,
    notes: "Manually created",
  });

  return created.id;
}

export async function getIncidentForClaim(claimId: string): Promise<any | null> {
  const [incident] = await db
    .select()
    .from(driverIncidents)
    .where(eq(driverIncidents.claimId, claimId));

  return incident || null;
}
