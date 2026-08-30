import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Clock,
  CalendarDays,
  AlertTriangle,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Construction,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalyticsKpi {
  totalDrivers: number;
  workedHours: number;
  scheduledHours: number;
  employeeOtHours: number;
  otPct: number;
  otDriverCount: number;
  employeeDriverCount: number;
}

interface HoursByDay {
  day: string;
  scheduledHours: number;
  workedHours: number;
  driverCount: number;
}

interface DriverUtilization {
  name: string;
  driverType: string;
  workedHours: number;
  otHours: number;
  status: "OT" | "Normal";
}

interface OtConcentration {
  name: string;
  otHours: number;
  totalHours: number;
  hoursPct: number;
}

interface AnalyticsData {
  weekStart: string;
  weekEnd: string;
  kpi: AnalyticsKpi;
  hoursByDay: HoursByDay[];
  driverUtilization: DriverUtilization[];
  otConcentration: OtConcentration[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtH(h: number) {
  return h.toFixed(1) + "h";
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function priorWeekStart(): string {
  const now = new Date();
  const dow = now.getDay();
  const daysToMon = dow === 0 ? 6 : dow - 1;
  const thisMon = new Date(now);
  thisMon.setDate(now.getDate() - daysToMon);
  thisMon.setHours(0, 0, 0, 0);
  const priorMon = new Date(thisMon);
  priorMon.setDate(thisMon.getDate() - 7);
  return priorMon.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isCurrentOrFuture(weekStart: string): boolean {
  return weekStart >= priorWeekStart();
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  warn,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <Card className={warn ? "border-amber-400/60" : undefined}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className="text-2xl font-bold" data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}>
              {value}
            </p>
            {sub && (
              <p className={`text-xs ${warn ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                {sub}
              </p>
            )}
          </div>
          <div
            className={`p-2 rounded-md shrink-0 ${
              warn
                ? "bg-amber-100 dark:bg-amber-900/30"
                : "bg-muted"
            }`}
          >
            <Icon
              className={`h-4 w-4 ${warn ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Placeholder Section ───────────────────────────────────────────────────────

function PlaceholderSection({
  title,
  items,
  icon: Icon,
}: {
  title: string;
  items: string[];
  icon: React.ElementType;
}) {
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Construction className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          <Badge variant="outline" className="text-xs text-muted-foreground ml-auto">
            Coming Soon
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground pt-1">
          Pending data integration — structure prepared for future activation.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {items.map((label) => (
            <div key={label} className="rounded-md bg-muted/50 px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                {label}
              </p>
              <p className="text-sm font-semibold text-muted-foreground/50 mt-0.5">—</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AccountAnalyticsTab({ accountId }: { accountId: string }) {
  const [weekStart, setWeekStart] = useState<string>(priorWeekStart);
  const [driverType, setDriverType] = useState<"all" | "employee" | "ic">("all");

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);

  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/customers", accountId, "analytics/weekly", weekStart, driverType],
    queryFn: async () => {
      const params = new URLSearchParams({ weekStart, driverType });
      const res = await fetch(`/api/customers/${accountId}/analytics/weekly?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!accountId,
  });

  // Navigation
  const goBack = () => setWeekStart((ws) => addDays(ws, -7));
  const goForward = () => {
    if (!isCurrentOrFuture(weekStart)) setWeekStart((ws) => addDays(ws, 7));
  };
  const atPriorWeek = weekStart === priorWeekStart();

  // Insights
  const insights = useMemo<string[]>(() => {
    if (!data) return [];
    const out: string[] = [];
    const { kpi, driverUtilization, hoursByDay } = data;

    if (kpi.otDriverCount > 0) {
      out.push(
        `${kpi.otDriverCount} employee driver${kpi.otDriverCount > 1 ? "s" : ""} exceeded the 40-hour overtime threshold — ${fmtH(kpi.employeeOtHours)} total OT recorded.`
      );
    } else if (kpi.employeeDriverCount > 0) {
      out.push("No employee drivers exceeded the 40-hour overtime threshold this week.");
    }

    const peakDay = [...hoursByDay].sort((a, b) => b.workedHours - a.workedHours)[0];
    if (peakDay && peakDay.workedHours > 0) {
      out.push(`Peak workload occurred on ${peakDay.day} with ${fmtH(peakDay.workedHours)} hours worked.`);
    }

    const worked = kpi.workedHours;
    const scheduled = kpi.scheduledHours;
    if (scheduled > 0 && worked > 0) {
      const util = Math.round((worked / scheduled) * 100);
      if (util < 80) {
        out.push(`Scheduled utilization was ${util}% — actual hours were below scheduled capacity.`);
      } else if (util > 100) {
        out.push(`Actual hours (${fmtH(worked)}) exceeded scheduled hours (${fmtH(scheduled)}) by ${fmtH(worked - scheduled)}.`);
      } else {
        out.push(`Strong utilization: ${util}% of scheduled hours were worked.`);
      }
    }

    const otDrivers = driverUtilization.filter((d) => d.status === "OT");
    if (otDrivers.length > 1) {
      out.push(`Driver utilization is uneven — OT concentrated among ${otDrivers.length} drivers.`);
    }

    return out;
  }, [data]);

  return (
    <div className="space-y-5 p-4" data-testid="analytics-tab">
      {/* ── Filter Bar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            onClick={goBack}
            data-testid="button-analytics-week-back"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-muted/30 text-sm font-medium whitespace-nowrap">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
            <span data-testid="text-analytics-week-range">
              {fmtDate(weekStart)} – {fmtDate(addDays(weekStart, 6))}
            </span>
            {atPriorWeek && (
              <Badge variant="secondary" className="text-[10px]">
                Prior Week
              </Badge>
            )}
          </div>
          <Button
            size="icon"
            variant="outline"
            onClick={goForward}
            disabled={atPriorWeek}
            data-testid="button-analytics-week-forward"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setWeekStart(priorWeekStart())}
          disabled={atPriorWeek}
          data-testid="button-analytics-reset-week"
        >
          Reset to Prior Week
        </Button>

        <Select
          value={driverType}
          onValueChange={(v) => setDriverType(v as typeof driverType)}
        >
          <SelectTrigger className="w-44" data-testid="select-analytics-driver-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Driver Types</SelectItem>
            <SelectItem value="employee">Employee Only</SelectItem>
            <SelectItem value="ic">Independent Contractor</SelectItem>
          </SelectContent>
        </Select>

        {isLoading && (
          <span className="text-xs text-muted-foreground animate-pulse">Loading…</span>
        )}
      </div>

      {/* ── Section 1: KPI Bar ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          icon={Users}
          label="Total Drivers"
          value={isLoading ? "—" : String(data?.kpi.totalDrivers ?? 0)}
        />
        <KpiCard
          icon={Clock}
          label="Hours Worked"
          value={isLoading ? "—" : fmtH(data?.kpi.workedHours ?? 0)}
          sub={
            data?.kpi.scheduledHours
              ? `of ${fmtH(data.kpi.scheduledHours)} scheduled`
              : undefined
          }
        />
        <KpiCard
          icon={CalendarDays}
          label="Scheduled Hours"
          value={isLoading ? "—" : fmtH(data?.kpi.scheduledHours ?? 0)}
        />
        <KpiCard
          icon={AlertTriangle}
          label="Employee OT Hours"
          value={isLoading ? "—" : fmtH(data?.kpi.employeeOtHours ?? 0)}
          sub={
            data
              ? `${data.kpi.otDriverCount} of ${data.kpi.employeeDriverCount} emp. drivers`
              : undefined
          }
          warn={(data?.kpi.employeeOtHours ?? 0) > 0}
        />
        <KpiCard
          icon={TrendingUp}
          label="OT %"
          value={isLoading ? "—" : `${data?.kpi.otPct ?? 0}%`}
          sub="of employee drivers in OT"
          warn={(data?.kpi.otPct ?? 0) > 0}
        />
      </div>

      {/* ── Section 2: Labor Distribution Charts ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Hours by Day */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Hours by Day</CardTitle>
            <p className="text-xs text-muted-foreground">Scheduled vs. worked hours per day of week</p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">
                Loading…
              </div>
            ) : (data?.hoursByDay.every((d) => d.scheduledHours === 0 && d.workedHours === 0)) ? (
              <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">
                No shift data for this week
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <BarChart
                  data={data?.hoursByDay}
                  margin={{ top: 4, right: 8, left: -12, bottom: 0 }}
                  barCategoryGap="25%"
                  barGap={2}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    unit="h"
                  />
                  <Tooltip
                    formatter={(val: number, name: string) => [
                      fmtH(val),
                      name === "scheduledHours" ? "Scheduled" : "Worked",
                    ]}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 6,
                    }}
                  />
                  <Legend
                    formatter={(v) => (v === "scheduledHours" ? "Scheduled" : "Worked")}
                    iconType="square"
                    wrapperStyle={{ fontSize: 11 }}
                  />
                  <Bar
                    dataKey="scheduledHours"
                    fill="hsl(var(--muted-foreground)/0.3)"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={32}
                  />
                  <Bar
                    dataKey="workedHours"
                    fill="hsl(var(--primary))"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Drivers by Day */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Drivers by Day</CardTitle>
            <p className="text-xs text-muted-foreground">Unique active drivers per day of week</p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">
                Loading…
              </div>
            ) : (data?.hoursByDay.every((d) => d.driverCount === 0)) ? (
              <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">
                No driver data for this week
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <BarChart
                  data={data?.hoursByDay}
                  margin={{ top: 4, right: 8, left: -12, bottom: 0 }}
                  barCategoryGap="35%"
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    formatter={(val: number) => [val, "Drivers"]}
                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                  />
                  <Bar
                    dataKey="driverCount"
                    fill="hsl(var(--primary)/0.7)"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={36}
                    name="Drivers"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Section 3: Driver Utilization Table ── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm font-semibold">Driver Utilization</CardTitle>
            {data && (
              <span className="text-xs text-muted-foreground">
                {data.driverUtilization.length} driver{data.driverUtilization.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="h-24 flex items-center justify-center text-muted-foreground text-sm">
              Loading…
            </div>
          ) : !data?.driverUtilization.length ? (
            <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">
              No time entry data found for this week
            </div>
          ) : (
            <div className="overflow-auto max-h-80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs pl-4">Driver</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs text-right">Hours Worked</TableHead>
                    <TableHead className="text-xs text-right">OT Hours</TableHead>
                    <TableHead className="text-xs text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.driverUtilization.map((d, i) => (
                    <TableRow
                      key={i}
                      className={d.status === "OT" ? "bg-amber-50/50 dark:bg-amber-900/10" : undefined}
                      data-testid={`row-driver-util-${i}`}
                    >
                      <TableCell className="py-2 pl-4 text-sm font-medium">{d.name}</TableCell>
                      <TableCell className="py-2">
                        <Badge variant="outline" className="text-[10px]">
                          {d.driverType === "employee"
                            ? "Emp"
                            : d.driverType === "independent_contractor" || d.driverType === "ic"
                            ? "IC"
                            : d.driverType}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2 text-sm text-right tabular-nums">
                        {fmtH(d.workedHours)}
                      </TableCell>
                      <TableCell className="py-2 text-right tabular-nums">
                        {d.otHours > 0 ? (
                          <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                            {fmtH(d.otHours)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2 text-center">
                        <Badge
                          variant={d.status === "OT" ? "destructive" : "secondary"}
                          className="text-[10px]"
                        >
                          {d.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Section 4: OT Concentration ── */}
      {((data?.otConcentration.length ?? 0) > 0 || !isLoading) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Labor Health — OT Concentration</CardTitle>
            <p className="text-xs text-muted-foreground">
              Top employee drivers contributing to overtime this week
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-16 flex items-center justify-center text-muted-foreground text-sm">
                Loading…
              </div>
            ) : !data?.otConcentration.length ? (
              <p className="text-sm text-muted-foreground">
                No employee overtime recorded this week.
              </p>
            ) : (
              <div className="space-y-2.5">
                {data.otConcentration.map((d, i) => (
                  <div key={i} className="flex items-center gap-3" data-testid={`row-ot-conc-${i}`}>
                    <span className="text-xs font-mono text-muted-foreground w-4 shrink-0">
                      {i + 1}.
                    </span>
                    <span className="text-sm font-medium flex-1 min-w-0 truncate">{d.name}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {fmtH(d.totalHours)} total
                      </span>
                      <span className="text-sm font-semibold text-amber-600 dark:text-amber-400 tabular-nums w-14 text-right">
                        +{fmtH(d.otHours)} OT
                      </span>
                      <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-amber-400 dark:bg-amber-500 rounded-full"
                          style={{ width: `${Math.min(d.hoursPct, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                        {d.hoursPct}%
                      </span>
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground pt-1">
                  % represents share of total employee hours worked
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Section 5: Move / Trip Performance Placeholder ── */}
      <PlaceholderSection
        title="Move / Trip Performance"
        icon={Construction}
        items={["Moves Completed", "Moves per Driver", "On-Time %", "Avg Duration"]}
      />

      {/* ── Section 6: Financial Performance Placeholder ── */}
      <PlaceholderSection
        title="Financial Performance"
        icon={Construction}
        items={["Labor Cost", "Revenue", "Margin", "Cost per Move"]}
      />

      {/* ── Section 7: Insights Panel ── */}
      {insights.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Insights
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Logic-driven observations for this week. AI-driven insights coming soon.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {insights.map((ins, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 text-sm"
                  data-testid={`insight-${i}`}
                >
                  <span className="mt-1 shrink-0 h-1.5 w-1.5 rounded-full bg-primary" />
                  <span>{ins}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
