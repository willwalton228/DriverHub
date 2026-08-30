-- DH-002201: preserve Driver ↔ Account assignment intervals in the existing
-- authoritative junction table. Open rows are current assignments; closed
-- rows are historical assignments.

ALTER TABLE driver_accounts
  ADD COLUMN IF NOT EXISTS assignment_started_at date,
  ADD COLUMN IF NOT EXISTS assignment_ended_at date,
  ADD COLUMN IF NOT EXISTS assignment_end_reason varchar;

-- The previous unique key allowed only one lifetime relationship. Remove it so
-- a later reassignment can create a new interval for the same pair.
DROP INDEX IF EXISTS driver_accounts_driver_account_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS driver_accounts_open_driver_account_uidx
  ON driver_accounts (driver_id, account_id)
  WHERE assignment_ended_at IS NULL;

CREATE INDEX IF NOT EXISTS driver_accounts_history_driver_idx
  ON driver_accounts (driver_id, assignment_started_at, assignment_ended_at);

CREATE INDEX IF NOT EXISTS driver_accounts_history_account_idx
  ON driver_accounts (account_id, assignment_started_at, assignment_ended_at);

-- Close open assignments when a driver becomes non-operational. Reactivation
-- deliberately does not reopen history; a new current assignment is explicit.
CREATE OR REPLACE FUNCTION close_driver_account_assignments_on_driver_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF lower(coalesce(NEW.status, '')) IN ('inactive', 'terminated') THEN
    UPDATE driver_accounts
       SET assignment_ended_at = COALESCE(
             assignment_ended_at,
             CASE
               WHEN lower(coalesce(NEW.status, '')) = 'terminated'
                 THEN COALESCE(NEW.termination_date, CURRENT_DATE)
               ELSE COALESCE(NEW.inactive_date, CURRENT_DATE)
             END
           ),
           assignment_end_reason = COALESCE(
             assignment_end_reason,
             CASE
               WHEN lower(coalesce(NEW.status, '')) = 'terminated'
                 THEN 'driver_terminated'
               ELSE 'driver_inactive'
             END
           ),
           is_primary = false
     WHERE driver_id = NEW.id
       AND assignment_ended_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS close_driver_account_assignments_on_driver_status
  ON drivers;

CREATE TRIGGER close_driver_account_assignments_on_driver_status
AFTER UPDATE OF status, termination_date, inactive_date ON drivers
FOR EACH ROW
EXECUTE FUNCTION close_driver_account_assignments_on_driver_status();

-- Pending/onboarding accounts are eligible for current assignment selection.
-- All other account states close open operational assignments.
CREATE OR REPLACE FUNCTION close_driver_account_assignments_on_account_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF lower(coalesce(NEW.status, '')) NOT IN ('active', 'pending', 'onboarding') THEN
    UPDATE driver_accounts
       SET assignment_ended_at = COALESCE(assignment_ended_at, COALESCE(NEW.cancellation_date, CURRENT_DATE)),
           assignment_end_reason = COALESCE(assignment_end_reason, 'account_inactivated'),
           is_primary = false
     WHERE account_id = NEW.id
       AND assignment_ended_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS close_driver_account_assignments_on_account_status
  ON customers;

CREATE TRIGGER close_driver_account_assignments_on_account_status
AFTER UPDATE OF status, cancellation_date ON customers
FOR EACH ROW
EXECUTE FUNCTION close_driver_account_assignments_on_account_status();
