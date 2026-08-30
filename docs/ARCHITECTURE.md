# DriverHub 360 System Architecture

## System of Record Definition
- Primary source for all driver-related data, trips, and payroll calculations.
- Immutable storage for audit logs and eligibility snapshots.

## Ingestion Sources and Gates
- **CSV Import**: Manual upload for bulk trip data.
- **Scheduled Import**: Placeholder for automated data ingestion from external systems.
- **Manual Entry**: Single-trip entry through the corporate dashboard.
- **Ingestion Gate (Gate 1)**: `evaluateMoveEligibility()` runs for every move at the point of entry.

## Eligibility Snapshot Logic
- **Immutable State**: Snapshots are created at ingestion and never modified.
- **Statuses**: 
  - `PASS`: Eligible for payroll.
  - `WARN`: Eligible but flagged for review.
  - `FAIL`: Excluded from payroll.
- **Rules (v25b.1)**:
  - FAIL if driver safety state is not ACTIVE.
  - FAIL if driver has an active block (safety or manual).
  - FAIL if driver work type doesn't match move.
  - FAIL if execution mode is unsupported.

## Pay Period Lifecycle
1. **OPEN**: Initial state, moves can be assigned.
2. **PROCESSING**: Moves being reconciled, exceptions reviewed.
3. **LOCKED**: Terminal state, data is immutable, ready for export.
4. **EXPORTED**: Export metadata captured, period finalized.

## Enforcement Points
- **Ingest**: `evaluateMoveEligibility()` snapshots PASS/FAIL at trip creation.
- **Roster Export**: `canIncludeInRoster()` excludes drivers with non-ACTIVE states or frozen markets.
- **Payroll Export**: `filterMovesForPayrollExport()` restricts export to LOCKED periods and PASS moves.
- **Status Transitions**: Centralized permission matrix enforces authorized user actions.
