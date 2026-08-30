import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, TrendingUp, Users, Clock, AlertTriangle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface DriverScore {
  id: string;
  driverId: string;
  score: string;
  tier: string;
  attendanceScore: string;
  adherenceScore: string;
  otScore: string;
  claimsScore: string;
  attendanceWeight: string;
  adherenceWeight: string;
  otWeight: string;
  claimsWeight: string;
  absences90d: number;
  workedHours30d: string;
  scheduledHours30d: string;
  otWeeksCount: number;
  totalWeeksCount: number;
  wiwLinked: boolean;
  computedAt: string;
  computedForWeekStart: string | null;
}

// ── Tier config ───────────────────────────────────────────────────────────────
const TIER_CONFIG: Record<string, {
  bg: string; text: string; border: string;
  ring: string; barColor: string; label: string;
}> = {
  Excellent: {
    bg: "bg-green-500 dark:bg-green-600",
    text: "text-white",
    border: "border-green-600 dark:border-green-700",
    ring: "ring-green-300 dark:ring-green-700",
    barColor: "bg-green-500",
    label: "Excellent",
  },
  Good: {
    bg: "bg-blue-500 dark:bg-blue-600",
    text: "text-white",
    border: "border-blue-600 dark:border-blue-700",
    ring: "ring-blue-300 dark:ring-blue-700",
    barColor: "bg-blue-500",
    label: "Good",
  },
  Fair: {
    bg: "bg-yellow-500 dark:bg-yellow-600",
    text: "text-white",
    border: "border-yellow-600 dark:border-yellow-700",
    ring: "ring-yellow-300 dark:ring-yellow-700",
    barColor: "bg-yellow-500",
    label: "Fair",
  },
  "At-Risk": {
    bg: "bg-orange-500 dark:bg-orange-600",
    text: "text-white",
    border: "border-orange-600 dark:border-orange-700",
    ring: "ring-orange-300 dark:ring-orange-700",
    barColor: "bg-orange-500",
    label: "At-Risk",
  },
  Critical: {
    bg: "bg-red-600 dark:bg-red-700",
    text: "text-white",
    border: "border-red-700 dark:border-red-800",
    ring: "ring-red-300 dark:ring-red-800",
    barColor: "bg-red-600",
    label: "Critical",
  },
};

const DEFAULT_TIER = TIER_CONFIG.Fair;

function getTierConfig(tier: string) {
  return TIER_CONFIG[tier] ?? DEFAULT_TIER;
}

// ── Score Bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ score, barColor, className }: { score: number; barColor: string; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full rounded-full bg-muted overflow-hidden", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", barColor)}
        style={{ width: `${Math.min(score, 100)}%` }}
      />
    </div>
  );
}

// ── Component row in breakdown ─────────────────────────────────────────────────
function ComponentRow({
  label,
  score,
  weight,
  icon,
  detail,
  dataAvailable,
}: {
  label: string;
  score: number;
  weight: number;
  icon: React.ReactNode;
  detail: string;
  dataAvailable: boolean;
}) {
  const pct = Math.min(score, 100);
  const barColor =
    pct >= 80 ? "bg-green-500" :
    pct >= 60 ? "bg-blue-500"  :
    pct >= 40 ? "bg-yellow-500" :
    pct >= 20 ? "bg-orange-500" :
    "bg-red-600";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-muted-foreground">{icon}</span>
          <span className="text-xs font-medium truncate">{label}</span>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">({Math.round(weight * 100)}%)</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!dataAvailable && <span className="text-[10px] text-muted-foreground italic">est.</span>}
          <span className={cn("text-xs font-bold tabular-nums", pct >= 80 ? "text-green-600 dark:text-green-400" : pct >= 60 ? "text-blue-600 dark:text-blue-400" : pct >= 40 ? "text-yellow-600 dark:text-yellow-400" : pct >= 20 ? "text-orange-600 dark:text-orange-400" : "text-red-600 dark:text-red-400")}>
            {Math.round(score)}
          </span>
          <span className="text-[10px] text-muted-foreground">/ 100</span>
        </div>
      </div>
      <ScoreBar score={pct} barColor={barColor} />
      <p className="text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}

// ── Main Badge ─────────────────────────────────────────────────────────────────
interface DriverScoreBadgeProps {
  driverId: string;
  compact?: boolean;       // Compact = just pill in header; full = show in panels
  className?: string;
}

export function DriverScoreBadge({ driverId, compact = false, className }: DriverScoreBadgeProps) {
  const [open, setOpen] = useState(false);

  const { data: scoreData, isLoading } = useQuery<DriverScore | null>({
    queryKey: ["/api/corporate/drivers", driverId, "performance-score"],
    queryFn: async () => {
      const r = await fetch(`/api/corporate/drivers/${driverId}/performance-score`, { credentials: "include" });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 60 * 60 * 1000, // 1 hour
    enabled: !!driverId,
  });

  const recomputeMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/corporate/drivers/${driverId}/performance-score/compute`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers", driverId, "performance-score"] });
    },
  });

  if (isLoading) {
    return <Skeleton className={cn("h-6 w-16 rounded-full", className)} />;
  }

  // If no score yet, show a neutral pending badge
  if (!scoreData) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold",
              "bg-muted text-muted-foreground border border-border",
              "cursor-pointer transition-opacity hover:opacity-80",
              className
            )}
            data-testid="badge-driver-score-pending"
          >
            Score: N/A
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="start" className="w-72 p-4">
          <p className="text-sm font-semibold mb-1">Performance Score</p>
          <p className="text-xs text-muted-foreground mb-3">Score not yet computed for this driver.</p>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => recomputeMutation.mutate()}
            disabled={recomputeMutation.isPending}
          >
            <RefreshCw className={cn("w-3 h-3 mr-1.5", recomputeMutation.isPending && "animate-spin")} />
            Compute Now
          </Button>
        </PopoverContent>
      </Popover>
    );
  }

  const score    = Math.round(parseFloat(scoreData.score));
  const tier     = scoreData.tier;
  const cfg      = getTierConfig(tier);

  const attScore = Math.round(parseFloat(scoreData.attendanceScore));
  const adhScore = Math.round(parseFloat(scoreData.adherenceScore));
  const otScoreV = Math.round(parseFloat(scoreData.otScore));

  const attWeight = parseFloat(scoreData.attendanceWeight);
  const adhWeight = parseFloat(scoreData.adherenceWeight);
  const otWeight  = parseFloat(scoreData.otWeight);

  const wiwLinked     = scoreData.wiwLinked;
  const workedHrs     = parseFloat(scoreData.workedHours30d);
  const scheduledHrs  = parseFloat(scoreData.scheduledHours30d);
  const absences90d   = scoreData.absences90d;
  const otWeeks       = scoreData.otWeeksCount;
  const totalWeeks    = scoreData.totalWeeksCount;

  const computedAt    = scoreData.computedAt
    ? new Date(scoreData.computedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })
    : "—";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold",
            cfg.bg, cfg.text,
            "cursor-pointer transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2",
            cfg.ring,
            className
          )}
          data-testid={`badge-driver-score-${driverId}`}
        >
          <span className="tabular-nums">{score}</span>
          {!compact && <span className="font-medium opacity-90">{tier}</span>}
        </button>
      </PopoverTrigger>

      <PopoverContent side="bottom" align="start" className="w-80 p-0" data-testid="popover-driver-score">
        {/* Header */}
        <div className={cn("flex items-center justify-between px-4 py-3 rounded-t-md", cfg.bg)}>
          <div>
            <p className={cn("text-sm font-bold", cfg.text)}>Performance Score</p>
            <p className={cn("text-xs opacity-80", cfg.text)}>{tier} · Updated {computedAt}</p>
          </div>
          <div className={cn("text-3xl font-black tabular-nums", cfg.text)}>{score}</div>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-4">
          {/* Overall bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Overall</span>
              <span>{score}/100</span>
            </div>
            <ScoreBar score={score} barColor={cfg.barColor} className="h-2" />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Critical</span>
              <span>Excellent</span>
            </div>
          </div>

          <Separator />

          {/* Component breakdown */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Breakdown</p>

            <ComponentRow
              label="Attendance"
              score={attScore}
              weight={attWeight}
              icon={<Users className="w-3 h-3" />}
              dataAvailable={wiwLinked}
              detail={
                wiwLinked
                  ? `${absences90d} absence${absences90d !== 1 ? "s" : ""} in last 90 days`
                  : "No WIW link — estimate used"
              }
            />

            <ComponentRow
              label="Hours Adherence"
              score={adhScore}
              weight={adhWeight}
              icon={<Clock className="w-3 h-3" />}
              dataAvailable={wiwLinked}
              detail={
                wiwLinked && scheduledHrs > 0
                  ? `${workedHrs.toFixed(1)}h worked / ${scheduledHrs.toFixed(1)}h scheduled (30d)`
                  : wiwLinked
                  ? "No scheduled hours in last 30 days"
                  : "No WIW link — estimate used"
              }
            />

            <ComponentRow
              label="OT Frequency"
              score={otScoreV}
              weight={otWeight}
              icon={<TrendingUp className="w-3 h-3" />}
              dataAvailable={wiwLinked}
              detail={
                wiwLinked && totalWeeks > 0
                  ? `${otWeeks} OT week${otWeeks !== 1 ? "s" : ""} out of ${totalWeeks} tracked (90d)`
                  : wiwLinked
                  ? "No time data in last 90 days"
                  : "No WIW link — estimate used"
              }
            />

            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1">
              <AlertTriangle className="w-3 h-3 opacity-60" />
              <span>Claims component reserved (future)</span>
            </div>
          </div>

          {!wiwLinked && (
            <>
              <Separator />
              <p className="text-[11px] text-muted-foreground italic">
                This driver has no When I Work link. Attendance, adherence, and OT scores are estimated at 50 (neutral).
                Connect a WIW account to enable full scoring.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-3 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => { recomputeMutation.mutate(); }}
            disabled={recomputeMutation.isPending}
            data-testid="btn-recompute-score"
          >
            <RefreshCw className={cn("w-3 h-3 mr-1.5", recomputeMutation.isPending && "animate-spin")} />
            {recomputeMutation.isPending ? "Computing…" : "Recompute"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
