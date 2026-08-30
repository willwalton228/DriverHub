import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useDashboardFilters } from "@/hooks/useDashboardFilters";
import { DashboardFilterBar } from "@/components/DashboardFilterBar";
import { WidgetErrorBoundary, DashboardHealthBanner } from "@/components/WidgetErrorBoundary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { RecruitingRevenueWidget } from "@/components/recruiting/RecruitingRevenueWidget";
import { AMRTeamActivityWidget } from "@/components/amr/AMRTeamActivityWidget";
import { AMRInnovationLeaderboard } from "@/components/amr/AMRInnovationLeaderboard";
import { AMRAchievementBadgesWidget } from "@/components/amr/AMRAchievementBadges";
import { ProductImprovementScore } from "@/components/amr/ProductImprovementScore";
import { 
  Users, UserCheck, Activity, Truck, CheckCircle, AlertTriangle, 
  TrendingUp, TrendingDown, Minus, IdCard, FileX, ClipboardList,
  ArrowRight, Clock, UserPlus, FileCheck, Bell, ChevronRight,
  Loader2, DollarSign, ShieldAlert, Building, Code2, ExternalLink
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Area, AreaChart, Cell
} from "recharts";
import type { 
  DashboardSummary, DashboardRisk, DashboardTrends, 
  DashboardTopDrivers, DashboardWorkforceFunnel, DashboardRecentEvents,
  KpiCard, RiskMetric, FunnelStage, OperationalEvent
} from "@shared/schema";
import { Progress } from "@/components/ui/progress";
import { rechartsTooltipStyle } from "@/lib/chartUtils";

interface MarketMetrics {
  marketProfitScore: number;
  marketLossScore: number;
  activeClaimsCount: number;
  payPeriodStatus: 'OPEN' | 'CLOSED' | 'PENDING';
  currentPayPeriodName: string;
}

const KPI_ICONS: Record<string, any> = {
  'users': Users,
  'activity': Activity,
  'truck': Truck,
  'check-circle': CheckCircle,
  'alert-triangle': AlertTriangle,
};

const RISK_ICONS: Record<string, any> = {
  'id-card': IdCard,
  'file-x': FileX,
  'alert-triangle': AlertTriangle,
  'clipboard-list': ClipboardList,
};

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-green-500/10 text-green-600 border-green-500/20',
  medium: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  high: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  critical: 'bg-red-500/10 text-red-600 border-red-500/20',
};

const EVENT_ICONS: Record<string, any> = {
  driver_onboarded: UserPlus,
  license_expiring: IdCard,
  license_expired: IdCard,
  incident_opened: AlertTriangle,
  incident_closed: CheckCircle,
  suspension_change: Users,
  document_uploaded: FileCheck,
  trip_completed: Truck,
};

function KpiCardComponent({ kpi }: { kpi: KpiCard }) {
  const Icon = KPI_ICONS[kpi.icon || 'activity'] || Activity;
  const DeltaIcon = kpi.deltaDirection === 'up' ? TrendingUp : 
                    kpi.deltaDirection === 'down' ? TrendingDown : Minus;
  
  const deltaColor = kpi.deltaDirection === 'up' ? 'text-green-600' : 
                     kpi.deltaDirection === 'down' ? 'text-red-600' : 'text-muted-foreground';

  const colorClasses = {
    default: 'bg-primary/10',
    success: 'bg-green-500/10',
    warning: 'bg-amber-500/10',
    danger: 'bg-red-500/10',
  };

  const iconColorClasses = {
    default: 'text-primary',
    success: 'text-green-600',
    warning: 'text-amber-600',
    danger: 'text-red-600',
  };

  return (
    <Link href={kpi.drilldownRoute}>
      <Card className="hover-elevate cursor-pointer group transition-all" data-testid={`kpi-card-${kpi.id}`}>
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground truncate leading-tight">{kpi.title}</p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl font-bold" data-testid={`kpi-value-${kpi.id}`}>
                  {kpi.id === 'utilization' ? `${kpi.value}%` : kpi.value.toLocaleString()}
                </span>
                {kpi.delta !== 0 && (
                  <span className={`flex items-center text-[10px] font-medium ${deltaColor}`}>
                    <DeltaIcon className="h-2.5 w-2.5 mr-0.5" />
                    {Math.abs(kpi.delta)}%
                  </span>
                )}
              </div>
            </div>
            <div className={`h-7 w-7 rounded-md ${colorClasses[kpi.color || 'default']} flex items-center justify-center shrink-0`}>
              <Icon className={`h-3.5 w-3.5 ${iconColorClasses[kpi.color || 'default']}`} />
            </div>
          </div>
          {kpi.sparkline && kpi.sparkline.length > 0 && (
            <div className="h-7 mt-2 -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={kpi.sparkline}>
                  <defs>
                    <linearGradient id={`gradient-${kpi.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={1.5}
                    fill={`url(#gradient-${kpi.id})`}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function RiskMetricCard({ metric }: { metric: RiskMetric }) {
  const Icon = RISK_ICONS[metric.icon || 'alert-triangle'] || AlertTriangle;
  const severityClass = SEVERITY_COLORS[metric.severity] || SEVERITY_COLORS.low;
  
  const hasIssues = metric.count > 0;

  const borderClass = hasIssues 
    ? metric.severity === 'critical' ? 'border-destructive' 
    : metric.severity === 'high' ? 'border-orange-500' 
    : metric.severity === 'medium' ? 'border-amber-500' 
    : 'border-green-500'
    : '';

  return (
    <Link href={metric.drilldownRoute}>
      <Card 
        className={`hover-elevate cursor-pointer transition-all ${hasIssues ? `border ${borderClass}` : ''}`}
        data-testid={`risk-card-${metric.id}`}
      >
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`h-7 w-7 rounded-md ${hasIssues ? severityClass : 'bg-muted'} flex items-center justify-center shrink-0`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate leading-tight">{metric.title}</p>
                {metric.buckets && metric.buckets.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 mt-1">
                    {metric.buckets.map((bucket, idx) => (
                      <Badge 
                        key={idx} 
                        variant="outline" 
                        className={`text-[9px] px-1 py-0 h-3.5 ${bucket.count > 0 ? SEVERITY_COLORS[bucket.severity] : 'opacity-50'}`}
                      >
                        {bucket.label}: {bucket.count}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className={`text-xl font-bold ${hasIssues ? '' : 'text-muted-foreground'}`} data-testid={`risk-value-${metric.id}`}>
                {metric.count}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function TripsChart({ data }: { data: DashboardTrends }) {
  return (
    <Card className="col-span-1 lg:col-span-2" data-testid="chart-trips-trend">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Trips Trend</CardTitle>
        <CardDescription>Daily trip volume over selected period</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.tripsByDay}>
              <defs>
                <linearGradient id="tripGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="label" 
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                className="text-muted-foreground"
              />
              <YAxis 
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                className="text-muted-foreground"
              />
              <Tooltip
                {...rechartsTooltipStyle}
              />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                fill="url(#tripGradient)"
                name="Trips"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function TopDriversChart({ data }: { data: DashboardTopDrivers }) {
  const COLORS = [
    'hsl(var(--primary))',
    'hsl(var(--primary) / 0.8)',
    'hsl(var(--primary) / 0.6)',
    'hsl(var(--primary) / 0.5)',
    'hsl(var(--primary) / 0.4)',
  ];

  return (
    <Card data-testid="chart-top-drivers">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Top Drivers</CardTitle>
            <CardDescription>By {data.metric === 'trips' ? 'trip count' : data.metric}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={data.drivers.slice(0, 5)} 
              layout="vertical"
              margin={{ left: 0, right: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis 
                type="category" 
                dataKey="driverName" 
                tick={{ fontSize: 11 }} 
                tickLine={false} 
                axisLine={false}
                width={100}
              />
              <Tooltip
                {...rechartsTooltipStyle}
                formatter={(value: number) => [value, 'Trips']}
              />
              <Bar dataKey="trips" radius={[0, 4, 4, 0]}>
                {data.drivers.slice(0, 5).map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function WorkforceFunnel({ data }: { data: DashboardWorkforceFunnel }) {
  const maxCount = Math.max(...data.stages.map(s => s.count));

  return (
    <Card data-testid="workforce-funnel">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Workforce Funnel</CardTitle>
        <CardDescription>Driver lifecycle stages</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {data.stages.map((stage) => (
            <Link key={stage.id} href={stage.drilldownRoute}>
              <div 
                className="flex items-center gap-3 p-2 rounded-lg hover-elevate cursor-pointer group"
                data-testid={`funnel-stage-${stage.id}`}
              >
                <div 
                  className="w-3 h-3 rounded-full shrink-0" 
                  style={{ backgroundColor: stage.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{stage.label}</span>
                    <span className="text-sm font-bold">{stage.count}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full mt-1 overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all"
                      style={{ 
                        width: maxCount > 0 ? `${(stage.count / maxCount) * 100}%` : '0%',
                        backgroundColor: stage.color 
                      }}
                    />
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function EventsFeed({ data }: { data: DashboardRecentEvents }) {
  const getEventIcon = (type: OperationalEvent['type']) => {
    const Icon = EVENT_ICONS[type] || Bell;
    return Icon;
  };

  const getSeverityBg = (severity?: string) => {
    switch (severity) {
      case 'error': return 'bg-red-500/10 text-red-600';
      case 'warning': return 'bg-amber-500/10 text-amber-600';
      default: return 'bg-primary/10 text-primary';
    }
  };

  return (
    <Card data-testid="events-feed">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Recent Events</CardTitle>
            <CardDescription>Operational activity feed</CardDescription>
          </div>
          <Badge variant="outline" className="text-xs">
            <Clock className="h-3 w-3 mr-1" />
            Live
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {data.events.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No recent events</p>
          ) : (
            data.events.map((event) => {
              const Icon = getEventIcon(event.type);
              return (
                <Link key={event.id} href={event.drilldownRoute || '#'}>
                  <div 
                    className="flex items-start gap-3 p-2 rounded-lg hover-elevate cursor-pointer group"
                    data-testid={`event-${event.id}`}
                  >
                    <div className={`h-8 w-8 rounded-full ${getSeverityBg(event.severity)} flex items-center justify-center shrink-0 mt-0.5`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{event.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{event.description}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(event.timestamp).toLocaleString()}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-2" />
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MarketMetricsTiles({ metrics }: { metrics: MarketMetrics }) {
  const getScoreColor = (score: number, inverse: boolean = false) => {
    if (inverse) {
      return score > 50 ? 'text-destructive' : score > 25 ? 'text-amber-500' : 'text-green-600';
    }
    return score >= 70 ? 'text-green-600' : score >= 40 ? 'text-amber-500' : 'text-destructive';
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card data-testid="tile-market-profit-score">
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground truncate leading-tight">Market Profit Score</p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className={`text-xl font-bold ${getScoreColor(metrics.marketProfitScore)}`}>
                  {metrics.marketProfitScore}
                </span>
                <span className="text-xs text-muted-foreground">/ 100</span>
              </div>
              <Progress value={metrics.marketProfitScore} className="h-0.5 mt-2" />
            </div>
            <div className="h-7 w-7 rounded-md bg-green-500/10 flex items-center justify-center shrink-0">
              <DollarSign className="h-3.5 w-3.5 text-green-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="tile-market-loss-score">
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground truncate leading-tight">Market Risk Score</p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className={`text-xl font-bold ${getScoreColor(metrics.marketLossScore, true)}`}>
                  {metrics.marketLossScore}
                </span>
                <span className="text-xs text-muted-foreground">/ 100</span>
              </div>
              <Progress value={metrics.marketLossScore} className={`h-0.5 mt-2 ${metrics.marketLossScore > 50 ? '[&>div]:bg-destructive' : ''}`} />
            </div>
            <div className="h-7 w-7 rounded-md bg-red-500/10 flex items-center justify-center shrink-0">
              <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="tile-active-claims">
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground truncate leading-tight">Active Claims</p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className={`text-xl font-bold ${metrics.activeClaimsCount > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                  {metrics.activeClaimsCount}
                </span>
                <span className="text-xs text-muted-foreground">open</span>
              </div>
            </div>
            <div className={`h-7 w-7 rounded-md ${metrics.activeClaimsCount > 0 ? 'bg-amber-500/10' : 'bg-muted'} flex items-center justify-center shrink-0`}>
              <AlertTriangle className={`h-3.5 w-3.5 ${metrics.activeClaimsCount > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="tile-pay-period-status">
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground truncate leading-tight">Pay Period Status</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={metrics.payPeriodStatus === 'OPEN' ? 'default' : metrics.payPeriodStatus === 'PENDING' ? 'secondary' : 'outline'}>
                  {metrics.payPeriodStatus}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 truncate">
                {metrics.currentPayPeriodName}
              </p>
            </div>
            <div className={`h-7 w-7 rounded-md ${metrics.payPeriodStatus === 'OPEN' ? 'bg-green-500/10' : 'bg-muted'} flex items-center justify-center shrink-0`}>
              <Clock className={`h-3.5 w-3.5 ${metrics.payPeriodStatus === 'OPEN' ? 'text-green-600' : 'text-muted-foreground'}`} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i}>
            <CardContent className="p-3">
              <Skeleton className="h-3 w-20 mb-1.5" />
              <Skeleton className="h-6 w-12 mb-1.5" />
              <Skeleton className="h-7 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-3">
              <Skeleton className="h-14 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-3">
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            <Skeleton className="h-[250px] w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <Skeleton className="h-[250px] w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface AMRMetrics {
  needsReview: number;
  reviewed: number;
  prioritizing: number;
  inDevelopment: number;
  needsTesting: number;
  userDeclines: number;
  blocked: number;
  inQueue: number;
  roadmap: number;
  aging: number;
  thirtyPlusDays: number;
  recentCompleted: number;
  productDecisionRequired: number;
  copiedOn: number;
  newUpdates: number;
  isPersonalized: boolean;
}

function AMRPipelineWidget() {
  const { data: metrics, isLoading } = useQuery<AMRMetrics>({
    queryKey: ["/api/tickets/amr-metrics"],
    refetchInterval: 30000,
  });

  const rows: { label: string; value: number | undefined; href: string; color: string; dotColor: string; testId: string }[] = [
    {
      label: "Submitted",
      value: metrics?.needsReview,
      href: "/tickets?status=submitted",
      color: "text-blue-600 dark:text-blue-400",
      dotColor: "bg-blue-400",
      testId: "amr-widget-submitted",
    },
    {
      label: "Reviewed",
      value: metrics?.reviewed,
      href: "/tickets?status=reviewed",
      color: "text-indigo-600 dark:text-indigo-400",
      dotColor: "bg-indigo-400",
      testId: "amr-widget-reviewed",
    },
    {
      label: "Prioritizing",
      value: metrics?.prioritizing,
      href: "/tickets?status=prioritizing",
      color: "text-yellow-600 dark:text-yellow-400",
      dotColor: "bg-yellow-400",
      testId: "amr-widget-prioritizing",
    },
    {
      label: "In Dev / Deployment",
      value: metrics?.inDevelopment,
      href: "/tickets?status=in_development",
      color: "text-sky-600 dark:text-sky-400",
      dotColor: "bg-sky-400",
      testId: "amr-widget-in-development",
    },
    {
      label: "User Declines",
      value: metrics?.userDeclines,
      href: "/tickets?status=user_declines",
      color: (metrics?.userDeclines ?? 0) > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
      dotColor: (metrics?.userDeclines ?? 0) > 0 ? "bg-red-500" : "bg-muted-foreground/30",
      testId: "amr-widget-user-declines",
    },
    {
      label: "Needs Testing / Sign-off",
      value: metrics?.needsTesting,
      href: "/tickets?status=needs_testing",
      color: "text-cyan-600 dark:text-cyan-400",
      dotColor: "bg-cyan-400",
      testId: "amr-widget-needs-testing",
    },
    {
      label: "Blocked",
      value: metrics?.blocked,
      href: "/tickets?status=sent_back_for_info",
      color: (metrics?.blocked ?? 0) > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground",
      dotColor: (metrics?.blocked ?? 0) > 0 ? "bg-orange-400" : "bg-muted-foreground/30",
      testId: "amr-widget-blocked",
    },
    {
      label: "In Queue",
      value: metrics?.inQueue,
      href: "/tickets?status=in_queue",
      color: "text-violet-600 dark:text-violet-400",
      dotColor: "bg-violet-400",
      testId: "amr-widget-in-queue",
    },
    {
      label: "Roadmap",
      value: metrics?.roadmap,
      href: "/tickets?tab=roadmap",
      color: (metrics?.roadmap ?? 0) > 0 ? "text-fuchsia-600 dark:text-fuchsia-400" : "text-muted-foreground",
      dotColor: (metrics?.roadmap ?? 0) > 0 ? "bg-fuchsia-400" : "bg-muted-foreground/30",
      testId: "amr-widget-roadmap",
    },
    {
      label: "30+ Days",
      value: metrics?.thirtyPlusDays,
      href: "/tickets?quickFilter=thirtyplus",
      color: (metrics?.thirtyPlusDays ?? 0) > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
      dotColor: (metrics?.thirtyPlusDays ?? 0) > 0 ? "bg-red-500" : "bg-muted-foreground/30",
      testId: "amr-widget-thirtyplus",
    },
    {
      label: "Completed (72h)",
      value: metrics?.recentCompleted,
      href: "/tickets?status=completed",
      color: (metrics?.recentCompleted ?? 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
      dotColor: (metrics?.recentCompleted ?? 0) > 0 ? "bg-emerald-400" : "bg-muted-foreground/30",
      testId: "amr-widget-completed-72h",
    },
    ...(metrics?.isPersonalized ? [
      {
        label: "Copied On",
        value: metrics?.copiedOn,
        href: "/tickets?copiedOn=true",
        color: (metrics?.copiedOn ?? 0) > 0 ? "text-indigo-600 dark:text-indigo-400" : "text-muted-foreground",
        dotColor: (metrics?.copiedOn ?? 0) > 0 ? "bg-indigo-400" : "bg-muted-foreground/30",
        testId: "amr-widget-copied-on",
      },
      {
        label: "New Updates",
        value: metrics?.newUpdates,
        href: "/tickets?newUpdates=true",
        color: (metrics?.newUpdates ?? 0) > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground",
        dotColor: (metrics?.newUpdates ?? 0) > 0 ? "bg-orange-400" : "bg-muted-foreground/30",
        testId: "amr-widget-new-updates",
      },
    ] : []),
  ];

  return (
    <Card data-testid="widget-amr-pipeline-health">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center shrink-0">
              <Code2 className="h-3.5 w-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm font-semibold">AMR Pipeline</CardTitle>
          </div>
          <Link href="/tickets">
            <button className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors" title="View all AMRs">
              <ExternalLink className="h-3 w-3" />
            </button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        {isLoading ? (
          <div className="grid grid-cols-3 gap-x-3 gap-y-1">
            {[...Array(9)].map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-x-3 gap-y-0.5">
            {rows.map((row) => (
              <Link key={row.testId} href={row.href}>
                <div
                  className="flex items-center justify-between gap-1 py-1 px-1 rounded hover-elevate cursor-pointer group"
                  data-testid={row.testId}
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${row.dotColor}`} />
                    <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors truncate">
                      {row.label}
                    </span>
                  </div>
                  <span className={`text-sm font-bold tabular-nums shrink-0 ${row.color}`}>
                    {row.value ?? "—"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProductDecisionsWidget() {
  const { data: metrics, isLoading } = useQuery<AMRMetrics>({
    queryKey: ["/api/tickets/amr-metrics"],
    refetchInterval: 30000,
  });

  const count = metrics?.productDecisionRequired ?? 0;

  return (
    <Link href="/tickets?status=product_decision_required">
      <Card
        className="hover-elevate cursor-pointer h-full"
        data-testid="widget-product-decisions"
        style={{ borderColor: count > 0 ? "rgb(168 85 247 / 0.4)" : undefined, borderWidth: count > 0 ? "1px" : undefined }}
      >
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${count > 0 ? "bg-purple-500/10" : "bg-muted"}`}>
                <ClipboardList className={`h-3.5 w-3.5 ${count > 0 ? "text-purple-600 dark:text-purple-400" : "text-muted-foreground"}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">Product Decisions Needed</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  Blocked — awaiting product leadership direction
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {isLoading ? (
                <div className="h-4 w-8 rounded animate-pulse bg-muted" />
              ) : (
                <span className={`text-xl font-bold ${count > 0 ? "text-purple-600 dark:text-purple-400" : "text-muted-foreground"}`} data-testid="text-product-decisions-count">
                  {count}
                </span>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function CorporateDashboard() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const AMR_ADMIN_ROLES = ['super_user', 'admin', 'ops_manager', 'corporate_admin'];
  const isAmrAdmin = !!(user?.role && AMR_ADMIN_ROLES.includes(user.role));
  // Stricter gate: Product Improvement Score is executive-only
  const PI_ROLES    = ['super_user', 'ops_manager', 'corporate_admin'];
  const isPIAdmin   = !!(user?.isRootSuperAdmin || (user?.role && PI_ROLES.includes(user.role)));
  const { queryKey } = useDashboardFilters();
  const [failedWidgets, setFailedWidgets] = useState<string[]>([]);

  const handleWidgetError = useCallback((error: Error, widgetName: string) => {
    setFailedWidgets(prev => {
      if (prev.includes(widgetName)) return prev;
      return [...prev, widgetName];
    });
  }, []);

  const dismissHealthBanner = useCallback(() => {
    setFailedWidgets([]);
  }, []);

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

  const { data: summary, isLoading: summaryLoading } = useQuery<DashboardSummary>({
    queryKey: ["/api/dashboard/summary", queryKey],
    enabled: isAuthenticated,
  });

  const { data: risk, isLoading: riskLoading } = useQuery<DashboardRisk>({
    queryKey: ["/api/dashboard/risk", queryKey],
    enabled: isAuthenticated,
  });

  const { data: trends, isLoading: trendsLoading } = useQuery<DashboardTrends>({
    queryKey: ["/api/dashboard/trends", queryKey],
    enabled: isAuthenticated,
  });

  const { data: topDrivers, isLoading: topDriversLoading } = useQuery<DashboardTopDrivers>({
    queryKey: ["/api/dashboard/topDrivers", queryKey],
    enabled: isAuthenticated,
  });

  const { data: funnel, isLoading: funnelLoading } = useQuery<DashboardWorkforceFunnel>({
    queryKey: ["/api/dashboard/funnel", queryKey],
    enabled: isAuthenticated,
  });

  const { data: events, isLoading: eventsLoading } = useQuery<DashboardRecentEvents>({
    queryKey: ["/api/events/recent", queryKey],
    enabled: isAuthenticated,
  });

  const { data: marketMetrics, isLoading: marketMetricsLoading } = useQuery<MarketMetrics>({
    queryKey: ["/api/dashboard/market-metrics"],
    enabled: isAuthenticated,
  });

  const { data: needsUpdateSummary } = useQuery<{ count: number }>({
    queryKey: ["/api/drivers/needs-update/summary"],
    enabled: isAuthenticated,
  });

  const isLoading = authLoading || summaryLoading;

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <DashboardFilterBar />
      
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Operations Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Real-time intelligence for decisions, risk, and throughput
          </p>
        </div>

        <DashboardHealthBanner 
          failedWidgets={failedWidgets} 
          onDismiss={dismissHealthBanner} 
        />

        {isLoading ? (
          <DashboardSkeleton />
        ) : (
          <>
            {/* Row 1: Executive KPI Strip */}
            <WidgetErrorBoundary widgetName="Executive KPIs" onError={handleWidgetError}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Executive KPIs</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {summary?.kpis.map((kpi) => (
                    <KpiCardComponent key={kpi.id} kpi={kpi} />
                  ))}
                </div>
              </div>
            </WidgetErrorBoundary>

            {/* Row 1.5: Market Metrics Tiles */}
            <WidgetErrorBoundary widgetName="Market Performance" onError={handleWidgetError}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Building className="h-3 w-3" />
                  Market Performance
                </p>
                {marketMetricsLoading ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : marketMetrics ? (
                  <MarketMetricsTiles metrics={marketMetrics} />
                ) : (
                  <p className="text-xs text-muted-foreground">Market metrics data unavailable</p>
                )}
              </div>
            </WidgetErrorBoundary>

            {/* Row 2: Risk & Compliance Band */}
            <WidgetErrorBoundary widgetName="Risk & Compliance" onError={handleWidgetError}>
              {risk && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                      Risk & Compliance
                    </p>
                    {risk.totalIssues > 0 && (
                      <Badge variant="destructive" className="text-[10px] animate-pulse">
                        {risk.totalIssues} issues
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {risk.metrics.map((metric) => (
                      <RiskMetricCard key={metric.id} metric={metric} />
                    ))}
                  </div>
                </div>
              )}
            </WidgetErrorBoundary>

            {/* Operational Alert Widgets — compact row */}
            {(needsUpdateSummary?.count > 0 || isAmrAdmin) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {needsUpdateSummary && needsUpdateSummary.count > 0 && (
                  <WidgetErrorBoundary widgetName="Drivers Needing Updates" onError={handleWidgetError}>
                    <Link href="/drivers?needs_update=true">
                      <Card className="hover-elevate cursor-pointer border border-amber-500/30 h-full" data-testid="widget-drivers-needs-update">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="h-7 w-7 rounded-md bg-amber-500/10 flex items-center justify-center shrink-0">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">Drivers Needing Updates</p>
                                <p className="text-[10px] text-muted-foreground truncate">
                                  Incomplete profiles — review required
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-xl font-bold text-amber-500" data-testid="text-needs-update-count">
                                {needsUpdateSummary.count}
                              </span>
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </WidgetErrorBoundary>
                )}
                {isAmrAdmin && (
                  <WidgetErrorBoundary widgetName="Product Decisions Needed" onError={handleWidgetError}>
                    <ProductDecisionsWidget />
                  </WidgetErrorBoundary>
                )}
                {isAmrAdmin && (
                  <WidgetErrorBoundary widgetName="AMR Pipeline Health" onError={handleWidgetError}>
                    <AMRPipelineWidget />
                  </WidgetErrorBoundary>
                )}
              </div>
            )}

            {/* Product Improvement Score — executive-only (super_user / ops_manager / corporate_admin / Will Walton) */}
            {isPIAdmin && (
              <WidgetErrorBoundary widgetName="Product Improvement Score" onError={handleWidgetError}>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    Product Improvement Score
                  </p>
                  <ProductImprovementScore />
                </div>
              </WidgetErrorBoundary>
            )}

            {/* AMR widgets — full-width rows, admin + Will Walton only */}
            {isAmrAdmin && (
              <>
                <WidgetErrorBoundary widgetName="AMR Achievement Badges" onError={handleWidgetError}>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      Achievement Badges
                    </p>
                    <AMRAchievementBadgesWidget />
                  </div>
                </WidgetErrorBoundary>
                <WidgetErrorBoundary widgetName="AMR Team Activity" onError={handleWidgetError}>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      AMR Team Activity
                    </p>
                    <AMRTeamActivityWidget />
                  </div>
                </WidgetErrorBoundary>
                <WidgetErrorBoundary widgetName="Innovation Leaderboard" onError={handleWidgetError}>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      Innovation Leaderboard
                    </p>
                    <AMRInnovationLeaderboard />
                  </div>
                </WidgetErrorBoundary>
              </>
            )}

            {/* Row 3: Productivity Intelligence Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <WidgetErrorBoundary widgetName="Trips Trend" onError={handleWidgetError}>
                {trends && <TripsChart data={trends} />}
              </WidgetErrorBoundary>
              <WidgetErrorBoundary widgetName="Top Drivers" onError={handleWidgetError}>
                {topDrivers && <TopDriversChart data={topDrivers} />}
              </WidgetErrorBoundary>
            </div>

            {/* Row 4 & 5: Workforce Funnel + Events Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <WidgetErrorBoundary widgetName="Workforce Funnel" onError={handleWidgetError}>
                {funnel && <WorkforceFunnel data={funnel} />}
              </WidgetErrorBoundary>
              <WidgetErrorBoundary widgetName="Recent Events" onError={handleWidgetError}>
                {events && <EventsFeed data={events} />}
              </WidgetErrorBoundary>
            </div>

            {/* Row 6: Recruiting Revenue Impact */}
            <WidgetErrorBoundary widgetName="Recruiting Revenue Impact" onError={handleWidgetError}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                  Recruiting Revenue Impact
                </p>
                <RecruitingRevenueWidget />
              </div>
            </WidgetErrorBoundary>
          </>
        )}
      </div>
    </div>
  );
}
