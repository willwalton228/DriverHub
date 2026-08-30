import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Landmark, Plus, Trash2, Star, Loader2, ShieldCheck, Clock, AlertTriangle, CheckCircle2, CreditCard,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface Props {
  customerId: string;
  customerName?: string;
}

interface SavedMethod {
  id: string;
  methodType: "ach" | "card";
  displayName: string | null;
  last4: string | null;
  bankName: string | null;
  accountType: string | null;
  isDefault: boolean;
  isVerified: boolean;
  verificationStatus: string | null;
  createdAt: string;
}

interface AutopaySettings {
  autopayEnabled: boolean;
  autopayMethod: string | null;
  autopayTrigger: string | null;
  autopayPaymentMethodId: string | null;
  autopayDisabledAt: string | null;
  autopayDisabledReason: string | null;
}

const enrollSchema = z.object({
  bankName: z.string().min(1, "Bank name is required"),
  last4: z
    .string()
    .min(4, "Must be exactly 4 digits")
    .max(4, "Must be exactly 4 digits")
    .regex(/^\d{4}$/, "Must be 4 digits"),
  accountType: z.enum(["checking", "savings"], { required_error: "Select account type" }),
  displayName: z.string().optional(),
  isDefault: z.boolean().default(false),
});
type EnrollForm = z.infer<typeof enrollSchema>;

function verificationBadge(method: SavedMethod) {
  if (method.isVerified) {
    return (
      <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 dark:bg-green-950 dark:text-green-400 dark:border-green-700">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        Verified
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-700">
      <Clock className="w-3 h-3 mr-1" />
      Pending
    </Badge>
  );
}

export function AutopayEnrollmentPanel({ customerId, customerName }: Props) {
  const { toast } = useToast();
  const [showEnrollDialog, setShowEnrollDialog] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const methodsKey = ["/api/customers", customerId, "payment-methods"];
  const autopayKey = ["/api/customers", customerId, "autopay"];

  const { data: methods = [], isLoading: methodsLoading } = useQuery<SavedMethod[]>({
    queryKey: methodsKey,
    queryFn: () =>
      fetch(`/api/customers/${customerId}/payment-methods`, { credentials: "include" }).then((r) => r.json()),
  });

  const { data: autopay, isLoading: autopayLoading } = useQuery<AutopaySettings>({
    queryKey: autopayKey,
    queryFn: () =>
      fetch(`/api/customers/${customerId}/autopay`, { credentials: "include" }).then((r) => {
        if (!r.ok) return { autopayEnabled: false, autopayMethod: "ach", autopayTrigger: "on_due_date", autopayPaymentMethodId: null, autopayDisabledAt: null, autopayDisabledReason: null };
        return r.json();
      }),
  });

  // ── Enrollment form ──────────────────────────────────────────────
  const form = useForm<EnrollForm>({
    resolver: zodResolver(enrollSchema),
    defaultValues: { bankName: "", last4: "", accountType: "checking", displayName: "", isDefault: false },
  });

  const enrollMutation = useMutation({
    mutationFn: (data: EnrollForm) =>
      apiRequest("POST", `/api/customers/${customerId}/payment-methods`, {
        methodType: "ach",
        bankName: data.bankName,
        last4: data.last4,
        accountType: data.accountType,
        displayName: data.displayName || `${data.bankName} ****${data.last4}`,
        isDefault: data.isDefault,
        isVerified: true,
        verificationStatus: "verified",
        verificationMethod: "manual_admin",
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: methodsKey });
      setShowEnrollDialog(false);
      form.reset();
      toast({ title: "ACH account saved", description: "The bank account has been enrolled for this customer." });
    },
    onError: (err: any) => {
      toast({ title: "Enrollment failed", description: err.message || "Could not save the account.", variant: "destructive" });
    },
  });

  // ── Delete method ────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (methodId: string) =>
      apiRequest("DELETE", `/api/customers/${customerId}/payment-methods/${methodId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: methodsKey });
      setDeletingId(null);
      toast({ title: "Account removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove account", variant: "destructive" });
      setDeletingId(null);
    },
  });

  // ── Set default ──────────────────────────────────────────────────
  const setDefaultMutation = useMutation({
    mutationFn: (methodId: string) =>
      apiRequest("POST", `/api/customers/${customerId}/payment-methods/${methodId}/set-default`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: methodsKey });
      toast({ title: "Default account updated" });
    },
    onError: () => {
      toast({ title: "Failed to update default", variant: "destructive" });
    },
  });

  // ── Autopay toggle / settings ───────────────────────────────────
  const [autopayDraft, setAutopayDraft] = useState<{
    enabled: boolean;
    trigger: string;
    methodId: string;
  } | null>(null);

  const resolvedAutopay = autopayDraft ?? {
    enabled: autopay?.autopayEnabled ?? false,
    trigger: autopay?.autopayTrigger ?? "on_due_date",
    methodId: autopay?.autopayPaymentMethodId ?? "",
  };

  const autopayMutation = useMutation({
    mutationFn: (payload: { autopayEnabled: boolean; autopayTrigger?: string; autopayPaymentMethodId?: string }) =>
      apiRequest("PATCH", `/api/customers/${customerId}/autopay`, payload).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: autopayKey });
      setAutopayDraft(null);
      toast({ title: "Autopay settings saved" });
    },
    onError: (err: any) => {
      toast({ title: "Could not save autopay settings", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  const verifiedMethods = methods.filter((m) => m.methodType === "ach" && m.isVerified);

  function handleAutopayToggle(enabled: boolean) {
    setAutopayDraft({
      enabled,
      trigger: resolvedAutopay.trigger || "on_due_date",
      methodId: resolvedAutopay.methodId || "",
    });
    if (!enabled) {
      autopayMutation.mutate({ autopayEnabled: false });
    }
  }

  function handleAutopaySettingsSave() {
    autopayMutation.mutate({
      autopayEnabled: resolvedAutopay.enabled,
      autopayTrigger: resolvedAutopay.trigger as any,
      autopayPaymentMethodId: resolvedAutopay.methodId || undefined,
    });
  }

  const autopayDirty =
    autopayDraft !== null &&
    (autopayDraft.enabled !== autopay?.autopayEnabled ||
      autopayDraft.trigger !== autopay?.autopayTrigger ||
      autopayDraft.methodId !== (autopay?.autopayPaymentMethodId ?? ""));

  const selectedMethodForAutopay = methods.find((m) => m.id === resolvedAutopay.methodId);
  const canEnableAutopay = resolvedAutopay.enabled && verifiedMethods.length > 0 && !!resolvedAutopay.methodId;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Saved ACH Methods ── */}
      <Card data-testid="card-saved-ach-methods">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Landmark className="w-4 h-4" />
                Saved ACH Accounts
              </CardTitle>
              <CardDescription className="mt-1">
                Bank accounts enrolled for {customerName || "this customer"}. Only ACH accounts are supported for autopay (v1).
              </CardDescription>
            </div>
            <Button
              size="default"
              onClick={() => setShowEnrollDialog(true)}
              data-testid="button-add-ach-method"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add ACH Account
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {methodsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </div>
          ) : methods.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-methods">
              <Landmark className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No bank accounts on file.</p>
              <p className="text-xs mt-1">Add an ACH account to enable autopay for this customer.</p>
            </div>
          ) : (
            <div className="divide-y" data-testid="list-saved-methods">
              {methods.map((method) => (
                <div
                  key={method.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                  data-testid={`row-method-${method.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                      <Landmark className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">
                        {method.displayName || `${method.bankName || "Bank"} ****${method.last4 || "----"}`}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {method.accountType || "ACH"} · ****{method.last4 || "----"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {verificationBadge(method)}
                    {method.isDefault && (
                      <Badge variant="secondary" data-testid={`badge-default-${method.id}`}>
                        <Star className="w-3 h-3 mr-1" />
                        Default
                      </Badge>
                    )}
                    {!method.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDefaultMutation.mutate(method.id)}
                        disabled={setDefaultMutation.isPending}
                        data-testid={`button-set-default-${method.id}`}
                      >
                        Set Default
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeletingId(method.id)}
                      data-testid={`button-delete-method-${method.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Autopay Configuration ── */}
      <Card data-testid="card-autopay-config">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                Autopay Enrollment
                <Badge variant="outline" className="text-xs font-normal">Future-Ready</Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                When enabled, invoices will be automatically charged to the selected bank account on the configured trigger date.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">

          {autopayLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading autopay settings...
            </div>
          ) : (
            <>
              {/* Enable / disable toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="autopay-toggle" className="font-medium">Enable Autopay</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Automatically charge the default payment method when invoices are due.
                  </p>
                </div>
                <Switch
                  id="autopay-toggle"
                  checked={resolvedAutopay.enabled}
                  onCheckedChange={handleAutopayToggle}
                  disabled={autopayMutation.isPending || verifiedMethods.length === 0}
                  data-testid="switch-autopay-enabled"
                />
              </div>

              {verifiedMethods.length === 0 && (
                <Alert>
                  <AlertTriangle className="w-4 h-4" />
                  <AlertDescription>
                    Add at least one ACH account above before enabling autopay.
                  </AlertDescription>
                </Alert>
              )}

              {resolvedAutopay.enabled && verifiedMethods.length > 0 && (
                <div className="space-y-4 pl-0">

                  {/* Trigger */}
                  <div className="space-y-1.5">
                    <Label data-testid="label-trigger">Charge Trigger</Label>
                    <Select
                      value={resolvedAutopay.trigger}
                      onValueChange={(v) =>
                        setAutopayDraft((d) => ({ ...(d ?? resolvedAutopay), trigger: v }))
                      }
                    >
                      <SelectTrigger data-testid="select-autopay-trigger">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="on_due_date">On Due Date — charge when the invoice becomes due</SelectItem>
                        <SelectItem value="on_send">On Send — charge when the invoice is sent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Payment method selector */}
                  <div className="space-y-1.5">
                    <Label>Payment Method</Label>
                    <Select
                      value={resolvedAutopay.methodId}
                      onValueChange={(v) =>
                        setAutopayDraft((d) => ({ ...(d ?? resolvedAutopay), methodId: v }))
                      }
                    >
                      <SelectTrigger data-testid="select-autopay-method">
                        <SelectValue placeholder="Select bank account..." />
                      </SelectTrigger>
                      <SelectContent>
                        {verifiedMethods.map((m) => (
                          <SelectItem key={m.id} value={m.id} data-testid={`option-method-${m.id}`}>
                            {m.displayName || `${m.bankName || "Bank"} ****${m.last4 || "----"}`}
                            {m.isDefault ? " (Default)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedMethodForAutopay && (
                      <p className="text-xs text-muted-foreground">
                        {selectedMethodForAutopay.bankName} · {selectedMethodForAutopay.accountType} · ****{selectedMethodForAutopay.last4}
                      </p>
                    )}
                  </div>

                  {autopayDirty && (
                    <Button
                      onClick={handleAutopaySettingsSave}
                      disabled={autopayMutation.isPending || !canEnableAutopay}
                      data-testid="button-save-autopay"
                    >
                      {autopayMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : null}
                      Save Autopay Settings
                    </Button>
                  )}
                </div>
              )}

              {autopay?.autopayEnabled && autopay?.autopayDisabledAt === null && !autopayDraft && (
                <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  Autopay is active — charged {autopay.autopayTrigger === "on_due_date" ? "on due date" : "when invoice is sent"}.
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Enrollment Dialog ── */}
      <Dialog open={showEnrollDialog} onOpenChange={(o) => { setShowEnrollDialog(o); if (!o) form.reset(); }}>
        <DialogContent className="max-w-md" data-testid="dialog-enroll-ach">
          <DialogHeader>
            <DialogTitle>Add ACH Bank Account</DialogTitle>
            <DialogDescription>
              Enter the customer's bank account details. Only the last 4 digits of the account number are stored.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) => enrollMutation.mutate(data))}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="bankName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Chase, Bank of America" data-testid="input-bank-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="last4"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Last 4</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="1234"
                          maxLength={4}
                          inputMode="numeric"
                          data-testid="input-account-last4"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="accountType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-account-type">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="checking">Checking</SelectItem>
                          <SelectItem value="savings">Savings</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nickname <span className="text-muted-foreground">(optional)</span></FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Operating Account" data-testid="input-display-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isDefault"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-is-default"
                      />
                    </FormControl>
                    <FormLabel className="cursor-pointer font-normal">Set as default payment method</FormLabel>
                  </FormItem>
                )}
              />

              <Alert>
                <ShieldCheck className="w-4 h-4" />
                <AlertDescription className="text-xs">
                  Only the last 4 digits are stored. This account will be marked as manually verified by your admin team.
                  Full ACH processing requires Stripe ACH configuration.
                </AlertDescription>
              </Alert>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setShowEnrollDialog(false); form.reset(); }}
                  data-testid="button-cancel-enroll"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={enrollMutation.isPending} data-testid="button-submit-enroll">
                  {enrollMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Save Account
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog open={!!deletingId} onOpenChange={(o) => { if (!o) setDeletingId(null); }}>
        <DialogContent data-testid="dialog-confirm-delete">
          <DialogHeader>
            <DialogTitle>Remove Bank Account?</DialogTitle>
            <DialogDescription>
              This will remove the bank account from this customer's profile. If autopay is configured to use this account, autopay will be disabled.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
