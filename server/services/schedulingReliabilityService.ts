import { db } from "../db";
import { drivers, shifts, shiftAssignments, timeClockEvents, users } from "@shared/schema";
import { eq, and, gte, lte, sql, inArray, isNotNull } from "drizzle-orm";

export interface ReliabilityEvent {
  date: string;
  shiftId: string;
  type: "late_start" | "missed_shift" | "break_violation";
  detail: string;
  minutesDeviation: number;
}

export interface DriverReliabilityProfile {
  driverId: string;
  driverName: string;
  driverNumber: string | null;
  market: string | null;
  totalAssignments: number;
  lateStarts: number;
  missedShifts: number;
  breakViolations: number;
  totalSignals: number;
  recentEvents: ReliabilityEvent[];
  trendDirection: "improving" | "stable" | "worsening";
  avgLateMinutes: number;
}

export interface ReliabilitySignalSummary {
  totalDriversAnalyzed: number;
  driversWithSignals: number;
  totalLateStarts: number;
  totalMissedShifts: number;
  totalBreakViolations: number;
  totalSignals: number;
  avgLateMinutes: number;
  lateStartRate: number;
  missedShiftRate: number;
  breakViolationRate: number;
}

export interface ReliabilityBanner {
  type: "late_pattern" | "missed_pattern" | "break_pattern" | "overall_trend";
  severity: "info" | "warning";
  title: string;
  message: string;
  metric: string;
}

export interface ReliabilitySignalsResult {
  drivers: DriverReliabilityProfile[];
  summary: ReliabilitySignalSummary;
  banners: ReliabilityBanner[];
}

export interface ReliabilityFilters {
  startDate: string;
  endDate: string;
  market?: string;
  signalType?: "all" | "late_start" | "missed_shift" | "break_violation";
}

const LATE_THRESHOLD_MINUTES = 5;

export async function getReliabilitySignals(
  filters: ReliabilityFilters
): Promise<ReliabilitySignalsResult> {
  const { startDate, endDate, market } = filters;

  const activeDrivers = await db
    .select({
      id: drivers.id,
      userId: drivers.userId,
      driverNumber: drivers.driverNumber,
      market: drivers.market,
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
        totalDriversAnalyzed: 0,
        driversWithSignals: 0,
        totalLateStarts: 0,
        totalMissedShifts: 0,
        totalBreakViolations: 0,
        totalSignals: 0,
        avgLateMinutes: 0,
        lateStartRate: 0,
        missedShiftRate: 0,
        breakViolationRate: 0,
      },
      banners: [],
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

  const assignmentsRaw = await db
    .select({
      id: shiftAssignments.id,
      shiftId: shiftAssignments.shiftId,
      driverId: shiftAssignments.driverId,
      userId: shiftAssignments.userId,
      status: shiftAssignments.status,
      shiftDate: shifts.date,
      shiftStartTime: shifts.startTime,
      shiftEndTime: shifts.endTime,
      breakDuration: shifts.breakDuration,
    })
    .from(shiftAssignments)
    .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
    .where(
      and(
        isNotNull(shiftAssignments.driverId),
        inArray(shiftAssignments.driverId, driverIds),
        gte(shifts.date, startDate),
        lte(shifts.date, endDate),
        inArray(shiftAssignments.status, [
          "assigned",
          "confirmed",
          "completed",
          "no_show",
        ])
      )
    );

  const driverUserMap = new Map(
    activeDrivers.map((d) => [d.id, d.userId])
  );

  const allUserIdsForEvents = Array.from(new Set(assignmentsRaw.map((a) => a.userId)));

  let clockEventsRaw: {
    userId: string;
    shiftAssignmentId: string | null;
    eventType: string;
    eventTime: Date;
  }[] = [];

  if (allUserIdsForEvents.length > 0) {
    clockEventsRaw = await db
      .select({
        userId: timeClockEvents.userId,
        shiftAssignmentId: timeClockEvents.shiftAssignmentId,
        eventType: timeClockEvents.eventType,
        eventTime: timeClockEvents.eventTime,
      })
      .from(timeClockEvents)
      .where(
        and(
          inArray(timeClockEvents.userId, allUserIdsForEvents),
          gte(timeClockEvents.eventTime, new Date(startDate)),
          lte(timeClockEvents.eventTime, new Date(endDate + "T23:59:59"))
        )
      );
  }

  const clockEventsByAssignment = new Map<string, typeof clockEventsRaw>();
  for (const evt of clockEventsRaw) {
    if (evt.shiftAssignmentId) {
      const existing = clockEventsByAssignment.get(evt.shiftAssignmentId) || [];
      existing.push(evt);
      clockEventsByAssignment.set(evt.shiftAssignmentId, existing);
    }
  }

  const driverEventsMap = new Map<string, ReliabilityEvent[]>();
  const driverAssignmentCounts = new Map<string, number>();

  for (const assignment of assignmentsRaw) {
    const driverId = assignment.driverId!;
    driverAssignmentCounts.set(
      driverId,
      (driverAssignmentCounts.get(driverId) || 0) + 1
    );

    const events = driverEventsMap.get(driverId) || [];

    if (assignment.status === "no_show") {
      events.push({
        date: assignment.shiftDate,
        shiftId: assignment.shiftId,
        type: "missed_shift",
        detail: "No-show for scheduled shift",
        minutesDeviation: 0,
      });
      driverEventsMap.set(driverId, events);
      continue;
    }

    const clockEvents = clockEventsByAssignment.get(assignment.id) || [];
    const clockIn = clockEvents.find((e) => e.eventType === "clock_in");

    if (clockIn) {
      const shiftStart = new Date(assignment.shiftStartTime);
      const clockInTime = new Date(clockIn.eventTime);
      const diffMinutes = (clockInTime.getTime() - shiftStart.getTime()) / (1000 * 60);

      if (diffMinutes > LATE_THRESHOLD_MINUTES) {
        events.push({
          date: assignment.shiftDate,
          shiftId: assignment.shiftId,
          type: "late_start",
          detail: `Clocked in ${Math.round(diffMinutes)} min after shift start`,
          minutesDeviation: Math.round(diffMinutes),
        });
      }

      const breakStart = clockEvents.find((e) => e.eventType === "break_start");
      const breakEnd = clockEvents.find((e) => e.eventType === "break_end");
      const allowedBreak = assignment.breakDuration || 0;

      if (breakStart && breakEnd && allowedBreak > 0) {
        const breakMinutes =
          (new Date(breakEnd.eventTime).getTime() -
            new Date(breakStart.eventTime).getTime()) /
          (1000 * 60);
        const overBreak = breakMinutes - allowedBreak;
        if (overBreak > 5) {
          events.push({
            date: assignment.shiftDate,
            shiftId: assignment.shiftId,
            type: "break_violation",
            detail: `Break exceeded by ${Math.round(overBreak)} min (took ${Math.round(breakMinutes)} min, allowed ${allowedBreak} min)`,
            minutesDeviation: Math.round(overBreak),
          });
        }
      }
    }

    driverEventsMap.set(driverId, events);
  }

  const driverProfiles: DriverReliabilityProfile[] = activeDrivers.map(
    (driver) => {
      const user = userMap.get(driver.userId);
      const driverName = user
        ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
        : "Unknown";

      let allEvents = driverEventsMap.get(driver.id) || [];
      const totalAssignments = driverAssignmentCounts.get(driver.id) || 0;

      if (
        filters.signalType &&
        filters.signalType !== "all"
      ) {
        allEvents = allEvents.filter((e) => e.type === filters.signalType);
      }

      const lateStarts = allEvents.filter((e) => e.type === "late_start").length;
      const missedShifts = allEvents.filter(
        (e) => e.type === "missed_shift"
      ).length;
      const breakViolations = allEvents.filter(
        (e) => e.type === "break_violation"
      ).length;
      const totalSignals = allEvents.length;

      const lateEvents = allEvents.filter((e) => e.type === "late_start");
      const avgLateMinutes =
        lateEvents.length > 0
          ? lateEvents.reduce((s, e) => s + e.minutesDeviation, 0) /
            lateEvents.length
          : 0;

      allEvents.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      const recentEvents = allEvents.slice(0, 5);

      const midPoint = new Date(
        (new Date(startDate).getTime() + new Date(endDate).getTime()) / 2
      );
      const firstHalf = allEvents.filter(
        (e) => new Date(e.date) < midPoint
      ).length;
      const secondHalf = allEvents.filter(
        (e) => new Date(e.date) >= midPoint
      ).length;

      let trendDirection: "improving" | "stable" | "worsening" = "stable";
      if (totalSignals >= 3) {
        if (secondHalf < firstHalf * 0.7) trendDirection = "improving";
        else if (secondHalf > firstHalf * 1.3) trendDirection = "worsening";
      }

      return {
        driverId: driver.id,
        driverName,
        driverNumber: driver.driverNumber,
        market: driver.market,
        totalAssignments,
        lateStarts,
        missedShifts,
        breakViolations,
        totalSignals,
        recentEvents,
        trendDirection,
        avgLateMinutes: Number(avgLateMinutes.toFixed(1)),
      };
    }
  );

  driverProfiles.sort((a, b) => b.totalSignals - a.totalSignals);

  const totalAssignments = driverProfiles.reduce(
    (s, d) => s + d.totalAssignments,
    0
  );
  const totalLateStarts = driverProfiles.reduce(
    (s, d) => s + d.lateStarts,
    0
  );
  const totalMissedShifts = driverProfiles.reduce(
    (s, d) => s + d.missedShifts,
    0
  );
  const totalBreakViolations = driverProfiles.reduce(
    (s, d) => s + d.breakViolations,
    0
  );
  const totalSignals = totalLateStarts + totalMissedShifts + totalBreakViolations;
  const driversWithSignals = driverProfiles.filter(
    (d) => d.totalSignals > 0
  ).length;

  const allLateMins = driverProfiles
    .filter((d) => d.avgLateMinutes > 0)
    .map((d) => d.avgLateMinutes);
  const avgLateMinutes =
    allLateMins.length > 0
      ? allLateMins.reduce((s, m) => s + m, 0) / allLateMins.length
      : 0;

  const banners: ReliabilityBanner[] = [];

  if (totalAssignments > 0 && totalLateStarts > 0) {
    const lateRate = (totalLateStarts / totalAssignments) * 100;
    if (lateRate > 10) {
      banners.push({
        type: "late_pattern",
        severity: "warning",
        title: "Late Start Pattern Detected",
        message: `${lateRate.toFixed(1)}% of shifts started late (${totalLateStarts} of ${totalAssignments}). Average delay: ${avgLateMinutes.toFixed(0)} minutes. Consider reviewing scheduling buffer times.`,
        metric: `${lateRate.toFixed(1)}% late rate`,
      });
    }
  }

  if (totalAssignments > 0 && totalMissedShifts > 0) {
    const missedRate = (totalMissedShifts / totalAssignments) * 100;
    if (missedRate > 5) {
      banners.push({
        type: "missed_pattern",
        severity: "warning",
        title: "Missed Shift Pattern",
        message: `${totalMissedShifts} shifts were missed or had no clock-in (${missedRate.toFixed(1)}% of total). Review shift communication and confirmation processes.`,
        metric: `${missedRate.toFixed(1)}% miss rate`,
      });
    }
  }

  if (totalBreakViolations > 2) {
    banners.push({
      type: "break_pattern",
      severity: "info",
      title: "Break Duration Trend",
      message: `${totalBreakViolations} break duration overruns detected. Consider reviewing break allowance adequacy or scheduling adjustments.`,
      metric: `${totalBreakViolations} overruns`,
    });
  }

  const worseningDrivers = driverProfiles.filter(
    (d) => d.trendDirection === "worsening"
  ).length;
  if (worseningDrivers >= 2) {
    banners.push({
      type: "overall_trend",
      severity: "info",
      title: "Reliability Trend Advisory",
      message: `${worseningDrivers} drivers show worsening reliability trends in the selected period. Proactive check-ins may help address emerging patterns.`,
      metric: `${worseningDrivers} drivers`,
    });
  }

  return {
    drivers: driverProfiles,
    summary: {
      totalDriversAnalyzed: driverProfiles.length,
      driversWithSignals,
      totalLateStarts,
      totalMissedShifts,
      totalBreakViolations,
      totalSignals,
      avgLateMinutes: Number(avgLateMinutes.toFixed(1)),
      lateStartRate:
        totalAssignments > 0
          ? Number(((totalLateStarts / totalAssignments) * 100).toFixed(1))
          : 0,
      missedShiftRate:
        totalAssignments > 0
          ? Number(
              ((totalMissedShifts / totalAssignments) * 100).toFixed(1)
            )
          : 0,
      breakViolationRate:
        totalAssignments > 0
          ? Number(
              ((totalBreakViolations / totalAssignments) * 100).toFixed(1)
            )
          : 0,
    },
    banners,
  };
}
