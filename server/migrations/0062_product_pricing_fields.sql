-- Migration 0062: Add cost, effectiveDate, and priceBook to products
-- Supports the full Pricing tab: cost basis, gross margin computation,
-- pricing effective date, and price book classification.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cost            numeric(12, 2),
  ADD COLUMN IF NOT EXISTS effective_date  date,
  ADD COLUMN IF NOT EXISTS price_book      varchar(100);
