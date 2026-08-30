-- One-time corrective Updated Alert audit envelope fields.
ALTER TABLE weekend_monday_comms
  ADD COLUMN IF NOT EXISTS email_to VARCHAR,
  ADD COLUMN IF NOT EXISTS email_bcc TEXT[],
  ADD COLUMN IF NOT EXISTS email_cc TEXT[];