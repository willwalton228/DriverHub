import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { UserX, Clock, RotateCcw, AlertTriangle, CheckCircle } from "lucide-react";

type ActionType = "withdraw" | "no_show" | "reactivate";

interface WithdrawalNoShowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  candidateName: string;
  currentStage: string;
  withdrawnAt?: string | null;
  noShowAt?: string | null;
  actionType?: ActionType;
}

const withdrawalSources = [
  { value: "candidate", label: "Candidate requested" },
  { value: "recruiter", label: "Recruiter decision" },
  { value: "system", label: "System automated" },
  { value: "other", label: "Other" },
];

const noShowReasons = [
  { value: "missed_interview", label: "Missed scheduled interview" },
  { value: "no_response", label: "No response to communications" },
  { value: "failed_to_appear", label: "Failed to appear for orientation" },
  { value: "missed_deadline", label: "Missed document deadline" },
  { value: "other", label: "Other" },
];

const applicationStages = [
  { value: "applied", label: "Applied" },
  { value: "screening", label: "Screening" },
  { value: "phone_screen", label: "Phone Screen" },
  { value: "interview_scheduled", label: "Interview Scheduled" },
  { value: "interview_completed", label: "Interview Completed" },
  { value: "offer_extended", label: "Offer Extended" },
  { value: "offer_accepted", label: "Offer Accepted" },
  { value: "background_check", label: "Background Check" },
  { value: "onboarding", label: "Onboarding" },
];

export function WithdrawalNoShowDialog({
  open,
  onOpenChange,
  applicationId,
  candidateName,
  currentStage,
  withdrawnAt,
  noShowAt,
  actionType: initialActionType,
}: WithdrawalNoShowDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const isWithdrawnOrNoShow = !!withdrawnAt || !!noShowAt;
  const defaultActionType: ActionType = isWithdrawnOrNoShow ? "reactivate" : (initialActionType || "withdraw");
  
  const [actionType, setActionType] = useState<ActionType>(defaultActionType);
  const [reason, setReason] = useState("");
  const [source, setSource] = useState("recruiter");
  const [excludeFromMetrics, setExcludeFromMetrics] = useState(false);
  const [notes, setNotes] = useState("");
  const [restoreToStage, setRestoreToStage] = useState("applied");

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/recruiting/applications/${applicationId}/withdraw`, {
        reason,
        source,
        excludeFromMetrics,
        notes,
      });
    },
    onSuccess: () => {
      toast({
        title: "Application Withdrawn",
        description: `${candidateName}'s application has been marked as withdrawn.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications"] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to withdraw application",
        variant: "destructive",
      });
    },
  });

  const noShowMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/recruiting/applications/${applicationId}/no-show`, {
        reason,
        excludeFromMetrics,
        notes,
      });
    },
    onSuccess: () => {
      toast({
        title: "No-Show Recorded",
        description: `${candidateName}'s application has been marked as no-show.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications"] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to record no-show",
        variant: "destructive",
      });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/recruiting/applications/${applicationId}/reactivate`, {
        restoreToStage,
        notes,
      });
    },
    onSuccess: () => {
      toast({
        title: "Application Reactivated",
        description: `${candidateName}'s application has been restored to ${restoreToStage}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications"] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reactivate application",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setReason("");
    setSource("recruiter");
    setExcludeFromMetrics(false);
    setNotes("");
    setRestoreToStage("applied");
  };

  const handleSubmit = () => {
    if (actionType === "withdraw") {
      withdrawMutation.mutate();
    } else if (actionType === "no_show") {
      noShowMutation.mutate();
    } else if (actionType === "reactivate") {
      reactivateMutation.mutate();
    }
  };

  const isPending = withdrawMutation.isPending || noShowMutation.isPending || reactivateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-withdrawal-noshow">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {actionType === "withdraw" && (
              <>
                <UserX className="h-5 w-5 text-orange-500" />
                Withdraw Application
              </>
            )}
            {actionType === "no_show" && (
              <>
                <Clock className="h-5 w-5 text-red-500" />
                Record No-Show
              </>
            )}
            {actionType === "reactivate" && (
              <>
                <RotateCcw className="h-5 w-5 text-green-500" />
                Reactivate Application
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {actionType === "withdraw" && "Mark this application as withdrawn. This action can be reversed."}
            {actionType === "no_show" && "Record that the candidate did not show up. This will move the application to no-show status."}
            {actionType === "reactivate" && "Restore this application to an active stage."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Candidate:</span>
            <Badge variant="secondary" data-testid="badge-candidate-name">{candidateName}</Badge>
            <Badge variant="outline" data-testid="badge-current-stage">{currentStage}</Badge>
          </div>

          {!isWithdrawnOrNoShow && (
            <div className="space-y-2">
              <Label>Action Type</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={actionType === "withdraw" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActionType("withdraw")}
                  data-testid="button-action-withdraw"
                >
                  <UserX className="h-4 w-4 mr-1" />
                  Withdraw
                </Button>
                <Button
                  type="button"
                  variant={actionType === "no_show" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActionType("no_show")}
                  data-testid="button-action-noshow"
                >
                  <Clock className="h-4 w-4 mr-1" />
                  No-Show
                </Button>
              </div>
            </div>
          )}

          {isWithdrawnOrNoShow && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  This application is currently {withdrawnAt ? "withdrawn" : "marked as no-show"}
                </p>
                <p className="text-amber-700 dark:text-amber-300">
                  You can reactivate it to restore to an active recruiting stage.
                </p>
              </div>
            </div>
          )}

          {actionType === "withdraw" && (
            <div className="space-y-2">
              <Label htmlFor="withdrawal-source">Withdrawal Source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger data-testid="select-withdrawal-source">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {withdrawalSources.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {actionType === "no_show" && (
            <div className="space-y-2">
              <Label htmlFor="noshow-reason">No-Show Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger data-testid="select-noshow-reason">
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {noShowReasons.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {actionType === "reactivate" && (
            <div className="space-y-2">
              <Label htmlFor="restore-stage">Restore to Stage</Label>
              <Select value={restoreToStage} onValueChange={setRestoreToStage}>
                <SelectTrigger data-testid="select-restore-stage">
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  {applicationStages.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(actionType === "withdraw" || actionType === "no_show") && (
            <>
              <div className="space-y-2">
                <Label htmlFor="reason">Reason / Notes</Label>
                <Textarea
                  id="reason"
                  value={actionType === "withdraw" ? reason : notes}
                  onChange={(e) => actionType === "withdraw" ? setReason(e.target.value) : setNotes(e.target.value)}
                  placeholder={`Enter the ${actionType === "withdraw" ? "withdrawal" : "no-show"} reason...`}
                  className="min-h-[80px]"
                  data-testid="textarea-reason"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="space-y-0.5">
                  <Label htmlFor="exclude-metrics" className="text-sm font-medium">
                    Exclude from Metrics
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    This application won't be counted in funnel conversion rates
                  </p>
                </div>
                <Switch
                  id="exclude-metrics"
                  checked={excludeFromMetrics}
                  onCheckedChange={setExcludeFromMetrics}
                  data-testid="switch-exclude-metrics"
                />
              </div>
            </>
          )}

          {actionType === "reactivate" && (
            <div className="space-y-2">
              <Label htmlFor="reactivate-notes">Notes</Label>
              <Textarea
                id="reactivate-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Enter notes about why this application is being reactivated..."
                className="min-h-[80px]"
                data-testid="textarea-reactivate-notes"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            variant={actionType === "reactivate" ? "default" : "destructive"}
            data-testid="button-submit"
          >
            {isPending ? (
              "Processing..."
            ) : (
              <>
                {actionType === "withdraw" && "Withdraw Application"}
                {actionType === "no_show" && "Record No-Show"}
                {actionType === "reactivate" && (
                  <>
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Reactivate
                  </>
                )}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
