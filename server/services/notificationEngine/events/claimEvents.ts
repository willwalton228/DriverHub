/**
 * Notification Rules Engine – Claim Event Definitions
 *
 * Defines who receives in-app notifications for every claim lifecycle event.
 * Email delivery continues to be handled by
 * server/services/communications/events/claimEvents.ts — this file controls
 * only the in-app notification routing.
 *
 * Responsibility model: only users with a direct relationship to the specific
 * claim record are notified. Admin broadcasts are not used here.
 */

import { pool } from "../../../db";
import type { NotificationEventDef } from "../types";
import { byCommRules, byOwner, byAssignee, byContextField } from "../resolvers";

const CLAIMS_ELIGIBLE_ROLES = [
  "super_user", "super_admin", "admin", "corporate_admin", "corporate", "finance",
];

async function queryClaimOwnerIds(claimId: string): Promise<string[]> {
  if (!claimId) return [];
  const r = await pool.query<{ submitted_by_user_id: string | null; assigned_to_user_id: string | null }>(
    `SELECT submitted_by_user_id, assigned_to_user_id FROM claims WHERE id = $1 LIMIT 1`,
    [claimId],
  );
  if (!r.rows.length) return [];
  return [r.rows[0].submitted_by_user_id, r.rows[0].assigned_to_user_id].filter(Boolean) as string[];
}

export const CLAIM_CREATED: NotificationEventDef = {
  event: "CLAIM_CREATED",
  module: "claims",
  category: "status_changes",
  description: "Notifies claims staff (via comm_rules) and the submitter when a new claim is submitted.",
  eligibleRoles: CLAIMS_ELIGIBLE_ROLES,
  recipients: [
    byCommRules("CLAIM_CREATED"),
    byContextField("submitter", (ctx) => ctx.payload.createdByUserId),
  ],
  template: (ctx) => {
    const { claimNumber, claimType, driverName, incidentDate, severity, status, customerName, createdBy } = ctx.payload;
    const statusNote = (status === "DRAFT" || !status) ? " [Incomplete]" : "";
    return {
      type: "claim_created",
      title: `New Claim Added – #${claimNumber}${statusNote}`,
      message: `${claimType} · ${driverName}${customerName ? ` · ${customerName}` : ""} · ${incidentDate} · Severity: ${severity}. Created by ${createdBy}.`,
    };
  },
  entity: (ctx) => ({ type: "claim", id: ctx.payload.claimId, url: ctx.payload.claimUrl }),
};

export const CLAIM_UPDATED: NotificationEventDef = {
  event: "CLAIM_UPDATED",
  module: "claims",
  category: "status_changes",
  description: "Notifies relevant users when a claim's status changes.",
  eligibleRoles: CLAIMS_ELIGIBLE_ROLES,
  recipients: [
    byCommRules("CLAIM_UPDATED"),
    byContextField("involved", (ctx) => queryClaimOwnerIds(ctx.payload.claimId)),
  ],
  template: (ctx) => ({
    type: "claim_updated",
    title: `Claim Status Updated — ${ctx.payload.newStatus}`,
    message: `${ctx.payload.driverName}'s claim moved from ${ctx.payload.oldStatus} to ${ctx.payload.newStatus}.`,
  }),
  entity: (ctx) => ({ type: "claim", id: ctx.payload.claimId, url: ctx.payload.claimUrl }),
};

export const CLAIM_AMOUNT_UPDATED: NotificationEventDef = {
  event: "CLAIM_AMOUNT_UPDATED",
  module: "claims",
  category: "status_changes",
  description: "Notifies relevant users when claim financial amounts change.",
  eligibleRoles: CLAIMS_ELIGIBLE_ROLES,
  recipients: [
    byCommRules("CLAIM_AMOUNT_UPDATED"),
    byContextField("involved", (ctx) => queryClaimOwnerIds(ctx.payload.claimId)),
  ],
  template: (ctx) => ({
    type: "claim_amount_updated",
    title: `Claim Amount Updated — #${ctx.payload.claimNumber}`,
    message: `Financial amounts updated on ${ctx.payload.driverName}'s claim. ${ctx.payload.changeLines}. Updated by ${ctx.payload.updatedBy}.`,
  }),
  entity: (ctx) => ({ type: "claim", id: ctx.payload.claimId, url: ctx.payload.claimUrl }),
};

export const CLAIM_CLOSED: NotificationEventDef = {
  event: "CLAIM_CLOSED",
  module: "claims",
  category: "completed_tasks",
  description: "Notifies relevant users when a claim is closed.",
  eligibleRoles: CLAIMS_ELIGIBLE_ROLES,
  recipients: [
    byCommRules("CLAIM_CLOSED"),
    byContextField("involved", (ctx) => queryClaimOwnerIds(ctx.payload.claimId)),
  ],
  template: (ctx) => ({
    type: "claim_closed",
    title: `Claim Closed — #${ctx.payload.claimNumber}`,
    message: `${ctx.payload.driverName}'s ${ctx.payload.claimType} claim has been closed with status "${ctx.payload.finalStatus}". Closed by ${ctx.payload.closedBy}.`,
  }),
  entity: (ctx) => ({ type: "claim", id: ctx.payload.claimId, url: ctx.payload.claimUrl }),
};

export const CLAIM_DOCUMENTATION_REQUIRED: NotificationEventDef = {
  event: "CLAIM_DOCUMENTATION_REQUIRED",
  module: "claims",
  category: "assigned_to_me",
  description: "Notifies the claim owner and assignee when documentation is required to proceed.",
  eligibleRoles: CLAIMS_ELIGIBLE_ROLES,
  recipients: [
    byOwner((ctx) => ctx.payload.ownerUserId),
    byAssignee((ctx) => ctx.payload.assignedToUserId),
  ],
  template: (ctx) => ({
    type: "claim_documentation_required",
    title: `Documentation Required — Claim #${ctx.payload.claimNumber}`,
    message: `Claim #${ctx.payload.claimNumber} for ${ctx.payload.driverName} requires documentation before it can proceed.${ctx.payload.note ? ` Note: ${ctx.payload.note}` : ""}`,
  }),
  entity: (ctx) => ({ type: "claim", id: ctx.payload.claimId, url: ctx.payload.claimUrl }),
};

export const CLAIM_FOLLOWUP_REQUIRED: NotificationEventDef = {
  event: "CLAIM_FOLLOWUP_REQUIRED",
  module: "claims",
  category: "assigned_to_me",
  description: "Notifies the claim owner and assignee when a follow-up action is required.",
  eligibleRoles: CLAIMS_ELIGIBLE_ROLES,
  recipients: [
    byOwner((ctx) => ctx.payload.ownerUserId),
    byAssignee((ctx) => ctx.payload.assignedToUserId),
  ],
  template: (ctx) => ({
    type: "claim_followup_required",
    title: `Follow-Up Required — Claim #${ctx.payload.claimNumber}`,
    message: `Action required on claim #${ctx.payload.claimNumber} for ${ctx.payload.driverName}.${ctx.payload.note ? ` Note: ${ctx.payload.note}` : ""}`,
  }),
  entity: (ctx) => ({ type: "claim", id: ctx.payload.claimId, url: ctx.payload.claimUrl }),
};

export const CLAIM_EVENT_DEFS: NotificationEventDef[] = [
  CLAIM_CREATED, CLAIM_UPDATED, CLAIM_AMOUNT_UPDATED, CLAIM_CLOSED,
  CLAIM_DOCUMENTATION_REQUIRED, CLAIM_FOLLOWUP_REQUIRED,
];
