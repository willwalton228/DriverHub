-- Migration 0066: Milestone Deliverable Multi-Epic and Direct AMR Links
-- Expands Product Milestones so each Deliverable can reference multiple Epics
-- and have individual AMRs linked directly (without requiring an Epic).
-- Avoids double-counting in progress roll-up via UNION de-duplication.

-- Junction: one Deliverable → many Epics
CREATE TABLE IF NOT EXISTS milestone_deliverable_epics (
  id                varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  deliverable_id    varchar(36) NOT NULL REFERENCES milestone_deliverables(id) ON DELETE CASCADE,
  epic_id           varchar(36) NOT NULL REFERENCES epics(id) ON DELETE CASCADE,
  linked_at         timestamptz NOT NULL DEFAULT now(),
  linked_by_user_id varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT uq_mde_deliverable_epic UNIQUE (deliverable_id, epic_id)
);

CREATE INDEX IF NOT EXISTS idx_mde_deliverable_id ON milestone_deliverable_epics(deliverable_id);
CREATE INDEX IF NOT EXISTS idx_mde_epic_id        ON milestone_deliverable_epics(epic_id);

-- Seed from legacy single-epic FK on milestone_deliverables
INSERT INTO milestone_deliverable_epics (deliverable_id, epic_id)
SELECT id, epic_id
FROM milestone_deliverables
WHERE epic_id IS NOT NULL
ON CONFLICT (deliverable_id, epic_id) DO NOTHING;

-- Junction: one Deliverable → many directly-linked AMR tickets
CREATE TABLE IF NOT EXISTS milestone_deliverable_amrs (
  id                varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  deliverable_id    varchar(36) NOT NULL REFERENCES milestone_deliverables(id) ON DELETE CASCADE,
  ticket_id         varchar(36) NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  linked_at         timestamptz NOT NULL DEFAULT now(),
  linked_by_user_id varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT uq_mda_deliverable_ticket UNIQUE (deliverable_id, ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_mda_deliverable_id ON milestone_deliverable_amrs(deliverable_id);
CREATE INDEX IF NOT EXISTS idx_mda_ticket_id      ON milestone_deliverable_amrs(ticket_id);
