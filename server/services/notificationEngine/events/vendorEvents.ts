/**
 * Notification Rules Engine – Vendor Event Definitions
 */

import type { NotificationEventDef } from "../types";
import { byContextField, byOwner, bySystemRole } from "../resolvers";

const APP_URL = process.env.APP_BASE_URL || process.env.APP_URL || "";

export const VENDOR_RENEWAL_ALERT: NotificationEventDef = {
  event: "VENDOR_RENEWAL_ALERT",
  module: "vendors",
  category: "assigned_to_me",
  description: "Notifies the vendor owner, secondary owner, and renewal owner when a contract approaches renewal.",
  recipients: [
    byOwner((ctx) => ctx.payload.vendorOwnerUserId),
    byContextField("secondary-owner", (ctx) => ctx.payload.secondaryOwnerId),
    byContextField("renewal-owner", (ctx) => ctx.payload.renewalOwnerId),
  ],
  template: (ctx) => ({
    type: "vendor_renewal_alert",
    title: `Vendor Contract Renewal — ${ctx.payload.vendorName}`,
    message: `${ctx.payload.vendorName}'s contract "${ctx.payload.contractName || "contract"}" is due for renewal on ${ctx.payload.renewalDate || "soon"}.`,
  }),
  entity: (ctx) => ({ type: "vendor", id: ctx.payload.vendorId, url: `${APP_URL}/vendors/${ctx.payload.vendorId}` }),
};

export const VENDOR_CONTRACT_EXPIRING: NotificationEventDef = {
  event: "VENDOR_CONTRACT_EXPIRING",
  module: "vendors",
  category: "assigned_to_me",
  description: "Notifies the vendor owner and renewal owner when a contract is expiring.",
  recipients: [
    byOwner((ctx) => ctx.payload.vendorOwnerUserId),
    byContextField("renewal-owner", (ctx) => ctx.payload.renewalOwnerId),
  ],
  template: (ctx) => ({
    type: "vendor_contract_expiring",
    title: `Contract Expiring — ${ctx.payload.vendorName}`,
    message: `${ctx.payload.vendorName}'s contract expires on ${ctx.payload.expiryDate || "soon"}. No renewal decision has been recorded.`,
  }),
  entity: (ctx) => ({ type: "vendor", id: ctx.payload.vendorId, url: `${APP_URL}/vendors/${ctx.payload.vendorId}` }),
};

export const VENDOR_CREATED: NotificationEventDef = {
  event: "VENDOR_CREATED",
  module: "vendors",
  category: "status_changes",
  description: "Notifies admins when a new vendor is added. Admins own vendor onboarding by platform design.",
  recipients: [bySystemRole(["admin", "super_user"], "vendor-onboarding-approver")],
  excludeActor: true,
  template: (ctx) => ({
    type: "vendor_created",
    title: `New Vendor Added — ${ctx.payload.vendorName}`,
    message: `${ctx.payload.vendorName} has been added as a vendor by ${ctx.payload.createdBy || "a user"}.`,
  }),
  entity: (ctx) => ({ type: "vendor", id: ctx.payload.vendorId, url: `${APP_URL}/vendors/${ctx.payload.vendorId}` }),
};

export const VENDOR_COMPLIANCE_EXPIRING: NotificationEventDef = {
  event: "VENDOR_COMPLIANCE_EXPIRING",
  module: "vendors",
  category: "assigned_to_me",
  description: "Notifies the vendor owner and secondary owner when a compliance document is expiring.",
  recipients: [
    byOwner((ctx) => ctx.payload.vendorOwnerUserId),
    byContextField("secondary-owner", (ctx) => ctx.payload.secondaryOwnerId),
  ],
  template: (ctx) => ({
    type: "vendor_compliance_expiring",
    title: `Compliance Expiring — ${ctx.payload.vendorName}`,
    message: `${ctx.payload.complianceType || "A compliance document"} for ${ctx.payload.vendorName} expires on ${ctx.payload.expiryDate || "soon"}.`,
  }),
  entity: (ctx) => ({ type: "vendor", id: ctx.payload.vendorId, url: `${APP_URL}/vendors/${ctx.payload.vendorId}` }),
};

export const VENDOR_EVENT_DEFS: NotificationEventDef[] = [
  VENDOR_RENEWAL_ALERT, VENDOR_CONTRACT_EXPIRING, VENDOR_CREATED, VENDOR_COMPLIANCE_EXPIRING,
];
