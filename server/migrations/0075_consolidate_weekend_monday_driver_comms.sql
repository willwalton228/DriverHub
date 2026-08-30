-- One Weekend Monday reminder record represents one private communication to one driver.
-- The included schedule rows are retained together for response/coverage handling.
ALTER TABLE weekend_monday_comms
  ADD COLUMN IF NOT EXISTS schedule_details JSONB;