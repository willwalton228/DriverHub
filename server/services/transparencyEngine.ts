/**
 * Driver Transparency & Auditability Engine (INCREMENT 6)
 * 
 * Read-only views for:
 * 1. Driver pay breakdown per pay period (PayLines + summary)
 * 2. Metric inputs: weekly volume, 30-day safety, multiplier tiers
 * 3. Policy provenance: policy_version_id, match path, fallback used
 * 4. Pay Explanation Packet (JSON + HTML/markdown structure)
 * 5. Read-only access enforcement for LOCKED pay periods
 */

import type { PayPeriodStatus, WorkerType, WorkType, ExecutionMode } from '@shared/schema';
import type { PayLineRecord, PayPeriodRecord } from './payPeriodProcessor';
import { enforceNotLocked, PayPeriodLockedError } from './payPeriodProcessor';

// ============================================
// TYPES
// ============================================

/** Multiplier tier definition */
export interface MultiplierTier {
  tierName: string;
  minValue: number;
  maxValue: number;
  multiplier: string;
}

/** Volume multiplier tiers (based on weekly volume) */
export const VOLUME_MULTIPLIER_TIERS: MultiplierTier[] = [
  { tierName: 'Very Low', minValue: 0, maxValue: 4, multiplier: '0.90' },
  { tierName: 'Low', minValue: 5, maxValue: 9, multiplier: '0.95' },
  { tierName: 'Standard', minValue: 10, maxValue: 19, multiplier: '1.00' },
  { tierName: 'High', minValue: 20, maxValue: 29, multiplier: '1.05' },
  { tierName: 'Very High', minValue: 30, maxValue: Infinity, multiplier: '1.10' },
];

/** Safety multiplier tiers (based on 30-day safety score) */
export const SAFETY_MULTIPLIER_TIERS: MultiplierTier[] = [
  { tierName: 'Critical', minValue: 0, maxValue: 69, multiplier: '0.85' },
  { tierName: 'Needs Improvement', minValue: 70, maxValue: 79, multiplier: '0.95' },
  { tierName: 'Standard', minValue: 80, maxValue: 89, multiplier: '1.00' },
  { tierName: 'Good', minValue: 90, maxValue: 94, multiplier: '1.03' },
  { tierName: 'Excellent', minValue: 95, maxValue: 100, multiplier: '1.05' },
];

/** Input metrics used for pay calculation */
export interface PayMetricInputs {
  weeklyVolume: number;
  volumeTier: MultiplierTier;
  volumeMultiplier: string;
  safetyScore30Day: number;
  safetyTier: MultiplierTier;
  safetyMultiplier: string;
  rawCombinedMultiplier: string;
  clampedCombinedMultiplier: string;
  clampApplied: boolean;
}

/** Policy provenance information */
export interface PolicyProvenance {
  policyVersionId: string;
  policyName: string;
  matchPath: PolicyMatchPath;
  fallbackUsed: boolean;
  matchLevel: 'exact' | 'execution_mode_null' | 'work_type_null' | 'market_id_null';
  effectiveDate: string;
  expiresAt: string | null;
}

/** Policy match path showing resolution details */
export interface PolicyMatchPath {
  marketId: string | null;
  workType: WorkType | null;
  executionMode: ExecutionMode | null;
  matchedMarketId: string | null;
  matchedWorkType: WorkType | null;
  matchedExecutionMode: ExecutionMode | null;
}

/** Extended pay line with breakdown details */
export interface PayLineBreakdown {
  payLineId: string;
  driverId: string;
  workerType: WorkerType;
  periodLabel: string;
  paidMinutes: number;
  paidHours: string;
  baseRateCents: number;
  baseRateFormatted: string;
  basePayCents: number;
  basePayFormatted: string;
  volumeMultiplier: string;
  safetyMultiplier: string;
  effectiveMultiplier: string;
  adjustedPayCents: number;
  adjustedPayFormatted: string;
  finalPayCents: number;
  finalPayFormatted: string;
  floorApplied: boolean;
  capApplied: boolean;
  guardrailNote: string;
}

/** Summary of pay period for a driver */
export interface PayPeriodSummary {
  payPeriodId: string;
  periodStart: string;
  periodEnd: string;
  status: PayPeriodStatus;
  isLocked: boolean;
  totalPayLines: number;
  totalPaidMinutes: number;
  totalPaidHours: string;
  totalBasePayCents: number;
  totalBasePayFormatted: string;
  totalAdjustedPayCents: number;
  totalAdjustedPayFormatted: string;
  totalFinalPayCents: number;
  totalFinalPayFormatted: string;
  averageEffectiveMultiplier: string;
  floorAppliedCount: number;
  capAppliedCount: number;
}

/** Complete driver pay breakdown for a pay period */
export interface DriverPayBreakdown {
  driverId: string;
  driverName: string;
  workerType: WorkerType;
  summary: PayPeriodSummary;
  metricInputs: PayMetricInputs;
  policyProvenance: PolicyProvenance;
  payLines: PayLineBreakdown[];
  generatedAt: string;
}

/** Pay Explanation Packet formats */
export interface PayExplanationPacket {
  format: 'json' | 'markdown' | 'html';
  content: string;
  breakdown: DriverPayBreakdown;
  generatedAt: string;
  isReadOnly: boolean;
}

/** Read-only access result */
export interface ReadOnlyAccessResult {
  allowed: boolean;
  reason: string;
  payPeriodStatus: PayPeriodStatus;
}

/** Driver tier evaluation result */
export interface DriverTierEvaluation {
  driverId: string;
  evaluationDate: string;
  volumeTier: MultiplierTier;
  safetyTier: MultiplierTier;
  overallTier: OverallDriverTier;
  combinedMultiplier: string;
  clampApplied: boolean;
  metrics: {
    weeklyVolume: number;
    safetyScore30Day: number;
  };
  evaluatedAt: string;
}

/** Overall driver tier combining volume and safety */
export type OverallDriverTier = 'Elite' | 'High Performer' | 'Standard' | 'Developing' | 'At Risk';

/** Overall tier thresholds */
export const OVERALL_TIER_THRESHOLDS: Array<{
  tier: OverallDriverTier;
  minCombinedMultiplier: number;
  maxCombinedMultiplier: number;
  description: string;
}> = [
  { tier: 'Elite', minCombinedMultiplier: 1.10, maxCombinedMultiplier: 1.15, description: 'Top performer with exceptional volume and safety' },
  { tier: 'High Performer', minCombinedMultiplier: 1.03, maxCombinedMultiplier: 1.099, description: 'Above average in volume and safety metrics' },
  { tier: 'Standard', minCombinedMultiplier: 0.95, maxCombinedMultiplier: 1.029, description: 'Meeting baseline expectations' },
  { tier: 'Developing', minCombinedMultiplier: 0.90, maxCombinedMultiplier: 0.949, description: 'Below expectations, improvement needed' },
  { tier: 'At Risk', minCombinedMultiplier: 0.85, maxCombinedMultiplier: 0.899, description: 'Significant improvement required' },
];

/** Base rate configuration per tier (in cents per hour) */
export interface TierRateConfig {
  tier: OverallDriverTier;
  baseRateCents: number;
  description: string;
}

/** Default base rates per tier (cents/hour) */
export const TIER_BASE_RATES: TierRateConfig[] = [
  { tier: 'Elite', baseRateCents: 3000, description: '$30.00/hr - Premium rate for top performers' },
  { tier: 'High Performer', baseRateCents: 2750, description: '$27.50/hr - Above standard rate' },
  { tier: 'Standard', baseRateCents: 2500, description: '$25.00/hr - Standard base rate' },
  { tier: 'Developing', baseRateCents: 2250, description: '$22.50/hr - Development rate' },
  { tier: 'At Risk', baseRateCents: 2000, description: '$20.00/hr - Minimum rate' },
];

/**
 * Get the base rate (in cents) for a given driver tier.
 * 
 * @param tier - The driver's overall performance tier
 * @returns Base rate in cents per hour
 */
export function policyRateFor(tier: OverallDriverTier): number {
  const config = TIER_BASE_RATES.find(r => r.tier === tier);
  return config?.baseRateCents ?? TIER_BASE_RATES[2].baseRateCents; // Default to Standard
}

/**
 * Get the full rate configuration for a tier.
 */
export function getTierRateConfig(tier: OverallDriverTier): TierRateConfig {
  return TIER_BASE_RATES.find(r => r.tier === tier) ?? TIER_BASE_RATES[2];
}

// ============================================
// 1. MULTIPLIER TIER RESOLUTION
// ============================================

/**
 * Find the volume multiplier tier for a given weekly volume.
 */
export function findVolumeTier(weeklyVolume: number): MultiplierTier {
  for (const tier of VOLUME_MULTIPLIER_TIERS) {
    if (weeklyVolume >= tier.minValue && weeklyVolume <= tier.maxValue) {
      return tier;
    }
  }
  return VOLUME_MULTIPLIER_TIERS[VOLUME_MULTIPLIER_TIERS.length - 1];
}

/**
 * Find the safety multiplier tier for a given 30-day safety score.
 */
export function findSafetyTier(safetyScore: number): MultiplierTier {
  for (const tier of SAFETY_MULTIPLIER_TIERS) {
    if (safetyScore >= tier.minValue && safetyScore <= tier.maxValue) {
      return tier;
    }
  }
  return SAFETY_MULTIPLIER_TIERS[0]; // Fallback to Critical
}

/**
 * Calculate combined multiplier with clamping [0.85, 1.15].
 */
export function calculateClampedMultiplier(
  volumeMultiplier: string,
  safetyMultiplier: string
): { raw: string; clamped: string; clampApplied: boolean } {
  const volume = parseFloat(volumeMultiplier);
  const safety = parseFloat(safetyMultiplier);
  const raw = volume * safety;
  const clamped = Math.max(0.85, Math.min(1.15, raw));
  
  return {
    raw: raw.toFixed(4),
    clamped: clamped.toFixed(4),
    clampApplied: raw !== clamped,
  };
}

/**
 * Find the overall driver tier based on combined multiplier.
 */
export function findOverallTier(clampedMultiplier: number): OverallDriverTier {
  for (const threshold of OVERALL_TIER_THRESHOLDS) {
    if (clampedMultiplier >= threshold.minCombinedMultiplier && 
        clampedMultiplier <= threshold.maxCombinedMultiplier) {
      return threshold.tier;
    }
  }
  return 'At Risk';
}

/**
 * Evaluate a driver's performance tier based on their metrics.
 * 
 * @param driverId - The driver's unique identifier
 * @param evaluationDate - The date for which to evaluate (YYYY-MM-DD format)
 * @param weeklyVolume - Number of trips/jobs completed in the evaluation week
 * @param safetyScore30Day - Rolling 30-day safety score (0-100)
 * @returns DriverTierEvaluation with volume, safety, and overall tier
 */
export function evaluateDriverTier(
  driverId: string,
  evaluationDate: string,
  weeklyVolume: number,
  safetyScore30Day: number
): DriverTierEvaluation {
  const volumeTier = findVolumeTier(weeklyVolume);
  const safetyTier = findSafetyTier(safetyScore30Day);
  
  const { clamped, clampApplied } = calculateClampedMultiplier(
    volumeTier.multiplier,
    safetyTier.multiplier
  );
  
  const overallTier = findOverallTier(parseFloat(clamped));
  
  return {
    driverId,
    evaluationDate,
    volumeTier,
    safetyTier,
    overallTier,
    combinedMultiplier: clamped,
    clampApplied,
    metrics: {
      weeklyVolume,
      safetyScore30Day,
    },
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Build complete metric inputs from raw values.
 */
export function buildPayMetricInputs(
  weeklyVolume: number,
  safetyScore30Day: number
): PayMetricInputs {
  const volumeTier = findVolumeTier(weeklyVolume);
  const safetyTier = findSafetyTier(safetyScore30Day);
  const { raw, clamped, clampApplied } = calculateClampedMultiplier(
    volumeTier.multiplier,
    safetyTier.multiplier
  );

  return {
    weeklyVolume,
    volumeTier,
    volumeMultiplier: volumeTier.multiplier,
    safetyScore30Day,
    safetyTier,
    safetyMultiplier: safetyTier.multiplier,
    rawCombinedMultiplier: raw,
    clampedCombinedMultiplier: clamped,
    clampApplied,
  };
}

// ============================================
// 2. POLICY PROVENANCE
// ============================================

/**
 * Build policy provenance information.
 */
export function buildPolicyProvenance(
  policyVersionId: string,
  policyName: string,
  matchLevel: 'exact' | 'execution_mode_null' | 'work_type_null' | 'market_id_null',
  effectiveDate: string,
  expiresAt: string | null,
  requestedMarketId: string | null,
  requestedWorkType: WorkType | null,
  requestedExecutionMode: ExecutionMode | null,
  matchedMarketId: string | null,
  matchedWorkType: WorkType | null,
  matchedExecutionMode: ExecutionMode | null
): PolicyProvenance {
  const fallbackUsed = matchLevel !== 'exact';

  return {
    policyVersionId,
    policyName,
    matchPath: {
      marketId: requestedMarketId,
      workType: requestedWorkType,
      executionMode: requestedExecutionMode,
      matchedMarketId,
      matchedWorkType,
      matchedExecutionMode,
    },
    fallbackUsed,
    matchLevel,
    effectiveDate,
    expiresAt,
  };
}

/**
 * Describe the policy match path in human-readable format.
 */
export function describeMatchPath(provenance: PolicyProvenance): string {
  const { matchPath, matchLevel, fallbackUsed } = provenance;
  
  if (!fallbackUsed) {
    return 'Exact match: Policy matched all requested criteria.';
  }

  const parts: string[] = [];
  
  if (matchLevel === 'execution_mode_null') {
    parts.push(`Fallback: Execution mode '${matchPath.executionMode}' not found, using any execution mode.`);
  }
  if (matchLevel === 'work_type_null') {
    parts.push(`Fallback: Work type '${matchPath.workType}' not found, using any work type.`);
  }
  if (matchLevel === 'market_id_null') {
    parts.push(`Fallback: Market '${matchPath.marketId}' not found, using default market policy.`);
  }

  return parts.length > 0 ? parts.join(' ') : 'Unknown fallback path.';
}

// ============================================
// 3. PAY LINE BREAKDOWN
// ============================================

/**
 * Format cents as currency string.
 */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Format minutes as hours string.
 */
export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return hours.toFixed(2);
}

/**
 * Build a pay line breakdown from a pay line record.
 */
export function buildPayLineBreakdown(
  payLine: PayLineRecord,
  periodLabel: string
): PayLineBreakdown {
  let guardrailNote = '';
  if (payLine.floorApplied && payLine.capApplied) {
    guardrailNote = 'Both hourly floor and on-demand cap were evaluated.';
  } else if (payLine.floorApplied) {
    guardrailNote = 'Hourly floor applied - pay adjusted to minimum hourly rate.';
  } else if (payLine.capApplied) {
    guardrailNote = 'On-demand cap applied - pay adjusted to maximum for on-demand work.';
  } else {
    guardrailNote = 'No guardrails applied.';
  }

  return {
    payLineId: payLine.id,
    driverId: payLine.driverId,
    workerType: payLine.workerType,
    periodLabel,
    paidMinutes: payLine.paidMinutes,
    paidHours: formatHours(payLine.paidMinutes),
    baseRateCents: payLine.baseRateCents,
    baseRateFormatted: formatCents(payLine.baseRateCents) + '/hr',
    basePayCents: payLine.basePayCents,
    basePayFormatted: formatCents(payLine.basePayCents),
    volumeMultiplier: payLine.volumeMultiplier,
    safetyMultiplier: payLine.safetyMultiplier,
    effectiveMultiplier: payLine.effectiveMultiplier,
    adjustedPayCents: payLine.adjustedPayCents,
    adjustedPayFormatted: formatCents(payLine.adjustedPayCents),
    finalPayCents: payLine.finalPayCents,
    finalPayFormatted: formatCents(payLine.finalPayCents),
    floorApplied: payLine.floorApplied,
    capApplied: payLine.capApplied,
    guardrailNote,
  };
}

// ============================================
// 4. PAY PERIOD SUMMARY
// ============================================

/**
 * Build a pay period summary from pay lines.
 */
export function buildPayPeriodSummary(
  payPeriod: PayPeriodRecord,
  payLines: PayLineRecord[]
): PayPeriodSummary {
  const totalPaidMinutes = payLines.reduce((sum, pl) => sum + pl.paidMinutes, 0);
  const totalBasePayCents = payLines.reduce((sum, pl) => sum + pl.basePayCents, 0);
  const totalAdjustedPayCents = payLines.reduce((sum, pl) => sum + pl.adjustedPayCents, 0);
  const totalFinalPayCents = payLines.reduce((sum, pl) => sum + pl.finalPayCents, 0);
  const floorAppliedCount = payLines.filter(pl => pl.floorApplied).length;
  const capAppliedCount = payLines.filter(pl => pl.capApplied).length;

  // Calculate average effective multiplier
  let avgMultiplier = '1.0000';
  if (payLines.length > 0) {
    const sumMultipliers = payLines.reduce(
      (sum, pl) => sum + parseFloat(pl.effectiveMultiplier),
      0
    );
    avgMultiplier = (sumMultipliers / payLines.length).toFixed(4);
  }

  return {
    payPeriodId: payPeriod.id,
    periodStart: payPeriod.periodStart,
    periodEnd: payPeriod.periodEnd,
    status: payPeriod.status,
    isLocked: payPeriod.status === 'LOCKED',
    totalPayLines: payLines.length,
    totalPaidMinutes,
    totalPaidHours: formatHours(totalPaidMinutes),
    totalBasePayCents,
    totalBasePayFormatted: formatCents(totalBasePayCents),
    totalAdjustedPayCents,
    totalAdjustedPayFormatted: formatCents(totalAdjustedPayCents),
    totalFinalPayCents,
    totalFinalPayFormatted: formatCents(totalFinalPayCents),
    averageEffectiveMultiplier: avgMultiplier,
    floorAppliedCount,
    capAppliedCount,
  };
}

// ============================================
// 5. DRIVER PAY BREAKDOWN
// ============================================

/**
 * Build complete driver pay breakdown for a pay period.
 */
export function buildDriverPayBreakdown(
  driverId: string,
  driverName: string,
  workerType: WorkerType,
  payPeriod: PayPeriodRecord,
  payLines: PayLineRecord[],
  metricInputs: PayMetricInputs,
  policyProvenance: PolicyProvenance
): DriverPayBreakdown {
  const periodLabel = `${payPeriod.periodStart} to ${payPeriod.periodEnd}`;
  const driverPayLines = payLines.filter(pl => pl.driverId === driverId);
  
  return {
    driverId,
    driverName,
    workerType,
    summary: buildPayPeriodSummary(payPeriod, driverPayLines),
    metricInputs,
    policyProvenance,
    payLines: driverPayLines.map(pl => buildPayLineBreakdown(pl, periodLabel)),
    generatedAt: new Date().toISOString(),
  };
}

// ============================================
// 6. PAY EXPLANATION PACKET
// ============================================

/**
 * Generate JSON format explanation packet.
 */
function generateJsonPacket(breakdown: DriverPayBreakdown): string {
  return JSON.stringify(breakdown, null, 2);
}

/**
 * Generate Markdown format explanation packet.
 */
function generateMarkdownPacket(breakdown: DriverPayBreakdown): string {
  const { summary, metricInputs, policyProvenance, payLines } = breakdown;
  
  let md = `# Pay Statement: ${breakdown.driverName}\n\n`;
  md += `**Pay Period:** ${summary.periodStart} to ${summary.periodEnd}\n`;
  md += `**Status:** ${summary.status}${summary.isLocked ? ' (Read-Only)' : ''}\n`;
  md += `**Generated:** ${breakdown.generatedAt}\n\n`;

  // Summary Section
  md += `## Summary\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Total Hours | ${summary.totalPaidHours} hrs |\n`;
  md += `| Base Pay | ${summary.totalBasePayFormatted} |\n`;
  md += `| Adjusted Pay | ${summary.totalAdjustedPayFormatted} |\n`;
  md += `| **Final Pay** | **${summary.totalFinalPayFormatted}** |\n`;
  md += `| Avg Multiplier | ${summary.averageEffectiveMultiplier}x |\n\n`;

  // Metric Inputs Section
  md += `## Performance Metrics\n\n`;
  md += `### Volume\n`;
  md += `- Weekly Volume: **${metricInputs.weeklyVolume}** moves\n`;
  md += `- Tier: ${metricInputs.volumeTier.tierName} (${metricInputs.volumeTier.minValue}-${metricInputs.volumeTier.maxValue === Infinity ? '∞' : metricInputs.volumeTier.maxValue})\n`;
  md += `- Multiplier: **${metricInputs.volumeMultiplier}x**\n\n`;

  md += `### Safety (30-Day)\n`;
  md += `- Safety Score: **${metricInputs.safetyScore30Day}**\n`;
  md += `- Tier: ${metricInputs.safetyTier.tierName} (${metricInputs.safetyTier.minValue}-${metricInputs.safetyTier.maxValue})\n`;
  md += `- Multiplier: **${metricInputs.safetyMultiplier}x**\n\n`;

  md += `### Combined Multiplier\n`;
  md += `- Raw: ${metricInputs.rawCombinedMultiplier}x\n`;
  md += `- Clamped: **${metricInputs.clampedCombinedMultiplier}x**`;
  if (metricInputs.clampApplied) {
    md += ` _(clamped to [0.85, 1.15] range)_`;
  }
  md += `\n\n`;

  // Policy Provenance Section
  md += `## Policy Details\n\n`;
  md += `- **Policy:** ${policyProvenance.policyName} (v${policyProvenance.policyVersionId})\n`;
  md += `- **Effective:** ${policyProvenance.effectiveDate}\n`;
  if (policyProvenance.expiresAt) {
    md += `- **Expires:** ${policyProvenance.expiresAt}\n`;
  }
  md += `- **Match Level:** ${policyProvenance.matchLevel}\n`;
  md += `- **Match Path:** ${describeMatchPath(policyProvenance)}\n\n`;

  // Pay Lines Detail
  if (payLines.length > 0) {
    md += `## Pay Line Details\n\n`;
    md += `| Hours | Base Rate | Base Pay | Multiplier | Adjusted | Final | Notes |\n`;
    md += `|-------|-----------|----------|------------|----------|-------|-------|\n`;
    
    for (const line of payLines) {
      md += `| ${line.paidHours} | ${line.baseRateFormatted} | ${line.basePayFormatted} | `;
      md += `${line.effectiveMultiplier}x | ${line.adjustedPayFormatted} | `;
      md += `${line.finalPayFormatted} | ${line.guardrailNote} |\n`;
    }
    md += `\n`;
  }

  // Multiplier Tier Reference
  md += `## Reference: Multiplier Tiers\n\n`;
  md += `### Volume Tiers\n`;
  md += `| Tier | Range | Multiplier |\n`;
  md += `|------|-------|------------|\n`;
  for (const tier of VOLUME_MULTIPLIER_TIERS) {
    md += `| ${tier.tierName} | ${tier.minValue}-${tier.maxValue === Infinity ? '∞' : tier.maxValue} | ${tier.multiplier}x |\n`;
  }
  md += `\n`;

  md += `### Safety Tiers\n`;
  md += `| Tier | Range | Multiplier |\n`;
  md += `|------|-------|------------|\n`;
  for (const tier of SAFETY_MULTIPLIER_TIERS) {
    md += `| ${tier.tierName} | ${tier.minValue}-${tier.maxValue} | ${tier.multiplier}x |\n`;
  }
  md += `\n`;

  return md;
}

/**
 * Generate HTML format explanation packet.
 */
function generateHtmlPacket(breakdown: DriverPayBreakdown): string {
  const { summary, metricInputs, policyProvenance, payLines } = breakdown;
  
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pay Statement - ${breakdown.driverName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #FF6B35; border-bottom: 2px solid #FF6B35; padding-bottom: 10px; }
    h2 { color: #333; margin-top: 30px; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
    th { background: #f5f5f5; }
    .summary-value { font-weight: bold; color: #FF6B35; }
    .metric-box { background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 10px 0; }
    .locked-badge { background: #e74c3c; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
    .match-path { background: #fff3cd; padding: 10px; border-radius: 4px; margin: 10px 0; }
    .guardrail { font-style: italic; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Pay Statement: ${breakdown.driverName}</h1>
  <p><strong>Pay Period:</strong> ${summary.periodStart} to ${summary.periodEnd}</p>
  <p><strong>Status:</strong> ${summary.status} ${summary.isLocked ? '<span class="locked-badge">Read-Only</span>' : ''}</p>
  <p><strong>Generated:</strong> ${breakdown.generatedAt}</p>

  <h2>Summary</h2>
  <table>
    <tr><td>Total Hours</td><td class="summary-value">${summary.totalPaidHours} hrs</td></tr>
    <tr><td>Base Pay</td><td>${summary.totalBasePayFormatted}</td></tr>
    <tr><td>Adjusted Pay</td><td>${summary.totalAdjustedPayFormatted}</td></tr>
    <tr><td><strong>Final Pay</strong></td><td class="summary-value">${summary.totalFinalPayFormatted}</td></tr>
    <tr><td>Avg Multiplier</td><td>${summary.averageEffectiveMultiplier}x</td></tr>
  </table>

  <h2>Performance Metrics</h2>
  <div class="metric-box">
    <h3>Volume</h3>
    <p>Weekly Volume: <strong>${metricInputs.weeklyVolume}</strong> moves</p>
    <p>Tier: ${metricInputs.volumeTier.tierName} (${metricInputs.volumeTier.minValue}-${metricInputs.volumeTier.maxValue === Infinity ? '∞' : metricInputs.volumeTier.maxValue})</p>
    <p>Multiplier: <strong>${metricInputs.volumeMultiplier}x</strong></p>
  </div>
  <div class="metric-box">
    <h3>Safety (30-Day)</h3>
    <p>Safety Score: <strong>${metricInputs.safetyScore30Day}</strong></p>
    <p>Tier: ${metricInputs.safetyTier.tierName} (${metricInputs.safetyTier.minValue}-${metricInputs.safetyTier.maxValue})</p>
    <p>Multiplier: <strong>${metricInputs.safetyMultiplier}x</strong></p>
  </div>
  <div class="metric-box">
    <h3>Combined Multiplier</h3>
    <p>Raw: ${metricInputs.rawCombinedMultiplier}x</p>
    <p>Clamped: <strong>${metricInputs.clampedCombinedMultiplier}x</strong>
    ${metricInputs.clampApplied ? '<em>(clamped to [0.85, 1.15] range)</em>' : ''}</p>
  </div>

  <h2>Policy Details</h2>
  <table>
    <tr><td>Policy</td><td>${policyProvenance.policyName} (v${policyProvenance.policyVersionId})</td></tr>
    <tr><td>Effective</td><td>${policyProvenance.effectiveDate}</td></tr>
    ${policyProvenance.expiresAt ? `<tr><td>Expires</td><td>${policyProvenance.expiresAt}</td></tr>` : ''}
    <tr><td>Match Level</td><td>${policyProvenance.matchLevel}</td></tr>
  </table>
  <div class="match-path">
    <strong>Match Path:</strong> ${describeMatchPath(policyProvenance)}
  </div>`;

  if (payLines.length > 0) {
    html += `
  <h2>Pay Line Details</h2>
  <table>
    <thead>
      <tr>
        <th>Hours</th>
        <th>Base Rate</th>
        <th>Base Pay</th>
        <th>Multiplier</th>
        <th>Adjusted</th>
        <th>Final</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>`;
    
    for (const line of payLines) {
      html += `
      <tr>
        <td>${line.paidHours}</td>
        <td>${line.baseRateFormatted}</td>
        <td>${line.basePayFormatted}</td>
        <td>${line.effectiveMultiplier}x</td>
        <td>${line.adjustedPayFormatted}</td>
        <td>${line.finalPayFormatted}</td>
        <td class="guardrail">${line.guardrailNote}</td>
      </tr>`;
    }
    
    html += `
    </tbody>
  </table>`;
  }

  html += `
</body>
</html>`;

  return html;
}

/**
 * Generate a Pay Explanation Packet in the specified format.
 */
export function generatePayExplanationPacket(
  breakdown: DriverPayBreakdown,
  format: 'json' | 'markdown' | 'html' = 'json'
): PayExplanationPacket {
  let content: string;
  
  switch (format) {
    case 'json':
      content = generateJsonPacket(breakdown);
      break;
    case 'markdown':
      content = generateMarkdownPacket(breakdown);
      break;
    case 'html':
      content = generateHtmlPacket(breakdown);
      break;
  }

  return {
    format,
    content,
    breakdown,
    generatedAt: new Date().toISOString(),
    isReadOnly: breakdown.summary.isLocked,
  };
}

// ============================================
// 7. READ-ONLY ACCESS ENFORCEMENT
// ============================================

/**
 * Check if read-only access is allowed for a pay period.
 * Read-only access is always allowed; this checks the status for informational purposes.
 */
export function checkReadOnlyAccess(payPeriod: PayPeriodRecord): ReadOnlyAccessResult {
  return {
    allowed: true,
    reason: payPeriod.status === 'LOCKED' 
      ? 'Pay period is locked. All data is read-only.'
      : `Pay period is ${payPeriod.status}. Data may still change.`,
    payPeriodStatus: payPeriod.status,
  };
}

/**
 * Verify that a pay period is in read-only mode (LOCKED).
 * Throws PayPeriodLockedError if attempting to modify a LOCKED period.
 */
export function enforceReadOnly(
  payPeriod: PayPeriodRecord,
  attemptedAction: string
): void {
  if (payPeriod.status === 'LOCKED') {
    throw new PayPeriodLockedError(payPeriod.id, attemptedAction);
  }
}

/**
 * Get available actions for a pay period based on its status.
 */
export function getAvailableActions(payPeriod: PayPeriodRecord): {
  canView: boolean;
  canEdit: boolean;
  canExport: boolean;
  canLock: boolean;
} {
  switch (payPeriod.status) {
    case 'OPEN':
      return { canView: true, canEdit: true, canExport: false, canLock: false };
    case 'PROCESSING':
      return { canView: true, canEdit: false, canExport: true, canLock: true };
    case 'LOCKED':
      return { canView: true, canEdit: false, canExport: true, canLock: false };
    default:
      return { canView: true, canEdit: false, canExport: false, canLock: false };
  }
}
