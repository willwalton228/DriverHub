import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BarChart3, Users, TrendingUp, Target, Clock, ChevronDown, ChevronUp,
  Info, Loader2, Award, ArrowUpDown,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SourceRow {
  source: string;
  applicantCount: number;
  interviewedCount: number;
  screeningPassedCount: number;
  hiredCount: number;
  avgDaysToHire: number | null;
  interviewRate: number;
  screeningPassRate: number;
  hireRate: number;
  firstApplicationAt: string | null;
  latestApplicationAt: string | null;
}

interface MarketBreakdown {
  market: string;
  source: string;
  applicant_count: number;
  hired_count: number;
}

interface TrendRow {
  month: string;
  source: string;
  applicant_count: number;
}

interface SourcePerfResponse {
  sources: SourceRow[];
  marketBreakdown: MarketBreakdown[];
  trend: TrendRow[];
  summary: {
    totalApplicants: number;
    sourceCount: number;
    totalHires: number;
    marketCount: number;
  };
}

interface SourcePerformanceDashboardProps {
  requisitionId?: string;
  initialMarket?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  indeed:        "Indeed",
  craigslist:    "Craigslist",
  facebook:      "Facebook",
  facebook_group:"Facebook Group",
  instagram:     "Instagram",
  tiktok:        "TikTok",
  referral:      "Referral",
  direct:        "Direct / Walk-in",
  manual_import: "Manual Import",
  website:       "Company Website",
  job_board:     "Job Board",
  social_media:  "Social Media",
  career_fair:   "Career Fair",
  internal:      "Internal Transfer",
  agency:        "Staffing Agency",
  other:         "Other",
};

const SOURCE_COLOR: Record<string, string> = {
  indeed:        "bg-blue-600",
  craigslist:    "bg-purple-600",
  facebook:      "bg-blue-500",
  facebook_group:"bg-indigo-500",
  instagram:     "bg-pink-500",
  tiktok:        "bg-slate-700",
  referral:      "bg-green-500",
  direct:        "bg-cyan-500",
  manual_import: "bg-amber-500",
  website:       "bg-sky-500",
  job_board:     "bg-primary",
  social_media:  "bg-purple-500",
  career_fair:   "bg-amber-500",
  internal:      "bg-cyan-500",
  agency:        "bg-rose-500",
  other:         "bg-muted-foreground",
};

function RateBar({ value, max = 100, color = "bg-primary" }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums w-9 text-right">{value}%</span>
    </div>
  );
}

function rateColor(rate: number): string {
  if (rate >= 15) return "text-green-700 dark:text-green-400";
  if (rate >= 8) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

type SortKey = "source" | "applicantCount" | "interviewRate" | "screeningPassRate" | "hireRate" | "avgDaysToHire";
type SortDir = "asc" | "desc";

// ── Main Component ─────────────────────────────────────────────────────────────

export function SourcePerformanceDashboard({ requisitionId, initialMarket }: SourcePerformanceDashboardProps) {
  const [market, setMarket] = useState(initialMarket ?? "all");
  const [workerType, setWorkerType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("applicantCount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showMarketBreakdown, setShowMarketBreakdown] = useState(false);
  const [showTrend, setShowTrend] = useState(false);

  // Build query string
  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (market && market !== "all") p.set("market", market);
    if (workerType && workerType !== "all") p.set("workerType", workerType);
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    if (requisitionId) p.set("requisitionId", requisitionId);
    return p.toString();
  }, [market, workerType, dateFrom, dateTo, requisitionId]);

  const { data, isLoading } = useQuery<SourcePerfResponse>({
    queryKey: ["/api/recruiting/source-performance", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/source-performance?${queryParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load source performance");
      return res.json();
    },
  });

  const { data: markets = [] } = useQuery<string[]>({
    queryKey: ["/api/recruiting/source-performance/markets"],
    queryFn: async () => {
      const res = await fetch("/api/recruiting/source-performance/markets", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Sorted sources table
  const sortedSources = useMemo(() => {
    if (!data?.sources) return [];
    return [...data.sources].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc"
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
  }, [data?.sources, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortHeader({ label, field }: { label: string; field: SortKey }) {
    const active = sortKey === field;
    return (
      <button
        onClick={() => toggleSort(field)}
        className="flex items-center gap-1 text-xs font-medium hover:text-foreground transition-colors"
        data-testid={`sort-${field}`}
      >
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? "text-primary" : "text-muted-foreground"}`} />
      </button>
    );
  }

  const bestHireRateSource = sortedSources[0]
    ? [...(data?.sources ?? [])].sort((a, b) => b.hireRate - a.hireRate)[0]
    : null;

  // Market breakdown: group by market
  const marketGroups = useMemo(() => {
    if (!data?.marketBreakdown) return {};
    const groups: Record<string, MarketBreakdown[]> = {};
    for (const row of data.marketBreakdown) {
      if (!groups[row.market]) groups[row.market] = [];
      groups[row.market].push(row);
    }
    return groups;
  }, [data?.marketBreakdown]);

  // Trend: group by source, list months
  const trendBySources = useMemo(() => {
    if (!data?.trend) return {};
    const groups: Record<string, Record<string, number>> = {};
    for (const row of data.trend) {
      if (!groups[row.source]) groups[row.source] = {};
      groups[row.source][row.month] = Number(row.applicant_count);
    }
    return groups;
  }, [data?.trend]);

  const trendMonths = useMemo(() => {
    return [...new Set((data?.trend ?? []).map(r => r.month))].sort();
  }, [data?.trend]);

  return (
    <div className="space-y-4" data-testid="source-performance-dashboard">
      {/* ── Filter Bar ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Source Performance Tracker
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              Ticket 19
            </Badge>
          </div>
          <CardDescription>
            Compare which recruitment channels deliver the most applicants, interviews, and hires — broken down by market.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            {/* Market */}
            <div className="space-y-1">
              <Label className="text-xs">Market</Label>
              <Select value={market} onValueChange={setMarket}>
                <SelectTrigger className="w-40" data-testid="select-perf-market">
                  <SelectValue placeholder="All markets" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Markets</SelectItem>
                  {markets.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Worker type */}
            <div className="space-y-1">
              <Label className="text-xs">Worker Type</Label>
              <Select value={workerType} onValueChange={setWorkerType}>
                <SelectTrigger className="w-40" data-testid="select-perf-worker-type">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="W2_DRIVER">W2 Driver</SelectItem>
                  <SelectItem value="IC_DRIVER">IC Driver</SelectItem>
                  <SelectItem value="CORP_EMPLOYEE">Corp Employee</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date from */}
            <div className="space-y-1">
              <Label className="text-xs">Applied From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-38"
                data-testid="input-perf-date-from"
              />
            </div>

            {/* Date to */}
            <div className="space-y-1">
              <Label className="text-xs">Applied To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-38"
                data-testid="input-perf-date-to"
              />
            </div>

            {(dateFrom || dateTo || market !== "all" || workerType !== "all") && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setMarket("all"); setWorkerType("all"); setDateFrom(""); setDateTo(""); }}
                data-testid="button-perf-clear-filters"
              >
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Summary KPI Strip ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Applicants", value: data?.summary.totalApplicants ?? 0, icon: <Users className="h-4 w-4 text-muted-foreground" />, testid: "metric-total-applicants" },
          { label: "Sources Tracked", value: data?.summary.sourceCount ?? 0, icon: <Target className="h-4 w-4 text-muted-foreground" />, testid: "metric-source-count" },
          { label: "Total Hires", value: data?.summary.totalHires ?? 0, icon: <Award className="h-4 w-4 text-muted-foreground" />, testid: "metric-total-hires" },
          { label: "Markets Covered", value: data?.summary.marketCount ?? 0, icon: <TrendingUp className="h-4 w-4 text-muted-foreground" />, testid: "metric-market-count" },
        ].map(({ label, value, icon, testid }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{label}</span>
                {icon}
              </div>
              {isLoading ? (
                <Skeleton className="h-7 w-16 mt-1" />
              ) : (
                <div className="text-2xl font-bold mt-1" data-testid={testid}>{value.toLocaleString()}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Best Performer Callout ───────────────────────────────────────── */}
      {bestHireRateSource && bestHireRateSource.hiredCount > 0 && (
        <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm">
              <Award className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
              <span className="font-medium text-green-800 dark:text-green-300">Top Performer:</span>
              <span className="font-semibold">{SOURCE_LABELS[bestHireRateSource.source] ?? bestHireRateSource.source}</span>
              <span className="text-green-700 dark:text-green-400">— {bestHireRateSource.hireRate}% hire rate ({bestHireRateSource.hiredCount} hire{bestHireRateSource.hiredCount !== 1 ? "s" : ""} from {bestHireRateSource.applicantCount} applicant{bestHireRateSource.applicantCount !== 1 ? "s" : ""})</span>
              {bestHireRateSource.avgDaysToHire != null && (
                <span className="text-muted-foreground">· avg {bestHireRateSource.avgDaysToHire}d to hire</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Main Source Table ────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Channel Breakdown</CardTitle>
          <CardDescription className="text-xs">
            Click column headers to sort. Rates use stage history for accuracy — an applicant counts as "interviewed" if they ever reached the Screening stage.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Computing source metrics…</span>
            </div>
          ) : sortedSources.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <BarChart3 className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">No data for selected filters</p>
              <p className="text-xs text-muted-foreground mt-1">
                Applications need a source set on the candidate record. Try broadening your filters.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-44">
                      <SortHeader label="Source" field="source" />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortHeader label="Applicants" field="applicantCount" />
                    </TableHead>
                    <TableHead className="min-w-[140px]">
                      <div className="flex items-center gap-1">
                        <SortHeader label="Interview Rate" field="interviewRate" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">
                            % of applicants who reached Screening stage or beyond.
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableHead>
                    <TableHead className="min-w-[160px]">
                      <div className="flex items-center gap-1">
                        <SortHeader label="Screening Pass" field="screeningPassRate" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">
                            % of interviewed applicants who passed screening (reached Docs Pending or beyond).
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableHead>
                    <TableHead className="min-w-[130px]">
                      <div className="flex items-center gap-1">
                        <SortHeader label="Hire Rate" field="hireRate" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">
                            % of all applicants from this source who reached Approved or Ready to Work.
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableHead>
                    <TableHead className="text-right">
                      <SortHeader label="Avg Days to Hire" field="avgDaysToHire" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedSources.map((row) => {
                    const dotColor = SOURCE_COLOR[row.source] ?? "bg-muted-foreground";
                    const label = SOURCE_LABELS[row.source] ?? row.source;
                    const maxApplicants = Math.max(...sortedSources.map(s => s.applicantCount), 1);
                    return (
                      <TableRow key={row.source} data-testid={`row-source-${row.source}`}>
                        {/* Source name */}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${dotColor}`} />
                            <span className="text-sm font-medium leading-tight">{label}</span>
                          </div>
                          <div className="ml-4.5 mt-0.5">
                            <div className="h-1 bg-muted rounded-full overflow-hidden mt-1">
                              <div
                                className={`h-full rounded-full ${dotColor} opacity-60`}
                                style={{ width: `${Math.round((row.applicantCount / maxApplicants) * 100)}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>

                        {/* Applicant count */}
                        <TableCell className="text-right tabular-nums font-semibold" data-testid={`text-applicants-${row.source}`}>
                          {row.applicantCount.toLocaleString()}
                          {row.hiredCount > 0 && (
                            <div className="text-xs text-muted-foreground font-normal">
                              {row.hiredCount} hired
                            </div>
                          )}
                        </TableCell>

                        {/* Interview rate */}
                        <TableCell data-testid={`text-interview-rate-${row.source}`}>
                          <RateBar value={row.interviewRate} color="bg-blue-500" />
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {row.interviewedCount} of {row.applicantCount}
                          </div>
                        </TableCell>

                        {/* Screening pass rate */}
                        <TableCell data-testid={`text-screening-rate-${row.source}`}>
                          <RateBar value={row.screeningPassRate} color="bg-amber-500" />
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {row.screeningPassedCount} of {row.interviewedCount}
                          </div>
                        </TableCell>

                        {/* Hire rate */}
                        <TableCell data-testid={`text-hire-rate-${row.source}`}>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-green-500" style={{ width: `${row.hireRate}%` }} />
                            </div>
                            <span className={`text-xs tabular-nums w-9 text-right font-semibold ${rateColor(row.hireRate)}`}>
                              {row.hireRate}%
                            </span>
                          </div>
                        </TableCell>

                        {/* Avg days to hire */}
                        <TableCell className="text-right" data-testid={`text-days-hire-${row.source}`}>
                          {row.avgDaysToHire != null ? (
                            <div className="flex items-center justify-end gap-1">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span className="tabular-nums text-sm">{row.avgDaysToHire}d</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Market Breakdown (collapsible) ──────────────────────────────── */}
      {Object.keys(marketGroups).length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <button
              className="flex w-full items-center justify-between text-left"
              onClick={() => setShowMarketBreakdown(v => !v)}
              data-testid="button-toggle-market-breakdown"
            >
              <div>
                <CardTitle className="text-sm">By Market</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Source performance segmented by recruitment market
                </CardDescription>
              </div>
              {showMarketBreakdown ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
            </button>
          </CardHeader>
          {showMarketBreakdown && (
            <CardContent className="pt-4">
              <div className="space-y-6">
                {Object.entries(marketGroups).map(([mkt, rows]) => (
                  <div key={mkt} data-testid={`market-group-${mkt}`}>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{mkt}</h4>
                    <div className="space-y-2">
                      {rows.map(row => {
                        const dotColor = SOURCE_COLOR[row.source] ?? "bg-muted-foreground";
                        const maxInMarket = Math.max(...rows.map(r => Number(r.applicant_count)), 1);
                        const hireRate = row.applicant_count > 0
                          ? Math.round((Number(row.hired_count) / Number(row.applicant_count)) * 100)
                          : 0;
                        return (
                          <div key={row.source} className="flex items-center gap-3" data-testid={`market-row-${mkt}-${row.source}`}>
                            <div className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
                            <span className="text-xs w-36 shrink-0">{SOURCE_LABELS[row.source] ?? row.source}</span>
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${dotColor}`}
                                style={{ width: `${Math.round((Number(row.applicant_count) / maxInMarket) * 100)}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums w-14 text-right">
                              {Number(row.applicant_count).toLocaleString()} apps
                            </span>
                            <span className={`text-xs tabular-nums w-14 text-right font-medium ${rateColor(hireRate)}`}>
                              {hireRate}% hired
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* ── Monthly Trend (collapsible) ──────────────────────────────────── */}
      {trendMonths.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <button
              className="flex w-full items-center justify-between text-left"
              onClick={() => setShowTrend(v => !v)}
              data-testid="button-toggle-trend"
            >
              <div>
                <CardTitle className="text-sm">Monthly Volume Trend</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Applicants per source by month — shows which channels are growing or declining
                </CardDescription>
              </div>
              {showTrend ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
            </button>
          </CardHeader>
          {showTrend && (
            <CardContent className="pt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">Source</TableHead>
                    {trendMonths.map(m => (
                      <TableHead key={m} className="text-right text-xs">
                        {new Date(m + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(trendBySources).map(([src, monthMap]) => (
                    <TableRow key={src} data-testid={`trend-row-${src}`}>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className={`h-2 w-2 rounded-full shrink-0 ${SOURCE_COLOR[src] ?? "bg-muted-foreground"}`} />
                          {SOURCE_LABELS[src] ?? src}
                        </div>
                      </TableCell>
                      {trendMonths.map(m => (
                        <TableCell key={m} className="text-right tabular-nums text-xs">
                          {monthMap[m] ?? "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>
      )}

      {/* ── Methodology Note ────────────────────────────────────────────── */}
      <p className="text-[11px] text-muted-foreground px-1">
        Source data comes from the candidate record at application time. Interview, screening pass, and hire rates use cumulative stage history — a candidate rejected after reaching an advanced stage is still counted at that stage. This data feeds AI ad source recommendations.
      </p>
    </div>
  );
}
