-- Migration: 0025_claims_widget_preferences
-- Adds per-user widget order and visibility preferences for the Claims Dashboard KPI bar.

CREATE TABLE IF NOT EXISTS claims_widget_preferences (
  id            varchar        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       varchar        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  widget_order  text[]         NOT NULL DEFAULT '{}',
  hidden_widgets text[]        NOT NULL DEFAULT '{}',
  updated_at    timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS claims_widget_prefs_user_idx
  ON claims_widget_preferences(user_id);
