ALTER TABLE move_saved_views
  ADD COLUMN IF NOT EXISTS is_user_default boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS move_saved_views_one_user_default
  ON move_saved_views (user_id)
  WHERE is_user_default = true;

CREATE TABLE IF NOT EXISTS move_team_presets (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_name varchar,
  name varchar NOT NULL,
  description varchar,
  visibility varchar NOT NULL DEFAULT 'team',
  filter_move_number varchar,
  filter_driver varchar,
  filter_customer varchar,
  filter_status varchar,
  filter_move_type varchar,
  filter_source_system varchar,
  filter_start_date varchar,
  filter_end_date varchar,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS move_export_schedules (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar NOT NULL,
  recipients text NOT NULL,
  cron_expression varchar NOT NULL,
  cron_label varchar,
  timezone varchar NOT NULL DEFAULT 'America/Chicago',
  enabled boolean NOT NULL DEFAULT true,
  filter_move_number varchar,
  filter_driver varchar,
  filter_customer varchar,
  filter_status varchar,
  filter_move_type varchar,
  filter_source_system varchar,
  date_window varchar NOT NULL DEFAULT 'this_week',
  filter_start_date varchar,
  filter_end_date varchar,
  last_run_at timestamp,
  next_run_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS move_export_run_log (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id varchar NOT NULL REFERENCES move_export_schedules(id) ON DELETE CASCADE,
  ran_at timestamp NOT NULL DEFAULT now(),
  status varchar NOT NULL,
  row_count integer,
  truncated boolean,
  recipients text,
  error_message text
);