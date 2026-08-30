import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Plus, Search, FileText, CheckCircle2, Send, CircleDollarSign,
  Ban, ChevronDown, Trash2, PlusCircle, AlertTriangle, Building2,
  Clock, FileCheck, Download, ArrowUpRight
} from "lucide-react";
import { format } from "date-fns";
import { formatDate, parseDateSafe } from "@/lib/dateFormat";

type BillStatus = "draft" | "coded" | "approved" | "exported" | "paid" | "partial" | "voided" | "overdue";

interface BillLine {
  id?: string;
  description: string;
  quantity: string;
  unitPrice: string;
  expenseAccountCode: string;
  taxCode: string;
  classCode: string;
  accountId: string;
  taxRate?: string;
}

interface Bill {
  id: string;
  billNumber: string | null;
  vendorId: string;
  invoiceNumber: string | null;
  billDate: string;
  dueDate: string;
  subtotalAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  balanceDue: string;
  currency: string;
  status: BillStatus;
  paymentTerms: string | null;
  referenceNumber: string | null;
  memo: string | null;
  internalNotes: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  codedBy: string | null;
  codedAt: string | null;
  exportedBy: string | null;
  exportedAt: string | null;
  voidedBy: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  lines?: BillLine[];
}

interface Vendor {
  id: string;
  name: string;
  paymentTerms: string | null;
  status: string;
}

const PAYMENT_TERMS = [
  { value: "due_on_receipt", label: "Due on Receipt" },
  { value: "net_7", label: "Net 7" },
  { value: "net_10", label: "Net 10" },
  { value: "net_15", label: "Net 15" },
  { value: "net_30", label: "Net 30" },
  { value: "net_45", label: "Net 45" },
  { value: "net_60", label: "Net 60" },
  { value: "net_90", label: "Net 90" },
];

const TERM_DAYS: Record<string, number> = {
  due_on_receipt: 0, net_7: 7, net_10: 10, net_15: 15,
  net_30: 30, net_45: 45, net_60: 60, net_90: 90,
};

const STATUS_CONFIG: Record<BillStatus, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: "Draft", color: "bg-muted text-muted-foreground", icon: <FileText className="w-3 h-3" /> },
  coded: { label: "Coded", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300", icon: <FileCheck className="w-3 h-3" /> },
  approved: { label: "Approved", color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300", icon: <CheckCircle2 className="w-3 h-3" /> },
  exported: { label: "Exported", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300", icon: <Send className="w-3 h-3" /> },
  paid: { label: "Paid", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300", icon: <CircleDollarSign className="w-3 h-3" /> },
  partial: { label: "Partial", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300", icon: <CircleDollarSign className="w-3 h-3" /> },
  voided: { label: "Voided", color: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300", icon: <Ban className="w-3 h-3" /> },
  overdue: { label: "Overdue", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300", icon: <Clock className="w-3 h-3" /> },
};

function StatusBadge({ status }: { status: BillStatus }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function formatCurrency(val: string | number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(val) || 0);
}

function calcDueDate(billDate: string, terms: string): string {
  if (!billDate || !terms) return "";
  const days = TERM_DAYS[terms] ?? 30;
  const d = parseDateSafe(billDate);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const emptyLine = (): BillLine => ({
  description: "",
  quantity: "1",
  unitPrice: "",
  expenseAccountCode: "",
  taxCode: "",
  classCode: "",
  accountId: "",
  taxRate: "0",
});

export default function BillsAdmin() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  // Form state
  const [form, setForm] = useState({
    vendorId: "",
    invoiceNumber: "",
    billDate: new Date().toISOString().split("T")[0],
    dueDate: "",
    paymentTerms: "net_30",
    currency: "USD",
    memo: "",
    internalNotes: "",
    referenceNumber: "",
  });
  const [lines, setLines] = useState<BillLine[]>([emptyLine()]);

  const { data: bills = [], isLoading } = useQuery<Bill[]>({
    queryKey: ["/api/finance/bills"],
  });

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ["/api/finance/vendors-list"],
  });

  const { data: detailBill } = useQuery<Bill>({
    queryKey: ["/api/finance/bills", selectedBill?.id, "with-lines"],
    queryFn: async () => {
      if (!selectedBill?.id) return null;
      const res = await fetch(`/api/finance/bills/${selectedBill.id}/with-lines`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedBill?.id,
  });

  // Auto-calc due date when billDate or paymentTerms change
  useEffect(() => {
    if (form.billDate && form.paymentTerms) {
      setForm(f => ({ ...f, dueDate: calcDueDate(f.billDate, f.paymentTerms) }));
    }
  }, [form.billDate, form.paymentTerms]);

  // When vendor changes, inherit payment terms
  useEffect(() => {
    if (form.vendorId) {
      const v = vendors.find(v => v.id === form.vendorId);
      if (v?.paymentTerms) setForm(f => ({ ...f, paymentTerms: v.paymentTerms! }));
    }
  }, [form.vendorId, vendors]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const subtotal = lines.reduce((sum, l) => sum + (Number(l.quantity) * Number(l.unitPrice) || 0), 0);
      const taxAmt = lines.reduce((sum, l) => sum + (Number(l.quantity) * Number(l.unitPrice) * (Number(l.taxRate) || 0)), 0);
      const total = subtotal + taxAmt;
      const bill = await apiRequest("POST", "/api/finance/bills", {
        ...form,
        subtotalAmount: subtotal.toFixed(2),
        taxAmount: taxAmt.toFixed(2),
        totalAmount: total.toFixed(2),
        paidAmount: "0",
        balanceDue: total.toFixed(2),
      });
      // Create lines
      for (const [i, line] of lines.entries()) {
        const lineSubtotal = (Number(line.quantity) * Number(line.unitPrice) || 0);
        const lineTax = lineSubtotal * (Number(line.taxRate) || 0);
        await apiRequest("POST", `/api/finance/bills/${bill.id}/lines`, {
          ...line,
          subtotal: lineSubtotal.toFixed(2),
          taxAmount: lineTax.toFixed(2),
          totalAmount: (lineSubtotal + lineTax).toFixed(2),
          sortOrder: i,
        });
      }
      return bill;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/bills"] });
      setCreateOpen(false);
      resetForm();
      toast({ title: "Bill created", description: "Bill saved in draft status." });
    },
    onError: (e: any) => {
      if (e?.error_code === "DUPLICATE_BILL") {
        toast({ title: "Duplicate bill", description: e.message, variant: "destructive" });
      } else {
        toast({ title: "Error creating bill", description: e.message, variant: "destructive" });
      }
    },
  });

  const lifecycleMutation = useMutation({
    mutationFn: async ({ id, action, body }: { id: string; action: string; body?: any }) => {
      return apiRequest("POST", `/api/finance/bills/${id}/${action}`, body || {});
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/bills", vars.id, "with-lines"] });
      if (selectedBill?.id === vars.id) {
        setSelectedBill(prev => prev ? { ...prev, status: getNextStatus(prev.status, vars.action) } : prev);
      }
      const labels: Record<string, string> = { code: "coded", approve: "approved", export: "exported", void: "voided" };
      toast({ title: `Bill ${labels[vars.action] || vars.action}`, description: "Status updated successfully." });
      setVoidDialogOpen(false);
      setVoidReason("");
    },
    onError: (e: any) => {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    },
  });

  function getNextStatus(current: BillStatus, action: string): BillStatus {
    const map: Record<string, BillStatus> = { code: "coded", approve: "approved", export: "exported", void: "voided" };
    return map[action] || current;
  }

  function resetForm() {
    setForm({ vendorId: "", invoiceNumber: "", billDate: new Date().toISOString().split("T")[0], dueDate: "", paymentTerms: "net_30", currency: "USD", memo: "", internalNotes: "", referenceNumber: "" });
    setLines([emptyLine()]);
  }

  const filtered = bills.filter(b => {
    const matchStatus = statusFilter === "all" || b.status === statusFilter;
    const vendorName = vendors.find(v => v.id === b.vendorId)?.name || "";
    const matchSearch = !search || b.billNumber?.toLowerCase().includes(search.toLowerCase()) ||
      b.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
      vendorName.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const totals = {
    draft: bills.filter(b => b.status === "draft").length,
    coded: bills.filter(b => b.status === "coded").length,
    approved: bills.filter(b => b.status === "approved").length,
    total: bills.reduce((s, b) => s + Number(b.totalAmount), 0),
    outstanding: bills.filter(b => !["paid", "voided"].includes(b.status)).reduce((s, b) => s + Number(b.balanceDue), 0),
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bills (AP)</h1>
          <p className="text-sm text-muted-foreground">Shadow AP layer — Bill.com bridge ready</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-create-bill">
          <Plus className="w-4 h-4" />
          New Bill
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Draft</CardTitle>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <div className="text-2xl font-bold">{totals.draft}</div>
            <p className="text-xs text-muted-foreground">Awaiting coding</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Coded</CardTitle>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <div className="text-2xl font-bold">{totals.coded}</div>
            <p className="text-xs text-muted-foreground">Awaiting approval</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Approved</CardTitle>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <div className="text-2xl font-bold">{totals.approved}</div>
            <p className="text-xs text-muted-foreground">Ready for export</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Outstanding</CardTitle>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <div className="text-2xl font-bold">{formatCurrency(totals.outstanding)}</div>
            <p className="text-xs text-muted-foreground">Balance due</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search bills, vendors, invoice#..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-bill-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="select-bill-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="coded">Coded</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="exported">Exported</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="voided">Voided</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bills Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading bills...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="font-medium">No bills found</p>
              <p className="text-sm">Create your first bill to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Bill #</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Vendor</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Invoice #</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Bill Date</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Due Date</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Balance</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(bill => {
                    const vendor = vendors.find(v => v.id === bill.vendorId);
                    const isOverdue = !["paid", "voided"].includes(bill.status) && bill.dueDate && parseDateSafe(bill.dueDate) < new Date();
                    return (
                      <tr key={bill.id} className="border-b last:border-0 hover-elevate" data-testid={`row-bill-${bill.id}`}>
                        <td className="px-4 py-3">
                          <button
                            className="font-mono text-xs text-primary hover:underline"
                            onClick={() => setSelectedBill(bill)}
                            data-testid={`link-bill-${bill.id}`}
                          >
                            {bill.billNumber || bill.id.slice(0, 8)}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span>{vendor?.name || "—"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{bill.invoiceNumber || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{bill.billDate ? formatDate(bill.billDate) : "—"}</td>
                        <td className={`px-4 py-3 ${isOverdue ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}>
                          {bill.dueDate ? formatDate(bill.dueDate) : "—"}
                          {isOverdue && <span className="ml-1 text-xs">(Overdue)</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{formatCurrency(bill.totalAmount, bill.currency)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(bill.balanceDue, bill.currency)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={bill.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {bill.status === "draft" && (
                              <Button size="sm" variant="outline"
                                onClick={() => lifecycleMutation.mutate({ id: bill.id, action: "code" })}
                                disabled={lifecycleMutation.isPending}
                                data-testid={`button-code-bill-${bill.id}`}
                              >
                                Code
                              </Button>
                            )}
                            {["draft", "coded"].includes(bill.status) && (
                              <Button size="sm" variant="outline"
                                onClick={() => lifecycleMutation.mutate({ id: bill.id, action: "approve" })}
                                disabled={lifecycleMutation.isPending}
                                data-testid={`button-approve-bill-${bill.id}`}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Approve
                              </Button>
                            )}
                            {bill.status === "approved" && (
                              <Button size="sm" variant="outline"
                                onClick={() => lifecycleMutation.mutate({ id: bill.id, action: "export" })}
                                disabled={lifecycleMutation.isPending}
                                data-testid={`button-export-bill-${bill.id}`}
                              >
                                <ArrowUpRight className="w-3.5 h-3.5" />
                                Export
                              </Button>
                            )}
                            {!["paid", "voided"].includes(bill.status) && (
                              <Button size="sm" variant="ghost"
                                onClick={() => { setSelectedBill(bill); setVoidDialogOpen(true); }}
                                data-testid={`button-void-bill-${bill.id}`}
                              >
                                <Ban className="w-3.5 h-3.5 text-muted-foreground" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Bill Sheet */}
      <Sheet open={createOpen} onOpenChange={o => { setCreateOpen(o); if (!o) resetForm(); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New Bill</SheetTitle>
          </SheetHeader>
          <div className="space-y-5 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Vendor <span className="text-red-500">*</span></Label>
                <Select value={form.vendorId} onValueChange={v => setForm(f => ({ ...f, vendorId: v }))}>
                  <SelectTrigger data-testid="select-bill-vendor">
                    <SelectValue placeholder="Select vendor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Vendor Invoice # <span className="text-xs text-muted-foreground">(for duplicate detection)</span></Label>
                <Input value={form.invoiceNumber} onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} placeholder="INV-12345" data-testid="input-bill-invoice-number" />
              </div>
              <div>
                <Label>Reference #</Label>
                <Input value={form.referenceNumber} onChange={e => setForm(f => ({ ...f, referenceNumber: e.target.value }))} placeholder="PO-001" data-testid="input-bill-reference" />
              </div>
              <div>
                <Label>Bill Date <span className="text-red-500">*</span></Label>
                <Input type="date" value={form.billDate} onChange={e => setForm(f => ({ ...f, billDate: e.target.value }))} data-testid="input-bill-date" />
              </div>
              <div>
                <Label>Payment Terms</Label>
                <Select value={form.paymentTerms} onValueChange={v => setForm(f => ({ ...f, paymentTerms: v }))}>
                  <SelectTrigger data-testid="select-bill-terms">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TERMS.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Due Date <span className="text-xs text-muted-foreground">(auto-calculated)</span></Label>
                <Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} data-testid="input-bill-due-date" />
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger data-testid="select-bill-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="CAD">CAD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Bill Lines */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">Line Items</h3>
                <Button size="sm" variant="outline" onClick={() => setLines(l => [...l, emptyLine()])} data-testid="button-add-bill-line">
                  <PlusCircle className="w-3.5 h-3.5" />
                  Add Line
                </Button>
              </div>
              <div className="space-y-4">
                {lines.map((line, idx) => (
                  <div key={idx} className="border rounded-md p-3 space-y-3 bg-muted/20" data-testid={`bill-line-${idx}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground uppercase">Line {idx + 1}</span>
                      {lines.length > 1 && (
                        <Button size="icon" variant="ghost" onClick={() => setLines(l => l.filter((_, i) => i !== idx))} data-testid={`button-remove-line-${idx}`}>
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs">Description <span className="text-red-500">*</span></Label>
                      <Input
                        value={line.description}
                        onChange={e => setLines(l => l.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))}
                        placeholder="Service or expense description"
                        data-testid={`input-line-description-${idx}`}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">Qty</Label>
                        <Input
                          type="number"
                          value={line.quantity}
                          onChange={e => setLines(l => l.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))}
                          data-testid={`input-line-qty-${idx}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Unit Price</Label>
                        <Input
                          type="number"
                          value={line.unitPrice}
                          onChange={e => setLines(l => l.map((x, i) => i === idx ? { ...x, unitPrice: e.target.value } : x))}
                          placeholder="0.00"
                          data-testid={`input-line-price-${idx}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Line Total</Label>
                        <div className="h-9 flex items-center px-3 bg-muted/50 rounded-md text-sm font-medium">
                          {formatCurrency((Number(line.quantity) * Number(line.unitPrice)) || 0, form.currency)}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">Expense Account</Label>
                        <Input
                          value={line.expenseAccountCode}
                          onChange={e => setLines(l => l.map((x, i) => i === idx ? { ...x, expenseAccountCode: e.target.value } : x))}
                          placeholder="6000"
                          data-testid={`input-line-account-${idx}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Tax Code</Label>
                        <Input
                          value={line.taxCode}
                          onChange={e => setLines(l => l.map((x, i) => i === idx ? { ...x, taxCode: e.target.value } : x))}
                          placeholder="TAX"
                          data-testid={`input-line-taxcode-${idx}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Class Code</Label>
                        <Input
                          value={line.classCode}
                          onChange={e => setLines(l => l.map((x, i) => i === idx ? { ...x, classCode: e.target.value } : x))}
                          placeholder="CLASS1"
                          data-testid={`input-line-classcode-${idx}`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Line Totals */}
              <div className="mt-4 border rounded-md p-3 space-y-1 bg-muted/10">
                {(() => {
                  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) * Number(l.unitPrice) || 0), 0);
                  const tax = lines.reduce((s, l) => s + (Number(l.quantity) * Number(l.unitPrice) * (Number(l.taxRate) || 0)), 0);
                  return (
                    <>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Subtotal</span><span>{formatCurrency(subtotal, form.currency)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Tax</span><span>{formatCurrency(tax, form.currency)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between text-sm font-semibold">
                        <span>Total</span><span>{formatCurrency(subtotal + tax, form.currency)}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div>
                <Label>Memo</Label>
                <Textarea value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} placeholder="Notes visible on the bill..." rows={2} data-testid="textarea-bill-memo" />
              </div>
              <div>
                <Label>Internal Notes</Label>
                <Textarea value={form.internalNotes} onChange={e => setForm(f => ({ ...f, internalNotes: e.target.value }))} placeholder="Internal notes (not shared with vendor)..." rows={2} data-testid="textarea-bill-notes" />
              </div>
            </div>
          </div>
          <SheetFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !form.vendorId || !form.billDate || lines.some(l => !l.description || !l.unitPrice)}
              data-testid="button-submit-bill"
            >
              {createMutation.isPending ? "Saving..." : "Create Bill"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Bill Detail Sheet */}
      <Sheet open={!!selectedBill && !voidDialogOpen} onOpenChange={o => { if (!o) setSelectedBill(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          {selectedBill && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  {selectedBill.billNumber || selectedBill.id.slice(0, 8)}
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-5 py-4">
                <div className="flex items-center gap-2">
                  <StatusBadge status={(detailBill || selectedBill).status} />
                  {detailBill?.approvedAt && (
                    <span className="text-xs text-muted-foreground">Approved {format(new Date(detailBill.approvedAt), "MM/dd/yyyy")}</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Vendor</p>
                    <p className="font-medium">{vendors.find(v => v.id === selectedBill.vendorId)?.name || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Invoice #</p>
                    <p className="font-mono">{selectedBill.invoiceNumber || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Bill Date</p>
                    <p>{selectedBill.billDate ? formatDate(selectedBill.billDate) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Due Date</p>
                    <p>{selectedBill.dueDate ? formatDate(selectedBill.dueDate) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="font-semibold">{formatCurrency(selectedBill.totalAmount, selectedBill.currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Balance Due</p>
                    <p className="font-semibold">{formatCurrency(selectedBill.balanceDue, selectedBill.currency)}</p>
                  </div>
                  {selectedBill.paymentTerms && (
                    <div>
                      <p className="text-xs text-muted-foreground">Terms</p>
                      <p>{PAYMENT_TERMS.find(t => t.value === selectedBill.paymentTerms)?.label || selectedBill.paymentTerms}</p>
                    </div>
                  )}
                  {selectedBill.memo && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Memo</p>
                      <p className="text-sm">{selectedBill.memo}</p>
                    </div>
                  )}
                </div>

                {/* Line Items */}
                {detailBill?.lines && detailBill.lines.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium mb-2">Line Items</h4>
                      <div className="space-y-2">
                        {detailBill.lines.map((line, idx) => (
                          <div key={idx} className="flex justify-between items-start text-sm gap-3 p-2 rounded bg-muted/20" data-testid={`detail-line-${idx}`}>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{line.description}</p>
                              <p className="text-xs text-muted-foreground">
                                {line.quantity} × {formatCurrency(line.unitPrice, selectedBill.currency)}
                                {line.expenseAccountCode && ` · Acct: ${line.expenseAccountCode}`}
                                {line.classCode && ` · Class: ${line.classCode}`}
                              </p>
                            </div>
                            <p className="font-medium shrink-0">{formatCurrency((Number(line.quantity) * Number(line.unitPrice)) || 0, selectedBill.currency)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Lifecycle trail */}
                {(selectedBill.codedAt || selectedBill.approvedAt || selectedBill.exportedAt || selectedBill.voidedAt) && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium mb-2">Lifecycle</h4>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {selectedBill.codedAt && <div>Coded: {format(new Date(selectedBill.codedAt), "MM/dd/yyyy h:mm a")}</div>}
                        {selectedBill.approvedAt && <div>Approved: {format(new Date(selectedBill.approvedAt), "MM/dd/yyyy h:mm a")}</div>}
                        {selectedBill.exportedAt && <div>Exported: {format(new Date(selectedBill.exportedAt), "MM/dd/yyyy h:mm a")}</div>}
                        {selectedBill.voidedAt && <div className="text-red-600">Voided: {format(new Date(selectedBill.voidedAt), "MM/dd/yyyy h:mm a")}{selectedBill.voidReason ? ` — ${selectedBill.voidReason}` : ""}</div>}
                      </div>
                    </div>
                  </>
                )}

                {/* Actions */}
                <Separator />
                <div className="flex flex-wrap gap-2">
                  {(detailBill || selectedBill).status === "draft" && (
                    <Button variant="outline" size="sm"
                      onClick={() => { lifecycleMutation.mutate({ id: selectedBill.id, action: "code" }); setSelectedBill(b => b ? { ...b, status: "coded" } : b); }}
                      disabled={lifecycleMutation.isPending}
                      data-testid="button-detail-code"
                    >
                      <FileCheck className="w-4 h-4" /> Code Bill
                    </Button>
                  )}
                  {["draft", "coded"].includes((detailBill || selectedBill).status) && (
                    <Button variant="outline" size="sm"
                      onClick={() => { lifecycleMutation.mutate({ id: selectedBill.id, action: "approve" }); setSelectedBill(b => b ? { ...b, status: "approved" } : b); }}
                      disabled={lifecycleMutation.isPending}
                      data-testid="button-detail-approve"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Approve
                    </Button>
                  )}
                  {(detailBill || selectedBill).status === "approved" && (
                    <Button variant="outline" size="sm"
                      onClick={() => { lifecycleMutation.mutate({ id: selectedBill.id, action: "export" }); setSelectedBill(b => b ? { ...b, status: "exported" } : b); }}
                      disabled={lifecycleMutation.isPending}
                      data-testid="button-detail-export"
                    >
                      <ArrowUpRight className="w-4 h-4" /> Export to Bill.com
                    </Button>
                  )}
                  {!["paid", "voided"].includes((detailBill || selectedBill).status) && (
                    <Button variant="ghost" size="sm" className="text-red-600 dark:text-red-400"
                      onClick={() => setVoidDialogOpen(true)}
                      data-testid="button-detail-void"
                    >
                      <Ban className="w-4 h-4" /> Void
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Void Dialog */}
      <Dialog open={voidDialogOpen} onOpenChange={o => { setVoidDialogOpen(o); if (!o) setVoidReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Void Bill
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">This will permanently void the bill. This action cannot be undone.</p>
            <div>
              <Label>Reason (optional)</Label>
              <Textarea
                value={voidReason}
                onChange={e => setVoidReason(e.target.value)}
                placeholder="Reason for voiding..."
                rows={3}
                data-testid="textarea-void-reason"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setVoidDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedBill) {
                  lifecycleMutation.mutate({ id: selectedBill.id, action: "void", body: { reason: voidReason } });
                }
              }}
              disabled={lifecycleMutation.isPending}
              data-testid="button-confirm-void"
            >
              Void Bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
