import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Loader2, Zap, RefreshCw, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";

interface UnappliedPaymentsPanelProps {
  customers: Array<{ id: string; customerName?: string; name?: string }>;
}

function formatCurrency(val: number | string | null | undefined) {
  return `$${parseFloat(String(val || 0)).toFixed(2)}`;
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

export function UnappliedPaymentsPanel({ customers }: UnappliedPaymentsPanelProps) {
  const { toast } = useToast();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [lastRunResults, setLastRunResults] = useState<any[] | null>(null);

  // Fetch unapplied payment data for selected customer
  const { data, isLoading, refetch } = useQuery<{
    unappliedPayments: any[];
    openInvoices: any[];
    totalUnapplied: number;
    totalOpenBalance: number;
  }>({
    queryKey: ["/api/corporate/invoicing/customers", selectedCustomerId, "unapplied-payments"],
    enabled: !!selectedCustomerId,
  });

  // Auto-apply single payment FIFO
  const autoApplyMutation = useMutation({
    mutationFn: (paymentId: string) =>
      apiRequest("POST", `/api/corporate/invoicing/payments/${paymentId}/auto-apply`).then((r) => r.json()),
    onSuccess: (result: any) => {
      const count = result.applications?.length ?? 0;
      const applied = result.startingUnapplied - result.endingUnapplied;
      if (count === 0 && result.skippedReason) {
        toast({ title: "Nothing applied", description: result.skippedReason, variant: "default" });
      } else {
        toast({
          title: `Applied ${formatCurrency(applied)} across ${count} invoice${count !== 1 ? "s" : ""}`,
          description: `Payment ${result.paymentNumber} — ${result.endingUnapplied > 0 ? formatCurrency(result.endingUnapplied) + " still unapplied" : "fully applied"}`,
        });
      }
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/payments"] });
    },
    onError: (e: any) => toast({ title: "Auto-apply failed", description: e.message, variant: "destructive" }),
  });

  // Run FIFO for all unapplied payments for customer
  const runFIFOMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/corporate/invoicing/customers/${selectedCustomerId}/run-fifo`).then((r) => r.json()),
    onSuccess: (result: any) => {
      setLastRunResults(result.results ?? []);
      const totalApplied = result.totalApplied ?? 0;
      const processed = result.paymentsProcessed ?? 0;
      if (totalApplied < 0.01) {
        toast({ title: "No changes made", description: "No unapplied payments or no open invoices to match.", variant: "default" });
      } else {
        toast({
          title: `FIFO run complete`,
          description: `Applied ${formatCurrency(totalApplied)} across ${processed} payment${processed !== 1 ? "s" : ""}`,
        });
      }
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/payments"] });
    },
    onError: (e: any) => toast({ title: "FIFO run failed", description: e.message, variant: "destructive" }),
  });

  const unappliedPayments = data?.unappliedPayments ?? [];
  const openInvoices = data?.openInvoices ?? [];
  const totalUnapplied = data?.totalUnapplied ?? 0;
  const totalOpenBalance = data?.totalOpenBalance ?? 0;
  const canApply = totalUnapplied > 0 && totalOpenBalance > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">FIFO Payment Application</CardTitle>
            <CardDescription className="mt-0.5">
              Auto-apply unapplied payments to oldest open invoices first
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedCustomerId} onValueChange={(v) => { setSelectedCustomerId(v); setLastRunResults(null); }}>
              <SelectTrigger className="w-56" data-testid="select-fifo-customer">
                <SelectValue placeholder="Select customer..." />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id} data-testid={`option-customer-${c.id}`}>
                    {c.customerName || c.name || c.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCustomerId && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => refetch()}
                disabled={isLoading}
                data-testid="button-refresh-unapplied"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            )}
            {selectedCustomerId && (
              <Button
                onClick={() => runFIFOMutation.mutate()}
                disabled={runFIFOMutation.isPending || !canApply}
                data-testid="button-run-fifo"
              >
                {runFIFOMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 mr-2" />
                )}
                Run FIFO Auto-Apply
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {selectedCustomerId && (
        <CardContent className="pt-0 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Summary row */}
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Total unapplied: </span>
                  <span className={`font-semibold ${totalUnapplied > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                    {formatCurrency(totalUnapplied)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Open invoice balance: </span>
                  <span className={`font-semibold ${totalOpenBalance > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                    {formatCurrency(totalOpenBalance)}
                  </span>
                </div>
                {canApply && (
                  <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Ready to apply {formatCurrency(Math.min(totalUnapplied, totalOpenBalance))}</span>
                  </div>
                )}
                {!canApply && selectedCustomerId && !isLoading && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>
                      {totalUnapplied < 0.01
                        ? "No unapplied payments"
                        : "No open invoices to apply to"}
                    </span>
                  </div>
                )}
              </div>

              {/* Unapplied payments table */}
              {unappliedPayments.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm font-medium mb-2">Unapplied Payments</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Payment #</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Applied</TableHead>
                          <TableHead>Unapplied</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {unappliedPayments.map((p: any) => (
                          <TableRow key={p.id} data-testid={`row-unapplied-${p.id}`}>
                            <TableCell className="font-medium">{p.paymentNumber}</TableCell>
                            <TableCell>{formatDate(p.paymentDate)}</TableCell>
                            <TableCell className="capitalize">{p.paymentMethod?.replace("_", " ") || "—"}</TableCell>
                            <TableCell>{formatCurrency(p.amount)}</TableCell>
                            <TableCell>{formatCurrency(p.appliedAmount)}</TableCell>
                            <TableCell>
                              <span className="font-medium text-amber-600 dark:text-amber-400">
                                {formatCurrency(p.unappliedAmount)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => autoApplyMutation.mutate(p.id)}
                                disabled={autoApplyMutation.isPending || totalOpenBalance < 0.01}
                                data-testid={`button-auto-apply-${p.id}`}
                              >
                                {autoApplyMutation.isPending ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <ArrowRight className="w-3.5 h-3.5 mr-1" />
                                )}
                                Auto-Apply
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}

              {/* Open invoices awaiting payment */}
              {openInvoices.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm font-medium mb-2">
                      Open Invoices (FIFO order — oldest first)
                    </p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice #</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Paid</TableHead>
                          <TableHead>Balance Due</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {openInvoices.map((inv: any, idx: number) => (
                          <TableRow key={inv.id} data-testid={`row-open-invoice-${inv.id}`}>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                {idx === 0 && (
                                  <Badge variant="outline" className="text-xs font-normal">Next</Badge>
                                )}
                                <span className="font-medium">{inv.invoiceNumber}</span>
                              </div>
                            </TableCell>
                            <TableCell>{formatDate(inv.invoiceDate)}</TableCell>
                            <TableCell>{formatDate(inv.dueDate)}</TableCell>
                            <TableCell>{formatCurrency(inv.totalAmount)}</TableCell>
                            <TableCell>{formatCurrency(inv.paidAmount)}</TableCell>
                            <TableCell className="font-medium">{formatCurrency(inv.balanceDue)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize text-xs">
                                {inv.status?.replace(/_/g, " ")}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}

              {/* Last FIFO run summary */}
              {lastRunResults && lastRunResults.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm font-medium mb-2">Last FIFO Run Results</p>
                    <div className="space-y-2">
                      {lastRunResults.map((r: any, i: number) => {
                        const applied = r.startingUnapplied - r.endingUnapplied;
                        return (
                          <div key={i} className="text-sm rounded-md border px-3 py-2 flex flex-col gap-1" data-testid={`result-fifo-${r.paymentId}`}>
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <span className="font-medium">{r.paymentNumber}</span>
                              {r.skippedReason ? (
                                <Badge variant="outline" className="text-xs text-muted-foreground">{r.skippedReason}</Badge>
                              ) : applied > 0 ? (
                                <span className="text-green-600 dark:text-green-400 text-xs font-medium">
                                  Applied {formatCurrency(applied)}
                                </span>
                              ) : null}
                            </div>
                            {r.applications?.length > 0 && (
                              <div className="text-xs text-muted-foreground space-y-0.5 pl-1">
                                {r.applications.map((app: any, j: number) => (
                                  <div key={j}>
                                    {formatCurrency(app.appliedAmount)} → Invoice {app.invoiceNumber}
                                    {app.remainingInvoiceBalance <= 0 && (
                                      <span className="ml-1 text-green-600 dark:text-green-400">(paid in full)</span>
                                    )}
                                    {app.remainingInvoiceBalance > 0 && (
                                      <span className="ml-1 text-muted-foreground">
                                        ({formatCurrency(app.remainingInvoiceBalance)} remaining)
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
