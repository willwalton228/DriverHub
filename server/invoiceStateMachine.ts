/**
 * Invoice State Machine — canonical spec enforcement
 * Single source of truth for invoice lifecycle transitions, edit rules, and role gates.
 *
 * Spec: TICKET — Invoice State Machine Enforcement
 */

// ── States ────────────────────────────────────────────────────────────────────

export const INVOICE_LIFECYCLE_STATES = [
  "draft",
  "approved",
  "sent",
  "partially_paid",
  "paid",
  "cancelled",
] as const;

export type InvoiceLifecycleState = typeof INVOICE_LIFECYCLE_STATES[number];

// Legacy DB values we map to canonical states
export const STATUS_ALIASES: Record<string, InvoiceLifecycleState> = {
  void:        "cancelled",
  voided:      "cancelled",
  viewed:      "sent",      // viewed is a sub-state of sent
  exported:    "approved",  // exported is a sub-state of approved
  overdue:     "sent",      // overdue is a payment-pressure sub-state of sent
  disputed:    "sent",      // disputed doesn't change the lifecycle state
  written_off: "cancelled",
};

export function canonicalize(status: string | null | undefined): InvoiceLifecycleState {
  if (!status) return "draft";
  const s = status.toLowerCase();
  return (STATUS_ALIASES[s] ?? s) as InvoiceLifecycleState;
}

// ── Role levels ───────────────────────────────────────────────────────────────

export type RoleLevel = "any" | "controller_up" | "owner";

const CONTROLLER_UP_ROLES = ["owner", "controller", "admin", "super_admin", "super_user", "finance"];
const OWNER_ROLES          = ["owner", "admin", "super_admin", "super_user"];

export function meetsRoleLevel(userRole: string, level: RoleLevel): boolean {
  if (level === "any")           return true;
  if (level === "controller_up") return CONTROLLER_UP_ROLES.includes(userRole);
  if (level === "owner")         return OWNER_ROLES.includes(userRole);
  return false;
}

// ── Transition rules ──────────────────────────────────────────────────────────

export interface TransitionRule {
  to:                 InvoiceLifecycleState;
  roleLevel:          RoleLevel;
  requireReason?:     boolean;
  requireNoPayments?: boolean;   // Block if paid_amount > 0 on the invoice
  description:        string;    // Human-readable label for UI
  action:             string;    // Machine-readable action name
}

export const STATE_TRANSITIONS: Record<InvoiceLifecycleState, TransitionRule[]> = {
  draft: [
    { to: "approved",  roleLevel: "any",           action: "approve",        description: "Approve" },
    { to: "cancelled", roleLevel: "any",            action: "cancel",         description: "Cancel",
      requireReason: true, requireNoPayments: true },
  ],
  approved: [
    { to: "sent",      roleLevel: "any",            action: "send",           description: "Send to Customer" },
    { to: "draft",     roleLevel: "controller_up",  action: "return_to_draft",description: "Return to Draft" },
    { to: "cancelled", roleLevel: "controller_up",  action: "cancel",         description: "Cancel",
      requireReason: true, requireNoPayments: true },
  ],
  sent: [
    { to: "partially_paid", roleLevel: "any",       action: "mark_partial",   description: "Mark Partially Paid" },
    { to: "paid",           roleLevel: "any",        action: "mark_paid",      description: "Mark Paid" },
    { to: "cancelled",      roleLevel: "controller_up", action: "cancel",      description: "Cancel",
      requireReason: true, requireNoPayments: true },
  ],
  partially_paid: [
    { to: "paid",      roleLevel: "any",             action: "mark_paid",      description: "Mark Paid" },
    { to: "cancelled", roleLevel: "owner",           action: "cancel",         description: "Cancel (Controlled Reversal)",
      requireReason: true },
  ],
  paid:      [],
  cancelled: [],
};

// ── Validation ────────────────────────────────────────────────────────────────

export type TransitionErrorCode =
  | "INVALID_TRANSITION"
  | "PERMISSION_DENIED"
  | "REQUIRES_REASON"
  | "HAS_PAYMENTS"
  | "TERMINAL_STATE";

export interface TransitionResult {
  ok:     boolean;
  error?: string;
  code?:  TransitionErrorCode;
}

export function validateTransition(
  fromStatusRaw: string | null | undefined,
  toStatusRaw:   string,
  userRole:      string,
  opts: { reason?: string; paidAmount?: number | string } = {},
): TransitionResult {
  const from = canonicalize(fromStatusRaw);
  const to   = canonicalize(toStatusRaw);

  if (from === to) return { ok: true };

  const rules = STATE_TRANSITIONS[from];
  if (!rules || rules.length === 0) {
    return {
      ok:    false,
      error: `Invoice status '${from}' is terminal — no further changes are allowed.`,
      code:  "TERMINAL_STATE",
    };
  }

  const rule = rules.find(r => r.to === to);
  if (!rule) {
    const allowed = rules.map(r => r.to).join(", ") || "none";
    return {
      ok:    false,
      error: `Cannot change invoice from '${from}' to '${to}'. Allowed transitions: ${allowed}.`,
      code:  "INVALID_TRANSITION",
    };
  }

  if (!meetsRoleLevel(userRole, rule.roleLevel)) {
    return {
      ok:    false,
      error: `Your role ('${userRole}') is not permitted to perform this action. Minimum required: ${rule.roleLevel}.`,
      code:  "PERMISSION_DENIED",
    };
  }

  if (rule.requireReason && !opts.reason?.trim()) {
    return {
      ok:    false,
      error: "A reason is required for this status change.",
      code:  "REQUIRES_REASON",
    };
  }

  if (rule.requireNoPayments) {
    const paid = parseFloat(String(opts.paidAmount ?? 0));
    if (paid > 0) {
      return {
        ok:    false,
        error: "Cannot cancel an invoice that has payments applied. Reverse the payments first.",
        code:  "HAS_PAYMENTS",
      };
    }
  }

  return { ok: true };
}

// ── Edit rules ────────────────────────────────────────────────────────────────

export type FieldGroup = "line_items" | "financial" | "customer" | "dates" | "terms" | "notes" | "delete";

export interface EditRules {
  allowed: FieldGroup[];
  locked:  boolean;
}

export const EDIT_RULES: Record<InvoiceLifecycleState, EditRules> = {
  draft:          { locked: false, allowed: ["line_items", "financial", "customer", "dates", "terms", "notes", "delete"] },
  approved:       { locked: false, allowed: ["notes"] },
  sent:           { locked: false, allowed: ["notes"] },
  partially_paid: { locked: false, allowed: ["notes"] },
  paid:           { locked: true,  allowed: [] },
  cancelled:      { locked: true,  allowed: [] },
};

export function canEdit(statusRaw: string | null | undefined, fieldGroup: FieldGroup): boolean {
  const state = canonicalize(statusRaw);
  return EDIT_RULES[state]?.allowed.includes(fieldGroup) ?? false;
}

export function isLocked(statusRaw: string | null | undefined): boolean {
  const state = canonicalize(statusRaw);
  return EDIT_RULES[state]?.locked ?? true;
}

// ── UI actions helper ─────────────────────────────────────────────────────────

export interface AllowedAction {
  action:        string;
  label:         string;
  to:            InvoiceLifecycleState;
  requireReason: boolean;
  roleLevel:     RoleLevel;
  destructive:   boolean;
}

export function getAllowedActions(
  fromStatusRaw: string | null | undefined,
  userRole:      string,
  paidAmount:    number | string = 0,
): AllowedAction[] {
  const from  = canonicalize(fromStatusRaw);
  const rules = STATE_TRANSITIONS[from] ?? [];
  const paid  = parseFloat(String(paidAmount));

  return rules
    .filter(rule => {
      if (!meetsRoleLevel(userRole, rule.roleLevel))          return false;
      if (rule.requireNoPayments && paid > 0)                 return false;
      return true;
    })
    .map(rule => ({
      action:        rule.action,
      label:         rule.description,
      to:            rule.to,
      requireReason: rule.requireReason ?? false,
      roleLevel:     rule.roleLevel,
      destructive:   rule.to === "cancelled",
    }));
}

// ── Validation helpers for edit endpoint ─────────────────────────────────────

export function validateEditRequest(
  statusRaw:  string | null | undefined,
  fieldGroup: FieldGroup,
): { ok: boolean; error?: string } {
  const state = canonicalize(statusRaw);
  const rules = EDIT_RULES[state];

  if (rules.locked) {
    return { ok: false, error: `Invoice is locked in '${state}' status and cannot be edited.` };
  }
  if (!rules.allowed.includes(fieldGroup)) {
    return {
      ok:    false,
      error: `Field group '${fieldGroup}' cannot be edited when invoice status is '${state}'. Only allowed: ${rules.allowed.join(", ") || "none"}.`,
    };
  }
  return { ok: true };
}
