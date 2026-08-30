/**
 * Expired License Widget
 *
 * Compliance dashboard widget that shows all drivers whose driver's license
 * expiration date is before today. Null dates are excluded.
 *
 * Business rule: license_expiration_date < CURRENT_DATE
 * Sorted most overdue first (largest days_expired).
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
  IdCard, AlertTriangle, ChevronUp, ChevronDown, ChevronsUpDown,
  Search, ExternalLink, ClipboardList,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import {
  useWorkPlanTaskMap, workPlanTaskUrl, taskStatusLabel, taskStatusVariant,
  type EnsureItem, type TaskMap,
} from "@/hooks/useWorkPlanTaskMap";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ExpiredLicenseDriver {
  driverId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  status: string;
  licenseExpirationDate: string;
  daysExpired: number;
  primaryAccountId: string | null;
  primaryAccountName: string | null;
  driverNumber: string | null;
}

interface ExpiredLicenseResponse {
  total: number;
  drivers: ExpiredLicenseDriver[];
}

type SortField = "name" | "status" | "licenseExpirationDate" | "daysExpired" | "account";
type SortDir   = "asc" | "desc";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function driverName(d: ExpiredLicenseDriver): string {
  const f = d.firstName ?? "";
  const l = d.lastName  ?? "";
  return f || l ? `${f} ${l}`.trim() : d.email ?? "Unknown";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch {
    return iso;
  }
}

function daysExpiredLabel(days: number): string {
  if (days === 1) return "1 day";
  if (days < 30)  return `${days} days`;
  const months = Math.floor(days / 30);
  const rem    = days % 30;
  if (rem === 0)  return months === 1 ? "1 month" : `${months} months`;
  return months === 1 ? `1 month, ${rem}d` : `${months} months, ${rem}d`;
}

function urgencyBadgeVariant(days: number): "destructive" | "secondary" | "outline" {
  if (days >= 90) return "destructive";
  if (days >= 30) return "secondary";
  return "outline";
}

function urgencyRowClass(days: number): string {
  if (days >= 90) return "text-destructive font-semibold";
  if (days >= 30) return "text-destructive";
  return "text-orange-600 dark:text-orange-400";
}

// ─── Sort icon ───────────────────────────────────────────────────────────────

function SortIcon({ field, current, dir }: { field: SortField; current: SortField; dir: SortDir }) {
  if (field !== current) return <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50 inline ml-1" />;
  return dir === "asc"
    ? <ChevronUp   className="h-3 w-3 text-foreground inline ml-1" />
    : <ChevronDown className="h-3 w-3 text-foreground inline ml-1" />;
}

// ─── Preview Row ─────────────────────────────────────────────────────────────

function PreviewRow({ driver, onClick }: { driver: ExpiredLicenseDriver; onClick: () => void }) {
  return (
    <button
      type="button"
      className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover-elevate cursor-pointer text-left"
      onClick={onClick}
      data-testid={`widget-license-preview-${driver.driverId}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{driverName(driver)}</p>
        <p className="text-xs text-muted-foreground truncate">
          {driver.primaryAccountName ?? "—"}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <Badge variant={urgencyBadgeVariant(driver.daysExpired)} className="text-xs tabular-nums">
          {daysExpiredLabel(driver.daysExpired)}
        </Badge>
      </div>
    </button>
  );
}

// ─── Drill-down Sheet ────────────────────────────────────────────────────────

function ExpiredLicenseSheet({
  open,
  onClose,
  data,
  taskMap,
}: {
  open: boolean;
  onClose: () => void;
  data: ExpiredLicenseResponse | undefined;
  taskMap: TaskMap;
}) {
  const [, navigate]      = useLocation();
  const [search, setSearch]       = useState("");
  const [sortField, setSortField] = useState<SortField>("daysExpired");
  const [sortDir,   setSortDir]   = useState<SortDir>("desc");

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "daysExpired" ? "desc" : "asc");
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
        case "daysExpired":           cmp = a.daysExpired - b.daysExpired; break;
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
        data-testid={`th-license-sort-${field}`}
      >
        {label}
        <SortIcon field={field} current={sortField} dir={sortDir} />
      </TableHead>
    );
  }

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full max-w-4xl flex flex-col gap-0 p-0">
        {/* Header */}
        <SheetHeader className="px-6 pt-5 pb-4 border-b">
          <div className="flex items-center gap-2">
            <IdCard className="h-5 w-5 text-destructive shrink-0" />
            <SheetTitle className="text-base">Expired Driver's Licenses — All Drivers</SheetTitle>
          </div>
          <SheetDescription className="text-sm">
            {data?.total ?? 0} driver{(data?.total ?? 0) !== 1 ? "s" : ""} with a driver's license expiration date before today.
            Drivers expiring today or later are not shown. Click a row to open Driver Detail.
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
              data-testid="input-license-search"
            />
          </div>
          {filtered.length !== (data?.total ?? 0) && (
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
                <ThCell field="daysExpired"           label="Days Expired" />
                <ThCell field="account"               label="Primary Account" />
                <TableHead className="w-[100px] text-center text-xs text-muted-foreground">Work Plan</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-sm text-muted-foreground">
                    {search ? "No drivers match your search." : "No expired license records found."}
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
                      data-testid={`row-license-driver-${driver.driverId}`}
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
                        <span className={`text-sm tabular-nums whitespace-nowrap ${urgencyRowClass(driver.daysExpired)}`}>
                          {daysExpiredLabel(driver.daysExpired)}
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
                            data-testid={`btn-license-task-${driver.driverId}`}
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
            Most overdue first by default · Click any column header to re-sort
          </p>
          <Button variant="outline" size="sm" onClick={onClose} data-testid="btn-license-close">
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Widget ─────────────────────────────────────────────────────────────

export function ExpiredLicenseWidget() {
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, isLoading } = useQuery<ExpiredLicenseResponse>({
    queryKey: ["/api/compliance/expired-license"],
    staleTime: 5 * 60 * 1000,
    refetchInterval: 30_000,
  });

  // Build task-ensure items — high priority (expired license = immediate action)
  const taskItems: EnsureItem[] = useMemo(() => {
    if (!data?.drivers) return [];
    return data.drivers.map(d => ({
      eventType: "license_expired",
      recordId: d.driverId,
      recordName: driverName(d),
      reason: `Driver's license expired ${d.daysExpired}d ago${d.primaryAccountName ? ` — ${d.primaryAccountName}` : ""} — driver must not operate until license is renewed`,
      priority: "high" as const,
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
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="widget-expired-license">
      {/* Count summary */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span
            className={`text-3xl font-bold tabular-nums ${total > 0 ? "text-destructive" : "text-muted-foreground"}`}
            data-testid="text-license-expired-count"
          >
            {total}
          </span>
          {total > 0 && (
            <span className="text-xs text-muted-foreground leading-tight">
              driver{total !== 1 ? "s" : ""}<br />expired license
            </span>
          )}
        </div>
        {total > 0 ? (
          <Badge variant="destructive" className="text-xs">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Action Required
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-xs">All Clear</Badge>
        )}
      </div>

      {/* Preview list */}
      {total === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-4 text-center">
          <IdCard className="h-6 w-6 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No expired licenses on file</p>
        </div>
      ) : (
        <div className="space-y-0.5" data-testid="widget-license-preview-list">
          {preview.map(driver => (
            <PreviewRow
              key={driver.driverId}
              driver={driver}
              onClick={() => setSheetOpen(true)}
            />
          ))}
        </div>
      )}

      {/* View all button */}
      {total > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-1"
          onClick={() => setSheetOpen(true)}
          data-testid="btn-license-view-all"
        >
          View all {total} expired license records
        </Button>
      )}

      {/* Drill-down Sheet */}
      <ExpiredLicenseSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        data={data}
        taskMap={taskMap}
      />
    </div>
  );
}
