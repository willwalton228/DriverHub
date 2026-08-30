/**
 * Screening Status Tracker — Ticket 12
 *
 * Tracks MVR, Background Check, and Drug Test with type-specific status
 * taxonomies. Always visible on the application detail view.
 *
 * MVR / Background: not_started → pending → clear | flagged
 * Drug Test:        not_started → scheduled → completed | failed | flagged
 *
 * Recruiters can manually start any screening and update statuses at any time.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Car,
  FileSearch,
  FlaskConical,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Flag,
  PlayCircle,
  CalendarClock,
  Pencil,
  Minus,
  Timer,
  Hourglass,
} from "lucide-react";

// ── SLA Thresholds (Ticket 13) ────────────────────────────────────────────────

interface SlaThreshold {
  warnDays: number;
  overdueDays: number;
}

const SLA_THRESHOLDS: Record<ScreeningType, SlaThreshold> = {
  mvr:              { warnDays: 3, overdueDays: 5 },
  background_check: { warnDays: 5, overdueDays: 7 },
  drug_test:        { warnDays: 2, overdueDays: 4 },
};

// Statuses where SLA clock is running
const SLA_ACTIVE_STATUSES = new Set([
  "pending", "requested", "scheduled", "in_progress",
]);

interface SlaInfo {
  active: boolean;
  daysSince: number;
  warnDays: number;
  overdueDays: number;
  isWarning: boolean;
  isOverdue: boolean;
  pct: number; // 0–100 for the progress bar (capped at 100)
}

function computeSlaInfo(request: any, type: ScreeningType): SlaInfo | null {
  if (!request || !SLA_ACTIVE_STATUSES.has(request.status)) return null;
  const triggered = request.triggeredAt ? new Date(request.triggeredAt) : null;
  if (!triggered) return null;
  const { warnDays, overdueDays } = SLA_THRESHOLDS[type];
  const daysSince = Math.floor(
    (Date.now() - triggered.getTime()) / (1000 * 60 * 60 * 24)
  );
  const isOverdue = daysSince >= overdueDays;
  const isWarning = !isOverdue && daysSince >= warnDays;
  const pct = Math.min(100, Math.round((daysSince / overdueDays) * 100));
  return { active: true, daysSince, warnDays, overdueDays, isWarning, isOverdue, pct };
}

// ── Type-specific status taxonomy ─────────────────────────────────────────────

const SCREENING_TYPES = ["mvr", "background_check", "drug_test"] as const;
type ScreeningType = (typeof SCREENING_TYPES)[number];

interface StatusOption {
  value: string;
  label: string;
}

/** Allowed status transitions per screening type */
const TYPE_STATUS_OPTIONS: Record<ScreeningType, StatusOption[]> = {
  mvr: [
    { value: "pending", label: "Pending" },
    { value: "clear", label: "Clear" },
    { value: "flagged", label: "Flagged" },
  ],
  background_check: [
    { value: "pending", label: "Pending" },
    { value: "clear", label: "Clear" },
    { value: "flagged", label: "Flagged" },
  ],
  drug_test: [
    { value: "scheduled", label: "Scheduled" },
    { value: "completed", label: "Completed" },
    { value: "failed", label: "Failed" },
    { value: "flagged", label: "Flagged" },
  ],
};

/** Statuses that indicate a blocking issue */
const BLOCKER_STATUSES = new Set(["flagged", "failed"]);

/** Statuses that indicate the screening is resolved/done */
const DONE_STATUSES = new Set(["clear", "completed"]);

/** Statuses that indicate still active */
const ACTIVE_STATUSES = new Set(["pending", "requested", "scheduled", "in_progress"]);

// ── Status display config ─────────────────────────────────────────────────────

interface StatusDisplay {
  label: string;
  badgeClass: string;
  icon: React.ReactNode;
}

const STATUS_DISPLAY: Record<string, StatusDisplay> = {
  not_started: {
    label: "Not Started",
    badgeClass: "bg-muted text-muted-foreground",
    icon: <Minus className="h-3 w-3" />,
  },
  pending: {
    label: "Pending",
    badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    icon: <Clock className="h-3 w-3" />,
  },
  requested: {
    label: "Pending",
    badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    icon: <Clock className="h-3 w-3" />,
  },
  scheduled: {
    label: "Scheduled",
    badgeClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    icon: <CalendarClock className="h-3 w-3" />,
  },
  in_progress: {
    label: "In Progress",
    badgeClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  clear: {
    label: "Clear",
    badgeClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  completed: {
    label: "Completed",
    badgeClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  failed: {
    label: "Failed",
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    icon: <XCircle className="h-3 w-3" />,
  },
  flagged: {
    label: "Flagged",
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    icon: <Flag className="h-3 w-3" />,
  },
  waived: {
    label: "Waived",
    badgeClass: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
};

// ── Type meta ─────────────────────────────────────────────────────────────────

interface TypeMeta {
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ReactNode;
}

const TYPE_META: Record<ScreeningType, TypeMeta> = {
  mvr: {
    label: "MVR Check",
    shortLabel: "MVR",
    description: "Motor Vehicle Record — driving history, violations, license validity.",
    icon: <Car className="h-4 w-4" />,
  },
  background_check: {
    label: "Background Check",
    shortLabel: "Background",
    description: "Criminal history and identity verification.",
    icon: <FileSearch className="h-4 w-4" />,
  },
  drug_test: {
    label: "Drug Test",
    shortLabel: "Drug Test",
    description: "Pre-employment drug screening per company policy.",
    icon: <FlaskConical className="h-4 w-4" />,
  },
};

// ── Overall summary logic ─────────────────────────────────────────────────────

type OverallStatus = "not_started" | "in_progress" | "all_clear" | "blockers";

interface SummaryInfo {
  label: string;
  description: string;
  badgeClass: string;
  headerClass: string;
  icon: React.ReactNode;
}

const SUMMARY_CONFIG: Record<OverallStatus, SummaryInfo> = {
  not_started: {
    label: "Not Started",
    description: "No screenings have been initiated for this candidate.",
    badgeClass: "bg-muted text-muted-foreground",
    headerClass: "",
    icon: <Minus className="h-4 w-4" />,
  },
  in_progress: {
    label: "In Progress",
    description: "Screenings are underway. Awaiting results.",
    badgeClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    headerClass: "border-yellow-200 dark:border-yellow-800",
    icon: <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />,
  },
  all_clear: {
    label: "All Clear",
    description: "All screenings passed. Candidate is clear to proceed.",
    badgeClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    headerClass: "border-green-200 dark:border-green-800",
    icon: <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />,
  },
  blockers: {
    label: "Blockers Found",
    description: "One or more screenings have a flag or failure that requires attention.",
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    headerClass: "border-red-200 dark:border-red-800",
    icon: <ShieldX className="h-4 w-4 text-destructive" />,
  },
};

function computeOverallStatus(
  requests: any[],
  totalTypes: number
): OverallStatus {
  if (requests.length === 0) return "not_started";
  const statuses = requests.map((r) => r.status);
  if (statuses.some((s) => BLOCKER_STATUSES.has(s))) return "blockers";
  const doneCount = statuses.filter((s) => DONE_STATUSES.has(s)).length;
  if (doneCount === totalTypes && requests.length === totalTypes) return "all_clear";
  return "in_progress";
}

// ── Update Status Dialog ──────────────────────────────────────────────────────

interface UpdateDialogProps {
  request: any;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function UpdateDialog({ request, open, onClose, onSaved }: UpdateDialogProps) {
  const { toast } = useToast();
  const type = request.screeningType as ScreeningType;
  const statusOptions = TYPE_STATUS_OPTIONS[type] ?? [];

  // Resolve initial status to match the type-specific taxonomy
  const getInitialStatus = () => {
    const s = request.status;
    if (s === "requested" || s === "in_progress") {
      return type === "drug_test" ? "scheduled" : "pending";
    }
    return statusOptions.some((o) => o.value === s)
      ? s
      : statusOptions[0]?.value ?? "pending";
  };

  const [status, setStatus] = useState(getInitialStatus);
  const [resultNotes, setResultNotes] = useState(request.resultNotes ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/recruiting/screening-requests/${request.id}/status`, {
        status,
        ...(resultNotes.trim() ? { resultNotes: resultNotes.trim() } : {}),
      }),
    onSuccess: () => {
      toast({ title: `${TYPE_META[type]?.label} status updated` });
      onSaved();
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const meta = TYPE_META[type];
  const displayStatus = STATUS_DISPLAY[status];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent data-testid={`dialog-update-screening-${type}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {meta?.icon}
            Update {meta?.label}
          </DialogTitle>
          <DialogDescription>
            Record the current status for this screening check. All changes are saved and audited.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger data-testid={`select-screening-status-${type}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => {
                  const disp = STATUS_DISPLAY[s.value];
                  return (
                    <SelectItem key={s.value} value={s.value}>
                      <span className="flex items-center gap-2">
                        {disp?.icon}
                        {s.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {displayStatus && (
              <p className="text-xs text-muted-foreground mt-1">
                {BLOCKER_STATUSES.has(status)
                  ? "This status will be flagged as a blocker on the application."
                  : DONE_STATUSES.has(status)
                  ? "This status marks the screening as resolved."
                  : "Screening is still active."}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`notes-${type}`}>Notes / Reference ID</Label>
            <Textarea
              id={`notes-${type}`}
              data-testid={`input-screening-notes-${type}`}
              placeholder="Provider reference number, outcome summary, adjudication notes…"
              value={resultNotes}
              onChange={(e) => setResultNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            data-testid={`btn-save-screening-status-${type}`}
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save Status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Screening Type Row ────────────────────────────────────────────────────────

interface ScreeningRowProps {
  type: ScreeningType;
  request: any | null; // null = not started
  applicationId: string;
  onUpdate: (req: any) => void;
  onRefresh: () => void;
}

function SlaTimer({ sla }: { sla: SlaInfo }) {
  const barColor = sla.isOverdue
    ? "bg-red-500"
    : sla.isWarning
    ? "bg-yellow-500"
    : "bg-blue-400";
  const textColor = sla.isOverdue
    ? "text-destructive"
    : sla.isWarning
    ? "text-yellow-600 dark:text-yellow-400"
    : "text-muted-foreground";

  return (
    <div className="space-y-1 pt-0.5" data-testid="sla-timer-row">
      <div className="flex items-center gap-1.5">
        {sla.isOverdue ? (
          <Hourglass className={`h-3 w-3 shrink-0 ${textColor}`} />
        ) : (
          <Timer className={`h-3 w-3 shrink-0 ${textColor}`} />
        )}
        <span className={`text-xs font-medium ${textColor}`}>
          {sla.isOverdue
            ? `Overdue — Day ${sla.daysSince} (SLA: ${sla.overdueDays}d)`
            : sla.isWarning
            ? `Approaching limit — Day ${sla.daysSince} of ${sla.overdueDays}`
            : `Day ${sla.daysSince} of ${sla.overdueDays}`}
        </span>
      </div>
      {/* Progress track */}
      <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${sla.pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {sla.isOverdue
          ? `No status update in ${sla.daysSince} day${sla.daysSince !== 1 ? "s" : ""}. SLA exceeded — follow up required.`
          : sla.isWarning
          ? `Approaching ${sla.overdueDays}-day SLA. Consider following up.`
          : `SLA: ${sla.overdueDays} days from trigger.`}
      </p>
    </div>
  );
}

function ScreeningRow({ type, request, applicationId, onUpdate, onRefresh }: ScreeningRowProps) {
  const { toast } = useToast();
  const meta = TYPE_META[type];
  const status = request?.status ?? "not_started";
  const displayStatus = STATUS_DISPLAY[status] ?? STATUS_DISPLAY.not_started;
  const isBlocker = BLOCKER_STATUSES.has(status);
  const isDone = DONE_STATUSES.has(status);
  const isNotStarted = !request;
  const sla = computeSlaInfo(request, type);

  const startMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/recruiting/applications/${applicationId}/screening-requests/start`, {
        screeningType: type,
      }),
    onSuccess: () => {
      toast({ title: `${meta.label} screening started` });
      onRefresh();
    },
    onError: () => {
      toast({ title: "Failed to start screening", variant: "destructive" });
    },
  });

  return (
    <div
      className={`flex items-start gap-3 rounded-md border p-3 transition-colors ${
        isBlocker
          ? "border-red-200 bg-red-50/50 dark:border-red-800/50 dark:bg-red-900/10"
          : isDone
          ? "border-green-200 bg-green-50/50 dark:border-green-800/50 dark:bg-green-900/10"
          : ""
      }`}
      data-testid={`screening-row-${type}`}
    >
      {/* Icon */}
      <div
        className={`mt-0.5 shrink-0 ${
          isBlocker
            ? "text-destructive"
            : isDone
            ? "text-green-600 dark:text-green-400"
            : "text-muted-foreground"
        }`}
      >
        {meta.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{meta.label}</span>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${displayStatus.badgeClass}`}
            data-testid={`status-badge-${type}`}
          >
            {displayStatus.icon}
            {displayStatus.label}
          </span>
          {isBlocker && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
              <AlertTriangle className="h-3 w-3" />
              Blocker
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{meta.description}</p>
        {request?.triggeredAt && (
          <p className="text-xs text-muted-foreground">
            {request.triggeredByDecision === "manual" ? "Started" : "Auto-triggered"}{" "}
            {new Date(request.triggeredAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        )}
        {request?.resultNotes && (
          <p className="text-xs text-muted-foreground italic mt-0.5">
            "{request.resultNotes}"
          </p>
        )}
        {request?.completedAt && (
          <p className="text-xs text-muted-foreground">
            Completed{" "}
            {new Date(request.completedAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        )}

        {/* SLA Timer — only renders when screening is active (Ticket 13) */}
        {sla && <SlaTimer sla={sla} />}
      </div>

      {/* Action */}
      <div className="shrink-0">
        {isNotStarted ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
            data-testid={`btn-start-screening-${type}`}
          >
            {startMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
            )}
            Start
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onUpdate(request)}
            data-testid={`btn-update-screening-${type}`}
          >
            <Pencil className="h-3.5 w-3.5 mr-1" />
            Update
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Summary Banner ────────────────────────────────────────────────────────────

function SummaryBanner({
  overallStatus,
  blockerTypes,
}: {
  overallStatus: OverallStatus;
  blockerTypes: ScreeningType[];
}) {
  const cfg = SUMMARY_CONFIG[overallStatus];

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-md border ${cfg.headerClass || "border-border"} bg-card`}
      data-testid="screening-summary-banner"
    >
      <div className="mt-0.5 shrink-0">{cfg.icon}</div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold">Screening Summary</span>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badgeClass}`}
            data-testid="screening-overall-status"
          >
            {cfg.label}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{cfg.description}</p>
        {blockerTypes.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            <span className="text-xs text-destructive font-medium">Blockers:</span>
            {blockerTypes.map((t) => (
              <span
                key={t}
                className="text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium"
              >
                {TYPE_META[t].shortLabel}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

interface ScreeningTriggerPanelProps {
  applicationId: string;
  recruiterDecision?: string | null;
}

export function ScreeningTriggerPanel({
  applicationId,
}: ScreeningTriggerPanelProps) {
  const queryClient = useQueryClient();
  const [updateTarget, setUpdateTarget] = useState<any | null>(null);

  const { data: requests = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/recruiting/applications", applicationId, "screening-requests"],
    queryFn: async () => {
      const res = await fetch(
        `/api/recruiting/applications/${applicationId}/screening-requests`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load screening requests");
      return res.json();
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({
      queryKey: ["/api/recruiting/applications", applicationId, "screening-requests"],
    });
  };

  // Build a lookup map from type → request record
  const requestMap = Object.fromEntries(
    requests.map((r) => [r.screeningType, r])
  ) as Partial<Record<ScreeningType, any>>;

  // Compute overall status
  const overallStatus = computeOverallStatus(requests, SCREENING_TYPES.length);
  const blockerTypes = SCREENING_TYPES.filter((t) => {
    const r = requestMap[t];
    return r && BLOCKER_STATUSES.has(r.status);
  });

  // SLA overdue / warning counts (Ticket 13)
  const slaInfoMap = Object.fromEntries(
    SCREENING_TYPES.map((t) => [t, computeSlaInfo(requestMap[t] ?? null, t)])
  ) as Record<ScreeningType, SlaInfo | null>;
  const overdueCount = SCREENING_TYPES.filter((t) => slaInfoMap[t]?.isOverdue).length;
  const warningCount = SCREENING_TYPES.filter((t) => slaInfoMap[t]?.isWarning).length;

  // Counts for header badges
  const clearCount = SCREENING_TYPES.filter((t) => {
    const r = requestMap[t];
    return r && DONE_STATUSES.has(r.status);
  }).length;

  return (
    <>
      {updateTarget && (
        <UpdateDialog
          request={updateTarget}
          open={true}
          onClose={() => setUpdateTarget(null)}
          onSaved={refresh}
        />
      )}

      <Card data-testid="card-screening-tracker">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Pre-Hire Screening
            </CardTitle>

            {/* Header status chips */}
            <div className="flex items-center gap-1.5 ml-auto flex-wrap">
              {/* SLA alert badges — highest priority */}
              {overdueCount > 0 && (
                <Badge
                  variant="destructive"
                  className="text-xs"
                  data-testid="badge-screening-sla-overdue"
                >
                  <Hourglass className="h-3 w-3 mr-1" />
                  {overdueCount} SLA Overdue
                </Badge>
              )}
              {warningCount > 0 && overdueCount === 0 && (
                <Badge
                  className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                  data-testid="badge-screening-sla-warning"
                >
                  <Timer className="h-3 w-3 mr-1" />
                  {warningCount} Approaching SLA
                </Badge>
              )}
              {/* Status chips */}
              {overallStatus === "all_clear" && overdueCount === 0 && (
                <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  All Clear
                </Badge>
              )}
              {overallStatus === "blockers" && (
                <Badge variant="destructive" className="text-xs">
                  {blockerTypes.length} Blocker{blockerTypes.length !== 1 ? "s" : ""}
                </Badge>
              )}
              {overallStatus === "in_progress" && clearCount > 0 && overdueCount === 0 && (
                <Badge variant="secondary" className="text-xs">
                  {clearCount}/{SCREENING_TYPES.length} done
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="flex items-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading screening data…</span>
            </div>
          ) : (
            <>
              {/* Summary banner */}
              <SummaryBanner
                overallStatus={overallStatus}
                blockerTypes={blockerTypes}
              />

              <Separator />

              {/* One row per screening type — always rendered */}
              {SCREENING_TYPES.map((type) => (
                <ScreeningRow
                  key={type}
                  type={type}
                  request={requestMap[type] ?? null}
                  applicationId={applicationId}
                  onUpdate={setUpdateTarget}
                  onRefresh={refresh}
                />
              ))}

              {/* Footer hint */}
              <p className="text-xs text-muted-foreground pt-1">
                Screenings are auto-triggered on "Proceed to Pre-Hire." You can also start or update each screening manually.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
