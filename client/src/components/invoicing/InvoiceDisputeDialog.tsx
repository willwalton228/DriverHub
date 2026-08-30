import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle, CheckCircle, Flag, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

const DISPUTE_CATEGORIES = [
  { value: "pricing", label: "Pricing Issue" },
  { value: "service", label: "Service Issue" },
  { value: "damage", label: "Damage Claim" },
  { value: "duplicate", label: "Duplicate Invoice" },
  { value: "other", label: "Other" },
] as const;

interface Invoice {
  id: string;
  invoiceNumber: string;
  isDisputed?: boolean;
  disputedReasonCategory?: string;
  disputedNotes?: string;
  disputedCreatedAt?: string;
  disputedCreatedBy?: string;
  status: string;
}

interface InvoiceDisputeDialogProps {
  invoice: Invoice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function InvoiceDisputeDialog({ invoice, open, onOpenChange, onSuccess }: InvoiceDisputeDialogProps) {
  const { toast } = useToast();
  const [reasonCategory, setReasonCategory] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const disputeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/corporate/invoicing/invoices/${invoice.id}/dispute`, {
        reasonCategory,
        notes,
      });
    },
    onSuccess: () => {
      toast({ title: "Invoice Disputed", description: "The invoice has been marked as disputed." });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices", invoice.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices", invoice.id, "activities"] });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!reasonCategory) {
      toast({ title: "Error", description: "Please select a dispute reason category.", variant: "destructive" });
      return;
    }
    disputeMutation.mutate();
  };

  const handleClose = () => {
    setReasonCategory("");
    setNotes("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-destructive" />
            Mark Invoice as Disputed
          </DialogTitle>
          <DialogDescription>
            Flag invoice <strong>{invoice.invoiceNumber}</strong> as disputed. This will stop automated reminder emails.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Alert variant="default" className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertDescription className="text-amber-800 dark:text-amber-200">
              Disputed invoices remain payable but are excluded from automated collection reminders.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="reason-category" required>Dispute Reason Category</Label>
            <Select value={reasonCategory} onValueChange={setReasonCategory}>
              <SelectTrigger id="reason-category" data-testid="select-dispute-category">
                <SelectValue placeholder="Select a reason category" />
              </SelectTrigger>
              <SelectContent>
                {DISPUTE_CATEGORIES.map((category) => (
                  <SelectItem key={category.value} value={category.value}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dispute-notes">Notes (Optional)</Label>
            <Textarea
              id="dispute-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Provide additional details about the dispute..."
              rows={3}
              data-testid="textarea-dispute-notes"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} data-testid="button-cancel-dispute">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={disputeMutation.isPending || !reasonCategory}
            data-testid="button-submit-dispute"
          >
            {disputeMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Flag className="mr-2 h-4 w-4" />
                Mark as Disputed
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ResolveDisputeDialogProps {
  invoice: Invoice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ResolveDisputeDialog({ invoice, open, onOpenChange, onSuccess }: ResolveDisputeDialogProps) {
  const { toast } = useToast();

  const resolveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/corporate/invoicing/invoices/${invoice.id}/resolve-dispute`, {});
    },
    onSuccess: () => {
      toast({ title: "Dispute Resolved", description: "The invoice dispute has been resolved." });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices", invoice.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices", invoice.id, "activities"] });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const getCategoryLabel = (category?: string) => {
    return DISPUTE_CATEGORIES.find(c => c.value === category)?.label || category || "Unknown";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Resolve Dispute
          </DialogTitle>
          <DialogDescription>
            Resolve the dispute on invoice <strong>{invoice.invoiceNumber}</strong>. This will restore the invoice to its appropriate status.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Dispute Category:</span>
              <Badge variant="secondary" data-testid="badge-dispute-category">
                {getCategoryLabel(invoice.disputedReasonCategory)}
              </Badge>
            </div>
            {invoice.disputedNotes && (
              <div>
                <span className="text-sm text-muted-foreground">Notes:</span>
                <p className="text-sm mt-1" data-testid="text-dispute-notes">{invoice.disputedNotes}</p>
              </div>
            )}
            {invoice.disputedCreatedAt && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Disputed on:</span>
                <span data-testid="text-dispute-date">{format(new Date(invoice.disputedCreatedAt), "PPp")}</span>
              </div>
            )}
          </div>

          <Alert>
            <AlertDescription>
              The invoice status will be restored based on the current balance and due date.
            </AlertDescription>
          </Alert>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-resolve">
            Cancel
          </Button>
          <Button
            onClick={() => resolveMutation.mutate()}
            disabled={resolveMutation.isPending}
            data-testid="button-confirm-resolve"
          >
            {resolveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resolving...
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Resolve Dispute
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DisputeBadgeProps {
  invoice: Invoice;
  showDetails?: boolean;
}

export function DisputeBadge({ invoice, showDetails = false }: DisputeBadgeProps) {
  if (!invoice.isDisputed && invoice.status !== 'disputed') {
    return null;
  }

  const getCategoryLabel = (category?: string) => {
    return DISPUTE_CATEGORIES.find(c => c.value === category)?.label || category || "Disputed";
  };

  return (
    <Badge variant="destructive" className="gap-1" data-testid={`badge-disputed-${invoice.id}`}>
      <Flag className="h-3 w-3" />
      {showDetails && invoice.disputedReasonCategory ? getCategoryLabel(invoice.disputedReasonCategory) : "Disputed"}
    </Badge>
  );
}
