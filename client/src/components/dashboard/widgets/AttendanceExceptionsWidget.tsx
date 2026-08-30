/**
 * Attendance Exceptions Widget
 *
 * Two live compliance metrics from WIW shift data:
 *   1. Scheduled Today — Not Clocked In (shifts in progress, no clock-in)
 *   2. No Shows — Last 7 Days (shifts fully ended, never clocked in)
 *
 * Includes a drill-down sheet with account/date/status filters, sortable columns,
 * and click-through navigation to Driver Detail or Work Plan task.
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
  UserX, Clock, AlertTriangle, ChevronUp, ChevronDown,
  ChevronsUpDown, Search, ExternalLink, ClipboardList,
} from "lucide-react";
import {
  useWorkPlanTaskMap, workPlanTaskUrl, taskStatusLabel, taskStatusVariant,
  type EnsureItem, type TaskMap,
} from "@/hooks/useWorkPlanTaskMap";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AttendanceException {
  driverId: string | null;
  driverName: string;
  driverEmail: string | null;
  shiftId: string;
  startTime: string;
  endTime: string;
  accountId: string | null;
  accountName: string | null;
  exceptionStatus: "late" | "no_show";
  minutesLate: number | null;
}

interface AttendanceExceptionsResponse {
  scheduledToday: number;
  noShows7d: number;
  exceptions: AttendanceException[];
}

type SortField = "driver" | "account" | "shiftDate" | "startTime" | "endTime" | "status" | "minutesLate";
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

// ─── Sort Icon ────────────────────────────────────────────────────────────────

function SortIcon({ field, current, dir }: { field: SortField; current: SortField; dir: SortDir }) {
  if (field !== current) return <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50 inline ml-1" />;
  return dir === "asc"
    ? <ChevronUp   className="h-3 w-3 text-foreground inline ml-1" />
    : <ChevronDown className="h-3 w-3 text-foreground inline ml-1" />;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ ex }: { ex: AttendanceException }) {
  if (ex.exceptionStatus === "late") {
    return (
      <Badge variant="secondary" className="text-xs gap-1 text-orange-600 dark:text-orange-400">
        <Clock className="h-2.5 w-2.5" />
        Late
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="text-xs gap-1">
      <UserX className="h-2.5 w-2.5" />
      No Show
    </Badge>
  );
}

// ─── Drill-down Sheet ─────────────────────────────────────────────────────────

function AttendanceExceptionsSheet({
  open,
  onClose,
  data,
  taskMap,
}: {
  open: boolean;
  onClose: () => void;
  data: AttendanceExceptionsResponse | undefined;
  taskMap: TaskMap;
}) {
  const [, navigate] = useLocation();

  const [search,        setSearch]        = useState("");
  const [filterStatus,  setFilterStatus]  = useState<"all" | "late" | "no_show">("all");
  const [filterAccount, setFilterAccount] = useState("all");
  const [filterDate,    setFilterDate]    = useState("all");
  const [sortField,     setSortField]     = useState<SortField>("shiftDate");
  const [sortDir,       setSortDir]       = useState<SortDir>("desc");

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const accounts = useMemo(() => {
    if (!data) return [];
    const seen = new Map<string, string>();
    for (const ex of data.exceptions) {
      if (ex.accountId && ex.accountName) seen.set(ex.accountId, ex.accountName);
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const dates = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    for (const ex of data.exceptions) seen.add(shiftDateKey(ex.startTime));
    return Array.from(seen).sort().reverse();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase().trim();
    let base = data.exceptions.filter(ex => {
      if (filterStatus !== "all" && ex.exceptionStatus !== filterStatus) return false;
      if (filterAccount !== "all" && ex.accountId !== filterAccount) return false;
      if (filterDate !== "all" && shiftDateKey(ex.startTime) !== filterDate) return false;
      if (q && !ex.driverName.toLowerCase().includes(q) &&
               !(ex.accountName ?? "").toLowerCase().includes(q)) return false;
      return true;
    });

    base = [...base].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "driver":      cmp = a.driverName.localeCompare(b.driverName); break;
        case "account":     cmp = (a.accountName ?? "").localeCompare(b.accountName ?? ""); break;
        case "shiftDate":
        case "startTime":   cmp = a.startTime.localeCompare(b.startTime); break;
        case "endTime":     cmp = a.endTime.localeCompare(b.endTime); break;
        case "status":      cmp = a.exceptionStatus.localeCompare(b.exceptionStatus); break;
        case "minutesLate": cmp = (a.minutesLate ?? 0) - (b.minutesLate ?? 0); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return base;
  }, [data, search, filterStatus, filterAccount, filterDate, sortField, sortDir]);

  function ThCell({ field, label, className = "" }: { field: SortField; label: string; className?: string }) {
    return (
      <TableHead
        className={`cursor-pointer select-none whitespace-nowrap ${className}`}
        onClick={() => toggleSort(field)}
        data-testid={`th-attendance-sort-${field}`}
      >
        {label}
        <SortIcon field={field} current={sortField} dir={sortDir} />
      </TableHead>
    );
  }

  const total = data?.exceptions.length ?? 0;

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full max-w-4xl flex flex-col gap-0 p-0">
        {/* Header */}
        <SheetHeader className="px-6 pt-5 pb-4 border-b">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <SheetTitle className="text-base">Attendance Exceptions</SheetTitle>
          </div>
          <SheetDescription className="text-sm">
            <span className="font-medium text-orange-600 dark:text-orange-400">
              {data?.scheduledToday ?? 0}
            </span>{" "}
            scheduled today without clock-in &nbsp;·&nbsp;{" "}
            <span className="font-medium text-destructive">
              {data?.noShows7d ?? 0}
            </span>{" "}
            no-shows in the last 7 days.
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
              data-testid="input-attendance-search"
            />
          </div>

          <Select value={filterStatus} onValueChange={v => setFilterStatus(v as "all" | "late" | "no_show")}>
            <SelectTrigger className="h-8 text-sm w-[130px]" data-testid="select-attendance-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="late">Late only</SelectItem>
              <SelectItem value="no_show">No Show only</SelectItem>
            </SelectContent>
          </Select>

          {accounts.length > 0 && (
            <Select value={filterAccount} onValueChange={setFilterAccount}>
              <SelectTrigger className="h-8 text-sm w-[160px]" data-testid="select-attendance-account">
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
              <SelectTrigger className="h-8 text-sm w-[140px]" data-testid="select-attendance-date">
                <SelectValue placeholder="Date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All dates</SelectItem>
                {dates.map(d => (
                  <SelectItem key={d} value={d}>
                    {new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
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
                <ThCell field="startTime"   label="Start" />
                <ThCell field="endTime"     label="End" />
                <ThCell field="status"      label="Status" />
                <ThCell field="minutesLate" label="Min Late" className="text-right" />
                <TableHead className="w-[100px] text-center text-xs text-muted-foreground">Work Plan</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-sm text-muted-foreground">
                    {search || filterStatus !== "all" || filterAccount !== "all" || filterDate !== "all"
                      ? "No exceptions match your filters."
                      : "No attendance exceptions found."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(ex => {
                  // Map exception status to work plan event type for task lookup
                  const eventType = ex.exceptionStatus === "no_show" ? "no_show" : "not_clocked_in";
                  const task = ex.driverId ? taskMap[ex.driverId] : undefined;

                  return (
                    <TableRow
                      key={ex.shiftId}
                      className="cursor-pointer hover-elevate"
                      onClick={() => {
                        if (ex.driverId) {
                          onClose();
                          navigate(`/drivers/${ex.driverId}`);
                        }
                      }}
                      data-testid={`row-attendance-exception-${ex.shiftId}`}
                    >
                      <TableCell className="py-2.5">
                        <p className="text-sm font-medium leading-tight">{ex.driverName}</p>
                        {ex.driverEmail && (
                          <p className="text-xs text-muted-foreground">{ex.driverEmail}</p>
                        )}
                      </TableCell>

                      <TableCell className="py-2.5">
                        {ex.accountName
                          ? <span className="text-sm text-muted-foreground">{ex.accountName}</span>
                          : <span className="text-sm text-muted-foreground/40 italic">—</span>}
                      </TableCell>

                      <TableCell className="py-2.5 whitespace-nowrap text-sm">
                        {fmtDate(ex.startTime)}
                      </TableCell>

                      <TableCell className="py-2.5 whitespace-nowrap text-sm tabular-nums">
                        {fmtTime(ex.startTime)}
                      </TableCell>

                      <TableCell className="py-2.5 whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                        {fmtTime(ex.endTime)}
                      </TableCell>

                      <TableCell className="py-2.5">
                        <StatusBadge ex={ex} />
                      </TableCell>

                      <TableCell className="py-2.5 text-right tabular-nums">
                        {ex.minutesLate !== null && ex.minutesLate !== undefined
                          ? <span className={`text-sm font-medium ${
                              ex.minutesLate >= 30 ? "text-destructive"
                              : ex.minutesLate >= 10 ? "text-orange-600 dark:text-orange-400"
                              : "text-muted-foreground"
                            }`}>{ex.minutesLate}m</span>
                          : <span className="text-sm text-muted-foreground/40">—</span>}
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
                            data-testid={`btn-attendance-task-${ex.shiftId}`}
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
                        {ex.driverId
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
            Showing last 7 days · Click any column header to re-sort
          </p>
          <Button variant="outline" size="sm" onClick={onClose} data-testid="btn-attendance-close">
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
        <span className="text-xs text-muted-foreground leading-tight line-clamp-2">{label}</span>
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

// ─── Preview List ─────────────────────────────────────────────────────────────

function PreviewList({
  exceptions,
  onOpenSheet,
}: {
  exceptions: AttendanceException[];
  onOpenSheet: () => void;
}) {
  if (exceptions.length === 0) return null;
  const preview = exceptions.slice(0, 6);

  return (
    <div className="space-y-0.5 pt-1" data-testid="widget-attendance-preview-list">
      {preview.map(ex => (
        <div
          key={ex.shiftId}
          className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover-elevate cursor-pointer"
          onClick={onOpenSheet}
          data-testid={`widget-attendance-preview-${ex.shiftId}`}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{ex.driverName}</p>
            <p className="text-xs text-muted-foreground truncate">
              {ex.accountName ?? "—"} · {fmtTime(ex.startTime)}
            </p>
          </div>
          <div className="shrink-0">
            <StatusBadge ex={ex} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Widget ──────────────────────────────────────────────────────────────

export function AttendanceExceptionsWidget() {
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, isLoading } = useQuery<AttendanceExceptionsResponse>({
    queryKey: ["/api/compliance/attendance-exceptions"],
    staleTime: 2 * 60 * 1000,
    refetchInterval: 30_000,
  });

  // Build task-ensure items — one per driver per exception type (deduped by driverId)
  const taskItems: EnsureItem[] = useMemo(() => {
    if (!data?.exceptions) return [];
    const seen = new Map<string, EnsureItem>();
    for (const ex of data.exceptions) {
      if (!ex.driverId) continue;
      const eventType = ex.exceptionStatus === "no_show" ? "no_show" : "not_clocked_in";
      const key = `${eventType}|${ex.driverId}`;
      if (!seen.has(key)) {
        seen.set(key, {
          eventType,
          recordId: ex.driverId,
          recordName: ex.driverName,
          reason: ex.exceptionStatus === "no_show"
            ? `No-show recorded${ex.accountName ? ` — ${ex.accountName}` : ""} — review and follow up`
            : `Scheduled shift in progress, no clock-in${ex.accountName ? ` — ${ex.accountName}` : ""}`,
          priority: ex.exceptionStatus === "no_show" ? "high" : "medium",
          recordUrl: `/drivers/${ex.driverId}`,
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
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  const scheduledToday  = data?.scheduledToday ?? 0;
  const noShows7d       = data?.noShows7d ?? 0;
  const totalExceptions = scheduledToday + noShows7d;
  const preview         = data?.exceptions ?? [];

  return (
    <div className="space-y-3" data-testid="widget-attendance-exceptions">
      {/* KPI Cards */}
      <div className="flex gap-2">
        <KpiCard
          label="Scheduled Today — Not Clocked In"
          count={scheduledToday}
          icon={Clock}
          colorClass="text-orange-600 dark:text-orange-400"
          onClick={() => setSheetOpen(true)}
          testId="kpi-attendance-today"
        />
        <KpiCard
          label="No Shows — Last 7 Days"
          count={noShows7d}
          icon={UserX}
          colorClass="text-destructive"
          urgent={noShows7d > 0}
          onClick={() => setSheetOpen(true)}
          testId="kpi-attendance-noshows"
        />
      </div>

      {/* Empty state */}
      {totalExceptions === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-4 text-center">
          <AlertTriangle className="h-6 w-6 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No attendance exceptions found</p>
        </div>
      ) : (
        <>
          <PreviewList exceptions={preview} onOpenSheet={() => setSheetOpen(true)} />
          {preview.length > 6 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setSheetOpen(true)}
              data-testid="btn-attendance-view-all"
            >
              View all {totalExceptions} exceptions
            </Button>
          )}
        </>
      )}

      {/* Drill-down Sheet */}
      <AttendanceExceptionsSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        data={data}
        taskMap={taskMap}
      />
    </div>
  );
}
