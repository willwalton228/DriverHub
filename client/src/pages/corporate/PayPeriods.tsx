import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar, DollarSign, Users, TrendingUp } from "lucide-react";
import { formatDate } from "@/lib/dateFormat";

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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export default function PayPeriods() {
  const { data: payPeriods = [], isLoading } = useQuery<PayPeriodSummary[]>({
    queryKey: ["/api/corporate/pay-periods"],
  });

  const totalGrossPay = payPeriods.reduce((sum, p) => sum + p.totalGrossPay, 0);
  const totalNetPay = payPeriods.reduce((sum, p) => sum + p.totalNetPay, 0);
  const totalTrips = payPeriods.reduce((sum, p) => sum + p.totalTrips, 0);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid md:grid-cols-4 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-pay-periods-title">Pay Periods</h1>
        <p className="text-muted-foreground mt-1">
          Overview of all pay periods and payroll summaries
        </p>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pay Periods</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Calendar className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-period-count">
              {payPeriods.length}
            </div>
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
            <div className="text-2xl font-bold" data-testid="text-total-gross">
              {formatCurrency(totalGrossPay)}
            </div>
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
            <div className="text-2xl font-bold" data-testid="text-total-net">
              {formatCurrency(totalNetPay)}
            </div>
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
            <div className="text-2xl font-bold" data-testid="text-total-trips">
              {totalTrips.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">All periods</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pay Periods Overview</CardTitle>
          <CardDescription>Summary of pay periods and payroll data</CardDescription>
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
                      {formatDate(period.startDate)} - {formatDate(period.endDate)}
                    </TableCell>
                    <TableCell className="text-right">{period.driverCount}</TableCell>
                    <TableCell className="text-right">{period.totalTrips.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{formatCurrency(period.totalGrossPay)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(period.totalNetPay)}</TableCell>
                    <TableCell>
                      <StatusBadge status={period.status} />
                    </TableCell>
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
