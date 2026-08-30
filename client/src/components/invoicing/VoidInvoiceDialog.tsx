import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle, XCircle, Ban } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

const VOID_REASONS = [
  { value: "duplicate", label: "Duplicate Invoice" },
  { value: "billing_error", label: "Billing Error" },
  { value: "customer_request", label: "Customer Request" },
  { value: "service_cancelled", label: "Service Cancelled" },
  { value: "wrong_customer", label: "Wrong Customer" },
  { value: "pricing_adjustment", label: "Pricing Adjustment Required" },
  { value: "other", label: "Other" },
] as const;

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: string;
  balanceDue?: string;
  customerId: string;
}

interface VoidInvoiceDialogProps {
  invoice: Invoice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function VoidInvoiceDialog({ invoice, open, onOpenChange, onSuccess }: VoidInvoiceDialogProps) {
  const { toast } = useToast();
  const [reasonCategory, setReasonCategory] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const voidMutation = useMutation({
    mutationFn: async () => {
      const reason = `${VOID_REASONS.find(r => r.value === reasonCategory)?.label || reasonCategory}${notes ? `: ${notes}` : ''}`;
      return apiRequest('POST', `/api/corporate/invoicing/invoices/${invoice.id}/void`, {
        reason,
      });
    },
    onSuccess: () => {
      toast({ 
        title: "Invoice Voided", 
        description: `Invoice ${invoice.invoiceNumber} has been voided successfully.` 
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
    if (!reasonCategory) {
      toast({ title: "Error", description: "Please select a reason for voiding.", variant: "destructive" });
      return;
    }
    voidMutation.mutate();
  };

  const handleClose = () => {
    setReasonCategory("");
    setNotes("");
    onOpenChange(false);
  };

  const isVoidable = invoice.status !== 'void' && invoice.status !== 'paid';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" />
            Void Invoice
          </DialogTitle>
          <DialogDescription>
            Void invoice <strong>{invoice.invoiceNumber}</strong>. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {!isVoidable ? (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                {invoice.status === 'void' 
                  ? 'This invoice has already been voided.'
                  : 'Paid invoices cannot be voided. Issue a credit memo instead.'}
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <Alert variant="default" className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <AlertDescription className="text-amber-800 dark:text-amber-200">
                  Voiding an invoice is permanent and will be recorded in the audit log. 
                  The balance of ${parseFloat(invoice.balanceDue || invoice.totalAmount).toFixed(2)} will be written off.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="void-reason" required>Reason for Voiding</Label>
                <Select value={reasonCategory} onValueChange={setReasonCategory}>
                  <SelectTrigger id="void-reason" data-testid="select-void-reason">
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {VOID_REASONS.map((reason) => (
                      <SelectItem key={reason.value} value={reason.value}>
                        {reason.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="void-notes">Additional Notes</Label>
                <Textarea
                  id="void-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Provide additional context for this void..."
                  rows={3}
                  data-testid="textarea-void-notes"
                />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} data-testid="button-cancel-void">
            Cancel
          </Button>
          {isVoidable && (
            <Button
              variant="destructive"
              onClick={handleSubmit}
              disabled={voidMutation.isPending || !reasonCategory}
              data-testid="button-confirm-void"
            >
              {voidMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Voiding...
                </>
              ) : (
                <>
                  <Ban className="mr-2 h-4 w-4" />
                  Void Invoice
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
