-- Migration: 0049_move_saved_views
-- Creates per-user saved filter presets for the Move List page.
-- Idempotent (IF NOT EXISTS throughout).

CREATE TABLE IF NOT EXISTS move_saved_views (
  id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          VARCHAR NOT NULL,
  is_system_default BOOLEAN NOT NULL DEFAULT FALSE,
  -- Filter fields (nullable = "not set")
  filter_move_number   VARCHAR,
  filter_driver        VARCHAR,
  filter_customer      VARCHAR,
  filter_status        VARCHAR,
  filter_move_type     VARCHAR,
  filter_source_system VARCHAR,
  filter_start_date    VARCHAR,  -- ISO date string YYYY-MM-DD
  filter_end_date      VARCHAR,  -- ISO date string YYYY-MM-DD
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_move_saved_views_user_id ON move_saved_views(user_id);
