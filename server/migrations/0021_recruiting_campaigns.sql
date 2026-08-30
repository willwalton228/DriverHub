-- Migration 0021: Recruiting Campaign Manager
-- Creates the recruiting_campaigns table as the primary entity for active campaign management.
-- Links to recruiting_requests (intake/approval) and optionally recruiting_requisitions (job postings).

CREATE TABLE IF NOT EXISTS recruiting_campaigns (
  id              varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id          varchar NOT NULL,
  campaign_name   varchar(200) NOT NULL,

  -- Source linkage
  request_id      varchar REFERENCES recruiting_requests(id) ON DELETE SET NULL,
  requisition_id  varchar REFERENCES recruiting_requisitions(id) ON DELETE SET NULL,

  -- Campaign config
  market          varchar(100),
  network         varchar(100),
  driver_types    text[] NOT NULL DEFAULT '{}',
  drivers_needed  integer NOT NULL DEFAULT 1,
  start_date      date,
  end_date        date,
  budget          numeric(12,2),
  total_spend     numeric(12,2) NOT NULL DEFAULT 0,
  priority        varchar(20) NOT NULL DEFAULT 'medium',  -- low|medium|high|critical
  recruiter_id    varchar,
  recruiter_name  varchar(200),
  advertising_sources text[] NOT NULL DEFAULT '{}',
  referral_bonus  numeric(10,2),
  hiring_goal     integer NOT NULL DEFAULT 1,

  -- Live tracking (denormalized counters for fast dashboard reads)
  applicants_count  integer NOT NULL DEFAULT 0,
  interviews_count  integer NOT NULL DEFAULT 0,
  offers_count      integer NOT NULL DEFAULT 0,
  hires_count       integer NOT NULL DEFAULT 0,

  -- Status
  status          varchar(30) NOT NULL DEFAULT 'draft',  -- draft|active|paused|completed|cancelled

  -- Notes / meta
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      varchar,
  updated_by      varchar
);

CREATE INDEX IF NOT EXISTS rc_org_idx     ON recruiting_campaigns(org_id);
CREATE INDEX IF NOT EXISTS rc_status_idx  ON recruiting_campaigns(status);
CREATE INDEX IF NOT EXISTS rc_request_idx ON recruiting_campaigns(request_id);
CREATE INDEX IF NOT EXISTS rc_created_idx ON recruiting_campaigns(created_at DESC);
