-- Migration 0017: Driver Referral Codes & Achievements

ALTER TABLE recruiting_referrals
  ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS campaign_source VARCHAR(50);

CREATE INDEX IF NOT EXISTS recruiting_referrals_refcode_idx
  ON recruiting_referrals(referral_code);

CREATE TABLE IF NOT EXISTS driver_referral_codes (
  id         VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id  VARCHAR NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  code       VARCHAR(20) NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX IF NOT EXISTS driver_referral_codes_active_driver_idx
  ON driver_referral_codes(driver_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS driver_referral_codes_code_idx
  ON driver_referral_codes(code);

CREATE TABLE IF NOT EXISTS driver_achievements (
  id               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id        VARCHAR NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  achievement_type VARCHAR(50) NOT NULL,
  period_key       VARCHAR(20),
  earned_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  metadata         JSONB
);

CREATE UNIQUE INDEX IF NOT EXISTS driver_achievements_unique_idx
  ON driver_achievements(driver_id, achievement_type, COALESCE(period_key, ''));

CREATE INDEX IF NOT EXISTS driver_achievements_driver_idx
  ON driver_achievements(driver_id);
