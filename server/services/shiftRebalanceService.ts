/**
 * Shift Rebalancing Engine
 *
 * Identifies drivers heading into overtime this week and generates
 * concrete shift reassignment recommendations to underloaded drivers.
 *
 * Split by worker type:
 *   - Employee drivers  → OT cost-savings model ($11/OT hr avoided via FLSA premium)
 *   - IC drivers        → Load-balancing model  (workload equity, no FLSA premium)
 *   - Unknown           → Shown separately; ops team should classify in driver record
 *
 * Algorithm:
 *  1. Compute per-driver projected hours (worked + remaining scheduled) for the current week.
 *  2. Classify:
 *       OT drivers    → projected > 40 h
 *       Under drivers → projected < 30 h
 *  3. For each future shift belonging to an OT driver:
 *       • Compute OT saved = min(shift_hours, driver_projected - 40)
 *       • Find underloaded drivers with no conflicting shift & won't exceed 40h
 *  4. Return up to MAX_RECS recommendations per worker-type group.
 *
 * Cost model (employee only):
 *   Regular rate  : $22 / hr
 *   OT premium    : $11 / hr of OT avoided (0.5× regular)
 */

import { pool } from "../db";

const MAX_RECS_PER_GROUP = 12;
const MAX_PER_FROM_DRIVER = 3;
const OT_THRESHOLD = 40;
const UNDER_THRESHOLD = 30;
const OT_PREMIUM_RATE = 11; // $ saved per hour of OT avoided (employees only)

export type WorkerType = "employee" | "contractor" | "unknown";

export interface RebalanceDriver {
  wiwUserId: string;
  driverId: string | null;
  name: string;
  projectedHours: number;
  workedHours: number;
  remainingScheduledHours: number;
  workerType: WorkerType;
}

export interface RebalanceShift {
  shiftId: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  locationId: string | null;
  locationName: string | null;
  positionId: string | null;
  positionName: string | null;
}

export interface ShiftRebalanceRecommendation {
  id: string;
  fromDriver: RebalanceDriver;
  toDriver: RebalanceDriver;
  shift: RebalanceShift;
  otSavedHours: number;
  /** Dollar value only meaningful for employees (FLSA OT premium). Zero for ICs/unknown. */
  costImpact: number;
  toDriverNewTotal: number;
}

export interface WorkerGroupStats {
  otDriverCount: number;
  underDriverCount: number;
  totalOtSavedHours: number;
  totalCostSaved: number; // employees only
  recommendations: ShiftRebalanceRecommendation[];
}

export interface ShiftRebalanceResult {
  generatedAt: string;
  weekStart: string;
  weekEnd: string;
  employees: WorkerGroupStats;
  contractors: WorkerGroupStats;
  unknown: WorkerGroupStats;
}

// ── Helper: classify worker type from driver record fields ───────────────────
function classifyWorker(
  employmentType: string | null,
  driverClassification: string | null,
): WorkerType {
  const cls = (driverClassification ?? "").toLowerCase();
  const emp = (employmentType ?? "").toLowerCase();
  if (cls.includes("independent") || cls.includes("contractor") || emp.includes("contractor")) {
    return "contractor";
  }
  if (emp.includes("full") || emp.includes("part") || emp.includes("on-call") || emp.includes("hourly")) {
    return "employee";
  }
  return "unknown";
}

// ── Helper: build recommendations for a single driver group ──────────────────
function buildRecommendations(
  groupOtDrivers: RebalanceDriver[],
  groupUnderDrivers: RebalanceDriver[],
  shiftsForOtDrivers: Array<{
    shift_id: string;
    wiw_user_id: string;
    position_id: string | null;
    position_name: string | null;
    location_id: string | null;
    location_name: string | null;
    start_time: string;
    end_time: string;
    duration_hours: number;
  }>,
  underShiftsByUser: Record<string, Array<{ start: Date; end: Date }>>,
  isEmployee: boolean,
): ShiftRebalanceRecommendation[] {
  const recommendations: ShiftRebalanceRecommendation[] = [];
  const usedShifts = new Set<string>();
  const fromDriverCounts: Record<string, number> = {};
  const effectiveHours: Record<string, number> = Object.fromEntries(
    groupUnderDrivers.map(d => [d.wiwUserId, d.projectedHours])
  );
  const driverByUserId = Object.fromEntries(
    [...groupOtDrivers, ...groupUnderDrivers].map(d => [d.wiwUserId, d])
  );

  const otUserSet = new Set(groupOtDrivers.map(d => d.wiwUserId));
  const relevantShifts = shiftsForOtDrivers.filter(s => otUserSet.has(s.wiw_user_id));

  for (const shift of relevantShifts) {
    if (recommendations.length >= MAX_RECS_PER_GROUP) break;
    if (usedShifts.has(shift.shift_id)) continue;

    const fromDriver = driverByUserId[shift.wiw_user_id];
    if (!fromDriver) continue;

    const fromCount = fromDriverCounts[fromDriver.wiwUserId] ?? 0;
    if (fromCount >= MAX_PER_FROM_DRIVER) continue;

    const shiftHours = +shift.duration_hours;
    if (shiftHours <= 0) continue;

    const rawOtSaved = Math.min(shiftHours, fromDriver.projectedHours - OT_THRESHOLD);
    if (rawOtSaved <= 0.1) continue;

    const shiftStart = new Date(shift.start_time);
    const shiftEnd = new Date(shift.end_time);

    const eligible = groupUnderDrivers.filter(ud => {
      if ((effectiveHours[ud.wiwUserId] ?? ud.projectedHours) + shiftHours > OT_THRESHOLD) return false;
      if (ud.wiwUserId === fromDriver.wiwUserId) return false;
      const existing = underShiftsByUser[ud.wiwUserId] ?? [];
      return !existing.some(es => es.start < shiftEnd && es.end > shiftStart);
    });

    if (eligible.length === 0) continue;

    const toDriver = eligible.reduce((a, b) =>
      (effectiveHours[a.wiwUserId] ?? a.projectedHours) <= (effectiveHours[b.wiwUserId] ?? b.projectedHours) ? a : b
    );

    const otSavedHours = parseFloat(rawOtSaved.toFixed(2));
    const recId = `${fromDriver.wiwUserId}-${toDriver.wiwUserId}-${shift.shift_id}`;

    usedShifts.add(shift.shift_id);
    fromDriverCounts[fromDriver.wiwUserId] = fromCount + 1;
    effectiveHours[toDriver.wiwUserId] = (effectiveHours[toDriver.wiwUserId] ?? toDriver.projectedHours) + shiftHours;

    recommendations.push({
      id: recId,
      fromDriver,
      toDriver,
      shift: {
        shiftId: shift.shift_id,
        startTime: shift.start_time,
        endTime: shift.end_time,
        durationHours: parseFloat(shiftHours.toFixed(2)),
        locationId: shift.location_id,
        locationName: shift.location_name,
        positionId: shift.position_id,
        positionName: shift.position_name,
      },
      otSavedHours,
      costImpact: isEmployee ? parseFloat((otSavedHours * OT_PREMIUM_RATE).toFixed(2)) : 0,
      toDriverNewTotal: parseFloat((toDriver.projectedHours + shiftHours).toFixed(1)),
    });
  }

  recommendations.sort((a, b) => b.otSavedHours - a.otSavedHours);
  return recommendations;
}

// ── Main export ──────────────────────────────────────────────────────────────
export async function generateShiftRecommendations(): Promise<ShiftRebalanceResult> {
  // ── 1. Week bounds (Monday–Sunday CST)
  const boundsRes = await pool.query<{ week_start: string; week_end: string }>(`
    SELECT
      date_trunc('week', NOW() AT TIME ZONE 'America/Chicago') AS week_start,
      date_trunc('week', NOW() AT TIME ZONE 'America/Chicago') + INTERVAL '6 days 23:59:59' AS week_end
  `);
  const { week_start, week_end } = boundsRes.rows[0];

  // ── 2. Per-driver projected hours with worker type from drivers table
  const projRes = await pool.query<{
    wiw_user_id: string;
    driver_id: string | null;
    name: string;
    worked_hours: number;
    remaining_hours: number;
    projected_total: number;
    employment_type: string | null;
    driver_classification: string | null;
  }>(`
    WITH
    worked AS (
      SELECT wiw_user_id,
        COALESCE(SUM(total_minutes) / 60.0, 0) AS worked_hours
      FROM wiw_times
      WHERE clock_in >= $1 AND clock_in <= $2
      GROUP BY wiw_user_id
    ),
    scheduled AS (
      SELECT wiw_user_id,
        COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600), 0) AS remaining_hours
      FROM wiw_shifts
      WHERE start_time > NOW() AND start_time <= $2
        AND (status IS NULL OR status NOT IN ('deleted','cancelled'))
      GROUP BY wiw_user_id
    )
    SELECT
      wu.id        AS wiw_user_id,
      wu.driver_id,
      wu.name,
      COALESCE(w.worked_hours, 0)::float    AS worked_hours,
      COALESCE(s.remaining_hours, 0)::float AS remaining_hours,
      (COALESCE(w.worked_hours, 0) + COALESCE(s.remaining_hours, 0))::float AS projected_total,
      d.employment_type,
      d.driver_classification
    FROM wiw_users wu
    LEFT JOIN worked    w ON w.wiw_user_id = wu.id
    LEFT JOIN scheduled s ON s.wiw_user_id = wu.id
    LEFT JOIN drivers   d ON d.id = wu.driver_id
    WHERE wu.is_active = true
      AND (COALESCE(w.worked_hours, 0) + COALESCE(s.remaining_hours, 0)) > 0
    ORDER BY projected_total DESC
  `, [week_start, week_end]);

  const allDrivers: RebalanceDriver[] = projRes.rows.map(r => ({
    wiwUserId: r.wiw_user_id,
    driverId: r.driver_id,
    name: r.name,
    projectedHours: +r.projected_total,
    workedHours: +r.worked_hours,
    remainingScheduledHours: +r.remaining_hours,
    workerType: classifyWorker(r.employment_type, r.driver_classification),
  }));

  // ── 3. Split into groups
  const byType = (t: WorkerType) => allDrivers.filter(d => d.workerType === t);
  const groups: { type: WorkerType; drivers: RebalanceDriver[] }[] = [
    { type: "employee",   drivers: byType("employee")   },
    { type: "contractor", drivers: byType("contractor") },
    { type: "unknown",    drivers: byType("unknown")    },
  ];

  // ── 4. Fetch future shifts for ALL OT drivers in one query
  const allOtDrivers = allDrivers.filter(d => d.projectedHours > OT_THRESHOLD);
  const allUnderDrivers = allDrivers.filter(d => d.projectedHours < UNDER_THRESHOLD);

  if (allOtDrivers.length === 0) {
    const empty: WorkerGroupStats = { otDriverCount: 0, underDriverCount: 0, totalOtSavedHours: 0, totalCostSaved: 0, recommendations: [] };
    return {
      generatedAt: new Date().toISOString(),
      weekStart: week_start,
      weekEnd: week_end,
      employees: empty,
      contractors: empty,
      unknown: empty,
    };
  }

  const allOtUserIds = allOtDrivers.map(d => d.wiwUserId);
  const allUnderUserIds = allUnderDrivers.map(d => d.wiwUserId);

  const shiftsRes = await pool.query<{
    shift_id: string;
    wiw_user_id: string;
    position_id: string | null;
    position_name: string | null;
    location_id: string | null;
    location_name: string | null;
    start_time: string;
    end_time: string;
    duration_hours: number;
  }>(`
    SELECT
      ws.id                AS shift_id,
      ws.wiw_user_id,
      ws.wiw_position_id   AS position_id,
      wp.name              AS position_name,
      ws.wiw_location_id   AS location_id,
      wl.name              AS location_name,
      ws.start_time::text,
      ws.end_time::text,
      EXTRACT(EPOCH FROM (ws.end_time - ws.start_time)) / 3600 AS duration_hours
    FROM wiw_shifts ws
    LEFT JOIN wiw_positions wp ON wp.id = ws.wiw_position_id
    LEFT JOIN wiw_locations wl ON wl.id = ws.wiw_location_id
    WHERE ws.wiw_user_id = ANY($1)
      AND ws.start_time > NOW()
      AND ws.start_time <= $2
      AND (ws.status IS NULL OR ws.status NOT IN ('deleted','cancelled'))
    ORDER BY ws.start_time ASC
  `, [allOtUserIds, week_end]);

  // ── 5. Build conflict map for under-drivers (shared across all groups)
  const underShiftsRes = await pool.query<{
    wiw_user_id: string;
    start_time: string;
    end_time: string;
  }>(`
    SELECT wiw_user_id, start_time::text, end_time::text
    FROM wiw_shifts
    WHERE wiw_user_id = ANY($1)
      AND start_time <= $2
      AND end_time >= NOW()
      AND (status IS NULL OR status NOT IN ('deleted','cancelled'))
  `, [allUnderUserIds, week_end]);

  const underShiftsByUser: Record<string, Array<{ start: Date; end: Date }>> = {};
  for (const s of underShiftsRes.rows) {
    if (!underShiftsByUser[s.wiw_user_id]) underShiftsByUser[s.wiw_user_id] = [];
    underShiftsByUser[s.wiw_user_id].push({
      start: new Date(s.start_time),
      end: new Date(s.end_time),
    });
  }

  // ── 6. Generate recommendations per group
  // For "unknown" drivers, also cross-match against the broader under-driver pool
  // (since we can't confirm their type, we still want recommendations to surface)
  const makeGroupStats = (type: WorkerType): WorkerGroupStats => {
    const groupDrivers = byType(type);
    const otDrivers = groupDrivers.filter(d => d.projectedHours > OT_THRESHOLD);
    const underDrivers = groupDrivers.filter(d => d.projectedHours < UNDER_THRESHOLD);
    const isEmployee = type === "employee";

    // For unknown: allow any under-driver as a candidate (type unconfirmed)
    const candidateUnderDrivers = type === "unknown"
      ? allUnderDrivers
      : underDrivers;

    const recs = otDrivers.length > 0 && candidateUnderDrivers.length > 0
      ? buildRecommendations(otDrivers, candidateUnderDrivers, shiftsRes.rows, underShiftsByUser, isEmployee)
      : [];

    return {
      otDriverCount: otDrivers.length,
      underDriverCount: underDrivers.length,
      totalOtSavedHours: parseFloat(recs.reduce((s, r) => s + r.otSavedHours, 0).toFixed(2)),
      totalCostSaved: parseFloat(recs.reduce((s, r) => s + r.costImpact, 0).toFixed(2)),
      recommendations: recs,
    };
  };

  return {
    generatedAt: new Date().toISOString(),
    weekStart: week_start,
    weekEnd: week_end,
    employees:   makeGroupStats("employee"),
    contractors: makeGroupStats("contractor"),
    unknown:     makeGroupStats("unknown"),
  };
}
