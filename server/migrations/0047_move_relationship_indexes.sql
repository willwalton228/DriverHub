-- Migration 0047: Add indexes for Move → Account and Move → Driver relationship lookups
-- These support Account Moves tab, Driver Moves tab, and DriverReturn joins at query time.

CREATE INDEX IF NOT EXISTS idx_trips_customer_id ON trips(customer_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver_id ON trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_return_entries_linked_trip_id ON driver_return_entries(linked_trip_id);
