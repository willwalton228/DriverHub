import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button }   from "@/components/ui/button";
import { Badge }    from "@/components/ui/badge";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton }  from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast }  from "@/hooks/use-toast";
import {
  DollarSign, TrendingDown, TrendingUp, AlertTriangle, RefreshCw,
  Zap, BarChart2, ChevronLeft, ChevronRight, ExternalLink,
} from "lucide-react";
import { useLocation } from "wouter";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt$(v: unknown, dec = 2) {
  const n = parseFloat(String(v ?? "0")) || 0;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtN(v: unknown) { return (parseInt(String(v ?? "0")) || 0).toLocaleString(); }
function fmtPct(v: unknown) {
  if (v === null || v === undefined || String(v) === "") return "—";
  return (parseFloat(String(v)) * 100).toFixed(1) + "%";
}
function fmtDate(v: unknown) {
  if (!v) return "—";
  return new Date(String(v)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function defaultRange() {
  const end = new Date();
  const start = new Date(); start.setDate(end.getDate() - 90);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

const ANOMALY_LABELS: Record<string, { label: string; cls: string }> = {
  no_revenue:          { label: "No Revenue",     cls: "border-destructive text-destructive" },
  cost_without_revenue:{ label: "Cost w/o Rev",   cls: "border-destructive text-destructive" },
  negative_profit:     { label: "Neg Profit",      cls: "border-destructive text-destructive" },
  low_margin:          { label: "Low Margin",      cls: "border-orange-400 text-orange-500" },
  high_labor_cost:     { label: "High Labor",      cls: "border-orange-400 text-orange-500" },
  high_rideshare_cost: { label: "High Rideshare",  cls: "border-yellow-400 text-yellow-600" },
};

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ title, value, sub, icon: Icon, variant = "default" }: {
  title: string; value: string; sub?: string; icon: any; variant?: "default" | "danger" | "success" | "warn";
}) {
  const cls = { default: "", danger: "text-destructive", success: "text-green-600", warn: "text-orange-500" }[variant];
  return (
    <Card>
      <CardHeader className="pb-1 flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${cls || "text-muted-foreground"}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-xl font-bold ${cls}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────
function DetailDrawer({ moveId, open, onClose }: { moveId: string | null; open: boolean; onClose: () => void }) {
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/corporate/move-financials", moveId],
    queryFn: () =>
      moveId
        ? fetch(`/api/corporate/move-financials/${moveId}`, { credentials: "include" }).then(r => r.json())
        : Promise.resolve(null),
    enabled: !!moveId && open,
  });

  const d = data ?? {};

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            Move Profitability Detail
            {d.move_number && <Badge variant="outline">{d.move_number}</Badge>}
          </SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : (
          <div className="space-y-6 text-sm">
            {/* Margin Breakdown */}
            <section>
              <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-3">Margin Breakdown</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">Revenue</div>
                  <div className="font-bold text-base text-green-600">{fmt$(d.revenue_amount)}</div>
                  <div className="text-xs text-muted-foreground mt-1">{d.allocation_method === "equal_split" ? "Equal split allocation" : "Direct bill rate"}</div>
                </div>
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">Total Cost</div>
                  <div className="font-bold text-base">{fmt$(d.total_cost)}</div>
                </div>
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">Gross Profit</div>
                  <div className={`font-bold text-base ${parseFloat(d.gross_profit) < 0 ? "text-destructive" : "text-green-600"}`}>{fmt$(d.gross_profit)}</div>
                </div>
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">Margin %</div>
                  <div className={`font-bold text-base ${parseFloat(d.margin_pct) < 0 ? "text-destructive" : parseFloat(d.margin_pct) < 0.05 ? "text-orange-500" : "text-green-600"}`}>
                    {d.margin_pct != null ? fmtPct(d.margin_pct) : "—"}
                  </div>
                </div>
              </div>
            </section>

            <Separator />

            {/* Revenue Detail */}
            <section>
              <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-3">Revenue Detail</h3>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice</span>
                  <span>{d.invoice_number ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Billing Period</span>
                  <span>{d.billing_period_start ? `${fmtDate(d.billing_period_start)} – ${fmtDate(d.billing_period_end)}` : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Allocation Method</span>
                  <Badge variant="outline" className="text-xs">{d.allocation_method ?? "—"}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Revenue Amount</span>
                  <span className="font-semibold">{fmt$(d.revenue_amount)}</span>
                </div>
              </div>
            </section>

            <Separator />

            {/* Labor Cost Detail */}
            <section>
              <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-3">Labor Cost Detail</h3>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Driver</span>
                  <span>{d.driver_name ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Driver Type</span>
                  <Badge variant="outline" className="text-xs capitalize">{d.driver_type ?? "—"}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Costing Method</span>
                  <span className="capitalize">{(d.labor_costing_method ?? "—").replace(/_/g, " ")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CPM Basis</span>
                  <span>{d.labor_cpm_basis ? fmt$(d.labor_cpm_basis) : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pay Period</span>
                  <span>{d.pay_period_start ? `${fmtDate(d.pay_period_start)} – ${fmtDate(d.pay_period_end)}` : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Labor Cost</span>
                  <span className="font-semibold">{fmt$(d.labor_cost)}</span>
                </div>
              </div>
            </section>

            {d.rideshare_provider && (
              <>
                <Separator />
                <section>
                  <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-3">Rideshare Detail</h3>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Provider</span>
                      <Badge variant="outline" className="text-xs capitalize">{d.rideshare_provider}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Rider</span>
                      <span>{d.rider_name ?? "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pickup</span>
                      <span className="text-right max-w-[220px] text-xs">{d.pickup_address_raw ?? "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Dropoff</span>
                      <span className="text-right max-w-[220px] text-xs">{d.dropoff_address_raw ?? "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Rideshare Cost</span>
                      <span className="font-semibold">{fmt$(d.rideshare_cost)}</span>
                    </div>
                  </div>
                </section>
              </>
            )}

            <Separator />

            {/* Move Info */}
            <section>
              <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-3">Move Info</h3>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Move #</span>
                  <span>{d.move_number ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span>{fmtDate(d.move_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Origin → Dest</span>
                  <span className="text-right text-xs">{d.origin ?? "—"} → {d.destination ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Distance</span>
                  <span>{d.distance ? `${parseFloat(d.distance).toFixed(1)} mi` : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Move Type</span>
                  <span className="capitalize">{d.move_type ?? "—"}</span>
                </div>
              </div>
            </section>

            {/* Anomaly codes */}
            {d.anomaly_flag && (Array.isArray(d.anomaly_codes) && d.anomaly_codes.length > 0) && (
              <>
                <Separator />
                <section>
                  <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-3">Anomaly Flags</h3>
                  <div className="flex flex-wrap gap-1">
                    {d.anomaly_codes.map((code: string) => {
                      const cfg = ANOMALY_LABELS[code] ?? { label: code, cls: "border-muted text-muted-foreground" };
                      return <Badge key={code} variant="outline" className={`text-xs ${cfg.cls}`}>{cfg.label}</Badge>;
                    })}
                  </div>
                </section>
              </>
            )}

            {/* Navigation */}
            <Separator />
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => navigate("/reports/account-profitability")} data-testid="btn-detail-goto-profitability">
                <ExternalLink className="h-3 w-3 mr-1" /> Account Profitability
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate("/reports/openforce")} data-testid="btn-detail-goto-openforce">
                <ExternalLink className="h-3 w-3 mr-1" /> Cost Per Move
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate("/reports/rideshare")} data-testid="btn-detail-goto-rideshare">
                <ExternalLink className="h-3 w-3 mr-1" /> Rideshare Reconciliation
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//   MAIN PAGE
// ═════════════════════════════════════════════════════════════════════════════
const PAGE_SIZE = 100;

export default function MoveProfitability() {
  const def = defaultRange();
  const [dateFrom, setDateFrom] = useState(def.start);
  const [dateTo,   setDateTo]   = useState(def.end);
  const [search,   setSearch]   = useState("");
  const [negativeProfitOnly, setNegativeProfitOnly] = useState(false);
  const [lowMarginOnly,      setLowMarginOnly]      = useState(false);
  const [anomalyOnly,        setAnomalyOnly]        = useState(false);
  const [offset,   setOffset]   = useState(0);
  const [selectedMoveId, setSelectedMoveId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  // Reset page when filters change
  useEffect(() => { setOffset(0); }, [dateFrom, dateTo, search, negativeProfitOnly, lowMarginOnly, anomalyOnly]);

  const summaryParams = new URLSearchParams({ dateFrom, dateTo });
  const { data: summary, isLoading: summaryLoading } = useQuery<any>({
    queryKey: ["/api/corporate/move-financials/summary", dateFrom, dateTo],
    queryFn: () => fetch(`/api/corporate/move-financials/summary?${summaryParams}`, { credentials: "include" }).then(r => r.json()),
  });

  const listParams = new URLSearchParams({
    dateFrom, dateTo, limit: String(PAGE_SIZE), offset: String(offset),
    ...(search             ? { search }                          : {}),
    ...(negativeProfitOnly ? { negativeProfitOnly: "true" }     : {}),
    ...(lowMarginOnly      ? { lowMarginOnly:      "true" }     : {}),
    ...(anomalyOnly        ? { anomalyOnly:        "true" }     : {}),
  });
  const { data: listData, isLoading: listLoading } = useQuery<any>({
    queryKey: ["/api/corporate/move-financials", dateFrom, dateTo, search, negativeProfitOnly, lowMarginOnly, anomalyOnly, offset],
    queryFn: () => fetch(`/api/corporate/move-financials?${listParams}`, { credentials: "include" }).then(r => r.json()),
  });

  const runEngine = useMutation({
    mutationFn: () => apiRequest("POST", "/api/corporate/move-financials/run-engine"),
    onSuccess: (data: any) => {
      toast({ title: "Engine completed", description: `${data?.inserted ?? 0} move financials calculated.` });
      qc.invalidateQueries({ queryKey: ["/api/corporate/move-financials"] });
    },
    onError: (err: any) => {
      toast({ title: "Engine error", description: err.message, variant: "destructive" });
    },
  });

  const rows       = listData?.rows  ?? [];
  const totalRows  = listData?.total ?? 0;
  const totalPages = Math.ceil(totalRows / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  function openDrawer(moveId: string) {
    setSelectedMoveId(moveId);
    setDrawerOpen(true);
  }

  const negProfitCount = parseInt(summary?.negative_profit_count ?? "0");
  const anomalyCount   = parseInt(summary?.anomaly_count ?? "0");
  const avgMargin      = summary?.avg_margin_pct;

  return (
    <div className="p-4 space-y-5 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Move Profitability</h1>
          <p className="text-sm text-muted-foreground">Granular revenue, cost, and margin for every completed move</p>
        </div>
        <Button
          onClick={() => runEngine.mutate()}
          disabled={runEngine.isPending}
          data-testid="btn-run-engine"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${runEngine.isPending ? "animate-spin" : ""}`} />
          {runEngine.isPending ? "Calculating…" : "Run Engine"}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <KpiCard title="Total Moves"      value={fmtN(summary?.total_moves)}     icon={BarChart2}    />
        <KpiCard title="Total Revenue"    value={fmt$(summary?.total_revenue)}    icon={DollarSign}  variant="success" />
        <KpiCard title="Total Cost"       value={fmt$(summary?.total_cost)}       icon={TrendingDown} />
        <KpiCard title="Gross Profit"     value={fmt$(summary?.total_gross_profit)} icon={TrendingUp}
          variant={parseFloat(summary?.total_gross_profit ?? "0") >= 0 ? "success" : "danger"} />
        <KpiCard title="Avg Margin"       value={avgMargin != null ? `${parseFloat(avgMargin).toFixed(1)}%` : "—"}
          icon={Zap}
          variant={parseFloat(avgMargin ?? "0") < 0 ? "danger" : parseFloat(avgMargin ?? "0") < 5 ? "warn" : "success"} />
        <KpiCard title="Negative Profit"  value={fmtN(negProfitCount)} sub={`${anomalyCount} anomalies`}
          icon={AlertTriangle} variant={negProfitCount > 0 ? "danger" : "default"} />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" data-testid="input-date-from" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" data-testid="input-date-to" />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <Label className="text-xs">Search Move # or Account</Label>
              <Input
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                data-testid="input-search"
              />
            </div>
            <div className="flex gap-4 items-center flex-wrap">
              <label className="flex items-center gap-2 text-sm cursor-pointer" data-testid="filter-negative-profit">
                <Checkbox checked={negativeProfitOnly} onCheckedChange={v => setNegativeProfitOnly(!!v)} />
                <span>Negative Profit Only</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer" data-testid="filter-low-margin">
                <Checkbox checked={lowMarginOnly} onCheckedChange={v => setLowMarginOnly(!!v)} />
                <span>Low Margin Only</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer" data-testid="filter-anomaly">
                <Checkbox checked={anomalyOnly} onCheckedChange={v => setAnomalyOnly(!!v)} />
                <span>Anomalies Only</span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grid */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-semibold">
            {totalRows.toLocaleString()} Moves
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Page {currentPage} of {totalPages || 1}
            </span>
            <Button size="icon" variant="ghost" onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0} data-testid="btn-prev-page">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setOffset(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= totalRows} data-testid="btn-next-page">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {listLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No move financial records found.{" "}
              {totalRows === 0 && (
                <Button variant="link" className="p-0 h-auto" onClick={() => runEngine.mutate()} data-testid="btn-run-engine-inline">
                  Run the engine
                </Button>
              )}{" "}
              to calculate profitability.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Move #</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Labor</TableHead>
                    <TableHead className="text-right">Rideshare</TableHead>
                    <TableHead className="text-right">Total Cost</TableHead>
                    <TableHead className="text-right">Gross Profit</TableHead>
                    <TableHead className="text-right">Margin %</TableHead>
                    <TableHead>Flags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r: any) => {
                    const profit = parseFloat(r.gross_profit ?? "0");
                    const margin = r.margin_pct != null ? parseFloat(r.margin_pct) : null;
                    const profitCls = profit < 0 ? "text-destructive font-semibold" : profit > 0 ? "text-green-600 font-semibold" : "";
                    const marginCls = margin === null ? "" : margin < 0 ? "text-destructive font-semibold" : margin < 0.05 ? "text-orange-500 font-semibold" : "text-green-600 font-semibold";
                    const codes: string[] = Array.isArray(r.anomaly_codes) ? r.anomaly_codes : [];

                    return (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer"
                        onClick={() => openDrawer(r.move_id)}
                        data-testid={`row-move-${r.id}`}
                      >
                        <TableCell className="font-mono text-xs">{r.move_number ?? r.move_id?.slice(0, 8)}</TableCell>
                        <TableCell>
                          <div className="text-xs font-medium">{r.account_name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{r.account_number}</div>
                        </TableCell>
                        <TableCell className="text-xs">{fmtDate(r.move_date)}</TableCell>
                        <TableCell className="text-right text-xs">{fmt$(r.revenue_amount)}</TableCell>
                        <TableCell className="text-right text-xs">{fmt$(r.labor_cost)}</TableCell>
                        <TableCell className="text-right text-xs">{parseFloat(r.rideshare_cost) > 0 ? fmt$(r.rideshare_cost) : <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-right text-xs">{fmt$(r.total_cost)}</TableCell>
                        <TableCell className={`text-right text-xs ${profitCls}`}>{fmt$(r.gross_profit)}</TableCell>
                        <TableCell className={`text-right text-xs ${marginCls}`}>{margin !== null ? fmtPct(r.margin_pct) : "—"}</TableCell>
                        <TableCell>
                          {codes.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {codes.slice(0, 2).map((code: string) => {
                                const cfg = ANOMALY_LABELS[code] ?? { label: code, cls: "" };
                                return (
                                  <Badge key={code} variant="outline" className={`text-xs ${cfg.cls}`}>
                                    {cfg.label}
                                  </Badge>
                                );
                              })}
                              {codes.length > 2 && (
                                <Badge variant="outline" className="text-xs">+{codes.length - 2}</Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Drawer */}
      <DetailDrawer
        moveId={selectedMoveId}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
