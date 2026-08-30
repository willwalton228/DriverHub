/**
 * Screening Trigger Engine (Tickets 11 + 29)
 *
 * Fires automatically when an interviewer records "proceed_to_pre_hire".
 * Creates one screening request per type (MVR, background check, drug test),
 * updates application status fields, writes an immutable audit event, and
 * creates a candidate notification record with next-step instructions.
 *
 * Design: No paid provider calls are made here — this engine only creates
 * the internal request records. Provider integrations consume these records
 * asynchronously. This keeps the trigger synchronous and cheap.
 */

import { db } from "../db";
import { eq } from "drizzle-orm";
import {
  recruitingScreeningRequests,
  recruitingApplications,
  recruitingAuditEvents,
  recruitingCandidateNotifications,
  recruitingCandidates,
  users,
  SCREENING_TYPES,
  type ScreeningType,
} from "../../shared/schema";

export interface ScreeningTriggerResult {
  triggered: ScreeningType[];
  skipped: ScreeningType[];
  requestIds: string[];
  notificationId: string | null;
  candidateNotifiedAt: Date | null;
}

/**
 * Trigger all three screening types for an application.
 * Idempotent: if a request of the same type already exists with
 * status != 'failed', it is skipped (not duplicated).
 * Also creates a candidate notification record with next-step instructions.
 */
export async function triggerScreeningForApplication(
  applicationId: string,
  interviewId: string,
  triggeredByUserId: string
): Promise<ScreeningTriggerResult> {
  const now = new Date();

  // Load actor for audit
  const [actor] = await db
    .select({ email: users.email, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, triggeredByUserId))
    .limit(1);

  // Load candidate name for notification personalization
  const [appRow] = await db
    .select({
      candidateId: recruitingApplications.candidateId,
    })
    .from(recruitingApplications)
    .where(eq(recruitingApplications.id, applicationId))
    .limit(1);

  let candidateFirstName = "there";
  if (appRow?.candidateId) {
    const [cand] = await db
      .select({ firstName: recruitingCandidates.firstName })
      .from(recruitingCandidates)
      .where(eq(recruitingCandidates.id, appRow.candidateId))
      .limit(1);
    if (cand?.firstName) candidateFirstName = cand.firstName;
  }

  // Check for existing non-failed requests (idempotency)
  const existing = await db
    .select({ screeningType: recruitingScreeningRequests.screeningType, status: recruitingScreeningRequests.status })
    .from(recruitingScreeningRequests)
    .where(eq(recruitingScreeningRequests.applicationId, applicationId));

  const alreadyActive = new Set(
    existing
      .filter((r) => r.status !== "failed")
      .map((r) => r.screeningType)
  );

  const triggered: ScreeningType[] = [];
  const skipped: ScreeningType[] = [];
  const requestIds: string[] = [];

  // Create one request per type (unless already exists and not failed)
  for (const type of SCREENING_TYPES) {
    if (alreadyActive.has(type)) {
      skipped.push(type);
      continue;
    }
    const label = SCREENING_TYPE_LABELS[type];
    const [inserted] = await db
      .insert(recruitingScreeningRequests)
      .values({
        applicationId,
        screeningType: type,
        status: "requested",
        triggeredAt: now,
        triggeredBy: triggeredByUserId,
        triggeredByDecision: "interview_decision",
        triggeredByDecisionId: interviewId,
        notes: `Auto-triggered by "Proceed to Pre-Hire" interview decision.`,
      } as any)
      .returning({ id: recruitingScreeningRequests.id });
    triggered.push(type);
    if (inserted?.id) requestIds.push(inserted.id);
    console.log(`[ScreeningTrigger] ${label} request created for application ${applicationId}`);
  }

  // Update application background status to 'requested'
  if (triggered.length > 0) {
    await db
      .update(recruitingApplications)
      .set({
        backgroundCheckStatus: "in_progress",
        backgroundStatus: "requested",
        updatedAt: now,
        updatedBy: triggeredByUserId,
      } as any)
      .where(eq(recruitingApplications.id, applicationId));

    // Single audit event covering the whole trigger batch
    await db.insert(recruitingAuditEvents).values({
      actionType: "screening_triggered",
      entityType: "application",
      entityId: applicationId,
      userId: triggeredByUserId,
      userEmail: actor?.email || null,
      actorRole: "system",
      source: "system",
      previousValue: JSON.stringify({ backgroundStatus: "none" }),
      newValue: JSON.stringify({ backgroundStatus: "requested", screeningsTriggered: triggered }),
      changedFields: ["background_status", "background_check_status"],
      reason: "Screening auto-triggered after interview Proceed to Pre-Hire decision",
      metadata: {
        interviewId,
        triggered,
        skipped,
        requestIds,
      },
    });
  }

  // ── Candidate Notification — Ticket 29 ──────────────────────────────────────
  // Create an in-app notification record with next-step instructions for the candidate.
  // This is idempotent: if a notification already exists for this application's
  // pre-hire workflow, we skip creation.

  let notificationId: string | null = null;
  let candidateNotifiedAt: Date | null = null;

  const existingNotif = await db
    .select({ id: recruitingCandidateNotifications.id, sentAt: recruitingCandidateNotifications.sentAt })
    .from(recruitingCandidateNotifications)
    .where(eq(recruitingCandidateNotifications.applicationId, applicationId))
    .limit(1);

  if (existingNotif.length === 0 && triggered.length > 0) {
    const allScreenings = [...triggered, ...skipped];
    const body = buildPreHireNotificationBody(candidateFirstName, allScreenings);
    const [notifInserted] = await db
      .insert(recruitingCandidateNotifications)
      .values({
        applicationId,
        notificationType: "pre_hire_instructions",
        channel: "in_app",
        status: "sent",
        subject: "Your Application Has Advanced — Next Steps for Pre-Hire Screening",
        body,
        screeningsTriggered: allScreenings,
        triggerSource: "interview_decision",
        triggerSourceId: interviewId,
        triggeredBy: triggeredByUserId,
        sentAt: now,
      })
      .returning({ id: recruitingCandidateNotifications.id, sentAt: recruitingCandidateNotifications.sentAt });
    if (notifInserted) {
      notificationId = notifInserted.id;
      candidateNotifiedAt = notifInserted.sentAt;
      console.log(`[ScreeningTrigger] Candidate notification created: ${notificationId}`);
    }
  } else if (existingNotif.length > 0) {
    notificationId = existingNotif[0].id;
    candidateNotifiedAt = existingNotif[0].sentAt;
  }

  return { triggered, skipped, requestIds, notificationId, candidateNotifiedAt };
}

// ── Notification body builder ──────────────────────────────────────────────

function buildPreHireNotificationBody(firstName: string, screenings: string[]): string {
  const screeningLines = screenings.map((s) => {
    const label = SCREENING_TYPE_LABELS[s as ScreeningType] ?? s;
    const instructions = SCREENING_TYPE_INSTRUCTIONS[s as ScreeningType] ??
      "Additional information will be provided by your recruiter.";
    return `• ${label}: ${instructions}`;
  });

  return `Hi ${firstName},

Great news — your interview went well and your application has advanced to the Pre-Hire Screening stage!

The following screenings have been initiated on your behalf:

${screeningLines.join("\n")}

Important:
- All three screenings must complete with satisfactory results before we can extend an offer.
- Please respond promptly to any requests from our screening providers.
- Drug test scheduling is time-sensitive — please complete within 48 hours of receiving instructions.

We will keep you updated as each screening clears. If you have any questions, please reach out to your recruiter directly.

Thank you for your patience — we look forward to moving forward with your candidacy.`;
}

export const SCREENING_TYPE_LABELS: Record<ScreeningType, string> = {
  mvr: "MVR Check",
  background_check: "Background Check",
  drug_test: "Drug Test",
};

export const SCREENING_TYPE_DESCRIPTIONS: Record<ScreeningType, string> = {
  mvr: "Motor Vehicle Record — verifies driving history, violations, license validity.",
  background_check: "Standard background check — criminal history, identity verification.",
  drug_test: "Pre-employment drug screening — 5-panel or 10-panel per company policy.",
};

export const SCREENING_TYPE_INSTRUCTIONS: Record<ScreeningType, string> = {
  mvr: "Your motor vehicle record will be pulled automatically. No action is needed from you at this time.",
  background_check: "You will receive a separate communication from our background check provider within 1–2 business days. Please complete any required forms promptly.",
  drug_test: "Please schedule your drug test within 48 hours. Your recruiter will provide the nearest testing location and authorization code.",
};
