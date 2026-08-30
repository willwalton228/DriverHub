/**
 * ClaimsDashboard.tsx — DriverHub Claims Dashboard
 * Reference implementation for the DriverHub Dashboard Standard.
 *
 * BUSINESS TIMEZONE: America/New_York (ET)
 *   All "today", "this week", and month-boundary calculations are anchored
 *   to Eastern Time to ensure consistency across users regardless of browser
 *   timezone.
 *
 * ACQUISITION DATE: 2026-02-09 (Feb 9, 2026)
 *   "Since Acquisition" period starts here and ends at today (dynamic).
 *
 * DATA SOURCE VERIFICATION:
 *   /api/corporate/accidents → calls storage.getAllAccidents().
 *   No pagination, no LIMIT clause, no row cap. Returns 100% of all claims.
 *   Safe to use for all aggregate and KPI calculations.
 *
 * UNAVAILABLE METRICS (per safeguard — do not fabricate):
 *   • Follow-ups Due (Today / This Week / Overdue)
 *       Requires: followUpDate field on accidents table (not in schema)
 *   • My Open Claims
 *       Requires: assignedToUserId field on accidents table (not in schema)
 *   • Waiting on Customer
 *       Requires: a dedicated "waiting_on_customer" value in claimStatus
 *   • Insurance Reserve
 *       Requires: insurance_reserve field or separate insurer payment records
 *   • Net Exposure
 *       Derived from Insurance Reserve (unavailable)
 *   • Average Resolution Days
 *       Requires: a closedAt timestamp on accidents; reviewDate exists but
 *       is not guaranteed to reflect the actual close date
 *   • Reopened Claims
 *       Requires: reopenedAt field or claim lifecycle history (not in schema)
 *   • Missing Documents
 *       Requires: a structured document-request tracking system
 *
 * METRIC DEFINITIONS:
 *   Open Claims         — COUNT where claimStatus NOT IN {CLOSED, PAID, DENIED}
 *                         AND incidentDate IN reporting period
 *   New Claims          — COUNT where incidentDate IN reporting period
 *   Closed Claims       — COUNT where claimStatus IN {CLOSED, PAID, DENIED}
 *                         AND incidentDate IN reporting period
 *   Financial Exposure  — SUM(probableCost) for open claims in period
 *   Avg Days Open       — MEAN(today − incidentDate) for open claims in period
 *   Claims / 1k Moves   — (newClaims / estimatedMovesInPeriod) × 1,000
 *                         estimatedMovesInPeriod ≈ (totalMoves30d / 30) × periodDays
 *                         Source: /api/claims/volume-stats (trailing 30d)
 *   Awaiting Documents  — COUNT where claimStatus = ADDITIONAL_INFO_REQUESTED
 *   Waiting on Insurance— COUNT where claimStatus = SENT_TO_CARRIER
 *   Aging 30+ Days      — COUNT open where daysSinceIncident ≥ 30
 *   Litigation Cases    — COUNT where litigationHoldActive = true (all statuses)
 *   Repeat Drivers      — COUNT drivers with > 1 open claim
 *   High-Value (>$50k)  — COUNT where probableCost > 50,000
 *   Cost Overrun >15%   — COUNT where actualCost > probableCost × 1.15
 *   Recoveries          — SUM(recoveredAmount) across all claims
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, ChevronRight,
  AlertTriangle, Clock, Shield, DollarSign, BarChart3, List,
  Plus, Mail, Info, AlertCircle, Loader2, ArrowRight,
  Activity, Users, CheckCircle2, FileBarChart, FileUp, Settings,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import type { Accident } from "@shared/schema";

// ─── Constants ─────────────────────────────────────────────────────────────────

/** DriverHub operations timezone — used for all date boundary calculations */
const BUSINESS_TZ = "America/New_York";
/** DriverHub acquisition date — lower bound for "Since Acquisition" period */
const ACQUISITION_DATE = "2026-02-09";
/** Claim statuses that indicate a closed/resolved claim */
const CLOSED_STATUSES = new Set(["CLOSED", "PAID", "DENIED"]);
const DASHBOARD_STATE_KEY = "claimsDashboardState";
const PRIMARY = "#5737f2";

// ─── Types ────────────────────────────────────────────────────────────────────

type PeriodPreset =
  | "since_acquisition" | "ytd" | "mtd"
  | "last_30d" | "last_90d" | "last_12m" | "custom";
type ComparisonPreset = "prior_year" | "prior_period" | "none";

interface DateRange { from: Date; to: Date }
interface DashboardState {
  periodPreset: PeriodPreset;
  customFrom: string;
  customTo: string;
  comparison: ComparisonPreset;
}
interface VolumeStats {
  totalMovesAllTime: number;
  totalMoves30d: number;
}
interface MonthlyPoint {
  label: string;     // "Jan '26"
  monthKey: string;  // "2026-01" — used for drill-down dateFrom/dateTo
  currentClaims: number;
  priorClaims: number;
  currentProbable: number;
  priorProbable: number;
  currentActual: number;
  priorActual: number;
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

/**
 * Returns today's date anchored to America/New_York midnight.
 * This prevents different users in different timezones from seeing
 * different "today" counts on the same dashboard.
 */
function getBusinessToday(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === "year")!.value;
  const m = parts.find(p => p.type === "month")!.value;
  const d = parts.find(p => p.type === "day")!.value;
  return new Date(`${y}-${m}-${d}T00:00:00`);
}

function getPeriodDates(
  preset: PeriodPreset, customFrom: string, customTo: string,
): DateRange {
  const today = getBusinessToday();
  switch (preset) {
    case "since_acquisition":
      return { from: new Date(`${ACQUISITION_DATE}T00:00:00`), to: today };
    case "ytd":
      return { from: new Date(today.getFullYear(), 0, 1), to: today };
    case "mtd":
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
    case "last_30d": { const f = new Date(today); f.setDate(f.getDate() - 30); return { from: f, to: today }; }
    case "last_90d": { const f = new Date(today); f.setDate(f.getDate() - 90); return { from: f, to: today }; }
    case "last_12m": { const f = new Date(today); f.setFullYear(f.getFullYear() - 1); return { from: f, to: today }; }
    case "custom":
      return {
        from: customFrom ? new Date(`${customFrom}T00:00:00`) : new Date(`${ACQUISITION_DATE}T00:00:00`),
        to: customTo ? new Date(`${customTo}T23:59:59`) : today,
      };
  }
}

function getComparisonDates(current: DateRange, comparison: ComparisonPreset): DateRange | null {
  if (comparison === "none") return null;
  if (comparison === "prior_year") {
    return {
      from: new Date(current.from.getFullYear() - 1, current.from.getMonth(), current.from.getDate()),
      to: new Date(current.to.getFullYear() - 1, current.to.getMonth(), current.to.getDate()),
    };
  }
  // prior_period: shift back by the same duration
  const ms = current.to.getTime() - current.from.getTime();
  return { from: new Date(current.from.getTime() - ms), to: new Date(current.from.getTime()) };
}

function formatPeriodLabel(preset: PeriodPreset, range: DateRange): string {
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (preset === "since_acquisition") return `Since Acquisition (Feb 9, 2026 – Today)`;
  if (preset === "ytd") return `Year to Date (Jan 1 – Today)`;
  if (preset === "mtd") return `Month to Date`;
  if (preset === "last_30d") return "Last 30 Days";
  if (preset === "last_90d") return "Last 90 Days";
  if (preset === "last_12m") return "Last 12 Months";
  return `${fmt(range.from)} – ${fmt(range.to)}`;
}

// ─── Claim Helpers ────────────────────────────────────────────────────────────

function getIncidentDate(a: Accident): Date | null {
  const raw = a.incidentDate || a.accidentDate;
  if (!raw) return null;
  const d = new Date(raw as unknown as string);
  return isNaN(d.getTime()) ? null : d;
}

function isActiveClaim(a: Accident): boolean {
  return !CLOSED_STATUSES.has((a.claimStatus || "").toUpperCase());
}

function inRange(d: Date | null, r: DateRange): boolean {
  return !!d && d >= r.from && d <= r.to;
}

function daysSince(d: Date | null, today: Date): number {
  if (!d) return 0;
  return Math.max(0, Math.floor((today.getTime() - d.getTime()) / 86_400_000));
}

function sum(arr: Accident[], fn: (a: Accident) => number): number {
  return arr.reduce((acc, a) => acc + fn(a), 0);
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { timeZone: BUSINESS_TZ, hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtDateStr(d: Date): string {
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function delta(curr: number, prior: number): { pct: number; dir: "up" | "down" | "flat" } {
  if (prior === 0 && curr === 0) return { pct: 0, dir: "flat" };
  if (prior === 0) return { pct: 100, dir: "up" };
  const pct = Math.round(((curr - prior) / Math.abs(prior)) * 100);
  return { pct: Math.abs(pct), dir: pct > 0 ? "up" : pct < 0 ? "down" : "flat" };
}

// ─── Dashboard State ──────────────────────────────────────────────────────────

function loadState(): DashboardState {
  try {
    const s = sessionStorage.getItem(DASHBOARD_STATE_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  return { periodPreset: "since_acquisition", customFrom: "", customTo: "", comparison: "prior_year" };
}

function saveState(s: DashboardState) {
  try { sessionStorage.setItem(DASHBOARD_STATE_KEY, JSON.stringify(s)); } catch {}
}

// ─── Chart Builder ────────────────────────────────────────────────────────────

function buildMonthlyData(accidents: Accident[], period: DateRange, compPeriod: DateRange | null): MonthlyPoint[] {
  const points: MonthlyPoint[] = [];
  const cursor = new Date(period.from.getFullYear(), period.from.getMonth(), 1);
  const periodEnd = new Date(period.to.getFullYear(), period.to.getMonth(), 1);

  while (cursor <= periodEnd) {
    const y = cursor.getFullYear();
    const mo = cursor.getMonth();
    const monthKey = `${y}-${String(mo + 1).padStart(2, "0")}`;
    const label = cursor.toLocaleDateString("en-US", { month: "short", year: "2-digit" });

    const inMonth = (a: Accident, yr: number, mn: number) => {
      const d = getIncidentDate(a);
      return !!d && d.getFullYear() === yr && d.getMonth() === mn;
    };

    const curr = accidents.filter(a => inMonth(a, y, mo));
    // For prior comparison: shift month by 1 year back (always), regardless of compPeriod type
    const priorY = compPeriod ? compPeriod.from.getFullYear() + (y - period.from.getFullYear()) : y - 1;
    const prior = compPeriod ? accidents.filter(a => inMonth(a, priorY, mo)) : [];

    points.push({
      label, monthKey,
      currentClaims: curr.length,
      priorClaims: prior.length,
      currentProbable: sum(curr, a => Number(a.probableCost) || 0),
      priorProbable: sum(prior, a => Number(a.probableCost) || 0),
      currentActual: sum(curr, a => Number(a.actualCost) || 0),
      priorActual: sum(prior, a => Number(a.actualCost) || 0),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return points;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({
  num, title, actionLabel, actionHref,
}: { num: number; title: string; actionLabel?: string; actionHref?: string }) {
  return (
    <div className="flex items-center justify-between mb-1.5">
      <div className="flex items-center gap-1.5">
        <span className="flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-white"
          style={{ background: PRIMARY }}>{num}</span>
        <h2 className="text-xs font-semibold text-[#182039] dark:text-foreground tracking-wide uppercase">{title}</h2>
      </div>
      {actionLabel && actionHref && (
        <Link href={actionHref}>
          <button className="text-xs font-medium hover:underline flex items-center gap-0.5" style={{ color: PRIMARY }}>
            {actionLabel} <ChevronRight className="h-3 w-3" />
          </button>
        </Link>
      )}
    </div>
  );
}

function UnavailableCard({ title, icon: Icon, note }: { title: string; icon: React.ElementType; note: string }) {
  return (
    <Card className="border border-border/50 shadow-none opacity-55">
      <CardContent className="px-2.5 py-2">
        <div className="flex items-start justify-between gap-1">
          <div className="flex items-center gap-1 text-muted-foreground min-w-0">
            <Icon className="h-3 w-3 shrink-0" />
            <span className="text-[11px] font-medium leading-tight truncate">{title}</span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 shrink-0 cursor-help text-muted-foreground/50 mt-px" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[220px] text-xs">{note}</TooltipContent>
          </Tooltip>
        </div>
        <div className="mt-0.5">
          <span className="text-lg font-bold tabular-nums text-muted-foreground/25">—</span>
        </div>
      </CardContent>
    </Card>
  );
}

function WorkPlanCard({
  title, icon: Icon, count, href, accent,
}: {
  title: string; icon: React.ElementType; count: number;
  href: string; accent?: "red" | "amber";
}) {
  const [, navigate] = useLocation();
  const color = accent === "red" ? "#ef4444" : accent === "amber" ? "#f59e0b" : PRIMARY;
  return (
    <button onClick={() => navigate(href)} className="w-full text-left h-full">
      <Card className="border border-border/50 shadow-none hover:border-[#5737f2]/40 hover:shadow-sm transition-all cursor-pointer group h-full">
        <CardContent className="px-2.5 py-2">
          <div className="flex items-start justify-between gap-1">
            <div className="flex items-center gap-1 text-muted-foreground group-hover:text-foreground transition-colors min-w-0">
              <Icon className="h-3 w-3 shrink-0" />
              <span className="text-[11px] font-medium leading-tight truncate">{title}</span>
            </div>
            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/30 group-hover:text-[#5737f2] transition-colors mt-px" />
          </div>
          <div className="mt-0.5">
            <span className="text-lg font-bold tabular-nums" style={{ color }}>{count.toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

/** Directional indicator with correct valence */
function DeltaBadge({
  dir, pct, positiveIsGood,
}: { dir: "up" | "down" | "flat"; pct: number; positiveIsGood: boolean }) {
  if (dir === "flat") return <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Minus className="h-3 w-3" /> —</span>;
  const isGood = (dir === "up") === positiveIsGood;
  const color = isGood ? "#16a34a" : "#dc2626";
  const Icon = dir === "up" ? TrendingUp : TrendingDown;
  return (
    <span className="text-xs font-medium flex items-center gap-0.5" style={{ color }}>
      <Icon className="h-3 w-3" />
      {pct}%
    </span>
  );
}

function KpiCard({
  title, value, subLabel, comparison, delta: d, positiveIsGood, href, isLoading,
}: {
  title: string; value: string; subLabel?: string; comparison?: string;
  delta?: { pct: number; dir: "up" | "down" | "flat" };
  positiveIsGood: boolean; href: string; isLoading?: boolean;
}) {
  const [, navigate] = useLocation();
  if (isLoading) return (
    <Card className="border border-border/50 shadow-none">
      <CardContent className="px-2.5 py-2 space-y-1">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-5 w-14" />
        <Skeleton className="h-2.5 w-16" />
      </CardContent>
    </Card>
  );
  return (
    <button onClick={() => navigate(href)} className="w-full text-left">
      <Card className="border border-border/50 shadow-none hover:border-[#5737f2]/40 hover:shadow-sm transition-all cursor-pointer group">
        <CardContent className="px-2.5 py-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider leading-none">{title}</p>
          <p className="text-xl font-bold mt-0.5 text-[#182039] dark:text-foreground tabular-nums leading-tight">{value}</p>
          {subLabel && <p className="text-[10px] text-muted-foreground leading-tight">{subLabel}</p>}
          <div className="mt-0.5 flex items-center gap-2">
            {d && <DeltaBadge dir={d.dir} pct={d.pct} positiveIsGood={positiveIsGood} />}
            {comparison && <span className="text-[10px] text-muted-foreground">{comparison}</span>}
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

/**
 * TwoLineChart — replaces the old bar+line ComposedChart.
 * Current period: DriverHub purple solid line with dots.
 * Comparison period: neutral gray dashed line with dots.
 * Both series visible in legend; hover tooltip shows both values.
 */
function TwoLineChart({
  title, data, dataKey, compKey, formatter, onPointClick, periodLabel, compLabel,
}: {
  title: string;
  data: MonthlyPoint[];
  dataKey: keyof MonthlyPoint;
  compKey: keyof MonthlyPoint;
  formatter?: (v: number) => string;
  onPointClick: (monthKey: string) => void;
  periodLabel: string;
  compLabel: string | null;
}) {
  const currentTotal = data.reduce((s, p) => s + (p[dataKey] as number), 0);
  const priorTotal = data.reduce((s, p) => s + (p[compKey] as number), 0);
  const d = delta(currentTotal, priorTotal);
  const fmt = formatter || ((v: number) => v.toLocaleString());
  const hasPrior = compLabel !== null && data.some(p => (p[compKey] as number) > 0);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide leading-none">{title}</p>
          <p className="text-base font-bold text-[#182039] dark:text-foreground mt-0.5 tabular-nums leading-tight">{fmt(currentTotal)}</p>
          {hasPrior && priorTotal > 0 && (
            <div className="flex items-center gap-1 mt-0.5">
              <DeltaBadge dir={d.dir} pct={d.pct} positiveIsGood={false} />
              <span className="text-[10px] text-muted-foreground">vs {fmt(priorTotal)} {compLabel}</span>
            </div>
          )}
        </div>
      </div>
      {data.length === 0 ? (
        <div className="h-28 flex items-center justify-center text-xs text-muted-foreground">No data for selected period</div>
      ) : (
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={data} margin={{ top: 2, right: 8, left: -18, bottom: 0 }}
            onClick={(e) => {
              if (e?.activePayload?.[0]?.payload?.monthKey) {
                onPointClick(e.activePayload[0].payload.monthKey);
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false}
              tickFormatter={v => fmt(v)} width={42} />
            <ReTooltip
              contentStyle={{ fontSize: 11, border: "1px solid #e5e7eb", borderRadius: 6 }}
              formatter={(v: number, name: string) => [fmt(v), name]}
            />
            {hasPrior && <Legend wrapperStyle={{ fontSize: 10 }} iconType="line" />}
            <Line dataKey={dataKey as string} name={periodLabel}
              stroke={PRIMARY} strokeWidth={2}
              dot={{ r: 3, fill: PRIMARY, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              style={{ cursor: "pointer" }} />
            {hasPrior && (
              <Line dataKey={compKey as string} name={compLabel!}
                stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="4 2"
                dot={{ r: 2, fill: "#9ca3af", strokeWidth: 0 }}
                activeDot={{ r: 4 }} />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ClaimsDashboard() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { isSuperAdmin, isAdmin, user } = useAuth();
  const canManageClaimsControls = isAdmin || user?.role === "corporate_admin" || user?.isRootSuperAdmin === true || user?.corporateAccessAdmin === true;

  // ── Reporting controls ────────────────────────────────────────────────────
  const _init = useMemo(loadState, []);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>(_init.periodPreset);
  const [customFrom, setCustomFrom] = useState(_init.customFrom);
  const [customTo, setCustomTo] = useState(_init.customTo);
  const [comparison, setComparison] = useState<ComparisonPreset>(_init.comparison);

  // Persist dashboard state on every change
  useEffect(() => {
    saveState({ periodPreset, customFrom, customTo, comparison });
  }, [periodPreset, customFrom, customTo, comparison]);

  // ── Refresh tracking ──────────────────────────────────────────────────────
  const [refreshedAt, setRefreshedAt] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const {
    data: accidents, isLoading: loadingClaims, isError: claimsError, refetch: refetchClaims,
  } = useQuery<Accident[]>({
    queryKey: ["/api/corporate/accidents"],
    staleTime: 2 * 60 * 1000,
  });

  const {
    data: volumeStats, isLoading: loadingVol,
  } = useQuery<VolumeStats>({
    queryKey: ["/api/claims/volume-stats"],
    staleTime: 5 * 60 * 1000,
  });

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchClaims(),
        queryClient.invalidateQueries({ queryKey: ["/api/claims/volume-stats"] }),
      ]);
      // Only update timestamp on successful refresh
      setRefreshedAt(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, [refetchClaims, queryClient]);

  // ── Period computation ────────────────────────────────────────────────────
  const period = useMemo(
    () => getPeriodDates(periodPreset, customFrom, customTo),
    [periodPreset, customFrom, customTo],
  );
  const compPeriod = useMemo(
    () => getComparisonDates(period, comparison),
    [period, comparison],
  );
  const today = useMemo(getBusinessToday, []);

  // ── Drill-down helper ──────────────────────────────────────────────────────
  const drillTo = useCallback((params: Record<string, string>) => {
    const qs = new URLSearchParams({ ...params, from: "claims-dashboard" }).toString();
    navigate(`/claims?${qs}`);
  }, [navigate]);

  const drillChartMonth = useCallback((monthKey: string) => {
    const [y, m] = monthKey.split("-");
    const from = `${y}-${m}-01`;
    const lastDay = new Date(Number(y), Number(m), 0).getDate();
    const to = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
    drillTo({ dateFrom: from, dateTo: to });
  }, [drillTo]);

  // ── Filtered accident sets ─────────────────────────────────────────────────
  const all = accidents || [];
  const periodAccidents = useMemo(
    () => all.filter(a => inRange(getIncidentDate(a), period)),
    [all, period],
  );
  const compAccidents = useMemo(
    () => compPeriod ? all.filter(a => inRange(getIncidentDate(a), compPeriod)) : [],
    [all, compPeriod],
  );
  const allActive = useMemo(() => all.filter(isActiveClaim), [all]);
  const periodActive = useMemo(
    () => periodAccidents.filter(isActiveClaim),
    [periodAccidents],
  );
  const compActive = useMemo(
    () => compAccidents.filter(isActiveClaim),
    [compAccidents],
  );

  // ── Section 1 — Work Plan ──────────────────────────────────────────────────
  // All Work Plan metrics are scoped to the selected reporting period (periodActive).
  const awaitingDocs = useMemo(
    () => periodActive.filter(a => a.claimStatus === "ADDITIONAL_INFO_REQUESTED"),
    [periodActive],
  );
  const waitingInsurance = useMemo(
    () => periodActive.filter(a => a.claimStatus === "SENT_TO_CARRIER"),
    [periodActive],
  );
  // Aging 30+ Days: claims in reporting period that have been open ≥ 30 days.
  // PROXY: uses incidentDate as the claim-open date because no createdAt/submittedAt
  // field exists in the accidents schema. Claims filed late (after incident) may
  // appear in the wrong period or with inflated aging. Shown with tooltip.
  const aging30Plus = useMemo(
    () => periodActive.filter(a => daysSince(getIncidentDate(a), today) >= 30),
    [periodActive, today],
  );

  // ── Section 2 — Executive Summary KPIs ────────────────────────────────────
  //
  // METRIC DEFINITIONS (source · formula · date basis · drill-down):
  //
  // Open Claims
  //   Source:      claimStatus on accidents
  //   Formula:     COUNT where claimStatus NOT IN {CLOSED, PAID, DENIED} AND incidentDate IN period
  //   Date basis:  incidentDate in selected reporting period — same population as all other metrics
  //   Drill-down:  /claims?status=active&dateFrom=<from>&dateTo=<to>
  const openClaimsCurrent = periodActive.length;

  // New Claims
  //   Source:      incidentDate (fallback: accidentDate) on accidents
  //   Formula:     COUNT where incidentDate IN [period.from, period.to]
  //   Date basis:  Incident occurrence date — the closest available proxy for "claim filed".
  //                The accidents table has no createdAt or submittedAt field.
  //                Claims filed late (after incident) may appear in the wrong period.
  //   Drill-down:  /claims?dateFrom=<from>&dateTo=<to>
  const newClaimsCurrent = periodAccidents.length;
  const newClaimsPrior = compAccidents.length;

  // Closed Claims
  //   Source:      closedAt timestamp — NOT AVAILABLE in accidents schema.
  //                claimStatus tracks CLOSED/PAID/DENIED but there is no timestamp
  //                recording when the status changed. Cannot reliably scope by period.
  //   Status:      UNAVAILABLE — displayed as N/A with tooltip.
  // (no computation needed)

  // Financial Exposure
  //   Source:      probableCost on accidents
  //   Formula:     SUM(probableCost) for active claims with incidentDate in period
  //   Date basis:  incidentDate in period; status is current (not historical)
  //   Drill-down:  /claims?status=active&dateFrom=<from>&dateTo=<to>
  const exposureCurrent = sum(periodActive, a => Number(a.probableCost) || 0);
  const exposurePrior   = sum(compActive,  a => Number(a.probableCost) || 0);

  // Average Days Open
  //   Source:      incidentDate on accidents
  //   Formula:     MEAN(period.to − incidentDate) for active claims with incidentDate in period
  //   Date basis:  period.to (reporting-period end), NOT today — ensures consistency across users
  //                and reporting periods. Only open claims included; no closedAt for closed claims.
  //   Drill-down:  /claims?status=active&dateFrom=<from>&dateTo=<to>
  const avgDaysOpenCurrent = periodActive.length
    ? Math.round(
        periodActive.reduce((s, a) => {
          const d = getIncidentDate(a);
          return s + (d ? Math.max(0, Math.floor((period.to.getTime() - d.getTime()) / 86_400_000)) : 0);
        }, 0) / periodActive.length
      )
    : 0;
  const avgDaysOpenPrior = compActive.length && compPeriod
    ? Math.round(
        compActive.reduce((s, a) => {
          const d = getIncidentDate(a);
          return s + (d ? Math.max(0, Math.floor((compPeriod.to.getTime() - d.getTime()) / 86_400_000)) : 0);
        }, 0) / compActive.length
      )
    : 0;

  // Claims per 1,000 Moves
  //   Numerator:   New claims (by incidentDate) in reporting period.
  //   Denominator: Estimated moves in period = (totalMoves30d / 30) × periodDays.
  //                totalMoves30d comes from /api/claims/volume-stats (trailing 30-day window).
  //                LIMITATION: The denominator is an approximation assuming a constant daily
  //                move rate. No date-aware move endpoint exists. Most accurate when period = Last 30 Days.
  //                Move date: tripDate. Canceled/incomplete move exclusion: unknown (not filtered by volume-stats).
  //                When move count is zero: shown as "—" (not divided by zero).
  //   Drill-down:  /claims?dateFrom=<from>&dateTo=<to>
  const periodDays = Math.max(1, Math.round((period.to.getTime() - period.from.getTime()) / 86_400_000));
  const dailyMoveRate = volumeStats ? volumeStats.totalMoves30d / 30 : 0;
  const estMovesInPeriod = dailyMoveRate * periodDays;
  const claims1kCurrent = estMovesInPeriod > 0
    ? Math.round((newClaimsCurrent / estMovesInPeriod) * 1000 * 10) / 10 : 0;
  const compDays = compPeriod ? Math.max(1, Math.round((compPeriod.to.getTime() - compPeriod.from.getTime()) / 86_400_000)) : periodDays;
  const estMovesComp = dailyMoveRate * compDays;
  const claims1kPrior = estMovesComp > 0
    ? Math.round((newClaimsPrior / estMovesComp) * 1000 * 10) / 10 : 0;

  // Labels for comparison series in KPI delta badges and chart legends
  const compLabel: string | null = comparison === "prior_year"
    ? "same period last year"
    : comparison === "prior_period"
    ? "prev equivalent period"
    : null;
  // Short form for comparison deltas shown below KPI values
  const compDeltaLabel: string | undefined = comparison === "prior_year"
    ? "vs same period last year"
    : comparison === "prior_period"
    ? "vs prev equivalent period"
    : undefined;

  // ── Section 3 — YoY Charts ─────────────────────────────────────────────────
  const monthlyData = useMemo(
    () => buildMonthlyData(all, period, compPeriod),
    [all, period, compPeriod],
  );

  // ── Section 4 — Claims Health ──────────────────────────────────────────────
  // All Health metrics are scoped to the selected reporting period (periodActive).
  // Aging is measured by daysSince(incidentDate, today) — incidentDate is the only
  // available date proxy (no createdAt/claimOpenDate in schema).
  const lt7 = periodActive.filter(a => daysSince(getIncidentDate(a), today) < 7);
  const d7to30 = periodActive.filter(a => { const d = daysSince(getIncidentDate(a), today); return d >= 7 && d <= 30; });
  const d31to90 = periodActive.filter(a => { const d = daysSince(getIncidentDate(a), today); return d > 30 && d <= 90; });
  const gt90 = periodActive.filter(a => daysSince(getIncidentDate(a), today) > 90);
  const totalOpen = periodActive.length;

  // Financial Exposure — period-scoped: all rows use periodActive for consistency.
  // Actual Cost All Time uses `all` (all claims incl. closed) — explicitly labeled supplemental.
  const probableCostSum = sum(periodActive, a => Number(a.probableCost) || 0);
  const actualCostSum   = sum(all,          a => Number(a.actualCost)   || 0); // supplemental — all-time
  const recoveriesSum   = sum(periodActive, a => Number((a as any).recoveredAmount) || 0);

  const litigationCases = periodActive.filter(a => (a as any).litigationHoldActive === true);

  // Repeat Driver Incidents
  //   Definition:  Drivers with more than 1 active claim where incidentDate falls in the
  //                reporting period. Counts unique drivers (by driverId), not individual claims.
  //                Each claim counts once per driver. Only active claims are included.
  //   Window:      Selected reporting period (incidentDate in period.from–period.to)
  //   Minimum:     > 1 claim per driver
  //   Basis:       driverId (not driver name — resistant to name changes)
  //   Drill-down:  Not yet supported — ClaimsQueue cannot filter to a set of driverIds via URL
  const driverPeriodCounts = new Map<string, number>();
  periodActive.forEach(a => { // scoped to reporting period
    const id = a.driverId;
    if (id) driverPeriodCounts.set(id, (driverPeriodCounts.get(id) || 0) + 1);
  });
  const repeatDriverCount = Array.from(driverPeriodCounts.values()).filter(c => c > 1).length;

  // High-Value Claims — period-scoped active claims where probableCost > $50,000
  const highValueClaims = periodActive.filter(a => Number(a.probableCost) > 50_000);

  // Actual Exceeds Probable >15% — period-scoped
  //   Compares current actualCost to current probableCost (not a historical baseline).
  //   Both must be > 0; claims with no payment or no estimate are excluded.
  const costOverrunClaims = periodAccidents.filter(a => {
    const prob = Number(a.probableCost);
    const actual = Number(a.actualCost);
    return prob > 0 && actual > 0 && actual > prob * 1.15;
  });

  // Net Exposure (partial — insurance reserve excluded)
  //   Formula:  Probable Cost Outstanding − Recoveries Received
  //   Source:   probableCost (active claims in period) − recoveredAmount (all claims)
  //   Note:     Insurance reserve is not in the data model. Full net exposure formula is:
  //             Probable Cost − Insurance Reserve − Recoveries. Shown as partial with tooltip.
  const netExposurePartial = probableCostSum - recoveriesSum;

  const managerExceptions = gt90.length + costOverrunClaims.length + repeatDriverCount + highValueClaims.length;

  // ── Render ─────────────────────────────────────────────────────────────────
  const isLoading = loadingClaims;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Sticky zone: page header + reporting controls ─────────────────── */}
      <div className="sticky top-0 z-50 bg-background">

        {/* Page Header — compact single row: breadcrumb · title · data timestamp · actions */}
        <div className="border-b border-border px-4 py-1.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground leading-none">
                Claims / <span className="font-medium text-foreground/70">Dashboard</span>
              </p>
              <h1 className="text-base font-bold tracking-tight text-[#182039] dark:text-foreground leading-none mt-0.5">
                Claims Dashboard
              </h1>
            </div>
            <div className="flex items-center gap-2 border-l border-border/60 pl-3 shrink-0">
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                Data as of {fmtTime(refreshedAt)} ET
              </span>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {canManageClaimsControls && (
                <Link href="/claims/controls">
                  <Button variant="outline" size="sm" className="h-8 text-xs border-[#d7dbe4]" data-testid="button-claims-controls">
                    <Settings className="h-3.5 w-3.5 mr-1.5" />
                    Controls
                  </Button>
                </Link>
              )}
              <Link href="/claims/reports">
                <Button variant="outline" size="sm" className="h-8 text-xs border-[#d7dbe4]" data-testid="button-claims-reports">
                  <FileBarChart className="h-3.5 w-3.5 mr-1.5" />
                  Reports
                </Button>
              </Link>
              <Link href="/reports/widget-library">
                <Button variant="outline" size="sm" className="h-8 text-xs border-[#d7dbe4]" data-testid="button-widget-library">
                  <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                  Widget Library
                </Button>
              </Link>
              {isSuperAdmin && (
                <Link href="/claims/import">
                  <Button variant="outline" size="sm" className="h-8 text-xs border-[#d7dbe4]" data-testid="button-import-claims-dashboard">
                    <FileUp className="h-3.5 w-3.5 mr-1.5" />
                    Import Claims
                  </Button>
                </Link>
              )}
              {/* Email Summary — not yet implemented */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button variant="outline" size="sm" className="h-8 text-xs opacity-40 cursor-not-allowed" disabled>
                      <Mail className="h-3.5 w-3.5 mr-1.5" />
                      Email Summary
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="text-xs max-w-[200px]">
                  Email delivery not yet configured. Requires backend email integration.
                </TooltipContent>
              </Tooltip>
              <Link href="/claims">
                <Button variant="outline" size="sm" className="h-8 text-xs border-[#d7dbe4]">
                  <List className="h-3.5 w-3.5 mr-1.5" />
                  Claims List
                </Button>
              </Link>
              <Link href="/claims/new">
                <Button size="sm" className="h-8 text-xs text-white" style={{ background: PRIMARY }}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  New Claim
                </Button>
              </Link>
          </div>
        </div>

        {/* Reporting Controls */}
        <div className="border-b border-border px-4 py-1.5 bg-muted/30 flex flex-wrap items-center gap-3">
          {/* Period preset */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground font-medium whitespace-nowrap">Period</span>
            <Select value={periodPreset} onValueChange={v => setPeriodPreset(v as PeriodPreset)}>
              <SelectTrigger className="h-7 text-xs w-[200px] border-[#d7dbe4]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="since_acquisition">Since Acquisition</SelectItem>
                <SelectItem value="ytd">Year to Date</SelectItem>
                <SelectItem value="mtd">Month to Date</SelectItem>
                <SelectItem value="last_30d">Last 30 Days</SelectItem>
                <SelectItem value="last_90d">Last 90 Days</SelectItem>
                <SelectItem value="last_12m">Last 12 Months</SelectItem>
                <SelectItem value="custom">Custom Range…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Custom date range */}
          {periodPreset === "custom" && (
            <div className="flex items-center gap-1.5">
              <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="h-7 text-xs w-[130px] border-[#d7dbe4]" />
              <span className="text-xs text-muted-foreground">–</span>
              <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="h-7 text-xs w-[130px] border-[#d7dbe4]" />
            </div>
          )}
          {/* Scope — single-org (Driver on Demand). Disabled until multi-org support is added. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 opacity-60">
                <span className="text-[11px] text-muted-foreground font-medium whitespace-nowrap">Scope</span>
                <Select value="dod" disabled>
                  <SelectTrigger className="h-7 text-xs w-[170px] border-[#d7dbe4] cursor-not-allowed">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dod">Driver on Demand</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TooltipTrigger>
            <TooltipContent className="text-xs max-w-[220px]">
              Scope is fixed to Driver on Demand. Multi-organization scope filtering requires a market/org partition in the data model.
            </TooltipContent>
          </Tooltip>
          {/* Comparison */}
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-[11px] text-muted-foreground font-medium whitespace-nowrap cursor-help flex items-center gap-0.5">
                  Compare <Info className="h-3 w-3 text-muted-foreground/50" />
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-xs max-w-[260px] space-y-1.5">
                <p><strong>Same Period Last Year</strong> — same calendar start/end dates shifted back one year.</p>
                <p><strong>Previous Equivalent Period</strong> — the immediately preceding date range of equal length.</p>
              </TooltipContent>
            </Tooltip>
            <Select value={comparison} onValueChange={v => setComparison(v as ComparisonPreset)}>
              <SelectTrigger className="h-7 text-xs w-[210px] border-[#d7dbe4]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prior_year">Same Period Last Year</SelectItem>
                <SelectItem value="prior_period">Previous Equivalent Period</SelectItem>
                <SelectItem value="none">No Comparison</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Period label */}
          <span className="text-[11px] text-muted-foreground ml-auto hidden md:block">
            {formatPeriodLabel(periodPreset, period)}
          </span>
        </div>

      </div>

      {/* ── Scrollable content ───────────────────────────────────────────────── */}
      <div className="overflow-y-auto flex-1 px-4 pt-3 pb-6 space-y-3">

        {/* Error state */}
        {claimsError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Failed to load claims data. <button onClick={() => refetchClaims()} className="underline ml-1">Retry</button>
          </div>
        )}

        {/* ── Section 1 — Today's Work Plan ─────────────────────────────────── */}
        <section>
          <SectionHeader num={1} title="Today's Work Plan"
            actionLabel="View All" actionHref="/claims?status=active" />
          {/* auto-fill: all 8 cards on one row at ≥1920px; wraps only when viewport genuinely requires */}
          <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))" }}>
            {/* Unavailable: Follow-ups Due Today */}
            <UnavailableCard title="Follow-ups Today" icon={Clock}
              note="Requires a followUpDate field on claims. Not yet in the data model." />
            {/* Unavailable: Follow-ups Due This Week */}
            <UnavailableCard title="Follow-ups Week" icon={Clock}
              note="Requires a followUpDate field on claims. Not yet in the data model." />
            {/* Unavailable: Overdue Follow-ups */}
            <UnavailableCard title="Overdue" icon={AlertTriangle}
              note="Requires a followUpDate field on claims. Not yet in the data model." />
            {/* Awaiting Documents — period-scoped claimStatus = ADDITIONAL_INFO_REQUESTED */}
            {isLoading ? (
              <Card className="border border-border/50 shadow-none"><CardContent className="px-2.5 py-2 space-y-1"><Skeleton className="h-3 w-24" /><Skeleton className="h-5 w-10" /></CardContent></Card>
            ) : (
              <WorkPlanCard
                title="Documents"
                icon={AlertTriangle}
                count={awaitingDocs.length}
                href={`/claims?status=ADDITIONAL_INFO_REQUESTED&dateFrom=${fmtDateStr(period.from)}&dateTo=${fmtDateStr(period.to)}`}
              />
            )}
            {/* Waiting on Insurance — period-scoped claimStatus = SENT_TO_CARRIER */}
            {isLoading ? (
              <Card className="border border-border/50 shadow-none"><CardContent className="px-2.5 py-2 space-y-1"><Skeleton className="h-3 w-24" /><Skeleton className="h-5 w-10" /></CardContent></Card>
            ) : (
              <WorkPlanCard
                title="Insurance"
                icon={Shield}
                count={waitingInsurance.length}
                href={`/claims?status=SENT_TO_CARRIER&dateFrom=${fmtDateStr(period.from)}&dateTo=${fmtDateStr(period.to)}`}
              />
            )}
            {/* Unavailable: Waiting on Customer */}
            <UnavailableCard title="Customer" icon={Users}
              note="Requires a 'waiting_on_customer' status in the claim lifecycle. Not yet in the data model." />
            {/* Unavailable: My Open Claims */}
            <UnavailableCard title="Open Claims" icon={Activity}
              note="Requires assignedToUserId on claims. Not yet in the data model." />
            {/* Aging Claims 30+ Days — period-scoped; tooltip explains incident-date proxy */}
            {isLoading ? (
              <Card className="border border-border/50 shadow-none"><CardContent className="px-2.5 py-2 space-y-1"><Skeleton className="h-3 w-24" /><Skeleton className="h-5 w-10" /></CardContent></Card>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="h-full">
                    <WorkPlanCard
                      title="Aging 30+"
                      icon={Clock}
                      count={aging30Plus.length}
                      href={`/claims?status=active&dateFrom=${fmtDateStr(period.from)}&dateTo=${fmtDateStr(period.to)}&ageDaysMin=30`}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs max-w-[240px]">
                  Claims in the selected reporting period open ≥ 30 days. Aging uses incident date as a proxy — no claim-open date is available in the schema.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </section>

        {/* ── Section 2 — Executive Summary ────────────────────────────────── */}
        <section>
          <SectionHeader num={2} title="Executive Summary" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Open Claims — period-scoped: incidentDate in selected period, active status */}
            <KpiCard title="Open Claims"
              value={openClaimsCurrent.toLocaleString()}
              subLabel="Active claims in selected period"
              positiveIsGood={false}
              href={`/claims?status=active&dateFrom=${fmtDateStr(period.from)}&dateTo=${fmtDateStr(period.to)}`}
              isLoading={isLoading}
            />
            {/* New Incidents — uses incidentDate (no createdAt/submittedAt field available) */}
            <KpiCard title="New Incidents"
              value={newClaimsCurrent.toLocaleString()}
              subLabel="By incident date in period"
              delta={compDeltaLabel ? delta(newClaimsCurrent, newClaimsPrior) : undefined}
              comparison={compDeltaLabel}
              positiveIsGood={false}
              href={`/claims?dateFrom=${fmtDateStr(period.from)}&dateTo=${fmtDateStr(period.to)}`}
              isLoading={isLoading}
            />
            {/* Closed Claims — N/A: no closedAt timestamp in schema */}
            {isLoading ? (
              <Card className="border border-border/50 shadow-none">
                <CardContent className="p-3 space-y-1.5">
                  <Skeleton className="h-3 w-24" /><Skeleton className="h-6 w-16" />
                </CardContent>
              </Card>
            ) : (
              <Card className="border border-border/50 shadow-none">
                <CardContent className="p-3">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Closed Claims</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-muted-foreground/40 italic text-xl font-bold flex items-center gap-1 cursor-help">
                          N/A <Info className="h-3.5 w-3.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs max-w-[240px]">
                        Requires a closedAt timestamp on claims. The accidents table tracks current status (CLOSED/PAID/DENIED) but does not record when the status changed. Cannot scope closed claims to a reporting period without this field.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">No close date in data model</p>
                </CardContent>
              </Card>
            )}
            {/* Financial Exposure — period-scoped probable cost (active claims, incidentDate in period) */}
            <KpiCard title="Financial Exposure"
              value={fmt$(exposureCurrent)}
              subLabel="Probable cost, active in period"
              delta={compDeltaLabel ? delta(exposureCurrent, exposurePrior) : undefined}
              comparison={compDeltaLabel}
              positiveIsGood={false}
              href={`/claims?status=active&dateFrom=${fmtDateStr(period.from)}&dateTo=${fmtDateStr(period.to)}`}
              isLoading={isLoading}
            />
            {/* Avg Days Open */}
            <KpiCard title="Avg Days Open"
              value={`${avgDaysOpenCurrent}d`}
              subLabel="Active claims in period"
              delta={compDeltaLabel ? delta(avgDaysOpenCurrent, avgDaysOpenPrior) : undefined}
              comparison={compDeltaLabel}
              positiveIsGood={false}
              href={`/claims?status=active&dateFrom=${fmtDateStr(period.from)}&dateTo=${fmtDateStr(period.to)}`}
              isLoading={isLoading || loadingVol}
            />
            {/* Claims / 1k Moves — shown only for Last 30 Days (denominator matches exactly) */}
            {/* For all other periods the trailing-30d move volume is not period-matched → N/A */}
            {(isLoading || loadingVol) ? (
              <Card className="border border-border/50 shadow-none">
                <CardContent className="p-4 space-y-2">
                  <Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-16" />
                </CardContent>
              </Card>
            ) : periodPreset === "last_30d" ? (
              <KpiCard title="Incidents / 1k Moves"
                value={claims1kCurrent.toString()}
                subLabel={`${(volumeStats?.totalMoves30d ?? 0).toLocaleString()} moves (30d)`}
                positiveIsGood={false}
                href={`/claims?dateFrom=${fmtDateStr(period.from)}&dateTo=${fmtDateStr(period.to)}`}
                isLoading={false}
              />
            ) : (
              <Card className="border border-border/50 shadow-none">
                <CardContent className="p-3">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Incidents / 1k Moves</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-muted-foreground/40 italic text-xl font-bold flex items-center gap-1 cursor-help">
                          N/A <Info className="h-3.5 w-3.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs max-w-[240px]">
                        A date-aware move-volume endpoint is required to compute this metric accurately for periods other than Last 30 Days. The available move count covers only a trailing 30-day window and cannot be reliably scaled to arbitrary periods.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">Select Last 30 Days to enable</p>
                </CardContent>
              </Card>
            )}
          </div>
        </section>

        {/* ── Section 3 — Year-over-Year Performance ───────────────────────── */}
        <section>
          <SectionHeader num={3} title="Year-over-Year Performance"
            actionLabel="View All" actionHref="/claims" />
          {isLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
              {[0, 1, 2].map(i => (
                <Card key={i} className="border border-border/50 shadow-none">
                  <CardContent className="p-2 space-y-1.5">
                    <Skeleton className="h-2.5 w-24" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-[150px] w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
              <Card className="border border-border/50 shadow-none">
                <CardContent className="p-2">
                  <TwoLineChart title="Claims Reported" data={monthlyData}
                    dataKey="currentClaims" compKey="priorClaims"
                    onPointClick={drillChartMonth}
                    periodLabel="This Period"
                    compLabel={compLabel} />
                </CardContent>
              </Card>
              <Card className="border border-border/50 shadow-none">
                <CardContent className="p-2">
                  <TwoLineChart title="Probable Cost" data={monthlyData}
                    dataKey="currentProbable" compKey="priorProbable"
                    formatter={fmt$} onPointClick={drillChartMonth}
                    periodLabel="This Period"
                    compLabel={compLabel} />
                </CardContent>
              </Card>
              <Card className="border border-border/50 shadow-none">
                <CardContent className="p-2">
                  <TwoLineChart title="Actual Cost" data={monthlyData}
                    dataKey="currentActual" compKey="priorActual"
                    formatter={fmt$} onPointClick={drillChartMonth}
                    periodLabel="This Period"
                    compLabel={compLabel} />
                </CardContent>
              </Card>
            </div>
          )}
        </section>

        {/* ── Section 4 — Claims Health ─────────────────────────────────────── */}
        <section>
          <SectionHeader num={4} title="Claims Health" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

            {/* Aging Buckets — period-scoped (periodActive) */}
            <Card className="border border-border/50 shadow-none">
              <CardHeader className="px-3 pt-3 pb-1">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-[#182039] dark:text-foreground">Aging Buckets</CardTitle>
                  <button onClick={() => drillTo({ status: "active", dateFrom: fmtDateStr(period.from), dateTo: fmtDateStr(period.to) })}
                    className="text-xs hover:underline flex items-center gap-0.5" style={{ color: PRIMARY }}>
                    View All <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                {isLoading ? <Skeleton className="h-24 w-full" /> : (
                  <div className="space-y-1.5">
                    {/* Each bucket passes period dates + dedicated age params so the two concepts don't
                        collide. dateFrom/dateTo pins incidentDate to the selected period;
                        ageDaysMin/ageDaysMax pins daysSince(incidentDate,today) to the bucket range.
                        ClaimsQueue applies both filters independently → drill-down count = card count. */}
                    {[
                      { label: "< 7 days",     count: lt7.length,    ageMin: "0",  ageMax: "6"  },
                      { label: "7 – 30 days",  count: d7to30.length, ageMin: "7",  ageMax: "30" },
                      { label: "31 – 90 days", count: d31to90.length,ageMin: "31", ageMax: "90" },
                      { label: "90+ days",     count: gt90.length,   ageMin: "91", ageMax: "",   accent: gt90.length > 0 ? "text-red-600" : "" },
                    ].map(({ label, count, ageMin, ageMax, accent }) => (
                      <button key={label} onClick={() => drillTo({
                        status: "active",
                        dateFrom: fmtDateStr(period.from),
                        dateTo: fmtDateStr(period.to),
                        ageDaysMin: ageMin,
                        ...(ageMax ? { ageDaysMax: ageMax } : {}),
                      })}
                        className="w-full flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 transition-colors group">
                        <span className="text-xs text-muted-foreground">{label}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-semibold tabular-nums ${accent || ""}`}>{count}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {totalOpen > 0 ? `${Math.round((count / totalOpen) * 100)}%` : "—"}
                          </span>
                          <ChevronRight className="h-3 w-3 text-muted-foreground/30 group-hover:text-[#5737f2]" />
                        </div>
                      </button>
                    ))}
                    <div className="border-t border-border/50 mt-1.5 pt-1.5 flex items-center justify-between px-2">
                      <span className="text-xs font-medium text-foreground">Total Open</span>
                      <span className="text-sm font-bold tabular-nums" style={{ color: PRIMARY }}>{totalOpen}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Financial Exposure — period-scoped; active exposure rows use periodActive */}
            <Card className="border border-border/50 shadow-none">
              <CardHeader className="px-3 pt-3 pb-1">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-[#182039] dark:text-foreground">Financial Exposure</CardTitle>
                  <button onClick={() => drillTo({ status: "active", dateFrom: fmtDateStr(period.from), dateTo: fmtDateStr(period.to) })}
                    className="text-xs hover:underline flex items-center gap-0.5" style={{ color: PRIMARY }}>
                    View All <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                {isLoading ? <Skeleton className="h-24 w-full" /> : (
                  <div className="space-y-0.5">
                     {/* ── Period Exposure ──────────────────────────────────────── */}
                    {/* All three rows use periodActive (incidentDate in selected period, active status) */}
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-1 pb-0.5">Period Exposure</p>
                    <div className="flex items-center justify-between py-1 px-1">
                      <span className="text-xs text-muted-foreground">Probable Cost</span>
                      <span className="text-sm font-semibold tabular-nums">{fmt$(probableCostSum)}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 px-1">
                      <span className="text-xs text-muted-foreground">Recoveries Received</span>
                      <span className="text-sm font-semibold tabular-nums">{fmt$(recoveriesSum)}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 px-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-muted-foreground cursor-help flex items-center gap-1">
                            Insurance Reserve <Info className="h-3 w-3 text-muted-foreground/40" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs max-w-[220px]">
                          Requires an insurance_reserve field. Not yet in the accidents data model.
                        </TooltipContent>
                      </Tooltip>
                      <span className="text-xs text-muted-foreground/40 italic">N/A</span>
                    </div>
                    <div className="flex items-center justify-between py-1 px-1 border-t border-border/50 mt-0.5 pt-1.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs font-medium text-foreground cursor-help flex items-center gap-1">
                            Net Exposure (Partial) <Info className="h-3 w-3 text-muted-foreground/40" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs max-w-[240px]">
                          Probable Cost − Recoveries Received. Insurance Reserve excluded (not in schema). Full formula: Probable Cost − Insurance Reserve − Recoveries.
                        </TooltipContent>
                      </Tooltip>
                      <span className="text-sm font-bold tabular-nums">{fmt$(netExposurePartial)}</span>
                    </div>
                    {/* ── Supplemental Context ─────────────────────────────────── */}
                    {/* Actual Cost uses all claims (incl. closed) — visually separated to prevent */}
                    {/* confusion with the active-exposure section above                             */}
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-3 pb-0.5">Supplemental Context</p>
                    <div className="flex items-center justify-between py-1 px-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-muted-foreground cursor-help flex items-center gap-1">
                            Actual Cost Incurred — All Time <Info className="h-3 w-3 text-muted-foreground/40" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs max-w-[220px]">
                          SUM of actualCost across all claims, including closed. Not part of the active-exposure calculation above.
                        </TooltipContent>
                      </Tooltip>
                      <span className="text-sm font-semibold tabular-nums">{fmt$(actualCostSum)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Operational Performance */}
            <Card className="border border-border/50 shadow-none">
              <CardHeader className="px-3 pt-3 pb-1">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-[#182039] dark:text-foreground">Operational Performance</CardTitle>
                  <button onClick={() => drillTo({ dateFrom: fmtDateStr(period.from), dateTo: fmtDateStr(period.to) })}
                    className="text-xs hover:underline flex items-center gap-0.5" style={{ color: PRIMARY }}>
                    View All <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                {(isLoading || loadingVol) ? <Skeleton className="h-24 w-full" /> : (
                  <div className="space-y-1.5">
                    {/* Incidents/1k Moves — N/A for all periods except Last 30 Days (denominator is */}
                    {/* trailing-30d totalMoves30d; must match period to avoid misleading values)     */}
                    <div className="flex items-center justify-between py-1 px-1">
                      {periodPreset === "last_30d" ? (
                        <span className="text-xs text-muted-foreground">Incidents per 1,000 Moves</span>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs text-muted-foreground cursor-help flex items-center gap-1">
                              Incidents per 1,000 Moves <Info className="h-3 w-3 text-muted-foreground/40" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs max-w-[240px]">
                            A date-matched move denominator is unavailable for this period. The available move count covers only a trailing 30-day window. Select Last 30 Days to enable this metric.
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {periodPreset === "last_30d"
                        ? <span className="text-sm font-semibold tabular-nums">{claims1kCurrent}</span>
                        : <span className="text-xs text-muted-foreground/40 italic">N/A</span>
                      }
                    </div>
                    <div className="flex items-center justify-between py-1 px-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-muted-foreground cursor-help flex items-center gap-1">
                            Avg Resolution Days <Info className="h-3 w-3 text-muted-foreground/40" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs max-w-[220px]">
                          Requires a closedAt timestamp on claims. Not yet in the data model.
                        </TooltipContent>
                      </Tooltip>
                      <span className="text-xs text-muted-foreground/40 italic">N/A</span>
                    </div>
                    <div className="flex items-center justify-between py-1 px-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-muted-foreground cursor-help flex items-center gap-1">
                            Reopened Claims (30d) <Info className="h-3 w-3 text-muted-foreground/40" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs max-w-[220px]">
                          Requires a reopenedAt field or claim lifecycle history. Not yet in the data model.
                        </TooltipContent>
                      </Tooltip>
                      <span className="text-xs text-muted-foreground/40 italic">N/A</span>
                    </div>
                    <button onClick={() => drillTo({ status: "active", dateFrom: fmtDateStr(period.from), dateTo: fmtDateStr(period.to) })}
                      className="w-full flex items-center justify-between py-1 px-1 rounded hover:bg-muted/50 transition-colors group">
                      <span className="text-xs text-muted-foreground">Litigation Cases</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-semibold tabular-nums ${litigationCases.length > 0 ? "text-amber-600" : ""}`}>
                          {litigationCases.length}
                        </span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground/30 group-hover:text-[#5737f2]" />
                      </div>
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Manager Attention */}
            <Card className="border border-border/50 shadow-none">
              <CardHeader className="px-3 pt-3 pb-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-semibold text-[#182039] dark:text-foreground">Manager Attention</CardTitle>
                    {managerExceptions > 0 && (
                      <Badge className="h-4 px-1.5 text-[10px] bg-red-100 text-red-700 border-red-200 font-semibold">
                        {managerExceptions}
                      </Badge>
                    )}
                  </div>
                  <button onClick={() => drillTo({ status: "active", dateFrom: fmtDateStr(period.from), dateTo: fmtDateStr(period.to) })}
                    className="text-xs hover:underline flex items-center gap-0.5" style={{ color: PRIMARY }}>
                    View All <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                {isLoading ? <Skeleton className="h-24 w-full" /> : (
                  <div className="space-y-1">
                    {/* Claims > 90 days — ageDaysMin=91 matches card filter (daysSince > 90, i.e. ≥ 91) */}
                    {/* period dateFrom/dateTo preserves selected reporting period                     */}
                    <button
                      onClick={() => drillTo({ status: "active", dateFrom: fmtDateStr(period.from), dateTo: fmtDateStr(period.to), ageDaysMin: "91" })}
                      className="w-full flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 transition-colors group"
                    >
                      <span className="text-xs text-muted-foreground">Claims older than 90 days</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-semibold tabular-nums ${gt90.length > 0 ? "text-red-600" : ""}`}>{gt90.length}</span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground/30 group-hover:text-[#5737f2]" />
                      </div>
                    </button>
                    {/* Actual Cost Exceeds Probable by >15% */}
                    {/* Formula: actualCost > probableCost × 1.15, both > 0                          */}
                    {/* Not labeled "cost increase" — probableCost has no revision history so there  */}
                    {/* is no prior baseline to compare against.                                     */}
                    <div className="flex items-center justify-between py-1.5 px-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-muted-foreground cursor-help flex items-center gap-1">
                            Actual exceeds probable by {">"} 15% <Info className="h-3 w-3 text-muted-foreground/40" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs max-w-[280px]">
                          Claims where actualCost {">"} probableCost × 1.15, with both values {">"} 0. Compares current actual payment to current probable-cost estimate — not a historical cost increase (no baseline revision history is available). Drill-down not supported.
                        </TooltipContent>
                      </Tooltip>
                      <span className={`text-sm font-semibold tabular-nums ${costOverrunClaims.length > 0 ? "text-amber-600" : ""}`}>{costOverrunClaims.length}</span>
                    </div>
                    {/* Missing documents */}
                    <div className="flex items-center justify-between py-1.5 px-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-muted-foreground cursor-help flex items-center gap-1">
                            Claims missing documents <Info className="h-3 w-3 text-muted-foreground/40" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs max-w-[220px]">
                          Requires a document-request tracking system. Not yet in the data model.
                        </TooltipContent>
                      </Tooltip>
                      <span className="text-xs text-muted-foreground/40 italic">N/A</span>
                    </div>
                    {/* Repeat driver incidents — no drill-down (cannot filter by multi-driver ID set) */}
                    <div className="flex items-center justify-between py-1.5 px-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-muted-foreground cursor-help flex items-center gap-1">
                            Repeat driver incidents <Info className="h-3 w-3 text-muted-foreground/40" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs max-w-[260px]">
                          Unique drivers with more than 1 active claim within the reporting period. Identified by driverId. Drill-down not available — the Claims List does not support filtering to a specific set of driver IDs via URL.
                        </TooltipContent>
                      </Tooltip>
                      <span className={`text-sm font-semibold tabular-nums ${repeatDriverCount > 0 ? "text-amber-600" : ""}`}>{repeatDriverCount}</span>
                    </div>
                    {/* High-value > $50k probable — drills to pre-filtered list via probableCostMin param */}
                    <button
                      onClick={() => drillTo({ status: "active", probableCostMin: "50000" })}
                      className="w-full flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 transition-colors group"
                    >
                      <span className="text-xs text-muted-foreground">High-value claims ({">"} $50k probable)</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-semibold tabular-nums ${highValueClaims.length > 0 ? "text-red-600" : ""}`}>{highValueClaims.length}</span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground/30 group-hover:text-[#5737f2]" />
                      </div>
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </section>

      </div>
    </div>
  );
}

