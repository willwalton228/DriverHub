import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Shield, Plus, Loader2, Copy, CalendarDays, Clock,
  Eye, XCircle, AlertTriangle, CheckCircle2, Key, Globe, FileText, Activity
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ExternalAccessTabProps {
  entityId?: string;
}

interface Grant {
  id: string;
  role: string;
  grantedToEmail: string;
  grantedToName: string | null;
  grantedToOrg: string | null;
  allowedScopes: string[];
  customerId: string | null;
  claimId: string | null;
  expiresAt: string;
  accessToken: string;
  isActive: boolean;
  revokedAt: string | null;
  revokedBy: string | null;
  revokedReason: string | null;
  createdAt: string;
  createdBy: string;
  notes: string | null;
}

interface AccessLog {
  id: string;
  grantId: string;
  accessedResource: string;
  resourceScope: string | null;
  requestMethod: string | null;
  requestPath: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  responseStatus: number | null;
  occurredAt: string;
}

const SCHEDULING_SCOPES = ["scheduling_controls", "scheduling_sla", "scheduling_justifications"] as const;

const SCOPE_LABELS: Record<string, string> = {
  scheduling_controls: "Scheduling Controls",
  scheduling_sla: "Scheduling SLA",
  scheduling_justifications: "Scheduling Justifications",
};

const ROLE_OPTIONS = [
  { value: "auditor_viewer", label: "Auditor Viewer" },
  { value: "insurer_viewer", label: "Insurer Viewer" },
  { value: "oem_viewer", label: "OEM Viewer" },
  { value: "partner_viewer", label: "Partner Viewer" },
  { value: "carrier_viewer", label: "Carrier Viewer" },
  { value: "broker_viewer", label: "Broker Viewer" },
];

const ROLE_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  auditor_viewer: "default",
  insurer_viewer: "secondary",
  oem_viewer: "outline",
  partner_viewer: "default",
  carrier_viewer: "secondary",
  broker_viewer: "outline",
};

function getGrantStatus(grant: Grant): "active" | "expired" | "revoked" {
  if (!grant.isActive) return "revoked";
  if (new Date(grant.expiresAt) < new Date()) return "expired";
  return "active";
}

function GrantStatusBadge({ grant }: { grant: Grant }) {
  const status = getGrantStatus(grant);
  const config = {
    active: { bg: "bg-green-100 dark:bg-green-900", text: "text-green-800 dark:text-green-300", icon: CheckCircle2, label: "Active" },
    expired: { bg: "bg-amber-100 dark:bg-amber-900", text: "text-amber-800 dark:text-amber-300", icon: Clock, label: "Expired" },
    revoked: { bg: "bg-red-100 dark:bg-red-900", text: "text-red-800 dark:text-red-300", icon: XCircle, label: "Revoked" },
  }[status];
  const Icon = config.icon;
  return (
    <Badge className={`${config.bg} ${config.text} gap-1`} data-testid={`badge-grant-status-${grant.id}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

const grantFormSchema = z.object({
  grantedToEmail: z.string().email("Valid email is required"),
  grantedToName: z.string().optional(),
  grantedToOrg: z.string().optional(),
  role: z.string().min(1, "Role is required"),
  allowedScopes: z.array(z.string()).min(1, "At least one scope is required"),
  expiresAt: z.date({ required_error: "Expiry date is required" }),
  notes: z.string().optional(),
});

type GrantFormValues = z.infer<typeof grantFormSchema>;

export function ExternalAccessTab({ entityId }: ExternalAccessTabProps) {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [createdToken, setCreatedToken] = useState("");
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [revokeGrantId, setRevokeGrantId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  const grantsQuery = useQuery<Grant[]>({
    queryKey: ["/api/external-access/grants", "includeExpired"],
    queryFn: async () => {
      const res = await fetch("/api/external-access/grants?includeExpired=true", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch grants");
      return res.json();
    },
  });

  const logsQuery = useQuery<AccessLog[]>({
    queryKey: ["/api/external-access/logs"],
    queryFn: async () => {
      const res = await fetch("/api/external-access/logs", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
  });

  const grants = grantsQuery.data || [];
  const logs = logsQuery.data || [];

  const sortedLogs = useMemo(() => {
    return [...logs].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }, [logs]);

  const activeGrants = grants.filter(g => getGrantStatus(g) === "active");
  const schedulingGrants = grants.filter(g =>
    g.allowedScopes.some(s => SCHEDULING_SCOPES.includes(s as typeof SCHEDULING_SCOPES[number]))
  );
  const expiredOrRevokedGrants = grants.filter(g => getGrantStatus(g) !== "active");

  const form = useForm<GrantFormValues>({
    resolver: zodResolver(grantFormSchema),
    defaultValues: {
      grantedToEmail: "",
      grantedToName: "",
      grantedToOrg: "",
      role: "",
      allowedScopes: [],
      notes: "",
    },
  });

  const createGrantMutation = useMutation({
    mutationFn: async (data: GrantFormValues) => {
      const res = await apiRequest("POST", "/api/external-access/grants", {
        ...data,
        expiresAt: data.expiresAt.toISOString(),
      });
      return res.json();
    },
    onSuccess: (data: Grant) => {
      queryClient.invalidateQueries({ queryKey: ["/api/external-access/grants", "includeExpired"] });
      toast({ title: "Access grant created" });
      setCreateDialogOpen(false);
      form.reset();
      setCreatedToken(data.accessToken);
      setTokenDialogOpen(true);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const revokeGrantMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/external-access/grants/${id}/revoke`, { reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/external-access/grants", "includeExpired"] });
      toast({ title: "Grant revoked successfully" });
      setRevokeDialogOpen(false);
      setRevokeGrantId(null);
      setRevokeReason("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  function handleRevoke(grantId: string) {
    setRevokeGrantId(grantId);
    setRevokeReason("");
    setRevokeDialogOpen(true);
  }

  function confirmRevoke() {
    if (!revokeGrantId || !revokeReason.trim()) return;
    revokeGrantMutation.mutate({ id: revokeGrantId, reason: revokeReason.trim() });
  }

  function copyToken() {
    navigator.clipboard.writeText(createdToken);
    toast({ title: "Token copied to clipboard" });
  }

  if (grantsQuery.isLoading || logsQuery.isLoading) {
    return (
      <div className="space-y-6" data-testid="container-external-access">
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="container-external-access">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Active Grants</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-grants-count">{activeGrants.length}</div>
            <p className="text-xs text-muted-foreground">Currently valid access tokens</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Scheduling-Scoped</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-scheduling-grants-count">{schedulingGrants.length}</div>
            <p className="text-xs text-muted-foreground">Grants with scheduling scopes</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Access Events</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-access-events-count">{logs.length}</div>
            <p className="text-xs text-muted-foreground">Total recorded access events</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Expired / Revoked</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{expiredOrRevokedGrants.length}</div>
            <p className="text-xs text-muted-foreground">No longer valid</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap space-y-0">
          <div>
            <CardTitle>Access Grants</CardTitle>
            <CardDescription>Manage external read-only access to scheduling data</CardDescription>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-grant">
            <Plus className="mr-2 h-4 w-4" />
            Create Access Grant
          </Button>
        </CardHeader>
        <CardContent>
          {grants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground" data-testid="text-no-grants">
              <Shield className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No access grants</p>
              <p className="text-sm">Create a grant to share scheduling data externally.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grants.map((grant) => {
                  const status = getGrantStatus(grant);
                  return (
                    <TableRow key={grant.id} data-testid={`row-grant-${grant.id}`}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{grant.grantedToEmail}</p>
                          {grant.grantedToOrg && (
                            <p className="text-xs text-muted-foreground">{grant.grantedToOrg}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={ROLE_BADGE_VARIANT[grant.role] || "default"}>
                          {ROLE_OPTIONS.find(r => r.value === grant.role)?.label || grant.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {grant.allowedScopes.map((scope) => (
                            <Badge key={scope} variant="secondary" className="text-xs">
                              {SCOPE_LABELS[scope] || scope}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(grant.expiresAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <GrantStatusBadge grant={grant} />
                      </TableCell>
                      <TableCell className="text-right">
                        {status === "active" && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleRevoke(grant.id)}
                            data-testid={`button-revoke-grant-${grant.id}`}
                          >
                            Revoke
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card data-testid="container-access-logs">
        <CardHeader>
          <CardTitle>Access Logs</CardTitle>
          <CardDescription>Recent external access activity</CardDescription>
        </CardHeader>
        <CardContent>
          {sortedLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground" data-testid="text-no-logs">
              <Eye className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No access logs</p>
              <p className="text-sm">Access events will appear here once external users access data.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Path</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>IP Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedLogs.map((log) => (
                  <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.occurredAt), "MMM d, yyyy h:mm a")}
                    </TableCell>
                    <TableCell className="font-medium">{log.accessedResource}</TableCell>
                    <TableCell>
                      {log.requestMethod && (
                        <Badge variant="outline" className="text-xs">{log.requestMethod}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono text-xs max-w-[200px] truncate">
                      {log.requestPath}
                    </TableCell>
                    <TableCell>
                      {log.responseStatus != null && (
                        <Badge
                          variant={log.responseStatus < 400 ? "secondary" : "destructive"}
                          className="text-xs"
                        >
                          {log.responseStatus}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{log.ipAddress || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Access Grant</DialogTitle>
            <DialogDescription>
              Grant external read-only access to scheduling data. The access token will only be shown once after creation.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => createGrantMutation.mutate(data))} className="space-y-4">
              <FormField
                control={form.control}
                name="grantedToEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="user@example.com" {...field} data-testid="input-grant-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="grantedToName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Full name" {...field} data-testid="input-grant-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="grantedToOrg"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Organization</FormLabel>
                      <FormControl>
                        <Input placeholder="Company name" {...field} data-testid="input-grant-org" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-grant-role">
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ROLE_OPTIONS.map((role) => (
                          <SelectItem key={role.value} value={role.value} data-testid={`option-role-${role.value}`}>{role.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="allowedScopes"
                render={() => (
                  <FormItem>
                    <FormLabel>Scopes</FormLabel>
                    <div className="space-y-2">
                      {SCHEDULING_SCOPES.map((scope) => (
                        <FormField
                          key={scope}
                          control={form.control}
                          name="allowedScopes"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center gap-2 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(scope)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      field.onChange([...(field.value || []), scope]);
                                    } else {
                                      field.onChange((field.value || []).filter((v: string) => v !== scope));
                                    }
                                  }}
                                  data-testid={`checkbox-scope-${scope}`}
                                />
                              </FormControl>
                              <FormLabel className="font-normal cursor-pointer">
                                {SCOPE_LABELS[scope]}
                              </FormLabel>
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="expiresAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expiry Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        data-testid="input-expiry-date"
                        min={format(new Date(), "yyyy-MM-dd")}
                        value={field.value instanceof Date && !isNaN(field.value.getTime()) ? format(field.value, "yyyy-MM-dd") : ""}
                        onChange={(e) => {
                          if (!e.target.value) {
                            field.onChange(undefined);
                            return;
                          }
                          const parsed = new Date(e.target.value + "T12:00:00");
                          if (!isNaN(parsed.getTime())) {
                            field.onChange(parsed);
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Optional notes about this grant" {...field} data-testid="textarea-grant-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createGrantMutation.isPending} data-testid="button-save-grant">
                  {createGrantMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Grant
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Access Token Created
            </DialogTitle>
            <DialogDescription>
              Copy this token now. It will not be shown again for security reasons.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-md border p-3 bg-muted/50">
              <code className="flex-1 text-sm break-all font-mono" data-testid="text-access-token">{createdToken}</code>
              <Button size="icon" variant="ghost" onClick={copyToken} data-testid="button-copy-token">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                This token provides read-only access to the granted scopes. Store it securely and share only with the intended recipient.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setTokenDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke Access Grant</DialogTitle>
            <DialogDescription>
              This action will immediately revoke the access token. The external user will no longer be able to access data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Reason for revocation</label>
              <Textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="Provide a reason for revoking this access"
                data-testid="textarea-revoke-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={confirmRevoke}
              disabled={!revokeReason.trim() || revokeGrantMutation.isPending}
              data-testid="button-confirm-revoke"
            >
              {revokeGrantMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Revoke Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
