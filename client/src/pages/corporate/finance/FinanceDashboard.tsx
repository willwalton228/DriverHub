import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DollarSign, TrendingUp, TrendingDown, AlertCircle, RefreshCw,
  CheckCircle2, Clock, Building2, Tag, ArrowUpRight, ArrowDownLeft,
  ReceiptText, BarChart3, Activity, Wallet,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { FinanceAccessGate } from "@/components/finance/FinanceAccessGate";

// ── Types ──────────────────────────────────────────────────────────────────────

interface InvoicingStats {
  totalOutstanding: string;
  overdueAmount: string;
  pendingCharges: string;
  pendingChargesCount: number;
  invoicesSentThisMonth: number;
  paymentsReceivedThisMonth: string;
  averageDaysToPayment: number;
  agingSummary: {
    current: string;
    days1to30: string;
    days31to60: string;
    days61to90: string;
    over90: string;
  };
}

interface ExpenseSummary {
  total_transactions: number;
  total_amount: string;
  unique_vendors: number;
  unique_categories: number;
  bills_count: number;
  bill_payments_count: number;
  checks_count: number;
  credit_card_count: number;
}

interface SyncStatus {
  id?: string;
  status?: string;
  startedAt?: string;
  completedAt?: string;
  txnsInserted?: number;
  txnsUpdated?: number;
  txnsSkipped?: number;
  errorMessage?: string;
}

interface ExceptionRow {
  qbo_txn_id: string;
  exception_type: string;
  exception_reason: string;
  total_amount: string;
  vendor_name: string | null;
}

interface VendorRow {
  vendor_name: string;
  transaction_count: number;
  total_amount: string;
}

// ── Helper ─────────────────────────────────────────────────────────────────────

function fmt(val: number | string | undefined | null, decimals = 0): string {
  const n = typeof val === "string" ? parseFloat(val) : (val ?? 0);
  if (isNaN(n)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(n);
}

function KpiCard({
  title, value, sub, icon: Icon, trend, loading, highlight,
}: {
  title: string; value: string; sub?: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  trend?: "up" | "down" | "neutral"; loading?: boolean;
  highlight?: "warn" | "danger" | "success";
}) {
  const border =
    highlight === "danger"  ? "border-destructive/40" :
    highlight === "warn"    ? "border-yellow-500/40" :
    highlight === "success" ? "border-green-500/40" : "";
  return (
    <Card className={border}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 flex-wrap">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-7 w-32 mb-1" /> : <div className="text-2xl font-bold">{value}</div>}
        {sub && !loading && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            {trend === "up"   && <TrendingUp  className="h-3 w-3 text-green-500" />}
            {trend === "down" && <TrendingDown className="h-3 w-3 text-destructive" />}
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function FinanceDashboard() {
  const { toast } = useToast();
  const since90 = (() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10); })();
  const today   = new Date().toISOString().slice(0, 10);

  const { data: stats, isLoading: statsLoading } = useQuery<InvoicingStats>({
    queryKey: ["/api/corporate/invoicing/stats"],
  });

  const { data: expSummary, isLoading: expLoading } = useQuery<ExpenseSummary>({
    queryKey: ["/api/corporate/integrations/quickbooks/expenses/summary", since90, today],
    queryFn: () => fetch(`/api/corporate/integrations/quickbooks/expenses/summary?since=${since90}&until=${today}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: syncStatus, isLoading: syncLoading } = useQuery<SyncStatus | null>({
    queryKey: ["/api/corporate/integrations/quickbooks/expense-sync/status"],
    queryFn: () => fetch("/api/corporate/integrations/quickbooks/expense-sync/status", { credentials: "include" }).then(r => r.ok ? r.json() : null),
    refetchInterval: 30000,
  });

  const { data: exceptions } = useQuery<ExceptionRow[]>({
    queryKey: ["/api/corporate/integrations/quickbooks/expenses/exceptions", since90, today],
    queryFn: () => fetch(`/api/corporate/integrations/quickbooks/expenses/exceptions?since=${since90}&until=${today}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: topVendors } = useQuery<VendorRow[]>({
    queryKey: ["/api/corporate/integrations/quickbooks/expenses/by-vendor", since90, today],
    queryFn: () => fetch(`/api/corporate/integrations/quickbooks/expenses/by-vendor?since=${since90}&until=${today}`, { credentials: "include" }).then(r => r.json()),
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/corporate/integrations/quickbooks/expense-sync/run", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/integrations/quickbooks/expense-sync/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/integrations/quickbooks/expenses/summary"] });
      toast({ title: "Sync started", description: "QuickBooks data sync is running." });
    },
    onError: () => toast({ title: "Sync failed", description: "Could not start sync.", variant: "destructive" }),
  });

  const openAR         = parseFloat(stats?.totalOutstanding ?? "0");
  const overdueAmt     = parseFloat(stats?.overdueAmount ?? "0");
  const collectedMTD   = parseFloat(stats?.paymentsReceivedThisMonth ?? "0");
  const totalExpenses  = parseFloat(expSummary?.total_amount ?? "0");
  const exceptionCount = Array.isArray(exceptions) ? exceptions.length : 0;
  const topVendorList  = Array.isArray(topVendors) ? topVendors.slice(0, 5) : [];
  const syncOk  = syncStatus?.status === "completed";
  const syncErr = syncStatus?.status === "error";

  return (
    <FinanceAccessGate require="canViewDashboard">
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Finance Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Operational financial visibility — powered by DriverHub &amp; QuickBooks</p>
        </div>
        <div className="flex items-center gap-2">
          {syncStatus && (
            <Badge variant={syncOk ? "secondary" : syncErr ? "destructive" : "outline"} className="gap-1">
              {syncOk ? <CheckCircle2 className="h-3 w-3" /> : syncErr ? <AlertCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              QB Sync: {syncStatus.status ?? "unknown"}
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} data-testid="button-run-qb-sync">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            Sync QB Data
          </Button>
        </div>
      </div>

      {/* Exception alert */}
      {exceptionCount > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {exceptionCount} QuickBooks exception{exceptionCount !== 1 ? "s" : ""} require attention.{" "}
            <a href="/finance/qb-sync" className="underline font-medium">View in Sync Center</a>
          </AlertDescription>
        </Alert>
      )}

      {/* KPIs — AR / Revenue */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Accounts Receivable</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <KpiCard title="Open AR" value={fmt(openAR)} icon={DollarSign} loading={statsLoading}
            sub="Total outstanding receivables" highlight={openAR > 50000 ? "warn" : undefined} />
          <KpiCard title="Overdue" value={fmt(overdueAmt)} icon={AlertCircle} loading={statsLoading}
            sub={`90+ day aging: ${fmt(stats?.agingSummary?.over90)}`}
            highlight={overdueAmt > 0 ? "danger" : undefined} />
          <KpiCard title="Collected MTD" value={fmt(collectedMTD)} icon={Wallet} loading={statsLoading}
            sub="Payments received this month" trend="up" highlight="success" />
          <KpiCard title="Avg Days to Pay" value={stats?.averageDaysToPayment != null ? `${stats.averageDaysToPayment}d` : "—"} icon={Clock} loading={statsLoading}
            sub={`${stats?.invoicesSentThisMonth ?? "—"} invoices sent this month`} />
        </div>
      </div>

      {/* KPIs — Expenses & Margin (QBO) */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Expenses — QuickBooks (Last 90 Days)</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <KpiCard title="Total AP / Expenses" value={fmt(totalExpenses)} icon={ArrowDownLeft} loading={expLoading}
            sub={`${expSummary?.total_transactions ?? "—"} transactions`} />
          <KpiCard title="Bills" value={String(expSummary?.bills_count ?? "—")} icon={ReceiptText} loading={expLoading}
            sub="Vendor bills" />
          <KpiCard title="Unique Vendors" value={String(expSummary?.unique_vendors ?? "—")} icon={Building2} loading={expLoading}
            sub="Active in period" />
          <KpiCard title="Expense Categories" value={String(expSummary?.unique_categories ?? "—")} icon={Tag} loading={expLoading}
            sub="Distinct account types" />
        </div>
      </div>

      {/* AR Aging summary bar */}
      {stats?.agingSummary && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">AR Aging Breakdown</CardTitle>
            <CardDescription className="text-xs">All outstanding receivables by age bucket</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-3 text-center">
              {[
                { label: "Current",   value: stats.agingSummary.current,   color: "bg-green-500" },
                { label: "1–30 Days", value: stats.agingSummary.days1to30,  color: "bg-yellow-400" },
                { label: "31–60d",    value: stats.agingSummary.days31to60, color: "bg-orange-500" },
                { label: "61–90d",    value: stats.agingSummary.days61to90, color: "bg-orange-600" },
                { label: "90+ Days",  value: stats.agingSummary.over90,     color: "bg-destructive" },
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
      )}

      {/* Bottom two-column */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Top Vendors */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">Top Vendors by Spend</CardTitle>
              <CardDescription className="text-xs">Last 90 days — QuickBooks</CardDescription>
            </div>
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent>
            {expLoading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : topVendorList.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No vendor data. Run a QB sync to populate.</p>
            ) : (
              <div className="space-y-2">
                {topVendorList.map((v, i) => {
                  const amt = parseFloat(v.total_amount);
                  const maxAmt = parseFloat(topVendorList[0]?.total_amount ?? "1");
                  const pct = maxAmt > 0 ? (amt / maxAmt) * 100 : 0;
                  return (
                    <div key={v.vendor_name} className="flex items-center gap-3" data-testid={`vendor-row-${i}`}>
                      <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-medium truncate">{v.vendor_name || "Unknown"}</span>
                          <span className="text-sm font-semibold shrink-0">{fmt(amt)}</span>
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
            <div className="mt-4 pt-3 border-t">
              <a href="/finance/expenses" className="text-xs text-primary font-medium flex items-center gap-1 hover:underline">
                Full expense breakdown <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>
          </CardContent>
        </Card>

        {/* QB Sync panel */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">QuickBooks Sync Status</CardTitle>
              <CardDescription className="text-xs">Last sync run details</CardDescription>
            </div>
            <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent className="space-y-4">
            {syncLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : syncStatus ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={syncOk ? "secondary" : syncErr ? "destructive" : "outline"}>
                    {syncStatus.status}
                  </Badge>
                  {syncStatus.completedAt && (
                    <span className="text-xs text-muted-foreground">
                      {format(parseISO(syncStatus.completedAt), "MMM d, h:mm a")}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-muted/50 rounded-md p-2">
                    <p className="text-lg font-bold">{syncStatus.txnsInserted ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Inserted</p>
                  </div>
                  <div className="bg-muted/50 rounded-md p-2">
                    <p className="text-lg font-bold">{syncStatus.txnsUpdated ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Updated</p>
                  </div>
                  <div className="bg-muted/50 rounded-md p-2">
                    <p className="text-lg font-bold">{syncStatus.txnsSkipped ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Skipped</p>
                  </div>
                </div>
                {syncErr && syncStatus.errorMessage && (
                  <Alert variant="destructive" className="py-2">
                    <AlertDescription className="text-xs">{syncStatus.errorMessage}</AlertDescription>
                  </Alert>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No sync runs found. Click "Sync QB Data" to begin.</p>
            )}

            {exceptionCount > 0 && (
              <div className="border rounded-md p-3 bg-destructive/5 border-destructive/20">
                <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" />
                  {exceptionCount} Exception{exceptionCount !== 1 ? "s" : ""} Detected
                </p>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {Array.isArray(exceptions) && exceptions.slice(0, 2).map(e => e.exception_type).join(", ")}
                  {(exceptions?.length ?? 0) > 2 ? ` +${(exceptions?.length ?? 0) - 2} more` : ""}
                </p>
              </div>
            )}

            <div className="pt-1 border-t flex gap-4 flex-wrap">
              <a href="/finance/qb-sync" className="text-xs text-primary font-medium flex items-center gap-1 hover:underline">
                <BarChart3 className="h-3 w-3" /> Sync Center
              </a>
              <a href="/finance/expenses" className="text-xs text-primary font-medium flex items-center gap-1 hover:underline">
                <ArrowUpRight className="h-3 w-3" /> View Expenses
              </a>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
    </FinanceAccessGate>
  );
}
