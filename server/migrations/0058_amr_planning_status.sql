-- 0058_amr_planning_status.sql
-- Separates AMR Planning Status from Workflow Status.
-- Creates amr_phases table, adds planning_status / phase_id / first_scheduled_development_date
-- to tickets, and migrates existing on_roadmap tickets to planning_status=roadmapped.

-- ── 1. Planning status enum ────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE ticket_planning_status AS ENUM ('backlog', 'roadmapped', 'unscheduled', 'scheduled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. AMR Phases / Milestones table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS amr_phases (
  id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR(300) NOT NULL,
  description         TEXT,
  epic_id             VARCHAR REFERENCES epics(id) ON DELETE SET NULL,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  target_date         DATE,
  created_by_user_id  VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS amr_phases_epic_idx ON amr_phases(epic_id);

-- ── 3. New columns on tickets ──────────────────────────────────────────────
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS planning_status  ticket_planning_status;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS phase_id         VARCHAR REFERENCES amr_phases(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS first_scheduled_development_date DATE;

-- ── 4. Backfill original dev date from existing scheduled dev date ─────────
UPDATE tickets
SET first_scheduled_development_date = scheduled_development_date
WHERE scheduled_development_date IS NOT NULL
  AND first_scheduled_development_date IS NULL;

-- ── 5. Migrate existing on_roadmap tickets ─────────────────────────────────
-- Set workflow status → prioritizing, planning_status → roadmapped.
-- A work log entry is inserted for each ticket so history is fully preserved.
DO $$
DECLARE
  t             RECORD;
  sys_user_id   VARCHAR;
BEGIN
  SELECT id INTO sys_user_id FROM users WHERE email = 'will@driverondemand.co' LIMIT 1;

  FOR t IN SELECT id FROM tickets WHERE status = 'on_roadmap' LOOP
    UPDATE tickets
    SET planning_status       = 'roadmapped',
        status                = 'prioritizing',
        last_status_change_at = NOW(),
        updated_at            = NOW()
    WHERE id = t.id;

    INSERT INTO ticket_work_logs
      (id, ticket_id, work_date, note, status_from, status_to,
       created_by_user_id, created_by_username, created_at)
    VALUES (
      gen_random_uuid(), t.id, NOW()::date,
      'System migration: Workflow Status "Roadmap" separated into Planning Status = Roadmapped; Workflow Status reset to Prioritizing. Full history preserved.',
      'on_roadmap', 'prioritizing',
      sys_user_id, 'System', NOW()
    );
  END LOOP;
END $$;

-- ── 6. Indexes ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ticket_planning_status_idx ON tickets(planning_status);
CREATE INDEX IF NOT EXISTS ticket_phase_idx            ON tickets(phase_id);
