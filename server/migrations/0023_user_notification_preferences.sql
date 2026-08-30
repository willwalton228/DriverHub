-- Migration 0023: User Notification Preferences
-- Allows each user to control which notification categories they receive
-- per module and per channel. Mandatory events (defined at the engine level)
-- bypass this table entirely and are always delivered.

CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id                VARCHAR        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           VARCHAR        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Module: 'all', 'claims', 'tickets', 'recruiting', 'invoices', 'staffing', 'vendors', 'system'
  module            VARCHAR(64)    NOT NULL,
  -- Category: 'assigned_to_me', 'status_changes', 'comments', 'mentions',
  --           'approval_requests', 'cc_updates', 'completed_tasks', 'system_announcements'
  category          VARCHAR(64)    NOT NULL,
  -- Channel: 'in_app' | 'email' | 'sms' | 'digest' (sms and digest for future use)
  channel           VARCHAR(32)    NOT NULL DEFAULT 'in_app',
  enabled           BOOLEAN        NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CONSTRAINT user_notif_prefs_unique UNIQUE (user_id, module, category, channel)
);

CREATE INDEX IF NOT EXISTS user_notif_prefs_user_idx ON user_notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS user_notif_prefs_lookup_idx ON user_notification_preferences(user_id, channel, enabled);
