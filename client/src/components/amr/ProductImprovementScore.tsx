/**
 * Product Improvement Score Widget
 * Executive-only funnel view of the complete AMR lifecycle:
 * Ideas Submitted → Implemented → User Accepts → Returned for Rework
 *
 * Permissions: Will Walton, super_user, ops_manager, corporate_admin
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Lightbulb, Rocket, ThumbsUp, RotateCcw, TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = "today" | "this_week" | "this_month" | "this_year" | "custom" | "all_time";

interface PIScore {
  ideasSubmitted:    number;
  ideasImplemented:  number;
  userAccepts:       number;
  returnedForRework: number;
  implPct:           number; // implemented / submitted × 100
  acceptsPct:        number; // user_accepts / submitted × 100
  reworkPct:         number; // user_declines / submitted × 100
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "all_time",   label: "All Time"     },
  { value: "today",      label: "Today"        },
  { value: "this_week",  label: "This Week"    },
  { value: "this_month", label: "This Month"   },
  { value: "this_year",  label: "This Year"    },
  { value: "custom",     label: "Custom Range" },
];

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Returns [startISO, endISO] for a period; null entries mean "no bound". */
function periodToDates(period: Period, dateFrom: string, dateTo: string): [string | null, string | null] {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fmt   = (d: Date) => d.toISOString().split("T")[0];

  switch (period) {
    case "today":
      return [fmt(today), fmt(today)];
    case "this_week": {
      const dow  = today.getDay();
      const diff = dow === 0 ? 6 : dow - 1;
      const mon  = new Date(today); mon.setDate(today.getDate() - diff);
      const sun  = new Date(mon);   sun.setDate(mon.getDate() + 6);
      return [fmt(mon), fmt(sun)];
    }
    case "this_month":
      return [
        fmt(new Date(now.getFullYear(), now.getMonth(), 1)),
        fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      ];
    case "this_year":
      return [
        fmt(new Date(now.getFullYear(), 0, 1)),
        fmt(new Date(now.getFullYear(), 11, 31)),
      ];
    case "custom":
      return [dateFrom || null, dateTo || null];
    default:
      return [null, null];
  }
}

// ── Metric tile definition ────────────────────────────────────────────────────

interface MetricDef {
  key:         keyof PIScore;
  pctKey?:     keyof PIScore;
  label:       string;
  insight:     string;
  Icon:        React.ElementType;
  color:       string;
  bg:          string;
  statusParam: string | null; // null = show all
}

const METRICS: MetricDef[] = [
  {
    key:         "ideasSubmitted",
    label:       "Ideas Submitted",
    insight:     "Are employees identifying improvements?",
    Icon:        Lightbulb,
    color:       "text-blue-600 dark:text-blue-400",
    bg:          "bg-blue-500/10",
    statusParam: null, // all statuses
  },
  {
    key:         "ideasImplemented",
    pctKey:      "implPct",
    label:       "Ideas Implemented",
    insight:     "Are improvements being developed?",
    Icon:        Rocket,
    color:       "text-violet-600 dark:text-violet-400",
    bg:          "bg-violet-500/10",
    statusParam: "completed",
  },
  {
    key:         "userAccepts",
    pctKey:      "acceptsPct",
    label:       "User Accepts",
    insight:     "Are users accepting delivered work?",
    Icon:        ThumbsUp,
    color:       "text-emerald-600 dark:text-emerald-400",
    bg:          "bg-emerald-500/10",
    statusParam: "user_accepts",
  },
  {
    key:         "returnedForRework",
    pctKey:      "reworkPct",
    label:       "Returned for Rework",
    insight:     "How much rework is occurring?",
    Icon:        RotateCcw,
    color:       "text-red-600 dark:text-red-400",
    bg:          "bg-red-500/10",
    statusParam: "user_declines",
  },
];

// ── Widget ────────────────────────────────────────────────────────────────────

export function ProductImprovementScore() {
  const [, navigate]   = useLocation();
  const [period,   setPeriod]   = useState<Period>("this_month");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (period !== "all_time") p.set("period", period);
    if (period === "custom") {
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo)   p.set("dateTo",   dateTo);
    }
    return p.toString();
  }, [period, dateFrom, dateTo]);

  const { data, isLoading } = useQuery<PIScore>({
    queryKey: ["/api/tickets/product-improvement-score", queryString],
    queryFn: async () => {
      const url = `/api/tickets/product-improvement-score${queryString ? `?${queryString}` : ""}`;
      const r   = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch product improvement score");
      return r.json();
    },
  });

  // Build the drill-down URL for a given status param
  function drillDownUrl(statusParam: string | null): string {
    const [from, to] = periodToDates(period, dateFrom, dateTo);
    const p = new URLSearchParams();
    if (statusParam) {
      p.set("status", statusParam);
    } else {
      p.set("excludeCompleted", "false"); // show all for "Ideas Submitted"
    }
    if (from) p.set("submittedFrom", from);
    if (to)   p.set("submittedTo",   to);
    return `/tickets?${p.toString()}`;
  }

  return (
    <Card data-testid="widget-product-improvement-score">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center shrink-0">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm font-semibold">Product Improvement Score</CardTitle>
          </div>

          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="h-7 text-xs w-[130px]" data-testid="select-pi-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {period === "custom" && (
          <div className="flex items-center gap-2 mt-2">
            <Input
              type="date"
              className="h-7 text-xs w-[140px]"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              data-testid="input-pi-date-from"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              className="h-7 text-xs w-[140px]"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              data-testid="input-pi-date-to"
            />
          </div>
        )}
      </CardHeader>

      <CardContent className="px-4 pb-4 pt-1">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {METRICS.map((m) => {
                const count = data ? (data[m.key] as number) : 0;
                const pct   = m.pctKey && data ? (data[m.pctKey] as number) : null;
                const Icon  = m.Icon;

                return (
                  <button
                    key={m.key}
                    className="text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => navigate(drillDownUrl(m.statusParam))}
                    data-testid={`pi-tile-${m.key}`}
                  >
                    <div className={`inline-flex items-center justify-center h-7 w-7 rounded-md ${m.bg} mb-2`}>
                      <Icon className={`h-4 w-4 ${m.color}`} />
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-tight mb-1">{m.label}</p>

                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className={`text-2xl font-bold tabular-nums leading-none ${m.color}`}>
                        {count.toLocaleString()}
                      </span>
                      {pct !== null && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {pct}%
                        </span>
                      )}
                    </div>

                    <p className="text-[10px] text-muted-foreground mt-1.5 leading-tight italic">
                      {m.insight}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Funnel progress bar */}
            {data && data.ideasSubmitted > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Funnel Overview
                </p>
                <FunnelBar label="Implemented" pct={data.implPct}    color="bg-violet-500" />
                <FunnelBar label="Accepted"    pct={data.acceptsPct} color="bg-emerald-500" />
                <FunnelBar label="Rework"      pct={data.reworkPct}  color="bg-red-500" />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function FunnelBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">{pct}%</span>
    </div>
  );
}
