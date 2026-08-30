import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign, TrendingDown, TrendingUp, AlertTriangle,
  ShieldAlert, Car, Truck, Users, BarChart2, ExternalLink,
  RefreshCw, Zap, CreditCard,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt$(v: unknown, dec = 2) {
  const n = parseFloat(String(v ?? "0")) || 0;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtN(v: unknown) {
  return (parseInt(String(v ?? "0")) || 0).toLocaleString();
}
function fmtPct(v: unknown) {
  if (v === null || v === undefined || String(v) === "") return "—";
  return parseFloat(String(v)).toFixed(1) + "%";
}
function fmtAge(d: string | null | undefined) {
  if (!d) return "—";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  return days === 0 ? "Today" : `${days}d`;
}

// Default date range: last 90 days
function defaultRange() {
  const end = new Date();
  const start = new Date(); start.setDate(end.getDate() - 90);
  return {
    start: start.toISOString().slice(0, 10),
    end:   end.toISOString().slice(0, 10),
  };
}

const SEVERITY_CONFIG: Record<string, { label: string; cls: string }> = {
  critical: { label: "Critical", cls: "text-destructive font-semibold" },
  high:     { label: "High",     cls: "text-orange-500 font-semibold" },
  medium:   { label: "Medium",   cls: "text-yellow-500" },
  low:      { label: "Low",      cls: "text-muted-foreground" },
};

const ANOMALY_LABELS: Record<string, string> = {
  low_margin:         "Low Margin",
  negative_profit:    "Neg Profit",
  high_cost_per_move: "High CPM",
  high_rideshare_cost:"High RS",
  high_labor_cost:    "High Labor",
};

// ── Shared Widget Shell ───────────────────────────────────────────────────────
function WidgetCard({
  title, icon: Icon, linkTo, children, loading,
}: {
  title: string; icon: any; linkTo?: string; children: React.ReactNode; loading?: boolean;
}) {
  const [, navigate] = useLocation();
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary shrink-0" />
          {title}
        </CardTitle>
        {linkTo && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate(linkTo)}
            data-testid={`btn-widget-link-${title.replace(/\s+/g, "-").toLowerCase()}`}
          >
            <ExternalLink className="h-3 w-3 mr-1" /> Open
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0 flex-1">
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
          </div>
        ) : children}
      </CardContent>
    </Card>
  );
}

// ── KPI Pill ─────────────────────────────────────────────────────────────────
function KpiPill({ label, value, color = "" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-3 py-2">
      <span className={`text-lg font-bold ${color}`}>{value}</span>
      <span className="text-xs text-muted-foreground text-center">{label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   WIDGET 1 — Account Profitability Alerts
// ─────────────────────────────────────────────────────────────────────────────
function W1AccountAlerts({ rows, loading }: { rows: any[]; loading: boolean }) {
  return (
    <WidgetCard title="Account Profitability Alerts" icon={TrendingDown} linkTo="/reports/account-profitability" loading={loading}>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No low-margin accounts in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => {
                const margin = parseFloat(r.margin_pct_display);
                const mCls = margin < 0 ? "text-destructive font-semibold" : margin < 5 ? "text-orange-500 font-semibold" : "text-green-600 font-semibold";
                return (
                  <TableRow key={r.id} data-testid={`row-w1-${r.id}`}>
                    <TableCell>
                      <div className="text-xs font-medium">{r.account_name}</div>
                      <div className="text-xs text-muted-foreground">{r.account_number}</div>
                    </TableCell>
                    <TableCell className="text-right text-xs">{fmt$(r.total_revenue)}</TableCell>
                    <TableCell className="text-right text-xs">{fmt$(r.total_cost)}</TableCell>
                    <TableCell className={`text-right text-xs ${parseFloat(r.gross_profit) < 0 ? "text-destructive font-semibold" : ""}`}>
                      {fmt$(r.gross_profit)}
                    </TableCell>
                    <TableCell className={`text-right text-xs ${mCls}`}>{fmtPct(r.margin_pct_display)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </WidgetCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   WIDGET 2 — Chase Driver Opportunity
// ─────────────────────────────────────────────────────────────────────────────
function W2ChaseDriver({ rows, loading }: { rows: any[]; loading: boolean }) {
  return (
    <WidgetCard title="Chase Driver Opportunity" icon={Zap} linkTo="/reports/rideshare-optimization" loading={loading}>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No chase opportunities detected.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Avg Daily RS</TableHead>
                <TableHead className="text-right">Est Driver Cost</TableHead>
                <TableHead className="text-right">Est Savings</TableHead>
                <TableHead>Shift</TableHead>
                <TableHead className="text-right">Confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow key={r.account_id} data-testid={`row-w2-${r.account_id}`}>
                  <TableCell>
                    <div className="text-xs font-medium">{r.account_name}</div>
                    <div className="text-xs text-muted-foreground">{r.account_number}</div>
                  </TableCell>
                  <TableCell className="text-right text-xs">{fmt$(r.avg_daily_spend)}</TableCell>
                  <TableCell className="text-right text-xs">{fmt$(r.est_driver_cost)}</TableCell>
                  <TableCell className="text-right text-xs text-green-600 font-semibold">{fmt$(r.est_daily_savings)}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{r.recommended_shift}</Badge></TableCell>
                  <TableCell className="text-right text-xs">{Math.round(parseFloat(r.confidence ?? "0") * 100)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </WidgetCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   WIDGET 3 — Driver Utilization & Recovery
// ─────────────────────────────────────────────────────────────────────────────
function W3Utilization({ rows, loading }: { rows: any[]; loading: boolean }) {
  return (
    <WidgetCard title="Driver Utilization & Recoverable Spend" icon={Users} linkTo="/reports/rideshare-optimization" loading={loading}>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No utilization data in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Rides</TableHead>
                <TableHead className="text-right">RS Spend</TableHead>
                <TableHead className="text-right">Recoverable</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow key={r.account_id} data-testid={`row-w3-${r.account_id}`}>
                  <TableCell>
                    <div className="text-xs font-medium">{r.account_name}</div>
                    <div className="text-xs text-muted-foreground">{r.account_number}</div>
                  </TableCell>
                  <TableCell className="text-right text-xs">{fmtN(r.ride_count)}</TableCell>
                  <TableCell className="text-right text-xs">{fmt$(r.rideshare_spend)}</TableCell>
                  <TableCell className="text-right text-xs text-green-600 font-semibold">{fmt$(r.recoverable_spend)}</TableCell>
                  <TableCell>
                    {parseFloat(r.recoverable_spend) >= 500 ? (
                      <Badge className="text-xs">Add Chase Driver</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Use Existing</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </WidgetCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   WIDGET 4 — Cost Per Move (Account View)
// ─────────────────────────────────────────────────────────────────────────────
function W4CostPerMove({ rows, loading }: { rows: any[]; loading: boolean }) {
  return (
    <WidgetCard title="Cost Per Move by Account" icon={Truck} linkTo="/reports/openforce" loading={loading}>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No cost per move data in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Moves</TableHead>
                <TableHead className="text-right">Labor Cost</TableHead>
                <TableHead className="text-right">Avg CPM</TableHead>
                <TableHead className="text-right">Shift / OD</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => {
                const cpm = parseFloat(r.avg_cpm ?? "0");
                const cpmCls = cpm > 75 ? "text-destructive font-semibold" : cpm > 50 ? "text-orange-500 font-semibold" : "text-foreground";
                return (
                  <TableRow key={r.account_id} data-testid={`row-w4-${r.account_id}`}>
                    <TableCell>
                      <div className="text-xs font-medium">{r.account_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.account_number}</div>
                    </TableCell>
                    <TableCell className="text-right text-xs">{fmtN(r.total_moves)}</TableCell>
                    <TableCell className="text-right text-xs">{fmt$(r.total_labor_cost)}</TableCell>
                    <TableCell className={`text-right text-xs ${cpmCls}`}>{fmt$(r.avg_cpm)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {fmtN(r.shift_moves)} / {fmtN(r.ondemand_moves)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </WidgetCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   WIDGET 5 — Pay Reconciliation Summary
// ─────────────────────────────────────────────────────────────────────────────
function W5PayRecon({ data, loading }: { data: any; loading: boolean }) {
  const totalDrivers   = parseInt(data?.total_drivers ?? "0");
  const reconciledCount= parseInt(data?.reconciled_count ?? "0");
  const reconciledPct  = totalDrivers > 0 ? Math.round((reconciledCount / totalDrivers) * 100) : 0;
  const anomalyCount   = parseInt(data?.anomaly_count ?? "0");

  return (
    <WidgetCard title="Pay Reconciliation Summary" icon={BarChart2} linkTo="/reports/openforce" loading={loading}>
      <div className="divide-y">
        <div className="flex justify-around py-3">
          <KpiPill label="Total Gross Pay"  value={fmt$(data?.total_gross_pay)} />
          <KpiPill label="Drivers"          value={fmtN(data?.total_drivers)} />
          <KpiPill label="Reconciled"       value={`${reconciledPct}%`} color={reconciledPct >= 90 ? "text-green-600" : "text-orange-500"} />
          <KpiPill label="Anomalies"        value={fmtN(data?.anomaly_count)} color={anomalyCount > 0 ? "text-destructive" : ""} />
        </div>
        <div className="flex justify-around py-3">
          <KpiPill label="Avg Hourly Rate"  value={data?.avg_hourly_rate ? fmt$(data.avg_hourly_rate) : "—"} />
          <KpiPill label="Avg Trip Rate"    value={data?.avg_trip_rate   ? fmt$(data.avg_trip_rate)   : "—"} />
          <KpiPill label="Variance Count"   value={fmtN(data?.variance_count)} color={parseInt(data?.variance_count) > 0 ? "text-orange-500" : ""} />
        </div>
      </div>
    </WidgetCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   WIDGET 6 — Top Exceptions
// ─────────────────────────────────────────────────────────────────────────────
function W6Exceptions({ rows, kpis, loading }: { rows: any[]; kpis: any; loading: boolean }) {
  return (
    <WidgetCard title="Top Exceptions" icon={ShieldAlert} linkTo="/exceptions" loading={loading}>
      {/* Summary strip */}
      <div className="flex gap-4 px-4 py-2 border-b">
        <div className="text-xs">
          <span className="text-destructive font-bold">{kpis?.critical ?? 0}</span>
          <span className="text-muted-foreground ml-1">Critical</span>
        </div>
        <div className="text-xs">
          <span className="text-orange-500 font-bold">{kpis?.high ?? 0}</span>
          <span className="text-muted-foreground ml-1">High</span>
        </div>
        <div className="text-xs">
          <span className="font-bold">{kpis?.total_open ?? 0}</span>
          <span className="text-muted-foreground ml-1">Total Open</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No open exceptions.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Severity</TableHead>
                <TableHead>Exception</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead className="text-right">Age</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => {
                const cfg = SEVERITY_CONFIG[r.severity] ?? SEVERITY_CONFIG.low;
                return (
                  <TableRow key={r.id} data-testid={`row-w6-${r.id}`}>
                    <TableCell>
                      <span className={`text-xs ${cfg.cls}`}>{cfg.label}</span>
                    </TableCell>
                    <TableCell className="text-xs">{(r.exception_type ?? "").replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-xs text-muted-foreground capitalize">{r.entity_type}</TableCell>
                    <TableCell className="text-right text-xs">{r.age_days != null ? `${r.age_days}d` : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </WidgetCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   WIDGET 7 — Rideshare Spend Summary
// ─────────────────────────────────────────────────────────────────────────────
function W7RideshareSpend({ data, loading }: { data: any; loading: boolean }) {
  const totalSpend  = parseFloat(data?.total_spend  ?? "0");
  const billedSpend = parseFloat(data?.billed_spend ?? "0");
  const billedPct   = totalSpend > 0 ? Math.round((billedSpend / totalSpend) * 100) : 0;

  return (
    <WidgetCard title="Rideshare Spend Summary" icon={Car} linkTo="/reports/rideshare" loading={loading}>
      <div className="divide-y">
        <div className="flex justify-around py-3">
          <KpiPill label="Total Spend"    value={fmt$(data?.total_spend)} />
          <KpiPill label="Total Rides"    value={fmtN(data?.total_rides)} />
          <KpiPill label="Avg per Ride"   value={fmt$(data?.avg_cost_per_ride)} />
        </div>
        <div className="flex justify-around py-3">
          <KpiPill label="Billed"     value={fmt$(data?.billed_spend)}    color="text-green-600" />
          <KpiPill label="Unbilled"   value={fmt$(data?.unbilled_spend)}  color={parseFloat(data?.unbilled_spend) > 500 ? "text-orange-500" : ""} />
          <KpiPill label="Billed %"   value={`${billedPct}%`} color={billedPct >= 80 ? "text-green-600" : "text-orange-500"} />
        </div>
        {/* Provider breakdown */}
        <div className="flex justify-around py-3">
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Uber</div>
            <div className="text-sm font-semibold">{fmt$(data?.uber_spend)}</div>
            <div className="text-xs text-muted-foreground">{fmtN(data?.uber_rides)} rides</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Lyft</div>
            <div className="text-sm font-semibold">{fmt$(data?.lyft_spend)}</div>
            <div className="text-xs text-muted-foreground">{fmtN(data?.lyft_rides)} rides</div>
          </div>
        </div>
      </div>
    </WidgetCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   WIDGET 8 — Labor vs Rideshare Mix
// ─────────────────────────────────────────────────────────────────────────────
function W8LaborMix({ data, loading }: { data: any; loading: boolean }) {
  const labor   = parseFloat(data?.total_labor_cost     ?? "0");
  const rs      = parseFloat(data?.total_rideshare_cost ?? "0");
  const total   = labor + rs || 1;
  const laborPct = Math.round((labor / total) * 100);
  const rsPct    = 100 - laborPct;

  return (
    <WidgetCard title="Labor vs Rideshare Cost Mix" icon={DollarSign} linkTo="/reports/account-profitability" loading={loading}>
      <div className="divide-y">
        <div className="flex justify-around py-3">
          <KpiPill label="Total Revenue"  value={fmt$(data?.total_revenue)} color="text-green-600" />
          <KpiPill label="Gross Profit"   value={fmt$(data?.total_gross_profit)}
            color={parseFloat(data?.total_gross_profit) < 0 ? "text-destructive" : "text-green-600"} />
          <KpiPill label="Accounts"       value={fmtN(data?.account_count)} />
        </div>
        <div className="p-4 space-y-3">
          {/* Visual mix bar */}
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Labor {laborPct}%</span>
              <span>Rideshare {rsPct}%</span>
            </div>
            <div className="flex rounded-full overflow-hidden h-3 gap-px">
              <div style={{ width: `${laborPct}%` }} className="bg-primary/70" title={`Labor ${fmt$(labor)}`} />
              <div style={{ width: `${rsPct}%` }}   className="bg-orange-400/70" title={`Rideshare ${fmt$(rs)}`} />
            </div>
          </div>
          <div className="flex justify-around">
            <div className="text-center">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-primary/70" /> Labor
              </div>
              <div className="font-semibold text-sm">{fmt$(labor)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-orange-400/70" /> Rideshare
              </div>
              <div className="font-semibold text-sm">{fmt$(rs)}</div>
            </div>
          </div>
        </div>
      </div>
    </WidgetCard>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//   MAIN PAGE
// ═════════════════════════════════════════════════════════════════════════════
export default function InsightsDashboard() {
  const def = defaultRange();
  const [dateFrom, setDateFrom] = useState(def.start);
  const [dateTo,   setDateTo]   = useState(def.end);
  const [tab, setTab] = useState("executive");

  const params = new URLSearchParams({ dateFrom, dateTo });

  const { data, isLoading, refetch, isFetching } = useQuery<any>({
    queryKey: ["/api/corporate/dashboard/widgets", dateFrom, dateTo],
    queryFn: () =>
      fetch(`/api/corporate/dashboard/widgets?${params}`, { credentials: "include" }).then(r => r.json()),
    staleTime: 2 * 60 * 1000, // 2 min
  });

  const w = data?.widgets ?? {};
  const loading = isLoading;

  return (
    <div className="p-4 space-y-5 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Insights Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Financial performance, labor efficiency, rideshare, and risk — in one view
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="btn-refresh-dashboard"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Global Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Date From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-36"
                data-testid="input-date-from"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Date To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-36"
                data-testid="input-date-to"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const e = new Date(); const s = new Date(); s.setDate(e.getDate() - 7);
                  setDateFrom(s.toISOString().slice(0,10)); setDateTo(e.toISOString().slice(0,10));
                }}
                data-testid="btn-preset-7d"
              >7d</Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const e = new Date(); const s = new Date(); s.setDate(e.getDate() - 30);
                  setDateFrom(s.toISOString().slice(0,10)); setDateTo(e.toISOString().slice(0,10));
                }}
                data-testid="btn-preset-30d"
              >30d</Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDateFrom(def.start); setDateTo(def.end);
                }}
                data-testid="btn-preset-90d"
              >90d</Button>
            </div>
            {data?.dateFrom && (
              <p className="text-xs text-muted-foreground self-end">
                Showing: {data.dateFrom} → {data.dateTo}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* View Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-testid="tabs-dashboard-views">
          <TabsTrigger value="executive" data-testid="tab-executive">Executive View</TabsTrigger>
          <TabsTrigger value="operations" data-testid="tab-operations">Operations View</TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">All Widgets</TabsTrigger>
        </TabsList>

        {/* ── Executive View ───────────────────────────────────────────────── */}
        <TabsContent value="executive" className="mt-4">
          <div className="space-y-4">
            {/* Row 1: Financial Performance */}
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Financial Performance
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <W8LaborMix    data={w.laborMix}    loading={loading} />
                <W7RideshareSpend data={w.rideshareSpend} loading={loading} />
              </div>
            </section>

            {/* Row 2: Profitability Alerts + Exceptions */}
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Risk &amp; Profitability
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <W1AccountAlerts rows={w.accountAlerts ?? []} loading={loading} />
                <W6Exceptions    rows={w.topExceptions ?? []} kpis={w.exceptionKpis} loading={loading} />
              </div>
            </section>
          </div>
        </TabsContent>

        {/* ── Operations View ──────────────────────────────────────────────── */}
        <TabsContent value="operations" className="mt-4">
          <div className="space-y-4">
            {/* Row 1: Labor Efficiency */}
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Labor Efficiency
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <W4CostPerMove rows={w.costPerMoveAccounts ?? []} loading={loading} />
                <W5PayRecon    data={w.payReconSummary}          loading={loading} />
              </div>
            </section>

            {/* Row 2: Rideshare Optimization */}
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Rideshare Optimization
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <W2ChaseDriver  rows={w.chaseOpportunity ?? []} loading={loading} />
                <W3Utilization  rows={w.utilization ?? []}       loading={loading} />
              </div>
            </section>

            {/* Row 3: Exceptions */}
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Operational Health
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <W6Exceptions rows={w.topExceptions ?? []} kpis={w.exceptionKpis} loading={loading} />
                <W1AccountAlerts rows={w.accountAlerts ?? []} loading={loading} />
              </div>
            </section>
          </div>
        </TabsContent>

        {/* ── All Widgets ──────────────────────────────────────────────────── */}
        <TabsContent value="all" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            <W8LaborMix        data={w.laborMix}              loading={loading} />
            <W7RideshareSpend  data={w.rideshareSpend}        loading={loading} />
            <W5PayRecon        data={w.payReconSummary}       loading={loading} />
            <W1AccountAlerts   rows={w.accountAlerts ?? []}   loading={loading} />
            <W6Exceptions      rows={w.topExceptions ?? []}   kpis={w.exceptionKpis} loading={loading} />
            <W4CostPerMove     rows={w.costPerMoveAccounts ?? []} loading={loading} />
            <W2ChaseDriver     rows={w.chaseOpportunity ?? []} loading={loading} />
            <W3Utilization     rows={w.utilization ?? []}     loading={loading} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
