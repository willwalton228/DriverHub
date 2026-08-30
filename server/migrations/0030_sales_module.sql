-- Migration: 0030_sales_module
-- Adds 'sales' to the ticket_module PostgreSQL enum.
-- Idempotent: safe to run multiple times.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'sales'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ticket_module')
  ) THEN
    ALTER TYPE ticket_module ADD VALUE 'sales';
  END IF;
END
$$;
