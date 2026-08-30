import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle, AlertCircle, CheckCircle2, Clock, Loader2,
  Play, Settings, Users, MapPin, CalendarDays, ArrowRight,
  Info, ShieldAlert, RefreshCw, Eye, Check, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface IntegritySummary {
  latestScan: {
    id: string;
    status: string;
    totalIssues: number;
    issueCounts: Record<string, number>;
    durationMs: number;
    startedAt: string;
    completedAt: string;
    windowStart: string;
    windowEnd: string;
  } | null;
  openIssues: Record<string, { total: number; critical: number; warning: number; info: number }>;
  totalOpen: number;
  totalCritical: number;
}

interface IntegrityIssue {
  issue: {
    id: string;
    scanId: string;
    issueType: string;
    severity: string;
    entityType: string;
    entityId: string;
    shiftId: string | null;
    assignmentId: string | null;
    userId: string | null;
    locationId: string | null;
    title: string;
    description: string | null;
    details: Record<string, any> | null;
    status: string;
    acknowledgedBy: string | null;
    acknowledgedAt: string | null;
    resolvedAt: string | null;
    createdAt: string;
  };
  locationName: string | null;
  userName: string | null;
}

interface IntegrityConfig {
  id: string;
  enabled: boolean;
  scanHourUtc: number;
  lookbackDays: number;
  checksEnabled: Record<string, boolean>;
  lastScanAt: string | null;
}

const issueTypeLabels: Record<string, { label: string; icon: typeof AlertTriangle; description: string }> = {
  unassigned_shift: { label: "Unassigned Shifts", icon: Users, description: "Published shifts without enough assigned staff" },
  missing_clock_in: { label: "Missing Clock-Ins", icon: Clock, description: "Past shifts where assigned workers never clocked in" },
  broken_location_link: { label: "Broken Location Links", icon: MapPin, description: "Shifts referencing inactive or missing locations" },
  attendance_mismatch: { label: "Attendance Mismatches", icon: CalendarDays, description: "Clock-in times that don't align with shift schedules" },
};

const severityConfig: Record<string, { color: string; icon: typeof AlertTriangle }> = {
  critical: { color: "text-red-600 dark:text-red-400", icon: ShieldAlert },
  warning: { color: "text-amber-600 dark:text-amber-400", icon: AlertTriangle },
  info: { color: "text-blue-600 dark:text-blue-400", icon: Info },
};

export default function SchedulingDataHealthTab() {
  const { toast } = useToast();
  const [filterType, setFilterType] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("open");
  const [showConfig, setShowConfig] = useState(false);
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);

  const summaryQuery = useQuery<IntegritySummary>({
    queryKey: ["/api/corporate/scheduling/integrity/summary"],
  });
  const summaryError = summaryQuery.isError;

  const configQuery = useQuery<{ config: IntegrityConfig }>({
    queryKey: ["/api/corporate/scheduling/integrity/config"],
  });

  const issueParams = new URLSearchParams();
  if (filterType !== "all") issueParams.set("issueType", filterType);
  if (filterSeverity !== "all") issueParams.set("severity", filterSeverity);
  if (filterStatus !== "all") issueParams.set("status", filterStatus);
  const issuesUrl = `/api/corporate/scheduling/integrity/issues?${issueParams.toString()}`;

  const issuesQuery = useQuery<{ issues: IntegrityIssue[]; total: number }>({
    queryKey: [issuesUrl],
  });

  const scanMutation = useMutation({
    mutationFn: async (lookbackDays: number) => {
      const res = await apiRequest("POST", "/api/corporate/scheduling/integrity/scans", { lookbackDays });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/corporate/scheduling/integrity');
        },
      });
      toast({
        title: "Scan completed",
        description: `Found ${data.totalIssues} issue(s) across all checks.`,
      });
    },
    onError: () => {
      toast({ title: "Scan failed", description: "Could not complete the integrity scan.", variant: "destructive" });
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/corporate/scheduling/integrity/issues/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/corporate/scheduling/integrity');
        },
      });
    },
  });

  const configMutation = useMutation({
    mutationFn: async (updates: Partial<IntegrityConfig>) => {
      const res = await apiRequest("PUT", "/api/corporate/scheduling/integrity/config", updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/integrity/config"] });
      toast({ title: "Configuration saved" });
    },
  });

  const summary = summaryQuery.data;
  const config = configQuery.data?.config;
  const issues = issuesQuery.data?.issues || [];
  const totalIssues = issuesQuery.data?.total || 0;

  return (
    <div className="space-y-6" data-testid="data-health-tab">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold" data-testid="text-health-title">Data Health</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor scheduling data integrity and surface issues that compromise trust.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConfig(!showConfig)}
            data-testid="button-toggle-config"
          >
            <Settings className="h-4 w-4 mr-1" />
            Configure
          </Button>
          <Button
            onClick={() => scanMutation.mutate(config?.lookbackDays || 7)}
            disabled={scanMutation.isPending}
            data-testid="button-run-scan"
          >
            {scanMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-1" />
            )}
            {scanMutation.isPending ? "Scanning..." : "Run Scan"}
          </Button>
        </div>
      </div>

      {showConfig && config && (
        <Card data-testid="card-config">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Scan Configuration</CardTitle>
            <CardDescription>Configure daily automated integrity scans</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label>Daily Automated Scan</Label>
                <p className="text-xs text-muted-foreground">Automatically run a scan every day</p>
              </div>
              <Switch
                checked={config.enabled}
                onCheckedChange={(enabled) => configMutation.mutate({ enabled })}
                data-testid="switch-enabled"
              />
            </div>
            <Separator />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Scan Hour (UTC)</Label>
                <Select
                  value={String(config.scanHourUtc)}
                  onValueChange={(v) => configMutation.mutate({ scanHourUtc: parseInt(v) })}
                >
                  <SelectTrigger data-testid="select-scan-hour">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {String(i).padStart(2, "0")}:00 UTC
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Lookback Window (days)</Label>
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={config.lookbackDays}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (val >= 1 && val <= 90) configMutation.mutate({ lookbackDays: val });
                  }}
                  data-testid="input-lookback-days"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Enabled Checks</Label>
                <div className="space-y-1">
                  {Object.entries(issueTypeLabels).map(([key, { label }]) => (
                    <div key={key} className="flex items-center gap-2">
                      <Switch
                        checked={config.checksEnabled?.[key] !== false}
                        onCheckedChange={(checked) =>
                          configMutation.mutate({
                            checksEnabled: { ...config.checksEnabled, [key]: checked },
                          })
                        }
                        className="scale-75"
                        data-testid={`switch-check-${key}`}
                      />
                      <span className="text-xs">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {summaryQuery.isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : summaryError ? (
        <div className="flex items-center gap-2 py-4 text-sm" data-testid="error-health-summary">
          <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
          <span className="text-muted-foreground">Unable to load integrity summary.</span>
          <Button variant="ghost" size="sm" className="h-auto p-0 text-sm" onClick={() => summaryQuery.refetch()}>Retry</Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="summary-cards">
            {Object.entries(issueTypeLabels).map(([key, { label, icon: Icon, description }]) => {
              const counts = summary?.openIssues?.[key];
              const total = counts?.total || 0;
              const critical = counts?.critical || 0;

              return (
                <Card
                  key={key}
                  className={cn(
                    "cursor-pointer hover-elevate",
                    filterType === key && "ring-2 ring-primary"
                  )}
                  onClick={() => setFilterType(filterType === key ? "all" : key)}
                  data-testid={`card-issue-type-${key}`}
                >
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <Icon className={cn("h-4 w-4", total > 0 ? "text-amber-500" : "text-muted-foreground")} />
                      {critical > 0 && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                          {critical} critical
                        </Badge>
                      )}
                    </div>
                    <div className="text-2xl font-bold" data-testid={`text-count-${key}`}>{total}</div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{label}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {summary?.latestScan && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap" data-testid="text-last-scan">
              <div className="flex items-center gap-1">
                <RefreshCw className="h-3 w-3" />
                Last scan: {format(new Date(summary.latestScan.completedAt), "MMM d, yyyy h:mm a")}
              </div>
              <span>|</span>
              <span>Window: {summary.latestScan.windowStart} to {summary.latestScan.windowEnd}</span>
              <span>|</span>
              <span>{summary.latestScan.totalIssues} issue(s) found in {summary.latestScan.durationMs}ms</span>
            </div>
          )}

          {!summary?.latestScan && (
            <Card>
              <CardContent className="py-8 text-center">
                <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium">No scans have been run yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click "Run Scan" to analyze your scheduling data for integrity issues.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Separator />

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[180px]" data-testid="select-filter-type">
            <SelectValue placeholder="Issue Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(issueTypeLabels).map(([key, { label }]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-[140px]" data-testid="select-filter-severity">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]" data-testid="select-filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="acknowledged">Acknowledged</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto" data-testid="text-issue-count">
          {totalIssues} issue(s)
        </span>
      </div>

      {issuesQuery.isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : issuesQuery.isError ? (
        <div className="flex items-center gap-2 py-4 text-sm" data-testid="error-health-issues">
          <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
          <span className="text-muted-foreground">Unable to load integrity issues.</span>
          <Button variant="ghost" size="sm" className="h-auto p-0 text-sm" onClick={() => issuesQuery.refetch()}>Retry</Button>
        </div>
      ) : issues.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <CheckCircle2 className="h-8 w-8 mx-auto text-green-500 mb-2" />
            <p className="text-sm font-medium" data-testid="text-no-issues">
              {filterType !== "all" || filterSeverity !== "all" || filterStatus !== "all"
                ? "No issues match your filters"
                : "No open issues found"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {summary?.latestScan ? "Your scheduling data looks healthy." : "Run a scan to check for issues."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2" data-testid="issues-list">
          {issues.map((item) => {
            const issue = item.issue;
            const sevConfig = severityConfig[issue.severity] || severityConfig.warning;
            const SevIcon = sevConfig.icon;
            const typeInfo = issueTypeLabels[issue.issueType];
            const TypeIcon = typeInfo?.icon || AlertTriangle;
            const isExpanded = expandedIssue === issue.id;

            return (
              <Card
                key={issue.id}
                className="overflow-visible"
                data-testid={`card-issue-${issue.id}`}
              >
                <div
                  className="flex items-start gap-3 p-4 cursor-pointer"
                  onClick={() => setExpandedIssue(isExpanded ? null : issue.id)}
                  data-testid={`button-expand-issue-${issue.id}`}
                >
                  <SevIcon className={cn("h-4 w-4 mt-0.5 shrink-0", sevConfig.color)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{issue.title}</span>
                      <Badge variant="outline" className="text-[10px]">
                        <TypeIcon className="h-3 w-3 mr-0.5" />
                        {typeInfo?.label || issue.issueType}
                      </Badge>
                      <Badge
                        variant={issue.severity === "critical" ? "destructive" : "secondary"}
                        className="text-[10px]"
                      >
                        {issue.severity}
                      </Badge>
                      {issue.status !== "open" && (
                        <Badge variant="outline" className="text-[10px]">
                          {issue.status === "acknowledged" ? <Eye className="h-3 w-3 mr-0.5" /> : <Check className="h-3 w-3 mr-0.5" />}
                          {issue.status}
                        </Badge>
                      )}
                    </div>
                    {issue.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{issue.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                      {item.locationName && (
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{item.locationName}</span>
                      )}
                      {item.userName && (
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{item.userName}</span>
                      )}
                      <span>{format(new Date(issue.createdAt), "MMM d, h:mm a")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {issue.status === "open" && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            acknowledgeMutation.mutate({ id: issue.id, status: "acknowledged" });
                          }}
                          data-testid={`button-ack-${issue.id}`}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Ack
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            acknowledgeMutation.mutate({ id: issue.id, status: "resolved" });
                          }}
                          data-testid={`button-resolve-${issue.id}`}
                        >
                          <Check className="h-3.5 w-3.5 mr-1" />
                          Resolve
                        </Button>
                      </>
                    )}
                    {issue.status === "acknowledged" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          acknowledgeMutation.mutate({ id: issue.id, status: "resolved" });
                        }}
                        data-testid={`button-resolve-${issue.id}`}
                      >
                        <Check className="h-3.5 w-3.5 mr-1" />
                        Resolve
                      </Button>
                    )}
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>

                {isExpanded && issue.details && (
                  <div className="px-4 pb-4 pt-0">
                    <Separator className="mb-3" />
                    <div className="bg-muted/50 rounded-md p-3">
                      <p className="text-xs font-medium mb-2">Issue Details</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {Object.entries(issue.details).map(([key, value]) => (
                          <div key={key}>
                            <span className="text-[10px] text-muted-foreground block">
                              {key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                            </span>
                            <span className="text-xs font-medium">
                              {value instanceof Date
                                ? format(value, "MMM d, h:mm a")
                                : typeof value === "boolean"
                                ? value ? "Yes" : "No"
                                : String(value ?? "—")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
