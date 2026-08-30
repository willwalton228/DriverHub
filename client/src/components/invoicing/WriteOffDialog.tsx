import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Loader2, AlertTriangle, XCircle, FileX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

const WRITE_OFF_REASONS = [
  { value: "uncollectible", label: "Uncollectible" },
  { value: "bankruptcy", label: "Customer Bankruptcy" },
  { value: "disputed_settlement", label: "Disputed Settlement" },
  { value: "customer_closed", label: "Customer Closed / Out of Business" },
  { value: "aging_policy", label: "Aging Policy (Past Threshold)" },
  { value: "small_balance", label: "Small Balance Write-Off" },
  { value: "other", label: "Other" },
] as const;

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: string;
  balanceDue?: string;
  paidAmount?: string;
  writtenOffAmount?: string;
  customerId: string;
  customerName?: string;
}

interface WriteOffDialogProps {
  invoice: Invoice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function WriteOffDialog({ invoice, open, onOpenChange, onSuccess }: WriteOffDialogProps) {
  const { toast } = useToast();
  const [reason, setReason] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [isFullWriteOff, setIsFullWriteOff] = useState(true);

  const balanceDue = parseFloat(invoice.balanceDue || invoice.totalAmount);
  const effectiveAmount = isFullWriteOff ? balanceDue : parseFloat(amount || "0");
  const isValidAmount = effectiveAmount > 0 && effectiveAmount <= balanceDue;

  const writeOffMutation = useMutation({
    mutationFn: async () => {
      const writeOffAmount = isFullWriteOff ? String(balanceDue) : amount;
      const reasonLabel = WRITE_OFF_REASONS.find(r => r.value === reason)?.label || reason;
      return apiRequest('POST', `/api/corporate/invoicing/invoices/${invoice.id}/write-off`, {
        amount: writeOffAmount,
        reason: reasonLabel,
        notes,
      });
    },
    onSuccess: () => {
      toast({
        title: "Invoice Written Off",
        description: `$${effectiveAmount.toFixed(2)} has been written off for Invoice ${invoice.invoiceNumber}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices", invoice.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices", invoice.id, "activities"] });
      handleClose();
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!reason) {
      toast({ title: "Error", description: "Please select a write-off reason.", variant: "destructive" });
      return;
    }
    if (!notes.trim()) {
      toast({ title: "Error", description: "Please provide notes explaining the write-off.", variant: "destructive" });
      return;
    }
    if (!isValidAmount) {
      toast({ title: "Error", description: "Please enter a valid write-off amount.", variant: "destructive" });
      return;
    }
    writeOffMutation.mutate();
  };

  const handleClose = () => {
    setReason("");
    setNotes("");
    setAmount("");
    setIsFullWriteOff(true);
    onOpenChange(false);
  };

  const allowedStatuses = ['overdue', 'sent', 'partially_paid', 'viewed'];
  const canWriteOff = allowedStatuses.includes(invoice.status) && balanceDue > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileX className="h-5 w-5 text-destructive" />
            Write Off Bad Debt
          </DialogTitle>
          <DialogDescription>
            Write off uncollectible balance for invoice <strong>{invoice.invoiceNumber}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {!canWriteOff ? (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                {invoice.status === 'written_off'
                  ? 'This invoice has already been fully written off.'
                  : invoice.status === 'paid'
                  ? 'Paid invoices cannot be written off.'
                  : invoice.status === 'void'
                  ? 'Voided invoices cannot be written off.'
                  : invoice.status === 'draft'
                  ? 'Draft invoices cannot be written off. Void the invoice instead.'
                  : `Invoices with status "${invoice.status}" cannot be written off.`}
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Invoice Total</span>
                  <span>${parseFloat(invoice.totalAmount).toFixed(2)}</span>
                </div>
                {parseFloat(invoice.paidAmount || '0') > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Amount Paid</span>
                    <span className="text-green-600">-${parseFloat(invoice.paidAmount || '0').toFixed(2)}</span>
                  </div>
                )}
                {parseFloat(invoice.writtenOffAmount || '0') > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Previously Written Off</span>
                    <span className="text-orange-600">-${parseFloat(invoice.writtenOffAmount || '0').toFixed(2)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-medium">
                  <span>Balance Due</span>
                  <span>${balanceDue.toFixed(2)}</span>
                </div>
              </div>

              <Alert variant="default" className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <AlertDescription className="text-amber-800 dark:text-amber-200">
                  {isFullWriteOff
                    ? "A full write-off will mark this invoice as written off and prevent further payments."
                    : "A partial write-off will reduce the balance due. The invoice will remain in its current status."}
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label>Write-Off Type</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={isFullWriteOff ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setIsFullWriteOff(true); setAmount(""); }}
                    className="flex-1"
                    data-testid="button-full-writeoff"
                  >
                    Full (${balanceDue.toFixed(2)})
                  </Button>
                  <Button
                    type="button"
                    variant={!isFullWriteOff ? "default" : "outline"}
                    size="sm"
                    onClick={() => setIsFullWriteOff(false)}
                    className="flex-1"
                    data-testid="button-partial-writeoff"
                  >
                    Partial
                  </Button>
                </div>
              </div>

              {!isFullWriteOff && (
                <div className="space-y-2">
                  <Label htmlFor="writeoff-amount" required>Write-Off Amount</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="writeoff-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={balanceDue}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="pl-7"
                      data-testid="input-writeoff-amount"
                    />
                  </div>
                  {amount && parseFloat(amount) > balanceDue && (
                    <p className="text-xs text-destructive">Amount cannot exceed the balance due of ${balanceDue.toFixed(2)}</p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="writeoff-reason" required>Write-Off Reason</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger id="writeoff-reason" data-testid="select-writeoff-reason">
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {WRITE_OFF_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="writeoff-notes" required>Notes</Label>
                <Textarea
                  id="writeoff-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Explain why this balance is being written off..."
                  rows={3}
                  data-testid="textarea-writeoff-notes"
                />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} data-testid="button-cancel-writeoff">
            Cancel
          </Button>
          {canWriteOff && (
            <Button
              variant="destructive"
              onClick={handleSubmit}
              disabled={writeOffMutation.isPending || !reason || !notes.trim() || !isValidAmount}
              data-testid="button-confirm-writeoff"
            >
              {writeOffMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Writing Off...
                </>
              ) : (
                <>
                  <FileX className="mr-2 h-4 w-4" />
                  Write Off ${effectiveAmount.toFixed(2)}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
