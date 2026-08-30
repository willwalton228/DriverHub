-- Migration 0059: recruiting_campaign_activated_drivers
-- DH-002142: Link Activated Drivers to Closed Campaigns
-- Creates a permanent campaign↔driver relationship table that supports recruiting
-- reporting, retention analysis, and future trip/productivity analysis.

CREATE TABLE IF NOT EXISTS recruiting_campaign_activated_drivers (
  id                                VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id                       VARCHAR NOT NULL REFERENCES recruiting_requests(id) ON DELETE CASCADE,
  driver_id                         VARCHAR NOT NULL REFERENCES drivers(id) ON DELETE RESTRICT,
  activation_date                   DATE,
  driver_classification_at_activation VARCHAR,
  driver_type_at_activation         VARCHAR,
  employment_type_at_activation     VARCHAR,
  linked_by_user_id                 VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  linked_at                         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT recruiting_campaign_activated_drivers_unique UNIQUE (campaign_id, driver_id)
);

CREATE INDEX IF NOT EXISTS idx_rcad_campaign_id ON recruiting_campaign_activated_drivers (campaign_id);
CREATE INDEX IF NOT EXISTS idx_rcad_driver_id   ON recruiting_campaign_activated_drivers (driver_id);
