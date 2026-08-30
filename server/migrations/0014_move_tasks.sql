-- Migration 0014: Move Task Library + Template Task Configuration
-- move_tasks: reusable atomic tasks (Task Library).
-- move_template_tasks: ordered, required-flagged join to move_templates.
--   conditionalConfig JSONB reserved for future conditional logic.

CREATE TABLE IF NOT EXISTS move_tasks (
  id                VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(255) NOT NULL,
  description       TEXT,
  category          VARCHAR(100),
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  default_required  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS move_template_tasks (
  id                 VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id        VARCHAR NOT NULL REFERENCES move_templates(id) ON DELETE CASCADE,
  task_id            VARCHAR NOT NULL REFERENCES move_tasks(id) ON DELETE CASCADE,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  is_required        BOOLEAN NOT NULL DEFAULT FALSE,
  conditional_config JSONB
);

CREATE UNIQUE INDEX IF NOT EXISTS move_template_tasks_template_task_unique
  ON move_template_tasks(template_id, task_id);
