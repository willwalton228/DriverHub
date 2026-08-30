/**
 * Core Communications Framework — Microsoft 365 Email Provider
 * Wired to microsoftGraphService for live sending via Microsoft Graph API.
 */

import type { ICommProvider } from "./base";
import type { CommChannel, CommRequest, ProviderDispatchResult } from "../types";
import { sendEmail } from "../../microsoftGraphService";

export class Microsoft365Provider implements ICommProvider {
  readonly providerId = "microsoft_365" as const;
  readonly supportedChannels: CommChannel[] = ["email"];

  async isConfigured(): Promise<boolean> {
    return (
      !!process.env.MICROSOFT_CLIENT_ID &&
      !!process.env.MICROSOFT_CLIENT_SECRET &&
      !!process.env.MICROSOFT_TENANT_ID &&
      !!process.env.MICROSOFT_SENDER_EMAIL
    );
  }

  async validateRequest(request: CommRequest): Promise<void> {
    if (request.channel !== "email") {
      throw new Error("Microsoft365Provider only supports the 'email' channel.");
    }
    if (!request.subject) {
      throw new Error("Email communications require a subject.");
    }
    const missing = request.recipients.filter(r => !r.destinationNormalized && !r.destinationRaw);
    if (missing.length) {
      throw new Error(`${missing.length} recipient(s) have no email address.`);
    }
  }

  async dispatch(request: CommRequest): Promise<ProviderDispatchResult> {
    const toAddresses = request.recipients
      .map(r => r.destinationNormalized || r.destinationRaw || "")
      .filter(Boolean);

    if (!toAddresses.length) {
      throw new Error("No valid recipient email addresses to dispatch to.");
    }

    const result = await sendEmail({
      to:       toAddresses,
      subject:  request.subject ?? "(no subject)",
      bodyHtml: request.body,
    });

    if (result.skipped) {
      throw new Error("Microsoft 365 is not configured (missing credentials).");
    }

    if (!result.ok) {
      throw new Error(`Microsoft Graph send failed: ${result.error ?? "unknown error"}`);
    }

    return {
      recipientOutcomes: request.recipients.map((_, i) => ({
        recipientIndex: i,
        success: true,
      })),
    };
  }
}
