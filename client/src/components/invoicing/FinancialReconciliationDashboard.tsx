import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  DollarSign,
  FileText,
  CreditCard,
  Building2,
  RefreshCw,
  ShieldCheck,
  Banknote,
  ChevronDown,
  ChevronUp,
  Filter,
  Lock,
  Settings2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReconSummary {
  totalInvoices: number;
  totalInvoiceAmount: number;
  totalPaid: number;
  totalCreditApplied: number;
  openAR: number;
  totalPayments: number;
  totalPaymentAmount: number;
  totalApplied: number;
  totalUnapplied: number;
  totalDeposited: number;
  totalUndeposited: number;
  depositBatches: number;
  variance: number;
  exceptionsCount: number;
  asOf: string;
}

interface InvoiceReconRow {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string | null;
  customerName: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  creditApplied: number;
  storedBalanceDue: number;
  computedBalance: number;
  balanceMismatch: boolean;
  isOverpaid: boolean;
  applicationCount: number;
}

interface PaymentReconRow {
  paymentId: string;
  customerId: string;
  customerName: string;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  status: string;
  appliedAmount: number;
  unappliedAmount: number;
  depositBatchId: string | null;
  depositBatchStatus: string | null;
  applicationCount: number;
  isUnlinked: boolean;
  isUndeposited: boolean;
  checkNumber: string | null;
  referenceNumber: string | null;
}

interface DepositReconRow {
  batchId: string;
  batchName: string;
  depositDate: string | null;
  status: string;
  totalAmount: number;
  paymentCount: number;
  paymentSum: number;
  variance: number;
  hasVariance: boolean;
  bankAccountName: string | null;
  depositMethod: string | null;
}

interface ReconciliationException {
  id: string;
  type: string;
  severity: "error" | "warning";
  entityType: string;
  entityId: string;
  entityLabel: string;
  description: string;
  amount: number | null;
  customerId: string | null;
  customerName: string | null;
  createdAt: string | null;
  actionable: boolean;
  actions: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

const pct = (num: number, denom: number) =>
  denom === 0 ? 0 : Math.round((num / denom) * 100);

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs gap-1",
        ok
          ? "border-green-500/40 text-green-700 dark:text-green-400"
          : "border-destructive/40 text-destructive"
      )}
    >
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label}
    </Badge>
  );
}

function ExceptionTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; color: string }> = {
    unlinked_payment: { label: "Unlinked Payment", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
    invoice_balance_mismatch: { label: "Balance Mismatch", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
    invoice_overpaid: { label: "Overpaid Invoice", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
    undeposited_payment: { label: "Undeposited", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
    batch_sum_mismatch: { label: "Batch Mismatch", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
    failed_payment_on_invoice: { label: "Failed Payment", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
    payment_reversal: { label: "Reversal", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
    payment_edited: { label: "Edited Payment", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
    duplicate_payment: { label: "Duplicate Payment", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
    manual_payment_unmatched: { label: "Manual Unmatched", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  };
  const def = map[type] ?? { label: type.replace(/_/g, " "), color: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-md font-medium", def.color)}>
      {def.label}
    </span>
  );
}

function ActionLabel({ action }: { action: string }) {
  const map: Record<string, string> = {
    assign_to_invoice: "Assign to Invoice",
    assign_to_batch: "Assign to Batch",
    issue_credit: "Issue Credit",
    adjust_invoice: "Adjust Invoice",
    recalculate_balance: "Recalculate",
    view_batch: "View Batch",
    view_payment: "View Payment",
    view_original_payment: "View Original",
    mark_resolved: "Mark Resolved",
  };
  return <>{map[action] ?? action.replace(/_/g, " ")}</>;
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummarySection({ data }: { data: ReconSummary }) {
  const isClean = data.variance === 0 && data.exceptionsCount === 0;
  const hasWarning = !isClean && Math.abs(data.variance) < 100;
  const hasError = Math.abs(data.variance) >= 100 || data.exceptionsCount > 0;

  return (
    <div className="space-y-4">
      {/* Health Banner */}
      <div
        className={cn(
          "flex items-center gap-3 p-3 rounded-md border text-sm font-medium",
          isClean
            ? "border-green-500/30 bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300"
            : hasError
            ? "border-destructive/30 bg-red-50 dark:bg-red-950/30 text-destructive"
            : "border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300"
        )}
      >
        {isClean ? (
          <ShieldCheck className="w-4 h-4 shrink-0" />
        ) : hasError ? (
          <AlertTriangle className="w-4 h-4 shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 shrink-0" />
        )}
        <span>
          {isClean
            ? "All accounts reconcile. Variance is $0.00."
            : hasError
            ? `${data.exceptionsCount} exception${data.exceptionsCount !== 1 ? "s" : ""} detected. Net variance ${fmt(data.variance)}.`
            : `Minor variance of ${fmt(data.variance)} detected. Review exceptions.`}
        </span>
        <span className="ml-auto text-xs opacity-70">As of {data.asOf}</span>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          icon={<FileText className="w-4 h-4" />}
          label="Total Invoiced"
          value={fmt(data.totalInvoiceAmount)}
          sub={`${data.totalInvoices} invoices`}
          color="blue"
        />
        <MetricCard
          icon={<CreditCard className="w-4 h-4" />}
          label="Total Payments"
          value={fmt(data.totalPaymentAmount)}
          sub={`${data.totalPayments} payments`}
          color="green"
        />
        <MetricCard
          icon={<DollarSign className="w-4 h-4" />}
          label="Open A/R"
          value={fmt(data.openAR)}
          sub={`${pct(data.openAR, data.totalInvoiceAmount)}% outstanding`}
          color={data.openAR > 0 ? "amber" : "green"}
        />
        <MetricCard
          icon={data.variance === 0 ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          label="Net Variance"
          value={fmt(data.variance)}
          sub={data.variance === 0 ? "Balanced" : "Review exceptions"}
          color={data.variance === 0 ? "green" : "red"}
          highlight={data.variance !== 0}
        />
      </div>

      {/* Secondary breakdown */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Applied Payments"
          value={fmt(data.totalApplied)}
          sub={`${pct(data.totalApplied, data.totalPaymentAmount)}% applied`}
          color="blue"
        />
        <MetricCard
          icon={<TrendingDown className="w-4 h-4" />}
          label="Unapplied Payments"
          value={fmt(data.totalUnapplied)}
          sub="Pending assignment"
          color={data.totalUnapplied > 0 ? "amber" : "green"}
        />
        <MetricCard
          icon={<Building2 className="w-4 h-4" />}
          label="Deposited"
          value={fmt(data.totalDeposited)}
          sub={`${data.depositBatches} batches`}
          color="blue"
        />
        <MetricCard
          icon={<Banknote className="w-4 h-4" />}
          label="Undeposited"
          value={fmt(data.totalUndeposited)}
          sub="Not in any batch"
          color={data.totalUndeposited > 0 ? "amber" : "green"}
        />
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  sub,
  color,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: "blue" | "green" | "amber" | "red";
  highlight?: boolean;
}) {
  const iconBg = {
    blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    green: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
    amber: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
    red: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  }[color];

  return (
    <Card className={cn(highlight && "border-destructive/50")}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className={cn("p-1.5 rounded-md", iconBg)}>{icon}</div>
          <span className="text-xs text-muted-foreground font-medium">{label}</span>
        </div>
        <div className="text-lg font-semibold leading-tight">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
      </CardContent>
    </Card>
  );
}

// ─── Invoice Table ─────────────────────────────────────────────────────────────

function InvoiceReconTable({ customerId }: { customerId?: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [sortIssuesFirst] = useState(true);

  const { data, isLoading, refetch } = useQuery<{ rows: InvoiceReconRow[]; total: number }>({
    queryKey: ["/api/corporate/invoicing/recon/invoices", customerId],
    queryFn: () =>
      apiRequest("GET", `/api/corporate/invoicing/recon/invoices${customerId ? `?customerId=${customerId}` : ""}`)
        .then((r) => r.json()),
  });

  const recalc = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/corporate/invoicing/recon/invoices/${id}/recalculate-balance`),
    onSuccess: () => {
      toast({ title: "Balance recalculated" });
      refetch();
      qc.invalidateQueries({ queryKey: ["/api/corporate/invoicing/recon/summary"] });
    },
    onError: () => toast({ title: "Recalculation failed", variant: "destructive" }),
  });

  const rows = data?.rows ?? [];
  const flagged = rows.filter((r) => r.balanceMismatch || r.isOverpaid).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Invoice Reconciliation</span>
          {flagged > 0 && (
            <Badge variant="destructive" className="text-xs">
              {flagged} issue{flagged !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-36">Invoice #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Computed</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-20 text-right">Apps</TableHead>
              <TableHead className="w-28">Flags</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  Loading invoice data…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  No invoices found
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.invoiceId}
                  className={cn(
                    (row.balanceMismatch || row.isOverpaid) && "bg-red-50/50 dark:bg-red-950/10"
                  )}
                >
                  <TableCell className="font-mono text-xs">{row.invoiceNumber}</TableCell>
                  <TableCell className="text-sm">{row.customerName}</TableCell>
                  <TableCell className="text-right text-sm">{fmt(row.totalAmount)}</TableCell>
                  <TableCell className="text-right text-sm">{fmt(row.paidAmount)}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{fmt(row.storedBalanceDue)}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right text-sm",
                      row.balanceMismatch && "text-destructive font-semibold"
                    )}
                  >
                    {fmt(row.computedBalance)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs capitalize">
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {row.applicationCount}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {row.isOverpaid && (
                        <StatusPill ok={false} label="Overpaid" />
                      )}
                      {row.balanceMismatch && (
                        <StatusPill ok={false} label="Mismatch" />
                      )}
                      {!row.isOverpaid && !row.balanceMismatch && (
                        <StatusPill ok={true} label="OK" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {row.balanceMismatch && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => recalc.mutate(row.invoiceId)}
                        disabled={recalc.isPending}
                        data-testid={`btn-recalc-invoice-${row.invoiceId}`}
                      >
                        Fix
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {data && (
        <p className="text-xs text-muted-foreground">
          Showing {rows.length} of {data.total} invoices
        </p>
      )}
    </div>
  );
}

// ─── Payment Table ─────────────────────────────────────────────────────────────

function PaymentReconTable({ customerId }: { customerId?: string }) {
  const { data, isLoading, refetch } = useQuery<{ rows: PaymentReconRow[]; total: number }>({
    queryKey: ["/api/corporate/invoicing/recon/payments", customerId],
    queryFn: () =>
      apiRequest("GET", `/api/corporate/invoicing/recon/payments${customerId ? `?customerId=${customerId}` : ""}`)
        .then((r) => r.json()),
  });

  const rows = data?.rows ?? [];
  const unlinked = rows.filter((r) => r.isUnlinked).length;
  const undeposited = rows.filter((r) => r.isUndeposited).length;

  const methodLabel: Record<string, string> = {
    check: "Check",
    ach: "ACH",
    credit_card: "Card",
    wire: "Wire",
    cash: "Cash",
    other: "Other",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Payment Reconciliation</span>
          {unlinked > 0 && (
            <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 dark:text-amber-400">
              {unlinked} unlinked
            </Badge>
          )}
          {undeposited > 0 && (
            <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 dark:text-amber-400">
              {undeposited} undeposited
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="w-24">Date</TableHead>
              <TableHead className="w-20">Method</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Applied</TableHead>
              <TableHead className="text-right">Unapplied</TableHead>
              <TableHead className="w-28">Deposit Batch</TableHead>
              <TableHead className="w-28">Flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Loading payment data…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  No completed payments found
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.paymentId}
                  className={cn(
                    (row.isUnlinked || row.isUndeposited) &&
                      "bg-amber-50/40 dark:bg-amber-950/10"
                  )}
                >
                  <TableCell className="font-mono text-xs">
                    {row.checkNumber
                      ? `Chk #${row.checkNumber}`
                      : row.referenceNumber
                      ? `Ref: ${row.referenceNumber}`
                      : row.paymentId.slice(0, 8)}
                  </TableCell>
                  <TableCell className="text-sm">{row.customerName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.paymentDate}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {methodLabel[row.paymentMethod] ?? row.paymentMethod}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">{fmt(row.amount)}</TableCell>
                  <TableCell className="text-right text-sm">{fmt(row.appliedAmount)}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right text-sm",
                      row.unappliedAmount > 0 && "text-amber-600 dark:text-amber-400 font-medium"
                    )}
                  >
                    {fmt(row.unappliedAmount)}
                  </TableCell>
                  <TableCell>
                    {row.depositBatchId ? (
                      <Badge variant="outline" className="text-xs capitalize">
                        {row.depositBatchStatus ?? "In Batch"}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">None</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {row.isUnlinked && <StatusPill ok={false} label="Unlinked" />}
                      {row.isUndeposited && <StatusPill ok={false} label="No Batch" />}
                      {!row.isUnlinked && !row.isUndeposited && <StatusPill ok={true} label="OK" />}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {data && (
        <p className="text-xs text-muted-foreground">
          Showing {rows.length} of {data.total} payments
        </p>
      )}
    </div>
  );
}

// ─── Deposit Table ─────────────────────────────────────────────────────────────

function DepositReconTable() {
  const { data, isLoading, refetch } = useQuery<{ rows: DepositReconRow[]; total: number }>({
    queryKey: ["/api/corporate/invoicing/recon/deposits"],
    queryFn: () =>
      apiRequest("GET", "/api/corporate/invoicing/recon/deposits").then((r) => r.json()),
  });

  const rows = data?.rows ?? [];
  const mismatches = rows.filter((r) => r.hasVariance).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Deposit Batch Reconciliation</span>
          {mismatches > 0 && (
            <Badge variant="destructive" className="text-xs">
              {mismatches} mismatch{mismatches !== 1 ? "es" : ""}
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Batch Name</TableHead>
              <TableHead className="w-28">Deposit Date</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-28">Bank / Method</TableHead>
              <TableHead className="text-right">Batch Total</TableHead>
              <TableHead className="text-right">Payment Sum</TableHead>
              <TableHead className="text-right">Variance</TableHead>
              <TableHead className="w-20 text-right">Pmts</TableHead>
              <TableHead className="w-24">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Loading deposit data…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  No deposit batches found
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.batchId}
                  className={cn(row.hasVariance && "bg-red-50/50 dark:bg-red-950/10")}
                >
                  <TableCell className="text-sm font-medium">{row.batchName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.depositDate ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs capitalize">
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {[row.bankAccountName, row.depositMethod].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">{fmt(row.totalAmount)}</TableCell>
                  <TableCell className="text-right text-sm">{fmt(row.paymentSum)}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right text-sm font-medium",
                      row.hasVariance ? "text-destructive" : "text-green-600 dark:text-green-400"
                    )}
                  >
                    {row.hasVariance ? fmt(row.variance) : "—"}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {row.paymentCount}
                  </TableCell>
                  <TableCell>
                    <StatusPill ok={!row.hasVariance} label={row.hasVariance ? "Mismatch" : "Balanced"} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {data && (
        <p className="text-xs text-muted-foreground">
          Showing {rows.length} of {data.total} batches
        </p>
      )}
    </div>
  );
}

// ─── Exception Panel ───────────────────────────────────────────────────────────

function ExceptionPanel({
  customerId,
  onNavigate,
}: {
  customerId?: string;
  onNavigate?: (tab: string) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = useQuery<{
    exceptions: ReconciliationException[];
    total: number;
  }>({
    queryKey: ["/api/corporate/invoicing/recon/exceptions", customerId],
    queryFn: () =>
      apiRequest("GET", `/api/corporate/invoicing/recon/exceptions${customerId ? `?customerId=${customerId}` : ""}`)
        .then((r) => r.json()),
  });

  const resolve = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      apiRequest("POST", `/api/corporate/invoicing/recon/exceptions/${encodeURIComponent(id)}/resolve`, { notes }),
    onSuccess: () => {
      toast({ title: "Exception logged as resolved" });
      refetch();
      qc.invalidateQueries({ queryKey: ["/api/corporate/invoicing/recon/summary"] });
    },
    onError: () => toast({ title: "Failed to resolve exception", variant: "destructive" }),
  });

  const exceptions = data?.exceptions ?? [];

  const filtered =
    typeFilter === "all" ? exceptions : exceptions.filter((e) => e.type === typeFilter);

  const errorCount = exceptions.filter((e) => e.severity === "error").length;
  const warnCount = exceptions.filter((e) => e.severity === "warning").length;

  const types = [...new Set(exceptions.map((e) => e.type))];

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Exception Panel</span>
          {errorCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {errorCount} error{errorCount !== 1 ? "s" : ""}
            </Badge>
          )}
          {warnCount > 0 && (
            <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 dark:text-amber-400">
              {warnCount} warning{warnCount !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-44 text-xs" data-testid="select-exception-type">
              <Filter className="w-3 h-3 mr-1.5" />
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {types.map((t) => (
                <SelectItem key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-12 text-sm">Loading exceptions…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
          <ShieldCheck className="w-8 h-8 text-green-500" />
          <p className="text-sm font-medium text-green-700 dark:text-green-400">
            {typeFilter === "all" ? "No exceptions detected" : "No exceptions of this type"}
          </p>
          <p className="text-xs text-muted-foreground">
            All invoices, payments, and deposits reconcile correctly.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((exc) => {
            const isOpen = expanded.has(exc.id);
            return (
              <div
                key={exc.id}
                className={cn(
                  "border rounded-md overflow-hidden",
                  exc.severity === "error"
                    ? "border-red-200 dark:border-red-800/50"
                    : "border-amber-200 dark:border-amber-800/50"
                )}
              >
                <div
                  className={cn(
                    "flex items-center gap-3 p-3 cursor-pointer select-none",
                    exc.severity === "error"
                      ? "bg-red-50/60 dark:bg-red-950/20"
                      : "bg-amber-50/60 dark:bg-amber-950/20"
                  )}
                  onClick={() => toggleExpand(exc.id)}
                >
                  {exc.severity === "error" ? (
                    <XCircle className="w-4 h-4 text-destructive shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ExceptionTypeBadge type={exc.type} />
                      <span className="text-sm font-medium truncate">{exc.entityLabel}</span>
                      {exc.customerName && (
                        <span className="text-xs text-muted-foreground">{exc.customerName}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{exc.description}</p>
                  </div>
                  {exc.amount != null && (
                    <span
                      className={cn(
                        "text-sm font-semibold shrink-0",
                        exc.severity === "error" ? "text-destructive" : "text-amber-600 dark:text-amber-400"
                      )}
                    >
                      {fmt(exc.amount)}
                    </span>
                  )}
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                </div>

                {isOpen && (
                  <div className="p-3 border-t bg-card">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs mb-3">
                      <div>
                        <span className="text-muted-foreground">Entity:</span>{" "}
                        <span className="font-medium">{exc.entityType}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">ID:</span>{" "}
                        <span className="font-mono">{exc.entityId.slice(0, 16)}…</span>
                      </div>
                      {exc.createdAt && (
                        <div>
                          <span className="text-muted-foreground">Date:</span>{" "}
                          <span>{exc.createdAt}</span>
                        </div>
                      )}
                      {exc.amount != null && (
                        <div>
                          <span className="text-muted-foreground">Amount:</span>{" "}
                          <span className="font-medium">{fmt(exc.amount)}</span>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">{exc.description}</p>
                    <div className="flex flex-wrap gap-2">
                      {exc.actions.map((action) => (
                        <Button
                          key={action}
                          variant={action === "mark_resolved" ? "outline" : "default"}
                          size="sm"
                          data-testid={`btn-exception-${action}-${exc.entityId}`}
                          onClick={() => {
                            if (action === "mark_resolved") {
                              resolve.mutate({ id: exc.id, notes: `Manually resolved: ${exc.description}` });
                            } else if (action === "recalculate_balance") {
                              apiRequest("POST", `/api/corporate/invoicing/recon/invoices/${exc.entityId}/recalculate-balance`)
                                .then(() => {
                                  toast({ title: "Balance recalculated" });
                                  qc.invalidateQueries({ queryKey: ["/api/corporate/invoicing/recon"] });
                                })
                                .catch(() => toast({ title: "Recalculation failed", variant: "destructive" }));
                            } else if (action === "view_payment" || action === "view_original_payment") {
                              onNavigate?.("payments");
                              toast({ title: "Navigated to Payments", description: `Showing reconciliation for payment ${exc.entityLabel}` });
                            } else if (action === "view_batch" || action === "assign_to_batch") {
                              onNavigate?.("deposits");
                              toast({ title: "Navigated to Deposits", description: "Review deposit batches to assign or investigate." });
                            } else if (action === "assign_to_invoice" || action === "adjust_invoice" || action === "issue_credit") {
                              onNavigate?.("invoices");
                              toast({ title: "Navigated to Invoices", description: "Locate the invoice to apply payment or credit." });
                            } else {
                              toast({
                                title: "Action noted",
                                description: `"${action.replace(/_/g, " ")}" — use the relevant workspace tab to complete this action.`,
                              });
                            }
                          }}
                          disabled={resolve.isPending}
                        >
                          <ActionLabel action={action} />
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} exception{filtered.length !== 1 ? "s" : ""}
          {typeFilter !== "all" ? ` of type "${typeFilter.replace(/_/g, " ")}"` : ""} displayed
        </p>
      )}
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

function AccessDeniedScreen() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <div className="p-4 rounded-full bg-red-100 dark:bg-red-950/30">
        <Lock className="w-8 h-8 text-destructive" />
      </div>
      <div>
        <h3 className="text-lg font-semibold">Access Restricted</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          The Financial Reconciliation Dashboard is restricted to Owner and Super Admin roles only.
          Contact your system administrator to request access.
        </p>
      </div>
      <Badge variant="outline" className="text-xs border-destructive/40 text-destructive gap-1.5">
        <Lock className="w-3 h-3" />
        403 — Insufficient Permissions
      </Badge>
    </div>
  );
}

export function FinancialReconciliationDashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { isSystemAdmin } = useAuth();
  const isReconAdmin = isSystemAdmin;
  const [customerId, setCustomerId] = useState<string>("");
  const [customerFilter, setCustomerFilter] = useState<string | undefined>(undefined);
  const [activeSection, setActiveSection] = useState("summary");
  const [showSettings, setShowSettings] = useState(false);

  const { data: reconSettings } = useQuery<{ restrictedMode: boolean; requireDepositBatch: boolean }>({
    queryKey: ["/api/corporate/invoicing/recon/settings"],
    queryFn: () => apiRequest("GET", "/api/corporate/invoicing/recon/settings").then((r) => r.json()),
    enabled: !!isReconAdmin,
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (patch: { restrictedMode?: boolean; requireDepositBatch?: boolean }) =>
      apiRequest("PATCH", "/api/corporate/invoicing/recon/settings", patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/corporate/invoicing/recon/settings"] });
      toast({ title: "Reconciliation settings updated" });
    },
    onError: () => toast({ title: "Failed to update settings", variant: "destructive" }),
  });

  const toggleRestrictedModeMutation = { mutate: (v: boolean) => updateSettingsMutation.mutate({ restrictedMode: v }), isPending: updateSettingsMutation.isPending };

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<ReconSummary>({
    queryKey: ["/api/corporate/invoicing/recon/summary", customerFilter],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/corporate/invoicing/recon/summary${customerFilter ? `?customerId=${customerFilter}` : ""}`
      ).then((r) => r.json()),
    enabled: !!isReconAdmin,
  });

  function applyFilter() {
    const v = customerId.trim() || undefined;
    setCustomerFilter(v);
    qc.invalidateQueries({ queryKey: ["/api/corporate/invoicing/recon"] });
  }

  function clearFilter() {
    setCustomerId("");
    setCustomerFilter(undefined);
    qc.invalidateQueries({ queryKey: ["/api/corporate/invoicing/recon"] });
  }

  if (!isReconAdmin) {
    return <AccessDeniedScreen />;
  }

  return (
    <div className="space-y-4">
      {/* Settings panel */}
      {showSettings && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Reconciliation Settings</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setShowSettings(false)} data-testid="btn-close-settings">
              <XCircle className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Restricted Mode</p>
                  <p className="text-xs text-muted-foreground">When enabled, only Owner and Super Admin roles can access this dashboard and related financial endpoints.</p>
                </div>
                <Button
                  variant={reconSettings?.restrictedMode ? "default" : "outline"}
                  size="default"
                  onClick={() => updateSettingsMutation.mutate({ restrictedMode: !reconSettings?.restrictedMode })}
                  disabled={updateSettingsMutation.isPending}
                  data-testid="btn-toggle-restricted-mode"
                >
                  <Lock className="w-3.5 h-3.5 mr-1.5" />
                  {reconSettings?.restrictedMode ? "Restricted (On)" : "Unrestricted (Off)"}
                </Button>
              </div>
              <div className="border-t pt-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Require Deposit Batch on Payment Creation</p>
                  <p className="text-xs text-muted-foreground">When enabled, all new payments must be assigned to a deposit batch at creation time. Payments without a batch will be rejected.</p>
                </div>
                <Button
                  variant={reconSettings?.requireDepositBatch ? "default" : "outline"}
                  size="default"
                  onClick={() => updateSettingsMutation.mutate({ requireDepositBatch: !reconSettings?.requireDepositBatch })}
                  disabled={updateSettingsMutation.isPending}
                  data-testid="btn-toggle-require-deposit-batch"
                >
                  <Lock className="w-3.5 h-3.5 mr-1.5" />
                  {reconSettings?.requireDepositBatch ? "Required (On)" : "Optional (Off)"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Input
            placeholder="Filter by Customer ID (optional)"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="max-w-xs"
            onKeyDown={(e) => e.key === "Enter" && applyFilter()}
            data-testid="input-recon-customer-id"
          />
          <Button variant="outline" size="default" onClick={applyFilter} data-testid="btn-apply-filter">
            <Filter className="w-3.5 h-3.5 mr-1.5" /> Filter
          </Button>
          {customerFilter && (
            <Button variant="ghost" size="default" onClick={clearFilter} data-testid="btn-clear-filter">
              Clear
            </Button>
          )}
        </div>
        <Button
          variant="outline"
          size="default"
          onClick={() => {
            refetchSummary();
            qc.invalidateQueries({ queryKey: ["/api/corporate/invoicing/recon"] });
          }}
          data-testid="btn-recon-refresh-all"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh All
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowSettings((v) => !v)}
          data-testid="btn-recon-settings"
          title="Reconciliation Settings"
        >
          <Settings2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Summary */}
      {summaryLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-16 bg-muted animate-pulse rounded-md" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : summary ? (
        <SummarySection data={summary} />
      ) : null}

      {/* Detail Tabs */}
      <Tabs value={activeSection} onValueChange={setActiveSection}>
        <TabsList>
          <TabsTrigger value="invoices" data-testid="tab-recon-invoices">
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            Invoices
          </TabsTrigger>
          <TabsTrigger value="payments" data-testid="tab-recon-payments">
            <CreditCard className="w-3.5 h-3.5 mr-1.5" />
            Payments
          </TabsTrigger>
          <TabsTrigger value="deposits" data-testid="tab-recon-deposits">
            <Building2 className="w-3.5 h-3.5 mr-1.5" />
            Deposits
          </TabsTrigger>
          <TabsTrigger value="exceptions" data-testid="tab-recon-exceptions">
            <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
            Exceptions
            {summary && summary.exceptionsCount > 0 && (
              <span className="ml-1.5 text-xs bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5 leading-none">
                {summary.exceptionsCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-4">
          <InvoiceReconTable customerId={customerFilter} />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <PaymentReconTable customerId={customerFilter} />
        </TabsContent>
        <TabsContent value="deposits" className="mt-4">
          <DepositReconTable />
        </TabsContent>
        <TabsContent value="exceptions" className="mt-4">
          <ExceptionPanel customerId={customerFilter} onNavigate={setActiveSection} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
