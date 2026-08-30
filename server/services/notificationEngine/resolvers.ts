/**
 * Notification Rules Engine – Recipient Resolver Factories
 *
 * Every resolver must answer one question: "Why is this user receiving this notification?"
 *
 * Design rules:
 *   1. Prefer record-specific resolvers (byOwner, byAssignee, byCcList, etc.) over role-based ones.
 *   2. Use bySystemRole ONLY when the role group IS the structural responsible party for the
 *      event type — e.g. admins are the structural owners of all user-access events.
 *      Never use it because users with that role "can see" the record.
 *   3. Every resolver's `reason` string must be a short phrase that explains the relationship,
 *      not just the mechanism: prefer "triage-approver" over "role:admin".
 *   4. If no resolver matches any users, the notification is silently suppressed — correct behaviour.
 *
 * Relationship types supported:
 *   - Record Owner / Submitter         → byOwner()
 *   - Assigned User                    → byAssignee()
 *   - Assigned Developer               → byDeveloper()
 *   - Assigned Reviewer                → byReviewer()
 *   - Assigned Tester                  → byCcList(queryTicketTesterUserIds)
 *   - CC Recipient                     → byCcList()
 *   - Mentioned in comment             → byMentions()
 *   - Approval workflow participant    → byApprovalWorkflow()
 *   - System-level role responsibility → bySystemRole()  ← justified only
 *   - Explicit subscription (future)   → bySubscriber()
 *   - Admin-configured rule (DB)       → byCommRules()
 */

import { pool } from "../../db";
import { resolveUserIdsForEvent } from "../communications/commService";
import type { RecipientResolver, NotificationContext } from "./types";

// ── Record-specific resolvers ─────────────────────────────────────────────────

/**
 * General-purpose resolver that derives one or more user IDs from the event context.
 *
 * @param reason     Short label for audit logs that answers "why" (e.g. "owner", "submitter", "collections-owner")
 * @param getUserIds Function that extracts user ID(s) from the context
 */
export function byContextField(
  reason: string,
  getUserIds: (
    ctx: NotificationContext,
  ) => string | string[] | null | undefined | Promise<string | string[] | null | undefined>,
): RecipientResolver {
  return {
    reason,
    async resolve(ctx: NotificationContext): Promise<string[]> {
      const result = await getUserIds(ctx);
      if (!result) return [];
      if (Array.isArray(result)) return result.filter(Boolean) as string[];
      return [result].filter(Boolean) as string[];
    },
  };
}

/**
 * Notifies the record's owner — the user who created or is primarily responsible for the record.
 * Reason reported as "owner".
 */
export function byOwner(
  getUserId: (ctx: NotificationContext) => string | null | undefined,
): RecipientResolver {
  return byContextField("owner", getUserId);
}

/**
 * Notifies the user currently assigned to work on the record (e.g. a claims handler, ticket assignee).
 * Reason reported as "assignee".
 */
export function byAssignee(
  getUserId: (ctx: NotificationContext) => string | null | undefined,
): RecipientResolver {
  return byContextField("assignee", getUserId);
}

/**
 * Notifies the developer assigned to work on the record (e.g. an AMR developer).
 * Reason reported as "developer".
 */
export function byDeveloper(
  getUserId: (ctx: NotificationContext) => string | null | undefined,
): RecipientResolver {
  return byContextField("developer", getUserId);
}

/**
 * Notifies the reviewer assigned to review the record (e.g. a code reviewer, an approving manager).
 * Reason reported as "reviewer".
 */
export function byReviewer(
  getUserId: (ctx: NotificationContext) => string | null | undefined,
): RecipientResolver {
  return byContextField("reviewer", getUserId);
}

/**
 * Notifies the user responsible for the next step in a workflow
 * (e.g. the next approver in a sequential approval chain).
 * Reason reported as "next-workflow-step".
 */
export function byNextWorkflowStep(
  getUserId: (ctx: NotificationContext) => string | null | undefined | Promise<string | null | undefined>,
): RecipientResolver {
  return {
    reason: "next-workflow-step",
    async resolve(ctx: NotificationContext): Promise<string[]> {
      const id = await getUserId(ctx);
      return id ? [id] : [];
    },
  };
}

/**
 * Notifies users on the CC list for a record.
 * Also used for assigned testers (which are stored in a separate junction table).
 * Reason reported as "cc".
 */
export function byCcList(
  getUserIds: (ctx: NotificationContext) => string[] | Promise<string[]>,
): RecipientResolver {
  return {
    reason: "cc",
    async resolve(ctx: NotificationContext): Promise<string[]> {
      return getUserIds(ctx);
    },
  };
}

/**
 * Notifies users explicitly @mentioned in a comment or description field.
 * Reason reported as "mention".
 */
export function byMentions(
  getUserIds: (ctx: NotificationContext) => string[] | Promise<string[]>,
): RecipientResolver {
  return {
    reason: "mention",
    async resolve(ctx: NotificationContext): Promise<string[]> {
      return getUserIds(ctx);
    },
  };
}

/**
 * Notifies participants in a designated approval workflow.
 * The resolver queries the specific configured approver(s), not generic admin roles.
 * Reason reported as "approver".
 */
export function byApprovalWorkflow(
  resolveApprovers: (ctx: NotificationContext) => string[] | Promise<string[]>,
): RecipientResolver {
  return {
    reason: "approver",
    async resolve(ctx: NotificationContext): Promise<string[]> {
      return resolveApprovers(ctx);
    },
  };
}

// ── System-responsibility resolver ────────────────────────────────────────────

/**
 * Notifies all ACTIVE users whose role matches any of the given role keys.
 *
 * ⚠️  REQUIRES JUSTIFICATION — this resolver must only be used when:
 *   (a) There is no specific record to derive an owner/assignee from (e.g. a system event), OR
 *   (b) The role group IS the structural responsible party for ALL instances of this event
 *       by platform design (e.g. admins own all user-access management).
 *
 * NEVER use this because the role can view the record.
 * Use byOwner / byAssignee / byCcList / byApprovalWorkflow instead.
 *
 * @param roles         Role keys to notify.
 * @param responsibility Short phrase explaining WHY this group owns this event type.
 *                       Used in audit logs. E.g. "triage-approver", "access-control-admin",
 *                       "escalation-target", "staffing-operations-lead".
 */
export function bySystemRole(roles: string[], responsibility: string): RecipientResolver {
  return {
    reason: responsibility,
    async resolve(): Promise<string[]> {
      if (!roles.length) return [];
      const r = await pool.query<{ id: string }>(
        `SELECT id FROM users
         WHERE role = ANY($1::text[])
           AND status = 'ACTIVE'`,
        [roles],
      );
      return r.rows.map((row) => row.id);
    },
  };
}

// ── Explicit subscription resolver (future) ───────────────────────────────────

/**
 * Placeholder for explicit per-user subscriptions.
 * When subscription tables are built, replace the body with a DB query.
 * Reason reported as "subscriber".
 */
export function bySubscriber(
  getUserIds: (ctx: NotificationContext) => string[] | Promise<string[]>,
): RecipientResolver {
  return {
    reason: "subscriber",
    async resolve(ctx: NotificationContext): Promise<string[]> {
      return getUserIds(ctx);
    },
  };
}

// ── DB-query resolver helpers ─────────────────────────────────────────────────

/**
 * Resolves ticket CC users from the ticket_cc_users table.
 */
export async function queryTicketCcUserIds(ticketId: string): Promise<string[]> {
  if (!ticketId) return [];
  const r = await pool.query<{ user_id: string }>(
    `SELECT tcu.user_id
       FROM ticket_cc_users tcu
       JOIN users u ON u.id = tcu.user_id
      WHERE tcu.ticket_id = $1
        AND u.status = 'ACTIVE'`,
    [ticketId],
  );
  return r.rows.map((row) => row.user_id);
}

/**
 * Resolves tester assignments from ticket_testers.
 */
export async function queryTicketTesterUserIds(ticketId: string): Promise<string[]> {
  if (!ticketId) return [];
  const r = await pool.query<{ user_id: string }>(
    `SELECT tt.user_id
       FROM ticket_testers tt
       JOIN users u ON u.id = tt.user_id
      WHERE tt.ticket_id = $1
        AND u.status = 'ACTIVE'`,
    [ticketId],
  );
  return r.rows.map((row) => row.user_id);
}

/**
 * Resolves the active recruiting approver from organization-scoped approval
 * settings. If no settings are configured, recipient resolution safely returns
 * no approver rather than selecting an arbitrary user.
 */
export async function queryRecruitingApproverIds(orgId: string | null | undefined): Promise<string[]> {
  if (!orgId) return [];

  const r = await pool.query<{
    primary_approver_user_id: string | null;
    backup_approver_user_id: string | null;
    delegation_enabled: boolean | null;
    delegation_start_date: string | null;
    delegation_end_date: string | null;
  }>(
    `SELECT primary_approver_user_id,
            backup_approver_user_id,
            delegation_enabled,
            delegation_start_date,
            delegation_end_date
       FROM recruiting_approval_settings
      WHERE org_id = $1
      LIMIT 1`,
    [orgId],
  );
  if (!r.rows.length) return [];

  const {
    primary_approver_user_id,
    backup_approver_user_id,
    delegation_enabled,
    delegation_start_date,
    delegation_end_date,
  } = r.rows[0];
  const today = new Date().toISOString().slice(0, 10);
  const delegationActive = Boolean(
    delegation_enabled
    && backup_approver_user_id
    && delegation_start_date
    && delegation_end_date
    && today >= delegation_start_date
    && today <= delegation_end_date,
  );

  if (delegationActive) return [backup_approver_user_id!];
  return primary_approver_user_id ? [primary_approver_user_id] : [];
}

// ── Admin-configured rule resolver (backward compat) ─────────────────────────

/**
 * Reads recipient user IDs from the `comm_recipient_rules` table for a given event slug.
 * Represents an explicit admin-configured subscription — the admin has decided which
 * users or roles receive this event for this module.
 * Reason reported as "configured-rule".
 *
 * Use alongside record-ownership resolvers so configured rules augment (not replace) them.
 */
export function byCommRules(eventSlug: string): RecipientResolver {
  return {
    reason: "configured-rule",
    async resolve(): Promise<string[]> {
      return resolveUserIdsForEvent(eventSlug);
    },
  };
}

// ── Deprecated: use bySystemRole() instead ───────────────────────────────────

/**
 * @deprecated Use bySystemRole(roles, responsibility) instead.
 * byRoles() emits a generic reason that does not explain why the user is receiving
 * the notification. It is kept only for backward compatibility during migration.
 */
export function byRoles(roles: string[]): RecipientResolver {
  return bySystemRole(roles, `role:${roles.join("+")}`);
}

/** @deprecated Use bySystemRole() instead. */
export function byRole(role: string): RecipientResolver {
  return byRoles([role]);
}
