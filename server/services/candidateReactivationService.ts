import { db } from "../db";
import { 
  recruitingCandidates, 
  recruitingApplications, 
  recruitingAuditEvents,
  recruitingWorkflowStages,
  recruitingCandidateTags,
  recruitingTags,
  recruitingRequisitions,
  RecruitingApplication
} from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";

interface ReactivationResult {
  success: boolean;
  message: string;
  candidateId?: string;
  applicationId?: string;
}

interface PriorOutcome {
  applicationId: string;
  requisitionId: string;
  requisitionTitle?: string;
  disposition: string | null;
  dispositionReason: string | null;
  disposedAt: Date | null;
  currentStage: string;
  appliedAt: Date;
  archivedAt: Date | null;
  archiveReason: string | null;
}

export const candidateReactivationService = {
  async reactivateCandidate(
    candidateId: string,
    userId: string,
    reason?: string
  ): Promise<ReactivationResult> {
    const candidate = await db.query.recruitingCandidates.findFirst({
      where: eq(recruitingCandidates.id, candidateId),
    });

    if (!candidate) {
      return { success: false, message: "Candidate not found" };
    }

    if (!candidate.isArchived) {
      return { success: false, message: "Candidate is not archived" };
    }

    if (candidate.mergedIntoId) {
      return { success: false, message: "Cannot reactivate merged candidate. Use the target candidate instead." };
    }

    await db.update(recruitingCandidates)
      .set({
        isArchived: false,
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
        reactivatedAt: new Date(),
        reactivatedBy: userId,
        reactivationCount: (candidate.reactivationCount || 0) + 1,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(recruitingCandidates.id, candidateId));

    await db.insert(recruitingAuditEvents).values({
      entityType: "candidate",
      entityId: candidateId,
      actionType: "candidate_reactivated",
      previousValue: JSON.stringify({ isArchived: true, archiveReason: candidate.archiveReason }),
      newValue: JSON.stringify({ isArchived: false, reactivationReason: reason }),
      userId,
      changedFields: ["isArchived", "reactivatedAt", "reactivatedBy", "reactivationCount"],
      metadata: { reason, reactivationCount: (candidate.reactivationCount || 0) + 1 },
    });

    return { 
      success: true, 
      message: "Candidate reactivated successfully",
      candidateId 
    };
  },

  async createRehireApplication(
    candidateId: string,
    requisitionId: string,
    userId: string,
    options?: {
      previousApplicationId?: string;
      reason?: string;
      preserveOwner?: boolean;
    }
  ): Promise<ReactivationResult> {
    const candidate = await db.query.recruitingCandidates.findFirst({
      where: eq(recruitingCandidates.id, candidateId),
    });

    if (!candidate) {
      return { success: false, message: "Candidate not found" };
    }

    if (candidate.isArchived) {
      return { success: false, message: "Cannot create application for archived candidate. Reactivate the candidate first." };
    }

    const existingApplication = await db.query.recruitingApplications.findFirst({
      where: and(
        eq(recruitingApplications.candidateId, candidateId),
        eq(recruitingApplications.requisitionId, requisitionId),
        eq(recruitingApplications.isArchived, false)
      ),
    });

    if (existingApplication) {
      return { success: false, message: "Candidate is already attached to this job posting." };
    }

    const requisition = await db.query.recruitingRequisitions.findFirst({
      where: eq(recruitingRequisitions.id, requisitionId),
    });

    if (!requisition) {
      return { success: false, message: "Requisition not found" };
    }

    const defaultWorkflowStage = await db.query.recruitingWorkflowStages.findFirst({
      where: and(
        eq(recruitingWorkflowStages.workflowId, (requisition as any).workflowId || "default"),
        eq(recruitingWorkflowStages.isInitial, true)
      ),
      orderBy: [recruitingWorkflowStages.sortOrder],
    });

    const initialStage = defaultWorkflowStage?.stageKey || "applied";

    let ownerId = userId;
    if (options?.preserveOwner && options?.previousApplicationId) {
      const prevApp = await db.query.recruitingApplications.findFirst({
        where: eq(recruitingApplications.id, options.previousApplicationId),
      });
      if (prevApp?.ownerId) {
        ownerId = prevApp.ownerId;
      }
    }

    const [newApplication] = await db.insert(recruitingApplications).values({
      candidateId,
      requisitionId,
      currentStage: initialStage,
      currentStageEnteredAt: new Date(),
      ownerId,
      isRehire: true,
      previousApplicationId: options?.previousApplicationId,
      reactivationReason: options?.reason,
      backgroundCheckStatus: "pending",
      backgroundStatus: "none",
      complianceStatus: "pending",
      readinessStatus: "not_ready",
      readinessScore: 0,
      createdBy: userId,
      updatedBy: userId,
    }).returning();

    await this.autoTagRehire(candidateId, newApplication.id, userId);

    await this.checkExpiredCompliance(candidateId, newApplication.id, userId);

    await db.insert(recruitingAuditEvents).values({
      entityType: "application",
      entityId: newApplication.id,
      actionType: "rehire_application_created",
      newValue: JSON.stringify({
        candidateId,
        requisitionId,
        isRehire: true,
        previousApplicationId: options?.previousApplicationId,
      }),
      userId,
      changedFields: ["id", "candidateId", "requisitionId", "isRehire"],
      metadata: { 
        reason: options?.reason,
        previousApplicationId: options?.previousApplicationId,
      },
    });

    return {
      success: true,
      message: "Rehire application created successfully",
      applicationId: newApplication.id,
      candidateId,
    };
  },

  async reopenApplication(
    applicationId: string,
    userId: string,
    options?: {
      resetToStage?: string;
      reason?: string;
    }
  ): Promise<ReactivationResult> {
    const application = await db.query.recruitingApplications.findFirst({
      where: eq(recruitingApplications.id, applicationId),
    });

    if (!application) {
      return { success: false, message: "Application not found" };
    }

    if (!application.isArchived) {
      return { success: false, message: "Application is not archived" };
    }

    const candidate = await db.query.recruitingCandidates.findFirst({
      where: eq(recruitingCandidates.id, application.candidateId),
    });

    if (candidate?.isArchived) {
      await this.reactivateCandidate(application.candidateId, userId, "Reopening application");
    }

    const resetStage = options?.resetToStage || application.currentStage;

    await db.update(recruitingApplications)
      .set({
        isArchived: false,
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
        disposition: null,
        dispositionReason: null,
        disposedAt: null,
        disposedBy: null,
        currentStage: resetStage,
        currentStageEnteredAt: new Date(),
        reactivatedAt: new Date(),
        reactivatedBy: userId,
        reactivationReason: options?.reason,
        backgroundCheckStatus: "pending",
        complianceStatus: "pending",
        readinessStatus: "not_ready",
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(recruitingApplications.id, applicationId));

    await this.autoTagRehire(application.candidateId, applicationId, userId);

    await this.checkExpiredCompliance(application.candidateId, applicationId, userId);

    await db.insert(recruitingAuditEvents).values({
      entityType: "application",
      entityId: applicationId,
      actionType: "application_reopened",
      previousValue: JSON.stringify({ 
        isArchived: true, 
        disposition: application.disposition,
        archiveReason: application.archiveReason,
      }),
      newValue: JSON.stringify({ 
        isArchived: false, 
        resetToStage: resetStage,
        reactivationReason: options?.reason,
      }),
      userId,
      changedFields: ["isArchived", "disposition", "currentStage", "reactivatedAt"],
      metadata: { reason: options?.reason },
    });

    return {
      success: true,
      message: "Application reopened successfully",
      applicationId,
      candidateId: application.candidateId,
    };
  },

  async autoTagRehire(
    candidateId: string,
    applicationId: string,
    userId: string
  ): Promise<void> {
    let rehireTag = await db.query.recruitingTags.findFirst({
      where: eq(recruitingTags.name, "Rehire"),
    });

    if (!rehireTag) {
      const [newTag] = await db.insert(recruitingTags).values({
        name: "Rehire",
        normalizedName: "rehire",
        color: "#10B981",
        category: "status",
        description: "Candidate is a rehire/reactivation",
        createdBy: userId,
      }).returning();
      rehireTag = newTag;
    }

    const existingRehireTag = await db.query.recruitingCandidateTags.findFirst({
      where: and(
        eq(recruitingCandidateTags.candidateId, candidateId),
        eq(recruitingCandidateTags.tagId, rehireTag.id)
      ),
    });

    if (!existingRehireTag) {
      await db.insert(recruitingCandidateTags).values({
        candidateId,
        tagId: rehireTag.id,
        createdBy: userId,
        sourceAction: "automated",
      });

      await db.insert(recruitingAuditEvents).values({
        entityType: "candidate",
        entityId: candidateId,
        actionType: "tag_added",
        newValue: JSON.stringify({ tag: "Rehire", autoApplied: true }),
        userId,
        changedFields: ["tags"],
        metadata: { applicationId, reason: "Auto-tagged on reactivation/rehire" },
      });
    }
  },

  async checkExpiredCompliance(
    candidateId: string,
    applicationId: string,
    userId: string
  ): Promise<{ hasExpiredDocs: boolean; expiredItems: string[] }> {
    const expiredItems: string[] = [];

    const candidate = await db.query.recruitingCandidates.findFirst({
      where: eq(recruitingCandidates.id, candidateId),
    });

    if (candidate?.licenseExpiration) {
      const licenseExpDate = new Date(candidate.licenseExpiration);
      if (licenseExpDate < new Date()) {
        expiredItems.push("Driver License (Expired)");
      }
    }

    if (expiredItems.length > 0) {
      await db.update(recruitingApplications)
        .set({
          complianceStatus: "pending",
          complianceBlockedReason: `Expired documents require re-verification: ${expiredItems.join(", ")}`,
          readinessStatus: "not_ready",
          docsComplete: false,
          updatedAt: new Date(),
        })
        .where(eq(recruitingApplications.id, applicationId));

      await db.insert(recruitingAuditEvents).values({
        entityType: "application",
        entityId: applicationId,
        actionType: "compliance_recheck_triggered",
        newValue: JSON.stringify({ expiredItems, reason: "Rehire compliance re-check" }),
        userId,
        changedFields: ["complianceStatus", "readinessStatus"],
        metadata: { expiredItems },
      });
    }

    return { hasExpiredDocs: expiredItems.length > 0, expiredItems };
  },

  async getPriorOutcomes(candidateId: string): Promise<PriorOutcome[]> {
    const applications = await db.query.recruitingApplications.findMany({
      where: eq(recruitingApplications.candidateId, candidateId),
      orderBy: [desc(recruitingApplications.appliedAt)],
      with: {
        requisition: true,
      },
    });

    return applications.map(app => ({
      applicationId: app.id,
      requisitionId: app.requisitionId,
      requisitionTitle: (app as any).requisition?.title,
      disposition: app.disposition,
      dispositionReason: app.dispositionReason,
      disposedAt: app.disposedAt,
      currentStage: app.currentStage,
      appliedAt: app.appliedAt,
      archivedAt: app.archivedAt,
      archiveReason: app.archiveReason,
    }));
  },

  async getCandidateRehireEligibility(candidateId: string): Promise<{
    isEligible: boolean;
    reasons: string[];
    priorApplicationsCount: number;
    lastOutcome: PriorOutcome | null;
  }> {
    const candidate = await db.query.recruitingCandidates.findFirst({
      where: eq(recruitingCandidates.id, candidateId),
    });

    if (!candidate) {
      return { isEligible: false, reasons: ["Candidate not found"], priorApplicationsCount: 0, lastOutcome: null };
    }

    const reasons: string[] = [];

    if (candidate.mergedIntoId) {
      reasons.push("Candidate was merged into another record");
    }

    const priorOutcomes = await this.getPriorOutcomes(candidateId);
    const lastOutcome = priorOutcomes[0] || null;

    const doNotRehire = priorOutcomes.some(
      app => app.disposition === "rejected" && 
             app.dispositionReason?.toLowerCase().includes("do not rehire")
    );

    if (doNotRehire) {
      reasons.push("Candidate marked as 'Do Not Rehire'");
    }

    return {
      isEligible: reasons.length === 0,
      reasons,
      priorApplicationsCount: priorOutcomes.length,
      lastOutcome,
    };
  },
};
