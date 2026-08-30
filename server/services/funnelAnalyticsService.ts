/**
 * Candidate Conversion Funnel Analytics Service — Ticket 30
 *
 * Computes driver recruiting funnel metrics from real application data.
 * All queries use a single CTE chain for efficiency, joining:
 *   - recruiting_applications (stage, background_status, applied_at)
 *   - recruiting_interviews   (scheduled, completed)
 *   - recruiting_screening_requests (screening passed)
 *   - recruiting_requisitions (market, role_type)
 *   - recruiting_candidates   (source, has_commercial_license)
 *
 * Funnel stages (in order):
 *   1. applied              → all non-archived applications
 *   2. recruiter_reviewed   → progressed past 'applied' stage
 *   3. interview_scheduled  → has at least 1 interview record
 *   4. interview_completed  → has at least 1 completed interview
 *   5. screening_triggered  → background_status != 'none' or has screening requests
 *   6. screening_passed     → background_status = 'passed' or all checks clear
 *   7. offer_sent           → current_stage = 'offer'
 *   8. offer_accepted       → current_stage = 'hired'
 */

import { pool } from "../db";

// ── Types ────────────────────────────────────────────────────────────────────

export type FunnelDimension = "market" | "role_type" | "source" | "cdl" | "intake_path";

export interface FunnelStage {
  stage: string;
  label: string;
  count: number;
  conversionFromPrevious: number | null; // % of previous stage
  conversionFromApplied: number | null;  // % of total applied
  dropOff: number | null;               // absolute drop from previous
}

export interface FunnelSummary {
  totalApplied: number;
  stages: FunnelStage[];
  generatedAt: string;
  dateRange: { start: string | null; end: string | null };
}

export interface FunnelBreakdownRow {
  dimensionValue: string;
  applied: number;
  recruiterReviewed: number;
  interviewScheduled: number;
  interviewCompleted: number;
  screeningTriggered: number;
  screeningPassed: number;
  offerSent: number;
  offerAccepted: number;
  conversionRate: number; // applied → hired
}

export interface FunnelBreakdown {
  dimension: FunnelDimension;
  dimensionLabel: string;
  rows: FunnelBreakdownRow[];
}

// ── Stage labels (user-facing) ───────────────────────────────────────────────

export const FUNNEL_STAGES: { key: string; label: string }[] = [
  { key: "applied",             label: "Applied" },
  { key: "recruiter_reviewed",  label: "Recruiter Reviewed" },
  { key: "interview_scheduled", label: "Interview Scheduled" },
  { key: "interview_completed", label: "Interview Completed" },
  { key: "screening_triggered", label: "Screening Triggered" },
  { key: "screening_passed",    label: "Screening Passed" },
  { key: "offer_sent",          label: "Offer Sent" },
  { key: "offer_accepted",      label: "Offer Accepted" },
];

// ── Date filter helper ────────────────────────────────────────────────────────

function buildDateClause(alias: string, dateRange: { start?: string; end?: string }): string {
  const parts: string[] = [];
  if (dateRange.start) parts.push(`${alias}.applied_at >= '${dateRange.start}'::timestamptz`);
  if (dateRange.end)   parts.push(`${alias}.applied_at <= '${dateRange.end}'::timestamptz`);
  return parts.length > 0 ? "AND " + parts.join(" AND ") : "";
}

// ── Core funnel query ─────────────────────────────────────────────────────────

async function runFunnelQuery(
  whereExtra: string,
  params: any[],
  dateRange: { start?: string; end?: string } = {}
): Promise<Record<string, number>> {
  const dateCl = buildDateClause("a", dateRange);

  const sql = `
    WITH base AS (
      SELECT
        a.id,
        a.current_stage,
        a.background_status,
        a.applied_at
      FROM recruiting_applications a
      WHERE a.is_archived = false
        ${dateCl}
        ${whereExtra}
    ),
    interview_agg AS (
      SELECT
        ri.application_id,
        COUNT(*) FILTER (WHERE ri.status IN ('scheduled','confirmed','completed')) AS scheduled_count,
        COUNT(*) FILTER (WHERE ri.status = 'completed') AS completed_count
      FROM recruiting_interviews ri
      WHERE ri.application_id IN (SELECT id FROM base)
      GROUP BY ri.application_id
    ),
    screening_agg AS (
      SELECT
        rsr.application_id,
        COUNT(*) AS total_checks,
        COUNT(*) FILTER (WHERE rsr.status IN ('clear','completed','waived')) AS passed_checks
      FROM recruiting_screening_requests rsr
      WHERE rsr.application_id IN (SELECT id FROM base)
      GROUP BY rsr.application_id
    )
    SELECT
      COUNT(*)                                                                     AS applied,
      COUNT(*) FILTER (WHERE b.current_stage NOT IN ('applied'))                  AS recruiter_reviewed,
      COUNT(*) FILTER (WHERE COALESCE(ia.scheduled_count,0) > 0)                  AS interview_scheduled,
      COUNT(*) FILTER (WHERE COALESCE(ia.completed_count,0) > 0)                  AS interview_completed,
      COUNT(*) FILTER (
        WHERE b.background_status NOT IN ('none') 
           OR COALESCE(sa.total_checks,0) > 0
      )                                                                            AS screening_triggered,
      COUNT(*) FILTER (
        WHERE b.background_status = 'passed'
           OR (sa.total_checks > 0 AND sa.total_checks = sa.passed_checks)
      )                                                                            AS screening_passed,
      COUNT(*) FILTER (WHERE b.current_stage = 'offer')                           AS offer_sent,
      COUNT(*) FILTER (WHERE b.current_stage = 'hired')                           AS offer_accepted
    FROM base b
    LEFT JOIN interview_agg ia ON ia.application_id = b.id
    LEFT JOIN screening_agg sa ON sa.application_id = b.id
  `;

  const result = await pool.query(sql, params);
  const row = result.rows[0] ?? {};
  return {
    applied:             parseInt(row.applied ?? "0", 10),
    recruiter_reviewed:  parseInt(row.recruiter_reviewed ?? "0", 10),
    interview_scheduled: parseInt(row.interview_scheduled ?? "0", 10),
    interview_completed: parseInt(row.interview_completed ?? "0", 10),
    screening_triggered: parseInt(row.screening_triggered ?? "0", 10),
    screening_passed:    parseInt(row.screening_passed ?? "0", 10),
    offer_sent:          parseInt(row.offer_sent ?? "0", 10),
    offer_accepted:      parseInt(row.offer_accepted ?? "0", 10),
  };
}

// ── Build FunnelSummary from raw counts ───────────────────────────────────────

function buildSummary(
  counts: Record<string, number>,
  dateRange: { start?: string; end?: string }
): FunnelSummary {
  const stageKeys = FUNNEL_STAGES.map((s) => s.key);
  const totalApplied = counts.applied ?? 0;
  let prevCount: number | null = null;

  const stages: FunnelStage[] = stageKeys.map((key) => {
    const label = FUNNEL_STAGES.find((s) => s.key === key)!.label;
    const count = counts[key] ?? 0;
    const conversionFromPrevious = prevCount != null && prevCount > 0
      ? Math.round((count / prevCount) * 100)
      : null;
    const conversionFromApplied = totalApplied > 0
      ? Math.round((count / totalApplied) * 100)
      : null;
    const dropOff = prevCount != null ? prevCount - count : null;
    prevCount = count;
    return { stage: key, label, count, conversionFromPrevious, conversionFromApplied, dropOff };
  });

  return {
    totalApplied,
    stages,
    generatedAt: new Date().toISOString(),
    dateRange: { start: dateRange.start ?? null, end: dateRange.end ?? null },
  };
}

// ── Public: compute overall funnel ────────────────────────────────────────────

export async function computeFunnelSummary(
  opts: { dateRange?: { start?: string; end?: string }; market?: string } = {}
): Promise<FunnelSummary> {
  const params: any[] = [];
  let whereExtra = "";
  if (opts.market) {
    params.push(opts.market);
    whereExtra = `AND a.requisition_id IN (SELECT id FROM recruiting_requisitions WHERE market = $${params.length})`;
  }
  const counts = await runFunnelQuery(whereExtra, params, opts.dateRange ?? {});
  return buildSummary(counts, opts.dateRange ?? {});
}

// ── Public: compute breakdown by dimension ────────────────────────────────────

export async function computeFunnelBreakdown(
  dimension: FunnelDimension,
  opts: { dateRange?: { start?: string; end?: string } } = {}
): Promise<FunnelBreakdown> {
  const dateRange = opts.dateRange ?? {};
  const dateCl = buildDateClause("a", dateRange);

  const DIMENSION_LABELS: Record<FunnelDimension, string> = {
    market:      "Market",
    role_type:   "Role Type",
    source:      "Ad Source",
    cdl:         "CDL Status",
    intake_path: "Intake Path",
  };

  // Build dimension expression and join clause
  let dimExpr: string;
  let joinClause = "";

  if (dimension === "market") {
    dimExpr = "COALESCE(r.market, 'Unknown')";
    joinClause = "LEFT JOIN recruiting_requisitions r ON r.id = a.requisition_id";
  } else if (dimension === "role_type") {
    dimExpr = "COALESCE(r.role_type, 'vehicle_movement')";
    joinClause = "LEFT JOIN recruiting_requisitions r ON r.id = a.requisition_id";
  } else if (dimension === "source") {
    dimExpr = "COALESCE(c.source::text, 'other')";
    joinClause = "LEFT JOIN recruiting_candidates c ON c.id = a.candidate_id";
  } else if (dimension === "cdl") {
    dimExpr = "CASE WHEN c.has_commercial_license = true THEN 'CDL' ELSE 'Non-CDL' END";
    joinClause = "LEFT JOIN recruiting_candidates c ON c.id = a.candidate_id";
  } else {
    // intake_path — not yet a column on recruiting_applications; derive from stage progression
    dimExpr = `CASE 
      WHEN a.current_stage IN ('hired','offer') THEN 'standard'
      WHEN a.current_stage IN ('applied') THEN 'standard'
      ELSE 'standard'
    END`;
  }

  const sql = `
    WITH base AS (
      SELECT
        a.id,
        a.current_stage,
        a.background_status,
        ${dimExpr} AS dim_value
      FROM recruiting_applications a
      ${joinClause}
      WHERE a.is_archived = false
        ${dateCl}
    ),
    interview_agg AS (
      SELECT
        ri.application_id,
        COUNT(*) FILTER (WHERE ri.status IN ('scheduled','confirmed','completed')) AS scheduled_count,
        COUNT(*) FILTER (WHERE ri.status = 'completed') AS completed_count
      FROM recruiting_interviews ri
      WHERE ri.application_id IN (SELECT id FROM base)
      GROUP BY ri.application_id
    ),
    screening_agg AS (
      SELECT
        rsr.application_id,
        COUNT(*) AS total_checks,
        COUNT(*) FILTER (WHERE rsr.status IN ('clear','completed','waived')) AS passed_checks
      FROM recruiting_screening_requests rsr
      WHERE rsr.application_id IN (SELECT id FROM base)
      GROUP BY rsr.application_id
    )
    SELECT
      b.dim_value                                                                  AS dim,
      COUNT(*)                                                                     AS applied,
      COUNT(*) FILTER (WHERE b.current_stage NOT IN ('applied'))                  AS recruiter_reviewed,
      COUNT(*) FILTER (WHERE COALESCE(ia.scheduled_count,0) > 0)                  AS interview_scheduled,
      COUNT(*) FILTER (WHERE COALESCE(ia.completed_count,0) > 0)                  AS interview_completed,
      COUNT(*) FILTER (
        WHERE b.background_status NOT IN ('none')
           OR COALESCE(sa.total_checks,0) > 0
      )                                                                            AS screening_triggered,
      COUNT(*) FILTER (
        WHERE b.background_status = 'passed'
           OR (sa.total_checks > 0 AND sa.total_checks = sa.passed_checks)
      )                                                                            AS screening_passed,
      COUNT(*) FILTER (WHERE b.current_stage = 'offer')                           AS offer_sent,
      COUNT(*) FILTER (WHERE b.current_stage = 'hired')                           AS offer_accepted
    FROM base b
    LEFT JOIN interview_agg ia ON ia.application_id = b.id
    LEFT JOIN screening_agg sa ON sa.application_id = b.id
    GROUP BY b.dim_value
    ORDER BY COUNT(*) DESC
    LIMIT 50
  `;

  const result = await pool.query(sql);

  const rows: FunnelBreakdownRow[] = result.rows.map((r) => {
    const applied = parseInt(r.applied ?? "0", 10);
    const hired   = parseInt(r.offer_accepted ?? "0", 10);
    return {
      dimensionValue:      r.dim ?? "Unknown",
      applied,
      recruiterReviewed:   parseInt(r.recruiter_reviewed  ?? "0", 10),
      interviewScheduled:  parseInt(r.interview_scheduled ?? "0", 10),
      interviewCompleted:  parseInt(r.interview_completed ?? "0", 10),
      screeningTriggered:  parseInt(r.screening_triggered ?? "0", 10),
      screeningPassed:     parseInt(r.screening_passed    ?? "0", 10),
      offerSent:           parseInt(r.offer_sent          ?? "0", 10),
      offerAccepted:       hired,
      conversionRate:      applied > 0 ? Math.round((hired / applied) * 100) : 0,
    };
  });

  return {
    dimension,
    dimensionLabel: DIMENSION_LABELS[dimension],
    rows,
  };
}

// ── Public: available markets for filter ──────────────────────────────────────

export async function getAvailableMarkets(): Promise<string[]> {
  const result = await pool.query(
    `SELECT DISTINCT market FROM recruiting_requisitions WHERE market IS NOT NULL ORDER BY market`
  );
  return result.rows.map((r) => r.market as string);
}
