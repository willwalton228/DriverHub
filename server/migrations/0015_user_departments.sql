-- Migration 0015: User Department Assignments
-- Multi-department membership per DriverHub / DoD user.
-- Controls visibility within Driver on Demand; reporting filters respect this table.
-- Driver assignments are a separate concern — not managed here.

CREATE TABLE IF NOT EXISTS user_departments (
  id                 VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id      VARCHAR NOT NULL REFERENCES account_departments(id) ON DELETE CASCADE,
  granted_by_user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  granted_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_departments_user_dept_unique
  ON user_departments(user_id, department_id);

-- Index for fast per-department user lookups (reporting, visibility checks)
CREATE INDEX IF NOT EXISTS user_departments_dept_idx
  ON user_departments(department_id);
