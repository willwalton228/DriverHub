import { db } from "./db";
import { trips, moveMedia, accidents, moveIncidents, customers, markets } from "@shared/schema";
import { sql, and, gte, lte, eq, count, isNotNull } from "drizzle-orm";

// Hard cutoff: RISP reporting only covers data on or after 2026-02-09 (Claims module integration date)
export const RISP_CUTOFF_DATE = new Date('2026-02-09T00:00:00.000Z');

export interface RISPSummaryFilters {
  customerId?: string;
  marketId?: string;
  startDate: Date;
  endDate: Date;
}

export interface RISPSummaryMetrics {
  totalMoves: number;
  movesWithFullProof: number;
  proofCoveragePercent: number;
  movesWithWalkaroundVideo: number;
  walkaroundVideoPercent: number;
  totalIncidents: number;
  incidentsPer1000Moves: number;
  avgFnolLatencyHours: number | null;
  topRiskFactors: { factor: string; count: number; percentage: number }[];
  periodStart: string;
  periodEnd: string;
  customerName?: string;
  marketName?: string;
}

export interface RISPControlCoverage {
  controlId: string;
  controlName: string;
  controlType: string;
  linkedEntities: number;
  coverageIndicator: string;
}

export async function getRISPSummaryMetrics(filters: RISPSummaryFilters): Promise<RISPSummaryMetrics> {
  const { customerId, marketId, startDate, endDate } = filters;

  // Enforce hard cutoff: never return data before 2026-02-09 (Claims module integration date)
  const effectiveStartDate = startDate < RISP_CUTOFF_DATE ? RISP_CUTOFF_DATE : startDate;

  const conditions = [
    gte(trips.tripDate, effectiveStartDate),
    lte(trips.tripDate, endDate),
  ];

  if (customerId) {
    conditions.push(eq(trips.customerId, customerId));
  }
  if (marketId) {
    conditions.push(eq(trips.marketId, marketId));
  }

  const totalMovesResult = await db
    .select({ count: count() })
    .from(trips)
    .where(and(...conditions));

  const totalMoves = totalMovesResult[0]?.count || 0;

  const movesWithPickupProof = await db
    .select({ moveId: moveMedia.moveId })
    .from(moveMedia)
    .innerJoin(trips, eq(moveMedia.moveId, trips.id))
    .where(
      and(
        ...conditions,
        eq(moveMedia.stage, "pickup")
      )
    )
    .groupBy(moveMedia.moveId);

  const movesWithDropoffProof = await db
    .select({ moveId: moveMedia.moveId })
    .from(moveMedia)
    .innerJoin(trips, eq(moveMedia.moveId, trips.id))
    .where(
      and(
        ...conditions,
        eq(moveMedia.stage, "dropoff")
      )
    )
    .groupBy(moveMedia.moveId);

  const pickupMoveIds = new Set(movesWithPickupProof.map(m => m.moveId));
  const dropoffMoveIds = new Set(movesWithDropoffProof.map(m => m.moveId));

  let movesWithFullProof = 0;
  pickupMoveIds.forEach(id => {
    if (dropoffMoveIds.has(id)) {
      movesWithFullProof++;
    }
  });

  const movesWithVideoResult = await db
    .select({ moveId: moveMedia.moveId })
    .from(moveMedia)
    .innerJoin(trips, eq(moveMedia.moveId, trips.id))
    .where(
      and(
        ...conditions,
        sql`${moveMedia.category} ILIKE '%video%' OR ${moveMedia.category} ILIKE '%walkaround%'`
      )
    )
    .groupBy(moveMedia.moveId);

  const movesWithWalkaroundVideo = movesWithVideoResult.length;

  const incidentConditions = [
    gte(accidents.accidentDate, effectiveStartDate),
    lte(accidents.accidentDate, endDate),
  ];

  let incidentsResult;
  let fnolResult;
  let riskFactorsResult;

  if (customerId || marketId) {
    incidentsResult = await db
      .select({ count: count() })
      .from(accidents)
      .leftJoin(trips, eq(accidents.moveId, trips.id))
      .where(and(
        ...incidentConditions,
        customerId ? eq(trips.customerId, customerId) : sql`1=1`,
        marketId ? eq(trips.marketId, marketId) : sql`1=1`
      ));

    fnolResult = await db
      .select({
        avgLatency: sql<number>`AVG(EXTRACT(EPOCH FROM (${accidents.createdAt} - ${accidents.incidentDate})) / 3600)`
      })
      .from(accidents)
      .leftJoin(trips, eq(accidents.moveId, trips.id))
      .where(
        and(
          ...incidentConditions,
          isNotNull(accidents.incidentDate),
          isNotNull(accidents.createdAt),
          customerId ? eq(trips.customerId, customerId) : sql`1=1`,
          marketId ? eq(trips.marketId, marketId) : sql`1=1`
        )
      );

    riskFactorsResult = await db
      .select({
        factor: accidents.incidentType,
        count: count()
      })
      .from(accidents)
      .leftJoin(trips, eq(accidents.moveId, trips.id))
      .where(
        and(
          ...incidentConditions,
          isNotNull(accidents.incidentType),
          customerId ? eq(trips.customerId, customerId) : sql`1=1`,
          marketId ? eq(trips.marketId, marketId) : sql`1=1`
        )
      )
      .groupBy(accidents.incidentType)
      .orderBy(sql`count(*) DESC`)
      .limit(5);
  } else {
    incidentsResult = await db
      .select({ count: count() })
      .from(accidents)
      .where(and(...incidentConditions));

    fnolResult = await db
      .select({
        avgLatency: sql<number>`AVG(EXTRACT(EPOCH FROM (${accidents.createdAt} - ${accidents.incidentDate})) / 3600)`
      })
      .from(accidents)
      .where(
        and(
          ...incidentConditions,
          isNotNull(accidents.incidentDate),
          isNotNull(accidents.createdAt)
        )
      );

    riskFactorsResult = await db
      .select({
        factor: accidents.incidentType,
        count: count()
      })
      .from(accidents)
      .where(
        and(
          ...incidentConditions,
          isNotNull(accidents.incidentType)
        )
      )
      .groupBy(accidents.incidentType)
      .orderBy(sql`count(*) DESC`)
      .limit(5);
  }

  const totalIncidents = incidentsResult[0]?.count || 0;

  const avgFnolLatencyHours = fnolResult[0]?.avgLatency 
    ? Math.round(fnolResult[0].avgLatency * 10) / 10 
    : null;

  const topRiskFactors = riskFactorsResult.map(r => ({
    factor: r.factor || "Unknown",
    count: r.count,
    percentage: totalIncidents > 0 ? Math.round((r.count / totalIncidents) * 100) : 0
  }));

  let customerName: string | undefined;
  let marketName: string | undefined;

  if (customerId) {
    const customer = await db
      .select({ name: customers.customerName })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    customerName = customer[0]?.name;
  }

  if (marketId) {
    const market = await db
      .select({ name: markets.name })
      .from(markets)
      .where(eq(markets.id, marketId))
      .limit(1);
    marketName = market[0]?.name;
  }

  return {
    totalMoves,
    movesWithFullProof,
    proofCoveragePercent: totalMoves > 0 ? Math.round((movesWithFullProof / totalMoves) * 100) : 0,
    movesWithWalkaroundVideo,
    walkaroundVideoPercent: totalMoves > 0 ? Math.round((movesWithWalkaroundVideo / totalMoves) * 100) : 0,
    totalIncidents,
    incidentsPer1000Moves: totalMoves > 0 ? Math.round((totalIncidents / totalMoves) * 1000 * 100) / 100 : 0,
    avgFnolLatencyHours,
    topRiskFactors,
    periodStart: effectiveStartDate.toISOString().split("T")[0],
    periodEnd: endDate.toISOString().split("T")[0],
    customerName,
    marketName,
  };
}

export async function getRISPControlCoverage(): Promise<RISPControlCoverage[]> {
  const result = await db.execute(sql`
    SELECT 
      rc.control_id as "controlId",
      rc.name as "controlName",
      rc.control_type as "controlType",
      COUNT(rcl.id) as "linkedEntities"
    FROM risp_controls rc
    LEFT JOIN risp_control_links rcl ON rc.id = rcl.control_id
    WHERE rc.is_active = true
    GROUP BY rc.id, rc.control_id, rc.name, rc.control_type
    ORDER BY COUNT(rcl.id) DESC
  `);

  return (result.rows as any[]).map(r => ({
    controlId: r.controlId,
    controlName: r.controlName,
    controlType: r.controlType,
    linkedEntities: parseInt(r.linkedEntities) || 0,
    coverageIndicator: parseInt(r.linkedEntities) > 5 ? "High" : parseInt(r.linkedEntities) > 0 ? "Medium" : "Low"
  }));
}

export function generatePDFContent(metrics: RISPSummaryMetrics, controlCoverage: RISPControlCoverage[]): string {
  const lines = [
    "RISP INSURANCE SUMMARY REPORT",
    "=" .repeat(50),
    "",
    `Report Period: ${metrics.periodStart} to ${metrics.periodEnd}`,
    metrics.customerName ? `Customer: ${metrics.customerName}` : "",
    metrics.marketName ? `Market: ${metrics.marketName}` : "",
    "",
    "KEY METRICS",
    "-".repeat(30),
    `Total Moves: ${metrics.totalMoves.toLocaleString()}`,
    `Proof Coverage: ${metrics.proofCoveragePercent}% (${metrics.movesWithFullProof.toLocaleString()} moves with full proof)`,
    `Walkaround Video: ${metrics.walkaroundVideoPercent}% (${metrics.movesWithWalkaroundVideo.toLocaleString()} moves)`,
    `Incidents per 1,000 Moves: ${metrics.incidentsPer1000Moves}`,
    `Average FNOL Latency: ${metrics.avgFnolLatencyHours !== null ? `${metrics.avgFnolLatencyHours} hours` : "N/A"}`,
    "",
    "TOP RISK FACTORS (Non-Driver Specific)",
    "-".repeat(30),
  ];

  metrics.topRiskFactors.forEach((rf, i) => {
    lines.push(`${i + 1}. ${rf.factor}: ${rf.count} incidents (${rf.percentage}%)`);
  });

  if (metrics.topRiskFactors.length === 0) {
    lines.push("No incidents recorded in this period.");
  }

  lines.push("");
  lines.push("RISP CONTROL COVERAGE");
  lines.push("-".repeat(30));

  controlCoverage.forEach(cc => {
    lines.push(`${cc.controlName} (${cc.controlType}): ${cc.linkedEntities} entities - ${cc.coverageIndicator} coverage`);
  });

  if (controlCoverage.length === 0) {
    lines.push("No active RISP controls configured.");
  }

  lines.push("");
  lines.push("-".repeat(50));
  lines.push("This report contains aggregated metrics only.");
  lines.push("No driver-identifiable information is included.");
  lines.push(`Generated: ${new Date().toISOString()}`);

  return lines.filter(l => l !== undefined).join("\n");
}

export function generateCSVContent(metrics: RISPSummaryMetrics, controlCoverage: RISPControlCoverage[]): string {
  const rows = [
    ["Metric", "Value", "Details"],
    ["Report Period", `${metrics.periodStart} to ${metrics.periodEnd}`, ""],
    ["Customer", metrics.customerName || "All", ""],
    ["Market", metrics.marketName || "All", ""],
    ["Total Moves", metrics.totalMoves.toString(), ""],
    ["Moves with Full Proof", metrics.movesWithFullProof.toString(), `${metrics.proofCoveragePercent}%`],
    ["Moves with Walkaround Video", metrics.movesWithWalkaroundVideo.toString(), `${metrics.walkaroundVideoPercent}%`],
    ["Total Incidents", metrics.totalIncidents.toString(), ""],
    ["Incidents per 1000 Moves", metrics.incidentsPer1000Moves.toString(), ""],
    ["Avg FNOL Latency (hours)", metrics.avgFnolLatencyHours?.toString() || "N/A", ""],
    ["", "", ""],
    ["Top Risk Factor", "Count", "Percentage"],
  ];

  metrics.topRiskFactors.forEach(rf => {
    rows.push([rf.factor, rf.count.toString(), `${rf.percentage}%`]);
  });

  rows.push(["", "", ""]);
  rows.push(["RISP Control", "Type", "Linked Entities"]);

  controlCoverage.forEach(cc => {
    rows.push([cc.controlName, cc.controlType, cc.linkedEntities.toString()]);
  });

  return rows.map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
}
