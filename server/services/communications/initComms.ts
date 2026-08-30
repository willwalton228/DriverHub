/**
 * Communication Framework Initializer
 * Call once at server startup (server/index.ts) to register all event handlers.
 */

import { registerClaimEventHandlers } from "./events/claimEvents";

export function initCommunicationFramework(): void {
  registerClaimEventHandlers();
  console.log("[CommFramework] Communication framework initialized");
}
