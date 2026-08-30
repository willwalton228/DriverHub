import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import {
  Link2, Link2Off, Search, AlertCircle, CheckCircle2, XCircle,
  ChevronLeft, ChevronRight, RefreshCw, Truck, FileSpreadsheet, X as XIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useSearch, useLocation } from "wouter";

// ── Types ──────────────────────────────────────────────────────────────────────
interface DREntry {
  id: string;
  redcapId: number | null;
  sourceTripId: string | null;
  linkedTripId: string | null;
  parentMatchStatus: string;
  tripDate: string | null;
  dealerName: string | null;
  driverName: string | null;
  status: string | null;
  tripTypeGroup: string | null;
  minutes: string | null;
  milesEstimate: string | null;
  customerBilled: string | null;
  baseCost: string | null;
  roNumber: string | null;
  batchId: string;
  sourceSystemKey: string;
  createdAt: string;
}

interface TripSearchResult {
  id: string;
  moveNumber: string;
  externalMoveId: string | null;
  tripDate: string | null;
  status: string | null;
  sourceSystem: string | null;
}

interface DRSummary {
  total: number;
  matched: number;
  unmatched: number;
  superseded: number;
  completed: number;
  cancelled: number;
  totalCustomerBilled: string | null;
  totalBaseCost: string | null;
  totalCustomerTotal: string | null;
  totalMinutes: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt$ = (v: string | null | undefined) =>
  v != null ? `$${parseFloat(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";

const fmtDate = (d: string | null | undefined) =>
  d ? format(parseISO(d), "MMM d, yyyy") : "—";

function StatusBadge({ status }: { status: string | null }) {
  const s = (status ?? "").toLowerCase();
  if (s === "completed")  return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Completed</Badge>;
  if (s === "cancelled")  return <Badge className="bg-amber-100  text-amber-700  border-amber-200">Cancelled</Badge>;
  if (s === "booked")     return <Badge className="bg-blue-100   text-blue-700   border-blue-200">Booked</Badge>;
  return <Badge variant="outline">{status ?? "—"}</Badge>;
}

function MatchBadge({ status }: { status: string }) {
  if (status === "matched")   return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200"><CheckCircle2 className="h-3 w-3 mr-1" />Matched</Badge>;
  return <Badge className="bg-red-100 text-red-700 border-red-200"><AlertCircle className="h-3 w-3 mr-1" />Unmatched</Badge>;
}

// ── Link to Move dialog ────────────────────────────────────────────────────────
function LinkToMoveDialog({
  entry,
  onClose,
  onLinked,
}: {
  entry: DREntry;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<TripSearchResult | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: results = [], isFetching } = useQuery<TripSearchResult[]>({
    queryKey: ["/api/driver-returns/trip-search", q],
    queryFn:  () => apiRequest("GET", `/api/driver-returns/trip-search?q=${encodeURIComponent(q)}`).then(r => r.json()),
    enabled:  q.length >= 2,
  });

  const linkMut = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/driver-returns/${entry.id}/link`, { tripId: selected!.id }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Linked", description: `DR-${entry.redcapId ?? entry.id.slice(0, 8)} linked to move ${selected!.moveNumber}.` });
      qc.invalidateQueries({ queryKey: ["/api/driver-returns"] });
      onLinked();
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Link to Move</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Context strip */}
          <div className="text-xs bg-muted/40 border rounded p-2.5 space-y-0.5">
            <p><span className="text-muted-foreground">RedCap ID: </span><span className="font-mono font-medium tabular-nums">{entry.redcapId != null ? entry.redcapId : "—"}</span></p>
            {entry.sourceTripId && (
              <p><span className="text-muted-foreground">Source Trip ID: </span><span className="font-mono text-muted-foreground">{entry.sourceTripId}</span></p>
            )}
            <p><span className="text-muted-foreground">Date: </span>{fmtDate(entry.tripDate)}</p>
            <p><span className="text-muted-foreground">Driver: </span>{entry.driverName ?? "—"}</p>
            <p><span className="text-muted-foreground">Account: </span>{entry.dealerName ?? "—"}</p>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              autoFocus
              placeholder="Search by Move # or RedCap ID…"
              className="pl-8"
              value={q}
              onChange={e => { setQ(e.target.value); setSelected(null); }}
            />
          </div>

          {/* Results */}
          {q.length >= 2 && (
            <div className="border rounded-md divide-y max-h-56 overflow-y-auto">
              {isFetching ? (
                <p className="text-sm text-muted-foreground p-3 text-center">Searching…</p>
              ) : results.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3 text-center">No moves found</p>
              ) : results.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t)}
                  className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between hover:bg-muted/50 transition-colors ${
                    selected?.id === t.id ? "bg-primary/5 ring-1 ring-primary/20" : ""
                  }`}
                >
                  <div>
                    <span className="font-mono font-medium">{t.moveNumber}</span>
                    {t.externalMoveId && t.externalMoveId !== t.moveNumber && (
                      <span className="text-muted-foreground ml-2 text-xs">ext: {t.externalMoveId}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">{fmtDate(t.tripDate)}</span>
                    <StatusBadge status={t.status} />
                  </div>
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div className="text-xs bg-emerald-50 border border-emerald-200 rounded p-2.5 flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span>Will link to <strong className="font-mono">{selected.moveNumber}</strong> ({fmtDate(selected.tripDate)})</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!selected || linkMut.isPending}
            onClick={() => linkMut.mutate()}
          >
            {linkMut.isPending ? "Linking…" : "Confirm Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DriverReturns() {
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const urlParams = new URLSearchParams(searchString);
  const batchIdFromUrl = urlParams.get("batchId") ?? "";

  const [tab, setTab]               = useState<"all" | "exceptions">("all");
  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatus]   = useState("all");
  const [matchFilter, setMatch]     = useState("all");
  const [dateFrom, setDateFrom]     = useState("");
  const [dateTo, setDateTo]         = useState("");
  const [batchFilter, setBatchFilter] = useState(batchIdFromUrl);
  const [linkTarget, setLinkTarget] = useState<DREntry | null>(null);

  const PAGE_SIZE = 50;
  const qc = useQueryClient();
  const { toast } = useToast();

  // Sync batchId from URL on navigation
  useEffect(() => {
    if (batchIdFromUrl) setBatchFilter(batchIdFromUrl);
  }, [batchIdFromUrl]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [tab, search, statusFilter, matchFilter, dateFrom, dateTo, batchFilter]);

  // Summary
  const { data: summary } = useQuery<DRSummary>({
    queryKey: ["/api/driver-returns/summary"],
    queryFn:  () => apiRequest("GET", "/api/driver-returns/summary").then(r => r.json()),
  });

  // All-records list
  const allParams = new URLSearchParams({
    page: String(page), pageSize: String(PAGE_SIZE),
    ...(search       ? { search }                        : {}),
    ...(statusFilter !== "all" ? { status: statusFilter }: {}),
    ...(matchFilter  !== "all" ? { parentMatchStatus: matchFilter } : {}),
    ...(dateFrom     ? { dateFrom }                      : {}),
    ...(dateTo       ? { dateTo }                        : {}),
    ...(batchFilter  ? { batchId: batchFilter }          : {}),
  });
  const { data: allData, isFetching: allLoading } = useQuery({
    queryKey: ["/api/driver-returns", allParams.toString()],
    queryFn:  () => apiRequest("GET", `/api/driver-returns?${allParams}`).then(r => r.json()),
    enabled:  tab === "all",
  });

  // Exception queue
  const exParams = new URLSearchParams({
    page: String(page), pageSize: String(PAGE_SIZE),
    ...(search   ? { search }   : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo   ? { dateTo }   : {}),
  });
  const { data: exData, isFetching: exLoading } = useQuery({
    queryKey: ["/api/driver-returns/exception-queue", exParams.toString()],
    queryFn:  () => apiRequest("GET", `/api/driver-returns/exception-queue?${exParams}`).then(r => r.json()),
    enabled:  tab === "exceptions",
  });

  // Unlink mutation
  const unlinkMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest("PATCH", `/api/driver-returns/${id}/unlink`).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Unlinked", description: "Parent move link removed." });
      qc.invalidateQueries({ queryKey: ["/api/driver-returns"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const activeRows: DREntry[]  = tab === "all"        ? (allData?.rows ?? []) : (exData?.rows ?? []);
  const totalRows: number      = tab === "all"        ? (allData?.total ?? 0) : (exData?.total ?? 0);
  const isLoading              = tab === "all" ? allLoading : exLoading;
  const totalPages             = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const hasActiveFilters       = !!(search || statusFilter !== "all" || matchFilter !== "all" || dateFrom || dateTo || batchFilter);

  return (
    <div className="-mx-3 sm:-mx-4 md:-mx-6 -mt-4 sm:-mt-6 bg-[#f7f8fc] dark:bg-background min-h-screen">

      {/* ── Sticky header ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 bg-background">
        <div className="border-b border-border px-6 py-2">
          <p className="text-xs text-muted-foreground leading-none">
            Operations / Data Imports /{" "}
            <span className="font-medium text-foreground/70">Driver Returns</span>
          </p>
          <div className="flex items-start justify-between mt-0.5">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#182039] dark:text-foreground leading-none">
                Driver Returns
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5 leading-none">
                <span className="font-semibold text-[#5737f2]">
                  {(summary?.total ?? 0).toLocaleString("en-US")}
                </span>
                {" "}records
                {hasActiveFilters && (
                  <span className="text-muted-foreground/60"> · filtered</span>
                )}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => qc.invalidateQueries({ queryKey: ["/api/driver-returns"] })}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* ── Page body ──────────────────────────────────────────────────────── */}
      <div className="px-6 pt-3 pb-6 max-w-[1600px] mx-auto space-y-4">

        {/* Import batch filter banner */}
        {batchFilter && (
          <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900">
            <FileSpreadsheet className="h-4 w-4 text-blue-500 shrink-0" />
            <span>
              Showing Driver Returns from <strong>Import Batch</strong>{" "}
              <span className="font-mono text-xs bg-blue-100 px-1.5 py-0.5 rounded">
                {batchFilter.slice(0, 8)}…
              </span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-blue-700 hover:text-blue-900 hover:bg-blue-100 ml-auto"
              onClick={() => { setBatchFilter(""); setLocation("/driver-returns"); }}
            >
              <XIcon className="h-3.5 w-3.5 mr-1" /> Clear filter
            </Button>
          </div>
        )}

        {/* KPI tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "Total",           value: summary?.total     ?? "—", color: "text-foreground"      },
            { label: "Matched",         value: summary?.matched   ?? "—", color: "text-emerald-600"     },
            { label: "Unmatched",       value: summary?.unmatched ?? "—", color: "text-red-600"         },
            { label: "Completed",       value: summary?.completed ?? "—", color: "text-emerald-600"     },
            { label: "Cancelled",       value: summary?.cancelled ?? "—", color: "text-amber-600"       },
            { label: "Customer Billed", value: fmt$(summary?.totalCustomerBilled), color: "text-blue-700"    },
            { label: "Base Cost",       value: fmt$(summary?.totalBaseCost),       color: "text-foreground"  },
            {
              label: "Total Minutes",
              value: summary?.totalMinutes
                ? Number(parseFloat(summary.totalMinutes)).toLocaleString()
                : "—",
              color: "text-muted-foreground",
            },
          ].map(c => (
            <Card key={c.label} className="border border-border/50 shadow-none">
              <CardContent className="px-2.5 py-2 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                  {c.label}
                </p>
                <p className={`text-xl font-bold tabular-nums truncate leading-tight ${c.color}`}>
                  {c.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Main content card: tabs + filters + table ─────────────────────── */}
        <div className="bg-white dark:bg-card border border-[#e4e7ee] dark:border-border rounded-xl overflow-hidden">

          {/* Tab bar */}
          <div className="flex items-center gap-0 border-b border-[#e4e7ee] dark:border-border px-4">
            {([
              { key: "all",        label: "All Records",     count: summary?.total ?? 0     },
              { key: "exceptions", label: "Exception Queue", count: summary?.unmatched ?? 0 },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setPage(1); }}
                className={`px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
                  tab === t.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                {t.count > 0 && (
                  <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${
                    t.key === "exceptions"
                      ? "bg-red-100 text-red-700"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {t.count.toLocaleString()}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap gap-2 items-center px-4 py-2 bg-[#f7f8fb] dark:bg-muted/20 border-b border-[#e4e7ee] dark:border-border">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by RedCap ID, account, driver, RO#…"
                className="pl-8 h-8 text-[13px] bg-white dark:bg-card"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {tab === "all" && (
              <>
                <Select value={statusFilter} onValueChange={setStatus}>
                  <SelectTrigger className="h-8 w-[130px] text-[13px] bg-white dark:bg-card">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="booked">Booked</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={matchFilter} onValueChange={setMatch}>
                  <SelectTrigger className="h-8 w-[145px] text-[13px] bg-white dark:bg-card">
                    <SelectValue placeholder="Match Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Match States</SelectItem>
                    <SelectItem value="matched">Matched</SelectItem>
                    <SelectItem value="unmatched">Unmatched</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}

            <Input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="h-8 w-[130px] text-[13px] bg-white dark:bg-card"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="h-8 w-[130px] text-[13px] bg-white dark:bg-card"
            />

            {(search || statusFilter !== "all" || matchFilter !== "all" || dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-[13px]"
                onClick={() => {
                  setSearch(""); setStatus("all"); setMatch("all"); setDateFrom(""); setDateTo("");
                }}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            )}
          </div>

          {/* Table */}
          <Table className="[&_td]:py-2 [&_th]:py-2 [&_td]:text-[13px]">
            <TableHeader>
              <TableRow className="bg-[#f7f8fb] dark:bg-muted/30 hover:bg-[#f7f8fb] dark:hover:bg-muted/30 border-b border-[#e4e7ee] dark:border-border">
                <TableHead className="text-[13px] font-semibold text-foreground/80 whitespace-nowrap">Date</TableHead>
                <TableHead className="text-[13px] font-semibold text-foreground/80 whitespace-nowrap">RedCap ID</TableHead>
                <TableHead className="text-[13px] font-semibold text-foreground/80">Account</TableHead>
                <TableHead className="text-[13px] font-semibold text-foreground/80">Driver</TableHead>
                <TableHead className="text-[13px] font-semibold text-foreground/80">Status</TableHead>
                <TableHead className="text-[13px] font-semibold text-foreground/80">Parent Match</TableHead>
                <TableHead className="text-[13px] font-semibold text-foreground/80 text-right">Customer Billed</TableHead>
                <TableHead className="text-[13px] font-semibold text-foreground/80 text-right">Base Cost</TableHead>
                <TableHead className="text-[13px] font-semibold text-foreground/80 text-right">Min</TableHead>
                <TableHead className="text-[13px] font-semibold text-foreground/80">RO #</TableHead>
                <TableHead className="text-[13px] font-semibold text-foreground/80 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 11 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 bg-muted/50 rounded animate-pulse" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : activeRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-12 text-center text-muted-foreground">
                    <Truck className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>No driver return records found</p>
                  </TableCell>
                </TableRow>
              ) : activeRows.map(row => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">{fmtDate(row.tripDate)}</TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">
                    {row.redcapId != null ? row.redcapId : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="max-w-[150px] truncate" title={row.dealerName ?? ""}>
                    {row.dealerName ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[130px] truncate" title={row.driverName ?? ""}>
                    {row.driverName ?? "—"}
                  </TableCell>
                  <TableCell><StatusBadge status={row.status} /></TableCell>
                  <TableCell><MatchBadge status={row.parentMatchStatus} /></TableCell>
                  <TableCell className="text-right tabular-nums">{fmt$(row.customerBilled)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt$(row.baseCost)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.minutes != null ? parseFloat(row.minutes).toFixed(0) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.roNumber ?? "—"}</TableCell>
                  <TableCell className="text-center">
                    {row.parentMatchStatus === "unmatched" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setLinkTarget(row)}
                      >
                        <Link2 className="h-3 w-3 mr-1" />Link
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground hover:text-red-600"
                        onClick={() => unlinkMut.mutate(row.id)}
                        disabled={unlinkMut.isPending}
                      >
                        <Link2Off className="h-3 w-3 mr-1" />Unlink
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalRows > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[#e4e7ee] dark:border-border bg-[#f7f8fb] dark:bg-muted/20">
              <span className="text-[13px] text-muted-foreground">
                {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, totalRows).toLocaleString()} of {totalRows.toLocaleString()}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline" size="sm" className="h-7 w-7 p-0"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline" size="sm" className="h-7 w-7 p-0"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Exception queue status banners */}
        {tab === "exceptions" && totalRows === 0 && !isLoading && (
          <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-emerald-800">Exception queue is clear</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                All driver return records have been linked to a parent move.
              </p>
            </div>
          </div>
        )}
        {tab === "exceptions" && totalRows > 0 && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                {totalRows.toLocaleString()} {totalRows === 1 ? "record" : "records"} awaiting parent move
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Use <strong>Link</strong> to associate each record with its parent move. Records can also be linked
                automatically by re-running the import after the corresponding Move Report has been imported.
              </p>
            </div>
          </div>
        )}

      </div>

      {/* Link to Move dialog */}
      {linkTarget && (
        <LinkToMoveDialog
          entry={linkTarget}
          onClose={() => setLinkTarget(null)}
          onLinked={() => {
            qc.invalidateQueries({ queryKey: ["/api/driver-returns/summary"] });
          }}
        />
      )}
    </div>
  );
}
