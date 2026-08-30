-- DH-000992: Claims Controls owns an explicit set of recipient User IDs.
-- Normalize legacy raw-email and role rules to the current matching users
-- without adding any recipient who was not already selected by an existing rule.

CREATE TEMP TABLE old_claim_created_email_rules ON COMMIT DROP AS
SELECT recipient_type, recipient_value, enabled
FROM comm_recipient_rules
WHERE event_slug = 'CLAIM_CREATED'
  AND channel = 'email';

CREATE TEMP TABLE normalized_claim_created_users ON COMMIT DROP AS
SELECT DISTINCT u.id AS user_id
FROM old_claim_created_email_rules r
JOIN users u
  ON (
    (r.recipient_type = 'user' AND u.id = r.recipient_value)
    OR (r.recipient_type = 'email' AND LOWER(u.email) = LOWER(r.recipient_value))
    OR (r.recipient_type = 'role' AND u.role = r.recipient_value)
  )
WHERE r.enabled = true
  AND u.email IS NOT NULL
  AND COALESCE(UPPER(u.status), 'ACTIVE') <> 'DISABLED'
  AND COALESCE(u.has_driver_hub_access, true) = true;

DELETE FROM comm_recipient_rules
WHERE event_slug = 'CLAIM_CREATED'
  AND channel = 'email';

INSERT INTO comm_recipient_rules (
  event_slug,
  channel,
  recipient_type,
  recipient_value,
  enabled
)
SELECT
  'CLAIM_CREATED',
  'email',
  'user',
  user_id,
  true
FROM normalized_claim_created_users;

CREATE UNIQUE INDEX IF NOT EXISTS comm_recipient_rules_claim_created_user_unique
  ON comm_recipient_rules (event_slug, channel, recipient_type, recipient_value)
  WHERE event_slug = 'CLAIM_CREATED'
    AND channel = 'email'
    AND recipient_type = 'user';

INSERT INTO module_control_audit (
  module_key,
  setting_key,
  previous_value,
  new_value,
  changed_by_user_id,
  changed_by_name
)
VALUES (
  'claims',
  'new_claim_email',
  jsonb_build_object(
    'newClaimEmailEnabled',
    COALESCE((
      SELECT enabled
      FROM comm_automations
      WHERE automation_key = 'claim_created_notification'
      LIMIT 1
    ), true),
    'recipientRules',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'type', recipient_type,
        'value', recipient_value,
        'enabled', enabled
      ))
      FROM old_claim_created_email_rules
    ), '[]'::jsonb)
  ),
  jsonb_build_object(
    'newClaimEmailEnabled',
    COALESCE((
      SELECT enabled
      FROM comm_automations
      WHERE automation_key = 'claim_created_notification'
      LIMIT 1
    ), true),
    'recipientUserIds',
    COALESCE((
      SELECT jsonb_agg(user_id ORDER BY user_id)
      FROM normalized_claim_created_users
    ), '[]'::jsonb)
  ),
  NULL,
  'System migration — normalized legacy Claims Controls recipients'
);