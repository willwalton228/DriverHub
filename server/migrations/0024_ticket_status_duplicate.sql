-- Migration 0024: Add "duplicate" terminal status to AMR workflow
-- Duplicate AMRs remain in the database for audit purposes but are excluded
-- from all dashboards, reports, metrics, and standard list views by default.
-- Only authorized administrators may assign or remove this status.

ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'duplicate';
