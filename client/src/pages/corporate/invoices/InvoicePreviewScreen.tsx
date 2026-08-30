/**
 * InvoicePreviewScreen
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-fidelity PDF-matching invoice preview with grouped sections,
 * expandable charge detail, validation panel, and action buttons.
 *
 * Props:
 *   invoiceId   – ID of invoice to preview
 *   onReturn    – callback when user clicks "Return to Edit"
 *   onSent      – callback after invoice is successfully sent
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle, CheckCircle2, Info, ChevronDown, ChevronRight,
  Send, FileEdit, FileCheck, Loader2, AlertCircle, X,
  Printer, Download, Eye,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ValidationIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
}

interface LineItemGroup {
  category: string;
  label: string;
  items: any[];
  total: number;
}

interface ChargeGroup {
  category: string;
  label: string;
  chargeCount: number;
  totalAmount: number;
  totalQuantity: number | null;
  quantityLabel: string | null;
  charges: any[];
}

interface PreviewData {
  invoice: any;
  chargeGroups: ChargeGroup[];
  lineItemGroups: LineItemGroup[];
  allowedActions: string[];
  validation: { isValid: boolean; issues: ValidationIssue[] };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: string | number | null | undefined): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(v) || 0);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

function statusBadge(status: string) {
  const variants: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    approved: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    sent: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    partially_paid: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    void: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };
  const labels: Record<string, string> = {
    draft: "Draft", approved: "Approved", sent: "Sent",
    partially_paid: "Partially Paid", paid: "Paid",
    cancelled: "Cancelled", void: "Void",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variants[status] ?? "bg-gray-100 text-gray-700"}`}>
      {labels[status] ?? status}
    </span>
  );
}

const CATEGORY_ACCENT: Record<string, string> = {
  labor: "border-blue-400 dark:border-blue-600",
  moves: "border-orange-400 dark:border-orange-600",
  rideshare: "border-purple-400 dark:border-purple-600",
  fees: "border-emerald-400 dark:border-emerald-600",
  other: "border-gray-300 dark:border-gray-600",
  service: "border-blue-400 dark:border-blue-600",
  fee: "border-emerald-400 dark:border-emerald-600",
  mileage: "border-orange-400 dark:border-orange-600",
  surcharge: "border-amber-400 dark:border-amber-600",
  late_fee: "border-red-400 dark:border-red-600",
  bad_debt: "border-gray-400 dark:border-gray-600",
};

// ─── Validation Panel ─────────────────────────────────────────────────────────

function ValidationPanel({ issues }: { issues: ValidationIssue[] }) {
  const errors = issues.filter(i => i.severity === "error");
  const warnings = issues.filter(i => i.severity === "warning");
  const infos = issues.filter(i => i.severity === "info");

  if (issues.length === 0) {
    return (
      <div className="rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
        <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
          Invoice looks good — ready to send
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card space-y-0 overflow-hidden" data-testid="panel-validation">
      <div className="px-3 py-2 bg-muted/40 border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Validation
          {errors.length > 0 && <span className="ml-2 text-red-600 dark:text-red-400">· {errors.length} error{errors.length !== 1 ? "s" : ""}</span>}
          {warnings.length > 0 && <span className="ml-2 text-amber-600 dark:text-amber-400">· {warnings.length} warning{warnings.length !== 1 ? "s" : ""}</span>}
        </p>
      </div>
      <div className="divide-y divide-border">
        {issues.map((issue, idx) => (
          <div key={idx} className="flex items-start gap-2.5 px-3 py-2.5" data-testid={`validation-issue-${issue.code}`}>
            {issue.severity === "error" && <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />}
            {issue.severity === "warning" && <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />}
            {issue.severity === "info" && <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />}
            <p className="text-xs text-foreground leading-relaxed">{issue.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Charge Group Section (from billable_charges) ────────────────────────────

function ChargeGroupSection({ group }: { group: ChargeGroup }) {
  const [expanded, setExpanded] = useState(false);
  const accent = CATEGORY_ACCENT[group.category] ?? CATEGORY_ACCENT.other;

  return (
    <div className={`border-l-2 ${accent} pl-4`} data-testid={`section-charge-group-${group.category}`}>
      {/* Section header */}
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-left"
            data-testid={`button-expand-group-${group.category}`}
          >
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            }
            <span className="text-sm font-semibold">{group.label}</span>
          </button>
          <span className="text-xs text-muted-foreground">
            {group.chargeCount} charge{group.chargeCount !== 1 ? "s" : ""}
            {group.totalQuantity !== null && group.quantityLabel && (
              <> · {group.totalQuantity.toFixed(2)} {group.quantityLabel}</>
            )}
          </span>
        </div>
        <span className="text-sm font-semibold tabular-nums">{fmt(group.totalAmount)}</span>
      </div>

      {/* Expanded charge list */}
      {expanded && (
        <div className="pb-3 space-y-1">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 pb-1 border-b border-border/50">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Description</span>
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">Qty</span>
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">Rate</span>
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">Amount</span>
          </div>
          {group.charges.map((c, i) => (
            <div key={c.id ?? i} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 py-0.5" data-testid={`row-charge-${c.id}`}>
              <div>
                <p className="text-xs text-foreground">{c.description || c.productName || "—"}</p>
                {c.chargeDate && <p className="text-[11px] text-muted-foreground">{fmtDate(c.chargeDate)}</p>}
              </div>
              <span className="text-xs tabular-nums text-right">{c.quantity.toFixed(2)}</span>
              <span className="text-xs tabular-nums text-right">{fmt(c.unitRate)}</span>
              <span className="text-xs tabular-nums text-right font-medium">{fmt(c.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Line Item Group Section (from invoice_line_items) ────────────────────────

function LineItemGroupSection({ group }: { group: LineItemGroup }) {
  const [expanded, setExpanded] = useState(false);
  const accent = CATEGORY_ACCENT[group.category] ?? CATEGORY_ACCENT.other;

  return (
    <div className={`border-l-2 ${accent} pl-4`} data-testid={`section-line-item-${group.category}`}>
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-left"
            data-testid={`button-expand-ligroup-${group.category}`}
          >
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            }
            <span className="text-sm font-semibold">{group.label}</span>
          </button>
          <span className="text-xs text-muted-foreground">
            {group.items.length} line{group.items.length !== 1 ? "s" : ""}
          </span>
        </div>
        <span className="text-sm font-semibold tabular-nums">{fmt(group.total)}</span>
      </div>

      {expanded && (
        <div className="pb-3 space-y-1">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 pb-1 border-b border-border/50">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Description</span>
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">Qty</span>
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">Unit Price</span>
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">Total</span>
          </div>
          {group.items.map((li: any) => (
            <div key={li.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 py-0.5" data-testid={`row-lineitem-${li.id}`}>
              <div>
                <p className="text-xs text-foreground">{li.description || "—"}</p>
                {(li.billingPeriodStart || li.dateOfService) && (
                  <p className="text-[11px] text-muted-foreground">
                    {li.billingPeriodStart && li.billingPeriodEnd
                      ? `${fmtDate(li.billingPeriodStart)} – ${fmtDate(li.billingPeriodEnd)}`
                      : fmtDate(li.dateOfService)}
                  </p>
                )}
              </div>
              <span className="text-xs tabular-nums text-right">{parseFloat(li.quantity ?? "0").toFixed(2)}</span>
              <span className="text-xs tabular-nums text-right">{fmt(li.unitPrice)}</span>
              <span className="text-xs tabular-nums text-right font-medium">{fmt(li.totalPrice)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Invoice Paper Render ─────────────────────────────────────────────────────

function InvoicePaper({ data }: { data: PreviewData }) {
  const { invoice, chargeGroups, lineItemGroups } = data;
  const hasChargeGroups = chargeGroups.length > 0;
  const hasLineItemGroups = lineItemGroups.length > 0;

  const subtotal = parseFloat(invoice.subtotalAmount ?? invoice.totalAmount ?? "0");
  const tax = parseFloat(invoice.taxAmount ?? "0");
  const total = parseFloat(invoice.totalAmount ?? "0");
  const paid = parseFloat(invoice.paidAmount ?? "0");
  const balanceDue = parseFloat(invoice.balanceDue ?? invoice.totalAmount ?? "0");

  return (
    <div
      className="bg-white dark:bg-card rounded-md border border-border shadow-sm"
      style={{ maxWidth: 760 }}
      data-testid="panel-invoice-paper"
    >
      {/* ── Header ── */}
      <div className="px-10 pt-10 pb-6 border-b border-border/60">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          {/* Company branding (placeholder) */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center">
                <span className="text-primary font-bold text-sm">D</span>
              </div>
              <span className="text-lg font-bold text-foreground">Driver on Demand</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Transportation &amp; Logistics Services
            </p>
          </div>

          {/* Invoice meta */}
          <div className="text-right space-y-1">
            <p className="text-2xl font-bold text-foreground tracking-tight">INVOICE</p>
            <p className="text-sm font-mono font-semibold text-primary" data-testid="text-invoice-number">
              {invoice.invoiceNumber}
            </p>
            <div className="text-xs text-muted-foreground space-y-0.5 mt-2">
              <div className="flex items-center justify-end gap-8">
                <span>Date</span>
                <span className="font-medium text-foreground" data-testid="text-invoice-date">{fmtDate(invoice.invoiceDate)}</span>
              </div>
              <div className="flex items-center justify-end gap-8">
                <span>Due</span>
                <span className="font-medium text-foreground" data-testid="text-invoice-due">{fmtDate(invoice.dueDate)}</span>
              </div>
              {invoice.billingPeriodStart && (
                <div className="flex items-center justify-end gap-8">
                  <span>Period</span>
                  <span className="font-medium text-foreground">
                    {fmtDate(invoice.billingPeriodStart)} – {fmtDate(invoice.billingPeriodEnd)}
                  </span>
                </div>
              )}
              {invoice.poNumber && (
                <div className="flex items-center justify-end gap-8">
                  <span>PO #</span>
                  <span className="font-medium text-foreground">{invoice.poNumber}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bill To ── */}
      <div className="px-10 py-6 border-b border-border/60">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Bill To</p>
            <p className="text-sm font-semibold text-foreground" data-testid="text-customer-name">{invoice.customerName}</p>
            <p className="text-xs text-muted-foreground">Customer ID: {invoice.customerId?.slice(0, 8)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Status</p>
            {statusBadge(invoice.status ?? "draft")}
            {invoice.sentAt && (
              <p className="text-xs text-muted-foreground mt-1">
                Sent {new Date(invoice.sentAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Line Items ── */}
      <div className="px-10 py-6">
        {/* Show charge groups (Revenue Engine) or invoice line item groups (manual) */}
        {hasChargeGroups ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Service Category</span>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Amount</span>
            </div>
            <div className="space-y-2 pt-1">
              {chargeGroups.map((group) => (
                <ChargeGroupSection key={group.category} group={group} />
              ))}
            </div>
          </div>
        ) : hasLineItemGroups ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Description</span>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Amount</span>
            </div>
            <div className="space-y-2 pt-1">
              {lineItemGroups.map((group) => (
                <LineItemGroupSection key={group.category} group={group} />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <Eye className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No line items on this invoice</p>
          </div>
        )}
      </div>

      {/* ── Totals ── */}
      <div className="px-10 pb-6 border-t border-border/60">
        <div className="flex justify-end mt-4">
          <div className="w-64 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium tabular-nums" data-testid="text-subtotal">{fmt(subtotal)}</span>
            </div>
            {tax > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span className="font-medium tabular-nums">{fmt(tax)}</span>
              </div>
            )}
            {paid > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">({fmt(paid)})</span>
              </div>
            )}
            <div className="border-t border-border pt-2">
              <div className="flex justify-between">
                <span className="text-base font-bold">Balance Due</span>
                <span className="text-base font-bold tabular-nums" data-testid="text-balance-due">{fmt(balanceDue)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Memo / Terms ── */}
      {(invoice.customerMemo || invoice.termsText) && (
        <div className="px-10 pb-8 border-t border-border/60 pt-4 space-y-3">
          {invoice.customerMemo && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap" data-testid="text-customer-memo">
                {invoice.customerMemo}
              </p>
            </div>
          )}
          {invoice.termsText && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Payment Terms</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{invoice.termsText}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface InvoicePreviewScreenProps {
  invoiceId: string;
  onReturn?: () => void;
  onSent?: (invoice: any) => void;
}

export function InvoicePreviewScreen({ invoiceId, onReturn, onSent }: InvoicePreviewScreenProps) {
  const { toast } = useToast();
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);

  // ── Fetch preview data ─────────────────────────────────────────────────────
  const { data, isLoading, error } = useQuery<PreviewData>({
    queryKey: ["/api/corporate/invoicing/invoices", invoiceId, "preview-data"],
    queryFn: async () => {
      const res = await fetch(`/api/corporate/invoicing/invoices/${invoiceId}/preview-data`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load preview");
      return res.json();
    },
    enabled: !!invoiceId,
  });

  // ── Send mutation ──────────────────────────────────────────────────────────
  const sendMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/corporate/invoicing/invoices/${invoiceId}/send`, { toEmails: [] }),
    onSuccess: (result: any) => {
      setSendConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices", invoiceId, "preview-data"] });
      toast({ title: "Invoice sent successfully" });
      if (onSent) onSent(data?.invoice);
    },
    onError: (e: any) => {
      setSendConfirmOpen(false);
      toast({ title: "Failed to send invoice", description: e.message, variant: "destructive" });
    },
  });

  // ── Loading / error states ─────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading preview…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm font-medium">Failed to load invoice preview</p>
        <p className="text-xs text-muted-foreground">{(error as any)?.message ?? "Unknown error"}</p>
      </div>
    );
  }

  const { invoice, validation, allowedActions } = data;
  const canSend = allowedActions?.includes("send") && validation.isValid;
  const canApprove = allowedActions?.includes("approve");
  const isTerminal = ["cancelled", "void", "paid"].includes(invoice.status ?? "");
  const isSent = ["sent", "partially_paid"].includes(invoice.status ?? "");
  const hasErrors = validation.issues.some(i => i.severity === "error");

  return (
    <div className="space-y-5" data-testid="invoice-preview-screen">
      {/* ── Action bar ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {onReturn && (
            <Button variant="ghost" size="sm" onClick={onReturn} data-testid="button-preview-return">
              <FileEdit className="h-4 w-4 mr-1.5" />
              Return to Edit
            </Button>
          )}
          <div className="text-sm">
            <span className="font-semibold">{invoice.invoiceNumber}</span>
            <span className="mx-2 text-muted-foreground">·</span>
            {statusBadge(invoice.status ?? "draft")}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Print/download — opens browser print dialog targeting paper div */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            data-testid="button-preview-print"
          >
            <Printer className="h-4 w-4 mr-1.5" />
            Print
          </Button>

          {/* Approve (if in draft and approve is allowed) */}
          {canApprove && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await apiRequest("POST", `/api/corporate/invoicing/invoices/${invoiceId}/approve`, {});
                  queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices", invoiceId, "preview-data"] });
                  toast({ title: "Invoice approved" });
                } catch (e: any) {
                  toast({ title: "Approval failed", description: e.message, variant: "destructive" });
                }
              }}
              data-testid="button-preview-approve"
            >
              <FileCheck className="h-4 w-4 mr-1.5" />
              Approve
            </Button>
          )}

          {/* Send */}
          {!isTerminal && !isSent && (
            <Button
              size="sm"
              disabled={hasErrors || sendMut.isPending}
              onClick={() => setSendConfirmOpen(true)}
              data-testid="button-preview-send"
              title={hasErrors ? "Fix validation errors before sending" : undefined}
            >
              {sendMut.isPending
                ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                : <Send className="h-4 w-4 mr-1.5" />}
              Send Invoice
            </Button>
          )}

          {isSent && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSendConfirmOpen(true)}
              data-testid="button-preview-resend"
            >
              <Send className="h-4 w-4 mr-1.5" />
              Resend
            </Button>
          )}
        </div>
      </div>

      {/* ── Validation panel ── */}
      <ValidationPanel issues={validation.issues} />

      {/* ── Two-column layout: paper + metadata sidebar ── */}
      <div className="flex gap-6 items-start">
        {/* Paper — scrollable */}
        <div className="flex-1 min-w-0 overflow-x-auto">
          <InvoicePaper data={data} />
        </div>

        {/* Sidebar — metadata */}
        <div className="w-56 flex-shrink-0 space-y-4" data-testid="panel-preview-sidebar">
          <div className="rounded-md border border-border bg-card p-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Summary</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Line items</span>
                <span className="font-medium">{invoice.lineItems?.length ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Charge groups</span>
                <span className="font-medium">{data.chargeGroups.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium tabular-nums">{fmt(invoice.subtotalAmount ?? invoice.totalAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="font-medium tabular-nums">{fmt(invoice.taxAmount ?? "0")}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="font-semibold">Total</span>
                <span className="font-semibold tabular-nums">{fmt(invoice.totalAmount)}</span>
              </div>
              {parseFloat(invoice.paidAmount ?? "0") > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Paid</span>
                  <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(invoice.paidAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="font-semibold">Balance Due</span>
                <span className="font-semibold tabular-nums">{fmt(invoice.balanceDue ?? invoice.totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Category breakdown */}
          {data.chargeGroups.length > 0 && (
            <div className="rounded-md border border-border bg-card p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">By Category</p>
              {data.chargeGroups.map(g => (
                <div key={g.category} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{g.label}</span>
                  <span className="font-medium tabular-nums">{fmt(g.totalAmount)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Timeline */}
          <div className="rounded-md border border-border bg-card p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Timeline</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice date</span>
                <span className="font-medium">{fmtDate(invoice.invoiceDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Due date</span>
                <span className="font-medium">{fmtDate(invoice.dueDate)}</span>
              </div>
              {invoice.sentAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sent</span>
                  <span className="font-medium">{new Date(invoice.sentAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </div>
              )}
              {invoice.viewedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Viewed</span>
                  <span className="font-medium">{new Date(invoice.viewedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Send Confirmation Dialog ── */}
      <Dialog open={sendConfirmOpen} onOpenChange={setSendConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              {isSent ? "Resend Invoice" : "Send Invoice"}
            </DialogTitle>
            <DialogDescription>
              {isSent
                ? `This invoice has already been sent. Resending will deliver it again to the customer contact on file.`
                : `Send ${invoice.invoiceNumber} to ${invoice.customerName}. The customer will receive an email with a link to view and pay online.`}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md bg-muted px-4 py-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoice</span>
              <span className="font-medium">{invoice.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer</span>
              <span className="font-medium">{invoice.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount Due</span>
              <span className="font-semibold">{fmt(invoice.balanceDue ?? invoice.totalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Due Date</span>
              <span className="font-medium">{fmtDate(invoice.dueDate)}</span>
            </div>
          </div>

          {validation.issues.filter(i => i.severity === "warning").length > 0 && (
            <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 space-y-1">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Warnings (review before sending)
              </p>
              {validation.issues.filter(i => i.severity === "warning").map((issue, i) => (
                <p key={i} className="text-xs text-amber-700 dark:text-amber-400">{issue.message}</p>
              ))}
            </div>
          )}

          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setSendConfirmOpen(false)} data-testid="button-send-cancel">
              Cancel
            </Button>
            <Button onClick={() => sendMut.mutate()} disabled={sendMut.isPending} data-testid="button-send-confirm">
              {sendMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isSent ? "Resend" : "Send Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
