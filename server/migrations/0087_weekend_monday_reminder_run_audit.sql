-- DH-002053: retain the execution origin for every durable reminder delivery.
-- This makes a scheduler run, manual rerun, or second app instance auditable.

ALTER TABLE weekend_monday_comms
  ADD COLUMN IF NOT EXISTS run_id VARCHAR,
  ADD COLUMN IF NOT EXISTS trigger_source VARCHAR;

ALTER TABLE weekend_monday_comm_deliveries
  ADD COLUMN IF NOT EXISTS last_run_id VARCHAR,
  ADD COLUMN IF NOT EXISTS last_trigger_source VARCHAR;

CREATE INDEX IF NOT EXISTS weekend_monday_comms_run_id_idx
  ON weekend_monday_comms (run_id);
CREATE INDEX IF NOT EXISTS weekend_monday_comm_delivery_last_run_idx
  ON weekend_monday_comm_deliveries (last_run_id);