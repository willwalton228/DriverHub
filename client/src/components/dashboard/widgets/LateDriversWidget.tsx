/**
 * Late Drivers Widget
 *
 * Two compliance metrics sourced from WIW shift + time data:
 *   1. Late Today  — shifts in progress past the 10-min grace, driver not yet clocked in
 *   2. Late 7 Days — historical shifts where clock-in occurred after shift start
 *
 * Drill-down sheet with account/date/type filters, sortable by minutes late,
 * and repeat-offender highlighting (drivers with multiple late events in window).
 *
 * Auto-generates Driver Ops work plan tasks for each driver listed.
 */

import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Timer, Clock, ChevronUp, ChevronDown, ChevronsUpDown,
  Search, ExternalLink, AlertTriangle, ClipboardList,
} from "lucide-react";
import {
  useWorkPlanTaskMap, workPlanTaskUrl, taskStatusLabel, taskStatusVariant,
  type EnsureItem, type TaskMap,
} from "@/hooks/useWorkPlanTaskMap";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LateDriverRecord {
  driverId: string | null;
  driverName: string;
  driverEmail: string | null;
  shiftId: string;
  startTime: string;
  endTime: string;
  clockIn: string | null;
  accountId: string | null;
  accountName: string | null;
  minutesLate: number;
  lateType: "clocked_in_late" | "no_clockin";
}

interface LateDriversResponse {
  lateToday: number;
  lateCount7d: number;
  records: LateDriverRecord[];
}

type SortField = "driver" | "account" | "shiftDate" | "startTime" | "clockIn" | "minutesLate";
type SortDir   = "asc" | "desc";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
  } catch { return iso; }
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", hour12: true,
    });
  } catch { return iso; }
}

function shiftDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA");
}

function lateSeverityClass(min: number): string {
  if (min >= 60)  return "text-destructive font-bold";
  if (min >= 30)  return "text-destructive";
  if (min >= 10)  return "text-orange-600 dark:text-orange-400 font-medium";
  return "text-muted-foreground";
}

function fmtMinutes(min: number): string {
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${min}m`;
}

// ─── Sort Icon ────────────────────────────────────────────────────────────────

function SortIcon({ field, current, dir }: { field: SortField; current: SortField; dir: SortDir }) {
  if (field !== current) return <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50 inline ml-1" />;
  return dir === "asc"
    ? <ChevronUp   className="h-3 w-3 text-foreground inline ml-1" />
    : <ChevronDown className="h-3 w-3 text-foreground inline ml-1" />;
}

// ─── Late Type Badge ──────────────────────────────────────────────────────────

function LateTypeBadge({ lateType }: { lateType: "clocked_in_late" | "no_clockin" }) {
  if (lateType === "no_clockin") {
    return (
      <Badge variant="secondary" className="text-xs gap-1 text-orange-600 dark:text-orange-400">
        <Clock className="h-2.5 w-2.5" />
        In Progress
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs gap-1">
      <Timer className="h-2.5 w-2.5" />
      Clocked In Late
    </Badge>
  );
}

// ─── Repeat Offender Map ──────────────────────────────────────────────────────

function buildOffenderMap(records: LateDriverRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of records) {
    const key = r.driverName;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

// ─── Drill-down Sheet ─────────────────────────────────────────────────────────

function LateDriversSheet({
  open,
  onClose,
  data,
  taskMap,
}: {
  open: boolean;
  onClose: () => void;
  data: LateDriversResponse | undefined;
  taskMap: TaskMap;
}) {
  const [, navigate] = useLocation();

  const [search,        setSearch]        = useState("");
  const [filterType,    setFilterType]    = useState<"all" | "clocked_in_late" | "no_clockin">("all");
  const [filterAccount, setFilterAccount] = useState("all");
  const [filterDate,    setFilterDate]    = useState("all");
  const [sortField,     setSortField]     = useState<SortField>("minutesLate");
  const [sortDir,       setSortDir]       = useState<SortDir>("desc");

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir(field === "minutesLate" ? "desc" : "asc"); }
  }

  const offenderMap = useMemo(() => buildOffenderMap(data?.records ?? []), [data]);

  const accounts = useMemo(() => {
    if (!data) return [];
    const seen = new Map<string, string>();
    for (const r of data.records) {
      if (r.accountId && r.accountName) seen.set(r.accountId, r.accountName);
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const dates = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    for (const r of data.records) seen.add(shiftDateKey(r.startTime));
    return Array.from(seen).sort().reverse();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase().trim();
    let base = data.records.filter(r => {
      if (filterType    !== "all" && r.lateType   !== filterType)    return false;
      if (filterAccount !== "all" && r.accountId  !== filterAccount) return false;
      if (filterDate    !== "all" && shiftDateKey(r.startTime) !== filterDate) return false;
      if (q && !r.driverName.toLowerCase().includes(q) &&
               !(r.accountName ?? "").toLowerCase().includes(q)) return false;
      return true;
    });

    return [...base].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "driver":      cmp = a.driverName.localeCompare(b.driverName); break;
        case "account":     cmp = (a.accountName ?? "").localeCompare(b.accountName ?? ""); break;
        case "shiftDate":
        case "startTime":   cmp = a.startTime.localeCompare(b.startTime); break;
        case "clockIn":     cmp = (a.clockIn ?? "").localeCompare(b.clockIn ?? ""); break;
        case "minutesLate": cmp = a.minutesLate - b.minutesLate; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, search, filterType, filterAccount, filterDate, sortField, sortDir]);

  function ThCell({ field, label, className = "" }: { field: SortField; label: string; className?: string }) {
    return (
      <TableHead
        className={`cursor-pointer select-none whitespace-nowrap ${className}`}
        onClick={() => toggleSort(field)}
        data-testid={`th-late-sort-${field}`}
      >
        {label}
        <SortIcon field={field} current={sortField} dir={sortDir} />
      </TableHead>
    );
  }

  const total = data?.records.length ?? 0;

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full max-w-4xl flex flex-col gap-0 p-0">
        {/* Header */}
        <SheetHeader className="px-6 pt-5 pb-4 border-b">
          <div className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-orange-500 shrink-0" />
            <SheetTitle className="text-base">Late Drivers — Detail</SheetTitle>
          </div>
          <SheetDescription className="text-sm">
            <span className="font-medium text-orange-600 dark:text-orange-400">
              {data?.lateToday ?? 0}
            </span>{" "}
            late today (active, no clock-in) &nbsp;·&nbsp;{" "}
            <span className="font-medium text-destructive">
              {data?.lateCount7d ?? 0}
            </span>{" "}
            late clock-ins in the last 7 days.
            Click a row for Driver Detail or use the task icon for the Work Plan.
          </SheetDescription>
        </SheetHeader>

        {/* Filters */}
        <div className="px-6 py-3 border-b bg-muted/30 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Driver or account…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
              data-testid="input-late-search"
            />
          </div>

          <Select value={filterType} onValueChange={v => setFilterType(v as typeof filterType)}>
            <SelectTrigger className="h-8 text-sm w-[160px]" data-testid="select-late-type">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="no_clockin">In progress (no clock-in)</SelectItem>
              <SelectItem value="clocked_in_late">Clocked in late</SelectItem>
            </SelectContent>
          </Select>

          {accounts.length > 0 && (
            <Select value={filterAccount} onValueChange={setFilterAccount}>
              <SelectTrigger className="h-8 text-sm w-[160px]" data-testid="select-late-account">
                <SelectValue placeholder="Account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                {accounts.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {dates.length > 1 && (
            <Select value={filterDate} onValueChange={setFilterDate}>
              <SelectTrigger className="h-8 text-sm w-[140px]" data-testid="select-late-date">
                <SelectValue placeholder="Date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All dates</SelectItem>
                {dates.map(d => (
                  <SelectItem key={d} value={d}>
                    {new Date(d + "T12:00:00Z").toLocaleDateString("en-US", {
                      weekday: "short", month: "short", day: "numeric",
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
            {filtered.length} of {total}
          </span>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <ThCell field="driver"      label="Driver" />
                <ThCell field="account"     label="Account" />
                <ThCell field="shiftDate"   label="Shift Date" />
                <ThCell field="startTime"   label="Scheduled Start" />
                <ThCell field="clockIn"     label="Clock-In" />
                <ThCell field="minutesLate" label="Min Late" className="text-right" />
                <TableHead className="w-[100px] text-center text-xs text-muted-foreground">Work Plan</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-sm text-muted-foreground">
                    {search || filterType !== "all" || filterAccount !== "all" || filterDate !== "all"
                      ? "No records match your filters."
                      : "No late driver records found."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(record => {
                  const offenseCount = offenderMap.get(record.driverName) ?? 1;
                  const eventType = record.lateType === "no_clockin" ? "not_clocked_in" : "late_driver";
                  const task = record.driverId ? taskMap[record.driverId] : undefined;

                  return (
                    <TableRow
                      key={record.shiftId}
                      className="cursor-pointer hover-elevate"
                      onClick={() => {
                        if (record.driverId) {
                          onClose();
                          navigate(`/drivers/${record.driverId}`);
                        }
                      }}
                      data-testid={`row-late-driver-${record.shiftId}`}
                    >
                      <TableCell className="py-2.5">
                        <div className="flex items-start gap-1.5">
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-tight">{record.driverName}</p>
                            {record.driverEmail && (
                              <p className="text-xs text-muted-foreground">{record.driverEmail}</p>
                            )}
                          </div>
                          {offenseCount >= 3 && (
                            <Badge
                              variant="destructive"
                              className="text-[10px] px-1 py-0 shrink-0 mt-0.5"
                              title={`${offenseCount} late events this week`}
                            >
                              {offenseCount}x
                            </Badge>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="py-2.5">
                        {record.accountName
                          ? <span className="text-sm text-muted-foreground">{record.accountName}</span>
                          : <span className="text-sm text-muted-foreground/40 italic">—</span>}
                      </TableCell>

                      <TableCell className="py-2.5 whitespace-nowrap text-sm">
                        {fmtDate(record.startTime)}
                      </TableCell>

                      <TableCell className="py-2.5 whitespace-nowrap text-sm tabular-nums">
                        {fmtTime(record.startTime)}
                      </TableCell>

                      <TableCell className="py-2.5 whitespace-nowrap tabular-nums">
                        {record.clockIn
                          ? <span className="text-sm">{fmtTime(record.clockIn)}</span>
                          : <LateTypeBadge lateType={record.lateType} />}
                      </TableCell>

                      <TableCell className="py-2.5 text-right tabular-nums">
                        <span className={`text-sm ${lateSeverityClass(record.minutesLate)}`}>
                          {fmtMinutes(record.minutesLate)}
                        </span>
                      </TableCell>

                      {/* Work Plan Task column */}
                      <TableCell className="py-2.5 text-center" onClick={e => e.stopPropagation()}>
                        {task ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs hover-elevate px-1.5 py-0.5 rounded"
                            title={`Work Plan (${eventType}): ${taskStatusLabel(task.status)}`}
                            onClick={() => {
                              onClose();
                              navigate(workPlanTaskUrl(task.taskId));
                            }}
                            data-testid={`btn-late-task-${record.shiftId}`}
                          >
                            <Badge variant={taskStatusVariant(task.status)} className="text-[10px] px-1.5 py-0">
                              {taskStatusLabel(task.status)}
                            </Badge>
                            <ClipboardList className="h-3 w-3 text-muted-foreground" />
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </TableCell>

                      <TableCell className="py-2.5 text-right">
                        {record.driverId
                          ? <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50" />
                          : null}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t bg-muted/20 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Red badge = 3+ late events this week · Sorted most late first by default
          </p>
          <Button variant="outline" size="sm" onClick={onClose} data-testid="btn-late-close">
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  count,
  icon: Icon,
  colorClass,
  urgent,
  onClick,
  testId,
}: {
  label: string;
  count: number;
  icon: React.ElementType;
  colorClass: string;
  urgent?: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      className="flex-1 min-w-0 flex flex-col items-start gap-1 p-3 rounded-md border hover-elevate cursor-pointer text-left"
      onClick={onClick}
      data-testid={testId}
    >
      <div className="flex items-center gap-1.5 w-full">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${colorClass}`} />
        <span className="text-xs text-muted-foreground leading-tight">{label}</span>
      </div>
      <span className={`text-2xl font-bold tabular-nums ${count > 0 ? colorClass : "text-muted-foreground"}`}>
        {count}
      </span>
      {urgent && count > 0 && (
        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
          Action Required
        </Badge>
      )}
    </button>
  );
}

// ─── Top Offenders Preview ────────────────────────────────────────────────────

function TopOffendersPreview({
  records,
  onOpen,
}: {
  records: LateDriverRecord[];
  onOpen: () => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; driverId: string | null; totalMin: number; count: number; accountName: string | null }>();
    for (const r of records) {
      const key = r.driverName;
      const existing = map.get(key);
      if (existing) {
        existing.totalMin += r.minutesLate;
        existing.count    += 1;
      } else {
        map.set(key, {
          name: r.driverName,
          driverId: r.driverId,
          totalMin: r.minutesLate,
          count: 1,
          accountName: r.accountName,
        });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.totalMin - a.totalMin || b.count - a.count)
      .slice(0, 6);
  }, [records]);

  if (grouped.length === 0) return null;

  return (
    <div className="space-y-0.5" data-testid="widget-late-preview-list">
      {grouped.map(driver => (
        <button
          key={driver.name}
          type="button"
          className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover-elevate cursor-pointer text-left"
          onClick={onOpen}
          data-testid={`widget-late-preview-driver-${driver.driverId ?? driver.name}`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium truncate">{driver.name}</p>
              {driver.count >= 2 && (
                <Badge variant={driver.count >= 3 ? "destructive" : "secondary"} className="text-[10px] px-1 py-0 shrink-0">
                  {driver.count}x
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">{driver.accountName ?? "—"}</p>
          </div>
          <span className={`text-sm tabular-nums font-medium shrink-0 ${lateSeverityClass(driver.totalMin)}`}>
            {fmtMinutes(driver.totalMin)}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Main Widget ──────────────────────────────────────────────────────────────

export function LateDriversWidget() {
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, isLoading } = useQuery<LateDriversResponse>({
    queryKey: ["/api/compliance/late-drivers"],
    staleTime: 2 * 60 * 1000,
    refetchInterval: 30_000,
  });

  // Build task-ensure items — one per driver per late type (deduped by driverId+eventType)
  const taskItems: EnsureItem[] = useMemo(() => {
    if (!data?.records) return [];
    const seen = new Map<string, EnsureItem>();
    for (const r of data.records) {
      if (!r.driverId) continue;
      const eventType = r.lateType === "no_clockin" ? "not_clocked_in" : "late_driver";
      const key = `${eventType}|${r.driverId}`;
      if (!seen.has(key)) {
        seen.set(key, {
          eventType,
          recordId: r.driverId,
          recordName: r.driverName,
          reason: r.lateType === "no_clockin"
            ? `Scheduled shift in progress, no clock-in${r.accountName ? ` — ${r.accountName}` : ""}`
            : `Clocked in ${r.minutesLate}m late${r.accountName ? ` — ${r.accountName}` : ""}`,
          priority: r.minutesLate >= 30 ? "high" : "medium",
          recordUrl: `/drivers/${r.driverId}`,
          taskType: "Attendance",
          sourceModule: "compliance",
          category: "driver_ops",
        });
      }
    }
    return Array.from(seen.values());
  }, [data]);

  const { taskMap } = useWorkPlanTaskMap(taskItems);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <Skeleton className="h-20 flex-1" />
          <Skeleton className="h-20 flex-1" />
        </div>
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
    );
  }

  const lateToday   = data?.lateToday   ?? 0;
  const lateCount7d = data?.lateCount7d ?? 0;
  const records     = data?.records     ?? [];

  return (
    <div className="space-y-3" data-testid="widget-late-drivers">
      {/* KPI Cards */}
      <div className="flex gap-2">
        <KpiCard
          label="Late Today (Active)"
          count={lateToday}
          icon={Clock}
          colorClass="text-orange-600 dark:text-orange-400"
          onClick={() => setSheetOpen(true)}
          testId="kpi-late-today"
        />
        <KpiCard
          label="Late Clock-Ins — 7 Days"
          count={lateCount7d}
          icon={Timer}
          colorClass="text-destructive"
          urgent={lateCount7d >= 10}
          onClick={() => setSheetOpen(true)}
          testId="kpi-late-7d"
        />
      </div>

      {/* Content */}
      {records.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-4 text-center">
          <AlertTriangle className="h-6 w-6 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No lateness data available</p>
        </div>
      ) : (
        <>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
            Most Late (7 Days)
          </p>

          <TopOffendersPreview records={records} onOpen={() => setSheetOpen(true)} />

          {records.length > 6 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setSheetOpen(true)}
              data-testid="btn-late-view-all"
            >
              View all {lateToday + lateCount7d} late events
            </Button>
          )}
        </>
      )}

      {/* Drill-down Sheet */}
      <LateDriversSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        data={data}
        taskMap={taskMap}
      />
    </div>
  );
}
