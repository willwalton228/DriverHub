import { db } from "../db";
import { drivers, trips, shiftAssignments, shifts, users } from "@shared/schema";
import { eq, and, gte, lte, sql, sum, count, isNotNull, inArray } from "drizzle-orm";

export interface DriverRevenueMetrics {
  driverId: string;
  driverName: string;
  driverNumber: string | null;
  market: string | null;
  totalRevenue: number;
  totalCost: number;
  grossMargin: number;
  marginPercent: number;
  moveCount: number;
  avgRevenuePerMove: number;
  avgMarginPerMove: number;
  scheduledHours: number;
  revenuePerHour: number;
  overtimeShifts: number;
  estimatedOvertimePremium: number;
  marginAfterOT: number;
  marginPercentAfterOT: number;
  flags: RevenueFlag[];
}

export interface RevenueFlag {
  type: "low_margin" | "negative_margin" | "high_ot_impact" | "below_market_avg" | "no_revenue_data";
  severity: "info" | "warning" | "critical";
  label: string;
  detail: string;
}

export interface AdvisoryBanner {
  type: "overtime_cost" | "margin_opportunity" | "reassignment_potential";
  severity: "info" | "warning";
  title: string;
  message: string;
  metric: string;
}

export interface RevenueMarginSummary {
  totalRevenue: number;
  totalCost: number;
  totalGrossMargin: number;
  overallMarginPercent: number;
  totalOvertimePremium: number;
  marginAfterOT: number;
  marginPercentAfterOT: number;
  totalDrivers: number;
  driversWithMoves: number;
  flaggedDrivers: number;
  avgRevenuePerDriver: number;
  avgMarginPerDriver: number;
  marketBenchmarkMargin: number;
}

export interface RevenueMarginResult {
  drivers: DriverRevenueMetrics[];
  summary: RevenueMarginSummary;
  banners: AdvisoryBanner[];
}

export interface RevenueMarginFilters {
  startDate: string;
  endDate: string;
  market?: string;
}

const OT_PREMIUM_MULTIPLIER = 0.5;
const LOW_MARGIN_THRESHOLD = 15;
const HIGH_OT_IMPACT_THRESHOLD = 20;

export async function getRevenueMarginData(
  filters: RevenueMarginFilters
): Promise<RevenueMarginResult> {
  const { startDate, endDate, market } = filters;

  const activeDrivers = await db
    .select({
      id: drivers.id,
      userId: drivers.userId,
      driverNumber: drivers.driverNumber,
      market: drivers.market,
      status: drivers.status,
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
        totalRevenue: 0,
        totalCost: 0,
        totalGrossMargin: 0,
        overallMarginPercent: 0,
        totalOvertimePremium: 0,
        marginAfterOT: 0,
        marginPercentAfterOT: 0,
        totalDrivers: 0,
        driversWithMoves: 0,
        flaggedDrivers: 0,
        avgRevenuePerDriver: 0,
        avgMarginPerDriver: 0,
        marketBenchmarkMargin: 0,
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

  const revenueRaw = await db
    .select({
      driverId: trips.driverId,
      totalRevenue: sum(trips.billRate),
      totalCost: sum(trips.payRate),
      totalGrossProfit: sum(trips.grossProfit),
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

  const revenueMap = new Map(
    revenueRaw.map((r) => [
      r.driverId!,
      {
        totalRevenue: Number(r.totalRevenue || 0),
        totalCost: Number(r.totalCost || 0),
        grossMargin: Number(r.totalGrossProfit || 0),
        moveCount: Number(r.moveCount),
      },
    ])
  );

  const scheduledHoursRaw = await db
    .select({
      driverId: shiftAssignments.driverId,
      totalScheduledHours: sum(shiftAssignments.scheduledHours),
      overtimeCount: sql<number>`count(case when ${shiftAssignments.isOvertime} = true then 1 end)`,
      overtimeHours: sql<number>`coalesce(sum(case when ${shiftAssignments.isOvertime} = true then ${shiftAssignments.scheduledHours} else 0 end), 0)`,
    })
    .from(shiftAssignments)
    .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
    .where(
      and(
        inArray(shiftAssignments.driverId, driverIds),
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
        overtimeHours: Number(h.overtimeHours || 0),
      },
    ])
  );

  let allMargins: number[] = [];

  const driverMetrics: DriverRevenueMetrics[] = activeDrivers.map((driver) => {
    const user = userMap.get(driver.userId);
    const driverName = user
      ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
      : "Unknown";

    const rev = revenueMap.get(driver.id) || {
      totalRevenue: 0,
      totalCost: 0,
      grossMargin: 0,
      moveCount: 0,
    };
    const hrs = hoursMap.get(driver.id) || {
      scheduledHours: 0,
      overtimeCount: 0,
      overtimeHours: 0,
    };

    const totalRevenue = rev.totalRevenue;
    const totalCost = rev.totalCost;
    const grossMargin = rev.grossMargin;
    const marginPercent = totalRevenue > 0 ? (grossMargin / totalRevenue) * 100 : 0;
    const moveCount = rev.moveCount;
    const avgRevenuePerMove = moveCount > 0 ? totalRevenue / moveCount : 0;
    const avgMarginPerMove = moveCount > 0 ? grossMargin / moveCount : 0;
    const scheduledHours = hrs.scheduledHours;
    const revenuePerHour = scheduledHours > 0 ? totalRevenue / scheduledHours : 0;
    const overtimeShifts = hrs.overtimeCount;

    const avgPayPerHour = scheduledHours > 0 ? totalCost / scheduledHours : 0;
    const estimatedOvertimePremium = hrs.overtimeHours * avgPayPerHour * OT_PREMIUM_MULTIPLIER;

    const marginAfterOT = grossMargin - estimatedOvertimePremium;
    const marginPercentAfterOT = totalRevenue > 0 ? (marginAfterOT / totalRevenue) * 100 : 0;

    if (moveCount > 0) {
      allMargins.push(marginPercent);
    }

    const flags: RevenueFlag[] = [];

    if (moveCount === 0 && scheduledHours > 0) {
      flags.push({
        type: "no_revenue_data",
        severity: "info",
        label: "No Revenue Data",
        detail: `${scheduledHours.toFixed(1)}h scheduled but no completed moves with billing data`,
      });
    }

    if (moveCount > 0 && grossMargin < 0) {
      flags.push({
        type: "negative_margin",
        severity: "critical",
        label: "Negative Margin",
        detail: `Margin is -$${Math.abs(grossMargin).toFixed(2)} across ${moveCount} moves`,
      });
    } else if (moveCount > 0 && marginPercent < LOW_MARGIN_THRESHOLD) {
      flags.push({
        type: "low_margin",
        severity: "warning",
        label: "Low Margin",
        detail: `${marginPercent.toFixed(1)}% margin is below ${LOW_MARGIN_THRESHOLD}% threshold`,
      });
    }

    if (totalRevenue > 0 && estimatedOvertimePremium > 0) {
      const otImpactPercent = (estimatedOvertimePremium / totalRevenue) * 100;
      if (otImpactPercent > HIGH_OT_IMPACT_THRESHOLD) {
        flags.push({
          type: "high_ot_impact",
          severity: "warning",
          label: "High OT Impact",
          detail: `Overtime premium ($${estimatedOvertimePremium.toFixed(2)}) erodes ${otImpactPercent.toFixed(1)}% of revenue`,
        });
      }
    }

    return {
      driverId: driver.id,
      driverName,
      driverNumber: driver.driverNumber,
      market: driver.market,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalCost: Number(totalCost.toFixed(2)),
      grossMargin: Number(grossMargin.toFixed(2)),
      marginPercent: Number(marginPercent.toFixed(1)),
      moveCount,
      avgRevenuePerMove: Number(avgRevenuePerMove.toFixed(2)),
      avgMarginPerMove: Number(avgMarginPerMove.toFixed(2)),
      scheduledHours: Number(scheduledHours.toFixed(1)),
      revenuePerHour: Number(revenuePerHour.toFixed(2)),
      overtimeShifts,
      estimatedOvertimePremium: Number(estimatedOvertimePremium.toFixed(2)),
      marginAfterOT: Number(marginAfterOT.toFixed(2)),
      marginPercentAfterOT: Number(marginPercentAfterOT.toFixed(1)),
      flags,
    };
  });

  const marketBenchmarkMargin =
    allMargins.length > 0
      ? allMargins.reduce((s, m) => s + m, 0) / allMargins.length
      : 0;

  driverMetrics.forEach((dm) => {
    if (
      dm.moveCount > 0 &&
      dm.marginPercent < marketBenchmarkMargin - 5 &&
      dm.marginPercent >= 0
    ) {
      dm.flags.push({
        type: "below_market_avg",
        severity: "info",
        label: "Below Average",
        detail: `${dm.marginPercent.toFixed(1)}% margin vs ${marketBenchmarkMargin.toFixed(1)}% pool average`,
      });
    }
  });

  driverMetrics.sort((a, b) => {
    const aSev = a.flags.some((f) => f.severity === "critical") ? 2 : a.flags.length > 0 ? 1 : 0;
    const bSev = b.flags.some((f) => f.severity === "critical") ? 2 : b.flags.length > 0 ? 1 : 0;
    if (bSev !== aSev) return bSev - aSev;
    return b.totalRevenue - a.totalRevenue;
  });

  const totalRevenue = driverMetrics.reduce((s, d) => s + d.totalRevenue, 0);
  const totalCost = driverMetrics.reduce((s, d) => s + d.totalCost, 0);
  const totalGrossMargin = driverMetrics.reduce((s, d) => s + d.grossMargin, 0);
  const totalOvertimePremium = driverMetrics.reduce((s, d) => s + d.estimatedOvertimePremium, 0);
  const driversWithMoves = driverMetrics.filter((d) => d.moveCount > 0).length;
  const flaggedDrivers = driverMetrics.filter((d) => d.flags.length > 0).length;

  const overallMarginPercent = totalRevenue > 0 ? (totalGrossMargin / totalRevenue) * 100 : 0;
  const marginAfterOT = totalGrossMargin - totalOvertimePremium;
  const marginPercentAfterOT = totalRevenue > 0 ? (marginAfterOT / totalRevenue) * 100 : 0;

  const banners: AdvisoryBanner[] = [];

  if (totalOvertimePremium > 0 && totalRevenue > 0) {
    const otSharePercent = (totalOvertimePremium / totalGrossMargin) * 100;
    if (otSharePercent > 10) {
      banners.push({
        type: "overtime_cost",
        severity: "warning",
        title: "Overtime Eroding Margins",
        message: `Estimated overtime premiums of $${totalOvertimePremium.toFixed(0)} consume ${otSharePercent.toFixed(1)}% of gross margin. Review overtime-heavy drivers for rebalancing opportunities.`,
        metric: `$${totalOvertimePremium.toFixed(0)} OT premium`,
      });
    }
  }

  const lowMarginDrivers = driverMetrics.filter(
    (d) => d.moveCount > 0 && d.marginPercent < LOW_MARGIN_THRESHOLD
  );
  if (lowMarginDrivers.length > 0) {
    const potentialRevenue = lowMarginDrivers.reduce((s, d) => s + d.totalRevenue, 0);
    banners.push({
      type: "margin_opportunity",
      severity: "info",
      title: "Margin Improvement Opportunity",
      message: `${lowMarginDrivers.length} driver(s) operating below ${LOW_MARGIN_THRESHOLD}% margin, covering $${potentialRevenue.toFixed(0)} in revenue. Review move mix and pay rate alignment.`,
      metric: `${lowMarginDrivers.length} drivers`,
    });
  }

  const belowAvgDrivers = driverMetrics.filter(
    (d) => d.flags.some((f) => f.type === "below_market_avg")
  );
  if (belowAvgDrivers.length >= 2) {
    banners.push({
      type: "reassignment_potential",
      severity: "info",
      title: "Reassignment Could Improve Margins",
      message: `${belowAvgDrivers.length} drivers perform below pool average margin (${marketBenchmarkMargin.toFixed(1)}%). Reassigning higher-margin moves to underperforming drivers or adjusting move mix could improve overall profitability.`,
      metric: `${belowAvgDrivers.length} below avg`,
    });
  }

  return {
    drivers: driverMetrics,
    summary: {
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalCost: Number(totalCost.toFixed(2)),
      totalGrossMargin: Number(totalGrossMargin.toFixed(2)),
      overallMarginPercent: Number(overallMarginPercent.toFixed(1)),
      totalOvertimePremium: Number(totalOvertimePremium.toFixed(2)),
      marginAfterOT: Number(marginAfterOT.toFixed(2)),
      marginPercentAfterOT: Number(marginPercentAfterOT.toFixed(1)),
      totalDrivers: driverMetrics.length,
      driversWithMoves,
      flaggedDrivers,
      avgRevenuePerDriver: driversWithMoves > 0 ? Number((totalRevenue / driversWithMoves).toFixed(2)) : 0,
      avgMarginPerDriver: driversWithMoves > 0 ? Number((totalGrossMargin / driversWithMoves).toFixed(2)) : 0,
      marketBenchmarkMargin: Number(marketBenchmarkMargin.toFixed(1)),
    },
    banners,
  };
}
