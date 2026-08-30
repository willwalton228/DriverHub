/**
 * Pay Rules Engine
 * Calculates driver earnings from pay profiles + move/hour data.
 * Supports: hourly (W2 OT-aware), per-move, per-mile, salary (stub), hybrid.
 */

import { db } from "../db";
import {
  driverPayProfiles,
  driverEarnings,
  payrollBatches,
  drivers,
  employees,
} from "../../shared/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EarningsCalculationResult {
  baseAmount: number;
  otAmount: number;
  bonusAmount: number;
  adjustmentAmount: number;
  totalAmount: number;
  otHours: number;
  log: CalculationLogEntry[];
}

export interface CalculationLogEntry {
  rule: string;
  input: Record<string, unknown>;
  output: number;
  note?: string;
}

interface BonusRule {
  type: "move_threshold" | "hours_threshold" | "flat";
  threshold?: number;
  bonus: number;
  note?: string;
}

// ─── Core calculation helpers ─────────────────────────────────────────────────

function calcHourly(
  hoursWorked: number,
  hourlyRate: number,
  otMultiplier: number,
  otThreshold: number,
  isEmployee: boolean,
): Pick<EarningsCalculationResult, "baseAmount" | "otAmount" | "otHours" | "log"> {
  const log: CalculationLogEntry[] = [];
  let regularHours: number;
  let otHours = 0;

  if (isEmployee && hoursWorked > otThreshold) {
    regularHours = otThreshold;
    otHours = hoursWorked - otThreshold;
  } else {
    regularHours = hoursWorked;
    otHours = 0;
  }

  const baseAmount = regularHours * hourlyRate;
  const otAmount = otHours * hourlyRate * otMultiplier;

  log.push({
    rule: "hourly_base",
    input: { regularHours, hourlyRate },
    output: baseAmount,
  });

  if (otHours > 0) {
    log.push({
      rule: "overtime",
      input: { otHours, hourlyRate, otMultiplier },
      output: otAmount,
      note: `OT threshold: ${otThreshold}h`,
    });
  }

  return { baseAmount, otAmount, otHours, log };
}

function calcPerMove(
  moveCount: number,
  perMoveRate: number,
): Pick<EarningsCalculationResult, "baseAmount" | "log"> {
  const baseAmount = moveCount * perMoveRate;
  return {
    baseAmount,
    log: [{ rule: "per_move", input: { moveCount, perMoveRate }, output: baseAmount }],
  };
}

function calcPerMile(
  milesLogged: number,
  perMileRate: number,
): Pick<EarningsCalculationResult, "baseAmount" | "log"> {
  const baseAmount = milesLogged * perMileRate;
  return {
    baseAmount,
    log: [{ rule: "per_mile", input: { milesLogged, perMileRate }, output: baseAmount }],
  };
}

function calcBonuses(
  bonusRules: BonusRule[],
  context: { moveCount?: number; hoursWorked?: number },
): Pick<EarningsCalculationResult, "bonusAmount" | "log"> {
  const log: CalculationLogEntry[] = [];
  let bonusAmount = 0;

  for (const rule of bonusRules) {
    if (rule.type === "flat") {
      bonusAmount += rule.bonus;
      log.push({ rule: "bonus_flat", input: {}, output: rule.bonus, note: rule.note });
    } else if (rule.type === "move_threshold" && context.moveCount !== undefined) {
      if (context.moveCount >= (rule.threshold ?? 0)) {
        bonusAmount += rule.bonus;
        log.push({
          rule: "bonus_move_threshold",
          input: { moveCount: context.moveCount, threshold: rule.threshold },
          output: rule.bonus,
          note: rule.note,
        });
      }
    } else if (rule.type === "hours_threshold" && context.hoursWorked !== undefined) {
      if (context.hoursWorked >= (rule.threshold ?? 0)) {
        bonusAmount += rule.bonus;
        log.push({
          rule: "bonus_hours_threshold",
          input: { hoursWorked: context.hoursWorked, threshold: rule.threshold },
          output: rule.bonus,
          note: rule.note,
        });
      }
    }
  }

  return { bonusAmount, log };
}

// ─── Main calculation function ────────────────────────────────────────────────

export interface EarningsInput {
  payType: string;
  workerType: string; // "W2" | "IC"
  hourlyRate?: number | null;
  otMultiplier?: number;
  otThresholdHrs?: number;
  perMoveRate?: number | null;
  perMileRate?: number | null;
  bonusRules?: BonusRule[];
  hoursWorked?: number;
  moveCount?: number;
  milesLogged?: number;
  adjustmentAmount?: number;
}

export function calculateEarnings(input: EarningsInput): EarningsCalculationResult {
  const {
    payType,
    workerType,
    hourlyRate = 0,
    otMultiplier = 1.5,
    otThresholdHrs = 40,
    perMoveRate = 0,
    perMileRate = 0,
    bonusRules = [],
    hoursWorked = 0,
    moveCount = 0,
    milesLogged = 0,
    adjustmentAmount = 0,
  } = input;

  const isEmployee = workerType === "W2";
  let baseAmount = 0;
  let otAmount = 0;
  let otHours = 0;
  const log: CalculationLogEntry[] = [];

  if (payType === "hourly") {
    const result = calcHourly(hoursWorked, hourlyRate ?? 0, otMultiplier, otThresholdHrs, isEmployee);
    baseAmount = result.baseAmount;
    otAmount = result.otAmount;
    otHours = result.otHours;
    log.push(...result.log);
  } else if (payType === "per_move") {
    const result = calcPerMove(moveCount, perMoveRate ?? 0);
    baseAmount = result.baseAmount;
    log.push(...result.log);
  } else if (payType === "per_mile") {
    const result = calcPerMile(milesLogged, perMileRate ?? 0);
    baseAmount = result.baseAmount;
    log.push(...result.log);
  } else if (payType === "hybrid") {
    // Hybrid: per-move base + hourly for time worked
    const moveResult = calcPerMove(moveCount, perMoveRate ?? 0);
    const hourResult = calcHourly(hoursWorked, hourlyRate ?? 0, otMultiplier, otThresholdHrs, isEmployee);
    baseAmount = moveResult.baseAmount + hourResult.baseAmount;
    otAmount = hourResult.otAmount;
    otHours = hourResult.otHours;
    log.push(...moveResult.log, ...hourResult.log);
  } else if (payType === "salary") {
    // Salary: base is weekly fraction of annual salary (handled by profile.salaryAmount directly)
    baseAmount = 0;
    log.push({ rule: "salary_stub", input: {}, output: 0, note: "Salary pay requires manual batch entry" });
  }

  const bonusResult = calcBonuses(bonusRules, { moveCount, hoursWorked });
  const bonusAmount = bonusResult.bonusAmount;
  log.push(...bonusResult.log);

  const totalAmount = baseAmount + otAmount + bonusAmount + adjustmentAmount;

  if (adjustmentAmount !== 0) {
    log.push({
      rule: "manual_adjustment",
      input: { adjustmentAmount },
      output: adjustmentAmount,
    });
  }

  return {
    baseAmount: round4(baseAmount),
    otAmount: round4(otAmount),
    bonusAmount: round4(bonusAmount),
    adjustmentAmount: round4(adjustmentAmount),
    totalAmount: round4(totalAmount),
    otHours: round4(otHours),
    log,
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ─── DB-backed helpers ────────────────────────────────────────────────────────

export async function getPayProfile(driverId: string) {
  const rows = await db
    .select()
    .from(driverPayProfiles)
    .where(eq(driverPayProfiles.driverId, driverId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getOrCreateBatch(
  weekStart: string,
  weekEnd: string,
  payGroup = "DRIVERS_WEEKLY",
) {
  const existing = await db
    .select()
    .from(payrollBatches)
    .where(
      and(
        eq(payrollBatches.weekStart, weekStart),
        eq(payrollBatches.payGroup, payGroup),
      ),
    )
    .limit(1);

  if (existing[0]) return existing[0];

  const rows = await db
    .insert(payrollBatches)
    .values({ weekStart, weekEnd, payGroup, status: "open" })
    .returning();
  return rows[0];
}

export async function recalcBatchTotals(batchId: string) {
  const result = await db.execute(sql`
    SELECT
      COUNT(DISTINCT driver_id)::int AS driver_count,
      COALESCE(SUM(ROUND(total_amount * 100)), 0)::int AS total_cents
    FROM driver_earnings
    WHERE batch_id = ${batchId}
      AND status != 'voided'
  `);
  const row = ((result as any).rows ?? result)[0] as {
    driver_count: number;
    total_cents: number;
  };

  await db
    .update(payrollBatches)
    .set({
      driverCount: row.driver_count,
      totalAmountCents: row.total_cents,
      updatedAt: new Date(),
    })
    .where(eq(payrollBatches.id, batchId));
}

export async function createEarningsRecord(params: {
  driverId: string;
  employeeId?: string | null;
  payProfileId?: string | null;
  batchId?: string | null;
  moveId?: string | null;
  earningDate: string;
  payType: string;
  description?: string;
  hoursWorked?: number;
  moveCount?: number;
  milesLogged?: number;
  calculationSource: string;
  earnings: EarningsCalculationResult;
}) {
  const rows = await db
    .insert(driverEarnings)
    .values({
      driverId: params.driverId,
      employeeId: params.employeeId ?? null,
      payProfileId: params.payProfileId ?? null,
      batchId: params.batchId ?? null,
      moveId: params.moveId ?? null,
      earningDate: params.earningDate,
      payType: params.payType,
      description: params.description ?? null,
      hoursWorked: params.hoursWorked ? String(params.hoursWorked) : null,
      otHours: String(params.earnings.otHours),
      moveCount: params.moveCount ?? null,
      milesLogged: params.milesLogged ? String(params.milesLogged) : null,
      baseAmount: String(params.earnings.baseAmount),
      otAmount: String(params.earnings.otAmount),
      bonusAmount: String(params.earnings.bonusAmount),
      adjustmentAmount: String(params.earnings.adjustmentAmount),
      totalAmount: String(params.earnings.totalAmount),
      status: "pending",
      calculationSource: params.calculationSource,
      calculationLog: params.earnings.log,
    })
    .returning();
  return rows[0];
}
