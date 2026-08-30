import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Save, Loader2, Settings, DollarSign, ShieldCheck, Bell, FileText } from "lucide-react";
import { DUPLICATE_RULE_OPTIONS, OWNERSHIP_RULE_OPTIONS, PAYMENT_TIMING_OPTIONS, CAMPAIGN_TRIGGER_LABELS } from "@shared/schema";

const milestoneSchema = z.object({
  name:          z.string().min(1, "Name required"),
  triggerType:   z.string().min(1),
  rewardAmount:  z.string().min(1, "Amount required"),
  paymentTiming: z.string().default("immediate"),
});

const settingsSchema = z.object({
  isActive:               z.boolean(),
  defaultBonusAmount:     z.string().optional(),
  duplicateRule:          z.string(),
  ownershipRule:          z.string(),
  rewardApprovalRequired: z.boolean(),
  autoNotifyDriver:       z.boolean(),
  defaultPaymentTiming:   z.string(),
  taxHandlingNotes:       z.string().optional(),
  eligibilityNotes:       z.string().optional(),
  defaultMilestones:      z.array(milestoneSchema),
});

type SettingsForm = z.infer<typeof settingsSchema>;

const DEFAULT_VALS: SettingsForm = {
  isActive: true,
  defaultBonusAmount: "",
  duplicateRule: "first_referrer_wins",
  ownershipRule: "first_contact",
  rewardApprovalRequired: false,
  autoNotifyDriver: true,
  defaultPaymentTiming: "immediate",
  taxHandlingNotes: "",
  eligibilityNotes: "",
  defaultMilestones: [],
};

const TRIGGER_OPTIONS = [
  "application_submitted","onboarded","first_shift_worked","30_days_active","90_days_active",
  "50_moves","100_moves","custom_moves","custom_hours","custom"
] as const;

function SectionHeader({ icon, title, description }: { icon: JSX.Element; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

export default function ReferralSettings() {
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<any>({
    queryKey: ["/api/referral-program-settings"],
  });

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: DEFAULT_VALS,
  });

  const { fields: milestoneFields, append, remove } = useFieldArray({
    control: form.control,
    name: "defaultMilestones",
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        isActive:               settings.isActive ?? true,
        defaultBonusAmount:     settings.defaultBonusAmount ? String(settings.defaultBonusAmount) : "",
        duplicateRule:          settings.duplicateRule ?? "first_referrer_wins",
        ownershipRule:          settings.ownershipRule ?? "first_contact",
        rewardApprovalRequired: settings.rewardApprovalRequired ?? false,
        autoNotifyDriver:       settings.autoNotifyDriver ?? true,
        defaultPaymentTiming:   settings.defaultPaymentTiming ?? "immediate",
        taxHandlingNotes:       settings.taxHandlingNotes ?? "",
        eligibilityNotes:       settings.eligibilityNotes ?? "",
        defaultMilestones:      (settings.defaultMilestones ?? []).map((m: any) => ({
          name:          m.name ?? "",
          triggerType:   m.triggerType ?? "onboarded",
          rewardAmount:  String(m.rewardAmount ?? ""),
          paymentTiming: m.paymentTiming ?? "immediate",
        })),
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (data: SettingsForm) => apiRequest("PATCH", "/api/referral-program-settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/referral-program-settings"] });
      toast({ title: "Settings saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalDefault = milestoneFields.reduce((s, _, i) => {
    return s + (parseFloat(form.watch(`defaultMilestones.${i}.rewardAmount`)) || 0);
  }, 0);

  return (
    <div className="space-y-6 p-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Referral Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define permanent referral program rules. Campaigns can override individual settings.
          </p>
        </div>
        <Button
          onClick={form.handleSubmit((d) => saveMutation.mutate(d))}
          disabled={saveMutation.isPending}
          data-testid="button-save-settings"
        >
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          Save Settings
        </Button>
      </div>

      {/* Program Status */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <SectionHeader
            icon={<Settings className="h-4 w-4 text-primary" />}
            title="Program Status"
            description="Enable or disable the entire referral program globally."
          />
          <div className="flex items-center justify-between p-3 border rounded-md">
            <div>
              <p className="text-sm font-medium">Referral Program Active</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                When inactive, drivers cannot submit referrals and no bonuses are awarded.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={form.watch("isActive") ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : ""}>
                {form.watch("isActive") ? "Active" : "Inactive"}
              </Badge>
              <Switch
                checked={form.watch("isActive")}
                onCheckedChange={(v) => form.setValue("isActive", v)}
                data-testid="switch-program-active"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Default Bonus */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <SectionHeader
            icon={<DollarSign className="h-4 w-4 text-primary" />}
            title="Default Reward Structure"
            description="These defaults apply when no active campaign is running or when a campaign doesn't override them."
          />
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Default Bonus Amount</Label>
                <div className="relative">
                  <DollarSign className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-7"
                    type="number"
                    min="0"
                    placeholder="e.g. 250"
                    {...form.register("defaultBonusAmount")}
                    data-testid="input-default-bonus"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Applied when no campaign milestone is active</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Default Payment Timing</Label>
                <Select
                  value={form.watch("defaultPaymentTiming")}
                  onValueChange={(v) => form.setValue("defaultPaymentTiming", v)}
                >
                  <SelectTrigger data-testid="select-default-payment-timing"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TIMING_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Default Milestones */}
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label className="text-xs">Default Payment Milestones</Label>
                {totalDefault > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Total: <strong className="text-foreground">${totalDefault.toFixed(2)}</strong>
                  </span>
                )}
              </div>
              {milestoneFields.map((field, i) => (
                <div key={field.id} className="flex items-center gap-2 p-3 border rounded-md bg-muted/30">
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Name</Label>
                      <Input
                        {...form.register(`defaultMilestones.${i}.name`)}
                        placeholder="e.g. Hire Bonus"
                        data-testid={`input-default-milestone-name-${i}`}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Trigger</Label>
                      <Select
                        value={form.watch(`defaultMilestones.${i}.triggerType`)}
                        onValueChange={(v) => form.setValue(`defaultMilestones.${i}.triggerType`, v)}
                      >
                        <SelectTrigger data-testid={`select-default-trigger-${i}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TRIGGER_OPTIONS.map((t) => (
                            <SelectItem key={t} value={t}>
                              {CAMPAIGN_TRIGGER_LABELS[t as keyof typeof CAMPAIGN_TRIGGER_LABELS] ?? t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Amount</Label>
                      <div className="relative">
                        <DollarSign className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          className="pl-6"
                          type="number"
                          min="0"
                          {...form.register(`defaultMilestones.${i}.rewardAmount`)}
                          data-testid={`input-default-milestone-amount-${i}`}
                        />
                      </div>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0 mt-4"
                    onClick={() => remove(i)}
                    data-testid={`button-remove-default-milestone-${i}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => append({ name: "", triggerType: "onboarded", rewardAmount: "", paymentTiming: "immediate" })}
                data-testid="button-add-default-milestone"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Default Milestone
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Business Rules */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <SectionHeader
            icon={<ShieldCheck className="h-4 w-4 text-primary" />}
            title="Business Rules"
            description="Control how referrals are deduplicated and who owns each referral."
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Duplicate Referral Rule</Label>
              <Select
                value={form.watch("duplicateRule")}
                onValueChange={(v) => form.setValue("duplicateRule", v)}
              >
                <SelectTrigger data-testid="select-duplicate-rule"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DUPLICATE_RULE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">What happens when the same candidate is referred twice</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Referral Ownership Rule</Label>
              <Select
                value={form.watch("ownershipRule")}
                onValueChange={(v) => form.setValue("ownershipRule", v)}
              >
                <SelectTrigger data-testid="select-ownership-rule"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OWNERSHIP_RULE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">How referral credit is assigned when contested</p>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="space-y-3">
            {[
              {
                key: "rewardApprovalRequired" as const,
                label: "Reward Approval Workflow",
                desc: "Require a manager to approve each reward before payment is issued",
                testid: "switch-approval-required",
              },
              {
                key: "autoNotifyDriver" as const,
                label: "Automatic Driver Notifications",
                desc: "Automatically notify the referring driver when their referral progresses",
                testid: "switch-auto-notify",
              },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between p-3 border rounded-md">
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
                <Switch
                  checked={form.watch(item.key)}
                  onCheckedChange={(v) => form.setValue(item.key, v)}
                  data-testid={item.testid}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <SectionHeader
            icon={<FileText className="h-4 w-4 text-primary" />}
            title="Notes & Policy Documentation"
            description="These notes are for internal reference and may appear in driver communications."
          />
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Referral Eligibility Rules</Label>
              <Textarea
                rows={3}
                placeholder="Describe who is eligible to make referrals and who qualifies as a valid referral candidate..."
                {...form.register("eligibilityNotes")}
                data-testid="textarea-eligibility-notes"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tax & Payment Handling Notes</Label>
              <Textarea
                rows={3}
                placeholder="Notes on how referral bonuses are taxed, W-9 requirements, payment method, etc..."
                {...form.register("taxHandlingNotes")}
                data-testid="textarea-tax-notes"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={form.handleSubmit((d) => saveMutation.mutate(d))}
          disabled={saveMutation.isPending}
          data-testid="button-save-settings-bottom"
        >
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
