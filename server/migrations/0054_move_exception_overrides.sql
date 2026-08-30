-- migration: 0054_move_exception_overrides
-- purpose:   Per-move exception resolution tracking for Feature 4.1
--            Exception conditions are computed server-side from existing trip columns.
--            This table stores only user-driven resolution state (Open/Resolved).
--
-- Exception types supported:
--   ELIGIBILITY_FAIL  — eligibility_status IS NOT NULL AND NOT IN ('eligible','PASS')
--   MISSING_DRIVER    — driver_id IS NULL
--   MISSING_ACCOUNT   — customer_id IS NULL
--   CANCELLED         — status = 'Cancelled'
--   MISSING_MOVE_TYPE — move_type IS NULL OR move_type = ''

CREATE TABLE IF NOT EXISTS move_exception_overrides (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id         VARCHAR     NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  exception_type  VARCHAR     NOT NULL,
  status          VARCHAR     NOT NULL DEFAULT 'open',   -- open | resolved
  resolved_by     VARCHAR     REFERENCES users(id),
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_move_exception_override UNIQUE (trip_id, exception_type)
);

CREATE INDEX IF NOT EXISTS idx_move_exc_overrides_trip_id ON move_exception_overrides(trip_id);
CREATE INDEX IF NOT EXISTS idx_move_exc_overrides_status  ON move_exception_overrides(status);
