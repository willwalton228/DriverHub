import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  Clock, Database, Shield, AlertTriangle, CheckCircle, 
  XCircle, Play, RefreshCw, History
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getStatusBadgeClass } from "@/lib/statusColors";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface RetentionPolicy {
  id: string;
  policyName: string;
  displayName: string;
  description: string;
  retentionDays: number;
  tableName: string;
  dateColumn: string;
  legalHoldEnabled: boolean;
  legalHoldReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PurgeRun {
  run: {
    id: string;
    policyId: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    recordsPurged: number | null;
    errorMessage: string | null;
    triggeredBy: string | null;
  };
  policy: RetentionPolicy | null;
}

export default function RetentionPolicies() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("policies");
  const [editingPolicy, setEditingPolicy] = useState<RetentionPolicy | null>(null);
  const [editDays, setEditDays] = useState(0);
  const [editLegalHold, setEditLegalHold] = useState(false);
  const [editLegalHoldReason, setEditLegalHoldReason] = useState("");

  const { data: policiesData, isLoading: loadingPolicies, refetch: refetchPolicies } = useQuery<{ policies: RetentionPolicy[] }>({
    queryKey: ["/api/retention/policies"],
  });

  const { data: runsData, isLoading: loadingRuns, refetch: refetchRuns } = useQuery<{ runs: PurgeRun[] }>({
    queryKey: ["/api/retention/purge-runs"],
  });

  const updatePolicyMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => 
      apiRequest("PATCH", `/api/retention/policies/${id}`, updates),
    onSuccess: () => {
      toast({ title: "Policy updated successfully" });
      setEditingPolicy(null);
      queryClient.invalidateQueries({ queryKey: ["/api/retention/policies"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update policy", description: error.message, variant: "destructive" });
    },
  });

  const purgeOneMutation = useMutation({
    mutationFn: async (policyId: string) => 
      apiRequest("POST", `/api/retention/purge/${policyId}`, {}),
    onSuccess: (data: any) => {
      toast({ title: "Purge completed", description: `${data.recordsPurged || 0} records purged` });
      queryClient.invalidateQueries({ queryKey: ["/api/retention/purge-runs"] });
    },
    onError: (error: any) => {
      toast({ title: "Purge failed", description: error.message, variant: "destructive" });
    },
  });

  const purgeAllMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/retention/purge-all", {}),
    onSuccess: (data: any) => {
      toast({ title: "All purges completed", description: `${data.totalPurged || 0} total records purged` });
      queryClient.invalidateQueries({ queryKey: ["/api/retention/purge-runs"] });
    },
    onError: (error: any) => {
      toast({ title: "Purge failed", description: error.message, variant: "destructive" });
    },
  });

  const policies = policiesData?.policies || [];
  const runs = runsData?.runs || [];

  const openEditDialog = (policy: RetentionPolicy) => {
    setEditingPolicy(policy);
    setEditDays(policy.retentionDays);
    setEditLegalHold(policy.legalHoldEnabled);
    setEditLegalHoldReason(policy.legalHoldReason || "");
  };

  const handleSavePolicy = () => {
    if (!editingPolicy) return;
    updatePolicyMutation.mutate({
      id: editingPolicy.id,
      updates: {
        retentionDays: editDays,
        legalHoldEnabled: editLegalHold,
        legalHoldReason: editLegalHold ? editLegalHoldReason : null,
      },
    });
  };

  const getStatusBadge = (status: string) => {
    return <Badge className={getStatusBadgeClass(status)}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
  };

  const formatDays = (days: number) => {
    if (days >= 365) {
      const years = Math.round(days / 365);
      return `${years} year${years > 1 ? 's' : ''} (${days} days)`;
    } else if (days >= 30) {
      const months = Math.round(days / 30);
      return `${months} month${months > 1 ? 's' : ''} (${days} days)`;
    }
    return `${days} days`;
  };

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="retention-policies-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6 text-primary" />
            Data Retention & Audit Policy
          </h1>
          <p className="text-muted-foreground">
            Manage data retention policies and view purge history
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              refetchPolicies();
              refetchRuns();
            }}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="default"
            onClick={() => purgeAllMutation.mutate()}
            disabled={purgeAllMutation.isPending}
            data-testid="button-purge-all"
          >
            <Play className="h-4 w-4 mr-2" />
            Run All Purges
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="policies" data-testid="tab-policies">
            <Shield className="h-4 w-4 mr-2" />
            Policies
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <History className="h-4 w-4 mr-2" />
            Purge History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="policies" className="space-y-4">
          {loadingPolicies ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <Skeleton className="h-24 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : policies.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No retention policies configured. They will be seeded on first run.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {policies.map((policy) => (
                <Card key={policy.id} data-testid={`card-policy-${policy.policyName}`}>
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {policy.displayName}
                        {policy.legalHoldEnabled && (
                          <Badge variant="destructive" className="flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Legal Hold
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="mt-1">{policy.description}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(policy)}
                        data-testid={`button-edit-${policy.policyName}`}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => purgeOneMutation.mutate(policy.id)}
                        disabled={policy.legalHoldEnabled || purgeOneMutation.isPending}
                        data-testid={`button-purge-${policy.policyName}`}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Purge Now
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Retention Period:</span>
                        <p className="font-medium flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {formatDays(policy.retentionDays)}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Table:</span>
                        <p className="font-mono text-xs">{policy.tableName}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Date Column:</span>
                        <p className="font-mono text-xs">{policy.dateColumn}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Last Updated:</span>
                        <p className="text-xs">
                          {format(new Date(policy.updatedAt), "MMM d, yyyy")}
                        </p>
                      </div>
                    </div>
                    {policy.legalHoldEnabled && policy.legalHoldReason && (
                      <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                        <p className="text-sm text-amber-800">
                          <strong>Legal Hold Reason:</strong> {policy.legalHoldReason}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          {loadingRuns ? (
            <Card>
              <CardContent className="p-6">
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
          ) : runs.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No purge runs yet. Run a purge to see history.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Policy</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead>Records Purged</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((run) => (
                      <TableRow key={run.run.id} data-testid={`row-purge-${run.run.id}`}>
                        <TableCell className="font-medium">
                          {run.policy?.displayName || 'Unknown'}
                        </TableCell>
                        <TableCell>{getStatusBadge(run.run.status)}</TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(run.run.startedAt), "MMM d, yyyy h:mm a")}
                        </TableCell>
                        <TableCell className="text-sm">
                          {run.run.completedAt 
                            ? format(new Date(run.run.completedAt), "MMM d, yyyy h:mm a")
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {run.run.recordsPurged !== null ? run.run.recordsPurged.toLocaleString() : '-'}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-red-600 text-xs">
                          {run.run.errorMessage || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!editingPolicy} onOpenChange={() => setEditingPolicy(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Retention Policy</DialogTitle>
            <DialogDescription>
              Update the retention period or legal hold settings for {editingPolicy?.displayName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="retentionDays">Retention Period (days)</Label>
              <Input
                id="retentionDays"
                type="number"
                min={1}
                value={editDays}
                onChange={(e) => setEditDays(parseInt(e.target.value) || 0)}
                data-testid="input-retention-days"
              />
              <p className="text-xs text-muted-foreground">
                Data older than this will be purged. Current: {formatDays(editDays)}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Legal Hold</Label>
                <p className="text-xs text-muted-foreground">
                  Prevents purge regardless of retention period
                </p>
              </div>
              <Switch
                checked={editLegalHold}
                onCheckedChange={setEditLegalHold}
                data-testid="switch-legal-hold"
              />
            </div>
            {editLegalHold && (
              <div className="space-y-2">
                <Label htmlFor="legalHoldReason">Legal Hold Reason</Label>
                <Textarea
                  id="legalHoldReason"
                  placeholder="e.g., Pending litigation - Case #12345"
                  value={editLegalHoldReason}
                  onChange={(e) => setEditLegalHoldReason(e.target.value)}
                  data-testid="input-legal-hold-reason"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPolicy(null)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSavePolicy}
              disabled={updatePolicyMutation.isPending}
              data-testid="button-save-policy"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
