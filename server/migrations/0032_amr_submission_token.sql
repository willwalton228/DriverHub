-- Migration 0032: Add submission_token to tickets for idempotent AMR creation
-- A nullable unique column — NULL entries are never considered duplicates in Postgres,
-- so existing rows are unaffected. Only one ticket can exist per non-null token.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS submission_token VARCHAR(64);

-- Partial unique index: only enforced when submission_token IS NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS tickets_submission_token_unique
  ON tickets (submission_token)
  WHERE submission_token IS NOT NULL;
