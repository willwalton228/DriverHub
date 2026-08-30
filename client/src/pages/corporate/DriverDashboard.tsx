import { useMemo } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Gauge,
  History,
  Info,
  Route,
  ShieldAlert,
  Timer,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import type { DriverWithUser } from "@shared/schema";

type QueryResult<T> = {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
};

type DriverMoveStats = {
  movesTotal?: number;
  movesCompleted?: number;
  movesCancelled?: number;
  exceptionCount?: number;
  milesTotal?: number;
  driveTimeMinutes?: number;
  avgDriveTimeMinutes?: number | null;
  avgMiles?: number | null;
};

type WeeklySummary = {
  scheduledHoursThisWeek?: number;
  workedHoursThisWeek?: number;
  approvedHours?: number;
  attendanceIssues30d?: number;
};

type TrendRow = { date: string; moves?: number; hours?: number };

const fetchDashboardData = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
};

function useDashboardQuery<T>(key: string[], url: string, enabled: boolean): QueryResult<T> {
  return useQuery<T>({
    queryKey: key,
    queryFn: () => fetchDashboardData<T>(url),
    enabled,
    retry: 1,
  });
}

function getWeekRange() {
  const today = new Date();
  const day = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - day);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

function dateLabel(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function numberOrUndefined(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatHours(value: number | undefined) {
  return value === undefined ? "No data" : `${value.toFixed(1)}h`;
}

function formatMinutes(value: number | undefined) {
  if (value === undefined) return "No data";
  return value >= 60 ? `${(value / 60).toFixed(1)}h` : `${Math.round(value)}m`;
}

function sourceClass(source: string) {
  if (source === "WIW") return "text-blue-600 dark:text-blue-400";
  if (source === "Draiver") return "text-orange-600 dark:text-orange-400";
  return "text-violet-600 dark:text-violet-400";
}

function DataNotice({ label, query }: { label: string; query: QueryResult<unknown> }) {
  if (!query.isError) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
      <span className="flex min-w-0 items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span><strong>{label}</strong> data could not be loaded. Other dashboard data is still available.</span>
      </span>
      <Button variant="outline" size="sm" className="h-7 shrink-0" onClick={() => query.refetch()}>
        Retry
      </Button>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  source,
  icon: Icon,
  tone = "default",
  info,
}: {
  label: string;
  value: string;
  detail: string;
  source: "WIW" | "Draiver" | "DriverHub";
  icon: typeof Activity;
  tone?: "default" | "good" | "warn" | "bad";
  info: string;
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "bad"
          ? "text-red-600 dark:text-red-400"
          : "text-foreground";
  return (
    <Card className="min-w-0">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
            </span>
            <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 text-xs">{info}</TooltipContent>
          </Tooltip>
        </div>
        <p className={`mt-3 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="truncate text-[11px] text-muted-foreground">{detail}</p>
          <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wide ${sourceClass(source)}`}>{source}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Activity;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function ChartEmpty({ label }: { label: string }) {
  return <div className="flex h-[210px] items-center justify-center text-sm text-muted-foreground">{label}</div>;
}

export default function DriverDashboard() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const range = useMemo(getWeekRange, []);
  const enabled = isAuthenticated && !!id;

  const driver = useDashboardQuery<DriverWithUser>(["/api/corporate/drivers", id || ""], `/api/corporate/drivers/${id}`, enabled);
  const weeklySummary = useDashboardQuery<WeeklySummary>(
    ["/api/scheduling/wheniwork/driver-summary", id || ""],
    `/api/scheduling/wheniwork/driver-summary?driverId=${id}`,
    enabled,
  );
  const performance = useDashboardQuery<{ thisWeek?: DriverMoveStats; allTime?: DriverMoveStats }>(
    ["/api/draiver-import/driver-performance", id || ""],
    `/api/draiver-import/driver-performance?driverId=${id}`,
    enabled,
  );
  const movesSinceIncident = useDashboardQuery<{
    movesSince?: number;
    totalMovesAllTime?: number;
    hasIncidents?: boolean;
    lastIncidentDate?: string | null;
  }>(
    ["/api/draiver-import/moves-since-incident", id || ""],
    `/api/draiver-import/moves-since-incident?driverId=${id}`,
    enabled,
  );
  const moveTrend = useDashboardQuery<{ rows?: TrendRow[] }>(
    ["/api/draiver-import/move-trend", id || ""],
    `/api/draiver-import/move-trend?driverId=${id}&days=30`,
    enabled,
  );
  const hoursTrend = useDashboardQuery<{ rows?: TrendRow[] }>(
    ["/api/draiver-import/wiw-hours-trend", id || ""],
    `/api/draiver-import/wiw-hours-trend?driverId=${id}&days=14`,
    enabled,
  );
  const lossScore = useDashboardQuery<{
    score?: number;
    tier?: string;
    immediateReview?: boolean;
    inputs?: { claimsHistory12Months?: number; claimsLast90Days?: number };
  }>(["/api/drivers", id || "", "loss-score"], `/api/drivers/${id}/loss-score`, enabled);
  const scheduleStatus = useDashboardQuery<{
    status?: string;
    shiftStart?: string | null;
    shiftEnd?: string | null;
    minutesLate?: number | null;
  }>(
    ["/api/scheduling/wheniwork/driver-shift-status", id || ""],
    `/api/scheduling/wheniwork/driver-shift-status?driverId=${id}`,
    enabled,
  );
  const claims = useDashboardQuery<unknown[]>(
    ["/api/corporate/drivers", id || "", "accidents"],
    `/api/corporate/drivers/${id}/accidents`,
    enabled,
  );
  const timeSummary = useDashboardQuery<{ totalHours?: number; openExceptionCount?: number }>(
    ["/api/drivers", id || "", "time-summary"],
    `/api/drivers/${id}/time-summary`,
    enabled,
  );

  if (authLoading || driver.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-8 w-1/3" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div></div>;
  }

  if (!driver.data || driver.isError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="space-y-3 p-6 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-destructive" />
            <h1 className="font-semibold">Driver dashboard unavailable</h1>
            <p className="text-sm text-muted-foreground">The driver record could not be loaded.</p>
            <Button variant="outline" onClick={() => setLocation(`/drivers/${id}`)}><ArrowLeft className="mr-2 h-4 w-4" />Back to Driver</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentDriver = driver.data as any;
  const name = currentDriver.user?.firstName || currentDriver.user?.lastName
    ? `${currentDriver.user?.firstName ?? ""} ${currentDriver.user?.lastName ?? ""}`.trim()
    : currentDriver.user?.email ?? "Driver";
  const weeklyWorked = numberOrUndefined(weeklySummary.data?.workedHoursThisWeek);
  const weeklyScheduled = numberOrUndefined(weeklySummary.data?.scheduledHoursThisWeek);
  const weeklyStats = performance.data?.thisWeek;
  const allTimeStats = performance.data?.allTime;
  const completed = numberOrUndefined(weeklyStats?.movesCompleted);
  const assigned = numberOrUndefined(weeklyStats?.movesTotal);
  const driveMinutes = numberOrUndefined(weeklyStats?.driveTimeMinutes);
  const productivity = weeklyWorked !== undefined && driveMinutes !== undefined && weeklyWorked > 0
    ? Math.min(100, (driveMinutes / (weeklyWorked * 60)) * 100)
    : undefined;
  const movesPerHour = weeklyWorked !== undefined && completed !== undefined && weeklyWorked > 0 ? completed / weeklyWorked : undefined;
  const idleHours = weeklyWorked !== undefined && driveMinutes !== undefined ? Math.max(0, weeklyWorked - driveMinutes / 60) : undefined;
  const utilization = assigned !== undefined && completed !== undefined && assigned > 0 ? (completed / assigned) * 100 : undefined;
  const exceptions = numberOrUndefined(weeklyStats?.exceptionCount);
  const claimsCount = Array.isArray(claims.data) ? claims.data.length : undefined;
  const claims12mo = numberOrUndefined(lossScore.data?.inputs?.claimsHistory12Months) ?? claimsCount;
  const trendMoves = (moveTrend.data?.rows ?? []).map((row) => ({ date: dateLabel(row.date), moves: numberOrUndefined(row.moves) ?? 0 }));
  const trendHours = (hoursTrend.data?.rows ?? []).map((row) => ({ date: dateLabel(row.date), hours: numberOrUndefined(row.hours) ?? 0 }));
  const riskScore = numberOrUndefined(lossScore.data?.score);
  const riskTone = lossScore.data?.tier === "Top Performer" || lossScore.data?.tier === "On Track" ? "good" : lossScore.data?.tier === "Watch List" ? "warn" : "bad";
  const statusLabel = scheduleStatus.data?.status?.replaceAll("_", " ") || "No shift status";
  const statusTone = scheduleStatus.data?.status === "ON_SHIFT" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : scheduleStatus.data?.status === "NO_SHOW" || scheduleStatus.data?.status === "LATE" ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300" : "bg-muted text-muted-foreground";

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-[1600px] space-y-6 pb-8" data-testid="driver-dashboard">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setLocation(`/drivers/${id}`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />Back to Driver Detail
          </Button>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5"><Gauge className="h-3.5 w-3.5" />Operational Dashboard</Badge>
            <Link href={`/drivers/${id}?tab=history`}><Button variant="outline" size="sm"><History className="mr-2 h-3.5 w-3.5" />Status history</Button></Link>
          </div>
        </div>

        <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.08] via-background to-background">
          <CardContent className="flex flex-wrap items-center justify-between gap-5 p-5 sm:p-6">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-lg font-semibold">
                {currentDriver.profilePhotoUrl || currentDriver.user?.profileImageUrl
                  ? <img src={currentDriver.profilePhotoUrl || currentDriver.user?.profileImageUrl} alt="" className="h-full w-full object-cover" />
                  : name.split(" ").map((part: string) => part[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{name}</h1>
                  <Badge variant={currentDriver.status?.toLowerCase() === "active" ? "default" : "secondary"}>{currentDriver.status || "Unknown"}</Badge>
                  {lossScore.data?.tier && <Badge variant="outline">{lossScore.data.tier}</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {currentDriver.driverNumber ? `#${currentDriver.driverNumber} · ` : ""}
                  {currentDriver.driverType || "Driver"}{currentDriver.driverClassification ? ` · ${currentDriver.driverClassification}` : ""}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-medium ${statusTone}`}><span className="h-2 w-2 rounded-full bg-current" />{statusLabel}</span>
              <Link href={`/drivers/${id}`}><Button size="sm">Open Full Record</Button></Link>
            </div>
          </CardContent>
        </Card>

        <DataNotice label="Weekly hours" query={weeklySummary} />
        <DataNotice label="Move performance" query={performance} />
        <DataNotice label="Risk score" query={lossScore} />
        <DataNotice label="Trend" query={moveTrend.isError ? moveTrend : hoursTrend} />

        <section className="space-y-3">
          <SectionHeading icon={Activity} title="Performance at a glance" description="Current operational signals across DriverHub, WIW, and Draiver." />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Productivity" value={productivity === undefined ? "No data" : `${productivity.toFixed(0)}%`} detail={productivity === undefined ? "Needs WIW + Draiver" : productivity >= 85 ? "On target · 85% target" : "Below 85% target"} source="Draiver" icon={Gauge} tone={productivity === undefined ? "default" : productivity >= 85 ? "good" : productivity >= 65 ? "warn" : "bad"} info="Active Draiver drive time divided by WIW worked hours this week." />
            <MetricCard label="Moves / hour" value={movesPerHour === undefined ? "No data" : movesPerHour.toFixed(2)} detail={movesPerHour === undefined ? "Needs moves + hours" : "Completed moves per clocked hour"} source="Draiver" icon={Route} tone={movesPerHour === undefined ? "default" : movesPerHour >= 2 ? "good" : movesPerHour >= 1 ? "warn" : "bad"} info="Completed moves divided by WIW worked hours for the current week." />
            <MetricCard label="Idle time" value={formatHours(idleHours)} detail={idleHours === undefined ? "Needs WIW + Draiver" : "Estimated non-drive time"} source="Draiver" icon={Timer} tone={idleHours === undefined ? "default" : idleHours < 2 ? "good" : idleHours < 4 ? "warn" : "bad"} info="WIW worked hours minus Draiver drive time. This is an estimate, not a separate time category." />
            <MetricCard label="Driver risk score" value={riskScore === undefined ? "No data" : String(riskScore)} detail={lossScore.data?.tier || "Risk tier unavailable"} source="DriverHub" icon={ShieldAlert} tone={riskScore === undefined ? "default" : riskTone} info="DriverHub risk score from the claims, compliance, and activity scoring model. Higher is safer." />
            <MetricCard label="Weekly hours" value={formatHours(weeklyWorked)} detail={weeklyWorked === undefined ? "WIW data unavailable" : "Worked this Monday–Sunday week"} source="WIW" icon={Clock3} tone={weeklyWorked === undefined ? "default" : weeklyWorked > 35 ? "warn" : "good"} info="Worked hours from When I Work for the current Monday–Sunday week." />
            <MetricCard label="Scheduled vs worked" value={weeklyWorked === undefined || weeklyScheduled === undefined ? "No data" : `${weeklyWorked.toFixed(1)} / ${weeklyScheduled.toFixed(1)}h`} detail="Worked / scheduled" source="WIW" icon={CalendarClock} tone={weeklyScheduled && weeklyWorked !== undefined && weeklyWorked / weeklyScheduled >= .8 ? "good" : "warn"} info="When I Work scheduled hours compared with actual worked hours for this week." />
            <MetricCard label="Utilization rate" value={utilization === undefined ? "No data" : `${utilization.toFixed(0)}%`} detail={assigned === undefined ? "No assigned moves" : `${completed ?? 0} of ${assigned} assigned completed`} source="Draiver" icon={CheckCircle2} tone={utilization === undefined ? "default" : utilization >= 90 ? "good" : utilization >= 75 ? "warn" : "bad"} info="Completed moves divided by assigned moves for the current week." />
            <MetricCard label="Claims · 12 months" value={claims12mo === undefined ? "No data" : String(claims12mo)} detail={claims12mo === undefined ? "Claims data unavailable" : claims12mo === 0 ? "No claims in window" : "Review recommended"} source="DriverHub" icon={ShieldAlert} tone={claims12mo === undefined ? "default" : claims12mo === 0 ? "good" : claims12mo > 3 ? "bad" : "warn"} info="DriverHub claim count in the last twelve months." />
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeading icon={Route} title="Move performance" description="Weekly workload, outcomes, and all-time operating context." action={<Link href={`/drivers/${id}?tab=trips`}><Button variant="outline" size="sm">View all moves</Button></Link>} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Moves this week" value={assigned === undefined ? "No data" : String(assigned)} detail="Assigned in current week" source="Draiver" icon={Route} info="Total Draiver moves assigned to the driver in the current week." />
            <MetricCard label="Move outcomes" value={completed === undefined ? "No data" : `${completed} done`} detail={assigned === undefined ? "Outcome data unavailable" : `${weeklyStats?.movesCancelled ?? 0} cancelled · ${exceptions ?? 0} exceptions`} source="Draiver" icon={CheckCircle2} tone={exceptions === undefined ? "default" : exceptions === 0 ? "good" : exceptions <= 2 ? "warn" : "bad"} info="Completed, cancelled, and exception counts for this week's moves." />
            <MetricCard label="Moves since incident" value={movesSinceIncident.data?.movesSince === undefined && movesSinceIncident.data?.totalMovesAllTime === undefined ? "No data" : String(movesSinceIncident.data?.hasIncidents ? movesSinceIncident.data.movesSince : movesSinceIncident.data?.totalMovesAllTime)} detail={movesSinceIncident.data?.lastIncidentDate ? `Last incident ${dateLabel(movesSinceIncident.data.lastIncidentDate)}` : "No incident on record"} source="Draiver" icon={TrendingUp} tone="good" info="Completed moves since the most recent incident, or lifetime completed moves when no incident exists." />
            <MetricCard label="Miles / drive time" value={formatMinutes(numberOrUndefined(allTimeStats?.driveTimeMinutes))} detail={allTimeStats?.milesTotal === undefined ? "All-time Draiver data unavailable" : `${allTimeStats.milesTotal.toLocaleString()} total miles`} source="Draiver" icon={Activity} info="All-time Draiver drive time and miles for this driver." />
            <MetricCard label="Avg drive time" value={formatMinutes(numberOrUndefined(allTimeStats?.avgDriveTimeMinutes))} detail="Per completed move · all time" source="Draiver" icon={Timer} info="Average drive time per completed move across recorded Draiver history." />
            <MetricCard label="Avg miles / move" value={allTimeStats?.avgMiles === undefined || allTimeStats?.avgMiles === null ? "No data" : `${allTimeStats.avgMiles.toFixed(1)} mi`} detail="Per completed move · all time" source="Draiver" icon={Route} info="Average miles driven per completed move across recorded Draiver history." />
            <MetricCard label="Exceptions" value={exceptions === undefined ? "No data" : String(exceptions)} detail={exceptions === 0 ? "Clean this week" : "Review recommended"} source="Draiver" icon={AlertTriangle} tone={exceptions === undefined ? "default" : exceptions === 0 ? "good" : exceptions <= 2 ? "warn" : "bad"} info="Draiver exception count for this week's moves." />
            <MetricCard label="Timekeeping exceptions" value={timeSummary.data?.openExceptionCount === undefined ? "No data" : String(timeSummary.data.openExceptionCount)} detail="Open W-2 timekeeping exceptions" source="DriverHub" icon={Clock3} tone={timeSummary.data?.openExceptionCount === 0 ? "good" : "warn"} info="Open timekeeping exceptions associated with this driver." />
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeading icon={TrendingUp} title="Trends" description="Recent daily movement and hours, with no synthetic values when source data is missing." />
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Daily moves · last 30 days</CardTitle>
                {trendMoves.length > 1 && <span className="text-[11px] text-muted-foreground">{trendMoves.reduce((sum, row) => sum + row.moves, 0)} total</span>}
              </CardHeader>
              <CardContent className="h-[235px]">
                {moveTrend.isError || trendMoves.length === 0 ? <ChartEmpty label={moveTrend.isError ? "Move trend unavailable" : "No data available for selected timeframe"} /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendMoves} margin={{ top: 10, right: 12, left: -18, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <RechartsTooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Line type="monotone" dataKey="moves" stroke="hsl(var(--chart-2))" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Daily hours · last 14 days</CardTitle>
                {trendHours.length > 1 && <span className="text-[11px] text-muted-foreground">{trendHours.reduce((sum, row) => sum + row.hours, 0).toFixed(1)}h total</span>}
              </CardHeader>
              <CardContent className="h-[235px]">
                {hoursTrend.isError || trendHours.length === 0 ? <ChartEmpty label={hoursTrend.isError ? "Hours trend unavailable" : "No data available for selected timeframe"} /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendHours} margin={{ top: 10, right: 12, left: -18, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <RechartsTooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                        {trendHours.map((row) => <Cell key={row.date} fill={row.hours > 7 ? "#ef4444" : row.hours >= 6 ? "#eab308" : "hsl(var(--primary))"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeading icon={CalendarDays} title="Scheduling & attendance" description={`Current week · ${dateLabel(range.start)} – ${dateLabel(range.end)}`} action={<Link href={`/drivers/${id}?tab=scheduling`}><Button variant="outline" size="sm"><CalendarClock className="mr-2 h-3.5 w-3.5" />Open scheduling</Button></Link>} />
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardContent className="grid gap-5 p-5 sm:grid-cols-3">
                <div><p className="text-xs text-muted-foreground">Scheduled hours</p><p className="mt-1 text-2xl font-semibold">{formatHours(weeklyScheduled)}</p><p className="mt-1 text-[11px] text-muted-foreground">From When I Work shifts</p></div>
                <div><p className="text-xs text-muted-foreground">Worked hours</p><p className="mt-1 text-2xl font-semibold">{formatHours(weeklyWorked)}</p><p className="mt-1 text-[11px] text-muted-foreground">From When I Work time entries</p></div>
                <div><p className="text-xs text-muted-foreground">Attendance issues</p><p className={`mt-1 text-2xl font-semibold ${weeklySummary.data?.attendanceIssues30d ? "text-amber-600 dark:text-amber-400" : ""}`}>{weeklySummary.data?.attendanceIssues30d === undefined ? "No data" : weeklySummary.data.attendanceIssues30d}</p><p className="mt-1 text-[11px] text-muted-foreground">Last 30 days</p></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Operational readout</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Shift status</span><Badge className={statusTone}>{statusLabel}</Badge></div>
                {scheduleStatus.data?.minutesLate !== null && scheduleStatus.data?.minutesLate !== undefined && <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Minutes late</span><span className="font-medium">{scheduleStatus.data.minutesLate}m</span></div>}
                <Separator />
                <Link href={`/drivers/${id}?tab=notes`} className="flex items-center gap-2 text-primary hover:underline"><Users className="h-4 w-4" />Review notes & communications</Link>
                <Link href={`/drivers/${id}?tab=claims`} className="flex items-center gap-2 text-primary hover:underline"><ShieldAlert className="h-4 w-4" />Review claims</Link>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </TooltipProvider>
  );
}