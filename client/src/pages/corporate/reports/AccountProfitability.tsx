import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign, TrendingDown, TrendingUp, AlertTriangle,
  RefreshCw, ChevronUp, ChevronDown, ExternalLink,
  BarChart2, Truck, CreditCard, Users,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt$(v: unknown, dec = 2) {
  const n = parseFloat(String(v ?? "0")) || 0;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtPct(v: unknown) {
  if (v === null || v === undefined || String(v) === "") return "—";
  const n = parseFloat(String(v)) * 100;
  return n.toFixed(1) + "%";
}
function fmtN(v: unknown) {
  const n = parseInt(String(v ?? "0")) || 0;
  return n.toLocaleString();
}

function getISOWeekBounds(weeksBack = 1): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() + diffToMon - 7 * weeksBack);
  const thisSunday = new Date(thisMonday);
  thisSunday.setDate(thisMonday.getDate() + 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(thisMonday), end: iso(thisSunday) };
}

const ANOMALY_LABELS: Record<string, string> = {
  low_margin: "Low Margin",
  negative_profit: "Negative Profit",
  high_cost_per_move: "High CPM",
  high_rideshare_cost: "High Rideshare",
  high_labor_cost: "High Labor Cost",
};

function AnomalyBadge({ code }: { code: string }) {
  const color =
    code === "negative_profit" ? "destructive" :
    code === "low_margin" ? "secondary" :
    "outline";
  return (
    <Badge variant={color as any} className="text-xs">
      {ANOMALY_LABELS[code] ?? code}
    </Badge>
  );
}

function MarginBadge({ pct }: { pct: string | null }) {
  if (pct === null || pct === undefined) return <span className="text-muted-foreground">—</span>;
  const n = parseFloat(String(pct)) * 100;
  const cls = n < 0 ? "text-destructive font-semibold" : n < 5 ? "text-orange-500 font-semibold" : "text-green-600 font-semibold";
  return <span className={cls}>{n.toFixed(1)}%</span>;
}

// ── KPI Cards ────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, icon: Icon, sub, className = "",
}: { label: string; value: string; icon: any; sub?: string; className?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">{label}</span>
          <Icon className={`h-4 w-4 shrink-0 ${className}`} />
        </div>
        <div className={`text-xl font-bold mt-1 ${className}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────
function AccountDetailDrawer({ summaryId, onClose }: { summaryId: string; onClose: () => void }) {
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/corporate/account-profitability", summaryId],
    queryFn: () => fetch(`/api/corporate/account-profitability/${summaryId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!summaryId,
  });

  const s = data?.summary;

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>
            {s ? `${s.account_name} — ${s.account_number ?? ""}` : "Account Detail"}
          </SheetTitle>
          {s && (
            <p className="text-sm text-muted-foreground">
              Period: {s.period_start} → {s.period_end}
            </p>
          )}
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : s ? (
          <div className="space-y-6">
            {/* Margin Analysis */}
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">Margin Analysis</h3>
              <div className="grid grid-cols-2 gap-3">
                <Card><CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Revenue</div>
                  <div className="font-semibold">{fmt$(s.total_revenue)}</div>
                </CardContent></Card>
                <Card><CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Total Cost</div>
                  <div className="font-semibold">{fmt$(s.total_cost)}</div>
                </CardContent></Card>
                <Card><CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Gross Profit</div>
                  <div className={`font-semibold ${parseFloat(s.gross_profit) < 0 ? "text-destructive" : "text-green-600"}`}>{fmt$(s.gross_profit)}</div>
                </CardContent></Card>
                <Card><CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Margin %</div>
                  <MarginBadge pct={s.margin_pct} />
                </CardContent></Card>
              </div>
              {s.anomaly_codes && (
                <div className="flex gap-1 flex-wrap mt-2">
                  {s.anomaly_codes.split("|").map((c: string) => <AnomalyBadge key={c} code={c} />)}
                </div>
              )}
            </section>

            <Separator />

            {/* Revenue Breakdown */}
            <section>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Revenue Breakdown</h3>
                <Button size="sm" variant="ghost" onClick={() => navigate("/invoicing")} data-testid="btn-go-invoicing">
                  <ExternalLink className="h-3 w-3 mr-1" /> Invoicing
                </Button>
              </div>
              {data.invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No invoices found in this period.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.invoices.map((inv: any) => (
                      <TableRow key={inv.id} data-testid={`row-invoice-${inv.id}`}>
                        <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                        <TableCell className="text-xs">{inv.invoice_date}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {inv.billing_period_start && inv.billing_period_end
                            ? `${inv.billing_period_start} – ${inv.billing_period_end}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{fmt$(inv.total_amount)}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{inv.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className="text-right text-sm font-semibold mt-1">Total: {fmt$(s.total_revenue)}</div>
            </section>

            <Separator />

            {/* Labor Cost Breakdown */}
            <section>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Labor Cost Breakdown</h3>
                <Button size="sm" variant="ghost" onClick={() => navigate("/reports/openforce")} data-testid="btn-go-openforce">
                  <ExternalLink className="h-3 w-3 mr-1" /> OpenForce
                </Button>
              </div>
              {data.laborBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">No labor cost data in this period.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Method</TableHead>
                      <TableHead>Driver Type</TableHead>
                      <TableHead className="text-right">Drivers</TableHead>
                      <TableHead className="text-right">Moves</TableHead>
                      <TableHead className="text-right">Total Labor</TableHead>
                      <TableHead className="text-right">Avg/Move</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.laborBreakdown.map((row: any, i: number) => (
                      <TableRow key={i} data-testid={`row-labor-${i}`}>
                        <TableCell className="text-xs font-mono">{row.costing_method ?? "—"}</TableCell>
                        <TableCell className="text-xs">{row.driver_type ?? "—"}</TableCell>
                        <TableCell className="text-right text-xs">{fmtN(row.driver_count)}</TableCell>
                        <TableCell className="text-right text-xs">{fmtN(row.move_count)}</TableCell>
                        <TableCell className="text-right font-semibold">{fmt$(row.total_labor_cost)}</TableCell>
                        <TableCell className="text-right text-xs">{fmt$(row.avg_labor_per_move)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className="text-right text-sm font-semibold mt-1">Total: {fmt$(s.total_labor_cost)}</div>
            </section>

            <Separator />

            {/* Rideshare Breakdown */}
            <section>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Rideshare Breakdown</h3>
                <Button size="sm" variant="ghost" onClick={() => navigate("/reports/rideshare")} data-testid="btn-go-rideshare">
                  <ExternalLink className="h-3 w-3 mr-1" /> Rideshare Recon
                </Button>
              </div>
              {data.rideshareBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">No rideshare transactions in this period.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Billing Status</TableHead>
                      <TableHead className="text-right">Rides</TableHead>
                      <TableHead className="text-right">Total Cost</TableHead>
                      <TableHead className="text-right">Avg Fare</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rideshareBreakdown.map((row: any, i: number) => (
                      <TableRow key={i} data-testid={`row-rideshare-${i}`}>
                        <TableCell><Badge variant="outline" className="text-xs">{row.billing_status}</Badge></TableCell>
                        <TableCell className="text-right">{fmtN(row.ride_count)}</TableCell>
                        <TableCell className="text-right font-semibold">{fmt$(row.total_cost)}</TableCell>
                        <TableCell className="text-right text-xs">{fmt$(row.avg_fare)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className="text-right text-sm font-semibold mt-1">
                Billed Total: {fmt$(s.total_rideshare_cost)} &nbsp;|&nbsp; Rides: {fmtN(s.rideshare_ride_count)}
              </div>
            </section>

            <Separator />

            {/* Move Summary */}
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">Move Summary</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Card><CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Completed Moves</div>
                  <div className="font-semibold">{fmtN(s.total_moves)}</div>
                </CardContent></Card>
                <Card><CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Cost per Move</div>
                  <div className="font-semibold">{s.cost_per_move ? fmt$(s.cost_per_move) : "—"}</div>
                </CardContent></Card>
              </div>
              {data.moveTypes.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Move Type</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.moveTypes.map((row: any, i: number) => (
                      <TableRow key={i} data-testid={`row-movetype-${i}`}>
                        <TableCell className="text-sm">{row.move_type}</TableCell>
                        <TableCell className="text-right">{fmtN(row.move_count)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Detail not available.</p>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Sort Header ───────────────────────────────────────────────────────────────
function SortHeader({ col, label, sortBy, order, onSort }: {
  col: string; label: string; sortBy: string; order: string; onSort: (col: string) => void;
}) {
  const active = sortBy === col;
  return (
    <TableHead
      className="cursor-pointer select-none"
      onClick={() => onSort(col)}
      data-testid={`th-${col}`}
    >
      <div className="flex items-center gap-1">
        {label}
        {active ? (order === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
      </div>
    </TableHead>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//   MAIN PAGE
// ═════════════════════════════════════════════════════════════════════════════
export default function AccountProfitability() {
  const queryClient = useQueryClient();

  // Default to last full week
  const defaultBounds = getISOWeekBounds(1);
  const [periodStart, setPeriodStart] = useState(defaultBounds.start);
  const [periodEnd, setPeriodEnd]     = useState(defaultBounds.end);
  const [lowMarginOnly, setLowMarginOnly]           = useState(false);
  const [negativeProfitOnly, setNegativeProfitOnly] = useState(false);
  const [anomalyOnly, setAnomalyOnly]               = useState(false);
  const [sortBy, setSortBy]   = useState("margin_pct");
  const [order, setOrder]     = useState("asc");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const params = new URLSearchParams({
    periodStart, periodEnd,
    ...(lowMarginOnly ? { lowMarginOnly: "true" } : {}),
    ...(negativeProfitOnly ? { negativeProfitOnly: "true" } : {}),
    ...(anomalyOnly ? { anomalyOnly: "true" } : {}),
    sortBy, order,
    limit: "200",
  });

  const summaryParams = new URLSearchParams({ periodStart, periodEnd });

  const { data: summaryData, isLoading: summaryLoading } = useQuery<any>({
    queryKey: ["/api/corporate/account-profitability/summary", periodStart, periodEnd],
    queryFn: () => fetch(`/api/corporate/account-profitability/summary?${summaryParams}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: gridData, isLoading: gridLoading } = useQuery<any>({
    queryKey: ["/api/corporate/account-profitability", params.toString()],
    queryFn: () => fetch(`/api/corporate/account-profitability?${params}`, { credentials: "include" }).then(r => r.json()),
  });

  const runEngine = useMutation({
    mutationFn: () => apiRequest("POST", "/api/corporate/account-profitability/run-engine", { periodStart, periodEnd }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/account-profitability"] });
    },
  });

  const handleSort = useCallback((col: string) => {
    if (sortBy === col) setOrder(o => o === "asc" ? "desc" : "asc");
    else { setSortBy(col); setOrder("asc"); }
  }, [sortBy]);

  const kpis = summaryData?.kpis ?? {};
  const rows = gridData?.rows ?? [];
  const total = gridData?.total ?? 0;

  return (
    <div className="p-4 space-y-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Account Profitability</h1>
          <p className="text-sm text-muted-foreground">
            Gross profit engine — revenue, labor cost, rideshare cost per account
          </p>
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

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Period Start</Label>
              <Input
                type="date"
                value={periodStart}
                onChange={e => setPeriodStart(e.target.value)}
                className="w-36"
                data-testid="input-period-start"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Period End</Label>
              <Input
                type="date"
                value={periodEnd}
                onChange={e => setPeriodEnd(e.target.value)}
                className="w-36"
                data-testid="input-period-end"
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs">Sort By</Label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-44" data-testid="select-sort-by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="margin_pct">Lowest Margin</SelectItem>
                  <SelectItem value="gross_profit">Highest Profit</SelectItem>
                  <SelectItem value="total_revenue">Highest Revenue</SelectItem>
                  <SelectItem value="total_cost">Highest Cost</SelectItem>
                  <SelectItem value="cost_per_move">Cost per Move</SelectItem>
                  <SelectItem value="account_name">Account Name</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Switch
                  id="low-margin"
                  checked={lowMarginOnly}
                  onCheckedChange={setLowMarginOnly}
                  data-testid="switch-low-margin"
                />
                <Label htmlFor="low-margin" className="text-xs cursor-pointer">Low Margin Only</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="neg-profit"
                  checked={negativeProfitOnly}
                  onCheckedChange={setNegativeProfitOnly}
                  data-testid="switch-negative-profit"
                />
                <Label htmlFor="neg-profit" className="text-xs cursor-pointer">Negative Profit Only</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="anomaly-only"
                  checked={anomalyOnly}
                  onCheckedChange={setAnomalyOnly}
                  data-testid="switch-anomaly-only"
                />
                <Label htmlFor="anomaly-only" className="text-xs cursor-pointer">Alerts Only</Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {summaryLoading ? (
          Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
        ) : (
          <>
            <KpiCard label="Total Revenue"      value={fmt$(kpis.total_revenue)}      icon={DollarSign}   className="text-green-600" />
            <KpiCard label="Labor Cost"         value={fmt$(kpis.total_labor_cost)}   icon={Users} />
            <KpiCard label="Rideshare Cost"     value={fmt$(kpis.total_rideshare_cost)} icon={CreditCard} />
            <KpiCard label="Total Cost"         value={fmt$(kpis.total_cost)}         icon={BarChart2} />
            <KpiCard label="Gross Profit"       value={fmt$(kpis.total_gross_profit)} icon={parseFloat(kpis.total_gross_profit) < 0 ? TrendingDown : TrendingUp}
              className={parseFloat(kpis.total_gross_profit) < 0 ? "text-destructive" : "text-green-600"} />
            <KpiCard label="Overall Margin"     value={kpis.overall_margin_pct != null ? kpis.overall_margin_pct + "%" : "—"} icon={TrendingUp} />
            <KpiCard label="Total Moves"        value={fmtN(kpis.total_moves)}        icon={Truck} />
            <KpiCard
              label="Anomaly Accounts"
              value={String(kpis.anomaly_count ?? 0)}
              icon={AlertTriangle}
              className={parseInt(kpis.anomaly_count) > 0 ? "text-orange-500" : ""}
              sub={`${kpis.negative_profit_count ?? 0} negative profit`}
            />
          </>
        )}
      </div>

      {/* Grid */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">Account Grid</CardTitle>
          <span className="text-sm text-muted-foreground">{total} accounts</span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHeader col="account_name" label="Account"      sortBy={sortBy} order={order} onSort={handleSort} />
                  <SortHeader col="total_revenue" label="Revenue"     sortBy={sortBy} order={order} onSort={handleSort} />
                  <SortHeader col="total_cost"    label="Labor Cost"  sortBy={sortBy} order={order} onSort={handleSort} />
                  <TableHead>Rideshare Cost</TableHead>
                  <TableHead>Total Cost</TableHead>
                  <TableHead className="text-right">Moves</TableHead>
                  <SortHeader col="cost_per_move" label="CPM"        sortBy={sortBy} order={order} onSort={handleSort} />
                  <SortHeader col="gross_profit"  label="Gross Profit" sortBy={sortBy} order={order} onSort={handleSort} />
                  <SortHeader col="margin_pct"    label="Margin %"   sortBy={sortBy} order={order} onSort={handleSort} />
                  <TableHead>Alerts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gridLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={10}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
                      No data found. Run the engine to calculate account profitability.
                    </TableCell>
                  </TableRow>
                ) : rows.map((row: any) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer hover-elevate"
                    onClick={() => setSelectedId(row.id)}
                    data-testid={`row-account-${row.id}`}
                  >
                    <TableCell>
                      <div className="font-medium text-sm">{row.account_name}</div>
                      <div className="text-xs text-muted-foreground">{row.account_number ?? "—"}</div>
                    </TableCell>
                    <TableCell className="font-semibold text-green-600">{fmt$(row.total_revenue)}</TableCell>
                    <TableCell>{fmt$(row.total_labor_cost)}</TableCell>
                    <TableCell>{fmt$(row.total_rideshare_cost)}</TableCell>
                    <TableCell className="font-semibold">{fmt$(row.total_cost)}</TableCell>
                    <TableCell className="text-right">{fmtN(row.total_moves)}</TableCell>
                    <TableCell>{row.cost_per_move ? fmt$(row.cost_per_move) : "—"}</TableCell>
                    <TableCell className={parseFloat(row.gross_profit) < 0 ? "text-destructive font-semibold" : "text-green-600 font-semibold"}>
                      {fmt$(row.gross_profit)}
                    </TableCell>
                    <TableCell><MarginBadge pct={row.margin_pct} /></TableCell>
                    <TableCell>
                      {row.anomaly_codes ? (
                        <div className="flex flex-wrap gap-1">
                          {row.anomaly_codes.split("|").map((c: string) => <AnomalyBadge key={c} code={c} />)}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detail Drawer */}
      {selectedId && (
        <AccountDetailDrawer summaryId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
