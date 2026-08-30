import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  RefreshCw, AlertCircle, TrendingDown, TrendingUp, DollarSign,
  Users, Tag, BarChart3, Calendar, ArrowUpDown, Search, Filter,
  CheckCircle2, Clock, Link2Off, ArrowDownLeft, ArrowUpRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExpenseSummary {
  total_transactions: number;
  total_amount: string;
  unique_vendors: number;
  unique_categories: number;
  bills_count: number;
  bill_payments_count: number;
  checks_count: number;
  credit_card_count: number;
  journal_entries_count: number;
}

interface VendorRow {
  vendor_name: string;
  transaction_count: number;
  total_amount: string;
  last_transaction_date: string;
  txn_types: string[];
}

interface CategoryRow {
  category: string;
  transaction_count: number;
  total_amount: string;
  pct_of_total: string;
}

interface DailyRow {
  date: string;
  transaction_count: number;
  total_amount: string;
}

interface WeeklyRow {
  week_start: string;
  transaction_count: number;
  total_amount: string;
}

interface MonthlyRow {
  month: string;
  transaction_count: number;
  total_amount: string;
}

interface ExceptionRow {
  qbo_txn_id: string;
  qbo_txn_type: string;
  txn_date: string;
  total_amount: string;
  vendor_name: string | null;
  account_name: string | null;
  memo: string | null;
  exception_type: string;
  exception_reason: string;
}

interface TxnRow {
  qbo_txn_id: string;
  qbo_txn_type: string;
  txn_date: string;
  vendor_name: string | null;
  payee_name: string | null;
  total_amount: string;
  account_name: string | null;
  payment_method: string | null;
  bank_account_name: string | null;
  check_number: string | null;
  memo: string | null;
  class_name: string | null;
  customer_name: string | null;
  is_paid: boolean;
}

interface SyncRun {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  date_range_start: string | null;
  date_range_end: string | null;
  records_fetched: number;
  records_upserted: number;
  error_message: string | null;
}

interface QBOStatus {
  isConnected: boolean;
  lastSyncAt: string | null;
  realmId: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val ?? "0"));
  return isNaN(n) ? "$0.00" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try { return new Date(s + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return s; }
}

function txnTypeBadge(type: string) {
  const map: Record<string, string> = {
    Bill: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
    BillPayment: "bg-green-500/10 text-green-700 dark:text-green-400",
    Purchase: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    JournalEntry: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[type] ?? "bg-muted text-muted-foreground"}`}>
      {type === "BillPayment" ? "Bill Pmt" : type}
    </span>
  );
}

function exceptionBadge(type: string) {
  if (type === "large_transaction") return <Badge variant="destructive">Large</Badge>;
  if (type === "unmapped_vendor") return <Badge className="bg-orange-500/15 text-orange-700 dark:text-orange-400">Unmapped</Badge>;
  return <Badge variant="secondary">Uncategorized</Badge>;
}

function getDateRange(preset: string): { since: string; until: string } {
  const now = new Date();
  const until = now.toISOString().slice(0, 10);
  const d = (days: number) => { const d = new Date(now); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); };
  const m = (months: number) => { const d = new Date(now); d.setMonth(d.getMonth() - months); return d.toISOString().slice(0, 10); };
  switch (preset) {
    case "7d":  return { since: d(7),   until };
    case "30d": return { since: d(30),  until };
    case "60d": return { since: d(60),  until };
    case "90d": return { since: d(90),  until };
    case "6m":  return { since: m(6),   until };
    case "1y":  return { since: m(12),  until };
    default:    return { since: d(90),  until };
  }
}

// ── Not Connected State ───────────────────────────────────────────────────────

function NotConnectedBanner() {
  return (
    <Alert className="border-amber-500/40 bg-amber-500/5 mb-6">
      <Link2Off className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-sm font-semibold">QuickBooks Not Connected</AlertTitle>
      <AlertDescription className="text-sm">
        Connect your QuickBooks Online account to start syncing expense data.{" "}
        <a href="/integrations/quickbooks" className="underline font-medium">Go to QB Settings →</a>
      </AlertDescription>
    </Alert>
  );
}

// ── Stat Cards ────────────────────────────────────────────────────────────────

function StatCard({ title, value, sub, icon: Icon, loading }: {
  title: string; value: string; sub?: string; icon: any; loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium truncate">{title}</p>
            {loading ? <Skeleton className="h-7 w-24 mt-1" /> : (
              <p className="text-2xl font-semibold mt-0.5 tabular-nums">{value}</p>
            )}
            {sub && !loading && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="shrink-0 h-9 w-9 rounded-md bg-primary/8 flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Trend Bar ─────────────────────────────────────────────────────────────────

function TrendBar({ rows, valueKey = "total_amount", labelKey }: { rows: any[]; valueKey?: string; labelKey: string }) {
  const max = Math.max(...rows.map(r => parseFloat(r[valueKey] || "0")));
  if (!rows.length) return <p className="text-sm text-muted-foreground py-4 text-center">No data</p>;
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const val = parseFloat(r[valueKey] || "0");
        const pct = max > 0 ? (val / max) * 100 : 0;
        return (
          <div key={i} className="flex items-center gap-3">
            <div className="w-28 text-xs text-muted-foreground shrink-0 truncate">{r[labelKey]}</div>
            <div className="flex-1">
              <Progress value={pct} className="h-2" />
            </div>
            <div className="w-24 text-right text-xs font-medium tabular-nums shrink-0">{fmt(val)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function QBOExpenseDashboard() {
  const { toast } = useToast();
  const [datePreset, setDatePreset] = useState("90d");
  const [txnSearch, setTxnSearch] = useState("");
  const [txnTypeFilter, setTxnTypeFilter] = useState("all");
  const { since, until } = useMemo(() => getDateRange(datePreset), [datePreset]);

  // QB connection status
  const { data: qbStatus } = useQuery<QBOStatus | null>({
    queryKey: ["/api/corporate/integrations/quickbooks/settings"],
    select: (d: any) => d ? { isConnected: d.isConnected, lastSyncAt: d.lastSyncAt, realmId: d.realmId } : null,
  });

  // Last sync run
  const { data: lastSync } = useQuery<SyncRun | null>({
    queryKey: ["/api/corporate/integrations/quickbooks/expense-sync/status"],
    refetchInterval: 15000,
  });

  // Dashboard data
  const params = `since=${since}&until=${until}`;
  const { data: summary, isLoading: sumLoading } = useQuery<ExpenseSummary>({
    queryKey: ["/api/corporate/integrations/quickbooks/expenses/summary", since, until],
    queryFn: async () => { const r = await fetch(`/api/corporate/integrations/quickbooks/expenses/summary?${params}`, { credentials: "include" }); return r.json(); },
  });
  const { data: byVendor = [], isLoading: vendorLoading } = useQuery<VendorRow[]>({
    queryKey: ["/api/corporate/integrations/quickbooks/expenses/by-vendor", since, until],
    queryFn: async () => { const r = await fetch(`/api/corporate/integrations/quickbooks/expenses/by-vendor?${params}`, { credentials: "include" }); return r.json(); },
  });
  const { data: byCategory = [], isLoading: catLoading } = useQuery<CategoryRow[]>({
    queryKey: ["/api/corporate/integrations/quickbooks/expenses/by-category", since, until],
    queryFn: async () => { const r = await fetch(`/api/corporate/integrations/quickbooks/expenses/by-category?${params}`, { credentials: "include" }); return r.json(); },
  });
  const { data: daily = [] } = useQuery<DailyRow[]>({
    queryKey: ["/api/corporate/integrations/quickbooks/expenses/daily", since, until],
    queryFn: async () => { const r = await fetch(`/api/corporate/integrations/quickbooks/expenses/daily?${params}`, { credentials: "include" }); return r.json(); },
  });
  const { data: monthly = [] } = useQuery<MonthlyRow[]>({
    queryKey: ["/api/corporate/integrations/quickbooks/expenses/monthly", since, until],
    queryFn: async () => { const r = await fetch(`/api/corporate/integrations/quickbooks/expenses/monthly?${params}`, { credentials: "include" }); return r.json(); },
  });
  const { data: exceptions = [], isLoading: excLoading } = useQuery<ExceptionRow[]>({
    queryKey: ["/api/corporate/integrations/quickbooks/expenses/exceptions", since, until],
    queryFn: async () => { const r = await fetch(`/api/corporate/integrations/quickbooks/expenses/exceptions?${params}`, { credentials: "include" }); return r.json(); },
  });
  const { data: transactions = [], isLoading: txnLoading } = useQuery<TxnRow[]>({
    queryKey: ["/api/corporate/integrations/quickbooks/expenses/transactions", since, until],
    queryFn: async () => { const r = await fetch(`/api/corporate/integrations/quickbooks/expenses/transactions?${params}`, { credentials: "include" }); return r.json(); },
  });

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/corporate/integrations/quickbooks/expense-sync/run", { since, until });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.notConnected) {
        toast({ title: "Not Connected", description: "Connect QuickBooks first in QB Settings.", variant: "destructive" });
        return;
      }
      toast({ title: "Sync Complete", description: `Fetched ${data.recordsFetched} transactions, upserted ${data.recordsUpserted}.` });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/integrations/quickbooks/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/integrations/quickbooks/expense-sync"] });
    },
    onError: () => toast({ title: "Sync Failed", description: "Check QB connection and try again.", variant: "destructive" }),
  });

  const isConnected = qbStatus?.isConnected ?? false;
  const totalAmt = parseFloat(summary?.total_amount ?? "0");

  // Filter transactions client-side
  const filteredTxns = useMemo(() => {
    return transactions.filter(t => {
      const matchType = txnTypeFilter === "all" || t.qbo_txn_type === txnTypeFilter;
      const search = txnSearch.toLowerCase();
      const matchSearch = !search || [t.vendor_name, t.payee_name, t.account_name, t.memo, t.check_number]
        .some(f => f?.toLowerCase().includes(search));
      return matchType && matchSearch;
    });
  }, [transactions, txnSearch, txnTypeFilter]);

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">QB Expense Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Read-only financial visibility — QuickBooks is the source of truth
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Date range */}
          <Select value={datePreset} onValueChange={setDatePreset}>
            <SelectTrigger className="w-36" data-testid="select-date-preset">
              <Calendar className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="60d">Last 60 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="6m">Last 6 months</SelectItem>
              <SelectItem value="1y">Last 12 months</SelectItem>
            </SelectContent>
          </Select>

          {/* Sync status */}
          {lastSync && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {lastSync.status === "running" ? (
                <Clock className="h-3.5 w-3.5 animate-spin" />
              ) : lastSync.status === "success" ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 text-red-500" />
              )}
              <span>
                {lastSync.status === "running" ? "Syncing…" : `Synced ${fmtDate(lastSync.completed_at?.slice(0, 10))}`}
              </span>
            </div>
          )}

          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            data-testid="button-sync-expenses"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncMutation.isPending ? "Syncing…" : "Sync Now"}
          </Button>
        </div>
      </div>

      {/* ── Not Connected Banner ── */}
      {!isConnected && <NotConnectedBanner />}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Expenses" value={fmt(totalAmt)} sub={`${summary?.total_transactions ?? 0} transactions`} icon={DollarSign} loading={sumLoading} />
        <StatCard title="Unique Vendors" value={String(summary?.unique_vendors ?? 0)} icon={Users} loading={sumLoading} />
        <StatCard title="Expense Categories" value={String(summary?.unique_categories ?? 0)} icon={Tag} loading={sumLoading} />
        <StatCard title="Exceptions" value={String(exceptions.length)} sub="need attention" icon={AlertCircle} loading={excLoading} />
      </div>

      {/* ── Transaction Type Breakdown ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Bills", count: summary?.bills_count ?? 0, color: "text-orange-600" },
          { label: "Bill Payments", count: summary?.bill_payments_count ?? 0, color: "text-green-600" },
          { label: "Checks / CC", count: (summary?.checks_count ?? 0) + (summary?.credit_card_count ?? 0), color: "text-blue-600" },
          { label: "Journal Entries", count: summary?.journal_entries_count ?? 0, color: "text-purple-600" },
        ].map(({ label, count, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3 text-center">
              {sumLoading ? <Skeleton className="h-7 w-12 mx-auto" /> : (
                <p className={`text-2xl font-semibold tabular-nums ${color}`}>{count}</p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Main Tabs ── */}
      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" data-testid="tab-expense-overview">Trends</TabsTrigger>
          <TabsTrigger value="vendors" data-testid="tab-expense-vendors">By Vendor</TabsTrigger>
          <TabsTrigger value="categories" data-testid="tab-expense-categories">By Category</TabsTrigger>
          <TabsTrigger value="cashflow" data-testid="tab-expense-cashflow">Cash In / Out</TabsTrigger>
          <TabsTrigger value="transactions" data-testid="tab-expense-transactions">All Transactions</TabsTrigger>
          <TabsTrigger value="exceptions" data-testid="tab-expense-exceptions">
            Exceptions {exceptions.length > 0 && <Badge variant="destructive" className="ml-1.5 text-[10px] px-1.5">{exceptions.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ── Trends ── */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Monthly Expense Trend</CardTitle>
              </CardHeader>
              <CardContent>
                {monthly.length === 0
                  ? <p className="text-sm text-muted-foreground text-center py-6">No data for selected range</p>
                  : <TrendBar rows={monthly} labelKey="month" />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Daily Expenses — Last 30 Days</CardTitle>
              </CardHeader>
              <CardContent>
                {daily.length === 0
                  ? <p className="text-sm text-muted-foreground text-center py-6">No data for selected range</p>
                  : <TrendBar rows={daily.slice(-30)} labelKey="date" />}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── By Vendor ── */}
        <TabsContent value="vendors" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Payments by Vendor / Payee</CardTitle>
              <CardDescription className="text-xs">Top 25 by total spend in selected range</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {vendorLoading ? <div className="p-6"><Skeleton className="h-40 w-full" /></div> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="text-right">Transactions</TableHead>
                      <TableHead className="text-right">Total Paid</TableHead>
                      <TableHead>Last Date</TableHead>
                      <TableHead>Types</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byVendor.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No vendor data — run a sync first</TableCell></TableRow>
                    ) : byVendor.map((v, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{v.vendor_name}</TableCell>
                        <TableCell className="text-right tabular-nums">{v.transaction_count}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmt(v.total_amount)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{fmtDate(v.last_transaction_date)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(v.txn_types ?? []).map((t: string) => <span key={t}>{txnTypeBadge(t)}</span>)}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── By Category ── */}
        <TabsContent value="categories" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Expense by Category / Account</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {catLoading ? <div className="p-6"><Skeleton className="h-40 w-full" /></div> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account / Category</TableHead>
                      <TableHead className="text-right">Transactions</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">% of Spend</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byCategory.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No category data — run a sync first</TableCell></TableRow>
                    ) : byCategory.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{c.category}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.transaction_count}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmt(c.total_amount)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Progress value={parseFloat(c.pct_of_total || "0")} className="w-16 h-1.5" />
                            <span className="tabular-nums text-sm w-10 text-right">{parseFloat(c.pct_of_total || "0").toFixed(1)}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Cash In / Out ── */}
        <TabsContent value="cashflow" className="mt-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-md bg-red-500/10 flex items-center justify-center">
                    <ArrowUpRight className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cash Out (Expenses)</p>
                    <p className="text-2xl font-semibold tabular-nums">{fmt(totalAmt)}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {summary?.total_transactions ?? 0} transactions · {summary?.unique_vendors ?? 0} vendors
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-md bg-green-500/10 flex items-center justify-center">
                    <ArrowDownLeft className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cash In (AR Revenue)</p>
                    <p className="text-2xl font-semibold tabular-nums text-muted-foreground">—</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Revenue sync coming in Phase 2
                </p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Monthly Net Operating Cash View</CardTitle>
              <CardDescription className="text-xs">Expenses by month — revenue integration in Phase 2</CardDescription>
            </CardHeader>
            <CardContent>
              {monthly.length === 0
                ? <p className="text-sm text-muted-foreground text-center py-6">No data — run a sync first</p>
                : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-right">Transactions</TableHead>
                        <TableHead className="text-right">Total Expenses</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthly.map((m, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{m.month}</TableCell>
                          <TableCell className="text-right tabular-nums">{m.transaction_count}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium text-red-600 dark:text-red-400">{fmt(m.total_amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── All Transactions ── */}
        <TabsContent value="transactions" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-sm font-medium">All Expense Transactions</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search vendor, memo…"
                      className="pl-8 h-8 w-52 text-sm"
                      value={txnSearch}
                      onChange={e => setTxnSearch(e.target.value)}
                      data-testid="input-txn-search"
                    />
                  </div>
                  <Select value={txnTypeFilter} onValueChange={setTxnTypeFilter}>
                    <SelectTrigger className="h-8 w-36 text-sm" data-testid="select-txn-type-filter">
                      <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      <SelectItem value="Bill">Bill</SelectItem>
                      <SelectItem value="BillPayment">Bill Payment</SelectItem>
                      <SelectItem value="Purchase">Purchase / Check / CC</SelectItem>
                      <SelectItem value="JournalEntry">Journal Entry</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {txnLoading ? <div className="p-6"><Skeleton className="h-48 w-full" /></div> : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Vendor / Payee</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Memo</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTxns.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No transactions — run a sync or adjust filters</TableCell></TableRow>
                      ) : filteredTxns.slice(0, 200).map((t, i) => (
                        <TableRow key={i} data-testid={`row-txn-${t.qbo_txn_id}`}>
                          <TableCell className="text-sm whitespace-nowrap">{fmtDate(t.txn_date)}</TableCell>
                          <TableCell>{txnTypeBadge(t.qbo_txn_type)}</TableCell>
                          <TableCell className="font-medium max-w-[200px] truncate">{t.vendor_name ?? t.payee_name ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground max-w-[160px] truncate text-sm">{t.account_name ?? "—"}</TableCell>
                          <TableCell className="text-sm">{t.payment_method ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{t.memo ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmt(t.total_amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Exceptions ── */}
        <TabsContent value="exceptions" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Exceptions & Unmapped Items</CardTitle>
              <CardDescription className="text-xs">Transactions that need attention — missing vendor, category, or large amounts</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {excLoading ? <div className="p-6"><Skeleton className="h-40 w-full" /></div> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Exception</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Memo</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exceptions.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8">
                        <CheckCircle2 className="h-6 w-6 text-green-500 mx-auto mb-2" />
                        <p className="text-muted-foreground text-sm">No exceptions — all transactions are mapped</p>
                      </TableCell></TableRow>
                    ) : exceptions.map((e, i) => (
                      <TableRow key={i} data-testid={`row-exception-${e.qbo_txn_id}`}>
                        <TableCell className="text-sm">{fmtDate(e.txn_date)}</TableCell>
                        <TableCell>{txnTypeBadge(e.qbo_txn_type)}</TableCell>
                        <TableCell>{exceptionBadge(e.exception_type)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{e.vendor_name ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{e.account_name ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{e.memo ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmt(e.total_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
