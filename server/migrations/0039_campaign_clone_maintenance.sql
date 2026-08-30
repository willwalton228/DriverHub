-- Migration 0039: Campaign Clone — Maintenance / Back Up Role
-- Adds clone-tracking columns to recruiting_campaigns and a campaign activity log table.

ALTER TABLE recruiting_campaigns
  ADD COLUMN IF NOT EXISTS urgency_level               VARCHAR(50),
  ADD COLUMN IF NOT EXISTS cloned_from_campaign_id     VARCHAR,
  ADD COLUMN IF NOT EXISTS cloned_at                   TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS cloned_by                   VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS maintenance_clone_id         VARCHAR,
  ADD COLUMN IF NOT EXISTS maintenance_clone_created_at TIMESTAMP WITH TIME ZONE;

-- Activity / history log for individual campaigns
CREATE TABLE IF NOT EXISTS recruiting_campaign_activity (
  id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  campaign_id VARCHAR NOT NULL REFERENCES recruiting_campaigns(id) ON DELETE CASCADE,
  event_type  VARCHAR(50)  NOT NULL,   -- 'maintenance_clone_created' | 'cloned_from' | 'status_change' | …
  message     TEXT         NOT NULL,
  actor_id    VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  actor_name  VARCHAR(200),
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rca_campaign_id ON recruiting_campaign_activity(campaign_id);
CREATE INDEX IF NOT EXISTS idx_rca_created_at  ON recruiting_campaign_activity(created_at);
