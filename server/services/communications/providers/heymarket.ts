/**
 * Core Communications Framework — Heymarket SMS Provider Stub
 * Ticket 1: Platform / Shared Infrastructure
 *
 * This stub satisfies the ICommProvider contract for Heymarket.
 * Live sending is NOT implemented here (Ticket 1 scope: infrastructure only).
 * When the Heymarket send ticket is implemented, replace the `dispatch`
 * body with real API calls while keeping this class signature unchanged.
 */

import type { ICommProvider, ConfigurationStatus } from "./base";
import type { CommChannel, CommRequest, ProviderDispatchResult } from "../types";

export class HeymarketProvider implements ICommProvider {
  readonly providerId = "heymarket" as const;
  readonly supportedChannels: CommChannel[] = ["sms"];

  async getConfigurationStatus(): Promise<ConfigurationStatus> {
    const { resolveConfig } = await import("../../platformConfigService");

    const flagConf   = await resolveConfig("heymarket_texting_enabled");
    const flagActive = flagConf?.configValue === true || flagConf?.configValue === "true";

    if (!flagActive) {
      return { ready: false, reason: "sms_feature_flag_disabled" };
    }

    const hasToken = !!process.env.HEYMARKET_API_TOKEN;
    if (!hasToken) {
      return { ready: false, reason: "missing_api_token" };
    }

    const inboxConf = await resolveConfig("sms.heymarket.inbox_id");
    const hasInbox  = !!inboxConf?.configValue;
    if (!hasInbox) {
      return { ready: false, reason: "missing_inbox_id" };
    }

    return { ready: true, reason: "ready" };
  }

  async isConfigured(): Promise<boolean> {
    const status = await this.getConfigurationStatus();
    return status.ready;
  }

  async validateRequest(request: CommRequest): Promise<void> {
    if (request.channel !== "sms") {
      throw new Error("HeymarketProvider only supports the 'sms' channel.");
    }
    const missing = request.recipients.filter(r => !r.destinationNormalized && !r.destinationRaw);
    if (missing.length) {
      throw new Error(`${missing.length} recipient(s) have no phone number.`);
    }
  }

  async dispatch(_request: CommRequest): Promise<ProviderDispatchResult> {
    // ── STUB ─────────────────────────────────────────────────────────────────
    // Live sending is implemented in server/services/communicationsService.ts
    // (legacy) and will be migrated to this class in a future ticket.
    // Return a not-implemented result so the orchestrator can log it correctly.
    throw new Error(
      "HeymarketProvider.dispatch() is not yet implemented in the core framework. " +
      "Use communicationsService.sendBulkSms() for live sends until this is migrated."
    );
  }
}
