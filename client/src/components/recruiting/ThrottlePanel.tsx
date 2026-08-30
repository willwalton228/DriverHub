import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Trash2,
  Save,
  Clock,
  Mail,
  MessageSquare,
  ShieldAlert,
  Ban,
  CheckCircle,
} from "lucide-react";

interface ThrottleRule {
  id: string;
  channel: string;
  maxPerDay: number;
  cooldownMinutes: number;
  appliesToAutomated: boolean;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ThrottleEvent {
  id: string;
  candidateId: string;
  applicationId: string | null;
  channel: string;
  eventType: string;
  reason: string;
  ruleId: string | null;
  actorId: string;
  overrideJustification: string | null;
  dailyCount: number | null;
  nextAllowedAt: string | null;
  createdAt: string;
}

export default function ThrottlePanel({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState("rules");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newRule, setNewRule] = useState({
    channel: "email",
    maxPerDay: 5,
    cooldownMinutes: 60,
    appliesToAutomated: false,
    isActive: true,
  });

  const { data: rules = [], isLoading: rulesLoading } = useQuery<ThrottleRule[]>({
    queryKey: ["/api/recruiting/throttle-rules"],
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery<ThrottleEvent[]>({
    queryKey: ["/api/recruiting/throttle-events"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newRule) => {
      const res = await apiRequest("POST", "/api/recruiting/throttle-rules", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/throttle-rules"] });
      setShowCreateDialog(false);
      setNewRule({ channel: "email", maxPerDay: 5, cooldownMinutes: 60, appliesToAutomated: false, isActive: true });
      toast({ title: "Throttle rule created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ThrottleRule> }) => {
      const res = await apiRequest("PATCH", `/api/recruiting/throttle-rules/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/throttle-rules"] });
      toast({ title: "Rule updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/recruiting/throttle-rules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/throttle-rules"] });
      toast({ title: "Rule deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const channelIcon = (channel: string) =>
    channel === "sms" ? <MessageSquare className="h-4 w-4" /> : <Mail className="h-4 w-4" />;

  return (
    <div className="space-y-4" data-testid="throttle-panel">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold" data-testid="text-throttle-title">Communication Throttling</h2>
          <p className="text-sm text-muted-foreground">
            Prevent over-messaging by setting per-channel daily limits and cooldown windows.
          </p>
        </div>
      </div>

      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList>
          <TabsTrigger value="rules" data-testid="tab-throttle-rules">Rules</TabsTrigger>
          <TabsTrigger value="events" data-testid="tab-throttle-events">Event Log</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-4">
          {isAdmin && (
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-throttle-rule">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Rule
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Throttle Rule</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Channel</Label>
                    <Select value={newRule.channel} onValueChange={(v) => setNewRule({ ...newRule, channel: v })}>
                      <SelectTrigger data-testid="select-throttle-channel">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Max Messages Per Day</Label>
                    <Input
                      type="number"
                      min={1}
                      value={newRule.maxPerDay}
                      onChange={(e) => setNewRule({ ...newRule, maxPerDay: parseInt(e.target.value) || 1 })}
                      data-testid="input-max-per-day"
                    />
                  </div>
                  <div>
                    <Label>Cooldown Between Messages (minutes)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={newRule.cooldownMinutes}
                      onChange={(e) => setNewRule({ ...newRule, cooldownMinutes: parseInt(e.target.value) || 0 })}
                      data-testid="input-cooldown-minutes"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={newRule.appliesToAutomated}
                      onCheckedChange={(v) => setNewRule({ ...newRule, appliesToAutomated: v })}
                      data-testid="switch-applies-automated"
                    />
                    <Label>Apply to automated messages</Label>
                  </div>
                  <Button
                    onClick={() => createMutation.mutate(newRule)}
                    disabled={createMutation.isPending}
                    data-testid="button-save-throttle-rule"
                  >
                    <Save className="h-4 w-4 mr-1.5" />
                    {createMutation.isPending ? "Saving..." : "Save Rule"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {rulesLoading ? (
            <p className="text-sm text-muted-foreground">Loading rules...</p>
          ) : rules.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No throttle rules configured. Messages will be sent without rate limiting.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {rules.map((rule) => (
                <Card key={rule.id} data-testid={`card-throttle-rule-${rule.id}`}>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <div className="flex items-center gap-2">
                      {channelIcon(rule.channel)}
                      <CardTitle className="text-base capitalize">{rule.channel}</CardTitle>
                      <Badge variant={rule.isActive ? "default" : "secondary"}>
                        {rule.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    {isAdmin && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(rule.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-rule-${rule.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Max per day</span>
                      <span className="font-medium" data-testid={`text-max-per-day-${rule.id}`}>{rule.maxPerDay}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Cooldown</span>
                      <span className="font-medium" data-testid={`text-cooldown-${rule.id}`}>{rule.cooldownMinutes} min</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Automated</span>
                      <span className="font-medium">{rule.appliesToAutomated ? "Yes" : "No"}</span>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-2 pt-1">
                        <Switch
                          checked={rule.isActive}
                          onCheckedChange={(v) => updateMutation.mutate({ id: rule.id, data: { isActive: v } })}
                          data-testid={`switch-active-${rule.id}`}
                        />
                        <span className="text-sm">{rule.isActive ? "Enabled" : "Disabled"}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          {eventsLoading ? (
            <p className="text-sm text-muted-foreground">Loading events...</p>
          ) : events.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No throttle events recorded yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {events.map((event) => (
                <Card key={event.id} data-testid={`card-throttle-event-${event.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        {event.eventType === "blocked" ? (
                          <Ban className="h-4 w-4 text-destructive" />
                        ) : (
                          <ShieldAlert className="h-4 w-4 text-yellow-500" />
                        )}
                        <Badge variant={event.eventType === "blocked" ? "destructive" : "outline"}>
                          {event.eventType === "blocked" ? "Blocked" : "Override"}
                        </Badge>
                        {channelIcon(event.channel)}
                        <Badge variant="secondary" className="capitalize">{event.channel}</Badge>
                        <Badge variant="secondary">
                          {event.reason === "daily_limit" ? "Daily Limit" : "Cooldown"}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-2 text-sm space-y-1">
                      <p className="text-muted-foreground">
                        Candidate: <span className="font-mono text-xs">{event.candidateId.slice(0, 8)}...</span>
                        {event.dailyCount !== null && ` | Count: ${event.dailyCount}`}
                      </p>
                      {event.nextAllowedAt && (
                        <p className="text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Next allowed: {new Date(event.nextAllowedAt).toLocaleString()}
                        </p>
                      )}
                      {event.overrideJustification && (
                        <p className="text-muted-foreground italic">
                          Override reason: {event.overrideJustification}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function ThrottleWarning({
  blockedReason,
  nextAllowedAt,
  dailyCount,
  maxPerDay,
}: {
  blockedReason: string;
  nextAllowedAt?: string;
  dailyCount?: number;
  maxPerDay?: number;
}) {
  if (blockedReason !== "throttled") return null;

  return (
    <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20" data-testid="throttle-warning">
      <Ban className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
      <div className="text-sm">
        <p className="font-medium text-destructive">Message throttled</p>
        {dailyCount !== undefined && maxPerDay !== undefined && (
          <p className="text-muted-foreground">Daily limit: {dailyCount}/{maxPerDay} messages sent today.</p>
        )}
        {nextAllowedAt && (
          <p className="text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Next allowed: {new Date(nextAllowedAt).toLocaleString()}
          </p>
        )}
        <p className="text-muted-foreground mt-1">Admin users can override this limit with a justification.</p>
      </div>
    </div>
  );
}
