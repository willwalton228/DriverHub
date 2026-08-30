-- Migration 0019: Referral Program Settings (permanent program-level rules)
CREATE TABLE IF NOT EXISTS referral_program_settings (
  id                        VARCHAR PRIMARY KEY DEFAULT 'default',
  is_active                 BOOLEAN      NOT NULL DEFAULT TRUE,
  default_bonus_amount      NUMERIC(10,2),
  duplicate_rule            VARCHAR(50)  NOT NULL DEFAULT 'first_referrer_wins',
  ownership_rule            VARCHAR(50)  NOT NULL DEFAULT 'first_contact',
  reward_approval_required  BOOLEAN      NOT NULL DEFAULT FALSE,
  auto_notify_driver        BOOLEAN      NOT NULL DEFAULT TRUE,
  default_payment_timing    VARCHAR(50)  NOT NULL DEFAULT 'immediate',
  tax_handling_notes        TEXT,
  eligibility_notes         TEXT,
  default_milestones        JSONB        NOT NULL DEFAULT '[]',
  updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by                VARCHAR
);

INSERT INTO referral_program_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
