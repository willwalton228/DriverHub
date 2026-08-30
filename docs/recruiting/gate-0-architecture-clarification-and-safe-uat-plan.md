# Gate 0 Architecture Clarification and Safe UAT Plan

**Scope:** Phase 0 review clarification for the Recruiting Expansion  
**Decision status:** Architecture review ready; Gate 0 is **FAIL / INCOMPLETE**  
**Phase 1:** Not authorized

This is a current-state classification and UAT planning record. It does not authorize a model consolidation, migration, UI change, Candidate/Application work, test-data creation, or outbound delivery.

## Evidence boundary

The classifications below are based on current code and a read-only **staging** data snapshot.

- Staging: 67 Recruiting Requests, 70 newer Recruiting Requisitions, 67 Activated Driver links, 0 Campaign Manager records, 0 Job Posting records, and 0 rows in either newer or legacy Candidate/Application records.
- A direct read-only production database count is not available because this repl has no provisioned production database. Therefore, a route being deployed in code is not treated as proof of live production data or user adoption.

## 1. Current Recruiting model classification

| Model / concern | Current ownership | UI / data evidence | Classification and decision |
| --- | --- | --- | --- |
| Request-centered Campaign lifecycle — `recruiting_requests` | Request intake, approval, account/location, requirements, targets, pay, dates, recruiter, archive state, actual close, and the operational Campaign-to-Activated-Driver identity. | It backs the existing Recruiting Request and Campaign surfaces. Staging has 67 records and 67 Activated Driver links. | **Authoritative** for the current operational Campaign lifecycle. Preserve it; do not replace or reinterpret it in Phase 0. |
| Requisition-driven portions of Closed Campaign reporting — `recruiting_requisitions` | Requisition status and eligibility used by parts of Closed Campaign reporting. | Closed reporting joins the Request, linked Requisition, and Activated Driver information. Staging has 70 Requisitions. | **Supplemental, authoritative only for its report-status/eligibility role.** It is not a standalone Campaign lifecycle source of truth. |
| Campaign Manager — `recruiting_campaigns` | Supplemental manager configuration, counters/spend, manager activity, and conceptual Request/Requisition links. | The code exposes `/recruiting/campaign-management` and Campaign Manager APIs, but staging has 0 Campaign Manager rows. No production count is available. | **Supplemental and currently data-empty in staging.** Do not call it legacy or authoritative; code exposure does not establish active data use. |

### Relationship protection

`recruiting_campaign_activated_drivers.campaign_id` points to `recruiting_requests.id`, despite its column name. It must remain protected as a Request-centered operational relationship. Campaign Manager does not replace this relationship.

## 2. Candidate and Application architecture

| Family | Tables / models | Current code exposure | Current data / bridge | Classification |
| --- | --- | --- | --- | --- |
| Newer Recruiting ATS | `recruiting_candidates`, `recruiting_applications`, `recruiting_requisitions`, `recruiting_stage_history` | Candidate, Requisition, Application, and Pipeline routes/services exist under the Recruiting module. | 0 Candidate and Application rows in staging. No bridge to the Request-centered lifecycle is implemented. | **Preferred future extension point**, subject to an explicitly approved relationship contract with protected Requests/Requisitions and canonical Drivers. |
| Legacy ATS | `job_requisitions`, `candidates`, `applications` | Schema and storage access remain. No established current Recruiting UI ownership was evidenced in the audit. | 0 Candidate and Application rows in staging. No bridge to the newer ATS family or Request lifecycle exists. | **Legacy / inactive in the observed staging data.** Do not extend it for new Candidate/Application work. |

The two families overlap conceptually but are separate datasets with no current bridge. The recommendation is architectural only: if a later approved phase introduces Candidate/Application capability, start from the newer `recruiting_*` family and first approve an explicit relationship, ownership, history, and migration plan. Do not develop, consolidate, or migrate either family in Phase 0.

## 3. Job Posting storage path

| Area | Current implementation |
| --- | --- |
| Table / model | `recruiting_job_postings` / `recruitingJobPostings` |
| API | Campaign Manager list, create, edit, and remove handlers under the existing Recruiting Campaign APIs |
| UI | `RecruitingCampaignManager` renders and manages Job Postings |
| Relationship | `campaign_id` conceptually associates a posting with `recruiting_campaigns.id`; it is not the Request-centered Activated Driver relationship and is not a database-enforced foreign key. |
| Current data | 0 Job Posting rows in staging; production count unavailable. |

The implemented Job Posting UI uses the same `recruiting_job_postings` model identified in the architecture audit. Its current data emptiness does not establish that the UI is absent; it establishes that live persistence has not been demonstrated by the read-only staging baseline.

## 4. Status-model inconsistency

| Area | Stored / modeled values | Screens / APIs affected | Phase 1 risk |
| --- | --- | --- | --- |
| Current Request-linked Requisition data | Observed staging values: `closed` (40), `open_active` (14), `open` (4), and `cancelled` (7); all observed Requests were approved. | Active and Closed Campaign operations and reports use Request/Requisition data. | A new feature can misclassify active, terminal, or report-eligible records if it assumes one vocabulary. |
| Newer Requisition model | `draft`, `pending_approval`, `approved`, `open`, `on_hold`, `filled`, `cancelled` | Newer Requisition and Closed Campaign reporting paths. | Terms do not directly match the approved Campaign-facing labels. |
| Campaign Manager model | `draft`, `active`, `paused`, `completed`, `cancelled` | Campaign Manager UI/API. | `completed` differs from the closed-reporting vocabulary and can produce inconsistent terminal-state handling. |
| Campaign-facing requirement | Pending Approval, Active, Paused, Cancelled, Closed | Recruiting Request, Active Campaign, Closed Campaign, and Campaign Manager screens. | There are no current staging reference records for Pending Approval, Paused, or legacy Completed verification. |

The exact inconsistency is that different models and screens use different status vocabularies for related Campaign concepts, while Closed reporting derives inclusion from Requisition status and Request closing data. No status mapping, conversion, or cleanup is authorized under Phase 0.

## 5. Shared-schema duplicate declarations and regression-suite remediation

The original duplicate names existed because unrelated schema domains each declared a generic type alias. The established aliases remain authoritative where they already have consumers; the duplicate aliases were renamed to domain-specific names only. No runtime schema constants, PostgreSQL enum, table, migration, relationship, or database data changed.

| Duplicate alias corrected | Existing consumer status | Minimal correction |
| --- | --- | --- |
| Customer `NotificationChannel` | The operational notification-channel alias remains used by notification routes/services. | Duplicate customer-preference alias renamed to `CustomerNotificationChannel`. |
| Post-accident `DrugTestStatus` | The established drug-test status alias remains authoritative. | Duplicate post-accident alias renamed to `PostAccidentDrugTestStatus`. |
| Recruiting `InterviewType` | The established interview alias remains authoritative. | Duplicate `recruiting_interviews` alias renamed to `RecruitingInterviewType`. |
| Singular-table `OtAlertLog` | The established plural-table `OtAlertLog` remains used by storage operations. | Duplicate singular-table alias renamed to `OtAlertDedupeLog`. |
| Referral `CampaignStatus` | The established Campaign alias remains authoritative. | Duplicate referral-manager alias renamed to `ReferralCampaignStatus`. |

After the shared-schema correction, a separate duplicate `crypto` import in `server/recruitingService.ts` stopped `recruiting.test.ts` at parse time. The redundant second import was removed; the original import already served every `crypto` use. This was a type/module parse correction only and did not alter Recruiting behavior.

Verification results on August 21, 2026:

| Check | Result |
| --- | --- |
| `server/services/recruitingFileStorage.test.ts` | PASS — 30 tests |
| `server/services/recruiting.test.ts` | FAIL — 27 passed, 5 failed; the suite now loads and runs |
| `server/services/recruitingEngine.test.ts` + `recruitingJobPostings.test.ts` | PASS — 58 tests |
| `server/services/recruitingDeliverySafety.test.ts` | PASS — 3 tests |
| `npm run build` | PASS |

The five Recruiting-service failures are existing Candidate/Application contract mismatches, not a shared-schema parser failure. They are non-blocking technical debt for the protected Campaign-focused Gate 0 baseline because no evidence links them to Campaign data integrity, security, or a required Campaign workflow. They are not repaired under this authorization and must be re-evaluated before any Candidate/Application phase begins.

## 6. Safe authenticated UAT delivery control — implemented and verified

No real outbound Recruiting email or SMS may be sent to complete Phase 0 testing. The authorized staging/development-only control is now implemented:

1. **Non-production only and fail-closed:** Any Recruiting-marked Microsoft Graph call in development/staging returns a suppressed result before a provider request. Candidate SendGrid and Twilio services likewise persist a suppressed communication record rather than calling their providers.
2. **Production unchanged:** The guard evaluates false in production, so it cannot suppress production delivery or alter recipients, routing, provider credentials, or timing.
3. **Auditable Request delivery:** Suppressed Request/approval/campaign Graph attempts write append-only `recruiting_audit_events` records with provider, recipient(s), recipient count, subject, trigger, environment, reason, and timestamp.
4. **Explicit development setting:** `RECRUITING_EXTERNAL_DELIVERY_MODE=fail_closed` is set only for the development environment; an absent or unfamiliar non-production setting remains fail-closed.
5. **Controlled verification:** A labeled provider-boundary invocation returned `RECRUITING_EXTERNAL_DELIVERY_SUPPRESSED` and wrote `GATE_0_DELIVERY_SUPPRESSION_VERIFIED`; no provider request, recipient override, or outbound message occurred.
6. **Remaining UAT:** An authenticated staging session is still required to exercise the actual Request, approval, Campaign, Job Posting, and role-permission workflows with disposable data.

The control is not a production change and is not authorization to deliver a test message.

## Gate 0 disposition

| Gate requirement | Current disposition |
| --- | --- |
| Architecture ambiguities | Documented by this addendum; ready for architecture review. |
| Candidate/Application overlap | Understood as separate newer and legacy families with no bridge; no development authorized. |
| Job Posting storage path | Confirmed as Campaign Manager UI/API using `recruiting_job_postings`. |
| Status inconsistency | Documented; no status change authorized. |
| Shared-schema regression blocker | Resolved; all previously blocked suites now load. The Candidate/Application suite has five explicit failures. |
| Outbound delivery safety | Implemented and verified at the provider boundary; no external message was sent. |
| Authenticated functional baseline | Not completed; Gate 0 remains incomplete. |
| Protected Campaign baseline | Documented, but requires authenticated UAT confirmation. |

**Gate 0 status: FAIL / INCOMPLETE.**  
**Phase 1 status: NOT AUTHORIZED.**