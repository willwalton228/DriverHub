import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  TrendingDown,
  AlertTriangle, 
  DollarSign, 
  Calendar,
  Clock,
  Download,
  BarChart3,
  Users,
  Mail,
  Filter,
  RefreshCw
} from "lucide-react";

interface DsoTrendItem {
  month: string;
  dso: number;
  totalAr: string;
  avgDailySales: string;
}

interface OverdueExposureItem {
  bucket: string;
  bucketLabel: string;
  count: number;
  amount: string;
  percentage: number;
}

interface TopOverdueCustomer {
  customerId: string;
  customerName: string;
  overdueAmount: string;
  overdueInvoiceCount: number;
  oldestInvoiceDays: number;
  oldestInvoiceDate: string;
}

interface ReminderEffectivenessData {
  totalRemindersSent: number;
  paidWithin7Days: number;
  paidWithin7DaysPercent: number;
  avgDaysToPayment: number;
  byReminderType: {
    reminderType: string;
    count: number;
    paidWithin7Days: number;
    paidWithin7DaysPercent: number;
    avgDaysToPayment: number;
  }[];
}

interface Customer {
  id: string;
  companyName: string;
}

export default function RevenueReports() {
  const [activeTab, setActiveTab] = useState("dso");
  const [dateRange, setDateRange] = useState({
    startDate: "",
    endDate: "",
  });
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (dateRange.startDate) params.append("startDate", dateRange.startDate);
    if (dateRange.endDate) params.append("endDate", dateRange.endDate);
    if (selectedCustomerId && selectedCustomerId !== "all") params.append("customerId", selectedCustomerId);
    return params.toString();
  };

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: dsoTrend, isLoading: dsoLoading, refetch: refetchDso } = useQuery<DsoTrendItem[]>({
    queryKey: ["/api/reports/revenue/dso-trend", dateRange, selectedCustomerId],
    queryFn: async () => {
      const params = buildQueryParams();
      const response = await fetch(`/api/reports/revenue/dso-trend?${params}`);
      if (!response.ok) throw new Error("Failed to fetch DSO trend");
      return response.json();
    },
  });

  const { data: overdueExposure, isLoading: overdueLoading, refetch: refetchOverdue } = useQuery<OverdueExposureItem[]>({
    queryKey: ["/api/reports/revenue/overdue-exposure", dateRange, selectedCustomerId],
    queryFn: async () => {
      const params = buildQueryParams();
      const response = await fetch(`/api/reports/revenue/overdue-exposure?${params}`);
      if (!response.ok) throw new Error("Failed to fetch overdue exposure");
      return response.json();
    },
  });

  const { data: topOverdueCustomers, isLoading: topOverdueLoading, refetch: refetchTopOverdue } = useQuery<TopOverdueCustomer[]>({
    queryKey: ["/api/reports/revenue/top-overdue-customers", dateRange, selectedCustomerId],
    queryFn: async () => {
      const params = buildQueryParams();
      params.append("limit", "10");
      const response = await fetch(`/api/reports/revenue/top-overdue-customers?${params}`);
      if (!response.ok) throw new Error("Failed to fetch top overdue customers");
      return response.json();
    },
  });

  const { data: reminderEffectiveness, isLoading: reminderLoading, refetch: refetchReminder } = useQuery<ReminderEffectivenessData>({
    queryKey: ["/api/reports/revenue/reminder-effectiveness", dateRange, selectedCustomerId],
    queryFn: async () => {
      const params = buildQueryParams();
      const response = await fetch(`/api/reports/revenue/reminder-effectiveness?${params}`);
      if (!response.ok) throw new Error("Failed to fetch reminder effectiveness");
      return response.json();
    },
  });

  const handleRefresh = () => {
    refetchDso();
    refetchOverdue();
    refetchTopOverdue();
    refetchReminder();
  };

  const handleExport = (reportType: string) => {
    const params = buildQueryParams();
    window.open(`/api/reports/revenue/${reportType}/export?${params}`, "_blank");
  };

  const clearFilters = () => {
    setDateRange({ startDate: "", endDate: "" });
    setSelectedCustomerId("");
  };

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
  };

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };

  const getDsoTrend = (current: number, previous: number) => {
    if (previous === 0) return null;
    const change = current - previous;
    return { change, improving: change < 0 };
  };

  const getBucketColor = (bucket: string) => {
    switch (bucket) {
      case "current": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "1-30": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "31-60": return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      case "61-90": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "90+": return "bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-100";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Revenue Reports</h1>
          <p className="text-muted-foreground">DSO trends, overdue exposure, and collections effectiveness</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} data-testid="button-refresh">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
            Clear Filters
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                data-testid="input-start-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                data-testid="input-end-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer">Customer</Label>
              <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                <SelectTrigger id="customer" data-testid="select-customer">
                  <SelectValue placeholder="All Customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers?.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dso" data-testid="tab-dso">
            <TrendingUp className="w-4 h-4 mr-2" />
            DSO Trend
          </TabsTrigger>
          <TabsTrigger value="exposure" data-testid="tab-exposure">
            <BarChart3 className="w-4 h-4 mr-2" />
            Overdue Exposure
          </TabsTrigger>
          <TabsTrigger value="customers" data-testid="tab-customers">
            <Users className="w-4 h-4 mr-2" />
            Top Overdue
          </TabsTrigger>
          <TabsTrigger value="reminders" data-testid="tab-reminders">
            <Mail className="w-4 h-4 mr-2" />
            Reminder Effectiveness
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dso" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
              <div>
                <CardTitle>DSO Trend (6 Months Rolling)</CardTitle>
                <CardDescription>Days Sales Outstanding measures how quickly you collect payments</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleExport("dso-trend")} data-testid="button-export-dso">
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {dsoLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !dsoTrend || dsoTrend.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No DSO data available for the selected period.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-2xl font-bold" data-testid="text-current-dso">
                          {dsoTrend[dsoTrend.length - 1]?.dso || 0} days
                        </div>
                        <p className="text-sm text-muted-foreground">Current DSO</p>
                        {dsoTrend.length > 1 && (() => {
                          const trend = getDsoTrend(
                            dsoTrend[dsoTrend.length - 1]?.dso || 0,
                            dsoTrend[dsoTrend.length - 2]?.dso || 0
                          );
                          if (!trend) return null;
                          return (
                            <div className={`flex items-center text-sm mt-1 ${trend.improving ? "text-green-600" : "text-red-600"}`}>
                              {trend.improving ? <TrendingDown className="w-4 h-4 mr-1" /> : <TrendingUp className="w-4 h-4 mr-1" />}
                              {Math.abs(trend.change)} days {trend.improving ? "improvement" : "increase"}
                            </div>
                          );
                        })()}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-2xl font-bold" data-testid="text-total-ar">
                          {formatCurrency(dsoTrend[dsoTrend.length - 1]?.totalAr || "0")}
                        </div>
                        <p className="text-sm text-muted-foreground">Total AR</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-2xl font-bold" data-testid="text-avg-daily-sales">
                          {formatCurrency(dsoTrend[dsoTrend.length - 1]?.avgDailySales || "0")}
                        </div>
                        <p className="text-sm text-muted-foreground">Avg Daily Sales</p>
                      </CardContent>
                    </Card>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-right">DSO (Days)</TableHead>
                        <TableHead className="text-right">Total AR</TableHead>
                        <TableHead className="text-right">Avg Daily Sales</TableHead>
                        <TableHead className="text-right">Trend</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dsoTrend.map((row, index) => {
                        const trend = index > 0 ? getDsoTrend(row.dso, dsoTrend[index - 1].dso) : null;
                        return (
                          <TableRow key={row.month} data-testid={`row-dso-${row.month}`}>
                            <TableCell className="font-medium">{formatMonth(row.month)}</TableCell>
                            <TableCell className="text-right">{row.dso}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.totalAr)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.avgDailySales)}</TableCell>
                            <TableCell className="text-right">
                              {trend && (
                                <span className={trend.improving ? "text-green-600" : "text-red-600"}>
                                  {trend.improving ? "-" : "+"}{Math.abs(trend.change)}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exposure" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
              <div>
                <CardTitle>Overdue Exposure by Aging Bucket</CardTitle>
                <CardDescription>Breakdown of outstanding invoices by days overdue</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleExport("overdue-exposure")} data-testid="button-export-exposure">
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {overdueLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : !overdueExposure || overdueExposure.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No overdue data available for the selected period.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                    {overdueExposure.map((bucket) => (
                      <Card key={bucket.bucket}>
                        <CardContent className="pt-4">
                          <Badge className={getBucketColor(bucket.bucket)}>{bucket.bucketLabel}</Badge>
                          <div className="text-xl font-bold mt-2" data-testid={`text-bucket-amount-${bucket.bucket}`}>
                            {formatCurrency(bucket.amount)}
                          </div>
                          <p className="text-sm text-muted-foreground">{bucket.count} invoices ({bucket.percentage}%)</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Aging Bucket</TableHead>
                        <TableHead className="text-right">Invoice Count</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">% of Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overdueExposure.map((row) => (
                        <TableRow key={row.bucket} data-testid={`row-exposure-${row.bucket}`}>
                          <TableCell>
                            <Badge className={getBucketColor(row.bucket)}>{row.bucketLabel}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{row.count}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.amount)}</TableCell>
                          <TableCell className="text-right">{row.percentage}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customers" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
              <div>
                <CardTitle>Top Overdue Customers</CardTitle>
                <CardDescription>Customers with the highest overdue balances</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleExport("top-overdue-customers")} data-testid="button-export-customers">
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {topOverdueLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !topOverdueCustomers || topOverdueCustomers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No overdue customers found.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Overdue Amount</TableHead>
                      <TableHead className="text-right">Overdue Invoices</TableHead>
                      <TableHead className="text-right">Oldest Invoice</TableHead>
                      <TableHead>Risk Level</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topOverdueCustomers.map((customer) => {
                      const riskLevel = customer.oldestInvoiceDays > 90 ? "high" : customer.oldestInvoiceDays > 60 ? "medium" : "low";
                      return (
                        <TableRow key={customer.customerId} data-testid={`row-customer-${customer.customerId}`}>
                          <TableCell className="font-medium">{customer.customerName}</TableCell>
                          <TableCell className="text-right font-semibold text-red-600">
                            {formatCurrency(customer.overdueAmount)}
                          </TableCell>
                          <TableCell className="text-right">{customer.overdueInvoiceCount}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end">
                              <span className="font-medium">{customer.oldestInvoiceDays} days</span>
                              <span className="text-xs text-muted-foreground">{customer.oldestInvoiceDate}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={riskLevel === "high" ? "destructive" : riskLevel === "medium" ? "secondary" : "outline"}>
                              {riskLevel === "high" && <AlertTriangle className="w-3 h-3 mr-1" />}
                              {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} Risk
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reminders" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
              <div>
                <CardTitle>Reminder Effectiveness</CardTitle>
                <CardDescription>How effective are payment reminders at driving collections</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleExport("reminder-effectiveness")} data-testid="button-export-reminders">
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {reminderLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : !reminderEffectiveness ? (
                <div className="text-center py-8 text-muted-foreground">
                  No reminder data available for the selected period.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-2xl font-bold" data-testid="text-total-reminders">
                          {reminderEffectiveness.totalRemindersSent}
                        </div>
                        <p className="text-sm text-muted-foreground">Total Reminders Sent</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-2xl font-bold text-green-600" data-testid="text-paid-7-days">
                          {reminderEffectiveness.paidWithin7Days}
                        </div>
                        <p className="text-sm text-muted-foreground">Paid Within 7 Days</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-2xl font-bold" data-testid="text-paid-7-days-percent">
                          {reminderEffectiveness.paidWithin7DaysPercent}%
                        </div>
                        <p className="text-sm text-muted-foreground">Conversion Rate</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-2xl font-bold" data-testid="text-avg-days-payment">
                          {reminderEffectiveness.avgDaysToPayment} days
                        </div>
                        <p className="text-sm text-muted-foreground">Avg Days to Payment</p>
                      </CardContent>
                    </Card>
                  </div>

                  {reminderEffectiveness.byReminderType.length > 0 && (
                    <>
                      <h3 className="text-lg font-semibold mb-4">Breakdown by Reminder Type</h3>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Reminder Type</TableHead>
                            <TableHead className="text-right">Count</TableHead>
                            <TableHead className="text-right">Paid in 7 Days</TableHead>
                            <TableHead className="text-right">Conversion %</TableHead>
                            <TableHead className="text-right">Avg Days to Payment</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reminderEffectiveness.byReminderType.map((type) => (
                            <TableRow key={type.reminderType} data-testid={`row-reminder-${type.reminderType}`}>
                              <TableCell className="font-medium capitalize">{type.reminderType.replace("_", " ")}</TableCell>
                              <TableCell className="text-right">{type.count}</TableCell>
                              <TableCell className="text-right">{type.paidWithin7Days}</TableCell>
                              <TableCell className="text-right">
                                <Badge variant={type.paidWithin7DaysPercent >= 50 ? "default" : "secondary"}>
                                  {type.paidWithin7DaysPercent}%
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">{type.avgDaysToPayment} days</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </>
                  )}

                  {reminderEffectiveness.byReminderType.length === 0 && (
                    <div className="text-center py-4 text-muted-foreground">
                      No breakdown by reminder type available.
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
