# Recruiting Expansion — Phase 0 Gate 0 Remediation Evidence Package

**Date:** August 22, 2026
**Environment:** Staging/development workflow backed by the staging database  
**Gate decision:** **GATE 0 — FAIL / INCOMPLETE**
**Phase 1 status:** **NOT AUTHORIZED**

## Scope delivered

- Corrected duplicate exported type aliases in the shared schema without changing a runtime schema object, database table, enum, relationship, migration, or existing data.
- Removed one redundant duplicate `crypto` import that otherwise prevented the unblocked Recruiting suite from parsing.
- Added a development/staging-only, fail-closed Recruiting external-delivery safeguard for Microsoft Graph, SendGrid, and Twilio paths.
- Added suppressed-delivery audit evidence using existing append-only Recruiting audit records.
- Provisioned the three approved staging-only UAT identities through the normal local password-login path and executed the authenticated Gate 0 matrix.
- Restored least-privilege Account and Driver discovery for approved Recruiting users without granting Account or Driver administration access.
- Added the missing migration for the existing organization-scoped Recruiting approval-settings and audit tables.
- Corrected approval-recipient resolution to use the event organization, the current delegation window, and the authoritative `delegation_enabled` field.
- Added shared loading, error, and retry states to the Active and Closed Campaign lists without changing list data, filtering, sorting, counts, or navigation behavior.

No Candidate/Application feature work, data-model refactor, production behavior change, production deployment, external delivery, or Phase 1 work was performed.

## Test data and data integrity

- Protected reference Request/Campaign records were not modified.
- Clearly labeled disposable UAT Requests remain in staging only and are terminal `closed` or `cancelled`. The dedicated Recruiting UAT identities cannot archive records by design; no protected record was modified.
- Clearly labeled UAT Campaign/requisition records remain only in terminal `closed` or `cancelled` status. Their manually entered Job Postings were marked `removed`.
- Disposable Activated Driver relationships were created, verified, and removed; no test relationship remains.
- No Candidate or Application record was created, changed, or deleted.
- The tests used only the staging database and no external email or SMS was delivered.

## Developer verification

| Check | Expected result | Actual result | Result |
| --- | --- | --- | --- |
| Shared-schema duplicate correction | Formerly blocked files load without duplicate-type parsing errors. | Both files loaded. | PASS |
| `recruitingFileStorage.test.ts` | Suite runs. | 30 passed. | PASS |
| `recruiting.test.ts` | Suite runs. | 32 ran: 27 passed, 5 failed. | FAIL |
| Recruiting Engine + Job Posting suites | Existing focused coverage remains green. | 58 passed. | PASS |
| Recruiting role-guard regression suite | Recruiting module-read roles include Standard Recruiter and Recruiting Admin, and exclude Driver. | 13 passed. | PASS |
| Delivery safety unit test | Development/staging fail closed; production unaffected. | 3 passed. | PASS |
| Recruiting approval-settings resolver regression | No org/configuration resolves no recipient; primary and active delegated approvers resolve correctly; submission and approval-required definitions are organization-scoped. | 5 passed. | PASS |
| Approval-settings migration | Both authoritative settings tables are present and migration tracking records the migration. | `0084_recruiting_approval_settings` applied in staging. | PASS |
| Staging notification dry run | Submission and approval-required resolution execute without a missing-relation error. | No configured approver record exists, so both resolve zero recipients safely; no delivery was attempted. | PASS |
| Production build | Application builds. | `npm run build` completed successfully. | PASS |
| Graph suppression verification | No Graph request; an audit event captures the suppressed attempt. | Returned `RECRUITING_EXTERNAL_DELIVERY_SUPPRESSED`; immutable audit event persisted with provider, recipient, trigger, environment, reason, and timestamp. | PASS |
| Campaign-list state remediation | Active and Closed lists have distinct loading, empty, and error paths; errors use safe messaging and an in-place query retry. | Shared list-state components are used by both list queries; `npm run build` completed successfully after the change. | PASS |

Final targeted regression total: **118 passed, 5 failed, 123 executed**.

### Existing test failures

The now-executable `recruiting.test.ts` reports five pre-existing Candidate/Application failures:

1. Two duplicate-candidate tests expect an existing Candidate to be returned; the current service throws `DUPLICATE_CANDIDATE`.
2. One duplicate-application test expects `Application already exists`; the current service returns `Candidate is already attached to this job posting.`
3. Two workflow-transition tests expect booleans; the current validator returns result objects such as `{ valid: true, transition }`.

These are recorded as failures. They are classified as **existing non-blocking Candidate/Application technical debt for Gate 0**: the observed failures are test/service-contract mismatches, with no evidence of protected Campaign data corruption, security exposure, or a Campaign workflow dependency. They were not repaired because Candidate/Application work is outside the approved Phase 0 scope. They must be re-evaluated before a Candidate/Application phase begins.

### Authenticated UAT preflight

| Check | Evidence | Result |
| --- | --- | --- |
| `APP_ENV` | Runtime environment reports `staging`. | PASS |
| Database environment | Application resolver selected the staging database path; a read-only connection check succeeded against the connected database. | PASS |
| Production database isolation | The provisioner rejects `production` before loading the database, and this run resolved `APP_ENV=staging`; no production connection was made. | PASS |
| `RECRUITING_EXTERNAL_DELIVERY_MODE` | Runtime environment reports `fail_closed`. | PASS |
| External Recruiting communication safety | Existing staging suppression unit/Graph verification remains recorded; no provider call is made for audited non-production Recruiting delivery. | PASS |
| Three approved UAT identities | The staging-only provisioner succeeded after the three secret-supplied password values were corrected. It created the standard Recruiter, Recruiting Admin, and driver-role unauthorized-control accounts with the approved market permissions. | PASS |
| Standard user login | Normal local email/password login established a password session for the `recruiter` account. | PASS |
| Recruiting admin login | Normal local email/password login established a password session for the `recruiting_admin` account. | PASS |
| Unauthorized-control login | Normal local email/password login established a password session for the `driver` account. | PASS |

## Outbound communication evidence

The development setting is `RECRUITING_EXTERNAL_DELIVERY_MODE=fail_closed`. Non-production Recruiting delivery fails closed even if that setting is absent or unfamiliar; production bypasses the safeguard.

No email or SMS was delivered. No recipient routing, production credential, provider configuration, or production behavior was changed.

## Authenticated functional, permission, and UI UAT

### Session and delivery controls

The dedicated accounts were used only through normal password login. No password was printed, reset, or reused from an operational user. The UAT runner used isolated browser contexts for the standard Recruiter, Recruiting Admin, and driver-role unauthorized control.

| Required item | Evidence | Result |
| --- | --- | --- |
| Request validation | Missing Campaign Type returned the expected structured `400` validation error without creating a Request. | PASS |
| Standard Recruiter Request create, persistence, and refresh | A disposable Request was created, was returned by the Request list, and remained present after navigation/refresh. | PASS |
| Submission notification suppression | The Request submission created a suppressed-delivery audit record; workflow logs confirm Graph delivery was suppressed before provider delivery. | PASS |
| Standard Recruiter account search | `GET /api/accounts/search` returned `200` and the minimal Account selector payload. | PASS |
| Standard Recruiter driver search | `GET /api/drivers/search` returned `200` and the minimal Driver selector payload. | PASS |
| Recruiting Admin Account and Driver search | Both discovery endpoints returned `200` with the same restricted selector fields. | PASS |
| Unauthorized Driver discovery control | Both discovery endpoints returned `403`; no Account or Driver data was returned. | PASS |
| Recruiting Admin request visibility | In isolated sessions, `recruiting_admin` received `200` from the Request list and pending queue and both contained the Standard Recruiter's new disposable Request. | PASS |
| Recruiting Admin approval and persistence | The same `recruiting_admin` account approved the disposable Request with `200`; the Request persisted as `approved` and created its linked requisition. | PASS |
| Approval notification suppression | Submitter, operations, and assignment alerts were recorded as suppressed; no Graph call was made. | PASS |
| Approval auto-campaign retrieval contract | A disposable Request was approved with `200`; the response returned the linked Requisition plus the Request-keyed `operationalCampaign.detailPath`. The resulting Campaign Detail, refresh, edit, close, and post-close refresh all returned `200`. | PASS |
| Explicit Campaign creation and carry-forward | A disposable Campaign linked to the approved Request was created. Its Request start date carried forward and remained persisted. | PASS |
| Active Campaign edit and refresh | Name, budget, priority, and notes updated and remained after re-fetch. | PASS |
| Job Posting validation, create, edit, view, and refresh | Invalid URL returned `400`; valid posting created, displayed, updated, and remained after re-fetch. | PASS |
| Recruiting Admin Activated Drivers | The `recruiting_admin` account received `200` for read-back, link, and removal of a disposable relationship. The relationship was removed before cleanup. | PASS |
| Standard Recruiter Activated Drivers | The standard `recruiter` account linked the disposable driver, retrieved it after refresh, and removed it after the closed-campaign check. | PASS |
| Campaign closure | The authoritative Request/requisition close path required and persisted the business closing date. | PASS |
| Separate cancellation path | A distinct disposable Campaign persisted its `cancelled` status. | PASS |
| Closed Campaign list/detail | The closed Request appeared in the Closed Campaign list with the expected business date, `Open Days = 2`, `Schedule Variance = 2`, one linked driver at observation time, and a WIW-hours field. | PASS |
| Metrics retrieval | Campaign metrics returned `200`; a failed retrieval was not treated as zero. | PASS |
| Metrics reconciliation | All API-returned count and money fields matched read-only staging aggregates from `recruiting_campaigns`. | PASS |
| Unauthorized Recruiting access | Driver-role control received `403` for Request list/detail, Campaign list, Request approval, and Activated Driver read/link operations. | PASS |
| Unauthorized Job Posting create | Superseded by the P0 remediation verification below. | PASS |
| Candidate/Application expansion flows | Candidate/Application creation and workflow expansion are outside the approved Gate 0 scope. The five pre-existing focused test failures remain recorded above. | NOT APPLICABLE |

### Authenticated UI observations

| Required item | Evidence | Result |
| --- | --- | --- |
| Light mode | Standard Recruiter Recruiting screen rendered at desktop width without a boundary failure. | PASS |
| Dark mode | Standard Recruiter Recruiting screen rendered at desktop width without a boundary failure. | PASS |
| Active Campaign list, search, filters, sorting | The authenticated list rendered; its UAT row appeared; urgency sorting responded; text search produced the no-match empty state; the Campaign Status filter control opened; and clear-filter was available. | PASS |
| Empty state | A no-match search displayed the explicit filter-empty state and clear-filter action. | PASS |
| Loading state | A deliberately delayed Campaign-list request did not expose a visible loading state. | Remediated in developer verification: both Active and Closed lists now render a visible skeleton treatment during initial retrieval and while retrying an error. Authenticated delayed-response UAT remains to be re-run. | PASS — developer verification |
| Error and retry state | A deliberately aborted Campaign-list request did not expose a visible error message or retry action. | Remediated in developer verification: both lists now render a safe user-facing error alert and an in-place Retry action that re-executes the failed query. Authenticated failure/retry UAT remains to be re-run. | PASS — developer verification |
| Closed Campaign desktop detail | The closed Campaign detail rendered without an unexpected application or page-boundary failure. | PASS |
| Unauthorized frontend session | The driver-role session rendered a stable Recruiting page; backend mutation controls are recorded separately above. | PASS |

### Approval-to-Campaign identifier and detail resolution

Validated on 2026-08-22 in staging with external Recruiting delivery remaining fail-closed.

#### Approval response contract

- **Approval endpoint:** `PATCH /api/recruiting/requests/:id/status`
- **Disposable Request ID:** `0e34c13f-8c76-4e50-88d0-0955861dc18e`
- **Created/linked Requisition ID:** `b343604e-8a66-40d6-819d-3dd6add4f21c`
- **Operational Campaign identifier:** the originating Recruiting Request ID, not the Requisition ID.
- **Response fields:** `campaignRequisitionId`, `operationalCampaign.requestId`, `operationalCampaign.requisitionId`, `operationalCampaign.detailPath`, and the existing `_autoCampaign` object.
- **Navigation target returned by approval:** `/recruiting/campaigns/0e34c13f-8c76-4e50-88d0-0955861dc18e`

The approval response keeps `_autoCampaign` for the created Requisition display data, but now explicitly identifies the Request-keyed operational Campaign detail route. The UI uses this returned detail path after approval and from the approval success dialog.

#### Campaign Detail resolution

- **Client route:** `/recruiting/campaigns/:requestId`
- **Operational detail API:** `GET /api/recruiting/requests/:requestId`
- **Operational model/table:** `recruiting_requests` is the Campaign lifecycle authority.
- **Requisition relationship:** `recruiting_requests.campaign_requisition_id` links to `recruiting_requisitions.id`; the reciprocal `recruiting_requisitions.source_request_id` points back to the Request.
- **Legacy Campaign Manager API:** `GET /api/recruiting/campaigns/:id` queries `recruiting_campaigns` by its own primary key and has no Request/Requisition fallback.

The prior `404` occurred because the newly created Requisition ID was supplied to the legacy Campaign Manager detail endpoint. A Requisition is not a `recruiting_campaigns` row, so that lookup correctly found no record. No ID copying, synthetic Campaign Manager record, primary-key change, or model consolidation was used to correct it.

#### Authenticated regression evidence

| Check | Result |
| --- | --- |
| Standard Recruiter creates disposable Request | `201` |
| Recruiting Admin approves the Request | `200` |
| Approval response Request → Requisition linkage | Request ID and `campaignRequisitionId` matched the explicit operational response contract |
| Returned operational detail API | `GET /api/recruiting/requests/:requestId` returned `200` |
| Detail refresh | `200`; Request ID and Requisition relationship remained intact |
| Edit Campaign | `PATCH /api/recruiting/requests/:requestId/details` returned `200` and persisted after refresh |
| Close Campaign | `200`; Requisition status became `closed` and the Request retained the business closing date |
| Closed Campaign reporting | `GET /api/recruiting/campaigns/closed` returned `200` and included the Request |
| Duplicate/orphan check for the UAT record | One linked Requisition, reciprocal Request link, zero legacy Campaign Manager rows, and no orphaned relationship |

#### Existing-record scope

Read-only staging audit found 71 Requests with linked Requisitions. All 71 links were reciprocal and none were orphaned, but all 71 lack a corresponding `recruiting_campaigns` row. This is the same identifier-boundary mismatch, not corrupt data. No historical data migration or repair was performed.

The dedicated `recruiting_admin` UAT account cannot archive campaigns by design; its archive cleanup request returned `403`, preserving the intended separation between Recruiting workflow administration and Corporate/Super Admin archive authority. The disposable record remains clearly labeled, closed, and unarchived pending permitted staging cleanup.

### Recruiting role matrix

| Capability | Standard Recruiter | Recruiting Admin | Driver-role unauthorized control |
| --- | --- | --- | --- |
| Enter approved Recruiting workflows | Yes, through Recruiting-scoped read/write permissions. | Yes, through Recruiting-scoped admin permissions. | No protected Recruiting API access. |
| Create and view Requests | Yes. | Yes, including the pending Request queue. | `403` for Request list and detail. |
| Approve or reject a Request | No. The final-decision endpoint does not accept the standard `recruiter` role; a direct isolated-session check returned `403`. | Yes. | `403`. |
| Create/edit Campaign data from an approved Request | May work within the existing Recruiter workflow. | Yes; Admin controls and server allowlists agree. | `403` for Campaign access. |
| View, link, or remove Activated Drivers | Yes, within the existing Recruiting workflow. | Yes. | `403`. |
| Account/Driver discovery for Recruiting selectors | Yes, restricted DTOs only. | Yes, restricted DTOs only. | `403`. |
| Corporate Account/Driver administration, unrelated archive/decommission authority | No. | No. | No. |

The frontend role gates now include `recruiting_admin` wherever the corresponding Recruiting API allows Request approval, Campaign editing/creation, or Activated Driver management. Server-side authorization remains authoritative. Archive mutation authority remains with the existing Super/Corporate Admin paths and was not widened.

### Staging runtime observation

The missing-relation defect was traced to a schema/migration mismatch: `recruiting_approval_settings` and its append-only audit table were already the authoritative source declared in the shared schema and used by the existing Approval Ownership UI and storage layer, but no migration created either relation. This was condition **B** (schema definition exists but migration is missing), not a deprecated table or an alternative settings source.

Migration `0084_recruiting_approval_settings` created those existing authoritative relations in staging. Recipient resolution also referenced the obsolete `is_delegated` column and selected an unscoped first row. It now queries `delegation_enabled` for the event organization and treats delegation as active only within its configured date window.

No settings record was seeded or inferred. With no configured approver, Request-submission and approval-required resolution returns an empty set, producing no raw SQL error and no arbitrary recipient. The Approval Ownership UI now describes this safe behavior accurately. An authorized administrator may configure the existing settings screen when an approved approver is identified.

### Production safety

No production database or delivery configuration was modified. Production must apply migration `0084_recruiting_approval_settings` with the release so its schema matches the existing shared-schema/storage contract. The migration is idempotent, creates no recipient configuration, and changes no existing notification recipients. Until an organization configures an approver through the existing approval-settings screen, the resolver safely returns no approver rather than selecting a fallback recipient. The staging fail-closed external-delivery safeguard remains in effect for this remediation.

### Job Posting authorization remediation

The Job Posting path was traced end-to-end. Both Recruiting UI variants had presented Add/Edit/Remove controls to every authenticated session, while the list, create, and update routes applied `isAuthenticated` but no Recruiting authorization. The update route is also the status-change and soft-remove mechanism; there is no separate delete endpoint.

The remediation uses the existing Recruiting permission model and the trusted Campaign record, not client-supplied role or market data:

- List/read requires the established `read` permission and access to the Campaign’s persisted market.
- Create, edit, posting-status changes, and soft-remove require the established `write` permission and access to that persisted market.
- A marketless record is denied to a non-admin user rather than bypassing scope.
- Both Recruiting UI variants hide Add, Edit, Remove, and status-changing controls for roles that cannot manage Job Postings. Read access remains server-enforced.

| Role / operation | Direct staging verification | Result |
| --- | --- | --- |
| Standard Recruiter | List `200`; create `201`; edit `200`; soft-remove `200` on a clearly labelled disposable UAT Campaign in the assigned `UAT-GATE-0` market. | PASS |
| Recruiting Admin | List `200`; create `201`; edit `200`; soft-remove `200` on the same in-scope UAT Campaign. | PASS |
| Unauthorized Driver control — read | Direct list request using the known Campaign ID returned `403`. | PASS |
| Unauthorized Driver control — create | Direct valid create request using the known Campaign ID returned `403`. | PASS |
| Unauthorized Driver control — edit/status/remove | Direct PATCH requests using a known Posting ID returned `403` for normal status update and `removed` status mutation; no record was changed. | PASS |
| Standard Recruiter UI | The Campaign-row action menu rendered Add Job Posting. | PASS |
| Unauthorized Driver UI | No Campaign-row action menu or Job Posting mutation control was rendered for the no-access session. | PASS |
| Recruiting Admin UI navigation | Request approval, Campaign edit/creation, and Activated Driver controls include `recruiting_admin`, matching the verified server routes. | PASS |

All Job Postings created during this regression were immediately soft-removed. No protected Campaign or production data was changed.

### Recruiting discovery authorization remediation

The previously blocked selector paths were traced and corrected without widening the Corporate Account or Driver modules:

| Caller / route | Previous state | Corrected access | Returned data |
| --- | --- | --- | --- |
| Request-form Account selector (`RecruitingRequestsTab`) → `GET /api/accounts/search` | Standard Recruiter received `403`. | Recruiting `read` permission may use the selector; Corporate users retain existing access. | ID, name, active status, address/city/state/ZIP, dealer ID, network, address-presence flag. |
| Main Recruiting page’s Account dependency (`Recruiting.tsx`) | Read the broader `/api/corporate/customers` list. | Uses the restricted Account selector instead; `/api/corporate/customers` remains Corporate-only. | Same minimal Account selector payload. |
| Campaign detail/edit Account hydration (`ActiveCampaignsList`, `EditCampaignModal`) | Used the selector but could silently treat a `403` as missing data. | Uses the authorized selector and presents a retryable error state. | Same minimal Account selector payload. |
| Campaign close / activated-driver selectors (`ActiveCampaignsList`) → `GET /api/drivers/search` | Standard Recruiter received `403` and the UI treated failures as empty results. | Recruiting `read` permission may use the selector; the UI presents a retryable error state. | ID, display name, employee ID, status, employment/classification/type, hire date, market. No email, phone, SSN, DOB, or password data. |
| Campaign-specific suggested and activated drivers | Any authenticated session could read the records. | Requires Recruiting `read` plus access to the trusted Request market. | Existing selector-level driver fields only. |

`drivers.market` cannot currently provide reliable Recruiting scope enforcement: the staging check found 19,635 non-deleted driver records without a market and no exact or normalized overlap with the Standard Recruiter’s authorized Recruiting markets. Applying that filter left approved users with no usable Driver discovery. The accepted least-privilege control is therefore route-specific Recruiting `read` authorization, a 25-result Driver limit, and a deliberately restricted DTO. This does **not** grant `/api/corporate/drivers`, Driver edits, Driver administration, `/api/corporate/customers`, Account detail, or Account administration access. A future authoritative driver-to-Recruiting-market mapping can safely tighten this selector further.

Focused unit coverage verifies authorized Standard Recruiter and Recruiting Admin discovery access, Driver-role denial, and that Account/Driver selector DTOs omit restricted fields. Authenticated staging UAT verified separate sessions for all three roles: Standard Recruiter and Recruiting Admin received `200`; the Driver control received `403`; returned selector records contained no email, phone, SSN, DOB, or password field.

## Protected Campaign regression

The protected Campaign baseline remains the reference. Only clearly labeled disposable staging records were created, then archived or placed in terminal status. No protected Campaign data or behavior was altered.

## Known limitations

- The five explicit Candidate/Application test failures remain unresolved technical debt outside this phase.
- No approver is currently configured in the new staging settings table; the deliberate safe default is zero configured approver recipients until an authorized administrator saves an approved owner.
- The current authenticated Recruiting page has a Gate 0-blocking runtime crash in the Active Campaigns table, recorded in the independent re-verification below.

## Recommendation

**GATE 0 — FAIL / INCOMPLETE.** The independent re-verification below confirms the server-side remediation scenarios and controlled staging-delivery safeguards, but also reproduces an authenticated Recruiting-page crash before the required Campaign-list UI states can render. No exception has been approved. Do not begin Phase 1.

---

## Independent clean staging re-verification — August 22, 2026

This section records a new verification-only audit. No Recruiting implementation, Candidate/Application behavior, MoveNow credential, Contract Products behavior, production data, or external communication was changed.

### Preconditions and controlled test data

| Item | Evidence | Result |
| --- | --- | --- |
| Environment | `APP_ENV=staging`; staging database connection selected by the running application. | PASS |
| Delivery safety | `RECRUITING_EXTERNAL_DELIVERY_MODE=fail_closed`. Submission and approval audit records report `RECRUITING_EXTERNAL_DELIVERY_SUPPRESSED`; no provider delivery occurred. | PASS |
| Identities | Existing staging-only Standard Recruiter (`recruiter`), Recruiting Admin (`recruiting_admin`), and Driver-role control (`driver`) signed in through the normal password-login route. | PASS |
| Disposable data | New clearly labeled `GATE0-VERIFY-*` Request, linked Requisition, explicit legacy Campaign used only for the legacy Job Posting route, two removed Job Postings, one linked-then-removed Activated Driver relationship, and a separate cancelled Request. | PASS |
| Protected-data isolation | No protected Request, Campaign, Candidate, Application, MoveNow credential, or Contract Product was modified. | PASS |

### Remediation references and blocker results

| Gate 0 blocker / remediation workstream | Roles and scenario | Expected result | Actual result | Result |
| --- | --- | --- | --- | --- |
| B1 — Job Posting authorization | Driver-role control attempted create, edit, status change, and soft-remove against known disposable records; Standard Recruiter and Recruiting Admin performed permitted operations. | Control receives `403` for every mutation; approved Recruiting roles can manage in-scope postings. | Control received `403` for create, edit, status, and remove. Standard Recruiter and Recruiting Admin each created/updated/removed a disposable posting; both records persisted as `removed`. | PASS |
| B1 — frontend mutation controls | Authenticated browser check of the Recruiting page. | Unauthorized session has no Job Posting mutation controls. | Cannot be re-verified because the Recruiting page crashes before Campaign controls render; see B6. Server enforcement above remains verified. | BLOCKED BY B6 |
| B2 — restricted Account/Driver discovery | Standard Recruiter and Recruiting Admin used selector routes; Driver-role control and Standard Recruiter corporate-admin routes were exercised. | Approved Recruiting roles get minimal selector DTOs only; control and corporate-admin routes remain denied. | Both approved roles received `200`; Driver control received `403`; Standard Recruiter received `403` from corporate Account and Driver administration routes. Returned selector fields contained no email, phone, SSN, DOB, password, or token fields. | PASS |
| B3 — Recruiting Admin visibility, approval, and Activated Drivers | Standard Recruiter created a Request; Recruiting Admin read list/pending/detail, approved it, linked/read/removed an Activated Driver; Standard Recruiter also linked/read/removed the relationship; Driver control attempted protected routes. | Admin can see/approve/manage relationships; approved Recruiter workflow remains usable; Driver control is denied. | List/pending/detail and approval returned `200`; relationship persistence and removal passed for both approved roles. Driver control received `403` for Request and Activated Driver access. | PASS |
| B4 — Request-to-Requisition/Campaign identity contract | Standard Recruiter created a disposable Request; Recruiting Admin approved, opened Request-keyed detail, refreshed, edited, refreshed, closed, and read closed reporting. | Approval returns a Request-keyed operational detail path with linked Requisition; no synthetic Request/Requisition key substitution. | Approval returned the originating Request ID, linked Requisition ID, and `/recruiting/campaigns/:requestId`. Request detail/edit/refresh/closure and closed reporting returned `200`. Before deliberately creating the separate legacy Job-Posting record, the Requisition ID correctly returned `404` from the legacy Campaign Manager route. | PASS |
| B4 — relationship reconciliation | Read-only staging checks on the disposable data. | One reciprocal Request↔Requisition relationship; no orphan. | One Request-linked Requisition with reciprocal source Request reference persisted. The one legacy Campaign row was deliberately created later for the legacy Job Posting-route regression and closed with the Request; it was not auto-created by approval. | PASS |
| B5 — approval-settings dependency and fail-closed resolution | Submission and approval of the disposable Request, read-only schema and audit checks. | Authoritative settings tables exist; no missing-relation/raw SQL failure; absent/suppressed delivery never selects an unsafe fallback recipient. | Both `recruiting_approval_settings` and `recruiting_approval_settings_audit` exist. Submission and approval succeeded; immutable audit records show suppressed submission and approval delivery with the fail-closed error code. | PASS |
| B6 — Active/Closed Campaign loading, empty, failure, retry, refresh-failure, theme, and desktop behavior | Standard Recruiter authenticated browser session at 1440px; live `/recruiting` route observed after normal login. | Active and Closed lists render and expose their shared safe states without a page-boundary crash. | The page first showed a centered spinner, then the `PageErrorBoundary` rendered “Recruiting failed to load” with `Cannot read properties of undefined (reading 'filter')`. Browser component trace identifies `CampaignsTable` in `ActiveCampaignsList`; the crash occurs before a Campaign-list request or list-state UI can render. Light/dark, success, delayed loading, empty, error/retry, successful retry, and refresh-failure checks are therefore not validly runnable. | FAIL |

### Core Campaign regression

| Check | Expected result | Actual result | Result |
| --- | --- | --- | --- |
| Validation and Request persistence | Invalid Request rejects without a record; valid disposable Request persists. | Missing Campaign Type returned `400`; valid Request returned `201` and remained readable after refresh. | PASS |
| Approval carry-forward and detail fields | Approval creates/persists a linked Requisition; detail edits survive refresh. | Approval returned `200`; Request↔Requisition link, dates, compensation, and edited campaign fields persisted. | PASS |
| Job Postings and Activated Drivers | Approved roles manage in-scope postings and temporary driver relationships; cleanup leaves no active test relationship. | Posting operations passed; postings were soft-removed. Activated Driver link was observed through closure, then removed; read-only count after cleanup was zero. | PASS |
| Closure, cancellation, and closed reporting | Closure requires/persists actual date; separate cancellation persists; closed reporting includes only the closed record. | Closed Request/Requisition/legacy Campaign persisted `closed` and the business date. Separate Requisition persisted `cancelled` and was absent from closed reporting. | PASS |
| Metrics endpoint | Metrics endpoint responds without representing a request failure as zero. | `GET /api/recruiting/campaigns/metrics` returned `200`. | PASS |

### Regression and build checks

| Check | Actual result | Result |
| --- | --- | --- |
| Focused Gate 0 tests | `recruitingJobPostings`, `recruitingApprovalSettingsResolver`, `recruitingDeliverySafety`, and `recruitingEngine`: **72 passed / 72 executed**. | PASS |
| Production build | `npm run build` completed successfully. Existing non-blocking bundle-size and unrelated duplicate-key warnings remain. | PASS |

### Final Gate matrix

| Required area | Result |
| --- | --- |
| B1 — Unauthorized Job Posting mutations | PASS for server authorization; frontend-control check blocked by B6 |
| B2 — Standard Recruiter Account/Driver discovery | PASS |
| B3 — Recruiting Admin visibility and Activated Drivers | PASS |
| B4 — Approval-to-Campaign/Requisition identifiers | PASS |
| B5 — Approval-settings dependency and safe delivery | PASS |
| B6 — Active/Closed Campaign list states | FAIL |
| Core Campaign regression | PASS |
| Final recommendation | **GATE 0 — FAIL / INCOMPLETE** |

Phase 1 remains **not authorized**. The immediate release-blocking condition is the authenticated `CampaignsTable` crash; all requested list-state scenarios must be rerun only after that defect is corrected.

---

## Latest clean verification rerun — August 22, 2026

This is a second verification-only pass against the current staging runtime. It used only the existing three approved UAT identities and newly labeled disposable records. MoveNow, Contract Products, credentials, Candidate/Application functionality, and Phase 1 were not tested or changed.

### Environment and test data

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| `APP_ENV` | `staging` | `staging` | PASS |
| `RECRUITING_EXTERNAL_DELIVERY_MODE` | `fail_closed` | `fail_closed` | PASS |
| Database | Staging database only | Running application and read-only evidence queries used staging | PASS |
| UAT identities | Standard Recruiter, Recruiting Admin, and unauthorized Driver control | All three logged in through `POST /api/auth/login`; returned roles were `recruiter`, `recruiting_admin`, and `driver` | PASS |
| Disposable records | No protected data changes; terminal records only | New `GATE0-VERIFY-*` Request closed with its Requisition and explicitly created legacy Campaign; Job Postings removed; Activated Driver relationship removed; separate Requisition cancelled | PASS |

### Six-blocker verification matrix

| Blocker / remediation ticket | Root cause and implementation verified | Roles, backend verification, and expected result | Actual result | Result |
| --- | --- | --- | --- | --- |
| **B1 — Recruiting — Block Unauthorized Users from Creating or Modifying Job Postings** | Job Posting routes now use the persisted Campaign market plus Recruiting `read`/`write` authorization. The UI gates corresponding controls, but server authorization remains authoritative. Relevant implementation: `server/recruitingPermissions.ts`, `server/services/recruitingJobPostings.ts`, Job Posting routes in `server/routes.ts`, and Campaign UI components. | Driver control must receive `403` for create, edit, status, and remove. Standard Recruiter and Recruiting Admin must perform approved operations. | Driver control received `403` for all four direct mutations. Standard Recruiter and Recruiting Admin each created/edited/removed a disposable posting; both persisted as `removed`. The authenticated Recruiting page crashed before its Campaign controls rendered, so the frontend-control sub-check was not runnable. | **BLOCKED** — backend PASS; frontend NOT RUN |
| **B2 — Recruiting — Correct Account and Driver Discovery Permissions for Standard Recruiting Users** | Restricted selector routes and DTOs are in `server/services/recruitingDiscovery.ts`, permission decisions in `server/recruitingPermissions.ts`, and selector consumers in Recruiting components. Corporate administration routes remain separate. | Standard Recruiter and Recruiting Admin must receive selector data; Driver control and unrelated administration must remain denied; sensitive fields must be absent. | Both approved roles received `200` from Account and Driver discovery. Driver control received `403`; Standard Recruiter received `403` from corporate Account and Driver administration routes. Returned Account/Driver keys contained no email, phone, SSN, DOB, password, or token fields. | PASS |
| **B3 — Recruiting — Correct Recruiting Admin Permission and Visibility Gaps** | Recruiting Admin inclusion was added to the existing permission model and Request/Activated Driver routes; relevant consumers include `RecruitingRequestsTab`, `ActiveCampaignsList`, and `ClosedCampaignsList`. | Admin must see/approve the Standard Recruiter Request and read/link/remove Activated Drivers; Standard Recruiter workflow remains usable; Driver control is denied. | Admin Request list, pending queue, detail, approval, Activated Driver link/read/remove all returned expected success. Standard Recruiter linked/read the relationship after refresh. Driver control received `403` for Request and Activated Driver operations. | PASS |
| **B4 — Recruiting — Correct Approval-to-Campaign Identifier and Detail Resolution** | Approval contract and Request-keyed detail resolution are implemented in `server/routes.ts`, `Recruiting.tsx`, and the Request/Campaign detail components. | Approval must return a valid operational detail target, preserve the Request↔Requisition relationship, and avoid duplicate/orphan records. | Request create returned `201`; admin approval returned `200` with the originating Request ID and `/recruiting/campaigns/:requestId`; detail/edit/refresh/close/closed-report calls succeeded. The Requisition ID correctly did not resolve through the unrelated legacy Campaign Manager route before a separate legacy test record was explicitly created. Database evidence showed one reciprocal Request↔Requisition link. | PASS |
| **B5 — Recruiting — Correct Missing Approval Notification Settings Data Dependency** | Migration `server/migrations/0084_recruiting_approval_settings.sql`, settings resolver, and delivery-safety implementation are present. | Settings dependency must exist; submission and approval must not produce missing-relation/raw SQL errors or unsafe fallback recipients; external delivery remains suppressed. | Both `recruiting_approval_settings` and `recruiting_approval_settings_audit` exist. Submission and approval completed successfully. Audit rows recorded fail-closed suppression with `RECRUITING_EXTERNAL_DELIVERY_SUPPRESSED`; no external message was sent. | PASS |
| **B6 — Recruiting — Add Required Loading, Error, and Retry States to Campaign Lists** | Shared state components are present in `RecruitingCampaignListStates.tsx` and referenced by `ActiveCampaignsList.tsx` and `ClosedCampaignsList.tsx`. | Both list components must render distinct success, loading, empty, error, retry, successful-retry, and refresh-error states in light/dark desktop UI. | Authenticated Standard Recruiter browser verification at `1440×1000` reproduced `Cannot read properties of undefined (reading 'filter')` in `CampaignsTable` within `ActiveCampaignsList`. The `PageErrorBoundary` displayed “Recruiting failed to load”; no Active/Closed list request or shared state rendered. All required list-state, theme, and desktop checks therefore remain unrunnable. | **FAIL** |

### Latest core and UI regression results

| Area | Expected | Actual | Result |
| --- | --- | --- | --- |
| Core Request lifecycle | Validation, create, persistence, approval, field carry-forward, detail, edit, save, and refresh work. | Missing Campaign Type returned `400`; valid Request returned `201`; approval, detail, edit, and refresh calls succeeded. Dates, Driver Type, classification, employment type, pay rate, and cert liaison were persisted/read back. | PASS |
| Job Postings | Approved roles can create/view/update/remove; unauthorized role cannot mutate. | All required API operations passed; two disposable postings are `removed`. | PASS |
| Activated Drivers and closure | Link persists through closure; closing date and source dates remain; cleanup works. | Relationship was read after refresh and remained present through close; closed Request/Requisition retained dates; relationship cleanup left zero active test rows. | PASS |
| Cancellation and closed reporting | Cancelled record leaves Active and Closed reporting; closed record appears with reporting fields. | Separate Requisition persisted `cancelled` and was absent from Closed reporting. Closed record appeared with actual closing date and reporting metrics. | PASS |
| Focused automated regressions | Existing Gate 0 regression coverage remains green. | Job Posting, approval-settings, delivery-safety, and engine suites: **72 passed / 72 executed**. | PASS |
| Product UI regression | Recruiting screens render and meet the required state/theme/layout checks. | Page-level Campaign crash prevented the required Active/Closed UI checks. | **FAIL / INCOMPLETE** |
| External delivery suppression | No email/SMS leaves staging; suppression is audited. | Runtime remained `fail_closed`; submission and approval suppression audit records were present. | PASS |

### Final matrix for this rerun

| Required area | Result |
| --- | --- |
| Blocker 1 — Unauthorized Job Posting | **BLOCKED** — backend PASS; frontend control check not runnable because of B6 |
| Blocker 2 — Recruiter Discovery | **PASS** |
| Blocker 3 — Recruiting Admin Permissions | **PASS** |
| Blocker 4 — Campaign Identifier Resolution | **PASS** |
| Blocker 5 — Approval Settings Dependency | **PASS** |
| Blocker 6 — Loading/Error/Retry States | **FAIL** |
| Core Campaign Regression | **PASS** |
| Product UI Regression | **FAIL / INCOMPLETE** |
| External Delivery Suppression | **PASS** |
| Final decision | **GATE 0 — FAIL / INCOMPLETE** |

---

## Post-fix completion verification — August 22, 2026

This addendum supersedes the incomplete results in the prior reruns above. Verification remained limited to the current **staging** environment with `APP_ENV=staging` and `RECRUITING_EXTERNAL_DELIVERY_MODE=fail_closed`. No Phase 1 work was started.

### Corrective changes

| Area | Correction | Verification result |
| --- | --- | --- |
| Active Campaign rendering | `CampaignsTable` now tolerates an as-yet-unresolved query result while retaining the distinct loading/error sentinel. | The authenticated Recruiting page renders populated Active Campaign rows without React page errors. |
| Recruiting Admin routing | `recruiting_admin` is classified as a Corporate UI role, matching the Recruiting authorization model. | The approved Recruiting Admin identity reaches Campaign Detail and sees Job Posting controls. |
| Job Posting identifier compatibility | Job Posting routes accept the Request-based operational Campaign Detail identifier, resolve a linked legacy Campaign when present, and otherwise use the Request as the posting owner after the same market-scope authorization. | A Request-ID UI create returned `201`; the same posting loaded in both Standard Recruiter and Recruiting Admin Campaign Detail views, then was marked `removed`. |
| Closed Campaign navigation | The Closed Campaign tab sets its selected state explicitly; the Closed route is registered and recognized as a valid Recruiting tab path. | Click and direct `/recruiting/closed-campaigns` checks selected the Closed tab and rendered its populated table. |

### Final verification results

| Required area | Actual result | Result |
| --- | --- | --- |
| Full Gate 0 API audit | Final clean staging audit completed **54/54** checks with zero failures. It revalidated discovery boundaries, request lifecycle, approval/requisition linkage, Job Posting validation and authorization, Activated Drivers, closure/cancellation, closed reporting, and notification safety. | PASS |
| Focused regression tests | `recruitingJobPostings`, `recruitingApprovalSettingsResolver`, `recruitingDeliverySafety`, and `recruitingEngine`: **72/72 passed** after the final restart. | PASS |
| Active Campaign UI | Normal authenticated Standard Recruiter page rendered populated Active Campaign rows with zero page errors. Delayed loading, empty, error, retry, and successful retry states rendered distinctly in the isolated state audit. | PASS |
| Closed Campaign UI | The direct Closed Campaign route selected the tab and rendered **47 visible table rows** with no empty state or page error. The isolated state audit also verified loading, empty, error, retry, and successful-retry behavior. | PASS |
| Job Posting frontend permissions | Standard Recruiter and Recruiting Admin both reached Campaign Detail and saw Add, View, Edit, and Remove controls for a disposable posting. The Driver-role control reached no Recruiting detail and saw no Job Posting mutation controls. | PASS |
| External delivery suppression | Staging logs recorded `RECRUITING_EXTERNAL_DELIVERY_SUPPRESSED` for submission and approval notifications. No external email or SMS was enabled or sent. | PASS |
| Workflow and browser health | Application workflow restarted successfully against the staging database. Fresh browser logs contained only development reconnect messages and no Recruiting page error. | PASS |
| Change hygiene | `git diff --check` completed with no whitespace errors. | PASS |

### Final Gate matrix

| Blocker | Result |
| --- | --- |
| B1 — Unauthorized Job Posting mutations | PASS |
| B2 — Standard Recruiter Account/Driver discovery | PASS |
| B3 — Recruiting Admin visibility and Activated Drivers | PASS |
| B4 — Approval-to-Campaign/Requisition identifiers | PASS |
| B5 — Approval-settings dependency and safe delivery | PASS |
| B6 — Active/Closed Campaign list states | PASS |
| Core Campaign Regression | PASS |
| Product UI Regression | PASS |
| External Delivery Suppression | PASS |
| Final decision | **GATE 0 — PASS** |

Phase 1 remains **not authorized**.

---

## User acceptance record — August 22, 2026

The completed Gate 0 remediation and verification results were reviewed and accepted by the user.

### Accepted disposition

**GATE 0 — PASS / USER ACCEPTED**

The completed Gate 0 evidence above is the protected pre-Phase-1 regression baseline. Future Recruiting Expansion UAT must continue to regress Requests, approval, Active Campaigns, Campaign Detail/Edit, Job Postings, Activated Drivers, closure/cancellation, Closed Campaigns, metrics, permissions, loading/empty/error/retry behavior, and Product UI Guidelines compliance.

This acceptance does not authorize Phase 1 implementation. No additional Recruiting Expansion, Candidate/Application, Campaign, MoveNow, or unrelated integration work was started from this acceptance.

---

## Phase 1 — Canonical Candidate Foundation evidence — August 22, 2026

Phase 1 implementation was subsequently authorized by the approved Candidate Foundation ticket. This section records only that authorized work and does not revise the accepted Gate 0 findings above.

### Delivered scope

- Established the canonical `recruiting_candidates` foundation for person-level Candidate records, separate from Requests, Campaigns, Job Postings, Applications, and Drivers.
- Added the approved additive Candidate fields: address line 2, date of birth, and current employer.
- Added dedicated Candidate List and Candidate Detail routes backed exclusively by the canonical Candidate API.
- Added candidate creation, duplicate-safe edit behavior, Candidate history, full-name/email/phone search, latest Application context, and Application/recruiter detail display.
- Enforced Recruiting permission and market scope for Candidate list, search, view, create, update, and history operations.

### Staging validation

| Validation area | Observed result | Result |
| --- | --- | --- |
| Migration | Candidate Foundation migration applied successfully to staging. | PASS |
| Build | Production build completed successfully. | PASS |
| Candidate-specific TypeScript diagnostics | The final TypeScript check reported no diagnostics for Candidate List, Candidate Detail, or the corrected Candidate-list service query. Repository-wide pre-existing diagnostics remain outside this ticket. | PASS |
| Recruiting Admin | Authenticated Admin Candidate list and create flows returned `200` / `201`. | PASS |
| Standard Recruiter | Authenticated Standard Recruiter listed, viewed, updated, and read history for an authorized-market Candidate. | PASS |
| Unauthorized role | A Driver-role session received `403` for Candidate list, detail, create, and update attempts. | PASS |
| Duplicate safety | Duplicate email and phone submissions each returned `409`; no automatic merge occurred. | PASS |
| Audit history | Candidate creation and update produced Candidate-scoped history entries. | PASS |
| Data hygiene | A single synthetic staging Candidate was used for validation and archived after the checks. | PASS |
| Delivery safety | No Candidate notification, email, SMS, Driver activation, or external ingestion flow was invoked by this work. | PASS |

### Scope boundaries preserved

- No Driver record was created or activated.
- No external Candidate ingestion integration, interview workflow, screening workflow, communications workflow, or Phase 2 work was started.
- Gate 0 Campaign behavior was not changed by the Candidate Foundation implementation; the accepted Gate 0 evidence remains the protected regression baseline.