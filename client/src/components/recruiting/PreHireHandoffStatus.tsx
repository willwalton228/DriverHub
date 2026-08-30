/**
 * Pre-Hire Handoff Status — Ticket 29
 *
 * Displays the full auto-handoff state for an application that has received
 * a "Proceed to Pre-Hire" interview decision:
 *   - Three screening checks (MVR, Background Check, Drug Test) with live status
 *   - Candidate notification record showing what instructions were sent and when
 *   - Trigger interview attribution
 *   - Overall handoff health indicator
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, Clock, XCircle, AlertTriangle, ShieldCheck,
  Car, Search, FlaskConical, Bell, BellOff, ChevronDown,
  CalendarCheck, User, ArrowRight, Loader2,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

interface ScreeningRequest {
  id: string;
  screeningType: string;
  status: string;
  triggeredAt: string;
  updatedAt: string | null;
  notes: string | null;
}

interface CandidateNotification {
  id: string;
  notificationType: string;
  channel: string;
  status: string;
  subject: string;
  body: string;
  screeningsTriggered: string[] | null;
  sentAt: string;
  readAt: string | null;
  triggerSource: string;
}

interface TriggerInterview {
  id: string;
  title: string;
  interviewerDecision: string;
  interviewerDecisionAt: string;
  interviewerDecisionNote: string | null;
  interviewType: string;
}

interface HandoffStatus {
  applicationId: string;
  handoffInitiated: boolean;
  initiatedAt: string | null;
  candidateNotifiedAt: string | null;
  candidateNotification: CandidateNotification | null;
  screeningRequests: ScreeningRequest[];
  screeningSummary: {
    mvr: ScreeningRequest | null;
    background_check: ScreeningRequest | null;
    drug_test: ScreeningRequest | null;
  };
  triggerInterview: TriggerInterview | null;
  overallStatus: "not_initiated" | "in_progress" | "partial" | "all_clear" | "flagged";
}

// ── Status helpers ────────────────────────────────────────────────────────────

const SCREENING_LABELS: Record<string, string> = {
  mvr: "MVR Check",
  background_check: "Background Check",
  drug_test: "Drug Test",
};

const SCREENING_ICONS: Record<string, typeof Car> = {
  mvr: Car,
  background_check: Search,
  drug_test: FlaskConical,
};

const SCREENING_DESCRIPTIONS: Record<string, string> = {
  mvr: "Motor vehicle record — driving history and license validity",
  background_check: "Criminal history, identity, and employment verification",
  drug_test: "Pre-employment 5-panel or 10-panel drug screening",
};

type ScreeningStatus = "requested" | "pending" | "scheduled" | "in_progress" | "clear" | "completed" | "flagged" | "failed" | "waived" | "not_started";

function getStatusConfig(status: string): {
  label: string;
  icon: typeof CheckCircle2;
  className: string;
  badgeVariant: "default" | "secondary" | "destructive" | "outline";
} {
  const map: Record<string, ReturnType<typeof getStatusConfig>> = {
    requested:    { label: "Requested",    icon: Clock,          className: "text-blue-600 dark:text-blue-400",   badgeVariant: "secondary" },
    pending:      { label: "Pending",      icon: Clock,          className: "text-muted-foreground",              badgeVariant: "outline" },
    scheduled:    { label: "Scheduled",    icon: CalendarCheck,  className: "text-blue-600 dark:text-blue-400",   badgeVariant: "secondary" },
    in_progress:  { label: "In Progress",  icon: Loader2,        className: "text-yellow-600 dark:text-yellow-400", badgeVariant: "secondary" },
    clear:        { label: "Clear",        icon: CheckCircle2,   className: "text-green-600 dark:text-green-400", badgeVariant: "default" },
    completed:    { label: "Completed",    icon: CheckCircle2,   className: "text-green-600 dark:text-green-400", badgeVariant: "default" },
    flagged:      { label: "Flagged",      icon: AlertTriangle,  className: "text-yellow-600 dark:text-yellow-400", badgeVariant: "secondary" },
    failed:       { label: "Failed",       icon: XCircle,        className: "text-destructive",                   badgeVariant: "destructive" },
    waived:       { label: "Waived",       icon: CheckCircle2,   className: "text-muted-foreground",              badgeVariant: "outline" },
    not_started:  { label: "Not Started",  icon: Clock,          className: "text-muted-foreground",              badgeVariant: "outline" },
  };
  return map[status] ?? { label: status, icon: Clock, className: "text-muted-foreground", badgeVariant: "outline" };
}

function OverallStatusBanner({ status }: { status: HandoffStatus["overallStatus"] }) {
  const configs = {
    not_initiated: { icon: Clock,       label: "Screening Not Yet Initiated", className: "bg-muted text-muted-foreground" },
    in_progress:   { icon: Clock,       label: "Screening In Progress",        className: "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300" },
    partial:       { icon: Clock,       label: "Some Screenings Pending",      className: "bg-yellow-50 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300" },
    all_clear:     { icon: ShieldCheck, label: "All Screenings Clear",         className: "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300" },
    flagged:       { icon: AlertTriangle, label: "Screening Issue Detected",   className: "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300" },
  };
  const cfg = configs[status];
  const Icon = cfg.icon;
  return (
    <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${cfg.className}`}>
      <Icon className="h-4 w-4 shrink-0" />
      {cfg.label}
    </div>
  );
}

// ── Screening Row ─────────────────────────────────────────────────────────────

function ScreeningRow({ type, request }: { type: string; request: ScreeningRequest | null }) {
  const Icon = SCREENING_ICONS[type] ?? Search;
  const statusCfg = request ? getStatusConfig(request.status) : getStatusConfig("not_started");
  const StatusIcon = statusCfg.icon;

  return (
    <div
      className="flex items-center gap-3 py-3 border-b last:border-0"
      data-testid={`screening-row-${type}`}
    >
      <div className="flex items-center justify-center h-8 w-8 rounded-md bg-muted shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{SCREENING_LABELS[type] ?? type}</span>
          <div className={`flex items-center gap-1 text-xs font-medium ${statusCfg.className}`}>
            <StatusIcon className="h-3.5 w-3.5" />
            {statusCfg.label}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-tight">
          {SCREENING_DESCRIPTIONS[type]}
        </p>
        {request && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Triggered {formatDistanceToNow(new Date(request.triggeredAt))} ago
            {request.updatedAt && request.updatedAt !== request.triggeredAt &&
              ` · updated ${formatDistanceToNow(new Date(request.updatedAt))} ago`}
          </p>
        )}
      </div>
      {!request && (
        <Badge variant="outline" className="text-xs shrink-0">Pending</Badge>
      )}
    </div>
  );
}

// ── Candidate Notification Panel ──────────────────────────────────────────────

function CandidateNotificationPanel({
  notification,
  applicationId,
}: {
  notification: CandidateNotification;
  applicationId: string;
}) {
  const [showBody, setShowBody] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const markReadMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/recruiting/applications/${applicationId}/candidate-notifications/${notification.id}/mark-read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications", applicationId, "handoff-status"] });
      toast({ title: "Notification marked as read" });
    },
  });

  const isRead = !!notification.readAt;

  return (
    <div className="space-y-2" data-testid="candidate-notification-panel">
      <div className="flex items-start gap-3 p-3 rounded-md border bg-muted/30">
        <div className="flex items-center justify-center h-8 w-8 rounded-md bg-green-100 dark:bg-green-900/30 shrink-0">
          <Bell className="h-4 w-4 text-green-600 dark:text-green-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">Next-Step Instructions Sent</span>
            <Badge variant="outline" className="text-xs capitalize">
              {notification.channel === "in_app" ? "In-App" : notification.channel}
            </Badge>
            {isRead ? (
              <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-0.5">
                <CheckCircle2 className="h-3 w-3" /> Read
              </span>
            ) : (
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                <BellOff className="h-3 w-3" /> Unread
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{notification.subject}</p>
          <p className="text-xs text-muted-foreground">
            Sent {format(new Date(notification.sentAt), "MMM d, yyyy 'at' h:mm a")}
            {isRead && notification.readAt && ` · Read ${formatDistanceToNow(new Date(notification.readAt))} ago`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isRead && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => markReadMutation.mutate()}
              disabled={markReadMutation.isPending}
              data-testid="button-mark-notification-read"
            >
              Mark Read
            </Button>
          )}
        </div>
      </div>

      <Collapsible open={showBody} onOpenChange={setShowBody}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-between" data-testid="button-toggle-notification-body">
            <span className="text-xs">{showBody ? "Hide" : "View"} notification content</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showBody ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 p-3 rounded-md bg-muted text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed border">
            {notification.body}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface PreHireHandoffStatusProps {
  applicationId: string;
  /** If true, only show when handoff has been initiated (hides the "not yet" empty state) */
  compact?: boolean;
}

export function PreHireHandoffStatus({ applicationId, compact = false }: PreHireHandoffStatusProps) {
  const { data, isLoading } = useQuery<HandoffStatus>({
    queryKey: ["/api/recruiting/applications", applicationId, "handoff-status"],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/applications/${applicationId}/handoff-status`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load handoff status");
      return res.json();
    },
    refetchInterval: (data) => {
      // Poll every 30s while screenings are in progress
      if (data && (data as HandoffStatus).overallStatus === "in_progress") return 30_000;
      return false;
    },
  });

  if (isLoading) {
    return (
      <Card data-testid="card-pre-hire-handoff">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-full" />
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;
  if (compact && !data.handoffInitiated) return null;

  return (
    <Card data-testid="card-pre-hire-handoff">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Pre-Hire Screening</CardTitle>
        </div>
        {data.triggerInterview && (
          <CardDescription className="flex items-center gap-1">
            <User className="h-3 w-3" />
            Initiated by{" "}
            <strong className="text-foreground/80">{data.triggerInterview.title}</strong>{" "}
            interview decision
            {data.initiatedAt && (
              <> · {formatDistanceToNow(new Date(data.initiatedAt))} ago</>
            )}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Overall status banner */}
        <OverallStatusBanner status={data.overallStatus} />

        {!data.handoffInitiated ? (
          <div className="py-6 flex flex-col items-center gap-2 text-muted-foreground">
            <ShieldCheck className="h-8 w-8 opacity-30" />
            <p className="text-sm">Screening will initiate automatically when an interviewer selects <strong>Proceed to Pre-Hire</strong>.</p>
          </div>
        ) : (
          <>
            {/* Trigger interview attribution */}
            {data.triggerInterview && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground p-2 rounded-md bg-muted/50">
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Auto-handoff triggered from{" "}
                  <strong className="text-foreground/80">{data.triggerInterview.title}</strong>
                  {data.triggerInterview.interviewerDecisionNote && (
                    <>: &ldquo;{data.triggerInterview.interviewerDecisionNote}&rdquo;</>
                  )}
                </span>
              </div>
            )}

            {/* Screening checklist */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Screening Checks</p>
              <div className="rounded-md border divide-y divide-border overflow-hidden">
                <ScreeningRow type="mvr" request={data.screeningSummary.mvr} />
                <ScreeningRow type="background_check" request={data.screeningSummary.background_check} />
                <ScreeningRow type="drug_test" request={data.screeningSummary.drug_test} />
              </div>
            </div>

            {/* Candidate notification */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Candidate Notification</p>
              {data.candidateNotification ? (
                <CandidateNotificationPanel
                  notification={data.candidateNotification}
                  applicationId={applicationId}
                />
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 rounded-md border bg-muted/30">
                  <BellOff className="h-4 w-4 shrink-0" />
                  No candidate notification on record.
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
