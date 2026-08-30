/**
 * SINGLE SOURCE OF TRUTH for all Driver Risk Score copy, formula weights,
 * tier definitions, and how-to-use guidance.
 *
 * This is the ONE Driver Risk Score model used across ALL views:
 *   - Driver Detail page KPI card
 *   - Claims workspace Driver Risk Summary widget
 *   - Any future report or dashboard component
 *
 * DO NOT duplicate these strings in component files.
 */

export const DRIVER_RISK_SCORE_CONFIG = {
  label: "Driver Risk Score",
  subtitle: "Definition & Calculation",

  definition:
    "Measures the likelihood and financial impact of future claims based on " +
    "driver history, exposure, and severity. Score 0–100 — higher is safer.",

  howToUse:
    "Watch List or High Risk may trigger coaching or eligibility review. " +
    "Top Performer preferred for priority placements. " +
    "Immediate Review flag indicates urgent action required.",

  dataNote:
    "Sourced from Claims, Moves, and Safety Incidents modules. " +
    "Draft claims are excluded. Score updates dynamically as data changes.",

  /** Ordered list of formula components exactly matching the backend calculation. */
  components: [
    {
      name: "Preventable Claim Frequency",
      weight: 35,
      description:
        "Preventable (at-fault) claims normalized per 1,000 moves — compares to a fleet benchmark of 15 claims per 1,000",
      formula: "(preventable claims ÷ total moves) × 1,000 vs 15-claim benchmark",
    },
    {
      name: "Claim Severity",
      weight: 20,
      description:
        "Total incurred losses (paid + open reserves) benchmarked against $50,000",
      formula: "total incurred $ ÷ $50,000 benchmark × 100",
    },
    {
      name: "MVR / Serious Violations",
      weight: 20,
      description:
        "Serious or critical safety incidents in the last 12 months — DUI, reckless, suspension, or major violations",
      formula: "violations × 35, capped at 100",
    },
    {
      name: "Open Claim Exposure",
      weight: 15,
      description:
        "Active (unresolved) claims and their outstanding reserves — included at reduced weight until finalized",
      formula: "open claims × 15 + (open reserves ÷ $20,000) × 40, capped at 100",
    },
    {
      name: "Recent Incident Trend",
      weight: 10,
      description:
        "Compares last 90-day claim + incident activity to the prior 90-day period — recent events weighted more heavily",
      formula: "increasing trend raises risk; declining trend lowers it",
    },
  ] as const,

  /** Tiers in descending order (best → worst). Higher score = safer driver. */
  tiers: [
    {
      min: 85,
      max: 100,
      label: "Top Performer",
      colorClass: "text-emerald-700 dark:text-emerald-400",
    },
    {
      min: 70,
      max: 84,
      label: "On Track",
      colorClass: "text-blue-700 dark:text-blue-400",
    },
    {
      min: 50,
      max: 69,
      label: "Watch List",
      colorClass: "text-yellow-700 dark:text-yellow-400",
    },
    {
      min: 0,
      max: 49,
      label: "High Risk",
      colorClass: "text-red-700 dark:text-red-400",
    },
  ] as const,

  tierLegendNote:
    "Higher score = safer driver  ·  Score capped at 49 (High Risk) for drivers with claims but no trip history",

  immediateReviewTriggers:
    "Triggered automatically when: 2+ serious MVR violations, 3+ open claims, or MVR risk sub-score ≥ 70",

  roundingRule:
    "All Driver Risk Score values are rounded to the nearest whole number before display.",
} as const;

/** Convenience object for use as a KpiCard `tip` prop. */
export const DRIVER_RISK_SCORE_TIP = {
  definition: DRIVER_RISK_SCORE_CONFIG.definition,
  calculation:
    DRIVER_RISK_SCORE_CONFIG.components
      .map((c) => `${c.name} ${c.weight}%`)
      .join(", "),
  howToUse: DRIVER_RISK_SCORE_CONFIG.howToUse,
} as const;

/** Helper — returns Tailwind color classes for a given tier label. */
export function getRiskTierColors(tier: string): {
  bg: string;
  border: string;
  scoreCls: string;
  badgeCls: string;
  barCls: string;
} {
  switch (tier) {
    case "Top Performer":
      return {
        bg: "bg-emerald-50 dark:bg-emerald-950/20",
        border: "border-emerald-400 dark:border-emerald-700",
        scoreCls: "text-emerald-600 dark:text-emerald-400",
        badgeCls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
        barCls: "bg-emerald-500",
      };
    case "On Track":
      return {
        bg: "bg-blue-50 dark:bg-blue-950/20",
        border: "border-blue-400 dark:border-blue-700",
        scoreCls: "text-blue-600 dark:text-blue-400",
        badgeCls: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
        barCls: "bg-blue-500",
      };
    case "Watch List":
      return {
        bg: "bg-yellow-50 dark:bg-yellow-950/20",
        border: "border-yellow-400 dark:border-yellow-700",
        scoreCls: "text-yellow-600 dark:text-yellow-400",
        badgeCls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
        barCls: "bg-yellow-500",
      };
    default: // High Risk
      return {
        bg: "bg-red-50 dark:bg-red-950/20",
        border: "border-red-400 dark:border-red-700",
        scoreCls: "text-red-600 dark:text-red-400",
        badgeCls: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
        barCls: "bg-red-500",
      };
  }
}
