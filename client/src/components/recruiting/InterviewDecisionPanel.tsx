import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  Clock,
  XCircle,
  Video,
  Phone,
  MapPin,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Loader2,
  CalendarCheck,
  ShieldCheck,
  Bell,
  ArrowRight,
  Car,
  Search,
  FlaskConical,
} from "lucide-react";

type InterviewDecision = "proceed_to_pre_hire" | "hold" | "decline";

const DECISION_CONFIG: Record<
  InterviewDecision,
  {
    label: string;
    icon: React.ReactNode;
    badgeColor: string;
    stageLabel: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  proceed_to_pre_hire: {
    label: "Proceed to Pre-Hire",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    badgeColor: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    stageLabel: "→ Background Check",
    variant: "default",
  },
  hold: {
    label: "Hold",
    icon: <Clock className="h-3.5 w-3.5" />,
    badgeColor: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    stageLabel: "→ Interview Completed (paused)",
    variant: "secondary",
  },
  decline: {
    label: "Decline",
    icon: <XCircle className="h-3.5 w-3.5" />,
    badgeColor: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    stageLabel: "→ Rejected",
    variant: "destructive",
  },
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  phone: <Phone className="h-3.5 w-3.5" />,
  video: <Video className="h-3.5 w-3.5" />,
  in_person: <MapPin className="h-3.5 w-3.5" />,
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

interface InterviewDecisionFormProps {
  interview: any;
  applicationId: string;
  onSaved: () => void;
}

interface HandoffConfirmation {
  triggered: string[];
  skipped: string[];
  notificationId: string | null;
  candidateNotifiedAt: string | null;
}

const SCREENING_ICON_MAP: Record<string, typeof Car> = {
  mvr: Car,
  background_check: Search,
  drug_test: FlaskConical,
};

const SCREENING_LABEL_MAP: Record<string, string> = {
  mvr: "MVR Check",
  background_check: "Background Check",
  drug_test: "Drug Test",
};

function AutoHandoffBanner({ confirmation }: { confirmation: HandoffConfirmation }) {
  return (
    <div
      className="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-3 space-y-2"
      data-testid="banner-auto-handoff"
    >
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
        <span className="text-sm font-semibold text-green-800 dark:text-green-300">
          Auto-Handoff Complete
        </span>
      </div>

      <div className="space-y-1.5 pl-6">
        {/* Screenings triggered */}
        <div className="space-y-1">
          {confirmation.triggered.map((type) => {
            const Icon = SCREENING_ICON_MAP[type] ?? CheckCircle2;
            return (
              <div key={type} className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{SCREENING_LABEL_MAP[type] ?? type} — initiated</span>
              </div>
            );
          })}
          {confirmation.skipped.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span>{confirmation.skipped.map((s) => SCREENING_LABEL_MAP[s] ?? s).join(", ")} — already active, skipped</span>
            </div>
          )}
        </div>

        {/* Notification status */}
        <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
          <Bell className="h-3.5 w-3.5 shrink-0" />
          {confirmation.notificationId
            ? "Candidate next-step instructions recorded"
            : "Candidate notification already on file"}
        </div>

        {/* Stage indicator */}
        <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          Application advanced to Background Check stage
        </div>
      </div>
    </div>
  );
}

function InterviewDecisionForm({ interview, applicationId, onSaved }: InterviewDecisionFormProps) {
  const { toast } = useToast();
  const [selectedDecision, setSelectedDecision] = useState<InterviewDecision | null>(
    interview.interviewerDecision ?? null
  );
  const [note, setNote] = useState(interview.interviewerDecisionNote ?? "");
  const [open, setOpen] = useState(!interview.interviewerDecision);
  const [handoffConfirmation, setHandoffConfirmation] = useState<HandoffConfirmation | null>(null);

  const mutation = useMutation({
    mutationFn: async (payload: { decision: InterviewDecision; note: string }) => {
      const res = await apiRequest("POST", `/api/recruiting/interviews/${interview.id}/decision`, payload);
      return res.json();
    },
    onSuccess: (data: any, vars) => {
      toast({
        title: "Decision recorded",
        description: `"${DECISION_CONFIG[vars.decision].label}" saved — application stage updated.`,
      });
      onSaved();
      setOpen(false);
      // Show auto-handoff confirmation banner when proceeding to pre-hire
      if (vars.decision === "proceed_to_pre_hire" && data?.screeningResult) {
        setHandoffConfirmation({
          triggered: data.screeningResult.triggered ?? [],
          skipped: data.screeningResult.skipped ?? [],
          notificationId: data.screeningResult.notificationId ?? null,
          candidateNotifiedAt: data.screeningResult.candidateNotifiedAt ?? null,
        });
      }
    },
    onError: (err: any) => {
      toast({ title: "Failed to save decision", description: err.message, variant: "destructive" });
    },
  });

  const isDecided = !!interview.interviewerDecision;
  const cfg = selectedDecision ? DECISION_CONFIG[selectedDecision] : null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className="rounded-md border p-3 space-y-2"
        data-testid={`interview-card-${interview.id}`}
      >
        {/* Interview summary row */}
        <div className="flex items-start gap-2 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{interview.title}</span>
              {isDecided && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    DECISION_CONFIG[interview.interviewerDecision as InterviewDecision].badgeColor
                  }`}
                >
                  {DECISION_CONFIG[interview.interviewerDecision as InterviewDecision].icon}
                  {DECISION_CONFIG[interview.interviewerDecision as InterviewDecision].label}
                </span>
              )}
              {!isDecided && (
                <Badge variant="outline" className="text-xs">Pending Decision</Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
              {TYPE_ICON[interview.interviewType] && (
                <span className="flex items-center gap-1">
                  {TYPE_ICON[interview.interviewType]}
                  {interview.interviewType?.replace("_", "-")}
                </span>
              )}
              {interview.startTime && (
                <span className="flex items-center gap-1">
                  <CalendarCheck className="h-3 w-3" />
                  {formatDateTime(interview.startTime)}
                </span>
              )}
              <span>{interview.durationMinutes}min</span>
            </div>
            {isDecided && interview.interviewerDecisionNote && (
              <p className="text-xs text-muted-foreground mt-1 italic">
                "{interview.interviewerDecisionNote}"
              </p>
            )}
          </div>

          <CollapsibleTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              data-testid={`btn-toggle-decision-${interview.id}`}
            >
              {open ? (
                <ChevronDown className="h-3.5 w-3.5 mr-1" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 mr-1" />
              )}
              {isDecided ? "Change Decision" : "Record Decision"}
            </Button>
          </CollapsibleTrigger>
        </div>

        {/* Auto-handoff confirmation banner — shown after proceed_to_pre_hire */}
        {handoffConfirmation && (
          <AutoHandoffBanner confirmation={handoffConfirmation} />
        )}

        {/* Expandable decision form */}
        <CollapsibleContent>
          <div className="pt-2 border-t mt-2 space-y-4">
            {/* Decision buttons */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                Interviewer Decision
              </Label>
              <div className="flex flex-wrap gap-2">
                {(["proceed_to_pre_hire", "hold", "decline"] as InterviewDecision[]).map((d) => {
                  const dcfg = DECISION_CONFIG[d];
                  const isSelected = selectedDecision === d;
                  return (
                    <Button
                      key={d}
                      size="sm"
                      variant={isSelected ? dcfg.variant : "outline"}
                      onClick={() => setSelectedDecision(d)}
                      data-testid={`btn-decision-${d}-${interview.id}`}
                      disabled={mutation.isPending}
                    >
                      {dcfg.icon}
                      <span className="ml-1.5">{dcfg.label}</span>
                    </Button>
                  );
                })}
              </div>
              {cfg && (
                <p className="text-xs text-muted-foreground">
                  Application will move: <strong>{cfg.stageLabel}</strong>
                </p>
              )}
            </div>

            {/* Required note */}
            <div className="space-y-1.5">
              <Label htmlFor={`decision-note-${interview.id}`} className="flex items-center gap-1">
                Notes / Reason
                <span className="text-destructive ml-0.5">*</span>
              </Label>
              <Textarea
                id={`decision-note-${interview.id}`}
                data-testid={`input-decision-note-${interview.id}`}
                placeholder="Summarize the interview and explain your decision…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                disabled={mutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Required. Stored permanently in the audit trail.
              </p>
            </div>

            <Button
              className="w-full"
              disabled={!selectedDecision || !note.trim() || mutation.isPending}
              onClick={() => mutation.mutate({ decision: selectedDecision!, note })}
              data-testid={`btn-submit-decision-${interview.id}`}
              variant={selectedDecision === "decline" ? "destructive" : "default"}
            >
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ClipboardCheck className="h-4 w-4 mr-2" />
              )}
              {mutation.isPending ? "Saving…" : "Save Decision"}
            </Button>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

interface InterviewDecisionPanelProps {
  applicationId: string;
}

export function InterviewDecisionPanel({ applicationId }: InterviewDecisionPanelProps) {
  const queryClient = useQueryClient();

  const { data: interviews = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/recruiting/applications", applicationId, "interviews"],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/applications/${applicationId}/interviews`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load interviews");
      return res.json();
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({
      queryKey: ["/api/recruiting/applications", applicationId, "interviews"],
    });
    queryClient.invalidateQueries({
      queryKey: ["/api/corporate/recruiting/applications", applicationId],
    });
    queryClient.invalidateQueries({
      queryKey: ["/api/corporate/recruiting/applications"],
    });
  };

  const pendingCount = interviews.filter((i) => !i.interviewerDecision).length;

  return (
    <Card data-testid="card-interview-decisions">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          Interview Decisions
          {pendingCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {pendingCount} pending
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center gap-2 py-3 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading interviews…</span>
          </div>
        ) : interviews.length === 0 ? (
          <div className="py-5 text-center space-y-1">
            <CalendarCheck className="h-7 w-7 text-muted-foreground/40 mx-auto" />
            <p className="text-sm text-muted-foreground">No interviews scheduled yet.</p>
            <p className="text-xs text-muted-foreground">
              Decisions can be recorded once a self-scheduling booking is created.
            </p>
          </div>
        ) : (
          interviews.map((interview) => (
            <InterviewDecisionForm
              key={interview.id}
              interview={interview}
              applicationId={applicationId}
              onSaved={refresh}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
