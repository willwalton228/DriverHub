import { db } from "../db";
import { drivers, trips, shiftAssignments, shifts, users } from "@shared/schema";
import { eq, and, gte, lte, sql, count, sum, isNotNull, inArray } from "drizzle-orm";

export interface DriverWorkloadMetrics {
  driverId: string;
  driverName: string;
  driverNumber: string | null;
  market: string | null;
  status: string | null;
  scheduledHours: number;
  moveCount: number;
  movesPerHour: number;
  availabilityHours: number;
  utilizationPercent: number;
  overtimeShifts: number;
  flags: WorkloadFlag[];
  suggestions: AdvisorySuggestion[];
}

export interface WorkloadFlag {
  type: "high_density" | "low_utilization" | "overtime_risk" | "no_moves" | "unscheduled_moves";
  severity: "warning" | "critical";
  label: string;
  detail: string;
}

export interface AdvisorySuggestion {
  type: "redistribute" | "add_capacity" | "reduce_load" | "review_availability";
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
}

export interface LoadBalancingFilters {
  startDate: string;
  endDate: string;
  market?: string;
  flagsOnly?: boolean;
}

export interface LoadBalancingSummary {
  totalDrivers: number;
  avgMovesPerDriver: number;
  avgScheduledHours: number;
  flaggedDrivers: number;
  highDensityCount: number;
  lowUtilizationCount: number;
  overtimeRiskCount: number;
}

export interface LoadBalancingResult {
  drivers: DriverWorkloadMetrics[];
  summary: LoadBalancingSummary;
}

const HIGH_DENSITY_THRESHOLD = 3.0;
const LOW_UTILIZATION_MOVE_THRESHOLD = 2;
const LOW_UTILIZATION_HOURS_THRESHOLD = 20;
const OVERTIME_SHIFT_THRESHOLD = 2;

export async function getDriverWorkloads(
  filters: LoadBalancingFilters
): Promise<LoadBalancingResult> {
  const { startDate, endDate, market, flagsOnly } = filters;

  const activeDrivers = await db
    .select({
      id: drivers.id,
      userId: drivers.userId,
      driverNumber: drivers.driverNumber,
      market: drivers.market,
      status: drivers.status,
      hoursWtd: drivers.hoursWtd,
      hoursMtd: drivers.hoursMtd,
    })
    .from(drivers)
    .where(
      and(
        eq(drivers.status, "active"),
        ...(market ? [eq(drivers.market, market)] : [])
      )
    );

  if (activeDrivers.length === 0) {
    return {
      drivers: [],
      summary: {
        totalDrivers: 0,
        avgMovesPerDriver: 0,
        avgScheduledHours: 0,
        flaggedDrivers: 0,
        highDensityCount: 0,
        lowUtilizationCount: 0,
        overtimeRiskCount: 0,
      },
    };
  }

  const driverIds = activeDrivers.map((d) => d.id);
  const userIds = activeDrivers.map((d) => d.userId);

  const userRows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(inArray(users.id, userIds));

  const userMap = new Map(userRows.map((u) => [u.id, u]));

  const moveCountsRaw = await db
    .select({
      driverId: trips.driverId,
      moveCount: count(trips.id),
    })
    .from(trips)
    .where(
      and(
        isNotNull(trips.driverId),
        inArray(trips.driverId, driverIds),
        gte(trips.tripDate, new Date(startDate)),
        lte(trips.tripDate, new Date(endDate)),
        eq(trips.status, "completed")
      )
    )
    .groupBy(trips.driverId);

  const moveCountMap = new Map(
    moveCountsRaw.map((m) => [m.driverId!, Number(m.moveCount)])
  );

  let assignmentConditions = [
    inArray(shiftAssignments.driverId, driverIds),
  ];

  const scheduledHoursRaw = await db
    .select({
      driverId: shiftAssignments.driverId,
      totalScheduledHours: sum(shiftAssignments.scheduledHours),
      overtimeCount: sql<number>`count(case when ${shiftAssignments.isOvertime} = true then 1 end)`,
    })
    .from(shiftAssignments)
    .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
    .where(
      and(
        ...assignmentConditions,
        isNotNull(shiftAssignments.driverId),
        gte(shifts.date, startDate),
        lte(shifts.date, endDate),
        inArray(shiftAssignments.status, ["assigned", "confirmed", "completed"])
      )
    )
    .groupBy(shiftAssignments.driverId);

  const hoursMap = new Map(
    scheduledHoursRaw.map((h) => [
      h.driverId!,
      {
        scheduledHours: Number(h.totalScheduledHours || 0),
        overtimeCount: Number(h.overtimeCount || 0),
      },
    ])
  );

  const driverMetrics: DriverWorkloadMetrics[] = activeDrivers.map((driver) => {
    const user = userMap.get(driver.userId);
    const driverName = user
      ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
      : "Unknown";

    const moveCount = moveCountMap.get(driver.id) || 0;
    const hoursData = hoursMap.get(driver.id) || { scheduledHours: 0, overtimeCount: 0 };
    const scheduledHours = hoursData.scheduledHours;
    const overtimeShifts = hoursData.overtimeCount;

    const availabilityHours = Number(driver.hoursMtd || 0) || scheduledHours;
    const movesPerHour = scheduledHours > 0 ? moveCount / scheduledHours : 0;
    const utilizationPercent =
      availabilityHours > 0
        ? Math.min(100, (scheduledHours / availabilityHours) * 100)
        : scheduledHours > 0
        ? 100
        : 0;

    const flags: WorkloadFlag[] = [];
    const suggestions: AdvisorySuggestion[] = [];

    if (movesPerHour > HIGH_DENSITY_THRESHOLD) {
      flags.push({
        type: "high_density",
        severity: movesPerHour > HIGH_DENSITY_THRESHOLD * 1.5 ? "critical" : "warning",
        label: "High Move Density",
        detail: `${movesPerHour.toFixed(1)} moves/hr exceeds threshold of ${HIGH_DENSITY_THRESHOLD}`,
      });
      suggestions.push({
        type: "redistribute",
        title: "Redistribute Moves",
        description: `Consider reassigning some of ${driverName}'s ${moveCount} moves to drivers with lower workloads.`,
        priority: movesPerHour > HIGH_DENSITY_THRESHOLD * 1.5 ? "high" : "medium",
      });
    }

    if (
      scheduledHours >= LOW_UTILIZATION_HOURS_THRESHOLD &&
      moveCount <= LOW_UTILIZATION_MOVE_THRESHOLD
    ) {
      flags.push({
        type: "low_utilization",
        severity: moveCount === 0 ? "critical" : "warning",
        label: "Low Utilization",
        detail: `Only ${moveCount} moves despite ${scheduledHours.toFixed(1)}h scheduled`,
      });
      suggestions.push({
        type: "add_capacity",
        title: "Increase Move Assignment",
        description: `${driverName} has ${scheduledHours.toFixed(1)}h scheduled but only ${moveCount} moves. Consider assigning additional moves.`,
        priority: moveCount === 0 ? "high" : "medium",
      });
    }

    if (overtimeShifts >= OVERTIME_SHIFT_THRESHOLD) {
      flags.push({
        type: "overtime_risk",
        severity: overtimeShifts >= OVERTIME_SHIFT_THRESHOLD * 2 ? "critical" : "warning",
        label: "Overtime Risk",
        detail: `${overtimeShifts} overtime shifts in this period`,
      });
      suggestions.push({
        type: "reduce_load",
        title: "Reduce Overtime Exposure",
        description: `${driverName} has ${overtimeShifts} overtime shifts. Shifting some work to available drivers could reduce costs.`,
        priority: "high",
      });
    }

    if (scheduledHours > 0 && moveCount === 0) {
      flags.push({
        type: "no_moves",
        severity: "warning",
        label: "No Moves Assigned",
        detail: `${scheduledHours.toFixed(1)}h scheduled with no completed moves`,
      });
    }

    return {
      driverId: driver.id,
      driverName,
      driverNumber: driver.driverNumber,
      market: driver.market,
      status: driver.status,
      scheduledHours,
      moveCount,
      movesPerHour: Number(movesPerHour.toFixed(2)),
      availabilityHours,
      utilizationPercent: Number(utilizationPercent.toFixed(1)),
      overtimeShifts,
      flags,
      suggestions,
    };
  });

  let result = driverMetrics;
  if (flagsOnly) {
    result = result.filter((d) => d.flags.length > 0);
  }

  result.sort((a, b) => {
    if (b.flags.length !== a.flags.length) return b.flags.length - a.flags.length;
    return b.movesPerHour - a.movesPerHour;
  });

  const totalDrivers = result.length;
  const flaggedDrivers = result.filter((d) => d.flags.length > 0).length;
  const avgMovesPerDriver =
    totalDrivers > 0
      ? result.reduce((sum, d) => sum + d.moveCount, 0) / totalDrivers
      : 0;
  const avgScheduledHours =
    totalDrivers > 0
      ? result.reduce((sum, d) => sum + d.scheduledHours, 0) / totalDrivers
      : 0;

  return {
    drivers: result,
    summary: {
      totalDrivers,
      avgMovesPerDriver: Number(avgMovesPerDriver.toFixed(1)),
      avgScheduledHours: Number(avgScheduledHours.toFixed(1)),
      flaggedDrivers,
      highDensityCount: result.filter((d) =>
        d.flags.some((f) => f.type === "high_density")
      ).length,
      lowUtilizationCount: result.filter((d) =>
        d.flags.some((f) => f.type === "low_utilization")
      ).length,
      overtimeRiskCount: result.filter((d) =>
        d.flags.some((f) => f.type === "overtime_risk")
      ).length,
    },
  };
}
