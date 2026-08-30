import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, FileText, TrendingUp, TrendingDown, Minus, Download, Mail, Plus, DollarSign, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CustomerStatement {
  id: string;
  statementNumber: string;
  customerId: string;
  customerName: string;
  periodStartDate: string;
  periodEndDate: string;
  openingBalance: string;
  totalInvoicesIssued: string;
  totalPaymentsReceived: string;
  totalCreditsAdjustments: string;
  closingBalance: string;
  agingCurrent: string;
  aging1to30: string;
  aging31to60: string;
  aging61to90: string;
  agingOver90: string;
  invoiceCountDraft: number;
  invoiceCountSent: number;
  invoiceCountPaid: number;
  invoiceCountOverdue: number;
  transactionDetails: Array<{
    type: string;
    date: string;
    reference: string;
    description: string;
    amount: string;
    balance: string;
  }>;
  createdAt: string;
  createdBy: string;
}

interface CustomerStatementsProps {
  customerId: string;
  customerName: string;
}

export function CustomerStatements({ customerId, customerName }: CustomerStatementsProps) {
  const { toast } = useToast();
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [expandedStatement, setExpandedStatement] = useState<string | null>(null);
  const [periodStartDate, setPeriodStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    date.setDate(1);
    return date.toISOString().split('T')[0];
  });
  const [periodEndDate, setPeriodEndDate] = useState(() => {
    const date = new Date();
    date.setDate(0);
    return date.toISOString().split('T')[0];
  });

  const { data: statements = [], isLoading, error, refetch } = useQuery<CustomerStatement[]>({
    queryKey: ["/api/corporate/invoicing/customers", customerId, "statements"],
    queryFn: async () => {
      const res = await fetch(`/api/corporate/invoicing/customers/${customerId}/statements`, {
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to fetch statements");
      return res.json();
    }
  });

  const generateMutation = useMutation({
    mutationFn: async (data: { periodStartDate: string; periodEndDate: string }) => {
      const res = await apiRequest("POST", `/api/corporate/invoicing/customers/${customerId}/statements`, data);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/customers", customerId, "statements"] });
      if (data?.warning) {
        toast({ title: "Statement generated with warning", description: data.warning, variant: "destructive" });
      } else {
        toast({ title: "Statement generated", description: "Customer statement has been created successfully" });
      }
      setIsGenerateOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to generate statement", variant: "destructive" });
    }
  });

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const getTrendIcon = (opening: number, closing: number) => {
    const diff = closing - opening;
    if (diff > 0) return <TrendingUp className="h-4 w-4 text-red-500" />;
    if (diff < 0) return <TrendingDown className="h-4 w-4 text-green-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const handleGenerate = () => {
    generateMutation.mutate({ periodStartDate, periodEndDate });
  };

  const setQuickPeriod = (period: 'current' | 'last' | 'ytd' | 'q1' | 'q2' | 'q3' | 'q4') => {
    const now = new Date();
    const year = now.getFullYear();
    
    switch (period) {
      case 'current': {
        const start = new Date(year, now.getMonth(), 1);
        setPeriodStartDate(start.toISOString().split('T')[0]);
        setPeriodEndDate(now.toISOString().split('T')[0]);
        break;
      }
      case 'last': {
        const start = new Date(year, now.getMonth() - 1, 1);
        const end = new Date(year, now.getMonth(), 0);
        setPeriodStartDate(start.toISOString().split('T')[0]);
        setPeriodEndDate(end.toISOString().split('T')[0]);
        break;
      }
      case 'ytd': {
        const start = new Date(year, 0, 1);
        setPeriodStartDate(start.toISOString().split('T')[0]);
        setPeriodEndDate(now.toISOString().split('T')[0]);
        break;
      }
      case 'q1': {
        setPeriodStartDate(`${year}-01-01`);
        setPeriodEndDate(`${year}-03-31`);
        break;
      }
      case 'q2': {
        setPeriodStartDate(`${year}-04-01`);
        setPeriodEndDate(`${year}-06-30`);
        break;
      }
      case 'q3': {
        setPeriodStartDate(`${year}-07-01`);
        setPeriodEndDate(`${year}-09-30`);
        break;
      }
      case 'q4': {
        setPeriodStartDate(`${year}-10-01`);
        setPeriodEndDate(`${year}-12-31`);
        break;
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="ml-2">Loading statements...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center p-8">
          <FileText className="h-12 w-12 text-destructive mb-4" />
          <h4 className="font-medium mb-2">Error loading statements</h4>
          <p className="text-sm text-muted-foreground text-center mb-4">
            {(error as Error).message || "Failed to load customer statements"}
          </p>
          <Button variant="outline" onClick={() => refetch()} data-testid="button-retry-statements">
            <Loader2 className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">Account Statements</h3>
          <p className="text-sm text-muted-foreground">
            Generate and view account summary reports for {customerName}
          </p>
        </div>
        <Dialog open={isGenerateOpen} onOpenChange={setIsGenerateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-generate-statement">
              <Plus className="h-4 w-4 mr-2" />
              Generate Statement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Generate Statement</DialogTitle>
              <DialogDescription>
                Create an account statement for the selected period
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" onClick={() => setQuickPeriod('current')} data-testid="button-period-current">
                  Current Month
                </Button>
                <Button size="sm" variant="outline" onClick={() => setQuickPeriod('last')} data-testid="button-period-last">
                  Last Month
                </Button>
                <Button size="sm" variant="outline" onClick={() => setQuickPeriod('ytd')} data-testid="button-period-ytd">
                  Year to Date
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" onClick={() => setQuickPeriod('q1')} data-testid="button-period-q1">Q1</Button>
                <Button size="sm" variant="outline" onClick={() => setQuickPeriod('q2')} data-testid="button-period-q2">Q2</Button>
                <Button size="sm" variant="outline" onClick={() => setQuickPeriod('q3')} data-testid="button-period-q3">Q3</Button>
                <Button size="sm" variant="outline" onClick={() => setQuickPeriod('q4')} data-testid="button-period-q4">Q4</Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="period-start">Period Start</Label>
                  <Input
                    id="period-start"
                    type="date"
                    value={periodStartDate}
                    onChange={(e) => setPeriodStartDate(e.target.value)}
                    data-testid="input-period-start"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="period-end">Period End</Label>
                  <Input
                    id="period-end"
                    type="date"
                    value={periodEndDate}
                    onChange={(e) => setPeriodEndDate(e.target.value)}
                    data-testid="input-period-end"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsGenerateOpen(false)} data-testid="button-cancel-generate">
                Cancel
              </Button>
              <Button 
                onClick={handleGenerate} 
                disabled={generateMutation.isPending}
                data-testid="button-confirm-generate"
              >
                {generateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Generate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {statements.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-8">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h4 className="font-medium mb-2">No statements generated</h4>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Generate your first statement to see account activity and balances.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {statements.map((statement) => {
            const isExpanded = expandedStatement === statement.id;
            const opening = parseFloat(statement.openingBalance);
            const closing = parseFloat(statement.closingBalance);
            const totalAging = parseFloat(statement.agingCurrent) + parseFloat(statement.aging1to30) + 
                              parseFloat(statement.aging31to60) + parseFloat(statement.aging61to90) + 
                              parseFloat(statement.agingOver90);

            return (
              <Card key={statement.id} data-testid={`card-statement-${statement.id}`}>
                <CardHeader className="cursor-pointer" onClick={() => setExpandedStatement(isExpanded ? null : statement.id)}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <CardTitle className="text-base">{statement.statementNumber}</CardTitle>
                        <CardDescription>
                          <Calendar className="inline-block h-3 w-3 mr-1" />
                          {formatDate(statement.periodStartDate)} - {formatDate(statement.periodEndDate)}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">Closing Balance</div>
                        <div className="flex items-center gap-1 font-medium">
                          {getTrendIcon(opening, closing)}
                          {formatCurrency(statement.closingBalance)}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" data-testid={`button-toggle-statement-${statement.id}`}>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <Card>
                        <CardContent className="pt-4">
                          <div className="text-sm text-muted-foreground">Opening Balance</div>
                          <div className="text-lg font-semibold">{formatCurrency(statement.openingBalance)}</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4">
                          <div className="text-sm text-muted-foreground">+ Invoices Issued</div>
                          <div className="text-lg font-semibold text-red-600">{formatCurrency(statement.totalInvoicesIssued)}</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4">
                          <div className="text-sm text-muted-foreground">- Payments Received</div>
                          <div className="text-lg font-semibold text-green-600">{formatCurrency(statement.totalPaymentsReceived)}</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4">
                          <div className="text-sm text-muted-foreground">- Credits/Adjustments</div>
                          <div className="text-lg font-semibold text-green-600">{formatCurrency(statement.totalCreditsAdjustments)}</div>
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Aging Summary (as of {formatDate(statement.periodEndDate)})</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-5 gap-2 text-center">
                          <div>
                            <div className="text-xs text-muted-foreground">Current</div>
                            <div className="font-medium">{formatCurrency(statement.agingCurrent)}</div>
                            {totalAging > 0 && (
                              <Badge variant="outline" className="mt-1">
                                {Math.round((parseFloat(statement.agingCurrent) / totalAging) * 100)}%
                              </Badge>
                            )}
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">1-30 Days</div>
                            <div className="font-medium text-yellow-600">{formatCurrency(statement.aging1to30)}</div>
                            {totalAging > 0 && (
                              <Badge variant="outline" className="mt-1 border-yellow-500">
                                {Math.round((parseFloat(statement.aging1to30) / totalAging) * 100)}%
                              </Badge>
                            )}
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">31-60 Days</div>
                            <div className="font-medium text-orange-600">{formatCurrency(statement.aging31to60)}</div>
                            {totalAging > 0 && (
                              <Badge variant="outline" className="mt-1 border-orange-500">
                                {Math.round((parseFloat(statement.aging31to60) / totalAging) * 100)}%
                              </Badge>
                            )}
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">61-90 Days</div>
                            <div className="font-medium text-red-500">{formatCurrency(statement.aging61to90)}</div>
                            {totalAging > 0 && (
                              <Badge variant="outline" className="mt-1 border-red-500">
                                {Math.round((parseFloat(statement.aging61to90) / totalAging) * 100)}%
                              </Badge>
                            )}
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">90+ Days</div>
                            <div className="font-medium text-red-700">{formatCurrency(statement.agingOver90)}</div>
                            {totalAging > 0 && (
                              <Badge variant="outline" className="mt-1 border-red-700">
                                {Math.round((parseFloat(statement.agingOver90) / totalAging) * 100)}%
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Invoice Summary</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">
                            Draft: {statement.invoiceCountDraft}
                          </Badge>
                          <Badge variant="outline" className="border-blue-500">
                            Sent/Viewed: {statement.invoiceCountSent}
                          </Badge>
                          <Badge variant="outline" className="border-green-500">
                            Paid: {statement.invoiceCountPaid}
                          </Badge>
                          <Badge variant="outline" className="border-red-500">
                            Overdue: {statement.invoiceCountOverdue}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>

                    {statement.transactionDetails && statement.transactionDetails.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Transaction Details</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Date</TableHead>
                                  <TableHead>Type</TableHead>
                                  <TableHead>Reference</TableHead>
                                  <TableHead>Description</TableHead>
                                  <TableHead className="text-right">Amount</TableHead>
                                  <TableHead className="text-right">Balance</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {statement.transactionDetails.map((tx, idx) => (
                                  <TableRow key={idx}>
                                    <TableCell className="whitespace-nowrap">{formatDate(tx.date)}</TableCell>
                                    <TableCell>
                                      <Badge 
                                        variant="outline"
                                        className={
                                          tx.type === 'invoice' ? 'border-red-500' : 
                                          tx.type === 'payment' ? 'border-green-500' : 
                                          tx.type === 'credit' ? 'border-blue-500' : ''
                                        }
                                      >
                                        {tx.type === 'opening_balance' ? 'Opening' : tx.type}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>{tx.reference || '-'}</TableCell>
                                    <TableCell>{tx.description}</TableCell>
                                    <TableCell className={`text-right ${parseFloat(tx.amount) < 0 ? 'text-green-600' : parseFloat(tx.amount) > 0 ? 'text-red-600' : ''}`}>
                                      {tx.type === 'opening_balance' ? '-' : formatCurrency(tx.amount)}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">{formatCurrency(tx.balance)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <div className="text-xs text-muted-foreground">
                      Generated on {new Date(statement.createdAt).toLocaleString()}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
