-- 0005_ops_map_coords.sql
-- Add lat/lng storage to drivers and employees for Operations Map

ALTER TABLE drivers   ADD COLUMN IF NOT EXISTS latitude  DECIMAL(10,7);
ALTER TABLE drivers   ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7);

ALTER TABLE employees ADD COLUMN IF NOT EXISTS latitude  DECIMAL(10,7);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7);
