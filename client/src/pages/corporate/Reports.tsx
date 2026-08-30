import { useState, lazy, Suspense } from "react";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { getStatusBadgeClass } from "@/lib/statusColors";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FileText, Download, BarChart3, TrendingUp, Users, DollarSign, Truck, Receipt, Calendar, Filter, RefreshCw, Car, Activity, ChevronRight, PieChart, ShieldAlert, Briefcase, TableIcon, Sparkles, AlertTriangle } from "lucide-react";
import { formatDate } from "@/lib/dateFormat";
import type { DriverWithUser, Expense, Invoice, Trip } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";

// Lazy-load heavy inline report workspaces so a module error in either does not
// crash the Reports landing page (the parent has a PageErrorBoundary in App.tsx,
// but lazy + Suspense gives us an additional isolation layer).
const RideshareInlineView = lazy(() => import("@/pages/corporate/reports/RideshareInlineView"));
const OpenForceReconciliation = lazy(() => import("@/pages/corporate/reports/OpenForceReconciliation"));

const RIDESHARE_ALLOWED_ROLES = new Set([
  "super_admin", "super_user", "admin", "corporate_admin", "finance",
]);

function canAccessRideshare(role: string | null | undefined): boolean {
  return !!role && RIDESHARE_ALLOWED_ROLES.has(role);
}

type ReportType = "drivers" | "expenses" | "invoices" | "trips" | "summary" | "rideshare" | "openforce";

interface ReportConfig {
  type: ReportType;
  dateFrom: string;
  dateTo: string;
  status?: string;
  category?: string;
  provider?: string;
}

export default function Reports() {
  const { user } = useAuth();
  const hasRideshareAccess = canAccessRideshare(user?.role);
  const [reportConfig, setReportConfig] = useState<ReportConfig>({
    type: "summary",
    dateFrom: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split("T")[0],
    dateTo: new Date().toISOString().split("T")[0],
  });
  const [generatedReport, setGeneratedReport] = useState<ReportType | null>(null);

  // throwOnError: false — if any of these APIs fail (network error, 403, session expiry)
  // the query enters an error state rather than throwing, which would propagate past the
  // Suspense boundary and blank the whole page. PageErrorBoundary in App.tsx is the last
  // line of defence; these query options keep the landing page functional even under failure.
  const { data: drivers = [], isLoading: driversLoading, isError: driversError } = useQuery<DriverWithUser[]>({
    queryKey: ["/api/corporate/drivers"],
    throwOnError: false,
  });

  const { data: expenses = [], isLoading: expensesLoading, isError: expensesError } = useQuery<Expense[]>({
    queryKey: ["/api/corporate/expenses"],
    throwOnError: false,
  });

  const { data: invoices = [], isLoading: invoicesLoading, isError: invoicesError } = useQuery<Invoice[]>({
    queryKey: ["/api/corporate/invoices"],
    throwOnError: false,
  });

  // /api/corporate/trips is a paginated endpoint — it returns { trips: Trip[], total: number }.
  // Use `select` to extract the array so the component always receives Trip[].
  const { data: trips = [], isLoading: tripsLoading, isError: tripsError } = useQuery<any, Error, Trip[]>({
    queryKey: ["/api/corporate/trips"],
    throwOnError: false,
    select: (raw: any): Trip[] => {
      if (Array.isArray(raw)) return raw;
      if (raw && Array.isArray(raw.trips)) return raw.trips;
      return [];
    },
  });

  const isLoading = driversLoading || expensesLoading || invoicesLoading || tripsLoading;
  const hasDataError = driversError || expensesError || invoicesError || tripsError;

  const filterByDateRange = <T extends { createdAt?: Date | string | null }>(items: T[], dateField?: keyof T): T[] => {
    // Guard: callers pass query data which is always expected to be an array but may not be
    // if an API shape changes (e.g. paginated response returned instead of plain array).
    if (!Array.isArray(items)) return [];
    const from = new Date(reportConfig.dateFrom);
    const to = new Date(reportConfig.dateTo);
    to.setHours(23, 59, 59, 999);

    return items.filter((item) => {
      const field = dateField || "createdAt";
      const itemDate = new Date(item[field] as string);
      return itemDate >= from && itemDate <= to;
    });
  };

  const filteredExpenses = filterByDateRange(expenses).filter((e) => {
    if (reportConfig.status && e.status !== reportConfig.status) return false;
    if (reportConfig.category && e.category !== reportConfig.category) return false;
    return true;
  });

  const filteredInvoices = filterByDateRange(invoices).filter((e) => {
    if (reportConfig.status && e.status !== reportConfig.status) return false;
    return true;
  });

  const filteredTrips = filterByDateRange(trips);

  const totalExpenseAmount = filteredExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const totalInvoiceAmount = filteredInvoices.reduce((sum, i) => sum + Number(i.totalAmount || 0), 0);
  const paidInvoiceAmount = filteredInvoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + Number(i.paidAmount || 0), 0);

  const handleGenerateReport = () => {
    setGeneratedReport(reportConfig.type);
  };

  const handleExportCSV = () => {
    let csvContent = "";
    let filename = "";

    switch (generatedReport) {
      case "drivers":
        csvContent = "ID,Name,Email,Phone,Status,License Number,License Expiry\n";
        drivers.forEach((d) => {
          csvContent += `${d.id},"${d.user.firstName || ""} ${d.user.lastName || ""}",${d.user.email || ""},${d.phoneNumber || ""},${d.status},${d.licenseNumber || ""},${d.licenseExpiration || ""}\n`;
        });
        filename = "drivers_report.csv";
        break;
      case "expenses":
        csvContent = "ID,Category,Amount,Date,Status,Description\n";
        filteredExpenses.forEach((e) => {
          csvContent += `${e.id},${e.category},${e.amount},${e.expenseDate},${e.status},"${e.description || ""}"\n`;
        });
        filename = "expenses_report.csv";
        break;
      case "invoices":
        csvContent = "Invoice Number,Customer,Total Amount,Paid Amount,Status,Invoice Date,Due Date\n";
        filteredInvoices.forEach((i) => {
          csvContent += `${i.invoiceNumber},"${i.customerName}",${i.totalAmount},${i.paidAmount || 0},${i.status},${i.invoiceDate},${i.dueDate}\n`;
        });
        filename = "invoices_report.csv";
        break;
      case "trips":
        csvContent = "ID,Driver ID,Origin,Destination,Status,Distance,Created At\n";
        filteredTrips.forEach((t) => {
          csvContent += `${t.id},${t.driverId},"${t.origin || ""}","${t.destination || ""}",${t.status},${t.distance || ""},${t.createdAt}\n`;
        });
        filename = "trips_report.csv";
        break;
      case "summary":
        csvContent = "Metric,Value\n";
        csvContent += `Total Drivers,${drivers.length}\n`;
        csvContent += `Active Drivers,${drivers.filter((d) => d.status === "active").length}\n`;
        csvContent += `Total Expenses,${filteredExpenses.length}\n`;
        csvContent += `Total Expense Amount,$${totalExpenseAmount.toFixed(2)}\n`;
        csvContent += `Total Invoices,${filteredInvoices.length}\n`;
        csvContent += `Total Invoice Amount,$${totalInvoiceAmount.toFixed(2)}\n`;
        csvContent += `Paid Invoice Amount,$${paidInvoiceAmount.toFixed(2)}\n`;
        csvContent += `Total Trips,${filteredTrips.length}\n`;
        filename = "summary_report.csv";
        break;
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Reports</h1>
        <p className="text-muted-foreground">DriverHub 360 Custom Reporting Tool</p>
      </div>

      {/* Non-fatal data error banner — individual report modules that failed to load
          are shown as empty; this banner lets the user know and retry without losing
          access to the rest of the reporting module. */}
      {hasDataError && (
        <div className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Some report data could not be loaded. Report sections that depend on that data will appear empty.{" "}
            <button
              className="underline underline-offset-2 font-medium hover:no-underline"
              onClick={() => window.location.reload()}
            >
              Reload the page
            </button>{" "}
            to try again.
          </span>
        </div>
      )}

      {/* Analytics deep-dives */}
      {hasRideshareAccess && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Analytics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Link href="/reports/rideshare-optimization">
              <Card className="cursor-pointer hover-elevate" data-testid="card-analytics-rideshare-optimization">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-primary/10 shrink-0">
                      <Activity className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Driver Utilization vs Rideshare Optimization</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Recoverable spend, shift simulation, time-of-day analysis, driver idle detail</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/reports/rideshare">
              <Card className="cursor-pointer hover-elevate" data-testid="card-analytics-rideshare-reconciliation">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-primary/10 shrink-0">
                      <Car className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Rideshare Reconciliation &amp; Billing</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Import Uber/Lyft files, match to accounts, push to invoices</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/reports/openforce">
              <Card className="cursor-pointer hover-elevate" data-testid="card-analytics-openforce-reconciliation">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-primary/10 shrink-0">
                      <DollarSign className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">OpenForce Reconciliation &amp; Labor Cost</p>
                      <p className="text-xs text-muted-foreground mt-0.5">IC pay ingestion, driver matching, cost-per-move analysis, exception workflow</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/reports/account-profitability">
              <Card className="cursor-pointer hover-elevate" data-testid="card-analytics-account-profitability">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-primary/10 shrink-0">
                      <PieChart className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Account Profitability</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Gross profit engine — revenue vs labor + rideshare cost, margin %, anomaly alerts</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/reports/move-profitability">
              <Card className="cursor-pointer hover-elevate" data-testid="card-analytics-move-profitability">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-primary/10 shrink-0">
                      <Truck className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Move Profitability</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Move-level revenue, labor, rideshare cost, gross profit, and margin % — the most granular financial layer</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/exceptions">
              <Card className="cursor-pointer hover-elevate" data-testid="card-analytics-exceptions">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-destructive/10 shrink-0">
                      <ShieldAlert className="h-5 w-5 text-destructive" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Exception &amp; Compliance Dashboard</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Centralized risk control — all financial, pay, driver, and rideshare exceptions</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      )}

      {/* Drivers & Workforce */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Drivers &amp; Workforce</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Link href="/reports/driver-engagement">
            <Card className="cursor-pointer hover-elevate" data-testid="card-report-driver-engagement">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-primary/10 shrink-0">
                    <Activity className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Driver Engagement &amp; Retention</p>
                    <p className="text-xs text-muted-foreground mt-0.5">30/60/90-day shift hours per driver — Active, Declining, and at-risk classification</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/reports/workforce">
            <Card className="cursor-pointer hover-elevate" data-testid="card-report-driver-distribution">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-primary/10 shrink-0">
                    <TableIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Driver Distribution — Classification by State</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Pivot table of Employee vs Ind. Contractor by state — click any count to drill down and fix missing data</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/reports/drivers">
            <Card className="cursor-pointer hover-elevate" data-testid="card-report-drivers">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-primary/10 shrink-0">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Drivers Report</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Filtered driver list with status counts and direct drill-down to driver profiles</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* Custom Reporting */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Custom</h2>
        <div className="grid grid-cols-1 gap-3">
          <Link href="/reports/custom">
            <Card className="cursor-pointer hover-elevate" data-testid="card-report-custom-intelligence">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-primary/10 shrink-0">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Custom Reporting &amp; Intelligence</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Build, save, schedule, and share your own reports — with favourites and a full report library</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Report Configuration
          </CardTitle>
          <CardDescription>Configure your report parameters and generate custom reports</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="report-type">Report Type</Label>
              <Select
                value={reportConfig.type}
                onValueChange={(value: ReportType) => {
                  setReportConfig({ ...reportConfig, type: value, status: undefined, category: undefined, provider: undefined });
                  setGeneratedReport(null);
                }}
              >
                <SelectTrigger id="report-type" data-testid="select-report-type">
                  <SelectValue placeholder="Select report type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="summary">Summary Report</SelectItem>
                  <SelectItem value="drivers">Drivers Report</SelectItem>
                  <SelectItem value="expenses">Expenses Report</SelectItem>
                  <SelectItem value="invoices">Invoices Report</SelectItem>
                  <SelectItem value="trips">Trips Report</SelectItem>
                  {hasRideshareAccess && (
                    <SelectItem value="rideshare">Rideshare Reconciliation</SelectItem>
                  )}
                  {hasRideshareAccess && (
                    <SelectItem value="openforce">OpenForce Reconciliation</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {reportConfig.type !== "rideshare" && reportConfig.type !== "openforce" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="date-from">From Date</Label>
                  <Input
                    id="date-from"
                    type="date"
                    value={reportConfig.dateFrom}
                    onChange={(e) => setReportConfig({ ...reportConfig, dateFrom: e.target.value })}
                    data-testid="input-date-from"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="date-to">To Date</Label>
                  <Input
                    id="date-to"
                    type="date"
                    value={reportConfig.dateTo}
                    onChange={(e) => setReportConfig({ ...reportConfig, dateTo: e.target.value })}
                    data-testid="input-date-to"
                  />
                </div>
              </>
            )}

            {reportConfig.type === "expenses" && (
              <div className="space-y-2">
                <Label htmlFor="expense-status">Status Filter</Label>
                <Select
                  value={reportConfig.status || "all"}
                  onValueChange={(value) => setReportConfig({ ...reportConfig, status: value === "all" ? undefined : value })}
                >
                  <SelectTrigger id="expense-status" data-testid="select-expense-status">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="reimbursed">Reimbursed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {reportConfig.type === "invoices" && (
              <div className="space-y-2">
                <Label htmlFor="invoice-status">Status Filter</Label>
                <Select
                  value={reportConfig.status || "all"}
                  onValueChange={(value) => setReportConfig({ ...reportConfig, status: value === "all" ? undefined : value })}
                >
                  <SelectTrigger id="invoice-status" data-testid="select-invoice-status">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {reportConfig.type !== "rideshare" && reportConfig.type !== "openforce" && (
            <div className="flex gap-2">
              <Button onClick={handleGenerateReport} data-testid="button-generate-report">
                <BarChart3 className="h-4 w-4 mr-2" />
                Generate Report
              </Button>
              {generatedReport && (
                <Button variant="outline" onClick={handleExportCSV} data-testid="button-export-csv">
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              )}
            </div>
          )}

          {(reportConfig.type === "rideshare" || reportConfig.type === "openforce") && (
            <p className="text-sm text-muted-foreground">
              Use the sections below to import data, review reconciliation results, resolve exceptions, and generate historical reports.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Rideshare reconciliation workspace — lazy-loaded; nested PageErrorBoundary +
          Suspense ensures a render or chunk-load failure in this workspace is isolated
          and cannot blank the rest of the Reports page. */}
      {reportConfig.type === "rideshare" && (
        <PageErrorBoundary backTo="/reports" backLabel="Back to Reports" pageLabel="Rideshare Reconciliation Workspace">
          <Suspense fallback={<div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
            <RideshareInlineView />
          </Suspense>
        </PageErrorBoundary>
      )}

      {/* OpenForce reconciliation workspace — same isolation pattern */}
      {reportConfig.type === "openforce" && (
        <PageErrorBoundary backTo="/reports" backLabel="Back to Reports" pageLabel="OpenForce Reconciliation Workspace">
          <Suspense fallback={<div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
            <OpenForceReconciliation />
          </Suspense>
        </PageErrorBoundary>
      )}

      {generatedReport && reportConfig.type !== "rideshare" && reportConfig.type !== "openforce" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Report Results
              <Badge variant="secondary" className="ml-2">
                {formatDate(reportConfig.dateFrom)} - {formatDate(reportConfig.dateTo)}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {generatedReport === "summary" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-primary/10">
                          <Users className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Total Drivers</p>
                          <p className="text-2xl font-bold" data-testid="text-total-drivers">{drivers.length}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-green-500/10">
                          <TrendingUp className="h-6 w-6 text-green-500" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Active Drivers</p>
                          <p className="text-2xl font-bold" data-testid="text-active-drivers">
                            {drivers.filter((d) => d.status === "active").length}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-orange-500/10">
                          <Receipt className="h-6 w-6 text-orange-500" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Total Expenses</p>
                          <p className="text-2xl font-bold" data-testid="text-total-expenses">
                            ${totalExpenseAmount.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-blue-500/10">
                          <DollarSign className="h-6 w-6 text-blue-500" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Invoice Revenue</p>
                          <p className="text-2xl font-bold" data-testid="text-invoice-revenue">
                            ${paidInvoiceAmount.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Expense Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Pending</span>
                          <span className="font-medium">
                            ${filteredExpenses.filter((e) => e.status === "pending").reduce((s, e) => s + Number(e.amount), 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Approved</span>
                          <span className="font-medium">
                            ${filteredExpenses.filter((e) => e.status === "approved").reduce((s, e) => s + Number(e.amount), 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Reimbursed</span>
                          <span className="font-medium">
                            ${filteredExpenses.filter((e) => e.status === "reimbursed").reduce((s, e) => s + Number(e.amount), 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Rejected</span>
                          <span className="font-medium">
                            ${filteredExpenses.filter((e) => e.status === "rejected").reduce((s, e) => s + Number(e.amount), 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Invoice Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Draft</span>
                          <span className="font-medium">
                            ${filteredInvoices.filter((i) => i.status === "draft").reduce((s, i) => s + Number(i.totalAmount), 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Sent</span>
                          <span className="font-medium">
                            ${filteredInvoices.filter((i) => i.status === "sent").reduce((s, i) => s + Number(i.totalAmount), 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Paid</span>
                          <span className="font-medium">
                            ${filteredInvoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.paidAmount || 0), 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Overdue</span>
                          <span className="font-medium">
                            ${filteredInvoices.filter((i) => i.status === "overdue").reduce((s, i) => s + Number(i.totalAmount), 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Operations Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-4 rounded-lg bg-muted/50">
                        <Truck className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-2xl font-bold">{filteredTrips.length}</p>
                        <p className="text-sm text-muted-foreground">Total Trips</p>
                      </div>
                      <div className="text-center p-4 rounded-lg bg-muted/50">
                        <Receipt className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-2xl font-bold">{filteredExpenses.length}</p>
                        <p className="text-sm text-muted-foreground">Expense Records</p>
                      </div>
                      <div className="text-center p-4 rounded-lg bg-muted/50">
                        <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-2xl font-bold">{filteredInvoices.length}</p>
                        <p className="text-sm text-muted-foreground">Invoices</p>
                      </div>
                      <div className="text-center p-4 rounded-lg bg-muted/50">
                        <Calendar className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-2xl font-bold">
                          {Math.ceil((new Date(reportConfig.dateTo).getTime() - new Date(reportConfig.dateFrom).getTime()) / (1000 * 60 * 60 * 24))}
                        </p>
                        <p className="text-sm text-muted-foreground">Days in Range</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {generatedReport === "drivers" && (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>License #</TableHead>
                      <TableHead>License Expiry</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drivers.map((driver) => (
                      <TableRow key={driver.id} data-testid={`row-driver-${driver.id}`}>
                        <TableCell className="font-medium">{driver.user.firstName} {driver.user.lastName}</TableCell>
                        <TableCell>{driver.user.email || "-"}</TableCell>
                        <TableCell>{driver.phoneNumber || "-"}</TableCell>
                        <TableCell>
                          <StatusBadge status={driver.status} />
                        </TableCell>
                        <TableCell>{driver.licenseNumber || "-"}</TableCell>
                        <TableCell>{driver.licenseExpiration ? formatDate(driver.licenseExpiration) : "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {generatedReport === "expenses" && (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenses.map((expense) => (
                      <TableRow key={expense.id} data-testid={`row-expense-${expense.id}`}>
                        <TableCell>{formatDate(expense.expenseDate)}</TableCell>
                        <TableCell className="capitalize">{expense.category}</TableCell>
                        <TableCell className="font-medium">${Number(expense.amount).toFixed(2)}</TableCell>
                        <TableCell className="max-w-xs truncate">{expense.description || "-"}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              expense.status === "approved" || expense.status === "reimbursed"
                                ? "default"
                                : expense.status === "rejected"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {expense.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredExpenses.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No expenses found for the selected date range and filters
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {generatedReport === "invoices" && (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Invoice Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((invoice) => (
                      <TableRow key={invoice.id} data-testid={`row-invoice-${invoice.id}`}>
                        <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                        <TableCell>{invoice.customerName}</TableCell>
                        <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
                        <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                        <TableCell>${Number(invoice.totalAmount).toFixed(2)}</TableCell>
                        <TableCell>${Number(invoice.paidAmount || 0).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              invoice.status === "paid"
                                ? "default"
                                : invoice.status === "overdue"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {invoice.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredInvoices.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No invoices found for the selected date range and filters
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {generatedReport === "trips" && (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Origin</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Distance</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTrips.map((trip) => (
                      <TableRow key={trip.id} data-testid={`row-trip-${trip.id}`}>
                        <TableCell className="font-medium">{trip.id}</TableCell>
                        <TableCell>{trip.origin || "-"}</TableCell>
                        <TableCell>{trip.destination || "-"}</TableCell>
                        <TableCell>
                          <StatusBadge status={trip.status} />
                        </TableCell>
                        <TableCell>{trip.distance ? `${trip.distance} mi` : "-"}</TableCell>
                        <TableCell>{trip.createdAt ? formatDate(trip.createdAt) : "-"}</TableCell>
                      </TableRow>
                    ))}
                    {filteredTrips.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No trips found for the selected date range
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
