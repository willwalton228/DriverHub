/**
 * Payroll Export Service (INCREMENT 27)
 * 
 * Handles pay period management and CSV export generation for ADP and OpenForce.
 * 
 * Key Features:
 * - Pay period lifecycle: OPEN → LOCKED
 * - CSV export generation (ADP_CSV, OPENFORCE_CSV)
 * - Eligibility enforcement (only PASS moves exported)
 * - Summary counts for UI
 */

import { createHash } from 'crypto';

export type ExportType = 'ADP_CSV' | 'OPENFORCE_CSV';
export type PayPeriodStatus = 'OPEN' | 'PROCESSING' | 'LOCKED';

export interface PayPeriodInfo {
  id: string;
  payGroup: string;
  periodStart: string;
  periodEnd: string;
  status: PayPeriodStatus;
  createdAt: Date;
  lockedAt?: Date | null;
}

export interface MoveForExport {
  tripId: string;
  moveNumber: string;
  driverId: string | null;
  driverName?: string;
  tripDate: Date | string;
  origin: string;
  destination: string;
  distance?: string | number | null;
  duration?: string | null;
  payRate?: string | number | null;
  eligibilityStatus: 'PASS' | 'WARN' | 'FAIL' | null;
  eligibilityReasons?: string[] | null;
  workType?: string | null;
  executionMode?: string | null;
}

export interface ExportSummary {
  totalMoves: number;
  includedMoves: number;
  excludedMoves: number;
  totalPayCents: number;
}

export interface PayPeriodExportResult {
  allowed: boolean;
  errorCode?: 'PAY_PERIOD_NOT_LOCKED' | 'PAY_PERIOD_NOT_FOUND';
  errorMessage?: string;
  payPeriodId?: string;
  exportType?: ExportType;
  csvContent?: string;
  fileName?: string;
  fileHash?: string;
  summary?: ExportSummary;
  includedMoves?: MoveForExport[];
  excludedMoves?: MoveForExport[];
}

/**
 * Check if pay period is locked (required for export)
 */
export function isPayPeriodLocked(payPeriod: PayPeriodInfo): boolean {
  return payPeriod.status === 'LOCKED';
}

/**
 * Filter moves by eligibility status (only PASS moves are exported)
 */
export function filterEligibleMoves(moves: MoveForExport[]): {
  included: MoveForExport[];
  excluded: MoveForExport[];
} {
  const included: MoveForExport[] = [];
  const excluded: MoveForExport[] = [];

  for (const move of moves) {
    if (move.eligibilityStatus === 'PASS' || move.eligibilityStatus === null) {
      included.push(move);
    } else {
      excluded.push(move);
    }
  }

  return { included, excluded };
}

/**
 * Generate ADP CSV format
 * 
 * ADP CSV columns:
 * Employee ID, Employee Name, Work Date, Move Number, Hours, Pay Rate, Total Pay
 */
export function generateADPCSV(moves: MoveForExport[]): string {
  const headers = [
    'Employee ID',
    'Employee Name', 
    'Work Date',
    'Move Number',
    'Hours',
    'Pay Rate',
    'Total Pay',
    'Origin',
    'Destination',
  ];

  const rows = moves.map(move => {
    const payRate = parseFloat(String(move.payRate || '0'));
    const hours = parseDurationToHours(move.duration);
    const totalPay = (payRate * hours).toFixed(2);
    const workDate = formatDate(move.tripDate);

    return [
      move.driverId || '',
      move.driverName || '',
      workDate,
      move.moveNumber,
      hours.toFixed(2),
      payRate.toFixed(2),
      totalPay,
      escapeCSV(move.origin),
      escapeCSV(move.destination),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Generate OpenForce CSV format
 * 
 * OpenForce CSV columns:
 * Contractor ID, Contractor Name, Service Date, Reference, Miles, Rate, Amount, Work Type
 */
export function generateOpenForceCSV(moves: MoveForExport[]): string {
  const headers = [
    'Contractor ID',
    'Contractor Name',
    'Service Date',
    'Reference',
    'Miles',
    'Rate',
    'Amount',
    'Work Type',
    'From',
    'To',
  ];

  const rows = moves.map(move => {
    const rate = parseFloat(String(move.payRate || '0'));
    const miles = parseFloat(String(move.distance || '0'));
    const amount = rate.toFixed(2);
    const serviceDate = formatDate(move.tripDate);

    return [
      move.driverId || '',
      move.driverName || '',
      serviceDate,
      move.moveNumber,
      miles.toFixed(1),
      rate.toFixed(2),
      amount,
      move.workType || 'ON_DEMAND',
      escapeCSV(move.origin),
      escapeCSV(move.destination),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Generate export for a pay period
 */
export function generatePayPeriodExport(
  payPeriod: PayPeriodInfo,
  moves: MoveForExport[],
  exportType: ExportType
): PayPeriodExportResult {
  if (!isPayPeriodLocked(payPeriod)) {
    return {
      allowed: false,
      errorCode: 'PAY_PERIOD_NOT_LOCKED',
      errorMessage: `Pay period must be LOCKED before export. Current status: ${payPeriod.status}`,
    };
  }

  const { included, excluded } = filterEligibleMoves(moves);

  let csvContent: string;
  let filePrefix: string;

  if (exportType === 'ADP_CSV') {
    csvContent = generateADPCSV(included);
    filePrefix = 'ADP';
  } else {
    csvContent = generateOpenForceCSV(included);
    filePrefix = 'OpenForce';
  }

  const totalPayCents = included.reduce((sum, m) => {
    const pay = parseFloat(String(m.payRate || '0')) * 100;
    return sum + Math.round(pay);
  }, 0);

  const fileName = `${filePrefix}_${payPeriod.payGroup}_${payPeriod.periodStart}_${payPeriod.periodEnd}.csv`;
  const fileHash = createHash('sha256').update(csvContent).digest('hex');

  return {
    allowed: true,
    payPeriodId: payPeriod.id,
    exportType,
    csvContent,
    fileName,
    fileHash,
    summary: {
      totalMoves: moves.length,
      includedMoves: included.length,
      excludedMoves: excluded.length,
      totalPayCents,
    },
    includedMoves: included,
    excludedMoves: excluded,
  };
}

/**
 * Helper: Escape CSV field
 */
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Helper: Format date as YYYY-MM-DD
 */
function formatDate(date: Date | string): string {
  if (typeof date === 'string') {
    return date.split('T')[0];
  }
  return date.toISOString().split('T')[0];
}

/**
 * Helper: Parse duration string to hours
 */
function parseDurationToHours(duration: string | null | undefined): number {
  if (!duration) return 0;
  
  const match = duration.match(/(\d+):(\d+)/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hours + minutes / 60;
  }
  
  const hourMatch = duration.match(/(\d+(?:\.\d+)?)\s*h/i);
  if (hourMatch) {
    return parseFloat(hourMatch[1]);
  }
  
  return parseFloat(duration) || 0;
}

/**
 * Calculate summary counts for a pay period
 */
export function calculatePayPeriodSummary(moves: MoveForExport[]): ExportSummary {
  const { included, excluded } = filterEligibleMoves(moves);
  
  const totalPayCents = included.reduce((sum, m) => {
    const pay = parseFloat(String(m.payRate || '0')) * 100;
    return sum + Math.round(pay);
  }, 0);

  return {
    totalMoves: moves.length,
    includedMoves: included.length,
    excludedMoves: excluded.length,
    totalPayCents,
  };
}
