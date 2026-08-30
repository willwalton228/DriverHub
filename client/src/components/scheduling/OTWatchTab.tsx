import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  RefreshCw, AlertTriangle, AlertOctagon, TrendingUp, Users,
  Clock, Calendar, ChevronUp, ChevronDown, ChevronsUpDown,
  ExternalLink, WifiOff, Info, Shield, User, CalendarDays, GitBranch
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface OTWatchDriver {
  driverId: string;
  driverName: string;
  driverClassification: string;
  accountName: string | null;
  market: string;
  managerName: string | null;
  wiwLinked: boolean;
  isEmployee: boolean;
  workedHours: number;
  remainingScheduledHours: number;
  projectedTotalHours: number;
  projectedOtHours: number;
  hoursToOt: number;
  status: "normal" | "watch" | "warning" | "overtime";
  weekStart: string;
}

interface OTWatchSummary {
  inOvertime: number;
  within4HrsOfOt: number;
  within8HrsOfOt: number;
  totalProjectedOtHours: number;
  totalEmployeeDrivers?: number;
  totalDrivers?: number;
  weekStart: string;
  weekEnd: string;
  computedAt: string;
}

interface OTWatchData {
  summary: OTWatchSummary;
  drivers: OTWatchDriver[];
}

// ── Status helpers ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  normal:   { label: "Normal",   color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",   dot: "bg-green-500" },
  watch:    { label: "Watch",    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300", dot: "bg-yellow-500" },
  warning:  { label: "Warning",  color: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300", dot: "bg-orange-500" },
  overtime: { label: "Overtime", color: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",           dot: "bg-red-500" },
} as const;

function StatusBadge({ status }: { status: OTWatchDriver["status"] }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.normal;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium", cfg.color)}>
      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function HoursBar({ worked, remaining, threshold = 40 }: { worked: number; remaining: number; threshold?: number }) {
  const workedPct  = Math.min((worked / threshold) * 100, 100);
  const remainPct  = Math.min((remaining / threshold) * 100, 100 - workedPct);
  const isOver     = worked + remaining > threshold;
  return (
    <div className="w-24 h-2 rounded-full bg-muted overflow-hidden flex">
      <div className={cn("h-full rounded-l-full transition-all", isOver ? "bg-red-500" : "bg-primary")}
           style={{ width: `${workedPct}%` }} />
      <div className="h-full bg-primary/30 transition-all"
           style={{ width: `${remainPct}%` }} />
    </div>
  );
}

// ── Sort helpers ──────────────────────────────────────────────────────────────
type SortKey = "driverName" | "workedHours" | "remainingScheduledHours" | "projectedTotalHours" | "projectedOtHours" | "hoursToOt" | "status";

function SortIcon({ col, current, dir }: { col: SortKey; current: SortKey; dir: "asc" | "desc" }) {
  if (col !== current) return <ChevronsUpDown className="w-3 h-3 ml-1 text-muted-foreground/50" />;
  return dir === "asc"
    ? <ChevronUp className="w-3 h-3 ml-1 text-foreground" />
    : <ChevronDown className="w-3 h-3 ml-1 text-foreground" />;
}

// ── Shared helpers (used by both OTWatchTab and DriverOTWatchCard) ─────────────
function fmtMDY(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return y && m && day ? `${m}/${day}/${y}` : d;
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function OTWatchTab() {
  const [sortKey, setSortKey]             = useState<SortKey>("status");
  const [sortDir, setSortDir]             = useState<"asc" | "desc">("asc");
  const [searchQ, setSearchQ]             = useState("");
  const [filterStatus, setFilterStatus]   = useState("all");
  const [filterMarket, setFilterMarket]   = useState("all");
  const [filterManager, setFilterManager] = useState("all");
  const [employeesOnly, setEmployeesOnly] = useState(true); // business rule: employees only by default
  const [isSyncing, setIsSyncing]         = useState(false);

  // ── Query ─────────────────────────────────────────────────────────────────
  const { data, isLoading, error, refetch, isFetching } = useQuery<OTWatchData>({
    queryKey: ["/api/scheduling/wheniwork/driver-ot-watch"],
    queryFn: async () => {
      const r = await fetch("/api/scheduling/wheniwork/driver-ot-watch", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load OT Watch data");
      return r.json();
    },
    staleTime: 55 * 60 * 1000, // ~hourly
  });

  // ── Derived filter options ─────────────────────────────────────────────────
  const markets = useMemo(() => {
    const s = new Set((data?.drivers ?? []).map(d => d.market).filter(m => m && m !== "—"));
    return Array.from(s).sort();
  }, [data]);

  const managers = useMemo(() => {
    const s = new Set((data?.drivers ?? []).map(d => d.managerName).filter((m): m is string => !!m));
    return Array.from(s).sort();
  }, [data]);

  // ── Filtered + sorted rows ─────────────────────────────────────────────────
  const rows = useMemo(() => {
    let rows = data?.drivers ?? [];

    if (employeesOnly) rows = rows.filter(d => d.isEmployee);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter(d =>
        d.driverName.toLowerCase().includes(q) ||
        d.market.toLowerCase().includes(q) ||
        (d.accountName ?? "").toLowerCase().includes(q) ||
        (d.managerName ?? "").toLowerCase().includes(q)
      );
    }
    if (filterStatus !== "all") rows = rows.filter(d => d.status === filterStatus);
    if (filterMarket !== "all") rows = rows.filter(d => d.market === filterMarket);
    if (filterManager !== "all") rows = rows.filter(d => d.managerName === filterManager);

    const tierOrder: Record<string, number> = { overtime: 0, warning: 1, watch: 2, normal: 3 };
    return [...rows].sort((a, b) => {
      let av: any, bv: any;
      if (sortKey === "status") { av = tierOrder[a.status] ?? 4; bv = tierOrder[b.status] ?? 4; }
      else if (sortKey === "driverName") { av = a.driverName; bv = b.driverName; }
      else { av = (a as any)[sortKey]; bv = (b as any)[sortKey]; }
      const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, searchQ, filterStatus, filterMarket, employeesOnly, sortKey, sortDir]);

  function toggleSort(col: SortKey) {
    if (sortKey === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(col); setSortDir("asc"); }
  }

  function fmtHrs(h: number) {
    return `${h.toFixed(1)}h`;
  }

  const summary = data?.summary;

  async function handleSyncNow() {
    setIsSyncing(true);
    try {
      await fetch("/api/scheduling/wheniwork/driver-ot-sync", { method: "POST", credentials: "include" });
      await refetch();
    } finally {
      setIsSyncing(false);
    }
  }

  // ── KPI cards — EMPLOYEES ONLY per business rule ───────────────────────────
  const kpiCards = [
    {
      label: "Employees in Overtime",
      value: summary?.inOvertime ?? 0,
      icon: <AlertOctagon className="w-5 h-5" />,
      color: "text-red-600 dark:text-red-400",
      bg: "bg-red-50 dark:bg-red-900/20",
      border: "border-red-200 dark:border-red-800",
      desc: "Projected ≥ 40h — employees only",
    },
    {
      label: "Within 4 Hrs of OT",
      value: summary?.within4HrsOfOt ?? 0,
      icon: <AlertTriangle className="w-5 h-5" />,
      color: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-50 dark:bg-orange-900/20",
      border: "border-orange-200 dark:border-orange-800",
      desc: "Management alert threshold (36–40h)",
    },
    {
      label: "Within 8 Hrs of OT",
      value: summary?.within8HrsOfOt ?? 0,
      icon: <Shield className="w-5 h-5" />,
      color: "text-yellow-600 dark:text-yellow-400",
      bg: "bg-yellow-50 dark:bg-yellow-900/20",
      border: "border-yellow-200 dark:border-yellow-800",
      desc: "Dispatch alert threshold (32–40h)",
    },
    {
      label: "Total Projected OT Hours",
      value: summary ? `${summary.totalProjectedOtHours.toFixed(1)}h` : "—",
      icon: <TrendingUp className="w-5 h-5" />,
      color: "text-foreground",
      bg: "bg-muted/50",
      border: "border-border",
      desc: summary
        ? `${summary.totalEmployeeDrivers ?? "—"} employees · ${summary.totalDrivers ?? "—"} total drivers`
        : "Employee OT exposure this week",
    },
  ];

  return (
    <div className="space-y-6" data-testid="ot-watch-tab">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-orange-500" />
            Employee Driver OT Watch
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Current-week overtime projections — WIW worked hours + remaining scheduled shifts
          </p>
          {summary && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Week of {fmtMDY(summary.weekStart)} — {fmtMDY(summary.weekEnd)}
              {" · "}Computed {new Date(summary.computedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSyncNow}
            disabled={isSyncing || isFetching}
            data-testid="btn-ot-watch-sync"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", isSyncing && "animate-spin")} />
            {isSyncing ? "Syncing…" : "Sync Now"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="btn-ot-watch-refresh"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", isFetching && "animate-spin")} />
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map(kpi => (
          <Card key={kpi.label} className={cn("border", kpi.border, kpi.bg)}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
                <span className={cn(kpi.color, "opacity-70")}>{kpi.icon}</span>
              </div>
              {isLoading ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className={cn("text-2xl font-bold", kpi.color)} data-testid={`kpi-ot-${kpi.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  {typeof kpi.value === "number" ? kpi.value : kpi.value}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">{kpi.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Status Legend ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="font-medium">Status:</span>
        {Object.entries(STATUS_CONFIG).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1">
            <span className={cn("w-2 h-2 rounded-full", v.dot)} />
            {v.label} {k === "normal" ? "(<32h)" : k === "watch" ? "(32–36h)" : k === "warning" ? "(36–40h)" : "(40h+)"}
          </span>
        ))}
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search driver or market…"
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          className="w-48"
          data-testid="input-ot-watch-search"
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36" data-testid="select-ot-status">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="overtime">Overtime</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="watch">Watch</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
          </SelectContent>
        </Select>
        {markets.length > 0 && (
          <Select value={filterMarket} onValueChange={setFilterMarket}>
            <SelectTrigger className="w-40" data-testid="select-ot-market">
              <SelectValue placeholder="All Markets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Markets</SelectItem>
              {markets.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {managers.length > 0 && (
          <Select value={filterManager} onValueChange={setFilterManager}>
            <SelectTrigger className="w-44" data-testid="select-ot-manager">
              <SelectValue placeholder="All Managers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Managers</SelectItem>
              {managers.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Button
          variant={employeesOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setEmployeesOnly(v => !v)}
          data-testid="btn-ot-employees-only"
        >
          <Users className="w-3.5 h-3.5 mr-1.5" />
          Employees Only
        </Button>
        {(searchQ || filterStatus !== "all" || filterMarket !== "all" || filterManager !== "all" || !employeesOnly) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearchQ(""); setFilterStatus("all"); setFilterMarket("all"); setFilterManager("all"); setEmployeesOnly(true); }}>
            Reset
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {rows.length} driver{rows.length !== 1 ? "s" : ""}
          {!employeesOnly && rows.length > 0 && (
            <span className="text-muted-foreground/70">
              {" "}({rows.filter(d => d.isEmployee).length} employee, {rows.filter(d => !d.isEmployee).length} IC)
            </span>
          )}
        </span>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      {error ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <WifiOff className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">Unable to load OT Watch data</p>
            <p className="text-xs mt-1">{(error as Error).message}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {[1,2,3,4,5].map(i => (
                    <tr key={i} className="border-b">
                      {[1,2,3,4,5,6,7,8,9,10].map(j => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No drivers match the current filters.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground text-left text-xs">
                    <th className="px-4 py-3 font-medium cursor-pointer whitespace-nowrap select-none" onClick={() => toggleSort("driverName")}>
                      <span className="flex items-center">Driver <SortIcon col="driverName" current={sortKey} dir={sortDir} /></span>
                    </th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Account</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Market / Class</th>
                    <th className="px-4 py-3 font-medium cursor-pointer whitespace-nowrap select-none" onClick={() => toggleSort("workedHours")}>
                      <span className="flex items-center">Worked <SortIcon col="workedHours" current={sortKey} dir={sortDir} /></span>
                    </th>
                    <th className="px-4 py-3 font-medium cursor-pointer whitespace-nowrap select-none" onClick={() => toggleSort("remainingScheduledHours")}>
                      <span className="flex items-center">Sched Rem <SortIcon col="remainingScheduledHours" current={sortKey} dir={sortDir} /></span>
                    </th>
                    <th className="px-4 py-3 font-medium cursor-pointer whitespace-nowrap select-none" onClick={() => toggleSort("projectedTotalHours")}>
                      <span className="flex items-center">Projected Total <SortIcon col="projectedTotalHours" current={sortKey} dir={sortDir} /></span>
                    </th>
                    <th className="px-4 py-3 font-medium cursor-pointer whitespace-nowrap select-none" onClick={() => toggleSort("projectedOtHours")}>
                      <span className="flex items-center">Proj OT <SortIcon col="projectedOtHours" current={sortKey} dir={sortDir} /></span>
                    </th>
                    <th className="px-4 py-3 font-medium cursor-pointer whitespace-nowrap select-none" onClick={() => toggleSort("hoursToOt")}>
                      <span className="flex items-center">Hrs to OT <SortIcon col="hoursToOt" current={sortKey} dir={sortDir} /></span>
                    </th>
                    <th className="px-4 py-3 font-medium cursor-pointer whitespace-nowrap select-none" onClick={() => toggleSort("status")}>
                      <span className="flex items-center">Status <SortIcon col="status" current={sortKey} dir={sortDir} /></span>
                    </th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(driver => (
                    <tr
                      key={driver.driverId}
                      className={cn(
                        "border-b last:border-0 hover-elevate",
                        driver.status === "overtime" && "bg-red-50/30 dark:bg-red-900/10",
                        driver.status === "warning"  && "bg-orange-50/30 dark:bg-orange-900/10",
                      )}
                      data-testid={`row-ot-${driver.driverId}`}
                    >
                      {/* Driver Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium whitespace-nowrap">{driver.driverName}</span>
                          {!driver.wiwLinked && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <WifiOff className="w-3 h-3 text-muted-foreground/60" />
                              </TooltipTrigger>
                              <TooltipContent>No WIW link — hours based on local data</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </td>

                      {/* Account */}
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium whitespace-nowrap" data-testid={`text-ot-account-${driver.driverId}`}>
                          {driver.accountName ?? <span className="text-muted-foreground">—</span>}
                        </span>
                      </td>

                      {/* Market / Classification */}
                      <td className="px-4 py-3">
                        <div className="text-xs">
                          <p className="font-medium">{driver.market !== "—" ? driver.market : <span className="text-muted-foreground">—</span>}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-muted-foreground">{driver.driverClassification}</span>
                            {!driver.isEmployee && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold bg-muted text-muted-foreground border border-border">IC</span>
                                </TooltipTrigger>
                                <TooltipContent>Independent Contractor — excluded from OT alerts and KPIs</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          {driver.managerName && (
                            <p className="text-muted-foreground/70 mt-0.5 flex items-center gap-0.5">
                              <User className="w-2.5 h-2.5 shrink-0" />
                              {driver.managerName}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Worked */}
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <span className="font-medium whitespace-nowrap">{fmtHrs(driver.workedHours)}</span>
                          <HoursBar worked={driver.workedHours} remaining={driver.remainingScheduledHours} />
                        </div>
                      </td>

                      {/* Sched Rem */}
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fmtHrs(driver.remainingScheduledHours)}</td>

                      {/* Projected Total */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={cn(
                          "font-semibold",
                          driver.status === "overtime" ? "text-red-600 dark:text-red-400" :
                          driver.status === "warning"  ? "text-orange-600 dark:text-orange-400" :
                          driver.status === "watch"    ? "text-yellow-600 dark:text-yellow-400" :
                          "text-foreground"
                        )}>
                          {fmtHrs(driver.projectedTotalHours)}
                        </span>
                        <span className="text-xs text-muted-foreground"> / 40h</span>
                      </td>

                      {/* Proj OT */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {driver.projectedOtHours > 0 ? (
                          <span className="font-semibold text-red-600 dark:text-red-400">+{fmtHrs(driver.projectedOtHours)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Hrs to OT */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {driver.status === "overtime" ? (
                          <span className="text-muted-foreground text-xs italic">In OT</span>
                        ) : (
                          <span className={cn(
                            "font-medium",
                            driver.hoursToOt <= 4  ? "text-orange-600 dark:text-orange-400" :
                            driver.hoursToOt <= 8  ? "text-yellow-600 dark:text-yellow-400" :
                            "text-foreground"
                          )}>
                            {fmtHrs(driver.hoursToOt)}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge status={driver.status} />
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Link href={`/drivers/${driver.driverId}`}>
                                <Button size="icon" variant="ghost" data-testid={`btn-ot-view-profile-${driver.driverId}`}>
                                  <User className="w-3.5 h-3.5" />
                                </Button>
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent>View Driver Profile</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Link href={`/drivers/${driver.driverId}?tab=scheduling`}>
                                <Button size="icon" variant="ghost" data-testid={`btn-ot-view-schedule-${driver.driverId}`}>
                                  <CalendarDays className="w-3.5 h-3.5" />
                                </Button>
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent>View Schedule</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" disabled data-testid={`btn-ot-reassign-${driver.driverId}`}>
                                <GitBranch className="w-3.5 h-3.5 opacity-40" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Reassign Shift — Coming Soon</TooltipContent>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Notes footer ─────────────────────────────────────────────────── */}
      <div className="text-xs text-muted-foreground flex items-start gap-1.5 pt-1">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <span>
          <strong>Worked hours</strong> = actual clock records from When I Work this week (Mon–Sun, Chicago time).{" "}
          <strong>Scheduled remaining</strong> = future shifts this week not yet clocked.{" "}
          <strong>Projected OT</strong> = max(0, worked + remaining − 40h).{" "}
          Drivers without a WIW link show 0 worked/remaining hours.
        </span>
      </div>
    </div>
  );
}

// ── Mini OT Watch Card (for Driver Detail page) ───────────────────────────────
export function DriverOTWatchCard({ driverId }: { driverId: string }) {
  const { data, isLoading } = useQuery<OTWatchData>({
    queryKey: ["/api/scheduling/wheniwork/driver-ot-watch"],
    queryFn: async () => {
      const r = await fetch("/api/scheduling/wheniwork/driver-ot-watch", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 55 * 60 * 1000,
  });

  const driver = data?.drivers.find(d => d.driverId === driverId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-3 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!driver) return null;

  const cfg = STATUS_CONFIG[driver.status];

  return (
    <Card className={cn("border", driver.status === "overtime" ? "border-red-300 dark:border-red-700" : driver.status === "warning" ? "border-orange-300 dark:border-orange-700" : "")}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-orange-500" />
            OT Watch — This Week
          </CardTitle>
          <CardDescription className="text-xs">Week of {fmtMDY(driver.weekStart)}</CardDescription>
        </div>
        <StatusBadge status={driver.status} />
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: "Worked",     value: `${driver.workedHours.toFixed(1)}h` },
            { label: "Sched Rem",  value: `${driver.remainingScheduledHours.toFixed(1)}h` },
            { label: "Projected",  value: `${driver.projectedTotalHours.toFixed(1)}h`, bold: true },
          ].map(kpi => (
            <div key={kpi.label}>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className={cn("text-base font-semibold", kpi.bold && driver.status !== "normal" ? cfg.color.split(" ")[1] : "")}>{kpi.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Proj OT:</span>
            <span className={driver.projectedOtHours > 0 ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground"}>
              {driver.projectedOtHours > 0 ? `+${driver.projectedOtHours.toFixed(1)}h` : "None"}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Hours to OT:</span>
            <span className={cn("font-medium",
              driver.status === "overtime" ? "text-muted-foreground italic" :
              driver.hoursToOt <= 4 ? "text-orange-600 dark:text-orange-400" : "text-foreground"
            )}>
              {driver.status === "overtime" ? "In OT" : `${driver.hoursToOt.toFixed(1)}h`}
            </span>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden flex">
            <div className={cn("h-full rounded-l-full transition-all", driver.status === "overtime" ? "bg-red-500" : driver.status === "warning" ? "bg-orange-500" : driver.status === "watch" ? "bg-yellow-500" : "bg-primary")}
                 style={{ width: `${Math.min((driver.workedHours / 40) * 100, 100)}%` }} />
            <div className="h-full bg-primary/25 transition-all"
                 style={{ width: `${Math.min((driver.remainingScheduledHours / 40) * 100, Math.max(0, 100 - (driver.workedHours / 40) * 100))}%` }} />
          </div>
          <p className="text-xs text-muted-foreground text-right">{driver.workedHours.toFixed(1)} worked + {driver.remainingScheduledHours.toFixed(1)} sched / 40h</p>
        </div>
      </CardContent>
    </Card>
  );
}
