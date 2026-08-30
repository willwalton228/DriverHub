-- Migration: 0001_communication_framework
-- Ticket:    1 — Core Communications Framework (Platform / Shared Infrastructure)
-- Applied:   2026-04-06 (retrospective — tables created via psql before migration
--            tracking was introduced; this file documents that change and is
--            idempotent via IF NOT EXISTS)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── communication_messages ───────────────────────────────────────────────────
-- One record per outbound send attempt (batch or individual).
CREATE TABLE IF NOT EXISTS communication_messages (
  id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  channel               VARCHAR NOT NULL,
  provider              VARCHAR,
  direction             VARCHAR NOT NULL DEFAULT 'outbound',
  status                VARCHAR NOT NULL DEFAULT 'queued',
  from_identity         VARCHAR,
  subject               VARCHAR,
  body                  TEXT    NOT NULL,
  related_module        VARCHAR,
  related_entity_type   VARCHAR,
  related_entity_id     VARCHAR,
  created_by_user_id    VARCHAR,
  sent_at               TIMESTAMPTZ,
  provider_message_id   VARCHAR,
  provider_raw_response JSONB,
  error_message         TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comm_messages_channel
  ON communication_messages (channel);
CREATE INDEX IF NOT EXISTS idx_comm_messages_status
  ON communication_messages (status);
CREATE INDEX IF NOT EXISTS idx_comm_messages_related
  ON communication_messages (related_module, related_entity_type, related_entity_id);
CREATE INDEX IF NOT EXISTS idx_comm_messages_created_by
  ON communication_messages (created_by_user_id);

-- ── communication_recipients ─────────────────────────────────────────────────
-- One record per recipient per communication_message.
CREATE TABLE IF NOT EXISTS communication_recipients (
  id                        VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_message_id  VARCHAR NOT NULL,
  recipient_type            VARCHAR NOT NULL DEFAULT 'unknown',
  recipient_id              VARCHAR,
  destination_raw           VARCHAR,
  destination_normalized    VARCHAR,
  delivery_status           VARCHAR NOT NULL DEFAULT 'pending',
  excluded                  BOOLEAN NOT NULL DEFAULT false,
  excluded_reason           VARCHAR,
  provider_message_id       VARCHAR,
  delivered_at              TIMESTAMPTZ,
  failed_at                 TIMESTAMPTZ,
  error_message             TEXT,
  created_at                TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comm_recipients_message_id
  ON communication_recipients (communication_message_id);
CREATE INDEX IF NOT EXISTS idx_comm_recipients_recipient_id
  ON communication_recipients (recipient_id, recipient_type);
CREATE INDEX IF NOT EXISTS idx_comm_recipients_delivery_status
  ON communication_recipients (delivery_status);
