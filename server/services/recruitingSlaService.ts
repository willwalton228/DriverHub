import { db } from "../db";
import { 
  recruitingApplications, 
  recruitingRequisitions, 
  recruitingWorkflowStages,
  recruitingSlaEscalations,
  recruitingMarketPauses,
  recruitingAuditEvents,
  users
} from "@shared/schema";
import { eq, and, lt, gt, isNull, sql, desc, or, inArray } from "drizzle-orm";

const DEFAULT_ESCALATION_HOURS = 24;

interface SlaBreachInfo {
  applicationId: string;
  stageKey: string;
  stageSlaHours: number;
  hoursInStage: number;
  hoursOverdue: number;
  breachedAt: Date;
}

export const recruitingSlaService = {
  async evaluateApplicationSla(applicationId: string): Promise<SlaBreachInfo | null> {
    const [app] = await db.select({
      id: recruitingApplications.id,
      currentStage: recruitingApplications.currentStage,
      currentStageEnteredAt: recruitingApplications.currentStageEnteredAt,
      requisitionId: recruitingApplications.requisitionId,
    })
    .from(recruitingApplications)
    .where(eq(recruitingApplications.id, applicationId));

    if (!app) return null;

    const [requisition] = await db.select({
      workflowId: recruitingRequisitions.workflowId,
    })
    .from(recruitingRequisitions)
    .where(eq(recruitingRequisitions.id, app.requisitionId));

    if (!requisition?.workflowId) return null;

    const [stage] = await db.select({
      stageKey: recruitingWorkflowStages.stageKey,
      stageSlaHours: recruitingWorkflowStages.stageSlaHours,
    })
    .from(recruitingWorkflowStages)
    .where(and(
      eq(recruitingWorkflowStages.workflowId, requisition.workflowId),
      eq(recruitingWorkflowStages.stageKey, app.currentStage)
    ));

    if (!stage?.stageSlaHours) return null;

    const now = new Date();
    const enteredAt = new Date(app.currentStageEnteredAt);
    const hoursInStage = (now.getTime() - enteredAt.getTime()) / (1000 * 60 * 60);

    if (hoursInStage <= stage.stageSlaHours) {
      return null;
    }

    const hoursOverdue = hoursInStage - stage.stageSlaHours;
    const breachedAt = new Date(enteredAt.getTime() + stage.stageSlaHours * 60 * 60 * 1000);

    return {
      applicationId: app.id,
      stageKey: stage.stageKey,
      stageSlaHours: stage.stageSlaHours,
      hoursInStage,
      hoursOverdue,
      breachedAt,
    };
  },

  async getOverdueApplications(filters?: { market?: string; requisitionId?: string }): Promise<any[]> {
    const query = sql`
      SELECT 
        a.id,
        a.candidate_id,
        a.requisition_id,
        a.current_stage,
        a.current_stage_entered_at,
        r.market,
        r.title as requisition_title,
        ws.stage_sla_hours,
        ws.display_name as stage_display_name,
        EXTRACT(EPOCH FROM (NOW() - a.current_stage_entered_at)) / 3600 as hours_in_stage,
        EXTRACT(EPOCH FROM (NOW() - a.current_stage_entered_at)) / 3600 - ws.stage_sla_hours as hours_overdue
      FROM recruiting_applications a
      JOIN recruiting_requisitions r ON a.requisition_id = r.id
      JOIN recruiting_workflows w ON r.workflow_id = w.id
      JOIN recruiting_workflow_stages ws ON ws.workflow_id = w.id AND ws.stage_key = a.current_stage
      WHERE a.is_archived = false
        AND ws.stage_sla_hours IS NOT NULL
        AND EXTRACT(EPOCH FROM (NOW() - a.current_stage_entered_at)) / 3600 > ws.stage_sla_hours
        ${filters?.market ? sql`AND r.market = ${filters.market}` : sql``}
        ${filters?.requisitionId ? sql`AND r.id = ${filters.requisitionId}` : sql``}
      ORDER BY hours_overdue DESC
    `;

    const result = await db.execute(query);
    return result.rows as any[];
  },

  async recordSlaBreach(breach: SlaBreachInfo, userId?: string): Promise<void> {
    const existing = await db.select()
      .from(recruitingSlaEscalations)
      .where(and(
        eq(recruitingSlaEscalations.applicationId, breach.applicationId),
        eq(recruitingSlaEscalations.stageKey, breach.stageKey),
        or(
          eq(recruitingSlaEscalations.status, "breached"),
          eq(recruitingSlaEscalations.status, "escalated")
        )
      ));

    if (existing.length > 0) {
      await db.update(recruitingSlaEscalations)
        .set({
          hoursOverdue: String(breach.hoursOverdue),
          updatedAt: new Date(),
        })
        .where(eq(recruitingSlaEscalations.id, existing[0].id));
      return;
    }

    await db.insert(recruitingSlaEscalations).values({
      applicationId: breach.applicationId,
      stageKey: breach.stageKey,
      stageSlaHours: breach.stageSlaHours,
      breachedAt: breach.breachedAt,
      hoursOverdue: String(breach.hoursOverdue),
      status: "breached",
      notificationSentAt: new Date(),
    });

    await db.insert(recruitingAuditEvents).values({
      actionType: "sla_breach",
      entityType: "application",
      entityId: breach.applicationId,
      userId: userId || null,
      newValue: JSON.stringify({
        stageKey: breach.stageKey,
        stageSlaHours: breach.stageSlaHours,
        hoursOverdue: breach.hoursOverdue,
      }),
      reason: `SLA breach: ${breach.hoursOverdue.toFixed(1)} hours overdue in stage ${breach.stageKey}`,
    });

    console.log(`[SLA] Breach recorded for application ${breach.applicationId}: ${breach.hoursOverdue.toFixed(1)}h overdue`);
  },

  async escalateBreach(escalationId: string, escalateToUserId: string, actorId: string): Promise<void> {
    const [escalation] = await db.select()
      .from(recruitingSlaEscalations)
      .where(eq(recruitingSlaEscalations.id, escalationId));

    if (!escalation) {
      throw new Error("Escalation not found");
    }

    const newLevel = (escalation.escalationLevel || 0) + 1;

    await db.update(recruitingSlaEscalations)
      .set({
        status: "escalated",
        escalatedAt: new Date(),
        escalationLevel: newLevel,
        escalatedToUserId: escalateToUserId,
        updatedAt: new Date(),
      })
      .where(eq(recruitingSlaEscalations.id, escalationId));

    await db.insert(recruitingAuditEvents).values({
      actionType: "sla_escalation",
      entityType: "application",
      entityId: escalation.applicationId,
      userId: actorId,
      previousValue: JSON.stringify({ escalationLevel: escalation.escalationLevel }),
      newValue: JSON.stringify({ escalationLevel: newLevel, escalatedToUserId: escalateToUserId }),
      reason: `SLA escalation to level ${newLevel}`,
    });

    console.log(`[SLA] Escalation ${escalationId} escalated to level ${newLevel}, user ${escalateToUserId}`);
  },

  async acknowledgeEscalation(escalationId: string, userId: string): Promise<void> {
    await db.update(recruitingSlaEscalations)
      .set({
        status: "acknowledged",
        acknowledgedAt: new Date(),
        acknowledgedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(recruitingSlaEscalations.id, escalationId));

    const [escalation] = await db.select()
      .from(recruitingSlaEscalations)
      .where(eq(recruitingSlaEscalations.id, escalationId));

    await db.insert(recruitingAuditEvents).values({
      actionType: "sla_acknowledged",
      entityType: "application",
      entityId: escalation?.applicationId || "",
      userId,
      reason: "SLA escalation acknowledged",
    });
  },

  async resolveEscalation(escalationId: string, userId: string, notes?: string): Promise<void> {
    await db.update(recruitingSlaEscalations)
      .set({
        status: "resolved",
        resolvedAt: new Date(),
        resolvedBy: userId,
        resolutionNotes: notes || null,
        updatedAt: new Date(),
      })
      .where(eq(recruitingSlaEscalations.id, escalationId));

    const [escalation] = await db.select()
      .from(recruitingSlaEscalations)
      .where(eq(recruitingSlaEscalations.id, escalationId));

    await db.insert(recruitingAuditEvents).values({
      actionType: "sla_resolved",
      entityType: "application",
      entityId: escalation?.applicationId || "",
      userId,
      newValue: JSON.stringify({ resolutionNotes: notes }),
      reason: "SLA escalation resolved",
    });
  },

  async getEscalationsForApplication(applicationId: string): Promise<any[]> {
    return db.select()
      .from(recruitingSlaEscalations)
      .where(eq(recruitingSlaEscalations.applicationId, applicationId))
      .orderBy(desc(recruitingSlaEscalations.createdAt));
  },

  async getActiveEscalations(filters?: { status?: string; market?: string }): Promise<any[]> {
    const query = sql`
      SELECT 
        e.*,
        a.candidate_id,
        r.market,
        r.title as requisition_title,
        c.first_name as candidate_first_name,
        c.last_name as candidate_last_name
      FROM recruiting_sla_escalations e
      JOIN recruiting_applications a ON e.application_id = a.id
      JOIN recruiting_requisitions r ON a.requisition_id = r.id
      JOIN recruiting_candidates c ON a.candidate_id = c.id
      WHERE e.status != 'resolved'
        ${filters?.status ? sql`AND e.status = ${filters.status}` : sql``}
        ${filters?.market ? sql`AND r.market = ${filters.market}` : sql``}
      ORDER BY e.hours_overdue DESC NULLS LAST, e.breached_at DESC
    `;

    const result = await db.execute(query);
    return result.rows as any[];
  },

  async runSlaCheck(): Promise<{ checked: number; breached: number }> {
    const query = sql`
      SELECT 
        a.id,
        a.current_stage,
        a.current_stage_entered_at,
        r.workflow_id,
        ws.stage_sla_hours,
        EXTRACT(EPOCH FROM (NOW() - a.current_stage_entered_at)) / 3600 as hours_in_stage
      FROM recruiting_applications a
      JOIN recruiting_requisitions r ON a.requisition_id = r.id
      JOIN recruiting_workflows w ON r.workflow_id = w.id
      JOIN recruiting_workflow_stages ws ON ws.workflow_id = w.id AND ws.stage_key = a.current_stage
      WHERE a.is_archived = false
        AND ws.stage_sla_hours IS NOT NULL
        AND EXTRACT(EPOCH FROM (NOW() - a.current_stage_entered_at)) / 3600 > ws.stage_sla_hours
    `;

    const result = await db.execute(query);
    const apps = result.rows as any[];

    let breached = 0;
    for (const app of apps) {
      const hoursOverdue = app.hours_in_stage - app.stage_sla_hours;
      const enteredAt = new Date(app.current_stage_entered_at);
      const breachedAt = new Date(enteredAt.getTime() + app.stage_sla_hours * 60 * 60 * 1000);

      await this.recordSlaBreach({
        applicationId: app.id,
        stageKey: app.current_stage,
        stageSlaHours: app.stage_sla_hours,
        hoursInStage: app.hours_in_stage,
        hoursOverdue,
        breachedAt,
      });
      breached++;
    }

    console.log(`[SLA Check] Checked applications, found ${breached} breaches`);
    return { checked: apps.length, breached };
  },

  async sendEmailNotificationStub(escalationId: string): Promise<void> {
    const [escalation] = await db.select()
      .from(recruitingSlaEscalations)
      .where(eq(recruitingSlaEscalations.id, escalationId));

    if (!escalation) return;

    console.log(`[SLA Email Stub] Would send email for escalation ${escalationId}`);
    console.log(`  Application: ${escalation.applicationId}`);
    console.log(`  Stage: ${escalation.stageKey}`);
    console.log(`  Hours Overdue: ${escalation.hoursOverdue}`);

    await db.update(recruitingSlaEscalations)
      .set({
        emailSentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(recruitingSlaEscalations.id, escalationId));
  },
};

export const recruitingPauseService = {
  async pauseRequisition(requisitionId: string, userId: string, reason?: string): Promise<void> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));

    await db.update(recruitingRequisitions)
      .set({
        isPaused: true,
        pausedAt: new Date(),
        pausedBy: userId,
        pauseReason: reason || null,
        updatedAt: new Date(),
      })
      .where(eq(recruitingRequisitions.id, requisitionId));

    await db.insert(recruitingAuditEvents).values({
      actionType: "requisition_paused",
      entityType: "requisition",
      entityId: requisitionId,
      userId,
      userEmail: user?.email || null,
      newValue: JSON.stringify({ isPaused: true, reason }),
      reason: reason || "Hiring freeze activated",
    });

    console.log(`[Pause] Requisition ${requisitionId} paused by ${user?.email}`);
  },

  async resumeRequisition(requisitionId: string, userId: string): Promise<void> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));

    await db.update(recruitingRequisitions)
      .set({
        isPaused: false,
        pausedAt: null,
        pausedBy: null,
        pauseReason: null,
        updatedAt: new Date(),
      })
      .where(eq(recruitingRequisitions.id, requisitionId));

    await db.insert(recruitingAuditEvents).values({
      actionType: "requisition_resumed",
      entityType: "requisition",
      entityId: requisitionId,
      userId,
      userEmail: user?.email || null,
      newValue: JSON.stringify({ isPaused: false }),
      reason: "Hiring freeze lifted",
    });

    console.log(`[Pause] Requisition ${requisitionId} resumed by ${user?.email}`);
  },

  async pauseMarket(market: string, userId: string, reason?: string): Promise<void> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));

    const existing = await db.select()
      .from(recruitingMarketPauses)
      .where(eq(recruitingMarketPauses.market, market));

    if (existing.length > 0) {
      await db.update(recruitingMarketPauses)
        .set({
          isPaused: true,
          pausedAt: new Date(),
          pausedBy: userId,
          pauseReason: reason || null,
          resumedAt: null,
          resumedBy: null,
          updatedAt: new Date(),
        })
        .where(eq(recruitingMarketPauses.market, market));
    } else {
      await db.insert(recruitingMarketPauses).values({
        market,
        isPaused: true,
        pausedAt: new Date(),
        pausedBy: userId,
        pauseReason: reason || null,
      });
    }

    await db.insert(recruitingAuditEvents).values({
      actionType: "market_paused",
      entityType: "market",
      entityId: market,
      userId,
      userEmail: user?.email || null,
      newValue: JSON.stringify({ isPaused: true, reason }),
      reason: reason || "Market hiring freeze activated",
    });

    console.log(`[Pause] Market ${market} paused by ${user?.email}`);
  },

  async resumeMarket(market: string, userId: string): Promise<void> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));

    await db.update(recruitingMarketPauses)
      .set({
        isPaused: false,
        resumedAt: new Date(),
        resumedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(recruitingMarketPauses.market, market));

    await db.insert(recruitingAuditEvents).values({
      actionType: "market_resumed",
      entityType: "market",
      entityId: market,
      userId,
      userEmail: user?.email || null,
      newValue: JSON.stringify({ isPaused: false }),
      reason: "Market hiring freeze lifted",
    });

    console.log(`[Pause] Market ${market} resumed by ${user?.email}`);
  },

  async isRequisitionPaused(requisitionId: string): Promise<{ isPaused: boolean; reason?: string; pausedBy?: string }> {
    const [requisition] = await db.select({
      isPaused: recruitingRequisitions.isPaused,
      pauseReason: recruitingRequisitions.pauseReason,
      pausedBy: recruitingRequisitions.pausedBy,
      market: recruitingRequisitions.market,
    })
    .from(recruitingRequisitions)
    .where(eq(recruitingRequisitions.id, requisitionId));

    if (!requisition) {
      return { isPaused: false };
    }

    if (requisition.isPaused) {
      return {
        isPaused: true,
        reason: requisition.pauseReason || "Requisition paused",
        pausedBy: requisition.pausedBy || undefined,
      };
    }

    const marketPause = await this.isMarketPaused(requisition.market);
    if (marketPause.isPaused) {
      return {
        isPaused: true,
        reason: marketPause.reason || "Market hiring freeze",
        pausedBy: marketPause.pausedBy,
      };
    }

    return { isPaused: false };
  },

  async isMarketPaused(market: string): Promise<{ isPaused: boolean; reason?: string; pausedBy?: string }> {
    const [pause] = await db.select()
      .from(recruitingMarketPauses)
      .where(and(
        eq(recruitingMarketPauses.market, market),
        eq(recruitingMarketPauses.isPaused, true)
      ));

    if (pause) {
      return {
        isPaused: true,
        reason: pause.pauseReason || undefined,
        pausedBy: pause.pausedBy || undefined,
      };
    }

    return { isPaused: false };
  },

  async getPausedMarkets(): Promise<any[]> {
    return db.select()
      .from(recruitingMarketPauses)
      .where(eq(recruitingMarketPauses.isPaused, true));
  },

  async getPausedRequisitions(): Promise<any[]> {
    return db.select()
      .from(recruitingRequisitions)
      .where(eq(recruitingRequisitions.isPaused, true));
  },

  async getAllMarketPauseStatus(): Promise<any[]> {
    const query = sql`
      SELECT DISTINCT r.market,
        COALESCE(mp.is_paused, false) as is_paused,
        mp.paused_at,
        mp.pause_reason,
        (SELECT COUNT(*) FROM recruiting_requisitions WHERE market = r.market AND status = 'open') as open_requisitions
      FROM recruiting_requisitions r
      LEFT JOIN recruiting_market_pauses mp ON r.market = mp.market
      ORDER BY r.market
    `;
    
    const result = await db.execute(query);
    return result.rows as any[];
  },
};
