-- Phase 4 No Show Monitor lifecycle fields and immutable action history.
-- The existing one-row-per-WIW-shift/driver table remains the current exception
-- record and its unique key remains the duplicate-prevention boundary.
ALTER TABLE scheduling_manual_no_show_actions
  ALTER COLUMN marked_by DROP NOT NULL;

ALTER TABLE scheduling_manual_no_show_actions
  ADD COLUMN IF NOT EXISTS grace_period_end_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_detected_not_clocked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS status varchar NOT NULL DEFAULT 'CONFIRMED_NO_SHOW',
  ADD COLUMN IF NOT EXISTS action varchar,
  ADD COLUMN IF NOT EXISTS action_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS contact_attempt varchar,
  ADD COLUMN IF NOT EXISTS contact_result varchar,
  ADD COLUMN IF NOT EXISTS final_disposition varchar,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS scheduling_no_show_action_history (
  id                                      varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_id                             varchar NOT NULL REFERENCES scheduling_manual_no_show_actions(id) ON DELETE CASCADE,
  wiw_shift_id                             varchar NOT NULL,
  driver_id                                varchar NOT NULL REFERENCES drivers(id) ON DELETE RESTRICT,
  account_id                               varchar REFERENCES customers(id) ON DELETE SET NULL,
  scheduled_start_at                       timestamptz NOT NULL,
  grace_period_end_at                      timestamptz NOT NULL,
  first_detected_not_clocked_in_at         timestamptz,
  dispatch_user                            varchar REFERENCES users(id) ON DELETE SET NULL,
  action                                   varchar NOT NULL,
  action_timestamp                         timestamptz NOT NULL DEFAULT now(),
  contact_attempt                          varchar,
  contact_result                           varchar,
  final_disposition                        varchar,
  notes                                    text
);

CREATE INDEX IF NOT EXISTS scheduling_no_show_history_exception_idx
  ON scheduling_no_show_action_history (exception_id, action_timestamp);

CREATE INDEX IF NOT EXISTS scheduling_no_show_history_shift_driver_idx
  ON scheduling_no_show_action_history (wiw_shift_id, driver_id, action_timestamp);

UPDATE scheduling_manual_no_show_actions
SET
  grace_period_end_at = COALESCE(grace_period_end_at, shift_start_at + INTERVAL '3 minutes'),
  first_detected_not_clocked_in_at = COALESCE(first_detected_not_clocked_in_at, marked_at),
  action = COALESCE(action, 'MARK_NO_SHOW'),
  action_timestamp = COALESCE(action_timestamp, marked_at),
  final_disposition = COALESCE(final_disposition, 'Confirmed No Show'),
  updated_at = COALESCE(updated_at, marked_at);