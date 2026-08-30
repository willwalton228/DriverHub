-- Migration 0042: Add shift_bill_rate to customers table (DH-001167)
-- Adds a standard hourly billing rate field for DriverShift services at the account level.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS shift_bill_rate DECIMAL(10, 2);
