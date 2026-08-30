-- Migration 0009: Account Department Business Configuration
-- Adds per-department operational settings that inherit from the parent
-- Account unless explicitly overridden (timezone, business hours, holiday
-- calendar), plus optional accounting fields and future placeholders.

ALTER TABLE account_departments
  ADD COLUMN IF NOT EXISTS timezone VARCHAR,
  ADD COLUMN IF NOT EXISTS business_hours TEXT,
  ADD COLUMN IF NOT EXISTS use_account_holiday_calendar BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS custom_holidays JSONB,
  ADD COLUMN IF NOT EXISTS cost_center VARCHAR,
  ADD COLUMN IF NOT EXISTS gl_code VARCHAR,
  ADD COLUMN IF NOT EXISTS default_promise_model VARCHAR,
  ADD COLUMN IF NOT EXISTS spend_approval_threshold DECIMAL(10, 2);
