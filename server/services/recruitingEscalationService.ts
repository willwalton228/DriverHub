import { db } from "../db";
import { eq, desc, and, sql, inArray, ne, isNull, count } from "drizzle-orm";
import {
  recruitingEscalationRules,
  recruitingEscalationEvents,
  recruitingAuditEvents,
  recruitingApplications,
  recruitingCandidates,
  recruitingWorkflowStages,
  recruitingRequisitions,
  users,
  type RecruitingEscalationRule,
  type RecruitingEscalationEvent,
} from "@shared/schema";

export async function getEscalationRules(): Promise<RecruitingEscalationRule[]> {
  return db
    .select()
    .from(recruitingEscalationRules)
    .orderBy(desc(recruitingEscalationRules.createdAt));
}

export async function getEscalationRule(id: string): Promise<RecruitingEscalationRule | undefined> {
  const [rule] = await db
    .select()
    .from(recruitingEscalationRules)
    .where(eq(recruitingEscalationRules.id, id));
  return rule;
}

export async function createEscalationRule(
  data: {
    name: string;
    description?: string;
    triggerType: string;
    thresholdValue: number;
    actionType: string;
    isActive?: boolean;
  },
  userId: string | null,
  userEmail: string | null
): Promise<RecruitingEscalationRule> {
  const [rule] = await db.insert(recruitingEscalationRules).values({
    name: data.name,
    description: data.description,
    triggerType: data.triggerType,
    thresholdValue: data.thresholdValue,
    actionType: data.actionType,
    isActive: data.isActive ?? true,
    createdBy: userId,
    updatedBy: userId,
  }).returning();

  await db.insert(recruitingAuditEvents).values({
    actionType: "ESCALATION_RULE_CREATED",
    entityType: "escalation_rule",
    entityId: rule.id,
    userId,
    userEmail,
    source: "ui",
    newValue: JSON.stringify(data),
  });

  return rule;
}

export async function updateEscalationRule(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    triggerType: string;
    thresholdValue: number;
    actionType: string;
    isActive: boolean;
  }>,
  userId: string | null,
  userEmail: string | null
): Promise<RecruitingEscalationRule | undefined> {
  const existing = await getEscalationRule(id);
  if (!existing) return undefined;

  const [updated] = await db.update(recruitingEscalationRules)
    .set({ ...data, updatedAt: new Date(), updatedBy: userId })
    .where(eq(recruitingEscalationRules.id, id))
    .returning();

  await db.insert(recruitingAuditEvents).values({
    actionType: "ESCALATION_RULE_UPDATED",
    entityType: "escalation_rule",
    entityId: id,
    userId,
    userEmail,
    source: "ui",
    previousValue: JSON.stringify(existing),
    newValue: JSON.stringify(updated),
  });

  return updated;
}

export async function deleteEscalationRule(
  id: string,
  userId: string | null,
  userEmail: string | null
): Promise<boolean> {
  const existing = await getEscalationRule(id);
  if (!existing) return false;

  await db.delete(recruitingEscalationRules)
    .where(eq(recruitingEscalationRules.id, id));

  await db.insert(recruitingAuditEvents).values({
    actionType: "ESCALATION_RULE_DELETED",
    entityType: "escalation_rule",
    entityId: id,
    userId,
    userEmail,
    source: "ui",
    previousValue: JSON.stringify(existing),
  });

  return true;
}

export async function getEscalationEvents(filters?: {
  applicationId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ events: any[]; total: number }> {
  const conditions = [];
  if (filters?.applicationId) {
    conditions.push(eq(recruitingEscalationEvents.applicationId, filters.applicationId));
  }
  if (filters?.status) {
    conditions.push(eq(recruitingEscalationEvents.status, filters.status));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = await db
    .select({ count: count() })
    .from(recruitingEscalationEvents)
    .where(whereClause);

  const events = await db
    .select({
      event: recruitingEscalationEvents,
      ruleName: recruitingEscalationRules.name,
    })
    .from(recruitingEscalationEvents)
    .leftJoin(recruitingEscalationRules, eq(recruitingEscalationEvents.ruleId, recruitingEscalationRules.id))
    .where(whereClause)
    .orderBy(desc(recruitingEscalationEvents.createdAt))
    .limit(filters?.limit ?? 50)
    .offset(filters?.offset ?? 0);

  const eventIds = events.map(e => e.event.applicationId).filter(Boolean) as string[];
  let appMap: Record<string, any> = {};
  if (eventIds.length > 0) {
    const apps = await db
      .select({
        id: recruitingApplications.id,
        currentStage: recruitingApplications.currentStage,
        candidateId: recruitingApplications.candidateId,
      })
      .from(recruitingApplications)
      .where(inArray(recruitingApplications.id, eventIds));
    for (const app of apps) {
      appMap[app.id] = app;
    }
  }

  const candidateIds = Array.from(new Set(Object.values(appMap).map((a: any) => a.candidateId).filter(Boolean)));
  let candidateMap: Record<string, any> = {};
  if (candidateIds.length > 0) {
    const candidates = await db
      .select({
        id: recruitingCandidates.id,
        firstName: recruitingCandidates.firstName,
        lastName: recruitingCandidates.lastName,
      })
      .from(recruitingCandidates)
      .where(inArray(recruitingCandidates.id, candidateIds));
    for (const c of candidates) {
      candidateMap[c.id] = c;
    }
  }

  const userIds = Array.from(new Set(events.flatMap(e => [
    e.event.originalOwnerId,
    e.event.reassignedToId,
    e.event.acknowledgedBy,
    e.event.resolvedBy,
  ]).filter(Boolean))) as string[];
  let userMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const userRecords = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, userIds));
    for (const u of userRecords) {
      if (u.email) userMap[u.id] = u.email;
    }
  }

  const enriched = events.map(({ event, ruleName }) => {
    const app = event.applicationId ? appMap[event.applicationId] : null;
    const candidate = app?.candidateId ? candidateMap[app.candidateId] : null;
    return {
      ...event,
      ruleName: ruleName || "Deleted Rule",
      candidateName: candidate ? `${candidate.firstName} ${candidate.lastName}` : null,
      currentStage: app?.currentStage || null,
      originalOwnerEmail: event.originalOwnerId ? userMap[event.originalOwnerId] || null : null,
      reassignedToEmail: event.reassignedToId ? userMap[event.reassignedToId] || null : null,
      acknowledgedByEmail: event.acknowledgedBy ? userMap[event.acknowledgedBy] || null : null,
      resolvedByEmail: event.resolvedBy ? userMap[event.resolvedBy] || null : null,
    };
  });

  return { events: enriched, total: totalResult?.count ?? 0 };
}

export async function getApplicationEscalations(applicationId: string): Promise<RecruitingEscalationEvent[]> {
  return db
    .select()
    .from(recruitingEscalationEvents)
    .where(eq(recruitingEscalationEvents.applicationId, applicationId))
    .orderBy(desc(recruitingEscalationEvents.createdAt));
}

export async function acknowledgeEscalation(
  escalationId: string,
  userId: string,
  userEmail: string | null
): Promise<RecruitingEscalationEvent | undefined> {
  const [existing] = await db
    .select()
    .from(recruitingEscalationEvents)
    .where(eq(recruitingEscalationEvents.id, escalationId));

  if (!existing || existing.status !== "open") return undefined;

  const [updated] = await db.update(recruitingEscalationEvents)
    .set({
      status: "acknowledged",
      acknowledgedBy: userId,
      acknowledgedAt: new Date(),
    })
    .where(eq(recruitingEscalationEvents.id, escalationId))
    .returning();

  await db.insert(recruitingAuditEvents).values({
    actionType: "ESCALATION_ACKNOWLEDGED",
    entityType: "application",
    entityId: existing.applicationId || escalationId,
    userId,
    userEmail,
    source: "ui",
    metadata: { escalationId },
  });

  return updated;
}

export async function reassignEscalation(
  escalationId: string,
  newOwnerId: string,
  userId: string,
  userEmail: string | null
): Promise<RecruitingEscalationEvent | undefined> {
  const [existing] = await db
    .select()
    .from(recruitingEscalationEvents)
    .where(eq(recruitingEscalationEvents.id, escalationId));

  if (!existing || existing.status === "resolved") return undefined;

  const [updated] = await db.update(recruitingEscalationEvents)
    .set({
      status: "reassigned",
      reassignedToId: newOwnerId,
    })
    .where(eq(recruitingEscalationEvents.id, escalationId))
    .returning();

  if (existing.applicationId) {
    await db.update(recruitingApplications)
      .set({
        ownerId: newOwnerId,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(recruitingApplications.id, existing.applicationId));
  }

  await db.insert(recruitingAuditEvents).values({
    actionType: "ESCALATION_REASSIGNED",
    entityType: "application",
    entityId: existing.applicationId || escalationId,
    userId,
    userEmail,
    source: "ui",
    previousValue: JSON.stringify({ ownerId: existing.originalOwnerId }),
    newValue: JSON.stringify({ ownerId: newOwnerId }),
    metadata: { escalationId },
  });

  return updated;
}

export async function resolveEscalation(
  escalationId: string,
  reason: string,
  userId: string,
  userEmail: string | null
): Promise<RecruitingEscalationEvent | undefined> {
  const [existing] = await db
    .select()
    .from(recruitingEscalationEvents)
    .where(eq(recruitingEscalationEvents.id, escalationId));

  if (!existing || existing.status === "resolved") return undefined;

  const [updated] = await db.update(recruitingEscalationEvents)
    .set({
      status: "resolved",
      resolvedBy: userId,
      resolvedAt: new Date(),
      resolvedReason: reason,
    })
    .where(eq(recruitingEscalationEvents.id, escalationId))
    .returning();

  await db.insert(recruitingAuditEvents).values({
    actionType: "ESCALATION_RESOLVED",
    entityType: "application",
    entityId: existing.applicationId || escalationId,
    userId,
    userEmail,
    source: "ui",
    metadata: { escalationId, reason },
  });

  return updated;
}

export async function detectAndTriggerEscalations(
  userId: string | null,
  userEmail: string | null
): Promise<{ triggered: number; details: any[] }> {
  const rules = await db
    .select()
    .from(recruitingEscalationRules)
    .where(eq(recruitingEscalationRules.isActive, true));

  if (rules.length === 0) return { triggered: 0, details: [] };

  const triggered: any[] = [];

  for (const rule of rules) {
    if (rule.triggerType === "sla_breach") {
      const results = await detectSlaBreachEscalations(rule);
      for (const result of results) {
        const existingOpen = await db
          .select()
          .from(recruitingEscalationEvents)
          .where(and(
            eq(recruitingEscalationEvents.applicationId, result.applicationId),
            eq(recruitingEscalationEvents.ruleId, rule.id),
            ne(recruitingEscalationEvents.status, "resolved"),
          ));

        if (existingOpen.length > 0) continue;

        const [event] = await db.insert(recruitingEscalationEvents).values({
          ruleId: rule.id,
          applicationId: result.applicationId,
          candidateId: result.candidateId,
          triggerType: "sla_breach",
          triggerDetails: result.details,
          status: "open",
          originalOwnerId: result.ownerId,
        }).returning();

        await db.insert(recruitingAuditEvents).values({
          actionType: "ESCALATION_TRIGGERED",
          entityType: "application",
          entityId: result.applicationId,
          userId,
          userEmail: userEmail || "system",
          source: "system",
          metadata: { ruleId: rule.id, ruleName: rule.name, escalationId: event.id, ...result.details },
        });

        triggered.push({ ...event, ruleName: rule.name });
      }
    } else if (rule.triggerType === "workload_exceeded") {
      const results = await detectWorkloadExceededEscalations(rule);
      for (const result of results) {
        const existingOpen = await db
          .select()
          .from(recruitingEscalationEvents)
          .where(and(
            eq(recruitingEscalationEvents.originalOwnerId, result.recruiterId),
            eq(recruitingEscalationEvents.ruleId, rule.id),
            eq(recruitingEscalationEvents.triggerType, "workload_exceeded"),
            ne(recruitingEscalationEvents.status, "resolved"),
          ));

        if (existingOpen.length > 0) continue;

        const [event] = await db.insert(recruitingEscalationEvents).values({
          ruleId: rule.id,
          applicationId: null,
          candidateId: null,
          triggerType: "workload_exceeded",
          triggerDetails: result.details,
          status: "open",
          originalOwnerId: result.recruiterId,
        }).returning();

        await db.insert(recruitingAuditEvents).values({
          actionType: "ESCALATION_TRIGGERED",
          entityType: "escalation_rule",
          entityId: rule.id,
          userId,
          userEmail: userEmail || "system",
          source: "system",
          metadata: { ruleId: rule.id, ruleName: rule.name, escalationId: event.id, ...result.details },
        });

        triggered.push({ ...event, ruleName: rule.name });
      }
    }
  }

  return { triggered: triggered.length, details: triggered };
}

async function detectSlaBreachEscalations(rule: RecruitingEscalationRule) {
  const terminalStages = ["hired", "rejected", "withdrawn", "no_show", "ready_to_work"];

  const applications = await db
    .select({
      id: recruitingApplications.id,
      candidateId: recruitingApplications.candidateId,
      currentStage: recruitingApplications.currentStage,
      currentStageEnteredAt: recruitingApplications.currentStageEnteredAt,
      ownerId: recruitingApplications.ownerId,
      requisitionId: recruitingApplications.requisitionId,
    })
    .from(recruitingApplications)
    .where(and(
      eq(recruitingApplications.isArchived, false),
    ));

  const activeApps = applications.filter(a => !terminalStages.includes(a.currentStage));
  if (activeApps.length === 0) return [];

  const reqIds = Array.from(new Set(activeApps.map(a => a.requisitionId)));
  const requisitions = await db
    .select({
      id: recruitingRequisitions.id,
      workflowId: recruitingRequisitions.workflowId,
    })
    .from(recruitingRequisitions)
    .where(inArray(recruitingRequisitions.id, reqIds));

  const reqMap: Record<string, string | null> = {};
  for (const r of requisitions) {
    reqMap[r.id] = r.workflowId;
  }

  const workflowIds = Array.from(new Set(Object.values(reqMap).filter(Boolean))) as string[];
  let stageMap: Record<string, number | null> = {};
  if (workflowIds.length > 0) {
    const stages = await db
      .select({
        workflowId: recruitingWorkflowStages.workflowId,
        stageKey: recruitingWorkflowStages.stageKey,
        stageSlaHours: recruitingWorkflowStages.stageSlaHours,
      })
      .from(recruitingWorkflowStages)
      .where(inArray(recruitingWorkflowStages.workflowId, workflowIds));

    for (const s of stages) {
      stageMap[`${s.workflowId}:${s.stageKey}`] = s.stageSlaHours;
    }
  }

  const results: { applicationId: string; candidateId: string; ownerId: string | null; details: any }[] = [];

  for (const app of activeApps) {
    const workflowId = reqMap[app.requisitionId];
    if (!workflowId) continue;

    const stageSlaHours = stageMap[`${workflowId}:${app.currentStage}`];
    if (!stageSlaHours) continue;

    const hoursInStage = (Date.now() - new Date(app.currentStageEnteredAt).getTime()) / (1000 * 60 * 60);
    const breachedHours = hoursInStage - stageSlaHours;

    if (breachedHours >= rule.thresholdValue) {
      results.push({
        applicationId: app.id,
        candidateId: app.candidateId,
        ownerId: app.ownerId,
        details: {
          currentStage: app.currentStage,
          stageSlaHours,
          hoursInStage: Math.round(hoursInStage),
          breachedByHours: Math.round(breachedHours),
          thresholdHours: rule.thresholdValue,
        },
      });
    }
  }

  return results;
}

async function detectWorkloadExceededEscalations(rule: RecruitingEscalationRule) {
  const terminalStages = ["hired", "rejected", "withdrawn", "no_show", "ready_to_work"];

  const workloads = await db
    .select({
      ownerId: recruitingApplications.ownerId,
      count: count(),
    })
    .from(recruitingApplications)
    .where(and(
      eq(recruitingApplications.isArchived, false),
    ))
    .groupBy(recruitingApplications.ownerId);

  const results: { recruiterId: string; details: any }[] = [];

  for (const w of workloads) {
    if (!w.ownerId) continue;

    const activeCount = await db
      .select({ count: count() })
      .from(recruitingApplications)
      .where(and(
        eq(recruitingApplications.ownerId, w.ownerId),
        eq(recruitingApplications.isArchived, false),
      ));

    const totalActive = activeCount[0]?.count ?? 0;

    if (Number(totalActive) > rule.thresholdValue) {
      const ownerRecord = await db.select({ email: users.email }).from(users).where(eq(users.id, w.ownerId));
      results.push({
        recruiterId: w.ownerId,
        details: {
          recruiterEmail: ownerRecord[0]?.email || w.ownerId,
          activeApplications: Number(totalActive),
          threshold: rule.thresholdValue,
        },
      });
    }
  }

  return results;
}

export async function getRecruiterWorkloads(): Promise<{ recruiterId: string; email: string; activeCount: number }[]> {
  const workloads = await db
    .select({
      ownerId: recruitingApplications.ownerId,
      count: count(),
    })
    .from(recruitingApplications)
    .where(eq(recruitingApplications.isArchived, false))
    .groupBy(recruitingApplications.ownerId);

  const recruiterIds = workloads.map(w => w.ownerId).filter(Boolean) as string[];
  if (recruiterIds.length === 0) return [];

  const userRecords = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.id, recruiterIds));

  const emailMap: Record<string, string> = {};
  for (const u of userRecords) {
    if (u.email) emailMap[u.id] = u.email;
  }

  return workloads
    .filter(w => w.ownerId)
    .map(w => ({
      recruiterId: w.ownerId!,
      email: emailMap[w.ownerId!] || w.ownerId!,
      activeCount: Number(w.count),
    }))
    .sort((a, b) => b.activeCount - a.activeCount);
}
