-- DH-002053 UAT correction:
-- One driver receives at most one SMS and one email for a Monday reminder cycle.
-- The included WIW shifts remain on the consolidated parent communication record.

CREATE TABLE IF NOT EXISTS weekend_monday_reminder_runs (
  id                      VARCHAR PRIMARY KEY,
  trigger_source          VARCHAR NOT NULL CHECK (trigger_source IN ('scheduler', 'manual')),
  status                  VARCHAR NOT NULL DEFAULT 'running'
                          CHECK (status IN ('running', 'completed', 'failed')),
  monday_schedule_date    DATE,
  applicable_timezones    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  execution_started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  execution_completed_at  TIMESTAMPTZ,
  drivers_evaluated       INTEGER NOT NULL DEFAULT 0,
  drivers_eligible        INTEGER NOT NULL DEFAULT 0,
  sms_attempted           INTEGER NOT NULL DEFAULT 0,
  sms_successful          INTEGER NOT NULL DEFAULT 0,
  sms_failed              INTEGER NOT NULL DEFAULT 0,
  sms_skipped             INTEGER NOT NULL DEFAULT 0,
  email_attempted         INTEGER NOT NULL DEFAULT 0,
  email_successful        INTEGER NOT NULL DEFAULT 0,
  email_failed            INTEGER NOT NULL DEFAULT 0,
  email_skipped           INTEGER NOT NULL DEFAULT 0,
  error                   TEXT
);

CREATE INDEX IF NOT EXISTS weekend_monday_reminder_runs_started_idx
  ON weekend_monday_reminder_runs (execution_started_at DESC);

ALTER TABLE weekend_monday_comms
  ADD COLUMN IF NOT EXISTS applicable_timezone VARCHAR,
  ADD COLUMN IF NOT EXISTS expected_send_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_run_id VARCHAR,
  ADD COLUMN IF NOT EXISTS email_run_id VARCHAR;

CREATE TABLE IF NOT EXISTS weekend_monday_driver_deliveries (
  id                      VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  weekend_monday_comm_id  VARCHAR REFERENCES weekend_monday_comms(id) ON DELETE SET NULL,
  driver_id               VARCHAR NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  monday_date             DATE NOT NULL,
  channel                 VARCHAR NOT NULL CHECK (channel IN ('sms', 'email')),
  reminder_type           VARCHAR NOT NULL DEFAULT 'weekend_monday_reminder',
  status                  VARCHAR NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  claimed_at              TIMESTAMPTZ,
  sent_at                 TIMESTAMPTZ,
  failed_at               TIMESTAMPTZ,
  external_id             VARCHAR,
  error                   TEXT,
  skip_reason             VARCHAR,
  attempt_count           INTEGER NOT NULL DEFAULT 0,
  last_run_id             VARCHAR,
  last_trigger_source     VARCHAR,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT weekend_monday_driver_delivery_unique
    UNIQUE (driver_id, monday_date, channel, reminder_type)
);

CREATE INDEX IF NOT EXISTS weekend_monday_driver_delivery_parent_idx
  ON weekend_monday_driver_deliveries (weekend_monday_comm_id);
CREATE INDEX IF NOT EXISTS weekend_monday_driver_delivery_status_idx
  ON weekend_monday_driver_deliveries (status);
CREATE INDEX IF NOT EXISTS weekend_monday_driver_delivery_run_idx
  ON weekend_monday_driver_deliveries (last_run_id);

CREATE TABLE IF NOT EXISTS weekend_monday_reminder_attempts (
  id                      VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                  VARCHAR NOT NULL REFERENCES weekend_monday_reminder_runs(id) ON DELETE CASCADE,
  delivery_id             VARCHAR REFERENCES weekend_monday_driver_deliveries(id) ON DELETE SET NULL,
  weekend_monday_comm_id  VARCHAR REFERENCES weekend_monday_comms(id) ON DELETE SET NULL,
  driver_id               VARCHAR NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  monday_date             DATE NOT NULL,
  channel                 VARCHAR NOT NULL CHECK (channel IN ('sms', 'email')),
  outcome                 VARCHAR NOT NULL CHECK (outcome IN ('sent', 'failed', 'skipped')),
  skip_reason             VARCHAR,
  external_id             VARCHAR,
  error                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS weekend_monday_reminder_attempts_run_idx
  ON weekend_monday_reminder_attempts (run_id, created_at);
CREATE INDEX IF NOT EXISTS weekend_monday_reminder_attempts_driver_idx
  ON weekend_monday_reminder_attempts (driver_id, monday_date, channel);