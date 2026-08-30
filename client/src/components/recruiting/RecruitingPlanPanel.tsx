import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Target, Users, CalendarClock, Radio, AlertTriangle, RefreshCw,
  ChevronDown, ChevronUp, Loader2, Pencil, CheckCircle2,
  TrendingUp, Zap, Clock, DollarSign,
} from "lucide-react";

// ── Shared pill constant ──────────────────────────────────────────────────────
const PILL = "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap";

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  draft:     { label: "Draft",     cls: "bg-muted/60 text-muted-foreground border-border" },
  active:    { label: "Active",    cls: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800" },
  completed: { label: "Completed", cls: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800" },
};

interface PlanRecord {
  id:                    string;
  status:                string;
  requiredHeadcount:     number;
  filledPositions:       number;
  revenuePerDriver:      string | null;
  dailyApplicantTarget:  number | null;
  weeklyHiringTarget:    string | null;
  applicantMultiplier:   string | null;
  recommendedChannels:   string | null;
  suggestedPayMin:       string | null;
  suggestedPayMax:       string | null;
  estimatedTimeToReady:  number | null;
  daysUntilTarget:       number | null;
  targetDate:            string | null;
  riskFlags:             string | null;
  generatedBy:           string | null;
  updatedAt:             string | null;
}

function parseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function fmtPay(v: string | null | undefined) {
  if (!v) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : `$${n.toFixed(2)}`;
}

// ── Status stepper ────────────────────────────────────────────────────────────

const PLAN_STATUSES = ["draft", "active", "completed"] as const;

function StatusStepper({ current }: { current: string }) {
  const idx = PLAN_STATUSES.indexOf(current as any);
  return (
    <div className="flex items-center gap-1">
      {PLAN_STATUSES.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div className={`h-1.5 w-6 rounded-full transition-colors ${i <= idx ? "bg-primary" : "bg-muted"}`} />
        </div>
      ))}
    </div>
  );
}

// ── Edit form ─────────────────────────────────────────────────────────────────

function EditForm({
  record,
  requisitionId,
  onClose,
}: {
  record: PlanRecord;
  requisitionId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [headcount,        setHeadcount]        = useState(String(record.requiredHeadcount ?? ""));
  const [filledPositions,  setFilledPositions]  = useState(String(record.filledPositions ?? "0"));
  const [multiplier,       setMultiplier]       = useState(record.applicantMultiplier ?? "10");
  const [targetDate,       setTargetDate]       = useState(record.targetDate ?? "");
  const [revenuePerDriver, setRevenuePerDriver] = useState(record.revenuePerDriver ?? "1200");

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/recruiting/requisitions/${requisitionId}/recruiting-plan`, {
        requiredHeadcount:   headcount        ? parseInt(headcount, 10)        : undefined,
        filledPositions:     filledPositions  ? parseInt(filledPositions, 10)  : 0,
        applicantMultiplier: multiplier       ? parseFloat(multiplier)         : undefined,
        targetDate:          targetDate || null,
        revenuePerDriver:    revenuePerDriver ? parseFloat(revenuePerDriver)   : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requisitions", requisitionId, "recruiting-plan"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/revenue-impact"] });
      toast({ title: "Plan updated", description: "Targets have been recalculated." });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  return (
    <div className="border border-border rounded-md p-4 bg-muted/20 space-y-4 mt-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <Pencil className="h-3.5 w-3.5" />Adjust Plan Inputs
      </p>
      <p className="text-xs text-muted-foreground">
        Targets are automatically recalculated based on headcount, multiplier, and target date.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Required Headcount</Label>
          <Input
            value={headcount}
            onChange={e => setHeadcount(e.target.value)}
            type="number" min="1" className="h-9 text-sm"
            data-testid="input-plan-headcount"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Filled Positions</Label>
          <Input
            value={filledPositions}
            onChange={e => setFilledPositions(e.target.value)}
            type="number" min="0" className="h-9 text-sm"
            data-testid="input-plan-filled"
          />
          <p className="text-[10px] text-muted-foreground/60">Drivers already placed for this role</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Applicants per Hire</Label>
          <Input
            value={multiplier}
            onChange={e => setMultiplier(e.target.value)}
            type="number" min="1" step="0.5" className="h-9 text-sm"
            data-testid="input-plan-multiplier"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Target Fill Date</Label>
          <Input
            value={targetDate}
            onChange={e => setTargetDate(e.target.value)}
            type="date" className="h-9 text-sm"
            data-testid="input-plan-target-date"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Revenue per Driver / Week ($)</Label>
          <Input
            value={revenuePerDriver}
            onChange={e => setRevenuePerDriver(e.target.value)}
            type="number" min="0" step="100" className="h-9 text-sm"
            data-testid="input-plan-revenue-per-driver"
          />
          <p className="text-[10px] text-muted-foreground/60">Used to calculate revenue at risk</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          data-testid="btn-plan-edit-save"
        >
          {mutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Recalculate & Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={mutation.isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function RecruitingPlanPanel({ requisitionId }: { requisitionId: string }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(true);
  const [editing,  setEditing]  = useState(false);

  const { data: plan, isLoading } = useQuery<PlanRecord | null>({
    queryKey: ["/api/recruiting/requisitions", requisitionId, "recruiting-plan"],
    queryFn:  () =>
      fetch(`/api/recruiting/requisitions/${requisitionId}/recruiting-plan`)
        .then(r => r.ok ? r.json() : null),
    enabled: !!requisitionId,
    staleTime: 60_000,
  });

  const regenMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/recruiting/requisitions/${requisitionId}/recruiting-plan/generate`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requisitions", requisitionId, "recruiting-plan"] });
      toast({ title: "Recruiting plan regenerated" });
    },
    onError: (err: any) => {
      toast({ title: "Regeneration failed", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      apiRequest("PATCH", `/api/recruiting/requisitions/${requisitionId}/recruiting-plan`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requisitions", requisitionId, "recruiting-plan"] });
    },
    onError: (err: any) => {
      toast({ title: "Status update failed", description: err?.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading recruiting plan…
        </CardContent>
      </Card>
    );
  }

  if (!plan) {
    return (
      <Card>
        <CardContent className="py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Target className="h-4 w-4 text-muted-foreground/60" />
            Recruiting plan not yet generated
          </div>
          <Button
            size="sm" variant="outline"
            onClick={() => regenMutation.mutate()}
            disabled={regenMutation.isPending}
            data-testid="btn-plan-generate"
          >
            {regenMutation.isPending
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <Zap className="h-3.5 w-3.5 mr-1.5" />}
            Generate Plan
          </Button>
        </CardContent>
      </Card>
    );
  }

  const channels   = parseJSON<string[]>(plan.recommendedChannels, []);
  const riskFlags  = parseJSON<string[]>(plan.riskFlags, []);
  const statusChip = STATUS_CHIP[plan.status ?? "draft"] ?? STATUS_CHIP.draft;
  const payMin     = fmtPay(plan.suggestedPayMin);
  const payMax     = fmtPay(plan.suggestedPayMax);

  // ── Revenue impact ─────────────────────────────────────────────────────────
  const gapCount        = Math.max(0, (plan.requiredHeadcount ?? 0) - (plan.filledPositions ?? 0));
  const ratePerDriver   = parseFloat(plan.revenuePerDriver ?? "1200") || 1200;
  const weeklyAtRisk    = gapCount * ratePerDriver;
  const hasRevenueRisk  = gapCount > 0;

  const nextStatus = plan.status === "draft" ? "active" : plan.status === "active" ? "completed" : null;
  const nextLabel  = plan.status === "draft" ? "Activate Plan" : "Mark Completed";

  return (
    <Card data-testid="panel-recruiting-plan">
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap pb-3 pt-4 px-4">
        <button
          className="flex items-center gap-2 flex-1 text-left"
          onClick={() => setExpanded(v => !v)}
          data-testid="btn-plan-toggle"
        >
          <Target className="h-4 w-4 text-primary shrink-0" />
          <CardTitle className="text-sm font-semibold">Recruiting Plan</CardTitle>
          <span className={`${PILL} ml-1 ${statusChip.cls}`}>{statusChip.label}</span>
          <StatusStepper current={plan.status ?? "draft"} />
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto" />}
        </button>
        <div className="flex gap-1.5 shrink-0">
          <Button
            size="sm" variant="ghost"
            onClick={() => regenMutation.mutate()}
            disabled={regenMutation.isPending}
            data-testid="btn-plan-regenerate"
            title="Regenerate plan"
          >
            {regenMutation.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
          <Button
            size="sm" variant="ghost"
            onClick={() => { setEditing(v => !v); setExpanded(true); }}
            data-testid="btn-plan-edit"
          >
            <Pencil className="h-3.5 w-3.5 mr-1" />Adjust
          </Button>
          {nextStatus && (
            <Button
              size="sm" variant="outline"
              onClick={() => statusMutation.mutate(nextStatus)}
              disabled={statusMutation.isPending}
              data-testid={`btn-plan-advance-${nextStatus}`}
            >
              {statusMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {nextLabel}
            </Button>
          )}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="px-4 pb-4 space-y-4">
          {/* ── Hero summary line ── */}
          <div className="rounded-md bg-primary/5 border border-primary/10 px-4 py-3">
            <p className="text-sm font-semibold text-foreground">
              Need <span className="text-primary">{plan.requiredHeadcount} driver{plan.requiredHeadcount !== 1 ? "s" : ""}</span>
              {plan.targetDate ? (
                <> by <span className="text-primary">{new Date(plan.targetDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></>
              ) : null}
            </p>
            {plan.estimatedTimeToReady != null && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Estimated readiness: <span className="font-medium text-foreground">{plan.estimatedTimeToReady} days</span>
                {plan.daysUntilTarget != null && ` · ${plan.daysUntilTarget} days until target date`}
              </p>
            )}
          </div>

          {/* ── Metric strip ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-0.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Users className="h-3 w-3" />Headcount
              </p>
              <p className="text-lg font-bold tabular-nums">{plan.requiredHeadcount}</p>
              <p className="text-[10px] text-muted-foreground/60">drivers required</p>
            </div>

            <div className="space-y-0.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />Daily Target
              </p>
              <p className="text-lg font-bold tabular-nums">
                {plan.dailyApplicantTarget ?? "—"}
              </p>
              <p className="text-[10px] text-muted-foreground/60">applicants / day</p>
            </div>

            <div className="space-y-0.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <CalendarClock className="h-3 w-3" />Weekly Hires
              </p>
              <p className="text-lg font-bold tabular-nums">
                {plan.weeklyHiringTarget ? parseFloat(plan.weeklyHiringTarget) : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground/60">hires / week needed</p>
            </div>

            <div className="space-y-0.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Clock className="h-3 w-3" />Time to Ready
              </p>
              <p className="text-lg font-bold tabular-nums">
                {plan.estimatedTimeToReady ?? "—"} <span className="text-sm font-normal text-muted-foreground">days</span>
              </p>
              <p className="text-[10px] text-muted-foreground/60">est. screening + source</p>
            </div>
          </div>

          <Separator />

          {/* ── Channels + Pay reference ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {channels.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Radio className="h-3.5 w-3.5" />Recommended Channels
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {channels.map((ch, i) => (
                    <span key={i} className={`${PILL} bg-muted/50 text-foreground border-border`}>
                      #{i + 1} {ch}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(payMin || payMax) && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" />Pay Reference
                </p>
                <p className="text-sm font-semibold">
                  {payMin ?? "—"} – {payMax ?? "—"}<span className="text-xs font-normal text-muted-foreground ml-1">/hr · advisory</span>
                </p>
                <p className="text-[10px] text-muted-foreground/60">From market intelligence — not auto-applied</p>
              </div>
            )}
          </div>

          {/* ── Revenue Impact ── */}
          {hasRevenueRisk && (
            <>
              <Separator />
              <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5" />Revenue at Risk
                </p>
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                  Missing <span className="font-bold">{gapCount} driver{gapCount !== 1 ? "s" : ""}</span>
                  {" = "}
                  <span className="font-bold">
                    ${weeklyAtRisk.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/week
                  </span>
                  {" "}delayed revenue
                </p>
                {plan.daysUntilTarget != null && plan.daysUntilTarget > 0 && (
                  <p className="text-xs text-red-600/80 dark:text-red-400/80">
                    Target date in <span className="font-medium">{plan.daysUntilTarget} days</span>
                    {" · "}
                    Total exposure: <span className="font-medium">
                      ${(weeklyAtRisk * (plan.daysUntilTarget / 7)).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span> over delay window
                  </p>
                )}
                <p className="text-[10px] text-red-500/60 dark:text-red-400/50">
                  Rate: ${ratePerDriver.toLocaleString()}/driver/wk · {plan.filledPositions ?? 0} of {plan.requiredHeadcount} filled · Edit plan to adjust rate
                </p>
              </div>
            </>
          )}
          {!hasRevenueRisk && plan.requiredHeadcount > 0 && (
            <>
              <Separator />
              <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                All {plan.requiredHeadcount} position{plan.requiredHeadcount !== 1 ? "s" : ""} filled — no revenue at risk
              </div>
            </>
          )}

          {/* ── Risk flags ── */}
          {riskFlags.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />Risk Flags
                </p>
                <ul className="space-y-1.5">
                  {riskFlags.map((flag, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                      {flag}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* ── Edit form ── */}
          {editing && (
            <EditForm
              record={plan}
              requisitionId={requisitionId}
              onClose={() => setEditing(false)}
            />
          )}

          <p className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Advisory targets — do not auto-apply to requisition settings or pay.
            {plan.generatedBy === "auto" && " · Auto-generated on approval"}
            {plan.generatedBy === "manual" && " · Manually adjusted"}
          </p>
        </CardContent>
      )}
    </Card>
  );
}
