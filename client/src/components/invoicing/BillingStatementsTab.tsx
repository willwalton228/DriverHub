import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Plus, Download, Mail, FileText, Calendar, DollarSign, Clock,
  Eye, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, XCircle, Info
} from "lucide-react";
import type { Customer, CustomerStatement } from "@shared/schema";

function formatCurrency(val: string | number | null | undefined): string {
  const num = parseFloat(String(val || "0"));
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface TransactionDetail {
  type: string;
  date: string;
  reference: string;
  description: string;
  debit: string;
  credit: string;
  runningBalance: string;
}

// Compute aging total from statement fields
function computeAgingTotal(stmt: CustomerStatement): number {
  return (
    parseFloat(String(stmt.agingCurrent || "0")) +
    parseFloat(String(stmt.aging1to30 || "0")) +
    parseFloat(String(stmt.aging31to60 || "0")) +
    parseFloat(String(stmt.aging61to90 || "0")) +
    parseFloat(String(stmt.agingOver90 || "0"))
  );
}

// Compute variance between closing balance and aging total
function computeARVariance(stmt: CustomerStatement): { variance: number; reconciled: boolean } {
  const closing = parseFloat(String(stmt.closingBalance || "0"));
  const aging = computeAgingTotal(stmt);
  const variance = Math.abs(closing - aging);
  return { variance, reconciled: variance < 1.00 };
}

function ARReconciliationBadge({ stmt }: { stmt: CustomerStatement }) {
  const { variance, reconciled } = computeARVariance(stmt);
  if (reconciled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="text-green-700 dark:text-green-400 border-green-300 dark:border-green-700 gap-1" data-testid={`badge-ar-reconciled-${stmt.id}`}>
            <CheckCircle2 className="h-3 w-3" />
            A/R OK
          </Badge>
        </TooltipTrigger>
        <TooltipContent>Closing balance matches open invoice aging total (within $1.00)</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="text-red-700 dark:text-red-400 border-red-300 dark:border-red-700 gap-1" data-testid={`badge-ar-variance-${stmt.id}`}>
          <XCircle className="h-3 w-3" />
          Δ {formatCurrency(variance)}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        A/R variance: closing balance ({formatCurrency(stmt.closingBalance)}) differs from aging total ({formatCurrency(computeAgingTotal(stmt))}) by {formatCurrency(variance)}
      </TooltipContent>
    </Tooltip>
  );
}

export function BillingStatementsTab() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [selectedStatement, setSelectedStatement] = useState<CustomerStatement | null>(null);
  const [filterCustomer, setFilterCustomer] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [formCustomerId, setFormCustomerId] = useState("");
  const [formType, setFormType] = useState<"monthly" | "custom">("monthly");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['/api/corporate/customers'],
  });

  const statementsUrl = (() => {
    const params = new URLSearchParams();
    if (filterCustomer !== "all") params.set("customerId", filterCustomer);
    if (filterType !== "all") params.set("statementType", filterType);
    const qs = params.toString();
    return `/api/corporate/invoicing/statements${qs ? `?${qs}` : ''}`;
  })();

  const { data: statements = [], isLoading } = useQuery<CustomerStatement[]>({
    queryKey: ['/api/corporate/invoicing/statements', filterCustomer, filterType],
    queryFn: async () => {
      const res = await fetch(statementsUrl, { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch statements");
      return res.json();
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (data: { customerId: string; periodStartDate: string; periodEndDate: string; statementType: string }) => {
      const res = await apiRequest("POST", "/api/corporate/invoicing/statements", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/statements'] });
      if (data?.warning) {
        toast({ title: "Statement generated with warning", description: data.warning, variant: "destructive" });
      } else {
        toast({ title: "Statement generated", description: `Statement ${data.statementNumber} created successfully.` });
      }
      setCreateOpen(false);
      setPreviewData(null);
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to generate statement", variant: "destructive" });
    },
  });

  const emailMutation = useMutation({
    mutationFn: async ({ id, emails }: { id: string; emails: string[] }) => {
      const res = await apiRequest("POST", `/api/corporate/invoicing/statements/${id}/email`, { emails });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/statements'] });
      toast({ title: "Statement sent", description: "Statement has been queued for email delivery." });
      setEmailOpen(false);
      setEmailTo("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to send statement", variant: "destructive" });
    },
  });

  function resetForm() {
    setFormCustomerId("");
    setFormType("monthly");
    setFormStartDate("");
    setFormEndDate("");
    setPreviewData(null);
  }

  function handleCreateMonthlyDefaults() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
    setFormStartDate(firstDay.toISOString().split('T')[0]);
    setFormEndDate(lastDay.toISOString().split('T')[0]);
    setFormType("monthly");
  }

  async function handlePreview() {
    if (!formCustomerId || !formStartDate || !formEndDate) {
      toast({ title: "Missing fields", description: "Select a customer and date range first.", variant: "destructive" });
      return;
    }
    setPreviewLoading(true);
    setPreviewData(null);
    try {
      const res = await apiRequest("POST", "/api/corporate/invoicing/statements/preview", {
        customerId: formCustomerId,
        periodStartDate: formStartDate,
        periodEndDate: formEndDate,
        statementType: formType,
      });
      const data = await res.json();
      setPreviewData(data);
    } catch (err: any) {
      toast({ title: "Preview failed", description: err.message || "Could not compute preview", variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  }

  function handleGenerate() {
    if (!formCustomerId || !formStartDate || !formEndDate) {
      toast({ title: "Missing fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    generateMutation.mutate({
      customerId: formCustomerId,
      periodStartDate: formStartDate,
      periodEndDate: formEndDate,
      statementType: formType,
    });
  }

  function handleDownloadPDF(id: string) {
    window.open(`/api/corporate/invoicing/statements/${id}/pdf`, '_blank');
  }

  function handleSendEmail() {
    if (!selectedStatement || !emailTo.trim()) return;
    const emails = emailTo.split(',').map(e => e.trim()).filter(Boolean);
    emailMutation.mutate({ id: selectedStatement.id, emails });
  }

  const totalStatements = statements.length;
  const monthlyCount = statements.filter(s => s.statementType === "monthly").length;
  const customCount = statements.filter(s => s.statementType === "custom").length;

  return (
    <div className="space-y-4" data-testid="statements-tab">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-statements-heading">Customer Billing Statements</h3>
          <p className="text-sm text-muted-foreground">
            Immutable point-in-time snapshots. A/R reconciliation validates closing balance against open invoice aging.
          </p>
        </div>
        <Button onClick={() => { resetForm(); handleCreateMonthlyDefaults(); setCreateOpen(true); }} data-testid="button-generate-statement">
          <Plus className="h-4 w-4 mr-2" />
          Generate Statement
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold" data-testid="text-total-statements">{totalStatements}</p>
                <p className="text-xs text-muted-foreground">Total Statements</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold" data-testid="text-monthly-count">{monthlyCount}</p>
                <p className="text-xs text-muted-foreground">Monthly Statements</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold" data-testid="text-custom-count">{customCount}</p>
                <p className="text-xs text-muted-foreground">Custom Statements</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filterCustomer} onValueChange={setFilterCustomer} data-testid="select-filter-customer">
          <SelectTrigger className="w-[200px]" data-testid="trigger-filter-customer">
            <SelectValue placeholder="All Customers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Customers</SelectItem>
            {customers.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.customerName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType} data-testid="select-filter-type">
          <SelectTrigger className="w-[160px]" data-testid="trigger-filter-type">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : statements.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-statements">
              No billing statements found. Generate your first statement to create an immutable snapshot of customer activity.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Statement #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Opening</TableHead>
                <TableHead className="text-right">Closing</TableHead>
                <TableHead>A/R Check</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statements.map((stmt) => {
                const isExpanded = expandedId === stmt.id;
                const transactions = (stmt.transactionDetails || []) as unknown as TransactionDetail[];
                const agingTotal = computeAgingTotal(stmt);
                const { variance, reconciled } = computeARVariance(stmt);
                return (
                  <>
                    <TableRow key={stmt.id} data-testid={`row-statement-${stmt.id}`}>
                      <TableCell className="font-medium" data-testid={`text-stmt-number-${stmt.id}`}>{stmt.statementNumber}</TableCell>
                      <TableCell data-testid={`text-stmt-customer-${stmt.id}`}>{stmt.customerName}</TableCell>
                      <TableCell className="text-xs">{formatDate(stmt.periodStartDate)} – {formatDate(stmt.periodEndDate)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" data-testid={`badge-stmt-type-${stmt.id}`}>
                          {stmt.statementType === "monthly" ? "Monthly" : "Custom"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(stmt.openingBalance)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(stmt.closingBalance)}</TableCell>
                      <TableCell>
                        <ARReconciliationBadge stmt={stmt} />
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" data-testid={`badge-stmt-version-${stmt.id}`}>v{stmt.snapshotVersion || 1}</Badge>
                      </TableCell>
                      <TableCell>
                        {stmt.sentAt ? (
                          <Badge variant="outline" data-testid={`badge-stmt-sent-${stmt.id}`}>Sent</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not sent</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" onClick={() => setExpandedId(isExpanded ? null : stmt.id)} data-testid={`button-expand-${stmt.id}`}>
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => { setSelectedStatement(stmt); setViewOpen(true); }} data-testid={`button-view-${stmt.id}`}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleDownloadPDF(stmt.id)} data-testid={`button-download-${stmt.id}`}>
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => { setSelectedStatement(stmt); setEmailOpen(true); }} data-testid={`button-email-${stmt.id}`}>
                            <Mail className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${stmt.id}-details`}>
                        <TableCell colSpan={10} className="p-0">
                          <div className="p-4 space-y-3 bg-muted/30">
                            {/* Balance summary row */}
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                              <div>
                                <p className="text-xs text-muted-foreground">Invoices Issued</p>
                                <p className="font-medium">{formatCurrency(stmt.totalInvoicesIssued)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Payments Received</p>
                                <p className="font-medium">{formatCurrency(stmt.totalPaymentsReceived)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Credits/Adjustments</p>
                                <p className="font-medium">{formatCurrency(stmt.totalCreditsAdjustments)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Open A/R (Aging)</p>
                                <p className="font-medium">{formatCurrency(agingTotal)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">A/R Variance</p>
                                <p className={`font-medium text-sm ${reconciled ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                                  {reconciled ? "Reconciled" : formatCurrency(variance) + " off"}
                                </p>
                              </div>
                            </div>

                            {/* A/R reconciliation detail */}
                            {!reconciled && (
                              <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800" data-testid={`warning-ar-variance-${stmt.id}`}>
                                <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                                <div className="text-sm text-red-800 dark:text-red-200">
                                  <p className="font-medium">A/R Reconciliation Variance</p>
                                  <p>Closing balance {formatCurrency(stmt.closingBalance)} does not match aging total {formatCurrency(agingTotal)} (variance: {formatCurrency(variance)}). This may indicate unapplied credits, voided invoices with incorrect status, or partial payments not reflected in balance_due.</p>
                                </div>
                              </div>
                            )}

                            {parseFloat(String(stmt.totalInvoicesIssued || "0")) === 0 && parseFloat(String(stmt.totalPaymentsReceived || "0")) > 0 && (
                              <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800" data-testid={`warning-no-invoices-${stmt.id}`}>
                                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 mt-0.5 shrink-0" />
                                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                  No invoices found for this period. Only approved/sent/paid invoices appear on statements — draft invoices are excluded.
                                </p>
                              </div>
                            )}

                            {transactions.length > 0 && (
                              <div>
                                <p className="text-sm font-medium mb-2">Transactions ({transactions.length})</p>
                                <div className="border rounded-md overflow-hidden">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="text-xs">Date</TableHead>
                                        <TableHead className="text-xs">Type</TableHead>
                                        <TableHead className="text-xs">Reference</TableHead>
                                        <TableHead className="text-xs">Description</TableHead>
                                        <TableHead className="text-xs text-right">Debit</TableHead>
                                        <TableHead className="text-xs text-right">Credit</TableHead>
                                        <TableHead className="text-xs text-right">Balance</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {transactions.slice(0, 20).map((tx, idx) => (
                                        <TableRow key={idx}>
                                          <TableCell className="text-xs">{formatDate(tx.date)}</TableCell>
                                          <TableCell>
                                            <Badge variant="outline" className="text-xs">{tx.type}</Badge>
                                          </TableCell>
                                          <TableCell className="text-xs font-medium">{tx.reference}</TableCell>
                                          <TableCell className="text-xs">{tx.description}</TableCell>
                                          <TableCell className="text-xs text-right">{parseFloat(tx.debit) > 0 ? formatCurrency(tx.debit) : ""}</TableCell>
                                          <TableCell className="text-xs text-right">{parseFloat(tx.credit) > 0 ? formatCurrency(tx.credit) : ""}</TableCell>
                                          <TableCell className="text-xs text-right font-medium">{formatCurrency(tx.runningBalance)}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                  {transactions.length > 20 && (
                                    <p className="text-xs text-muted-foreground p-2 text-center">
                                      Showing 20 of {transactions.length} transactions. Download PDF for complete details.
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Generate Statement Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) { setPreviewData(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate Billing Statement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Customer</label>
              <Select value={formCustomerId} onValueChange={(v) => { setFormCustomerId(v); setPreviewData(null); }}>
                <SelectTrigger data-testid="select-statement-customer">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.customerName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Statement Type</label>
              <Select value={formType} onValueChange={(v) => {
                setFormType(v as "monthly" | "custom");
                setPreviewData(null);
                if (v === "monthly") handleCreateMonthlyDefaults();
              }}>
                <SelectTrigger data-testid="select-statement-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly (Previous Month)</SelectItem>
                  <SelectItem value="custom">Custom Date Range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Start Date</label>
                <Input
                  type="date"
                  value={formStartDate}
                  onChange={(e) => { setFormStartDate(e.target.value); setPreviewData(null); }}
                  data-testid="input-start-date"
                />
              </div>
              <div>
                <label className="text-sm font-medium">End Date</label>
                <Input
                  type="date"
                  value={formEndDate}
                  onChange={(e) => { setFormEndDate(e.target.value); setPreviewData(null); }}
                  data-testid="input-end-date"
                />
              </div>
            </div>

            {/* Preview panel */}
            {previewLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted/30 rounded-md">
                <Loader2 className="h-4 w-4 animate-spin" />
                Computing preview...
              </div>
            )}
            {previewData && !previewLoading && (
              <div className="border rounded-md p-3 space-y-2 bg-muted/20">
                <p className="text-sm font-medium flex items-center gap-1">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  Statement Preview
                </p>
                {previewData.warning && (
                  <div className="flex items-start gap-2 p-2 rounded-md bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800">
                    <AlertTriangle className="h-3 w-3 text-yellow-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-yellow-800 dark:text-yellow-200">{previewData.warning}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Opening Balance:</span>{" "}
                    <span className="font-medium">{formatCurrency(previewData.openingBalance)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Invoices Issued:</span>{" "}
                    <span className="font-medium">{formatCurrency(previewData.totalInvoicesIssued)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Payments Received:</span>{" "}
                    <span className="font-medium">{formatCurrency(previewData.totalPaymentsReceived)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Credits:</span>{" "}
                    <span className="font-medium">{formatCurrency(previewData.totalCreditsAdjustments)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Closing Balance:</span>{" "}
                    <span className="font-semibold">{formatCurrency(previewData.closingBalance)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Open A/R:</span>{" "}
                    <span className={`font-medium ${previewData.arReconciled ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                      {formatCurrency(previewData.totalOpenAR)}
                      {previewData.arReconciled ? " ✓" : ` (Δ ${formatCurrency(previewData.arVariance)})`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Statements are immutable snapshots. Regenerating for the same period creates a new version.
            </p>
          </div>
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} data-testid="button-cancel-generate">Cancel</Button>
            <Button variant="outline" onClick={handlePreview} disabled={previewLoading || !formCustomerId || !formStartDate || !formEndDate} data-testid="button-preview-statement">
              {previewLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Preview
            </Button>
            <Button onClick={handleGenerate} disabled={generateMutation.isPending} data-testid="button-confirm-generate">
              {generateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Generate Statement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Statement Detail Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Statement Details</DialogTitle>
          </DialogHeader>
          {selectedStatement && (() => {
            const agingTotal = computeAgingTotal(selectedStatement);
            const { variance, reconciled } = computeARVariance(selectedStatement);
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Statement Number</p>
                    <p className="font-medium">{selectedStatement.statementNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Customer</p>
                    <p className="font-medium">{selectedStatement.customerName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Period</p>
                    <p className="font-medium">{formatDate(selectedStatement.periodStartDate)} – {formatDate(selectedStatement.periodEndDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Version</p>
                    <p className="font-medium">v{selectedStatement.snapshotVersion || 1}</p>
                  </div>
                </div>

                {parseFloat(String(selectedStatement.totalInvoicesIssued || "0")) === 0 && parseFloat(String(selectedStatement.totalPaymentsReceived || "0")) > 0 && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800" data-testid="warning-detail-no-invoices">
                    <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      No invoices found for this period. Only approved/sent/paid invoices appear — draft invoices are excluded.
                    </p>
                  </div>
                )}

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Balance Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Opening Balance</span>
                      <span>{formatCurrency(selectedStatement.openingBalance)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">+ Invoices Issued</span>
                      <span>{formatCurrency(selectedStatement.totalInvoicesIssued)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">- Payments Received</span>
                      <span>{formatCurrency(selectedStatement.totalPaymentsReceived)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">- Credits/Adjustments</span>
                      <span>{formatCurrency(selectedStatement.totalCreditsAdjustments)}</span>
                    </div>
                    <div className="border-t pt-1 flex justify-between text-sm font-bold">
                      <span>Closing Balance</span>
                      <span>{formatCurrency(selectedStatement.closingBalance)}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between gap-2">
                      <span>Aging Summary (Open A/R)</span>
                      <ARReconciliationBadge stmt={selectedStatement} />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-5 gap-2 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Current</p>
                        <p className="text-sm font-medium">{formatCurrency(selectedStatement.agingCurrent)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">1–30</p>
                        <p className="text-sm font-medium">{formatCurrency(selectedStatement.aging1to30)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">31–60</p>
                        <p className="text-sm font-medium">{formatCurrency(selectedStatement.aging31to60)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">61–90</p>
                        <p className="text-sm font-medium">{formatCurrency(selectedStatement.aging61to90)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">90+</p>
                        <p className="text-sm font-medium">{formatCurrency(selectedStatement.agingOver90)}</p>
                      </div>
                    </div>
                    <div className="flex justify-between text-sm border-t pt-2">
                      <span className="text-muted-foreground">Total Open A/R</span>
                      <span className="font-bold">{formatCurrency(agingTotal)}</span>
                    </div>
                    {!reconciled && (
                      <div className="flex items-start gap-2 p-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                        <XCircle className="h-3 w-3 text-red-600 mt-0.5 shrink-0" />
                        <p className="text-xs text-red-800 dark:text-red-200">
                          Variance of {formatCurrency(variance)} between closing balance and aging total. May indicate unapplied credits or incorrect invoice statuses.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => handleDownloadPDF(selectedStatement.id)} data-testid="button-view-download-pdf">
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </Button>
                  <Button variant="outline" onClick={() => { setEmailOpen(true); setViewOpen(false); }} data-testid="button-view-send-email">
                    <Mail className="h-4 w-4 mr-2" />
                    Send Email
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Email Statement Dialog */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email Statement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Send statement {selectedStatement?.statementNumber} to billing recipients.
            </p>
            <div>
              <label className="text-sm font-medium">Email Addresses</label>
              <Input
                placeholder="email@example.com, other@example.com"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                data-testid="input-email-addresses"
              />
              <p className="text-xs text-muted-foreground mt-1">Separate multiple addresses with commas.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailOpen(false)} data-testid="button-cancel-email">Cancel</Button>
            <Button onClick={handleSendEmail} disabled={emailMutation.isPending || !emailTo.trim()} data-testid="button-confirm-email">
              {emailMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send Statement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
