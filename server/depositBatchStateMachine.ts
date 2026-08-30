/**
 * Deposit Batch State Machine
 * 
 * Lifecycle: draft → balanced → submitted → locked → reconciled
 * Role gates and validation rules for each transition.
 */

import { validateDepositBatchBalance } from "./services/financialIntegrityService";

export const BATCH_STATES = ["draft", "balanced", "submitted", "locked", "reconciled"] as const;
export type BatchState = typeof BATCH_STATES[number];

export interface BatchTransitionResult {
  ok: boolean;
  error?: string;
  code?: "INVALID_TRANSITION" | "PERMISSION_DENIED" | "BALANCE_MISMATCH" | "MISSING_FIELDS" | "TERMINAL_STATE";
  balanceDetails?: {
    batchTotal: number;
    paymentSum: number;
    variance: number;
    paymentCount: number;
  };
}

// Role tier mapping (mirrors invoiceStateMachine.ts)
const CONTROLLER_UP = ["owner", "controller", "admin", "super_admin", "super_user", "finance", "corporate_admin", "root_super_admin"];
const ADMIN_ROLES   = ["admin", "super_admin", "super_user", "corporate_admin", "root_super_admin"];

function meetsRole(userRole: string, required: "any" | "controller_up" | "admin"): boolean {
  if (required === "any") return true;
  if (required === "controller_up") return CONTROLLER_UP.includes(userRole);
  if (required === "admin") return ADMIN_ROLES.includes(userRole);
  return false;
}

interface BatchMeta {
  depositDate?: string | null;
  bankAccountName?: string | null;
  depositMethod?: string | null;
  totalAmount?: string | null;
  itemCount?: number | null;
  actualDepositAmount?: string | null;
  reconciliationReference?: string | null;
  discrepancyNotes?: string | null;
}

export interface BatchTransitionInput {
  batchId:      string;
  fromStatus:   string;
  action:       string;
  userRole:     string;
  batch:        BatchMeta;
  // For reconcile action
  actualAmount?:            string;
  reconciliationReference?: string;
  statementDate?:           string;
  notes?:                   string;
}

// Maps action name to the target state
const ACTION_MAP: Record<string, BatchState> = {
  mark_balanced: "balanced",
  unbalance:     "draft",
  submit:        "submitted",
  lock:          "locked",
  reconcile:     "reconciled",
};

// Role requirement per action
const ACTION_ROLE: Record<string, "any" | "controller_up" | "admin"> = {
  mark_balanced: "any",
  unbalance:     "any",
  submit:        "controller_up",
  lock:          "controller_up",
  reconcile:     "admin",
};

// Required source state for each action
const ACTION_FROM: Record<string, BatchState> = {
  mark_balanced: "draft",
  unbalance:     "balanced",
  submit:        "balanced",
  lock:          "submitted",
  reconcile:     "locked",
};

// Maximum discrepancy (cents) allowed without mandatory notes
const MAX_SILENT_DISCREPANCY_CENTS = 1;

export async function validateBatchTransition(input: BatchTransitionInput): Promise<BatchTransitionResult> {
  const { batchId, fromStatus, action, userRole, batch } = input;

  const targetStatus = ACTION_MAP[action];
  if (!targetStatus) {
    return {
      ok: false,
      error: `Unknown action '${action}'. Valid: ${Object.keys(ACTION_MAP).join(", ")}`,
      code: "INVALID_TRANSITION",
    };
  }

  // Source state check
  const requiredFrom = ACTION_FROM[action];
  if (fromStatus !== requiredFrom) {
    return {
      ok: false,
      error: `Cannot '${action}' from '${fromStatus}'. Batch must be in '${requiredFrom}' status.`,
      code: "INVALID_TRANSITION",
    };
  }

  // Role gate
  if (!meetsRole(userRole, ACTION_ROLE[action])) {
    return {
      ok: false,
      error: `Your role ('${userRole}') is not permitted to ${action}. Required: ${ACTION_ROLE[action]}.`,
      code: "PERMISSION_DENIED",
    };
  }

  // Action-specific validation
  switch (action) {
    case "mark_balanced": {
      const missingFields: string[] = [];
      if (!batch.depositDate)      missingFields.push("depositDate");
      if (!batch.bankAccountName)  missingFields.push("bankAccountName");
      if (!batch.depositMethod)    missingFields.push("depositMethod");
      if (missingFields.length > 0) {
        return {
          ok: false,
          error: `Missing required fields to balance: ${missingFields.join(", ")}`,
          code: "MISSING_FIELDS",
        };
      }

      // Validate payment sum matches batch total
      const balanceResult = await validateDepositBatchBalance(batchId);
      if (!balanceResult.valid) {
        return {
          ok: false,
          error: balanceResult.error || "Balance validation failed",
          code: "BALANCE_MISMATCH",
          balanceDetails: {
            batchTotal: balanceResult.batchTotal,
            paymentSum: balanceResult.paymentSum,
            variance: balanceResult.variance,
            paymentCount: balanceResult.paymentCount,
          },
        };
      }
      break;
    }

    case "reconcile": {
      const actualAmount = parseFloat(input.actualAmount || "0");
      if (!input.actualAmount || isNaN(actualAmount) || actualAmount < 0) {
        return {
          ok: false,
          error: "Actual deposit amount is required for reconciliation",
          code: "MISSING_FIELDS",
        };
      }

      const batchTotal = parseFloat(batch.totalAmount || "0");
      const discrepancyCents = Math.abs(actualAmount - batchTotal) * 100;

      if (discrepancyCents > MAX_SILENT_DISCREPANCY_CENTS && !input.notes?.trim()) {
        return {
          ok: false,
          error: `Discrepancy of $${(discrepancyCents / 100).toFixed(2)} requires a discrepancy explanation in notes.`,
          code: "MISSING_FIELDS",
        };
      }
      break;
    }
  }

  return { ok: true };
}

export function computeBatchTransitionData(input: BatchTransitionInput): Record<string, any> {
  const { action } = input;
  const now = new Date();
  const data: Record<string, any> = { status: ACTION_MAP[action], updatedAt: now };

  if (action === "submit") {
    data.submittedAt = now;
  } else if (action === "lock") {
    data.lockedAt = now;
  } else if (action === "reconcile") {
    const actual = parseFloat(input.actualAmount || "0");
    const batchTotal = parseFloat(input.batch.totalAmount || "0");
    data.reconciledAt = now;
    data.actualDepositAmount = input.actualAmount;
    data.discrepancyAmount = (actual - batchTotal).toFixed(2);
    data.discrepancyNotes = input.notes || null;
    data.reconciliationReference = input.reconciliationReference || null;
    data.statementDate = input.statementDate || null;
  }

  return data;
}
