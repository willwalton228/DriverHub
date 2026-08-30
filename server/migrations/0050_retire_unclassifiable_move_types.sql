-- Migration 0050: Retire unclassifiable legacy move_type values
-- ─────────────────────────────────────────────────────────────────────────────
-- After migration 0049 normalised all known DriverShift/DriverDash spelling
-- variants, the following non-canonical move_type values remained in the
-- trips table with no deterministic mapping to either canonical value:
--
--   DELIVERY      (3 rows)
--   PICKUP        (3 rows)
--   dealer_pickup (1 row)
--   spot          (1 row)
--
-- These legacy values pre-date the DriverShift / DriverDash product model and
-- cannot be reliably reclassified without business-owner input.  Setting them
-- to NULL retires them cleanly: they will appear as untyped moves rather than
-- being silently misclassified, and they will not pollute Move Type filters or
-- move-type-based reports.
--
-- Idempotency: the WHERE clause matches only the specific legacy strings, so
-- re-running this migration against an already-clean dataset is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_retired_count INTEGER;
  v_remaining     TEXT[];
BEGIN

  -- ── Retire values that cannot be classified as DriverShift or DriverDash ──
  UPDATE trips
  SET    move_type = NULL
  WHERE  move_type IS NOT NULL
    AND  move_type NOT IN ('DriverShift', 'DriverDash');

  GET DIAGNOSTICS v_retired_count = ROW_COUNT;

  RAISE NOTICE '[0050] Retired (set to NULL) % non-canonical move_type row(s)', v_retired_count;

  -- ── Verify no non-canonical values remain ────────────────────────────────
  SELECT array_agg(DISTINCT move_type ORDER BY move_type)
  INTO   v_remaining
  FROM   trips
  WHERE  move_type IS NOT NULL
    AND  move_type NOT IN ('DriverShift', 'DriverDash');

  IF v_remaining IS NOT NULL AND array_length(v_remaining, 1) > 0 THEN
    RAISE EXCEPTION '[0050] Post-migration check failed — unexpected non-canonical move_type values still present: %',
      array_to_string(v_remaining, ', ');
  ELSE
    RAISE NOTICE '[0050] Post-migration check passed — all non-null move_type values are now canonical.';
  END IF;

END $$;
