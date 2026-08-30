-- DH-002344: persist the reason and actor metadata for the claim-level
-- "No Police Involvement" decision. The existing police_report_waived boolean
-- is retained as the single toggle so no competing bypass rule is introduced.

ALTER TABLE accidents
  ADD COLUMN IF NOT EXISTS police_report_waived_reason text,
  ADD COLUMN IF NOT EXISTS police_report_waived_by_user_id varchar
    REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS police_report_waived_at timestamp;

ALTER TABLE accidents
  ALTER COLUMN police_report_waived SET DEFAULT false;

UPDATE accidents
SET police_report_waived = false
WHERE police_report_waived IS NULL;

ALTER TABLE accidents
  ALTER COLUMN police_report_waived SET NOT NULL;