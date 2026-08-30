# DriverHub Module Framework

**Version:** 1.0  
**Established:** July 2026  
**Reference implementation:** Claims module (`ClaimsDashboard`, `ClaimsQueue`, `AccidentDetail`, `ClaimsCommandBar`)

---

## Overview

This document defines the UI/UX design standard for all DriverHub modules. Every pattern here was established through the Claims module and is intended to be replicated — not reinvented — by future modules. Adhering to this standard ensures visual consistency, a shared component vocabulary, and predictable user behaviour across the platform.

The framework targets **desktop-first** usage at 1024–1920px viewports. Tablet and mobile are supported through graceful degradation but are not the primary design target.

---

## Table of Contents

1. [Page Headers](#1-page-headers)
2. [Action Bars (CommandBar)](#2-action-bars-commandbar)
3. [KPI Cards](#3-kpi-cards)
4. [Dashboard Behavior](#4-dashboard-behavior)
5. [List Behavior](#5-list-behavior)
6. [Widget Behavior](#6-widget-behavior)
7. [Search Standards](#7-search-standards)
8. [Filter Standards](#8-filter-standards)
9. [Table Standards](#9-table-standards)
10. [Button Placement](#10-button-placement)
11. [Navigation Patterns](#11-navigation-patterns)
12. [Drill-Down Behavior](#12-drill-down-behavior)
13. [Responsive Rules](#13-responsive-rules)
14. [Light and Dark Mode](#14-light-and-dark-mode)

---

## 1. Page Headers

### Structure

Every module page that is not a full-screen form uses a header block with this structure:

```tsx
<div className="flex items-center justify-between flex-wrap gap-2">
  {/* Left: title + subtitle */}
  <div>
    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Module Name</h1>
    <p className="text-sm sm:text-base text-muted-foreground mt-1">
      Short description or live context (e.g. record counts, date range)
    </p>
  </div>

  {/* Right: action buttons — see Button Placement section */}
  <div className="flex items-center gap-2 flex-wrap">
    ...
  </div>
</div>
```

### Rules

- `h1` uses `text-2xl` at mobile, upgrades to `sm:text-3xl` at ≥640px.
- The subtitle is always `text-sm sm:text-base text-muted-foreground`. It may contain dynamic context such as filtered record counts, active date ranges, or mode indicators.
- Header actions sit on the right side of the same flex row, wrapped with `flex-wrap` so they drop below the title on narrow viewports rather than overflowing.
- There is **no breadcrumb** on dashboard or list pages. Breadcrumb-style back navigation is only used on drill-down detail pages (see §12).
- The outer page wrapper uses negative margin offsets to bleed to the shell edges: `-mx-3 sm:-mx-4 md:-mx-6 -mt-4 sm:-mt-6`. Content inside uses matching positive padding.

### Mode Banners

When a contextual mode is active (e.g. Carrier Mode), a full-width alert banner is rendered immediately below the header, inside the same `space-y-6` container:

```tsx
<div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-700 dark:text-blue-300">
  <Icon className="h-4 w-4 shrink-0" />
  <span>Mode description text</span>
  <button onClick={onDeactivate} className="ml-auto text-xs underline">Exit mode</button>
</div>
```

---

## 2. Action Bars (CommandBar)

### Shared Component

All modules use the shared `CommandBar` component from `@/components/CommandBar`. Modules create a module-specific wrapper (e.g. `ClaimsCommandBar` in `client/src/components/claims/`) that wires up domain-specific props and passes them through.

**Do not** build bespoke filter toolbars. Extend `CommandBar` and its sub-components.

### Sub-Components

| Component | Purpose |
|---|---|
| `CommandBarSearch` | Debounced text search input (350ms default) |
| `CommandBarViewSelector` | Preset view switcher (e.g. Active / All / Closed) |
| `CommandBarFilters` | Popover panel containing all secondary filters |
| `CommandBarSort` | Sort field + direction selector |
| `CommandBarPrimaryAction` | Rightmost primary CTA (button or link) |

### Layout Order (Left → Right)

1. Module title or record count (left-anchored, `text-sm font-medium text-muted-foreground`)
2. `CommandBarSearch`
3. `CommandBarViewSelector` (if the module has preset views)
4. `CommandBarFilters` button (with active-filter count badge when filters are applied)
5. `CommandBarSort` (optional)
6. Extra secondary actions (`extraActions` prop — icon buttons, toggles)
7. `CommandBarPrimaryAction` (rightmost, always a primary-styled button)

The entire bar uses `flex items-center gap-2 flex-wrap` so elements drop gracefully when the viewport narrows.

### Active Filter Count Badge

When one or more filters are applied, a filled circular badge appears on the Filters button showing the count:

```tsx
<Badge variant="default" className="h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px] font-bold">
  {activeFilterCount}
</Badge>
```

### Filter Chip Strip

Active filters also render as a removable chip row directly below the CommandBar:

```tsx
<div className="flex flex-wrap gap-2">
  {activeFilters.map(f => (
    <Badge variant="secondary" className="rounded-full gap-1.5 pr-1.5">
      {f.label}
      <button onClick={() => clear(f.key)}><X className="h-3 w-3" /></button>
    </Badge>
  ))}
  <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-foreground">
    Clear All
  </button>
</div>
```

### Mode Toggles in the CommandBar

Global view-mode toggles (e.g. Carrier Mode) live inside the `extraActions` slot as icon-only buttons with `Tooltip`:

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <button
      onClick={onToggle}
      className={`inline-flex items-center justify-center h-6 w-6 rounded transition-colors ${
        active ? "text-primary" : "text-muted-foreground/50 hover:text-muted-foreground"
      }`}
      aria-pressed={active}
    >
      {active ? <ActiveIcon className="h-4 w-4" /> : <InactiveIcon className="h-4 w-4" />}
    </button>
  </TooltipTrigger>
  <TooltipContent side="bottom" className="text-xs">Tooltip description</TooltipContent>
</Tooltip>
```

---

## 3. KPI Cards

### Grid Layout

KPI strips use a responsive grid that expands columns as viewport width grows:

| Viewport | Columns |
|---|---|
| Default (< 640px) | 2 |
| `sm` ≥ 640px | 3 |
| `xl` ≥ 1280px | Full (6 or 7 depending on strip) |

```tsx
// 6-metric strips (standard)
<div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">

// 7-metric strips (extended)
<div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
```

**Do not** use `lg:grid-cols-N` for KPI strips — this produces cells that are ~160px wide at 1024px, which is too narrow for metric values. Always gate the full column count at `xl`.

### Card Structure

```tsx
<Card className="h-full hover-elevate cursor-pointer" onClick={...}>
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pt-6 px-6">
    <CardTitle className="text-[15px] font-medium">Metric Name</CardTitle>
    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
      <Icon className="h-4 w-4 text-primary" />
    </div>
  </CardHeader>
  <CardContent className="px-6 pb-6">
    <div className="text-[34px] font-bold leading-none">{value}</div>
    <p className="text-xs text-muted-foreground mt-1">Supporting context</p>
  </CardContent>
</Card>
```

- Metric value: `text-[34px] font-bold leading-none`
- Card title: `text-[15px] font-medium`
- Supporting text: `text-xs text-muted-foreground mt-1`
- Icon container: `h-9 w-9 rounded-lg` with a tinted background matching the card's semantic color

### Semantic Color Coding

| Meaning | Background | Icon/Text |
|---|---|---|
| Neutral / primary metric | `bg-primary/10` | `text-primary` |
| Warning / attention needed | `bg-destructive/10` | `text-destructive` |
| Positive / favorable | `bg-green-500/10` | `text-green-600 dark:text-green-400` |
| Amber / at-risk | `bg-amber-500/10` | `text-amber-600 dark:text-amber-400` |
| Financial / exposure | `bg-orange-500/10` | `text-orange-600 dark:text-orange-400` |

Do not use status colors for aesthetic reasons. Color is reserved for operational meaning (see §14).

### Drag-to-Reorder

KPI cards within a strip support user-controlled reordering via `dnd-kit`:

- Wrap the strip in `<DndContext sensors={...} collisionDetection={closestCenter} onDragEnd={...}>`
- Wrap `<SortableContext items={orderedWidgetIds} strategy={rectSortingStrategy}>`
- Each card renders inside a `<SortableWidget id={widgetId}>` wrapper
- A drag handle icon (`GripVertical`) is positioned `absolute` and shown on `group-hover` (`opacity-0 group-hover:opacity-100`), so the handle is invisible at rest

The card order is persisted server-side (see §6 Widget Behavior).

---

## 4. Dashboard Behavior

### Layout

Module dashboards are tabbed pages with at least two tabs:

- **Overview tab** — live KPI strips, alert cards, summary widgets
- **Analytics tab** — deeper breakdown tables, grouped by dimensions (account, driver, region, etc.)

```tsx
<Tabs defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="analytics">Analytics</TabsTrigger>
  </TabsList>
  <TabsContent value="overview">...</TabsContent>
  <TabsContent value="analytics">...</TabsContent>
</Tabs>
```

### Mini Dashboard Panel

Below the header and above the tab content, the shared `ModuleDashboard` component renders a configurable widget panel:

```tsx
<ModuleDashboard moduleKey="claims" title="Claims Insights" />
```

- `moduleKey` must match a registered key in the dashboards registry
- Widgets are fetched from `/api/dashboards/{moduleKey}/config`
- Widget grid: `grid grid-cols-1 md:grid-cols-2 gap-4`
- Widget sizes: `S` = 1 column, `L` = 2 columns (`md:col-span-2`)
- A "Customize" button opens `CustomizeDashboardModal`

### Widget Library Button

The page header action bar includes a Widget Library button that opens `ClaimsWidgetLibrary` (or its equivalent). This is a `variant="outline"` button with a `LayoutDashboard` icon:

```tsx
<Button variant="outline" size="sm" onClick={() => setShowWidgetLibrary(true)}>
  <LayoutDashboard className="h-4 w-4 mr-2" />
  Widget Library
</Button>
```

---

## 5. List Behavior

### Page Structure

List pages (queues, workbenches) render:

1. Module-specific `CommandBar` wrapper at the top
2. Active filter chip strip (when filters are applied)
3. A single `Card` wrapping the table

```tsx
<div className="space-y-4">
  <ClaimsCommandBar {...props} />
  {activeFilterCount > 0 && <FilterChipStrip ... />}
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-orange-500" />
        Record Name
      </CardTitle>
    </CardHeader>
    <CardContent className="overflow-x-auto p-0">
      <Table>...</Table>
    </CardContent>
  </Card>
</div>
```

### Pagination

List pages use client-side or server-side pagination with a standard footer:

```tsx
<div className="flex items-center justify-between px-4 py-3 border-t">
  <p className="text-sm text-muted-foreground">
    Showing {start}–{end} of {total}
  </p>
  <div className="flex items-center gap-2">
    <Button variant="outline" size="sm" onClick={prevPage} disabled={page === 1}>
      <ChevronLeft className="h-4 w-4" />
    </Button>
    <Button variant="outline" size="sm" onClick={nextPage} disabled={page === lastPage}>
      <ChevronRight className="h-4 w-4" />
    </Button>
  </div>
</div>
```

### Empty State

Every list renders a distinct empty state rather than an empty table:

```tsx
<div className="py-16 text-center text-muted-foreground">
  <Icon className="h-10 w-10 mx-auto mb-3 opacity-30" />
  <p className="text-sm font-medium">No records found</p>
  <p className="text-xs mt-1">Try adjusting your filters or search terms.</p>
</div>
```

### Row Actions

Inline row actions (edit, view, delete) use `size="sm"` buttons. The primary row action (view detail) is triggered by clicking the entire row or a dedicated `Button variant="ghost" size="sm"` with an eye or arrow icon. Destructive row actions require a confirmation `AlertDialog` before execution.

---

## 6. Widget Behavior

### Server-Persisted Layout Preferences

KPI widget order and visibility are persisted per user per context via the layout preference API:

- `GET /api/layout/:context` — returns `{ widgetOrder: string[], hiddenWidgets: string[] }`
- `PUT /api/layout/:context` — updates the layout for the calling user

`context` is a slug that identifies the widget strip, e.g. `claims-kpi`. Each module defines its own context key.

```ts
// Read
const { data: layoutPrefs } = useQuery({ queryKey: ["/api/layout/claims-kpi"] });

// Write (debounced on drag end or visibility toggle)
const mutation = useMutation({
  mutationFn: (prefs) => apiRequest("PUT", "/api/layout/claims-kpi", prefs),
});
```

### Widget Visibility Toggle

The Widget Library panel (`ClaimsWidgetLibrary` or equivalent) allows users to show/hide individual KPI cards. Hidden widget IDs are stored in `hiddenWidgets[]` and filtered out before rendering:

```tsx
const visibleWidgets = orderedWidgetIds.filter(id => !hiddenWidgets.includes(id));
```

A "Reset to defaults" option clears all user preferences and restores the default order and visibility.

### Widget ID Conventions

Widget IDs are `camelCase` strings defined as a constant array near the top of the dashboard file:

```ts
const WIDGET_IDS = ["totalOpen", "exposureValue", "preventableRate", "avgDaysOpen", ...] as const;
type WidgetId = typeof WIDGET_IDS[number];
```

---

## 7. Search Standards

All module search uses `CommandBarSearch` from `@/components/CommandBar`.

### Behavior

- **Debounce:** 350ms (fires after user stops typing)
- **Immediate trigger:** Enter key fires immediately; Escape key clears the field
- **Clear button:** An `×` appears inside the input field whenever there is a value
- **Input sizing:** `h-9 text-sm pl-8 pr-8`; container is `flex-1 min-w-0 max-w-xs`
- **Icon:** `Search` (Lucide), positioned `absolute left-2.5`, `h-3.5 w-3.5 text-muted-foreground`

### Scope

Search is scoped to the primary entity of the list (claim number, driver name, description). Cross-entity deep search is not in scope for the standard CommandBar. If a module needs type-ahead entity lookup, use `CustomerSearchCombobox` or the equivalent, which uses shadcn `Command` inside a `Popover`.

---

## 8. Filter Standards

### Panel Anatomy

Filters open in a `Popover` (`w-80 p-4`) anchored to the Filters button. The panel header contains the title "Filters" and a "Clear all" link (visible only when filters are active):

```tsx
<div className="flex items-center justify-between mb-3">
  <span className="text-sm font-semibold">Filters</span>
  {activeFilterCount > 0 && (
    <button onClick={onClearFilters} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
      <X className="h-3 w-3" /> Clear all
    </button>
  )}
</div>
<div className="space-y-4">{filterFields}</div>
```

### Filter Field Pattern

Each filter field uses a `Label` + `Select` or `Input` pair:

```tsx
<div className="space-y-1">
  <Label className="text-xs font-medium text-muted-foreground">Field Name</Label>
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="h-8 text-sm w-[130px]">
      <SelectValue placeholder="All values" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">All Values</SelectItem>
      {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
    </SelectContent>
  </Select>
</div>
```

- Trigger height: `h-8` (smaller than standard `h-9` CommandBar buttons, to fit the popover comfortably)
- Label: `text-xs font-medium text-muted-foreground`
- Date range fields span full width and use `type="date"` `Input` elements

### Counting Active Filters

Count only filters that differ from their default "all" / empty state:

```ts
const activeFilterCount = [
  statusFilter !== "all",
  severityFilter !== "all",
  typeFilter !== "all",
  customerFilter !== "all",
  driverFilter !== "all",
  !!dateFrom,
  !!dateTo,
].filter(Boolean).length;
```

---

## 9. Table Standards

### Wrapper

Every data table must be wrapped in `overflow-x-auto` so columns scroll horizontally on medium-width desktops instead of clipping:

```tsx
<div className="overflow-x-auto">
  <Table>...</Table>
</div>
```

Alternatively, apply `overflow-x-auto` directly to the parent `CardContent`:

```tsx
<CardContent className="overflow-x-auto p-0">
  <Table>...</Table>
</CardContent>
```

### Column Sizing

- Give the primary/name column a minimum width: `className="min-w-[160px]"` or `w-[40%]`
- Numeric/status columns are right-aligned: `className="text-right"`
- Status badge columns should have a fixed width: `className="w-[120px]"`
- Never use percentage-only widths on all columns — the table will collapse on medium viewports

### Header Row

```tsx
<TableHeader>
  <TableRow>
    <TableHead className="min-w-[180px]">Primary Column</TableHead>
    <TableHead className="w-[120px]">Status</TableHead>
    <TableHead className="text-right w-[100px]">Amount</TableHead>
    <TableHead className="w-[80px] text-right">Actions</TableHead>
  </TableRow>
</TableHeader>
```

### Row Interaction

Clickable rows that drill down to a detail page use a `cursor-pointer` hover:

```tsx
<TableRow
  className="cursor-pointer hover:bg-muted/50"
  onClick={() => navigate(`/module/${row.id}`)}
>
```

### Status Badges

Use `ClaimStatusBadge` or an equivalent module-level `StatusBadge` component — never raw strings or ad-hoc colored spans inline in the table. Status badges are `variant="outline"` `Badge` components with a colored left dot or colored border, keyed to semantic status colors.

### Analytics Tables

Breakdown/analytics tables follow the same overflow and column rules. They additionally include:

- A `PreventabilityBadge` (or module-equivalent) for rate columns
- Group key links that drill into filtered views
- No pagination — analytics tables are pre-aggregated and capped server-side

---

## 10. Button Placement

### Hierarchy

| Tier | Variant | Use |
|---|---|---|
| Primary | `default` | One per view. The main CTA (e.g. "New Claim", "Submit"). Always rightmost. |
| Secondary | `outline` | Supporting actions (e.g. "Export", "Widget Library", "Back"). |
| Tertiary | `ghost` | Low-emphasis actions (e.g. "Cancel", "Waive", inline row context). |
| Destructive | `destructive` | Irreversible actions. Must be preceded by `AlertDialog` confirmation. |

### Page Header Actions (Right Side)

Left to right order:
1. Navigation shortcuts (`outline`, e.g. "View Queue")
2. Module utilities (`outline`, e.g. "Widget Library", "Import")
3. Primary CTA (`default`, e.g. "New Claim")

```tsx
<div className="flex items-center gap-2 flex-wrap">
  <Link href="/claims"><Button variant="outline" size="sm"><List /> Queue</Button></Link>
  <Button variant="outline" size="sm" onClick={openWidgetLibrary}><LayoutDashboard /> Widget Library</Button>
  <Link href="/claims/new"><Button size="sm"><Plus /> New Claim</Button></Link>
</div>
```

### Inline / Section-Level Buttons

- Use `size="sm"` for all buttons that appear inside cards or table rows
- Save + Cancel pairs in edit contexts: Save is `default` (with a `Save` icon), Cancel is `ghost`
- Never place a `default` (primary) button inside a table row — use `ghost` or `outline`

### Loading States

Primary action buttons show a spinner when submitting:

```tsx
<Button type="submit" disabled={isSubmitting}>
  {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
  {isSubmitting ? "Saving…" : "Save"}
</Button>
```

---

## 11. Navigation Patterns

### Between Pages

Use `wouter` `<Link>` for all client-side navigation. Never use `<a>` for internal routes.

```tsx
import { Link } from "wouter";
<Link href="/claims/123"><span className="text-primary hover:underline cursor-pointer">{claimId}</span></Link>
```

### Programmatic Navigation

```tsx
import { useLocation } from "wouter";
const [, navigate] = useLocation();
navigate(`/claims/${newId}`);
```

### Route Conventions

Modules follow this URL structure:

| Route | Page |
|---|---|
| `/module` | Dashboard (default entry point) |
| `/module/queue` | List / queue view |
| `/module/new` | New record form |
| `/module/:id` | Detail page |
| `/module/:id/edit` | Edit page (if separate from detail) |

The dashboard is the default entry point. The header action bar on the dashboard includes a link to the queue, and the queue includes a link back to the dashboard.

### Tab-Based Sub-Navigation

Detail pages with multiple sections use shadcn `Tabs`. Tab values are short lowercase slugs (`general`, `financials`, `attachments`, `activity`). The default tab is always the most-used operational view.

URL-synced tabs (where the active tab is reflected in the URL query string) use:

```tsx
const [searchParams, setSearchParams] = useSearchParams();
const activeTab = searchParams.get("tab") ?? "general";
```

---

## 12. Drill-Down Behavior

### Detail Page Layout

Detail pages use a two-column layout at `xl` and above:

```tsx
<div className="flex gap-6 items-start">
  {/* Main content */}
  <div className="flex-1 min-w-0 space-y-4">
    {sections}
  </div>

  {/* Right rail — hidden below xl */}
  <div className="w-80 shrink-0 hidden xl:flex xl:flex-col"
       style={{ position: "sticky", top: "72px", maxHeight: "calc(100vh - 88px)" }}>
    <TimelinePanel />
  </div>
</div>
```

The right rail is sticky and vertically scrollable independently of the main content.

### Collapsible Sections

Long detail pages break content into collapsible `Card` sections using shadcn `Collapsible`:

```tsx
<Card>
  <Collapsible open={!collapsed} onOpenChange={(o) => setCollapsed(!o)}>
    <CollapsibleTrigger asChild>
      <CardHeader className="cursor-pointer flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-4 w-4" /> Section Name
        </CardTitle>
        <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? "" : "rotate-180"}`} />
      </CardHeader>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <CardContent>...</CardContent>
    </CollapsibleContent>
  </Collapsible>
</Card>
```

Section collapsed state is stored in local React state (`useState<Set<string>>`). It is not persisted across sessions.

### Inline Editing

Fields on detail pages use `EditableField` and `SelectableField` components for in-place editing:

- Display mode: value text + edit icon (pencil), revealed on hover
- Edit mode: input or select + Save (`default` button) + Cancel (`ghost` button)
- Save is scoped to the individual field — there is no page-level "Save All"

### Activity Timeline

The `TimelinePanel` right-rail component shows chronological activity (status changes, notes, notifications). It is present on all detail pages. On viewports below `xl`, it is hidden and activity is accessible via a dedicated "Activity" tab in the main content area.

### Error / Not Found States

```tsx
{!record && (
  <div className="flex flex-col items-center justify-center py-24 text-center">
    <AlertTriangle className="h-10 w-10 text-muted-foreground/50 mb-4" />
    <p className="text-sm font-medium">Record not found</p>
    <Link href="/module">
      <Button variant="outline" size="sm" className="mt-4">Back to Module</Button>
    </Link>
  </div>
)}
```

---

## 13. Responsive Rules

### Target Viewports

| Label | Width | Behavior |
|---|---|---|
| Desktop standard | 1280–1440px | Full layout, full column counts |
| Desktop wide | 1440–1920px | Same as standard — grids fill naturally |
| Desktop compact | 1024–1279px | Reduced columns; 2–4 col grids |
| Tablet | 768–1023px | Single-column main content; filters may collapse |
| Mobile | < 768px | Supported but not the primary target |

### Breakpoint Usage Guidelines

| Breakpoint | Class | Use for |
|---|---|---|
| `sm` | ≥ 640px | Text scaling (`sm:text-3xl`), grid step-up (`sm:grid-cols-3`) |
| `md` | ≥ 768px | Layout changes, 2-column content grids |
| `lg` | ≥ 1024px | Use sparingly for KPI grids — prefer `xl` |
| `xl` | ≥ 1280px | Full column counts for KPI strips, sticky timeline rail |

**KPI grid rule:** Never gate the full column count at `lg`. Use `xl` to avoid ~160px-wide cells at 1024px.

### Overflow Handling

- Horizontal table overflow: always use `overflow-x-auto` wrapper (never `overflow-hidden` on a table container)
- Vertical list overflow in panels: cap with `max-h-48 overflow-y-auto`
- Timeline panel: `overflow-y-auto` within its sticky container, independent of main scroll

### Content That Must Never Be Hidden

- Action buttons in the page header
- CommandBar search and primary action
- Table row primary action (view/open)
- Status badges in tables

---

## 14. Light and Dark Mode

### Principle

Always use Tailwind semantic tokens first (`bg-card`, `text-foreground`, `text-muted-foreground`, `border`, `bg-muted`). Add explicit `dark:` overrides only for **status-colored** backgrounds, borders, and text that cannot be expressed through semantic tokens.

### Semantic Token Baseline

| Element | Light | Dark (via semantic token) |
|---|---|---|
| Page background | `bg-background` | automatic |
| Card background | `bg-card` / `bg-white dark:bg-card` | automatic |
| Border | `border` | automatic |
| Muted text | `text-muted-foreground` | automatic |
| Input backgrounds | `bg-input` | automatic |

### Status Color Pattern

Status-colored UI (KPI card backgrounds, alert banners, badge backgrounds) always pairs a light-mode tint with an explicit dark-mode override:

```tsx
// Structure: bg-{color}-50 dark:bg-{color}-950/20  (background)
//            border-{color}-200 dark:border-{color}-800/50 (border, optional)
//            text-{color}-700 dark:text-{color}-300  (label)
//            text-{color}-600 dark:text-{color}-400  (metric value)

// Red / destructive
"bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300"

// Amber / warning
"bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300"

// Green / favorable
"bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300"

// Blue / informational
"bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300"

// Emerald / compliant
"bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300"

// Purple / notable
"bg-purple-50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-300"
```

### Status Dot Colors

Activity timeline and status indicator dots always declare both modes:

```tsx
const STATUS_COLORS = {
  open:       "bg-blue-500 dark:bg-blue-400",
  pending:    "bg-amber-500 dark:bg-amber-400",
  resolved:   "bg-emerald-500 dark:bg-emerald-400",
  escalated:  "bg-violet-500 dark:bg-violet-400",
  closed:     "bg-gray-400 dark:bg-gray-500",
};
```

### What Not to Do

- Do not use `bg-white` without pairing it with `dark:bg-card`
- Do not hardcode hex color values — use Tailwind palette classes
- Do not use `text-gray-700` for anything semantic — use `text-muted-foreground`
- Do not assume any color is visible in dark mode without explicitly testing or pairing with a `dark:` override

---

## Appendix A — Shared Component Quick Reference

| Component | Path | Use |
|---|---|---|
| `CommandBar` | `@/components/CommandBar` | Base action bar; extend per module |
| `CommandBarSearch` | `@/components/CommandBar` | Debounced search input |
| `CommandBarFilters` | `@/components/CommandBar` | Popover filter panel |
| `CommandBarSort` | `@/components/CommandBar` | Sort selector |
| `CommandBarPrimaryAction` | `@/components/CommandBar` | Rightmost primary CTA |
| `ModuleDashboard` | `@/components/dashboard/ModuleDashboard` | Configurable mini-dashboard widget panel |
| `SortableWidget` | (dnd-kit wrapper in dashboard file) | KPI card drag-to-reorder |
| `ClaimStatusBadge` | `@/components/claims/` | Status badge (adapt per module) |
| `EditableField` | Inline in detail page | In-place field editing |
| `TimelinePanel` | Inline in detail page | Right-rail activity log |

---

## Appendix B — Checklist for New Modules

When building a new module, verify these items before shipping:

- [ ] Page header uses `text-2xl sm:text-3xl font-bold` h1 with `text-muted-foreground` subtitle
- [ ] CommandBar uses shared `CommandBar` component; module wrapper created in `components/{module}/`
- [ ] KPI strip uses `grid-cols-2 sm:grid-cols-3 xl:grid-cols-6` (not `lg:`)
- [ ] KPI cards use `hover-elevate cursor-pointer` and link to filtered views
- [ ] Widget order and visibility persisted via `PUT /api/layout/{module}-kpi`
- [ ] Table container has `overflow-x-auto`
- [ ] Table primary column has `min-w-[160px]` or explicit width
- [ ] Empty state renders an icon + message, not an empty table
- [ ] All status-colored backgrounds paired with `dark:bg-{color}-950/20`
- [ ] All status text values paired with `dark:text-{color}-400`
- [ ] Destructive actions protected by `AlertDialog` confirmation
- [ ] Detail page has `min-w-0 flex-1` on main column
- [ ] Right-rail panel hidden below `xl` (`hidden xl:flex`)
- [ ] No `overflow-hidden` on any element that wraps a scrolling table
- [ ] `CommandBar` active filter count badge shows correctly
- [ ] Module routes follow `/module`, `/module/queue`, `/module/:id` convention
