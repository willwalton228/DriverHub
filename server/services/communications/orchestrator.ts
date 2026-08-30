/**
 * Core Communications Framework — Communication Orchestrator
 * Ticket 1: Platform / Shared Infrastructure
 * Ticket 3: Refactored to delegate all DB writes to commLogger;
 *           recipient validation now runs before createCommunicationRecipients()
 *
 * The orchestrator is the single entry-point for all outbound communications.
 * Any module (Assigned Drivers, Scheduling, Dispatch, Compliance, Claims, etc.)
 * calls `CommunicationOrchestrator.send()` and this class handles:
 *
 *   1. Resolve provider
 *   2. Log communication_messages record (status = queued)
 *   3. Validate all recipients via validateRecipients()
 *   4. Log communication_recipients rows with correct initial state
 *   5. Provider-level request validation (structural, not per-recipient)
 *   6. Check provider is configured
 *   7. Dispatch — only to valid recipients
 *   8. Update message + recipient records with outcomes
 *   9. Return CommResult to caller
 *
 * Recipients that fail step 3 are written to the DB as excluded immediately —
 * they are fully auditable but never reach the provider.
 */

import type { ICommProvider, ProviderNotReadyReason } from "./providers/base";
import { HeymarketProvider }    from "./providers/heymarket";
import { Microsoft365Provider } from "./providers/microsoft365";
import {
  validateRecipients,
  createCommunicationLog,
  createCommunicationRecipients,
  updateCommunicationMessageStatus,
  updateRecipientStatuses,
  markRecipientsExcluded,
} from "./commLogger";
import type {
  CommChannel,
  CommProvider,
  CommRequest,
  CommResult,
  CommStatus,
} from "./types";

// ── Provider Registry ─────────────────────────────────────────────────────────

const PROVIDER_REGISTRY: ICommProvider[] = [
  new HeymarketProvider(),
  new Microsoft365Provider(),
];

function getProvider(providerId: CommProvider): ICommProvider | undefined {
  return PROVIDER_REGISTRY.find(p => p.providerId === providerId);
}

function getProvidersForChannel(channel: CommChannel): ICommProvider[] {
  return PROVIDER_REGISTRY.filter(p => p.supportedChannels.includes(channel));
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export class CommunicationOrchestrator {
  /**
   * Resolve which provider to use for this request.
   */
  private async resolveProvider(request: CommRequest): Promise<ICommProvider> {
    if (request.provider) {
      const p = getProvider(request.provider);
      if (!p) throw new Error(`Unknown provider: ${request.provider}`);
      return p;
    }
    const candidates = getProvidersForChannel(request.channel);
    for (const p of candidates) {
      if (await p.isConfigured()) return p;
    }
    if (candidates.length) return candidates[0];
    throw new Error(`No provider registered for channel: ${request.channel}`);
  }

  /**
   * Main entry-point. Orchestrates the full outbound communication lifecycle.
   */
  async send(request: CommRequest): Promise<CommResult> {
    const errors: string[] = [];

    // ── Step 1: Resolve provider ─────────────────────────────────────────────
    let provider: ICommProvider;
    try {
      provider = await this.resolveProvider(request);
    } catch (err: any) {
      errors.push(err.message);
      return this.buildResult(null, "failed", request.recipients.length, 0, request.recipients.length, 0, errors);
    }

    // ── Step 2: Log message record (status = queued) ─────────────────────────
    const msgId = await createCommunicationLog({
      channel:           request.channel,
      provider:          provider.providerId,
      direction:         "outbound",
      status:            "queued",
      fromIdentity:      request.fromIdentity,
      subject:           request.subject,
      templateSlug:      request.templateSlug,
      body:              request.body,
      relatedModule:     request.relatedModule,
      relatedEntityType: request.relatedEntityType,
      relatedEntityId:   request.relatedEntityId,
      createdByUserId:   request.createdByUserId,
    });

    // ── Step 3: Validate all recipients ──────────────────────────────────────
    // Every recipient is evaluated before any row is written to the DB.
    // Invalid recipients get exclusionReason set; they will be persisted as
    // excluded rows in step 4 — fully auditable, never dispatched.
    const validatedRecipients = validateRecipients(request.channel, request.recipients);
    const preExcluded = validatedRecipients.filter(vr => !vr.valid).length;

    if (preExcluded > 0) {
      const reasons = validatedRecipients
        .filter(vr => !vr.valid)
        .map(vr => vr.exclusionReason ?? "unknown")
        .join(", ");
      errors.push(`${preExcluded} recipient(s) excluded at validation: ${reasons}`);
    }

    // ── Step 4: Log recipient rows with correct initial state ─────────────────
    const recipientRowIds = await createCommunicationRecipients(msgId, validatedRecipients);

    // Build the valid-entry map for dispatch and outcome mapping
    const validEntries = validatedRecipients
      .map((vr, i) => ({ vr, rowId: recipientRowIds[i] }))
      .filter(e => e.vr.valid);

    // If all recipients were excluded, fail immediately
    if (validEntries.length === 0) {
      const msg = "All recipients were excluded during validation — nothing dispatched.";
      errors.push(msg);
      await updateCommunicationMessageStatus(msgId, { status: "failed", errorMessage: errors.join("; ") });
      return this.buildResult(msgId, "failed", request.recipients.length, 0, 0, preExcluded, errors);
    }

    // ── Step 5: Provider-level structural validation ──────────────────────────
    // Build a request containing only the valid recipients for provider checks.
    const validRequest: CommRequest = {
      ...request,
      recipients: validEntries.map(e => e.vr.input),
    };

    try {
      await provider.validateRequest(validRequest);
    } catch (err: any) {
      errors.push(`Provider validation failed: ${err.message}`);
      await updateCommunicationMessageStatus(msgId, { status: "failed", errorMessage: err.message });
      await markRecipientsExcluded({
        messageId:      msgId,
        recipientRowIds: validEntries.map(e => e.rowId),
        reason:         "validation_failed",
      });
      return this.buildResult(msgId, "failed", request.recipients.length, 0, validEntries.length, preExcluded, errors);
    }

    // ── Step 6: Check provider is configured ─────────────────────────────────
    // Use getConfigurationStatus() if the provider implements it (gives a specific
    // reason); fall back to the boolean isConfigured() for providers that don't.
    let configReason: ProviderNotReadyReason = "provider_not_configured";
    let ready: boolean;

    if (provider.getConfigurationStatus) {
      const status = await provider.getConfigurationStatus();
      ready        = status.ready;
      if (!status.ready && status.reason !== "ready") {
        configReason = status.reason as ProviderNotReadyReason;
      }
    } else {
      ready = await provider.isConfigured();
    }

    if (!ready) {
      const msg = configReason === "sms_feature_flag_disabled"
        ? "SMS is disabled by feature flag (heymarket_texting_enabled is not enabled). No message was sent."
        : configReason === "missing_api_token"
          ? `Provider '${provider.providerId}' is missing its API token. Contact your platform administrator.`
          : configReason === "missing_inbox_id"
            ? `Provider '${provider.providerId}' inbox ID is not configured. Contact your platform administrator.`
            : `Provider '${provider.providerId}' is not configured. Message logged but not sent.`;

      errors.push(msg);
      await updateCommunicationMessageStatus(msgId, { status: "failed", errorMessage: msg });
      await markRecipientsExcluded({
        messageId:       msgId,
        recipientRowIds: validEntries.map(e => e.rowId),
        reason:          configReason,
      });
      return this.buildResult(msgId, "failed", request.recipients.length, 0, 0, preExcluded + validEntries.length, errors);
    }

    // ── Step 7: Dispatch (valid recipients only) ──────────────────────────────
    try {
      const dispatchResult = await provider.dispatch(validRequest);

      let sent = 0; let failed = 0;
      const recipientUpdates = [];

      for (const outcome of dispatchResult.recipientOutcomes) {
        // outcome.recipientIndex refers to position in validRequest.recipients,
        // which aligns with validEntries[].
        const rowId = validEntries[outcome.recipientIndex]?.rowId;
        if (!rowId) continue;

        if (outcome.success) {
          sent++;
          recipientUpdates.push({
            recipientRowId:    rowId,
            deliveryStatus:    "sent" as const,
            providerMessageId: outcome.providerMessageId,
          });
        } else {
          failed++;
          errors.push(outcome.errorMessage ?? "Unknown recipient error");
          recipientUpdates.push({
            recipientRowId: rowId,
            deliveryStatus: "failed" as const,
            errorMessage:   outcome.errorMessage,
          });
        }
      }

      await updateRecipientStatuses(recipientUpdates);

      const finalStatus: CommStatus =
        failed === 0 ? "sent" : sent === 0 ? "failed" : "partial";

      await updateCommunicationMessageStatus(msgId, {
        status:              finalStatus,
        providerMessageId:   dispatchResult.providerMessageId,
        providerRawResponse: dispatchResult.providerRawResponse,
      });

      return this.buildResult(
        msgId, finalStatus,
        request.recipients.length,
        sent, failed, preExcluded,
        errors,
      );
    } catch (err: any) {
      errors.push(err.message);
      await updateCommunicationMessageStatus(msgId, { status: "failed", errorMessage: err.message });
      return this.buildResult(
        msgId, "failed",
        request.recipients.length,
        0, validEntries.length, preExcluded,
        errors,
      );
    }
  }

  // ── Result builder ────────────────────────────────────────────────────────

  private buildResult(
    msgId:    string | null,
    status:   CommStatus,
    total:    number,
    sent:     number,
    failed:   number,
    excluded: number,
    errors:   string[],
  ): CommResult {
    return {
      communicationMessageId: msgId ?? "",
      status,
      totalRecipients: total,
      sent,
      failed,
      excluded,
      errors,
    };
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

export const communicationOrchestrator = new CommunicationOrchestrator();
