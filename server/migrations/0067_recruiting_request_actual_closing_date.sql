-- Migration 0067: Add actual_closing_date to recruiting_requests (DH-002164 / DH-002168)
--
-- The DH-002168 Actual Closing Date was originally stored on recruiting_campaigns,
-- which is and has always been an empty table. All campaign lifecycle data lives in
-- recruiting_requests (joined to recruiting_requisitions). This migration adds the
-- canonical actual_closing_date field to the table where the data actually resides.
--
-- The PATCH /api/recruiting/campaigns/:id/closing-date endpoint and the campaign-close
-- flow in PATCH /api/recruiting/requests/:id/details are updated accordingly.

ALTER TABLE recruiting_requests
  ADD COLUMN IF NOT EXISTS actual_closing_date date;

CREATE INDEX IF NOT EXISTS idx_rr_actual_closing_date
  ON recruiting_requests(actual_closing_date)
  WHERE actual_closing_date IS NOT NULL;
