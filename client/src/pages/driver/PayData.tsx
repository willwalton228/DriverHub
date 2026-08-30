import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import type { PayRecord } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, Calendar, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/dateFormat";

export default function PayData() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);

  const { data: payRecords = [], isLoading } = useQuery<PayRecord[]>({
    queryKey: ["/api/drivers/pay"],
    enabled: isAuthenticated,
  });

  const totalEarnings = payRecords.reduce((sum, record) => sum + Number(record.netPay || 0), 0);
  const currentYearRecords = payRecords.filter(
    (record) => new Date(record.payPeriodEnd).getFullYear() === new Date().getFullYear()
  );
  const ytdEarnings = currentYearRecords.reduce((sum, record) => sum + Number(record.netPay || 0), 0);

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Pay Data</h1>
        <p className="text-muted-foreground mt-1">
          View your payment history and earnings summary
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-earnings">
              ${totalEarnings.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">YTD Earnings</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-ytd-earnings">
              ${ytdEarnings.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{new Date().getFullYear()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pay Periods</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Calendar className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pay-periods-count">
              {payRecords.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total records</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payment History</CardTitle>
          <CardDescription>Detailed breakdown of your earnings by pay period</CardDescription>
        </CardHeader>
        <CardContent>
          {payRecords.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No pay records found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Pay Period</th>
                    <th className="text-right py-3 px-4 font-medium">Hours</th>
                    <th className="text-right py-3 px-4 font-medium">Miles</th>
                    <th className="text-right py-3 px-4 font-medium">Gross Pay</th>
                    <th className="text-right py-3 px-4 font-medium">Deductions</th>
                    <th className="text-right py-3 px-4 font-medium">Bonuses</th>
                    <th className="text-right py-3 px-4 font-medium">Net Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {payRecords.map((record, index) => (
                    <tr
                      key={record.id}
                      className="border-b last:border-0 hover-elevate"
                      data-testid={`row-pay-record-${index}`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium">
                          {formatDate(record.payPeriodStart)} - {formatDate(record.payPeriodEnd)}
                        </div>
                        {record.paymentDate && (
                          <div className="text-xs text-muted-foreground">
                            Paid: {formatDate(record.paymentDate)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right text-muted-foreground">
                        {record.hoursWorked ? Number(record.hoursWorked).toFixed(1) : "-"}
                      </td>
                      <td className="py-3 px-4 text-right text-muted-foreground">
                        {record.milesDelivered ? Number(record.milesDelivered).toFixed(0) : "-"}
                      </td>
                      <td className="py-3 px-4 text-right font-medium">
                        ${Number(record.grossPay).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right text-muted-foreground">
                        ${Number(record.deductions || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right text-muted-foreground">
                        ${Number(record.bonuses || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold">
                        ${Number(record.netPay).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
