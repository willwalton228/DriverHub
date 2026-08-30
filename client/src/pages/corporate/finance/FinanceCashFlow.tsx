import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, DollarSign, ArrowDownLeft, ArrowUpRight, Activity, CalendarDays } from "lucide-react";
import { format, parseISO } from "date-fns";
import { FinanceAccessGate } from "@/components/finance/FinanceAccessGate";

// ── Types ──────────────────────────────────────────────────────────────────────

interface DailyRow {
  date: string;
  total_amount: string;
  transaction_count: number;
}
interface MonthlyRow {
  month: string;
  total_amount: string;
  transaction_count: number;
}
interface WeeklyRow {
  week_start: string;
  total_amount: string;
  transaction_count: number;
}
interface CashFlowRow {
  month: string;
  cash_in: string;
  cash_out: string;
  net_flow: string;
  inflow_count: number;
  outflow_count: number;
}
interface InvoicingStats {
  totalOutstanding: string;
  overdueAmount: string;
  paymentsReceivedThisMonth: string;
  agingSummary: {
    current: string;
    days1to30: string;
    days31to60: string;
    days61to90: string;
    over90: string;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(val: number | string | undefined | null, decimals = 0): string {
  const n = typeof val === "string" ? parseFloat(val) : (val ?? 0);
  if (isNaN(n)) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function FinanceCashFlow() {
  const [dateRange, setDateRange] = useState("90");
  const [tab, setTab] = useState("monthly");

  const days = parseInt(dateRange);
  const until = new Date().toISOString().slice(0, 10);
  const since = (() => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); })();
  const since180 = (() => { const d = new Date(); d.setDate(d.getDate() - 180); return d.toISOString().slice(0, 10); })();

  const { data: daily, isLoading: dailyLoading } = useQuery<DailyRow[]>({
    queryKey: ["/api/corporate/integrations/quickbooks/expenses/daily", since, until],
    queryFn: () => fetch(`/api/corporate/integrations/quickbooks/expenses/daily?since=${since}&until=${until}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: monthly, isLoading: monthlyLoading } = useQuery<MonthlyRow[]>({
    queryKey: ["/api/corporate/integrations/quickbooks/expenses/monthly", since, until],
    queryFn: () => fetch(`/api/corporate/integrations/quickbooks/expenses/monthly?since=${since}&until=${until}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: weekly, isLoading: weeklyLoading } = useQuery<WeeklyRow[]>({
    queryKey: ["/api/corporate/integrations/quickbooks/expenses/weekly", since, until],
    queryFn: () => fetch(`/api/corporate/integrations/quickbooks/expenses/weekly?since=${since}&until=${until}`, { credentials: "include" }).then(r => r.json()),
    enabled: tab === "weekly",
  });

  const { data: cashFlow, isLoading: cashFlowLoading } = useQuery<CashFlowRow[]>({
    queryKey: ["/api/corporate/integrations/quickbooks/expenses/cash-flow", since180, until],
    queryFn: () => fetch(`/api/corporate/integrations/quickbooks/expenses/cash-flow?since=${since180}&until=${until}`, { credentials: "include" }).then(r => r.json()),
    enabled: tab === "cashflow",
  });

  const { data: stats } = useQuery<InvoicingStats>({
    queryKey: ["/api/corporate/invoicing/stats"],
  });

  // Derived aggregates
  const monthlyData = monthly ?? [];
  const dailyData   = daily ?? [];
  const weeklyData  = weekly ?? [];
  const cashFlowData = cashFlow ?? [];

  const totalOutflow  = dailyData.reduce((s, d) => s + parseFloat(d.total_amount), 0);
  const inflow        = parseFloat(stats?.paymentsReceivedThisMonth ?? "0");
  const netFlow       = inflow - totalOutflow;
  const maxMonthlyAmt = Math.max(...monthlyData.map(m => parseFloat(m.total_amount)), 1);
  const maxWeeklyAmt  = Math.max(...weeklyData.map(w => parseFloat(w.total_amount)), 1);

  // Find trend: compare last 2 months
  const lastMonth = monthlyData[monthlyData.length - 1];
  const prevMonth = monthlyData[monthlyData.length - 2];
  const monthTrend = lastMonth && prevMonth
    ? ((parseFloat(lastMonth.total_amount) - parseFloat(prevMonth.total_amount)) / parseFloat(prevMonth.total_amount)) * 100
    : null;

  // Daily sparkline — last 30 days
  const recent30 = dailyData.slice(-30);
  const maxDailyAmt = Math.max(...recent30.map(d => parseFloat(d.total_amount)), 1);

  // Cash flow maxes
  const maxCashIn  = Math.max(...cashFlowData.map(r => parseFloat(r.cash_in)), 1);
  const maxCashOut = Math.max(...cashFlowData.map(r => parseFloat(r.cash_out)), 1);
  const maxCashAbs = Math.max(maxCashIn, maxCashOut);

  return (
    <FinanceAccessGate>
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Cash Flow</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Expense outflow (QuickBooks) vs. revenue inflow (DriverHub AR)</p>
        </div>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="60">Last 60 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="180">Last 180 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className={netFlow >= 0 ? "border-green-500/40" : "border-destructive/40"}>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 flex-wrap">
            <CardTitle className="text-xs font-medium text-muted-foreground">Net Cash Position</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netFlow >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
              {netFlow >= 0 ? "+" : ""}{fmt(netFlow)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Inflow minus outflow</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 flex-wrap">
            <CardTitle className="text-xs font-medium text-muted-foreground">Cash Inflow (AR)</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-green-500 shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{fmt(inflow)}</div>
            <p className="text-xs text-muted-foreground mt-1">Payments received MTD</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 flex-wrap">
            <CardTitle className="text-xs font-medium text-muted-foreground">Cash Outflow (AP)</CardTitle>
            <ArrowDownLeft className="h-4 w-4 text-destructive shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{fmt(totalOutflow)}</div>
            <p className="text-xs text-muted-foreground mt-1">QB expenses in period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 flex-wrap">
            <CardTitle className="text-xs font-medium text-muted-foreground">Open AR</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(stats?.totalOutstanding)}</div>
            <p className="text-xs text-muted-foreground mt-1">Uncollected receivables</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="monthly" data-testid="tab-cf-monthly">Monthly Outflow</TabsTrigger>
          <TabsTrigger value="weekly"  data-testid="tab-cf-weekly">Weekly Outflow</TabsTrigger>
          <TabsTrigger value="daily"   data-testid="tab-cf-daily">Daily Sparkline</TabsTrigger>
          <TabsTrigger value="cashflow" data-testid="tab-cf-comparison">In vs Out</TabsTrigger>
          <TabsTrigger value="aging"    data-testid="tab-cf-aging">AR Aging</TabsTrigger>
        </TabsList>

        {/* Monthly */}
        <TabsContent value="monthly" className="mt-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 flex-wrap space-y-0">
              <div>
                <CardTitle className="text-base">Monthly Outflow (QuickBooks)</CardTitle>
                <CardDescription className="text-xs">AP &amp; expense spend by month from QuickBooks</CardDescription>
              </div>
              {monthTrend !== null && (
                <div className={`flex items-center gap-1 text-sm font-medium ${monthTrend >= 0 ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>
                  {monthTrend >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {Math.abs(monthTrend).toFixed(1)}% vs prior month
                </div>
              )}
            </CardHeader>
            <CardContent>
              {monthlyLoading ? <Skeleton className="h-48 w-full" /> : monthlyData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No monthly data. Run a QuickBooks sync to populate.</p>
              ) : (
                <div className="space-y-2">
                  {[...monthlyData].reverse().map((m, i) => {
                    const amt = parseFloat(m.total_amount);
                    const pct = maxMonthlyAmt > 0 ? (amt / maxMonthlyAmt) * 100 : 0;
                    return (
                      <div key={m.month} className="flex items-center gap-3" data-testid={`month-bar-${i}`}>
                        <span className="text-xs text-muted-foreground w-20 shrink-0 font-medium">{m.month}</span>
                        <div className="flex-1 h-7 bg-muted rounded overflow-hidden">
                          <div
                            className="h-full bg-destructive/70 rounded flex items-center justify-end pr-2"
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          >
                            {pct > 20 && (
                              <span className="text-xs text-white font-medium">{m.transaction_count}t</span>
                            )}
                          </div>
                        </div>
                        <span className="text-sm font-semibold w-28 text-right shrink-0 whitespace-nowrap">{fmt(amt)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Weekly */}
        <TabsContent value="weekly" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" /> Weekly Outflow
              </CardTitle>
              <CardDescription className="text-xs">AP/expense spend by week (QuickBooks)</CardDescription>
            </CardHeader>
            <CardContent>
              {weeklyLoading ? <Skeleton className="h-48 w-full" /> : weeklyData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No weekly data. Run a QuickBooks sync to populate.</p>
              ) : (
                <div className="space-y-2">
                  {[...weeklyData].reverse().map((w, i) => {
                    const amt = parseFloat(w.total_amount);
                    const pct = maxWeeklyAmt > 0 ? (amt / maxWeeklyAmt) * 100 : 0;
                    return (
                      <div key={w.week_start} className="flex items-center gap-3" data-testid={`week-bar-${i}`}>
                        <span className="text-xs text-muted-foreground w-20 shrink-0 font-medium">
                          {w.week_start ? format(parseISO(w.week_start), "MMM d") : "—"}
                        </span>
                        <div className="flex-1 h-7 bg-muted rounded overflow-hidden">
                          <div
                            className="h-full bg-primary/70 rounded flex items-center justify-end pr-2"
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          >
                            {pct > 20 && (
                              <span className="text-xs text-primary-foreground font-medium">{w.transaction_count}t</span>
                            )}
                          </div>
                        </div>
                        <span className="text-sm font-semibold w-28 text-right shrink-0 whitespace-nowrap">{fmt(amt)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Daily sparkline */}
        <TabsContent value="daily" className="mt-4">
          {recent30.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Daily Outflow — Last 30 Days</CardTitle>
                <CardDescription className="text-xs">Day-by-day AP activity from QuickBooks</CardDescription>
              </CardHeader>
              <CardContent>
                {dailyLoading ? <Skeleton className="h-24 w-full" /> : (
                  <div className="flex items-end gap-0.5 h-24 w-full">
                    {recent30.map((d, i) => {
                      const amt = parseFloat(d.total_amount);
                      const hPct = maxDailyAmt > 0 ? (amt / maxDailyAmt) * 100 : 0;
                      return (
                        <div
                          key={d.date}
                          className="flex-1 bg-primary/60 rounded-t hover:bg-primary transition-colors cursor-default relative group"
                          style={{ height: `${Math.max(hPct, 2)}%` }}
                          data-testid={`daily-bar-${i}`}
                          title={`${d.date}: ${fmt(amt)}`}
                        >
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:flex flex-col items-center pointer-events-none z-10">
                            <div className="bg-popover border rounded px-2 py-1 text-xs shadow-md whitespace-nowrap">
                              <div className="font-medium">{d.date ? format(parseISO(d.date), "MMM d") : d.date}</div>
                              <div>{fmt(amt)}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>{recent30[0]?.date ? format(parseISO(recent30[0].date), "MMM d") : ""}</span>
                  <span>{recent30[recent30.length - 1]?.date ? format(parseISO(recent30[recent30.length - 1].date), "MMM d") : ""}</span>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No daily data — run a QuickBooks sync to populate.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* QB Cash In vs Out comparison */}
        <TabsContent value="cashflow" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" /> Cash In vs Out — QuickBooks Native
              </CardTitle>
              <CardDescription className="text-xs">
                QB AR payments received (in) vs QB AP expense spend (out) by month — last 6 months
              </CardDescription>
            </CardHeader>
            <CardContent>
              {cashFlowLoading ? <Skeleton className="h-56 w-full" /> : cashFlowData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No cash flow data. Run a QuickBooks AR + AP sync first.</p>
              ) : (
                <div className="space-y-3">
                  {/* Legend */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground pb-1">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-green-500/70" /> Cash In (AR Payments)</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-destructive/70" /> Cash Out (AP Expenses)</span>
                  </div>
                  {cashFlowData.map((r, i) => {
                    const inAmt  = parseFloat(r.cash_in);
                    const outAmt = parseFloat(r.cash_out);
                    const netAmt = parseFloat(r.net_flow);
                    const inPct  = maxCashAbs > 0 ? (inAmt  / maxCashAbs) * 100 : 0;
                    const outPct = maxCashAbs > 0 ? (outAmt / maxCashAbs) * 100 : 0;
                    return (
                      <div key={r.month} className="space-y-0.5" data-testid={`cf-row-${i}`}>
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mb-1">
                          <span className="font-medium w-16 shrink-0">{r.month}</span>
                          <span className={`ml-auto font-semibold ${netAmt >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                            {netAmt >= 0 ? "+" : ""}{fmt(netAmt)} net
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <ArrowUpRight className="h-3 w-3 text-green-500 shrink-0" />
                          <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
                            <div className="h-full bg-green-500/70 rounded flex items-center px-1" style={{ width: `${Math.max(inPct, 1)}%` }}>
                              {inPct > 20 && <span className="text-xs text-white font-medium">{fmt(inAmt)}</span>}
                            </div>
                          </div>
                          <span className="text-xs font-semibold w-24 text-right whitespace-nowrap shrink-0">{fmt(inAmt)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <ArrowDownLeft className="h-3 w-3 text-destructive shrink-0" />
                          <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
                            <div className="h-full bg-destructive/70 rounded flex items-center px-1" style={{ width: `${Math.max(outPct, 1)}%` }}>
                              {outPct > 20 && <span className="text-xs text-white font-medium">{fmt(outAmt)}</span>}
                            </div>
                          </div>
                          <span className="text-xs font-semibold w-24 text-right whitespace-nowrap shrink-0">{fmt(outAmt)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AR aging */}
        <TabsContent value="aging" className="mt-4">
          {stats?.agingSummary ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">AR Aging — Inflow Pipeline</CardTitle>
                <CardDescription className="text-xs">Upcoming expected cash receipts by age</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-3 text-center">
                  {[
                    { label: "Current",    value: stats.agingSummary.current,    color: "bg-green-500" },
                    { label: "1–30 Days",  value: stats.agingSummary.days1to30,  color: "bg-yellow-400" },
                    { label: "31–60d",     value: stats.agingSummary.days31to60, color: "bg-orange-400" },
                    { label: "61–90d",     value: stats.agingSummary.days61to90, color: "bg-orange-600" },
                    { label: "90+ Days",   value: stats.agingSummary.over90,     color: "bg-destructive" },
                  ].map(b => (
                    <div key={b.label} className="rounded-md bg-muted/40 p-3">
                      <div className={`h-1.5 w-full rounded-full ${b.color} mb-2`} />
                      <p className="text-base font-bold">{fmt(b.value)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{b.label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                AR aging data not available. Run an invoicing sync first.
              </CardContent>
            </Card>
          )}
        </TabsContent>

      </Tabs>
    </div>
    </FinanceAccessGate>
  );
}
