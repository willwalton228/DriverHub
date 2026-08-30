import { useState } from "react";
import { parseDateSafe } from "@/lib/dateFormat";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Users, ShieldCheck, Phone, Activity, Trophy, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

interface BackupAssignment {
  id: string;
  shiftId: string;
  userId: string;
  assignmentRole: string;
  status: string;
  shiftDate: string;
  shiftStartTime: string;
  shiftEndTime: string;
  shiftLocationId: string | null;
  userName: string;
}

interface DriverUsageStat {
  userId: string;
  userName: string;
  activationCount: number;
}

interface BackupUsageStats {
  totalActivations: number;
  byDriver: DriverUsageStat[];
  recentActivations: any[];
}

function invalidateBackupPoolQueries() {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === "string" && key.startsWith("/api/corporate/scheduling/backup-pool");
    },
  });
}

export default function SchedulingBackupPoolTab() {
  const { toast } = useToast();
  const [filterRole, setFilterRole] = useState<string>("all");
  const [activateDialog, setActivateDialog] = useState<{ open: boolean; assignmentId: string | null }>({ open: false, assignmentId: null });
  const [activateReason, setActivateReason] = useState("");

  const poolQuery = useQuery<{ assignments: BackupAssignment[] }>({
    queryKey: [`/api/corporate/scheduling/backup-pool?roleFilter=${filterRole}`],
  });

  const usageQueryRaw = useQuery<{ stats: BackupUsageStats }>({
    queryKey: ["/api/corporate/scheduling/backup-pool/usage-stats"],
  });
  const usageQuery = { ...usageQueryRaw, data: usageQueryRaw.data?.stats };
  const usageError = usageQueryRaw.isError;

  const activateMutation = useMutation({
    mutationFn: async ({ assignmentId, reason }: { assignmentId: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/corporate/scheduling/backup-pool/${assignmentId}/activate`, { reason });
      return res.json();
    },
    onSuccess: () => {
      invalidateBackupPoolQueries();
      setActivateDialog({ open: false, assignmentId: null });
      setActivateReason("");
      toast({ title: "Driver activated", description: "Backup driver has been activated successfully." });
    },
    onError: () => {
      toast({ title: "Activation failed", description: "Could not activate the backup driver.", variant: "destructive" });
    },
  });

  const assignments = poolQuery.data?.assignments || [];
  const usageStats = usageQuery.data;
  const backupCount = assignments.filter((a) => a.assignmentRole === "backup").length;
  const onCallCount = assignments.filter((a) => a.assignmentRole === "on_call").length;
  const topDriver = usageStats?.byDriver?.[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <h3 className="text-lg font-semibold" data-testid="text-backup-title">Backup & On-Call Driver Pool</h3>
        </div>
        <Badge variant="secondary">
          {assignments.length} driver{assignments.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="card-backup-count">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm text-muted-foreground">Backup Drivers</span>
            </div>
            <div className="text-2xl font-bold">
              {poolQuery.isLoading ? <Skeleton className="h-8 w-12" /> : backupCount}
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-oncall-count">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Phone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm text-muted-foreground">On-Call Drivers</span>
            </div>
            <div className="text-2xl font-bold">
              {poolQuery.isLoading ? <Skeleton className="h-8 w-12" /> : onCallCount}
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-total-activations">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="text-sm text-muted-foreground">Total Activations</span>
            </div>
            <div className="text-2xl font-bold">
              {usageQuery.isLoading ? <Skeleton className="h-8 w-12" /> : (usageStats?.totalActivations ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-top-driver">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <span className="text-sm text-muted-foreground">Top Activated Driver</span>
            </div>
            <div className="text-lg font-bold truncate">
              {usageQuery.isLoading ? <Skeleton className="h-8 w-24" /> : (topDriver?.userName ?? "N/A")}
            </div>
            {topDriver && (
              <div className="text-xs text-muted-foreground">{topDriver.activationCount} activation{topDriver.activationCount !== 1 ? "s" : ""}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Separator />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs">Role</Label>
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger className="w-[150px]" data-testid="select-filter-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="backup">Backup</SelectItem>
              <SelectItem value="on_call">On-Call</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <span className="text-sm text-muted-foreground" data-testid="text-backup-roster-count">
            {assignments.length} driver{assignments.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="space-y-3" data-testid="backup-roster-list">
        {poolQuery.isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {poolQuery.isError && (
          <div className="flex items-center gap-2 py-4 text-sm" data-testid="error-backup-pool">
            <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
            <span className="text-muted-foreground">Unable to load backup pool.</span>
            <Button variant="ghost" size="sm" className="h-auto p-0 text-sm" onClick={() => poolQuery.refetch()}>Retry</Button>
          </div>
        )}
        {!poolQuery.isLoading && !poolQuery.isError && assignments.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground" data-testid="text-no-backup-drivers">
              No backup drivers found for the selected filter.
            </CardContent>
          </Card>
        )}
        {assignments.map((assignment) => (
          <Card key={assignment.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold">{assignment.userName}</span>
                  <Badge
                    variant="secondary"
                    className={cn(
                      assignment.assignmentRole === "backup"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                        : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                    )}
                    data-testid={`badge-role-${assignment.id}`}
                  >
                    {assignment.assignmentRole === "backup" ? "Backup" : "On-Call"}
                  </Badge>
                  <Badge variant="outline">{assignment.status}</Badge>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    setActivateDialog({ open: true, assignmentId: assignment.id });
                    setActivateReason("");
                  }}
                  data-testid={`button-activate-${assignment.id}`}
                >
                  Activate
                </Button>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                {assignment.shiftDate && (
                  <span>Date: {format(parseDateSafe(assignment.shiftDate), "MMM d, yyyy")}</span>
                )}
                {assignment.shiftStartTime && assignment.shiftEndTime && (
                  <span className="ml-2">| {assignment.shiftStartTime} - {assignment.shiftEndTime}</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator />

      <div data-testid="backup-usage-stats">
        <h4 className="text-base font-semibold mb-3">Usage Statistics</h4>
        {usageQuery.isLoading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {!usageQuery.isLoading && usageStats && usageStats.byDriver.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground border-b pb-2">
                  <span>Driver</span>
                  <span>Activations</span>
                </div>
                {usageStats.byDriver.map((driver) => (
                  <div key={driver.userId} className="flex items-center justify-between gap-2 text-sm py-1">
                    <span data-testid={`text-usage-driver-${driver.userId}`}>{driver.userName}</span>
                    <Badge variant="secondary">{driver.activationCount}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        {usageError && !usageQuery.isLoading && (
          <div className="flex items-center gap-2 py-2 text-sm" data-testid="error-usage-stats">
            <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
            <span className="text-muted-foreground">Unable to load usage stats.</span>
            <Button variant="ghost" size="sm" className="h-auto p-0 text-sm" onClick={() => usageQueryRaw.refetch()}>Retry</Button>
          </div>
        )}
        {!usageError && !usageQuery.isLoading && (!usageStats || usageStats.byDriver.length === 0) && (
          <p className="text-sm text-muted-foreground">No usage statistics available.</p>
        )}
      </div>

      <Dialog open={activateDialog.open} onOpenChange={(open) => { if (!open) setActivateDialog({ open: false, assignmentId: null }); }}>
        <DialogContent data-testid="dialog-activate">
          <DialogHeader>
            <DialogTitle>Activate Driver</DialogTitle>
            <DialogDescription>
              Confirm activation of this backup/on-call driver. Optionally provide a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="activate-reason">Reason (optional)</Label>
            <Textarea
              id="activate-reason"
              placeholder="e.g., Covering for no-show on Route 5..."
              value={activateReason}
              onChange={(e) => setActivateReason(e.target.value)}
              rows={3}
              data-testid="textarea-activate-reason"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setActivateDialog({ open: false, assignmentId: null })}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (activateDialog.assignmentId) {
                  activateMutation.mutate({ assignmentId: activateDialog.assignmentId, reason: activateReason.trim() });
                }
              }}
              disabled={activateMutation.isPending}
              data-testid="button-confirm-activate"
            >
              {activateMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Confirm Activation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
