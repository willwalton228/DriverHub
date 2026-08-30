-- Migration 0037: Move Import — financial + source fields on trips table
-- Adds the columns needed when the Data Imports pipeline creates/updates trip records
-- from a RedCap Move Report import batch.

-- ── 1. Relax origin / destination NOT NULL so import-created trips need not supply them ──
ALTER TABLE trips ALTER COLUMN origin      DROP NOT NULL;
ALTER TABLE trips ALTER COLUMN destination DROP NOT NULL;

-- ── 2. New import-source identifier columns ─────────────────────────────────────
ALTER TABLE trips ADD COLUMN IF NOT EXISTS external_move_id  VARCHAR;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS source_system     VARCHAR;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS import_batch_id   VARCHAR REFERENCES data_import_batches(id) ON DELETE SET NULL;

-- ── 3. Time / effort fields ─────────────────────────────────────────────────────
ALTER TABLE trips ADD COLUMN IF NOT EXISTS move_minutes      INTEGER;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS move_hours        DECIMAL(10,4);

-- ── 4. Financial fields (all from RedCap Move Report columns) ───────────────────
ALTER TABLE trips ADD COLUMN IF NOT EXISTS customer_charges      DECIMAL(10,2);   -- Chg_Total
ALTER TABLE trips ADD COLUMN IF NOT EXISTS driver_pay            DECIMAL(10,2);   -- Pay_Total
ALTER TABLE trips ADD COLUMN IF NOT EXISTS driver_return_charges DECIMAL(10,2);   -- RT_Chg_Total

-- ── 5. Calculated / derived financial fields ────────────────────────────────────
ALTER TABLE trips ADD COLUMN IF NOT EXISTS revenue       DECIMAL(10,2);   -- = customer_charges
ALTER TABLE trips ADD COLUMN IF NOT EXISTS driver_cost   DECIMAL(10,2);   -- = driver_pay + driver_return_charges
-- gross_profit already exists on the table; gross_margin is new
ALTER TABLE trips ADD COLUMN IF NOT EXISTS gross_margin  DECIMAL(10,4);   -- gross_profit / revenue * 100

-- ── 6. Unique dedup index — prevents duplicate imports per source identifier ────
-- Partial index: only applies when both columns are non-null (import-created rows)
CREATE UNIQUE INDEX IF NOT EXISTS trips_external_move_id_source_system_idx
  ON trips (external_move_id, source_system)
  WHERE external_move_id IS NOT NULL AND source_system IS NOT NULL;

-- ── 7. Supporting indexes ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS trips_import_batch_id_idx ON trips (import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS trips_source_system_idx   ON trips (source_system)   WHERE source_system   IS NOT NULL;
