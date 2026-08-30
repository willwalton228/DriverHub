# Recruiting Pre-Expansion Functional Baseline

**Epic:** DriverHub 360 — Recruiting Module Expansion  
**Phase:** 0 — Foundation  
**Environment:** Staging; initial baseline plus authorized Gate 0 remediation evidence
**Purpose:** Distinguish the existing Recruiting state from any regression introduced by a later approved Recruiting Expansion ticket.

## Test boundaries

The initial baseline did not create, edit, approve, close, cancel, clone, archive, or delete any Recruiting record. Gate 0 remediation later created one clearly labeled immutable audit event solely to verify the fail-closed provider boundary; it did not create or alter a Request, Campaign, Candidate, Application, Job Posting, Activated Driver, or protected reference record.

The available preview has no authenticated Recruiting session. The Request-submission path can invoke Microsoft Graph email when configured. A staging/development-only fail-closed delivery safeguard has now been implemented and verified at the provider boundary; no request submission or other authenticated workflow could be exercised without an authenticated UAT session. A result marked **NOT RUN** is not a pass and must be completed in an authorized authenticated UAT session before a phase depends on it.

The implemented delivery control and verification evidence are documented in the [Gate 0 Architecture Clarification and Safe UAT Plan](gate-0-architecture-clarification-and-safe-uat-plan.md) and the [Gate 0 Remediation Evidence Package](gate-0-remediation-evidence-package.md).

## Baseline result summary

| Result | Count | Meaning |
| --- | ---: | --- |
| PASS | 7 | Build, focused Recruiting suites, protected API boundary, and delivery suppression were verified |
| FAIL | 5 | Existing Candidate/Application suite assertions fail after the suite is unblocked |
| NOT RUN | 14 | Requires authenticated, mutation-capable, or delivery-safe UAT access |

## Verified checks

| Function | Evidence | Result |
| --- | --- | --- |
| Production build | `npm run build` completed successfully. Existing non-Recruiting warnings were emitted but did not fail the build. | PASS |
| Recruiting engine unit coverage | `server/services/recruitingEngine.test.ts` | PASS — 51 tests |
| Job Posting validation/normalization | `server/services/recruitingJobPostings.test.ts` | PASS — 7 tests |
| Recruiting file storage unit coverage | `server/services/recruitingFileStorage.test.ts` | PASS — 30 tests; the shared-schema parser block no longer prevents the suite from loading. |
| Recruiting delivery safety unit coverage | `server/services/recruitingDeliverySafety.test.ts` | PASS — 3 tests; non-production is fail-closed and production is excluded. |
| Microsoft Graph delivery suppression | Controlled development/staging provider-boundary verification returned `RECRUITING_EXTERNAL_DELIVERY_SUPPRESSED` and persisted a `GATE_0_DELIVERY_SUPPRESSION_VERIFIED` audit event. No Graph request or external delivery occurred. | PASS |
| Protected API access boundary | Unauthenticated GET requests to `/api/recruiting/requests` and `/api/recruiting/campaigns/closed` both returned `401 Not authenticated`. | PASS |

## Core functional baseline matrix

| Function / route | Result | Current evidence or reason |
| --- | --- | --- |
| Recruiting main page — `/recruiting` | NOT RUN | Requires an authenticated session. A baseline capture records the current login boundary. |
| Recruiting Request Form | NOT RUN | Requires authenticated interaction. |
| Request submission | NOT RUN | The safe staging delivery control is verified, but no authenticated UAT session was available to submit disposable data through the actual route. |
| Approval workflow | NOT RUN | Requires an authenticated user and persistent status/approval changes. |
| Request list — `/recruiting/requests` | NOT RUN | API and screen require authentication. |
| Active Campaigns — `/recruiting`, `/recruiting/campaigns` | NOT RUN | API and screen require authentication. |
| Closed Campaigns | NOT RUN | API and screen require authentication. |
| Campaign Detail | NOT RUN | Requires authenticated access. |
| Edit Campaign | NOT RUN | Requires authenticated access and would alter protected data to test persistence. |
| Close Campaign | NOT RUN | Requires authenticated access and a persistent lifecycle update. |
| Cancel Campaign | NOT RUN | Requires authenticated access and a persistent lifecycle update. |
| Clone as New Request | NOT RUN | Creates a persistent Request and was intentionally not performed. |
| Activated Drivers | NOT RUN | Adding/removing links changes protected Campaign/Driver history. |
| Job Postings | PASS | Seven focused tests verify URL, source, date, status, notes, and edit normalization rules. No live records exist in the current baseline. |
| Search | NOT RUN | Requires authenticated UI access. |
| Filters | NOT RUN | Requires authenticated UI access. |
| Recruiting metrics/widgets | NOT RUN | Requires authenticated UI access. |
| Recruiting engine rules | PASS | 51 focused unit tests cover capacity, hiring eligibility, compensation/rate checks, and audit behavior. |

## Representative regression records

Use these Request IDs as **read-only reference records** for future UAT. They represent current Request-centered Campaign data; do not edit them solely to perform a regression test.

| Lifecycle reference | Request ID | Account / Campaign label | Type / urgency | Driver requirements | Target / pay | Dates | Contacts | Activated Drivers / Postings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Closed | `5458f510-7372-4ca1-bae3-a61469f24e43` | GRAPEVINE LINCOLN / service | service / 3 | Independent Contractor; Full-Time | 1 / $17.00 | Start 2026-06-02; target 2026-06-26; actual close 2026-06-17 | Recruiter: Chennell Tennant; Cert Liaison: Hugo Garzon | 1 / 0 |
| Active (`open_active`) | `dd17e215-a57a-4e8b-a5b6-35fbdbff2f83` | SEWELL LINCOLN / service | service / 3 | Independent Contractor; Full-Time | 2 / $17.00 | Start 2026-08-21; target 2026-09-11; no actual close | Recruiter: Chennell Tennant; Cert Liaison: Hugo Garzon | 0 / 0 |
| Open | `c33f1a9e-5d6d-4801-8287-684fb556fdd7` | SEWELL LINCOLN / service | service / 5 | Independent Contractor; Full-Time | 4 / $17.00 | Start 2026-07-29; target 2026-08-21; no actual close | Recruiter: Chennell Tennant; Cert Liaison: Hugo Garzon | 0 / 0 |
| Cancelled | `f102e5a1-2145-4725-9a03-135774c6d78b` | JOE RIZZA FORD OF ORLAND PARK / service | service / 5 | Employee; Full-Time | 1 / $18.00 | No start date; target 2026-08-21; no actual close | Recruiter: Chennell Tennant; Cert Liaison: Hugo Garzon | 0 / 0 |

The Request record does not provide a single independent Campaign label field for these operational Campaigns; the Account and Campaign Type are the current reference label. Job Posting count is zero for all records because the supplemental Campaign Manager / Job Posting tables currently have no rows.

## Current status baseline

The staging data snapshot contains:

| Current Request approval / linked Requisition status | Count | Baseline interpretation |
| --- | ---: | --- |
| Approved / `closed` | 40 | Closed Campaign reference population |
| Approved / `open_active` | 14 | Active Campaign population |
| Approved / `open` | 4 | Open Campaign population |
| Approved / `cancelled` | 7 | Cancelled Campaign population |
| Pending Approval | 0 observed | No representative record available for runtime baseline |
| Paused | 0 observed | No representative record available for runtime baseline |
| Legacy Completed | 0 observed | No current record available for verification |

The approved UI requirement is Pending Approval, Active, Paused, Cancelled, and Closed. Current storage and UI use multiple status vocabularies (`open`, `open_active`, `closed`, and historical `completed` handling). This is a **pre-existing architecture/status-mapping concern**, documented in the architecture audit; it is not a later Recruiting Expansion regression.

## Existing defects and known constraints

| Classification | Finding | Baseline treatment |
| --- | --- | --- |
| Resolved test-infrastructure defect | The duplicate shared-schema type aliases were renamed only in their duplicate domains, preserving the original aliases used by their established consumers. A separately discovered duplicate `crypto` import in `server/recruitingService.ts` was removed. The formerly blocked files now load. | PASS — no runtime schema/table change; see the Gate 0 clarification. |
| Existing Candidate/Application test failures | `server/services/recruiting.test.ts` now executes 32 tests; 27 pass and 5 fail. The failures are duplicate-candidate expected-return versus current `DUPLICATE_CANDIDATE` behavior (2), duplicate-application error-text mismatch (1), and transition-validator boolean-versus-object expectation mismatch (2). | Existing non-blocking Candidate/Application technical debt for Gate 0. There is no observed Campaign data corruption, security exposure, or protected Campaign-path dependency; do not repair under this authorization. |
| Existing architecture concern | Request, Requisition, Campaign Manager, and legacy/new ATS records use differing status and identity conventions. | Documented in `recruiting-architecture-data-model-audit.md`; no correction is authorized by this baseline ticket. |
| Controlled operational risk | Request submission and approval can invoke Microsoft Graph; candidate communication can invoke SendGrid/Twilio. | In non-production, Recruiting-marked Graph sends and candidate SendGrid/Twilio sends are fail-closed and recorded as suppressed. Production behavior is excluded from the safeguard. No external message was sent. |
| Environment limitation | Preview and APIs are authenticated-only; the available capture receives 401 responses. | NOT RUN. This is not evidence that the authenticated Recruiting feature fails. |
| Coverage gap | No current staging records represent Pending Approval, Paused, or legacy Completed status. | NOT RUN. Select or create approved test data only under a separately authorized UAT plan. |

## UI capture evidence

The following baseline image files were captured at 1280×720:

| Requested screen | File | Result |
| --- | --- | --- |
| Recruiting main route | `screenshots/recruiting/pre-expansion-recruiting-main.jpg` | Login screen shown; unauthenticated Recruiting API returned 401. |
| Campaign Manager route | `screenshots/recruiting/pre-expansion-campaign-manager.jpg` | Login screen shown; unauthenticated Recruiting API returned 401. |
| Recruiting main route, remediation check | `screenshots/recruiting/gate-0-recruiting-current.jpg` | Login screen shown at 1280×720; browser reported an unauthenticated `401`. This confirms the access limitation, not authenticated UI behavior. |

No authenticated Recruiting or light/dark-mode screen capture was possible without a safe, authenticated UAT session. These captures establish the current access boundary only, not the authenticated screen presentation.

## Required authenticated UAT completion checklist

Before Phase 1 relies on this baseline, an authorized UAT session must complete the remaining **NOT RUN** checks using the representative references above and any approved test records for Pending Approval and Paused. Record this evidence in the [Mandatory Phase UAT Gates](recruiting-expansion-uat-gates.md) package:

1. View Request list, Active Campaign, Closed Campaign, Campaign Detail, Campaign edit, filters/search, and metrics.
2. Verify the four reference records retain the documented values after browser refresh.
3. Exercise approval, close, cancel, clone, and activated-driver paths only with approved non-production test data and a documented cleanup plan.
4. Verify Job Posting create/edit/remove against an approved test Campaign, with no external job-board or email delivery invoked.
5. Capture authenticated light-mode and dark-mode screenshots at supported desktop widths.
6. Record any observed behavior that differs from this document as either an existing defect or a newly introduced regression, based on the date and change history.

## Regression classification rule

A future finding is a Recruiting Expansion regression only when:

1. The behavior passed in this baseline or is explicitly documented as the expected reference behavior; and
2. The behavior changed after the relevant approved Recruiting Expansion work.

Existing defects, known architecture concerns, unavailable coverage, and outbound-delivery restrictions remain separate until a specifically authorized ticket addresses them.