-- Migration 0049: Standardize legacy move_type values in trips table
-- ─────────────────────────────────────────────────────────────────────────────
-- Background
-- ──────────
-- The move_type field was previously free-text, producing many spelling variants
-- of the two canonical values the UI now enforces: "DriverShift" and "DriverDash".
--
-- Known legacy variants → canonical mapping:
--   "drivershift" | "driver shift" | "driver-shift"   → "DriverShift"
--   "driverdash"  | "driver dash"  | "driver-dash"
--   | "dash"                                           → "DriverDash"
--
-- Unmapped values found in this database at migration time:
--   "DELIVERY"     (3 rows)  — not mappable to DriverShift or DriverDash;
--                              preserved as-is and logged below
--   "PICKUP"       (3 rows)  — same
--   "dealer_pickup" (1 row)  — same
--   "spot"          (1 row)  — same
--
-- These four values do not correspond to either canonical Move Type and have
-- been intentionally left unchanged pending a separate business decision on
-- how to classify them. They are surfaced via RAISE NOTICE so operators are
-- aware of their existence.
--
-- Idempotency
-- ───────────
-- The WHERE clauses exclude rows that are already canonical, so re-running this
-- migration is a safe no-op.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_shift_count  INTEGER;
  v_dash_count   INTEGER;
  v_unmapped     TEXT[];
BEGIN

  -- ── 1. Normalise DriverShift variants ────────────────────────────────────
  UPDATE trips
  SET    move_type = 'DriverShift'
  WHERE  lower(trim(move_type)) IN (
           'drivershift',
           'driver shift',
           'driver-shift'
         )
    AND  move_type <> 'DriverShift';

  GET DIAGNOSTICS v_shift_count = ROW_COUNT;

  -- ── 2. Normalise DriverDash variants ─────────────────────────────────────
  UPDATE trips
  SET    move_type = 'DriverDash'
  WHERE  lower(trim(move_type)) IN (
           'driverdash',
           'driver dash',
           'driver-dash',
           'dash'
         )
    AND  move_type <> 'DriverDash';

  GET DIAGNOSTICS v_dash_count = ROW_COUNT;

  -- ── 3. Report results ─────────────────────────────────────────────────────
  RAISE NOTICE '[0049] move_type standardisation complete — DriverShift updated: % row(s), DriverDash updated: % row(s)',
    v_shift_count, v_dash_count;

  -- ── 4. Log any remaining non-canonical, non-null values ──────────────────
  --   At migration time the following values were found and intentionally
  --   preserved (see header comments for details):
  --   DELIVERY, PICKUP, dealer_pickup, spot
  SELECT array_agg(DISTINCT move_type ORDER BY move_type)
  INTO   v_unmapped
  FROM   trips
  WHERE  move_type IS NOT NULL
    AND  move_type NOT IN ('DriverShift', 'DriverDash');

  IF v_unmapped IS NOT NULL AND array_length(v_unmapped, 1) > 0 THEN
    RAISE NOTICE '[0049] Non-canonical move_type values preserved as-is (require explicit business mapping before they can be classified): %',
      array_to_string(v_unmapped, ', ');
  ELSE
    RAISE NOTICE '[0049] All non-null move_type values are now canonical.';
  END IF;

END $$;
