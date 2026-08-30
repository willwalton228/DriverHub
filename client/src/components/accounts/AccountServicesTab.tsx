import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Briefcase, Plus, ChevronDown, ChevronRight, Pencil, Trash2, Loader2,
  CalendarDays, DollarSign, Users, Zap, RefreshCw, ToggleLeft, ToggleRight,
  Info, Tag, Clock, Package,
} from "lucide-react";
import {
  PRODUCT_TYPE_LABELS, BILLING_FREQUENCY_LABELS, PRODUCT_REVENUE_CATEGORY_LABELS,
} from "@shared/schema";

// ─── Constants ────────────────────────────────────────────────────────────────
const BILLING_METHOD_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "per_move", label: "Per Move" },
  { value: "per_trip", label: "Per Trip" },
  { value: "flat_rate", label: "Flat Rate" },
  { value: "hybrid", label: "Hybrid" },
];

const RATE_TYPE_OPTIONS = [
  { value: "regular", label: "Regular" },
  { value: "overtime", label: "Overtime" },
  { value: "holiday", label: "Holiday" },
  { value: "custom", label: "Custom" },
];

const BILLING_UNIT_OPTIONS = [
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "per_move", label: "Per Move" },
  { value: "per_trip", label: "Per Trip" },
  { value: "flat", label: "Flat" },
];

const BILLING_RULE_OPTIONS = [
  { value: "__none__", label: "— Use Product Default —" },
  { value: "consolidated", label: "Consolidated (one invoice)" },
  { value: "per_location", label: "Per Location" },
  { value: "per_job", label: "Per Job" },
  { value: "immediate", label: "Immediate" },
  { value: "next_cycle", label: "Next Invoice Cycle" },
];

const TYPE_COLORS: Record<string, string> = {
  one_time: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  recurring: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
  usage: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  operational: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
};

const CATEGORY_COLORS: Record<string, string> = {
  labor: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  moves: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  rideshare: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  insurance: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  technology: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
  fees: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  other: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtCurrency(val: number | string | null | undefined) {
  if (val === null || val === undefined || val === "") return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(val));
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function isExpired(endDate: string | null | undefined) {
  if (!endDate) return false;
  return new Date(endDate + "T23:59:59") < new Date();
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Rate {
  id: string;
  position_id: string;
  bill_rate: string;
  pay_rate: string | null;
  rate_type: string;
  effective_date: string;
  end_date: string | null;
  billing_unit: string;
  overtime_eligible: boolean;
  notes: string | null;
  is_active: boolean;
}

interface Position {
  id: string;
  account_product_id: string;
  position_name: string;
  schedule_position: string | null;
  shift_position: string | null;
  quantity: number;
  coverage_notes: string | null;
  is_active: boolean;
  rates: Rate[];
}

interface Service {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  unit_price: string;
  product_type: string | null;
  pricing_model: string | null;
  billing_frequency: string | null;
  revenue_category: string | null;
  product_description: string | null;
  price_override: string | null;
  billing_rule_override: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
  program: string | null;
  launch_date: string | null;
  billing_method: string | null;
  billing_frequency_override: string | null;
  invoice_group: string | null;
  operational_notes: string | null;
  positions: Position[];
}

// ─── Empty form defaults ──────────────────────────────────────────────────────
const emptyServiceForm = {
  productId: "", priceOverride: "", billingRuleOverride: "",
  startDate: "", endDate: "", isActive: true, notes: "",
  program: "", launchDate: "", billingMethod: "", billingFrequencyOverride: "",
  invoiceGroup: "", operationalNotes: "",
};
const emptyPositionForm = {
  positionName: "", schedulePosition: "", shiftPosition: "",
  quantity: "1", coverageNotes: "",
};
const emptyRateForm = {
  billRate: "", payRate: "", rateType: "regular",
  effectiveDate: "", endDate: "", billingUnit: "hourly",
  overtimeEligible: false, notes: "",
};

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props { accountId: string; }

export default function AccountServicesTab({ accountId }: Props) {
  const { toast } = useToast();
  const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set());
  const [expandedPositions, setExpandedPositions] = useState<Set<string>>(new Set());
  const [showInactive, setShowInactive] = useState(false);

  // Service dialog state
  const [serviceDialog, setServiceDialog] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [serviceForm, setServiceForm] = useState({ ...emptyServiceForm });

  // Position dialog state
  const [positionDialog, setPositionDialog] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [positionServiceId, setPositionServiceId] = useState<string>("");
  const [positionForm, setPositionForm] = useState({ ...emptyPositionForm });

  // Rate dialog state
  const [rateDialog, setRateDialog] = useState(false);
  const [editingRate, setEditingRate] = useState<Rate | null>(null);
  const [ratePositionId, setRatePositionId] = useState<string>("");
  const [rateServiceId, setRateServiceId] = useState<string>("");
  const [rateForm, setRateForm] = useState({ ...emptyRateForm });

  // Queries
  const { data: services = [], isLoading, refetch } = useQuery<Service[]>({
    queryKey: ["/api/accounts", accountId, "services"],
    queryFn: async () => {
      const r = await fetch(`/api/accounts/${accountId}/services`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load services");
      return r.json();
    },
    enabled: !!accountId,
  });

  const { data: allProducts = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/products"],
  });

  const activeProducts = allProducts.filter((p: any) => p.isActive !== false);
  const assignedProductIds = new Set(services.filter((s) => s.is_active).map((s) => s.product_id));
  const availableProducts = activeProducts.filter((p: any) => !assignedProductIds.has(p.id));

  // ── Service mutations ──
  const servicesSvcKey = ["/api/accounts", accountId, "services"];

  const saveServiceMut = useMutation({
    mutationFn: async (data: any) => {
      const res = editingService
        ? await apiRequest("PATCH", `/api/accounts/${accountId}/services/${editingService.id}`, data)
        : await apiRequest("POST", `/api/accounts/${accountId}/services`, data);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed to save"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: editingService ? "Service updated" : "Service added to account" });
      queryClient.invalidateQueries({ queryKey: servicesSvcKey });
      closeServiceDialog();
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const toggleServiceMut = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/accounts/${accountId}/services/${id}`, { isActive });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: (_, v) => {
      toast({ title: v.isActive ? "Service reactivated" : "Service deactivated" });
      queryClient.invalidateQueries({ queryKey: servicesSvcKey });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Position mutations ──
  const savePositionMut = useMutation({
    mutationFn: async (data: any) => {
      const res = editingPosition
        ? await apiRequest("PATCH", `/api/accounts/${accountId}/services/${positionServiceId}/positions/${editingPosition.id}`, data)
        : await apiRequest("POST", `/api/accounts/${accountId}/services/${positionServiceId}/positions`, data);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed to save"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: editingPosition ? "Position updated" : "Position added" });
      queryClient.invalidateQueries({ queryKey: servicesSvcKey });
      closePositionDialog();
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const deletePositionMut = useMutation({
    mutationFn: async ({ serviceId, positionId }: { serviceId: string; positionId: string }) => {
      const res = await apiRequest("DELETE", `/api/accounts/${accountId}/services/${serviceId}/positions/${positionId}`);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
    },
    onSuccess: () => {
      toast({ title: "Position removed" });
      queryClient.invalidateQueries({ queryKey: servicesSvcKey });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Rate mutations ──
  const saveRateMut = useMutation({
    mutationFn: async (data: any) => {
      const res = editingRate
        ? await apiRequest("PATCH", `/api/accounts/${accountId}/services/${rateServiceId}/positions/${ratePositionId}/rates/${editingRate.id}`, data)
        : await apiRequest("POST", `/api/accounts/${accountId}/services/${rateServiceId}/positions/${ratePositionId}/rates`, data);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed to save"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: editingRate ? "Rate updated" : "Rate added" });
      queryClient.invalidateQueries({ queryKey: servicesSvcKey });
      closeRateDialog();
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const deleteRateMut = useMutation({
    mutationFn: async ({ serviceId, positionId, rateId }: { serviceId: string; positionId: string; rateId: string }) => {
      const res = await apiRequest("DELETE", `/api/accounts/${accountId}/services/${serviceId}/positions/${positionId}/rates/${rateId}`);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
    },
    onSuccess: () => {
      toast({ title: "Rate removed" });
      queryClient.invalidateQueries({ queryKey: servicesSvcKey });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Dialog openers / closers ──
  function openAddService() {
    setEditingService(null);
    setServiceForm({ ...emptyServiceForm });
    setServiceDialog(true);
  }
  function openEditService(s: Service) {
    setEditingService(s);
    setServiceForm({
      productId: s.product_id,
      priceOverride: s.price_override ?? "",
      billingRuleOverride: s.billing_rule_override ?? "",
      startDate: s.start_date ?? "",
      endDate: s.end_date ?? "",
      isActive: s.is_active,
      notes: s.notes ?? "",
      program: s.program ?? "",
      launchDate: s.launch_date ?? "",
      billingMethod: s.billing_method ?? "",
      billingFrequencyOverride: s.billing_frequency_override ?? "",
      invoiceGroup: s.invoice_group ?? "",
      operationalNotes: s.operational_notes ?? "",
    });
    setServiceDialog(true);
  }
  function closeServiceDialog() {
    setServiceDialog(false);
    setEditingService(null);
    setServiceForm({ ...emptyServiceForm });
  }

  function openAddPosition(serviceId: string) {
    setEditingPosition(null);
    setPositionServiceId(serviceId);
    setPositionForm({ ...emptyPositionForm });
    setPositionDialog(true);
  }
  function openEditPosition(serviceId: string, pos: Position) {
    setEditingPosition(pos);
    setPositionServiceId(serviceId);
    setPositionForm({
      positionName: pos.position_name,
      schedulePosition: pos.schedule_position ?? "",
      shiftPosition: pos.shift_position ?? "",
      quantity: String(pos.quantity),
      coverageNotes: pos.coverage_notes ?? "",
    });
    setPositionDialog(true);
  }
  function closePositionDialog() {
    setPositionDialog(false);
    setEditingPosition(null);
    setPositionForm({ ...emptyPositionForm });
  }

  function openAddRate(serviceId: string, positionId: string) {
    setEditingRate(null);
    setRateServiceId(serviceId);
    setRatePositionId(positionId);
    setRateForm({ ...emptyRateForm });
    setRateDialog(true);
  }
  function openEditRate(serviceId: string, positionId: string, rate: Rate) {
    setEditingRate(rate);
    setRateServiceId(serviceId);
    setRatePositionId(positionId);
    setRateForm({
      billRate: rate.bill_rate ?? "",
      payRate: rate.pay_rate ?? "",
      rateType: rate.rate_type,
      effectiveDate: rate.effective_date,
      endDate: rate.end_date ?? "",
      billingUnit: rate.billing_unit,
      overtimeEligible: rate.overtime_eligible,
      notes: rate.notes ?? "",
    });
    setRateDialog(true);
  }
  function closeRateDialog() {
    setRateDialog(false);
    setEditingRate(null);
    setRateForm({ ...emptyRateForm });
  }

  // ── Save handlers ──
  function handleSaveService() {
    if (!editingService && !serviceForm.productId) {
      toast({ title: "Select a product", variant: "destructive" }); return;
    }
    const payload: any = {
      priceOverride: serviceForm.priceOverride || null,
      billingRuleOverride: serviceForm.billingRuleOverride || null,
      startDate: serviceForm.startDate || null,
      endDate: serviceForm.endDate || null,
      isActive: serviceForm.isActive,
      notes: serviceForm.notes || null,
      program: serviceForm.program || null,
      launchDate: serviceForm.launchDate || null,
      billingMethod: serviceForm.billingMethod || null,
      billingFrequencyOverride: serviceForm.billingFrequencyOverride || null,
      invoiceGroup: serviceForm.invoiceGroup || null,
      operationalNotes: serviceForm.operationalNotes || null,
    };
    if (!editingService) payload.productId = serviceForm.productId;
    saveServiceMut.mutate(payload);
  }

  function handleSavePosition() {
    if (!positionForm.positionName.trim()) {
      toast({ title: "Position name is required", variant: "destructive" }); return;
    }
    savePositionMut.mutate({
      positionName: positionForm.positionName.trim(),
      schedulePosition: positionForm.schedulePosition || null,
      shiftPosition: positionForm.shiftPosition || null,
      quantity: parseInt(positionForm.quantity) || 1,
      coverageNotes: positionForm.coverageNotes || null,
    });
  }

  function handleSaveRate() {
    if (!rateForm.effectiveDate) {
      toast({ title: "Effective date is required", variant: "destructive" }); return;
    }
    saveRateMut.mutate({
      billRate: rateForm.billRate || 0,
      payRate: rateForm.payRate || null,
      rateType: rateForm.rateType,
      effectiveDate: rateForm.effectiveDate,
      endDate: rateForm.endDate || null,
      billingUnit: rateForm.billingUnit,
      overtimeEligible: rateForm.overtimeEligible,
      notes: rateForm.notes || null,
    });
  }

  // ── Toggle expansion ──
  function toggleService(id: string) {
    setExpandedServices(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function togglePosition(id: string) {
    setExpandedPositions(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const displayed = services.filter(s => showInactive || s.is_active !== false);
  const activeCount = services.filter(s => s.is_active !== false).length;
  const selectedProduct = allProducts.find((p: any) => p.id === serviceForm.productId);

  return (
    <div className="space-y-4 py-2">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            Services &amp; Billing
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeCount} active service{activeCount !== 1 ? "s" : ""} — commercial operations workspace
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Show inactive</Label>
            <Switch checked={showInactive} onCheckedChange={setShowInactive} data-testid="switch-show-inactive-svc" />
          </div>
          <Button size="icon" variant="outline" onClick={() => refetch()} data-testid="btn-refresh-svc">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={openAddService} data-testid="btn-add-service">
            <Plus className="mr-2 h-4 w-4" />
            Add Service
          </Button>
        </div>
      </div>

      {/* Info callout */}
      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
        <CardContent className="pt-3 pb-3">
          <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
            <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>
              Services reference the <strong>Product Catalog</strong> as the source of truth. Account-specific pricing, positions, and billing rules are configured here without modifying the master product.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border rounded-md">
          <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-sm">No services configured</p>
          <p className="text-xs mt-1">Add a service from the product catalog to begin tracking commercial activity for this account.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((svc) => {
            const expanded = expandedServices.has(svc.id);
            const expired = svc.is_active && isExpired(svc.end_date);
            const activePosCount = svc.positions.filter(p => p.is_active).length;

            return (
              <Card key={svc.id} className={!svc.is_active ? "opacity-60" : ""} data-testid={`svc-card-${svc.id}`}>
                <CardHeader className="py-3 px-4">
                  <div className="flex items-start gap-3 flex-wrap">
                    {/* Expand toggle */}
                    <button
                      onClick={() => toggleService(svc.id)}
                      className="mt-0.5 text-muted-foreground hover-elevate rounded"
                      data-testid={`btn-expand-svc-${svc.id}`}
                    >
                      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>

                    {/* Title & badges */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{svc.product_name}</span>
                        {svc.product_sku && (
                          <span className="text-xs font-mono text-muted-foreground">{svc.product_sku}</span>
                        )}
                        {svc.program && (
                          <Badge variant="outline" className="text-xs">
                            <Tag className="h-3 w-3 mr-1" />
                            {svc.program}
                          </Badge>
                        )}
                        {svc.product_type && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[svc.product_type] || "bg-gray-100 text-gray-600"}`}>
                            {PRODUCT_TYPE_LABELS[svc.product_type] || svc.product_type}
                          </span>
                        )}
                        {svc.revenue_category && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[svc.revenue_category] || "bg-gray-100 text-gray-600"}`}>
                            {PRODUCT_REVENUE_CATEGORY_LABELS[svc.revenue_category] || svc.revenue_category}
                          </span>
                        )}
                      </div>
                      {/* Quick summary row */}
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {svc.billing_method && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {BILLING_METHOD_OPTIONS.find(o => o.value === svc.billing_method)?.label || svc.billing_method}
                          </span>
                        )}
                        {svc.launch_date && (
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            Launch: {fmtDate(svc.launch_date)}
                          </span>
                        )}
                        {activePosCount > 0 && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {activePosCount} position{activePosCount !== 1 ? "s" : ""}
                          </span>
                        )}
                        {svc.price_override != null && (
                          <span className="flex items-center gap-1 text-primary font-medium">
                            <DollarSign className="h-3 w-3" />
                            {fmtCurrency(svc.price_override)} override
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status + Actions */}
                    <div className="flex items-center gap-2">
                      {expired ? (
                        <Badge variant="destructive" className="text-xs">Expired</Badge>
                      ) : svc.is_active ? (
                        <Badge variant="outline" className="text-xs text-green-700 border-green-300 dark:text-green-400">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Inactive</Badge>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => openEditService(svc)} data-testid={`btn-edit-svc-${svc.id}`} title="Edit service">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon" variant="ghost"
                        onClick={() => toggleServiceMut.mutate({ id: svc.id, isActive: !svc.is_active })}
                        disabled={toggleServiceMut.isPending}
                        data-testid={`btn-toggle-svc-${svc.id}`}
                        title={svc.is_active ? "Deactivate" : "Reactivate"}
                      >
                        {svc.is_active
                          ? <ToggleRight className="h-3.5 w-3.5 text-green-600" />
                          : <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {/* Expanded body */}
                {expanded && (
                  <CardContent className="px-4 pb-4 pt-0">
                    <Separator className="mb-4" />

                    {/* Commercial details grid */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4 sm:grid-cols-3">
                      <DetailField label="Billing Method" value={BILLING_METHOD_OPTIONS.find(o => o.value === svc.billing_method)?.label} />
                      <DetailField label="Billing Frequency" value={svc.billing_frequency_override
                        ? (BILLING_FREQUENCY_LABELS[svc.billing_frequency_override] || svc.billing_frequency_override)
                        : svc.billing_frequency
                          ? (BILLING_FREQUENCY_LABELS[svc.billing_frequency] || svc.billing_frequency) + " (product default)"
                          : null} />
                      <DetailField label="Invoice Group" value={svc.invoice_group} />
                      <DetailField label="Start Date" value={fmtDate(svc.start_date)} />
                      <DetailField label="End Date" value={svc.end_date ? fmtDate(svc.end_date) : null} />
                      <DetailField label="Billing Rule" value={
                        svc.billing_rule_override
                          ? BILLING_RULE_OPTIONS.find(o => o.value === svc.billing_rule_override)?.label
                          : null
                      } />
                      <DetailField label="Price Override" value={svc.price_override != null ? fmtCurrency(svc.price_override) : null} />
                    </div>

                    {svc.notes && (
                      <p className="text-xs text-muted-foreground mb-3 italic">{svc.notes}</p>
                    )}
                    {svc.operational_notes && (
                      <div className="mb-4 p-3 rounded-md bg-muted/50 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Operational Notes: </span>
                        {svc.operational_notes}
                      </div>
                    )}

                    {/* Positions section */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium flex items-center gap-2">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          Positions
                          {activePosCount > 0 && (
                            <Badge variant="secondary" className="text-xs">{activePosCount}</Badge>
                          )}
                        </h4>
                        <Button size="sm" variant="outline" onClick={() => openAddPosition(svc.id)} data-testid={`btn-add-pos-${svc.id}`}>
                          <Plus className="mr-1.5 h-3.5 w-3.5" />
                          Add Position
                        </Button>
                      </div>

                      {svc.positions.length === 0 ? (
                        <div className="text-center py-6 text-xs text-muted-foreground border rounded-md">
                          <Users className="h-6 w-6 mx-auto mb-2 opacity-30" />
                          No positions defined. Add positions to track staffing and rates.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {svc.positions.map(pos => {
                            const posExpanded = expandedPositions.has(pos.id);
                            const activeRates = pos.rates.filter(r => r.is_active);
                            return (
                              <div key={pos.id} className="border rounded-md" data-testid={`pos-row-${pos.id}`}>
                                {/* Position header */}
                                <div className="flex items-center gap-2 px-3 py-2.5">
                                  <button
                                    onClick={() => togglePosition(pos.id)}
                                    className="text-muted-foreground hover-elevate rounded"
                                    data-testid={`btn-expand-pos-${pos.id}`}
                                  >
                                    {posExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-medium">{pos.position_name}</span>
                                      {pos.quantity > 1 && (
                                        <Badge variant="secondary" className="text-xs">×{pos.quantity}</Badge>
                                      )}
                                      {pos.schedule_position && (
                                        <span className="text-xs text-muted-foreground">Sched: {pos.schedule_position}</span>
                                      )}
                                      {pos.shift_position && (
                                        <span className="text-xs text-muted-foreground">Shift: {pos.shift_position}</span>
                                      )}
                                      {activeRates.length > 0 && (
                                        <span className="text-xs font-medium text-primary">
                                          {fmtCurrency(activeRates[0]?.bill_rate)}/{activeRates[0]?.billing_unit?.replace("_", " ")}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Button size="icon" variant="ghost" onClick={() => openEditPosition(svc.id, pos)} data-testid={`btn-edit-pos-${pos.id}`} title="Edit position">
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <Button size="icon" variant="ghost"
                                      onClick={() => deletePositionMut.mutate({ serviceId: svc.id, positionId: pos.id })}
                                      disabled={deletePositionMut.isPending}
                                      data-testid={`btn-del-pos-${pos.id}`}
                                      title="Remove position"
                                    >
                                      <Trash2 className="h-3 w-3 text-destructive" />
                                    </Button>
                                  </div>
                                </div>

                                {/* Position expanded body */}
                                {posExpanded && (
                                  <div className="px-3 pb-3 border-t">
                                    {pos.coverage_notes && (
                                      <p className="text-xs text-muted-foreground mt-2 mb-2 italic">{pos.coverage_notes}</p>
                                    )}
                                    {/* Rates */}
                                    <div className="mt-2 space-y-1.5">
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                          <DollarSign className="h-3 w-3" />
                                          Rates
                                        </span>
                                        <Button size="sm" variant="ghost" onClick={() => openAddRate(svc.id, pos.id)} data-testid={`btn-add-rate-${pos.id}`}>
                                          <Plus className="mr-1 h-3 w-3" />
                                          Add Rate
                                        </Button>
                                      </div>

                                      {pos.rates.length === 0 ? (
                                        <div className="text-center py-3 text-xs text-muted-foreground border rounded-md">
                                          No rates defined for this position.
                                        </div>
                                      ) : (
                                        <div className="rounded-md border overflow-hidden">
                                          <Table>
                                            <TableHeader>
                                              <TableRow>
                                                <TableHead className="text-xs py-2">Type</TableHead>
                                                <TableHead className="text-xs py-2">Bill Rate</TableHead>
                                                <TableHead className="text-xs py-2">Pay Rate</TableHead>
                                                <TableHead className="text-xs py-2">Unit</TableHead>
                                                <TableHead className="text-xs py-2">Effective</TableHead>
                                                <TableHead className="text-xs py-2">Ends</TableHead>
                                                <TableHead className="text-xs py-2">Status</TableHead>
                                                <TableHead className="text-xs py-2 text-right">Actions</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {pos.rates.map(rate => {
                                                const rateExpired = rate.is_active && isExpired(rate.end_date);
                                                return (
                                                  <TableRow key={rate.id} className={!rate.is_active ? "opacity-50" : ""} data-testid={`rate-row-${rate.id}`}>
                                                    <TableCell className="text-xs py-2">
                                                      {RATE_TYPE_OPTIONS.find(o => o.value === rate.rate_type)?.label || rate.rate_type}
                                                      {rate.overtime_eligible && <span className="ml-1 text-muted-foreground">(OT eligible)</span>}
                                                    </TableCell>
                                                    <TableCell className="text-xs py-2 font-medium text-primary">{fmtCurrency(rate.bill_rate)}</TableCell>
                                                    <TableCell className="text-xs py-2 text-muted-foreground">{fmtCurrency(rate.pay_rate)}</TableCell>
                                                    <TableCell className="text-xs py-2 text-muted-foreground capitalize">{rate.billing_unit?.replace("_", " ")}</TableCell>
                                                    <TableCell className="text-xs py-2">{fmtDate(rate.effective_date)}</TableCell>
                                                    <TableCell className="text-xs py-2">
                                                      {rate.end_date ? (
                                                        <span className={rateExpired ? "text-destructive font-medium" : "text-muted-foreground"}>
                                                          {fmtDate(rate.end_date)}
                                                        </span>
                                                      ) : <span className="text-muted-foreground">—</span>}
                                                    </TableCell>
                                                    <TableCell className="text-xs py-2">
                                                      {rateExpired
                                                        ? <Badge variant="destructive" className="text-xs">Expired</Badge>
                                                        : rate.is_active
                                                          ? <Badge variant="outline" className="text-xs text-green-700 border-green-300 dark:text-green-400">Active</Badge>
                                                          : <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                                                    </TableCell>
                                                    <TableCell className="text-xs py-2">
                                                      <div className="flex items-center justify-end gap-1">
                                                        <Button size="icon" variant="ghost" onClick={() => openEditRate(svc.id, pos.id, rate)} data-testid={`btn-edit-rate-${rate.id}`} title="Edit rate">
                                                          <Pencil className="h-3 w-3" />
                                                        </Button>
                                                        <Button size="icon" variant="ghost"
                                                          onClick={() => deleteRateMut.mutate({ serviceId: svc.id, positionId: pos.id, rateId: rate.id })}
                                                          disabled={deleteRateMut.isPending}
                                                          data-testid={`btn-del-rate-${rate.id}`}
                                                          title="Remove rate"
                                                        >
                                                          <Trash2 className="h-3 w-3 text-destructive" />
                                                        </Button>
                                                      </div>
                                                    </TableCell>
                                                  </TableRow>
                                                );
                                              })}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit Service Dialog ── */}
      <Dialog open={serviceDialog} onOpenChange={setServiceDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-service">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              {editingService ? `Edit: ${editingService.product_name}` : "Add Service to Account"}
            </DialogTitle>
            <DialogDescription>
              {editingService
                ? "Update account-specific commercial configuration for this service."
                : "Select a product from the catalog and configure account-level settings."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Product selector (create only) */}
            {!editingService && (
              <div className="space-y-2">
                <Label>Product (Service Type)</Label>
                <Select value={serviceForm.productId} onValueChange={v => setServiceForm(f => ({ ...f, productId: v }))}>
                  <SelectTrigger data-testid="select-svc-product">
                    <SelectValue placeholder="Select from product catalog…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProducts.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">All active products are already assigned.</div>
                    ) : (
                      availableProducts.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="font-medium">{p.name}</span>
                          {p.sku && <span className="text-muted-foreground ml-2 text-xs">{p.sku}</span>}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {selectedProduct && (
                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    {selectedProduct.productType && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[selectedProduct.productType] || ""}`}>
                        {PRODUCT_TYPE_LABELS[selectedProduct.productType] || selectedProduct.productType}
                      </span>
                    )}
                    {selectedProduct.revenueCategory && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[selectedProduct.revenueCategory] || ""}`}>
                        {PRODUCT_REVENUE_CATEGORY_LABELS[selectedProduct.revenueCategory] || selectedProduct.revenueCategory}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      Default: {fmtCurrency(selectedProduct.unitPrice)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Program */}
            <div className="space-y-1">
              <Label htmlFor="svc-program">Program</Label>
              <Input id="svc-program" placeholder="e.g. DriverShift, DriverDash, Shuttle…"
                value={serviceForm.program} onChange={e => setServiceForm(f => ({ ...f, program: e.target.value }))}
                data-testid="input-svc-program" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Billing Method */}
              <div className="space-y-1">
                <Label>Billing Method</Label>
                <Select value={serviceForm.billingMethod || "__none__"} onValueChange={v => setServiceForm(f => ({ ...f, billingMethod: v === "__none__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-svc-billing-method">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Not specified —</SelectItem>
                    {BILLING_METHOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Billing Frequency Override */}
              <div className="space-y-1">
                <Label>Billing Frequency Override</Label>
                <Select value={serviceForm.billingFrequencyOverride || "__none__"} onValueChange={v => setServiceForm(f => ({ ...f, billingFrequencyOverride: v === "__none__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-svc-billing-freq">
                    <SelectValue placeholder="Use product default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Use Product Default —</SelectItem>
                    {Object.entries(BILLING_FREQUENCY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v as string}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Launch Date */}
              <div className="space-y-1">
                <Label htmlFor="svc-launch-date">Launch Date</Label>
                <Input id="svc-launch-date" type="date" value={serviceForm.launchDate}
                  onChange={e => setServiceForm(f => ({ ...f, launchDate: e.target.value }))}
                  data-testid="input-svc-launch-date" />
              </div>
              {/* Invoice Group */}
              <div className="space-y-1">
                <Label htmlFor="svc-invoice-group">Invoice Group</Label>
                <Input id="svc-invoice-group" placeholder="e.g. Standard, Premium…"
                  value={serviceForm.invoiceGroup} onChange={e => setServiceForm(f => ({ ...f, invoiceGroup: e.target.value }))}
                  data-testid="input-svc-invoice-group" />
              </div>
            </div>

            <Separator />

            {/* Price Override */}
            <div className="space-y-1">
              <Label htmlFor="svc-price-override" className="flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                Price Override (optional)
              </Label>
              <Input id="svc-price-override" type="number" step="0.01" placeholder="Leave blank to use product default"
                value={serviceForm.priceOverride} onChange={e => setServiceForm(f => ({ ...f, priceOverride: e.target.value }))}
                data-testid="input-svc-price-override" />
            </div>

            {/* Billing Rule Override */}
            <div className="space-y-1">
              <Label className="flex items-center gap-1">
                <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                Billing Rule Override
              </Label>
              <Select value={serviceForm.billingRuleOverride || "__none__"} onValueChange={v => setServiceForm(f => ({ ...f, billingRuleOverride: v === "__none__" ? "" : v }))}>
                <SelectTrigger data-testid="select-svc-billing-rule">
                  <SelectValue placeholder="Use product default" />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_RULE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="svc-start-date">Start Date</Label>
                <Input id="svc-start-date" type="date" value={serviceForm.startDate}
                  onChange={e => setServiceForm(f => ({ ...f, startDate: e.target.value }))}
                  data-testid="input-svc-start-date" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="svc-end-date">End Date (optional)</Label>
                <Input id="svc-end-date" type="date" value={serviceForm.endDate}
                  onChange={e => setServiceForm(f => ({ ...f, endDate: e.target.value }))}
                  data-testid="input-svc-end-date" />
              </div>
            </div>

            {/* Operational Notes */}
            <div className="space-y-1">
              <Label htmlFor="svc-op-notes">Operational Notes</Label>
              <Textarea id="svc-op-notes" placeholder="Internal notes about service delivery, coverage expectations…"
                value={serviceForm.operationalNotes} onChange={e => setServiceForm(f => ({ ...f, operationalNotes: e.target.value }))}
                rows={2} data-testid="textarea-svc-op-notes" />
            </div>

            {/* General Notes */}
            <div className="space-y-1">
              <Label htmlFor="svc-notes">Billing Notes</Label>
              <Textarea id="svc-notes" placeholder="Notes for billing team…"
                value={serviceForm.notes} onChange={e => setServiceForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} data-testid="textarea-svc-notes" />
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">Inactive services do not generate billable charges.</p>
              </div>
              <Switch checked={serviceForm.isActive} onCheckedChange={v => setServiceForm(f => ({ ...f, isActive: v }))}
                data-testid="switch-svc-active" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeServiceDialog} data-testid="btn-cancel-svc">Cancel</Button>
            <Button onClick={handleSaveService} disabled={saveServiceMut.isPending} data-testid="btn-save-svc">
              {saveServiceMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingService ? "Save Changes" : "Add Service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add / Edit Position Dialog ── */}
      <Dialog open={positionDialog} onOpenChange={setPositionDialog}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-position">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              {editingPosition ? "Edit Position" : "Add Position"}
            </DialogTitle>
            <DialogDescription>
              Define a staffing role or position within this service.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1">
              <Label htmlFor="pos-name">Position Name *</Label>
              <Input id="pos-name" placeholder="e.g. Driver, Coordinator, Team Lead…"
                value={positionForm.positionName} onChange={e => setPositionForm(f => ({ ...f, positionName: e.target.value }))}
                data-testid="input-pos-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="pos-schedule">Schedule Position</Label>
                <Input id="pos-schedule" placeholder="e.g. Opener, Closer…"
                  value={positionForm.schedulePosition} onChange={e => setPositionForm(f => ({ ...f, schedulePosition: e.target.value }))}
                  data-testid="input-pos-schedule" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pos-shift">Shift Position</Label>
                <Input id="pos-shift" placeholder="e.g. AM, PM, Mid…"
                  value={positionForm.shiftPosition} onChange={e => setPositionForm(f => ({ ...f, shiftPosition: e.target.value }))}
                  data-testid="input-pos-shift" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pos-qty">Quantity (headcount)</Label>
              <Input id="pos-qty" type="number" min="1" value={positionForm.quantity}
                onChange={e => setPositionForm(f => ({ ...f, quantity: e.target.value }))}
                data-testid="input-pos-qty" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pos-coverage">Coverage Notes</Label>
              <Textarea id="pos-coverage" placeholder="Coverage expectations, substitution rules…"
                value={positionForm.coverageNotes} onChange={e => setPositionForm(f => ({ ...f, coverageNotes: e.target.value }))}
                rows={2} data-testid="textarea-pos-coverage" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closePositionDialog} data-testid="btn-cancel-pos">Cancel</Button>
            <Button onClick={handleSavePosition} disabled={savePositionMut.isPending} data-testid="btn-save-pos">
              {savePositionMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingPosition ? "Save Changes" : "Add Position"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add / Edit Rate Dialog ── */}
      <Dialog open={rateDialog} onOpenChange={setRateDialog}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-rate">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              {editingRate ? "Edit Rate" : "Add Rate"}
            </DialogTitle>
            <DialogDescription>
              Configure bill and pay rates with effective dating for this position.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="rate-bill">Bill Rate *</Label>
                <Input id="rate-bill" type="number" step="0.01" placeholder="0.00"
                  value={rateForm.billRate} onChange={e => setRateForm(f => ({ ...f, billRate: e.target.value }))}
                  data-testid="input-rate-bill" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rate-pay">Pay Rate (optional)</Label>
                <Input id="rate-pay" type="number" step="0.01" placeholder="0.00"
                  value={rateForm.payRate} onChange={e => setRateForm(f => ({ ...f, payRate: e.target.value }))}
                  data-testid="input-rate-pay" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Rate Type</Label>
                <Select value={rateForm.rateType} onValueChange={v => setRateForm(f => ({ ...f, rateType: v }))}>
                  <SelectTrigger data-testid="select-rate-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RATE_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Billing Unit</Label>
                <Select value={rateForm.billingUnit} onValueChange={v => setRateForm(f => ({ ...f, billingUnit: v }))}>
                  <SelectTrigger data-testid="select-rate-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BILLING_UNIT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="rate-eff-date">Effective Date *</Label>
                <Input id="rate-eff-date" type="date" value={rateForm.effectiveDate}
                  onChange={e => setRateForm(f => ({ ...f, effectiveDate: e.target.value }))}
                  data-testid="input-rate-eff-date" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rate-end-date">End Date (optional)</Label>
                <Input id="rate-end-date" type="date" value={rateForm.endDate}
                  onChange={e => setRateForm(f => ({ ...f, endDate: e.target.value }))}
                  data-testid="input-rate-end-date" />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Overtime Eligible</Label>
                <p className="text-xs text-muted-foreground">Flag this rate for OT calculations.</p>
              </div>
              <Switch checked={rateForm.overtimeEligible} onCheckedChange={v => setRateForm(f => ({ ...f, overtimeEligible: v }))}
                data-testid="switch-rate-ot" />
            </div>

            <div className="space-y-1">
              <Label htmlFor="rate-notes">Notes</Label>
              <Textarea id="rate-notes" placeholder="Context for this rate…"
                value={rateForm.notes} onChange={e => setRateForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} data-testid="textarea-rate-notes" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeRateDialog} data-testid="btn-cancel-rate">Cancel</Button>
            <Button onClick={handleSaveRate} disabled={saveRateMut.isPending} data-testid="btn-save-rate">
              {saveRateMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingRate ? "Save Changes" : "Add Rate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Small helper component ───────────────────────────────────────────────────
function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}
