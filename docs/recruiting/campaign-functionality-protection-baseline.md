# Recruiting Campaign Functionality Protection Baseline

**Epic:** DriverHub 360 — Recruiting Module Expansion  
**Phase:** 0 — Foundation  
**Purpose:** Protect the current Recruiting Campaign operating baseline while future phase tickets add approved capabilities around it.

## Scope of this baseline

This document records current Campaign functionality as protected. It does not authorize a redesign, consolidation, migration, permission change, data repair, or any change to Campaign behavior.

Future Recruiting work is additive by default. A phase ticket must explicitly authorize any change to a protected item below.

## Current canonical operating baseline

Recruiting's current Campaign experience is built around linked, but distinct, records:

| Concern | Current protected record/source |
| --- | --- |
| Recruiting intake, approvals, and active/closed campaign lifecycle | `recruiting_requests` |
| Campaign requisition/workflow status | `recruiting_requisitions` |
| Supplemental Campaign Manager record | `recruiting_campaigns` |
| External posting links | `recruiting_job_postings` |
| Activated/hired driver relationship | `recruiting_campaign_activated_drivers` |
| Request history | `recruiting_request_activity` |
| Campaign history | `recruiting_campaign_activity` |
| Material audit events | `recruiting_audit_events` |

### Data preservation checkpoint

The Phase 0 read-only baseline captured:

- **67** Recruiting Request records
- **67** Recruiting Campaign activated-driver links
- **47** Recruiting Request activity records
- **0** current `recruiting_campaigns` records
- **0** current Job Posting records

The zero-row supplemental Campaign and Job Posting tables do **not** mean the existing Campaign workflow is unused or replaceable. Current active and closed Campaign views depend on the Request and Requisition lifecycle, including existing Request-to-Driver relationships.

## Protected functionality

Unless a future ticket explicitly says otherwise, retain the following behavior and records:

1. **Recruiting Requests** — request intake, approval/review workflow, request statuses, historical fields, activity history, archive behavior, search, filters, and request-to-campaign/requisition relationships.
2. **Active Campaigns** — active list and detail experience, campaign fields, assignment, driver requirements, target counts, dates, urgency, archive flow, closure/cancellation behavior, and existing navigation.
3. **Closed Campaigns** — closed lifecycle status, actual closing date, closing-date correction with a required reason and audit record, hired-driver association, WIW reporting relationships, search, filters, sorting, KPIs, and CSV export.
4. **Campaign Manager** — Campaign Manager create/list/detail/edit behavior, job-posting display and controls, existing metrics, and its Request/Campaign linkage.
5. **Job Postings** — per-campaign external posting links, source, status, posting/expiration dates, notes, edit, soft removal, and View Posting behavior.
6. **Activated Drivers** — existing Campaign-to-Driver links, activation dates, hiring metrics, and the canonical DriverHub Driver record.
7. **Permissions and audit history** — existing authentication, role gates, Request/Campaign activity, and audit data. No access broadening or history replacement is authorized.
8. **Existing presentation patterns** — established DriverHub loading, empty, error, retry, table, filter, dialog, and light/dark-mode patterns.

## Protected API and UI surfaces

The following current surfaces are part of the regression baseline:

- Recruiting Requests page and Request detail/activity workflows
- Active Campaigns list and Campaign detail/edit/archive workflows
- Closed Campaigns list, filtering, sorting, export, hired-driver view, and closing-date correction
- Recruiting Campaign Manager, Campaign detail, Job Postings, and Campaign metrics
- Recruiting Request-to-Campaign and Campaign-to-Driver relationships

## Change-control rules

1. Extend existing records and workflows when a future approved ticket requires it.
2. Do not create a competing Campaign lifecycle or duplicate Campaign dataset.
3. Do not delete, recreate, null out, or fabricate historical Recruiting data.
4. Do not rename, relocate, redesign, refactor, or change permissions as incidental work.
5. Any required migration must be backward compatible and preserve historical relationships.
6. Future Candidate and Application work must integrate with these protected records rather than replace them.
7. Do not begin another Recruiting phase until the current phase has passed UAT and received explicit acceptance under the [Mandatory Phase UAT Gates](recruiting-expansion-uat-gates.md).

## Required regression checks for every Recruiting phase

Before a future Recruiting phase is returned for UAT, verify:

1. Recruiting Request creation, review/approval, search, filters, and history
2. Active Campaign list, detail, edit, archive, closure, and cancellation behavior
3. Closed Campaign list, search, filters, sorting, KPI calculations, and CSV export
4. Campaign dates, driver requirements, recruiter/cert-liaison assignments, and urgency
5. Job Posting create, edit, View Posting, soft removal, persistence, and refresh behavior
6. Activated Driver add/remove links, activation dates, campaign metrics, and Driver relationships
7. Request-to-Campaign, Campaign-to-Driver, and WIW reporting relationships
8. Existing role restrictions and unauthorized access paths
9. Activity/audit history preservation
10. Loading, empty, error, retry, and browser-refresh states in the affected UI
11. The applicable items in the [Recruiting Expansion UI Compliance Gate](recruiting-expansion-ui-compliance-gate.md), including supported desktop widths and light/dark-mode review.

## Phase 0 result

This baseline establishes the protected Campaign surface for the Recruiting Expansion. It does not add Candidate, Application, Pipeline, Interview, Screening, Hiring, Work Management, Reporting, or Integration functionality.