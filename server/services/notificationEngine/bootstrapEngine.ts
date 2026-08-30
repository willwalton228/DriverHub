/**
 * Notification Rules Engine – Bootstrap
 *
 * Registers all known notification event definitions at server startup.
 * Call bootstrapNotificationEngine() once, before routes begin handling requests.
 *
 * To add a new module:
 *   1. Create server/services/notificationEngine/events/myModuleEvents.ts
 *   2. Export a MY_MODULE_EVENT_DEFS array from it
 *   3. Add one import + one spread below — nothing else needs to change
 */

import { registerEvent, getEventCount } from "./index";
import { CLAIM_EVENT_DEFS } from "./events/claimEvents";
import { TICKET_EVENT_DEFS } from "./events/ticketEvents";
import { RECRUITING_EVENT_DEFS } from "./events/recruitingEvents";
import { INVOICE_EVENT_DEFS } from "./events/invoiceEvents";
import { DRIVER_EVENT_DEFS } from "./events/driverEvents";
import { VENDOR_EVENT_DEFS } from "./events/vendorEvents";
import { USER_ACCESS_EVENT_DEFS } from "./events/userAccessEvents";

export function bootstrapNotificationEngine(): void {
  const allDefs = [
    ...CLAIM_EVENT_DEFS,
    ...TICKET_EVENT_DEFS,
    ...RECRUITING_EVENT_DEFS,
    ...INVOICE_EVENT_DEFS,
    ...DRIVER_EVENT_DEFS,
    ...VENDOR_EVENT_DEFS,
    ...USER_ACCESS_EVENT_DEFS,
  ];

  for (const def of allDefs) {
    registerEvent(def);
  }

  console.log(
    `[NotifEngine] Bootstrap complete — ${getEventCount()} event definition(s) registered across ` +
      `${new Set(allDefs.map((d) => d.module)).size} module(s).`,
  );
}
