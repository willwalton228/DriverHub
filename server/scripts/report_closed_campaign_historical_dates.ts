/**
 * DH-002164 — Historical Closed Campaign Date Repair Report
 *
 * Produces a CSV and Markdown exception report from the canonical Recruiting
 * tables after migrations 0068 and 0069. It never modifies data.
 *
 * Usage:
 *   npx tsx server/scripts/report_closed_campaign_historical_dates.ts
 *   npx tsx server/scripts/report_closed_campaign_historical_dates.ts reports
 */
import fs from "fs";
import path from "path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const databaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("NEON_DATABASE_URL or DATABASE_URL must be configured.");
}

const outputDir = path.resolve(process.argv[2] || "reports");
const pool = new Pool({ connectionString: databaseUrl });

type RepairSummary = {
  total_closed_campaigns: string;
  start_already_populated: string;
  start_recovered_backfilled: string;
  start_unable_to_recover: string;
  close_already_populated: string;
  close_recovered_backfilled: string;
  close_unable_to_recover: string;
  fully_complete_records: string;
  manual_review_required: string;
};

type ExceptionRow = {
  campaign_id: string;
  account: string | null;
  campaign_label_or_location: string | null;
  status: string;
  target_completion: string | null;
  missing_start_date: boolean;
  missing_actual_closing_date: boolean;
  possible_originating_request_ids: string;
  reason_automatic_recovery_could_not_be_completed: string;
};

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, "\"\"")}"`;
}

async function main() {
  const summaryResult = await pool.query<RepairSummary>(`
    WITH closed_campaigns AS (
      SELECT rr.id, rr.campaign_start_date, rr.actual_closing_date
      FROM recruiting_requests rr
      JOIN recruiting_requisitions req ON req.id = rr.campaign_requisition_id
      WHERE rr.is_archived = false AND req.status::text IN ('closed', 'filled')
    ),
    repaired AS (
      SELECT entity_id,
             BOOL_OR(changed_fields @> ARRAY['campaignStartDate']) AS start_backfilled,
             BOOL_OR(changed_fields @> ARRAY['actualClosingDate']) AS close_backfilled
      FROM recruiting_audit_events
      WHERE action_type = 'HISTORICAL_DATE_BACKFILLED'
        AND entity_type = 'request'
      GROUP BY entity_id
    )
    SELECT
      COUNT(*)::text AS total_closed_campaigns,
      COUNT(*) FILTER (WHERE c.campaign_start_date IS NOT NULL AND NOT COALESCE(r.start_backfilled, false))::text AS start_already_populated,
      COUNT(*) FILTER (WHERE COALESCE(r.start_backfilled, false))::text AS start_recovered_backfilled,
      COUNT(*) FILTER (WHERE c.campaign_start_date IS NULL)::text AS start_unable_to_recover,
      COUNT(*) FILTER (WHERE c.actual_closing_date IS NOT NULL AND NOT COALESCE(r.close_backfilled, false))::text AS close_already_populated,
      COUNT(*) FILTER (WHERE COALESCE(r.close_backfilled, false))::text AS close_recovered_backfilled,
      COUNT(*) FILTER (WHERE c.actual_closing_date IS NULL)::text AS close_unable_to_recover,
      COUNT(*) FILTER (WHERE c.campaign_start_date IS NOT NULL AND c.actual_closing_date IS NOT NULL)::text AS fully_complete_records,
      COUNT(*) FILTER (WHERE c.campaign_start_date IS NULL OR c.actual_closing_date IS NULL)::text AS manual_review_required
    FROM closed_campaigns c
    LEFT JOIN repaired r ON r.entity_id = c.id
  `);
  const summary = summaryResult.rows[0];

  const exceptionsResult = await pool.query<ExceptionRow>(`
    SELECT
      rr.id AS campaign_id,
      rr.dealership_name AS account,
      NULLIF(CONCAT_WS(' — ', rr.location, rr.market), '') AS campaign_label_or_location,
      req.status::text AS status,
      rr.target_date::text AS target_completion,
      (rr.campaign_start_date IS NULL) AS missing_start_date,
      (rr.actual_closing_date IS NULL) AS missing_actual_closing_date,
      CASE
        WHEN req.source_request_id IS NULL OR req.source_request_id = rr.id THEN rr.id
        ELSE CONCAT_WS(', ', rr.id, req.source_request_id)
      END AS possible_originating_request_ids,
      CONCAT_WS(' ',
        CASE WHEN rr.campaign_start_date IS NULL THEN
          'No canonical campaign start date or immutable request-audit snapshot contains a start date; no linked legacy campaign record exists.'
        END,
        CASE WHEN rr.actual_closing_date IS NULL THEN
          'No requisition closed date or original Completed/Closed status-history timestamp exists.'
        END
      ) AS reason_automatic_recovery_could_not_be_completed
    FROM recruiting_requests rr
    JOIN recruiting_requisitions req ON req.id = rr.campaign_requisition_id
    WHERE rr.is_archived = false
      AND req.status::text IN ('closed', 'filled')
      AND (rr.campaign_start_date IS NULL OR rr.actual_closing_date IS NULL)
    ORDER BY rr.dealership_name NULLS LAST, rr.id
  `);

  fs.mkdirSync(outputDir, { recursive: true });

  const csvHeader = [
    "Campaign ID",
    "Account",
    "Campaign Label / Location",
    "Status",
    "Target Completion",
    "Missing Start Date?",
    "Missing Actual Closing Date?",
    "Possible Originating Recruiting Request ID(s)",
    "Reason Automatic Recovery Could Not Be Completed",
  ];
  const csvRows = exceptionsResult.rows.map((row) => [
    row.campaign_id,
    row.account,
    row.campaign_label_or_location,
    row.status,
    row.target_completion,
    row.missing_start_date ? "Yes" : "No",
    row.missing_actual_closing_date ? "Yes" : "No",
    row.possible_originating_request_ids,
    row.reason_automatic_recovery_could_not_be_completed,
  ]);
  fs.writeFileSync(
    path.join(outputDir, "DH-002164-historical-date-exceptions.csv"),
    [csvHeader, ...csvRows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n",
  );

  const markdown = `# DH-002164 Historical Closed Campaign Date Repair

Generated from the canonical Recruiting tables on ${new Date().toISOString()}.

## Reconciliation

| Measure | Count |
| --- | ---: |
| Total closed campaigns | ${summary.total_closed_campaigns} |
| Start date — already populated | ${summary.start_already_populated} |
| Start date — recovered/backfilled | ${summary.start_recovered_backfilled} |
| Start date — unable to recover | ${summary.start_unable_to_recover} |
| Actual closing date — already populated | ${summary.close_already_populated} |
| Actual closing date — recovered/backfilled | ${summary.close_recovered_backfilled} |
| Actual closing date — unable to recover | ${summary.close_unable_to_recover} |
| Fully complete records | ${summary.fully_complete_records} |
| Manual review required | ${summary.manual_review_required} |

For the initial historical records, missing Start Dates were backfilled from
the linked requisition's canonical Campaign Created Date. Going forward,
Start Date must be explicitly supplied. The CSV companion contains every
unresolved campaign and the required evidence explanation.
`;
  fs.writeFileSync(path.join(outputDir, "DH-002164-historical-date-repair.md"), markdown);

  console.log(markdown);
  console.log(`Exception CSV: ${path.join(outputDir, "DH-002164-historical-date-exceptions.csv")}`);
}

main()
  .catch((error) => {
    console.error("Failed to generate historical date repair report:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });