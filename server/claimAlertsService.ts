// ──────────────────────────────────────────────────────────────────────────────
// Claim Alerts & Risk Flags Service
// Surfaces issues before they become problems — 4 alert types:
//   1. missing_info   — required fields absent for current stage
//   2. high_cost      — total estimate / probable cost over threshold
//   3. repeat_driver  — driver has multiple open claims
//   4. delayed        — claim has been in current stage too long
// ──────────────────────────────────────────────────────────────────────────────
import { storage } from "./storage";
import { computeCarrierSubmissionReadiness } from "./helpers/claimReadiness";

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertType = "missing_info" | "high_cost" | "repeat_driver" | "delayed";

export interface ClaimAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  detail: string;
  resolvedWhen: string;
}

// ── Thresholds ─────────────────────────────────────────────────────────────────
const HIGH_COST_WARNING_USD  = 50_000;
const HIGH_COST_CRITICAL_USD = 100_000;

const DELAY_DRAFT_WARNING_DAYS     = 7;
const DELAY_DRAFT_CRITICAL_DAYS    = 14;
const DELAY_IN_REVIEW_WARNING_DAYS = 30;
const DELAY_IN_REVIEW_CRITICAL_DAYS = 60;
const DELAY_OTHER_WARNING_DAYS     = 45;
const DELAY_OTHER_CRITICAL_DAYS    = 90;

const REPEAT_WARNING_COUNT  = 2;  // 2+ open claims in last 12 months = warning
const REPEAT_CRITICAL_COUNT = 4;  // 4+ = critical

// ── Helpers ────────────────────────────────────────────────────────────────────
function daysSince(date: Date | string | null | undefined): number {
  if (!date) return 0;
  const d = typeof date === "string" ? new Date(date) : date;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function parseMoney(v: any): number {
  if (!v) return 0;
  return parseFloat(String(v).replace(/[^0-9.-]/g, "")) || 0;
}

// ── Missing info alerts ────────────────────────────────────────────────────────
async function computeMissingInfoAlerts(claim: any): Promise<ClaimAlert[]> {
  const alerts: ClaimAlert[] = [];
  const status = claim.claimStatus || "DRAFT";
  const isActive = !["CLOSED", "DENIED", "PAID"].includes(status);
  if (!isActive) return alerts;

  if (status === "DRAFT") {
    const draftRequirements = [
      { field: "incident_date", label: "Incident date", ready: !!(claim.accidentDate || claim.incidentDate) },
      { field: "driver", label: "Driver assignment", ready: !!claim.driverId },
      { field: "incident_type", label: "Incident type", ready: !!claim.incidentType },
    ];
    for (const item of draftRequirements.filter(item => !item.ready)) {
      alerts.push({
        id: `missing_${item.field}`,
        type: "missing_info",
        severity: item.field === "incident_type" ? "warning" : "critical",
        title: `${item.label} missing`,
        detail: `${item.label} is required before this claim can advance.`,
        resolvedWhen: `${item.label} is completed on the claim.`,
      });
    }
  } else {
    const readiness = await computeCarrierSubmissionReadiness(claim);
    for (const item of readiness.missingRequired) {
      alerts.push({
        id: `missing_readiness_${item.field}`,
        type: "missing_info",
        severity: "warning",
        title: `${item.label} missing`,
        detail: item.reason || `${item.label} is required before this claim can be marked ready for submission.`,
        resolvedWhen: `${item.label} satisfies the claim readiness requirement.`,
      });
    }
  }

  return alerts;
}

// ── High cost alerts ───────────────────────────────────────────────────────────
function computeHighCostAlerts(claim: any): ClaimAlert[] {
  const alerts: ClaimAlert[] = [];

  const totalEst    = parseMoney(claim.totalEstimate);
  const probCost    = parseMoney(claim.probableCost);
  const actualCost  = parseMoney(claim.actualCost);
  const reserve     = parseMoney(claim.insuranceReserve);
  const exposure    = Math.max(totalEst, probCost, actualCost, reserve);

  if (exposure <= 0) return alerts;

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  if (exposure >= HIGH_COST_CRITICAL_USD) {
    alerts.push({
      id: "high_cost_critical",
      type: "high_cost",
      severity: "critical",
      title: `High cost exposure — ${fmt(exposure)}`,
      detail: `Estimated cost/reserve exceeds ${fmt(HIGH_COST_CRITICAL_USD)}. Escalation and close monitoring required.`,
      resolvedWhen: "Cost exposure drops below the critical threshold or claim is closed.",
    });
  } else if (exposure >= HIGH_COST_WARNING_USD) {
    alerts.push({
      id: "high_cost_warning",
      type: "high_cost",
      severity: "warning",
      title: `Elevated cost exposure — ${fmt(exposure)}`,
      detail: `Estimated cost/reserve exceeds ${fmt(HIGH_COST_WARNING_USD)}. Monitor closely.`,
      resolvedWhen: "Cost exposure drops below the warning threshold or claim is closed.",
    });
  }

  return alerts;
}

// ── Repeat driver alerts ───────────────────────────────────────────────────────
async function computeRepeatDriverAlerts(claim: any): Promise<ClaimAlert[]> {
  const alerts: ClaimAlert[] = [];
  const driverId = claim.driverId;
  if (!driverId) return alerts;

  try {
    const allDriverClaims = await storage.getAccidentsByDriverId(driverId);
    const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000; // 12 months
    const recentOpen = allDriverClaims.filter((c: any) => {
      if (c.id === claim.id) return false; // exclude self
      const isClosed = ["CLOSED", "DENIED", "PAID"].includes(c.claimStatus || "");
      const date = c.accidentDate ? new Date(c.accidentDate).getTime() : 0;
      return !isClosed && date >= cutoff;
    });

    const count = recentOpen.length;
    if (count === 0) return alerts;

    if (count >= REPEAT_CRITICAL_COUNT) {
      alerts.push({
        id: "repeat_driver_critical",
        type: "repeat_driver",
        severity: "critical",
        title: `Repeat incident driver — ${count} other open claim${count !== 1 ? "s" : ""}`,
        detail: `This driver has ${count} other open claims in the past 12 months. Immediate review recommended.`,
        resolvedWhen: "Driver's prior claims are closed or resolved.",
      });
    } else if (count >= REPEAT_WARNING_COUNT) {
      alerts.push({
        id: "repeat_driver_warning",
        type: "repeat_driver",
        severity: "warning",
        title: `Repeat incident driver — ${count} other open claim${count !== 1 ? "s" : ""}`,
        detail: `This driver has ${count} other open claims in the past 12 months. Monitor for patterns.`,
        resolvedWhen: "Driver's prior claims are closed or resolved.",
      });
    }
  } catch {
    // Non-fatal: skip
  }

  return alerts;
}

// ── Delay alerts ───────────────────────────────────────────────────────────────
function computeDelayAlerts(claim: any): ClaimAlert[] {
  const alerts: ClaimAlert[] = [];
  const status = claim.claimStatus || "DRAFT";

  // Only alert on active stages — closed/final stages don't get delay alerts
  if (["CLOSED", "DENIED", "PAID", "SUBMITTED"].includes(status)) return alerts;

  // Use updatedAt if available, otherwise createdAt, then accidentDate
  const sinceDate = claim.updatedAt || claim.createdAt || claim.accidentDate;
  const age = daysSince(sinceDate);
  if (age <= 0) return alerts;

  let warningDays: number;
  let criticalDays: number;
  let stageName = status.replace(/_/g, " ").toLowerCase();

  if (status === "DRAFT") {
    warningDays  = DELAY_DRAFT_WARNING_DAYS;
    criticalDays = DELAY_DRAFT_CRITICAL_DAYS;
    stageName    = "Draft";
  } else if (status === "IN_REVIEW") {
    warningDays  = DELAY_IN_REVIEW_WARNING_DAYS;
    criticalDays = DELAY_IN_REVIEW_CRITICAL_DAYS;
    stageName    = "In Review";
  } else {
    warningDays  = DELAY_OTHER_WARNING_DAYS;
    criticalDays = DELAY_OTHER_CRITICAL_DAYS;
  }

  if (age >= criticalDays) {
    alerts.push({
      id: `delayed_critical_${status}`,
      type: "delayed",
      severity: "critical",
      title: `Stale claim — ${age} day${age !== 1 ? "s" : ""} in ${stageName}`,
      detail: `This claim has been in ${stageName} for ${age} days without advancing. Immediate action required.`,
      resolvedWhen: "Claim advances to the next stage or is resolved.",
    });
  } else if (age >= warningDays) {
    alerts.push({
      id: `delayed_warning_${status}`,
      type: "delayed",
      severity: "warning",
      title: `Aging claim — ${age} day${age !== 1 ? "s" : ""} in ${stageName}`,
      detail: `This claim has been in ${stageName} for ${age} days. Consider advancing it soon.`,
      resolvedWhen: "Claim advances to the next stage or is resolved.",
    });
  }

  return alerts;
}

// ── Main public API ────────────────────────────────────────────────────────────

/** Compute all alerts for a single claim (with attachments included). */
export async function computeClaimAlerts(claim: any): Promise<ClaimAlert[]> {
  const [missing, highCost, repeatDriver, delayed] = await Promise.all([
    computeMissingInfoAlerts(claim),
    Promise.resolve(computeHighCostAlerts(claim)),
    computeRepeatDriverAlerts(claim),
    Promise.resolve(computeDelayAlerts(claim)),
  ]);

  // Sort: critical first, then warning, then info
  const all = [...missing, ...highCost, ...repeatDriver, ...delayed];
  const ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return all.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

/** Aggregated alert counts across ALL non-closed claims (for dashboard). */
export async function computeAlertsSummary(): Promise<{
  total: number;
  critical: number;
  warning: number;
  byType: Record<AlertType, number>;
  topAlertedClaims: { claimId: string; alertCount: number; maxSeverity: AlertSeverity }[];
}> {
  // Fetch all active (non-final) accidents
  const db = (storage as any).db;
  let activeClaims: any[] = [];

  try {
    const { accidents } = await import("../shared/schema");
    const { notInArray } = await import("drizzle-orm");
    activeClaims = await db
      .select()
      .from(accidents)
      .where(
        notInArray(accidents.claimStatus, ["CLOSED", "DENIED", "PAID"])
      )
      .limit(200);
  } catch {
    return { total: 0, critical: 0, warning: 0, byType: { missing_info: 0, high_cost: 0, repeat_driver: 0, delayed: 0 }, topAlertedClaims: [] };
  }

  let total = 0;
  let critical = 0;
  let warning = 0;
  const byType: Record<AlertType, number> = { missing_info: 0, high_cost: 0, repeat_driver: 0, delayed: 0 };
  const claimAlertCounts: { claimId: string; alertCount: number; maxSeverity: AlertSeverity }[] = [];

  for (const claim of activeClaims) {
    try {
      const alerts = await computeClaimAlerts(claim);
      if (alerts.length === 0) continue;

      const claimCritical = alerts.filter(a => a.severity === "critical").length;
      const claimWarning  = alerts.filter(a => a.severity === "warning").length;

      total    += alerts.length;
      critical += claimCritical;
      warning  += claimWarning;

      alerts.forEach(a => { byType[a.type]++; });

      claimAlertCounts.push({
        claimId: claim.id,
        alertCount: alerts.length,
        maxSeverity: claimCritical > 0 ? "critical" : "warning",
      });
    } catch {
      // Skip individual claim errors
    }
  }

  // Sort by alert count desc
  claimAlertCounts.sort((a, b) => b.alertCount - a.alertCount);

  return {
    total,
    critical,
    warning,
    byType,
    topAlertedClaims: claimAlertCounts.slice(0, 10),
  };
}
