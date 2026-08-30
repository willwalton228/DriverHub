/**
 * Feature 3.2 — Driver Intelligence
 * Route: /reports/driver-intelligence
 *
 * Single-driver operational intelligence. Accepts ?driverId= URL param so
 * Driver Detail can link directly with the driver pre-selected.
 *
 * WIW is the sole authoritative source for Worked Hours. If WIW data is
 * unavailable the metric is shown as explicitly unavailable — not substituted
 * with another source.
 *
 * Terminology: Growing / Flat / Declining. No performance scoring, rankings,
 * or driver-to-driver comparison language.
 */
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, ExternalLink, AlertCircle, RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip as RTooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────
interface MoveAgg {
  total: number; completed: number; cancelled: number; exceptionCount: number;
  completionRate: number | null; avgMiles: number | null; avgDriveTime: number | null;
}
interface IntelData {
  driver: { id: string; name: string; wiwUserId: string | null };
  moves: MoveAgg;
  movesCompare: MoveAgg | null;
  movesTrend: { date: string; total: number; completed: number }[];
  driverReturns: { count: number; totalMiles: number; totalMinutes: number };
  scheduledHours: number | null;
  wiwWorkedHours: { status: "ok"; hours: number } | { status: "not_linked" } | { status: "no_data" };
  wiwHoursTrend: { date: string; actualHours: number }[];
  claims: { selectedPeriod: number; last12Months: number };
}

// ── Format helpers ────────────────────────────────────────────────────────────
const fmtN    = (v: unknown) => (Number(v) || 0).toLocaleString();
const fmtPct  = (v: unknown) => v == null ? "—" : `${Number(v).toFixed(1)}%`;
const fmtMi   = (v: unknown) => v == null ? "—" : `${Number(v).toFixed(1)} mi`;
const fmtMin  = (v: unknown) => {
  if (v == null) return "—";
  const m = Number(v);
  return m < 60 ? `${m.toFixed(0)}m` : `${(m / 60).toFixed(1)}h`;
};
const fmtHrs  = (v: number | null | undefined) =>
  v == null ? "—" : `${Number(v).toFixed(1)}h`;

function defaultRange() {
  const end   = new Date();
  const start = new Date(); start.setDate(end.getDate() - 90);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function priorPeriod(start: string, end: string) {
  const s = new Date(start), e = new Date(end);
  const days = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
  const ps = new Date(s); ps.setDate(ps.getDate() - days);
  const pe = new Date(s); pe.setDate(pe.getDate() - 1);
  return { start: ps.toISOString().slice(0, 10), end: pe.toISOString().slice(0, 10) };
}

// ── KPI Info definitions ──────────────────────────────────────────────────────
type InfoDef = { definition: string; calculation: string; source: string; howToUse: string };
const METRIC_INFO: Record<string, InfoDef> = {
  completedMoves: {
    definition: "Number of Moves with status 'completed' for this driver in the selected period.",
    calculation: "COUNT(*) FILTER (WHERE status = 'completed') on trips for this driver.",
    source: "DriverHub trips",
    howToUse: "Core workload signal. Compare across periods using the compare toggle.",
  },
  scheduledHours: {
    definition: "Total hours this driver was scheduled to work in the selected period.",
    calculation: "SUM(shift_assignments.scheduled_hours) joined to shifts within the date range.",
    source: "DriverHub Scheduling (shift_assignments)",
    howToUse: "Use alongside Worked Hours to assess schedule adherence.",
  },
  workedHours: {
    definition: "Total hours this driver actually worked in the selected period per WIW attendance data.",
    calculation: "SUM(wiw_attendance_rows.actual_hours) for the driver's WIW user ID. Only WIW data is used — no fallback source. If WIW data is unavailable, this metric is shown as unavailable.",
    source: "WIW attendance rows (wiw_attendance_rows)",
    howToUse: "Authoritative worked-hours figure. Use with Scheduled Hours to identify variance. Absence of WIW data means this driver's attendance is not tracked in WIW.",
  },
  variance: {
    definition: "Difference between Worked Hours and Scheduled Hours for the selected period.",
    calculation: "Worked Hours − Scheduled Hours. Positive = worked more than scheduled; negative = worked less.",
    source: "WIW (worked) + DriverHub Scheduling (scheduled)",
    howToUse: "A consistently negative variance may indicate coverage gaps. A consistently positive variance may indicate unplanned overtime.",
  },
  movesPerHour: {
    definition: "Completed Moves divided by WIW Worked Hours. Only shown when authoritative WIW data is available.",
    calculation: "Completed Moves ÷ WIW Worked Hours.",
    source: "DriverHub trips (completed) + WIW attendance rows (hours)",
    howToUse: "Provides operational context around Move volume relative to time worked. Not a performance score.",
  },
  completionRate: {
    definition: "Percentage of Moves assigned to this driver that were completed.",
    calculation: "Completed ÷ Total × 100.",
    source: "DriverHub trips",
    howToUse: "Track execution quality over time. Drill into Moves to review cancellations.",
  },
  cancellations: {
    definition: "Number of Moves with status 'cancelled' for this driver in the selected period.",
    calculation: "COUNT(*) FILTER (WHERE status = 'cancelled').",
    source: "DriverHub trips",
    howToUse: "Elevated cancellations may signal availability, routing, or driver issues.",
  },
  exceptionRate: {
    definition: "Percentage of Moves that failed an eligibility check.",
    calculation: "Exception Count ÷ Total Moves × 100. Exceptions: eligibility_status ≠ 'PASS' and eligibility_checked_at is set.",
    source: "DriverHub eligibility engine",
    howToUse: "Review flagged Moves to identify recurring eligibility issues.",
  },
  avgMiles: {
    definition: "Average distance per Move for this driver.",
    calculation: "AVG(distance) excluding zero-mile records.",
    source: "DriverHub trips.distance",
    howToUse: "Compare to team average to identify routing anomalies.",
  },
  avgDriveTime: {
    definition: "Average drive time per Move for this driver, in minutes.",
    calculation: "AVG(duration) excluding zero-duration records.",
    source: "DriverHub trips.duration",
    howToUse: "Compare against average miles to detect congestion or routing delays.",
  },
  drCount: {
    definition: "Number of DriverReturn records linked to this driver's Moves in the selected period.",
    calculation: "COUNT of driver_return_entries via linked_trip_id → trips.driver_id.",
    source: "driver_return_entries",
    howToUse: "DriverReturns are ancillary operational activity performed by the driver.",
  },
  drMiles: {
    definition: "Total estimated miles driven on DriverReturn trips in the selected period.",
    calculation: "SUM(driver_return_entries.miles_estimate) for this driver's linked DRs.",
    source: "driver_return_entries.miles_estimate",
    howToUse: "Add to Move miles for a complete view of driver mileage.",
  },
  drTime: {
    definition: "Total time spent on DriverReturn trips in the selected period.",
    calculation: "SUM(driver_return_entries.minutes) for this driver's linked DRs.",
    source: "driver_return_entries.minutes",
    howToUse: "Add to Move drive time for a complete view of driver time on task.",
  },
  claimsPeriod: {
    definition: "Number of claims (accidents/incidents) for this driver within the selected period.",
    calculation: "COUNT of accidents where driver_id matches and incident_date falls within the period.",
    source: "DriverHub accidents (Claims module)",
    howToUse: "Drill into the driver's Claims tab for full detail. Do not compare across drivers.",
  },
  claims12mo: {
    definition: "Number of claims for this driver in the rolling last 12 months, regardless of the selected period.",
    calculation: "COUNT of accidents where driver_id matches and incident_date ≥ 12 months ago.",
    source: "DriverHub accidents (Claims module)",
    howToUse: "Provides a longer-term risk context that is unaffected by the selected date range.",
  },
};

// ── InfoTip ───────────────────────────────────────────────────────────────────
function InfoTip({ id, source }: { id: string; source?: string }) {
  const info = METRIC_INFO[id];
  if (!info) return null;
  const s = source ?? info.source;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0" aria-label={`Info: ${id}`}>
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-left p-3 space-y-2">
          {(["definition", "calculation", "howToUse"] as const).map(k => (
            <div key={k}>
              <p className="text-xs font-semibold">{k === "howToUse" ? "How to Use" : k.charAt(0).toUpperCase() + k.slice(1)}</p>
              <p className="text-xs text-muted-foreground">{info[k]}</p>
            </div>
          ))}
          <div>
            <p className="text-xs font-semibold">Data Source</p>
            <p className="text-xs text-muted-foreground">{s}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Delta indicator ───────────────────────────────────────────────────────────
function Delta({ current, prior }: { current: number | null; prior: number | null }) {
  if (current == null || prior == null || prior === 0) return null;
  const pct = ((current - prior) / Math.abs(prior)) * 100;
  const up  = pct > 0;
  const flat = Math.abs(pct) < 1;
  if (flat) return <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Minus className="h-3 w-3" />{Math.abs(pct).toFixed(1)}%</span>;
  return (
    <span className={`text-xs flex items-center gap-0.5 ${up ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ── MetricCard ────────────────────────────────────────────────────────────────
function MetricCard({ title, value, sub, infoId, delta, isLoading, unavailable }: {
  title: string; value: string; sub?: string; infoId: string;
  delta?: React.ReactNode; isLoading?: boolean; unavailable?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-1 pt-3 px-4 flex flex-row items-start justify-between gap-1">
        <CardTitle className="text-xs font-medium text-muted-foreground leading-tight">{title}</CardTitle>
        <InfoTip id={infoId} />
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {isLoading
          ? <Skeleton className="h-7 w-20" />
          : unavailable
            ? (
              <div className="flex items-start gap-1.5">
                <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-snug">{unavailable}</p>
              </div>
            )
            : (
              <>
                <div className="text-2xl font-bold">{value}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
                  {delta}
                </div>
              </>
            )}
      </CardContent>
    </Card>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mt-6 mb-3">
      <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">{title}</h2>
      {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function DriverIntelligenceReport() {
  const dr = defaultRange();

  // Read URL params on mount
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const urlDriverId = params.get("driverId") ?? "";

  const [driverId,    setDriverId]    = useState(urlDriverId);
  const [startDate,   setStartDate]   = useState(params.get("startDate") ?? dr.start);
  const [endDate,     setEndDate]     = useState(params.get("endDate")   ?? dr.end);
  const [comparePrior, setComparePrior] = useState(false);

  const prior = priorPeriod(startDate, endDate);

  const qp = new URLSearchParams();
  if (driverId)  qp.set("driverId",          driverId);
  if (startDate) qp.set("startDate",         startDate);
  if (endDate)   qp.set("endDate",           endDate);
  if (comparePrior) {
    qp.set("compareStartDate", prior.start);
    qp.set("compareEndDate",   prior.end);
  }

  // Sync URL
  useEffect(() => {
    const p = new URLSearchParams();
    if (driverId)  p.set("driverId",  driverId);
    if (startDate) p.set("startDate", startDate);
    if (endDate)   p.set("endDate",   endDate);
    window.history.replaceState(null, "", p.toString() ? `?${p.toString()}` : window.location.pathname);
  }, [driverId, startDate, endDate]);

  const { data, isLoading, error, refetch } = useQuery<IntelData>({
    queryKey: ["/api/ops-reporting/drivers/intelligence", driverId, startDate, endDate, comparePrior],
    queryFn:  () => apiRequest("GET", `/api/ops-reporting/drivers/intelligence?${qp.toString()}`).then(r => r.json()),
    enabled:  !!driverId,
    staleTime: 60_000,
  });

  const wiwOk       = data?.wiwWorkedHours.status === "ok";
  const workedHours = wiwOk ? (data!.wiwWorkedHours as any).hours as number : null;
  const schedHours  = data?.scheduledHours ?? null;
  const variance    = wiwOk && schedHours != null ? (workedHours! - schedHours) : null;
  const mph         = wiwOk && (data?.moves.completed ?? 0) > 0 && workedHours! > 0
    ? data!.moves.completed / workedHours!
    : null;

  const cmp = data?.movesCompare;
  const showDelta = comparePrior && !!cmp;

  function wiwUnavailableMsg(): string | undefined {
    if (!data) return undefined;
    if (data.wiwWorkedHours.status === "not_linked") return "Driver not linked to WIW";
    if (data.wiwWorkedHours.status === "no_data")    return "No WIW attendance data for this period";
    return undefined;
  }

  function moveDrillLink(extra: Record<string, string> = {}) {
    const p = new URLSearchParams({ driverId, startDate, endDate, ...extra });
    return `/trips?${p.toString()}`;
  }

  const wiwMsg = wiwUnavailableMsg();

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Driver Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Operational context for a single driver — workload, execution, DriverReturn activity, and risk signals.
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()} disabled={!driverId}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Driver + Date Controls */}
      <Card>
        <CardContent className="pt-4 pb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Driver ID</Label>
            <Input value={driverId} onChange={e => setDriverId(e.target.value.trim())} placeholder="Paste a Driver ID" className="h-8 text-sm font-mono" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Start Date</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">End Date</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 cursor-pointer text-sm pb-0.5">
              <input type="checkbox" checked={comparePrior} onChange={e => setComparePrior(e.target.checked)}
                className="rounded border-border" />
              Compare to prior period
            </label>
          </div>
        </CardContent>
        {comparePrior && (
          <div className="px-4 pb-3">
            <p className="text-xs text-muted-foreground">
              Comparing <strong>{startDate}</strong>–<strong>{endDate}</strong> against prior period <strong>{prior.start}</strong>–<strong>{prior.end}</strong>
            </p>
          </div>
        )}
      </Card>

      {/* No driver selected */}
      {!driverId && (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <p className="text-sm">Enter a Driver ID above to load intelligence data.</p>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && driverId && (
        <Card className="border-destructive">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <p className="text-sm text-destructive">Failed to load data. Check the Driver ID and try again.</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {/* Data — only shown when driverId is set */}
      {driverId && !error && (
        <>
          {/* Driver name */}
          {(isLoading || data) && (
            <div className="flex items-center gap-2">
              {isLoading
                ? <Skeleton className="h-5 w-48" />
                : <p className="text-sm font-medium">{data?.driver.name || "Driver"}</p>}
              {data?.driver.wiwUserId
                ? <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">WIW linked</Badge>
                : <Badge variant="outline" className="text-xs text-muted-foreground">No WIW link</Badge>}
            </div>
          )}

          {/* ── WORKLOAD ─────────────────────────────────────────────────── */}
          <SectionHeader title="Workload" description="Move volume and hours for the selected period." />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <MetricCard title="Completed Moves" infoId="completedMoves" isLoading={isLoading}
              value={fmtN(data?.moves.completed)}
              delta={showDelta ? <Delta current={data!.moves.completed} prior={cmp!.completed} /> : undefined}
            />
            <MetricCard title="Scheduled Hours" infoId="scheduledHours" isLoading={isLoading}
              value={fmtHrs(data?.scheduledHours)}
              unavailable={data && data.scheduledHours == null ? "No scheduling data for this period" : undefined}
            />
            <MetricCard title="Worked Hours" infoId="workedHours" isLoading={isLoading}
              value={fmtHrs(workedHours)}
              unavailable={wiwMsg}
            />
            <MetricCard title="Sched vs Worked" infoId="variance" isLoading={isLoading}
              value={variance != null ? `${variance >= 0 ? "+" : ""}${variance.toFixed(1)}h` : "—"}
              sub={variance == null ? undefined : variance > 0 ? "Worked more than scheduled" : variance < 0 ? "Worked less than scheduled" : "On schedule"}
              unavailable={wiwMsg ?? (schedHours == null ? "No scheduling data" : undefined)}
            />
            <MetricCard title="Moves / Worked Hour" infoId="movesPerHour" isLoading={isLoading}
              value={mph != null ? mph.toFixed(2) : "—"}
              unavailable={wiwMsg}
            />
          </div>

          {/* ── EXECUTION ────────────────────────────────────────────────── */}
          <SectionHeader title="Execution" description="Move completion quality for the selected period." />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <MetricCard title="Completion Rate" infoId="completionRate" isLoading={isLoading}
              value={fmtPct(data?.moves.completionRate)}
              sub={data ? `${fmtN(data.moves.completed)} of ${fmtN(data.moves.total)}` : undefined}
              delta={showDelta ? <Delta current={data!.moves.completionRate} prior={cmp!.completionRate} /> : undefined}
            />
            <MetricCard title="Cancellations" infoId="cancellations" isLoading={isLoading}
              value={fmtN(data?.moves.cancelled)}
              delta={showDelta ? <Delta current={data!.moves.cancelled} prior={cmp!.cancelled} /> : undefined}
            />
            <MetricCard title="Exception Rate" infoId="exceptionRate" isLoading={isLoading}
              value={data ? fmtPct(data.moves.total > 0 ? (data.moves.exceptionCount / data.moves.total) * 100 : null) : "—"}
              sub={data ? `${fmtN(data.moves.exceptionCount)} exceptions` : undefined}
            />
            <MetricCard title="Avg Miles / Move" infoId="avgMiles" isLoading={isLoading}
              value={fmtMi(data?.moves.avgMiles)}
              delta={showDelta ? <Delta current={data!.moves.avgMiles} prior={cmp!.avgMiles} /> : undefined}
            />
            <MetricCard title="Avg Drive Time / Move" infoId="avgDriveTime" isLoading={isLoading}
              value={fmtMin(data?.moves.avgDriveTime)}
              delta={showDelta ? <Delta current={data!.moves.avgDriveTime} prior={cmp!.avgDriveTime} /> : undefined}
            />
          </div>
          {data && (
            <div className="flex gap-2 flex-wrap">
              <a href={moveDrillLink({ status: "completed" })} className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">
                View Completed Moves <ExternalLink className="h-3 w-3" />
              </a>
              <span className="text-muted-foreground">·</span>
              <a href={moveDrillLink({ exceptions: "true" })} className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">
                View Exception Moves <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {/* ── DRIVERRETURN ─────────────────────────────────────────────── */}
          <SectionHeader title="DriverReturn" description="Ancillary DR activity linked to this driver's Moves." />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <MetricCard title="DriverReturn Count" infoId="drCount" isLoading={isLoading}
              value={fmtN(data?.driverReturns.count)}
            />
            <MetricCard title="DR Miles" infoId="drMiles" isLoading={isLoading}
              value={data ? `${Number(data.driverReturns.totalMiles).toFixed(1)} mi` : "—"}
            />
            <MetricCard title="DR Time" infoId="drTime" isLoading={isLoading}
              value={fmtMin(data?.driverReturns.totalMinutes)}
            />
          </div>

          {/* ── RISK ─────────────────────────────────────────────────────── */}
          <SectionHeader title="Risk" description="Claims context for this driver. Drill into the driver's Claims tab for full detail." />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <MetricCard title="Claims — Selected Period" infoId="claimsPeriod" isLoading={isLoading}
              value={fmtN(data?.claims.selectedPeriod)}
            />
            <MetricCard title="Claims — Last 12 Months" infoId="claims12mo" isLoading={isLoading}
              value={fmtN(data?.claims.last12Months)}
            />
            {data && (
              <Card>
                <CardContent className="flex items-center justify-center h-full p-4">
                  <a href={`/drivers/${driverId}`} className="text-sm text-primary hover:underline inline-flex items-center gap-1.5">
                    View Driver Claims Tab <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── TRENDS ───────────────────────────────────────────────────── */}
          {(isLoading || (data && data.movesTrend.length > 0)) && (
            <>
              <Separator className="my-2" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Move Volume Trend */}
                <Card>
                  <CardHeader className="pb-2 pt-3 px-4">
                    <CardTitle className="text-sm font-medium">Move Volume Trend</CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 pb-3">
                    {isLoading
                      ? <Skeleton className="h-40 w-full" />
                      : data!.movesTrend.length < 2
                        ? <p className="text-sm text-muted-foreground text-center py-10">Insufficient data for trend visualization.</p>
                        : (
                          <ResponsiveContainer width="100%" height={180}>
                            <LineChart data={data!.movesTrend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} />
                              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                              <RTooltip contentStyle={{ fontSize: 12 }} />
                              <Line type="monotone" dataKey="completed" name="Completed" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
                              <Line type="monotone" dataKey="total" name="Total" stroke="hsl(var(--muted-foreground))" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                  </CardContent>
                </Card>

                {/* Scheduled vs Worked Hours Trend — only when WIW data present */}
                <Card>
                  <CardHeader className="pb-2 pt-3 px-4">
                    <CardTitle className="text-sm font-medium">Scheduled vs Worked Hours</CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 pb-3">
                    {isLoading
                      ? <Skeleton className="h-40 w-full" />
                      : !wiwOk
                        ? (
                          <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <p className="text-sm">{wiwMsg ?? "WIW data unavailable"}</p>
                          </div>
                        )
                        : data!.wiwHoursTrend.length < 2
                          ? <p className="text-sm text-muted-foreground text-center py-10">Insufficient WIW data for trend visualization.</p>
                          : (
                            <ResponsiveContainer width="100%" height={180}>
                              <LineChart data={data!.wiwHoursTrend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} />
                                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                <RTooltip contentStyle={{ fontSize: 12 }} />
                                <Line type="monotone" dataKey="actualHours" name="Worked Hours (WIW)" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
                              </LineChart>
                            </ResponsiveContainer>
                          )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
