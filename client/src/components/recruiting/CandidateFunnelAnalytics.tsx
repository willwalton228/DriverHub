/**
 * Candidate Conversion Funnel Analytics — Ticket 30
 *
 * Displays an 8-stage driver recruiting funnel with:
 *   - Stage-by-stage bar chart with absolute counts and conversion rates
 *   - Biggest drop-off identification
 *   - Dimension breakdown table (Market / Role Type / Source / CDL / Intake Path)
 *   - Time period filter (30d / 90d / 180d / All Time)
 *   - Market filter for geographic slicing
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  TrendingDown, TrendingUp, Users, ArrowRight, BarChart3,
  MapPin, Layers, Megaphone, Car, GitBranch, ChevronDown,
  ChevronUp, AlertTriangle,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface FunnelStage {
  stage: string;
  label: string;
  count: number;
  conversionFromPrevious: number | null;
  conversionFromApplied: number | null;
  dropOff: number | null;
}

interface FunnelSummary {
  totalApplied: number;
  stages: FunnelStage[];
  generatedAt: string;
  dateRange: { start: string | null; end: string | null };
}

interface FunnelBreakdownRow {
  dimensionValue: string;
  applied: number;
  recruiterReviewed: number;
  interviewScheduled: number;
  interviewCompleted: number;
  screeningTriggered: number;
  screeningPassed: number;
  offerSent: number;
  offerAccepted: number;
  conversionRate: number;
}

interface FunnelBreakdown {
  dimension: string;
  dimensionLabel: string;
  rows: FunnelBreakdownRow[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DATE_RANGES = [
  { value: "30",  label: "Last 30 Days" },
  { value: "90",  label: "Last 90 Days" },
  { value: "180", label: "Last 6 Months" },
  { value: "all", label: "All Time" },
];

const DIMENSIONS = [
  { value: "market",    label: "Market",      icon: MapPin },
  { value: "role_type", label: "Role Type",   icon: Layers },
  { value: "source",    label: "Ad Source",   icon: Megaphone },
  { value: "cdl",       label: "CDL Status",  icon: Car },
];

const STAGE_COLORS: Record<string, string> = {
  applied:             "bg-slate-500",
  recruiter_reviewed:  "bg-blue-500",
  interview_scheduled: "bg-indigo-500",
  interview_completed: "bg-violet-500",
  screening_triggered: "bg-amber-500",
  screening_passed:    "bg-orange-500",
  offer_sent:          "bg-emerald-500",
  offer_accepted:      "bg-green-600",
};

const STAGE_LABEL_SHORT: Record<string, string> = {
  applied:             "Applied",
  recruiter_reviewed:  "Reviewed",
  interview_scheduled: "Interviewed",
  interview_completed: "Int. Done",
  screening_triggered: "Screening",
  screening_passed:    "Cleared",
  offer_sent:          "Offered",
  offer_accepted:      "Hired",
};

const ROLE_TYPE_LABELS: Record<string, string> = {
  vehicle_movement: "Vehicle Movement",
  shuttle_driver:   "Shuttle Driver",
  dispatcher:       "Dispatcher",
  fleet_lead:       "Fleet Lead",
  other:            "Other",
};

const SOURCE_LABELS: Record<string, string> = {
  indeed:         "Indeed",
  craigslist:     "Craigslist",
  facebook:       "Facebook",
  facebook_group: "Facebook Group",
  instagram:      "Instagram",
  tiktok:         "TikTok",
  referral:       "Referral",
  direct:         "Direct",
  website:        "Website",
  job_board:      "Job Board",
  social_media:   "Social Media",
  career_fair:    "Career Fair",
  internal:       "Internal",
  agency:         "Agency",
  other:          "Other",
};

function formatDimensionValue(dimension: string, value: string): string {
  if (dimension === "role_type") return ROLE_TYPE_LABELS[value] ?? value;
  if (dimension === "source")    return SOURCE_LABELS[value]    ?? value;
  return value;
}

// ── Helper: build date params from range string ───────────────────────────────

function buildDateParams(range: string): { start?: string; end?: string } {
  if (range === "all") return {};
  const days = parseInt(range, 10);
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { start: start.toISOString().split("T")[0] };
}

// ── Funnel Bar Chart ──────────────────────────────────────────────────────────

function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  // Find the biggest absolute drop-off stage
  const biggestDropStage = stages.reduce(
    (worst, s, i) => {
      if (i === 0 || s.dropOff == null) return worst;
      return s.dropOff > (worst?.dropOff ?? 0) ? s : worst;
    },
    null as FunnelStage | null
  );

  return (
    <div className="space-y-1.5">
      {stages.map((stage, i) => {
        const barWidth = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
        const isBiggestDrop = biggestDropStage?.stage === stage.stage && stage.dropOff != null && stage.dropOff > 0;
        const colorClass = STAGE_COLORS[stage.stage] ?? "bg-slate-400";

        return (
          <div key={stage.stage} className="group" data-testid={`funnel-stage-${stage.stage}`}>
            <div className="flex items-center gap-3">
              {/* Stage label */}
              <div className="w-32 text-right shrink-0">
                <span className="text-xs text-muted-foreground">{stage.label}</span>
              </div>

              {/* Bar */}
              <div className="flex-1 relative h-7 bg-muted/50 rounded-sm overflow-hidden">
                <div
                  className={`h-full rounded-sm ${colorClass} transition-all duration-500`}
                  style={{ width: `${barWidth}%` }}
                />
                {/* Count overlay */}
                <div className="absolute inset-0 flex items-center px-2 gap-2">
                  <span className="text-xs font-semibold text-white drop-shadow-sm tabular-nums">
                    {stage.count.toLocaleString()}
                  </span>
                  {stage.conversionFromApplied != null && (
                    <span className="text-xs text-white/80 tabular-nums">
                      ({stage.conversionFromApplied}% of applied)
                    </span>
                  )}
                </div>
              </div>

              {/* Conversion from previous */}
              <div className="w-24 text-right shrink-0 flex items-center justify-end gap-1">
                {i === 0 ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : stage.conversionFromPrevious != null ? (
                  <>
                    {isBiggestDrop && (
                      <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0" />
                    )}
                    <span
                      className={`text-xs font-medium tabular-nums ${
                        stage.conversionFromPrevious >= 70
                          ? "text-green-600 dark:text-green-400"
                          : stage.conversionFromPrevious >= 40
                          ? "text-yellow-600 dark:text-yellow-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {stage.conversionFromPrevious}%
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            </div>

            {/* Drop indicator between stages */}
            {i < stages.length - 1 && stage.dropOff != null && stage.dropOff > 0 && (
              <div className="flex items-center gap-3 ml-35 pl-36">
                <div className="w-32 shrink-0" />
                <div className="flex items-center gap-1 py-0.5 text-xs text-muted-foreground">
                  <TrendingDown className="h-3 w-3" />
                  <span>{stage.dropOff.toLocaleString()} dropped</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── KPI Summary Strip ─────────────────────────────────────────────────────────

function KpiStrip({ stages }: { stages: FunnelStage[] }) {
  const applied = stages.find((s) => s.stage === "applied")?.count ?? 0;
  const hired   = stages.find((s) => s.stage === "offer_accepted")?.count ?? 0;
  const offered = stages.find((s) => s.stage === "offer_sent")?.count ?? 0;
  const screening = stages.find((s) => s.stage === "screening_triggered")?.count ?? 0;

  const overallConversion = applied > 0 ? ((hired / applied) * 100).toFixed(1) : "0.0";
  const offerAcceptRate   = offered > 0 ? Math.round((hired / offered) * 100) : 0;
  const screeningRate     = applied > 0 ? Math.round((screening / applied) * 100) : 0;

  const kpis = [
    { label: "Total Applied",      value: applied.toLocaleString(), icon: Users,         color: "text-foreground" },
    { label: "Hired",              value: hired.toLocaleString(),   icon: TrendingUp,    color: "text-green-600 dark:text-green-400" },
    { label: "End-to-End Rate",    value: `${overallConversion}%`,  icon: BarChart3,     color: applied > 0 && parseFloat(overallConversion) >= 5 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400" },
    { label: "Offer Accept Rate",  value: `${offerAcceptRate}%`,    icon: TrendingUp,    color: offerAcceptRate >= 70 ? "text-green-600 dark:text-green-400" : "text-yellow-600 dark:text-yellow-400" },
    { label: "Reach Screening",    value: `${screeningRate}%`,      icon: GitBranch,     color: "text-muted-foreground" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <div key={kpi.label} className="text-center p-3 rounded-lg bg-muted/50">
            <div className={`text-2xl font-bold tabular-nums ${kpi.color}`}>{kpi.value}</div>
            <div className="flex items-center justify-center gap-1 mt-0.5">
              <Icon className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{kpi.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Breakdown Table ───────────────────────────────────────────────────────────

const BREAKDOWN_COLS: { key: keyof FunnelBreakdownRow; short: string }[] = [
  { key: "applied",             short: "Applied" },
  { key: "recruiterReviewed",   short: "Reviewed" },
  { key: "interviewScheduled",  short: "Int. Sched." },
  { key: "interviewCompleted",  short: "Int. Done" },
  { key: "screeningTriggered",  short: "Screening" },
  { key: "screeningPassed",     short: "Cleared" },
  { key: "offerSent",           short: "Offered" },
  { key: "offerAccepted",       short: "Hired" },
  { key: "conversionRate",      short: "Conv. %" },
];

function BreakdownTable({ breakdown, dimension }: { breakdown: FunnelBreakdown; dimension: string }) {
  const [sortCol, setSortCol] = useState<keyof FunnelBreakdownRow>("applied");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const sorted = useMemo(() => {
    return [...breakdown.rows].sort((a, b) => {
      const aVal = (a[sortCol] as number) ?? 0;
      const bVal = (b[sortCol] as number) ?? 0;
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });
  }, [breakdown.rows, sortCol, sortDir]);

  function toggleSort(col: keyof FunnelBreakdownRow) {
    if (col === sortCol) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortCol(col); setSortDir("desc"); }
  }

  if (breakdown.rows.length === 0) {
    return (
      <div className="flex flex-col items-center py-10 text-muted-foreground gap-2">
        <BarChart3 className="h-8 w-8 opacity-30" />
        <p className="text-sm">No data available for this breakdown.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[700px]">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 pr-4 font-medium text-muted-foreground whitespace-nowrap">
              {breakdown.dimensionLabel}
            </th>
            {BREAKDOWN_COLS.map((col) => (
              <th
                key={col.key}
                className="text-right py-2 px-2 font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none"
                onClick={() => toggleSort(col.key)}
                data-testid={`sort-col-${col.key}`}
              >
                <span className="flex items-center justify-end gap-1">
                  {col.short}
                  {sortCol === col.key ? (
                    sortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
                  ) : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const label = formatDimensionValue(dimension, row.dimensionValue);
            return (
              <tr
                key={row.dimensionValue}
                className="border-b last:border-0 hover-elevate"
                data-testid={`breakdown-row-${row.dimensionValue}`}
              >
                <td className="py-2.5 pr-4 font-medium max-w-[160px] truncate">{label}</td>
                {BREAKDOWN_COLS.map((col) => {
                  const val = row[col.key] as number;
                  const isConv = col.key === "conversionRate";
                  return (
                    <td key={col.key} className="py-2.5 px-2 text-right tabular-nums">
                      {isConv ? (
                        <span
                          className={`text-xs font-semibold ${
                            val >= 5
                              ? "text-green-600 dark:text-green-400"
                              : val > 0
                              ? "text-yellow-600 dark:text-yellow-400"
                              : "text-muted-foreground"
                          }`}
                        >
                          {val}%
                        </span>
                      ) : (
                        <span className={val === 0 ? "text-muted-foreground/50" : ""}>
                          {val.toLocaleString()}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Drop-Off Insight ──────────────────────────────────────────────────────────

function DropOffInsight({ stages }: { stages: FunnelStage[] }) {
  const withDropOff = stages
    .filter((s, i) => i > 0 && s.dropOff != null && s.dropOff > 0 && s.conversionFromPrevious != null)
    .sort((a, b) => (b.dropOff ?? 0) - (a.dropOff ?? 0))
    .slice(0, 3);

  if (withDropOff.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Top Drop-Off Points</p>
      {withDropOff.map((stage) => (
        <div
          key={stage.stage}
          className="flex items-center gap-3 p-2.5 rounded-md border bg-muted/30"
          data-testid={`drop-off-insight-${stage.stage}`}
        >
          <TrendingDown className="h-4 w-4 text-red-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium">At {stage.label}:</span>
            <span className="text-sm text-muted-foreground ml-1.5">
              {stage.dropOff?.toLocaleString()} candidates dropped ({100 - (stage.conversionFromPrevious ?? 0)}% fall-off)
            </span>
          </div>
          <Badge
            variant="outline"
            className="text-xs shrink-0 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"
          >
            {stage.conversionFromPrevious}% pass
          </Badge>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface CandidateFunnelAnalyticsProps {
  /** When embedded in Reports tab, show a compact title */
  embedded?: boolean;
}

export function CandidateFunnelAnalytics({ embedded = false }: CandidateFunnelAnalyticsProps) {
  const [dateRange, setDateRange]   = useState("all");
  const [market, setMarket]         = useState<string>("all");
  const [dimension, setDimension]   = useState("market");

  const dateParams = useMemo(() => buildDateParams(dateRange), [dateRange]);
  const marketParam = market !== "all" ? market : undefined;

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: marketsData } = useQuery<{ markets: string[] }>({
    queryKey: ["/api/recruiting/funnel/markets"],
  });
  const markets = marketsData?.markets ?? [];

  const { data: summary, isLoading: summaryLoading } = useQuery<FunnelSummary>({
    queryKey: ["/api/recruiting/funnel/summary", market, dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (marketParam) params.set("market", marketParam);
      if (dateParams.start) params.set("start", dateParams.start);
      if (dateParams.end) params.set("end", dateParams.end);
      const res = await fetch(`/api/recruiting/funnel/summary?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load funnel summary");
      return res.json();
    },
  });

  const { data: breakdown, isLoading: breakdownLoading } = useQuery<FunnelBreakdown>({
    queryKey: ["/api/recruiting/funnel/breakdown", dimension, dateRange],
    queryFn: async () => {
      const params = new URLSearchParams({ dimension });
      if (dateParams.start) params.set("start", dateParams.start);
      if (dateParams.end) params.set("end", dateParams.end);
      const res = await fetch(`/api/recruiting/funnel/breakdown?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load funnel breakdown");
      return res.json();
    },
  });

  const stages = summary?.stages ?? [];

  return (
    <div className="space-y-6" data-testid="candidate-funnel-analytics">
      {/* Header + Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <BarChart3 className="h-5 w-5 text-primary shrink-0" />
          <div>
            <h3 className={`font-semibold leading-tight ${embedded ? "text-base" : "text-lg"}`}>
              Candidate Conversion Funnel
            </h3>
            <p className="text-sm text-muted-foreground">
              Applied through offer acceptance — driver recruiting stages
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {markets.length > 0 && (
            <Select value={market} onValueChange={setMarket}>
              <SelectTrigger className="w-[160px]" data-testid="select-funnel-market">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Markets</SelectItem>
                {markets.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[148px]" data-testid="select-funnel-date-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Strip */}
      <Card>
        <CardContent className="pt-4">
          {summaryLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
            </div>
          ) : (
            <KpiStrip stages={stages} />
          )}
        </CardContent>
      </Card>

      {/* Funnel Chart */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Stage-by-Stage Funnel</CardTitle>
          </div>
          <CardDescription>
            Bar width is relative to applied total · Right column shows conversion from previous stage
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summaryLoading ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : stages.length > 0 ? (
            <FunnelChart stages={stages} />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No application data yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Drop-off insights */}
      {!summaryLoading && stages.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Drop-Off Analysis</CardTitle>
            </div>
            <CardDescription>Stages with the highest candidate fall-off rate</CardDescription>
          </CardHeader>
          <CardContent>
            <DropOffInsight stages={stages} />
          </CardContent>
        </Card>
      )}

      {/* Dimension Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm">Breakdown by Dimension</CardTitle>
              </div>
              <CardDescription>Identify which segments have the best or worst conversion</CardDescription>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {DIMENSIONS.map((d) => {
                const Icon = d.icon;
                return (
                  <Button
                    key={d.value}
                    size="sm"
                    variant={dimension === d.value ? "default" : "outline"}
                    onClick={() => setDimension(d.value)}
                    data-testid={`btn-dimension-${d.value}`}
                  >
                    <Icon className="h-3.5 w-3.5 mr-1.5" />
                    {d.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {breakdownLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : breakdown ? (
            <BreakdownTable breakdown={breakdown} dimension={dimension} />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Select a dimension above.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
