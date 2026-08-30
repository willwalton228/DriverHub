/**
 * Notification Rules Engine – Event Registry
 *
 * In-memory store of all registered NotificationEventDefs.
 * Call registerEvent() at startup (via bootstrapEngine.ts) for each event type.
 */

import type { NotificationEventDef } from "./types";

const eventRegistry = new Map<string, NotificationEventDef>();

/** Register a notification event definition. Logs a warning on duplicates. */
export function registerEvent(def: NotificationEventDef): void {
  if (eventRegistry.has(def.event)) {
    console.warn(`[NotifEngine] Overwriting event definition: ${def.event}`);
  }
  eventRegistry.set(def.event, def);
}

/** Look up a single event definition by name. */
export function getEventDef(eventName: string): NotificationEventDef | undefined {
  return eventRegistry.get(eventName);
}

/** Return all registered event definitions (for admin audit). */
export function getAllEvents(): NotificationEventDef[] {
  return Array.from(eventRegistry.values()).sort((a, b) =>
    a.module.localeCompare(b.module) || a.event.localeCompare(b.event)
  );
}

/** Return the number of registered events. */
export function getEventCount(): number {
  return eventRegistry.size;
}
