-- Migration 0038: Import Source Configs
-- Adds import_source_configs — connection parameters and field-mapping config
-- for every data source that feeds the import pipeline.
--
-- Design principle:
--   Each row describes ONE source of truth for one import type.
--   Swapping from spreadsheet → SQL Server means:
--     INSERT a new row with config_type = 'sql_server'
--     (set the old excel_csv row is_active = false)
--   The validation, entity-mapping, and domain-write layers are untouched.
--
-- Supported config_type values (extensible):
--   excel_csv   — file upload (existing path; adapter wraps parseBuffer)
--   sql_server  — direct SQL Server query via the SqlServerAdapter
--   csv_url     — HTTP/HTTPS CSV fetch via the CsvUrlAdapter
--   api         — future: generic REST/GraphQL adapter

CREATE TABLE import_source_configs (
  id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,

  -- Identity
  name                  VARCHAR(100)  NOT NULL,
  description           TEXT,

  -- What this config produces
  import_type           VARCHAR(50)   NOT NULL,   -- 'move_report' | 'driver_return' | 'uber_transaction' | …
  source_system_key     VARCHAR(50)   NOT NULL     -- FK to import_source_systems.source_key
                          REFERENCES import_source_systems(source_key) ON DELETE RESTRICT,

  -- Which adapter handles this source
  config_type           VARCHAR(30)   NOT NULL,   -- 'excel_csv' | 'sql_server' | 'csv_url' | 'api'

  -- Adapter connection parameters (schema varies by config_type; see adapter docs)
  -- Secrets (passwords, tokens) are NEVER stored here — only the env-var name.
  connection_config     JSONB         NOT NULL DEFAULT '{}',

  -- Column-name translation: source column → canonical pipeline header
  -- Example: { "trip_id": "TripId", "dealer_name": "Dealer" }
  -- Columns absent from the map pass through unchanged.
  field_map             JSONB         NOT NULL DEFAULT '{}',

  -- Default behaviour
  batch_mode            VARCHAR(20)   NOT NULL DEFAULT 'supplement',  -- 'supplement' | 'correction' | 'reprocess'
  default_period_days   INTEGER               DEFAULT 30,  -- window used when no explicit dateFrom/dateTo provided

  -- Lifecycle
  is_active             BOOLEAN       NOT NULL DEFAULT TRUE,

  -- Future: cron expression for scheduled auto-sync (e.g. '0 6 * * *')
  schedule_cron         VARCHAR(100),

  -- Sync tracking
  last_synced_at        TIMESTAMP WITH TIME ZONE,
  last_batch_id         VARCHAR       REFERENCES data_import_batches(id) ON DELETE SET NULL,
  last_sync_row_count   INTEGER,
  last_sync_status      VARCHAR(30),  -- mirrors data_import_batches.status at sync completion

  -- Audit
  created_by            VARCHAR       REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_isc_import_type     ON import_source_configs(import_type);
CREATE INDEX idx_isc_source_system   ON import_source_configs(source_system_key);
CREATE INDEX idx_isc_config_type     ON import_source_configs(config_type);
CREATE INDEX idx_isc_is_active       ON import_source_configs(is_active);

-- Seed: excel_csv configs for the two existing active source types
-- (represent the current file-upload flow as explicit adapter configs)
INSERT INTO import_source_configs (name, import_type, source_system_key, config_type, connection_config, field_map, batch_mode)
SELECT
  'RedCap Move Report (Excel)',
  'move_report',
  'redcap',
  'excel_csv',
  '{}'::jsonb,
  '{}'::jsonb,
  'supplement'
WHERE EXISTS (SELECT 1 FROM import_source_systems WHERE source_key = 'redcap');

INSERT INTO import_source_configs (name, import_type, source_system_key, config_type, connection_config, field_map, batch_mode)
SELECT
  'RedCap Driver Return (Excel)',
  'driver_return',
  'redcap',
  'excel_csv',
  '{}'::jsonb,
  '{}'::jsonb,
  'supplement'
WHERE EXISTS (SELECT 1 FROM import_source_systems WHERE source_key = 'redcap');
