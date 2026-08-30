import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  FileText, DollarSign, CreditCard, Layers, AlertTriangle,
  CheckCircle2, Clock, TrendingDown, TrendingUp, RefreshCw,
  Search, Users, CircleDot, XCircle, ChevronDown, ChevronUp,
  ShieldAlert, RotateCcw, Banknote, CircleAlert
} from "lucide-react";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyMetric {
  day: string;
  invoices_generated: number;
  total_billed: number;
  payments_count: number;
  payments_received: number;
  deposits_created: number;
}

interface RolloutAlert {
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  customerId?: string;
  customerName?: string;
  amount?: number;
}

interface CustomerRow {
  id: string;
  name: string;
  customer_status: string;
  implementation_date: string | null;
  last_invoice_date: string | null;
  health: string | null;
  program: string | null;
  invoice_count: number;
  total_billed: number;
  total_paid: number;
  outstanding: number;
  payment_count: number;
  rolloutStatus: "live" | "pending" | "not_started";
}

interface DashboardData {
  period: { days: number; startDate: string; endDate: string };
  dailyMetrics: DailyMetric[];
  totals: {
    invoicesGenerated: number;
    totalBilled: number;
    totalCollected: number;
    outstandingBalance: number;
    paymentsReceived: number;
    paymentsAmount: number;
    depositsCreated: number;
    collectionRate: number;
    variancePct: number;
  };
  exceptionSummary: {
    manualPayments: number;
    adjustments: number;
    reversals: number;
    unappliedPayments: number;
    duplicatePayments: number;
    openExceptions: number;
  };
  customerRollout: {
    total: number;
    live: number;
    pending: number;
    notStarted: number;
    customers: CustomerRow[];
  };
  alerts: RolloutAlert[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function pct(n: number) {
  return `${n.toFixed(1)}%`;
}

function alertSeverityConfig(severity: RolloutAlert["severity"]) {
  const map = {
    critical: { cls: "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40", icon: <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />, badge: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
    high:     { cls: "border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/40", icon: <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />, badge: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" },
    medium:   { cls: "border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/40", icon: <CircleAlert className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />, badge: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300" },
    low:      { cls: "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40", icon: <Clock className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />, badge: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  };
  return map[severity] ?? map.low;
}

function rolloutBadge(status: CustomerRow["rolloutStatus"]) {
  if (status === "live")
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 text-xs no-default-active-elevate"><CircleDot className="w-3 h-3 mr-1" />Live</Badge>;
  if (status === "pending")
    return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300 text-xs no-default-active-elevate"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
  return <Badge className="bg-muted text-muted-foreground text-xs no-default-active-elevate"><XCircle className="w-3 h-3 mr-1" />Not Started</Badge>;
}

function healthDot(health: string | null) {
  if (health === "green") return <span className="inline-block w-2 h-2 rounded-full bg-green-500" />;
  if (health === "yellow") return <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" />;
  if (health === "red") return <span className="inline-block w-2 h-2 rounded-full bg-red-500" />;
  return <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/30" />;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  title, value, sub, icon, accent,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent?: "green" | "red" | "orange" | "default";
}) {
  const colors = {
    green:   "text-green-700 dark:text-green-400",
    red:     "text-red-700 dark:text-red-400",
    orange:  "text-orange-700 dark:text-orange-400",
    default: "text-foreground",
  };
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className={`text-xl font-bold mt-0.5 ${colors[accent ?? "default"]}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="text-muted-foreground mt-0.5">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Exception Badge ──────────────────────────────────────────────────────────

function ExceptionCard({ label, count, icon, accent }: {
  label: string;
  count: number;
  icon: React.ReactNode;
  accent?: "red" | "orange" | "yellow" | "blue" | "default";
}) {
  const bg = {
    red:     "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
    orange:  "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800",
    yellow:  "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800",
    blue:    "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
    default: "bg-muted/40 border-border",
  }[accent ?? "default"];

  const numColor = {
    red:     "text-red-700 dark:text-red-400",
    orange:  "text-orange-700 dark:text-orange-400",
    yellow:  "text-yellow-700 dark:text-yellow-400",
    blue:    "text-blue-700 dark:text-blue-400",
    default: "text-foreground",
  }[accent ?? "default"];

  return (
    <div className={`rounded-md border px-3 py-2.5 ${bg}`}>
      <div className="flex items-center gap-2 mb-1 text-muted-foreground">{icon}<span className="text-xs">{label}</span></div>
      <p className={`text-2xl font-bold ${numColor}`}>{count}</p>
    </div>
  );
}

// ─── Daily Metrics Table ──────────────────────────────────────────────────────

function DailyMetricsTable({ rows }: { rows: DailyMetric[] }) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? rows : rows.slice(-14);

  return (
    <div className="space-y-2">
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Invoices</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Billed</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Payments</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Collected</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Deposits</th>
            </tr>
          </thead>
          <tbody>
            {[...displayed].reverse().map((row) => (
              <tr key={row.day} className="border-b last:border-0 hover-elevate">
                <td className="px-3 py-2 font-medium">
                  {format(new Date(row.day + "T00:00:00"), "MMM d")}
                </td>
                <td className="px-3 py-2 text-right">{row.invoices_generated}</td>
                <td className="px-3 py-2 text-right font-medium">{row.total_billed > 0 ? fmt(row.total_billed) : "—"}</td>
                <td className="px-3 py-2 text-right">{row.payments_count}</td>
                <td className="px-3 py-2 text-right">{row.payments_received > 0 ? fmt(row.payments_received) : "—"}</td>
                <td className="px-3 py-2 text-right">{row.deposits_created > 0 ? row.deposits_created : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 14 && (
        <Button
          size="sm"
          variant="ghost"
          className="w-full text-xs"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? <><ChevronUp className="w-3 h-3 mr-1" />Show recent only</> : <><ChevronDown className="w-3 h-3 mr-1" />Show all {rows.length} days</>}
        </Button>
      )}
    </div>
  );
}

// ─── Customer Rollout Table ───────────────────────────────────────────────────

function CustomerRolloutTable({ customers }: { customers: CustomerRow[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<"total_billed" | "outstanding" | "name">("total_billed");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const filtered = customers
    .filter((c) => {
      if (statusFilter !== "all" && c.rolloutStatus !== statusFilter) return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      let av: any = sortKey === "name" ? a.name : (a as any)[sortKey];
      let bv: any = sortKey === "name" ? b.name : (b as any)[sortKey];
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortIcon({ k }: { k: typeof sortKey }) {
    if (sortKey !== k) return <ChevronDown className="w-3 h-3 text-muted-foreground/40" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
            data-testid="input-customer-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] h-8 text-xs" data-testid="select-rollout-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Customers</SelectItem>
            <SelectItem value="live">Live</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="not_started">Not Started</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} customers</span>
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                <button className="flex items-center gap-1" onClick={() => toggleSort("name")}>
                  Customer<SortIcon k="name" />
                </button>
              </th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Invoices</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                <button className="flex items-center gap-1 ml-auto" onClick={() => toggleSort("total_billed")}>
                  <SortIcon k="total_billed" />Billed
                </button>
              </th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Collected</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                <button className="flex items-center gap-1 ml-auto" onClick={() => toggleSort("outstanding")}>
                  <SortIcon k="outstanding" />Outstanding
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No customers match the current filters.
                </td>
              </tr>
            ) : (
              filtered.slice(0, 100).map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover-elevate" data-testid={`row-customer-${c.id}`}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {healthDot(c.health)}
                      <span className="font-medium truncate max-w-[160px]">{c.name}</span>
                    </div>
                    {c.program && <span className="text-muted-foreground text-[10px]">{c.program}</span>}
                  </td>
                  <td className="px-3 py-2">{rolloutBadge(c.rolloutStatus)}</td>
                  <td className="px-3 py-2 text-right">{c.invoice_count}</td>
                  <td className="px-3 py-2 text-right font-medium">{c.total_billed > 0 ? fmt(c.total_billed) : "—"}</td>
                  <td className="px-3 py-2 text-right">{c.total_paid > 0 ? fmt(c.total_paid) : "—"}</td>
                  <td className={`px-3 py-2 text-right font-medium ${c.outstanding > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"}`}>
                    {c.outstanding > 0 ? fmt(c.outstanding) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function RolloutMonitoringDashboard() {
  const qc = useQueryClient();
  const [days, setDays] = useState(30);

  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["/api/corporate/invoicing/rollout-dashboard", days],
    queryFn: () =>
      apiRequest("GET", `/api/corporate/invoicing/rollout-dashboard?days=${days}`).then((r) => r.json()),
    refetchInterval: 30_000,
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["/api/corporate/invoicing/rollout-dashboard"] });
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-md" />
          ))}
        </div>
        <div className="h-64 bg-muted animate-pulse rounded-md" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <XCircle className="w-8 h-8 opacity-50" />
        <p className="text-sm">Failed to load rollout dashboard.</p>
        <Button size="sm" variant="outline" onClick={refresh}>Retry</Button>
      </div>
    );
  }

  const { totals, exceptionSummary, customerRollout, alerts, dailyMetrics, period } = data;

  const criticalAlerts = alerts.filter(a => a.severity === "critical");
  const highAlerts     = alerts.filter(a => a.severity === "high");
  const hasAlerts      = alerts.length > 0;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold">Invoicing Rollout Dashboard</h2>
            {criticalAlerts.length > 0 && (
              <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 text-xs no-default-active-elevate">
                <ShieldAlert className="w-3 h-3 mr-1" />
                {criticalAlerts.length} Critical
              </Badge>
            )}
            {criticalAlerts.length === 0 && highAlerts.length > 0 && (
              <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 text-xs no-default-active-elevate">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {highAlerts.length} High
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {format(new Date(period.startDate + "T00:00:00"), "MMM d")} – {format(new Date(period.endDate + "T00:00:00"), "MMM d, yyyy")}
            &nbsp;&middot;&nbsp;{customerRollout.live} live customers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[110px] h-8 text-xs" data-testid="select-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button size="icon" variant="ghost" onClick={refresh} data-testid="button-refresh-rollout">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Alert banner ── */}
      {hasAlerts && (
        <div className="space-y-2">
          {alerts.slice(0, 4).map((alert, i) => {
            const cfg = alertSeverityConfig(alert.severity);
            return (
              <div key={i} className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 ${cfg.cls}`} data-testid={`alert-${alert.type}-${i}`}>
                {cfg.icon}
                <div>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-xs no-default-active-elevate ${cfg.badge}`}>{alert.severity.charAt(0).toUpperCase() + alert.severity.slice(1)}</Badge>
                    <span className="text-xs font-semibold capitalize">{alert.type.replace(/_/g, " ")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{alert.message}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          title="Invoices Generated"
          value={totals.invoicesGenerated}
          sub={`${period.days}-day period`}
          icon={<FileText className="w-5 h-5" />}
        />
        <KpiCard
          title="Total Billed"
          value={fmt(totals.totalBilled)}
          sub={`${totals.invoicesGenerated} invoice${totals.invoicesGenerated !== 1 ? "s" : ""}`}
          icon={<DollarSign className="w-5 h-5" />}
        />
        <KpiCard
          title="Payments Received"
          value={fmt(totals.paymentsAmount)}
          sub={`${totals.paymentsReceived} transaction${totals.paymentsReceived !== 1 ? "s" : ""}`}
          icon={<CreditCard className="w-5 h-5" />}
          accent={totals.collectionRate >= 80 ? "green" : totals.collectionRate < 50 ? "red" : "default"}
        />
        <KpiCard
          title="Deposits Created"
          value={totals.depositsCreated}
          sub={totals.paymentsAmount > 0 && totals.depositsCreated === 0 ? "No deposits yet" : "batches"}
          icon={<Layers className="w-5 h-5" />}
          accent={totals.paymentsAmount > 0 && totals.depositsCreated === 0 ? "red" : "default"}
        />
      </div>

      {/* ── Accuracy row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Collection Rate</p>
            <div className="flex items-end gap-2 mt-1">
              <p className={`text-2xl font-bold ${totals.collectionRate >= 80 ? "text-green-700 dark:text-green-400" : totals.collectionRate < 50 ? "text-red-700 dark:text-red-400" : "text-orange-700 dark:text-orange-400"}`}>
                {pct(totals.collectionRate)}
              </p>
              {totals.collectionRate >= 80 ? <TrendingUp className="w-4 h-4 text-green-500 mb-1" /> : <TrendingDown className="w-4 h-4 text-red-500 mb-1" />}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">of billed amount collected</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Outstanding Balance</p>
            <p className={`text-2xl font-bold mt-1 ${totals.outstandingBalance > 0 ? "text-orange-700 dark:text-orange-400" : "text-green-700 dark:text-green-400"}`}>
              {fmt(totals.outstandingBalance)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{pct(totals.variancePct)} of billed revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Revenue Variance</p>
            <p className={`text-2xl font-bold mt-1 ${totals.variancePct > 25 ? "text-red-700 dark:text-red-400" : totals.variancePct > 10 ? "text-orange-700 dark:text-orange-400" : "text-green-700 dark:text-green-400"}`}>
              {pct(totals.variancePct)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totals.variancePct > 25 ? "High variance — review collections" : totals.variancePct > 10 ? "Moderate variance" : "Within acceptable range"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Exception Summary ── */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Exception Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <ExceptionCard label="Manual Payments" count={exceptionSummary.manualPayments} icon={<Banknote className="w-3.5 h-3.5" />} accent={exceptionSummary.manualPayments > 5 ? "orange" : "default"} />
          <ExceptionCard label="Adjustments" count={exceptionSummary.adjustments} icon={<RotateCcw className="w-3.5 h-3.5" />} accent={exceptionSummary.adjustments > 3 ? "yellow" : "default"} />
          <ExceptionCard label="Reversals" count={exceptionSummary.reversals} icon={<RotateCcw className="w-3.5 h-3.5" />} accent={exceptionSummary.reversals > 2 ? "red" : "default"} />
          <ExceptionCard label="Unapplied Payments" count={exceptionSummary.unappliedPayments} icon={<CircleAlert className="w-3.5 h-3.5" />} accent={exceptionSummary.unappliedPayments > 3 ? "orange" : "default"} />
          <ExceptionCard label="Duplicate Detected" count={exceptionSummary.duplicatePayments} icon={<ShieldAlert className="w-3.5 h-3.5" />} accent={exceptionSummary.duplicatePayments > 0 ? "red" : "default"} />
          <ExceptionCard label="Open Exceptions" count={exceptionSummary.openExceptions} icon={<AlertTriangle className="w-3.5 h-3.5" />} accent={exceptionSummary.openExceptions > 10 ? "red" : exceptionSummary.openExceptions > 0 ? "orange" : "default"} />
        </div>
      </div>

      <Separator />

      {/* ── Customer Rollout Tracker ── */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold">Customer Rollout Tracker</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {customerRollout.live} live &middot; {customerRollout.pending} pending &middot; {customerRollout.notStarted} not started
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full bg-green-100 dark:bg-green-950/40 px-2.5 py-1 text-xs font-semibold text-green-800 dark:text-green-300">
              <CircleDot className="w-3 h-3" />{customerRollout.live} Live
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-yellow-100 dark:bg-yellow-950/40 px-2.5 py-1 text-xs font-semibold text-yellow-800 dark:text-yellow-300">
              <Clock className="w-3 h-3" />{customerRollout.pending} Pending
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              <XCircle className="w-3 h-3" />{customerRollout.notStarted} Not Started
            </div>
          </div>
        </div>
        <CustomerRolloutTable customers={customerRollout.customers} />
      </div>

      <Separator />

      {/* ── Daily Metrics Table ── */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h3 className="text-sm font-semibold">Daily Metrics</h3>
          <span className="text-xs text-muted-foreground">Last {period.days} days</span>
        </div>
        <DailyMetricsTable rows={dailyMetrics} />
      </div>
    </div>
  );
}
