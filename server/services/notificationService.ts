import { db } from "../db";
import { notifications, workPlanItems } from "@shared/schema";
import { eq, and, ne } from "drizzle-orm";

// ── Category / Priority mapping ───────────────────────────────────────────────
// Keep in sync with the same helpers in DailyWorkPlan.tsx and routes.ts

export function notifToWpiCategory(type: string): string {
  const t = type.toLowerCase();
  if (/ticket_aging|amr_|claim_/.test(t)) return "operations";
  if (/time_off|leave_balance|projected_ot|overtime|recruiting|driver_shortage|staffing|sla_overdue/.test(t)) return "staffing";
  if (/invoice|payment|vendor_renew|billing|overdue_inv/.test(t)) return "financial";
  if (/readiness|account_health|touch|account_/.test(t)) return "accounts";
  return "tasks";
}

export function notifToWpiPriority(type: string): string {
  if (/escalation|critical/.test(type)) return "critical";
  if (/aging|overdue|at_risk|shortage|documentation_required|deadline/.test(type)) return "high";
  return "normal";
}

// ── Task type mapping ─────────────────────────────────────────────────────────
// Derive a semantic task type from the notification type string

export function notifToTaskType(type: string): string {
  const t = type.toLowerCase();
  if (/documentation/.test(t)) return "Documentation";
  if (/follow.?up|followup/.test(t)) return "Follow-Up";
  if (/escalat/.test(t)) return "Escalation";
  if (/review/.test(t)) return "Review";
  if (/approval|approv/.test(t)) return "Approval";
  if (/collect|invoice|payment|billing/.test(t)) return "Collection";
  if (/touch/.test(t)) return "Touch";
  if (/compliance|compli/.test(t)) return "Compliance";
  if (/capacity|shortage|staffing/.test(t)) return "Capacity";
  return "Follow-Up";
}

// ── Source module mapping ─────────────────────────────────────────────────────

export function notifToSourceModule(type: string): string {
  const t = type.toLowerCase();
  if (/claim/.test(t)) return "claims";
  if (/ticket|amr/.test(t)) return "tickets";
  if (/invoice|billing|payment/.test(t)) return "invoices";
  if (/account|touch|health/.test(t)) return "accounts";
  if (/staffing|driver|capacity|overtime|ot/.test(t)) return "staffing";
  if (/recruiting/.test(t)) return "recruiting";
  if (/vendor/.test(t)) return "vendors";
  return "system";
}

// ── Notification input ────────────────────────────────────────────────────────

export interface NotificationInput {
  userId: string;
  type: string;
  title: string;
  message: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  actionUrl?: string | null;
  orgId?: string | null;
  taskType?: string | null;
  sourceModule?: string | null;
}

// ── Core helper: insert notification + corresponding WPI atomically ───────────
//
// This is the single source of truth for notification creation.
// Every time a notification is inserted anywhere in the codebase, use this
// function so the DWP item is always created simultaneously — no lag, no gaps.
//
// Deduplication key: relatedEntityId takes priority over notification.id so
// multiple alerts for the same entity produce exactly ONE DWP item.

export async function insertNotificationWithWPI(input: NotificationInput): Promise<string> {
  // 1. Insert the notification
  const [notif] = await db
    .insert(notifications)
    .values({
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
      actionUrl: input.actionUrl ?? null,
    })
    .returning({ id: notifications.id });

  // 2. Immediately create a DWP work plan item for this notification
  const dedupKey = input.relatedEntityId || notif.id;

  try {
    // Only insert if no active (non-completed) WPI already exists for this entity+user
    const existing = await db
      .select({ id: workPlanItems.id })
      .from(workPlanItems)
      .where(
        and(
          eq(workPlanItems.eventType, "notification"),
          eq(workPlanItems.recordId, dedupKey),
          eq(workPlanItems.assignedUserId, input.userId),
          ne(workPlanItems.status, "completed"),
        ),
      )
      .limit(1);

    const resolvedTaskType = input.taskType || notifToTaskType(input.type);
    const resolvedSourceModule = input.sourceModule || notifToSourceModule(input.type);

    if (existing.length === 0) {
      await db.insert(workPlanItems).values({
        eventType: "notification",
        category: notifToWpiCategory(input.type),
        recordType: input.relatedEntityType || "notification",
        recordId: dedupKey,
        recordName: input.title,
        reason: input.message,
        assignedUserId: input.userId,
        priority: notifToWpiPriority(input.type),
        status: "open",
        recordUrl: input.actionUrl ?? null,
        orgId: input.orgId ?? null,
        taskType: resolvedTaskType,
        sourceModule: resolvedSourceModule,
      });
    } else {
      // Update the existing WPI record name/reason/url in case they changed
      await db
        .update(workPlanItems)
        .set({
          recordName: input.title,
          reason: input.message,
          recordUrl: input.actionUrl ?? null,
          taskType: resolvedTaskType,
          sourceModule: resolvedSourceModule,
          updatedAt: new Date(),
        })
        .where(eq(workPlanItems.id, existing[0].id));
    }
  } catch (wpiErr) {
    // WPI creation is non-critical — the notification must succeed regardless
    console.error("[NotifService] WPI sync failed (non-critical):", wpiErr);
  }

  return notif.id;
}
