# DriverHub Detail Page Standard

**Version:** 1.0  
**Established:** August 2026  
**Status:** Approved — Baseline locked  
**Baseline implementation:** Claims Detail (`client/src/pages/corporate/AccidentDetail.tsx`)  
**Supersedes:** Per-module ad-hoc detail page layouts

---

## Overview

This document defines the UI/UX standard for all DriverHub detail pages. The Claims Detail page is the approved reference implementation. Every pattern described here was established through the Claims module and must be replicated — not reinvented — by future modules.

A detail page is any page that presents the full operational record for a single entity (a claim, a driver, an account, a move, etc.). Detail pages are the primary workspace for operators. They must maximize information density, minimize scrolling, and make all operational actions immediately accessible.

---

## Table of Contents

1. [Scope](#1-scope)
2. [Page Layout — Zone Map](#2-page-layout--zone-map)
3. [Zone 1 — Sticky Command Zone](#3-zone-1--sticky-command-zone)
4. [Zone 2 — Operational Summary Strip](#4-zone-2--operational-summary-strip)
5. [Zone 3 — Tab Content Area](#5-zone-3--tab-content-area)
6. [Zone 4 — Sticky Sidebar](#6-zone-4--sticky-sidebar)
7. [Overview Tab — Content Order](#7-overview-tab--content-order)
8. [Component Standards](#8-component-standards)
9. [Design Rules](#9-design-rules)
10. [Approved Modules](#10-approved-modules)
11. [Override Process](#11-override-process)
12. [Maintenance](#12-maintenance)

---

## 1. Scope

This standard applies to all DriverHub detail pages, including:

- Claims Detail (`/accidents/:id`) — baseline implementation
- Driver Detail
- Account Detail
- Move Detail
- Recruiting Detail
- Employee Detail
- Vendor Detail

Dashboard pages, list pages, and form-only pages are governed by the [Module Framework](../module-framework.md), not this document.

---

## 2. Page Layout — Zone Map

Every detail page is divided into four vertical zones:

```
┌─────────────────────────────────────────────────────────────────┐
│  ZONE 1 — Sticky Command Zone                         [sticky]  │
│  RecordHeader + QuickActionsBar                                 │
├─────────────────────────────────────────────────────────────────┤
│  ZONE 2 — Operational Summary Strip                             │
│  8 KPI chips, each navigates to the relevant section            │
├──────────────────────────────────────────────┬──────────────────┤
│  ZONE 3 — Tab Content Area                   │ ZONE 4           │
│  Tabs: Overview · [module-specific tabs]     │ Sticky Sidebar   │
│                                              │ w-72             │
│  Overview tab (content order):               │ ─────────────── │
│  1. PRIMARY ZONE (Summary + Intelligence)    │ Notifications    │
│  2. Readiness Card                           │ ─────────────── │
│  3. Workflow Card                            │ Missing Items    │
│  4. Financial Summary                        │ ─────────────── │
│  5. Narrative Card                           │ Activity         │
│  6. Alerts Panel                             │ Timeline         │
│                                              │                  │
└──────────────────────────────────────────────┴──────────────────┘
```

The sidebar is hidden below `xl` breakpoint (1280px). Below `xl`, full-width single-column layout.

---

## 3. Zone 1 — Sticky Command Zone

### Purpose

Permanent, always-visible record identity and primary actions. Operators should never need to scroll to reach an action.

### Structure

```tsx
<div className="sticky top-0 z-50 -mx-6 bg-background">
  <RecordHeader ... />
  <QuickActionsBar ... />
</div>
```

### RecordHeader

| Element | Spec |
|---|---|
| Record ID | `text-4xl font-bold` — the primary visual anchor of the page |
| Account/parent line | `text-sm font-medium text-muted-foreground`, clickable link if navigable |
| Subtitle | `text-sm text-muted-foreground` — `•`-separated contextual fields (e.g. driver · date · incident type) |
| Status pills row | Solid-fill pills; see [Design Rules § Color](#color) |

**Status pills order:** Primary status → Injury → Fault → Claim Type → Severity → Conditional flags (e.g. Legal Hold)

### QuickActionsBar

- **Primary action:** `variant="default"` with `bg-[hsl(var(--sidebar-primary))]` override (DriverHub purple). Icon `h-5 w-5`.
- **Secondary action:** `variant="secondary"`.
- **All other actions:** `variant="outline"`.
- Right-anchored: record-navigation / advance button (e.g. "Advance →") sits at the far right.

---

## 4. Zone 2 — Operational Summary Strip

### Purpose

A single scannable row of the 8 most operationally significant values for this record. Replaces all secondary summary bars. This is the only summary strip on the page — no secondary chips rows, no duplicate header bars.

### Structure

```tsx
<div className="border-b border-border/50 bg-muted/20 px-6 py-2">
  <div className="flex items-center gap-1 flex-wrap">
    {kpis.map((kpi) => (
      <Tooltip key={kpi.testid}>
        <TooltipTrigger asChild>
          <button onClick={kpi.nav} className="... border-b border-dashed border-muted-foreground/40 ...">
            <span className="label">{kpi.label}</span>
            <span className="value">{kpi.value}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>{kpi.tip}</TooltipContent>
      </Tooltip>
    ))}
  </div>
</div>
```

### Rules

- Every KPI chip is clickable and navigates to the relevant tab or section via `navigateToTab()`.
- Chips display a dashed underline affordance to indicate they are interactive.
- Tooltips describe the destination (e.g. "Go to Carrier Submission Workflow (Overview)").
- Label: `text-[10px] font-medium text-muted-foreground uppercase tracking-wide`.
- Value: `text-sm font-semibold text-foreground`.
- Dividers: `|` separator between chips, `text-border` color.

### Standard KPI set (Claims; adapt per module)

| # | Label | Value source | Navigation target |
|---|---|---|---|
| 1 | Carrier Submission Stage | `claimStatus` text | Workflow card (Overview) |
| 2 | Readiness | Readiness % | Readiness card (Overview) |
| 3 | Open Items | Count of incomplete required items | Readiness card (Overview) |
| 4 | Claim Type | `claimCategory` label | General Info section |
| 5 | Severity | Severity label | General Info section |
| 6 | Est. Damage | Formatted currency | Financials tab |
| 7 | Photos | Photo count | Attachments section |
| 8 | Documents | Document count | Attachments section |

---

## 5. Zone 3 — Tab Content Area

### Tabs

```tsx
<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList className="...sticky border-b...">
    <TabsTrigger
      value="overview"
      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary
                 data-[state=active]:bg-transparent data-[state=active]:shadow-none
                 text-[13px] font-medium px-4 h-10"
    />
  </TabsList>
  <TabsContent value="overview" className="p-4 space-y-3 mt-0" />
</Tabs>
```

### Rules

- Tabs are **controlled** (`value` + `onValueChange`), not `defaultValue`. This is required so the `navigateToTab()` helper can switch tabs programmatically from KPI chips, timeline events, or readiness item clicks.
- Tab bar is sticky below Zone 1.
- `TabsContent` uses `p-4 space-y-3 mt-0`. Cards within a tab use `space-y-3` gaps.
- Tab order: Overview first, then module-specific tabs (e.g. Investigation · Financials · Repair · Documents).

### `navigateToTab()` helper

Every detail page must implement this function:

```ts
function navigateToTab(tab: string, testId?: string, sectionKey?: string) {
  setActiveTab(tab);
  if (testId) {
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-testid="${testId}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}
```

---

## 6. Zone 4 — Sticky Sidebar

### Structure

```tsx
<aside
  className="w-72 shrink-0 hidden xl:flex xl:flex-col border-l-2 border-border/40 bg-background"
  style={{ position: "sticky", top: "72px", maxHeight: "calc(100vh - 88px)", overflowY: "auto" }}
>
  {/* Section: Notifications */}
  {/* Section: Missing Items (conditional) */}
  {/* Section: Activity Timeline */}
</aside>
```

### Section headers

```tsx
<div className="sticky top-0 z-10 bg-background border-b border-border/60 px-4 py-2">
  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
    Section Name
  </p>
</div>
```

### Activity Timeline (`TimelinePanel`)

- Title: "Activity" (not "Timeline" or "Claim Timeline").
- Filter pills: `text-[10px] px-1.5`, minimal height. Active filter: `bg-primary text-primary-foreground`.
- Timeline item icon bubble: `h-7 w-7 rounded-full`.
- Timeline item content padding-bottom: `pb-2`.
- Connector line: `w-px bg-border/60`, absolute, runs from bottom of icon to top of next item.
- Clickable events navigate to the relevant section via `onNavigate` prop.

### Design rules

- Sidebar containers are neutral (`bg-background`). No tinted backgrounds on list items.
- `border-l-2 border-border/40` separates sidebar from content area.
- Section headers are sticky within the sidebar scroll area using incremental `top` values.

---

## 7. Overview Tab — Content Order

This is the mandatory content order for the Overview tab. Modules may add module-specific cards but must not reorder the first six slots.

| Slot | Component | Purpose |
|---|---|---|
| 1 | **PRIMARY ZONE** (`grid-cols-2`) | Summary + Intelligence side by side |
| 2 | `ReadinessCard` | Required/Optional checklist with progress bar |
| 3 | `WorkflowCard` | Stage stepper + requirements + advance button |
| 4 | `FinancialSummary` | Compact KPI panel of financial values |
| 5 | `NarrativeCard` | AI-generated or manually entered description |
| 6 | `AlertsPanel` | Flagged risks and operational warnings |
| 7+ | Module-specific cards | Added after the standard six |

---

## 8. Component Standards

### ClaimSummaryPanel (grouped layout)

The grouped layout is the DriverHub Detail Page standard for summary panels. All future detail pages must use `SummaryGroup[]` — not a flat field list.

**Approved group structure:**

| Group | Fields |
|---|---|
| **Incident** | Record type · Incident/Event type · Date · Severity |
| **People** | Primary account/customer · Primary person (driver/employee/etc.) |
| **Liability / Status** | Domain-specific classification fields |
| **Evidence** | Photos · Documents · Attachments count |

**Implementation:**

```tsx
import { ClaimSummaryPanel, SummaryGroup } from "@/components/claims/ClaimSummaryPanel";

const summaryGroups: SummaryGroup[] = [
  { title: "Incident", fields: [...] },
  { title: "People",   fields: [...] },
  { title: "Liability", fields: [...] },
  { title: "Evidence", fields: [...] },
];

<ClaimSummaryPanel groups={summaryGroups} />
```

Each field: `{ label, value, colorClass?, onClick? }`. All fields should be clickable and navigate to the editable field.

### ReadinessCard

- Two KPI boxes: **Readiness %** (always) + **Open Items** count.
- Progress bar: `h-1.5`.
- Checklist split: **Required** group rendered first, **Optional** group below.
- Required group header: `text-[10px] font-bold uppercase tracking-wider text-foreground`.
- Optional group header: `text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60`.
- Missing required items: red `XCircle` icon + `font-semibold text-foreground` label. **No tinted row background.** Color communicates meaning; containers stay neutral.
- Complete items: `text-muted-foreground/60 line-through`.
- Optional items: `text-muted-foreground/80 text-[12px]`.
- The card renders `null` when all items (required + optional) are complete.

### WorkflowCard

- `CardHeader`: `pb-2 pt-3 px-5`, no `CardDescription`.
- Icon: `h-4 w-4 text-primary`.
- `CardContent`: `pt-0 px-5 pb-3`.
- Full panel inner spacing: `space-y-2` (not `space-y-4`).
- No `<Separator>` between stepper and stage description.
- Requirements list uses `text-[10px] uppercase tracking-wider text-muted-foreground` label; met items are struck through.

### FinancialSummary

- Title: "Financial Summary" (not "Financial Snapshot").
- Card header: `pb-1.5 pt-3 px-5`.
- Card content: `pt-0 px-5 pb-3`.
- Layout: `divide-y divide-border/50` rows; each row: `flex items-center justify-between py-1.5`.
- Label: `text-xs text-muted-foreground`. Value: `text-xs font-semibold tabular-nums`.
- Empty state: single `text-xs text-muted-foreground` line — no empty card body.
- Auto-collapses: only renders rows where data exists.

### ClaimIntelligencePanel

- Two-row layout: primary row (Risk Level + Insurance Status) at `text-lg font-bold`; secondary row at `text-xs font-semibold`.
- Chip order: Risk → Insurance → Cost → Evidence.
- `CardTitle`: `text-[15px] font-semibold`.

---

## 9. Design Rules

### Color

> **Color communicates operational meaning. Containers remain neutral.**

This is the foundational DriverHub UI rule. It applies everywhere on detail pages.

| Principle | Correct | Incorrect |
|---|---|---|
| Missing required item | Red icon + red label text | Red/tinted row background |
| Risk status | Colored icon or badge | Colored card background |
| Active section | Border accent or underline | Colored section container |
| Operational pill | Solid fill + white semibold text | Pastel fill or outline style |

**Pill color reference:**

| Value | Color |
|---|---|
| No Injury | Solid green |
| Injury Reported | Solid red |
| At Fault | Solid red |
| Not At Fault | Solid green |
| Partial / Pending fault | Solid dark gray |
| All others (pending approval) | Solid dark gray |

Source of truth: `client/src/lib/statusColors.ts`

### Typography scale

| Use | Class |
|---|---|
| Record ID (hero) | `text-4xl font-bold` |
| Card titles | `text-[15px] font-semibold` |
| Section labels / group headers | `text-[10px] font-semibold uppercase tracking-wider` |
| Body / field values | `text-sm font-semibold` |
| Inline field values (compact) | `text-xs font-semibold` |
| Muted labels | `text-xs text-muted-foreground` |
| Micro labels | `text-[10px] font-medium text-muted-foreground uppercase tracking-wide` |

### Density

- Card padding: `px-5 pb-3`, header `pt-3` or `pt-4`.
- Internal spacing between cards: `space-y-3`.
- No large empty areas. Cards with no data either render a compact empty-state line or return `null`.
- Sidebar items: no decorative spacing. Tighten every section to its minimum readable height.

---

## 10. Approved Modules

The following modules are scheduled to adopt this standard. The Claims Detail page is the baseline unless an explicit override is documented.

| Module | Detail Page | Status |
|---|---|---|
| **Claims** | `/accidents/:id` | ✅ Baseline — complete |
| **Products** | `/admin/products/:id` | ✅ Complete — controlled tabs, navigateToTab(), clickable KPI strip, standard sidebar zones |
| **Drivers** | `/drivers/:id` | ⬜ Pending |
| **Accounts** | `/accounts/:id` | ⬜ Pending |
| **Moves** | `/moves/:id` | ⬜ Pending |
| **Recruiting** | `/recruiting/:id` | ⬜ Pending |
| **Employees** | `/employees/:id` | ⬜ Pending |
| **Vendors** | `/vendors/:id` | ⬜ Pending |

When a module's detail page is built or refactored to this standard, update the Status column.

---

## 11. Override Process

This standard is the default. A module may deviate from it only when:

1. The deviation is required by a domain-specific operational need that cannot be served by the standard layout.
2. The deviation is documented in this file under the module's entry in §10, with a brief rationale.
3. The deviation is approved before implementation begins.

Cosmetic preferences and personal taste are not valid override reasons. The purpose of the standard is a consistent operator experience across all modules.

---

## 12. Maintenance

This document is the authoritative reference. It supersedes any conflicting guidance in agent memory (`.agents/memory/detail-page-standard.md`), comments, or verbal agreement. Agent memory exists as a coding shortcut; this document is the source of truth.

**When to update this document:**

- A new component pattern is approved for all detail pages.
- A design rule is changed (document the old rule, new rule, and reason).
- A module adopts the standard (update §10 status).
- An override is approved (add to §10 under the module's entry).

**Do not update this document** to document per-module implementation details. This document describes the standard, not the implementations.
