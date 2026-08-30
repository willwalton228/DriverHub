-- Migration 0020: Recruiting Request Workflow
-- Adds request_number, business_reason, attachments to recruiting_requests
-- Creates recruiting_request_activity audit log table

-- ── New columns on recruiting_requests ────────────────────────────────────────
ALTER TABLE recruiting_requests
  ADD COLUMN IF NOT EXISTS request_number  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS business_reason VARCHAR(100),
  ADD COLUMN IF NOT EXISTS attachments     TEXT[]  DEFAULT '{}';

-- Unique index on request_number
CREATE UNIQUE INDEX IF NOT EXISTS recruiting_requests_request_number_idx
  ON recruiting_requests (request_number)
  WHERE request_number IS NOT NULL;

-- Sequence for auto-generating request numbers
CREATE SEQUENCE IF NOT EXISTS recruiting_request_number_seq START 1;

-- ── Activity log table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recruiting_request_activity (
  id           VARCHAR        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       VARCHAR        NOT NULL,
  request_id   VARCHAR        NOT NULL,
  user_id      VARCHAR        NOT NULL,
  user_name    VARCHAR(200),
  action       VARCHAR(50)    NOT NULL DEFAULT 'status_change', -- status_change | note | attachment
  from_status  VARCHAR(50),
  to_status    VARCHAR(50),
  notes        TEXT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rra_request_idx   ON recruiting_request_activity (request_id);
CREATE INDEX IF NOT EXISTS rra_org_idx       ON recruiting_request_activity (org_id);
CREATE INDEX IF NOT EXISTS rra_created_idx   ON recruiting_request_activity (created_at DESC);
