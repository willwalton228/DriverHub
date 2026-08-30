/**
 * Notification Rules Engine – Recruiting Event Definitions
 */

import type { NotificationEventDef } from "../types";
import { byOwner, byAssignee, byApprovalWorkflow, queryRecruitingApproverIds } from "../resolvers";

const APP_URL = process.env.APP_BASE_URL || process.env.APP_URL || "";
const RECRUITING_ELIGIBLE_ROLES = ["super_user", "super_admin", "admin", "corporate_admin", "recruiter"];

export const RECRUITING_REQUEST_SUBMITTED: NotificationEventDef = {
  event: "RECRUITING_REQUEST_SUBMITTED",
  module: "recruiting",
  category: "approval_requests",
  description: "Notifies the configured approver(s) and the submitter when a recruiting request is submitted.",
  eligibleRoles: RECRUITING_ELIGIBLE_ROLES,
  recipients: [
    byOwner((ctx) => ctx.payload.submittedByUserId),
    byAssignee((ctx) => ctx.payload.recruiterId),
    byApprovalWorkflow((ctx) => queryRecruitingApproverIds(ctx.orgId)),
  ],
  excludeActor: true,
  template: (ctx) => ({
    type: "recruiting_request_submitted",
    title: "New Recruiting Request Submitted",
    message: `A recruiting request for "${ctx.payload.positionTitle || "a position"}" was submitted by ${ctx.payload.submittedByName || "a hiring manager"}.`,
  }),
  entity: (ctx) => ({ type: "recruiting_request", id: ctx.payload.requestId, url: `${APP_URL}/recruiting` }),
};

export const RECRUITING_APPROVAL_REQUIRED: NotificationEventDef = {
  event: "RECRUITING_APPROVAL_REQUIRED",
  module: "recruiting",
  category: "approval_requests",
  mandatory: true,
  description: "Notifies the designated approver(s) when a recruiting request requires approval. Mandatory — cannot be opted out.",
  eligibleRoles: RECRUITING_ELIGIBLE_ROLES,
  recipients: [byApprovalWorkflow((ctx) => queryRecruitingApproverIds(ctx.orgId))],
  template: (ctx) => ({
    type: "recruiting_approval_required",
    title: "Recruiting Request Requires Approval",
    message: `A recruiting request for "${ctx.payload.positionTitle || "a position"}" by ${ctx.payload.submittedByName || "a hiring manager"} is awaiting your approval.`,
  }),
  entity: (ctx) => ({ type: "recruiting_request", id: ctx.payload.requestId, url: `${APP_URL}/recruiting` }),
};

export const RECRUITING_STATUS_CHANGED: NotificationEventDef = {
  event: "RECRUITING_STATUS_CHANGED",
  module: "recruiting",
  category: "status_changes",
  description: "Notifies the hiring manager and recruiter when a recruiting request status changes.",
  eligibleRoles: RECRUITING_ELIGIBLE_ROLES,
  recipients: [
    byOwner((ctx) => ctx.payload.submittedByUserId),
    byAssignee((ctx) => ctx.payload.recruiterId),
  ],
  excludeActor: true,
  template: (ctx) => ({
    type: "recruiting_status_changed",
    title: `Recruiting Request ${ctx.payload.newStatus}`,
    message: `Your recruiting request for "${ctx.payload.positionTitle || "a position"}" has been ${ctx.payload.newStatus?.toLowerCase() || "updated"}.${ctx.payload.approvalNotes ? ` Notes: ${ctx.payload.approvalNotes}` : ""}`,
  }),
  entity: (ctx) => ({ type: "recruiting_request", id: ctx.payload.requestId, url: `${APP_URL}/recruiting` }),
};

export const RECRUITING_REQUEST_ASSIGNED: NotificationEventDef = {
  event: "RECRUITING_REQUEST_ASSIGNED",
  module: "recruiting",
  category: "assigned_to_me",
  mandatory: true,
  description: "Notifies the recruiter when a request is assigned to them. Mandatory — they must know about their assignment.",
  eligibleRoles: RECRUITING_ELIGIBLE_ROLES,
  recipients: [byAssignee((ctx) => ctx.payload.recruiterId)],
  template: (ctx) => ({
    type: "recruiting_request_assigned",
    title: "Recruiting Request Assigned to You",
    message: `A recruiting request for "${ctx.payload.positionTitle || "a position"}" has been assigned to you by ${ctx.payload.assignedByName || "an administrator"}.`,
  }),
  entity: (ctx) => ({ type: "recruiting_request", id: ctx.payload.requestId, url: `${APP_URL}/recruiting` }),
};

export const RECRUITING_EVENT_DEFS: NotificationEventDef[] = [
  RECRUITING_REQUEST_SUBMITTED, RECRUITING_APPROVAL_REQUIRED,
  RECRUITING_STATUS_CHANGED, RECRUITING_REQUEST_ASSIGNED,
];
