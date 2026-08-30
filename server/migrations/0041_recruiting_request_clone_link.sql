-- Migration 0041: Add clone linkage columns to recruiting_requests
-- Stores which campaign a request was cloned from, who did it, and when.

ALTER TABLE recruiting_requests
  ADD COLUMN IF NOT EXISTS cloned_from_campaign_id VARCHAR,
  ADD COLUMN IF NOT EXISTS cloned_by               VARCHAR,
  ADD COLUMN IF NOT EXISTS cloned_at               TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_rr_cloned_from_campaign
  ON recruiting_requests(cloned_from_campaign_id)
  WHERE cloned_from_campaign_id IS NOT NULL;
