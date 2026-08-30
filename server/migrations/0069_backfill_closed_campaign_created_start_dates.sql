-- Migration 0069: Approved Created-Date Start Date Fallback (DH-002164)
--
-- Business decision: when a Recruiting campaign has no stored campaign start
-- date and no historical start-date evidence, use the linked requisition's
-- canonical created_at timestamp as its persisted Start Date.
--
-- This applies only to null campaign_start_date values on closed/filled
-- campaigns and never changes an existing Start Date.

WITH updated AS (
  UPDATE recruiting_requests rr
  SET campaign_start_date = req.created_at::date,
      updated_at = NOW()
  FROM recruiting_requisitions req
  WHERE req.id = rr.campaign_requisition_id
    AND rr.is_archived = false
    AND req.status::text IN ('closed', 'filled')
    AND rr.campaign_start_date IS NULL
    AND req.created_at IS NOT NULL
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
  'Stored canonical campaign Start Date from the request Created Date, using the approved historical fallback (DH-002164).'
FROM updated;