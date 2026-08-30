import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, RefreshCw,
         Play, DollarSign, BarChart3, Activity, Zap, MapPin, Building2, XCircle,
         User, Clock, ArrowRight } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import MarginReconciliationPanel, { exceptionSeverity, SEVERITY_CONFIG, STATUS_LABELS } from "./MarginReconciliationPanel";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtMoney(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number | string | null | undefined) {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  return `${v.toFixed(1)}%`;
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString();
}

function MarginBadge({ pct }: { pct: number | string | null | undefined }) {
  const v = Number(pct ?? 0);
  const cls = v >= 20 ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
    : v >= 10 ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
    : v >= 0  ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300"
    : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
  return <Badge variant="secondary" className={`text-xs border-transparent ${cls}`}>{fmtPct(pct)}</Badge>;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  unpriced:     { label: "Unpriced",     color: "bg-muted text-muted-foreground" },
  costed_only:  { label: "Costed Only",  color: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
  revenue_only: { label: "Revenue Only", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  matched:      { label: "Matched",      color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  exception:    { label: "Exception",    color: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  finalized:    { label: "Finalized",    color: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" },
};

function FinancialStatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, color: "bg-muted text-muted-foreground" };
  return <Badge variant="secondary" className={`text-xs border-transparent ${s.color}`}>{s.label}</Badge>;
}

const EX_TYPE_LABELS: Record<string, string> = {
  missing_revenue:      "Missing Revenue",
  missing_cost:         "Missing Cost",
  unlinked_invoice_line:"Unlinked Invoice Line",
  unlinked_pay_record:  "Unlinked Pay Record",
  duplicate_mapping:    "Duplicate Mapping",
  negative_margin:      "Negative Margin",
  pass_through_issue:   "Pass-Through Issue",
  manual_flag:          "Manual Flag",
};

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function DashboardTab() {
  const { toast } = useToast();

  const { data: dash, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/corporate/move-financials/dashboard"],
  });

  const runMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/corporate/move-financials/run-engine", {}),
    onSuccess: (d: any) => {
      refetch();
      toast({ title: `Engine completed — ${d.processed} moves processed, ${d.exceptions} exceptions` });
    },
    onError: (e: any) => toast({ title: e.message || "Engine run failed", variant: "destructive" }),
  });

  const week  = dash?.week  ?? {};
  const month = dash?.month ?? {};

  const kpiGroups = [
    {
      label: "This Week",
      items: [
        { label: "Revenue",  value: fmtMoney(week.revenue),   icon: DollarSign },
        { label: "Cost",     value: fmtMoney(week.cost),      icon: DollarSign },
        { label: "Profit",   value: fmtMoney(week.profit),    icon: TrendingUp },
        { label: "Margin",   value: fmtPct(week.margin_pct),  icon: BarChart3 },
        { label: "Moves",    value: (week.moves ?? 0).toString(), icon: Activity },
      ],
    },
    {
      label: "This Month",
      items: [
        { label: "Revenue",  value: fmtMoney(month.revenue),   icon: DollarSign },
        { label: "Cost",     value: fmtMoney(month.cost),      icon: DollarSign },
        { label: "Profit",   value: fmtMoney(month.profit),    icon: TrendingUp },
        { label: "Margin",   value: fmtPct(month.margin_pct),  icon: BarChart3 },
        { label: "Moves",    value: (month.moves ?? 0).toString(), icon: Activity },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Run engine button */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending} data-testid="button-run-margin-engine">
          {runMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
          Run Margin Engine
        </Button>
        <Button variant="ghost" size="icon" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {isLoading ? (
        <div className="py-16 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
      ) : (
        <>
          {/* Week + Month KPIs */}
          {kpiGroups.map(g => (
            <div key={g.label}>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{g.label}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {g.items.map(({ label, value, icon: Icon }) => (
                  <Card key={label}>
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">{label}</p>
                      </div>
                      <p className="text-lg font-bold leading-tight">{value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}

          {/* Exceptions summary */}
          {((dash?.exceptionSummary ?? []) as any[]).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Open Exceptions</h3>
              <div className="flex flex-wrap gap-2">
                {(dash.exceptionSummary as any[]).map((e: any) => (
                  <div key={e.exception_type} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm bg-card" data-testid={`chip-exception-${e.exception_type}`}>
                    <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                    <span className="font-medium">{EX_TYPE_LABELS[e.exception_type] ?? e.exception_type}</span>
                    <Badge variant="secondary" className="text-xs border-transparent bg-muted text-muted-foreground">{e.cnt}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Two-column bottom section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Lowest margin accounts */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-orange-500" />Lowest Margin Accounts
                </CardTitle>
                <CardDescription>Trailing 30 days — min. 2 moves</CardDescription>
              </CardHeader>
              <CardContent>
                {(dash?.lowestAccounts ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No data</p>
                ) : (
                  <div className="space-y-2">
                    {(dash.lowestAccounts as any[]).map((a: any, i: number) => (
                      <div key={a.account_id ?? i} className="flex items-center gap-2 text-sm" data-testid={`row-low-margin-${a.account_id}`}>
                        <span className="w-5 text-xs text-muted-foreground font-mono">{i+1}</span>
                        <span className="flex-1 truncate">{a.account_name ?? "Unknown"}</span>
                        <span className="text-xs text-muted-foreground">{a.moves}mv</span>
                        <MarginBadge pct={a.margin_pct} />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Negative margin moves */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />Negative Margin Moves
                </CardTitle>
                <CardDescription>Trailing 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                {(dash?.negativeMoves ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No negative margin moves</p>
                ) : (
                  <div className="space-y-1.5">
                    {(dash.negativeMoves as any[]).slice(0, 8).map((m: any) => (
                      <div key={m.id} className="flex items-center gap-2 text-sm" data-testid={`row-neg-move-${m.id}`}>
                        <span className="flex-1 truncate text-muted-foreground">{m.account_name ?? "—"}</span>
                        <span className="text-xs text-muted-foreground">{fmtDate(m.move_date)}</span>
                        <span className="text-xs font-medium">{fmtMoney(m.gross_profit)}</span>
                        <MarginBadge pct={m.margin_pct} />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Market breakdown */}
          {(dash?.byMarket ?? []).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />Margin by Market
                </CardTitle>
                <CardDescription>Trailing 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left py-2 px-2 font-medium">Market</th>
                        <th className="text-right py-2 px-2 font-medium">Moves</th>
                        <th className="text-right py-2 px-2 font-medium">Revenue</th>
                        <th className="text-right py-2 px-2 font-medium">Profit</th>
                        <th className="text-right py-2 px-2 font-medium">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(dash.byMarket as any[]).map((m: any) => (
                        <tr key={m.market} className="border-b last:border-0">
                          <td className="py-1.5 px-2 font-medium">{m.market}</td>
                          <td className="py-1.5 px-2 text-right text-muted-foreground">{m.moves}</td>
                          <td className="py-1.5 px-2 text-right">{fmtMoney(m.revenue)}</td>
                          <td className="py-1.5 px-2 text-right">{fmtMoney(m.profit)}</td>
                          <td className="py-1.5 px-2 text-right"><MarginBadge pct={m.margin_pct} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── Move Financials Tab ──────────────────────────────────────────────────────

function MoveFinancialsTab() {
  const [filters, setFilters] = useState({ financialStatus: "", anomalyOnly: "", from: "", to: "", sortBy: "move_date", sortDir: "desc" });
  const [statusModal, setStatusModal] = useState<{ id: string; current: string } | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [statusNotes, setStatusNotes] = useState("");
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<{ rows: any[]; total: number }>({
    queryKey: ["/api/corporate/move-financials", filters],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (filters.financialStatus) p.set("financialStatus", filters.financialStatus);
      if (filters.anomalyOnly) p.set("anomalyOnly", filters.anomalyOnly);
      if (filters.from) p.set("from", filters.from);
      if (filters.to) p.set("to", filters.to);
      p.set("sortBy", filters.sortBy);
      p.set("sortDir", filters.sortDir);
      p.set("limit", "100");
      const res = await fetch(`/api/corporate/move-financials?${p}`, { credentials: "include" });
      return res.json();
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, financialStatus, notes }: any) =>
      apiRequest("PATCH", `/api/corporate/move-financials/${id}/status`, { financialStatus, notes }),
    onSuccess: () => {
      setStatusModal(null);
      refetch();
      toast({ title: "Status updated" });
    },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filters.financialStatus || "all"} onValueChange={v => setFilters(f => ({ ...f, financialStatus: v === "all" ? "" : v }))}>
          <SelectTrigger className="w-40" data-testid="select-financial-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(STATUS_MAP).map(([v, s]) => <SelectItem key={v} value={v}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.anomalyOnly || "all"} onValueChange={v => setFilters(f => ({ ...f, anomalyOnly: v === "all" ? "" : v }))}>
          <SelectTrigger className="w-36" data-testid="select-anomaly-filter">
            <SelectValue placeholder="Anomalies" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Moves</SelectItem>
            <SelectItem value="true">Exceptions Only</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" className="w-36" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
        <Input type="date" className="w-36" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
        <Select value={filters.sortBy} onValueChange={v => setFilters(f => ({ ...f, sortBy: v }))}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="move_date">Move Date</SelectItem>
            <SelectItem value="margin_pct">Margin %</SelectItem>
            <SelectItem value="gross_profit">Gross Profit</SelectItem>
            <SelectItem value="revenue_amount">Revenue</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={() => setFilters(f => ({ ...f, sortDir: f.sortDir === "asc" ? "desc" : "asc" }))}>
          {filters.sortDir === "asc" ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => refetch()} data-testid="button-refresh-mf">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">{data?.total ?? 0} records</span>
      </div>

      <Card>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="py-16 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">No move financials found</p>
              <p className="text-xs text-muted-foreground mt-1">Run the Margin Engine from the Dashboard tab to generate records.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-3 px-2 font-medium">Date</th>
                    <th className="text-left py-3 px-2 font-medium">Account</th>
                    <th className="text-left py-3 px-2 font-medium">Driver</th>
                    <th className="text-right py-3 px-2 font-medium">Revenue</th>
                    <th className="text-right py-3 px-2 font-medium">Cost</th>
                    <th className="text-right py-3 px-2 font-medium">Profit</th>
                    <th className="text-right py-3 px-2 font-medium">Margin</th>
                    <th className="text-left py-3 px-2 font-medium">Status</th>
                    <th className="py-3 px-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any) => (
                    <tr key={r.id} className={`border-b last:border-0 ${r.anomaly_flag ? "bg-yellow-50/30 dark:bg-yellow-900/10" : ""}`} data-testid={`row-mf-${r.id}`}>
                      <td className="py-2 px-2 text-muted-foreground text-xs">{fmtDate(r.move_date)}</td>
                      <td className="py-2 px-2 max-w-[140px] truncate font-medium text-xs">{r.account_name ?? "—"}</td>
                      <td className="py-2 px-2 text-xs text-muted-foreground max-w-[100px] truncate">{r.driver_name ?? "—"}</td>
                      <td className="py-2 px-2 text-right text-xs">{fmtMoney(r.revenue_amount)}</td>
                      <td className="py-2 px-2 text-right text-xs">{fmtMoney(r.total_direct_cost)}</td>
                      <td className={`py-2 px-2 text-right text-xs font-semibold ${Number(r.gross_profit) < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                        {fmtMoney(r.gross_profit)}
                      </td>
                      <td className="py-2 px-2 text-right"><MarginBadge pct={r.margin_pct} /></td>
                      <td className="py-2 px-2"><FinancialStatusBadge status={r.financial_status} /></td>
                      <td className="py-2 px-2">
                        <Button variant="ghost" size="default" className="text-xs h-7"
                          onClick={() => { setStatusModal({ id: r.id, current: r.financial_status }); setNewStatus(r.financial_status); setStatusNotes(""); }}
                          data-testid={`button-mf-status-${r.id}`}
                        >
                          Update
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status update dialog */}
      <Dialog open={!!statusModal} onOpenChange={() => setStatusModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Update Financial Status</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger data-testid="select-new-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_MAP).map(([v, s]) => <SelectItem key={v} value={v}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Notes (optional)" value={statusNotes} onChange={e => setStatusNotes(e.target.value)} data-testid="input-status-notes" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusModal(null)}>Cancel</Button>
            <Button onClick={() => statusModal && statusMutation.mutate({ id: statusModal.id, financialStatus: newStatus, notes: statusNotes })}
              disabled={statusMutation.isPending} data-testid="button-confirm-status">
              {statusMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Exceptions Work Queue ────────────────────────────────────────────────────

function ExceptionsTab() {
  const [filters, setFilters] = useState({ status: "open", exceptionType: "", search: "" });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<{ exceptions: any[]; total: number }>({
    queryKey: ["/api/corporate/move-financials/exceptions", filters],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (filters.status) p.set("status", filters.status);
      if (filters.exceptionType) p.set("exceptionType", filters.exceptionType);
      if (filters.search) p.set("search", filters.search);
      p.set("limit", "200");
      const res = await fetch(`/api/corporate/move-financials/exceptions?${p}`, { credentials: "include" });
      return res.json();
    },
  });

  const exceptions = data?.exceptions ?? [];

  // Aggregate counts by status for the summary chips
  const counts = exceptions.reduce((acc: Record<string, number>, e: any) => {
    acc[e.resolution_status] = (acc[e.resolution_status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Search account, move…"
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          className="w-48"
          data-testid="input-exception-search"
        />
        <Select
          value={filters.status || "all"}
          onValueChange={v => setFilters(f => ({ ...f, status: v === "all" ? "" : v }))}
        >
          <SelectTrigger className="w-36" data-testid="select-exception-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_review">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.exceptionType || "all"}
          onValueChange={v => setFilters(f => ({ ...f, exceptionType: v === "all" ? "" : v }))}
        >
          <SelectTrigger className="w-52" data-testid="select-exception-type">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(EX_TYPE_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={() => refetch()} data-testid="button-refresh-exceptions">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">{data?.total ?? exceptions.length} exceptions</span>
      </div>

      {/* Summary chips */}
      {Object.keys(counts).length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {Object.entries(counts).map(([status, cnt]) => {
            const cfg = STATUS_LABELS[status];
            return (
              <button
                key={status}
                onClick={() => setFilters(f => ({ ...f, status: filters.status === status ? "" : status }))}
                className="text-xs"
                data-testid={`chip-status-${status}`}
              >
                <Badge
                  variant="secondary"
                  className={`${cfg?.cls ?? "bg-muted text-muted-foreground border-transparent"} cursor-pointer ${filters.status === status ? "ring-2 ring-primary ring-offset-1" : ""}`}
                >
                  {cfg?.label ?? status} · {cnt as number}
                </Badge>
              </button>
            );
          })}
        </div>
      )}

      {/* Work Queue Table */}
      <Card>
        <CardContent className="pt-0 pb-0">
          {isLoading ? (
            <div className="py-16 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : exceptions.length === 0 ? (
            <div className="py-16 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
              <p className="text-sm font-medium">No exceptions found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {filters.status === "open" ? "All open exceptions have been resolved." : "No exceptions match the selected filters."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-3 px-3 font-medium w-6"></th>
                    <th className="text-left py-3 px-2 font-medium">Exception</th>
                    <th className="text-left py-3 px-2 font-medium">Account</th>
                    <th className="text-left py-3 px-2 font-medium">Move #</th>
                    <th className="text-left py-3 px-2 font-medium">Date</th>
                    <th className="text-right py-3 px-2 font-medium">Margin</th>
                    <th className="text-left py-3 px-2 font-medium">Status</th>
                    <th className="text-left py-3 px-2 font-medium">Assigned</th>
                    <th className="py-3 px-2 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {exceptions.map((e: any) => {
                    const sev = exceptionSeverity(e.exception_type);
                    const sevCfg = SEVERITY_CONFIG[sev] ?? SEVERITY_CONFIG.warning;
                    const statusCfg = STATUS_LABELS[e.resolution_status] ?? STATUS_LABELS.open;
                    const StatusIcon = statusCfg.icon ?? Clock;
                    return (
                      <tr
                        key={e.id}
                        className="border-b last:border-0 hover-elevate cursor-pointer"
                        onClick={() => setSelectedId(e.id)}
                        data-testid={`row-exception-${e.id}`}
                      >
                        <td className="py-2.5 px-3">
                          <AlertTriangle className={`h-3.5 w-3.5 ${sev === "high" ? "text-red-500" : sev === "warning" ? "text-yellow-500" : "text-blue-400"}`} />
                        </td>
                        <td className="py-2.5 px-2">
                          <div>
                            <p className="text-xs font-medium">{EX_TYPE_LABELS[e.exception_type] ?? e.exception_type}</p>
                            {e.description && (
                              <p className="text-xs text-muted-foreground truncate max-w-[180px] mt-0.5">{e.description}</p>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-2">
                          <span className="text-xs truncate max-w-[130px] block">{e.account_name ?? "—"}</span>
                        </td>
                        <td className="py-2.5 px-2">
                          <span className="text-xs font-mono text-muted-foreground">{e.move_number ?? "—"}</span>
                        </td>
                        <td className="py-2.5 px-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(e.move_date)}</td>
                        <td className="py-2.5 px-2 text-right">
                          <MarginBadge pct={e.margin_pct} />
                        </td>
                        <td className="py-2.5 px-2">
                          <Badge variant="secondary" className={`text-xs ${statusCfg.cls} flex items-center gap-1 w-fit`}>
                            <StatusIcon className="h-2.5 w-2.5" />
                            {statusCfg.label}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-2">
                          {e.assigned_user_name ? (
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs truncate max-w-[80px]">{e.assigned_user_name}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <Button
                            variant="ghost"
                            size="default"
                            className="text-xs h-7"
                            onClick={ev => { ev.stopPropagation(); setSelectedId(e.id); }}
                            data-testid={`button-open-exception-${e.id}`}
                          >
                            Open
                            <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reconciliation Panel */}
      <MarginReconciliationPanel
        exceptionId={selectedId}
        onClose={() => setSelectedId(null)}
        onResolved={() => refetch()}
      />
    </div>
  );
}

// ─── Account Margin Tab ───────────────────────────────────────────────────────

function AccountMarginTab() {
  const [accountId, setAccountId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: accounts } = useQuery<any[]>({
    queryKey: ["/api/corporate/customers"],
    queryFn: async () => {
      const res = await fetch("/api/corporate/customers?limit=200", { credentials: "include" });
      const d = await res.json();
      return d.customers ?? d ?? [];
    },
  });

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/corporate/move-financials/account", accountId, from, to],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (from) p.set("from", from);
      if (to)   p.set("to",   to);
      const res = await fetch(`/api/corporate/move-financials/account/${accountId}/summary?${p}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!accountId,
  });

  const filteredAccounts = (accounts ?? []).filter((a: any) =>
    searchInput ? (a.name ?? "").toLowerCase().includes(searchInput.toLowerCase()) : true
  );

  const summary = data?.summary ?? {};
  const trend   = data?.weeklyTrend ?? [];
  const statusBreakdown = data?.statusBreakdown ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Input
            placeholder="Search accounts…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="w-56"
            data-testid="input-account-search"
          />
        </div>
        <Select value={accountId || ""} onValueChange={setAccountId}>
          <SelectTrigger className="w-64" data-testid="select-account-margin">
            <SelectValue placeholder="Select account" />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {filteredAccounts.slice(0, 50).map((a: any) => (
              <SelectItem key={a.id} value={a.id}>{a.name ?? a.accountName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" className="w-36" value={from} onChange={e => setFrom(e.target.value)} placeholder="From" />
        <Input type="date" className="w-36" value={to}   onChange={e => setTo(e.target.value)}   placeholder="To" />
      </div>

      {!accountId ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Select an account to view margin analysis</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="py-16 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
      ) : (
        <div className="space-y-5">
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Revenue",  value: fmtMoney(summary.total_revenue),  icon: DollarSign },
              { label: "Total Cost",     value: fmtMoney(summary.total_cost),     icon: DollarSign },
              { label: "Gross Profit",   value: fmtMoney(summary.total_profit),   icon: TrendingUp },
              { label: "Margin %",       value: fmtPct(summary.margin_pct),       icon: BarChart3 },
            ].map(({ label, value, icon: Icon }) => (
              <Card key={label}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                  <p className="text-xl font-bold">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Weekly trend */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Weekly Trend (last 12 weeks)</CardTitle>
                </CardHeader>
                <CardContent>
                  {trend.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No weekly data</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-xs text-muted-foreground">
                            <th className="text-left py-2 px-2 font-medium">Week</th>
                            <th className="text-right py-2 px-2 font-medium">Moves</th>
                            <th className="text-right py-2 px-2 font-medium">Revenue</th>
                            <th className="text-right py-2 px-2 font-medium">Profit</th>
                            <th className="text-right py-2 px-2 font-medium">Margin</th>
                          </tr>
                        </thead>
                        <tbody>
                          {trend.map((w: any) => (
                            <tr key={w.week} className="border-b last:border-0">
                              <td className="py-1.5 px-2 text-xs text-muted-foreground">{fmtDate(w.week)}</td>
                              <td className="py-1.5 px-2 text-right text-xs">{w.moves}</td>
                              <td className="py-1.5 px-2 text-right text-xs">{fmtMoney(w.revenue)}</td>
                              <td className={`py-1.5 px-2 text-right text-xs font-medium ${Number(w.profit) < 0 ? "text-red-600" : ""}`}>
                                {fmtMoney(w.profit)}
                              </td>
                              <td className="py-1.5 px-2 text-right"><MarginBadge pct={w.margin_pct} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Status breakdown + stats */}
            <div className="space-y-3">
              <Card>
                <CardHeader><CardTitle className="text-base">Status Breakdown</CardTitle></CardHeader>
                <CardContent>
                  {statusBreakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No data</p>
                  ) : (
                    <div className="space-y-2">
                      {statusBreakdown.map((s: any) => (
                        <div key={s.financial_status} className="flex items-center justify-between">
                          <FinancialStatusBadge status={s.financial_status} />
                          <span className="text-sm font-semibold">{s.cnt}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Risk Indicators</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Negative Margin Moves</span>
                    <span className={`font-semibold ${Number(summary.negative_margin_count) > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                      {summary.negative_margin_count ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Open Exceptions</span>
                    <span className={`font-semibold ${Number(summary.exception_count) > 0 ? "text-yellow-600 dark:text-yellow-400" : ""}`}>
                      {summary.exception_count ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Moves</span>
                    <span className="font-semibold">{summary.total_moves ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg Margin</span>
                    <MarginBadge pct={summary.avg_margin_pct} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = ["dashboard", "moves", "exceptions", "accounts"] as const;
type TabId = typeof TABS[number];

const TAB_LABELS: Record<TabId, string> = {
  dashboard:  "Dashboard",
  moves:      "Move Financials",
  exceptions: "Exceptions",
  accounts:   "Account Margin",
};

export default function MarginEngine() {
  const [tab, setTab] = useState<TabId>("dashboard");

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" />
          Margin Engine
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Invoice-to-payroll margin analysis — move-level profitability, exception management, and account-level rollups.
        </p>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t}
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            onClick={() => setTab(t)}
            data-testid={`tab-margin-${t}`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === "dashboard"  && <DashboardTab />}
      {tab === "moves"      && <MoveFinancialsTab />}
      {tab === "exceptions" && <ExceptionsTab />}
      {tab === "accounts"   && <AccountMarginTab />}
    </div>
  );
}
