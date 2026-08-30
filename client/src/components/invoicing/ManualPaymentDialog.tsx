import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, DollarSign, FileText, AlertCircle, Plus, Trash2, Paperclip, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

const PAYMENT_METHODS = [
  { value: "check", label: "Check" },
  { value: "wire", label: "Wire Transfer" },
  { value: "ach_manual", label: "ACH (Manual Entry)" },
  { value: "other", label: "Other" },
] as const;

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerName?: string;
  totalAmount: string;
  balanceDue?: string;
  status: string;
  dueDate: string;
}

interface Customer {
  id: string;
  customerName: string;
  name?: string;
  companyName?: string;
}

interface Allocation {
  invoiceId: string;
  invoiceNumber: string;
  amount: string;
  maxAmount: string;
}

interface ManualPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId?: string;
  preselectedInvoice?: Invoice;
  onSuccess?: () => void;
}

export function ManualPaymentDialog({ 
  open, 
  onOpenChange, 
  customerId: initialCustomerId,
  preselectedInvoice,
  onSuccess 
}: ManualPaymentDialogProps) {
  const { toast } = useToast();
  
  // Form state
  const [customerId, setCustomerId] = useState<string>(initialCustomerId || "");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [referenceNumber, setReferenceNumber] = useState<string>("");
  const [receivedDate, setReceivedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  
  // Method-specific fields
  const [checkNumber, setCheckNumber] = useState<string>("");
  const [checkDate, setCheckDate] = useState<string>("");
  const [bankName, setBankName] = useState<string>("");
  const [wireDetails, setWireDetails] = useState<string>("");
  const [achManualDetails, setAchManualDetails] = useState<string>("");

  // Attachment
  const [attachmentUrl, setAttachmentUrl] = useState<string>("");
  const [attachmentFilename, setAttachmentFilename] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Allocations
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [showAllocationSection, setShowAllocationSection] = useState(!!preselectedInvoice);
  const [depositBatchId, setDepositBatchId] = useState<string>("");

  // Fetch customers
  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/corporate/customers"],
    enabled: open && !initialCustomerId,
  });

  // Fetch available deposit batches (draft/balanced only)
  const { data: allDepositBatches = [] } = useQuery<any[]>({
    queryKey: ["/api/corporate/invoicing/deposit-batches"],
    enabled: open,
  });
  const availableDepositBatches = (allDepositBatches as any[]).filter((b: any) => b.status === 'draft' || b.status === 'balanced');

  // Fetch invoices for selected customer
  const { data: customerInvoices } = useQuery<Invoice[]>({
    queryKey: ["/api/corporate/invoicing/invoices", { customerId, status: "outstanding" }],
    queryFn: async () => {
      const response = await fetch(`/api/corporate/invoicing/invoices?customerId=${customerId}&status=pending,sent,partially_paid,overdue`);
      if (!response.ok) throw new Error("Failed to fetch invoices");
      return response.json();
    },
    enabled: !!customerId && open,
  });

  // Initialize with preselected invoice
  useEffect(() => {
    if (preselectedInvoice && open) {
      const balance = preselectedInvoice.balanceDue || preselectedInvoice.totalAmount;
      setAllocations([{
        invoiceId: preselectedInvoice.id,
        invoiceNumber: preselectedInvoice.invoiceNumber,
        amount: balance,
        maxAmount: balance,
      }]);
      setAmount(balance);
      setShowAllocationSection(true);
    }
  }, [preselectedInvoice, open]);

  // Update customerId when initialCustomerId changes
  useEffect(() => {
    if (initialCustomerId) {
      setCustomerId(initialCustomerId);
    }
  }, [initialCustomerId]);

  const handleFileUpload = async (file: File) => {
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Only PDF and image files are allowed.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 10MB.", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const response = await fetch('/api/corporate/invoicing/payments/upload-attachment', {
        method: 'POST',
        headers: { 'Content-Type': file.type, 'X-Filename': file.name },
        body: buffer,
        credentials: 'include',
      });
      if (!response.ok) throw new Error("Upload failed");
      const result = await response.json();
      setAttachmentUrl(result.url);
      setAttachmentFilename(file.name);
      toast({ title: "Attachment uploaded" });
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Soft duplicate warning state
  const [softDuplicateWarning, setSoftDuplicateWarning] = useState<{
    message: string; duplicateId: string | null;
  } | null>(null);

  const createPaymentMutation = useMutation({
    mutationFn: async (opts?: { force?: boolean }) => {
      const resp = await apiRequest('POST', '/api/corporate/invoicing/payments/manual', {
        customerId,
        paymentMethod,
        referenceNumber,
        receivedDate,
        amount,
        notes,
        force: opts?.force || false,
        depositBatchId: depositBatchId || undefined,
        checkNumber: paymentMethod === 'check' ? checkNumber : undefined,
        checkDate: paymentMethod === 'check' ? checkDate : undefined,
        bankName: paymentMethod === 'check' ? bankName : undefined,
        wireDetails: paymentMethod === 'wire' ? wireDetails : undefined,
        achManualDetails: paymentMethod === 'ach_manual' ? achManualDetails : undefined,
        attachmentUrl: attachmentUrl || undefined,
        attachmentFilename: attachmentFilename || undefined,
        allocations: allocations.length > 0 ? allocations.map(a => ({
          invoiceId: a.invoiceId,
          amount: a.amount,
        })) : undefined,
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        if (body.error_code === 'SOFT_DUPLICATE_PAYMENT') {
          // Surface as a warning — don't throw, handle via state
          setSoftDuplicateWarning({ message: body.message, duplicateId: body.duplicateId ?? null });
          return null; // signal: handled
        }
        const err: any = new Error(body.message || 'Failed to record payment');
        err.errorCode = body.error_code;
        throw err;
      }
      setSoftDuplicateWarning(null);
      return resp.json();
    },
    onSuccess: (data: any) => {
      if (!data) return; // soft duplicate shown — not a real success
      toast({ 
        title: "Payment Recorded", 
        description: `Manual payment of $${parseFloat(amount).toFixed(2)} has been recorded successfully.` 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/deposit-batches"] });
      if (customerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers", customerId] });
      }
      handleClose();
      onSuccess?.();
    },
    onError: (error: any) => {
      if (error.errorCode === 'DEPOSIT_BATCH_REQUIRED') {
        toast({ title: "Deposit batch required", description: "Your organization requires all payments to be assigned to a deposit batch. Please select a batch before saving.", variant: "destructive" });
      } else if (error.errorCode === 'DUPLICATE_PAYMENT') {
        toast({ title: "Duplicate payment blocked", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const handleSubmit = (opts?: { force?: boolean }) => {
    if (!customerId) {
      toast({ title: "Error", description: "Please select a customer.", variant: "destructive" });
      return;
    }
    if (!paymentMethod) {
      toast({ title: "Error", description: "Please select a payment method.", variant: "destructive" });
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      toast({ title: "Error", description: "Please enter a valid payment amount.", variant: "destructive" });
      return;
    }
    if (!receivedDate) {
      toast({ title: "Error", description: "Please enter the date payment was received.", variant: "destructive" });
      return;
    }
    setSoftDuplicateWarning(null);
    createPaymentMutation.mutate(opts);
  };

  const handleClose = () => {
    setPaymentMethod("");
    setReferenceNumber("");
    setReceivedDate(new Date().toISOString().split('T')[0]);
    setAmount("");
    setNotes("");
    setCheckNumber("");
    setCheckDate("");
    setBankName("");
    setWireDetails("");
    setAchManualDetails("");
    setAttachmentUrl("");
    setAttachmentFilename("");
    setAllocations([]);
    setShowAllocationSection(false);
    setDepositBatchId("");
    setSoftDuplicateWarning(null);
    if (!initialCustomerId) {
      setCustomerId("");
    }
    onOpenChange(false);
  };

  const addAllocation = (invoice: Invoice) => {
    const balance = invoice.balanceDue || invoice.totalAmount;
    if (allocations.find(a => a.invoiceId === invoice.id)) {
      toast({ title: "Already Added", description: "This invoice is already in the allocation list.", variant: "destructive" });
      return;
    }
    setAllocations([...allocations, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: balance,
      maxAmount: balance,
    }]);
  };

  const removeAllocation = (invoiceId: string) => {
    setAllocations(allocations.filter(a => a.invoiceId !== invoiceId));
  };

  const updateAllocationAmount = (invoiceId: string, newAmount: string) => {
    setAllocations(allocations.map(a => 
      a.invoiceId === invoiceId 
        ? { ...a, amount: newAmount }
        : a
    ));
  };

  const totalAllocated = allocations.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
  const paymentAmount = parseFloat(amount) || 0;
  const remainingToAllocate = paymentAmount - totalAllocated;

  const availableInvoices = customerInvoices?.filter(inv => 
    !allocations.find(a => a.invoiceId === inv.id) &&
    ['pending', 'sent', 'partially_paid', 'overdue'].includes(inv.status)
  ) || [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Record Manual Payment
          </DialogTitle>
          <DialogDescription>
            Enter details for an offline payment (check, wire transfer, or manual ACH).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Customer Selection */}
          {!initialCustomerId && (
            <div className="space-y-2">
              <Label htmlFor="customer" required>Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger data-testid="select-customer">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers?.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.customerName || customer.companyName || customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Payment Method */}
          <div className="space-y-2">
            <Label htmlFor="paymentMethod" required>Payment Method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger data-testid="select-payment-method">
                <SelectValue placeholder="Select payment method" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((method) => (
                  <SelectItem key={method.value} value={method.value}>
                    {method.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Received Date */}
            <div className="space-y-2">
              <Label htmlFor="receivedDate" required>Date Received</Label>
              <Input
                id="receivedDate"
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
                data-testid="input-received-date"
              />
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount" required>Amount</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                data-testid="input-amount"
              />
            </div>
          </div>

          {/* Reference Number */}
          <div className="space-y-2">
            <Label htmlFor="referenceNumber">Reference Number</Label>
            <Input
              id="referenceNumber"
              placeholder="Transaction reference, confirmation number, etc."
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              data-testid="input-reference-number"
            />
          </div>

          {/* Check-specific fields */}
          {paymentMethod === 'check' && (
            <Card>
              <CardContent className="pt-4 space-y-4">
                <div className="text-sm font-medium">Check Details</div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="checkNumber">Check Number</Label>
                    <Input
                      id="checkNumber"
                      placeholder="Check #"
                      value={checkNumber}
                      onChange={(e) => setCheckNumber(e.target.value)}
                      data-testid="input-check-number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="checkDate">Check Date</Label>
                    <Input
                      id="checkDate"
                      type="date"
                      value={checkDate}
                      onChange={(e) => setCheckDate(e.target.value)}
                      data-testid="input-check-date"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankName">Bank Name</Label>
                  <Input
                    id="bankName"
                    placeholder="Issuing bank name"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    data-testid="input-bank-name"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Wire-specific fields */}
          {paymentMethod === 'wire' && (
            <Card>
              <CardContent className="pt-4 space-y-2">
                <Label htmlFor="wireDetails">Wire Transfer Details</Label>
                <Textarea
                  id="wireDetails"
                  placeholder="Wire reference, sender bank, SWIFT/BIC, etc."
                  value={wireDetails}
                  onChange={(e) => setWireDetails(e.target.value)}
                  data-testid="input-wire-details"
                />
              </CardContent>
            </Card>
          )}

          {/* ACH-specific fields */}
          {paymentMethod === 'ach_manual' && (
            <Card>
              <CardContent className="pt-4 space-y-2">
                <Label htmlFor="achManualDetails">ACH Transfer Details</Label>
                <Textarea
                  id="achManualDetails"
                  placeholder="ACH trace number, originating bank, etc."
                  value={achManualDetails}
                  onChange={(e) => setAchManualDetails(e.target.value)}
                  data-testid="input-ach-details"
                />
              </CardContent>
            </Card>
          )}

          {/* Deposit Batch Assignment */}
          <div className="space-y-2">
            <Label htmlFor="deposit-batch">Deposit Batch <span className="text-muted-foreground text-xs font-normal">(recommended)</span></Label>
            <Select value={depositBatchId || "__none__"} onValueChange={(v) => setDepositBatchId(v === '__none__' ? '' : v)}>
              <SelectTrigger id="deposit-batch" data-testid="select-manual-payment-batch">
                <SelectValue placeholder="Assign to deposit batch..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— No batch —</SelectItem>
                {availableDepositBatches.map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.batchNumber} ({b.status}){b.depositDate ? ` · ${b.depositDate}` : ''}
                  </SelectItem>
                ))}
                {availableDepositBatches.length === 0 && (
                  <SelectItem value="__empty__" disabled>No open batches — create one first</SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Assign this payment to an open deposit batch for bank reconciliation tracking.</p>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Additional notes or remittance advice..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid="input-notes"
            />
          </div>

          {/* Attachment Upload */}
          <div className="space-y-2">
            <Label>Attachment (check image / remittance advice)</Label>
            {attachmentFilename ? (
              <div className="flex items-center gap-2 p-2 border rounded">
                <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm flex-1 truncate" data-testid="text-attachment-filename">{attachmentFilename}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => { setAttachmentUrl(""); setAttachmentFilename(""); }}
                  data-testid="button-remove-attachment"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                  data-testid="input-file-attachment"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  data-testid="button-upload-attachment"
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Paperclip className="h-4 w-4 mr-1" />
                  )}
                  {isUploading ? "Uploading..." : "Attach File"}
                </Button>
                <span className="text-xs text-muted-foreground">PDF or image, max 10MB</span>
              </div>
            )}
          </div>

          {/* Invoice Allocation Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Apply to Invoices</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAllocationSection(!showAllocationSection)}
                data-testid="button-toggle-allocation"
              >
                {showAllocationSection ? "Hide" : "Show"} Allocation
              </Button>
            </div>

            {showAllocationSection && (
              <Card>
                <CardContent className="pt-4 space-y-4">
                  {/* Allocation Summary */}
                  {amount && (
                    <div className="flex items-center justify-between text-sm bg-muted p-2 rounded">
                      <span>Payment Amount: <strong>${paymentAmount.toFixed(2)}</strong></span>
                      <span>
                        Allocated: <strong>${totalAllocated.toFixed(2)}</strong>
                        {remainingToAllocate > 0 && (
                          <span className="text-muted-foreground ml-2">
                            (${remainingToAllocate.toFixed(2)} unallocated)
                          </span>
                        )}
                      </span>
                    </div>
                  )}

                  {/* Current Allocations */}
                  {allocations.length > 0 && (
                    <div className="space-y-2">
                      {allocations.map((allocation) => (
                        <div key={allocation.invoiceId} className="flex items-center gap-2 p-2 border rounded">
                          <div className="flex-1">
                            <span className="font-medium">{allocation.invoiceNumber}</span>
                            <span className="text-sm text-muted-foreground ml-2">
                              (max: ${parseFloat(allocation.maxAmount).toFixed(2)})
                            </span>
                          </div>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max={allocation.maxAmount}
                            className="w-28"
                            value={allocation.amount}
                            onChange={(e) => updateAllocationAmount(allocation.invoiceId, e.target.value)}
                            data-testid={`input-allocation-${allocation.invoiceId}`}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeAllocation(allocation.invoiceId)}
                            data-testid={`button-remove-allocation-${allocation.invoiceId}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Available Invoices to Add */}
                  {customerId && availableInvoices.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">Add invoices to allocate:</div>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {availableInvoices.map((invoice) => (
                          <div 
                            key={invoice.id} 
                            className="flex items-center justify-between p-2 border rounded hover-elevate cursor-pointer"
                            onClick={() => addAllocation(invoice)}
                            data-testid={`button-add-invoice-${invoice.id}`}
                          >
                            <div>
                              <span className="font-medium">{invoice.invoiceNumber}</span>
                              <Badge variant="outline" className="ml-2">{invoice.status}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm">${parseFloat(invoice.balanceDue || invoice.totalAmount).toFixed(2)}</span>
                              <Plus className="h-4 w-4" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {customerId && availableInvoices.length === 0 && allocations.length === 0 && (
                    <div className="text-sm text-muted-foreground text-center py-4">
                      No outstanding invoices found for this customer.
                    </div>
                  )}

                  {!customerId && (
                    <div className="text-sm text-muted-foreground text-center py-4">
                      Select a customer to see available invoices.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Validation Warning */}
          {totalAllocated > paymentAmount && paymentAmount > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Total allocation (${totalAllocated.toFixed(2)}) exceeds payment amount (${paymentAmount.toFixed(2)}).
              </AlertDescription>
            </Alert>
          )}

          {/* Soft Duplicate Warning */}
          {softDuplicateWarning && (
            <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Possible Duplicate Payment Detected</p>
                  <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">{softDuplicateWarning.message}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setSoftDuplicateWarning(null)} data-testid="button-dismiss-duplicate-warning">
                  Review
                </Button>
                <Button size="sm" className="bg-amber-700 text-white" onClick={() => handleSubmit({ force: true })} disabled={createPaymentMutation.isPending} data-testid="button-force-post-payment">
                  Post Anyway
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} data-testid="button-cancel">
            Cancel
          </Button>
          <Button 
            onClick={() => handleSubmit()} 
            disabled={createPaymentMutation.isPending || (totalAllocated > paymentAmount && paymentAmount > 0) || !!softDuplicateWarning}
            data-testid="button-submit-payment"
          >
            {createPaymentMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Recording...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Record Payment
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
