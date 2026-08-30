import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { 
  RotateCcw, 
  History, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock,
  FileText,
  User,
  Loader2,
  RefreshCw,
  CalendarDays
} from "lucide-react";

interface PriorOutcome {
  id: string;
  stage: string;
  status: string;
  requisitionTitle?: string;
  appliedAt: string;
  decidedAt?: string;
  decisionReason?: string;
  isRehire?: boolean;
}

interface RehireEligibility {
  eligible: boolean;
  reasons: string[];
  lastApplicationDate?: string;
  totalApplications: number;
  lastOutcome?: string;
}

interface CandidateReactivationProps {
  candidateId: string;
  candidateName: string;
  isArchived?: boolean;
  onSuccess?: () => void;
}

export function CandidateReactivation({ 
  candidateId, 
  candidateName,
  isArchived = true,
  onSuccess 
}: CandidateReactivationProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: eligibility, isLoading: eligibilityLoading } = useQuery<RehireEligibility>({
    queryKey: ["/api/recruiting/candidates", candidateId, "rehire-eligibility"],
    enabled: open,
  });

  const { data: priorOutcomesData, isLoading: outcomesLoading } = useQuery<{ outcomes: PriorOutcome[] }>({
    queryKey: ["/api/recruiting/candidates", candidateId, "prior-outcomes"],
    enabled: open,
  });

  const priorOutcomes = priorOutcomesData?.outcomes || [];

  const reactivateMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/recruiting/candidates/${candidateId}/reactivate`, {
        reason,
      });
    },
    onSuccess: () => {
      toast({
        title: "Candidate Reactivated",
        description: `${candidateName} has been reactivated and is back in the talent pool.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/archived/candidates"] });
      setOpen(false);
      setReason("");
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "Reactivation Failed",
        description: error.message || "Failed to reactivate candidate",
        variant: "destructive",
      });
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case "hired":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "rejected":
      case "withdrawn":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "in_progress":
      case "active":
        return <Clock className="h-4 w-4 text-blue-500" />;
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "hired":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Hired</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      case "withdrawn":
        return <Badge variant="secondary">Withdrawn</Badge>;
      case "in_progress":
      case "active":
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">In Progress</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          data-testid={`button-reactivate-candidate-${candidateId}`}
        >
          <RotateCcw className="h-4 w-4 mr-1" />
          Reactivate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Reactivate Candidate
          </DialogTitle>
          <DialogDescription>
            Reactivate <strong>{candidateName}</strong> to bring them back into the talent pool. 
            Review their prior history before proceeding.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {eligibilityLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : eligibility && !eligibility.eligible ? (
            <Card className="border-destructive bg-destructive/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Not Eligible for Reactivation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  {eligibility.reasons.map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : (
            <>
              {eligibility && (
                <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-green-700 dark:text-green-300">
                      <CheckCircle className="h-4 w-4" />
                      Eligible for Reactivation
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    <div className="flex flex-wrap gap-4">
                      <span className="flex items-center gap-1">
                        <History className="h-3 w-3" />
                        {eligibility.totalApplications} prior application(s)
                      </span>
                      {eligibility.lastApplicationDate && (
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          Last: {new Date(eligibility.lastApplicationDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Separator />

              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Prior Application History
                </h4>
                
                {outcomesLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : priorOutcomes.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">
                    No prior applications found for this candidate.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {priorOutcomes.map((outcome) => (
                      <div
                        key={outcome.id}
                        className="flex items-start gap-3 p-3 border rounded-lg bg-card"
                        data-testid={`prior-outcome-${outcome.id}`}
                      >
                        {getStatusIcon(outcome.status)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">
                              {outcome.requisitionTitle || "Unknown Position"}
                            </span>
                            {getStatusBadge(outcome.status)}
                            {outcome.isRehire && (
                              <Badge variant="outline" className="text-xs">
                                Rehire
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            <span>Applied: {new Date(outcome.appliedAt).toLocaleDateString()}</span>
                            {outcome.decidedAt && (
                              <span>Decided: {new Date(outcome.decidedAt).toLocaleDateString()}</span>
                            )}
                          </div>
                          {outcome.decisionReason && (
                            <p className="text-xs text-muted-foreground mt-1 italic">
                              "{outcome.decisionReason}"
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="reactivation-reason" required>Reason for Reactivation</Label>
                <Textarea
                  id="reactivation-reason"
                  placeholder="Enter the reason for reactivating this candidate (e.g., new position available, candidate reached out, etc.)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="min-h-[80px]"
                  data-testid="input-reactivation-reason"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => setOpen(false)}
            data-testid="button-cancel-reactivation"
          >
            Cancel
          </Button>
          <Button
            onClick={() => reactivateMutation.mutate()}
            disabled={
              !reason.trim() || 
              reactivateMutation.isPending || 
              eligibilityLoading ||
              (eligibility && !eligibility.eligible)
            }
            data-testid="button-confirm-reactivation"
          >
            {reactivateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Reactivating...
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reactivate Candidate
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RehireApplicationDialogProps {
  candidateId: string;
  candidateName: string;
  requisitions: Array<{ id: string; title: string; market?: string; status?: string }>;
  onSuccess?: () => void;
}

export function RehireApplicationDialog({
  candidateId,
  candidateName,
  requisitions,
  onSuccess
}: RehireApplicationDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedRequisitionId, setSelectedRequisitionId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [runComplianceCheck, setRunComplianceCheck] = useState(true);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const activeRequisitions = requisitions.filter(r => r.status === 'open' || r.status === 'active');

  const createRehireMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/recruiting/candidates/${candidateId}/rehire-application`, {
        requisitionId: selectedRequisitionId,
        reason,
        runComplianceCheck,
        autoTagRehire: true,
        preserveOwner: true,
      });
    },
    onSuccess: (data: any) => {
      let message = `Rehire application created for ${candidateName}.`;
      if (data.complianceIssues && data.complianceIssues.length > 0) {
        message += ` Note: ${data.complianceIssues.length} compliance issue(s) require attention.`;
      }
      toast({
        title: "Rehire Application Created",
        description: message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates", candidateId] });
      setOpen(false);
      setSelectedRequisitionId("");
      setReason("");
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Create Rehire Application",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="default" 
          size="sm"
          data-testid={`button-create-rehire-${candidateId}`}
        >
          <User className="h-4 w-4 mr-1" />
          Create Rehire Application
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Create Rehire Application
          </DialogTitle>
          <DialogDescription>
            Create a new application for <strong>{candidateName}</strong> as a rehire. 
            Their prior history will be preserved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="requisition-select" required>Select Position</Label>
            <Select value={selectedRequisitionId} onValueChange={setSelectedRequisitionId}>
              <SelectTrigger id="requisition-select" data-testid="select-requisition">
                <SelectValue placeholder="Choose a position..." />
              </SelectTrigger>
              <SelectContent>
                {activeRequisitions.length === 0 ? (
                  <SelectItem value="none" disabled>No open positions available</SelectItem>
                ) : (
                  activeRequisitions.map((req) => (
                    <SelectItem key={req.id} value={req.id}>
                      {req.title} {req.market && `(${req.market})`}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rehire-reason">Reason for Rehire</Label>
            <Textarea
              id="rehire-reason"
              placeholder="Optional: Add context about why this candidate is being rehired"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[60px]"
              data-testid="input-rehire-reason"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="compliance-check"
              checked={runComplianceCheck}
              onChange={(e) => setRunComplianceCheck(e.target.checked)}
              className="rounded border-muted-foreground"
              data-testid="checkbox-compliance-check"
            />
            <Label htmlFor="compliance-check" className="text-sm font-normal">
              Run compliance re-check (verify documents/credentials are current)
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => setOpen(false)}
            data-testid="button-cancel-rehire"
          >
            Cancel
          </Button>
          <Button
            onClick={() => createRehireMutation.mutate()}
            disabled={
              !selectedRequisitionId || 
              createRehireMutation.isPending
            }
            data-testid="button-confirm-rehire"
          >
            {createRehireMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <User className="h-4 w-4 mr-2" />
                Create Application
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PriorOutcomesCard({ candidateId }: { candidateId: string }) {
  const { data: priorOutcomesData, isLoading } = useQuery<{ outcomes: PriorOutcome[] }>({
    queryKey: ["/api/recruiting/candidates", candidateId, "prior-outcomes"],
  });

  const priorOutcomes = priorOutcomesData?.outcomes || [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="h-4 w-4" />
            Prior Outcomes
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (priorOutcomes.length === 0) {
    return null;
  }

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "hired":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Hired</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      case "withdrawn":
        return <Badge variant="secondary">Withdrawn</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card data-testid={`card-prior-outcomes-${candidateId}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <History className="h-4 w-4" />
          Prior Outcomes ({priorOutcomes.length})
        </CardTitle>
        <CardDescription className="text-xs">
          Previous application history
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {priorOutcomes.slice(0, 3).map((outcome) => (
            <div
              key={outcome.id}
              className="flex items-center justify-between text-sm"
              data-testid={`outcome-summary-${outcome.id}`}
            >
              <span className="truncate flex-1 mr-2">
                {outcome.requisitionTitle || "Unknown Position"}
              </span>
              <div className="flex items-center gap-2">
                {getStatusBadge(outcome.status)}
                {outcome.isRehire && (
                  <Badge variant="outline" className="text-xs">Rehire</Badge>
                )}
              </div>
            </div>
          ))}
          {priorOutcomes.length > 3 && (
            <p className="text-xs text-muted-foreground">
              +{priorOutcomes.length - 3} more
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
