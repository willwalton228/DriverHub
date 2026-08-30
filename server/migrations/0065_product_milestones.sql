-- Migration 0065: Product Milestones and Milestone Deliverables
-- Adds a planning layer above Epics so major product objectives, deadlines,
-- and high-level deliverables can be established independently of AMR tickets.
-- Hierarchy: Product Milestone → Epic → Phase → AMR

CREATE TABLE IF NOT EXISTS product_milestones (
  id                  varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name                varchar(500) NOT NULL,
  description         text,
  target_date         date,
  status              varchar(50) NOT NULL DEFAULT 'not_started',
  owner_user_id       varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id  varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS milestone_deliverables (
  id                    varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  milestone_id          varchar(36) NOT NULL REFERENCES product_milestones(id) ON DELETE CASCADE,
  name                  varchar(500) NOT NULL,
  target_date           date,
  completed_date        date,
  completed_by_user_id  varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  status                varchar(50) NOT NULL DEFAULT 'not_started',
  notes                 text,
  epic_id               varchar(36) REFERENCES epics(id) ON DELETE SET NULL,
  sort_order            integer NOT NULL DEFAULT 0,
  created_by_user_id    varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_milestone_deliverables_milestone_id ON milestone_deliverables(milestone_id);
CREATE INDEX IF NOT EXISTS idx_milestone_deliverables_epic_id      ON milestone_deliverables(epic_id);
