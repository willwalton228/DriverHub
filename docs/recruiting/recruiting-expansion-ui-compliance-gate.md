# Recruiting Expansion UI Compliance Gate

**Epic:** DriverHub 360 — Recruiting Module Expansion  
**Phase:** 0 — Foundation  
**Status:** Required for every approved Recruiting Expansion ticket

## Authority and purpose

The [Global DriverHub 360 Development Standard](../ui-standards/global-development-standard.md) is the authoritative Product UI requirement for this work. The [DriverHub Detail Page Standard](../ui-standards/detail-page-standard.md) applies whenever an approved Recruiting ticket adds or materially changes a detail page.

This gate applies those existing standards to the Recruiting Expansion from the first implementation. It does **not** create a Recruiting-specific design system, authorize a UI redesign, or postpone compliance to a later cleanup phase.

## Non-negotiable rule

An approved Recruiting Expansion feature is not ready for UAT unless its first presented implementation is already compliant with the applicable DriverHub Product UI Guidelines.

Functionality alone is not sufficient for UAT approval.

## Required implementation approach

Before changing a user-facing Recruiting surface, the assigned developer must:

1. Identify the existing DriverHub pattern and shared components that match the requested surface.
2. Reuse that established pattern wherever practical for page headers, cards, KPIs, tables, filters, search, tabs, buttons, modals, forms, picklists, status treatments, tooltips, pagination, and actions.
3. Preserve compact operational density, existing typography, semantic colors, responsive behavior, and light/dark-mode support.
4. Implement complete loading, empty, recoverable-error, and retry states with the feature—not as follow-up cleanup.
5. Review the relevant protected Campaign behavior in the [Campaign Functionality Protection Baseline](campaign-functionality-protection-baseline.md) before changing an existing Recruiting screen.

Do not introduce temporary UI, a parallel Recruiting component system, raw HTTP or JSON errors, blank failure screens, stack traces, silent failures, or generic errors when an actionable message can be shown.

## Required UAT evidence

Every future Recruiting Expansion ticket that modifies UI must include the following in its development/UAT evidence:

| Check | Required evidence |
| --- | --- |
| Applicable approved pattern | Name the existing DriverHub screen, component, or standard used as the reference. |
| Component reuse | Identify reused shared components/patterns, or explain the approved exception. |
| User states | Verify loading, populated, empty, and recoverable-error states; include Retry where the user can retry. |
| Action feedback | Verify saves, validation failures, permissions failures, and failed requests provide clear, actionable feedback. |
| Responsive desktop behavior | Verify supported desktop widths have no overlap, clipped controls, hidden required data, unreadably small text, or unjustified horizontal scrolling. |
| Light mode | Verify normal, empty, loading, error, disabled, and selected states remain legible. |
| Dark mode | Verify the same states remain legible and use existing semantic colors/tokens. |
| Regression protection | Verify the affected protected Campaign/Request/Driver behavior and applicable existing flows still work after refresh. |

## UAT checklist

The reviewer must record each applicable item before accepting a Recruiting Expansion ticket:

- [ ] Uses the established DriverHub page/header/layout pattern.
- [ ] Reuses approved shared components and avoids a separate Recruiting design system.
- [ ] Matches established typography, spacing, density, semantic colors, status treatment, and controls.
- [ ] Presents operational lists, tables, KPI widgets, search, filters, forms, tabs, dialogs, and actions using the applicable approved pattern.
- [ ] Includes clear loading, empty, and recoverable-error states.
- [ ] Includes an actionable Retry path where a request can be retried.
- [ ] Does not expose raw HTTP errors, raw JSON, stack traces, silent failures, or blank screens.
- [ ] Works at supported desktop widths without unintended overlap, clipped controls, hidden required information, unreadably small text, or unjustified horizontal scrolling.
- [ ] Has been checked in light mode and dark mode.
- [ ] Preserves the affected Campaign/Request/Driver behavior and data relationships.

The evidence belongs in the phase package defined by the [Mandatory Phase UAT Gates](recruiting-expansion-uat-gates.md).

## Exceptions

An exception to an established DriverHub pattern requires explicit approval in the relevant ticket before implementation. An implementation preference, time pressure, or a plan to correct the UI later is not an exception.

## Scope boundary for Phase 0

This document establishes an enforcement and UAT-review gate only. It does not audit every existing Recruiting screen, change any existing UI, modify Campaign behavior, or authorize later Recruiting Expansion phases.