import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, RotateCcw, Edit2, UserX, Trash2, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentAdjustmentAction = "edit" | "reverse" | "remove" | "reassign";

export interface PaymentForAdjustment {
  id: string;
  paymentNumber?: string;
  amount: string;
  status?: string;
  paymentMethod?: string;
  paymentDate?: string;
  customerId?: string;
  applicationId?: string; // Present when opened from an invoice payment row
  isReversed?: boolean;
  isReversal?: boolean;
}

interface PaymentAdjustmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: PaymentForAdjustment | null;
  /** If an invoiceId is provided, the "Remove from Invoice" tab is available */
  invoiceId?: string | null;
  /** Default action to open on */
  defaultAction?: PaymentAdjustmentAction;
  /** Called after a successful action so the parent can refresh */
  onSuccess?: (action: PaymentAdjustmentAction) => void;
  /** User's role for client-side guard */
  userRole?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CONTROLLER_ROLES = new Set(["super_user", "super_admin", "admin", "corporate_admin", "finance"]);

function isPaymentController(role?: string | null): boolean {
  return !!role && CONTROLLER_ROLES.has(role);
}

const ACTION_META: Record<PaymentAdjustmentAction, { label: string; icon: any; color: string }> = {
  edit: { label: "Edit Amount / Details", icon: Edit2, color: "text-blue-600 dark:text-blue-400" },
  reverse: { label: "Reverse Payment", icon: RotateCcw, color: "text-red-600 dark:text-red-400" },
  remove: { label: "Remove from Invoice", icon: Trash2, color: "text-orange-600 dark:text-orange-400" },
  reassign: { label: "Reassign to Customer", icon: UserX, color: "text-violet-600 dark:text-violet-400" },
};

// ─── Schemas ──────────────────────────────────────────────────────────────────

const baseSchema = z.object({
  reason: z.string().min(3, "Reason must be at least 3 characters."),
});

const editSchema = baseSchema.extend({
  amount: z.string().optional(),
  memo: z.string().optional(),
  referenceNumber: z.string().optional(),
});

const reassignSchema = baseSchema.extend({
  newCustomerId: z.string().min(1, "Please select a customer."),
});

// ─── Warning Banner ───────────────────────────────────────────────────────────

function FinancialWarningBanner({ action }: { action: PaymentAdjustmentAction }) {
  const messages: Record<PaymentAdjustmentAction, string> = {
    edit: "Editing a payment amount affects invoice balances and financial reports.",
    reverse: "Reversal creates a new Reversal Entry and removes all invoice applications. The original payment record is preserved for audit.",
    remove: "Removing a payment from an invoice will reopen the invoice balance.",
    reassign: "Reassigning a payment to another customer removes all existing invoice applications. This action cannot be undone.",
  };
  return (
    <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          This action will impact financial records
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{messages[action]}</p>
      </div>
    </div>
  );
}

// ─── Action Tab ───────────────────────────────────────────────────────────────

function ActionTab({
  action,
  current,
  onClick,
  disabled,
}: {
  action: PaymentAdjustmentAction;
  current: PaymentAdjustmentAction;
  onClick: () => void;
  disabled?: boolean;
}) {
  const meta = ACTION_META[action];
  const Icon = meta.icon;
  const isActive = action === current;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-md text-xs font-medium transition-colors border ${
        isActive
          ? "border-primary bg-primary/10 text-primary"
          : "border-transparent text-muted-foreground hover-elevate"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
      data-testid={`tab-action-${action}`}
    >
      <Icon className={`w-4 h-4 ${isActive ? "text-primary" : meta.color}`} />
      <span>{meta.label}</span>
    </button>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function PaymentAdjustmentModal({
  open,
  onOpenChange,
  payment,
  invoiceId,
  defaultAction = "edit",
  onSuccess,
  userRole,
}: PaymentAdjustmentModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<PaymentAdjustmentAction>(defaultAction);
  const [confirmed, setConfirmed] = useState(false);

  const canAct = isPaymentController(userRole);

  // ── Edit form ──
  const editForm = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: { amount: payment?.amount ?? "", memo: "", referenceNumber: "", reason: "" },
  });

  // ── Reverse form ──
  const reverseForm = useForm<z.infer<typeof baseSchema>>({
    resolver: zodResolver(baseSchema),
    defaultValues: { reason: "" },
  });

  // ── Remove form ──
  const removeForm = useForm<z.infer<typeof baseSchema>>({
    resolver: zodResolver(baseSchema),
    defaultValues: { reason: "" },
  });

  // ── Reassign form ──
  const reassignForm = useForm<z.infer<typeof reassignSchema>>({
    resolver: zodResolver(reassignSchema),
    defaultValues: { newCustomerId: "", reason: "" },
  });

  // Reset confirmed on action change
  function changeAction(next: PaymentAdjustmentAction) {
    setAction(next);
    setConfirmed(false);
  }

  // Customers list for reassign
  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ["/api/corporate/customers"],
    enabled: open && action === "reassign",
  });

  // ── Mutations ──
  const editMutation = useMutation({
    mutationFn: (data: z.infer<typeof editSchema>) =>
      apiRequest("PATCH", `/api/corporate/invoicing/payments/${payment!.id}`, {
        reason: data.reason,
        ...(data.amount ? { amount: data.amount } : {}),
        ...(data.memo ? { memo: data.memo } : {}),
        ...(data.referenceNumber ? { referenceNumber: data.referenceNumber } : {}),
      }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Payment updated", description: "The payment details have been saved." });
      invalidateAndClose("edit");
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const reverseMutation = useMutation({
    mutationFn: (data: z.infer<typeof baseSchema>) =>
      apiRequest("POST", `/api/corporate/invoicing/payments/${payment!.id}/reverse`, { reason: data.reason }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Payment reversed", description: "A reversal entry has been created. The original payment is preserved." });
      invalidateAndClose("reverse");
    },
    onError: (e: any) => toast({ title: "Reversal failed", description: e.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: (data: z.infer<typeof baseSchema>) =>
      apiRequest("DELETE", `/api/corporate/invoicing/payment-applications/${payment!.applicationId}`, { reason: data.reason }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Payment removed", description: "The payment has been removed from this invoice." });
      invalidateAndClose("remove");
    },
    onError: (e: any) => toast({ title: "Remove failed", description: e.message, variant: "destructive" }),
  });

  const reassignMutation = useMutation({
    mutationFn: (data: z.infer<typeof reassignSchema>) =>
      apiRequest("POST", `/api/corporate/invoicing/payments/${payment!.id}/reassign`, { newCustomerId: data.newCustomerId, reason: data.reason }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Payment reassigned", description: "The payment has been reassigned to the new customer." });
      invalidateAndClose("reassign");
    },
    onError: (e: any) => toast({ title: "Reassign failed", description: e.message, variant: "destructive" }),
  });

  function invalidateAndClose(act: PaymentAdjustmentAction) {
    queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices"] });
    queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/payments"] });
    if (invoiceId) {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices", invoiceId, "payments"] });
    }
    onSuccess?.(act);
    onOpenChange(false);
  }

  const isPending =
    editMutation.isPending || reverseMutation.isPending || removeMutation.isPending || reassignMutation.isPending;

  if (!payment) return null;

  const isReversed = payment.isReversed;
  const isReversal = payment.isReversal;
  const hasApplication = !!payment.applicationId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-payment-adjustment">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            Payment Controls
            {payment.paymentNumber && (
              <span className="text-sm font-normal text-muted-foreground">— {payment.paymentNumber}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Payment summary */}
        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-md text-sm">
          <div className="flex-1">
            <span className="font-semibold">${parseFloat(payment.amount || "0").toFixed(2)}</span>
            {payment.paymentMethod && (
              <span className="text-muted-foreground ml-2 capitalize">{payment.paymentMethod.replace(/_/g, " ")}</span>
            )}
            {payment.paymentDate && (
              <span className="text-muted-foreground ml-2">{payment.paymentDate}</span>
            )}
          </div>
          {isReversed && <Badge variant="destructive" className="text-xs">Reversed</Badge>}
          {isReversal && <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs">Reversal Entry</Badge>}
        </div>

        {/* Unauthorized guard */}
        {!canAct ? (
          <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md">
            <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">Access Restricted</p>
              <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                Only Owner (super_user) or Controller (admin/finance) roles may modify payment records.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Action tabs */}
            <div className="flex gap-1.5">
              <ActionTab action="edit" current={action} onClick={() => changeAction("edit")} disabled={isReversed || isReversal} />
              <ActionTab action="reverse" current={action} onClick={() => changeAction("reverse")} disabled={isReversed || isReversal} />
              <ActionTab action="remove" current={action} onClick={() => changeAction("remove")} disabled={!hasApplication} />
              <ActionTab action="reassign" current={action} onClick={() => changeAction("reassign")} disabled={isReversed} />
            </div>

            {/* Warning */}
            <FinancialWarningBanner action={action} />

            {/* Disabled state notices */}
            {(action === "edit" || action === "reverse") && isReversed && (
              <p className="text-sm text-muted-foreground text-center py-2">This payment has already been reversed and cannot be edited or reversed again.</p>
            )}
            {(action === "edit" || action === "reverse") && isReversal && (
              <p className="text-sm text-muted-foreground text-center py-2">This is a reversal entry and cannot be edited or reversed.</p>
            )}
            {action === "remove" && !hasApplication && (
              <p className="text-sm text-muted-foreground text-center py-2">This action is only available when viewing a payment applied to a specific invoice.</p>
            )}

            {/* ── EDIT ACTION ── */}
            {action === "edit" && !isReversed && !isReversal && (
              <form onSubmit={editForm.handleSubmit((d) => editMutation.mutate(d))} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="edit-amount">Amount ($)</Label>
                    <Input id="edit-amount" {...editForm.register("amount")} placeholder={payment.amount} data-testid="input-edit-amount" />
                    {editForm.formState.errors.amount && (
                      <p className="text-xs text-red-600">{editForm.formState.errors.amount.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-ref">Reference #</Label>
                    <Input id="edit-ref" {...editForm.register("referenceNumber")} placeholder="Optional" data-testid="input-edit-reference" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-memo">Memo</Label>
                  <Input id="edit-memo" {...editForm.register("memo")} placeholder="Optional memo update" data-testid="input-edit-memo" />
                </div>
                <ReasonField register={editForm.register("reason")} error={editForm.formState.errors.reason?.message} />
                <ConfirmToggle confirmed={confirmed} onChange={setConfirmed} />
                <DialogFooter className="gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                  <Button type="submit" disabled={isPending || !confirmed} data-testid="btn-submit-edit">
                    {isPending ? "Saving…" : "Save Changes"}
                  </Button>
                </DialogFooter>
              </form>
            )}

            {/* ── REVERSE ACTION ── */}
            {action === "reverse" && !isReversed && !isReversal && (
              <form onSubmit={reverseForm.handleSubmit((d) => reverseMutation.mutate(d))} className="space-y-4">
                <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-800 dark:text-red-300">
                  <p className="font-medium">A new Reversal Entry will be created for <strong>${parseFloat(payment.amount || "0").toFixed(2)}</strong>.</p>
                  <p className="mt-1 text-xs">The original payment remains in the system for audit purposes. All invoice applications will be removed.</p>
                </div>
                <ReasonField register={reverseForm.register("reason")} error={reverseForm.formState.errors.reason?.message} />
                <ConfirmToggle confirmed={confirmed} onChange={setConfirmed} />
                <DialogFooter className="gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                  <Button type="submit" variant="destructive" disabled={isPending || !confirmed} data-testid="btn-submit-reverse">
                    {isPending ? "Reversing…" : "Create Reversal Entry"}
                  </Button>
                </DialogFooter>
              </form>
            )}

            {/* ── REMOVE FROM INVOICE ACTION ── */}
            {action === "remove" && hasApplication && (
              <form onSubmit={removeForm.handleSubmit((d) => removeMutation.mutate(d))} className="space-y-4">
                <div className="p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-md text-sm text-orange-800 dark:text-orange-300">
                  <p className="font-medium">This payment will be removed from the invoice.</p>
                  <p className="text-xs mt-1">The payment will remain in the system and can be re-applied to another invoice.</p>
                </div>
                <ReasonField register={removeForm.register("reason")} error={removeForm.formState.errors.reason?.message} />
                <ConfirmToggle confirmed={confirmed} onChange={setConfirmed} />
                <DialogFooter className="gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                  <Button type="submit" variant="destructive" disabled={isPending || !confirmed} data-testid="btn-submit-remove">
                    {isPending ? "Removing…" : "Remove from Invoice"}
                  </Button>
                </DialogFooter>
              </form>
            )}

            {/* ── REASSIGN ACTION ── */}
            {action === "reassign" && !isReversed && (
              <form onSubmit={reassignForm.handleSubmit((d) => reassignMutation.mutate(d))} className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="reassign-customer">New Customer</Label>
                  <Select
                    onValueChange={(v) => reassignForm.setValue("newCustomerId", v)}
                    defaultValue=""
                  >
                    <SelectTrigger id="reassign-customer" data-testid="select-reassign-customer">
                      <SelectValue placeholder="Select customer…" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers
                        .filter((c: any) => c.id !== payment.customerId)
                        .map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name || c.companyName || c.id}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {reassignForm.formState.errors.newCustomerId && (
                    <p className="text-xs text-red-600">{reassignForm.formState.errors.newCustomerId.message}</p>
                  )}
                </div>
                <ReasonField register={reassignForm.register("reason")} error={reassignForm.formState.errors.reason?.message} />
                <ConfirmToggle confirmed={confirmed} onChange={setConfirmed} />
                <DialogFooter className="gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                  <Button type="submit" disabled={isPending || !confirmed} data-testid="btn-submit-reassign">
                    {isPending ? "Reassigning…" : "Reassign Payment"}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </>
        )}

        {!canAct && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function ReasonField({ register, error }: { register: any; error?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor="reason-field">
        Reason <span className="text-red-500">*</span>
      </Label>
      <Textarea
        id="reason-field"
        {...register}
        placeholder="Provide a detailed reason for this action…"
        className="min-h-20"
        data-testid="textarea-adjustment-reason"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ConfirmToggle({ confirmed, onChange }: { confirmed: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm font-medium" data-testid="checkbox-confirm-action">
      <input
        type="checkbox"
        checked={confirmed}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-muted-foreground accent-primary"
      />
      <span>I understand this action will impact financial records</span>
    </label>
  );
}
