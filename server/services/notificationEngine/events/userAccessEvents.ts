/**
 * Notification Rules Engine – User Access Event Definitions
 *
 * All user access events are mandatory — admins must receive them to perform
 * their access control responsibilities.
 */

import type { NotificationEventDef } from "../types";
import { byContextField, bySystemRole } from "../resolvers";

const APP_URL = process.env.APP_BASE_URL || process.env.APP_URL || "";

export const USER_ACCESS_REQUESTED: NotificationEventDef = {
  event: "USER_ACCESS_REQUESTED",
  module: "system",
  category: "approval_requests",
  mandatory: true,
  description: "Notifies access control administrators when elevated access requires approval. Mandatory — cannot be opted out.",
  recipients: [bySystemRole(["super_user", "super_admin", "admin"], "access-control-admin")],
  template: (ctx) => ({
    type: "user_access_requested",
    title: "User Access Request Requires Approval",
    message: `${ctx.payload.requestedByName || "A user"} has requested ${ctx.payload.requestedRole || "elevated access"} for ${ctx.payload.targetUserName || "a user"}. Justification: ${ctx.payload.justification || "—"}.`,
  }),
  entity: (ctx) => ({ type: "user", id: ctx.payload.targetUserId || ctx.payload.requestedByUserId, url: `${APP_URL}/users` }),
};

export const USER_DISABLED: NotificationEventDef = {
  event: "USER_DISABLED",
  module: "system",
  category: "system_announcements",
  mandatory: true,
  description: "Notifies administrators when a user account is automatically disabled. Mandatory.",
  recipients: [bySystemRole(["super_user", "super_admin", "admin"], "access-control-admin")],
  template: (ctx) => ({
    type: "user_disabled",
    title: `User Account Disabled — ${ctx.payload.userName || ctx.payload.userEmail}`,
    message: `${ctx.payload.userName || ctx.payload.userEmail}'s account was automatically disabled: ${ctx.payload.reason || "eligibility requirements no longer met"}.`,
  }),
  entity: (ctx) => ({ type: "user", id: ctx.payload.userId, url: `${APP_URL}/users` }),
};

export const USER_ACCESS_RESTORED: NotificationEventDef = {
  event: "USER_ACCESS_RESTORED",
  module: "system",
  category: "system_announcements",
  mandatory: true,
  description: "Notifies administrators and the affected user when account access is automatically restored. Mandatory.",
  recipients: [
    bySystemRole(["super_user", "super_admin", "admin"], "access-control-admin"),
    byContextField("restored-user", (ctx) => ctx.payload.userId),
  ],
  excludeActor: false,
  template: (ctx) => ({
    type: "user_access_restored",
    title: `Access Restored — ${ctx.payload.userName || ctx.payload.userEmail}`,
    message: `${ctx.payload.userName || ctx.payload.userEmail}'s account access has been automatically restored: ${ctx.payload.reason || "eligibility requirements are now met"}.`,
  }),
  entity: (ctx) => ({ type: "user", id: ctx.payload.userId, url: `${APP_URL}/users` }),
};

export const USER_ACCESS_EVENT_DEFS: NotificationEventDef[] = [
  USER_ACCESS_REQUESTED, USER_DISABLED, USER_ACCESS_RESTORED,
];
