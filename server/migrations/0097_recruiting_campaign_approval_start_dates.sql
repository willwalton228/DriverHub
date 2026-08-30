-- DH-002349: Recruiting Campaign Start Date is the Request approval date.
-- approved_at is stored as a UTC wall-clock timestamp without a timezone, so
-- convert it from UTC to America/Chicago before extracting the business date.

WITH candidates AS MATERIALIZED (
  SELECT
    rr.id,
    rr.campaign_start_date AS previous_start_date,
    (
      (rr.approved_at AT TIME ZONE 'UTC')
      AT TIME ZONE 'America/Chicago'
    )::date AS approval_start_date
  FROM recruiting_requests rr
  WHERE rr.approved_at IS NOT NULL
    AND (
      rr.approval_status = 'approved'
      OR rr.request_status IN ('approved', 'recruiting_active', 'completed')
    )
    AND rr.campaign_start_date IS DISTINCT FROM (
      ((rr.approved_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Chicago')::date
    )
),
audited AS (
  INSERT INTO recruiting_audit_events (
    action_type, entity_type, entity_id, user_id, user_email, actor_role, source,
    previous_value, new_value, changed_fields, reason
  )
  SELECT
    'CAMPAIGN_START_DATE_CORRECTED',
    'request',
    id,
    NULL,
    'system@driverhub.internal',
    NULL,
    'migration',
    json_build_object('campaignStartDate', previous_start_date)::text,
    json_build_object('campaignStartDate', approval_start_date)::text,
    ARRAY['campaignStartDate'],
    'Corrected Recruiting Campaign Start Date to the authoritative Request approval business date (DH-002349).'
  FROM candidates
  RETURNING entity_id
)
UPDATE recruiting_requests rr
SET campaign_start_date = candidates.approval_start_date,
    updated_at = NOW()
FROM candidates
JOIN audited ON audited.entity_id = candidates.id
WHERE rr.id = candidates.id;

-- Keep the legacy Campaign Manager table aligned for linked records and metrics.
WITH linked AS (
  SELECT rc.id, rr.campaign_start_date
  FROM recruiting_campaigns rc
  JOIN recruiting_requests rr ON rr.id = rc.request_id
  WHERE rr.approved_at IS NOT NULL
    AND rc.start_date IS DISTINCT FROM rr.campaign_start_date
)
UPDATE recruiting_campaigns rc
SET start_date = linked.campaign_start_date,
    updated_at = NOW()
FROM linked
WHERE rc.id = linked.id;