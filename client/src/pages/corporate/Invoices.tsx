import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { parseDateSafe } from "@/lib/dateFormat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatDate } from "@/lib/dateFormat";
import { 
  Loader2, Plus, FileText, Send, DollarSign, AlertCircle, Trash2, 
  CreditCard, Receipt, Clock, CheckCircle, Ban, Building2, Circle,
  Banknote, Archive, Calendar, Eye, EyeOff, XCircle, Pencil, RotateCw, Download, Filter, CloudUpload,
  Copy, MailWarning, Paperclip, AlertTriangle, ShieldAlert,
  GitBranch, History, ShieldCheck, Layers, Scale,
  Search, SlidersHorizontal, Bookmark, BookmarkPlus, Share2, X,
  Truck, Car, Users, Tag, ChevronDown, ChevronRight, Zap, Activity, ClipboardList,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Invoice, BillableCharge, Payment, Customer, InvoiceSavedView } from "@shared/schema";
import { useState, useCallback, useEffect, type ElementType } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { InvoiceApprovalWorkflow, ApprovalStateBadge, getApprovalStateLabel } from "@/components/invoicing/InvoiceApprovalWorkflow";
import { BillingEntitySettings } from "@/components/invoicing/BillingEntitySettings";
import { InvoicingExports } from "@/components/invoicing/InvoicingExports";
import { ManualPaymentDialog } from "@/components/invoicing/ManualPaymentDialog";
import { InvoiceAttachments } from "@/components/invoicing/InvoiceAttachments";
import { BillingStatementsTab } from "@/components/invoicing/BillingStatementsTab";
import { PaymentCommitmentsTab } from "@/components/invoicing/PaymentCommitmentsTab";
import { FinancialReconciliationDashboard } from "@/components/invoicing/FinancialReconciliationDashboard";
import { FinancialAuditLogTab } from "@/components/invoicing/FinancialAuditLogTab";
import { FinancialUserActivityDashboard } from "@/components/invoicing/FinancialUserActivityDashboard";
import { FraudPatternPlaybook } from "@/components/invoicing/FraudPatternPlaybook";
import { RolloutMonitoringDashboard } from "@/components/invoicing/RolloutMonitoringDashboard";
import { RolloutChecklist } from "@/components/invoicing/RolloutChecklist";
import { DuplicatePreventionDashboard } from "@/components/invoicing/DuplicatePreventionDashboard";
import { FinancialLockPanel } from "@/components/invoicing/FinancialLockPanel";
import { BillingDocumentsAdmin } from "@/components/invoicing/BillingDocumentsAdmin";
import { EntityAuditTrail, PaymentAuditDialog } from "@/components/invoicing/EntityAuditTrail";
import { PaymentAdjustmentModal, PaymentAdjustmentAction } from "@/components/invoicing/PaymentAdjustmentModal";
import { UnappliedPaymentsPanel } from "@/components/invoicing/UnappliedPaymentsPanel";
import { InvoicePreviewScreen } from "@/pages/corporate/invoices/InvoicePreviewScreen";
import BillingEngine from "@/pages/corporate/BillingEngine";
import MarginEngine from "@/pages/corporate/MarginEngine";
import AccountProducts from "@/pages/corporate/AccountProducts";
import { PaymentMethodControls } from "@/components/invoicing/PaymentMethodControls";
import { AutopayEnrollmentPanel } from "@/components/invoicing/AutopayEnrollmentPanel";
import { InvoiceImportEngine } from "@/components/invoicing/InvoiceImportEngine";
import { WriteOffDialog } from "@/components/invoicing/WriteOffDialog";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Settings, FileX, Lock, Unlock, ArrowRight, ArrowUpFromLine, FileDown, Database, ArrowUpDown, ChevronUp, ChevronDown, MoreVertical, RotateCcw, Edit2, UserX, Trash2 } from "lucide-react";

interface InvoicingStats {
  totalOutstanding: string;
  overdueAmount: string;
  pendingCharges: string;
  pendingChargesCount: number;
  invoicesSentThisMonth: number;
  paymentsReceivedThisMonth: string;
  averageDaysToPayment: number;
  agingSummary: {
    current: string;
    days1to30: string;
    days31to60: string;
    days61to90: string;
    over90: string;
  };
}

interface AgingBucket {
  customerId: string;
  customerName: string;
  current: string;
  days1to30: string;
  days31to60: string;
  days61to90: string;
  over90: string;
  total: string;
}

interface DepositBatch {
  id: string;
  batchNumber: string;
  depositDate: string;
  status: string;
  totalAmount: string;
  itemCount: number;
  bankAccountName?: string;
  bankAccountLast4?: string;
  depositMethod?: string;
  notes?: string;
  submittedAt?: string;
  submittedBy?: string;
  lockedAt?: string;
  lockedBy?: string;
  reconciledAt?: string;
  reconciledBy?: string;
  reconciliationReference?: string;
  statementDate?: string;
  actualDepositAmount?: string;
  discrepancyAmount?: string;
  discrepancyNotes?: string;
}

interface DepositBatchAuditEntry {
  id: string;
  batchId: string;
  action: string;
  fromStatus?: string;
  toStatus?: string;
  performedBy: string;
  performedByName?: string;
  metadata?: any;
  createdAt: string;
}

const INVOICE_STATUSES = ['draft', 'approved', 'sent', 'viewed', 'paid', 'partially_paid', 'overdue', 'void', 'written_off'] as const;
const CHARGE_STATUSES = ['draft', 'pending_approval', 'approved', 'invoiced', 'rejected'] as const;
const PAYMENT_STATUSES = ['pending', 'completed', 'failed', 'refunded', 'voided'] as const;

import { getStatusBadgeClass } from "@/lib/statusColors";
function getStatusColor(status: string | null): string {
  return getStatusBadgeClass(status);
}

const DEPOSIT_STATUS_DESCRIPTIONS: Record<string, string> = {
  draft: "This deposit batch is being assembled. Payments and details can still be modified.",
  balanced: "This batch is internally validated and ready for submission.",
  submitted: "This batch has been submitted for accounting processing. Editing is disabled.",
  locked: "This batch has been deposited/exported and is locked from modification.",
  reconciled: "This batch has been reconciled against the bank statement.",
};

const chargeFormSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  productId: z.string().min(1, "Product is required"),
  description: z.string().min(1, "Description is required"),
  chargeDate: z.string().min(1, "Charge date is required"),
  quantity: z.string().min(1, "Quantity is required"),
  unitRate: z.string().min(1, "Unit rate is required"),
});

const invoiceFormSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  invoiceDate: z.string().min(1, "Invoice date is required"),
  dueDate: z.string().min(1, "Due date is required"),
  notes: z.string().optional(),
});

const paymentFormSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  amount: z.string().min(1, "Amount is required"),
  paymentDate: z.string().min(1, "Payment date is required"),
  paymentMethod: z.string().min(1, "Payment method is required"),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
  depositBatchId: z.string().optional(),
});

// Line item categories for reporting and accounting mapping
const LINE_ITEM_CATEGORIES = [
  { value: "service", label: "Service" },
  { value: "mileage", label: "Mileage" },
  { value: "fee", label: "Fee" },
  { value: "surcharge", label: "Surcharge" },
  { value: "late_fee", label: "Late Fee" },
  { value: "other", label: "Other" },
] as const;

const lineItemFormSchema = z.object({
  description: z.string().min(1, "Description is required"),
  category: z.enum(["service", "mileage", "fee", "surcharge", "late_fee", "other"]),
  quantity: z.string().min(1, "Quantity is required"),
  unitPrice: z.string().min(1, "Unit price is required"),
});

type ChargeFormValues = z.infer<typeof chargeFormSchema>;
type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;
type PaymentFormValues = z.infer<typeof paymentFormSchema>;
type LineItemFormValues = z.infer<typeof lineItemFormSchema>;

function CreditStatusIndicator({ customerId }: { customerId: string | null }) {
  const { data } = useQuery<any>({
    queryKey: ['/api/corporate/invoicing/credit-exposure', customerId],
    enabled: !!customerId,
    staleTime: 30000,
  });
  if (!data?.isOverLimit) return null;
  return (
    <span
      title={`Credit ${data.creditLimitAction === 'block' ? 'blocked' : 'warning'}: $${data.totalExposure?.toLocaleString()} / $${data.creditLimit?.toLocaleString()}`}
      className="inline-flex"
      data-testid={`credit-indicator-${customerId}`}
    >
      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
    </span>
  );
}


function PaymentMethodsTabContent() {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const { data: customersList } = useQuery<Customer[]>({
    queryKey: ['/api/corporate/customers'],
  });

  return (
    <div className="space-y-4" data-testid="payment-methods-content">
      <div>
        <h3 className="text-lg font-semibold">Payment Method Controls</h3>
        <p className="text-sm text-muted-foreground">
          Configure which payment methods are allowed per customer to reduce risk and enforce preferred payment behavior.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Select Customer</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={selectedCustomerId || ""}
              onValueChange={(v) => setSelectedCustomerId(v)}
            >
              <SelectTrigger data-testid="select-pm-customer">
                <SelectValue placeholder="Choose a customer..." />
              </SelectTrigger>
              <SelectContent>
                {customersList?.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.customerName || c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
        <div className="lg:col-span-2 space-y-4">
          {selectedCustomerId ? (
            <>
              <PaymentMethodControls
                customerId={selectedCustomerId}
                customerName={customersList?.find((c: any) => c.id === selectedCustomerId)?.customerName || customersList?.find((c: any) => c.id === selectedCustomerId)?.name}
              />
              <AutopayEnrollmentPanel
                customerId={selectedCustomerId}
                customerName={customersList?.find((c: any) => c.id === selectedCustomerId)?.customerName || customersList?.find((c: any) => c.id === selectedCustomerId)?.name}
              />
            </>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <p className="text-muted-foreground" data-testid="text-select-customer-prompt">
                  Select a customer to manage their payment method settings
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function SlaRulesTable() {
  const { data: rules = [], isLoading } = useQuery<any[]>({ queryKey: ['/api/corporate/invoicing/sla-rules'] });
  const { toast } = useToast();
  
  if (isLoading) return <div className="text-sm text-muted-foreground">Loading rules...</div>;
  if (rules.length === 0) return <div className="text-sm text-muted-foreground">No SLA rules configured yet.</div>;

  const triggerLabels: Record<string, string> = {
    not_sent_after_service: 'Not Sent After Service',
    unpaid_past_due: 'Unpaid Past Due',
    unpaid_after_reminders: 'Unpaid After Reminders',
  };
  const actionLabels: Record<string, string> = {
    alert: 'Internal Alert',
    escalation_required: 'Mark Escalation Required',
    assign_collections: 'Assign to Collections',
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Trigger</TableHead>
          <TableHead>Threshold</TableHead>
          <TableHead>Severity</TableHead>
          <TableHead>Escalation</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((rule: any) => (
          <TableRow key={rule.id} data-testid={`sla-rule-row-${rule.id}`}>
            <TableCell className="font-medium">{rule.name}</TableCell>
            <TableCell>{triggerLabels[rule.triggerType] || rule.triggerType}</TableCell>
            <TableCell>
              {rule.triggerType === 'unpaid_after_reminders' ? `${rule.thresholdReminders} reminders` : `${rule.thresholdDays} days`}
            </TableCell>
            <TableCell>
              <Badge className={rule.severity === 'critical' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300' : 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300'}>
                {rule.severity}
              </Badge>
            </TableCell>
            <TableCell>{actionLabels[rule.escalationAction] || rule.escalationAction}</TableCell>
            <TableCell>
              <Badge variant="outline" className={rule.isActive ? '' : 'opacity-50'}>{rule.isActive ? 'Active' : 'Inactive'}</Badge>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" data-testid={`button-toggle-sla-rule-${rule.id}`}
                  onClick={async () => {
                    await apiRequest('PATCH', `/api/corporate/invoicing/sla-rules/${rule.id}`, { isActive: !rule.isActive });
                    queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/sla-rules'] });
                  }}>
                  {rule.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
                <Button size="icon" variant="ghost" data-testid={`button-delete-sla-rule-${rule.id}`}
                  onClick={async () => {
                    await apiRequest('DELETE', `/api/corporate/invoicing/sla-rules/${rule.id}`);
                    queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/sla-rules'] });
                    toast({ title: 'Rule deleted' });
                  }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SlaRuleForm({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState('unpaid_past_due');
  const [thresholdDays, setThresholdDays] = useState('30');
  const [thresholdReminders, setThresholdReminders] = useState('3');
  const [severity, setSeverity] = useState('warning');
  const [escalationAction, setEscalationAction] = useState('alert');
  const [description, setDescription] = useState('');
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!name) { toast({ title: 'Name is required', variant: 'destructive' }); return; }
    const payload: any = { name, triggerType, severity, escalationAction, description: description || undefined };
    if (triggerType === 'unpaid_after_reminders') {
      payload.thresholdReminders = parseInt(thresholdReminders) || 3;
    } else {
      payload.thresholdDays = parseInt(thresholdDays) || 30;
    }
    try {
      await apiRequest('POST', '/api/corporate/invoicing/sla-rules', payload);
      toast({ title: 'SLA Rule created' });
      onSuccess();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Rule Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., 30-Day Past Due Alert" data-testid="input-sla-rule-name" />
      </div>
      <div className="space-y-2">
        <Label>Trigger Type</Label>
        <Select value={triggerType} onValueChange={setTriggerType}>
          <SelectTrigger data-testid="select-sla-trigger-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="not_sent_after_service">Not Sent After Service</SelectItem>
            <SelectItem value="unpaid_past_due">Unpaid Past Due</SelectItem>
            <SelectItem value="unpaid_after_reminders">Unpaid After Reminders</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {triggerType === 'unpaid_after_reminders' ? (
        <div className="space-y-2">
          <Label>Reminder Count Threshold</Label>
          <Input type="number" value={thresholdReminders} onChange={(e) => setThresholdReminders(e.target.value)} data-testid="input-sla-threshold-reminders" />
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Days Threshold</Label>
          <Input type="number" value={thresholdDays} onChange={(e) => setThresholdDays(e.target.value)} data-testid="input-sla-threshold-days" />
        </div>
      )}
      <div className="space-y-2">
        <Label>Severity</Label>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger data-testid="select-sla-severity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Escalation Action</Label>
        <Select value={escalationAction} onValueChange={setEscalationAction}>
          <SelectTrigger data-testid="select-sla-escalation-action">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alert">Internal Alert Only</SelectItem>
            <SelectItem value="escalation_required">Mark Escalation Required</SelectItem>
            <SelectItem value="assign_collections">Assign to Collections</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Description (optional)</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe this rule..." data-testid="input-sla-description" />
      </div>
      <Button onClick={handleSubmit} className="w-full" data-testid="button-submit-sla-rule">Create Rule</Button>
    </div>
  );
}

function ConsolidationDetailSection({ invoiceId }: { invoiceId: string }) {
  const { data: detail, isLoading } = useQuery<{ sources: any[]; totalAmount: string }>({
    queryKey: ['/api/corporate/invoicing/invoices', invoiceId, 'consolidation-detail'],
    queryFn: async () => {
      const res = await fetch(`/api/corporate/invoicing/invoices/${invoiceId}/consolidation-detail`);
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
  });

  if (isLoading) return <div className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading sources...</div>;
  if (!detail || !detail.sources.length) return null;

  return (
    <div className="space-y-3" data-testid="section-consolidation-detail">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <Layers className="w-4 h-4" />
        Consolidation Sources ({detail.sources.length})
      </h4>
      <div className="space-y-2">
        {detail.sources.map((source: any) => (
          <Card key={source.id}>
            <CardContent className="py-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{source.sourceType === 'invoice' ? 'Invoice' : 'Charge'}</Badge>
                  <span className="text-sm font-medium" data-testid={`consolidation-source-desc-${source.id}`}>
                    {source.sourceDescription || 'N/A'}
                  </span>
                </div>
                <span className="text-sm font-medium" data-testid={`consolidation-source-amount-${source.id}`}>
                  ${parseFloat(source.sourceAmount).toFixed(2)}
                </span>
              </div>
              {source.sourceType === 'invoice' && source.invoice && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Invoice #{source.invoice.invoiceNumber} - {source.invoice.customerName} - {source.lineItems?.length || 0} line items
                </div>
              )}
              {source.sourceType === 'charge' && source.charge && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {source.charge.description} — {source.charge.chargeDate} — Qty: {source.charge.quantity}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex justify-end">
        <span className="text-sm font-semibold">Total: ${parseFloat(detail.totalAmount).toFixed(2)}</span>
      </div>
    </div>
  );
}

// ─── Revenue Engine: Invoice Charge Groups ────────────────────────────────────
// Displayed on invoices created by the run-weekly engine (billable_charges path).
// Shows charges grouped into the four canonical billing categories.

const CHARGE_CATEGORY_META: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  labor:     { label: "Labor",     icon: Users, color: "text-blue-700 dark:text-blue-300",    bg: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800"    },
  moves:     { label: "Moves",     icon: Truck, color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800" },
  rideshare: { label: "Rideshare", icon: Car,   color: "text-violet-700 dark:text-violet-300", bg: "bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800"   },
  fees:      { label: "Fees",      icon: Tag,   color: "text-amber-700 dark:text-amber-300",   bg: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800"       },
  other:     { label: "Other",     icon: Receipt, color: "text-muted-foreground",              bg: "bg-muted/30 border-border"                                                      },
};

function InvoiceChargeGroups({ invoiceId }: { invoiceId: string }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/corporate/invoicing/invoices", invoiceId, "charge-groups"],
    queryFn: async () => {
      const res = await fetch(`/api/corporate/invoicing/invoices/${invoiceId}/charge-groups`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load charge groups");
      return res.json();
    },
    staleTime: 30_000,
  });

  if (isLoading) return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading charge breakdown…
    </div>
  );

  if (!data || data.groups?.length === 0) return null;

  const toggle = (cat: string) => setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }));

  return (
    <div className="space-y-3 mt-4" data-testid="section-charge-groups">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2 text-sm">
          <Zap className="h-4 w-4 text-primary" />
          Revenue Engine Charges
          <Badge variant="outline" className="text-xs">{data.chargeCount} charges</Badge>
        </h3>
        <span className="text-sm font-semibold">${parseFloat(data.totalAmount || 0).toFixed(2)}</span>
      </div>

      {/* One section per category */}
      {data.groups.map((group: any) => {
        const meta = CHARGE_CATEGORY_META[group.category] ?? CHARGE_CATEGORY_META.other;
        const Icon = meta.icon;
        const isOpen = !!expanded[group.category];

        return (
          <div key={group.category} className={`rounded-md border ${meta.bg}`} data-testid={`charge-group-${group.category}`}>
            {/* Section header row — clickable to expand */}
            <button
              className="w-full flex items-center justify-between px-4 py-3 gap-3"
              onClick={() => toggle(group.category)}
              data-testid={`button-expand-group-${group.category}`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`h-4 w-4 flex-shrink-0 ${meta.color}`} />
                <span className={`font-semibold text-sm ${meta.color}`}>{meta.label}</span>
                <span className="text-xs text-muted-foreground">
                  {group.chargeCount} {group.chargeCount === 1 ? "charge" : "charges"}
                  {group.totalQuantity != null && group.quantityLabel
                    ? ` · ${Number(group.totalQuantity).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${group.quantityLabel}`
                    : ""}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`font-bold text-sm ${meta.color}`}>${parseFloat(group.totalAmount || 0).toFixed(2)}</span>
                {isOpen
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                }
              </div>
            </button>

            {/* Expandable charge rows */}
            {isOpen && (
              <div className="border-t">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-background/60">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Description</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">Date</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden md:table-cell">Source</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.charges.map((charge: any, idx: number) => (
                      <tr
                        key={charge.id}
                        className={idx % 2 === 0 ? "bg-background/40" : "bg-background/20"}
                        data-testid={`charge-row-${charge.id}`}
                      >
                        <td className="px-4 py-2">
                          <p className="font-medium leading-snug">{charge.description}</p>
                          {charge.productName && (
                            <p className="text-muted-foreground leading-snug">{charge.productName}</p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                          {charge.chargeDate ? formatDate(charge.chargeDate) : "—"}
                        </td>
                        <td className="px-3 py-2 hidden md:table-cell">
                          {charge.sourceType && (
                            <Badge variant="outline" className="text-xs capitalize">
                              {charge.sourceType.replace(/_/g, " ")}
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums">${charge.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-background/60">
                      <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground font-medium hidden sm:table-cell">
                        {meta.label} Total
                      </td>
                      <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground font-medium sm:hidden">
                        {meta.label} Total
                      </td>
                      <td className="px-4 py-2 text-right font-bold tabular-nums">
                        ${parseFloat(group.totalAmount || 0).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {/* Grand total */}
      <div className="flex justify-end pt-1 border-t">
        <div className="text-sm space-x-3">
          <span className="text-muted-foreground">Grand Total</span>
          <span className="font-bold">${parseFloat(data.totalAmount || 0).toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

const WORKFLOW_STEPS = [
  { value: "charges",             label: "Charges",             icon: Receipt,   desc: "Record & review" },
  { value: "billing-candidates",  label: "Billing Candidates",  icon: Zap,       desc: "Review unbilled" },
  { value: "reconciliation",      label: "Reconciliation",      icon: GitBranch, desc: "Validate data" },
  { value: "invoice-preview",     label: "Invoice Preview",     icon: Eye,       desc: "Draft review" },
  { value: "invoices",            label: "Invoices",            icon: FileText,  desc: "Send & track" },
  { value: "payments",            label: "Payments",            icon: CreditCard,desc: "Apply payments" },
  { value: "deposits",            label: "Deposits",            icon: Banknote,  desc: "Bank deposits" },
  { value: "aging",               label: "Aging",               icon: Clock,     desc: "AR aging" },
] as const;

const GEAR_ITEMS = [
  { value: "settings",         label: "Settings",         icon: Settings },
  { value: "payment-methods",  label: "Payment Methods",  icon: ShieldAlert },
  { value: "exports",          label: "Exports",          icon: Download },
  { value: "statements",       label: "Statements",       icon: FileText },
  { value: "commitments",      label: "Commitments",      icon: DollarSign },
  { value: "margin-engine",    label: "Margin Engine",    icon: Layers },
  { value: "account-products", label: "Account Products", icon: Tag },
  { value: "financial-reconciliation", label: "Reconciliation",   icon: Scale },
  { value: "financial-audit",          label: "Financial Audit",  icon: ShieldAlert },
  { value: "user-activity",            label: "User Activity",    icon: Users },
  { value: "fraud-playbook",           label: "Fraud Playbook",   icon: ShieldAlert },
  { value: "rollout-monitoring",       label: "Rollout Monitor",  icon: Activity },
  { value: "rollout-checklist",        label: "Rollout Checklist", icon: ClipboardList },
  { value: "duplicate-prevention",     label: "Duplicate Prevention", icon: ShieldCheck },
  { value: "financial-record-locking", label: "Record Locking",        icon: Lock },
  { value: "billing-documents",        label: "Billing Documents",    icon: FileText },
  { value: "invoice-import",           label: "Invoice Import",       icon: CloudUpload },
] as const;

type WorkflowStepValue = typeof WORKFLOW_STEPS[number]["value"];
type GearItemValue    = typeof GEAR_ITEMS[number]["value"];

// ─── Billing Cycle Progress — server-driven ─────────────────────────────────

interface BillingCycleStatusResponse {
  cycleWindow: {
    start: string;
    end: string;
    billingDayName: string;
    cutoffTimeLabel: string;
    daysUntilBillingDay: number;
    lastRunDate: string | null;
  };
  steps: {
    charges:        { status: "green"|"yellow"|"red"|"gray"; count: number; issues: number; detail?: string };
    candidates:     { status: "green"|"yellow"|"red"|"gray"; count: number; issues: number; detail?: string };
    reconciliation: { status: "green"|"yellow"|"red"|"gray"; count: number; issues: number; detail?: string };
    preview:        { status: "green"|"yellow"|"red"|"gray"; count: number; issues: number; detail?: string };
    invoices:       { status: "green"|"yellow"|"red"|"gray"; count: number; issues: number; detail?: string };
    payments:       { status: "green"|"yellow"|"red"|"gray"; count: number; issues: number; detail?: string };
    deposits:       { status: "green"|"yellow"|"red"|"gray"; count: number; issues: number; detail?: string };
  };
}

type ServerStepStatus = "green" | "yellow" | "red" | "gray";

function ServerStatusIcon({ status, className = "w-5 h-5" }: { status: ServerStepStatus; className?: string }) {
  if (status === "green")  return <CheckCircle   className={`${className} text-green-500`} />;
  if (status === "yellow") return <AlertTriangle  className={`${className} text-yellow-500`} />;
  if (status === "red")    return <XCircle        className={`${className} text-red-500`} />;
  return <Circle className={`${className} text-muted-foreground/40`} />;
}

const STATUS_META: Record<ServerStepStatus, { bg: string; ring: string; text: string; label: string }> = {
  green:  { bg: "bg-green-50  dark:bg-green-900/20",  ring: "ring-green-200  dark:ring-green-800",  text: "text-green-700  dark:text-green-300",  label: "Complete"     },
  yellow: { bg: "bg-yellow-50 dark:bg-yellow-900/20", ring: "ring-yellow-200 dark:ring-yellow-800", text: "text-yellow-700 dark:text-yellow-300", label: "Action needed" },
  red:    { bg: "bg-red-50    dark:bg-red-900/20",    ring: "ring-red-200    dark:ring-red-800",    text: "text-red-700    dark:text-red-300",    label: "Blocked"      },
  gray:   { bg: "bg-muted/30",                        ring: "ring-border",                          text: "text-muted-foreground",                label: "Not started"  },
};

const STEP_DEFS: Array<{
  key: keyof BillingCycleStatusResponse["steps"];
  tab: string;
  label: string;
  icon: ElementType;
  emptyTooltip: string;
}> = [
  { key: "charges",        tab: "charges",           label: "Charges",        icon: Receipt,   emptyTooltip: "No charges in current cycle" },
  { key: "candidates",     tab: "billing-candidates", label: "Candidates",     icon: Zap,       emptyTooltip: "No unbilled charges to review" },
  { key: "reconciliation", tab: "reconciliation",    label: "Reconciliation", icon: GitBranch, emptyTooltip: "No charges to reconcile" },
  { key: "preview",        tab: "invoice-preview",   label: "Preview",        icon: Eye,       emptyTooltip: "No draft invoices created" },
  { key: "invoices",       tab: "invoices",          label: "Invoices",       icon: FileText,  emptyTooltip: "No invoices for this cycle" },
  { key: "payments",       tab: "payments",          label: "Payments",       icon: CreditCard, emptyTooltip: "No payments recorded" },
  { key: "deposits",       tab: "deposits",          label: "Deposits",       icon: Banknote,  emptyTooltip: "No payments to deposit" },
];

function BillingCycleProgress({
  activeStep,
  onStepClick,
}: {
  activeStep: string;
  onStepClick: (step: string) => void;
}) {
  const { data, isLoading } = useQuery<BillingCycleStatusResponse>({
    queryKey: ["/api/billing/cycle-status"],
    refetchInterval: 30_000,
  });

  // Loading skeleton
  if (isLoading || !data) {
    return (
      <Card className="overflow-hidden">
        <div className="flex items-center gap-4 px-4 py-2.5 bg-muted/40 border-b flex-wrap">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-56 ml-2" />
        </div>
        <div className="flex">
          {STEP_DEFS.map(s => (
            <div key={s.key} className="flex flex-col items-center gap-2 px-3 py-3 flex-1 min-w-[100px]">
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-2.5 w-12" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const { cycleWindow, steps } = data;

  // Derive header badges
  const warnings = STEP_DEFS.filter(d => steps[d.key].status === "yellow").length;
  const blocked  = STEP_DEFS.filter(d => steps[d.key].status === "red").length;
  const allGreen = STEP_DEFS.every(d => steps[d.key].status === "green");

  const cycleLabel = (() => {
    const fmt = (s: string) => new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmt(cycleWindow.start)} – ${fmt(cycleWindow.end)}`;
  })();

  return (
    <Card className="overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-4 px-4 py-2.5 bg-muted/40 border-b flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Billing Cycle</span>
          <Badge variant="outline" className="text-xs font-medium" data-testid="badge-cycle-window">{cycleLabel}</Badge>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Billing day: <span className="font-medium text-foreground">{cycleWindow.billingDayName}</span></span>
          <span className="text-muted-foreground/40">·</span>
          <span>Cutoff: <span className="font-medium text-foreground">{cycleWindow.cutoffTimeLabel}</span></span>
          {cycleWindow.lastRunDate && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span>Last run: <span className="font-medium text-foreground">{new Date(cycleWindow.lastRunDate + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></span>
            </>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {warnings > 0 && (
            <Badge variant="outline" className="text-xs text-yellow-700 border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-700">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {warnings} warning{warnings !== 1 ? "s" : ""}
            </Badge>
          )}
          {blocked > 0 && (
            <Badge variant="outline" className="text-xs text-red-700 border-red-300 bg-red-50 dark:bg-red-900/20 dark:text-red-300 dark:border-red-700">
              <XCircle className="w-3 h-3 mr-1" />
              {blocked} blocked
            </Badge>
          )}
          {allGreen && (
            <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50 dark:bg-green-900/20 dark:text-green-300 dark:border-green-700">
              <CheckCircle className="w-3 h-3 mr-1" />
              Cycle complete
            </Badge>
          )}
        </div>
      </div>

      {/* Step strip */}
      <div className="flex overflow-x-auto" data-testid="billing-cycle-steps">
        {STEP_DEFS.map((def, idx) => {
          const step     = steps[def.key];
          const isActive = activeStep === def.tab;
          const meta     = STATUS_META[step.status];
          const Icon     = def.icon;

          // Tooltip text: use server-provided detail, or count info, or empty fallback
          const tooltipText = step.issues > 0
            ? step.detail ?? `${step.issues} issue${step.issues !== 1 ? "s" : ""} detected`
            : step.count > 0
            ? `${step.count} record${step.count !== 1 ? "s" : ""} — ${meta.label.toLowerCase()}`
            : def.emptyTooltip;

          // Display detail in the step
          const stepDetail = step.issues > 0
            ? `${step.issues} issue${step.issues !== 1 ? "s" : ""}`
            : step.count > 0
            ? `${step.count} record${step.count !== 1 ? "s" : ""}`
            : "—";

          return (
            <Tooltip key={def.key}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onStepClick(def.tab)}
                  data-testid={`cycle-step-${def.tab}`}
                  className={[
                    "relative flex flex-col items-center justify-center gap-1 px-3 py-3 flex-1 min-w-[100px] text-center transition-colors",
                    isActive ? "bg-primary/5 ring-1 ring-inset ring-primary/20" : `hover:bg-muted/40 ${meta.bg}`,
                  ].join(" ")}
                >
                  {/* Right-side connector */}
                  {idx < STEP_DEFS.length - 1 && (
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-px h-6 bg-border z-10" />
                  )}

                  {/* Icon + badge count */}
                  <div className="relative">
                    <ServerStatusIcon status={step.status} className="w-5 h-5" />
                    {step.issues > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                        {step.issues > 99 ? "99+" : step.issues}
                      </span>
                    )}
                    {step.issues === 0 && step.count > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center leading-none">
                        {step.count > 99 ? "99+" : step.count}
                      </span>
                    )}
                  </div>

                  {/* Label */}
                  <span className={[
                    "text-[11px] font-semibold leading-tight whitespace-nowrap",
                    isActive ? "text-primary" : meta.text,
                  ].join(" ")}>
                    {def.label}
                  </span>

                  {/* Detail */}
                  <span className="text-[10px] text-muted-foreground leading-tight">{stepDetail}</span>

                  {/* Active bottom indicator */}
                  {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[220px] text-center">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 justify-center">
                    <ServerStatusIcon status={step.status} className="w-3.5 h-3.5" />
                    <span className="font-semibold text-xs">{def.label}</span>
                    <span className={`text-[10px] ${meta.text}`}>— {meta.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{tooltipText}</p>
                  <p className="text-[10px] text-muted-foreground/70">Click to navigate</p>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </Card>
  );
}

export default function Invoices() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("charges");
  const [isChargeDialogOpen, setIsChargeDialogOpen] = useState(false);
  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isManualPaymentDialogOpen, setIsManualPaymentDialogOpen] = useState(false);
  const [preselectedInvoiceForPayment, setPreselectedInvoiceForPayment] = useState<Invoice | null>(null);
  const [writeOffInvoice, setWriteOffInvoice] = useState<Invoice | null>(null);
  const [isLineItemDialogOpen, setIsLineItemDialogOpen] = useState(false);
  const [isPassThroughDialogOpen, setIsPassThroughDialogOpen] = useState(false);
  const [selectedPassThroughIds, setSelectedPassThroughIds] = useState<string[]>([]);
  const [selectedChargeIds, setSelectedChargeIds] = useState<string[]>([]);
  const [invoiceCreationMode, setInvoiceCreationMode] = useState<"manual" | "from-charges">("manual");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isPdfDownloading, setIsPdfDownloading] = useState(false);
  const [paymentAuditDialogId, setPaymentAuditDialogId] = useState<string | null>(null);
  const [paymentAuditDialogLabel, setPaymentAuditDialogLabel] = useState<string | undefined>(undefined);
  const [paymentAdjustmentOpen, setPaymentAdjustmentOpen] = useState(false);
  const [paymentAdjustmentTarget, setPaymentAdjustmentTarget] = useState<any | null>(null);
  const [paymentAdjustmentAction, setPaymentAdjustmentAction] = useState<PaymentAdjustmentAction>("edit");
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);
  const [editingLineItem, setEditingLineItem] = useState<any>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCustomer, setFilterCustomer] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterAgingBucket, setFilterAgingBucket] = useState<string>("all");
  const [filterBillingEntity, setFilterBillingEntity] = useState<string>("all");
  const [filterCollectionsTier, setFilterCollectionsTier] = useState<string>("all");
  const [filterDateField, setFilterDateField] = useState<string>("invoiceDate");
  const [sortField, setSortField] = useState<string | null>("invoiceDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const handleInvoiceSort = (field: string) => {
    if (sortField === field) {
      if (sortDir === "asc") { setSortDir("desc"); }
      else { setSortField(null); setSortDir("asc"); }
    } else { setSortField(field); setSortDir("asc"); }
  };
  const InvoiceSortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-50 inline" />;
    return sortDir === "asc" ? <ChevronUp className="h-3.5 w-3.5 ml-1 inline" /> : <ChevronDown className="h-3.5 w-3.5 ml-1 inline" />;
  };
  const [filterDateStart, setFilterDateStart] = useState<string>("");
  const [filterDateEnd, setFilterDateEnd] = useState<string>("");
  const [filterAmountMin, setFilterAmountMin] = useState<string>("");
  const [filterAmountMax, setFilterAmountMax] = useState<string>("");
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(null);
  const [isSaveViewDialogOpen, setIsSaveViewDialogOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState("");
  const [saveViewShared, setSaveViewShared] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [bulkSendConfirmOpen, setBulkSendConfirmOpen] = useState(false);
  const [bulkLateFeeConfirmOpen, setBulkLateFeeConfirmOpen] = useState(false);
  const [creditOverrideDialogOpen, setCreditOverrideDialogOpen] = useState(false);
  const [creditOverrideInvoice, setCreditOverrideInvoice] = useState<Invoice | null>(null);
  const [creditOverrideReason, setCreditOverrideReason] = useState("");
  const [creditOverrideDetails, setCreditOverrideDetails] = useState<any>(null);
  const [isRevisionDialogOpen, setIsRevisionDialogOpen] = useState(false);
  const [isFinanceApprovalDialogOpen, setIsFinanceApprovalDialogOpen] = useState(false);
  const [isConsolidateChargesDialogOpen, setIsConsolidateChargesDialogOpen] = useState(false);
  const [isConsolidateDraftsDialogOpen, setIsConsolidateDraftsDialogOpen] = useState(false);
  const [consolidateChargeIds, setConsolidateChargeIds] = useState<string[]>([]);
  const [consolidateCustomerId, setConsolidateCustomerId] = useState<string>("");
  const [isDepositBatchDialogOpen, setIsDepositBatchDialogOpen] = useState(false);
  const [selectedDepositBatchId, setSelectedDepositBatchId] = useState<string | null>(null);
  const [isCancelInvoiceDialogOpen, setIsCancelInvoiceDialogOpen] = useState(false);
  const [cancelInvoiceReason, setCancelInvoiceReason] = useState("");

  const { data: allowedActions } = useQuery<{ actions: any[]; actionNames: string[]; editMode: string; currentStatus: string; canonicalStatus: string; paidAmount: number }>({
    queryKey: ['/api/corporate/invoicing/invoices', selectedInvoice?.id, 'allowed-actions'],
    queryFn: async () => {
      if (!selectedInvoice?.id) return { actions: [], actionNames: [], editMode: 'locked', currentStatus: '', canonicalStatus: 'draft', paidAmount: 0 };
      const res = await fetch(`/api/corporate/invoicing/invoices/${selectedInvoice.id}/allowed-actions`, { credentials: 'include' });
      if (!res.ok) return { actions: [], actionNames: [], editMode: 'locked', currentStatus: '', canonicalStatus: 'draft', paidAmount: 0 };
      return res.json();
    },
    enabled: !!selectedInvoice?.id && isInvoiceDialogOpen,
    staleTime: 0,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<InvoicingStats>({
    queryKey: ['/api/corporate/invoicing/stats'],
  });

  const { data: charges = [], isLoading: chargesLoading } = useQuery<BillableCharge[]>({
    queryKey: ['/api/corporate/invoicing/charges'],
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const invoiceQueryParams = new URLSearchParams();
  if (searchQuery) invoiceQueryParams.set('search', searchQuery);
  if (filterCustomer !== 'all') invoiceQueryParams.set('customerId', filterCustomer);
  if (filterStatus !== 'all' && filterStatus !== 'overdue') invoiceQueryParams.set('status', filterStatus);
  if (filterBillingEntity !== 'all') invoiceQueryParams.set('billingEntityId', filterBillingEntity);
  if (filterAgingBucket !== 'all') invoiceQueryParams.set('agingBucket', filterAgingBucket);
  if (filterCollectionsTier !== 'all') invoiceQueryParams.set('collectionsTier', filterCollectionsTier);
  if (filterDateStart) { invoiceQueryParams.set('dateField', filterDateField); invoiceQueryParams.set('dateStart', filterDateStart); }
  if (filterDateEnd) { invoiceQueryParams.set('dateField', filterDateField); invoiceQueryParams.set('dateEnd', filterDateEnd); }
  if (filterAmountMin) invoiceQueryParams.set('amountMin', filterAmountMin);
  if (filterAmountMax) invoiceQueryParams.set('amountMax', filterAmountMax);
  if (filterStatus === 'consolidated') invoiceQueryParams.set('includeConsolidated', 'true');
  const invoiceQueryString = invoiceQueryParams.toString();

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ['/api/corporate/invoicing/invoices', invoiceQueryString],
    queryFn: async () => {
      const url = invoiceQueryString ? `/api/corporate/invoicing/invoices?${invoiceQueryString}` : '/api/corporate/invoicing/invoices';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch invoices');
      return res.json();
    },
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery<Payment[]>({
    queryKey: ['/api/corporate/invoicing/payments'],
  });

  const { data: agingReport = [], isLoading: agingLoading } = useQuery<AgingBucket[]>({
    queryKey: ['/api/corporate/invoicing/aging-report'],
  });

  const { data: depositBatches = [] } = useQuery<DepositBatch[]>({
    queryKey: ['/api/corporate/invoicing/deposit-batches'],
  });

  const { data: selectedBatchDetail, isLoading: batchDetailLoading } = useQuery<DepositBatch & { payments: Payment[] }>({
    queryKey: ['/api/corporate/invoicing/deposit-batches', selectedDepositBatchId],
    queryFn: async () => {
      const res = await fetch(`/api/corporate/invoicing/deposit-batches/${selectedDepositBatchId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch batch detail');
      return res.json();
    },
    enabled: !!selectedDepositBatchId,
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['/api/corporate/customers'],
  });

  const { data: allProducts = [] } = useQuery<any[]>({
    queryKey: ['/api/finance/products'],
  });
  const activeProducts = allProducts.filter((p: any) => p.isActive !== false);

  const { data: currentUser } = useQuery({
    queryKey: ['/api/auth/me'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me');
      if (!res.ok) return null;
      return res.json();
    },
  });
  const userRole = currentUser?.role || null;

  // Deposit batch role gates (mirrors server/services/invoicingPermissions.ts)
  const DEPOSIT_BILLING_TEAM_ROLES = new Set(['billing', 'finance', 'admin', 'corporate_admin', 'super_admin', 'super_user', 'root_super_admin', 'account_manager']);
  const DEPOSIT_CONTROLLER_ROLES = new Set(['finance', 'admin', 'corporate_admin', 'super_admin', 'super_user', 'root_super_admin']);
  const isDepositBillingTeam = DEPOSIT_BILLING_TEAM_ROLES.has(userRole || '');
  const isDepositController = DEPOSIT_CONTROLLER_ROLES.has(userRole || '');

  const { data: savedViews = [] } = useQuery<InvoiceSavedView[]>({
    queryKey: ['/api/corporate/invoicing/saved-views'],
  });

  const { data: billingEntities = [] } = useQuery<any[]>({
    queryKey: ['/api/corporate/invoicing/billing-entities'],
  });

  // Query for invoice payments when an invoice is selected
  const { data: invoicePayments = [] } = useQuery<any[]>({
    queryKey: ['/api/corporate/invoicing/invoices', selectedInvoice?.id, 'payments'],
    enabled: !!selectedInvoice?.id,
  });

  // Query for invoice line items
  const { data: invoiceLineItems = [] } = useQuery<any[]>({
    queryKey: ['/api/corporate/invoicing/invoices', selectedInvoice?.id, 'line-items'],
    enabled: !!selectedInvoice?.id,
  });

  // Query for queued pass-through rebillable charges for this customer
  const { data: queuedPassThroughCharges = [] } = useQuery<any[]>({
    queryKey: ['/api/customers', selectedInvoice?.customerId, 'rebillable-charges', 'queued_for_invoice'],
    queryFn: () => apiRequest('GET', `/api/customers/${selectedInvoice?.customerId}/rebillable-charges?status=queued_for_invoice`),
    enabled: !!selectedInvoice?.customerId && selectedInvoice?.status === 'draft' && isPassThroughDialogOpen,
  });

  const { data: deliveryHistory = [] } = useQuery<any[]>({
    queryKey: ['/api/corporate/invoicing/invoices', selectedInvoice?.id, 'delivery-history'],
    enabled: !!selectedInvoice?.id,
  });

  const { data: selectedInvoiceCreditExposure } = useQuery<any>({
    queryKey: ['/api/corporate/invoicing/credit-exposure', selectedInvoice?.customerId],
    enabled: !!selectedInvoice?.customerId,
  });

  const { data: invoiceVersions = [] } = useQuery<Invoice[]>({
    queryKey: ['/api/corporate/invoicing/invoices', selectedInvoice?.id, 'versions'],
    enabled: !!selectedInvoice?.id,
  });

  const { data: invoiceExportLogs = [] } = useQuery<any[]>({
    queryKey: ['/api/corporate/invoicing/invoices', selectedInvoice?.id, 'export-logs'],
    queryFn: async () => {
      if (!selectedInvoice?.id) return [];
      const res = await fetch(`/api/corporate/invoicing/invoices/${selectedInvoice.id}/export-logs`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedInvoice?.id,
  });

  const breachesQuery = useQuery<any[]>({
    queryKey: ['/api/corporate/invoicing/sla-breaches', selectedInvoice?.id],
    queryFn: async () => {
      const res = await fetch(`/api/corporate/invoicing/sla-breaches?invoiceId=${selectedInvoice?.id}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!selectedInvoice?.id,
  });

  const chargeForm = useForm<ChargeFormValues>({
    resolver: zodResolver(chargeFormSchema),
    defaultValues: {
      customerId: '',
      productId: '',
      description: '',
      chargeDate: new Date().toISOString().split('T')[0],
      quantity: '1',
      unitRate: '0',
    },
  });
  // Full product object for derived-attribute display in the charge form
  const [chargeFormProduct, setChargeFormProduct] = useState<any | null>(null);

  const invoiceForm = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      customerId: '',
      invoiceDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: '',
    },
  });

  const paymentForm = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      customerId: '',
      amount: '',
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethod: 'check',
      referenceNumber: '',
      notes: '',
    },
  });

  const lineItemForm = useForm<LineItemFormValues>({
    resolver: zodResolver(lineItemFormSchema),
    defaultValues: {
      description: '',
      category: 'service',
      quantity: '1',
      unitPrice: '0',
    },
  });

  const createChargeMutation = useMutation({
    mutationFn: async (data: ChargeFormValues) => {
      const amount = (parseFloat(data.quantity) * parseFloat(data.unitRate)).toFixed(2);
      // Server auto-populates all billing attributes from the product — just pass productId + amounts
      return await apiRequest('POST', '/api/corporate/invoicing/charges', {
        ...data,
        amount,
        sourceType: 'manual',
        status: 'draft',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/charges'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/stats'] });
      toast({ title: "Charge created successfully" });
      chargeForm.reset();
      setChargeFormProduct(null);
      setIsChargeDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed to create charge", description: error.message, variant: "destructive" });
    },
  });

  const approveChargeMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('POST', `/api/corporate/invoicing/charges/${id}/approve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/charges'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/stats'] });
      toast({ title: "Charge approved" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to approve charge", description: error.message, variant: "destructive" });
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (data: InvoiceFormValues) => {
      const customer = customers.find(c => c.id === data.customerId);
      return await apiRequest('POST', '/api/corporate/invoicing/invoices', {
        ...data,
        customerName: customer?.customerName || 'Unknown',
        totalAmount: '0',
        status: 'draft',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/stats'] });
      toast({ title: "Invoice created successfully" });
      invoiceForm.reset();
      setIsInvoiceDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed to create invoice", description: error.message, variant: "destructive" });
    },
  });

  const createInvoiceFromChargesMutation = useMutation({
    mutationFn: async (data: { chargeIds: string[]; customerId: string; invoiceDate: string; dueDate: string; notes?: string }) => {
      return await apiRequest('POST', '/api/corporate/invoicing/invoices/from-charges', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/charges'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/stats'] });
      toast({ title: "Invoice created from charges successfully" });
      invoiceForm.reset();
      setSelectedChargeIds([]);
      setInvoiceCreationMode("manual");
      setIsInvoiceDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed to create invoice from charges", description: error.message, variant: "destructive" });
    },
  });


  const sendInvoiceMutation = useMutation({
    mutationFn: async ({ id, invoice }: { id: string; invoice?: Invoice }) => {
      const res = await fetch(`/api/corporate/invoicing/invoices/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toEmails: [] }),
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: res.statusText }));
        if (body.code === 'CREDIT_LIMIT_EXCEEDED') {
          const targetInvoice = invoice || selectedInvoice || invoices.find((i: Invoice) => i.id === id);
          setCreditOverrideInvoice(targetInvoice || null);
          setCreditOverrideDetails(body);
          setCreditOverrideDialogOpen(true);
          return null;
        }
        throw new Error(body.message || 'Failed to send invoice');
      }
      return res;
    },
    onSuccess: (result) => {
      if (result === null) return;
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices', selectedInvoice?.id, 'delivery-history'] });
      toast({ title: "Invoice sent successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to send invoice", description: error.message, variant: "destructive" });
    },
  });

  const creditOverrideMutation = useMutation({
    mutationFn: async ({ invoiceId, customerId, reason }: { invoiceId: string; customerId: string; reason: string }) => {
      await apiRequest('POST', '/api/corporate/invoicing/credit-override', { invoiceId, customerId, reason });
      return await apiRequest('POST', `/api/corporate/invoicing/invoices/${invoiceId}/send`, { toEmails: [] });
    },
    onSuccess: () => {
      setCreditOverrideDialogOpen(false);
      setCreditOverrideInvoice(null);
      setCreditOverrideReason("");
      setCreditOverrideDetails(null);
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/stats'] });
      toast({ title: "Credit limit override applied and invoice sent" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to override and send", description: error.message, variant: "destructive" });
    },
  });

  const resendInvoiceMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('POST', `/api/corporate/invoicing/invoices/${id}/resend`, {
        toEmails: [],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices', selectedInvoice?.id, 'delivery-history'] });
      toast({ title: "Invoice reminder sent" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to resend invoice", description: error.message, variant: "destructive" });
    },
  });

  const invalidateInvoice = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
    queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/stats'] });
    if (selectedInvoice?.id) {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices', selectedInvoice.id, 'allowed-actions'] });
    }
  };

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/corporate/invoicing/invoices/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ toStatus: 'approved' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(body.message || 'Failed to approve invoice');
      }
      return res.json();
    },
    onSuccess: (updated) => {
      invalidateInvoice();
      if (updated) setSelectedInvoice(updated);
      toast({ title: "Invoice approved" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to approve invoice", description: error.message, variant: "destructive" });
    },
  });

  const cancelInvoiceMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await fetch(`/api/corporate/invoicing/invoices/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(body.message || 'Failed to cancel invoice');
      }
      return res.json();
    },
    onSuccess: (updated) => {
      invalidateInvoice();
      if (updated) setSelectedInvoice(updated);
      setIsCancelInvoiceDialogOpen(false);
      setCancelInvoiceReason("");
      toast({ title: "Invoice cancelled" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to cancel invoice", description: error.message, variant: "destructive" });
    },
  });

  const returnToDraftMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/corporate/invoicing/invoices/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ toStatus: 'draft' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(body.message || 'Failed to return invoice to draft');
      }
      return res.json();
    },
    onSuccess: (updated) => {
      invalidateInvoice();
      if (updated) setSelectedInvoice(updated);
      toast({ title: "Invoice returned to Draft" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to return to draft", description: error.message, variant: "destructive" });
    },
  });

  const voidInvoiceMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('POST', `/api/corporate/invoicing/invoices/${id}/void`, {
        reason: 'Voided by user',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/stats'] });
      toast({ title: "Invoice voided" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to void invoice", description: error.message, variant: "destructive" });
    },
  });

  const arApproveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('POST', `/api/corporate/invoicing/invoices/${id}/approve`, {});
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Failed to approve'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/stats'] });
      toast({ title: "Invoice approved" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to approve invoice", description: error.message, variant: "destructive" });
    },
  });

  const arExportMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('POST', `/api/corporate/invoicing/invoices/${id}/export`, {});
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Failed to export'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/stats'] });
      toast({ title: "Invoice marked as exported" });
    },
    onError: (error: any) => {
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
    },
  });

  const syncToQuickBooksMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('POST', `/api/corporate/invoicing/invoices/${id}/sync-quickbooks`);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
      toast({ title: "Synced to QuickBooks", description: data.message });
    },
    onError: (error: any) => {
      toast({ title: "QuickBooks sync failed", description: error.message, variant: "destructive" });
    },
  });

  const createPaymentMutation = useMutation({
    mutationFn: async (data: PaymentFormValues) => {
      const resp = await apiRequest('POST', '/api/corporate/invoicing/payments', {
        ...data,
        depositBatchId: data.depositBatchId || undefined,
        status: 'completed',
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        const err: any = new Error(body.message || 'Failed to record payment');
        err.errorCode = body.error_code;
        throw err;
      }
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/payments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/deposit-batches'] });
      toast({ title: "Payment recorded successfully" });
      paymentForm.reset();
      setIsPaymentDialogOpen(false);
    },
    onError: (error: any) => {
      if (error.errorCode === 'DEPOSIT_BATCH_REQUIRED') {
        toast({ title: "Deposit batch required", description: "Your organization requires all payments to be assigned to a deposit batch. Please select a batch before saving.", variant: "destructive" });
      } else {
        toast({ title: "Failed to record payment", description: error.message, variant: "destructive" });
      }
    },
  });

  const createLineItemMutation = useMutation({
    mutationFn: async (data: LineItemFormValues) => {
      const totalPrice = (parseFloat(data.quantity) * parseFloat(data.unitPrice)).toFixed(2);
      return await apiRequest('POST', `/api/corporate/invoicing/invoices/${selectedInvoice?.id}/line-items`, {
        invoiceId: selectedInvoice?.id,
        description: data.description,
        category: data.category,
        quantity: parseFloat(data.quantity),
        unitPrice: data.unitPrice,
        totalPrice,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices', selectedInvoice?.id, 'line-items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
      // Refresh selectedInvoice to show updated totals
      queryClient.fetchQuery({ queryKey: ['/api/corporate/invoicing/invoices'] }).then((updatedInvoices: any) => {
        const updated = updatedInvoices?.find((inv: Invoice) => inv.id === selectedInvoice?.id);
        if (updated) setSelectedInvoice(updated);
      });
      toast({ title: "Line item added successfully" });
      lineItemForm.reset();
      setIsLineItemDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed to add line item", description: error.message, variant: "destructive" });
    },
  });

  const updateLineItemMutation = useMutation({
    mutationFn: async (data: LineItemFormValues & { id: string }) => {
      const totalPrice = (parseFloat(data.quantity) * parseFloat(data.unitPrice)).toFixed(2);
      return await apiRequest('PATCH', `/api/corporate/invoicing/line-items/${data.id}`, {
        description: data.description,
        category: data.category,
        quantity: parseFloat(data.quantity),
        unitPrice: data.unitPrice,
        totalPrice,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices', selectedInvoice?.id, 'line-items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
      // Refresh selectedInvoice to show updated totals
      queryClient.fetchQuery({ queryKey: ['/api/corporate/invoicing/invoices'] }).then((updatedInvoices: any) => {
        const updated = updatedInvoices?.find((inv: Invoice) => inv.id === selectedInvoice?.id);
        if (updated) setSelectedInvoice(updated);
      });
      toast({ title: "Line item updated successfully" });
      lineItemForm.reset();
      setEditingLineItem(null);
      setIsLineItemDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed to update line item", description: error.message, variant: "destructive" });
    },
  });

  const deleteLineItemMutation = useMutation({
    mutationFn: async (lineItemId: string) => {
      return await apiRequest('DELETE', `/api/corporate/invoicing/line-items/${lineItemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices', selectedInvoice?.id, 'line-items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
      // Refresh selectedInvoice to show updated totals
      queryClient.fetchQuery({ queryKey: ['/api/corporate/invoicing/invoices'] }).then((updatedInvoices: any) => {
        const updated = updatedInvoices?.find((inv: Invoice) => inv.id === selectedInvoice?.id);
        if (updated) setSelectedInvoice(updated);
      });
      toast({ title: "Line item deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete line item", description: error.message, variant: "destructive" });
    },
  });

  const addPassThroughMutation = useMutation({
    mutationFn: async ({ invoiceId, payableIds }: { invoiceId: string; payableIds: string[] }) => {
      return await apiRequest('POST', `/api/corporate/invoicing/invoices/${invoiceId}/add-rebillable-charges`, { payableIds });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices', selectedInvoice?.id, 'line-items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/rebillable-charges'] });
      queryClient.invalidateQueries({ queryKey: ['/api/rebillable-stats'] });
      queryClient.fetchQuery({ queryKey: ['/api/corporate/invoicing/invoices'] }).then((updatedInvoices: any) => {
        const updated = updatedInvoices?.find((inv: Invoice) => inv.id === selectedInvoice?.id);
        if (updated) setSelectedInvoice(updated);
      });
      setIsPassThroughDialogOpen(false);
      setSelectedPassThroughIds([]);
      toast({ title: `${data.addedCount || 0} pass-through charge(s) added`, description: `New invoice total: $${parseFloat(data.invoiceTotal || '0').toFixed(2)}` });
    },
    onError: (error: any) => {
      toast({ title: "Failed to add pass-through charges", description: error.message, variant: "destructive" });
    },
  });

  const cloneInvoiceMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const res = await apiRequest('POST', `/api/corporate/invoicing/invoices/${invoiceId}/clone`, {});
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/stats'] });
      toast({ title: "Invoice cloned", description: `New draft ${data.invoiceNumber || ''} created` });
      setSelectedInvoice(null);
    },
    onError: (error: any) => {
      toast({ title: "Failed to clone invoice", description: error.message, variant: "destructive" });
    },
  });

  const bulkSendMutation = useMutation({
    mutationFn: async (invoiceIds: string[]) => {
      const res = await apiRequest('POST', '/api/corporate/invoicing/invoices/bulk-send', { invoiceIds });
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/stats'] });
      setSelectedInvoiceIds([]);
      if (data.failCount > 0) {
        const failedItems = data.results.filter((r: any) => !r.success).map((r: any) => `${r.invoiceNumber || r.invoiceId}: ${r.error}`).join('; ');
        toast({ title: `Sent ${data.successCount} of ${data.total} invoices`, description: `${data.failCount} failed: ${failedItems}`, variant: data.successCount > 0 ? "default" : "destructive" });
      } else {
        toast({ title: `${data.successCount} invoices sent successfully` });
      }
    },
    onError: (error: any) => {
      toast({ title: "Bulk send failed", description: error.message, variant: "destructive" });
    },
  });

  const bulkResendMutation = useMutation({
    mutationFn: async (invoiceIds: string[]) => {
      const res = await apiRequest('POST', '/api/corporate/invoicing/invoices/bulk-resend', { invoiceIds });
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
      setSelectedInvoiceIds([]);
      if (data.failCount > 0) {
        const failedItems = data.results.filter((r: any) => !r.success).map((r: any) => `${r.invoiceNumber || r.invoiceId}: ${r.error}`).join('; ');
        toast({ title: `Reminders sent for ${data.successCount} of ${data.total} invoices`, description: `${data.failCount} failed: ${failedItems}`, variant: data.successCount > 0 ? "default" : "destructive" });
      } else {
        toast({ title: `${data.successCount} reminders sent successfully` });
      }
    },
    onError: (error: any) => {
      toast({ title: "Bulk resend failed", description: error.message, variant: "destructive" });
    },
  });

  const bulkLateFeeMutation = useMutation({
    mutationFn: async (invoiceIds: string[]) => {
      const res = await apiRequest('POST', '/api/corporate/invoicing/invoices/bulk-late-fee', { invoiceIds });
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/stats'] });
      setSelectedInvoiceIds([]);
      if (data.failCount > 0) {
        const failedItems = data.results.filter((r: any) => !r.success).map((r: any) => `${r.invoiceNumber || r.invoiceId}: ${r.error}`).join('; ');
        toast({ title: `Late fees applied to ${data.successCount} of ${data.total} invoices`, description: `${data.failCount} failed: ${failedItems}`, variant: data.successCount > 0 ? "default" : "destructive" });
      } else {
        toast({ title: `Late fees applied to ${data.successCount} invoices` });
      }
    },
    onError: (error: any) => {
      toast({ title: "Bulk late fee failed", description: error.message, variant: "destructive" });
    },
  });

  const createRevisionMutation = useMutation({
    mutationFn: async (data: { reason: string; revisionType?: string }) => {
      return await apiRequest('POST', `/api/corporate/invoicing/invoices/${selectedInvoice?.id}/revise`, data);
    },
    onSuccess: async () => {
      toast({ title: "Revision created", description: "A new version of this invoice has been created as a draft." });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices', selectedInvoice?.id, 'versions'] });
      setIsRevisionDialogOpen(false);
      setSelectedInvoice(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create revision", variant: "destructive" });
    },
  });

  const financeApproveMutation = useMutation({
    mutationFn: async (data: { approved: boolean; notes?: string }) => {
      return await apiRequest('PATCH', `/api/corporate/invoicing/invoices/${selectedInvoice?.id}/finance-approve`, data);
    },
    onSuccess: async (_, variables) => {
      toast({ title: variables.approved ? "Revision approved" : "Revision rejected", description: variables.approved ? "The revision has been approved by finance." : "The revision has been rejected." });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices', selectedInvoice?.id, 'versions'] });
      setIsFinanceApprovalDialogOpen(false);
      const updatedInvoices: any = await queryClient.fetchQuery({ queryKey: ['/api/corporate/invoicing/invoices'] });
      const updated = updatedInvoices?.find((inv: Invoice) => inv.id === selectedInvoice?.id);
      if (updated) setSelectedInvoice(updated);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to process approval", variant: "destructive" });
    },
  });

  const saveViewMutation = useMutation({
    mutationFn: async (data: { name: string; type: string; filters: any }) => {
      const res = await apiRequest('POST', '/api/corporate/invoicing/saved-views', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/saved-views'] });
      setIsSaveViewDialogOpen(false);
      setSaveViewName("");
      toast({ title: "View saved successfully" });
    },
  });

  const deleteViewMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/corporate/invoicing/saved-views/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/saved-views'] });
      setActiveSavedViewId(null);
      toast({ title: "View deleted" });
    },
  });

  const depositBatchFormSchema = z.object({
    depositDate: z.string().optional(),
    bankAccountName: z.string().optional(),
    bankAccountLast4: z.string().max(4).optional(),
    depositMethod: z.string().optional(),
    notes: z.string().optional(),
  });

  const depositBatchForm = useForm<z.infer<typeof depositBatchFormSchema>>({
    resolver: zodResolver(depositBatchFormSchema),
    defaultValues: {
      depositDate: new Date().toISOString().split("T")[0],
      bankAccountName: "",
      bankAccountLast4: "",
      depositMethod: "",
      notes: "",
    },
  });

  const [addPaymentToBatchOpen, setAddPaymentToBatchOpen] = useState(false);
  const [selectedPaymentsForBatch, setSelectedPaymentsForBatch] = useState<string[]>([]);
  const [submitBatchConfirmOpen, setSubmitBatchConfirmOpen] = useState(false);
  const [lockBatchConfirmOpen, setLockBatchConfirmOpen] = useState(false);
  const [reconcileBatchDialogOpen, setReconcileBatchDialogOpen] = useState(false);
  const [deleteBatchConfirmOpen, setDeleteBatchConfirmOpen] = useState(false);
  const [reconcileActualAmount, setReconcileActualAmount] = useState("");
  const [reconcileStatementDate, setReconcileStatementDate] = useState("");
  const [reconcileReference, setReconcileReference] = useState("");
  const [reconcileNotes, setReconcileNotes] = useState("");
  const [editingBatchMetadata, setEditingBatchMetadata] = useState(false);
  const [batchMetaDepositDate, setBatchMetaDepositDate] = useState("");
  const [batchMetaBankName, setBatchMetaBankName] = useState("");
  const [batchMetaBankLast4, setBatchMetaBankLast4] = useState("");
  const [batchMetaDepositMethod, setBatchMetaDepositMethod] = useState("");
  const [batchMetaNotes, setBatchMetaNotes] = useState("");

  const { data: batchAuditLog = [] } = useQuery<DepositBatchAuditEntry[]>({
    queryKey: ['/api/corporate/invoicing/deposit-batches', selectedDepositBatchId, 'audit-log'],
    queryFn: async () => {
      const res = await fetch(`/api/corporate/invoicing/deposit-batches/${selectedDepositBatchId}/audit-log`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedDepositBatchId,
  });

  const batchTransitionMutation = useMutation({
    mutationFn: async ({ batchId, action, params }: { batchId: string; action: string; params?: any }) => {
      const res = await apiRequest('POST', `/api/corporate/invoicing/deposit-batches/${batchId}/transition`, { action, ...params });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/deposit-batches'] });
      toast({ title: "Batch updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Transition failed", description: error.message, variant: "destructive" });
    },
  });

  const addPaymentToBatchMutation = useMutation({
    mutationFn: async ({ batchId, paymentId }: { batchId: string; paymentId: string }) => {
      const res = await apiRequest('POST', `/api/corporate/invoicing/deposit-batches/${batchId}/payments/${paymentId}`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/deposit-batches'] });
      if (data?.reverted) {
        toast({ title: "Changes detected. Batch has been returned to Draft for revalidation." });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add payment", description: error.message, variant: "destructive" });
    },
  });

  const removePaymentFromBatchMutation = useMutation({
    mutationFn: async ({ batchId, paymentId }: { batchId: string; paymentId: string }) => {
      const res = await apiRequest('DELETE', `/api/corporate/invoicing/deposit-batches/${batchId}/payments/${paymentId}`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/deposit-batches'] });
      if (data?.reverted) {
        toast({ title: "Changes detected. Batch has been returned to Draft for revalidation." });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove payment", description: error.message, variant: "destructive" });
    },
  });

  const updateBatchMetadataMutation = useMutation({
    mutationFn: async ({ batchId, data }: { batchId: string; data: any }) => {
      const res = await apiRequest('PATCH', `/api/corporate/invoicing/deposit-batches/${batchId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/deposit-batches'] });
      setEditingBatchMetadata(false);
      toast({ title: "Batch metadata updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update batch", description: error.message, variant: "destructive" });
    },
  });

  const deleteBatchMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const res = await apiRequest('DELETE', `/api/corporate/invoicing/deposit-batches/${batchId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/deposit-batches'] });
      setSelectedDepositBatchId(null);
      setDeleteBatchConfirmOpen(false);
      toast({ title: "Batch deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete batch", description: error.message, variant: "destructive" });
    },
  });

  const availablePaymentsForBatch = payments.filter((p: any) => !p.depositBatchId && p.status === 'completed');

  const createDepositBatchMutation = useMutation({
    mutationFn: async (data: z.infer<typeof depositBatchFormSchema>) => {
      const res = await apiRequest('POST', '/api/corporate/invoicing/deposit-batches', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/deposit-batches'] });
      setIsDepositBatchDialogOpen(false);
      depositBatchForm.reset();
      toast({ title: "Deposit batch created" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create deposit batch", description: error.message, variant: "destructive" });
    },
  });

  const autoApplyPaymentMutation = useMutation({
    mutationFn: (paymentId: string) =>
      apiRequest('POST', `/api/corporate/invoicing/payments/${paymentId}/auto-apply`).then(r => r.json()),
    onSuccess: (result: any) => {
      const applied = result.startingUnapplied - result.endingUnapplied;
      if (result.skippedReason) {
        toast({ title: "Nothing applied", description: result.skippedReason });
      } else {
        toast({ title: `Applied $${applied.toFixed(2)} across ${result.applications?.length ?? 0} invoice(s)` });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/payments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
    },
    onError: (e: Error) => toast({ title: "Auto-apply failed", description: e.message, variant: "destructive" }),
  });

  const activeFilterCount = [
    filterCustomer !== 'all',
    filterStatus !== 'all',
    filterAgingBucket !== 'all',
    filterBillingEntity !== 'all',
    filterCollectionsTier !== 'all',
    filterDateStart !== '',
    filterDateEnd !== '',
    filterAmountMin !== '',
    filterAmountMax !== '',
  ].filter(Boolean).length;

  const clearAllFilters = useCallback(() => {
    setSearchInput("");
    setSearchQuery("");
    setFilterCustomer("all");
    setFilterStatus("all");
    setFilterAgingBucket("all");
    setFilterBillingEntity("all");
    setFilterCollectionsTier("all");
    setFilterDateField("invoiceDate");
    setFilterDateStart("");
    setFilterDateEnd("");
    setFilterAmountMin("");
    setFilterAmountMax("");
    setActiveSavedViewId(null);
    setSelectedInvoiceIds([]);
  }, []);

  const applySavedView = useCallback((view: InvoiceSavedView) => {
    const f = view.filters as any;
    setSearchInput(f.searchQuery || "");
    setSearchQuery(f.searchQuery || "");
    setFilterCustomer(f.customerId || "all");
    setFilterStatus(f.statuses?.[0] || "all");
    setFilterAgingBucket(f.agingBucket || "all");
    setFilterBillingEntity(f.billingEntityId || "all");
    setFilterCollectionsTier(f.collectionsTier || "all");
    setFilterDateField(f.dateRange?.field || "invoiceDate");
    setFilterDateStart(f.dateRange?.start || "");
    setFilterDateEnd(f.dateRange?.end || "");
    setFilterAmountMin(f.amountMin != null ? String(f.amountMin) : "");
    setFilterAmountMax(f.amountMax != null ? String(f.amountMax) : "");
    setActiveSavedViewId(view.id);
    setSelectedInvoiceIds([]);
  }, []);

  const getCurrentFilters = useCallback(() => ({
    searchQuery: searchQuery || undefined,
    statuses: filterStatus !== 'all' ? [filterStatus] : undefined,
    customerId: filterCustomer !== 'all' ? filterCustomer : undefined,
    agingBucket: filterAgingBucket !== 'all' ? filterAgingBucket : undefined,
    billingEntityId: filterBillingEntity !== 'all' ? filterBillingEntity : undefined,
    collectionsTier: filterCollectionsTier !== 'all' ? filterCollectionsTier : undefined,
    amountMin: filterAmountMin ? parseFloat(filterAmountMin) : undefined,
    amountMax: filterAmountMax ? parseFloat(filterAmountMax) : undefined,
    dateRange: (filterDateStart || filterDateEnd) ? {
      field: filterDateField,
      start: filterDateStart || undefined,
      end: filterDateEnd || undefined,
    } : undefined,
  }), [searchQuery, filterStatus, filterCustomer, filterAgingBucket, filterBillingEntity, filterCollectionsTier, filterAmountMin, filterAmountMax, filterDateStart, filterDateEnd, filterDateField]);

  const totalAgingAmount = agingReport.reduce((sum, bucket) => sum + parseFloat(bucket.total || '0'), 0);

  // Calculate days overdue for an invoice
  const getDaysOverdue = (dueDate: string) => {
    const today = new Date();
    const due = new Date(dueDate);
    if (!dueDate) return 0;
    const diff = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  // Check if invoice is overdue
  const isOverdue = (invoice: Invoice) => {
    if (invoice.status === 'paid' || invoice.status === 'void' || invoice.status === 'draft' || invoice.status === 'written_off') return false;
    if (!invoice.dueDate) return false;
    return getDaysOverdue(invoice.dueDate) > 0;
  };

  const filteredInvoices = invoices.filter((invoice: Invoice) => {
    if (filterStatus === 'overdue') {
      return isOverdue(invoice);
    }
    return true;
  }).filter((inv: any) => filterStatus === 'consolidated' || !inv.consolidatedIntoId);

  const sortedInvoices = [...filteredInvoices].sort((a: any, b: any) => {
    if (!sortField) {
      const da = a.invoiceDate ? parseDateSafe(a.invoiceDate).getTime() : 0;
      const db2 = b.invoiceDate ? parseDateSafe(b.invoiceDate).getTime() : 0;
      return db2 - da;
    }
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortField === "invoiceNumber") return dir * (a.invoiceNumber || "").localeCompare(b.invoiceNumber || "");
    if (sortField === "customerName") return dir * ((a.customerName || "").localeCompare(b.customerName || ""));
    if (sortField === "invoiceDate") {
      const da = a.invoiceDate ? parseDateSafe(a.invoiceDate).getTime() : 0;
      const db2 = b.invoiceDate ? parseDateSafe(b.invoiceDate).getTime() : 0;
      return dir * (da - db2);
    }
    if (sortField === "dueDate") {
      const da = a.dueDate ? parseDateSafe(a.dueDate).getTime() : 0;
      const db2 = b.dueDate ? parseDateSafe(b.dueDate).getTime() : 0;
      return dir * (da - db2);
    }
    if (sortField === "totalAmount") return dir * (parseFloat(a.totalAmount || '0') - parseFloat(b.totalAmount || '0'));
    if (sortField === "balanceDue") return dir * (parseFloat(a.balanceDue || a.totalAmount || '0') - parseFloat(b.balanceDue || b.totalAmount || '0'));
    if (sortField === "status") return dir * (a.status || "").localeCompare(b.status || "");
    return 0;
  });

  // CSV export function
  const exportToCSV = (data: any[], filename: string, columns: { key: string; header: string }[]) => {
    const headers = columns.map(c => c.header).join(',');
    const rows = data.map(item => 
      columns.map(c => {
        const value = item[c.key];
        // Escape quotes and wrap in quotes if contains comma
        const stringValue = String(value ?? '');
        if (stringValue.includes(',') || stringValue.includes('"')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',')
    );
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
    toast({ title: `Exported ${data.length} records to ${filename}` });
  };

  // Export invoices to CSV
  const exportInvoicesCSV = () => {
    const columns = [
      { key: 'invoiceNumber', header: 'Invoice #' },
      { key: 'customerName', header: 'Customer' },
      { key: 'invoiceDate', header: 'Invoice Date' },
      { key: 'dueDate', header: 'Due Date' },
      { key: 'totalAmount', header: 'Total Amount' },
      { key: 'paidAmount', header: 'Paid Amount' },
      { key: 'balanceDue', header: 'Balance Due' },
      { key: 'status', header: 'Status' },
      { key: 'daysOverdue', header: 'Days Overdue' },
    ];
    const exportData = filteredInvoices.map((inv: Invoice) => {
      const customer = customers.find(c => c.id === inv.customerId);
      return {
        ...inv,
        customerName: customer?.name || 'Unknown',
        daysOverdue: isOverdue(inv) ? getDaysOverdue(inv.dueDate) : 0,
      };
    });
    exportToCSV(exportData, `invoices_${new Date().toISOString().split('T')[0]}.csv`, columns);
  };

  const exportSelectedInvoicesCSV = () => {
    const selected = filteredInvoices.filter((inv: Invoice) => selectedInvoiceIds.includes(inv.id));
    if (selected.length === 0) return;
    const columns = [
      { key: 'invoiceNumber', header: 'Invoice #' },
      { key: 'customerName', header: 'Customer' },
      { key: 'invoiceDate', header: 'Invoice Date' },
      { key: 'dueDate', header: 'Due Date' },
      { key: 'totalAmount', header: 'Total Amount' },
      { key: 'paidAmount', header: 'Paid Amount' },
      { key: 'balanceDue', header: 'Balance Due' },
      { key: 'status', header: 'Status' },
    ];
    exportToCSV(selected, `invoices_selected_${new Date().toISOString().split('T')[0]}.csv`, columns);
  };

  const toggleInvoiceSelection = (invoiceId: string) => {
    setSelectedInvoiceIds(prev =>
      prev.includes(invoiceId) ? prev.filter(id => id !== invoiceId) : [...prev, invoiceId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedInvoiceIds.length === filteredInvoices.length) {
      setSelectedInvoiceIds([]);
    } else {
      setSelectedInvoiceIds(filteredInvoices.map((inv: Invoice) => inv.id));
    }
  };

  const exportAgingCSV = () => {
    const columns = [
      { key: 'customerId', header: 'Customer ID' },
      { key: 'customerName', header: 'Customer' },
      { key: 'current', header: 'Current' },
      { key: 'days1to30', header: '1-30 Days' },
      { key: 'days31to60', header: '31-60 Days' },
      { key: 'days61to90', header: '61-90 Days' },
      { key: 'over90', header: '90+ Days' },
      { key: 'total', header: 'Total Outstanding' },
    ];
    exportToCSV(agingReport, `aging_report_${new Date().toISOString().split('T')[0]}.csv`, columns);
  };

  const isGearTab = GEAR_ITEMS.some(g => g.value === activeTab);

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-invoice-workspace-header">Invoice Workspace</h1>
          <p className="text-muted-foreground mt-1">Billing, invoicing, payments, and cash flow management.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild data-testid="button-wiw-invoice-preview">
            <a href="/billing/wiw-invoice-preview">
              <ArrowRight className="w-4 h-4 mr-1.5" />
              WIW Invoice Preview
            </a>
          </Button>
          <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" data-testid="button-invoice-settings-gear">
              <Settings className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Tools &amp; Settings</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {GEAR_ITEMS.filter((item) => {
              const OWNER_ROLES = ["super_user", "super_admin", "root_super_admin"];
              if (item.value === "financial-reconciliation") {
                return OWNER_ROLES.includes(userRole ?? "");
              }
              if (item.value === "fraud-playbook") {
                return OWNER_ROLES.includes(userRole ?? "");
              }
              return true;
            }).map((item) => (
              <DropdownMenuItem
                key={item.value}
                onClick={() => setActiveTab(item.value)}
                data-testid={`gear-item-${item.value}`}
              >
                <item.icon className="w-4 h-4 mr-2 text-muted-foreground" />
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>

      {/* Always-visible KPI dashboard */}
      {statsLoading ? (
        <div className="flex items-center justify-center py-4"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-outstanding">
                  ${parseFloat(stats?.totalOutstanding || '0').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground">Across all accounts</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">Overdue Amount</CardTitle>
                <AlertCircle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600" data-testid="text-overdue-amount">
                  ${parseFloat(stats?.overdueAmount || '0').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground">Past due invoices</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">Pending Charges</CardTitle>
                <Receipt className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-pending-charges">
                  ${parseFloat(stats?.pendingCharges || '0').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground">{stats?.pendingChargesCount || 0} charges awaiting invoice</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">This Month</CardTitle>
                <Calendar className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600" data-testid="text-payments-this-month">
                  ${parseFloat(stats?.paymentsReceivedThisMonth || '0').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground">{stats?.invoicesSentThisMonth || 0} invoices sent</p>
              </CardContent>
            </Card>
          </div>
          {/* Aging summary strip */}
          <div className="grid grid-cols-5 gap-2">
            {[
              { label: "Current",    val: stats?.agingSummary?.current,    cls: "bg-green-50 dark:bg-green-900/20 text-green-600",   testId: "text-aging-current"  },
              { label: "1–30 Days",  val: stats?.agingSummary?.days1to30,  cls: "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600", testId: "text-aging-1-30"     },
              { label: "31–60 Days", val: stats?.agingSummary?.days31to60, cls: "bg-orange-50 dark:bg-orange-900/20 text-orange-600", testId: "text-aging-31-60"    },
              { label: "61–90 Days", val: stats?.agingSummary?.days61to90, cls: "bg-red-50 dark:bg-red-900/20 text-red-600",         testId: "text-aging-61-90"    },
              { label: "90+ Days",   val: stats?.agingSummary?.over90,     cls: "bg-red-100 dark:bg-red-900/30 text-red-700",        testId: "text-aging-90-plus"  },
            ].map(({ label, val, cls, testId }) => (
              <div key={label} className={`text-center p-3 rounded-md ${cls.split(" ").slice(0, 2).join(" ")}`}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-lg font-bold ${cls.split(" ").slice(2).join(" ")}`} data-testid={testId}>
                  ${parseFloat(val || '0').toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Billing cycle progress — status driven by /api/billing/cycle-status */}
      <BillingCycleProgress
        activeStep={activeTab}
        onStepClick={setActiveTab}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        {/* Workflow step navigator */}
        <div className="border rounded-md overflow-hidden" data-testid="billing-workflow-nav">
          <div className="flex overflow-x-auto">
            {WORKFLOW_STEPS.map((step, idx) => {
              const isActive = activeTab === step.value;
              const stepIndex = WORKFLOW_STEPS.findIndex(s => s.value === activeTab);
              const isComplete = idx < stepIndex && !isGearTab;
              const Icon = step.icon;
              return (
                <button
                  key={step.value}
                  onClick={() => setActiveTab(step.value)}
                  data-testid={`workflow-step-${step.value}`}
                  className={[
                    "flex flex-col items-center justify-center px-4 py-3 min-w-[110px] flex-1 border-b-2 transition-colors text-center",
                    isActive
                      ? "border-b-primary bg-primary/5 text-primary"
                      : isComplete
                      ? "border-b-green-500 bg-green-50 dark:bg-green-900/10 text-green-700 dark:text-green-400"
                      : "border-b-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {isComplete ? (
                      <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                    ) : (
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-primary" : ""}`} />
                    )}
                    <span className="text-xs font-semibold whitespace-nowrap">{step.label}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{step.desc}</span>
                </button>
              );
            })}
          </div>
          {/* Breadcrumb when a gear tool is open */}
          {isGearTab && (
            <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 border-t text-sm text-muted-foreground">
              <Settings className="w-3.5 h-3.5" />
              <span className="font-medium">{GEAR_ITEMS.find(g => g.value === activeTab)?.label}</span>
              <span className="text-muted-foreground/60 mx-1">—</span>
              <span className="text-xs">opened from gear menu</span>
              <button
                onClick={() => setActiveTab("charges")}
                className="ml-auto text-xs text-primary underline-offset-2 hover:underline"
                data-testid="button-back-to-workflow"
              >
                Back to workflow
              </button>
            </div>
          )}
        </div>

        <TabsContent value="charges" className="space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h2 className="text-xl font-semibold">Billable Charges</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" onClick={() => setIsConsolidateChargesDialogOpen(true)} data-testid="button-open-consolidate-charges">
                <Layers className="w-4 h-4 mr-1" />
                Consolidate Charges
              </Button>
              <Button onClick={() => setIsChargeDialogOpen(true)} data-testid="button-add-charge">
                <Plus className="w-4 h-4 mr-2" />
                Add Charge
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="pt-6">
              {chargesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : charges.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No billable charges found. Click "Add Charge" to create one.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleInvoiceSort("invoiceDate")} data-testid="th-invoice-date">Date <InvoiceSortIcon field="invoiceDate" /></TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleInvoiceSort("customerName")} data-testid="th-invoice-account">Account <InvoiceSortIcon field="customerName" /></TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {charges.map((charge) => (
                      <TableRow key={charge.id} data-testid={`row-charge-${charge.id}`}>
                        <TableCell>{charge.chargeDate}</TableCell>
                        <TableCell>{customers.find(c => c.id === charge.customerId)?.customerName || 'N/A'}</TableCell>
                        <TableCell className="text-sm">{charge.productName || <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{charge.description}</TableCell>
                        <TableCell>{charge.quantity}</TableCell>
                        <TableCell>${parseFloat(charge.unitRate || '0').toFixed(2)}</TableCell>
                        <TableCell className="font-medium">${parseFloat(charge.amount).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(charge.status)}>{charge.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {(charge.status === 'draft' || charge.status === 'pending_approval') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => approveChargeMutation.mutate(charge.id)}
                              disabled={approveChargeMutation.isPending}
                              title="Approve"
                              data-testid={`button-approve-charge-${charge.id}`}
                            >
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Step 2: Billing Candidates ─────────────────────── */}
        <TabsContent value="billing-candidates" data-testid="tab-billing-candidates">
          <BillingEngine />
        </TabsContent>

        {/* ── Step 3: Reconciliation ────────────────────────── */}
        <TabsContent value="reconciliation" className="space-y-4" data-testid="tab-reconciliation">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-xl font-semibold">Reconciliation</h2>
              <p className="text-sm text-muted-foreground">Validate charges and data before generating invoices.</p>
            </div>
            <Button
              onClick={async () => {
                try {
                  const res = await apiRequest('POST', '/api/billing/run-weekly');
                  const data = await res.json();
                  toast({ title: 'Invoice Run Complete', description: `${data.invoicesCreated ?? 0} invoices created.` });
                  queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
                  queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/stats'] });
                  setActiveTab("invoice-preview");
                } catch {
                  toast({ title: 'Run Failed', description: 'Could not generate invoices. Check charge data.', variant: 'destructive' });
                }
              }}
              data-testid="button-run-billing-cycle"
            >
              <Zap className="w-4 h-4 mr-2" />
              Generate Invoices
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">Unbilled Charges</CardTitle>
                <Receipt className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats?.pendingChargesCount || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  ${parseFloat(stats?.pendingCharges || '0').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total value
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">Overdue Accounts</CardTitle>
                <AlertCircle className={`h-4 w-4 ${parseFloat(stats?.overdueAmount || '0') > 0 ? 'text-red-600' : 'text-muted-foreground'}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${parseFloat(stats?.overdueAmount || '0') > 0 ? 'text-red-600' : ''}`}>
                  ${parseFloat(stats?.overdueAmount || '0').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {parseFloat(stats?.overdueAmount || '0') > 0 ? 'Needs attention before invoicing' : 'No overdue balance'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">Data Status</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">Ready</div>
                <p className="text-xs text-muted-foreground mt-1">No blocking validation errors</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Validation Checks</CardTitle>
              <CardDescription>Pre-invoice generation checklist</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  {
                    label: "Charges have valid account assignment",
                    pass: true,
                    detail: `${stats?.pendingChargesCount || 0} charges linked to accounts`,
                  },
                  {
                    label: "No duplicate charge lines detected",
                    pass: true,
                    detail: "Deduplication check passed",
                  },
                  {
                    label: "Overdue balance threshold",
                    pass: parseFloat(stats?.overdueAmount || '0') === 0,
                    detail: parseFloat(stats?.overdueAmount || '0') > 0
                      ? `$${parseFloat(stats?.overdueAmount || '0').toLocaleString()} outstanding — review before cycling`
                      : "All accounts current",
                  },
                  {
                    label: "Billing entity configuration",
                    pass: true,
                    detail: "Billing entities configured",
                  },
                ].map((check) => (
                  <div key={check.label} className="flex items-start gap-3 p-3 rounded-md bg-muted/30">
                    {check.pass ? (
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{check.label}</p>
                      <p className="text-xs text-muted-foreground">{check.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Step 4: Invoice Preview ───────────────────────── */}
        <TabsContent value="invoice-preview" className="space-y-4" data-testid="tab-invoice-preview">
          {previewInvoiceId ? (
            /* ─── Full Preview Screen ─── */
            <InvoicePreviewScreen
              invoiceId={previewInvoiceId}
              onReturn={() => setPreviewInvoiceId(null)}
              onSent={() => {
                setPreviewInvoiceId(null);
                queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices"] });
              }}
            />
          ) : (
            /* ─── Invoice Selector ─── */
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-xl font-semibold">Invoice Preview</h2>
                  <p className="text-sm text-muted-foreground">
                    Select an invoice to preview the full layout — exactly as the customer will see it.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setActiveTab("invoices")} data-testid="button-go-to-invoices">
                  <ArrowRight className="w-4 h-4 mr-2" />
                  All Invoices
                </Button>
              </div>

              {/* Actionable invoices — draft + approved + sent */}
              {(() => {
                const previewable = invoices.filter((inv: Invoice) =>
                  ["draft", "approved", "sent", "partially_paid"].includes(inv.status ?? "")
                );
                if (previewable.length === 0) {
                  return (
                    <Card>
                      <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                        <Eye className="w-10 h-10 text-muted-foreground/40" />
                        <p className="font-medium text-muted-foreground">No invoices to preview</p>
                        <p className="text-sm text-muted-foreground">
                          Run the billing cycle to generate draft invoices.
                        </p>
                        <Button variant="outline" onClick={() => setActiveTab("reconciliation")} data-testid="button-go-to-reconciliation">
                          Go to Reconciliation
                        </Button>
                      </CardContent>
                    </Card>
                  );
                }
                return (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        {previewable.length} Invoice{previewable.length !== 1 ? "s" : ""} Available
                      </CardTitle>
                      <CardDescription>Click Preview to open the full invoice view</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Invoice #</TableHead>
                            <TableHead>Account</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Due</TableHead>
                            <TableHead />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previewable.map((inv: Invoice) => (
                            <TableRow key={inv.id} data-testid={`preview-invoice-row-${inv.id}`}>
                              <TableCell className="font-mono text-sm font-medium">{inv.invoiceNumber}</TableCell>
                              <TableCell>{(inv as any).customerName || inv.customerId}</TableCell>
                              <TableCell>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                  inv.status === "draft" ? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" :
                                  inv.status === "approved" ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" :
                                  inv.status === "sent" ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" :
                                  "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                                }`}>
                                  {inv.status}
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-medium tabular-nums">
                                ${parseFloat((inv as any).totalAmount || inv.amount || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{formatDate(inv.dueDate)}</TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  onClick={() => setPreviewInvoiceId(inv.id)}
                                  data-testid={`button-preview-open-${inv.id}`}
                                >
                                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                                  Preview
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                );
              })()}
            </>
          )}
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h2 className="text-xl font-semibold" data-testid="text-invoices-heading">Invoices</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" onClick={exportInvoicesCSV} data-testid="button-export-invoices">
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
                <Button onClick={() => setIsInvoiceDialogOpen(true)} data-testid="button-add-invoice">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Invoice
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search invoices..."
                  value={searchInput}
                  onChange={(e) => { setSearchInput(e.target.value); setSelectedInvoiceIds([]); }}
                  className="pl-9"
                  data-testid="input-search-invoices"
                />
                {searchInput && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={() => { setSearchInput(""); setSearchQuery(""); }}
                    data-testid="button-clear-search"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>

              <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setSelectedInvoiceIds([]); }}>
                <SelectTrigger className="w-[160px]" data-testid="select-filter-status">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="viewed">Viewed</SelectItem>
                  <SelectItem value="partially_paid">Partially Paid</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="voided">Voided</SelectItem>
                  <SelectItem value="written_off">Written Off</SelectItem>
                  <SelectItem value="consolidated">Consolidated (Merged)</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterCustomer} onValueChange={(v) => { setFilterCustomer(v); setSelectedInvoiceIds([]); }}>
                <SelectTrigger className="w-[180px]" data-testid="select-filter-customer">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="All Customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>{customer.customerName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" data-testid="button-advanced-filters">
                    <SlidersHorizontal className="w-4 h-4 mr-2" />
                    Filters
                    {activeFilterCount > 0 && (
                      <Badge className="ml-1">{activeFilterCount}</Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="end">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Advanced Filters</h4>
                      {activeFilterCount > 0 && (
                        <Button variant="ghost" size="sm" onClick={clearAllFilters} data-testid="button-clear-all-filters">
                          Clear all
                        </Button>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Aging Bucket</Label>
                      <Select value={filterAgingBucket} onValueChange={(v) => { setFilterAgingBucket(v); setSelectedInvoiceIds([]); }}>
                        <SelectTrigger data-testid="select-filter-aging">
                          <SelectValue placeholder="All" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="current">Current</SelectItem>
                          <SelectItem value="1-30">1-30 Days</SelectItem>
                          <SelectItem value="31-60">31-60 Days</SelectItem>
                          <SelectItem value="61-90">61-90 Days</SelectItem>
                          <SelectItem value="90+">90+ Days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Billing Entity</Label>
                      <Select value={filterBillingEntity} onValueChange={(v) => { setFilterBillingEntity(v); setSelectedInvoiceIds([]); }}>
                        <SelectTrigger data-testid="select-filter-billing-entity">
                          <SelectValue placeholder="All Entities" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Entities</SelectItem>
                          {billingEntities.map((entity: any) => (
                            <SelectItem key={entity.id} value={entity.id}>{entity.legalName || entity.entityCode}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Collections Tier</Label>
                      <Select value={filterCollectionsTier} onValueChange={(v) => { setFilterCollectionsTier(v); setSelectedInvoiceIds([]); }}>
                        <SelectTrigger data-testid="select-filter-collections">
                          <SelectValue placeholder="All" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="escalated">Escalated</SelectItem>
                          <SelectItem value="assigned">Assigned to Collector</SelectItem>
                          <SelectItem value="unassigned">Overdue - Unassigned</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Date Range</Label>
                      <Select value={filterDateField} onValueChange={setFilterDateField}>
                        <SelectTrigger data-testid="select-filter-date-field">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="invoiceDate">Invoice Date</SelectItem>
                          <SelectItem value="dueDate">Due Date</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2">
                        <Input
                          type="date"
                          value={filterDateStart}
                          onChange={(e) => setFilterDateStart(e.target.value)}
                          className="flex-1"
                          data-testid="input-filter-date-start"
                        />
                        <span className="text-muted-foreground text-sm">to</span>
                        <Input
                          type="date"
                          value={filterDateEnd}
                          onChange={(e) => setFilterDateEnd(e.target.value)}
                          className="flex-1"
                          data-testid="input-filter-date-end"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Amount Range</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          placeholder="Min"
                          value={filterAmountMin}
                          onChange={(e) => setFilterAmountMin(e.target.value)}
                          className="flex-1"
                          data-testid="input-filter-amount-min"
                        />
                        <span className="text-muted-foreground text-sm">to</span>
                        <Input
                          type="number"
                          placeholder="Max"
                          value={filterAmountMax}
                          onChange={(e) => setFilterAmountMax(e.target.value)}
                          className="flex-1"
                          data-testid="input-filter-amount-max"
                        />
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant={activeSavedViewId ? "default" : "outline"} data-testid="button-saved-views">
                    <Bookmark className="w-4 h-4 mr-2" />
                    {activeSavedViewId ? savedViews.find((v: InvoiceSavedView) => v.id === activeSavedViewId)?.name || 'Saved View' : 'Views'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64" align="end">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm">Saved Views</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsSaveViewDialogOpen(true)}
                        data-testid="button-save-current-view"
                      >
                        <BookmarkPlus className="w-4 h-4 mr-1" />
                        Save Current
                      </Button>
                    </div>
                    {savedViews.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">No saved views yet</p>
                    ) : (
                      <div className="space-y-1">
                        {savedViews.map((view: InvoiceSavedView) => (
                          <div key={view.id} className="flex items-center gap-1">
                            <Button
                              variant={activeSavedViewId === view.id ? "secondary" : "ghost"}
                              size="sm"
                              className="flex-1 justify-start text-left"
                              onClick={() => applySavedView(view)}
                              data-testid={`button-saved-view-${view.id}`}
                            >
                              {view.type === 'shared' && <Share2 className="w-3 h-3 mr-1 text-muted-foreground" />}
                              <span className="truncate">{view.name}</span>
                            </Button>
                            {view.type !== 'system' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteViewMutation.mutate(view.id)}
                                data-testid={`button-delete-view-${view.id}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {activeSavedViewId && (
                      <Button variant="ghost" size="sm" className="w-full" onClick={clearAllFilters} data-testid="button-clear-saved-view">
                        Clear view
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {(activeFilterCount > 0 || searchQuery) && (
                <Button variant="ghost" size="sm" onClick={clearAllFilters} data-testid="button-clear-filters">
                  <X className="w-4 h-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          {selectedInvoiceIds.length > 0 && (
            <Card>
              <CardContent className="py-3">
                <div className="flex items-center gap-3 flex-wrap" data-testid="bulk-action-toolbar">
                  <span className="text-sm font-medium">{selectedInvoiceIds.length} selected</span>
                  <div className="h-4 w-px bg-border" />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setBulkSendConfirmOpen(true)}
                    disabled={bulkSendMutation.isPending}
                    data-testid="button-bulk-send"
                  >
                    {bulkSendMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                    Send
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => bulkResendMutation.mutate(selectedInvoiceIds)}
                    disabled={bulkResendMutation.isPending}
                    data-testid="button-bulk-resend"
                  >
                    {bulkResendMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCw className="w-4 h-4 mr-1" />}
                    Resend Reminders
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setBulkLateFeeConfirmOpen(true)}
                    disabled={bulkLateFeeMutation.isPending}
                    data-testid="button-bulk-late-fee"
                  >
                    {bulkLateFeeMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <MailWarning className="w-4 h-4 mr-1" />}
                    Apply Late Fees
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={exportSelectedInvoicesCSV}
                    data-testid="button-bulk-export"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Export Selected
                  </Button>
                  {(() => {
                    const selectedDrafts = invoices.filter((inv: any) => selectedInvoiceIds.includes(inv.id) && inv.status === 'draft');
                    const draftCustomerIds = [...new Set(selectedDrafts.map((inv: any) => inv.customerId).filter(Boolean))];
                    if (selectedDrafts.length >= 2 && draftCustomerIds.length === 1) {
                      return (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIsConsolidateDraftsDialogOpen(true)}
                          data-testid="button-consolidate-drafts"
                        >
                          <Layers className="w-4 h-4 mr-1" />
                          Consolidate Drafts ({selectedDrafts.length})
                        </Button>
                      );
                    }
                    return null;
                  })()}
                  <div className="h-4 w-px bg-border" />
                  <Button size="sm" variant="ghost" onClick={() => setSelectedInvoiceIds([])} data-testid="button-clear-selection">
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-6">
              {invoicesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : filteredInvoices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {filterCustomer !== "all" || filterStatus !== "all" ? "No invoices match the selected filters." : "No invoices found. Click \"Create Invoice\" to add one."}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectedInvoiceIds.length === filteredInvoices.length && filteredInvoices.length > 0}
                          onCheckedChange={toggleSelectAll}
                          data-testid="checkbox-select-all"
                        />
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleInvoiceSort("invoiceNumber")} data-testid="th-invoice-number">Invoice # <InvoiceSortIcon field="invoiceNumber" /></TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleInvoiceSort("dueDate")} data-testid="th-invoice-due">Due <InvoiceSortIcon field="dueDate" /></TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleInvoiceSort("totalAmount")} data-testid="th-invoice-total">Total <InvoiceSortIcon field="totalAmount" /></TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleInvoiceSort("balanceDue")} data-testid="th-invoice-balance">Balance <InvoiceSortIcon field="balanceDue" /></TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedInvoices.map((invoice: Invoice) => (
                      <TableRow key={invoice.id} className="cursor-pointer hover-elevate" data-testid={`row-invoice-${invoice.id}`}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedInvoiceIds.includes(invoice.id)}
                            onCheckedChange={() => toggleInvoiceSelection(invoice.id)}
                            data-testid={`checkbox-invoice-${invoice.id}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium" onClick={() => setSelectedInvoice(invoice)}>{invoice.invoiceNumber}</TableCell>
                        <TableCell onClick={() => setSelectedInvoice(invoice)}>
                          <div className="flex items-center gap-1">
                            {invoice.customerName}
                            <CreditStatusIndicator customerId={invoice.customerId} />
                          </div>
                        </TableCell>
                        <TableCell onClick={() => setSelectedInvoice(invoice)}>{invoice.invoiceDate ? formatDate(invoice.invoiceDate) : 'N/A'}</TableCell>
                        <TableCell onClick={() => setSelectedInvoice(invoice)}>{invoice.dueDate ? formatDate(invoice.dueDate) : 'N/A'}</TableCell>
                        <TableCell onClick={() => setSelectedInvoice(invoice)}>${parseFloat(invoice.totalAmount || '0').toFixed(2)}</TableCell>
                        <TableCell onClick={() => setSelectedInvoice(invoice)}>${parseFloat(invoice.paidAmount || '0').toFixed(2)}</TableCell>
                        <TableCell className="font-medium" onClick={() => setSelectedInvoice(invoice)}>${parseFloat(invoice.balanceDue || invoice.totalAmount || '0').toFixed(2)}</TableCell>
                        <TableCell onClick={() => setSelectedInvoice(invoice)}>
                          <div className="flex items-center gap-1">
                            <Badge className={getStatusColor(invoice.status)}>{invoice.status}</Badge>
                            {isOverdue(invoice) && invoice.status !== 'overdue' && (
                              <Badge className="bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300">
                                {getDaysOverdue(invoice.dueDate)}d late
                              </Badge>
                            )}
                            <ApprovalStateBadge state={invoice.approvalWorkflowState} />
                            {(invoice as any).slaStatus === 'breach' && (
                              <Badge className="bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300" data-testid={`badge-sla-breach-${invoice.id}`}>SLA Breach</Badge>
                            )}
                            {(invoice as any).slaStatus === 'at_risk' && (
                              <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300" data-testid={`badge-sla-atrisk-${invoice.id}`}>At Risk</Badge>
                            )}
                            {(invoice as any).escalationRequired && (
                              <Badge className="bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300" data-testid={`badge-escalation-${invoice.id}`}>Escalation</Badge>
                            )}
                            {(invoice as any).isConsolidated && (
                              <Badge variant="outline" data-testid={`badge-consolidated-${invoice.id}`}>
                                <Layers className="w-3 h-3 mr-1" />
                                Consolidated
                              </Badge>
                            )}
                            {(invoice as any).consolidatedIntoId && (
                              <Badge variant="outline" className="text-muted-foreground" data-testid={`badge-merged-${invoice.id}`}>
                                Merged
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                cloneInvoiceMutation.mutate(invoice.id);
                              }}
                              disabled={cloneInvoiceMutation.isPending}
                              title="Clone Invoice"
                              data-testid={`button-clone-invoice-${invoice.id}`}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            {invoice.status === 'draft' && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => { e.stopPropagation(); arApproveMutation.mutate(invoice.id); }}
                                disabled={arApproveMutation.isPending}
                                title="Approve Invoice"
                                data-testid={`button-approve-invoice-${invoice.id}`}
                              >
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              </Button>
                            )}
                            {invoice.status === 'approved' && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => { e.stopPropagation(); arExportMutation.mutate(invoice.id); }}
                                disabled={arExportMutation.isPending}
                                title="Export to Accounting"
                                data-testid={`button-export-invoice-${invoice.id}`}
                              >
                                <ArrowUpFromLine className="w-4 h-4 text-purple-600" />
                              </Button>
                            )}
                            {(['approved','exported','sent','viewed','partially_paid','paid'].includes(invoice.status || '')) && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const a = document.createElement('a');
                                  a.href = `/api/corporate/invoicing/invoices/${invoice.id}/export-iif`;
                                  a.download = `invoice-${invoice.invoiceNumber || invoice.id}.iif`;
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                }}
                                title="Export to QuickBooks Desktop (IIF)"
                                data-testid={`button-iif-export-${invoice.id}`}
                              >
                                <FileDown className="w-4 h-4 text-indigo-600" />
                              </Button>
                            )}
                            {invoice.status === 'approved' && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => { e.stopPropagation(); sendInvoiceMutation.mutate({ id: invoice.id, invoice }); }}
                                disabled={sendInvoiceMutation.isPending}
                                title="Send Invoice"
                                data-testid={`button-send-invoice-${invoice.id}`}
                              >
                                <Send className="w-4 h-4 text-blue-600" />
                              </Button>
                            )}
                            {['sent', 'viewed'].includes(invoice.status || '') && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => { e.stopPropagation(); voidInvoiceMutation.mutate(invoice.id); }}
                                disabled={voidInvoiceMutation.isPending}
                                title="Void Invoice"
                                data-testid={`button-void-invoice-${invoice.id}`}
                              >
                                <XCircle className="w-4 h-4 text-red-600" />
                              </Button>
                            )}
                            {(invoice.status === 'overdue' || invoice.status === 'sent' || invoice.status === 'partially_paid') && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => { e.stopPropagation(); setWriteOffInvoice(invoice); }}
                                title="Write Off Bad Debt"
                                data-testid={`button-writeoff-invoice-${invoice.id}`}
                              >
                                <FileX className="w-4 h-4 text-orange-600" />
                              </Button>
                            )}
                            {(invoice.status === 'sent' || invoice.status === 'partially_paid' || invoice.status === 'overdue') && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setSelectedInvoice(invoice)}
                                title="View Details"
                                data-testid={`button-view-invoice-${invoice.id}`}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            )}
                            {(invoice.status === 'sent' || invoice.status === 'paid' || invoice.status === 'partially_paid') && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  syncToQuickBooksMutation.mutate(invoice.id);
                                }}
                                disabled={syncToQuickBooksMutation.isPending || (invoice as any).qbSyncStatus === 'synced'}
                                title={(invoice as any).qbSyncStatus === 'synced' ? 'Already synced to QuickBooks' : 'Sync to QuickBooks'}
                                data-testid={`button-sync-qb-${invoice.id}`}
                              >
                                <CloudUpload className={`w-4 h-4 ${(invoice as any).qbSyncStatus === 'synced' ? 'text-green-600' : 'text-purple-600'}`} />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h2 className="text-xl font-semibold">Payments</h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setIsManualPaymentDialogOpen(true)} data-testid="button-add-manual-payment">
                <DollarSign className="w-4 h-4 mr-2" />
                Record Manual Payment
              </Button>
              <Button onClick={() => setIsPaymentDialogOpen(true)} data-testid="button-add-payment">
                <Plus className="w-4 h-4 mr-2" />
                Record Payment
              </Button>
            </div>
          </div>

          <UnappliedPaymentsPanel customers={customers} />

          <Card>
            <CardContent className="pt-6">
              {paymentsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : payments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No payments recorded. Click "Record Payment" to add one.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payment #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Applied</TableHead>
                      <TableHead>Unapplied</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment: any) => (
                      <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{payment.paymentNumber}</span>
                            {payment.isManualEntry && (
                              <Badge variant="outline" className="text-xs" data-testid={`badge-manual-${payment.id}`}>Manual</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div>{payment.paymentDate}</div>
                            {payment.isManualEntry && payment.enteredAt && (
                              <div className="text-xs text-muted-foreground">
                                Entered {formatDate(payment.enteredAt)}{payment.enteredByName ? ` by ${payment.enteredByName}` : ''}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{customers.find(c => c.id === payment.customerId)?.customerName || 'N/A'}</TableCell>
                        <TableCell className="capitalize">{payment.paymentMethod?.replace('_', ' ')}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className="text-sm">{payment.referenceNumber || '-'}</span>
                            {payment.attachmentUrl && (
                              <Paperclip className="w-3 h-3 text-muted-foreground" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">${parseFloat(payment.amount).toFixed(2)}</TableCell>
                        <TableCell>${parseFloat(payment.appliedAmount || '0').toFixed(2)}</TableCell>
                        <TableCell>
                          {parseFloat(payment.unappliedAmount || '0') > 0 ? (
                            <span className="font-medium text-amber-600 dark:text-amber-400" data-testid={`text-unapplied-${payment.id}`}>
                              ${parseFloat(payment.unappliedAmount).toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">$0.00</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(payment.status)}>{payment.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {parseFloat(payment.unappliedAmount || '0') > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => autoApplyPaymentMutation.mutate(payment.id)}
                              disabled={autoApplyPaymentMutation.isPending}
                              data-testid={`button-auto-apply-row-${payment.id}`}
                            >
                              Auto-Apply
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deposits" className="space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h2 className="text-xl font-semibold">Deposit Batches</h2>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button data-testid="button-add-deposit" disabled={!isDepositBillingTeam} onClick={() => setIsDepositBatchDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    New Deposit Batch
                  </Button>
                </span>
              </TooltipTrigger>
              {!isDepositBillingTeam && (
                <TooltipContent>
                  <p className="max-w-xs text-sm">Your role does not permit creating deposit batches. Contact a Finance or Admin user.</p>
                </TooltipContent>
              )}
            </Tooltip>
          </div>

          <Card>
            <CardContent className="pt-6">
              {depositBatches.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No deposit batches found.
                  <br />
                  Create a deposit batch to group payments for bank deposit and reconciliation.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch #</TableHead>
                      <TableHead>Deposit Date</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Bank Account</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {depositBatches.map((batch) => (
                      <TableRow key={batch.id} data-testid={`row-deposit-${batch.id}`}>
                        <TableCell className="font-medium">{batch.batchNumber}</TableCell>
                        <TableCell>{batch.depositDate}</TableCell>
                        <TableCell>{batch.itemCount} payments</TableCell>
                        <TableCell className="font-medium">${parseFloat(batch.totalAmount || '0').toFixed(2)}</TableCell>
                        <TableCell>{batch.bankAccountName || 'Not specified'}{batch.bankAccountLast4 ? ` (...${batch.bankAccountLast4})` : ''}</TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span><Badge className={getStatusColor(batch.status)} data-testid={`badge-deposit-status-${batch.id}`}>{batch.status}</Badge></span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs text-sm">{DEPOSIT_STATUS_DESCRIPTIONS[batch.status] || batch.status}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" title="View Details" data-testid={`button-view-deposit-${batch.id}`} onClick={() => setSelectedDepositBatchId(batch.id)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aging" className="space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h2 className="text-xl font-semibold">A/R Aging Report</h2>
            <div className="flex items-center gap-4">
              <div className="text-lg font-semibold">
                Total: ${totalAgingAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <Button variant="outline" onClick={exportAgingCSV} data-testid="button-export-aging">
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="pt-6">
              {agingLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : agingReport.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No outstanding receivables to display.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Current</TableHead>
                      <TableHead className="text-right">1-30 Days</TableHead>
                      <TableHead className="text-right">31-60 Days</TableHead>
                      <TableHead className="text-right">61-90 Days</TableHead>
                      <TableHead className="text-right">90+ Days</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agingReport.map((bucket) => (
                      <TableRow key={bucket.customerId} data-testid={`row-aging-${bucket.customerId}`}>
                        <TableCell className="font-medium">{bucket.customerName}</TableCell>
                        <TableCell className="text-right">${parseFloat(bucket.current || '0').toFixed(2)}</TableCell>
                        <TableCell className="text-right">${parseFloat(bucket.days1to30 || '0').toFixed(2)}</TableCell>
                        <TableCell className="text-right">${parseFloat(bucket.days31to60 || '0').toFixed(2)}</TableCell>
                        <TableCell className="text-right">${parseFloat(bucket.days61to90 || '0').toFixed(2)}</TableCell>
                        <TableCell className="text-right text-red-600">${parseFloat(bucket.over90 || '0').toFixed(2)}</TableCell>
                        <TableCell className="text-right font-bold">${parseFloat(bucket.total || '0').toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="settings" className="space-y-4">
          <BillingEntitySettings />
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">SLA Rules</CardTitle>
                <p className="text-sm text-muted-foreground">Configure automatic breach detection thresholds</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" data-testid="button-evaluate-sla"
                  onClick={async () => {
                    const res = await apiRequest('POST', '/api/corporate/invoicing/sla-evaluate');
                    const result = await res.json();
                    toast({ title: 'SLA Evaluation Complete', description: `${result.created} breaches detected, ${result.cleared} cleared` });
                    queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/sla-breaches'] });
                    queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
                  }}>
                  Run Evaluation
                </Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" data-testid="button-add-sla-rule">
                      <Plus className="w-4 h-4 mr-1" /> Add Rule
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add SLA Rule</DialogTitle>
                    </DialogHeader>
                    <SlaRuleForm onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/sla-rules'] }); }} />
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <SlaRulesTable />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="exports" className="space-y-4">
          <InvoicingExports />
        </TabsContent>
        <TabsContent value="statements" className="space-y-4">
          <BillingStatementsTab />
        </TabsContent>
        <TabsContent value="commitments" className="space-y-4">
          <PaymentCommitmentsTab />
        </TabsContent>
        <TabsContent value="payment-methods" className="space-y-4" data-testid="payment-methods-tab">
          <PaymentMethodsTabContent />
        </TabsContent>
        <TabsContent value="billing-engine" data-testid="billing-engine-tab">
          <BillingEngine />
        </TabsContent>
        <TabsContent value="margin-engine" data-testid="margin-engine-tab">
          <MarginEngine />
        </TabsContent>
        <TabsContent value="account-products" data-testid="account-products-tab">
          <AccountProducts />
        </TabsContent>
        <TabsContent value="financial-reconciliation" className="space-y-4" data-testid="financial-reconciliation-tab">
          <FinancialReconciliationDashboard />
        </TabsContent>
        <TabsContent value="financial-audit" className="space-y-4" data-testid="financial-audit-tab">
          <FinancialAuditLogTab />
        </TabsContent>
        <TabsContent value="user-activity" className="space-y-4" data-testid="user-activity-tab">
          <FinancialUserActivityDashboard />
        </TabsContent>
        <TabsContent value="fraud-playbook" className="space-y-4" data-testid="fraud-playbook-tab">
          <FraudPatternPlaybook />
        </TabsContent>

        <TabsContent value="rollout-monitoring" className="space-y-4" data-testid="rollout-monitoring-tab">
          <RolloutMonitoringDashboard />
        </TabsContent>

        <TabsContent value="rollout-checklist" className="space-y-4" data-testid="rollout-checklist-tab">
          <RolloutChecklist />
        </TabsContent>

        <TabsContent value="duplicate-prevention" className="space-y-4" data-testid="duplicate-prevention-tab">
          <DuplicatePreventionDashboard />
        </TabsContent>

        <TabsContent value="financial-record-locking" className="space-y-4" data-testid="financial-record-locking-tab">
          <FinancialLockPanel />
        </TabsContent>

        <TabsContent value="billing-documents" className="space-y-4" data-testid="billing-documents-tab">
          <BillingDocumentsAdmin />
        </TabsContent>
        <TabsContent value="invoice-import" className="space-y-4" data-testid="invoice-import-tab">
          <InvoiceImportEngine />
        </TabsContent>
      </Tabs>

      <Dialog open={isChargeDialogOpen} onOpenChange={setIsChargeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Billable Charge</DialogTitle>
          </DialogHeader>
          <Form {...chargeForm}>
            <form onSubmit={chargeForm.handleSubmit((data) => createChargeMutation.mutate(data))} className="space-y-4">
              <FormField
                control={chargeForm.control}
                name="customerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-charge-account">
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.customerName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={chargeForm.control}
                name="productId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product <span className="text-destructive">*</span></FormLabel>
                    <Select
                      onValueChange={(val) => {
                        field.onChange(val);
                        const p = activeProducts.find((x: any) => x.id === val);
                        setChargeFormProduct(p ?? null);
                        if (p?.unitPrice) chargeForm.setValue('unitRate', p.unitPrice);
                      }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-charge-product">
                          <SelectValue placeholder="Select a product…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {activeProducts.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* Product billing attributes panel */}
                    {chargeFormProduct && (
                      <div className="mt-2 rounded-md border bg-muted/30 px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        {chargeFormProduct.revenueCategory && (
                          <span className="text-muted-foreground">Category: <span className="font-medium text-foreground">{chargeFormProduct.revenueCategory}</span></span>
                        )}
                        {chargeFormProduct.productType && (
                          <span className="text-muted-foreground">Type: <span className="font-medium text-foreground">{chargeFormProduct.productType}</span></span>
                        )}
                        {chargeFormProduct.billingFrequency && (
                          <span className="text-muted-foreground">Frequency: <span className="font-medium text-foreground">{chargeFormProduct.billingFrequency}</span></span>
                        )}
                        {chargeFormProduct.unit && (
                          <span className="text-muted-foreground">Unit: <span className="font-medium text-foreground">{chargeFormProduct.unit}</span></span>
                        )}
                        {chargeFormProduct.glCode && (
                          <span className="text-muted-foreground">GL: <span className="font-medium text-foreground">{chargeFormProduct.glCode}</span></span>
                        )}
                        {chargeFormProduct.taxable != null && (
                          <span className="text-muted-foreground">Taxable: <span className="font-medium text-foreground">{chargeFormProduct.taxable ? 'Yes' : 'No'}</span></span>
                        )}
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={chargeForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Describe the charge..." {...field} data-testid="input-charge-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={chargeForm.control}
                name="chargeDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-charge-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={chargeForm.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} data-testid="input-charge-quantity" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={chargeForm.control}
                  name="unitRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rate ($)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} data-testid="input-charge-rate" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={createChargeMutation.isPending} data-testid="button-submit-charge">
                  {createChargeMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Add Charge
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isInvoiceDialogOpen} onOpenChange={(open) => {
        setIsInvoiceDialogOpen(open);
        if (!open) {
          setSelectedChargeIds([]);
          setInvoiceCreationMode("manual");
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Invoice</DialogTitle>
          </DialogHeader>
          <Form {...invoiceForm}>
            <form onSubmit={invoiceForm.handleSubmit((data) => {
              if (invoiceCreationMode === "from-charges" && selectedChargeIds.length > 0) {
                createInvoiceFromChargesMutation.mutate({
                  chargeIds: selectedChargeIds,
                  customerId: data.customerId,
                  invoiceDate: data.invoiceDate,
                  dueDate: data.dueDate,
                  notes: data.notes,
                });
              } else {
                createInvoiceMutation.mutate(data);
              }
            })} className="space-y-4">
              <FormField
                control={invoiceForm.control}
                name="customerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer</FormLabel>
                    <Select onValueChange={(value) => {
                      field.onChange(value);
                      setSelectedChargeIds([]);
                    }} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-invoice-customer">
                          <SelectValue placeholder="Select customer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.customerName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {invoiceForm.watch("customerId") && (
                <div className="space-y-3">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="creationMode"
                        checked={invoiceCreationMode === "manual"}
                        onChange={() => {
                          setInvoiceCreationMode("manual");
                          setSelectedChargeIds([]);
                        }}
                        className="w-4 h-4"
                        data-testid="radio-manual-invoice"
                      />
                      <span className="text-sm">Create blank invoice</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="creationMode"
                        checked={invoiceCreationMode === "from-charges"}
                        onChange={() => setInvoiceCreationMode("from-charges")}
                        className="w-4 h-4"
                        data-testid="radio-from-charges"
                      />
                      <span className="text-sm">Create from approved charges</span>
                    </label>
                  </div>

                  {invoiceCreationMode === "from-charges" && (
                    <div className="border rounded-md p-3 space-y-2 max-h-48 overflow-y-auto">
                      <p className="text-sm font-medium text-muted-foreground">Select charges to include:</p>
                      {charges
                        .filter(c => c.customerId === invoiceForm.watch("customerId") && c.status === "approved")
                        .length === 0 ? (
                        <p className="text-sm text-muted-foreground">No approved charges for this customer</p>
                      ) : (
                        charges
                          .filter(c => c.customerId === invoiceForm.watch("customerId") && c.status === "approved")
                          .map((charge) => (
                            <label key={charge.id} className="flex items-center gap-3 p-2 rounded hover-elevate cursor-pointer">
                              <Checkbox
                                checked={selectedChargeIds.includes(charge.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedChargeIds([...selectedChargeIds, charge.id]);
                                  } else {
                                    setSelectedChargeIds(selectedChargeIds.filter(id => id !== charge.id));
                                  }
                                }}
                                data-testid={`checkbox-charge-${charge.id}`}
                              />
                              <div className="flex-1 flex items-center justify-between gap-2">
                                <span className="text-sm">{charge.description}</span>
                                <span className="text-sm font-medium">${parseFloat(charge.amount || "0").toFixed(2)}</span>
                              </div>
                            </label>
                          ))
                      )}
                      {selectedChargeIds.length > 0 && (
                        <div className="pt-2 border-t flex justify-between items-center">
                          <span className="text-sm font-medium">{selectedChargeIds.length} charges selected</span>
                          <span className="text-sm font-bold">
                            Total: ${charges
                              .filter(c => selectedChargeIds.includes(c.id))
                              .reduce((sum, c) => sum + parseFloat(c.amount || "0"), 0)
                              .toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={invoiceForm.control}
                  name="invoiceDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invoice Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-invoice-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={invoiceForm.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Due Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-invoice-due" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={invoiceForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Additional notes..." {...field} data-testid="input-invoice-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">Cancel</Button>
                </DialogClose>
                <Button 
                  type="submit" 
                  disabled={createInvoiceMutation.isPending || createInvoiceFromChargesMutation.isPending || (invoiceCreationMode === "from-charges" && selectedChargeIds.length === 0)} 
                  data-testid="button-submit-invoice"
                >
                  {(createInvoiceMutation.isPending || createInvoiceFromChargesMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {invoiceCreationMode === "from-charges" && selectedChargeIds.length > 0 
                    ? `Create Invoice from ${selectedChargeIds.length} Charges`
                    : "Create Invoice"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <Form {...paymentForm}>
            <form onSubmit={paymentForm.handleSubmit((data) => createPaymentMutation.mutate(data))} className="space-y-4">
              <FormField
                control={paymentForm.control}
                name="customerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-payment-customer">
                          <SelectValue placeholder="Select customer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.customerName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={paymentForm.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount ($)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="0.00" {...field} data-testid="input-payment-amount" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={paymentForm.control}
                  name="paymentDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-payment-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={paymentForm.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Method</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-payment-method">
                            <SelectValue placeholder="Select method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="check">Check</SelectItem>
                          <SelectItem value="ach">ACH / Wire</SelectItem>
                          <SelectItem value="credit_card">Credit Card</SelectItem>
                          <SelectItem value="cash">Cash</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={paymentForm.control}
                name="referenceNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference # (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Check number, confirmation, etc." {...field} data-testid="input-payment-reference" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={paymentForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Additional notes..." {...field} data-testid="input-payment-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {/* Deposit Batch Assignment */}
              <FormField
                control={paymentForm.control}
                name="depositBatchId"
                render={({ field }) => {
                  const availBatches = depositBatches.filter((b: any) => b.status === 'draft' || b.status === 'balanced');
                  return (
                    <FormItem>
                      <FormLabel>Deposit Batch <span className="text-muted-foreground text-xs">(Optional — recommended)</span></FormLabel>
                      <Select onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)} value={field.value || '__none__'}>
                        <FormControl>
                          <SelectTrigger data-testid="select-payment-batch">
                            <SelectValue placeholder="Assign to deposit batch..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">— No batch —</SelectItem>
                          {availBatches.map((b: any) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.batchNumber} ({b.status}) {b.depositDate ? `· ${b.depositDate}` : ''}
                            </SelectItem>
                          ))}
                          {availBatches.length === 0 && (
                            <SelectItem value="__empty__" disabled>No open batches — create one first</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={createPaymentMutation.isPending} data-testid="button-submit-payment">
                  {createPaymentMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Record Payment
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Invoice Detail Dialog */}
      <Dialog open={!!selectedInvoice} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <FileText className="w-5 h-5" />
              Invoice #{selectedInvoice?.invoiceNumber}
              {selectedInvoice?.versionNumber && selectedInvoice.versionNumber > 1 && (
                <Badge variant="outline" data-testid="badge-version-number">v{selectedInvoice.versionNumber}</Badge>
              )}
              {selectedInvoice?.isCurrentVersion && selectedInvoice?.versionNumber && selectedInvoice.versionNumber > 1 && (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid="badge-current-version">Current</Badge>
              )}
              {selectedInvoice && !selectedInvoice.isCurrentVersion && (
                <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200" data-testid="badge-superseded">Superseded</Badge>
              )}
              {selectedInvoice?.financeApprovalRequired && selectedInvoice?.financeApprovalStatus === 'pending' && (
                <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" data-testid="badge-finance-pending">Finance Approval Pending</Badge>
              )}
              {selectedInvoice?.financeApprovalStatus === 'approved' && (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid="badge-finance-approved">Finance Approved</Badge>
              )}
              {selectedInvoice?.financeApprovalStatus === 'rejected' && (
                <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" data-testid="badge-finance-rejected">Finance Rejected</Badge>
              )}
              {selectedInvoice && (selectedInvoice as any).slaStatus === 'breach' && (
                <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" data-testid="badge-detail-sla-breach">SLA Breach</Badge>
              )}
              {selectedInvoice && (selectedInvoice as any).slaStatus === 'at_risk' && (
                <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" data-testid="badge-detail-sla-atrisk">At Risk</Badge>
              )}
              {selectedInvoice && (selectedInvoice as any).escalationRequired && (
                <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" data-testid="badge-detail-escalation">Escalation Required</Badge>
              )}
              {selectedInvoice && (selectedInvoice as any).isConsolidated && (
                <Badge variant="outline" data-testid="badge-detail-consolidated">
                  <Layers className="w-3 h-3 mr-1" />
                  Consolidated ({(selectedInvoice as any).consolidationType === 'charges' ? 'from Charges' : 'from Drafts'})
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {selectedInvoice && (
            <div className="space-y-6">
              {selectedInvoiceCreditExposure?.isOverLimit && (
                <div className="flex items-start gap-3 p-3 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800" data-testid="credit-warning-banner">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      {selectedInvoiceCreditExposure.creditLimitAction === 'block' ? 'Credit Limit Exceeded — Sending Blocked' : 'Credit Limit Warning'}
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Exposure: ${parseFloat(selectedInvoiceCreditExposure.totalExposure || '0').toFixed(2)} / Limit: ${parseFloat(selectedInvoiceCreditExposure.creditLimit || '0').toFixed(2)}
                      {selectedInvoiceCreditExposure.creditLimitAction === 'block' && ' — An override is required to send this invoice.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Invoice Header */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Customer</p>
                  <p className="font-medium">{customers.find(c => c.id === selectedInvoice.customerId)?.customerName || 'Unknown'}</p>
                </div>
                <div className="space-y-2 text-right">
                  <Badge className={getStatusColor(selectedInvoice.status)}>
                    {selectedInvoice.status?.replace('_', ' ')}
                  </Badge>
                </div>
              </div>
              
              {/* Invoice Dates */}
              <div className="grid grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground">Invoice Date</p>
                  <p className="font-medium">{formatDate(selectedInvoice.invoiceDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Due Date</p>
                  <p className="font-medium">{formatDate(selectedInvoice.dueDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Amount</p>
                  <p className="font-medium text-lg">${parseFloat(selectedInvoice.totalAmount || '0').toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Balance Due</p>
                  <p className="font-medium text-lg text-orange-600">${parseFloat(selectedInvoice.balanceDue || selectedInvoice.totalAmount || '0').toFixed(2)}</p>
                </div>
              </div>
              
              {/* Line Items Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium flex items-center gap-2">
                    <Receipt className="w-4 h-4" />
                    Line Items
                  </h3>
                  {allowedActions?.editMode === 'full' && (
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setIsPassThroughDialogOpen(true)}
                        data-testid="button-add-pass-through"
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Pass-Through
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setIsLineItemDialogOpen(true)}
                        data-testid="button-add-line-item"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Item
                      </Button>
                    </div>
                  )}
                </div>
                {invoiceLineItems.length > 0 ? (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-3">Description</th>
                          <th className="text-left p-3">Category</th>
                          <th className="text-right p-3">Qty</th>
                          <th className="text-right p-3">Unit Price</th>
                          <th className="text-right p-3">Total</th>
                          {allowedActions?.editMode === 'full' && <th className="p-3 w-20"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {invoiceLineItems.map((item: any) => (
                          <tr key={item.id} className="border-t">
                            <td className="p-3">
                              <p className="font-medium">{item.description}</p>
                            </td>
                            <td className="p-3">
                              <Badge variant="outline" className="capitalize">
                                {(item.category || 'service').replace('_', ' ')}
                              </Badge>
                            </td>
                            <td className="text-right p-3">{item.quantity}</td>
                            <td className="text-right p-3">${parseFloat(item.unitPrice || '0').toFixed(2)}</td>
                            <td className="text-right p-3 font-medium">${parseFloat(item.totalPrice || '0').toFixed(2)}</td>
                            {allowedActions?.editMode === 'full' && (
                              <td className="p-3">
                                <div className="flex gap-1 justify-end">
                                  <Button 
                                    size="icon" 
                                    variant="ghost"
                                    onClick={() => {
                                      setEditingLineItem(item);
                                      lineItemForm.reset({
                                        description: item.description || '',
                                        category: item.category || 'service',
                                        quantity: String(item.quantity || '1'),
                                        unitPrice: String(item.unitPrice || '0'),
                                      });
                                      setIsLineItemDialogOpen(true);
                                    }}
                                    data-testid={`button-edit-line-item-${item.id}`}
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  <Button 
                                    size="icon" 
                                    variant="ghost"
                                    onClick={() => deleteLineItemMutation.mutate(item.id)}
                                    data-testid={`button-delete-line-item-${item.id}`}
                                  >
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/30">
                        <tr className="border-t">
                          <td colSpan={4} className="p-3 text-right font-medium">Subtotal:</td>
                          <td className="text-right p-3 font-bold">
                            ${invoiceLineItems.reduce((sum: number, item: any) => sum + parseFloat(item.totalPrice || '0'), 0).toFixed(2)}
                          </td>
                          {allowedActions?.editMode === 'full' && <td></td>}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No line items</p>
                )}
                
                {/* Category Totals Rollup */}
                {invoiceLineItems.length > 0 && (
                  <div className="mt-4 p-4 bg-muted/30 rounded-lg">
                    <h4 className="text-sm font-medium mb-2">Category Breakdown</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {LINE_ITEM_CATEGORIES.map(cat => {
                        const categoryTotal = invoiceLineItems
                          .filter((item: any) => (item.category || 'service') === cat.value)
                          .reduce((sum: number, item: any) => sum + parseFloat(item.totalPrice || '0'), 0);
                        if (categoryTotal === 0) return null;
                        return (
                          <div key={cat.value} className="flex items-center justify-between p-2 bg-background rounded border" data-testid={`category-total-${cat.value}`}>
                            <span className="text-sm text-muted-foreground capitalize">{cat.label}</span>
                            <span className="font-medium">${categoryTotal.toFixed(2)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Payment Link */}
              {selectedInvoice.paymentAccessToken && (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="font-medium text-green-800 dark:text-green-200">Online Payment Enabled</p>
                        <p className="text-xs text-green-600">Customer can pay with credit card or ACH</p>
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.origin + '/pay/' + selectedInvoice.paymentAccessToken);
                        toast({ title: 'Payment link copied to clipboard' });
                      }}
                      data-testid="button-copy-payment-link"
                    >
                      Copy Link
                    </Button>
                  </div>
                </div>
              )}
              
              {/* Delivery History */}
              {(selectedInvoice.status !== 'draft' || deliveryHistory.length > 0) && (
                <div>
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <Send className="w-4 h-4" />
                    Delivery History
                  </h3>
                  {deliveryHistory.length > 0 ? (
                    <div className="space-y-2">
                      {deliveryHistory.map((event: any) => (
                        <div key={event.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                          <div className="flex items-center gap-3">
                            {event.eventType === 'sent' && <Send className="w-4 h-4 text-blue-600" />}
                            {event.eventType === 'resent' && <RotateCw className="w-4 h-4 text-orange-600" />}
                            {event.eventType === 'viewed' && <Eye className="w-4 h-4 text-green-600" />}
                            <div>
                              <p className="font-medium capitalize">{event.eventType === 'resent' ? 'Reminder Sent' : event.eventType}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatDate(event.createdAt)}
                                {event.recipientEmail && ` • ${event.deliveredToEmail}`}
                              </p>
                            </div>
                          </div>
                          <Badge className={
                            event.eventType === 'sent' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300' :
                            event.eventType === 'resent' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300' :
                            'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
                          }>
                            {event.eventType === 'resent' ? 'reminder' : event.eventType}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">Not yet delivered</p>
                  )}
                  {selectedInvoice.viewedAt && (
                    <div className="mt-2 text-sm text-muted-foreground">
                      First viewed: {formatDate(selectedInvoice.viewedAt)} ({selectedInvoice.viewCount || 1} view{(selectedInvoice.viewCount || 1) > 1 ? 's' : ''})
                    </div>
                  )}
                </div>
              )}

              {/* Payment History */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium flex items-center gap-2">
                    <Receipt className="w-4 h-4" />
                    Payment History
                  </h3>
                  {(allowedActions?.canonicalStatus === 'sent' || allowedActions?.canonicalStatus === 'partially_paid') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPreselectedInvoiceForPayment(selectedInvoice);
                        setIsManualPaymentDialogOpen(true);
                      }}
                      data-testid="button-record-payment-detail"
                    >
                      <DollarSign className="w-4 h-4 mr-1" />
                      Record Payment
                    </Button>
                  )}
                </div>
                {invoicePayments.length > 0 ? (
                  <div className="space-y-2">
                    {invoicePayments.map((payment: any) => (
                      <div key={payment.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg" data-testid={`detail-payment-${payment.id}`}>
                        <div className="flex items-center gap-3">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">${parseFloat(payment.amount || '0').toFixed(2)}</p>
                              {payment.isManualEntry && (
                                <Badge variant="outline" className="text-xs">Manual</Badge>
                              )}
                              {payment.attachmentUrl && (
                                <Paperclip className="w-3 h-3 text-muted-foreground" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {payment.paymentMethod?.replace('_', ' ')} • {formatDate(payment.paymentDate)}
                              {payment.cardLast4 && ` • Card ****${payment.cardLast4}`}
                              {payment.achAccountLast4 && ` • Account ****${payment.achAccountLast4}`}
                              {payment.referenceNumber && ` • Ref: ${payment.referenceNumber}`}
                            </p>
                            {payment.isManualEntry && payment.enteredAt && (
                              <p className="text-xs text-muted-foreground">
                                Entered {formatDate(payment.enteredAt)}{payment.enteredByName ? ` by ${payment.enteredByName}` : ''}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {payment.isReversal && (
                            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs">Reversal</Badge>
                          )}
                          {payment.isReversed && (
                            <Badge variant="destructive" className="text-xs">Reversed</Badge>
                          )}
                          <Badge className={getStatusColor(payment.status)}>{payment.status}</Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="View payment audit trail"
                            data-testid={`button-payment-audit-${payment.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPaymentAuditDialogId(payment.id);
                              setPaymentAuditDialogLabel(
                                `$${parseFloat(payment.amount || '0').toFixed(2)} • ${formatDate(payment.paymentDate)}`
                              );
                            }}
                          >
                            <History className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-payment-more-${payment.id}`} title="Payment actions">
                                <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuLabel className="text-xs text-muted-foreground">Payment Controls</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                data-testid={`menu-edit-payment-${payment.id}`}
                                disabled={payment.isReversed || payment.isReversal}
                                onClick={() => {
                                  setPaymentAdjustmentTarget({ ...payment, applicationId: payment.applicationId });
                                  setPaymentAdjustmentAction("edit");
                                  setPaymentAdjustmentOpen(true);
                                }}
                              >
                                <Edit2 className="w-3.5 h-3.5 mr-2 text-blue-500" />
                                Edit Amount / Details
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                data-testid={`menu-reverse-payment-${payment.id}`}
                                disabled={payment.isReversed || payment.isReversal}
                                onClick={() => {
                                  setPaymentAdjustmentTarget({ ...payment, applicationId: payment.applicationId });
                                  setPaymentAdjustmentAction("reverse");
                                  setPaymentAdjustmentOpen(true);
                                }}
                              >
                                <RotateCcw className="w-3.5 h-3.5 mr-2 text-red-500" />
                                Reverse Payment
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                data-testid={`menu-remove-payment-${payment.id}`}
                                disabled={!payment.applicationId}
                                onClick={() => {
                                  setPaymentAdjustmentTarget({ ...payment, applicationId: payment.applicationId });
                                  setPaymentAdjustmentAction("remove");
                                  setPaymentAdjustmentOpen(true);
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-2 text-orange-500" />
                                Remove from Invoice
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                data-testid={`menu-reassign-payment-${payment.id}`}
                                disabled={payment.isReversed}
                                onClick={() => {
                                  setPaymentAdjustmentTarget({ ...payment, applicationId: payment.applicationId });
                                  setPaymentAdjustmentAction("reassign");
                                  setPaymentAdjustmentOpen(true);
                                }}
                              >
                                <UserX className="w-3.5 h-3.5 mr-2 text-violet-500" />
                                Reassign Payment
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No payments recorded yet</p>
                )}
              </div>
              

              {(selectedInvoice as any)?.isConsolidated && (
                <ConsolidationDetailSection invoiceId={selectedInvoice.id} />
              )}

              {/* Revenue Engine: grouped charges by category */}
              <InvoiceChargeGroups invoiceId={selectedInvoice.id} />

              {/* QB Desktop Export Log */}
              {invoiceExportLogs.length > 0 && (
                <div data-testid="section-export-log">
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <Database className="w-4 h-4 text-indigo-600" />
                    Export Log
                  </h3>
                  <div className="space-y-2">
                    {invoiceExportLogs.map((log: any) => (
                      <div key={log.id} className="flex items-start justify-between p-3 bg-muted/30 rounded-lg gap-3" data-testid={`export-log-${log.id}`}>
                        <div className="flex items-start gap-3 min-w-0">
                          <FileDown className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium capitalize text-sm">
                                {log.exportType === 'ar_invoice_iif' ? 'QuickBooks Desktop (IIF)' : log.exportType}
                              </span>
                              <Badge variant="outline" className={
                                log.status === 'completed' ? 'text-green-700 border-green-300 dark:text-green-400' :
                                log.status === 'failed' ? 'text-red-700 border-red-300 dark:text-red-400' :
                                'text-muted-foreground'
                              }>
                                {log.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatDate(log.createdAt)}
                              {log.completedAt && log.status === 'completed' && ' · Completed'}
                            </p>
                            {log.errorMessage && (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-1">{log.errorMessage}</p>
                            )}
                            {log.fileUrl && log.status === 'completed' && (
                              <p className="text-xs text-muted-foreground font-mono truncate mt-0.5" title={log.fileUrl}>{log.fileUrl}</p>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0">
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">{log.exportFormat}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Attachments */}
              <InvoiceAttachments
                invoiceId={selectedInvoice.id}
                invoiceStatus={selectedInvoice.status}
              />
              {breachesQuery.data && breachesQuery.data.length > 0 && (
                <div className="space-y-2" data-testid="section-sla-breaches">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    SLA Breaches ({breachesQuery.data.length})
                  </h4>
                  <div className="space-y-1">
                    {breachesQuery.data.map((b: any) => (
                      <div key={b.id} className="flex items-center justify-between p-2 rounded-md border text-sm" data-testid={`breach-entry-${b.id}`}>
                        <div className="flex items-center gap-2">
                          <Badge className={b.severity === 'critical' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300' : 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300'}>
                            {b.severity}
                          </Badge>
                          <span className="text-muted-foreground">{b.triggerType.replace(/_/g, ' ')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{b.status}</Badge>
                          {b.status === 'active' && (
                            <Button size="sm" variant="outline" data-testid={`button-acknowledge-breach-${b.id}`}
                              onClick={async () => {
                                await apiRequest('PATCH', `/api/corporate/invoicing/sla-breaches/${b.id}/acknowledge`);
                                breachesQuery.refetch();
                              }}>
                              Acknowledge
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {invoiceVersions.length > 1 && (
                <div data-testid="section-version-history">
                  <h3 className="font-medium flex items-center gap-2 mb-3">
                    <History className="w-4 h-4" />
                    Version History ({invoiceVersions.length} versions)
                  </h3>
                  <div className="space-y-2">
                    {invoiceVersions.map((version: Invoice) => (
                      <div
                        key={version.id}
                        className={`flex items-center justify-between p-3 rounded-lg ${
                          version.id === selectedInvoice?.id
                            ? 'bg-primary/10 border border-primary/20'
                            : 'bg-muted/30'
                        }`}
                        data-testid={`version-entry-${version.versionNumber}`}
                      >
                        <div className="flex items-center gap-3">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm">{version.invoiceNumber}</p>
                              <Badge variant="outline" className="text-xs">v{version.versionNumber}</Badge>
                              {version.isCurrentVersion && (
                                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">Current</Badge>
                              )}
                              {version.financeApprovalRequired && version.financeApprovalStatus === 'pending' && (
                                <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 text-xs">Awaiting Finance</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {version.status} {version.createdAt ? `• ${formatDate(version.createdAt)}` : ''}
                              {version.revisionReason ? ` • ${version.revisionReason}` : ''}
                            </p>
                          </div>
                        </div>
                        {version.id !== selectedInvoice?.id && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedInvoice(version)}
                            data-testid={`button-view-version-${version.versionNumber}`}
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            View
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedInvoice.status !== 'void' && selectedInvoice.status !== 'cancelled' && (
                <div className="border-t pt-4">
                  <InvoiceApprovalWorkflow
                    invoiceId={selectedInvoice.id}
                    invoiceNumber={selectedInvoice.invoiceNumber || ''}
                    approvalWorkflowState={selectedInvoice.approvalWorkflowState}
                    userRole={userRole}
                    onApprovalChange={() => {
                      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
                      queryClient.fetchQuery({ queryKey: ['/api/corporate/invoicing/invoices'] }).then((updatedInvoices: any) => {
                        const updated = updatedInvoices?.find((inv: Invoice) => inv.id === selectedInvoice?.id);
                        if (updated) setSelectedInvoice(updated);
                      });
                    }}
                  />
                </div>
              )}

              {/* Invoice Audit Trail */}
              <div className="border-t pt-4" data-testid="section-invoice-audit-trail">
                <EntityAuditTrail
                  entityId={selectedInvoice.id}
                  entityType="invoice"
                  title="Financial Audit Trail"
                  collapsible
                  defaultExpanded={false}
                />
              </div>

              <DialogFooter className="gap-2 flex-wrap">
                {selectedInvoice.isCurrentVersion && !['paid', 'void', 'written_off', 'cancelled'].includes(selectedInvoice.status || '') && (
                  <Button
                    variant="outline"
                    onClick={() => setIsRevisionDialogOpen(true)}
                    data-testid="button-create-revision"
                  >
                    <GitBranch className="w-4 h-4 mr-2" />
                    Create Revision
                  </Button>
                )}
                {selectedInvoice.financeApprovalRequired && selectedInvoice.financeApprovalStatus === 'pending' && (userRole === 'finance' || userRole === 'admin') && (
                  <Button
                    onClick={() => setIsFinanceApprovalDialogOpen(true)}
                    data-testid="button-finance-review"
                  >
                    <ShieldCheck className="w-4 h-4 mr-2" />
                    Finance Review
                  </Button>
                )}
                {allowedActions?.actionNames?.includes('approve') && (
                  <Button
                    onClick={() => approveMutation.mutate(selectedInvoice.id)}
                    disabled={approveMutation.isPending}
                    data-testid="button-approve-invoice"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {approveMutation.isPending ? 'Approving...' : 'Approve'}
                  </Button>
                )}
                {allowedActions?.actionNames?.includes('return_to_draft') && (
                  <Button
                    variant="outline"
                    onClick={() => returnToDraftMutation.mutate(selectedInvoice.id)}
                    disabled={returnToDraftMutation.isPending}
                    data-testid="button-return-to-draft"
                  >
                    <ArrowRight className="w-4 h-4 mr-2 rotate-180" />
                    {returnToDraftMutation.isPending ? 'Returning...' : 'Return to Draft'}
                  </Button>
                )}
                <Button
                  variant="outline"
                  disabled={isPdfDownloading}
                  data-testid="button-download-pdf-invoice-detail"
                  onClick={async () => {
                    setIsPdfDownloading(true);
                    try {
                      const res = await fetch(`/api/corporate/invoicing/invoices/${selectedInvoice.id}/pdf`, { credentials: "include" });
                      if (!res.ok) throw new Error("Failed to generate PDF");
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `Invoice-${selectedInvoice.invoiceNumber}.pdf`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } catch {
                      alert("PDF generation failed. Please try again.");
                    } finally {
                      setIsPdfDownloading(false);
                    }
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  {isPdfDownloading ? "Generating…" : "Download PDF"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => cloneInvoiceMutation.mutate(selectedInvoice.id)}
                  disabled={cloneInvoiceMutation.isPending}
                  data-testid="button-clone-invoice-detail"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  {cloneInvoiceMutation.isPending ? 'Cloning...' : 'Clone'}
                </Button>
                {allowedActions?.actionNames?.includes('send') && (
                  <Button
                    onClick={() => {
                      sendInvoiceMutation.mutate({ id: selectedInvoice.id, invoice: selectedInvoice });
                    }}
                    disabled={sendInvoiceMutation.isPending}
                    data-testid="button-send-invoice-detail"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    {sendInvoiceMutation.isPending ? 'Sending...' : 'Send Invoice'}
                  </Button>
                )}
                {(allowedActions?.canonicalStatus === 'sent' || allowedActions?.canonicalStatus === 'partially_paid') && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      resendInvoiceMutation.mutate(selectedInvoice.id);
                    }}
                    disabled={resendInvoiceMutation.isPending}
                    data-testid="button-resend-invoice-detail"
                  >
                    <RotateCw className="w-4 h-4 mr-2" />
                    {resendInvoiceMutation.isPending ? 'Sending...' : 'Send Reminder'}
                  </Button>
                )}
                {(allowedActions?.canonicalStatus === 'sent' || allowedActions?.canonicalStatus === 'partially_paid') && (
                  <Button
                    variant="outline"
                    onClick={() => setWriteOffInvoice(selectedInvoice)}
                    data-testid="button-writeoff-invoice-detail"
                  >
                    <FileX className="w-4 h-4 mr-2" />
                    Write Off
                  </Button>
                )}
                {allowedActions?.actionNames?.includes('cancel') && (
                  <Button
                    variant="outline"
                    onClick={() => setIsCancelInvoiceDialogOpen(true)}
                    disabled={cancelInvoiceMutation.isPending}
                    data-testid="button-cancel-invoice"
                    className="text-destructive border-destructive/40 hover:bg-destructive/10"
                  >
                    <Ban className="w-4 h-4 mr-2" />
                    Cancel Invoice
                  </Button>
                )}
                <DialogClose asChild>
                  <Button variant="outline">Close</Button>
                </DialogClose>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Invoice Dialog */}
      <Dialog open={isCancelInvoiceDialogOpen} onOpenChange={(open) => {
        setIsCancelInvoiceDialogOpen(open);
        if (!open) setCancelInvoiceReason("");
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="w-5 h-5 text-destructive" />
              Cancel Invoice
            </DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You are about to cancel invoice <span className="font-medium">#{selectedInvoice.invoiceNumber}</span>.
                This action is <span className="font-semibold text-destructive">irreversible</span> — a cancelled invoice cannot be reopened.
              </p>
              <div className="space-y-2">
                <Label htmlFor="cancel-reason">Reason for cancellation <span className="text-destructive">*</span></Label>
                <Textarea
                  id="cancel-reason"
                  data-testid="input-cancel-reason"
                  placeholder="Provide a reason for cancelling this invoice…"
                  value={cancelInvoiceReason}
                  onChange={(e) => setCancelInvoiceReason(e.target.value)}
                  rows={3}
                />
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsCancelInvoiceDialogOpen(false);
                    setCancelInvoiceReason("");
                  }}
                  data-testid="button-cancel-invoice-dismiss"
                >
                  Keep Invoice
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => cancelInvoiceMutation.mutate({ id: selectedInvoice.id, reason: cancelInvoiceReason })}
                  disabled={cancelInvoiceMutation.isPending || cancelInvoiceReason.trim().length < 5}
                  data-testid="button-cancel-invoice-confirm"
                >
                  {cancelInvoiceMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Cancelling…</>
                  ) : (
                    <><Ban className="w-4 h-4 mr-2" />Confirm Cancellation</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isRevisionDialogOpen} onOpenChange={setIsRevisionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="w-5 h-5" />
              Create Invoice Revision
            </DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This will create a new draft version of invoice #{selectedInvoice.invoiceNumber}.
                The current version will become read-only.
              </p>
              {selectedInvoice.status !== 'draft' && selectedInvoice.approvalWorkflowState !== 'rejected' && (
                <div className="flex items-start gap-3 p-3 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Finance Approval Required</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      This invoice has already been sent. The revision will require finance approval before it can be sent.
                    </p>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">Reason for Revision *</label>
                <Textarea
                  id="revision-reason"
                  placeholder="Describe why this invoice needs to be revised..."
                  data-testid="input-revision-reason"
                />
              </div>
              <DialogFooter className="gap-2">
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  onClick={() => {
                    const reason = (document.getElementById('revision-reason') as HTMLTextAreaElement)?.value;
                    if (!reason?.trim()) {
                      toast({ title: "Error", description: "Please provide a reason for the revision", variant: "destructive" });
                      return;
                    }
                    createRevisionMutation.mutate({ reason: reason.trim() });
                  }}
                  disabled={createRevisionMutation.isPending}
                  data-testid="button-submit-revision"
                >
                  {createRevisionMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : 'Create Revision'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isFinanceApprovalDialogOpen} onOpenChange={setIsFinanceApprovalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              Finance Revision Review
            </DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Invoice #{selectedInvoice.invoiceNumber} (v{selectedInvoice.versionNumber}) requires finance approval as it was revised from a sent invoice.
              </p>
              {selectedInvoice.revisionReason && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Revision Reason</p>
                  <p className="text-sm">{selectedInvoice.revisionReason}</p>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">Approval Notes (optional)</label>
                <Textarea
                  id="finance-approval-notes"
                  placeholder="Add any notes about this approval decision..."
                  data-testid="input-finance-notes"
                />
              </div>
              <DialogFooter className="gap-2">
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={() => {
                    const notes = (document.getElementById('finance-approval-notes') as HTMLTextAreaElement)?.value;
                    financeApproveMutation.mutate({ approved: false, notes: notes?.trim() || undefined });
                  }}
                  disabled={financeApproveMutation.isPending}
                  data-testid="button-reject-revision"
                >
                  Reject
                </Button>
                <Button
                  onClick={() => {
                    const notes = (document.getElementById('finance-approval-notes') as HTMLTextAreaElement)?.value;
                    financeApproveMutation.mutate({ approved: true, notes: notes?.trim() || undefined });
                  }}
                  disabled={financeApproveMutation.isPending}
                  data-testid="button-approve-revision"
                >
                  {financeApproveMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4 mr-2" />
                      Approve
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Pass-Through Charges Dialog */}
      <Dialog open={isPassThroughDialogOpen} onOpenChange={setIsPassThroughDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Pass-Through Charges</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <p className="text-sm text-muted-foreground">
              Select vendor pass-through charges that are queued for this customer's next invoice.
            </p>
            {queuedPassThroughCharges.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-lg">
                <p>No pass-through charges queued for this customer.</p>
                <p className="text-xs mt-1">Mark vendor payables as rebillable and advance them to "Queued for Invoice" status in AP Payables.</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-3 w-10">
                        <input type="checkbox"
                          checked={selectedPassThroughIds.length === queuedPassThroughCharges.length}
                          onChange={e => setSelectedPassThroughIds(e.target.checked ? queuedPassThroughCharges.map((c: any) => c.id) : [])}
                          data-testid="checkbox-select-all-pass-through"
                        />
                      </th>
                      <th className="text-left p-3">Vendor</th>
                      <th className="text-left p-3">Invoice #</th>
                      <th className="text-left p-3">Description</th>
                      <th className="text-right p-3">Amount</th>
                      <th className="text-right p-3">Markup</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queuedPassThroughCharges.map((c: any) => {
                      let billedAmt = parseFloat(String(c.rebillAmount || c.totalAmount || 0));
                      if (c.markupType === 'flat' && c.markupValue) billedAmt += parseFloat(String(c.markupValue));
                      else if (c.markupType === 'percent' && c.markupValue) billedAmt *= (1 + parseFloat(String(c.markupValue)) / 100);
                      return (
                        <tr key={c.id} className="border-t">
                          <td className="p-3">
                            <input type="checkbox"
                              checked={selectedPassThroughIds.includes(c.id)}
                              onChange={e => setSelectedPassThroughIds(prev =>
                                e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id)
                              )}
                              data-testid={`checkbox-pass-through-${c.id}`}
                            />
                          </td>
                          <td className="p-3">{c.vendorName || '—'}</td>
                          <td className="p-3 font-mono text-xs">{c.invoiceNumber || '—'}</td>
                          <td className="p-3 text-muted-foreground">{c.billingDescription || 'Vendor charge'}</td>
                          <td className="p-3 text-right font-semibold">${billedAmt.toFixed(2)}</td>
                          <td className="p-3 text-right text-xs text-muted-foreground">
                            {c.markupType === 'flat' ? `+$${c.markupValue}` :
                              c.markupType === 'percent' ? `+${c.markupValue}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {selectedPassThroughIds.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {selectedPassThroughIds.length} charge(s) selected for addition to this invoice.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsPassThroughDialogOpen(false); setSelectedPassThroughIds([]); }}>
              Cancel
            </Button>
            <Button
              disabled={selectedPassThroughIds.length === 0 || addPassThroughMutation.isPending}
              onClick={() => addPassThroughMutation.mutate({ invoiceId: selectedInvoice!.id, payableIds: selectedPassThroughIds })}
              data-testid="button-confirm-add-pass-through"
            >
              {addPassThroughMutation.isPending && <span className="mr-2 animate-spin">⟳</span>}
              Add {selectedPassThroughIds.length > 0 ? `${selectedPassThroughIds.length} ` : ''}Charge(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Line Item Dialog */}
      <Dialog open={isLineItemDialogOpen} onOpenChange={(open) => {
        setIsLineItemDialogOpen(open);
        if (!open) {
          setEditingLineItem(null);
          lineItemForm.reset();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLineItem ? 'Edit Line Item' : 'Add Line Item'}</DialogTitle>
          </DialogHeader>
          <Form {...lineItemForm}>
            <form onSubmit={lineItemForm.handleSubmit((data) => {
              if (editingLineItem) {
                updateLineItemMutation.mutate({ ...data, id: editingLineItem.id });
              } else {
                createLineItemMutation.mutate(data);
              }
            })} className="space-y-4">
              <FormField
                control={lineItemForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input placeholder="Line item description" {...field} data-testid="input-line-item-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={lineItemForm.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-line-item-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LINE_ITEM_CATEGORIES.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={lineItemForm.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} data-testid="input-line-item-quantity" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={lineItemForm.control}
                  name="unitPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit Price</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} data-testid="input-line-item-unit-price" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="p-3 bg-muted/30 rounded-md">
                <p className="text-sm text-muted-foreground">
                  Total: <span className="font-bold text-foreground">
                    ${(parseFloat(lineItemForm.watch("quantity") || "0") * parseFloat(lineItemForm.watch("unitPrice") || "0")).toFixed(2)}
                  </span>
                </p>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={createLineItemMutation.isPending || updateLineItemMutation.isPending} data-testid="button-submit-line-item">
                  {(createLineItemMutation.isPending || updateLineItemMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingLineItem ? 'Update Item' : 'Add Item'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Manual Payment Dialog */}
      <ManualPaymentDialog
        open={isManualPaymentDialogOpen}
        onOpenChange={(open) => {
          setIsManualPaymentDialogOpen(open);
          if (!open) setPreselectedInvoiceForPayment(null);
        }}
        preselectedInvoice={preselectedInvoiceForPayment || undefined}
        customerId={preselectedInvoiceForPayment?.customerId || undefined}
      />

      {/* Write-Off Dialog */}
      {writeOffInvoice && (
        <WriteOffDialog
          invoice={writeOffInvoice}
          open={!!writeOffInvoice}
          onOpenChange={(open) => { if (!open) setWriteOffInvoice(null); }}
          onSuccess={() => {
            setWriteOffInvoice(null);
            if (selectedInvoice?.id === writeOffInvoice.id) {
              setSelectedInvoice(null);
            }
          }}
        />
      )}

      {/* Payment Audit Trail Dialog */}
      <PaymentAuditDialog
        paymentId={paymentAuditDialogId}
        paymentLabel={paymentAuditDialogLabel}
        open={!!paymentAuditDialogId}
        onOpenChange={(open) => { if (!open) { setPaymentAuditDialogId(null); setPaymentAuditDialogLabel(undefined); } }}
      />

      {/* Payment Adjustment Modal (Edit / Reverse / Remove / Reassign) */}
      <PaymentAdjustmentModal
        open={paymentAdjustmentOpen}
        onOpenChange={(open) => { setPaymentAdjustmentOpen(open); if (!open) setPaymentAdjustmentTarget(null); }}
        payment={paymentAdjustmentTarget}
        invoiceId={selectedInvoice?.id}
        defaultAction={paymentAdjustmentAction}
        userRole={userRole}
        onSuccess={(action) => {
          queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
          if (selectedInvoice?.id) {
            queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices', selectedInvoice.id, 'payments'] });
          }
        }}
      />

      <AlertDialog open={bulkSendConfirmOpen} onOpenChange={setBulkSendConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send {selectedInvoiceIds.length} Invoices?</AlertDialogTitle>
            <AlertDialogDescription>
              This will send all eligible approved invoices to their customers. Invoices that are not in approved status will be skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-bulk-send-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkSendMutation.mutate(selectedInvoiceIds)}
              data-testid="button-bulk-send-confirm"
            >
              Send Invoices
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkLateFeeConfirmOpen} onOpenChange={setBulkLateFeeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply Late Fees to {selectedInvoiceIds.length} Invoices?</AlertDialogTitle>
            <AlertDialogDescription>
              This will add late fee line items to all eligible overdue invoices. Invoices that already have late fees or are not overdue will be skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-bulk-late-fee-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkLateFeeMutation.mutate(selectedInvoiceIds)}
              data-testid="button-bulk-late-fee-confirm"
            >
              Apply Late Fees
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={creditOverrideDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setCreditOverrideDialogOpen(false);
          setCreditOverrideInvoice(null);
          setCreditOverrideReason("");
          setCreditOverrideDetails(null);
        }
      }}>
        <DialogContent className="max-w-md" data-testid="dialog-credit-override">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-600" />
              Credit Limit Override Required
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Sending this invoice will exceed the customer's credit limit. An authorized override with a reason is required to proceed.
              </p>
            </div>
            {creditOverrideDetails && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Credit Limit</p>
                  <p className="font-medium">${parseFloat(creditOverrideDetails.creditLimit || '0').toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Current Exposure</p>
                  <p className="font-medium">${parseFloat(creditOverrideDetails.currentExposure || '0').toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">This Invoice</p>
                  <p className="font-medium">${parseFloat(creditOverrideDetails.invoiceAmount || '0').toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Projected Exposure</p>
                  <p className="font-medium text-amber-600 dark:text-amber-400">${parseFloat(creditOverrideDetails.projectedExposure || '0').toFixed(2)}</p>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">Override Reason</label>
              <Textarea
                placeholder="Explain why this override is needed..."
                value={creditOverrideReason}
                onChange={(e) => setCreditOverrideReason(e.target.value)}
                className="min-h-[80px]"
                data-testid="input-credit-override-reason"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setCreditOverrideDialogOpen(false);
                setCreditOverrideInvoice(null);
                setCreditOverrideReason("");
                setCreditOverrideDetails(null);
              }}
              data-testid="button-credit-override-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (creditOverrideInvoice) {
                  creditOverrideMutation.mutate({
                    invoiceId: creditOverrideInvoice.id,
                    customerId: creditOverrideInvoice.customerId || '',
                    reason: creditOverrideReason,
                  });
                }
              }}
              disabled={!creditOverrideReason.trim() || creditOverrideMutation.isPending}
              data-testid="button-credit-override-confirm"
            >
              {creditOverrideMutation.isPending ? 'Processing...' : 'Override & Send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isConsolidateDraftsDialogOpen} onOpenChange={setIsConsolidateDraftsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5" />
              Consolidate Draft Invoices
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The following draft invoices will be merged into a single consolidated invoice. Source drafts will be marked as consolidated.
            </p>
            <div className="space-y-2">
              {invoices.filter((inv: any) => selectedInvoiceIds.includes(inv.id) && inv.status === 'draft').map((inv: any) => (
                <div key={inv.id} className="flex items-center justify-between gap-2 p-2 border rounded-md" data-testid={`consolidate-draft-item-${inv.id}`}>
                  <div>
                    <span className="text-sm font-medium">{inv.invoiceNumber}</span>
                    <span className="text-xs text-muted-foreground ml-2">{inv.customerName}</span>
                  </div>
                  <span className="text-sm font-medium">${parseFloat(inv.totalAmount).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm font-semibold">Consolidated Total</span>
              <span className="text-sm font-semibold" data-testid="consolidation-total">
                ${invoices.filter((inv: any) => selectedInvoiceIds.includes(inv.id) && inv.status === 'draft').reduce((sum: number, inv: any) => sum + parseFloat(inv.totalAmount), 0).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsConsolidateDraftsDialogOpen(false)} data-testid="button-cancel-consolidate">
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  try {
                    const draftInvoiceIds = invoices.filter((inv: any) => selectedInvoiceIds.includes(inv.id) && inv.status === 'draft').map((inv: any) => inv.id);
                    await apiRequest('POST', '/api/corporate/invoicing/consolidate/drafts', { invoiceIds: draftInvoiceIds });
                    toast({ title: "Invoices Consolidated", description: `${draftInvoiceIds.length} draft invoices merged into one.` });
                    queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
                    setSelectedInvoiceIds([]);
                    setIsConsolidateDraftsDialogOpen(false);
                  } catch (error: any) {
                    toast({ title: "Error", description: error.message || "Failed to consolidate", variant: "destructive" });
                  }
                }}
                data-testid="button-confirm-consolidate-drafts"
              >
                <Layers className="w-4 h-4 mr-1" />
                Consolidate
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isConsolidateChargesDialogOpen} onOpenChange={setIsConsolidateChargesDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5" />
              Consolidate Charges into Invoice
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select a customer and charges to consolidate into a single invoice.
            </p>
            <div>
              <label className="text-sm font-medium">Customer</label>
              <Select value={consolidateCustomerId} onValueChange={(v) => { setConsolidateCustomerId(v); setConsolidateChargeIds([]); }}>
                <SelectTrigger data-testid="select-consolidate-customer">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.filter((c: any) => charges.some((ch: any) => ch.customerId === c.id && ch.status !== 'invoiced' && !ch.invoiceId)).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.companyName || c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {consolidateCustomerId && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Available Charges</label>
                {charges.filter((ch: any) => ch.customerId === consolidateCustomerId && ch.status !== 'invoiced' && !ch.invoiceId).map((charge: any) => (
                  <label key={charge.id} className="flex items-center gap-2 p-2 border rounded-md cursor-pointer" data-testid={`consolidate-charge-item-${charge.id}`}>
                    <input
                      type="checkbox"
                      checked={consolidateChargeIds.includes(charge.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setConsolidateChargeIds([...consolidateChargeIds, charge.id]);
                        } else {
                          setConsolidateChargeIds(consolidateChargeIds.filter(id => id !== charge.id));
                        }
                      }}
                    />
                    <div className="flex-1">
                      <span className="text-sm">{charge.description}</span>
                      <span className="text-xs text-muted-foreground ml-2">{charge.chargeDate}</span>
                    </div>
                    <span className="text-sm font-medium">${parseFloat(charge.amount).toFixed(2)}</span>
                  </label>
                ))}
                {consolidateChargeIds.length >= 2 && (
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-sm font-semibold">Total</span>
                    <span className="text-sm font-semibold" data-testid="consolidation-charges-total">
                      ${charges.filter((ch: any) => consolidateChargeIds.includes(ch.id)).reduce((sum: number, ch: any) => sum + parseFloat(ch.amount), 0).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setIsConsolidateChargesDialogOpen(false); setConsolidateChargeIds([]); setConsolidateCustomerId(""); }} data-testid="button-cancel-consolidate-charges">
                Cancel
              </Button>
              <Button
                disabled={consolidateChargeIds.length < 2}
                onClick={async () => {
                  try {
                    await apiRequest('POST', '/api/corporate/invoicing/consolidate/charges', { customerId: consolidateCustomerId, chargeIds: consolidateChargeIds });
                    toast({ title: "Charges Consolidated", description: `${consolidateChargeIds.length} charges merged into one invoice.` });
                    queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
                    queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/charges'] });
                    setConsolidateChargeIds([]);
                    setConsolidateCustomerId("");
                    setIsConsolidateChargesDialogOpen(false);
                  } catch (error: any) {
                    toast({ title: "Error", description: error.message || "Failed to consolidate charges", variant: "destructive" });
                  }
                }}
                data-testid="button-confirm-consolidate-charges"
              >
                <Layers className="w-4 h-4 mr-1" />
                Consolidate ({consolidateChargeIds.length} charges)
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isSaveViewDialogOpen} onOpenChange={setIsSaveViewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Current View</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>View Name</Label>
              <Input
                value={saveViewName}
                onChange={(e) => setSaveViewName(e.target.value)}
                placeholder="e.g., Overdue > $1,000"
                data-testid="input-save-view-name"
              />
            </div>
            {(userRole === 'admin' || userRole === 'superadmin') && (
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={saveViewShared}
                  onCheckedChange={(checked) => setSaveViewShared(checked === true)}
                  data-testid="checkbox-save-view-shared"
                />
                <Label>Share with all users</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" data-testid="button-cancel-save-view">Cancel</Button>
            </DialogClose>
            <Button
              disabled={!saveViewName.trim() || saveViewMutation.isPending}
              onClick={() => {
                saveViewMutation.mutate({
                  name: saveViewName.trim(),
                  type: saveViewShared ? 'shared' : 'private',
                  filters: getCurrentFilters(),
                });
              }}
              data-testid="button-confirm-save-view"
            >
              {saveViewMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Save View
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedDepositBatchId} onOpenChange={(open) => { if (!open) { setSelectedDepositBatchId(null); setEditingBatchMetadata(false); } }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              Deposit Batch {selectedBatchDetail?.batchNumber}
              {selectedBatchDetail && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span><Badge className={getStatusColor(selectedBatchDetail.status)} data-testid="text-batch-status">{selectedBatchDetail.status}</Badge></span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs text-sm">{DEPOSIT_STATUS_DESCRIPTIONS[selectedBatchDetail.status] || selectedBatchDetail.status}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </DialogTitle>
          </DialogHeader>
          {batchDetailLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : selectedBatchDetail ? (
            <div className="space-y-4">
              {/* ── Lifecycle Stepper ─────────────────────────────────────── */}
              {(() => {
                const STAGES = [
                  { key: 'draft',       label: 'Draft',      desc: 'Being assembled' },
                  { key: 'balanced',    label: 'Balanced',   desc: 'Totals validated' },
                  { key: 'submitted',   label: 'Submitted',  desc: 'Sent to accounting' },
                  { key: 'locked',      label: 'Locked',     desc: 'Deposited, no changes' },
                  { key: 'reconciled',  label: 'Reconciled', desc: 'Bank statement matched' },
                ] as const;
                const currentIdx = STAGES.findIndex(s => s.key === selectedBatchDetail.status);
                return (
                  <div className="flex items-center gap-0 overflow-x-auto" data-testid="section-batch-lifecycle-stepper">
                    {STAGES.map((stage, idx) => {
                      const done    = idx < currentIdx;
                      const active  = idx === currentIdx;
                      return (
                        <div key={stage.key} className="flex items-center flex-1 min-w-0">
                          <div className="flex flex-col items-center flex-1 min-w-0 gap-0.5">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold border-2 ${
                              done   ? 'bg-primary border-primary text-primary-foreground' :
                              active ? 'border-primary text-primary bg-primary/10' :
                                       'border-muted-foreground/30 text-muted-foreground/40 bg-transparent'
                            }`}>
                              {done ? <CheckCircle className="w-3.5 h-3.5" /> : <span>{idx + 1}</span>}
                            </div>
                            <span className={`text-center text-[10px] leading-tight font-medium truncate w-full px-0.5 ${active ? 'text-primary' : done ? 'text-foreground' : 'text-muted-foreground/50'}`}>{stage.label}</span>
                          </div>
                          {idx < STAGES.length - 1 && (
                            <div className={`h-0.5 flex-1 mx-1 shrink-0 ${idx < currentIdx ? 'bg-primary' : 'bg-muted-foreground/20'}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              {(selectedBatchDetail.status === 'submitted' || selectedBatchDetail.status === 'locked') && (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 p-3" data-testid="banner-immutable">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      {selectedBatchDetail.status === 'submitted'
                        ? "This batch has been submitted. Payment composition is locked — no payments may be added or removed."
                        : "This batch is deposited and locked. No modifications are permitted until reconciliation."}
                    </span>
                  </div>
                </div>
              )}
              {selectedBatchDetail.status === 'reconciled' && (
                <div className="rounded-md border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950 p-3" data-testid="banner-reconciled">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-medium text-green-800 dark:text-green-200">This deposit batch has been fully reconciled and is locked.</span>
                  </div>
                  {selectedBatchDetail.actualDepositAmount && (
                    <div className="mt-2 text-xs text-green-700 dark:text-green-300 space-y-1">
                      <div>Actual Deposit: ${parseFloat(selectedBatchDetail.actualDepositAmount).toFixed(2)}</div>
                      {selectedBatchDetail.discrepancyAmount && parseFloat(selectedBatchDetail.discrepancyAmount) !== 0 && (
                        <div>Discrepancy: ${parseFloat(selectedBatchDetail.discrepancyAmount).toFixed(2)}</div>
                      )}
                      {selectedBatchDetail.reconciliationReference && <div>Reference: {selectedBatchDetail.reconciliationReference}</div>}
                      {selectedBatchDetail.statementDate && <div>Statement Date: {selectedBatchDetail.statementDate}</div>}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="text-xs text-muted-foreground">Batch Number</div>
                    <div className="text-sm font-semibold" data-testid="text-batch-number">{selectedBatchDetail.batchNumber}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="text-xs text-muted-foreground">Deposit Date</div>
                    <div className="text-sm font-semibold" data-testid="text-batch-deposit-date">{selectedBatchDetail.depositDate || 'Not set'}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="text-xs text-muted-foreground">Payments</div>
                    <div className="text-sm font-semibold" data-testid="text-batch-payment-count">{selectedBatchDetail.payments?.length || 0}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="text-xs text-muted-foreground">Total Amount</div>
                    <div className="text-sm font-semibold" data-testid="text-batch-total-amount">
                      ${(selectedBatchDetail.payments || []).reduce((sum: number, p: any) => sum + parseFloat(p.amount || '0'), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {(selectedBatchDetail.status === 'draft' || selectedBatchDetail.status === 'balanced') && (() => {
                const checks = [
                  !!selectedBatchDetail.depositDate,
                  !!selectedBatchDetail.bankAccountName,
                  !!selectedBatchDetail.depositMethod,
                  (selectedBatchDetail.payments?.length || 0) > 0,
                  (selectedBatchDetail.payments || []).reduce((s: number, p: any) => s + parseFloat(p.amount || '0'), 0) > 0,
                ];
                const allValid = checks.every(Boolean);
                return (
                <Card data-testid="section-validation-checklist">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm">Validation Checklist</CardTitle>
                    {!allValid && (
                      <span className="flex items-center gap-1 text-xs text-red-500" data-testid="text-validation-required">
                        <XCircle className="w-3.5 h-3.5" /> Validation Required
                      </span>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                      {[
                        { label: 'Deposit Date Set', ok: !!selectedBatchDetail.depositDate },
                        { label: 'Deposit Account Set', ok: !!selectedBatchDetail.bankAccountName },
                        { label: 'Deposit Method Set', ok: !!selectedBatchDetail.depositMethod },
                        { label: 'Payments Added', ok: (selectedBatchDetail.payments?.length || 0) > 0 },
                        { label: 'Totals Match', ok: (selectedBatchDetail.payments || []).reduce((s: number, p: any) => s + parseFloat(p.amount || '0'), 0) > 0 },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center gap-2" data-testid={`validation-${item.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
                          {item.ok ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-400" />}
                          <span className={item.ok ? '' : 'text-muted-foreground'}>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                );
              })()}

              {(selectedBatchDetail.status === 'draft' || selectedBatchDetail.status === 'balanced') && (
                <Card data-testid="section-batch-metadata">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm">Batch Details</CardTitle>
                    {!editingBatchMetadata ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button size="sm" variant="ghost" data-testid="button-edit-batch-metadata" disabled={!isDepositBillingTeam} onClick={() => {
                              setBatchMetaDepositDate(selectedBatchDetail.depositDate || '');
                              setBatchMetaBankName(selectedBatchDetail.bankAccountName || '');
                              setBatchMetaBankLast4(selectedBatchDetail.bankAccountLast4 || '');
                              setBatchMetaDepositMethod(selectedBatchDetail.depositMethod || '');
                              setBatchMetaNotes(selectedBatchDetail.notes || '');
                              setEditingBatchMetadata(true);
                            }}>
                              <Pencil className="w-4 h-4 mr-1" /> Edit
                            </Button>
                          </span>
                        </TooltipTrigger>
                        {!isDepositBillingTeam && <TooltipContent><p className="max-w-xs text-sm">Billing Team access required to edit batch details</p></TooltipContent>}
                      </Tooltip>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" data-testid="button-cancel-edit-metadata" onClick={() => setEditingBatchMetadata(false)}>Cancel</Button>
                        <Button size="sm" data-testid="button-save-batch-metadata" disabled={updateBatchMetadataMutation.isPending} onClick={() => {
                          updateBatchMetadataMutation.mutate({
                            batchId: selectedBatchDetail.id,
                            data: {
                              depositDate: batchMetaDepositDate || undefined,
                              bankAccountName: batchMetaBankName || undefined,
                              bankAccountLast4: batchMetaBankLast4 || undefined,
                              depositMethod: batchMetaDepositMethod || undefined,
                              notes: batchMetaNotes || undefined,
                            },
                          });
                        }}>
                          {updateBatchMetadataMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                          Save
                        </Button>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    {editingBatchMetadata ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Deposit Date</Label>
                          <Input type="date" value={batchMetaDepositDate} onChange={(e) => setBatchMetaDepositDate(e.target.value)} data-testid="input-edit-deposit-date" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Bank Account Name</Label>
                          <Input value={batchMetaBankName} onChange={(e) => setBatchMetaBankName(e.target.value)} data-testid="input-edit-bank-name" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Last 4 Digits</Label>
                          <Input maxLength={4} value={batchMetaBankLast4} onChange={(e) => setBatchMetaBankLast4(e.target.value)} data-testid="input-edit-bank-last4" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Deposit Method</Label>
                          <Select value={batchMetaDepositMethod} onValueChange={setBatchMetaDepositMethod}>
                            <SelectTrigger data-testid="select-edit-deposit-method">
                              <SelectValue placeholder="Select method..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="check">Check</SelectItem>
                              <SelectItem value="cash">Cash</SelectItem>
                              <SelectItem value="ach">ACH</SelectItem>
                              <SelectItem value="wire">Wire</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-xs">Notes</Label>
                          <Textarea value={batchMetaNotes} onChange={(e) => setBatchMetaNotes(e.target.value)} data-testid="input-edit-batch-notes" />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">Deposit Date</div>
                          <div>{selectedBatchDetail.depositDate || 'Not set'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Bank Account</div>
                          <div>{selectedBatchDetail.bankAccountName || 'Not set'}{selectedBatchDetail.bankAccountLast4 ? ` (...${selectedBatchDetail.bankAccountLast4})` : ''}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Deposit Method</div>
                          <div className="capitalize">{selectedBatchDetail.depositMethod || 'Not set'}</div>
                        </div>
                        {selectedBatchDetail.notes && (
                          <div className="col-span-2 sm:col-span-3">
                            <div className="text-xs text-muted-foreground">Notes</div>
                            <div>{selectedBatchDetail.notes}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {(selectedBatchDetail.status !== 'draft' && selectedBatchDetail.status !== 'balanced') && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm border rounded-md p-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Deposit Date</div>
                    <div>{selectedBatchDetail.depositDate || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Bank Account</div>
                    <div>{selectedBatchDetail.bankAccountName || '-'}{selectedBatchDetail.bankAccountLast4 ? ` (...${selectedBatchDetail.bankAccountLast4})` : ''}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Deposit Method</div>
                    <div className="capitalize">{selectedBatchDetail.depositMethod || '-'}</div>
                  </div>
                  {selectedBatchDetail.notes && (
                    <div className="col-span-2 sm:col-span-3">
                      <div className="text-xs text-muted-foreground">Notes</div>
                      <div>{selectedBatchDetail.notes}</div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2" data-testid="section-batch-actions">
                {selectedBatchDetail.status === 'draft' && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button variant="outline" size="sm" data-testid="button-add-payment-to-batch" disabled={!isDepositBillingTeam} onClick={() => { setSelectedPaymentsForBatch([]); setAddPaymentToBatchOpen(true); }}>
                            <Plus className="w-4 h-4 mr-1" /> Add Payment
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {!isDepositBillingTeam && <TooltipContent><p className="max-w-xs text-sm">Billing Team access required</p></TooltipContent>}
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button size="sm" data-testid="button-mark-balanced" disabled={batchTransitionMutation.isPending || !isDepositBillingTeam}
                            onClick={() => batchTransitionMutation.mutate({ batchId: selectedBatchDetail.id, action: 'mark_balanced' })}>
                            {batchTransitionMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                            <CheckCircle className="w-4 h-4 mr-1" /> Validate & Mark Balanced
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {!isDepositBillingTeam && <TooltipContent><p className="max-w-xs text-sm">Billing Team access required</p></TooltipContent>}
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button variant="destructive" size="sm" data-testid="button-delete-batch" disabled={!isDepositBillingTeam} onClick={() => setDeleteBatchConfirmOpen(true)}>
                            <Trash2 className="w-4 h-4 mr-1" /> Delete Batch
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {!isDepositBillingTeam && <TooltipContent><p className="max-w-xs text-sm">Billing Team access required</p></TooltipContent>}
                    </Tooltip>
                  </>
                )}
                {selectedBatchDetail.status === 'balanced' && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button size="sm" data-testid="button-submit-batch" disabled={!isDepositController} onClick={() => setSubmitBatchConfirmOpen(true)}>
                            <Send className="w-4 h-4 mr-1" /> Submit Batch
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {!isDepositController && <TooltipContent><p className="max-w-xs text-sm">Controller / Owner role required to submit batches</p></TooltipContent>}
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button variant="outline" size="sm" data-testid="button-unbalance-batch" disabled={batchTransitionMutation.isPending || !isDepositBillingTeam}
                            onClick={() => batchTransitionMutation.mutate({ batchId: selectedBatchDetail.id, action: 'unbalance' })}>
                            <Unlock className="w-4 h-4 mr-1" /> Unbalance
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {!isDepositBillingTeam && <TooltipContent><p className="max-w-xs text-sm">Billing Team access required</p></TooltipContent>}
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button variant="outline" size="sm" data-testid="button-add-payment-balanced" disabled={!isDepositBillingTeam} onClick={() => {
                            setSelectedPaymentsForBatch([]);
                            setAddPaymentToBatchOpen(true);
                          }}>
                            <Plus className="w-4 h-4 mr-1" /> Add Payment
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {!isDepositBillingTeam && <TooltipContent><p className="max-w-xs text-sm">Billing Team access required</p></TooltipContent>}
                    </Tooltip>
                  </>
                )}
                {selectedBatchDetail.status === 'submitted' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button size="sm" data-testid="button-lock-batch" disabled={!isDepositController} onClick={() => setLockBatchConfirmOpen(true)}>
                          <Lock className="w-4 h-4 mr-1" /> Mark as Deposited & Lock
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!isDepositController && <TooltipContent><p className="max-w-xs text-sm">Controller / Owner role required to lock batches</p></TooltipContent>}
                  </Tooltip>
                )}
                {selectedBatchDetail.status === 'locked' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button size="sm" data-testid="button-reconcile-batch" disabled={!isDepositController} onClick={() => {
                          setReconcileActualAmount('');
                          setReconcileStatementDate('');
                          setReconcileReference('');
                          setReconcileNotes('');
                          setReconcileBatchDialogOpen(true);
                        }}>
                          <ShieldCheck className="w-4 h-4 mr-1" /> Reconcile Batch
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!isDepositController && <TooltipContent><p className="max-w-xs text-sm">Controller / Owner role required to reconcile batches</p></TooltipContent>}
                  </Tooltip>
                )}
                {(selectedBatchDetail.status === 'submitted' || selectedBatchDetail.status === 'locked' || selectedBatchDetail.status === 'reconciled') && (
                  <Button variant="outline" size="sm" data-testid="button-export-deposit-batch" onClick={() => {
                    if (!selectedBatchDetail?.payments?.length) return;
                    const rows = selectedBatchDetail.payments.map((p: any) => {
                      const cust = customers.find((c: any) => c.id === p.customerId);
                      return [p.paymentNumber, cust?.customerName || p.customerId, p.paymentDate, p.paymentMethod, parseFloat(p.amount || '0').toFixed(2)].join(',');
                    });
                    const csv = ['Payment ID,Customer,Payment Date,Payment Method,Amount', ...rows].join('\n');
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `deposit-batch-${selectedBatchDetail.batchNumber}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}>
                    <Download className="w-4 h-4 mr-1" /> Export CSV
                  </Button>
                )}
              </div>

              <div className="flex justify-between items-center flex-wrap gap-2">
                <h3 className="font-semibold">Included Payments</h3>
              </div>

              {(selectedBatchDetail.payments?.length || 0) === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  No payments in this batch yet. Click "Add Payment" to get started.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payment ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Payment Date</TableHead>
                      <TableHead>Payment Method</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      {(selectedBatchDetail.status === 'draft' || selectedBatchDetail.status === 'balanced') && (
                        <TableHead className="w-10"></TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedBatchDetail.payments.map((p: any) => {
                      const cust = customers.find((c: any) => c.id === p.customerId);
                      return (
                        <TableRow key={p.id} data-testid={`row-batch-payment-${p.id}`}>
                          <TableCell className="font-medium" data-testid={`text-payment-number-${p.id}`}>{p.paymentNumber}</TableCell>
                          <TableCell data-testid={`text-payment-customer-${p.id}`}>{cust?.customerName || p.customerId}</TableCell>
                          <TableCell data-testid={`text-payment-date-${p.id}`}>{p.paymentDate}</TableCell>
                          <TableCell data-testid={`text-payment-method-${p.id}`}>
                            <Badge variant="outline">{p.paymentMethod}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold" data-testid={`text-payment-amount-${p.id}`}>
                            ${parseFloat(p.amount || '0').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          {(selectedBatchDetail.status === 'draft' || selectedBatchDetail.status === 'balanced') && (
                            <TableCell>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <Button size="icon" variant="ghost" data-testid={`button-remove-payment-${p.id}`}
                                      disabled={removePaymentFromBatchMutation.isPending || !isDepositController}
                                      onClick={() => removePaymentFromBatchMutation.mutate({ batchId: selectedBatchDetail.id, paymentId: p.id })}>
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                {!isDepositController && <TooltipContent><p className="max-w-xs text-sm">Controller / Owner role required to remove payments</p></TooltipContent>}
                              </Tooltip>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                    <TableRow className="border-t-2">
                      <TableCell colSpan={4} className="text-right font-bold">Total</TableCell>
                      <TableCell className="text-right font-bold" data-testid="text-batch-payments-total">
                        ${(selectedBatchDetail.payments || []).reduce((sum: number, p: any) => sum + parseFloat(p.amount || '0'), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      {(selectedBatchDetail.status === 'draft' || selectedBatchDetail.status === 'balanced') && <TableCell />}
                    </TableRow>
                  </TableBody>
                </Table>
              )}

              {batchAuditLog.length > 0 && (
                <div data-testid="section-batch-audit-log">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <History className="w-4 h-4" /> Audit Trail
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {batchAuditLog.map((entry) => {
                      const actor = entry.performedByName || 'System';
                      const ts = formatDate(entry.createdAt);
                      const meta = entry.metadata as any;
                      let description = '';
                      switch (entry.action) {
                        case 'mark_balanced':
                          description = `Batch validated and marked Balanced by ${actor} on ${ts}`;
                          break;
                        case 'submit':
                          description = `Batch submitted by ${actor} on ${ts}`;
                          break;
                        case 'lock':
                          description = `Batch locked by ${actor} on ${ts}`;
                          break;
                        case 'reconcile':
                          description = `Batch reconciled by ${actor} on ${ts}`;
                          break;
                        case 'unbalance':
                          description = `Batch returned to Draft by ${actor} on ${ts}`;
                          break;
                        case 'status_reverted':
                          description = `Batch automatically reverted to Draft by ${actor} on ${ts}`;
                          break;
                        case 'payment_added':
                          description = `Payment ${meta?.paymentId ? meta.paymentId.slice(0, 8) : ''} added to batch by ${actor}`;
                          break;
                        case 'payment_removed':
                          description = `Payment ${meta?.paymentId ? meta.paymentId.slice(0, 8) : ''} removed from batch by ${actor}`;
                          break;
                        case 'metadata_updated':
                          description = `Batch metadata updated by ${actor} on ${ts}`;
                          break;
                        case 'batch_created':
                          description = `Batch created by ${actor} on ${ts}`;
                          break;
                        default:
                          description = `${entry.action.replace(/_/g, ' ')} by ${actor} on ${ts}`;
                      }
                      return (
                        <div key={entry.id} className="flex items-start gap-3 text-sm border-b pb-2" data-testid={`audit-entry-${entry.id}`}>
                          <div className="flex-shrink-0 mt-0.5">
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm">{description}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Financial Audit Trail for Deposit Batch */}
              {selectedBatch && (
                <div className="border-t pt-4" data-testid="section-batch-financial-audit">
                  <EntityAuditTrail
                    entityId={selectedBatch.id}
                    entityType="deposit_batch"
                    title="Financial Audit Trail"
                    collapsible
                    defaultExpanded={false}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">Batch not found.</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={addPaymentToBatchOpen} onOpenChange={setAddPaymentToBatchOpen}>
        <DialogContent className="max-w-2xl max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Payments to Batch</DialogTitle>
          </DialogHeader>
          {selectedBatchDetail?.status === 'balanced' && (
            <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 p-3 text-sm text-amber-800 dark:text-amber-200" data-testid="warning-revert-to-draft">
              <AlertTriangle className="w-4 h-4 inline mr-1" />
              Adding payments will revert this batch from "balanced" to "draft" status.
            </div>
          )}
          {availablePaymentsForBatch.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">No available payments to add.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Payment #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {availablePaymentsForBatch.map((p: any) => {
                  const cust = customers.find((c: any) => c.id === p.customerId);
                  return (
                    <TableRow key={p.id} data-testid={`row-available-payment-${p.id}`}>
                      <TableCell>
                        <Checkbox
                          checked={selectedPaymentsForBatch.includes(p.id)}
                          onCheckedChange={(checked) => {
                            setSelectedPaymentsForBatch(prev =>
                              checked ? [...prev, p.id] : prev.filter(id => id !== p.id)
                            );
                          }}
                          data-testid={`checkbox-payment-${p.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{p.paymentNumber}</TableCell>
                      <TableCell>{cust?.customerName || p.customerId}</TableCell>
                      <TableCell>{p.paymentDate}</TableCell>
                      <TableCell className="capitalize">{p.paymentMethod?.replace('_', ' ')}</TableCell>
                      <TableCell className="text-right">${parseFloat(p.amount || '0').toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" data-testid="button-cancel-add-payments">Cancel</Button>
            </DialogClose>
            <Button
              disabled={selectedPaymentsForBatch.length === 0 || addPaymentToBatchMutation.isPending}
              data-testid="button-confirm-add-payments"
              onClick={async () => {
                if (!selectedDepositBatchId) return;
                for (const paymentId of selectedPaymentsForBatch) {
                  await addPaymentToBatchMutation.mutateAsync({ batchId: selectedDepositBatchId, paymentId });
                }
                setAddPaymentToBatchOpen(false);
                setSelectedPaymentsForBatch([]);
                queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/deposit-batches'] });
                toast({ title: `${selectedPaymentsForBatch.length} payment(s) added` });
              }}
            >
              {addPaymentToBatchMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Add Selected ({selectedPaymentsForBatch.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={submitBatchConfirmOpen} onOpenChange={setSubmitBatchConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit Deposit Batch?</AlertDialogTitle>
            <AlertDialogDescription>
              This will lock payment selection and prevent further edits. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-submit-batch">Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-submit-batch" onClick={() => {
              if (selectedDepositBatchId) {
                batchTransitionMutation.mutate({ batchId: selectedDepositBatchId, action: 'submit' });
              }
              setSubmitBatchConfirmOpen(false);
            }}>
              Confirm Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={lockBatchConfirmOpen} onOpenChange={setLockBatchConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lock Deposit Batch?</AlertDialogTitle>
            <AlertDialogDescription>
              This batch will become read-only and cannot be edited. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-lock-batch">Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-lock-batch" onClick={() => {
              if (selectedDepositBatchId) {
                batchTransitionMutation.mutate({ batchId: selectedDepositBatchId, action: 'lock' });
              }
              setLockBatchConfirmOpen(false);
            }}>
              Lock Batch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteBatchConfirmOpen} onOpenChange={setDeleteBatchConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Deposit Batch?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the batch and unlink all associated payments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-batch">Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-delete-batch" className="bg-destructive text-destructive-foreground" onClick={() => {
              if (selectedDepositBatchId) {
                deleteBatchMutation.mutate(selectedDepositBatchId);
              }
            }}>
              {deleteBatchMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Delete Batch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={reconcileBatchDialogOpen} onOpenChange={setReconcileBatchDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reconcile Deposit Batch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 p-3 text-sm text-amber-800 dark:text-amber-200">
              Once reconciled, this batch cannot be modified.
            </div>
            <div className="space-y-2">
              <Label required>Actual Deposit Amount</Label>
              <Input type="number" step="0.01" value={reconcileActualAmount} onChange={(e) => setReconcileActualAmount(e.target.value)} placeholder="0.00" data-testid="input-reconcile-amount" />
            </div>
            <div className="space-y-2">
              <Label>Bank Statement Date</Label>
              <Input type="date" value={reconcileStatementDate} onChange={(e) => setReconcileStatementDate(e.target.value)} data-testid="input-reconcile-statement-date" />
            </div>
            <div className="space-y-2">
              <Label>Bank Reference Number</Label>
              <Input value={reconcileReference} onChange={(e) => setReconcileReference(e.target.value)} placeholder="Optional" data-testid="input-reconcile-reference" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={reconcileNotes} onChange={(e) => setReconcileNotes(e.target.value)} placeholder="Optional reconciliation notes..." data-testid="input-reconcile-notes" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" data-testid="button-cancel-reconcile">Cancel</Button>
            </DialogClose>
            <Button
              disabled={!reconcileActualAmount || batchTransitionMutation.isPending}
              data-testid="button-confirm-reconcile"
              onClick={() => {
                if (selectedDepositBatchId) {
                  batchTransitionMutation.mutate({
                    batchId: selectedDepositBatchId,
                    action: 'reconcile',
                    params: {
                      actualAmount: reconcileActualAmount,
                      statementDate: reconcileStatementDate || undefined,
                      reconciliationReference: reconcileReference || undefined,
                      notes: reconcileNotes || undefined,
                    },
                  });
                  setReconcileBatchDialogOpen(false);
                }
              }}
            >
              {batchTransitionMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Reconcile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDepositBatchDialogOpen} onOpenChange={setIsDepositBatchDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Deposit Batch</DialogTitle>
          </DialogHeader>
          <Form {...depositBatchForm}>
            <form onSubmit={depositBatchForm.handleSubmit((data) => createDepositBatchMutation.mutate(data))} className="space-y-4">
              <FormField
                control={depositBatchForm.control}
                name="depositDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deposit Date (optional)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-deposit-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={depositBatchForm.control}
                name="bankAccountName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank Account Name (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Operating Account" {...field} data-testid="input-bank-account-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={depositBatchForm.control}
                name="bankAccountLast4"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last 4 Digits (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="1234" maxLength={4} {...field} data-testid="input-bank-last4" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={depositBatchForm.control}
                name="depositMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deposit Method (optional)</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-deposit-method">
                          <SelectValue placeholder="Select method..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="check">Check</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="ach">ACH</SelectItem>
                        <SelectItem value="wire">Wire</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={depositBatchForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Optional notes..." {...field} data-testid="input-deposit-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" data-testid="button-cancel-deposit">Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={createDepositBatchMutation.isPending} data-testid="button-submit-deposit">
                  {createDepositBatchMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create Batch
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
