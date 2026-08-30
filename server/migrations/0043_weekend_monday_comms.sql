-- Migration 0043: Weekend Monday Reminder Communications + Needs Coverage (DH-002053)

-- Outbound communication log for Saturday weekend-Monday-reminder automation
CREATE TABLE IF NOT EXISTS weekend_monday_comms (
  id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id             VARCHAR REFERENCES drivers(id) ON DELETE SET NULL,
  driver_name           VARCHAR,
  driver_classification VARCHAR,
  shift_date            DATE,
  shift_id              VARCHAR,
  assignment_id         VARCHAR,
  schedule_id           VARCHAR,
  account_name          VARCHAR,
  start_time            TIMESTAMP,
  end_time              TIMESTAMP,
  -- SMS
  sms_sent              BOOLEAN NOT NULL DEFAULT FALSE,
  sms_sent_at           TIMESTAMP,
  sms_status            VARCHAR,
  sms_external_id       VARCHAR,
  sms_error             TEXT,
  -- Email
  email_sent            BOOLEAN NOT NULL DEFAULT FALSE,
  email_sent_at         TIMESTAMP,
  email_status          VARCHAR,
  email_external_id     VARCHAR,
  email_error           TEXT,
  sender_mailbox        VARCHAR,
  -- Meta
  trigger               VARCHAR NOT NULL DEFAULT 'weekend_monday_reminder',
  -- Response tracking
  response_received     BOOLEAN NOT NULL DEFAULT FALSE,
  response_at           TIMESTAMP,
  response_text         TEXT,
  response_source       VARCHAR,
  -- AI classification
  ai_classification     VARCHAR,
  ai_confidence         DECIMAL(4,3),
  ai_processed_at       TIMESTAMP,
  driver_note_id        VARCHAR,
  -- Future email analytics (columns ready; logic not yet implemented)
  email_delivered       BOOLEAN,
  email_opened          BOOLEAN,
  first_opened_at       TIMESTAMP,
  last_opened_at        TIMESTAMP,
  open_count            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wmc_driver_idx   ON weekend_monday_comms(driver_id);
CREATE INDEX IF NOT EXISTS wmc_shift_date_idx ON weekend_monday_comms(shift_date);
CREATE INDEX IF NOT EXISTS wmc_created_idx  ON weekend_monday_comms(created_at);

-- Live work queue of shifts requiring replacement driver coverage
CREATE TABLE IF NOT EXISTS needs_coverage (
  id                      VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id                VARCHAR,
  assignment_id           VARCHAR,
  schedule_id             VARCHAR,
  driver_id               VARCHAR REFERENCES drivers(id) ON DELETE SET NULL,
  driver_name             VARCHAR,
  driver_classification   VARCHAR,
  shift_date              DATE,
  start_time              TIMESTAMP,
  end_time                TIMESTAMP,
  account_name            VARCHAR,
  reason                  TEXT,
  reported_by             VARCHAR,
  date_flagged            TIMESTAMP NOT NULL DEFAULT NOW(),
  status                  VARCHAR NOT NULL DEFAULT 'open',
  replacement_driver_id   VARCHAR REFERENCES drivers(id) ON DELETE SET NULL,
  replacement_driver_name VARCHAR,
  filled_at               TIMESTAMP,
  filled_by               VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  notes                   TEXT,
  source_type             VARCHAR NOT NULL DEFAULT 'manual',
  source_comm_id          VARCHAR,
  created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS nc_status_idx     ON needs_coverage(status);
CREATE INDEX IF NOT EXISTS nc_shift_date_idx ON needs_coverage(shift_date);
CREATE INDEX IF NOT EXISTS nc_driver_idx     ON needs_coverage(driver_id);
