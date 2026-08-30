import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatDate } from "@/lib/dateFormat";
import { CheckCircle, XCircle, Clock, Send, ArrowLeft, History, Loader2, AlertCircle, FileCheck } from "lucide-react";
import { useState } from "react";

interface InvoiceApprovalWorkflowProps {
  invoiceId: string;
  invoiceNumber: string;
  approvalWorkflowState: string | null;
  userRole: string | null;
  onApprovalChange?: () => void;
  compact?: boolean;
}

const rejectionSchema = z.object({
  reason: z.string().min(1, "Rejection reason is required"),
  comment: z.string().min(5, "Please provide a detailed comment (at least 5 characters)"),
});

const REJECTION_REASONS = [
  { value: 'pricing_error', label: 'Pricing Error' },
  { value: 'missing_info', label: 'Missing Information' },
  { value: 'incorrect_customer', label: 'Incorrect Customer' },
  { value: 'duplicate', label: 'Duplicate Invoice' },
  { value: 'other', label: 'Other' },
];

export function getApprovalStateColor(state: string | null): string {
  switch (state) {
    case 'draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    case 'pending_approval': return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
    case 'approved': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'rejected': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  }
}

export function getApprovalStateLabel(state: string | null): string {
  switch (state) {
    case 'draft': return 'Draft';
    case 'pending_approval': return 'Pending Approval';
    case 'approved': return 'Approved';
    case 'rejected': return 'Rejected';
    default: return 'Draft';
  }
}

export function ApprovalStateBadge({ state }: { state: string | null }) {
  const color = getApprovalStateColor(state);
  const label = getApprovalStateLabel(state);
  const Icon = state === 'approved' ? CheckCircle : 
               state === 'rejected' ? XCircle : 
               state === 'pending_approval' ? Clock : FileCheck;
  
  return (
    <Badge className={`${color} gap-1`} data-testid={`badge-approval-state-${state}`}>
      <Icon className="w-3 h-3" />
      {label}
    </Badge>
  );
}

export function InvoiceApprovalWorkflow({
  invoiceId,
  invoiceNumber,
  approvalWorkflowState,
  userRole,
  onApprovalChange,
  compact = false,
}: InvoiceApprovalWorkflowProps) {
  const { toast } = useToast();
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  
  const state = approvalWorkflowState || 'draft';
  const isFinanceOrAdmin = userRole === 'admin' || userRole === 'finance';
  const canSubmitForApproval = ['draft', 'rejected'].includes(state);
  const canApprove = state === 'pending_approval' && isFinanceOrAdmin;
  const canReject = state === 'pending_approval' && isFinanceOrAdmin;
  const canReturnToDraft = (state === 'rejected') || (state === 'pending_approval' && isFinanceOrAdmin);

  const form = useForm<z.infer<typeof rejectionSchema>>({
    resolver: zodResolver(rejectionSchema),
    defaultValues: {
      reason: '',
      comment: '',
    },
  });

  const submitForApprovalMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/corporate/invoicing/invoices/${invoiceId}/submit-for-approval`);
    },
    onSuccess: () => {
      toast({ title: "Invoice submitted for approval", description: "Finance team will be notified" });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices', invoiceId] });
      onApprovalChange?.();
    },
    onError: (error: any) => {
      toast({ title: "Failed to submit", description: error.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/corporate/invoicing/invoices/${invoiceId}/approve`);
    },
    onSuccess: () => {
      toast({ title: "Invoice approved", description: "Invoice can now be sent to customer" });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices', invoiceId] });
      onApprovalChange?.();
    },
    onError: (error: any) => {
      toast({ title: "Failed to approve", description: error.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (data: { reason: string; comment: string }) => {
      return await apiRequest('POST', `/api/corporate/invoicing/invoices/${invoiceId}/reject`, data);
    },
    onSuccess: () => {
      toast({ title: "Invoice rejected", description: "Submitter will be notified" });
      setShowRejectDialog(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices', invoiceId] });
      onApprovalChange?.();
    },
    onError: (error: any) => {
      toast({ title: "Failed to reject", description: error.message, variant: "destructive" });
    },
  });

  const returnToDraftMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/corporate/invoicing/invoices/${invoiceId}/return-to-draft`);
    },
    onSuccess: () => {
      toast({ title: "Invoice returned to draft" });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/invoices', invoiceId] });
      onApprovalChange?.();
    },
    onError: (error: any) => {
      toast({ title: "Failed to return to draft", description: error.message, variant: "destructive" });
    },
  });

  const { data: approvalHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['/api/corporate/invoicing/invoices', invoiceId, 'approval-history'],
    enabled: showHistoryDialog,
  });

  const onReject = (values: z.infer<typeof rejectionSchema>) => {
    rejectMutation.mutate(values);
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <ApprovalStateBadge state={state} />
        {canSubmitForApproval && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => submitForApprovalMutation.mutate()}
            disabled={submitForApprovalMutation.isPending}
            data-testid={`button-submit-approval-${invoiceId}`}
          >
            {submitForApprovalMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          </Button>
        )}
        {canApprove && (
          <>
            <Button
              size="sm"
              variant="default"
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              data-testid={`button-approve-${invoiceId}`}
            >
              {approveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowRejectDialog(true)}
              data-testid={`button-reject-${invoiceId}`}
            >
              <XCircle className="w-3 h-3" />
            </Button>
          </>
        )}
        {canReturnToDraft && !canApprove && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => returnToDraftMutation.mutate()}
            disabled={returnToDraftMutation.isPending}
            data-testid={`button-return-draft-${invoiceId}`}
          >
            {returnToDraftMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowLeft className="w-3 h-3" />}
          </Button>
        )}

        <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Invoice {invoiceNumber}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onReject)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rejection Reason</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-rejection-reason">
                            <SelectValue placeholder="Select a reason" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {REJECTION_REASONS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="comment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Comment</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Provide details about why this invoice is being rejected..."
                          data-testid="input-rejection-comment"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline" type="button">Cancel</Button>
                  </DialogClose>
                  <Button type="submit" variant="destructive" disabled={rejectMutation.isPending} data-testid="button-confirm-reject">
                    {rejectMutation.isPending ? 'Rejecting...' : 'Reject Invoice'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Approval Status:</span>
          <ApprovalStateBadge state={state} />
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowHistoryDialog(true)}
          data-testid="button-view-approval-history"
        >
          <History className="w-4 h-4 mr-1" />
          History
        </Button>
      </div>

      {state === 'rejected' && (
        <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800 dark:text-red-200">Invoice Rejected</p>
              <p className="text-sm text-red-700 dark:text-red-300">This invoice was rejected and needs to be revised before resubmitting.</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {canSubmitForApproval && (
          <Button
            onClick={() => submitForApprovalMutation.mutate()}
            disabled={submitForApprovalMutation.isPending}
            data-testid="button-submit-for-approval"
          >
            {submitForApprovalMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Submit for Approval
          </Button>
        )}

        {canApprove && (
          <Button
            variant="default"
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
            data-testid="button-approve-invoice"
          >
            {approveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4 mr-2" />
            )}
            Approve
          </Button>
        )}

        {canReject && (
          <Button
            variant="destructive"
            onClick={() => setShowRejectDialog(true)}
            data-testid="button-reject-invoice"
          >
            <XCircle className="w-4 h-4 mr-2" />
            Reject
          </Button>
        )}

        {canReturnToDraft && (
          <Button
            variant="outline"
            onClick={() => returnToDraftMutation.mutate()}
            disabled={returnToDraftMutation.isPending}
            data-testid="button-return-to-draft"
          >
            {returnToDraftMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ArrowLeft className="w-4 h-4 mr-2" />
            )}
            Return to Draft
          </Button>
        )}
      </div>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Invoice {invoiceNumber}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onReject)} className="space-y-4">
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rejection Reason</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-rejection-reason-full">
                          <SelectValue placeholder="Select a reason" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {REJECTION_REASONS.map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="comment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Comment</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Provide details about why this invoice is being rejected..."
                        data-testid="input-rejection-comment-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" type="button">Cancel</Button>
                </DialogClose>
                <Button type="submit" variant="destructive" disabled={rejectMutation.isPending} data-testid="button-confirm-reject-full">
                  {rejectMutation.isPending ? 'Rejecting...' : 'Reject Invoice'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Approval History - {invoiceNumber}</DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : approvalHistory?.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No approval history yet</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {approvalHistory?.map((entry: any) => (
                <div key={entry.id} className="p-3 border rounded-md">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {entry.action === 'approved' && <CheckCircle className="w-4 h-4 text-green-600" />}
                      {entry.action === 'rejected' && <XCircle className="w-4 h-4 text-red-600" />}
                      {entry.action === 'submitted_for_approval' && <Send className="w-4 h-4 text-blue-600" />}
                      {entry.action === 'returned_to_draft' && <ArrowLeft className="w-4 h-4 text-gray-600" />}
                      <span className="font-medium capitalize">{entry.action.replace(/_/g, ' ')}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(entry.performedAt)}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    By: {entry.performedByName || entry.performedBy}
                  </div>
                  {entry.rejectionReason && (
                    <div className="mt-2 text-sm">
                      <span className="font-medium">Reason:</span>{' '}
                      {REJECTION_REASONS.find(r => r.value === entry.rejectionReason)?.label || entry.rejectionReason}
                    </div>
                  )}
                  {entry.rejectionComment && (
                    <div className="mt-1 text-sm text-muted-foreground">
                      {entry.rejectionComment}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
