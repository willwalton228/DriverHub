import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfWeek, endOfWeek } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  DollarSign, TrendingUp, TrendingDown, Users, Clock,
  Loader2, Search, ChevronDown, ChevronUp, Info,
  AlertTriangle, Percent, ArrowDownRight, ArrowUpRight,
  Truck
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RevenueFlag {
  type: "low_margin" | "negative_margin" | "high_ot_impact" | "below_market_avg" | "no_revenue_data";
  severity: "info" | "warning" | "critical";
  label: string;
  detail: string;
}

interface AdvisoryBanner {
  type: "overtime_cost" | "margin_opportunity" | "reassignment_potential";
  severity: "info" | "warning";
  title: string;
  message: string;
  metric: string;
}

interface DriverRevenueMetrics {
  driverId: string;
  driverName: string;
  driverNumber: string | null;
  market: string | null;
  totalRevenue: number;
  totalCost: number;
  grossMargin: number;
  marginPercent: number;
  moveCount: number;
  avgRevenuePerMove: number;
  avgMarginPerMove: number;
  scheduledHours: number;
  revenuePerHour: number;
  overtimeShifts: number;
  estimatedOvertimePremium: number;
  marginAfterOT: number;
  marginPercentAfterOT: number;
  flags: RevenueFlag[];
}

interface RevenueMarginSummary {
  totalRevenue: number;
  totalCost: number;
  totalGrossMargin: number;
  overallMarginPercent: number;
  totalOvertimePremium: number;
  marginAfterOT: number;
  marginPercentAfterOT: number;
  totalDrivers: number;
  driversWithMoves: number;
  flaggedDrivers: number;
  avgRevenuePerDriver: number;
  avgMarginPerDriver: number;
  marketBenchmarkMargin: number;
}

interface RevenueMarginResult {
  drivers: DriverRevenueMetrics[];
  summary: RevenueMarginSummary;
  banners: AdvisoryBanner[];
}

type DateRange = "this_week" | "last_week" | "last_30" | "last_90";
type SortField = "revenue" | "margin" | "marginPercent" | "moves" | "otPremium" | "revenuePerHour";

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

function formatCurrency(amount: number): string {
  if (Math.abs(amount) >= 1000) {
    return `$${(amount / 1000).toFixed(1)}k`;
  }
  return `$${amount.toFixed(0)}`;
}

function formatCurrencyFull(amount: number): string {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function MarginBar({ percent, afterOT, driverId }: { percent: number; afterOT?: number; driverId?: string }) {
  const clampedPercent = Math.max(0, Math.min(100, percent));
  const clampedAfterOT = afterOT !== undefined ? Math.max(0, Math.min(100, afterOT)) : undefined;

  let barColor = "bg-primary";
  if (percent < 0) barColor = "bg-destructive";
  else if (percent < 15) barColor = "bg-destructive";
  else if (percent < 25) barColor = "bg-muted-foreground";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden" data-testid={driverId ? `bar-margin-${driverId}` : "bar-margin"}>
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${clampedPercent}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap w-10 text-right">
        {percent.toFixed(0)}%
      </span>
      {clampedAfterOT !== undefined && clampedAfterOT !== clampedPercent && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          <ArrowDownRight className="inline h-3 w-3" />
          {afterOT!.toFixed(0)}%
        </span>
      )}
    </div>
  );
}

function FlagBadge({ flag }: { flag: RevenueFlag }) {
  if (flag.severity === "critical") {
    return <Badge variant="destructive" title={flag.detail}>{flag.label}</Badge>;
  }
  if (flag.severity === "warning") {
    return <Badge variant="secondary" title={flag.detail}>{flag.label}</Badge>;
  }
  return <Badge variant="outline" title={flag.detail}>{flag.label}</Badge>;
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
  const isActive = currentSort === field;
  return (
    <button
      type="button"
      className={cn("flex items-center gap-1 text-xs font-medium cursor-pointer select-none", isActive ? "text-foreground" : "text-muted-foreground")}
      onClick={() => onSort(field)}
      data-testid={`sort-${field}`}
    >
      {label}
      {isActive && (currentDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
    </button>
  );
}

export function RevenueMarginTab() {
  const [dateRange, setDateRange] = useState<DateRange>("last_30");
  const [marketFilter, setMarketFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("revenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedDriver, setExpandedDriver] = useState<string | null>(null);

  const { startDate, endDate } = getDateRange(dateRange);

  const { data, isLoading, isError, refetch } = useQuery<RevenueMarginResult>({
    queryKey: ["/api/corporate/scheduling/revenue-margin", startDate, endDate, marketFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate, endDate });
      if (marketFilter !== "all") params.set("market", marketFilter);
      const res = await fetch(`/api/corporate/scheduling/revenue-margin?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const drivers = data?.drivers || [];
  const summary = data?.summary;
  const banners = data?.banners || [];

  const markets = useMemo(() => {
    const ms = new Set<string>();
    drivers.forEach((d) => { if (d.market) ms.add(d.market); });
    return Array.from(ms).sort();
  }, [drivers]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const filtered = useMemo(() => {
    let list = [...drivers];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (d) =>
          d.driverName.toLowerCase().includes(q) ||
          (d.driverNumber && d.driverNumber.toLowerCase().includes(q)) ||
          (d.market && d.market.toLowerCase().includes(q))
      );
    }

    const mult = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      switch (sortField) {
        case "revenue": return (a.totalRevenue - b.totalRevenue) * mult;
        case "margin": return (a.grossMargin - b.grossMargin) * mult;
        case "marginPercent": return (a.marginPercent - b.marginPercent) * mult;
        case "moves": return (a.moveCount - b.moveCount) * mult;
        case "otPremium": return (a.estimatedOvertimePremium - b.estimatedOvertimePremium) * mult;
        case "revenuePerHour": return (a.revenuePerHour - b.revenuePerHour) * mult;
        default: return 0;
      }
    });
    return list;
  }, [drivers, searchQuery, sortField, sortDir]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm" data-testid="error-revenue-margin">
        <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
        <span className="text-muted-foreground">Unable to load revenue and margin data.</span>
        <Button variant="ghost" size="sm" className="h-auto p-0 text-sm" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="card-revenue-margin">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-bold" data-testid="text-revenue-margin-title">Revenue & Margin Analysis</h2>
            <Badge variant="outline" data-testid="badge-advisory">Advisory Only</Badge>
          </div>
          <p className="text-muted-foreground mt-1">Financial impact of scheduling decisions across drivers</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)} data-testid="select-date-range-rev">
            <SelectTrigger className="w-[140px]" data-testid="select-date-range-rev">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="last_week">Last Week</SelectItem>
              <SelectItem value="last_30">Last 30 Days</SelectItem>
              <SelectItem value="last_90">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>

          <Select value={marketFilter} onValueChange={setMarketFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-market-filter-rev">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Markets</SelectItem>
              {markets.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {banners.length > 0 && (
        <div className="space-y-3" data-testid="section-banners">
          {banners.map((banner, i) => (
            <Alert key={i} variant={banner.severity === "warning" ? "destructive" : "default"} data-testid={`banner-${banner.type}`}>
              {banner.severity === "warning" ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <Info className="h-4 w-4" />
              )}
              <AlertTitle className="flex items-center gap-2 flex-wrap">
                {banner.title}
                <Badge variant="outline">{banner.metric}</Badge>
              </AlertTitle>
              <AlertDescription>{banner.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <Card data-testid="card-total-revenue">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <DollarSign className="h-3.5 w-3.5" />Revenue
              </div>
              <div className="text-lg font-bold" data-testid="text-total-revenue">{formatCurrency(summary.totalRevenue)}</div>
            </CardContent>
          </Card>
          <Card data-testid="card-total-cost">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <TrendingDown className="h-3.5 w-3.5" />Cost
              </div>
              <div className="text-lg font-bold" data-testid="text-total-cost">{formatCurrency(summary.totalCost)}</div>
            </CardContent>
          </Card>
          <Card data-testid="card-gross-margin">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <TrendingUp className="h-3.5 w-3.5" />Gross Margin
              </div>
              <div className="text-lg font-bold" data-testid="text-gross-margin">{formatCurrency(summary.totalGrossMargin)}</div>
              <div className="text-xs text-muted-foreground">{summary.overallMarginPercent}%</div>
            </CardContent>
          </Card>
          <Card data-testid="card-ot-premium">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Clock className="h-3.5 w-3.5" />OT Premium
              </div>
              <div className="text-lg font-bold" data-testid="text-ot-premium">{formatCurrency(summary.totalOvertimePremium)}</div>
              <div className="text-xs text-muted-foreground">est. overtime cost</div>
            </CardContent>
          </Card>
          <Card data-testid="card-margin-after-ot">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Percent className="h-3.5 w-3.5" />After OT
              </div>
              <div className="text-lg font-bold" data-testid="text-margin-after-ot">{summary.marginPercentAfterOT}%</div>
              <div className="text-xs text-muted-foreground">{formatCurrency(summary.marginAfterOT)}</div>
            </CardContent>
          </Card>
          <Card data-testid="card-drivers-with-moves">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Users className="h-3.5 w-3.5" />Drivers
              </div>
              <div className="text-lg font-bold" data-testid="text-drivers-moves">{summary.driversWithMoves}/{summary.totalDrivers}</div>
              <div className="text-xs text-muted-foreground">with moves</div>
            </CardContent>
          </Card>
          <Card data-testid="card-flagged-count">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <AlertTriangle className="h-3.5 w-3.5" />Flagged
              </div>
              <div className="text-lg font-bold" data-testid="text-flagged">{summary.flaggedDrivers}</div>
              <div className="text-xs text-muted-foreground">attention needed</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card data-testid="card-driver-table">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
          <div>
            <CardTitle className="text-lg">Driver Financial Breakdown</CardTitle>
            <CardDescription>{filtered.length} drivers</CardDescription>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search drivers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-drivers-rev"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <div className="min-w-[800px]">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1.5fr_auto] gap-2 px-4 py-2 border-b bg-muted/50 text-xs font-medium text-muted-foreground sticky top-0 z-10">
                <div data-testid="col-header-driver">Driver</div>
                <SortHeader label="Revenue" field="revenue" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Margin" field="margin" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Margin %" field="marginPercent" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Moves" field="moves" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="OT Impact" field="otPremium" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                <div>Margin Bar</div>
                <div className="w-6" />
              </div>

              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                  <Truck className="h-10 w-10 mb-3 opacity-50" />
                  <p className="text-sm font-medium">No drivers found</p>
                  <p className="text-xs">Adjust filters or date range</p>
                </div>
              ) : (
                filtered.map((driver) => (
                  <div key={driver.driverId} data-testid={`row-driver-rev-${driver.driverId}`}>
                    <div
                      role="button"
                      tabIndex={0}
                      className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1.5fr_auto] gap-2 px-4 py-3 border-b hover-elevate cursor-pointer items-center"
                      onClick={() => setExpandedDriver(expandedDriver === driver.driverId ? null : driver.driverId)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandedDriver(expandedDriver === driver.driverId ? null : driver.driverId);
                        }
                      }}
                      data-testid={`button-expand-rev-${driver.driverId}`}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-sm" data-testid={`text-driver-name-rev-${driver.driverId}`}>{driver.driverName}</span>
                        <div className="flex items-center gap-1 flex-wrap">
                          {driver.driverNumber && (
                            <span className="text-xs text-muted-foreground">#{driver.driverNumber}</span>
                          )}
                          {driver.market && (
                            <span className="text-xs text-muted-foreground">{driver.market}</span>
                          )}
                          {driver.flags.map((flag, i) => (
                            <FlagBadge key={`${flag.type}-${i}`} flag={flag} />
                          ))}
                        </div>
                      </div>
                      <div className="text-sm font-medium" data-testid={`text-revenue-${driver.driverId}`}>{formatCurrency(driver.totalRevenue)}</div>
                      <div className={cn("text-sm font-medium", driver.grossMargin < 0 && "text-destructive")} data-testid={`text-margin-${driver.driverId}`}>
                        {formatCurrency(driver.grossMargin)}
                      </div>
                      <div className={cn("text-sm", driver.marginPercent < 15 && "text-destructive")} data-testid={`text-margin-pct-${driver.driverId}`}>
                        {driver.marginPercent}%
                      </div>
                      <div className="text-sm" data-testid={`text-moves-${driver.driverId}`}>{driver.moveCount}</div>
                      <div className="text-sm text-muted-foreground" data-testid={`text-ot-impact-${driver.driverId}`}>
                        {driver.estimatedOvertimePremium > 0 ? formatCurrency(driver.estimatedOvertimePremium) : "-"}
                      </div>
                      <MarginBar percent={driver.marginPercent} afterOT={driver.marginPercentAfterOT} driverId={driver.driverId} />
                      <div className="w-6 flex items-center justify-center">
                        {expandedDriver === driver.driverId ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {expandedDriver === driver.driverId && (
                      <div className="px-6 py-4 border-b bg-muted/30" data-testid={`detail-panel-rev-${driver.driverId}`}>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Total Revenue</div>
                            <div className="text-sm font-medium">{formatCurrencyFull(driver.totalRevenue)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Total Cost</div>
                            <div className="text-sm font-medium">{formatCurrencyFull(driver.totalCost)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Gross Margin</div>
                            <div className={cn("text-sm font-medium", driver.grossMargin < 0 && "text-destructive")}>
                              {formatCurrencyFull(driver.grossMargin)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Margin %</div>
                            <div className={cn("text-sm font-medium", driver.marginPercent < 15 && "text-destructive")}>
                              {driver.marginPercent}%
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Avg Revenue/Move</div>
                            <div className="text-sm font-medium">{formatCurrencyFull(driver.avgRevenuePerMove)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Avg Margin/Move</div>
                            <div className="text-sm font-medium">{formatCurrencyFull(driver.avgMarginPerMove)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Revenue/Hour</div>
                            <div className="text-sm font-medium">{formatCurrencyFull(driver.revenuePerHour)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Scheduled Hours</div>
                            <div className="text-sm font-medium">{driver.scheduledHours}h</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Overtime Shifts</div>
                            <div className="text-sm font-medium">{driver.overtimeShifts}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Est. OT Premium</div>
                            <div className="text-sm font-medium">{formatCurrencyFull(driver.estimatedOvertimePremium)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Margin After OT</div>
                            <div className={cn("text-sm font-medium", driver.marginAfterOT < 0 && "text-destructive")}>
                              {formatCurrencyFull(driver.marginAfterOT)} ({driver.marginPercentAfterOT}%)
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Move Count</div>
                            <div className="text-sm font-medium">{driver.moveCount}</div>
                          </div>
                        </div>

                        {driver.flags.length > 0 && (
                          <div className="mt-4 space-y-2">
                            <div className="text-xs font-medium text-muted-foreground">Flags & Notes</div>
                            {driver.flags.map((flag, i) => (
                              <div
                                key={`${flag.type}-${i}`}
                                className="flex items-start gap-2 text-sm"
                                data-testid={`flag-detail-rev-${driver.driverId}-${flag.type}`}
                              >
                                {flag.severity === "critical" ? (
                                  <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                                ) : flag.severity === "warning" ? (
                                  <AlertTriangle className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                                ) : (
                                  <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                                )}
                                <span>{flag.detail}</span>
                              </div>
                            ))}
                          </div>
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
    </div>
  );
}
