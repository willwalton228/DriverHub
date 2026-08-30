-- Candidate foundation: preserve the future Candidate → Hiring/Activation → Driver
-- relationship without creating or activating Drivers from Recruiting.
ALTER TABLE recruiting_candidates
  ADD COLUMN IF NOT EXISTS driver_id varchar
  REFERENCES drivers(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS recruiting_candidates_driver_id_idx
  ON recruiting_candidates(driver_id);