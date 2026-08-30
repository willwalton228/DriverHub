import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Download, 
  RefreshCw, 
  TrendingUp, 
  XCircle,
  Zap,
  FileWarning,
  Layers,
  Bell,
  PlayCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";

interface Metrics {
  eventsLastHour: { total: number; failed: number; failureRate: number };
  eventsLastDay: { total: number; failed: number; failureRate: number };
  latency: { p50Ms: number; p95Ms: number; avgMs: number };
  mapping: { total: number; unmapped: number; quarantined: number; failureRate: number };
  backlog: { pendingCount: number };
  topFailureReasons: Array<{ reason: string | null; count: number }>;
  lastEventReceivedAt: string | null;
  minutesSinceLastEvent: number | null;
  eventTypeBreakdown: Array<{ eventType: string; count: number }>;
  activeAlertsCount: number;
  thresholds: {
    ingestionFailureRate: number;
    ingestionFailureRateCritical: number;
    noEventsMinutes: number;
    latencyP95ThresholdMs: number;
    mappingFailureRate: number;
    backlogThreshold: number;
  };
}

interface IntegrationAlert {
  id: string;
  alertType: string;
  severity: string;
  title: string;
  message: string;
  details: Record<string, any>;
  triggeredAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNotes: string | null;
}

function MetricCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  status,
  testId
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string; 
  icon: any; 
  status?: 'good' | 'warning' | 'critical';
  testId?: string;
}) {
  const statusColors = {
    good: 'text-green-600 dark:text-green-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
    critical: 'text-red-600 dark:text-red-400',
  };

  return (
    <Card data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${status ? statusColors[status] : 'text-muted-foreground'}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${status ? statusColors[status] : ''}`} data-testid={testId ? `${testId}-value` : undefined}>{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getHealthStatus(metrics: Metrics): 'good' | 'warning' | 'critical' {
  const { thresholds } = metrics;
  
  if (
    metrics.eventsLastHour.failureRate >= thresholds.ingestionFailureRateCritical ||
    metrics.backlog.pendingCount > thresholds.backlogThreshold
  ) {
    return 'critical';
  }
  
  if (
    metrics.eventsLastHour.failureRate >= thresholds.ingestionFailureRate ||
    (metrics.latency.p95Ms && metrics.latency.p95Ms > thresholds.latencyP95ThresholdMs) ||
    metrics.mapping.failureRate >= thresholds.mappingFailureRate ||
    (metrics.minutesSinceLastEvent && metrics.minutesSinceLastEvent >= thresholds.noEventsMinutes)
  ) {
    return 'warning';
  }
  
  return 'good';
}

export default function IntegrationMonitoring() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: metrics, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery<Metrics>({
    queryKey: ["/api/admin/integrations/monitoring/metrics"],
  });

  const { data: alerts, isLoading: alertsLoading, refetch: refetchAlerts } = useQuery<IntegrationAlert[]>({
    queryKey: ["/api/admin/integrations/monitoring/alerts"],
  });

  const { data: activeAlerts } = useQuery<IntegrationAlert[]>({
    queryKey: ["/api/admin/integrations/monitoring/alerts", { status: "active" }],
  });

  const evaluateAlertsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/integrations/monitoring/evaluate");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Alert Evaluation Complete",
        description: `${data.triggeredAlerts} new alert(s) triggered`,
      });
      refetchAlerts();
      refetchMetrics();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/integrations/monitoring/alerts"] });
    },
    onError: () => {
      toast({
        title: "Evaluation Failed",
        description: "Could not evaluate alert conditions",
        variant: "destructive",
      });
    },
  });

  const resolveAlertMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const res = await apiRequest("POST", `/api/admin/integrations/monitoring/alerts/${id}/resolve`, {
        resolutionNotes: notes,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Alert Resolved" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/integrations/monitoring/alerts"] });
      refetchMetrics();
    },
    onError: () => {
      toast({
        title: "Failed to resolve alert",
        variant: "destructive",
      });
    },
  });

  const handleExportLogs = async (status?: string) => {
    try {
      const params = new URLSearchParams();
      params.set("format", "csv");
      params.set("limit", "5000");
      if (status) params.set("status", status);
      
      const response = await fetch(`/api/admin/integrations/monitoring/logs?${params}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `integration-logs-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: "Logs exported successfully" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const healthStatus = metrics ? getHealthStatus(metrics) : 'good';
  const healthColors = {
    good: 'bg-green-500',
    warning: 'bg-yellow-500',
    critical: 'bg-red-500',
  };

  if (metricsLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Integration Monitoring</h1>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Integration Monitoring</h1>
          <div className={`w-3 h-3 rounded-full ${healthColors[healthStatus]}`} title={`Status: ${healthStatus}`} />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => { refetchMetrics(); refetchAlerts(); }}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => evaluateAlertsMutation.mutate()}
            disabled={evaluateAlertsMutation.isPending}
            data-testid="button-evaluate-alerts"
          >
            <PlayCircle className="h-4 w-4 mr-2" />
            {evaluateAlertsMutation.isPending ? "Evaluating..." : "Run Alert Check"}
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleExportLogs()}
            data-testid="button-export-logs"
          >
            <Download className="h-4 w-4 mr-2" />
            Export Logs
          </Button>
        </div>
      </div>

      {activeAlerts && activeAlerts.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Active Alerts ({activeAlerts.length})</AlertTitle>
          <AlertDescription>
            {activeAlerts.slice(0, 3).map(a => a.title).join(", ")}
            {activeAlerts.length > 3 && ` and ${activeAlerts.length - 3} more`}
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="alerts" data-testid="tab-alerts">
            Alerts
            {activeAlerts && activeAlerts.length > 0 && (
              <Badge variant="destructive" className="ml-2">{activeAlerts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="details" data-testid="tab-details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Events (Last Hour)"
              value={metrics?.eventsLastHour.total || 0}
              subtitle={`${metrics?.eventsLastHour.failed || 0} failed`}
              icon={TrendingUp}
              status={metrics && metrics.eventsLastHour.failureRate >= (metrics.thresholds.ingestionFailureRate) ? 'warning' : 'good'}
              testId="card-events-hour"
            />
            <MetricCard
              title="Events (Last 24h)"
              value={metrics?.eventsLastDay.total || 0}
              subtitle={`${((metrics?.eventsLastDay.failureRate || 0) * 100).toFixed(1)}% failure rate`}
              icon={Activity}
              testId="card-events-day"
            />
            <MetricCard
              title="P95 Latency"
              value={formatLatency(metrics?.latency.p95Ms)}
              subtitle={`P50: ${formatLatency(metrics?.latency.p50Ms)}`}
              icon={Clock}
              status={metrics?.latency.p95Ms && metrics.latency.p95Ms > (metrics?.thresholds.latencyP95ThresholdMs || 60000) ? 'warning' : 'good'}
              testId="card-latency"
            />
            <MetricCard
              title="Pending Backlog"
              value={metrics?.backlog.pendingCount || 0}
              subtitle={`Threshold: ${metrics?.thresholds.backlogThreshold || 1000}`}
              icon={Layers}
              status={metrics && metrics.backlog.pendingCount > (metrics.thresholds.backlogThreshold) ? 'critical' : 'good'}
              testId="card-backlog"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card data-testid="card-mapping-status">
              <CardHeader>
                <CardTitle className="text-lg">Mapping Status</CardTitle>
                <CardDescription>Event-to-reference data mapping health</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total Events (24h)</span>
                  <span className="font-medium" data-testid="text-mapping-total">{metrics?.mapping.total || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Unmapped</span>
                  <Badge variant={metrics && metrics.mapping.unmapped > 0 ? "secondary" : "outline"} data-testid="badge-unmapped">
                    {metrics?.mapping.unmapped || 0}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Quarantined</span>
                  <Badge variant={metrics && metrics.mapping.quarantined > 0 ? "destructive" : "outline"} data-testid="badge-quarantined">
                    {metrics?.mapping.quarantined || 0}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Failure Rate</span>
                  <span className={`font-medium ${metrics && metrics.mapping.failureRate >= (metrics.thresholds.mappingFailureRate) ? 'text-red-600' : ''}`} data-testid="text-mapping-failure-rate">
                    {((metrics?.mapping.failureRate || 0) * 100).toFixed(1)}%
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-last-activity">
              <CardHeader>
                <CardTitle className="text-lg">Last Activity</CardTitle>
                <CardDescription>Most recent event and connectivity</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Last Event</span>
                  <span className="font-medium" data-testid="text-last-event">
                    {metrics?.lastEventReceivedAt 
                      ? formatDistanceToNow(new Date(metrics.lastEventReceivedAt), { addSuffix: true })
                      : 'Never'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Minutes Since Last</span>
                  <Badge variant={
                    metrics?.minutesSinceLastEvent && metrics.minutesSinceLastEvent >= (metrics.thresholds.noEventsMinutes)
                      ? "destructive" 
                      : "outline"
                  } data-testid="badge-minutes-since-last">
                    {metrics?.minutesSinceLastEvent ?? '—'}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Active Alerts</span>
                  <Badge variant={metrics && metrics.activeAlertsCount > 0 ? "destructive" : "outline"} data-testid="badge-active-alerts">
                    {metrics?.activeAlertsCount || 0}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {metrics?.topFailureReasons && metrics.topFailureReasons.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Top Failure Reasons (24h)</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics.topFailureReasons.slice(0, 5).map((reason, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-sm">
                          {reason.reason || 'Unknown'}
                        </TableCell>
                        <TableCell className="text-right">{reason.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {metrics?.eventTypeBreakdown && metrics.eventTypeBreakdown.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Event Type Breakdown (24h)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {metrics.eventTypeBreakdown.map((item) => (
                    <Badge key={item.eventType} variant="secondary" className="text-sm">
                      {item.eventType}: {item.count}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="alerts" className="space-y-6 mt-4">
          <div className="flex gap-2 mb-4 flex-wrap">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleExportLogs("failed")}
            >
              <Download className="h-4 w-4 mr-2" />
              Export Failed Events
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleExportLogs("quarantined")}
            >
              <Download className="h-4 w-4 mr-2" />
              Export Quarantined
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Alert History</CardTitle>
              <CardDescription>Recent integration alerts and their status</CardDescription>
            </CardHeader>
            <CardContent>
              {alertsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : alerts && alerts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Severity</TableHead>
                      <TableHead>Alert</TableHead>
                      <TableHead>Triggered</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerts.map((alert) => (
                      <TableRow key={alert.id} data-testid={`row-alert-${alert.id}`}>
                        <TableCell>
                          <Badge 
                            variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}
                            data-testid={`badge-severity-${alert.id}`}
                          >
                            {alert.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium" data-testid={`text-alert-title-${alert.id}`}>{alert.title}</div>
                            <div className="text-sm text-muted-foreground">{alert.message}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm" data-testid={`text-alert-time-${alert.id}`}>
                          {format(new Date(alert.triggeredAt), 'MMM d, h:mm a')}
                        </TableCell>
                        <TableCell>
                          {alert.resolvedAt ? (
                            <Badge variant="outline" className="text-green-600" data-testid={`badge-resolved-${alert.id}`}>
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Resolved
                            </Badge>
                          ) : (
                            <Badge variant="destructive" data-testid={`badge-active-${alert.id}`}>
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {!alert.resolvedAt && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => resolveAlertMutation.mutate({ id: alert.id })}
                              disabled={resolveAlertMutation.isPending}
                              data-testid={`button-resolve-${alert.id}`}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Resolve
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No alerts recorded</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Alert Thresholds</CardTitle>
              <CardDescription>Current configuration for alert rules</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule</TableHead>
                    <TableHead>Threshold</TableHead>
                    <TableHead>Current Value</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Ingestion Failure Rate (Warning)</TableCell>
                    <TableCell>{((metrics?.thresholds.ingestionFailureRate || 0) * 100)}%</TableCell>
                    <TableCell>{((metrics?.eventsLastHour.failureRate || 0) * 100).toFixed(1)}%</TableCell>
                    <TableCell>
                      {metrics && metrics.eventsLastHour.failureRate >= metrics.thresholds.ingestionFailureRate ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Ingestion Failure Rate (Critical)</TableCell>
                    <TableCell>{((metrics?.thresholds.ingestionFailureRateCritical || 0) * 100)}%</TableCell>
                    <TableCell>{((metrics?.eventsLastHour.failureRate || 0) * 100).toFixed(1)}%</TableCell>
                    <TableCell>
                      {metrics && metrics.eventsLastHour.failureRate >= metrics.thresholds.ingestionFailureRateCritical ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>No Events Received</TableCell>
                    <TableCell>{metrics?.thresholds.noEventsMinutes} minutes</TableCell>
                    <TableCell>{metrics?.minutesSinceLastEvent ?? '—'} minutes</TableCell>
                    <TableCell>
                      {metrics?.minutesSinceLastEvent && metrics.minutesSinceLastEvent >= metrics.thresholds.noEventsMinutes ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>P95 Latency</TableCell>
                    <TableCell>{formatLatency(metrics?.thresholds.latencyP95ThresholdMs)}</TableCell>
                    <TableCell>{formatLatency(metrics?.latency.p95Ms)}</TableCell>
                    <TableCell>
                      {metrics?.latency.p95Ms && metrics.latency.p95Ms > metrics.thresholds.latencyP95ThresholdMs ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Mapping Failure Rate</TableCell>
                    <TableCell>{((metrics?.thresholds.mappingFailureRate || 0) * 100)}%</TableCell>
                    <TableCell>{((metrics?.mapping.failureRate || 0) * 100).toFixed(1)}%</TableCell>
                    <TableCell>
                      {metrics && metrics.mapping.failureRate >= metrics.thresholds.mappingFailureRate ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Processor Backlog</TableCell>
                    <TableCell>{metrics?.thresholds.backlogThreshold} events</TableCell>
                    <TableCell>{metrics?.backlog.pendingCount} events</TableCell>
                    <TableCell>
                      {metrics && metrics.backlog.pendingCount > metrics.thresholds.backlogThreshold ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
