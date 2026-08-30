/**
 * Notification Rules Engine – Public API
 *
 * This is the single entry point every module should use to fire notifications.
 *
 *   import { notify } from "@/services/notificationEngine";
 *   await notify("CLAIM_CREATED", { actorUserId, payload: { claimId, ... } });
 *
 * The engine will:
 *   1. Look up the registered event definition
 *   2. Run all recipient resolvers concurrently
 *   3. Merge and deduplicate results
 *   4. Remove the actorUserId (default behaviour)
 *   5. Filter by eligible roles / active status (module guard)
 *   6. Insert one notification + DWP Work Plan Item per eligible user
 *   7. Log the recipient list with reasons for auditing
 *
 * Registration (called once at startup via bootstrapEngine.ts):
 *   import { registerEvent } from "@/services/notificationEngine";
 *   registerEvent(def);
 *
 * Admin / audit:
 *   import { getAllEvents, dryRunNotify } from "@/services/notificationEngine";
 */

import { getEventDef, getAllEvents, getEventCount, registerEvent } from "./registry";
import { filterByEligibleRoles } from "./moduleGuard";
import { filterByPreferences } from "../notificationPreferencesService";
import { insertNotificationWithWPI } from "../notificationService";
import type { NotificationContext, ResolvedRecipient, NotificationEventDef } from "./types";

// Re-export everything consumers need
export { registerEvent, getAllEvents, getEventCount };
export type { NotificationEventDef, NotificationContext, ResolvedRecipient };
export * from "./resolvers";

// ── notify() ──────────────────────────────────────────────────────────────────

/**
 * Fire a notification event through the centralized rules engine.
 *
 * Non-throwing: all errors are caught and logged so a notification failure
 * never propagates into the calling module's request flow.
 */
export async function notify(
  eventName: string,
  ctx: NotificationContext,
): Promise<void> {
  const def = getEventDef(eventName);
  if (!def) {
    console.warn(`[NotifEngine] No event definition registered for: ${eventName}`);
    return;
  }

  try {
    // ── Step 1: Run all resolvers concurrently ─────────────────────────────
    const settled = await Promise.allSettled(
      def.recipients.map(async (resolver) => {
        const ids = await resolver.resolve(ctx);
        return { reason: resolver.reason, ids: ids.filter(Boolean) };
      }),
    );

    // ── Step 2: Merge into userId → reason map (first-wins for reason label)
    const recipientMap = new Map<string, string>(); // userId → reason
    for (const result of settled) {
      if (result.status === "fulfilled") {
        for (const id of result.value.ids) {
          if (!recipientMap.has(id)) {
            recipientMap.set(id, result.value.reason);
          }
        }
      } else {
        console.error(
          `[NotifEngine] Resolver error on ${eventName}:`,
          result.reason,
        );
      }
    }

    // ── Step 3: Exclude the actor (default: true) ──────────────────────────
    const excludeActor = def.excludeActor !== false;
    if (excludeActor && ctx.actorUserId) {
      recipientMap.delete(ctx.actorUserId);
    }

    if (recipientMap.size === 0) {
      console.log(`[NotifEngine] ${eventName} — no candidates after resolver pass`);
      return;
    }

    // ── Step 4: Module guard — filter by eligible roles + active status ────
    const afterGuard = await filterByEligibleRoles(
      Array.from(recipientMap.keys()),
      def.eligibleRoles,
    );

    if (afterGuard.length === 0) {
      console.log(`[NotifEngine] ${eventName} — all candidates filtered by module guard`);
      return;
    }

    // ── Step 4.5: Preference filter — honour user opt-outs ────────────────
    // Mandatory events (escalations, approver responsibilities, system alerts)
    // skip this step and are always delivered.
    let eligibleIds: string[];
    if (def.mandatory) {
      eligibleIds = afterGuard;
    } else {
      eligibleIds = await filterByPreferences(
        afterGuard,
        def.module,
        def.category,
        "in_app",
      );
      const muted = afterGuard.length - eligibleIds.length;
      if (muted > 0) {
        console.log(`[NotifEngine] ${eventName} — ${muted} recipient(s) opted out via preferences`);
      }
    }

    if (eligibleIds.length === 0) {
      console.log(`[NotifEngine] ${eventName} — all recipients opted out of this notification`);
      return;
    }

    // ── Step 5: Build notification content ────────────────────────────────
    const tmpl = def.template(ctx);
    const entityRef = def.entity ? def.entity(ctx) : null;

    // ── Step 6: Insert one notification + WPI per eligible user ───────────
    await Promise.allSettled(
      eligibleIds.map((userId) =>
        insertNotificationWithWPI({
          userId,
          type: tmpl.type,
          title: tmpl.title,
          message: tmpl.message,
          relatedEntityType: entityRef?.type ?? null,
          relatedEntityId: entityRef?.id ?? null,
          actionUrl: entityRef?.url ?? null,
          sourceModule: def.module,
        }).catch((err: Error) => {
          console.error(
            `[NotifEngine] Insert failed for user ${userId} on ${eventName}:`,
            err.message,
          );
        }),
      ),
    );

    // ── Step 7: Audit log ─────────────────────────────────────────────────
    const summary = eligibleIds
      .map((id) => `${id.slice(0, 8)}…(${recipientMap.get(id)})`)
      .join(", ");
    console.log(`[NotifEngine] ${eventName} → ${eligibleIds.length} recipient(s): ${summary}`);
  } catch (err: any) {
    console.error(`[NotifEngine] Unhandled error processing ${eventName}:`, err.message);
  }
}

// ── dryRunNotify() ────────────────────────────────────────────────────────────

/**
 * Preview who would receive a notification without actually sending anything.
 * Returns the resolved recipient list with reasons for each user.
 * Used by the admin audit endpoint.
 */
export async function dryRunNotify(
  eventName: string,
  ctx: NotificationContext,
): Promise<{ recipients: ResolvedRecipient[]; filtered: number; event: string }> {
  const def = getEventDef(eventName);
  if (!def) {
    return { recipients: [], filtered: 0, event: eventName };
  }

  const settled = await Promise.allSettled(
    def.recipients.map(async (resolver) => {
      const ids = await resolver.resolve(ctx);
      return { reason: resolver.reason, ids: ids.filter(Boolean) };
    }),
  );

  const recipientMap = new Map<string, string>();
  for (const result of settled) {
    if (result.status === "fulfilled") {
      for (const id of result.value.ids) {
        if (!recipientMap.has(id)) recipientMap.set(id, result.value.reason);
      }
    }
  }

  const excludeActor = def.excludeActor !== false;
  if (excludeActor && ctx.actorUserId) recipientMap.delete(ctx.actorUserId);

  const beforeGuard = recipientMap.size;
  const eligibleIds = await filterByEligibleRoles(
    Array.from(recipientMap.keys()),
    def.eligibleRoles,
  );

  return {
    event: eventName,
    filtered: beforeGuard - eligibleIds.length,
    recipients: eligibleIds.map((id) => ({ userId: id, reason: recipientMap.get(id)! })),
  };
}
