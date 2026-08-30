import { useState } from "react";
import { Link } from "wouter";
import { formatDate } from "@/lib/dateFormat";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  BrainCircuit, TrendingUp, TrendingDown, DollarSign, Users, Truck,
  AlertTriangle, Upload, RefreshCw, Play, CheckCircle, XCircle,
  Target, ChevronRight, Loader2, Info, BarChart3, FileText,
  Sparkles, ArrowLeft, FileSpreadsheet, CircleDot, ArrowUpRight, ArrowDownRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface DashboardSummary {
  latestForecast: { id: string; snapshotLabel: string; generatedAt: string; status: string } | null;
  ttmRevenue: number;
  activeAccounts: number;
  activeDrivers: number;
  openRepricingFlags: number;
  pnlUploadsCount: number;
  // New KPI fields
  forecastRevenue: number;
  forecastNetMarginPct: number | null;
  forecastConfidence: number;
  revenueAtRisk: number;
  pipelineContribution: number;
  claimsExposure: number;
  driversNeeded: number;
}

interface ForecastItem {
  id: string;
  categoryCode: string;
  periodYear: number;
  periodMonth: number;
  projectedAmount: string;
  actualAmount: string | null;
  varianceAmount: string | null;
  variancePct: string | null;
  driverAssumptions: string | null;
}

interface Forecast {
  id: string;
  snapshotLabel: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  generatedAt: string;
  assumptionsJson: string | null;
  notes: string | null;
}

interface AccountMargin {
  account_id: string | null;
  account_name: string;
  period_start: string;
  period_end: string;
  revenue: number;
  driver_cost: number;
  payroll_burden: number;
  contractor_cost: number;
  vendor_allocation: number;
  claims_allocation: number;
  admin_allocation: number;
  total_cost: number;
  contribution_margin: number;
  margin_pct: number;
  invoice_count: number;
  driver_count: number;
  flag_for_repricing: boolean;
  snapshot_date: string | null;
  health?: string | null;
  status?: string | null;
}

interface DriverMargin {
  driver_id: string;
  driver_name: string;
  driver_number: string | null;
  classification: string | null;
  revenue_attributed: number;
  driver_cost: number;
  payroll_burden: number;
  claims_allocation: number;
  admin_allocation: number;
  total_cost: number;
  contribution_margin: number | null;
  margin_pct: number | null;
  hours_worked: number;
  trips_count: number;
  snapshot_date: string | null;
}

interface TripMargin {
  id: string;
  account_name: string | null;
  trip_date: string | null;
  revenue: number;
  driver_cost: number;
  overhead_allocation: number;
  claims_allocation: number;
  contribution_margin: number;
  margin_pct: number;
  snapshot_date: string | null;
}

interface RepricingFlag {
  id: string;
  accountId: string | null;
  accountName: string | null;
  accountStatus: string | null;
  health: string | null;
  status: string;
  triggerType: string | null;
  marginPct: string | null;
  targetMarginPct: string | null;
  ttmRevenue: string | null;
  ttmCost: string | null;
  estimatedRevenueAdjustment: string | null;
  reasonCodes: string | null;
  issueReason: string | null;
  aiSummary: string | null;
  aiConfidence: string | null;
  recommendedAction: string | null;
  flaggedAt: string;
  reviewedAt: string | null;
  resolvedAt: string | null;
  reviewNotes: string | null;
}

interface ForecastGoal {
  id: string;
  moduleTarget: string;
  metricName: string;
  targetValue: string | null;
  targetPeriodYear: number | null;
  targetPeriodMonth: number | null;
  status: string;
  notes: string | null;
  createdAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number, decimals = 0) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: decimals }).format(n);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const CAT_LABELS: Record<string, string> = {
  "revenue.active_accounts": "Active Account Revenue",
  "revenue.new_accounts": "New Account Revenue",
  "revenue.churn_risk": "Churn Risk Reduction",
  "labor.driver_pay": "Driver Pay",
  "labor.employee_payroll": "Employee Payroll",
  "labor.payroll_burden": "Payroll Burden (Taxes/Benefits)",
  "claims.total_reserve": "Claims Reserve",
  "operating.other": "Operating Overhead",
};

const MARGIN_COLOR = (pct: number) =>
  pct >= 0.20 ? "text-green-600 dark:text-green-400"
  : pct >= 0.10 ? "text-yellow-600 dark:text-yellow-400"
  : "text-red-600 dark:text-red-400";

const healthBadge = (h: string | null) => {
  if (h === "green") return <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">Healthy</Badge>;
  if (h === "yellow") return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">Caution</Badge>;
  if (h === "red") return <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">At Risk</Badge>;
  return <Badge variant="secondary">—</Badge>;
};

// ── Dashboard Tab ─────────────────────────────────────────────────────────────
interface MarginHistoryRow {
  year: number; month: number; label: string;
  revenue: number; totalCost: number; netProfit: number; marginPct: number;
}
interface ForecastVsActualRow {
  label: string;
  forecastRevenue: number;
  actualRevenue: number | null;
  variance: number | null;
  variancePct: number | null;
}

function KpiCard({
  label, value, sub, icon: Icon, iconColor, trend, trendLabel, highlight,
}: {
  label: string; value: string; sub: string;
  icon: React.ElementType; iconColor: string;
  trend?: "up" | "down" | "neutral"; trendLabel?: string; highlight?: "red" | "orange" | "green";
}) {
  const highlightClass =
    highlight === "red"    ? "border-red-200 bg-red-50/40 dark:border-red-900/40 dark:bg-red-900/10" :
    highlight === "orange" ? "border-orange-200 bg-orange-50/40 dark:border-orange-900/40 dark:bg-orange-900/10" :
    highlight === "green"  ? "border-green-200 bg-green-50/40 dark:border-green-900/40 dark:bg-green-900/10" :
    "";
  return (
    <Card className={highlightClass}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1 truncate">{value}</p>
            <div className="flex items-center gap-1 mt-1">
              {trend === "up"   && <ArrowUpRight className="h-3 w-3 text-green-500 shrink-0" />}
              {trend === "down" && <ArrowDownRight className="h-3 w-3 text-red-500 shrink-0" />}
              <p className="text-xs text-muted-foreground">{trendLabel ?? sub}</p>
            </div>
          </div>
          <div className={`p-2 rounded-md ${iconColor.replace("text-", "bg-").replace("-500", "-100").replace("-400", "-100")} shrink-0`}>
            <Icon className={`h-4 w-4 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardTab({ summary, onGenerate }: { summary: DashboardSummary; onGenerate: () => void }) {
  const { data: revHistory = [] } = useQuery<{ year: number; month: number; label: string; revenue: number }[]>({
    queryKey: ["/api/financial/revenue-history"],
  });
  const { data: marginHistory = [] } = useQuery<MarginHistoryRow[]>({
    queryKey: ["/api/financial/margin-history"],
  });
  const { data: fvaHistory = [] } = useQuery<ForecastVsActualRow[]>({
    queryKey: ["/api/financial/forecast-vs-actual"],
  });

  const hasForecasts = summary.forecastRevenue > 0;
  const netMarginDisplay = summary.forecastNetMarginPct != null
    ? `${(summary.forecastNetMarginPct * 100).toFixed(1)}%`
    : "—";
  const netMarginHighlight: "red" | "orange" | "green" | undefined =
    summary.forecastNetMarginPct == null ? undefined :
    summary.forecastNetMarginPct < 0.05 ? "red" :
    summary.forecastNetMarginPct < 0.15 ? "orange" : "green";

  const kpis = [
    {
      label: "Forecast Revenue",
      value: hasForecasts ? fmt(summary.forecastRevenue) : "—",
      sub: "Next 12 months",
      icon: TrendingUp,
      iconColor: "text-green-500",
      trendLabel: hasForecasts ? `${summary.forecastConfidence.toFixed(0)}% confidence` : "Run forecast engine",
    },
    {
      label: "Forecast Net Margin",
      value: netMarginDisplay,
      sub: "Projected 12-month margin",
      icon: BarChart3,
      iconColor: netMarginHighlight === "red" ? "text-red-500" : netMarginHighlight === "orange" ? "text-orange-500" : "text-blue-500",
      highlight: netMarginHighlight,
    },
    {
      label: "Revenue at Risk",
      value: summary.revenueAtRisk > 0 ? fmt(summary.revenueAtRisk) : "$0",
      sub: "From open repricing flags",
      icon: AlertTriangle,
      iconColor: summary.revenueAtRisk > 0 ? "text-red-500" : "text-muted-foreground",
      highlight: summary.revenueAtRisk > 50000 ? "red" as const : summary.revenueAtRisk > 10000 ? "orange" as const : undefined,
      trendLabel: `${summary.openRepricingFlags} open flag${summary.openRepricingFlags !== 1 ? "s" : ""}`,
    },
    {
      label: "Pipeline Contribution",
      value: summary.pipelineContribution > 0 ? fmt(summary.pipelineContribution) : "$0",
      sub: "New accounts (last 90 days)",
      icon: ArrowUpRight,
      iconColor: "text-purple-500",
      highlight: summary.pipelineContribution > 0 ? "green" as const : undefined,
    },
    {
      label: "Claims Exposure",
      value: summary.claimsExposure > 0 ? fmt(summary.claimsExposure) : "$0",
      sub: "Open claims probable cost",
      icon: XCircle,
      iconColor: summary.claimsExposure > 100000 ? "text-red-500" : "text-orange-500",
      highlight: summary.claimsExposure > 100000 ? "red" as const : summary.claimsExposure > 25000 ? "orange" as const : undefined,
    },
    {
      label: "Drivers Needed",
      value: summary.driversNeeded > 0 ? `+${summary.driversNeeded}` : summary.driversNeeded === 0 ? "Staffed" : "—",
      sub: `${summary.activeDrivers} active drivers`,
      icon: Truck,
      iconColor: summary.driversNeeded > 10 ? "text-red-500" : summary.driversNeeded > 0 ? "text-orange-500" : "text-green-500",
      highlight: summary.driversNeeded > 10 ? "red" as const : summary.driversNeeded > 0 ? "orange" as const : "green" as const,
    },
  ] as const;

  // Whether we have useful fva data (at least one forecast point)
  const hasFva = fvaHistory.length > 0;
  const hasActualsInFva = fvaHistory.some(r => r.actualRevenue != null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Financial Intelligence Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            {summary.latestForecast
              ? `Forecast: ${summary.latestForecast.snapshotLabel} · ${new Date(summary.latestForecast.generatedAt).toLocaleDateString()}`
              : "No autonomous forecast generated yet — run the forecast engine to populate projections"}
          </p>
        </div>
        <Button onClick={onGenerate} data-testid="button-generate-forecast">
          <Play className="h-4 w-4 mr-2" />
          Generate Rolling Forecast
        </Button>
      </div>

      {/* 6 KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map(k => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      {/* Chart Row 1: Rolling 12M Revenue + Rolling 12M Margin */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1 — Rolling 12-month revenue */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Rolling 12-Month Revenue</CardTitle>
            <CardDescription className="text-xs">Actual invoiced revenue (paid, sent, approved) by month</CardDescription>
          </CardHeader>
          <CardContent>
            {revHistory.length === 0 ? (
              <div className="flex items-center justify-center h-52 text-muted-foreground text-sm">No invoice data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revHistory} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} width={48} />
                  <Tooltip formatter={(v: number) => [fmt(v), "Revenue"]} />
                  <Bar dataKey="revenue" fill="#FF6B35" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Chart 2 — Rolling 12-month margin */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Rolling 12-Month Net Margin</CardTitle>
            <CardDescription className="text-xs">Estimated margin % after labor, claims, and overhead allocation</CardDescription>
          </CardHeader>
          <CardContent>
            {marginHistory.length === 0 ? (
              <div className="flex items-center justify-center h-52 text-muted-foreground text-sm">No invoice data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={marginHistory} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                  <defs>
                    <linearGradient id="marginGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="marginGradRed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fontSize: 10 }} width={40} />
                  <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, "Net Margin"]} />
                  <ReferenceLine y={15} stroke="#FF6B35" strokeDasharray="4 2" label={{ value: "Target 15%", position: "insideTopRight", fontSize: 10, fill: "#FF6B35" }} />
                  <ReferenceLine y={0}  stroke="#ef4444" />
                  <Area
                    type="monotone"
                    dataKey="marginPct"
                    name="Net Margin %"
                    stroke="#22c55e"
                    fill="url(#marginGrad)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#22c55e" }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Chart 3 — Forecast vs Actual Trend */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-sm font-semibold">Forecast vs. Actual Revenue Trend</CardTitle>
              <CardDescription className="text-xs">
                {hasActualsInFva
                  ? "Comparing autonomous forecast against invoiced actuals. Shaded months are forecast-only."
                  : hasFva
                    ? "Autonomous forecast projection — actual data will appear here once invoices are recorded."
                    : "Run the autonomous forecast engine to populate this chart."}
              </CardDescription>
            </div>
            {!hasFva && (
              <Button size="sm" variant="outline" onClick={onGenerate} data-testid="button-run-forecast-fva">
                <Play className="h-3 w-3 mr-1.5" />Run Forecast Engine
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!hasFva ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <BarChart3 className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No forecast data yet.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={fvaHistory} margin={{ top: 4, right: 16, left: 16, bottom: 4 }}>
                <defs>
                  <linearGradient id="fvForecastGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FF6B35" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#FF6B35" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="fvActualGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} width={52} />
                <Tooltip
                  formatter={(v: any, name: string) => [v != null ? fmt(Number(v)) : "—", name === "forecastRevenue" ? "Forecast" : "Actual"]}
                />
                <Legend formatter={v => v === "forecastRevenue" ? "Forecast Revenue" : "Actual Revenue"} />
                <Area
                  type="monotone"
                  dataKey="forecastRevenue"
                  name="forecastRevenue"
                  stroke="#FF6B35"
                  fill="url(#fvForecastGrad)"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  connectNulls
                />
                <Area
                  type="monotone"
                  dataKey="actualRevenue"
                  name="actualRevenue"
                  stroke="#3b82f6"
                  fill="url(#fvActualGrad)"
                  strokeWidth={2}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Forecast Tab (Snapshot Engine) ────────────────────────────────────────────
interface SnapshotMonth {
  period_month: string;
  revenue_forecast: number;
  labor_cost_forecast: number;
  contractor_cost_forecast: number;
  vendor_cost_forecast: number;
  claims_cost_forecast: number;
  overhead_forecast: number;
  net_profit_forecast: number;
  forecast_confidence: number;
}

function ForecastTab({ onGenerate }: { onGenerate: () => void }) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);

  const { data: snapshotData, isLoading: snapLoading } = useQuery<{ snapshotDate: string | null; months: SnapshotMonth[] }>({
    queryKey: ["/api/financial/snapshots"],
  });

  const { isLoading: legacyLoading } = useQuery<{ forecast: Forecast | null; items: ForecastItem[] }>({
    queryKey: ["/api/financial/forecast/latest"],
  });

  const isLoading = snapLoading || legacyLoading;

  async function handleRunEngine() {
    setRunning(true);
    try {
      const res = await fetch("/api/financial/snapshots/run", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      qc.invalidateQueries({ queryKey: ["/api/financial/snapshots"] });
      qc.invalidateQueries({ queryKey: ["/api/financial"] });
    } catch (e: any) {
      console.error("Forecast engine failed:", e);
    } finally {
      setRunning(false);
    }
  }

  if (isLoading) return <div className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading forecast...</div>;

  const hasSnapshot = (snapshotData?.months?.length ?? 0) > 0;
  const snapMonths: SnapshotMonth[] = snapshotData?.months ?? [];

  // Snapshot-based chart data
  const snapChartData = snapMonths.map(m => {
    const mo = new Date(m.period_month).getUTCMonth() + 1;
    const yr = new Date(m.period_month).getUTCFullYear();
    const totalCost = Number(m.labor_cost_forecast) + Number(m.contractor_cost_forecast) +
      Number(m.vendor_cost_forecast) + Number(m.claims_cost_forecast) + Number(m.overhead_forecast);
    return {
      label: `${MONTHS[mo - 1]} '${String(yr).slice(2)}`,
      revenue: Number(m.revenue_forecast),
      labor: Number(m.labor_cost_forecast),
      contractor: Number(m.contractor_cost_forecast),
      vendor: Number(m.vendor_cost_forecast),
      claims: Number(m.claims_cost_forecast),
      overhead: Number(m.overhead_forecast),
      totalCost,
      netProfit: Number(m.net_profit_forecast),
      confidence: m.forecast_confidence,
    };
  });

  const totalRevenue12 = snapChartData.reduce((s, r) => s + r.revenue, 0);
  const totalCost12 = snapChartData.reduce((s, r) => s + r.totalCost, 0);
  const totalNet12 = snapChartData.reduce((s, r) => s + r.netProfit, 0);
  const confidence = snapMonths[0]?.forecast_confidence ?? 0;
  const marginPct12 = totalRevenue12 > 0 ? totalNet12 / totalRevenue12 : 0;

  if (!hasSnapshot) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <BrainCircuit className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm max-w-sm">
            No forecast snapshot exists yet. Run the autonomous engine to pull live data from all operational modules and generate a 12-month rolling projection.
          </p>
          <Button onClick={handleRunEngine} disabled={running}>
            {running ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running Engine…</> : <><Play className="h-4 w-4 mr-2" />Run Forecast Engine</>}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">Rolling 12-Month Forecast</h2>
          <p className="text-sm text-muted-foreground">
            Snapshot: {snapshotData?.snapshotDate ? new Date(snapshotData.snapshotDate).toLocaleDateString() : "—"} ·
            Period: {snapMonths[0]?.period_month ? new Date(snapMonths[0].period_month).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : "—"} → {snapMonths[11]?.period_month ? new Date(snapMonths[11].period_month).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : "—"}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Badge variant="secondary" className="gap-1">
            <span className={confidence >= 70 ? "text-green-600 dark:text-green-400" : confidence >= 40 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}>
              {confidence}%
            </span> confidence
          </Badge>
          <Button variant="outline" size="default" onClick={handleRunEngine} disabled={running} data-testid="button-run-forecast">
            {running ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running…</> : <><RefreshCw className="h-4 w-4 mr-2" />Refresh Snapshot</>}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">12-Mo Revenue Forecast</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{fmt(totalRevenue12)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">12-Mo Total Cost Forecast</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{fmt(totalCost12)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">Projected Net Margin</p>
            <p className={`text-2xl font-bold mt-1 ${MARGIN_COLOR(marginPct12)}`}>{fmt(totalNet12)} <span className="text-sm font-normal">({pct(marginPct12)})</span></p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">12-Month Revenue vs. Cost Projection</CardTitle>
          <CardDescription>Live data from Accounts, Drivers, Employees, Vendors, Claims &amp; Scheduling</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={snapChartData} margin={{ top: 4, right: 16, left: 16, bottom: 4 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FF6B35" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#FF6B35" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend />
              <ReferenceLine y={0} stroke="var(--border)" />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#FF6B35" fill="url(#revGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="totalCost" name="Total Cost" stroke="#ef4444" fill="url(#costGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="netProfit" name="Net Profit" stroke="#22c55e" fill="none" strokeWidth={2} strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-base">Forecast Breakdown by Component</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Component</th>
                  {snapChartData.map(m => (
                    <th key={m.label} className="text-right py-2 px-2 font-medium text-muted-foreground whitespace-nowrap">{m.label}</th>
                  ))}
                  <th className="text-right py-2 pl-4 font-medium text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {([
                  { key: "revenue", label: "Revenue", green: true },
                  { key: "labor", label: "Labor (Employees)", green: false },
                  { key: "contractor", label: "Contractor (IC Drivers)", green: false },
                  { key: "vendor", label: "Vendor Costs", green: false },
                  { key: "claims", label: "Claims Exposure", green: false },
                  { key: "overhead", label: "Overhead", green: false },
                  { key: "netProfit", label: "Net Profit", green: true, bold: true },
                ] as { key: string; label: string; green: boolean; bold?: boolean }[]).map(row => {
                  const total = snapChartData.reduce((s, m) => s + ((m as any)[row.key] ?? 0), 0);
                  return (
                    <tr key={row.key} className={`border-b last:border-0 ${row.bold ? "font-semibold" : "hover-elevate"}`}>
                      <td className="py-2 pr-4 text-xs">{row.label}</td>
                      {snapChartData.map(m => (
                        <td key={m.label} className="text-right py-2 px-2 whitespace-nowrap">
                          <span className={row.green ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}>
                            {fmt((m as any)[row.key] ?? 0)}
                          </span>
                        </td>
                      ))}
                      <td className={`text-right py-2 pl-4 font-medium ${row.green ? "text-green-700 dark:text-green-400" : ""}`}>
                        {fmt(total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-base flex items-center gap-2"><Info className="h-4 w-4" />Data Sources &amp; Engine Logic</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            {[
              ["Revenue", "Trailing 12-mo invoice data with linear trend extrapolation"],
              ["Labor", "Active employees × avg hourly rate × 173 hrs + 25% burden"],
              ["Contractors", "Active IC drivers × pay rate × 120 hrs/mo (or scheduled actual)"],
              ["Vendors", "Active subscription/flat pricing; hourly/usage rates estimated"],
              ["Claims", "12-mo accident insurance reserve average + trend slope"],
              ["Overhead", "5% of revenue (variable SG&A) + $500/employee (fixed)"],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <p className="text-xs font-medium text-muted-foreground">{k}</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">{v}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── P&L Actuals Tab ───────────────────────────────────────────────────────────
const FORECAST_CATEGORY_LABELS: Record<string, string> = {
  revenue: "Revenue",
  labor: "Labor (Employees)",
  contractor: "Contractor (IC Drivers)",
  vendor: "Vendor Costs",
  claims: "Claims Exposure",
  overhead: "Overhead",
  exclude: "Exclude",
};

function VarianceCell({ val, pct, isRevenue }: { val: number | null; pct: number | null; isRevenue: boolean }) {
  if (val == null || pct == null) return <td className="text-right py-2 px-3 text-muted-foreground text-xs">—</td>;
  const favorable = isRevenue ? val > 0 : val < 0;
  const color = favorable ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
  const Icon = favorable ? ArrowUpRight : ArrowDownRight;
  return (
    <td className={`text-right py-2 px-3 font-medium ${color}`}>
      <span className="flex items-center justify-end gap-1">
        <Icon className="h-3 w-3" />
        {fmt(val)} <span className="text-xs font-normal">({pct.toFixed(1)}%)</span>
      </span>
    </td>
  );
}

function PnlDetailView({ actualId, onBack }: { actualId: string; onBack: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [aiLoading, setAiLoading] = useState(false);

  const { data: detail, isLoading: detailLoading } = useQuery<{ actual: any; lines: any[] }>({
    queryKey: ["/api/financial/actuals", actualId],
    queryFn: () => fetch(`/api/financial/actuals/${actualId}`).then(r => r.json()),
  });

  const { data: variance, isLoading: varLoading, refetch: refetchVariance } = useQuery<any>({
    queryKey: ["/api/financial/actuals", actualId, "variance"],
    queryFn: () => fetch(`/api/financial/actuals/${actualId}/variance`).then(r => r.json()),
  });

  async function updateLineCategory(lineId: string, forecastCategory: string, isRevenue: boolean) {
    await fetch(`/api/financial/actuals/${actualId}/lines/${lineId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forecastCategory, isRevenue }),
    });
    qc.invalidateQueries({ queryKey: ["/api/financial/actuals", actualId] });
    refetchVariance();
  }

  async function handleFinalize() {
    const res = await fetch(`/api/financial/actuals/${actualId}/finalize`, { method: "POST" });
    if (res.ok) {
      toast({ title: "Mappings saved and actuals finalized" });
      qc.invalidateQueries({ queryKey: ["/api/financial/actuals"] });
      qc.invalidateQueries({ queryKey: ["/api/financial/actuals", actualId] });
      refetchVariance();
    } else {
      toast({ title: "Finalize failed", variant: "destructive" });
    }
  }

  async function handleAiExplain() {
    setAiLoading(true);
    try {
      const res = await fetch(`/api/financial/actuals/${actualId}/ai-explain`, { method: "POST" });
      if (res.ok) {
        toast({ title: "AI analysis complete" });
        qc.invalidateQueries({ queryKey: ["/api/financial/actuals", actualId] });
        qc.invalidateQueries({ queryKey: ["/api/financial/actuals"] });
      } else {
        toast({ title: "AI analysis failed", variant: "destructive" });
      }
    } finally {
      setAiLoading(false);
    }
  }

  if (detailLoading) return <div className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading...</div>;
  if (!detail) return null;

  const { actual, lines } = detail;
  const unmapped = lines.filter(l => !l.forecast_category || l.forecast_category === "exclude");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-pnl-back"><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h2 className="text-lg font-semibold">{actual.file_name}</h2>
            <p className="text-sm text-muted-foreground">{MONTHS[actual.period_month - 1]} {actual.period_year} · {actual.upload_source?.toUpperCase()} upload</p>
          </div>
        </div>
        <div className="flex gap-2">
          {actual.status !== "finalized" && (
            <Button variant="outline" size="default" onClick={handleFinalize} data-testid="button-pnl-finalize">
              <CheckCircle className="h-4 w-4 mr-2" />Save Mappings
            </Button>
          )}
          <Button size="default" onClick={handleAiExplain} disabled={aiLoading} data-testid="button-pnl-ai">
            {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            AI Analysis
          </Button>
        </div>
      </div>

      {actual.ai_variance_notes && (
        <Card className="bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex gap-3">
              <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-900 dark:text-blue-200 leading-relaxed">{actual.ai_variance_notes}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Variance Analysis */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Forecast vs. Actual Variance</CardTitle>
          <CardDescription>
            {variance?.snapshot ? `Based on snapshot from ${new Date(variance.snapshot.snapshot_date).toLocaleDateString()}` : "No forecast snapshot found for this period — run the forecast engine first"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {varLoading ? (
            <div className="flex items-center gap-2 p-4 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading variance...</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left py-2 px-4 font-medium text-muted-foreground">Category</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">Forecast</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">Actual</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">Variance</th>
                </tr>
              </thead>
              <tbody>
                {(variance?.rows ?? []).map((row: any) => (
                  <tr key={row.category} className="border-b last:border-0">
                    <td className="py-2 px-4 text-xs">{row.label}</td>
                    <td className="text-right py-2 px-3 text-muted-foreground">{row.forecast != null ? fmt(row.forecast) : "—"}</td>
                    <td className="text-right py-2 px-3">{row.actual != null ? fmt(row.actual) : "—"}</td>
                    <VarianceCell val={row.variance} pct={row.variancePct} isRevenue={row.isRevenue} />
                  </tr>
                ))}
                {variance?.net && (
                  <tr className="border-t font-semibold bg-muted/20">
                    <td className="py-2 px-4 text-xs">Net Profit</td>
                    <td className="text-right py-2 px-3 text-muted-foreground">{variance.net.forecast != null ? fmt(parseFloat(String(variance.net.forecast))) : "—"}</td>
                    <td className="text-right py-2 px-3">{fmt(variance.net.actual ?? 0)}</td>
                    <VarianceCell
                      val={variance.net.variance}
                      pct={variance.net.forecast ? (variance.net.variance / Math.abs(parseFloat(String(variance.net.forecast)))) * 100 : null}
                      isRevenue={true}
                    />
                  </tr>
                )}
              </tbody>
            </table>
          )}
          {(variance?.unmappedLines ?? 0) > 0 && (
            <div className="border-t p-3 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              {variance.unmappedLines} line(s) below have not been assigned a category and are excluded from the variance.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Line Mapping Editor */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Chart of Accounts Mapping</CardTitle>
            {unmapped.length > 0 && (
              <Badge variant="secondary" className="text-amber-600">{unmapped.length} unmapped</Badge>
            )}
          </div>
          <CardDescription>Assign each account row to a forecast category. Mappings are saved for future uploads.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="text-left py-2 px-4 font-medium text-muted-foreground">Account</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">Amount</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Category</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line: any) => (
                <tr key={line.id} className="border-b last:border-0">
                  <td className="py-2 px-4 text-xs">
                    {line.raw_account_code && <span className="text-muted-foreground mr-2">{line.raw_account_code}</span>}
                    {line.raw_account_name}
                  </td>
                  <td className={`text-right py-2 px-3 font-medium ${parseFloat(line.raw_amount) >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {fmt(parseFloat(line.raw_amount))}
                  </td>
                  <td className="py-2 px-3">
                    <Select
                      value={line.forecast_category ?? "__none__"}
                      onValueChange={val => {
                        const isRev = val === "revenue";
                        updateLineCategory(line.id, val === "__none__" ? "" : val, isRev);
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs w-44" data-testid={`select-line-category-${line.id}`}>
                        <SelectValue placeholder="— Assign —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Unassigned —</SelectItem>
                        {Object.entries(FORECAST_CATEGORY_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function PnlTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [periodYear, setPeriodYear] = useState(String(new Date().getFullYear()));
  const [periodMonth, setPeriodMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: actuals = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/financial/actuals"],
    queryFn: () => fetch("/api/financial/actuals").then(r => r.json()),
  });

  if (selectedId) {
    return <PnlDetailView actualId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  const statusBadge = (s: string) => {
    if (s === "finalized") return <Badge variant="secondary" className="text-green-700 dark:text-green-400">Finalized</Badge>;
    if (s === "pending_mapping") return <Badge variant="secondary" className="text-amber-600 dark:text-amber-400">Needs Mapping</Badge>;
    return <Badge variant="secondary">{s}</Badge>;
  };

  async function handleUpload() {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("periodYear", periodYear);
      fd.append("periodMonth", periodMonth);
      const res = await fetch("/api/financial/actuals/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast({ title: `Upload complete — ${data.lineCount} lines (${data.autoMapped} auto-mapped)` });
      qc.invalidateQueries({ queryKey: ["/api/financial/actuals"] });
      setShowUploadDialog(false);
      setUploadFile(null);
      setSelectedId(data.id);
    } catch (err: any) {
      toast({ title: err.message || "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">P&L Actuals</h2>
          <p className="text-sm text-muted-foreground">Upload monthly P&L files (CSV or XLSX) and compare actuals against your forecast snapshot</p>
        </div>
        <Button onClick={() => setShowUploadDialog(true)} data-testid="button-upload-pnl">
          <Upload className="h-4 w-4 mr-2" />Upload P&L
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading...</div>
      ) : actuals.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <FileSpreadsheet className="h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium text-muted-foreground">No P&L uploads yet</p>
          <p className="text-sm text-muted-foreground max-w-sm">Upload a CSV or XLSX export from your accounting system. The platform will auto-map accounts to forecast categories and compute variance against your forecast snapshot.</p>
          <Button variant="outline" onClick={() => setShowUploadDialog(true)} data-testid="button-upload-pnl-empty">
            <Upload className="h-4 w-4 mr-2" />Upload First P&L
          </Button>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Period</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">File</th>
                  <th className="text-right py-3 px-3 font-medium text-muted-foreground">Revenue</th>
                  <th className="text-right py-3 px-3 font-medium text-muted-foreground">Net Income</th>
                  <th className="text-left py-3 px-3 font-medium text-muted-foreground">Status</th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                {actuals.map((a: any) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="py-3 px-4 font-medium">{MONTHS[(a.period_month ?? 1) - 1]} {a.period_year}</td>
                    <td className="py-3 px-4 text-muted-foreground text-xs">{a.file_name}</td>
                    <td className="text-right py-3 px-3">{a.total_revenue != null ? fmt(parseFloat(a.total_revenue)) : "—"}</td>
                    <td className={`text-right py-3 px-3 font-medium ${parseFloat(a.net_income ?? "0") >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      {a.net_income != null ? fmt(parseFloat(a.net_income)) : "—"}
                    </td>
                    <td className="py-3 px-3">{statusBadge(a.status)}</td>
                    <td className="py-3 px-4 text-right">
                      <Button size="sm" variant="outline" onClick={() => setSelectedId(a.id)} data-testid={`button-view-actual-${a.id}`}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Monthly P&L</DialogTitle>
            <DialogDescription>Upload a CSV or XLSX export from QuickBooks, Xero, or any accounting system. Columns: Account Name, Amount (or Code, Account Name, Amount).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Year</Label>
                <Input value={periodYear} onChange={e => setPeriodYear(e.target.value)} placeholder="2026" data-testid="input-pnl-year" />
              </div>
              <div className="space-y-1.5">
                <Label>Month</Label>
                <Select value={periodMonth} onValueChange={setPeriodMonth}>
                  <SelectTrigger data-testid="select-pnl-month"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>P&L File (CSV or XLSX)</Label>
              <div
                className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover-elevate transition-colors"
                onClick={() => document.getElementById("pnl-file-input")?.click()}
                data-testid="dropzone-pnl-file"
              >
                <input
                  id="pnl-file-input"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
                  data-testid="input-pnl-file"
                />
                {uploadFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">{uploadFile.name}</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Upload className="h-6 w-6 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">Click to select a CSV or XLSX file</p>
                    <p className="text-xs text-muted-foreground">Max 20 MB</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowUploadDialog(false); setUploadFile(null); }}>Cancel</Button>
            <Button onClick={handleUpload} disabled={!uploadFile || uploading} data-testid="button-pnl-submit">
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Upload & Parse
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ── Margin Intelligence Tab ───────────────────────────────────────────────────
const MARGIN_THRESHOLDS = { good: 0.20, warn: 0.12 };

function MarginPctCell({ pct }: { pct: number | null }) {
  if (pct == null) return <td className="text-right py-3 px-3 text-muted-foreground text-xs">—</td>;
  const color = pct >= MARGIN_THRESHOLDS.good
    ? "text-green-700 dark:text-green-400"
    : pct >= MARGIN_THRESHOLDS.warn
    ? "text-amber-600 dark:text-amber-400"
    : "text-red-600 dark:text-red-400";
  return (
    <td className={`text-right py-3 px-3 font-bold ${color}`}>
      {(pct * 100).toFixed(1)}%
    </td>
  );
}

function CostBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min((value / total) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-32 text-muted-foreground truncate">{label}</span>
      <div className="flex-1 bg-muted rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-20 text-right font-medium">{fmt(value)}</span>
      <span className="w-10 text-right text-muted-foreground">{pct.toFixed(0)}%</span>
    </div>
  );
}

function AccountMarginRow({ a }: { a: AccountMargin }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr
        className="border-b last:border-0 cursor-pointer hover-elevate"
        onClick={() => setExpanded(e => !e)}
        data-testid={`row-account-margin-${a.account_id}`}
      >
        <td className="py-3 px-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{a.account_name}</span>
            {a.flag_for_repricing && (
              <Badge variant="secondary" className="text-xs text-orange-600 dark:text-orange-400">Reprice</Badge>
            )}
            {a.health && healthBadge(a.health)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{a.invoice_count} invoices · {a.driver_count} drivers</div>
        </td>
        <td className="text-right py-3 px-3 font-medium text-green-700 dark:text-green-400">{fmt(a.revenue)}</td>
        <td className="text-right py-3 px-3 text-muted-foreground">{fmt(a.contractor_cost)}</td>
        <td className="text-right py-3 px-3 text-muted-foreground">{fmt(a.payroll_burden)}</td>
        <td className="text-right py-3 px-3 text-muted-foreground">{fmt(a.vendor_allocation)}</td>
        <td className="text-right py-3 px-3 text-muted-foreground">{fmt(a.claims_allocation)}</td>
        <td className="text-right py-3 px-3 text-muted-foreground">{fmt(a.admin_allocation)}</td>
        <td className="text-right py-3 px-3 font-medium">{fmt(a.contribution_margin)}</td>
        <MarginPctCell pct={a.margin_pct} />
        <td className="py-3 px-3">
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
        </td>
      </tr>
      {expanded && (
        <tr className="border-b bg-muted/20">
          <td colSpan={10} className="px-6 py-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground mb-3">Cost Breakdown (% of Revenue)</p>
              <CostBar label="Contractor / IC Pay" value={a.contractor_cost} total={a.revenue} color="bg-orange-400" />
              <CostBar label="Payroll Burden" value={a.payroll_burden} total={a.revenue} color="bg-blue-400" />
              <CostBar label="Vendor Allocation" value={a.vendor_allocation} total={a.revenue} color="bg-purple-400" />
              <CostBar label="Claims Allocation" value={a.claims_allocation} total={a.revenue} color="bg-red-400" />
              <CostBar label="Admin Overhead" value={a.admin_allocation} total={a.revenue} color="bg-slate-400" />
              <div className="flex items-center gap-2 text-xs mt-2 pt-2 border-t font-semibold">
                <span className="w-32">Contribution Margin</span>
                <div className="flex-1" />
                <span className="w-20 text-right">{fmt(a.contribution_margin)}</span>
                <span className={`w-10 text-right ${a.margin_pct >= 0.15 ? "text-green-600" : "text-red-600"}`}>
                  {(a.margin_pct * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function MarginTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<"accounts" | "drivers" | "trips">("accounts");
  const [running, setRunning] = useState(false);

  const { data: accountMargins = [], isLoading: loadingAccounts } = useQuery<AccountMargin[]>({
    queryKey: ["/api/financial/margin/accounts"],
    queryFn: () => fetch("/api/financial/margin/accounts").then(r => r.json()),
  });
  const { data: driverMargins = [], isLoading: loadingDrivers } = useQuery<DriverMargin[]>({
    queryKey: ["/api/financial/margin/drivers"],
    queryFn: () => fetch("/api/financial/margin/drivers").then(r => r.json()),
  });
  const { data: tripData, isLoading: loadingTrips } = useQuery<{ trips: TripMargin[]; summary: any }>({
    queryKey: ["/api/financial/margin/trips"],
    queryFn: () => fetch("/api/financial/margin/trips").then(r => r.json()),
  });
  const { data: lastSnap } = useQuery<{ lastRun: string | null }>({
    queryKey: ["/api/financial/margin/last-snapshot"],
    queryFn: () => fetch("/api/financial/margin/last-snapshot").then(r => r.json()),
  });

  async function handleRunAnalysis() {
    setRunning(true);
    try {
      const res = await fetch("/api/financial/margin/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast({ title: `Analysis complete — ${data.accounts} accounts, ${data.drivers} drivers, ${data.trips} trips` });
      qc.invalidateQueries({ queryKey: ["/api/financial/margin"] });
    } catch (err: any) {
      toast({ title: err.message || "Analysis failed", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  const trips = tripData?.trips ?? [];
  const tripSummary = tripData?.summary;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">Margin Intelligence</h2>
          <p className="text-sm text-muted-foreground">
            True profitability per account, driver, and trip — trailing 12 months
            {lastSnap?.lastRun && (
              <span className="ml-2 text-xs text-muted-foreground/70">
                · Last run {new Date(lastSnap.lastRun).toLocaleDateString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            <Button variant={view === "accounts" ? "default" : "outline"} size="sm" onClick={() => setView("accounts")} data-testid="button-margin-accounts">Accounts</Button>
            <Button variant={view === "drivers" ? "default" : "outline"} size="sm" onClick={() => setView("drivers")} data-testid="button-margin-drivers">Drivers</Button>
            <Button variant={view === "trips" ? "default" : "outline"} size="sm" onClick={() => setView("trips")} data-testid="button-margin-trips">Trips</Button>
          </div>
          <Button size="sm" onClick={handleRunAnalysis} disabled={running} data-testid="button-run-margin-analysis">
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Run Analysis
          </Button>
        </div>
      </div>

      {/* Account Margin View */}
      {view === "accounts" && (
        <Card>
          <CardContent className="p-0">
            {loadingAccounts ? (
              <div className="flex items-center gap-2 p-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading account margins...</div>
            ) : accountMargins.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <BarChart3 className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">No margin data yet</p>
                <p className="text-xs text-muted-foreground">Click "Run Analysis" to compute account margins from live data.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Account</th>
                      <th className="text-right py-3 px-3 font-medium text-muted-foreground">Revenue</th>
                      <th className="text-right py-3 px-3 font-medium text-muted-foreground">Driver Cost</th>
                      <th className="text-right py-3 px-3 font-medium text-muted-foreground">Payroll Burden</th>
                      <th className="text-right py-3 px-3 font-medium text-muted-foreground">Vendor Alloc.</th>
                      <th className="text-right py-3 px-3 font-medium text-muted-foreground">Claims Alloc.</th>
                      <th className="text-right py-3 px-3 font-medium text-muted-foreground">Admin Alloc.</th>
                      <th className="text-right py-3 px-3 font-medium text-muted-foreground">Contrib. Margin</th>
                      <th className="text-right py-3 px-3 font-medium text-muted-foreground">Margin %</th>
                      <th className="py-3 px-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {accountMargins.map(a => (
                      <AccountMarginRow key={a.account_id ?? a.account_name} a={a} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Driver Margin View */}
      {view === "drivers" && (
        <Card>
          <CardContent className="p-0">
            {loadingDrivers ? (
              <div className="flex items-center gap-2 p-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading driver margins...</div>
            ) : driverMargins.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Users className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">No driver data yet</p>
                <p className="text-xs text-muted-foreground">Click "Run Analysis" to compute driver-level margins.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Driver</th>
                      <th className="text-left py-3 px-3 font-medium text-muted-foreground">Type</th>
                      <th className="text-right py-3 px-3 font-medium text-muted-foreground">Rev. Attributed</th>
                      <th className="text-right py-3 px-3 font-medium text-muted-foreground">Driver Cost</th>
                      <th className="text-right py-3 px-3 font-medium text-muted-foreground">Payroll Burden</th>
                      <th className="text-right py-3 px-3 font-medium text-muted-foreground">Claims Alloc.</th>
                      <th className="text-right py-3 px-3 font-medium text-muted-foreground">Admin Alloc.</th>
                      <th className="text-right py-3 px-3 font-medium text-muted-foreground">Total Cost</th>
                      <th className="text-right py-3 px-3 font-medium text-muted-foreground">Contrib. Margin</th>
                      <th className="text-right py-3 px-3 font-medium text-muted-foreground">Margin %</th>
                      <th className="text-right py-3 px-3 font-medium text-muted-foreground">Hrs Worked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {driverMargins.map(d => (
                      <tr key={d.driver_id} className="border-b last:border-0" data-testid={`row-driver-margin-${d.driver_id}`}>
                        <td className="py-3 px-4">
                          <div className="font-medium">{d.driver_name}</div>
                          {d.driver_number && <div className="text-xs text-muted-foreground">#{d.driver_number}</div>}
                        </td>
                        <td className="py-3 px-3">
                          <Badge variant="secondary" className="text-xs">{d.classification ?? "—"}</Badge>
                        </td>
                        <td className="text-right py-3 px-3 text-green-700 dark:text-green-400">{d.revenue_attributed > 0 ? fmt(d.revenue_attributed) : "—"}</td>
                        <td className="text-right py-3 px-3 text-muted-foreground">{d.driver_cost > 0 ? fmt(d.driver_cost) : "—"}</td>
                        <td className="text-right py-3 px-3 text-muted-foreground">{d.payroll_burden > 0 ? fmt(d.payroll_burden) : "—"}</td>
                        <td className="text-right py-3 px-3 text-muted-foreground">{d.claims_allocation > 0 ? fmt(d.claims_allocation) : "—"}</td>
                        <td className="text-right py-3 px-3 text-muted-foreground">{d.admin_allocation > 0 ? fmt(d.admin_allocation) : "—"}</td>
                        <td className="text-right py-3 px-3 font-medium">{d.total_cost > 0 ? fmt(d.total_cost) : "—"}</td>
                        <td className={`text-right py-3 px-3 font-medium ${d.contribution_margin != null ? (d.contribution_margin >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400") : ""}`}>
                          {d.contribution_margin != null ? fmt(d.contribution_margin) : "—"}
                        </td>
                        <MarginPctCell pct={d.margin_pct} />
                        <td className="text-right py-3 px-3 text-muted-foreground">{d.hours_worked > 0 ? d.hours_worked.toFixed(1) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Trip Margin View */}
      {view === "trips" && (
        <div className="space-y-4">
          {tripSummary && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: "Total Trips", value: tripSummary.tripCount.toLocaleString(), sub: null },
                { label: "Total Revenue", value: fmt(tripSummary.totalRevenue), sub: null },
                { label: "Total Contribution", value: fmt(tripSummary.totalContributionMargin), sub: null },
                { label: "Avg Trip Margin", value: (tripSummary.avgMarginPct * 100).toFixed(1) + "%", sub: null },
              ].map(s => (
                <Card key={s.label}>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="text-lg font-bold mt-1">{s.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <Card>
            <CardContent className="p-0">
              {loadingTrips ? (
                <div className="flex items-center gap-2 p-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading trip margins...</div>
              ) : trips.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <Truck className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-muted-foreground">No trip margin data</p>
                  <p className="text-xs text-muted-foreground">Run the analysis engine to compute per-trip profitability from invoice line items.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b">
                      <tr>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Account</th>
                        <th className="text-left py-3 px-3 font-medium text-muted-foreground">Trip Date</th>
                        <th className="text-right py-3 px-3 font-medium text-muted-foreground">Revenue</th>
                        <th className="text-right py-3 px-3 font-medium text-muted-foreground">Driver Cost</th>
                        <th className="text-right py-3 px-3 font-medium text-muted-foreground">Overhead</th>
                        <th className="text-right py-3 px-3 font-medium text-muted-foreground">Claims</th>
                        <th className="text-right py-3 px-3 font-medium text-muted-foreground">Contrib. Margin</th>
                        <th className="text-right py-3 px-3 font-medium text-muted-foreground">Margin %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trips.map(t => (
                        <tr key={t.id} className="border-b last:border-0" data-testid={`row-trip-margin-${t.id}`}>
                          <td className="py-3 px-4 text-sm">{t.account_name ?? "—"}</td>
                          <td className="py-3 px-3 text-muted-foreground text-xs">{t.trip_date ? formatDate(t.trip_date) : "—"}</td>
                          <td className="text-right py-3 px-3 font-medium text-green-700 dark:text-green-400">{fmt(t.revenue)}</td>
                          <td className="text-right py-3 px-3 text-muted-foreground">{fmt(t.driver_cost)}</td>
                          <td className="text-right py-3 px-3 text-muted-foreground">{fmt(t.overhead_allocation)}</td>
                          <td className="text-right py-3 px-3 text-muted-foreground">{fmt(t.claims_allocation)}</td>
                          <td className={`text-right py-3 px-3 font-medium ${t.contribution_margin >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                            {fmt(t.contribution_margin)}
                          </td>
                          <MarginPctCell pct={t.margin_pct} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-start gap-2 p-4 bg-muted/50 rounded-md text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          <strong>Cost Allocation Model:</strong> Contractor cost = direct IC driver pay attributed to account.
          Payroll burden = employee salaries + 22% employer taxes/benefits, allocated by driver headcount.
          Vendor allocation = active vendor contracts spread proportionally by revenue share.
          Claims allocation = direct account claims + pro-rata share of unattributed claims.
          Admin overhead = 4% of account revenue. Contribution Margin = Revenue minus all allocated costs.
        </p>
      </div>
    </div>
  );
}


// ── Repricing Tab ─────────────────────────────────────────────────────────────
const TRIGGER_META: Record<string, { label: string; icon: JSX.Element; color: string }> = {
  margin_below:    { label: "Margin Below Target",   icon: <AlertTriangle className="h-3 w-3" />, color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  trending_down:   { label: "Margin Trending Down",  icon: <TrendingDown className="h-3 w-3" />,  color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  labor_increase:  { label: "Labor Cost Increase",   icon: <Users className="h-3 w-3" />,         color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  vendor_increase: { label: "Vendor Cost Increase",  icon: <DollarSign className="h-3 w-3" />,    color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  claims_increase: { label: "Claims Cost Increase",  icon: <XCircle className="h-3 w-3" />,       color: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" },
  multiple:        { label: "Multiple Triggers",     icon: <BrainCircuit className="h-3 w-3" />,  color: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400" },
};

function TriggerBadge({ type }: { type: string | null }) {
  const meta = TRIGGER_META[type ?? ""] ?? TRIGGER_META["multiple"];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.color}`}>
      {meta.icon}{meta.label}
    </span>
  );
}

function RepricingTab() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [triggerFilter, setTriggerFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [targetMargin, setTargetMargin] = useState(15);

  const { data: allFlags = [], isLoading } = useQuery<RepricingFlag[]>({
    queryKey: ["/api/financial/repricing"],
  });

  const detectMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/financial/repricing/detect", { targetMarginPct: targetMargin / 100 }),
    onSuccess: async (res: any) => {
      const data = await res.json();
      toast({ title: `Detection complete — ${data.flaggedCount} new, ${data.updatedCount ?? 0} updated` });
      queryClient.invalidateQueries({ queryKey: ["/api/financial/repricing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial/dashboard"] });
    },
    onError: () => toast({ title: "Detection failed", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/financial/repricing/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financial/repricing"] });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  // Summary counts
  const openFlags     = allFlags.filter(f => f.status === "open");
  const byTrigger     = Object.keys(TRIGGER_META).reduce<Record<string, number>>((acc, k) => {
    acc[k] = allFlags.filter(f => f.triggerType === k).length;
    return acc;
  }, {});

  // Filtered display list
  const flags = allFlags.filter(f => {
    if (statusFilter !== "all" && f.status !== statusFilter) return false;
    if (triggerFilter !== "all" && f.triggerType !== triggerFilter) return false;
    return true;
  });

  const actionBadge = (action: string | null) => {
    if (action === "reprice") return <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">Reprice</Badge>;
    if (action === "review") return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Review</Badge>;
    if (action === "exit") return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Exit</Badge>;
    return <Badge variant="secondary">—</Badge>;
  };

  const statusBadge = (s: string) => {
    if (s === "open") return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Open</Badge>;
    if (s === "reviewed") return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Reviewed</Badge>;
    if (s === "actioned") return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Actioned</Badge>;
    if (s === "dismissed") return <Badge variant="secondary">Dismissed</Badge>;
    return <Badge variant="secondary">{s}</Badge>;
  };

  const confidenceColor = (c: number) =>
    c >= 80 ? "text-red-600 dark:text-red-400" : c >= 60 ? "text-orange-500" : "text-yellow-600";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-semibold">Automated Repricing Detection</h2>
          <p className="text-sm text-muted-foreground">Continuously monitors 5 trigger categories to identify accounts requiring price adjustments</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 border rounded-md px-3 py-1.5 text-sm">
            <span className="text-muted-foreground">Target margin</span>
            <Input
              type="number"
              value={targetMargin}
              onChange={e => setTargetMargin(Number(e.target.value))}
              className="w-16 h-7 text-center border-0 p-0 focus-visible:ring-0"
              data-testid="input-target-margin"
            />
            <span className="text-muted-foreground">%</span>
          </div>
          <Button onClick={() => detectMutation.mutate()} disabled={detectMutation.isPending} data-testid="button-run-repricing">
            {detectMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Run Detection Engine
          </Button>
        </div>
      </div>

      {/* Trigger Category Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(TRIGGER_META).map(([key, meta]) => (
          <button
            key={key}
            onClick={() => setTriggerFilter(triggerFilter === key ? "all" : key)}
            data-testid={`button-filter-trigger-${key}`}
            className={`text-left rounded-md border p-3 transition-colors ${triggerFilter === key ? "border-primary bg-primary/5" : "hover-elevate"}`}
          >
            <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs mb-2 ${meta.color}`}>
              {meta.icon}
            </div>
            <p className="text-xl font-bold">{byTrigger[key] ?? 0}</p>
            <p className="text-xs text-muted-foreground leading-tight mt-0.5">{meta.label}</p>
          </button>
        ))}
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-1 border-b pb-0">
        {["open", "reviewed", "actioned", "dismissed", "all"].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            data-testid={`button-status-filter-${s}`}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              statusFilter === s
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            {s === "open" && openFlags.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold">
                {openFlags.length > 9 ? "9+" : openFlags.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Flag List */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading...</div>
      ) : flags.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <CheckCircle className="h-10 w-10 text-green-500/60" />
          <p className="font-medium">No flags match this filter</p>
          <p className="text-sm text-muted-foreground">
            {allFlags.length === 0
              ? "Run the detection engine to scan your accounts for repricing opportunities."
              : "Try changing the status or trigger filter above."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {flags.map(f => {
            const reasons: string[] = (() => { try { return JSON.parse(f.reasonCodes ?? "[]"); } catch { return []; } })();
            const isExpanded = expandedId === f.id;
            const confidence = Number(f.aiConfidence ?? 0);
            const revenueAdj = Number(f.estimatedRevenueAdjustment ?? 0);

            return (
              <Card key={f.id} className="overflow-hidden">
                <button
                  className="w-full text-left"
                  onClick={() => setExpandedId(isExpanded ? null : f.id)}
                  data-testid={`button-expand-flag-${f.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4 flex-wrap">
                      {/* Account + Trigger */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{f.accountName ?? "Unknown Account"}</span>
                          {statusBadge(f.status)}
                          {actionBadge(f.recommendedAction)}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <TriggerBadge type={f.triggerType} />
                          {reasons.length > 1 && (
                            <span className="text-xs text-muted-foreground">+{reasons.length - 1} more trigger{reasons.length > 2 ? "s" : ""}</span>
                          )}
                        </div>
                        {f.issueReason && (
                          <p className="text-xs text-muted-foreground">{f.issueReason}</p>
                        )}
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-6 flex-wrap shrink-0 text-right">
                        <div>
                          <p className="text-xs text-muted-foreground">TTM Revenue</p>
                          <p className="font-semibold">{f.ttmRevenue ? fmt(Number(f.ttmRevenue)) : "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Margin</p>
                          <p className={`font-bold ${MARGIN_COLOR(Number(f.marginPct ?? 0))}`}>
                            {f.marginPct ? pct(Number(f.marginPct)) : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Target</p>
                          <p className="font-medium text-muted-foreground">{f.targetMarginPct ? pct(Number(f.targetMarginPct)) : "—"}</p>
                        </div>
                        {revenueAdj > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground">Rev. Adj. Needed</p>
                            <p className="font-semibold text-orange-600 dark:text-orange-400">+{fmt(revenueAdj)}</p>
                          </div>
                        )}
                        {confidence > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground">AI Confidence</p>
                            <p className={`font-bold ${confidenceColor(confidence)}`}>{confidence.toFixed(0)}%</p>
                          </div>
                        )}
                        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      </div>
                    </div>
                  </CardContent>
                </button>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="border-t bg-muted/30 p-4 space-y-4">
                    {/* All Triggers Fired */}
                    {reasons.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Active Triggers</p>
                        <div className="flex flex-wrap gap-2">
                          {reasons.map(r => <TriggerBadge key={r} type={r} />)}
                        </div>
                      </div>
                    )}

                    {/* Cost breakdown */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">TTM Cost</p>
                        <p className="font-medium">{f.ttmCost ? fmt(Number(f.ttmCost)) : "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Contribution Margin $</p>
                        <p className="font-medium">
                          {f.ttmRevenue && f.ttmCost
                            ? fmt(Number(f.ttmRevenue) - Number(f.ttmCost))
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Gap to Target Margin</p>
                        <p className={`font-medium ${MARGIN_COLOR(Number(f.marginPct ?? 0))}`}>
                          {f.marginPct && f.targetMarginPct
                            ? `${((Number(f.marginPct) - Number(f.targetMarginPct)) * 100).toFixed(1)}pp`
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Estimated Revenue Adjustment</p>
                        <p className="font-semibold text-orange-600 dark:text-orange-400">
                          {revenueAdj > 0 ? `+${fmt(revenueAdj)}` : "None needed"}
                        </p>
                      </div>
                    </div>

                    {/* AI Summary */}
                    {f.aiSummary && (
                      <div className="bg-background rounded-md p-3 border text-sm">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <BrainCircuit className="h-3.5 w-3.5 text-[#FF6B35]" />
                          <span className="text-xs font-semibold text-[#FF6B35]">AI Rationale</span>
                        </div>
                        <p className="text-muted-foreground leading-relaxed">{f.aiSummary}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        Flagged {new Date(f.flaggedAt).toLocaleDateString()}
                      </span>
                      <div className="flex-1" />
                      {f.status === "open" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ id: f.id, status: "reviewed" })} data-testid={`button-review-${f.id}`}>
                            <CheckCircle className="h-3 w-3 mr-1" />Mark Reviewed
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ id: f.id, status: "dismissed" })} data-testid={`button-dismiss-${f.id}`}>
                            <XCircle className="h-3 w-3 mr-1" />Dismiss
                          </Button>
                        </>
                      )}
                      {f.status === "reviewed" && (
                        <Button size="sm" onClick={() => updateMutation.mutate({ id: f.id, status: "actioned" })} data-testid={`button-action-${f.id}`}>
                          <CheckCircle className="h-3 w-3 mr-1" />Mark Actioned
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Goals Tab ─────────────────────────────────────────────────────────────────
function GoalsTab() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    moduleTarget: "", metricName: "", targetValue: "", targetPeriodYear: String(new Date().getFullYear()), targetPeriodMonth: "", notes: "",
  });

  const { data: goals = [], isLoading } = useQuery<ForecastGoal[]>({
    queryKey: ["/api/financial/goals"],
  });

  const createMutation = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/financial/goals", body),
    onSuccess: () => {
      toast({ title: "Goal created" });
      queryClient.invalidateQueries({ queryKey: ["/api/financial/goals"] });
      setShowCreate(false);
      setForm({ moduleTarget: "", metricName: "", targetValue: "", targetPeriodYear: String(new Date().getFullYear()), targetPeriodMonth: "", notes: "" });
    },
    onError: () => toast({ title: "Failed to create goal", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/financial/goals/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/financial/goals"] }),
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const statusBadge = (s: string) => {
    if (s === "draft") return <Badge variant="secondary">Draft</Badge>;
    if (s === "approved") return <Badge className="bg-blue-100 text-blue-700">Approved</Badge>;
    if (s === "pushed") return <Badge className="bg-green-100 text-green-700">Pushed</Badge>;
    if (s === "cancelled") return <Badge className="bg-gray-100 text-gray-600">Cancelled</Badge>;
    return <Badge variant="secondary">{s}</Badge>;
  };

  const MODULE_OPTIONS = ["accounts","drivers","invoicing","claims","recruiting","scheduling"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Forecast Goals</h2>
          <p className="text-sm text-muted-foreground">Push approved forecast targets into operational modules as goals</p>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="button-create-goal">
          <Target className="h-4 w-4 mr-2" />Create Goal
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading...</div>
      ) : goals.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Target className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No forecast goals yet. Create goals to push targets into operational modules.</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left p-4 font-medium text-muted-foreground">Module</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Metric</th>
                  <th className="text-right p-4 font-medium text-muted-foreground">Target</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Period</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Status</th>
                  <th className="text-right p-4 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {goals.map(g => (
                  <tr key={g.id} className="border-b last:border-0 hover-elevate">
                    <td className="p-4 font-medium capitalize">{g.moduleTarget}</td>
                    <td className="p-4 text-muted-foreground">{g.metricName}</td>
                    <td className="p-4 text-right font-medium">{g.targetValue ? fmt(Number(g.targetValue)) : "—"}</td>
                    <td className="p-4 text-muted-foreground text-xs">
                      {g.targetPeriodMonth && g.targetPeriodYear
                        ? `${MONTHS[g.targetPeriodMonth - 1]} ${g.targetPeriodYear}`
                        : g.targetPeriodYear ?? "—"}
                    </td>
                    <td className="p-4">{statusBadge(g.status)}</td>
                    <td className="p-4 text-right">
                      {g.status === "draft" && (
                        <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ id: g.id, status: "approved" })} data-testid={`button-approve-goal-${g.id}`}>
                          <CheckCircle className="h-3 w-3 mr-1" />Approve
                        </Button>
                      )}
                      {g.status === "approved" && (
                        <Button size="sm" onClick={() => updateMutation.mutate({ id: g.id, status: "pushed" })} data-testid={`button-push-goal-${g.id}`}>
                          <ChevronRight className="h-3 w-3 mr-1" />Push to Module
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Forecast Goal</DialogTitle>
            <DialogDescription>Define a target metric to push into an operational module</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Module</Label>
              <Select value={form.moduleTarget} onValueChange={v => setForm(f => ({ ...f, moduleTarget: v }))}>
                <SelectTrigger data-testid="select-goal-module"><SelectValue placeholder="Select module..." /></SelectTrigger>
                <SelectContent>
                  {MODULE_OPTIONS.map(m => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Metric Name</Label>
              <Input value={form.metricName} onChange={e => setForm(f => ({ ...f, metricName: e.target.value }))} placeholder="e.g. monthly_revenue_target" data-testid="input-goal-metric" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Target Value ($)</Label>
                <Input type="number" value={form.targetValue} onChange={e => setForm(f => ({ ...f, targetValue: e.target.value }))} placeholder="0.00" data-testid="input-goal-value" />
              </div>
              <div className="space-y-1.5">
                <Label>Period</Label>
                <div className="flex gap-2">
                  <Input value={form.targetPeriodYear} onChange={e => setForm(f => ({ ...f, targetPeriodYear: e.target.value }))} placeholder="Year" className="w-20" data-testid="input-goal-year" />
                  <Select value={form.targetPeriodMonth} onValueChange={v => setForm(f => ({ ...f, targetPeriodMonth: v }))}>
                    <SelectTrigger data-testid="select-goal-month"><SelectValue placeholder="Mo" /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional context for this goal..." rows={3} data-testid="textarea-goal-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate({ ...form, targetValue: form.targetValue ? Number(form.targetValue) : null, targetPeriodYear: form.targetPeriodYear ? Number(form.targetPeriodYear) : null, targetPeriodMonth: form.targetPeriodMonth ? Number(form.targetPeriodMonth) : null })} disabled={createMutation.isPending || !form.moduleTarget || !form.metricName} data-testid="button-create-goal-submit">
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Goal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function FinancialIntelligence() {
  const { toast } = useToast();
  const [showGenDialog, setShowGenDialog] = useState(false);
  const [genLabel, setGenLabel] = useState("");
  const [genNotes, setGenNotes] = useState("");

  const { data: summary, isLoading: loadingSummary } = useQuery<DashboardSummary>({
    queryKey: ["/api/financial/dashboard"],
  });

  const generateMutation = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/financial/forecast/generate", body),
    onSuccess: async (res: any) => {
      const data = await res.json();
      toast({ title: `Forecast generated — ${data.itemCount} line items across 12 months` });
      queryClient.invalidateQueries({ queryKey: ["/api/financial/forecast/latest"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial/dashboard"] });
      setShowGenDialog(false);
      setGenLabel("");
      setGenNotes("");
    },
    onError: () => toast({ title: "Forecast generation failed", variant: "destructive" }),
  });

  const handleGenerate = () => {
    generateMutation.mutate({ label: genLabel || undefined, notes: genNotes || undefined });
  };

  if (loadingSummary) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading Financial Intelligence...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      {typeof window !== "undefined" && window.location.search.includes("from=claims-dashboard") && (
        <div className="px-6 py-2 border-b border-border bg-muted/30 flex items-center">
          <Link href="/claims/dashboard">
            <button className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors h-7 px-2 rounded hover:bg-accent">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Claims Dashboard
            </button>
          </Link>
        </div>
      )}
      <div className="p-6 pb-0">
        <div className="flex items-center gap-3 mb-1">
          <BrainCircuit className="h-6 w-6 text-[#FF6B35]" />
          <h1 className="text-xl font-bold">Financial Intelligence</h1>
          <Badge className="bg-[#FF6B35]/10 text-[#FF6B35] border-[#FF6B35]/20">Autonomous Forecasting</Badge>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Rolling 12-month autonomous forecast · Margin analysis · Repricing detection · Goal management</p>
        <Separator />
      </div>

      <div className="flex-1 p-6 pt-4">
        <Tabs defaultValue="dashboard">
          <TabsList className="mb-6">
            <TabsTrigger value="dashboard" data-testid="tab-dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="forecast" data-testid="tab-forecast">Rolling Forecast</TabsTrigger>
            <TabsTrigger value="pnl" data-testid="tab-pnl">P&L Actuals</TabsTrigger>
            <TabsTrigger value="margin" data-testid="tab-margin">Margin Intelligence</TabsTrigger>
            <TabsTrigger value="repricing" data-testid="tab-repricing">Repricing</TabsTrigger>
            <TabsTrigger value="goals" data-testid="tab-goals">Goals</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            {summary && <DashboardTab summary={summary} onGenerate={() => setShowGenDialog(true)} />}
          </TabsContent>
          <TabsContent value="forecast">
            <ForecastTab onGenerate={() => setShowGenDialog(true)} />
          </TabsContent>
          <TabsContent value="pnl">
            <PnlTab />
          </TabsContent>
          <TabsContent value="margin">
            <MarginTab />
          </TabsContent>
          <TabsContent value="repricing">
            <RepricingTab />
          </TabsContent>
          <TabsContent value="goals">
            <GoalsTab />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showGenDialog} onOpenChange={setShowGenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-[#FF6B35]" />
              Generate Rolling Forecast
            </DialogTitle>
            <DialogDescription>
              The engine will pull live data from all operational modules — accounts, invoices, drivers, employees, claims — and generate a 12-month rolling forecast automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Snapshot Label (optional)</Label>
              <Input value={genLabel} onChange={e => setGenLabel(e.target.value)} placeholder="e.g. Q2 2026 Forecast" data-testid="input-forecast-label" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea value={genNotes} onChange={e => setGenNotes(e.target.value)} placeholder="Any notes about this forecast run..." rows={3} data-testid="textarea-forecast-notes" />
            </div>
            <div className="p-3 bg-muted/50 rounded-md text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">This forecast will use:</p>
              <p>· Trailing 12-month invoiced revenue as the revenue baseline</p>
              <p>· Active driver count × hourly rate × estimated 120 hrs/mo for labor</p>
              <p>· Active employee headcount × $5,500/mo avg for payroll</p>
              <p>· TTM claims reserve for claims projection</p>
              <p>· 2% monthly growth · 3% churn rate · 25% payroll burden · 5% overhead</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenDialog(false)}>Cancel</Button>
            <Button onClick={handleGenerate} disabled={generateMutation.isPending} data-testid="button-confirm-generate">
              {generateMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</>
              ) : (
                <><Play className="h-4 w-4 mr-2" />Run Forecast Engine</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
