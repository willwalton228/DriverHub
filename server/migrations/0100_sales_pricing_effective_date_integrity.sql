-- Correct the Phase 1 effective-dating model for databases that already applied 0099.
-- No production pricing tables or columns are referenced.

ALTER TABLE sales_pricing_markets
  DROP CONSTRAINT IF EXISTS sales_pricing_markets_current_rate_fk;
ALTER TABLE sales_pricing_markets
  DROP COLUMN IF EXISTS current_rate_version_id;

ALTER TABLE sales_pricing_account_treatments
  DROP CONSTRAINT IF EXISTS sales_pricing_account_treatments_account_id_effective_date_key;
ALTER TABLE sales_pricing_account_treatments
  DROP CONSTRAINT IF EXISTS sales_pricing_treatment_account_effective_uidx;

DO $$ BEGIN
  ALTER TABLE sales_pricing_account_treatments
    ADD CONSTRAINT sales_pricing_treatment_account_market_effective_uidx
      UNIQUE (account_id, market_id, effective_date);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE sales_pricing_account_treatments
    ADD CONSTRAINT sales_pricing_treatment_date_window_check
      CHECK (expiration_date IS NULL OR expiration_date >= effective_date);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE sales_pricing_account_overrides
    ADD CONSTRAINT sales_pricing_override_date_window_check
      CHECK (expiration_date IS NULL OR expiration_date >= effective_date);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;