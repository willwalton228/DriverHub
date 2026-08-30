-- Migration: 0002_driver_sms_readiness
-- Ticket:    2 — Driver Phone Normalization and SMS Validation Readiness
-- Applied:   2026-04-06
-- Purpose:   Add SMS normalization and eligibility tracking columns to the
--            drivers table. All columns are nullable / have safe defaults so
--            this migration is fully non-destructive on existing data.
--            Backfill is performed separately by the phone normalization script.
-- ─────────────────────────────────────────────────────────────────────────────

-- E.164 representation of the driver's mobile phone number.
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS mobile_phone_normalized VARCHAR;

-- Structural validity flag (format check only — not a carrier lookup).
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS mobile_phone_is_valid BOOLEAN DEFAULT false;

-- True only when mobile_phone_is_valid = true (and opt-out not set).
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS sms_eligible BOOLEAN DEFAULT false;

-- Populated whenever sms_eligible = false.
-- Values: missing_phone | too_short | too_long | invalid_format | unrecognized_format
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS sms_invalid_reason VARCHAR;

-- Timestamp of the most recent normalization pass on this record.
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS last_phone_validation_at TIMESTAMPTZ;

-- Future: explicit opt-in / opt-out tracking (not enforced in Ticket 2 logic).
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS sms_opt_in_status VARCHAR DEFAULT 'unknown';

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS sms_opt_in_updated_at TIMESTAMPTZ;

-- Index to allow fast queries for SMS-eligible drivers.
CREATE INDEX IF NOT EXISTS idx_drivers_sms_eligible
  ON drivers (sms_eligible)
  WHERE sms_eligible = true;

-- Index to allow fast queries by invalid reason for monitoring dashboards.
CREATE INDEX IF NOT EXISTS idx_drivers_sms_invalid_reason
  ON drivers (sms_invalid_reason)
  WHERE sms_invalid_reason IS NOT NULL;
