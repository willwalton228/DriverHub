import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReceiptText, Wallet, AlertCircle, TrendingUp, Search, Building2, DollarSign, Clock } from "lucide-react";
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

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName?: string;
  status: string;
  totalAmount: string | number;
  amountPaid?: string | number;
  balanceDue?: string | number;
  dueDate?: string;
  invoiceDate?: string;
}

interface Payment {
  id: string;
  invoiceId?: string;
  customerId?: string;
  customerName?: string;
  amount: string | number;
  paymentDate?: string;
  paymentMethod?: string;
  status: string;
  referenceNumber?: string;
}

interface OverdueCustomer {
  customerId: string;
  customerName: string;
  overdueAmount: string;
  overdueInvoiceCount: number;
  oldestInvoiceDays: number;
  oldestInvoiceDate: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(val: number | string | undefined | null): string {
  const n = typeof val === "string" ? parseFloat(val) : (val ?? 0);
  if (isNaN(n)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

const STATUS_COLORS: Record<string, string> = {
  paid:      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  sent:      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  overdue:   "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  draft:     "bg-muted text-muted-foreground",
  partial:   "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  voided:    "bg-muted text-muted-foreground",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  failed:    "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  pending:   "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_COLORS[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function FinanceRevenue() {
  const [tab, setTab] = useState("invoices");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [paymentSearch, setPaymentSearch] = useState("");

  const { data: stats, isLoading: statsLoading } = useQuery<InvoicingStats>({
    queryKey: ["/api/corporate/invoicing/stats"],
  });

  const { data: invoices, isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/corporate/invoicing/invoices"],
    queryFn: () => fetch("/api/corporate/invoicing/invoices?limit=200", { credentials: "include" }).then(r => r.json()),
  });

  const { data: payments, isLoading: paymentsLoading } = useQuery<Payment[]>({
    queryKey: ["/api/corporate/invoicing/payments"],
    queryFn: () => fetch("/api/corporate/invoicing/payments", { credentials: "include" }).then(r => r.json()),
  });

  const { data: topOverdue } = useQuery<OverdueCustomer[]>({
    queryKey: ["/api/reports/revenue/top-overdue-customers"],
    queryFn: () => fetch("/api/reports/revenue/top-overdue-customers", { credentials: "include" }).then(r => r.ok ? r.json() : []),
  });

  const filteredInvoices = (invoices ?? []).filter(inv =>
    !invoiceSearch ||
    inv.invoiceNumber?.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
    inv.customerName?.toLowerCase().includes(invoiceSearch.toLowerCase())
  );

  const filteredPayments = (payments ?? []).filter(p =>
    !paymentSearch ||
    p.customerName?.toLowerCase().includes(paymentSearch.toLowerCase()) ||
    p.referenceNumber?.toLowerCase().includes(paymentSearch.toLowerCase())
  );

  const aging = stats?.agingSummary;

  return (
    <FinanceAccessGate require="canViewRevenue">
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Revenue</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Invoices, payments received, and accounts receivable aging</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: "Open AR",          value: fmt(stats?.totalOutstanding),        icon: DollarSign,  loading: statsLoading },
          { label: "Overdue",          value: fmt(stats?.overdueAmount),            icon: AlertCircle, loading: statsLoading },
          { label: "Collected MTD",    value: fmt(stats?.paymentsReceivedThisMonth),icon: Wallet,      loading: statsLoading },
          { label: "Invoices Sent MTD",value: String(stats?.invoicesSentThisMonth ?? "—"), icon: ReceiptText, loading: statsLoading },
          { label: "Avg Days to Pay",  value: stats?.averageDaysToPayment != null ? `${stats.averageDaysToPayment}d` : "—", icon: TrendingUp, loading: statsLoading },
        ].map(({ label, value, icon: Icon, loading }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 flex-wrap">
              <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-6 w-24" /> : <div className="text-xl font-bold">{value}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* AR Aging visual */}
      {aging && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">AR Aging Summary</CardTitle>
            <CardDescription className="text-xs">All open receivables bucketed by age</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-3 text-center">
              {[
                { label: "Current",   value: aging.current,   color: "bg-green-500" },
                { label: "1–30 Days", value: aging.days1to30,  color: "bg-yellow-400" },
                { label: "31–60d",    value: aging.days31to60, color: "bg-orange-400" },
                { label: "61–90d",    value: aging.days61to90, color: "bg-orange-600" },
                { label: "90+ Days",  value: aging.over90,     color: "bg-destructive" },
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

      {/* Top Overdue Customers */}
      {Array.isArray(topOverdue) && topOverdue.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 flex-wrap space-y-0">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                Top Overdue Accounts
              </CardTitle>
              <CardDescription className="text-xs">Customers with the highest past-due balances</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topOverdue.slice(0, 5).map((c) => (
                <div key={c.customerId} className="flex items-center justify-between gap-4 rounded-md bg-muted/40 px-3 py-2" data-testid={`overdue-customer-${c.customerId}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate">{c.customerName}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">{c.overdueInvoiceCount} inv</span>
                    <Badge variant="destructive" className="text-xs">{c.oldestInvoiceDays}d overdue</Badge>
                    <span className="text-sm font-bold text-destructive">{fmt(c.overdueAmount)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="invoices" data-testid="tab-invoices">
            Invoices
            {Array.isArray(invoices) && <Badge variant="secondary" className="ml-1.5 text-xs">{invoices.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="payments" data-testid="tab-payments">
            Payments Received
            {Array.isArray(payments) && <Badge variant="secondary" className="ml-1.5 text-xs">{payments.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* Invoices tab */}
        <TabsContent value="invoices" className="mt-4 space-y-3">
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input placeholder="Search invoices..." value={invoiceSearch} onChange={e => setInvoiceSearch(e.target.value)} className="pl-8" data-testid="input-invoice-search" />
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoicesLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : filteredInvoices.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                      {invoiceSearch ? "No invoices match your search" : "No invoices found"}
                    </TableCell></TableRow>
                  ) : filteredInvoices.map(inv => (
                    <TableRow key={inv.id} className="cursor-pointer" data-testid={`row-invoice-${inv.id}`}
                      onClick={() => window.location.href = `/invoices/${inv.id}`}>
                      <TableCell className="font-medium text-primary">{inv.invoiceNumber}</TableCell>
                      <TableCell className="max-w-[180px] truncate">{inv.customerName ?? inv.customerId}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {inv.invoiceDate ? format(parseISO(inv.invoiceDate), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {inv.dueDate ? format(parseISO(inv.dueDate), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell><StatusBadge status={inv.status} /></TableCell>
                      <TableCell className="text-right font-medium whitespace-nowrap">{fmt(inv.totalAmount)}</TableCell>
                      <TableCell className="text-right font-semibold whitespace-nowrap">
                        <span className={parseFloat(String(inv.balanceDue ?? 0)) > 0 ? "text-destructive" : "text-green-600 dark:text-green-400"}>
                          {fmt(inv.balanceDue)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments tab */}
        <TabsContent value="payments" className="mt-4 space-y-3">
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input placeholder="Search payments..." value={paymentSearch} onChange={e => setPaymentSearch(e.target.value)} className="pl-8" data-testid="input-payment-search" />
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentsLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 6 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : filteredPayments.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                      {paymentSearch ? "No payments match your search" : "No payments found"}
                    </TableCell></TableRow>
                  ) : filteredPayments.map(p => (
                    <TableRow key={p.id} data-testid={`row-payment-${p.id}`}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {p.paymentDate ? format(parseISO(p.paymentDate), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate">{p.customerName ?? p.customerId ?? "—"}</TableCell>
                      <TableCell className="capitalize text-sm">{p.paymentMethod ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.referenceNumber ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={p.status} /></TableCell>
                      <TableCell className="text-right font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">{fmt(p.amount)}</TableCell>
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
