-- Migration 0044: WIW Driver Time-Off Requests
-- Dedicated table for storing WIW time-off request data with full multi-day
-- range, status history, and driver linkage for reporting and dashboards.

CREATE TABLE IF NOT EXISTS wiw_time_off_requests (
  id                   varchar PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  external_request_id  varchar NOT NULL UNIQUE,
  wiw_user_id          varchar REFERENCES wiw_users(id) ON DELETE SET NULL,
  external_user_id     varchar,
  driver_id            varchar REFERENCES drivers(id) ON DELETE SET NULL,
  start_date           date NOT NULL,
  end_date             date NOT NULL,
  -- partial-day support
  start_time           timestamp with time zone,
  end_time             timestamp with time zone,
  -- calculated fields
  total_hours          numeric(8,2),
  total_days           numeric(6,2),
  -- classification
  request_type         varchar,        -- vacation, sick, personal, other, etc.
  status               varchar NOT NULL DEFAULT 'pending', -- pending, approved, denied, cancelled
  -- audit
  submitted_at         timestamp with time zone,
  approved_denied_at   timestamp with time zone,
  notes                text,
  wiw_account_id       varchar,
  raw_payload          jsonb,
  synced_at            timestamp with time zone NOT NULL DEFAULT now(),
  created_at           timestamp with time zone NOT NULL DEFAULT now(),
  updated_at           timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wiw_tor_driver_idx    ON wiw_time_off_requests(driver_id);
CREATE INDEX IF NOT EXISTS wiw_tor_wiw_user_idx  ON wiw_time_off_requests(wiw_user_id);
CREATE INDEX IF NOT EXISTS wiw_tor_start_idx     ON wiw_time_off_requests(start_date);
CREATE INDEX IF NOT EXISTS wiw_tor_end_idx       ON wiw_time_off_requests(end_date);
CREATE INDEX IF NOT EXISTS wiw_tor_status_idx    ON wiw_time_off_requests(status);
