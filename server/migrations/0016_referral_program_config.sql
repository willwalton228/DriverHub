-- Migration 0016: Referral Program Configuration
-- Adds referral_program_config table and expands candidate_source enum
-- with the full recruiting source framework.

-- ── 1. Expand candidate_source enum ──────────────────────────────────────────
-- PostgreSQL requires individual ALTER TYPE statements; each is idempotent via
-- the DO block guard.

DO $$ BEGIN
  ALTER TYPE candidate_source ADD VALUE IF NOT EXISTS 'driver_referral';
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TYPE candidate_source ADD VALUE IF NOT EXISTS 'employee_referral';
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TYPE candidate_source ADD VALUE IF NOT EXISTS 'ziprecruiter';
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TYPE candidate_source ADD VALUE IF NOT EXISTS 'nextdoor';
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TYPE candidate_source ADD VALUE IF NOT EXISTS 'military_org';
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TYPE candidate_source ADD VALUE IF NOT EXISTS 'community_college';
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TYPE candidate_source ADD VALUE IF NOT EXISTS 'cdl_school';
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TYPE candidate_source ADD VALUE IF NOT EXISTS 'rehire';
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TYPE candidate_source ADD VALUE IF NOT EXISTS 'recruiter_sourced';
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TYPE candidate_source ADD VALUE IF NOT EXISTS 'linkedin';
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TYPE candidate_source ADD VALUE IF NOT EXISTS 'glassdoor';
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 2. Add referrer_driver_id to recruiting_referrals ────────────────────────
-- Separate FK to drivers table (distinct from the referrer_id user FK) so
-- MoveNow Mobile can submit referrals on behalf of a driver entity.

ALTER TABLE recruiting_referrals
  ADD COLUMN IF NOT EXISTS referrer_driver_id VARCHAR REFERENCES drivers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referred_city       VARCHAR,
  ADD COLUMN IF NOT EXISTS referred_state      VARCHAR,
  ADD COLUMN IF NOT EXISTS referred_driver_type VARCHAR,  -- 'shift' | 'ondemand' | 'hybrid'
  ADD COLUMN IF NOT EXISTS referred_years_exp  INTEGER,
  ADD COLUMN IF NOT EXISTS referred_has_cdl    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS referred_employer   VARCHAR,
  ADD COLUMN IF NOT EXISTS consent_to_share    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS source_system       VARCHAR DEFAULT 'driverhub', -- 'driverhub' | 'movenow_mobile' | 'api'
  ADD COLUMN IF NOT EXISTS auto_candidate_created BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_candidate_created_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS recruiting_referrals_driver_idx
  ON recruiting_referrals(referrer_driver_id);

CREATE INDEX IF NOT EXISTS recruiting_referrals_source_system_idx
  ON recruiting_referrals(source_system);

-- ── 3. Referral Program Configuration ────────────────────────────────────────
-- One active configuration row at a time (enforced by is_active + unique idx).
-- Stores bonus milestones as JSONB for flexibility.

CREATE TABLE IF NOT EXISTS referral_program_config (
  id                      VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Program identity
  name                    VARCHAR NOT NULL DEFAULT 'Default Referral Program',
  description             TEXT,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,

  -- Global on/off switch and required fields
  program_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  require_consent         BOOLEAN NOT NULL DEFAULT TRUE,
  require_phone           BOOLEAN NOT NULL DEFAULT FALSE,
  require_city_state      BOOLEAN NOT NULL DEFAULT FALSE,
  require_driver_type     BOOLEAN NOT NULL DEFAULT FALSE,

  -- Dedupe rules
  dedupe_period_months    INTEGER NOT NULL DEFAULT 6,
  allow_self_referral     BOOLEAN NOT NULL DEFAULT FALSE,

  -- Bonus milestones — JSON array of:
  -- { trigger: string, label: string, amount: numeric, currency: string, auto_trigger: boolean }
  -- trigger values: 'submitted'|'interviewed'|'hired'|'30_day'|'60_day'|'90_day'
  bonus_milestones        JSONB NOT NULL DEFAULT '[
    {"trigger":"submitted",   "label":"Referral Submitted",       "amount":0,   "currency":"USD","auto_trigger":false},
    {"trigger":"interviewed", "label":"Interview Completed",      "amount":0,   "currency":"USD","auto_trigger":false},
    {"trigger":"hired",       "label":"Driver Hired",             "amount":500, "currency":"USD","auto_trigger":true},
    {"trigger":"30_day",      "label":"Driver Completes 30 Days", "amount":250, "currency":"USD","auto_trigger":true},
    {"trigger":"90_day",      "label":"Driver Completes 90 Days", "amount":250, "currency":"USD","auto_trigger":true}
  ]'::jsonb,

  -- Eligibility
  eligible_sources        JSONB DEFAULT '["driver_referral"]'::jsonb,
  eligible_roles          JSONB DEFAULT '["driver"]'::jsonb,
  min_tenure_days         INTEGER DEFAULT 0,

  -- Notification preferences
  notify_on_submission    BOOLEAN NOT NULL DEFAULT TRUE,
  notify_on_status_change BOOLEAN NOT NULL DEFAULT TRUE,
  notify_on_reward_earned BOOLEAN NOT NULL DEFAULT TRUE,

  -- Metadata
  created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by              VARCHAR,
  updated_by              VARCHAR
);

-- Only one active program config at a time
CREATE UNIQUE INDEX IF NOT EXISTS referral_program_config_active_idx
  ON referral_program_config(is_active)
  WHERE is_active = TRUE;

-- Insert default config if none exists
INSERT INTO referral_program_config (name, description)
SELECT 'Default Referral Program', 'Driver referral program with standard milestone bonuses'
WHERE NOT EXISTS (SELECT 1 FROM referral_program_config);

-- ── 4. Referral outbound events (for MoveNow Mobile / Driver on Demand) ──────
-- Append-only event log. External systems poll or webhook-receive these.

CREATE TABLE IF NOT EXISTS referral_outbound_events (
  id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id     VARCHAR NOT NULL REFERENCES recruiting_referrals(id) ON DELETE CASCADE,
  event_type      VARCHAR NOT NULL,  -- 'status_changed'|'reward_earned'|'reward_paid'|'candidate_created'
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Delivery tracking per consumer
  consumed_by_mnm       BOOLEAN DEFAULT FALSE,
  consumed_by_mnm_at    TIMESTAMP,
  consumed_by_dod       BOOLEAN DEFAULT FALSE,
  consumed_by_dod_at    TIMESTAMP,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_outbound_events_referral_idx
  ON referral_outbound_events(referral_id);

CREATE INDEX IF NOT EXISTS referral_outbound_events_type_idx
  ON referral_outbound_events(event_type);

CREATE INDEX IF NOT EXISTS referral_outbound_events_unconsumed_mnm_idx
  ON referral_outbound_events(created_at)
  WHERE consumed_by_mnm = FALSE;

CREATE INDEX IF NOT EXISTS referral_outbound_events_unconsumed_dod_idx
  ON referral_outbound_events(created_at)
  WHERE consumed_by_dod = FALSE;
