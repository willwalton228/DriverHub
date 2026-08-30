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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Package, Plus, Pencil, Loader2, ToggleLeft, ToggleRight, RefreshCw,
  AlertTriangle, CalendarDays, DollarSign, Tag, Zap, Info,
} from "lucide-react";
import {
  PRODUCT_TYPE_LABELS, BILLING_FREQUENCY_LABELS, BILLING_TRIGGER_LABELS,
  PRODUCT_REVENUE_CATEGORY_LABELS,
  PRICING_MODEL_LABELS,
} from "@shared/schema";

// ─── Colour maps ──────────────────────────────────────────────────────────────
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

const BILLING_RULE_OPTIONS = [
  { value: "__none__", label: "— Use Product Default —" },
  { value: "consolidated", label: "Consolidated (one invoice)" },
  { value: "per_location", label: "Per Location" },
  { value: "per_job", label: "Per Job" },
  { value: "immediate", label: "Immediate" },
  { value: "next_cycle", label: "Next Invoice Cycle" },
];

function fmt(val: number | string | null | undefined) {
  if (!val && val !== 0) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(val));
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function isEndDatePast(endDate: string | null | undefined): boolean {
  if (!endDate) return false;
  return new Date(endDate + "T23:59:59") < new Date();
}

const emptyForm = {
  productId: "",
  priceOverride: "",
  billingRuleOverride: "",
  startDate: "",
  endDate: "",
  isActive: true,
  notes: "",
};

interface AccountProductsTabProps {
  customerId: string;
}

export default function AccountProductsTab({ customerId }: AccountProductsTabProps) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<any | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [showInactive, setShowInactive] = useState(false);

  const { data: assignments = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/finance/account-products", customerId],
    queryFn: async () => {
      const r = await fetch(`/api/finance/account-products?customerId=${customerId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load account products");
      return r.json();
    },
    enabled: !!customerId,
  });

  const { data: allProducts = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/products"],
  });

  const activeProducts = (allProducts as any[]).filter((p: any) => p.isActive !== false);

  // Products not yet actively assigned to this account
  const assignedProductIds = new Set(
    (assignments as any[]).filter((a: any) => a.isActive).map((a: any) => a.productId)
  );
  const availableProducts = activeProducts.filter((p: any) => !assignedProductIds.has(p.id));

  const saveMut = useMutation({
    mutationFn: async (data: any) => {
      const res = editingRow
        ? await apiRequest("PATCH", `/api/finance/account-products/${editingRow.id}`, data)
        : await apiRequest("POST", "/api/finance/account-products", data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: editingRow ? "Assignment updated" : "Product assigned to account" });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/account-products", customerId] });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/finance/account-products/${id}`, { isActive });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update");
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      toast({ title: vars.isActive ? "Assignment reactivated" : "Assignment deactivated" });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/account-products", customerId] });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditingRow(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  }

  function openEdit(row: any) {
    setEditingRow(row);
    setForm({
      productId: row.productId || "",
      priceOverride: row.priceOverride != null ? String(row.priceOverride) : "",
      billingRuleOverride: row.billingRuleOverride || "",
      startDate: row.startDate || "",
      endDate: row.endDate || "",
      isActive: row.isActive !== false,
      notes: row.notes || "",
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingRow(null);
    setForm({ ...emptyForm });
  }

  function handleSave() {
    if (!editingRow && !form.productId) {
      toast({ title: "Select a product", variant: "destructive" });
      return;
    }
    const payload: any = {
      isActive: form.isActive,
      priceOverride: form.priceOverride ? form.priceOverride : null,
      billingRuleOverride: form.billingRuleOverride || null,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      notes: form.notes || null,
    };
    if (!editingRow) {
      payload.customerId = customerId;
      payload.productId = form.productId;
    }
    saveMut.mutate(payload);
  }

  const displayed = (assignments as any[]).filter((a: any) => showInactive || a.isActive !== false);
  const activeCount = (assignments as any[]).filter((a: any) => a.isActive !== false).length;

  // Product lookup for dialog
  const selectedProduct = allProducts.find((p: any) => p.id === (editingRow?.productId || form.productId));

  return (
    <div className="space-y-4 py-2">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Assigned Products
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeCount} active product{activeCount !== 1 ? "s" : ""} assigned to this account
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Show inactive</Label>
            <Switch checked={showInactive} onCheckedChange={setShowInactive} data-testid="switch-show-inactive-ap" />
          </div>
          <Button size="icon" variant="outline" onClick={() => refetch()} data-testid="btn-refresh-ap">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={openCreate} data-testid="btn-add-account-product">
            <Plus className="mr-2 h-4 w-4" />
            Add Product
          </Button>
        </div>
      </div>

      {/* Rule callout */}
      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
        <CardContent className="pt-3 pb-3">
          <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
            <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>
              Only <strong>active</strong> assignments generate billable charges. Assignments past their end date are automatically excluded from new charge creation.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border rounded-md">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-sm">No products assigned</p>
          <p className="text-xs mt-1">Add a product to begin tracking billable charges for this account.</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayed.map((row: any) => {
                const expired = row.isActive && isEndDatePast(row.endDate);
                return (
                  <TableRow
                    key={row.id}
                    data-testid={`ap-row-${row.id}`}
                    className={!row.isActive ? "opacity-50" : ""}
                  >
                    <TableCell>
                      <div className="font-medium text-sm">{row.productName}</div>
                      {row.productSku && (
                        <div className="text-xs text-muted-foreground font-mono">{row.productSku}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.productType ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[row.productType] || "bg-gray-100 text-gray-600"}`}>
                          {PRODUCT_TYPE_LABELS[row.productType] || row.productType}
                        </span>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {row.revenueCategory ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[row.revenueCategory] || "bg-gray-100 text-gray-600"}`}>
                          {PRODUCT_REVENUE_CATEGORY_LABELS[row.revenueCategory] || row.revenueCategory}
                        </span>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.billingFrequency ? (BILLING_FREQUENCY_LABELS[row.billingFrequency] || row.billingFrequency) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">
                        {row.priceOverride != null ? (
                          <span className="text-primary">{fmt(row.priceOverride)}</span>
                        ) : fmt(row.unitPrice)}
                      </div>
                      {row.priceOverride != null && (
                        <div className="text-xs text-muted-foreground">default: {fmt(row.unitPrice)}</div>
                      )}
                      {row.billingRuleOverride && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Zap className="h-3 w-3" />
                          {BILLING_RULE_OPTIONS.find(o => o.value === row.billingRuleOverride)?.label || row.billingRuleOverride}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <CalendarDays className="h-3 w-3 flex-shrink-0" />
                        <span>{fmtDate(row.startDate)}</span>
                      </div>
                      {row.endDate && (
                        <div className={`flex items-center gap-1 mt-0.5 ${expired ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}>
                          <span>{expired ? "Expired" : "Until"}: {fmtDate(row.endDate)}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {expired ? (
                        <Badge variant="destructive" className="text-xs">Expired</Badge>
                      ) : row.isActive ? (
                        <Badge variant="outline" className="text-xs text-green-700 border-green-300 dark:text-green-400">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(row)}
                          data-testid={`btn-edit-ap-${row.id}`}
                          title="Edit assignment"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleMut.mutate({ id: row.id, isActive: !row.isActive })}
                          disabled={toggleMut.isPending}
                          data-testid={`btn-toggle-ap-${row.id}`}
                          title={row.isActive ? "Deactivate" : "Reactivate"}
                        >
                          {row.isActive
                            ? <ToggleRight className="h-3.5 w-3.5 text-green-600" />
                            : <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground" />}
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

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-account-product">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              {editingRow ? "Edit Product Assignment" : "Assign Product to Account"}
            </DialogTitle>
            <DialogDescription>
              {editingRow
                ? `Editing assignment for ${editingRow.productName}`
                : "Choose a product from the master catalog and configure account-level settings."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Product selector (create only) */}
            {!editingRow && (
              <div className="space-y-2">
                <Label>Product</Label>
                <Select value={form.productId} onValueChange={v => setForm(f => ({ ...f, productId: v }))}>
                  <SelectTrigger data-testid="select-ap-product">
                    <SelectValue placeholder="Select a product…" />
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
                {/* Selected product summary pill row */}
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
                    {selectedProduct.billingFrequency && (
                      <span className="text-xs text-muted-foreground">
                        {BILLING_FREQUENCY_LABELS[selectedProduct.billingFrequency] || selectedProduct.billingFrequency}
                      </span>
                    )}
                    <span className="text-xs font-medium text-muted-foreground">
                      Default: {fmt(selectedProduct.unitPrice)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Price Override */}
            <div className="space-y-1">
              <Label htmlFor="ap-price-override" className="flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                Price Override
              </Label>
              <Input
                id="ap-price-override"
                type="number"
                step="0.01"
                placeholder="Leave blank to use product default price"
                value={form.priceOverride}
                onChange={e => setForm(f => ({ ...f, priceOverride: e.target.value }))}
                data-testid="input-ap-price-override"
              />
              {selectedProduct && !form.priceOverride && (
                <p className="text-xs text-muted-foreground">
                  Default: {fmt(selectedProduct?.unitPrice || editingRow?.unitPrice)}
                  {(selectedProduct?.pricingModel || editingRow?.pricingModel) &&
                    ` · ${PRICING_MODEL_LABELS[selectedProduct?.pricingModel || editingRow?.pricingModel] || ""}` }
                </p>
              )}
            </div>

            {/* Billing Rule Override */}
            <div className="space-y-1">
              <Label className="flex items-center gap-1">
                <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                Billing Rule Override
              </Label>
              <Select value={form.billingRuleOverride || "__none__"} onValueChange={v => setForm(f => ({ ...f, billingRuleOverride: v === "__none__" ? "" : v }))}>
                <SelectTrigger data-testid="select-ap-billing-rule">
                  <SelectValue placeholder="Use product default" />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_RULE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Override how and when charges are collected for this account.</p>
            </div>

            <Separator />

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ap-start-date" className="flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                  Start Date
                </Label>
                <Input
                  id="ap-start-date"
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  data-testid="input-ap-start-date"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ap-end-date">End Date (optional)</Label>
                <Input
                  id="ap-end-date"
                  type="date"
                  value={form.endDate}
                  onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                  data-testid="input-ap-end-date"
                />
              </div>
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">Inactive assignments do not generate billable charges.</p>
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))}
                data-testid="switch-ap-active"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label htmlFor="ap-notes">Notes</Label>
              <Textarea
                id="ap-notes"
                placeholder="Optional notes about this assignment…"
                rows={2}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                data-testid="input-ap-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="btn-cancel-ap">Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saveMut.isPending || (!editingRow && !form.productId)}
              data-testid="btn-save-ap"
            >
              {saveMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingRow ? "Save Changes" : "Assign Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
