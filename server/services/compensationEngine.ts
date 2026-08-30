/**
 * Compensation Input Engine (INCREMENT 2)
 * 
 * Pure TypeScript logic for payroll input calculations.
 * NO database writes, NO UI, NO pay calculations.
 */

import type { WorkType, ExecutionMode, PolicyVersion, Zone, Market } from "@shared/schema";

// ============================================
// TYPES
// ============================================

/** Fixed time constants for move calculations (in minutes) */
export const MOVE_TIME_CONSTANTS = {
  PICKUP_WAIT: 10,
  DROP_WAIT: 10,
  RETURN_TIME: 8,
} as const;

/** Input for move time calculation */
export interface MoveTimeInput {
  estimatedDriveMinutes: number;
}

/** Result of move time calculation */
export interface MoveTimeResult {
  estimatedDriveMinutes: number;
  pickupWait: number;
  dropWait: number;
  returnTime: number;
  estimatedMinutesTotal: number;
}

/** Geographic coordinates */
export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Input for zone resolution */
export interface ZoneResolutionInput {
  origin: LatLng;
  marketId: string;
  zones: Zone[];
  marketCenterPoint: LatLng;
}

/** Result of zone resolution */
export interface ZoneResolutionResult {
  zone: Zone | null;
  distanceFromCenter: number;
}

/** Input for market resolution */
export interface MarketResolutionInput {
  zone?: Zone | null;
  airportCode?: string | null;
  explicitMarketId?: string | null;
  markets: Market[];
}

/** Result of market resolution */
export interface MarketResolutionResult {
  market: Market | null;
  resolvedVia: 'zone' | 'airport_code' | 'explicit' | 'none';
}

/** Airport code to market code mapping */
export interface AirportMarketMapping {
  airportCode: string;
  marketCode: string;
}

/** Input for policy resolution */
export interface PolicyResolutionInput {
  marketId: string | null;
  workType: WorkType | null;
  executionMode: ExecutionMode | null;
  policies: PolicyVersion[];
}

/** Result of policy resolution */
export interface PolicyResolutionResult {
  policy: PolicyVersion;
  matchLevel: 'exact' | 'execution_mode_null' | 'work_type_null' | 'market_id_null';
}

/** Error thrown when no policy matches */
export class NoPolicyFoundError extends Error {
  constructor(
    public readonly marketId: string | null,
    public readonly workType: WorkType | null,
    public readonly executionMode: ExecutionMode | null
  ) {
    super(
      `No policy found for market_id=${marketId ?? 'NULL'}, ` +
      `work_type=${workType ?? 'NULL'}, execution_mode=${executionMode ?? 'NULL'}`
    );
    this.name = 'NoPolicyFoundError';
  }
}

// ============================================
// 1. MOVE TIME CALCULATION
// ============================================

/**
 * Calculate total estimated minutes for a move.
 * 
 * Formula:
 *   estimated_minutes_total = 
 *     estimated_drive_minutes
 *     + 10 (pickup wait)
 *     + 10 (drop wait)
 *     + 8 (return)
 * 
 * @param input - Move time calculation input
 * @returns Move time result with breakdown
 */
export function calculateMoveTime(input: MoveTimeInput): MoveTimeResult {
  const { estimatedDriveMinutes } = input;
  
  if (estimatedDriveMinutes < 0) {
    throw new Error('estimatedDriveMinutes cannot be negative');
  }

  const estimatedMinutesTotal = 
    estimatedDriveMinutes +
    MOVE_TIME_CONSTANTS.PICKUP_WAIT +
    MOVE_TIME_CONSTANTS.DROP_WAIT +
    MOVE_TIME_CONSTANTS.RETURN_TIME;

  return {
    estimatedDriveMinutes,
    pickupWait: MOVE_TIME_CONSTANTS.PICKUP_WAIT,
    dropWait: MOVE_TIME_CONSTANTS.DROP_WAIT,
    returnTime: MOVE_TIME_CONSTANTS.RETURN_TIME,
    estimatedMinutesTotal,
  };
}

// ============================================
// 2. ZONE RESOLUTION
// ============================================

/**
 * Calculate distance between two points using Haversine formula.
 * Returns distance in miles.
 */
export function calculateDistanceMiles(point1: LatLng, point2: LatLng): number {
  const EARTH_RADIUS_MILES = 3958.8;
  
  const lat1Rad = (point1.latitude * Math.PI) / 180;
  const lat2Rad = (point2.latitude * Math.PI) / 180;
  const deltaLat = ((point2.latitude - point1.latitude) * Math.PI) / 180;
  const deltaLng = ((point2.longitude - point1.longitude) * Math.PI) / 180;

  const a = 
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return EARTH_RADIUS_MILES * c;
}

/**
 * Resolve zone for a given origin point within a market.
 * Returns the smallest-radius zone that contains the origin.
 * 
 * @param input - Zone resolution input
 * @returns Zone resolution result with matched zone or null
 */
export function resolveZone(input: ZoneResolutionInput): ZoneResolutionResult {
  const { origin, marketId, zones, marketCenterPoint } = input;

  // Calculate distance from market center
  const distanceFromCenter = calculateDistanceMiles(origin, marketCenterPoint);

  // Filter zones for this market
  const marketZones = zones.filter(z => z.marketId === marketId);

  if (marketZones.length === 0) {
    return { zone: null, distanceFromCenter };
  }

  // Find zones that contain the origin (distance <= radius)
  // and pick the smallest one
  const matchingZones = marketZones
    .filter(z => distanceFromCenter <= parseFloat(z.radiusMiles))
    .sort((a, b) => parseFloat(a.radiusMiles) - parseFloat(b.radiusMiles));

  const zone = matchingZones.length > 0 ? matchingZones[0] : null;

  return { zone, distanceFromCenter };
}

// ============================================
// 3. MARKET RESOLUTION
// ============================================

/** Default airport to market mappings */
export const DEFAULT_AIRPORT_MARKET_MAPPINGS: AirportMarketMapping[] = [
  { airportCode: 'DFW', marketCode: 'DFW' },
  { airportCode: 'DAL', marketCode: 'DFW' },
  { airportCode: 'JAN', marketCode: 'JACKSON' },
];

/**
 * Resolve market via zone, airport code, or explicit assignment.
 * Priority: explicit > zone > airport_code
 * 
 * @param input - Market resolution input
 * @param airportMappings - Optional custom airport to market mappings
 * @returns Market resolution result
 */
export function resolveMarket(
  input: MarketResolutionInput,
  airportMappings: AirportMarketMapping[] = DEFAULT_AIRPORT_MARKET_MAPPINGS
): MarketResolutionResult {
  const { zone, airportCode, explicitMarketId, markets } = input;

  // Priority 1: Explicit market assignment
  if (explicitMarketId) {
    const market = markets.find(m => m.id === explicitMarketId && m.isActive);
    if (market) {
      return { market, resolvedVia: 'explicit' };
    }
  }

  // Priority 2: Zone-based resolution
  if (zone) {
    const market = markets.find(m => m.id === zone.marketId && m.isActive);
    if (market) {
      return { market, resolvedVia: 'zone' };
    }
  }

  // Priority 3: Airport code lookup
  if (airportCode) {
    const mapping = airportMappings.find(
      m => m.airportCode.toUpperCase() === airportCode.toUpperCase()
    );
    if (mapping) {
      const market = markets.find(
        m => m.code.toUpperCase() === mapping.marketCode.toUpperCase() && m.isActive
      );
      if (market) {
        return { market, resolvedVia: 'airport_code' };
      }
    }
  }

  return { market: null, resolvedVia: 'none' };
}

// ============================================
// 4. POLICY RESOLUTION ENGINE
// ============================================

/**
 * Resolve the applicable policy based on market, work type, and execution mode.
 * 
 * Precedence (most specific to least specific):
 *   a) Exact match (all fields match)
 *   b) execution_mode NULL (market + work_type match)
 *   c) work_type NULL (market + execution_mode match, work_type NULL in policy)
 *   d) market_id NULL (global policy)
 * 
 * @param input - Policy resolution input
 * @returns Policy resolution result
 * @throws NoPolicyFoundError if no matching policy exists
 */
export function resolvePolicy(input: PolicyResolutionInput): PolicyResolutionResult {
  const { marketId, workType, executionMode, policies } = input;

  // Filter to only active/valid policies (effective_start <= now)
  const now = new Date();
  const activePolicies = policies.filter(p => new Date(p.effectiveStart) <= now);

  // a) Exact match: all fields match
  const exactMatch = activePolicies.find(p =>
    p.marketId === marketId &&
    p.workType === workType &&
    p.executionMode === executionMode
  );
  if (exactMatch) {
    return { policy: exactMatch, matchLevel: 'exact' };
  }

  // b) execution_mode NULL: market + work_type match, execution_mode is NULL in policy
  const executionModeNullMatch = activePolicies.find(p =>
    p.marketId === marketId &&
    p.workType === workType &&
    p.executionMode === null
  );
  if (executionModeNullMatch) {
    return { policy: executionModeNullMatch, matchLevel: 'execution_mode_null' };
  }

  // c) work_type NULL: market matches, work_type is NULL in policy
  const workTypeNullMatch = activePolicies.find(p =>
    p.marketId === marketId &&
    p.workType === null &&
    (p.executionMode === executionMode || p.executionMode === null)
  );
  if (workTypeNullMatch) {
    return { policy: workTypeNullMatch, matchLevel: 'work_type_null' };
  }

  // d) market_id NULL: global fallback policy
  const marketNullMatch = activePolicies.find(p =>
    p.marketId === null &&
    (p.workType === workType || p.workType === null) &&
    (p.executionMode === executionMode || p.executionMode === null)
  );
  if (marketNullMatch) {
    return { policy: marketNullMatch, matchLevel: 'market_id_null' };
  }

  // No policy found - throw explicit error
  throw new NoPolicyFoundError(marketId, workType, executionMode);
}

// ============================================
// 5. PAY CALCULATION ENGINE v1 (INCREMENT 3)
// ============================================

/**
 * Money is always stored as cents (integers).
 * No floats stored. Calculations use floats internally,
 * then round to cents at the end.
 */

/** Multiplier configuration for pay adjustments */
export interface PayMultipliers {
  weeklyVolumeMultiplier: number;    // e.g., 1.05 for high volume
  thirtyDaySafetyMultiplier: number; // e.g., 1.03 for good safety record
}

/** Guardrail configuration for pay bounds */
export interface PayGuardrails {
  /** Minimum hourly rate in cents (market/work_type floor) */
  minimumHourlyCents?: number;
  /** Maximum pay per move in cents (on-demand cap) */
  onDemandMaxCapCents?: number;
}

/** Input for calculating pay on a single move/shift */
export interface PayCalculationInput {
  workType: WorkType;
  /** For SHIFT: actual paid minutes. For ON_DEMAND: estimated_minutes_total */
  paidMinutes: number;
  /** Base rate from resolved policy (dollars per hour, e.g., "25.00") */
  baseRateDollars: string;
  /** Optional multipliers */
  multipliers?: Partial<PayMultipliers>;
  /** Optional guardrails */
  guardrails?: PayGuardrails;
}

/** A single pay line item (represents one move or shift segment) */
export interface PayLine {
  /** Unique identifier for this pay line */
  id: string;
  /** Work type: SHIFT or ON_DEMAND */
  workType: WorkType;
  /** Minutes used for pay calculation */
  paidMinutes: number;
  /** Base rate in cents per hour */
  baseRateCents: number;
  /** Raw base pay before multipliers (cents) */
  basePayCents: number;
  /** Combined multiplier (clamped 0.85-1.15) */
  effectiveMultiplier: number;
  /** Pay after multipliers (cents) */
  adjustedPayCents: number;
  /** Final pay after guardrails (cents) */
  finalPayCents: number;
  /** Whether minimum floor was applied */
  floorApplied: boolean;
  /** Whether max cap was applied */
  capApplied: boolean;
}

/** Summary of a pay period (aggregation of PayLines) */
export interface PayPeriodSummary {
  /** Pay period identifier */
  payPeriodId: string;
  /** Total count of pay lines */
  lineCount: number;
  /** Total minutes across all lines */
  totalMinutes: number;
  /** Total base pay before multipliers (cents) */
  totalBasePayCents: number;
  /** Total adjusted pay after multipliers (cents) */
  totalAdjustedPayCents: number;
  /** Total final pay after guardrails (cents) */
  totalFinalPayCents: number;
  /** Count of lines where floor was applied */
  floorAppliedCount: number;
  /** Count of lines where cap was applied */
  capAppliedCount: number;
}

/** Multiplier clamp bounds */
export const MULTIPLIER_CLAMP = {
  MIN: 0.85,
  MAX: 1.15,
} as const;

/**
 * Calculate adjusted pay with multipliers applied.
 * Formula: adjusted_pay_cents = round(base_pay_cents * volume_multiplier * safety_multiplier)
 * 
 * The combined multiplier (volume * safety) is clamped between 0.85 and 1.15.
 * 
 * @param basePayCents - Base pay in cents
 * @param multipliers - Optional partial multipliers (defaults to 1.0)
 * @returns Object with adjusted pay and effective multiplier used
 */
export function calculateAdjustedPay(
  basePayCents: number,
  multipliers?: Partial<PayMultipliers>
): { adjustedPayCents: number; effectiveMultiplier: number; volumeMultiplier: number; safetyMultiplier: number } {
  const volumeMultiplier = multipliers?.weeklyVolumeMultiplier ?? 1.0;
  const safetyMultiplier = multipliers?.thirtyDaySafetyMultiplier ?? 1.0;
  
  // Combined multiplier before clamping
  const rawMultiplier = volumeMultiplier * safetyMultiplier;
  
  // Clamp combined multiplier between 0.85 and 1.15
  const effectiveMultiplier = Math.max(MULTIPLIER_CLAMP.MIN, Math.min(MULTIPLIER_CLAMP.MAX, rawMultiplier));
  
  // adjusted_pay_cents = round(base_pay_cents * volume_multiplier * safety_multiplier)
  // Note: we use clamped effectiveMultiplier
  const adjustedPayCents = Math.round(basePayCents * effectiveMultiplier);
  
  return { adjustedPayCents, effectiveMultiplier, volumeMultiplier, safetyMultiplier };
}

/**
 * Calculate the effective multiplier from weekly volume and safety multipliers.
 * Clamps result between 0.85 and 1.15.
 * 
 * @param multipliers - Optional partial multipliers (defaults to 1.0)
 * @returns Clamped effective multiplier
 * @deprecated Use calculateAdjustedPay instead for clearer formula application
 */
export function calculateEffectiveMultiplier(
  multipliers?: Partial<PayMultipliers>
): number {
  const weeklyVolume = multipliers?.weeklyVolumeMultiplier ?? 1.0;
  const safety = multipliers?.thirtyDaySafetyMultiplier ?? 1.0;
  
  // Multiply the two factors
  const combined = weeklyVolume * safety;
  
  // Clamp between 0.85 and 1.15
  return Math.max(MULTIPLIER_CLAMP.MIN, Math.min(MULTIPLIER_CLAMP.MAX, combined));
}

/**
 * Convert a dollar string (e.g., "25.00") to cents.
 * 
 * @param dollarString - Dollar amount as string
 * @returns Amount in cents (integer)
 */
export function dollarsToCents(dollarString: string): number {
  const dollars = parseFloat(dollarString);
  if (isNaN(dollars)) {
    throw new Error(`Invalid dollar string: ${dollarString}`);
  }
  return Math.round(dollars * 100);
}

/**
 * Calculate base pay in cents.
 * Formula: round((paid_minutes / 60) * base_rate * 100)
 * 
 * @param paidMinutes - Minutes to pay for
 * @param baseRateDollars - Hourly rate in dollars (e.g., 25.00)
 * @returns Base pay in cents (rounded integer)
 */
export function calculateBasePayCents(
  paidMinutes: number,
  baseRateDollars: number
): number {
  if (paidMinutes < 0) {
    throw new Error('paidMinutes cannot be negative');
  }
  if (baseRateDollars < 0) {
    throw new Error('baseRateDollars cannot be negative');
  }
  
  // base_pay_cents = round((paid_minutes / 60) * base_rate * 100)
  const rawCents = (paidMinutes / 60) * baseRateDollars * 100;
  return Math.round(rawCents);
}

/**
 * Apply guardrails (floor and cap) to a pay amount.
 * 
 * @param payCents - Pay amount in cents
 * @param paidMinutes - Minutes worked (for floor calculation)
 * @param workType - Work type (cap only applies to ON_DEMAND)
 * @param guardrails - Optional guardrail configuration
 * @returns Object with final pay and flags
 */
export function applyGuardrails(
  payCents: number,
  paidMinutes: number,
  workType: WorkType,
  guardrails?: PayGuardrails
): { finalPayCents: number; floorApplied: boolean; capApplied: boolean } {
  let finalPayCents = payCents;
  let floorApplied = false;
  let capApplied = false;

  // Apply minimum hourly floor
  if (guardrails?.minimumHourlyCents !== undefined) {
    const floorCents = Math.round((paidMinutes / 60) * guardrails.minimumHourlyCents);
    if (finalPayCents < floorCents) {
      finalPayCents = floorCents;
      floorApplied = true;
    }
  }

  // Apply on-demand max cap (only for ON_DEMAND)
  if (workType === 'ON_DEMAND' && guardrails?.onDemandMaxCapCents !== undefined) {
    if (finalPayCents > guardrails.onDemandMaxCapCents) {
      finalPayCents = guardrails.onDemandMaxCapCents;
      capApplied = true;
    }
  }

  return { finalPayCents, floorApplied, capApplied };
}

/**
 * Calculate pay for a single move or shift segment.
 * 
 * Formula: base_pay_cents = round((minutes / 60) * base_rate * 100)
 * 
 * For SHIFT: minutes = paid_minutes (actual time worked)
 * For ON_DEMAND: minutes = estimated_minutes_total (from calculateMoveTime)
 * 
 * Then apply multipliers (clamped 0.85-1.15) and guardrails.
 * 
 * @param id - Unique identifier for this pay line
 * @param input - Pay calculation input (caller provides appropriate minutes for work type)
 * @returns PayLine with all calculated values
 */
export function calculatePayLine(
  id: string,
  input: PayCalculationInput
): PayLine {
  const { workType, paidMinutes, baseRateDollars, multipliers, guardrails } = input;

  // Parse base rate from string to number
  const baseRateValue = parseFloat(baseRateDollars);
  if (isNaN(baseRateValue)) {
    throw new Error(`Invalid baseRateDollars: ${baseRateDollars}`);
  }

  // Store base rate in cents for reference
  const baseRateCents = dollarsToCents(baseRateDollars);

  // Calculate base pay using formula: round((paid_minutes / 60) * base_rate * 100)
  const basePayCents = calculateBasePayCents(paidMinutes, baseRateValue);

  // Calculate adjusted pay: round(base_pay_cents * volume_multiplier * safety_multiplier)
  const { adjustedPayCents, effectiveMultiplier } = calculateAdjustedPay(basePayCents, multipliers);

  // Apply guardrails
  const { finalPayCents, floorApplied, capApplied } = applyGuardrails(
    adjustedPayCents,
    paidMinutes,
    workType,
    guardrails
  );

  return {
    id,
    workType,
    paidMinutes,
    baseRateCents,
    basePayCents,
    effectiveMultiplier,
    adjustedPayCents,
    finalPayCents,
    floorApplied,
    capApplied,
  };
}

/**
 * Aggregate multiple PayLines into a PayPeriodSummary.
 * 
 * @param payPeriodId - Identifier for the pay period
 * @param payLines - Array of PayLine objects
 * @returns PayPeriodSummary with aggregated totals
 */
export function aggregatePayPeriod(
  payPeriodId: string,
  payLines: PayLine[]
): PayPeriodSummary {
  const summary: PayPeriodSummary = {
    payPeriodId,
    lineCount: payLines.length,
    totalMinutes: 0,
    totalBasePayCents: 0,
    totalAdjustedPayCents: 0,
    totalFinalPayCents: 0,
    floorAppliedCount: 0,
    capAppliedCount: 0,
  };

  for (const line of payLines) {
    summary.totalMinutes += line.paidMinutes;
    summary.totalBasePayCents += line.basePayCents;
    summary.totalAdjustedPayCents += line.adjustedPayCents;
    summary.totalFinalPayCents += line.finalPayCents;
    if (line.floorApplied) summary.floorAppliedCount++;
    if (line.capApplied) summary.capAppliedCount++;
  }

  return summary;
}
