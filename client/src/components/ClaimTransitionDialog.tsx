import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Circle,
  ChevronRight,
  AlertTriangle,
  Lock,
} from "lucide-react";
import { ClaimStatusBadge, STAGE_ORDER } from "./ClaimStatusBadge";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────
interface ReadinessRequirement {
  key: string;
  label: string;
  met: boolean;
}

interface AvailableTransition {
  status: string;
  label: string;
  color: string;
  description: string;
}

interface WorkflowData {
  current_status: string;
  status_info: { label: string; description: string };
  stage_index: number;
  stage_order: string[];
  available_transitions: AvailableTransition[];
  readiness_requirements: ReadinessRequirement[];
  is_ready: boolean;
  is_editable: boolean;
  can_add_info: boolean;
}

// ── Stage labels for the progress stepper ─────────────────────────────────────
const STAGE_LABELS: Record<string, string> = {
  DRAFT:                'Draft',
  IN_REVIEW:            'In Review',
  READY_FOR_SUBMISSION: 'Ready',
  SUBMITTED:            'Submitted',
  CLOSED:               'Closed',
};

// ── Stage progress stepper ────────────────────────────────────────────────────
function StageStepper({ currentStatus, stageIndex }: { currentStatus: string; stageIndex: number }) {
  return (
    <div className="flex items-center w-full gap-0" data-testid="claim-stage-stepper">
      {STAGE_ORDER.map((stage, idx) => {
        const isDone    = idx < stageIndex;
        const isCurrent = idx === stageIndex;
        const isFuture  = idx > stageIndex;

        return (
          <div key={stage} className="flex items-center flex-1 min-w-0">
            {/* Step circle */}
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div
                className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-full border-2 transition-colors",
                  isDone    && "bg-primary border-primary text-primary-foreground",
                  isCurrent && "bg-background border-primary text-primary ring-2 ring-primary/25 ring-offset-1",
                  isFuture  && "bg-background border-border text-muted-foreground",
                )}
                data-testid={`stage-circle-${stage.toLowerCase()}`}
              >
                {isDone ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : isCurrent ? (
                  <Circle className="h-3.5 w-3.5 fill-primary text-primary" />
                ) : (
                  <Circle className="h-3 w-3" />
                )}
              </div>
              <span
                className={cn(
                  "text-[10px] text-center leading-tight max-w-[56px] truncate",
                  isCurrent && "text-primary font-semibold text-[11px]",
                  isDone    && "text-foreground font-medium",
                  isFuture  && "text-muted-foreground font-medium",
                )}
              >
                {STAGE_LABELS[stage]}
              </span>
            </div>

            {/* Connector line (skip after last step) */}
            {idx < STAGE_ORDER.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-1 mb-4 transition-colors",
                  idx < stageIndex ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Readiness checklist ────────────────────────────────────────────────────────
function ReadinessChecklist({ requirements }: { requirements: ReadinessRequirement[] }) {
  if (requirements.length === 0) return null;

  const allMet = requirements.every(r => r.met);

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Requirements to advance
      </p>
      <div className="space-y-0.5">
        {requirements.map((req) => (
          <div
            key={req.key}
            className="flex items-center gap-2"
            data-testid={`req-${req.key}-${req.met ? 'met' : 'unmet'}`}
          >
            {req.met ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="h-3 w-3 text-destructive shrink-0" />
            )}
            <span
              className={cn(
                "text-xs",
                req.met ? "text-muted-foreground line-through" : "text-foreground",
              )}
            >
              {req.label}
            </span>
          </div>
        ))}
      </div>
      {!allMet && (
        <p className="text-[11px] text-muted-foreground">
          Complete the items above to unlock this transition.
        </p>
      )}
    </div>
  );
}

// ── Main exported component ────────────────────────────────────────────────────
interface ClaimWorkflowPanelProps {
  claimId: string;
  currentStatus: string | null | undefined;
  onTransitionComplete?: () => void;
  /** When true the panel renders in compact (header bar) mode */
  compact?: boolean;
}

export function ClaimWorkflowPanel({
  claimId,
  currentStatus,
  onTransitionComplete,
  compact = false,
}: ClaimWorkflowPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [note, setNote] = useState("");
  const { toast } = useToast();

  const { data: workflowData, isLoading, refetch } = useQuery<WorkflowData>({
    queryKey: ['/api/claims', claimId, 'available-transitions'],
    enabled: !!claimId,
    staleTime: 0,
  });

  const transitionMutation = useMutation({
    mutationFn: async ({ toStatus, note }: { toStatus: string; note: string }) => {
      const res = await apiRequest('POST', `/api/claims/${claimId}/transition`, {
        to_status: toStatus,
        note: note || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      const newLabel = data?.accident?.claimStatus || data?.claim_status || 'Unknown';
      toast({ title: "Stage advanced", description: `Claim moved to ${newLabel.replace(/_/g, ' ')}` });
      queryClient.invalidateQueries({ queryKey: ['/api/claims', claimId] });
      queryClient.invalidateQueries({ queryKey: ['/api/claims', claimId, 'available-transitions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents', claimId] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/accidents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/drivers'] });
      setDialogOpen(false);
      setNote("");
      onTransitionComplete?.();
    },
    onError: (error: any) => {
      let description = error?.message || "Failed to advance claim";
      try {
        const parsed = typeof error?.message === 'string' ? JSON.parse(error.message.split(': ').slice(1).join(': ') || '{}') : {};
        if (parsed.unmet_requirements?.length) {
          description = `Unmet: ${parsed.unmet_requirements.map((r: any) => r.label).join(', ')}`;
        }
      } catch { /* use raw message */ }
      toast({ title: "Transition blocked", description, variant: "destructive" });
    },
  });

  const isClosed = currentStatus === 'CLOSED';
  const stageIndex = workflowData?.stage_index ?? STAGE_ORDER.indexOf((currentStatus || 'DRAFT') as any);
  const requirements = workflowData?.readiness_requirements ?? [];
  const isReady = workflowData?.is_ready ?? false;
  const nextTransition = workflowData?.available_transitions?.[0] ?? null;
  const isEditable = workflowData?.is_editable ?? true;

  const handleAdvance = () => {
    if (!nextTransition) return;
    transitionMutation.mutate({ toStatus: nextTransition.status, note });
  };

  if (compact) {
    // Compact mode: just the transition button for header bars (badge removed — status shown in Operational Summary)
    return (
      <div className="flex items-center gap-2">
        {!isClosed && nextTransition && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialogOpen(true)}
            disabled={isLoading}
            data-testid="button-transition-claim"
          >
            <ArrowRight className="h-3.5 w-3.5 mr-1" />
            Advance
          </Button>
        )}
        <TransitionConfirmDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          nextTransition={nextTransition}
          currentStatus={currentStatus}
          requirements={requirements}
          isReady={isReady}
          note={note}
          onNoteChange={setNote}
          onConfirm={handleAdvance}
          isPending={transitionMutation.isPending}
        />
      </div>
    );
  }

  // Full panel mode
  return (
    <div className="space-y-2" data-testid="claim-workflow-panel">
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading workflow state…
        </div>
      ) : (
        <>
          {/* Stage progress stepper */}
          <StageStepper currentStatus={currentStatus || 'DRAFT'} stageIndex={stageIndex >= 0 ? stageIndex : 0} />

          {/* Current stage description */}
          <div className="space-y-0.5 pt-0.5">
            <div className="flex items-center gap-2">
              <ClaimStatusBadge status={currentStatus} />
              {isClosed && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  Claim is closed
                </span>
              )}
            </div>
            {workflowData?.status_info?.description && (
              <p className="text-xs text-muted-foreground">{workflowData.status_info.description}</p>
            )}
          </div>

          {/* Readiness requirements */}
          {!isClosed && requirements.length > 0 && (
            <ReadinessChecklist requirements={requirements} />
          )}

          {/* Advance button */}
          {!isClosed && nextTransition && (
            <div className="pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialogOpen(true)}
                disabled={!isReady}
                data-testid="button-advance-stage"
                className="w-full sm:w-auto"
              >
                {isReady ? (
                  <ArrowRight className="h-4 w-4 mr-1.5" />
                ) : (
                  <AlertTriangle className="h-4 w-4 mr-1.5" />
                )}
                Advance to {nextTransition.label}
              </Button>
              {!isReady && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  Complete the requirements above to unlock this transition.
                </p>
              )}
            </div>
          )}

          {isClosed && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              No further transitions available — claim is closed.
            </div>
          )}
        </>
      )}

      <TransitionConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        nextTransition={nextTransition}
        currentStatus={currentStatus}
        requirements={requirements}
        isReady={isReady}
        note={note}
        onNoteChange={setNote}
        onConfirm={handleAdvance}
        isPending={transitionMutation.isPending}
      />
    </div>
  );
}

// ── Confirmation dialog ────────────────────────────────────────────────────────
function TransitionConfirmDialog({
  open,
  onOpenChange,
  nextTransition,
  currentStatus,
  requirements,
  isReady,
  note,
  onNoteChange,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nextTransition: AvailableTransition | null;
  currentStatus: string | null | undefined;
  requirements: ReadinessRequirement[];
  isReady: boolean;
  note: string;
  onNoteChange: (v: string) => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  if (!nextTransition) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Advance Claim Stage</DialogTitle>
          <DialogDescription>
            Move this claim from{" "}
            <strong>{currentStatus?.replace(/_/g, ' ')}</strong> to{" "}
            <strong>{nextTransition.label}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* From → To */}
          <div className="flex items-center gap-3">
            <ClaimStatusBadge status={currentStatus} />
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            <ClaimStatusBadge status={nextTransition.status} />
          </div>

          {/* Requirements summary */}
          {requirements.length > 0 && (
            <div className="space-y-1.5">
              {requirements.map((req) => (
                <div key={req.key} className="flex items-center gap-2">
                  {req.met ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  )}
                  <span className={cn("text-xs", req.met ? "text-foreground" : "text-muted-foreground")}>
                    {req.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Note */}
          <div className="space-y-1.5">
            <Label htmlFor="transition-note" className="text-xs">
              Transition note <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="transition-note"
              placeholder="Add a note about this transition…"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              className="min-h-[72px]"
              data-testid="input-transition-note"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-transition"
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!isReady || isPending}
            data-testid="button-confirm-transition"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Advancing…
              </>
            ) : (
              <>
                <ArrowRight className="h-4 w-4 mr-1.5" />
                Confirm Advance
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Backward-compat named export (used by old callers) ────────────────────────
export function ClaimTransitionDialog({
  claimId,
  currentStatus,
  onTransitionComplete,
}: {
  claimId: string;
  currentStatus: string | null | undefined;
  onTransitionComplete?: () => void;
}) {
  return (
    <ClaimWorkflowPanel
      claimId={claimId}
      currentStatus={currentStatus}
      onTransitionComplete={onTransitionComplete}
      compact
    />
  );
}
