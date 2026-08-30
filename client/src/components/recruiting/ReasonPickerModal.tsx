import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Loader2 } from "lucide-react";

interface ReasonCode {
  id: string;
  code: string;
  label: string;
  description: string | null;
  stage: string;
  isRequired: boolean;
  isActive: boolean;
  displayOrder: number;
  market: string | null;
}

interface ReasonPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  stage: string;
  market?: string;
  onReasonRecorded: (reason: { reasonCodeId: string | null; notes: string }) => void;
  onSkip?: () => void;
}

export function ReasonPickerModal({
  open,
  onOpenChange,
  applicationId,
  stage,
  market,
  onReasonRecorded,
  onSkip,
}: ReasonPickerModalProps) {
  const { toast } = useToast();
  const [selectedReasonId, setSelectedReasonId] = useState<string>("");
  const [notes, setNotes] = useState("");

  const { data: reasonCodes, isLoading } = useQuery<ReasonCode[]>({
    queryKey: ['/api/recruiting/reason-codes', { stage, market, activeOnly: 'true' }],
    queryFn: async () => {
      const params = new URLSearchParams({ stage, activeOnly: 'true' });
      if (market) params.append('market', market);
      const response = await fetch(`/api/recruiting/reason-codes?${params}`);
      if (!response.ok) throw new Error('Failed to fetch reason codes');
      return response.json();
    },
    enabled: open && !!stage,
  });

  const { data: requirementCheck } = useQuery<{ required: boolean; codes: ReasonCode[] }>({
    queryKey: ['/api/recruiting/reason-codes/required', stage, market],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (market) params.append('market', market);
      const response = await fetch(`/api/recruiting/reason-codes/required/${stage}?${params}`);
      if (!response.ok) throw new Error('Failed to check requirement');
      return response.json();
    },
    enabled: open && !!stage,
  });

  const recordReasonMutation = useMutation({
    mutationFn: async (data: { stage: string; reasonCodeId: string | null; notes: string }) => {
      return apiRequest("POST", `/api/recruiting/applications/${applicationId}/stage-reason`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/applications', applicationId, 'stage-reasons'] });
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/applications'] });
      toast({
        title: "Reason recorded",
        description: "The stage reason has been saved.",
      });
      onReasonRecorded({ reasonCodeId: selectedReasonId || null, notes });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to record reason",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setSelectedReasonId("");
    setNotes("");
  };

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  const isRequired = requirementCheck?.required || false;
  const canSubmit = !isRequired || selectedReasonId;
  const canSkip = !isRequired && onSkip;

  const handleSubmit = () => {
    recordReasonMutation.mutate({
      stage,
      reasonCodeId: selectedReasonId || null,
      notes,
    });
  };

  const handleSkip = () => {
    if (onSkip) {
      onSkip();
      onOpenChange(false);
      resetForm();
    }
  };

  const getStageLabel = (stage: string) => {
    const labels: Record<string, string> = {
      rejected: "Rejection",
      hold: "Hold",
      withdrawn: "Withdrawal",
      screening: "Screening",
      interview: "Interview",
      offer: "Offer",
    };
    return labels[stage] || stage;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {getStageLabel(stage)} Reason
          </DialogTitle>
          <DialogDescription>
            {isRequired 
              ? "A reason is required for this status change."
              : "Optionally provide a reason for this status change."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {isRequired && (
              <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-700 dark:text-amber-400">
                  Selecting a reason is required for {getStageLabel(stage).toLowerCase()}.
                </AlertDescription>
              </Alert>
            )}

            {reasonCodes && reasonCodes.length > 0 ? (
              <div className="space-y-2">
                <Label>Select Reason</Label>
                <RadioGroup
                  value={selectedReasonId}
                  onValueChange={setSelectedReasonId}
                  className="space-y-2"
                >
                  {reasonCodes.map((code) => (
                    <div
                      key={code.id}
                      className="flex items-start space-x-3 p-3 rounded-md border hover-elevate cursor-pointer"
                      onClick={() => setSelectedReasonId(code.id)}
                      data-testid={`reason-option-${code.code}`}
                    >
                      <RadioGroupItem value={code.id} id={code.id} className="mt-0.5" />
                      <div className="flex-1">
                        <Label htmlFor={code.id} className="font-medium cursor-pointer">
                          {code.label}
                        </Label>
                        {code.description && (
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {code.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No reason codes configured for this stage.
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes (optional)</Label>
              <Textarea
                id="notes"
                placeholder="Add any additional context..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[80px]"
                data-testid="input-reason-notes"
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {canSkip && (
            <Button variant="ghost" onClick={handleSkip} data-testid="button-skip-reason">
              Skip
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || recordReasonMutation.isPending}
            data-testid="button-submit-reason"
          >
            {recordReasonMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Recording...
              </>
            ) : (
              "Record Reason"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
