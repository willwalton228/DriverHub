import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, DollarSign, Calendar, Clock, CheckCircle, XCircle, AlertTriangle, TrendingUp, Eye, Pencil } from "lucide-react";
import type { Customer, Invoice } from "@shared/schema";

function formatCurrency(val: string | number | null | undefined): string {
  const num = parseFloat(String(val || "0"));
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface LinkedInvoice {
  invoiceId: string;
  allocatedAmount: string | null;
  invoiceNumber: string;
  totalAmount: string;
  balanceDue: string;
}

interface CommitmentRecord {
  id: string;
  customerId: string;
  customerName: string;
  promisedAmount: string;
  promisedDate: string;
  commitmentNotes: string | null;
  committedBy: string;
  committedByName: string;
  status: string;
  committedOnTime: boolean | null;
  daysLateVsCommitment: number | null;
  actualAmountReceived: string | null;
  actualPaymentDate: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  linkedInvoices: LinkedInvoice[];
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pending", variant: "secondary" },
  kept: { label: "Kept", variant: "default" },
  missed: { label: "Missed", variant: "destructive" },
  partial: { label: "Partial", variant: "outline" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

export function PaymentCommitmentsTab() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedCommitment, setSelectedCommitment] = useState<CommitmentRecord | null>(null);
  const [filterCustomer, setFilterCustomer] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const [formCustomerId, setFormCustomerId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formInvoiceIds, setFormInvoiceIds] = useState<string[]>([]);

  const [resolveStatus, setResolveStatus] = useState<string>("kept");
  const [resolveActualAmount, setResolveActualAmount] = useState("");
  const [resolveActualDate, setResolveActualDate] = useState("");

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (filterCustomer && filterCustomer !== "all") params.set("customerId", filterCustomer);
    if (filterStatus && filterStatus !== "all") params.set("status", filterStatus);
    return params.toString();
  };

  const { data: commitments = [], isLoading: commitmentsLoading } = useQuery<CommitmentRecord[]>({
    queryKey: ['/api/corporate/invoicing/commitments', filterCustomer, filterStatus],
    queryFn: async () => {
      const qs = buildQueryParams();
      const res = await fetch(`/api/corporate/invoicing/commitments${qs ? `?${qs}` : ''}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch commitments');
      return res.json();
    },
  });

  const { data: missedAlerts = [] } = useQuery<CommitmentRecord[]>({
    queryKey: ['/api/corporate/invoicing/commitments/alerts/missed'],
    queryFn: async () => {
      const res = await fetch('/api/corporate/invoicing/commitments/alerts/missed', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch alerts');
      return res.json();
    },
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['/api/corporate/customers'],
  });

  const { data: invoicesData = [] } = useQuery<Invoice[]>({
    queryKey: ['/api/corporate/invoicing/invoices', formCustomerId],
    queryFn: async () => {
      if (!formCustomerId) return [];
      const res = await fetch(`/api/corporate/invoicing/invoices?customerId=${formCustomerId}&status=sent,overdue,partially_paid`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!formCustomerId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/corporate/invoicing/commitments', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/commitments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/commitments/alerts/missed'] });
      setCreateOpen(false);
      resetCreateForm();
      toast({ title: "Commitment recorded", description: "Payment commitment has been created." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create commitment.", variant: "destructive" });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest('PATCH', `/api/corporate/invoicing/commitments/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/commitments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/commitments/alerts/missed'] });
      setResolveOpen(false);
      setSelectedCommitment(null);
      toast({ title: "Commitment updated", description: "Commitment status has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update commitment.", variant: "destructive" });
    },
  });

  const resetCreateForm = () => {
    setFormCustomerId("");
    setFormAmount("");
    setFormDate("");
    setFormNotes("");
    setFormInvoiceIds([]);
  };

  const handleCreate = () => {
    if (!formCustomerId || !formAmount || !formDate) return;
    createMutation.mutate({
      customerId: formCustomerId,
      promisedAmount: formAmount,
      promisedDate: formDate,
      commitmentNotes: formNotes || undefined,
      invoiceIds: formInvoiceIds.length > 0 ? formInvoiceIds : undefined,
    });
  };

  const handleResolve = () => {
    if (!selectedCommitment) return;
    resolveMutation.mutate({
      id: selectedCommitment.id,
      data: {
        status: resolveStatus,
        actualAmountReceived: resolveActualAmount || undefined,
        actualPaymentDate: resolveActualDate || undefined,
      },
    });
  };

  const openResolveDialog = (commitment: CommitmentRecord) => {
    setSelectedCommitment(commitment);
    setResolveStatus("kept");
    setResolveActualAmount(commitment.promisedAmount);
    setResolveActualDate(new Date().toISOString().split('T')[0]);
    setResolveOpen(true);
  };

  const totalCommitments = commitments.length;
  const pendingCount = commitments.filter(c => c.status === 'pending').length;
  const keptCount = commitments.filter(c => c.status === 'kept').length;
  const missedCount = commitments.filter(c => c.status === 'missed').length;
  const totalPromised = commitments.reduce((sum, c) => sum + parseFloat(c.promisedAmount || '0'), 0);
  const resolved = commitments.filter(c => ['kept', 'missed', 'partial'].includes(c.status));
  const onTimeRate = resolved.length > 0
    ? Math.round((resolved.filter(c => c.committedOnTime).length / resolved.length) * 100)
    : null;

  return (
    <div className="space-y-4" data-testid="commitments-tab">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold" data-testid="text-commitments-heading">Payment Commitment Tracking</h2>
          <p className="text-sm text-muted-foreground">
            Track customer payment promises, monitor SLA adherence, and flag missed commitments.
          </p>
        </div>
        <Button onClick={() => { resetCreateForm(); setCreateOpen(true); }} data-testid="button-create-commitment">
          <Plus className="w-4 h-4 mr-2" />
          Record Commitment
        </Button>
      </div>

      {missedAlerts.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Missed Commitment Alerts ({missedAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {missedAlerts.slice(0, 5).map(alert => (
                <div key={alert.id} className="flex items-center justify-between gap-4 flex-wrap text-sm p-2 rounded bg-destructive/10" data-testid={`alert-missed-${alert.id}`}>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-destructive" />
                    <span className="font-medium">{alert.customerName}</span>
                    <span className="text-muted-foreground">promised {formatCurrency(alert.promisedAmount)} by {formatDate(alert.promisedDate)}</span>
                    <Badge variant="destructive" className="text-xs">
                      {(alert as any).daysOverdue || 0}d overdue
                    </Badge>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openResolveDialog(alert)} data-testid={`button-resolve-alert-${alert.id}`}>
                    <Pencil className="w-3 h-3 mr-1" /> Resolve
                  </Button>
                </div>
              ))}
              {missedAlerts.length > 5 && (
                <p className="text-xs text-muted-foreground">+ {missedAlerts.length - 5} more missed commitments</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold" data-testid="text-total-commitments">{totalCommitments}</div>
            <div className="text-xs text-muted-foreground">Total Commitments</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-yellow-600" data-testid="text-pending-count">{pendingCount}</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-green-600" data-testid="text-kept-count">{keptCount}</div>
            <div className="text-xs text-muted-foreground">Kept</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-red-600" data-testid="text-missed-count">{missedCount}</div>
            <div className="text-xs text-muted-foreground">Missed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold" data-testid="text-ontime-rate">
              {onTimeRate !== null ? `${onTimeRate}%` : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground">On-Time Rate</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={filterCustomer} onValueChange={setFilterCustomer}>
          <SelectTrigger className="w-[200px]" data-testid="select-filter-customer">
            <SelectValue placeholder="All Customers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Customers</SelectItem>
            {customers.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>{c.customerName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px]" data-testid="select-filter-status">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="kept">Kept</SelectItem>
            <SelectItem value="missed">Missed</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground ml-auto">
          Total Promised: {formatCurrency(totalPromised)}
        </div>
      </div>

      {commitmentsLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : commitments.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <DollarSign className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground" data-testid="text-no-commitments">No payment commitments found.</p>
            <p className="text-xs text-muted-foreground mt-1">Record a new commitment to track payment promises.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Promised Amount</TableHead>
                <TableHead>Promised Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead>Invoices</TableHead>
                <TableHead>Recorded By</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commitments.map((c) => {
                const isOverdue = c.status === 'pending' && new Date(c.promisedDate) < new Date();
                return (
                  <TableRow key={c.id} data-testid={`row-commitment-${c.id}`}>
                    <TableCell className="font-medium" data-testid={`text-customer-${c.id}`}>{c.customerName}</TableCell>
                    <TableCell data-testid={`text-amount-${c.id}`}>{formatCurrency(c.promisedAmount)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {formatDate(c.promisedDate)}
                        {isOverdue && <AlertTriangle className="w-4 h-4 text-destructive" />}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_CONFIG[c.status]?.variant || "secondary"} data-testid={`badge-status-${c.id}`}>
                        {STATUS_CONFIG[c.status]?.label || c.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {c.committedOnTime === true && (
                        <div className="flex items-center gap-1 text-green-600 text-sm">
                          <CheckCircle className="w-3 h-3" /> On time
                        </div>
                      )}
                      {c.committedOnTime === false && (
                        <div className="flex items-center gap-1 text-red-600 text-sm">
                          <XCircle className="w-3 h-3" /> {c.daysLateVsCommitment}d late
                        </div>
                      )}
                      {c.committedOnTime === null && c.status === 'pending' && (
                        <span className="text-xs text-muted-foreground">Awaiting</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.linkedInvoices.length > 0 ? (
                        <div className="text-xs space-y-0.5">
                          {c.linkedInvoices.map(inv => (
                            <div key={inv.invoiceId}>{inv.invoiceNumber}</div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No linked invoices</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.committedByName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" onClick={() => { setSelectedCommitment(c); setDetailOpen(true); }} data-testid={`button-view-${c.id}`}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        {c.status === 'pending' && (
                          <Button size="icon" variant="ghost" onClick={() => openResolveDialog(c)} data-testid={`button-resolve-${c.id}`}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Payment Commitment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select value={formCustomerId} onValueChange={(v) => { setFormCustomerId(v); setFormInvoiceIds([]); }}>
                <SelectTrigger data-testid="select-commitment-customer">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">No customers found</div>
                  )}
                  {customers.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.customerName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Promised Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-promised-amount"
                />
              </div>
              <div className="space-y-2">
                <Label>Promised Date</Label>
                <Input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  data-testid="input-promised-date"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Details about the payment promise..."
                data-testid="input-commitment-notes"
              />
            </div>
            {formCustomerId && invoicesData.length > 0 && (
              <div className="space-y-2">
                <Label>Link to Invoice(s)</Label>
                <div className="max-h-32 overflow-y-auto border rounded p-2 space-y-1">
                  {invoicesData.map((inv: any) => (
                    <div key={inv.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={formInvoiceIds.includes(inv.id)}
                        onCheckedChange={(checked) => {
                          setFormInvoiceIds(prev =>
                            checked ? [...prev, inv.id] : prev.filter(id => id !== inv.id)
                          );
                        }}
                        data-testid={`checkbox-invoice-${inv.id}`}
                      />
                      <span>{inv.invoiceNumber}</span>
                      <span className="text-muted-foreground">({formatCurrency(inv.balanceDue)} due)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} data-testid="button-cancel-create">Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!formCustomerId || !formAmount || !formDate || createMutation.isPending}
              data-testid="button-confirm-create"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Record Commitment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve Commitment</DialogTitle>
          </DialogHeader>
          {selectedCommitment && (
            <div className="space-y-4">
              <div className="text-sm space-y-1">
                <p><span className="text-muted-foreground">Customer:</span> {selectedCommitment.customerName}</p>
                <p><span className="text-muted-foreground">Promised:</span> {formatCurrency(selectedCommitment.promisedAmount)} by {formatDate(selectedCommitment.promisedDate)}</p>
              </div>
              <div className="space-y-2">
                <Label>Outcome</Label>
                <Select value={resolveStatus} onValueChange={setResolveStatus}>
                  <SelectTrigger data-testid="select-resolve-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kept">Kept - Full payment received</SelectItem>
                    <SelectItem value="partial">Partial - Partial payment received</SelectItem>
                    <SelectItem value="missed">Missed - No payment received</SelectItem>
                    <SelectItem value="cancelled">Cancelled - Commitment voided</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(resolveStatus === 'kept' || resolveStatus === 'partial') && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Actual Amount</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={resolveActualAmount}
                      onChange={(e) => setResolveActualAmount(e.target.value)}
                      data-testid="input-actual-amount"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Payment Date</Label>
                    <Input
                      type="date"
                      value={resolveActualDate}
                      onChange={(e) => setResolveActualDate(e.target.value)}
                      data-testid="input-actual-date"
                    />
                  </div>
                </div>
              )}
              <div className="p-3 rounded bg-muted text-xs text-muted-foreground">
                <TrendingUp className="w-4 h-4 inline mr-1" />
                SLA metrics (on-time, days late) will be calculated automatically based on the promised date and actual payment date.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)} data-testid="button-cancel-resolve">Cancel</Button>
            <Button
              onClick={handleResolve}
              disabled={resolveMutation.isPending}
              data-testid="button-confirm-resolve"
            >
              {resolveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Commitment Details</DialogTitle>
          </DialogHeader>
          {selectedCommitment && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Customer</div>
                  <div className="font-medium">{selectedCommitment.customerName}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Status</div>
                  <Badge variant={STATUS_CONFIG[selectedCommitment.status]?.variant || "secondary"}>
                    {STATUS_CONFIG[selectedCommitment.status]?.label || selectedCommitment.status}
                  </Badge>
                </div>
                <div>
                  <div className="text-muted-foreground">Promised Amount</div>
                  <div className="font-medium">{formatCurrency(selectedCommitment.promisedAmount)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Promised Date</div>
                  <div className="font-medium">{formatDate(selectedCommitment.promisedDate)}</div>
                </div>
                {selectedCommitment.actualAmountReceived && (
                  <div>
                    <div className="text-muted-foreground">Actual Amount</div>
                    <div className="font-medium">{formatCurrency(selectedCommitment.actualAmountReceived)}</div>
                  </div>
                )}
                {selectedCommitment.actualPaymentDate && (
                  <div>
                    <div className="text-muted-foreground">Actual Payment Date</div>
                    <div className="font-medium">{formatDate(selectedCommitment.actualPaymentDate)}</div>
                  </div>
                )}
                <div>
                  <div className="text-muted-foreground">Recorded By</div>
                  <div className="font-medium">{selectedCommitment.committedByName}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Created</div>
                  <div className="font-medium">{formatDate(selectedCommitment.createdAt)}</div>
                </div>
              </div>
              {selectedCommitment.committedOnTime !== null && (
                <div className="p-3 rounded bg-muted text-sm">
                  <div className="font-medium mb-1">SLA Performance</div>
                  <div className="flex items-center gap-2">
                    {selectedCommitment.committedOnTime ? (
                      <><CheckCircle className="w-4 h-4 text-green-600" /> Payment received on time</>
                    ) : (
                      <><XCircle className="w-4 h-4 text-red-600" /> Payment was {selectedCommitment.daysLateVsCommitment} day(s) late</>
                    )}
                  </div>
                </div>
              )}
              {selectedCommitment.commitmentNotes && (
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Notes</div>
                  <p className="text-sm">{selectedCommitment.commitmentNotes}</p>
                </div>
              )}
              {selectedCommitment.linkedInvoices.length > 0 && (
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Linked Invoices</div>
                  <div className="space-y-1">
                    {selectedCommitment.linkedInvoices.map(inv => (
                      <div key={inv.invoiceId} className="flex items-center justify-between gap-4 flex-wrap text-sm p-2 rounded bg-muted">
                        <span>{inv.invoiceNumber}</span>
                        <span className="text-muted-foreground">Balance: {formatCurrency(inv.balanceDue)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)} data-testid="button-close-detail">Close</Button>
            {selectedCommitment?.status === 'pending' && (
              <Button onClick={() => { setDetailOpen(false); openResolveDialog(selectedCommitment!); }} data-testid="button-resolve-from-detail">
                Resolve
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}