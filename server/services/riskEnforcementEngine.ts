/**
 * Driver Risk Enforcement Engine
 *
 * Translates Driver Risk Scores into operational restrictions and DWP tasks.
 *
 * Tier thresholds (source of truth from ticket):
 *   0–20   Low Risk      → No restriction
 *   21–40  Moderate      → Monitor only
 *   41–60  Elevated      → Coaching Required + DWP task
 *   61–80  High          → Restricted + DWP task
 *   81–100 Critical      → Blocked (Do Not Dispatch) + DWP task
 *
 * Overrides: Super Admin / Corporate can override any restriction.
 * All state changes and overrides are written to driver_risk_events.
 */

import { db } from "../db";
import { driverRiskRestrictions, driverRiskEvents, workPlanItems, users } from "@shared/schema";
import { and, eq, inArray, ne } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────────────

export type RiskTier = "low" | "moderate" | "elevated" | "high" | "critical";
export type RestrictionLevel = "none" | "coaching_required" | "restricted" | "blocked";

export interface RiskTierConfig {
  tier: RiskTier;
  label: string;
  minScore: number;
  maxScore: number;
  restrictionLevel: RestrictionLevel;
  dwpPriority: "high" | "critical" | null;
  dwpTitle: (driverName: string) => string;
  dwpReason: (driverName: string, score: number) => string;
}

export interface RiskRestrictionStatus {
  driverId: string;
  riskTier: RiskTier;
  riskScore: number;
  restrictionLevel: RestrictionLevel;
  isOverridden: boolean;
  overriddenBy: string | null;
  overrideReason: string | null;
  overriddenAt: Date | null;
  lastEvaluatedAt: Date | null;
  effectiveRestriction: RestrictionLevel; // restriction_level when not overridden, 'none' when overridden
  isBlocked: boolean;
  isRestricted: boolean;
}

// ─── Tier Configuration ───────────────────────────────────────────────────────

export const RISK_TIER_CONFIG: RiskTierConfig[] = [
  {
    tier: "low",
    label: "Low Risk",
    minScore: 0,
    maxScore: 20,
    restrictionLevel: "none",
    dwpPriority: null,
    dwpTitle: () => "",
    dwpReason: () => "",
  },
  {
    tier: "moderate",
    label: "Moderate",
    minScore: 21,
    maxScore: 40,
    restrictionLevel: "none",
    dwpPriority: null,
    dwpTitle: () => "",
    dwpReason: () => "",
  },
  {
    tier: "elevated",
    label: "Elevated",
    minScore: 41,
    maxScore: 60,
    restrictionLevel: "coaching_required",
    dwpPriority: "high",
    dwpTitle: (name) => `Coaching Required — ${name}`,
    dwpReason: (name, score) =>
      `Driver ${name} has an Elevated Risk Score of ${score}. A coaching session is required. Review the driver's claim history and recent moves before the next dispatch.`,
  },
  {
    tier: "high",
    label: "High Risk",
    minScore: 61,
    maxScore: 80,
    restrictionLevel: "restricted",
    dwpPriority: "high",
    dwpTitle: (name) => `High Risk Driver — Action Required — ${name}`,
    dwpReason: (name, score) =>
      `Driver ${name} has a High Risk Score of ${score}. Assignment types are restricted (no high-value vehicles, no long-distance moves, no premium customers). Manual dispatch approval is recommended before assignment.`,
  },
  {
    tier: "critical",
    label: "Critical",
    minScore: 81,
    maxScore: 100,
    restrictionLevel: "blocked",
    dwpPriority: "critical",
    dwpTitle: (name) => `Critical Risk — Remove or Review Driver Immediately — ${name}`,
    dwpReason: (name, score) =>
      `Driver ${name} has a Critical Risk Score of ${score} and has been flagged Do Not Dispatch. The driver is automatically restricted from new assignments. A Super Admin override is required to re-enable. Immediate review or removal is required.`,
  },
];

// ─── Dispatch Priority & Pool Labels ─────────────────────────────────────────

/** Lower number = higher dispatch priority. Critical is excluded (priority 5). */
export const DISPATCH_PRIORITY: Record<RiskTier, number> = {
  low: 1,
  moderate: 2,
  elevated: 3,
  high: 4,
  critical: 5,
};

/** Human-readable pool / status label per tier. */
export const DISPATCH_STATUS_LABEL: Record<RiskTier, string> = {
  low: "Preferred Driver Pool",
  moderate: "Standard Pool",
  elevated: "Watch / Coaching",
  high: "Restricted Pool",
  critical: "Do Not Dispatch",
};

/**
 * Vehicle type keywords that classify a move as "luxury / high-value."
 * Case-insensitive match against the move's vehicleType string.
 */
export const LUXURY_VEHICLE_KEYWORDS: string[] = [
  "luxury",
  "limousine",
  "limo",
  "exotic",
  "ferrari",
  "lamborghini",
  "bentley",
  "rolls",
  "maserati",
  "porsche",
  "mclaren",
  "aston",
  "tesla",
  "high-value",
  "high_value",
  "premium",
];

/** Distance threshold (miles) above which a move is classified as long-distance. */
export const LONG_DISTANCE_THRESHOLD_MILES = 100;

export interface MoveEligibilityResult {
  eligible: boolean;
  reason: string | null;
  errorCode: string | null;
}

/**
 * Check if a driver (by their effective restriction level) is eligible for a move.
 *
 * Rules (ticket):
 *  - Luxury / high-value vehicle → Low or Moderate only (restriction = "none")
 *  - Long-distance (> 100 miles)  → Low only (restriction = "none" AND tier = "low")
 *  - Standard moves               → all except Critical (blocked)
 */
export function checkMoveEligibility(
  effectiveRestriction: RestrictionLevel,
  riskTier: RiskTier,
  vehicleType?: string | null,
  distanceMiles?: number | null
): MoveEligibilityResult {
  const isLuxury = vehicleType
    ? LUXURY_VEHICLE_KEYWORDS.some((kw) =>
        vehicleType.toLowerCase().includes(kw)
      )
    : false;

  const isLongDistance =
    distanceMiles != null && distanceMiles > LONG_DISTANCE_THRESHOLD_MILES;

  // Long-distance → Low tier only
  if (isLongDistance && riskTier !== "low") {
    return {
      eligible: false,
      reason: `Long-distance moves (>${LONG_DISTANCE_THRESHOLD_MILES} mi) are reserved for Preferred (Low Risk) drivers only. This driver is in the ${DISPATCH_STATUS_LABEL[riskTier]}.`,
      errorCode: "DRIVER_INELIGIBLE_LONG_DISTANCE",
    };
  }

  // Luxury / high-value → Low or Moderate only (no restriction)
  if (isLuxury && effectiveRestriction !== "none") {
    return {
      eligible: false,
      reason: `Luxury and high-value vehicle moves require a Preferred or Standard driver. This driver is in the ${DISPATCH_STATUS_LABEL[riskTier]}.`,
      errorCode: "DRIVER_INELIGIBLE_LUXURY_VEHICLE",
    };
  }

  // Critical (blocked) → no new assignments
  if (effectiveRestriction === "blocked") {
    return {
      eligible: false,
      reason: `Driver is flagged Do Not Dispatch (Critical Risk). A Super Admin override is required before assignment.`,
      errorCode: "DRIVER_BLOCKED_RISK",
    };
  }

  return { eligible: true, reason: null, errorCode: null };
}

// ─── DWP Target Emails ───────────────────────────────────────────────────────

export const RISK_DWP_TARGET_EMAILS: string[] = [
  "susanne.beebe@driverhub360.com",
  "will.walton@driverhub360.com",
  "luis.valdez@driverhub360.com",
];

const DWP_RECORD_TYPE = "driver";
const DWP_EVENT_TYPE_PREFIX = "driver_risk_tier_";

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getTierConfig(score: number): RiskTierConfig {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    RISK_TIER_CONFIG.find((c) => clamped >= c.minScore && clamped <= c.maxScore) ??
    RISK_TIER_CONFIG[0]
  );
}

export function buildEffectiveStatus(row: {
  driverId: string;
  riskTier: string;
  riskScore: number;
  restrictionLevel: string;
  isOverridden: boolean;
  overriddenBy: string | null;
  overrideReason: string | null;
  overriddenAt: Date | null;
  lastEvaluatedAt: Date | null;
}): RiskRestrictionStatus {
  const effectiveRestriction = row.isOverridden ? "none" : (row.restrictionLevel as RestrictionLevel);
  return {
    driverId: row.driverId,
    riskTier: row.riskTier as RiskTier,
    riskScore: row.riskScore,
    restrictionLevel: row.restrictionLevel as RestrictionLevel,
    isOverridden: row.isOverridden,
    overriddenBy: row.overriddenBy,
    overrideReason: row.overrideReason,
    overriddenAt: row.overriddenAt,
    lastEvaluatedAt: row.lastEvaluatedAt,
    effectiveRestriction,
    isBlocked: effectiveRestriction === "blocked",
    isRestricted: effectiveRestriction === "restricted" || effectiveRestriction === "blocked",
  };
}

// ─── Core Evaluation ─────────────────────────────────────────────────────────

/**
 * Main evaluation function. Call this whenever a driver's risk score changes
 * (new claim, claim update, move completion, or nightly batch).
 *
 * Returns the updated restriction status.
 */
export async function evaluateDriverRisk(
  driverId: string,
  score: number,
  driverName: string,
  orgId: string | null | undefined,
  triggeredBy = "system"
): Promise<RiskRestrictionStatus> {
  const cfg = getTierConfig(score);

  // Load existing restriction row (if any)
  const [existing] = await db
    .select()
    .from(driverRiskRestrictions)
    .where(eq(driverRiskRestrictions.driverId, driverId))
    .limit(1);

  const prevTier = existing?.riskTier ?? null;
  const prevRestriction = existing?.restrictionLevel ?? null;
  const tierChanged = prevTier !== cfg.tier;
  const restrictionChanged = prevRestriction !== cfg.restrictionLevel;

  // Upsert restriction row
  if (existing) {
    await db
      .update(driverRiskRestrictions)
      .set({
        riskTier: cfg.tier,
        riskScore: score,
        restrictionLevel: cfg.restrictionLevel,
        // When tier improves to none-restriction tier, revoke any override automatically
        // (override only ever needs to be active for restricted/blocked tiers)
        ...(cfg.restrictionLevel === "none" && existing.isOverridden
          ? { isOverridden: false, overriddenBy: null, overrideReason: null, overriddenAt: null }
          : {}),
        lastEvaluatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(driverRiskRestrictions.driverId, driverId));
  } else {
    await db.insert(driverRiskRestrictions).values({
      driverId,
      riskTier: cfg.tier,
      riskScore: score,
      restrictionLevel: cfg.restrictionLevel,
      isOverridden: false,
      overriddenBy: null,
      overrideReason: null,
      overriddenAt: null,
      lastEvaluatedAt: new Date(),
    });
  }

  // If tier changed (or first-time), log the event and create DWP task if needed
  if (tierChanged || !existing) {
    await db.insert(driverRiskEvents).values({
      driverId,
      eventType: "tier_change",
      fromTier: prevTier,
      toTier: cfg.tier,
      fromRestriction: prevRestriction,
      toRestriction: cfg.restrictionLevel,
      details: { score, driverName, tierChanged: true },
      triggeredBy,
    });

    if (restrictionChanged || !existing) {
      await db.insert(driverRiskEvents).values({
        driverId,
        eventType: "restriction_applied",
        fromTier: prevTier,
        toTier: cfg.tier,
        fromRestriction: prevRestriction,
        toRestriction: cfg.restrictionLevel,
        details: { score, driverName, action: cfg.restrictionLevel },
        triggeredBy,
      });
    }

    // Create DWP task for Elevated / High / Critical (complete old tasks first)
    if (cfg.dwpPriority !== null) {
      await syncRiskDwpTasks(driverId, driverName, cfg, score, orgId);
    } else {
      // If tier dropped below elevated, complete any open risk DWP tasks
      await completeRiskDwpTasks(driverId, "Risk score improved — restriction lifted.");
    }
  }

  // Re-fetch fresh row to return accurate state
  const [fresh] = await db
    .select()
    .from(driverRiskRestrictions)
    .where(eq(driverRiskRestrictions.driverId, driverId))
    .limit(1);

  return buildEffectiveStatus(fresh!);
}

// ─── Override Management ──────────────────────────────────────────────────────

/**
 * Apply a manual override to lift a driver's restriction.
 * Logs the override event.
 */
export async function applyRiskOverride(
  driverId: string,
  overriddenBy: string,
  reason: string
): Promise<void> {
  const [existing] = await db
    .select()
    .from(driverRiskRestrictions)
    .where(eq(driverRiskRestrictions.driverId, driverId))
    .limit(1);

  if (!existing) {
    throw new Error(`No risk restriction record found for driver ${driverId}`);
  }

  await db
    .update(driverRiskRestrictions)
    .set({
      isOverridden: true,
      overriddenBy,
      overrideReason: reason,
      overriddenAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(driverRiskRestrictions.driverId, driverId));

  await db.insert(driverRiskEvents).values({
    driverId,
    eventType: "override_granted",
    fromTier: existing.riskTier,
    toTier: existing.riskTier,
    fromRestriction: existing.restrictionLevel,
    toRestriction: existing.restrictionLevel,
    details: { reason, overriddenBy },
    triggeredBy: overriddenBy,
  });
}

/**
 * Revoke an active manual override, re-applying the automatic restriction.
 */
export async function revokeRiskOverride(
  driverId: string,
  revokedBy: string
): Promise<void> {
  const [existing] = await db
    .select()
    .from(driverRiskRestrictions)
    .where(eq(driverRiskRestrictions.driverId, driverId))
    .limit(1);

  if (!existing) {
    throw new Error(`No risk restriction record found for driver ${driverId}`);
  }

  await db
    .update(driverRiskRestrictions)
    .set({
      isOverridden: false,
      overriddenBy: null,
      overrideReason: null,
      overriddenAt: null,
      updatedAt: new Date(),
    })
    .where(eq(driverRiskRestrictions.driverId, driverId));

  await db.insert(driverRiskEvents).values({
    driverId,
    eventType: "override_revoked",
    fromTier: existing.riskTier,
    toTier: existing.riskTier,
    fromRestriction: existing.restrictionLevel,
    toRestriction: existing.restrictionLevel,
    details: { revokedBy },
    triggeredBy: revokedBy,
  });
}

// ─── Get Status ───────────────────────────────────────────────────────────────

/**
 * Fetch the current restriction status for a driver without triggering evaluation.
 * Returns null if no record exists (driver not yet evaluated).
 */
export async function getDriverRiskRestriction(driverId: string): Promise<RiskRestrictionStatus | null> {
  const [row] = await db
    .select()
    .from(driverRiskRestrictions)
    .where(eq(driverRiskRestrictions.driverId, driverId))
    .limit(1);

  if (!row) return null;
  return buildEffectiveStatus(row);
}

/**
 * Fetch the restriction event history for a driver.
 */
export async function getDriverRiskEvents(driverId: string, limit = 50) {
  return db
    .select()
    .from(driverRiskEvents)
    .where(eq(driverRiskEvents.driverId, driverId))
    .orderBy(driverRiskEvents.createdAt)
    .limit(limit);
}

// ─── DWP Task Helpers ─────────────────────────────────────────────────────────

async function syncRiskDwpTasks(
  driverId: string,
  driverName: string,
  cfg: RiskTierConfig,
  score: number,
  orgId: string | null | undefined
): Promise<void> {
  const eventType = `${DWP_EVENT_TYPE_PREFIX}${cfg.tier}`;

  // Complete any open tasks from a DIFFERENT tier first (tier escalation/de-escalation)
  for (const otherCfg of RISK_TIER_CONFIG) {
    if (otherCfg.tier !== cfg.tier && otherCfg.dwpPriority !== null) {
      await completeRiskDwpTasksByEventType(
        driverId,
        `${DWP_EVENT_TYPE_PREFIX}${otherCfg.tier}`,
        "Risk tier changed — previous task superseded."
      );
    }
  }

  const targetUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.email, RISK_DWP_TARGET_EMAILS));

  for (const targetUser of targetUsers) {
    const existing = await db
      .select({ id: workPlanItems.id })
      .from(workPlanItems)
      .where(
        and(
          eq(workPlanItems.eventType, eventType),
          eq(workPlanItems.recordId, driverId),
          eq(workPlanItems.assignedUserId, targetUser.id),
          ne(workPlanItems.status, "completed"),
          ne(workPlanItems.status, "canceled")
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(workPlanItems).values({
        eventType,
        category: "operational",
        recordType: DWP_RECORD_TYPE,
        recordId: driverId,
        recordName: cfg.dwpTitle(driverName),
        reason: cfg.dwpReason(driverName, score),
        assignedUserId: targetUser.id,
        priority: cfg.dwpPriority!,
        status: "open",
        taskType: "Review",
        sourceModule: "risk",
        recordUrl: `/drivers/${driverId}`,
        orgId: orgId ?? null,
      });
    }
  }

  // Log DWP generation event
  await db.insert(driverRiskEvents).values({
    driverId,
    eventType: "dwp_task_generated",
    fromTier: null,
    toTier: cfg.tier,
    fromRestriction: null,
    toRestriction: cfg.restrictionLevel,
    details: { score, driverName, eventType },
    triggeredBy: "system",
  });
}

async function completeRiskDwpTasks(driverId: string, note: string): Promise<void> {
  for (const cfg of RISK_TIER_CONFIG) {
    if (cfg.dwpPriority !== null) {
      await completeRiskDwpTasksByEventType(
        driverId,
        `${DWP_EVENT_TYPE_PREFIX}${cfg.tier}`,
        note
      );
    }
  }
}

async function completeRiskDwpTasksByEventType(
  driverId: string,
  eventType: string,
  note: string
): Promise<void> {
  await db
    .update(workPlanItems)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
      resolutionNote: note,
    })
    .where(
      and(
        eq(workPlanItems.eventType, eventType),
        eq(workPlanItems.recordId, driverId),
        ne(workPlanItems.status, "completed"),
        ne(workPlanItems.status, "canceled")
      )
    );
}
