-- Migration 0008: Account Departments
-- Account-owned organizational structure used to organize Move Types, reporting,
-- permissions, and future operational settings.

CREATE TABLE IF NOT EXISTS account_departments (
  id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          VARCHAR NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  code                VARCHAR(50),
  description         TEXT,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  is_default          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by_user_id  VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id  VARCHAR REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS account_departments_account_name_unique
  ON account_departments (account_id, name);

CREATE INDEX IF NOT EXISTS idx_account_departments_account_id
  ON account_departments (account_id);

-- Backfill: give every existing account a default active department so that
-- the "at least one active department per account" invariant holds from day one.
INSERT INTO account_departments (account_id, name, code, description, sort_order, is_active, is_default)
SELECT c.id, 'General', 'GEN', 'Default department created during Department Management rollout.', 0, TRUE, TRUE
FROM customers c
WHERE NOT EXISTS (
  SELECT 1 FROM account_departments d WHERE d.account_id = c.id
);
