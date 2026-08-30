import { db } from "../db";
import { storage } from "../storage";
import { sql, eq, and, isNull, isNotNull, gte, lt, or, inArray } from "drizzle-orm";
import {
  recruitingApplications,
  recruitingCommunications,
  recruitingSlaEscalations,
  readinessRegressionEvents,
  type RecruitingHealthThreshold,
} from "@shared/schema";

export interface HealthMetrics {
  stalledApplications: { count: number; status: "ok" | "warning" | "critical" };
  slaBreachRate: { rate: number; breachCount: number; totalTracked: number; status: "ok" | "warning" | "critical" };
  unreadInbound: { count: number; status: "ok" | "warning" | "critical" };
  readinessRegressions: { count: number; status: "ok" | "warning" | "critical" };
  overallStatus: "ok" | "warning" | "critical";
}

const TERMINAL_STAGES = ["hired", "rejected", "withdrawn", "no_show", "offer_declined"];

function getMetricStatus(value: number, threshold: RecruitingHealthThreshold | undefined): "ok" | "warning" | "critical" {
  if (!threshold || !threshold.isEnabled) return "ok";
  const warning = parseFloat(String(threshold.warningValue));
  const critical = parseFloat(String(threshold.criticalValue));
  if (value >= critical) return "critical";
  if (value >= warning) return "warning";
  return "ok";
}

function getOverallStatus(statuses: ("ok" | "warning" | "critical")[]): "ok" | "warning" | "critical" {
  if (statuses.includes("critical")) return "critical";
  if (statuses.includes("warning")) return "warning";
  return "ok";
}

export async function calculateHealthMetrics(): Promise<HealthMetrics> {
  const thresholds = await storage.getRecruitingHealthThresholds();
  const thresholdMap: Record<string, RecruitingHealthThreshold> = {};
  for (const t of thresholds) {
    thresholdMap[t.metricKey] = t;
  }

  const stalledThreshold = thresholdMap["stalled_applications"];
  const slaThreshold = thresholdMap["sla_breach_rate"];
  const unreadThreshold = thresholdMap["unread_inbound"];
  const regressionThreshold = thresholdMap["readiness_regressions"];

  const stalledDays = stalledThreshold?.stalledDays ?? 5;
  const slaLookbackDays = slaThreshold?.lookbackDays ?? 7;
  const unreadLookbackDays = unreadThreshold?.lookbackDays ?? 7;
  const regressionLookbackDays = regressionThreshold?.lookbackDays ?? 7;

  const now = new Date();

  const stalledCutoff = new Date(now.getTime() - stalledDays * 24 * 60 * 60 * 1000);
  const slaLookback = new Date(now.getTime() - slaLookbackDays * 24 * 60 * 60 * 1000);
  const unreadLookback = new Date(now.getTime() - unreadLookbackDays * 24 * 60 * 60 * 1000);
  const regressionLookback = new Date(now.getTime() - regressionLookbackDays * 24 * 60 * 60 * 1000);

  const [stalledResult] = await db.select({
    count: sql<number>`count(*)::int`,
  })
  .from(recruitingApplications)
  .where(and(
    eq(recruitingApplications.isArchived, false),
    isNull(recruitingApplications.disposition),
    sql`${recruitingApplications.currentStage} NOT IN (${sql.join(TERMINAL_STAGES.map(s => sql`${s}`), sql`, `)})`,
    lt(recruitingApplications.updatedAt, stalledCutoff)
  ));
  const stalledCount = stalledResult?.count ?? 0;

  const [slaBreachResult] = await db.select({
    breachCount: sql<number>`count(*)::int`,
  })
  .from(recruitingSlaEscalations)
  .where(and(
    gte(recruitingSlaEscalations.breachedAt, slaLookback),
    or(
      eq(recruitingSlaEscalations.status, "breached"),
      eq(recruitingSlaEscalations.status, "escalated")
    )
  ));
  const slaBreachCount = slaBreachResult?.breachCount ?? 0;

  const [slaTotalResult] = await db.select({
    count: sql<number>`count(*)::int`,
  })
  .from(recruitingApplications)
  .where(and(
    eq(recruitingApplications.isArchived, false),
    isNull(recruitingApplications.disposition),
    sql`${recruitingApplications.currentStage} NOT IN (${sql.join(TERMINAL_STAGES.map(s => sql`${s}`), sql`, `)})`
  ));
  const slaTotalTracked = Math.max(slaTotalResult?.count ?? 1, 1);
  const slaBreachRate = parseFloat(((slaBreachCount / slaTotalTracked) * 100).toFixed(2));

  const [unreadResult] = await db.select({
    count: sql<number>`count(*)::int`,
  })
  .from(recruitingCommunications)
  .where(and(
    eq(recruitingCommunications.direction, "inbound"),
    isNull(recruitingCommunications.repliedAt),
    gte(recruitingCommunications.createdAt, unreadLookback)
  ));
  const unreadCount = unreadResult?.count ?? 0;

  const [regressionResult] = await db.select({
    count: sql<number>`count(*)::int`,
  })
  .from(readinessRegressionEvents)
  .where(and(
    isNull(readinessRegressionEvents.resolvedAt),
    gte(readinessRegressionEvents.createdAt, regressionLookback)
  ));
  const regressionCount = regressionResult?.count ?? 0;

  const stalledStatus = getMetricStatus(stalledCount, stalledThreshold);
  const slaStatus = getMetricStatus(slaBreachRate, slaThreshold);
  const unreadStatus = getMetricStatus(unreadCount, unreadThreshold);
  const regressionStatus = getMetricStatus(regressionCount, regressionThreshold);

  return {
    stalledApplications: { count: stalledCount, status: stalledStatus },
    slaBreachRate: { rate: slaBreachRate, breachCount: slaBreachCount, totalTracked: slaTotalTracked, status: slaStatus },
    unreadInbound: { count: unreadCount, status: unreadStatus },
    readinessRegressions: { count: regressionCount, status: regressionStatus },
    overallStatus: getOverallStatus([stalledStatus, slaStatus, unreadStatus, regressionStatus]),
  };
}

export async function generateDailySnapshot(): Promise<{ created: boolean; snapshot: any }> {
  const today = new Date().toISOString().slice(0, 10);

  const existing = await storage.getRecruitingHealthSnapshotByDate(today);
  if (existing) {
    return { created: false, snapshot: existing };
  }

  const metrics = await calculateHealthMetrics();
  const thresholds = await storage.getRecruitingHealthThresholds();

  const snapshot = await storage.createRecruitingHealthSnapshot({
    snapshotDate: today,
    stalledApplicationsCount: metrics.stalledApplications.count,
    slaBreachRate: String(metrics.slaBreachRate.rate),
    slaBreachCount: metrics.slaBreachRate.breachCount,
    slaTotalTracked: metrics.slaBreachRate.totalTracked,
    unreadInboundCount: metrics.unreadInbound.count,
    readinessRegressionCount: metrics.readinessRegressions.count,
    thresholdsUsed: thresholds,
  });

  return { created: true, snapshot };
}
