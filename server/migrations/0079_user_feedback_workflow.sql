-- User Feedback survey workflow
-- Preserve existing submissions while adding review, conversion, and context fields.

ALTER TABLE user_feedback
  ADD COLUMN IF NOT EXISTS user_email VARCHAR(320),
  ADD COLUMN IF NOT EXISTS page_url VARCHAR(2048),
  ADD COLUMN IF NOT EXISTS app_environment VARCHAR(64),
  ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS converted_record_type VARCHAR(40),
  ADD COLUMN IF NOT EXISTS converted_record_id VARCHAR,
  ADD COLUMN IF NOT EXISTS converted_record_reference VARCHAR(100),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL;

UPDATE user_feedback AS feedback
SET user_email = users.email
FROM users
WHERE feedback.user_id = users.id
  AND feedback.user_email IS NULL;

CREATE INDEX IF NOT EXISTS feedback_status_idx ON user_feedback(status);