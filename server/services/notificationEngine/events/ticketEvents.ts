/**
 * Notification Rules Engine – Ticket / AMR Event Definitions
 *
 * Responsibility model: only users with a direct relationship to the specific
 * AMR are notified. AMR_AGING_ESCALATION is mandatory (cannot be opted out)
 * because admins must know about overdue triage.
 */

import { pool } from "../../../db";
import type { NotificationEventDef } from "../types";
import {
  byContextField, byOwner, byAssignee, byDeveloper, byReviewer,
  byCcList, byMentions, bySystemRole,
  queryTicketCcUserIds, queryTicketTesterUserIds,
} from "../resolvers";

const APP_URL = process.env.APP_BASE_URL || process.env.APP_URL || "";

async function queryTicketParticipants(ticketId: string): Promise<string[]> {
  if (!ticketId) return [];
  const r = await pool.query<{
    submitted_by_user_id: string | null;
    assigned_to_user_id: string | null;
    developer_user_id: string | null;
    product_owner_user_id: string | null;
  }>(
    `SELECT submitted_by_user_id, assigned_to_user_id, developer_user_id, product_owner_user_id
       FROM tickets WHERE id = $1 LIMIT 1`,
    [ticketId],
  );
  if (!r.rows.length) return [];
  const row = r.rows[0];
  return [row.submitted_by_user_id, row.assigned_to_user_id, row.developer_user_id, row.product_owner_user_id].filter(Boolean) as string[];
}

export const AMR_CREATED: NotificationEventDef = {
  event: "AMR_CREATED",
  module: "tickets",
  category: "status_changes",
  description: "Sends the submitter a confirmation that their AMR is in the queue.",
  recipients: [byOwner((ctx) => ctx.payload.submittedByUserId)],
  excludeActor: false,
  template: (ctx) => ({
    type: "amr_created",
    title: `AMR Submitted — ${ctx.payload.ticketNumber || ""}`,
    message: `Your request "${ctx.payload.title}" has been submitted.${ctx.payload.priority ? ` Priority: ${ctx.payload.priority}.` : ""}`,
  }),
  entity: (ctx) => ({ type: "ticket", id: ctx.payload.ticketId, url: `${APP_URL}/amr?ticket=${ctx.payload.ticketId}` }),
};

export const AMR_ASSIGNED: NotificationEventDef = {
  event: "AMR_ASSIGNED",
  module: "tickets",
  category: "assigned_to_me",
  mandatory: true,
  description: "Notifies the assigned developer and submitter when an AMR is assigned for development.",
  recipients: [
    byDeveloper((ctx) => ctx.payload.developerUserId),
    byOwner((ctx) => ctx.payload.submittedByUserId),
  ],
  excludeActor: true,
  template: (ctx) => ({
    type: "amr_assigned",
    title: `AMR Assigned — ${ctx.payload.ticketNumber || ""}`,
    message: `"${ctx.payload.title}" has been assigned for development.`,
  }),
  entity: (ctx) => ({ type: "ticket", id: ctx.payload.ticketId, url: `${APP_URL}/amr?ticket=${ctx.payload.ticketId}` }),
};

export const AMR_STATUS_CHANGED: NotificationEventDef = {
  event: "AMR_STATUS_CHANGED",
  module: "tickets",
  category: "status_changes",
  description: "Notifies every user directly involved with the AMR when its status changes.",
  recipients: [
    byOwner((ctx) => ctx.payload.submittedByUserId),
    byDeveloper((ctx) => ctx.payload.developerUserId),
    byReviewer((ctx) => ctx.payload.productOwnerUserId),
    byCcList((ctx) => queryTicketCcUserIds(ctx.payload.ticketId)),
  ],
  excludeActor: true,
  template: (ctx) => ({
    type: "amr_status_changed",
    title: `AMR Status Updated — ${ctx.payload.ticketNumber || ""}`,
    message: `"${ctx.payload.title}" moved from ${ctx.payload.oldStatus} to ${ctx.payload.newStatus}.`,
  }),
  entity: (ctx) => ({ type: "ticket", id: ctx.payload.ticketId, url: `${APP_URL}/amr?ticket=${ctx.payload.ticketId}` }),
};

export const AMR_TESTING_REQUESTED: NotificationEventDef = {
  event: "AMR_TESTING_REQUESTED",
  module: "tickets",
  category: "assigned_to_me",
  mandatory: true,
  description: "Notifies assigned testers when an AMR is ready for testing.",
  recipients: [
    byCcList((ctx) => queryTicketTesterUserIds(ctx.payload.ticketId)),
    byOwner((ctx) => ctx.payload.submittedByUserId),
  ],
  excludeActor: true,
  template: (ctx) => ({
    type: "amr_testing_requested",
    title: `Testing Requested — ${ctx.payload.ticketNumber || ""}`,
    message: `"${ctx.payload.title}" is ready for testing.`,
  }),
  entity: (ctx) => ({ type: "ticket", id: ctx.payload.ticketId, url: `${APP_URL}/amr?ticket=${ctx.payload.ticketId}` }),
};

export const AMR_COMMENTED: NotificationEventDef = {
  event: "AMR_COMMENTED",
  module: "tickets",
  category: "comments",
  description: "Notifies all involved users and @mentioned users when a comment is added.",
  recipients: [
    byContextField("participant", (ctx) => queryTicketParticipants(ctx.payload.ticketId)),
    byCcList((ctx) => queryTicketCcUserIds(ctx.payload.ticketId)),
    byMentions((ctx) => ctx.payload.mentionedUserIds || []),
  ],
  excludeActor: true,
  template: (ctx) => ({
    type: "amr_commented",
    title: `New Comment — ${ctx.payload.ticketNumber || ""}`,
    message: `${ctx.payload.commentBy} commented on "${ctx.payload.title}".`,
  }),
  entity: (ctx) => ({ type: "ticket", id: ctx.payload.ticketId, url: `${APP_URL}/amr?ticket=${ctx.payload.ticketId}` }),
};

export const AMR_CC_UPDATE: NotificationEventDef = {
  event: "AMR_CC_UPDATE",
  module: "tickets",
  category: "cc_updates",
  description: "Notifies users when they are added to the CC list of an AMR.",
  recipients: [byContextField("cc-added", (ctx) => ctx.payload.newCcUserIds || [])],
  excludeActor: false,
  template: (ctx) => ({
    type: "amr_cc_update",
    title: `You've been CC'd — ${ctx.payload.ticketNumber || ""}`,
    message: `You have been added to the CC list on "${ctx.payload.title}".`,
  }),
  entity: (ctx) => ({ type: "ticket", id: ctx.payload.ticketId, url: `${APP_URL}/amr?ticket=${ctx.payload.ticketId}` }),
};

export const AMR_AGING: NotificationEventDef = {
  event: "AMR_AGING",
  module: "tickets",
  category: "status_changes",
  description: "Notifies the submitter when their AMR has been open too long without resolution.",
  recipients: [byOwner((ctx) => ctx.payload.submittedByUserId)],
  template: (ctx) => ({
    type: "ticket_aging",
    title: `AMR Needs Attention — ${ctx.payload.ticketNumber || ""}`,
    message: `Your request "${ctx.payload.title}" has been open for ${ctx.payload.daysOpen} day(s) without resolution.`,
  }),
  entity: (ctx) => ({ type: "ticket", id: ctx.payload.ticketId, url: `${APP_URL}/amr?ticket=${ctx.payload.ticketId}` }),
};

export const AMR_AGING_ESCALATION: NotificationEventDef = {
  event: "AMR_AGING_ESCALATION",
  module: "tickets",
  category: "approval_requests",
  mandatory: true,
  description: "Escalates critically overdue AMRs to administrators. Cannot be opted out — admins must know about overdue triage.",
  recipients: [
    bySystemRole(["admin", "super_user", "super_admin"], "escalation-target"),
    byOwner((ctx) => ctx.payload.submittedByUserId),
  ],
  template: (ctx) => ({
    type: "ticket_aging_escalation",
    title: `ESCALATION: AMR Overdue — ${ctx.payload.ticketNumber || ""}`,
    message: `"${ctx.payload.title}" has been open for ${ctx.payload.daysOpen} days and requires immediate attention.`,
  }),
  entity: (ctx) => ({ type: "ticket", id: ctx.payload.ticketId, url: `${APP_URL}/amr?ticket=${ctx.payload.ticketId}` }),
};

export const TICKET_EVENT_DEFS: NotificationEventDef[] = [
  AMR_CREATED, AMR_ASSIGNED, AMR_STATUS_CHANGED, AMR_TESTING_REQUESTED,
  AMR_COMMENTED, AMR_CC_UPDATE, AMR_AGING, AMR_AGING_ESCALATION,
];
