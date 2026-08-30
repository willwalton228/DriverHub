-- Add the four operational integration modules to the AMR ticket enum.
-- Idempotent so the migration can be safely retried.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'stripe_integration'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ticket_module')
  ) THEN
    ALTER TYPE ticket_module ADD VALUE 'stripe_integration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'uber_integration'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ticket_module')
  ) THEN
    ALTER TYPE ticket_module ADD VALUE 'uber_integration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'lyft_integration'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ticket_module')
  ) THEN
    ALTER TYPE ticket_module ADD VALUE 'lyft_integration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'screening_integration'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ticket_module')
  ) THEN
    ALTER TYPE ticket_module ADD VALUE 'screening_integration';
  END IF;
END
$$;