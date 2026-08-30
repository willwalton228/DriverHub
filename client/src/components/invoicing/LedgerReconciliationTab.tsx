import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CheckCircle, AlertTriangle, XCircle, RefreshCw,
  DollarSign, Scale, Banknote, Receipt, CreditCard, ArrowDownCircle,
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";

interface LedgerReconciliation {
  asOf: string;
  customerId: string | null;
  totalInvoiced: string;
  totalCancelled: string;
  netInvoiced: string;
  totalPaymentsReceived: string;
  totalRefunded: string;
  netPayments: string;
  openAR: string;
  depositedAmount: string;
  undepositedAmount: string;
  expectedBalance: string;
  arVariance: string;
  arReconciled: boolean;
  totalCredits: string;
  undepositedPaymentCount: number;
  openInvoiceCount: number;
  overdueInvoiceCount: number;
  status: "clean" | "warning" | "error";
  warnings: string[];
  errors: string[];
}

function fmt(val: string | number | undefined) {
  const n = parseFloat(String(val || 0));
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatusBadge({ status }: { status: "clean" | "warning" | "error" }) {
  if (status === "clean") return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 gap-1"><CheckCircle className="w-3 h-3" />Reconciled</Badge>;
  if (status === "warning") return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 gap-1"><AlertTriangle className="w-3 h-3" />Warnings</Badge>;
  return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />Out of Balance</Badge>;
}

interface MetricCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  sub?: string;
  highlight?: boolean;
}

function MetricCard({ label, value, icon: Icon, sub, highlight }: MetricCardProps) {
  return (
    <Card className={highlight ? "ring-1 ring-primary/30" : ""}>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-xs text-muted-foreground font-medium">{label}</span>
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="text-2xl font-bold">${fmt(value)}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function LedgerReconciliationTab() {
  const today = new Date().toISOString().split("T")[0];
  const [asOf, setAsOf] = useState(today);
  const [customerIdFilter, setCustomerIdFilter] = useState("");
  const [fetchKey, setFetchKey] = useState(0);

  const params = new URLSearchParams({ asOf });
  if (customerIdFilter.trim()) params.set("customerId", customerIdFilter.trim());

  const { data, isLoading, error, isFetching } = useQuery<LedgerReconciliation>({
    queryKey: ["/api/corporate/invoicing/ledger-reconciliation", asOf, customerIdFilter, fetchKey],
    queryFn: async () => {
      const res = await fetch(`/api/corporate/invoicing/ledger-reconciliation?${params}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Ledger Reconciliation</h2>
          <p className="text-sm text-muted-foreground">
            Cross-system balance check: Invoices → Payments → Deposits → Open A/R
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setFetchKey(k => k + 1)}
          disabled={isLoading || isFetching}
          data-testid="button-refresh-reconciliation"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label htmlFor="recon-as-of">As of Date</Label>
              <Input
                id="recon-as-of"
                type="date"
                value={asOf}
                onChange={e => setAsOf(e.target.value)}
                className="w-40"
                data-testid="input-recon-as-of"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="recon-customer">Customer ID (optional)</Label>
              <Input
                id="recon-customer"
                value={customerIdFilter}
                onChange={e => setCustomerIdFilter(e.target.value)}
                placeholder="Filter by customer…"
                className="w-56"
                data-testid="input-recon-customer"
              />
            </div>
            <Button
              onClick={() => setFetchKey(k => k + 1)}
              disabled={isLoading || isFetching}
              data-testid="button-run-reconciliation"
            >
              Run Check
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <XCircle className="w-4 h-4" />
          <AlertDescription>Failed to load reconciliation data. Please try again.</AlertDescription>
        </Alert>
      )}

      {data && !isLoading && (
        <>
          {/* Status summary */}
          <Card className={data.arReconciled ? "ring-1 ring-green-300 dark:ring-green-800" : "ring-1 ring-red-300 dark:ring-red-800"}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-base">Reconciliation Status — {data.asOf}</CardTitle>
              <StatusBadge status={data.status} />
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-6 items-center">
                <div>
                  <p className="text-sm text-muted-foreground">Expected Balance</p>
                  <p className="text-2xl font-bold">${fmt(data.expectedBalance)}</p>
                  <p className="text-xs text-muted-foreground">Net Invoiced − Net Payments − Credits</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Open A/R (actual)</p>
                  <p className="text-2xl font-bold">${fmt(data.openAR)}</p>
                  <p className="text-xs text-muted-foreground">Sum of unpaid invoice balances</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">A/R Variance</p>
                  <p className={`text-2xl font-bold ${parseFloat(data.arVariance) > 1 ? "text-destructive" : "text-green-600"}`}>
                    ${fmt(data.arVariance)}
                  </p>
                  <p className="text-xs text-muted-foreground">|Expected − Actual| (tolerance $1.00)</p>
                </div>
                <div className="ml-auto flex gap-3 text-center">
                  <div>
                    <p className="text-2xl font-bold text-amber-600">{data.openInvoiceCount}</p>
                    <p className="text-xs text-muted-foreground">Open Invoices</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600">{data.overdueInvoiceCount}</p>
                    <p className="text-xs text-muted-foreground">Overdue</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-orange-600">{data.undepositedPaymentCount}</p>
                    <p className="text-xs text-muted-foreground">Undeposited</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Warnings & Errors */}
          {(data.errors.length > 0 || data.warnings.length > 0) && (
            <div className="space-y-2">
              {data.errors.map((err, i) => (
                <Alert key={i} variant="destructive">
                  <XCircle className="w-4 h-4" />
                  <AlertDescription>{err}</AlertDescription>
                </Alert>
              ))}
              {data.warnings.map((w, i) => (
                <Alert key={i} className="border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800">
                  <AlertTriangle className="w-4 h-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-800 dark:text-yellow-300">{w}</AlertDescription>
                </Alert>
              ))}
            </div>
          )}

          {/* Metrics grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Total Invoiced" value={data.totalInvoiced} icon={Receipt} sub={`${data.totalCancelled !== "0.00" ? `$${fmt(data.totalCancelled)} cancelled` : "No cancellations"}`} />
            <MetricCard label="Payments Received" value={data.totalPaymentsReceived} icon={CreditCard} sub={`$${fmt(data.totalRefunded)} refunded → net $${fmt(data.netPayments)}`} />
            <MetricCard label="Credits Issued" value={data.totalCredits} icon={ArrowDownCircle} />
            <MetricCard label="Open A/R" value={data.openAR} icon={DollarSign} highlight />
            <MetricCard label="Deposited (finalized)" value={data.depositedAmount} icon={Banknote} sub="In submitted / locked / reconciled batches" />
            <MetricCard label="Undeposited" value={data.undepositedAmount} icon={Scale} sub={`${data.undepositedPaymentCount} payment(s) not in any finalized batch`} highlight={parseFloat(data.undepositedAmount) > 0} />
          </div>

          {/* Balance proof */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Balance Proof</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Total Invoiced</span>
                  <span className="font-medium">${fmt(data.totalInvoiced)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>− Net Payments</span>
                  <span>(${fmt(data.netPayments)})</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>− Credits</span>
                  <span>(${fmt(data.totalCredits)})</span>
                </div>
                <div className="border-t pt-1 flex justify-between font-semibold">
                  <span>= Expected Balance</span>
                  <span>${fmt(data.expectedBalance)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Open A/R (actual)</span>
                  <span>${fmt(data.openAR)}</span>
                </div>
                <div className={`flex justify-between font-bold ${data.arReconciled ? "text-green-600" : "text-destructive"}`}>
                  <span>Variance</span>
                  <span>${fmt(data.arVariance)} {data.arReconciled ? "✓" : "✗"}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
