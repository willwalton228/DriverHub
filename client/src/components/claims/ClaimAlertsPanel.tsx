import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, AlertCircle, Info, FileX, DollarSign, RefreshCw, Clock, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
export type AlertSeverity = "critical" | "warning" | "info";
export type AlertType = "missing_info" | "high_cost" | "repeat_driver" | "delayed";

export interface ClaimAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  detail: string;
  resolvedWhen: string;
}

// ── Alert type metadata ───────────────────────────────────────────────────────
const TYPE_META: Record<AlertType, { label: string; Icon: React.FC<any> }> = {
  missing_info:   { label: "Missing Info",    Icon: FileX },
  high_cost:      { label: "Cost Exposure",   Icon: DollarSign },
  repeat_driver:  { label: "Repeat Driver",   Icon: RefreshCw },
  delayed:        { label: "Delayed Claim",   Icon: Clock },
};

// ── Single alert row ──────────────────────────────────────────────────────────
function AlertRow({ alert, showResolved }: { alert: ClaimAlert; showResolved?: boolean }) {
  const { Icon } = TYPE_META[alert.type] ?? { Icon: AlertCircle };

  const isCritical = alert.severity === "critical";
  const isWarning  = alert.severity === "warning";

  return (
    <div
      data-testid={`alert-row-${alert.id}`}
      className={cn(
        "flex gap-3 rounded-md p-3 text-sm",
        isCritical && "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50",
        isWarning  && "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50",
        !isCritical && !isWarning && "bg-muted border border-border",
      )}
    >
      {/* Icon */}
      <div className="shrink-0 mt-0.5">
        <Icon className={cn(
          "h-4 w-4",
          isCritical && "text-red-600 dark:text-red-400",
          isWarning  && "text-amber-600 dark:text-amber-400",
          !isCritical && !isWarning && "text-muted-foreground",
        )} />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn(
            "font-medium",
            isCritical && "text-red-800 dark:text-red-300",
            isWarning  && "text-amber-800 dark:text-amber-300",
            !isCritical && !isWarning && "text-foreground",
          )}>
            {alert.title}
          </span>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0 font-normal",
              isCritical && "border-red-300 dark:border-red-700 text-red-700 dark:text-red-400",
              isWarning  && "border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400",
            )}
            data-testid={`badge-alert-type-${alert.id}`}
          >
            {TYPE_META[alert.type]?.label ?? alert.type}
          </Badge>
        </div>
        <p className={cn(
          "text-xs leading-relaxed",
          isCritical && "text-red-700 dark:text-red-400",
          isWarning  && "text-amber-700 dark:text-amber-400",
          !isCritical && !isWarning && "text-muted-foreground",
        )}>
          {alert.detail}
        </p>
        {showResolved && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <CheckCircle2 className="h-3 w-3 shrink-0" />
            <span>Resolved when: {alert.resolvedWhen}</span>
          </p>
        )}
      </div>

      {/* Severity chip */}
      <div className="shrink-0 self-start">
        <span className={cn(
          "inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded",
          isCritical && "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300",
          isWarning  && "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300",
          !isCritical && !isWarning && "bg-muted-foreground/10 text-muted-foreground",
        )} data-testid={`chip-severity-${alert.id}`}>
          {alert.severity}
        </span>
      </div>
    </div>
  );
}

// ── Main ClaimAlertsPanel ─────────────────────────────────────────────────────
interface ClaimAlertsPanelProps {
  claimId: string;
  /** Refetch interval in ms — defaults to 30s for near-real-time updates */
  refetchInterval?: number;
  /** If true, show the "resolved when" detail for each alert (expanded view) */
  showResolved?: boolean;
}

export function ClaimAlertsPanel({
  claimId,
  refetchInterval = 30_000,
  showResolved = false,
}: ClaimAlertsPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [expandResolved, setExpandResolved] = useState(false);

  const { data: alerts = [], isLoading, isFetching } = useQuery<ClaimAlert[]>({
    queryKey: ["/api/claims", claimId, "alerts"],
    refetchInterval,
    staleTime: 15_000,
  });

  if (isLoading) return null;
  if (alerts.length === 0) return null;

  const criticalCount = alerts.filter(a => a.severity === "critical").length;
  const warningCount  = alerts.filter(a => a.severity === "warning").length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} data-testid="claim-alerts-panel">
      <div className={cn(
        "rounded-md border overflow-hidden",
        criticalCount > 0 ? "border-red-200 dark:border-red-800/50" : "border-amber-200 dark:border-amber-800/50",
      )}>
        {/* Header */}
        <CollapsibleTrigger asChild>
          <div
            className={cn(
              "flex items-center gap-2 px-4 py-3 cursor-pointer select-none",
              criticalCount > 0
                ? "bg-red-100/70 dark:bg-red-950/40"
                : "bg-amber-100/70 dark:bg-amber-950/40",
            )}
            data-testid="alerts-panel-header"
          >
            <AlertTriangle className={cn(
              "h-4 w-4 shrink-0",
              criticalCount > 0 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400",
            )} />
            <span className={cn(
              "text-sm font-semibold flex-1",
              criticalCount > 0 ? "text-red-800 dark:text-red-300" : "text-amber-800 dark:text-amber-300",
            )}>
              {criticalCount > 0
                ? `${criticalCount} critical alert${criticalCount !== 1 ? "s" : ""} require attention`
                : `${warningCount} warning${warningCount !== 1 ? "s" : ""} on this claim`}
            </span>

            {/* Counts */}
            <div className="flex items-center gap-1.5">
              {criticalCount > 0 && (
                <Badge
                  variant="outline"
                  className="border-red-400 dark:border-red-600 text-red-700 dark:text-red-300 text-[10px] px-1.5 py-0"
                  data-testid="badge-critical-count"
                >
                  {criticalCount} critical
                </Badge>
              )}
              {warningCount > 0 && (
                <Badge
                  variant="outline"
                  className="border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-300 text-[10px] px-1.5 py-0"
                  data-testid="badge-warning-count"
                >
                  {warningCount} warning
                </Badge>
              )}
              {isFetching && (
                <RefreshCw className="h-3 w-3 text-muted-foreground animate-spin" />
              )}
            </div>

            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
          </div>
        </CollapsibleTrigger>

        {/* Alert list */}
        <CollapsibleContent>
          <div className="bg-background p-3 space-y-2">
            {alerts.map(alert => (
              <AlertRow
                key={alert.id}
                alert={alert}
                showResolved={showResolved || expandResolved}
              />
            ))}

            {/* Toggle resolved hints */}
            <div className="pt-1 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 text-muted-foreground"
                onClick={() => setExpandResolved(v => !v)}
                data-testid="button-toggle-resolved-hints"
              >
                {expandResolved ? "Hide resolution hints" : "Show resolution hints"}
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ── Dashboard summary card ────────────────────────────────────────────────────
interface AlertsSummary {
  total: number;
  critical: number;
  warning: number;
  byType: Record<AlertType, number>;
  topAlertedClaims: { claimId: string; alertCount: number; maxSeverity: AlertSeverity }[];
}

export function ClaimAlertsSummaryCard() {
  const { data: summary, isLoading } = useQuery<AlertsSummary>({
    queryKey: ["/api/claims/alerts/summary"],
    refetchInterval: 30_000,
    staleTime: 30_000,
  });

  const hasCritical = (summary?.critical ?? 0) > 0;
  const hasWarning  = (summary?.warning ?? 0) > 0;
  const hasAlerts   = (summary?.total ?? 0) > 0;

  return (
    <div
      className={cn(
        "rounded-md border p-4 space-y-3",
        !isLoading && hasCritical
          ? "border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-950/20"
          : !isLoading && hasWarning
          ? "border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20"
          : "border-border bg-card",
      )}
      data-testid="card-alerts-summary"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <AlertTriangle className={cn(
          "h-4 w-4 shrink-0",
          hasCritical ? "text-red-600 dark:text-red-400"
          : hasWarning ? "text-amber-600 dark:text-amber-400"
          : "text-muted-foreground",
        )} />
        <span className="text-sm font-semibold">Active Claim Alerts</span>
        {isLoading && <RefreshCw className="h-3 w-3 text-muted-foreground animate-spin ml-auto" />}
      </div>

      {isLoading ? (
        <div className="h-8 bg-muted animate-pulse rounded" />
      ) : !hasAlerts ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span>No active alerts — all claims are on track.</span>
        </div>
      ) : (
        <>
          {/* Count row */}
          <div className="flex items-center gap-3">
            {(summary?.critical ?? 0) > 0 && (
              <div className="flex items-center gap-1.5" data-testid="stat-critical-alerts">
                <span className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {summary!.critical}
                </span>
                <span className="text-xs text-muted-foreground leading-tight">
                  critical<br />alerts
                </span>
              </div>
            )}
            {(summary?.warning ?? 0) > 0 && (
              <div className="flex items-center gap-1.5" data-testid="stat-warning-alerts">
                <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {summary!.warning}
                </span>
                <span className="text-xs text-muted-foreground leading-tight">
                  warning<br />alerts
                </span>
              </div>
            )}
            <div className="ml-auto text-right">
              <span className="text-xs text-muted-foreground">
                across {summary?.topAlertedClaims.length ?? 0} claim{summary?.topAlertedClaims.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* By type breakdown */}
          {summary?.byType && (
            <div className="flex flex-wrap gap-2 pt-1">
              {(Object.entries(summary.byType) as [AlertType, number][])
                .filter(([, count]) => count > 0)
                .map(([type, count]) => {
                  const meta = TYPE_META[type];
                  return (
                    <div
                      key={type}
                      className="flex items-center gap-1 text-xs text-muted-foreground"
                      data-testid={`stat-bytype-${type}`}
                    >
                      <meta.Icon className="h-3 w-3" />
                      <span>{meta.label}: <strong className="text-foreground">{count}</strong></span>
                    </div>
                  );
                })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
