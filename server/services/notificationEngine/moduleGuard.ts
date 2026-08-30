/**
 * Notification Rules Engine – Module Guard
 *
 * Filters a candidate list of user IDs down to only those who have a
 * legitimate reason to receive the notification — based on their role and,
 * optionally, their module access permissions.
 *
 * Design principles:
 *  • Full-access roles (super_user, admin, corporate_admin) always pass.
 *  • If eligibleRoles is provided, other roles must appear in that list.
 *  • If eligibleRoles is absent, no role filter is applied (use when
 *    recipients are tightly scoped by ownership/assignment resolvers).
 *  • The guard operates on batched DB queries — one query per notify() call,
 *    not one per user.
 */

import { pool } from "../../db";

/** Roles that bypass all module restrictions and always receive notifications. */
const FULL_ACCESS_ROLES = new Set([
  "super_user",
  "super_admin",
  "admin",
  "corporate_admin",
]);

/**
 * Filters `userIds` to only those who:
 *  1. Have an ACTIVE account status, AND
 *  2. Either hold a full-access role OR have a role in `eligibleRoles`.
 *
 * When `eligibleRoles` is undefined or empty, the role filter is skipped and
 * only the ACTIVE status check applies.
 *
 * @returns The filtered subset of userIds (preserves input order, deduped).
 */
export async function filterByEligibleRoles(
  userIds: string[],
  eligibleRoles?: string[],
): Promise<string[]> {
  if (!userIds.length) return [];

  // Deduplicate the input to minimise the query result set
  const uniqueIds = [...new Set(userIds)];

  const r = await pool.query<{ id: string; role: string; status: string }>(
    `SELECT id, role, status FROM users WHERE id = ANY($1::text[])`,
    [uniqueIds],
  );

  const allowedRoles: Set<string> | null =
    eligibleRoles && eligibleRoles.length > 0
      ? new Set([...eligibleRoles, ...FULL_ACCESS_ROLES])
      : null; // null = no role filter

  return r.rows
    .filter((row) => {
      // Must be an active account
      if (row.status !== "ACTIVE" && row.status !== "INVITED") return false;
      // If a role filter is defined, enforce it
      if (allowedRoles && !allowedRoles.has(row.role)) return false;
      return true;
    })
    .map((row) => row.id);
}
