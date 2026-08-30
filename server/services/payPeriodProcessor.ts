/**
 * Pay Period Processing + Export Packets v1 (INCREMENT 4)
 * 
 * Backend-only logic for:
 * 1. Weekly pay period state machine (OPEN → PROCESSING → LOCKED)
 * 2. LOCKED immutability enforcement
 * 3. Export packet generation (ADP CSV for W2, OpenForce CSV for IC)
 * 4. Export audit logging
 */

import { createHash } from 'crypto';
import type { PayPeriodStatus, WorkerType, ExportType } from '@shared/schema';

// ============================================
// TYPES
// ============================================

/** Pay line record for export processing */
export interface PayLineRecord {
  id: string;
  payPeriodId: string;
  driverId: string;
  workerType: WorkerType;
  paidMinutes: number;
  baseRateCents: number;
  basePayCents: number;
  volumeMultiplier: string;
  safetyMultiplier: string;
  effectiveMultiplier: string;
  adjustedPayCents: number;
  finalPayCents: number;
  floorApplied: boolean;
  capApplied: boolean;
}

/** Driver info needed for exports */
export interface DriverExportInfo {
  id: string;
  employeeId?: string | null;
  independentContractorId?: string | null;
  firstName: string;
  lastName: string;
  ssn?: string; // Last 4 for reference
}

/** Pay period with status */
export interface PayPeriodRecord {
  id: string;
  payGroup: string;
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
  status: PayPeriodStatus;
  lockedAt: Date | null;
}

/** Export artifact returned by generateExportsForPayPeriod */
export interface ExportArtifact {
  exportType: ExportType;
  fileName: string;
  content: string;
  fileHash: string;
  rowCount: number;
  totalAmountCents: number;
}

/** Error thrown when attempting to modify a locked pay period */
export class PayPeriodLockedError extends Error {
  constructor(
    public readonly payPeriodId: string,
    public readonly action: string
  ) {
    super(`Cannot ${action} on locked pay period ${payPeriodId}`);
    this.name = 'PayPeriodLockedError';
  }
}

/** Error thrown for invalid state transitions */
export class InvalidStateTransitionError extends Error {
  constructor(
    public readonly payPeriodId: string,
    public readonly fromStatus: PayPeriodStatus,
    public readonly toStatus: PayPeriodStatus
  ) {
    super(`Invalid state transition from ${fromStatus} to ${toStatus} for pay period ${payPeriodId}`);
    this.name = 'InvalidStateTransitionError';
  }
}

// ============================================
// 1. STATE MACHINE
// ============================================

/** Valid state transitions */
const VALID_TRANSITIONS: Record<PayPeriodStatus, PayPeriodStatus[]> = {
  OPEN: ['PROCESSING'],
  PROCESSING: ['LOCKED', 'OPEN'], // Can revert to OPEN if issues found
  LOCKED: [], // No transitions from LOCKED
};

/**
 * Check if a state transition is valid.
 */
export function isValidTransition(
  fromStatus: PayPeriodStatus,
  toStatus: PayPeriodStatus
): boolean {
  return VALID_TRANSITIONS[fromStatus].includes(toStatus);
}

/**
 * Validate and return the new status for a pay period transition.
 * Throws InvalidStateTransitionError if the transition is not allowed.
 */
export function validateStateTransition(
  payPeriodId: string,
  fromStatus: PayPeriodStatus,
  toStatus: PayPeriodStatus
): PayPeriodStatus {
  if (!isValidTransition(fromStatus, toStatus)) {
    throw new InvalidStateTransitionError(payPeriodId, fromStatus, toStatus);
  }
  return toStatus;
}

// ============================================
// 2. IMMUTABILITY ENFORCEMENT
// ============================================

/**
 * Check if a pay period is locked and throw if attempting modification.
 */
export function enforceNotLocked(
  payPeriod: PayPeriodRecord,
  action: string
): void {
  if (payPeriod.status === 'LOCKED') {
    throw new PayPeriodLockedError(payPeriod.id, action);
  }
}

/**
 * Check if a pay line can be added to a pay period.
 * Returns true if the period is OPEN, false otherwise.
 */
export function canAddPayLine(payPeriod: PayPeriodRecord): boolean {
  return payPeriod.status === 'OPEN';
}

/**
 * Check if a pay line can be modified.
 * Returns true only if the period is OPEN.
 */
export function canModifyPayLine(payPeriod: PayPeriodRecord): boolean {
  return payPeriod.status === 'OPEN';
}

// ============================================
// 3. EXPORT GENERATORS
// ============================================

/** ADP CSV column headers */
const ADP_CSV_HEADERS = [
  'Employee_ID',
  'First_Name',
  'Last_Name',
  'Pay_Period_Start',
  'Pay_Period_End',
  'Hours_Worked',
  'Gross_Pay',
  'Pay_Type',
] as const;

/** OpenForce CSV column headers */
const OPENFORCE_CSV_HEADERS = [
  'Contractor_ID',
  'First_Name',
  'Last_Name',
  'Pay_Period_Start',
  'Pay_Period_End',
  'Total_Minutes',
  'Gross_Pay',
  'Settlement_Type',
] as const;

/**
 * Generate ADP CSV export for W2 drivers.
 * 
 * @param payPeriod - The pay period being exported
 * @param payLines - Pay lines for W2 drivers only
 * @param driverInfo - Map of driver ID to driver info
 * @returns CSV content string
 */
export function generateAdpCsv(
  payPeriod: PayPeriodRecord,
  payLines: PayLineRecord[],
  driverInfo: Map<string, DriverExportInfo>
): string {
  // Filter to only W2 drivers
  const w2Lines = payLines.filter(pl => pl.workerType === 'W2_DRIVER');
  
  // Group by driver and sum pay
  const driverTotals = new Map<string, { totalCents: number; totalMinutes: number }>();
  for (const line of w2Lines) {
    const current = driverTotals.get(line.driverId) || { totalCents: 0, totalMinutes: 0 };
    current.totalCents += line.finalPayCents;
    current.totalMinutes += line.paidMinutes;
    driverTotals.set(line.driverId, current);
  }
  
  // Build CSV rows
  const rows: string[] = [ADP_CSV_HEADERS.join(',')];
  
  Array.from(driverTotals.entries()).forEach(([driverId, totals]) => {
    const driver = driverInfo.get(driverId);
    if (!driver) return;
    
    const hours = (totals.totalMinutes / 60).toFixed(2);
    const grossPay = (totals.totalCents / 100).toFixed(2);
    
    rows.push([
      driver.employeeId || '',
      escapeCSV(driver.firstName),
      escapeCSV(driver.lastName),
      payPeriod.periodStart,
      payPeriod.periodEnd,
      hours,
      grossPay,
      'REG', // Regular pay
    ].join(','));
  });
  
  return rows.join('\n');
}

/**
 * Generate OpenForce/OpenMarket CSV export for IC drivers.
 * 
 * @param payPeriod - The pay period being exported
 * @param payLines - Pay lines for IC drivers only
 * @param driverInfo - Map of driver ID to driver info
 * @returns CSV content string
 */
export function generateOpenForceCsv(
  payPeriod: PayPeriodRecord,
  payLines: PayLineRecord[],
  driverInfo: Map<string, DriverExportInfo>
): string {
  // Filter to only IC drivers
  const icLines = payLines.filter(pl => pl.workerType === 'IC_DRIVER');
  
  // Group by driver and sum pay
  const driverTotals = new Map<string, { totalCents: number; totalMinutes: number }>();
  for (const line of icLines) {
    const current = driverTotals.get(line.driverId) || { totalCents: 0, totalMinutes: 0 };
    current.totalCents += line.finalPayCents;
    current.totalMinutes += line.paidMinutes;
    driverTotals.set(line.driverId, current);
  }
  
  // Build CSV rows
  const rows: string[] = [OPENFORCE_CSV_HEADERS.join(',')];
  
  Array.from(driverTotals.entries()).forEach(([driverId, totals]) => {
    const driver = driverInfo.get(driverId);
    if (!driver) return;
    
    const grossPay = (totals.totalCents / 100).toFixed(2);
    
    rows.push([
      driver.independentContractorId || '',
      escapeCSV(driver.firstName),
      escapeCSV(driver.lastName),
      payPeriod.periodStart,
      payPeriod.periodEnd,
      totals.totalMinutes.toString(),
      grossPay,
      'SETTLEMENT',
    ].join(','));
  });
  
  return rows.join('\n');
}

/**
 * Escape a value for CSV (handle commas, quotes, newlines).
 */
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ============================================
// 4. FILE HASH GENERATION
// ============================================

/**
 * Generate SHA-256 hash of file content.
 */
export function generateFileHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

// ============================================
// 5. EXPORT PACKET GENERATION
// ============================================

/**
 * Generate a timestamped filename for an export.
 */
export function generateExportFileName(
  payPeriodId: string,
  exportType: ExportType,
  periodEnd: string
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const typePrefix = exportType === 'ADP_CSV' ? 'ADP' : 'OpenForce';
  return `${typePrefix}_${periodEnd}_${payPeriodId.slice(0, 8)}_${timestamp}.csv`;
}

/**
 * Calculate totals from pay lines for a specific worker type.
 */
export function calculateExportTotals(
  payLines: PayLineRecord[],
  workerType: WorkerType
): { rowCount: number; totalAmountCents: number } {
  const filtered = payLines.filter(pl => pl.workerType === workerType);
  
  // Count unique drivers
  const uniqueDrivers = new Set(filtered.map(pl => pl.driverId));
  
  // Sum total pay
  const totalAmountCents = filtered.reduce((sum, pl) => sum + pl.finalPayCents, 0);
  
  return {
    rowCount: uniqueDrivers.size,
    totalAmountCents,
  };
}

/**
 * Generate all export artifacts for a pay period.
 * Returns file content, hash, and metadata for each export type.
 * 
 * @param payPeriod - The pay period to export
 * @param payLines - All pay lines for the period
 * @param driverInfo - Map of driver ID to driver info
 * @returns Array of export artifacts
 */
export function generateExportsForPayPeriod(
  payPeriod: PayPeriodRecord,
  payLines: PayLineRecord[],
  driverInfo: Map<string, DriverExportInfo>
): ExportArtifact[] {
  const artifacts: ExportArtifact[] = [];
  
  // Check if there are W2 drivers
  const hasW2 = payLines.some(pl => pl.workerType === 'W2_DRIVER');
  if (hasW2) {
    const adpContent = generateAdpCsv(payPeriod, payLines, driverInfo);
    const adpTotals = calculateExportTotals(payLines, 'W2_DRIVER');
    
    artifacts.push({
      exportType: 'ADP_CSV',
      fileName: generateExportFileName(payPeriod.id, 'ADP_CSV', payPeriod.periodEnd),
      content: adpContent,
      fileHash: generateFileHash(adpContent),
      rowCount: adpTotals.rowCount,
      totalAmountCents: adpTotals.totalAmountCents,
    });
  }
  
  // Check if there are IC drivers
  const hasIC = payLines.some(pl => pl.workerType === 'IC_DRIVER');
  if (hasIC) {
    const ofContent = generateOpenForceCsv(payPeriod, payLines, driverInfo);
    const ofTotals = calculateExportTotals(payLines, 'IC_DRIVER');
    
    artifacts.push({
      exportType: 'OPENFORCE_CSV',
      fileName: generateExportFileName(payPeriod.id, 'OPENFORCE_CSV', payPeriod.periodEnd),
      content: ofContent,
      fileHash: generateFileHash(ofContent),
      rowCount: ofTotals.rowCount,
      totalAmountCents: ofTotals.totalAmountCents,
    });
  }
  
  return artifacts;
}

// ============================================
// 6. WEEKLY PAY PERIOD GENERATOR
// ============================================

/**
 * Calculate the start date (Monday) of the week containing a given date.
 */
export function getWeekStartDate(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Calculate the end date (Sunday) of the week containing a given date.
 */
export function getWeekEndDate(date: Date): Date {
  const start = getWeekStartDate(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
}

/**
 * Generate pay period dates for a given week.
 * Returns ISO date strings.
 */
export function generateWeeklyPayPeriodDates(
  referenceDate: Date = new Date()
): { periodStart: string; periodEnd: string } {
  const start = getWeekStartDate(referenceDate);
  const end = getWeekEndDate(referenceDate);
  
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
}

/**
 * Find which pay period a date falls into.
 * Returns null if no matching period.
 */
export function findPayPeriodForDate(
  date: Date,
  payPeriods: PayPeriodRecord[]
): PayPeriodRecord | null {
  const dateStr = date.toISOString().slice(0, 10);
  
  return payPeriods.find(pp => 
    dateStr >= pp.periodStart && dateStr <= pp.periodEnd
  ) || null;
}

/**
 * Find the next OPEN pay period for new pay lines.
 * If the current period is locked, returns the next available period.
 */
export function findOpenPayPeriodForNewLines(
  payPeriods: PayPeriodRecord[]
): PayPeriodRecord | null {
  // Sort by period start date, most recent first
  const sorted = [...payPeriods].sort((a, b) => 
    b.periodStart.localeCompare(a.periodStart)
  );
  
  return sorted.find(pp => pp.status === 'OPEN') || null;
}
