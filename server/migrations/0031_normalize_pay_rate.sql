-- =============================================================================
-- 0031_normalize_pay_rate.sql
-- Pay Rate Field Normalization — Recruiting Module
-- =============================================================================
--
-- BACKGROUND
-- Only recruiting_requests has a pay_rate column (NUMERIC(10,2)).
-- recruiting_campaigns stores its own financial context (budget, total_spend,
-- referral_bonus) but does NOT have a pay_rate column.
--
-- Since the column is already NUMERIC(10,2), PostgreSQL's type system ensures
-- only numeric values are stored; strings like "$17/hr" cannot be persisted.
-- Display-layer "/hr" formatting has been removed from the UI and emails in
-- the accompanying code changes (this migration handles the DB side).
--
-- This migration:
--   1. Audits recruiting_requests and emits a count report via RAISE NOTICE.
--   2. Flags any unexpected negative values for manual review.
--   3. Adds a non-negative CHECK constraint (idempotent, IF NOT EXISTS).
--
-- MIGRATION SAFETY
--   • No rows are modified — data is already numeric.
--   • Idempotent: safe to re-run.
--   • Records reviewed / converted / flagged are emitted to the migration log.
-- =============================================================================

DO $$
DECLARE
  v_total   INTEGER := 0;
  v_with    INTEGER := 0;
  v_without INTEGER := 0;
  v_neg     INTEGER := 0;
BEGIN
  SELECT COUNT(*)                                          INTO v_total   FROM recruiting_requests;
  SELECT COUNT(*) FILTER (WHERE pay_rate IS NOT NULL)      INTO v_with    FROM recruiting_requests;
  SELECT COUNT(*) FILTER (WHERE pay_rate IS NULL)          INTO v_without FROM recruiting_requests;
  SELECT COUNT(*) FILTER (WHERE pay_rate IS NOT NULL
                            AND pay_rate < 0)              INTO v_neg     FROM recruiting_requests;

  RAISE NOTICE '==== pay_rate normalization audit ====';
  RAISE NOTICE 'recruiting_requests : % total | % with pay_rate set | % without pay_rate',
    v_total, v_with, v_without;
  RAISE NOTICE 'Records reviewed  : %', v_total;
  RAISE NOTICE 'Records converted : 0 (column is already NUMERIC(10,2) — no text conversion required)';

  IF v_neg > 0 THEN
    RAISE WARNING 'MANUAL REVIEW REQUIRED: % record(s) have a negative pay_rate value. '
      'Query: SELECT id, pay_rate FROM recruiting_requests WHERE pay_rate < 0;',
      v_neg;
  ELSE
    RAISE NOTICE 'Records requiring manual review: 0';
  END IF;

  RAISE NOTICE '======================================';
END $$;

-- Add non-negative check constraint so future inserts/updates are enforced
-- at the database level, making it impossible to store negative pay rates.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
     WHERE constraint_name = 'chk_recruiting_requests_pay_rate_positive'
       AND constraint_schema = current_schema()
  ) THEN
    ALTER TABLE recruiting_requests
      ADD CONSTRAINT chk_recruiting_requests_pay_rate_positive
      CHECK (pay_rate IS NULL OR pay_rate >= 0);
    RAISE NOTICE 'Added CHECK constraint chk_recruiting_requests_pay_rate_positive';
  ELSE
    RAISE NOTICE 'CHECK constraint chk_recruiting_requests_pay_rate_positive already exists — skipping';
  END IF;
END $$;
