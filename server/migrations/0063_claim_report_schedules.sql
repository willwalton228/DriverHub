-- Migration 0063: Claim Report Schedules
-- Stores schedule configuration for recurring Claims reports (e.g. Weekly Loss Accrual).
-- One row per report_type. Recipients stored as a JSONB array of email strings.

CREATE TABLE IF NOT EXISTS claim_report_schedules (
  id              serial PRIMARY KEY,
  report_type     varchar(50)  NOT NULL UNIQUE,
  enabled         boolean      NOT NULL DEFAULT false,
  day_of_week     varchar(10)  NOT NULL DEFAULT 'monday',
  delivery_time   varchar(5)   NOT NULL DEFAULT '08:00',
  recipients      jsonb        NOT NULL DEFAULT '[]'::jsonb,
  email_subject   varchar(255) NOT NULL DEFAULT 'Weekly Loss Accrual Report - {{date}}',
  report_format   varchar(10)  NOT NULL DEFAULT 'csv',
  last_sent_at    timestamptz,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now()
);

-- Delivery attempt log for audit trail
CREATE TABLE IF NOT EXISTS claim_report_delivery_log (
  id              serial PRIMARY KEY,
  report_type     varchar(50)  NOT NULL,
  sent_at         timestamptz  NOT NULL DEFAULT now(),
  recipients      jsonb        NOT NULL DEFAULT '[]'::jsonb,
  status          varchar(20)  NOT NULL DEFAULT 'sent',   -- sent | failed
  error_message   text,
  claim_count     integer,
  total_exposure  numeric(14,2)
);

-- Seed default loss_accrual schedule (disabled until admin configures recipients)
INSERT INTO claim_report_schedules (report_type, enabled, day_of_week, delivery_time, recipients, email_subject, report_format)
VALUES ('loss_accrual', false, 'monday', '08:00', '[]'::jsonb, 'Weekly Loss Accrual Report - {{date}}', 'csv')
ON CONFLICT (report_type) DO NOTHING;
