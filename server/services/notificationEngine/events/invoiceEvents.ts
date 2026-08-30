/**
 * Notification Rules Engine – Invoice / Finance Event Definitions
 *
 * Only users directly tied to the specific invoice record receive notifications.
 */

import type { NotificationEventDef } from "../types";
import { byContextField, byOwner, byCommRules } from "../resolvers";

const APP_URL = process.env.APP_BASE_URL || process.env.APP_URL || "";

export const INVOICE_APPROVED: NotificationEventDef = {
  event: "INVOICE_APPROVED",
  module: "invoices",
  category: "status_changes",
  description: "Notifies the invoice creator and collections owner when an invoice is approved.",
  recipients: [
    byOwner((ctx) => ctx.payload.createdByUserId),
    byContextField("collections-owner", (ctx) => ctx.payload.collectionsOwnerId),
    byCommRules("INVOICE_APPROVED"),
  ],
  excludeActor: true,
  template: (ctx) => ({
    type: "invoice_approved",
    title: `Invoice Approved — #${ctx.payload.invoiceNumber || ctx.payload.invoiceId}`,
    message: `Invoice for ${ctx.payload.accountName || "an account"} has been approved by ${ctx.payload.approvedBy || "an administrator"}.`,
  }),
  entity: (ctx) => ({ type: "invoice", id: ctx.payload.invoiceId, url: `${APP_URL}/invoices/${ctx.payload.invoiceId}` }),
};

export const INVOICE_OVERDUE: NotificationEventDef = {
  event: "INVOICE_OVERDUE",
  module: "invoices",
  category: "assigned_to_me",
  description: "Notifies the collections owner when an invoice becomes overdue.",
  recipients: [
    byContextField("collections-owner", (ctx) => ctx.payload.collectionsOwnerId),
    byCommRules("INVOICE_OVERDUE"),
  ],
  template: (ctx) => ({
    type: "overdue_invoice",
    title: `Overdue Invoice — #${ctx.payload.invoiceNumber || ctx.payload.invoiceId}`,
    message: `Invoice for ${ctx.payload.accountName || "an account"} is ${ctx.payload.daysOverdue ?? ""} day(s) overdue. Amount: ${ctx.payload.amountDue || "—"}.`,
  }),
  entity: (ctx) => ({ type: "invoice", id: ctx.payload.invoiceId, url: `${APP_URL}/invoices/${ctx.payload.invoiceId}` }),
};

export const PAYMENT_EXCEPTION: NotificationEventDef = {
  event: "PAYMENT_EXCEPTION",
  module: "invoices",
  category: "assigned_to_me",
  description: "Notifies the collections owner when a payment fails or encounters an exception.",
  recipients: [
    byContextField("collections-owner", (ctx) => ctx.payload.collectionsOwnerId),
    byCommRules("PAYMENT_EXCEPTION"),
  ],
  template: (ctx) => ({
    type: "payment_exception",
    title: `Payment Exception — ${ctx.payload.accountName || "Account"}`,
    message: `A payment exception occurred for ${ctx.payload.accountName || "an account"}: ${ctx.payload.exceptionReason || "payment failed"}. Amount: ${ctx.payload.amount || "—"}.`,
  }),
  entity: (ctx) => ({ type: "invoice", id: ctx.payload.invoiceId, url: ctx.payload.invoiceId ? `${APP_URL}/invoices/${ctx.payload.invoiceId}` : null }),
};

export const INVOICE_SUBMITTED_FOR_APPROVAL: NotificationEventDef = {
  event: "INVOICE_SUBMITTED_FOR_APPROVAL",
  module: "invoices",
  category: "approval_requests",
  description: "Notifies the designated finance approver and submitter when an invoice is submitted for approval.",
  recipients: [
    byOwner((ctx) => ctx.payload.submittedByUserId),
    byContextField("approver", (ctx) => ctx.payload.financeApproverUserId),
    byCommRules("INVOICE_SUBMITTED_FOR_APPROVAL"),
  ],
  excludeActor: true,
  template: (ctx) => ({
    type: "invoice_submitted_for_approval",
    title: `Invoice Awaiting Approval — #${ctx.payload.invoiceNumber || ctx.payload.invoiceId}`,
    message: `Invoice for ${ctx.payload.accountName || "an account"} has been submitted for approval by ${ctx.payload.submittedBy || "a user"}.`,
  }),
  entity: (ctx) => ({ type: "invoice", id: ctx.payload.invoiceId, url: `${APP_URL}/invoices/${ctx.payload.invoiceId}` }),
};

export const INVOICE_EVENT_DEFS: NotificationEventDef[] = [
  INVOICE_APPROVED, INVOICE_OVERDUE, PAYMENT_EXCEPTION, INVOICE_SUBMITTED_FOR_APPROVAL,
];
