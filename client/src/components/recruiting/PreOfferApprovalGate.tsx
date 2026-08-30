import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  BadgeCheck,
  AlertTriangle,
} from "lucide-react";

type PreOfferDecision = "approved_for_offer" | "decline_after_screening" | null;

interface PreOfferApprovalGateProps {
  applicationId: string;
  currentDecision: PreOfferDecision;
  decisionAt?: string | null;
  decisionNote?: string | null;
  /** Whether all 3 screenings have terminal results — gates the action buttons */
  screeningsComplete?: boolean;
  onDecisionSaved?: (decision: PreOfferDecision) => void;
}

const DECISION_META: Record<
  NonNullable<PreOfferDecision>,
  { label: string; badgeColor: string; icon: React.ReactNode; description: string }
> = {
  approved_for_offer: {
    label: "Approved for Offer",
    badgeColor: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    icon: <CheckCircle2 className="h-4 w-4" />,
    description: "Candidate has passed all screenings and is cleared to receive an offer.",
  },
  decline_after_screening: {
    label: "Declined After Screening",
    badgeColor: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    icon: <XCircle className="h-4 w-4" />,
    description: "Candidate has been declined based on screening results.",
  },
};

export function PreOfferApprovalGate({
  applicationId,
  currentDecision,
  decisionAt,
  decisionNote,
  screeningsComplete = false,
  onDecisionSaved,
}: PreOfferApprovalGateProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pendingDecision, setPendingDecision] = useState<NonNullable<PreOfferDecision> | null>(null);
  const [noteText, setNoteText] = useState("");
  const [showDialog, setShowDialog] = useState(false);

  const mutation = useMutation({
    mutationFn: (payload: { decision: NonNullable<PreOfferDecision>; note?: string }) =>
      apiRequest("POST", `/api/recruiting/applications/${applicationId}/pre-offer-decision`, payload),
    onSuccess: (_data, vars) => {
      toast({
        title: "Pre-offer decision recorded",
        description: `Application marked as "${DECISION_META[vars.decision].label}".`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/recruiting/applications", applicationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/recruiting/applications"] });
      onDecisionSaved?.(vars.decision);
      setPendingDecision(null);
      setNoteText("");
      setShowDialog(false);
    },
    onError: () => {
      toast({ title: "Failed to save decision", variant: "destructive" });
    },
  });

  function openConfirm(decision: NonNullable<PreOfferDecision>) {
    setPendingDecision(decision);
    setNoteText("");
    setShowDialog(true);
  }

  function submitDecision() {
    if (!pendingDecision) return;
    if (!noteText.trim()) return; // note is required
    mutation.mutate({ decision: pendingDecision, note: noteText.trim() });
  }

  const meta = currentDecision ? DECISION_META[currentDecision] : null;
  const noteRequired = !noteText.trim();

  return (
    <>
      <Card data-testid="card-pre-offer-approval-gate">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BadgeCheck className="h-4 w-4 text-primary" />
            Pre-Offer Approval Gate
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current decision status */}
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
              Awaiting pre-offer decision — candidate cannot advance to offer stage until approved.
            </div>
          )}

          {/* Screening prerequisite warning */}
          {!screeningsComplete && !currentDecision && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-yellow-50 dark:bg-yellow-900/20 text-sm text-yellow-800 dark:text-yellow-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              All three screenings (MVR, Background, Drug Test) must reach a terminal result before a decision can be recorded.
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={currentDecision === "approved_for_offer" ? "default" : "outline"}
              data-testid="button-approve-for-offer"
              disabled={mutation.isPending || (!screeningsComplete && !currentDecision)}
              onClick={() => openConfirm("approved_for_offer")}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Approve for Offer
            </Button>
            <Button
              size="sm"
              variant={currentDecision === "decline_after_screening" ? "destructive" : "outline"}
              data-testid="button-decline-after-screening"
              disabled={mutation.isPending || (!screeningsComplete && !currentDecision)}
              onClick={() => openConfirm("decline_after_screening")}
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5" />
              Decline After Screening
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            A decision note is required. All decisions are logged to the immutable audit trail.
          </p>
        </CardContent>
      </Card>

      {/* Confirmation dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent data-testid="dialog-pre-offer-decision">
          <DialogHeader>
            <DialogTitle>
              {pendingDecision ? `Confirm: ${DECISION_META[pendingDecision].label}` : "Confirm Decision"}
            </DialogTitle>
            <DialogDescription>
              {pendingDecision ? DECISION_META[pendingDecision].description : ""}
              {" "}This decision is final and logged to the immutable audit trail.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label htmlFor="pre-offer-note">
              Decision Note <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="pre-offer-note"
              data-testid="input-pre-offer-note"
              placeholder="Required — provide your reasoning for this decision…"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
            />
            {noteRequired && noteText !== "" && (
              <p className="text-xs text-destructive">A decision note is required.</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              disabled={mutation.isPending}
              data-testid="button-pre-offer-cancel"
            >
              Cancel
            </Button>
            <Button
              data-testid="button-pre-offer-confirm"
              disabled={mutation.isPending || noteRequired}
              onClick={submitDecision}
              variant={pendingDecision === "decline_after_screening" ? "destructive" : "default"}
            >
              {mutation.isPending ? "Saving…" : "Confirm Decision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
