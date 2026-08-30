/**
 * GoLiveForecastCard — Ticket 22
 *
 * Displays a probabilistic go-live forecast for a market launch plan.
 * Shows projected dates (optimistic / likely / pessimistic), confidence level,
 * pipeline health, and actionable blockers.
 *
 * Used in:
 *  - MarketLaunchPlanner plan detail dialog
 *  - Plan card summary strip
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
  CalendarDays,
  BarChart3,
  ShieldAlert,
} from "lucide-react";
import type { GoLiveForecast, ForecastBlocker } from "@shared/schema";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysFromNow(iso: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(iso);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function confidenceColor(level: "high" | "medium" | "low") {
  if (level === "high")   return "text-green-600 dark:text-green-400";
  if (level === "medium") return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function confidenceBg(level: "high" | "medium" | "low") {
  if (level === "high")   return "bg-green-500";
  if (level === "medium") return "bg-yellow-500";
  return "bg-red-500";
}

function blockerIcon(severity: ForecastBlocker["severity"]) {
  if (severity === "critical") return <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />;
  if (severity === "warning")  return <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />;
  return <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />;
}

function blockerBadge(severity: ForecastBlocker["severity"]) {
  if (severity === "critical") return <Badge className="text-[10px] py-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 no-default-active-elevate">Critical</Badge>;
  if (severity === "warning")  return <Badge className="text-[10px] py-0 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 no-default-active-elevate">Warning</Badge>;
  return <Badge className="text-[10px] py-0 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 no-default-active-elevate">Info</Badge>;
}

// ── Stage label map ────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  applied:              "Applied",
  phone_screen:         "Phone Screen",
  interview_scheduled:  "Interview Scheduled",
  interview_completed:  "Interview Completed",
  background_check:     "Background Check",
  drug_test:            "Drug Test",
  mvr_check:            "MVR Check",
  offer_extended:       "Offer Extended",
  offer_accepted:       "Offer Accepted",
  onboarding:           "Onboarding",
  hired:                "Hired",
};

const STAGE_ORDER = [
  "applied", "phone_screen", "interview_scheduled", "interview_completed",
  "background_check", "drug_test", "mvr_check", "offer_extended", "offer_accepted", "onboarding", "hired",
];

// ── Main component ─────────────────────────────────────────────────────────────

interface GoLiveForecastCardProps {
  planId: string;
  forecast: GoLiveForecast | null | undefined;
  market: string;
  queryKey?: string[];
  compact?: boolean;
}

export function GoLiveForecastCard({ planId, forecast, market, queryKey, compact = false }: GoLiveForecastCardProps) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<"pipeline" | "blockers" | null>(null);

  const refreshMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/recruiting/launch-plans/${planId}/forecast`),
    onSuccess: () => {
      if (queryKey) qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["/api/recruiting/launch-plans"] });
      qc.invalidateQueries({ queryKey: ["/api/recruiting/launch-plans", planId] });
    },
  });

  if (!forecast) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-col items-center gap-3 text-center py-2">
            <CalendarDays className="w-8 h-8 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium">No forecast generated yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Generate a go-live forecast based on live pipeline data for {market}.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              data-testid="button-generate-forecast"
            >
              {refreshMutation.isPending ? (
                <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Computing...</>
              ) : (
                <><BarChart3 className="w-3.5 h-3.5 mr-1.5" /> Generate Forecast</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const {
    projectedGoLive,
    confidenceLevel,
    confidenceScore,
    headcountTarget,
    currentHires,
    hiresRemaining,
    pipelineDepth,
    estimatedDaysToFill,
    openRequisitions,
    isOnTrack,
    daysAheadOrBehind,
    blockers,
    computedAt,
  } = forecast;

  const likelyDays = daysFromNow(projectedGoLive.likely);
  const criticals  = blockers.filter(b => b.severity === "critical");
  const warnings   = blockers.filter(b => b.severity === "warning");
  const infos      = blockers.filter(b => b.severity === "info");

  return (
    <Card data-testid="card-go-live-forecast">
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Go-Live Forecast</CardTitle>
          {isOnTrack ? (
            <Badge className="text-[10px] py-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 no-default-active-elevate">
              <CheckCircle2 className="w-2.5 h-2.5 mr-1" />On Track
            </Badge>
          ) : (
            <Badge className="text-[10px] py-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 no-default-active-elevate">
              <ShieldAlert className="w-2.5 h-2.5 mr-1" />At Risk
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          data-testid="button-refresh-forecast"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* Confidence meter */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Forecast Confidence</span>
            <span className={`text-xs font-semibold uppercase tracking-wide ${confidenceColor(confidenceLevel)}`}>
              {confidenceLevel} — {confidenceScore}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${confidenceBg(confidenceLevel)}`}
              style={{ width: `${confidenceScore}%` }}
            />
          </div>
        </div>

        {/* Projected date window */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 rounded-md bg-muted/50">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Optimistic</p>
            <p className="text-sm font-semibold">{formatDate(projectedGoLive.optimistic)}</p>
            <p className="text-[10px] text-muted-foreground">{daysFromNow(projectedGoLive.optimistic)}d</p>
          </div>
          <div className="text-center p-2.5 rounded-md bg-primary/8 ring-1 ring-primary/20">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Likely</p>
            <p className="text-base font-bold">{formatDate(projectedGoLive.likely)}</p>
            <p className="text-[10px] text-muted-foreground">{likelyDays}d</p>
          </div>
          <div className="text-center p-2 rounded-md bg-muted/50">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Pessimistic</p>
            <p className="text-sm font-semibold">{formatDate(projectedGoLive.pessimistic)}</p>
            <p className="text-[10px] text-muted-foreground">{daysFromNow(projectedGoLive.pessimistic)}d</p>
          </div>
        </div>

        {/* Days ahead/behind banner */}
        {daysAheadOrBehind !== null && (
          <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
            daysAheadOrBehind >= 0
              ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300"
              : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
          }`}>
            {daysAheadOrBehind >= 0
              ? <TrendingUp className="w-4 h-4 shrink-0" />
              : <TrendingDown className="w-4 h-4 shrink-0" />}
            <span>
              {daysAheadOrBehind >= 0
                ? `${daysAheadOrBehind} day${daysAheadOrBehind !== 1 ? "s" : ""} ahead of customer start date`
                : `${Math.abs(daysAheadOrBehind)} day${Math.abs(daysAheadOrBehind) !== 1 ? "s" : ""} behind customer start date`}
            </span>
          </div>
        )}

        {/* KPI row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-2 rounded-md bg-muted/40 cursor-default">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Target</p>
                  <p className="text-base font-bold">{headcountTarget}</p>
                  <p className="text-[10px] text-muted-foreground">drivers</p>
                </div>
              </TooltipTrigger>
              <TooltipContent>Headcount target for this market</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-2 rounded-md bg-muted/40 cursor-default">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Hired</p>
                  <p className="text-base font-bold text-green-600 dark:text-green-400">{currentHires}</p>
                  <p className="text-[10px] text-muted-foreground">of {headcountTarget}</p>
                </div>
              </TooltipTrigger>
              <TooltipContent>Drivers already hired / ready to work</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-2 rounded-md bg-muted/40 cursor-default">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Remaining</p>
                  <p className={`text-base font-bold ${hiresRemaining > 0 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"}`}>
                    {hiresRemaining}
                  </p>
                  <p className="text-[10px] text-muted-foreground">to fill</p>
                </div>
              </TooltipTrigger>
              <TooltipContent>Hires still needed to reach headcount target</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Fill progress bar */}
        {headcountTarget > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Fill progress</span>
              <span>{Math.round((currentHires / headcountTarget) * 100)}%</span>
            </div>
            <Progress value={(currentHires / headcountTarget) * 100} className="h-1.5" />
          </div>
        )}

        <Separator />

        {/* Pipeline summary toggle */}
        {!compact && (
          <div>
            <button
              className="flex w-full items-center justify-between text-sm font-medium hover-elevate rounded-md py-1 px-1 -mx-1"
              onClick={() => setExpanded(expanded === "pipeline" ? null : "pipeline")}
              data-testid="button-toggle-pipeline-detail"
            >
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                Pipeline — {pipelineDepth.totalActive} active candidates
              </span>
              <span className="text-muted-foreground text-xs">{expanded === "pipeline" ? "▲" : "▼"}</span>
            </button>

            {expanded === "pipeline" && (
              <div className="mt-2 space-y-1.5 pl-1">
                <div className="flex justify-between text-xs text-muted-foreground pb-0.5">
                  <span>Stage</span>
                  <span className="flex gap-4">
                    <span>Count</span>
                    <span>Equiv. Qual.</span>
                  </span>
                </div>
                {STAGE_ORDER.filter(s => (pipelineDepth.byStage[s] ?? 0) > 0).map(stage => {
                  const count = pipelineDepth.byStage[stage] ?? 0;
                  const STAGE_WEIGHTS: Record<string, number> = {
                    applied: 0.06, phone_screen: 0.16, interview_scheduled: 0.35,
                    interview_completed: 0.52, background_check: 0.66, drug_test: 0.71,
                    mvr_check: 0.74, offer_extended: 0.82, offer_accepted: 0.92,
                    onboarding: 0.96, hired: 1.00,
                  };
                  const equiv = Math.round(count * (STAGE_WEIGHTS[stage] ?? 0.05) * 10) / 10;
                  return (
                    <div key={stage} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{STAGE_LABELS[stage] ?? stage}</span>
                      <span className="flex gap-4 tabular-nums">
                        <span className="font-medium">{count}</span>
                        <span className="text-muted-foreground">{equiv}</span>
                      </span>
                    </div>
                  );
                })}
                {pipelineDepth.totalActive === 0 && (
                  <p className="text-xs text-muted-foreground italic">No active candidates in pipeline.</p>
                )}
                <div className="flex justify-between text-xs font-semibold border-t pt-1.5 mt-1">
                  <span>Coverage ratio</span>
                  <span className={pipelineDepth.coverageRatio >= 0.8 ? "text-green-600 dark:text-green-400" : "text-orange-600 dark:text-orange-400"}>
                    {Math.round(pipelineDepth.coverageRatio * 100)}%
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Coverage = weighted pipeline vs hires needed. &ge;80% is healthy.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Blockers */}
        {blockers.length > 0 && !compact && (
          <>
            <Separator />
            <div>
              <button
                className="flex w-full items-center justify-between text-sm font-medium hover-elevate rounded-md py-1 px-1 -mx-1"
                onClick={() => setExpanded(expanded === "blockers" ? null : "blockers")}
                data-testid="button-toggle-blockers"
              >
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" />
                  {criticals.length > 0
                    ? <span className="text-red-600 dark:text-red-400">{criticals.length} critical, {warnings.length} warning{warnings.length !== 1 ? "s" : ""}</span>
                    : <span className="text-yellow-600 dark:text-yellow-400">{warnings.length} warning{warnings.length !== 1 ? "s" : ""}{infos.length > 0 ? `, ${infos.length} info` : ""}</span>
                  }
                </span>
                <span className="text-muted-foreground text-xs">{expanded === "blockers" ? "▲" : "▼"}</span>
              </button>

              {expanded === "blockers" && (
                <div className="mt-2 space-y-3">
                  {blockers.map((b, i) => (
                    <div key={i} className="flex gap-2.5">
                      {blockerIcon(b.severity)}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                          {blockerBadge(b.severity)}
                          <span className="text-xs font-medium">{b.description}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-snug">{b.recommendation}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Compact blocker strip */}
        {compact && blockers.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {criticals.length > 0 && (
              <Badge className="text-[10px] py-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 no-default-active-elevate">
                <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />{criticals.length} critical
              </Badge>
            )}
            {warnings.length > 0 && (
              <Badge className="text-[10px] py-0 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 no-default-active-elevate">
                <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />{warnings.length} warning
              </Badge>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-0.5">
          <Clock className="w-3 h-3" />
          <span>Forecast computed {new Date(computedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          {openRequisitions !== undefined && (
            <span className="ml-auto">{openRequisitions} open req{openRequisitions !== 1 ? "s" : ""}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Compact summary strip (for plan cards) ────────────────────────────────────

interface ForecastSummaryStripProps {
  forecast: GoLiveForecast | null | undefined;
}

export function ForecastSummaryStrip({ forecast }: ForecastSummaryStripProps) {
  if (!forecast) return null;

  const { projectedGoLive, confidenceLevel, isOnTrack, daysAheadOrBehind, blockers } = forecast;
  const criticals = blockers.filter(b => b.severity === "critical").length;

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1" data-testid="forecast-summary-strip">
      <CalendarDays className="w-3 h-3 text-muted-foreground shrink-0" />
      <span className="text-xs text-muted-foreground">Go-live:</span>
      <span className="text-xs font-medium">{formatDate(projectedGoLive.likely)}</span>

      <Badge className={`text-[10px] py-0 no-default-active-elevate ${
        confidenceLevel === "high"   ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" :
        confidenceLevel === "medium" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" :
                                       "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
      }`}>
        {confidenceLevel} confidence
      </Badge>

      {isOnTrack ? (
        <Badge className="text-[10px] py-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 no-default-active-elevate">
          On Track
        </Badge>
      ) : (
        <Badge className="text-[10px] py-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 no-default-active-elevate">
          At Risk
        </Badge>
      )}

      {daysAheadOrBehind !== null && daysAheadOrBehind < 0 && (
        <span className="text-[10px] text-red-600 dark:text-red-400">
          {Math.abs(daysAheadOrBehind)}d behind
        </span>
      )}

      {criticals > 0 && (
        <span className="text-[10px] text-red-600 dark:text-red-400">
          · {criticals} critical blocker{criticals !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}
