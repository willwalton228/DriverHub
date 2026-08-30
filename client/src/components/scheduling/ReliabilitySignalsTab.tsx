import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format, subDays, startOfWeek, endOfWeek } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Loader2, Search, ChevronDown, ChevronUp, Info,
  AlertTriangle, Clock, Users, TrendingUp, TrendingDown,
  Minus, ShieldAlert, Coffee, UserX
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ReliabilityEvent {
  date: string;
  shiftId: string;
  type: "late_start" | "missed_shift" | "break_violation";
  detail: string;
  minutesDeviation: number;
}

interface DriverReliabilityProfile {
  driverId: string;
  driverName: string;
  driverNumber: string | null;
  market: string | null;
  totalAssignments: number;
  lateStarts: number;
  missedShifts: number;
  breakViolations: number;
  totalSignals: number;
  recentEvents: ReliabilityEvent[];
  trendDirection: "improving" | "stable" | "worsening";
  avgLateMinutes: number;
}

interface ReliabilitySignalSummary {
  totalDriversAnalyzed: number;
  driversWithSignals: number;
  totalLateStarts: number;
  totalMissedShifts: number;
  totalBreakViolations: number;
  totalSignals: number;
  avgLateMinutes: number;
  lateStartRate: number;
  missedShiftRate: number;
  breakViolationRate: number;
}

interface ReliabilityBanner {
  type: "late_pattern" | "missed_pattern" | "break_pattern" | "overall_trend";
  severity: "info" | "warning";
  title: string;
  message: string;
  metric: string;
}

interface ReliabilitySignalsResult {
  drivers: DriverReliabilityProfile[];
  summary: ReliabilitySignalSummary;
  banners: ReliabilityBanner[];
}

type DateRange = "this_week" | "last_week" | "last_30" | "last_90";
type SortField = "totalSignals" | "lateStarts" | "missedShifts" | "breakViolations" | "avgLateMinutes";
type SignalFilter = "all" | "late_start" | "missed_shift" | "break_violation";

function getDateRange(range: DateRange) {
  const today = new Date();
  switch (range) {
    case "this_week":
      return { startDate: format(startOfWeek(today), "yyyy-MM-dd"), endDate: format(endOfWeek(today), "yyyy-MM-dd") };
    case "last_week":
      return { startDate: format(startOfWeek(subDays(today, 7)), "yyyy-MM-dd"), endDate: format(endOfWeek(subDays(today, 7)), "yyyy-MM-dd") };
    case "last_30":
      return { startDate: format(subDays(today, 30), "yyyy-MM-dd"), endDate: format(today, "yyyy-MM-dd") };
    case "last_90":
      return { startDate: format(subDays(today, 90), "yyyy-MM-dd"), endDate: format(today, "yyyy-MM-dd") };
  }
}

function TrendIcon({ direction }: { direction: "improving" | "stable" | "worsening" }) {
  if (direction === "improving") {
    return <TrendingDown className="h-4 w-4 text-green-600 dark:text-green-400" />;
  }
  if (direction === "worsening") {
    return <TrendingUp className="h-4 w-4 text-destructive" />;
  }
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function TrendBadge({ direction }: { direction: "improving" | "stable" | "worsening" }) {
  const config = {
    improving: { label: "Improving", variant: "outline" as const, className: "text-green-700 dark:text-green-400 border-green-300 dark:border-green-700" },
    stable: { label: "Stable", variant: "outline" as const, className: "text-muted-foreground" },
    worsening: { label: "Monitor", variant: "outline" as const, className: "text-muted-foreground border-muted-foreground/50" },
  };
  const c = config[direction];
  return (
    <Badge variant={c.variant} className={c.className} data-testid={`badge-trend-${direction}`}>
      <TrendIcon direction={direction} />
      <span className="ml-1">{c.label}</span>
    </Badge>
  );
}

function SignalTypeBadge({ type }: { type: ReliabilityEvent["type"] }) {
  const config = {
    late_start: { label: "Late Start", icon: Clock, className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
    missed_shift: { label: "No Clock-In", icon: UserX, className: "bg-muted text-muted-foreground" },
    break_violation: { label: "Break Overrun", icon: Coffee, className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  };
  const c = config[type];
  const Icon = c.icon;
  return (
    <Badge className={cn("gap-1", c.className)}>
      <Icon className="h-3 w-3" />
      {c.label}
    </Badge>
  );
}

function SortHeader({
  label,
  field,
  currentSort,
  currentDir,
  onSort,
}: {
  label: string;
  field: SortField;
  currentSort: SortField;
  currentDir: "asc" | "desc";
  onSort: (f: SortField) => void;
}) {
  const active = currentSort === field;
  return (
    <button
      onClick={() => onSort(field)}
      className={cn(
        "flex items-center gap-1 text-xs font-medium cursor-pointer select-none",
        active ? "text-foreground" : "text-muted-foreground"
      )}
      data-testid={`sort-${field}`}
    >
      {label}
      {active && (currentDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
    </button>
  );
}

function SignalBar({ lateStarts, missedShifts, breakViolations, totalAssignments, driverId }: { lateStarts: number; missedShifts: number; breakViolations: number; totalAssignments: number; driverId: string }) {
  if (totalAssignments === 0) return <div className="text-xs text-muted-foreground">No data</div>;
  const total = lateStarts + missedShifts + breakViolations;
  if (total === 0) {
    return (
      <div className="flex items-center gap-2" data-testid={`signal-bar-${driverId}`}>
        <div className="flex-1 h-2 rounded-full bg-green-200 dark:bg-green-900/40 overflow-hidden">
          <div className="h-full bg-green-500 dark:bg-green-600 rounded-full" style={{ width: "100%" }} />
        </div>
        <span className="text-xs text-muted-foreground">Clear</span>
      </div>
    );
  }
  const lateW = (lateStarts / total) * 100;
  const missedW = (missedShifts / total) * 100;
  const breakW = (breakViolations / total) * 100;
  return (
    <div className="flex items-center gap-2" data-testid={`signal-bar-${driverId}`}>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden flex">
        {lateStarts > 0 && <div className="h-full bg-amber-500" style={{ width: `${lateW}%` }} />}
        {missedShifts > 0 && <div className="h-full bg-muted-foreground" style={{ width: `${missedW}%` }} />}
        {breakViolations > 0 && <div className="h-full bg-blue-500" style={{ width: `${breakW}%` }} />}
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">{total} total</span>
    </div>
  );
}

export function ReliabilitySignalsTab() {
  const [dateRange, setDateRange] = useState<DateRange>("last_30");
  const [marketFilter, setMarketFilter] = useState<string>("all");
  const [signalFilter, setSignalFilter] = useState<SignalFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("totalSignals");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedDriver, setExpandedDriver] = useState<string | null>(null);

  const { startDate, endDate } = getDateRange(dateRange);

  const { data, isLoading, isError } = useQuery<ReliabilitySignalsResult>({
    queryKey: ["/api/corporate/scheduling/reliability-signals", dateRange, marketFilter, signalFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate, endDate });
      if (marketFilter !== "all") params.set("market", marketFilter);
      if (signalFilter !== "all") params.set("signalType", signalFilter);
      const res = await apiRequest("GET", `/api/corporate/scheduling/reliability-signals?${params}`);
      return res.json();
    },
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const filteredDrivers = useMemo(() => {
    if (!data) return [];
    let drivers = data.drivers;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      drivers = drivers.filter(
        (d) =>
          d.driverName.toLowerCase().includes(q) ||
          (d.driverNumber && d.driverNumber.toLowerCase().includes(q))
      );
    }
    const sorted = [...drivers].sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      return sortDir === "asc" ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });
    return sorted;
  }, [data, searchQuery, sortField, sortDir]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="loading-reliability">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">Unable to load reliability data</p>
        </CardContent>
      </Card>
    );
  }

  const { summary, banners } = data;

  return (
    <div className="space-y-6" data-testid="card-reliability-signals">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-semibold" data-testid="text-reliability-title">
            Reliability & Risk Signals
          </h2>
          <Badge variant="outline" className="text-muted-foreground" data-testid="badge-advisory-reliability">
            <Info className="h-3 w-3 mr-1" />
            Advisory Only
          </Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="w-36" data-testid="select-date-range-rel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="last_week">Last Week</SelectItem>
              <SelectItem value="last_30">Last 30 Days</SelectItem>
              <SelectItem value="last_90">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={signalFilter} onValueChange={(v) => setSignalFilter(v as SignalFilter)}>
            <SelectTrigger className="w-40" data-testid="select-signal-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Signals</SelectItem>
              <SelectItem value="late_start">Late Starts</SelectItem>
              <SelectItem value="missed_shift">Missed Shifts</SelectItem>
              <SelectItem value="break_violation">Break Overruns</SelectItem>
            </SelectContent>
          </Select>
          <Select value={marketFilter} onValueChange={setMarketFilter}>
            <SelectTrigger className="w-36" data-testid="select-market-filter-rel">
              <SelectValue placeholder="All Markets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Markets</SelectItem>
              {Array.from(new Set(data.drivers.map((d) => d.market).filter(Boolean))).map((m) => (
                <SelectItem key={m!} value={m!}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search drivers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 w-48"
              data-testid="input-search-drivers-rel"
            />
          </div>
        </div>
      </div>

      {banners.length > 0 && (
        <div className="space-y-2" data-testid="reliability-banners">
          {banners.map((banner) => (
            <Alert key={banner.type} variant={banner.severity === "warning" ? "destructive" : "default"} data-testid={`banner-${banner.type}`}>
              {banner.severity === "warning" ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <Info className="h-4 w-4" />
              )}
              <AlertTitle className="flex items-center gap-2 flex-wrap">
                {banner.title}
                <Badge variant="outline" className="text-xs">{banner.metric}</Badge>
              </AlertTitle>
              <AlertDescription className="text-sm">{banner.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Card data-testid="card-total-signals">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="text-xs">Total Signals</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold" data-testid="text-total-signals">{summary.totalSignals}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-late-starts">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="flex items-center gap-1 text-xs">
              <Clock className="h-3 w-3" /> Late Starts
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold" data-testid="text-late-starts">{summary.totalLateStarts}</div>
            <div className="text-xs text-muted-foreground">{summary.lateStartRate}% rate</div>
          </CardContent>
        </Card>
        <Card data-testid="card-missed-shifts">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="flex items-center gap-1 text-xs">
              <UserX className="h-3 w-3" /> Missed Shifts
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold" data-testid="text-missed-shifts">{summary.totalMissedShifts}</div>
            <div className="text-xs text-muted-foreground">{summary.missedShiftRate}% rate</div>
          </CardContent>
        </Card>
        <Card data-testid="card-break-violations">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="flex items-center gap-1 text-xs">
              <Coffee className="h-3 w-3" /> Break Overruns
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold" data-testid="text-break-violations">{summary.totalBreakViolations}</div>
            <div className="text-xs text-muted-foreground">{summary.breakViolationRate}% rate</div>
          </CardContent>
        </Card>
        <Card data-testid="card-drivers-with-signals">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="flex items-center gap-1 text-xs">
              <Users className="h-3 w-3" /> Drivers w/ Signals
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold" data-testid="text-drivers-with-signals">
              {summary.driversWithSignals}
              <span className="text-sm font-normal text-muted-foreground"> / {summary.totalDriversAnalyzed}</span>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-avg-late-minutes">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="text-xs">Avg Late (min)</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold" data-testid="text-avg-late-minutes">
              {summary.avgLateMinutes > 0 ? `${summary.avgLateMinutes}` : "-"}
            </div>
            {summary.avgLateMinutes > 0 && (
              <div className="text-xs text-muted-foreground">avg delay</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-driver-table-reliability">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <ShieldAlert className="h-5 w-5 text-muted-foreground" />
            Driver Reliability Overview
          </CardTitle>
          <CardDescription>Aggregated signal patterns by driver. Trends compare first half vs second half of selected period.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <div className="min-w-[750px]">
              <div className="grid grid-cols-[2fr_0.8fr_0.8fr_0.8fr_0.8fr_1.5fr_1fr_auto] gap-2 px-4 py-2 border-b bg-muted/50 text-xs font-medium text-muted-foreground sticky top-0 z-10">
                <div data-testid="col-header-driver-rel">Driver</div>
                <SortHeader label="Late" field="lateStarts" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Missed" field="missedShifts" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Break" field="breakViolations" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Total" field="totalSignals" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                <div>Distribution</div>
                <div>Trend</div>
                <div className="w-6" />
              </div>

              {filteredDrivers.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No drivers match the current filters</p>
                </div>
              ) : (
                filteredDrivers.map((driver) => (
                  <div key={driver.driverId}>
                    <div
                      className="grid grid-cols-[2fr_0.8fr_0.8fr_0.8fr_0.8fr_1.5fr_1fr_auto] gap-2 px-4 py-3 border-b hover-elevate cursor-pointer items-center"
                      onClick={() => setExpandedDriver(expandedDriver === driver.driverId ? null : driver.driverId)}
                      data-testid={`row-driver-rel-${driver.driverId}`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate" data-testid={`text-driver-name-rel-${driver.driverId}`}>
                          {driver.driverName}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {driver.driverNumber || "No ID"}{driver.market ? ` \u00B7 ${driver.market}` : ""}
                        </div>
                      </div>
                      <div className="text-sm" data-testid={`text-late-${driver.driverId}`}>
                        {driver.lateStarts > 0 ? driver.lateStarts : "-"}
                      </div>
                      <div className="text-sm" data-testid={`text-missed-${driver.driverId}`}>
                        {driver.missedShifts > 0 ? driver.missedShifts : "-"}
                      </div>
                      <div className="text-sm" data-testid={`text-break-${driver.driverId}`}>
                        {driver.breakViolations > 0 ? driver.breakViolations : "-"}
                      </div>
                      <div className={cn("text-sm font-medium", driver.totalSignals > 0 && "text-foreground")} data-testid={`text-total-${driver.driverId}`}>
                        {driver.totalSignals > 0 ? driver.totalSignals : "-"}
                      </div>
                      <SignalBar
                        lateStarts={driver.lateStarts}
                        missedShifts={driver.missedShifts}
                        breakViolations={driver.breakViolations}
                        totalAssignments={driver.totalAssignments}
                        driverId={driver.driverId}
                      />
                      <div>
                        {driver.totalSignals >= 3 ? (
                          <TrendBadge direction={driver.trendDirection} />
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </div>
                      <div className="w-6 flex items-center justify-center">
                        {expandedDriver === driver.driverId ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {expandedDriver === driver.driverId && (
                      <div className="px-6 py-4 border-b bg-muted/30" data-testid={`detail-panel-${driver.driverId}`}>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Total Assignments</div>
                            <div className="text-sm font-medium" data-testid={`text-assignments-${driver.driverId}`}>{driver.totalAssignments}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Signal Rate</div>
                            <div className="text-sm font-medium" data-testid={`text-signal-rate-${driver.driverId}`}>
                              {driver.totalAssignments > 0
                                ? `${((driver.totalSignals / driver.totalAssignments) * 100).toFixed(1)}%`
                                : "-"}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Avg Late (min)</div>
                            <div className="text-sm font-medium" data-testid={`text-avg-late-${driver.driverId}`}>
                              {driver.avgLateMinutes > 0 ? driver.avgLateMinutes : "-"}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Trend</div>
                            <div className="text-sm font-medium flex items-center gap-1">
                              <TrendIcon direction={driver.trendDirection} />
                              {driver.trendDirection === "improving" ? "Improving" : driver.trendDirection === "worsening" ? "Monitor" : "Stable"}
                            </div>
                          </div>
                        </div>
                        {driver.recentEvents.length > 0 ? (
                          <div>
                            <div className="text-xs font-medium text-muted-foreground mb-2">Recent Events (up to 5)</div>
                            <div className="space-y-2">
                              {driver.recentEvents.map((evt, i) => (
                                <div key={`${evt.shiftId}-${evt.type}-${i}`} className="flex items-center gap-3 text-sm">
                                  <div className="text-xs text-muted-foreground w-20 shrink-0">{evt.date}</div>
                                  <SignalTypeBadge type={evt.type} />
                                  <div className="text-muted-foreground truncate">{evt.detail}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">No recent events to display</div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground text-center" data-testid="text-reliability-disclaimer">
        Reliability signals are advisory only and do not constitute performance records. Patterns are aggregated for dispatch planning purposes.
        Late threshold: {">"}5 min after scheduled start. Break overrun threshold: {">"}5 min over allowed duration.
      </div>
    </div>
  );
}
