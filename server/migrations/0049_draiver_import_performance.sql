-- Migration 0049: Draiver Import Performance & Validation
-- Feature 1.3 — Import Performance & Validation (Moves Module Modernization Epic)
--
-- Adds processing duration tracking and indexes that eliminate per-row DB calls.

-- Track when processing started and total wall-clock duration
ALTER TABLE draiver_import_batches
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS processing_duration_ms INTEGER;

-- Composite index for the setRawResult UPDATE pattern:
--   WHERE import_batch_id = $batchId AND row_number = $rowNum
-- Without this, each setRawResult call does a full scan of all rows in the batch.
CREATE INDEX IF NOT EXISTS idx_pdr_raw_batch_row
  ON partner_daily_report_raw(import_batch_id, row_number);

-- Index to accelerate the bulk staging pre-fetch:
--   WHERE itinerary_id IN (...) AND source_system = 'DRAIVER'
-- Supports future multi-source queries alongside the existing unique btree on itinerary_id.
CREATE INDEX IF NOT EXISTS idx_pms_source_itinerary
  ON partner_move_staging(source_system, itinerary_id);
