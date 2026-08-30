import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeftRight, Clock, Check, X, Loader2, 
  AlertTriangle, History, User, CalendarDays, 
  CheckCircle2, XCircle, MessageSquare, Shield
} from "lucide-react";
import { cn } from "@/lib/utils";

type SwapStatus = 'pending' | 'approved' | 'declined' | 'cancelled' | 'expired';

const statusConfig: Record<SwapStatus, { bg: string; text: string; icon: typeof Clock }> = {
  pending: { bg: "bg-yellow-100 dark:bg-yellow-900", text: "text-yellow-800 dark:text-yellow-300", icon: Clock },
  approved: { bg: "bg-green-100 dark:bg-green-900", text: "text-green-800 dark:text-green-300", icon: CheckCircle2 },
  declined: { bg: "bg-red-100 dark:bg-red-900", text: "text-red-800 dark:text-red-300", icon: XCircle },
  cancelled: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-800 dark:text-gray-300", icon: X },
  expired: { bg: "bg-gray-200 dark:bg-gray-700", text: "text-gray-600 dark:text-gray-400", icon: Clock },
};

function SwapStatusBadge({ status }: { status: SwapStatus }) {
  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;
  
  return (
    <Badge className={`${config.bg} ${config.text} gap-1`} data-testid={`badge-swap-status-${status}`}>
      <Icon className="h-3 w-3" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

interface SwapRequest {
  id: string;
  originalAssignmentId: string;
  requestedByUserId: string;
  targetUserId: string | null;
  status: SwapStatus;
  reason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  eligibilityChecked?: boolean;
  eligibilityPassed?: boolean;
  eligibilityDetails?: {
    eligible: boolean;
    availabilityOk: boolean;
    roleMatch: boolean;
    complianceOk: boolean;
    violations: string[];
  };
  requestType?: string;
  expiresAt?: string;
}

interface SwapAuditLog {
  id: string;
  swapRequestId: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  previousStatus: string | null;
  newStatus: string | null;
  description: string | null;
  createdAt: string;
}

function PendingRequestsPanel() {
  const { toast } = useToast();
  const [selectedRequest, setSelectedRequest] = useState<SwapRequest | null>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [notes, setNotes] = useState("");

  const { data: pendingRequests, isLoading } = useQuery<SwapRequest[]>({
    queryKey: ['/api/scheduling/swap-requests/pending'],
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      return apiRequest('POST', `/api/scheduling/swap-requests/${id}/approve`, { notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling/swap-requests/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling/swap-requests/mine'] });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling/swap-requests/targeted'] });
      toast({ title: "Swap request approved", description: "The shift swap has been executed." });
      setShowApproveDialog(false);
      setSelectedRequest(null);
      setNotes("");
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to approve", 
        description: error.message || "An error occurred",
        variant: "destructive"
      });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      return apiRequest('POST', `/api/scheduling/swap-requests/${id}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling/swap-requests/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling/swap-requests/mine'] });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling/swap-requests/targeted'] });
      toast({ title: "Swap request rejected" });
      setShowRejectDialog(false);
      setSelectedRequest(null);
      setNotes("");
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to reject", 
        description: error.message || "An error occurred",
        variant: "destructive"
      });
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const requests = pendingRequests || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Pending Swap Requests</h3>
          <p className="text-sm text-muted-foreground">Review and approve employee shift swap requests</p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Clock className="h-3 w-3" />
          {requests.length} Pending
        </Badge>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No pending swap requests</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <Card key={request.id} className="hover-elevate">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {request.requestType === 'drop' ? 'Shift Drop Request' : 'Shift Swap Request'}
                      </span>
                      <SwapStatusBadge status={request.status} />
                    </div>
                    
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3" />
                        Requested by: {request.requestedByUserId}
                      </div>
                      {request.targetUserId && (
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3" />
                          Target: {request.targetUserId}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-3 w-3" />
                        Submitted: {format(new Date(request.createdAt), 'PPp')}
                      </div>
                      {request.expiresAt && (
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          Expires: {format(new Date(request.expiresAt), 'PPp')}
                        </div>
                      )}
                    </div>

                    {request.reason && (
                      <div className="flex items-start gap-2 text-sm">
                        <MessageSquare className="h-3 w-3 mt-1" />
                        <span>{request.reason}</span>
                      </div>
                    )}

                    {request.eligibilityDetails && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge 
                          variant={request.eligibilityDetails.availabilityOk ? "default" : "destructive"}
                          className="text-xs"
                        >
                          Availability: {request.eligibilityDetails.availabilityOk ? 'OK' : 'Failed'}
                        </Badge>
                        <Badge 
                          variant={request.eligibilityDetails.roleMatch ? "default" : "destructive"}
                          className="text-xs"
                        >
                          Role Match: {request.eligibilityDetails.roleMatch ? 'OK' : 'Failed'}
                        </Badge>
                        <Badge 
                          variant={request.eligibilityDetails.complianceOk ? "default" : "destructive"}
                          className="text-xs"
                        >
                          Compliance: {request.eligibilityDetails.complianceOk ? 'OK' : 'Failed'}
                        </Badge>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => {
                        setSelectedRequest(request);
                        setShowApproveDialog(true);
                      }}
                      data-testid={`button-approve-swap-${request.id}`}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setSelectedRequest(request);
                        setShowRejectDialog(true);
                      }}
                      data-testid={`button-reject-swap-${request.id}`}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Swap Request</DialogTitle>
            <DialogDescription>
              Approving will execute the shift swap immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Optional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid="input-approve-notes"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => selectedRequest && approveMutation.mutate({ id: selectedRequest.id, notes })}
              disabled={approveMutation.isPending}
              data-testid="button-confirm-approve"
            >
              {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Approve & Execute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Swap Request</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this swap request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Reason for rejection..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid="input-reject-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedRequest && rejectMutation.mutate({ id: selectedRequest.id, reason: notes })}
              disabled={rejectMutation.isPending}
              data-testid="button-confirm-reject"
            >
              {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <X className="h-4 w-4 mr-2" />}
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MyRequestsPanel() {
  const { toast } = useToast();

  const { data: myRequests, isLoading } = useQuery<SwapRequest[]>({
    queryKey: ['/api/scheduling/swap-requests/mine'],
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('POST', `/api/scheduling/swap-requests/${id}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling/swap-requests/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling/swap-requests/mine'] });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling/swap-requests/targeted'] });
      toast({ title: "Request cancelled" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to cancel", 
        description: error.message || "An error occurred",
        variant: "destructive"
      });
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const requests = myRequests || [];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">My Swap Requests</h3>
        <p className="text-sm text-muted-foreground">Track the status of your shift swap requests</p>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ArrowLeftRight className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">You haven't made any swap requests</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <Card key={request.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {request.requestType === 'drop' ? 'Shift Drop Request' : 'Shift Swap Request'}
                      </span>
                      <SwapStatusBadge status={request.status} />
                    </div>
                    
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-3 w-3" />
                        Submitted: {format(new Date(request.createdAt), 'PPp')}
                      </div>
                      {request.reviewedAt && (
                        <div className="flex items-center gap-2">
                          <Shield className="h-3 w-3" />
                          Reviewed: {format(new Date(request.reviewedAt), 'PPp')}
                        </div>
                      )}
                    </div>

                    {request.reviewNotes && (
                      <div className="flex items-start gap-2 text-sm bg-muted/50 p-2 rounded">
                        <MessageSquare className="h-3 w-3 mt-1" />
                        <span>{request.reviewNotes}</span>
                      </div>
                    )}
                  </div>

                  {request.status === 'pending' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => cancelMutation.mutate(request.id)}
                      disabled={cancelMutation.isPending}
                      data-testid={`button-cancel-swap-${request.id}`}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SwapConfigPanel() {
  const { toast } = useToast();

  const { data: config, isLoading } = useQuery<any>({
    queryKey: ['/api/scheduling/swap-config'],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Swap Configuration</h3>
        <p className="text-sm text-muted-foreground">Configure shift swap policies and rules</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Global Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Manager Approval Required</p>
              <Badge variant={config?.requiresManagerApproval ? "default" : "secondary"}>
                {config?.requiresManagerApproval ? "Yes" : "No"}
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Auto-Approve if Eligible</p>
              <Badge variant={config?.autoApproveIfEligible ? "default" : "secondary"}>
                {config?.autoApproveIfEligible ? "Yes" : "No"}
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Minimum Advance Notice</p>
              <Badge variant="outline">{config?.minAdvanceHours || 24} hours</Badge>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Max Swaps Per Week</p>
              <Badge variant="outline">{config?.maxSwapsPerWeek || 2}</Badge>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Request Expiration</p>
              <Badge variant="outline">{config?.requestExpirationHours || 48} hours</Badge>
            </div>
          </div>

          <Separator />

          <div>
            <p className="text-sm font-medium mb-2">Eligibility Checks</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant={config?.requireAvailabilityMatch ? "default" : "outline"}>
                Availability Match
              </Badge>
              <Badge variant={config?.requireRoleMatch ? "default" : "outline"}>
                Role Match
              </Badge>
              <Badge variant={config?.requireSkillMatch ? "default" : "outline"}>
                Skill Match
              </Badge>
              <Badge variant={config?.requireComplianceCheck ? "default" : "outline"}>
                Compliance Check
              </Badge>
            </div>
          </div>

          <Separator />

          <div>
            <p className="text-sm font-medium mb-2">Allowed Request Types</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant={config?.allowSwaps ? "default" : "outline"}>
                Swaps
              </Badge>
              <Badge variant={config?.allowDrops ? "default" : "outline"}>
                Drops
              </Badge>
              <Badge variant={config?.allowPickups ? "default" : "outline"}>
                Pickups
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ShiftSwapsTab() {
  const [activeSubTab, setActiveSubTab] = useState("pending");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Shift Swaps & Self-Service</h2>
          <p className="text-sm text-muted-foreground">
            Manage employee shift swap requests and self-service options
          </p>
        </div>
      </div>

      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList>
          <TabsTrigger value="pending" data-testid="subtab-pending-swaps">
            <Clock className="mr-2 h-4 w-4" />
            Pending Approvals
          </TabsTrigger>
          <TabsTrigger value="my-requests" data-testid="subtab-my-requests">
            <ArrowLeftRight className="mr-2 h-4 w-4" />
            My Requests
          </TabsTrigger>
          <TabsTrigger value="config" data-testid="subtab-swap-config">
            <Shield className="mr-2 h-4 w-4" />
            Configuration
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <PendingRequestsPanel />
        </TabsContent>

        <TabsContent value="my-requests" className="mt-4">
          <MyRequestsPanel />
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <SwapConfigPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
