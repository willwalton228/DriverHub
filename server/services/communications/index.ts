/**
 * Core Communications Framework — Public API
 * Ticket 1: Platform / Shared Infrastructure
 * Ticket 3: Communication Logging Hooks and Message Audit Layer
 *
 * Import from this file throughout the application.
 * Do NOT import directly from orchestrator.ts, commLogger.ts, or providers/*.ts.
 *
 * Caller contract for creating recipient rows:
 *   1. Call validateRecipients(channel, inputs) → ValidatedRecipient[]
 *   2. Call createCommunicationRecipients(msgId, validatedRecipients)
 * Never call createCommunicationRecipients() with raw CommRecipientInput[].
 */

export * from "./types";
export * from "./commLogger";
export { communicationOrchestrator } from "./orchestrator";
export type { ICommProvider } from "./providers/base";
