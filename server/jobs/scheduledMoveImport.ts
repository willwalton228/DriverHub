/**
 * Scheduled Move Import Job (INCREMENT 25B)
 * 
 * STATUS: PLACEHOLDER - NOT ENABLED
 * 
 * This job will eventually:
 * 1. Connect to external systems (TMS, partner APIs, etc.)
 * 2. Fetch pending moves
 * 3. Call importMoves("SCHEDULED", ...) for ingestion
 * 
 * Controlled by env var: ENABLE_SCHEDULED_IMPORT
 * Default: false (never runs until explicitly enabled)
 * 
 * Constraints:
 * - No cron
 * - No external integrations
 * - Must not affect prod data
 */

export function scheduledMoveImportJob(): void {
  console.log("[scheduledMoveImportJob] placeholder executed");
}
