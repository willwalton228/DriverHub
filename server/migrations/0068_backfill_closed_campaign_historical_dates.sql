-- Migration 0068: Historical Closed Campaign Date Repair (DH-002164)
--
-- Canonical campaign data lives in recruiting_requests, linked to
-- recruiting_requisitions. The legacy recruiting_campaigns table is empty and
-- must not be used as a source.
--
-- Evidence priority:
--   Start date: existing canonical value, then historical request audit snapshot.
--   Actual close: existing canonical value, requisition.closed_at, then original
--   Completed/Closed status-history event (in that order).
--
-- The migration only writes null canonical fields and records each backfill in
-- the append-only recruiting audit trail. It never uses created_at, updated_at,
-- target_date, migration time, or today's date as a business date.

-- Recover historical campaign start dates only where the immutable request audit
-- snapshot explicitly contains a prior campaignStartDate value.
WITH closed_campaigns AS (
  SELECT rr.id
  FROM recruiting_requests rr
  JOIN recruiting_requisitions req ON req.id = rr.campaign_requisition_id
  WHERE rr.is_archived = false
    AND req.status::text IN ('closed', 'filled')
),
start_evidence AS (
  SELECT
    ae.entity_id AS request_id,
    MIN((ae.new_value::jsonb ->> 'campaignStartDate')::date) AS recovered_start_date
  FROM recruiting_audit_events ae
  WHERE ae.entity_type = 'request'
    AND ae.action_type = 'CAMPAIGN_DETAILS_UPDATED'
    AND ae.new_value IS NOT NULL
    AND (ae.new_value::jsonb ->> 'campaignStartDate') ~ '^\d{4}-\d{2}-\d{2}$'
  GROUP BY ae.entity_id
),
updated AS (
  UPDATE recruiting_requests rr
  SET campaign_start_date = se.recovered_start_date,
      updated_at = NOW()
  FROM closed_campaigns cc
  JOIN start_evidence se ON se.request_id = cc.id
  WHERE rr.id = cc.id
    AND rr.campaign_start_date IS NULL
  RETURNING rr.id, rr.campaign_start_date
)
INSERT INTO recruiting_audit_events (
  action_type, entity_type, entity_id, user_id, user_email, actor_role, source,
  previous_value, new_value, changed_fields, reason
)
SELECT
  'HISTORICAL_DATE_BACKFILLED',
  'request',
  id,
  NULL,
  'system@driverhub.internal',
  NULL,
  'migration',
  '{"campaignStartDate":null}',
  json_build_object('campaignStartDate', campaign_start_date)::text,
  ARRAY['campaignStartDate'],
  'Recovered canonical campaign start date from immutable Recruiting audit history (DH-002164).'
FROM updated;

-- Recover actual closing dates from authoritative historical closure evidence.
-- `occurred_at` is converted to the DriverHub operating timezone before
-- becoming a date so near-midnight UTC events retain their business date.
WITH closed_campaigns AS (
  SELECT rr.id, rr.campaign_requisition_id, req.closed_at AS requisition_closed_at
  FROM recruiting_requests rr
  JOIN recruiting_requisitions req ON req.id = rr.campaign_requisition_id
  WHERE rr.is_archived = false
    AND req.status::text IN ('closed', 'filled')
),
closure_evidence AS (
  SELECT
    ae.entity_id AS requisition_id,
    MIN((ae.occurred_at AT TIME ZONE 'America/Chicago')::date) FILTER (
      WHERE lower(COALESCE(ae.new_value::jsonb ->> 'status', '')) = 'completed'
    ) AS original_completed_date,
    MIN((ae.occurred_at AT TIME ZONE 'America/Chicago')::date) FILTER (
      WHERE lower(COALESCE(ae.new_value::jsonb ->> 'status', '')) = 'closed'
    ) AS original_closed_date
  FROM recruiting_audit_events ae
  WHERE ae.entity_type = 'requisition'
    AND ae.action_type = 'CAMPAIGN_STATUS_UPDATED'
  GROUP BY ae.entity_id
),
updated AS (
  UPDATE recruiting_requests rr
  SET actual_closing_date = COALESCE(
        cc.requisition_closed_at::date,
        ce.original_completed_date,
        ce.original_closed_date
      ),
      updated_at = NOW()
  FROM closed_campaigns cc
  LEFT JOIN closure_evidence ce ON ce.requisition_id = cc.campaign_requisition_id
  WHERE rr.id = cc.id
    AND rr.actual_closing_date IS NULL
    AND COALESCE(
      cc.requisition_closed_at::date,
      ce.original_completed_date,
      ce.original_closed_date
    ) IS NOT NULL
  RETURNING rr.id, rr.actual_closing_date
)
INSERT INTO recruiting_audit_events (
  action_type, entity_type, entity_id, user_id, user_email, actor_role, source,
  previous_value, new_value, changed_fields, reason
)
SELECT
  'HISTORICAL_DATE_BACKFILLED',
  'request',
  id,
  NULL,
  'system@driverhub.internal',
  'system',
  'migration',
  '{"actualClosingDate":null}',
  json_build_object('actualClosingDate', actual_closing_date)::text,
  ARRAY['actualClosingDate'],
  'Recovered canonical actual closing date from original Recruiting status-history evidence (DH-002164).'
FROM updated;