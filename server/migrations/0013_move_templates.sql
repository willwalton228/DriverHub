-- Migration 0013: Move Execution Templates
-- Reusable platform-wide templates that define how a move should be executed.
-- Multiple templates may exist for the same Move Type.
-- Version number field supports future versioning workflows.

CREATE TABLE IF NOT EXISTS move_templates (
  id                              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name                            VARCHAR(255) NOT NULL,
  description                     TEXT,
  is_active                       BOOLEAN NOT NULL DEFAULT TRUE,
  version_number                  INTEGER NOT NULL DEFAULT 1,
  move_type_id                    VARCHAR REFERENCES move_types(id) ON DELETE SET NULL,
  default_transportation_method_id VARCHAR REFERENCES transportation_methods(id) ON DELETE SET NULL,
  created_at                      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by_user_id              VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id              VARCHAR REFERENCES users(id) ON DELETE SET NULL
);
