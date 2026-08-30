import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Save, CreditCard, Building, Bell, AlertTriangle, ShieldAlert, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

const billingProfileSchema = z.object({
  paymentTerms: z.string().default("net_30"),
  creditLimit: z.string().optional(),
  enforcePrepay: z.boolean().default(false),
  creditLimitAction: z.string().default("warn"),
  isTaxExempt: z.boolean().default(false),
  taxExemptCertificate: z.string().optional(),
  defaultTaxRate: z.string().optional(),
  billingRule: z.string().default("consolidated"),
  invoiceDeliveryMethod: z.string().default("email"),
  invoiceFrequency: z.string().default("weekly"),
  autoInvoice: z.boolean().default(false),
  apContactName: z.string().optional(),
  apContactPhone: z.string().optional(),
  apContactEmail: z.string().email().optional().or(z.literal("")),
  preferredPaymentMethod: z.string().default("card"),
  autopayEnabled: z.boolean().default(false),
  lateFeeEnabled: z.boolean().default(false),
  lateFeeType: z.string().default("flat"),
  lateFeeAmount: z.string().optional(),
  gracePeriodDays: z.number().int().min(0).default(0),
  reminderOptOut: z.boolean().default(false),
});

type BillingProfileFormData = z.infer<typeof billingProfileSchema>;

interface BillingProfile {
  id: string;
  customerId: string;
  paymentTerms?: string;
  creditLimit?: string;
  enforcePrepay?: boolean;
  creditLimitAction?: string;
  isTaxExempt?: boolean;
  taxExemptCertificate?: string;
  defaultTaxRate?: string;
  billingRule?: string;
  invoiceDeliveryMethod?: string;
  invoiceFrequency?: string;
  autoInvoice?: boolean;
  apContactName?: string;
  apContactPhone?: string;
  apContactEmail?: string;
  preferredPaymentMethod?: string;
  autopayEnabled?: boolean;
  lateFeeEnabled?: boolean;
  lateFeeType?: string;
  lateFeeAmount?: string;
  gracePeriodDays?: number;
  reminderOptOut?: boolean;
}

interface CreditExposure {
  customerId: string;
  creditLimit: number | null;
  enforcePrepay: boolean;
  creditLimitAction: string;
  totalExposure: number;
  isOverLimit: boolean;
  availableCredit: number | null;
  unpaidInvoiceCount: number;
}

interface BillingProfileEditorProps {
  customerId: string;
  customerName?: string;
  onSave?: () => void;
}

export function BillingProfileEditor({ customerId, customerName, onSave }: BillingProfileEditorProps) {
  const { toast } = useToast();

  const { data: profile, isLoading } = useQuery<BillingProfile | null>({
    queryKey: ["/api/corporate/invoicing/billing-profiles", customerId],
    enabled: !!customerId,
  });

  const { data: creditExposure } = useQuery<CreditExposure>({
    queryKey: ["/api/corporate/invoicing/credit-exposure", customerId],
    enabled: !!customerId,
  });

  const form = useForm<BillingProfileFormData>({
    resolver: zodResolver(billingProfileSchema),
    defaultValues: {
      paymentTerms: "net_30",
      creditLimit: "",
      enforcePrepay: false,
      creditLimitAction: "warn",
      isTaxExempt: false,
      taxExemptCertificate: "",
      defaultTaxRate: "",
      billingRule: "consolidated",
      invoiceDeliveryMethod: "email",
      invoiceFrequency: "weekly",
      autoInvoice: false,
      apContactName: "",
      apContactPhone: "",
      apContactEmail: "",
      preferredPaymentMethod: "card",
      autopayEnabled: false,
      lateFeeEnabled: false,
      lateFeeType: "flat",
      lateFeeAmount: "",
      gracePeriodDays: 0,
      reminderOptOut: false,
    },
  });

  useEffect(() => {
    if (profile) {
      form.reset({
        paymentTerms: profile.paymentTerms || "net_30",
        creditLimit: profile.creditLimit?.toString() || "",
        enforcePrepay: profile.enforcePrepay || false,
        creditLimitAction: profile.creditLimitAction || "warn",
        isTaxExempt: profile.isTaxExempt || false,
        taxExemptCertificate: profile.taxExemptCertificate || "",
        defaultTaxRate: profile.defaultTaxRate?.toString() || "",
        billingRule: profile.billingRule || "consolidated",
        invoiceDeliveryMethod: profile.invoiceDeliveryMethod || "email",
        invoiceFrequency: profile.invoiceFrequency || "weekly",
        autoInvoice: profile.autoInvoice || false,
        apContactName: profile.apContactName || "",
        apContactPhone: profile.apContactPhone || "",
        apContactEmail: profile.apContactEmail || "",
        preferredPaymentMethod: profile.preferredPaymentMethod || "card",
        autopayEnabled: profile.autopayEnabled || false,
        lateFeeEnabled: profile.lateFeeEnabled || false,
        lateFeeType: profile.lateFeeType || "flat",
        lateFeeAmount: profile.lateFeeAmount?.toString() || "",
        gracePeriodDays: profile.gracePeriodDays || 0,
        reminderOptOut: profile.reminderOptOut || false,
      });
    }
  }, [profile, form]);

  const saveMutation = useMutation({
    mutationFn: async (data: BillingProfileFormData) => {
      const payload = {
        ...data,
        creditLimit: data.creditLimit ? parseFloat(data.creditLimit) : null,
        defaultTaxRate: data.defaultTaxRate ? parseFloat(data.defaultTaxRate) : null,
        lateFeeAmount: data.lateFeeAmount ? parseFloat(data.lateFeeAmount) : null,
      };
      return apiRequest('PUT', `/api/corporate/invoicing/billing-profiles/${customerId}`, payload);
    },
    onSuccess: () => {
      toast({ title: "Billing profile saved", description: "Customer billing settings have been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/billing-profiles", customerId] });
      onSave?.();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: BillingProfileFormData) => {
    saveMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const watchCreditLimit = form.watch("creditLimit");
  const watchLateFeeEnabled = form.watch("lateFeeEnabled");
  const watchLateFeeType = form.watch("lateFeeType");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {customerName && (
          <div className="flex items-center gap-2 mb-4">
            <Building className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-medium">{customerName}</h3>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="h-4 w-4" />
                Payment Settings
              </CardTitle>
              <CardDescription>Configure payment terms and methods</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="paymentTerms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Terms</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-payment-terms">
                          <SelectValue placeholder="Select terms" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                        <SelectItem value="net_15">Net 15</SelectItem>
                        <SelectItem value="net_30">Net 30</SelectItem>
                        <SelectItem value="net_45">Net 45</SelectItem>
                        <SelectItem value="net_60">Net 60</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="preferredPaymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preferred Payment Method</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-preferred-payment">
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="card">Credit Card</SelectItem>
                        <SelectItem value="ach">ACH Bank Transfer</SelectItem>
                        <SelectItem value="check">Check</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="creditLimit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Credit Limit ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Enter credit limit (leave blank for no limit)"
                        data-testid="input-credit-limit"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Maximum outstanding balance before enforcement triggers
                    </FormDescription>
                  </FormItem>
                )}
              />

              {watchCreditLimit && (
                <>
                  <FormField
                    control={form.control}
                    name="creditLimitAction"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>When Credit Limit Exceeded</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-credit-limit-action">
                              <SelectValue placeholder="Select action" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="warn">Warn Only (allow send with warning)</SelectItem>
                            <SelectItem value="block">Block Send (require override)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs">
                          Controls what happens when a new invoice would exceed the credit limit
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="enforcePrepay"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Require Prepayment</FormLabel>
                          <FormDescription className="text-xs">
                            Customer must pay before invoices are sent when over limit
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-enforce-prepay"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </>
              )}

              {creditExposure && creditExposure.creditLimit !== null && (
                <div className="rounded-lg border p-3 space-y-2" data-testid="credit-exposure-summary">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Credit Exposure</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Credit Limit:</span>
                      <span className="ml-1 font-medium" data-testid="text-credit-limit-value">${creditExposure.creditLimit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Outstanding:</span>
                      <span className={`ml-1 font-medium ${creditExposure.isOverLimit ? 'text-red-600' : ''}`} data-testid="text-exposure-value">
                        ${creditExposure.totalExposure.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Available:</span>
                      <span className="ml-1 font-medium" data-testid="text-available-credit">
                        ${(creditExposure.availableCredit ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Unpaid:</span>
                      <span className="ml-1 font-medium" data-testid="text-unpaid-count">{creditExposure.unpaidInvoiceCount} invoices</span>
                    </div>
                  </div>
                  {creditExposure.isOverLimit && (
                    <Alert variant="destructive" className="mt-2">
                      <ShieldAlert className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        This customer is over their credit limit by ${(creditExposure.totalExposure - creditExposure.creditLimit).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              <FormField
                control={form.control}
                name="autopayEnabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Auto-Pay Enabled</FormLabel>
                      <FormDescription className="text-xs">
                        Automatically charge payment method on due date
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-autopay"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4" />
                Late Fee Configuration
              </CardTitle>
              <CardDescription>Configure late payment penalties</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="lateFeeEnabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Enable Late Fees</FormLabel>
                      <FormDescription className="text-xs">
                        Apply fees to overdue invoices
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-late-fees"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {watchLateFeeEnabled && (
                <>
                  <FormField
                    control={form.control}
                    name="lateFeeType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Late Fee Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-late-fee-type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="flat">Flat Amount</SelectItem>
                            <SelectItem value="percent">Percentage</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="lateFeeAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Late Fee {watchLateFeeType === "percent" ? "(%)" : "($)"}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step={watchLateFeeType === "percent" ? "0.1" : "0.01"}
                            placeholder={watchLateFeeType === "percent" ? "e.g. 1.5" : "e.g. 25.00"}
                            data-testid="input-late-fee-amount"
                            {...field}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="gracePeriodDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Grace Period (days)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            placeholder="Days after due date before late fee"
                            data-testid="input-grace-period"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Days after due date before applying late fee
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="h-4 w-4" />
                Reminder Preferences
              </CardTitle>
              <CardDescription>Configure invoice reminder notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="reminderOptOut"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Opt-Out of Reminders</FormLabel>
                      <FormDescription className="text-xs">
                        Disable automated payment reminder emails
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-reminder-optout"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="invoiceDeliveryMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice Delivery Method</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-delivery-method">
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="portal">Customer Portal</SelectItem>
                        <SelectItem value="mail">Physical Mail</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="invoiceFrequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice Frequency</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-invoice-frequency">
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="bi_weekly">Bi-Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="on_demand">On Demand</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">A/P Contact</CardTitle>
              <CardDescription>Accounts payable contact information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="apContactName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter contact name" data-testid="input-ap-name" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="apContactEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="Enter email" data-testid="input-ap-email" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="apContactPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter phone number" data-testid="input-ap-phone" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-billing-profile">
            {saveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Billing Profile
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
