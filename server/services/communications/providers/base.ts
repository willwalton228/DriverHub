/**
 * Core Communications Framework — Provider Interface
 * Ticket 1: Platform / Shared Infrastructure
 *
 * Every provider implementation (Heymarket, Microsoft 365, Twilio, SendGrid, …)
 * must satisfy this interface. The orchestrator works exclusively through this
 * contract so new providers can be plugged in without touching orchestration logic.
 */

import type {
  CommChannel,
  CommProvider,
  CommRequest,
  ProviderDispatchResult,
} from "../types";

/**
 * Reason codes returned by getConfigurationStatus().
 * Values are stored verbatim in communication_recipients.excluded_reason
 * and in error messages visible to callers — keep them stable.
 */
export type ProviderNotReadyReason =
  | "sms_feature_flag_disabled"   // heymarket_texting_enabled absent or false
  | "missing_api_token"           // HEYMARKET_API_TOKEN env var not set
  | "missing_inbox_id"            // sms.heymarket.inbox_id not in platform_configs
  | "provider_not_configured";    // generic fallback for providers that don't implement getConfigurationStatus

export interface ConfigurationStatus {
  ready: boolean;
  reason: ProviderNotReadyReason | "ready";
}

export interface ICommProvider {
  /** Identifier that matches CommProvider enum values. */
  readonly providerId: CommProvider;

  /** Channels this provider is capable of handling. */
  readonly supportedChannels: CommChannel[];

  /**
   * Returns true when the provider is fully configured and able to send.
   * Implementations should check API tokens, inbox IDs, feature flags, etc.
   * without throwing — return false if not ready.
   */
  isConfigured(): Promise<boolean>;

  /**
   * Returns a richer configuration status that distinguishes *why* the provider
   * is not ready.  Optional — providers that don't implement this will fall back
   * to the generic "provider_not_configured" reason in the orchestrator.
   */
  getConfigurationStatus?(): Promise<ConfigurationStatus>;

  /**
   * Validate that `request` is structurally correct for this provider
   * (e.g. all recipients have normalised phone numbers for SMS).
   * Throw with a descriptive message if the request cannot be sent.
   */
  validateRequest(request: CommRequest): Promise<void>;

  /**
   * Dispatch the communication through the external provider.
   * The orchestrator calls this only after `isConfigured` and `validateRequest`
   * have both passed.
   *
   * Implementations must NOT throw for per-recipient failures — instead, return
   * them as failed outcomes in `recipientOutcomes`.  Only throw for fatal
   * provider-level errors (auth failure, network timeout after retries, etc.).
   */
  dispatch(request: CommRequest): Promise<ProviderDispatchResult>;
}
