import { db } from "../db";
import {
  recruitingApplications,
  recruitingDocuments,
  recruitingConsents,
  recruitingCandidates,
  readinessRegressionEvents,
  recruitingAuditEvents,
  recruitingSchedulingSyncLog,
  notifications,
  users,
  type ReadinessRegressionReason,
  type ReadinessStatus,
  type ReadinessRegressionEvent,
} from "@shared/schema";
import { eq, and, sql, lte, isNull, or, ne } from "drizzle-orm";

interface RegressionTrigger {
  reason: ReadinessRegressionReason;
  details: string;
  triggerEntityType?: string;
  triggerEntityId?: string;
}

export async function handleReadinessRegression(
  applicationId: string,
  trigger: RegressionTrigger,
  userId: string | null,
  userEmail: string | null
): Promise<{ downgraded: boolean; previousStatus: string; newStatus: string } | null> {
  const [app] = await db
    .select()
    .from(recruitingApplications)
    .where(eq(recruitingApplications.id, applicationId))
    .limit(1);

  if (!app) return null;

  const previousStatus = app.readinessStatus;

  if (previousStatus === "not_ready") {
    return { downgraded: false, previousStatus, newStatus: previousStatus };
  }

  const newInputs = await evaluateComplianceInputs(applicationId, app.candidateId);

  const updatedFields: Record<string, unknown> = {
    ...newInputs,
    updatedAt: new Date(),
    updatedBy: userId,
  };

  await db.update(recruitingApplications)
    .set(updatedFields)
    .where(eq(recruitingApplications.id, applicationId));

  const { recalculateReadiness } = await import("../recruitingService");
  const updated = await recalculateReadiness(applicationId, userId, userEmail);
  if (!updated) return null;

  const newStatus = updated.readinessStatus;
  const downgraded = isDowngrade(previousStatus, newStatus);

  if (downgraded) {
    const candidateId = app.candidateId;

    let schedulingEventEmitted = false;
    let schedulingEventEmittedAt: Date | null = null;
    try {
      await db.insert(recruitingSchedulingSyncLog).values({
        eventType: "readiness_regression",
        status: "pending",
        candidateId,
        applicationId,
        direction: "outbound",
        payload: {
          regressionReason: trigger.reason,
          regressionDetails: trigger.details,
          previousStatus,
          newStatus,
          triggerEntityType: trigger.triggerEntityType,
          triggerEntityId: trigger.triggerEntityId,
        },
        triggeredBy: userId || "system",
      });
      schedulingEventEmitted = true;
      schedulingEventEmittedAt = new Date();
    } catch (emitErr) {
      console.error(`[Regression] Failed to emit scheduling event for ${applicationId}:`, emitErr);
    }

    const [regressionEvent] = await db.insert(readinessRegressionEvents).values({
      applicationId,
      candidateId,
      previousStatus,
      newStatus,
      regressionReason: trigger.reason,
      regressionDetails: trigger.details,
      triggerEntityType: trigger.triggerEntityType || null,
      triggerEntityId: trigger.triggerEntityId || null,
      schedulingEventEmitted,
      schedulingEventEmittedAt,
      createdBy: userId,
    }).returning();

    await db.insert(recruitingAuditEvents).values({
      actionType: "READINESS_REGRESSION",
      entityType: "application",
      entityId: applicationId,
      userId,
      userEmail: userEmail || "system",
      actorRole: userId ? null : "system",
      source: userId ? "ui" : "system",
      previousValue: JSON.stringify({
        readinessStatus: previousStatus,
        readinessScore: app.readinessScore,
      }),
      newValue: JSON.stringify({
        readinessStatus: newStatus,
        readinessScore: updated.readinessScore,
        regressionReason: trigger.reason,
        regressionDetails: trigger.details,
      }),
      changedFields: ["readinessStatus", "readinessScore"],
      reason: `Readiness regression: ${trigger.reason} - ${trigger.details}`,
    });

    const notificationId = await sendRecruiterNotification(
      applicationId,
      candidateId,
      app.ownerId,
      trigger,
      previousStatus,
      newStatus
    );

    if (notificationId && regressionEvent) {
      await db.update(readinessRegressionEvents)
        .set({ notificationSent: true, notificationId })
        .where(eq(readinessRegressionEvents.id, regressionEvent.id));
    }

    console.log(
      `[Readiness Regression] Application ${applicationId}: ${previousStatus} → ${newStatus} | Reason: ${trigger.reason} | Details: ${trigger.details}`
    );
  }

  return { downgraded, previousStatus, newStatus };
}

function isDowngrade(previous: string, current: string): boolean {
  const statusOrder: Record<string, number> = {
    not_ready: 0,
    in_review: 1,
    ready: 2,
  };
  return (statusOrder[current] ?? 0) < (statusOrder[previous] ?? 0);
}

async function evaluateComplianceInputs(
  applicationId: string,
  candidateId: string
): Promise<{
  consentCaptured: boolean;
  docsComplete: boolean;
  backgroundCheckStatus: string;
}> {
  const now = new Date();

  const docs = await db
    .select()
    .from(recruitingDocuments)
    .where(eq(recruitingDocuments.applicationId, applicationId));

  const requiredDocTypes = ["offer_letter", "employment_agreement", "background_consent", "nda"];
  const requiredDocs = docs.filter(
    (d) => requiredDocTypes.includes(d.type)
  );
  const docsComplete =
    requiredDocs.length > 0 &&
    requiredDocs.every((d) => {
      if (d.status !== "finalized" && d.status !== "signed") return false;
      if (d.expiresAt && new Date(d.expiresAt) <= now) return false;
      return true;
    });

  const consents = await db
    .select()
    .from(recruitingConsents)
    .where(
      or(
        eq(recruitingConsents.applicationId, applicationId),
        and(
          eq(recruitingConsents.candidateId, candidateId),
          isNull(recruitingConsents.applicationId)
        )
      )
    );

  const requiredConsentTypes = ["background_check", "drug_test", "data_processing"];
  const consentCaptured = requiredConsentTypes.every((type) => {
    const matchingConsents = consents.filter((c) => c.consentType === type);
    return matchingConsents.some(
      (c) => c.accepted && !c.revokedAt && (!c.expiresAt || new Date(c.expiresAt) > now)
    );
  });

  const [appData] = await db
    .select({ backgroundCheckStatus: recruitingApplications.backgroundCheckStatus })
    .from(recruitingApplications)
    .where(eq(recruitingApplications.id, applicationId))
    .limit(1);

  return {
    consentCaptured,
    docsComplete,
    backgroundCheckStatus: appData?.backgroundCheckStatus || "pending",
  };
}

async function sendRecruiterNotification(
  applicationId: string,
  candidateId: string,
  recruiterId: string | null,
  trigger: RegressionTrigger,
  previousStatus: string,
  newStatus: string
): Promise<string | null> {
  if (!recruiterId) return null;

  const [candidate] = await db
    .select({
      firstName: recruitingCandidates.firstName,
      lastName: recruitingCandidates.lastName,
    })
    .from(recruitingCandidates)
    .where(eq(recruitingCandidates.id, candidateId))
    .limit(1);

  const candidateName = candidate
    ? `${candidate.firstName} ${candidate.lastName}`
    : "Unknown Candidate";

  const reasonLabels: Record<string, string> = {
    document_expired: "A required document has expired",
    consent_revoked: "A required consent was revoked",
    background_check_failed: "Background check failed",
    background_check_status_changed: "Background check status changed",
    docs_incomplete: "Required documents are no longer complete",
    manual_downgrade: "Readiness was manually downgraded",
  };

  const title = `Readiness Downgrade: ${candidateName}`;
  const message =
    `${candidateName}'s readiness status was downgraded from "${previousStatus}" to "${newStatus}". ` +
    `Reason: ${reasonLabels[trigger.reason] || trigger.reason}. ` +
    `Details: ${trigger.details}`;

  const [notification] = await db
    .insert(notifications)
    .values({
      userId: recruiterId,
      type: "readiness_regression",
      title,
      message,
      relatedEntityType: "recruiting_application",
      relatedEntityId: applicationId,
    })
    .returning();

  return notification?.id || null;
}

export async function onDocumentExpired(
  documentId: string,
  applicationId: string,
  userId: string | null,
  userEmail: string | null
): Promise<void> {
  const [doc] = await db
    .select({ name: recruitingDocuments.name })
    .from(recruitingDocuments)
    .where(eq(recruitingDocuments.id, documentId))
    .limit(1);

  await handleReadinessRegression(applicationId, {
    reason: "document_expired",
    details: `Document "${doc?.name || documentId}" has expired`,
    triggerEntityType: "document",
    triggerEntityId: documentId,
  }, userId, userEmail);
}

export async function onConsentRevoked(
  applicationId: string,
  candidateId: string,
  consentType: string,
  userId: string | null,
  userEmail: string | null
): Promise<void> {
  await handleReadinessRegression(applicationId, {
    reason: "consent_revoked",
    details: `Consent type "${consentType}" was revoked`,
    triggerEntityType: "consent",
    triggerEntityId: candidateId,
  }, userId, userEmail);
}

export async function onBackgroundStatusChanged(
  applicationId: string,
  newBackgroundStatus: string,
  userId: string | null,
  userEmail: string | null
): Promise<void> {
  if (newBackgroundStatus === "passed") return;

  const reason: ReadinessRegressionReason =
    newBackgroundStatus === "failed"
      ? "background_check_failed"
      : "background_check_status_changed";

  await handleReadinessRegression(applicationId, {
    reason,
    details: `Background check status changed to "${newBackgroundStatus}"`,
    triggerEntityType: "application",
    triggerEntityId: applicationId,
  }, userId, userEmail);
}

export async function sweepExpiredDocuments(): Promise<{
  scanned: number;
  downgraded: number;
}> {
  const now = new Date();

  const expiredDocs = await db
    .select({
      id: recruitingDocuments.id,
      applicationId: recruitingDocuments.applicationId,
      name: recruitingDocuments.name,
    })
    .from(recruitingDocuments)
    .innerJoin(
      recruitingApplications,
      eq(recruitingDocuments.applicationId, recruitingApplications.id)
    )
    .where(
      and(
        lte(recruitingDocuments.expiresAt, now),
        ne(recruitingApplications.readinessStatus, "not_ready"),
        eq(recruitingApplications.isArchived, false)
      )
    );

  let downgraded = 0;

  for (const doc of expiredDocs) {
    const result = await handleReadinessRegression(doc.applicationId, {
      reason: "document_expired",
      details: `Document "${doc.name}" expired (sweep)`,
      triggerEntityType: "document",
      triggerEntityId: doc.id,
    }, null, "system@driverhub360.com");

    if (result?.downgraded) downgraded++;
  }

  return { scanned: expiredDocs.length, downgraded };
}

export async function sweepExpiredConsents(): Promise<{
  scanned: number;
  downgraded: number;
}> {
  const now = new Date();

  const expiredConsents = await db
    .select({
      id: recruitingConsents.id,
      candidateId: recruitingConsents.candidateId,
      applicationId: recruitingConsents.applicationId,
      consentType: recruitingConsents.consentType,
    })
    .from(recruitingConsents)
    .where(
      and(
        lte(recruitingConsents.expiresAt, now),
        isNull(recruitingConsents.revokedAt),
        eq(recruitingConsents.accepted, true)
      )
    );

  let downgraded = 0;
  const processedApps = new Set<string>();

  for (const consent of expiredConsents) {
    let appsToCheck: string[] = [];

    if (consent.applicationId) {
      appsToCheck = [consent.applicationId];
    } else {
      const apps = await db
        .select({ id: recruitingApplications.id })
        .from(recruitingApplications)
        .where(
          and(
            eq(recruitingApplications.candidateId, consent.candidateId),
            ne(recruitingApplications.readinessStatus, "not_ready"),
            eq(recruitingApplications.isArchived, false)
          )
        );
      appsToCheck = apps.map((a) => a.id);
    }

    for (const appId of appsToCheck) {
      if (processedApps.has(appId)) continue;
      processedApps.add(appId);

      const result = await handleReadinessRegression(appId, {
        reason: "consent_revoked",
        details: `Consent type "${consent.consentType}" expired (sweep)`,
        triggerEntityType: "consent",
        triggerEntityId: consent.id,
      }, null, "system@driverhub360.com");

      if (result?.downgraded) downgraded++;
    }
  }

  return { scanned: expiredConsents.length, downgraded };
}

export async function sweepStaleReadiness(): Promise<{
  scanned: number;
  downgraded: number;
}> {
  const readyApps = await db
    .select({
      id: recruitingApplications.id,
      candidateId: recruitingApplications.candidateId,
    })
    .from(recruitingApplications)
    .where(
      and(
        eq(recruitingApplications.readinessStatus, "ready"),
        eq(recruitingApplications.isArchived, false)
      )
    );

  let downgraded = 0;

  for (const app of readyApps) {
    const inputs = await evaluateComplianceInputs(app.id, app.candidateId);

    const hasRegression =
      !inputs.consentCaptured ||
      !inputs.docsComplete ||
      inputs.backgroundCheckStatus !== "passed";

    if (hasRegression) {
      let reason: ReadinessRegressionReason = "docs_incomplete";
      let details = "Compliance check failed during periodic sweep";

      if (!inputs.consentCaptured) {
        reason = "consent_revoked";
        details = "Required consent is missing or expired";
      } else if (inputs.backgroundCheckStatus !== "passed") {
        reason = "background_check_status_changed";
        details = `Background check status is "${inputs.backgroundCheckStatus}"`;
      } else if (!inputs.docsComplete) {
        reason = "docs_incomplete";
        details = "Required documents are incomplete or expired";
      }

      const result = await handleReadinessRegression(app.id, {
        reason,
        details,
      }, null, "system@driverhub360.com");

      if (result?.downgraded) downgraded++;
    }
  }

  return { scanned: readyApps.length, downgraded };
}

export async function getRegressionEvents(
  filters?: {
    applicationId?: string;
    candidateId?: string;
    reason?: string;
    unresolvedOnly?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<{ events: ReadinessRegressionEvent[]; total: number }> {
  const conditions = [];
  if (filters?.applicationId) {
    conditions.push(eq(readinessRegressionEvents.applicationId, filters.applicationId));
  }
  if (filters?.candidateId) {
    conditions.push(eq(readinessRegressionEvents.candidateId, filters.candidateId));
  }
  if (filters?.reason) {
    conditions.push(eq(readinessRegressionEvents.regressionReason, filters.reason));
  }
  if (filters?.unresolvedOnly) {
    conditions.push(isNull(readinessRegressionEvents.resolvedAt));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(readinessRegressionEvents)
    .where(whereClause);

  const events = await db
    .select()
    .from(readinessRegressionEvents)
    .where(whereClause)
    .orderBy(sql`${readinessRegressionEvents.createdAt} DESC`)
    .limit(filters?.limit || 50)
    .offset(filters?.offset || 0);

  return { events, total: countResult?.count || 0 };
}

export async function resolveRegressionEvent(
  eventId: string,
  userId: string,
  userEmail: string
): Promise<ReadinessRegressionEvent | null> {
  const [updated] = await db
    .update(readinessRegressionEvents)
    .set({
      resolvedAt: new Date(),
      resolvedBy: userId,
    })
    .where(eq(readinessRegressionEvents.id, eventId))
    .returning();

  if (updated) {
    await db.insert(recruitingAuditEvents).values({
      actionType: "READINESS_REGRESSION_RESOLVED",
      entityType: "application",
      entityId: updated.applicationId,
      userId,
      userEmail,
      source: "ui",
      previousValue: JSON.stringify({ resolvedAt: null }),
      newValue: JSON.stringify({ resolvedAt: updated.resolvedAt }),
      changedFields: ["resolvedAt"],
      reason: `Regression event resolved for reason: ${updated.regressionReason}`,
    });
  }

  return updated || null;
}
