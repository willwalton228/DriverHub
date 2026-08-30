import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Mail,
  TrendingDown,
  Activity,
  Camera,
  Settings,
  RefreshCw,
  Loader2,
} from "lucide-react";

interface HealthMetric {
  count?: number;
  rate?: number;
  breachCount?: number;
  totalTracked?: number;
  status: "ok" | "warning" | "critical";
}

interface HealthData {
  metrics: {
    stalledApplications: HealthMetric;
    slaBreachRate: HealthMetric;
    unreadInbound: HealthMetric;
    readinessRegressions: HealthMetric;
    overallStatus: "ok" | "warning" | "critical";
  };
  thresholds: Array<{
    id: string;
    metricKey: string;
    warningValue: string;
    criticalValue: string;
    lookbackDays: number;
    stalledDays: number | null;
    isEnabled: boolean;
  }>;
  snapshots: Array<{
    id: string;
    snapshotDate: string;
    stalledApplicationsCount: number;
    slaBreachRate: string;
    slaBreachCount: number;
    slaTotalTracked: number;
    unreadInboundCount: number;
    readinessRegressionCount: number;
  }>;
}

const statusIcon = (status: "ok" | "warning" | "critical") => {
  if (status === "critical") return <AlertTriangle className="h-5 w-5 text-red-500" />;
  if (status === "warning") return <AlertTriangle className="h-5 w-5 text-amber-500" />;
  return <CheckCircle2 className="h-5 w-5 text-green-500" />;
};

const statusBadge = (status: "ok" | "warning" | "critical") => {
  if (status === "critical") return <Badge variant="destructive" className="no-default-hover-elevate no-default-active-elevate">Critical</Badge>;
  if (status === "warning") return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 no-default-hover-elevate no-default-active-elevate">Warning</Badge>;
  return <Badge variant="outline" className="text-green-700 dark:text-green-400 no-default-hover-elevate no-default-active-elevate">Healthy</Badge>;
};

const metricConfig = [
  {
    key: "stalledApplications",
    label: "Stalled Applications",
    description: "Applications with no activity beyond configured days",
    icon: Clock,
    thresholdKey: "stalled_applications",
    valueField: "count" as const,
  },
  {
    key: "slaBreachRate",
    label: "SLA Breach Rate",
    description: "Percentage of active applications breaching SLA targets",
    icon: Activity,
    thresholdKey: "sla_breach_rate",
    valueField: "rate" as const,
    suffix: "%",
  },
  {
    key: "unreadInbound",
    label: "Unread Inbound Messages",
    description: "Inbound communications without a reply within lookback window",
    icon: Mail,
    thresholdKey: "unread_inbound",
    valueField: "count" as const,
  },
  {
    key: "readinessRegressions",
    label: "Readiness Regressions",
    description: "Unresolved readiness regression events within lookback window",
    icon: TrendingDown,
    thresholdKey: "readiness_regressions",
    valueField: "count" as const,
  },
];

function TrendIndicator({ current, previous }: { current: number; previous: number | undefined }) {
  if (previous === undefined) return null;
  const diff = current - previous;
  if (diff === 0) return <span className="text-xs text-muted-foreground ml-2">No change</span>;
  const isUp = diff > 0;
  return (
    <span className={`text-xs ml-2 ${isUp ? "text-red-500" : "text-green-500"}`}>
      {isUp ? "+" : ""}{diff} vs yesterday
    </span>
  );
}

export default function RecruitingHealthDashboard() {
  const { toast } = useToast();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: healthData, isLoading, refetch } = useQuery<HealthData>({
    queryKey: ["/api/recruiting/health"],
  });

  const snapshotMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/recruiting/health/snapshot");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/health"] });
      toast({ title: "Snapshot generated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to generate snapshot", description: error.message, variant: "destructive" });
    },
  });

  const thresholdMutation = useMutation({
    mutationFn: async ({ metricKey, updates }: { metricKey: string; updates: Record<string, any> }) => {
      await apiRequest("PUT", `/api/recruiting/health/thresholds/${metricKey}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/health"] });
      toast({ title: "Threshold updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update threshold", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!healthData) {
    return (
      <div className="text-center py-12 text-muted-foreground" data-testid="health-no-data">
        Unable to load health data. Ensure you have admin access.
      </div>
    );
  }

  const { metrics, thresholds, snapshots } = healthData;
  const yesterdaySnapshot = snapshots.length > 0 ? snapshots[0] : undefined;

  const thresholdMap: Record<string, typeof thresholds[0]> = {};
  for (const t of thresholds) {
    thresholdMap[t.metricKey] = t;
  }

  const getSnapshotPrevious = (key: string): number | undefined => {
    if (!yesterdaySnapshot) return undefined;
    const map: Record<string, number> = {
      stalledApplications: yesterdaySnapshot.stalledApplicationsCount,
      slaBreachRate: parseFloat(yesterdaySnapshot.slaBreachRate),
      unreadInbound: yesterdaySnapshot.unreadInboundCount,
      readinessRegressions: yesterdaySnapshot.readinessRegressionCount,
    };
    return map[key];
  };

  return (
    <div className="space-y-6" data-testid="panel-health-dashboard">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Recruiting System Health</h2>
          {statusBadge(metrics.overallStatus)}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => snapshotMutation.mutate()}
            disabled={snapshotMutation.isPending}
            data-testid="button-generate-snapshot"
          >
            {snapshotMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            Take Snapshot
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            data-testid="button-refresh-health"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-health-settings">
                <Settings className="h-4 w-4" />
                Thresholds
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Health Threshold Configuration</DialogTitle>
              </DialogHeader>
              <div className="space-y-6 pt-2 max-h-[60vh] overflow-y-auto">
                {metricConfig.map((cfg) => {
                  const threshold = thresholdMap[cfg.thresholdKey];
                  if (!threshold) return null;
                  return (
                    <ThresholdEditor
                      key={cfg.thresholdKey}
                      label={cfg.label}
                      threshold={threshold}
                      hasStalledDays={cfg.thresholdKey === "stalled_applications"}
                      onSave={(updates) => thresholdMutation.mutate({ metricKey: cfg.thresholdKey, updates })}
                      isSaving={thresholdMutation.isPending}
                    />
                  );
                })}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {metricConfig.map((cfg) => {
          const metric = (metrics as any)[cfg.key] as HealthMetric;
          const threshold = thresholdMap[cfg.thresholdKey];
          const value = cfg.valueField === "rate" ? metric.rate ?? 0 : metric.count ?? 0;
          const previous = getSnapshotPrevious(cfg.key);
          const Icon = cfg.icon;

          return (
            <Card
              key={cfg.key}
              data-testid={`health-card-${cfg.thresholdKey}`}
              className={
                metric.status === "critical"
                  ? "border-red-500/50 dark:border-red-500/30"
                  : metric.status === "warning"
                  ? "border-amber-500/50 dark:border-amber-500/30"
                  : ""
              }
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <CardTitle className="text-sm font-medium truncate">{cfg.label}</CardTitle>
                </div>
                {statusBadge(metric.status)}
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold" data-testid={`health-value-${cfg.thresholdKey}`}>
                    {value}{cfg.suffix || ""}
                  </span>
                  <TrendIndicator current={value} previous={previous} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{cfg.description}</p>
                {cfg.key === "slaBreachRate" && metric.breachCount !== undefined && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {metric.breachCount} breaches / {metric.totalTracked} tracked
                  </p>
                )}
                {threshold && (
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>
                      Warning: {threshold.warningValue}{cfg.suffix || ""}
                    </span>
                    <span>
                      Critical: {threshold.criticalValue}{cfg.suffix || ""}
                    </span>
                    {threshold.lookbackDays && (
                      <span>{threshold.lookbackDays}d lookback</span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {snapshots.length > 0 && (
        <Card data-testid="health-trend-card">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Recent Snapshots</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Date</th>
                    <th className="text-right py-2 px-4 font-medium text-muted-foreground">Stalled</th>
                    <th className="text-right py-2 px-4 font-medium text-muted-foreground">SLA Breach %</th>
                    <th className="text-right py-2 px-4 font-medium text-muted-foreground">Unread</th>
                    <th className="text-right py-2 pl-4 font-medium text-muted-foreground">Regressions</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.slice(0, 7).map((snap) => (
                    <tr key={snap.id} className="border-b last:border-0" data-testid={`snapshot-row-${snap.snapshotDate}`}>
                      <td className="py-2 pr-4">{snap.snapshotDate}</td>
                      <td className="text-right py-2 px-4">{snap.stalledApplicationsCount}</td>
                      <td className="text-right py-2 px-4">{parseFloat(snap.slaBreachRate).toFixed(1)}%</td>
                      <td className="text-right py-2 px-4">{snap.unreadInboundCount}</td>
                      <td className="text-right py-2 pl-4">{snap.readinessRegressionCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ThresholdEditor({
  label,
  threshold,
  hasStalledDays,
  onSave,
  isSaving,
}: {
  label: string;
  threshold: { warningValue: string; criticalValue: string; lookbackDays: number; stalledDays: number | null; isEnabled: boolean };
  hasStalledDays: boolean;
  onSave: (updates: Record<string, any>) => void;
  isSaving: boolean;
}) {
  const [warning, setWarning] = useState(threshold.warningValue);
  const [critical, setCritical] = useState(threshold.criticalValue);
  const [lookback, setLookback] = useState(String(threshold.lookbackDays));
  const [stalled, setStalled] = useState(String(threshold.stalledDays ?? ""));
  const [enabled, setEnabled] = useState(threshold.isEnabled);

  return (
    <div className="space-y-3 p-3 border rounded-md">
      <div className="flex items-center justify-between gap-2">
        <Label className="font-medium">{label}</Label>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Enabled</Label>
          <Switch checked={enabled} onCheckedChange={setEnabled} data-testid={`switch-threshold-enabled-${label}`} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Warning</Label>
          <Input
            type="number"
            value={warning}
            onChange={(e) => setWarning(e.target.value)}
            data-testid={`input-warning-${label}`}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Critical</Label>
          <Input
            type="number"
            value={critical}
            onChange={(e) => setCritical(e.target.value)}
            data-testid={`input-critical-${label}`}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Lookback (days)</Label>
          <Input
            type="number"
            value={lookback}
            onChange={(e) => setLookback(e.target.value)}
            data-testid={`input-lookback-${label}`}
          />
        </div>
        {hasStalledDays && (
          <div className="space-y-1">
            <Label className="text-xs">Stalled After (days)</Label>
            <Input
              type="number"
              value={stalled}
              onChange={(e) => setStalled(e.target.value)}
              data-testid={`input-stalled-days-${label}`}
            />
          </div>
        )}
      </div>
      <Button
        size="sm"
        onClick={() =>
          onSave({
            warningValue: parseFloat(warning),
            criticalValue: parseFloat(critical),
            lookbackDays: parseInt(lookback),
            ...(hasStalledDays && stalled ? { stalledDays: parseInt(stalled) } : {}),
            isEnabled: enabled,
          })
        }
        disabled={isSaving}
        data-testid={`button-save-threshold-${label}`}
      >
        Save
      </Button>
    </div>
  );
}
