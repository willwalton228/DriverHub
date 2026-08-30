-- Migration 0057: Recruiting Job Postings (DH-002127)
-- Stores manually-entered external job posting links per recruiting campaign.
-- Structured for future Pinpoint integration (source_type, source_system, external IDs).

CREATE TABLE IF NOT EXISTS recruiting_job_postings (
  id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         VARCHAR NOT NULL REFERENCES recruiting_campaigns(id) ON DELETE CASCADE,
  source              VARCHAR(50)  NOT NULL,
  source_name         VARCHAR(200),                         -- populated only when source = 'Other'
  posting_url         TEXT         NOT NULL,
  posting_status      VARCHAR(20)  NOT NULL DEFAULT 'active', -- active | paused | expired | removed
  posted_at           DATE         NOT NULL DEFAULT CURRENT_DATE,
  expires_at          DATE,
  notes               TEXT,
  -- Audit
  created_by          VARCHAR      NOT NULL,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_by          VARCHAR,
  updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  -- Future integration readiness (Phase 2 / Pinpoint)
  source_type         VARCHAR(20)  NOT NULL DEFAULT 'manual', -- 'manual' | 'integration'
  source_system       VARCHAR(100),
  external_posting_id VARCHAR(200),
  external_job_id     VARCHAR(200),
  last_synced_at      TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS rjp_campaign_idx ON recruiting_job_postings(campaign_id);
CREATE INDEX IF NOT EXISTS rjp_status_idx   ON recruiting_job_postings(posting_status);
