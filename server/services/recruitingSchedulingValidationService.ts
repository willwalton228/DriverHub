import { db } from "../db";
import { 
  recruitingCandidates, 
  recruitingApplications, 
  recruitingRequisitions,
  recruitingDocuments,
  recruitingSchedulingSyncLog,
  recruitingDocumentExpiryEvents,
  recruitingSchedulingIntegrationHealth,
  InsertRecruitingSchedulingSyncLog,
  InsertRecruitingDocumentExpiryEvent,
  RecruitingSchedulingSyncLog,
  RecruitingDocumentExpiryEvent,
  RecruitingSchedulingIntegrationHealth,
} from "@shared/schema";
import { eq, and, sql, gte, lte, desc, lt, or, isNull, count } from "drizzle-orm";

const SYNC_SLA_MS = 5000;

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface EquipmentSnapshot {
  accessToVehicle: boolean | null;
  vehicleType: string | null;
  trailerAccess: boolean | null;
}

export interface ReadinessValidation {
  candidateId: string;
  applicationId: string;
  isDeployable: boolean;
  blockers: string[];
  validatedAt: Date;
  equipment: EquipmentSnapshot;
}

export interface IntegrationHealthStatus {
  status: "healthy" | "degraded" | "critical";
  healthScore: number;
  lastCheckedAt: Date;
  metrics: {
    totalSyncs24h: number;
    successfulSyncs24h: number;
    failedSyncs24h: number;
    rejectedPushes24h: number;
    avgSyncDurationMs: number;
    slaBreaches24h: number;
    pendingSyncs: number;
    expiredDocsToday: number;
    readinessDowngrades24h: number;
  };
  recentFailures: RecruitingSchedulingSyncLog[];
  recentExpirations: RecruitingDocumentExpiryEvent[];
}

export async function logSyncEvent(data: Partial<InsertRecruitingSchedulingSyncLog>): Promise<RecruitingSchedulingSyncLog> {
  const [log] = await db.insert(recruitingSchedulingSyncLog).values({
    eventType: data.eventType || "unknown",
    status: data.status || "pending",
    candidateId: data.candidateId,
    applicationId: data.applicationId,
    direction: data.direction || "outbound",
    payload: data.payload,
    errorCode: data.errorCode,
    errorMessage: data.errorMessage,
    rejectionReason: data.rejectionReason,
    validationErrors: data.validationErrors,
    startedAt: data.startedAt || new Date(),
    completedAt: data.completedAt,
    durationMs: data.durationMs,
    retryCount: data.retryCount || 0,
    triggeredBy: data.triggeredBy,
  }).returning();
  
  return log;
}

export async function updateSyncLog(
  logId: string, 
  updates: Partial<InsertRecruitingSchedulingSyncLog>
): Promise<void> {
  await db.update(recruitingSchedulingSyncLog)
    .set(updates)
    .where(eq(recruitingSchedulingSyncLog.id, logId));
}

export async function completeSyncLog(
  logId: string,
  status: "success" | "failed" | "rejected" | "partial",
  error?: { code?: string; message?: string; rejectionReason?: string }
): Promise<void> {
  const now = new Date();
  const [log] = await db.select().from(recruitingSchedulingSyncLog)
    .where(eq(recruitingSchedulingSyncLog.id, logId)).limit(1);
  
  const durationMs = log ? now.getTime() - new Date(log.startedAt).getTime() : 0;
  
  await db.update(recruitingSchedulingSyncLog)
    .set({
      status,
      completedAt: now,
      durationMs,
      errorCode: error?.code,
      errorMessage: error?.message,
      rejectionReason: error?.rejectionReason,
    })
    .where(eq(recruitingSchedulingSyncLog.id, logId));
  
  if (status === "failed" || status === "rejected") {
    console.error(`[Recruiting-Scheduling Sync] ${status.toUpperCase()}: ${error?.message || error?.rejectionReason || "Unknown error"}`, {
      logId,
      candidateId: log?.candidateId,
      applicationId: log?.applicationId,
    });
  }
}

export async function logDocumentExpiry(data: InsertRecruitingDocumentExpiryEvent): Promise<RecruitingDocumentExpiryEvent> {
  const [event] = await db.insert(recruitingDocumentExpiryEvents).values(data).returning();
  
  console.warn(`[Recruiting] Document expired for candidate ${data.candidateId}:`, {
    documentName: data.documentName,
    documentType: data.documentType,
    previousStatus: data.previousReadinessStatus,
    newStatus: data.newReadinessStatus,
  });
  
  return event;
}

export async function validateCandidateReadiness(
  candidateId: string,
  applicationId: string
): Promise<ReadinessValidation> {
  const today = new Date().toISOString().split('T')[0];
  const blockers: string[] = [];
  
  const [appResult] = await db
    .select({
      readinessStatus: recruitingApplications.readinessStatus,
      backgroundCheckStatus: recruitingApplications.backgroundCheckStatus,
      docsComplete: recruitingApplications.docsComplete,
      consentCaptured: recruitingApplications.consentCaptured,
    })
    .from(recruitingApplications)
    .where(eq(recruitingApplications.id, applicationId))
    .limit(1);
  
  if (!appResult) {
    blockers.push("Application not found");
    return { candidateId, applicationId, isDeployable: false, blockers, validatedAt: new Date(), equipment: { accessToVehicle: null, vehicleType: null, trailerAccess: null } };
  }
  
  const [candResult] = await db
    .select({
      licenseExpiration: recruitingCandidates.licenseExpiration,
      accessToVehicle: recruitingCandidates.accessToVehicle,
      vehicleType: recruitingCandidates.vehicleType,
      trailerAccess: recruitingCandidates.trailerAccess,
    })
    .from(recruitingCandidates)
    .where(eq(recruitingCandidates.id, candidateId))
    .limit(1);
  
  if (appResult.readinessStatus !== "ready") {
    blockers.push(`Readiness status is "${appResult.readinessStatus}", not "ready"`);
  }
  
  if (appResult.backgroundCheckStatus !== "passed") {
    blockers.push(`Background check status is "${appResult.backgroundCheckStatus}", not "passed"`);
  }
  
  if (!appResult.docsComplete) {
    blockers.push("Required documents are not complete");
  }
  
  if (!appResult.consentCaptured) {
    blockers.push("Consent has not been captured");
  }
  
  if (candResult?.licenseExpiration && candResult.licenseExpiration < today) {
    blockers.push(`License expired on ${candResult.licenseExpiration}`);
  }
  
  const expiredDocs = await checkExpiredDocuments(applicationId);
  if (expiredDocs.length > 0) {
    blockers.push(`Expired documents: ${expiredDocs.map(d => d.name).join(", ")}`);
  }
  
  const isDeployable = blockers.length === 0;
  
  const equipment: EquipmentSnapshot = {
    accessToVehicle: candResult?.accessToVehicle ?? null,
    vehicleType: candResult?.vehicleType ?? null,
    trailerAccess: candResult?.trailerAccess ?? null,
  };

  return {
    candidateId,
    applicationId,
    isDeployable,
    blockers,
    validatedAt: new Date(),
    equipment,
  };
}

export async function checkExpiredDocuments(applicationId: string): Promise<Array<{id: string; name: string; type: string}>> {
  const docs = await db
    .select({
      id: recruitingDocuments.id,
      name: recruitingDocuments.name,
      type: recruitingDocuments.type,
      status: recruitingDocuments.status,
    })
    .from(recruitingDocuments)
    .where(eq(recruitingDocuments.applicationId, applicationId));
  
  const expiredDocs: Array<{id: string; name: string; type: string}> = [];
  
  for (const doc of docs) {
    if (doc.status === "expired" || doc.status === "revoked") {
      expiredDocs.push({ id: doc.id, name: doc.name, type: doc.type });
    }
  }
  
  return expiredDocs;
}

export async function validateReadinessPush(
  candidateId: string,
  applicationId: string
): Promise<{ valid: boolean; rejectionReason?: string; syncLogId: string; equipment?: EquipmentSnapshot }> {
  const syncLog = await logSyncEvent({
    eventType: "readiness_push",
    candidateId,
    applicationId,
    status: "pending",
    direction: "outbound",
    triggeredBy: "system",
  });
  
  const validation = await validateCandidateReadiness(candidateId, applicationId);
  
  if (!validation.isDeployable) {
    const rejectionReason = `Candidate not deployable: ${validation.blockers.join("; ")}`;
    
    await completeSyncLog(syncLog.id, "rejected", { rejectionReason });
    
    return {
      valid: false,
      rejectionReason,
      syncLogId: syncLog.id,
    };
  }
  
  await completeSyncLog(syncLog.id, "success");
  
  return {
    valid: true,
    syncLogId: syncLog.id,
    equipment: validation.equipment,
  };
}

export async function getIntegrationHealth(): Promise<IntegrationHealthStatus> {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  
  const [totalSyncsResult] = await db
    .select({ count: count() })
    .from(recruitingSchedulingSyncLog)
    .where(gte(recruitingSchedulingSyncLog.createdAt, twentyFourHoursAgo));
  
  const [successfulSyncsResult] = await db
    .select({ count: count() })
    .from(recruitingSchedulingSyncLog)
    .where(and(
      gte(recruitingSchedulingSyncLog.createdAt, twentyFourHoursAgo),
      eq(recruitingSchedulingSyncLog.status, "success")
    ));
  
  const [failedSyncsResult] = await db
    .select({ count: count() })
    .from(recruitingSchedulingSyncLog)
    .where(and(
      gte(recruitingSchedulingSyncLog.createdAt, twentyFourHoursAgo),
      eq(recruitingSchedulingSyncLog.status, "failed")
    ));
  
  const [rejectedPushesResult] = await db
    .select({ count: count() })
    .from(recruitingSchedulingSyncLog)
    .where(and(
      gte(recruitingSchedulingSyncLog.createdAt, twentyFourHoursAgo),
      eq(recruitingSchedulingSyncLog.status, "rejected")
    ));
  
  const [pendingSyncsResult] = await db
    .select({ count: count() })
    .from(recruitingSchedulingSyncLog)
    .where(eq(recruitingSchedulingSyncLog.status, "pending"));
  
  const [avgDurationResult] = await db
    .select({ avg: sql<number>`COALESCE(AVG(duration_ms), 0)::int` })
    .from(recruitingSchedulingSyncLog)
    .where(and(
      gte(recruitingSchedulingSyncLog.createdAt, twentyFourHoursAgo),
      sql`duration_ms IS NOT NULL`
    ));
  
  const [slaBreachesResult] = await db
    .select({ count: count() })
    .from(recruitingSchedulingSyncLog)
    .where(and(
      gte(recruitingSchedulingSyncLog.createdAt, twentyFourHoursAgo),
      sql`duration_ms > ${SYNC_SLA_MS}`
    ));
  
  const [expiredDocsResult] = await db
    .select({ count: count() })
    .from(recruitingDocumentExpiryEvents)
    .where(gte(recruitingDocumentExpiryEvents.detectedAt, todayStart));
  
  const [downgradesResult] = await db
    .select({ count: count() })
    .from(recruitingDocumentExpiryEvents)
    .where(and(
      gte(recruitingDocumentExpiryEvents.detectedAt, twentyFourHoursAgo),
      sql`previous_readiness_status = 'ready' AND new_readiness_status != 'ready'`
    ));
  
  const recentFailures = await db
    .select()
    .from(recruitingSchedulingSyncLog)
    .where(and(
      gte(recruitingSchedulingSyncLog.createdAt, twentyFourHoursAgo),
      or(
        eq(recruitingSchedulingSyncLog.status, "failed"),
        eq(recruitingSchedulingSyncLog.status, "rejected")
      )
    ))
    .orderBy(desc(recruitingSchedulingSyncLog.createdAt))
    .limit(10);
  
  const recentExpirations = await db
    .select()
    .from(recruitingDocumentExpiryEvents)
    .where(gte(recruitingDocumentExpiryEvents.detectedAt, twentyFourHoursAgo))
    .orderBy(desc(recruitingDocumentExpiryEvents.detectedAt))
    .limit(10);
  
  const totalSyncs = totalSyncsResult?.count || 0;
  const successfulSyncs = successfulSyncsResult?.count || 0;
  const failedSyncs = failedSyncsResult?.count || 0;
  const rejectedPushes = rejectedPushesResult?.count || 0;
  const pendingSyncs = pendingSyncsResult?.count || 0;
  const slaBreaches = slaBreachesResult?.count || 0;
  
  let healthScore = 100;
  
  if (totalSyncs > 0) {
    const failureRate = (failedSyncs + rejectedPushes) / totalSyncs;
    healthScore -= Math.min(50, failureRate * 100);
  }
  
  if (slaBreaches > 5) {
    healthScore -= Math.min(20, slaBreaches * 2);
  }
  
  if (pendingSyncs > 10) {
    healthScore -= Math.min(15, pendingSyncs);
  }
  
  healthScore = Math.max(0, Math.round(healthScore));
  
  let status: "healthy" | "degraded" | "critical" = "healthy";
  if (healthScore < 50) {
    status = "critical";
  } else if (healthScore < 80) {
    status = "degraded";
  }
  
  return {
    status,
    healthScore,
    lastCheckedAt: now,
    metrics: {
      totalSyncs24h: totalSyncs,
      successfulSyncs24h: successfulSyncs,
      failedSyncs24h: failedSyncs,
      rejectedPushes24h: rejectedPushes,
      avgSyncDurationMs: avgDurationResult?.avg || 0,
      slaBreaches24h: slaBreaches,
      pendingSyncs,
      expiredDocsToday: expiredDocsResult?.count || 0,
      readinessDowngrades24h: downgradesResult?.count || 0,
    },
    recentFailures,
    recentExpirations,
  };
}

export async function checkAndProcessExpiredDocuments(): Promise<number> {
  const now = new Date();
  let processedCount = 0;
  
  const readyApplications = await db
    .select({
      id: recruitingApplications.id,
      candidateId: recruitingApplications.candidateId,
      readinessStatus: recruitingApplications.readinessStatus,
    })
    .from(recruitingApplications)
    .where(eq(recruitingApplications.readinessStatus, "ready"));
  
  for (const app of readyApplications) {
    const expiredDocs = await checkExpiredDocuments(app.id);
    
    if (expiredDocs.length > 0) {
      for (const doc of expiredDocs) {
        const existingEvent = await db
          .select({ id: recruitingDocumentExpiryEvents.id })
          .from(recruitingDocumentExpiryEvents)
          .where(and(
            eq(recruitingDocumentExpiryEvents.documentId, doc.id),
            eq(recruitingDocumentExpiryEvents.applicationId, app.id),
            isNull(recruitingDocumentExpiryEvents.resolvedAt)
          ))
          .limit(1);
        
        if (existingEvent.length === 0) {
          const syncLog = await logSyncEvent({
            eventType: "doc_expiry_check",
            candidateId: app.candidateId,
            applicationId: app.id,
            status: "pending",
            direction: "outbound",
            triggeredBy: "system",
            payload: { documentId: doc.id, documentName: doc.name },
          });
          
          await logDocumentExpiry({
            documentId: doc.id,
            documentName: doc.name,
            documentType: doc.type,
            candidateId: app.candidateId,
            applicationId: app.id,
            expiredAt: now,
            previousReadinessStatus: app.readinessStatus,
            newReadinessStatus: "not_ready",
            schedulingSyncTriggered: true,
            schedulingSyncLogId: syncLog.id,
          });
          
          await completeSyncLog(syncLog.id, "success");
          
          processedCount++;
        }
      }
    }
  }
  
  console.log(`[Recruiting-Scheduling] Processed ${processedCount} expired documents affecting readiness`);
  return processedCount;
}

export async function getSyncLogs(filters?: {
  status?: string;
  eventType?: string;
  candidateId?: string;
  since?: Date;
  limit?: number;
}): Promise<RecruitingSchedulingSyncLog[]> {
  const conditions = [];
  
  if (filters?.status) {
    conditions.push(eq(recruitingSchedulingSyncLog.status, filters.status as any));
  }
  if (filters?.eventType) {
    conditions.push(eq(recruitingSchedulingSyncLog.eventType, filters.eventType));
  }
  if (filters?.candidateId) {
    conditions.push(eq(recruitingSchedulingSyncLog.candidateId, filters.candidateId));
  }
  if (filters?.since) {
    conditions.push(gte(recruitingSchedulingSyncLog.createdAt, filters.since));
  }
  
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  
  return db
    .select()
    .from(recruitingSchedulingSyncLog)
    .where(whereClause)
    .orderBy(desc(recruitingSchedulingSyncLog.createdAt))
    .limit(filters?.limit || 100);
}
