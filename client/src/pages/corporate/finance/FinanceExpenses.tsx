import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Building2, Tag, Search, Receipt, CreditCard, FileText, DollarSign, AlertCircle,
  CalendarDays, AlertTriangle, Banknote, MapPin,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { FinanceAccessGate } from "@/components/finance/FinanceAccessGate";

// ── Types ──────────────────────────────────────────────────────────────────────

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
interface TxnRow {
  qbo_txn_id: string;
  qbo_txn_type: string;
  txn_date: string;
  total_amount: string;
  vendor_name: string | null;
  payee_name: string | null;
  account_name: string | null;
  payment_method: string | null;
  bank_account_name: string | null;
  check_number: string | null;
  class_name: string | null;
  location_name: string | null;
  customer_name: string | null;
  memo: string | null;
  doc_number: string | null;
  is_paid: boolean;
}
interface ExceptionRow {
  qbo_txn_id: string;
  qbo_txn_type: string;
  txn_date: string;
  total_amount: string;
  vendor_name: string | null;
  account_name: string | null;
  memo: string | null;
  doc_number: string | null;
  exception_type: string;
  exception_reason: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function useDateRange(days = 90) {
  const until = new Date().toISOString().slice(0, 10);
  const since = (() => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); })();
  return { since, until };
}

function fmt(val: number | string | undefined | null): string {
  const n = typeof val === "string" ? parseFloat(val) : (val ?? 0);
  if (isNaN(n)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

const TXN_COLORS: Record<string, string> = {
  Bill:           "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  BillPayment:    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  Check:          "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  Purchase:       "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  JournalEntry:   "bg-muted text-muted-foreground",
};

const EXCEPTION_COLORS: Record<string, string> = {
  unmapped_vendor:  "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  uncategorized:    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  large_transaction:"bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

function TxnBadge({ type }: { type: string }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${TXN_COLORS[type] ?? "bg-muted text-muted-foreground"}`}>
      {type}
    </span>
  );
}

function ExBadge({ type, label }: { type: string; label: string }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${EXCEPTION_COLORS[type] ?? "bg-muted text-muted-foreground"}`}>
      {label}
    </span>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function FinanceExpenses() {
  const [tab, setTab] = useState("overview");
  const [txnSearch, setTxnSearch] = useState("");
  const [txnTypeFilter, setTxnTypeFilter] = useState("all");
  const [dateRange, setDateRange] = useState("90");

  const { since, until } = useDateRange(parseInt(dateRange));

  const qFetch = (path: string) =>
    fetch(`${path}?since=${since}&until=${until}`, { credentials: "include" }).then(r => r.json());

  const { data: summary, isLoading: summaryLoading } = useQuery<ExpenseSummary>({
    queryKey: ["/api/corporate/integrations/quickbooks/expenses/summary", since, until],
    queryFn: () => qFetch("/api/corporate/integrations/quickbooks/expenses/summary"),
  });
  const { data: vendors, isLoading: vendorsLoading } = useQuery<VendorRow[]>({
    queryKey: ["/api/corporate/integrations/quickbooks/expenses/by-vendor", since, until],
    queryFn: () => qFetch("/api/corporate/integrations/quickbooks/expenses/by-vendor"),
  });
  const { data: categories, isLoading: catsLoading } = useQuery<CategoryRow[]>({
    queryKey: ["/api/corporate/integrations/quickbooks/expenses/by-category", since, until],
    queryFn: () => qFetch("/api/corporate/integrations/quickbooks/expenses/by-category"),
  });
  const { data: monthly, isLoading: monthlyLoading } = useQuery<MonthlyRow[]>({
    queryKey: ["/api/corporate/integrations/quickbooks/expenses/monthly", since, until],
    queryFn: () => qFetch("/api/corporate/integrations/quickbooks/expenses/monthly"),
  });
  const { data: weekly, isLoading: weeklyLoading } = useQuery<WeeklyRow[]>({
    queryKey: ["/api/corporate/integrations/quickbooks/expenses/weekly", since, until],
    queryFn: () => qFetch("/api/corporate/integrations/quickbooks/expenses/weekly"),
    enabled: tab === "weekly",
  });
  const { data: transactions, isLoading: txnsLoading } = useQuery<TxnRow[]>({
    queryKey: ["/api/corporate/integrations/quickbooks/expenses/transactions", since, until],
    queryFn: () => qFetch("/api/corporate/integrations/quickbooks/expenses/transactions"),
  });
  const { data: exceptions, isLoading: exceptionsLoading } = useQuery<ExceptionRow[]>({
    queryKey: ["/api/corporate/integrations/quickbooks/expenses/exceptions", since, until],
    queryFn: () => qFetch("/api/corporate/integrations/quickbooks/expenses/exceptions"),
    enabled: tab === "exceptions",
  });

  const filteredTxns = (transactions ?? []).filter(t => {
    if (txnTypeFilter !== "all" && t.qbo_txn_type !== txnTypeFilter) return false;
    if (txnSearch) {
      const q = txnSearch.toLowerCase();
      return (t.vendor_name ?? "").toLowerCase().includes(q) ||
             (t.account_name ?? "").toLowerCase().includes(q) ||
             (t.memo ?? "").toLowerCase().includes(q) ||
             (t.doc_number ?? "").toLowerCase().includes(q) ||
             (t.check_number ?? "").toLowerCase().includes(q) ||
             (t.class_name ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  const totalExpenses = parseFloat(summary?.total_amount ?? "0");
  const maxVendorAmt  = parseFloat(vendors?.[0]?.total_amount ?? "1");
  const maxCatAmt     = parseFloat(categories?.[0]?.total_amount ?? "1");
  const maxWeeklyAmt  = Math.max(...(weekly ?? []).map(w => parseFloat(w.total_amount)), 1);
  const exceptionCount = (exceptions ?? []).length;

  return (
    <FinanceAccessGate require="canViewExpenses">
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Expenses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">QuickBooks synced AP &amp; expense transactions</p>
        </div>
        <Select value={dateRange} onValueChange={setDateRange} data-testid="select-date-range">
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="60">Last 60 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="180">Last 180 days</SelectItem>
            <SelectItem value="365">Last 12 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Expenses",  value: fmt(summary?.total_amount),               icon: DollarSign,  loading: summaryLoading },
          { label: "Transactions",    value: String(summary?.total_transactions ?? "—"), icon: Receipt,     loading: summaryLoading },
          { label: "Vendors",         value: String(summary?.unique_vendors ?? "—"),    icon: Building2,   loading: summaryLoading },
          { label: "Categories",      value: String(summary?.unique_categories ?? "—"), icon: Tag,         loading: summaryLoading },
        ].map(({ label, value, icon: Icon, loading }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 flex-wrap">
              <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-7 w-28" /> : <div className="text-xl font-bold">{value}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Type breakdown badges */}
      {summary && (
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Bills",          count: summary.bills_count,          color: TXN_COLORS.Bill },
            { label: "Bill Payments",  count: summary.bill_payments_count,  color: TXN_COLORS.BillPayment },
            { label: "Checks",         count: summary.checks_count,         color: TXN_COLORS.Check },
            { label: "Credit Card",    count: summary.credit_card_count,    color: TXN_COLORS.Purchase },
            { label: "Journal Entries",count: summary.journal_entries_count, color: TXN_COLORS.JournalEntry },
          ].map(b => (
            <span key={b.label} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold ${b.color}`}>
              {b.label}: {b.count}
            </span>
          ))}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview"      data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="vendors"       data-testid="tab-vendors">By Vendor</TabsTrigger>
          <TabsTrigger value="categories"    data-testid="tab-categories">By Category</TabsTrigger>
          <TabsTrigger value="monthly"       data-testid="tab-monthly">Monthly</TabsTrigger>
          <TabsTrigger value="weekly"        data-testid="tab-weekly">Weekly</TabsTrigger>
          <TabsTrigger value="transactions"  data-testid="tab-transactions">All Transactions</TabsTrigger>
          <TabsTrigger value="exceptions"    data-testid="tab-exceptions" className="relative">
            Exceptions
            {exceptionCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs w-4 h-4 font-bold">
                {exceptionCount > 9 ? "9+" : exceptionCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

            {/* Top Vendors */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" /> Top Vendors</CardTitle>
              </CardHeader>
              <CardContent>
                {vendorsLoading ? <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div> : (
                  <div className="space-y-2">
                    {(vendors ?? []).slice(0, 8).map((v, i) => {
                      const pct = maxVendorAmt > 0 ? (parseFloat(v.total_amount) / maxVendorAmt) * 100 : 0;
                      return (
                        <div key={v.vendor_name} className="flex items-center gap-3" data-testid={`vendor-${i}`}>
                          <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between gap-2 mb-1">
                              <span className="text-sm font-medium truncate">{v.vendor_name}</span>
                              <span className="text-sm font-semibold shrink-0">{fmt(v.total_amount)}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Categories */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Tag className="h-4 w-4 text-muted-foreground" /> Top Categories</CardTitle>
              </CardHeader>
              <CardContent>
                {catsLoading ? <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div> : (
                  <div className="space-y-2">
                    {(categories ?? []).slice(0, 8).map((c, i) => {
                      const pct = maxCatAmt > 0 ? (parseFloat(c.total_amount) / maxCatAmt) * 100 : 0;
                      return (
                        <div key={c.category} className="flex items-center gap-3" data-testid={`category-${i}`}>
                          <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between gap-2 mb-1">
                              <span className="text-sm font-medium truncate">{c.category}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs text-muted-foreground">{c.pct_of_total}%</span>
                                <span className="text-sm font-semibold">{fmt(c.total_amount)}</span>
                              </div>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-orange-400" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Vendors tab */}
        <TabsContent value="vendors" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Transactions</TableHead>
                    <TableHead>Last Transaction</TableHead>
                    <TableHead>Types</TableHead>
                    <TableHead className="text-right">Total Spend</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendorsLoading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : (vendors ?? []).map((v, i) => {
                    const pct = totalExpenses > 0 ? ((parseFloat(v.total_amount) / totalExpenses) * 100).toFixed(1) : "0";
                    return (
                      <TableRow key={v.vendor_name} data-testid={`vendor-row-${i}`}>
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{v.vendor_name}</TableCell>
                        <TableCell className="text-right">{v.transaction_count}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {v.last_transaction_date ? format(parseISO(v.last_transaction_date), "MMM d, yyyy") : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(v.txn_types ?? []).map((t: string) => <TxnBadge key={t} type={t} />)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold whitespace-nowrap">{fmt(v.total_amount)}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{pct}%</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categories tab */}
        <TabsContent value="categories" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account / Category</TableHead>
                    <TableHead className="text-right">Transactions</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {catsLoading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 4 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : (categories ?? []).map((c, i) => (
                    <TableRow key={c.category} data-testid={`category-row-${i}`}>
                      <TableCell className="font-medium">{c.category}</TableCell>
                      <TableCell className="text-right">{c.transaction_count}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{c.pct_of_total}%</TableCell>
                      <TableCell className="text-right font-semibold whitespace-nowrap">{fmt(c.total_amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Monthly trend */}
        <TabsContent value="monthly" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Monthly Expense Trend</CardTitle>
              <CardDescription className="text-xs">Total AP/expense volume by month (QuickBooks)</CardDescription>
            </CardHeader>
            <CardContent>
              {monthlyLoading ? <Skeleton className="h-48 w-full" /> : (
                <div className="space-y-2">
                  {(monthly ?? []).map((m, i) => {
                    const amt = parseFloat(m.total_amount);
                    const maxAmt = Math.max(...(monthly ?? []).map(r => parseFloat(r.total_amount)));
                    const pct = maxAmt > 0 ? (amt / maxAmt) * 100 : 0;
                    return (
                      <div key={m.month} className="flex items-center gap-3" data-testid={`month-row-${i}`}>
                        <span className="text-xs text-muted-foreground w-20 shrink-0 font-medium">{m.month}</span>
                        <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                          <div className="h-full bg-primary/80 rounded flex items-center px-2" style={{ width: `${Math.max(pct, 2)}%` }}>
                            {pct > 15 && <span className="text-xs text-primary-foreground font-medium">{m.transaction_count} txns</span>}
                          </div>
                        </div>
                        <span className="text-sm font-semibold w-28 text-right shrink-0 whitespace-nowrap">{fmt(m.total_amount)}</span>
                      </div>
                    );
                  })}
                  {(monthly ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">No monthly data — run a QuickBooks sync first.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Weekly trend */}
        <TabsContent value="weekly" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" /> Weekly Expense Trend
              </CardTitle>
              <CardDescription className="text-xs">AP/expense volume by ISO week start (QuickBooks)</CardDescription>
            </CardHeader>
            <CardContent>
              {weeklyLoading ? <Skeleton className="h-48 w-full" /> : (
                <div className="space-y-2">
                  {(weekly ?? []).map((w, i) => {
                    const amt = parseFloat(w.total_amount);
                    const pct = maxWeeklyAmt > 0 ? (amt / maxWeeklyAmt) * 100 : 0;
                    return (
                      <div key={w.week_start} className="flex items-center gap-3" data-testid={`week-row-${i}`}>
                        <span className="text-xs text-muted-foreground w-24 shrink-0 font-medium">
                          {w.week_start ? format(parseISO(w.week_start), "MMM d") : "—"}
                        </span>
                        <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                          <div className="h-full bg-primary/70 rounded flex items-center px-2" style={{ width: `${Math.max(pct, 2)}%` }}>
                            {pct > 15 && <span className="text-xs text-primary-foreground font-medium">{w.transaction_count}t</span>}
                          </div>
                        </div>
                        <span className="text-sm font-semibold w-28 text-right shrink-0 whitespace-nowrap">{fmt(w.total_amount)}</span>
                      </div>
                    );
                  })}
                  {(weekly ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">No weekly data — run a QuickBooks sync first.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* All transactions */}
        <TabsContent value="transactions" className="mt-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input placeholder="Search vendor, account, memo, ref #..." value={txnSearch} onChange={e => setTxnSearch(e.target.value)} className="pl-8" data-testid="input-txn-search" />
            </div>
            <Select value={txnTypeFilter} onValueChange={setTxnTypeFilter} data-testid="select-txn-type">
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Bill">Bills</SelectItem>
                <SelectItem value="BillPayment">Bill Payments</SelectItem>
                <SelectItem value="Check">Checks</SelectItem>
                <SelectItem value="Purchase">Purchases / CC</SelectItem>
                <SelectItem value="JournalEntry">Journal Entries</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Vendor / Payee</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Pay Method</TableHead>
                      <TableHead>Bank / CC</TableHead>
                      <TableHead>Ref / Check #</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Memo</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {txnsLoading ? (
                      Array.from({ length: 10 }).map((_, i) => (
                        <TableRow key={i}>{Array.from({ length: 10 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                      ))
                    ) : filteredTxns.length === 0 ? (
                      <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground text-sm">
                        {txnSearch || txnTypeFilter !== "all" ? "No transactions match your filters" : "No transactions found — run a QB sync to populate"}
                      </TableCell></TableRow>
                    ) : filteredTxns.map(t => (
                      <TableRow key={`${t.qbo_txn_id}-${t.qbo_txn_type}`} data-testid={`txn-${t.qbo_txn_id}`}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {t.txn_date ? format(parseISO(t.txn_date), "MMM d, yyyy") : "—"}
                        </TableCell>
                        <TableCell><TxnBadge type={t.qbo_txn_type} /></TableCell>
                        <TableCell className="max-w-[130px] truncate font-medium">{t.vendor_name ?? t.payee_name ?? "—"}</TableCell>
                        <TableCell className="max-w-[130px] truncate text-sm text-muted-foreground">{t.account_name ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{t.payment_method ?? "—"}</TableCell>
                        <TableCell className="max-w-[110px] truncate text-sm text-muted-foreground">{t.bank_account_name ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{t.check_number ?? t.doc_number ?? "—"}</TableCell>
                        <TableCell className="max-w-[90px] truncate text-sm text-muted-foreground">{t.class_name ?? "—"}</TableCell>
                        <TableCell className="max-w-[140px] truncate text-sm text-muted-foreground">{t.memo ?? "—"}</TableCell>
                        <TableCell className="text-right font-semibold whitespace-nowrap">{fmt(t.total_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {filteredTxns.length > 0 && (
                <div className="px-4 py-2 border-t text-xs text-muted-foreground">
                  Showing {filteredTxns.length} transaction{filteredTxns.length !== 1 ? "s" : ""}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Exceptions */}
        <TabsContent value="exceptions" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" /> Exceptions &amp; Flags
              </CardTitle>
              <CardDescription className="text-xs">
                Unmapped vendors, uncategorized transactions, and large-amount alerts from QuickBooks
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Flag</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Vendor / Payee</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Ref #</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exceptionsLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 8 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : (exceptions ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                        No exceptions found for this period
                      </TableCell>
                    </TableRow>
                  ) : (exceptions ?? []).map((e, i) => (
                    <TableRow key={`${e.qbo_txn_id}-${e.exception_type}-${i}`} data-testid={`exception-row-${i}`}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {e.txn_date ? format(parseISO(e.txn_date), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell><TxnBadge type={e.qbo_txn_type} /></TableCell>
                      <TableCell>
                        <ExBadge type={e.exception_type} label={e.exception_type.replace(/_/g, " ")} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">{e.exception_reason}</TableCell>
                      <TableCell className="font-medium max-w-[120px] truncate">{e.vendor_name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">{e.account_name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.doc_number ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold whitespace-nowrap">{fmt(e.total_amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
    </FinanceAccessGate>
  );
}
