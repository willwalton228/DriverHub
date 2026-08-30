/**
 * Compliance Command Widget
 *
 * Unified compliance control panel consolidating MVR, License, and Drug Test
 * items into one prioritized operational view.
 *
 * Top-level: 3 summary tiles (Expired / Expiring / Missing)
 * Drill-down: filterable, sortable, paginated table with per-row task creation
 *
 * Priority order: Expired → Missing → Expiring (most critical first)
 * Task integration: per-row "Create Task" fires ensure-batch for that single item
 */

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ShieldAlert, Car, IdCard, FlaskConical,
  AlertTriangle, CheckCircle2, XCircle, Search,
  ChevronUp, ChevronDown, ChevronsUpDown,
  ClipboardList, ExternalLink, Loader2, ChevronLeft, ChevronRight,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { workPlanTaskUrl, taskStatusLabel, taskStatusVariant } from "@/hooks/useWorkPlanTaskMap";

// ─── Types ───────────────────────────────────────────────────────────────────

type ComplianceType   = "MVR" | "License" | "DrugTest";
type ComplianceStatus = "expired" | "expiring" | "missing";
type Priority         = "high" | "medium" | "low";

interface ComplianceItem {
  driverId:           string;
  firstName:          string | null;
  lastName:           string | null;
  email:              string | null;
  driverStatus:       string;
  driverNumber:       string | null;
  primaryAccountId:   string | null;
  primaryAccountName: string | null;
  complianceType:     ComplianceType;
  complianceStatus:   ComplianceStatus;
  priority:           Priority;
  relevantDate:       string | null;
  daysValue:          number | null;
}

interface CommandResponse {
  summary:     { expired: number; expiring: number; missing: number };
  total:       number;
  items:       ComplianceItem[];
  evaluatedAt: string;
}

interface TaskEntry { taskId: string; status: string }
type LocalTaskMap = Record<string, TaskEntry>; // key = `${type}|${driverId}`

type SortField = "name" | "complianceType" | "complianceStatus" | "relevantDate" | "daysValue" | "account";
type SortDir   = "asc" | "desc";

const PAGE_SIZE = 50;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function driverName(item: ComplianceItem): string {
  const f = item.firstName ?? "";
  const l = item.lastName  ?? "";
  return f || l ? `${f} ${l}`.trim() : item.email ?? "Unknown";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch { return iso; }
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  } catch { return iso; }
}

function statusSortWeight(s: ComplianceStatus): number {
  if (s === "expired")  return 0;
  if (s === "missing")  return 1;
  return 2;
}

function typePriority(type: ComplianceType, status: ComplianceStatus): Priority {
  if (status === "expired" || status === "missing") return "high";
  if (type === "MVR") return "medium";
  return "low";
}

// ─── Sub-component: Sort Icon ─────────────────────────────────────────────────

function SortIcon({ field, current, dir }: { field: SortField; current: SortField; dir: SortDir }) {
  if (field !== current) return <ChevronsUpDown className="h-3 w-3 text-muted-foreground/40 inline ml-1" />;
  return dir === "asc"
    ? <ChevronUp   className="h-3 w-3 text-foreground inline ml-1" />
    : <ChevronDown className="h-3 w-3 text-foreground inline ml-1" />;
}

// ─── Sub-component: Compliance Type Badge ────────────────────────────────────

function TypeBadge({ type }: { type: ComplianceType }) {
  const cfg: Record<ComplianceType, { icon: any; label: string; cls: string }> = {
    MVR:      { icon: Car,         label: "MVR",       cls: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800" },
    License:  { icon: IdCard,      label: "License",   cls: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800" },
    DrugTest: { icon: FlaskConical, label: "Drug Test", cls: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800" },
  };
  const { icon: Icon, label, cls } = cfg[type];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cls}`}>
      <Icon className="h-3 w-3 shrink-0" />
      {label}
    </span>
  );
}

// ─── Sub-component: Compliance Status Badge ───────────────────────────────────

function StatusLabel({ status }: { status: ComplianceStatus }) {
  const cfg: Record<ComplianceStatus, { label: string; cls: string }> = {
    expired:  { label: "Expired",  cls: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800" },
    expiring: { label: "Expiring", cls: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800" },
    missing:  { label: "Missing",  cls: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800" },
  };
  const { label, cls } = cfg[status];
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border ${cls}`}>
      {label}
    </span>
  );
}

// ─── Sub-component: Days Value Cell ──────────────────────────────────────────

function DaysCell({ item }: { item: ComplianceItem }) {
  if (item.daysValue === null) return <span className="text-xs text-muted-foreground/40">—</span>;
  if (item.complianceStatus === "expired") {
    return <span className="text-xs font-semibold text-red-600 dark:text-red-400 tabular-nums">{item.daysValue}d overdue</span>;
  }
  if (item.complianceStatus === "expiring") {
    const cls = item.daysValue <= 3
      ? "text-red-600 dark:text-red-400 font-bold"
      : item.daysValue <= 7
        ? "text-red-600 dark:text-red-400 font-semibold"
        : "text-yellow-600 dark:text-yellow-400 font-medium";
    return <span className={`text-xs tabular-nums ${cls}`}>{item.daysValue}d remaining</span>;
  }
  return <span className="text-xs text-muted-foreground tabular-nums">{item.daysValue}d</span>;
}

// ─── Sub-component: Relevant Date label ──────────────────────────────────────

function DateLabel({ item }: { item: ComplianceItem }) {
  if (!item.relevantDate) return <span className="text-xs text-muted-foreground/40 italic">No record</span>;
  const label = item.complianceType === "MVR" ? "Completed" : "Expires";
  return (
    <div className="text-xs">
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{fmtDate(item.relevantDate)}</span>
    </div>
  );
}

// ─── Sub-component: Priority Dot ─────────────────────────────────────────────

function PriorityDot({ priority }: { priority: Priority }) {
  const cls = priority === "high" ? "bg-red-500" : priority === "medium" ? "bg-yellow-500" : "bg-muted-foreground/40";
  return <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${cls}`} />;
}

// ─── Summary Tile ─────────────────────────────────────────────────────────────

function SummaryTile({
  label, count, icon: Icon, colorCls, borderCls, active, onClick,
}: {
  label: string; count: number; icon: any;
  colorCls: string; borderCls: string;
  active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 rounded-md border-2 transition-all hover-elevate cursor-pointer ${
        active ? `${borderCls} bg-muted/60` : "border-border/50 bg-muted/20"
      }`}
      data-testid={`tile-compliance-${label.toLowerCase()}`}
    >
      <div className={`flex items-center gap-1.5 ${colorCls}`}>
        <Icon className="h-4 w-4 shrink-0" />
        <span className={`text-2xl font-bold tabular-nums leading-none ${colorCls}`}>{count}</span>
      </div>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </button>
  );
}

// ─── Main Widget ─────────────────────────────────────────────────────────────

export function ComplianceCommandWidget() {
  const [, navigate] = useLocation();
  const [sheetOpen, setSheetOpen]           = useState(false);
  const [activeFilter, setActiveFilter]     = useState<ComplianceStatus | "all">("all");
  const [typeFilter, setTypeFilter]         = useState<ComplianceType | "all">("all");
  const [accountFilter, setAccountFilter]   = useState("all");
  const [search, setSearch]                 = useState("");
  const [sortField, setSortField]           = useState<SortField>("complianceStatus");
  const [sortDir, setSortDir]               = useState<SortDir>("asc");
  const [page, setPage]                     = useState(1);
  const [taskMap, setTaskMap]               = useState<LocalTaskMap>({});
  const [creatingTask, setCreatingTask]     = useState<string | null>(null); // key being created

  const { data, isLoading, dataUpdatedAt } = useQuery<CommandResponse>({
    queryKey: ["/api/compliance/command"],
    staleTime: 5 * 60 * 1000,
    refetchInterval: 30_000,
  });

  // Unique accounts for filter dropdown
  const accountOptions = useMemo(() => {
    if (!data?.items) return [];
    const map = new Map<string, string>();
    for (const item of data.items) {
      if (item.primaryAccountId && item.primaryAccountName) {
        map.set(item.primaryAccountId, item.primaryAccountName);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  // Filtered + sorted items
  const filtered = useMemo(() => {
    if (!data?.items) return [];
    const q = search.toLowerCase().trim();
    let base = data.items;

    if (activeFilter !== "all") base = base.filter(i => i.complianceStatus === activeFilter);
    if (typeFilter   !== "all") base = base.filter(i => i.complianceType   === typeFilter);
    if (accountFilter !== "all") base = base.filter(i => i.primaryAccountId === accountFilter);
    if (q) {
      base = base.filter(i =>
        driverName(i).toLowerCase().includes(q) ||
        (i.primaryAccountName ?? "").toLowerCase().includes(q) ||
        (i.driverNumber ?? "").toLowerCase().includes(q)
      );
    }

    return [...base].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":             cmp = driverName(a).localeCompare(driverName(b)); break;
        case "complianceType":   cmp = a.complianceType.localeCompare(b.complianceType); break;
        case "complianceStatus": cmp = statusSortWeight(a.complianceStatus) - statusSortWeight(b.complianceStatus); break;
        case "relevantDate":     cmp = (a.relevantDate ?? "").localeCompare(b.relevantDate ?? ""); break;
        case "daysValue":        cmp = (a.daysValue ?? -1) - (b.daysValue ?? -1); break;
        case "account":          cmp = (a.primaryAccountName ?? "").localeCompare(b.primaryAccountName ?? ""); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, activeFilter, typeFilter, accountFilter, search, sortField, sortDir]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems   = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Task item key
  function taskKey(item: ComplianceItem): string {
    return `${item.complianceType}|${item.driverId}`;
  }

  function eventTypeFor(item: ComplianceItem): string {
    const map: Record<string, Record<string, string>> = {
      MVR:      { expired: "mvr_expired",          expiring: "mvr_expiring_soon",      missing: "mvr_missing" },
      License:  { expired: "license_expired",       expiring: "license_expiring_soon",  missing: "license_missing" },
      DrugTest: { missing: "drug_test_missing",     expired: "drug_test_expired",       expiring: "drug_test_expiring" },
    };
    return map[item.complianceType]?.[item.complianceStatus] ?? `${item.complianceType}_${item.complianceStatus}`.toLowerCase();
  }

  function reasonFor(item: ComplianceItem): string {
    const name = driverName(item);
    const acct = item.primaryAccountName ? ` — ${item.primaryAccountName}` : "";
    if (item.complianceStatus === "expired" && item.daysValue !== null) {
      return `${name}: ${item.complianceType} expired ${item.daysValue}d ago${acct}`;
    }
    if (item.complianceStatus === "expiring" && item.daysValue !== null) {
      return `${name}: ${item.complianceType} expiring in ${item.daysValue}d${acct}`;
    }
    return `${name}: ${item.complianceType} record missing${acct}`;
  }

  const handleCreateTask = useCallback(async (item: ComplianceItem) => {
    const key = taskKey(item);
    setCreatingTask(key);
    try {
      const res = await fetch("/api/work-plan-items/ensure-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          items: [{
            eventType:    eventTypeFor(item),
            recordId:     item.driverId,
            recordName:   driverName(item),
            reason:       reasonFor(item),
            priority:     typePriority(item.complianceType, item.complianceStatus),
            recordUrl:    `/drivers/${item.driverId}`,
            taskType:     item.complianceType,
            sourceModule: "compliance",
            category:     "driver_ops",
          }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const entry = data.taskMap?.[item.driverId];
        if (entry) {
          setTaskMap(prev => ({ ...prev, [key]: { taskId: entry.taskId, status: entry.status } }));
        }
      }
    } catch (_e) { /* silent */ }
    finally { setCreatingTask(null); }
  }, []);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  // Open sheet and pre-filter to status tile clicked
  function handleTileClick(status: ComplianceStatus) {
    setActiveFilter(prev => prev === status ? "all" : status);
    setPage(1);
    setSheetOpen(true);
  }

  const summary = data?.summary ?? { expired: 0, expiring: 0, missing: 0 };
  const total   = data?.total   ?? 0;
  const isFullyCompliant = total === 0 && !isLoading;

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="flex-1 h-16 rounded-md" />)}
        </div>
        <Skeleton className="h-6 w-32" />
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
    );
  }

  // ── Empty / compliant state ────────────────────────────────────────────────
  if (isFullyCompliant) {
    return (
      <div className="space-y-3" data-testid="widget-compliance-command">
        <div className="flex gap-2">
          <SummaryTile label="Expired"  count={0} icon={XCircle}       colorCls="text-muted-foreground" borderCls="border-border" active={false} onClick={() => {}} />
          <SummaryTile label="Expiring" count={0} icon={AlertTriangle}  colorCls="text-muted-foreground" borderCls="border-border" active={false} onClick={() => {}} />
          <SummaryTile label="Missing"  count={0} icon={ShieldAlert}    colorCls="text-muted-foreground" borderCls="border-border" active={false} onClick={() => {}} />
        </div>
        <div className="flex flex-col items-center gap-2 py-6">
          <CheckCircle2 className="h-8 w-8 text-green-500" />
          <p className="text-sm font-semibold text-green-600 dark:text-green-400">All drivers compliant</p>
          {dataUpdatedAt > 0 && (
            <p className="text-xs text-muted-foreground">
              Last evaluated {fmtDateTime(new Date(dataUpdatedAt).toISOString())}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Normal state ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-3" data-testid="widget-compliance-command">

      {/* ── Summary Tiles ── */}
      <div className="flex gap-2">
        <SummaryTile
          label="Expired" count={summary.expired}
          icon={XCircle}
          colorCls="text-red-600 dark:text-red-400"
          borderCls="border-red-400 dark:border-red-600"
          active={activeFilter === "expired"}
          onClick={() => handleTileClick("expired")}
        />
        <SummaryTile
          label="Expiring" count={summary.expiring}
          icon={AlertTriangle}
          colorCls="text-yellow-600 dark:text-yellow-400"
          borderCls="border-yellow-400 dark:border-yellow-600"
          active={activeFilter === "expiring"}
          onClick={() => handleTileClick("expiring")}
        />
        <SummaryTile
          label="Missing" count={summary.missing}
          icon={ShieldAlert}
          colorCls="text-orange-600 dark:text-orange-400"
          borderCls="border-orange-400 dark:border-orange-600"
          active={activeFilter === "missing"}
          onClick={() => handleTileClick("missing")}
        />
      </div>

      {/* ── Preview list (top 6, highest risk) ── */}
      <div className="space-y-1" data-testid="compliance-preview-list">
        {(data?.items ?? []).slice(0, 6).map((item, idx) => (
          <button
            key={`${item.driverId}-${item.complianceType}-${idx}`}
            type="button"
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover-elevate text-left"
            onClick={() => {
              setActiveFilter("all");
              setPage(1);
              setSheetOpen(true);
            }}
            data-testid={`compliance-preview-row-${idx}`}
          >
            <PriorityDot priority={typePriority(item.complianceType, item.complianceStatus)} />
            <TypeBadge type={item.complianceType} />
            <span className="flex-1 text-sm font-medium truncate">{driverName(item)}</span>
            <StatusLabel status={item.complianceStatus} />
            {item.daysValue !== null && item.complianceStatus !== "missing" && (
              <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                {item.complianceStatus === "expired" ? `${item.daysValue}d` : `${item.daysValue}d left`}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── View All button ── */}
      <Button
        variant="outline" size="sm" className="w-full"
        onClick={() => { setActiveFilter("all"); setPage(1); setSheetOpen(true); }}
        data-testid="btn-compliance-view-all"
      >
        View all {total} compliance items
      </Button>

      {/* ── Drill-Down Sheet ── */}
      <Sheet open={sheetOpen} onOpenChange={v => { if (!v) setSheetOpen(false); }}>
        <SheetContent side="right" className="w-full max-w-5xl flex flex-col gap-0 p-0">

          {/* Header */}
          <SheetHeader className="px-6 pt-5 pb-4 border-b">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary shrink-0" />
              <SheetTitle className="text-base">Compliance Command</SheetTitle>
            </div>
            <SheetDescription className="text-sm">
              {total} total compliance item{total !== 1 ? "s" : ""} across all drivers.
              Sorted highest-risk first. Click a row to open Driver Detail.
            </SheetDescription>
          </SheetHeader>

          {/* Filter bar */}
          <div className="px-6 py-3 border-b bg-muted/30 flex flex-col gap-2">
            {/* Summary tiles (mini) */}
            <div className="flex gap-2">
              {(["all", "expired", "expiring", "missing"] as const).map(s => {
                const count = s === "all" ? total
                  : s === "expired"  ? summary.expired
                  : s === "expiring" ? summary.expiring
                  : summary.missing;
                const cls = s === "all" ? "text-foreground"
                  : s === "expired"  ? "text-red-600 dark:text-red-400"
                  : s === "expiring" ? "text-yellow-600 dark:text-yellow-400"
                  : "text-orange-600 dark:text-orange-400";
                const borderCls = activeFilter === s ? "border-primary" : "border-border/50";
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setActiveFilter(s); setPage(1); }}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md border text-xs font-medium hover-elevate ${borderCls} ${activeFilter === s ? "bg-muted" : ""}`}
                    data-testid={`filter-status-${s}`}
                  >
                    <span className={`font-bold ${cls}`}>{count}</span>
                    <span className="text-muted-foreground capitalize">{s === "all" ? "All" : s}</span>
                  </button>
                );
              })}
            </div>

            {/* Type + Account + Search */}
            <div className="flex flex-wrap gap-2">
              <Select value={typeFilter} onValueChange={v => { setTypeFilter(v as any); setPage(1); }}>
                <SelectTrigger className="h-8 w-36 text-xs" data-testid="filter-type">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="MVR">MVR</SelectItem>
                  <SelectItem value="License">License</SelectItem>
                  <SelectItem value="DrugTest">Drug Test</SelectItem>
                </SelectContent>
              </Select>

              <Select value={accountFilter} onValueChange={v => { setAccountFilter(v); setPage(1); }}>
                <SelectTrigger className="h-8 w-44 text-xs" data-testid="filter-account">
                  <SelectValue placeholder="All Accounts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  {accountOptions.map(([id, name]) => (
                    <SelectItem key={id} value={id}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search driver or account…"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  className="pl-8 h-8 text-xs"
                  data-testid="input-compliance-search"
                />
              </div>
            </div>

            {/* Results summary */}
            <p className="text-xs text-muted-foreground">
              {filtered.length === total
                ? `${total} items`
                : `${filtered.length} of ${total} items`}
              {data?.evaluatedAt && (
                <> · Last updated {fmtDateTime(data.evaluatedAt)}</>
              )}
            </p>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  {([
                    { field: "name"            as SortField, label: "Driver" },
                    { field: "complianceType"  as SortField, label: "Type" },
                    { field: "complianceStatus"as SortField, label: "Status" },
                    { field: "relevantDate"    as SortField, label: "Date" },
                    { field: "daysValue"       as SortField, label: "Days" },
                    { field: "account"         as SortField, label: "Account" },
                  ]).map(col => (
                    <TableHead
                      key={col.field}
                      className="cursor-pointer select-none whitespace-nowrap text-xs"
                      onClick={() => toggleSort(col.field)}
                      data-testid={`th-compliance-${col.field}`}
                    >
                      {col.label}
                      <SortIcon field={col.field} current={sortField} dir={sortDir} />
                    </TableHead>
                  ))}
                  <TableHead className="text-xs text-muted-foreground w-16 text-center">Driver</TableHead>
                  <TableHead className="w-32 text-xs text-muted-foreground text-center">Work Plan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-sm text-muted-foreground">
                      {search || activeFilter !== "all" || typeFilter !== "all" || accountFilter !== "all"
                        ? "No items match your filters."
                        : "No compliance issues found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  pageItems.map((item, idx) => {
                    const key = taskKey(item);
                    const task = taskMap[key];
                    const isCreating = creatingTask === key;
                    return (
                      <TableRow
                        key={`${item.driverId}-${item.complianceType}-${idx}`}
                        className="cursor-pointer hover-elevate"
                        data-testid={`row-compliance-${item.driverId}-${item.complianceType}`}
                      >
                        {/* Driver */}
                        <TableCell
                          className="py-2 cursor-pointer"
                          onClick={() => { setSheetOpen(false); navigate(`/drivers/${item.driverId}`); }}
                        >
                          <div className="flex items-center gap-1.5">
                            <PriorityDot priority={typePriority(item.complianceType, item.complianceStatus)} />
                            <div>
                              <p className="text-sm font-medium leading-tight">{driverName(item)}</p>
                              {item.driverNumber && (
                                <p className="text-[10px] text-muted-foreground">#{item.driverNumber}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Type */}
                        <TableCell className="py-2">
                          <TypeBadge type={item.complianceType} />
                        </TableCell>

                        {/* Compliance Status */}
                        <TableCell className="py-2">
                          <StatusLabel status={item.complianceStatus} />
                        </TableCell>

                        {/* Date */}
                        <TableCell className="py-2">
                          <DateLabel item={item} />
                        </TableCell>

                        {/* Days */}
                        <TableCell className="py-2">
                          <DaysCell item={item} />
                        </TableCell>

                        {/* Account */}
                        <TableCell className="py-2">
                          {item.primaryAccountName ? (
                            <span className="text-xs text-muted-foreground truncate max-w-[160px] block">
                              {item.primaryAccountName}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/40 italic">—</span>
                          )}
                        </TableCell>

                        {/* Driver Status */}
                        <TableCell className="py-2 text-center">
                          <StatusBadge status={item.driverStatus} />
                        </TableCell>

                        {/* Work Plan */}
                        <TableCell
                          className="py-2 text-center"
                          onClick={e => e.stopPropagation()}
                        >
                          {task ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 hover-elevate px-1.5 py-0.5 rounded text-xs"
                                  onClick={() => {
                                    setSheetOpen(false);
                                    navigate(workPlanTaskUrl(task.taskId));
                                  }}
                                  data-testid={`btn-task-view-${item.driverId}-${item.complianceType}`}
                                >
                                  <Badge variant={taskStatusVariant(task.status)} className="text-[10px] px-1.5 py-0">
                                    {taskStatusLabel(task.status)}
                                  </Badge>
                                  <ClipboardList className="h-3 w-3 text-muted-foreground" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>View in Work Plan</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[10px] gap-1"
                                  disabled={isCreating}
                                  onClick={() => handleCreateTask(item)}
                                  data-testid={`btn-task-create-${item.driverId}-${item.complianceType}`}
                                >
                                  {isCreating
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <ClipboardList className="h-3 w-3" />}
                                  {isCreating ? "…" : "Task"}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Create Work Plan Task</TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination footer */}
          <div className="px-6 py-3 border-t bg-muted/20 flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground">
              Page {currentPage} of {totalPages} · {filtered.length} item{filtered.length !== 1 ? "s" : ""}
              {filtered.length !== total && ` (filtered from ${total})`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm"
                disabled={currentPage <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                data-testid="btn-compliance-prev"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground px-1">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline" size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                data-testid="btn-compliance-next"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSheetOpen(false)} data-testid="btn-compliance-close">
                Close
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
