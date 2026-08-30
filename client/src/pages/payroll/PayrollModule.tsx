import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { Loader2, DollarSign, Package, CheckCircle2, Clock, AlertTriangle, Plus, RefreshCw, ChevronRight, CreditCard, ListChecks, Users, TrendingUp, Calendar, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/dateFormat";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n: number | string | null | undefined, decimals = 2) {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString();
}

const STATUS_COLORS: Record<string, string> = {
  pending:       "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-transparent",
  approved:      "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-transparent",
  paid:          "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-transparent",
  voided:        "bg-muted text-muted-foreground border-transparent",
  open:          "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-transparent",
  under_review:  "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-transparent",
  locked:        "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-transparent",
  closed:        "bg-muted text-muted-foreground border-transparent",
};

function StatusBadgeLocal({ status }: { status: string }) {
  return (
    <Badge variant="secondary" className={`text-xs ${STATUS_COLORS[status] || ""}`}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

interface PayPeriodSummary {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  driverCount: number;
  totalGrossPay: number;
  totalNetPay: number;
  totalTrips: number;
}

// ─── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab() {
  const { data: payPeriods = [], isLoading: periodsLoading } = useQuery<PayPeriodSummary[]>({
    queryKey: ["/api/corporate/pay-periods"],
  });

  const { data: earningsData } = useQuery<{ earnings: any[]; total: number }>({
    queryKey: ["/api/payroll/earnings", { status: "", from: "", to: "", driverId: "" }],
    queryFn: async () => {
      const res = await fetch("/api/payroll/earnings", { credentials: "include" });
      return res.json();
    },
  });

  const earnings = earningsData?.earnings ?? [];

  const sortedPeriods = useMemo(() =>
    [...payPeriods].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()),
    [payPeriods]
  );

  const currentPeriod = sortedPeriods[0];
  const prevPeriod = sortedPeriods[1];

  const totalPendingAmt = earnings.filter(e => e.status === "pending").reduce((s, e) => s + Number(e.totalAmount), 0);
  const totalPaidAmt = earnings.filter(e => e.status === "paid").reduce((s, e) => s + Number(e.totalAmount), 0);
  const totalApprovedAmt = earnings.filter(e => e.status === "approved").reduce((s, e) => s + Number(e.totalAmount), 0);

  const grossTrend = currentPeriod && prevPeriod && prevPeriod.totalGrossPay > 0
    ? ((currentPeriod.totalGrossPay - prevPeriod.totalGrossPay) / prevPeriod.totalGrossPay) * 100
    : null;

  const recentPeriods = sortedPeriods.slice(0, 5);

  if (periodsLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Period Banner */}
      {currentPeriod && (
        <div className="rounded-lg border bg-muted/30 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Current Period</p>
            <p className="text-lg font-semibold mt-0.5">
              {formatDate(currentPeriod.startDate)} — {formatDate(currentPeriod.endDate)}
            </p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Drivers</p>
              <p className="text-xl font-bold">{currentPeriod.driverCount}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Moves</p>
              <p className="text-xl font-bold">{currentPeriod.totalTrips.toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Gross Pay</p>
              <p className="text-xl font-bold">{fmtMoney(currentPeriod.totalGrossPay)}</p>
            </div>
            <StatusBadgeLocal status={currentPeriod.status} />
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="card-total-periods">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pay Periods</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Calendar className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-period-count">{payPeriods.length}</div>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>

        <Card data-testid="card-gross-pay">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Gross</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-current-gross">
              {fmtMoney(currentPeriod?.totalGrossPay ?? 0)}
            </div>
            {grossTrend !== null && (
              <p className={`text-xs mt-1 flex items-center gap-1 ${grossTrend >= 0 ? "text-green-600" : "text-red-500"}`}>
                {grossTrend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {Math.abs(grossTrend).toFixed(1)}% vs prior period
              </p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-pending-pay">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-yellow-500/10 flex items-center justify-center">
              <Clock className="h-4 w-4 text-yellow-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pending-amt">{fmtMoney(totalPendingAmt)}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting approval</p>
          </CardContent>
        </Card>

        <Card data-testid="card-paid-pay">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-paid-amt">{fmtMoney(totalPaidAmt)}</div>
            {totalApprovedAmt > 0 && (
              <p className="text-xs text-muted-foreground mt-1">{fmtMoney(totalApprovedAmt)} approved</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Periods */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Recent Pay Periods
          </CardTitle>
          <CardDescription>Last {recentPeriods.length} periods</CardDescription>
        </CardHeader>
        <CardContent>
          {recentPeriods.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No pay period data available</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Drivers</TableHead>
                  <TableHead className="text-right">Moves</TableHead>
                  <TableHead className="text-right">Gross Pay</TableHead>
                  <TableHead className="text-right">Net Pay</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPeriods.map((period) => (
                  <TableRow key={period.id} data-testid={`row-overview-period-${period.id}`}>
                    <TableCell className="font-medium">
                      {formatDate(period.startDate)} — {formatDate(period.endDate)}
                    </TableCell>
                    <TableCell className="text-right">{period.driverCount}</TableCell>
                    <TableCell className="text-right">{period.totalTrips.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{fmtMoney(period.totalGrossPay)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(period.totalNetPay)}</TableCell>
                    <TableCell><StatusBadge status={period.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Pay Periods Tab ───────────────────────────────────────────────────────────

function PayPeriodsTab() {
  const { data: payPeriods = [], isLoading } = useQuery<PayPeriodSummary[]>({
    queryKey: ["/api/corporate/pay-periods"],
  });

  const totalGrossPay = payPeriods.reduce((sum, p) => sum + p.totalGrossPay, 0);
  const totalNetPay = payPeriods.reduce((sum, p) => sum + p.totalNetPay, 0);
  const totalTrips = payPeriods.reduce((sum, p) => sum + p.totalTrips, 0);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pay Periods</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Calendar className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-period-count">{payPeriods.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Total periods</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Gross Pay</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-gross">{fmtMoney(totalGrossPay)}</div>
            <p className="text-xs text-muted-foreground mt-1">All periods</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Net Pay</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-net">{fmtMoney(totalNetPay)}</div>
            <p className="text-xs text-muted-foreground mt-1">All periods</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Moves</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-trips">{totalTrips.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">All periods</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pay Periods</CardTitle>
          <CardDescription>All pay periods and their payroll summaries</CardDescription>
        </CardHeader>
        <CardContent>
          {payPeriods.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No pay period data available</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Drivers</TableHead>
                  <TableHead className="text-right">Moves</TableHead>
                  <TableHead className="text-right">Gross Pay</TableHead>
                  <TableHead className="text-right">Net Pay</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payPeriods.map((period) => (
                  <TableRow key={period.id} data-testid={`row-period-${period.id}`}>
                    <TableCell className="font-medium">
                      {formatDate(period.startDate)} — {formatDate(period.endDate)}
                    </TableCell>
                    <TableCell className="text-right">{period.driverCount}</TableCell>
                    <TableCell className="text-right">{period.totalTrips.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{fmtMoney(period.totalGrossPay)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(period.totalNetPay)}</TableCell>
                    <TableCell><StatusBadge status={period.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Earnings Tab ──────────────────────────────────────────────────────────────

function EarningsTab({ driverId }: { driverId?: string }) {
  const { toast } = useToast();
  const [filters, setFilters] = useState({ status: "", from: "", to: "", driverId: driverId ?? "" });
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    driverId: driverId ?? "", earningDate: "", payType: "per_move", description: "",
    hoursWorked: "", moveCount: "", milesLogged: "",
    baseAmount: "", otAmount: "", bonusAmount: "", adjustmentAmount: "",
  });

  const { data, isLoading, refetch } = useQuery<{ earnings: any[]; total: number }>({
    queryKey: ["/api/payroll/earnings", filters],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (filters.status)   p.set("status", filters.status);
      if (filters.from)     p.set("from", filters.from);
      if (filters.to)       p.set("to", filters.to);
      if (filters.driverId) p.set("driverId", filters.driverId);
      const res = await fetch(`/api/payroll/earnings?${p}`, { credentials: "include" });
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/payroll/earnings", {
      ...addForm,
      hoursWorked: addForm.hoursWorked ? Number(addForm.hoursWorked) : undefined,
      moveCount: addForm.moveCount ? Number(addForm.moveCount) : undefined,
      milesLogged: addForm.milesLogged ? Number(addForm.milesLogged) : undefined,
      baseAmount: Number(addForm.baseAmount || 0),
      otAmount: Number(addForm.otAmount || 0),
      bonusAmount: Number(addForm.bonusAmount || 0),
      adjustmentAmount: Number(addForm.adjustmentAmount || 0),
    }),
    onSuccess: () => {
      setAddOpen(false);
      setAddForm({ driverId: driverId ?? "", earningDate: "", payType: "per_move", description: "",
        hoursWorked: "", moveCount: "", milesLogged: "", baseAmount: "", otAmount: "", bonusAmount: "", adjustmentAmount: "" });
      refetch();
      toast({ title: "Earnings record created" });
    },
    onError: () => toast({ title: "Failed to create earnings record", variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/payroll/earnings/${id}`, { status }),
    onSuccess: () => { refetch(); toast({ title: "Status updated" }); },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  const earnings = data?.earnings ?? [];
  const totalAmt = earnings.filter(e => e.status !== "voided").reduce((s: number, e: any) => s + Number(e.totalAmount), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Records", value: earnings.length, icon: ListChecks },
          { label: "Total Amount", value: fmtMoney(totalAmt), icon: DollarSign },
          { label: "Pending", value: earnings.filter((e: any) => e.status === "pending").length, icon: Clock },
          { label: "Paid", value: fmtMoney(earnings.filter((e: any) => e.status === "paid").reduce((s: number, e: any) => s + Number(e.totalAmount), 0)), icon: CheckCircle2 },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
              <p className="text-xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filters.status || "all"} onValueChange={v => setFilters(f => ({ ...f, status: v === "all" ? "" : v }))}>
          <SelectTrigger className="w-36" data-testid="select-earnings-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {["pending","approved","paid","voided"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" className="w-36" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} placeholder="From" />
        <Input type="date" className="w-36" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} placeholder="To" />
        {!driverId && (
          <Input className="w-48" value={filters.driverId} onChange={e => setFilters(f => ({ ...f, driverId: e.target.value }))} placeholder="Driver ID..." />
        )}
        <Button variant="ghost" size="icon" onClick={() => refetch()} data-testid="button-refresh-earnings"><RefreshCw className="h-4 w-4" /></Button>
        <div className="flex-1" />
        <Button onClick={() => setAddOpen(true)} data-testid="button-add-earnings"><Plus className="h-4 w-4 mr-1" />Add Manual Earning</Button>
      </div>

      <Card>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
          ) : earnings.length === 0 ? (
            <div className="py-16 text-center">
              <DollarSign className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">No earnings records found</p>
              <p className="text-xs text-muted-foreground mt-1">Adjust filters or add a manual earning to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-3 px-3 font-medium">Date</th>
                    <th className="text-left py-3 px-3 font-medium">Driver</th>
                    <th className="text-left py-3 px-3 font-medium">Pay Type</th>
                    <th className="text-left py-3 px-3 font-medium">Description</th>
                    <th className="text-right py-3 px-3 font-medium">Base</th>
                    <th className="text-right py-3 px-3 font-medium">OT</th>
                    <th className="text-right py-3 px-3 font-medium">Bonus</th>
                    <th className="text-right py-3 px-3 font-medium">Total</th>
                    <th className="text-left py-3 px-3 font-medium">Status</th>
                    <th className="py-3 px-3" />
                  </tr>
                </thead>
                <tbody>
                  {earnings.map((e: any) => (
                    <tr key={e.id} className="border-b last:border-0 hover-elevate" data-testid={`row-earning-${e.id}`}>
                      <td className="py-2.5 px-3 text-muted-foreground">{fmtDate(e.earningDate)}</td>
                      <td className="py-2.5 px-3 font-mono text-xs">{e.driverId.slice(0, 8)}…</td>
                      <td className="py-2.5 px-3"><Badge variant="outline" className="text-xs">{e.payType.replace(/_/g, " ")}</Badge></td>
                      <td className="py-2.5 px-3 text-muted-foreground max-w-xs truncate">{e.description || "—"}</td>
                      <td className="py-2.5 px-3 text-right">{fmtMoney(e.baseAmount)}</td>
                      <td className="py-2.5 px-3 text-right">{Number(e.otAmount) > 0 ? fmtMoney(e.otAmount) : "—"}</td>
                      <td className="py-2.5 px-3 text-right">{Number(e.bonusAmount) > 0 ? fmtMoney(e.bonusAmount) : "—"}</td>
                      <td className="py-2.5 px-3 text-right font-semibold">{fmtMoney(e.totalAmount)}</td>
                      <td className="py-2.5 px-3"><StatusBadgeLocal status={e.status} /></td>
                      <td className="py-2.5 px-3">
                        {e.status === "pending" && (
                          <Button variant="ghost" size="default" className="text-xs h-7"
                            onClick={() => patchMutation.mutate({ id: e.id, status: "approved" })}
                            disabled={patchMutation.isPending}
                            data-testid={`button-approve-${e.id}`}
                          >
                            Approve
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Manual Earnings Record</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Driver ID *</label>
                <Input value={addForm.driverId} onChange={e => setAddForm(f => ({ ...f, driverId: e.target.value }))} placeholder="driver UUID" data-testid="input-add-driver-id" disabled={!!driverId} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Earning Date *</label>
                <Input type="date" value={addForm.earningDate} onChange={e => setAddForm(f => ({ ...f, earningDate: e.target.value }))} data-testid="input-add-earning-date" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Pay Type</label>
                <Select value={addForm.payType} onValueChange={v => setAddForm(f => ({ ...f, payType: v }))}>
                  <SelectTrigger data-testid="select-add-pay-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["hourly","per_move","per_mile","salary","hybrid"].map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Hours Worked</label>
                <Input type="number" step="0.01" value={addForm.hoursWorked} onChange={e => setAddForm(f => ({ ...f, hoursWorked: e.target.value }))} data-testid="input-add-hours" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Move Count</label>
                <Input type="number" value={addForm.moveCount} onChange={e => setAddForm(f => ({ ...f, moveCount: e.target.value }))} data-testid="input-add-moves" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Miles Logged</label>
                <Input type="number" step="0.01" value={addForm.milesLogged} onChange={e => setAddForm(f => ({ ...f, milesLogged: e.target.value }))} data-testid="input-add-miles" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Base Amount ($)</label>
                <Input type="number" step="0.01" value={addForm.baseAmount} onChange={e => setAddForm(f => ({ ...f, baseAmount: e.target.value }))} data-testid="input-add-base" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">OT Amount ($)</label>
                <Input type="number" step="0.01" value={addForm.otAmount} onChange={e => setAddForm(f => ({ ...f, otAmount: e.target.value }))} data-testid="input-add-ot" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Bonus Amount ($)</label>
                <Input type="number" step="0.01" value={addForm.bonusAmount} onChange={e => setAddForm(f => ({ ...f, bonusAmount: e.target.value }))} data-testid="input-add-bonus" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Adjustment ($)</label>
                <Input type="number" step="0.01" value={addForm.adjustmentAmount} onChange={e => setAddForm(f => ({ ...f, adjustmentAmount: e.target.value }))} data-testid="input-add-adjustment" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
              <Input value={addForm.description} onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))} data-testid="input-add-description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !addForm.driverId || !addForm.earningDate} data-testid="button-submit-earnings">
              {addMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Batches Tab ──────────────────────────────────────────────────────────────

function BatchesTab() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ weekStart: "", weekEnd: "", payGroup: "DRIVERS_WEEKLY", notes: "" });
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<{ batches: any[] }>({
    queryKey: ["/api/payroll/batches"],
  });

  const { data: batchDetail } = useQuery<{ batch: any; rawEarnings: any[]; driverGroups: any[] }>({
    queryKey: ["/api/payroll/batches", selectedBatchId],
    enabled: !!selectedBatchId,
  });

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/payroll/batches", createForm),
    onSuccess: () => {
      setCreateOpen(false);
      setCreateForm({ weekStart: "", weekEnd: "", payGroup: "DRIVERS_WEEKLY", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/batches"] });
      toast({ title: "Batch created" });
    },
    onError: () => toast({ title: "Failed to create batch", variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/payroll/batches/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/batches"] });
      if (selectedBatchId) queryClient.invalidateQueries({ queryKey: ["/api/payroll/batches", selectedBatchId] });
      toast({ title: "Batch status updated" });
    },
    onError: () => toast({ title: "Failed to update batch", variant: "destructive" }),
  });

  const NEXT_STATUS: Record<string, { label: string; next: string }> = {
    open:         { label: "Submit for Review", next: "under_review" },
    under_review: { label: "Approve Batch",    next: "approved" },
    approved:     { label: "Mark as Paid",     next: "paid" },
  };

  const batches = data?.batches ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">Payroll Batches</h3>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
          <Button size="default" onClick={() => setCreateOpen(true)} data-testid="button-create-batch">
            <Plus className="h-4 w-4 mr-1" />New Batch
          </Button>
        </div>
        {isLoading ? (
          <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
        ) : batches.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">No batches yet</p>
              <p className="text-xs text-muted-foreground mt-1">Create a weekly batch to group driver earnings.</p>
            </CardContent>
          </Card>
        ) : batches.map((b: any) => (
          <div
            key={b.id}
            className={`rounded-lg border p-3 cursor-pointer transition-all hover-elevate ${selectedBatchId === b.id ? "border-primary bg-primary/5" : ""}`}
            onClick={() => setSelectedBatchId(b.id)}
            data-testid={`card-batch-${b.id}`}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-sm font-medium">{b.payGroup.replace(/_/g, " ")}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(b.weekStart)} – {fmtDate(b.weekEnd)}</p>
              </div>
              <StatusBadgeLocal status={b.status} />
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span><Users className="h-3 w-3 inline mr-0.5" />{b.driverCount} drivers</span>
              <span className="font-semibold text-foreground">{fmtMoney((b.totalAmountCents ?? 0) / 100)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="lg:col-span-3">
        {!selectedBatchId ? (
          <Card>
            <CardContent className="py-16 text-center">
              <ChevronRight className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Select a batch to view details</p>
            </CardContent>
          </Card>
        ) : !batchDetail ? (
          <Card><CardContent className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></CardContent></Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex-1">
                  <CardTitle>{batchDetail.batch.payGroup.replace(/_/g, " ")}</CardTitle>
                  <CardDescription>{fmtDate(batchDetail.batch.weekStart)} – {fmtDate(batchDetail.batch.weekEnd)}</CardDescription>
                </div>
                <StatusBadgeLocal status={batchDetail.batch.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md bg-muted/40 p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-0.5">Drivers</p>
                  <p className="text-xl font-bold">{batchDetail.batch.driverCount}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-0.5">Records</p>
                  <p className="text-xl font-bold">{batchDetail.rawEarnings.length}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-0.5">Total</p>
                  <p className="text-xl font-bold">{fmtMoney((batchDetail.batch.totalAmountCents ?? 0) / 100)}</p>
                </div>
              </div>

              {NEXT_STATUS[batchDetail.batch.status] && (
                <Button
                  className="w-full"
                  onClick={() => statusMutation.mutate({ id: selectedBatchId, status: NEXT_STATUS[batchDetail.batch.status].next })}
                  disabled={statusMutation.isPending}
                  data-testid="button-advance-batch-status"
                >
                  {statusMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {NEXT_STATUS[batchDetail.batch.status].label}
                </Button>
              )}

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Driver Breakdown</p>
                {batchDetail.driverGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No earnings assigned to this batch yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {batchDetail.driverGroups.map((g: any) => (
                      <div key={g.driverId} className="flex items-center justify-between rounded-md px-3 py-2 bg-muted/30 text-sm" data-testid={`row-batch-driver-${g.driverId}`}>
                        <span className="font-mono text-xs text-muted-foreground">{g.driverId.slice(0, 8)}…</span>
                        <span className="text-xs text-muted-foreground">{g.earnings.length} record(s)</span>
                        <span className="font-semibold">{fmtMoney(g.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Create Payroll Batch</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Week Start *</label>
              <Input type="date" value={createForm.weekStart} onChange={e => setCreateForm(f => ({ ...f, weekStart: e.target.value }))} data-testid="input-batch-week-start" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Week End *</label>
              <Input type="date" value={createForm.weekEnd} onChange={e => setCreateForm(f => ({ ...f, weekEnd: e.target.value }))} data-testid="input-batch-week-end" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Pay Group</label>
              <Select value={createForm.payGroup} onValueChange={v => setCreateForm(f => ({ ...f, payGroup: v }))}>
                <SelectTrigger data-testid="select-batch-pay-group"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRIVERS_WEEKLY">Drivers Weekly</SelectItem>
                  <SelectItem value="DRIVERS_W2_WEEKLY">W2 Drivers Weekly</SelectItem>
                  <SelectItem value="DRIVERS_IC_WEEKLY">IC Drivers Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
              <Input value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))} data-testid="input-batch-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !createForm.weekStart || !createForm.weekEnd} data-testid="button-submit-batch">
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create Batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type PayrollTab = "overview" | "pay-periods" | "earnings" | "batches";

export default function PayrollModule() {
  const [tab, setTab] = useState<PayrollTab>("overview");

  const tabs: { value: PayrollTab; label: string }[] = [
    { value: "overview",    label: "Overview" },
    { value: "pay-periods", label: "Pay Periods" },
    { value: "earnings",    label: "Earnings" },
    { value: "batches",     label: "Batches" },
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-primary" />
          Payroll
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Payroll visibility and reconciliation — earnings, pay periods, and batch management.
        </p>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map(t => (
          <button
            key={t.value}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.value ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            onClick={() => setTab(t.value)}
            data-testid={`tab-${t.value}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview"    && <OverviewTab />}
      {tab === "pay-periods" && <PayPeriodsTab />}
      {tab === "earnings"    && <EarningsTab />}
      {tab === "batches"     && <BatchesTab />}
    </div>
  );
}

// ─── Driver Payroll Tab (exported for use in DriverDetail) ─────────────────────

export function DriverPayrollTab({ driverId }: { driverId: string }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: payPeriods = [], isLoading: periodsLoading } = useQuery<PayPeriodSummary[]>({
    queryKey: ["/api/corporate/pay-periods"],
  });

  return (
    <div className="space-y-6" data-testid="driver-payroll-tab">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="font-semibold text-base">Payroll</h3>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">From</label>
          <Input type="date" className="w-36" value={dateFrom} onChange={e => setDateFrom(e.target.value)} data-testid="input-payroll-from" />
          <label className="text-xs text-muted-foreground">To</label>
          <Input type="date" className="w-36" value={dateTo} onChange={e => setDateTo(e.target.value)} data-testid="input-payroll-to" />
        </div>
      </div>

      <EarningsTab driverId={driverId} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Pay Periods
          </CardTitle>
          <CardDescription>Historical pay periods this driver participated in</CardDescription>
        </CardHeader>
        <CardContent>
          {periodsLoading ? (
            <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
          ) : payPeriods.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No pay period data available</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Gross Pay</TableHead>
                  <TableHead className="text-right">Net Pay</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payPeriods.slice(0, 10).map((period) => (
                  <TableRow key={period.id} data-testid={`row-driver-period-${period.id}`}>
                    <TableCell className="font-medium text-sm">
                      {formatDate(period.startDate)} — {formatDate(period.endDate)}
                    </TableCell>
                    <TableCell className="text-right text-sm">{fmtMoney(period.totalGrossPay)}</TableCell>
                    <TableCell className="text-right text-sm">{fmtMoney(period.totalNetPay)}</TableCell>
                    <TableCell><StatusBadge status={period.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
