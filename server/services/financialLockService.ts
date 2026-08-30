/**
 * Financial Record Locking Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Enforces immutability rules for paid invoices, locked deposits, and
 * reconciled deposit batches. Owner-only overrides are captured in an
 * immutable audit trail.
 *
 * Lock rules:
 *   • Invoice  → auto-locked when status transitions to 'paid'
 *   • Payment  → auto-locked when its deposit batch is locked or reconciled
 *   • Deposit  → locked/reconciled status already blocks edits; this service
 *                adds the override path and the audit trail.
 *
 * Override: Owner role only, requires a non-empty reason, logged to
 * `financial_record_locks` table.
 */

import { db } from "../db";
import { invoices, payments, depositBatches, financialRecordLocks } from "../../shared/schema";
import { eq } from "drizzle-orm";

// ─── Role helpers ──────────────────────────────────────────────────────────────

const OWNER_ROLES = new Set([
  "super_user", "super_admin", "root_super_admin", "admin", "owner",
]);

export function isOwnerRole(role: string | null | undefined): boolean {
  return !!role && OWNER_ROLES.has(role);
}

// ─── Error class ───────────────────────────────────────────────────────────────

export class RecordLockedError extends Error {
  readonly errorCode: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly lockedAt: Date | null;
  readonly lockSource: string | null;
  readonly overridable: boolean;

  constructor(opts: {
    entityType: string;
    entityId: string;
    entityRef?: string | null;
    lockedAt?: Date | null;
    lockSource?: string | null;
  }) {
    const source = opts.lockSource ?? "unknown";
    const label  = opts.entityRef ? `"${opts.entityRef}"` : opts.entityId;
    super(
      `This ${opts.entityType} (${label}) is locked${source !== "unknown" ? ` (${humanizeSource(source)})` : ""}. ` +
      `Edits are not permitted. Owner override is required.`
    );
    this.errorCode  = "RECORD_LOCKED";
    this.entityType = opts.entityType;
    this.entityId   = opts.entityId;
    this.lockedAt   = opts.lockedAt ?? null;
    this.lockSource = source;
    this.overridable = true;
  }
}

function humanizeSource(src: string) {
  const map: Record<string, string> = {
    auto_paid:            "auto-locked on payment",
    deposit_locked:       "deposit batch locked",
    deposit_reconciled:   "deposit batch reconciled",
    manual:               "manually locked",
  };
  return map[src] ?? src;
}

// ─── Audit log writer ──────────────────────────────────────────────────────────

async function writeLockEvent(opts: {
  entityType:       string;
  entityId:         string;
  entityRef?:       string | null;
  action:           string;
  lockSource?:      string | null;
  actorId:          string;
  actorRole?:       string | null;
  overrideReason?:  string | null;
  overrideExpiresAt?: Date | null;
  metadata?:        Record<string, unknown>;
}) {
  await db.insert(financialRecordLocks).values({
    entityType:       opts.entityType,
    entityId:         opts.entityId,
    entityRef:        opts.entityRef ?? null,
    action:           opts.action,
    lockSource:       opts.lockSource ?? null,
    actorId:          opts.actorId,
    actorRole:        opts.actorRole ?? null,
    overrideReason:   opts.overrideReason ?? null,
    overrideExpiresAt: opts.overrideExpiresAt ?? null,
    metadata:         opts.metadata ?? null,
  }).catch((err) => {
    console.error("[FinancialLock] Failed to write lock audit event:", err);
  });
}

// ─── Core lock check ──────────────────────────────────────────────────────────

/**
 * Throws RecordLockedError if the record is locked, unless:
 *   - `userRole` is an Owner role, AND
 *   - `overrideReason` is a non-empty string
 *
 * When an override is granted, the event is audited.
 */
export async function assertInvoiceNotLocked(opts: {
  invoiceId:       string;
  invoiceNumber?:  string | null;
  userRole?:       string | null;
  actorId?:        string | null;
  overrideReason?: string | null;
}): Promise<void> {
  const [inv] = await db
    .select({ isLocked: invoices.isLocked, lockedAt: invoices.lockedAt, lockSource: invoices.lockSource })
    .from(invoices)
    .where(eq(invoices.id, opts.invoiceId))
    .limit(1);

  if (!inv || !inv.isLocked) return;

  // Owner with a reason → grant override
  if (isOwnerRole(opts.userRole) && opts.overrideReason?.trim()) {
    await writeLockEvent({
      entityType:     "invoice",
      entityId:       opts.invoiceId,
      entityRef:      opts.invoiceNumber,
      action:         "edit_allowed_override",
      lockSource:     inv.lockSource,
      actorId:        opts.actorId!,
      actorRole:      opts.userRole,
      overrideReason: opts.overrideReason.trim(),
    });
    return;
  }

  // Block — and log the blocked attempt
  if (opts.actorId) {
    await writeLockEvent({
      entityType: "invoice",
      entityId:   opts.invoiceId,
      entityRef:  opts.invoiceNumber,
      action:     "edit_blocked",
      lockSource: inv.lockSource,
      actorId:    opts.actorId,
      actorRole:  opts.userRole,
    });
  }

  throw new RecordLockedError({
    entityType: "invoice",
    entityId:   opts.invoiceId,
    entityRef:  opts.invoiceNumber,
    lockedAt:   inv.lockedAt ? new Date(inv.lockedAt as any) : null,
    lockSource: inv.lockSource,
  });
}

export async function assertPaymentNotLocked(opts: {
  paymentId:       string;
  paymentNumber?:  string | null;
  userRole?:       string | null;
  actorId?:        string | null;
  overrideReason?: string | null;
}): Promise<void> {
  const [pay] = await db
    .select({ isLocked: payments.isLocked, lockedAt: payments.lockedAt, lockSource: payments.lockSource })
    .from(payments)
    .where(eq(payments.id, opts.paymentId))
    .limit(1);

  if (!pay || !pay.isLocked) return;

  if (isOwnerRole(opts.userRole) && opts.overrideReason?.trim()) {
    await writeLockEvent({
      entityType:     "payment",
      entityId:       opts.paymentId,
      entityRef:      opts.paymentNumber,
      action:         "edit_allowed_override",
      lockSource:     pay.lockSource,
      actorId:        opts.actorId!,
      actorRole:      opts.userRole,
      overrideReason: opts.overrideReason.trim(),
    });
    return;
  }

  if (opts.actorId) {
    await writeLockEvent({
      entityType: "payment",
      entityId:   opts.paymentId,
      entityRef:  opts.paymentNumber,
      action:     "edit_blocked",
      lockSource: pay.lockSource,
      actorId:    opts.actorId,
      actorRole:  opts.userRole,
    });
  }

  throw new RecordLockedError({
    entityType: "payment",
    entityId:   opts.paymentId,
    entityRef:  opts.paymentNumber,
    lockedAt:   pay.lockedAt ? new Date(pay.lockedAt as any) : null,
    lockSource: pay.lockSource,
  });
}

// ─── Auto-lock triggers ────────────────────────────────────────────────────────

/**
 * Called by the invoice status PATCH when transitioning to 'paid'.
 * Marks the invoice as locked and writes the audit event.
 */
export async function autoLockInvoiceOnPaid(opts: {
  invoiceId:     string;
  invoiceNumber: string | null;
  actorId:       string;
  actorRole?:    string | null;
}): Promise<void> {
  await db
    .update(invoices)
    .set({
      isLocked:   true,
      lockedAt:   new Date(),
      lockedBy:   opts.actorId,
      lockSource: "auto_paid",
    })
    .where(eq(invoices.id, opts.invoiceId));

  await writeLockEvent({
    entityType: "invoice",
    entityId:   opts.invoiceId,
    entityRef:  opts.invoiceNumber,
    action:     "locked",
    lockSource: "auto_paid",
    actorId:    opts.actorId,
    actorRole:  opts.actorRole,
  });
}

/**
 * Called by the deposit batch lock/reconcile transitions.
 * Locks all payments in the batch.
 */
export async function lockPaymentsInBatch(opts: {
  batchId:     string;
  batchNumber: string | null;
  lockSource:  "deposit_locked" | "deposit_reconciled";
  actorId:     string;
  actorRole?:  string | null;
}): Promise<number> {
  // Get affected payment IDs
  const affected = await db
    .select({ id: payments.id, paymentNumber: payments.paymentNumber })
    .from(payments)
    .where(eq(payments.depositBatchId, opts.batchId));

  if (affected.length === 0) return 0;

  // Bulk lock
  await db
    .update(payments)
    .set({ isLocked: true, lockedAt: new Date(), lockedBy: opts.actorId, lockSource: opts.lockSource })
    .where(eq(payments.depositBatchId, opts.batchId));

  // Audit events (batch insert)
  const events = affected.map((p) => ({
    entityType: "payment",
    entityId:   p.id,
    entityRef:  p.paymentNumber,
    action:     "locked",
    lockSource: opts.lockSource,
    actorId:    opts.actorId,
    actorRole:  opts.actorRole ?? null,
    metadata:   { batchId: opts.batchId, batchNumber: opts.batchNumber } as any,
  }));

  await db.insert(financialRecordLocks).values(events).catch((err) => {
    console.error("[FinancialLock] Failed to write batch lock events:", err);
  });

  return affected.length;
}

// ─── Override (Owner-only manual unlock) ─────────────────────────────────────

export async function overrideLock(opts: {
  entityType:     "invoice" | "payment" | "deposit_batch";
  entityId:       string;
  entityRef?:     string | null;
  actorId:        string;
  actorRole:      string;
  overrideReason: string;
}): Promise<void> {
  if (!isOwnerRole(opts.actorRole)) {
    throw new Error("Permission denied: Owner role required to override a financial record lock.");
  }
  if (!opts.overrideReason.trim() || opts.overrideReason.trim().length < 5) {
    throw new Error("Override reason must be at least 5 characters.");
  }

  const now = new Date();

  if (opts.entityType === "invoice") {
    await db
      .update(invoices)
      .set({ isLocked: false, lockOverriddenAt: now, lockOverriddenBy: opts.actorId, lockOverrideReason: opts.overrideReason.trim() })
      .where(eq(invoices.id, opts.entityId));
  } else if (opts.entityType === "payment") {
    await db
      .update(payments)
      .set({ isLocked: false, lockOverriddenAt: now, lockOverriddenBy: opts.actorId, lockOverrideReason: opts.overrideReason.trim() })
      .where(eq(payments.id, opts.entityId));
  }
  // deposit_batch overrides are handled by the batch state machine's own logic

  await writeLockEvent({
    entityType:     opts.entityType,
    entityId:       opts.entityId,
    entityRef:      opts.entityRef,
    action:         "unlocked_override",
    actorId:        opts.actorId,
    actorRole:      opts.actorRole,
    overrideReason: opts.overrideReason.trim(),
  });
}

// ─── Lock summary queries (for dashboard) ────────────────────────────────────

export interface LockSummary {
  lockedInvoiceCount:   number;
  lockedPaymentCount:   number;
  overrideEventCount:   number;
  recentEvents:         Array<{
    id:         string;
    entityType: string;
    entityId:   string;
    entityRef:  string | null;
    action:     string;
    lockSource: string | null;
    actorId:    string;
    actorRole:  string | null;
    overrideReason: string | null;
    createdAt:  Date;
  }>;
}

export async function getLockSummary(): Promise<LockSummary> {
  const { sql: sqlFn, count, eq: eqFn, desc } = await import("drizzle-orm");

  const [[invRow], [payRow], events] = await Promise.all([
    db.select({ n: count() }).from(invoices).where(eqFn(invoices.isLocked, true)),
    db.select({ n: count() }).from(payments).where(eqFn(payments.isLocked, true)),
    db
      .select()
      .from(financialRecordLocks)
      .orderBy(desc(financialRecordLocks.createdAt))
      .limit(50),
  ]);

  const overrideEventCount = events.filter((e) => e.action === "unlocked_override").length;

  return {
    lockedInvoiceCount: Number(invRow?.n ?? 0),
    lockedPaymentCount: Number(payRow?.n ?? 0),
    overrideEventCount,
    recentEvents: events.map((e) => ({
      id:             e.id,
      entityType:     e.entityType,
      entityId:       e.entityId,
      entityRef:      e.entityRef,
      action:         e.action,
      lockSource:     e.lockSource,
      actorId:        e.actorId,
      actorRole:      e.actorRole,
      overrideReason: e.overrideReason,
      createdAt:      e.createdAt!,
    })),
  };
}
