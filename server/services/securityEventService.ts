import { eq, and, desc, gte, lte, sql, count, lt, or } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  securityEvents,
  securityAlerts,
  type SecurityEvent,
  type SecurityRiskLevel,
} from "@shared/schema";

// ── Scoring constants ──────────────────────────────────────────────────────────
const SCORE_DELTAS: Record<string, number> = {
  MFA_CODE_VERIFIED_FAILED: 2,
  MFA_LOCKOUT_TRIGGERED: 10,
  MFA_RESENT: 3,
};

const DECAY_PER_DAY = 5;

const RISK_THRESHOLDS: { level: SecurityRiskLevel; min: number }[] = [
  { level: "CRITICAL", min: 50 },
  { level: "HIGH", min: 25 },
  { level: "MODERATE", min: 10 },
  { level: "LOW", min: 0 },
];

// ── Alert thresholds ──────────────────────────────────────────────────────────
const ALERT_THRESHOLD_FAILED_PER_USER_30MIN = 10;
const ALERT_THRESHOLD_LOCKOUTS_PER_USER_24H = 3;
const ALERT_THRESHOLD_LOCKOUTS_SYSTEM_1H = 5;
const ALERT_THRESHOLD_RESENDS_SYSTEM_1H = 20;

function computeRiskLevel(score: number): SecurityRiskLevel {
  for (const { level, min } of RISK_THRESHOLDS) {
    if (score >= min) return level;
  }
  return "LOW";
}

// ── Core log function ─────────────────────────────────────────────────────────
export interface LogSecurityEventInput {
  userId?: string | null;
  roleClass?: string | null;
  permissionRiskLevel?: "low" | "high";
  eventType: string;
  ipAddress?: string | null;
  deviceFingerprint?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logSecurityEvent(input: LogSecurityEventInput): Promise<void> {
  try {
    await db.insert(securityEvents).values({
      userId: input.userId || null,
      roleClass: input.roleClass || null,
      permissionRiskLevel: input.permissionRiskLevel || "low",
      eventType: input.eventType,
      ipAddress: input.ipAddress || null,
      deviceFingerprint: input.deviceFingerprint || null,
      metadataJson: input.metadata || null,
    });

    // Apply score delta (non-blocking, never throws)
    if (input.userId && SCORE_DELTAS[input.eventType]) {
      applyRiskScoreDelta(input.userId, SCORE_DELTAS[input.eventType]).catch((err) =>
        console.error("[Security] Risk score update failed:", err)
      );
    }

    // Check alert thresholds (non-blocking)
    if (input.userId && (
      input.eventType === "MFA_CODE_VERIFIED_FAILED" ||
      input.eventType === "MFA_LOCKOUT_TRIGGERED"
    )) {
      checkAlertThresholds(input.userId, input.eventType, input.ipAddress || null).catch((err) =>
        console.error("[Security] Alert threshold check failed:", err)
      );
    }
    if (input.eventType === "MFA_LOCKOUT_TRIGGERED" || input.eventType === "MFA_RESENT") {
      checkSystemAlertThresholds(input.eventType, input.ipAddress || null, input.userId || null).catch((err) =>
        console.error("[Security] System alert check failed:", err)
      );
    }
  } catch (err) {
    console.error("[Security] Failed to log security event:", err);
  }
}

// ── Risk score management ─────────────────────────────────────────────────────
export async function applyRiskScoreDelta(userId: string, delta: number): Promise<void> {
  const [user] = await db.select({
    securityRiskScore: users.securityRiskScore,
    securityRiskLevel: users.securityRiskLevel,
  }).from(users).where(eq(users.id, userId)).limit(1);

  if (!user) return;

  const newScore = Math.max(0, (user.securityRiskScore ?? 0) + delta);
  const newLevel = computeRiskLevel(newScore);
  const prevLevel = user.securityRiskLevel as SecurityRiskLevel;

  await db.update(users).set({
    securityRiskScore: newScore,
    securityRiskLevel: newLevel,
    securityRiskLastUpdatedAt: new Date(),
  }).where(eq(users.id, userId));

  // Escalation: HIGH → force MFA next login (already handled by mfaRequired)
  // Escalation: CRITICAL → suspend login + alert Super Admin
  if (prevLevel !== "CRITICAL" && newLevel === "CRITICAL") {
    // Suspend for 1 hour, then require manual unlock
    const suspendedUntil = new Date(Date.now() + 60 * 60 * 1000);
    await db.update(users).set({ securitySuspendedUntil: suspendedUntil }).where(eq(users.id, userId));

    await logSecurityEvent({
      userId,
      eventType: "SECURITY_SUSPENDED",
      metadata: { reason: "CRITICAL risk score threshold reached", score: newScore, suspendedUntil },
    });

    await createSecurityAlert({
      alertType: "CRITICAL_RISK_USER_SUSPENDED",
      severity: "critical",
      title: "User Account Suspended — Critical Risk Score",
      body: `User ${userId} has reached a CRITICAL security risk score (${newScore}). Login has been temporarily suspended until ${suspendedUntil.toISOString()}. Manual unlock required.`,
      triggerPayload: { userId, score: newScore, suspendedUntil },
    });
  }

  // If score crosses HIGH (25+), log escalation
  if (newLevel === "HIGH" && computeRiskLevel(newScore - delta) === "MODERATE") {
    await logSecurityEvent({
      userId,
      eventType: "RISK_SCORE_ESCALATED",
      metadata: { from: "MODERATE", to: "HIGH", score: newScore },
    });
  }
}

// ── Daily decay (run by scheduler) ───────────────────────────────────────────
export async function runRiskScoreDecay(): Promise<{ decayed: number }> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const result = await db.execute(sql`
    UPDATE users
    SET
      security_risk_score = GREATEST(0, security_risk_score - ${DECAY_PER_DAY}),
      security_risk_level = CASE
        WHEN GREATEST(0, security_risk_score - ${DECAY_PER_DAY}) >= 50 THEN 'CRITICAL'
        WHEN GREATEST(0, security_risk_score - ${DECAY_PER_DAY}) >= 25 THEN 'HIGH'
        WHEN GREATEST(0, security_risk_score - ${DECAY_PER_DAY}) >= 10 THEN 'MODERATE'
        ELSE 'LOW'
      END,
      security_risk_last_updated_at = NOW()
    WHERE
      security_risk_score > 0
      AND (security_risk_last_updated_at IS NULL OR security_risk_last_updated_at < ${cutoff.toISOString()})
  `);

  const decayed = (result as any).rowCount ?? 0;
  if (decayed > 0) {
    console.log(`[Security] Risk score decay applied to ${decayed} users`);
  }
  return { decayed };
}

// ── Alert helpers ─────────────────────────────────────────────────────────────
async function createSecurityAlert(params: {
  alertType: string;
  severity: string;
  title: string;
  body: string;
  triggerPayload?: unknown;
}): Promise<void> {
  // Deduplicate: don't create the same alert type for same user in last 30 min
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  const [existing] = await db
    .select({ id: securityAlerts.id })
    .from(securityAlerts)
    .where(
      and(
        eq(securityAlerts.alertType, params.alertType),
        gte(securityAlerts.createdAt, cutoff),
        eq(securityAlerts.isAcknowledged, false)
      )
    )
    .limit(1);

  if (existing) return;

  await db.insert(securityAlerts).values({
    alertType: params.alertType,
    severity: params.severity,
    title: params.title,
    body: params.body,
    triggerPayload: params.triggerPayload as any,
  });
}

async function checkAlertThresholds(userId: string, eventType: string, ipAddress: string | null): Promise<void> {
  const now = new Date();

  if (eventType === "MFA_CODE_VERIFIED_FAILED") {
    const cutoff30m = new Date(now.getTime() - 30 * 60 * 1000);
    const [failCount] = await db
      .select({ count: count() })
      .from(securityEvents)
      .where(
        and(
          eq(securityEvents.userId, userId),
          eq(securityEvents.eventType, "MFA_CODE_VERIFIED_FAILED"),
          gte(securityEvents.ts, cutoff30m)
        )
      );

    if ((failCount?.count ?? 0) >= ALERT_THRESHOLD_FAILED_PER_USER_30MIN) {
      await createSecurityAlert({
        alertType: `FAILED_MFA_PER_USER_${userId}`,
        severity: "warning",
        title: "High Failed 2FA Attempts — Single User",
        body: `User ${userId} has failed ${failCount.count} 2FA verifications in the last 30 minutes${ipAddress ? ` from IP ${ipAddress}` : ""}.`,
        triggerPayload: { userId, count: failCount.count, windowMinutes: 30, ipAddress },
      });
    }
  }

  if (eventType === "MFA_LOCKOUT_TRIGGERED") {
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const [lockoutCount] = await db
      .select({ count: count() })
      .from(securityEvents)
      .where(
        and(
          eq(securityEvents.userId, userId),
          eq(securityEvents.eventType, "MFA_LOCKOUT_TRIGGERED"),
          gte(securityEvents.ts, cutoff24h)
        )
      );

    if ((lockoutCount?.count ?? 0) >= ALERT_THRESHOLD_LOCKOUTS_PER_USER_24H) {
      await createSecurityAlert({
        alertType: `REPEAT_LOCKOUT_PER_USER_${userId}`,
        severity: "high",
        title: "Repeated Account Lockouts — Single User",
        body: `User ${userId} has been locked out ${lockoutCount.count} times in the last 24 hours.`,
        triggerPayload: { userId, count: lockoutCount.count, windowHours: 24 },
      });
    }
  }
}

async function checkSystemAlertThresholds(eventType: string, ipAddress: string | null, userId: string | null): Promise<void> {
  const now = new Date();

  if (eventType === "MFA_LOCKOUT_TRIGGERED") {
    const cutoff1h = new Date(now.getTime() - 60 * 60 * 1000);
    const [sysLockouts] = await db
      .select({ count: count() })
      .from(securityEvents)
      .where(
        and(
          eq(securityEvents.eventType, "MFA_LOCKOUT_TRIGGERED"),
          gte(securityEvents.ts, cutoff1h)
        )
      );

    if ((sysLockouts?.count ?? 0) >= ALERT_THRESHOLD_LOCKOUTS_SYSTEM_1H) {
      await createSecurityAlert({
        alertType: "SYSTEM_LOCKOUT_SPIKE",
        severity: "critical",
        title: "System-Wide 2FA Lockout Spike",
        body: `${sysLockouts.count} accounts have been locked out in the last hour. This may indicate a credential-stuffing or brute-force attack.`,
        triggerPayload: { count: sysLockouts.count, windowHours: 1 },
      });
    }

    // Same IP failing for multiple users
    if (ipAddress) {
      const cutoff1h2 = new Date(now.getTime() - 60 * 60 * 1000);
      const [ipLockouts] = await db
        .select({ count: count() })
        .from(securityEvents)
        .where(
          and(
            eq(securityEvents.eventType, "MFA_LOCKOUT_TRIGGERED"),
            eq(securityEvents.ipAddress, ipAddress),
            gte(securityEvents.ts, cutoff1h2)
          )
        );

      if ((ipLockouts?.count ?? 0) >= 3) {
        await createSecurityAlert({
          alertType: `LOCKOUT_FROM_IP_${ipAddress?.replace(/\./g, "_")}`,
          severity: "high",
          title: "Multiple Lockouts from Single IP",
          body: `IP address ${ipAddress} has triggered ${ipLockouts.count} account lockouts in the last hour.`,
          triggerPayload: { ipAddress, count: ipLockouts.count, windowHours: 1 },
        });
      }
    }
  }

  if (eventType === "MFA_RESENT") {
    const cutoff1h = new Date(now.getTime() - 60 * 60 * 1000);
    const [resendCount] = await db
      .select({ count: count() })
      .from(securityEvents)
      .where(
        and(
          eq(securityEvents.eventType, "MFA_RESENT"),
          gte(securityEvents.ts, cutoff1h)
        )
      );

    if ((resendCount?.count ?? 0) >= ALERT_THRESHOLD_RESENDS_SYSTEM_1H) {
      await createSecurityAlert({
        alertType: "SYSTEM_RESEND_SPIKE",
        severity: "warning",
        title: "Unusual Volume of 2FA Resend Requests",
        body: `${resendCount.count} 2FA resend requests have been made system-wide in the last hour.`,
        triggerPayload: { count: resendCount.count, windowHours: 1 },
      });
    }
  }
}

// ── Dashboard metrics ─────────────────────────────────────────────────────────
export type MetricPeriod = "daily" | "weekly" | "monthly";

export interface SecurityMetrics {
  period: MetricPeriod;
  from: string;
  to: string;
  totalChallengesSent: number;
  successfulVerifications: number;
  failedVerifications: number;
  resends: number;
  expiredCodes: number;
  lockouts: number;
  avgAttemptsPerSuccess: number;
  notRequired: number;
  frictionIndex: number;
  lockoutRate: number;
  expiryRate: number;
  byRoleClass: Record<string, number>;
  enrolledCount: number;
  requiredCount: number;
  enrollmentPct: number;
}

export async function getSecurityMetrics(period: MetricPeriod): Promise<SecurityMetrics> {
  const now = new Date();
  let from: Date;
  if (period === "daily") {
    from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  } else if (period === "weekly") {
    from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else {
    from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  const rows = await db
    .select({ eventType: securityEvents.eventType, roleClass: securityEvents.roleClass })
    .from(securityEvents)
    .where(gte(securityEvents.ts, from));

  let challengesSent = 0, successes = 0, failures = 0, resends = 0, expired = 0, lockouts = 0, notRequired = 0;
  const byRole: Record<string, number> = {};

  for (const row of rows) {
    const et = row.eventType;
    const rc = row.roleClass || "unknown";
    byRole[rc] = (byRole[rc] || 0) + 1;

    if (et === "MFA_CHALLENGE_SENT") challengesSent++;
    else if (et === "MFA_CODE_VERIFIED_SUCCESS") successes++;
    else if (et === "MFA_CODE_VERIFIED_FAILED") failures++;
    else if (et === "MFA_RESENT") resends++;
    else if (et === "MFA_CODE_EXPIRED") expired++;
    else if (et === "MFA_LOCKOUT_TRIGGERED") lockouts++;
    else if (et === "MFA_NOT_REQUIRED") notRequired++;
  }

  const frictionIndex = successes > 0 ? (failures + resends) / successes : 0;
  const lockoutRate = challengesSent > 0 ? lockouts / challengesSent : 0;
  const expiryRate = challengesSent > 0 ? expired / challengesSent : 0;
  const avgAttempts = successes > 0 ? (successes + failures) / successes : 0;

  // Enrollment stats
  const [enrolledRow] = await db
    .select({ count: count() })
    .from(users)
    .where(and(eq(users.mfaEnabled, true)));

  const [requiredRow] = await db
    .select({ count: count() })
    .from(users)
    .where(eq(users.mfaRequired, true));

  const enrolledCount = enrolledRow?.count ?? 0;
  const requiredCount = requiredRow?.count ?? 0;
  const enrollmentPct = requiredCount > 0 ? Math.round((enrolledCount / requiredCount) * 100) : 100;

  return {
    period,
    from: from.toISOString(),
    to: now.toISOString(),
    totalChallengesSent: challengesSent,
    successfulVerifications: successes,
    failedVerifications: failures,
    resends,
    expiredCodes: expired,
    lockouts,
    avgAttemptsPerSuccess: Math.round(avgAttempts * 100) / 100,
    notRequired,
    frictionIndex: Math.round(frictionIndex * 1000) / 1000,
    lockoutRate: Math.round(lockoutRate * 1000) / 1000,
    expiryRate: Math.round(expiryRate * 1000) / 1000,
    byRoleClass: byRole,
    enrolledCount,
    requiredCount,
    enrollmentPct,
  };
}

// ── Event listing ─────────────────────────────────────────────────────────────
export async function getSecurityEventList(opts: {
  userId?: string;
  eventType?: string;
  limit?: number;
  offset?: number;
}): Promise<{ events: SecurityEvent[]; total: number }> {
  const conditions = [];
  if (opts.userId) conditions.push(eq(securityEvents.userId, opts.userId));
  if (opts.eventType) conditions.push(eq(securityEvents.eventType, opts.eventType));

  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;

  const [events, [totalRow]] = await Promise.all([
    db.select().from(securityEvents)
      .where(conditions.length ? and(...conditions as any) : undefined)
      .orderBy(desc(securityEvents.ts))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(securityEvents)
      .where(conditions.length ? and(...conditions as any) : undefined),
  ]);

  return { events, total: totalRow?.count ?? 0 };
}

// ── User risk list ─────────────────────────────────────────────────────────────
export async function getUserRiskList(opts: {
  riskLevel?: string;
  limit?: number;
}): Promise<{ id: string; email: string | null; firstName: string | null; lastName: string | null; role: string | null; securityRiskScore: number; securityRiskLevel: string; securityRiskLastUpdatedAt: Date | null; securitySuspendedUntil: Date | null; mfaEnabled: boolean; mfaRequired: boolean }[]> {
  const conditions = [];
  if (opts.riskLevel) conditions.push(eq(users.securityRiskLevel, opts.riskLevel));

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      securityRiskScore: users.securityRiskScore,
      securityRiskLevel: users.securityRiskLevel,
      securityRiskLastUpdatedAt: users.securityRiskLastUpdatedAt,
      securitySuspendedUntil: users.securitySuspendedUntil,
      mfaEnabled: users.mfaEnabled,
      mfaRequired: users.mfaRequired,
    })
    .from(users)
    .where(conditions.length ? and(...conditions as any) : undefined)
    .orderBy(desc(users.securityRiskScore))
    .limit(opts.limit ?? 100);

  return rows;
}

// ── Alerts ─────────────────────────────────────────────────────────────────────
export async function getActiveAlerts(): Promise<typeof securityAlerts.$inferSelect[]> {
  return db
    .select()
    .from(securityAlerts)
    .where(eq(securityAlerts.isAcknowledged, false))
    .orderBy(desc(securityAlerts.createdAt))
    .limit(50);
}

export async function acknowledgeAlert(alertId: string, userId: string): Promise<void> {
  await db.update(securityAlerts).set({
    isAcknowledged: true,
    acknowledgedByUserId: userId,
    acknowledgedAt: new Date(),
  }).where(eq(securityAlerts.id, alertId));
}

// ── Manual unlock ─────────────────────────────────────────────────────────────
export async function unlockSuspendedUser(targetUserId: string, performedByUserId: string): Promise<void> {
  await db.update(users).set({
    securitySuspendedUntil: null,
    securityRiskScore: 0,
    securityRiskLevel: "LOW",
    securityRiskLastUpdatedAt: new Date(),
  }).where(eq(users.id, targetUserId));

  await logSecurityEvent({
    userId: targetUserId,
    eventType: "SECURITY_UNSUSPENDED",
    metadata: { unlockedBy: performedByUserId },
  });
}
