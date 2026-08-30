import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, FileText, User, Building2, Calendar, DollarSign,
  Link as LinkIcon, SplitSquareVertical, Tag, AlertTriangle,
  CheckCircle2, Clock, RefreshCw, RotateCcw, Layers,
  ArrowRight, TrendingUp, TrendingDown, Info, ClipboardList,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtMoney(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(n: number | string | null | undefined) {
  if (n === null || n === undefined || n === "") return "—";
  return `${Number(n).toFixed(1)}%`;
}
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString();
}
function fmtDateTime(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleString();
}

// ─── Severity + Status Badges ─────────────────────────────────────────────────

export const SEVERITY_CONFIG = {
  high:    { label: "High",   cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-transparent" },
  error:   { label: "High",   cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-transparent" },
  warning: { label: "Medium", cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-transparent" },
  medium:  { label: "Medium", cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-transparent" },
  low:     { label: "Low",    cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-transparent" },
  info:    { label: "Low",    cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-transparent" },
} as const;

export const STATUS_LABELS: Record<string, { label: string; cls: string; icon: any }> = {
  open:      { label: "Open",        cls: "bg-muted text-muted-foreground border-transparent",        icon: Clock },
  in_review: { label: "In Progress", cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-transparent", icon: RefreshCw },
  resolved:  { label: "Resolved",    cls: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-transparent",    icon: CheckCircle2 },
  dismissed: { label: "Dismissed",   cls: "bg-muted text-muted-foreground line-through border-transparent", icon: ClipboardList },
};

export const EX_TYPE_LABELS: Record<string, string> = {
  missing_revenue:       "Missing Revenue",
  missing_cost:          "Missing Cost",
  unlinked_invoice_line: "Unlinked Invoice Line",
  unlinked_pay_record:   "Unlinked Pay Record",
  duplicate_mapping:     "Duplicate Mapping",
  negative_margin:       "Negative Margin",
  pass_through_issue:    "Pass-Through Issue",
  manual_flag:           "Manual Flag",
};

// Severity derived from exception type
export function exceptionSeverity(type: string): "high" | "warning" | "low" {
  const HIGH = ["missing_revenue", "negative_margin", "duplicate_mapping"];
  const LOW  = ["pass_through_issue", "manual_flag", "unlinked_invoice_line"];
  if (HIGH.includes(type)) return "high";
  if (LOW.includes(type))  return "low";
  return "warning";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1">
      <span className="text-xs text-muted-foreground min-w-[120px] shrink-0">{label}</span>
      <span className="text-xs text-right font-medium">{value ?? "—"}</span>
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-3">
      <Icon className="h-4 w-4 text-primary" />
      <h3 className="text-sm font-semibold">{children}</h3>
    </div>
  );
}

// ─── Link Invoice Line Dialog ─────────────────────────────────────────────────

function LinkInvoiceDialog({ open, onClose, invoices, onLink }: {
  open: boolean; onClose: () => void;
  invoices: any[];
  onLink: (invoiceId: string, invoiceLineId: string | null, method: string, notes: string) => void;
}) {
  const [invoiceId, setInvoiceId] = useState("");
  const [method, setMethod] = useState("direct");
  const [notes, setNotes] = useState("");

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Link Invoice to Move</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Select Invoice</p>
            <Select value={invoiceId} onValueChange={setInvoiceId}>
              <SelectTrigger data-testid="select-link-invoice"><SelectValue placeholder="Select invoice" /></SelectTrigger>
              <SelectContent className="max-h-64">
                {invoices.map((inv: any) => (
                  <SelectItem key={inv.id} value={inv.id}>
                    {inv.invoice_number} — {fmtMoney(inv.total_amount)}
                    {inv.billing_period_start ? ` (${fmtDate(inv.billing_period_start)} – ${fmtDate(inv.billing_period_end)})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Allocation Method</p>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="direct">Direct</SelectItem>
                <SelectItem value="equal_split">Equal Split</SelectItem>
                <SelectItem value="direct_invoice_line">Invoice Line</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} className="text-xs" data-testid="input-link-invoice-notes" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!invoiceId} onClick={() => { onLink(invoiceId, null, method, notes); onClose(); }} data-testid="button-confirm-link-invoice">
            Link Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Link Earnings Dialog ─────────────────────────────────────────────────────

function LinkEarningsDialog({ open, onClose, candidates, linkedEarnings, onLink }: {
  open: boolean; onClose: () => void;
  candidates: any[]; linkedEarnings: any[];
  onLink: (earningsId: string, notes: string) => void;
}) {
  const [earningsId, setEarningsId] = useState("");
  const [notes, setNotes] = useState("");
  const allOptions = [...linkedEarnings, ...candidates].filter(
    (e, i, arr) => arr.findIndex(x => x.id === e.id) === i
  );

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Link Driver Earnings</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Select Earnings Record</p>
            <Select value={earningsId} onValueChange={setEarningsId}>
              <SelectTrigger data-testid="select-link-earnings"><SelectValue placeholder="Select earnings" /></SelectTrigger>
              <SelectContent className="max-h-64">
                {allOptions.map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.driver_name || "Driver"} — {fmtMoney(e.total_amount)} ({e.pay_type}) {fmtDate(e.pay_date)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} className="text-xs" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!earningsId} onClick={() => { onLink(earningsId, notes); onClose(); }} data-testid="button-confirm-link-earnings">
            Link Earnings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Adjustment Dialog ────────────────────────────────────────────────────

function AddAdjustmentDialog({ open, onClose, onAdd }: {
  open: boolean; onClose: () => void;
  onAdd: (type: string, amount: number, notes: string) => void;
}) {
  const [adjType, setAdjType] = useState("adjustment");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add Manual Adjustment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Select value={adjType} onValueChange={setAdjType}>
            <SelectTrigger data-testid="select-adj-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="reposition">Reposition Cost</SelectItem>
              <SelectItem value="incentive">Incentive Cost</SelectItem>
              <SelectItem value="adjustment">Cost Adjustment</SelectItem>
              <SelectItem value="revenue_override">Revenue Override</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <Input
              className="pl-6"
              type="number"
              step="0.01"
              placeholder="Amount"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              data-testid="input-adj-amount"
            />
          </div>
          <Textarea placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} className="text-xs" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!amount || isNaN(parseFloat(amount))}
            onClick={() => { onAdd(adjType, parseFloat(amount), notes); onClose(); }}
            data-testid="button-confirm-adjustment"
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Audit Log Entry ──────────────────────────────────────────────────────────

const ACTION_ICONS: Record<string, any> = {
  status_change:       ArrowRight,
  assigned:            User,
  linked_invoice_line: LinkIcon,
  linked_earnings:     LinkIcon,
  added_adjustment:    Layers,
  marked_pass_through: Tag,
  recalculated:        RefreshCw,
  note_added:          FileText,
  flag_incorrect_pay:  AlertTriangle,
};

function AuditLogEntry({ entry }: { entry: any }) {
  const Icon = ACTION_ICONS[entry.action_type] ?? Info;
  return (
    <div className="flex gap-2.5 py-2.5 border-b last:border-0">
      <div className="mt-0.5 shrink-0 h-5 w-5 rounded-full bg-muted flex items-center justify-center">
        <Icon className="h-2.5 w-2.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs">{entry.description}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {entry.actor_name ?? "System"} · {fmtDateTime(entry.created_at)}
        </p>
      </div>
    </div>
  );
}

// ─── Main Reconciliation Panel ────────────────────────────────────────────────

interface Props {
  exceptionId: string | null;
  onClose: () => void;
  onResolved?: () => void;
}

export default function MarginReconciliationPanel({ exceptionId, onClose, onResolved }: Props) {
  const { toast } = useToast();
  const [linkInvoiceOpen, setLinkInvoiceOpen] = useState(false);
  const [linkEarningsOpen, setLinkEarningsOpen] = useState(false);
  const [addAdjOpen, setAddAdjOpen] = useState(false);
  const [assigningTo, setAssigningTo] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState("");

  const qKey = ["/api/corporate/move-financials/exceptions", exceptionId, "detail"];

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: qKey,
    queryFn: async () => {
      if (!exceptionId) return null;
      const res = await fetch(`/api/corporate/move-financials/exceptions/${exceptionId}/detail`, { credentials: "include" });
      return res.json();
    },
    enabled: !!exceptionId,
  });

  const { data: usersData } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { credentials: "include" });
      const d = await res.json();
      return d.users ?? d ?? [];
    },
  });

  // Generic action mutation
  function useAction(actionPath: string, label: string) {
    return useMutation({
      mutationFn: (body: any) =>
        apiRequest("POST", `/api/corporate/move-financials/exceptions/${exceptionId}/actions/${actionPath}`, body),
      onSuccess: () => {
        refetch();
        onResolved?.();
        queryClient.invalidateQueries({ queryKey: ["/api/corporate/move-financials/exceptions"] });
        toast({ title: `${label} applied` });
      },
      onError: (e: any) => toast({ title: e.message || `${label} failed`, variant: "destructive" }),
    });
  }

  const linkInvoiceMutation    = useAction("link-invoice-line", "Invoice linked");
  const linkEarningsMutation   = useAction("link-earnings", "Earnings linked");
  const addAdjustmentMutation  = useAction("add-adjustment", "Adjustment applied");
  const passThruMutation       = useAction("mark-pass-through", "Pass-through updated");
  const recalcMutation         = useAction("recalculate", "Recalculated");

  const statusMutation = useMutation({
    mutationFn: (body: any) =>
      apiRequest("PATCH", `/api/corporate/move-financials/exceptions/${exceptionId}`, body),
    onSuccess: () => {
      refetch();
      onResolved?.();
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/move-financials/exceptions"] });
      toast({ title: "Exception updated" });
      setActiveStatus(null);
      setResolveNote("");
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const ex = data?.exception;
  const mf = data?.moveFinancial;
  const invoiceLines    = data?.invoiceLines ?? [];
  const invoices        = data?.invoices ?? [];
  const linkedEarnings  = data?.linkedEarnings ?? [];
  const candidates      = data?.earningsCandidates ?? [];
  const rideshare       = data?.rideshareItems ?? [];
  const auditLog        = data?.auditLog ?? [];

  const sev = ex ? (SEVERITY_CONFIG[exceptionSeverity(ex.exception_type)] ?? SEVERITY_CONFIG.warning) : null;
  const statusCfg = ex ? (STATUS_LABELS[ex.resolution_status] ?? STATUS_LABELS.open) : null;
  const marginPct = mf ? parseFloat(mf.margin_pct ?? "0") : 0;

  const anyPending =
    linkInvoiceMutation.isPending || linkEarningsMutation.isPending ||
    addAdjustmentMutation.isPending || passThruMutation.isPending ||
    recalcMutation.isPending || statusMutation.isPending;

  return (
    <>
      <Sheet open={!!exceptionId} onOpenChange={() => onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto flex flex-col p-0">
          {/* Header */}
          <SheetHeader className="px-5 pt-5 pb-3 border-b shrink-0">
            {isLoading || !ex ? (
              <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-start gap-2 flex-wrap">
                  <SheetTitle className="text-base leading-tight flex-1">
                    {EX_TYPE_LABELS[ex.exception_type] ?? ex.exception_type}
                  </SheetTitle>
                  {sev && <Badge variant="secondary" className={`text-xs ${sev.cls}`}>{sev.label}</Badge>}
                  {statusCfg && <Badge variant="secondary" className={`text-xs ${statusCfg.cls}`}>{statusCfg.label}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{ex.description ?? "No description"}</p>

                {/* Status action bar */}
                <div className="flex gap-1.5 flex-wrap pt-1">
                  {ex.resolution_status !== "in_review" && ex.resolution_status !== "resolved" && (
                    <Button size="default" variant="outline" className="text-xs h-7"
                      onClick={() => statusMutation.mutate({ resolutionStatus: "in_review" })}
                      disabled={anyPending} data-testid="button-set-in-progress">
                      <RefreshCw className="h-3 w-3 mr-1" />Mark In Progress
                    </Button>
                  )}
                  {ex.resolution_status !== "resolved" && (
                    <Button size="default" variant="outline" className="text-xs h-7"
                      onClick={() => setActiveStatus("resolve")}
                      disabled={anyPending} data-testid="button-set-resolved">
                      <CheckCircle2 className="h-3 w-3 mr-1" />Resolve
                    </Button>
                  )}
                  <Button size="default" variant="ghost" className="text-xs h-7"
                    onClick={() => recalcMutation.mutate({})}
                    disabled={anyPending} data-testid="button-recalculate">
                    {recalcMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RotateCcw className="h-3 w-3 mr-1" />}
                    Recalculate
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => refetch()} disabled={isLoading}><RefreshCw className="h-3.5 w-3.5" /></Button>
                </div>

                {/* Assign row */}
                <div className="flex items-center gap-2 pt-0.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <Select
                    value={ex.assigned_to ?? ""}
                    onValueChange={v => statusMutation.mutate({ assignedTo: v || null })}
                  >
                    <SelectTrigger className="h-7 text-xs w-48" data-testid="select-assign-exception">
                      <SelectValue placeholder="Assign to..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Unassigned</SelectItem>
                      {(usersData ?? []).slice(0, 50).map((u: any) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.firstName ?? u.first_name} {u.lastName ?? u.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {ex.assigned_user_name && (
                    <span className="text-xs text-muted-foreground">→ {ex.assigned_user_name}</span>
                  )}
                </div>
              </div>
            )}
          </SheetHeader>

          {ex && mf && (
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* ── Move Context ──────────────────────────────────────── */}
              <div>
                <SectionTitle icon={Info}>Move Context</SectionTitle>
                <Card>
                  <CardContent className="pt-3 pb-2">
                    <InfoRow label="Move ID"      value={<span className="font-mono text-xs">{mf.move_id ?? "—"}</span>} />
                    <InfoRow label="Move #"       value={mf.move_number} />
                    <InfoRow label="Date"         value={fmtDate(mf.move_date)} />
                    <InfoRow label="Account"      value={mf.account_name_full ?? mf.account_name} />
                    <InfoRow label="Account #"    value={mf.account_number} />
                    <InfoRow label="Driver"       value={mf.driver_name} />
                    <InfoRow label="Driver Type"  value={mf.driver_type} />
                    <InfoRow label="Move Type"    value={mf.move_type} />
                    <InfoRow label="Status"       value={mf.move_status} />
                    <InfoRow label="Origin"       value={mf.origin} />
                    <InfoRow label="Destination"  value={mf.destination} />
                    {mf.market && <InfoRow label="Market" value={mf.market} />}
                    <InfoRow label="Pass-Through" value={
                      <span className="flex items-center gap-1.5">
                        <span>{mf.pass_through ? "Yes" : "No"}</span>
                        <Button variant="ghost" size="default" className="h-5 text-xs px-1"
                          onClick={() => passThruMutation.mutate({ passThrough: !mf.pass_through })}
                          disabled={anyPending} data-testid="button-toggle-pass-through">
                          {mf.pass_through ? "Disable" : "Enable"}
                        </Button>
                      </span>
                    } />
                  </CardContent>
                </Card>
              </div>

              {/* ── Revenue Section ───────────────────────────────────── */}
              <div>
                <SectionTitle icon={DollarSign}>Revenue</SectionTitle>
                <Card>
                  <CardContent className="pt-3 pb-2">
                    <InfoRow label="Billed Amount"   value={<span className="font-semibold">{fmtMoney(mf.revenue_amount)}</span>} />
                    <InfoRow label="Allocation"      value={mf.allocation_method?.replace(/_/g," ") ?? "—"} />
                    <InfoRow label="Invoice"         value={mf.invoice_number} />
                    <InfoRow label="Billing Period"  value={
                      mf.billing_period_start
                        ? `${fmtDate(mf.billing_period_start)} – ${fmtDate(mf.billing_period_end)}`
                        : "—"
                    } />

                    {invoiceLines.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs text-muted-foreground mb-1">Invoice Lines</p>
                        <div className="space-y-1">
                          {invoiceLines.map((il: any) => (
                            <div key={il.id} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                              <span className="truncate max-w-[180px]">{il.description ?? "Line item"}</span>
                              <span className="font-medium shrink-0">{fmtMoney(il.total_amount)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-1.5 mt-3 flex-wrap">
                      <Button size="default" variant="outline" className="text-xs h-7"
                        onClick={() => setLinkInvoiceOpen(true)}
                        disabled={anyPending} data-testid="button-link-invoice">
                        <LinkIcon className="h-3 w-3 mr-1" />Link Invoice
                      </Button>
                      <Button size="default" variant="outline" className="text-xs h-7"
                        onClick={() => addAdjustmentMutation.mutate({ adjustmentType: "revenue_override", amount: parseFloat(mf.bill_rate ?? "0"), notes: "Bill rate override" })}
                        disabled={anyPending || !mf.bill_rate} data-testid="button-use-bill-rate">
                        <Tag className="h-3 w-3 mr-1" />Use Bill Rate
                      </Button>
                      <Button size="default" variant="outline" className="text-xs h-7"
                        onClick={() => passThruMutation.mutate({ passThrough: true, notes: "Revenue split across multiple moves" })}
                        disabled={anyPending} data-testid="button-split-revenue">
                        <SplitSquareVertical className="h-3 w-3 mr-1" />Mark Pass-Through
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* ── Cost Section ──────────────────────────────────────── */}
              <div>
                <SectionTitle icon={Layers}>Cost</SectionTitle>
                <Card>
                  <CardContent className="pt-3 pb-2">
                    <InfoRow label="Labor Cost"       value={fmtMoney(mf.labor_cost)} />
                    <InfoRow label="Rideshare Cost"   value={fmtMoney(mf.rideshare_cost)} />
                    <InfoRow label="Reposition"       value={fmtMoney(mf.reposition_cost_amount)} />
                    <InfoRow label="Incentives"       value={fmtMoney(mf.incentive_cost_amount)} />
                    <InfoRow label="Adjustment"       value={fmtMoney(mf.adjustment_cost_amount)} />
                    <Separator className="my-2" />
                    <InfoRow label="Total Direct Cost" value={<span className="font-semibold">{fmtMoney(mf.total_direct_cost)}</span>} />

                    {linkedEarnings.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs text-muted-foreground mb-1">Linked Driver Earnings</p>
                        <div className="space-y-1">
                          {linkedEarnings.map((e: any) => (
                            <div key={e.id} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                              <span className="truncate max-w-[180px]">{e.driver_name || "Driver"} · {e.pay_type} · {fmtDate(e.pay_date)}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-medium">{fmtMoney(e.total_amount)}</span>
                                <Badge variant="secondary" className="text-xs border-transparent bg-muted">{e.status}</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {rideshare.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs text-muted-foreground mb-1">Rideshare Items</p>
                        {rideshare.map((r: any) => (
                          <div key={r.id} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                            <span>{r.provider} · {fmtDate(r.ride_date)}</span>
                            <span className="font-medium">{fmtMoney(r.total_fare)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-1.5 mt-3 flex-wrap">
                      <Button size="default" variant="outline" className="text-xs h-7"
                        onClick={() => setLinkEarningsOpen(true)}
                        disabled={anyPending} data-testid="button-link-earnings">
                        <LinkIcon className="h-3 w-3 mr-1" />Link Earnings
                      </Button>
                      <Button size="default" variant="outline" className="text-xs h-7"
                        onClick={() => setAddAdjOpen(true)}
                        disabled={anyPending} data-testid="button-add-adjustment">
                        <Layers className="h-3 w-3 mr-1" />Add Adjustment
                      </Button>
                      <Button size="default" variant="outline" className="text-xs h-7"
                        onClick={() => statusMutation.mutate({ resolutionNote: "Flagged as incorrect pay record" })}
                        disabled={anyPending} data-testid="button-flag-pay">
                        <AlertTriangle className="h-3 w-3 mr-1" />Flag Incorrect Pay
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* ── Margin Summary ────────────────────────────────────── */}
              <div>
                <SectionTitle icon={BarChart3Icon}>Margin Summary</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Revenue",    value: fmtMoney(mf.revenue_amount) },
                    { label: "Total Cost", value: fmtMoney(mf.total_direct_cost) },
                    { label: "Gross Profit", value: fmtMoney(mf.gross_profit),
                      extra: Number(mf.gross_profit) < 0 ? <TrendingDown className="h-3.5 w-3.5 text-red-500" /> : <TrendingUp className="h-3.5 w-3.5 text-green-500" /> },
                    { label: "Margin %",   value: fmtPct(mf.margin_pct),
                      extra: null, cls: marginPct < 0 ? "text-red-600 dark:text-red-400" : marginPct < 10 ? "text-yellow-600 dark:text-yellow-400" : "text-green-600 dark:text-green-400" },
                  ].map(({ label, value, extra, cls }) => (
                    <Card key={label}>
                      <CardContent className="pt-3 pb-2">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <p className={`text-base font-bold ${cls ?? ""}`}>{value}</p>
                          {extra}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <div className="mt-2">
                  <InfoRow label="Financial Status" value={
                    <Badge variant="secondary" className="text-xs border-transparent bg-muted">{mf.financial_status}</Badge>
                  } />
                  <InfoRow label="Allocation Method" value={mf.allocation_method?.replace(/_/g," ")} />
                  {mf.notes && <InfoRow label="Notes" value={<span className="text-xs italic">{mf.notes}</span>} />}
                </div>
              </div>

              {/* ── Audit Log ────────────────────────────────────────── */}
              <div>
                <SectionTitle icon={ClipboardList}>Activity Log</SectionTitle>
                {auditLog.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center">No activity recorded yet</p>
                ) : (
                  <div className="divide-y rounded-md border bg-card px-3">
                    {auditLog.map((entry: any) => (
                      <AuditLogEntry key={entry.id} entry={entry} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Resolve confirmation dialog */}
      <Dialog open={activeStatus === "resolve"} onOpenChange={() => setActiveStatus(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Resolve Exception</DialogTitle></DialogHeader>
          <Textarea
            placeholder="Resolution note (optional)..."
            value={resolveNote}
            onChange={e => setResolveNote(e.target.value)}
            data-testid="input-resolve-note"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveStatus(null)}>Cancel</Button>
            <Button
              onClick={() => statusMutation.mutate({ resolutionStatus: "resolved", resolutionNote: resolveNote })}
              disabled={statusMutation.isPending}
              data-testid="button-confirm-resolve"
            >
              {statusMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sub-dialogs */}
      <LinkInvoiceDialog
        open={linkInvoiceOpen}
        onClose={() => setLinkInvoiceOpen(false)}
        invoices={invoices}
        onLink={(invoiceId, invoiceLineId, method, notes) =>
          linkInvoiceMutation.mutate({ invoiceId, invoiceLineId, allocationMethod: method, notes })
        }
      />
      <LinkEarningsDialog
        open={linkEarningsOpen}
        onClose={() => setLinkEarningsOpen(false)}
        candidates={candidates}
        linkedEarnings={linkedEarnings}
        onLink={(earningsId, notes) => linkEarningsMutation.mutate({ earningsId, notes })}
      />
      <AddAdjustmentDialog
        open={addAdjOpen}
        onClose={() => setAddAdjOpen(false)}
        onAdd={(type, amount, notes) => addAdjustmentMutation.mutate({ adjustmentType: type, amount, notes })}
      />
    </>
  );
}

// A tiny BarChart icon inline (lucide doesn't export BarChart3 in older builds)
function BarChart3Icon({ className }: { className?: string }) {
  return <TrendingUp className={className} />;
}
