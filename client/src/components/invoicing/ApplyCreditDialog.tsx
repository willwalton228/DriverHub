import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard, DollarSign, Info, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

interface CreditMemo {
  id: string;
  creditMemoNumber: string;
  customerId: string;
  amount: string;
  remainingAmount: string;
  status: string;
  reason?: string;
  createdAt: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  totalAmount: string;
  balanceDue?: string;
  creditApplied?: string;
  status: string;
}

interface ApplyCreditDialogProps {
  invoice: Invoice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ApplyCreditDialog({ invoice, open, onOpenChange, onSuccess }: ApplyCreditDialogProps) {
  const { toast } = useToast();
  const [selectedCreditMemo, setSelectedCreditMemo] = useState<string>("");
  const [amount, setAmount] = useState<string>("");

  const { data: creditMemos, isLoading: loadingCredits } = useQuery<CreditMemo[]>({
    queryKey: ["/api/corporate/invoicing/credit-memos", { customerId: invoice.customerId, status: "active" }],
    enabled: open,
  });

  const availableCredits = creditMemos?.filter(cm => 
    cm.customerId === invoice.customerId && 
    (cm.status === 'active' || cm.status === 'pending') &&
    parseFloat(cm.remainingAmount) > 0
  ) || [];

  const selectedCredit = availableCredits.find(cm => cm.id === selectedCreditMemo);
  const maxApplicable = selectedCredit 
    ? Math.min(
        parseFloat(selectedCredit.remainingAmount),
        parseFloat(invoice.balanceDue || invoice.totalAmount)
      )
    : 0;

  const applyMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/corporate/invoicing/credit-memos/${selectedCreditMemo}/apply`, {
        invoiceId: invoice.id,
        amount,
      });
    },
    onSuccess: () => {
      toast({ 
        title: "Credit Applied", 
        description: `$${parseFloat(amount).toFixed(2)} credit applied to invoice ${invoice.invoiceNumber}.` 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices", invoice.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices", invoice.id, "activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/credit-memos"] });
      handleClose();
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!selectedCreditMemo) {
      toast({ title: "Error", description: "Please select a credit memo.", variant: "destructive" });
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast({ title: "Error", description: "Please enter a valid amount.", variant: "destructive" });
      return;
    }
    if (numAmount > maxApplicable) {
      toast({ title: "Error", description: `Amount exceeds maximum applicable ($${maxApplicable.toFixed(2)}).`, variant: "destructive" });
      return;
    }
    applyMutation.mutate();
  };

  const handleClose = () => {
    setSelectedCreditMemo("");
    setAmount("");
    onOpenChange(false);
  };

  const handleSelectCredit = (creditId: string) => {
    setSelectedCreditMemo(creditId);
    const credit = availableCredits.find(cm => cm.id === creditId);
    if (credit) {
      const maxAmount = Math.min(
        parseFloat(credit.remainingAmount),
        parseFloat(invoice.balanceDue || invoice.totalAmount)
      );
      setAmount(maxAmount.toFixed(2));
    }
  };

  const balanceDue = parseFloat(invoice.balanceDue || invoice.totalAmount);
  const isApplicable = balanceDue > 0 && invoice.status !== 'void' && invoice.status !== 'paid';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Apply Credit to Invoice
          </DialogTitle>
          <DialogDescription>
            Apply a credit memo to invoice <strong>{invoice.invoiceNumber}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {!isApplicable ? (
            <Alert variant="default">
              <Info className="h-4 w-4" />
              <AlertDescription>
                {invoice.status === 'paid' 
                  ? 'This invoice is already paid. No credits can be applied.'
                  : invoice.status === 'void'
                  ? 'This invoice has been voided. No credits can be applied.'
                  : 'No balance remaining on this invoice.'}
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Invoice Total:</span>
                  <span className="font-medium">${parseFloat(invoice.totalAmount).toFixed(2)}</span>
                </div>
                {invoice.creditApplied && parseFloat(invoice.creditApplied) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Credits Already Applied:</span>
                    <span className="text-green-600 dark:text-green-400">-${parseFloat(invoice.creditApplied).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-medium border-t pt-2">
                  <span>Balance Due:</span>
                  <span>${balanceDue.toFixed(2)}</span>
                </div>
              </div>

              {loadingCredits ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : availableCredits.length === 0 ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    No available credit memos for this customer. Create a credit memo first.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="credit-memo" required>Select Credit Memo</Label>
                    <Select value={selectedCreditMemo} onValueChange={handleSelectCredit}>
                      <SelectTrigger id="credit-memo" data-testid="select-credit-memo">
                        <SelectValue placeholder="Select a credit memo" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableCredits.map((cm) => (
                          <SelectItem key={cm.id} value={cm.id}>
                            <div className="flex items-center gap-2">
                              <span>{cm.creditMemoNumber}</span>
                              <Badge variant="secondary" className="text-xs">
                                ${parseFloat(cm.remainingAmount).toFixed(2)} available
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedCredit && (
                    <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Credit Memo:</span>
                        <span className="font-medium">{selectedCredit.creditMemoNumber}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Original Amount:</span>
                        <span>${parseFloat(selectedCredit.amount).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Available:</span>
                        <span className="text-green-600 dark:text-green-400 font-medium">
                          ${parseFloat(selectedCredit.remainingAmount).toFixed(2)}
                        </span>
                      </div>
                      {selectedCredit.reason && (
                        <div className="text-xs text-muted-foreground pt-1 border-t">
                          {selectedCredit.reason}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="apply-amount" required>Amount to Apply</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="apply-amount"
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={maxApplicable}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="pl-8"
                        placeholder="0.00"
                        data-testid="input-apply-amount"
                      />
                    </div>
                    {selectedCredit && (
                      <p className="text-xs text-muted-foreground">
                        Maximum applicable: ${maxApplicable.toFixed(2)}
                      </p>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} data-testid="button-cancel-apply-credit">
            Cancel
          </Button>
          {isApplicable && availableCredits.length > 0 && (
            <Button
              onClick={handleSubmit}
              disabled={applyMutation.isPending || !selectedCreditMemo || !amount}
              data-testid="button-confirm-apply-credit"
            >
              {applyMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Apply Credit
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
