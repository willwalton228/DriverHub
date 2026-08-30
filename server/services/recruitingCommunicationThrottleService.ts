import { db } from '../db';
import {
  recruitingCommunicationThrottleRules,
  recruitingCommunicationThrottleEvents,
  recruitingCommunications,
  recruitingAuditEvents,
  type RecruitingCommunicationThrottleRule,
  type InsertRecruitingCommunicationThrottleRule,
} from '@shared/schema';
import { eq, and, desc, gte, count } from 'drizzle-orm';

export interface ThrottleCheckResult {
  allowed: boolean;
  blockedReason?: 'daily_limit' | 'cooldown';
  nextAllowedAt?: Date;
  dailyCount?: number;
  maxPerDay?: number;
  cooldownMinutes?: number;
  ruleId?: string;
}

export async function getThrottleRules(): Promise<RecruitingCommunicationThrottleRule[]> {
  return db.select()
    .from(recruitingCommunicationThrottleRules)
    .orderBy(desc(recruitingCommunicationThrottleRules.createdAt));
}

export async function getActiveThrottleRule(channel: string): Promise<RecruitingCommunicationThrottleRule | null> {
  const [rule] = await db.select()
    .from(recruitingCommunicationThrottleRules)
    .where(and(
      eq(recruitingCommunicationThrottleRules.channel, channel),
      eq(recruitingCommunicationThrottleRules.isActive, true),
    ))
    .limit(1);
  return rule || null;
}

export async function createThrottleRule(
  data: InsertRecruitingCommunicationThrottleRule,
  userId: string,
  userEmail: string | null
): Promise<RecruitingCommunicationThrottleRule> {
  const [rule] = await db.insert(recruitingCommunicationThrottleRules).values({
    ...data,
    createdBy: userId,
  }).returning();

  await db.insert(recruitingAuditEvents).values({
    actionType: "THROTTLE_RULE_CREATED",
    entityType: "throttle_rule",
    entityId: rule.id,
    userId,
    userEmail,
    source: "ui",
    newValue: JSON.stringify({ channel: rule.channel, maxPerDay: rule.maxPerDay, cooldownMinutes: rule.cooldownMinutes }),
  });

  return rule;
}

export async function updateThrottleRule(
  ruleId: string,
  data: Partial<InsertRecruitingCommunicationThrottleRule>,
  userId: string,
  userEmail: string | null
): Promise<RecruitingCommunicationThrottleRule | null> {
  const [rule] = await db.update(recruitingCommunicationThrottleRules)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(recruitingCommunicationThrottleRules.id, ruleId))
    .returning();

  if (rule) {
    await db.insert(recruitingAuditEvents).values({
      actionType: "THROTTLE_RULE_UPDATED",
      entityType: "throttle_rule",
      entityId: rule.id,
      userId,
      userEmail,
      source: "ui",
      newValue: JSON.stringify(data),
    });
  }

  return rule || null;
}

export async function deleteThrottleRule(
  ruleId: string,
  userId: string,
  userEmail: string | null
): Promise<boolean> {
  const [rule] = await db.delete(recruitingCommunicationThrottleRules)
    .where(eq(recruitingCommunicationThrottleRules.id, ruleId))
    .returning();

  if (rule) {
    await db.insert(recruitingAuditEvents).values({
      actionType: "THROTTLE_RULE_DELETED",
      entityType: "throttle_rule",
      entityId: ruleId,
      userId,
      userEmail,
      source: "ui",
      newValue: JSON.stringify({ channel: rule.channel }),
    });
  }

  return !!rule;
}

export async function checkThrottle(
  candidateId: string,
  channel: string,
  isAutomated: boolean = false
): Promise<ThrottleCheckResult> {
  const rule = await getActiveThrottleRule(channel);
  if (!rule) {
    return { allowed: true };
  }

  if (isAutomated && !rule.appliesToAutomated) {
    return { allowed: true };
  }

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const [dailyResult] = await db.select({ count: count() })
    .from(recruitingCommunications)
    .where(and(
      eq(recruitingCommunications.candidateId, candidateId),
      eq(recruitingCommunications.type, channel),
      eq(recruitingCommunications.direction, 'outbound'),
      gte(recruitingCommunications.createdAt, startOfDay),
    ));

  const dailyCount = dailyResult?.count || 0;

  if (dailyCount >= rule.maxPerDay) {
    const tomorrow = new Date(startOfDay);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return {
      allowed: false,
      blockedReason: 'daily_limit',
      nextAllowedAt: tomorrow,
      dailyCount,
      maxPerDay: rule.maxPerDay,
      ruleId: rule.id,
    };
  }

  const [lastMessage] = await db.select()
    .from(recruitingCommunications)
    .where(and(
      eq(recruitingCommunications.candidateId, candidateId),
      eq(recruitingCommunications.type, channel),
      eq(recruitingCommunications.direction, 'outbound'),
    ))
    .orderBy(desc(recruitingCommunications.createdAt))
    .limit(1);

  if (lastMessage?.createdAt && rule.cooldownMinutes > 0) {
    const cooldownEnd = new Date(new Date(lastMessage.createdAt).getTime() + rule.cooldownMinutes * 60 * 1000);
    if (now < cooldownEnd) {
      return {
        allowed: false,
        blockedReason: 'cooldown',
        nextAllowedAt: cooldownEnd,
        dailyCount,
        cooldownMinutes: rule.cooldownMinutes,
        ruleId: rule.id,
      };
    }
  }

  return { allowed: true, dailyCount, maxPerDay: rule.maxPerDay };
}

export async function recordThrottleEvent(
  candidateId: string,
  applicationId: string | null,
  channel: string,
  eventType: 'blocked' | 'override',
  reason: 'daily_limit' | 'cooldown',
  actorId: string,
  actorEmail: string | null,
  ruleId: string | null,
  dailyCount: number | null,
  nextAllowedAt: Date | null,
  overrideJustification?: string
): Promise<void> {
  await db.insert(recruitingCommunicationThrottleEvents).values({
    candidateId,
    applicationId,
    channel,
    eventType,
    reason,
    ruleId,
    actorId,
    dailyCount,
    nextAllowedAt,
    overrideJustification: overrideJustification || null,
  });

  const auditAction = eventType === 'blocked' ? 'THROTTLE_BLOCKED' : 'THROTTLE_OVERRIDE';
  await db.insert(recruitingAuditEvents).values({
    actionType: auditAction,
    entityType: "candidate",
    entityId: candidateId,
    userId: actorId,
    userEmail: actorEmail,
    source: "system",
    newValue: JSON.stringify({
      channel,
      reason,
      eventType,
      dailyCount,
      nextAllowedAt: nextAllowedAt?.toISOString(),
      overrideJustification,
      applicationId,
    }),
  });
}

export async function getThrottleEvents(options?: {
  candidateId?: string;
  channel?: string;
  eventType?: string;
  limit?: number;
}) {
  const conditions = [];
  if (options?.candidateId) {
    conditions.push(eq(recruitingCommunicationThrottleEvents.candidateId, options.candidateId));
  }
  if (options?.channel) {
    conditions.push(eq(recruitingCommunicationThrottleEvents.channel, options.channel));
  }
  if (options?.eventType) {
    conditions.push(eq(recruitingCommunicationThrottleEvents.eventType, options.eventType));
  }

  const query = db.select()
    .from(recruitingCommunicationThrottleEvents)
    .orderBy(desc(recruitingCommunicationThrottleEvents.createdAt))
    .limit(options?.limit || 100);

  if (conditions.length > 0) {
    return query.where(and(...conditions));
  }
  return query;
}

export async function getThrottleStatus(candidateId: string): Promise<{
  sms: ThrottleCheckResult;
  email: ThrottleCheckResult;
}> {
  const [smsResult, emailResult] = await Promise.all([
    checkThrottle(candidateId, 'sms'),
    checkThrottle(candidateId, 'email'),
  ]);
  return { sms: smsResult, email: emailResult };
}
