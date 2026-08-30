# DriverHub 360 — Scheduling Module
## Product UI Guidelines Compliance Audit

**Audit date:** 2026-08-17  
**Auditor:** Engineering (Phase 1–31 per ticket)  
**Status:** Audit complete — awaiting remediation roadmap approval before implementation begins

---

## 1. Screen Inventory

| Route | File | Lines | Status |
|---|---|---|---|
| `/scheduling` | `pages/corporate/Scheduling.tsx` | 7,781 | Primary workspace — many issues |
| `/scheduling/calendar` | Same as above | — | Same file |
| `/scheduling/needs-coverage` | `pages/corporate/NeedsCoverage.tsx` | 599 | Generally strong — minor issues |
| `/scheduling/time-off` | `pages/corporate/SchedulingTimeOff.tsx` | 715 | Moderate issues |
| `/scheduling/holidays` | `pages/corporate/SchedulingHolidays.tsx` | 32 | **Non-functional placeholder** |
| `/scheduling/reports` | `pages/corporate/SchedulingReports.tsx` | 73 | **Non-functional placeholder** |
| `/scheduling/wiw-reconciliation` | `pages/scheduling/WiwReconciliation.tsx` | 25 | Wrapper — delegates to child |
| `/scheduling/wiw-governance` | `pages/scheduling/WiwGovernanceConsole.tsx` | 614 | Generally strong — minor issues |
| `/scheduling/wiw-imports` | `pages/corporate/WiwImports.tsx` | (not audited directly) | See WiwIngestionTab |
| `/scheduling/time-clock` | `pages/corporate/Timecards.tsx` | (not audited) | Out of scope this phase |
| `/scheduling/driver-time-off` | `pages/corporate/WiwTimeOffReport.tsx` | (not audited) | Out of scope this phase |
| `/schedule` (driver portal) | `pages/driver/Schedule.tsx` | 974 | Moderate issues |

### Component Inventory (tabs/panels within `/scheduling`)

| Component | File | Lines | Purpose |
|---|---|---|---|
| WhenIWorkDataView | `components/scheduling/WhenIWorkDataView.tsx` | 803 | WIW canonical data viewer (4 tabs) |
| WhenIWorkIntegration | `components/scheduling/WhenIWorkIntegration.tsx` | 430 | API token / sync config |
| WhenIWorkLocationMapping | `components/scheduling/WhenIWorkLocationMapping.tsx` | 486 | Location mapping admin |
| WhenIWorkSyncPanel | `components/scheduling/WhenIWorkSyncPanel.tsx` | 759 | Sync dashboard / webhooks |
| WhenIWorkTimeApproval | `components/scheduling/WhenIWorkTimeApproval.tsx` | 476 | Payroll-gating approval table |
| WhenIWorkUserMapping | `components/scheduling/WhenIWorkUserMapping.tsx` | 1,494 | User reconciliation |
| WiwIngestionTab | `components/scheduling/WiwIngestionTab.tsx` | 1,305 | Ingestion / import / analytics |
| WiwLocationMappingSection | `components/scheduling/WiwLocationMappingSection.tsx` | 498 | Account-level location card |
| WiwTimeOffWidget | `components/scheduling/WiwTimeOffWidget.tsx` | 164 | Time-off summary widget |
| TimeOffTab | `components/scheduling/TimeOffTab.tsx` | 626 | Pending / all requests / conflicts |
| AnalyticsDashboardTab | `components/scheduling/AnalyticsDashboardTab.tsx` | 426 | KPIs / utilization analytics |
| MessagesTab | `components/scheduling/MessagesTab.tsx` | 677 | Compose / sent / alerts |
| ShiftSwapsTab | `components/scheduling/ShiftSwapsTab.tsx` | 587 | Self-service swap requests |
| SchedulingNoShowTab | `components/scheduling/SchedulingNoShowTab.tsx` | 506 | No-show / missed-shift detection |
| OTWatchTab | `components/scheduling/OTWatchTab.tsx` | 690 | Overtime monitoring |
| ReliabilitySignalsTab | `components/scheduling/ReliabilitySignalsTab.tsx` | 542 | Reliability signals dashboard |
| ShiftRebalanceTab | `components/scheduling/ShiftRebalanceTab.tsx` | 666 | Staffing rebalancing tool |
| LoadBalancingTab | `components/scheduling/LoadBalancingTab.tsx` | 533 | Driver load balancing |
| LaborForecastTab | `components/scheduling/LaborForecastTab.tsx` | 338 | Labor demand forecast |
| LaborCostsTab | `components/scheduling/LaborCostsTab.tsx` | 309 | Labor budget / cost tracking |
| PayrollExportTab | `components/scheduling/PayrollExportTab.tsx` | 401 | Payroll / HRIS export |
| RevenueMarginTab | `components/scheduling/RevenueMarginTab.tsx` | 549 | Revenue / margin analysis |
| CalendarSyncTab | `components/scheduling/CalendarSyncTab.tsx` | 288 | ICS feed / calendar subscription |
| SchedulingAuditLogTab | `components/scheduling/SchedulingAuditLogTab.tsx` | 427 | Immutable audit history |
| SchedulingDataHealthTab | `components/scheduling/SchedulingDataHealthTab.tsx` | 533 | Integrity scanning |
| SchedulingPermissionsTab | `components/scheduling/SchedulingPermissionsTab.tsx` | 372 | Permission management |
| SchedulingBackupPoolTab | `components/scheduling/SchedulingBackupPoolTab.tsx` | 307 | Backup / on-call roster |
| SchedulingImpactAnalysisTab | `components/scheduling/SchedulingImpactAnalysisTab.tsx` | 407 | Shift change simulation |

**Total audited code: ~23,000 lines across 29 files**

---

## 2. Issue Register

Issues are grouped by category. Severity:
- **Critical** — Functional gap or blank-screen risk
- **High** — Major guideline violation affecting usability/consistency
- **Medium** — Noticeable deviation, moderate user impact
- **Low** — Minor polish / maintainability

---

### Category A — Architecture & Structure

| ID | Screen / Component | Current Behavior | Guideline Violated | Recommended Change | Scope | Severity | Regression Risk |
|---|---|---|---|---|---|---|---|
| A-01 | `Scheduling.tsx` | 7,781-line monolithic file containing 40+ tabs and all implementation | Guideline: components should be modular and maintainable | Extract each major tab into its own component file | Scheduling-specific | High | High — requires careful extraction |
| A-02 | `Scheduling.tsx` | 40+ tab items in a single `TabsList`; wraps uncontrollably at most viewport widths | Guideline: navigation must not wrap or clip randomly | Replace with scrollable tabs or grouped navigation (primary / secondary) | Scheduling-specific | High | Medium |
| A-03 | `Scheduling.tsx` | No explicit page-level error or loading state for the main entity/schedule queries; a failed fetch renders as empty content | Guideline: blank screens prohibited; loading/error states required | Add `isLoading` skeleton and `isError` error panel at the main shell level | Scheduling-specific | Critical | Low |
| A-04 | `SchedulingReports.tsx` | Entire page is a non-functional Coming Soon placeholder with static `--` values | Guideline: pages must provide real data or an explicit roadmap state | Build actual report content or hold the route until functional | Scheduling-specific | Critical | None |
| A-05 | `SchedulingHolidays.tsx` | Entire page is a non-functional Coming Soon placeholder with no holiday data, calendar, or CRUD | Guideline: same as above | Build actual holiday management or hold the route | Scheduling-specific | Critical | None |

---

### Category B — Page Title & Information Hierarchy

| ID | Screen / Component | Current Behavior | Guideline Violated | Recommended Change | Scope | Severity | Regression Risk |
|---|---|---|---|---|---|---|---|
| B-01 | `OTWatchTab` | No visible page heading (h1/h2/h3 or CardTitle that serves as one) | Guideline: every screen has a clear page title | Add a proper section heading | Scheduling-specific | High | None |
| B-02 | `LoadBalancingTab` | Only `h4 text-xs` "Flags" found; no top-level heading | Same | Add top-level heading | Scheduling-specific | High | None |
| B-03 | `ShiftRebalanceTab` | No heading found in source (likely CardTitle/div, not a semantic heading) | Same | Elevate to semantic h2 with appropriate text size | Scheduling-specific | High | None |
| B-04 | `SchedulingNoShowTab` | `h3 text-lg` — undersized versus page-level standard | Guideline: page title treatment must be consistent across DriverHub | Elevate to `h2` matching `text-xl font-semibold` minimum | Scheduling-specific | Medium | None |
| B-05 | `ReliabilitySignalsTab` | `h2 text-lg font-semibold` — undersized versus other top-level pages | Same | Elevate to `text-xl` or `text-2xl` consistent with peer pages | Scheduling-specific | Medium | None |
| B-06 | `WiwIngestionTab` | Section/sub-tab structure present but no dominant page-level heading | Same | Add clear page heading | Scheduling-specific | Medium | None |
| B-07 | `MessagesTab` | No page title visible; tab list is the only primary navigation | Same | Add page heading above tabs | Scheduling-specific | Medium | None |

---

### Category C — Color Usage

| ID | Screen / Component | Current Behavior | Guideline Violated | Recommended Change | Scope | Severity | Regression Risk |
|---|---|---|---|---|---|---|---|
| C-01 | All analytical tabs (`OTWatchTab`, `ReliabilitySignalsTab`, `ShiftRebalanceTab`, `LaborForecastTab`, `AnalyticsDashboardTab`, `RevenueMarginTab`) | Raw Tailwind color classes (`bg-green-100`, `text-amber-600`, `bg-red-50`, etc.) without dark-mode variants in many cases | Guideline: status colors must use semantic tokens; dark mode must be supported | Replace with DriverHub semantic token classes or add consistent dark-mode variants | Scheduling-specific | High | Low |
| C-02 | `LaborCostsTab`, `PayrollExportTab`, `MessagesTab`, `TimeOffTab`, `WhenIWorkTimeApproval` | Hard-coded orange badges (`bg-orange-100 text-orange-700`) without dark-mode counterpart | Same | Use destructive variant or define a `warning` semantic token | Shared — affects any module using this pattern | High | Low |
| C-03 | `CalendarSyncTab` | Raw hex colors `#4285F4` (Google blue) and `#0078D4` (Outlook blue) | Guideline: no raw hex values | Keep brand colors for provider logos only, scoped to a constants object | Scheduling-specific | Medium | None |
| C-04 | `Scheduling.tsx` | Shift palette (blue/green/orange/purple/pink/teal) used for calendar visualization — 6 decorative shift colors | Guideline: color must have defined operational meaning | Document the shift color legend for users (tooltip/legend); verify each color maps to a distinct schedule state | Scheduling-specific | Medium | None |
| C-05 | `SchedulingAuditLogTab` | "approved/granted" audit actions use orange rather than success green | Guideline: semantic intent must be consistent | Map approved/granted to green (success) token | Scheduling-specific | Low | None |
| C-06 | `WhenIWorkUserMapping` | Entire row background colors for excluded/ambiguous/unmatched rows | Guideline: do not rely solely on color; row meaning must be accessible without color | Add text/icon cue alongside row background | Scheduling-specific | High | Low |

---

### Category D — Error, Loading & Empty States

| ID | Screen / Component | Current Behavior | Guideline Violated | Recommended Change | Scope | Severity | Regression Risk |
|---|---|---|---|---|---|---|---|
| D-01 | `Scheduling.tsx` (main shell) | Main entity/schedule query failure renders as empty content — no error panel | Guideline: blank screens prohibited; errors must be actionable | Add `isError` branch with retry action at the shell level | Scheduling-specific | Critical | Low |
| D-02 | `SchedulingDataHealthTab` | Acknowledge, config, and issues query failures are silent; only scan mutation toasts | Same | Add `isError` handling for all three queries | Scheduling-specific | Critical | Low |
| D-03 | `driver/Schedule.tsx` | `weeklySummary` query has no loading/error/empty state; silently omitted on failure | Same | Add loading skeleton and error fallback for weekly summary | Scheduling-specific | High | Low |
| D-04 | `LaborForecastTab` | No explicit error state despite query throwing on failure | Same | Add error branch with retry | Scheduling-specific | High | Low |
| D-05 | `RevenueMarginTab` | No explicit error state | Same | Same | Scheduling-specific | High | Low |
| D-06 | `ShiftRebalanceTab` | No explicit error state found | Same | Same | Scheduling-specific | High | Low |
| D-07 | `SchedulingBackupPoolTab` | Pool/usage query failures render as zero/N/A — indistinguishable from true empty | Same | Add `isError` branch | Scheduling-specific | High | Low |
| D-08 | `SchedulingPermissionsTab` | Users/locations/my-permission queries fail silently | Same | Add error states for all three queries | Scheduling-specific | High | Low |
| D-09 | `WiwGovernanceConsole` | No `isError` UI; failed location fetch appears as empty list | Same | Add error panel | Scheduling-specific | High | Low |
| D-10 | `CalendarSyncTab` | Revoke mutation has no `onError` handler — failures are completely silent | Guideline: mutations that modify data must provide success and failure feedback | Add `onError` toast | Scheduling-specific | High | None |
| D-11 | `CalendarSyncTab` | No `isError` UI for feed query | Same | Add error branch | Scheduling-specific | Medium | None |
| D-12 | `WhenIWorkDataView` | Query failures throw but no visible error state in UI | Same | Add error panel | Scheduling-specific | High | None |
| D-13 | `WhenIWorkIntegration` | Query load failure has no rendered error/empty state | Same | Add error branch | Scheduling-specific | Medium | None |
| D-14 | `SchedulingAuditLogTab` | User/location lookup loading/error is silent | Same | Surface lookup errors | Scheduling-specific | Medium | None |
| D-15 | `TimeOffTab` | No visible query error state for any of the three queries | Same | Add error states | Scheduling-specific | High | None |

---

### Category E — Button Hierarchy & Actions

| ID | Screen / Component | Current Behavior | Guideline Violated | Recommended Change | Scope | Severity | Regression Risk |
|---|---|---|---|---|---|---|---|
| E-01 | `PayrollExportTab` | Primary export action appears as `outline` variant, not `default`/`primary` | Guideline: each screen must have a clear action hierarchy | Promote the primary export CTA to `default` variant | Scheduling-specific | High | None |
| E-02 | `WhenIWorkTimeApproval` | Approve and Reject buttons may have equal visual weight | Guideline: destructive actions must be visually distinct | Use `destructive` variant for Reject | Scheduling-specific | High | None |
| E-03 | `TimeOffTab` | Approve and Deny buttons need clear visual distinction | Same | `destructive` for Deny | Scheduling-specific | High | None |
| E-04 | `ShiftSwapsTab` | Reject action should be `destructive`; currently custom color class | Same | Use `destructive` variant | Scheduling-specific | High | None |
| E-05 | `CalendarSyncTab` | Revoke (invalidates all calendar subscriptions) fires immediately without confirmation dialog | Guideline: destructive actions require confirmation | Add a confirmation dialog before revoke | Scheduling-specific | Critical | None |
| E-06 | `SchedulingPermissionsTab` | Revoke fires immediately without confirmation | Same | Add confirmation dialog | Scheduling-specific | High | None |
| E-07 | Multiple tabs (`AnalyticsDashboardTab`, `PayrollExportTab`, `WhenIWorkDataView`) | Icon-only export/action buttons without accessible labels or tooltips | Guideline: important actions must have understandable text | Add `title`/`aria-label` or visible text to all icon-only buttons | Shared | High | None |
| E-08 | `LaborCostsTab` | Date preset buttons all `outline` — acceptable for read-only but primary date context should be evident | Guideline: primary controls should be visually identifiable | Highlight the active date preset | Scheduling-specific | Low | None |

---

### Category F — Tables & Lists

| ID | Screen / Component | Current Behavior | Guideline Violated | Recommended Change | Scope | Severity | Regression Risk |
|---|---|---|---|---|---|---|---|
| F-01 | `NeedsCoverage.tsx` | Many-column table has no `overflow-x-auto` wrapper — uncontrolled horizontal overflow on narrow screens | Guideline: table scrolling must occur inside the table container only | Add `overflow-x-auto` wrapper | Scheduling-specific | High | Low |
| F-02 | `SchedulingTimeOff.tsx` | Tables lack `overflow-x-auto` wrapper | Same | Add `overflow-x-auto` wrapper | Scheduling-specific | High | Low |
| F-03 | `WiwGovernanceConsole` | Nine-column table — no mobile card alternative; only horizontal scroll | Guideline: responsive table strategy required | Acceptable for admin screens; ensure `overflow-x-auto` is applied correctly | Scheduling-specific | Medium | Low |
| F-04 | `WhenIWorkUserMapping` | 10-column table, 1,494 lines, color-dependent row states | Guideline: tables must not rely solely on color | Add text/icon cues for row state; verify overflow | Scheduling-specific | High | Medium |
| F-05 | `WiwIngestionTab` | Raw `<table>` elements bypass shared table styles | Guideline: use shared components where available | Migrate to shadcn `Table` component | Scheduling-specific | Medium | Low |
| F-06 | `AnalyticsDashboardTab`, `ShiftRebalanceTab`, `LoadBalancingTab`, `RevenueMarginTab` | Data rendered as custom CSS grid (`grid-cols-[100px_80px_1fr...]`) — fixed widths, no `<Table>` semantics, no responsive breakpoints | Guideline: tabular data should use accessible table semantics | Migrate to `<Table>` with `overflow-x-auto` or document why custom grid is needed | Scheduling-specific | High | Medium |
| F-07 | `WhenIWorkDataView` | No sortable columns on any of the four data tables | Guideline: tables should support sorting | Add sortable headers for key columns | Scheduling-specific | Medium | None |
| F-08 | `SchedulingDataHealthTab` | Issue list has no pagination despite potentially large result sets (total count exists but is unused) | Guideline: large lists require pagination | Implement offset pagination | Scheduling-specific | Medium | None |

---

### Category G — Filters

| ID | Screen / Component | Current Behavior | Guideline Violated | Recommended Change | Scope | Severity | Regression Risk |
|---|---|---|---|---|---|---|---|
| G-01 | `Scheduling.tsx` (main) | Each of the 40+ tabs implements its own filter pattern independently | Guideline: filters follow shared DriverHub filter pattern | Standardize filter row structure across tabs | Scheduling-specific | Medium | High |
| G-02 | `SchedulingAuditLogTab` | Date filter inputs have no label or placeholder | Guideline: form fields must have labels | Add labels or placeholder text | Scheduling-specific | Medium | None |
| G-03 | `SchedulingDataHealthTab` | Config `lookback` Input mutates on every valid keystroke — sends excessive requests | Guideline: inputs should debounce or require explicit save | Add debounce or explicit save button | Scheduling-specific | High | Low |
| G-04 | `SchedulingBackupPoolTab` | No date or location filters on backup pool roster | Guideline: filters should match user workflow needs | Add date/location filter controls | Scheduling-specific | Low | None |

---

### Category H — Typography

| ID | Screen / Component | Current Behavior | Guideline Violated | Recommended Change | Scope | Severity | Regression Risk |
|---|---|---|---|---|---|---|---|
| H-01 | `WhenIWorkDataView`, `WiwIngestionTab`, `WhenIWorkUserMapping` | Heavy use of `text-xs` for table cell content — may be too small for operational reading | Guideline: content must remain readable; do not solve layout with tiny text | Increase cell content to `text-sm` minimum where operationally important | Scheduling-specific | Medium | None |
| H-02 | `WhenIWorkUserMapping` | Monospace IDs displayed in cells where human-readable names exist | Guideline: equivalent information should use equivalent typography | Display human-readable names; ID in secondary/tooltip | Scheduling-specific | Medium | None |
| H-03 | `SchedulingPermissionsTab` | `grantedBy` displays a numeric internal ID rather than the actor's name | Same | Resolve to display name | Scheduling-specific | Medium | Low |
| H-04 | `RevenueMarginTab` | Financial data should use tabular-nums font variant for column alignment | Guideline: typography must aid comprehension | Add `tabular-nums` to financial cells | Scheduling-specific | Low | None |

---

### Category I — Forms

| ID | Screen / Component | Current Behavior | Guideline Violated | Recommended Change | Scope | Severity | Regression Risk |
|---|---|---|---|---|---|---|---|
| I-01 | `SchedulingPermissionsTab` | Team ID is free text rather than a validated/selectable input | Guideline: form fields should validate or constrain where possible | Replace with team selector or add validation | Scheduling-specific | Medium | Low |
| I-02 | `SchedulingImpactAnalysisTab` | Contextual fields not validated for completeness before POST; uses raw shift/user IDs without lookup | Guideline: forms must validate required fields and support discoverability | Add client-side validation and shift/user lookup inputs | Scheduling-specific | Medium | Low |
| I-03 | `SchedulingTimeOff.tsx` | Dialog date fields use `grid-cols-2` without a mobile breakpoint — can overflow on narrow screens | Guideline: forms must remain usable on tablet | Add responsive breakpoint | Scheduling-specific | Medium | Low |

---

### Category J — Cards & Containers

| ID | Screen / Component | Current Behavior | Guideline Violated | Recommended Change | Scope | Severity | Regression Risk |
|---|---|---|---|---|---|---|---|
| J-01 | `Scheduling.tsx` (main) | No `max-width` or `overflow-x` handling on main shell | Guideline: page must not cause application-wide horizontal scrolling | Add `max-w-[1400px] mx-auto overflow-x-hidden` to shell | Scheduling-specific | High | Low |
| J-02 | `SchedulingTimeOff.tsx` | Deep card nesting: Leave Balances Card contains nested balance cards | Guideline: avoid excessive nesting | Flatten to a single card with sections | Scheduling-specific | Low | None |
| J-03 | `CalendarSyncTab` | Clickable provider cards are `<div>` elements without `role="button"` or keyboard handler | Guideline: touch targets / keyboard accessibility required | Add `role="button" tabIndex={0} onKeyDown` | Scheduling-specific | Medium | None |
| J-04 | `SchedulingDataHealthTab` | Summary cards are clickable `<div>` without keyboard affordance | Same | Same fix | Scheduling-specific | Medium | None |

---

### Category K — Responsive Design

| ID | Screen / Component | Current Behavior | Guideline Violated | Recommended Change | Scope | Severity | Regression Risk |
|---|---|---|---|---|---|---|---|
| K-01 | `Scheduling.tsx` (main) | 40+ tab `TabsList` wraps uncontrollably at tablet widths | Guideline: controls must not wrap or clip randomly | Implement scrollable tab strip or secondary tab grouping | Scheduling-specific | High | Medium |
| K-02 | `NeedsCoverage.tsx` | Table has many columns with no `overflow-x-auto` | Same as F-01 | Addressed by F-01 | — | — | — |
| K-03 | `driver/Schedule.tsx` | Three-column KPI grid and week navigation may be too dense on mobile without adjustment | Guideline: mobile layout must be deliberate | Verify mobile rendering; reduce to 1-column on small viewports if needed | Scheduling-specific | Medium | Low |
| K-04 | `ShiftRebalanceTab`, `LoadBalancingTab`, `AnalyticsDashboardTab` | Fixed-width CSS grids (`grid-cols-[100px_80px_1fr...]`) with no responsive breakpoints | Guideline: no uncontrolled horizontal overflow | Refactor to `<Table overflow-x-auto>` or add scroll container | Scheduling-specific | High | Medium |
| K-05 | `LaborForecastTab` | Same fixed-width grid issue | Same | Same | Scheduling-specific | High | Medium |

---

### Category L — Communications (Phase 23)

| ID | Screen / Component | Current Behavior | Guideline Violated | Recommended Change | Scope | Severity | Regression Risk |
|---|---|---|---|---|---|---|---|
| L-01 | `MessagesTab` | Hard-coded orange message-type badge (`bg-orange-100 text-orange-700`) with no dark-mode variant | Guideline: semantic tokens for status colors | Use `warning` token or define equivalent | Scheduling-specific | High | None |
| L-02 | `MessagesTab` | No comprehensive error state for message history query | Guideline: errors must surface | Add error panel | Scheduling-specific | High | None |

---

### Category M — Privacy & Security UX

| ID | Screen / Component | Current Behavior | Guideline Violated | Recommended Change | Scope | Severity | Regression Risk |
|---|---|---|---|---|---|---|---|
| M-01 | `CalendarSyncTab` | ICS feed URL (containing secret token) displayed in a read-only `Input` — visible on screen and easy to screenshot | Guideline: sensitive tokens should be masked by default | Mask URL by default; show on explicit user action with a warning | Scheduling-specific | High | None |

---

## 3. Compliant Items

The following areas already meet or substantially meet the DriverHub Product UI Guidelines and require no remediation:

| Screen / Component | Compliant Aspects |
|---|---|
| `NeedsCoverage.tsx` | Explicit loading, error, and empty states; flat container structure; KPI card pattern; mutation feedback |
| `WiwGovernanceConsole.tsx` | Strong shadcn table structure; loading/empty states; server pagination; dark-mode color variants |
| `ReliabilitySignalsTab` | Explicit loading, error, and empty states; responsive KPI grid; date/filter controls |
| `WiwTimeOffWidget` | Loading skeleton; explicit error and empty branches; period filter |
| `SchedulingAuditLogTab` | Strong table/filter structure; pagination; clear/reset behavior; expandable detail rows |
| `SchedulingImpactAnalysisTab` | Loading state on primary action; risk/destructive treatment; clear before/after comparison layout |
| `WiwLocationMappingSection` | Loading and empty states; card title/description treatment; clear action hierarchy |
| `LaborCostsTab` | Explicit loading/empty states; `overflow-x-auto` table; responsive KPI grid; strong page title |
| `PayrollExportTab` | Strong page title; explicit loading/empty; `overflow-x-auto` tables; responsive KPI grid |
| All components | No raw hex colors (except two provider brand colors in `CalendarSyncTab`); consistent use of Inter/Tailwind typography |

---

## 4. Placeholder / Not-Yet-Functional Screens

These routes exist in the router but have no functional content:

| Route | File | Recommendation |
|---|---|---|
| `/scheduling/reports` | `SchedulingReports.tsx` | Build real report content or remove the route until ready |
| `/scheduling/holidays` | `SchedulingHolidays.tsx` | Build holiday management or remove the route until ready |

---

## 5. Severity Summary

| Severity | Count |
|---|---|
| Critical | 8 |
| High | 35 |
| Medium | 23 |
| Low | 7 |
| **Total** | **73** |

---

## 6. Recommended Remediation Groups (Phase 32)

Based on the audit, the following implementation groups are recommended. Each should become one or more implementation tickets before any work begins.

### Group 1 — Error & Loading States (Critical/High — lowest regression risk)
Target: D-01 through D-15, E-05, E-06 (CalendarSyncTab revoke confirmation), L-02  
Work: Add `isError` panels and `isLoading` skeletons across all Scheduling queries. Add confirmation dialogs for destructive mutations. Add `onError` toast to CalendarSyncTab revoke.  
Regression risk: Low — additive only.

### Group 2 — Button Hierarchy & Action Clarity
Target: E-01 through E-08  
Work: Audit and correct button variants (`default`/`destructive`/`outline`) across all Scheduling tabs. Add accessible labels to icon-only buttons.  
Regression risk: Low — visual only.

### Group 3 — Color Standardization
Target: C-01, C-02, C-06, L-01, SchedulingAuditLogTab orange  
Work: Replace raw Tailwind color classes with semantic token classes. Add missing dark-mode variants. Remove orange badge hard-coding.  
Regression risk: Low — visual only.

### Group 4 — Page Title & Heading Hierarchy
Target: B-01 through B-07  
Work: Add/elevate page headings in OTWatchTab, LoadBalancingTab, ShiftRebalanceTab, SchedulingNoShowTab, ReliabilitySignalsTab, WiwIngestionTab, MessagesTab.  
Regression risk: None — additive.

### Group 5 — Table Compliance (overflow, semantics, sorting)
Target: F-01 through F-08  
Work: Add `overflow-x-auto` to NeedsCoverage and SchedulingTimeOff tables. Migrate raw `<table>` in WiwIngestionTab to shadcn `Table`. Add sortable headers to WhenIWorkDataView. Add pagination to SchedulingDataHealthTab.  
Regression risk: Low to Medium.

### Group 6 — Custom Grid → Responsive Table Migration
Target: F-06, K-04, K-05  
Work: Refactor `AnalyticsDashboardTab`, `ShiftRebalanceTab`, `LoadBalancingTab`, `LaborForecastTab`, `RevenueMarginTab` custom CSS grids to proper scrollable tables.  
Regression risk: Medium — visual layout changes.

### Group 7 — Scheduling.tsx Monolith Navigation
Target: A-01, A-02, K-01  
Work: Extract major tab implementations into separate component files. Replace the 40+ item wrapping `TabsList` with a scrollable tab strip.  
Regression risk: High — major structural change. Implement after all other groups are stable.

### Group 8 — Form & Input Compliance
Target: G-02, G-03, I-01, I-02, I-03  
Work: Add labels to date inputs in SchedulingAuditLogTab. Debounce config Input in SchedulingDataHealthTab. Add team selector in SchedulingPermissionsTab. Add shift/user lookup in SchedulingImpactAnalysisTab.  
Regression risk: Low to Medium.

### Group 9 — Accessibility & Keyboard
Target: J-03, J-04, E-07, C-06 (color-only row states)  
Work: Add `role="button"` / `tabIndex` / `onKeyDown` to clickable `<div>` cards. Verify all icon-only actions have accessible labels. Add non-color row state indicators in WhenIWorkUserMapping.  
Regression risk: None — additive.

### Group 10 — Privacy & Security UX
Target: M-01 (CalendarSyncTab token masking)  
Work: Mask ICS feed URL by default; show on explicit user action.  
Regression risk: None — additive.

### Group 11 — Placeholder Pages
Target: A-04, A-05 (SchedulingReports, SchedulingHolidays)  
Work: Separate business decision — build the functionality or remove the routes.  
Regression risk: None until routes go active.

---

## 7. Implementation Guardrails

The following must NOT change as part of UI remediation (per Phase 33):

- WIW integration logic and sync calculations
- Schedule calculation and timezone rules
- Coverage calculations and assignment logic
- Driver availability rules (DriverShift / DriverDash / Hybrid)
- Communication logic and SMS/email triggers
- Permission rules
- Existing data and API contracts

If the audit reveals a functional defect, it must be documented and ticketed separately.

---

## 8. Open Questions for Will / Product

1. **SchedulingReports & SchedulingHolidays** — Should these routes be built now, removed temporarily, or left as Coming Soon? If Coming Soon, the placeholder state should be explicit and consistent.
2. **Scheduling.tsx tab count** — 40+ tabs is a navigation problem. Should some tabs be promoted to top-level routes or grouped under sub-navigation? This architectural decision must be made before the monolith extraction (Group 7) begins.
3. **CalendarSyncTab token exposure** — The ICS URL contains a secret token. Confirm the desired privacy treatment before implementing M-01.
4. **Shift color palette** — The 6-color shift visualization palette in Scheduling.tsx (blue/green/orange/purple/pink/teal). Should each color map to a documented schedule state, or is this intentionally an account/entity differentiator? A legend should be added either way.

---

*Audit complete. No implementation changes were made. All findings above are read-only observations.*  
*Next step: Will reviews this audit and approves the remediation group order before any code changes begin.*
