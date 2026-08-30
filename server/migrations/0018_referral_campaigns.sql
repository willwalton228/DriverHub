-- Migration 0018: Referral Campaign Manager
-- Creates tables for configurable referral campaigns, milestones, and milestone progress tracking

CREATE TABLE IF NOT EXISTS referral_campaigns (
  id               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(200) NOT NULL,
  description      TEXT,
  status           VARCHAR(20)  NOT NULL DEFAULT 'draft',
  is_featured      BOOLEAN      NOT NULL DEFAULT FALSE,
  banner_color     VARCHAR(20)  DEFAULT '#FF6B35',
  start_date       DATE,
  end_date         DATE,
  eligible_driver_types  TEXT[] NOT NULL DEFAULT '{}',
  eligible_markets       TEXT[] NOT NULL DEFAULT '{}',
  eligible_networks      TEXT[] NOT NULL DEFAULT '{}',
  target_positions       TEXT[] NOT NULL DEFAULT '{}',
  created_by       VARCHAR,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_campaigns_status_idx ON referral_campaigns(status);
CREATE INDEX IF NOT EXISTS referral_campaigns_featured_idx ON referral_campaigns(is_featured) WHERE is_featured = TRUE;

CREATE TABLE IF NOT EXISTS referral_campaign_milestones (
  id                        VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id               VARCHAR NOT NULL REFERENCES referral_campaigns(id) ON DELETE CASCADE,
  name                      VARCHAR(200) NOT NULL,
  trigger_type              VARCHAR(60)  NOT NULL,
  trigger_value             INTEGER,
  trigger_custom_description TEXT,
  reward_amount             NUMERIC(10,2) NOT NULL,
  payment_timing            VARCHAR(50)   NOT NULL DEFAULT 'immediate',
  sort_order                INTEGER       NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_campaign_milestones_campaign_idx ON referral_campaign_milestones(campaign_id);

CREATE TABLE IF NOT EXISTS referral_milestone_progress (
  id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id         VARCHAR NOT NULL REFERENCES recruiting_referrals(id) ON DELETE CASCADE,
  campaign_id         VARCHAR NOT NULL REFERENCES referral_campaigns(id),
  milestone_id        VARCHAR NOT NULL REFERENCES referral_campaign_milestones(id),
  referrer_driver_id  VARCHAR,
  achieved_at         TIMESTAMPTZ,
  reward_amount       NUMERIC(10,2) NOT NULL,
  payment_status      VARCHAR(20)   NOT NULL DEFAULT 'pending',
  paid_at             TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(referral_id, milestone_id)
);

CREATE INDEX IF NOT EXISTS referral_milestone_progress_referral_idx  ON referral_milestone_progress(referral_id);
CREATE INDEX IF NOT EXISTS referral_milestone_progress_driver_idx     ON referral_milestone_progress(referrer_driver_id);
CREATE INDEX IF NOT EXISTS referral_milestone_progress_campaign_idx   ON referral_milestone_progress(campaign_id);
CREATE INDEX IF NOT EXISTS referral_milestone_progress_status_idx     ON referral_milestone_progress(payment_status);
