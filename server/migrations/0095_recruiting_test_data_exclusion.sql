-- DH-002334: prevent Gate 0 / UAT verification Campaigns from ever being
-- indistinguishable from legitimate operational Recruiting Campaigns.
--
-- The staging database is shared by real operational Recruiting users and
-- the dedicated Gate 0 UAT identities (see server/scripts/provision_gate0_uat_users.ts),
-- and Recruiting Campaign market is normally empty so it can't be used to
-- flag test records. This adds an explicit, durable flag (mirroring the
-- existing is_archived soft-exclusion pattern) so operational Recruiting
-- reports/KPIs can filter test data out going forward.

ALTER TABLE recruiting_requests
  ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS recruiting_requests_is_test_data_idx
  ON recruiting_requests (is_test_data);
