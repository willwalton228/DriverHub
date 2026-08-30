import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  DollarSign, AlertTriangle, TrendingDown,
  MapPin, ChevronRight, CheckCircle2,
} from "lucide-react";

// ── Shared pill ───────────────────────────────────────────────────────────────
const PILL = "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap";

// ── Types ─────────────────────────────────────────────────────────────────────
interface CampaignImpact {
  requisitionId:    string;
  market:           string;
  requiredHeadcount: number;
  filledPositions:  number;
  gapCount:         number;
  revenuePerDriver: number;
  weeklyAtRisk:     number;
  targetDate:       string | null;
  daysUntilTarget:  number | null;
}

interface MarketImpact {
  market:        string;
  totalDemand:   number;
  totalFilled:   number;
  totalGap:      number;
  weeklyAtRisk:  number;
  campaigns:     CampaignImpact[];
}

// ── Currency formatting ───────────────────────────────────────────────────────
function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="py-6 text-center space-y-2">
      <CheckCircle2 className="h-7 w-7 text-green-500 mx-auto" />
      <p className="text-sm font-medium text-muted-foreground">No revenue at risk</p>
      <p className="text-xs text-muted-foreground/60">All recruiting positions are fully staffed.</p>
    </div>
  );
}

// ── Market row ────────────────────────────────────────────────────────────────
function MarketRow({ row }: { row: MarketImpact }) {
  const fillPct = row.totalDemand > 0 ? Math.round((row.totalFilled / row.totalDemand) * 100) : 0;
  const urgency = row.daysUntilTarget != null && row.daysUntilTarget <= 14 ? "urgent" : "normal";
  // Find nearest target date
  const nearest = row.campaigns
    .filter(c => c.daysUntilTarget != null)
    .sort((a, b) => (a.daysUntilTarget ?? 999) - (b.daysUntilTarget ?? 999))[0];

  return (
    <div className="py-2.5 border-b border-border last:border-0 space-y-1.5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{row.market}</span>
          {urgency === "urgent" && nearest && (
            <span className={`${PILL} bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 shrink-0`}>
              <AlertTriangle className="h-2.5 w-2.5 mr-1" />
              {nearest.daysUntilTarget}d left
            </span>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums">
            {fmtCurrency(row.weeklyAtRisk)}<span className="text-[10px] font-normal text-muted-foreground">/wk</span>
          </p>
          <p className="text-[10px] text-muted-foreground">{row.totalGap} unfilled</p>
        </div>
      </div>

      {/* Fill progress bar */}
      <div className="space-y-0.5">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{row.totalFilled} filled / {row.totalDemand} needed</span>
          <span>{fillPct}%</span>
        </div>
        <Progress
          value={fillPct}
          className="h-1.5"
        />
      </div>
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────
export function RecruitingRevenueWidget() {
  const { data = [], isLoading } = useQuery<MarketImpact[]>({
    queryKey: ["/api/recruiting/revenue-impact"],
    queryFn:  () =>
      fetch("/api/recruiting/revenue-impact")
        .then(r => r.ok ? r.json() : [])
        .then((rows: any[]) =>
          rows.map(r => ({
            ...r,
            totalDemand:  Number(r.totalDemand  ?? 0),
            totalFilled:  Number(r.totalFilled  ?? 0),
            totalGap:     Number(r.totalGap     ?? 0),
            weeklyAtRisk: Number(r.weeklyAtRisk ?? 0),
          }))
        ),
    staleTime: 120_000,
  });

  const totalWeeklyAtRisk = data.reduce((s, r) => s + r.weeklyAtRisk, 0);
  const totalGap          = data.reduce((s, r) => s + r.totalGap, 0);
  const marketsAtRisk     = data.length;

  return (
    <Card data-testid="widget-recruiting-revenue">
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap pb-2 pt-4 px-4">
        <div className="flex items-center gap-2 min-w-0">
          <DollarSign className="h-4 w-4 text-primary shrink-0" />
          <CardTitle className="text-sm font-semibold">Recruiting Revenue Impact</CardTitle>
          {!isLoading && marketsAtRisk > 0 && (
            <Badge variant="destructive" className="text-[10px]">
              {marketsAtRisk} market{marketsAtRisk !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <Link href="/recruiting/supply" className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 shrink-0">
          View Heatmap <ChevronRight className="h-3 w-3" />
        </Link>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : data.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* ── KPI banner ── */}
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[10px] font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide flex items-center gap-1">
                  <TrendingDown className="h-3 w-3" />Weekly Revenue at Risk
                </p>
                <p className="text-2xl font-bold text-red-700 dark:text-red-400 tabular-nums mt-0.5">
                  {fmtCurrency(totalWeeklyAtRisk)}
                </p>
                <p className="text-[10px] text-red-600/70 dark:text-red-400/70 mt-0.5">
                  {totalGap} unfilled driver position{totalGap !== 1 ? "s" : ""} across {marketsAtRisk} market{marketsAtRisk !== 1 ? "s" : ""}
                </p>
              </div>
              <DollarSign className="h-7 w-7 text-red-300 dark:text-red-600 shrink-0" />
            </div>

            {/* ── Per-market rows ── */}
            <div>
              {data.slice(0, 5).map(row => (
                <MarketRow key={row.market} row={row} />
              ))}
              {data.length > 5 && (
                <Link href="/recruiting/supply" className="block pt-2 text-[11px] text-muted-foreground hover:text-foreground text-center">
                  +{data.length - 5} more market{data.length - 5 !== 1 ? "s" : ""} → View all
                </Link>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground/50">
              Revenue at risk = unfilled positions × configured rate/driver/week
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
