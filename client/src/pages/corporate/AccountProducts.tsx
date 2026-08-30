import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Link2, Plus, Pencil, Trash2, Loader2, Search, ToggleLeft, ToggleRight,
  Package, RefreshCw, CheckCircle2,
} from "lucide-react";
import {
  PRODUCT_TYPE_LABELS, BILLING_FREQUENCY_LABELS, PRODUCT_REVENUE_CATEGORY_LABELS,
} from "@shared/schema";

const BILLING_FREQ_LABELS = BILLING_FREQUENCY_LABELS;
const REVENUE_CATEGORY_LABELS = PRODUCT_REVENUE_CATEGORY_LABELS;

const REVENUE_CATEGORY_COLORS: Record<string, string> = {
  labor: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  moves: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  rideshare: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  insurance: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  technology: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
  fees: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  other: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function fmt(val: number | string | null) {
  if (!val) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(val));
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const emptyForm = {
  customerId: "", productId: "", priceOverride: "", startDate: "", endDate: "", isActive: true, notes: "",
};

export default function AccountProducts() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterCustomer, setFilterCustomer] = useState("all");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<any | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: assignments = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/finance/account-products", filterCustomer],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterCustomer !== "all") params.set("customerId", filterCustomer);
      const r = await fetch(`/api/finance/account-products?${params}`, { credentials: "include" });
      return r.json();
    },
  });

  const { data: customers = [] } = useQuery<any[]>({ queryKey: ["/api/customers"] });
  const { data: products = [] } = useQuery<any[]>({ queryKey: ["/api/finance/products"] });

  const saveMut = useMutation({
    mutationFn: (data: any) => editingRow
      ? apiRequest("PATCH", `/api/finance/account-products/${editingRow.id}`, data)
      : apiRequest("POST", "/api/finance/account-products", data),
    onSuccess: () => {
      toast({ title: editingRow ? "Assignment updated" : "Product assigned", description: "Account product assignment saved." });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/account-products"] });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/finance/account-products/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/finance/account-products"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/finance/account-products/${id}`),
    onSuccess: () => {
      toast({ title: "Removed", description: "Product assignment removed." });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/account-products"] });
    },
  });

  function openNew() {
    setEditingRow(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  }
  function openEdit(row: any) {
    setEditingRow(row);
    setForm({
      customerId: row.customerId, productId: row.productId,
      priceOverride: row.priceOverride || "", startDate: row.startDate || "",
      endDate: row.endDate || "", isActive: row.isActive, notes: row.notes || "",
    });
    setDialogOpen(true);
  }
  function closeDialog() { setDialogOpen(false); setEditingRow(null); setForm({ ...emptyForm }); }
  const sel = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  // Filter
  const filtered = assignments.filter(a => {
    if (filterActive === "active" && !a.isActive) return false;
    if (filterActive === "inactive" && a.isActive) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.productName?.toLowerCase().includes(q) && !a.customerName?.toLowerCase().includes(q) &&
          !(a.productSku || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const activeProductsByCustomer = (customers as any[]).map(c => ({
    ...c,
    assignedCount: assignments.filter(a => a.customerId === c.id && a.isActive).length,
  }));

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-primary/10 p-2"><Link2 className="h-5 w-5 text-primary" /></div>
        <div>
          <h1 className="text-xl font-bold" data-testid="text-account-products-title">Account Product Assignments</h1>
          <p className="text-sm text-muted-foreground">Define which products each account is contracted to be billed for</p>
        </div>
        <Button className="ml-auto" size="sm" onClick={openNew} data-testid="button-assign-product">
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Assign Product
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search product or account…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 w-56" data-testid="input-search-assignments" />
        </div>
        <Select value={filterCustomer} onValueChange={setFilterCustomer}>
          <SelectTrigger className="w-44" data-testid="select-filter-customer"><SelectValue placeholder="All Accounts" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.customerName}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterActive} onValueChange={v => setFilterActive(v as any)}>
          <SelectTrigger className="w-36" data-testid="select-filter-active"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active Only</SelectItem>
            <SelectItem value="inactive">Inactive Only</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-assignments">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading assignments…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <Package className="h-8 w-8" />
              <div className="font-medium">No product assignments found</div>
              <div className="text-sm">Assign products to accounts to define what they are billed for.</div>
              <Button size="sm" onClick={openNew} className="mt-2" data-testid="button-empty-assign">
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Assign First Product
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead className="text-right">List Price</TableHead>
                  <TableHead className="text-right">Override</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(a => (
                  <TableRow key={a.id} data-testid={`row-assignment-${a.id}`}>
                    <TableCell className="font-medium text-sm">
                      {customers.find((c: any) => c.id === a.customerId)?.customerName || a.customerId}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{a.productName}</div>
                      {a.productSku && <div className="text-xs text-muted-foreground">{a.productSku}</div>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.productType ? PRODUCT_TYPE_LABELS[a.productType] || a.productType : "—"}</TableCell>
                    <TableCell>
                      {a.revenueCategory ? (
                        <Badge className={`text-xs ${REVENUE_CATEGORY_COLORS[a.revenueCategory] || ""}`}>{REVENUE_CATEGORY_LABELS[a.revenueCategory] || a.revenueCategory}</Badge>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.billingFrequency ? BILLING_FREQ_LABELS[a.billingFrequency] || a.billingFrequency : "—"}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{fmt(a.unitPrice)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {a.priceOverride ? <span className="font-medium text-amber-700 dark:text-amber-400">{fmt(a.priceOverride)}</span> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(a.startDate)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(a.endDate)}</TableCell>
                    <TableCell>
                      <Switch checked={a.isActive} onCheckedChange={v => toggleMut.mutate({ id: a.id, isActive: v })} disabled={toggleMut.isPending} data-testid={`switch-active-${a.id}`} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(a)} data-testid={`button-edit-${a.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteMut.mutate(a.id)} disabled={deleteMut.isPending} data-testid={`button-delete-${a.id}`}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Assignment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingRow ? "Edit Assignment" : "Assign Product to Account"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Account *</Label>
              <Select value={form.customerId} onValueChange={v => sel("customerId", v)} disabled={!!editingRow}>
                <SelectTrigger data-testid="select-dialog-customer"><SelectValue placeholder="Select account…" /></SelectTrigger>
                <SelectContent>{customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.customerName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Product *</Label>
              <Select value={form.productId} onValueChange={v => sel("productId", v)} disabled={!!editingRow}>
                <SelectTrigger data-testid="select-dialog-product"><SelectValue placeholder="Select product…" /></SelectTrigger>
                <SelectContent>
                  {products.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span>{p.name}</span>
                      {p.sku && <span className="text-muted-foreground ml-1.5">({p.sku})</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Price Override <span className="text-muted-foreground text-xs">(leave blank to use product list price)</span></Label>
              <Input type="number" step="0.01" value={form.priceOverride} onChange={e => sel("priceOverride", e.target.value)} placeholder="0.00" data-testid="input-price-override" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <Input type="date" value={form.startDate} onChange={e => sel("startDate", e.target.value)} data-testid="input-start-date" />
              </div>
              <div>
                <Label>End Date</Label>
                <Input type="date" value={form.endDate} onChange={e => sel("endDate", e.target.value)} data-testid="input-end-date" />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => sel("notes", e.target.value)} rows={2} placeholder="Contract notes, billing terms…" data-testid="input-assignment-notes" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.isActive} onCheckedChange={v => sel("isActive", v)} data-testid="switch-dialog-active" />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              onClick={() => saveMut.mutate({
                customerId: form.customerId, productId: form.productId,
                priceOverride: form.priceOverride ? String(form.priceOverride) : null,
                startDate: form.startDate || null, endDate: form.endDate || null,
                isActive: form.isActive, notes: form.notes || null,
              })}
              disabled={saveMut.isPending || !form.customerId || !form.productId}
              data-testid="button-save-assignment"
            >
              {saveMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
