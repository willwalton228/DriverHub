# DriverHub 360 — Platform Standards & Guardrails

**Priority: P0 — Critical**
**Applies to: All modules, all developers, all future development.**

These standards prevent repeated fixes, inconsistent implementations, and unintended data loss across the platform. Every rule below is **enforced in code** — not just documented policy.

---

## STANDARD 1 — Authentication Separation

**Operational records must NEVER automatically create login accounts.**

### Non-Authentication Entities
The following are operational records, not auth entities:
- Drivers, Employees, Accounts, Claims, Vendors, Moves, Payments, Invoices

### Allowed User Creation Paths
- Invite New User (Admin UI → `POST /api/admin/users/invite`)
- Explicit admin provisioning workflow

### Forbidden
- Any import process creating `users` rows
- Any background job creating users from operational records
- Any helper function that auto-generates users

### Enforcement
`server/services/importUserGuard.ts` — `snapshotUserCount()` + `assertUserCountUnchanged()` is called at the start and end of every import commit path. If any user was created during a commit, the batch is marked **failed** and a `import.policy_violation.user_creation` event is written to the system audit log.

Wired into all 6 import modules:
- `driverImport.ts` — `runCommitBackground`
- `employeeImport.ts` — `runCommitBackground`
- `claimsImport.ts` — `runCommitBackground`
- `accountImport.ts` — `runCommitBackground`
- `recruitingImport.ts` — inline commit handler
- `wiwImport.ts` — inline commit handler

---

## STANDARD 2 — Foreign Key Safety (No Cascade Deletes on Operational Data)

**Operational records must never be deleted due to authentication or parent record changes.**

### Required FK behavior for operational entities
```
drivers.user_id    → users.id    ON DELETE SET NULL   ✅ enforced
employees.user_id  → users.id    ON DELETE SET NULL   ✅ enforced
driverNotes.corporateUserId → users.id  ON DELETE SET NULL  ✅ enforced
driverComments.authorId     → users.id  ON DELETE SET NULL  ✅ enforced
```

### Acceptable CASCADE (child sub-records only)
Child records that have no meaning without their parent may cascade:
- `invoice_line_items.invoice_id → invoices.id CASCADE` — line items are meaningless without the invoice
- `claim_attachments.claim_id → accidents.id CASCADE` — attachments belong to claim lifecycle

### Never acceptable
- Cascading DELETE from `users` → any operational entity
- Cascading DELETE from an account → historical claims or invoices

---

## STANDARD 3 — Shared Import Engine

**All modules must use the shared import framework. No module may implement its own import logic.**

### Modules using the shared import engine
| Module | API Prefix | Status |
|--------|-----------|--------|
| Drivers | `/api/driver-import` | ✅ |
| Employees | `/api/employee-import` | ✅ |
| Claims | `/api/claims-import` | ✅ |
| Accounts | `/api/account-import` | ✅ |
| Recruiting | `/api/recruiting-import` | ✅ |
| Scheduling (WhenIWork) | `/api/wiw-import` | ✅ |

### Standard workflow
```
Upload → Map Fields → Validate → Preview → Commit → Results
```

### Required capabilities
- Import history and batch tracking (`import_batches` table)
- Async background jobs (fire-and-forget, no HTTP timeout dependency)
- Cancel mid-run (`status = "cancelling"` checked each chunk)
- Rollback committed rows (`rolledBackAt` timestamp + audit entries)
- Error report CSV export (`GET /:batchId/export-errors`)
- 5,000+ row support via chunked processing

### Shared UI component
`client/src/components/ImportWizard.tsx` — all modules render this component via `ImportLauncher.tsx`.

---

## STANDARD 4 — Initial Load Mode

**Historical data must always be importable without blocking system adoption.**

When Initial Load Mode is enabled:
- Required field failures become **warnings** instead of errors
- Picklist mismatches are **allowed** (flagged as `needsUpdate`)
- Duplicate email rows are **skipped** silently (not errored)
- Records are committed with `needsUpdate = true` for first-edit correction

Available in: Drivers, Employees, Claims, Accounts imports.

---

## STANDARD 5 — Status Badge Standardization

**All status badges must use the centralized status color map. No hardcoded badge colors.**

### Single source of truth
- Color map: `client/src/lib/statusColors.ts` — `STATUS_COLOR_MAP`
- Component: `client/src/components/StatusBadge.tsx` — `<StatusBadge status={...} />`

### Color scheme
| Status | Color |
|--------|-------|
| Active, Enabled | Green (solid) |
| Terminated, Suspended, Banned | Red (solid) |
| Inactive, Archived, Disabled | Gray (solid) |
| Pending, Under Review | Amber (solid) |
| Compliance Hold | Orange (solid) |
| Background Check Pending | Blue (solid) |
| Finance/domain statuses | Soft tinted (see statusColors.ts) |

### Implementation note
`StatusBadge` renders as a `<span>` (not the shadcn `<Badge>` wrapper) to prevent the Badge default variant's `bg-primary` (orange) from competing with the status color class. Tailwind safelist in `tailwind.config.ts` guarantees all status color classes are compiled.

---

## STANDARD 6 — Import Duplicate Handling

**Within the same import file:**
- If ALL mapped fields are identical → reject row with `DUPLICATE_ROW_IN_FILE` error
- If ANY field differs → allow import (enables multiple notes/historical records for same entity)

---

## STANDARD 7 — Import Error Reporting

**Imports must never fail silently.**

Every import batch produces:
- `createdRows`, `updatedRows`, `skippedRows`, `failedRows` counts
- Downloadable exception report (`GET /:batchId/export-errors`) — CSV including:
  - Row number, record identifier, field name, error code, error description, original value

---

## STANDARD 8 — Long-Running Jobs

**Large imports must run as background jobs. No HTTP timeout dependency.**

- Respond immediately with `status: "validating"` or `status: "committing"`
- Background job runs via fire-and-forget (`Promise.catch()`)
- Progress polled by UI via `GET /:batchId` (polling `importBatches.status`)
- Supports 5,000+ rows reliably via chunked DB writes

---

## STANDARD 9 — Data Integrity (Import Scope Restriction)

**Import processes may only modify their target entity.**

| Import | May Modify | May NOT Modify |
|--------|-----------|----------------|
| Driver import | `drivers`, `driver_notes`, `driver_documents` | `users`, `customers`, `accidents` |
| Employee import | `employees` | `users`, `drivers` |
| Claims import | `accidents` | `users`, `drivers`, `customers` |
| Account import | `customers` | `users`, `drivers`, `accidents` |

Enforced by `ImportUserGuard` (Standard 1) and by scoped repository functions in each import route.

---

## STANDARD 10 — Non-Destructive Data Policy

**Operational records must never be permanently deleted through normal application actions.**

### Soft-delete fields (all operational tables)
```
is_deleted      boolean  NOT NULL DEFAULT false
deleted_at      timestamp
deleted_by_user_id  varchar → users.id ON DELETE SET NULL
```

### Tables with soft-delete enforced
| Table | is_deleted | deleted_at | deleted_by_user_id |
|-------|-----------|------------|-------------------|
| drivers | ✅ | ✅ | ✅ |
| employees | ✅ | ✅ | ✅ |
| customers (accounts) | ✅ | ✅ | ✅ |
| accidents (claims) | ✅ | ✅ | ✅ |
| invoices | ✅ | ✅ | ✅ |
| payments | ✅ | ✅ | ✅ |
| trips (moves) | ✅ | ✅ | ✅ |
| vendors | ✅ | ✅ | ✅ |

### Rules
- Default queries must filter `is_deleted = false`
- If an object must leave active operations → change `status`, not delete
- Administrative restore is possible for any soft-deleted record
- No `DELETE FROM` statements for operational entities in normal application code

---

## STANDARD 11 — Centralized System Audit Log

**All significant write operations must generate an audit record.**

### Service
`server/services/systemAuditLogService.ts` — `writeSystemAuditEvent(event)`

### Table
`system_audit_log` — captures:
- `event_type` — e.g. `driver.status_changed`, `import.committed`, `import.policy_violation.user_creation`
- `actor_user_id`, `actor_user_email`
- `target_entity_type`, `target_entity_id`, `target_entity_label`
- `previous_value`, `new_value` (JSON)
- `metadata` (JSON — arbitrary context)
- `ip_address`
- `created_at`

### Domain-specific audit logs
Several modules maintain their own domain audit tables in addition to the system audit log:
- `claim_audit_logs` — per-claim change history
- `invoice_audit_log` — per-invoice change history
- `vendor_audit_log` — per-vendor change history
- `schedule_audit_logs`, `shift_swap_audit_logs` — scheduling
- `recruiting_permission_audit_log` — recruiting

---

## STANDARD 12 — Import Traceability

**All imports must be fully traceable from file upload to individual committed rows.**

### Batch tracking (`import_batches` table)
- `id` — batch UUID
- `source_file_name` — original upload filename
- `module_type` — e.g. `"drivers"`, `"employees"`, `"claims"`
- `created_by_user_id` — uploader
- `created_at` — upload timestamp
- `status` — lifecycle state machine: `uploaded → mapped → validating → validated → committing → committed | failed | cancelled | rolled_back`
- `committed_at`, `rolled_back_at`
- `created_rows`, `updated_rows`, `skipped_rows`, `failed_rows`

### Row tracking (`import_staging_rows` table)
- Every row from every import file is stored with its raw JSON, mapped JSON, validation errors, and final status

### Audit trail (`import_audit_log` table)
- Every create/update/skip/error during commit is logged with `batch_id`, `row_id`, `action`, entity ID, and message

---

## STANDARD 13 — Shared Reusable Components

The following must exist as platform-level reusable components:

| Component | Location | Purpose |
|-----------|----------|---------|
| Status badge | `client/src/components/StatusBadge.tsx` | Consistent status rendering |
| Status color map | `client/src/lib/statusColors.ts` | Single source of truth for badge colors |
| Import engine (UI) | `client/src/components/ImportWizard.tsx` | Shared wizard UI for all imports |
| Import engine (backend) | `server/routes/*Import.ts` | Async background job pattern |
| System audit log | `server/services/systemAuditLogService.ts` | Centralized audit writes |
| Import user guard | `server/services/importUserGuard.ts` | Prevents user creation during imports |
| Document service | `server/services/unifiedDocumentService.ts` | Platform-wide file storage |

Modules must reuse these components. Duplicating functionality from this list is a violation of this standard.

---

*Last updated: 2026-03-05*
*These standards are enforced in the DriverHub 360 codebase. Violations of Standard 1 trigger runtime errors and system audit log entries.*
