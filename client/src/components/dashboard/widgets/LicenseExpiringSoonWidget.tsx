/**
 * License Expiring Soon Widget
 *
 * Shows drivers whose driver's license expires within the next 30 days
 * (today inclusive through today + 30 days).
 * Already-expired drivers are excluded — they appear in the Expired Licenses widget.
 * Sorted soonest-to-expire first.
 *
 * Auto-generates Driver Ops work plan tasks for each listed driver.
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IdCard, CalendarClock, ChevronUp, ChevronDown, ChevronsUpDown,
  Search, ExternalLink, CheckCircle, ShieldAlert, ClipboardList,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import {
  useWorkPlanTaskMap, workPlanTaskUrl, taskStatusLabel, taskStatusVariant,
  type EnsureItem, type TaskMap,
} from "@/hooks/useWorkPlanTaskMap";

// ─── Types ──────────────────────────────────────────────────────────────────

interface LicenseExpiringSoonDriver {
  driverId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  status: string;
  licenseExpirationDate: string;
  daysRemaining: number;
  primaryAccountId: string | null;
  primaryAccountName: string | null;
  driverNumber: string | null;
}

interface LicenseExpiringSoonResponse {
  total: number;
  windowDays: number;
  drivers: LicenseExpiringSoonDriver[];
}

type SortField = "name" | "status" | "licenseExpirationDate" | "daysRemaining" | "account";
type SortDir   = "asc" | "desc";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function driverName(d: LicenseExpiringSoonDriver): string {
  const f = d.firstName ?? "";
  const l = d.lastName  ?? "";
  return f || l ? `${f} ${l}`.trim() : d.email ?? "Unknown";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch {
    return iso;
  }
}

function daysLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days} days`;
}

function urgencyTier(days: number): "critical" | "high" | "moderate" | "low" {
  if (days <= 3)  return "critical";
  if (days <= 7)  return "high";
  if (days <= 14) return "moderate";
  return "low";
}

function urgencyBadgeVariant(days: number): "destructive" | "secondary" | "outline" {
  const t = urgencyTier(days);
  if (t === "critical" || t === "high") return "destructive";
  if (t === "moderate") return "secondary";
  return "outline";
}

function urgencyRowClass(days: number): string {
  const t = urgencyTier(days);
  if (t === "critical") return "text-destructive font-bold";
  if (t === "high")     return "text-destructive";
  if (t === "moderate") return "text-orange-600 dark:text-orange-400 font-medium";
  return "text-muted-foreground";
}

function taskPriority(days: number): "high" | "medium" | "low" {
  if (days <= 7)  return "high";
  if (days <= 14) return "medium";
  return "low";
}

// ─── Sort icon ───────────────────────────────────────────────────────────────

function SortIcon({ field, current, dir }: { field: SortField; current: SortField; dir: SortDir }) {
  if (field !== current) return <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50 inline ml-1" />;
  return dir === "asc"
    ? <ChevronUp   className="h-3 w-3 text-foreground inline ml-1" />
    : <ChevronDown className="h-3 w-3 text-foreground inline ml-1" />;
}

// ─── Preview Row ─────────────────────────────────────────────────────────────

function PreviewRow({ driver, onClick }: { driver: LicenseExpiringSoonDriver; onClick: () => void }) {
  return (
    <button
      type="button"
      className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover-elevate cursor-pointer text-left"
      onClick={onClick}
      data-testid={`widget-license-soon-preview-${driver.driverId}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{driverName(driver)}</p>
        <p className="text-xs text-muted-foreground truncate">
          {driver.primaryAccountName ?? "—"}
        </p>
      </div>
      <div className="shrink-0 text-right space-y-0.5">
        <Badge variant={urgencyBadgeVariant(driver.daysRemaining)} className="text-xs tabular-nums block">
          {daysLabel(driver.daysRemaining)}
        </Badge>
        <p className="text-[10px] text-muted-foreground">{fmtDate(driver.licenseExpirationDate)}</p>
      </div>
    </button>
  );
}

// ─── Urgency breakdown bar ────────────────────────────────────────────────────

function UrgencyBar({ drivers }: { drivers: LicenseExpiringSoonDriver[] }) {
  const critical = drivers.filter(d => d.daysRemaining <= 3).length;
  const high     = drivers.filter(d => d.daysRemaining > 3  && d.daysRemaining <= 7).length;
  const moderate = drivers.filter(d => d.daysRemaining > 7  && d.daysRemaining <= 14).length;
  const low      = drivers.filter(d => d.daysRemaining > 14).length;

  const items = [
    { label: "0–3 days",   count: critical, className: "text-destructive font-semibold" },
    { label: "4–7 days",   count: high,     className: "text-destructive" },
    { label: "8–14 days",  count: moderate, className: "text-orange-600 dark:text-orange-400" },
    { label: "15–30 days", count: low,      className: "text-muted-foreground" },
  ].filter(i => i.count > 0);

  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 py-1 border-t mt-1" data-testid="license-urgency-bar">
      {items.map(item => (
        <div key={item.label} className="flex items-center justify-between gap-1">
          <span className="text-xs text-muted-foreground">{item.label}</span>
          <span className={`text-xs tabular-nums ${item.className}`}>{item.count}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Drill-down Sheet ────────────────────────────────────────────────────────

function LicenseExpiringSoonSheet({
  open,
  onClose,
  data,
  taskMap,
}: {
  open: boolean;
  onClose: () => void;
  data: LicenseExpiringSoonResponse | undefined;
  taskMap: TaskMap;
}) {
  const [, navigate]      = useLocation();
  const [search, setSearch]       = useState("");
  const [sortField, setSortField] = useState<SortField>("daysRemaining");
  const [sortDir,   setSortDir]   = useState<SortDir>("asc");

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const filtered = useMemo(() => {
    if (!data?.drivers) return [];
    const q = search.toLowerCase().trim();
    const base = q
      ? data.drivers.filter(d =>
          driverName(d).toLowerCase().includes(q) ||
          (d.primaryAccountName ?? "").toLowerCase().includes(q) ||
          (d.driverNumber ?? "").toLowerCase().includes(q) ||
          (d.status ?? "").toLowerCase().includes(q)
        )
      : data.drivers;

    return [...base].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":                  cmp = driverName(a).localeCompare(driverName(b)); break;
        case "status":                cmp = (a.status ?? "").localeCompare(b.status ?? ""); break;
        case "licenseExpirationDate": cmp = (a.licenseExpirationDate ?? "").localeCompare(b.licenseExpirationDate ?? ""); break;
        case "daysRemaining":         cmp = a.daysRemaining - b.daysRemaining; break;
        case "account":               cmp = (a.primaryAccountName ?? "").localeCompare(b.primaryAccountName ?? ""); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, search, sortField, sortDir]);

  function ThCell({ field, label }: { field: SortField; label: string }) {
    return (
      <TableHead
        className="cursor-pointer select-none whitespace-nowrap"
        onClick={() => toggleSort(field)}
        data-testid={`th-license-soon-sort-${field}`}
      >
        {label}
        <SortIcon field={field} current={sortField} dir={sortDir} />
      </TableHead>
    );
  }

  const windowDays = data?.windowDays ?? 30;

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full max-w-4xl flex flex-col gap-0 p-0">
        {/* Header */}
        <SheetHeader className="px-6 pt-5 pb-4 border-b">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-orange-500 shrink-0" />
            <SheetTitle className="text-base">License Expiring in {windowDays} Days</SheetTitle>
          </div>
          <SheetDescription className="text-sm">
            {data?.total ?? 0} driver{(data?.total ?? 0) !== 1 ? "s" : ""} with license expiring by{" "}
            {new Date(Date.now() + windowDays * 86400000).toLocaleDateString("en-US", {
              month: "short", day: "numeric", year: "numeric",
            })}.{" "}
            Already-expired drivers are excluded. Click a row to open Driver Detail.
          </SheetDescription>
        </SheetHeader>

        {/* Search */}
        <div className="px-6 py-3 border-b bg-muted/30">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by name, account, or status…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
              data-testid="input-license-soon-search"
            />
          </div>
          {search && filtered.length !== (data?.total ?? 0) && (
            <p className="text-xs text-muted-foreground mt-1.5">
              Showing {filtered.length} of {data?.total ?? 0} results
            </p>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-0">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <ThCell field="name"                  label="Driver" />
                <ThCell field="status"                label="Status" />
                <ThCell field="licenseExpirationDate" label="License Expiration Date" />
                <ThCell field="daysRemaining"         label="Days Remaining" />
                <ThCell field="account"               label="Primary Account" />
                <TableHead className="w-[100px] text-center text-xs text-muted-foreground">Work Plan</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-sm text-muted-foreground">
                    {search ? "No drivers match your search." : "No licenses expiring within 30 days."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(driver => {
                  const task = taskMap[driver.driverId];
                  return (
                    <TableRow
                      key={driver.driverId}
                      className="cursor-pointer hover-elevate"
                      onClick={() => {
                        onClose();
                        navigate(`/drivers/${driver.driverId}`);
                      }}
                      data-testid={`row-license-soon-driver-${driver.driverId}`}
                    >
                      <TableCell className="py-2.5">
                        <div>
                          <p className="text-sm font-medium leading-tight">{driverName(driver)}</p>
                          {driver.driverNumber && (
                            <p className="text-xs text-muted-foreground">#{driver.driverNumber}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <StatusBadge status={driver.status} />
                      </TableCell>
                      <TableCell className="py-2.5 whitespace-nowrap text-sm">
                        {fmtDate(driver.licenseExpirationDate)}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span className={`text-sm tabular-nums whitespace-nowrap ${urgencyRowClass(driver.daysRemaining)}`}>
                          {daysLabel(driver.daysRemaining)}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5">
                        {driver.primaryAccountName ? (
                          <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
                            {driver.primaryAccountName}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground/50 italic">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 text-center" onClick={e => e.stopPropagation()}>
                        {task ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs hover-elevate px-1.5 py-0.5 rounded"
                            title={`Work Plan: ${taskStatusLabel(task.status)}`}
                            onClick={() => {
                              onClose();
                              navigate(workPlanTaskUrl(task.taskId));
                            }}
                            data-testid={`btn-license-soon-task-${driver.driverId}`}
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
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50" />
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
            Soonest to expire first · click any column header to re-sort
          </p>
          <Button variant="outline" size="sm" onClick={onClose} data-testid="btn-license-soon-close">
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Widget ─────────────────────────────────────────────────────────────

export function LicenseExpiringSoonWidget() {
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, isLoading } = useQuery<LicenseExpiringSoonResponse>({
    queryKey: ["/api/compliance/license-expiring-soon"],
    staleTime: 5 * 60 * 1000,
    refetchInterval: 30_000,
  });

  // Build task-ensure items — priority scales with urgency
  const taskItems: EnsureItem[] = useMemo(() => {
    if (!data?.drivers) return [];
    return data.drivers.map(d => ({
      eventType: "license_expiring_soon",
      recordId: d.driverId,
      recordName: driverName(d),
      reason: `Driver's license expiring in ${d.daysRemaining}d${d.primaryAccountName ? ` — ${d.primaryAccountName}` : ""} — schedule renewal before expiration`,
      priority: taskPriority(d.daysRemaining),
      recordUrl: `/drivers/${d.driverId}`,
      taskType: "License",
      sourceModule: "compliance",
      category: "driver_ops",
    }));
  }, [data]);

  const { taskMap } = useWorkPlanTaskMap(taskItems);

  const preview = data?.drivers.slice(0, 8) ?? [];
  const total   = data?.total ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-20" />
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  const hasUrgent = data?.drivers.some(d => d.daysRemaining <= 7) ?? false;

  return (
    <div className="space-y-3" data-testid="widget-license-expiring-soon">
      {/* Count + badge */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span
            className={`text-3xl font-bold tabular-nums ${
              total === 0    ? "text-muted-foreground"
              : hasUrgent   ? "text-destructive"
              : "text-orange-600 dark:text-orange-400"
            }`}
            data-testid="text-license-soon-count"
          >
            {total}
          </span>
          {total > 0 && (
            <span className="text-xs text-muted-foreground leading-tight">
              driver{total !== 1 ? "s" : ""}<br />expiring soon
            </span>
          )}
        </div>
        {total === 0 ? (
          <Badge variant="secondary" className="text-xs gap-1">
            <CheckCircle className="h-3 w-3" />
            All Clear
          </Badge>
        ) : hasUrgent ? (
          <Badge variant="destructive" className="text-xs gap-1">
            <ShieldAlert className="h-3 w-3" />
            Urgent
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-xs gap-1">
            <CalendarClock className="h-3 w-3" />
            Act Soon
          </Badge>
        )}
      </div>

      {/* Empty / filled state */}
      {total === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-4 text-center">
          <IdCard className="h-6 w-6 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No licenses expiring within 30 days</p>
        </div>
      ) : (
        <>
          <UrgencyBar drivers={data!.drivers} />
          <div className="space-y-0.5" data-testid="widget-license-soon-preview-list">
            {preview.map(driver => (
              <PreviewRow
                key={driver.driverId}
                driver={driver}
                onClick={() => setSheetOpen(true)}
              />
            ))}
          </div>
          {total > preview.length && (
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-1"
              onClick={() => setSheetOpen(true)}
              data-testid="btn-license-soon-view-all"
            >
              View all {total} expiring license records
            </Button>
          )}
        </>
      )}

      <LicenseExpiringSoonSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        data={data}
        taskMap={taskMap}
      />
    </div>
  );
}
