/**
 * RoadmapReliability — KPI widget for the AMR Roadmap Dashboard
 *
 * Measures on-time delivery of roadmap AMRs against their committed
 * Scheduled Deployment Date.  The committed date is locked when the
 * Scheduled Deployment Date is first set; subsequent changes are audited
 * but do not affect the reliability denominator.
 *
 * Permissions: same as ProductImprovementScore (PI_ROLES + Will Walton)
 */

import { useState, useMemo } from "react";
import { useQuery }          from "@tanstack/react-query";
import {
  TrendingUp, TrendingDown, Minus, Target,
  CheckCircle2, AlertCircle, HelpCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton }  from "@/components/ui/skeleton";
import { Badge }     from "@/components/ui/badge";
import { Input }     from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = "today" | "this_week" | "this_month" | "this_quarter" | "this_year" | "custom";
type DrillFilter = "all" | "on_time" | "late" | "unscheduled";

interface ReliabilityData {
  pct:              number | null;
  onTime:           number;
  late:             number;
  total:            number;
  unscheduled:      number;
  prevPct:          number | null;
  prevPeriodLabel:  string;
}

interface DrillRow {
  id:                          string;
  ticketNumber:                string;
  title:                       string;
  epicName:                    string | null;
  scheduledDevelopmentDate:    string | null;
  firstScheduledDeploymentDate: string | null;
  scheduledDeploymentDate:     string | null;
  completedAt:                 string;
  daysEarlyLate:               number | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "today",        label: "Today"        },
  { value: "this_week",    label: "This Week"    },
  { value: "this_month",   label: "This Month"   },
  { value: "this_quarter", label: "This Quarter" },
  { value: "this_year",    label: "This Year"    },
  { value: "custom",       label: "Custom Range" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch { return d; }
}

function pctColorClass(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 90)    return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 75)    return "text-yellow-600  dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

// ── Widget ────────────────────────────────────────────────────────────────────

export function RoadmapReliability() {
  const [period,      setPeriod]      = useState<Period>("this_month");
  const [dateFrom,    setDateFrom]    = useState("");
  const [dateTo,      setDateTo]      = useState("");
  const [drillOpen,   setDrillOpen]   = useState(false);
  const [drillFilter, setDrillFilter] = useState<DrillFilter>("all");

  // Build query-strings for the two API calls
  const qs = useMemo(() => {
    const p = new URLSearchParams({ period });
    if (period === "custom") {
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo)   p.set("dateTo",   dateTo);
    }
    return p.toString();
  }, [period, dateFrom, dateTo]);

  const drillQs = useMemo(() => {
    const p = new URLSearchParams({ period, filter: drillFilter });
    if (period === "custom") {
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo)   p.set("dateTo",   dateTo);
    }
    return p.toString();
  }, [period, dateFrom, dateTo, drillFilter]);

  const { data, isLoading } = useQuery<ReliabilityData>({
    queryKey: ["/api/tickets/roadmap-reliability", qs],
    queryFn:  async () => {
      const r = await fetch(`/api/tickets/roadmap-reliability?${qs}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch roadmap reliability");
      return r.json();
    },
  });

  const { data: drillData, isLoading: drillLoading } = useQuery<DrillRow[]>({
    queryKey: ["/api/tickets/roadmap-reliability/drill", drillQs],
    queryFn:  async () => {
      const r = await fetch(`/api/tickets/roadmap-reliability/drill?${drillQs}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch reliability drill");
      return r.json();
    },
    enabled: drillOpen,
  });

  const trend        = (data && data.pct !== null && data.prevPct !== null) ? data.pct - data.prevPct : null;
  const periodLabel  = PERIOD_OPTIONS.find(o => o.value === period)?.label ?? "";

  return (
    <>
      {/* ── KPI card ──────────────────────────────────────────────────────── */}
      <Card
        className="cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => setDrillOpen(true)}
        data-testid="card-roadmap-reliability"
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-violet-500" />
              Roadmap Reliability
            </CardTitle>

            {/* Period selector — stop propagation so the card click doesn't fire */}
            <div onClick={e => e.stopPropagation()} className="flex items-center gap-2">
              <Select value={period} onValueChange={v => setPeriod(v as Period)}>
                <SelectTrigger className="h-7 text-xs w-36" data-testid="select-reliability-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {period === "custom" && (
                <>
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="h-7 text-xs w-32" placeholder="From" />
                  <span className="text-xs text-muted-foreground">–</span>
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="h-7 text-xs w-32" placeholder="To" />
                </>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-24" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          ) : data ? (
            <div className="space-y-1.5">

              {/* Main percentage */}
              <div
                className={`text-5xl font-bold tabular-nums leading-none ${pctColorClass(data.pct)}`}
                data-testid="text-reliability-pct"
              >
                {data.pct !== null ? `${data.pct}%` : "—"}
              </div>

              {/* Period-over-period trend */}
              {trend !== null && (
                <div
                  className={`flex items-center gap-1 text-sm font-medium ${
                    trend > 0  ? "text-emerald-600 dark:text-emerald-400"
                    : trend < 0 ? "text-red-600 dark:text-red-400"
                    : "text-muted-foreground"
                  }`}
                  data-testid="text-reliability-trend"
                >
                  {trend > 0  ? <TrendingUp  className="h-3.5 w-3.5" />
                   : trend < 0 ? <TrendingDown className="h-3.5 w-3.5" />
                   : <Minus className="h-3.5 w-3.5" />}
                  {trend > 0  ? `↑ ${trend}%`
                   : trend < 0 ? `↓ ${Math.abs(trend)}%`
                   : "No change"}{" "}
                  <span className="font-normal text-muted-foreground">vs. {data.prevPeriodLabel}</span>
                </div>
              )}

              {/* Count summary */}
              <p className="text-sm text-muted-foreground" data-testid="text-reliability-summary">
                {data.onTime} of {data.total} roadmap AMRs delivered on time
                {data.unscheduled > 0 && (
                  <span className="text-muted-foreground/70"> · {data.unscheduled} unscheduled</span>
                )}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No data available</p>
          )}

          <p className="text-xs text-muted-foreground/60 mt-4">
            Click to view underlying AMRs
          </p>
        </CardContent>
      </Card>

      {/* ── Drill-down dialog ──────────────────────────────────────────────── */}
      <Dialog open={drillOpen} onOpenChange={setDrillOpen}>
        <DialogContent
          className="max-w-5xl max-h-[85vh] flex flex-col gap-0 p-0"
          data-testid="dialog-reliability-drill"
        >
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-3">
              <Target className="h-5 w-5 text-violet-500 shrink-0" />
              Roadmap Reliability — {periodLabel}
              {data?.pct !== null && data?.pct !== undefined && (
                <span className={`text-xl font-bold ${pctColorClass(data.pct)}`}>
                  {data.pct}%
                </span>
              )}
            </DialogTitle>
            {data && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {data.onTime} on time · {data.late} late · {data.unscheduled} unscheduled
              </p>
            )}
          </DialogHeader>

          <div className="flex-1 flex flex-col overflow-hidden px-6 pt-4 pb-6">
            <Tabs
              value={drillFilter}
              onValueChange={v => setDrillFilter(v as DrillFilter)}
              className="flex-1 flex flex-col min-h-0"
            >
              <TabsList className="shrink-0 w-fit">
                <TabsTrigger value="all" data-testid="tab-drill-all">
                  All {data ? `(${data.total + data.unscheduled})` : ""}
                </TabsTrigger>
                <TabsTrigger value="on_time" data-testid="tab-drill-on-time">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                  On Time {data ? `(${data.onTime})` : ""}
                </TabsTrigger>
                <TabsTrigger value="late" data-testid="tab-drill-late">
                  <AlertCircle className="h-3.5 w-3.5 mr-1.5 text-red-600" />
                  Late {data ? `(${data.late})` : ""}
                </TabsTrigger>
                <TabsTrigger value="unscheduled" data-testid="tab-drill-unscheduled">
                  <HelpCircle className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  Unscheduled {data ? `(${data.unscheduled})` : ""}
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-auto mt-4">
                {drillLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : !drillData || drillData.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <Target className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No AMRs match this filter for the selected period</p>
                  </div>
                ) : (
                  <table
                    className="w-full text-sm border-collapse"
                    data-testid="table-reliability-drill"
                  >
                    <thead className="sticky top-0 bg-background border-b z-10">
                      <tr className="text-left">
                        <th className="py-2 pr-4 font-medium text-muted-foreground text-xs whitespace-nowrap">AMR #</th>
                        <th className="py-2 pr-4 font-medium text-muted-foreground text-xs">Issue / Idea</th>
                        <th className="py-2 pr-4 font-medium text-muted-foreground text-xs whitespace-nowrap">Epic</th>
                        <th className="py-2 pr-4 font-medium text-muted-foreground text-xs whitespace-nowrap">Sched. Dev</th>
                        <th className="py-2 pr-4 font-medium text-muted-foreground text-xs whitespace-nowrap">Sched. Deploy</th>
                        <th className="py-2 pr-4 font-medium text-muted-foreground text-xs whitespace-nowrap">Actual Deploy</th>
                        <th className="py-2 font-medium text-muted-foreground text-xs whitespace-nowrap">Days Early / Late</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {drillData.map(row => (
                        <tr
                          key={row.id}
                          className="hover:bg-muted/30 transition-colors"
                          data-testid={`row-drill-${row.id}`}
                        >
                          <td className="py-2.5 pr-4 font-mono text-xs whitespace-nowrap text-muted-foreground">
                            {row.ticketNumber}
                          </td>
                          <td className="py-2.5 pr-4 max-w-xs">
                            <span className="line-clamp-2 text-xs leading-snug">{row.title}</span>
                          </td>
                          <td className="py-2.5 pr-4 whitespace-nowrap">
                            {row.epicName ? (
                              <Badge variant="outline" className="text-xs font-normal">
                                {row.epicName}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2.5 pr-4 whitespace-nowrap text-xs">
                            {fmtDate(row.scheduledDevelopmentDate)}
                          </td>
                          <td className="py-2.5 pr-4 whitespace-nowrap text-xs">
                            {fmtDate(row.firstScheduledDeploymentDate)}
                          </td>
                          <td className="py-2.5 pr-4 whitespace-nowrap text-xs">
                            {fmtDate(row.completedAt)}
                          </td>
                          <td className="py-2.5 whitespace-nowrap">
                            {row.daysEarlyLate === null ? (
                              <span className="text-xs text-muted-foreground">Unscheduled</span>
                            ) : row.daysEarlyLate === 0 ? (
                              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-0 text-xs font-normal">
                                On time
                              </Badge>
                            ) : row.daysEarlyLate < 0 ? (
                              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-0 text-xs font-normal">
                                {Math.abs(row.daysEarlyLate)}d early
                              </Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-0 text-xs font-normal">
                                {row.daysEarlyLate}d late
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
