-- Add deleted column to wiw_sync_runs to track reconcile soft-delete counts
ALTER TABLE wiw_sync_runs ADD COLUMN IF NOT EXISTS deleted integer NOT NULL DEFAULT 0;
