/**
 * Backfill Delivery History
 *
 * Populates account_report_campaign_runs + account_report_run_deliveries
 * from the historical records in account_report_logs.
 *
 * Source: account_report_logs WHERE triggered_by = 'scheduler' AND email_status = 'success'
 * These are the canonical successful sends made by weeklyGenerationService.
 *
 * One campaign run is created per distinct report_week.
 * One delivery record is created per account per week.
 * Recipient detail is unavailable for historical records — marked accordingly.
 *
 * Idempotent: skips weeks that already have a backfill run record.
 * Safe to re-run.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";

const BACKFILL_CAMPAIGN_NAME = "Automated Weekly Schedule";

async function getOrCreateCampaign(): Promise<string> {
  const existing = await db.execute(sql`
    SELECT id FROM account_report_campaigns
    WHERE campaign_name = ${BACKFILL_CAMPAIGN_NAME}
    LIMIT 1
  `);
  const rows: any[] = (existing as any).rows ?? existing;
  if (rows.length > 0) {
    console.log(`[Backfill] Using existing campaign: ${rows[0].id}`);
    return rows[0].id;
  }

  const id = randomUUID();
  await db.execute(sql`
    INSERT INTO account_report_campaigns
      (id, campaign_name, report_type, sender_profile, status, schedule_type, created_at, updated_at)
    VALUES
      (${id}, ${BACKFILL_CAMPAIGN_NAME}, 'WEEKLY_ACCOUNT_SCHEDULE', 'Reports',
       'active', 'automated', NOW(), NOW())
  `);
  console.log(`[Backfill] Created campaign: ${id}`);
  return id;
}

async function backfill(): Promise<void> {
  console.log("[Backfill] Starting delivery history backfill…");

  const campaignId = await getOrCreateCampaign();

  // Get all distinct report_weeks that have scheduler successes
  const weeksRaw = await db.execute(sql`
    SELECT DISTINCT report_week::text AS week
    FROM account_report_logs
    WHERE triggered_by = 'scheduler'
      AND email_status = 'success'
    ORDER BY week
  `);
  const weeks: string[] = ((weeksRaw as any).rows ?? weeksRaw).map((r: any) => r.week.substring(0, 10));

  if (weeks.length === 0) {
    console.log("[Backfill] No scheduler success records found — nothing to backfill.");
    return;
  }

  console.log(`[Backfill] Found ${weeks.length} week(s) with successful deliveries: ${weeks.join(", ")}`);

  // Check which weeks are already backfilled (have a run under this campaign)
  const existingRaw = await db.execute(sql`
    SELECT schedule_week_start::text AS week
    FROM account_report_campaign_runs
    WHERE campaign_id = ${campaignId}
  `);
  const existingWeeks = new Set<string>(
    ((existingRaw as any).rows ?? existingRaw).map((r: any) => r.week.substring(0, 10))
  );

  let weeksProcessed = 0;
  let deliveriesCreated = 0;

  for (const weekStart of weeks) {
    if (existingWeeks.has(weekStart)) {
      console.log(`[Backfill]   Week ${weekStart} — already backfilled, skipping.`);
      continue;
    }

    // Compute week end (Mon + 6 days = Sun)
    const weekEnd = (() => {
      const d = new Date(weekStart + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + 6);
      return d.toISOString().substring(0, 10);
    })();

    // Fetch all accounts successfully sent this week
    const accountsRaw = await db.execute(sql`
      SELECT
        arl.account_id,
        arl.email_sent,
        arl.email_sent_at,
        arl.recipients_json,
        arl.email_status,
        arl.status,
        arl.created_at,
        c.customer_name
      FROM account_report_logs arl
      LEFT JOIN customers c ON c.id = arl.account_id
      WHERE arl.triggered_by = 'scheduler'
        AND arl.email_status = 'success'
        AND arl.report_week = ${weekStart}::date
      ORDER BY c.customer_name
    `);
    const accounts: any[] = (accountsRaw as any).rows ?? accountsRaw;

    if (accounts.length === 0) {
      console.log(`[Backfill]   Week ${weekStart} — no accounts, skipping.`);
      continue;
    }

    // Also fetch blocked records for this week (from automated_delivery)
    const blockedRaw = await db.execute(sql`
      SELECT DISTINCT ON (arl.account_id)
        arl.account_id,
        arl.error_message,
        arl.created_at,
        c.customer_name
      FROM account_report_logs arl
      LEFT JOIN customers c ON c.id = arl.account_id
      WHERE arl.triggered_by = 'automated_delivery'
        AND arl.email_status = 'skipped'
        AND arl.status = 'failed'
        AND arl.report_week = ${weekStart}::date
        AND arl.account_id NOT IN (
          SELECT account_id FROM account_report_logs
          WHERE triggered_by = 'scheduler'
            AND email_status = 'success'
            AND report_week = ${weekStart}::date
        )
      ORDER BY arl.account_id, arl.created_at DESC
    `);
    const blockedAccounts: any[] = (blockedRaw as any).rows ?? blockedRaw;

    const totalAccounts = accounts.length + blockedAccounts.length;

    // Create run record for this week
    const runId = randomUUID();
    await db.execute(sql`
      INSERT INTO account_report_campaign_runs
        (id, campaign_id, run_type, status, total_accounts, delivered_count, failed_count,
         not_sent_count, blocked_count, schedule_week_start, schedule_week_end,
         triggered_by, started_at, completed_at, created_at)
      VALUES
        (${runId}, ${campaignId}, 'automated', 'completed',
         ${totalAccounts}, ${accounts.length}, 0,
         0, ${blockedAccounts.length},
         ${weekStart}::date, ${weekEnd}::date,
         'backfill',
         ${weekStart}::date,
         ${accounts[0]?.created_at ?? null}::timestamptz,
         NOW())
    `);

    // Create delivered records for successful sends
    for (const acc of accounts) {
      // Try to get recipient email from recipients_json, otherwise mark as historical
      let recipientEmail: string | null = null;
      let historicalNote: string | null = null;
      try {
        const recipients: string[] = JSON.parse(acc.recipients_json ?? "[]");
        recipientEmail = recipients[0] ?? null;
      } catch {
        recipientEmail = null;
      }
      if (!recipientEmail) {
        historicalNote = "Historical summary only — recipient detail unavailable";
      }

      await db.execute(sql`
        INSERT INTO account_report_run_deliveries
          (id, run_id, account_id, status, recipient_email, sent_at, error_message, created_at)
        VALUES
          (${randomUUID()}, ${runId}, ${acc.account_id}, 'delivered',
           ${recipientEmail},
           ${acc.email_sent_at ?? acc.created_at}::timestamptz,
           ${historicalNote},
           NOW())
      `);
      deliveriesCreated++;
    }

    // Create blocked records for accounts that failed delivery
    for (const acc of blockedAccounts) {
      await db.execute(sql`
        INSERT INTO account_report_run_deliveries
          (id, run_id, account_id, status, recipient_email, sent_at, error_message, created_at)
        VALUES
          (${randomUUID()}, ${runId}, ${acc.account_id}, 'blocked',
           NULL, NULL,
           ${acc.error_message ?? "Sender mailbox not operational"},
           NOW())
      `);
      deliveriesCreated++;
    }

    console.log(
      `[Backfill]   Week ${weekStart}: run ${runId} — ` +
      `${accounts.length} delivered, ${blockedAccounts.length} blocked → ${accounts.length + blockedAccounts.length} total`
    );
    weeksProcessed++;
  }

  console.log(
    `[Backfill] Complete — ${weeksProcessed} week(s) backfilled, ${deliveriesCreated} delivery records created.`
  );
}

backfill()
  .then(() => process.exit(0))
  .catch(e => { console.error("[Backfill] Fatal error:", e); process.exit(1); });
