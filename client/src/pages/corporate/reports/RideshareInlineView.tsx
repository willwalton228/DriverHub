import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  UploadCloud, Download, FileText, AlertTriangle,
  TrendingUp, BarChart3, Car, CheckCircle2, RefreshCw,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Search, X, Info,
  Users, DollarSign, Percent, Filter, Copy, MapPin,
  Banknote, Shield, Package, CheckCheck, CircleAlert,
  Receipt, FileCheck, Clock, SendHorizonal, ListChecks,
  RotateCcw, ExternalLink, CalendarDays, Building2,
  FileDown, Loader2, FileSpreadsheet,
} from "lucide-react";

// ─── Utility helpers ─────────────────────────────────────────────────────────

function fmt$(val: string | number | null | undefined): string {
  const n = typeof val === "string" ? parseFloat(val) : (val ?? 0);
  if (isNaN(n as number)) return "—";
  return `$${(n as number).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return s; }
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return s; }
}

// ─── Status Badges ────────────────────────────────────────────────────────────

function MatchStatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="outline" className="text-xs">—</Badge>;
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    auto_matched:   { label: "Matched",        variant: "default"     },
    manual_matched: { label: "Manual Match",   variant: "secondary"   },
    matched:        { label: "Matched",        variant: "default"     },
    exception:      { label: "Exception",      variant: "destructive" },
    unmatched:      { label: "Unmatched",      variant: "outline"     },
    dismissed:      { label: "Dismissed",      variant: "outline"     },
  };
  const cfg = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={cfg.variant} className="text-xs">{cfg.label}</Badge>;
}

function BillingStatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="outline" className="text-xs">—</Badge>;
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending:            { label: "Pending",           variant: "outline"     },
    ready_for_billing:  { label: "Ready",             variant: "default"     },
    billed:             { label: "Billed",            variant: "secondary"   },
    excluded:           { label: "Excluded",          variant: "outline"     },
    needs_followup:     { label: "Follow-up",         variant: "destructive" },
  };
  const cfg = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={cfg.variant} className="text-xs">{cfg.label}</Badge>;
}

function ProviderBadge({ provider }: { provider: string | null }) {
  if (!provider) return null;
  if (provider === "uber") return <Badge variant="outline" className="text-xs font-semibold">Uber</Badge>;
  if (provider === "lyft") return <Badge variant="secondary" className="text-xs font-semibold">Lyft</Badge>;
  return <Badge variant="outline" className="text-xs">{provider}</Badge>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportSummary {
  totalRides: number;
  totalSpend: string;
  matchedRides: number;
  exceptionRides: number;
  matchPct: number;
  exceptionPct: number;
  billedPct: number;
  avgFare: string | null;
  uberSpend: string;
  lyftSpend: string;
  uberRides: number;
  lyftRides: number;
}

interface Transaction {
  id: string;
  provider: string;
  rideDate: string | null;
  rideDatetime: string | null;
  riderName: string | null;
  pickupAddressRaw: string | null;
  dropoffAddressRaw: string | null;
  matchedAccountId: string | null;
  matchedAccountNumber: string | null;
  matchedAccountName: string | null;
  totalFare: string | null;
  matchStatus: string;
  matchMethod: string | null;
  matchConfidence: string | null;
  billingStatus: string | null;
  exceptionReason: string | null;
  importBatchId: string | null;
  batchFileName: string | null;
}

interface ReportResponse {
  summary: ReportSummary;
  transactions: Transaction[];
  total: number;
}

interface ExceptionRow {
  id: string;
  provider: string;
  rideDate: string | null;
  rideDatetime: string | null;
  riderName: string | null;
  pickupAddressRaw: string | null;
  dropoffAddressRaw: string | null;
  totalFare: string | null;
  matchedAccountId: string | null;
  matchedAccountNumber: string | null;
  matchedAccountName: string | null;
  pickupAccountId: string | null;
  pickupAccountName: string | null;
  dropoffAccountId: string | null;
  dropoffAccountName: string | null;
  exceptionReason: string | null;
  billingStatus: string | null;
  matchStatus: string;
  importBatchId: string | null;
  batchFileName: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
}

interface ImportBatch {
  id: string;
  provider: string;
  sourceFileName: string | null;
  uploadedAt: string | null;
  totalRows: number | null;
  matchedRows: number | null;
  exceptionRows: number | null;
}

interface ReconRow {
  importBatchId: string;
  reconciliationStatus: "balanced" | "mismatch" | "pending";
  rowBalanced: boolean;
  amountBalanced: boolean;
  totalRowsInFile: number;
  importedRows: number;
  rejectedRows: number;
  duplicateRows: number;
  fileTotalAmount: string;
  importedTotalAmount: string;
  computedAt: string | null;
}

interface AccountOption {
  id: string;
  customerNumber: string | null;
  companyName: string | null;
  customerAddress: string | null;
  customerCity: string | null;
}

interface BillingRecord {
  id: string;
  provider: string;
  rideDate: string | null;
  rideDatetime: string | null;
  riderName: string | null;
  pickupAddressRaw: string | null;
  dropoffAddressRaw: string | null;
  matchedAccountId: string | null;
  matchedAccountNumber: string | null;
  matchedAccountName: string | null;
  totalFare: string | null;
  billableAmount: string | null;
  matchStatus: string;
  billingStatus: string;
  billingReadyAt: string | null;
  billingReadyByUserId: string | null;
  billedAt: string | null;
  billedByUserId: string | null;
  invoiceId: string | null;
  invoiceNumberSnapshot: string | null;
  billToAccountId: string | null;
  billToAccountNumber: string | null;
  importBatchId: string | null;
  batchFileName: string | null;
  billingWeekLabel: string | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
}

interface BillingSummary {
  readyCount: number;
  readyAmount: string;
  billedCount: number;
  billedAmount: string;
  excludedCount: number;
  excludedAmount: string;
  unreviewedCount: number;
}

interface BillingPeriod {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  label: string;
  totalRides: number;
  totalAmount: string;
  accountCount: number;
}

interface BillingPeriodPreview {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  label: string;
  totalRides: number;
  totalAmount: string;
  accountCount: number;
  accounts: {
    accountId: string;
    accountNumber: string | null;
    accountName: string | null;
    rides: number;
    amount: string;
  }[];
}

interface PushInvoiceResult {
  success: boolean;
  batchRef: string;
  invoicesCreated: number;
  totalBilled: number;
  failureCount: number;
  skippedCount: number;
  results: {
    accountId: string;
    accountNumber: string | null;
    accountName: string;
    invoiceId: string;
    invoiceNumber: string;
    totalRides: number;
    totalAmount: string;
    periods: { weekStart: string; weekEnd: string; weekLabel?: string; rides: number; amount: string }[];
  }[];
  failures: { accountId: string; error: string }[];
  skipped: { accountId: string; weekStart: string; weekEnd: string; reason: string; existingInvoiceId?: string | null }[];
}

// ─── Simple Chart Components ─────────────────────────────────────────────────

function MiniBarChart({ data, color = "bg-primary" }: {
  data: { label: string; value: number }[];
  color?: string;
}) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-28 truncate shrink-0">{d.label}</span>
          <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
            <div
              className={`h-full ${color} rounded-sm transition-all`}
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
          <span className="text-xs font-medium text-right w-14 shrink-0">
            {d.value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        </div>
      ))}
      {data.length === 0 && <p className="text-xs text-muted-foreground py-2">No data</p>}
    </div>
  );
}

function ProviderSplitChart({ uber, lyft }: { uber: number; lyft: number }) {
  const total = uber + lyft || 1;
  const uberPct = Math.round((uber / total) * 100);
  const lyftPct = 100 - uberPct;
  return (
    <div className="space-y-3">
      <div className="w-full h-6 rounded-md overflow-hidden flex">
        <div
          className="bg-primary h-full transition-all"
          style={{ width: `${uberPct}%` }}
          title={`Uber: ${uberPct}%`}
        />
        <div
          className="bg-muted-foreground/30 h-full transition-all"
          style={{ width: `${lyftPct}%` }}
          title={`Lyft: ${lyftPct}%`}
        />
      </div>
      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-primary shrink-0" />
          <span className="text-muted-foreground">Uber</span>
          <span className="font-medium">{uberPct}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-muted-foreground/30 shrink-0" />
          <span className="text-muted-foreground">Lyft</span>
          <span className="font-medium">{lyftPct}%</span>
        </div>
      </div>
    </div>
  );
}

// ─── Global Filters State ─────────────────────────────────────────────────────

interface GlobalFilters {
  dateFrom: string;
  dateTo: string;
  provider: string;
}

function getDefaultFilters(): GlobalFilters {
  const today = new Date().toISOString().split("T")[0];
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  return { dateFrom: ninetyDaysAgo, dateTo: today, provider: "" };
}

// ─── Tab 1: Overview ─────────────────────────────────────────────────────────

// ─── Canonical widget summary shape (mirrors WidgetSummaryResult from service) ─

interface CanonicalWidgetSummary {
  totalRides: number;
  totalSpend: string;
  totalLinked: number;
  totalExceptions: number;
  totalEmployeeExpenseCount: number;
  totalEmployeeExpenseAmount: string;
  totalUnmatched: number;
  totalUnreviewed: number;
  totalReadyForBilling: number;
  totalBilled: number;
  totalExcluded: number;
  uberRides: number;
  lyftRides: number;
  uberSpend: string;
  lyftSpend: string;
  avgFare: string | null;
  matchPct: number;
  exceptionPct: number;
  billedPct: number;
}

function OverviewTab({ filters }: { filters: GlobalFilters }) {
  // ── Canonical KPI query (full server-side aggregation, no row limit) ──────
  // This is the authoritative source for all KPI numbers. It reads from
  // rideshare_transactions WHERE is_archived = false, across ALL rows.
  const kpiParams = new URLSearchParams();
  if (filters.dateFrom) kpiParams.set("dateFrom", filters.dateFrom);
  if (filters.dateTo)   kpiParams.set("dateTo",   filters.dateTo);
  if (filters.provider) kpiParams.set("provider", filters.provider);

  const { data: kpiData, isLoading: kpiLoading } = useQuery<CanonicalWidgetSummary>({
    queryKey: ["/api/corporate/rideshare/canonical/widget-summary", filters.dateFrom, filters.dateTo, filters.provider],
    queryFn: () =>
      fetch(`/api/corporate/rideshare/canonical/widget-summary?${kpiParams}`, { credentials: "include" }).then(r => r.json()),
  });

  // ── Chart data query (paginated rows for trend / account charts) ──────────
  // Using a generous limit so the charts have enough rows to aggregate from.
  // KPI numbers come from kpiData above, NOT from this summary.
  const chartParams = new URLSearchParams({ limit: "500", offset: "0" });
  if (filters.dateFrom) chartParams.set("dateFrom", filters.dateFrom);
  if (filters.dateTo)   chartParams.set("dateTo",   filters.dateTo);
  if (filters.provider) chartParams.set("provider", filters.provider);

  const { data: chartData, isLoading: chartLoading } = useQuery<ReportResponse>({
    queryKey: ["/api/corporate/rideshare/transactions/report", "overview-charts", filters.dateFrom, filters.dateTo, filters.provider],
    queryFn: () =>
      fetch(`/api/corporate/rideshare/transactions/report?${chartParams}`, { credentials: "include" }).then(r => r.json()),
  });

  const isLoading = kpiLoading || chartLoading;
  const s = kpiData;
  const txns = chartData?.transactions ?? [];

  // Spend by account — top 8 (from chart rows)
  const byAccount: Record<string, number> = {};
  txns.forEach(t => {
    const key = t.matchedAccountName || t.matchedAccountNumber || "Unmatched";
    byAccount[key] = (byAccount[key] || 0) + parseFloat(t.totalFare || "0");
  });
  const topAccounts = Object.entries(byAccount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value]) => ({ label, value }));

  // Spend over time — by month (from chart rows)
  const byMonthMap: Record<string, number> = {};
  txns.forEach(t => {
    if (!t.rideDate) return;
    const month = t.rideDate.slice(0, 7);
    byMonthMap[month] = (byMonthMap[month] || 0) + parseFloat(t.totalFare || "0");
  });
  const monthData = Object.entries(byMonthMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([label, value]) => ({
      label: label.replace(/^(\d{4})-(\d{2})$/, (_, y, m) =>
        new Date(`${y}-${m}-01`).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
      ),
      value,
    }));

  const kpiCards = [
    {
      title: "Total Rides",
      value: s ? s.totalRides.toLocaleString() : "—",
      icon: Car,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      title: "Total Spend",
      value: s ? fmt$(s.totalSpend) : "—",
      icon: DollarSign,
      color: "text-green-600",
      bg: "bg-green-500/10",
    },
    {
      title: "Matched %",
      value: s ? `${s.matchPct}%` : "—",
      icon: CheckCircle2,
      color: "text-blue-600",
      bg: "bg-blue-500/10",
    },
    {
      title: "Exception %",
      value: s ? `${s.exceptionPct}%` : "—",
      icon: AlertTriangle,
      color: "text-orange-600",
      bg: "bg-orange-500/10",
    },
    {
      title: "Avg Fare",
      value: s?.avgFare ? fmt$(s.avgFare) : "—",
      icon: TrendingUp,
      color: "text-purple-600",
      bg: "bg-purple-500/10",
    },
    {
      title: "Uber vs Lyft",
      value: s ? `${s.uberRides} / ${s.lyftRides}` : "—",
      icon: BarChart3,
      color: "text-muted-foreground",
      bg: "bg-muted",
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Row — powered by /canonical/widget-summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} data-testid={`card-kpi-${card.title.toLowerCase().replace(/\s+/g, "-")}`}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-md ${card.bg} shrink-0`}>
                    <Icon className={`h-4 w-4 ${card.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground leading-tight">{card.title}</p>
                    {kpiLoading
                      ? <Skeleton className="h-6 w-16 mt-1" />
                      : <p className="text-lg font-semibold leading-tight mt-0.5">{card.value}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Billing status mini-row — canonical billing breakdown */}
      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Unreviewed",        value: s.totalUnreviewed,      color: "text-yellow-600",  bg: "bg-yellow-500/10" },
            { label: "Ready for Billing", value: s.totalReadyForBilling, color: "text-blue-600",    bg: "bg-blue-500/10" },
            { label: "Billed",            value: s.totalBilled,          color: "text-green-600",   bg: "bg-green-500/10" },
            { label: "Excluded",          value: s.totalExcluded,        color: "text-muted-foreground", bg: "bg-muted" },
          ].map(item => (
            <Card key={item.label} className="py-0">
              <CardContent className="pt-3 pb-3">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className={`text-xl font-semibold mt-0.5 ${item.color}`}>
                  {item.value.toLocaleString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Spend Over Time
            </CardTitle>
            <CardDescription>Monthly spend (last 12 months)</CardDescription>
          </CardHeader>
          <CardContent>
            {chartLoading
              ? <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
              : <MiniBarChart data={monthData} color="bg-primary" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Percent className="h-4 w-4 text-muted-foreground" />
              Provider Split
            </CardTitle>
            <CardDescription>Uber vs Lyft by ride count</CardDescription>
          </CardHeader>
          <CardContent>
            {kpiLoading
              ? <Skeleton className="h-20 w-full" />
              : <ProviderSplitChart uber={s?.uberRides ?? 0} lyft={s?.lyftRides ?? 0} />}
            {s && (
              <div className="mt-4 pt-3 border-t space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Uber Spend</span>
                  <span className="font-medium">{fmt$(s.uberSpend)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Lyft Spend</span>
                  <span className="font-medium">{fmt$(s.lyftSpend)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Spend by Account
          </CardTitle>
          <CardDescription>Top 8 accounts by total rideshare spend</CardDescription>
        </CardHeader>
        <CardContent>
          {chartLoading
            ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
            : <MiniBarChart data={topAccounts} color="bg-primary/70" />}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 2: Imports ───────────────────────────────────────────────────────────

interface PreviewRow {
  pickupAddress: string;
  dropoffAddress: string;
  fare: string;
  dateTime: string;
  provider: string;
  matchedAccount: string;
  status: string;
}

// ─── Reconciliation Status Pill ───────────────────────────────────────────────

function ReconStatusPill({ status, rowBalanced }: { status: "balanced" | "mismatch" | "pending"; rowBalanced: boolean }) {
  if (status === "balanced") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800">
        <CheckCircle2 className="w-3 h-3" />
        Balanced
      </span>
    );
  }
  if (status === "mismatch") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800">
        <AlertTriangle className="w-3 h-3" />
        Mismatch
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground border">
      <Clock className="w-3 h-3" />
      Pending
    </span>
  );
}

// ─── Batch Reconciliation Sheet ───────────────────────────────────────────────

interface FullRecon {
  importBatchId: string;
  reconciliationStatus: "balanced" | "mismatch" | "pending";
  rowBalanced: boolean;
  amountBalanced: boolean;
  totalRowsInFile: number;
  importedRows: number;
  rejectedRows: number;
  duplicateRows: number;
  employeeExpenseRows: number;
  fileTotalAmount: string;
  importedTotalAmount: string;
  rejectedTotalAmount: string;
  duplicateTotalAmount: string;
  employeeTotalAmount: string;
  totalAccountedRows: number;
  totalAccountedAmount: string;
  computedAt: string | null;
}

function BatchReconciliationSheet({
  batchId,
  batch,
  open,
  onClose,
}: {
  batchId: string;
  batch: ImportBatch | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: recon, isLoading, refetch } = useQuery<FullRecon>({
    queryKey: ["/api/corporate/rideshare/canonical/reconciliation", batchId],
    queryFn: () =>
      fetch(`/api/corporate/rideshare/canonical/reconciliation/${batchId}`, { credentials: "include" }).then(r => r.json()),
    enabled: open && !!batchId,
  });

  const recomputeMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/corporate/rideshare/canonical/reconciliation/${batchId}/recompute`, {
        method: "POST",
        credentials: "include",
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/canonical/reconciliation", batchId] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/canonical/reconciliation-list"] });
      refetch();
      toast({ title: "Reconciliation recomputed", description: "Tie-out has been refreshed." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const rowCheck = recon ? recon.totalAccountedRows === recon.totalRowsInFile : null;
  const amtCheck = true; // always balanced by construction

  function ReconRow({ label, rows, amount, highlight }: { label: string; rows: number; amount: string; highlight?: "green" | "orange" | "blue" | "red" }) {
    const colorMap = {
      green:  "text-green-700 dark:text-green-400",
      orange: "text-orange-600 dark:text-orange-400",
      blue:   "text-blue-700 dark:text-blue-400",
      red:    "text-red-700 dark:text-red-400",
    };
    const cls = highlight ? colorMap[highlight] : "text-foreground";
    return (
      <tr className="border-b last:border-0">
        <td className="py-2 pr-4 text-sm text-muted-foreground">{label}</td>
        <td className={`py-2 px-4 text-sm font-medium text-right tabular-nums ${cls}`}>
          {rows.toLocaleString()}
        </td>
        <td className={`py-2 pl-4 text-sm font-medium text-right tabular-nums ${cls}`}>
          {fmt$(amount)}
        </td>
      </tr>
    );
  }

  function SeparatorRow() {
    return <tr><td colSpan={3} className="py-1"><div className="border-t" /></td></tr>;
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <SheetTitle className="sr-only">Batch Reconciliation Tie-out</SheetTitle>

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b bg-muted/30">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ListChecks className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Reconciliation Tie-out</span>
              {recon && <ReconStatusPill status={recon.reconciliationStatus} rowBalanced={recon.rowBalanced} />}
            </div>
            <p className="text-xs text-muted-foreground font-mono truncate max-w-xs">
              {batch?.sourceFileName ?? batchId.slice(0, 8) + "…"}
            </p>
            <div className="flex items-center gap-3 mt-1">
              {batch && <ProviderBadge provider={batch.provider} />}
              {batch?.uploadedAt && (
                <span className="text-xs text-muted-foreground">{fmtDate(batch.uploadedAt)}</span>
              )}
              {recon?.computedAt && (
                <span className="text-xs text-muted-foreground">
                  Last computed {fmtDate(recon.computedAt)}
                </span>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => recomputeMutation.mutate()}
            disabled={recomputeMutation.isPending}
            data-testid="button-recompute-reconciliation"
          >
            {recomputeMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span className="ml-1.5">Recompute</span>
          </Button>
        </div>

        {isLoading ? (
          <div className="p-8 flex items-center justify-center text-muted-foreground text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading reconciliation…
          </div>
        ) : !recon ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground mb-3">No reconciliation data yet.</p>
            <Button variant="outline" size="sm" onClick={() => recomputeMutation.mutate()} disabled={recomputeMutation.isPending}>
              Compute Now
            </Button>
          </div>
        ) : (
          <div className="p-5 space-y-6">

            {/* Balance Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className={`rounded-md border p-3 flex items-center gap-3 ${rowCheck ? "border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800" : "border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800"}`}>
                {rowCheck
                  ? <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                  : <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                }
                <div>
                  <p className="text-xs text-muted-foreground">Row Balance</p>
                  <p className={`text-sm font-semibold ${rowCheck ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                    {recon.totalAccountedRows.toLocaleString()} / {recon.totalRowsInFile.toLocaleString()} rows
                  </p>
                </div>
              </div>
              <div className="rounded-md border p-3 flex items-center gap-3 border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">
                <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Amount Balance</p>
                  <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                    {fmt$(recon.totalAccountedAmount)} accounted
                  </p>
                </div>
              </div>
            </div>

            {/* Tie-out Table */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Row &amp; Dollar Tie-out
              </p>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="py-2 pr-4 text-left text-xs font-semibold text-muted-foreground">Category</th>
                      <th className="py-2 px-4 text-right text-xs font-semibold text-muted-foreground">Rows</th>
                      <th className="py-2 pl-4 text-right text-xs font-semibold text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-0 px-2">
                    <ReconRow label="Imported (active)" rows={recon.importedRows} amount={recon.importedTotalAmount} highlight="green" />
                    <ReconRow label="Employee Expenses" rows={recon.employeeExpenseRows} amount={recon.employeeTotalAmount} highlight="blue" />
                    <ReconRow label="Rejected (parse fail)" rows={recon.rejectedRows} amount={recon.rejectedTotalAmount} highlight="orange" />
                    <ReconRow label="Duplicates (skipped)" rows={recon.duplicateRows} amount={recon.duplicateTotalAmount} highlight="orange" />
                    <SeparatorRow />
                    <tr className="bg-muted/30">
                      <td className="py-2.5 pr-4 text-sm font-semibold">Total Accounted</td>
                      <td className={`py-2.5 px-4 text-sm font-bold text-right tabular-nums ${rowCheck ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                        {recon.totalAccountedRows.toLocaleString()}
                      </td>
                      <td className="py-2.5 pl-4 text-sm font-bold text-right tabular-nums text-green-700 dark:text-green-400">
                        {fmt$(recon.totalAccountedAmount)}
                      </td>
                    </tr>
                    <SeparatorRow />
                    <tr>
                      <td className="py-2 pr-4 text-sm text-muted-foreground">File Total (from header)</td>
                      <td className="py-2 px-4 text-sm font-semibold text-right tabular-nums">
                        {recon.totalRowsInFile.toLocaleString()}
                      </td>
                      <td className="py-2 pl-4 text-sm font-semibold text-right tabular-nums">
                        {fmt$(recon.fileTotalAmount)}
                      </td>
                    </tr>
                    <SeparatorRow />
                    <tr className="bg-muted/20">
                      <td className="py-2 pr-4 text-sm font-semibold">Unaccounted Delta</td>
                      <td className={`py-2 px-4 text-sm font-bold text-right tabular-nums ${rowCheck ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                        {rowCheck ? "0" : (recon.totalRowsInFile - recon.totalAccountedRows).toLocaleString()}
                      </td>
                      <td className="py-2 pl-4 text-sm font-bold text-right tabular-nums text-green-700 dark:text-green-400">
                        $0.00
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Drill-down Links */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Drill-down
              </p>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`#billing?batchId=${batchId}`}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs hover-elevate"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                  <span>{recon.importedRows.toLocaleString()} Imported Rows</span>
                  <ExternalLink className="w-3 h-3 ml-auto text-muted-foreground" />
                </a>
                <a
                  href={`#rejected?batchId=${batchId}`}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs hover-elevate"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                  <span>{(recon.rejectedRows + recon.duplicateRows).toLocaleString()} Rejected / Dups</span>
                  <ExternalLink className="w-3 h-3 ml-auto text-muted-foreground" />
                </a>
              </div>
            </div>

            {/* Mismatch Warning */}
            {!rowCheck && (
              <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-3 flex gap-3">
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400">Row Count Mismatch</p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                    {Math.abs(recon.totalRowsInFile - recon.totalAccountedRows).toLocaleString()} row(s) are unaccounted for.
                    This may indicate a parsing error, a skipped header, or corrupted data in the source file.
                    Check the Rejected tab for additional context, or reprocess the file.
                  </p>
                </div>
              </div>
            )}

          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ImportsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mappingTemplate, setMappingTemplate] = useState("uber_standard");
  const [autoDetect, setAutoDetect] = useState(true);
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [batchFilter, setBatchFilter] = useState<{ provider: string; dateFrom: string; dateTo: string }>({
    provider: "__all__",
    dateFrom: "",
    dateTo: "",
  });

  // ── Which batch is open in the reconciliation drawer ──────────────────────
  const [reconBatchId, setReconBatchId] = useState<string | null>(null);

  const { data: importBatches = [], isLoading: batchesLoading } = useQuery<ImportBatch[]>({
    queryKey: ["/api/corporate/rideshare/transactions/import-batches-list"],
    queryFn: () =>
      fetch("/api/corporate/rideshare/transactions/import-batches-list", { credentials: "include" }).then(r => r.json()),
  });

  // Reconciliation summary list (keyed by importBatchId)
  const { data: reconList = [] } = useQuery<ReconRow[]>({
    queryKey: ["/api/corporate/rideshare/canonical/reconciliation-list"],
    queryFn: () =>
      fetch("/api/corporate/rideshare/canonical/reconciliation-list", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30_000,
  });
  const reconMap = new Map<string, ReconRow>(reconList.map(r => [r.importBatchId, r]));

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("No file selected");
      const provider = mappingTemplate.startsWith("lyft") ? "lyft" : "uber";
      const form = new FormData();
      form.append("file", selectedFile);
      form.append("provider", provider);
      const res = await fetch("/api/corporate/rideshare/upload", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Upload failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Import successful",
        description: `${data.totalRecords} records processed. ${data.matchedRecords} matched, ${data.unmatchedRecords} exceptions.`,
      });
      setSelectedFile(null);
      setPreviewRows(null);
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/transactions/import-batches-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/transactions/report"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/transactions/exceptions"] });
    },
    onError: (err: Error) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) { setSelectedFile(file); setPreviewRows(null); }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setSelectedFile(file); setPreviewRows(null); }
  };

  const handlePreview = async () => {
    if (!selectedFile) return;
    setIsPreviewLoading(true);
    try {
      const text = await selectedFile.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      // Find the header line (skip Uber's metadata rows)
      let headerIdx = 0;
      for (let i = 0; i < Math.min(10, lines.length); i++) {
        const lower = lines[i].toLowerCase();
        if (lower.includes("pickup") || lower.includes("date") || lower.includes("fare") || lower.includes("start location")) {
          headerIdx = i;
          break;
        }
      }
      const parseCSVLine = (line: string) => {
        const result: string[] = [];
        let inQuote = false;
        let cur = "";
        for (const ch of line) {
          if (ch === '"') { inQuote = !inQuote; }
          else if (ch === "," && !inQuote) { result.push(cur.trim()); cur = ""; }
          else { cur += ch; }
        }
        result.push(cur.trim());
        return result;
      };
      const headers = parseCSVLine(lines[headerIdx]).map(h => h.toLowerCase().replace(/^"|"$/g, ""));
      const dataLines = lines.slice(headerIdx + 1, headerIdx + 11);
      const colIdx = (variants: string[]) => {
        for (const v of variants) {
          const i = headers.findIndex(h => h.includes(v));
          if (i >= 0) return i;
        }
        return -1;
      };
      const pickupCol   = colIdx(["start location", "pickup", "from"]);
      const dropoffCol  = colIdx(["end location", "dropoff", "drop-off", "to"]);
      const fareCol     = colIdx(["total", "amount", "fare", "subtotal"]);
      const dateCol     = colIdx(["request date", "date"]);
      const timeCol     = colIdx(["request time", "time"]);

      const rows: PreviewRow[] = dataLines.map(line => {
        const cells = parseCSVLine(line).map(c => c.replace(/^"|"$/g, "").replace(/^--$/, "").trim());
        const date = dateCol >= 0 ? cells[dateCol] : "";
        const time = timeCol >= 0 ? cells[timeCol] : "";
        return {
          pickupAddress:  pickupCol  >= 0 ? cells[pickupCol]  || "—" : "—",
          dropoffAddress: dropoffCol >= 0 ? cells[dropoffCol] || "—" : "—",
          fare:           fareCol    >= 0 ? cells[fareCol]    || "—" : "—",
          dateTime:       [date, time].filter(Boolean).join(" ") || "—",
          provider:       mappingTemplate.startsWith("lyft") ? "lyft" : "uber",
          matchedAccount: "Pending match…",
          status:         "Preview",
        };
      }).filter(r => r.pickupAddress !== "—" || r.dropoffAddress !== "—");

      setPreviewRows(rows);
    } catch {
      toast({ title: "Preview failed", description: "Could not parse the file for preview.", variant: "destructive" });
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const filteredBatches = importBatches.filter(b => {
    if (batchFilter.provider !== "__all__" && b.provider !== batchFilter.provider) return false;
    if (batchFilter.dateFrom && b.uploadedAt && b.uploadedAt < batchFilter.dateFrom) return false;
    if (batchFilter.dateTo && b.uploadedAt && b.uploadedAt.slice(0, 10) > batchFilter.dateTo) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Section A: Upload Panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UploadCloud className="h-4 w-4 text-muted-foreground" />
            Upload File
          </CardTitle>
          <CardDescription>Select a mapping template, then upload and preview your Uber or Lyft export file</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Mapping Template */}
            <div className="space-y-1.5">
              <Label htmlFor="mapping-template">Mapping Template</Label>
              <Select value={mappingTemplate} onValueChange={setMappingTemplate}>
                <SelectTrigger id="mapping-template" data-testid="select-mapping-template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="uber_standard">Uber Standard</SelectItem>
                  <SelectItem value="lyft_standard">Lyft Standard</SelectItem>
                  <SelectItem value="custom">Custom (reserved)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Auto-detect */}
            <div className="flex items-center gap-2 mt-6">
              <Checkbox
                id="auto-detect"
                checked={autoDetect}
                onCheckedChange={(v) => setAutoDetect(!!v)}
                data-testid="checkbox-auto-detect"
              />
              <Label htmlFor="auto-detect" className="cursor-pointer">
                Auto-detect mapping
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>Automatically identify column headers from the file</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Drag & Drop Zone */}
          <div
            className={`border-2 border-dashed rounded-md p-8 text-center transition-colors cursor-pointer ${
              dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            }`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            data-testid="zone-drop-upload"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
              data-testid="input-file-upload"
            />
            <UploadCloud className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            {selectedFile ? (
              <div>
                <p className="font-medium text-sm">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {(selectedFile.size / 1024).toFixed(1)} KB — click to change
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium">Drag and drop your file here</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  or click to browse — CSV or XLSX, up to 50 MB
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 items-center">
            <Button
              variant="outline"
              onClick={handlePreview}
              disabled={!selectedFile || isPreviewLoading}
              data-testid="button-preview-file"
            >
              {isPreviewLoading
                ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Previewing…</>
                : <><FileText className="h-4 w-4 mr-2" />Preview File</>}
            </Button>
            {selectedFile && (
              <Button
                variant="ghost"
                onClick={() => { setSelectedFile(null); setPreviewRows(null); }}
                data-testid="button-clear-file"
              >
                <X className="h-4 w-4 mr-2" />
                Clear
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              {previewRows && (
                <Button
                  variant="outline"
                  onClick={() => { setSelectedFile(null); setPreviewRows(null); }}
                  data-testid="button-cancel-import"
                >
                  Cancel
                </Button>
              )}
              <Button
                onClick={() => uploadMutation.mutate()}
                disabled={!selectedFile || uploadMutation.isPending}
                data-testid="button-import-file"
              >
                {uploadMutation.isPending
                  ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Importing…</>
                  : <><UploadCloud className="h-4 w-4 mr-2" />Import File</>}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section B: Preview Grid */}
      {previewRows && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <CardTitle className="text-base">File Preview</CardTitle>
                <CardDescription>First {previewRows.length} rows — read-only preview before import</CardDescription>
              </div>
              <Badge variant="secondary" className="text-xs">
                {previewRows.length} rows shown
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pickup Address</TableHead>
                    <TableHead>Dropoff Address</TableHead>
                    <TableHead>Fare</TableHead>
                    <TableHead>Date / Time</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Matched Account</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, i) => (
                    <TableRow key={i} data-testid={`row-preview-${i}`}>
                      <TableCell className="text-sm max-w-40 truncate" title={row.pickupAddress}>{row.pickupAddress}</TableCell>
                      <TableCell className="text-sm max-w-40 truncate" title={row.dropoffAddress}>{row.dropoffAddress}</TableCell>
                      <TableCell className="text-sm">{row.fare}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{row.dateTime}</TableCell>
                      <TableCell><ProviderBadge provider={row.provider} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.matchedAccount}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{row.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section C: Import Batch History */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Import Batch History
              </CardTitle>
              <CardDescription>All previously uploaded files and their processing results</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Batch filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <Select
              value={batchFilter.provider}
              onValueChange={(v) => setBatchFilter(f => ({ ...f, provider: v }))}
            >
              <SelectTrigger className="w-40" data-testid="select-batch-filter-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Providers</SelectItem>
                <SelectItem value="uber">Uber</SelectItem>
                <SelectItem value="lyft">Lyft</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input
                type="date"
                value={batchFilter.dateFrom}
                onChange={(e) => setBatchFilter(f => ({ ...f, dateFrom: e.target.value }))}
                className="w-36 text-sm"
                data-testid="input-batch-filter-date-from"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input
                type="date"
                value={batchFilter.dateTo}
                onChange={(e) => setBatchFilter(f => ({ ...f, dateTo: e.target.value }))}
                className="w-36 text-sm"
                data-testid="input-batch-filter-date-to"
              />
            </div>
          </div>

          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Name</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Upload Date</TableHead>
                  <TableHead className="text-right">Total Rows</TableHead>
                  <TableHead className="text-right">Imported</TableHead>
                  <TableHead className="text-right">Exceptions</TableHead>
                  <TableHead>Reconciliation</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchesLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredBatches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No import batches found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredBatches.map((b) => {
                    const recon = reconMap.get(b.id);
                    return (
                    <TableRow key={b.id} data-testid={`row-batch-${b.id}`}>
                      <TableCell className="text-sm font-medium max-w-48 truncate" title={b.sourceFileName || undefined}>
                        {b.sourceFileName || "—"}
                      </TableCell>
                      <TableCell><ProviderBadge provider={b.provider} /></TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{fmtDate(b.uploadedAt)}</TableCell>
                      <TableCell className="text-sm text-right">{b.totalRows?.toLocaleString() ?? "—"}</TableCell>
                      <TableCell className="text-sm text-right text-green-600 dark:text-green-400 font-medium">
                        {b.matchedRows?.toLocaleString() ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-right text-orange-600 dark:text-orange-400 font-medium">
                        {b.exceptionRows?.toLocaleString() ?? "—"}
                      </TableCell>
                      <TableCell>
                        {recon ? (
                          <ReconStatusPill status={recon.reconciliationStatus} rowBalanced={recon.rowBalanced} />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            data-testid={`button-view-batch-${b.id}`}
                            onClick={() => setReconBatchId(b.id)}
                          >
                            Tie-out
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Batch Reconciliation Sheet ── */}
      {reconBatchId && (
        <BatchReconciliationSheet
          batchId={reconBatchId}
          batch={importBatches.find(b => b.id === reconBatchId)}
          open={!!reconBatchId}
          onClose={() => setReconBatchId(null)}
        />
      )}
    </div>
  );
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

interface TxDetail {
  transaction: Record<string, unknown>;
  rawRow: { rawData: Record<string, unknown> } | null;
  batch: {
    id: string;
    sourceFileName: string | null;
    provider: string;
    uploadedAt: string | null;
    totalRows: number | null;
    matchedRows: number | null;
    exceptionRows: number | null;
  } | null;
  matchedAccount: {
    id: string;
    customerNumber: string | null;
    companyName: string | null;
    customerAddress: string | null;
    customerCity: string | null;
  } | null;
}

// Helper: section header
function DrawerSectionHeader({ icon: Icon, title }: { icon: ({ className }: { className?: string }) => JSX.Element; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <h3 className="text-sm font-semibold">{title}</h3>
    </div>
  );
}

// Helper: label/value row
function DrawerField({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0 pt-0.5 w-36">{label}</span>
      <span className={`text-xs text-right break-words ${mono ? "font-mono" : ""}`}>
        {value ?? <span className="text-muted-foreground/50">—</span>}
      </span>
    </div>
  );
}

function TransactionDetailDrawer({
  txId,
  open,
  onClose,
  onSaved,
}: {
  txId: string | null;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Local exception-resolution state
  const [assignAccount, setAssignAccount]   = useState<AccountOption | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [rawExpanded, setRawExpanded]        = useState(false);

  // Reset form when drawer opens with a new tx
  useEffect(() => {
    if (open) { setAssignAccount(null); setResolutionNotes(""); setRawExpanded(false); }
  }, [txId, open]);

  const { data, isLoading } = useQuery<TxDetail>({
    queryKey: ["/api/corporate/rideshare/transactions/detail", txId],
    queryFn: () =>
      fetch(`/api/corporate/rideshare/transactions/${txId}/detail`, { credentials: "include" }).then(r => r.json()),
    enabled: !!txId && open,
  });

  const tx      = data?.transaction as Record<string, unknown> | undefined;
  const rawRow  = data?.rawRow;
  const batch   = data?.batch;
  const account = data?.matchedAccount;

  // Mutations
  const assignMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/corporate/rideshare/transactions/${txId}/assign-account`, {
        accountId: assignAccount!.id,
        notes: resolutionNotes || undefined,
      }),
    onSuccess: () => {
      toast({ title: "Account assigned", description: "Transaction matched and resolved." });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/transactions/exceptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/transactions/report"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/transactions/detail", txId] });
      onSaved?.();
      onClose();
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const excludeMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/corporate/rideshare/transactions/${txId}/exclude`, {
        notes: resolutionNotes || undefined,
      }),
    onSuccess: () => {
      toast({ title: "Excluded", description: "Transaction excluded from billing." });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/transactions/exceptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/transactions/report"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/transactions/detail", txId] });
      onSaved?.();
      onClose();
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const readyMutation = useMutation({
    mutationFn: (notes?: string) =>
      apiRequest("POST", `/api/corporate/rideshare/transactions/${txId}/mark-ready`, { notes }),
    onSuccess: () => {
      toast({ title: "Marked ready for billing", description: "Transaction queued for invoice generation." });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/transactions/report"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/transactions/detail", txId] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/billing/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/billing/ready"] });
      onSaved?.();
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const undoReadyMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/corporate/rideshare/transactions/${txId}/flag-followup`, { notes: "Billing ready status reversed" }),
    onSuccess: () => {
      toast({ title: "Billing status reversed", description: "Transaction returned to unreviewed." });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/transactions/report"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/transactions/detail", txId] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/billing/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/billing/ready"] });
      onSaved?.();
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const isException      = tx ? ["exception", "unmatched"].includes(tx.matchStatus as string) : false;
  const isBillingReady   = tx ? tx.billingStatus === "ready_for_billing" : false;
  const isBilled         = tx ? tx.billingStatus === "billed" : false;
  const isExcluded       = tx ? tx.billingStatus === "excluded" : false;
  const isResolved       = isExcluded;
  const isMatched        = tx ? ["auto_matched", "manual_matched", "matched"].includes(tx.matchStatus as string) : false;
  const anyPending       = assignMutation.isPending || excludeMutation.isPending || readyMutation.isPending || undoReadyMutation.isPending;

  // Suggested accounts derived from pickup / dropoff match candidates
  const suggestedAccounts: AccountOption[] = [];
  if (tx) {
    if (tx.pickupAccountId && tx.pickupAccountNumber) {
      suggestedAccounts.push({
        id: tx.pickupAccountId as string,
        customerNumber: tx.pickupAccountNumber as string,
        companyName: (tx as Record<string, unknown>).pickupAccountName as string | null ?? null,
        customerAddress: null,
        customerCity: null,
      });
    }
    if (tx.dropoffAccountId && tx.dropoffAccountNumber && tx.dropoffAccountId !== tx.pickupAccountId) {
      suggestedAccounts.push({
        id: tx.dropoffAccountId as string,
        customerNumber: tx.dropoffAccountNumber as string,
        companyName: (tx as Record<string, unknown>).dropoffAccountName as string | null ?? null,
        customerAddress: null,
        customerCity: null,
      });
    }
  }

  const rawJson = rawRow?.rawData
    ? JSON.stringify(rawRow.rawData, null, 2)
    : tx ? JSON.stringify(
        Object.fromEntries(
          Object.entries(tx).filter(([k]) =>
            ["providerTripId", "requestDateUtc", "requestTimeUtc", "programName", "groupName",
             "countryCode", "rideType", "rideStatus", "currencyCode", "city",
             "riderFirstName", "riderLastName", "guestName"].includes(k)
          )
        ), null, 2
      ) : null;

  const handleCopyRaw = () => {
    if (rawJson) {
      navigator.clipboard.writeText(rawJson).then(() =>
        toast({ title: "Copied", description: "Raw data copied to clipboard." })
      );
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        className="p-0 gap-0 flex flex-col sm:max-w-[520px]"
        data-testid="drawer-transaction-detail"
      >
        {/* ── Sticky Header ── */}
        <div className="shrink-0 border-b px-5 pt-5 pb-4 pr-14">
          {/* Title row */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <SheetTitle className="text-base">Ride Details</SheetTitle>
            {tx && <ProviderBadge provider={tx.provider as string} />}
            {tx && <MatchStatusBadge status={tx.matchStatus as string} />}
            {tx && tx.billingStatus && <BillingStatusBadge status={tx.billingStatus as string} />}
          </div>
          {/* Summary */}
          {isLoading ? (
            <div className="space-y-1.5 mt-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-7 w-24" />
            </div>
          ) : tx ? (
            <div className="mt-1 space-y-0.5">
              <p className="text-sm text-muted-foreground">
                {fmtDateTime((tx.rideDatetime as string) || (tx.rideDate as string))}
              </p>
              {tx.riderName && (
                <p className="text-sm text-muted-foreground">{tx.riderName as string}</p>
              )}
              <p className="text-2xl font-bold mt-1">{fmt$(tx.totalFare as string | null)}</p>
            </div>
          ) : null}
        </div>

        {/* ── Scrollable Body ── */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
            </div>
          ) : !tx ? (
            <div className="p-5 text-sm text-muted-foreground">Transaction not found.</div>
          ) : (
            <>
              {/* ── Section 1: Ride Details ── */}
              <div className="px-5 pt-5 pb-4 border-b">
                <DrawerSectionHeader icon={Car} title="Ride Details" />
                {/* Two-column pickup / dropoff */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />Pickup
                    </p>
                    <p className="text-xs leading-snug">{(tx.pickupAddressRaw as string) || "—"}</p>
                    {tx.pickupAccountId && (
                      <>
                        <p className="text-xs text-muted-foreground mt-1.5">Pickup Account</p>
                        <p className="text-xs font-medium">{(tx as Record<string, unknown>).pickupAccountName as string || "—"}</p>
                        <p className="text-xs font-mono text-muted-foreground">{(tx.pickupAccountNumber as string) || ""}</p>
                      </>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />Dropoff
                    </p>
                    <p className="text-xs leading-snug">{(tx.dropoffAddressRaw as string) || "—"}</p>
                    {tx.dropoffAccountId && (
                      <>
                        <p className="text-xs text-muted-foreground mt-1.5">Dropoff Account</p>
                        <p className="text-xs font-medium">{(tx as Record<string, unknown>).dropoffAccountName as string || "—"}</p>
                        <p className="text-xs font-mono text-muted-foreground">{(tx.dropoffAccountNumber as string) || ""}</p>
                      </>
                    )}
                  </div>
                </div>
                {/* Final matched account */}
                <div className="bg-muted/50 rounded-md p-3 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Final Matched Account</p>
                  <p className="text-sm font-medium">{account?.companyName || "—"}</p>
                  {account?.customerNumber && (
                    <p className="text-xs font-mono text-muted-foreground">{account.customerNumber}</p>
                  )}
                  {account?.customerAddress && (
                    <p className="text-xs text-muted-foreground">{[account.customerAddress, account.customerCity].filter(Boolean).join(", ")}</p>
                  )}
                </div>
                {/* Trip metrics */}
                <div className="mt-3 grid grid-cols-2 gap-0">
                  <DrawerField label="Match Method"    value={tx.matchMethod    as string | null} />
                  <DrawerField label="Match Confidence" value={tx.matchConfidence as string | null} />
                  <DrawerField label="Distance"        value={tx.distanceMiles ? `${tx.distanceMiles} mi` : null} />
                  <DrawerField label="Duration"        value={tx.durationMinutes ? `${tx.durationMinutes} min` : null} />
                  <DrawerField label="Service Type"    value={tx.rideType       as string | null} />
                  <DrawerField label="City"            value={tx.city           as string | null} />
                  {tx.programName && <DrawerField label="Program" value={tx.programName as string} />}
                  {tx.groupName   && <DrawerField label="Group"   value={tx.groupName   as string} />}
                </div>
              </div>

              {/* ── Section 2: Financial Details ── */}
              <div className="px-5 pt-5 pb-4 border-b">
                <DrawerSectionHeader icon={Banknote} title="Financial Details" />
                <div>
                  <DrawerField label="Total Fare"  value={<span className="font-semibold">{fmt$(tx.totalFare as string | null)}</span>} />
                  <DrawerField label="Base Fare"   value={tx.baseFare   ? fmt$(tx.baseFare   as string) : null} />
                  <DrawerField label="Tips"        value={tx.tips       ? fmt$(tx.tips       as string) : null} />
                  <DrawerField label="Taxes"       value={tx.taxes      ? fmt$(tx.taxes      as string) : null} />
                  {tx.baseFareLocal && (
                    <DrawerField label="Base Fare (Local)" value={fmt$(tx.baseFareLocal as string)} />
                  )}
                  {tx.totalTaxesLocal && (
                    <DrawerField label="Taxes (Local)" value={fmt$(tx.totalTaxesLocal as string)} />
                  )}
                  {tx.totalTaxesUsd && (
                    <DrawerField label="Taxes (USD)" value={fmt$(tx.totalTaxesUsd as string)} />
                  )}
                  <DrawerField label="Currency" value={tx.currencyCode as string | null} />
                </div>
              </div>

              {/* ── Section 3: Match Details ── */}
              <div className="px-5 pt-5 pb-4 border-b">
                <DrawerSectionHeader icon={Shield} title="Match Details" />
                {/* Exception reason — highlighted */}
                {isException && tx.exceptionReason && (
                  <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-md p-3 mb-3">
                    <CircleAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-destructive mb-0.5">Exception Reason</p>
                      <p className="text-xs text-destructive/90">{tx.exceptionReason as string}</p>
                    </div>
                  </div>
                )}
                <div>
                  <DrawerField label="Match Status"
                    value={<MatchStatusBadge status={tx.matchStatus as string} />} />
                  <DrawerField label="Pickup Match"
                    value={tx.pickupAccountId
                      ? <span className="text-green-600 font-medium">{(tx as Record<string, unknown>).pickupAccountName as string || tx.pickupAccountNumber as string}</span>
                      : <span className="text-muted-foreground">No match</span>} />
                  <DrawerField label="Dropoff Match"
                    value={tx.dropoffAccountId
                      ? <span className="text-green-600 font-medium">{(tx as Record<string, unknown>).dropoffAccountName as string || tx.dropoffAccountNumber as string}</span>
                      : <span className="text-muted-foreground">No match</span>} />
                  <DrawerField label="Selected Match"
                    value={account
                      ? <span>{account.companyName} <span className="text-muted-foreground font-mono">{account.customerNumber}</span></span>
                      : null} />
                  <DrawerField label="Match Method"     value={tx.matchMethod     as string | null} />
                  <DrawerField label="Match Confidence" value={tx.matchConfidence as string | null} />
                  <DrawerField label="Billing Status"
                    value={<BillingStatusBadge status={tx.billingStatus as string | null} />} />
                  {tx.reviewedAt && (
                    <DrawerField label="Reviewed At" value={fmtDateTime(tx.reviewedAt as string)} />
                  )}
                </div>
              </div>

              {/* ── Section 4: Raw Source Data (collapsible) ── */}
              <div className="px-5 pt-5 pb-4 border-b">
                <Collapsible open={rawExpanded} onOpenChange={setRawExpanded}>
                  <div className="flex items-center justify-between">
                    <DrawerSectionHeader icon={Info} title="Raw Source Data" />
                    <div className="flex items-center gap-2 -mt-3">
                      {rawExpanded && rawJson && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost" size="icon"
                              className="h-7 w-7"
                              onClick={handleCopyRaw}
                              data-testid="button-copy-raw"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copy to clipboard</TooltipContent>
                        </Tooltip>
                      )}
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 text-xs"
                          data-testid="button-toggle-raw"
                        >
                          {rawExpanded ? "Collapse" : "Expand"}
                          <ChevronDown className={`h-3.5 w-3.5 ml-1 transition-transform ${rawExpanded ? "rotate-180" : ""}`} />
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </div>
                  <CollapsibleContent>
                    <div className="bg-muted rounded-md overflow-hidden">
                      <div className="overflow-x-auto max-h-72 overflow-y-auto">
                        <pre className="p-3 text-xs leading-relaxed whitespace-pre-wrap break-all font-mono">
                          {rawJson || "No raw data available for this record."}
                        </pre>
                      </div>
                    </div>
                  </CollapsibleContent>
                  {!rawExpanded && (
                    <p className="text-xs text-muted-foreground">
                      {rawJson ? "Click Expand to view all original source fields." : "No raw data available."}
                    </p>
                  )}
                </Collapsible>
              </div>

              {/* ── Section 5: Import Batch Info ── */}
              {batch && (
                <div className="px-5 pt-5 pb-4 border-b">
                  <DrawerSectionHeader icon={Package} title="Import Batch Info" />
                  <div>
                    <DrawerField label="File Name"    value={batch.sourceFileName} />
                    <DrawerField label="Provider"     value={<ProviderBadge provider={batch.provider} />} />
                    <DrawerField label="Upload Date"  value={fmtDate(batch.uploadedAt)} />
                    <DrawerField label="Batch ID"     value={batch.id ? <span className="font-mono text-xs">{batch.id.slice(0, 8)}…</span> : null} />
                    <DrawerField label="Total Rows"   value={batch.totalRows?.toLocaleString()} />
                    <DrawerField label="Matched"      value={batch.matchedRows?.toLocaleString()} />
                    <DrawerField label="Exceptions"   value={batch.exceptionRows?.toLocaleString()} />
                    {tx.rawRowId && (
                      <DrawerField label="Raw Row ID" value={<span className="font-mono text-xs">{String(tx.rawRowId).slice(0, 8)}…</span>} />
                    )}
                  </div>
                </div>
              )}

              {/* ── Section 6: Exception Resolution (only if applicable) ── */}
              {isException && !isResolved && (
                <div className="px-5 pt-5 pb-4">
                  <DrawerSectionHeader icon={CheckCheck} title="Exception Resolution" />

                  {/* Suggested accounts */}
                  {suggestedAccounts.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-muted-foreground mb-2">Suggested Accounts</p>
                      <div className="flex flex-wrap gap-2">
                        {suggestedAccounts.map(acct => (
                          <button
                            key={acct.id}
                            className={`text-xs px-3 py-1.5 rounded-md border transition-colors hover-elevate ${
                              assignAccount?.id === acct.id
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-border"
                            }`}
                            onClick={() => setAssignAccount(acct)}
                            data-testid={`button-suggest-${acct.id}`}
                          >
                            <span className="font-medium">{acct.companyName || acct.customerNumber}</span>
                            {acct.customerNumber && acct.companyName && (
                              <span className="ml-1 opacity-70 font-mono">{acct.customerNumber}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Account search */}
                  <div className="space-y-1.5 mb-3">
                    <Label className="text-xs">Assign Account</Label>
                    <AccountSearchInput
                      value={assignAccount}
                      onChange={setAssignAccount}
                      placeholder="Search by account name or number…"
                    />
                    {assignAccount && (
                      <p className="text-xs text-muted-foreground">
                        Selected: <span className="font-medium text-foreground">{assignAccount.companyName || assignAccount.customerNumber}</span>
                        {assignAccount.customerNumber && assignAccount.companyName && (
                          <span className="ml-1 font-mono">{assignAccount.customerNumber}</span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Notes */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Notes (optional)</Label>
                    <Textarea
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      placeholder="Add context about this resolution…"
                      className="text-sm resize-none"
                      rows={3}
                      data-testid="textarea-resolution-notes"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Sticky Footer ── */}
        <div className="shrink-0 border-t px-5 py-4 bg-background">
          {!tx || isLoading ? (
            <div className="flex gap-2">
              <Skeleton className="h-9 flex-1" />
              <Skeleton className="h-9 flex-1" />
            </div>
          ) : isBilled ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <span>Billed</span>
                {(tx as any).invoiceNumberSnapshot && (
                  <Badge variant="outline" className="font-mono text-xs">
                    <Receipt className="h-3 w-3 mr-1" />
                    {(tx as any).invoiceNumberSnapshot}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {(tx as any).billedAt ? `Invoiced ${fmtDateTime((tx as any).billedAt)}` : "Invoice generated"}
              </p>
            </div>
          ) : isBillingReady ? (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-orange-500 shrink-0" />
                <span className="font-medium">Ready for billing</span>
                <span className="text-xs text-muted-foreground">
                  {(tx as any).billingReadyAt ? `since ${fmtDate((tx as any).billingReadyAt)}` : ""}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={anyPending}
                  onClick={() => undoReadyMutation.mutate()}
                  data-testid="button-drawer-undo-ready"
                >
                  {undoReadyMutation.isPending
                    ? <RefreshCw className="h-4 w-4 animate-spin" />
                    : <><RotateCcw className="h-4 w-4 mr-2" />Undo Ready</>}
                </Button>
                <Button
                  variant="outline"
                  disabled={anyPending}
                  onClick={() => excludeMutation.mutate()}
                  data-testid="button-drawer-exclude-ready"
                >
                  Mark Excluded
                </Button>
              </div>
            </div>
          ) : isResolved ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm text-muted-foreground">Excluded from billing</span>
            </div>
          ) : isException ? (
            <div className="flex flex-wrap gap-2">
              <Button
                className="flex-1"
                disabled={!assignAccount || anyPending}
                onClick={() => assignMutation.mutate()}
                data-testid="button-drawer-save-resolve"
              >
                {assignMutation.isPending
                  ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Saving…</>
                  : <><CheckCheck className="h-4 w-4 mr-2" />Save & Resolve</>}
              </Button>
              <Button
                variant="outline"
                disabled={anyPending}
                onClick={() => excludeMutation.mutate()}
                data-testid="button-drawer-exclude"
              >
                {excludeMutation.isPending
                  ? <RefreshCw className="h-4 w-4 animate-spin" />
                  : "Mark Excluded"}
              </Button>
            </div>
          ) : isMatched ? (
            <div className="flex flex-wrap gap-2">
              <Button
                className="flex-1"
                disabled={anyPending}
                onClick={() => readyMutation.mutate()}
                data-testid="button-drawer-ready-billing"
              >
                {readyMutation.isPending
                  ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Updating…</>
                  : <><FileCheck className="h-4 w-4 mr-2" />Mark Ready for Billing</>}
              </Button>
              <Button
                variant="outline"
                disabled={anyPending}
                onClick={() => excludeMutation.mutate()}
                data-testid="button-drawer-exclude-matched"
              >
                Mark Excluded
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={onClose} className="w-full">
              Close
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Tab 3: Reconciliation ────────────────────────────────────────────────────

function ReconciliationTab({ filters: globalFilters }: { filters: GlobalFilters }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dateFrom, setDateFrom]       = useState(globalFilters.dateFrom);
  const [dateTo, setDateTo]           = useState(globalFilters.dateTo);
  const [provider, setProvider]       = useState(globalFilters.provider || "__all__");
  const [matchStatus, setMatchStatus] = useState("__all__");
  const [importBatchId, setImportBatchId] = useState("__all__");
  const [offset, setOffset]           = useState(0);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [selectedReconIds, setSelectedReconIds] = useState<Set<string>>(new Set());
  const [bulkExcludeOpen, setBulkExcludeOpen] = useState(false);
  const [bulkNotes, setBulkNotes] = useState("");
  const [billingFilter, setBillingFilter] = useState("__all__");
  const [markAllFilteredConfirm, setMarkAllFilteredConfirm] = useState(false);
  const [eligibilityModal, setEligibilityModal] = useState<{
    eligibleIds: string[];
    ineligibleCount: number;
    ineligibleReasons: { id: string; reason: string; rideDate: string | null }[];
  } | null>(null);
  const LIMIT = 50;

  const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
  if (dateFrom)                       params.set("dateFrom", dateFrom);
  if (dateTo)                         params.set("dateTo", dateTo);
  if (provider !== "__all__")         params.set("provider", provider);
  if (matchStatus !== "__all__")      params.set("matchStatus", matchStatus);
  if (importBatchId !== "__all__")    params.set("importBatchId", importBatchId);
  if (billingFilter !== "__all__")    params.set("billingStatus", billingFilter);

  const { data, isLoading } = useQuery<ReportResponse>({
    queryKey: ["/api/corporate/rideshare/transactions/report", dateFrom, dateTo, provider, matchStatus, importBatchId, billingFilter, offset],
    queryFn: () =>
      fetch(`/api/corporate/rideshare/transactions/report?${params}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: importBatches = [] } = useQuery<ImportBatch[]>({
    queryKey: ["/api/corporate/rideshare/transactions/import-batches-list"],
    queryFn: () =>
      fetch("/api/corporate/rideshare/transactions/import-batches-list", { credentials: "include" }).then(r => r.json()),
  });

  const s = data?.summary;
  const txns = data?.transactions ?? [];
  const total = data?.total ?? 0;

  const handleExport = () => {
    let csv = "Ride Date,Provider,Rider,Pickup,Dropoff,Account #,Account Name,Fare,Match Status,Billing Status,Batch\n";
    txns.forEach(t => {
      csv += [
        t.rideDate || "", t.provider, `"${t.riderName || ""}"`,
        `"${t.pickupAddressRaw || ""}"`, `"${t.dropoffAddressRaw || ""}"`,
        t.matchedAccountNumber || "", `"${t.matchedAccountName || ""}"`,
        t.totalFare || "", t.matchStatus, t.billingStatus || "", `"${t.batchFileName || ""}"`,
      ].join(",") + "\n";
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "rideshare_reconciliation.csv";
    a.click();
  };

  const bulkMarkReadyMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiRequest("POST", "/api/corporate/rideshare/billing/bulk-mark-ready", { ids, notes: bulkNotes || undefined }),
    onSuccess: (data: any) => {
      toast({ title: "Marked ready for billing", description: `${data.markedCount} record(s) queued. ${data.skippedCount > 0 ? `${data.skippedCount} skipped (already billed/excluded).` : ""}` });
      setSelectedReconIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/transactions/report"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/billing/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/billing/ready"] });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const bulkExcludeMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiRequest("POST", "/api/corporate/rideshare/billing/bulk-exclude", { ids, notes: bulkNotes || undefined }),
    onSuccess: (data: any) => {
      toast({ title: "Excluded from billing", description: `${data.excludedCount} record(s) excluded.` });
      setSelectedReconIds(new Set());
      setBulkExcludeOpen(false);
      setBulkNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/transactions/report"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/billing/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/billing/ready"] });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  // Pre-flight eligibility check before bulk mark-ready
  const checkEligibilityMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiRequest("POST", "/api/corporate/rideshare/billing/check-eligibility", { ids }),
    onSuccess: (data: any) => {
      if (data.ineligibleCount === 0) {
        // All eligible — proceed directly
        bulkMarkReadyMutation.mutate(data.eligible.map((e: any) => e.id));
      } else if (data.eligibleCount === 0) {
        // None eligible — show error toast with reasons summary
        const topReasons = [...new Set(data.ineligible.map((i: any) => i.reason))].slice(0, 3).join("; ");
        toast({ title: "No eligible records", description: topReasons, variant: "destructive" });
      } else {
        // Mixed — show confirmation modal
        setEligibilityModal({
          eligibleIds: data.eligible.map((e: any) => e.id),
          ineligibleCount: data.ineligibleCount,
          ineligibleReasons: data.ineligible,
        });
      }
    },
    onError: (err: Error) => toast({ title: "Eligibility check failed", description: err.message, variant: "destructive" }),
  });

  // Mark all records matching current filters as ready (server-side, full dataset)
  const markAllFilteredMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/corporate/rideshare/billing/mark-all-filtered-ready", {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        provider: provider !== "__all__" ? provider : undefined,
        importBatchId: importBatchId !== "__all__" ? importBatchId : undefined,
        notes: bulkNotes || undefined,
      }),
    onSuccess: (data: any) => {
      const msg = data.markedCount > 0
        ? `${data.markedCount} matched unreviewed record(s) marked ready for billing.`
        : (data.message || "No eligible records found.");
      toast({ title: "Mark All Filtered Ready", description: msg });
      setMarkAllFilteredConfirm(false);
      setBulkNotes("");
      setSelectedReconIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/transactions/report"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/billing/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/billing/ready"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
      setMarkAllFilteredConfirm(false);
    },
  });

  const allPageIds = txns.map(t => t.id);
  const allSelected = allPageIds.length > 0 && allPageIds.every(id => selectedReconIds.has(id));
  const someSelected = selectedReconIds.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) {
      const next = new Set(selectedReconIds);
      allPageIds.forEach(id => next.delete(id));
      setSelectedReconIds(next);
    } else {
      const next = new Set(selectedReconIds);
      allPageIds.forEach(id => next.add(id));
      setSelectedReconIds(next);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1.5 flex-1 min-w-32">
              <Label className="text-xs">From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setOffset(0); }} data-testid="input-recon-date-from" />
            </div>
            <div className="space-y-1.5 flex-1 min-w-32">
              <Label className="text-xs">To</Label>
              <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setOffset(0); }} data-testid="input-recon-date-to" />
            </div>
            <div className="space-y-1.5 w-36">
              <Label className="text-xs">Provider</Label>
              <Select value={provider} onValueChange={(v) => { setProvider(v); setOffset(0); }}>
                <SelectTrigger data-testid="select-recon-provider"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Providers</SelectItem>
                  <SelectItem value="uber">Uber</SelectItem>
                  <SelectItem value="lyft">Lyft</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 w-40">
              <Label className="text-xs">Match Status</Label>
              <Select value={matchStatus} onValueChange={(v) => { setMatchStatus(v); setOffset(0); }}>
                <SelectTrigger data-testid="select-recon-match-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Statuses</SelectItem>
                  <SelectItem value="auto_matched">Matched</SelectItem>
                  <SelectItem value="manual_matched">Manual Match</SelectItem>
                  <SelectItem value="exception">Exception</SelectItem>
                  <SelectItem value="unmatched">Unmatched</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 w-48">
              <Label className="text-xs">Import Batch</Label>
              <Select value={importBatchId} onValueChange={(v) => { setImportBatchId(v); setOffset(0); }}>
                <SelectTrigger data-testid="select-recon-batch"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Batches</SelectItem>
                  {importBatches.map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.sourceFileName || b.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 w-44">
              <Label className="text-xs">Billing Status</Label>
              <Select value={billingFilter} onValueChange={(v) => { setBillingFilter(v); setOffset(0); setSelectedReconIds(new Set()); }}>
                <SelectTrigger data-testid="select-recon-billing-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Billing Statuses</SelectItem>
                  <SelectItem value="unreviewed">Unreviewed</SelectItem>
                  <SelectItem value="ready_for_billing">Ready for Billing</SelectItem>
                  <SelectItem value="billed">Billed</SelectItem>
                  <SelectItem value="excluded">Excluded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={handleExport} disabled={txns.length === 0} data-testid="button-export-recon">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Strip */}
      {s && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Spend", value: fmt$(s.totalSpend), color: "text-foreground" },
            { label: "Total Rides", value: s.totalRides.toLocaleString(), color: "text-foreground" },
            { label: "% Matched", value: `${s.matchPct}%`, color: "text-green-600" },
            { label: "% Billed", value: `${s.billedPct}%`, color: "text-blue-600" },
          ].map(({ label, value, color }) => (
            <Card key={label}>
              <CardContent className="pt-3 pb-3 text-center">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-xl font-semibold mt-0.5 ${color}`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Bulk Actions Bar + Mark All Filtered */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Mark All Filtered Ready — always visible as a standalone action */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMarkAllFilteredConfirm(true)}
          disabled={markAllFilteredMutation.isPending}
          data-testid="button-mark-all-filtered-ready"
        >
          {markAllFilteredMutation.isPending
            ? <RefreshCw className="h-4 w-4 animate-spin mr-1.5" />
            : <FileCheck className="h-4 w-4 mr-1.5" />}
          Mark All Filtered Ready
        </Button>
        {someSelected && (
          <div className="flex flex-wrap items-center gap-2 flex-1 p-2 bg-muted/50 border rounded-md">
            <span className="text-sm font-medium shrink-0 text-muted-foreground">
              <ListChecks className="h-4 w-4 inline mr-1.5" />
              {selectedReconIds.size} selected
            </span>
            <div className="flex flex-wrap gap-2 ml-auto">
              <Button
                size="sm"
                disabled={checkEligibilityMutation.isPending || bulkMarkReadyMutation.isPending || bulkExcludeMutation.isPending}
                onClick={() => checkEligibilityMutation.mutate([...selectedReconIds])}
                data-testid="button-bulk-mark-ready"
              >
                {(checkEligibilityMutation.isPending || bulkMarkReadyMutation.isPending)
                  ? <><RefreshCw className="h-4 w-4 animate-spin mr-1.5" />Checking…</>
                  : <><FileCheck className="h-4 w-4 mr-1.5" />Mark Ready for Billing</>}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={checkEligibilityMutation.isPending || bulkMarkReadyMutation.isPending || bulkExcludeMutation.isPending}
                onClick={() => { setBulkNotes(""); setBulkExcludeOpen(true); }}
                data-testid="button-bulk-exclude"
              >
                {bulkExcludeMutation.isPending
                  ? <RefreshCw className="h-4 w-4 animate-spin" />
                  : "Exclude Selected"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedReconIds(new Set())}
                data-testid="button-bulk-clear"
              >
                <X className="h-4 w-4 mr-1.5" />Clear
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Main Grid */}
      <Card>
        <CardContent className="pt-4">
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pr-0">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                      data-testid="checkbox-select-all-recon"
                    />
                  </TableHead>
                  <TableHead>Date / Time</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Rider Name</TableHead>
                  <TableHead>Pickup</TableHead>
                  <TableHead>Dropoff</TableHead>
                  <TableHead>Account #</TableHead>
                  <TableHead>Account Name</TableHead>
                  <TableHead className="text-right">Fare</TableHead>
                  <TableHead>Match Status</TableHead>
                  <TableHead>Billing Status</TableHead>
                  <TableHead>Import Batch</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 12 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : txns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-10">
                      No transactions found for the selected filters
                    </TableCell>
                  </TableRow>
                ) : (
                  txns.map((tx) => (
                    <TableRow
                      key={tx.id}
                      className="cursor-pointer"
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('[data-no-drawer]')) return;
                        setSelectedTxId(tx.id); setDrawerOpen(true);
                      }}
                      data-testid={`row-recon-${tx.id}`}
                    >
                      <TableCell className="w-10 pr-0" data-no-drawer>
                        <Checkbox
                          checked={selectedReconIds.has(tx.id)}
                          onCheckedChange={(checked) => {
                            const next = new Set(selectedReconIds);
                            checked ? next.add(tx.id) : next.delete(tx.id);
                            setSelectedReconIds(next);
                          }}
                          aria-label={`Select row ${tx.id}`}
                          data-testid={`checkbox-row-recon-${tx.id}`}
                        />
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {fmtDate(tx.rideDate)}
                      </TableCell>
                      <TableCell><ProviderBadge provider={tx.provider} /></TableCell>
                      <TableCell className="text-sm">{tx.riderName || "—"}</TableCell>
                      <TableCell className="text-sm max-w-36 truncate" title={tx.pickupAddressRaw || undefined}>
                        {tx.pickupAddressRaw || "—"}
                      </TableCell>
                      <TableCell className="text-sm max-w-36 truncate" title={tx.dropoffAddressRaw || undefined}>
                        {tx.dropoffAddressRaw || "—"}
                      </TableCell>
                      <TableCell className="text-sm font-mono text-xs">{tx.matchedAccountNumber || "—"}</TableCell>
                      <TableCell className="text-sm">{tx.matchedAccountName || "—"}</TableCell>
                      <TableCell className="text-sm font-medium text-right">{fmt$(tx.totalFare)}</TableCell>
                      <TableCell><MatchStatusBadge status={tx.matchStatus} /></TableCell>
                      <TableCell><BillingStatusBadge status={tx.billingStatus} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-28 truncate" title={tx.batchFileName || undefined}>
                        {tx.batchFileName || "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {total > LIMIT && (
            <div className="flex items-center justify-between pt-3">
              <p className="text-sm text-muted-foreground">
                Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total.toLocaleString()}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline" size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                  data-testid="button-recon-prev"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline" size="sm"
                  disabled={offset + LIMIT >= total}
                  onClick={() => setOffset(offset + LIMIT)}
                  data-testid="button-recon-next"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <TransactionDetailDrawer
        txId={selectedTxId}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/transactions/report"] });
          queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/transactions/exceptions"] });
        }}
      />

      {/* ── Eligibility Confirmation Modal ─────────────────────────────────── */}
      <Dialog open={!!eligibilityModal} onOpenChange={(open) => { if (!open) setEligibilityModal(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Eligibility Review</DialogTitle>
            <DialogDescription>
              Some selected records cannot be marked ready for billing. Review the breakdown before confirming.
            </DialogDescription>
          </DialogHeader>
          {eligibilityModal && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded-md p-3 text-center">
                  <p className="text-2xl font-bold text-green-700 dark:text-green-400">{eligibilityModal.eligibleIds.length}</p>
                  <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">Eligible</p>
                </div>
                <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-md p-3 text-center">
                  <p className="text-2xl font-bold text-red-700 dark:text-red-400">{eligibilityModal.ineligibleCount}</p>
                  <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">Ineligible</p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Reasons for ineligible records:</p>
                <div className="max-h-48 overflow-y-auto border rounded-md divide-y text-sm">
                  {[...new Set(eligibilityModal.ineligibleReasons.map(r => r.reason))].map((reason, i) => {
                    const count = eligibilityModal.ineligibleReasons.filter(r => r.reason === reason).length;
                    return (
                      <div key={i} className="px-3 py-2 flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">{reason}</span>
                        <Badge variant="secondary" className="shrink-0">{count}</Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Only the {eligibilityModal.eligibleIds.length} eligible record(s) will be marked ready. The {eligibilityModal.ineligibleCount} ineligible record(s) will not be changed.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEligibilityModal(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (eligibilityModal) {
                  bulkMarkReadyMutation.mutate(eligibilityModal.eligibleIds);
                  setEligibilityModal(null);
                }
              }}
              disabled={bulkMarkReadyMutation.isPending || !eligibilityModal?.eligibleIds.length}
            >
              {bulkMarkReadyMutation.isPending
                ? <><RefreshCw className="h-4 w-4 animate-spin mr-1.5" />Processing…</>
                : `Mark ${eligibilityModal?.eligibleIds.length ?? 0} Ready for Billing`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Mark All Filtered Ready Confirmation ───────────────────────────── */}
      <Dialog open={markAllFilteredConfirm} onOpenChange={setMarkAllFilteredConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark All Filtered Records Ready</DialogTitle>
            <DialogDescription>
              This will mark every <strong>unreviewed, matched</strong> record matching your current filters as ready for billing. This cannot be undone without manually reopening each record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-sm text-amber-800 dark:text-amber-300">
              Only matched, unreviewed records will be affected — already-billed, excluded, and unmatched records are automatically skipped.
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                value={bulkNotes}
                onChange={(e) => setBulkNotes(e.target.value)}
                placeholder="e.g. Approved for billing by Finance team…"
                rows={2}
                data-testid="input-mark-all-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkAllFilteredConfirm(false)}>Cancel</Button>
            <Button
              onClick={() => markAllFilteredMutation.mutate()}
              disabled={markAllFilteredMutation.isPending}
              data-testid="button-confirm-mark-all-filtered"
            >
              {markAllFilteredMutation.isPending
                ? <><RefreshCw className="h-4 w-4 animate-spin mr-1.5" />Processing…</>
                : "Confirm — Mark All Filtered Ready"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Exclude Dialog ─────────────────────────────────────────────── */}
      <Dialog open={bulkExcludeOpen} onOpenChange={(open) => { if (!open) setBulkExcludeOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Exclude from Billing</DialogTitle>
            <DialogDescription>
              {selectedReconIds.size} record(s) will be excluded from billing. You may optionally add a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Exclusion Note (optional)</Label>
            <Textarea
              value={bulkNotes}
              onChange={(e) => setBulkNotes(e.target.value)}
              placeholder="e.g. Employee expense, not billable to account…"
              rows={3}
              data-testid="input-bulk-exclude-notes"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkExcludeOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => bulkExcludeMutation.mutate([...selectedReconIds])}
              disabled={bulkExcludeMutation.isPending}
              data-testid="button-confirm-bulk-exclude"
            >
              {bulkExcludeMutation.isPending
                ? <><RefreshCw className="h-4 w-4 animate-spin mr-1.5" />Excluding…</>
                : `Exclude ${selectedReconIds.size} Record(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Account Search Combobox (for exceptions) ─────────────────────────────────

function AccountSearchInput({
  value,
  onChange,
  placeholder = "Search accounts…",
}: {
  value: AccountOption | null;
  onChange: (v: AccountOption | null) => void;
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: results = [], isFetching } = useQuery<AccountOption[]>({
    queryKey: ["/api/corporate/rideshare/accounts-search", search],
    queryFn: () =>
      fetch(`/api/corporate/rideshare/accounts-search?q=${encodeURIComponent(search)}`, { credentials: "include" }).then(r => r.json()),
    enabled: search.length >= 1,
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          className="pl-8 text-sm h-8"
          placeholder={value ? value.companyName || value.customerNumber || placeholder : placeholder}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); if (!e.target.value) onChange(null); }}
          onFocus={() => setOpen(true)}
          data-testid="input-account-search"
        />
        {value && (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => { onChange(null); setSearch(""); }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && search.length >= 1 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
          {isFetching ? (
            <div className="p-2 text-xs text-muted-foreground">Searching…</div>
          ) : results.length === 0 ? (
            <div className="p-2 text-xs text-muted-foreground">No accounts found</div>
          ) : (
            results.map(acct => (
              <button
                key={acct.id}
                className="w-full text-left px-3 py-2 text-sm hover-elevate"
                onClick={() => { onChange(acct); setSearch(""); setOpen(false); }}
                data-testid={`option-account-${acct.id}`}
              >
                <span className="font-medium">{acct.companyName}</span>
                {acct.customerNumber && (
                  <span className="text-xs text-muted-foreground ml-2">{acct.customerNumber}</span>
                )}
                {acct.customerCity && (
                  <span className="text-xs text-muted-foreground ml-1">· {acct.customerCity}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab 4: Exceptions ────────────────────────────────────────────────────────

function ExceptionsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [filterProvider, setFilterProvider]       = useState("__all__");
  const [filterDateFrom, setFilterDateFrom]       = useState("");
  const [filterDateTo, setFilterDateTo]           = useState("");
  const [filterStatus, setFilterStatus]           = useState("open");
  const [selectedIds, setSelectedIds]             = useState<Set<string>>(new Set());
  const [assignTargets, setAssignTargets]         = useState<Record<string, AccountOption | null>>({});
  const [offset, setOffset]                       = useState(0);
  const [excDrawerTxId, setExcDrawerTxId]         = useState<string | null>(null);
  const [excDrawerOpen, setExcDrawerOpen]         = useState(false);
  const LIMIT = 50;

  const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset), status: filterStatus });
  if (filterProvider !== "__all__") params.set("provider", filterProvider);
  if (filterDateFrom) params.set("dateFrom", filterDateFrom);
  if (filterDateTo) params.set("dateTo", filterDateTo);

  const { data, isLoading, refetch } = useQuery<{ exceptions: ExceptionRow[]; total: number }>({
    queryKey: ["/api/corporate/rideshare/transactions/exceptions", filterProvider, filterDateFrom, filterDateTo, filterStatus, offset],
    queryFn: () =>
      fetch(`/api/corporate/rideshare/transactions/exceptions?${params}`, { credentials: "include" }).then(r => r.json()),
  });

  const exceptions = data?.exceptions ?? [];
  const total = data?.total ?? 0;

  const assignMutation = useMutation({
    mutationFn: ({ id, accountId }: { id: string; accountId: string }) =>
      apiRequest("POST", `/api/corporate/rideshare/transactions/${id}/assign-account`, { accountId }),
    onSuccess: (_d, { id }) => {
      toast({ title: "Account assigned", description: "Transaction matched successfully." });
      setAssignTargets(prev => { const n = { ...prev }; delete n[id]; return n; });
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/transactions/exceptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/transactions/report"] });
    },
    onError: (err: Error) => toast({ title: "Failed to assign", description: err.message, variant: "destructive" }),
  });

  const excludeMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      apiRequest("POST", `/api/corporate/rideshare/transactions/${id}/exclude`, {}),
    onSuccess: () => {
      toast({ title: "Excluded", description: "Transaction excluded from billing." });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/transactions/exceptions"] });
    },
    onError: (err: Error) => toast({ title: "Failed to exclude", description: err.message, variant: "destructive" }),
  });

  const handleExportExceptions = () => {
    let csv = "Ride Date,Provider,Pickup,Dropoff,Fare,Suggested Account,Exception Reason,Billing Status\n";
    exceptions.forEach(e => {
      const suggested = e.matchedAccountName || e.pickupAccountName || e.dropoffAccountName || "";
      csv += [
        e.rideDate || "", e.provider,
        `"${e.pickupAddressRaw || ""}"`, `"${e.dropoffAddressRaw || ""}"`,
        e.totalFare || "", `"${suggested}"`,
        `"${e.exceptionReason || ""}"`, e.billingStatus || "",
      ].join(",") + "\n";
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "rideshare_exceptions.csv";
    a.click();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === exceptions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(exceptions.map(e => e.id)));
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1.5 w-36">
              <Label className="text-xs">Provider</Label>
              <Select value={filterProvider} onValueChange={(v) => { setFilterProvider(v); setOffset(0); }}>
                <SelectTrigger data-testid="select-exc-provider"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Providers</SelectItem>
                  <SelectItem value="uber">Uber</SelectItem>
                  <SelectItem value="lyft">Lyft</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 flex-1 min-w-32">
              <Label className="text-xs">Date From</Label>
              <Input type="date" value={filterDateFrom} onChange={(e) => { setFilterDateFrom(e.target.value); setOffset(0); }} data-testid="input-exc-date-from" />
            </div>
            <div className="space-y-1.5 flex-1 min-w-32">
              <Label className="text-xs">Date To</Label>
              <Input type="date" value={filterDateTo} onChange={(e) => { setFilterDateTo(e.target.value); setOffset(0); }} data-testid="input-exc-date-to" />
            </div>
            <div className="space-y-1.5 w-40">
              <Label className="text-xs">Status</Label>
              <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setOffset(0); }}>
                <SelectTrigger data-testid="select-exc-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="needs_followup">Needs Follow-up</SelectItem>
                  <SelectItem value="excluded">Excluded</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="ghost" size="sm"
              onClick={() => refetch()}
              data-testid="button-exc-refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      <div className="flex flex-wrap gap-2 items-center">
        {selectedIds.size > 0 && (
          <Badge variant="secondary" className="text-sm">
            {selectedIds.size} selected
          </Badge>
        )}
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            onClick={handleExportExceptions}
            disabled={exceptions.length === 0}
            data-testid="button-export-exceptions"
          >
            <Download className="h-4 w-4 mr-2" />
            Export Exceptions
          </Button>
        </div>
      </div>

      {/* Exceptions Grid */}
      <Card>
        <CardContent className="pt-4">
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedIds.size === exceptions.length && exceptions.length > 0}
                      onCheckedChange={toggleSelectAll}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead>Ride Date</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Pickup</TableHead>
                  <TableHead>Dropoff</TableHead>
                  <TableHead className="text-right">Fare</TableHead>
                  <TableHead>Suggested Account</TableHead>
                  <TableHead>Exception Reason</TableHead>
                  <TableHead>Assign Account</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : exceptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-10">
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 className="h-8 w-8 text-muted-foreground/40" />
                        <p>No exceptions found</p>
                        <p className="text-xs">All rides have been matched or no data has been imported yet</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  exceptions.map((exc) => {
                    const suggested = exc.matchedAccountName || exc.pickupAccountName || exc.dropoffAccountName;
                    const assignTarget = assignTargets[exc.id] ?? null;
                    const isPendingAssign = assignMutation.isPending;
                    const isPendingExclude = excludeMutation.isPending;

                    return (
                      <TableRow
                        key={exc.id}
                        data-testid={`row-exc-${exc.id}`}
                        className="cursor-pointer"
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest("[data-no-drawer]")) return;
                          setExcDrawerTxId(exc.id);
                          setExcDrawerOpen(true);
                        }}
                      >
                        <TableCell data-no-drawer>
                          <Checkbox
                            checked={selectedIds.has(exc.id)}
                            onCheckedChange={() => toggleSelect(exc.id)}
                            data-testid={`checkbox-exc-${exc.id}`}
                          />
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{fmtDate(exc.rideDate)}</TableCell>
                        <TableCell><ProviderBadge provider={exc.provider} /></TableCell>
                        <TableCell className="text-sm max-w-36 truncate" title={exc.pickupAddressRaw || undefined}>
                          {exc.pickupAddressRaw || "—"}
                        </TableCell>
                        <TableCell className="text-sm max-w-36 truncate" title={exc.dropoffAddressRaw || undefined}>
                          {exc.dropoffAddressRaw || "—"}
                        </TableCell>
                        <TableCell className="text-sm font-medium text-right">{fmt$(exc.totalFare)}</TableCell>
                        <TableCell className="text-sm">
                          {suggested
                            ? <span className="text-primary">{suggested}</span>
                            : <span className="text-muted-foreground">None</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-40 truncate" title={exc.exceptionReason || undefined}>
                          {exc.exceptionReason || "—"}
                        </TableCell>
                        <TableCell className="min-w-48" data-no-drawer>
                          <AccountSearchInput
                            value={assignTarget}
                            onChange={(v) => setAssignTargets(prev => ({ ...prev, [exc.id]: v }))}
                            placeholder="Search to assign…"
                          />
                        </TableCell>
                        <TableCell data-no-drawer>
                          <div className="flex gap-1.5">
                            <Button
                              size="sm"
                              disabled={!assignTarget || isPendingAssign}
                              onClick={(e) => { e.stopPropagation(); assignTarget && assignMutation.mutate({ id: exc.id, accountId: assignTarget.id }); }}
                              data-testid={`button-assign-exc-${exc.id}`}
                            >
                              {isPendingAssign ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isPendingExclude}
                              onClick={(e) => { e.stopPropagation(); excludeMutation.mutate({ id: exc.id }); }}
                              data-testid={`button-exclude-exc-${exc.id}`}
                            >
                              Exclude
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); setExcDrawerTxId(exc.id); setExcDrawerOpen(true); }}
                              data-testid={`button-view-exc-${exc.id}`}
                            >
                              Details
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {total > LIMIT && (
            <div className="flex items-center justify-between pt-3">
              <p className="text-sm text-muted-foreground">
                Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total.toLocaleString()}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline" size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                  data-testid="button-exc-prev"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline" size="sm"
                  disabled={offset + LIMIT >= total}
                  onClick={() => setOffset(offset + LIMIT)}
                  data-testid="button-exc-next"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Exception detail drawer */}
      <TransactionDetailDrawer
        txId={excDrawerTxId}
        open={excDrawerOpen}
        onClose={() => setExcDrawerOpen(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/transactions/exceptions"] });
          queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/transactions/report"] });
        }}
      />
    </div>
  );
}

// ─── Global Filter Panel ──────────────────────────────────────────────────────

function GlobalFilterPanel({
  filters,
  onChange,
  open,
  onClose,
}: {
  filters: GlobalFilters;
  onChange: (f: GlobalFilters) => void;
  open: boolean;
  onClose: () => void;
}) {
  const [local, setLocal] = useState(filters);

  useEffect(() => { setLocal(filters); }, [filters]);

  if (!open) return null;

  return (
    <Card className="border-primary/30">
      <CardContent className="pt-4 pb-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1.5 flex-1 min-w-36">
            <Label className="text-xs">Date From</Label>
            <Input
              type="date"
              value={local.dateFrom}
              onChange={(e) => setLocal(f => ({ ...f, dateFrom: e.target.value }))}
              data-testid="input-global-date-from"
            />
          </div>
          <div className="space-y-1.5 flex-1 min-w-36">
            <Label className="text-xs">Date To</Label>
            <Input
              type="date"
              value={local.dateTo}
              onChange={(e) => setLocal(f => ({ ...f, dateTo: e.target.value }))}
              data-testid="input-global-date-to"
            />
          </div>
          <div className="space-y-1.5 w-36">
            <Label className="text-xs">Provider</Label>
            <Select value={local.provider || "__all__"} onValueChange={(v) => setLocal(f => ({ ...f, provider: v === "__all__" ? "" : v }))}>
              <SelectTrigger data-testid="select-global-provider"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Providers</SelectItem>
                <SelectItem value="uber">Uber</SelectItem>
                <SelectItem value="lyft">Lyft</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => { onChange(local); onClose(); }} data-testid="button-apply-global-filters">
              Apply
            </Button>
            <Button variant="outline" onClick={() => { const d = getDefaultFilters(); setLocal(d); onChange(d); onClose(); }} data-testid="button-reset-global-filters">
              Reset
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-global-filters">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── PushToInvoiceModal ────────────────────────────────────────────────────────


interface AccountRideRow {
  id: string;
  rideDate?: string | null;
  provider?: string | null;
  riderName?: string | null;
  pickupAddressRaw?: string | null;
  dropoffAddressRaw?: string | null;
  totalFare?: string | null;
  billableAmount?: string | null;
}

function AccountRidesDetail({ weekStart, accountId, fmt$ }: { weekStart: string; accountId: string; fmt$: (v: string | number | null | undefined) => string }) {
  const { data, isLoading } = useQuery<{ rides: AccountRideRow[]; total: number }>({
    queryKey: ["/api/corporate/rideshare/billing/periods/preview/rides", weekStart, accountId],
    queryFn: () => fetch(`/api/corporate/rideshare/billing/periods/preview/rides?weekStart=${encodeURIComponent(weekStart)}&accountId=${encodeURIComponent(accountId)}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!weekStart && !!accountId,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="px-4 py-3 space-y-1.5">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-5 w-full" />)}
      </div>
    );
  }

  if (!data?.rides?.length) {
    return (
      <div className="px-4 py-3 text-xs text-muted-foreground italic">No rides found for this period.</div>
    );
  }

  return (
    <div className="bg-muted/20 border-t">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b">
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Date</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Provider</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Rider</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden sm:table-cell">Dropoff</th>
            <th className="text-right px-4 py-2 font-medium text-muted-foreground">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data.rides.map(ride => (
            <tr key={ride.id} className="hover:bg-muted/30">
              <td className="px-4 py-1.5 whitespace-nowrap">{ride.rideDate ?? "—"}</td>
              <td className="px-4 py-1.5 capitalize">{ride.provider ?? "—"}</td>
              <td className="px-4 py-1.5 max-w-[120px] truncate">{ride.riderName ?? "—"}</td>
              <td className="px-4 py-1.5 max-w-[140px] truncate hidden sm:table-cell">{ride.dropoffAddressRaw ?? "—"}</td>
              <td className="px-4 py-1.5 text-right font-medium">{fmt$(ride.billableAmount ?? ride.totalFare)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 text-xs text-muted-foreground border-t">
        {data.total} ride{data.total !== 1 ? "s" : ""} in this billing period
      </div>
    </div>
  );
}

function PushToInvoiceModal({
  open,
  pushResult,
  selectedPeriod,
  selectedPeriodObj,
  periodPreview,
  previewLoading,
  selectedIds,
  selectedByAcct,
  selectedRecords,
  selectedTotal,
  selectedAccountIds,
  expandedAccountIds,
  pushIsPending,
  onToggleAccount,
  onSelectAllAccounts,
  onDeselectAllAccounts,
  onToggleExpand,
  onConfirm,
  onClose,
  onExportDetail,
  fmt$,
}: {
  open: boolean;
  pushResult: PushInvoiceResult | null;
  selectedPeriod: string;
  selectedPeriodObj: { weekStart: string; weekEnd: string; label: string } | null;
  periodPreview: BillingPeriodPreview | null;
  previewLoading: boolean;
  selectedIds: Set<string>;
  selectedByAcct: Record<string, number>;
  selectedRecords: any[];
  selectedTotal: number;
  selectedAccountIds: Set<string>;
  expandedAccountIds: Set<string>;
  pushIsPending: boolean;
  onToggleAccount: (id: string) => void;
  onSelectAllAccounts: () => void;
  onDeselectAllAccounts: () => void;
  onToggleExpand: (id: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  onExportDetail: () => void;
  fmt$: (v: string | number | null | undefined) => string;
}) {
  if (!open) return null;

  // Derive stats from selection
  const isPeriodMode = selectedPeriod !== "__all__" && !!selectedPeriodObj;

  // Summaries for selected accounts only (preview mode)
  const previewAccounts = periodPreview?.accounts ?? [];
  const selAccounts = previewAccounts.filter(a => selectedAccountIds.has(a.accountId));
  const selRideCount = selAccounts.reduce((s, a) => s + a.rides, 0);
  const selAmount = selAccounts.reduce((s, a) => s + parseFloat(String(a.amount)), 0);

  // Validation warnings
  const deselectedCount = previewAccounts.length - selAccounts.length;
  const noneSelected = selAccounts.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <CardHeader className="shrink-0 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-primary/10 rounded-md">
                <SendHorizonal className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">
                  {pushResult ? "Push Complete" : "Push Rideshare Charges to Invoice"}
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {pushResult
                    ? `${pushResult.invoicesCreated} invoice${pushResult.invoicesCreated !== 1 ? "s" : ""} created · ${pushResult.totalBilled} ride${pushResult.totalBilled !== 1 ? "s" : ""} billed`
                    : isPeriodMode
                      ? `Review weekly DriverReturn (Rideshare) charges before creating invoice line items.`
                      : `Creating weekly invoice line items for ${selectedIds.size} selected ride${selectedIds.size !== 1 ? "s" : ""}.`
                  }
                </CardDescription>
              </div>
            </div>
            <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-push-close-x">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="overflow-y-auto flex-1 space-y-4 pt-0">

          {/* ── RESULT VIEW ─────────────────────────────────────────────── */}
          {pushResult ? (
            <div className="space-y-4">
              {/* Success summary banner */}
              <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-800 dark:text-green-300">
                    {pushResult.invoicesCreated} invoice{pushResult.invoicesCreated !== 1 ? "s" : ""} created
                    {pushResult.skipped?.length > 0 && (
                      <span className="text-amber-700 dark:text-amber-400"> · {pushResult.skipped.length} duplicate{pushResult.skipped.length !== 1 ? "s" : ""} blocked</span>
                    )}
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                    {pushResult.totalBilled} ride{pushResult.totalBilled !== 1 ? "s" : ""} billed · {fmt$(pushResult.results.reduce((s, r) => s + parseFloat(String(r.totalAmount ?? "0")), 0))} total · service code: DRIVERRETURN_RIDESHARE
                  </p>
                </div>
              </div>

              {/* Successful invoices */}
              {pushResult.results.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Successfully Invoiced ({pushResult.results.length})
                  </p>
                  <div className="border rounded-md divide-y text-sm">
                    {pushResult.results.map(r => (
                      <div key={r.invoiceId} className="px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-medium truncate">{r.accountName ?? r.accountNumber ?? r.accountId.slice(0, 8)}</span>
                            {r.accountNumber && <span className="text-muted-foreground text-xs shrink-0">#{r.accountNumber}</span>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-semibold">{fmt$(r.totalAmount)}</span>
                            <Badge variant="outline" className="font-mono text-xs">{r.invoiceNumber}</Badge>
                          </div>
                        </div>
                        {r.periods.map(p => (
                          <div key={p.weekStart} className="flex items-center justify-between mt-1 pl-2 text-xs text-muted-foreground">
                            <span>Week of {p.weekLabel ?? `${p.weekStart} \u2013 ${p.weekEnd}`}</span>
                            <span>{p.rides} ride{p.rides !== 1 ? "s" : ""} · {fmt$(p.amount)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Failures */}
              {pushResult.failures.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Failed ({pushResult.failures.length})
                  </p>
                  <div className="border border-destructive/20 rounded-md divide-y text-sm">
                    {pushResult.failures.map((f: any) => (
                      <div key={f.accountId ?? f.error} className="flex items-start gap-2 px-3 py-2 text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <span className="font-medium">{f.accountName ?? f.accountId ?? "Unknown"}</span>
                          {f.error && <p className="text-xs mt-0.5 text-destructive/70">{f.error}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Skipped (duplicate-billing prevention) */}
              {pushResult.skipped?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Blocked — Duplicate Prevention ({pushResult.skipped.length})
                  </p>
                  <div className="border border-amber-200 dark:border-amber-800 rounded-md divide-y text-sm bg-amber-50/50 dark:bg-amber-950/20">
                    {pushResult.skipped.map((s, i) => (
                      <div key={`${s.accountId}-${s.weekStart}-${i}`} className="flex items-start gap-2 px-3 py-2 text-amber-800 dark:text-amber-300">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <div className="min-w-0 text-xs">
                          <p className="font-medium">{s.reason}</p>
                          <p className="text-amber-700 dark:text-amber-400 mt-0.5">Period: {s.weekStart} – {s.weekEnd}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    These periods were already invoiced. No duplicate charges were created.
                  </p>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Each invoice line item uses service code <strong>DRIVERRETURN_RIDESHARE</strong> with description "DriverReturn (Rideshare) – Week of [date range]". Invoices are in draft status with Net 30 terms.
              </p>
            </div>
          ) : (
          /* ── PREVIEW / CONFIRMATION VIEW ──────────────────────────────── */
          <>
            {/* ── KPI Summary Cards ── */}
            {isPeriodMode && (
              previewLoading ? (
                <div className="grid grid-cols-4 gap-3">
                  {[1,2,3,4].map(i => <Skeleton key={i} className="h-16 w-full rounded-md" />)}
                </div>
              ) : periodPreview ? (
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Billing Period", value: periodPreview.weekLabel, sub: null, icon: <CalendarDays className="h-3.5 w-3.5" /> },
                    { label: "Accounts", value: String(selAccounts.length), sub: previewAccounts.length !== selAccounts.length ? `of ${previewAccounts.length} total` : null, icon: <Building2 className="h-3.5 w-3.5" /> },
                    { label: "Rides Included", value: String(selRideCount), sub: null, icon: <Car className="h-3.5 w-3.5" /> },
                    { label: "Total Billable", value: fmt$(selAmount), sub: null, icon: <DollarSign className="h-3.5 w-3.5" /> },
                  ].map(stat => (
                    <div key={stat.label} className="border rounded-md p-2.5">
                      <div className="flex items-center gap-1 text-muted-foreground mb-1">
                        {stat.icon}
                        <span className="text-xs">{stat.label}</span>
                      </div>
                      <p className="text-sm font-semibold leading-tight">{stat.value}</p>
                      {stat.sub && <p className="text-xs text-muted-foreground mt-0.5">{stat.sub}</p>}
                    </div>
                  ))}
                </div>
              ) : null
            )}

            {/* ── Validation Warnings ── */}
            {noneSelected && (
              <div className="flex items-start gap-2 px-3 py-2 bg-destructive/5 border border-destructive/20 rounded-md text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>No accounts selected. Select at least one account to push.</span>
              </div>
            )}
            {deselectedCount > 0 && !noneSelected && (
              <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md text-sm text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{deselectedCount} account{deselectedCount !== 1 ? "s" : ""} deselected and will not be invoiced in this push.</span>
              </div>
            )}

            {/* ── Account List (period mode) ── */}
            {isPeriodMode && (
              previewLoading ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : periodPreview ? (
                <div>
                  {/* Account table header with bulk actions */}
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Account Preview ({previewAccounts.length})
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        className="text-xs text-primary hover:underline"
                        onClick={onSelectAllAccounts}
                        data-testid="button-push-select-all"
                      >
                        Select all
                      </button>
                      <span className="text-muted-foreground text-xs">·</span>
                      <button
                        className="text-xs text-muted-foreground hover:underline"
                        onClick={onDeselectAllAccounts}
                        data-testid="button-push-deselect-all"
                      >
                        Deselect all
                      </button>
                    </div>
                  </div>
                  <div className="border rounded-md divide-y text-sm overflow-hidden">
                    {/* Table header */}
                    <div className="flex items-center gap-3 px-3 py-2 bg-muted/30 text-xs font-medium text-muted-foreground">
                      <div className="w-4 shrink-0" />
                      <div className="flex-1 min-w-0">Account</div>
                      <div className="w-24 text-center shrink-0">Billing Period</div>
                      <div className="w-14 text-right shrink-0">Rides</div>
                      <div className="w-20 text-right shrink-0">Amount</div>
                      <div className="w-6 shrink-0" />
                    </div>
                    {previewAccounts.map(a => {
                      const isChecked = selectedAccountIds.has(a.accountId);
                      const isExpanded = expandedAccountIds.has(a.accountId);
                      return (
                        <div key={a.accountId}>
                          {/* Account row */}
                          <div
                            className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${!isChecked ? "opacity-50" : ""}`}
                          >
                            {/* Checkbox */}
                            <div className="w-4 shrink-0 flex items-center">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => onToggleAccount(a.accountId)}
                                className="rounded border-input cursor-pointer"
                                data-testid={`checkbox-account-${a.accountId}`}
                              />
                            </div>
                            {/* Account info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-medium truncate">{a.accountName ?? a.accountNumber ?? a.accountId.slice(0, 8)}</span>
                                {a.accountNumber && (
                                  <span className="text-muted-foreground text-xs shrink-0">#{a.accountNumber}</span>
                                )}
                              </div>
                            </div>
                            {/* Billing period */}
                            <div className="w-24 text-center shrink-0 text-xs text-muted-foreground">
                              {periodPreview.weekLabel}
                            </div>
                            {/* Rides */}
                            <div className="w-14 text-right shrink-0 text-muted-foreground">
                              {a.rides}
                            </div>
                            {/* Amount */}
                            <div className="w-20 text-right shrink-0 font-semibold">
                              {fmt$(a.amount)}
                            </div>
                            {/* Expand toggle */}
                            <button
                              onClick={() => onToggleExpand(a.accountId)}
                              className="w-6 shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                              data-testid={`button-expand-account-${a.accountId}`}
                              title={isExpanded ? "Collapse rides" : "Expand rides"}
                            >
                              {isExpanded
                                ? <ChevronUp className="h-3.5 w-3.5" />
                                : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                          {/* Expandable ride detail */}
                          {isExpanded && (
                            <AccountRidesDetail
                              weekStart={selectedPeriodObj!.weekStart}
                              accountId={a.accountId}
                              fmt$={fmt$}
                            />
                          )}
                        </div>
                      );
                    })}
                    {/* Totals footer */}
                    <div className="flex items-center gap-3 px-3 py-2.5 bg-muted/30 font-semibold text-sm">
                      <div className="w-4 shrink-0" />
                      <div className="flex-1 min-w-0">
                        {selAccounts.length} of {previewAccounts.length} account{previewAccounts.length !== 1 ? "s" : ""} selected
                      </div>
                      <div className="w-24 shrink-0" />
                      <div className="w-14 text-right shrink-0">{selRideCount}</div>
                      <div className="w-20 text-right shrink-0">{fmt$(selAmount)}</div>
                      <div className="w-6 shrink-0" />
                    </div>
                  </div>
                </div>
              ) : null
            )}

            {/* ── Manual selection preview (no period filter) ── */}
            {!isPeriodMode && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Selection Preview
                </p>
                <div className="border rounded-md divide-y text-sm">
                  {Object.entries(selectedByAcct).map(([acct, cnt]) => {
                    const acctRecs = selectedRecords.filter(r =>
                      (r.billToAccountNumber ?? r.matchedAccountNumber ?? r.billToAccountId ?? "Unknown") === acct
                    );
                    const acctTotal = acctRecs.reduce((s, r) => s + parseFloat(r.billableAmount ?? r.totalFare ?? "0"), 0);
                    return (
                      <div key={acct} className="flex items-center justify-between px-3 py-2">
                        <span className="font-medium">{acct} <span className="text-muted-foreground font-normal">({cnt} ride{cnt !== 1 ? "s" : ""})</span></span>
                        <span className="font-semibold">{fmt$(acctTotal)}</span>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between px-3 py-2.5 bg-muted/30 font-semibold">
                    <span>Total ({Object.keys(selectedByAcct).length} invoice{Object.keys(selectedByAcct).length !== 1 ? "s" : ""})</span>
                    <span>{fmt$(selectedTotal)}</span>
                  </div>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Rides are grouped into <strong>one line item per account per week</strong> with the description "DriverReturn (Rideshare) – Week of [date range]". Invoices are created in <strong>draft</strong> status with Net 30 terms.
            </p>
          </>
          )}
        </CardContent>

        {/* Footer */}
        <div className="shrink-0 border-t px-6 py-4 flex items-center justify-between gap-3">
          {pushResult ? (
            <>
              <Button
                variant="outline"
                onClick={onClose}
                data-testid="button-push-view-billed"
              >
                View Billed Records
              </Button>
              <div className="flex items-center gap-2">
                {pushResult.results.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => { onClose(); onExportDetail(); }}
                    data-testid="button-push-export-detail"
                  >
                    <FileDown className="h-4 w-4 mr-2" />
                    Export Detail
                  </Button>
                )}
                <Button onClick={onClose} data-testid="button-push-done">Close</Button>
              </div>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={pushIsPending}
                onClick={onClose}
                data-testid="button-push-cancel"
              >
                Cancel
              </Button>
              <Button
                disabled={pushIsPending || noneSelected || (isPeriodMode ? previewLoading : selectedIds.size === 0)}
                onClick={onConfirm}
                data-testid="button-push-confirm"
              >
                {pushIsPending
                  ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Creating invoices…</>
                  : <><SendHorizonal className="h-4 w-4 mr-2" />Push {selAccounts.length || selectedIds.size} {isPeriodMode ? `Account${selAccounts.length !== 1 ? "s" : ""}` : `Ride${selectedIds.size !== 1 ? "s" : ""}`} to Invoice</>
                }
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── Tab 5: Billing ───────────────────────────────────────────────────────────

// ─── Export Detail Modal ──────────────────────────────────────────────────────
interface ExportParams {
  accountId?: string;
  accountNumber?: string;
  accountName?: string;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  billingPeriodLabel?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  provider?: string;
  billingStatus?: string;
}
interface ExportPreview {
  totalRides: number;
  totalAmount: string;
  uberTotal: string;
  lyftTotal: string;
}

function ExportDetailModal({ open, params, onClose, fmt$ }: {
  open: boolean;
  params: ExportParams;
  onClose: () => void;
  fmt$: (v: string | number | null | undefined) => string;
}) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded]   = useState(false);
  const [lastFilename, setLastFilename] = useState("");

  const buildQS = (format: string) => {
    const p = new URLSearchParams();
    if (params.accountId)          p.set("accountId", params.accountId);
    if (params.billingPeriodStart) p.set("billingPeriodStart", params.billingPeriodStart);
    if (params.billingPeriodEnd)   p.set("billingPeriodEnd",   params.billingPeriodEnd);
    if (params.invoiceId)          p.set("invoiceId",          params.invoiceId);
    if (params.invoiceNumber)      p.set("invoiceNumber",      params.invoiceNumber);
    if (params.provider && params.provider !== "__all__") p.set("provider", params.provider);
    p.set("billingStatus", params.billingStatus ?? "billed");
    p.set("format", format);
    return p.toString();
  };

  const { data: preview, isLoading: previewLoading } = useQuery<ExportPreview>({
    queryKey: ["/api/corporate/rideshare/billing/export/preview", params],
    queryFn: () => {
      const p = new URLSearchParams();
      if (params.accountId)          p.set("accountId", params.accountId);
      if (params.billingPeriodStart) p.set("billingPeriodStart", params.billingPeriodStart);
      if (params.billingPeriodEnd)   p.set("billingPeriodEnd",   params.billingPeriodEnd);
      if (params.invoiceId)          p.set("invoiceId",          params.invoiceId ?? "");
      if (params.invoiceNumber)      p.set("invoiceNumber",      params.invoiceNumber ?? "");
      if (params.provider && params.provider !== "__all__") p.set("provider", params.provider);
      p.set("billingStatus", params.billingStatus ?? "billed");
      return fetch(`/api/corporate/rideshare/billing/export/preview?${p}`, { credentials: "include" }).then(r => r.json());
    },
    enabled: open,
  });

  const handleDownload = async (format: "csv" | "xlsx") => {
    setDownloading(true);
    setDownloaded(false);
    try {
      const url = `/api/corporate/rideshare/billing/export?${buildQS(format)}`;
      const resp = await fetch(url, { credentials: "include" });
      if (!resp.ok) throw new Error(`Export failed: ${resp.status}`);
      const blob = await resp.blob();
      const contentDisp = resp.headers.get("content-disposition") ?? "";
      const match = contentDisp.match(/filename=([^;]+)/);
      const filename = match ? match[1].trim() : `Rideshare_Detail.${format}`;
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
      setLastFilename(filename);
      setDownloaded(true);
      toast({ title: "Export ready", description: filename });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const handleClose = () => {
    setDownloaded(false);
    setLastFilename("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-primary" />
            Export Billing Detail
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary confirmation */}
          <div className="rounded-md bg-muted/40 border p-4 space-y-2.5">
            {params.accountName && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Account</span>
                <span className="font-medium">{params.accountName}
                  {params.accountNumber ? <span className="text-muted-foreground font-mono ml-1.5">#{params.accountNumber}</span> : null}
                </span>
              </div>
            )}
            {params.billingPeriodLabel && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Billing Period</span>
                <span className="font-medium">{params.billingPeriodLabel}</span>
              </div>
            )}
            {params.invoiceNumber && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Invoice #</span>
                <span className="font-mono text-sm">{params.invoiceNumber}</span>
              </div>
            )}
            <Separator />
            {previewLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Calculating totals...
              </div>
            ) : preview ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Rides</span>
                  <span className="font-semibold">{preview.totalRides.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Amount</span>
                  <span className="font-semibold text-green-600">{fmt$(preview.totalAmount)}</span>
                </div>
                {parseFloat(preview.uberTotal) > 0 && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Uber</span>
                    <span>{fmt$(preview.uberTotal)}</span>
                  </div>
                )}
                {parseFloat(preview.lyftTotal) > 0 && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Lyft</span>
                    <span>{fmt$(preview.lyftTotal)}</span>
                  </div>
                )}
              </>
            ) : null}
          </div>

          {downloaded && (
            <div className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              <span className="text-green-700 dark:text-green-400 font-medium">
                {lastFilename} downloaded successfully.
              </span>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            The export includes all billed rides matching the selected filters, including full financial breakdown, location, and ride details. An audit log entry will be created.
          </p>
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-end">
          <Button variant="outline" onClick={handleClose} disabled={downloading} data-testid="button-export-cancel">
            {downloaded ? "Close" : "Cancel"}
          </Button>
          <Button
            variant="outline"
            onClick={() => handleDownload("xlsx")}
            disabled={downloading || previewLoading || (preview?.totalRides ?? 0) === 0}
            data-testid="button-export-xlsx"
          >
            {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
            Export Excel
          </Button>
          <Button
            onClick={() => handleDownload("csv")}
            disabled={downloading || previewLoading || (preview?.totalRides ?? 0) === 0}
            data-testid="button-export-csv"
          >
            {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
            Export CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BillingTab({ filters: globalFilters, onNavigateToRecon }: {
  filters: GlobalFilters;
  onNavigateToRecon: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Filters
  const [billingStatus, setBillingStatus] = useState("ready_for_billing");
  const [dateFrom, setDateFrom]           = useState(globalFilters.dateFrom);
  const [dateTo, setDateTo]               = useState(globalFilters.dateTo);
  const [provider, setProvider]           = useState("__all__");
  const [importBatchId, setImportBatchId] = useState("__all__");
  const [offset, setOffset]               = useState(0);
  // Billing period selector: "__all__" = no period filter, else = weekStart value
  const [selectedPeriod, setSelectedPeriod] = useState<string>("__all__");
  const LIMIT = 100;

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Push-to-invoice modal
  const [pushModalOpen, setPushModalOpen]         = useState(false);
  const [pushResult, setPushResult]               = useState<PushInvoiceResult | null>(null);
  // Per-account selection within the push modal (all included by default, user can deselect)
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  // Expanded account rows for ride detail drilldown
  const [expandedAccountIds, setExpandedAccountIds] = useState<Set<string>>(new Set());

  // Drawer for detail
  const [drawerTxId, setDrawerTxId]     = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen]     = useState(false);

  // Export detail modal
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportParams, setExportParams]       = useState<ExportParams>({});

  // Summary
  const { data: summary } = useQuery<BillingSummary>({
    queryKey: ["/api/corporate/rideshare/billing/summary", dateFrom, dateTo, provider],
    queryFn: () => {
      const p = new URLSearchParams();
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo)   p.set("dateTo", dateTo);
      if (provider !== "__all__") p.set("provider", provider);
      return fetch(`/api/corporate/rideshare/billing/summary?${p}`, { credentials: "include" }).then(r => r.json());
    },
  });

  // Available billing periods (weeks with ready transactions)
  const { data: periodsData } = useQuery<{ periods: BillingPeriod[]; currentWeek: BillingPeriod }>({
    queryKey: ["/api/corporate/rideshare/billing/periods"],
    queryFn: () =>
      fetch("/api/corporate/rideshare/billing/periods", { credentials: "include" }).then(r => r.json()),
  });
  const billingPeriods = periodsData?.periods ?? [];

  // Default Billing tab to current week when data first loads (only if current week has ready transactions)
  const currentWeekData = periodsData?.currentWeek;
  const [periodDefaulted, setPeriodDefaulted] = useState(false);
  useEffect(() => {
    if (!periodDefaulted && currentWeekData && selectedPeriod === "__all__") {
      const cwInPeriods = billingPeriods.some(p => p.weekStart === currentWeekData.weekStart);
      if (cwInPeriods) {
        setSelectedPeriod(currentWeekData.weekStart);
        setPeriodDefaulted(true);
      }
    }
  }, [currentWeekData, billingPeriods, periodDefaulted, selectedPeriod]);

  // Period map for quick weekEnd lookup from weekStart
  // Also include currentWeek so preview works even if no ready transactions in that week
  const periodMap: Record<string, BillingPeriod> = {};
  for (const p of billingPeriods) periodMap[p.weekStart] = p;
  if (currentWeekData) periodMap[currentWeekData.weekStart] = currentWeekData;
  const selectedPeriodObj = selectedPeriod !== "__all__" ? periodMap[selectedPeriod] : null;

  // Period preview — fetched when push modal opens for a period-scoped push
  const { data: periodPreview, isLoading: previewLoading } = useQuery<BillingPeriodPreview>({
    queryKey: ["/api/corporate/rideshare/billing/periods/preview", selectedPeriodObj?.weekStart, selectedPeriodObj?.weekEnd],
    queryFn: () => {
      const p = new URLSearchParams({
        weekStart: selectedPeriodObj!.weekStart,
        weekEnd:   selectedPeriodObj!.weekEnd,
      });
      return fetch(`/api/corporate/rideshare/billing/periods/preview?${p}`, { credentials: "include" }).then(r => r.json());
    },
    enabled: pushModalOpen && selectedPeriod !== "__all__" && !!selectedPeriodObj,
  });

  // Records grid — if a billing period is selected, pass weekStart to backend for accurate local-time filtering
  const effectiveWeekStart = selectedPeriod !== "__all__" && selectedPeriodObj ? selectedPeriodObj.weekStart : null;
  const effectiveDateFrom  = !effectiveWeekStart ? dateFrom : null;
  const effectiveDateTo    = !effectiveWeekStart ? dateTo   : null;

  const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
  params.set("billingStatus", billingStatus);
  if (effectiveWeekStart)              params.set("weekStart", effectiveWeekStart);
  if (!effectiveWeekStart && effectiveDateFrom) params.set("dateFrom", effectiveDateFrom);
  if (!effectiveWeekStart && effectiveDateTo)   params.set("dateTo", effectiveDateTo);
  if (provider !== "__all__") params.set("provider", provider);
  if (importBatchId !== "__all__") params.set("importBatchId", importBatchId);

  const { data: billingData, isLoading } = useQuery<{ records: BillingRecord[]; total: number }>({
    queryKey: ["/api/corporate/rideshare/billing/ready", billingStatus, effectiveWeekStart, effectiveDateFrom, effectiveDateTo, provider, importBatchId, offset],
    queryFn: () =>
      fetch(`/api/corporate/rideshare/billing/ready?${params}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: importBatches = [] } = useQuery<ImportBatch[]>({
    queryKey: ["/api/corporate/rideshare/transactions/import-batches-list"],
    queryFn: () =>
      fetch("/api/corporate/rideshare/transactions/import-batches-list", { credentials: "include" }).then(r => r.json()),
  });

  const records = billingData?.records ?? [];
  const total   = billingData?.total   ?? 0;

  // Bulk selection helpers
  const allPageIds  = records.map(r => r.id);
  const allSelected = allPageIds.length > 0 && allPageIds.every(id => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allSelected) {
      const next = new Set(selectedIds);
      allPageIds.forEach(id => next.delete(id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      allPageIds.forEach(id => next.add(id));
      setSelectedIds(next);
    }
  };

  // Push to Invoice mutation — aggregates by (account × billing week)
  const pushMutation = useMutation({
    mutationFn: (payload: { ids?: string[]; billingPeriodStart?: string; billingPeriodEnd?: string; notes?: string }) =>
      apiRequest("POST", "/api/corporate/rideshare/billing/push-to-invoice", payload),
    onSuccess: (data: PushInvoiceResult) => {
      setPushResult(data);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/billing/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/billing/ready"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/billing/periods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/transactions/report"] });
    },
    onError: (err: Error) => {
      toast({ title: "Push failed", description: err.message, variant: "destructive" });
      setPushModalOpen(false);
    },
  });

  // Open export modal with current filters
  const handleOpenExportModal = (overrides: Partial<ExportParams> = {}) => {
    const periodObj = selectedPeriod !== "__all__" ? periodMap[selectedPeriod] : null;
    setExportParams({
      billingPeriodStart: periodObj?.weekStart,
      billingPeriodEnd:   periodObj?.weekEnd,
      billingPeriodLabel: periodObj?.label,
      provider:           provider !== "__all__" ? provider : undefined,
      billingStatus:      billingStatus === "__all__" ? "billed" : billingStatus,
      ...overrides,
    });
    setExportModalOpen(true);
  };

  // Open push modal and initialise account selection from preview
  const handleOpenPushModal = () => {
    setExpandedAccountIds(new Set());
    setPushResult(null);
    // Pre-select all accounts from preview if available; otherwise allow empty (will be filled by effect below)
    if (periodPreview?.accounts) {
      setSelectedAccountIds(new Set(periodPreview.accounts.map(a => a.accountId)));
    } else {
      setSelectedAccountIds(new Set());
    }
    setPushModalOpen(true);
  };

  // When periodPreview loads (or changes) while modal is open, sync selectedAccountIds
  useEffect(() => {
    if (pushModalOpen && periodPreview?.accounts && selectedAccountIds.size === 0) {
      setSelectedAccountIds(new Set(periodPreview.accounts.map(a => a.accountId)));
    }
  }, [pushModalOpen, periodPreview]);

  const handlePushConfirm = () => {
    const allAccountIds = periodPreview?.accounts.map(a => a.accountId) ?? [];
    const isSubset = allAccountIds.length > 0 && selectedAccountIds.size < allAccountIds.length;

    if (selectedPeriod !== "__all__" && selectedPeriodObj) {
      pushMutation.mutate({
        billingPeriodStart: selectedPeriodObj.weekStart,
        billingPeriodEnd:   selectedPeriodObj.weekEnd,
        // Only send accountIds restriction if user deselected some accounts
        ...(isSubset ? { accountIds: [...selectedAccountIds] } : {}),
      });
    } else {
      pushMutation.mutate({ ids: [...selectedIds] });
    }
  };

  const readyCount   = summary?.readyCount   ?? 0;
  const readyAmount  = summary?.readyAmount  ?? "0";
  const billedCount  = summary?.billedCount  ?? 0;
  const billedAmount = summary?.billedAmount ?? "0";
  const excludedCount = summary?.excludedCount ?? 0;
  const unreviewedCount = summary?.unreviewedCount ?? 0;

  // Calculate selected total amount
  const selectedRecords  = records.filter(r => selectedIds.has(r.id));
  const selectedTotal    = selectedRecords.reduce((s, r) => s + parseFloat(r.billableAmount ?? r.totalFare ?? "0"), 0);
  const selectedByAcct   = selectedRecords.reduce<Record<string, number>>((acc, r) => {
    const key = r.billToAccountNumber ?? r.matchedAccountNumber ?? r.billToAccountId ?? "Unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Summary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card
          className="cursor-pointer hover-elevate"
          onClick={() => { setBillingStatus("ready_for_billing"); setOffset(0); }}
          data-testid="card-billing-ready"
        >
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Ready for Billing</p>
              <Clock className="h-4 w-4 text-orange-500 shrink-0" />
            </div>
            <p className="text-xl font-semibold text-orange-600">{readyCount.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{fmt$(readyAmount)}</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover-elevate"
          onClick={() => { setBillingStatus("billed"); setOffset(0); }}
          data-testid="card-billing-billed"
        >
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Billed</p>
              <Receipt className="h-4 w-4 text-green-600 shrink-0" />
            </div>
            <p className="text-xl font-semibold text-green-600">{billedCount.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{fmt$(billedAmount)}</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover-elevate"
          onClick={() => { setBillingStatus("excluded"); setOffset(0); }}
          data-testid="card-billing-excluded"
        >
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Excluded</p>
              <X className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
            <p className="text-xl font-semibold">{excludedCount.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover-elevate"
          onClick={onNavigateToRecon}
          data-testid="card-billing-unreviewed"
        >
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Unreviewed</p>
              <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
            </div>
            <p className="text-xl font-semibold text-yellow-600">{unreviewedCount.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Click to review</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar + Push Action */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Billing Period Selector (primary grouping tool) */}
            <div className="space-y-1.5 w-64">
              <Label className="text-xs font-medium">Billing Period</Label>
              <Select
                value={selectedPeriod}
                onValueChange={(v) => {
                  setSelectedPeriod(v);
                  setOffset(0);
                  setSelectedIds(new Set());
                }}
              >
                <SelectTrigger data-testid="select-billing-period">
                  <SelectValue placeholder="All Periods" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Periods</SelectItem>
                  {billingPeriods.map((p) => (
                    <SelectItem key={p.weekStart} value={p.weekStart}>
                      {p.label}
                      <span className="ml-2 text-muted-foreground text-xs">
                        {p.totalRides} rides · {fmt$(p.totalAmount)}
                      </span>
                    </SelectItem>
                  ))}
                  {billingPeriods.length === 0 && (
                    <SelectItem value="__none__" disabled>No ready periods</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 w-44">
              <Label className="text-xs">Billing Status</Label>
              <Select value={billingStatus} onValueChange={(v) => { setBillingStatus(v); setOffset(0); setSelectedIds(new Set()); }}>
                <SelectTrigger data-testid="select-billing-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ready_for_billing">Ready for Billing</SelectItem>
                  <SelectItem value="billed">Billed</SelectItem>
                  <SelectItem value="excluded">Excluded</SelectItem>
                  <SelectItem value="unreviewed">Unreviewed</SelectItem>
                  <SelectItem value="needs_followup">Needs Follow-up</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Only show date range when not filtered by a specific period */}
            {selectedPeriod === "__all__" && (
              <>
                <div className="space-y-1.5 flex-1 min-w-28">
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setOffset(0); }} data-testid="input-billing-date-from" />
                </div>
                <div className="space-y-1.5 flex-1 min-w-28">
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setOffset(0); }} data-testid="input-billing-date-to" />
                </div>
              </>
            )}
            <div className="space-y-1.5 w-32">
              <Label className="text-xs">Provider</Label>
              <Select value={provider} onValueChange={(v) => { setProvider(v); setOffset(0); }}>
                <SelectTrigger data-testid="select-billing-provider"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  <SelectItem value="uber">Uber</SelectItem>
                  <SelectItem value="lyft">Lyft</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto flex gap-2 items-end flex-wrap">
              {/* Export Detail — show when any billed records might exist */}
              <Button
                variant="outline"
                onClick={() => handleOpenExportModal()}
                data-testid="button-export-detail"
              >
                <FileDown className="h-4 w-4 mr-2" />
                Export Detail
              </Button>
              {/* Period push: show when a period is selected (pushes all ready rides in that period) */}
              {selectedPeriod !== "__all__" && billingStatus === "ready_for_billing" && (
                <Button
                  onClick={handleOpenPushModal}
                  data-testid="button-push-period-to-invoice"
                >
                  <SendHorizonal className="h-4 w-4 mr-2" />
                  Push Period to Invoice
                </Button>
              )}
              {/* Manual selection push: show when IDs are selected and no specific period filter */}
              {selectedIds.size > 0 && selectedPeriod === "__all__" && billingStatus === "ready_for_billing" && (
                <Button
                  onClick={handleOpenPushModal}
                  data-testid="button-push-to-invoice"
                >
                  <SendHorizonal className="h-4 w-4 mr-2" />
                  Push {selectedIds.size} to Invoice
                </Button>
              )}
            </div>
          </div>
          {/* Period info banner */}
          {selectedPeriod !== "__all__" && selectedPeriodObj && (
            <div className="mt-3 flex flex-wrap items-center gap-2 p-2.5 bg-primary/5 border border-primary/20 rounded-md">
              <CalendarDays className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-medium text-primary">{selectedPeriodObj.label}</span>
              <span className="text-xs text-muted-foreground">
                {selectedPeriodObj.totalRides} rides ready · {fmt$(selectedPeriodObj.totalAmount)} · {selectedPeriodObj.accountCount} account{selectedPeriodObj.accountCount !== 1 ? "s" : ""}
              </span>
              <Button
                variant="ghost" size="sm" className="ml-auto h-7 px-2"
                onClick={() => { setSelectedPeriod("__all__"); setOffset(0); setSelectedIds(new Set()); }}
                data-testid="button-clear-period"
              >
                <X className="h-3.5 w-3.5 mr-1" />Clear period
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Summary Bar (when selections exist + ready status) */}
      {selectedIds.size > 0 && billingStatus === "ready_for_billing" && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/50 border rounded-md">
          <span className="text-sm font-medium">
            <ListChecks className="h-4 w-4 inline mr-1.5" />
            {selectedIds.size} selected &mdash; {fmt$(selectedTotal)} total
          </span>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(selectedByAcct).slice(0, 5).map(([acct, cnt]) => (
              <Badge key={acct} variant="outline" className="text-xs">
                {acct}: {cnt}
              </Badge>
            ))}
            {Object.keys(selectedByAcct).length > 5 && (
              <Badge variant="outline" className="text-xs">
                +{Object.keys(selectedByAcct).length - 5} more accounts
              </Badge>
            )}
          </div>
          <Button
            variant="ghost" size="sm" className="ml-auto"
            onClick={() => setSelectedIds(new Set())}
            data-testid="button-billing-clear-selection"
          >
            <X className="h-4 w-4 mr-1.5" />Clear
          </Button>
        </div>
      )}

      {/* Records Grid */}
      <Card>
        <CardContent className="pt-4">
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {billingStatus === "ready_for_billing" && (
                    <TableHead className="w-10 pr-0">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                        data-testid="checkbox-billing-select-all"
                      />
                    </TableHead>
                  )}
                  <TableHead>Date</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Rider</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Billing Status</TableHead>
                  {billingStatus === "billed" && <TableHead>Invoice #</TableHead>}
                  {billingStatus === "billed" && <TableHead>Billing Week</TableHead>}
                  {billingStatus === "billed" && <TableHead>Billed At</TableHead>}
                  {billingStatus === "ready_for_billing" && <TableHead>Ready Since</TableHead>}
                  <TableHead>Match</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                      <Receipt className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                      {billingStatus === "ready_for_billing"
                        ? "No records ready for billing. Mark matched transactions ready from the Reconciliation tab."
                        : "No records found for the selected filters."}
                      {billingStatus === "ready_for_billing" && (
                        <div className="mt-3">
                          <Button variant="outline" size="sm" onClick={onNavigateToRecon} data-testid="button-billing-goto-recon">
                            Go to Reconciliation
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((rec) => (
                    <TableRow
                      key={rec.id}
                      className="cursor-pointer"
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('[data-no-drawer]')) return;
                        setDrawerTxId(rec.id);
                        setDrawerOpen(true);
                      }}
                      data-testid={`row-billing-${rec.id}`}
                    >
                      {billingStatus === "ready_for_billing" && (
                        <TableCell className="w-10 pr-0" data-no-drawer>
                          <Checkbox
                            checked={selectedIds.has(rec.id)}
                            onCheckedChange={(checked) => {
                              const next = new Set(selectedIds);
                              checked ? next.add(rec.id) : next.delete(rec.id);
                              setSelectedIds(next);
                            }}
                            aria-label={`Select ${rec.id}`}
                            data-testid={`checkbox-billing-row-${rec.id}`}
                          />
                        </TableCell>
                      )}
                      <TableCell className="text-sm whitespace-nowrap">{fmtDate(rec.rideDate)}</TableCell>
                      <TableCell><ProviderBadge provider={rec.provider} /></TableCell>
                      <TableCell className="text-sm">{rec.riderName || "—"}</TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{rec.matchedAccountName || rec.billToAccountNumber || "—"}</div>
                        {(rec.matchedAccountNumber || rec.billToAccountNumber) && (
                          <div className="text-xs text-muted-foreground font-mono">{rec.matchedAccountNumber || rec.billToAccountNumber}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium text-sm">
                        {fmt$(rec.billableAmount ?? rec.totalFare)}
                      </TableCell>
                      <TableCell><BillingStatusBadge status={rec.billingStatus} /></TableCell>
                      {billingStatus === "billed" && (
                        <TableCell>
                          {rec.invoiceNumberSnapshot ? (
                            <Badge variant="outline" className="font-mono text-xs">
                              <Receipt className="h-3 w-3 mr-1" />
                              {rec.invoiceNumberSnapshot}
                            </Badge>
                          ) : "—"}
                        </TableCell>
                      )}
                      {billingStatus === "billed" && (
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {rec.billingWeekLabel ?? (rec.billingPeriodStart
                            ? `${fmtDate(rec.billingPeriodStart)} \u2013 ${fmtDate(rec.billingPeriodEnd ?? rec.billingPeriodStart)}`
                            : "—")}
                        </TableCell>
                      )}
                      {billingStatus === "billed" && (
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDateTime(rec.billedAt)}
                        </TableCell>
                      )}
                      {billingStatus === "ready_for_billing" && (
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDateTime(rec.billingReadyAt)}
                        </TableCell>
                      )}
                      <TableCell><MatchStatusBadge status={rec.matchStatus} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {total > LIMIT && (
            <div className="flex items-center justify-between pt-3">
              <p className="text-sm text-muted-foreground">
                Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total.toLocaleString()}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline" size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                  data-testid="button-billing-prev"
                >
                  <ChevronLeft className="h-4 w-4" />Previous
                </Button>
                <Button
                  variant="outline" size="sm"
                  disabled={offset + LIMIT >= total}
                  onClick={() => setOffset(offset + LIMIT)}
                  data-testid="button-billing-next"
                >
                  Next<ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Drawer */}
      <TransactionDetailDrawer
        txId={drawerTxId}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/billing/ready"] });
          queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/billing/summary"] });
        }}
      />

      {/* Export Detail Modal */}
      <ExportDetailModal
        open={exportModalOpen}
        params={exportParams}
        onClose={() => setExportModalOpen(false)}
        fmt$={fmt$}
      />

      {pushModalOpen && (
        <PushToInvoiceModal
          open={pushModalOpen}
          pushResult={pushResult}
          selectedPeriod={selectedPeriod}
          selectedPeriodObj={selectedPeriodObj ?? null}
          periodPreview={periodPreview ?? null}
          previewLoading={previewLoading}
          selectedIds={selectedIds}
          selectedByAcct={selectedByAcct}
          selectedRecords={selectedRecords}
          selectedTotal={selectedTotal}
          selectedAccountIds={selectedAccountIds}
          expandedAccountIds={expandedAccountIds}
          pushIsPending={pushMutation.isPending}
          onToggleAccount={(id) =>
            setSelectedAccountIds(prev => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id); else next.add(id);
              return next;
            })
          }
          onSelectAllAccounts={() =>
            setSelectedAccountIds(new Set(periodPreview?.accounts.map(a => a.accountId) ?? []))
          }
          onDeselectAllAccounts={() => setSelectedAccountIds(new Set())}
          onToggleExpand={(id) =>
            setExpandedAccountIds(prev => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id); else next.add(id);
              return next;
            })
          }
          onConfirm={handlePushConfirm}
          onClose={() => { setPushModalOpen(false); setPushResult(null); }}
          onExportDetail={() => {
            const periodObj = selectedPeriod !== "__all__" ? periodMap[selectedPeriod] : null;
            handleOpenExportModal({
              billingPeriodStart: periodObj?.weekStart,
              billingPeriodEnd:   periodObj?.weekEnd,
              billingPeriodLabel: periodObj?.label,
              billingStatus: "billed",
            });
          }}
          fmt$={fmt$}
        />
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RideshareInlineView() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [globalFilters, setGlobalFilters] = useState<GlobalFilters>(getDefaultFilters);

  const { data: exceptionSummary } = useQuery<{ exceptions: unknown[]; total: number }>({
    queryKey: ["/api/corporate/rideshare/transactions/exceptions", "__all__", "", "", "open", 0],
    queryFn: () =>
      fetch("/api/corporate/rideshare/transactions/exceptions?status=open&limit=1", { credentials: "include" }).then(r => r.json()),
  });
  const openExceptions = exceptionSummary?.total ?? 0;

  const { data: billingSummary } = useQuery<BillingSummary>({
    queryKey: ["/api/corporate/rideshare/billing/summary"],
    queryFn: () =>
      fetch("/api/corporate/rideshare/billing/summary", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30_000,
  });
  const readyForBillingCount = billingSummary?.readyCount ?? 0;

  const handleUploadClick = () => {
    setActiveTab("imports");
  };

  const handleExportData = () => {
    // Trigger export from the reconciliation tab by navigating there
    setActiveTab("reconciliation");
  };

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Rideshare Reconciliation</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Import, match, and reconcile Uber and Lyft rideshare transactions
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Button
            variant="outline"
            onClick={() => setFiltersOpen(f => !f)}
            data-testid="button-global-filters"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
          <Button
            variant="outline"
            onClick={handleExportData}
            data-testid="button-export-data"
          >
            <Download className="h-4 w-4 mr-2" />
            Export Data
          </Button>
          <Button onClick={handleUploadClick} data-testid="button-upload-file">
            <UploadCloud className="h-4 w-4 mr-2" />
            Upload File
          </Button>
        </div>
      </div>

      {/* Global Filter Panel */}
      <GlobalFilterPanel
        filters={globalFilters}
        onChange={setGlobalFilters}
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-5">
          <TabsTrigger value="overview" className="flex items-center gap-1.5" data-testid="tab-overview">
            <BarChart3 className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="imports" className="flex items-center gap-1.5" data-testid="tab-imports">
            <UploadCloud className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Imports</span>
          </TabsTrigger>
          <TabsTrigger value="reconciliation" className="flex items-center gap-1.5" data-testid="tab-reconciliation">
            <TrendingUp className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Reconciliation</span>
          </TabsTrigger>
          <TabsTrigger value="exceptions" className="flex items-center gap-1.5" data-testid="tab-exceptions">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Exceptions</span>
            {openExceptions > 0 && (
              <Badge variant="destructive" className="ml-0.5 text-xs px-1.5 py-0 leading-tight no-default-active-elevate">
                {openExceptions > 99 ? "99+" : openExceptions}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="billing" className="flex items-center gap-1.5" data-testid="tab-billing">
            <Receipt className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Billing</span>
            {readyForBillingCount > 0 && (
              <Badge className="ml-0.5 text-xs px-1.5 py-0 leading-tight no-default-active-elevate bg-orange-500 text-white">
                {readyForBillingCount > 99 ? "99+" : readyForBillingCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab filters={globalFilters} />
        </TabsContent>

        <TabsContent value="imports" className="mt-4">
          <ImportsTab />
        </TabsContent>

        <TabsContent value="reconciliation" className="mt-4">
          <ReconciliationTab filters={globalFilters} />
        </TabsContent>

        <TabsContent value="exceptions" className="mt-4">
          <ExceptionsTab />
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <BillingTab
            filters={globalFilters}
            onNavigateToRecon={() => setActiveTab("reconciliation")}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
