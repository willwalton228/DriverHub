import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Shield, User, Calendar, ArrowRight, CheckCircle2, AlertTriangle,
  Clock, RotateCcw, History,
} from "lucide-react";
import { format, parseISO, isWithinInterval } from "date-fns";

const ROLE_LABELS: Record<string, string> = {
  super_user:      "Super User",
  super_admin:     "Super Admin",
  root_super_admin:"Root Admin",
  corporate_admin: "Corporate Admin",
  admin:           "Admin",
  manager:         "Manager",
  coo:             "COO",
  ceo:             "CEO",
  owner:           "Owner",
};

function safeDate(v: string | null | undefined, withTime = false) {
  if (!v) return "—";
  try {
    const d = v.includes("T") ? parseISO(v) : new Date(v + "T00:00:00");
    return withTime ? format(d, "MMM d, yyyy h:mm a") : format(d, "MMM d, yyyy");
  } catch { return v; }
}

function isDelegationCurrentlyActive(settings: any): boolean {
  if (!settings?.delegationEnabled) return false;
  if (!settings.delegationStartDate || !settings.delegationEndDate) return false;
  const today = new Date();
  try {
    const start = new Date(settings.delegationStartDate + "T00:00:00");
    const end   = new Date(settings.delegationEndDate   + "T23:59:59");
    return isWithinInterval(today, { start, end });
  } catch { return false; }
}

function ChangeTypeBadge({ type }: { type: string }) {
  if (type === "delegation_enabled")  return <Badge variant="default"  className="text-[10px] bg-orange-500 hover:bg-orange-500">Delegation On</Badge>;
  if (type === "delegation_disabled") return <Badge variant="outline"  className="text-[10px]">Delegation Off</Badge>;
  return <Badge variant="secondary" className="text-[10px]">Settings Updated</Badge>;
}

export function ApprovalOwnershipSettings() {
  const { toast } = useToast();

  const { data: settingsData, isLoading } = useQuery<any>({
    queryKey: ["/api/recruiting/approval-settings"],
    queryFn: () => fetch("/api/recruiting/approval-settings").then((r) => {
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    }),
  });

  const { data: approverUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/recruiting/approval-settings/approver-users"],
    queryFn: () => fetch("/api/recruiting/approval-settings/approver-users").then((r) => r.json()),
  });

  const { data: auditLog = [] } = useQuery<any[]>({
    queryKey: ["/api/recruiting/approval-settings/audit"],
    queryFn: () => fetch("/api/recruiting/approval-settings/audit").then((r) => r.json()),
  });

  // Form state
  const [primaryApproverUserId,  setPrimaryApproverUserId]  = useState("");
  const [backupApproverUserId,   setBackupApproverUserId]   = useState("");
  const [delegationEnabled,      setDelegationEnabled]      = useState(false);
  const [delegationStartDate,    setDelegationStartDate]    = useState("");
  const [delegationEndDate,      setDelegationEndDate]      = useState("");
  const [delegationReason,       setDelegationReason]       = useState("");
  const [dirty,                  setDirty]                  = useState(false);

  // Populate form from loaded settings
  useEffect(() => {
    if (settingsData?.settings) {
      const s = settingsData.settings;
      setPrimaryApproverUserId(s.primaryApproverUserId ?? "");
      setBackupApproverUserId(s.backupApproverUserId   ?? "");
      setDelegationEnabled(s.delegationEnabled         ?? false);
      setDelegationStartDate(s.delegationStartDate     ?? "");
      setDelegationEndDate(s.delegationEndDate         ?? "");
      setDelegationReason(s.delegationReason           ?? "");
      setDirty(false);
    }
  }, [settingsData]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const primaryUser  = approverUsers.find(u => u.id === primaryApproverUserId);
      const backupUser   = approverUsers.find(u => u.id === backupApproverUserId);
      return apiRequest("PUT", "/api/recruiting/approval-settings", {
        primaryApproverUserId: primaryApproverUserId || null,
        primaryApproverName:   primaryUser?.displayName ?? null,
        backupApproverUserId:  backupApproverUserId || null,
        backupApproverName:    backupUser?.displayName ?? null,
        delegationEnabled,
        delegationStartDate:   delegationEnabled ? delegationStartDate || null : null,
        delegationEndDate:     delegationEnabled ? delegationEndDate   || null : null,
        delegationReason:      delegationEnabled ? delegationReason    || null : null,
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/approval-settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/approval-settings/audit"] });
      toast({ title: "Approval settings saved", description: "Routing changes take effect immediately." });
      setDirty(false);
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  function mark() { setDirty(true); }

  const settings       = settingsData?.settings ?? {};
  const activeApprover = settingsData?.activeApprover ?? {};
  const isActiveNow    = isDelegationCurrentlyActive(settings);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />Loading approval settings…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5" data-testid="section-approval-ownership-settings">

      {/* ── Active approver banner ── */}
      <Card className={isActiveNow
        ? "border-orange-200 dark:border-orange-800 bg-orange-50/40 dark:bg-orange-900/10"
        : "border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-900/10"}>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-2.5">
              {isActiveNow
                ? <ArrowRight className="h-4 w-4 text-orange-500 shrink-0" />
                : <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {isActiveNow ? "Active: Delegated Approver" : "Active: Primary Approver"}
                </p>
                <p className="text-sm font-medium text-foreground mt-0.5">
                  {activeApprover.name || activeApprover.userId || (
                    <span className="text-muted-foreground font-normal">Not configured — approval notifications are safely suppressed</span>
                  )}
                </p>
              </div>
            </div>
            {isActiveNow && (
              <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 text-[10px]">
                Delegation Active
              </Badge>
            )}
          </div>
          {isActiveNow && settings.delegationStartDate && settings.delegationEndDate && (
            <p className="text-xs text-muted-foreground mt-1.5 ml-7">
              {safeDate(settings.delegationStartDate)} — {safeDate(settings.delegationEndDate)}
              {settings.delegationReason ? ` · ${settings.delegationReason}` : ""}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Configuration form ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-primary" />
            Approval Ownership
          </CardTitle>
          <CardDescription>
            Define who receives and approves Recruiting Requests. New requests route to the primary approver
            unless delegation is active, in which case they route to the backup approver.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Approver selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label htmlFor="primary-approver" className="flex items-center gap-1.5 text-sm font-semibold">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                Primary Approver
                <span className="text-[10px] text-muted-foreground font-normal ml-1">(default: COO)</span>
              </Label>
              <Select
                value={primaryApproverUserId || "__none__"}
                onValueChange={(v) => { setPrimaryApproverUserId(v === "__none__" ? "" : v); mark(); }}
              >
                <SelectTrigger id="primary-approver" data-testid="select-primary-approver">
                  <SelectValue placeholder="Select primary approver…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    <span className="text-muted-foreground">System default (COO)</span>
                  </SelectItem>
                  {approverUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id} data-testid={`option-primary-${u.id}`}>
                      <span className="font-medium">{u.displayName}</span>
                      <span className="ml-2 text-muted-foreground text-xs">
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Receives email + in-app alert for every new recruiting request.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="backup-approver" className="flex items-center gap-1.5 text-sm font-semibold">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                Backup Approver
                <span className="text-[10px] text-muted-foreground font-normal ml-1">(default: CEO/Owner)</span>
              </Label>
              <Select
                value={backupApproverUserId || "__none__"}
                onValueChange={(v) => { setBackupApproverUserId(v === "__none__" ? "" : v); mark(); }}
              >
                <SelectTrigger id="backup-approver" data-testid="select-backup-approver">
                  <SelectValue placeholder="Select backup approver…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    <span className="text-muted-foreground">Not configured</span>
                  </SelectItem>
                  {approverUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id} data-testid={`option-backup-${u.id}`}>
                      <span className="font-medium">{u.displayName}</span>
                      <span className="ml-2 text-muted-foreground text-xs">
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Receives requests during delegation periods (e.g., COO on PTO).
              </p>
            </div>
          </div>

          <Separator />

          {/* Delegation toggle + config */}
          <div className="space-y-4">
            <div className="flex items-start gap-3 justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  Activate Delegation
                </p>
                <p className="text-xs text-muted-foreground">
                  Route approvals to the backup approver during a specified date range.
                  {isActiveNow && (
                    <span className="ml-1.5 text-orange-600 dark:text-orange-400 font-medium">
                      Currently active.
                    </span>
                  )}
                </p>
              </div>
              <Switch
                checked={delegationEnabled}
                onCheckedChange={(v) => { setDelegationEnabled(v); mark(); }}
                data-testid="switch-delegation-enabled"
              />
            </div>

            {delegationEnabled && (
              <div className="rounded-md border bg-muted/20 p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="del-start" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Start Date
                    </Label>
                    <Input
                      id="del-start"
                      type="date"
                      value={delegationStartDate}
                      onChange={(e) => { setDelegationStartDate(e.target.value); mark(); }}
                      className="text-sm"
                      data-testid="input-delegation-start"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="del-end" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      End Date
                    </Label>
                    <Input
                      id="del-end"
                      type="date"
                      value={delegationEndDate}
                      onChange={(e) => { setDelegationEndDate(e.target.value); mark(); }}
                      className="text-sm"
                      data-testid="input-delegation-end"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="del-reason" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Reason
                    <span className="ml-1 text-muted-foreground font-normal normal-case tracking-normal">(for audit trail)</span>
                  </Label>
                  <Textarea
                    id="del-reason"
                    placeholder="e.g., COO on PTO Jul 4–11…"
                    value={delegationReason}
                    onChange={(e) => { setDelegationReason(e.target.value); mark(); }}
                    className="text-sm min-h-[60px]"
                    data-testid="textarea-delegation-reason"
                  />
                </div>
                {backupApproverUserId === "" && (
                  <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    No backup approver configured. Delegation will be enabled but approvals may not route correctly.
                  </div>
                )}
              </div>
            )}
          </div>

          <Separator />

          <div className="flex items-center gap-3 justify-between flex-wrap">
            <div className="flex items-center gap-2">
              {dirty && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />Unsaved changes
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {dirty && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const s = settings;
                    setPrimaryApproverUserId(s.primaryApproverUserId ?? "");
                    setBackupApproverUserId(s.backupApproverUserId   ?? "");
                    setDelegationEnabled(s.delegationEnabled         ?? false);
                    setDelegationStartDate(s.delegationStartDate     ?? "");
                    setDelegationEndDate(s.delegationEndDate         ?? "");
                    setDelegationReason(s.delegationReason           ?? "");
                    setDirty(false);
                  }}
                  data-testid="btn-discard-approval-settings"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Discard
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                data-testid="btn-save-approval-settings"
              >
                {saveMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                Save Settings
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Audit log ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" />
            Change History
          </CardTitle>
          <CardDescription>
            Immutable record of every approval ownership and delegation change.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {auditLog.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No changes recorded yet.</p>
          ) : (
            <div className="divide-y">
              {auditLog.map((entry: any) => (
                <div key={entry.id} className="py-3 space-y-1.5" data-testid={`audit-entry-${entry.id}`}>
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ChangeTypeBadge type={entry.changeType} />
                      <span className="text-sm font-medium">
                        {entry.changedByName || entry.changedBy}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {safeDate(entry.createdAt, true)}
                    </span>
                  </div>
                  {/* Show what changed */}
                  {entry.newValues && (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 pl-1">
                      {entry.newValues.primaryApproverName && (
                        <AuditField label="Primary Approver" prev={entry.previousValues?.primaryApproverName} next={entry.newValues.primaryApproverName} />
                      )}
                      {entry.newValues.backupApproverName && (
                        <AuditField label="Backup Approver" prev={entry.previousValues?.backupApproverName} next={entry.newValues.backupApproverName} />
                      )}
                      {entry.changeType === "delegation_enabled" && (
                        <>
                          <AuditField label="Delegation Start" prev={null} next={safeDate(entry.newValues.delegationStartDate)} />
                          <AuditField label="Delegation End"   prev={null} next={safeDate(entry.newValues.delegationEndDate)} />
                          {entry.newValues.delegationReason && (
                            <div className="col-span-2">
                              <AuditField label="Reason" prev={null} next={entry.newValues.delegationReason} />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AuditField({ label, prev, next }: { label: string; prev: string | null | undefined; next: string | null | undefined }) {
  if (!next) return null;
  return (
    <div className="text-xs">
      <span className="text-muted-foreground">{label}: </span>
      {prev && prev !== next && (
        <>
          <span className="line-through text-muted-foreground">{prev}</span>
          <span className="mx-1 text-muted-foreground">→</span>
        </>
      )}
      <span className="font-medium text-foreground">{next}</span>
    </div>
  );
}
