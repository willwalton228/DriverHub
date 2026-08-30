-- Preserve the source template on centralized communication records so
-- event-driven sends can be audited without inferring template identity from HTML.

ALTER TABLE communication_messages
  ADD COLUMN IF NOT EXISTS template_slug VARCHAR;

CREATE INDEX IF NOT EXISTS idx_comm_messages_template_slug
  ON communication_messages (template_slug);