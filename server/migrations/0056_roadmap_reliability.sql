-- migration: 0056_roadmap_reliability
-- purpose:   Add first_scheduled_deployment_date to tickets.
--            This column stores the *immutable* committed deployment date —
--            the date that was in place when scheduledDeploymentDate was first
--            assigned. It is set once and never overwritten, so roadmap
--            reliability cannot be gamed by moving the target date after a miss.
--
--            Backfill: for any ticket that already has a scheduled_deployment_date,
--            copy it as the committed baseline (best available without history).

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS first_scheduled_deployment_date DATE;

UPDATE tickets
SET first_scheduled_deployment_date = scheduled_deployment_date
WHERE first_scheduled_deployment_date IS NULL
  AND scheduled_deployment_date IS NOT NULL;
