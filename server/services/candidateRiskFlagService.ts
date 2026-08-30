import { db } from "../db";
import { candidateRiskFlags, recruitingApplications, recruitingAuditEvents } from "@shared/schema";
import type { CandidateRiskFlag, RiskFlagType, RiskFlagSeverity } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";

const SEVERITY_ORDER: Record<string, number> = { high: 3, medium: 2, low: 1 };
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

function sortBySeverity(flags: CandidateRiskFlag[]): CandidateRiskFlag[] {
  return [...flags].sort((a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0));
}

interface RiskFlagResult {
  flagType: RiskFlagType;
  severity: RiskFlagSeverity;
  label: string;
  description: string;
  evidence: Record<string, any>;
}

export async function calculateRiskFlags(candidateId: string): Promise<RiskFlagResult[]> {
  const flags: RiskFlagResult[] = [];

  const applications = await db
    .select()
    .from(recruitingApplications)
    .where(eq(recruitingApplications.candidateId, candidateId));

  const noShowApps = applications.filter(app => app.noShowAt !== null);
  if (noShowApps.length > 0) {
    flags.push({
      flagType: "prior_no_show",
      severity: noShowApps.length >= 2 ? "high" : "medium",
      label: `No-Show (${noShowApps.length}x)`,
      description: `Candidate has ${noShowApps.length} prior no-show${noShowApps.length > 1 ? "s" : ""} on record.`,
      evidence: {
        count: noShowApps.length,
        applicationIds: noShowApps.map(a => a.id),
        dates: noShowApps.map(a => a.noShowAt),
      },
    });
  }

  const withdrawnApps = applications.filter(app => app.withdrawnAt !== null);
  if (withdrawnApps.length >= 2) {
    flags.push({
      flagType: "multiple_withdrawals",
      severity: withdrawnApps.length >= 3 ? "high" : "medium",
      label: `Withdrawals (${withdrawnApps.length}x)`,
      description: `Candidate has withdrawn from ${withdrawnApps.length} applications.`,
      evidence: {
        count: withdrawnApps.length,
        applicationIds: withdrawnApps.map(a => a.id),
        dates: withdrawnApps.map(a => a.withdrawnAt),
        reasons: withdrawnApps.map(a => a.withdrawnReason).filter(Boolean),
      },
    });
  }

  const bgFailedApps = applications.filter(
    app => app.backgroundCheckStatus === "failed" || app.backgroundStatus === "failed"
  );
  if (bgFailedApps.length > 0) {
    flags.push({
      flagType: "background_review_required",
      severity: "high",
      label: "Background Review",
      description: `Candidate has ${bgFailedApps.length} prior background check failure${bgFailedApps.length > 1 ? "s" : ""}. Manual review recommended.`,
      evidence: {
        count: bgFailedApps.length,
        applicationIds: bgFailedApps.map(a => a.id),
      },
    });
  }

  return flags;
}

export async function refreshRiskFlags(candidateId: string, userId?: string, userEmail?: string, source: "auto" | "manual" = "auto"): Promise<CandidateRiskFlag[]> {
  const calculated = await calculateRiskFlags(candidateId);

  const existing = await db
    .select()
    .from(candidateRiskFlags)
    .where(eq(candidateRiskFlags.candidateId, candidateId));

  const existingByType: Record<string, typeof existing[0]> = {};
  for (const f of existing) {
    existingByType[f.flagType] = f;
  }
  const calculatedTypes = new Set(calculated.map(f => f.flagType));

  for (const flag of calculated) {
    const existingFlag = existingByType[flag.flagType];
    if (existingFlag) {
      await db
        .update(candidateRiskFlags)
        .set({
          severity: flag.severity,
          label: flag.label,
          description: flag.description,
          evidence: flag.evidence,
          calculatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(candidateRiskFlags.id, existingFlag.id));
    } else {
      await db.insert(candidateRiskFlags).values({
        candidateId,
        flagType: flag.flagType,
        severity: flag.severity,
        label: flag.label,
        description: flag.description,
        evidence: flag.evidence,
        calculatedAt: new Date(),
      });
    }
  }

  for (const flagType of Object.keys(existingByType)) {
    const existingFlag = existingByType[flagType];
    if (!calculatedTypes.has(flagType as RiskFlagType) && !existingFlag.isDismissed) {
      await db
        .delete(candidateRiskFlags)
        .where(eq(candidateRiskFlags.id, existingFlag.id));
    }
  }

  if (userId) {
    await db.insert(recruitingAuditEvents).values({
      actionType: "CANDIDATE_RISK_FLAGS_CALCULATED",
      entityType: "candidate",
      entityId: candidateId,
      userId: userId,
      userEmail: userEmail || "",
      source: source === "manual" ? "ui" : "system",
      metadata: { flagCount: calculated.length, flags: calculated.map(f => f.flagType), calculationType: source },
    });
  }

  const result = await db
    .select()
    .from(candidateRiskFlags)
    .where(eq(candidateRiskFlags.candidateId, candidateId));

  return sortBySeverity(result);
}

const recentlyCalculated = new Set<string>();

export async function getRiskFlags(candidateId: string, userId?: string, userEmail?: string): Promise<CandidateRiskFlag[]> {
  const existing = await db
    .select()
    .from(candidateRiskFlags)
    .where(eq(candidateRiskFlags.candidateId, candidateId));

  if (existing.length > 0) {
    const isStale = existing.some(f => {
      const age = Date.now() - new Date(f.calculatedAt).getTime();
      return age > STALE_THRESHOLD_MS;
    });
    if (!isStale) return sortBySeverity(existing);
  }

  if (existing.length === 0 && recentlyCalculated.has(candidateId)) {
    return [];
  }

  recentlyCalculated.add(candidateId);
  setTimeout(() => recentlyCalculated.delete(candidateId), STALE_THRESHOLD_MS);

  return refreshRiskFlags(candidateId, userId, userEmail);
}

export async function dismissRiskFlag(
  flagId: string,
  reason: string,
  userId: string,
  userEmail: string
): Promise<{ success: boolean; error?: string }> {
  const [flag] = await db
    .select()
    .from(candidateRiskFlags)
    .where(eq(candidateRiskFlags.id, flagId));

  if (!flag) return { success: false, error: "Risk flag not found" };
  if (flag.isDismissed) return { success: false, error: "Risk flag already dismissed" };

  await db
    .update(candidateRiskFlags)
    .set({
      isDismissed: true,
      dismissedAt: new Date(),
      dismissedBy: userId,
      dismissReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(candidateRiskFlags.id, flagId));

  await db.insert(recruitingAuditEvents).values({
    actionType: "CANDIDATE_RISK_FLAG_DISMISSED",
    entityType: "candidate",
    entityId: flag.candidateId,
    userId: userId,
    userEmail: userEmail,
    source: "ui",
    metadata: { flagId, flagType: flag.flagType, reason },
  });

  return { success: true };
}

export async function getRiskFlagsSummary(candidateIds: string[]): Promise<Record<string, { count: number; highSeverity: boolean }>> {
  if (candidateIds.length === 0) return {};

  const flags = await db
    .select()
    .from(candidateRiskFlags)
    .where(
      and(
        sql`${candidateRiskFlags.candidateId} = ANY(${candidateIds})`,
        eq(candidateRiskFlags.isDismissed, false)
      )
    );

  const summary: Record<string, { count: number; highSeverity: boolean }> = {};
  for (const flag of flags) {
    if (!summary[flag.candidateId]) {
      summary[flag.candidateId] = { count: 0, highSeverity: false };
    }
    summary[flag.candidateId].count++;
    if (flag.severity === "high") {
      summary[flag.candidateId].highSeverity = true;
    }
  }

  return summary;
}
