import { db } from "./db";
import { retentionPolicies, purgeRuns, legalHolds } from "@shared/schema";
import { eq, and, lt, sql, notInArray } from "drizzle-orm";
import { getHeldItemIds } from "./legalHoldService";

// Configuration
const PURGE_BATCH_SIZE = 1000; // Process in batches to avoid long locks

// Whitelist of allowed table/column combinations for purge (security)
// Maps table to date column(s) and optional legal hold scope info
const ALLOWED_PURGE_TARGETS: Record<string, { 
  dateColumns: string[]; 
  legalHoldScope?: { type: 'move' | 'case' | 'driver'; idColumn: string };
}> = {
  "ingested_events": { 
    dateColumns: ["received_at", "processed_at"],
    legalHoldScope: { type: "move", idColumn: "move_id" }
  },
  "proof_access_logs": { 
    dateColumns: ["accessed_at"],
    legalHoldScope: { type: "move", idColumn: "move_id" }
  },
  "replay_jobs": { 
    dateColumns: ["created_at"]
  },
};

// Default retention policies (in days)
export const DEFAULT_RETENTION_POLICIES = [
  {
    policyName: "ingested_events",
    displayName: "Ingested Events",
    description: "Raw execution events from DriverConnect. Required for billing disputes, payroll audits, and claims defense.",
    retentionDays: 730, // 24 months
    tableName: "ingested_events",
    dateColumn: "received_at",
  },
  {
    policyName: "processing_logs",
    displayName: "Processing Logs",
    description: "Event processing audit trail including retries and failures.",
    retentionDays: 180, // 6 months
    tableName: "ingested_events",
    dateColumn: "processed_at",
  },
  {
    policyName: "proof_access_logs",
    displayName: "Proof Access Logs",
    description: "Audit trail for media proof access requests. Required for compliance and security audits.",
    retentionDays: 730, // 24 months
    tableName: "proof_access_logs",
    dateColumn: "accessed_at",
  },
  {
    policyName: "replay_jobs",
    displayName: "Replay Jobs",
    description: "Event replay and backfill job history.",
    retentionDays: 365, // 12 months
    tableName: "replay_jobs",
    dateColumn: "created_at",
  },
];

// Seed default retention policies if they don't exist
export async function seedRetentionPolicies(): Promise<void> {
  console.log("[Retention] Seeding default retention policies...");
  
  for (const policy of DEFAULT_RETENTION_POLICIES) {
    const [existing] = await db.select()
      .from(retentionPolicies)
      .where(eq(retentionPolicies.policyName, policy.policyName))
      .limit(1);
    
    if (!existing) {
      await db.insert(retentionPolicies).values(policy);
      console.log(`[Retention] Created policy: ${policy.policyName}`);
    }
  }
  
  console.log("[Retention] Default policies ready");
}

// Execute purge for a single policy
export async function executePurge(
  policyId: string, 
  triggeredBy?: string
): Promise<{ success: boolean; recordsPurged: number; error?: string }> {
  // Create purge run record
  const [purgeRun] = await db.insert(purgeRuns)
    .values({
      policyId,
      triggeredBy,
      status: "running",
    })
    .returning();

  try {
    // Get policy details
    const [policy] = await db.select()
      .from(retentionPolicies)
      .where(eq(retentionPolicies.id, policyId))
      .limit(1);

    if (!policy) {
      throw new Error("Policy not found");
    }

    // Security: Validate table/column against whitelist to prevent SQL injection
    const targetConfig = ALLOWED_PURGE_TARGETS[policy.tableName];
    if (!targetConfig || !targetConfig.dateColumns.includes(policy.dateColumn)) {
      throw new Error(`Invalid purge target: ${policy.tableName}.${policy.dateColumn} is not whitelisted`);
    }

    // Check for policy-level legal hold
    if (policy.legalHoldEnabled) {
      console.log(`[Retention] Policy ${policy.policyName} has legal hold enabled, skipping purge`);
      await db.update(purgeRuns)
        .set({
          status: "cancelled",
          completedAt: new Date(),
          errorMessage: "Legal hold enabled - purge skipped",
        })
        .where(eq(purgeRuns.id, purgeRun.id));
      return { success: true, recordsPurged: 0 };
    }

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

    console.log(`[Retention] Purging ${policy.tableName} where ${policy.dateColumn} < ${cutoffDate.toISOString()}`);

    // Check for entity-level legal holds if configured
    let heldItemIds: string[] = [];
    if (targetConfig.legalHoldScope) {
      heldItemIds = await getHeldItemIds(targetConfig.legalHoldScope.type);
      if (heldItemIds.length > 0) {
        console.log(`[Retention] Excluding ${heldItemIds.length} items under legal hold from purge`);
      }
    }

    // Execute purge using raw SQL for flexibility with dynamic table/column names
    // Exclude items under entity-level legal hold
    let result;
    if (heldItemIds.length > 0 && targetConfig.legalHoldScope) {
      // Build NOT IN clause for held items
      const idColumn = targetConfig.legalHoldScope.idColumn;
      result = await db.execute(sql`
        DELETE FROM ${sql.identifier(policy.tableName)}
        WHERE ${sql.identifier(policy.dateColumn)} < ${cutoffDate}
        AND ${sql.identifier(policy.dateColumn)} IS NOT NULL
        AND (${sql.identifier(idColumn)} IS NULL OR ${sql.identifier(idColumn)} NOT IN (${sql.join(heldItemIds.map(id => sql`${id}`), sql`, `)}))
      `);
    } else {
      result = await db.execute(sql`
        DELETE FROM ${sql.identifier(policy.tableName)}
        WHERE ${sql.identifier(policy.dateColumn)} < ${cutoffDate}
        AND ${sql.identifier(policy.dateColumn)} IS NOT NULL
      `);
    }

    const recordsPurged = Number(result.rowCount || 0);

    // Update purge run record
    await db.update(purgeRuns)
      .set({
        status: "completed",
        completedAt: new Date(),
        recordsPurged,
      })
      .where(eq(purgeRuns.id, purgeRun.id));

    console.log(`[Retention] Purged ${recordsPurged} records from ${policy.tableName}`);
    return { success: true, recordsPurged };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Retention] Purge failed:`, error);

    await db.update(purgeRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        errorMessage,
      })
      .where(eq(purgeRuns.id, purgeRun.id));

    return { success: false, recordsPurged: 0, error: errorMessage };
  }
}

// Execute purge for all active policies
export async function executeAllPurges(triggeredBy?: string): Promise<{
  totalPurged: number;
  policyResults: Array<{ policyName: string; recordsPurged: number; success: boolean }>;
}> {
  console.log("[Retention] Starting purge for all policies...");

  const policies = await db.select()
    .from(retentionPolicies)
    .where(eq(retentionPolicies.legalHoldEnabled, false));

  const results: Array<{ policyName: string; recordsPurged: number; success: boolean }> = [];
  let totalPurged = 0;

  for (const policy of policies) {
    const result = await executePurge(policy.id, triggeredBy);
    results.push({
      policyName: policy.policyName,
      recordsPurged: result.recordsPurged,
      success: result.success,
    });
    totalPurged += result.recordsPurged;
  }

  console.log(`[Retention] Purge complete. Total records purged: ${totalPurged}`);
  return { totalPurged, policyResults: results };
}

// Get retention policy by name
export async function getRetentionPolicyByName(policyName: string) {
  const [policy] = await db.select()
    .from(retentionPolicies)
    .where(eq(retentionPolicies.policyName, policyName))
    .limit(1);
  return policy;
}

// Update retention policy
export async function updateRetentionPolicy(
  policyId: string,
  updates: { 
    retentionDays?: number; 
    legalHoldEnabled?: boolean; 
    legalHoldReason?: string | null;
  },
  updatedBy?: string
) {
  const [updated] = await db.update(retentionPolicies)
    .set({
      ...updates,
      updatedAt: new Date(),
      updatedBy,
    })
    .where(eq(retentionPolicies.id, policyId))
    .returning();
  return updated;
}
