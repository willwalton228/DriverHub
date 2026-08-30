-- Migration 0048: Indexes for Move List page server-side filtering and sorting
-- These support the high-density operational workspace with server-side pagination.

CREATE INDEX IF NOT EXISTS idx_trips_status    ON trips(status)    WHERE status    IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trips_move_type ON trips(move_type) WHERE move_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trips_trip_date ON trips(trip_date) WHERE trip_date IS NOT NULL;
