-- Migration 0051: Moves Workspace Scalability Indexes
-- Feature 2.2 — Moves Workspace Redesign (Moves Module Modernization Epic)
--
-- Adds composite indexes required for production-scale operational queries.
-- Promotes the Priority 1 and Priority 2 recommendations from the
-- Database Readiness Assessment to applied migrations.

-- ── Priority 1: Add immediately ────────────────────────────────────────────

-- created_at — dashboard aggregate queries filter 30-day and 90-day windows
-- Currently unindexed; causes full table scans on all dashboard summary calls
CREATE INDEX IF NOT EXISTS idx_trips_created_at
  ON trips(created_at DESC);

-- ── Priority 2: Composite indexes (add before 500k rows) ───────────────────

-- Account + date — powers Account Detail Moves tab and account-level reports.
-- Replaces two separate index lookups (customer_id scan → tripDate filter)
-- with a single composite range scan.
CREATE INDEX IF NOT EXISTS idx_trips_customer_trip_date
  ON trips(customer_id, trip_date DESC)
  WHERE customer_id IS NOT NULL;

-- Driver + date — powers Driver Detail Moves tab and driver-level reports.
CREATE INDEX IF NOT EXISTS idx_trips_driver_trip_date
  ON trips(driver_id, trip_date DESC)
  WHERE driver_id IS NOT NULL;

-- Date + status — powers operational dashboard KPIs (Active, Completed Today,
-- This Week) using a single index range scan instead of two separate lookups.
CREATE INDEX IF NOT EXISTS idx_trips_trip_date_status
  ON trips(trip_date DESC, status)
  WHERE status IS NOT NULL;

-- Source system + date — powers source-level reporting and import validation.
CREATE INDEX IF NOT EXISTS idx_trips_source_date
  ON trips(source_system, trip_date DESC)
  WHERE source_system IS NOT NULL;

-- Eligibility filter — powers the Exceptions KPI drilldown.
-- Partial index covers only non-null eligibility rows (the exceptions set).
CREATE INDEX IF NOT EXISTS idx_trips_eligibility_status
  ON trips(eligibility_status)
  WHERE eligibility_status IS NOT NULL;
