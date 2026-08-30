import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Zap, ChevronDown, ChevronRight, Eye, RefreshCw, Plus,
  Loader2, AlertTriangle, CheckCircle2, DollarSign, FileText,
  Trash2, Package, ShieldCheck, RotateCcw, Sparkles, Calendar, Clock, FilePlus,
  Settings, Lock, Info, Globe, CalendarDays, PlayCircle, Activity, Users, Truck,
  Pencil, Tag, AlertCircle, X, Filter, CheckSquare, CalendarCheck,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { PRODUCT_REVENUE_CATEGORIES, PRODUCT_REVENUE_CATEGORY_LABELS, PRODUCT_TYPE_LABELS, BILLING_FREQUENCY_LABELS } from "@shared/schema";
import { WeeklyBillingControlPanel } from "@/components/billing/WeeklyBillingControlPanel";

// ─── Constants ────────────────────────────────────────────────────────────────
const SOURCE_TYPE_LABELS: Record<string, string> = {
  manual: "Manual",
  move: "Move",
  labor: "Labor",
  rideshare: "Rideshare",
  recurring_schedule: "Recurring",
  timesheet: "Timesheet",
  expense: "Expense",
  trip: "Trip",
};

const SOURCE_TYPE_COLORS: Record<string, string> = {
  manual: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  move: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  labor: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  rideshare: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  recurring_schedule: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
  timesheet: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  expense: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
  trip: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
};

const CHARGE_SOURCE_LABELS: Record<string, string> = {
  scheduling: "Scheduling",
  moves: "Moves",
  rideshare: "Rideshare",
  recurring: "Recurring",
  manual: "Manual",
  api: "API",
};
const CHARGE_SOURCE_COLORS: Record<string, string> = {
  scheduling: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  moves: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  rideshare: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  recurring: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  manual: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  api: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
};

const REVENUE_CATEGORY_LABELS = { ...PRODUCT_REVENUE_CATEGORY_LABELS, uncategorized: "Uncategorized" };
const REVENUE_CATEGORY_COLORS: Record<string, string> = {
  labor: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  moves: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  rideshare: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  insurance: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  technology: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  fees: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  other: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  uncategorized: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

function fmt(val: number | string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(val) || 0);
}
function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function currentMonthStr() { return new Date().toISOString().slice(0, 7); }

// ─── Add Charge Dialog ────────────────────────────────────────────────────────
const MAX_CHARGE_AMOUNT = 100_000;

// Source types exposed in the charge form (subset of full SOURCE_TYPE_LABELS)
const CHARGE_SOURCE_TYPES: Array<{ value: string; label: string; requiresRef: boolean }> = [
  { value: "manual",    label: "Manual",    requiresRef: false },
  { value: "move",      label: "Move",      requiresRef: true  },
  { value: "rideshare", label: "Rideshare", requiresRef: true  },
];

const MAX_QUANTITY = 99_999;

function validateCharge(form: {
  customerId: string; productId: string; description: string; chargeDate: string;
  unitRate: string; quantity: string; amount: string;
  sourceType: string; sourceReferenceId: string;
}): Record<string, string> {
  const errs: Record<string, string> = {};

  if (!form.customerId) errs.customerId = "Account is required";
  if (!form.productId) errs.productId = "Product is required";
  if (!form.description.trim()) errs.description = "Description is required";
  if (!form.chargeDate) errs.chargeDate = "Charge date is required";

  // Source reference is required for move and rideshare types
  const srcConfig = CHARGE_SOURCE_TYPES.find(s => s.value === form.sourceType);
  if (srcConfig?.requiresRef && !form.sourceReferenceId.trim()) {
    errs.sourceReferenceId = `Source Reference ID is required for ${srcConfig.label} charges`;
  }

  const qty = Number(form.quantity);
  if (!form.quantity || isNaN(qty) || !isFinite(qty)) errs.quantity = "Quantity must be a valid number";
  else if (qty <= 0) errs.quantity = "Quantity must be greater than 0";
  else if (qty > MAX_QUANTITY) errs.quantity = `Quantity exceeds maximum allowed (${MAX_QUANTITY.toLocaleString()} units)`;

  const rate = Number(form.unitRate);
  if (!form.unitRate || isNaN(rate) || !isFinite(rate)) errs.unitRate = "Unit rate must be a valid number";
  else if (rate < 0) errs.unitRate = "Negative rate is not allowed";
  else if (rate === 0) errs.unitRate = "Rate must be greater than $0";
  else if (rate > MAX_CHARGE_AMOUNT) errs.unitRate = `Rate exceeds maximum allowed ($${MAX_CHARGE_AMOUNT.toLocaleString()})`;

  const amt = Number(form.amount);
  if (!form.amount || isNaN(amt) || !isFinite(amt)) errs.amount = "Amount must be a valid number";
  else if (amt < 0) errs.amount = "Negative charges are not allowed";
  else if (amt === 0) errs.amount = "Amount must be greater than $0";
  else if (amt > MAX_CHARGE_AMOUNT) errs.amount = `Amount exceeds maximum allowed ($${MAX_CHARGE_AMOUNT.toLocaleString()})`;

  return errs;
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="text-xs text-destructive mt-1 flex items-center gap-1" role="alert">
      <AlertTriangle className="h-3 w-3 shrink-0" />
      {msg}
    </p>
  );
}

function AddChargeDialog({ open, onClose, customers, products }: {
  open: boolean; onClose: () => void; customers: any[]; products: any[];
}) {
  const { toast } = useToast();

  const emptyForm = {
    customerId: "", productId: "",
    sourceType: "manual", sourceReferenceId: "", description: "",
    unitRate: "", quantity: "1", amount: "",
    revenueCategory: "", chargeDate: todayStr(), notes: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  // Full product object for derived-attribute display panel
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);

  // Auto-compute total amount when unit rate or quantity changes
  const updateField = (k: string, v: string) => {
    setForm(f => {
      const next = { ...f, [k]: v };
      if (k === "unitRate" || k === "quantity") {
        const r = parseFloat(k === "unitRate" ? v : f.unitRate);
        const q = parseFloat(k === "quantity" ? v : f.quantity);
        if (!isNaN(r) && !isNaN(q) && r > 0 && q > 0) {
          next.amount = (r * q).toFixed(2);
        }
      }
      // Clear per-field error on change (only when user has submitted once)
      if (submitted && errors[k]) setErrors(e => ({ ...e, [k]: "" }));
      return next;
    });
  };

  // When product is selected, auto-fill all billing defaults from the product record.
  // The server will also enforce these — this is for immediate UI feedback.
  const selectProduct = (id: string) => {
    const p = products.find((x: any) => x.id === id);
    setSelectedProduct(p ?? null);
    setForm(f => {
      const next = { ...f, productId: id };
      if (p?.revenueCategory) next.revenueCategory = p.revenueCategory;
      if (p?.unitPrice) {
        const rate = parseFloat(p.unitPrice);
        next.unitRate = p.unitPrice;
        const qty = parseFloat(next.quantity);
        if (!isNaN(qty) && qty > 0) next.amount = (rate * qty).toFixed(2);
      }
      return next;
    });
  };

  const [softDuplicateWarning, setSoftDuplicateWarning] = useState<{ message: string; duplicateId: string | null } | null>(null);

  const mut = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/billing/charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.error_code === "VALIDATION_ERROR" && body.errors?.length) {
          const serverErrs: Record<string, string> = {};
          for (const e of body.errors) serverErrs[e.field] = e.message;
          setErrors(serverErrs);
        } else if (body.error_code === "CHARGE_ALREADY_EXISTS") {
          setErrors({ sourceReferenceId: body.message });
        } else if (body.error_code === "SOFT_DUPLICATE_CHARGE") {
          // Surface as inline warning with force-through option
          setSoftDuplicateWarning({ message: body.message, duplicateId: body.duplicateId ?? null });
          return null; // handled
        } else if (body.error_code === "DUPLICATE_CHARGE") {
          setErrors({ amount: body.message });
        }
        throw new Error(body.message || `Request failed (${res.status})`);
      }
      setSoftDuplicateWarning(null);
      return body;
    },
    onSuccess: (data: any) => {
      if (!data) return; // soft duplicate shown
      toast({ title: "Charge created", description: "Added as Unbilled — will appear in the next billing run." });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/summary"] });
      onClose();
      setForm(emptyForm);
      setErrors({});
      setSubmitted(false);
      setSoftDuplicateWarning(null);
      setSelectedProduct(null);
    },
    onError: (e: any) => {
      const hasInlineErrors = Object.values(errors).some(Boolean);
      if (!hasInlineErrors) {
        toast({ title: "Failed to create charge", description: e.message, variant: "destructive" });
      }
    },
  });

  const handleSubmit = () => {
    setSubmitted(true);
    const errs = validateCharge(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    mut.mutate({
      customerId: form.customerId,
      productId: form.productId,
      sourceType: form.sourceType,
      sourceReferenceId: form.sourceReferenceId.trim() || undefined,
      revenueCategory: form.revenueCategory || undefined,
      chargeDate: form.chargeDate,
      description: form.description,
      unitRate: form.unitRate,
      quantity: form.quantity,
      amount: form.amount,
      notes: form.notes || undefined,
    });
  };

  const errClass = (field: string) => errors[field] ? "border-destructive focus-visible:ring-destructive" : "";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setErrors({}); setSubmitted(false); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Billing Charge</DialogTitle>
          <DialogDescription>Create a charge that will be included in the next weekly invoice run.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Product — REQUIRED, drives category + rate */}
          <div>
            <Label>Product <span className="text-destructive">*</span></Label>
            <Select value={form.productId} onValueChange={selectProduct}>
              <SelectTrigger
                className={errClass("productId")}
                data-testid="select-charge-product"
              >
                <SelectValue placeholder="Select a product…" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <FieldError msg={errors.productId} />
            {/* Product billing attributes — shown once a product is selected */}
            {selectedProduct && (
              <div className="mt-2 rounded-md border bg-muted/30 px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {selectedProduct.revenueCategory && (
                  <span className="text-muted-foreground">Category: <span className="font-medium text-foreground">{REVENUE_CATEGORY_LABELS[selectedProduct.revenueCategory] ?? selectedProduct.revenueCategory}</span></span>
                )}
                {selectedProduct.productType && (
                  <span className="text-muted-foreground">Type: <span className="font-medium text-foreground">{PRODUCT_TYPE_LABELS[selectedProduct.productType] ?? selectedProduct.productType}</span></span>
                )}
                {selectedProduct.billingFrequency && (
                  <span className="text-muted-foreground">Frequency: <span className="font-medium text-foreground">{BILLING_FREQUENCY_LABELS[selectedProduct.billingFrequency] ?? selectedProduct.billingFrequency}</span></span>
                )}
                {selectedProduct.unit && (
                  <span className="text-muted-foreground">Unit: <span className="font-medium text-foreground">{selectedProduct.unit}</span></span>
                )}
                {selectedProduct.glCode && (
                  <span className="text-muted-foreground">GL Code: <span className="font-medium text-foreground">{selectedProduct.glCode}</span></span>
                )}
                {selectedProduct.taxable != null && (
                  <span className="text-muted-foreground">Taxable: <span className="font-medium text-foreground">{selectedProduct.taxable ? "Yes" : "No"}</span></span>
                )}
              </div>
            )}
          </div>

          {/* Account — REQUIRED */}
          <div>
            <Label>Account <span className="text-destructive">*</span></Label>
            <Select value={form.customerId} onValueChange={v => updateField("customerId", v)}>
              <SelectTrigger
                className={errClass("customerId")}
                data-testid="select-charge-account"
              >
                <SelectValue placeholder="Select account…" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.customerName}</SelectItem>)}
              </SelectContent>
            </Select>
            <FieldError msg={errors.customerId} />
          </div>

          {/* Description + Charge Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Description <span className="text-destructive">*</span></Label>
              <Input
                value={form.description}
                onChange={e => updateField("description", e.target.value)}
                placeholder="Describe the charge…"
                data-testid="input-charge-description"
                className={errClass("description")}
              />
              <FieldError msg={errors.description} />
            </div>
            <div>
              <Label>Charge Date <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={form.chargeDate}
                onChange={e => updateField("chargeDate", e.target.value)}
                data-testid="input-charge-date"
                className={errClass("chargeDate")}
              />
              <FieldError msg={errors.chargeDate} />
            </div>
          </div>

          {/* Unit Rate + Quantity + Total Amount */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Unit Rate <span className="text-destructive">*</span></Label>
              <div className="relative">
                <span className="absolute left-2.5 top-2.5 text-sm text-muted-foreground">$</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="100000"
                  value={form.unitRate}
                  onChange={e => updateField("unitRate", e.target.value)}
                  placeholder="0.00"
                  className={`pl-6 ${errClass("unitRate")}`}
                  data-testid="input-charge-unit-rate"
                />
              </div>
              <FieldError msg={errors.unitRate} />
            </div>
            <div>
              <Label>Quantity <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                step="1"
                min="0.01"
                value={form.quantity}
                onChange={e => updateField("quantity", e.target.value)}
                data-testid="input-charge-quantity"
                className={errClass("quantity")}
              />
              <FieldError msg={errors.quantity} />
            </div>
            <div>
              <Label>
                Total <span className="text-destructive">*</span>
                <span className="ml-1 text-xs text-muted-foreground font-normal">(auto)</span>
              </Label>
              <div className="relative">
                <span className="absolute left-2.5 top-2.5 text-sm text-muted-foreground">$</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="100000"
                  value={form.amount}
                  onChange={e => updateField("amount", e.target.value)}
                  placeholder="0.00"
                  className={`pl-6 ${errClass("amount")}`}
                  data-testid="input-charge-amount"
                />
              </div>
              <FieldError msg={errors.amount} />
            </div>
          </div>

          {/* Source Type + Source Reference ID */}
          {(() => {
            const srcConfig = CHARGE_SOURCE_TYPES.find(s => s.value === form.sourceType);
            const refRequired = srcConfig?.requiresRef ?? false;
            return (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Source Type</Label>
                  <Select value={form.sourceType} onValueChange={v => updateField("sourceType", v)}>
                    <SelectTrigger data-testid="select-charge-source-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHARGE_SOURCE_TYPES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {refRequired ? "Reference ID required for deduplication" : "No reference ID required"}
                  </p>
                </div>
                <div>
                  <Label>
                    Source Reference ID
                    {refRequired
                      ? <span className="text-destructive ml-1">*</span>
                      : <span className="text-xs text-muted-foreground font-normal ml-1">(optional)</span>
                    }
                  </Label>
                  <Input
                    value={form.sourceReferenceId}
                    onChange={e => updateField("sourceReferenceId", e.target.value)}
                    placeholder={refRequired ? "Required — e.g. move:abc123" : "e.g. move:abc123"}
                    data-testid="input-charge-ref-id"
                    className={errClass("sourceReferenceId")}
                  />
                  <FieldError msg={errors.sourceReferenceId} />
                </div>
              </div>
            );
          })()}

          {/* Notes */}
          <div>
            <Label>Notes <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              value={form.notes}
              onChange={e => updateField("notes", e.target.value)}
              rows={2}
              placeholder="Additional context…"
              data-testid="input-charge-notes"
            />
          </div>

          {/* Financial rules reminder */}
          <div className="rounded-md bg-muted/50 border px-3 py-2 text-xs text-muted-foreground">
            Rate, quantity, and total must each be greater than $0 and below $100,000. Negative values are not permitted.
          </div>

          {/* Soft Duplicate Warning Banner */}
          {softDuplicateWarning && (
            <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">Possible Duplicate Charge</p>
                  <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">{softDuplicateWarning.message}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setSoftDuplicateWarning(null)} data-testid="button-dismiss-charge-duplicate">Review</Button>
                <Button size="sm" className="bg-amber-700 text-white" disabled={mut.isPending}
                  onClick={() => {
                    const errs = validateCharge(form);
                    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
                    setErrors({});
                    mut.mutate({
                      customerId: form.customerId, productId: form.productId,
                      sourceType: form.sourceType, sourceReferenceId: form.sourceReferenceId.trim() || undefined,
                      revenueCategory: form.revenueCategory || undefined, chargeDate: form.chargeDate,
                      description: form.description, unitRate: form.unitRate, quantity: form.quantity,
                      amount: form.amount, notes: form.notes || undefined, force: true,
                    });
                  }}
                  data-testid="button-force-create-charge"
                >
                  {mut.isPending && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                  Add Anyway
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setErrors({}); setSubmitted(false); setSoftDuplicateWarning(null); }}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={mut.isPending || !!softDuplicateWarning}
            data-testid="button-save-charge"
          >
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Charge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Generate Recurring Dialog ────────────────────────────────────────────────
function GenerateRecurringDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [billingMonth, setBillingMonth] = useState(currentMonthStr());
  const [result, setResult] = useState<any | null>(null);

  const mut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/billing/charges/generate-recurring", data),
    onSuccess: (data: any) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/billing/charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/summary"] });
      if (data.created > 0) {
        toast({ title: "Recurring charges generated", description: `${data.created} charge(s) created for ${data.billingMonth}` });
      }
    },
    onError: (e: any) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  const handleClose = () => { onClose(); setResult(null); setBillingMonth(currentMonthStr()); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-primary" /> Generate Recurring Charges
          </DialogTitle>
          <DialogDescription>
            Scans all active account products with monthly billing frequency and creates one Unbilled charge per assignment for the selected billing month. Idempotent — safe to run multiple times.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            <div>
              <Label required>Billing Month</Label>
              <Input
                type="month"
                value={billingMonth}
                onChange={e => setBillingMonth(e.target.value)}
                className="w-40"
                data-testid="input-billing-month"
              />
              <p className="text-xs text-muted-foreground mt-1">Charges will be dated the 1st of this month.</p>
            </div>
            <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-800 dark:text-blue-300 space-y-1">
              <div className="font-semibold">What gets generated:</div>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li>Active account product assignments where the product has <strong>Monthly</strong> billing frequency</li>
                <li>One charge per assignment, priced at the account's price override or product base price</li>
                <li>Charges enter as <strong>Unbilled</strong> and are swept into the next weekly invoice run</li>
                <li>Already-generated charges for this month are skipped (no duplicates)</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-md border p-3">
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{result.created}</div>
                <div className="text-xs text-muted-foreground">Created</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-2xl font-bold text-muted-foreground">{result.skipped}</div>
                <div className="text-xs text-muted-foreground">Skipped (already exist)</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-2xl font-bold">{result.total}</div>
                <div className="text-xs text-muted-foreground">Total Assignments</div>
              </div>
            </div>
            {result.details?.length > 0 && (
              <div className="max-h-60 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.details.map((d: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{d.customerName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{d.productName}</TableCell>
                        <TableCell>
                          {d.status === "created"
                            ? <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 text-xs">Created</Badge>
                            : <Badge variant="secondary" className="text-xs">Skipped</Badge>
                          }
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>{result ? "Close" : "Cancel"}</Button>
          {!result && (
            <Button
              onClick={() => mut.mutate({ billingMonth })}
              disabled={mut.isPending || !billingMonth}
              data-testid="button-generate-recurring"
            >
              {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Generate Charges
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Invoice Run Dialog ───────────────────────────────────────────────────────
function InvoiceRunDialog({ open, onClose, cutoff, summary }: {
  open: boolean; onClose: () => void; cutoff: string; summary: any;
}) {
  const { toast } = useToast();
  const [dryRun, setDryRun] = useState(true);
  const [results, setResults] = useState<any[]>([]);
  const [ran, setRan] = useState(false);
  const mut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/billing/run-weekly", data),
    onSuccess: (data: any) => {
      setResults(data.results || []);
      setRan(true);
      if (!dryRun) {
        queryClient.invalidateQueries({ queryKey: ["/api/billing/summary"] });
        queryClient.invalidateQueries({ queryKey: ["/api/billing/charges"] });
        const created = data.invoicesCreated ?? 0;
        const appended = data.invoicesAppended ?? 0;
        const parts = [];
        if (created > 0) parts.push(`${created} created`);
        if (appended > 0) parts.push(`${appended} updated`);
        toast({ title: "Invoice run complete", description: parts.join(", ") || "No changes" });
      }
    },
    onError: (e: any) => toast({ title: "Run failed", description: e.message, variant: "destructive" }),
  });

  const accounts = summary?.accounts || [];
  const totalAccounts = accounts.length;
  const totalCharges = accounts.reduce((s: number, a: any) => s + a.totalCharges, 0);
  const totalAmount = accounts.reduce((s: number, a: any) => s + a.totalAmount, 0);

  const handleClose = () => { onClose(); setRan(false); setResults([]); setDryRun(true); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Weekly Invoice Assembly — Cutoff {fmtDate(cutoff)}
          </DialogTitle>
          <DialogDescription>
            One consolidated invoice per account. All unbilled charge types are included — moves, labor, rideshare, recurring, and one-time.
          </DialogDescription>
        </DialogHeader>

        {!ran ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Card><CardContent className="pt-4 pb-3 text-center"><div className="text-2xl font-bold">{totalAccounts}</div><div className="text-xs text-muted-foreground">Accounts</div></CardContent></Card>
              <Card><CardContent className="pt-4 pb-3 text-center"><div className="text-2xl font-bold">{totalCharges}</div><div className="text-xs text-muted-foreground">Charges</div></CardContent></Card>
              <Card><CardContent className="pt-4 pb-3 text-center"><div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{fmt(totalAmount)}</div><div className="text-xs text-muted-foreground">Total</div></CardContent></Card>
            </div>

            <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-800 dark:text-blue-300">
                <ShieldCheck className="h-4 w-4 flex-shrink-0" />
                Consolidated Billing — One Invoice Per Account
              </div>
              <div className="text-xs text-blue-700 dark:text-blue-400 space-y-1">
                <p>All charge types merge into a single invoice per account:</p>
                <ul className="list-disc list-inside space-y-0.5 ml-1">
                  <li><strong>Monthly recurring</strong> (insurance, technology, fees) — accumulated Unbilled, swept here</li>
                  <li><strong>One-time</strong> (onboarding, adjustments) — included in this run</li>
                  <li><strong>Rideshare</strong> (Uber/Lyft trips) — included in this run</li>
                  <li><strong>Operational</strong> (moves, labor hours) — included in this run</li>
                </ul>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${dryRun ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border"}`}
                onClick={() => setDryRun(true)} data-testid="radio-dry-run"
              >
                <Eye className="h-3.5 w-3.5" /> Preview Only
              </button>
              <button
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${!dryRun ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border"}`}
                onClick={() => setDryRun(false)} data-testid="radio-real-run"
              >
                <Zap className="h-3.5 w-3.5" /> Create Invoices
              </button>
            </div>

            {!dryRun && (
              <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-800 dark:text-red-300 space-y-1">
                <div className="font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                  This will process {totalAccounts} account(s) and mark {totalCharges} charge(s) as Billed.
                </div>
                <div>New invoices are created for first-time accounts. Accounts with an open invoice this cycle will have charges appended — no duplicate invoices are ever created. This cannot be undone.</div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Post-run summary header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                {dryRun ? <Eye className="h-4 w-4 text-blue-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                {dryRun ? "Preview Results" : "Run Complete"}
              </div>
              {!dryRun && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {results.filter(r => r.status === "invoiced").length > 0 && (
                    <span className="flex items-center gap-1">
                      <FileText className="h-3 w-3 text-emerald-600" />
                      {results.filter(r => r.status === "invoiced").length} created
                    </span>
                  )}
                  {results.filter(r => r.status === "appended").length > 0 && (
                    <span className="flex items-center gap-1">
                      <FilePlus className="h-3 w-3 text-blue-600" />
                      {results.filter(r => r.status === "appended").length} appended
                    </span>
                  )}
                </div>
              )}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Charges</TableHead>
                  <TableHead className="text-right">Amount Added</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r: any) => (
                  <TableRow key={r.customerId}>
                    <TableCell className="font-medium">{r.customerName}</TableCell>
                    <TableCell className="text-right">{r.chargeCount}</TableCell>
                    <TableCell className="text-right">{fmt(r.totalAmount)}</TableCell>
                    <TableCell>
                      {r.status === "invoiced" && (
                        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 text-xs">
                          Invoiced — {r.invoiceNumber}
                        </Badge>
                      )}
                      {r.status === "preview" && (
                        <Badge variant="outline" className="text-xs">Would Create Invoice</Badge>
                      )}
                      {r.status === "preview_append" && (
                        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs">
                          Would Append to {r.invoiceNumber || "Open Invoice"}
                        </Badge>
                      )}
                      {r.status === "appended" && (
                        <div className="flex flex-col gap-0.5">
                          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs">
                            <FilePlus className="h-3 w-3 mr-1" />
                            Appended — {r.invoiceNumber}
                          </Badge>
                          {r.previousTotal != null && (
                            <span className="text-xs text-muted-foreground">
                              {fmt(r.previousTotal)} → {fmt(r.newTotal)}
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>{ran ? "Close" : "Cancel"}</Button>
          {!ran && (
            <Button
              onClick={() => mut.mutate({ cutoff, dryRun })}
              disabled={mut.isPending || totalAccounts === 0}
              data-testid="button-run-invoices"
            >
              {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {dryRun ? "Preview" : `Create ${totalAccounts} Invoice(s)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Status Engine ─────────────────────────────────────────────────────────────
function chargeStatus(c: any): "error" | "warning" | "ready" {
  if (!c.productId || Number(c.amount) <= 0) return "error";
  if (!c.revenueCategory || !c.description?.trim() || Number(c.amount) > 10000) return "warning";
  return "ready";
}

const STATUS_CONFIG = {
  error: {
    label: "Error",
    icon: AlertCircle,
    badgeCls: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    rowCls: "bg-red-50/50 dark:bg-red-950/20",
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    badgeCls: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    rowCls: "bg-amber-50/50 dark:bg-amber-950/20",
  },
  ready: {
    label: "Ready",
    icon: CheckCircle2,
    badgeCls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    rowCls: "",
  },
};

function chargeStatusReason(c: any): string {
  if (!c.productId) return "No product assigned — charge will be excluded from invoice";
  if (Number(c.amount) <= 0) return "Amount must be greater than zero to be invoiced";
  if (!c.revenueCategory) return "Missing revenue category";
  if (!c.description?.trim()) return "Missing description";
  if (Number(c.amount) > 10000) return `Large amount (${fmt(c.amount)}) — verify before invoicing`;
  return "";
}

// ─── Edit Charge Dialog ────────────────────────────────────────────────────────
function EditChargeDialog({ charge, open, onClose, products }: {
  charge: any; open: boolean; onClose: () => void; products: any[];
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    description: "", chargeDate: "", quantity: "1", unitRate: "", amount: "",
    productId: "", revenueCategory: "", notes: "",
  });

  useEffect(() => {
    if (charge && open) {
      setForm({
        description: charge.description || "",
        chargeDate: charge.chargeDate ? String(charge.chargeDate).slice(0, 10) : "",
        quantity: String(charge.quantity ?? "1"),
        unitRate: charge.unitRate ? String(charge.unitRate) : "",
        amount: String(charge.amount ?? ""),
        productId: charge.productId || "",
        revenueCategory: charge.revenueCategory || "",
        notes: charge.notes || "",
      });
    }
  }, [charge, open]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const mut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/billing/charges/${charge.id}`, {
        description: form.description,
        chargeDate: form.chargeDate,
        quantity: Number(form.quantity) || 1,
        unitRate: form.unitRate ? Number(form.unitRate) : undefined,
        amount: Number(form.amount),
        productId: form.productId || undefined,
        revenueCategory: form.revenueCategory || undefined,
        notes: form.notes || undefined,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Save failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/summary"] });
      toast({ title: "Charge updated" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Failed to update", description: e.message, variant: "destructive" }),
  });

  if (!charge) return null;
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Charge</DialogTitle>
          <DialogDescription>Update charge details before invoicing.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Input value={form.description} onChange={e => set("description", e.target.value)} data-testid="input-edit-description" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Charge Date</Label>
              <Input type="date" value={form.chargeDate} onChange={e => set("chargeDate", e.target.value)} data-testid="input-edit-chargedate" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Amount ($)</Label>
              <Input type="number" value={form.amount} onChange={e => set("amount", e.target.value)} data-testid="input-edit-amount" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Quantity</Label>
              <Input type="number" value={form.quantity} onChange={e => set("quantity", e.target.value)} data-testid="input-edit-quantity" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Unit Rate ($)</Label>
              <Input type="number" value={form.unitRate} onChange={e => set("unitRate", e.target.value)} placeholder="Optional" data-testid="input-edit-unitrate" />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Product</Label>
            <Select value={form.productId} onValueChange={v => set("productId", v)}>
              <SelectTrigger data-testid="select-edit-product"><SelectValue placeholder="Select product" /></SelectTrigger>
              <SelectContent>
                {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Revenue Category</Label>
            <Select value={form.revenueCategory} onValueChange={v => set("revenueCategory", v)}>
              <SelectTrigger data-testid="select-edit-category"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {PRODUCT_REVENUE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{REVENUE_CATEGORY_LABELS[c]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} data-testid="input-edit-notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending} data-testid="button-save-edit">
            {mut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reassign Product Dialog ──────────────────────────────────────────────────
function ReassignProductDialog({ charge, open, onClose, products }: {
  charge: any; open: boolean; onClose: () => void; products: any[];
}) {
  const { toast } = useToast();
  const [productId, setProductId] = useState("");
  const [revenueCategory, setRevenueCategory] = useState("");

  useEffect(() => {
    if (charge && open) {
      setProductId(charge.productId || "");
      setRevenueCategory(charge.revenueCategory || "");
    }
  }, [charge, open]);

  const selectedProduct = products.find((p: any) => p.id === productId);
  useEffect(() => {
    if (selectedProduct?.revenueCategory && !revenueCategory) {
      setRevenueCategory(selectedProduct.revenueCategory);
    }
  }, [selectedProduct]);

  const mut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/billing/charges/${charge.id}`, {
        productId: productId || null,
        revenueCategory: revenueCategory || null,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/summary"] });
      toast({ title: "Product reassigned" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (!charge) return null;
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reassign Product</DialogTitle>
          <DialogDescription>Change the product and revenue category for this charge.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger data-testid="select-reassign-product"><SelectValue placeholder="Select product" /></SelectTrigger>
              <SelectContent>
                <SelectItem value=" ">No product</SelectItem>
                {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Revenue Category</Label>
            <Select value={revenueCategory} onValueChange={setRevenueCategory}>
              <SelectTrigger data-testid="select-reassign-category"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value=" ">No category</SelectItem>
                {PRODUCT_REVENUE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{REVENUE_CATEGORY_LABELS[c]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !productId.trim()} data-testid="button-confirm-reassign">
            {mut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Reassign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Account Candidate Row (expandable, enhanced) ─────────────────────────────
function AccountCandidateRow({ account, cutoff, selected, onToggle, products }: {
  account: any; cutoff: string; selected: boolean; onToggle: () => void; products: any[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [editCharge, setEditCharge] = useState<any | null>(null);
  const [reassignCharge, setReassignCharge] = useState<any | null>(null);
  const { toast } = useToast();

  const { data: charges = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/billing/charges", account.customerId, "unbilled", cutoff],
    queryFn: async () => {
      const r = await fetch(`/api/billing/charges?customerId=${account.customerId}&billingStatus=unbilled&dateTo=${cutoff}`, { credentials: "include" });
      return r.json();
    },
    enabled: expanded,
  });

  const voidMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/billing/charges/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/summary"] });
      toast({ title: "Charge removed" });
    },
    onError: (e: any) => toast({ title: "Failed to remove", description: e.message, variant: "destructive" }),
  });

  const acctStatus = (account.accountStatus as "error" | "warning" | "ready") || "ready";
  const statusCfg = STATUS_CONFIG[acctStatus];
  const StatusIcon = statusCfg.icon;

  // Group expanded charges by revenue category
  const chargesByCategory = charges.reduce((acc: Record<string, any[]>, c: any) => {
    const cat = c.revenueCategory || "uncategorized";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(c);
    return acc;
  }, {});

  return (
    <>
      <TableRow
        className={`cursor-pointer hover-elevate ${selected ? "bg-primary/5" : ""}`}
        onClick={() => setExpanded(e => !e)}
        data-testid={`row-account-${account.customerId}`}
      >
        <TableCell className="w-8" onClick={e => { e.stopPropagation(); onToggle(); }}>
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggle()}
            data-testid={`checkbox-account-${account.customerId}`}
          />
        </TableCell>
        <TableCell className="w-6 p-1">
          {expanded
            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />
          }
        </TableCell>
        <TableCell className="font-semibold">{account.customerName}</TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-1">
            {account.categories.map((cat: any) => (
              <Badge
                key={cat.revenueCategory}
                className={`text-xs ${REVENUE_CATEGORY_COLORS[cat.revenueCategory] || REVENUE_CATEGORY_COLORS.uncategorized}`}
              >
                {REVENUE_CATEGORY_LABELS[cat.revenueCategory] || cat.revenueCategory} ({cat.chargeCount})
                {cat.errorCount > 0 && <AlertCircle className="h-3 w-3 ml-1" />}
                {cat.errorCount === 0 && cat.warningCount > 0 && <AlertTriangle className="h-3 w-3 ml-1" />}
              </Badge>
            ))}
          </div>
        </TableCell>
        <TableCell className="text-right tabular-nums">{account.totalCharges}</TableCell>
        <TableCell className="text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">{fmt(account.totalAmount)}</TableCell>
        <TableCell>
          <Badge className={`text-xs ${statusCfg.badgeCls}`}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {statusCfg.label}
            {acctStatus === "error" && ` (${account.errorCount})`}
            {acctStatus === "warning" && ` (${account.warningCount})`}
          </Badge>
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow>
          <TableCell colSpan={7} className="p-0 bg-muted/20">
            <div className="px-6 py-4 space-y-5">
              {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading charges…
                </div>
              ) : charges.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3">No unbilled charges</p>
              ) : (
                Object.entries(chargesByCategory).map(([cat, catCharges]) => (
                  <div key={cat}>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={`text-xs ${REVENUE_CATEGORY_COLORS[cat] || REVENUE_CATEGORY_COLORS.uncategorized}`}>
                        {REVENUE_CATEGORY_LABELS[cat] || cat}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {(catCharges as any[]).length} charge{(catCharges as any[]).length !== 1 ? "s" : ""} · {fmt((catCharges as any[]).reduce((s: number, c: any) => s + Number(c.amount), 0))}
                      </span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs py-1.5">Date</TableHead>
                          <TableHead className="text-xs py-1.5">Description</TableHead>
                          <TableHead className="text-xs py-1.5">Source</TableHead>
                          <TableHead className="text-xs py-1.5">Product</TableHead>
                          <TableHead className="text-xs py-1.5 text-right">Qty</TableHead>
                          <TableHead className="text-xs py-1.5 text-right">Amount</TableHead>
                          <TableHead className="text-xs py-1.5">Status</TableHead>
                          <TableHead className="text-xs py-1.5 w-28"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(catCharges as any[]).map((c: any) => {
                          const cSt = chargeStatus(c);
                          const cCfg = STATUS_CONFIG[cSt];
                          const reason = chargeStatusReason(c);
                          const CIcon = cCfg.icon;
                          return (
                            <TableRow key={c.id} className={cCfg.rowCls} data-testid={`row-charge-${c.id}`}>
                              <TableCell className="text-xs whitespace-nowrap">{fmtDate(c.chargeDate)}</TableCell>
                              <TableCell className="text-xs max-w-[160px]">
                                <div className="truncate" title={c.description}>
                                  {c.description || <span className="text-muted-foreground italic">No description</span>}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  <Badge className={`text-xs ${SOURCE_TYPE_COLORS[c.sourceType] || SOURCE_TYPE_COLORS.manual}`}>
                                    {SOURCE_TYPE_LABELS[c.sourceType] || c.sourceType}
                                  </Badge>
                                  {c.chargeSource && (
                                    <Badge className={`text-xs ${CHARGE_SOURCE_COLORS[c.chargeSource] || CHARGE_SOURCE_COLORS.manual}`}>
                                      {CHARGE_SOURCE_LABELS[c.chargeSource] || c.chargeSource}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs">
                                {c.productName
                                  ? <span className="text-muted-foreground">{c.productName}</span>
                                  : <span className="text-red-600 font-medium">Not assigned</span>
                                }
                              </TableCell>
                              <TableCell className="text-right text-xs tabular-nums">{Number(c.quantity).toFixed(2)}</TableCell>
                              <TableCell className="text-right text-xs tabular-nums font-medium">{fmt(c.amount)}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Badge className={`text-xs ${cCfg.badgeCls}`}>
                                    <CIcon className="h-3 w-3 mr-1" />{cCfg.label}
                                  </Badge>
                                  {reason && (
                                    <span title={reason} className="cursor-help">
                                      <Info className="h-3 w-3 text-muted-foreground" />
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-0.5">
                                  <Button
                                    size="icon" variant="ghost"
                                    onClick={e => { e.stopPropagation(); setEditCharge(c); }}
                                    title="Edit charge"
                                    data-testid={`button-edit-charge-${c.id}`}
                                  >
                                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                  </Button>
                                  <Button
                                    size="icon" variant="ghost"
                                    onClick={e => { e.stopPropagation(); setReassignCharge(c); }}
                                    title="Reassign product"
                                    data-testid={`button-reassign-charge-${c.id}`}
                                  >
                                    <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                                  </Button>
                                  <Button
                                    size="icon" variant="ghost"
                                    onClick={e => { e.stopPropagation(); voidMut.mutate(c.id); }}
                                    disabled={voidMut.isPending}
                                    title="Remove charge"
                                    data-testid={`button-void-charge-${c.id}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ))
              )}
            </div>
          </TableCell>
        </TableRow>
      )}

      <EditChargeDialog charge={editCharge} open={!!editCharge} onClose={() => setEditCharge(null)} products={products} />
      <ReassignProductDialog charge={reassignCharge} open={!!reassignCharge} onClose={() => setReassignCharge(null)} products={products} />
    </>
  );
}

// ─── Cutoff info strip ────────────────────────────────────────────────────────
function CutoffInfoStrip({ cutoffInfo, cutoff, onReset }: {
  cutoffInfo: any; cutoff: string; onReset: () => void;
}) {
  if (!cutoffInfo) return null;
  const isOverridden = cutoff !== cutoffInfo.cutoffDate;
  const isAfterCutoff = cutoff > cutoffInfo.cutoffDate;

  return (
    <div className={`rounded-md border px-4 py-3 flex items-start gap-3 ${
      isAfterCutoff
        ? "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30"
        : "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30"
    }`}>
      <Calendar className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isAfterCutoff ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400"}`} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className={`text-sm font-semibold ${isAfterCutoff ? "text-amber-800 dark:text-amber-300" : "text-blue-800 dark:text-blue-300"}`}>
            Billing Cycle — {cutoffInfo.cutoffDayName} cutoff
          </span>
          <span className="text-xs text-muted-foreground">
            Current cycle: {fmtDate(cutoffInfo.billingWeekStart)} → {fmtDate(cutoffInfo.billingWeekEnd)}
          </span>
          {cutoffInfo.daysUntilCutoff === 0 ? (
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Cutoff is today</span>
          ) : (
            <span className="text-xs text-muted-foreground">{cutoffInfo.daysUntilCutoff} day{cutoffInfo.daysUntilCutoff !== 1 ? "s" : ""} until cutoff</span>
          )}
        </div>
        {isOverridden && (
          <div className={`text-xs mt-1 flex items-center gap-2 ${isAfterCutoff ? "text-amber-700 dark:text-amber-400" : "text-blue-700 dark:text-blue-400"}`}>
            <Clock className="h-3 w-3 flex-shrink-0" />
            {isAfterCutoff
              ? "Cutoff is set beyond the standard cycle — charges in this window will appear in a future run."
              : "Cutoff is before the standard date — charges after this will carry to the next cycle."
            }
            <button onClick={onReset} className="underline underline-offset-2 text-xs font-medium hover:opacity-70">Reset to {fmtDate(cutoffInfo.cutoffDate)}</button>
          </div>
        )}
        {!isOverridden && (
          <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
            Charges dated after {fmtDate(cutoffInfo.cutoffDate)} will be held for the next billing cycle.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Billing Candidates Tab ───────────────────────────────────────────────────
function BillingCandidatesTab() {
  const [cutoff, setCutoff] = useState(todayStr());
  const [cutoffInitialized, setCutoffInitialized] = useState(false);
  const [addChargeOpen, setAddChargeOpen] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "ready" | "warning" | "error">("all");
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [bulkVoidPending, setBulkVoidPending] = useState(false);
  const { toast } = useToast();

  const { data: cutoffInfo } = useQuery<any>({
    queryKey: ["/api/billing/cutoff"],
    queryFn: async () => {
      const r = await fetch("/api/billing/cutoff", { credentials: "include" });
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!cutoffInitialized && cutoffInfo?.cutoffDate) {
      setCutoff(cutoffInfo.cutoffDate);
      setCutoffInitialized(true);
    }
  }, [cutoffInfo, cutoffInitialized]);

  const { data: summary, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/billing/summary", cutoff],
    queryFn: async () => {
      const r = await fetch(`/api/billing/summary?cutoff=${cutoff}`, { credentials: "include" });
      return r.json();
    },
    enabled: !!cutoff,
  });

  const { data: customers = [] } = useQuery<any[]>({ queryKey: ["/api/customers"] });
  const { data: products = [] } = useQuery<any[]>({ queryKey: ["/api/finance/products"] });

  const allAccounts: any[] = summary?.accounts || [];
  const accounts = statusFilter === "all"
    ? allAccounts
    : allAccounts.filter((a: any) => a.accountStatus === statusFilter);

  // KPI aggregates always from allAccounts (unfiltered)
  const totalAccounts = allAccounts.length;
  const totalCharges  = allAccounts.reduce((s: number, a: any) => s + a.totalCharges, 0);
  const totalAmount   = allAccounts.reduce((s: number, a: any) => s + a.totalAmount, 0);
  const issueAccounts = allAccounts.filter((a: any) => a.accountStatus !== "ready").length;
  const errorAccounts = summary?.totalErrorAccounts ?? 0;

  const handleBulkVoid = async () => {
    const chargeIds = allAccounts
      .filter((a: any) => selectedAccounts.has(a.customerId))
      .flatMap((a: any) => a.categories.flatMap((cat: any) => cat.chargeIds || []));
    if (!chargeIds.length) return;
    setBulkVoidPending(true);
    try {
      const res = await apiRequest("POST", "/api/billing/charges/bulk-void", { ids: chargeIds });
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/billing/charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/summary"] });
      toast({ title: `${data.voided} charge(s) voided` });
      setSelectedAccounts(new Set());
    } catch (e: any) {
      toast({ title: "Bulk void failed", description: e.message, variant: "destructive" });
    } finally {
      setBulkVoidPending(false);
    }
  };

  const toggleAccount = (customerId: string) =>
    setSelectedAccounts(prev => {
      const next = new Set(prev);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });

  const selectAll = () => setSelectedAccounts(new Set(accounts.map((a: any) => a.customerId)));
  const clearAll  = () => setSelectedAccounts(new Set());

  return (
    <div className="space-y-4">
      <CutoffInfoStrip
        cutoffInfo={cutoffInfo}
        cutoff={cutoff}
        onReset={() => cutoffInfo?.cutoffDate && setCutoff(cutoffInfo.cutoffDate)}
      />

      <div className="rounded-md border border-border bg-muted/40 px-4 py-3 flex items-start gap-3">
        <ShieldCheck className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
        <p className="text-sm">
          <span className="font-semibold">Consolidated billing:</span>
          <span className="text-muted-foreground ml-1">
            All charge types roll into <strong className="text-foreground">one invoice per account per weekly cycle</strong>.
            Charges marked <span className="text-red-600 font-medium">Error</span> are automatically excluded from invoice runs — fix them here first.
          </span>
        </p>
      </div>

      {/* 4-card KPI dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-blue-50 dark:bg-blue-950/40 p-2">
                <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">{totalAccounts}</div>
                <div className="text-xs text-muted-foreground">Accounts</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-violet-50 dark:bg-violet-950/40 p-2">
                <Package className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">{totalCharges}</div>
                <div className="text-xs text-muted-foreground">Unbilled Charges</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 p-2">
                <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{fmt(totalAmount)}</div>
                <div className="text-xs text-muted-foreground">Total Unbilled</div>
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Issues card — clickable to filter */}
        <Card
          className={`cursor-pointer hover-elevate ${statusFilter === "error" ? "ring-2 ring-red-400" : statusFilter !== "all" ? "ring-2 ring-amber-400" : ""}`}
          onClick={() => setStatusFilter(f => f === "all" ? "error" : "all")}
          data-testid="card-kpi-issues"
        >
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className={`rounded-md p-2 ${issueAccounts > 0 ? "bg-red-50 dark:bg-red-950/40" : "bg-muted/40"}`}>
                <AlertCircle className={`h-4 w-4 ${issueAccounts > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`} />
              </div>
              <div>
                <div className={`text-2xl font-bold ${issueAccounts > 0 ? "text-red-700 dark:text-red-400" : ""}`}>{issueAccounts}</div>
                <div className="text-xs text-muted-foreground">
                  {issueAccounts > 0
                    ? `${errorAccounts} error${errorAccounts !== 1 ? "s" : ""} · tap to filter`
                    : "All Clear"
                  }
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground whitespace-nowrap">Cutoff</Label>
            <Input type="date" value={cutoff} onChange={e => setCutoff(e.target.value)} className="w-40" data-testid="input-cutoff-date" />
          </div>
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="w-40" data-testid="select-status-filter">
              <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts</SelectItem>
              <SelectItem value="ready">Ready Only</SelectItem>
              <SelectItem value="warning">Has Warnings</SelectItem>
              <SelectItem value="error">Has Errors</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-candidates">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setRecurringOpen(true)} data-testid="button-generate-recurring">
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Generate Recurring
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAddChargeOpen(true)} data-testid="button-add-charge">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Charge
          </Button>
          <Button
            size="sm"
            onClick={() => setRunDialogOpen(true)}
            disabled={totalAccounts === 0}
            data-testid="button-run-weekly"
          >
            <Zap className="h-3.5 w-3.5 mr-1.5" /> Run Invoice
          </Button>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selectedAccounts.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-2 flex-wrap gap-y-2">
          <CheckSquare className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm font-medium">
            {selectedAccounts.size} account{selectedAccounts.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Button size="sm" variant="outline" onClick={selectAll} data-testid="button-select-all">Select All</Button>
            <Button size="sm" variant="outline" onClick={clearAll} data-testid="button-clear-selection">
              <X className="h-3.5 w-3.5 mr-1" />Clear
            </Button>
            <Button
              size="sm" variant="destructive"
              onClick={handleBulkVoid}
              disabled={bulkVoidPending}
              data-testid="button-bulk-void"
            >
              {bulkVoidPending
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Voiding…</>
                : <><Trash2 className="h-3.5 w-3.5 mr-1.5" />Void Selected Charges</>
              }
            </Button>
          </div>
        </div>
      )}

      {/* Accounts table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading billing candidates…
            </div>
          ) : allAccounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <div className="font-medium">No unbilled charges up to {fmtDate(cutoff)}</div>
              <div className="text-sm">Use "Generate Recurring" or "Add Charge" to create new charges.</div>
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
              <Filter className="h-6 w-6" />
              <div className="font-medium">No accounts match this filter</div>
              <Button size="sm" variant="outline" onClick={() => setStatusFilter("all")}>Clear filter</Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={selectedAccounts.size === accounts.length && accounts.length > 0}
                      onCheckedChange={checked => checked ? setSelectedAccounts(new Set(accounts.map((a: any) => a.customerId))) : clearAll()}
                      data-testid="checkbox-select-all-accounts"
                    />
                  </TableHead>
                  <TableHead className="w-6"></TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Categories</TableHead>
                  <TableHead className="text-right">Charges</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a: any) => (
                  <AccountCandidateRow
                    key={a.customerId}
                    account={a}
                    cutoff={cutoff}
                    selected={selectedAccounts.has(a.customerId)}
                    onToggle={() => toggleAccount(a.customerId)}
                    products={products}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedAccounts.size === 0 && allAccounts.length > 0 && (
        <div className="flex justify-end">
          <Button
            size="sm" variant="ghost"
            className="text-xs text-muted-foreground"
            onClick={selectAll}
            data-testid="button-select-all-footer"
          >
            Select all {allAccounts.length} accounts for bulk action
          </Button>
        </div>
      )}

      <GenerateRecurringDialog open={recurringOpen} onClose={() => setRecurringOpen(false)} />
      <AddChargeDialog open={addChargeOpen} onClose={() => setAddChargeOpen(false)} customers={customers} products={products} />
      <InvoiceRunDialog open={runDialogOpen} onClose={() => setRunDialogOpen(false)} cutoff={cutoff} summary={summary} />
    </div>
  );
}

// ─── All Charges Tab ──────────────────────────────────────────────────────────
function AllChargesTab() {
  const [filterStatus, setFilterStatus] = useState("unbilled");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterSourceType, setFilterSourceType] = useState("all");
  const [filterCustomer, setFilterCustomer] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: charges = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/billing/charges", filterStatus, filterCategory, filterSourceType, filterCustomer, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("billingStatus", filterStatus);
      if (filterCategory !== "all") params.set("revenueCategory", filterCategory);
      if (filterSourceType !== "all") params.set("sourceType", filterSourceType);
      if (filterCustomer !== "all") params.set("customerId", filterCustomer);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const r = await fetch(`/api/billing/charges?${params}`, { credentials: "include" });
      return r.json();
    },
  });

  const { data: customers = [] } = useQuery<any[]>({ queryKey: ["/api/customers"] });

  const voidMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/billing/charges/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/billing/charges"] }),
  });

  const clearFilters = () => {
    setFilterStatus("unbilled");
    setFilterCategory("all");
    setFilterSourceType("all");
    setFilterCustomer("all");
    setDateFrom("");
    setDateTo("");
  };

  const hasActiveFilters = filterStatus !== "unbilled" || filterCategory !== "all" || filterSourceType !== "all" || filterCustomer !== "all" || dateFrom || dateTo;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36" data-testid="select-filter-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="unbilled">Unbilled</SelectItem>
              <SelectItem value="billed">Billed</SelectItem>
              <SelectItem value="voided">Voided</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterSourceType} onValueChange={setFilterSourceType}>
            <SelectTrigger className="w-36" data-testid="select-filter-source-type"><SelectValue placeholder="Source Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {Object.entries(SOURCE_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-40" data-testid="select-filter-category"><SelectValue placeholder="All Categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {PRODUCT_REVENUE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{REVENUE_CATEGORY_LABELS[c]}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterCustomer} onValueChange={setFilterCustomer}>
            <SelectTrigger className="w-44" data-testid="select-filter-customer"><SelectValue placeholder="All Accounts" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts</SelectItem>
              {customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.customerName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36 h-8 text-sm" data-testid="input-date-from" />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36 h-8 text-sm" data-testid="input-date-to" />
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground" data-testid="button-clear-filters">
              Clear filters
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {charges.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                      No charges found
                    </TableCell>
                  </TableRow>
                ) : charges.map((c: any) => (
                  <TableRow key={c.id} data-testid={`row-charge-all-${c.id}`}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(c.chargeDate)}</TableCell>
                    <TableCell className="text-sm font-medium">{c.customerName || "—"}</TableCell>
                    <TableCell className="text-sm max-w-[180px] truncate">{c.description}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge className={`text-xs ${SOURCE_TYPE_COLORS[c.sourceType] || SOURCE_TYPE_COLORS.manual}`}>
                          {SOURCE_TYPE_LABELS[c.sourceType] || c.sourceType}
                        </Badge>
                        {c.chargeSource && (
                          <Badge className={`text-xs ${CHARGE_SOURCE_COLORS[c.chargeSource] || CHARGE_SOURCE_COLORS.manual}`}>
                            {CHARGE_SOURCE_LABELS[c.chargeSource] || c.chargeSource}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {c.revenueCategory ? (
                        <Badge className={`text-xs ${REVENUE_CATEGORY_COLORS[c.revenueCategory] || ""}`}>
                          {REVENUE_CATEGORY_LABELS[c.revenueCategory] || c.revenueCategory}
                        </Badge>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.productName || "—"}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums font-semibold">{fmt(c.amount)}</TableCell>
                    <TableCell>
                      {c.billingStatus === "unbilled" && <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-xs">Unbilled</Badge>}
                      {c.billingStatus === "billed" && <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 text-xs">Billed</Badge>}
                      {c.billingStatus === "voided" && <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 text-xs">Voided</Badge>}
                    </TableCell>
                    <TableCell>
                      {c.billingStatus === "unbilled" && (
                        <Button
                          size="icon" variant="ghost"
                          onClick={() => voidMut.mutate(c.id)}
                          disabled={voidMut.isPending}
                          data-testid={`button-void-${c.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
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
    </div>
  );
}

// ─── Billing Cutoff Settings ──────────────────────────────────────────────────
const DAY_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const CUTOFF_RULE_OPTIONS = [
  { value: "same_day_end",     label: "Billing Day at 11:59 PM",  description: "Charges dated on or before the billing day are included." },
  { value: "previous_day_end", label: "Day Before at 11:59 PM",   description: "Only charges dated before the billing day are included." },
  { value: "same_day_start",   label: "Billing Day at 12:00 AM",  description: "Only charges strictly before the billing day are included." },
];

const TZ_OPTIONS = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
];

function BillingCutoffSettings() {
  const { toast } = useToast();

  const { data: cfg, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/billing/cutoff-config"],
  });

  const [form, setForm] = useState({
    day: "2",
    cutoffRule: "same_day_end",
    timezone: "America/Los_Angeles",
    lockAfterRun: false,
  });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (cfg) {
      setForm({
        day: String(cfg.day ?? 2),
        cutoffRule: cfg.cutoffRule ?? "same_day_end",
        timezone: cfg.timezone ?? "America/Los_Angeles",
        lockAfterRun: cfg.lockAfterRun ?? false,
      });
      setDirty(false);
    }
  }, [cfg]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/billing/cutoff-config", {
        day: Number(form.day),
        cutoffRule: form.cutoffRule,
        timezone: form.timezone,
        lockAfterRun: form.lockAfterRun,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed to save"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/cutoff-config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/cutoff"] });
      setDirty(false);
      toast({ title: "Billing cutoff settings saved" });
    },
    onError: (e: any) => toast({ title: "Failed to save", description: e.message, variant: "destructive" }),
  });

  const fmtDate = (s?: string | null) => {
    if (!s) return "—";
    const [y, m, d] = s.split("-");
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  };

  const selectedRule = CUTOFF_RULE_OPTIONS.find(r => r.value === form.cutoffRule);

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Current Cycle Preview ──────────────────────────────────────────────── */}
      {cfg && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Current Billing Cycle
            </CardTitle>
            <CardDescription>Computed from the saved configuration below.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">Billing Day</p>
                <p className="text-sm font-medium">{cfg.billingDayName}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">Effective Cutoff</p>
                <p className="text-sm font-medium">{cfg.cutoffTimeLabel}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">Cycle Window</p>
                <p className="text-sm font-medium">{fmtDate(cfg.billingWeekStart)} → {fmtDate(cfg.billingWeekEnd)}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">Days Until Billing Day</p>
                <p className="text-sm font-medium">
                  {cfg.daysUntilBillingDay === 0 ? "Today" : `${cfg.daysUntilBillingDay} day${cfg.daysUntilBillingDay !== 1 ? "s" : ""}`}
                </p>
              </div>
            </div>
            {cfg.lastRunDate && (
              <div className="mt-4 pt-3 border-t flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                <span className="text-muted-foreground">
                  Last billing run completed on <strong>{fmtDate(cfg.lastRunDate)}</strong>
                  {cfg.lastRunCycleStart && ` for cycle ${fmtDate(cfg.lastRunCycleStart)} → ${fmtDate(cfg.lastRunCycleEnd)}`}.
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Configuration Form ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            Cutoff Configuration
          </CardTitle>
          <CardDescription>
            Define which charges are included in each billing cycle and how the cutoff is enforced.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Billing Day */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <Label>Billing Day</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              The day of the week on which each billing cycle closes and invoices are assembled.
            </p>
            <Select
              value={form.day}
              onValueChange={v => { setForm(f => ({ ...f, day: v })); setDirty(true); }}
            >
              <SelectTrigger className="w-56" data-testid="select-billing-day">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Cutoff Rule */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Label>Cutoff Rule</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Controls the effective cutoff boundary for charges. Charges after the cutoff are excluded from the current cycle.
            </p>
            <div className="space-y-2">
              {CUTOFF_RULE_OPTIONS.map(opt => (
                <div
                  key={opt.value}
                  onClick={() => { setForm(f => ({ ...f, cutoffRule: opt.value })); setDirty(true); }}
                  className={`flex items-start gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors ${
                    form.cutoffRule === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover-elevate"
                  }`}
                  data-testid={`radio-cutoff-rule-${opt.value}`}
                >
                  <div className={`mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                    form.cutoffRule === opt.value ? "border-primary" : "border-muted-foreground"
                  }`}>
                    {form.cutoffRule === opt.value && <div className="h-2 w-2 rounded-full bg-primary" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Timezone */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <Label>Timezone</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Timezone used when evaluating the cutoff boundary. Affects how "end of day" is interpreted for the cutoff rule.
            </p>
            <Select
              value={form.timezone}
              onValueChange={v => { setForm(f => ({ ...f, timezone: v })); setDirty(true); }}
            >
              <SelectTrigger className="w-64" data-testid="select-cutoff-timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TZ_OPTIONS.map(tz => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Lock After Run */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <Label>Lock After Billing Run</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                When enabled, the billing run for the current cycle is blocked after the first successful execution.
                This prevents accidental double-billing. A super admin can override with <code className="text-xs bg-muted px-1 rounded">force=true</code>.
              </p>
            </div>
            <Switch
              checked={form.lockAfterRun}
              onCheckedChange={v => { setForm(f => ({ ...f, lockAfterRun: v })); setDirty(true); }}
              data-testid="switch-lock-after-run"
            />
          </div>

          {/* Live Preview Banner */}
          {selectedRule && (
            <div className="rounded-md border bg-muted/40 px-3 py-2.5 flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
              <span>
                With this configuration, charges dated through <strong>{
                  form.cutoffRule === "previous_day_end"
                    ? `the day before ${DAY_OPTIONS.find(d => d.value === form.day)?.label}`
                    : DAY_OPTIONS.find(d => d.value === form.day)?.label
                }</strong> will be included in each billing cycle.
                The billing run enforces this cutoff automatically — charges after this point
                are queued for the <em>next</em> cycle.
              </span>
            </div>
          )}

        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!dirty || saveMutation.isPending}
          data-testid="btn-save-cutoff-config"
        >
          {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Settings
        </Button>
        {!dirty && !saveMutation.isPending && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            Settings are saved
          </span>
        )}
        {dirty && (
          <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            Unsaved changes
          </span>
        )}
        <Button variant="ghost" size="icon" onClick={() => refetch()} data-testid="btn-refresh-cutoff-config">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Invoice Assembly Tab ─────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  labor: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  moves: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  rideshare: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  fees: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  other: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function InvoiceAssemblyTab() {
  const { toast } = useToast();
  const now = new Date();
  const defaultCycleEnd = now.toISOString().slice(0, 10);
  const defaultCycleStart = (() => {
    const d = new Date(now); d.setUTCDate(d.getUTCDate() - 6); return d.toISOString().slice(0, 10);
  })();

  const [cycleStart, setCycleStart] = useState(defaultCycleStart);
  const [cycleEnd, setCycleEnd] = useState(defaultCycleEnd);
  const [paymentTermsDays, setPaymentTermsDays] = useState(30);
  const [previewResult, setPreviewResult] = useState<any | null>(null);
  const [commitResult, setCommitResult] = useState<any | null>(null);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const previewMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/billing/assembly/preview", data),
    onSuccess: (data: any) => {
      setPreviewResult(data);
      setCommitResult(null);
      const eligible = data.results?.filter((r: any) => r.status === "preview").length ?? 0;
      const skipped = data.results?.filter((r: any) => r.status === "skipped").length ?? 0;
      toast({ title: "Preview complete", description: `${eligible} accounts eligible · ${skipped} skipped` });
    },
    onError: (e: any) => toast({ title: "Preview failed", description: e.message, variant: "destructive" }),
  });

  const commitMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/billing/assembly/commit", data),
    onSuccess: (data: any) => {
      setCommitResult(data);
      setPreviewResult(null);
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/billing/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
      const parts: string[] = [];
      if (data.invoicesCreated > 0) parts.push(`${data.invoicesCreated} created`);
      if (data.invoicesAppended > 0) parts.push(`${data.invoicesAppended} updated`);
      toast({
        title: "Invoice assembly complete",
        description: parts.join(" · ") || "No changes",
      });
    },
    onError: (e: any) => {
      setConfirmOpen(false);
      toast({ title: "Assembly failed", description: e.message, variant: "destructive" });
    },
  });

  const handlePreview = () => {
    previewMut.mutate({ cycleStart, cycleEnd });
  };

  const handleCommit = () => {
    commitMut.mutate({ cycleStart, cycleEnd, paymentTermsDays });
  };

  const activeResult = previewResult ?? commitResult;
  const isCommitted = !!commitResult;

  return (
    <div className="space-y-5">
      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FilePlus className="h-4 w-4 text-primary" />
            Invoice Assembly Engine
          </CardTitle>
          <CardDescription>
            Groups eligible unbilled charges into structured draft invoices — one per account, per cycle. Identical eligibility and grouping logic runs for both preview and commit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="asm-cycle-start">Cycle Start</Label>
              <Input id="asm-cycle-start" type="date" value={cycleStart} onChange={e => setCycleStart(e.target.value)} data-testid="input-assembly-cycle-start" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asm-cycle-end">Cycle End (Cutoff)</Label>
              <Input id="asm-cycle-end" type="date" value={cycleEnd} onChange={e => setCycleEnd(e.target.value)} data-testid="input-assembly-cycle-end" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asm-terms">Payment Terms (days)</Label>
              <Input id="asm-terms" type="number" min={0} max={365} value={paymentTermsDays} onChange={e => setPaymentTermsDays(parseInt(e.target.value) || 30)} data-testid="input-assembly-terms" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={handlePreview}
              disabled={previewMut.isPending || !cycleStart || !cycleEnd}
              data-testid="button-assembly-preview"
            >
              {previewMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
              Preview Assembly
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!previewResult || commitMut.isPending}
              data-testid="button-assembly-commit"
            >
              {commitMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
              Commit Invoices
            </Button>
            {(previewResult || commitResult) && (
              <Button variant="ghost" size="sm" onClick={() => { setPreviewResult(null); setCommitResult(null); }} data-testid="button-assembly-clear">
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results Summary */}
      {activeResult && (
        <div className="space-y-4">
          {/* KPI bar */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card><CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold">{activeResult.accountsProcessed}</div>
              <div className="text-xs text-muted-foreground">Accounts Processed</div>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {isCommitted ? activeResult.invoicesCreated : activeResult.results?.filter((r: any) => r.status === "preview").length ?? 0}
              </div>
              <div className="text-xs text-muted-foreground">{isCommitted ? "Invoices Created" : "Eligible Accounts"}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold">{activeResult.totalChargesIncluded}</div>
              <div className="text-xs text-muted-foreground">Charges Included</div>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {fmt(activeResult.totalAmount)}
              </div>
              <div className="text-xs text-muted-foreground">Total Billed</div>
            </CardContent></Card>
          </div>

          {/* Status banner */}
          {isCommitted && (
            <div className="rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Assembly committed successfully</p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  {activeResult.invoicesCreated} invoice{activeResult.invoicesCreated !== 1 ? "s" : ""} created · {activeResult.invoicesAppended} appended · {activeResult.totalChargesIncluded} charges linked
                </p>
              </div>
            </div>
          )}

          {!isCommitted && (
            <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 flex items-center gap-3">
              <Eye className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Preview only — no changes have been made</p>
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  Review the proposed invoice structure below, then click &quot;Commit Invoices&quot; to create draft invoices.
                </p>
              </div>
            </div>
          )}

          {/* Per-account results */}
          <div className="space-y-3">
            {(activeResult.results as any[]).map((r: any) => (
              <Card key={r.customerId} data-testid={`card-assembly-account-${r.customerId}`}>
                <CardHeader
                  className="pb-2 cursor-pointer select-none"
                  onClick={() => setExpandedAccount(expandedAccount === r.customerId ? null : r.customerId)}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {expandedAccount === r.customerId
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <span className="font-semibold text-sm">{r.customerName}</span>
                      <Badge variant="outline" className="text-xs">{r.customerId.slice(0, 8)}</Badge>
                      <Badge className={
                        r.status === "created" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" :
                        r.status === "appended" ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" :
                        r.status === "skipped" ? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" :
                        r.status === "error" ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" :
                        "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                      }>
                        {r.status === "preview" ? "eligible" : r.status}
                      </Badge>
                      {r.invoiceNumber && (
                        <span className="text-xs text-muted-foreground font-mono">{r.invoiceNumber}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">{r.includedCharges} charge{r.includedCharges !== 1 ? "s" : ""}</span>
                      {r.excludedCharges > 0 && (
                        <span className="text-amber-600 dark:text-amber-400">{r.excludedCharges} excluded</span>
                      )}
                      <span className="font-semibold">{fmt(r.subtotal)}</span>
                    </div>
                  </div>
                  {r.validationErrors?.length > 0 && (
                    <div className="ml-6 mt-1 text-xs text-red-600 dark:text-red-400">
                      {r.validationErrors.map((e: string, i: number) => <div key={i}>{e}</div>)}
                    </div>
                  )}
                </CardHeader>

                {expandedAccount === r.customerId && (
                  <CardContent className="pt-0 space-y-3">
                    {/* Line items table */}
                    {r.lines?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Invoice Lines</p>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Description</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                              <TableHead className="text-right">Rate</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                              <TableHead className="text-right">Charges</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {r.lines.map((line: any) => (
                              <TableRow key={line.groupingKey}>
                                <TableCell className="text-sm">{line.description}</TableCell>
                                <TableCell>
                                  <Badge className={CATEGORY_COLORS[line.revenueCategory] ?? CATEGORY_COLORS.other}>
                                    {line.revenueCategory}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right text-sm font-mono">{line.quantity}</TableCell>
                                <TableCell className="text-right text-sm font-mono">{fmt(line.rate)}</TableCell>
                                <TableCell className="text-right text-sm font-semibold">{fmt(line.amount)}</TableCell>
                                <TableCell className="text-right text-xs text-muted-foreground">{line.chargeIds?.length}</TableCell>
                              </TableRow>
                            ))}
                            <TableRow>
                              <TableCell colSpan={4} className="text-right text-sm font-semibold border-t">Subtotal</TableCell>
                              <TableCell className="text-right text-sm font-bold border-t">{fmt(r.subtotal)}</TableCell>
                              <TableCell className="border-t" />
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {/* Exclusions */}
                    {r.exclusions?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                          Excluded Charges ({r.exclusions.length})
                        </p>
                        <div className="rounded-md border border-amber-200 dark:border-amber-800 overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Charge ID</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead>Reason</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {r.exclusions.map((ex: any) => (
                                <TableRow key={ex.chargeId}>
                                  <TableCell className="text-xs font-mono text-muted-foreground">{ex.chargeId.slice(0, 8)}</TableCell>
                                  <TableCell className="text-xs">{fmtDate(ex.chargeDate)}</TableCell>
                                  <TableCell className="text-xs">{ex.description || "—"}</TableCell>
                                  <TableCell className="text-right text-xs">{fmt(ex.amount)}</TableCell>
                                  <TableCell className="text-xs text-amber-700 dark:text-amber-400">{ex.reason}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    {r.status === "skipped" && r.exclusions?.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-3">No eligible charges found in this billing cycle.</p>
                    )}
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Commit Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Confirm Invoice Assembly
            </DialogTitle>
            <DialogDescription>
              This will create or update draft invoices and mark all eligible charges as billed. This action cannot be undone automatically — invoices can be manually cancelled if needed.
            </DialogDescription>
          </DialogHeader>
          {previewResult && (
            <div className="rounded-md bg-muted px-4 py-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Cycle</span><span className="font-medium">{fmtDate(cycleStart)} – {fmtDate(cycleEnd)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Accounts eligible</span><span className="font-medium">{previewResult.results?.filter((r: any) => r.status === "preview").length ?? 0}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Charges to be linked</span><span className="font-medium">{previewResult.totalChargesIncluded}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total billed</span><span className="font-semibold text-emerald-600 dark:text-emerald-400">{fmt(previewResult.totalAmount)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Payment terms</span><span className="font-medium">Net {paymentTermsDays}</span></div>
            </div>
          )}
          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} data-testid="button-assembly-cancel-confirm">Cancel</Button>
            <Button onClick={handleCommit} disabled={commitMut.isPending} data-testid="button-assembly-confirm">
              {commitMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Commit {previewResult?.results?.filter((r: any) => r.status === "preview").length ?? ""} Invoice{previewResult?.results?.filter((r: any) => r.status === "preview").length !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Auto-Generate Tab ────────────────────────────────────────────────────────
const SOURCE_CONFIGS = [
  {
    key: "scheduling_labor",
    label: "Scheduling Labor",
    description: "Converts WIW clocked-out time records into labor charges using each account's active labor product. One charge per punch-out, priced at hours × rate.",
    icon: Users,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    borderColor: "border-blue-200 dark:border-blue-800",
    endpoint: "/api/billing/charges/generate/scheduling",
    supportsDateRange: true,
  },
  {
    key: "move_completed",
    label: "Completed Moves",
    description: "Creates one charge per completed move in the partner move staging table. Uses the account's active moves product and the move's cost value.",
    icon: Truck,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-950/30",
    borderColor: "border-orange-200 dark:border-orange-800",
    endpoint: "/api/billing/charges/generate/moves",
    supportsDateRange: true,
  },
  {
    key: "rideshare_transaction",
    label: "Rideshare Transactions",
    description: "Converts matched rideshare transactions (Uber/Lyft) into charges using each account's rideshare product. Amount = totalFare from the transaction.",
    icon: Activity,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-950/30",
    borderColor: "border-purple-200 dark:border-purple-800",
    endpoint: "/api/billing/charges/generate/rideshare",
    supportsDateRange: true,
  },
  {
    key: "recurring_monthly",
    label: "Recurring Monthly",
    description: "Generates one charge per active account-product assignment with monthly billing frequency. Idempotent — safe to run multiple times for the same month.",
    icon: RotateCcw,
    color: "text-violet-600 dark:text-violet-400",
    bgColor: "bg-violet-50 dark:bg-violet-950/30",
    borderColor: "border-violet-200 dark:border-violet-800",
    endpoint: "/api/billing/charges/generate-recurring",
    supportsDateRange: false,
  },
];

function GenerationResultBadges({ result }: { result: any }) {
  if (!result) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap mt-2">
      {result.created > 0 && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">
          <CheckCircle2 className="h-3 w-3" /> {result.created} created
        </span>
      )}
      {(result.skipped ?? 0) > 0 && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {result.skipped} skipped
        </span>
      )}
      {(result.noProduct ?? 0) > 0 && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full">
          <AlertTriangle className="h-3 w-3" /> {result.noProduct} no product
        </span>
      )}
      {result.created === 0 && (result.skipped ?? 0) === 0 && (result.noProduct ?? 0) === 0 && (
        <span className="text-xs text-muted-foreground">No eligible records found</span>
      )}
    </div>
  );
}

function AutoGenerateTab() {
  const { toast } = useToast();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [billingMonth, setBillingMonth] = useState(currentMonthStr());
  const [results, setResults] = useState<Record<string, any>>({});
  const [allResult, setAllResult] = useState<any | null>(null);

  // Each useMutation call is unconditional at the component top level (Rules of Hooks)
  const schedMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing/charges/generate/scheduling", { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined });
      return res.json();
    },
    onSuccess: (data: any) => {
      setResults(r => ({ ...r, scheduling_labor: data }));
      queryClient.invalidateQueries({ queryKey: ["/api/billing/charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/summary"] });
      toast({ title: "Scheduling Labor complete", description: data.created > 0 ? `${data.created} charge(s) created` : "No new charges" });
    },
    onError: (e: any) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  const movesMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing/charges/generate/moves", { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined });
      return res.json();
    },
    onSuccess: (data: any) => {
      setResults(r => ({ ...r, move_completed: data }));
      queryClient.invalidateQueries({ queryKey: ["/api/billing/charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/summary"] });
      toast({ title: "Completed Moves complete", description: data.created > 0 ? `${data.created} charge(s) created` : "No new charges" });
    },
    onError: (e: any) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  const rsMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing/charges/generate/rideshare", { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined });
      return res.json();
    },
    onSuccess: (data: any) => {
      setResults(r => ({ ...r, rideshare_transaction: data }));
      queryClient.invalidateQueries({ queryKey: ["/api/billing/charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/summary"] });
      toast({ title: "Rideshare Transactions complete", description: data.created > 0 ? `${data.created} charge(s) created` : "No new charges" });
    },
    onError: (e: any) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  const recurMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing/charges/generate-recurring", { billingMonth });
      return res.json();
    },
    onSuccess: (data: any) => {
      setResults(r => ({ ...r, recurring_monthly: data }));
      queryClient.invalidateQueries({ queryKey: ["/api/billing/charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/summary"] });
      toast({ title: "Recurring Monthly complete", description: data.created > 0 ? `${data.created} charge(s) created` : "No new charges" });
    },
    onError: (e: any) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  const mutsByKey: Record<string, ReturnType<typeof useMutation>> = {
    scheduling_labor: schedMut,
    move_completed: movesMut,
    rideshare_transaction: rsMut,
    recurring_monthly: recurMut,
  };

  const runAllMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing/charges/generate/all", {
        billingMonth,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      setAllResult(data);
      // Unpack per-source results
      const newResults: Record<string, any> = {};
      for (const r of data.results ?? []) newResults[r.sourceType] = r;
      setResults(newResults);
      queryClient.invalidateQueries({ queryKey: ["/api/billing/charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/summary"] });
      toast({
        title: "All sources complete",
        description: `${data.totalCreated} total charge(s) created`,
      });
    },
    onError: (e: any) => toast({ title: "Run All failed", description: e.message, variant: "destructive" }),
  });

  const anyRunning = Object.values(mutsByKey).some(m => m.isPending) || runAllMut.isPending;

  return (
    <div className="space-y-5">
      {/* Header + Run All */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Automated Charge Generation</h2>
          <p className="text-sm text-muted-foreground">
            Convert operational data into unbilled charges that feed the weekly invoice run. All generators are idempotent — safe to re-run.
          </p>
        </div>
        <Button
          onClick={() => { setAllResult(null); runAllMut.mutate(); }}
          disabled={anyRunning}
          data-testid="button-run-all-generators"
        >
          {runAllMut.isPending
            ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            : <PlayCircle className="h-4 w-4 mr-2" />}
          Run All Sources
        </Button>
      </div>

      {/* Date / month filters */}
      <div className="rounded-md border bg-muted/30 px-4 py-3 space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Filters (applied to date-ranged sources)</p>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="block h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              data-testid="input-gen-date-from"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="block h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              data-testid="input-gen-date-to"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Billing Month (recurring only)</label>
            <input
              type="month"
              value={billingMonth}
              onChange={e => setBillingMonth(e.target.value)}
              className="block h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              data-testid="input-gen-billing-month"
            />
          </div>
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }}>
              Clear dates
            </Button>
          )}
        </div>
      </div>

      {/* Run All result summary */}
      {allResult && (
        <div className="rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            Run All complete — {allResult.totalCreated} total charge(s) created
          </div>
        </div>
      )}

      {/* Per-source cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {SOURCE_CONFIGS.map(cfg => {
          const mut = mutsByKey[cfg.key];
          const result = results[cfg.key];
          const Icon = cfg.icon;

          return (
            <div key={cfg.key} className={`rounded-md border ${cfg.borderColor} ${cfg.bgColor} p-4 space-y-3`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${cfg.color}`} />
                  <span className="font-semibold text-sm">{cfg.label}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => mut.mutate()}
                  disabled={anyRunning}
                  data-testid={`button-generate-${cfg.key}`}
                >
                  {mut.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <PlayCircle className="h-3.5 w-3.5" />}
                  <span className="ml-1.5">Run</span>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{cfg.description}</p>
              {!cfg.supportsDateRange && (
                <p className="text-xs text-muted-foreground italic">Uses billing month filter above.</p>
              )}
              <GenerationResultBadges result={result} />
            </div>
          );
        })}
      </div>

      {/* Info banner */}
      <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-xs text-blue-800 dark:text-blue-300 space-y-1">
        <div className="font-semibold">How it works</div>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Each generator is <strong>idempotent</strong> — duplicate charges are automatically skipped via unique source reference IDs</li>
          <li>All generated charges enter as <strong>Unbilled</strong> and are swept into the next weekly invoice run</li>
          <li><strong>No product assigned</strong> means the account has no active product for that revenue category — assign one in Account Products</li>
          <li>After generation, review charges in the <strong>Billing Candidates</strong> tab before running the invoice</li>
        </ul>
      </div>
    </div>
  );
}

export default function BillingEngine() {
  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-primary/10 p-2">
          <Zap className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold" data-testid="text-billing-engine-title">Billing Engine</h1>
          <p className="text-sm text-muted-foreground">Charge staging pipeline → weekly invoice assembly</p>
        </div>
      </div>

      <Tabs defaultValue="weekly-run">
        <TabsList>
          <TabsTrigger value="weekly-run" data-testid="tab-weekly-run">
            <CalendarCheck className="h-3.5 w-3.5 mr-1.5" />
            Weekly Billing
          </TabsTrigger>
          <TabsTrigger value="candidates" data-testid="tab-candidates">
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Billing Candidates
          </TabsTrigger>
          <TabsTrigger value="auto-generate" data-testid="tab-auto-generate">
            <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
            Auto-Generate
          </TabsTrigger>
          <TabsTrigger value="assembly" data-testid="tab-assembly">
            <FilePlus className="h-3.5 w-3.5 mr-1.5" />
            Invoice Assembly
          </TabsTrigger>
          <TabsTrigger value="all-charges" data-testid="tab-all-charges">
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            All Charges
          </TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-billing-settings">
            <Settings className="h-3.5 w-3.5 mr-1.5" />
            Settings
          </TabsTrigger>
        </TabsList>
        <TabsContent value="weekly-run" className="mt-4">
          <WeeklyBillingControlPanel />
        </TabsContent>
        <TabsContent value="candidates" className="mt-4">
          <BillingCandidatesTab />
        </TabsContent>
        <TabsContent value="auto-generate" className="mt-4">
          <AutoGenerateTab />
        </TabsContent>
        <TabsContent value="assembly" className="mt-4">
          <InvoiceAssemblyTab />
        </TabsContent>
        <TabsContent value="all-charges" className="mt-4">
          <AllChargesTab />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <BillingCutoffSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
