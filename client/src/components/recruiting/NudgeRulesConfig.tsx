import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Bell, Plus, Trash2, Settings, Play, Loader2, Edit, Clock, Hash, Mail, MessageSquare } from "lucide-react";

interface NudgeRule {
  id: string;
  ruleType: string;
  name: string;
  description: string | null;
  isActive: boolean;
  triggerAfterHours: number;
  maxNudgesPerStage: number;
  cooldownHours: number;
  channels: string[];
  applicableStages: string[] | null;
  market: string | null;
  emailSubjectTemplate: string | null;
  emailBodyTemplate: string | null;
  smsTemplate: string | null;
  createdAt: string;
  updatedAt: string;
}

interface NudgeScanResult {
  processed: number;
  sent: number;
  suppressed: number;
  errors: number;
  details: Array<{ applicationId: string; ruleId: string; status: string; reason?: string; channel?: string }>;
}

const RULE_TYPES = [
  { value: "no_response", label: "No Response" },
  { value: "docs_pending", label: "Documents Pending" },
  { value: "interview_unconfirmed", label: "Interview Unconfirmed" },
];

const APPLICATION_STAGES = [
  { value: "applied", label: "Applied" },
  { value: "screening", label: "Screening" },
  { value: "interview", label: "Interview" },
  { value: "offer_pending", label: "Offer Pending" },
  { value: "background_check", label: "Background Check" },
  { value: "onboarding", label: "Onboarding" },
  { value: "hired", label: "Hired" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
];

const CHANNEL_OPTIONS = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
];

const nudgeRuleSchema = z.object({
  ruleType: z.string().min(1, "Rule type is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  isActive: z.boolean(),
  triggerAfterHours: z.coerce.number().min(1, "Must be at least 1 hour"),
  maxNudgesPerStage: z.coerce.number().min(1, "Must be at least 1"),
  cooldownHours: z.coerce.number().min(1, "Must be at least 1 hour"),
  channels: z.array(z.string()).min(1, "At least one channel is required"),
  applicableStages: z.array(z.string()).nullable(),
  market: z.string().optional(),
  emailSubjectTemplate: z.string().optional(),
  emailBodyTemplate: z.string().optional(),
  smsTemplate: z.string().optional(),
});

type NudgeRuleFormValues = z.infer<typeof nudgeRuleSchema>;

const defaultFormValues: NudgeRuleFormValues = {
  ruleType: "no_response",
  name: "",
  description: "",
  isActive: true,
  triggerAfterHours: 48,
  maxNudgesPerStage: 3,
  cooldownHours: 24,
  channels: ["email"],
  applicableStages: null,
  market: "",
  emailSubjectTemplate: "",
  emailBodyTemplate: "",
  smsTemplate: "",
};

export function NudgeRulesConfig() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<NudgeRule | null>(null);
  const [scanResults, setScanResults] = useState<NudgeScanResult | null>(null);

  const form = useForm<NudgeRuleFormValues>({
    resolver: zodResolver(nudgeRuleSchema),
    defaultValues: defaultFormValues,
  });

  const { data: rules = [], isLoading } = useQuery<NudgeRule[]>({
    queryKey: ['/api/recruiting/nudge-rules'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: NudgeRuleFormValues) => {
      return apiRequest("POST", "/api/recruiting/nudge-rules", {
        ...data,
        description: data.description || null,
        market: data.market || null,
        emailSubjectTemplate: data.emailSubjectTemplate || null,
        emailBodyTemplate: data.emailBodyTemplate || null,
        smsTemplate: data.smsTemplate || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/nudge-rules'] });
      closeDialog();
      toast({ title: "Nudge rule created", description: "The nudge rule has been created successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create nudge rule", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<NudgeRuleFormValues> }) => {
      return apiRequest("PATCH", `/api/recruiting/nudge-rules/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/nudge-rules'] });
      closeDialog();
      toast({ title: "Nudge rule updated", description: "The nudge rule has been updated successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update nudge rule", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/recruiting/nudge-rules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/nudge-rules'] });
      toast({ title: "Nudge rule deleted", description: "The nudge rule has been deleted." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete nudge rule", variant: "destructive" });
    },
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/recruiting/nudge-scan");
      return res.json();
    },
    onSuccess: (data: NudgeScanResult) => {
      setScanResults(data);
      toast({ title: "Nudge scan complete", description: `Processed ${data.processed}, sent ${data.sent} nudges, ${data.suppressed} suppressed.` });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to run nudge scan", variant: "destructive" });
    },
  });

  function closeDialog() {
    setIsDialogOpen(false);
    setEditingRule(null);
    form.reset(defaultFormValues);
  }

  function openCreateDialog() {
    setEditingRule(null);
    form.reset(defaultFormValues);
    setIsDialogOpen(true);
  }

  function openEditDialog(rule: NudgeRule) {
    setEditingRule(rule);
    form.reset({
      ruleType: rule.ruleType,
      name: rule.name,
      description: rule.description || "",
      isActive: rule.isActive,
      triggerAfterHours: rule.triggerAfterHours,
      maxNudgesPerStage: rule.maxNudgesPerStage,
      cooldownHours: rule.cooldownHours,
      channels: rule.channels,
      applicableStages: rule.applicableStages,
      market: rule.market || "",
      emailSubjectTemplate: rule.emailSubjectTemplate || "",
      emailBodyTemplate: rule.emailBodyTemplate || "",
      smsTemplate: rule.smsTemplate || "",
    });
    setIsDialogOpen(true);
  }

  function onSubmit(values: NudgeRuleFormValues) {
    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, data: values });
    } else {
      createMutation.mutate(values);
    }
  }

  function handleToggleActive(rule: NudgeRule) {
    updateMutation.mutate({ id: rule.id, data: { isActive: !rule.isActive } });
  }

  function handleStageToggle(stage: string) {
    const current = form.getValues("applicableStages") || [];
    if (current.includes(stage)) {
      const updated = current.filter((s) => s !== stage);
      form.setValue("applicableStages", updated.length > 0 ? updated : null);
    } else {
      form.setValue("applicableStages", [...current, stage]);
    }
  }

  function handleChannelToggle(channel: string) {
    const current = form.getValues("channels") || [];
    if (current.includes(channel)) {
      if (current.length > 1) {
        form.setValue("channels", current.filter((c) => c !== channel));
      }
    } else {
      form.setValue("channels", [...current, channel]);
    }
  }

  const ruleTypeLabel = (type: string) => RULE_TYPES.find((r) => r.value === type)?.label || type;
  const stageLabel = (stage: string) => APPLICATION_STAGES.find((s) => s.value === stage)?.label || stage;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" data-testid="loading-spinner" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="nudge-rules-config">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Nudge Rules
            </CardTitle>
            <CardDescription>Configure automated follow-up rules for recruiting candidates</CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
              data-testid="button-run-nudge-scan"
            >
              {scanMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Run Nudge Scan
            </Button>
            <Button onClick={openCreateDialog} data-testid="button-create-nudge-rule">
              <Plus className="mr-2 h-4 w-4" />
              Add Rule
            </Button>
          </div>
        </CardHeader>

        {scanResults && (
          <CardContent className="pt-0 pb-2">
            <Card>
              <CardContent className="py-3">
                <div className="flex items-center gap-4 flex-wrap text-sm">
                  <span data-testid="text-scan-processed">Processed: <strong>{scanResults.processed}</strong></span>
                  <span data-testid="text-scan-nudges">Nudges sent: <strong>{scanResults.sent}</strong></span>
                  <span data-testid="text-scan-suppressed">Suppressed: <strong>{scanResults.suppressed}</strong></span>
                  {scanResults.errors > 0 && (
                    <span className="text-destructive" data-testid="text-scan-errors">Errors: {scanResults.errors}</span>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setScanResults(null)} data-testid="button-dismiss-scan">
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          </CardContent>
        )}

        <CardContent>
          {rules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-rules">
              No nudge rules configured. Click "Add Rule" to create one.
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <Card key={rule.id} data-testid={`card-nudge-rule-${rule.id}`}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium" data-testid={`text-rule-name-${rule.id}`}>{rule.name}</span>
                          <Badge variant="secondary" data-testid={`badge-rule-type-${rule.id}`}>
                            {ruleTypeLabel(rule.ruleType)}
                          </Badge>
                          {rule.channels.map((ch) => (
                            <Badge key={ch} variant="outline" data-testid={`badge-channel-${rule.id}-${ch}`}>
                              {ch === "email" ? <Mail className="mr-1 h-3 w-3" /> : <MessageSquare className="mr-1 h-3 w-3" />}
                              {ch}
                            </Badge>
                          ))}
                        </div>

                        <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
                          <span className="flex items-center gap-1" data-testid={`text-trigger-hours-${rule.id}`}>
                            <Clock className="h-3 w-3" /> Trigger: {rule.triggerAfterHours}h
                          </span>
                          <span className="flex items-center gap-1" data-testid={`text-max-nudges-${rule.id}`}>
                            <Hash className="h-3 w-3" /> Max: {rule.maxNudgesPerStage}/stage
                          </span>
                          <span className="flex items-center gap-1" data-testid={`text-cooldown-${rule.id}`}>
                            <Clock className="h-3 w-3" /> Cooldown: {rule.cooldownHours}h
                          </span>
                        </div>

                        {rule.applicableStages && rule.applicableStages.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap" data-testid={`stages-${rule.id}`}>
                            <span className="text-xs text-muted-foreground mr-1">Stages:</span>
                            {rule.applicableStages.map((stage) => (
                              <Badge key={stage} variant="outline" className="text-xs" data-testid={`badge-stage-${rule.id}-${stage}`}>
                                {stageLabel(stage)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Switch
                          checked={rule.isActive}
                          onCheckedChange={() => handleToggleActive(rule)}
                          data-testid={`switch-active-${rule.id}`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(rule)}
                          data-testid={`button-edit-rule-${rule.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(rule.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-rule-${rule.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-nudge-rule">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit Nudge Rule" : "Create Nudge Rule"}</DialogTitle>
            <DialogDescription>
              {editingRule ? "Update the nudge rule configuration." : "Configure a new automated nudge rule for follow-ups."}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Follow up on no response" {...field} data-testid="input-rule-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="ruleType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rule Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-rule-type">
                          <SelectValue placeholder="Select rule type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {RULE_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value} data-testid={`option-rule-type-${type.value}`}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Optional description" {...field} data-testid="input-rule-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="triggerAfterHours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Trigger After (hours)</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} data-testid="input-trigger-hours" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="maxNudgesPerStage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Nudges / Stage</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} data-testid="input-max-nudges" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cooldownHours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cooldown (hours)</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} data-testid="input-cooldown-hours" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel>Active</FormLabel>
                      <FormDescription>Enable or disable this nudge rule</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-form-active" />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div>
                <FormLabel>Channels</FormLabel>
                <div className="flex items-center gap-3 mt-2">
                  {CHANNEL_OPTIONS.map((ch) => {
                    const selected = form.watch("channels")?.includes(ch.value);
                    return (
                      <Badge
                        key={ch.value}
                        variant={selected ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => handleChannelToggle(ch.value)}
                        data-testid={`toggle-channel-${ch.value}`}
                      >
                        {ch.value === "email" ? <Mail className="mr-1 h-3 w-3" /> : <MessageSquare className="mr-1 h-3 w-3" />}
                        {ch.label}
                      </Badge>
                    );
                  })}
                </div>
                {form.formState.errors.channels && (
                  <p className="text-sm text-destructive mt-1">{form.formState.errors.channels.message}</p>
                )}
              </div>

              <div>
                <FormLabel>Applicable Stages</FormLabel>
                <FormDescription>Select stages this rule applies to (leave empty for all stages)</FormDescription>
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  {APPLICATION_STAGES.map((stage) => {
                    const selected = form.watch("applicableStages")?.includes(stage.value);
                    return (
                      <Badge
                        key={stage.value}
                        variant={selected ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => handleStageToggle(stage.value)}
                        data-testid={`toggle-stage-${stage.value}`}
                      >
                        {stage.label}
                      </Badge>
                    );
                  })}
                </div>
              </div>

              <FormField
                control={form.control}
                name="market"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Market</FormLabel>
                    <FormControl>
                      <Input placeholder="Optional market filter" {...field} data-testid="input-market" />
                    </FormControl>
                    <FormDescription>Leave empty to apply to all markets</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="emailSubjectTemplate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Subject Template</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Follow up: {{candidateName}}" {...field} data-testid="input-email-subject" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="emailBodyTemplate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Body Template</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Email body template..." rows={3} {...field} data-testid="input-email-body" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="smsTemplate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SMS Template</FormLabel>
                    <FormControl>
                      <Textarea placeholder="SMS template..." rows={2} {...field} data-testid="input-sms-template" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog} data-testid="button-cancel-rule">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-rule"
                >
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingRule ? "Update Rule" : "Create Rule"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
