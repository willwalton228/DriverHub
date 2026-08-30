/**
 * Unified Move Ingestion Function (INCREMENT 25B)
 * 
 * Central entry point for all move ingestion:
 * - CSV import
 * - Scheduled import (future)
 * - Manual entry
 * 
 * Responsibilities:
 * 1. Accept source type (CSV | SCHEDULED | MANUAL)
 * 2. Run eligibility checks via evaluateMoveEligibility()
 * 3. Snapshot eligibility at ingest time
 * 4. Persist moves with ingest metadata
 */

import { evaluateMoveEligibility, type DriverEligibility, type MoveContext } from '../services/eligibility';
import { normalizeMoveType } from '@shared/moveType';

export type IngestSource = 'CSV' | 'SCHEDULED' | 'MANUAL';

export interface MoveIngestionInput {
  moveNumber: string;
  driverId?: string | null;
  customerId?: string | null;
  tripDate: Date | string;
  origin: string;
  destination: string;
  distance?: string | number | null;
  duration?: string | null;
  estimatedMinutes?: number | null;
  status?: string;
  moveType?: string | null;
  vehicleType?: string | null;
  billRate?: string | number | null;
  payRate?: string | number | null;
  notes?: string | null;
  marketId?: string | null;
  zoneId?: string | null;
  workType?: string | null;
  executionMode?: string | null;
}

export interface MoveIngestionResult {
  moveNumber: string;
  success: boolean;
  tripId?: string;
  eligibilityStatus: 'PASS' | 'WARN' | 'FAIL';
  eligibilityReasons: string[];
  error?: string;
}

export interface ImportMovesResult {
  source: IngestSource;
  ingestedAt: Date;
  ingestedBy: string;
  totalMoves: number;
  successCount: number;
  failCount: number;
  results: MoveIngestionResult[];
}

export interface ImportMovesContext {
  source: IngestSource;
  ingestedBy: string;
  storage: {
    getDriver: (id: string) => Promise<any>;
    createTrip: (trip: any) => Promise<any>;
    getActivePolicyVersion?: () => Promise<any>;
  };
}

/**
 * importMoves - Unified ingestion function for all move sources
 * 
 * @param moves - Array of moves to ingest
 * @param context - Ingestion context with source, user, and storage
 * @returns Import result with success/fail counts and per-move results
 */
export async function importMoves(
  moves: MoveIngestionInput[],
  context: ImportMovesContext
): Promise<ImportMovesResult> {
  const ingestedAt = new Date();
  const results: MoveIngestionResult[] = [];
  let successCount = 0;
  let failCount = 0;

  for (const move of moves) {
    try {
      const result = await ingestSingleMove(move, context, ingestedAt);
      results.push(result);
      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.push({
        moveNumber: move.moveNumber,
        success: false,
        eligibilityStatus: 'FAIL',
        eligibilityReasons: [`Ingestion error: ${errorMessage}`],
        error: errorMessage,
      });
      failCount++;
    }
  }

  return {
    source: context.source,
    ingestedAt,
    ingestedBy: context.ingestedBy,
    totalMoves: moves.length,
    successCount,
    failCount,
    results,
  };
}

/**
 * ingestSingleMove - Process a single move through the ingestion pipeline
 * 
 * v1 Eligibility Rules (A1 - NO LOSS SCORE):
 * - Unassigned moves (null driverId): PASS - no driver to evaluate
 * - Driver not found: PASS - treated as unassigned
 * - Assigned driver: evaluated per v1 FAIL rules
 * - WARN is reserved for future - not generated in v1
 */
async function ingestSingleMove(
  move: MoveIngestionInput,
  context: ImportMovesContext,
  ingestedAt: Date
): Promise<MoveIngestionResult> {
  // GATE 1: evaluateMoveEligibility creates immutable eligibility snapshot
  let driverEligibility = null;

  // v1: Only evaluate eligibility if driver is assigned AND found
  // Unassigned moves or missing drivers pass eligibility (PASS)
  if (move.driverId) {
    const driver = await context.storage.getDriver(move.driverId);
    if (driver) {
      driverEligibility = buildDriverEligibilityFromDriver(driver);
    }
  }

  const moveContext: MoveContext = {
    moveNumber: move.moveNumber,
    marketId: move.marketId || undefined,
    zoneId: move.zoneId || undefined,
    workType: move.workType || undefined,
    executionMode: move.executionMode || undefined,
  };

  // Get active policy version
  const activePolicy = context.storage.getActivePolicyVersion 
    ? await context.storage.getActivePolicyVersion() 
    : null;
  
  const eligibilitySnapshot = evaluateMoveEligibility(
    driverEligibility, 
    moveContext,
    activePolicy?.id
  );

  // Parse estimated minutes from duration string or use explicit value
  let estimatedMinutesSnapshot = move.estimatedMinutes || 0;
  if (!estimatedMinutesSnapshot && move.duration) {
    const match = move.duration.match(/(\d+)/);
    if (match) estimatedMinutesSnapshot = parseInt(match[1], 10);
  }

  const tripData = {
    moveNumber: move.moveNumber,
    driverId: move.driverId || null,
    customerId: move.customerId || null,
    tripDate: typeof move.tripDate === 'string' ? new Date(move.tripDate) : move.tripDate,
    origin: move.origin,
    destination: move.destination,
    distance: move.distance?.toString() || null,
    duration: move.duration || null,
    estimatedMinutesSnapshot,
    status: move.status || 'completed',
    moveType: normalizeMoveType(move.moveType),
    vehicleType: move.vehicleType || null,
    billRate: move.billRate?.toString() || null,
    payRate: move.payRate?.toString() || null,
    notes: move.notes || null,
    marketId: move.marketId || null,
    zoneId: move.zoneId || null,
    workType: move.workType || null,
    executionMode: move.executionMode || null,
    eligibilityStatus: eligibilitySnapshot.eligibilityStatus,
    eligibilityReasons: eligibilitySnapshot.eligibilityReasons,
    eligibilityCheckedAt: new Date(eligibilitySnapshot.eligibilityCheckedAt),
    eligibilityPolicyVersionId: eligibilitySnapshot.eligibilityPolicyVersionId,
    ingestSource: context.source,
    ingestedAt,
    ingestedBy: context.ingestedBy,
  };

  const createdTrip = await context.storage.createTrip(tripData);

  return {
    moveNumber: move.moveNumber,
    success: true,
    tripId: createdTrip.id,
    eligibilityStatus: eligibilitySnapshot.eligibilityStatus,
    eligibilityReasons: eligibilitySnapshot.eligibilityReasons,
  };
}

/**
 * buildDriverEligibilityFromDriver - Helper to construct eligibility info from driver record
 */
export function buildDriverEligibilityFromDriver(driver: any): DriverEligibility | null {
  if (!driver) return null;
  
  return {
    driverId: driver.id,
    safetyState: driver.safetyState || 'ACTIVE',
    eligibleMarkets: (driver.eligibleMarkets as string[]) || [],
    eligibleZones: (driver.eligibleZones as string[]) || [],
    eligibleWorkTypes: (driver.eligibleWorkTypes as string[]) || [],
    eligibleExecutionModes: (driver.eligibleExecutionModes as string[]) || [],
    blocks: [], // Blocks would be loaded separately if needed
  };
}
