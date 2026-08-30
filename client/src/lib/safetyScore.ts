/**
 * Safety Performance Score – shared utility
 *
 * Driver-facing score (0–100, higher = safer).
 * Focuses on behavior, compliance, and operational discipline.
 *
 * Tier thresholds:
 *   85–100 → Elite Operator
 *   70–84  → Strong
 *   50–69  → Needs Coaching
 *   <50    → Unsafe
 */

export type SafetyStage =
  | "Elite Operator"
  | "Strong"
  | "Needs Coaching"
  | "Unsafe";

export type SafetyTrend = "Improving" | "Stable" | "Declining";

export interface SafetyPerformanceData {
  score: number;
  stage: SafetyStage;
  trend: SafetyTrend;
  impactingFactors: string[];
  howToImprove: string[];
  riskFloorApplied: boolean;
}

/** Map a Safety Performance Score (0–100, higher = better) to a tier. */
export function getSafetyStage(score: number): SafetyStage {
  if (score >= 85) return "Elite Operator";
  if (score >= 70) return "Strong";
  if (score >= 50) return "Needs Coaching";
  return "Unsafe";
}

/**
 * The Driver Risk Score is now 0–100 with HIGHER = SAFER.
 * No inversion needed — Safety Performance Score IS the Driver Risk Score.
 * This function exists for compatibility and clarity at call sites.
 */
export function lossScoreToSafetyScore(driverRiskScore: number): number {
  return Math.max(0, Math.min(100, driverRiskScore));
}

/** Tailwind color classes for each tier. */
export function getSafetyStageColors(stage: SafetyStage): {
  badge: string;
  text: string;
  bg: string;
  bar: string;
  border: string;
} {
  switch (stage) {
    case "Elite Operator":
      return {
        badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
        text: "text-emerald-600 dark:text-emerald-400",
        bg: "bg-emerald-50 dark:bg-emerald-900/20",
        bar: "[&>div]:bg-emerald-500",
        border: "border-emerald-500",
      };
    case "Strong":
      return {
        badge: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
        text: "text-blue-600 dark:text-blue-400",
        bg: "bg-blue-50 dark:bg-blue-900/20",
        bar: "[&>div]:bg-blue-500",
        border: "border-blue-500",
      };
    case "Needs Coaching":
      return {
        badge: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
        text: "text-yellow-600 dark:text-yellow-400",
        bg: "bg-yellow-50 dark:bg-yellow-900/20",
        bar: "[&>div]:bg-yellow-500",
        border: "border-yellow-500",
      };
    case "Unsafe":
      return {
        badge: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
        text: "text-red-600 dark:text-red-400",
        bg: "bg-red-50 dark:bg-red-900/20",
        bar: "[&>div]:bg-red-500",
        border: "border-red-500",
      };
  }
}

/**
 * Map internal corporate tier labels → driver-facing Safety Performance tier.
 */
export function internalTierToSafetyStage(internalTier: string): SafetyStage {
  switch (internalTier?.toUpperCase()) {
    case "TOP PERFORMER":
    case "LOW":
    case "PREFERRED":
      return "Elite Operator";
    case "ON TRACK":
    case "MODERATE":
    case "ACCEPTABLE":
      return "Strong";
    case "WATCH LIST":
    case "WATCHLIST":
    case "HIGH":
      return "Needs Coaching";
    case "HIGH RISK":
    case "SEVERE":
    case "CRITICAL":
      return "Unsafe";
    default:
      return "Strong";
  }
}

/** Generate impacting factors from safety score inputs. */
export function buildImpactingFactors(inputs: {
  claimsHistory90Days?: number;
  atFaultCount12Months?: number;
  preventableIncidents90Days?: number;
  safetyViolations90Days?: number;
  lateOrFailedMoves90Days?: number;
  totalMoves90Days?: number;
  totalTripsAllTime?: number;
  riskFloorApplied?: boolean;
}): string[] {
  const factors: string[] = [];

  if (inputs.riskFloorApplied) {
    factors.push("Incident recorded before establishing a trip history");
  }
  if ((inputs.claimsHistory90Days ?? 0) > 0) {
    factors.push(
      `${inputs.claimsHistory90Days} claim${inputs.claimsHistory90Days! > 1 ? "s" : ""} reported in the last 90 days`
    );
  }
  if ((inputs.atFaultCount12Months ?? 0) > 0) {
    factors.push(
      `${inputs.atFaultCount12Months} at-fault incident${inputs.atFaultCount12Months! > 1 ? "s" : ""} in the past 12 months`
    );
  }
  if ((inputs.preventableIncidents90Days ?? 0) > 0) {
    factors.push(
      `${inputs.preventableIncidents90Days} preventable incident${inputs.preventableIncidents90Days! > 1 ? "s" : ""} flagged`
    );
  }
  if ((inputs.safetyViolations90Days ?? 0) > 0) {
    factors.push(
      `${inputs.safetyViolations90Days} safety violation${inputs.safetyViolations90Days! > 1 ? "s" : ""} in the last 90 days`
    );
  }
  if (
    (inputs.lateOrFailedMoves90Days ?? 0) > 0 &&
    (inputs.totalMoves90Days ?? 0) > 0
  ) {
    const pct = Math.round(
      (inputs.lateOrFailedMoves90Days! / inputs.totalMoves90Days!) * 100
    );
    factors.push(`${pct}% of recent moves completed late or failed`);
  }

  if (factors.length === 0) {
    factors.push("No recent incidents or violations on record");
  }
  return factors;
}

/** Generate how-to-improve guidance based on tier. */
export function buildHowToImprove(
  stage: SafetyStage,
  inputs: {
    claimsHistory90Days?: number;
    safetyViolations90Days?: number;
    lateOrFailedMoves90Days?: number;
    totalTripsAllTime?: number;
  }
): string[] {
  switch (stage) {
    case "Elite Operator":
      return [
        "You are performing at the highest level — keep it up",
        "Maintain your on-time delivery and incident-free record",
        "Consider optional advanced safety refreshers to stay current",
      ];
    case "Strong":
      return [
        "Complete each upcoming trip without incidents to reach Elite Operator",
        "Review safe-driving guidelines in the Resources section",
        "Stay consistent — your score improves week over week without incidents",
      ];
    case "Needs Coaching": {
      const tips = [
        "Complete your next 5 trips without incidents to move to Strong",
        "Attend the next available coaching or safety refresher session",
      ];
      if ((inputs.lateOrFailedMoves90Days ?? 0) > 0) {
        tips.push("Improve on-time completion to raise your Operational Discipline score");
      }
      if ((inputs.safetyViolations90Days ?? 0) > 0) {
        tips.push("Address outstanding safety violations with your fleet coordinator");
      }
      return tips;
    }
    case "Unsafe": {
      const tips = [
        "Contact your fleet coordinator immediately to discuss your status",
        "Complete all mandatory safety training before your next assignment",
        "A sustained incident-free period of 90+ days is required to improve your score",
        "Compliance with all safety policies is required to remain on active assignments",
      ];
      if ((inputs.claimsHistory90Days ?? 0) > 0) {
        tips.push("Ensure all open claims are fully documented with fleet management");
      }
      return tips;
    }
  }
}
