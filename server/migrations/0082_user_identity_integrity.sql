-- Protect human user identity fields from sparse authentication and partial updates.

CREATE TABLE IF NOT EXISTS user_identity_audit_log (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  user_email VARCHAR,
  field VARCHAR NOT NULL,
  action VARCHAR NOT NULL,
  old_value TEXT,
  new_value TEXT,
  actor_user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  actor_email VARCHAR,
  source VARCHAR NOT NULL,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_identity_audit_user_idx
  ON user_identity_audit_log (user_id);
CREATE INDEX IF NOT EXISTS user_identity_audit_field_idx
  ON user_identity_audit_log (field);
CREATE INDEX IF NOT EXISTS user_identity_audit_action_idx
  ON user_identity_audit_log (action);
CREATE INDEX IF NOT EXISTS user_identity_audit_created_at_idx
  ON user_identity_audit_log (created_at);

-- Restore the verified original identity on the existing account. The email
-- and internal user ID are the authority; no user or AMR ownership is created
-- or reassigned.
WITH repaired AS (
  UPDATE users
     SET first_name = 'JoAnna',
         last_name = 'Holmes',
         updated_at = now()
   WHERE lower(trim(email)) = 'joanna@driverondemand.co'
     AND status = 'ACTIVE'
     AND (NULLIF(trim(first_name), '') IS NULL OR NULLIF(trim(last_name), '') IS NULL)
  RETURNING id, email, first_name, last_name
)
INSERT INTO user_identity_audit_log
  (user_id, user_email, field, action, old_value, new_value, actor_email, source, reason, metadata)
SELECT id, email, 'firstName', 'repaired', NULL, first_name,
       'identity-integrity-migration', 'task_157_forensic_repair',
       'Verified restoration from the assigned identity requirement; original user ID retained.',
       jsonb_build_object('repair', 'joanna_holmes')
  FROM repaired
UNION ALL
SELECT id, email, 'lastName', 'repaired', NULL, last_name,
       'identity-integrity-migration', 'task_157_forensic_repair',
       'Verified restoration from the assigned identity requirement; original user ID retained.',
       jsonb_build_object('repair', 'joanna_holmes')
  FROM repaired;