import { db } from "../db";
import { schedulingSandboxScenarios, schedulingSchedules, schedulingShifts, schedulingAssignments, drivers, users } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

interface SnapshotShift {
  id: string;
  name: string | null;
  locationId: string | null;
  role: string | null;
  workType: string;
  startTime: string;
  endTime: string;
  requiredHeadcount: number;
}

interface SnapshotAssignment {
  id: string;
  shiftId: string;
  driverId: string | null;
  employeeId: string | null;
  workerType: string;
  status: string;
  driverName?: string;
}

interface BaselineSnapshot {
  schedule: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    status: string;
  };
  shifts: SnapshotShift[];
  assignments: SnapshotAssignment[];
}

export interface ScenarioInput {
  type: "reassign_driver" | "remove_assignment" | "add_assignment" | "activate_backup";
  shiftId: string;
  assignmentId?: string;
  newDriverId?: string;
  newDriverName?: string;
  notes?: string;
}

export interface SimulationResults {
  baseline: SimulationMetrics;
  scenario: SimulationMetrics;
  delta: SimulationDelta;
  shiftDetails: ShiftComparisonDetail[];
}

interface SimulationMetrics {
  totalScheduledHours: number;
  regularHours: number;
  overtimeHours: number;
  estimatedLaborCost: number;
  estimatedOtCost: number;
  coverageGaps: number;
  filledSlots: number;
  totalSlots: number;
  coveragePercent: number;
}

interface SimulationDelta {
  overtimeHoursDelta: number;
  laborCostDelta: number;
  coverageGapsDelta: number;
  coveragePercentDelta: number;
}

interface ShiftComparisonDetail {
  shiftId: string;
  shiftName: string;
  baselineAssignments: number;
  scenarioAssignments: number;
  required: number;
  baselineGap: number;
  scenarioGap: number;
}

const HOURLY_RATE = 25;
const OT_MULTIPLIER = 1.5;
const WEEKLY_OT_THRESHOLD = 40;

export async function cloneScheduleToSandbox(scheduleId: string, name: string, description: string | undefined, createdBy: string | undefined) {
  const [schedule] = await db.select().from(schedulingSchedules)
    .where(eq(schedulingSchedules.id, scheduleId));
  if (!schedule) throw new Error("Schedule not found");

  const shifts = await db.select().from(schedulingShifts)
    .where(eq(schedulingShifts.scheduleId, scheduleId));

  const shiftIds = shifts.map(s => s.id);
  let assignments: any[] = [];
  if (shiftIds.length > 0) {
    assignments = await db.select().from(schedulingAssignments)
      .where(inArray(schedulingAssignments.shiftId, shiftIds));
  }

  const driverIds = Array.from(new Set(assignments.filter(a => a.driverId).map(a => a.driverId!)));
  let driverMap = new Map<string, string>();
  if (driverIds.length > 0) {
    const driverRows = await db.select({
      driverId: drivers.id,
      firstName: users.firstName,
      lastName: users.lastName,
    }).from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(inArray(drivers.id, driverIds));
    for (const d of driverRows) {
      driverMap.set(d.driverId, `${d.firstName || ""} ${d.lastName || ""}`.trim());
    }
  }

  const snapshot: BaselineSnapshot = {
    schedule: {
      id: schedule.id,
      name: schedule.name,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      status: schedule.status,
    },
    shifts: shifts.map(s => ({
      id: s.id,
      name: s.name,
      locationId: s.locationId,
      role: s.role,
      workType: s.workType,
      startTime: new Date(s.startTime).toISOString(),
      endTime: new Date(s.endTime).toISOString(),
      requiredHeadcount: s.requiredHeadcount,
    })),
    assignments: assignments.map(a => ({
      id: a.id,
      shiftId: a.shiftId,
      driverId: a.driverId,
      employeeId: a.employeeId,
      workerType: a.workerType,
      status: a.status,
      driverName: a.driverId ? driverMap.get(a.driverId) || "Unknown" : undefined,
    })),
  };

  const [scenario] = await db.insert(schedulingSandboxScenarios).values({
    name,
    description: description || null,
    sourceScheduleId: scheduleId,
    baselineSnapshot: snapshot,
    scenarioInputs: [],
    simulationResults: null,
    status: "draft",
    createdBy: createdBy || null,
  }).returning();

  return scenario;
}

export async function listSandboxScenarios() {
  return db.select().from(schedulingSandboxScenarios);
}

export async function getSandboxScenario(id: string) {
  const [scenario] = await db.select().from(schedulingSandboxScenarios)
    .where(eq(schedulingSandboxScenarios.id, id));
  return scenario || null;
}

export async function updateScenarioInputs(id: string, inputs: ScenarioInput[]) {
  const [scenario] = await db.update(schedulingSandboxScenarios)
    .set({ scenarioInputs: inputs, updatedAt: new Date() })
    .where(eq(schedulingSandboxScenarios.id, id))
    .returning();
  return scenario;
}

export async function deleteSandboxScenario(id: string) {
  await db.delete(schedulingSandboxScenarios)
    .where(eq(schedulingSandboxScenarios.id, id));
}

export async function simulateScenario(id: string): Promise<SimulationResults> {
  const scenario = await getSandboxScenario(id);
  if (!scenario) throw new Error("Scenario not found");

  const snapshot = scenario.baselineSnapshot as unknown as BaselineSnapshot;
  const inputs = (scenario.scenarioInputs || []) as unknown as ScenarioInput[];

  const baselineMetrics = computeMetrics(snapshot.shifts, snapshot.assignments);

  let scenarioAssignments = [...snapshot.assignments];
  for (const input of inputs) {
    switch (input.type) {
      case "reassign_driver": {
        const idx = scenarioAssignments.findIndex(a => a.id === input.assignmentId);
        if (idx >= 0 && input.newDriverId) {
          scenarioAssignments[idx] = {
            ...scenarioAssignments[idx],
            driverId: input.newDriverId,
            driverName: input.newDriverName || "Reassigned",
          };
        }
        break;
      }
      case "remove_assignment": {
        scenarioAssignments = scenarioAssignments.filter(a => a.id !== input.assignmentId);
        break;
      }
      case "add_assignment": {
        scenarioAssignments.push({
          id: `sandbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          shiftId: input.shiftId,
          driverId: input.newDriverId || null,
          employeeId: null,
          workerType: "driver",
          status: "assigned",
          driverName: input.newDriverName || "Added",
        });
        break;
      }
      case "activate_backup": {
        scenarioAssignments.push({
          id: `backup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          shiftId: input.shiftId,
          driverId: input.newDriverId || null,
          employeeId: null,
          workerType: "driver",
          status: "assigned",
          driverName: input.newDriverName || "Backup",
        });
        break;
      }
    }
  }

  const scenarioMetrics = computeMetrics(snapshot.shifts, scenarioAssignments);

  const shiftDetails: ShiftComparisonDetail[] = snapshot.shifts.map(shift => {
    const baseAssignments = snapshot.assignments.filter(a => a.shiftId === shift.id).length;
    const scenAssignments = scenarioAssignments.filter(a => a.shiftId === shift.id).length;
    return {
      shiftId: shift.id,
      shiftName: shift.name || "Unnamed Shift",
      baselineAssignments: baseAssignments,
      scenarioAssignments: scenAssignments,
      required: shift.requiredHeadcount,
      baselineGap: Math.max(0, shift.requiredHeadcount - baseAssignments),
      scenarioGap: Math.max(0, shift.requiredHeadcount - scenAssignments),
    };
  });

  const results: SimulationResults = {
    baseline: baselineMetrics,
    scenario: scenarioMetrics,
    delta: {
      overtimeHoursDelta: scenarioMetrics.overtimeHours - baselineMetrics.overtimeHours,
      laborCostDelta: scenarioMetrics.estimatedLaborCost - baselineMetrics.estimatedLaborCost,
      coverageGapsDelta: scenarioMetrics.coverageGaps - baselineMetrics.coverageGaps,
      coveragePercentDelta: scenarioMetrics.coveragePercent - baselineMetrics.coveragePercent,
    },
    shiftDetails,
  };

  await db.update(schedulingSandboxScenarios)
    .set({ simulationResults: results as any, status: "simulated", updatedAt: new Date() })
    .where(eq(schedulingSandboxScenarios.id, id));

  return results;
}

function computeMetrics(shifts: SnapshotShift[], assignments: SnapshotAssignment[]): SimulationMetrics {
  let totalScheduledHours = 0;
  let totalSlots = 0;
  let filledSlots = 0;
  let coverageGaps = 0;

  const driverWeeklyHours = new Map<string, number>();

  for (const shift of shifts) {
    const durationHours = (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) / (1000 * 60 * 60);
    totalSlots += shift.requiredHeadcount;
    const shiftAssignments = assignments.filter(a => a.shiftId === shift.id);
    filledSlots += shiftAssignments.length;
    const gap = Math.max(0, shift.requiredHeadcount - shiftAssignments.length);
    coverageGaps += gap;

    for (const a of shiftAssignments) {
      totalScheduledHours += durationHours;
      if (a.driverId) {
        const current = driverWeeklyHours.get(a.driverId) || 0;
        driverWeeklyHours.set(a.driverId, current + durationHours);
      }
    }
  }

  let regularHours = 0;
  let overtimeHours = 0;
  for (const [_, hours] of Array.from(driverWeeklyHours.entries())) {
    if (hours > WEEKLY_OT_THRESHOLD) {
      regularHours += WEEKLY_OT_THRESHOLD;
      overtimeHours += hours - WEEKLY_OT_THRESHOLD;
    } else {
      regularHours += hours;
    }
  }

  const estimatedLaborCost = regularHours * HOURLY_RATE + overtimeHours * HOURLY_RATE * OT_MULTIPLIER;
  const estimatedOtCost = overtimeHours * HOURLY_RATE * OT_MULTIPLIER;
  const coveragePercent = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 100;

  return {
    totalScheduledHours: Math.round(totalScheduledHours * 10) / 10,
    regularHours: Math.round(regularHours * 10) / 10,
    overtimeHours: Math.round(overtimeHours * 10) / 10,
    estimatedLaborCost: Math.round(estimatedLaborCost),
    estimatedOtCost: Math.round(estimatedOtCost),
    coverageGaps,
    filledSlots,
    totalSlots,
    coveragePercent,
  };
}
