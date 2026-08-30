-- Migration 0003: Driver Call Logs
-- Adds manual call logging for the Notes & Communications timeline

CREATE TABLE IF NOT EXISTS driver_call_logs (
  id             VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id      VARCHAR REFERENCES drivers(id) ON DELETE SET NULL,
  account_id     VARCHAR REFERENCES customers(id) ON DELETE SET NULL,
  logged_by_user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  call_type      VARCHAR NOT NULL DEFAULT 'outbound',  -- 'inbound' | 'outbound'
  duration_minutes INTEGER,
  outcome        VARCHAR,  -- 'connected' | 'no_answer' | 'voicemail' | 'busy' | 'other'
  notes          TEXT,
  call_date      TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_call_logs_driver_id ON driver_call_logs(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_call_logs_created_at ON driver_call_logs(created_at DESC);
