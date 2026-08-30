import { db } from "../db";
import {
  recruitingNudgeRules,
  recruitingNudgeLog,
  recruitingApplications,
  recruitingCandidates,
  recruitingCommunications,
  recruitingAuditEvents,
  recruitingConsents,
  type RecruitingNudgeRule,
  type RecruitingNudgeLog,
} from "@shared/schema";
import { eq, and, desc, sql, inArray, isNull, count } from "drizzle-orm";

interface NudgeScanResult {
  processed: number;
  sent: number;
  suppressed: number;
  errors: number;
  details: Array<{
    applicationId: string;
    ruleId: string;
    status: "sent" | "suppressed" | "error";
    reason?: string;
    channel?: string;
  }>;
}

export async function getActiveNudgeRules(): Promise<RecruitingNudgeRule[]> {
  return db.query.recruitingNudgeRules.findMany({
    where: eq(recruitingNudgeRules.isActive, true),
  });
}

export async function getNudgeRules(): Promise<RecruitingNudgeRule[]> {
  return db.query.recruitingNudgeRules.findMany({
    orderBy: [desc(recruitingNudgeRules.createdAt)],
  });
}

export async function getNudgeRuleById(id: string): Promise<RecruitingNudgeRule | undefined> {
  return db.query.recruitingNudgeRules.findFirst({
    where: eq(recruitingNudgeRules.id, id),
  });
}

export async function createNudgeRule(data: Omit<RecruitingNudgeRule, "id" | "createdAt" | "updatedAt">): Promise<RecruitingNudgeRule> {
  const [rule] = await db.insert(recruitingNudgeRules).values(data).returning();
  return rule;
}

export async function updateNudgeRule(id: string, data: Partial<RecruitingNudgeRule>): Promise<RecruitingNudgeRule> {
  const [rule] = await db.update(recruitingNudgeRules)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(recruitingNudgeRules.id, id))
    .returning();
  return rule;
}

export async function deleteNudgeRule(id: string): Promise<void> {
  await db.delete(recruitingNudgeRules).where(eq(recruitingNudgeRules.id, id));
}

export async function getNudgeHistory(applicationId: string): Promise<RecruitingNudgeLog[]> {
  return db.query.recruitingNudgeLog.findMany({
    where: eq(recruitingNudgeLog.applicationId, applicationId),
    orderBy: [desc(recruitingNudgeLog.sentAt)],
  });
}

export async function getNudgeHistoryByCandidate(candidateId: string): Promise<RecruitingNudgeLog[]> {
  return db.query.recruitingNudgeLog.findMany({
    where: eq(recruitingNudgeLog.candidateId, candidateId),
    orderBy: [desc(recruitingNudgeLog.sentAt)],
  });
}

async function hasConsentForChannel(candidateId: string, channel: string): Promise<boolean> {
  if (channel === "email") {
    const consent = await db.query.recruitingConsents.findFirst({
      where: and(
        eq(recruitingConsents.candidateId, candidateId),
        eq(recruitingConsents.consentType, "email_opt_in"),
        eq(recruitingConsents.accepted, true),
        isNull(recruitingConsents.revokedAt),
      ),
      columns: { id: true, accepted: true },
      orderBy: [desc(recruitingConsents.acceptedAt)],
    });
    return !!consent;
  }
  if (channel === "sms") {
    const consent = await db.query.recruitingConsents.findFirst({
      where: and(
        eq(recruitingConsents.candidateId, candidateId),
        eq(recruitingConsents.consentType, "sms_opt_in"),
        eq(recruitingConsents.accepted, true),
        isNull(recruitingConsents.revokedAt),
      ),
      columns: { id: true, accepted: true },
      orderBy: [desc(recruitingConsents.acceptedAt)],
    });
    if (consent) return true;
    return false;
  }
  return false;
}

function isWithinContactHours(
  contactHoursStart: string | null,
  contactHoursEnd: string | null,
  contactTimezone: string | null,
): boolean {
  if (!contactHoursStart || !contactHoursEnd) return true;
  const tz = contactTimezone || "America/Chicago";
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === "hour")?.value || "12");
    const minute = parseInt(parts.find(p => p.type === "minute")?.value || "0");
    const nowMinutes = hour * 60 + minute;

    const [startH, startM] = contactHoursStart.split(":").map(Number);
    const [endH, endM] = contactHoursEnd.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  } catch {
    return true;
  }
}

async function getNudgeCountForStage(applicationId: string, stage: string, ruleType: string): Promise<number> {
  const result = await db.select({ count: count() })
    .from(recruitingNudgeLog)
    .where(and(
      eq(recruitingNudgeLog.applicationId, applicationId),
      eq(recruitingNudgeLog.stage, stage),
      eq(recruitingNudgeLog.ruleType, ruleType),
      eq(recruitingNudgeLog.status, "sent"),
    ));
  return result[0]?.count ?? 0;
}

async function getLastNudgeTime(applicationId: string, ruleType: string): Promise<Date | null> {
  const last = await db.query.recruitingNudgeLog.findFirst({
    where: and(
      eq(recruitingNudgeLog.applicationId, applicationId),
      eq(recruitingNudgeLog.ruleType, ruleType),
      eq(recruitingNudgeLog.status, "sent"),
    ),
    orderBy: [desc(recruitingNudgeLog.sentAt)],
    columns: { sentAt: true },
  });
  return last?.sentAt ?? null;
}

function hoursAgo(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60);
}

async function evaluateRuleForApplication(
  rule: RecruitingNudgeRule,
  app: {
    id: string;
    candidateId: string;
    currentStage: string;
    currentStageEnteredAt: Date;
    lastResponseAt: Date | null;
    requisitionId: string | null;
  },
): Promise<{ eligible: boolean; reason?: string }> {
  if (rule.applicableStages && rule.applicableStages.length > 0) {
    if (!rule.applicableStages.includes(app.currentStage)) {
      return { eligible: false, reason: "stage_not_applicable" };
    }
  }

  const nudgeCount = await getNudgeCountForStage(app.id, app.currentStage, rule.ruleType);
  if (nudgeCount >= rule.maxNudgesPerStage) {
    return { eligible: false, reason: "max_nudges_reached" };
  }

  const lastNudge = await getLastNudgeTime(app.id, rule.ruleType);
  if (lastNudge) {
    const hoursSinceLast = hoursAgo(lastNudge);
    if (hoursSinceLast < rule.cooldownHours) {
      return { eligible: false, reason: "cooldown_active" };
    }
  }

  if (app.lastResponseAt) {
    const hoursSinceResponse = hoursAgo(app.lastResponseAt);
    if (hoursSinceResponse < rule.triggerAfterHours) {
      return { eligible: false, reason: "recent_response" };
    }
  }

  const hoursSinceStageEntry = hoursAgo(app.currentStageEnteredAt);

  switch (rule.ruleType) {
    case "no_response": {
      if (hoursSinceStageEntry < rule.triggerAfterHours) {
        return { eligible: false, reason: "too_early" };
      }
      if (app.lastResponseAt && hoursAgo(app.lastResponseAt) < rule.triggerAfterHours) {
        return { eligible: false, reason: "recent_activity" };
      }
      return { eligible: true };
    }
    case "docs_pending": {
      if (hoursSinceStageEntry < rule.triggerAfterHours) {
        return { eligible: false, reason: "too_early" };
      }
      return { eligible: true };
    }
    case "interview_unconfirmed": {
      if (hoursSinceStageEntry < rule.triggerAfterHours) {
        return { eligible: false, reason: "too_early" };
      }
      return { eligible: true };
    }
    default:
      return { eligible: false, reason: "unknown_rule_type" };
  }
}

async function sendNudge(
  rule: RecruitingNudgeRule,
  app: { id: string; candidateId: string; currentStage: string },
  candidate: { id: string; email: string; phone: string | null; firstName: string; lastName: string },
  channel: string,
  sequenceNumber: number,
): Promise<{ communicationId: string | null }> {
  const subject = rule.emailSubjectTemplate
    ? rule.emailSubjectTemplate
      .replace("{{firstName}}", candidate.firstName)
      .replace("{{lastName}}", candidate.lastName)
    : `Follow-up: ${rule.name}`;

  const body = (channel === "email" ? rule.emailBodyTemplate : rule.smsTemplate)
    ? (channel === "email" ? rule.emailBodyTemplate! : rule.smsTemplate!)
      .replace("{{firstName}}", candidate.firstName)
      .replace("{{lastName}}", candidate.lastName)
    : `Hi ${candidate.firstName}, this is an automated follow-up regarding your application.`;

  const [comm] = await db.insert(recruitingCommunications).values({
    candidateId: candidate.id,
    applicationId: app.id,
    type: channel,
    direction: "outbound",
    subject: channel === "email" ? subject : null,
    content: body,
    isAutomated: true,
    sentAt: new Date(),
    ...(channel === "email" ? { toEmail: candidate.email } : {}),
    ...(channel === "sms" && candidate.phone ? { toNumber: candidate.phone } : {}),
  }).returning();

  return { communicationId: comm?.id ?? null };
}

export async function runNudgeScan(): Promise<NudgeScanResult> {
  const result: NudgeScanResult = {
    processed: 0,
    sent: 0,
    suppressed: 0,
    errors: 0,
    details: [],
  };

  const { isKillSwitchActive, KILL_SWITCH_KEYS } = await import("./recruitingKillSwitch");
  const outboundKilled = await isKillSwitchActive(KILL_SWITCH_KEYS.OUTBOUND_COMMS);
  if (outboundKilled) {
    console.log("[NudgeEngine] Outbound communications kill switch is ACTIVE - skipping scan");
    return result;
  }

  const activeRules = await getActiveNudgeRules();
  if (activeRules.length === 0) {
    console.log("[NudgeEngine] No active nudge rules found");
    return result;
  }

  const terminalStages = ["hired", "rejected", "withdrawn", "archived"];
  const eligibleApps = await db.query.recruitingApplications.findMany({
    where: and(
      eq(recruitingApplications.isArchived, false),
      sql`${recruitingApplications.currentStage} NOT IN (${sql.join(terminalStages.map(s => sql`${s}`), sql`,`)})`,
    ),
    columns: {
      id: true,
      candidateId: true,
      currentStage: true,
      currentStageEnteredAt: true,
      lastResponseAt: true,
      requisitionId: true,
    },
  });

  console.log(`[NudgeEngine] Scanning ${eligibleApps.length} applications against ${activeRules.length} rules`);

  for (const app of eligibleApps) {
    for (const rule of activeRules) {
      result.processed++;
      try {
        const candidate = await db.query.recruitingCandidates.findFirst({
          where: eq(recruitingCandidates.id, app.candidateId),
          columns: {
            id: true,
            email: true,
            phone: true,
            firstName: true,
            lastName: true,
            doNotContact: true,
            contactHoursStart: true,
            contactHoursEnd: true,
            contactTimezone: true,
          },
        });

        if (!candidate) {
          result.details.push({ applicationId: app.id, ruleId: rule.id, status: "suppressed", reason: "candidate_not_found" });
          result.suppressed++;
          continue;
        }

        if (candidate.doNotContact) {
          await logNudge(app, rule, "suppressed", "do_not_contact");
          result.details.push({ applicationId: app.id, ruleId: rule.id, status: "suppressed", reason: "do_not_contact" });
          result.suppressed++;
          continue;
        }

        if (!isWithinContactHours(candidate.contactHoursStart, candidate.contactHoursEnd, candidate.contactTimezone)) {
          result.details.push({ applicationId: app.id, ruleId: rule.id, status: "suppressed", reason: "outside_contact_hours" });
          result.suppressed++;
          continue;
        }

        const evaluation = await evaluateRuleForApplication(rule, app as any);
        if (!evaluation.eligible) {
          result.details.push({ applicationId: app.id, ruleId: rule.id, status: "suppressed", reason: evaluation.reason });
          result.suppressed++;
          continue;
        }

        const channels = (rule.channels as string[]) || ["email"];
        let nudgeSent = false;

        for (const channel of channels) {
          const hasConsent = await hasConsentForChannel(candidate.id, channel);
          if (!hasConsent) {
            continue;
          }

          if (channel === "sms" && !candidate.phone) {
            continue;
          }

          const nudgeCount = await getNudgeCountForStage(app.id, app.currentStage, rule.ruleType);
          const sequenceNumber = nudgeCount + 1;

          const { communicationId } = await sendNudge(
            rule,
            app,
            candidate,
            channel,
            sequenceNumber,
          );

          await logNudge(app, rule, "sent", undefined, channel, communicationId, sequenceNumber);

          await db.insert(recruitingAuditEvents).values({
            actionType: "nudge_sent",
            entityType: "application",
            entityId: app.id,
            userId: null,
            userEmail: null,
            newValue: JSON.stringify({
              ruleId: rule.id,
              ruleName: rule.name,
              ruleType: rule.ruleType,
              channel,
              sequenceNumber,
              candidateId: candidate.id,
            }),
            changedFields: null,
            reason: `Auto-nudge: ${rule.name} (${rule.ruleType}) - sequence #${sequenceNumber}`,
          });

          result.sent++;
          result.details.push({ applicationId: app.id, ruleId: rule.id, status: "sent", channel });
          nudgeSent = true;
          break;
        }

        if (!nudgeSent) {
          await logNudge(app, rule, "suppressed", "no_consented_channel");
          result.details.push({ applicationId: app.id, ruleId: rule.id, status: "suppressed", reason: "no_consented_channel" });
          result.suppressed++;
        }
      } catch (error) {
        console.error(`[NudgeEngine] Error processing app ${app.id} with rule ${rule.id}:`, error);
        result.errors++;
        result.details.push({ applicationId: app.id, ruleId: rule.id, status: "error", reason: String(error) });
      }
    }
  }

  console.log(`[NudgeEngine] Scan complete: ${result.sent} sent, ${result.suppressed} suppressed, ${result.errors} errors`);
  return result;
}

async function logNudge(
  app: { id: string; candidateId: string; currentStage: string },
  rule: RecruitingNudgeRule,
  status: string,
  suppressedReason?: string,
  channel?: string,
  communicationId?: string | null,
  sequenceNumber?: number,
): Promise<void> {
  await db.insert(recruitingNudgeLog).values({
    applicationId: app.id,
    candidateId: app.candidateId,
    ruleId: rule.id,
    ruleType: rule.ruleType,
    stage: app.currentStage,
    sequenceNumber: sequenceNumber ?? 0,
    channel: channel ?? "none",
    communicationId: communicationId ?? undefined,
    status,
    suppressedReason: suppressedReason ?? undefined,
  });
}
