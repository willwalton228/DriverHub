import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Activity, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  FileWarning, 
  RefreshCw, 
  XCircle,
  TrendingDown,
  TrendingUp,
  Minus
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface IntegrationHealth {
  status: "healthy" | "degraded" | "critical";
  healthScore: number;
  lastCheckedAt: string;
  metrics: {
    totalSyncs24h: number;
    successfulSyncs24h: number;
    failedSyncs24h: number;
    rejectedPushes24h: number;
    avgSyncDurationMs: number;
    slaBreaches24h: number;
    pendingSyncs: number;
    expiredDocsToday: number;
    readinessDowngrades24h: number;
  };
  recentFailures: Array<{
    id: string;
    eventType: string;
    status: string;
    candidateId: string | null;
    applicationId: string | null;
    errorMessage: string | null;
    rejectionReason: string | null;
    createdAt: string;
  }>;
  recentExpirations: Array<{
    id: string;
    documentName: string;
    documentType: string;
    candidateId: string;
    applicationId: string;
    expiredAt: string;
    previousReadinessStatus: string | null;
    newReadinessStatus: string | null;
  }>;
}

function HealthStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "healthy":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle2 className="w-3 h-3 mr-1" /> Healthy</Badge>;
    case "degraded":
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100"><AlertCircle className="w-3 h-3 mr-1" /> Degraded</Badge>;
    case "critical":
      return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Critical</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function SyncStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "success":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Success</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    case "rejected":
      return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Rejected</Badge>;
    case "pending":
      return <Badge variant="secondary">Pending</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function MetricCard({ 
  title, 
  value, 
  description, 
  icon: Icon,
  trend 
}: { 
  title: string; 
  value: string | number; 
  description?: string;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <div className="text-2xl font-bold">{value}</div>
          {trend && (
            <div className="text-muted-foreground">
              {trend === "up" && <TrendingUp className="h-4 w-4 text-green-500" />}
              {trend === "down" && <TrendingDown className="h-4 w-4 text-red-500" />}
              {trend === "neutral" && <Minus className="h-4 w-4" />}
            </div>
          )}
        </div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

export default function RecruitingIntegrationStatus() {
  const { data: health, isLoading, error, refetch } = useQuery<IntegrationHealth>({
    queryKey: ["/api/recruiting/integration/health"],
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Integration Status</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Unable to fetch integration health data. Please try again later.</p>
            <Button onClick={() => refetch()} className="mt-4" data-testid="button-retry">
              <RefreshCw className="w-4 h-4 mr-2" /> Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const successRate = health?.metrics.totalSyncs24h 
    ? Math.round((health.metrics.successfulSyncs24h / health.metrics.totalSyncs24h) * 100) 
    : 100;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Recruiting → Scheduling Integration</h1>
          <p className="text-muted-foreground">
            Monitor the health and status of candidate readiness syncs between Recruiting and Scheduling systems
          </p>
        </div>
        <div className="flex items-center gap-3">
          <HealthStatusBadge status={health?.status || "unknown"} />
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-health">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Health Score"
          value={`${health?.healthScore || 0}%`}
          description="Overall integration health"
          icon={Activity}
          trend={health?.healthScore && health.healthScore >= 80 ? "up" : health?.healthScore && health.healthScore >= 50 ? "neutral" : "down"}
        />
        <MetricCard
          title="Success Rate (24h)"
          value={`${successRate}%`}
          description={`${health?.metrics.successfulSyncs24h || 0} of ${health?.metrics.totalSyncs24h || 0} syncs`}
          icon={CheckCircle2}
          trend={successRate >= 95 ? "up" : successRate >= 80 ? "neutral" : "down"}
        />
        <MetricCard
          title="Failed / Rejected"
          value={`${(health?.metrics.failedSyncs24h || 0) + (health?.metrics.rejectedPushes24h || 0)}`}
          description={`${health?.metrics.failedSyncs24h || 0} failed, ${health?.metrics.rejectedPushes24h || 0} rejected`}
          icon={XCircle}
        />
        <MetricCard
          title="Avg Sync Time"
          value={`${health?.metrics.avgSyncDurationMs || 0}ms`}
          description={`SLA breaches: ${health?.metrics.slaBreaches24h || 0}`}
          icon={Clock}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Pending Syncs"
          value={health?.metrics.pendingSyncs || 0}
          description="Awaiting processing"
          icon={Clock}
        />
        <MetricCard
          title="Docs Expired Today"
          value={health?.metrics.expiredDocsToday || 0}
          description="Documents needing renewal"
          icon={FileWarning}
        />
        <MetricCard
          title="Readiness Downgrades"
          value={health?.metrics.readinessDowngrades24h || 0}
          description="Candidates removed from ready pool"
          icon={TrendingDown}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Sync Failures</CardTitle>
            <CardDescription>Failed and rejected sync attempts in the last 24 hours</CardDescription>
          </CardHeader>
          <CardContent>
            {health?.recentFailures && health.recentFailures.length > 0 ? (
              <ScrollArea className="h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Error/Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {health.recentFailures.map((failure) => (
                      <TableRow key={failure.id} data-testid={`row-sync-failure-${failure.id}`}>
                        <TableCell className="font-medium">{failure.eventType}</TableCell>
                        <TableCell><SyncStatusBadge status={failure.status} /></TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(failure.createdAt), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate" title={failure.errorMessage || failure.rejectionReason || ""}>
                          {failure.errorMessage || failure.rejectionReason || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mb-2 text-green-500" />
                <p>No recent failures</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Document Expirations</CardTitle>
            <CardDescription>Documents that expired and affected candidate readiness</CardDescription>
          </CardHeader>
          <CardContent>
            {health?.recentExpirations && health.recentExpirations.length > 0 ? (
              <ScrollArea className="h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Expired</TableHead>
                      <TableHead>Impact</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {health.recentExpirations.map((exp) => (
                      <TableRow key={exp.id} data-testid={`row-doc-expiry-${exp.id}`}>
                        <TableCell className="font-medium">{exp.documentName}</TableCell>
                        <TableCell className="text-sm">{exp.documentType}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(exp.expiredAt), { addSuffix: true })}
                        </TableCell>
                        <TableCell>
                          {exp.previousReadinessStatus === "ready" && exp.newReadinessStatus !== "ready" && (
                            <Badge variant="destructive" className="text-xs">Downgraded</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mb-2 text-green-500" />
                <p>No recent expirations</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Last Checked</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Health status last updated: {health?.lastCheckedAt 
              ? formatDistanceToNow(new Date(health.lastCheckedAt), { addSuffix: true })
              : "Unknown"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
