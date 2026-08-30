import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, TrendingDown, Minus, Clock, AlertTriangle, CheckCircle, RefreshCw, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, formatDistanceToNow } from "date-fns";

interface CustomerPaymentMetricsData {
  id: string;
  customerId: string;
  avgDaysToPay?: number;
  medianDaysToPay?: number;
  pctOnTime?: number;
  pctPaidAfterReminder?: number;
  disputeRate?: number;
  reminderResponseTimeAvg?: number;
  dsoTrendDirection?: 'improving' | 'stable' | 'worsening';
  totalInvoicesAnalyzed?: number;
  lastCalculatedAt?: string;
  calculationPeriodStart?: string;
  calculationPeriodEnd?: string;
}

interface CustomerPaymentMetricsProps {
  customerId: string;
}

const getTrendIcon = (direction?: string) => {
  switch (direction) {
    case 'improving':
      return <TrendingDown className="h-4 w-4 text-green-600 dark:text-green-400" />;
    case 'worsening':
      return <TrendingUp className="h-4 w-4 text-red-600 dark:text-red-400" />;
    default:
      return <Minus className="h-4 w-4 text-muted-foreground" />;
  }
};

const getTrendColor = (direction?: string): string => {
  switch (direction) {
    case 'improving':
      return 'text-green-600 dark:text-green-400';
    case 'worsening':
      return 'text-red-600 dark:text-red-400';
    default:
      return 'text-muted-foreground';
  }
};

const getPaymentBehaviorRating = (metrics: CustomerPaymentMetricsData): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } => {
  const avgDays = metrics.avgDaysToPay || 0;
  const onTimeRate = metrics.pctOnTime || 0;
  
  if (avgDays <= 15 && onTimeRate >= 80) {
    return { label: 'Excellent', variant: 'default' };
  } else if (avgDays <= 30 && onTimeRate >= 60) {
    return { label: 'Good', variant: 'secondary' };
  } else if (avgDays <= 45 && onTimeRate >= 40) {
    return { label: 'Average', variant: 'outline' };
  } else {
    return { label: 'Needs Attention', variant: 'destructive' };
  }
};

export function CustomerPaymentMetrics({ customerId }: CustomerPaymentMetricsProps) {
  const { toast } = useToast();

  const { data: metrics, isLoading, error } = useQuery<CustomerPaymentMetricsData>({
    queryKey: ["/api/corporate/invoicing/customers", customerId, "payment-metrics"],
    enabled: !!customerId,
  });

  const calculateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/corporate/invoicing/customers/${customerId}/payment-metrics/calculate`);
    },
    onSuccess: () => {
      toast({ title: "Metrics Updated", description: "Payment metrics have been recalculated." });
      queryClient.invalidateQueries({ 
        queryKey: ["/api/corporate/invoicing/customers", customerId, "payment-metrics"] 
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const hasMetrics = metrics && metrics.id && metrics.totalInvoicesAnalyzed && metrics.totalInvoicesAnalyzed > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Payment Behavior Metrics</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {hasMetrics && (
              <Badge {...getPaymentBehaviorRating(metrics)} data-testid="badge-payment-rating">
                {getPaymentBehaviorRating(metrics).label}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => calculateMutation.mutate()}
              disabled={calculateMutation.isPending}
              data-testid="button-recalculate-metrics"
            >
              {calculateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        {hasMetrics && metrics.lastCalculatedAt && (
          <CardDescription className="text-xs">
            Last updated {formatDistanceToNow(new Date(metrics.lastCalculatedAt), { addSuffix: true })}
            {metrics.totalInvoicesAnalyzed && ` • ${metrics.totalInvoicesAnalyzed} invoices analyzed`}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {!hasMetrics ? (
          <div className="text-center py-6 space-y-3">
            <Clock className="h-8 w-8 mx-auto text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">No Payment Data Yet</p>
              <p className="text-xs text-muted-foreground">
                Payment metrics will be available once this customer has paid invoices.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => calculateMutation.mutate()}
              disabled={calculateMutation.isPending}
              data-testid="button-calculate-metrics"
            >
              {calculateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Calculating...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Calculate Metrics
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <MetricCard
              label="Avg Days to Pay"
              value={metrics.avgDaysToPay?.toFixed(1) || '-'}
              suffix="days"
              icon={<Clock className="h-4 w-4" />}
              testId="metric-avg-days"
            />
            <MetricCard
              label="Median Days to Pay"
              value={metrics.medianDaysToPay?.toFixed(1) || '-'}
              suffix="days"
              icon={<Clock className="h-4 w-4" />}
              testId="metric-median-days"
            />
            <MetricCard
              label="On-Time Rate"
              value={metrics.pctOnTime?.toFixed(0) || '-'}
              suffix="%"
              icon={metrics.pctOnTime && metrics.pctOnTime >= 70 ? 
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" /> : 
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
              testId="metric-on-time"
            />
            <MetricCard
              label="Paid After Reminder"
              value={metrics.pctPaidAfterReminder?.toFixed(0) || '-'}
              suffix="%"
              icon={<AlertTriangle className="h-4 w-4" />}
              testId="metric-after-reminder"
            />
            <MetricCard
              label="Dispute Rate"
              value={metrics.disputeRate?.toFixed(1) || '0'}
              suffix="%"
              icon={metrics.disputeRate && metrics.disputeRate > 5 ?
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" /> :
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />}
              testId="metric-dispute-rate"
            />
            <MetricCard
              label="DSO Trend"
              value={metrics.dsoTrendDirection || 'stable'}
              icon={getTrendIcon(metrics.dsoTrendDirection)}
              className={getTrendColor(metrics.dsoTrendDirection)}
              testId="metric-dso-trend"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  suffix?: string;
  icon?: React.ReactNode;
  className?: string;
  testId: string;
}

function MetricCard({ label, value, suffix, icon, className, testId }: MetricCardProps) {
  return (
    <div className="rounded-lg border p-3 space-y-1" data-testid={testId}>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-lg font-semibold ${className || ''}`}>
        {value}{suffix && <span className="text-sm font-normal text-muted-foreground ml-0.5">{suffix}</span>}
      </div>
    </div>
  );
}

export function CustomerPaymentMetricsCompact({ customerId }: CustomerPaymentMetricsProps) {
  const { data: metrics, isLoading } = useQuery<CustomerPaymentMetricsData>({
    queryKey: ["/api/corporate/invoicing/customers", customerId, "payment-metrics"],
    enabled: !!customerId,
  });

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }

  const hasMetrics = metrics && metrics.id && metrics.totalInvoicesAnalyzed && metrics.totalInvoicesAnalyzed > 0;

  if (!hasMetrics) {
    return (
      <Badge variant="outline" className="text-xs" data-testid="badge-no-payment-data">
        No payment data
      </Badge>
    );
  }

  const rating = getPaymentBehaviorRating(metrics);

  return (
    <div className="flex items-center gap-2">
      <Badge variant={rating.variant} className="text-xs" data-testid="badge-payment-behavior">
        {rating.label}
      </Badge>
      {metrics.avgDaysToPay && (
        <span className="text-xs text-muted-foreground" data-testid="text-avg-days-compact">
          ~{metrics.avgDaysToPay.toFixed(0)}d avg
        </span>
      )}
      {metrics.dsoTrendDirection && metrics.dsoTrendDirection !== 'stable' && (
        <span className="flex items-center">
          {getTrendIcon(metrics.dsoTrendDirection)}
        </span>
      )}
    </div>
  );
}
