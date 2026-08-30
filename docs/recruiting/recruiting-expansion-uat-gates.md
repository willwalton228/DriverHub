# Recruiting Expansion Mandatory Phase UAT Gates

**Epic:** DriverHub 360 — Recruiting Module Expansion  
**Applies:** Phase 0 and every later explicitly approved phase  
**Project target:** November 30, 2026

## Purpose

Recruiting Expansion work must proceed one protected phase at a time:

**Development → Developer Verification → Regression Testing → UAT → User Acceptance → Next Phase**

The target date does not permit skipping a gate. Parallel technical work may occur only when it does not depend on an unaccepted phase and does not alter protected functionality outside its approved scope.

## Non-negotiable stop rule

When a phase is presented for UAT, dependent phase development stops until the user explicitly accepts that same gate.

- Developer completion is not user acceptance.
- A passing build or unit test is not user acceptance.
- A feature that works but fails Product UI compliance or protected Campaign regression does not pass UAT.
- A gate may receive **PASS** only when every required validation item is **PASS**, unless the user explicitly approves a named exception for that specific item.
- A required acceptance, regression, permission, persistence, UI, or workflow item marked **NOT RUN**, **BLOCKED**, **UNVERIFIED**, or **UNAVAILABLE** makes the gate **FAIL / INCOMPLETE** unless the user explicitly approves that specific exception.
- **NOT APPLICABLE** may be used only when the validation item genuinely does not apply to the approved scope and the UAT package records why. It must not be used to hide an unexecuted required check.
- A failed gate returns to the current phase for correction and repeat verification. It does not authorize dependent work.
- No later Recruiting Expansion phase begins solely because of schedule pressure.

## Mandatory validation result matrix

Every UAT package must give each required validation item exactly one of these results:

| Result | Meaning | Gate effect |
| --- | --- | --- |
| **PASS** | The item was executed and its expected result was observed. | Eligible for a passing gate. |
| **FAIL** | The item was executed and did not produce the expected result. | Gate fails. |
| **NOT RUN** | The item was required but not executed. | Gate is fail / incomplete unless the user explicitly approves that exact exception. |
| **BLOCKED** | The item could not be executed because of an identified blocker. | Gate is fail / incomplete unless the user explicitly approves that exact exception. |
| **UNVERIFIED** | Evidence is insufficient to confirm the item. | Gate is fail / incomplete unless the user explicitly approves that exact exception. |
| **UNAVAILABLE** | Required environment, data, dependency, or access is unavailable. | Gate is fail / incomplete unless the user explicitly approves that exact exception. |
| **NOT APPLICABLE** | The item does not apply to the approved scope, with a written rationale. | Does not block the gate. |

Never convert **NOT RUN**, **BLOCKED**, **UNVERIFIED**, or **UNAVAILABLE** into an implied pass. An approved exception must identify the exact validation item, reason, scope, user approval, and date; it does not approve any other incomplete item.

## Required developer verification

Before a phase can enter UAT, the developer must provide evidence for every applicable item:

- [ ] The approved ticket’s acceptance criteria
- [ ] Primary workflow, including data persistence after refresh
- [ ] Negative, validation, and recoverable-error scenarios
- [ ] Authentication, role, and permission boundaries
- [ ] Affected API behavior and data integrity
- [ ] Relevant protected Campaign/Request/Driver regression checks
- [ ] Relevant migration compatibility and data reconciliation, when data changes
- [ ] DriverHub Product UI Guidelines
- [ ] Light-mode review
- [ ] Dark-mode review
- [ ] Supported desktop-width review
- [ ] No unauthorized external email, SMS, provider, or notification delivery

The user and Recruiting team must not be the first functional testers. Any required delivery test needs separate explicit approval of recipient(s), content, provider, timing, and environment.

## Required Campaign regression verification

Every gate must explicitly state which protected areas were affected and verify the applicable items:

- Active Campaign list, detail, edit, and status behavior
- Closed Campaign list, reporting, filters, sorting, and export
- Campaign Detail and Campaign edit persistence
- Approved status transitions and closing-date behavior
- Recruiting Request intake, approval, lifecycle, and Request-to-Requisition relationship
- Activated Driver relationship, snapshot data, and canonical Driver relationship
- Job Posting relationship, persistence, edit, and soft removal
- Audit/activity history
- Existing authorization boundaries

The definitive baseline is [Campaign Functionality Protection Baseline](campaign-functionality-protection-baseline.md). Use the [Pre-Expansion Functional Baseline](pre-expansion-functional-baseline.md) to distinguish a known pre-existing issue from a new regression.

## Required UAT package

Every phase must present one UAT package before requesting acceptance:

| Package item | Required content |
| --- | --- |
| Phase and included tickets | Exact phase name and all ticket numbers/titles included in the gate |
| Scope delivered | What changed, what did not change, and any migration/data effects |
| UAT environment | Exact environment, deployment/build identifier, and data source used |
| Test records / accounts | Approved account and reference-record IDs; note any temporary data and cleanup outcome |
| UAT steps | Numbered, reproducible steps with expected result for each |
| Developer verification | Test commands, results, API verification, error cases, permissions, and persistence evidence |
| Campaign regression | Affected protected areas and pass/fail results |
| UI compliance | Applicable reference pattern, component reuse, light/dark checks, viewport checks, loading/empty/error/retry evidence |
| Known limitations | Any behavior not tested, existing defect, data condition, or environment constraint |
| Outbound communication | State that no delivery was attempted, or attach the separate explicit delivery approval |
| Validation result matrix | Every required item, expected result, actual result, one mandatory status, and any specific user-approved exception |
| Acceptance decision | User acceptance, rejection, or deferred decision with date and required follow-up |

UAT steps must be executable without inferring missing behavior. A pass result must name the observable expected outcome; a failure must preserve its actual result and evidence. A gate with a required non-PASS item is fail / incomplete unless its exact exception is explicitly approved by the user.

## UAT decision and failure handling

### Accepted

The user records explicit acceptance for the current phase. Only then may dependent phase work begin.

### Rejected or failed

1. Record the failing UAT step, expected result, actual result, affected records/environment, and supporting evidence.
2. Return work to the **same phase**.
3. Correct only the approved scope necessary to resolve the failure.
4. Repeat developer verification and affected Campaign/UI regression checks.
5. Re-present the same UAT package with the new evidence.
6. Do not begin dependent functionality unless the user explicitly authorizes an exception.

### Deferred or blocked

Record the blocker and keep the phase unaccepted. Environment access, missing approved test data, or lack of outbound-delivery authorization is a valid blocker—not a passing result.

## Phase 0 gate

Before Phase 1 can begin, Phase 0 UAT must review the current foundation deliverables:

1. Campaign Functionality Protection Baseline
2. Recruiting Expansion UI Compliance Gate
3. Recruiting Architecture and Data Model Audit
4. Pre-Expansion Functional Baseline
5. This Mandatory Phase UAT Gates playbook

The Phase 0 package must also state the authenticated checks still marked **NOT RUN** in the functional baseline and the approved plan for completing them. They cannot be silently converted to passes.

### Current Gate 0 disposition

The current Gate 0 decision is **FAIL / INCOMPLETE**. The architecture clarification is ready for review, but the required authenticated baseline checks and blocked regression-suite disposition remain incomplete. See the [Gate 0 Architecture Clarification and Safe UAT Plan](gate-0-architecture-clarification-and-safe-uat-plan.md). Phase 1 remains not authorized.

## UAT package template

```md
# Recruiting Expansion — Phase <N> UAT Package

## Included tickets
- <ticket number and title>

## Scope delivered
- <behavior added or changed>
- <protected behavior intentionally unchanged>

## Environment and test data
- Environment:
- Build/deployment:
- Approved test account(s):
- Reference Request/Campaign/Driver IDs:
- Temporary-data cleanup:

## UAT steps
1. <action>
   - Expected: <observable result>
   - Actual:
   - Result: PASS / FAIL / NOT RUN / BLOCKED / UNVERIFIED / UNAVAILABLE / NOT APPLICABLE
   - Exception approval, if any:
2. <action>
   - Expected: <observable result>
   - Actual:
   - Result: PASS / FAIL / NOT RUN / BLOCKED / UNVERIFIED / UNAVAILABLE / NOT APPLICABLE
   - Exception approval, if any:

## Developer verification
- Acceptance criteria:
- Primary workflow:
- Negative/error paths:
- Permission checks:
- Persistence:
- Test commands/results:

## Campaign regression
- Active Campaigns:
- Closed Campaigns:
- Detail/edit:
- Status transitions:
- Request/Requisition:
- Activated Drivers:
- Job Postings:

## UI compliance
- Reference pattern/components:
- Loading / empty / error / retry:
- Light mode:
- Dark mode:
- Desktop widths:

## Known limitations and outbound delivery
- Existing defects:
- Not-run checks:
- Delivery attempted: No / separately authorized evidence attached

## Validation result matrix
| Required item | Expected result | Actual result | Result | Specific exception approval |
| --- | --- | --- | --- | --- |
| <item> | <expected> | <actual> | PASS / FAIL / NOT RUN / BLOCKED / UNVERIFIED / UNAVAILABLE / NOT APPLICABLE | <user approval + date, if any> |

## UAT decision
- Gate status: PASS / FAIL / INCOMPLETE:
- Accepted / Rejected / Deferred:
- User:
- Date:
- Notes:
```

## Scope boundary

This playbook establishes UAT governance only. It does not start Phase 1, authorize a deployment, change any Recruiting feature, create test data, invoke external communication, or replace the existing Campaign and UI standards.