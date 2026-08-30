-- Dispatch-confirmed No Show Monitor actions. This is an audit ledger for the
-- WIW-backed monitor and intentionally does not mutate WIW or legacy schedules.
CREATE TABLE IF NOT EXISTS scheduling_manual_no_show_actions (
  id              varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  wiw_shift_id    varchar NOT NULL,
  driver_id       varchar NOT NULL REFERENCES drivers(id) ON DELETE RESTRICT,
  account_id      varchar REFERENCES customers(id) ON DELETE SET NULL,
  shift_start_at  timestamptz NOT NULL,
  marked_by       varchar NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  marked_at       timestamptz NOT NULL DEFAULT now(),
  source          varchar NOT NULL DEFAULT 'Dispatch No Show Monitor',
  note            text
);

CREATE UNIQUE INDEX IF NOT EXISTS scheduling_manual_noshow_shift_driver_idx
  ON scheduling_manual_no_show_actions (wiw_shift_id, driver_id);

CREATE INDEX IF NOT EXISTS scheduling_manual_noshow_driver_idx
  ON scheduling_manual_no_show_actions (driver_id);

CREATE INDEX IF NOT EXISTS scheduling_manual_noshow_marked_at_idx
  ON scheduling_manual_no_show_actions (marked_at);