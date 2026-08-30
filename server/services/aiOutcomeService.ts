/**
 * AI Outcome Service — Ticket 28
 *
 * Records and retrieves AI recommendation outcomes for feedback loop tracking.
 * Supports three recommendation types:
 *   - pay_range: recommended pay vs actual hiring pay
 *   - source_channel: recommended channel vs actual top performer
 *   - time_to_fill: estimated TTF vs actual days to close
 *   - applicant_screening: AI readiness score vs actual recruiter outcome
 */

import { db } from "../db";
import { pool } from "../db";
import {
  aiRecommendationOutcomes,
  type AIRecommendationOutcome,
  type InsertAIRecommendationOutcome,
} from "../../shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";

// ── Create ───────────────────────────────────────────────────────────────────

export async function recordOutcome(
  data: InsertAIRecommendationOutcome
): Promise<AIRecommendationOutcome> {
  const [outcome] = await db
    .insert(aiRecommendationOutcomes)
    .values(data)
    .returning();
  return outcome;
}

// ── Query ────────────────────────────────────────────────────────────────────

export async function getOutcomesByGeography(
  geography: string,
  limit = 50
): Promise<AIRecommendationOutcome[]> {
  return db
    .select()
    .from(aiRecommendationOutcomes)
    .where(eq(aiRecommendationOutcomes.geography, geography))
    .orderBy(desc(aiRecommendationOutcomes.recordedAt))
    .limit(limit);
}

export async function getOutcomesBySnapshot(
  snapshotId: string
): Promise<AIRecommendationOutcome[]> {
  return db
    .select()
    .from(aiRecommendationOutcomes)
    .where(eq(aiRecommendationOutcomes.snapshotId, snapshotId))
    .orderBy(desc(aiRecommendationOutcomes.recordedAt));
}

export async function getAllOutcomes(
  limit = 200
): Promise<AIRecommendationOutcome[]> {
  return db
    .select()
    .from(aiRecommendationOutcomes)
    .orderBy(desc(aiRecommendationOutcomes.recordedAt))
    .limit(limit);
}

export async function deleteOutcome(id: string): Promise<void> {
  await db
    .delete(aiRecommendationOutcomes)
    .where(eq(aiRecommendationOutcomes.id, id));
}

// ── Aggregate accuracy report ─────────────────────────────────────────────────

export interface AccuracyReport {
  totalOutcomes: number;
  byType: Record<
    string,
    {
      count: number;
      accurateCount: number;
      partialCount: number;
      inaccurateCount: number;
      accuracyRate: number;
      avgVariancePct: number | null;
    }
  >;
  byRating: Record<string, number>;
  avgAccuracyScore: number | null;
  geographies: string[];
}

export async function computeAccuracyReport(): Promise<AccuracyReport> {
  const result = await pool.query(`
    SELECT
      outcome_type,
      accuracy_rating,
      accuracy_score,
      variance_pct,
      geography
    FROM ai_recommendation_outcomes
    ORDER BY recorded_at DESC
    LIMIT 500
  `);

  const rows = result.rows;

  const byType: AccuracyReport["byType"] = {};
  const byRating: Record<string, number> = { accurate: 0, partially_accurate: 0, inaccurate: 0, unrated: 0 };
  const geoSet = new Set<string>();
  let totalScore = 0;
  let scoreCount = 0;

  for (const row of rows) {
    const t = row.outcome_type;
    if (!byType[t]) {
      byType[t] = { count: 0, accurateCount: 0, partialCount: 0, inaccurateCount: 0, accuracyRate: 0, avgVariancePct: null };
    }
    byType[t].count++;

    const rating = row.accuracy_rating;
    if (rating === "accurate") { byType[t].accurateCount++; byRating.accurate = (byRating.accurate || 0) + 1; }
    else if (rating === "partially_accurate") { byType[t].partialCount++; byRating.partially_accurate = (byRating.partially_accurate || 0) + 1; }
    else if (rating === "inaccurate") { byType[t].inaccurateCount++; byRating.inaccurate = (byRating.inaccurate || 0) + 1; }
    else { byRating.unrated = (byRating.unrated || 0) + 1; }

    if (row.accuracy_score != null) {
      totalScore += parseInt(row.accuracy_score, 10);
      scoreCount++;
    }
    if (row.geography) geoSet.add(row.geography);
  }

  // Compute accuracy rates
  for (const t of Object.keys(byType)) {
    const g = byType[t];
    const rated = g.accurateCount + g.partialCount + g.inaccurateCount;
    g.accuracyRate = rated > 0 ? Math.round((g.accurateCount / rated) * 100) : 0;
  }

  // Variance avg per type
  const varResult = await pool.query(`
    SELECT outcome_type, AVG(ABS(variance_pct)) AS avg_var
    FROM ai_recommendation_outcomes
    WHERE variance_pct IS NOT NULL
    GROUP BY outcome_type
  `);
  for (const row of varResult.rows) {
    if (byType[row.outcome_type]) {
      byType[row.outcome_type].avgVariancePct = row.avg_var != null ? parseFloat(parseFloat(row.avg_var).toFixed(1)) : null;
    }
  }

  return {
    totalOutcomes: rows.length,
    byType,
    byRating,
    avgAccuracyScore: scoreCount > 0 ? Math.round(totalScore / scoreCount) : null,
    geographies: Array.from(geoSet).sort(),
  };
}

// ── Applicant screening accuracy (uses existing readiness_score data) ─────────

export interface ScreeningAccuracyRow {
  readinessBucket: string;
  totalCount: number;
  hiredCount: number;
  rejectedCount: number;
  hireRate: number;
}

export async function computeScreeningAccuracy(): Promise<ScreeningAccuracyRow[]> {
  const result = await pool.query(`
    SELECT
      CASE
        WHEN readiness_score >= 80 THEN 'High (80-100)'
        WHEN readiness_score >= 60 THEN 'Medium (60-79)'
        WHEN readiness_score >= 40 THEN 'Low-Medium (40-59)'
        WHEN readiness_score IS NOT NULL THEN 'Low (<40)'
        ELSE 'Unscored'
      END AS readiness_bucket,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE current_stage = 'hired') AS hired,
      COUNT(*) FILTER (WHERE current_stage IN ('rejected','withdrawn')) AS rejected
    FROM recruiting_applications
    GROUP BY 1
    ORDER BY
      CASE
        WHEN readiness_score >= 80 THEN 1
        WHEN readiness_score >= 60 THEN 2
        WHEN readiness_score >= 40 THEN 3
        WHEN readiness_score IS NOT NULL THEN 4
        ELSE 5
      END
  `);

  return result.rows.map((r) => ({
    readinessBucket: r.readiness_bucket,
    totalCount: parseInt(r.total, 10),
    hiredCount: parseInt(r.hired, 10),
    rejectedCount: parseInt(r.rejected, 10),
    hireRate:
      parseInt(r.total, 10) > 0
        ? Math.round((parseInt(r.hired, 10) / parseInt(r.total, 10)) * 100)
        : 0,
  }));
}
