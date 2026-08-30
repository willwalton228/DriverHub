-- migration: 0055_recruiting_status_standardization
-- ticket:    DH-002085
-- purpose:   Remove "Completed" as a valid Recruiting Campaign status.
--            Migrate all existing campaigns with status='completed' to status='closed'.
--            Closed is now the sole terminal successful campaign status.
--            Audit entries are added for each migrated campaign.

WITH migrated AS (
  UPDATE recruiting_campaigns
  SET status = 'closed', updated_at = NOW()
  WHERE status = 'completed'
  RETURNING id
)
INSERT INTO recruiting_audit_events (
  action_type,
  entity_type,
  entity_id,
  user_id,
  user_email,
  actor_role,
  source,
  previous_value,
  new_value,
  changed_fields,
  reason
)
SELECT
  'CAMPAIGN_STATUS_MIGRATED',
  'campaign',
  id,
  'system',
  'system@driverhub.internal',
  'system',
  'migration',
  '{"status":"completed"}',
  '{"status":"closed"}',
  ARRAY['status'],
  'Campaign status migrated from Completed to Closed as part of Recruiting status standardization (DH-002085).'
FROM migrated;
