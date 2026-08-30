import { createContext, Fragment, useCallback, useContext, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Package, ArrowLeft, Edit2, Save, X, CheckCircle, XCircle,
  DollarSign, Tag, Layers, BarChart2, Settings, FileText,
  Users, Link2, Image, AlertCircle, Loader2, Plus, Trash2,
  Globe, Briefcase, BookOpen, Megaphone, ToggleLeft, ToggleRight,
  TrendingUp, ExternalLink, MoreHorizontal, Calendar, User,
  FileImage, Clock, Quote, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useFinancePermissions } from "@/hooks/useFinancePermissions";
import { RecordDetailLayout } from "@/components/RecordDetailLayout";
import { RecordHeader } from "@/components/RecordHeader";
import {
  SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS,
  BILLING_FREQUENCIES, BILLING_FREQUENCY_LABELS,
  BILLING_TRIGGERS, BILLING_TRIGGER_LABELS,
  PRODUCT_REVENUE_CATEGORIES, PRODUCT_REVENUE_CATEGORY_LABELS,
  PRICING_MODELS, PRICING_MODEL_LABELS,
  PRODUCT_TYPES,
} from "@shared/schema";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (v: string | null | undefined) => v ?? "—";
const fmtCurrency = (v: string | number | null | undefined) =>
  v != null ? `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
const fmtPct = (v: string | number | null | undefined) =>
  v != null ? `${(Number(v) * 100).toFixed(1)}%` : "—";
const fmtDate = (v: string | Date | null | undefined) =>
  v ? new Date(v).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

const RELATIONSHIP_TYPES = [
  { value: "suggested", label: "Suggested" },
  { value: "required", label: "Required" },
  { value: "addon", label: "Add-on" },
  { value: "exclusive", label: "Mutually Exclusive" },
];

const RELATIONSHIP_COLORS: Record<string, string> = {
  suggested: "bg-blue-50 text-blue-700 border-blue-200",
  required: "bg-red-50 text-red-700 border-red-200",
  addon: "bg-green-50 text-green-700 border-green-200",
  exclusive: "bg-amber-50 text-amber-700 border-amber-200",
};

const ProductEditContext = createContext(false);
const useCanManageProduct = () => useContext(ProductEditContext);

// ─── Editable Field ───────────────────────────────────────────────────────────

function EditableText({
  label, value, field, onSave, textarea = false, placeholder,
}: {
  label: string; value: string | null | undefined; field: string;
  onSave: (field: string, value: string | null) => void;
  textarea?: boolean; placeholder?: string;
}) {
  const canEdit = useCanManageProduct();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  const handleSave = () => {
    onSave(field, draft.trim() || null);
    setEditing(false);
  };
  const handleCancel = () => {
    setDraft(value ?? "");
    setEditing(false);
  };

  return (
    <div className="group">
      <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</Label>
      {!canEdit ? (
        <div className="mt-1 text-sm min-h-[28px] flex items-start">
          <span className={!value ? "text-muted-foreground italic" : ""}>{value || "—"}</span>
        </div>
      ) : editing ? (
        <div className="mt-1 space-y-1">
          {textarea ? (
            <Textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={placeholder}
              className="text-sm min-h-[80px]"
              autoFocus
            />
          ) : (
            <Input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={placeholder}
              className="text-sm h-8"
              autoFocus
              onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel(); }}
            />
          )}
          <div className="flex gap-1">
            <Button size="sm" className="h-6 text-xs" onClick={handleSave}><Save className="h-3 w-3 mr-1" />Save</Button>
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={handleCancel}><X className="h-3 w-3 mr-1" />Cancel</Button>
          </div>
        </div>
      ) : (
        <div
          className="mt-1 text-sm cursor-text rounded px-1 -mx-1 py-0.5 hover:bg-muted/60 group-hover:ring-1 group-hover:ring-muted transition-all min-h-[28px] flex items-start justify-between gap-2"
          onClick={() => setEditing(true)}
        >
          <span className={!value ? "text-muted-foreground italic" : ""}>{value || placeholder || "Click to edit"}</span>
          <Edit2 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 mt-0.5" />
        </div>
      )}
    </div>
  );
}

// Sentinel used internally so Radix UI Select never receives an empty-string value.
// Radix prohibits value="" on SelectItem; null/undefined product fields map to this sentinel.
const NONE_VALUE = "__none__";

function EditableSelect({
  label, value, field, options, onSave,
}: {
  label: string; value: string | null | undefined; field: string;
  options: { value: string; label: string }[];
  onSave: (field: string, value: string | null) => void;
}) {
  const canEdit = useCanManageProduct();
  const current = options.find(o => o.value === value);
  // Map null/undefined/empty → sentinel so the Select always has a non-empty value
  const selectValue = value ? value : NONE_VALUE;
  return (
    <div>
      <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</Label>
      {canEdit ? (
        <Select
          value={selectValue}
          onValueChange={v => onSave(field, v === NONE_VALUE ? null : v)}
        >
          <SelectTrigger className="mt-1 h-8 text-sm">
            <SelectValue placeholder="Select…">{current?.label ?? "—"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>— None —</SelectItem>
            {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : (
        <div className="mt-1 text-sm min-h-[28px] flex items-center">{current?.label ?? "—"}</div>
      )}
    </div>
  );
}

function EditableSwitch({
  label, value, field, onSave, description,
}: {
  label: string; value: boolean | null | undefined; field: string;
  onSave: (field: string, value: boolean) => void; description?: string;
}) {
  const canEdit = useCanManageProduct();
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {canEdit ? (
        <Switch checked={!!value} onCheckedChange={v => onSave(field, v)} />
      ) : (
        <Badge variant={value ? "default" : "secondary"} className="text-[10px] h-4 px-1.5">
          {value ? "Yes" : "No"}
        </Badge>
      )}
    </div>
  );
}

function EditableDate({
  label, value, field, onSave, hint,
}: {
  label: string; value: string | null | undefined; field: string;
  onSave: (field: string, value: string | null) => void; hint?: string;
}) {
  const canEdit = useCanManageProduct();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  const handleSave = () => { onSave(field, draft || null); setEditing(false); };
  const handleCancel = () => { setDraft(value ?? ""); setEditing(false); };

  return (
    <div className="group">
      <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</Label>
      {!canEdit ? (
        <div className="mt-1 text-sm min-h-[28px] flex items-center">{fmtDate(value)}</div>
      ) : editing ? (
        <div className="mt-1 space-y-1">
          <Input
            type="date"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="text-sm h-8"
            autoFocus
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel(); }}
          />
          {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
          <div className="flex gap-1">
            <Button size="sm" className="h-6 text-xs" onClick={handleSave}><Save className="h-3 w-3 mr-1" />Save</Button>
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={handleCancel}><X className="h-3 w-3 mr-1" />Cancel</Button>
          </div>
        </div>
      ) : (
        <div
          className="mt-1 text-sm cursor-text rounded px-1 -mx-1 py-0.5 hover:bg-muted/60 group-hover:ring-1 group-hover:ring-muted transition-all min-h-[28px] flex items-start justify-between gap-2"
          onClick={() => setEditing(true)}
        >
          <span className={!value ? "text-muted-foreground italic" : ""}>{value ? fmtDate(value) : "Click to set"}</span>
          <Edit2 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 mt-0.5" />
        </div>
      )}
    </div>
  );
}

// ─── Read-only display field ──────────────────────────────────────────────────

function ReadOnlyField({
  label, value, emphasis, badge, badgeClass,
}: {
  label: string; value: React.ReactNode; emphasis?: boolean;
  badge?: string; badgeClass?: string;
}) {
  return (
    <div>
      <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</Label>
      <div className={`mt-1 text-sm min-h-[28px] flex items-center gap-2 ${emphasis ? "font-semibold" : ""}`}>
        {value}
        {badge && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badgeClass ?? "bg-muted text-muted-foreground"}`}>
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Video URL list manager ──────────────────────────────────────────────────

function VideoUrlManager({ urls, onSave }: { urls: string[]; onSave: (urls: string[]) => void }) {
  const canEdit = useCanManageProduct();
  const [newUrl, setNewUrl] = useState("");

  const add = () => {
    const trimmed = newUrl.trim();
    if (!trimmed) return;
    onSave([...urls, trimmed]);
    setNewUrl("");
  };
  const remove = (i: number) => onSave(urls.filter((_, idx) => idx !== i));

  return (
    <div>
      <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Videos</Label>
      {urls.length === 0 && (
        <p className="text-xs text-muted-foreground italic mt-1">No videos added yet</p>
      )}
      <div className="space-y-1 mt-1">
        {urls.map((url, i) => (
          <div key={i} className="flex items-center gap-2 text-sm bg-muted/40 rounded px-2 py-1.5">
            <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
            <a
              href={url} target="_blank" rel="noopener noreferrer"
              className="flex-1 truncate text-blue-600 dark:text-blue-400 hover:underline text-xs"
            >{url}</a>
            {canEdit && (
              <button
                onClick={() => remove(i)}
                className="h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Remove"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="flex gap-1.5 mt-2">
          <Input
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=…"
            className="text-sm h-8 flex-1"
            onKeyDown={e => { if (e.key === "Enter") add(); if (e.key === "Escape") setNewUrl(""); }}
          />
          <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={add} disabled={!newUrl.trim()}>
            <Plus className="h-3 w-3 mr-1" />Add
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Field group card ─────────────────────────────────────────────────────────

function FieldCard({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-5">
        <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />{title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-3 space-y-4">{children}</CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProductDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { canManageProducts } = useFinancePermissions();
  const canEditProduct = canManageProducts;

  // ── Controlled tab state (required by Detail Page Standard) ──
  const [activeTab, setActiveTab] = useState("overview");

  /** Navigate to a tab, optionally scrolling a specific element into view */
  const navigateToTab = useCallback((tab: string, testId?: string) => {
    setActiveTab(tab);
    if (testId) {
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-testid="${testId}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

  // ── Data ──
  const { data: product, isLoading, error } = useQuery<any>({
    queryKey: ["/api/finance/products", id],
    queryFn: async () => {
      const res = await fetch(`/api/finance/products/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Product not found");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: relationships = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/products", id, "relationships"],
    queryFn: async () => {
      const res = await fetch(`/api/finance/products/${id}/relationships`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id,
  });

  const { data: documents = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/products", id, "documents"],
    queryFn: async () => {
      const res = await fetch(`/api/finance/products/${id}/documents`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id,
  });

  const { data: operationalFlagHistory = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/products", id, "operational-flag-history"],
    queryFn: async () => {
      const res = await fetch(`/api/finance/products/${id}/operational-flag-history`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id,
  });

  const { data: accountProducts = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/account-products", { productId: id }],
    queryFn: async () => {
      const res = await fetch(`/api/finance/account-products?productId=${id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id,
  });

  const { data: allProducts = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/products"],
    queryFn: async () => {
      const res = await fetch("/api/finance/products", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // ── Mutations ──
  const updateMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiRequest("PATCH", `/api/finance/products/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/finance/products", id] });
      qc.invalidateQueries({ queryKey: ["/api/finance/products"] });
      toast({ title: "Saved", description: "Product updated." });
    },
    onError: () => toast({ title: "Error", description: "Failed to save changes.", variant: "destructive" }),
  });

  const addRelationship = useMutation({
    mutationFn: (data: { relatedProductId: string; relationshipType: string }) =>
      apiRequest("POST", `/api/finance/products/${id}/relationships`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/finance/products", id, "relationships"] });
      toast({ title: "Relationship added" });
    },
    onError: () => toast({ title: "Error", description: "Could not add relationship.", variant: "destructive" }),
  });

  const removeRelationship = useMutation({
    mutationFn: (relId: string) =>
      apiRequest("DELETE", `/api/finance/products/${id}/relationships/${relId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/finance/products", id, "relationships"] }),
  });

  const save = (field: string, value: any) => {
    if (canEditProduct) updateMutation.mutate({ [field]: value });
  };

  // ── Relationship dialog state ──
  const [relType, setRelType] = useState("suggested");
  const [relProduct, setRelProduct] = useState("");

  // ─── Loading / Error ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !product) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-muted-foreground">Product not found.</p>
        <Button variant="outline" onClick={() => navigate("/admin/products")}>
          <ArrowLeft className="h-4 w-4 mr-2" />Back to Library
        </Button>
      </div>
    );
  }

  const serviceCategoryLabel = SERVICE_CATEGORY_LABELS[product.serviceCategory ?? ""] ?? product.serviceCategory ?? "—";
  const pricingModelLabel    = PRICING_MODEL_LABELS[product.pricingModel ?? ""]       ?? product.pricingModel    ?? "—";
  const billingFreqLabel     = BILLING_FREQUENCY_LABELS[product.billingFrequency ?? ""] ?? product.billingFrequency ?? "—";
  const revCatLabel          = PRODUCT_REVENUE_CATEGORY_LABELS[product.revenueCategory ?? ""] ?? product.revenueCategory ?? "—";

  // ─── Zone 1: Sticky Command Zone ─────────────────────────────────────────
  // RecordHeader manages its own sticky positioning (asSticky=true default).
  const stickyHeader = (
    <RecordHeader
      recordId={product.productCode ?? product.sku ?? product.id.slice(0, 8).toUpperCase()}
      backLabel="Product Library"
      onBack={() => navigate("/admin/products")}
      accountLine={
        <span className="text-sm font-medium text-muted-foreground">
          {serviceCategoryLabel} · {pricingModelLabel}
        </span>
      }
      subtitle={product.description ?? undefined}
      statusPills={
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={product.isActive ? "default" : "secondary"} className="text-xs">
            {product.isActive
              ? <><CheckCircle className="h-3 w-3 mr-1" />Active</>
              : <><XCircle className="h-3 w-3 mr-1" />Inactive</>}
          </Badge>
          {product.serviceCategory && (
            <Badge variant="outline" className="text-xs">{serviceCategoryLabel}</Badge>
          )}
          {product.pricingModel && (
            <Badge variant="outline" className="text-xs">{pricingModelLabel}</Badge>
          )}
        </div>
      }
      actions={
        <div className="flex items-center gap-2">
          {canEditProduct && (
            <Button
              variant={product.isActive ? "outline" : "default"}
              size="sm"
              onClick={() => save("isActive", !product.isActive)}
              disabled={updateMutation.isPending}
              className="h-8"
            >
              {product.isActive
                ? <><ToggleRight className="h-4 w-4 mr-1.5" />Deactivate</>
                : <><ToggleLeft className="h-4 w-4 mr-1.5" />Activate</>}
            </Button>
          )}
        </div>
      }
    />
  );

  // ─── Zone 2: Operational Summary Strip ───────────────────────────────────
  // Non-sticky. 8 clickable KPI chips that navigate to the relevant tab.
  // Label: text-[10px] uppercase tracking-wide. Value: text-sm font-semibold.
  // Dashed underline on value signals interactivity.
  const kpiChips: { label: string; value: string; tab: string; tip: string }[] = [
    {
      label: "Base Price",
      value: `${fmtCurrency(product.unitPrice)} / ${product.unit ?? "each"}`,
      tab: "pricing",
      tip: "Go to Pricing",
    },
    {
      label: "Pricing Model",
      value: pricingModelLabel,
      tab: "pricing",
      tip: "Go to Pricing",
    },
    {
      label: "Billing",
      value: billingFreqLabel,
      tab: "billing",
      tip: "Go to Billing",
    },
    {
      label: "Revenue Category",
      value: revCatLabel,
      tab: "billing",
      tip: "Go to Billing",
    },
    {
      label: "Customers",
      value: String(accountProducts.length),
      tab: "analytics",
      tip: "Go to Analytics — Active Customers",
    },
    {
      label: "Relationships",
      value: String(relationships.length),
      tab: "relationships",
      tip: "Go to Relationships",
    },
    {
      label: "Documents",
      value: String(documents.length),
      tab: "documents",
      tip: "Go to Documents",
    },
    {
      label: "Taxable",
      value: product.taxable ? "Yes" : "No",
      tab: "billing",
      tip: "Go to Billing — Tax & Revenue",
    },
  ];

  const summaryStrip = (
    <div className="border-b border-border/50 bg-muted/20 px-6 py-2">
      <div className="flex items-center gap-1 flex-wrap">
        {kpiChips.map((chip, i) => (
          <Fragment key={chip.label}>
            {i > 0 && <span className="text-border select-none px-1 text-sm">|</span>}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigateToTab(chip.tab)}
                  className="flex flex-col px-3 py-1 rounded hover:bg-muted/50 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  data-testid={`kpi-chip-${chip.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide leading-none mb-0.5">
                    {chip.label}
                  </span>
                  <span className="text-sm font-semibold text-foreground border-b border-dashed border-muted-foreground/40 leading-snug">
                    {chip.value}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">{chip.tip}</TooltipContent>
            </Tooltip>
          </Fragment>
        ))}
      </div>
    </div>
  );

  // ─── Zone 4: Sticky Sidebar ───────────────────────────────────────────────
  // Sections per ticket spec: Product Media → Record Info → Usage → Flags
  const sidebar = (
    <div className="space-y-0">

      {/* ── Product Media ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-background border-b border-border/60 px-4 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product Media</p>
      </div>
      <div className="px-4 py-3 space-y-3 border-b border-border/40">
        {/* Product Image */}
        {product.heroImage ? (
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Product Image</p>
            <img
              src={product.heroImage}
              alt={product.name}
              className="w-full rounded-md border object-cover max-h-32"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/20 py-4 gap-1">
            <FileImage className="h-5 w-5 text-muted-foreground/40" />
            <p className="text-[10px] text-muted-foreground">No product image</p>
            <p className="text-[10px] text-muted-foreground/60">Set Hero Image URL on the Documents tab</p>
          </div>
        )}
        {/* Product Flyer */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Product Flyer</span>
          {product.flyerUrl ? (
            <a
              href={product.flyerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"
            >
              <FileText className="h-3 w-3" />Open
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          ) : (
            <span className="text-xs text-muted-foreground/60 italic">—</span>
          )}
        </div>
      </div>

      {/* ── Record Info ───────────────────────────────────────────────────── */}
      <div className="sticky top-[36px] z-10 bg-background border-b border-border/60 px-4 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Record Info</p>
      </div>
      <div className="px-4 py-3 space-y-2 border-b border-border/40">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs text-muted-foreground shrink-0">Product Owner</span>
          <span className="text-xs font-medium text-right">
            {product.ownerName
              ? <span className="flex items-center gap-1"><User className="h-3 w-3 text-muted-foreground" />{product.ownerName}</span>
              : <span className="text-muted-foreground/60 italic">—</span>}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Created</span>
          <span className="text-xs font-medium tabular-nums">{fmtDate(product.createdAt)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Last Updated</span>
          <span className="text-xs font-medium tabular-nums">{fmtDate(product.updatedAt)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Product Code</span>
          <span className="font-mono text-xs">{product.productCode ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">SKU</span>
          <span className="font-mono text-xs">{product.sku ?? "—"}</span>
        </div>
      </div>

      {/* ── Usage ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-[72px] z-10 bg-background border-b border-border/60 px-4 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Usage</p>
      </div>
      <div className="px-4 py-3 space-y-2 border-b border-border/40">
        <button
          className="flex justify-between items-baseline w-full hover:text-primary transition-colors text-left"
          onClick={() => navigateToTab("analytics")}
        >
          <span className="text-xs text-muted-foreground">Active Customers</span>
          <span className="text-xs font-semibold tabular-nums">{accountProducts.length}</span>
        </button>
        <button
          className="flex justify-between items-baseline w-full hover:text-primary transition-colors text-left"
          onClick={() => navigateToTab("relationships")}
        >
          <span className="text-xs text-muted-foreground">Relationships</span>
          <span className="text-xs font-semibold tabular-nums">{relationships.length}</span>
        </button>
        <button
          className="flex justify-between items-baseline w-full hover:text-primary transition-colors text-left"
          onClick={() => navigateToTab("documents")}
        >
          <span className="text-xs text-muted-foreground">Documents</span>
          <span className="text-xs font-semibold tabular-nums">{documents.length}</span>
        </button>
      </div>

      {/* ── Operational Flags ─────────────────────────────────────────────── */}
      <div className="sticky top-[108px] z-10 bg-background border-b border-border/60 px-4 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Operational Flags</p>
      </div>
      <div className="px-4 py-3 space-y-2">
        {([
          ["Scheduling", "requiresScheduling"],
          ["Driver Assignment", "requiresDriverAssignment"],
          ["Dispatch", "requiresDispatch"],
          ["DriverDash", "eligibleForDriverDash"],
          ["Billing Approval", "requiresBillingApproval"],
          ["Vehicle Tracking", "requiresVehicleTracking"],
        ] as const).map(([label, field]) => (
          <div key={field} className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">{label}</span>
            {canEditProduct ? (
              <Switch
                checked={!!product[field]}
                onCheckedChange={value => save(field, value)}
                disabled={updateMutation.isPending}
                aria-label={`Set ${label}`}
                data-testid={`switch-operational-flag-${field}`}
              />
            ) : (
              <Badge
                variant={product[field] ? "default" : "secondary"}
                className="text-[10px] h-4 px-1.5"
              >
                {product[field] ? "Yes" : "No"}
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  // ─── Tabs ─────────────────────────────────────────────────────────────────
  const availableRelProducts = (allProducts as any[]).filter(
    (p: any) => p.id !== id && !relationships.some((r: any) => r.relatedProductId === p.id)
  );

  return (
    <ProductEditContext.Provider value={canEditProduct}>
      <TooltipProvider>
        <RecordDetailLayout
        stickyHeader={stickyHeader}
        summaryStrip={summaryStrip}
        rightPanel={sidebar}
        rightPanelStickyTop={72}
        >
        <div className="px-6 pb-12">
          {/*
           * Tabs are CONTROLLED (value + onValueChange) per the Detail Page Standard.
           * This is required so navigateToTab() can switch tabs programmatically
           * from KPI chips, sidebar links, or any other in-page navigation.
           */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="sticky top-[72px] z-30 bg-background border-b rounded-none w-full justify-start gap-0 h-10 px-0 mb-6 overflow-x-auto">
              {[
                { value: "overview",       label: "Overview",             icon: Package    },
                { value: "pricing",        label: "Pricing",              icon: DollarSign },
                { value: "proposal",       label: "Proposal & Marketing", icon: Megaphone  },
                { value: "operations",     label: "Operations",           icon: Settings   },
                { value: "billing",        label: "Billing",              icon: FileText   },
                { value: "relationships",  label: "Relationships",        icon: Link2      },
                { value: "documents",      label: "Documents",            icon: Image      },
                { value: "analytics",      label: "Analytics",            icon: BarChart2  },
              ].map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[13px] font-medium px-4 h-10 shrink-0"
                >
                  <Icon className="h-3.5 w-3.5 mr-1.5" />{label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* ── OVERVIEW ── */}
            <TabsContent value="overview" className="p-0 space-y-4 mt-0">

              {/* Operational Summary — 4 KPI tiles */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Base Price */}
                <button
                  onClick={() => navigateToTab("pricing")}
                  className="text-left rounded-lg border bg-card p-4 hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  data-testid="kpi-tile-base-price"
                >
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                    <DollarSign className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Base Price</span>
                  </div>
                  <p className="text-xl font-bold tabular-nums leading-tight">{fmtCurrency(product.unitPrice)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">per {product.unit ?? "each"}</p>
                </button>

                {/* Billing Frequency */}
                <button
                  onClick={() => navigateToTab("billing")}
                  className="text-left rounded-lg border bg-card p-4 hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  data-testid="kpi-tile-billing-frequency"
                >
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Billing Frequency</span>
                  </div>
                  <p className="text-xl font-bold leading-tight truncate">{billingFreqLabel}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                    {BILLING_TRIGGER_LABELS[product.billingTrigger ?? ""] ?? product.billingTrigger ?? "—"}
                  </p>
                </button>

                {/* Active Customers */}
                <button
                  onClick={() => navigateToTab("analytics")}
                  className="text-left rounded-lg border bg-card p-4 hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  data-testid="kpi-tile-active-customers"
                >
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                    <Users className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Active Customers</span>
                  </div>
                  <p className="text-xl font-bold tabular-nums leading-tight">{accountProducts.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">accounts using this product</p>
                </button>

                {/* Active Quotes — placeholder until Quotes module ships */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="text-left rounded-lg border bg-card p-4 opacity-60 cursor-default"
                      data-testid="kpi-tile-active-quotes"
                    >
                      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                        <Quote className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider">Active Quotes</span>
                      </div>
                      <p className="text-xl font-bold leading-tight">—</p>
                      <p className="text-xs text-muted-foreground mt-0.5">quotes module coming soon</p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Active quote count will appear here once the Quotes & Proposals module is enabled.
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* General Information + Description side-by-side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FieldCard title="General Information" icon={Package}>
                  <EditableText
                    label="Product Name"
                    value={product.name}
                    field="name"
                    onSave={save}
                    placeholder="e.g. DriverShift Coverage"
                  />
                  <EditableText
                    label="Product Code"
                    value={product.productCode}
                    field="productCode"
                    onSave={save}
                    placeholder="e.g. DS-001"
                  />
                  <EditableSelect
                    label="Category"
                    value={product.serviceCategory}
                    field="serviceCategory"
                    onSave={save}
                    options={SERVICE_CATEGORIES.map(c => ({ value: c, label: SERVICE_CATEGORY_LABELS[c] ?? c }))}
                  />
                  <EditableSelect
                    label="Product Type"
                    value={product.productType}
                    field="productType"
                    onSave={save}
                    options={PRODUCT_TYPES.map(t => ({ value: t, label: t.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()) }))}
                  />
                  {/* Status — editable inline per ticket spec */}
                  <div>
                    <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status</Label>
                    <div className="mt-1.5 flex items-center gap-3">
                      <Switch
                        checked={!!product.isActive}
                        onCheckedChange={v => save("isActive", v)}
                        disabled={updateMutation.isPending}
                      />
                      <span className={`text-sm font-medium ${product.isActive ? "text-foreground" : "text-muted-foreground"}`}>
                        {product.isActive ? "Active" : "Inactive"}
                      </span>
                      {product.isActive
                        ? <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                        : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                  </div>
                </FieldCard>

                <FieldCard title="Description & Notes" icon={BookOpen}>
                  <EditableText
                    label="Description"
                    value={product.description}
                    field="description"
                    onSave={save}
                    textarea
                    placeholder="Brief public-facing description of what this product does"
                  />
                  <EditableText
                    label="Internal Notes"
                    value={product.internalNotes}
                    field="internalNotes"
                    onSave={save}
                    textarea
                    placeholder="Internal context, caveats, or handling instructions"
                  />
                </FieldCard>
              </div>
            </TabsContent>

            {/* ── PRICING ── */}
            <TabsContent value="pricing" className="p-0 space-y-3 mt-0">
              {(() => {
                const unitP = product.unitPrice != null ? Number(product.unitPrice) : null;
                const costV = product.cost       != null ? Number(product.cost)      : null;
                const tgtM  = product.marginTarget != null ? Number(product.marginTarget) : null;

                // Gross Margin % = (price - cost) / price × 100
                const grossMarginPct = unitP != null && costV != null && unitP > 0
                  ? ((unitP - costV) / unitP) * 100
                  : null;

                const marginBadge = grossMarginPct != null && tgtM != null
                  ? grossMarginPct / 100 >= tgtM
                    ? { label: "On Target",    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" }
                    : { label: "Below Target", cls: "bg-amber-100  text-amber-700  dark:bg-amber-900/30  dark:text-amber-300"  }
                  : null;

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

                    {/* Card 1 — Pricing Configuration */}
                    <FieldCard title="Pricing Configuration" icon={DollarSign}>
                      <EditableSelect
                        label="Pricing Model"
                        value={product.pricingModel}
                        field="pricingModel"
                        onSave={save}
                        options={PRICING_MODELS.map(m => ({ value: m, label: PRICING_MODEL_LABELS[m] ?? m }))}
                      />
                      <EditableText
                        label="Default Price (USD)"
                        value={product.unitPrice}
                        field="unitPrice"
                        onSave={save}
                        placeholder="0.00"
                      />
                      <EditableText
                        label="Rate Unit"
                        value={product.unit}
                        field="unit"
                        onSave={save}
                        placeholder="e.g. hour, shift, month"
                      />
                      <EditableDate
                        label="Effective Date"
                        value={product.effectiveDate}
                        field="effectiveDate"
                        onSave={save}
                        hint="Date from which this pricing applies"
                      />
                      <EditableText
                        label="Price Book"
                        value={product.priceBook}
                        field="priceBook"
                        onSave={save}
                        placeholder="e.g. Standard, Enterprise, Partner"
                      />
                    </FieldCard>

                    {/* Card 2 — Cost & Margin Analysis */}
                    <FieldCard title="Cost & Margin Analysis" icon={TrendingUp}>
                      <EditableText
                        label="Cost (USD)"
                        value={product.cost}
                        field="cost"
                        onSave={save}
                        placeholder="Cost to deliver this product"
                      />
                      <ReadOnlyField
                        label="Gross Margin"
                        emphasis
                        value={
                          grossMarginPct != null
                            ? <span className={grossMarginPct < 0 ? "text-red-600 dark:text-red-400" : ""}>{grossMarginPct.toFixed(1)}%</span>
                            : <span className="text-muted-foreground italic text-xs">Set Default Price and Cost to compute</span>
                        }
                        badge={marginBadge?.label}
                        badgeClass={marginBadge?.cls}
                      />
                      <EditableText
                        label="Target Margin (decimal)"
                        value={product.marginTarget}
                        field="marginTarget"
                        onSave={save}
                        placeholder="e.g. 0.30 = 30%"
                      />
                      <EditableText
                        label="Suggested Price"
                        value={product.suggestedPrice}
                        field="suggestedPrice"
                        onSave={save}
                        placeholder="Recommended default for quotes"
                      />
                      {(unitP != null || costV != null || tgtM != null) && (
                        <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2 space-y-0.5 mt-1">
                          {unitP != null && costV != null && (
                            <div>Contribution: <span className="font-medium">{fmtCurrency(unitP - costV)}</span> per unit</div>
                          )}
                          {tgtM != null && (
                            <div>Target: <span className="font-medium">{fmtPct(tgtM)}</span>
                              {grossMarginPct != null && (
                                <span className={`ml-1 ${grossMarginPct / 100 >= tgtM ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                                  (actual {grossMarginPct.toFixed(1)}%)
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </FieldCard>

                    {/* Card 3 — Price Range */}
                    <FieldCard title="Price Range" icon={BarChart2}>
                      <EditableText
                        label="Minimum Price"
                        value={product.minPrice}
                        field="minPrice"
                        onSave={save}
                        placeholder="Floor — lowest acceptable"
                      />
                      <EditableText
                        label="Maximum Price"
                        value={product.maxPrice}
                        field="maxPrice"
                        onSave={save}
                        placeholder="Ceiling price"
                      />
                      {product.minPrice && product.maxPrice && (
                        <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2 space-y-0.5 mt-1">
                          <div>Accepted range: <span className="font-medium">{fmtCurrency(product.minPrice)} – {fmtCurrency(product.maxPrice)}</span></div>
                          {unitP != null && (
                            <div>Default price is
                              {unitP < Number(product.minPrice)
                                ? <span className="text-red-600 dark:text-red-400 ml-1 font-medium">below minimum</span>
                                : unitP > Number(product.maxPrice)
                                  ? <span className="text-red-600 dark:text-red-400 ml-1 font-medium">above maximum</span>
                                  : <span className="text-emerald-600 dark:text-emerald-400 ml-1 font-medium">within range ✓</span>
                              }
                            </div>
                          )}
                        </div>
                      )}
                    </FieldCard>

                    {/* Card 4 — Billing Schedule */}
                    <FieldCard title="Billing Schedule" icon={FileText}>
                      <EditableSelect
                        label="Billing Frequency"
                        value={product.billingFrequency}
                        field="billingFrequency"
                        onSave={save}
                        options={BILLING_FREQUENCIES.map(f => ({ value: f, label: BILLING_FREQUENCY_LABELS[f] ?? f }))}
                      />
                      <EditableSelect
                        label="Billing Trigger"
                        value={product.billingTrigger}
                        field="billingTrigger"
                        onSave={save}
                        options={BILLING_TRIGGERS.map(t => ({ value: t, label: BILLING_TRIGGER_LABELS[t] ?? t }))}
                      />
                      <EditableText label="Currency" value={product.currency} field="currency" onSave={save} placeholder="USD" />
                      <EditableSwitch label="Taxable" value={product.taxable} field="taxable" onSave={save} />
                      {product.taxable && (
                        <EditableText label="Tax Rate" value={product.taxRate} field="taxRate" onSave={save} placeholder="e.g. 0.0825 (8.25%)" />
                      )}
                    </FieldCard>

                  </div>
                );
              })()}
            </TabsContent>

            {/* ── PROPOSAL & MARKETING ── */}
            <TabsContent value="proposal" className="p-0 space-y-3 mt-0">
              <div className="grid grid-cols-1 gap-3">

                {/* Card 1 — Proposal Copy */}
                <FieldCard title="Proposal Copy" icon={Megaphone}>
                  <p className="text-xs text-muted-foreground -mt-2">Used to auto-generate proposals and quotes. Keep it crisp and customer-ready.</p>
                  <EditableText label="Headline" value={product.headline} field="headline" onSave={save} placeholder="One powerful sentence that leads every proposal" />
                  <EditableText label="Executive Summary" value={product.executiveSummary} field="executiveSummary" onSave={save} textarea placeholder="2–3 sentence overview for decision-makers" />
                  <EditableText label="Customer Description" value={product.customerDescription} field="customerDescription" onSave={save} textarea placeholder="Full description shown to the customer in proposals" />
                  <EditableText label="Call to Action" value={product.callToAction} field="callToAction" onSave={save} placeholder='e.g. "Get Started Today" or "Schedule a Demo"' />
                </FieldCard>

                {/* Card 2 — Value Proposition */}
                <FieldCard title="Value Proposition" icon={Briefcase}>
                  <EditableText label="What It Delivers" value={product.whatItDelivers} field="whatItDelivers" onSave={save} textarea placeholder="Specific outcomes the customer can expect" />
                  <EditableText label="Benefits" value={product.benefits} field="benefits" onSave={save} textarea placeholder="Key advantages — one per line recommended" />
                  <EditableText label="Best For / Use Cases" value={product.bestFor} field="bestFor" onSave={save} textarea placeholder="Ideal customer scenarios and situations" />
                </FieldCard>

                {/* Card 3 — Media Assets */}
                <FieldCard title="Media Assets" icon={Image}>
                  <div className="space-y-6">

                    {/* Hero Image */}
                    <div className="space-y-2">
                      <EditableText
                        label="Hero Image URL"
                        value={product.heroImage}
                        field="heroImage"
                        onSave={save}
                        placeholder="https://… (JPG, PNG, or WebP)"
                      />
                      {product.heroImage && (
                        <div className="relative rounded-md overflow-hidden border bg-muted">
                          <img
                            src={product.heroImage}
                            alt="Hero"
                            className="w-full max-h-56 object-cover"
                            onError={e => {
                              const el = e.target as HTMLImageElement;
                              el.style.display = "none";
                              el.nextElementSibling?.removeAttribute("hidden");
                            }}
                          />
                          <p hidden className="py-6 text-center text-xs text-muted-foreground">Image could not be loaded</p>
                        </div>
                      )}
                    </div>

                    {/* Product Icon */}
                    <div className="space-y-2">
                      <EditableText
                        label="Product Icon URL"
                        value={product.productIcon}
                        field="productIcon"
                        onSave={save}
                        placeholder="https://… (square image, min 128×128)"
                      />
                      {product.productIcon && (
                        <div className="flex items-center gap-3">
                          <img
                            src={product.productIcon}
                            alt="Icon"
                            className="h-16 w-16 rounded-xl border object-contain bg-muted p-1.5"
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                          <p className="text-xs text-muted-foreground">Shown in listings, proposals, and the product header</p>
                        </div>
                      )}
                    </div>

                    {/* Marketing Flyer */}
                    <div className="space-y-1">
                      <EditableText
                        label="Marketing Flyer URL"
                        value={product.flyerUrl}
                        field="flyerUrl"
                        onSave={save}
                        placeholder="https://… (PDF or hosted link)"
                      />
                      {product.flyerUrl && (
                        <a
                          href={product.flyerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline mt-0.5"
                        >
                          <ExternalLink className="h-3 w-3" />Open flyer
                        </a>
                      )}
                    </div>

                    {/* Videos */}
                    <VideoUrlManager
                      urls={Array.isArray(product.videoUrls) ? product.videoUrls : []}
                      onSave={urls => save("videoUrls", urls)}
                    />

                  </div>
                </FieldCard>

                {/* Proposal Preview — visible once enough content exists */}
                {(product.headline || product.executiveSummary || product.heroImage) && (
                  <Card className="border-dashed">
                    <CardHeader className="pb-2 pt-3 px-5">
                      <CardTitle className="text-[15px] font-semibold text-muted-foreground flex items-center gap-2">
                        <Quote className="h-4 w-4" />Proposal Preview
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-4 space-y-3">
                      {product.heroImage && (
                        <img
                          src={product.heroImage}
                          alt="Hero"
                          className="rounded-md w-full max-h-40 object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                      <div className="flex items-start gap-3">
                        {product.productIcon && (
                          <img
                            src={product.productIcon}
                            alt="Icon"
                            className="h-10 w-10 rounded-lg border object-contain bg-muted p-1 shrink-0"
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          {product.headline && <h2 className="text-lg font-semibold leading-snug">{product.headline}</h2>}
                          {product.executiveSummary && <p className="text-sm text-muted-foreground mt-1">{product.executiveSummary}</p>}
                        </div>
                      </div>
                      {product.whatItDelivers && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">What It Delivers</p>
                          <p className="text-sm">{product.whatItDelivers}</p>
                        </div>
                      )}
                      {product.benefits && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Benefits</p>
                          <p className="text-sm whitespace-pre-line">{product.benefits}</p>
                        </div>
                      )}
                      {product.bestFor && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Best For</p>
                          <p className="text-sm">{product.bestFor}</p>
                        </div>
                      )}
                      {product.callToAction && (
                        <Button size="sm" className="mt-1">{product.callToAction}</Button>
                      )}
                    </CardContent>
                  </Card>
                )}

              </div>
            </TabsContent>

            {/* ── OPERATIONS ── */}
            <TabsContent value="operations" className="p-0 space-y-3 mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FieldCard title="Configuration" icon={Settings}>
                  <EditableSelect
                    label="Service Category"
                    value={product.serviceCategory}
                    field="serviceCategory"
                    onSave={save}
                    options={SERVICE_CATEGORIES.map(c => ({ value: c, label: SERVICE_CATEGORY_LABELS[c] ?? c }))}
                  />
                  <EditableText label="Operational Division" value={product.operationalDivision} field="operationalDivision" onSave={save} />
                  <EditableText label="Markets" value={Array.isArray(product.markets) && product.markets.length ? product.markets.join(", ") : null} field="marketAvailability" onSave={save} placeholder="e.g. Dallas, Austin, Houston" />
                  <EditableText label="Default Move Types" value={product.defaultMoveTypes} field="defaultMoveTypes" onSave={save} placeholder="Comma-separated" />
                </FieldCard>

                <FieldCard title="Operational Flags" icon={ToggleRight}>
                  {[
                    { label: "Requires Scheduling", field: "requiresScheduling", desc: "Shifts must be scheduled before service" },
                    { label: "Requires Driver Assignment", field: "requiresDriverAssignment", desc: "A specific driver must be assigned" },
                    { label: "Requires Dispatch", field: "requiresDispatch", desc: "Dispatch workflow is required" },
                    { label: "Eligible for DriverDash", field: "eligibleForDriverDash", desc: "Can be fulfilled via the DriverDash app" },
                    { label: "Requires Billing Approval", field: "requiresBillingApproval", desc: "Charges must be approved before invoicing" },
                    { label: "Requires Vehicle Tracking", field: "requiresVehicleTracking", desc: "GPS/vehicle tracking must be active" },
                  ].map(({ label, field, desc }) => (
                    <EditableSwitch key={field} label={label} value={product[field]} field={field} onSave={save} description={desc} />
                  ))}
                </FieldCard>

                <FieldCard title="Rules & Requirements" icon={AlertCircle}>
                  <EditableText label="Driver Requirements" value={product.driverRequirements} field="driverRequirements" onSave={save} textarea placeholder="Certifications, licenses, or qualifications needed" />
                  <EditableText label="Scheduling Rules" value={product.schedulingRules} field="schedulingRules" onSave={save} textarea placeholder="Advance notice, blackout periods, shift constraints" />
                  <EditableText label="Compliance Rules" value={product.complianceRules} field="complianceRules" onSave={save} textarea placeholder="Regulatory or policy requirements" />
                  <EditableText label="Dispatch Rules" value={product.dispatchRules} field="dispatchRules" onSave={save} textarea placeholder="Dispatch priority, escalation, or routing rules" />
                </FieldCard>

                <FieldCard title="Operational Notes" icon={FileText}>
                  <EditableText label="Operational Notes" value={product.operationalNotes} field="operationalNotes" onSave={save} textarea placeholder="Internal ops context or special handling instructions" />
                </FieldCard>
              </div>
              <FieldCard title="Operational Flag History" icon={History}>
                {operationalFlagHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No operational flag changes have been recorded.</p>
                ) : (
                  <div className="divide-y rounded-md border">
                    {operationalFlagHistory.map((entry: any) => (
                      <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span>
                          <span className="font-medium">{entry.flagName}</span>
                          <span className="text-muted-foreground">: {entry.previousValue ? "On" : "Off"} → {entry.newValue ? "On" : "Off"}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {entry.changedByName || "Unknown user"} · {new Date(entry.changedAt).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </FieldCard>
            </TabsContent>

            {/* ── BILLING ── */}
            <TabsContent value="billing" className="p-0 space-y-3 mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FieldCard title="Revenue Classification" icon={DollarSign}>
                  <EditableSelect
                    label="Revenue Category"
                    value={product.revenueCategory}
                    field="revenueCategory"
                    onSave={save}
                    options={PRODUCT_REVENUE_CATEGORIES.map(c => ({ value: c, label: PRODUCT_REVENUE_CATEGORY_LABELS[c] ?? c }))}
                  />
                  <EditableSelect
                    label="Product Type"
                    value={product.productType}
                    field="productType"
                    onSave={save}
                    options={PRODUCT_TYPES.map(t => ({ value: t, label: t.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()) }))}
                  />
                  <EditableSelect
                    label="Billing Frequency"
                    value={product.billingFrequency}
                    field="billingFrequency"
                    onSave={save}
                    options={BILLING_FREQUENCIES.map(f => ({ value: f, label: BILLING_FREQUENCY_LABELS[f] ?? f }))}
                  />
                  <EditableSelect
                    label="Billing Trigger"
                    value={product.billingTrigger}
                    field="billingTrigger"
                    onSave={save}
                    options={BILLING_TRIGGERS.map(t => ({ value: t, label: BILLING_TRIGGER_LABELS[t] ?? t }))}
                  />
                </FieldCard>

                <FieldCard title="GL & Accounting" icon={Layers}>
                  <EditableText label="GL Code" value={product.glCode} field="glCode" onSave={save} placeholder="e.g. 4000-LABOR" />
                  <EditableText label="Export Code" value={product.exportCode} field="exportCode" onSave={save} placeholder="QuickBooks/ERP export identifier" />
                  <EditableText label="Invoice Description" value={product.invoiceDescription} field="invoiceDescription" onSave={save} placeholder="Line item label on customer invoice" />
                  <EditableText label="Accounting Notes" value={product.accountingNotes} field="accountingNotes" onSave={save} textarea placeholder="Internal accounting guidance" />
                </FieldCard>

                <FieldCard title="Tax & Revenue Rules" icon={FileText}>
                  <EditableSwitch label="Taxable" value={product.taxable} field="taxable" onSave={save} />
                  {product.taxable && (
                    <EditableText label="Tax Rate" value={product.taxRate} field="taxRate" onSave={save} placeholder="e.g. 0.0825 for 8.25%" />
                  )}
                  <EditableText label="Tax Rules" value={product.taxRules} field="taxRules" onSave={save} textarea placeholder="Tax codes, exemptions, or special handling" />
                  <EditableText label="Revenue Recognition Policy" value={product.revenueRecognition} field="revenueRecognition" onSave={save} textarea placeholder="When and how revenue is recognized" />
                  <EditableText label="Pass-Through Rules" value={product.passThroughRules} field="passThroughRules" onSave={save} textarea placeholder="Cost pass-through or reimbursement rules" />
                </FieldCard>
              </div>
            </TabsContent>

            {/* ── RELATIONSHIPS ── */}
            <TabsContent value="relationships" className="p-0 space-y-3 mt-0">
              {/* Add Relationship */}
              {canEditProduct && (
              <Card>
                <CardHeader className="pb-3 pt-3 px-5">
                  <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
                    <Plus className="h-4 w-4 text-muted-foreground" />Add Product Relationship
                  </CardTitle>
                  <CardDescription className="text-xs">Link this product to others for cross-selling, bundling, or conflict rules.</CardDescription>
                </CardHeader>
                <CardContent className="px-5 pb-3">
                  <div className="flex gap-2 flex-wrap">
                    <Select value={relType} onValueChange={setRelType}>
                      <SelectTrigger className="h-8 text-sm w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RELATIONSHIP_TYPES.map(r => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={relProduct} onValueChange={setRelProduct}>
                      <SelectTrigger className="h-8 text-sm flex-1 min-w-[200px]">
                        <SelectValue placeholder="Select a product…" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableRelProducts.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}{p.sku ? ` (${p.sku})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="h-8"
                      disabled={!relProduct || addRelationship.isPending}
                      onClick={() => {
                        if (!relProduct) return;
                        addRelationship.mutate({ relatedProductId: relProduct, relationshipType: relType });
                        setRelProduct("");
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" />Add
                    </Button>
                  </div>
                </CardContent>
              </Card>
              )}

              {/* Relationships grouped by type */}
              {RELATIONSHIP_TYPES.map(rt => {
                const group = relationships.filter((r: any) => r.relationshipType === rt.value);
                if (!group.length) return null;
                return (
                  <Card key={rt.value}>
                    <CardHeader className="pb-2 pt-3 px-5">
                      <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
                        <Badge variant="outline" className={`text-xs ${RELATIONSHIP_COLORS[rt.value]}`}>{rt.label}</Badge>
                        <span className="text-muted-foreground font-normal text-sm">({group.length})</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-3 space-y-2">
                      {group.map((rel: any) => (
                        <div key={rel.id} className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-muted/30">
                          <div>
                            <p className="text-sm font-medium">{rel.relatedName ?? rel.relatedProductId}</p>
                            <p className="text-xs text-muted-foreground">
                              {rel.relatedSku && <span className="font-mono">{rel.relatedSku}</span>}
                              {rel.relatedCategory && <> · {SERVICE_CATEGORY_LABELS[rel.relatedCategory] ?? rel.relatedCategory}</>}
                              {rel.relatedIsActive === false && <span className="ml-1 text-amber-600">· Inactive</span>}
                            </p>
                          </div>
                          {canEditProduct && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => removeRelationship.mutate(rel.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}

              {relationships.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <Link2 className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No relationships defined yet.</p>
                  <p className="text-xs">Add suggested products, required bundles, or mutually exclusive options above.</p>
                </div>
              )}
            </TabsContent>

            {/* ── DOCUMENTS ── */}
            <TabsContent value="documents" className="p-0 space-y-3 mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FieldCard title="Media Assets" icon={Image}>
                  <EditableText label="Hero Image URL" value={product.heroImage} field="heroImage" onSave={save} placeholder="https://…" />
                  <EditableText label="Product Icon URL" value={product.productIcon} field="productIcon" onSave={save} placeholder="https://…" />
                  <EditableText label="Flyer URL" value={product.flyerUrl} field="flyerUrl" onSave={save} placeholder="https://…" />
                  {product.heroImage && (
                    <div>
                      <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Hero Preview</Label>
                      <img src={product.heroImage} alt="" className="mt-1 rounded border max-h-32 object-cover w-full" />
                    </div>
                  )}
                  {product.productIcon && (
                    <div className="flex items-center gap-2">
                      <img src={product.productIcon} alt="" className="h-10 w-10 rounded border object-contain" />
                      <span className="text-xs text-muted-foreground">Icon preview</span>
                    </div>
                  )}
                </FieldCard>

                <FieldCard title="Quick Links" icon={ExternalLink}>
                  {product.flyerUrl && (
                    <a href={product.flyerUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <FileText className="h-4 w-4" />Product Flyer
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {Array.isArray(product.videoUrls) && product.videoUrls.length > 0 && product.videoUrls.map((url: string, i: number) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <Globe className="h-4 w-4" />Video {i + 1}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ))}
                  {!product.flyerUrl && !(product.videoUrls?.length) && (
                    <p className="text-xs text-muted-foreground">No media links set. Add URLs in the fields to the left.</p>
                  )}
                </FieldCard>
              </div>

              {/* Uploaded Documents */}
              {documents.length > 0 && (
                <Card>
                  <CardHeader className="pb-2 pt-3 px-5">
                    <CardTitle className="text-[15px] font-semibold">Uploaded Documents</CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-3 space-y-2">
                    {documents.map((doc: any) => (
                      <div key={doc.id} className="flex items-center justify-between border rounded px-3 py-2">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm">{doc.label ?? doc.fileName ?? "Untitled"}</p>
                            <p className="text-xs text-muted-foreground">{doc.docType}</p>
                          </div>
                        </div>
                        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ── ANALYTICS ── */}
            <TabsContent value="analytics" className="p-0 space-y-3 mt-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Active Customers", value: accountProducts.length, icon: Users },
                  { label: "Relationships", value: relationships.length, icon: Link2 },
                  { label: "Documents", value: documents.length, icon: FileText },
                  { label: "Status", value: product.isActive ? "Active" : "Inactive", icon: CheckCircle },
                ].map(({ label, value, icon: Icon }) => (
                  <Card key={label}>
                    <CardContent className="pt-4 px-5 pb-3">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Icon className="h-4 w-4" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
                      </div>
                      <p className="text-2xl font-bold tabular-nums">{value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Pricing analysis */}
              {(product.minPrice || product.maxPrice || product.suggestedPrice || product.marginTarget) && (
                <Card>
                  <CardHeader className="pb-1.5 pt-3 px-5">
                    <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />Pricing Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div><p className="text-xs text-muted-foreground mb-1">Base Price</p><p className="text-xs font-semibold tabular-nums">{fmtCurrency(product.unitPrice)}</p></div>
                      <div><p className="text-xs text-muted-foreground mb-1">Minimum</p><p className="text-xs font-semibold tabular-nums">{fmtCurrency(product.minPrice)}</p></div>
                      <div><p className="text-xs text-muted-foreground mb-1">Maximum</p><p className="text-xs font-semibold tabular-nums">{fmtCurrency(product.maxPrice)}</p></div>
                      <div><p className="text-xs text-muted-foreground mb-1">Target Margin</p><p className="text-xs font-semibold tabular-nums">{fmtPct(product.marginTarget)}</p></div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card className="border-dashed">
                <CardContent className="py-8 flex flex-col items-center text-muted-foreground gap-2">
                  <BarChart2 className="h-10 w-10 opacity-20" />
                  <p className="text-sm">Revenue and win-rate analytics are available once the Quotes & Proposals module is active.</p>
                </CardContent>
              </Card>

              {/* Account list */}
              {accountProducts.length > 0 && (
                <Card>
                  <CardHeader className="pb-1.5 pt-3 px-5">
                    <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />Customer Accounts ({accountProducts.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-3 space-y-2">
                    {accountProducts.map((ap: any) => (
                      <div key={ap.id} className="flex items-center justify-between text-sm border rounded px-3 py-2">
                        <span className="text-muted-foreground font-mono text-xs">{ap.customerId}</span>
                        {ap.priceOverride && (
                          <Badge variant="outline" className="text-xs">{fmtCurrency(ap.priceOverride)} override</Badge>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
        </RecordDetailLayout>
      </TooltipProvider>
    </ProductEditContext.Provider>
  );
}
