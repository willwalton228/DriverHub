/**
 * Core Communications Framework — Shared Types & Interfaces
 * Ticket 1: Platform / Shared Infrastructure
 *
 * This file is the single source of truth for communication-domain types.
 * Import from here throughout the application; never redefine these inline.
 */

// ── Channel ──────────────────────────────────────────────────────────────────

export const COMM_CHANNELS = ["email", "sms"] as const;
export type CommChannel = typeof COMM_CHANNELS[number];

// ── Provider ─────────────────────────────────────────────────────────────────

export const COMM_PROVIDERS = ["microsoft_365", "heymarket", "twilio", "sendgrid"] as const;
export type CommProvider = typeof COMM_PROVIDERS[number];

/** Maps each channel to the providers that support it. */
export const CHANNEL_PROVIDER_MAP: Record<CommChannel, CommProvider[]> = {
  email: ["microsoft_365", "sendgrid"],
  sms:   ["heymarket", "twilio"],
};

// ── Direction ─────────────────────────────────────────────────────────────────

export const COMM_DIRECTIONS = ["outbound"] as const;
export type CommDirection = typeof COMM_DIRECTIONS[number];

// ── Status ────────────────────────────────────────────────────────────────────

export const COMM_STATUSES = ["draft", "queued", "sent", "failed", "partial"] as const;
export type CommStatus = typeof COMM_STATUSES[number];

// ── Recipient ─────────────────────────────────────────────────────────────────

export const COMM_RECIPIENT_TYPES = ["driver", "account_contact", "employee", "unknown"] as const;
export type CommRecipientType = typeof COMM_RECIPIENT_TYPES[number];

export const COMM_DELIVERY_STATUSES = ["pending", "sent", "failed", "excluded"] as const;
export type CommDeliveryStatus = typeof COMM_DELIVERY_STATUSES[number];

// ── Request / Response DTOs ───────────────────────────────────────────────────

/** A single recipient as passed into an orchestration request. */
export interface CommRecipientInput {
  recipientType:        CommRecipientType;
  recipientId?:         string;
  destinationRaw?:      string;   // raw phone or email as-supplied
  destinationNormalized?: string; // E.164 or canonical email
}

/**
 * The structured request that any module passes to the orchestrator.
 * Keep all fields optional beyond the required triplet so callers
 * only supply what is relevant to their context.
 */
export interface CommRequest {
  channel:            CommChannel;
  provider?:          CommProvider;  // if omitted, orchestrator resolves from config
  body:               string;
  subject?:           string;        // email only
  fromIdentity?:      string;        // inbox ID, email address, etc.
  templateSlug?:      string;        // source comm_template slug when template-rendered
  recipients:         CommRecipientInput[];

  // Context linkage — ties the send to a business record
  relatedModule?:     string;        // e.g. "assigned_drivers" | "scheduling" | "claims"
  relatedEntityType?: string;        // e.g. "driver" | "account" | "shift" | "move" | "claim"
  relatedEntityId?:   string;

  createdByUserId?:   string;
}

/** Summary returned to the caller after orchestration completes. */
export interface CommResult {
  communicationMessageId: string;
  status:                 CommStatus;
  totalRecipients:        number;
  sent:                   number;
  failed:                 number;
  excluded:               number;
  errors:                 string[];
}

/** Per-recipient outcome as returned from a provider dispatch. */
export interface ProviderRecipientOutcome {
  recipientIndex:     number;        // matches the index in CommRequest.recipients
  success:            boolean;
  providerMessageId?: string;
  errorMessage?:      string;
}

/** Full outcome from a provider dispatch call. */
export interface ProviderDispatchResult {
  providerMessageId?:  string;       // top-level message ID if provider returns one
  providerRawResponse?: unknown;
  recipientOutcomes:   ProviderRecipientOutcome[];
}
