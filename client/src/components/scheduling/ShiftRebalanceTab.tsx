import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Clock,
  TrendingDown,
  Users,
  AlertTriangle,
  RefreshCw,
  MapPin,
  Briefcase,
  CircleDollarSign,
  CheckCircle,
  XCircle,
  Info,
  Shuffle,
  UserCheck,
  FileQuestion,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

type WorkerType = "employee" | "contractor" | "unknown";

interface RebalanceDriver {
  wiwUserId: string;
  driverId: string | null;
  name: string;
  projectedHours: number;
  workedHours: number;
  remainingScheduledHours: number;
  workerType: WorkerType;
}

interface RebalanceShift {
  shiftId: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  locationId: string | null;
  locationName: string | null;
  positionId: string | null;
  positionName: string | null;
}

interface ShiftRebalanceRecommendation {
  id: string;
  fromDriver: RebalanceDriver;
  toDriver: RebalanceDriver;
  shift: RebalanceShift;
  otSavedHours: number;
  costImpact: number;
  toDriverNewTotal: number;
}

interface WorkerGroupStats {
  otDriverCount: number;
  underDriverCount: number;
  totalOtSavedHours: number;
  totalCostSaved: number;
  recommendations: ShiftRebalanceRecommendation[];
}

interface ShiftRebalanceResult {
  generatedAt: string;
  weekStart: string;
  weekEnd: string;
  employees: WorkerGroupStats;
  contractors: WorkerGroupStats;
  unknown: WorkerGroupStats;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtHours(h: number): string {
  return `${h.toFixed(1)}h`;
}

function fmtCost(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function HoursBadge({ hours, threshold = 40 }: { hours: number; threshold?: number }) {
  const pct = Math.min((hours / threshold) * 100, 100);
  const color =
    hours >= threshold         ? "bg-red-500"
    : hours >= threshold * 0.9 ? "bg-orange-500"
    : hours >= threshold * 0.75 ? "bg-yellow-500"
    : "bg-blue-400";
  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-xs tabular-nums font-medium w-10 shrink-0">{fmtHours(hours)}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <div className="rounded-md border bg-card p-4 flex items-center gap-3">
      <div className={cn("h-10 w-10 rounded-md flex items-center justify-center shrink-0", accent ?? "bg-primary/10")}>
        <Icon className={cn("h-5 w-5", accent ? "text-white" : "text-primary")} />
      </div>
      <div>
        <p className="text-2xl font-bold leading-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

// ── Recommendation Row ────────────────────────────────────────────────────────

interface RecRowProps {
  rec: ShiftRebalanceRecommendation;
  dismissed: boolean;
  onDismiss: (id: string) => void;
  showCost: boolean;
}

function RecRow({ rec, dismissed, onDismiss, showCost }: RecRowProps) {
  if (dismissed) return null;

  const shiftDate = (() => {
    try { return format(parseISO(rec.shift.startTime), "EEE M/d"); } catch { return "—"; }
  })();
  const shiftStart = (() => {
    try { return format(parseISO(rec.shift.startTime), "h:mm a"); } catch { return "—"; }
  })();
  const shiftEnd = (() => {
    try { return format(parseISO(rec.shift.endTime), "h:mm a"); } catch { return "—"; }
  })();

  return (
    <tr className="border-b last:border-0 hover-elevate" data-testid={`row-rebalance-${rec.id}`}>
      {/* From Driver */}
      <td className="py-3 pl-4 pr-3">
        <div className="space-y-1">
          <p className="text-sm font-medium leading-tight">{rec.fromDriver.name}</p>
          <HoursBadge hours={rec.fromDriver.projectedHours} />
          <p className="text-xs text-muted-foreground">
            Projected {fmtHours(rec.fromDriver.projectedHours)}
            {" "}
            <span className="text-red-600 dark:text-red-400 font-medium">
              (+{fmtHours(rec.fromDriver.projectedHours - 40)} over)
            </span>
          </p>
        </div>
      </td>

      {/* Arrow */}
      <td className="py-3 px-2 text-center">
        <ArrowRight className="h-4 w-4 text-muted-foreground mx-auto" />
      </td>

      {/* To Driver */}
      <td className="py-3 px-3">
        <div className="space-y-1">
          <p className="text-sm font-medium leading-tight">{rec.toDriver.name}</p>
          <HoursBadge hours={rec.toDriver.projectedHours} />
          <p className="text-xs text-muted-foreground">
            Currently {fmtHours(rec.toDriver.projectedHours)} → {fmtHours(rec.toDriverNewTotal)} after
          </p>
        </div>
      </td>

      {/* Shift */}
      <td className="py-3 px-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{shiftDate}</p>
          <p className="text-xs text-muted-foreground">{shiftStart} – {shiftEnd}</p>
          {rec.shift.locationName && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate max-w-[140px]">{rec.shift.locationName}</span>
            </div>
          )}
          {rec.shift.positionName && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Briefcase className="h-3 w-3 shrink-0" />
              <span>{rec.shift.positionName}</span>
            </div>
          )}
        </div>
      </td>

      {/* Hours saved */}
      <td className="py-3 px-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">
            {fmtHours(rec.otSavedHours)}
          </span>
          <span className="text-xs text-muted-foreground">hrs redistributed</span>
        </div>
      </td>

      {/* Cost (employees only) */}
      {showCost && (
        <td className="py-3 px-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-green-600 dark:text-green-400">
              {fmtCost(rec.costImpact)}
            </span>
            <span className="text-xs text-muted-foreground">OT premium saved</span>
          </div>
        </td>
      )}

      {/* Actions */}
      <td className="py-3 pr-4 pl-2">
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" disabled data-testid={`btn-apply-${rec.id}`} className="text-xs">
                <CheckCircle className="h-3 w-3 mr-1" />
                Apply
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Apply in WhenIWork — coming in v2</p>
            </TooltipContent>
          </Tooltip>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDismiss(rec.id)}
            data-testid={`btn-dismiss-${rec.id}`}
            className="text-xs text-muted-foreground"
          >
            <XCircle className="h-3 w-3 mr-1" />
            Dismiss
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ── Group Table ───────────────────────────────────────────────────────────────

interface GroupTableProps {
  group: WorkerGroupStats;
  dismissed: Set<string>;
  onDismiss: (id: string) => void;
  onClearDismissed: () => void;
  showCost: boolean;
  emptyLabel: string;
}

function GroupTable({ group, dismissed, onDismiss, onClearDismissed, showCost, emptyLabel }: GroupTableProps) {
  const visible = group.recommendations.filter(r => !dismissed.has(r.id));

  if (group.recommendations.length === 0) {
    return (
      <div className="py-12 text-center">
        {group.otDriverCount === 0 ? (
          <>
            <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm font-medium">No overtime risk this week</p>
            <p className="text-xs text-muted-foreground mt-1">{emptyLabel}</p>
          </>
        ) : (
          <>
            <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {group.otDriverCount > 0
                ? "OT-bound drivers found, but no valid reassignment candidates available."
                : "No rebalancing needed this week."}
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 px-4 py-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          {visible.length} of {group.recommendations.length} recommendation{group.recommendations.length !== 1 ? "s" : ""}
          {dismissed.size > 0 && ` (${dismissed.size} dismissed)`}
        </p>
        {dismissed.size > 0 && (
          <Button
            variant="ghost" size="sm"
            onClick={onClearDismissed}
            className="text-xs text-muted-foreground"
            data-testid="btn-restore-dismissed"
          >
            Restore {dismissed.size} dismissed
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="py-10 text-center">
          <Info className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">All recommendations dismissed.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onClearDismissed}>
            Restore All
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="py-2.5 pl-4 pr-3 text-left text-xs font-medium text-muted-foreground">From Driver (over 40h)</th>
                <th className="py-2.5 px-2" />
                <th className="py-2.5 px-3 text-left text-xs font-medium text-muted-foreground">To Driver (available)</th>
                <th className="py-2.5 px-3 text-left text-xs font-medium text-muted-foreground">Shift</th>
                <th className="py-2.5 px-3 text-left text-xs font-medium text-muted-foreground">Hours</th>
                {showCost && (
                  <th className="py-2.5 px-3 text-left text-xs font-medium text-muted-foreground">Cost Impact</th>
                )}
                <th className="py-2.5 pr-4 pl-2 text-left text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {group.recommendations.map(rec => (
                <RecRow
                  key={rec.id}
                  rec={rec}
                  dismissed={dismissed.has(rec.id)}
                  onDismiss={onDismiss}
                  showCost={showCost}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Dismissed state helpers ───────────────────────────────────────────────────

const DISMISSED_KEY_EMP = "shift_rebalance_dismissed_emp_v1";
const DISMISSED_KEY_IC  = "shift_rebalance_dismissed_ic_v1";
const DISMISSED_KEY_UNK = "shift_rebalance_dismissed_unk_v1";

function loadDismissed(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function saveDismissed(key: string, ids: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...ids])); } catch { /* ignore */ }
}

function useDismissed(storageKey: string) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed(storageKey));
  const dismiss = useCallback((id: string) => {
    setDismissed(prev => {
      const next = new Set(prev); next.add(id);
      saveDismissed(storageKey, next); return next;
    });
  }, [storageKey]);
  const clear = useCallback(() => {
    setDismissed(new Set());
    saveDismissed(storageKey, new Set());
  }, [storageKey]);
  return { dismissed, dismiss, clear };
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

export function ShiftRebalanceTab() {
  const empDismiss = useDismissed(DISMISSED_KEY_EMP);
  const icDismiss  = useDismissed(DISMISSED_KEY_IC);
  const unkDismiss = useDismissed(DISMISSED_KEY_UNK);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<ShiftRebalanceResult>({
    queryKey: ["/api/scheduling/wheniwork/shift-rebalance"],
    queryFn: () => fetch("/api/scheduling/wheniwork/shift-rebalance").then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const empRecs  = data?.employees.recommendations ?? [];
  const icRecs   = data?.contractors.recommendations ?? [];
  const unkRecs  = data?.unknown.recommendations ?? [];

  const visEmp  = empRecs.filter(r => !empDismiss.dismissed.has(r.id));
  const visIc   = icRecs.filter(r  => !icDismiss.dismissed.has(r.id));
  const visUnk  = unkRecs.filter(r => !unkDismiss.dismissed.has(r.id));

  const totalEmpCost = visEmp.reduce((s, r) => s + r.costImpact, 0);
  const totalIcHrs   = visIc.reduce((s, r) => s + r.otSavedHours, 0);
  const totalUnkHrs  = visUnk.reduce((s, r) => s + r.otSavedHours, 0);

  // Tab badge counts
  const empCount = (data?.employees.recommendations ?? []).length;
  const icCount  = (data?.contractors.recommendations ?? []).length;
  const unkCount = (data?.unknown.recommendations ?? []).length;

  return (
    <div className="space-y-6" data-testid="section-shift-rebalance">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-primary" />
            Shift Rebalancing Engine
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Identifies drivers over 40h and recommends shifts to redistribute.
            {data && (
              <span className="ml-2 text-xs">
                Week of {format(parseISO(data.weekStart), "M/d")} —{" "}
                {format(parseISO(data.weekEnd), "M/d/yyyy")}
              </span>
            )}
          </p>
        </div>
        <Button
          variant="outline" size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="btn-rebalance-refresh"
        >
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Error */}
      {isError && (
        <div className="flex items-center gap-2 py-4 text-sm" data-testid="error-shift-rebalance">
          <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
          <span className="text-muted-foreground">Unable to load rebalancing data.</span>
          <Button variant="ghost" size="sm" className="h-auto p-0 text-sm" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-md" />)}
          </div>
          <Skeleton className="h-64 rounded-md" />
        </div>
      ) : data ? (
        <Tabs defaultValue="employees" className="space-y-4">
          <TabsList>
            <TabsTrigger value="employees" data-testid="tab-rebalance-employees" className="gap-1.5">
              <UserCheck className="h-3.5 w-3.5" />
              W-2 Employees
              {empCount > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{empCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="contractors" data-testid="tab-rebalance-contractors" className="gap-1.5">
              <Shuffle className="h-3.5 w-3.5" />
              Independent Contractors
              {icCount > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{icCount}</Badge>
              )}
            </TabsTrigger>
            {unkCount > 0 && (
              <TabsTrigger value="unknown" data-testid="tab-rebalance-unknown" className="gap-1.5">
                <FileQuestion className="h-3.5 w-3.5" />
                Unclassified
                <Badge variant="secondary" className="ml-1 text-xs">{unkCount}</Badge>
              </TabsTrigger>
            )}
          </TabsList>

          {/* ── Employee Tab ───────────────────────────────────────────── */}
          <TabsContent value="employees" className="space-y-4 mt-0">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                label="OT-bound employees"
                value={String(data.employees.otDriverCount)}
                sub="projected > 40h"
                icon={AlertTriangle}
                accent="bg-red-500"
              />
              <KpiCard
                label="Available employees"
                value={String(data.employees.underDriverCount)}
                sub="projected < 30h"
                icon={Users}
                accent="bg-blue-500"
              />
              <KpiCard
                label="OT hours avoidable"
                value={fmtHours(data.employees.totalOtSavedHours)}
                sub={`across ${empRecs.length} recommendations`}
                icon={Clock}
              />
              <KpiCard
                label="OT premium savings"
                value={fmtCost(totalEmpCost)}
                sub="est. at $11/OT hr (FLSA)"
                icon={CircleDollarSign}
              />
            </div>

            <Card data-testid="card-rebalance-employee-table">
              <CardHeader className="pb-0">
                <CardTitle className="text-base">Employee Reassignments</CardTitle>
                <CardDescription>
                  Each reassignment reduces FLSA overtime exposure. Cost impact = 0.5× base rate per OT hour avoided.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 pt-2">
                <GroupTable
                  group={data.employees}
                  dismissed={empDismiss.dismissed}
                  onDismiss={empDismiss.dismiss}
                  onClearDismissed={empDismiss.clear}
                  showCost={true}
                  emptyLabel="All W-2 employees are within normal hour ranges."
                />
              </CardContent>
            </Card>

            {empRecs.length > 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0" />
                Cost estimates use $22/hr base and $11/hr OT premium. Apply in WhenIWork available in v2.
              </p>
            )}
          </TabsContent>

          {/* ── Contractor Tab ─────────────────────────────────────────── */}
          <TabsContent value="contractors" className="space-y-4 mt-0">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <KpiCard
                label="Overloaded contractors"
                value={String(data.contractors.otDriverCount)}
                sub="projected > 40h"
                icon={AlertTriangle}
                accent="bg-orange-500"
              />
              <KpiCard
                label="Available contractors"
                value={String(data.contractors.underDriverCount)}
                sub="projected < 30h"
                icon={Users}
                accent="bg-blue-500"
              />
              <KpiCard
                label="Hours to redistribute"
                value={fmtHours(totalIcHrs)}
                sub={`across ${icRecs.length} recommendations`}
                icon={Clock}
              />
            </div>

            <Card data-testid="card-rebalance-ic-table">
              <CardHeader className="pb-0">
                <CardTitle className="text-base">IC Load Balancing</CardTitle>
                <CardDescription>
                  No FLSA overtime premium applies to ICs. Recommendations reduce driver fatigue and improve service quality.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 pt-2">
                <GroupTable
                  group={data.contractors}
                  dismissed={icDismiss.dismissed}
                  onDismiss={icDismiss.dismiss}
                  onClearDismissed={icDismiss.clear}
                  showCost={false}
                  emptyLabel="All independent contractors are within normal hour ranges."
                />
              </CardContent>
            </Card>

            {icRecs.length > 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0" />
                No cost-savings model applies to independent contractors. Recommendations are workload equity only.
              </p>
            )}
          </TabsContent>

          {/* ── Unclassified Tab ───────────────────────────────────────── */}
          {unkCount > 0 && (
            <TabsContent value="unknown" className="space-y-4 mt-0">
              <div className="rounded-md border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30 px-4 py-3 flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Worker type not set for these drivers</p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-0.5">
                    Set <span className="font-medium">Employment Type</span> or <span className="font-medium">Driver Classification</span> on each driver record to route them into the correct section.
                    Until then, the OT cost-savings model is not applied.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <KpiCard
                  label="Unclassified over 40h"
                  value={String(data.unknown.otDriverCount)}
                  sub="projected > 40h"
                  icon={AlertTriangle}
                  accent="bg-muted-foreground"
                />
                <KpiCard
                  label="Available unclassified"
                  value={String(data.unknown.underDriverCount)}
                  sub="projected < 30h"
                  icon={Users}
                />
                <KpiCard
                  label="Hours to redistribute"
                  value={fmtHours(totalUnkHrs)}
                  sub={`across ${unkRecs.length} recommendations`}
                  icon={Clock}
                />
              </div>

              <Card data-testid="card-rebalance-unknown-table">
                <CardHeader className="pb-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    Unclassified Driver Recommendations
                    <Badge variant="outline" className="text-xs font-normal">No cost model applied</Badge>
                  </CardTitle>
                  <CardDescription>
                    Classify these drivers as W-2 or IC to enable the appropriate analysis.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0 pt-2">
                  <GroupTable
                    group={data.unknown}
                    dismissed={unkDismiss.dismissed}
                    onDismiss={unkDismiss.dismiss}
                    onClearDismissed={unkDismiss.clear}
                    showCost={false}
                    emptyLabel="No unclassified drivers with hour imbalances this week."
                  />
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      ) : null}
    </div>
  );
}
