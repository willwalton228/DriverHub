# UAT Report — Confidence-Tier Import System
**Date:** 2026-08-07  
**Environment:** Development (Replit)  
**Tester:** Replit Agent (automated)  
**Source files:** July 2026 actual data from `attached_assets/`

---

## Verdict: ✅ GO

The confidence-tier import system processed all three July 2026 source files end-to-end with zero import-time errors, correct hold logic, working audit trail, and a fully functional resolve-held workflow. Two bugs were discovered and fixed during this session before final runs.

---

## Bugs Fixed During UAT

### Bug 1 — `resolveDriversBulk` miss-path (validation pass)
**Location:** `server/routes/dataImportsRoutes.ts` local `resolveDriversBulk()` ~line 469  
**Symptom:** `TypeError: Cannot convert undefined or null to object` from drizzle-orm inside `orderSelectedFields`, causing every Move Report validation to fail with `processing_error`.  
**Root cause:** Query selected `drivers.firstName` / `drivers.lastName` — columns that don't exist on `drivers` (they live on `users`).  
**Fix:** Changed to `.leftJoin(users, eq(drivers.userId, users.id))` and selected `users.firstName`, `users.lastName`; updated `WHERE` clause to filter on `lower(users.lastName)`.

### Bug 2 — `resolveDriver` import-time function
**Location:** `server/routes/dataImportsRoutes.ts` `resolveDriver()` ~line 191  
**Symptom:** Same drizzle error, same `Cannot convert undefined or null to object`, during actual import of Move Report rows — causing ~3,500 rows to fail per mid-run snapshot.  
**Root cause:** Same issue — `drivers.firstName`/`drivers.lastName` don't exist.  
**Fix:** Same pattern — `.leftJoin(users, eq(drivers.userId, users.id))` with `users.firstName`/`users.lastName`.

---

## Test Run — Three Source Files

### 1. Move Report — `DOD Trip Data PBI - July 2026.xlsx`

| Metric | Value |
|---|---|
| Batch ID | `d3a6142a-eda0-4a45-b4a6-7e520d3515a6` |
| Records read | 11,099 |
| Batch status | `completed_with_exceptions` |

**Validation:**
| Category | exact | high | medium | low | unknown |
|---|---|---|---|---|---|
| Driver | 8,862 | 2,012 | 0 | 187 | 36 |
| Account | 10,366 | 0 | 731 | 0 | 0 |

- `valid=0 / warn=10,910 / err=189`
- 187 low-tier driver rows also had financial validation errors → `validation_status='error'`, excluded from import filter (correct)
- 731 medium-tier account rows: fuzzy entity-mapping entries scored 75-89% Jaro → flagged as warning, not held (correct for MR — account tier does not trigger hold)
- 36 unknown-tier driver rows: `validation_status='warning'` → reached hold check → held (correct)

**Import:**
| Outcome | Count |
|---|---|
| Imported (new) | 9,730 |
| Updated | 1,144 |
| Held | 36 |
| Error (not imported) | 189 |
| Failed | 0 |

**Held rows:** All 36 are "Johan Garcia Sotomayor" — driver with no match in the system (unknown tier).

**Destination tables:**
- `move_report_entries`: 10,910 active records
- `trips`: 10,910 records (move_number = redcap TripId, source_system='redcap')

---

### 2. Driver Return — `DOD_Driver_Return_-_July_2026.xlsx`

| Metric | Value |
|---|---|
| Batch ID | `98d57336-82a5-4853-8369-5973b05d1ef4` |
| Records read | 3,721 |
| Batch status | `completed_with_exceptions` |

**Validation:**
| Category | exact | high | medium | low | unknown |
|---|---|---|---|---|---|
| Driver | 63 | 0 | 15 | 305 | 3,260 |
| Account | 3,691 | 28 | 0 | 0 | 2 |

- `valid=59 / warn=3,355 / err=307`
- **3,260 unknown driver rows (87.6%)** — source file uses only single first names (e.g. "Dawin", "Thierno"). Cannot fuzzy-match against full-name database records. All correctly held.
- 307 error rows left as `pending` (excluded from import filter)

**Import:**
| Outcome | Count |
|---|---|
| Imported | 154 |
| Held | 3,260 |
| Error (not imported) | 307 |
| Failed | 0 |

- No standalone trips created from DR batch ✅
- `with_linked_driver`: 78 of 154 (resolved via entity_mappings cache)
- `with_linked_trip`: 0 — DR TripIds are DriverHub UUIDs; existing trips use redcap numeric move IDs. DR records correctly stored but trip linkage requires matching UUID. *(Architectural note — not a bug.)*

---

### 3. Uber — `Uber_DriverReturn_-_July_2026.csv`

| Metric | Value |
|---|---|
| Batch ID | `f1d74141-7bad-4748-b7b2-2540c1cb24c6` |
| Records read | 1,178 |
| Batch status | `completed_with_exceptions` |

**Validation:**
| Category | exact | high | medium | low | unknown |
|---|---|---|---|---|---|
| Driver | 745 | 165 | 110 | 0 | 158 |
| Account | N/A | N/A | N/A | N/A | N/A |

- `valid=745 / warn=431 / err=2`

**Transaction type breakdown:**
| Type | Imported | Held | Error/Pending |
|---|---|---|---|
| Fare | 1,014 | 155 | 0 |
| Tip | 5 | 0 | 0 |
| Adjustment | 1 | 1 | 0 |
| Payment | 0 | 0 | 1 (error) |
| Service & Technology Fee | 0 | 0 | 1 (error) |

- `Payment` and `Service & Technology Fee` rows have `validation_status='error'` ("Request Date is missing") → excluded from import ✅
- 155 Fare rows held: driver tier unknown (158 total unknown, 3 with other errors)

**Import:**
| Outcome | Count |
|---|---|
| Imported | 1,020 |
| Held | 156 |
| Error (not imported) | 2 |
| Failed | 0 |

---

## Business Rule Verification

| Check | Result | Notes |
|---|---|---|
| Duplicate upload protection | ✅ PASS | Re-uploading same MR file returned `"error": "Duplicate upload"` with `existingBatchId` |
| No auto-created drivers | ✅ PASS | 0 new driver records after all 3 imports |
| No auto-created customers | ✅ PASS | 0 new customer records after all 3 imports |
| No standalone trips from DR | ✅ PASS | 0 trips with `import_batch_id = DR batch` |
| Uber tx type filtering | ✅ PASS | Payment + Service Fee → validation_status='error', never imported |
| Hold fires on low/unknown driver | ✅ PASS | 36 MR (unknown), 3,260 DR (unknown/low), 156 Uber (unknown) |
| Hold fires on low/unknown account (DR) | ✅ PASS | 2 unknown account rows held in DR |
| Audit trail populated | ✅ PASS | 3 events per batch: upload, validation, import |
| Raw data preserved | ✅ PASS | All 11,099 MR rows have non-null `raw_data` |
| MR financial integrity | ✅ PASS | 10,865/10,874 rows have non-null `chg_total` (9 blank from source) |
| Import errors = 0 | ✅ PASS | 0 failed rows in all 3 batches (post-bug-fix) |

---

## Resolve-Held Workflow Test

**Test:** Inserted exact entity mapping for "Johan Garcia Sotomayor" → called `POST /api/data-imports/{mrBatchId}/resolve-held`

| Metric | Value |
|---|---|
| Rows re-evaluated | 36 |
| Rows made eligible | 36 |
| Records imported by re-run | 36 |
| Remaining held | 0 |
| Batch status after | `imported` |

**Result: ✅ PASS** — resolve-held correctly re-evaluates held rows after entity mappings are updated, triggers reprocess-mode import, and transitions batch to `imported` when no held rows remain.

---

## Performance Note

Move Report import (11,099 rows, row-by-row synchronous): ~18 minutes.  
DR and Uber are substantially smaller and completed in under 2 minutes.  
Future optimization: batch DB inserts / parallel processing for large MR files.

---

## Open Items (Not Blocking)

1. **DR linked_trip_id always null** — DR file TripIds are DriverHub UUIDs; the MR import creates trips with numeric redcap IDs. The two systems don't cross-reference. Needs product decision on whether DR should link by `trips.id` (UUID) matching the DR TripId.
2. **DR single-name driver issue** — 3,260 of 3,721 DR rows (87.6%) are held due to single-name DriverName field in source. The hold system is working correctly, but the source data quality issue means most DR data must be manually resolved via entity mappings.
3. **MR import throughput** — 11K rows at ~10 rows/sec is slow for monthly cadence. Row-by-row DB round-trips are the bottleneck.
