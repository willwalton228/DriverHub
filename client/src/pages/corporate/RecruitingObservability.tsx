import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Activity,
  TrendingUp,
  Filter,
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useState } from "react";

interface ObservabilityError {
  id: string;
  traceId: string | null;
  eventType: string;
  status: string;
  severity: string;
  userId: string | null;
  applicationId: string | null;
  requisitionId: string | null;
  candidateId: string | null;
  docRequestId: string | null;
  latencyMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  route: string | null;
  method: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
}

interface ErrorsResponse {
  errors: ObservabilityError[];
  summary: {
    totalErrors: number;
    byEventType: Record<string, number>;
    byErrorCode: Record<string, number>;
  };
  metrics: {
    avgLatencyMs: Record<string, number>;
    totalEvents: number;
    errorRate: number;
  };
  since: string;
  hours: number;
}

interface MetricsResponse {
  totalEvents: number;
  successCount: number;
  errorCount: number;
  errorRate: number;
  avgLatencyMs: number;
  eventTypeBreakdown: Array<{
    eventType: string;
    count: number;
    errorCount: number;
    avgLatency: number;
  }>;
  since: string;
  hours: number;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  apply_submit: "Apply Submit",
  stage_transition: "Stage Transition",
  doc_upload_init: "Doc Upload Init",
  doc_upload_finalize: "Doc Upload Finalize",
  doc_download: "Doc Download",
  message_send: "Message Send",
  pipeline_load: "Pipeline Load",
  application_create: "Application Create",
  candidate_create: "Candidate Create",
  bulk_operation: "Bulk Operation",
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export default function RecruitingObservability() {
  const [hours, setHours] = useState("24");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");

  const errorsQuery = useQuery<ErrorsResponse>({
    queryKey: ["/api/admin/recruiting-observability/errors", hours, eventTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ hours });
      if (eventTypeFilter !== "all") params.set("eventType", eventTypeFilter);
      const res = await fetch(`/api/admin/recruiting-observability/errors?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load errors");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const metricsQuery = useQuery<MetricsResponse>({
    queryKey: ["/api/admin/recruiting-observability/metrics", hours],
    queryFn: async () => {
      const res = await fetch(`/api/admin/recruiting-observability/metrics?hours=${hours}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load metrics");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/recruiting-observability/errors"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/recruiting-observability/metrics"] });
  };

  if (errorsQuery.isError || metricsQuery.isError) {
    return (
      <div className="p-6" data-testid="page-recruiting-observability">
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription data-testid="text-error-message">
            Failed to load recruiting observability data. You may not have admin access.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const metrics = metricsQuery.data;
  const errorsData = errorsQuery.data;

  return (
    <div className="p-6 space-y-6 overflow-auto h-full" data-testid="page-recruiting-observability">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Recruiting Observability</h1>
          <p className="text-sm text-muted-foreground">Error dashboard and performance metrics for recruiting operations</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={hours} onValueChange={setHours}>
            <SelectTrigger className="w-[140px]" data-testid="select-time-range">
              <Clock className="h-4 w-4 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 1 hour</SelectItem>
              <SelectItem value="4">Last 4 hours</SelectItem>
              <SelectItem value="12">Last 12 hours</SelectItem>
              <SelectItem value="24">Last 24 hours</SelectItem>
              <SelectItem value="72">Last 3 days</SelectItem>
              <SelectItem value="168">Last 7 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
            <SelectTrigger className="w-[180px]" data-testid="select-event-type-filter">
              <Filter className="h-4 w-4 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Event Types</SelectItem>
              {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="default"
            onClick={handleRefresh}
            disabled={errorsQuery.isLoading || metricsQuery.isLoading}
            data-testid="button-refresh"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${errorsQuery.isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {metricsQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : metrics ? (
        <div className="grid gap-4 md:grid-cols-4">
          <Card data-testid="card-total-events">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Events</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-events">{metrics.totalEvents}</div>
              <p className="text-xs text-muted-foreground">Last {hours}h</p>
            </CardContent>
          </Card>
          <Card data-testid="card-success-count">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Successful</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-success-count">{metrics.successCount}</div>
              <p className="text-xs text-muted-foreground">
                {metrics.totalEvents > 0
                  ? `${((1 - metrics.errorRate) * 100).toFixed(1)}% success rate`
                  : "No events"}
              </p>
            </CardContent>
          </Card>
          <Card data-testid="card-error-count">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Errors</CardTitle>
              <XCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive" data-testid="text-error-count">{metrics.errorCount}</div>
              <p className="text-xs text-muted-foreground">
                {metrics.totalEvents > 0
                  ? `${(metrics.errorRate * 100).toFixed(1)}% error rate`
                  : "No errors"}
              </p>
            </CardContent>
          </Card>
          <Card data-testid="card-avg-latency">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-avg-latency">{metrics.avgLatencyMs}ms</div>
              <p className="text-xs text-muted-foreground">Across all events</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {metricsQuery.isLoading ? (
        <Skeleton className="h-48" />
      ) : metrics && metrics.eventTypeBreakdown.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Event Type Breakdown</CardTitle>
            <CardDescription>Performance by recruiting event type</CardDescription>
          </CardHeader>
          <CardContent>
            <Table data-testid="table-event-breakdown">
              <TableHeader>
                <TableRow>
                  <TableHead>Event Type</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                  <TableHead className="text-right">Error Rate</TableHead>
                  <TableHead className="text-right">Avg Latency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.eventTypeBreakdown.map(row => (
                  <TableRow key={row.eventType} data-testid={`row-breakdown-${row.eventType}`}>
                    <TableCell className="font-medium">
                      {EVENT_TYPE_LABELS[row.eventType] || row.eventType}
                    </TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                    <TableCell className="text-right">
                      {row.errorCount > 0 ? (
                        <span className="text-destructive font-medium">{row.errorCount}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.count > 0 ? (
                        <Badge variant={row.errorCount / row.count > 0.05 ? "destructive" : "secondary"}>
                          {((row.errorCount / row.count) * 100).toFixed(1)}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.avgLatency > 0 ? `${row.avgLatency}ms` : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Recent Errors
          </CardTitle>
          <CardDescription>
            {errorsData
              ? `${errorsData.summary.totalErrors} error(s) in the last ${hours} hours`
              : "Loading..."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorsQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : errorsData && errorsData.errors.length > 0 ? (
            <div className="overflow-auto">
              <Table data-testid="table-recent-errors">
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Error Code</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Trace ID</TableHead>
                    <TableHead className="text-right">Latency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errorsData.errors.map(err => (
                    <TableRow key={err.id} data-testid={`row-error-${err.id}`}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatTime(err.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {EVENT_TYPE_LABELS[err.eventType] || err.eventType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1 py-0.5 rounded" data-testid={`text-error-code-${err.id}`}>
                          {err.errorCode || "UNKNOWN"}
                        </code>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-sm" title={err.errorMessage || ""}>
                        {err.errorMessage || "-"}
                      </TableCell>
                      <TableCell>
                        {err.traceId ? (
                          <code className="text-xs text-muted-foreground" data-testid={`text-trace-id-${err.id}`}>
                            {err.traceId.slice(0, 12)}...
                          </code>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {err.latencyMs != null ? `${err.latencyMs}ms` : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-errors">
              <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-600" />
              <p>No errors in the last {hours} hours</p>
            </div>
          )}
        </CardContent>
      </Card>

      {errorsData && Object.keys(errorsData.summary.byErrorCode).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Error Code Distribution</CardTitle>
            <CardDescription>Breakdown by error code</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2" data-testid="error-code-distribution">
              {Object.entries(errorsData.summary.byErrorCode)
                .sort((a, b) => b[1] - a[1])
                .map(([code, count]) => (
                  <Badge key={code} variant="destructive">
                    {code}: {count}
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
