-- Migration 0007: Heymarket User Mappings
-- Maps DriverHub users to their Heymarket member identity.
-- Email is the primary matching key for auto-sync; manual overrides also supported.

CREATE TABLE IF NOT EXISTS heymarket_user_mappings (
  id                SERIAL PRIMARY KEY,
  driverhub_user_id TEXT    NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  heymarket_user_id INTEGER NOT NULL,
  driverhub_email   TEXT,                               -- stored at match time; populated by sync & manual map
  heymarket_email   TEXT,
  heymarket_name    TEXT,
  matched_by        TEXT    NOT NULL DEFAULT 'email',  -- 'email' | 'manual'
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  last_verified_at  TIMESTAMPTZ,                        -- stamped on every email-sync upsert
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Idempotent column additions for deployments against pre-existing tables
ALTER TABLE heymarket_user_mappings ADD COLUMN IF NOT EXISTS driverhub_email  TEXT;
ALTER TABLE heymarket_user_mappings ADD COLUMN IF NOT EXISTS is_active        BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE heymarket_user_mappings ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_heymarket_user_mappings_heymarket_user_id
  ON heymarket_user_mappings (heymarket_user_id);
