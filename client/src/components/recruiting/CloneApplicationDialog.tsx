import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, Copy, ArrowRight, MapPin, Briefcase } from "lucide-react";

interface CloneApplicationDialogProps {
  applicationId: string;
  candidateName: string;
  currentRequisitionId: string;
  currentRequisitionTitle: string;
  trigger: React.ReactNode;
}

export function CloneApplicationDialog({
  applicationId,
  candidateName,
  currentRequisitionId,
  currentRequisitionTitle,
  trigger,
}: CloneApplicationDialogProps) {
  const [open, setOpen] = useState(false);
  const [targetRequisitionId, setTargetRequisitionId] = useState<string>("");
  const { toast } = useToast();

  const requisitionsQuery = useQuery<any[]>({
    queryKey: ["/api/recruiting/requisitions"],
    enabled: open,
  });

  const availableRequisitions = (requisitionsQuery.data || []).filter(
    (r: any) => r.id !== currentRequisitionId && r.status === "open" && !r.isArchived && !r.isPaused
  );

  const selectedRequisition = availableRequisitions.find(
    (r: any) => r.id === targetRequisitionId
  );

  const cloneMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/recruiting/applications/${applicationId}/clone`,
        { targetRequisitionId }
      );
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Application cloned",
        description: `New application created for ${candidateName} on "${selectedRequisition?.title || "target requisition"}"`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requisitions"] });
      setOpen(false);
      setTargetRequisitionId("");
    },
    onError: (error: any) => {
      toast({
        title: "Clone failed",
        description: error.message || "Failed to clone application",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setTargetRequisitionId(""); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg" data-testid="dialog-clone-application">
        <DialogHeader>
          <DialogTitle data-testid="text-clone-dialog-title">Clone Application</DialogTitle>
          <DialogDescription>
            Create a new application for <strong>{candidateName}</strong> on a different requisition.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
              Current Requisition
            </label>
            <Card>
              <CardContent className="p-3 flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm" data-testid="text-current-requisition">{currentRequisitionTitle}</span>
              </CardContent>
            </Card>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Target Requisition
            </label>
            {requisitionsQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading requisitions...
              </div>
            ) : availableRequisitions.length === 0 ? (
              <p className="text-sm text-muted-foreground p-2" data-testid="text-no-requisitions">
                No other open requisitions available.
              </p>
            ) : (
              <Select value={targetRequisitionId} onValueChange={setTargetRequisitionId}>
                <SelectTrigger data-testid="select-target-requisition">
                  <SelectValue placeholder="Select a requisition..." />
                </SelectTrigger>
                <SelectContent>
                  {availableRequisitions.map((r: any) => (
                    <SelectItem key={r.id} value={r.id} data-testid={`option-requisition-${r.id}`}>
                      <div className="flex items-center gap-2">
                        <span>{r.title}</span>
                        {r.market && (
                          <span className="text-muted-foreground text-xs flex items-center gap-0.5">
                            <MapPin className="h-3 w-3" />
                            {r.market}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {targetRequisitionId && (
            <div className="space-y-3" data-testid="clone-confirmation-details">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ArrowRight className="h-4 w-4" />
                <span>Clone preview</span>
              </div>

              <Card>
                <CardContent className="p-3 space-y-2">
                  <p className="text-sm font-medium">What will be copied:</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary" data-testid="badge-copy-identity">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Candidate identity
                    </Badge>
                    <Badge variant="secondary" data-testid="badge-copy-owner">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Recruiter assignment
                    </Badge>
                    <Badge variant="secondary" data-testid="badge-copy-tags">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Tags
                    </Badge>
                    <Badge variant="secondary" data-testid="badge-copy-workstate">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Work state
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-3 space-y-2">
                  <p className="text-sm font-medium">What will NOT be copied:</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" data-testid="badge-nocopy-stage">
                      <XCircle className="h-3 w-3 mr-1" />
                      Stage history
                    </Badge>
                    <Badge variant="outline" data-testid="badge-nocopy-interviews">
                      <XCircle className="h-3 w-3 mr-1" />
                      Interviews
                    </Badge>
                    <Badge variant="outline" data-testid="badge-nocopy-rejection">
                      <XCircle className="h-3 w-3 mr-1" />
                      Rejection reasons
                    </Badge>
                    <Badge variant="outline" data-testid="badge-nocopy-readiness">
                      <XCircle className="h-3 w-3 mr-1" />
                      Readiness score
                    </Badge>
                    <Badge variant="outline" data-testid="badge-nocopy-compliance">
                      <XCircle className="h-3 w-3 mr-1" />
                      Compliance status
                    </Badge>
                    <Badge variant="outline" data-testid="badge-nocopy-documents">
                      <XCircle className="h-3 w-3 mr-1" />
                      Documents
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-3">
                  <p className="text-sm text-muted-foreground">
                    The new application will start at the initial stage of the target requisition's workflow.
                    Compliance rules will be re-evaluated based on the target requisition's state requirements.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => { setOpen(false); setTargetRequisitionId(""); }}
            data-testid="button-clone-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={() => cloneMutation.mutate()}
            disabled={!targetRequisitionId || cloneMutation.isPending}
            data-testid="button-clone-confirm"
          >
            {cloneMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Cloning...
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Clone Application
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}