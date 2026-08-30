/**
 * WIW Driver Time-Off Report
 * Full ranked report of driver time-off requests from When I Work.
 * Route: /scheduling/driver-time-off
 */

import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MultiSelectFilter } from "@/components/ui/MultiSelectFilter";
import {
  Download, RefreshCw, Search, ArrowUpDown,
  ArrowUp, ArrowDown, AlertCircle, Trophy, ExternalLink
} from "lucide-react";
import { format, startOfYear } from "date-fns";
import { cn } from "@/lib/utils";
import {
  SchedulingModuleNav,
  SchedulingReportBreadcrumb,
} from "@/components/scheduling/SchedulingModuleNav";
import {
  readSchedulingReportSession,
  useSchedulingReportSessionId,
  writeSchedulingReportSession,
} from "@/components/scheduling/SchedulingReportSession";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReportRow {
  rank: number;
  driverId: string;
  driverName: string;
  driverStatus: string | null;
  market: string | null;
  driverType: string | null;
  driverClassification: string | null;
  networks: string[];
  accounts: string[];
  totalApprovedDays: number;
  totalApprovedHours: number | null;
  totalRequests: number;
  approvedRequests: number;
  pendingRequests: number;
  deniedRequests: number;
  lastTimeOffDate: string | null;
  nextTimeOffDate: string | null;
}

interface FilterValues {
  markets: string[];
  driverTypes: string[];
  driverClasses: string[];
  networks: string[];
  accounts: Array<{ id: string; name: string; network: string | null }>;
}

interface SyncStats {
  totalRecords: number;
  lastSyncedAt: string | null;
  earliestDate: string | null;
  latestDate: string | null;
}

type Period = "60d" | "ytd" | "custom";
type SortDir = "asc" | "desc";

interface TimeOffReportState {
  period: Period;
  customStart: string;
  customEnd: string;
  driverStatus: string;
  market: string;
  driverType: string;
  driverClass: string;
  networkIds: string[];
  accountIds: string[];
  wiwStatus: string;
  search: string;
  sortBy: string;
  sortDir: SortDir;
}

const STATUS_COLORS: Record<string, string> = {
  approved:   "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  pending:    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  denied:     "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  cancelled:  "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  active:     "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  inactive:   "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  suspended:  "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return "—";
  try { return format(new Date(d + "T00:00:00"), "MM/dd/yyyy"); }
  catch { return d; }
}

function SortIcon({ col, sortBy, sortDir }: { col: string; sortBy: string; sortDir: SortDir }) {
  if (sortBy !== col) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />;
  return sortDir === "desc" ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />;
}

function readMultiParam(params: URLSearchParams, key: string) {
  return (params.get(key) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WiwTimeOffReport() {
  const { toast } = useToast();
  const searchString = useSearch();
  const reportSessionId = useSchedulingReportSessionId();
  const restoredSession = useMemo(
    () => readSchedulingReportSession<TimeOffReportState, ReportRow[]>("time-off", reportSessionId),
    [reportSessionId],
  );
  const restoredState = restoredSession?.state;
  const initialParams = useMemo(() => new URLSearchParams(searchString), []);

  // Filters
  const [period, setPeriod] = useState<Period>(() => {
    if (restoredState?.period) return restoredState.period;
    const initialPeriod = initialParams.get("period");
    return initialPeriod === "ytd" || initialPeriod === "custom" ? initialPeriod : "60d";
  });
  const [customStart, setCustomStart] = useState(() => restoredState?.customStart ?? initialParams.get("customStart") ?? format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd]     = useState(() => restoredState?.customEnd ?? initialParams.get("customEnd") ?? format(new Date(), "yyyy-MM-dd"));
  const [driverStatus, setDriverStatus] = useState(() => restoredState?.driverStatus ?? initialParams.get("driverStatus") ?? "all");
  const [market, setMarket]           = useState(() => restoredState?.market ?? initialParams.get("market") ?? "all");
  const [driverType, setDriverType]   = useState(() => restoredState?.driverType ?? initialParams.get("driverType") ?? "all");
  const [driverClass, setDriverClass] = useState(() => restoredState?.driverClass ?? initialParams.get("driverClass") ?? "all");
  const [networkIds, setNetworkIds]   = useState(() => restoredState?.networkIds ?? readMultiParam(initialParams, "networks"));
  const [accountIds, setAccountIds]   = useState(() => restoredState?.accountIds ?? readMultiParam(initialParams, "accountIds"));
  const [wiwStatus, setWiwStatus]     = useState(() => restoredState?.wiwStatus ?? initialParams.get("wiwStatus") ?? "all");
  const [search, setSearch]           = useState(() => restoredState?.search ?? "");
  const [sortBy, setSortBy]           = useState(() => restoredState?.sortBy ?? "total_approved_days");
  const [sortDir, setSortDir]         = useState<SortDir>(() => restoredState?.sortDir ?? "desc");
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(() => restoredSession?.lastRefreshedAt ?? null);
  const restoredStateMatches =
    restoredSession?.data != null &&
    restoredState != null &&
    period === restoredState?.period &&
    customStart === restoredState.customStart &&
    customEnd === restoredState.customEnd &&
    driverStatus === restoredState.driverStatus &&
    market === restoredState.market &&
    driverType === restoredState.driverType &&
    driverClass === restoredState.driverClass &&
    networkIds.join(",") === restoredState.networkIds.join(",") &&
    accountIds.join(",") === restoredState.accountIds.join(",") &&
    wiwStatus === restoredState.wiwStatus &&
    search === restoredState.search &&
    sortBy === restoredState.sortBy &&
    sortDir === restoredState.sortDir;
  const shouldInitializeReport = !restoredStateMatches;

  // ── Queries ────────────────────────────────────────────────────────────────

  const filterQuery = useQuery<FilterValues>({
    queryKey: ["/api/wiw/time-off/filter-values"],
    staleTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const statsQuery = useQuery<SyncStats>({
    queryKey: ["/api/wiw/time-off/sync-stats"],
    staleTime: 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const reportParams = useMemo(() => {
    const p = new URLSearchParams({ period, sortBy, sortDir });
    if (period === "custom") { p.set("customStart", customStart); p.set("customEnd", customEnd); }
    if (driverStatus !== "all") p.set("driverStatus", driverStatus);
    if (market       !== "all") p.set("market", market);
    if (driverType   !== "all") p.set("driverType", driverType);
    if (driverClass  !== "all") p.set("driverClass", driverClass);
    if (networkIds.length) p.set("networks", networkIds.join(","));
    if (accountIds.length) p.set("accountIds", accountIds.join(","));
    if (wiwStatus    !== "all") p.set("wiwStatus", wiwStatus);
    return p.toString();
  }, [period, customStart, customEnd, driverStatus, market, driverType, driverClass, networkIds, accountIds, wiwStatus, sortBy, sortDir]);

  const reportQuery = useQuery<ReportRow[]>({
    queryKey: ["/api/wiw/time-off/report", reportParams, reportSessionId],
    queryFn: async () => {
      const res = await fetch(`/api/wiw/time-off/report?${reportParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load report");
      return res.json();
    },
    initialData: restoredStateMatches ? restoredSession?.data : undefined,
    enabled: shouldInitializeReport,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // ── Sync mutation ──────────────────────────────────────────────────────────

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/wiw/time-off/sync", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Sync failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wiw/time-off"] });
      setLastRefreshedAt(new Date().toISOString());
      void reportQuery.refetch();
      toast({ title: "Sync complete", description: "WIW time-off data has been refreshed." });
    },
    onError: (err: any) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Sort toggling ──────────────────────────────────────────────────────────

  function handleSort(col: string) {
    if (sortBy === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(col); setSortDir("desc"); }
  }

  // ── Filtered rows (client-side name search only) ───────────────────────────

  const rows = useMemo(() => {
    const all = reportQuery.data ?? [];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter(r => r.driverName.toLowerCase().includes(q));
  }, [reportQuery.data, search]);

  // ── CSV Export ─────────────────────────────────────────────────────────────

  function exportCsv() {
    const headers = [
      "Rank","Driver Name","Driver Status","Market","Driver Type","Networks","Accounts","Classification",
      "Total Days Off","Total Hours Off","Total Requests","Approved","Pending","Denied",
      "Last Time Off","Next Scheduled",
    ];
    const csvRows = [headers.join(",")];
    for (const r of rows) {
      csvRows.push([
        r.rank, `"${r.driverName}"`, r.driverStatus ?? "", r.market ?? "", r.driverType ?? "",
        `"${r.networks.join("; ")}"`, `"${r.accounts.join("; ")}"`, r.driverClassification ?? "",
        r.totalApprovedDays, r.totalApprovedHours ?? "", r.totalRequests,
        r.approvedRequests, r.pendingRequests, r.deniedRequests,
        r.lastTimeOffDate ?? "", r.nextTimeOffDate ?? "",
      ].join(","));
    }
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "driver-time-off-report.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const stats = statsQuery.data;
  const filters = filterQuery.data;
  const isLoading = reportQuery.isLoading;
  const accountOptions = (filters?.accounts ?? [])
    .filter((account) => networkIds.length === 0 || (account.network && networkIds.includes(account.network)))
    .map((account) => ({ value: account.id, label: account.name }));
  const hasActiveFilters = period !== "60d" || driverStatus !== "all" || market !== "all" ||
    driverType !== "all" || driverClass !== "all" || networkIds.length > 0 || accountIds.length > 0 ||
    wiwStatus !== "all" || search.length > 0 || sortBy !== "total_approved_days" || sortDir !== "desc";
  const reportState = useMemo<TimeOffReportState>(() => ({
    period,
    customStart,
    customEnd,
    driverStatus,
    market,
    driverType,
    driverClass,
    networkIds,
    accountIds,
    wiwStatus,
    search,
    sortBy,
    sortDir,
  }), [period, customStart, customEnd, driverStatus, market, driverType, driverClass, networkIds, accountIds, wiwStatus, search, sortBy, sortDir]);

  useEffect(() => {
    const availableAccountIds = new Set(accountOptions.map((account) => account.value));
    setAccountIds((selected) => selected.filter((id) => availableAccountIds.has(id)));
  }, [filters?.accounts, networkIds.join(",")]);

  useEffect(() => {
    if (!reportQuery.data || reportQuery.isFetching) return;

    const refreshedAt = lastRefreshedAt ?? new Date().toISOString();
    if (!lastRefreshedAt) setLastRefreshedAt(refreshedAt);
    writeSchedulingReportSession("time-off", reportSessionId, {
      state: reportState,
      data: reportQuery.data,
      lastRefreshedAt: refreshedAt,
    });
  }, [lastRefreshedAt, reportQuery.data, reportQuery.isFetching, reportSessionId, reportState]);

  function clearFilters() {
    setPeriod("60d");
    setCustomStart(format(startOfYear(new Date()), "yyyy-MM-dd"));
    setCustomEnd(format(new Date(), "yyyy-MM-dd"));
    setDriverStatus("all");
    setMarket("all");
    setDriverType("all");
    setDriverClass("all");
    setNetworkIds([]);
    setAccountIds([]);
    setWiwStatus("all");
    setSearch("");
    setSortBy("total_approved_days");
    setSortDir("desc");
  }

  return (
    <div className="p-6 space-y-6 max-w-screen-2xl mx-auto" data-testid="wiw-time-off-report">
      <SchedulingModuleNav active="reports" />
      <SchedulingReportBreadcrumb reportName="Drivers with Most Time Off" />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Drivers with Most Time Off
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            WIW time-off requests ranked by total approved days
            {stats?.lastSyncedAt && (
              <> · Last synced {format(new Date(stats.lastSyncedAt), "MM/dd/yy h:mm a")}</>
            )}
            {lastRefreshedAt && (
              <> · Last refreshed {format(new Date(lastRefreshedAt), "MM/dd/yy h:mm a")}</>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLastRefreshedAt(new Date().toISOString());
              void reportQuery.refetch();
            }}
            disabled={reportQuery.isFetching}
            data-testid="btn-time-off-refresh"
          >
            <RefreshCw className={cn("h-4 w-4 mr-1", reportQuery.isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            data-testid="btn-time-off-sync"
          >
            <RefreshCw className={cn("h-4 w-4 mr-1", syncMutation.isPending && "animate-spin")} />
            Sync WIW
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0} data-testid="btn-time-off-export">
            <Download className="h-4 w-4 mr-1" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Stats bar — suppress all values when report failed to avoid showing stale/misleading data */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Records",    value: reportQuery.isError ? "—" : stats.totalRecords.toLocaleString() },
            { label: "Drivers in Report", value: reportQuery.isError ? "—" : rows.length.toString() },
            { label: "Earliest Request", value: reportQuery.isError ? "—" : fmtDate(stats.earliestDate) },
            { label: "Latest Request",   value: reportQuery.isError ? "—" : fmtDate(stats.latestDate) },
          ].map(({ label, value }) => (
            <Card key={label} className="py-3 px-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-bold">{value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Period */}
            <div className="flex gap-1">
              {(["60d", "ytd", "custom"] as Period[]).map(p => (
                <Button key={p} size="sm" variant={period === p ? "default" : "outline"}
                  className="h-8 text-xs" onClick={() => setPeriod(p)}
                  data-testid={`btn-period-${p}`}>
                  {p === "60d" ? "Last 60 Days" : p === "ytd" ? "Current Year" : "Custom"}
                </Button>
              ))}
            </div>
            {period === "custom" && (
              <>
                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                  className="border rounded-md px-2 h-8 text-sm bg-background" />
                <span className="text-muted-foreground text-sm self-center">–</span>
                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                  className="border rounded-md px-2 h-8 text-sm bg-background" />
              </>
            )}

            {/* Dropdowns */}
            <Select value={wiwStatus} onValueChange={setWiwStatus}>
              <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-wiw-status">
                <SelectValue placeholder="WIW Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="denied">Denied</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <Select value={driverStatus} onValueChange={setDriverStatus}>
              <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-driver-status">
                <SelectValue placeholder="Driver Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Drivers</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>

            {filters?.markets && filters.markets.length > 0 && (
              <Select value={market} onValueChange={setMarket}>
                <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-market">
                  <SelectValue placeholder="Market" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Markets</SelectItem>
                  {filters.markets.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {filters?.driverTypes && filters.driverTypes.length > 0 && (
              <Select value={driverType} onValueChange={setDriverType}>
                <SelectTrigger className="h-8 w-40 text-xs" data-testid="select-driver-type">
                  <SelectValue placeholder="Driver Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Driver Types</SelectItem>
                  {filters.driverTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            <MultiSelectFilter
              label="Networks"
              options={(filters?.networks ?? []).map((network) => ({ value: network, label: network }))}
              selected={networkIds}
              onChange={setNetworkIds}
              placeholder="All Networks"
              className="h-8 text-xs"
              data-testid="filter-time-off-networks"
            />

            <MultiSelectFilter
              label="Accounts / Dealerships"
              options={accountOptions}
              selected={accountIds}
              onChange={setAccountIds}
              placeholder="All Accounts"
              className="h-8 text-xs"
              data-testid="filter-time-off-accounts"
            />

            <Select value={driverClass} onValueChange={setDriverClass}>
              <SelectTrigger className="h-8 w-48 text-xs" data-testid="select-driver-class">
                <SelectValue placeholder="Driver Classification" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classifications</SelectItem>
                <SelectItem value="Employee">Employee</SelectItem>
                <SelectItem value="Independent Contractor">Independent Contractor</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={clearFilters}
                data-testid="btn-time-off-clear-filters"
              >
                Clear filters
              </Button>
            )}

            {/* Name search */}
            <div className="relative ml-auto">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search driver…" className="h-8 pl-7 text-xs w-44"
                data-testid="input-driver-search" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {isLoading ? "Loading…" : `${rows.length} driver${rows.length !== 1 ? "s" : ""}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : reportQuery.isError ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <AlertCircle className="h-6 w-6 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">Failed to load report</p>
              <button
                onClick={() => reportQuery.refetch()}
                className="text-xs text-primary underline-offset-2 hover:underline mt-1"
                data-testid="btn-retry-report"
              >
                Retry
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <p className="text-sm font-medium text-muted-foreground">No records match your filters</p>
              <p className="text-xs text-muted-foreground/70">Try changing the date range or clearing filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1050px]" data-testid="time-off-report-table">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground text-left">
                    <th className="px-3 py-2.5 font-medium w-10">#</th>
                    <th className="px-3 py-2.5 font-medium">Driver</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Market</th>
                    <th className="px-3 py-2.5 font-medium">Driver Type</th>
                    <th className="px-3 py-2.5 font-medium">Networks</th>
                    <th className="px-3 py-2.5 font-medium">Accounts</th>
                    <th className="px-3 py-2.5 font-medium">Class</th>
                    <SortableTh col="total_approved_days" label="Days Off" {...{ sortBy, sortDir, onSort: handleSort }} />
                    <SortableTh col="total_approved_hours" label="Hrs Off" {...{ sortBy, sortDir, onSort: handleSort }} />
                    <SortableTh col="total_requests" label="Requests" {...{ sortBy, sortDir, onSort: handleSort }} />
                    <th className="px-3 py-2.5 font-medium text-right">✓ App</th>
                    <th className="px-3 py-2.5 font-medium text-right">⏳ Pend</th>
                    <th className="px-3 py-2.5 font-medium text-right">✗ Den</th>
                    <SortableTh col="last_time_off_date" label="Last Off" {...{ sortBy, sortDir, onSort: handleSort }} />
                    <th className="px-3 py-2.5 font-medium">Next Off</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.driverId}
                      className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                      data-testid={`report-row-${row.driverId}`}>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs">
                        {row.rank === 1 ? <Trophy className="h-3.5 w-3.5 text-amber-500" /> : row.rank}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link href={`/drivers/${row.driverId}?tab=scheduling`}>
                          <span className="font-medium hover:underline cursor-pointer text-primary flex items-center gap-1">
                            {row.driverName}
                            <ExternalLink className="h-3 w-3 opacity-50" />
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        {row.driverStatus ? (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium capitalize ${STATUS_COLORS[row.driverStatus] ?? "bg-muted text-muted-foreground"}`}>
                            {row.driverStatus}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs">{row.market ?? "—"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs">{row.driverType ?? "—"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs max-w-[120px] truncate" title={row.networks.join(", ")}>
                        {row.networks.join(", ") || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs max-w-[160px] truncate" title={row.accounts.join(", ")}>
                        {row.accounts.join(", ") || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs">
                        {row.driverClassification ? (
                          <Badge variant="outline" className="text-xs capitalize">
                            {row.driverClassification === "Independent Contractor" ? "IC" : row.driverClassification}
                          </Badge>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Badge variant="secondary" className="font-mono text-xs">{row.totalApprovedDays.toFixed(1)}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">
                        {row.totalApprovedHours != null ? row.totalApprovedHours.toFixed(1) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs">{row.totalRequests}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-green-600 dark:text-green-400">{row.approvedRequests}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-yellow-600 dark:text-yellow-400">{row.pendingRequests}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-red-600 dark:text-red-400">{row.deniedRequests}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmtDate(row.lastTimeOffDate)}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmtDate(row.nextTimeOffDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sortable Column Header ────────────────────────────────────────────────────

function SortableTh({
  col, label, sortBy, sortDir, onSort,
}: {
  col: string; label: string;
  sortBy: string; sortDir: SortDir;
  onSort: (col: string) => void;
}) {
  return (
    <th
      className="px-3 py-2.5 font-medium text-right cursor-pointer select-none hover:text-foreground"
      onClick={() => onSort(col)}
      data-testid={`th-sort-${col}`}
    >
      <span className="inline-flex items-center gap-1 justify-end">
        {label}
        <SortIcon col={col} sortBy={sortBy} sortDir={sortDir} />
      </span>
    </th>
  );
}
