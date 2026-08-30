/**
 * ProductLibrary.tsx — DriverHub Product Library
 *
 * Commercial product catalog powering quotes, proposals, and billing.
 *
 * Layout follows DriverHub list page standards (ClaimsQueue.tsx authority).
 * KPI strip follows ClaimsDashboard.tsx compact card pattern.
 *
 * API: GET /api/finance/products  (includes accountCount subquery)
 *      POST /api/finance/products
 *      Detail: /admin/products/:id
 *      Dashboard: /admin/products/dashboard
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Loader2, Search, X, ArrowUpDown, ArrowUp, ArrowDown, Plus, AlertTriangle,
  Package, LayoutDashboard, ChevronRight,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { useFinancePermissions } from "@/hooks/useFinancePermissions";
import {
  SERVICE_CATEGORY_LABELS,
  BILLING_FREQUENCY_LABELS,
  PRICING_MODEL_LABELS,
} from "@shared/schema";
import type { Product } from "@shared/schema";

// ─── Constants ────────────────────────────────────────────────────────────────

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  one_time:    "One-Time",
  recurring:   "Recurring",
  usage:       "Usage-Based",
  operational: "Operational",
};

// Product with API-injected account count
type ProductWithCount = Product & { accountCount?: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number | string | null | undefined): string {
  const v = Number(n);
  if (n === null || n === undefined || n === "" || isNaN(v)) return "—";
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function labelOf(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return "—";
  return map[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function fmtDate(val: Date | string | null | undefined): string {
  if (!val) return "—";
  const d = typeof val === "string" ? new Date(val) : val;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Add Product Dialog ───────────────────────────────────────────────────────

interface NewProductForm {
  name: string;
  sku: string;
  serviceCategory: string;
  productType: string;
  unitPrice: string;
}

const FORM_DEFAULTS: NewProductForm = {
  name: "", sku: "", serviceCategory: "", productType: "", unitPrice: "",
};

function AddProductDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState<NewProductForm>(FORM_DEFAULTS);
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async (body: object) => {
      const res = await fetch("/api/finance/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (row: Product) => {
      qc.invalidateQueries({ queryKey: ["/api/finance/products"] });
      onClose();
      setForm(FORM_DEFAULTS);
      navigate(`/admin/products/${row.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create product", description: err.message, variant: "destructive" });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    mutation.mutate({
      name: form.name.trim(),
      sku: form.sku.trim() || undefined,
      serviceCategory: form.serviceCategory || undefined,
      productType: form.productType || undefined,
      unitPrice: form.unitPrice ? String(parseFloat(form.unitPrice)) : "0",
    });
  }

  function handleClose() {
    if (mutation.isPending) return;
    setForm(FORM_DEFAULTS);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Product</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="ap-name">Name <span className="text-red-500">*</span></Label>
            <Input
              id="ap-name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Standard Shift Coverage"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-sku">SKU</Label>
            <Input
              id="ap-sku"
              value={form.sku}
              onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
              placeholder="e.g. SC-001"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Service Line</Label>
              <Select value={form.serviceCategory} onValueChange={v => setForm(f => ({ ...f, serviceCategory: v }))}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SERVICE_CATEGORY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Product Type</Label>
              <Select value={form.productType} onValueChange={v => setForm(f => ({ ...f, productType: v }))}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRODUCT_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-price">Unit Price (USD)</Label>
            <Input
              id="ap-price"
              type="number"
              min="0"
              step="0.01"
              value={form.unitPrice}
              onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value }))}
              placeholder="0.00"
            />
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!form.name.trim() || mutation.isPending}
            >
              {mutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" />Creating…</>
                : "Add & Configure"
              }
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductLibrary() {
  const [, navigate] = useLocation();
  const { canManageProducts } = useFinancePermissions();

  // ── Filter state ──────────────────────────────────────────────────────────
  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter]     = useState("all");

  // ── Sort state ────────────────────────────────────────────────────────────
  const [sortField, setSortField] = useState<string | null>("name");
  const [sortDir, setSortDir]     = useState<"asc" | "desc">("asc");

  // ── Dialog ────────────────────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: products = [], isLoading, isError, refetch } = useQuery<ProductWithCount[]>({
    queryKey: ["/api/finance/products"],
    queryFn: async () => {
      const res = await fetch("/api/finance/products", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load products");
      return res.json();
    },
    staleTime: 30_000,
  });

  // ── Summary metrics ────────────────────────────────────────────────────────
  const totalCount    = products.length;
  const activeCount   = products.filter(p => p.isActive).length;
  const inactiveCount = products.filter(p => !p.isActive).length;
  const categoryCount = new Set(products.map(p => p.serviceCategory).filter(Boolean)).size;

  // ── Distinct values for filter dropdowns ──────────────────────────────────
  const distinctCategories = useMemo(() =>
    Array.from(new Set(products.map(p => p.serviceCategory).filter(Boolean) as string[])).sort(),
    [products]
  );
  const distinctTypes = useMemo(() =>
    Array.from(new Set(products.map(p => p.productType).filter(Boolean) as string[])).sort(),
    [products]
  );

  // ── Sort icon (ClaimsQueue pattern) ──────────────────────────────────────
  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30 inline-block align-middle" />;
    return sortDir === "asc"
      ? <ArrowUp   className="h-3 w-3 ml-1 inline-block align-middle" />
      : <ArrowDown className="h-3 w-3 ml-1 inline-block align-middle" />;
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortField(null); setSortDir("asc"); }
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  // ── Filter + sort ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = [...products];

    if (statusFilter === "active")   rows = rows.filter(p => p.isActive);
    if (statusFilter === "inactive") rows = rows.filter(p => !p.isActive);
    if (categoryFilter !== "all")    rows = rows.filter(p => p.serviceCategory === categoryFilter);
    if (typeFilter !== "all")        rows = rows.filter(p => p.productType === typeFilter);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q)
      );
    }

    if (sortField) {
      const dir = sortDir === "asc" ? 1 : -1;
      rows.sort((a, b) => {
        if (sortField === "sku")              return dir * (a.sku ?? "").localeCompare(b.sku ?? "");
        if (sortField === "name")             return dir * a.name.localeCompare(b.name);
        if (sortField === "category")         return dir * (a.serviceCategory ?? "").localeCompare(b.serviceCategory ?? "");
        if (sortField === "billingFrequency") return dir * (a.billingFrequency ?? "").localeCompare(b.billingFrequency ?? "");
        if (sortField === "pricingModel")     return dir * (a.pricingModel ?? "").localeCompare(b.pricingModel ?? "");
        if (sortField === "type")             return dir * (a.productType ?? "").localeCompare(b.productType ?? "");
        if (sortField === "price")            return dir * (Number(a.unitPrice) - Number(b.unitPrice));
        if (sortField === "status")           return dir * (Number(b.isActive) - Number(a.isActive));
        if (sortField === "accountCount")     return dir * ((a.accountCount ?? 0) - (b.accountCount ?? 0));
        if (sortField === "updatedAt")        return dir * (new Date(a.updatedAt ?? 0).getTime() - new Date(b.updatedAt ?? 0).getTime());
        return 0;
      });
    }

    return rows;
  }, [products, statusFilter, categoryFilter, typeFilter, search, sortField, sortDir]);

  const hasFilters = statusFilter !== "all" || categoryFilter !== "all" || typeFilter !== "all" || search.trim() !== "";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setCategoryFilter("all");
    setTypeFilter("all");
  };

  // ── Column header shorthand ───────────────────────────────────────────────
  const Th = ({ field, children, right }: { field: string; children: React.ReactNode; right?: boolean }) => (
    <TableHead
      className={`text-[14px] font-semibold text-foreground/80 whitespace-nowrap cursor-pointer select-none${right ? " text-right" : ""}`}
      onClick={() => handleSort(field)}
    >
      {children} <SortIcon field={field} />
    </TableHead>
  );

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="-mx-3 sm:-mx-4 md:-mx-6 -mt-4 sm:-mt-6 bg-[#f7f8fc] dark:bg-background min-h-screen">

      {/* ── Sticky zone: page header + toolbar ──────────────────────────── */}
      <div className="sticky top-0 z-50 bg-background">

        {/* Page Header */}
        <div className="border-b border-border px-6 py-2">
          <p className="text-xs text-muted-foreground leading-none">
            Sales &amp; Quotes / <span className="font-medium text-foreground/70">Product Library</span>
          </p>
          <div className="flex items-start justify-between mt-0">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#182039] dark:text-foreground leading-none">
                Product Library
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5 leading-none">
                <span className="font-semibold text-primary">
                  {filtered.length.toLocaleString("en-US")}
                </span>
                {" "}products — commercial catalog for quotes, proposals &amp; billing
                {hasFilters && <span className="text-muted-foreground/60"> · filtered</span>}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/admin/products/dashboard")}
              >
                <LayoutDashboard className="h-3.5 w-3.5 mr-1.5" />
                Dashboard
              </Button>
              {canManageProducts && (
                <Button
                  size="sm"
                  onClick={() => setAddOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Product
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="border-b border-border px-4 py-1.5 bg-muted/30 flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, SKU…"
              className="pl-8 h-7 text-xs border-[#d7dbe4]"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="h-7 text-xs w-[130px] border-[#d7dbe4]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>

          {/* Service line filter */}
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-7 text-xs w-[170px] border-[#d7dbe4]">
              <SelectValue placeholder="All Service Lines" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Service Lines</SelectItem>
              {distinctCategories.map(c => (
                <SelectItem key={c} value={c}>{labelOf(SERVICE_CATEGORY_LABELS, c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Product type filter */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-7 text-xs w-[140px] border-[#d7dbe4]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {distinctTypes.map(t => (
                <SelectItem key={t} value={t}>{labelOf(PRODUCT_TYPE_LABELS, t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Clear */}
          {hasFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              className="h-7 px-2.5 text-xs border-[#d7dbe4] dark:border-border text-muted-foreground ml-auto"
            >
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
        </div>

      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="space-y-2 px-6 pt-2 pb-4 max-w-[1600px] mx-auto">

        {/* ── KPI summary strip ─────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-2">
          {([
            { label: "Total Products", value: totalCount },
            { label: "Active",         value: activeCount },
            { label: "Inactive",       value: inactiveCount },
            { label: "Service Lines",  value: categoryCount },
          ] as const).map(({ label, value }) => (
            <Card key={label} className="border border-border/50 shadow-none">
              <CardContent className="px-3 py-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider leading-none">{label}</p>
                <p className="text-lg font-bold mt-1 text-[#182039] dark:text-foreground tabular-nums leading-tight">
                  {value.toLocaleString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Error ─────────────────────────────────────────────────────── */}
        {isError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Failed to load products.{" "}
            <button onClick={() => refetch()} className="underline ml-1">Retry</button>
          </div>
        )}

        {/* ── Table ─────────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-card border border-[#e4e7ee] dark:border-border rounded-xl overflow-hidden overflow-x-auto">
          <Table className="[&_td]:py-1.5 [&_th]:py-1.5 [&_td]:text-sm min-w-[1100px]">
            <TableHeader>
              <TableRow className="bg-[#f7f8fb] dark:bg-muted/30 hover:bg-[#f7f8fb] dark:hover:bg-muted/30 border-b border-[#e4e7ee] dark:border-border">
                <Th field="sku">SKU</Th>
                <Th field="name">Product</Th>
                <Th field="category">Service Line</Th>
                <Th field="billingFrequency">Billing Frequency</Th>
                <Th field="pricingModel">Pricing Model</Th>
                <Th field="type">Product Type</Th>
                <Th field="price" right>Unit Price</Th>
                <Th field="status">Status</Th>
                <Th field="accountCount" right>Accounts</Th>
                <Th field="updatedAt">Last Updated</Th>
                {/* Actions — no sort */}
                <TableHead className="text-[14px] font-semibold text-foreground/80 w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-14 px-6 text-muted-foreground">
                    <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      {hasFilters ? "No products match your filters" : "No products in the catalog yet"}
                    </p>
                    {hasFilters ? (
                      <button onClick={clearFilters} className="mt-2 text-xs underline text-primary">
                        Clear filters
                      </button>
                    ) : (
                      <button onClick={() => setAddOpen(true)} className="mt-2 text-xs underline text-primary">
                        Add your first product
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(product => (
                  <TableRow
                    key={product.id}
                    className="hover:bg-[#f7f8fb]/60 dark:hover:bg-muted/10 border-b border-[#eceef3] dark:border-border last:border-0 cursor-pointer"
                    onClick={() => navigate(`/admin/products/${product.id}`)}
                  >
                    {/* SKU */}
                    <TableCell className="text-foreground/60 whitespace-nowrap font-mono text-xs">
                      {product.sku || "—"}
                    </TableCell>

                    {/* Product name — linked-record style */}
                    <TableCell className="whitespace-nowrap max-w-[220px] truncate">
                      <span className="font-medium text-primary group-hover:underline">
                        {product.name}
                      </span>
                    </TableCell>

                    {/* Service Line */}
                    <TableCell className="text-foreground/70 whitespace-nowrap">
                      {labelOf(SERVICE_CATEGORY_LABELS, product.serviceCategory)}
                    </TableCell>

                    {/* Billing Frequency */}
                    <TableCell className="text-foreground/70 whitespace-nowrap">
                      {labelOf(BILLING_FREQUENCY_LABELS, product.billingFrequency)}
                    </TableCell>

                    {/* Pricing Model */}
                    <TableCell className="text-foreground/70 whitespace-nowrap">
                      {labelOf(PRICING_MODEL_LABELS, product.pricingModel)}
                    </TableCell>

                    {/* Product Type */}
                    <TableCell className="text-foreground/70 whitespace-nowrap">
                      {labelOf(PRODUCT_TYPE_LABELS, product.productType)}
                    </TableCell>

                    {/* Unit Price */}
                    <TableCell className="text-foreground/75 whitespace-nowrap text-right tabular-nums">
                      {fmt$(product.unitPrice)}
                      {product.unit && product.unit !== "each" && (
                        <span className="text-xs text-foreground/45"> /{product.unit}</span>
                      )}
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <StatusBadge status={product.isActive ? "active" : "inactive"} />
                    </TableCell>

                    {/* Assigned Accounts */}
                    <TableCell className="text-foreground/70 tabular-nums text-right">
                      {(product.accountCount ?? 0).toLocaleString()}
                    </TableCell>

                    {/* Last Updated */}
                    <TableCell className="text-foreground/65 whitespace-nowrap text-xs">
                      {fmtDate(product.updatedAt)}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <button
                        className="inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                        onClick={e => { e.stopPropagation(); navigate(`/admin/products/${product.id}`); }}
                        aria-label="View product"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

      </div>

      {/* ── Add Product Dialog ────────────────────────────────────────────── */}
      <AddProductDialog open={addOpen} onClose={() => setAddOpen(false)} />

    </div>
  );
}
