-- Migration 0052: Move Saved Views
-- Feature 2.3 — Saved Views & User Productivity (Moves Module Modernization Epic)
--
-- Stores user-created named filter presets for the Moves workspace.
-- System views are defined in client-side constants and require no rows here.

CREATE TABLE IF NOT EXISTS move_saved_views (
  id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         VARCHAR(200) NOT NULL,
  filters      JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_msv_user_id
  ON move_saved_views(user_id);
