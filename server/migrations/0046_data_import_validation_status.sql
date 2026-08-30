-- Migration 0046: Add validation_status to data_import_batches
-- Separates batch lifecycle status (where the batch is in the workflow) from
-- validation outcome (whether the file content passed validation).
-- This eliminates the confusing case where a batch shows "Failed" on the list
-- but "Valid" inside the Validation Report.

ALTER TABLE data_import_batches
  ADD COLUMN IF NOT EXISTS validation_status varchar(30) NOT NULL DEFAULT 'not_validated';

-- Backfill: derive validation_status from existing status and validation_error_count
UPDATE data_import_batches SET validation_status =
  CASE
    -- Batches that moved past validation with zero errors → fully valid
    WHEN status IN ('ready_for_import', 'importing', 'imported', 'completed_with_warnings')
         AND validation_error_count = 0
      THEN 'valid'
    -- Batches that moved past validation with some errors → valid with warnings
    WHEN status IN ('ready_for_import', 'importing', 'imported', 'completed_with_warnings')
         AND validation_error_count > 0
      THEN 'valid_with_warnings'
    -- Explicit validation data-quality failure
    WHEN status = 'validation_failed'
      THEN 'validation_failed'
    -- Processing error that occurred AFTER validation ran (validated_at is populated)
    WHEN status = 'processing_error' AND validated_at IS NOT NULL
      THEN CASE
             WHEN validation_error_count = 0
               THEN 'valid'
             WHEN records_read > 0 AND validation_error_count >= records_read
               THEN 'validation_failed'
             ELSE 'valid_with_warnings'
           END
    -- Uploaded / validating / failed without validated_at / unvalidated processing errors
    ELSE 'not_validated'
  END;
