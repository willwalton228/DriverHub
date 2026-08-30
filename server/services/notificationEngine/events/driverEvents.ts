/**
 * Notification Rules Engine – Driver / Staffing Event Definitions
 */

import type { NotificationEventDef } from "../types";
import { byContextField, byOwner, bySystemRole } from "../resolvers";

const APP_URL = process.env.APP_BASE_URL || process.env.APP_URL || "";

export const DRIVER_STATUS_CHANGED: NotificationEventDef = {
  event: "DRIVER_STATUS_CHANGED",
  module: "staffing",
  category: "status_changes",
  description: "Notifies the driver's account manager when a driver's status changes.",
  recipients: [byContextField("account-manager", (ctx) => ctx.payload.accountManagerUserId)],
  excludeActor: true,
  template: (ctx) => ({
    type: "driver_status_changed",
    title: `Driver Status Changed — ${ctx.payload.driverName}`,
    message: `${ctx.payload.driverName}'s status changed from ${ctx.payload.oldStatus} to ${ctx.payload.newStatus}.${ctx.payload.changedBy ? ` Updated by ${ctx.payload.changedBy}.` : ""}`,
  }),
  entity: (ctx) => ({ type: "driver", id: ctx.payload.driverId, url: `${APP_URL}/drivers/${ctx.payload.driverId}` }),
};

export const DRIVER_SHORTAGE_ALERT: NotificationEventDef = {
  event: "DRIVER_SHORTAGE_ALERT",
  module: "staffing",
  category: "assigned_to_me",
  description: "Notifies operations leadership when driver counts fall below thresholds. Admins own staffing gaps by platform design.",
  recipients: [
    byContextField("account-manager", (ctx) => ctx.payload.accountManagerUserId),
    bySystemRole(["admin", "super_user", "corporate_admin"], "staffing-operations-lead"),
  ],
  template: (ctx) => ({
    type: "driver_shortage",
    title: `Driver Shortage — ${ctx.payload.accountName || "Account"}`,
    message: `${ctx.payload.accountName || "An account"} has ${ctx.payload.availableCount ?? "insufficient"} available driver(s). Minimum required: ${ctx.payload.minimumCount ?? "—"}.`,
  }),
  entity: (ctx) => ({ type: "driver_shortage", id: ctx.payload.accountId || "shortage", url: ctx.payload.accountId ? `${APP_URL}/accounts/${ctx.payload.accountId}` : null }),
};

export const PROJECTED_OT_ALERT: NotificationEventDef = {
  event: "PROJECTED_OT_ALERT",
  module: "staffing",
  category: "assigned_to_me",
  description: "Notifies the account manager when a driver they manage is projected to hit overtime.",
  recipients: [byContextField("account-manager", (ctx) => ctx.payload.accountManagerUserId)],
  template: (ctx) => ({
    type: "projected_ot_alert",
    title: `Projected OT — ${ctx.payload.driverName}`,
    message: `${ctx.payload.driverName} is projected to reach ${ctx.payload.projectedHours || "overtime"} hours this week (threshold: ${ctx.payload.thresholdHours || "40"} hrs).`,
  }),
  entity: (ctx) => ({ type: "driver", id: ctx.payload.driverId, url: `${APP_URL}/drivers/${ctx.payload.driverId}` }),
};

export const DRIVER_DOCUMENT_EXPIRING: NotificationEventDef = {
  event: "DRIVER_DOCUMENT_EXPIRING",
  module: "staffing",
  category: "assigned_to_me",
  description: "Notifies the account manager and assigned user when a required document is expiring.",
  recipients: [
    byContextField("account-manager", (ctx) => ctx.payload.accountManagerUserId),
    byOwner((ctx) => ctx.payload.assignedUserId),
  ],
  template: (ctx) => ({
    type: "driver_document_expiring",
    title: `Document Expiring — ${ctx.payload.driverName}`,
    message: `${ctx.payload.documentType || "A required document"} for ${ctx.payload.driverName} expires on ${ctx.payload.expiryDate || "soon"}.`,
  }),
  entity: (ctx) => ({ type: "driver", id: ctx.payload.driverId, url: `${APP_URL}/drivers/${ctx.payload.driverId}` }),
};

export const DRIVER_EVENT_DEFS: NotificationEventDef[] = [
  DRIVER_STATUS_CHANGED, DRIVER_SHORTAGE_ALERT, PROJECTED_OT_ALERT, DRIVER_DOCUMENT_EXPIRING,
];
