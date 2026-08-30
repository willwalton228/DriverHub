import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Shield, DollarSign, AlertTriangle, CheckCircle,
  TrendingUp, TrendingDown, Minus, Lightbulb, AlertCircle,
} from "lucide-react";
import { formatDate } from "@/lib/dateFormat";
import {
  getSafetyStage,
  getSafetyStageColors,
  type SafetyStage,
  type SafetyTrend,
} from "@/lib/safetyScore";

interface TierInfo {
  current: number;
  multiplier: number;
  description: string;
  progress: number;
}

interface SafetyInfo {
  state: string;
  multiplier: number;
  atFaultClaimsCount: number;
  claimsInWindow: number;
  score: number;
}

interface PayPeriodInfo {
  startDate: string;
  endDate: string;
  grossPay: string;
  netPay: string;
  totalTrips: number;
  tier: number;
}

interface DriverStatus {
  driverId: number;
  name: string;
  tier: TierInfo;
  safety: SafetyInfo;
  recentPayPeriods: PayPeriodInfo[];
}

interface SafetyPerformanceData {
  safetyScore: number;
  stage: SafetyStage;
  trend: SafetyTrend;
  impactingFactors: string[];
  howToImprove: string[];
  riskFloorApplied: boolean;
}

function formatCurrency(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num || 0);
}

function getTierBadgeVariant(tier: number): "default" | "secondary" | "outline" {
  return tier >= 3 ? "default" : tier >= 2 ? "secondary" : "outline";
}

function TrendIcon({ trend }: { trend: SafetyTrend }) {
  if (trend === "Improving")
    return <TrendingUp className="h-4 w-4 text-emerald-500" />;
  if (trend === "Declining")
    return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function TrendColor({ trend }: { trend: SafetyTrend }) {
  if (trend === "Improving") return "text-emerald-600 dark:text-emerald-400";
  if (trend === "Declining") return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

export default function MyStatus() {
  const { data: status, isLoading: statusLoading } = useQuery<DriverStatus>({
    queryKey: ["/api/drivers/my-status"],
  });

  const { data: safetyData, isLoading: safetyLoading } =
    useQuery<SafetyPerformanceData>({
      queryKey: ["/api/drivers/my-safety-score"],
    });

  const isLoading = statusLoading || safetyLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-52" />
        <div className="grid md:grid-cols-2 gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">My Status</h1>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              Unable to load your status. Please try again later.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tierProgress = status.tier.progress;

  // Determine safety performance from dedicated endpoint or fall back
  const safetyScore = safetyData?.safetyScore ?? Math.max(0, 100 - (status.safety.atFaultClaimsCount * 25));
  const stage: SafetyStage = safetyData?.stage ?? getSafetyStage(safetyScore);
  const trend: SafetyTrend = safetyData?.trend ?? "Stable";
  const impactingFactors = safetyData?.impactingFactors ?? [];
  const howToImprove = safetyData?.howToImprove ?? [];
  const colors = getSafetyStageColors(stage);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-status-title">
          My Status
        </h1>
        <p className="text-muted-foreground mt-1">
          Your tier, safety performance, and recent pay information
        </p>
      </div>

      {/* ── Safety Performance Score – full card ── */}
      <Card data-testid="card-safety-performance">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Safety Performance Score</CardTitle>
                <CardDescription>Your driver safety standing and stage</CardDescription>
              </div>
            </div>
            {/* Score circle */}
            <div className="flex items-center gap-3">
              <div
                className={`h-16 w-16 rounded-full flex flex-col items-center justify-center border-2 ${colors.border}`}
                data-testid="circle-safety-score"
              >
                <span className={`text-xl font-bold leading-none ${colors.text}`}>
                  {safetyScore}
                </span>
                <span className="text-[10px] text-muted-foreground leading-none mt-0.5">/ 100</span>
              </div>
              <div className="space-y-1">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-sm font-semibold ${colors.badge}`}
                  data-testid="badge-safety-stage"
                >
                  {stage}
                </span>
                <div className={`flex items-center gap-1 text-xs font-medium ${TrendColor({ trend })}`}>
                  <TrendIcon trend={trend} />
                  <span data-testid="text-safety-trend">{trend}</span>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Unsafe</span>
              <span>Elite Operator</span>
            </div>
            <Progress
              value={safetyScore}
              className={`h-3 rounded-full ${colors.bar}`}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0</span>
              <span className="text-center">50 — 70 — 85</span>
              <span>100</span>
            </div>
          </div>

          {/* What's impacting your score */}
          {impactingFactors.length > 0 && (
            <div className={`rounded-md p-4 space-y-2 ${colors.bg}`}>
              <div className="flex items-center gap-2">
                <AlertCircle className={`h-4 w-4 shrink-0 ${colors.text}`} />
                <span className={`text-sm font-semibold ${colors.text}`}>
                  What's impacting your score
                </span>
              </div>
              <ul className="space-y-1">
                {impactingFactors.map((factor, i) => (
                  <li
                    key={i}
                    className="text-sm text-foreground flex items-start gap-2"
                    data-testid={`text-impact-factor-${i}`}
                  >
                    <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${
                      stage === "Elite Operator" ? "bg-emerald-500" :
                      stage === "Strong" ? "bg-blue-500" :
                      stage === "Needs Coaching" ? "bg-yellow-500" :
                      "bg-red-500"
                    }`} />
                    {factor}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* How to improve */}
          {howToImprove.length > 0 && (
            <div className="rounded-md border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm font-semibold text-foreground">How to improve</span>
              </div>
              <ul className="space-y-1">
                {howToImprove.map((tip, i) => (
                  <li
                    key={i}
                    className="text-sm text-muted-foreground flex items-start gap-2"
                    data-testid={`text-improve-tip-${i}`}
                  >
                    <CheckCircle className="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tier legend */}
          <div className="flex flex-wrap gap-2 pt-1 border-t">
            {(["Unsafe", "Needs Coaching", "Strong", "Elite Operator"] as SafetyStage[]).map((s) => {
              const c = getSafetyStageColors(s);
              return (
                <span
                  key={s}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${c.badge} ${stage === s ? "ring-2 ring-offset-1 ring-current" : "opacity-60"}`}
                >
                  {s}
                </span>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Tier + Safety State ── */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <div>
              <CardTitle className="text-lg">Driver Tier</CardTitle>
              <CardDescription>Your current tier level and multiplier</CardDescription>
            </div>
            <Badge
              variant={getTierBadgeVariant(status.tier.current)}
              className="h-10 w-10 rounded-full flex items-center justify-center text-lg font-bold"
              data-testid="badge-tier"
            >
              {status.tier.current}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Tier Progress</span>
                <span className="font-medium">{status.tier.description}</span>
              </div>
              <Progress value={tierProgress} className="h-2" />
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-muted-foreground">Pay Multiplier</span>
              <Badge
                variant="outline"
                className="text-lg font-bold"
                data-testid="text-tier-multiplier"
              >
                {(status.tier.multiplier * 100).toFixed(0)}%
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <div>
              <CardTitle className="text-lg">Account Standing</CardTitle>
              <CardDescription>Your active status and safety multiplier</CardDescription>
            </div>
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge
                variant={
                  status.safety.state === "ACTIVE"
                    ? "default"
                    : status.safety.state === "RESTRICTED"
                    ? "secondary"
                    : "destructive"
                }
                className="text-sm px-3 py-1"
                data-testid="badge-safety-state"
              >
                {status.safety.state === "ACTIVE" && (
                  <CheckCircle className="h-3 w-3 mr-1" />
                )}
                {status.safety.state === "RESTRICTED" && (
                  <AlertTriangle className="h-3 w-3 mr-1" />
                )}
                {status.safety.state}
              </Badge>
              <span className="text-muted-foreground text-sm">
                Multiplier: {(status.safety.multiplier * 100).toFixed(0)}%
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t text-sm">
              <span className="text-muted-foreground">Claims on Record</span>
              <span
                className="font-medium"
                data-testid="text-claims-count"
              >
                {status.safety.claimsInWindow}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">At-Fault</span>
              <span className="font-medium">
                {status.safety.atFaultClaimsCount}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Recent Pay Periods ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Recent Pay Periods
          </CardTitle>
          <CardDescription>Your last 5 pay periods</CardDescription>
        </CardHeader>
        <CardContent>
          {status.recentPayPeriods.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No pay records available yet
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Trips</TableHead>
                  <TableHead className="text-right">Gross Pay</TableHead>
                  <TableHead className="text-right">Net Pay</TableHead>
                  <TableHead>Tier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.recentPayPeriods.map((period, index) => (
                  <TableRow key={index} data-testid={`row-pay-period-${index}`}>
                    <TableCell className="font-medium">
                      {formatDate(period.startDate)} –{" "}
                      {formatDate(period.endDate)}
                    </TableCell>
                    <TableCell className="text-right">
                      {period.totalTrips || 0}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(period.grossPay)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(period.netPay)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getTierBadgeVariant(period.tier || 1)}>
                        Tier {period.tier || 1}
                      </Badge>
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
