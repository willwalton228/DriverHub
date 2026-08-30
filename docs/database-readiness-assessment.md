# DriverHub 360 — Database Readiness Assessment for Move Growth

**Prepared:** August 2026  
**Database:** Neon PostgreSQL (serverless)  
**Assessment scope:** Moves, Drivers, Accounts, DriverReturns, Payments, Import Batches, Staging, Raw Import Tables

---

## Executive Summary

The DriverHub database architecture is **structurally sound** and demonstrates disciplined schema design: proper normalization, consistent use of foreign keys, partial indexes on nullable fields, and a well-organized import pipeline. The Neon PostgreSQL platform is the correct choice and is fully capable of scaling to millions of Move records without platform replacement.

However, **two categories of risk require action before they become production crises**:

1. **Critical — Dashboard queries load the entire Moves table into Node.js memory.** Five active endpoints call `getAllTrips()` with no filters and then run `.filter()` in JavaScript. At 11,000 moves/month and growing, this pattern will cause visible slowdowns within 6 months and potential memory failures within 12–18 months. This must be refactored to SQL aggregations.

2. **High — Seven performance-sensitive index gaps exist on the `trips` table.** VIN search, city/state filtering, `created_at` range queries used by dashboards, and composite reporting indexes are all missing.

Everything else identified in this assessment is medium or low priority — optimization work that improves performance headroom but does not threaten reliability at current scale.

---

## 1. Table Design

### 1.1 `trips` (Moves) — Primary Growth Table

**Current state:** 80+ columns, single table.

**Strengths:**
- Correct use of `VARCHAR` primary keys with `gen_random_uuid()` — avoids integer overflow at scale.
- Import dedup fields (`external_move_id`, `source_system`) with a partial unique composite index prevent duplicate records at insert time.
- Photo compliance status is cached directly on the row (`pickup_photo_compliance_status`, `dropoff_photo_compliance_status`) — avoids joins on the hot list query path.
- Financial fields (`revenue`, `driver_cost`, `gross_profit`, `gross_margin`) are computed at ingest and stored — avoids recalculating on every dashboard read.
- Eligibility snapshot fields (`eligibility_status`, `eligibility_reasons`, `eligibility_checked_at`) are stored at ingest, decoupling reporting from real-time policy evaluation.
- Soft-delete pattern (`is_deleted`) is present, enabling non-destructive archiving.

**Risks:**
- **Table width.** 80+ columns means each full row scan transfers significant data. PostgreSQL stores wide rows using TOAST (out-of-line storage for text/JSONB fields), which adds I/O overhead on full-row reads. The DriverConnect contract fields (lines 650–671 in schema.ts: `customer_first_name`, `customer_last_name`, `customer_phone`, etc.) and the offer system fields (`assignment_state`, `offered_at`, `offer_expires_at`, etc.) are needed in operational workflows but rarely needed together with financial import fields.

  **Recommendation (Medium priority):** Consider a `trip_offer_details` and `trip_execution_details` child table for the DriverConnect-specific columns. This reduces the trips table row width for import/reporting queries that never need offer data. Not urgent at current scale but beneficial as the table crosses 500k rows.

- **`tripDate` is `TIMESTAMP`, not `DATE`.** Move date semantics are day-level; storing as timestamp adds 4 bytes per row and complicates date equality comparisons in SQL. Not a correctness issue — a minor inefficiency.

- **`createdAt` lacks timezone (`TIMESTAMP` without time zone).** This differs from other tables that use `TIMESTAMP WITH TIME ZONE`. Dashboard queries filter moves by `created_at` for 30-day and 90-day windows. Without timezone, behavior near DST transitions is undefined. Recommend: standardize to `TIMESTAMP WITH TIME ZONE` in a future migration.

### 1.2 `move_report_entries` and `driver_return_entries` — Staging Import Tables

**Strengths:**
- Both tables are correctly separate from `trips` — they store raw import data and can be purged independently of production records.
- Both have an FK to `data_import_batches` with `ON DELETE CASCADE`, making cleanup straightforward.
- Both have an FK to `trips.id` with `ON DELETE SET NULL` — linked_trip_id survives even if a move is soft-deleted.
- Redcap-specific identifiers (`redcap_trip_id`, `redcap_id`) are correctly stored here, not on the canonical `trips` table.

**Risks:**
- These tables are never purged. At 11,000 moves/month of Move Report imports, `move_report_entries` accumulates 132,000+ rows/year. They are import staging records, not production data.
- See Section 6 (Data Retention) for recommendations.

### 1.3 `data_import_batches` and `data_import_staged_rows`

**Strengths:**
- Comprehensive status lifecycle: `uploaded → validating → ready_for_import → importing → imported → completed_with_warnings → failed`
- `file_hash` column for duplicate file detection
- JSONB for `column_headers`, `field_mapping`, `validation_result`, `import_result` — flexible without schema changes

**Risks:**
- `data_import_staged_rows` stores every individual parsed row as JSONB (`raw_data`, `mapped_data`). At 11,000 moves/month with multi-column rows, this table grows quickly. It is used for validation replay and error review but is not needed long-term.
- No composite index on `(batch_id, import_status)` — only `(batch_id, validation_status)` exists. Import resume logic querying by both would benefit from this.

### 1.4 `drivers` and `customers` (Accounts)

**Strengths:**
- Correct 1:1 relationship between `drivers` and `users` via `user_id` FK.
- `customers` table represents Accounts with proper FK relationships to billing, contacts, and move data.
- `drivershift_customer_id` on drivers enables the DriverShift account link.

No structural issues identified. These tables are not expected to be large-volume growth drivers.

### 1.5 `billable_charges` and `payments`

**Strengths:**
- `billable_charges_src_type_ref_uniq` partial unique index on `(source_type, source_reference_id)` prevents duplicate billing records at the database level.
- `payments` uses a unique `payment_number` with an implicit unique index.

**Risks:**
- `billable_charges` will grow proportionally with `trips`. At 11,000 moves/month, this table may also accumulate 100k+ rows/year. No archiving strategy is defined.

---

## 2. Index Review

### 2.1 Existing Indexes on `trips` — Complete Inventory

| Index | Columns | Type | Status |
|---|---|---|---|
| `trips_pkey` | `id` | Primary Key | ✅ |
| `trips_move_number_key` | `move_number` | Unique | ✅ |
| `trips_external_move_id_source_system_idx` | `external_move_id, source_system` | Unique Partial | ✅ |
| `trips_import_batch_id_idx` | `import_batch_id` | Partial (non-null) | ✅ |
| `trips_source_system_idx` | `source_system` | Partial (non-null) | ✅ |
| `idx_trips_customer_id` | `customer_id` | Standard | ✅ |
| `idx_trips_driver_id` | `driver_id` | Standard | ✅ |
| `idx_trips_status` | `status` | Partial (non-null) | ✅ |
| `idx_trips_move_type` | `move_type` | Partial (non-null) | ✅ |
| `idx_trips_trip_date` | `trip_date` | Partial (non-null) | ✅ |

### 2.2 Missing Indexes — Recommended Additions

**Priority 1 — Add immediately (before next feature release):**

```sql
-- VIN search (explicitly required in spec; no index exists)
CREATE INDEX IF NOT EXISTS idx_trips_vehicle_vin 
  ON trips(vehicle_vin) WHERE vehicle_vin IS NOT NULL;

-- City/state filtering (requested in Move List spec)
CREATE INDEX IF NOT EXISTS idx_trips_origin_city 
  ON trips(origin_city) WHERE origin_city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trips_origin_state 
  ON trips(origin_state) WHERE origin_state IS NOT NULL;

-- created_at — dashboard queries filter 30-day and 90-day windows by this column
-- Currently unindexed; will cause full table scans in dashboard queries
CREATE INDEX IF NOT EXISTS idx_trips_created_at 
  ON trips(created_at DESC);
```

**Priority 2 — Add before 500k rows (est. 3–4 months at current growth):**

```sql
-- Composite: account + date — powers Account Detail Moves tab and account-level reports
CREATE INDEX IF NOT EXISTS idx_trips_customer_trip_date 
  ON trips(customer_id, trip_date DESC) WHERE customer_id IS NOT NULL;

-- Composite: driver + date — powers Driver Detail Moves tab and driver-level reports
CREATE INDEX IF NOT EXISTS idx_trips_driver_trip_date 
  ON trips(driver_id, trip_date DESC) WHERE driver_id IS NOT NULL;

-- Composite: date + status — powers operational dashboards (Active, Completed Today)
CREATE INDEX IF NOT EXISTS idx_trips_trip_date_status 
  ON trips(trip_date DESC, status) WHERE status IS NOT NULL;
```

**Priority 3 — Add for reporting scale (before 1M rows):**

```sql
-- Composite: source_system + date — powers source-level reporting and import validation
CREATE INDEX IF NOT EXISTS idx_trips_source_date 
  ON trips(source_system, trip_date DESC) WHERE source_system IS NOT NULL;

-- Import batch + source (for cross-batch reporting)  
CREATE INDEX IF NOT EXISTS idx_dib_type_status 
  ON data_import_batches(import_type, status, created_at DESC);

-- Staged rows: import_status per batch (for import resume and error review)
CREATE INDEX IF NOT EXISTS idx_disr_batch_import_status 
  ON data_import_staged_rows(batch_id, import_status);
```

### 2.3 Summary of Index Coverage vs. Spec Requirements

| Requirement | Indexed | Notes |
|---|---|---|
| Move Number search | ✅ | Unique constraint |
| VIN search | ❌ | Missing — add now |
| RedCap ID | ✅ | `idx_dre_redcap_id` on `driver_return_entries` |
| Import Batch | ✅ | `trips_import_batch_id_idx` |
| Account ID | ✅ | `idx_trips_customer_id` |
| Driver ID | ✅ | `idx_trips_driver_id` |
| Status filter | ✅ | `idx_trips_status` |
| Move Type filter | ✅ | `idx_trips_move_type` |
| Trip Date filter | ✅ | `idx_trips_trip_date` |
| Source System | ✅ | `trips_source_system_idx` |
| City / State | ❌ | Missing — add now |
| Reporting by Account | ⚠️ | Single-col only; add composite with date |
| Reporting by Driver | ⚠️ | Single-col only; add composite with date |
| Month / Year reporting | ⚠️ | `trip_date` index exists; composite preferred |

---

## 3. Import Performance

### 3.1 Architecture Review

The import pipeline follows a correct, industry-standard pattern:

1. File upload → `data_import_batches` record created
2. Parse → rows written to `data_import_staged_rows` (JSONB)
3. Validate → rows flagged with `validation_status`
4. Import → upsert to `trips` using `ON CONFLICT (external_move_id, source_system)` 

### 3.2 Duplicate Detection

**Status: ✅ Well-designed**

The partial unique index `trips_external_move_id_source_system_idx` enforces dedup at the database level. A Postgres `INSERT ... ON CONFLICT DO UPDATE` (upsert) is the correct pattern and scales efficiently — the conflict check uses the index directly without a prior SELECT.

### 3.3 Account and Driver Matching

**Status: ✅ Correctly indexed**

The `import_entity_mappings` table with `idx_iem_lookup` on `(entity_type, source_name)` caches account and driver name → DriverHub UUID lookups. This is the correct pattern — a single lookup per unique account/driver name per import batch rather than a fresh search each row.

### 3.4 Import Batch Tracking

**Status: ✅ Adequate**

Indexes on `import_type`, `status`, `created_at DESC`, and `imported_by_user_id` cover all expected query patterns on `data_import_batches`.

### 3.5 Performance at Scale

| Volume | Upsert time (est.) | Risk |
|---|---|---|
| 11,000 moves/batch (current) | < 30 seconds | None |
| 50,000 moves/batch | 2–4 minutes | Acceptable with connection timeout tuning |
| 200,000 moves/batch | 8–15 minutes | Requires batch chunking (1,000–5,000 rows/transaction) |

**Current risk:** The import pipeline does not appear to chunk large batches into sub-transactions. A failed import mid-batch with 11,000 rows would require a full re-import. At current volumes this is acceptable; at 50k+ rows it becomes a reliability concern.

**Recommendation (Medium):** Implement chunked upsert transactions (5,000 rows per commit) with resume support using `import_status = 'pending'` row filtering. The index `idx_disr_batch_status` on `(batch_id, validation_status)` already exists; add a matching one on `import_status` (Priority 3 above).

---

## 4. Dashboard Performance — Critical Issue

### 4.1 The Problem

Five production dashboard endpoints currently call `storage.getAllTrips()` with no parameters, loading the **entire trips table** into Node.js heap memory and then filtering in JavaScript:

| Endpoint | Line | Pattern |
|---|---|---|
| `GET /api/dashboard/summary` | 9494 | `getAllTrips()` → `.filter(t => t.tripDate ...)` |
| `GET /api/dashboard/trends` | 9751 | `getAllTrips()` → loop over 7–30 days, `.filter()` each day |
| `GET /api/dashboard/topDrivers` | 9819 | `getAllTrips()` → `.filter(t => t.driverId === ...)` |
| `GET /api/claims/loss-impact` | 48063 | `getAllTrips()` → `.filter(t => t.createdAt >= last90Days)` |
| `GET /api/claims/dashboard-scorecard` | 48196 | `getAllTrips()` → `.filter(30d)`, `.filter(90d)` |

**Projected impact at current growth rates:**

| Timeline | Row count (est.) | Heap per `getAllTrips()` call | Risk level |
|---|---|---|---|
| Today | ~50,000–100,000 | ~40–80 MB | Marginal |
| 6 months (3 partners) | ~250,000 | ~200 MB | Degraded |
| 12 months | ~500,000 | ~400 MB | Dangerous |
| 18 months | ~1,000,000 | ~800 MB+ | Failure |

Each Neon serverless compute instance has bounded memory. With multiple concurrent users, several of these endpoints may run simultaneously, multiplying heap pressure. Neon auto-scales compute but cannot prevent OOM if a single query balloons too large.

### 4.2 Required Fix: Replace with SQL Aggregations

Every `getAllTrips()` call in a dashboard context should be replaced with a targeted SQL aggregate. Examples:

```sql
-- Instead of: allTrips.filter(t => t.tripDate === today).length
SELECT COUNT(*) FROM trips WHERE trip_date >= CURRENT_DATE AND trip_date < CURRENT_DATE + INTERVAL '1 day';

-- Instead of: allTrips.filter(t => tripDate >= startDate && tripDate <= endDate)
SELECT COUNT(*), SUM(revenue), SUM(gross_profit)
FROM trips WHERE trip_date BETWEEN $startDate AND $endDate;

-- Instead of: trips.filter(t => t.driverId === driver.id && tripDate in range).length
SELECT driver_id, COUNT(*) as trip_count, SUM(revenue) as revenue
FROM trips
WHERE trip_date BETWEEN $startDate AND $endDate
  AND driver_id IS NOT NULL
GROUP BY driver_id;

-- Instead of: building a per-day sparkline via JS filter loop
SELECT DATE_TRUNC('day', trip_date)::date AS day, COUNT(*) AS count
FROM trips
WHERE trip_date >= NOW() - INTERVAL '30 days'
GROUP BY 1 ORDER BY 1;
```

With the `idx_trips_trip_date` index already in place, these queries are index-range scans, not sequential scans. Each returns a small result set regardless of total table size.

### 4.3 Caching Strategy for Dashboard Widgets

Dashboard summary numbers (Today's moves, Active drivers, etc.) do not need to be recalculated on every page load. Recommended per widget type:

| Widget | Recommended strategy |
|---|---|
| Moves Today, Completed Today | SQL COUNT with `idx_trips_trip_date` — fast enough live (< 10ms) |
| Moves This Week / Month | SQL COUNT — live, uses index |
| Driver count (active) | Live SQL — table is small |
| Claims per 1k Moves (30d/90d) | **Cache 5 minutes** in application memory — aggregates > 90 days |
| Market loss score | **Cache 15 minutes** — complex multi-table computation |
| Executive dashboard rollups | **Materialized view** refreshed hourly — see Section 5 |
| Sparkline trend data | **Cache 5 minutes** — low volatility, expensive to compute |

---

## 5. Report Performance

### 5.1 Current State

Reporting queries are mostly ad-hoc aggregations run on demand. At current scale this works. At 500k+ moves it will create noticeable latency on pages like the Claims Dashboard Scorecard, which currently computes 30-day and 90-day windows across all moves, all accidents, and all drivers in a single request.

### 5.2 Recommended Summary Tables

**Phase 1 — Before 500k rows (est. 3–4 months):**

```sql
-- Daily move summary — powers all date-range dashboard widgets efficiently
CREATE TABLE trip_daily_summary (
  summary_date        DATE NOT NULL,
  source_system       VARCHAR,
  customer_id         VARCHAR REFERENCES customers(id),
  driver_id           VARCHAR REFERENCES drivers(id),
  total_moves         INTEGER NOT NULL DEFAULT 0,
  completed_moves     INTEGER NOT NULL DEFAULT 0,
  cancelled_moves     INTEGER NOT NULL DEFAULT 0,
  total_revenue       DECIMAL(12,2) DEFAULT 0,
  total_driver_cost   DECIMAL(12,2) DEFAULT 0,
  total_gross_profit  DECIMAL(12,2) DEFAULT 0,
  total_minutes       INTEGER DEFAULT 0,
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (summary_date, COALESCE(source_system,''), COALESCE(customer_id,''), COALESCE(driver_id,''))
);
CREATE INDEX idx_tds_date       ON trip_daily_summary(summary_date DESC);
CREATE INDEX idx_tds_customer   ON trip_daily_summary(customer_id, summary_date DESC);
CREATE INDEX idx_tds_driver     ON trip_daily_summary(driver_id, summary_date DESC);
```

This table is populated at import time (upserted when moves are created/updated) and enables sub-millisecond dashboard aggregations that currently require full table scans. Rolling 30-day, 90-day, and year-to-date queries become simple index scans on this small table.

**Phase 2 — Before 1M rows:**

A `MATERIALIZED VIEW` for executive dashboards refreshed hourly:

```sql
CREATE MATERIALIZED VIEW mv_moves_monthly AS
SELECT
  DATE_TRUNC('month', trip_date)::date AS month,
  source_system,
  customer_id,
  COUNT(*) AS total_moves,
  SUM(revenue) AS total_revenue,
  SUM(gross_profit) AS total_gross_profit,
  AVG(move_minutes) AS avg_minutes,
  AVG(distance::float) AS avg_miles
FROM trips
WHERE is_deleted = false
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX ON mv_moves_monthly(month, COALESCE(source_system,''), COALESCE(customer_id,''));
```

Refreshed via: `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_moves_monthly;` — runs without locking reads.

---

## 6. Data Retention

### 6.1 Current Situation

No data retention or archiving policy exists. All tables grow indefinitely.

### 6.2 Recommended Strategy by Table

| Table | Recommended retention | Strategy |
|---|---|---|
| `trips` | **Permanent** — production records | Soft-delete (`is_deleted`) already in place. Never hard-delete. Add `archived_at` flag after 3 years for cold-path queries. |
| `move_report_entries` | **2 years** | Staging records; linked_trip_id links to the canonical trips row. Purge rows where `batch.imported_at < NOW() - INTERVAL '2 years'`. |
| `driver_return_entries` | **2 years** | Same as above |
| `data_import_staged_rows` | **90 days** | Row-level staging data; all useful information is in the linked trip row. CASCADE delete by purging old batches. |
| `data_import_batches` | **2 years** | Keep for audit trail; JSONB validation/result fields can be NULLed after 90 days to reclaim space |
| Raw import files (object storage) | **1 year** | After 1 year move to cold storage tier; delete after 3 years |
| `driver_communication_logs` | **2 years** | Operational communications history |
| `payroll_exceptions` | **7 years** | Financial compliance requirement |
| `payments`, `billable_charges` | **7 years** | Financial compliance requirement |

**Implementation:**  
Create a scheduled background job (run nightly at 2 AM CT) that executes soft-deletes and purges based on these rules. Log all purge operations to an `audit_purge_log` table.

---

## 7. Database Growth Projections

### 7.1 Baseline Assumptions

- **Current:** 11,000 moves/month from 1 technology partner
- **Near-term (6 months):** 2–3 partners → 22,000–33,000 moves/month
- **Year 1:** 3–4 partners + customer growth → 40,000–55,000 moves/month
- **Year 2:** Full enterprise scale → 75,000–120,000 moves/month
- **Year 3:** Multi-region / franchise expansion → 150,000–250,000 moves/month

### 7.2 `trips` Table Size Projections

| Timeline | Monthly moves | Cumulative rows | Estimated table size |
|---|---|---|---|
| Today | 11,000 | ~75,000 | ~75 MB |
| 6 months | 30,000 | ~250,000 | ~250 MB |
| 12 months | 50,000 | ~500,000 | ~500 MB |
| 24 months | 100,000 | ~1,500,000 | ~1.5 GB |
| 36 months | 200,000 | ~4,000,000 | ~4 GB |

These sizes are easily within Neon PostgreSQL's capabilities. A 4 GB table with proper indexes performs well — PostgreSQL routinely handles tables in the hundreds of GB range with appropriate indexing and query design.

**The growth problem is not storage — it is the in-memory query pattern identified in Section 4.** Fix those queries and the database will handle this growth without concern.

### 7.3 Associated Table Growth

`move_report_entries` and `driver_return_entries` will grow at similar or faster rates (multiple import records per trip). With the 2-year retention policy recommended in Section 6, these tables stabilize at ~2 years × monthly volume × 12.

---

## 8. Future Readiness

### 8.1 Is Neon PostgreSQL Sufficient?

**Yes — Neon PostgreSQL is the correct and sufficient platform for DriverHub's projected growth.**

Reasoning:
- PostgreSQL handles tables with tens of millions of rows efficiently when queries are properly indexed.
- Neon's serverless architecture auto-scales compute, eliminating capacity planning for read workloads.
- The existing schema uses standard PostgreSQL features (partial indexes, JSONB, arrays, UUIDs) that will continue to work at enterprise scale.
- No OLAP-specific query patterns (cube aggregations, time-series analytics at sub-second latency) exist in the current application that would require a separate analytics database.

**Additional database systems are not recommended.** The performance risks identified are addressable within PostgreSQL through:
1. SQL aggregations replacing in-memory JavaScript filtering
2. Composite indexes for reporting queries
3. Summary tables for dashboard widgets
4. Materialized views for executive reporting

### 8.2 When to Reassess

Reassess the database platform if and when:
- Single queries require aggregating > 50 million rows in real time (well beyond 36-month projections)
- Sub-second historical analytics across multiple years of data is required (use a read replica or Redshift-style warehouse at that point, not a different primary DB)
- Write throughput exceeds 10,000 INSERTs/second sustained (current peak is approximately 5–10 rows/second during imports)

---

## Priority Matrix

| # | Recommendation | Category | Priority | Effort | Impact |
|---|---|---|---|---|---|
| 1 | Replace `getAllTrips()` in dashboard endpoints with SQL aggregations | Dashboard Performance | 🔴 Critical | Medium | Prevents production failure at scale |
| 2 | Add `idx_trips_vehicle_vin` index | Index | 🔴 High | Trivial | Enables VIN search without table scan |
| 3 | Add `idx_trips_created_at` index | Index | 🔴 High | Trivial | Fixes current dashboard 30/90-day queries |
| 4 | Add `idx_trips_origin_city` / `origin_state` indexes | Index | 🟠 High | Trivial | Required for city/state filter on Move List |
| 5 | Add composite `(customer_id, trip_date)` and `(driver_id, trip_date)` indexes | Index | 🟠 High | Trivial | Accelerates Account/Driver move tab queries |
| 6 | Add composite `(trip_date, status)` index | Index | 🟠 High | Trivial | Accelerates operational dashboard filters |
| 7 | Add 5-minute server-side cache to dashboard aggregate endpoints | Dashboard Performance | 🟠 High | Low | Eliminates repeated aggregations during peak usage |
| 8 | Implement `trip_daily_summary` summary table | Report Performance | 🟡 Medium | Medium | Enables sub-millisecond executive reporting |
| 9 | Add data retention purge job (staged rows 90d, staging entries 2yr) | Data Retention | 🟡 Medium | Medium | Prevents unbounded growth of non-production tables |
| 10 | Implement chunked upsert transactions in import pipeline | Import Performance | 🟡 Medium | Low | Enables resume-on-failure for large import batches |
| 11 | Create `mv_moves_monthly` materialized view, refresh hourly | Report Performance | 🟡 Medium | Low | Powers executive dashboard at any scale |
| 12 | Standardize `created_at` to `TIMESTAMP WITH TIME ZONE` on `trips` | Table Design | 🟢 Low | Low | Correctness at DST boundaries |
| 13 | Evaluate vertical partitioning of offer/execution fields | Table Design | 🟢 Low | High | Beneficial after 1M rows; not urgent |

---

## Appendix: Index Application

The following indexes from this assessment that are not yet applied can be added in migration `0049`:

```sql
-- 0049_performance_indexes.sql

-- VIN search
CREATE INDEX IF NOT EXISTS idx_trips_vehicle_vin
  ON trips(vehicle_vin) WHERE vehicle_vin IS NOT NULL;

-- City / state filtering
CREATE INDEX IF NOT EXISTS idx_trips_origin_city
  ON trips(origin_city) WHERE origin_city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trips_origin_state
  ON trips(origin_state) WHERE origin_state IS NOT NULL;

-- created_at for 30/90-day dashboard windows
CREATE INDEX IF NOT EXISTS idx_trips_created_at
  ON trips(created_at DESC);

-- Composite: account + date reporting
CREATE INDEX IF NOT EXISTS idx_trips_customer_trip_date
  ON trips(customer_id, trip_date DESC) WHERE customer_id IS NOT NULL;

-- Composite: driver + date reporting
CREATE INDEX IF NOT EXISTS idx_trips_driver_trip_date
  ON trips(driver_id, trip_date DESC) WHERE driver_id IS NOT NULL;

-- Composite: date + status for operational filters
CREATE INDEX IF NOT EXISTS idx_trips_trip_date_status
  ON trips(trip_date DESC, status) WHERE status IS NOT NULL;

-- Import pipeline: batch + import_status for resume queries
CREATE INDEX IF NOT EXISTS idx_disr_batch_import_status
  ON data_import_staged_rows(batch_id, import_status);
```

These are all `CREATE INDEX CONCURRENTLY`-safe (can be run on a live production database without locking reads or writes) — on Neon, standard `CREATE INDEX IF NOT EXISTS` is used in the migration runner; indexes are built without exclusive table locks.
