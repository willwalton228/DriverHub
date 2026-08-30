-- Migration 0050: Move Staging Scalability Indexes
-- Feature 1.3 — Import Performance & Validation (Moves Module Modernization Epic)
--
-- Adds indexes on partner_move_staging to support batch drilldown queries,
-- account/driver relationship lookups, and date-range filtering at scale.
-- Completes the Database Review requirement of Feature 1.3.

-- Batch-level drilldown (e.g. "show all staging rows for this import batch")
CREATE INDEX IF NOT EXISTS idx_pms_import_batch
  ON partner_move_staging(import_batch_id)
  WHERE import_batch_id IS NOT NULL;

-- Account relationship lookups (all staged moves for a given account)
CREATE INDEX IF NOT EXISTS idx_pms_matched_account
  ON partner_move_staging(matched_account_id)
  WHERE matched_account_id IS NOT NULL;

-- Driver relationship lookups (all staged moves for a given driver)
CREATE INDEX IF NOT EXISTS idx_pms_matched_driver
  ON partner_move_staging(matched_driver_id)
  WHERE matched_driver_id IS NOT NULL;

-- Date-range filtering on pickup date (Move Date equivalent for staged moves)
CREATE INDEX IF NOT EXISTS idx_pms_pickup_at
  ON partner_move_staging(pickup_at)
  WHERE pickup_at IS NOT NULL;

-- Validation status filter (quickly isolate warning/rejected rows)
CREATE INDEX IF NOT EXISTS idx_pms_validation_status
  ON partner_move_staging(validation_status)
  WHERE validation_status != 'valid';
