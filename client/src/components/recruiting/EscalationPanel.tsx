import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Plus,
  Trash2,
  UserCheck,
  Users,
  ArrowRightLeft,
  Eye,
  Zap,
  Shield,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function statusBadge(status: string) {
  switch (status) {
    case "open":
      return <Badge variant="destructive" data-testid="badge-status-open">Open</Badge>;
    case "acknowledged":
      return <Badge variant="secondary" data-testid="badge-status-acknowledged">Acknowledged</Badge>;
    case "reassigned":
      return <Badge data-testid="badge-status-reassigned">Reassigned</Badge>;
    case "resolved":
      return <Badge variant="outline" data-testid="badge-status-resolved">Resolved</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function triggerBadge(triggerType: string) {
  if (triggerType === "sla_breach") {
    return <Badge variant="destructive" className="gap-1" data-testid="badge-trigger-sla"><Clock className="h-3 w-3" /> SLA Breach</Badge>;
  }
  return <Badge variant="secondary" className="gap-1" data-testid="badge-trigger-workload"><Users className="h-3 w-3" /> Workload</Badge>;
}

export default function EscalationPanel({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<"events" | "rules">("events");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreateRule, setShowCreateRule] = useState(false);
  const [resolveDialogId, setResolveDialogId] = useState<string | null>(null);
  const [resolveReason, setResolveReason] = useState("");
  const [reassignDialogId, setReassignDialogId] = useState<string | null>(null);
  const [selectedRecruiterId, setSelectedRecruiterId] = useState("");

  const [newRule, setNewRule] = useState({
    name: "",
    description: "",
    triggerType: "sla_breach",
    thresholdValue: 0,
    actionType: "notify_admin",
  });

  const { data: rules = [] } = useQuery<any[]>({
    queryKey: ["/api/recruiting/escalation-rules"],
  });

  const { data: eventsData } = useQuery<{ events: any[]; total: number }>({
    queryKey: ["/api/recruiting/escalation-events", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", "100");
      const res = await fetch(`/api/recruiting/escalation-events?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: workloads = [] } = useQuery<any[]>({
    queryKey: ["/api/recruiting/recruiter-workloads"],
  });

  const events = eventsData?.events || [];

  const createRuleMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/recruiting/escalation-rules", data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/escalation-rules"] });
      toast({ title: "Rule created" });
      setShowCreateRule(false);
      setNewRule({ name: "", description: "", triggerType: "sla_breach", thresholdValue: 0, actionType: "notify_admin" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/recruiting/escalation-rules/${id}`);
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/escalation-rules"] });
      toast({ title: "Rule deleted" });
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/recruiting/escalation-rules/${id}`, { isActive });
      if (!res.ok) throw new Error("Failed to update");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/escalation-rules"] });
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/recruiting/escalation-events/${id}/acknowledge`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/escalation-events"] });
      toast({ title: "Escalation acknowledged" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const reassignMutation = useMutation({
    mutationFn: async ({ id, newOwnerId }: { id: string; newOwnerId: string }) => {
      const res = await apiRequest("POST", `/api/recruiting/escalation-events/${id}/reassign`, { newOwnerId });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/escalation-events"] });
      toast({ title: "Application reassigned" });
      setReassignDialogId(null);
      setSelectedRecruiterId("");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/recruiting/escalation-events/${id}/resolve`, { reason });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/escalation-events"] });
      toast({ title: "Escalation resolved" });
      setResolveDialogId(null);
      setResolveReason("");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const detectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/recruiting/escalation-detect");
      if (!res.ok) throw new Error("Failed to detect");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/escalation-events"] });
      toast({ title: "Detection complete", description: `${data.triggered} new escalation(s) triggered` });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const openCount = events.filter((e: any) => e.status === "open").length;
  const acknowledgedCount = events.filter((e: any) => e.status === "acknowledged").length;

  return (
    <div className="space-y-4" data-testid="escalation-panel">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">Escalation Paths</h3>
          {openCount > 0 && (
            <Badge variant="destructive" data-testid="badge-open-count">{openCount} Open</Badge>
          )}
          {acknowledgedCount > 0 && (
            <Badge variant="secondary" data-testid="badge-acknowledged-count">{acknowledgedCount} Acknowledged</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={activeSection === "events" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveSection("events")}
            data-testid="button-show-events"
          >
            <AlertTriangle className="h-4 w-4 mr-1" />
            Events
          </Button>
          <Button
            variant={activeSection === "rules" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveSection("rules")}
            data-testid="button-show-rules"
          >
            <Shield className="h-4 w-4 mr-1" />
            Rules
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => detectMutation.mutate()}
              disabled={detectMutation.isPending}
              data-testid="button-detect-escalations"
            >
              <Zap className="h-4 w-4 mr-1" />
              {detectMutation.isPending ? "Scanning..." : "Run Detection"}
            </Button>
          )}
        </div>
      </div>

      {activeSection === "events" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Label className="text-sm text-muted-foreground">Filter:</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="acknowledged">Acknowledged</SelectItem>
                <SelectItem value="reassigned">Reassigned</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {events.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No escalation events found</p>
                <p className="text-sm mt-1">Run detection to check for SLA breaches or workload issues</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {events.map((event: any) => (
                <Card key={event.id} data-testid={`escalation-event-${event.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {triggerBadge(event.triggerType)}
                          {statusBadge(event.status)}
                          <span className="text-xs text-muted-foreground">
                            {new Date(event.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-sm">
                          <span className="font-medium">{event.ruleName}</span>
                          {event.candidateName && (
                            <span className="text-muted-foreground"> — {event.candidateName}</span>
                          )}
                        </div>
                        {event.triggerDetails && (
                          <div className="text-xs text-muted-foreground space-x-3">
                            {event.triggerType === "sla_breach" && (
                              <>
                                <span>Stage: {(event.triggerDetails as any).currentStage}</span>
                                <span>Breached by: {(event.triggerDetails as any).breachedByHours}h</span>
                                <span>SLA: {(event.triggerDetails as any).stageSlaHours}h</span>
                              </>
                            )}
                            {event.triggerType === "workload_exceeded" && (
                              <>
                                <span>Recruiter: {(event.triggerDetails as any).recruiterEmail}</span>
                                <span>Active: {(event.triggerDetails as any).activeApplications}</span>
                                <span>Threshold: {(event.triggerDetails as any).threshold}</span>
                              </>
                            )}
                          </div>
                        )}
                        {event.originalOwnerEmail && (
                          <p className="text-xs text-muted-foreground">Owner: {event.originalOwnerEmail}</p>
                        )}
                        {event.reassignedToEmail && (
                          <p className="text-xs text-muted-foreground">Reassigned to: {event.reassignedToEmail}</p>
                        )}
                        {event.resolvedReason && (
                          <p className="text-xs text-muted-foreground">Resolution: {event.resolvedReason}</p>
                        )}
                      </div>
                      {isAdmin && event.status !== "resolved" && (
                        <div className="flex items-center gap-1 flex-wrap">
                          {event.status === "open" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => acknowledgeMutation.mutate(event.id)}
                              disabled={acknowledgeMutation.isPending}
                              data-testid={`button-acknowledge-${event.id}`}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              Acknowledge
                            </Button>
                          )}
                          {event.applicationId && (
                            <Dialog open={reassignDialogId === event.id} onOpenChange={(open) => {
                              if (!open) setReassignDialogId(null);
                            }}>
                              <DialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setReassignDialogId(event.id)}
                                  data-testid={`button-reassign-${event.id}`}
                                >
                                  <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />
                                  Reassign
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Reassign Application</DialogTitle>
                                  <DialogDescription>
                                    Choose a recruiter to take over this application.
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-3 py-2">
                                  <Label>Assign to Recruiter</Label>
                                  <Select value={selectedRecruiterId} onValueChange={setSelectedRecruiterId}>
                                    <SelectTrigger data-testid="select-reassign-recruiter">
                                      <SelectValue placeholder="Select recruiter..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {workloads.map((w: any) => (
                                        <SelectItem key={w.recruiterId} value={w.recruiterId}>
                                          {w.email} ({w.activeCount} active)
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <DialogFooter>
                                  <Button
                                    onClick={() => reassignMutation.mutate({ id: event.id, newOwnerId: selectedRecruiterId })}
                                    disabled={!selectedRecruiterId || reassignMutation.isPending}
                                    data-testid="button-confirm-reassign"
                                  >
                                    <UserCheck className="h-4 w-4 mr-1" />
                                    Confirm Reassignment
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          )}
                          <Dialog open={resolveDialogId === event.id} onOpenChange={(open) => {
                            if (!open) setResolveDialogId(null);
                          }}>
                            <DialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setResolveDialogId(event.id)}
                                data-testid={`button-resolve-${event.id}`}
                              >
                                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                Resolve
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Resolve Escalation</DialogTitle>
                                <DialogDescription>
                                  Provide a reason for resolving this escalation.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-3 py-2">
                                <Label>Resolution Reason</Label>
                                <Textarea
                                  value={resolveReason}
                                  onChange={(e) => setResolveReason(e.target.value)}
                                  placeholder="Describe what was done to resolve this escalation..."
                                  data-testid="input-resolve-reason"
                                />
                              </div>
                              <DialogFooter>
                                <Button
                                  onClick={() => resolveMutation.mutate({ id: event.id, reason: resolveReason })}
                                  disabled={!resolveReason.trim() || resolveMutation.isPending}
                                  data-testid="button-confirm-resolve"
                                >
                                  Confirm Resolution
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeSection === "rules" && (
        <div className="space-y-4">
          {isAdmin && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setShowCreateRule(true)} data-testid="button-create-rule">
                <Plus className="h-4 w-4 mr-1" />
                Add Rule
              </Button>
            </div>
          )}

          {showCreateRule && (
            <Card data-testid="card-create-rule">
              <CardHeader>
                <CardTitle className="text-base">New Escalation Rule</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label>Name</Label>
                    <Input
                      value={newRule.name}
                      onChange={(e) => setNewRule(r => ({ ...r, name: e.target.value }))}
                      placeholder="e.g., SLA Breach 4h Escalation"
                      data-testid="input-rule-name"
                    />
                  </div>
                  <div>
                    <Label>Trigger Type</Label>
                    <Select
                      value={newRule.triggerType}
                      onValueChange={(v) => setNewRule(r => ({ ...r, triggerType: v }))}
                    >
                      <SelectTrigger data-testid="select-trigger-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sla_breach">SLA Breach (hours past breach)</SelectItem>
                        <SelectItem value="workload_exceeded">Workload Exceeded (max active apps)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>
                      {newRule.triggerType === "sla_breach"
                        ? "Hours Past SLA Breach"
                        : "Max Active Applications"}
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={newRule.thresholdValue || ""}
                      onChange={(e) => setNewRule(r => ({ ...r, thresholdValue: parseInt(e.target.value) || 0 }))}
                      placeholder={newRule.triggerType === "sla_breach" ? "e.g., 4" : "e.g., 50"}
                      data-testid="input-threshold-value"
                    />
                  </div>
                  <div>
                    <Label>Action</Label>
                    <Select
                      value={newRule.actionType}
                      onValueChange={(v) => setNewRule(r => ({ ...r, actionType: v }))}
                    >
                      <SelectTrigger data-testid="select-action-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="notify_admin">Notify Admin</SelectItem>
                        <SelectItem value="reassign_eligible">Flag for Reassignment</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Description (optional)</Label>
                  <Textarea
                    value={newRule.description}
                    onChange={(e) => setNewRule(r => ({ ...r, description: e.target.value }))}
                    placeholder="Describe when and why this rule should trigger..."
                    data-testid="input-rule-description"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setShowCreateRule(false)} data-testid="button-cancel-rule">
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => createRuleMutation.mutate(newRule)}
                    disabled={!newRule.name || !newRule.thresholdValue || createRuleMutation.isPending}
                    data-testid="button-save-rule"
                  >
                    Save Rule
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {rules.length === 0 && !showCreateRule ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No escalation rules configured</p>
                <p className="text-sm mt-1">Add rules to automatically detect SLA breaches and workload issues</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {rules.map((rule: any) => (
                <Card key={rule.id} data-testid={`escalation-rule-${rule.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{rule.name}</span>
                          {rule.triggerType === "sla_breach"
                            ? <Badge variant="destructive" className="gap-1"><Clock className="h-3 w-3" /> SLA Breach</Badge>
                            : <Badge variant="secondary" className="gap-1"><Users className="h-3 w-3" /> Workload</Badge>
                          }
                          {rule.isActive
                            ? <Badge variant="outline" className="text-green-600 border-green-300">Active</Badge>
                            : <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
                          }
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Threshold: {rule.thresholdValue} {rule.triggerType === "sla_breach" ? "hours past breach" : "active applications"}
                          {" | "}Action: {rule.actionType === "notify_admin" ? "Notify Admin" : "Flag for Reassignment"}
                        </p>
                        {rule.description && (
                          <p className="text-xs text-muted-foreground">{rule.description}</p>
                        )}
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => toggleRuleMutation.mutate({ id: rule.id, isActive: !rule.isActive })}
                            data-testid={`button-toggle-rule-${rule.id}`}
                          >
                            {rule.isActive ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() => deleteRuleMutation.mutate(rule.id)}
                            data-testid={`button-delete-rule-${rule.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {workloads.length > 0 && (
            <Card data-testid="card-workload-summary">
              <CardHeader>
                <CardTitle className="text-base">Recruiter Workload Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {workloads.map((w: any) => (
                    <div key={w.recruiterId} className="flex items-center justify-between gap-2 text-sm" data-testid={`workload-${w.recruiterId}`}>
                      <span className="text-muted-foreground truncate">{w.email}</span>
                      <Badge variant={w.activeCount > 40 ? "destructive" : "secondary"}>
                        {w.activeCount} active
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export function EscalationBanner({ applicationId }: { applicationId: string }) {
  const { data: escalations = [] } = useQuery<any[]>({
    queryKey: ["/api/recruiting/applications", applicationId, "escalations"],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/applications/${applicationId}/escalations`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const openEscalations = escalations.filter((e: any) => e.status !== "resolved");

  if (openEscalations.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-md" data-testid={`escalation-banner-${applicationId}`}>
      <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
      <span className="text-sm text-destructive font-medium">
        {openEscalations.length} active escalation{openEscalations.length > 1 ? "s" : ""}
      </span>
      {openEscalations.map((e: any) => (
        <Badge key={e.id} variant="destructive" className="text-xs">
          {e.triggerType === "sla_breach" ? "SLA Breach" : "Workload"}
          {e.status === "acknowledged" ? " (Ack)" : e.status === "reassigned" ? " (Reassigned)" : ""}
        </Badge>
      ))}
    </div>
  );
}
