-- DH-002248: DriverHub-owned Holiday Operations records and communication/audit trail.

CREATE TABLE IF NOT EXISTS holiday_operations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  account_id VARCHAR NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  holiday_code VARCHAR(64) NOT NULL,
  holiday_name VARCHAR(128) NOT NULL,
  holiday_date DATE NOT NULL,
  holiday_year INTEGER NOT NULL,
  operating_status VARCHAR(32) NOT NULL DEFAULT 'unconfirmed'
    CHECK (operating_status IN ('unconfirmed', 'open', 'modified_hours', 'closed')),
  opening_time TIME,
  closing_time TIME,
  timezone VARCHAR(100) NOT NULL DEFAULT 'America/Chicago',
  confirmation_source VARCHAR(64),
  confirmed_by_user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  confirmed_by_contact_id VARCHAR REFERENCES account_contacts(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  last_modified_by_user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  last_modified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  recipient_contact_id VARCHAR REFERENCES account_contacts(id) ON DELETE SET NULL,
  communication_status VARCHAR(32) NOT NULL DEFAULT 'not_sent'
    CHECK (communication_status IN ('not_sent', 'sent', 'responded', 'missing_recipient', 'failed')),
  communication_failure_type VARCHAR(64),
  reopened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT holiday_operations_account_holiday_year_uk UNIQUE (account_id, holiday_code, holiday_year),
  CONSTRAINT holiday_operations_modified_hours_ck CHECK (
    (operating_status = 'modified_hours' AND opening_time IS NOT NULL AND closing_time IS NOT NULL AND opening_time < closing_time)
    OR operating_status <> 'modified_hours'
  )
);

CREATE INDEX IF NOT EXISTS holiday_operations_holiday_idx
  ON holiday_operations (holiday_year, holiday_code, operating_status);
CREATE INDEX IF NOT EXISTS holiday_operations_account_idx
  ON holiday_operations (account_id, holiday_date);

CREATE TABLE IF NOT EXISTS holiday_operations_audit (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  holiday_operation_id VARCHAR NOT NULL REFERENCES holiday_operations(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  previous_status VARCHAR(32),
  new_status VARCHAR(32),
  opening_time TIME,
  closing_time TIME,
  notes TEXT,
  actor_user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  responding_contact_id VARCHAR REFERENCES account_contacts(id) ON DELETE SET NULL,
  confirmation_source VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS holiday_operations_audit_operation_idx
  ON holiday_operations_audit (holiday_operation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS holiday_operations_communications (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  holiday_operation_id VARCHAR NOT NULL REFERENCES holiday_operations(id) ON DELETE CASCADE,
  contact_id VARCHAR REFERENCES account_contacts(id) ON DELETE SET NULL,
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  communication_type VARCHAR(32) NOT NULL DEFAULT 'confirmation_request',
  sent_at TIMESTAMPTZ,
  sender_mailbox VARCHAR(255),
  delivery_status VARCHAR(32) NOT NULL,
  failure_type VARCHAR(64),
  provider_message TEXT,
  response_status VARCHAR(32),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS holiday_operations_comms_operation_idx
  ON holiday_operations_communications (holiday_operation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS holiday_operations_response_tokens (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  holiday_operation_id VARCHAR NOT NULL REFERENCES holiday_operations(id) ON DELETE CASCADE,
  contact_id VARCHAR REFERENCES account_contacts(id) ON DELETE SET NULL,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS holiday_operations_response_tokens_active_idx
  ON holiday_operations_response_tokens (holiday_operation_id, expires_at)
  WHERE used_at IS NULL;