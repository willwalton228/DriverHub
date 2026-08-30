/**
 * Feature 3.1 — Move Reporting Framework
 * Route: /reports/moves
 *
 * Server-side aggregation only — no Move dataset is loaded into the browser
 * or aggregated in Node. Drilldowns open the existing Move List workspace.
 * Two export paths: Export Summary (active breakdown tab) and
 * Export Move Detail (underlying filtered trip population, max 5,000).
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { exportToExcel } from "@/lib/excelExport";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Info, Download, Save, BookOpen, Trash2, ExternalLink,
  ChevronDown, Filter, RefreshCw, Truck,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ReportFilters {
  startDate: string; endDate: string; status: string; moveType: string;
  sourceSystem: string; customerId: string; driverId: string;
  exceptions: boolean; hasDriverReturns: boolean; granularity: "day" | "week" | "month";
}
interface AggSummary {
  total: number; completed: number; cancelled: number; exceptionCount: number;
  completionRate: number | null; avgMiles: number | null; avgDriveTime: number | null;
  drCount: number; drCharges: number;
}
interface AggData {
  summary: AggSummary;
  byAccount: { customerId: string | null; customerName: string | null; total: number; completed: number; drCount: number; drCharges: number }[];
  byDriver:  { driverId: string | null;  driverName: string | null;  total: number; completed: number; drCount: number; drCharges: number }[];
  byMoveType: { moveType: string | null; total: number; completed: number }[];
  bySource:   { sourceSystem: string | null; total: number; completed: number }[];
  byDate:     { dateBucket: string; total: number; completed: number }[];
}
interface SavedView { id: string; name: string; filters: Record<string, unknown> }

// ── Format helpers ────────────────────────────────────────────────────────────
const fmtN  = (v: unknown) => (Number(v) || 0).toLocaleString();
const fmtPct = (v: unknown) => v == null ? "—" : `${Number(v).toFixed(1)}%`;
const fmtMi  = (v: unknown) => v == null ? "—" : `${Number(v).toFixed(1)} mi`;
const fmtMin = (v: unknown) => {
  if (v == null) return "—";
  const m = Number(v);
  return m < 60 ? `${m.toFixed(0)}m` : `${(m / 60).toFixed(1)}h`;
};
const fmt$ = (v: unknown) =>
  Number(v ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

function defaultRange() {
  const end   = new Date();
  const start = new Date(); start.setDate(end.getDate() - 90);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function filtersToParams(f: ReportFilters) {
  const p = new URLSearchParams();
  if (f.startDate)       p.set("startDate",       f.startDate);
  if (f.endDate)         p.set("endDate",          f.endDate);
  if (f.status)          p.set("status",           f.status);
  if (f.moveType)        p.set("moveType",         f.moveType);
  if (f.sourceSystem)    p.set("sourceSystem",     f.sourceSystem);
  if (f.customerId)      p.set("customerId",       f.customerId);
  if (f.driverId)        p.set("driverId",         f.driverId);
  if (f.exceptions)      p.set("exceptions",       "true");
  if (f.hasDriverReturns) p.set("hasDriverReturns","true");
  if (f.granularity !== "day") p.set("granularity", f.granularity);
  return p;
}

function filtersFromSearch(search: string): Partial<ReportFilters> {
  const p = new URLSearchParams(search);
  const out: Partial<ReportFilters> = {};
  if (p.get("startDate"))       out.startDate       = p.get("startDate")!;
  if (p.get("endDate"))         out.endDate         = p.get("endDate")!;
  if (p.get("status"))          out.status          = p.get("status")!;
  if (p.get("moveType"))        out.moveType        = p.get("moveType")!;
  if (p.get("sourceSystem"))    out.sourceSystem    = p.get("sourceSystem")!;
  if (p.get("customerId"))      out.customerId      = p.get("customerId")!;
  if (p.get("driverId"))        out.driverId        = p.get("driverId")!;
  if (p.get("exceptions") === "true")      out.exceptions      = true;
  if (p.get("hasDriverReturns") === "true") out.hasDriverReturns = true;
  if (p.get("granularity"))     out.granularity     = p.get("granularity") as any;
  return out;
}

// ── KPI Info ──────────────────────────────────────────────────────────────────
const INFO: Record<string, { definition: string; calculation: string; source: string; howToUse: string }> = {
  total: {
    definition: "Total number of Moves within the selected filters and date range.",
    calculation: "COUNT(*) on trips with applied filters.",
    source: "DriverHub trips",
    howToUse: "Use as the denominator when evaluating rates. Drill in to see all matching Moves.",
  },
  completed: {
    definition: "Moves with a status of 'completed'.",
    calculation: "COUNT(*) FILTER (WHERE status = 'completed').",
    source: "DriverHub trips",
    howToUse: "Track delivery execution. Drill in to inspect completed Moves.",
  },
  cancelled: {
    definition: "Moves with a status of 'cancelled'.",
    calculation: "COUNT(*) FILTER (WHERE status = 'cancelled').",
    source: "DriverHub trips",
    howToUse: "Elevated cancellations may signal scheduling or driver availability issues.",
  },
  exception: {
    definition: "Moves that failed an eligibility check.",
    calculation: "COUNT(*) where eligibility_status ≠ 'PASS' and eligibility_checked_at is not null.",
    source: "DriverHub eligibility engine",
    howToUse: "Drill in to review which Moves failed and why.",
  },
  completionRate: {
    definition: "Percentage of Moves that were completed.",
    calculation: "Completed ÷ Total × 100.",
    source: "DriverHub trips",
    howToUse: "Benchmark against team targets. Low rates warrant investigation of cancellations and exceptions.",
  },
  avgMiles: {
    definition: "Average distance per Move in the filtered population.",
    calculation: "AVG(distance) excluding zero-mile records.",
    source: "DriverHub trips.distance",
    howToUse: "Establish routing baselines. Unusually high averages may indicate dispatch inefficiency.",
  },
  avgDriveTime: {
    definition: "Average drive time per Move, in minutes.",
    calculation: "AVG(duration) excluding zero-duration records.",
    source: "DriverHub trips.duration",
    howToUse: "Compare against mileage to identify congestion or routing issues.",
  },
  drCount: {
    definition: "Number of DriverReturn records linked to Moves in the filtered population. Multiple DRs per Move are each counted.",
    calculation: "COUNT of driver_return_entries rows where linked_trip_id matches a filtered Move.",
    source: "driver_return_entries",
    howToUse: "DriverReturns indicate ancillary driver activity. Elevated counts may require resource planning.",
  },
  drCharges: {
    definition: "Total DriverReturn charges for DRs linked to Moves in the filtered population.",
    calculation: "SUM(driver_return_entries.customer_total) for all linked entries. Not a Move-level field.",
    source: "driver_return_entries.customer_total",
    howToUse: "Reconcile DriverReturn billings against Move revenue.",
  },
};

// ── InfoTip ───────────────────────────────────────────────────────────────────
function InfoTip({ id }: { id: string }) {
  const info = INFO[id];
  if (!info) return null;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="text-muted-foreground/50 hover:text-muted-foreground transition-colors" aria-label={`Info: ${id}`}>
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-left p-3 space-y-2">
          {(["definition", "calculation", "source", "howToUse"] as const).map(k => (
            <div key={k}>
              <p className="text-xs font-semibold capitalize">{k === "howToUse" ? "How to Use" : k === "source" ? "Data Source" : k.charAt(0).toUpperCase() + k.slice(1)}</p>
              <p className="text-xs text-muted-foreground">{info[k]}</p>
            </div>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── KpiCard ───────────────────────────────────────────────────────────────────
function KpiCard({ title, value, sub, infoId, drillHref, isLoading }: {
  title: string; value: string; sub?: string; infoId: string; drillHref?: string; isLoading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-1 pt-3 px-4 flex flex-row items-start justify-between gap-1">
        <CardTitle className="text-xs font-medium text-muted-foreground leading-tight">{title}</CardTitle>
        <InfoTip id={infoId} />
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {isLoading
          ? <Skeleton className="h-7 w-20" />
          : (
            <>
              <div className="text-2xl font-bold">{value}</div>
              {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
              {drillHref && (
                <a href={drillHref} className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-0.5">
                  View Moves <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </>
          )}
      </CardContent>
    </Card>
  );
}

// ── BreakdownTable ─────────────────────────────────────────────────────────────
function BreakdownTable<T>({ isLoading, rows, cols, empty }: {
  isLoading: boolean;
  rows: T[];
  cols: { header: string; cell: (r: T) => React.ReactNode }[];
  empty: string;
}) {
  if (isLoading) {
    return (
      <Card><CardContent className="p-0">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-2.5 border-b last:border-0">
            {[...Array(cols.length)].map((_, j) => <Skeleton key={j} className="h-4 flex-1" />)}
          </div>
        ))}
      </CardContent></Card>
    );
  }
  if (!rows.length) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{empty}</CardContent></Card>;
  }
  return (
    <Card><CardContent className="p-0 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>{cols.map((c, i) => <TableHead key={i} className="text-xs">{c.header}</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, ri) => (
            <TableRow key={ri} className="hover:bg-muted/30">
              {cols.map((c, ci) => <TableCell key={ci} className="text-sm py-2">{c.cell(row)}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function MovesReport() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const dr = defaultRange();
  const urlFilters = filtersFromSearch(typeof window !== "undefined" ? window.location.search : "");

  const [startDate,        setStartDate]        = useState(urlFilters.startDate        ?? dr.start);
  const [endDate,          setEndDate]          = useState(urlFilters.endDate          ?? dr.end);
  const [status,           setStatus]           = useState(urlFilters.status           ?? "");
  const [moveType,         setMoveType]         = useState(urlFilters.moveType         ?? "");
  const [sourceSystem,     setSourceSystem]     = useState(urlFilters.sourceSystem     ?? "");
  const [customerId,       setCustomerId]       = useState(urlFilters.customerId       ?? "");
  const [driverId,         setDriverId]         = useState(urlFilters.driverId         ?? "");
  const [exceptions,       setExceptions]       = useState(urlFilters.exceptions       ?? false);
  const [hasDriverReturns, setHasDriverReturns] = useState(urlFilters.hasDriverReturns ?? false);
  const [granularity,      setGranularity]      = useState<"day"|"week"|"month">(urlFilters.granularity ?? "day");
  const [filtersOpen,      setFiltersOpen]      = useState(true);
  const [activeTab,        setActiveTab]        = useState("account");
  const [savePopover,      setSavePopover]      = useState(false);
  const [viewsPopover,     setViewsPopover]     = useState(false);
  const [saveName,         setSaveName]         = useState("");

  const filters: ReportFilters = {
    startDate, endDate, status, moveType, sourceSystem, customerId, driverId,
    exceptions, hasDriverReturns, granularity,
  };

  // Sync filters to URL
  useEffect(() => {
    const params = filtersToParams(filters);
    const qs = params.toString();
    const cur = typeof window !== "undefined" ? window.location.search.slice(1) : "";
    if (qs !== cur) window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  });

  const qp = filtersToParams(filters);

  const { data, isLoading, error, refetch } = useQuery<AggData>({
    queryKey: ["/api/corporate/trips/report-aggregates", startDate, endDate, status, moveType, sourceSystem, customerId, driverId, exceptions, hasDriverReturns, granularity],
    queryFn:  () => apiRequest("GET", `/api/corporate/trips/report-aggregates?${qp.toString()}`).then(r => r.json()),
    staleTime: 60_000,
  });

  const { data: savedViews = [] } = useQuery<SavedView[]>({
    queryKey: ["/api/corporate/moves/report-views"],
    queryFn:  () => apiRequest("GET", "/api/corporate/moves/report-views").then(r => r.json()),
  });

  const saveMut = useMutation({
    mutationFn: (v: { name: string; filters: Record<string, unknown> }) =>
      apiRequest("POST", "/api/corporate/moves/report-views", v),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/moves/report-views"] });
      setSavePopover(false); setSaveName("");
      toast({ title: "View saved" });
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/corporate/moves/report-views/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/moves/report-views"] });
      toast({ title: "View deleted" });
    },
  });

  function drillLink(extra: Record<string, string> = {}) {
    const p = new URLSearchParams();
    if (startDate)       p.set("startDate",        startDate);
    if (endDate)         p.set("endDate",           endDate);
    if (status)          p.set("status",            status);
    if (moveType)        p.set("moveType",          moveType);
    if (sourceSystem)    p.set("sourceSystem",      sourceSystem);
    if (customerId)      p.set("customerId",        customerId);
    if (driverId)        p.set("driverId",          driverId);
    if (exceptions)      p.set("exceptions",        "true");
    if (hasDriverReturns) p.set("hasDriverReturns", "true");
    Object.entries(extra).forEach(([k, v]) => p.set(k, v));
    return `/trips?${p.toString()}`;
  }

  function pct(completed: number, total: number) {
    return total > 0 ? `${((completed / total) * 100).toFixed(1)}%` : "—";
  }

  function handleExportSummary() {
    if (!data) return;
    const specs: Record<string, { rows: any[]; cols: { key: string; header: string; width?: number }[] }> = {
      account: {
        rows: data.byAccount.map(r => ({ account: r.customerName ?? "(No Account)", total: r.total, completed: r.completed, rate: pct(r.completed, r.total), dr_count: r.drCount, dr_charges: Number(r.drCharges).toFixed(2) })),
        cols: [{ key:"account",header:"Account",width:30 },{ key:"total",header:"Total Moves",width:14 },{ key:"completed",header:"Completed",width:14 },{ key:"rate",header:"Completion Rate",width:16 },{ key:"dr_count",header:"DR Count",width:12 },{ key:"dr_charges",header:"DR Charges ($)",width:16 }],
      },
      driver: {
        rows: data.byDriver.map(r => ({ driver: r.driverName ?? "(No Driver)", total: r.total, completed: r.completed, rate: pct(r.completed, r.total), dr_count: r.drCount, dr_charges: Number(r.drCharges).toFixed(2) })),
        cols: [{ key:"driver",header:"Driver",width:25 },{ key:"total",header:"Total Moves",width:14 },{ key:"completed",header:"Completed",width:14 },{ key:"rate",header:"Completion Rate",width:16 },{ key:"dr_count",header:"DR Count",width:12 },{ key:"dr_charges",header:"DR Charges ($)",width:16 }],
      },
      type: {
        rows: data.byMoveType.map(r => ({ move_type: r.moveType ?? "(Unknown)", total: r.total, completed: r.completed, rate: pct(r.completed, r.total) })),
        cols: [{ key:"move_type",header:"Move Type",width:20 },{ key:"total",header:"Total Moves",width:14 },{ key:"completed",header:"Completed",width:14 },{ key:"rate",header:"Completion Rate",width:16 }],
      },
      source: {
        rows: data.bySource.map(r => ({ source: r.sourceSystem ?? "(Unknown)", total: r.total, completed: r.completed, rate: pct(r.completed, r.total) })),
        cols: [{ key:"source",header:"Source System",width:20 },{ key:"total",header:"Total Moves",width:14 },{ key:"completed",header:"Completed",width:14 },{ key:"rate",header:"Completion Rate",width:16 }],
      },
      date: {
        rows: data.byDate.map(r => ({ date: r.dateBucket, total: r.total, completed: r.completed, rate: pct(r.completed, r.total) })),
        cols: [{ key:"date",header:"Date",width:14 },{ key:"total",header:"Total Moves",width:14 },{ key:"completed",header:"Completed",width:14 },{ key:"rate",header:"Completion Rate",width:16 }],
      },
    };
    const spec = specs[activeTab];
    if (spec) exportToExcel(spec.rows, spec.cols, `move-report-${activeTab}`);
  }

  async function handleExportMoveDetail() {
    try {
      const ep = new URLSearchParams();
      if (startDate)       ep.set("startDate",       startDate);
      if (endDate)         ep.set("endDate",          endDate);
      if (status)          ep.set("status",           status);
      if (moveType)        ep.set("moveType",         moveType);
      if (sourceSystem)    ep.set("sourceSystem",     sourceSystem);
      if (customerId)      ep.set("customerId",       customerId);
      if (driverId)        ep.set("driverId",         driverId);
      if (exceptions)      ep.set("exceptions",       "true");
      if (hasDriverReturns) ep.set("hasDriverReturns","true");
      const result = await apiRequest("GET", `/api/corporate/trips/export?${ep.toString()}`).then(r => r.json());
      const rows = (result.trips ?? []).map((t: any) => ({
        move_number: t.moveNumber ?? "", status: t.status ?? "", move_type: t.moveType ?? "",
        trip_date: t.tripDate ? new Date(t.tripDate).toLocaleDateString() : "",
        driver: t.driverName ?? "", account: t.customerName ?? "",
        source: t.sourceSystem ?? "", distance: t.distance ?? "", duration: t.duration ?? "",
      }));
      exportToExcel(rows, [
        { key:"move_number",header:"Move #",width:14 }, { key:"status",header:"Status",width:12 },
        { key:"move_type",header:"Move Type",width:18 }, { key:"trip_date",header:"Date",width:14 },
        { key:"driver",header:"Driver",width:22 }, { key:"account",header:"Account",width:28 },
        { key:"source",header:"Source",width:14 }, { key:"distance",header:"Miles",width:10 },
        { key:"duration",header:"Duration (min)",width:16 },
      ], "move-detail");
      toast({ title: `Exported ${rows.length} moves` });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  }

  function loadView(v: SavedView) {
    const f = v.filters as any;
    if (f.startDate)       setStartDate(f.startDate);
    if (f.endDate)         setEndDate(f.endDate);
    setStatus(f.status ?? "");
    setMoveType(f.moveType ?? "");
    setSourceSystem(f.sourceSystem ?? "");
    setCustomerId(f.customerId ?? "");
    setDriverId(f.driverId ?? "");
    setExceptions(f.exceptions ?? false);
    setHasDriverReturns(f.hasDriverReturns ?? false);
    setGranularity(f.granularity ?? "day");
    setViewsPopover(false);
  }

  function resetFilters() {
    const r = defaultRange();
    setStartDate(r.start); setEndDate(r.end);
    setStatus(""); setMoveType(""); setSourceSystem("");
    setCustomerId(""); setDriverId("");
    setExceptions(false); setHasDriverReturns(false);
  }

  const s = data?.summary;

  return (
    <div className="p-6 space-y-6 max-w-[1600px]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Move Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Aggregate Move analysis. Click any metric or breakdown row to drill into the Move workspace.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Saved views */}
          <Popover open={viewsPopover} onOpenChange={setViewsPopover}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <BookOpen className="h-3.5 w-3.5" /> Saved Views
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="end">
              {savedViews.length === 0
                ? <p className="text-sm text-muted-foreground text-center py-3">No saved report views yet.</p>
                : (
                  <div className="space-y-0.5">
                    {savedViews.map(v => (
                      <div key={v.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/50">
                        <button className="text-sm flex-1 text-left" onClick={() => loadView(v)}>{v.name}</button>
                        <button className="text-muted-foreground hover:text-destructive" onClick={() => delMut.mutate(v.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
            </PopoverContent>
          </Popover>

          {/* Save current filters */}
          <Popover open={savePopover} onOpenChange={setSavePopover}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5"><Save className="h-3.5 w-3.5" /> Save View</Button>
            </PopoverTrigger>
            <PopoverContent className="w-60 p-3" align="end">
              <div className="space-y-2">
                <Label className="text-sm">View name</Label>
                <Input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="e.g. Q1 Exceptions"
                  onKeyDown={e => { if (e.key === "Enter" && saveName.trim()) saveMut.mutate({ name: saveName.trim(), filters: filters as any }); }} />
                <Button size="sm" className="w-full" disabled={!saveName.trim() || saveMut.isPending}
                  onClick={() => saveMut.mutate({ name: saveName.trim(), filters: filters as any })}>
                  {saveMut.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportSummary} disabled={!data}>
            <Download className="h-3.5 w-3.5" /> Export Summary
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportMoveDetail}>
            <Download className="h-3.5 w-3.5" /> Export Moves
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Filter Panel */}
      <Card>
        <CardHeader className="pb-2 pt-3 cursor-pointer" onClick={() => setFiltersOpen(o => !o)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" /> Filters
            </CardTitle>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${filtersOpen ? "" : "-rotate-90"}`} />
          </div>
        </CardHeader>
        {filtersOpen && (
          <CardContent className="pt-0 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">End Date</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={status || "_all"} onValueChange={v => setStatus(v === "_all" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Statuses</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Move Type</Label>
              <Input value={moveType} onChange={e => setMoveType(e.target.value)} placeholder="Any" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Source System</Label>
              <Select value={sourceSystem || "_all"} onValueChange={v => setSourceSystem(v === "_all" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Sources</SelectItem>
                  <SelectItem value="redcap">RedCap</SelectItem>
                  <SelectItem value="uber">Uber</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Account ID</Label>
              <Input value={customerId} onChange={e => setCustomerId(e.target.value)} placeholder="Customer ID" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Driver ID</Label>
              <Input value={driverId} onChange={e => setDriverId(e.target.value)} placeholder="Driver ID" className="h-8 text-sm" />
            </div>
            <div className="flex items-end gap-4 col-span-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox checked={exceptions} onCheckedChange={v => setExceptions(!!v)} /> Exceptions Only
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox checked={hasDriverReturns} onCheckedChange={v => setHasDriverReturns(!!v)} /> Has DriverReturn
              </label>
            </div>
            <div className="flex items-end">
              <Button size="sm" variant="outline" onClick={resetFilters}>Reset</Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Error */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <p className="text-sm text-destructive">Failed to load report data. Check filters and try again.</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards — 9 total */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard title="Total Moves"       value={fmtN(s?.total)}          infoId="total"          isLoading={isLoading} drillHref={drillLink()} />
        <KpiCard title="Completed"         value={fmtN(s?.completed)}      infoId="completed"      isLoading={isLoading} drillHref={drillLink({ status: "completed" })} />
        <KpiCard title="Cancelled"         value={fmtN(s?.cancelled)}      infoId="cancelled"      isLoading={isLoading} drillHref={drillLink({ status: "cancelled" })} />
        <KpiCard title="Exceptions"        value={fmtN(s?.exceptionCount)} infoId="exception"      isLoading={isLoading} drillHref={drillLink({ exceptions: "true" })} />
        <KpiCard title="Completion Rate"   value={fmtPct(s?.completionRate)} sub={s ? `${fmtN(s.completed)} of ${fmtN(s.total)}` : undefined} infoId="completionRate" isLoading={isLoading} drillHref={drillLink({ status: "completed" })} />
        <KpiCard title="Avg Miles"         value={fmtMi(s?.avgMiles)}      infoId="avgMiles"       isLoading={isLoading} drillHref={drillLink()} />
        <KpiCard title="Avg Drive Time"    value={fmtMin(s?.avgDriveTime)} infoId="avgDriveTime"   isLoading={isLoading} drillHref={drillLink()} />
        <KpiCard title="DriverReturn Count" value={fmtN(s?.drCount)}       infoId="drCount"        isLoading={isLoading} drillHref={drillLink({ hasDriverReturns: "true" })} />
        <KpiCard title="DR Charges"        value={fmt$(s?.drCharges)}      infoId="drCharges"      isLoading={isLoading} drillHref={drillLink({ hasDriverReturns: "true" })} />
      </div>

      {/* Breakdown Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <TabsList>
            <TabsTrigger value="account">By Account</TabsTrigger>
            <TabsTrigger value="driver">By Driver</TabsTrigger>
            <TabsTrigger value="type">By Move Type</TabsTrigger>
            <TabsTrigger value="source">By Source</TabsTrigger>
            <TabsTrigger value="date">By Date</TabsTrigger>
          </TabsList>
          {activeTab === "date" && (
            <div className="flex items-center gap-1">
              {(["day", "week", "month"] as const).map(g => (
                <Button key={g} size="sm" variant={granularity === g ? "default" : "outline"}
                  className="h-7 text-xs capitalize" onClick={() => setGranularity(g)}>
                  {g === "day" ? "Daily" : g === "week" ? "Weekly" : "Monthly"}
                </Button>
              ))}
            </div>
          )}
        </div>

        <TabsContent value="account" className="mt-3">
          <BreakdownTable isLoading={isLoading} rows={data?.byAccount ?? []} empty="No account data for the selected filters."
            cols={[
              { header: "Account",        cell: r => r.customerName ?? <span className="text-muted-foreground">(No Account)</span> },
              { header: "Total",          cell: r => fmtN(r.total) },
              { header: "Completed",      cell: r => fmtN(r.completed) },
              { header: "Rate",           cell: r => pct(r.completed, r.total) },
              { header: "DR Count",       cell: r => fmtN(r.drCount) },
              { header: "DR Charges",     cell: r => fmt$(r.drCharges) },
              { header: "",               cell: r => r.customerId ? <a href={drillLink({ customerId: r.customerId })} className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">View Moves <ExternalLink className="h-3 w-3" /></a> : null },
            ]} />
        </TabsContent>

        <TabsContent value="driver" className="mt-3">
          <BreakdownTable isLoading={isLoading} rows={data?.byDriver ?? []} empty="No driver data for the selected filters."
            cols={[
              { header: "Driver",         cell: r => r.driverName ?? <span className="text-muted-foreground">(No Driver)</span> },
              { header: "Total",          cell: r => fmtN(r.total) },
              { header: "Completed",      cell: r => fmtN(r.completed) },
              { header: "Rate",           cell: r => pct(r.completed, r.total) },
              { header: "DR Count",       cell: r => fmtN(r.drCount) },
              { header: "DR Charges",     cell: r => fmt$(r.drCharges) },
              { header: "",               cell: r => r.driverId ? <a href={drillLink({ driverId: r.driverId })} className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">View Moves <ExternalLink className="h-3 w-3" /></a> : null },
            ]} />
        </TabsContent>

        <TabsContent value="type" className="mt-3">
          <BreakdownTable isLoading={isLoading} rows={data?.byMoveType ?? []} empty="No move type data for the selected filters."
            cols={[
              { header: "Move Type",      cell: r => r.moveType ?? <span className="text-muted-foreground">(Unknown)</span> },
              { header: "Total",          cell: r => fmtN(r.total) },
              { header: "Completed",      cell: r => fmtN(r.completed) },
              { header: "Rate",           cell: r => pct(r.completed, r.total) },
              { header: "",               cell: r => r.moveType ? <a href={drillLink({ moveType: r.moveType })} className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">View Moves <ExternalLink className="h-3 w-3" /></a> : null },
            ]} />
        </TabsContent>

        <TabsContent value="source" className="mt-3">
          <BreakdownTable isLoading={isLoading} rows={data?.bySource ?? []} empty="No source data for the selected filters."
            cols={[
              { header: "Source System",  cell: r => r.sourceSystem ?? <span className="text-muted-foreground">(Unknown)</span> },
              { header: "Total",          cell: r => fmtN(r.total) },
              { header: "Completed",      cell: r => fmtN(r.completed) },
              { header: "Rate",           cell: r => pct(r.completed, r.total) },
              { header: "",               cell: r => r.sourceSystem ? <a href={drillLink({ sourceSystem: r.sourceSystem })} className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">View Moves <ExternalLink className="h-3 w-3" /></a> : null },
            ]} />
        </TabsContent>

        <TabsContent value="date" className="mt-3">
          <BreakdownTable isLoading={isLoading} rows={data?.byDate ?? []} empty="No date data for the selected filters."
            cols={[
              { header: "Date",           cell: r => r.dateBucket },
              { header: "Total",          cell: r => fmtN(r.total) },
              { header: "Completed",      cell: r => fmtN(r.completed) },
              { header: "Rate",           cell: r => pct(r.completed, r.total) },
              { header: "",               cell: r => <a href={drillLink({ startDate: r.dateBucket, endDate: r.dateBucket })} className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">View Moves <ExternalLink className="h-3 w-3" /></a> },
            ]} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
