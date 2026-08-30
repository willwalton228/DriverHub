import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Plus, Shield, AlertTriangle, Trash2, Edit2, Clock,
  Calendar, UserCheck, Loader2, Info, Search
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface BlackoutPeriod {
  startDate: string;
  endDate: string;
  reason: string;
}

interface EligibilityRequirement {
  field: string;
  operator: "equals" | "not_equals" | "contains" | "min" | "max";
  value: string;
  label: string;
}

interface ClientRule {
  id: string;
  customerId: string;
  ruleName: string;
  maxShiftLengthHours: string | null;
  eligibilityRequirements: EligibilityRequirement[] | null;
  blackoutPeriods: BlackoutPeriod[] | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RuleViolation {
  ruleId: string;
  ruleName: string;
  customerName: string;
  customerId: string;
  violationType: "max_shift_length" | "driver_eligibility" | "blackout_period";
  severity: "warning";
  shiftId?: string;
  shiftName?: string;
  driverId?: string;
  driverName?: string;
  message: string;
  detail: string;
}

interface Customer {
  id: string;
  customerName: string;
  status: string;
}

const violationTypeConfig = {
  max_shift_length: { label: "Shift Length", icon: Clock },
  driver_eligibility: { label: "Eligibility", icon: UserCheck },
  blackout_period: { label: "Blackout", icon: Calendar },
};

export function ClientRulesTab() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ClientRule | null>(null);
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [warningScheduleId, setWarningScheduleId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [formData, setFormData] = useState({
    customerId: "",
    ruleName: "",
    maxShiftLengthHours: "",
    blackoutStart: "",
    blackoutEnd: "",
    blackoutReason: "",
    blackoutPeriods: [] as BlackoutPeriod[],
    eligibilityRequirements: [] as EligibilityRequirement[],
    eligField: "",
    eligOperator: "equals" as EligibilityRequirement["operator"],
    eligValue: "",
    eligLabel: "",
    isActive: true,
    notes: "",
  });

  const { data: rules = [], isLoading } = useQuery<ClientRule[]>({
    queryKey: ["/api/corporate/scheduling/client-rules", customerFilter],
    queryFn: async () => {
      const params = customerFilter !== "all" ? `?customerId=${customerFilter}` : "";
      const res = await apiRequest("GET", `/api/corporate/scheduling/client-rules${params}`);
      return res.json();
    },
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/corporate/customers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/corporate/customers");
      const data = await res.json();
      return Array.isArray(data) ? data : (data.customers || []);
    },
  });

  const { data: schedules = [] } = useQuery<any[]>({
    queryKey: ["/api/corporate/scheduling/schedules"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/corporate/scheduling/schedules");
      return res.json();
    },
  });

  const { data: warningsData, isLoading: warningsLoading } = useQuery<{ violations: RuleViolation[]; advisory: string }>({
    queryKey: ["/api/corporate/scheduling/client-rules/warnings", warningScheduleId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/corporate/scheduling/client-rules/warnings?scheduleId=${warningScheduleId}`);
      return res.json();
    },
    enabled: !!warningScheduleId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/corporate/scheduling/client-rules", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/client-rules"] });
      setCreateOpen(false);
      resetForm();
      toast({ title: "Rule created", description: "Client rule has been saved." });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/corporate/scheduling/client-rules/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/client-rules"] });
      setEditingRule(null);
      resetForm();
      toast({ title: "Rule updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/corporate/scheduling/client-rules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/client-rules"] });
      toast({ title: "Rule deleted" });
    },
  });

  function resetForm() {
    setFormData({
      customerId: "", ruleName: "", maxShiftLengthHours: "",
      blackoutStart: "", blackoutEnd: "", blackoutReason: "",
      blackoutPeriods: [], eligibilityRequirements: [],
      eligField: "", eligOperator: "equals", eligValue: "", eligLabel: "",
      isActive: true, notes: "",
    });
  }

  function openEdit(rule: ClientRule) {
    setEditingRule(rule);
    setFormData({
      customerId: rule.customerId,
      ruleName: rule.ruleName,
      maxShiftLengthHours: rule.maxShiftLengthHours || "",
      blackoutStart: "", blackoutEnd: "", blackoutReason: "",
      blackoutPeriods: (rule.blackoutPeriods || []) as BlackoutPeriod[],
      eligibilityRequirements: (rule.eligibilityRequirements || []) as EligibilityRequirement[],
      eligField: "", eligOperator: "equals", eligValue: "", eligLabel: "",
      isActive: rule.isActive,
      notes: rule.notes || "",
    });
  }

  function handleSave() {
    const payload = {
      customerId: formData.customerId,
      ruleName: formData.ruleName,
      maxShiftLengthHours: formData.maxShiftLengthHours || null,
      blackoutPeriods: formData.blackoutPeriods.length > 0 ? formData.blackoutPeriods : null,
      eligibilityRequirements: formData.eligibilityRequirements.length > 0 ? formData.eligibilityRequirements : null,
      isActive: formData.isActive,
      notes: formData.notes || null,
    };
    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function addBlackout() {
    if (!formData.blackoutStart || !formData.blackoutEnd) return;
    setFormData(prev => ({
      ...prev,
      blackoutPeriods: [...prev.blackoutPeriods, { startDate: prev.blackoutStart, endDate: prev.blackoutEnd, reason: prev.blackoutReason }],
      blackoutStart: "", blackoutEnd: "", blackoutReason: "",
    }));
  }

  function removeBlackout(idx: number) {
    setFormData(prev => ({
      ...prev,
      blackoutPeriods: prev.blackoutPeriods.filter((_, i) => i !== idx),
    }));
  }

  function addEligibility() {
    if (!formData.eligField || !formData.eligValue || !formData.eligLabel) return;
    setFormData(prev => ({
      ...prev,
      eligibilityRequirements: [...prev.eligibilityRequirements, {
        field: prev.eligField, operator: prev.eligOperator, value: prev.eligValue, label: prev.eligLabel,
      }],
      eligField: "", eligOperator: "equals", eligValue: "", eligLabel: "",
    }));
  }

  function removeEligibility(idx: number) {
    setFormData(prev => ({
      ...prev,
      eligibilityRequirements: prev.eligibilityRequirements.filter((_, i) => i !== idx),
    }));
  }

  const customerMap = new Map(customers.map((c: Customer) => [c.id, c.customerName]));

  const filteredRules = rules.filter(r => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const cName = customerMap.get(r.customerId) || "";
      return r.ruleName.toLowerCase().includes(q) || cName.toLowerCase().includes(q);
    }
    return true;
  });

  const activeRuleCount = rules.filter(r => r.isActive).length;
  const clientsWithRules = new Set(rules.map(r => r.customerId)).size;
  const violations = warningsData?.violations || [];

  return (
    <div className="space-y-6" data-testid="client-rules-tab">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Client-Specific Rules
              </CardTitle>
              <CardDescription>
                Configure scheduling constraints per client. Rules produce advisory warnings during scheduling and publishing.
              </CardDescription>
            </div>
            <Button onClick={() => { resetForm(); setCreateOpen(true); }} data-testid="button-create-rule">
              <Plus className="h-4 w-4 mr-1" />
              Add Rule
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Total Rules</div>
                <div className="text-2xl font-semibold" data-testid="text-total-rules">{rules.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Active Rules</div>
                <div className="text-2xl font-semibold" data-testid="text-active-rules">{activeRuleCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Clients with Rules</div>
                <div className="text-2xl font-semibold" data-testid="text-clients-with-rules">{clientsWithRules}</div>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search rules..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-rules"
              />
            </div>
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-customer-filter">
                <SelectValue placeholder="All Clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clients</SelectItem>
                {customers.map((c: Customer) => (
                  <SelectItem key={c.id} value={c.id}>{c.customerName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRules.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="text-no-rules">
              No client rules configured yet. Click "Add Rule" to create one.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRules.map((rule) => (
                <Card key={rule.id} data-testid={`card-rule-${rule.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium" data-testid={`text-rule-name-${rule.id}`}>{rule.ruleName}</span>
                          <Badge variant={rule.isActive ? "default" : "secondary"}>
                            {rule.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          Client: {customerMap.get(rule.customerId) || rule.customerId}
                        </div>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          {rule.maxShiftLengthHours && (
                            <Badge variant="outline" className="gap-1">
                              <Clock className="h-3 w-3" />
                              Max {rule.maxShiftLengthHours}h shift
                            </Badge>
                          )}
                          {rule.blackoutPeriods && (rule.blackoutPeriods as BlackoutPeriod[]).length > 0 && (
                            <Badge variant="outline" className="gap-1">
                              <Calendar className="h-3 w-3" />
                              {(rule.blackoutPeriods as BlackoutPeriod[]).length} blackout period(s)
                            </Badge>
                          )}
                          {rule.eligibilityRequirements && (rule.eligibilityRequirements as EligibilityRequirement[]).length > 0 && (
                            <Badge variant="outline" className="gap-1">
                              <UserCheck className="h-3 w-3" />
                              {(rule.eligibilityRequirements as EligibilityRequirement[]).length} eligibility req(s)
                            </Badge>
                          )}
                        </div>
                        {rule.notes && (
                          <div className="text-xs text-muted-foreground mt-2">{rule.notes}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(rule)} data-testid={`button-edit-rule-${rule.id}`}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(rule.id)} data-testid={`button-delete-rule-${rule.id}`}>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Rule Warnings Check
          </CardTitle>
          <CardDescription>
            Select a schedule to check for client rule violations. Warnings are advisory only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <Select value={warningScheduleId} onValueChange={setWarningScheduleId}>
              <SelectTrigger className="w-[300px]" data-testid="select-warning-schedule">
                <SelectValue placeholder="Select a schedule" />
              </SelectTrigger>
              <SelectContent>
                {schedules.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {warningScheduleId && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Info className="h-4 w-4" />
                <span>These warnings are advisory only. No automated enforcement is applied.</span>
              </div>

              {warningsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : violations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground" data-testid="text-no-violations">
                  No rule violations found for this schedule.
                </div>
              ) : (
                <div className="space-y-2" data-testid="violations-list">
                  <div className="text-sm font-medium">{violations.length} warning(s) found</div>
                  {violations.map((v, idx) => {
                    const config = violationTypeConfig[v.violationType];
                    const Icon = config.icon;
                    return (
                      <Card key={idx}>
                        <CardContent className="p-3">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">{v.message}</span>
                                <Badge variant="outline" className="gap-1">
                                  <Icon className="h-3 w-3" />
                                  {config.label}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">{v.detail}</div>
                              <div className="text-xs text-muted-foreground mt-1">
                                Rule: {v.ruleName} | Client: {v.customerName}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen || !!editingRule} onOpenChange={(open) => { if (!open) { setCreateOpen(false); setEditingRule(null); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit Rule" : "Create Client Rule"}</DialogTitle>
            <DialogDescription>Configure scheduling constraints for a specific client.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Client</Label>
              <Select value={formData.customerId} onValueChange={(v) => setFormData(p => ({ ...p, customerId: v }))}>
                <SelectTrigger data-testid="select-rule-customer">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c: Customer) => (
                    <SelectItem key={c.id} value={c.id}>{c.customerName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Rule Name</Label>
              <Input
                value={formData.ruleName}
                onChange={(e) => setFormData(p => ({ ...p, ruleName: e.target.value }))}
                placeholder="e.g. Weekend restrictions"
                data-testid="input-rule-name"
              />
            </div>

            <div>
              <Label>Max Shift Length (hours)</Label>
              <Input
                type="number"
                step="0.5"
                value={formData.maxShiftLengthHours}
                onChange={(e) => setFormData(p => ({ ...p, maxShiftLengthHours: e.target.value }))}
                placeholder="e.g. 10"
                data-testid="input-max-shift-length"
              />
            </div>

            <Separator />

            <div>
              <Label className="mb-2 block">Blackout Periods</Label>
              {formData.blackoutPeriods.map((bp, idx) => (
                <div key={idx} className="flex items-center gap-2 mb-2 text-sm">
                  <span className="flex-1">{bp.startDate} to {bp.endDate} ({bp.reason || "No reason"})</span>
                  <Button size="icon" variant="ghost" onClick={() => removeBlackout(idx)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <div className="grid grid-cols-3 gap-2">
                <Input type="date" value={formData.blackoutStart} onChange={(e) => setFormData(p => ({ ...p, blackoutStart: e.target.value }))} data-testid="input-blackout-start" />
                <Input type="date" value={formData.blackoutEnd} onChange={(e) => setFormData(p => ({ ...p, blackoutEnd: e.target.value }))} data-testid="input-blackout-end" />
                <Input placeholder="Reason" value={formData.blackoutReason} onChange={(e) => setFormData(p => ({ ...p, blackoutReason: e.target.value }))} data-testid="input-blackout-reason" />
              </div>
              <Button variant="outline" size="sm" className="mt-2" onClick={addBlackout} data-testid="button-add-blackout">
                <Plus className="h-3 w-3 mr-1" />Add Period
              </Button>
            </div>

            <Separator />

            <div>
              <Label className="mb-2 block">Eligibility Requirements</Label>
              {formData.eligibilityRequirements.map((req, idx) => (
                <div key={idx} className="flex items-center gap-2 mb-2 text-sm">
                  <span className="flex-1">{req.label}: {req.field} {req.operator} "{req.value}"</span>
                  <Button size="icon" variant="ghost" onClick={() => removeEligibility(idx)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Label" value={formData.eligLabel} onChange={(e) => setFormData(p => ({ ...p, eligLabel: e.target.value }))} data-testid="input-elig-label" />
                <Input placeholder="Field name" value={formData.eligField} onChange={(e) => setFormData(p => ({ ...p, eligField: e.target.value }))} data-testid="input-elig-field" />
                <Select value={formData.eligOperator} onValueChange={(v: any) => setFormData(p => ({ ...p, eligOperator: v }))}>
                  <SelectTrigger data-testid="select-elig-operator"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">Equals</SelectItem>
                    <SelectItem value="not_equals">Not Equals</SelectItem>
                    <SelectItem value="contains">Contains</SelectItem>
                    <SelectItem value="min">Min</SelectItem>
                    <SelectItem value="max">Max</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Value" value={formData.eligValue} onChange={(e) => setFormData(p => ({ ...p, eligValue: e.target.value }))} data-testid="input-elig-value" />
              </div>
              <Button variant="outline" size="sm" className="mt-2" onClick={addEligibility} data-testid="button-add-eligibility">
                <Plus className="h-3 w-3 mr-1" />Add Requirement
              </Button>
            </div>

            <Separator />

            <div className="flex items-center gap-3">
              <Switch checked={formData.isActive} onCheckedChange={(v) => setFormData(p => ({ ...p, isActive: v }))} data-testid="switch-rule-active" />
              <Label>Active</Label>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))}
                placeholder="Additional context..."
                data-testid="input-rule-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); setEditingRule(null); resetForm(); }}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={!formData.customerId || !formData.ruleName || createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-rule"
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingRule ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
