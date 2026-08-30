import { db } from "../db";
import {
  recruitingCandidates,
  recruitingApplications,
  recruitingRequisitions,
  recruitingDocuments,
  recruitingAuditEvents,
  recruitingStageHistory,
  users,
} from "@shared/schema";
import { eq, and, desc, sql, count, inArray } from "drizzle-orm";

export interface ComplianceEvidenceBundle {
  generatedAt: string;
  generatedBy: { id: string; email: string };
  
  candidate: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    status: string | null;
    createdAt: Date;
  };
  
  application: {
    id: string;
    requisitionTitle: string;
    market: string;
    currentStage: string;
    readinessStatus: string;
    readinessScore: number;
    readinessReasons: unknown;
    readinessLastCalculatedAt: Date | null;
    backgroundCheckStatus: string | null;
    docsComplete: boolean | null;
    consentCaptured: boolean | null;
    complianceStatus: string | null;
    complianceBlockedReason: string | null;
    appliedAt: Date;
    disposition: string | null;
    dispositionReason: string | null;
    disposedAt: Date | null;
  };
  
  documents: {
    id: string;
    type: string;
    name: string;
    status: string;
    esignStatus: string | null;
    esignSentAt: Date | null;
    esignSignedAt: Date | null;
    createdAt: Date;
    finalizedAt: Date | null;
  }[];
  
  stageHistory: {
    id: string;
    fromStage: string | null;
    toStage: string;
    transitionedAt: Date;
    transitionedBy: string | null;
    transitionedByEmail: string | null;
    reason: string | null;
    notes: string | null;
  }[];
  
  auditEvents: {
    id: string;
    actionType: string;
    entityType: string;
    entityId: string;
    userId: string | null;
    userEmail: string | null;
    changedFields: string[] | null;
    reason: string | null;
    occurredAt: Date;
  }[];
  
  summary: {
    totalDocuments: number;
    completedDocuments: number;
    pendingDocuments: number;
    totalStageTransitions: number;
    totalAuditEvents: number;
    daysInPipeline: number;
    isCompliant: boolean;
    complianceIssues: string[];
  };
}

export interface ComplianceDashboardSummary {
  generatedAt: string;
  
  byMarket: {
    market: string;
    totalCandidates: number;
    totalApplications: number;
    readyCount: number;
    inReviewCount: number;
    notReadyCount: number;
    docsCompleteCount: number;
    backgroundPassedCount: number;
  }[];
  
  overallStats: {
    totalCandidates: number;
    totalApplications: number;
    readyPercentage: number;
    docsCompletePercentage: number;
    backgroundPassedPercentage: number;
    averageReadinessScore: number;
  };
  
  recentReadinessChanges: {
    applicationId: string;
    candidateName: string;
    market: string;
    previousStatus: string | null;
    newStatus: string;
    changedAt: Date;
  }[];
}

export async function getComplianceEvidenceBundle(
  applicationId: string,
  requestedBy: { id: string; email: string }
): Promise<ComplianceEvidenceBundle | null> {
  const [application] = await db.select({
    id: recruitingApplications.id,
    candidateId: recruitingApplications.candidateId,
    requisitionId: recruitingApplications.requisitionId,
    currentStage: recruitingApplications.currentStage,
    readinessStatus: recruitingApplications.readinessStatus,
    readinessScore: recruitingApplications.readinessScore,
    readinessReasons: recruitingApplications.readinessReasons,
    readinessLastCalculatedAt: recruitingApplications.readinessLastCalculatedAt,
    backgroundCheckStatus: recruitingApplications.backgroundCheckStatus,
    docsComplete: recruitingApplications.docsComplete,
    consentCaptured: recruitingApplications.consentCaptured,
    complianceStatus: recruitingApplications.complianceStatus,
    complianceBlockedReason: recruitingApplications.complianceBlockedReason,
    appliedAt: recruitingApplications.appliedAt,
    disposition: recruitingApplications.disposition,
    dispositionReason: recruitingApplications.dispositionReason,
    disposedAt: recruitingApplications.disposedAt,
  })
    .from(recruitingApplications)
    .where(eq(recruitingApplications.id, applicationId))
    .limit(1);

  if (!application) {
    return null;
  }

  const [candidate, requisition, documents, stageHistory, auditEvents] = await Promise.all([
    db.select({
      id: recruitingCandidates.id,
      firstName: recruitingCandidates.firstName,
      lastName: recruitingCandidates.lastName,
      email: recruitingCandidates.email,
      phone: recruitingCandidates.phone,
      status: recruitingCandidates.status,
      createdAt: recruitingCandidates.createdAt,
    })
      .from(recruitingCandidates)
      .where(eq(recruitingCandidates.id, application.candidateId))
      .limit(1)
      .then(r => r[0]),

    db.select({
      title: recruitingRequisitions.title,
      market: recruitingRequisitions.market,
    })
      .from(recruitingRequisitions)
      .where(eq(recruitingRequisitions.id, application.requisitionId))
      .limit(1)
      .then(r => r[0]),

    db.select({
      id: recruitingDocuments.id,
      type: recruitingDocuments.type,
      name: recruitingDocuments.name,
      status: recruitingDocuments.status,
      esignStatus: recruitingDocuments.esignStatus,
      esignSentAt: recruitingDocuments.esignSentAt,
      esignSignedAt: recruitingDocuments.esignSignedAt,
      createdAt: recruitingDocuments.createdAt,
      finalizedAt: recruitingDocuments.finalizedAt,
    })
      .from(recruitingDocuments)
      .where(eq(recruitingDocuments.applicationId, applicationId))
      .orderBy(desc(recruitingDocuments.createdAt)),

    db.select({
      id: sql<string>`${recruitingStageHistory}.id`,
      fromStage: sql<string | null>`${recruitingStageHistory}.from_stage`,
      toStage: sql<string>`${recruitingStageHistory}.to_stage`,
      transitionedAt: sql<Date>`${recruitingStageHistory}.transitioned_at`,
      transitionedBy: sql<string | null>`${recruitingStageHistory}.transitioned_by`,
      reason: sql<string | null>`${recruitingStageHistory}.reason`,
      notes: sql<string | null>`${recruitingStageHistory}.notes`,
    })
      .from(recruitingStageHistory)
      .where(eq(recruitingStageHistory.applicationId, applicationId))
      .orderBy(desc(sql`${recruitingStageHistory}.transitioned_at`)),

    db.select({
      id: recruitingAuditEvents.id,
      actionType: recruitingAuditEvents.actionType,
      entityType: recruitingAuditEvents.entityType,
      entityId: recruitingAuditEvents.entityId,
      userId: recruitingAuditEvents.userId,
      userEmail: recruitingAuditEvents.userEmail,
      changedFields: recruitingAuditEvents.changedFields,
      reason: recruitingAuditEvents.reason,
      occurredAt: recruitingAuditEvents.occurredAt,
    })
      .from(recruitingAuditEvents)
      .where(
        sql`(${recruitingAuditEvents.entityType} = 'application' AND ${recruitingAuditEvents.entityId} = ${applicationId})
        OR (${recruitingAuditEvents.entityType} = 'candidate' AND ${recruitingAuditEvents.entityId} = ${application.candidateId})`
      )
      .orderBy(desc(recruitingAuditEvents.occurredAt))
      .limit(100),
  ]);

  if (!candidate || !requisition) {
    return null;
  }

  const stageHistoryWithEmails = await Promise.all(
    stageHistory.map(async (sh) => {
      let transitionedByEmail: string | null = null;
      if (sh.transitionedBy) {
        const [user] = await db.select({ email: users.email })
          .from(users)
          .where(eq(users.id, sh.transitionedBy))
          .limit(1);
        transitionedByEmail = user?.email || null;
      }
      return {
        ...sh,
        transitionedByEmail,
      };
    })
  );

  const completedDocuments = documents.filter(d => d.status === 'finalized' || d.esignSignedAt).length;
  const pendingDocuments = documents.filter(d => d.status === 'draft' || d.status === 'sent_for_signature').length;
  const daysInPipeline = Math.floor((Date.now() - application.appliedAt.getTime()) / (1000 * 60 * 60 * 24));

  const complianceIssues: string[] = [];
  if (!application.docsComplete) complianceIssues.push("Required documents incomplete");
  if (!application.consentCaptured) complianceIssues.push("Consent not captured");
  if (application.backgroundCheckStatus !== 'passed') complianceIssues.push(`Background check: ${application.backgroundCheckStatus || 'pending'}`);
  if (application.complianceStatus === 'blocked') complianceIssues.push(application.complianceBlockedReason || "Compliance blocked");
  if (application.readinessStatus !== 'ready') complianceIssues.push(`Readiness: ${application.readinessStatus}`);

  const isCompliant = complianceIssues.length === 0;

  return {
    generatedAt: new Date().toISOString(),
    generatedBy: requestedBy,
    candidate: {
      id: candidate.id,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      phone: candidate.phone,
      status: candidate.status,
      createdAt: candidate.createdAt,
    },
    application: {
      id: application.id,
      requisitionTitle: requisition.title,
      market: requisition.market,
      currentStage: application.currentStage,
      readinessStatus: application.readinessStatus,
      readinessScore: application.readinessScore,
      readinessReasons: application.readinessReasons,
      readinessLastCalculatedAt: application.readinessLastCalculatedAt,
      backgroundCheckStatus: application.backgroundCheckStatus,
      docsComplete: application.docsComplete,
      consentCaptured: application.consentCaptured,
      complianceStatus: application.complianceStatus,
      complianceBlockedReason: application.complianceBlockedReason,
      appliedAt: application.appliedAt,
      disposition: application.disposition,
      dispositionReason: application.dispositionReason,
      disposedAt: application.disposedAt,
    },
    documents: documents.map(d => ({
      id: d.id,
      type: d.type,
      name: d.name,
      status: d.status,
      esignStatus: d.esignStatus,
      esignSentAt: d.esignSentAt,
      esignSignedAt: d.esignSignedAt,
      createdAt: d.createdAt,
      finalizedAt: d.finalizedAt,
    })),
    stageHistory: stageHistoryWithEmails,
    auditEvents: auditEvents.map(e => ({
      id: e.id,
      actionType: e.actionType,
      entityType: e.entityType,
      entityId: e.entityId,
      userId: e.userId,
      userEmail: e.userEmail,
      changedFields: e.changedFields,
      reason: e.reason,
      occurredAt: e.occurredAt,
    })),
    summary: {
      totalDocuments: documents.length,
      completedDocuments,
      pendingDocuments,
      totalStageTransitions: stageHistory.length,
      totalAuditEvents: auditEvents.length,
      daysInPipeline,
      isCompliant,
      complianceIssues,
    },
  };
}

export async function getComplianceDashboard(): Promise<ComplianceDashboardSummary> {
  const marketStats = await db.select({
    market: recruitingRequisitions.market,
    totalApplications: count(recruitingApplications.id),
    readyCount: sql<number>`SUM(CASE WHEN ${recruitingApplications.readinessStatus} = 'ready' THEN 1 ELSE 0 END)`,
    inReviewCount: sql<number>`SUM(CASE WHEN ${recruitingApplications.readinessStatus} = 'in_review' THEN 1 ELSE 0 END)`,
    notReadyCount: sql<number>`SUM(CASE WHEN ${recruitingApplications.readinessStatus} = 'not_ready' THEN 1 ELSE 0 END)`,
    docsCompleteCount: sql<number>`SUM(CASE WHEN ${recruitingApplications.docsComplete} = true THEN 1 ELSE 0 END)`,
    backgroundPassedCount: sql<number>`SUM(CASE WHEN ${recruitingApplications.backgroundCheckStatus} = 'passed' THEN 1 ELSE 0 END)`,
    avgReadinessScore: sql<number>`AVG(${recruitingApplications.readinessScore})`,
  })
    .from(recruitingApplications)
    .innerJoin(recruitingRequisitions, eq(recruitingApplications.requisitionId, recruitingRequisitions.id))
    .where(eq(recruitingApplications.isArchived, false))
    .groupBy(recruitingRequisitions.market);

  const candidateCountByMarket = await db.select({
    market: sql<string>`unnest(${recruitingCandidates.preferredMarkets})`,
    count: count(recruitingCandidates.id),
  })
    .from(recruitingCandidates)
    .where(eq(recruitingCandidates.isArchived, false))
    .groupBy(sql`unnest(${recruitingCandidates.preferredMarkets})`);

  const candidateMarketMap = new Map<string, number>();
  for (const cm of candidateCountByMarket) {
    if (cm.market) {
      candidateMarketMap.set(cm.market, Number(cm.count) || 0);
    }
  }

  const byMarket = marketStats.map(ms => ({
    market: ms.market,
    totalCandidates: candidateMarketMap.get(ms.market) || 0,
    totalApplications: Number(ms.totalApplications) || 0,
    readyCount: Number(ms.readyCount) || 0,
    inReviewCount: Number(ms.inReviewCount) || 0,
    notReadyCount: Number(ms.notReadyCount) || 0,
    docsCompleteCount: Number(ms.docsCompleteCount) || 0,
    backgroundPassedCount: Number(ms.backgroundPassedCount) || 0,
  }));

  const [totalStats] = await db.select({
    totalCandidates: count(recruitingCandidates.id),
  })
    .from(recruitingCandidates)
    .where(eq(recruitingCandidates.isArchived, false));

  const [appStats] = await db.select({
    totalApplications: count(recruitingApplications.id),
    readyCount: sql<number>`SUM(CASE WHEN ${recruitingApplications.readinessStatus} = 'ready' THEN 1 ELSE 0 END)`,
    docsCompleteCount: sql<number>`SUM(CASE WHEN ${recruitingApplications.docsComplete} = true THEN 1 ELSE 0 END)`,
    backgroundPassedCount: sql<number>`SUM(CASE WHEN ${recruitingApplications.backgroundCheckStatus} = 'passed' THEN 1 ELSE 0 END)`,
    avgReadinessScore: sql<number>`COALESCE(AVG(${recruitingApplications.readinessScore}), 0)`,
  })
    .from(recruitingApplications)
    .where(eq(recruitingApplications.isArchived, false));

  const totalApps = Number(appStats?.totalApplications) || 1;
  const readyCount = Number(appStats?.readyCount) || 0;
  const docsCompleteCount = Number(appStats?.docsCompleteCount) || 0;
  const backgroundPassedCount = Number(appStats?.backgroundPassedCount) || 0;

  const recentReadinessEvents = await db.select({
    id: recruitingAuditEvents.id,
    entityId: recruitingAuditEvents.entityId,
    previousValue: recruitingAuditEvents.previousValue,
    newValue: recruitingAuditEvents.newValue,
    occurredAt: recruitingAuditEvents.occurredAt,
  })
    .from(recruitingAuditEvents)
    .where(
      and(
        eq(recruitingAuditEvents.entityType, 'application'),
        sql`${recruitingAuditEvents.changedFields} @> ARRAY['readinessStatus']::text[]`
      )
    )
    .orderBy(desc(recruitingAuditEvents.occurredAt))
    .limit(10);

  const applicationIds = recentReadinessEvents.map(e => e.entityId);
  const applicationsWithDetails = applicationIds.length > 0
    ? await db.select({
        id: recruitingApplications.id,
        candidateId: recruitingApplications.candidateId,
        requisitionId: recruitingApplications.requisitionId,
      })
        .from(recruitingApplications)
        .where(inArray(recruitingApplications.id, applicationIds))
    : [];

  const candidateIds = applicationsWithDetails.map(a => a.candidateId);
  const requisitionIds = applicationsWithDetails.map(a => a.requisitionId);

  const [candidates, requisitions] = await Promise.all([
    candidateIds.length > 0
      ? db.select({ id: recruitingCandidates.id, firstName: recruitingCandidates.firstName, lastName: recruitingCandidates.lastName })
          .from(recruitingCandidates)
          .where(inArray(recruitingCandidates.id, candidateIds))
      : [],
    requisitionIds.length > 0
      ? db.select({ id: recruitingRequisitions.id, market: recruitingRequisitions.market })
          .from(recruitingRequisitions)
          .where(inArray(recruitingRequisitions.id, requisitionIds))
      : [],
  ]);

  const candidateMap = new Map(candidates.map(c => [c.id, c]));
  const requisitionMap = new Map(requisitions.map(r => [r.id, r]));
  const appMap = new Map(applicationsWithDetails.map(a => [a.id, a]));

  const recentReadinessChanges = recentReadinessEvents.map(e => {
    const app = appMap.get(e.entityId);
    const candidate = app ? candidateMap.get(app.candidateId) : null;
    const requisition = app ? requisitionMap.get(app.requisitionId) : null;
    
    let previousStatus: string | null = null;
    let newStatus = 'unknown';
    try {
      if (e.previousValue) {
        const prev = JSON.parse(e.previousValue);
        previousStatus = prev.readinessStatus || null;
      }
      if (e.newValue) {
        const newVal = JSON.parse(e.newValue);
        newStatus = newVal.readinessStatus || 'unknown';
      }
    } catch {}
    
    return {
      applicationId: e.entityId,
      candidateName: candidate ? `${candidate.firstName} ${candidate.lastName}` : 'Unknown',
      market: requisition?.market || 'Unknown',
      previousStatus,
      newStatus,
      changedAt: e.occurredAt,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    byMarket,
    overallStats: {
      totalCandidates: Number(totalStats?.totalCandidates) || 0,
      totalApplications: totalApps,
      readyPercentage: Math.round((readyCount / totalApps) * 100),
      docsCompletePercentage: Math.round((docsCompleteCount / totalApps) * 100),
      backgroundPassedPercentage: Math.round((backgroundPassedCount / totalApps) * 100),
      averageReadinessScore: Math.round(Number(appStats?.avgReadinessScore) || 0),
    },
    recentReadinessChanges,
  };
}
