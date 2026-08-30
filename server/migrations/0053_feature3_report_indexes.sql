-- Migration 0053: Feature 3.1 — move_report_views table
--               + Feature 3.2 — Driver Intelligence query indexes
--
-- move_report_views is a dedicated table, completely independent from
-- move_saved_views. The UNIQUE(user_id, name) constraint is scoped only to
-- report views; Move List views and Report views can share the same name
-- without overwriting each other.

-- ── Feature 3.1: Move Report Views ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS move_report_views (
  id          varchar      PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  user_id     varchar      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        varchar(200) NOT NULL,
  filters     jsonb        NOT NULL DEFAULT '{}',
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_move_report_views_user_name ON move_report_views(user_id, name);
CREATE        INDEX IF NOT EXISTS idx_move_report_views_user      ON move_report_views(user_id);

-- ── Feature 3.2: accidents indexes ───────────────────────────────────────────
-- No existing indexes on driver_id or incident_date were found in migrations.
CREATE INDEX IF NOT EXISTS idx_accidents_driver_id       ON accidents(driver_id);
CREATE INDEX IF NOT EXISTS idx_accidents_incident_date   ON accidents(incident_date)             WHERE incident_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accidents_driver_incident ON accidents(driver_id, incident_date)  WHERE incident_date IS NOT NULL;

-- ── Feature 3.2: wiw_attendance_rows indexes ─────────────────────────────────
-- Existing indexes: import_run_id, notice_date, notice_type, match_status.
-- Missing: wiw_user_id (the join key for per-driver queries).
CREATE INDEX IF NOT EXISTS idx_wiw_attendance_wiw_user_id ON wiw_attendance_rows(wiw_user_id)              WHERE wiw_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wiw_attendance_user_date   ON wiw_attendance_rows(wiw_user_id, notice_date) WHERE wiw_user_id IS NOT NULL;
