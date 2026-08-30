import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Mail, Zap, Clock, ChevronDown, ChevronUp, Calendar,
  AlertTriangle, RefreshCw, Users, FileText, CheckCircle2,
  XCircle, Shield
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SystemAutomation {
  id: string;
  automation_key: string;
  name: string;
  category: string;
  comm_type: string;
  trigger_event: string | null;
  trigger_config: Record<string, any>;
  sender_profile: string;
  recipient_config: any[];
  template_slug: string | null;
  schedule_config: Record<string, any>;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface ReportCampaign {
  id: string;
  campaign_name: string;
  sender_profile: string;
  status: string;
  schedule_type: string;
  schedule_day: string | null;
  schedule_time: string | null;
  timezone: string | null;
  last_run_at: string | null;
  account_count: number;
}

interface AutomationsData {
  systemAutomations: SystemAutomation[];
  reportCampaigns: ReportCampaign[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SENDER_PROFILES = ["Reports", "Data", "Support", "Dispatch", "Recruiting"];

function formatDate(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function getTriggerLabel(a: SystemAutomation): string {
  if (a.trigger_event) return a.trigger_event.replace(/_/g, " ");
  const sc = a.schedule_config as any;
  if (sc?.day && sc?.time) return `Weekly — ${sc.day} ${sc.time}`;
  if (sc?.cron) return `Scheduled (${sc.cron})`;
  return "Scheduled";
}

function getCampaignTriggerLabel(c: ReportCampaign): string {
  if (c.schedule_type === "weekly" && c.schedule_day && c.schedule_time) {
    return `Weekly — ${c.schedule_day} ${c.schedule_time}`;
  }
  return c.schedule_type ? `${c.schedule_type.charAt(0).toUpperCase()}${c.schedule_type.slice(1)}` : "Scheduled";
}

function getCategoryIcon(category: string) {
  if (category === "Claims") return <Shield className="w-4 h-4" />;
  if (category === "Driver Scheduling") return <Calendar className="w-4 h-4" />;
  if (category === "Account Reports") return <FileText className="w-4 h-4" />;
  return <Zap className="w-4 h-4" />;
}

// ── Single Automation Row ─────────────────────────────────────────────────────

function AutomationRow({ automation, onUpdate }: {
  automation: SystemAutomation;
  onUpdate: (id: string, patch: Partial<SystemAutomation>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [senderDraft, setSenderDraft] = useState(automation.sender_profile);
  const { toast } = useToast();
  const qc = useQueryClient();

  const patchMutation = useMutation({
    mutationFn: (patch: Record<string, any>) =>
      apiRequest("PATCH", `/api/admin/comm-automations/${automation.id}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/comm-automations"] });
      toast({ title: "Automation updated" });
    },
    onError: () => {
      toast({ title: "Update failed", variant: "destructive" });
    },
  });

  const handleToggle = (val: boolean) => {
    onUpdate(automation.id, { enabled: val });
    patchMutation.mutate({ enabled: val });
  };

  const handleSenderSave = () => {
    patchMutation.mutate({ sender_profile: senderDraft });
  };

  const triggerLabel = getTriggerLabel(automation);
  const isScheduled = !automation.trigger_event;

  return (
    <div className="border rounded-md overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 hover-elevate cursor-pointer"
        onClick={() => setExpanded(v => !v)}
        data-testid={`automation-row-${automation.automation_key}`}
      >
        <div className="flex-1 min-w-0 grid grid-cols-6 gap-3 items-center">
          {/* Name */}
          <div className="col-span-2 flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium truncate">{automation.name}</span>
            {automation.description && (
              <span className="sr-only">{automation.description}</span>
            )}
          </div>

          {/* Comm Type */}
          <div className="flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground capitalize">{automation.comm_type}</span>
          </div>

          {/* Trigger */}
          <div className="flex items-center gap-1.5 min-w-0">
            {isScheduled
              ? <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              : <Zap className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            }
            <span className="text-sm text-muted-foreground truncate">{triggerLabel}</span>
          </div>

          {/* Sender */}
          <div>
            <Badge variant="outline" className="text-xs">{automation.sender_profile}</Badge>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            {automation.enabled
              ? <CheckCircle2 className="w-4 h-4 text-green-500" />
              : <XCircle className="w-4 h-4 text-muted-foreground" />
            }
            <span className={`text-sm ${automation.enabled ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
              {automation.enabled ? "Active" : "Disabled"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Switch
            checked={automation.enabled}
            onCheckedChange={handleToggle}
            onClick={e => e.stopPropagation()}
            data-testid={`toggle-${automation.automation_key}`}
          />
          {expanded
            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground" />
          }
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t bg-muted/30">
          {automation.description && (
            <p className="text-sm text-muted-foreground pt-3 pb-4">{automation.description}</p>
          )}

          <div className="grid grid-cols-2 gap-6">
            {/* Left: Run info */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Run History</h4>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Last Run</span>
                  <span className="font-medium">{formatDate(automation.last_run_at)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Next Run</span>
                  <span className="font-medium">{formatDate(automation.next_run_at)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Trigger</span>
                  <span className="font-medium">{triggerLabel}</span>
                </div>
                {automation.template_slug && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Template</span>
                    <Badge variant="outline" className="text-xs font-mono">{automation.template_slug}</Badge>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Configuration */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Configuration</h4>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Sender Profile</Label>
                  <div className="flex gap-2">
                    <Select value={senderDraft} onValueChange={setSenderDraft}>
                      <SelectTrigger className="h-9 text-sm" data-testid={`select-sender-${automation.automation_key}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SENDER_PROFILES.map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {senderDraft !== automation.sender_profile && (
                      <Button size="sm" onClick={handleSenderSave} disabled={patchMutation.isPending}
                        data-testid={`save-sender-${automation.automation_key}`}>
                        Save
                      </Button>
                    )}
                  </div>
                </div>

                {isScheduled && (
                  <div className="space-y-1">
                    <Label className="text-xs">Schedule</Label>
                    <div className="text-sm text-muted-foreground rounded-md bg-muted px-3 py-2">
                      {(() => {
                        const sc = automation.schedule_config as any;
                        if (sc?.day && sc?.time) return `Every ${sc.day} at ${sc.time} ${sc.timezone ? `(${sc.timezone})` : ""}`;
                        if (sc?.cron) return `Cron: ${sc.cron}`;
                        return "Not configured";
                      })()}
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={automation.enabled}
                      onCheckedChange={handleToggle}
                      data-testid={`toggle-expanded-${automation.automation_key}`}
                    />
                    <span className="text-sm">{automation.enabled ? "Enabled" : "Disabled"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Campaign Row (Account Reports) ────────────────────────────────────────────

function CampaignRow({ campaign }: { campaign: ReportCampaign }) {
  const [expanded, setExpanded] = useState(false);
  const isActive = campaign.status === "active";

  return (
    <div className="border rounded-md overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 hover-elevate cursor-pointer"
        onClick={() => setExpanded(v => !v)}
        data-testid={`campaign-row-${campaign.id}`}
      >
        <div className="flex-1 min-w-0 grid grid-cols-6 gap-3 items-center">
          <div className="col-span-2 flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium truncate">{campaign.campaign_name}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">Email</span>
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground truncate">{getCampaignTriggerLabel(campaign)}</span>
          </div>
          <div>
            <Badge variant="outline" className="text-xs">{campaign.sender_profile || "Reports"}</Badge>
          </div>
          <div className="flex items-center gap-2">
            {isActive
              ? <CheckCircle2 className="w-4 h-4 text-green-500" />
              : <XCircle className="w-4 h-4 text-muted-foreground" />
            }
            <span className={`text-sm ${isActive ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
              {isActive ? "Active" : campaign.status || "Inactive"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Badge variant="secondary" className="text-xs">{campaign.account_count} acct{campaign.account_count !== 1 ? "s" : ""}</Badge>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground" />
          }
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t bg-muted/30">
          <div className="grid grid-cols-2 gap-6 pt-3">
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Run History</h4>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Last Run</span>
                <span className="font-medium">{formatDate(campaign.last_run_at)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Schedule</span>
                <span className="font-medium">{getCampaignTriggerLabel(campaign)}</span>
              </div>
              {campaign.timezone && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Timezone</span>
                  <span className="font-medium">{campaign.timezone}</span>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Details</h4>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sender Profile</span>
                <Badge variant="outline" className="text-xs">{campaign.sender_profile || "Reports"}</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Accounts</span>
                <span className="font-medium">{campaign.account_count}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium capitalize">{campaign.status}</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Manage this campaign from the Account Reports module.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Category Section ──────────────────────────────────────────────────────────

function CategorySection({ title, category, automations, onUpdate, children }: {
  title: string;
  category: string;
  automations?: SystemAutomation[];
  onUpdate?: (id: string, patch: Partial<SystemAutomation>) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 pb-1">
        <div className="text-muted-foreground">{getCategoryIcon(category)}</div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {automations && (
          <Badge variant="secondary" className="text-xs ml-auto">
            {automations.filter(a => a.enabled).length} / {automations.length} active
          </Badge>
        )}
      </div>
      {automations?.map(a => (
        <AutomationRow key={a.id} automation={a} onUpdate={onUpdate!} />
      ))}
      {children}
    </div>
  );
}

// ── Grid Header ───────────────────────────────────────────────────────────────

function GridHeader() {
  return (
    <div className="grid grid-cols-6 gap-3 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground border-b">
      <div className="col-span-2">Automation Name</div>
      <div>Comm Type</div>
      <div>Trigger</div>
      <div>Sender</div>
      <div>Status</div>
    </div>
  );
}

// ── Main AutomationsView ──────────────────────────────────────────────────────

export function AutomationsView() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<AutomationsData>({
    queryKey: ["/api/admin/comm-automations"],
  });

  const [localAutomations, setLocalAutomations] = useState<SystemAutomation[] | null>(null);

  const automations = localAutomations ?? data?.systemAutomations ?? [];
  const campaigns = data?.reportCampaigns ?? [];

  const handleUpdate = (id: string, patch: Partial<SystemAutomation>) => {
    setLocalAutomations(prev => {
      const source = prev ?? data?.systemAutomations ?? [];
      return source.map(a => a.id === id ? { ...a, ...patch } : a);
    });
  };

  const byCategory = (cat: string) => automations.filter(a => a.category === cat);

  const claimsAutomations = byCategory("Claims");
  const schedulingAutomations = byCategory("Driver Scheduling");
  const arSystemAutomations = byCategory("Account Reports");

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-12 bg-muted animate-pulse rounded-md" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Failed to load automations. Check your permissions.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Communication Automations</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage all outbound email and notification triggers across claims, scheduling, and reporting.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-automations">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">System Automations</CardTitle>
            <Zap className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{automations.filter(a => a.enabled).length}</div>
            <p className="text-xs text-muted-foreground">of {automations.length} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Report Campaigns</CardTitle>
            <FileText className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campaigns.filter(c => c.status === "active").length}</div>
            <p className="text-xs text-muted-foreground">of {campaigns.length} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Recipients</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campaigns.reduce((s, c) => s + (c.account_count || 0), 0)}</div>
            <p className="text-xs text-muted-foreground">accounts in active campaigns</p>
          </CardContent>
        </Card>
      </div>

      {/* Automation Grid */}
      <Card>
        <CardContent className="p-0">
          <GridHeader />
          <div className="p-4 space-y-6">

            {/* Claims */}
            {claimsAutomations.length > 0 && (
              <CategorySection
                title="Claims"
                category="Claims"
                automations={claimsAutomations}
                onUpdate={handleUpdate}
              />
            )}

            {/* Driver Scheduling */}
            {schedulingAutomations.length > 0 && (
              <>
                {claimsAutomations.length > 0 && <Separator />}
                <CategorySection
                  title="Driver Scheduling"
                  category="Driver Scheduling"
                  automations={schedulingAutomations}
                  onUpdate={handleUpdate}
                />
              </>
            )}

            {/* Account Reports — System Automations */}
            {(arSystemAutomations.length > 0 || campaigns.length > 0) && (
              <>
                {(claimsAutomations.length > 0 || schedulingAutomations.length > 0) && <Separator />}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 pb-1">
                    <div className="text-muted-foreground">{getCategoryIcon("Account Reports")}</div>
                    <h3 className="text-sm font-semibold">Account Reports</h3>
                    <Badge variant="secondary" className="text-xs ml-auto">
                      {campaigns.filter(c => c.status === "active").length + arSystemAutomations.filter(a => a.enabled).length} active
                    </Badge>
                  </div>

                  {/* System Automations for AR (failure alerts, recipient updates) */}
                  {arSystemAutomations.map(a => (
                    <AutomationRow key={a.id} automation={a} onUpdate={handleUpdate} />
                  ))}

                  {/* Active Campaigns */}
                  {campaigns.length > 0 && (
                    <>
                      {arSystemAutomations.length > 0 && (
                        <div className="flex items-center gap-2 py-1">
                          <div className="h-px flex-1 bg-border" />
                          <span className="text-xs text-muted-foreground px-2">Active Campaigns ({campaigns.length})</span>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                      )}
                      {campaigns.map(c => (
                        <CampaignRow key={c.id} campaign={c} />
                      ))}
                    </>
                  )}

                  {arSystemAutomations.length === 0 && campaigns.length === 0 && (
                    <div className="rounded-md border border-dashed p-6 text-center">
                      <FileText className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No account report campaigns configured.</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {automations.length === 0 && campaigns.length === 0 && (
              <div className="rounded-md border border-dashed p-8 text-center">
                <Zap className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No automations configured yet.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
