import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  Clock,
  XCircle,
  ShieldCheck,
  ChevronDown,
  RotateCcw,
} from "lucide-react";

type RecruiterDecision = "approved_for_interview" | "hold" | "reject" | null;

interface RecruiterApprovalGateProps {
  applicationId: string;
  currentDecision: RecruiterDecision;
  decisionAt?: string | null;
  decisionNote?: string | null;
  onDecisionSaved?: (decision: RecruiterDecision) => void;
}

const DECISION_META: Record<
  NonNullable<RecruiterDecision>,
  { label: string; badgeColor: string; icon: React.ReactNode; description: string }
> = {
  approved_for_interview: {
    label: "Approved for Interview",
    badgeColor: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    icon: <CheckCircle2 className="h-4 w-4" />,
    description: "Candidate may self-schedule a screening interview.",
  },
  hold: {
    label: "On Hold",
    badgeColor: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    icon: <Clock className="h-4 w-4" />,
    description: "Application is paused — scheduling links are locked.",
  },
  reject: {
    label: "Rejected",
    badgeColor: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    icon: <XCircle className="h-4 w-4" />,
    description: "Application declined — scheduling links are locked.",
  },
};

export function RecruiterApprovalGate({
  applicationId,
  currentDecision,
  decisionAt,
  decisionNote,
  onDecisionSaved,
}: RecruiterApprovalGateProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pendingDecision, setPendingDecision] = useState<NonNullable<RecruiterDecision> | null>(null);
  const [noteText, setNoteText] = useState("");
  const [showChangeDialog, setShowChangeDialog] = useState(false);

  const mutation = useMutation({
    mutationFn: (payload: { decision: NonNullable<RecruiterDecision>; note?: string }) =>
      apiRequest("POST", `/api/recruiting/applications/${applicationId}/recruiter-decision`, payload),
    onSuccess: (_data, vars) => {
      toast({
        title: "Decision recorded",
        description: `Application marked as "${DECISION_META[vars.decision].label}".`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/recruiting/applications", applicationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/recruiting/applications"] });
      onDecisionSaved?.(vars.decision);
      setPendingDecision(null);
      setNoteText("");
      setShowChangeDialog(false);
    },
    onError: () => {
      toast({ title: "Failed to save decision", variant: "destructive" });
    },
  });

  function openConfirm(decision: NonNullable<RecruiterDecision>) {
    setPendingDecision(decision);
    setNoteText("");
    setShowChangeDialog(true);
  }

  function submitDecision() {
    if (!pendingDecision) return;
    mutation.mutate({ decision: pendingDecision, note: noteText.trim() || undefined });
  }

  const meta = currentDecision ? DECISION_META[currentDecision] : null;

  return (
    <>
      <Card data-testid="card-recruiter-approval-gate">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Recruiter Decision
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current status */}
          {meta ? (
            <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${meta.badgeColor}`}>
                {meta.icon}
                {meta.label}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">{meta.description}</p>
                {decisionAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(decisionAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                )}
                {decisionNote && (
                  <p className="text-xs text-muted-foreground mt-1 italic">"{decisionNote}"</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50 text-sm text-muted-foreground">
              <Clock className="h-4 w-4 shrink-0" />
              No decision recorded — candidate cannot self-schedule until approved.
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={currentDecision === "approved_for_interview" ? "default" : "outline"}
              data-testid="button-approve-for-interview"
              disabled={mutation.isPending}
              onClick={() => openConfirm("approved_for_interview")}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Approve for Interview
            </Button>
            <Button
              size="sm"
              variant={currentDecision === "hold" ? "secondary" : "outline"}
              data-testid="button-decision-hold"
              disabled={mutation.isPending}
              onClick={() => openConfirm("hold")}
            >
              <Clock className="h-3.5 w-3.5 mr-1.5" />
              Hold
            </Button>
            <Button
              size="sm"
              variant={currentDecision === "reject" ? "destructive" : "outline"}
              data-testid="button-decision-reject"
              disabled={mutation.isPending}
              onClick={() => openConfirm("reject")}
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5" />
              Reject
            </Button>
            {currentDecision && (
              <Button
                size="sm"
                variant="ghost"
                data-testid="button-clear-decision"
                disabled={mutation.isPending}
                onClick={() => openConfirm("hold")}
                className="ml-auto"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Change
              </Button>
            )}
          </div>

          {/* Audit note */}
          {!currentDecision && (
            <p className="text-xs text-muted-foreground">
              All decisions are logged to the immutable audit trail.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Confirmation dialog */}
      <Dialog open={showChangeDialog} onOpenChange={setShowChangeDialog}>
        <DialogContent data-testid="dialog-recruiter-decision">
          <DialogHeader>
            <DialogTitle>
              {pendingDecision ? `Confirm: ${DECISION_META[pendingDecision].label}` : "Confirm Decision"}
            </DialogTitle>
            <DialogDescription>
              {pendingDecision ? DECISION_META[pendingDecision].description : ""}
              {" "}This action is logged to the audit trail.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label htmlFor="decision-note">Note (optional)</Label>
            <Textarea
              id="decision-note"
              data-testid="input-decision-note"
              placeholder="Add a reason or context for this decision…"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChangeDialog(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              data-testid="button-confirm-decision"
              disabled={mutation.isPending}
              onClick={submitDecision}
              variant={pendingDecision === "reject" ? "destructive" : "default"}
            >
              {mutation.isPending ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
