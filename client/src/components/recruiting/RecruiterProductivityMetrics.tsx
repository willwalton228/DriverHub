import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart3,
  Users,
  Clock,
  TrendingUp,
  Loader2,
  RefreshCw,
  Calendar,
} from "lucide-react";

interface RecruiterMetric {
  owner_id: string;
  recruiter_name: string;
  recruiter_email: string;
  total_applications: number;
  hired_count: number;
  rejected_count: number;
  withdrawn_count: number;
  ready_count: number;
  active_count: number;
  avg_time_in_stage_minutes: number;
  avg_days_to_ready: number;
}

function formatTimeInStage(minutes: number): string {
  if (minutes > 1440) {
    return `${(minutes / 1440).toFixed(1)} days`;
  }
  return `${(minutes / 60).toFixed(1)} hours`;
}

function formatDaysToReady(days: number): string {
  return `${days.toFixed(1)} days`;
}

export function RecruiterProductivityMetrics() {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);

  const {
    data: metrics,
    isLoading,
    refetch,
  } = useQuery<RecruiterMetric[]>({
    queryKey: [
      "/api/recruiting/metrics/recruiter-productivity",
      { startDate, endDate },
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const url = `/api/recruiting/metrics/recruiter-productivity${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 403) {
        setAccessDenied(true);
        throw new Error("Access denied");
      }
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      setAccessDenied(false);
      return res.json();
    },
  });

  const handleRefresh = () => {
    refetch();
    toast({ title: "Refreshing metrics..." });
  };

  if (accessDenied) {
    return (
      <Card data-testid="access-denied-card">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Users className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2" data-testid="text-access-denied">
            Access Denied
          </h3>
          <p className="text-muted-foreground text-sm">
            You do not have permission to view recruiter productivity metrics.
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalAppsManaged =
    metrics?.reduce((sum, m) => sum + m.total_applications, 0) ?? 0;
  const totalHired =
    metrics?.reduce((sum, m) => sum + m.hired_count, 0) ?? 0;
  const avgDaysToReady =
    metrics && metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.avg_days_to_ready, 0) /
        metrics.length
      : 0;

  return (
    <div className="space-y-6" data-testid="recruiter-productivity-metrics">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            data-testid="input-start-date"
            className="w-40"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            data-testid="input-end-date"
            className="w-40"
          />
        </div>
        <Button onClick={handleRefresh} data-testid="button-refresh">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="kpi-total-apps">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Apps Managed
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="value-total-apps">
              {isLoading ? "—" : totalAppsManaged}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="kpi-total-hired">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hired</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="value-total-hired">
              {isLoading ? "—" : totalHired}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="kpi-avg-days-to-ready">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Avg Days to Ready
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div
              className="text-2xl font-bold"
              data-testid="value-avg-days-to-ready"
            >
              {isLoading ? "—" : formatDaysToReady(avgDaysToReady)}
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div
          className="flex items-center justify-center py-12"
          data-testid="loading-spinner"
        >
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !metrics || metrics.length === 0 ? (
        <Card data-testid="no-data-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-10 w-10 text-muted-foreground mb-3" />
            <p
              className="text-muted-foreground text-sm"
              data-testid="text-no-data"
            >
              No data available for the selected date range.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card data-testid="metrics-table-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Recruiter Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table
                className="w-full text-sm"
                data-testid="metrics-table"
              >
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium">
                      Recruiter
                    </th>
                    <th className="text-right py-3 px-2 font-medium">
                      Total Apps
                    </th>
                    <th className="text-right py-3 px-2 font-medium">
                      Active
                    </th>
                    <th className="text-right py-3 px-2 font-medium">
                      Hired
                    </th>
                    <th className="text-right py-3 px-2 font-medium">
                      Rejected
                    </th>
                    <th className="text-right py-3 px-2 font-medium">
                      Withdrawn
                    </th>
                    <th className="text-right py-3 px-2 font-medium">
                      Ready
                    </th>
                    <th className="text-right py-3 px-2 font-medium">
                      Avg Time-in-Stage
                    </th>
                    <th className="text-right py-3 px-2 font-medium">
                      Avg Days-to-Ready
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((m) => (
                    <tr
                      key={m.owner_id}
                      className="border-b last:border-b-0"
                      data-testid={`row-recruiter-${m.owner_id}`}
                    >
                      <td className="py-3 px-2">
                        <div className="flex flex-col">
                          <span
                            className="font-medium"
                            data-testid={`text-recruiter-name-${m.owner_id}`}
                          >
                            {m.recruiter_name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {m.recruiter_email}
                          </span>
                        </div>
                      </td>
                      <td
                        className="text-right py-3 px-2"
                        data-testid={`value-total-apps-${m.owner_id}`}
                      >
                        {m.total_applications}
                      </td>
                      <td
                        className="text-right py-3 px-2"
                        data-testid={`value-active-${m.owner_id}`}
                      >
                        <Badge variant="secondary">{m.active_count}</Badge>
                      </td>
                      <td
                        className="text-right py-3 px-2"
                        data-testid={`value-hired-${m.owner_id}`}
                      >
                        <Badge variant="default">{m.hired_count}</Badge>
                      </td>
                      <td
                        className="text-right py-3 px-2"
                        data-testid={`value-rejected-${m.owner_id}`}
                      >
                        {m.rejected_count}
                      </td>
                      <td
                        className="text-right py-3 px-2"
                        data-testid={`value-withdrawn-${m.owner_id}`}
                      >
                        {m.withdrawn_count}
                      </td>
                      <td
                        className="text-right py-3 px-2"
                        data-testid={`value-ready-${m.owner_id}`}
                      >
                        {m.ready_count}
                      </td>
                      <td
                        className="text-right py-3 px-2"
                        data-testid={`value-avg-time-stage-${m.owner_id}`}
                      >
                        {formatTimeInStage(m.avg_time_in_stage_minutes)}
                      </td>
                      <td
                        className="text-right py-3 px-2"
                        data-testid={`value-avg-days-ready-${m.owner_id}`}
                      >
                        {formatDaysToReady(m.avg_days_to_ready)}
                      </td>
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
