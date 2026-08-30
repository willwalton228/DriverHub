# Recruiting Architecture and Data Model Audit

**Epic:** DriverHub 360 — Recruiting Module Expansion  
**Phase:** 0 — Foundation  
**Purpose:** Record the current Recruiting architecture before any approved expansion work begins.

> **Gate 0 clarification:** See [Gate 0 Architecture Clarification and Safe UAT Plan](gate-0-architecture-clarification-and-safe-uat-plan.md) for the requested current-state classifications, status vocabulary decision summary, blocked-suite disposition, and safe UAT proposal. It does not change this audit's findings or authorize implementation.

## Scope and guardrails

This is a read-only architecture baseline. It identifies current entities, relationships, APIs, UI routes, dependencies, risks, and extension boundaries. It does **not** authorize a redesign, schema migration, data correction, permission change, Campaign behavior change, integration build, or outbound communication.

The [Campaign Functionality Protection Baseline](campaign-functionality-protection-baseline.md) remains authoritative for protected Campaign behavior. The [Recruiting Expansion UI Compliance Gate](recruiting-expansion-ui-compliance-gate.md) applies to every future user-facing change.

## Executive summary

Recruiting currently has three overlapping record families:

1. **Request-centered Campaign operations** — `recruiting_requests` is the current source for intake, approval, Active Campaigns, closure dates, and Campaign-to-Driver activation context.
2. **Newer ATS/pipeline records** — `recruiting_candidates`, `recruiting_requisitions`, `recruiting_applications`, and stage history support the newer Candidate/Application/Pipeline model.
3. **Legacy ATS records** — `job_requisitions`, `candidates`, and `applications` remain in the codebase as a separate model.

These are not a single interchangeable dataset. Future work must name its read/write source explicitly and preserve Request → Requisition → Driver relationships.

## Observed staging data checkpoint

The audit observed the following current record counts:

| Record set | Count |
| --- | ---: |
| Recruiting Requests | 67 |
| Recruiting Requisitions | 70 |
| Recruiting Campaigns | 0 |
| Recruiting Job Postings | 0 |
| Activated Driver links | 67 |
| Newer Recruiting Candidates / Applications | 0 / 0 |
| Legacy Candidates / Applications | 0 / 0 |

The audit found no current non-null Request → Requisition link whose requisition was missing. The zero-row supplemental Campaign, Job Posting, Candidate, and Application tables do **not** permit replacing the existing Request-centered Campaign lifecycle.

## Entity and source-of-truth inventory

| Entity / concern | Current table and primary key | Important relationships | Current authoritative use |
| --- | --- | --- | --- |
| Recruiting Request and Campaign intake | `recruiting_requests.id` | Conceptual `campaignRequisitionId` → `recruiting_requisitions.id`; Request → activated Drivers | **Source of truth for the current Campaign lifecycle**, approval fields, request details, account/location, driver requirements, target count, pay rate, dates, recruiter, cert liaison, comments, archive, and actual closing date. |
| Request activity and approval context | `recruiting_request_activity.id` | `requestId` is a conceptual Request link; generic audit events use entity type/id | Current operational activity history. The Request holds the latest approval fields; activity and audit tables hold supplemental history. |
| Campaign Manager record | `recruiting_campaigns.id` | Conceptual `requestId` and `requisitionId`; Job Postings use its ID | Supplemental Campaign Manager model for campaign configuration, counters, spend, recruiter, and manager activity. It is not the current authoritative Campaign lifecycle source. |
| Job Posting | `recruiting_job_postings.id` | Conceptual `campaignId` → `recruiting_campaigns.id` | Manual external posting links, source, URL, status, dates, and notes. Provider integration fields are placeholders only. |
| Activated Driver | `recruiting_campaign_activated_drivers.id` | `campaignId` **enforces a foreign key to `recruiting_requests.id`**; `driverId` → `drivers.id` | Authoritative Campaign-to-Driver activation relationship. Snapshot fields retain historical classification/type/employment context; current Driver profile remains owned by `drivers`. |
| Newer Requisition | `recruiting_requisitions.id` | Candidate Applications reference it; `sourceRequestId` is conceptual | Newer ATS job/workflow, owner/recruiter, requirement, compensation, target-hire, dates, and status record. It supplies status/closure data to portions of the current Campaign experience. |
| Newer Candidate | `recruiting_candidates.id` | Candidate Applications reference it | Newer candidate identity/contact, dedupe, qualifications, preferences, DNR/archive, and consent/contact preferences. |
| Newer Application / Pipeline | `recruiting_applications.id` | Foreign keys to newer Candidate and Requisition; one Candidate/Requisition pair is unique | Newer candidate pipeline state, owner, disposition, readiness/compliance, and notes. `recruiting_stage_history` is the historical stage record. |
| Legacy requisition, candidate, application | `job_requisitions.id`, `candidates.id`, `applications.id` | Legacy Application foreign keys to legacy Candidate and Requisition | Separate legacy ATS model still present in storage/code. It has no established bridge to the newer ATS model or the Request-centered Campaign lifecycle. |
| Generic audit | `recruiting_audit_events.id` | Polymorphic entity type/id | Cross-entity audit context; it does not enforce entity validity with database foreign keys. |

## Request → Campaign lifecycle

### 1. Request creation

`POST /api/recruiting/requests` creates a Request in `draft` or `submitted` state with `approvalStatus: pending`, records request activity, and validates key intake values. The Request stores campaign type, urgency, account/location, driver requirements, target driver count, pay rate/bonus, schedule, target dates, recruiter, cert liaison, and comments.

### 2. Review and approval

Request status and approval status are distinct fields. Approval/review writes the latest decision data to the Request and records related activity/audit context. This is the authoritative current approval record for Campaign intake.

### 3. Campaign / requisition relationship

The current Campaign UI is Request-centered. A Request can hold `campaignRequisitionId`, and the request-detail API derives Campaign status from the linked newer Requisition when one exists.

Campaign Manager can create a separate `recruiting_campaigns` record. Its form seeds values from the Request and its server flow carries the Request start date when needed, then marks the Request as `recruiting_active`. It does not establish a complete copy of every Request field. The Request, Campaign Manager record, and Requisition therefore must not be treated as interchangeable snapshots.

### 4. Active Campaign operation and updates

Active Campaign views use the Request identity and Request/Requisition status behavior. Request detail edits update the Request first; a close operation can also update a linked Requisition and a linked supplemental Campaign record. This preserves the existing multi-record behavior but is not a license to create a duplicate lifecycle.

### 5. Activated Drivers

Activated Drivers are linked by **Request ID**, even though the bridge column is named `campaign_id`. Each link points to a canonical Driver record and stores activation-time snapshots. New work must use this Request-based identity until a separately approved, backward-compatible identity strategy exists.

### 6. Closure, cancellation, and reporting

The Request stores the canonical `actualClosingDate`. The closed-report query uses linked Requisition status for inclusion and derives reporting values from the Request, activated-driver bridge, Driver records, and trailing 30-day WIW time data. Closing a Request and adding activated drivers are currently separate operations; preserving both outcomes is a required regression concern.

## Existing APIs and UI surfaces

| Area | Current server surfaces | Current user-facing surfaces |
| --- | --- | --- |
| Request intake and approval | `/api/recruiting/requests`, pending/list/detail, status/details, archive, activity | `/recruiting/requests`, Request detail panel, Active Campaigns |
| Active/Closed Campaign operations | Request detail/status, activated-driver endpoints, closed Campaign reporting endpoints | `/recruiting`, `/recruiting/campaigns`, `/recruiting/campaigns/:id`, `/recruiting/campaigns/:id/workspace` |
| Campaign Manager and Job Postings | `/api/recruiting/campaigns`, Campaign metrics/detail/activity, posting create/edit/remove | `/recruiting/campaign-management` |
| Newer ATS/pipeline | Candidate, Requisition, Application, stage-history service/routes | `/recruiting/candidates`, `/recruiting/requisitions`, `/recruiting/applications`, `/recruiting/pipeline` |
| Referral and workforce planning | Referral and workforce-planning APIs/components | Referral Campaigns, Referral Analytics, Referral Settings, Workforce Planning |

All listed routes remain subject to the protected Campaign baseline and the UI compliance gate.

## Dependencies and integration boundaries

| Dependency | Current boundary | Future extension constraint |
| --- | --- | --- |
| DriverHub Drivers | Activated Drivers reference `drivers.id`; snapshots preserve hiring context while Driver owns current profile identity. | A future hire handoff must reconcile to the canonical Driver record rather than create a disconnected person record. |
| Accounts | Recruiting Request stores an account identifier; other Recruiting and Driver records use their own account relationships. | Define mapping/ownership in an approved phase before assuming account fields are interchangeable. |
| When I Work (WIW) | Closed reporting joins activated Drivers to Driver WIW identifiers and recent WIW time; no direct Campaign-to-WIW foreign key exists. | Preserve current reporting semantics until an approved integration contract defines durable Campaign/WIW linkage. |
| Job boards / external postings | Job Postings are manually stored links; no provider adapter was found. | Any provider work needs explicit IDs, status mapping, webhook/import ownership, dedupe, and account mapping. |
| Notifications and email | Recruiting has in-app event definitions and a Request-submission Microsoft Graph email path. | Do not enable, test, or trigger outbound delivery without separate explicit approval of recipients, content, provider, timing, and environment. |
| Pinpoint | No Pinpoint client, adapter, configuration, or sync boundary is implemented. | Treat Pinpoint as an unimplemented future integration; do not infer connectivity or create a provider-specific core model in Phase 0. |

## Architecture risks and decision gates

These are findings for review. This ticket does not correct them.

| Risk | Why it matters | Required future decision |
| --- | --- | --- |
| Multiple overlapping ATS/Campaign models | Requests, newer ATS, and legacy ATS can report different statuses, people, requirements, and counts. | Each approved feature must declare its canonical records and any read-only compatibility path. |
| Request-based Campaign identity | The activated-driver bridge’s `campaign_id` foreign key targets Requests, not `recruiting_campaigns`. | Preserve existing Request IDs in Campaign-to-Driver operations; do not rename or remap without a migration and reconciliation plan. |
| Conceptual links without foreign keys | Request→Requisition, Campaign→Request/Requisition, Job Posting→Campaign, and activity links are not uniformly database-enforced. | Approve relationship hardening separately, with an orphan audit and backward-compatible migration plan. |
| Status vocabulary differs across models | Request, Campaign, Requisition, and Application/Pipeline statuses have different values and terminal-state rules. | Define a status-mapping contract before unifying views, automations, or reports. |
| Duplicated operational fields | Dates, recruiters, requirements, pay, targets, and status appear in multiple models with different semantics. | Identify an authoritative field per future use case; avoid blind copy/overwrite behavior. |
| Fragmented approval/audit history | The Request retains latest approval fields while activity and generic audit records are separate. | Define an append-only approval-history requirement before compliance-sensitive workflow changes. |
| Multi-step closure process | Request closure and Driver linking are separate operations. | Any reliability improvement needs an explicitly approved transactional/recovery design and regression plan. |
| Closed-report eligibility is Requisition-dependent | Campaign reporting can exclude records that do not have the linked Requisition state expected by the report. | Preserve existing report semantics; approve any inclusion-rule change as a reporting/lifecycle change. |
| Current WIW view is a recent-hours measure | It reports trailing 30-day work, not lifetime Campaign performance. | Define the historical reporting requirement before changing the metric or data contract. |
| Tenant/role enforcement varies by surface | Several Recruiting paths rely on authentication/role checks without an obviously uniform organization ownership filter. | Perform a dedicated authorization review before widening access or exposing new cross-record APIs. |
| Request submission can invoke external email | The current Request submission path contains a Microsoft Graph delivery call when configured. | Under the current outbound-communication rule, do not invoke this path for testing or enable delivery without explicit approval. |
| Pinpoint/provider boundary is absent | There is no stable provider ID, sync cursor, webhook ledger, conflict policy, or hire handoff link. | Design a provider-neutral adapter and ownership contract in an approved integration phase. |

## Approved extension principles for later phases

Future approved Recruiting Expansion tickets should:

1. Extend the existing Request-centered Campaign lifecycle instead of replacing it.
2. Name the authoritative table and identifier for each new read/write operation.
3. Keep Candidate/Application/Pipeline work connected to the protected Request, Requisition, and canonical Driver records.
4. Use backward-compatible migrations, explicit data reconciliation, and protected-workflow regression tests for any relationship or status change.
5. Treat job boards, Pinpoint, and outbound delivery as separately approved integration work.
6. Complete the Recruiting UI compliance evidence before any user-facing feature enters UAT.

## Source review

This baseline was compiled from the current schema, Recruiting routes/services, Recruiting UI route map, Campaign protection baseline, UI compliance gate, and a read-only staging-data integrity check. It records the system as observed and intentionally does not prescribe or implement a redesign.