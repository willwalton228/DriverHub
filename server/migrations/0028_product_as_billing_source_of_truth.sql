-- Migration: 0028_product_as_billing_source_of_truth
-- Makes Product the source of truth for all billable charges.
-- 1. Removes NOT NULL from service_type (backwards-compatible — field deprecated).
-- 2. Adds product-snapshot columns so every charge carries a denormalized copy of the
--    billing attributes at the time of creation.  These are set by the server on insert
--    and never edited by users.
-- 3. Removes NOT NULL from invoice_line_candidates.service_type (legacy draft table).

-- ── billable_charges ───────────────────────────────────────────────────────────
ALTER TABLE billable_charges
  ALTER COLUMN service_type DROP NOT NULL;

ALTER TABLE billable_charges
  ADD COLUMN IF NOT EXISTS product_name               TEXT,
  ADD COLUMN IF NOT EXISTS billing_category           VARCHAR(100),
  ADD COLUMN IF NOT EXISTS product_type_snapshot      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS billing_frequency_snapshot VARCHAR(100),
  ADD COLUMN IF NOT EXISTS unit_of_measure            VARCHAR(100),
  ADD COLUMN IF NOT EXISTS gl_code                    VARCHAR(100);

-- Back-fill product_name for charges that already have a product linked
UPDATE billable_charges bc
SET    product_name = p.name
FROM   products p
WHERE  p.id = bc.product_id
  AND  bc.product_name IS NULL;

-- ── invoice_line_candidates (legacy draft table) ───────────────────────────────
ALTER TABLE invoice_line_candidates
  ALTER COLUMN service_type DROP NOT NULL;
