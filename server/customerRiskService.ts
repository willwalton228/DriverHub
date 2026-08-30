import { db } from "./db";
import { customerRiskScores, accidents, trips, customers } from "@shared/schema";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import type { CustomerRiskBand, ContractPressureFlag, InsertCustomerRiskScore } from "@shared/schema";

interface RiskMetrics {
  claimsPer1000Moves30d: number;
  claimsPer1000Moves90d: number;
  claimsPer1000Moves180d: number;
  severityWeightedLossIndex: number;
  totalClaims30d: number;
  totalClaims90d: number;
  totalClaims180d: number;
  totalMoves30d: number;
  totalMoves90d: number;
  totalMoves180d: number;
  totalClaimCost180d: number;
}

const SEVERITY_WEIGHTS: Record<string, number> = {
  minor: 1,
  moderate: 3,
  severe: 10,
  LOW: 1,
  MEDIUM: 3,
  HIGH: 7,
  CRITICAL: 10,
};

function determineRiskBand(normalizedScore: number): CustomerRiskBand {
  if (normalizedScore >= 200) return "critical";
  if (normalizedScore >= 150) return "high";
  if (normalizedScore >= 100) return "medium";
  return "low";
}

function determineContractPressureFlags(
  metrics: RiskMetrics,
  riskBand: CustomerRiskBand,
  systemAverage: number
): ContractPressureFlag[] {
  const flags: ContractPressureFlag[] = [];

  if (riskBand === "critical" || riskBand === "high") {
    if (metrics.claimsPer1000Moves180d > systemAverage * 2) {
      flags.push("pricing_misaligned_with_risk");
    }
    flags.push("contract_review_recommended");
  }

  if (riskBand === "critical" && metrics.claimsPer1000Moves180d > systemAverage * 3) {
    flags.push("exit_candidate");
  }

  return flags;
}

function determineTrend(current: number, previous: number | null): string {
  if (previous === null) return "stable";
  const diff = current - previous;
  if (diff > 10) return "worsening";
  if (diff < -10) return "improving";
  return "stable";
}

export async function calculateCustomerRiskScore(customerId: string): Promise<void> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const oneEightyDaysAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  const claims30d = await db.execute(sql`
    SELECT COUNT(*) as count, 
           COALESCE(SUM(COALESCE(total_estimate, probable_cost, 0)), 0) as total_cost
    FROM accidents 
    WHERE customer_id = ${customerId} 
    AND incident_date >= ${thirtyDaysAgo}
  `);

  const claims90d = await db.execute(sql`
    SELECT COUNT(*) as count,
           COALESCE(SUM(COALESCE(total_estimate, probable_cost, 0)), 0) as total_cost
    FROM accidents 
    WHERE customer_id = ${customerId} 
    AND incident_date >= ${ninetyDaysAgo}
  `);

  const claims180d = await db.execute(sql`
    SELECT COUNT(*) as count,
           COALESCE(SUM(COALESCE(total_estimate, probable_cost, 0)), 0) as total_cost,
           COALESCE(SUM(
             CASE 
               WHEN triage_severity = 'severe' OR claim_severity = 'CRITICAL' OR claim_severity = 'HIGH' THEN 10
               WHEN triage_severity = 'moderate' OR claim_severity = 'MEDIUM' THEN 3
               ELSE 1
             END
           ), 0) as weighted_severity
    FROM accidents 
    WHERE customer_id = ${customerId} 
    AND incident_date >= ${oneEightyDaysAgo}
  `);

  const moves30d = await db.execute(sql`
    SELECT COUNT(*) as count 
    FROM trips 
    WHERE customer_id = ${customerId} 
    AND created_at >= ${thirtyDaysAgo}
  `);

  const moves90d = await db.execute(sql`
    SELECT COUNT(*) as count 
    FROM trips 
    WHERE customer_id = ${customerId} 
    AND created_at >= ${ninetyDaysAgo}
  `);

  const moves180d = await db.execute(sql`
    SELECT COUNT(*) as count 
    FROM trips 
    WHERE customer_id = ${customerId} 
    AND created_at >= ${oneEightyDaysAgo}
  `);

  const systemAverageResult = await db.execute(sql`
    SELECT 
      CASE 
        WHEN SUM(move_count) > 0 
        THEN (SUM(claim_count)::numeric / SUM(move_count)::numeric) * 1000
        ELSE 0
      END as avg_claims_per_1000
    FROM (
      SELECT 
        c.id,
        (SELECT COUNT(*) FROM accidents a WHERE a.customer_id = c.id AND a.incident_date >= ${oneEightyDaysAgo}) as claim_count,
        (SELECT COUNT(*) FROM trips t WHERE t.customer_id = c.id AND t.created_at >= ${oneEightyDaysAgo}) as move_count
      FROM customers c
    ) subq
    WHERE move_count > 10
  `);

  const claimCount30d = parseInt(claims30d.rows[0]?.count as string || "0");
  const claimCount90d = parseInt(claims90d.rows[0]?.count as string || "0");
  const claimCount180d = parseInt(claims180d.rows[0]?.count as string || "0");
  const totalCost180d = parseFloat(claims180d.rows[0]?.total_cost as string || "0");
  const weightedSeverity = parseFloat(claims180d.rows[0]?.weighted_severity as string || "0");

  const moveCount30d = parseInt(moves30d.rows[0]?.count as string || "0");
  const moveCount90d = parseInt(moves90d.rows[0]?.count as string || "0");
  const moveCount180d = parseInt(moves180d.rows[0]?.count as string || "0");

  const systemAverage = parseFloat(systemAverageResult.rows[0]?.avg_claims_per_1000 as string || "0") || 1;

  const claimsPer1000_30d = moveCount30d > 0 ? (claimCount30d / moveCount30d) * 1000 : 0;
  const claimsPer1000_90d = moveCount90d > 0 ? (claimCount90d / moveCount90d) * 1000 : 0;
  const claimsPer1000_180d = moveCount180d > 0 ? (claimCount180d / moveCount180d) * 1000 : 0;

  const severityWeightedLossIndex = moveCount180d > 0 ? weightedSeverity / moveCount180d * 100 : 0;

  const normalizedScore = systemAverage > 0 ? (claimsPer1000_180d / systemAverage) * 100 : 0;

  const riskBand = determineRiskBand(normalizedScore);

  const metrics: RiskMetrics = {
    claimsPer1000Moves30d: claimsPer1000_30d,
    claimsPer1000Moves90d: claimsPer1000_90d,
    claimsPer1000Moves180d: claimsPer1000_180d,
    severityWeightedLossIndex,
    totalClaims30d: claimCount30d,
    totalClaims90d: claimCount90d,
    totalClaims180d: claimCount180d,
    totalMoves30d: moveCount30d,
    totalMoves90d: moveCount90d,
    totalMoves180d: moveCount180d,
    totalClaimCost180d: totalCost180d,
  };

  const contractPressureFlags = determineContractPressureFlags(metrics, riskBand, systemAverage);

  const [existingScore] = await db
    .select()
    .from(customerRiskScores)
    .where(eq(customerRiskScores.customerId, customerId));

  const previousRiskBand = existingScore?.riskBand || null;
  const previousNormalizedScore = existingScore?.normalizedScore ? parseFloat(existingScore.normalizedScore) : null;
  const scoreTrend = determineTrend(normalizedScore, previousNormalizedScore);

  const scoreData = {
    customerId,
    claimsPer1000Moves30d: claimsPer1000_30d.toFixed(4),
    claimsPer1000Moves90d: claimsPer1000_90d.toFixed(4),
    claimsPer1000Moves180d: claimsPer1000_180d.toFixed(4),
    severityWeightedLossIndex: severityWeightedLossIndex.toFixed(4),
    normalizedScore: normalizedScore.toFixed(2),
    riskBand,
    contractPressureFlags: JSON.stringify(contractPressureFlags),
    totalClaims30d: claimCount30d,
    totalClaims90d: claimCount90d,
    totalClaims180d: claimCount180d,
    totalMoves30d: moveCount30d,
    totalMoves90d: moveCount90d,
    totalMoves180d: moveCount180d,
    totalClaimCost180d: totalCost180d.toFixed(2),
    previousRiskBand: previousRiskBand !== riskBand ? previousRiskBand : existingScore?.previousRiskBand,
    riskBandChangedAt: previousRiskBand !== riskBand ? new Date() : existingScore?.riskBandChangedAt,
    scoreTrend,
    calculatedAt: new Date(),
    systemAverageAtCalculation: systemAverage.toFixed(4),
    updatedAt: new Date(),
  };

  if (existingScore) {
    await db.update(customerRiskScores)
      .set(scoreData)
      .where(eq(customerRiskScores.id, existingScore.id));
  } else {
    await db.insert(customerRiskScores).values(scoreData);
  }
}

export async function getCustomerRiskScore(customerId: string): Promise<any | null> {
  const [score] = await db
    .select()
    .from(customerRiskScores)
    .where(eq(customerRiskScores.customerId, customerId));

  if (score) {
    return {
      ...score,
      contractPressureFlags: score.contractPressureFlags ? JSON.parse(score.contractPressureFlags) : [],
    };
  }

  return null;
}

export async function getHighRiskCustomers(limit: number = 20): Promise<any[]> {
  const scores = await db
    .select({
      score: customerRiskScores,
      customer: customers,
    })
    .from(customerRiskScores)
    .leftJoin(customers, eq(customerRiskScores.customerId, customers.id))
    .where(sql`${customerRiskScores.riskBand} IN ('high', 'critical')`)
    .orderBy(desc(customerRiskScores.normalizedScore))
    .limit(limit);

  return scores.map(s => ({
    ...s.score,
    customerName: s.customer?.customerName || "Unknown",
    contractPressureFlags: s.score.contractPressureFlags ? JSON.parse(s.score.contractPressureFlags) : [],
  }));
}

export async function refreshAllCustomerRiskScores(): Promise<number> {
  const customersList = await db
    .select({ id: customers.id })
    .from(customers);

  let updated = 0;
  for (const customer of customersList) {
    try {
      await calculateCustomerRiskScore(customer.id);
      updated++;
    } catch (err) {
      console.error(`Failed to calculate risk score for customer ${customer.id}:`, err);
    }
  }

  return updated;
}

export async function getClaimsForCustomer(customerId: string, days: number = 180): Promise<any[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const claims = await db
    .select()
    .from(accidents)
    .where(
      and(
        eq(accidents.customerId, customerId),
        gte(accidents.incidentDate, since)
      )
    )
    .orderBy(desc(accidents.incidentDate));

  return claims;
}
