-- Migration 0040: Recruiting Manual Metrics
-- Monthly manually-maintained metrics for Total Candidates, Pending Interviews, Hired This Month.
-- Supports IC / Employee split and future integration source tracking.

CREATE TABLE IF NOT EXISTS recruiting_manual_metrics (
  id                   VARCHAR      PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id               VARCHAR      NOT NULL,
  metric_month         VARCHAR(7)   NOT NULL,       -- 'YYYY-MM'
  -- Total Candidates (IC + Employee)
  candidates_ic        INTEGER      NOT NULL DEFAULT 0,
  candidates_employee  INTEGER      NOT NULL DEFAULT 0,
  -- Pending Interviews
  interviews_ic        INTEGER      NOT NULL DEFAULT 0,
  interviews_employee  INTEGER      NOT NULL DEFAULT 0,
  -- Hired This Month (resets each calendar month)
  hired_ic             INTEGER      NOT NULL DEFAULT 0,
  hired_employee       INTEGER      NOT NULL DEFAULT 0,
  -- Future integration readiness
  source_type          VARCHAR(50)  NOT NULL DEFAULT 'manual',   -- manual | pinpoint | indeed | ...
  source_system        VARCHAR(100),
  last_synced_at       TIMESTAMP WITH TIME ZONE,
  manually_overridden  BOOLEAN      DEFAULT false,
  override_reason      TEXT,
  -- Audit
  updated_by           VARCHAR,
  updated_by_name      VARCHAR(200),
  updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, metric_month)
);

-- Audit trail for every manual save
CREATE TABLE IF NOT EXISTS recruiting_manual_metrics_audit (
  id                      VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id                  VARCHAR NOT NULL,
  metric_month            VARCHAR(7) NOT NULL,
  -- Previous values
  prev_candidates_ic      INTEGER,
  prev_candidates_employee INTEGER,
  prev_interviews_ic      INTEGER,
  prev_interviews_employee INTEGER,
  prev_hired_ic           INTEGER,
  prev_hired_employee     INTEGER,
  -- New values
  new_candidates_ic       INTEGER,
  new_candidates_employee  INTEGER,
  new_interviews_ic       INTEGER,
  new_interviews_employee  INTEGER,
  new_hired_ic            INTEGER,
  new_hired_employee       INTEGER,
  -- Actor
  updated_by              VARCHAR,
  updated_by_name         VARCHAR(200),
  updated_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rmm_org_month  ON recruiting_manual_metrics(org_id, metric_month);
CREATE INDEX IF NOT EXISTS idx_rmma_org_month ON recruiting_manual_metrics_audit(org_id, metric_month);
