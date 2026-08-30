-- Migration: 0027_amr_decline_notifications
-- Creates a persistent executive notification table for AMRs declined during UAT.
-- These notifications are only cleared when Will Walton changes the AMR status.

CREATE TABLE IF NOT EXISTS amr_decline_notifications (
  id             VARCHAR      PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      VARCHAR      NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  amr_number     TEXT         NOT NULL,
  amr_title      TEXT         NOT NULL,
  submitted_by_name  TEXT,
  declined_by_user_id  VARCHAR  NOT NULL,
  declined_by_name     TEXT     NOT NULL,
  declined_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  decline_comment TEXT,
  cleared_at     TIMESTAMPTZ,
  cleared_by_name TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS amr_decline_notif_ticket_idx
  ON amr_decline_notifications(ticket_id);

CREATE INDEX IF NOT EXISTS amr_decline_notif_active_idx
  ON amr_decline_notifications(cleared_at)
  WHERE cleared_at IS NULL;
