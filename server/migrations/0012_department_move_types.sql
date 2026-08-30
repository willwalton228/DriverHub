-- Migration 0012: Department Move Type Configuration
-- Per-department subset of the platform Move Type master list.
-- Each row links one Department to one Move Type, with a custom sort order
-- and an enabled/disabled flag. The same Move Type may be in many Departments.
-- Removing a row does NOT delete the Move Type from the master list.

CREATE TABLE IF NOT EXISTS department_move_types (
  id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id   VARCHAR NOT NULL REFERENCES account_departments(id) ON DELETE CASCADE,
  move_type_id    VARCHAR NOT NULL REFERENCES move_types(id) ON DELETE CASCADE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS dept_move_types_dept_move_unique
  ON department_move_types (department_id, move_type_id);
