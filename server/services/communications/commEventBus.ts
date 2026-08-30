/**
 * Communication Event Bus
 *
 * Modules emit typed events instead of calling email/notification services directly.
 * Handlers registered here perform the actual send + notification steps.
 *
 * Usage:
 *   commEventBus.emit("CLAIM_CREATED", { claimId, driverName, ... });
 *
 * Design: Node.js EventEmitter with typed payloads. All handlers are
 * async fire-and-forget — errors are caught internally and never crash the caller.
 */

import { EventEmitter } from "events";

// ── Event payload types ───────────────────────────────────────────────────────

export interface ClaimCreatedPayload {
  claimId:         string;
  claimNumber:     string;
  driverName:      string;
  claimType:       string;
  incidentType?:   string | null;
  incidentDate:    string;
  location:        string | null;
  severity:        string;
  status:          string;
  customerName:    string | null;
  market:          string | null;
  description:     string | null;
  createdBy:       string;
  createdByUserId: string;
}

export interface ClaimUpdatedPayload {
  claimId:         string;
  driverName:      string;
  claimType:       string;
  oldStatus:       string;
  newStatus:       string;
  updatedBy:       string;
  updatedByUserId: string;
  notes?:          string | null;
}

export interface ClaimAmountUpdatedPayload {
  claimId:            string;
  claimNumber:        string;
  driverName:         string;
  claimType:          string;
  updatedBy:          string;
  updatedByUserId:    string;
  changedFields:      string[];   // e.g. ["estimatedCost", "reserveAmount"]
  previousValues:     Record<string, number | null>;
  newValues:          Record<string, number | null>;
}

export interface ClaimClosedPayload {
  claimId:         string;
  claimNumber:     string;
  driverName:      string;
  claimType:       string;
  closedBy:        string;
  closedByUserId:  string;
  finalStatus:     string;
  notes?:          string | null;
}

export interface CommEventMap {
  CLAIM_CREATED:        ClaimCreatedPayload;
  CLAIM_UPDATED:        ClaimUpdatedPayload;
  CLAIM_AMOUNT_UPDATED: ClaimAmountUpdatedPayload;
  CLAIM_CLOSED:         ClaimClosedPayload;
}

// ── Event Bus ─────────────────────────────────────────────────────────────────

class CommEventBus extends EventEmitter {
  emit<K extends keyof CommEventMap>(event: K, payload: CommEventMap[K]): boolean {
    return super.emit(event, payload);
  }

  on<K extends keyof CommEventMap>(event: K, listener: (payload: CommEventMap[K]) => void): this {
    return super.on(event, listener);
  }

  /** Fire-and-forget async handler registration. Errors are logged but not re-thrown. */
  onAsync<K extends keyof CommEventMap>(
    event: K,
    handler: (payload: CommEventMap[K]) => Promise<void>
  ): this {
    return super.on(event, (payload: CommEventMap[K]) => {
      handler(payload).catch(err =>
        console.error(`[CommEventBus] Unhandled error in handler for "${event}":`, err)
      );
    });
  }
}

export const commEventBus = new CommEventBus();
commEventBus.setMaxListeners(20);
