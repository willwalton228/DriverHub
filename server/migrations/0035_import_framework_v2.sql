-- Migration 0035: Import Framework v2
-- Adds source system registry, period tracking, reconciliation runs,
-- and record-level deduplication / correction support.

-- ── Source System Registry ─────────────────────────────────────────────────────
CREATE TABLE import_source_systems (
  id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  source_key    VARCHAR(50) UNIQUE NOT NULL,
  display_name  VARCHAR(100) NOT NULL,
  import_types  TEXT[] NOT NULL DEFAULT '{}',
  parser_config JSONB,               -- column-name overrides, date format, etc.
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO import_source_systems (source_key, display_name, import_types) VALUES
  ('redcap',  'RedCap',       ARRAY['move_report','driver_return']),
  ('uber',    'Uber',         ARRAY['move_report','driver_return']),
  ('manual',  'Manual Entry', ARRAY['move_report','driver_return','accounts','drivers','invoices']);

-- ── Import Periods ─────────────────────────────────────────────────────────────
-- One row per (period_start, period_end, import_type, source_system_key).
-- Groups all batches that contribute to the same logical dataset.
CREATE TABLE import_periods (
  id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  import_type           VARCHAR(50) NOT NULL,
  source_system_key     VARCHAR(50) NOT NULL,
  received_batch_count  INTEGER NOT NULL DEFAULT 0,
  latest_batch_id       VARCHAR,               -- updated on each new batch
  reconciliation_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- pending | partial | complete | conflict
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(period_start, period_end, import_type, source_system_key)
);

CREATE INDEX idx_ip_period         ON import_periods(period_start, period_end);
CREATE INDEX idx_ip_import_type    ON import_periods(import_type);
CREATE INDEX idx_ip_source_system  ON import_periods(source_system_key);

-- ── Reconciliation Runs ────────────────────────────────────────────────────────
-- Stores results of cross-source comparison for a reporting period.
CREATE TABLE import_reconciliation_runs (
  id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  import_type     VARCHAR(50) NOT NULL,
  sources         TEXT[] NOT NULL DEFAULT '{}',
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  run_by          VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  result_summary  JSONB,
  result_detail   JSONB,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_irr_period      ON import_reconciliation_runs(period_start, period_end);
CREATE INDEX idx_irr_import_type ON import_reconciliation_runs(import_type);

-- ── Extend data_import_batches ────────────────────────────────────────────────
ALTER TABLE data_import_batches
  ADD COLUMN source_system_key   VARCHAR(50) NOT NULL DEFAULT 'redcap',
  ADD COLUMN period_id           VARCHAR REFERENCES import_periods(id) ON DELETE SET NULL,
  ADD COLUMN batch_mode          VARCHAR(20) NOT NULL DEFAULT 'supplement',
  -- supplement: upsert by record key (default for daily imports & late arrivals)
  -- correction: supersede old records, insert new ones (revised files)
  -- reprocess:  re-run only failed/skipped rows from an existing batch
  ADD COLUMN supersedes_batch_id VARCHAR REFERENCES data_import_batches(id) ON DELETE SET NULL,
  ADD COLUMN parent_batch_id     VARCHAR REFERENCES data_import_batches(id) ON DELETE SET NULL;

CREATE INDEX idx_dib_source_system ON data_import_batches(source_system_key);
CREATE INDEX idx_dib_period_id     ON data_import_batches(period_id);

-- ── Extend move_report_entries ────────────────────────────────────────────────
ALTER TABLE move_report_entries
  ADD COLUMN source_system_key      VARCHAR(50) NOT NULL DEFAULT 'redcap',
  ADD COLUMN is_superseded          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN superseded_by_entry_id VARCHAR;

-- Record-level dedup: one active entry per (trip_id, source_system).
-- Uses a partial index so superseded rows are invisible to the constraint.
CREATE UNIQUE INDEX idx_mre_active_dedup
  ON move_report_entries(redcap_trip_id, source_system_key)
  WHERE is_superseded = FALSE AND redcap_trip_id IS NOT NULL;

CREATE INDEX idx_mre_source_system ON move_report_entries(source_system_key);
CREATE INDEX idx_mre_is_superseded ON move_report_entries(is_superseded);

-- ── Extend driver_return_entries ──────────────────────────────────────────────
ALTER TABLE driver_return_entries
  ADD COLUMN source_system_key      VARCHAR(50) NOT NULL DEFAULT 'redcap',
  ADD COLUMN is_superseded          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN superseded_by_entry_id VARCHAR;

CREATE UNIQUE INDEX idx_dre_active_dedup
  ON driver_return_entries(redcap_id, source_system_key)
  WHERE is_superseded = FALSE AND redcap_id IS NOT NULL;

CREATE INDEX idx_dre_source_system ON driver_return_entries(source_system_key);
CREATE INDEX idx_dre_is_superseded ON driver_return_entries(is_superseded);
