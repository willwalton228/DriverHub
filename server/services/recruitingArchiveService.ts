import { db } from "../db";
import { eq, and, inArray, isNull, sql, lte, desc } from "drizzle-orm";
import {
  recruitingArchives,
  applications,
  candidates,
  recruitingStageHistory,
  recruitingDocuments,
  recruitingCommunications,
  recruitingConsents,
  recruitingAuditEvents,
  jobRequisitions,
  type RecruitingArchive,
} from "@shared/schema";

const CLOSED_STATUSES = ["rejected", "withdrawn", "hired"];
const DEFAULT_ARCHIVE_AFTER_DAYS = 90;

interface SnapshotV1 {
  candidateProfile: Record<string, unknown>;
  application: Record<string, unknown>;
  requisitionSummary: Record<string, unknown>;
  stageHistory: Record<string, unknown>[];
  documentsMetadata: Record<string, unknown>[];
  communicationsSummary: {
    totalCount: number;
    byType: Record<string, number>;
    lastCommunicationAt: string | null;
    entries: Record<string, unknown>[];
  };
  consents: Record<string, unknown>[];
}

async function assembleSnapshot(applicationId: string): Promise<SnapshotV1> {
  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (!app) throw new Error(`Application ${applicationId} not found`);

  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, app.candidateId))
    .limit(1);

  if (!candidate) throw new Error(`Candidate ${app.candidateId} not found for application ${applicationId}`);

  const [requisition] = await db
    .select()
    .from(jobRequisitions)
    .where(eq(jobRequisitions.id, app.requisitionId))
    .limit(1);

  if (!requisition) throw new Error(`Requisition ${app.requisitionId} not found for application ${applicationId}`);

  const stageHistory = await db
    .select()
    .from(recruitingStageHistory)
    .where(eq(recruitingStageHistory.applicationId, applicationId))
    .orderBy(recruitingStageHistory.transitionedAt);

  const documents = await db
    .select({
      id: recruitingDocuments.id,
      applicationId: recruitingDocuments.applicationId,
      templateId: recruitingDocuments.templateId,
      name: recruitingDocuments.name,
      type: recruitingDocuments.type,
      status: recruitingDocuments.status,
      createdAt: recruitingDocuments.createdAt,
    })
    .from(recruitingDocuments)
    .where(eq(recruitingDocuments.applicationId, applicationId));

  const communications = await db
    .select()
    .from(recruitingCommunications)
    .where(eq(recruitingCommunications.candidateId, app.candidateId));

  const appComms = communications.filter(
    (c) => c.applicationId === applicationId || !c.applicationId
  );

  const byType: Record<string, number> = {};
  let lastCommAt: string | null = null;
  for (const comm of appComms) {
    byType[comm.type] = (byType[comm.type] || 0) + 1;
    const sentStr = comm.sentAt?.toISOString() || null;
    if (sentStr && (!lastCommAt || sentStr > lastCommAt)) {
      lastCommAt = sentStr;
    }
  }

  const commEntries = appComms.map((c) => ({
    id: c.id,
    type: c.type,
    direction: c.direction,
    subject: c.subject,
    sentAt: c.sentAt?.toISOString() || null,
    isAutomated: c.isAutomated,
  }));

  const consents = await db
    .select()
    .from(recruitingConsents)
    .where(eq(recruitingConsents.candidateId, app.candidateId));

  const appConsents = consents.filter(
    (c) => c.applicationId === applicationId || !c.applicationId
  );

  return {
    candidateProfile: {
      id: candidate?.id,
      email: candidate?.email,
      firstName: candidate?.firstName,
      lastName: candidate?.lastName,
      phone: candidate?.phone,
      location: candidate?.location,
      currentTitle: candidate?.currentTitle,
      currentCompany: candidate?.currentCompany,
      yearsExperience: candidate?.yearsExperience,
      source: candidate?.source,
      skills: candidate?.skills,
      education: candidate?.education,
    },
    application: {
      id: app.id,
      status: app.status,
      stage: app.stage,
      appliedAt: app.appliedAt?.toISOString(),
      rejectedAt: app.rejectedAt?.toISOString() || null,
      hiredAt: app.hiredAt?.toISOString() || null,
      withdrawnAt: app.withdrawnAt?.toISOString() || null,
      rejectionReason: app.rejectionReason,
      withdrawnReason: app.withdrawnReason,
      screeningScore: app.screeningScore,
      rating: app.rating,
      backgroundStatus: app.backgroundStatus,
      complianceStatus: app.complianceStatus,
      assignedTo: app.assignedTo,
    },
    requisitionSummary: {
      id: requisition?.id,
      title: requisition?.title,
      department: requisition?.department,
      location: requisition?.location,
      employmentType: requisition?.employmentType,
    },
    stageHistory: stageHistory.map((sh) => ({
      id: sh.id,
      fromStage: sh.fromStage,
      toStage: sh.toStage,
      transitionedAt: sh.transitionedAt?.toISOString(),
      transitionedBy: sh.transitionedBy,
      notes: sh.notes,
    })),
    documentsMetadata: documents.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      status: d.status,
      createdAt: (d.createdAt as Date | null)?.toISOString?.() || null,
    })),
    communicationsSummary: {
      totalCount: appComms.length,
      byType,
      lastCommunicationAt: lastCommAt,
      entries: commEntries,
    },
    consents: appConsents.map((c) => ({
      id: c.id,
      consentType: c.consentType,
      version: c.version,
      accepted: c.accepted,
      acceptedAt: c.acceptedAt?.toISOString() || null,
      source: c.source,
    })),
  };
}

function getClosedAt(app: { rejectedAt: Date | null; hiredAt: Date | null; withdrawnAt: Date | null; updatedAt: Date | null; status: string | null }): Date | null {
  if (app.status === "rejected" && app.rejectedAt) return app.rejectedAt;
  if (app.status === "hired" && app.hiredAt) return app.hiredAt;
  if (app.status === "withdrawn" && app.withdrawnAt) return app.withdrawnAt;
  return app.updatedAt;
}

export async function archiveSingleApplication(
  applicationId: string,
  userId?: string,
  userEmail?: string,
  source: "system" | "ui" = "ui"
): Promise<RecruitingArchive | null> {
  const [existing] = await db
    .select()
    .from(recruitingArchives)
    .where(eq(recruitingArchives.applicationId, applicationId))
    .limit(1);

  if (existing) return existing;

  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (!app) throw new Error(`Application ${applicationId} not found`);
  if (!CLOSED_STATUSES.includes(app.status || "")) {
    throw new Error(`Application ${applicationId} is not in a closed status (current: ${app.status})`);
  }

  const closedAt = getClosedAt(app);
  if (!closedAt) throw new Error(`Cannot determine closed date for application ${applicationId}`);

  const snapshot = await assembleSnapshot(applicationId);

  const [archive] = await db.insert(recruitingArchives).values({
    applicationId: app.id,
    candidateId: app.candidateId,
    requisitionId: app.requisitionId,
    closureStatus: app.status!,
    closedAt,
    snapshot,
    archiveReason: source === "system" ? "auto" : "manual",
    createdBy: userId || null,
    source,
  }).returning();

  await db.insert(recruitingAuditEvents).values({
    actionType: "APPLICATION_ARCHIVED",
    entityType: "application",
    entityId: applicationId,
    userId: userId || null,
    userEmail: userEmail || "",
    source,
    metadata: {
      archiveId: archive.id,
      closureStatus: app.status,
      closedAt: closedAt.toISOString(),
      snapshotVersion: "v1",
    },
  });

  return archive;
}

export async function runBatchArchive(
  thresholdDays: number = DEFAULT_ARCHIVE_AFTER_DAYS,
  userId?: string,
  userEmail?: string,
  dryRun: boolean = false
): Promise<{ eligible: number; archived: number; errors: string[] }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - thresholdDays);

  const eligibleApps = await db
    .select({
      id: applications.id,
      status: applications.status,
      rejectedAt: applications.rejectedAt,
      hiredAt: applications.hiredAt,
      withdrawnAt: applications.withdrawnAt,
      updatedAt: applications.updatedAt,
      candidateId: applications.candidateId,
      requisitionId: applications.requisitionId,
    })
    .from(applications)
    .leftJoin(recruitingArchives, eq(applications.id, recruitingArchives.applicationId))
    .where(
      and(
        inArray(applications.status, CLOSED_STATUSES),
        isNull(recruitingArchives.id)
      )
    );

  const filtered = eligibleApps.filter((app) => {
    const closedAt = getClosedAt(app);
    return closedAt && closedAt <= cutoffDate;
  });

  if (dryRun) {
    return { eligible: filtered.length, archived: 0, errors: [] };
  }

  let archived = 0;
  const errors: string[] = [];

  for (const app of filtered) {
    try {
      await archiveSingleApplication(app.id, userId, userEmail, "system");
      archived++;
    } catch (err: any) {
      errors.push(`${app.id}: ${err.message}`);
    }
  }

  await db.insert(recruitingAuditEvents).values({
    actionType: "ARCHIVE_BATCH_RUN",
    entityType: "system",
    entityId: "batch",
    userId: userId || null,
    userEmail: userEmail || "",
    source: "system",
    metadata: {
      thresholdDays,
      eligible: filtered.length,
      archived,
      errorCount: errors.length,
    },
  });

  return { eligible: filtered.length, archived, errors };
}

export async function getArchives(filters: {
  candidateId?: string;
  applicationId?: string;
  closureStatus?: string;
  limit?: number;
  offset?: number;
}): Promise<{ archives: RecruitingArchive[]; total: number }> {
  const conditions = [];

  if (filters.candidateId) {
    conditions.push(eq(recruitingArchives.candidateId, filters.candidateId));
  }
  if (filters.applicationId) {
    conditions.push(eq(recruitingArchives.applicationId, filters.applicationId));
  }
  if (filters.closureStatus) {
    conditions.push(eq(recruitingArchives.closureStatus, filters.closureStatus));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(recruitingArchives)
    .where(whereClause);

  const archives = await db
    .select()
    .from(recruitingArchives)
    .where(whereClause)
    .orderBy(desc(recruitingArchives.archivedAt))
    .limit(filters.limit || 50)
    .offset(filters.offset || 0);

  return { archives, total: Number(countResult.count) };
}

export async function getArchiveById(id: string): Promise<RecruitingArchive | null> {
  const [archive] = await db
    .select()
    .from(recruitingArchives)
    .where(eq(recruitingArchives.id, id))
    .limit(1);

  return archive || null;
}
