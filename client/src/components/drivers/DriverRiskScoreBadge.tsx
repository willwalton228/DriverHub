import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Shield, AlertTriangle, TrendingUp, Activity, FileText, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tier colour config — solid fills matching Active badge + DriverScoreBadge style ──
const RISK_TIER_CFG: Record<string, {
  bg: string;
  text: string;
  ring: string;
  barColor: string;
  badgeCls: string;
}> = {
  "Top Performer": {
    bg: "bg-green-500 dark:bg-green-600",
    text: "text-white",
    ring: "ring-green-300 dark:ring-green-700",
    barColor: "bg-green-500",
    badgeCls: "bg-green-500/15 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  },
  "On Track": {
    bg: "bg-blue-500 dark:bg-blue-600",
    text: "text-white",
    ring: "ring-blue-300 dark:ring-blue-700",
    barColor: "bg-blue-500",
    badgeCls: "bg-blue-500/15 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  "Watch List": {
    bg: "bg-yellow-500 dark:bg-yellow-600",
    text: "text-white",
    ring: "ring-yellow-300 dark:ring-yellow-700",
    barColor: "bg-yellow-500",
    badgeCls: "bg-yellow-500/15 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  },
  "High Risk": {
    bg: "bg-red-600 dark:bg-red-700",
    text: "text-white",
    ring: "ring-red-300 dark:ring-red-800",
    barColor: "bg-red-600",
    badgeCls: "bg-red-500/15 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  },
};

const DEFAULT_CFG = RISK_TIER_CFG["High Risk"];

function getRiskCfg(tier: string) {
  return RISK_TIER_CFG[tier] ?? DEFAULT_CFG;
}

// ── Risk input bar — sub-score bars; these are "higher = riskier input" ─────────
function RiskBar({ score, className }: { score: number; className?: string }) {
  const pct = Math.min(Math.max(score, 0), 100);
  const barColor =
    pct <= 20 ? "bg-green-500" :
    pct <= 40 ? "bg-blue-500"  :
    pct <= 60 ? "bg-yellow-500" :
    pct <= 80 ? "bg-orange-500" :
    "bg-red-600";

  return (
    <div className={cn("h-1.5 w-full rounded-full bg-muted overflow-hidden", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", barColor)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Score bar — for the overall score (higher = safer) ───────────────────────
function SafetyBar({ score, barColor, className }: { score: number; barColor: string; className?: string }) {
  return (
    <div className={cn("h-2 w-full rounded-full bg-muted overflow-hidden", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", barColor)}
        style={{ width: `${Math.min(score, 100)}%` }}
      />
    </div>
  );
}

// ── Sub-score row ─────────────────────────────────────────────────────────────
function SubRow({
  icon,
  label,
  riskScore,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  riskScore: number;
  detail?: string;
}) {
  const pct = Math.min(Math.max(riskScore, 0), 100);
  const levelLabel =
    pct <= 20 ? "Low" :
    pct <= 40 ? "Moderate" :
    pct <= 60 ? "Elevated" :
    pct <= 80 ? "High" : "Critical";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-muted-foreground shrink-0">{icon}</span>
          <span className="text-xs font-medium truncate">{label}</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">{levelLabel}</span>
      </div>
      <RiskBar score={pct} />
      {detail && <p className="text-[10px] text-muted-foreground">{detail}</p>}
    </div>
  );
}

// ── Main exported component ───────────────────────────────────────────────────
export interface DriverLossScoreData {
  driverId: string;
  driverName: string;
  score: number;
  tier: "Top Performer" | "On Track" | "Watch List" | "High Risk";
  immediateReview: boolean;
  frequencyRisk: number;
  severityRisk: number;
  mvrRisk: number;
  openExposureRisk: number;
  trendRisk: number;
  movesSinceRisk?: number;
  weightedRisk: number;
  riskFloorApplied: boolean;
  riskFloorReason: string | null;
  inputs: {
    preventableClaimsAllTime: number;
    atFaultCount12Months: number;
    atFaultRate12Months: number;
    claimsHistory12Months: number;
    claimsLast90Days: number;
    openClaimsCount: number;
    openReserveCents: number;
    seriousViolations12Months: number;
    activityLast90Days: number;
    activityPrior90Days: number;
    totalIncurredCents: number;
    totalClaimsAllTime: number;
    totalTripsAllTime: number;
    movesSinceLastIncident?: number;
  };
  usage?: {
    eligibilityGating: boolean;
    tieringVisibility: boolean;
    futurePayModifiers: boolean;
  };
}

interface DriverRiskScoreBadgeProps {
  data: DriverLossScoreData;
  compact?: boolean;
  className?: string;
}

function formatDollars(cents: number) {
  if (cents === 0) return "$0";
  const val = cents / 100;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

export function DriverRiskScoreBadge({ data, compact = false, className }: DriverRiskScoreBadgeProps) {
  const [open, setOpen] = useState(false);
  const cfg = getRiskCfg(data.tier);
  const inp = data.inputs;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold",
            cfg.bg, cfg.text,
            "cursor-pointer transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2",
            cfg.ring,
            className
          )}
          data-testid="badge-driver-risk-score"
        >
          <Shield className="h-3 w-3 shrink-0" />
          <span className="tabular-nums">{data.score}</span>
          {!compact && <span className="font-medium opacity-90">· {data.tier}</span>}
        </button>
      </PopoverTrigger>

      <PopoverContent side="bottom" align="start" className="w-80 p-0" data-testid="popover-driver-risk-score">
        {/* Header */}
        <div className={cn("flex items-center justify-between px-4 py-3 rounded-t-md", cfg.bg)}>
          <div>
            <p className={cn("text-sm font-bold", cfg.text)}>Driver Risk Score</p>
            <p className={cn("text-xs opacity-80", cfg.text)}>{data.tier}</p>
          </div>
          <div className={cn("text-3xl font-black tabular-nums", cfg.text)}>{data.score}</div>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-4">
          {/* Immediate review alert */}
          {data.immediateReview && (
            <div className="flex items-center gap-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400 shrink-0" />
              <p className="text-xs font-medium text-red-700 dark:text-red-400">Flagged for immediate review</p>
            </div>
          )}

          {/* Overall safety bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Overall Safety Score</span>
              <span>{data.score}/100</span>
            </div>
            <SafetyBar score={data.score} barColor={cfg.barColor} />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>High Risk</span>
              <span>Top Performer</span>
            </div>
          </div>

          <Separator />

          {/* Risk sub-scores */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Risk Inputs</p>
            <p className="text-[10px] text-muted-foreground -mt-1">Higher bar = greater risk contribution</p>

            <SubRow
              icon={<Activity className="w-3 h-3" />}
              label="Claim Frequency"
              riskScore={data.frequencyRisk}
              detail={
                inp.atFaultCount12Months > 0
                  ? `${inp.atFaultCount12Months} at-fault claim${inp.atFaultCount12Months !== 1 ? "s" : ""} in last 12 months`
                  : inp.claimsHistory12Months > 0
                  ? `${inp.claimsHistory12Months} claim${inp.claimsHistory12Months !== 1 ? "s" : ""} in last 12 months`
                  : "No recent claims"
              }
            />

            <SubRow
              icon={<TrendingUp className="w-3 h-3" />}
              label="Claim Severity"
              riskScore={data.severityRisk}
              detail={
                inp.totalIncurredCents > 0
                  ? `${formatDollars(inp.totalIncurredCents)} total incurred across ${inp.totalClaimsAllTime} claim${inp.totalClaimsAllTime !== 1 ? "s" : ""}`
                  : "No incurred costs on record"
              }
            />

            <SubRow
              icon={<FileText className="w-3 h-3" />}
              label="MVR / Violations"
              riskScore={data.mvrRisk}
              detail={
                inp.seriousViolations12Months > 0
                  ? `${inp.seriousViolations12Months} serious violation${inp.seriousViolations12Months !== 1 ? "s" : ""} in last 12 months`
                  : "No serious violations on record"
              }
            />

            <SubRow
              icon={<Eye className="w-3 h-3" />}
              label="Open Exposure"
              riskScore={data.openExposureRisk}
              detail={
                inp.openClaimsCount > 0
                  ? `${inp.openClaimsCount} open claim${inp.openClaimsCount !== 1 ? "s" : ""}${inp.openReserveCents > 0 ? ` · ${formatDollars(inp.openReserveCents)} reserved` : ""}`
                  : "No open claims"
              }
            />

            <SubRow
              icon={<TrendingUp className="w-3 h-3" />}
              label="Activity Trend"
              riskScore={data.trendRisk}
              detail={
                inp.activityLast90Days !== undefined && inp.activityPrior90Days !== undefined
                  ? `${inp.activityLast90Days} events last 90d vs ${inp.activityPrior90Days} prior 90d`
                  : undefined
              }
            />
          </div>

          {/* Trip context */}
          {inp.totalTripsAllTime >= 0 && (
            <>
              <Separator />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Trips on record</span>
                <span className="font-medium tabular-nums">{inp.totalTripsAllTime.toLocaleString()}</span>
              </div>
            </>
          )}

          {/* Floor notice */}
          {data.riskFloorApplied && data.riskFloorReason && (
            <>
              <Separator />
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-yellow-700 dark:text-yellow-400">{data.riskFloorReason}</p>
              </div>
            </>
          )}

          {/* Tier legend */}
          <Separator />
          <p className="text-[10px] text-muted-foreground text-center">
            85+ Top Performer · 70+ On Track · 50+ Watch List · &lt;50 High Risk
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
