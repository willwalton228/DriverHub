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
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
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
import { useToast } from "@/hooks/use-toast";
import {
  ShieldBan,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Ban,
  Unlock,
  KeyRound,
} from "lucide-react";

interface DnrStatus {
  isDnr: boolean;
  dnrReasonCode: string | null;
  dnrNotes: string | null;
  dnrSetAt: string | null;
  dnrSetBy: string | null;
  hasOverride: boolean;
  dnrOverrideJustification: string | null;
  dnrOverrideAt: string | null;
  dnrOverrideBy: string | null;
}

interface DnrReasonCode {
  code: string;
  label: string;
}

interface CandidateDnrBannerProps {
  candidateId: string;
  candidateName: string;
  userRole?: string;
  compact?: boolean;
}

export function CandidateDnrBanner({
  candidateId,
  candidateName,
  userRole,
  compact = false,
}: CandidateDnrBannerProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [flagOpen, setFlagOpen] = useState(false);
  const [liftOpen, setLiftOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState("");
  const [notes, setNotes] = useState("");
  const [liftReason, setLiftReason] = useState("");
  const [justification, setJustification] = useState("");

  const isAdmin = userRole === "admin" || userRole === "super_user";
  const isRecruitingAdmin = isAdmin || userRole === "recruiting_admin";

  const { data: dnrStatus, isLoading } = useQuery<DnrStatus>({
    queryKey: ["/api/recruiting/candidates", candidateId, "dnr-status"],
    enabled: !!candidateId,
  });

  const { data: reasonCodes } = useQuery<DnrReasonCode[]>({
    queryKey: ["/api/recruiting/dnr/reason-codes"],
    enabled: flagOpen,
  });

  const flagMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/recruiting/candidates/${candidateId}/dnr/flag`, {
        reasonCode,
        notes,
      });
    },
    onSuccess: () => {
      toast({ title: "DNR Flag Set", description: `${candidateName} has been flagged as Do-Not-Rehire.` });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates", candidateId, "dnr-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates"] });
      setFlagOpen(false);
      setReasonCode("");
      setNotes("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to set DNR flag", variant: "destructive" });
    },
  });

  const liftMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/recruiting/candidates/${candidateId}/dnr/lift`, {
        liftReason,
      });
    },
    onSuccess: () => {
      toast({ title: "DNR Lifted", description: `DNR flag has been removed from ${candidateName}.` });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates", candidateId, "dnr-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates"] });
      setLiftOpen(false);
      setLiftReason("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to lift DNR", variant: "destructive" });
    },
  });

  const overrideMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/recruiting/candidates/${candidateId}/dnr/override`, {
        justification,
      });
    },
    onSuccess: () => {
      toast({ title: "DNR Override Applied", description: `DNR override has been applied for ${candidateName}. Applications can now proceed.` });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates", candidateId, "dnr-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates"] });
      setOverrideOpen(false);
      setJustification("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to apply override", variant: "destructive" });
    },
  });

  if (isLoading) return null;

  const reasonLabel = (code: string | null) => {
    if (!code) return "Unknown";
    const labels: Record<string, string> = {
      safety_violation: "Safety Violation",
      policy_violation: "Policy Violation",
      theft_fraud: "Theft / Fraud",
      no_call_no_show: "Repeated No-Call/No-Show",
      failed_drug_test: "Failed Drug Test",
      license_revoked: "License Revoked",
      harassment: "Harassment / Misconduct",
      abandonment: "Job Abandonment",
      legal_issue: "Legal / Criminal Issue",
      other: "Other",
    };
    return labels[code] || code;
  };

  if (compact) {
    if (!dnrStatus?.isDnr) return null;
    return (
      <Badge variant="destructive" data-testid={`badge-dnr-${candidateId}`}>
        <Ban className="h-3 w-3 mr-1" />
        DNR
        {dnrStatus.hasOverride && (
          <ShieldCheck className="h-3 w-3 ml-1 text-yellow-300" />
        )}
      </Badge>
    );
  }

  return (
    <>
      {dnrStatus?.isDnr && (
        <Alert variant="destructive" className="mb-4" data-testid={`alert-dnr-banner-${candidateId}`}>
          <ShieldBan className="h-4 w-4" />
          <AlertTitle className="flex items-center gap-2 flex-wrap">
            Do-Not-Rehire
            <Badge variant="destructive" className="text-xs">
              {reasonLabel(dnrStatus.dnrReasonCode)}
            </Badge>
            {dnrStatus.hasOverride && (
              <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-600 dark:text-yellow-400">
                <KeyRound className="h-3 w-3 mr-1" />
                Override Active
              </Badge>
            )}
          </AlertTitle>
          <AlertDescription className="mt-2 space-y-2">
            {dnrStatus.dnrNotes && (
              <p className="text-sm">{dnrStatus.dnrNotes}</p>
            )}
            {dnrStatus.dnrSetAt && (
              <p className="text-xs text-muted-foreground">
                Flagged on {new Date(dnrStatus.dnrSetAt).toLocaleDateString()}
              </p>
            )}
            {dnrStatus.hasOverride && dnrStatus.dnrOverrideJustification && (
              <div className="mt-2 p-2 rounded-md bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800">
                <p className="text-xs font-medium text-yellow-800 dark:text-yellow-300">Override Justification</p>
                <p className="text-xs text-yellow-700 dark:text-yellow-400">{dnrStatus.dnrOverrideJustification}</p>
                {dnrStatus.dnrOverrideAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Applied on {new Date(dnrStatus.dnrOverrideAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}
            {isAdmin && (
              <div className="flex gap-2 mt-2 flex-wrap">
                <Dialog open={liftOpen} onOpenChange={setLiftOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" data-testid={`button-dnr-lift-${candidateId}`}>
                      <Unlock className="h-3.5 w-3.5 mr-1.5" />
                      Lift DNR
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Lift Do-Not-Rehire Flag</DialogTitle>
                      <DialogDescription>
                        Remove the DNR flag from {candidateName}. This will allow the candidate to be reactivated and have new applications.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <Label htmlFor="lift-reason" required>Reason for Lifting DNR</Label>
                      <Textarea
                        id="lift-reason"
                        value={liftReason}
                        onChange={(e) => setLiftReason(e.target.value)}
                        placeholder="Provide justification for removing the DNR flag..."
                        data-testid="input-dnr-lift-reason"
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setLiftOpen(false)} data-testid="button-dnr-lift-cancel">Cancel</Button>
                      <Button
                        onClick={() => liftMutation.mutate()}
                        disabled={!liftReason.trim() || liftMutation.isPending}
                        data-testid="button-dnr-lift-confirm"
                      >
                        {liftMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Lift DNR
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {!dnrStatus.hasOverride && (
                  <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" data-testid={`button-dnr-override-${candidateId}`}>
                        <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                        Override
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Override Do-Not-Rehire</DialogTitle>
                        <DialogDescription>
                          Apply an override to allow {candidateName} to proceed with applications while keeping the DNR flag on record. This requires detailed justification.
                        </DialogDescription>
                      </DialogHeader>
                      <Alert className="border-yellow-200 dark:border-yellow-800">
                        <ShieldAlert className="h-4 w-4 text-yellow-600" />
                        <AlertTitle className="text-yellow-800 dark:text-yellow-300">Admin Override</AlertTitle>
                        <AlertDescription className="text-yellow-700 dark:text-yellow-400 text-sm">
                          This override will be logged in the audit trail and is visible to all authorized users.
                        </AlertDescription>
                      </Alert>
                      <div className="space-y-3">
                        <Label htmlFor="override-justification" required>Justification</Label>
                        <Textarea
                          id="override-justification"
                          value={justification}
                          onChange={(e) => setJustification(e.target.value)}
                          placeholder="Provide detailed justification for overriding the DNR status..."
                          data-testid="input-dnr-override-justification"
                        />
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setOverrideOpen(false)} data-testid="button-dnr-override-cancel">Cancel</Button>
                        <Button
                          onClick={() => overrideMutation.mutate()}
                          disabled={!justification.trim() || overrideMutation.isPending}
                          variant="default"
                          data-testid="button-dnr-override-confirm"
                        >
                          {overrideMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Apply Override
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {!dnrStatus?.isDnr && isRecruitingAdmin && (
        <Dialog open={flagOpen} onOpenChange={setFlagOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="text-destructive" data-testid={`button-dnr-flag-${candidateId}`}>
              <ShieldBan className="h-3.5 w-3.5 mr-1.5" />
              Flag DNR
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Flag as Do-Not-Rehire</DialogTitle>
              <DialogDescription>
                Mark {candidateName} as permanently ineligible. This will block new applications, reactivation, and rehire attempts.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="dnr-reason-code" required>Reason Code</Label>
                <Select value={reasonCode} onValueChange={setReasonCode}>
                  <SelectTrigger data-testid="select-dnr-reason-code">
                    <SelectValue placeholder="Select a reason..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(reasonCodes || []).map((rc) => (
                      <SelectItem key={rc.code} value={rc.code} data-testid={`option-dnr-reason-${rc.code}`}>
                        {rc.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dnr-notes" required>Notes</Label>
                <Textarea
                  id="dnr-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Provide details about why this candidate should be flagged..."
                  data-testid="input-dnr-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFlagOpen(false)} data-testid="button-dnr-flag-cancel">Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => flagMutation.mutate()}
                disabled={!reasonCode || !notes.trim() || flagMutation.isPending}
                data-testid="button-dnr-flag-confirm"
              >
                {flagMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Flag as DNR
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export function DnrBadge({ candidateId }: { candidateId: string }) {
  return <CandidateDnrBanner candidateId={candidateId} candidateName="" compact />;
}
