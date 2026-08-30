import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ClipboardList,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  Download,
  Search,
  X,
  Play,
  BellOff,
  Users,
  MessageSquare,
  Activity,
  CheckCircle2,
  Loader2,
  CalendarOff,
  IdCard,
  FlaskConical,
  Car,
  ShieldAlert,
  UserX,
  Building2,
  Link2,
  ExternalLink,
  Zap,
  RefreshCw,
  Wifi,
  Camera,
  CheckCircle,
  XCircle,
  ImageOff,
} from "lucide-react";
import { Link } from "wouter";
import { formatDate } from "@/lib/dateFormat";
import * as XLSX from "xlsx";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MvrDriver {
  driverId: string;
  driverName: string;
  driverStatus: string;
  workerClassification: string | null;
  driverState: string | null;
  hireDate: string | null;
  mvrDate: string;
  mvrExpirationDate: string | null;
  daysExpired?: number;
  daysRemaining?: number;
  accountName: string | null;
  accountId: string | null;
  licenseNumber: string | null;
  licenseExpiration: string | null;
  // MVR workflow tracking fields (expired list only)
  mvrProgress: string | null;
  mvrRequestSentDate: string | null;
  mvrProcessStartDate: string | null;
  mvrCommunicationType: string | null;
  mvrResult: string | null;
  daysInStatus: number | null;
}

interface LicenseDriver {
  driverId: string;
  driverName: string;
  driverStatus: string;
  licenseExpiration: string | null;
  daysExpired?: number;
  daysRemaining?: number;
  accountName: string | null;
  accountId: string | null;
  licenseNumber: string | null;
  workerClassification: string | null;
  driverState: string | null;
}

interface DrugTestDriver {
  driverId: string;
  driverName: string;
  driverStatus: string;
  workerClassification: string | null;
  driverState: string | null;
  accountName: string | null;
  accountId: string | null;
  licenseNumber: string | null;
  licenseExpiration: string | null;
  hireDate: string | null;
}

// Generic driver row (covers all three types)
type AnyDriver = MvrDriver | LicenseDriver | DrugTestDriver;

interface WpiEntry {
  taskId: string;
  status: string;
  summary?: string | null;
}

type WpiMap = Record<string, WpiEntry>;

interface NoteEntry {
  id: string;
  note: string;
  createdByName: string | null;
  createdAt: string;
}

interface ActivityEntry {
  id: string;
  action: string;
  actorName: string | null;
  createdAt: string;
  notes?: string | null;
}

interface CorporateUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: string;
}

interface PhotoApproval {
  id: string;
  driverId: string;
  driverName: string;
  submittedByType: string;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
  declineReason: string | null;
  currentPhotoUrl: string | null;
  proposedPhotoUrl: string | null;
  reviewerName: string | null;
}

type ActiveReport =
  | "mvr-expired"
  | "mvr-expiring"
  | "license-expired"
  | "license-expiring"
  | "drug-missing"
  | "unassigned-drivers"
  | "multi-account-drivers"
  | "photo-approvals"
  | null;

interface UnassignedDriver {
  driverId: string;
  driverName: string;
  driverStatus: string;
  driverType: string | null;
  driverClassification: string | null;
  market: string | null;
  createdAt: string | null;
  lastMoveDate: string | null;
  lastShiftAt: string | null;
  wiwMatchStatus: "matched" | "unmatched" | "ambiguous" | null;
  wiwIntegrationStatus: string | null;
  priority: "high" | "low";
}

interface AccountSearchResult {
  id: string;
  customerName: string;
  status: string;
}

interface MultiAccountDriver {
  driverId: string;
  driverName: string;
  primaryAccountId: string | null;
  primaryAccountName: string | null;
  secondaryAccounts: Array<{ id: string; name: string }>;
  accountCount: number;
}

// ── Real-Time Refresh Framework ───────────────────────────────────────────────

/** All Ops Work Plan widget queries share this polling config. */
const WIDGET_POLL_OPTS = {
  staleTime: 0,
  refetchInterval: 30_000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
} as const;

/**
 * Returns a human-readable "Updated Xs ago" string that auto-refreshes every
 * second. Pass the minimum `dataUpdatedAt` from all widget queries.
 */
function useRelativeTime(updatedAt: number): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!updatedAt) return "";
  const secs = Math.round((Date.now() - updatedAt) / 1000);
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  return `${Math.round(secs / 60)}m ago`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function exportToExcel(rows: Record<string, unknown>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function priorityLabel(
  type: "expired" | "expiring" | "missing",
  days?: number
): { label: string; accent: string } {
  if (type === "expired" || type === "missing")
    return { label: "High", accent: "bg-red-600 text-white" };
  if ((days ?? 99) <= 2) return { label: "High",  accent: "bg-red-600 text-white" };
  if ((days ?? 99) <= 7) return { label: "Med",   accent: "bg-amber-500 text-white" };
  return                        { label: "Low",   accent: "bg-slate-500 text-white" };
}

function activityLabel(action: string): string {
  switch (action) {
    case "task_created":   return "created this task";
    case "completed":      return "marked as Completed";
    case "in_progress":    return "started working on this";
    case "snoozed":        return "snoozed this task";
    case "reassigned":     return "reassigned this task";
    case "note_added":     return "added a comment";
    default:               return action.replace(/_/g, " ");
  }
}

// ── Snooze Dialog ─────────────────────────────────────────────────────────────

const SNOOZE_OPTIONS = [
  { label: "4 hours",   value: 4   },
  { label: "1 day",     value: 24  },
  { label: "3 days",    value: 72  },
  { label: "1 week",    value: 168 },
];

function SnoozeDialog({
  open, driverName, onClose, onConfirm, isPending,
}: {
  open: boolean; driverName: string; onClose: () => void;
  onConfirm: (until: Date) => void; isPending: boolean;
}) {
  const [choice, setChoice] = useState<number | null>(24);
  const [custom, setCustom] = useState("");

  const getDate = () => {
    if (custom) { const d = new Date(custom); if (!isNaN(d.getTime())) return d; }
    if (choice) return new Date(Date.now() + choice * 3_600_000);
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Snooze — {driverName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {SNOOZE_OPTIONS.map((o) => (
              <Button
                key={o.value}
                variant={choice === o.value && !custom ? "default" : "outline"}
                size="sm"
                onClick={() => { setChoice(o.value); setCustom(""); }}
                data-testid={`snooze-option-${o.value}`}
              >
                {o.label}
              </Button>
            ))}
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Or pick a date</p>
            <Input
              type="date" value={custom}
              onChange={(e) => { setCustom(e.target.value); setChoice(null); }}
              data-testid="input-snooze-custom"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => { const d = getDate(); if (d) onConfirm(d); }}
            disabled={!getDate() || isPending}
            data-testid="button-snooze-confirm"
          >
            {isPending ? "Snoozing…" : "Snooze"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Reassign Dialog ───────────────────────────────────────────────────────────

function ReassignDialog({
  open, driverName, users, onClose, onConfirm, isPending,
}: {
  open: boolean; driverName: string; users: CorporateUser[];
  onClose: () => void; onConfirm: (userId: string) => void; isPending: boolean;
}) {
  const [selected, setSelected] = useState("");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reassign — {driverName}</DialogTitle>
        </DialogHeader>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger data-testid="select-reassign-user">
            <SelectValue placeholder="Select a team member" />
          </SelectTrigger>
          <SelectContent>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.firstName} {u.lastName} ({u.email})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => selected && onConfirm(selected)}
            disabled={!selected || isPending}
            data-testid="button-reassign-confirm"
          >
            {isPending ? "Reassigning…" : "Reassign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Notes / Activity Dialog ───────────────────────────────────────────────────

function NotesActivityDialog({
  open, taskId, driverName, defaultTab, onClose,
}: {
  open: boolean; taskId: string; driverName: string;
  defaultTab: "notes" | "activity"; onClose: () => void;
}) {
  const [tab, setTab] = useState<"notes" | "activity">(defaultTab);
  const [note, setNote] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setTab(defaultTab); }, [defaultTab]);

  const { data: notes = [], isLoading: notesLoading } = useQuery<NoteEntry[]>({
    queryKey: ["/api/work-plan-items", taskId, "notes"],
    enabled: open,
  });

  const { data: activity = [], isLoading: activityLoading } = useQuery<ActivityEntry[]>({
    queryKey: ["/api/work-plan-items", taskId, "activity"],
    enabled: open,
  });

  const addNote = useMutation({
    mutationFn: () => apiRequest("POST", `/api/work-plan-items/${taskId}/notes`, { note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-plan-items", taskId, "notes"] });
      setNote("");
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg flex flex-col gap-0 p-0 max-h-[80vh]">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="text-base">{driverName}</DialogTitle>
          <div className="flex items-center gap-1 mt-2">
            <button
              onClick={() => setTab("notes")}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${tab === "notes" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
              data-testid="tab-notes"
            >
              <MessageSquare className="h-3 w-3" />
              Comments {notes.length > 0 && `(${notes.length})`}
            </button>
            <button
              onClick={() => setTab("activity")}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${tab === "activity" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
              data-testid="tab-activity"
            >
              <Activity className="h-3 w-3" />
              Activity {activity.length > 0 && `(${activity.length})`}
            </button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-5 py-3 min-h-[200px]">
          {tab === "notes" ? (
            <div className="space-y-3">
              {notesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : notes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No comments yet</p>
              ) : notes.map((n) => (
                <div key={n.id} className="bg-muted/40 rounded-md px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium">{n.createdByName || "Unknown"}</span>
                    <span className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm">{n.note}</p>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          ) : (
            <div className="space-y-2">
              {activityLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : activity.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No activity yet</p>
              ) : activity.map((e) => (
                <div key={e.id} className="flex items-start gap-2.5 text-sm">
                  <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Activity className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <div>
                    <span className="font-medium">{e.actorName || "System"}</span>
                    {" "}<span className="text-muted-foreground">{activityLabel(e.action)}</span>
                    <p className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {tab === "notes" && (
          <div className="px-5 pb-5 border-t pt-3 space-y-2">
            <Textarea
              placeholder="Add a comment…" value={note}
              onChange={(e) => setNote(e.target.value)}
              className="text-sm resize-none" rows={2}
              data-testid="input-note"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
              <Button
                size="sm"
                onClick={() => addNote.mutate()}
                disabled={!note.trim() || addNote.isPending}
                data-testid="button-submit-note"
              >
                {addNote.isPending ? "Saving…" : "Save Comment"}
              </Button>
            </div>
          </div>
        )}
        {tab === "activity" && (
          <div className="px-5 pb-5 border-t pt-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Action Buttons (generic — works for any compliance row) ───────────────────

function ActionButtons({
  driver,
  wpiEntry,
  users,
  onAction,
  invalidateKeys,
}: {
  driver: AnyDriver;
  wpiEntry: WpiEntry | undefined;
  users: CorporateUser[];
  onAction: (
    type: "snooze" | "reassign" | "notes" | "activity" | "start" | "complete",
    driver: AnyDriver
  ) => void;
  invalidateKeys?: string[];
}) {
  const taskId = wpiEntry?.taskId;
  const isDone = wpiEntry?.status === "completed";

  const keys = invalidateKeys ?? [
    "/api/driver-ops/mvr-expired",
    "/api/driver-ops/mvr-expiring",
    "/api/driver-ops/license-expired",
    "/api/driver-ops/license-expiring",
    "/api/driver-ops/drug-test-missing",
  ];

  const invalidateAll = () =>
    keys.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));

  const startMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/work-plan-items/${taskId}/in-progress`, {}),
    onSuccess: invalidateAll,
  });

  const completeMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/work-plan-items/${taskId}/complete`, {}),
    onSuccess: invalidateAll,
  });

  if (!taskId) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <div className="flex items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon" variant="ghost" className="h-7 w-7"
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending || isDone}
            data-testid={`btn-start-${driver.driverId}`}
          >
            {startMutation.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Play className="h-3.5 w-3.5 text-sky-500" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Start / In Progress</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon" variant="ghost" className="h-7 w-7"
            onClick={() => onAction("snooze", driver)} disabled={isDone}
            data-testid={`btn-snooze-${driver.driverId}`}
          >
            <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Snooze</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon" variant="ghost" className="h-7 w-7"
            onClick={() => onAction("reassign", driver)} disabled={isDone}
            data-testid={`btn-reassign-${driver.driverId}`}
          >
            <Users className="h-3.5 w-3.5 text-violet-500" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Reassign</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon" variant="ghost" className="h-7 w-7"
            onClick={() => onAction("notes", driver)}
            data-testid={`btn-notes-${driver.driverId}`}
          >
            <MessageSquare className="h-3.5 w-3.5 text-violet-400" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Comments</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon" variant="ghost" className="h-7 w-7"
            onClick={() => onAction("activity", driver)}
            data-testid={`btn-activity-${driver.driverId}`}
          >
            <Activity className="h-3.5 w-3.5 text-sky-400" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Activity Log</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon" variant="ghost" className="h-7 w-7"
            onClick={() => completeMutation.mutate()}
            disabled={completeMutation.isPending || isDone}
            data-testid={`btn-complete-${driver.driverId}`}
          >
            {completeMutation.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <CheckCircle2 className={`h-3.5 w-3.5 ${isDone ? "text-green-500" : "text-muted-foreground"}`} />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isDone ? "Completed" : "Mark Complete"}</TooltipContent>
      </Tooltip>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-2 text-center">
      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
        <CalendarOff className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground font-medium">{label}</p>
    </div>
  );
}

// ── MVR Report Table ──────────────────────────────────────────────────────────

type MvrSortKey =
  | "priority" | "driverName" | "driverStatus" | "hireDate"
  | "workerClassification" | "driverState" | "accountName" | "mvr"
  | "mvrProgress" | "mvrRequestSentDate" | "mvrProcessStartDate"
  | "mvrCommunicationType" | "mvrResult" | "daysInStatus";

function daysInStatusColor(days: number | null, progress: string | null) {
  if (days === null || days === undefined) return "text-muted-foreground";
  if (days >= 6) return "text-destructive font-semibold";
  if (days >= 3) return "text-yellow-600 dark:text-yellow-400 font-medium";
  return "text-foreground";
}

function daysInStatusBg(days: number | null) {
  if (days === null || days === undefined) return "";
  if (days >= 6) return "bg-destructive/10 border border-destructive/20 text-destructive font-semibold";
  if (days >= 3) return "bg-yellow-500/10 border border-yellow-500/20 text-yellow-700 dark:text-yellow-400 font-medium";
  return "bg-muted/60 border border-muted-foreground/15 text-foreground";
}

// MVR Progress badge styling
const MVR_PROGRESS_OPTS = [
  "Not Started",
  "Link Sent",
  "Unresponsive",
  "Waiting for Results",
  "Completed",
] as const;

type MvrProgressState = typeof MVR_PROGRESS_OPTS[number];

function mvrProgressBadge(progress: string | null) {
  switch (progress) {
    case "Not Started":        return "bg-muted text-muted-foreground border-muted-foreground/20";
    case "Link Sent":          return "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20";
    case "Unresponsive":       return "bg-destructive/15 text-destructive border-destructive/20";
    case "Waiting for Results":return "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/20";
    case "Completed":          return "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20";
    default:                   return "bg-muted text-muted-foreground border-muted-foreground/20";
  }
}

function mvrResultBadge(result: string | null) {
  switch (result) {
    case "Clear":          return "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20";
    case "Minor Issues":   return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20";
    case "Major Issues":   return "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/20";
    case "Disqualifying":  return "bg-destructive/15 text-destructive border-destructive/20";
    default:               return "bg-muted text-muted-foreground";
  }
}

function MvrProgressCell({ driverId, progress, mvrResult }: {
  driverId: string;
  progress: string | null;
  mvrResult: string | null;
}) {
  const { toast } = useToast();
  const current = progress || "Not Started";

  const mutation = useMutation({
    mutationFn: (nextState: string) =>
      apiRequest("PATCH", `/api/corporate/drivers/${driverId}/mvr-progress`, { progress: nextState }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver-ops/mvr-expired"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver-ops/mvr-expiring"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers", driverId] });
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to update MVR state";
      toast({ title: "Update failed", description: msg, variant: "destructive" });
    },
  });

  const handleChange = (next: string) => {
    if (next === current) return;
    mutation.mutate(next);
  };

  const isCompleted = current === "Completed";

  return (
    <div className="flex flex-col gap-1 min-w-[148px]">
      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border ${mvrProgressBadge(current)}`}>
        {mutation.isPending ? "Saving…" : current}
      </span>
      {!isCompleted && (
        <Select value="" onValueChange={handleChange} disabled={mutation.isPending}>
          <SelectTrigger className="h-6 text-xs w-full" data-testid={`select-mvr-state-${driverId}`}>
            <SelectValue placeholder="Advance state…" />
          </SelectTrigger>
          <SelectContent>
            {MVR_PROGRESS_OPTS.filter(s => s !== current).map(s => (
              <SelectItem
                key={s}
                value={s}
                disabled={s === "Completed" && !mvrResult}
              >
                {s === "Completed" && !mvrResult ? `${s} (enter result first)` : s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function MvrReportTable({
  data, type, wpiMap, users, onAction,
}: {
  data: MvrDriver[];
  type: "expired" | "expiring";
  wpiMap: WpiMap;
  users: CorporateUser[];
  onAction: (type: "snooze" | "reassign" | "notes" | "activity" | "start" | "complete", driver: AnyDriver) => void;
}) {
  const [search, setSearch] = useState("");
  // For expired list: default sort is daysInStatus desc (most stalled drivers first)
  const [sortKey, setSortKey] = useState<MvrSortKey>(type === "expired" ? "daysInStatus" : "mvr");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(type === "expired" ? "desc" : "asc");

  // Filter state (expired list only)
  const [filterProgress, setFilterProgress] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo,   setFilterDateTo]   = useState<string>("");

  const handleSort = (key: MvrSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: MvrSortKey }) => {
    if (sortKey !== col) return <span className="ml-1 opacity-30 text-xs">↕</span>;
    return <span className="ml-1 text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const SortHead = ({ col, children, className }: { col: MvrSortKey; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={`cursor-pointer select-none hover:bg-muted/50 transition-colors whitespace-nowrap ${className ?? ""}`}
      onClick={() => handleSort(col)}
      data-testid={`th-mvr-${col}`}
    >
      {children}<SortIcon col={col} />
    </TableHead>
  );

  const filtered = data.filter((r) => {
    const q = search.toLowerCase();
    const textMatch =
      r.driverName.toLowerCase().includes(q) ||
      (r.accountName || "").toLowerCase().includes(q) ||
      (r.workerClassification || "").toLowerCase().includes(q) ||
      (r.driverState || "").toLowerCase().includes(q);
    if (!textMatch) return false;

    // Progress filter (expired only)
    if (type === "expired" && filterProgress !== "all") {
      const prog = r.mvrProgress ?? "Not Started";
      if (prog !== filterProgress) return false;
    }

    // Date range filter on processStartDate (expired only)
    if (type === "expired" && filterDateFrom && r.mvrProcessStartDate) {
      if (r.mvrProcessStartDate < filterDateFrom) return false;
    }
    if (type === "expired" && filterDateTo && r.mvrProcessStartDate) {
      if (r.mvrProcessStartDate > filterDateTo) return false;
    }

    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let va: string | number | null = null;
    let vb: string | number | null = null;
    const days = (r: MvrDriver) => type === "expired" ? (r.daysExpired ?? 0) : (r.daysRemaining ?? 0);
    if      (sortKey === "priority")              { va = days(a); vb = days(b); }
    else if (sortKey === "driverName")            { va = a.driverName; vb = b.driverName; }
    else if (sortKey === "driverStatus")          { va = a.driverStatus; vb = b.driverStatus; }
    else if (sortKey === "hireDate")              { va = a.hireDate || ""; vb = b.hireDate || ""; }
    else if (sortKey === "workerClassification")  { va = a.workerClassification || ""; vb = b.workerClassification || ""; }
    else if (sortKey === "driverState")           { va = a.driverState || ""; vb = b.driverState || ""; }
    else if (sortKey === "accountName")           { va = a.accountName || ""; vb = b.accountName || ""; }
    else if (sortKey === "mvr")                   { va = a.mvrDate || ""; vb = b.mvrDate || ""; }
    else if (sortKey === "mvrProgress")           { va = a.mvrProgress || ""; vb = b.mvrProgress || ""; }
    else if (sortKey === "mvrRequestSentDate")    { va = a.mvrRequestSentDate || ""; vb = b.mvrRequestSentDate || ""; }
    else if (sortKey === "mvrProcessStartDate")   {
      // nulls last: treat null as far future for asc sort
      va = a.mvrProcessStartDate || "9999-99-99";
      vb = b.mvrProcessStartDate || "9999-99-99";
    }
    else if (sortKey === "mvrCommunicationType")  { va = a.mvrCommunicationType || ""; vb = b.mvrCommunicationType || ""; }
    else if (sortKey === "mvrResult")             { va = a.mvrResult || ""; vb = b.mvrResult || ""; }
    else if (sortKey === "daysInStatus")          { va = a.daysInStatus ?? -1; vb = b.daysInStatus ?? -1; }
    const cmp = (va ?? "") < (vb ?? "") ? -1 : (va ?? "") > (vb ?? "") ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const handleExport = () => {
    const rows = sorted.map((r) => ({
      "Priority": priorityLabel(type, type === "expired" ? (r.daysExpired ?? 0) : (r.daysRemaining ?? 0)).label,
      "Driver Name": r.driverName,
      "Status": r.driverStatus,
      "Date of Hire": formatDate(r.hireDate),
      "Worker Classification": r.workerClassification || "—",
      "State": r.driverState || "—",
      "Account": r.accountName || "—",
      "MVR Expiration Date": type === "expiring" ? formatDate(r.mvrExpirationDate) : formatDate(r.mvrDate),
      ...(type === "expired" ? { "Days Expired": r.daysExpired } : { "Days Remaining": r.daysRemaining }),
      ...(type === "expired" ? {
        "Days in Status":        r.daysInStatus !== null ? r.daysInStatus : "—",
        "MVR Progress":          r.mvrProgress || "Not Started",
        "MVR Link Sent Date":    formatDate(r.mvrRequestSentDate),
        "Process Start Date":    formatDate(r.mvrProcessStartDate),
        "Communication Type":    r.mvrCommunicationType || "—",
        "MVR Result":            r.mvrResult || "—",
      } : {}),
    }));
    exportToExcel(rows, type === "expired" ? "MVR_Expired" : "MVR_Expiring_Soon");
  };

  const activeFilterCount = [
    filterProgress !== "all",
    !!filterDateFrom,
    !!filterDateTo,
  ].filter(Boolean).length;

  return (
    <div className="space-y-3">
      {/* Search + filters row */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8" placeholder="Search drivers, accounts, state…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            data-testid="input-mvr-search"
          />
        </div>
        {search && (
          <Button size="icon" variant="ghost" onClick={() => setSearch("")}>
            <X className="h-4 w-4" />
          </Button>
        )}
        <Button variant="outline" size="default" onClick={handleExport} data-testid="button-export-excel">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Filters (expired list only) */}
      {type === "expired" && (
        <div className="flex items-center gap-2 flex-wrap bg-muted/30 rounded-md px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground shrink-0">Filter:</span>

          {/* Progress filter */}
          <Select value={filterProgress} onValueChange={setFilterProgress}>
            <SelectTrigger className="h-8 text-xs w-44" data-testid="select-mvr-progress-filter">
              <SelectValue placeholder="All Progress" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Progress</SelectItem>
              {MVR_PROGRESS_OPTS.map(opt => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Process Start Date range */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Start Date:</span>
            <Input
              type="date"
              value={filterDateFrom}
              onChange={e => setFilterDateFrom(e.target.value)}
              className="h-8 text-xs w-36"
              data-testid="input-mvr-date-from"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Input
              type="date"
              value={filterDateTo}
              onChange={e => setFilterDateTo(e.target.value)}
              className="h-8 text-xs w-36"
              data-testid="input-mvr-date-to"
            />
          </div>

          {activeFilterCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs px-2"
              onClick={() => { setFilterProgress("all"); setFilterDateFrom(""); setFilterDateTo(""); }}
              data-testid="button-mvr-clear-filters"
            >
              <X className="h-3 w-3 mr-1" />
              Clear filters
            </Button>
          )}
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        {sorted.length} of {data.length} record{data.length !== 1 ? "s" : ""} — all non-archived drivers
      </div>

      {sorted.length === 0 ? (
        <EmptyState label="No MVR records found" />
      ) : (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead col="priority" className="w-20">Priority</SortHead>
                <SortHead col="driverName">Driver</SortHead>
                <SortHead col="driverStatus">Status</SortHead>
                <SortHead col="hireDate">Date of Hire</SortHead>
                <SortHead col="workerClassification">Worker Classification</SortHead>
                <SortHead col="driverState">State</SortHead>
                <SortHead col="accountName">Account</SortHead>
                <SortHead col="mvr">MVR</SortHead>
                {type === "expired" && (
                  <>
                    <SortHead col="daysInStatus">Days in Status</SortHead>
                    <SortHead col="mvrProgress">MVR Progress</SortHead>
                    <SortHead col="mvrRequestSentDate">Link Sent Date</SortHead>
                    <SortHead col="mvrProcessStartDate">Process Start</SortHead>
                    <SortHead col="mvrCommunicationType">Comm. Type</SortHead>
                    <SortHead col="mvrResult">MVR Result</SortHead>
                  </>
                )}
                <TableHead className="w-52">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => {
                const days = type === "expired" ? (r.daysExpired ?? 0) : (r.daysRemaining ?? 0);
                const pri = priorityLabel(type, days);
                const wpiEntry = wpiMap[r.driverId];
                const isDone = wpiEntry?.status === "completed";
                return (
                  <TableRow key={r.driverId} className={isDone ? "opacity-50" : ""} data-testid={`row-driver-${r.driverId}`}>
                    <TableCell>
                      <span className={`inline-flex items-center justify-center rounded px-2 py-0.5 text-xs font-semibold ${pri.accent}`}>{pri.label}</span>
                    </TableCell>
                    <TableCell>
                      <Link href={`/drivers/${r.driverId}`}>
                        <span className="font-medium text-primary hover:underline cursor-pointer whitespace-nowrap">{r.driverName}</span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.driverStatus} />
                    </TableCell>
                    <TableCell>
                      <span className="text-sm tabular-nums text-muted-foreground whitespace-nowrap">
                        {formatDate(r.hireDate)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {r.workerClassification || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {r.driverState || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {r.accountId ? (
                        <Link href={`/accounts/${r.accountId}`}>
                          <span className="text-sm text-primary hover:underline cursor-pointer whitespace-nowrap">{r.accountName}</span>
                        </Link>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm tabular-nums text-muted-foreground whitespace-nowrap">
                          {type === "expiring" ? formatDate(r.mvrExpirationDate) : formatDate(r.mvrDate)}
                        </span>
                        {type === "expired" ? (
                          <Badge variant="destructive" className="w-fit">{r.daysExpired}d ago</Badge>
                        ) : (
                          <Badge className={`w-fit ${
                            (r.daysRemaining ?? 99) <= 7
                              ? "bg-destructive/15 text-destructive border-destructive/20"
                              : (r.daysRemaining ?? 99) <= 30
                              ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20"
                              : "bg-yellow-200/30 text-yellow-600 dark:text-yellow-500 border-yellow-300/30"
                          }`}>
                            {r.daysRemaining}d left
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    {type === "expired" && (
                      <>
                        {/* Days in Current Status */}
                        <TableCell className="whitespace-nowrap text-center">
                          {r.daysInStatus !== null && r.daysInStatus !== undefined ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className={`inline-flex items-center justify-center rounded px-2 py-0.5 text-xs tabular-nums ${daysInStatusBg(r.daysInStatus)}`}>
                                {r.daysInStatus}d
                              </span>
                              {r.mvrProgress === "Link Sent" && r.daysInStatus >= 3 && (
                                <span className="text-[10px] text-yellow-600 dark:text-yellow-400 leading-none">suggest: Unresponsive</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/50 italic text-xs">—</span>
                          )}
                        </TableCell>
                        {/* MVR Progress — interactive state-advance cell */}
                        <TableCell className="whitespace-nowrap py-1.5">
                          <MvrProgressCell
                            driverId={r.driverId}
                            progress={r.mvrProgress}
                            mvrResult={r.mvrResult}
                          />
                        </TableCell>
                        {/* MVR Request Sent Date */}
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">
                          {formatDate(r.mvrRequestSentDate)}
                        </TableCell>
                        {/* Process Start Date */}
                        <TableCell className="whitespace-nowrap text-sm tabular-nums">
                          {r.mvrProcessStartDate
                            ? <span className="text-foreground">{formatDate(r.mvrProcessStartDate)}</span>
                            : <span className="text-muted-foreground/50 italic text-xs">Not started</span>
                          }
                        </TableCell>
                        {/* Communication Type */}
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {r.mvrCommunicationType || <span className="text-muted-foreground/50 italic text-xs">—</span>}
                        </TableCell>
                        {/* MVR Result */}
                        <TableCell className="whitespace-nowrap">
                          {r.mvrResult
                            ? <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border ${mvrResultBadge(r.mvrResult)}`}>{r.mvrResult}</span>
                            : <span className="text-muted-foreground/50 italic text-xs">Pending</span>
                          }
                        </TableCell>
                      </>
                    )}
                    <TableCell>
                      <ActionButtons driver={r} wpiEntry={wpiEntry} users={users} onAction={onAction} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── License Report Table ──────────────────────────────────────────────────────

type LicenseSortKey = "priority" | "driverName" | "driverStatus" | "workerClassification" | "licenseNumber" | "driverState" | "accountName" | "license";

function LicenseReportTable({
  data, type, wpiMap, users, onAction,
}: {
  data: LicenseDriver[];
  type: "expired" | "expiring";
  wpiMap: WpiMap;
  users: CorporateUser[];
  onAction: (type: "snooze" | "reassign" | "notes" | "activity" | "start" | "complete", driver: AnyDriver) => void;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<LicenseSortKey>("license");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: LicenseSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: LicenseSortKey }) => {
    if (sortKey !== col) return <span className="ml-1 opacity-30 text-xs">↕</span>;
    return <span className="ml-1 text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const SortHead = ({ col, children, className }: { col: LicenseSortKey; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={`cursor-pointer select-none hover:bg-muted/50 transition-colors whitespace-nowrap ${className ?? ""}`}
      onClick={() => handleSort(col)}
      data-testid={`th-license-${col}`}
    >
      {children}<SortIcon col={col} />
    </TableHead>
  );

  const filtered = data.filter(
    (r) =>
      r.driverName.toLowerCase().includes(search.toLowerCase()) ||
      (r.accountName || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.licenseNumber || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.workerClassification || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.driverState || "").toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    let va: string | number | null = null;
    let vb: string | number | null = null;
    const days = (r: LicenseDriver) => type === "expired" ? (r.daysExpired ?? 0) : (r.daysRemaining ?? 0);
    if (sortKey === "priority")              { va = days(a); vb = days(b); }
    else if (sortKey === "driverName")       { va = a.driverName; vb = b.driverName; }
    else if (sortKey === "driverStatus")     { va = a.driverStatus; vb = b.driverStatus; }
    else if (sortKey === "workerClassification") { va = a.workerClassification || ""; vb = b.workerClassification || ""; }
    else if (sortKey === "licenseNumber")    { va = a.licenseNumber || ""; vb = b.licenseNumber || ""; }
    else if (sortKey === "driverState")      { va = a.driverState || ""; vb = b.driverState || ""; }
    else if (sortKey === "accountName")      { va = a.accountName || ""; vb = b.accountName || ""; }
    else if (sortKey === "license")          { va = a.licenseExpiration || ""; vb = b.licenseExpiration || ""; }
    const cmp = (va ?? "") < (vb ?? "") ? -1 : (va ?? "") > (vb ?? "") ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const handleExport = () => {
    const rows = sorted.map((r) => ({
      "Priority": priorityLabel(type, type === "expired" ? (r.daysExpired ?? 0) : (r.daysRemaining ?? 0)).label,
      "Driver Name": r.driverName,
      "Status": r.driverStatus,
      "Worker Classification": r.workerClassification || "—",
      "License #": r.licenseNumber || "—",
      "State": r.driverState || "—",
      "Account": r.accountName || "—",
      "License Expiration": formatDate(r.licenseExpiration),
      ...(type === "expired" ? { "Days Expired": r.daysExpired } : { "Days Remaining": r.daysRemaining }),
    }));
    exportToExcel(rows, type === "expired" ? "License_Expired" : "License_Expiring_Soon");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8" placeholder="Search drivers, accounts, state…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            data-testid="input-license-search"
          />
        </div>
        {search && (
          <Button size="icon" variant="ghost" onClick={() => setSearch("")}>
            <X className="h-4 w-4" />
          </Button>
        )}
        <Button variant="outline" size="default" onClick={handleExport} data-testid="button-export-license">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>
      <div className="text-xs text-muted-foreground">
        {sorted.length} of {data.length} record{data.length !== 1 ? "s" : ""} — all non-archived drivers
      </div>
      {sorted.length === 0 ? (
        <EmptyState label="No license records found" />
      ) : (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead col="priority" className="w-20">Priority</SortHead>
                <SortHead col="driverName">Driver</SortHead>
                <SortHead col="driverStatus">Status</SortHead>
                <SortHead col="workerClassification">Worker Classification</SortHead>
                <SortHead col="licenseNumber">License #</SortHead>
                <SortHead col="driverState">State</SortHead>
                <SortHead col="accountName">Account</SortHead>
                <SortHead col="license">License</SortHead>
                <TableHead className="w-52">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => {
                const days = type === "expired" ? (r.daysExpired ?? 0) : (r.daysRemaining ?? 0);
                const pri = priorityLabel(type, days);
                const wpiEntry = wpiMap[r.driverId];
                const isDone = wpiEntry?.status === "completed";
                return (
                  <TableRow key={r.driverId} className={isDone ? "opacity-50" : ""} data-testid={`row-license-${r.driverId}`}>
                    <TableCell>
                      <span className={`inline-flex items-center justify-center rounded px-2 py-0.5 text-xs font-semibold ${pri.accent}`}>{pri.label}</span>
                    </TableCell>
                    <TableCell>
                      <Link href={`/drivers/${r.driverId}`}>
                        <span className="font-medium text-primary hover:underline cursor-pointer whitespace-nowrap">{r.driverName}</span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.driverStatus} />
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {r.workerClassification || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums whitespace-nowrap">
                      {r.licenseNumber || "—"}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {r.driverState || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {r.accountId ? (
                        <Link href={`/accounts/${r.accountId}`}>
                          <span className="text-sm text-primary hover:underline cursor-pointer whitespace-nowrap">{r.accountName}</span>
                        </Link>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm tabular-nums text-muted-foreground whitespace-nowrap">
                          {formatDate(r.licenseExpiration)}
                        </span>
                        {type === "expired" ? (
                          <Badge variant="destructive" className="w-fit">{r.daysExpired}d ago</Badge>
                        ) : (
                          <Badge className={`w-fit ${
                            (r.daysRemaining ?? 99) <= 7
                              ? "bg-destructive/15 text-destructive border-destructive/20"
                              : (r.daysRemaining ?? 99) <= 14
                              ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20"
                              : "bg-yellow-200/30 text-yellow-600 dark:text-yellow-500 border-yellow-300/30"
                          }`}>
                            {r.daysRemaining}d left
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ActionButtons driver={r} wpiEntry={wpiEntry} users={users} onAction={onAction} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── Drug Test Missing Table ───────────────────────────────────────────────────

type DrugSortKey = "priority" | "driverName" | "driverStatus" | "hireDate" | "workerClassification" | "driverState" | "accountName" | "drugTest";

function DrugTestMissingTable({
  data, wpiMap, users, onAction,
}: {
  data: DrugTestDriver[];
  wpiMap: WpiMap;
  users: CorporateUser[];
  onAction: (type: "snooze" | "reassign" | "notes" | "activity" | "start" | "complete", driver: AnyDriver) => void;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<DrugSortKey>("driverName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: DrugSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: DrugSortKey }) => {
    if (sortKey !== col) return <span className="ml-1 opacity-30 text-xs">↕</span>;
    return <span className="ml-1 text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const SortHead = ({ col, children, className }: { col: DrugSortKey; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={`cursor-pointer select-none hover:bg-muted/50 transition-colors whitespace-nowrap ${className ?? ""}`}
      onClick={() => handleSort(col)}
      data-testid={`th-drug-${col}`}
    >
      {children}<SortIcon col={col} />
    </TableHead>
  );

  const filtered = data.filter(
    (r) =>
      r.driverName.toLowerCase().includes(search.toLowerCase()) ||
      (r.accountName || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.workerClassification || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.driverState || "").toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    let va: string | number | null = null;
    let vb: string | number | null = null;
    if (sortKey === "priority") { va = "high"; vb = "high"; }
    else if (sortKey === "driverName") { va = a.driverName; vb = b.driverName; }
    else if (sortKey === "driverStatus") { va = a.driverStatus; vb = b.driverStatus; }
    else if (sortKey === "hireDate") { va = a.hireDate || ""; vb = b.hireDate || ""; }
    else if (sortKey === "workerClassification") { va = a.workerClassification || ""; vb = b.workerClassification || ""; }
    else if (sortKey === "driverState") { va = a.driverState || ""; vb = b.driverState || ""; }
    else if (sortKey === "accountName") { va = a.accountName || ""; vb = b.accountName || ""; }
    else if (sortKey === "drugTest") { va = "No record"; vb = "No record"; }
    const cmp = (va ?? "") < (vb ?? "") ? -1 : (va ?? "") > (vb ?? "") ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const handleExport = () => {
    const rows = sorted.map((r) => ({
      "Priority": "High",
      "Driver Name": r.driverName,
      "Status": r.driverStatus,
      "Date of Hire": formatDate(r.hireDate),
      "Worker Classification": r.workerClassification || "—",
      "State": r.driverState || "—",
      "Account": r.accountName || "—",
      "Drug Test": "No record",
    }));
    exportToExcel(rows, "Drug_Test_Missing");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8" placeholder="Search drivers, accounts, state…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            data-testid="input-drug-search"
          />
        </div>
        {search && (
          <Button size="icon" variant="ghost" onClick={() => setSearch("")}>
            <X className="h-4 w-4" />
          </Button>
        )}
        <Button variant="outline" size="default" onClick={handleExport} data-testid="button-export-drug">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>
      <div className="text-xs text-muted-foreground">
        {sorted.length} of {data.length} active driver{data.length !== 1 ? "s" : ""} with no drug test on file
      </div>
      {sorted.length === 0 ? (
        <EmptyState label="All active drivers have a drug test on file" />
      ) : (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead col="priority" className="w-20">Priority</SortHead>
                <SortHead col="driverName">Driver</SortHead>
                <SortHead col="driverStatus">Status</SortHead>
                <SortHead col="hireDate">Date of Hire</SortHead>
                <SortHead col="workerClassification">Worker Classification</SortHead>
                <SortHead col="driverState">State</SortHead>
                <SortHead col="accountName">Account</SortHead>
                <SortHead col="drugTest">Drug Test</SortHead>
                <TableHead className="w-52">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => {
                const pri = priorityLabel("missing");
                const wpiEntry = wpiMap[r.driverId];
                const isDone = wpiEntry?.status === "completed";
                return (
                  <TableRow key={r.driverId} className={isDone ? "opacity-50" : ""} data-testid={`row-drug-${r.driverId}`}>
                    <TableCell>
                      <span className={`inline-flex items-center justify-center rounded px-2 py-0.5 text-xs font-semibold ${pri.accent}`}>{pri.label}</span>
                    </TableCell>
                    <TableCell>
                      <Link href={`/drivers/${r.driverId}`}>
                        <span className="font-medium text-primary hover:underline cursor-pointer whitespace-nowrap">{r.driverName}</span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.driverStatus} />
                    </TableCell>
                    <TableCell>
                      <span className="text-sm tabular-nums text-muted-foreground whitespace-nowrap">
                        {formatDate(r.hireDate)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {r.workerClassification || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {r.driverState || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {r.accountId ? (
                        <Link href={`/accounts/${r.accountId}`}>
                          <span className="text-sm text-primary hover:underline cursor-pointer whitespace-nowrap">{r.accountName}</span>
                        </Link>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 whitespace-nowrap">
                        No record
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <ActionButtons driver={r} wpiEntry={wpiEntry} users={users} onAction={onAction} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── Compact Compliance Tile ────────────────────────────────────────────────────

function CompactTile({
  title, shortLabel, icon: Icon, count, isLoading, isFetching,
  reportKey, activeReport, onToggle, colorClass, iconBgClass,
}: {
  title: string; shortLabel: string; icon: React.ElementType;
  count: number; isLoading: boolean; isFetching?: boolean; reportKey: ActiveReport;
  activeReport: ActiveReport; onToggle: (key: ActiveReport) => void;
  colorClass: string; iconBgClass: string;
}) {
  const isActive = activeReport === reportKey;
  const isRefreshing = !isLoading && isFetching;
  return (
    <button
      type="button"
      onClick={() => onToggle(reportKey)}
      data-testid={`tile-compliance-${reportKey}`}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md border text-left transition-all hover-elevate ${
        isActive ? "ring-2 ring-primary bg-primary/5 border-primary/30" : "bg-card"
      }`}
    >
      <div className={`h-7 w-7 rounded-md ${iconBgClass} flex items-center justify-center shrink-0`}>
        <Icon className={`h-3.5 w-3.5 ${colorClass}`} />
      </div>
      <div className="flex-1 min-w-0">
        {isLoading ? (
          <div className="h-5 w-8 bg-muted rounded animate-pulse mb-0.5" />
        ) : (
          <p className={`text-lg font-bold tabular-nums leading-none ${colorClass}`}>{count}</p>
        )}
        <p className="text-[11px] text-muted-foreground leading-tight truncate">{shortLabel}</p>
      </div>
      <div className="shrink-0 flex items-center gap-1">
        {isRefreshing && <RefreshCw className="h-2.5 w-2.5 text-muted-foreground/40 animate-spin" />}
        {isActive
          ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/60" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40" />}
      </div>
    </button>
  );
}

// ── Collapsible Section ────────────────────────────────────────────────────────

function CollapsibleSection({
  icon: Icon, label, colorClass, count, countVariant = "neutral", defaultOpen = true,
  isFetching, children,
}: {
  icon: React.ElementType; label: string; colorClass: string;
  count?: number; countVariant?: "alert" | "ok" | "neutral";
  defaultOpen?: boolean; isFetching?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const countColorMap = {
    alert: "bg-destructive/10 text-destructive",
    ok:    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    neutral: "bg-muted text-muted-foreground",
  };
  return (
    <div className="border rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 hover-elevate text-left"
        data-testid={`section-toggle-${label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <div className="flex items-center gap-2">
          <Icon className={`h-3.5 w-3.5 ${colorClass} shrink-0`} />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
          {count !== undefined && (
            <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded text-xs font-bold tabular-nums ${countColorMap[countVariant]}`}>
              {count}
            </span>
          )}
          {isFetching && <RefreshCw className="h-3 w-3 text-muted-foreground/40 animate-spin" />}
        </div>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

// ── Stat Pill ──────────────────────────────────────────────────────────────────

function StatPill({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/50 border text-xs">
      <span className={`font-bold tabular-nums ${colorClass}`}>{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

// ── Assign Account Modal ──────────────────────────────────────────────────────

function AssignAccountModal({
  open,
  driver,
  onClose,
  onAssigned,
}: {
  open: boolean;
  driver: UnassignedDriver | null;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [isPrimary, setIsPrimary] = useState(true);
  const { toast } = useToast();

  const { data: accounts = [], isLoading: loadingAccounts } = useQuery<AccountSearchResult[]>({
    queryKey: ["/api/corporate/customers"],
    staleTime: 60_000,
  });

  const filtered = accounts.filter((a) =>
    a.customerName.toLowerCase().includes(search.toLowerCase()) && a.status !== "inactive"
  );

  const assignMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/corporate/drivers/${driver?.driverId}/accounts`, {
        accountId: selectedAccountId,
        isPrimary,
      }),
    onMutate: async () => {
      // Cancel any outgoing refetches so they don't overwrite optimistic update
      await queryClient.cancelQueries({ queryKey: ["/api/driver-ops/unassigned-drivers"] });
      const previous = queryClient.getQueryData<UnassignedDriver[]>(["/api/driver-ops/unassigned-drivers"]);
      // Optimistically remove the driver from the list immediately
      if (driver) {
        queryClient.setQueryData<UnassignedDriver[]>(
          ["/api/driver-ops/unassigned-drivers"],
          (old) => old?.filter((d) => d.driverId !== driver.driverId) ?? []
        );
      }
      return { previous };
    },
    onSuccess: () => {
      // Revalidate with server truth after optimistic update
      queryClient.invalidateQueries({ queryKey: ["/api/driver-ops/unassigned-drivers"] });
      onAssigned();
      onClose();
    },
    onError: (_err, _vars, context: any) => {
      // Roll back optimistic update on failure
      if (context?.previous !== undefined) {
        queryClient.setQueryData(["/api/driver-ops/unassigned-drivers"], context.previous);
      }
      toast({ title: "Assignment failed", description: "Could not assign account. Please try again.", variant: "destructive" });
    },
  });

  if (!driver) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Assign Account — {driver.driverName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              data-testid="input-account-search"
              className="pl-8"
              placeholder="Search accounts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loadingAccounts ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No matching accounts</p>
          ) : (
            <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
              {filtered.slice(0, 50).map((a) => (
                <button
                  key={a.id}
                  data-testid={`option-account-${a.id}`}
                  onClick={() => setSelectedAccountId(a.id)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors hover-elevate ${
                    selectedAccountId === a.id ? "bg-primary/10 font-medium" : ""
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {selectedAccountId === a.id && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                    )}
                    <span>{a.customerName}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is-primary"
              data-testid="checkbox-is-primary"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="is-primary" className="text-sm text-muted-foreground">
              Set as primary account
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="button-cancel-assign">
            Cancel
          </Button>
          <Button
            data-testid="button-confirm-assign"
            disabled={!selectedAccountId || assignMutation.isPending}
            onClick={() => assignMutation.mutate()}
          >
            {assignMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Assign Account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Unassigned Drivers Table ───────────────────────────────────────────────────

function UnassignedDriversTable({
  data,
  onAssign,
}: {
  data: UnassignedDriver[];
  onAssign: (driver: UnassignedDriver) => void;
}) {
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "high" | "low">("all");
  const { toast } = useToast();

  const filtered = data.filter((d) => {
    const matchSearch = d.driverName.toLowerCase().includes(search.toLowerCase()) ||
      (d.market ?? "").toLowerCase().includes(search.toLowerCase());
    const matchPriority = priorityFilter === "all" || d.priority === priorityFilter;
    return matchSearch && matchPriority;
  });

  const deactivateMutation = useMutation({
    mutationFn: (driverId: string) =>
      apiRequest("PATCH", `/api/corporate/drivers/${driverId}/status`, { status: "inactive" }),
    onMutate: async (driverId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/driver-ops/unassigned-drivers"] });
      const previous = queryClient.getQueryData<UnassignedDriver[]>(["/api/driver-ops/unassigned-drivers"]);
      // Optimistically remove the driver immediately
      queryClient.setQueryData<UnassignedDriver[]>(
        ["/api/driver-ops/unassigned-drivers"],
        (old) => old?.filter((d) => d.driverId !== driverId) ?? []
      );
      return { previous };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver-ops/unassigned-drivers"] });
    },
    onError: (_err, _driverId, context: any) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(["/api/driver-ops/unassigned-drivers"], context.previous);
      }
      toast({ title: "Deactivation failed", description: "Could not deactivate driver. Please try again.", variant: "destructive" });
    },
  });

  function fmtDate(s: string | null) {
    if (!s) return "—";
    const d = new Date(s);
    if (isNaN(d.getTime())) return "—";
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
  }

  function wiwBadge(driver: UnassignedDriver) {
    if (!driver.wiwMatchStatus) return <Badge variant="outline" className="text-xs">Not Linked</Badge>;
    if (driver.wiwMatchStatus === "matched") {
      return <Badge className="text-xs bg-emerald-600 text-white">WIW Linked</Badge>;
    }
    if (driver.wiwMatchStatus === "ambiguous") {
      return <Badge className="text-xs bg-amber-500 text-white">Ambiguous</Badge>;
    }
    return <Badge variant="outline" className="text-xs">Unmatched</Badge>;
  }

  const highCount = data.filter((d) => d.priority === "high").length;

  return (
    <div className="space-y-3">
      {highCount > 0 && (
        <div className="flex items-center gap-2 p-2.5 rounded-md bg-destructive/8 border border-destructive/20 text-sm text-destructive">
          <Zap className="h-4 w-4 flex-shrink-0" />
          <span>
            <strong>{highCount}</strong> driver{highCount !== 1 ? "s" : ""} with recent WIW activity — assign an account to activate scheduling.
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="input-unassigned-search"
            className="pl-8 h-9"
            placeholder="Search name or market…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as "all" | "high" | "low")}>
          <SelectTrigger data-testid="select-priority-filter" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="high">High Priority</SelectItem>
            <SelectItem value="low">Low Priority</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="default"
          data-testid="button-export-unassigned"
          onClick={() =>
            exportToExcel(
              filtered.map((d) => ({
                "Driver Name":      d.driverName,
                "Type":             d.driverType ?? "—",
                "Classification":   d.driverClassification ?? "—",
                "Market":           d.market ?? "—",
                "WIW Status":       d.wiwMatchStatus ?? "Not Linked",
                "Last Move Date":   fmtDate(d.lastMoveDate),
                "Last Shift Date":  fmtDate(d.lastShiftAt),
                "Priority":         d.priority,
                "Created":          fmtDate(d.createdAt),
              })),
              "unassigned-drivers"
            )
          }
        >
          <Download className="h-4 w-4 mr-1.5" /> Export
        </Button>
      </div>

      <div className="rounded-md border overflow-hidden max-h-[400px] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead>Driver</TableHead>
              <TableHead>Type / Class</TableHead>
              <TableHead>Market</TableHead>
              <TableHead>WIW</TableHead>
              <TableHead>Last Move</TableHead>
              <TableHead>Last Shift</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-sm">
                  No unassigned drivers match your filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((d) => (
                <TableRow key={d.driverId} data-testid={`row-unassigned-${d.driverId}`}>
                  <TableCell className="font-medium">
                    <Link href={`/drivers/${d.driverId}`} className="hover:underline text-primary flex items-center gap-1">
                      {d.driverName}
                      <ExternalLink className="h-3 w-3 opacity-50" />
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground">{d.driverType ?? "—"}</span>
                      <span className="text-xs">{d.driverClassification ?? "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{d.market ?? "—"}</TableCell>
                  <TableCell>{wiwBadge(d)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(d.lastMoveDate)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(d.lastShiftAt)}</TableCell>
                  <TableCell>
                    {d.priority === "high" ? (
                      <Badge className="text-xs bg-red-600 text-white">High</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">Low</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(d.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 justify-end">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            data-testid={`button-assign-${d.driverId}`}
                            onClick={() => onAssign(d)}
                          >
                            <Link2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Assign Account</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            data-testid={`button-view-driver-${d.driverId}`}
                            asChild
                          >
                            <Link href={`/drivers/${d.driverId}`}>
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>View Driver</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            data-testid={`button-deactivate-${d.driverId}`}
                            disabled={deactivateMutation.isPending}
                            onClick={() => {
                              if (confirm(`Deactivate ${d.driverName}?`)) {
                                deactivateMutation.mutate(d.driverId);
                              }
                            }}
                          >
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Deactivate Driver</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} of {data.length} driver{data.length !== 1 ? "s" : ""}</p>
    </div>
  );
}

// ── Multi-Account Drivers Table ───────────────────────────────────────────────

function MultiAccountDriversTable({
  data,
  isLoading,
}: {
  data: MultiAccountDriver[];
  isLoading: boolean;
}) {
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? data.filter((d) => {
        const q = search.toLowerCase();
        if (d.driverName.toLowerCase().includes(q)) return true;
        if (d.primaryAccountName?.toLowerCase().includes(q)) return true;
        if (d.secondaryAccounts.some((a) => a.name.toLowerCase().includes(q))) return true;
        return false;
      })
    : data;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No active drivers are assigned to multiple accounts.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          data-testid="input-multi-account-search"
          className="pl-8 h-9"
          placeholder="Search by driver or account name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="rounded-md border overflow-hidden max-h-[400px] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead>Driver Name</TableHead>
              <TableHead>Primary Account</TableHead>
              <TableHead>Secondary Accounts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-6 text-sm text-muted-foreground">
                  No results match your search.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((d) => (
                <TableRow key={d.driverId}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/drivers/${d.driverId}`}
                      className="text-primary hover:underline"
                      data-testid={`link-driver-${d.driverId}`}
                    >
                      {d.driverName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {d.primaryAccountName ? (
                      <span className="text-sm">{d.primaryAccountName}</span>
                    ) : (
                      <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                        No Primary Account Set
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {d.secondaryAccounts.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {d.secondaryAccounts.map((a) => (
                          <Badge
                            key={a.id}
                            variant="outline"
                            className="text-xs"
                            data-testid={`badge-secondary-account-${a.id}`}
                          >
                            {a.name}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Dialog State ──────────────────────────────────────────────────────────────

interface DialogState {
  type: "snooze" | "reassign" | "notes" | "activity" | null;
  driver: AnyDriver | null;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OpsWorkPlan() {
  const [activeReport, setActiveReport] = useState<ActiveReport>(null);
  const [dialog, setDialog] = useState<DialogState>({ type: null, driver: null });
  const [wpiMap, setWpiMap] = useState<WpiMap>({});
  const [ensurePending, setEnsurePending] = useState(false);

  // ── Queries (all widget queries poll every 30s) ───────────────────────────
  const { data: mvrExpired        = [], isLoading: loadingMvrExpired,  isFetching: fetchingMvrExp,  dataUpdatedAt: updatedMvrExp  } = useQuery<MvrDriver[]>({ queryKey: ["/api/driver-ops/mvr-expired"],        ...WIDGET_POLL_OPTS });
  const { data: mvrExpiring       = [], isLoading: loadingMvrExpiring, isFetching: fetchingMvrIng,  dataUpdatedAt: updatedMvrIng  } = useQuery<MvrDriver[]>({ queryKey: ["/api/driver-ops/mvr-expiring"],       ...WIDGET_POLL_OPTS });
  const { data: licExpired        = [], isLoading: loadingLicExpired,  isFetching: fetchingLicExp,  dataUpdatedAt: updatedLicExp  } = useQuery<LicenseDriver[]>({ queryKey: ["/api/driver-ops/license-expired"],    ...WIDGET_POLL_OPTS });
  const { data: licExpiring       = [], isLoading: loadingLicExpiring, isFetching: fetchingLicIng,  dataUpdatedAt: updatedLicIng  } = useQuery<LicenseDriver[]>({ queryKey: ["/api/driver-ops/license-expiring"],   ...WIDGET_POLL_OPTS });
  const { data: drugMissing       = [], isLoading: loadingDrugMissing, isFetching: fetchingDrug,    dataUpdatedAt: updatedDrug    } = useQuery<DrugTestDriver[]>({ queryKey: ["/api/driver-ops/drug-test-missing"],  ...WIDGET_POLL_OPTS });
  const { data: unassignedDrivers = [], isLoading: loadingUnassigned,  isFetching: fetchingUnassigned, dataUpdatedAt: updatedUnassigned } = useQuery<UnassignedDriver[]>({ queryKey: ["/api/driver-ops/unassigned-drivers"], ...WIDGET_POLL_OPTS });
  const { data: multiAccountDrivers = [], isLoading: loadingMulti, isFetching: fetchingMulti, dataUpdatedAt: updatedMulti } = useQuery<MultiAccountDriver[]>({ queryKey: ["/api/driver-ops/multi-account-drivers"], ...WIDGET_POLL_OPTS });
  const { data: photoApprovals = [], isLoading: loadingPhotoApprovals, isFetching: fetchingPhotoApprovals, dataUpdatedAt: updatedPhotoApprovals } = useQuery<PhotoApproval[]>({ queryKey: ["/api/driver-ops/photo-approvals"], ...WIDGET_POLL_OPTS });
  const { data: users = [] } = useQuery<CorporateUser[]>({ queryKey: ["/api/users?role=corporate"] });

  // Photo approval mutations
  const approvePhotoMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("POST", `/api/driver-ops/photo-approvals/${id}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver-ops/photo-approvals"] });
      toast({ title: "Photo approved", description: "Driver photo has been approved and applied." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to approve photo.", variant: "destructive" });
    },
  });

  const declinePhotoMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return await apiRequest("POST", `/api/driver-ops/photo-approvals/${id}/decline`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver-ops/photo-approvals"] });
      toast({ title: "Photo declined", description: "The driver has been notified." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to decline photo.", variant: "destructive" });
    },
  });

  // Oldest update time drives the "last updated" indicator
  const oldestUpdate = Math.min(
    updatedMvrExp, updatedMvrIng, updatedLicExp, updatedLicIng, updatedDrug, updatedUnassigned, updatedMulti, updatedPhotoApprovals
  );
  const relativeTime = useRelativeTime(oldestUpdate);

  const [assignTarget, setAssignTarget] = useState<UnassignedDriver | null>(null);
  const [declineTarget, setDeclineTarget] = useState<PhotoApproval | null>(null);
  const [declineReason, setDeclineReason] = useState("");

  // ── ensure-batch: create/get WPI items for all compliance items ───────────
  useEffect(() => {
    const totalCount =
      mvrExpired.length + mvrExpiring.length +
      licExpired.length + licExpiring.length +
      drugMissing.length;
    if (totalCount === 0) return;
    setEnsurePending(true);

    const items = [
      ...mvrExpired.map((d) => ({
        eventType: "mvr_expired",
        recordId: d.driverId, recordName: d.driverName,
        reason: `MVR expired ${d.daysExpired} day${d.daysExpired !== 1 ? "s" : ""} ago`,
        priority: "high", category: "driver_ops",
        recordUrl: `/drivers/${d.driverId}`, sourceModule: "compliance",
      })),
      ...mvrExpiring.map((d) => ({
        eventType: "mvr_expiring_soon",
        recordId: d.driverId, recordName: d.driverName,
        reason: `MVR expiring in ${d.daysRemaining} day${d.daysRemaining !== 1 ? "s" : ""}`,
        priority: (d.daysRemaining ?? 99) <= 3 ? "high" : "normal",
        category: "driver_ops", recordUrl: `/drivers/${d.driverId}`, sourceModule: "compliance",
      })),
      ...licExpired.map((d) => ({
        eventType: "license_expired",
        recordId: d.driverId, recordName: d.driverName,
        reason: `Driver's license expired ${d.daysExpired} day${d.daysExpired !== 1 ? "s" : ""} ago`,
        priority: "high", category: "driver_ops",
        recordUrl: `/drivers/${d.driverId}`, sourceModule: "compliance",
      })),
      ...licExpiring.map((d) => ({
        eventType: "license_expiring_soon",
        recordId: d.driverId, recordName: d.driverName,
        reason: `Driver's license expiring in ${d.daysRemaining} day${d.daysRemaining !== 1 ? "s" : ""}`,
        priority: (d.daysRemaining ?? 99) <= 7 ? "high" : "low",
        category: "driver_ops", recordUrl: `/drivers/${d.driverId}`, sourceModule: "compliance",
      })),
      ...drugMissing.map((d) => ({
        eventType: "drug_test_missing",
        recordId: d.driverId, recordName: d.driverName,
        reason: "No drug test date on file",
        priority: "high", category: "driver_ops",
        recordUrl: `/drivers/${d.driverId}`, sourceModule: "compliance",
      })),
    ];

    // ensure-batch caps at 100; send in chunks if needed
    const chunks: typeof items[] = [];
    for (let i = 0; i < items.length; i += 100) chunks.push(items.slice(i, i + 100));

    Promise.all(
      chunks.map((chunk) =>
        apiRequest("POST", "/api/work-plan-items/ensure-batch", { items: chunk })
          .then((r) => r.json())
          .then((body: { taskMap: Record<string, WpiEntry> }) => body.taskMap)
      )
    )
      .then((maps) => {
        const merged: WpiMap = {};
        for (const m of maps) Object.assign(merged, m);
        setWpiMap((prev) => ({ ...prev, ...merged }));
      })
      .catch(console.error)
      .finally(() => setEnsurePending(false));
  }, [
    mvrExpired.length, mvrExpiring.length,
    licExpired.length, licExpiring.length, drugMissing.length,
  ]);

  // ── Action handler ────────────────────────────────────────────────────────
  const handleAction = (
    type: "snooze" | "reassign" | "notes" | "activity" | "start" | "complete",
    driver: AnyDriver
  ) => {
    if (type === "start" || type === "complete") return;
    setDialog({ type, driver });
  };

  const closeDialog = () => setDialog({ type: null, driver: null });

  // ── Snooze mutation ───────────────────────────────────────────────────────
  const snoozeMutation = useMutation({
    mutationFn: ({ taskId, until }: { taskId: string; until: Date }) =>
      apiRequest("PATCH", `/api/work-plan-items/${taskId}/snooze`, { snoozeUntil: until.toISOString() }),
    onSuccess: () => {
      ["mvr-expired","mvr-expiring","license-expired","license-expiring","drug-test-missing"].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: [`/api/driver-ops/${k}`] })
      );
      closeDialog();
    },
  });

  // ── Reassign mutation ─────────────────────────────────────────────────────
  const reassignMutation = useMutation({
    mutationFn: ({ taskId, userId }: { taskId: string; userId: string }) =>
      apiRequest("PATCH", `/api/work-plan-items/${taskId}/reassign`, { userId }),
    onSuccess: () => closeDialog(),
  });

  const handleToggle = (key: ActiveReport) =>
    setActiveReport((prev) => (prev === key ? null : key));

  const dialogTaskId = dialog.driver
    ? wpiMap[dialog.driver.driverId]?.taskId
    : undefined;

  // ── Drill-down section config ─────────────────────────────────────────────
  const drillDownTitle: Record<NonNullable<ActiveReport>, string> = {
    "mvr-expired":            "MVR Expired — All Records",
    "mvr-expiring":           "MVR Expiring Soon — All Records",
    "license-expired":        "License Expired — All Records",
    "license-expiring":       "License Expiring Soon — All Records",
    "drug-missing":           "Drug Test Missing — All Active Drivers",
    "unassigned-drivers":     "Unassigned Drivers — Active Drivers Without an Account",
    "multi-account-drivers":  "Multi-Account Drivers — Active Drivers Assigned to 2+ Accounts",
    "photo-approvals":        "Driver Photo Approvals — Pending Review",
  };
  const drillDownIcon: Record<NonNullable<ActiveReport>, React.ElementType> = {
    "mvr-expired":            AlertTriangle,
    "mvr-expiring":           Clock,
    "license-expired":        AlertTriangle,
    "license-expiring":       Clock,
    "drug-missing":           ShieldAlert,
    "unassigned-drivers":     UserX,
    "multi-account-drivers":  Users,
    "photo-approvals":        Camera,
  };
  const drillDownColor: Record<NonNullable<ActiveReport>, string> = {
    "mvr-expired":            "text-destructive",
    "mvr-expiring":           "text-yellow-600 dark:text-yellow-400",
    "license-expired":        "text-destructive",
    "license-expiring":       "text-yellow-600 dark:text-yellow-400",
    "drug-missing":           "text-orange-600 dark:text-orange-400",
    "unassigned-drivers":     unassignedDrivers.length > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400",
    "multi-account-drivers":  "text-purple-500",
    "photo-approvals":        "text-sky-600 dark:text-sky-400",
  };

  const complianceTotal =
    mvrExpired.length + mvrExpiring.length + licExpired.length + licExpiring.length + drugMissing.length;

  return (
    <div className="space-y-3">

      {/* ── Compact Sticky Header ──────────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b -mx-4 sm:-mx-6 px-4 sm:px-6 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <ClipboardList className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight">Compliance · Account Assignment</p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {ensurePending && (
              <span className="inline-flex items-center gap-1 text-muted-foreground/70">
                <Loader2 className="h-3 w-3 animate-spin" />Syncing tasks…
              </span>
            )}
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <Wifi className="h-3 w-3 text-emerald-500" />
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">Live</span>
              {relativeTime && <span className="text-muted-foreground/50">· {relativeTime}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 1: Account Assignment — compact tiles, default EXPANDED ─────── */}
      <CollapsibleSection
        icon={Building2}
        label="Account Assignment"
        colorClass="text-indigo-500"
        count={unassignedDrivers.length}
        countVariant={unassignedDrivers.length > 0 ? "alert" : "ok"}
        defaultOpen={true}
        isFetching={
          (fetchingUnassigned && !loadingUnassigned) ||
          (fetchingMulti && !loadingMulti)
        }
      >
        <div className="px-3 py-3 space-y-3">
          {/* Compact tile grid — 2 tiles side by side */}
          <div className="grid grid-cols-2 gap-2">
            <CompactTile
              title="Unassigned Drivers"
              shortLabel="Unassigned"
              icon={UserX}
              count={unassignedDrivers.length}
              isLoading={loadingUnassigned}
              isFetching={fetchingUnassigned}
              reportKey="unassigned-drivers"
              activeReport={activeReport}
              onToggle={handleToggle}
              colorClass={unassignedDrivers.length > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}
              iconBgClass={unassignedDrivers.length > 0 ? "bg-destructive/10" : "bg-emerald-500/10"}
            />
            <CompactTile
              title="Multi-Account Drivers"
              shortLabel="Multi-Account"
              icon={Users}
              count={multiAccountDrivers.length}
              isLoading={loadingMulti}
              isFetching={fetchingMulti}
              reportKey="multi-account-drivers"
              activeReport={activeReport}
              onToggle={handleToggle}
              colorClass="text-purple-500"
              iconBgClass="bg-purple-500/10"
            />
          </div>

          {/* Inline drill-down — renders when an account assignment tile is active */}
          {(activeReport === "unassigned-drivers" || activeReport === "multi-account-drivers") && (
            <Card>
              <CardHeader className="py-2.5 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  {(() => {
                    const Icon = drillDownIcon[activeReport];
                    return <Icon className={`h-3.5 w-3.5 ${drillDownColor[activeReport]}`} />;
                  })()}
                  {drillDownTitle[activeReport]}
                  {ensurePending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-1" />}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 px-4 pb-4">
                {activeReport === "unassigned-drivers" && (
                  <UnassignedDriversTable
                    data={unassignedDrivers}
                    onAssign={(driver) => setAssignTarget(driver)}
                  />
                )}
                {activeReport === "multi-account-drivers" && (
                  <MultiAccountDriversTable data={multiAccountDrivers} isLoading={loadingMulti} />
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </CollapsibleSection>

      {/* ── Section 2: Compliance — compact tiles, default COLLAPSED ─────────── */}
      <CollapsibleSection
        icon={ShieldAlert}
        label="Compliance"
        colorClass="text-blue-500"
        count={complianceTotal}
        countVariant={complianceTotal > 0 ? "alert" : "ok"}
        defaultOpen={false}
        isFetching={(fetchingMvrExp || fetchingMvrIng || fetchingLicExp || fetchingLicIng || fetchingDrug) &&
          !(loadingMvrExpired || loadingMvrExpiring || loadingLicExpired || loadingLicExpiring || loadingDrugMissing)}
      >
        <div className="px-3 py-3 space-y-3">
          {/* Compact tile grid — 4 per row (2 rows for 5 tiles) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <CompactTile
              title="MVR Expired" shortLabel="MVR Expired"
              icon={AlertTriangle} count={mvrExpired.length} isLoading={loadingMvrExpired} isFetching={fetchingMvrExp}
              reportKey="mvr-expired" activeReport={activeReport} onToggle={handleToggle}
              colorClass="text-destructive" iconBgClass="bg-destructive/10"
            />
            <CompactTile
              title="MVR Expiring" shortLabel="MVR Expiring Soon"
              icon={Clock} count={mvrExpiring.length} isLoading={loadingMvrExpiring} isFetching={fetchingMvrIng}
              reportKey="mvr-expiring" activeReport={activeReport} onToggle={handleToggle}
              colorClass="text-yellow-600 dark:text-yellow-400" iconBgClass="bg-yellow-500/10"
            />
            <CompactTile
              title="License Expired" shortLabel="License Expired"
              icon={AlertTriangle} count={licExpired.length} isLoading={loadingLicExpired} isFetching={fetchingLicExp}
              reportKey="license-expired" activeReport={activeReport} onToggle={handleToggle}
              colorClass="text-destructive" iconBgClass="bg-destructive/10"
            />
            <CompactTile
              title="License Expiring" shortLabel="License Expiring"
              icon={Clock} count={licExpiring.length} isLoading={loadingLicExpiring} isFetching={fetchingLicIng}
              reportKey="license-expiring" activeReport={activeReport} onToggle={handleToggle}
              colorClass="text-yellow-600 dark:text-yellow-400" iconBgClass="bg-yellow-500/10"
            />
            <CompactTile
              title="Drug Test Missing" shortLabel="Drug Test Missing"
              icon={ShieldAlert} count={drugMissing.length} isLoading={loadingDrugMissing} isFetching={fetchingDrug}
              reportKey="drug-missing" activeReport={activeReport} onToggle={handleToggle}
              colorClass="text-orange-600 dark:text-orange-400" iconBgClass="bg-orange-500/10"
            />
          </div>

          {/* Inline drill-down — renders when a compliance tile is active */}
          {activeReport !== null && activeReport !== "unassigned-drivers" && activeReport !== "multi-account-drivers" && (
            <Card>
              <CardHeader className="py-2.5 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  {(() => {
                    const Icon = drillDownIcon[activeReport];
                    return <Icon className={`h-3.5 w-3.5 ${drillDownColor[activeReport]}`} />;
                  })()}
                  {drillDownTitle[activeReport]}
                  {ensurePending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-1" />}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 px-4 pb-4">
                {activeReport === "mvr-expired" && (
                  <MvrReportTable data={mvrExpired} type="expired" wpiMap={wpiMap} users={users} onAction={handleAction} />
                )}
                {activeReport === "mvr-expiring" && (
                  <MvrReportTable data={mvrExpiring} type="expiring" wpiMap={wpiMap} users={users} onAction={handleAction} />
                )}
                {activeReport === "license-expired" && (
                  <LicenseReportTable data={licExpired} type="expired" wpiMap={wpiMap} users={users} onAction={handleAction} />
                )}
                {activeReport === "license-expiring" && (
                  <LicenseReportTable data={licExpiring} type="expiring" wpiMap={wpiMap} users={users} onAction={handleAction} />
                )}
                {activeReport === "drug-missing" && (
                  <DrugTestMissingTable data={drugMissing} wpiMap={wpiMap} users={users} onAction={handleAction} />
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </CollapsibleSection>

      {/* ── Section 3: Driver Photo Approvals — driver_app submissions ─────────── */}
      <CollapsibleSection
        icon={Camera}
        label="Driver Photo Approvals"
        colorClass="text-sky-500"
        count={photoApprovals.length}
        countVariant={photoApprovals.length > 0 ? "alert" : "ok"}
        defaultOpen={photoApprovals.length > 0}
        isFetching={fetchingPhotoApprovals && !loadingPhotoApprovals}
      >
        <div className="px-3 py-3 space-y-3">
          {/* Single tile */}
          <div className="grid grid-cols-1 gap-2">
            <CompactTile
              title="Pending Photo Approvals"
              shortLabel="Pending"
              icon={Camera}
              count={photoApprovals.length}
              isLoading={loadingPhotoApprovals}
              isFetching={fetchingPhotoApprovals}
              reportKey="photo-approvals"
              activeReport={activeReport}
              onToggle={handleToggle}
              colorClass={photoApprovals.length > 0 ? "text-sky-600 dark:text-sky-400" : "text-emerald-600 dark:text-emerald-400"}
              iconBgClass={photoApprovals.length > 0 ? "bg-sky-500/10" : "bg-emerald-500/10"}
            />
          </div>

          {/* Inline drill-down */}
          {activeReport === "photo-approvals" && (
            <Card>
              <CardHeader className="py-2.5 px-4 flex flex-row items-center gap-2 flex-wrap justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Camera className="h-3.5 w-3.5 text-sky-500" />
                  Driver Photo Approvals — Pending Review
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loadingPhotoApprovals ? (
                  <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading…</span>
                  </div>
                ) : photoApprovals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                    <CheckCircle className="h-6 w-6 text-emerald-500" />
                    <span className="text-sm">No pending photo approvals</span>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs pl-4">Driver</TableHead>
                        <TableHead className="text-xs">Current Photo</TableHead>
                        <TableHead className="text-xs">Proposed Photo</TableHead>
                        <TableHead className="text-xs">Submitted</TableHead>
                        <TableHead className="text-xs text-right pr-4">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {photoApprovals.map((pa) => (
                        <TableRow key={pa.id}>
                          <TableCell className="pl-4">
                            <Link href={`/drivers/${pa.driverId}`} className="font-medium text-sm hover:underline text-foreground">
                              {pa.driverName}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {pa.currentPhotoUrl ? (
                              <img
                                src={pa.currentPhotoUrl}
                                alt="Current"
                                className="h-10 w-10 rounded-md object-cover"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                                <ImageOff className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {pa.proposedPhotoUrl ? (
                              <img
                                src={pa.proposedPhotoUrl}
                                alt="Proposed"
                                className="h-10 w-10 rounded-md object-cover ring-2 ring-sky-400/60"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                                <ImageOff className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(pa.createdAt)}
                          </TableCell>
                          <TableCell className="text-right pr-4">
                            <div className="flex items-center justify-end gap-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    data-testid={`button-approve-photo-${pa.id}`}
                                    disabled={approvePhotoMutation.isPending}
                                    onClick={() => approvePhotoMutation.mutate(pa.id)}
                                  >
                                    <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Approve photo</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    data-testid={`button-decline-photo-${pa.id}`}
                                    disabled={declinePhotoMutation.isPending}
                                    onClick={() => { setDeclineTarget(pa); setDeclineReason(""); }}
                                  >
                                    <XCircle className="h-4 w-4 text-destructive" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Decline photo</TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </CollapsibleSection>

      {/* ── Dialogs ──────────────────────────────────────────────────────────── */}

      {/* Decline Photo Dialog */}
      <Dialog open={!!declineTarget} onOpenChange={(open) => { if (!open) setDeclineTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Photo Submission</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Provide a reason for declining{declineTarget ? ` ${declineTarget.driverName}'s` : ""} photo submission.
            The driver will be notified.
          </p>
          <Textarea
            className="mt-2"
            placeholder="e.g. Photo is blurry, does not show full face, etc."
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            rows={3}
            data-testid="textarea-decline-reason"
          />
          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setDeclineTarget(null)} data-testid="button-cancel-decline">
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!declineReason.trim() || declinePhotoMutation.isPending}
              data-testid="button-confirm-decline"
              onClick={() => {
                if (declineTarget && declineReason.trim()) {
                  declinePhotoMutation.mutate(
                    { id: declineTarget.id, reason: declineReason.trim() },
                    { onSuccess: () => setDeclineTarget(null) }
                  );
                }
              }}
            >
              {declinePhotoMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Decline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SnoozeDialog
        open={dialog.type === "snooze" && !!dialog.driver}
        driverName={dialog.driver?.driverName ?? ""}
        onClose={closeDialog}
        isPending={snoozeMutation.isPending}
        onConfirm={(until) => {
          if (dialogTaskId) snoozeMutation.mutate({ taskId: dialogTaskId, until });
        }}
      />

      <ReassignDialog
        open={dialog.type === "reassign" && !!dialog.driver}
        driverName={dialog.driver?.driverName ?? ""}
        users={users}
        onClose={closeDialog}
        isPending={reassignMutation.isPending}
        onConfirm={(userId) => {
          if (dialogTaskId) reassignMutation.mutate({ taskId: dialogTaskId, userId });
        }}
      />

      {dialogTaskId && dialog.driver && (dialog.type === "notes" || dialog.type === "activity") && (
        <NotesActivityDialog
          open={true}
          taskId={dialogTaskId}
          driverName={dialog.driver.driverName}
          defaultTab={dialog.type === "activity" ? "activity" : "notes"}
          onClose={closeDialog}
        />
      )}

      <AssignAccountModal
        open={!!assignTarget}
        driver={assignTarget}
        onClose={() => setAssignTarget(null)}
        onAssigned={() => setAssignTarget(null)}
      />
    </div>
  );
}
