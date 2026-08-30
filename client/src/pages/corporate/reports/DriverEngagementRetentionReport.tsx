/**
 * DH-002006 — Driver Engagement & Retention Report
 *
 * Phase 1: Shift-hours engagement (30/60/90-day rolling windows).
 * Architecture is forward-compatible with future Move metrics.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown, Download, Search,
  Users, TrendingDown, Clock, AlertCircle, ChevronRight,
  ExternalLink, Filter, RefreshCw,
} from "lucide-react";
import { exportToExcel } from "@/lib/excelExport";

// ── Types ─────────────────────────────────────────────────────────────────────

type EngagementStatus = "active" | "declining" | "no_recent_activity" | "never_worked";

interface EngagementRow {
  driver_id: string;
  driver_name: string;
  driver_status: string;
  driver_type: string | null;
  driver_classification: string | null;
  employment_type: string | null;
  network: string | null;
  account_id: string | null;
  account_name: string | null;
  hours_30d: number;
  hours_60d: number;
  hours_90d: number;
  last_shift_time: string | null;
  moves_30d: number;
  moves_60d: number;
  moves_90d: number;
  last_move_date: string | null;
  engagement_status: EngagementStatus;
}

interface ReportSummary {
  total: number;
  active: number;
  declining: number;
  no_recent_activity: number;
  never_worked: number;
}

interface ReportResponse {
  rows: EngagementRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: ReportSummary;
}

interface ShiftRow {
  shift_id: string;
  start_time: string;
  end_time: string | null;
  scheduled_minutes: number;
  scheduled_hours: number;
  status: string;
  notes: string | null;
  location_name: string | null;
  account_id: string | null;
  account_name: string | null;
  position_name: string | null;
}

interface FilterOptions {
  driverTypes: string[];
  classifications: string[];
  networks: string[];
  accounts: { id: string; name: string }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtHours(h: number): string {
  return h.toFixed(1);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

const ENGAGEMENT_LABELS: Record<EngagementStatus, string> = {
  active:             "Active",
  declining:          "Declining",
  no_recent_activity: "No Recent Activity",
  never_worked:       "Never Worked",
};

const ENGAGEMENT_BADGE: Record<EngagementStatus, string> = {
  active:             "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  declining:          "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  no_recent_activity: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  never_worked:       "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400",
};

// ── Sort hook ─────────────────────────────────────────────────────────────────

type SortKey =
  | "driver_name" | "driver_status" | "driver_type" | "classification"
  | "network" | "account_name" | "last_shift_time"
  | "hours_30d" | "hours_60d" | "hours_90d"
  | "moves_30d" | "moves_60d" | "moves_90d" | "last_move_date"
  | "engagement_status";

// Builds a Move List deep link for a driver over a rolling window.
// Uses the exact driverId filter (not name matching) and inclusive UTC calendar
// dates so results match the report's CURRENT_DATE-based (UTC) move windows.
function moveListUrl(driverId: string, windowDays: 30 | 60 | 90): string {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - windowDays);
  const iso = (d: Date) => d.toISOString().slice(0, 10); // UTC calendar date
  const p = new URLSearchParams({
    driverId,
    startDate: iso(start),
    endDate: iso(end),
    status: "completed",
  });
  return `/trips?${p.toString()}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DriverEngagementRetentionReport() {
  // Filters
  const [search, setSearch]               = useState("");
  const [driverStatus, setDriverStatus]   = useState("");
  const [driverType, setDriverType]       = useState("");
  const [classification, setClassification] = useState("");
  const [accountId, setAccountId]         = useState("");
  const [network, setNetwork]             = useState("");
  const [engagement, setEngagement]       = useState("");
  const [activeOnly, setActiveOnly]       = useState(true); // default operational view

  // Sorting
  const [sortKey, setSortKey]   = useState<SortKey>("driver_name");
  const [sortDir, setSortDir]   = useState<"asc" | "desc">("asc");

  // Drill-down dialog
  const [drillDriver, setDrillDriver] = useState<{ id: string; name: string } | null>(null);
  const [drillWindow, setDrillWindow] = useState<30 | 60 | 90>(30);

  // ── Build query params ───────────────────────────────────────────────────
  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (search)        p.set("search",        search);
    if (driverStatus)  p.set("driverStatus",  driverStatus);
    if (driverType)    p.set("driverType",    driverType);
    if (classification) p.set("classification", classification);
    if (accountId)     p.set("accountId",     accountId);
    if (network)       p.set("network",       network);
    if (engagement)    p.set("engagement",    engagement);
    if (activeOnly)    p.set("activeOnly",    "true");
    p.set("sortBy",   sortKey);
    p.set("sortDir",  sortDir);
    p.set("pageSize", "500");
    return p.toString();
  }, [search, driverStatus, driverType, classification, accountId, network, engagement, activeOnly, sortKey, sortDir]);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data, isLoading, isError, refetch } = useQuery<ReportResponse>({
    queryKey: [`/api/reports/driver-engagement?${params}`],
    throwOnError: false,
  });

  const { data: filterOptions } = useQuery<FilterOptions>({
    queryKey: ["/api/reports/driver-engagement/filter-options"],
    throwOnError: false,
    staleTime: 5 * 60 * 1000,
  });

  const { data: drillData, isLoading: drillLoading } = useQuery<{ shifts: ShiftRow[] }>({
    queryKey: [`/api/reports/driver-engagement/shifts/${drillDriver?.id}?window=${drillWindow}`],
    enabled: !!drillDriver,
    throwOnError: false,
  });

  // ── Derived ──────────────────────────────────────────────────────────────
  const rows    = data?.rows    ?? [];
  const summary = data?.summary ?? { total: 0, active: 0, declining: 0, no_recent_activity: 0, never_worked: 0 };

  // ── Sorting (client-side re-sort for instant UX within the current page) ─
  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      // Default: ascending for text/dates, descending for hours so lowest
      // engagement risk floats to top when clicking hours columns
      setSortDir(["hours_30d", "hours_60d", "hours_90d"].includes(key) ? "asc" : "asc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (col !== sortKey) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp   className="h-3 w-3 ml-1 text-primary" />
      : <ArrowDown className="h-3 w-3 ml-1 text-primary" />;
  }

  function Th({ label, col, className }: { label: string; col: SortKey; className?: string }) {
    return (
      <TableHead
        className={`bg-card cursor-pointer select-none whitespace-nowrap ${className ?? ""}`}
        onClick={() => handleSort(col)}
      >
        <span className="inline-flex items-center gap-0.5">
          {label}<SortIcon col={col} />
        </span>
      </TableHead>
    );
  }

  // ── Export ───────────────────────────────────────────────────────────────
  function handleExport() {
    exportToExcel(
      rows.map(r => ({
        driver_name:        r.driver_name,
        driver_status:      r.driver_status,
        driver_type:        r.driver_type ?? "",
        classification:     r.driver_classification ?? "",
        employment_type:    r.employment_type ?? "",
        network:            r.network ?? "",
        account_name:       r.account_name ?? "",
        last_shift_worked:  r.last_shift_time ? fmtDate(r.last_shift_time) : "",
        hours_30d:          r.hours_30d,
        hours_60d:          r.hours_60d,
        hours_90d:          r.hours_90d,
        moves_30d:          r.moves_30d,
        moves_60d:          r.moves_60d,
        moves_90d:          r.moves_90d,
        last_move_date:     r.last_move_date ? fmtDate(r.last_move_date) : "",
        engagement_status:  ENGAGEMENT_LABELS[r.engagement_status] ?? r.engagement_status,
      })),
      [
        { header: "Driver Name",         key: "driver_name",       width: 22 },
        { header: "Driver Status",        key: "driver_status",     width: 14 },
        { header: "Driver Type",          key: "driver_type",       width: 14 },
        { header: "Classification",       key: "classification",    width: 22 },
        { header: "Employment Type",      key: "employment_type",   width: 18 },
        { header: "Network",              key: "network",           width: 16 },
        { header: "Primary Account",      key: "account_name",      width: 24 },
        { header: "Last Shift Worked",    key: "last_shift_worked", width: 16 },
        { header: "30-Day Shift Hours",   key: "hours_30d",         width: 16 },
        { header: "60-Day Shift Hours",   key: "hours_60d",         width: 16 },
        { header: "90-Day Shift Hours",   key: "hours_90d",         width: 16 },
        { header: "30-Day Moves",         key: "moves_30d",         width: 14 },
        { header: "60-Day Moves",         key: "moves_60d",         width: 14 },
        { header: "90-Day Moves",         key: "moves_90d",         width: 14 },
        { header: "Last Move Completed",  key: "last_move_date",    width: 18 },
        { header: "Engagement",           key: "engagement_status", width: 20 },
      ],
      "driver_engagement_retention.xlsx"
    );
  }

  // ── Open drill-down ──────────────────────────────────────────────────────
  function openDrill(row: EngagementRow, window: 30 | 60 | 90) {
    setDrillDriver({ id: row.driver_id, name: row.driver_name });
    setDrillWindow(window);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <TooltipProvider>
      <div className="space-y-5 pt-4 sm:pt-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/reports">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold leading-tight" data-testid="text-page-title">
                Driver Engagement &amp; Retention
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Shift hours + completed Moves (30 / 60 / 90-day rolling windows).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={rows.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export
            </Button>
          </div>
        </div>

        {/* ── Summary KPI Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
            ))
          ) : (
            <>
              <SummaryCard label="Total Drivers"       value={summary.total}              icon={<Users className="h-4 w-4 text-muted-foreground" />} onClick={() => setEngagement("")} selected={!engagement} />
              <SummaryCard label="Active"              value={summary.active}             highlight="green" onClick={() => setEngagement(e => e === "active" ? "" : "active")} selected={engagement === "active"} />
              <SummaryCard label="Declining"           value={summary.declining}          highlight="amber" onClick={() => setEngagement(e => e === "declining" ? "" : "declining")} selected={engagement === "declining"} />
              <SummaryCard label="No Recent Activity"  value={summary.no_recent_activity} highlight="red" onClick={() => setEngagement(e => e === "no_recent_activity" ? "" : "no_recent_activity")} selected={engagement === "no_recent_activity"} />
              <SummaryCard label="Never Worked"        value={summary.never_worked}       highlight="slate" onClick={() => setEngagement(e => e === "never_worked" ? "" : "never_worked")} selected={engagement === "never_worked"} />
            </>
          )}
        </div>

        {/* ── Filter Bar ── */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              {/* Search */}
              <div className="space-y-1 min-w-[180px]">
                <Label className="text-xs">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-8 h-8 text-sm"
                    placeholder="Driver name…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Engagement */}
              <FilterSelect label="Engagement" value={engagement} onChange={setEngagement} placeholder="All statuses">
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="declining">Declining</SelectItem>
                <SelectItem value="no_recent_activity">No Recent Activity</SelectItem>
                <SelectItem value="never_worked">Never Worked</SelectItem>
              </FilterSelect>

              {/* Driver Status */}
              <FilterSelect label="Driver Status" value={driverStatus} onChange={setDriverStatus} placeholder="All statuses">
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </FilterSelect>

              {/* Driver Type */}
              <FilterSelect label="Driver Type" value={driverType} onChange={setDriverType} placeholder="All types">
                {(filterOptions?.driverTypes ?? []).filter(t => !!t).map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </FilterSelect>

              {/* Classification */}
              <FilterSelect label="Classification" value={classification} onChange={setClassification} placeholder="All">
                {(filterOptions?.classifications ?? []).filter(c => !!c).map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </FilterSelect>

              {/* Network */}
              <FilterSelect label="Network" value={network} onChange={setNetwork} placeholder="All Networks">
                {(filterOptions?.networks ?? []).filter(n => !!n).map(n => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </FilterSelect>

              {/* Account */}
              <FilterSelect label="Account" value={accountId} onChange={setAccountId} placeholder="All accounts">
                {(filterOptions?.accounts ?? []).filter(a => !!a.id).map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </FilterSelect>

              {/* Active Only toggle */}
              <div className="flex items-center gap-2 pb-0.5">
                <input
                  id="active-only"
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 accent-primary"
                  checked={activeOnly}
                  onChange={e => setActiveOnly(e.target.checked)}
                />
                <Label htmlFor="active-only" className="text-xs cursor-pointer whitespace-nowrap">
                  Active drivers only
                </Label>
              </div>

              {/* Clear */}
              {(search || driverStatus || driverType || classification || accountId || network || engagement) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-8"
                  onClick={() => {
                    setSearch(""); setDriverStatus(""); setDriverType("");
                    setClassification(""); setAccountId(""); setNetwork(""); setEngagement("");
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Table ── */}
        {isError && (
          <div className="flex items-center gap-2 text-destructive text-sm p-4 border border-destructive/30 rounded-md bg-destructive/5">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Failed to load report data. Check your network connection and try refreshing.
          </div>
        )}

        {isLoading ? (
          <Card>
            <CardContent className="p-0">
              <div className="space-y-0">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex gap-4 px-4 py-3 border-b last:border-0">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-14" />
                    <Skeleton className="h-4 w-14" />
                    <Skeleton className="h-4 w-14" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="px-4 py-3 border-b">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Filter className="h-3.5 w-3.5" />
                {rows.length.toLocaleString()} driver{rows.length !== 1 ? "s" : ""} shown
                {data?.total && data.total > rows.length
                  ? ` (of ${data.total.toLocaleString()} matching)`
                  : ""}
              </CardTitle>
            </CardHeader>
            {/* The application shell's <main> is the actual scroll container.
                This must remain a native table: the shared Table component adds
                an overflow wrapper, which would become the sticky containing
                block even though it does not scroll vertically. */}
            <CardContent className="p-0">
              <table className="w-full min-w-max caption-bottom text-sm">
                <TableHeader className="sticky top-0 z-30 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                  <TableRow className="text-xs bg-card">
                    <Th label="Driver"           col="driver_name"    />
                    <Th label="Status"           col="driver_status"  />
                    <Th label="Type"             col="driver_type"    />
                    <Th label="Classification"   col="classification" />
                    <Th label="Network"          col="network"        />
                    <Th label="Primary Account"  col="account_name"   />
                    <Th label="Last Shift"        col="last_shift_time" />
                    <Th label="30-Day Hrs"        col="hours_30d"      className="text-right" />
                    <Th label="60-Day Hrs"        col="hours_60d"      className="text-right" />
                    <Th label="90-Day Hrs"        col="hours_90d"      className="text-right" />
                    <Th label="30-Day Moves"      col="moves_30d"      className="text-right" />
                    <Th label="60-Day Moves"      col="moves_60d"      className="text-right" />
                    <Th label="90-Day Moves"      col="moves_90d"      className="text-right" />
                    <Th label="Last Move"         col="last_move_date" />
                    <Th label="Engagement"        col="engagement_status" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={15} className="text-center py-12 text-muted-foreground text-sm">
                        No drivers match the current filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map(row => (
                      <TableRow key={row.driver_id} className="text-sm">
                        {/* Driver Name — links to Driver Detail */}
                        <TableCell className="font-medium whitespace-nowrap">
                          <a
                            href={`/drivers/${row.driver_id}`}
                            className="text-primary hover:underline inline-flex items-center gap-1"
                          >
                            {row.driver_name}
                            <ExternalLink className="h-3 w-3 opacity-50" />
                          </a>
                        </TableCell>

                        <TableCell>
                          <StatusDot status={row.driver_status} />
                        </TableCell>

                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {row.driver_type ?? "—"}
                        </TableCell>

                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {row.driver_classification ?? "—"}
                        </TableCell>

                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {row.network ?? "—"}
                        </TableCell>

                        <TableCell className="text-muted-foreground whitespace-nowrap max-w-[160px] truncate">
                          {row.account_name
                            ? <Tooltip>
                                <TooltipTrigger asChild>
                                  <a href={`/customers/${row.account_id}`} className="text-primary hover:underline truncate block max-w-[160px]">
                                    {row.account_name}
                                  </a>
                                </TooltipTrigger>
                                <TooltipContent>{row.account_name}</TooltipContent>
                              </Tooltip>
                            : "—"}
                        </TableCell>

                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {fmtDate(row.last_shift_time)}
                        </TableCell>

                        {/* Hours cells — clickable drill-down */}
                        <HoursCell value={row.hours_30d} onClick={() => openDrill(row, 30)} />
                        <HoursCell value={row.hours_60d} onClick={() => openDrill(row, 60)} />
                        <HoursCell value={row.hours_90d} onClick={() => openDrill(row, 90)} />

                        {/* Move counts — deep-link to Move List filtered to this driver/window */}
                        <MovesCell count={row.moves_30d} href={moveListUrl(row.driver_id, 30)} />
                        <MovesCell count={row.moves_60d} href={moveListUrl(row.driver_id, 60)} />
                        <MovesCell count={row.moves_90d} href={moveListUrl(row.driver_id, 90)} />

                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {fmtDate(row.last_move_date)}
                        </TableCell>

                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ENGAGEMENT_BADGE[row.engagement_status]}`}>
                            {ENGAGEMENT_LABELS[row.engagement_status]}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </table>
            </CardContent>
          </Card>
        )}

        {/* ── Engagement Classification Legend ── */}
        <div className="text-xs text-muted-foreground flex flex-wrap gap-4 px-1">
          <span><span className="font-medium text-green-700 dark:text-green-400">Active</span> — shift hours or completed Moves in the last 30 days</span>
          <span><span className="font-medium text-amber-700 dark:text-amber-400">Declining</span> — no activity in 30 days but shift or Move activity in last 90 days</span>
          <span><span className="font-medium text-red-700 dark:text-red-400">No Recent Activity</span> — last shift or Move &gt; 90 days ago</span>
          <span><span className="font-medium text-slate-600 dark:text-slate-400">Never Worked</span> — no shifts or completed Moves on record</span>
        </div>

        {/* ── Shift Drill-Down Dialog ── */}
        <Dialog open={!!drillDriver} onOpenChange={open => { if (!open) setDrillDriver(null); }}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Shift Detail — {drillDriver?.name}</DialogTitle>
              <DialogDescription>
                Qualifying shifts within the last {drillWindow} days. Hours are based on
                non-cancelled, non-deleted shifts with scheduled minutes recorded.
              </DialogDescription>
            </DialogHeader>

            {/* Window selector */}
            <div className="flex items-center gap-2 border-b pb-3">
              {([30, 60, 90] as const).map(w => (
                <Button
                  key={w}
                  variant={drillWindow === w ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setDrillWindow(w)}
                >
                  {w} Days
                </Button>
              ))}
              {drillData?.shifts && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {drillData.shifts.length} shift{drillData.shifts.length !== 1 ? "s" : ""} &nbsp;·&nbsp;
                  {fmtHours(drillData.shifts.reduce((s, r) => s + r.scheduled_hours, 0))} total hrs
                </span>
              )}
            </div>

            <div className="overflow-y-auto flex-1">
              {drillLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : !drillData?.shifts?.length ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No qualifying shifts in the last {drillWindow} days.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead>Date</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>End</TableHead>
                      <TableHead className="text-right">Hrs</TableHead>
                      <TableHead>Location / Account</TableHead>
                      <TableHead>Position</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drillData.shifts.map(s => (
                      <TableRow key={s.shift_id} className="text-xs">
                        <TableCell className="whitespace-nowrap font-medium">
                          {fmtDate(s.start_time)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {new Date(s.start_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {s.end_time
                            ? new Date(s.end_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {fmtHours(s.scheduled_hours)}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate" title={s.account_name ?? s.location_name ?? undefined}>
                          {s.account_name ?? s.location_name ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {s.position_name ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Link to Driver Detail */}
            {drillDriver && (
              <div className="border-t pt-3 flex justify-end">
                <a href={`/drivers/${drillDriver.id}`} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                  View Full Driver Record <ChevronRight className="h-3 w-3" />
                </a>
              </div>
            )}
          </DialogContent>
        </Dialog>

      </div>
    </TooltipProvider>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, highlight, icon, onClick, selected = false,
}: {
  label: string;
  value: number;
  highlight?: "green" | "amber" | "red" | "slate";
  icon?: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
}) {
  const valueClass = {
    green: "text-green-700 dark:text-green-400",
    amber: "text-amber-700 dark:text-amber-400",
    red:   "text-red-700 dark:text-red-400",
    slate: "text-slate-600 dark:text-slate-400",
    undefined: "text-foreground",
  }[highlight ?? "undefined"];

  const card = (
    <Card className={selected ? "border-primary" : undefined}>
      <CardContent className="p-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground leading-tight">{label}</p>
          <div className="flex items-center gap-2">
            {icon}
            <p className={`text-2xl font-bold tabular-nums ${valueClass}`}>{value.toLocaleString()}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (!onClick) return card;

  return (
    <button
      type="button"
      className="w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={onClick}
      aria-pressed={selected}
    >
      {card}
    </button>
  );
}

function StatusDot({ status }: { status: string }) {
  const dot: Record<string, string> = {
    active:    "bg-green-500",
    inactive:  "bg-slate-400",
    suspended: "bg-amber-500",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs capitalize">
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dot[status] ?? "bg-slate-300"}`} />
      {status}
    </span>
  );
}

function HoursCell({ value, onClick }: { value: number; onClick: () => void }) {
  if (value === 0) {
    return <TableCell className="text-right text-muted-foreground">0.0</TableCell>;
  }
  return (
    <TableCell className="text-right">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="text-primary hover:underline font-mono text-sm tabular-nums"
            onClick={onClick}
          >
            {fmtHours(value)}
          </button>
        </TooltipTrigger>
        <TooltipContent>Click to see underlying shifts</TooltipContent>
      </Tooltip>
    </TableCell>
  );
}

function MovesCell({ count, href }: { count: number; href: string }) {
  if (!count) {
    return <TableCell className="text-right text-muted-foreground">0</TableCell>;
  }
  return (
    <TableCell className="text-right">
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={href}
            className="text-primary hover:underline font-mono text-sm tabular-nums"
          >
            {count.toLocaleString()}
          </a>
        </TooltipTrigger>
        <TooltipContent>Open these moves in the Move List</TooltipContent>
      </Tooltip>
    </TableCell>
  );
}

function FilterSelect({
  label, value, onChange, placeholder, children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1 min-w-[140px]">
      <Label className="text-xs">{label}</Label>
      <Select value={value || "__all__"} onValueChange={v => onChange(v === "__all__" ? "" : v)}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">{placeholder}</SelectItem>
          {children}
        </SelectContent>
      </Select>
    </div>
  );
}
