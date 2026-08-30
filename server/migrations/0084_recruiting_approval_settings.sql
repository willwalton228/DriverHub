-- Migration 0084: Recruiting approval settings
-- The shared schema, storage layer, UI, and notification resolver already use
-- these organization-scoped settings. This migration supplies the missing
-- durable database dependency without creating a second settings source.

CREATE TABLE IF NOT EXISTS recruiting_approval_settings (
  id                      VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  VARCHAR NOT NULL UNIQUE,
  primary_approver_user_id VARCHAR,
  primary_approver_name   VARCHAR,
  backup_approver_user_id VARCHAR,
  backup_approver_name    VARCHAR,
  delegation_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  delegation_start_date   VARCHAR,
  delegation_end_date     VARCHAR,
  delegation_reason       TEXT,
  last_updated_by         VARCHAR,
  last_updated_by_name    VARCHAR,
  created_at              TIMESTAMP DEFAULT NOW(),
  updated_at              TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recruiting_approval_settings_audit (
  id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          VARCHAR NOT NULL,
  changed_by      VARCHAR NOT NULL,
  changed_by_name VARCHAR,
  change_type     VARCHAR NOT NULL,
  previous_values JSONB,
  new_values      JSONB,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recruiting_approval_settings_audit_org_created_idx
  ON recruiting_approval_settings_audit (org_id, created_at DESC);