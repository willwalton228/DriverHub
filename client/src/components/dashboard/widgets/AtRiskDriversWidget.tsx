/**
 * At Risk Drivers Widget
 *
 * Shows a live count of drivers flagged across three risk dimensions:
 * Attendance, Compliance, and Performance. Clicking the widget or any
 * metric navigates to the full At-Risk Drivers drill-down page.
 */

import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ShieldAlert, AlertTriangle, ClipboardX, TrendingDown, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface AtRiskSummary {
  total: number;
  attendanceCount: number;
  complianceCount: number;
  performanceCount: number;
}

function MetricRow({
  icon: Icon,
  label,
  count,
  color,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md hover-elevate transition-colors"
      data-testid={`at-risk-metric-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${color}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-sm text-muted-foreground truncate">{label}</span>
      </div>
      <span className={`text-sm font-bold tabular-nums ${count > 0 ? "text-foreground" : "text-muted-foreground"}`}>
        {count}
      </span>
    </button>
  );
}

export function AtRiskDriversWidget({ title }: { title?: string }) {
  const [, navigate] = useLocation();

  const { data, isLoading, isError } = useQuery<AtRiskSummary>({
    queryKey: ["/api/drivers/at-risk", { summary: true }],
    queryFn: () => fetch("/api/drivers/at-risk?summary=true").then(r => r.json()),
    staleTime: 60_000,
  });

  const goToPage = (riskType?: string) => {
    const url = riskType
      ? `/corporate/at-risk-drivers?riskType=${riskType}`
      : "/corporate/at-risk-drivers";
    navigate(url);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header — clickable */}
      <button
        onClick={() => goToPage()}
        className="flex items-center justify-between gap-2 mb-3 group"
        data-testid="at-risk-widget-header"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
            <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400" />
          </div>
          <span className="text-sm font-semibold text-foreground truncate">{title || "At Risk Drivers"}</span>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
      </button>

      {/* Total count */}
      {isLoading ? (
        <Skeleton className="h-10 w-24 mb-3" />
      ) : isError ? (
        <p className="text-sm text-destructive mb-3">Failed to load</p>
      ) : (
        <button
          onClick={() => goToPage()}
          className="flex items-baseline gap-2 mb-3 pl-1"
          data-testid="at-risk-total-count"
        >
          <span className={`text-3xl font-bold tabular-nums leading-none ${(data?.total ?? 0) > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
            {data?.total ?? 0}
          </span>
          <span className="text-xs text-muted-foreground">drivers flagged</span>
        </button>
      )}

      {/* Breakdown metrics */}
      <div className="flex flex-col gap-0.5 flex-1">
        {isLoading ? (
          <>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </>
        ) : (
          <>
            <MetricRow
              icon={AlertTriangle}
              label="Attendance Risk"
              count={data?.attendanceCount ?? 0}
              color="bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"
              onClick={() => goToPage("attendance")}
            />
            <MetricRow
              icon={ClipboardX}
              label="Compliance Risk"
              count={data?.complianceCount ?? 0}
              color="bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"
              onClick={() => goToPage("compliance")}
            />
            <MetricRow
              icon={TrendingDown}
              label="Performance Risk"
              count={data?.performanceCount ?? 0}
              color="bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400"
              onClick={() => goToPage("performance")}
            />
          </>
        )}
      </div>

      {/* Last evaluated timestamp omitted — shown on drill-down */}
    </div>
  );
}
