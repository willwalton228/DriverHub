# Scheduling UI Compliance — Revised Remediation Roadmap

**Version:** 2 (post Product Review Disposition)  
**Date:** 2026-08-17  
**Status:** Pending approval — no code changes made

---

## How This Roadmap Was Revised

The original audit identified 73 findings across 13 categories. After applying the Product Review Disposition, findings are redistributed as follows:

| Disposition | Count | Rationale |
|---|---|---|
| Approved — in approved groups | 50 | Align with Approved Remediation Principles |
| Modified — scope narrowed | 10 | Product guidance limits or adjusts the remedy |
| On Hold | 4 | Requires separate product/IA decision |
| Removed | 2 | Not a UI guidelines violation; implementation technology only |
| Functional defect (separate ticket) | 1 | Non-UI root cause; separate engineering ticket required |
| Calendar palette documentation (hold) | 1 | Document first; Product decides treatment |
| Nav hide only (not build) | 2 | Placeholder pages hidden, code preserved |

---

## Section 1 — Approved Implementation Groups

Groups are in recommended implementation sequence. Each builds on the stability of the prior group.

---

### Group 1 — Error, Loading & Empty States

**Sequence position:** 1 (first — highest severity, lowest regression risk, purely additive)  
**Findings:** D-01 through D-15, L-02 (16 findings)  
**Regression risk:** Low — all changes are additive branches; no existing behavior is removed

#### Scope

Add `isError` error panels with Retry, `isLoading` skeletons, and where missing, explicit empty states to the following components:

| Finding | Component | File | What to add |
|---|---|---|---|
| D-01 | Scheduling main shell | `Scheduling.tsx` | `isLoading` skeleton + `isError` error panel at the shell level |
| D-02 | SchedulingDataHealthTab | `SchedulingDataHealthTab.tsx` | `isError` for three queries (acknowledge, config, issues) |
| D-03 | driver/Schedule | `pages/driver/Schedule.tsx` | Loading skeleton + error fallback for `weeklySummary` |
| D-04 | LaborForecastTab | `LaborForecastTab.tsx` | `isError` panel + Retry |
| D-05 | RevenueMarginTab | `RevenueMarginTab.tsx` | `isError` panel + Retry |
| D-06 | ShiftRebalanceTab | `ShiftRebalanceTab.tsx` | `isError` panel + Retry |
| D-07 | SchedulingBackupPoolTab | `SchedulingBackupPoolTab.tsx` | `isError` panel distinguishing "no data" from "load failed" |
| D-08 | SchedulingPermissionsTab | `SchedulingPermissionsTab.tsx` | `isError` for users, locations, my-permission queries |
| D-09 | WiwGovernanceConsole | `WiwGovernanceConsole.tsx` | `isError` panel above table |
| D-10 | CalendarSyncTab | `CalendarSyncTab.tsx` | `onError` toast on revoke mutation; `isError` for feed query |
| D-11 | CalendarSyncTab | `CalendarSyncTab.tsx` | `isError` branch distinguishing "no feed" from "load failed" |
| D-12 | WhenIWorkDataView | `WhenIWorkDataView.tsx` | `isError` panel per data table |
| D-13 | WhenIWorkIntegration | `WhenIWorkIntegration.tsx` | `isError` panel |
| D-14 | SchedulingAuditLogTab | `SchedulingAuditLogTab.tsx` | Surface user/location lookup query errors in filter dropdowns |
| D-15 | TimeOffTab | `TimeOffTab.tsx` | `isError` for all three queries |
| L-02 | MessagesTab | `MessagesTab.tsx` | `isError` panel for message history query |

#### Shared component changes
None — all changes are Scheduling-specific query branches.

#### UAT Requirements
1. In each listed component, simulate a server error (DevTools → block the relevant endpoint). Verify a visible error message appears — not a blank/empty screen.
2. Verify a Retry action is present where indicated and that clicking it re-attempts the query.
3. Verify loading state (skeleton or spinner) appears before data loads on a slow connection.
4. Verify empty states remain correct (empty ≠ error).
5. Verify the CalendarSyncTab revoke `onError` toast fires when the revoke endpoint returns an error.

---

### Group 2 — Destructive Action Confirmation

**Sequence position:** 2  
**Findings:** E-05, E-06  
**Regression risk:** None — additive only; no existing mutation behavior changes

#### Scope

Add confirmation dialogs before two genuinely irreversible destructive actions:

| Finding | Component | File | Action | Why irreversible |
|---|---|---|---|---|
| E-05 | CalendarSyncTab | `CalendarSyncTab.tsx` | Revoke ICS feed URL | Immediately invalidates all connected calendars (Google, Outlook, Apple) for this user. Cannot be undone — a new URL would be generated and all subscriptions would need to be reconfigured. |
| E-06 | SchedulingPermissionsTab | `SchedulingPermissionsTab.tsx` | Revoke scheduling permission | Immediately removes a user's access. While re-grantable, the impact is immediate with no undo path in the current UI. |

#### Implementation notes
- Use the existing shadcn `AlertDialog` component (already used elsewhere in DriverHub)
- The E-05 dialog must explain the specific consequence: "All calendar apps connected with this link will stop syncing immediately. You'll need to set up new subscriptions with the new link."
- Destructive confirmation button uses `variant="destructive"`; Cancel uses `variant="outline"`

#### Shared component changes
None — uses the existing `AlertDialog` shared component.

#### UAT Requirements
1. Click Revoke on CalendarSyncTab — verify the confirmation dialog appears before any network request is made.
2. Click Cancel in the dialog — verify the feed URL is unchanged and no revoke request was sent.
3. Click Confirm in the dialog — verify the revoke proceeds and the feed is cleared.
4. Repeat steps 1–3 for SchedulingPermissionsTab revoke.
5. Verify neither confirmation dialog fires on non-destructive actions on the same screens.

---

### Group 3 — Button Hierarchy & Visual Differentiation

**Sequence position:** 3  
**Findings:** E-01, E-02 (modified), E-03 (modified), E-04 (modified), E-07, E-08  
**Regression risk:** None — visual variant changes only

#### Scope

**E-01 — PayrollExportTab primary CTA (approved as audited)**
The primary export action uses `outline` variant. Change to `default` (filled) variant to establish clear primary hierarchy.

**E-02, E-03, E-04 — Workflow Approve/Reject visual differentiation (scope modified per disposition)**

Per the disposition: *Do not automatically convert every Reject or Deny workflow action to destructive/red. Reserve destructive treatment for genuinely irreversible/dangerous actions. Workflow decisions should have clear differentiation without implying deletion or system danger.*

The task is clear visual differentiation — not necessarily the `destructive` variant:

| Finding | Component | Current problem | Modified remedy |
|---|---|---|---|
| E-02 | `WhenIWorkTimeApproval.tsx` | Approve and Reject buttons may have equal visual weight | Approve = `default`; Reject = `outline` (not `destructive`) — both actions are reversible payroll workflow decisions |
| E-03 | `TimeOffTab.tsx` | Approve and Deny buttons need visual differentiation | Approve = `default`; Deny = `outline` — time-off denials are a workflow state, not a destructive/deletion action |
| E-04 | `ShiftSwapsTab.tsx` | Reject uses a custom color class | Approve = `default`; Reject = `outline` with the existing icon for identification — replaces the custom color class with the standard outline variant |

**E-07 — Icon-only accessible labels (approved)**
Add `title` and `aria-label` attributes to all icon-only export/action buttons in `AnalyticsDashboardTab.tsx`, `PayrollExportTab.tsx`, and `WhenIWorkDataView.tsx`.

**E-08 — Active date preset state (approved)**
In `LaborCostsTab.tsx`, apply a visually distinct "active" state to the currently selected date preset button (e.g., `default` variant for the active preset, `outline` for inactive).

#### Shared component changes
None — all changes are local variant and attribute changes within Scheduling-specific components.

#### UAT Requirements
1. On PayrollExportTab: verify the primary export CTA is visually dominant (filled) and secondary actions remain outline.
2. On WhenIWorkTimeApproval, TimeOffTab, ShiftSwapsTab: verify Approve and Reject/Deny are visually distinguishable without implying "dangerous" treatment for the non-approve action.
3. On AnalyticsDashboardTab, PayrollExportTab, WhenIWorkDataView: verify all icon-only buttons have accessible labels (use a screen reader or browser accessibility inspector).
4. On LaborCostsTab: verify the active date preset is visually distinct from inactive presets. Switching presets updates the active indicator immediately.

---

### Group 4 — Table & Container Overflow / Responsive Layout

**Sequence position:** 4  
**Findings:** F-01, F-02, F-06, J-01, K-03, K-04, K-05, I-03  
**Regression risk:** Low to Medium — layout changes; visual regression testing recommended

#### Scope

**F-01 — NeedsCoverage table overflow (approved)**
`NeedsCoverage.tsx`: Add `<div className="overflow-x-auto">` wrapper around the multi-column table. Page-level horizontal scrollbar eliminated.

**F-02 — SchedulingTimeOff table overflow (approved)**
`SchedulingTimeOff.tsx`: Add `overflow-x-auto` wrapper to all tables on the page. Also addresses K-02 (same finding, same file).

**J-01 — Scheduling shell overflow guard (approved)**
`Scheduling.tsx` outer container: Add `overflow-x-hidden` guard to prevent wide tab content from causing page-level horizontal scrolling. This is a one-line CSS change to the shell wrapper; no tab content is modified.

**F-06 / K-04 — Custom CSS grids (approved — scope clarified per disposition)**
Per disposition: *Do not replace an existing table/layout solely because it uses a different technology. Remediate where appearance, responsiveness, or overflow fails the guidelines.*

The specific failure here is **uncontrolled horizontal overflow**. The fix is adding an `overflow-x-auto` scroll container, not necessarily migrating to `<Table>`:

| Component | File | Fix |
|---|---|---|
| AnalyticsDashboardTab | `AnalyticsDashboardTab.tsx` | Wrap custom grid in `overflow-x-auto` container |
| ShiftRebalanceTab | `ShiftRebalanceTab.tsx` | Same |
| LoadBalancingTab | `LoadBalancingTab.tsx` | Same |

**K-05 — LaborForecastTab grid overflow (approved)**
`LaborForecastTab.tsx`: Same overflow-x-auto fix as K-04 components.

**K-03 — driver/Schedule mobile density (approved — verify first)**
`pages/driver/Schedule.tsx`: Verify rendering at 375px viewport. If 3-column KPI grid clips, change to `grid-cols-1 sm:grid-cols-3`.

**I-03 — SchedulingTimeOff dialog form responsive (approved)**
`SchedulingTimeOff.tsx` request dialog: Change `grid-cols-2` date field layout to `grid-cols-1 sm:grid-cols-2`.

#### Shared component changes
None — all changes are local `overflow-x-auto` additions and responsive class adjustments.

#### UAT Requirements
1. At 1024px viewport: verify no horizontal scrollbar on `/scheduling/needs-coverage` or `/scheduling/time-off`.
2. At 1024px viewport: verify no page-level horizontal scrollbar on `/scheduling`.
3. On AnalyticsDashboardTab, ShiftRebalanceTab, LoadBalancingTab, LaborForecastTab at 1024px: verify the data visualization scrolls within its panel container — the outer page does not scroll.
4. At 375px viewport on the driver `/schedule` page: verify all KPI cards and week navigation are accessible without overlap.
5. On the SchedulingTimeOff create-request dialog at 375px: verify the date fields stack vertically and are fully usable.

---

### Group 5 — Color, Dark Mode & Accessible State Indicators

**Sequence position:** 5  
**Findings:** C-01 (modified), C-02 (modified), C-05, C-06, L-01  
**Regression risk:** Low — visual only

#### Disposition-applied modifications

Per the disposition: *Do not perform code cleanup merely because a raw Tailwind color class exists. Remediate when the color has no defined meaning, semantic meaning is inconsistent, contrast is insufficient, dark mode is broken, or the same status is represented inconsistently.*

**C-01 — Analytical tab raw colors (scope modified)**
Rather than replacing all raw Tailwind color classes, remediate only where one or more of these conditions are met:
- Dark mode is broken (no `dark:` variant when the component supports dark mode)
- Contrast is insufficient against the component's background
- The same status is represented with different colors across tabs (e.g., "overloaded" = orange in OTWatch but amber in LoadBalancing)

Affected components to audit for these specific conditions: `OTWatchTab`, `ShiftRebalanceTab`, `LoadBalancingTab`, `RevenueMarginTab`, `AnalyticsDashboardTab`, `LaborForecastTab`.

**C-02 — Orange badges without dark-mode variant (scope modified — shared component concern)**
The `bg-orange-100 text-orange-700` pattern appears in `LaborCostsTab`, `PayrollExportTab`, `MessagesTab`, `TimeOffTab`, `WhenIWorkTimeApproval`.

This is a **shared pattern across DriverHub**, not only Scheduling. Per the disposition, shared semantic tokens are preferred.

Options:
1. Add `dark:bg-orange-900 dark:text-orange-200` variants locally in each Scheduling component (Scheduling-scoped fix, low effort)
2. Define a `warning` semantic token in the shared design system and apply it consistently (shared component change — higher value, requires coordination)

**Recommendation:** Implement option 1 (local dark-mode variants) within this remediation project. Proposing a shared `warning` token is noted as a separate shared-component improvement outside this AMR scope.

**C-05 — Audit log approved/granted color (approved)**
`SchedulingAuditLogTab.tsx`: Change the color treatment for "approved" and "granted" audit action types from orange to the green success token. Semantically: approval is positive, not a warning.

**C-06 — WhenIWorkUserMapping color-only row states (approved — accessibility)**
`WhenIWorkUserMapping.tsx`: The excluded/ambiguous/unmatched row states use only background color as the differentiator. Add a text or icon cue (e.g., a small status badge in the existing "Match Status" column) alongside the row highlight. Row highlight colors are preserved; a text label is added for non-color accessibility.

**L-01 — MessagesTab orange badge (approved — same as C-02)**
`MessagesTab.tsx`: Apply the same dark-mode variant fix as C-02.

#### Shared component changes
- The `warning` semantic token proposal (option 2 above) would be a shared change. It is **not** in scope for this AMR. Document for future planning.
- All Group 5 changes within this AMR are Scheduling-specific.

#### UAT Requirements
1. Toggle dark mode. On each affected analytical tab, verify all status indicators remain readable (sufficient contrast) in dark mode.
2. On `WhenIWorkUserMapping`: verify excluded, ambiguous, and unmatched rows are distinguishable without relying on color (inspect with a grayscale filter or color-blindness simulator).
3. On `SchedulingAuditLogTab`: verify "approved" and "granted" entries display with green treatment, not orange.
4. On `MessagesTab`: toggle dark mode and verify the message-type badge is readable.

---

### Group 6 — Page Headings (Contextual Evaluation)

**Sequence position:** 6  
**Findings:** B-01 through B-07 (all modified per disposition)  
**Regression risk:** None — additive

#### Disposition-applied modification

Per the disposition: *Do not mechanically add a new `h2` heading to every Scheduling tab. A tab must provide sufficient orientation, but redundant headings that duplicate the Scheduling shell/tab navigation and consume unnecessary vertical space should not be introduced. Evaluate each screen in context.*

#### Evaluation framework

Before adding a heading to any tab, answer:
1. Does the current tab content provide sufficient orientation? (Is there a CardTitle, panel title, or other prominent label that unambiguously names the screen?)
2. Would a new `h2` duplicate the tab label visible in the TabsList two inches above it?
3. Would adding a heading consume vertical space at a cost to operational content visibility?

If the answer to (1) is No — add a heading. If the answer to (2) or (3) is Yes — do not add one.

#### Evaluation by finding

| Finding | Tab | Current state | Context evaluation | Action |
|---|---|---|---|---|
| B-01 | OTWatchTab | No heading of any kind | No CardTitle, no panel title, no orientation anchor | **Add heading** — the tab label "OT Watch" in the strip is not a substitute for a screen-level title when the content provides no anchor |
| B-02 | LoadBalancingTab | Only `h4 text-xs "Flags"` | No top-level heading; the h4 is a sub-section label | **Add heading** — same rationale as B-01 |
| B-03 | ShiftRebalanceTab | Likely a CardTitle/div, not semantic heading | If CardTitle is visually prominent and names the screen, it may be sufficient | **Verify first** — if the CardTitle is visually prominent, the finding is resolved. If it is a `<div>` or visually small, elevate to `h2` |
| B-04 | SchedulingNoShowTab | `h3 text-lg` | Semantic heading exists; it is undersized | **Elevate** — change `h3 text-lg` to `h2 text-xl font-semibold` without adding new vertical space |
| B-05 | ReliabilitySignalsTab | `h2 text-lg` | Semantic heading exists; it is undersized | **Elevate** — change `text-lg` to `text-xl` to match peer pages |
| B-06 | WiwIngestionTab | No dominant page heading; sub-tab structure only | The sub-tab list does not name the screen | **Add heading** above sub-tab navigation |
| B-07 | MessagesTab | No page title; tab list only | The Compose/Sent/Alerts sub-tabs do not name the enclosing screen | **Add heading** above sub-tab navigation |

#### Shared component changes
None — all heading changes are local to Scheduling tab components.

#### UAT Requirements
1. On each tab where a heading was added or elevated, verify the heading is visually present and correctly sized (`text-xl font-semibold` minimum).
2. Verify no heading duplicates the tab label in a way that reads as redundant to users.
3. Verify no heading adds a second `h2` that competes with an existing prominent `CardTitle` on the same screen.

---

### Group 7 — Keyboard Accessibility

**Sequence position:** 7  
**Findings:** J-03, J-04  
**Regression risk:** None — additive

#### Scope

**J-03 — CalendarSyncTab provider cards (approved)**
`CalendarSyncTab.tsx`: Three provider selection cards (Google Calendar, Outlook, Apple) are `<div>` elements with click handlers but no keyboard accessibility.
Fix: Convert to `<button>` elements, or add `role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && handleSelect()}` to each card.

**J-04 — SchedulingDataHealthTab filter-shortcut cards (approved)**
`SchedulingDataHealthTab.tsx`: Issue-type summary cards are clickable `<div>` filter shortcuts with no keyboard affordance.
Fix: Same pattern as J-03.

*Note: E-07 (icon-only labels) is keyboard/accessibility-adjacent and is addressed in Group 3.*

#### Shared component changes
None — uses standard HTML semantics, no shared component modifications.

#### UAT Requirements
1. On CalendarSyncTab: tab to each provider card using keyboard only. Verify focus is visible. Press Enter — verify the card selection behavior fires.
2. On SchedulingDataHealthTab: tab to each summary card. Verify focus is visible. Press Enter — verify the filter shortcut fires.

---

### Group 8 — Form & Input Compliance

**Sequence position:** 8  
**Findings:** G-02, G-04, H-01, H-02, H-03, H-04, I-01, I-02  
**Regression risk:** Low to Medium

#### Scope

**G-02 — SchedulingAuditLogTab date input labels (approved)**
`SchedulingAuditLogTab.tsx`: Date filter inputs have no visible label or placeholder. Add `<Label>` elements paired to each date input.

**G-04 — SchedulingBackupPoolTab missing filters (approved — low priority)**
`SchedulingBackupPoolTab.tsx`: No date or location filters on the backup pool roster. Add date range and location select controls. Implement as the last item in this group given low severity.

**H-01 — text-xs table content (approved — scoped)**
In `WhenIWorkDataView.tsx`, `WiwIngestionTab.tsx`, `WhenIWorkUserMapping.tsx`: Increase cell content for operationally important fields from `text-xs` to `text-sm`. Metadata fields (timestamps, internal IDs) may remain `text-xs`.

**H-02 — Monospace IDs in WhenIWorkUserMapping (approved)**
`WhenIWorkUserMapping.tsx`: Where human-readable names are available alongside numeric/UUID IDs, display the name in the cell body and the ID in a secondary label (`text-xs text-muted-foreground`) or tooltip.

**H-03 — SchedulingPermissionsTab grantedBy numeric ID (approved)**
`SchedulingPermissionsTab.tsx`: Resolve the `grantedBy` numeric ID to the actor's display name via a user lookup. If the lookup fails, fall back to the ID with a tooltip.

**H-04 — RevenueMarginTab tabular numerals (approved — low priority)**
`RevenueMarginTab.tsx`: Apply `tabular-nums` (Tailwind: `font-variant-numeric: tabular-nums`) to financial figure cells for vertical alignment.

**I-01 — SchedulingPermissionsTab team ID free text (approved)**
`SchedulingPermissionsTab.tsx`: Replace the free-text Team ID input with a validated selector or add inline validation that rejects unrecognized team IDs before form submission.

**I-02 — SchedulingImpactAnalysisTab form validation (approved)**
`SchedulingImpactAnalysisTab.tsx`: Add client-side validation for all required fields before the POST fires. For Shift ID and User ID fields: if lookup data is available, replace raw ID inputs with typeahead/lookup controls. At minimum, validate that the required IDs are non-empty and surface errors inline.

#### Shared component changes
None — all changes are Scheduling-specific.

#### UAT Requirements
1. On SchedulingAuditLogTab: verify date inputs have visible labels.
2. On SchedulingBackupPoolTab: verify date range and location filter controls are present and filter the roster correctly.
3. On WhenIWorkDataView, WiwIngestionTab, WhenIWorkUserMapping: verify key operational cell content is `text-sm`, not `text-xs`.
4. On WhenIWorkUserMapping: verify human-readable names appear where IDs previously appeared; IDs are secondary.
5. On SchedulingPermissionsTab: verify `grantedBy` displays a name, not a numeric ID.
6. On SchedulingPermissionsTab Team ID: verify invalid team values are rejected before submission.
7. On SchedulingImpactAnalysisTab: verify required fields show inline errors when empty; form does not submit incomplete.
8. On RevenueMarginTab: verify financial figures are vertically aligned by decimal point in the table.

---

### Group 9 — Table Enhancements (Scoped)

**Sequence position:** 9  
**Findings:** F-03 (verify), F-04, F-08  
**F-07 (modified — evaluate first)**  
**Regression risk:** Low to Medium

#### Scope

**F-03 — WiwGovernanceConsole table width (verify only)**
`WiwGovernanceConsole.tsx`: The audit noted this as acceptable for an admin screen. Before this group begins, verify `overflow-x-auto` is correctly applied. If it is: no change needed, finding is closed. If not: add the wrapper.

**F-04 — WhenIWorkUserMapping non-color row state indicators (approved)**
`WhenIWorkUserMapping.tsx`: Add a text or icon state indicator to the existing "Match Status" column alongside the current row background color. The row background colors are preserved; the goal is accessibility for non-color users.

**F-08 — SchedulingDataHealthTab issue list pagination (approved)**
`SchedulingDataHealthTab.tsx`: Implement offset pagination using the existing `total` count from the query response. The API already provides the data; this is a UI addition.

**F-07 — WhenIWorkDataView table sorting (modified — evaluate before implementing)**
Per the disposition: *Add sorting where the data is operationally useful to sort, the dataset warrants it, and sorting materially improves usability.*

Evaluation for WhenIWorkDataView's four tables:
- **Shifts table** — sorting by date and driver name is operationally useful (dispatchers look up shifts chronologically or by driver). **Add sorting** for date and driver name columns.
- **Clock Times table** — sorting by clock-in time and driver name is operationally useful. **Add sorting** for these columns.
- **Absences table** — sorting by date and driver name is useful. **Add sorting.**
- **Attendance Notices table** — if dataset is typically small (< 50 rows), sorting provides marginal value. **Evaluate at implementation time** — add only if the dataset warrants it.

#### Shared component changes
None.

#### UAT Requirements
1. On WiwGovernanceConsole: verify the table scrolls within its container; no page-level horizontal scroll.
2. On WhenIWorkUserMapping: verify excluded, ambiguous, and unmatched rows display a text/icon status indicator in the Match Status column independent of row color.
3. On SchedulingDataHealthTab: verify the issue list shows paginated results with navigation controls; large result sets do not load all at once.
4. On WhenIWorkDataView Shifts table: click date column header — verify rows sort ascending/descending. Click driver name — verify alphabetical sort.

---

### Group 10 — Privacy & Security UX

**Sequence position:** 10  
**Finding:** M-01  
**Regression risk:** None — additive

#### Scope

**M-01 — CalendarSyncTab ICS feed URL masking (approved)**
`CalendarSyncTab.tsx`: The ICS feed URL contains a secret authentication token. It is currently displayed in full at all times.

Fix:
- Display the URL masked by default (e.g., `https://…/feed/●●●●●●●●●●●●`)
- Add a "Show" toggle button (eye icon with accessible label "Show calendar link") that reveals the full URL
- The copy-to-clipboard action must work regardless of masked/unmasked state
- Add a brief callout: "Anyone with this link can view your shift schedule"

#### Shared component changes
None.

#### UAT Requirements
1. With a feed active: verify the URL is masked on page load.
2. Click "Show" — verify the full URL appears.
3. Click "Hide" (or the toggle again) — verify the URL masks again.
4. Click copy with URL masked — verify the full URL is copied to clipboard, not the masked display string.
5. Verify the "Anyone with this link" warning is visible.

---

### Group 11 — Placeholder Page Navigation (Hide Links)

**Sequence position:** 11 (last — requires product confirmation on nav link locations)  
**Findings:** A-04, A-05 (modified per disposition)  
**Regression risk:** None — routes and code are preserved; only nav links are hidden

#### Scope

Per the disposition: *Do not build Scheduling Reports or Holiday Management. Recommend hiding the placeholder from normal user navigation until a separate feature is approved. Do not delete the underlying route/code.*

**A-04 — `/scheduling/reports` nav link**
Identify all navigation entry points to `/scheduling/reports` and hide them from the standard navigation. The route and `SchedulingReports.tsx` code are preserved intact.

**A-05 — `/scheduling/holidays` nav link**
Same treatment as A-04 for `/scheduling/holidays` and `SchedulingHolidays.tsx`.

#### Pre-implementation requirement
Identify and confirm all navigation entry points to these routes (sidebar links, tab triggers, any direct `<Link>` references) before hiding, to ensure no orphaned references remain visible.

#### Shared component changes
None — sidebar or navigation link visibility only.

#### UAT Requirements
1. Verify the Reports and Holidays entries are no longer visible in the Scheduling navigation for normal users.
2. Verify directly navigating to `/scheduling/reports` and `/scheduling/holidays` does not produce a 404 or application error (routes preserved).
3. Verify no other Scheduling screen contains a visible link to either hidden route.

---

## Section 2 — Functional Defect (Separate Ticket Required)

The following finding has a root cause that is a functional/engineering defect, not a UI compliance issue. It is out of scope for this UI remediation AMR and requires a separate engineering ticket.

| Finding | Component | Defect description |
|---|---|---|
| G-03 | `SchedulingDataHealthTab.tsx` | The config `lookback` input field triggers a server mutation on **every valid keystroke**. A user typing "30" sends a mutation for "3" and then "30." This causes excessive API load and potential race conditions where an earlier "3" response could overwrite the intended "30" value. **This is a functional bug**, not only a UI issue. Remedy: add a debounce (300–500ms) or replace with an explicit Save button. |

---

## Section 3 — On Hold (Separate Product Decision Required)

The following findings require product decisions before any implementation work begins. No code changes for these items until Product provides direction.

---

### Hold 1 — Scheduling Navigation Information Architecture

**Findings:** A-02, K-01  
**Disposition:** *The audit identified approximately 42 peer-level Scheduling tabs. This requires a separate product information-architecture decision. Do not solve this by simply making 42 tabs horizontally scrollable.*

**Current state:** 42 `TabsTrigger` entries in a single `TabsList`. The list wraps onto multiple lines at most viewport widths. The full tab inventory by logical business function was provided in the Product Review Report (see `docs/scheduling-ui-compliance-audit.md` Part 5).

**Not to be implemented:** A horizontal-scroll tab strip (disposition explicitly ruled this out).
**Pending:** Product provides the approved information architecture (groupings, hierarchy, or promotion of tabs to top-level routes).

---

### Hold 2 — Calendar Color Palette

**Finding:** C-04  
**Disposition:** *First document every color, what records receive each color, the assignment logic, and the current business meaning. Product will determine the appropriate future color treatment.*

#### Current State Documentation (gathered during audit)

**Color system 1 — SHIFT_COLORS (schedule/shift blocks on calendar view)**

Defined in `Scheduling.tsx` at lines 121–128:

```
blue    → bg-blue-500,   text-white  (default)
green   → bg-green-500,  text-white
orange  → bg-orange-500, text-white
purple  → bg-purple-500, text-white
pink    → bg-pink-500,   text-white
teal    → bg-teal-500,   text-white
```

**What record receives each color:** The `color` field is a property on the **Schedule** object. When a dispatcher creates a schedule, they choose one of the 6 named colors from a dropdown. This is a **user-selected categorical label** — the color carries no inherent system-assigned operational meaning (it is not automatically assigned based on shift type, driver, account, or status).

**Assignment logic:** `getShiftColor(shift.color)` at line 130–133 — looks up the color string in `SHIFT_COLORS`, returns blue as the fallback for null/undefined/unrecognized values. The color is set at schedule creation and editable via the schedule edit form.

**Status overlay (independent of SHIFT_COLORS):** Unfilled shifts receive `ring-2 ring-orange-400 ring-offset-2` regardless of their user-chosen color (line 1550). This IS system-derived status behavior — it communicates "this shift needs more headcount." It is not one of the 6 user-chosen SHIFT_COLORS.

**Existing legend:** None. Users receive no in-product explanation of the color palette or how to use it.

**Color system 2 — Template colors**
Templates have a separate `color` field stored as a raw hex value. Users choose via `<Input type="color">` (a browser native color picker). These colors are distinct from the SHIFT_COLORS palette and are free-form hex.

**Color system 3 — Client config shift type colors**
The Client Config tab allows custom shift types, each with a free-form hex color. Also distinct from SHIFT_COLORS.

**Pending from Product:** 
- Should the 6 SHIFT_COLORS remain as user-selected categorical labels, or should they be reassigned to specific operational states?
- Should a color legend be added to the calendar view? (Engineering recommends yes regardless of the answer above.)
- Do template colors and shift type colors need separate legend treatment?

---

## Section 4 — Removed from Remediation Scope

The following findings from the original audit are removed from the Scheduling UI compliance remediation. They do not constitute Product UI Guidelines violations.

| Finding | Original recommendation | Reason for removal |
|---|---|---|
| A-01 | Extract `Scheduling.tsx` into separate component files | File architecture is technical debt, not a UI guidelines violation. Per disposition: *If component extraction is necessary to safely implement an approved UI change, identify the minimum required refactoring separately — do not undertake a broad architectural refactor under this AMR.* |
| F-05 | Migrate raw `<table>` elements in `WiwIngestionTab.tsx` to shadcn `Table` | Per disposition: *Do not replace an existing HTML table solely because it does not use the shared Table component. Remediate the table if its appearance, behavior, accessibility, responsiveness, typography, spacing, or interaction fails the guidelines.* The WiwIngestionTab tables were not found to fail on those specific criteria — the finding was purely implementation technology. If a subsequent review finds them failing on the listed criteria, the finding should be re-opened. |
| G-01 | Standardize filter row structure across all 42 tabs | Tied to the navigation IA decision (Hold 1). Not a standalone UI compliance finding. |

---

## Section 5 — Shared DriverHub Component Considerations

The following items have implications beyond the Scheduling module and are noted for planning purposes. They are **not** implemented as part of this Scheduling AMR.

| Topic | Description | Suggested future action |
|---|---|---|
| `warning` semantic token | The orange badge pattern (`bg-orange-100 text-orange-700`) appears across multiple DriverHub modules, not only Scheduling. Defining a `warning` semantic token (with both light and dark variants) would allow all instances to be updated consistently. | Propose as a shared design-system token update in a separate ticket |
| Icon-only button labeling (E-07) | The pattern of icon-only buttons without accessible labels is a shared concern across DriverHub, not unique to Scheduling. The fix in Group 3 is Scheduling-scoped, but the pattern should be addressed globally. | Note for a broader accessibility audit |

---

## Section 6 — Implementation Sequence Summary

| # | Group | Findings | Risk | Dependencies |
|---|---|---|---|---|
| 1 | Error, Loading & Empty States | D-01–D-15, L-02 | Low | None |
| 2 | Destructive Action Confirmation | E-05, E-06 | None | None |
| 3 | Button Hierarchy & Visual Differentiation | E-01–E-04, E-07, E-08 | None | None |
| 4 | Table & Container Overflow / Responsive | F-01, F-02, F-06, J-01, K-03, K-04, K-05, I-03 | Low–Medium | None |
| 5 | Color, Dark Mode & Accessible States | C-01, C-02, C-05, C-06, L-01 | Low | None |
| 6 | Page Headings (contextual) | B-01–B-07 | None | None |
| 7 | Keyboard Accessibility | J-03, J-04 | None | None |
| 8 | Form & Input Compliance | G-02, G-04, H-01–H-04, I-01, I-02 | Low–Medium | None |
| 9 | Table Enhancements | F-03, F-04, F-07, F-08 | Low–Medium | None |
| 10 | Privacy & Security UX | M-01 | None | None |
| 11 | Placeholder Navigation (hide links) | A-04, A-05 | None | Confirm nav entry points first |
| — | Functional defect | G-03 | — | Separate ticket |
| HOLD | Navigation IA | A-02, K-01 | — | Awaiting product IA decision |
| HOLD | Calendar palette | C-04 | — | Awaiting product direction |

Groups 1–4 have no dependencies on each other and can be implemented in parallel by separate agents if desired. Groups 5–11 are independent of each other but should follow Groups 1–4 to allow regression testing on a stable base.

---

## Section 7 — Findings Not Requiring Implementation (Already Compliant)

From the original audit, the following were confirmed compliant and require no action:

- `NeedsCoverage.tsx` — loading/error/empty states, flat structure, KPI pattern *(Group 4 adds the overflow wrapper only)*
- `WiwGovernanceConsole.tsx` — shadcn table structure, pagination, dark-mode colors *(Group 9 verifies overflow only)*
- `ReliabilitySignalsTab.tsx` — all three data states correctly handled; responsive KPI grid
- `WiwTimeOffWidget.tsx` — loading, error, and empty branches all present
- `SchedulingAuditLogTab.tsx` — table/filter structure, pagination, clear behavior *(Group 8 adds date input labels only)*
- `SchedulingImpactAnalysisTab.tsx` — primary action loading, risk treatment, confirmation flow
- `WiwLocationMappingSection.tsx` — loading/empty states, clear action hierarchy
- `LaborCostsTab.tsx` — overflow table, responsive grid, strong page title
- `PayrollExportTab.tsx` — overflow tables, responsive grid, page title *(Group 3 adjusts primary CTA only)*

---

*Revised roadmap complete. No code changes made. Awaiting approval to begin implementation, starting with Group 1.*
