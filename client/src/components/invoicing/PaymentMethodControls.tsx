import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CreditCard, Building2, FileText, Banknote, ShieldAlert, Save, Loader2, History, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface PaymentMethodSettings {
  customerId: string;
  customerName: string;
  acceptsCreditCard: boolean;
  acceptsAch: boolean;
  acceptsCheck: boolean;
  acceptsWire: boolean;
  enforcePrepay: boolean;
  preferredPaymentMethod: string;
}

interface AuditLogEntry {
  id: string;
  customerId: string;
  changedBy: string;
  changedByName: string;
  changeType: string;
  paymentMethod: string;
  previousValue: boolean | null;
  newValue: boolean | null;
  reason: string | null;
  createdAt: string;
}

const METHOD_LABELS: Record<string, string> = {
  credit_card: "Credit Card",
  ach: "ACH (Bank Transfer)",
  check: "Check",
  wire: "Wire Transfer",
  prepay_enforcement: "Prepay Enforcement",
};

const METHOD_ICONS: Record<string, typeof CreditCard> = {
  credit_card: CreditCard,
  ach: Building2,
  check: FileText,
  wire: Banknote,
};

interface PaymentMethodControlsProps {
  customerId: string;
  customerName?: string;
}

export function PaymentMethodControls({ customerId, customerName }: PaymentMethodControlsProps) {
  const { toast } = useToast();
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [reason, setReason] = useState("");
  const [pendingChanges, setPendingChanges] = useState<Partial<PaymentMethodSettings> | null>(null);

  const [localSettings, setLocalSettings] = useState<{
    acceptsCreditCard: boolean;
    acceptsAch: boolean;
    acceptsCheck: boolean;
    acceptsWire: boolean;
    enforcePrepay: boolean;
  } | null>(null);

  const { data: settings, isLoading } = useQuery<PaymentMethodSettings>({
    queryKey: ["/api/corporate/invoicing/payment-methods", customerId],
    enabled: !!customerId,
  });

  const { data: auditLog, isLoading: auditLoading } = useQuery<AuditLogEntry[]>({
    queryKey: ["/api/corporate/invoicing/payment-methods", customerId, "audit-log"],
    enabled: !!customerId && showAuditLog,
  });

  const current = localSettings || (settings ? {
    acceptsCreditCard: settings.acceptsCreditCard,
    acceptsAch: settings.acceptsAch,
    acceptsCheck: settings.acceptsCheck,
    acceptsWire: settings.acceptsWire,
    enforcePrepay: settings.enforcePrepay,
  } : null);

  const hasChanges = current && settings && (
    current.acceptsCreditCard !== settings.acceptsCreditCard ||
    current.acceptsAch !== settings.acceptsAch ||
    current.acceptsCheck !== settings.acceptsCheck ||
    current.acceptsWire !== settings.acceptsWire ||
    current.enforcePrepay !== settings.enforcePrepay
  );

  const enabledCount = current ? [current.acceptsCreditCard, current.acceptsAch, current.acceptsCheck, current.acceptsWire].filter(Boolean).length : 0;
  const isValid = enabledCount > 0 || (current?.enforcePrepay ?? false);

  const saveMutation = useMutation({
    mutationFn: async (data: { settings: Partial<PaymentMethodSettings>; reason: string }) => {
      return apiRequest('PUT', `/api/corporate/invoicing/payment-methods/${customerId}`, {
        ...data.settings,
        reason: data.reason,
      });
    },
    onSuccess: () => {
      toast({ title: "Payment methods updated", description: "Allowed payment methods have been saved." });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/payment-methods", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/billing-profiles", customerId] });
      setLocalSettings(null);
      setPendingChanges(null);
      setReason("");
      setShowConfirmDialog(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleToggle = (field: string, value: boolean) => {
    if (!current) return;
    const updated = { ...current, [field]: value };
    setLocalSettings(updated);
  };

  const handleSave = () => {
    if (!current || !hasChanges) return;
    setPendingChanges(current);
    setShowConfirmDialog(true);
  };

  const confirmSave = () => {
    if (!pendingChanges) return;
    saveMutation.mutate({ settings: pendingChanges, reason });
  };

  const handleReset = () => {
    setLocalSettings(null);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          <span className="text-muted-foreground">Loading payment method settings...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card data-testid="card-payment-method-controls">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              Payment Method Controls
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Control which payment methods are allowed for {customerName || 'this customer'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAuditLog(true)}
            data-testid="button-view-audit-log"
          >
            <History className="h-4 w-4 mr-1" />
            Audit Log
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isValid && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                At least one payment method must be enabled, or prepay must be enforced.
              </AlertDescription>
            </Alert>
          )}

          {current?.enforcePrepay && (
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                Prepay is enforced. Customer must pay before services are rendered. Online payment methods below control which options are available for prepayment.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted" data-testid="control-credit-card">
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-muted-foreground" />
                <div>
                  <Label className="font-medium">Credit Card</Label>
                  <p className="text-xs text-muted-foreground">Visa, Mastercard, Amex via Stripe</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {current?.acceptsCreditCard === false && (
                  <Badge variant="destructive" className="text-xs">Disabled</Badge>
                )}
                <Switch
                  checked={current?.acceptsCreditCard ?? true}
                  onCheckedChange={(v) => handleToggle('acceptsCreditCard', v)}
                  data-testid="switch-credit-card"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted" data-testid="control-ach">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <Label className="font-medium">ACH (Bank Transfer)</Label>
                  <p className="text-xs text-muted-foreground">Direct bank account debit</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {current?.acceptsAch === false && (
                  <Badge variant="destructive" className="text-xs">Disabled</Badge>
                )}
                <Switch
                  checked={current?.acceptsAch ?? true}
                  onCheckedChange={(v) => handleToggle('acceptsAch', v)}
                  data-testid="switch-ach"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted" data-testid="control-check">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <Label className="font-medium">Check</Label>
                  <p className="text-xs text-muted-foreground">Physical check payment (manual recording)</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {current?.acceptsCheck === false && (
                  <Badge variant="destructive" className="text-xs">Disabled</Badge>
                )}
                <Switch
                  checked={current?.acceptsCheck ?? true}
                  onCheckedChange={(v) => handleToggle('acceptsCheck', v)}
                  data-testid="switch-check"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted" data-testid="control-wire">
              <div className="flex items-center gap-3">
                <Banknote className="h-5 w-5 text-muted-foreground" />
                <div>
                  <Label className="font-medium">Wire Transfer</Label>
                  <p className="text-xs text-muted-foreground">Bank wire (manual recording)</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {current?.acceptsWire === false && (
                  <Badge variant="destructive" className="text-xs">Disabled</Badge>
                )}
                <Switch
                  checked={current?.acceptsWire ?? true}
                  onCheckedChange={(v) => handleToggle('acceptsWire', v)}
                  data-testid="switch-wire"
                />
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted" data-testid="control-prepay">
              <div className="flex items-center gap-3">
                <ShieldAlert className="h-5 w-5 text-muted-foreground" />
                <div>
                  <Label className="font-medium">Enforce Prepay</Label>
                  <p className="text-xs text-muted-foreground">Require payment before service delivery</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {current?.enforcePrepay && (
                  <Badge className="text-xs">Active</Badge>
                )}
                <Switch
                  checked={current?.enforcePrepay ?? false}
                  onCheckedChange={(v) => handleToggle('enforcePrepay', v)}
                  data-testid="switch-prepay"
                />
              </div>
            </div>
          </div>

          {hasChanges && (
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={handleReset} data-testid="button-reset-methods">
                Reset
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!isValid}
                data-testid="button-save-methods"
              >
                <Save className="h-4 w-4 mr-1" />
                Save Changes
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Payment Method Changes</DialogTitle>
            <DialogDescription>
              Changes to payment methods take effect immediately and will affect which payment options are available to {customerName || 'this customer'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Summary of Changes</Label>
              <div className="space-y-1 text-sm">
                {settings && current && (
                  <>
                    {current.acceptsCreditCard !== settings.acceptsCreditCard && (
                      <div className="flex items-center gap-2">
                        <Badge variant={current.acceptsCreditCard ? "default" : "destructive"} className="text-xs">
                          {current.acceptsCreditCard ? "Enabled" : "Disabled"}
                        </Badge>
                        <span>Credit Card</span>
                      </div>
                    )}
                    {current.acceptsAch !== settings.acceptsAch && (
                      <div className="flex items-center gap-2">
                        <Badge variant={current.acceptsAch ? "default" : "destructive"} className="text-xs">
                          {current.acceptsAch ? "Enabled" : "Disabled"}
                        </Badge>
                        <span>ACH (Bank Transfer)</span>
                      </div>
                    )}
                    {current.acceptsCheck !== settings.acceptsCheck && (
                      <div className="flex items-center gap-2">
                        <Badge variant={current.acceptsCheck ? "default" : "destructive"} className="text-xs">
                          {current.acceptsCheck ? "Enabled" : "Disabled"}
                        </Badge>
                        <span>Check</span>
                      </div>
                    )}
                    {current.acceptsWire !== settings.acceptsWire && (
                      <div className="flex items-center gap-2">
                        <Badge variant={current.acceptsWire ? "default" : "destructive"} className="text-xs">
                          {current.acceptsWire ? "Enabled" : "Disabled"}
                        </Badge>
                        <span>Wire Transfer</span>
                      </div>
                    )}
                    {current.enforcePrepay !== settings.enforcePrepay && (
                      <div className="flex items-center gap-2">
                        <Badge variant={current.enforcePrepay ? "default" : "destructive"} className="text-xs">
                          {current.enforcePrepay ? "Enabled" : "Disabled"}
                        </Badge>
                        <span>Prepay Enforcement</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="change-reason" className="text-sm font-medium">Reason for Change</Label>
              <Textarea
                id="change-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., High-risk customer - disable credit cards per risk review"
                className="resize-none"
                data-testid="input-change-reason"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)} data-testid="button-cancel-changes">
              Cancel
            </Button>
            <Button
              onClick={confirmSave}
              disabled={saveMutation.isPending}
              data-testid="button-confirm-changes"
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Confirm Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAuditLog} onOpenChange={setShowAuditLog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Payment Method Audit Log</DialogTitle>
            <DialogDescription>
              History of payment method changes for {customerName || 'this customer'}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            {auditLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : !auditLog || auditLog.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-audit-entries">
                No changes recorded yet.
              </p>
            ) : (
              <div className="space-y-3">
                {auditLog.map((entry) => (
                  <div key={entry.id} className="p-3 rounded-md bg-muted space-y-1" data-testid={`audit-entry-${entry.id}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Badge variant={entry.changeType === 'enabled' ? 'default' : 'destructive'} className="text-xs">
                          {entry.changeType}
                        </Badge>
                        <span className="text-sm font-medium">
                          {METHOD_LABELS[entry.paymentMethod] || entry.paymentMethod}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      by {entry.changedByName || 'Unknown'}
                    </p>
                    {entry.reason && (
                      <p className="text-xs text-muted-foreground italic">
                        Reason: {entry.reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
