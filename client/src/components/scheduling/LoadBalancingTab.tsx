import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfWeek, endOfWeek } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Scale, AlertTriangle, TrendingUp, TrendingDown, Users, Clock,
  Loader2, Search, Filter, ChevronDown, ChevronUp, Lightbulb,
  AlertCircle, Truck, Info
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkloadFlag {
  type: "high_density" | "low_utilization" | "overtime_risk" | "no_moves" | "unscheduled_moves";
  severity: "warning" | "critical";
  label: string;
  detail: string;
}

interface AdvisorySuggestion {
  type: "redistribute" | "add_capacity" | "reduce_load" | "review_availability";
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
}

interface DriverWorkload {
  driverId: string;
  driverName: string;
  driverNumber: string | null;
  market: string | null;
  status: string | null;
  scheduledHours: number;
  moveCount: number;
  movesPerHour: number;
  availabilityHours: number;
  utilizationPercent: number;
  overtimeShifts: number;
  flags: WorkloadFlag[];
  suggestions: AdvisorySuggestion[];
}

interface LoadBalancingSummary {
  totalDrivers: number;
  avgMovesPerDriver: number;
  avgScheduledHours: number;
  flaggedDrivers: number;
  highDensityCount: number;
  lowUtilizationCount: number;
  overtimeRiskCount: number;
}

interface LoadBalancingResult {
  drivers: DriverWorkload[];
  summary: LoadBalancingSummary;
}

type DateRange = "this_week" | "last_week" | "last_30_days";
type SortField = "driverName" | "moveCount" | "scheduledHours" | "movesPerHour" | "utilizationPercent" | "flags";

function getDateRange(range: DateRange): { startDate: string; endDate: string } {
  const now = new Date();
  switch (range) {
    case "this_week":
      return {
        startDate: format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        endDate: format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      };
    case "last_week": {
      const lastWeekStart = startOfWeek(subDays(now, 7), { weekStartsOn: 1 });
      return {
        startDate: format(lastWeekStart, "yyyy-MM-dd"),
        endDate: format(endOfWeek(lastWeekStart, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      };
    }
    case "last_30_days":
      return {
        startDate: format(subDays(now, 30), "yyyy-MM-dd"),
        endDate: format(now, "yyyy-MM-dd"),
      };
  }
}

function FlagBadge({ flag, driverId }: { flag: WorkloadFlag; driverId: string }) {
  const isCritical = flag.severity === "critical";
  return (
    <Badge
      variant={isCritical ? "destructive" : "secondary"}
      className="gap-1 text-xs"
      data-testid={`badge-flag-${flag.type}-${driverId}`}
    >
      {isCritical ? (
        <AlertCircle className="h-3 w-3" />
      ) : (
        <AlertTriangle className="h-3 w-3" />
      )}
      {flag.label}
    </Badge>
  );
}

function SuggestionCard({ suggestion, driverId }: { suggestion: AdvisorySuggestion; driverId: string }) {
  return (
    <div
      className="p-3 bg-muted/30 rounded-md border"
      data-testid={`suggestion-${suggestion.type}-${driverId}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Lightbulb className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-medium">{suggestion.title}</span>
        <Badge variant="outline" className="text-xs ml-auto">
          {suggestion.priority}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{suggestion.description}</p>
      <p className="text-xs text-muted-foreground mt-1 italic flex items-center gap-1">
        <Info className="h-3 w-3" />
        Advisory only — no automatic changes will be made
      </p>
    </div>
  );
}

function UtilizationBar({ percent, driverId }: { percent: number; driverId: string }) {
  const getColor = () => {
    if (percent < 30) return "bg-destructive";
    if (percent < 60) return "bg-muted-foreground";
    return "bg-primary";
  };

  return (
    <div className="flex items-center gap-2" data-testid={`bar-utilization-${driverId}`}>
      <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", getColor())}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground w-10 text-right">
        {percent.toFixed(0)}%
      </span>
    </div>
  );
}

export function LoadBalancingTab() {
  const [dateRange, setDateRange] = useState<DateRange>("last_30_days");
  const [marketFilter, setMarketFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [flagsOnly, setFlagsOnly] = useState(false);
  const [sortField, setSortField] = useState<SortField>("flags");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedDriver, setExpandedDriver] = useState<string | null>(null);

  const { startDate, endDate } = getDateRange(dateRange);

  const { data, isLoading } = useQuery<LoadBalancingResult>({
    queryKey: ["/api/corporate/scheduling/load-balancing", startDate, endDate, marketFilter, String(flagsOnly)],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate,
        endDate,
        ...(marketFilter !== "all" && { market: marketFilter }),
        ...(flagsOnly && { flagsOnly: "true" }),
      });
      const res = await fetch(`/api/corporate/scheduling/load-balancing?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const drivers = data?.drivers || [];
  const summary = data?.summary;

  const markets = useMemo(() => {
    const set = new Set<string>();
    drivers.forEach((d) => {
      if (d.market) set.add(d.market);
    });
    return Array.from(set).sort();
  }, [drivers]);

  const filteredDrivers = useMemo(() => {
    let result = drivers;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (d) =>
          d.driverName.toLowerCase().includes(q) ||
          (d.driverNumber && d.driverNumber.toLowerCase().includes(q)) ||
          (d.market && d.market.toLowerCase().includes(q))
      );
    }

    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "driverName":
          cmp = a.driverName.localeCompare(b.driverName);
          break;
        case "moveCount":
          cmp = a.moveCount - b.moveCount;
          break;
        case "scheduledHours":
          cmp = a.scheduledHours - b.scheduledHours;
          break;
        case "movesPerHour":
          cmp = a.movesPerHour - b.movesPerHour;
          break;
        case "utilizationPercent":
          cmp = a.utilizationPercent - b.utilizationPercent;
          break;
        case "flags":
          cmp = a.flags.length - b.flags.length;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [drivers, searchQuery, sortField, sortAsc]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button
      className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
      onClick={() => handleSort(field)}
      data-testid={`sort-${field}`}
    >
      {children}
      {sortField === field && (
        sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      )}
    </button>
  );

  return (
    <div className="space-y-6">
      <Card data-testid="card-load-balancing">
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5" />
                Cross-Module Load Balancing
              </CardTitle>
              <CardDescription>
                Compare move demand against scheduled hours to identify workload imbalances across drivers
              </CardDescription>
            </div>
            <Badge variant="outline" className="gap-1">
              <Info className="h-3 w-3" />
              Advisory Only
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap mb-6">
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
              <SelectTrigger className="w-[160px]" data-testid="select-date-range">
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_week">This Week</SelectItem>
                <SelectItem value="last_week">Last Week</SelectItem>
                <SelectItem value="last_30_days">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>

            <Select value={marketFilter} onValueChange={setMarketFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-market-filter">
                <SelectValue placeholder="All Markets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Markets</SelectItem>
                {markets.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search drivers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-[200px]"
                data-testid="input-search-drivers"
              />
            </div>

            <Button
              variant={flagsOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setFlagsOnly(!flagsOnly)}
              data-testid="button-flags-only"
            >
              <Filter className="h-4 w-4 mr-1" />
              Flagged Only
            </Button>
          </div>

          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
              <Card className="p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <Users className="h-3.5 w-3.5" />
                  Drivers
                </div>
                <p className="text-xl font-bold" data-testid="text-total-drivers">{summary.totalDrivers}</p>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <Truck className="h-3.5 w-3.5" />
                  Avg Moves
                </div>
                <p className="text-xl font-bold" data-testid="text-avg-moves">{summary.avgMovesPerDriver}</p>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <Clock className="h-3.5 w-3.5" />
                  Avg Hours
                </div>
                <p className="text-xl font-bold" data-testid="text-avg-hours">{summary.avgScheduledHours}h</p>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Flagged
                </div>
                <p className="text-xl font-bold" data-testid="text-flagged-count">{summary.flaggedDrivers}</p>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <TrendingUp className="h-3.5 w-3.5" />
                  High Density
                </div>
                <p className="text-xl font-bold" data-testid="text-high-density">{summary.highDensityCount}</p>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <TrendingDown className="h-3.5 w-3.5" />
                  Low Util
                </div>
                <p className="text-xl font-bold" data-testid="text-low-util">{summary.lowUtilizationCount}</p>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  OT Risk
                </div>
                <p className="text-xl font-bold" data-testid="text-ot-risk">{summary.overtimeRiskCount}</p>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-workload-table">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Driver Workload Details</CardTitle>
          <CardDescription>
            {filteredDrivers.length} driver{filteredDrivers.length !== 1 ? "s" : ""} shown
            {flagsOnly ? " (flagged only)" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredDrivers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Scale className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No drivers found</p>
              <p className="text-sm mt-1">
                {flagsOnly
                  ? "No workload imbalances detected in this period"
                  : "No active drivers match the current filters"}
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <div className="space-y-0">
                <div className="grid grid-cols-[1fr_80px_80px_90px_100px_auto] gap-3 px-3 py-2 text-xs border-b bg-muted/30 rounded-t-md sticky top-0 z-10">
                  <SortHeader field="driverName">Driver</SortHeader>
                  <SortHeader field="moveCount">Moves</SortHeader>
                  <SortHeader field="scheduledHours">Sched. Hrs</SortHeader>
                  <SortHeader field="movesPerHour">Moves/Hr</SortHeader>
                  <SortHeader field="utilizationPercent">Utilization</SortHeader>
                  <SortHeader field="flags">Flags</SortHeader>
                </div>

                {filteredDrivers.map((driver) => {
                  const isExpanded = expandedDriver === driver.driverId;
                  return (
                    <div key={driver.driverId} data-testid={`row-driver-${driver.driverId}`}>
                      <div
                        role="button"
                        tabIndex={0}
                        className="w-full grid grid-cols-[1fr_80px_80px_90px_100px_auto] gap-3 px-3 py-3 text-sm border-b hover-elevate cursor-pointer text-left items-center"
                        onClick={() => setExpandedDriver(isExpanded ? null : driver.driverId)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setExpandedDriver(isExpanded ? null : driver.driverId);
                          }
                        }}
                        data-testid={`button-expand-${driver.driverId}`}
                      >
                        <div className="min-w-0">
                          <div className="font-medium truncate" data-testid={`text-driver-name-${driver.driverId}`}>
                            {driver.driverName}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                            {driver.driverNumber && <span data-testid={`text-driver-number-${driver.driverId}`}>#{driver.driverNumber}</span>}
                            {driver.market && (
                              <Badge variant="outline" className="text-xs py-0" data-testid={`badge-market-${driver.driverId}`}>
                                {driver.market}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="font-medium tabular-nums" data-testid={`text-move-count-${driver.driverId}`}>
                          {driver.moveCount}
                        </div>

                        <div className="tabular-nums text-muted-foreground" data-testid={`text-sched-hours-${driver.driverId}`}>
                          {driver.scheduledHours.toFixed(1)}h
                        </div>

                        <div className={cn(
                          "font-medium tabular-nums",
                          driver.movesPerHour > 3 ? "text-destructive" : "text-foreground"
                        )} data-testid={`text-moves-per-hour-${driver.driverId}`}>
                          {driver.movesPerHour.toFixed(1)}
                        </div>

                        <UtilizationBar percent={driver.utilizationPercent} driverId={driver.driverId} />

                        <div className="flex items-center gap-1 flex-wrap">
                          {driver.flags.length > 0 ? (
                            driver.flags.slice(0, 2).map((flag, i) => (
                              <FlagBadge key={i} flag={flag} driverId={driver.driverId} />
                            ))
                          ) : (
                            <Badge variant="outline" className="text-xs" data-testid={`badge-balanced-${driver.driverId}`}>
                              Balanced
                            </Badge>
                          )}
                          {driver.flags.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{driver.flags.length - 2}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-3 py-4 bg-muted/20 border-b space-y-4" data-testid={`panel-details-${driver.driverId}`}>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-xs text-muted-foreground block" data-testid={`label-move-count-${driver.driverId}`}>Move Count</span>
                              <span className="font-medium" data-testid={`detail-move-count-${driver.driverId}`}>{driver.moveCount}</span>
                            </div>
                            <div>
                              <span className="text-xs text-muted-foreground block" data-testid={`label-sched-hours-${driver.driverId}`}>Scheduled Hours</span>
                              <span className="font-medium" data-testid={`detail-sched-hours-${driver.driverId}`}>{driver.scheduledHours.toFixed(1)}h</span>
                            </div>
                            <div>
                              <span className="text-xs text-muted-foreground block" data-testid={`label-moves-per-hour-${driver.driverId}`}>Moves per Hour</span>
                              <span className="font-medium" data-testid={`detail-moves-per-hour-${driver.driverId}`}>{driver.movesPerHour.toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-xs text-muted-foreground block" data-testid={`label-overtime-${driver.driverId}`}>Overtime Shifts</span>
                              <span className="font-medium" data-testid={`detail-overtime-${driver.driverId}`}>{driver.overtimeShifts}</span>
                            </div>
                          </div>

                          {driver.flags.length > 0 && (
                            <div>
                              <h4 className="text-xs font-medium text-muted-foreground mb-2">Flags</h4>
                              <div className="flex flex-wrap gap-2">
                                {driver.flags.map((flag, i) => (
                                  <div key={i} className="text-xs">
                                    <FlagBadge flag={flag} driverId={driver.driverId} />
                                    <p className="text-muted-foreground mt-0.5 ml-1" data-testid={`text-flag-detail-${flag.type}-${driver.driverId}`}>{flag.detail}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {driver.suggestions.length > 0 && (
                            <div>
                              <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                <Lightbulb className="h-3.5 w-3.5" />
                                Advisory Suggestions
                              </h4>
                              <div className="space-y-2">
                                {driver.suggestions.map((s, i) => (
                                  <SuggestionCard key={i} suggestion={s} driverId={driver.driverId} />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
