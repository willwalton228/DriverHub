-- 0004_driver_photo_approvals.sql
-- Driver Photo Approval Framework
-- Corporate uploads bypass approval now; driver_app submissions will require it when the Driver App goes live.

CREATE TABLE IF NOT EXISTS driver_photo_approvals (
  id                        VARCHAR         PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id                 VARCHAR         NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  current_photo_document_id VARCHAR         REFERENCES driver_documents(id) ON DELETE SET NULL,
  proposed_photo_document_id VARCHAR        REFERENCES driver_documents(id) ON DELETE SET NULL,
  submitted_by_type         VARCHAR(50)     NOT NULL DEFAULT 'corporate_user', -- 'corporate_user' | 'driver_app'
  submitted_by_user_id      VARCHAR         REFERENCES users(id) ON DELETE SET NULL,
  status                    VARCHAR(50)     NOT NULL DEFAULT 'pending',        -- 'pending' | 'approved' | 'declined' | 'bypassed'
  decline_reason            TEXT,
  reviewed_by_user_id       VARCHAR         REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at               TIMESTAMPTZ,
  approved_photo_applied_at TIMESTAMPTZ,
  created_at                TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dpa_driver_id  ON driver_photo_approvals(driver_id);
CREATE INDEX IF NOT EXISTS idx_dpa_status     ON driver_photo_approvals(status);
CREATE INDEX IF NOT EXISTS idx_dpa_created_at ON driver_photo_approvals(created_at DESC);
