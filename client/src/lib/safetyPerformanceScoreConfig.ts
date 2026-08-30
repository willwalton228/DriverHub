/**
 * SINGLE SOURCE OF TRUTH for all Safety Performance Score copy,
 * formula weights, tier definitions, and guidance text.
 *
 * This score is SEPARATE from the Driver Risk Score:
 *   - Driver Risk Score  → insurance-grade, claims/financial exposure, corporate view
 *   - Safety Performance → day-to-day behavior, compliance, discipline, driver-facing
 *
 * Import this wherever you render Safety Performance Score information.
 * DO NOT duplicate these strings in component files.
 */

export const SAFETY_PERFORMANCE_SCORE_CONFIG = {
  label: "Safety Performance Score",
  subtitle: "Definition & Calculation",

  definition:
    "Measures day-to-day driver safety behavior, compliance, and operational discipline. " +
    "Score 0–100 — higher is better.",

  howToUse:
    "Needs Coaching or Unsafe may trigger real-time coaching sessions or eligibility holds. " +
    "Elite Operator preferred for priority routing and advancement.",

  dataNote:
    "Sourced from Trips, Safety Incidents, MVR records, and Claims modules. " +
    "Score updates dynamically as data changes.",

  /** Ordered list of formula components exactly matching the backend calculation. */
  components: [
    {
      name: "Driving Behavior",
      weight: 30,
      description:
        "Speed, braking, and driving patterns — proxied by trip on-time/success rate when telematics data is unavailable",
      formula: "late/failed trip rate → lower rate = higher score",
    },
    {
      name: "Compliance Adherence",
      weight: 20,
      description:
        "License status, MVR recency, and required documentation on file",
      formula: "serious MVR violations penalize score by 30 pts each, capped at 0",
    },
    {
      name: "Incident Rate",
      weight: 20,
      description:
        "All safety-related events per moves — claims, incidents, and violations (not just at-fault)",
      formula: "(all incidents in 12 months ÷ total moves) × 100, inverted to score",
    },
    {
      name: "Operational Discipline",
      weight: 15,
      description:
        "Adherence to process, timing, and execution standards in the last 90 days",
      formula: "late/failed move rate in last 90 days → lower rate = higher score",
    },
    {
      name: "Coaching Responsiveness",
      weight: 15,
      description:
        "Improvement following feedback or incidents — measured by activity trend direction",
      formula: "Improving trend → 90 · Stable → 70 · Declining → 35",
    },
  ] as const,

  /** Tiers in descending order (best → worst). Higher score = better. */
  tiers: [
    {
      min: 85,
      max: 100,
      label: "Elite Operator",
      colorClass: "text-emerald-700 dark:text-emerald-400",
    },
    {
      min: 70,
      max: 84,
      label: "Strong",
      colorClass: "text-blue-700 dark:text-blue-400",
    },
    {
      min: 50,
      max: 69,
      label: "Needs Coaching",
      colorClass: "text-yellow-700 dark:text-yellow-400",
    },
    {
      min: 0,
      max: 49,
      label: "Unsafe",
      colorClass: "text-red-700 dark:text-red-400",
    },
  ] as const,

  tierLegendNote:
    "Higher score = safer driver  ·  85+ Elite Operator · 70+ Strong · 50+ Needs Coaching · <50 Unsafe",
} as const;

/** Convenience object for use as a KpiCard `tip` prop. */
export const SAFETY_PERFORMANCE_SCORE_TIP = {
  definition: SAFETY_PERFORMANCE_SCORE_CONFIG.definition,
  calculation:
    SAFETY_PERFORMANCE_SCORE_CONFIG.components
      .map((c) => `${c.name} ${c.weight}%`)
      .join(", "),
  howToUse: SAFETY_PERFORMANCE_SCORE_CONFIG.howToUse,
} as const;
