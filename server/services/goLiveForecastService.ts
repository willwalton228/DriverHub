/**
 * Go-Live Forecast Engine — Ticket 22
 *
 * Computes a probabilistic "time to go-live" forecast for a new customer market
 * based on live recruiting pipeline data, stage cycle times, and headcount targets.
 *
 * Advisory only — leadership / recruiting retains full decision authority.
 */

import { pool } from "../db";

// ── Stage conversion probabilities (likelihood of becoming a hire) ─────────
const STAGE_WEIGHTS: Record<string, number> = {
  applied:              0.06,
  phone_screen:         0.16,
  interview_scheduled:  0.35,
  interview_completed:  0.52,
  background_check:     0.66,
  drug_test:            0.71,
  mvr_check:            0.74,
  offer_extended:       0.82,
  offer_accepted:       0.92,
  onboarding:           0.96,
  hired:                1.00,
  // Terminal non-hire stages
  rejected:             0.00,
  withdrawn:            0.00,
  no_show:              0.00,
  offer_declined:       0.00,
};

// Default avg days per stage if no historical data available
const DEFAULT_STAGE_DAYS: Record<string, number> = {
  applied:              1,
  phone_screen:         2,
  interview_scheduled:  4,
  interview_completed:  3,
  background_check:     5,
  drug_test:            3,
  mvr_check:            2,
  offer_extended:       2,
  offer_accepted:       1,
  onboarding:           5,
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface ForecastBlocker {
  severity: "critical" | "warning" | "info";
  code: string;
  description: string;
  recommendation: string;
}

export interface GoLiveForecast {
  projectedGoLive: {
    optimistic: string;   // ISO date
    likely: string;       // ISO date
    pessimistic: string;  // ISO date
  };
  confidenceLevel: "high" | "medium" | "low";
  confidenceScore: number;   // 0–100
  headcountTarget: number;
  currentHires: number;
  hiresRemaining: number;
  pipelineDepth: {
    totalActive: number;
    byStage: Record<string, number>;
    equivQualified: number;    // Weighted sum of pipeline
    coverageRatio: number;     // equivQualified / hiresRemaining (>1 = on track)
  };
  avgDaysPerStage: Record<string, number>;
  estimatedDaysToFill: number;
  openRequisitions: number;
  isOnTrack: boolean;
  daysAheadOrBehind: number | null;  // null if no target date; positive=ahead, negative=behind
  blockers: ForecastBlocker[];
  computedAt: string;
}

export interface ForecastInputs {
  market: string;
  headcountTarget: number;
  customerStartDate?: string | null;
  roleType?: string;
}

// ── Core computation ──────────────────────────────────────────────────────────

export async function computeGoLiveForecast(inputs: ForecastInputs): Promise<GoLiveForecast> {
  const { market, headcountTarget, customerStartDate, roleType } = inputs;
  const blockers: ForecastBlocker[] = [];

  // ── 1. Open requisitions for this market ─────────────────────────────────
  const reqResult = await pool.query(`
    SELECT
      r.id,
      r.target_hires,
      r.current_hires,
      r.status,
      r.worker_type,
      r.work_type,
      r.required_license_class,
      r.target_fill_date,
      COALESCE(r.target_hires, 1)  AS t_hires,
      COALESCE(r.current_hires, 0) AS c_hires
    FROM recruiting_requisitions r
    WHERE r.market = $1
      AND r.status = 'open'
      AND r.is_archived = false
  `, [market]);

  const openReqs: any[] = (reqResult as any).rows ?? reqResult;
  const openReqIds: string[] = openReqs.map((r: any) => r.id);

  if (openReqs.length === 0) {
    blockers.push({
      severity: "critical",
      code: "NO_OPEN_REQUISITIONS",
      description: "No open requisitions found for this market.",
      recommendation: "Create and open requisitions for the required roles before forecasting go-live.",
    });
  }

  const reqHeadcountTarget = openReqs.reduce((s: number, r: any) => s + Number(r.t_hires), 0);
  const currentHires       = openReqs.reduce((s: number, r: any) => s + Number(r.c_hires), 0);
  const effectiveTarget    = headcountTarget > 0 ? headcountTarget : reqHeadcountTarget || 1;
  const hiresRemaining     = Math.max(0, effectiveTarget - currentHires);

  // ── 2. Pipeline depth — applications by stage ────────────────────────────
  let byStage: Record<string, number> = {};
  let totalActive = 0;

  if (openReqIds.length > 0) {
    const placeholders = openReqIds.map((_, i) => `$${i + 2}`).join(",");
    const pipelineResult = await pool.query(`
      SELECT
        current_stage,
        COUNT(*) AS cnt
      FROM recruiting_applications
      WHERE requisition_id IN (${placeholders})
        AND is_archived = false
        AND current_stage NOT IN ('rejected', 'withdrawn', 'no_show', 'offer_declined')
      GROUP BY current_stage
    `, [market, ...openReqIds]);

    const rows = (pipelineResult as any).rows ?? pipelineResult;
    for (const row of rows) {
      byStage[row.current_stage] = Number(row.cnt);
      totalActive += Number(row.cnt);
    }
  }

  const equivQualified = Object.entries(byStage).reduce((sum, [stage, count]) => {
    return sum + (STAGE_WEIGHTS[stage] ?? 0.05) * count;
  }, 0);

  const coverageRatio = hiresRemaining > 0 ? equivQualified / hiresRemaining : (equivQualified > 0 ? 2 : 0);

  if (totalActive === 0 && openReqs.length > 0) {
    blockers.push({
      severity: "critical",
      code: "EMPTY_PIPELINE",
      description: "No active candidates in the pipeline for this market.",
      recommendation: "Launch ad campaigns immediately to generate applicant flow.",
    });
  } else if (totalActive < 5 && hiresRemaining > 2) {
    blockers.push({
      severity: "warning",
      code: "THIN_PIPELINE",
      description: `Pipeline is thin — only ${totalActive} active candidate${totalActive !== 1 ? "s" : ""} for ${hiresRemaining} remaining hire${hiresRemaining !== 1 ? "s" : ""}.`,
      recommendation: "Increase ad spend and source from additional channels to build pipeline depth.",
    });
  }

  // ── 3. Avg days per stage from stage history ──────────────────────────────
  let avgDaysPerStage: Record<string, number> = { ...DEFAULT_STAGE_DAYS };

  if (openReqIds.length > 0) {
    const placeholders = openReqIds.map((_, i) => `$${i + 1}`).join(",");
    const stageTimeResult = await pool.query(`
      SELECT
        sh.to_stage,
        AVG(sh.time_in_previous_stage_minutes) AS avg_minutes
      FROM recruiting_stage_history sh
      JOIN recruiting_applications a ON a.id = sh.application_id
      WHERE a.requisition_id IN (${placeholders})
        AND sh.time_in_previous_stage_minutes IS NOT NULL
        AND sh.time_in_previous_stage_minutes > 0
      GROUP BY sh.to_stage
    `, openReqIds);

    const stageRows = (stageTimeResult as any).rows ?? stageTimeResult;
    for (const row of stageRows) {
      const days = Number(row.avg_minutes) / (60 * 24);
      if (days > 0) avgDaysPerStage[row.to_stage] = Math.round(days * 10) / 10;
    }
  }

  // ── 4. Estimate total days from first application to hire ────────────────
  const pipelineStagesInOrder = [
    "applied", "phone_screen", "interview_scheduled", "interview_completed",
    "background_check", "drug_test", "mvr_check", "offer_extended", "offer_accepted", "onboarding",
  ];
  const totalPipelineDays = pipelineStagesInOrder.reduce((s, stage) => s + (avgDaysPerStage[stage] ?? 0), 0);

  // Find where the "average" candidate is in the pipeline
  // Use weighted centroid of the current pipeline
  let weightedStageIndex = 0;
  let totalWeight = 0;
  for (const [stage, count] of Object.entries(byStage)) {
    const idx = pipelineStagesInOrder.indexOf(stage);
    const w = (STAGE_WEIGHTS[stage] ?? 0.05) * count;
    if (idx >= 0) { weightedStageIndex += idx * w; totalWeight += w; }
  }
  const avgPipelineIdx = totalWeight > 0 ? weightedStageIndex / totalWeight : 0;

  // Days remaining in pipeline for a "typical" candidate currently in pipeline
  const remainingPipelineDays = pipelineStagesInOrder
    .slice(Math.floor(avgPipelineIdx))
    .reduce((s, stage) => s + (avgDaysPerStage[stage] ?? 0), 0);

  // Velocity: how many net new hires per week based on pipeline
  // Rough model: equivQualified candidates will convert over remainingPipelineDays
  const hiresFromCurrentPipeline = equivQualified;
  const daysForCurrentPipelineToConvert = Math.max(1, remainingPipelineDays);
  const weeklyHireVelocity = (hiresFromCurrentPipeline / daysForCurrentPipelineToConvert) * 7;

  let estimatedDaysToFill: number;
  if (hiresRemaining <= 0) {
    estimatedDaysToFill = 0;
  } else if (weeklyHireVelocity > 0) {
    // Days to hire remaining from current pipeline + refill buffer if pipeline is thin
    const daysFromPipeline = Math.ceil((hiresRemaining / weeklyHireVelocity) * 7);
    // If pipeline doesn't cover all needs, add lead time for sourcing new candidates
    const uncoveredHires = Math.max(0, hiresRemaining - hiresFromCurrentPipeline);
    const sourcingLeadDays = uncoveredHires > 0 ? Math.ceil(uncoveredHires * (totalPipelineDays / Math.max(1, weeklyHireVelocity / 7))) : 0;
    estimatedDaysToFill = Math.max(daysFromPipeline, sourcingLeadDays);
  } else {
    // No pipeline velocity — use full pipeline days + sourcing overhead
    estimatedDaysToFill = totalPipelineDays + 14; // 14 days sourcing lead
  }

  // Apply role-type adjustment
  if (roleType === "cdl") {
    estimatedDaysToFill = Math.ceil(estimatedDaysToFill * 1.4); // CDL takes ~40% longer
    blockers.push({
      severity: "info",
      code: "CDL_EXTENDED_TIMELINE",
      description: "CDL-required roles typically take 30–45% longer to fill due to limited candidate supply.",
      recommendation: "Expand geographic sourcing radius and consider CDL training partnerships.",
    });
  }

  // ── 5. Projected dates ────────────────────────────────────────────────────
  const today = new Date();
  const addDays = (d: Date, n: number) => {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r.toISOString().split("T")[0];
  };

  const likelyDays      = Math.max(estimatedDaysToFill, 1);
  const optimisticDays  = Math.max(Math.ceil(likelyDays * 0.70), 1);
  const pessimisticDays = Math.ceil(likelyDays * 1.40);

  const projectedGoLive = {
    optimistic:  addDays(today, optimisticDays),
    likely:      addDays(today, likelyDays),
    pessimistic: addDays(today, pessimisticDays),
  };

  // ── 6. On-track vs behind vs ahead ───────────────────────────────────────
  let isOnTrack = false;
  let daysAheadOrBehind: number | null = null;

  if (customerStartDate) {
    const startDate = new Date(customerStartDate);
    const likelyDate = new Date(projectedGoLive.likely);
    daysAheadOrBehind = Math.round((startDate.getTime() - likelyDate.getTime()) / (1000 * 60 * 60 * 24));
    isOnTrack = daysAheadOrBehind >= 0;

    if (daysAheadOrBehind < -14) {
      blockers.push({
        severity: "critical",
        code: "CRITICAL_DELAY",
        description: `Projected go-live is ${Math.abs(daysAheadOrBehind)} days AFTER the customer start date.`,
        recommendation: "Activate emergency sourcing: premium job board placement, referral bonuses, and consider contracted recruiter support.",
      });
    } else if (daysAheadOrBehind < 0) {
      blockers.push({
        severity: "warning",
        code: "AT_RISK_TIMELINE",
        description: `Timeline is tight — projected go-live may be ${Math.abs(daysAheadOrBehind)} day${Math.abs(daysAheadOrBehind) !== 1 ? "s" : ""} late.`,
        recommendation: "Increase interview throughput and fast-track background checks where possible.",
      });
    }

    // Urgency: customer start is imminent
    const daysUntilStart = Math.ceil((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilStart <= 7 && hiresRemaining > 0) {
      blockers.push({
        severity: "critical",
        code: "IMMINENT_LAUNCH",
        description: `Customer launch is ${daysUntilStart} day${daysUntilStart !== 1 ? "s" : ""} away with ${hiresRemaining} hire${hiresRemaining !== 1 ? "s" : ""} outstanding.`,
        recommendation: "Escalate to leadership and consider interim contracted driver coverage.",
      });
    }
  } else {
    isOnTrack = coverageRatio >= 0.8;
  }

  // Low screening throughput check
  const screeningCount = (byStage["phone_screen"] ?? 0) + (byStage["applied"] ?? 0);
  const advancedCount = totalActive - screeningCount;
  if (screeningCount > 0 && advancedCount === 0 && totalActive > 3) {
    blockers.push({
      severity: "warning",
      code: "SCREENING_BOTTLENECK",
      description: "Most candidates are stuck in early screening — no one has advanced to interview.",
      recommendation: "Prioritize screening reviews and increase recruiter bandwidth for phone screens.",
    });
  }

  // Check for CDL pipeline gap
  if ((roleType === "cdl" || openReqs.some((r: any) => r.required_license_class && r.required_license_class !== "Non-CDL"))) {
    if (totalActive === 0) {
      blockers.push({
        severity: "warning",
        code: "NO_CDL_CANDIDATES",
        description: "No CDL-licensed candidates found in the active pipeline.",
        recommendation: "Target CDL-specific job boards (CDLjobs.com, TruckDriver.com) and veteran workforce programs.",
      });
    }
  }

  // ── 7. Confidence score ──────────────────────────────────────────────────
  let confidenceScore: number;
  const criticalBlockers = blockers.filter(b => b.severity === "critical").length;
  const warningBlockers  = blockers.filter(b => b.severity === "warning").length;

  if (criticalBlockers > 0) {
    confidenceScore = Math.max(10, 40 - criticalBlockers * 12 - warningBlockers * 5);
  } else if (coverageRatio >= 1.0 && warningBlockers === 0) {
    confidenceScore = Math.min(95, 75 + Math.round(coverageRatio * 10));
  } else if (coverageRatio >= 0.6) {
    confidenceScore = Math.round(50 + coverageRatio * 25 - warningBlockers * 8);
  } else {
    confidenceScore = Math.max(15, Math.round(coverageRatio * 60 - warningBlockers * 8));
  }
  confidenceScore = Math.min(95, Math.max(5, confidenceScore));

  const confidenceLevel: "high" | "medium" | "low" =
    confidenceScore >= 70 ? "high" : confidenceScore >= 40 ? "medium" : "low";

  return {
    projectedGoLive,
    confidenceLevel,
    confidenceScore,
    headcountTarget: effectiveTarget,
    currentHires,
    hiresRemaining,
    pipelineDepth: {
      totalActive,
      byStage,
      equivQualified: Math.round(equivQualified * 10) / 10,
      coverageRatio: Math.round(coverageRatio * 100) / 100,
    },
    avgDaysPerStage,
    estimatedDaysToFill: likelyDays,
    openRequisitions: openReqs.length,
    isOnTrack,
    daysAheadOrBehind,
    blockers,
    computedAt: new Date().toISOString(),
  };
}
