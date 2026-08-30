-- Migration 0061: DH-002168 — Actual Closing Date for Recruiting Campaigns
-- Adds business-effective closing date separate from the system timestamp (closed_at).
-- Also records who closed the campaign for audit display.
-- NO backfill: existing campaigns have actual_closing_date = NULL (flagged as "Closing Date Missing").
-- This avoids fabricating dates per ticket section 4–5.

ALTER TABLE recruiting_campaigns
  ADD COLUMN IF NOT EXISTS actual_closing_date date,
  ADD COLUMN IF NOT EXISTS closed_by_user_id   varchar,
  ADD COLUMN IF NOT EXISTS closed_by_name      varchar(200);
