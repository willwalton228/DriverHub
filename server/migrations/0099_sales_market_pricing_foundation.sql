-- DriverHub Sales Market Pricing Phase 1.
-- This is an isolated administration/reference model. It deliberately has no
-- triggers or foreign keys into production billing, booking, trip, or payroll pricing.

CREATE TABLE IF NOT EXISTS sales_pricing_markets (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name varchar(120) NOT NULL,
  state varchar(2) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive')),
  created_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  updated_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, state)
);

CREATE TABLE IF NOT EXISTS sales_pricing_market_rate_versions (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  market_id varchar(36) NOT NULL REFERENCES sales_pricing_markets(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  shift_hourly_rate numeric(12,4) NOT NULL CHECK (shift_hourly_rate >= 0),
  effective_date date NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  published_at timestamptz,
  UNIQUE (market_id, version)
);
CREATE INDEX IF NOT EXISTS sales_pricing_rate_market_effective_idx
  ON sales_pricing_market_rate_versions(market_id, effective_date DESC);

CREATE TABLE IF NOT EXISTS sales_pricing_company_rule_versions (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  version integer NOT NULL UNIQUE,
  status varchar(16) NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'superseded')),
  effective_date date NOT NULL,
  shift_multiplier numeric(8,4) NOT NULL,
  dd_standard_multiplier numeric(8,4) NOT NULL,
  dd_preferred_multiplier numeric(8,4) NOT NULL,
  dd_preferred_plus_multiplier numeric(8,4) NOT NULL,
  preferred_threshold integer NOT NULL CHECK (preferred_threshold >= 0),
  preferred_plus_threshold integer NOT NULL CHECK (preferred_plus_threshold >= preferred_threshold),
  shift_opportunity_threshold integer NOT NULL CHECK (shift_opportunity_threshold >= preferred_plus_threshold),
  new_account_days integer NOT NULL CHECK (new_account_days >= 0),
  created_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  published_at timestamptz
);
INSERT INTO sales_pricing_company_rule_versions (
  version, status, effective_date, shift_multiplier, dd_standard_multiplier,
  dd_preferred_multiplier, dd_preferred_plus_multiplier, preferred_threshold,
  preferred_plus_threshold, shift_opportunity_threshold, new_account_days,
  published_at
) VALUES (1, 'published', CURRENT_DATE, 1.0000, 1.2500, 1.2000, 1.1500, 50, 100, 125, 90, now())
ON CONFLICT (version) DO NOTHING;

CREATE TABLE IF NOT EXISTS sales_pricing_account_treatments (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  account_id varchar(36) NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  market_id varchar(36) NOT NULL REFERENCES sales_pricing_markets(id) ON DELETE RESTRICT,
  treatment varchar(24) NOT NULL CHECK (treatment IN ('automatic', 'approval_required', 'contract_locked')),
  effective_date date NOT NULL,
  expiration_date date,
  notes text,
  created_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  ended_at timestamptz,
  CONSTRAINT sales_pricing_treatment_date_window_check
    CHECK (expiration_date IS NULL OR expiration_date >= effective_date),
  CONSTRAINT sales_pricing_treatment_account_market_effective_uidx
    UNIQUE (account_id, market_id, effective_date)
);
CREATE INDEX IF NOT EXISTS sales_pricing_treatment_market_idx
  ON sales_pricing_account_treatments(market_id, account_id, effective_date DESC);

CREATE TABLE IF NOT EXISTS sales_pricing_account_overrides (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  account_id varchar(36) NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  market_id varchar(36) NOT NULL REFERENCES sales_pricing_markets(id) ON DELETE RESTRICT,
  override_type varchar(20) NOT NULL CHECK (override_type IN ('rate', 'multiplier', 'rate_and_multiplier')),
  override_rate numeric(12,4),
  override_multiplier numeric(8,4),
  reason text NOT NULL,
  effective_date date NOT NULL,
  expiration_date date,
  authorized_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  CHECK (override_rate IS NOT NULL OR override_multiplier IS NOT NULL),
  CONSTRAINT sales_pricing_override_date_window_check
    CHECK (expiration_date IS NULL OR expiration_date >= effective_date)
);
CREATE INDEX IF NOT EXISTS sales_pricing_override_account_idx
  ON sales_pricing_account_overrides(account_id, effective_date DESC);

CREATE TABLE IF NOT EXISTS sales_pricing_rate_applications (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  market_rate_version_id varchar(36) NOT NULL REFERENCES sales_pricing_market_rate_versions(id) ON DELETE RESTRICT,
  application_mode varchar(24) NOT NULL CHECK (application_mode IN ('new_only', 'all_eligible', 'selected_existing')),
  explicitly_confirmed boolean NOT NULL CHECK (explicitly_confirmed),
  confirmed_at timestamptz NOT NULL,
  published_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  affected_count integer NOT NULL DEFAULT 0 CHECK (affected_count >= 0),
  preview_snapshot jsonb NOT NULL,
  UNIQUE (market_rate_version_id)
);

CREATE TABLE IF NOT EXISTS sales_pricing_rate_application_targets (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  application_id varchar(36) NOT NULL REFERENCES sales_pricing_rate_applications(id) ON DELETE RESTRICT,
  account_id varchar(36) NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  treatment_snapshot varchar(24) NOT NULL,
  UNIQUE (application_id, account_id)
);

CREATE TABLE IF NOT EXISTS sales_pricing_audit_log (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  action varchar(80) NOT NULL,
  actor_user_id varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  actor_email varchar(320) NOT NULL,
  market_id varchar(36) REFERENCES sales_pricing_markets(id) ON DELETE SET NULL,
  old_value jsonb,
  new_value jsonb,
  effective_date date,
  application_mode varchar(24),
  affected_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_pricing_audit_created_idx ON sales_pricing_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS sales_pricing_audit_market_idx ON sales_pricing_audit_log(market_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_sales_pricing_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'sales_pricing_audit_log is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS sales_pricing_audit_append_only ON sales_pricing_audit_log;
CREATE TRIGGER sales_pricing_audit_append_only
  BEFORE UPDATE OR DELETE ON sales_pricing_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_sales_pricing_audit_mutation();