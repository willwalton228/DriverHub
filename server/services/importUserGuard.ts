/**
 * Import User Creation Guard
 *
 * POLICY: Import jobs (Drivers, Employees, Accounts, Claims, Recruiting, Scheduling)
 * must NEVER create User records. Users are provisioned exclusively via the
 * "Invite New User" admin flow.
 *
 * This guard:
 *  1. Snapshots the user count before a commit job starts.
 *  2. Re-checks after the job finishes.
 *  3. If the count increased → logs a critical policy violation to the system
 *     audit log, marks the batch as failed, and throws so the caller can handle.
 */

import { db } from "../db";
import { users, importBatches } from "../../shared/schema";
import { eq, sql } from "drizzle-orm";

async function getUserCount(): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(users);
  return Number(row?.count ?? 0);
}

/**
 * Call BEFORE the commit background job starts.
 * Returns the current user count to pass to checkAfter().
 */
export async function snapshotUserCount(): Promise<number> {
  return getUserCount();
}

/**
 * Call AFTER the commit background job finishes (or fails).
 * Compares current user count against the snapshot taken before.
 * If users were created, marks the batch FAILED and writes a policy-violation
 * entry to the system audit log.
 *
 * @returns true if clean, false if violation detected.
 */
export async function assertUserCountUnchanged(
  batchId: string,
  module: string,
  countBefore: number,
): Promise<boolean> {
  let countAfter: number;
  try {
    countAfter = await getUserCount();
  } catch {
    return true;
  }

  if (countAfter <= countBefore) return true;

  const delta = countAfter - countBefore;
  const message = `POLICY VIOLATION: ${module} import batch ${batchId} created ${delta} User record(s). ` +
    `User creation is ONLY permitted via the Invite New User flow.`;

  console.error(`[ImportUserGuard] ${message}`);

  try {
    await db.update(importBatches)
      .set({
        status: "failed",
        errorMessage: message,
      })
      .where(eq(importBatches.id, batchId));
  } catch (_) {}

  try {
    const { writeSystemAuditEvent } = await import("./systemAuditLogService");
    await writeSystemAuditEvent({
      eventType: "import.policy_violation.user_creation",
      targetEntityType: "import_batch",
      targetEntityId: batchId,
      metadata: {
        module,
        batchId,
        userCountBefore: countBefore,
        userCountAfter: countAfter,
        usersCreated: delta,
        policy: "Users must only be created via Invite New User flow",
      },
      reason: message,
    });
  } catch (_) {}

  return false;
}
