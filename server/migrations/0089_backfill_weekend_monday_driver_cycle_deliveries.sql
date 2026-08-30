-- Preserve the no-resend guarantee for reminder cycles that were sent before
-- the driver-cycle delivery ledger was introduced. The legacy parent records
-- remain the source audit history; this creates the active idempotency state.

WITH legacy_channels AS (
  SELECT
    comm.driver_id,
    comm.shift_date AS monday_date,
    'sms'::varchar AS channel,
    BOOL_OR(COALESCE(comm.sms_sent, FALSE)) AS was_sent,
    BOOL_OR(comm.sms_status = 'failed') AS was_failed,
    MAX(comm.sms_sent_at) FILTER (WHERE comm.sms_sent) AS sent_at,
    MAX(comm.sms_external_id) FILTER (WHERE comm.sms_sent) AS external_id,
    MAX(comm.sms_error) FILTER (WHERE comm.sms_status = 'failed') AS error,
    COUNT(*)::integer AS attempt_count,
    (ARRAY_AGG(comm.id ORDER BY comm.sms_sent_at DESC NULLS LAST, comm.created_at DESC))[1] AS weekend_monday_comm_id
  FROM weekend_monday_comms comm
  WHERE comm.trigger = 'weekend_monday_reminder'
    AND comm.driver_id IS NOT NULL
    AND comm.shift_date IS NOT NULL
  GROUP BY comm.driver_id, comm.shift_date

  UNION ALL

  SELECT
    comm.driver_id,
    comm.shift_date AS monday_date,
    'email'::varchar AS channel,
    BOOL_OR(COALESCE(comm.email_sent, FALSE)) AS was_sent,
    BOOL_OR(comm.email_status = 'failed') AS was_failed,
    MAX(comm.email_sent_at) FILTER (WHERE comm.email_sent) AS sent_at,
    MAX(comm.email_external_id) FILTER (WHERE comm.email_sent) AS external_id,
    MAX(comm.email_error) FILTER (WHERE comm.email_status = 'failed') AS error,
    COUNT(*)::integer AS attempt_count,
    (ARRAY_AGG(comm.id ORDER BY comm.email_sent_at DESC NULLS LAST, comm.created_at DESC))[1] AS weekend_monday_comm_id
  FROM weekend_monday_comms comm
  WHERE comm.trigger = 'weekend_monday_reminder'
    AND comm.driver_id IS NOT NULL
    AND comm.shift_date IS NOT NULL
  GROUP BY comm.driver_id, comm.shift_date
)
INSERT INTO weekend_monday_driver_deliveries (
  weekend_monday_comm_id,
  driver_id,
  monday_date,
  channel,
  reminder_type,
  status,
  sent_at,
  failed_at,
  external_id,
  error,
  attempt_count
)
SELECT
  weekend_monday_comm_id,
  driver_id,
  monday_date,
  channel,
  'weekend_monday_reminder',
  CASE
    WHEN was_sent THEN 'sent'
    WHEN was_failed THEN 'failed'
    ELSE 'skipped'
  END,
  CASE WHEN was_sent THEN sent_at END,
  CASE WHEN NOT was_sent AND was_failed THEN NOW() END,
  external_id,
  error,
  attempt_count
FROM legacy_channels
ON CONFLICT (driver_id, monday_date, channel, reminder_type) DO UPDATE
SET
  status = CASE
    WHEN weekend_monday_driver_deliveries.status = 'sent' OR EXCLUDED.status = 'sent' THEN 'sent'
    WHEN weekend_monday_driver_deliveries.status = 'sending' THEN 'sending'
    WHEN EXCLUDED.status = 'failed' THEN 'failed'
    ELSE weekend_monday_driver_deliveries.status
  END,
  weekend_monday_comm_id = COALESCE(
    weekend_monday_driver_deliveries.weekend_monday_comm_id,
    EXCLUDED.weekend_monday_comm_id
  ),
  sent_at = COALESCE(weekend_monday_driver_deliveries.sent_at, EXCLUDED.sent_at),
  external_id = COALESCE(weekend_monday_driver_deliveries.external_id, EXCLUDED.external_id),
  error = COALESCE(EXCLUDED.error, weekend_monday_driver_deliveries.error),
  attempt_count = GREATEST(
    weekend_monday_driver_deliveries.attempt_count,
    EXCLUDED.attempt_count
  ),
  updated_at = NOW();