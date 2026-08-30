import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, AlertCircle,
  XCircle, Loader2, Play, Eye, Send, Clock, FileText, Calendar,
  RotateCcw, TrendingUp, Users, DollarSign, Shield, ShieldAlert,
  ChevronLeft, History, RefreshCw, Info,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssemblyLinePreview {
  productName: string | null;
  revenueCategory: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

interface ExcludedCharge {
  chargeId: string;
  description: string;
  amount: number;
  reason: string;
}

interface AccountResult {
  customerId: string;
  customerName: string;
  status: "created" | "appended" | "skipped" | "error" | "preview";
  invoiceId?: string;
  invoiceNumber?: string;
  includedCharges: number;
  excludedCharges: number;
  lineCount: number;
  subtotal: number;
  lines: AssemblyLinePreview[];
  exclusions: ExcludedCharge[];
  validationErrors: string[];
}

interface EngineResult {
  dryRun: boolean;
  cycleStart: string;
  cycleEnd: string;
  accountsProcessed: number;
  invoicesCreated: number;
  invoicesAppended: number;
  invoicesSkipped: number;
  totalChargesIncluded: number;
  totalChargesExcluded: number;
  totalAmount: number;
  results: AccountResult[];
  globalValidationErrors: string[];
}

interface BillingRun {
  id: string;
  cycleStart: string;
  cycleEnd: string;
  runDate: string;
  status: string;
  sendMode: string | null;
  accountsTotal: number | null;
  accountsReady: number | null;
  accountsWarning: number | null;
  accountsError: number | null;
  accountsSkipped: number | null;
  invoicesCreated: number | null;
  invoicesAppended: number | null;
  totalAmount: string | null;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
}

type Step = "configure" | "preview" | "execute" | "results";
type SendMode = "draft" | "send_now" | "scheduled";
type StatusFilter = "all" | "ready" | "warning" | "error" | "skipped";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
function fmtDate(s: string) {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
}

/** Classify an account into a UI status */
function accountUiStatus(r: AccountResult, overrideSet: Set<string>): "ready" | "warning" | "error" | "skipped" {
  if (r.status === "skipped") return "skipped";
  if (r.validationErrors.length > 0 && !overrideSet.has(r.customerId)) return "error";
  if (r.exclusions.length > 0 || overrideSet.has(r.customerId)) return "warning";
  return "ready";
}

const STATUS_BADGE: Record<string, string> = {
  ready:   "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800",
  warning: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-800",
  error:   "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
  skipped: "bg-muted text-muted-foreground border-border",
  executed:"bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",
  previewing: "bg-muted text-muted-foreground border-border",
  cancelled:  "bg-muted text-muted-foreground border-border",
};

const SEND_MODE_LABELS: Record<SendMode, string> = {
  draft:     "Save as Draft",
  send_now:  "Send Immediately",
  scheduled: "Schedule Send",
};

function SummaryTile({ label, value, sub, color }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-md border p-3 flex flex-col gap-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${color ?? ""}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "ready")   return <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />;
  if (status === "warning") return <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 shrink-0" />;
  if (status === "error")   return <AlertCircle  className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />;
  return <XCircle className="w-4 h-4 text-muted-foreground shrink-0" />;
}

// ─── Account Row ──────────────────────────────────────────────────────────────

function AccountRow({
  result, uiStatus, isOverridden, onToggleOverride, isExpanded, onToggleExpand,
}: {
  result: AccountResult;
  uiStatus: "ready" | "warning" | "error" | "skipped";
  isOverridden: boolean;
  onToggleOverride: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  return (
    <div
      className={`border rounded-md overflow-hidden ${
        uiStatus === "error" ? "border-red-200 dark:border-red-900" :
        uiStatus === "warning" ? "border-yellow-200 dark:border-yellow-900" : ""
      }`}
      data-testid={`card-billing-account-${result.customerId}`}
    >
      {/* Header row */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 p-3 cursor-pointer hover-elevate"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon status={uiStatus} />
          <span className="font-medium text-sm truncate">{result.customerName}</span>
          <Badge variant="outline" className={`text-xs ${STATUS_BADGE[uiStatus]}`}>
            {uiStatus}
          </Badge>
          {isOverridden && (
            <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400">
              admin override
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{result.includedCharges} charge{result.includedCharges !== 1 ? "s" : ""}</span>
          {result.subtotal > 0 && (
            <span className="font-semibold text-foreground">{fmt$(result.subtotal)}</span>
          )}
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t px-3 pb-3 pt-2 space-y-3">
          {/* Validation errors */}
          {result.validationErrors.length > 0 && (
            <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-2 space-y-1">
              {result.validationErrors.map((e, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-red-700 dark:text-red-400">
                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />{e}
                </div>
              ))}
            </div>
          )}

          {/* Line items table */}
          {result.lines.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs w-20">Qty</TableHead>
                  <TableHead className="text-xs w-24">Rate</TableHead>
                  <TableHead className="text-xs w-24 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs py-1.5">{l.description}</TableCell>
                    <TableCell className="text-xs py-1.5 tabular-nums">{l.quantity.toFixed(2)}</TableCell>
                    <TableCell className="text-xs py-1.5 tabular-nums">{fmt$(l.rate)}</TableCell>
                    <TableCell className="text-xs py-1.5 tabular-nums text-right">{fmt$(l.amount)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={3} className="text-xs py-1.5 font-semibold text-right pr-2">Subtotal</TableCell>
                  <TableCell className="text-xs py-1.5 font-semibold tabular-nums text-right">{fmt$(result.subtotal)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}

          {/* Excluded charges */}
          {result.exclusions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                {result.exclusions.length} excluded charge{result.exclusions.length !== 1 ? "s" : ""}:
              </p>
              <div className="space-y-0.5">
                {result.exclusions.map((ex, i) => (
                  <div key={i} className="flex justify-between text-xs text-yellow-700 dark:text-yellow-400">
                    <span className="truncate">{ex.description} — {ex.reason}</span>
                    <span className="ml-2 shrink-0">{fmt$(ex.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Admin override toggle */}
          {uiStatus === "error" && (
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Shield className="w-3.5 h-3.5" />
                <span>Admin override — force include despite errors</span>
              </div>
              <Button
                size="sm"
                variant={isOverridden ? "default" : "outline"}
                onClick={(e) => { e.stopPropagation(); onToggleOverride(); }}
                data-testid={`button-override-${result.customerId}`}
              >
                {isOverridden ? "Remove Override" : "Override"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Configure Step ───────────────────────────────────────────────────────────

function weekBounds(): { start: string; end: string } {
  const today = new Date();
  const dow = today.getDay(); // 0=Sun
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dow + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(monday), end: fmt(sunday) };
}

// ─── Run History Row ──────────────────────────────────────────────────────────

function RunHistoryRow({ run, onView }: { run: BillingRun; onView: () => void }) {
  return (
    <TableRow data-testid={`row-billing-run-${run.id}`}>
      <TableCell className="text-xs text-muted-foreground font-mono">
        {fmtDate(run.cycleStart)} – {fmtDate(run.cycleEnd)}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={`text-xs ${STATUS_BADGE[run.status] ?? ""}`}>
          {run.status}
        </Badge>
      </TableCell>
      <TableCell className="text-xs">
        {run.accountsTotal ?? 0} accounts
        {(run.accountsError ?? 0) > 0 && (
          <span className="ml-1 text-red-600 dark:text-red-400">
            · {run.accountsError} error
          </span>
        )}
      </TableCell>
      <TableCell className="text-xs tabular-nums">
        {run.invoicesCreated ?? 0} created{(run.invoicesAppended ?? 0) > 0 && ` · ${run.invoicesAppended} appended`}
      </TableCell>
      <TableCell className="text-xs tabular-nums font-medium">
        {run.totalAmount ? fmt$(parseFloat(run.totalAmount)) : "—"}
      </TableCell>
      <TableCell className="text-xs">
        {run.sendMode ?? "draft"}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {new Date(run.createdAt).toLocaleDateString()}
      </TableCell>
      <TableCell>
        <Button size="sm" variant="ghost" onClick={onView} data-testid={`button-view-run-${run.id}`}>
          <Eye className="w-3.5 h-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function WeeklyBillingControlPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Configure state ──────────────────────────────────────────────────────────
  const bounds = weekBounds();
  const [cycleStart, setCycleStart] = useState(bounds.start);
  const [cycleEnd,   setCycleEnd]   = useState(bounds.end);
  const [paymentTermsDays, setPaymentTermsDays] = useState(30);

  // ── Wizard state ─────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("configure");
  const [previewRun,    setPreviewRun]    = useState<BillingRun | null>(null);
  const [engineResult,  setEngineResult]  = useState<EngineResult | null>(null);
  const [overriddenAccounts, setOverriddenAccounts] = useState<Set<string>>(new Set());
  const [expandedAccountId, setExpandedAccountId]  = useState<string | null>(null);
  const [statusFilter, setStatusFilter]  = useState<StatusFilter>("all");
  const [sendMode,     setSendMode]      = useState<SendMode>("draft");
  const [scheduledAt,  setScheduledAt]   = useState("");
  const [runNotes,     setRunNotes]      = useState("");
  const [confirmOpen,  setConfirmOpen]   = useState(false);
  const [activeRunId,  setActiveRunId]   = useState<string | null>(null);

  // ── History tab state ─────────────────────────────────────────────────────────
  const [detailRun, setDetailRun] = useState<BillingRun | null>(null);

  // ── Queries ───────────────────────────────────────────────────────────────────
  const historyQuery = useQuery<BillingRun[]>({
    queryKey: ["/api/billing/weekly-runs"],
    staleTime: 30_000,
  });

  const detailQuery = useQuery<BillingRun & { resultJson: EngineResult | null }>({
    queryKey: ["/api/billing/weekly-runs", activeRunId],
    enabled: !!activeRunId,
    staleTime: 60_000,
  });

  // ── Preview mutation ───────────────────────────────────────────────────────────
  const previewMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/billing/weekly-runs/preview", {
        cycleStart, cycleEnd, paymentTermsDays,
      });
      return r.json() as Promise<{ run: BillingRun; engineResult: EngineResult }>;
    },
    onSuccess: (data) => {
      setPreviewRun(data.run);
      setEngineResult(data.engineResult);
      setOverriddenAccounts(new Set());
      setExpandedAccountId(null);
      setStatusFilter("all");
      setStep("preview");
      qc.invalidateQueries({ queryKey: ["/api/billing/weekly-runs"] });
    },
    onError: (err: Error) => toast({ title: "Preview failed", description: err.message, variant: "destructive" }),
  });

  // ── Execute mutation ───────────────────────────────────────────────────────────
  const executeMut = useMutation({
    mutationFn: async () => {
      if (!previewRun) throw new Error("No preview run");
      const r = await apiRequest("POST", `/api/billing/weekly-runs/${previewRun.id}/execute`, {
        sendMode,
        overriddenAccounts: Array.from(overriddenAccounts),
        paymentTermsDays,
        notes: runNotes || undefined,
        scheduledSendAt: sendMode === "scheduled" && scheduledAt ? scheduledAt : undefined,
      });
      return r.json() as Promise<{ run: BillingRun; engineResult: EngineResult }>;
    },
    onSuccess: (data) => {
      setPreviewRun(data.run);
      setEngineResult(data.engineResult);
      setStep("results");
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["/api/billing/weekly-runs"] });
      toast({ title: "Billing run complete", description: `${data.engineResult.invoicesCreated} invoice(s) created.` });
    },
    onError: (err: Error) => {
      setConfirmOpen(false);
      toast({ title: "Execution failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Derived values ─────────────────────────────────────────────────────────────
  const overrideSet = overriddenAccounts;

  const classifiedResults = useMemo(() => {
    if (!engineResult) return [];
    return engineResult.results.map((r) => ({
      ...r,
      uiStatus: accountUiStatus(r, overrideSet),
    }));
  }, [engineResult, overrideSet]);

  const filteredResults = useMemo(() => {
    if (statusFilter === "all") return classifiedResults;
    return classifiedResults.filter((r) => r.uiStatus === statusFilter);
  }, [classifiedResults, statusFilter]);

  const readyCount   = classifiedResults.filter((r) => r.uiStatus === "ready").length;
  const warningCount = classifiedResults.filter((r) => r.uiStatus === "warning").length;
  const errorCount   = classifiedResults.filter((r) => r.uiStatus === "error").length;
  const skippedCount = classifiedResults.filter((r) => r.uiStatus === "skipped").length;
  const blockedCount = classifiedResults.filter((r) => r.uiStatus === "error").length;
  const importableCount = readyCount + warningCount + overriddenAccounts.size;

  function handleReset() {
    setStep("configure");
    setPreviewRun(null);
    setEngineResult(null);
    setOverriddenAccounts(new Set());
    setExpandedAccountId(null);
    setStatusFilter("all");
    setSendMode("draft");
    setRunNotes("");
    setScheduledAt("");
  }

  function toggleOverride(customerId: string) {
    setOverriddenAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  }

  // ── Step progress indicator ──────────────────────────────────────────────────
  const STEPS: { id: Step; label: string }[] = [
    { id: "configure", label: "Configure" },
    { id: "preview",   label: "Preview" },
    { id: "execute",   label: "Execute" },
    { id: "results",   label: "Results" },
  ];
  const stepIdx = STEPS.findIndex((s) => s.id === step);

  function StepBar() {
    return (
      <div className="flex items-center gap-0 mb-5">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center">
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${
              i < stepIdx  ? "text-muted-foreground" :
              i === stepIdx ? "text-foreground font-semibold" :
              "text-muted-foreground/50"
            }`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] border ${
                i < stepIdx   ? "bg-green-600 border-green-600 text-white" :
                i === stepIdx ? "bg-primary border-primary text-primary-foreground" :
                "bg-muted border-border text-muted-foreground"
              }`}>
                {i < stepIdx ? <CheckCircle2 className="w-3 h-3" /> : i + 1}
              </span>
              {s.label}
            </div>
            {i < STEPS.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground mx-0.5" />}
          </div>
        ))}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <Tabs defaultValue="control-panel" className="space-y-4">
      <TabsList>
        <TabsTrigger value="control-panel" data-testid="tab-weekly-control-panel">
          <Play className="w-3.5 h-3.5 mr-1.5" />
          Weekly Billing Run
        </TabsTrigger>
        <TabsTrigger value="run-history" data-testid="tab-weekly-run-history">
          <History className="w-3.5 h-3.5 mr-1.5" />
          Run History
        </TabsTrigger>
      </TabsList>

      {/* ════════════════════════════ CONTROL PANEL ═══════════════════════════ */}
      <TabsContent value="control-panel" className="space-y-4">
        <StepBar />

        {/* ── STEP: CONFIGURE ──────────────────────────────────────────────── */}
        {step === "configure" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Configure Billing Run
              </CardTitle>
              <CardDescription>
                Set the billing cycle and options, then run a preview to see what will be generated.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="wbr-cycle-start">Cycle Start</Label>
                  <Input
                    id="wbr-cycle-start"
                    type="date"
                    value={cycleStart}
                    onChange={(e) => setCycleStart(e.target.value)}
                    data-testid="input-wbr-cycle-start"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wbr-cycle-end">Cycle End</Label>
                  <Input
                    id="wbr-cycle-end"
                    type="date"
                    value={cycleEnd}
                    onChange={(e) => setCycleEnd(e.target.value)}
                    data-testid="input-wbr-cycle-end"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wbr-terms">Payment Terms (days)</Label>
                  <Input
                    id="wbr-terms"
                    type="number"
                    min={0}
                    max={365}
                    value={paymentTermsDays}
                    onChange={(e) => setPaymentTermsDays(parseInt(e.target.value) || 30)}
                    data-testid="input-wbr-terms"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={() => previewMut.mutate()}
                  disabled={previewMut.isPending || !cycleStart || !cycleEnd}
                  data-testid="button-wbr-preview"
                >
                  {previewMut.isPending ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <Eye className="w-4 h-4 mr-1.5" />
                  )}
                  {previewMut.isPending ? "Running preview…" : "Preview Billing Run"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── STEP: PREVIEW ────────────────────────────────────────────────── */}
        {step === "preview" && engineResult && (
          <div className="space-y-4">
            {/* Summary tiles */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryTile
                label="Total Accounts"
                value={engineResult.accountsProcessed}
                color="text-foreground"
              />
              <SummaryTile
                label="Projected Amount"
                value={fmt$(engineResult.totalAmount)}
                color="text-green-600 dark:text-green-400"
              />
              <SummaryTile
                label="Total Charges"
                value={engineResult.totalChargesIncluded}
                sub={`${engineResult.totalChargesExcluded} excluded`}
              />
              <SummaryTile
                label="Global Errors"
                value={engineResult.globalValidationErrors.length}
                color={engineResult.globalValidationErrors.length > 0 ? "text-destructive" : undefined}
              />
            </div>

            {/* Status breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryTile label="Ready" value={readyCount} color="text-green-600 dark:text-green-400" />
              <SummaryTile label="Warnings" value={warningCount} color="text-yellow-600 dark:text-yellow-400" />
              <SummaryTile label="Errors (blocked)" value={errorCount} color={errorCount > 0 ? "text-destructive" : undefined} />
              <SummaryTile label="Skipped" value={skippedCount} />
            </div>

            {/* Global validation errors */}
            {engineResult.globalValidationErrors.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                <p className="text-xs font-medium text-destructive">Global Validation Errors</p>
                {engineResult.globalValidationErrors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive">{e}</p>
                ))}
              </div>
            )}

            {/* Override banner if any */}
            {overriddenAccounts.size > 0 && (
              <div className="flex items-center gap-2 rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 p-2.5 text-sm text-orange-700 dark:text-orange-400">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>
                  {overriddenAccounts.size} account{overriddenAccounts.size !== 1 ? "s" : ""} admin-overridden
                  — validation errors suppressed. These will be force-included.
                </span>
              </div>
            )}

            {/* Account grid filter + list */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-sm font-medium">Account Results</CardTitle>
                  <div className="flex flex-wrap items-center gap-1" data-testid="filter-account-status">
                    {([
                      { id: "all",     label: "All",      count: classifiedResults.length },
                      { id: "ready",   label: "Ready",    count: readyCount },
                      { id: "warning", label: "Warning",  count: warningCount },
                      { id: "error",   label: "Error",    count: errorCount },
                      { id: "skipped", label: "Skipped",  count: skippedCount },
                    ] as const).filter((f) => f.id === "all" || f.count > 0).map((f) => (
                      <Button
                        key={f.id}
                        size="sm"
                        variant={statusFilter === f.id ? "default" : "outline"}
                        onClick={() => setStatusFilter(f.id)}
                        data-testid={`filter-${f.id}`}
                      >
                        {f.label} <span className="ml-1 text-[10px] opacity-70">({f.count})</span>
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {filteredResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No accounts match this filter.</p>
                ) : (
                  filteredResults.map((r) => (
                    <AccountRow
                      key={r.customerId}
                      result={r}
                      uiStatus={r.uiStatus}
                      isOverridden={overrideSet.has(r.customerId)}
                      onToggleOverride={() => toggleOverride(r.customerId)}
                      isExpanded={expandedAccountId === r.customerId}
                      onToggleExpand={() =>
                        setExpandedAccountId(expandedAccountId === r.customerId ? null : r.customerId)
                      }
                    />
                  ))
                )}
              </CardContent>
            </Card>

            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" onClick={handleReset} data-testid="button-wbr-back-configure">
                <ChevronLeft className="w-4 h-4 mr-1.5" />
                Reconfigure
              </Button>
              <Button
                onClick={() => setStep("execute")}
                disabled={importableCount === 0}
                data-testid="button-wbr-proceed-execute"
              >
                <Play className="w-4 h-4 mr-1.5" />
                Proceed to Execute ({importableCount} account{importableCount !== 1 ? "s" : ""})
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP: EXECUTE ────────────────────────────────────────────────── */}
        {step === "execute" && engineResult && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Send className="w-4 h-4" />
                  Execution Options
                </CardTitle>
                <CardDescription>
                  Choose how invoices should be handled after generation.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Send mode */}
                <div className="space-y-2">
                  <Label>Send Mode</Label>
                  <div className="flex flex-wrap gap-2">
                    {(["draft", "send_now", "scheduled"] as SendMode[]).map((m) => (
                      <Button
                        key={m}
                        size="sm"
                        variant={sendMode === m ? "default" : "outline"}
                        onClick={() => setSendMode(m)}
                        data-testid={`button-send-mode-${m}`}
                      >
                        {m === "draft"     && <FileText className="w-3.5 h-3.5 mr-1.5" />}
                        {m === "send_now"  && <Send     className="w-3.5 h-3.5 mr-1.5" />}
                        {m === "scheduled" && <Clock    className="w-3.5 h-3.5 mr-1.5" />}
                        {SEND_MODE_LABELS[m]}
                      </Button>
                    ))}
                  </div>
                  {sendMode === "draft" && (
                    <p className="text-xs text-muted-foreground">Invoices will be created in draft status. Send manually from the Invoice Workspace.</p>
                  )}
                  {sendMode === "send_now" && (
                    <p className="text-xs text-muted-foreground">Invoices will be created and emailed to customers immediately.</p>
                  )}
                  {sendMode === "scheduled" && (
                    <div className="space-y-1.5 mt-2">
                      <Label htmlFor="wbr-schedule-at">Scheduled Send Date/Time</Label>
                      <Input
                        id="wbr-schedule-at"
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        data-testid="input-wbr-scheduled-at"
                      />
                    </div>
                  )}
                </div>

                <Separator />

                {/* Execution summary */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Execution Summary</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <SummaryTile label="Accounts to Bill" value={importableCount} color="text-foreground" />
                    <SummaryTile
                      label="Projected Amount"
                      value={fmt$(engineResult.totalAmount)}
                      color="text-green-600 dark:text-green-400"
                    />
                    {overriddenAccounts.size > 0 && (
                      <SummaryTile
                        label="Overridden Accounts"
                        value={overriddenAccounts.size}
                        color="text-orange-600 dark:text-orange-400"
                      />
                    )}
                    {blockedCount > 0 && (
                      <SummaryTile
                        label="Still Blocked"
                        value={blockedCount - overriddenAccounts.size < 0 ? 0 : blockedCount - overriddenAccounts.size}
                        color="text-destructive"
                      />
                    )}
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <Label htmlFor="wbr-notes">Run Notes (optional)</Label>
                  <Textarea
                    id="wbr-notes"
                    placeholder="Add any notes about this billing run…"
                    value={runNotes}
                    onChange={(e) => setRunNotes(e.target.value)}
                    className="resize-none"
                    rows={2}
                    data-testid="input-wbr-notes"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" onClick={() => setStep("preview")} data-testid="button-wbr-back-preview">
                <ChevronLeft className="w-4 h-4 mr-1.5" />
                Back to Preview
              </Button>
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={executeMut.isPending}
                data-testid="button-wbr-execute"
              >
                {executeMut.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-1.5" />
                )}
                {executeMut.isPending ? "Generating invoices…" : `Generate ${importableCount} Invoice${importableCount !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP: RESULTS ────────────────────────────────────────────────── */}
        {step === "results" && engineResult && previewRun && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  {engineResult.invoicesCreated + engineResult.invoicesAppended > 0 ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-destructive" />
                  )}
                  <CardTitle className="text-base">
                    {engineResult.invoicesCreated + engineResult.invoicesAppended > 0
                      ? "Billing Run Complete"
                      : "Billing Run Finished with Issues"}
                  </CardTitle>
                </div>
                <CardDescription>
                  Cycle: {fmtDate(engineResult.cycleStart)} – {fmtDate(engineResult.cycleEnd)}
                  {" · "}Send mode: {SEND_MODE_LABELS[previewRun.sendMode as SendMode ?? "draft"]}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <SummaryTile
                    label="Invoices Created"
                    value={engineResult.invoicesCreated}
                    color={engineResult.invoicesCreated > 0 ? "text-green-600 dark:text-green-400" : undefined}
                  />
                  <SummaryTile
                    label="Invoices Appended"
                    value={engineResult.invoicesAppended}
                    color={engineResult.invoicesAppended > 0 ? "text-blue-600 dark:text-blue-400" : undefined}
                  />
                  <SummaryTile
                    label="Total Amount"
                    value={fmt$(engineResult.totalAmount)}
                    color={engineResult.totalAmount > 0 ? "text-green-600 dark:text-green-400" : undefined}
                  />
                  <SummaryTile label="Skipped" value={engineResult.invoicesSkipped} />
                </div>

                {/* Per-account results */}
                <div className="space-y-2">
                  {engineResult.results.filter((r) => r.status !== "skipped").map((r) => (
                    <div key={r.customerId} className="flex items-center justify-between gap-2 rounded-md border p-2.5">
                      <div className="flex items-center gap-2">
                        {r.status === "created" || r.status === "appended" ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                        ) : r.status === "error" ? (
                          <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                        ) : (
                          <Info className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="text-sm font-medium">{r.customerName}</span>
                        <Badge variant="outline" className={`text-xs ${STATUS_BADGE[r.status] ?? ""}`}>
                          {r.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        {r.invoiceNumber && <span className="font-mono text-xs">{r.invoiceNumber}</span>}
                        {r.subtotal > 0 && <span className="font-semibold text-foreground">{fmt$(r.subtotal)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" onClick={handleReset} data-testid="button-wbr-new-run">
                <RotateCcw className="w-4 h-4 mr-1.5" />
                New Run
              </Button>
            </div>
          </div>
        )}
      </TabsContent>

      {/* ════════════════════════════ RUN HISTORY ════════════════════════════ */}
      <TabsContent value="run-history" className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">History of all Weekly Billing Control Panel runs.</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => qc.invalidateQueries({ queryKey: ["/api/billing/weekly-runs"] })}
            data-testid="button-wbr-history-refresh"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>

        {historyQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (historyQuery.data?.length ?? 0) === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No billing runs yet. Use the Weekly Billing Run tab to create one.
          </div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Accounts</TableHead>
                  <TableHead>Invoices</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Send Mode</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyQuery.data!.map((run) => (
                  <RunHistoryRow
                    key={run.id}
                    run={run}
                    onView={() => { setActiveRunId(run.id); setDetailRun(run); }}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>

      {/* ── Confirm dialog ────────────────────────────────────────────────────── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Billing Run</DialogTitle>
            <DialogDescription>
              This will generate real invoices for {importableCount} account{importableCount !== 1 ? "s" : ""}.
              {overriddenAccounts.size > 0 && ` ${overriddenAccounts.size} account(s) are being force-included via admin override.`}
              {" "}This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cycle:</span>
              <span>{fmtDate(cycleStart)} – {fmtDate(cycleEnd)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Send mode:</span>
              <span>{SEND_MODE_LABELS[sendMode]}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Projected amount:</span>
              <span className="font-semibold">{engineResult ? fmt$(engineResult.totalAmount) : "—"}</span>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} data-testid="button-wbr-cancel-confirm">
              Cancel
            </Button>
            <Button
              onClick={() => executeMut.mutate()}
              disabled={executeMut.isPending}
              data-testid="button-wbr-confirm-execute"
            >
              {executeMut.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              Confirm & Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Run detail dialog ─────────────────────────────────────────────────── */}
      {detailRun && (
        <Dialog open={!!detailRun} onOpenChange={(o) => { if (!o) { setDetailRun(null); setActiveRunId(null); } }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                Billing Run — {fmtDate(detailRun.cycleStart)} to {fmtDate(detailRun.cycleEnd)}
              </DialogTitle>
              <DialogDescription>
                <Badge variant="outline" className={`text-xs mr-2 ${STATUS_BADGE[detailRun.status] ?? ""}`}>
                  {detailRun.status}
                </Badge>
                {detailRun.sendMode && <span>Send mode: {detailRun.sendMode}</span>}
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryTile label="Accounts" value={detailRun.accountsTotal ?? 0} />
              <SummaryTile label="Ready" value={detailRun.accountsReady ?? 0} color="text-green-600 dark:text-green-400" />
              <SummaryTile label="Errors" value={detailRun.accountsError ?? 0} color={(detailRun.accountsError ?? 0) > 0 ? "text-destructive" : undefined} />
              <SummaryTile label="Amount" value={detailRun.totalAmount ? fmt$(parseFloat(detailRun.totalAmount)) : "—"} color="text-green-600 dark:text-green-400" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SummaryTile label="Invoices Created" value={detailRun.invoicesCreated ?? 0} />
              <SummaryTile label="Invoices Appended" value={detailRun.invoicesAppended ?? 0} />
            </div>
            {detailRun.notes && (
              <div className="rounded-md border p-3 text-sm">
                <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                <p>{detailRun.notes}</p>
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              Run started: {new Date(detailRun.createdAt).toLocaleString()}
              {detailRun.completedAt && ` · Completed: ${new Date(detailRun.completedAt).toLocaleString()}`}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDetailRun(null); setActiveRunId(null); }}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Tabs>
  );
}
