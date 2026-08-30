-- Migration 0045: Per-metric timestamps for recruiting manual metrics
-- Adds independent updated_at/by columns for each of the three manual metrics
-- so edits to Candidates, Interviews, or Hired This Month are timestamped separately.

ALTER TABLE recruiting_manual_metrics
  ADD COLUMN IF NOT EXISTS candidates_updated_at       TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS candidates_updated_by       VARCHAR,
  ADD COLUMN IF NOT EXISTS candidates_updated_by_name  VARCHAR(200),
  ADD COLUMN IF NOT EXISTS interviews_updated_at       TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS interviews_updated_by       VARCHAR,
  ADD COLUMN IF NOT EXISTS interviews_updated_by_name  VARCHAR(200),
  ADD COLUMN IF NOT EXISTS hired_updated_at            TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS hired_updated_by            VARCHAR,
  ADD COLUMN IF NOT EXISTS hired_updated_by_name       VARCHAR(200);
