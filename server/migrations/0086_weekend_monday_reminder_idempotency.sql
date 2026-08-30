-- DH-002053: Persistent, channel-level idempotency for Weekend Monday reminders.
-- The legacy weekend_monday_comms rows remain immutable audit history. New sends
-- claim exactly one delivery state for Driver + Shift + Channel + Reminder Type.

ALTER TABLE weekend_monday_comms
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR;

CREATE UNIQUE INDEX IF NOT EXISTS weekend_monday_comms_idempotency_key_idx
  ON weekend_monday_comms (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS weekend_monday_comm_deliveries (
  id                       VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  weekend_monday_comm_id   VARCHAR REFERENCES weekend_monday_comms(id) ON DELETE SET NULL,
  driver_id                VARCHAR NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  shift_id                 VARCHAR NOT NULL,
  channel                  VARCHAR NOT NULL CHECK (channel IN ('sms', 'email')),
  reminder_type            VARCHAR NOT NULL DEFAULT 'weekend_monday_reminder',
  status                   VARCHAR NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  claimed_at               TIMESTAMPTZ,
  sent_at                  TIMESTAMPTZ,
  failed_at                TIMESTAMPTZ,
  external_id              VARCHAR,
  error                    TEXT,
  attempt_count            INTEGER NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT weekend_monday_comm_delivery_unique
    UNIQUE (driver_id, shift_id, channel, reminder_type)
);

CREATE INDEX IF NOT EXISTS weekend_monday_comm_delivery_parent_idx
  ON weekend_monday_comm_deliveries (weekend_monday_comm_id);
CREATE INDEX IF NOT EXISTS weekend_monday_comm_delivery_status_idx
  ON weekend_monday_comm_deliveries (status);

-- Seed the durable channel ledger from legacy records. If historical duplicate
-- rows exist, any confirmed success wins so the next run cannot resend it.
WITH legacy_shifts AS (
  SELECT
    comm.driver_id,
    COALESCE(detail.value->>'shiftId', comm.shift_id) AS shift_id,
    comm.sms_sent,
    comm.sms_status,
    comm.sms_sent_at,
    comm.sms_external_id,
    comm.sms_error,
    comm.email_sent,
    comm.email_status,
    comm.email_sent_at,
    comm.email_external_id,
    comm.email_error
  FROM weekend_monday_comms comm
  LEFT JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(comm.schedule_details) = 'array' THEN comm.schedule_details
      ELSE '[]'::jsonb
    END
  ) AS detail(value) ON TRUE
  WHERE comm.trigger = 'weekend_monday_reminder'
),
legacy_channels AS (
  SELECT driver_id, shift_id, 'sms'::varchar AS channel, sms_sent AS sent, sms_status AS status,
         sms_sent_at AS sent_at, sms_external_id AS external_id, sms_error AS error
  FROM legacy_shifts
  UNION ALL
  SELECT driver_id, shift_id, 'email'::varchar AS channel, email_sent AS sent, email_status AS status,
         email_sent_at AS sent_at, email_external_id AS external_id, email_error AS error
  FROM legacy_shifts
),
aggregated AS (
  SELECT
    driver_id,
    shift_id,
    channel,
    CASE
      WHEN BOOL_OR(COALESCE(sent, FALSE)) THEN 'sent'
      WHEN BOOL_OR(status = 'failed') THEN 'failed'
      ELSE 'skipped'
    END AS status,
    MAX(sent_at) FILTER (WHERE sent) AS sent_at,
    MAX(external_id) FILTER (WHERE sent) AS external_id,
    MAX(error) FILTER (WHERE status = 'failed') AS error,
    COUNT(*)::integer AS attempt_count
  FROM legacy_channels
  WHERE driver_id IS NOT NULL
    AND shift_id IS NOT NULL
    AND btrim(shift_id) <> ''
  GROUP BY driver_id, shift_id, channel
)
INSERT INTO weekend_monday_comm_deliveries (
  driver_id, shift_id, channel, reminder_type, status, sent_at,
  failed_at, external_id, error, attempt_count
)
SELECT
  driver_id,
  shift_id,
  channel,
  'weekend_monday_reminder',
  status,
  CASE WHEN status = 'sent' THEN sent_at END,
  CASE WHEN status = 'failed' THEN NOW() END,
  external_id,
  error,
  attempt_count
FROM aggregated
ON CONFLICT (driver_id, shift_id, channel, reminder_type) DO UPDATE
SET
  status = CASE
    WHEN weekend_monday_comm_deliveries.status = 'sent' OR EXCLUDED.status = 'sent' THEN 'sent'
    WHEN weekend_monday_comm_deliveries.status = 'sending' THEN 'sending'
    WHEN EXCLUDED.status = 'failed' THEN 'failed'
    ELSE weekend_monday_comm_deliveries.status
  END,
  sent_at = COALESCE(weekend_monday_comm_deliveries.sent_at, EXCLUDED.sent_at),
  external_id = COALESCE(weekend_monday_comm_deliveries.external_id, EXCLUDED.external_id),
  error = COALESCE(EXCLUDED.error, weekend_monday_comm_deliveries.error),
  attempt_count = GREATEST(
    weekend_monday_comm_deliveries.attempt_count,
    EXCLUDED.attempt_count
  ),
  updated_at = NOW();