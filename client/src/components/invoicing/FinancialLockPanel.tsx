import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Lock, LockOpen, ShieldCheck, ShieldAlert, RefreshCw, Info,
  CheckCircle2, AlertCircle, FileText, CreditCard, Database,
  ClipboardX, History, Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LockEvent {
  id:             string;
  entityType:     string;
  entityId:       string;
  entityRef:      string | null;
  action:         string;
  lockSource:     string | null;
  actorId:        string;
  actorRole:      string | null;
  overrideReason: string | null;
  createdAt:      string;
}

interface LockSummary {
  lockedInvoiceCount:   number;
  lockedPaymentCount:   number;
  overrideEventCount:   number;
  recentEvents:         LockEvent[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const OWNER_ROLES = new Set(["super_user", "super_admin", "root_super_admin", "admin", "owner"]);

function isOwner(role?: string | null) {
  return !!role && OWNER_ROLES.has(role);
}

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d), "MMM d, yyyy h:mm a"); } catch { return d; }
}

function humanizeSource(src: string | null) {
  const map: Record<string, string> = {
    auto_paid:          "Auto-locked (Paid)",
    deposit_locked:     "Deposit Batch Locked",
    deposit_reconciled: "Deposit Batch Reconciled",
    manual:             "Manual Lock",
  };
  return src ? (map[src] ?? src) : "—";
}

function humanizeAction(action: string) {
  const map: Record<string, string> = {
    locked:               "Record Locked",
    unlocked_override:    "Lock Overridden",
    edit_blocked:         "Edit Blocked",
    edit_allowed_override:"Override Granted (Edit Permitted)",
  };
  return map[action] ?? action;
}

function actionColor(action: string): string {
  if (action === "locked")               return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300";
  if (action === "unlocked_override")    return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  if (action === "edit_blocked")         return "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300";
  if (action === "edit_allowed_override") return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300";
  return "bg-muted text-muted-foreground";
}

function entityIcon(type: string) {
  if (type === "invoice")       return <FileText className="w-3.5 h-3.5" />;
  if (type === "payment")       return <CreditCard className="w-3.5 h-3.5" />;
  if (type === "deposit_batch") return <Database className="w-3.5 h-3.5" />;
  return null;
}

// ─── Override Dialog ──────────────────────────────────────────────────────────

function OverrideDialog({
  open,
  onOpenChange,
  event,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event: LockEvent | null;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState("");
  const { toast } = useToast();

  const mut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/corporate/invoicing/record-locks/override", {
        entity_type:     event?.entityType,
        entity_id:       event?.entityId,
        entity_ref:      event?.entityRef,
        override_reason: reason.trim(),
      }).then((r) => r.json()),
    onSuccess: (data) => {
      toast({ title: "Lock overridden", description: data.message });
      setReason("");
      onOpenChange(false);
      onSuccess();
    },
    onError: (err: any) => {
      toast({ title: "Override failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LockOpen className="w-4 h-4 text-amber-600" />
            Override Record Lock
          </DialogTitle>
          <DialogDescription>
            This action unlocks <strong className="text-foreground">{event?.entityType} {event?.entityRef ?? event?.entityId}</strong> for editing.
            The override is logged to the permanent financial audit trail.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              You are an Owner. Overriding this lock will allow the record to be edited.
              This action cannot be undone — provide a clear business justification.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="override-reason" className="text-sm">Override Reason <span className="text-destructive">*</span></Label>
            <Textarea
              id="override-reason"
              placeholder="Provide a clear business justification for overriding this lock…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              data-testid="input-lock-override-reason"
            />
            <p className="text-xs text-muted-foreground">{reason.trim().length}/min. 5 characters</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || reason.trim().length < 5}
            className="bg-amber-700 text-white"
            data-testid="button-confirm-lock-override"
          >
            {mut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Override Lock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function FinancialLockPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [overrideTarget, setOverrideTarget] = useState<LockEvent | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);

  const { data, isLoading, isFetching, dataUpdatedAt } = useQuery<LockSummary>({
    queryKey: ["/api/corporate/invoicing/record-locks/summary"],
    queryFn: () => apiRequest("GET", "/api/corporate/invoicing/record-locks/summary").then(r => r.json()),
    staleTime: 30_000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/corporate/invoicing/record-locks/summary"] });

  const ownerAccess = isOwner(user?.role);
  const totalLocked = (data?.lockedInvoiceCount ?? 0) + (data?.lockedPaymentCount ?? 0);

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Lock className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold">Financial Record Locking</h2>
            {!isLoading && totalLocked > 0 && (
              <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 text-xs no-default-active-elevate">
                <Lock className="w-3 h-3 mr-1" />{totalLocked} Locked
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Paid invoices, locked deposits, and reconciled batches are immutable.
            {dataUpdatedAt ? ` Last refreshed: ${format(new Date(dataUpdatedAt), "h:mm a")}` : ""}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={isFetching} data-testid="button-refresh-locks">
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* ── How it works ── */}
      <div className="flex items-start gap-2.5 rounded-md border px-4 py-3 bg-muted/30">
        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Records are locked automatically based on lifecycle events — invoices when marked <strong className="text-foreground">Paid</strong>,
          payments when their deposit batch is <strong className="text-foreground">Locked</strong> or <strong className="text-foreground">Reconciled</strong>,
          and deposit batches when in locked or reconciled status.
          Locked records cannot be edited. {ownerAccess
            ? <><strong className="text-foreground">As an Owner, you may override any lock</strong> — overrides are permanently audited.</>
            : "An Owner override is required to edit a locked record."}
        </p>
      </div>

      {/* ── KPI Cards ── */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-md" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground">Locked Invoices</p>
              <p className={`text-2xl font-bold mt-0.5 ${(data?.lockedInvoiceCount ?? 0) > 0 ? "text-red-700 dark:text-red-400" : "text-foreground"}`}>
                {data?.lockedInvoiceCount ?? 0}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground">Locked Payments</p>
              <p className={`text-2xl font-bold mt-0.5 ${(data?.lockedPaymentCount ?? 0) > 0 ? "text-red-700 dark:text-red-400" : "text-foreground"}`}>
                {data?.lockedPaymentCount ?? 0}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground">Override Events</p>
              <p className={`text-2xl font-bold mt-0.5 ${(data?.overrideEventCount ?? 0) > 0 ? "text-amber-700 dark:text-amber-400" : "text-foreground"}`}>
                {data?.overrideEventCount ?? 0}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Lock Rules Reference ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            icon: <FileText className="w-4 h-4" />,
            label: "Invoices",
            rule: "Auto-locked when status transitions to Paid.",
            override: "Owner override unlocks for edits.",
            color: "blue",
          },
          {
            icon: <CreditCard className="w-4 h-4" />,
            label: "Payments",
            rule: "Auto-locked when deposit batch is Locked or Reconciled.",
            override: "Owner override unlocks individually.",
            color: "green",
          },
          {
            icon: <Database className="w-4 h-4" />,
            label: "Deposit Batches",
            rule: "Immutable in Submitted, Locked, or Reconciled states.",
            override: "Use the state machine to revert batch status.",
            color: "orange",
          },
        ].map(({ icon, label, rule, override, color }) => {
          const cls = {
            blue:   "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
            green:  "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
            orange: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800",
          }[color as "blue" | "green" | "orange"];
          const iconCls = {
            blue: "text-blue-600 dark:text-blue-400",
            green: "text-green-600 dark:text-green-400",
            orange: "text-orange-600 dark:text-orange-400",
          }[color as "blue" | "green" | "orange"];
          return (
            <Card key={label} className={`border ${cls}`}>
              <CardContent className="pt-4 pb-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className={iconCls}>{icon}</span>
                  <span className="text-sm font-semibold">{label}</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex items-start gap-2">
                    <Lock className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{rule}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <LockOpen className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{override}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Owner access info ── */}
      {!ownerAccess && (
        <div className="flex items-start gap-2.5 rounded-md border border-muted px-3 py-2.5">
          <ClipboardX className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            You do not have Owner access. Lock overrides are restricted to Owner roles (super_admin, super_user, root_super_admin).
            Contact an Owner to unlock a locked record.
          </p>
        </div>
      )}

      {/* ── Audit Event Log ── */}
      <Separator />
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Lock Event Audit Trail</h3>
          <p className="text-xs text-muted-foreground">— Immutable record of all lock, block, and override events</p>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-muted animate-pulse rounded-md" />)}
          </div>
        ) : !data?.recentEvents.length ? (
          <div className="flex items-center gap-3 rounded-md border px-4 py-4 bg-muted/30">
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
            <div>
              <p className="text-sm font-medium">No lock events recorded</p>
              <p className="text-xs text-muted-foreground mt-0.5">Lock events will appear here as records are locked, blocked, or overridden.</p>
            </div>
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-xs min-w-[700px]">
              <thead>
                <tr className="bg-muted/50 border-b text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium">When</th>
                  <th className="text-left px-3 py-2 font-medium">Entity</th>
                  <th className="text-left px-3 py-2 font-medium">Reference</th>
                  <th className="text-left px-3 py-2 font-medium">Action</th>
                  <th className="text-left px-3 py-2 font-medium">Source</th>
                  <th className="text-left px-3 py-2 font-medium">Override Reason</th>
                  {ownerAccess && <th className="text-left px-3 py-2 font-medium">Override</th>}
                </tr>
              </thead>
              <tbody>
                {data.recentEvents.map((event) => (
                  <tr key={event.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{fmt(event.createdAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        {entityIcon(event.entityType)}
                        <span className="capitalize">{event.entityType.replace("_", " ")}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-medium">{event.entityRef ?? event.entityId.slice(0, 8) + "…"}</td>
                    <td className="px-3 py-2">
                      <Badge className={`text-xs no-default-active-elevate ${actionColor(event.action)}`}>
                        {humanizeAction(event.action)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{humanizeSource(event.lockSource)}</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[180px] truncate">
                      {event.overrideReason ?? "—"}
                    </td>
                    {ownerAccess && (
                      <td className="px-3 py-2">
                        {event.action === "locked" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => { setOverrideTarget(event); setOverrideOpen(true); }}
                                data-testid={`button-override-lock-${event.entityId}`}
                              >
                                <LockOpen className="w-3 h-3 mr-1" />
                                Override
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Unlock this {event.entityType} for editing (Owner only)</TooltipContent>
                          </Tooltip>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Override Dialog ── */}
      <OverrideDialog
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        event={overrideTarget}
        onSuccess={refresh}
      />
    </div>
  );
}
