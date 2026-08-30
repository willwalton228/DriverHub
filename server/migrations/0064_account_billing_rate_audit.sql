-- Migration 0064: Account Billing Rate Audit Log
-- Creates the audit table required by DH-002073 (Account Billing Rate Management View).
-- Every pricing change made from either the centralized billing-rate view or
-- the individual Account Services & Billing tab is recorded here.
--
-- The shiftBillRate migration (customers.shift_bill_rate → account_service_rates)
-- is triggered separately via the admin endpoint POST /api/accounts/billing-rates/migrate-shift-rates.

CREATE TABLE IF NOT EXISTS account_billing_rate_audit (
  id              varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  rate_id         varchar(36),                        -- account_service_rates.id (nullable for migrated legacy records)
  account_id      varchar(36) NOT NULL,               -- customers.id
  product_id      varchar(36),                        -- products.id
  position_id     varchar(36),                        -- account_service_positions.id
  account_name    varchar(255),                       -- snapshot at time of change
  product_name    varchar(255),                       -- snapshot
  position_name   varchar(255),                       -- snapshot
  previous_rate   numeric(12, 2),
  new_rate        numeric(12, 2),
  changed_by      varchar(36),                        -- users.id
  changed_by_name varchar(255),                       -- snapshot
  changed_at      timestamptz NOT NULL DEFAULT now(),
  change_source   varchar(50) NOT NULL DEFAULT 'direct',  -- direct | migrated | import | api
  notes           text
);

CREATE INDEX IF NOT EXISTS idx_abra_account_id  ON account_billing_rate_audit(account_id);
CREATE INDEX IF NOT EXISTS idx_abra_rate_id     ON account_billing_rate_audit(rate_id);
CREATE INDEX IF NOT EXISTS idx_abra_changed_at  ON account_billing_rate_audit(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_abra_changed_by  ON account_billing_rate_audit(changed_by);
