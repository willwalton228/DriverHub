-- DH-002248: DriverHub-owned non-standard holidays and special closure dates.

CREATE TABLE IF NOT EXISTS holiday_operation_special_dates (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  holiday_code VARCHAR(96) NOT NULL UNIQUE,
  holiday_name VARCHAR(128) NOT NULL,
  holiday_date DATE NOT NULL,
  holiday_year INTEGER NOT NULL,
  applies_to_all_accounts BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_by_user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT holiday_operation_special_dates_year_ck
    CHECK (holiday_year = EXTRACT(YEAR FROM holiday_date))
);

CREATE INDEX IF NOT EXISTS holiday_operation_special_dates_year_idx
  ON holiday_operation_special_dates (holiday_year, holiday_date);

CREATE TABLE IF NOT EXISTS holiday_operation_special_date_accounts (
  special_date_id VARCHAR NOT NULL REFERENCES holiday_operation_special_dates(id) ON DELETE CASCADE,
  account_id VARCHAR NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (special_date_id, account_id)
);