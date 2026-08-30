import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  Shield, ShieldCheck, ShieldX, FileSearch, User, Car, FolderKanban,
  Plus, History, AlertTriangle, Search, Filter, ChevronRight
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface LegalHold {
  id: string;
  scopeType: "move" | "case" | "driver";
  scopeId: string;
  reason: string;
  matterReference: string | null;
  isActive: boolean;
  appliedBy: string;
  appliedAt: string;
  releasedBy: string | null;
  releasedAt: string | null;
  releaseReason: string | null;
  notes: string | null;
}

interface LegalHoldStats {
  totalActive: number;
  byType: Array<{ scopeType: string; count: number }>;
  recentlyApplied: number;
  recentlyReleased: number;
}

interface HoldLog {
  id: string;
  action: string;
  actorEmail: string | null;
  occurredAt: string;
  changeReason: string | null;
}

const scopeTypeIcons: Record<string, typeof Shield> = {
  move: Car,
  case: FolderKanban,
  driver: User,
};

const scopeTypeLabels: Record<string, string> = {
  move: "Move",
  case: "Case",
  driver: "Driver",
};

export default function LegalHolds() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("active");
  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showReleased, setShowReleased] = useState(false);
  
  const [isApplyDialogOpen, setIsApplyDialogOpen] = useState(false);
  const [isReleaseDialogOpen, setIsReleaseDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedHold, setSelectedHold] = useState<LegalHold | null>(null);
  const [holdLogs, setHoldLogs] = useState<HoldLog[]>([]);

  const [newHold, setNewHold] = useState({
    scopeType: "move" as "move" | "case" | "driver",
    scopeId: "",
    reason: "",
    matterReference: "",
    notes: "",
  });
  const [releaseReason, setReleaseReason] = useState("");

  const { data: holdsData, isLoading: loadingHolds, refetch: refetchHolds } = useQuery<LegalHold[]>({
    queryKey: ["/api/legal-holds", filterType !== "all" ? filterType : undefined, showReleased],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterType !== "all") params.append("scopeType", filterType);
      if (showReleased) params.append("includeReleased", "true");
      const res = await fetch(`/api/legal-holds?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch legal holds");
      return res.json();
    },
  });

  const { data: stats, isLoading: loadingStats } = useQuery<LegalHoldStats>({
    queryKey: ["/api/legal-holds/stats"],
  });

  const applyHoldMutation = useMutation({
    mutationFn: async (data: typeof newHold) => apiRequest("POST", "/api/legal-holds", data),
    onSuccess: () => {
      toast({ title: "Legal hold applied successfully" });
      setIsApplyDialogOpen(false);
      setNewHold({ scopeType: "move", scopeId: "", reason: "", matterReference: "", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/legal-holds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/legal-holds/stats"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to apply legal hold", description: error.message, variant: "destructive" });
    },
  });

  const releaseHoldMutation = useMutation({
    mutationFn: async ({ holdId, releaseReason }: { holdId: string; releaseReason: string }) =>
      apiRequest("POST", `/api/legal-holds/${holdId}/release`, { releaseReason }),
    onSuccess: () => {
      toast({ title: "Legal hold released successfully" });
      setIsReleaseDialogOpen(false);
      setSelectedHold(null);
      setReleaseReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/legal-holds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/legal-holds/stats"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to release legal hold", description: error.message, variant: "destructive" });
    },
  });

  const fetchHoldDetails = async (holdId: string) => {
    try {
      const res = await fetch(`/api/legal-holds/${holdId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch hold details");
      const data = await res.json();
      setSelectedHold(data.hold);
      setHoldLogs(data.logs || []);
      setIsDetailDialogOpen(true);
    } catch (error) {
      toast({ title: "Failed to load hold details", variant: "destructive" });
    }
  };

  const filteredHolds = (holdsData || []).filter(hold => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        hold.scopeId.toLowerCase().includes(query) ||
        hold.reason.toLowerCase().includes(query) ||
        (hold.matterReference?.toLowerCase().includes(query) ?? false)
      );
    }
    return true;
  });

  const getTypeCount = (type: string) => {
    return stats?.byType.find(t => t.scopeType === type)?.count || 0;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Legal Hold Management</h1>
          <p className="text-muted-foreground">
            Preserve evidence by applying legal holds to moves, cases, or drivers
          </p>
        </div>
        <Button onClick={() => setIsApplyDialogOpen(true)} data-testid="button-apply-hold">
          <Plus className="h-4 w-4 mr-2" />
          Apply Legal Hold
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Active Holds</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingStats ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-total-active">{stats?.totalActive || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Move Holds</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingStats ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{getTypeCount("move")}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Case Holds</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingStats ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{getTypeCount("case")}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Driver Holds</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingStats ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{getTypeCount("driver")}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle>Legal Holds</CardTitle>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by ID, reason..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-64"
                  data-testid="input-search"
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-36" data-testid="select-filter-type">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="move">Moves</SelectItem>
                  <SelectItem value="case">Cases</SelectItem>
                  <SelectItem value="driver">Drivers</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Switch
                  checked={showReleased}
                  onCheckedChange={setShowReleased}
                  data-testid="switch-show-released"
                />
                <Label className="text-sm">Show Released</Label>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingHolds ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredHolds.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No legal holds found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Entity ID</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Matter Ref</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHolds.map((hold) => {
                  const Icon = scopeTypeIcons[hold.scopeType] || Shield;
                  return (
                    <TableRow key={hold.id} data-testid={`row-hold-${hold.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="capitalize">{scopeTypeLabels[hold.scopeType]}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {hold.scopeId.length > 12 ? `${hold.scopeId.slice(0, 12)}...` : hold.scopeId}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{hold.reason}</TableCell>
                      <TableCell>{hold.matterReference || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(hold.appliedAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        {hold.isActive ? (
                          <Badge variant="default" className="bg-orange-500 hover:bg-orange-600">
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <ShieldX className="h-3 w-3 mr-1" />
                            Released
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => fetchHoldDetails(hold.id)}
                            data-testid={`button-view-${hold.id}`}
                          >
                            <FileSearch className="h-4 w-4" />
                          </Button>
                          {hold.isActive && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedHold(hold);
                                setIsReleaseDialogOpen(true);
                              }}
                              data-testid={`button-release-${hold.id}`}
                            >
                              Release
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isApplyDialogOpen} onOpenChange={setIsApplyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apply Legal Hold</DialogTitle>
            <DialogDescription>
              Apply a legal hold to preserve all evidence related to a move, case, or driver.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Entity Type</Label>
              <Select
                value={newHold.scopeType}
                onValueChange={(v) => setNewHold({ ...newHold, scopeType: v as any })}
              >
                <SelectTrigger data-testid="select-scope-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="move">Move</SelectItem>
                  <SelectItem value="case">Case</SelectItem>
                  <SelectItem value="driver">Driver</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Entity ID</Label>
              <Input
                placeholder={`Enter ${newHold.scopeType} ID`}
                value={newHold.scopeId}
                onChange={(e) => setNewHold({ ...newHold, scopeId: e.target.value })}
                data-testid="input-scope-id"
              />
            </div>
            <div className="space-y-2">
              <Label>Reason for Hold</Label>
              <Textarea
                placeholder="Legal reason for applying this hold..."
                value={newHold.reason}
                onChange={(e) => setNewHold({ ...newHold, reason: e.target.value })}
                rows={3}
                data-testid="input-reason"
              />
            </div>
            <div className="space-y-2">
              <Label>Matter Reference (Optional)</Label>
              <Input
                placeholder="e.g., Case #12345"
                value={newHold.matterReference}
                onChange={(e) => setNewHold({ ...newHold, matterReference: e.target.value })}
                data-testid="input-matter-ref"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Textarea
                placeholder="Additional notes..."
                value={newHold.notes}
                onChange={(e) => setNewHold({ ...newHold, notes: e.target.value })}
                rows={2}
                data-testid="input-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApplyDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => applyHoldMutation.mutate(newHold)}
              disabled={!newHold.scopeId || !newHold.reason || applyHoldMutation.isPending}
              data-testid="button-confirm-apply"
            >
              {applyHoldMutation.isPending ? "Applying..." : "Apply Hold"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isReleaseDialogOpen} onOpenChange={setIsReleaseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release Legal Hold</DialogTitle>
            <DialogDescription>
              Releasing this hold will allow data related to {selectedHold?.scopeType} {selectedHold?.scopeId} to be purged according to retention policies.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-destructive/10 rounded-lg flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-destructive">Warning</p>
                <p className="text-muted-foreground">
                  Once released, evidence may be deleted according to retention policies. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason for Release</Label>
              <Textarea
                placeholder="Legal reason for releasing this hold..."
                value={releaseReason}
                onChange={(e) => setReleaseReason(e.target.value)}
                rows={3}
                data-testid="input-release-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReleaseDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedHold) {
                  releaseHoldMutation.mutate({ holdId: selectedHold.id, releaseReason });
                }
              }}
              disabled={!releaseReason || releaseHoldMutation.isPending}
              data-testid="button-confirm-release"
            >
              {releaseHoldMutation.isPending ? "Releasing..." : "Release Hold"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedHold && scopeTypeIcons[selectedHold.scopeType] && (
                (() => {
                  const Icon = scopeTypeIcons[selectedHold.scopeType];
                  return <Icon className="h-5 w-5" />;
                })()
              )}
              Legal Hold Details
            </DialogTitle>
          </DialogHeader>
          {selectedHold && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs">Entity Type</Label>
                  <p className="font-medium capitalize">{scopeTypeLabels[selectedHold.scopeType]}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Entity ID</Label>
                  <p className="font-mono text-sm">{selectedHold.scopeId}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Status</Label>
                  <div className="mt-1">
                    {selectedHold.isActive ? (
                      <Badge variant="default" className="bg-orange-500">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Released</Badge>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Matter Reference</Label>
                  <p>{selectedHold.matterReference || "—"}</p>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground text-xs">Reason</Label>
                <p className="text-sm mt-1">{selectedHold.reason}</p>
              </div>

              {selectedHold.notes && (
                <div>
                  <Label className="text-muted-foreground text-xs">Notes</Label>
                  <p className="text-sm mt-1">{selectedHold.notes}</p>
                </div>
              )}

              <div className="border-t pt-4">
                <Label className="text-muted-foreground text-xs mb-2 flex items-center gap-2">
                  <History className="h-3 w-3" />
                  Audit Log
                </Label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {holdLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 text-sm p-2 bg-muted/50 rounded">
                      <div className="flex-1">
                        <span className="font-medium capitalize">{log.action}</span>
                        {log.actorEmail && (
                          <span className="text-muted-foreground"> by {log.actorEmail}</span>
                        )}
                        {log.changeReason && (
                          <p className="text-muted-foreground text-xs mt-1">{log.changeReason}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.occurredAt), "MMM d, yyyy h:mm a")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
