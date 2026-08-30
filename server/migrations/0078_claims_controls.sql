-- Claims Controls v1
-- Centralizes the New Claim email setting around the shared communications
-- framework and records configuration changes for future module control pages.

CREATE TABLE IF NOT EXISTS comm_automations (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  automation_key   TEXT UNIQUE NOT NULL,
  name             TEXT NOT NULL,
  category         TEXT NOT NULL,
  comm_type        TEXT NOT NULL DEFAULT 'email',
  trigger_event    TEXT,
  trigger_config   JSONB DEFAULT '{}',
  sender_profile   TEXT NOT NULL DEFAULT 'Support',
  recipient_config JSONB DEFAULT '[]',
  template_slug    TEXT,
  schedule_config  JSONB DEFAULT '{}',
  enabled          BOOLEAN NOT NULL DEFAULT true,
  last_run_at      TIMESTAMPTZ,
  next_run_at      TIMESTAMPTZ,
  description      TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comm_recipient_rules (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  event_slug        TEXT NOT NULL,
  channel           TEXT NOT NULL,
  recipient_type    TEXT NOT NULL,
  recipient_value   TEXT NOT NULL,
  enabled           BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS module_control_audit (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  module_key         TEXT NOT NULL,
  setting_key        TEXT NOT NULL,
  previous_value     JSONB,
  new_value          JSONB NOT NULL,
  changed_by_user_id TEXT,
  changed_by_name    TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS module_control_audit_module_created_idx
  ON module_control_audit (module_key, created_at DESC);

CREATE INDEX IF NOT EXISTS comm_recipient_rules_event_channel_idx
  ON comm_recipient_rules (event_slug, channel, enabled);

INSERT INTO comm_automations (
  automation_key,
  name,
  category,
  comm_type,
  trigger_event,
  trigger_config,
  sender_profile,
  template_slug,
  schedule_config,
  description
) VALUES (
  'claim_created_notification',
  'Claim Created Notification',
  'Claims',
  'email',
  'CLAIM_CREATED',
  '{}',
  'Support',
  'CLAIM_CREATED',
  '{}',
  'Sends a configurable internal email when a new claim is created.'
)
ON CONFLICT (automation_key) DO NOTHING;