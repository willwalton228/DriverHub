-- Migration 0060: Closed Campaigns — Actual Closing Date
-- DH-002164: Create Dedicated Closed Recruiting Campaigns View
-- Adds a closed_at timestamp to recruiting_campaigns so the Closed Campaigns
-- view can display the Actual Closing Date separately from the Target Completion
-- date (endDate).  For legacy "completed" and "closed" rows that predate this
-- field, closed_at is seeded from updated_at as the best available approximation.

ALTER TABLE recruiting_campaigns
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Seed legacy closed rows that have no closed_at yet
UPDATE recruiting_campaigns
   SET closed_at = updated_at
 WHERE status IN ('closed', 'completed')
   AND closed_at IS NULL;

-- Migrate any remaining "completed" → "closed" (DH-002085 follow-up)
UPDATE recruiting_campaigns
   SET status = 'closed'
 WHERE status = 'completed';
