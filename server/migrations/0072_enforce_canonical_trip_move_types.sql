-- Move Type is a single operational classification, not a free-text service label.
-- Existing migrations normalized historical values; blanks remain allowed for untyped moves.
UPDATE trips
SET move_type = NULL
WHERE move_type IS NOT NULL
  AND btrim(move_type) = '';

ALTER TABLE trips
  ADD CONSTRAINT trips_move_type_canonical_check
  CHECK (move_type IS NULL OR move_type IN ('DriverShift', 'DriverDash'));