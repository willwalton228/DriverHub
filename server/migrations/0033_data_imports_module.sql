-- Migration 0033: Data Imports Module
-- Centralized import tracking for all external data ingestion into DriverHub

CREATE TABLE data_import_batches (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  import_type VARCHAR(50) NOT NULL,           -- 'move_report' | 'driver_return' | 'accounts' | 'drivers' | 'invoices' | 'payments' | 'claims' | 'scheduling'
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER,
  file_storage_key TEXT,                       -- Replit Object Storage key (starts with .private/)
  file_hash VARCHAR(64),                       -- SHA-256 hex for duplicate detection
  reporting_period_start DATE,
  reporting_period_end DATE,
  imported_by_user_id VARCHAR NOT NULL,
  records_read INTEGER NOT NULL DEFAULT 0,
  records_imported INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  records_skipped INTEGER NOT NULL DEFAULT 0,
  validation_error_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'uploaded',   -- uploaded | validating | ready_for_import | importing | imported | completed_with_warnings | failed
  column_headers JSONB,                             -- Detected column names from the file
  field_mapping JSONB,                              -- User-confirmed or auto-detected column → field mapping
  validation_result JSONB,                          -- { errors: [...], warnings: [...], summary: {...} }
  import_result JSONB,                              -- { created: N, updated: N, skipped: N, errors: [...] }
  error_message TEXT,
  notes TEXT,
  validated_at TIMESTAMP WITH TIME ZONE,
  imported_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE data_import_staged_rows (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  batch_id VARCHAR NOT NULL REFERENCES data_import_batches(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  raw_data JSONB NOT NULL,                -- Original row as key/value from Excel
  mapped_data JSONB,                      -- Normalized/mapped values
  validation_status VARCHAR(20) DEFAULT 'pending',  -- pending | valid | warning | error
  validation_errors JSONB,               -- Array of { field, message, severity }
  import_status VARCHAR(20) DEFAULT 'pending',      -- pending | imported | updated | skipped | failed
  import_error TEXT,
  linked_record_id VARCHAR,              -- ID of the record created/updated in target table
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dib_import_type   ON data_import_batches(import_type);
CREATE INDEX idx_dib_status        ON data_import_batches(status);
CREATE INDEX idx_dib_created_at    ON data_import_batches(created_at DESC);
CREATE INDEX idx_dib_imported_by   ON data_import_batches(imported_by_user_id);
CREATE INDEX idx_disr_batch_id     ON data_import_staged_rows(batch_id);
CREATE INDEX idx_disr_batch_status ON data_import_staged_rows(batch_id, validation_status);
