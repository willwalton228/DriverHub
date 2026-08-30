import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, addHours, startOfDay, isToday, isBefore } from "date-fns";
import { parseDateSafe } from "@/lib/dateFormat";
import {
  CalendarCheck,
  AlertTriangle,
  Building2,
  DollarSign,
  Users,
  ClipboardList,
  ExternalLink,
  CheckCircle2,
  BellOff,
  UserCheck,
  RefreshCw,
  Plus,
  Info,
  ShieldAlert,
  Minus,
  ArrowUp,
  Circle,
  ChevronDown,
  ChevronUp,
  Clock,
  CalendarX,
  Play,
  MessageSquare,
  XCircle,
  Car,
  Activity,
  Search,
  FileWarning,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkPlanItem {
  id: string;
  eventType: string;
  category: string;
  recordType: string | null;
  recordId: string | null;
  recordName: string;
  reason: string;
  assignedUserId: string | null;
  assignedTeamId: string | null;
  dueDate: string | null;
  priority: string;
  status: string;
  snoozeCount: number;
  snoozeUntil: string | null;
  recordUrl: string | null;
  taskType: string | null;
  sourceModule: string | null;
  accountName: string | null;
  inProgressAt: string | null;
  inProgressBy: string | null;
  createdAt: string;
  effectivePriority: number;
  ageHours: number;
}

interface WorkPlanData {
  items: WorkPlanItem[];
  byCategory: Record<string, WorkPlanItem[]>;
  totalOpen: number;
  generatedAt: string;
}

interface SyncResult {
  success: boolean;
  created: number;
  message: string;
}

interface CorporateUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface Team {
  id: string;
  name: string;
  queueType: string;
  memberCount: number;
}

interface TaskNote {
  id: string;
  note: string;
  createdBy: string | null;
  createdAt: string;
  authorName: string;
}

interface TaskActivityEntry {
  id: string;
  taskId: string;
  action: string;
  performedBy: string | null;
  actorName: string | null;
  note: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
}

// ── Category Config ───────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: "accounts",   label: "Accounts",     fullLabel: "Accounts Requiring Attention", icon: Building2,    color: "text-blue-600 dark:text-blue-400",       bg: "bg-blue-50 dark:bg-blue-900/30"     },
  { id: "operations", label: "Operational",  fullLabel: "Operational Exceptions",       icon: ShieldAlert,  color: "text-amber-600 dark:text-amber-400",     bg: "bg-amber-50 dark:bg-amber-900/30"   },
  { id: "financial",  label: "Financial",    fullLabel: "Financial Actions",            icon: DollarSign,   color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
  { id: "staffing",   label: "Staffing",     fullLabel: "Staffing & Capacity",          icon: Users,        color: "text-violet-600 dark:text-violet-400",   bg: "bg-violet-50 dark:bg-violet-900/30" },
  { id: "tasks",      label: "My Tasks",     fullLabel: "My Tasks",                     icon: ClipboardList,color: "text-slate-600 dark:text-slate-400",     bg: "bg-slate-50 dark:bg-slate-900/30"   },
  { id: "driver_ops", label: "Driver Ops",   fullLabel: "Driver Operations",            icon: Car,          color: "text-orange-600 dark:text-orange-400",   bg: "bg-orange-50 dark:bg-orange-900/30" },
  { id: "compliance", label: "Compliance",   fullLabel: "Compliance Review Queue",      icon: FileWarning,  color: "text-rose-600 dark:text-rose-400",       bg: "bg-rose-50 dark:bg-rose-900/30"   },
] as const;

type CategoryId = typeof CATEGORIES[number]["id"];

const DEFAULT_VISIBLE = 7;

// ── Priority Helpers ──────────────────────────────────────────────────────────

function priorityConfig(priority: string, effectivePriority: number) {
  const name = effectivePriority === 0 ? "critical" : effectivePriority === 1 ? "high" : priority;
  switch (name) {
    case "critical": return { label: "Critical", icon: ShieldAlert, border: "border-l-red-500",   text: "text-red-600 dark:text-red-400"     };
    case "high":     return { label: "High",     icon: ArrowUp,     border: "border-l-amber-500", text: "text-amber-600 dark:text-amber-400" };
    case "normal":   return { label: "Normal",   icon: Circle,      border: "border-l-blue-400",  text: "text-blue-500 dark:text-blue-400"   };
    default:         return { label: "Low",      icon: Minus,       border: "border-l-border",    text: "text-muted-foreground"              };
  }
}

function statusBorder(status: string): string {
  if (status === "in_progress") return "border-l-amber-400";
  return "";
}

function ageLabel(ageHours: number): string {
  if (ageHours < 1) return "Just now";
  if (ageHours < 24) return `${ageHours}h ago`;
  return `${Math.floor(ageHours / 24)}d ago`;
}

function parseUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    category: (params.get("category") || "accounts") as CategoryId,
    highlight: params.get("highlight"),
  };
}

// ── Snooze Options ────────────────────────────────────────────────────────────

function getSnoozeUntil(option: string, custom?: string): Date {
  const now = new Date();
  switch (option) {
    case "later_today": return addHours(now, 4);
    case "tomorrow":    return startOfDay(addDays(now, 1));
    case "3days":       return startOfDay(addDays(now, 3));
    case "next_week":   return startOfDay(addDays(now, 7));
    case "custom":      return custom ? new Date(custom) : addDays(now, 1);
    default:            return addDays(now, 1);
  }
}

// ── Snooze Modal ──────────────────────────────────────────────────────────────

function SnoozeModal({
  item,
  onClose,
  onConfirm,
  isPending,
}: {
  item: WorkPlanItem;
  onClose: () => void;
  onConfirm: (snoozeUntil: Date) => void;
  isPending: boolean;
}) {
  const [selected, setSelected] = useState<string>("tomorrow");
  const [customDate, setCustomDate] = useState<string>("");
  const remaining = 3 - (item.snoozeCount || 0);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellOff className="h-4 w-4 text-muted-foreground" />
            Snooze Item
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <strong>{item.recordName}</strong> — {item.reason}
          </p>
          {remaining <= 1 && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {remaining === 1 ? "This is your last snooze for this item." : "No more snoozes available."}
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: "later_today", label: "Later Today" },
              { value: "tomorrow",    label: "Tomorrow" },
              { value: "3days",       label: "In 3 Days" },
              { value: "next_week",   label: "Next Week" },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setSelected(opt.value)}
                data-testid={`snooze-option-${opt.value}`}
                className={`p-2.5 rounded-md border text-sm text-left transition-all hover-elevate ${
                  selected === opt.value
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            <button
              onClick={() => setSelected("custom")}
              data-testid="snooze-option-custom"
              className={`w-full p-2.5 rounded-md border text-sm text-left transition-all hover-elevate ${
                selected === "custom"
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border"
              }`}
            >
              Custom Date
            </button>
            {selected === "custom" && (
              <Input
                type="date"
                value={customDate}
                onChange={e => setCustomDate(e.target.value)}
                className="mt-1"
                data-testid="input-snooze-custom-date"
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground">{remaining} snooze{remaining !== 1 ? "s" : ""} remaining</p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onConfirm(getSnoozeUntil(selected, customDate))}
            disabled={isPending || remaining <= 0}
            data-testid="button-snooze-confirm"
          >
            {isPending ? "Snoozing..." : "Snooze"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Reassign Modal ────────────────────────────────────────────────────────────

function ReassignModal({
  item,
  onClose,
  onConfirm,
  isPending,
}: {
  item: WorkPlanItem;
  onClose: () => void;
  onConfirm: (userId: string) => void;
  isPending: boolean;
}) {
  const [userId, setUserId] = useState("");
  const { data: users } = useQuery<CorporateUser[]>({
    queryKey: ["/api/users?role=corporate"],
    staleTime: 60_000,
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-muted-foreground" />
            Reassign Item
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Reassign <strong>{item.recordName}</strong> to another team member.
          </p>
          <div className="space-y-1.5">
            <Label>Assign To</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger data-testid="select-reassign-user">
                <SelectValue placeholder="Select user..." />
              </SelectTrigger>
              <SelectContent>
                {(users || []).map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => userId && onConfirm(userId)}
            disabled={isPending || !userId}
            data-testid="button-reassign-confirm"
          >
            {isPending ? "Reassigning..." : "Reassign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Activity helpers ──────────────────────────────────────────────────────────

function activityActionLabel(action: string): string {
  switch (action) {
    case "task_created":  return "created this task";
    case "completed":     return "marked task as Completed";
    case "note_added":    return "added a comment";
    case "task_updated":  return "updated task";
    case "status_changed":return "changed status";
    case "reassigned":    return "reassigned this task";
    case "canceled":      return "canceled this task";
    case "snoozed":       return "snoozed this task";
    case "created":       return "created this task";
    default:              return action.replace(/_/g, " ");
  }
}

type ActivityIconDef = { icon: React.ElementType; color: string; bg: string };

function activityIconDef(action: string): ActivityIconDef {
  switch (action) {
    case "task_created":
    case "created":
      return { icon: Plus,          color: "text-blue-600 dark:text-blue-400",   bg: "bg-blue-100 dark:bg-blue-900/40"   };
    case "completed":
      return { icon: CheckCircle2,  color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/40" };
    case "note_added":
      return { icon: MessageSquare, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-100 dark:bg-violet-900/40" };
    case "task_updated":
      return { icon: RefreshCw,     color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/40" };
    case "status_changed":
      return { icon: Activity,      color: "text-sky-600 dark:text-sky-400",     bg: "bg-sky-100 dark:bg-sky-900/40"     };
    case "reassigned":
      return { icon: UserCheck,     color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-100 dark:bg-indigo-900/40" };
    case "canceled":
      return { icon: XCircle,       color: "text-red-600 dark:text-red-400",     bg: "bg-red-100 dark:bg-red-900/40"     };
    case "snoozed":
      return { icon: BellOff,       color: "text-muted-foreground",              bg: "bg-muted"                           };
    default:
      return { icon: Activity,      color: "text-muted-foreground",              bg: "bg-muted"                           };
  }
}

// ── Add Note Modal ────────────────────────────────────────────────────────────

function AddNoteModal({
  item,
  onClose,
  defaultTab = "notes",
}: {
  item: WorkPlanItem;
  onClose: () => void;
  defaultTab?: "notes" | "activity";
}) {
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [activeTab, setActiveTab] = useState<"notes" | "activity">(defaultTab);
  const activityEndRef = useRef<HTMLDivElement>(null);

  const { data: notes = [], isLoading: notesLoading } = useQuery<TaskNote[]>({
    queryKey: ["/api/work-plan-items", item.id, "notes"],
    staleTime: 0,
  });

  const { data: activity = [], isLoading: activityLoading } = useQuery<TaskActivityEntry[]>({
    queryKey: ["/api/work-plan-items", item.id, "activity"],
    staleTime: 0,
  });

  // Scroll to bottom of activity list when it loads or tab switches
  useEffect(() => {
    if (activeTab === "activity" && activityEndRef.current) {
      activityEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeTab, activity.length]);

  const addNoteMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/work-plan-items/${item.id}/notes`, { note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-plan-items", item.id, "notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-plan-items", item.id, "activity"] });
      setNote("");
      toast({ title: "Comment added" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add comment", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{item.recordName}</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground pt-0.5 truncate">{item.reason}</p>
        </DialogHeader>

        {/* Tab toggle */}
        <div className="flex border-b border-border -mt-1">
          <button
            onClick={() => setActiveTab("notes")}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${activeTab === "notes" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            data-testid="tab-notes"
          >
            <MessageSquare className="h-3 w-3" />
            Comments {notes.length > 0 && `(${notes.length})`}
          </button>
          <button
            onClick={() => setActiveTab("activity")}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${activeTab === "activity" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            data-testid="tab-activity"
          >
            <Activity className="h-3 w-3" />
            Activity {activity.length > 0 && `(${activity.length})`}
          </button>
        </div>

        <div className="min-h-[180px]">
          {activeTab === "notes" ? (
            <div className="space-y-3">
              {notesLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : notes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No comments yet. Add one below.</p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {notes.map(n => (
                    <div key={n.id} className="p-2.5 rounded-md bg-muted/40 border border-border">
                      <p className="text-sm leading-snug">{n.note}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {n.authorName?.trim() || "Unknown"} · {format(new Date(n.createdAt), "MMM d, h:mm a")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {/* Add comment input */}
              <div className="space-y-2 border-t border-border pt-3">
                <Textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Write a comment..."
                  rows={2}
                  data-testid="input-task-note"
                  onKeyDown={e => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && note.trim()) {
                      addNoteMutation.mutate();
                    }
                  }}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Ctrl+Enter to submit</span>
                  <Button
                    size="sm"
                    onClick={() => addNoteMutation.mutate()}
                    disabled={addNoteMutation.isPending || !note.trim()}
                    data-testid="button-add-note-submit"
                  >
                    {addNoteMutation.isPending ? "Saving..." : "Add Comment"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              {activityLoading ? (
                <div className="space-y-3 pt-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : activity.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No activity recorded yet.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-0 pr-1">
                  {activity.map((entry, idx) => {
                    const def = activityIconDef(entry.action);
                    const IconComp = def.icon;
                    const ts = new Date(entry.createdAt);
                    const timeStr = format(ts, "h:mm a");
                    const dateStr = isToday(ts) ? "Today" : format(ts, "MMM d");
                    return (
                      <div key={entry.id} className="flex gap-3 py-3 border-b border-border/60 last:border-0">
                        {/* Timeline icon + connector */}
                        <div className="flex flex-col items-center shrink-0">
                          <div className={`h-7 w-7 rounded-full flex items-center justify-center ${def.bg}`}>
                            <IconComp className={`h-3.5 w-3.5 ${def.color}`} />
                          </div>
                          {idx < activity.length - 1 && (
                            <div className="w-px flex-1 bg-border/60 mt-1 min-h-[8px]" />
                          )}
                        </div>
                        {/* Content */}
                        <div className="flex-1 min-w-0 pb-1">
                          {/* Main line: "[time] Name action phrase" */}
                          <p className="text-sm leading-snug">
                            <span className="font-mono text-[11px] text-muted-foreground mr-1.5">[{timeStr}]</span>
                            <span className="font-medium">{entry.actorName || "Unknown"}</span>
                            {" "}
                            <span>{activityActionLabel(entry.action)}</span>
                          </p>
                          {/* Inline note/comment */}
                          {entry.note && (
                            <p className="text-xs text-muted-foreground mt-1 italic border-l-2 border-border pl-2 ml-0.5">
                              "{entry.note}"
                            </p>
                          )}
                          {/* Date line */}
                          <p className="text-[10px] text-muted-foreground mt-0.5">{dateStr}</p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={activityEndRef} />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Driver Ops Event Type Config ──────────────────────────────────────────────

const DRIVER_OPS_TYPES: Record<string, { label: string; taskType: string; color: string; priorityLabel: string }> = {
  mvr_expired:      { label: "MVR Expired",      taskType: "MVR",        color: "text-red-600 dark:text-red-400",    priorityLabel: "High"   },
  mvr_expiring_soon:{ label: "MVR Expiring",     taskType: "MVR",        color: "text-amber-600 dark:text-amber-400", priorityLabel: "Low"    },
  not_clocked_in:   { label: "Not Clocked In",   taskType: "Attendance", color: "text-amber-600 dark:text-amber-400", priorityLabel: "Medium" },
  late_driver:      { label: "Late Today",        taskType: "Attendance", color: "text-amber-600 dark:text-amber-400", priorityLabel: "Medium" },
  no_show:          { label: "No Show",           taskType: "Attendance", color: "text-red-600 dark:text-red-400",    priorityLabel: "High"   },
};

// ── Driver Ops Table ──────────────────────────────────────────────────────────

function DriverOpsTable({
  items,
  highlightId,
  onComplete,
  onSnooze,
  onReassign,
  onAddNote,
  onMarkInProgress,
  completingId,
  users,
  teams,
}: {
  items: WorkPlanItem[];
  highlightId: string | null;
  onComplete: (id: string) => void;
  onSnooze: (item: WorkPlanItem) => void;
  onReassign: (item: WorkPlanItem) => void;
  onAddNote: (item: WorkPlanItem, tab?: "notes" | "activity") => void;
  onMarkInProgress: (id: string) => void;
  completingId: string | null;
  users: CorporateUser[];
  teams: Team[];
}) {
  const [search, setSearch] = useState("");
  const [taskTypeFilter, setTaskTypeFilter] = useState("all");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");

  // Filter
  const filtered = items.filter(item => {
    if (taskTypeFilter !== "all" && item.taskType !== taskTypeFilter) return false;
    if (eventTypeFilter !== "all" && item.eventType !== eventTypeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!item.recordName.toLowerCase().includes(q) && !item.reason.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Group by effective priority
  const high   = filtered.filter(i => i.effectivePriority <= 1);
  const medium = filtered.filter(i => i.effectivePriority === 2);
  const low    = filtered.filter(i => i.effectivePriority >= 3);

  const groups: { label: string; items: WorkPlanItem[]; accent: string; bg: string }[] = [
    { label: "High Priority",   items: high,   accent: "text-red-600 dark:text-red-400",    bg: "bg-red-50 dark:bg-red-900/20"    },
    { label: "Medium Priority", items: medium, accent: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20" },
    { label: "Low Priority",    items: low,    accent: "text-slate-600 dark:text-slate-400", bg: "bg-muted/60"                     },
  ].filter(g => g.items.length > 0);

  return (
    <Card data-testid="category-driver_ops">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center justify-between gap-2 flex-wrap">
          <span className="flex items-center gap-2">
            <span className="flex items-center justify-center h-6 w-6 rounded bg-orange-50 dark:bg-orange-900/30">
              <Car className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
            </span>
            <span className="text-foreground">Driver Operations</span>
            <Badge
              className={`text-xs no-default-active-elevate ${items.length > 0 ? "bg-primary/15 text-primary border-primary/20" : "bg-muted text-muted-foreground"}`}
              variant="outline"
            >
              {items.length}
            </Badge>
          </span>
        </CardTitle>

        {/* Filters */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search drivers..."
              className="pl-8 h-8 text-xs"
              data-testid="input-driver-ops-search"
            />
          </div>
          <Select value={taskTypeFilter} onValueChange={setTaskTypeFilter}>
            <SelectTrigger className="h-8 text-xs w-32" data-testid="select-task-type-filter">
              <SelectValue placeholder="Task Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="MVR">MVR</SelectItem>
              <SelectItem value="Attendance">Attendance</SelectItem>
            </SelectContent>
          </Select>
          <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
            <SelectTrigger className="h-8 text-xs w-40" data-testid="select-event-type-filter">
              <SelectValue placeholder="Issue Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Issues</SelectItem>
              <SelectItem value="mvr_expired">MVR Expired</SelectItem>
              <SelectItem value="mvr_expiring_soon">MVR Expiring</SelectItem>
              <SelectItem value="not_clocked_in">Not Clocked In</SelectItem>
              <SelectItem value="late_driver">Late Today</SelectItem>
              <SelectItem value="no_show">No Show</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Summary badges */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {Object.entries(DRIVER_OPS_TYPES).map(([et, cfg]) => {
            const count = items.filter(i => i.eventType === et).length;
            if (count === 0) return null;
            return (
              <button
                key={et}
                onClick={() => setEventTypeFilter(eventTypeFilter === et ? "all" : et)}
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full border transition-colors ${
                  eventTypeFilter === et
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground border-border hover:border-foreground/30"
                }`}
                data-testid={`badge-${et}`}
              >
                {cfg.label}: {count}
              </button>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 justify-center">
            <FileWarning className="h-6 w-6 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {items.length === 0 ? "No driver ops tasks — run Sync to generate." : "No items match your filters."}
            </p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className={`grid ${GRID_COLS} border-t border-border bg-muted/40 px-0`}>
              <div className="py-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-center">Priority</div>
              <div className="py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Driver</div>
              <div className="py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Issue</div>
              <div className="py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Status</div>
              <div className="py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Owner</div>
              <div className="py-1.5 pr-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-right">Actions</div>
            </div>

            {groups.map(group => (
              <div key={group.label}>
                {/* Group header */}
                <div className={`flex items-center gap-2 px-4 py-1.5 border-b border-border ${group.bg}`}>
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${group.accent}`}>
                    {group.label}
                  </span>
                  <span className={`text-[10px] font-medium ${group.accent} opacity-70`}>
                    {group.items.length} item{group.items.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {group.items.map(item => (
                  <WorkItemTableRow
                    key={item.id}
                    item={item}
                    highlightId={highlightId}
                    onComplete={onComplete}
                    onSnooze={onSnooze}
                    onReassign={onReassign}
                    onAddNote={onAddNote}
                    onMarkInProgress={onMarkInProgress}
                    isCompleting={completingId === item.id}
                    users={users}
                    teams={teams}
                  />
                ))}
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Create Task Modal ─────────────────────────────────────────────────────────

function CreateTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [recordName, setRecordName] = useState("");
  const [reason, setReason] = useState("");
  const [priority, setPriority] = useState("normal");
  const [taskType, setTaskType] = useState("Follow-Up");
  const [dueDate, setDueDate] = useState("");

  const createMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/work-plan-items", {
        recordName,
        reason,
        priority,
        category: "tasks",
        dueDate: dueDate || undefined,
        eventType: "manual_task",
        taskType,
        sourceModule: "manual",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-plan-items"] });
      toast({ title: "Task created" });
      onCreated();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create task", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-muted-foreground" />
            New Task
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Task Name</Label>
            <Input
              value={recordName}
              onChange={e => setRecordName(e.target.value)}
              placeholder="What needs to be done?"
              data-testid="input-task-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Details / Reason</Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="More context..."
              rows={2}
              data-testid="input-task-reason"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Task Type</Label>
              <Select value={taskType} onValueChange={setTaskType}>
                <SelectTrigger data-testid="select-task-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Follow-Up","Review","Approval","Documentation","Collection","Escalation","Compliance","Capacity","Touch","Implementation"].map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="select-task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Due Date</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              data-testid="input-task-due-date"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !recordName.trim() || !reason.trim()}
            data-testid="button-create-task-submit"
          >
            {createMutation.isPending ? "Creating..." : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Grid column definition ────────────────────────────────────────────────────
// Priority | Item | Reason | Due Date | Owner / Team | Actions (6 icons)
const GRID_COLS = "grid-cols-[68px_1fr_1fr_96px_116px_172px]";

// ── Work Item Table Row ───────────────────────────────────────────────────────

function WorkItemTableRow({
  item,
  highlightId,
  onComplete,
  onSnooze,
  onReassign,
  onAddNote,
  onMarkInProgress,
  isCompleting,
  users,
  teams,
}: {
  item: WorkPlanItem;
  highlightId: string | null;
  onComplete: (id: string) => void;
  onSnooze: (item: WorkPlanItem) => void;
  onReassign: (item: WorkPlanItem) => void;
  onAddNote: (item: WorkPlanItem, tab?: "notes" | "activity") => void;
  onMarkInProgress: (id: string) => void;
  isCompleting: boolean;
  users: CorporateUser[];
  teams: Team[];
}) {
  const isHighlighted = highlightId && (item.id === highlightId || item.recordId === highlightId);
  const rowRef = useRef<HTMLDivElement>(null);
  const pc = priorityConfig(item.priority, item.effectivePriority);
  const PriorityIcon = pc.icon;

  const assignee = item.assignedUserId ? users.find(u => u.id === item.assignedUserId) : null;
  const assigneeLabel = assignee ? `${assignee.firstName} ${assignee.lastName}` : null;
  const teamLabel = !assigneeLabel && item.assignedTeamId
    ? (teams.find(t => t.id === item.assignedTeamId)?.name ?? null)
    : null;

  const isOverdue = item.dueDate && isBefore(parseDateSafe(item.dueDate), new Date()) && item.status !== "snoozed";
  const isDueToday = item.dueDate && isToday(parseDateSafe(item.dueDate));
  const isSnoozed = item.status === "snoozed";
  const isInProgress = item.status === "in_progress";
  const isAging = item.ageHours > 48;

  const borderClass = isInProgress ? "border-l-amber-400" : pc.border;

  useEffect(() => {
    if (isHighlighted && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isHighlighted]);

  return (
    <div
      ref={rowRef}
      data-testid={`work-item-${item.id}`}
      className={[
        `grid ${GRID_COLS} items-center gap-0 border-b border-border last:border-0 transition-colors`,
        "border-l-4",
        borderClass,
        isHighlighted
          ? "bg-amber-50/60 dark:bg-amber-900/20 ring-1 ring-inset ring-amber-400/60"
          : isInProgress
            ? "bg-amber-50/30 dark:bg-amber-900/10"
            : "hover:bg-muted/40",
        isCompleting ? "opacity-60 pointer-events-none" : "",
      ].join(" ")}
    >
      {/* Priority */}
      <div className="flex flex-col items-center justify-center px-2 py-2.5 gap-0.5">
        <PriorityIcon className={`h-3.5 w-3.5 shrink-0 ${pc.text}`} />
        <span className={`text-[10px] font-medium leading-none ${pc.text}`}>{pc.label}</span>
        {isAging && (
          <span className="text-[9px] font-semibold text-orange-500 dark:text-orange-400 leading-none mt-0.5">Aging</span>
        )}
      </div>

      {/* Item */}
      <div className="py-2.5 pr-3 min-w-0">
        <p className="text-sm font-medium leading-tight truncate" data-testid={`text-item-name-${item.id}`}>
          {item.recordName}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {ageLabel(item.ageHours)}
          {item.taskType && (
            <span className="ml-1.5 text-muted-foreground/70">· {item.taskType}</span>
          )}
          {item.snoozeCount > 0 && (
            <span className="ml-1.5 text-muted-foreground/60">· Snoozed {item.snoozeCount}×</span>
          )}
        </p>
      </div>

      {/* Reason */}
      <div className="py-2.5 pr-3 min-w-0">
        <p className="text-xs text-muted-foreground leading-snug line-clamp-2" data-testid={`text-item-reason-${item.id}`}>
          {item.reason || "—"}
        </p>
      </div>

      {/* Due Date / Status */}
      <div className="py-2.5 pr-2 flex flex-col gap-0.5">
        {isInProgress ? (
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
            <Play className="h-3 w-3 shrink-0" />
            In Progress
          </span>
        ) : isSnoozed && item.snoozeUntil ? (
          <Badge className="text-[10px] bg-muted text-muted-foreground w-fit no-default-active-elevate">
            Until {format(new Date(item.snoozeUntil), "MMM d")}
          </Badge>
        ) : isOverdue ? (
          <span className="text-xs font-semibold text-red-500 dark:text-red-400 flex items-center gap-0.5">
            <CalendarX className="h-3 w-3 shrink-0" />
            Overdue
          </span>
        ) : isDueToday ? (
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
            <Clock className="h-3 w-3 shrink-0" />
            Today
          </span>
        ) : item.dueDate ? (
          <span className="text-xs text-muted-foreground">
            {format(parseDateSafe(item.dueDate), "MMM d")}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </div>

      {/* Owner / Team */}
      <div className="py-2.5 pr-2 min-w-0">
        {assigneeLabel ? (
          <span className="text-xs text-foreground truncate block" data-testid={`text-item-owner-${item.id}`}>
            {assigneeLabel}
          </span>
        ) : teamLabel ? (
          <span className="text-xs text-muted-foreground truncate block italic" data-testid={`text-item-team-${item.id}`}>
            {teamLabel}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/40">Unassigned</span>
        )}
      </div>

      {/* Actions: Open | In Progress | Snooze | Reassign | Note | Complete */}
      <div className="py-2 pr-2 flex items-center justify-end gap-0.5 shrink-0">
        {item.recordUrl ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <a href={item.recordUrl} target="_blank" rel="noopener noreferrer" data-testid={`button-open-record-${item.id}`}>
                <Button size="icon" variant="ghost" className="h-7 w-7">
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </a>
            </TooltipTrigger>
            <TooltipContent side="top">Open Record</TooltipContent>
          </Tooltip>
        ) : (
          <div className="h-7 w-7" />
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className={`h-7 w-7 ${isInProgress ? "text-amber-500 dark:text-amber-400" : ""}`}
              disabled={isInProgress}
              onClick={() => onMarkInProgress(item.id)}
              data-testid={`button-in-progress-${item.id}`}
            >
              <Play className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{isInProgress ? "Already in progress" : "Mark In Progress"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={item.snoozeCount >= 3}
              onClick={() => onSnooze(item)}
              data-testid={`button-snooze-${item.id}`}
            >
              <BellOff className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{item.snoozeCount >= 3 ? "No snoozes left" : `Snooze (${3 - item.snoozeCount} left)`}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => onReassign(item)}
              data-testid={`button-reassign-${item.id}`}
            >
              <UserCheck className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Reassign</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => onAddNote(item, "notes")}
              data-testid={`button-add-note-${item.id}`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Add Comment</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-sky-600 dark:text-sky-400"
              onClick={() => onAddNote(item, "activity")}
              data-testid={`button-view-activity-${item.id}`}
            >
              <Activity className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">View Activity</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-emerald-600 dark:text-emerald-400"
              disabled={isCompleting}
              onClick={() => onComplete(item.id)}
              data-testid={`button-complete-${item.id}`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Mark Complete</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

// ── Category Table ────────────────────────────────────────────────────────────

function CategoryTable({
  cat,
  items,
  highlightId,
  onComplete,
  onSnooze,
  onReassign,
  onAddNote,
  onMarkInProgress,
  completingId,
  onCreateTask,
  users,
  teams,
}: {
  cat: typeof CATEGORIES[number];
  items: WorkPlanItem[];
  highlightId: string | null;
  onComplete: (id: string) => void;
  onSnooze: (item: WorkPlanItem) => void;
  onReassign: (item: WorkPlanItem) => void;
  onAddNote: (item: WorkPlanItem, tab?: "notes" | "activity") => void;
  onMarkInProgress: (id: string) => void;
  completingId: string | null;
  onCreateTask?: () => void;
  users: CorporateUser[];
  teams: Team[];
}) {
  const Icon = cat.icon;
  const [showAll, setShowAll] = useState(false);

  const highlightedIdx = highlightId
    ? items.findIndex(i => i.id === highlightId || i.recordId === highlightId)
    : -1;

  const visibleItems = showAll
    ? items
    : items.slice(0, highlightedIdx >= DEFAULT_VISIBLE ? highlightedIdx + 1 : DEFAULT_VISIBLE);

  const hiddenCount = items.length - visibleItems.length;

  return (
    <Card data-testid={`category-${cat.id}`}>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center justify-between gap-2 flex-wrap">
          <span className="flex items-center gap-2">
            <span className={`flex items-center justify-center h-6 w-6 rounded ${cat.bg}`}>
              <Icon className={`h-3.5 w-3.5 ${cat.color}`} />
            </span>
            <span className="text-foreground">{cat.fullLabel}</span>
            <Badge
              className={`text-xs no-default-active-elevate ${items.length > 0 ? "bg-primary/15 text-primary border-primary/20" : "bg-muted text-muted-foreground"}`}
              variant="outline"
            >
              {items.length}
            </Badge>
          </span>
          {cat.id === "tasks" && onCreateTask && (
            <Button size="sm" variant="outline" onClick={onCreateTask} data-testid="button-create-task-header">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New Task
            </Button>
          )}
        </CardTitle>
      </CardHeader>

      {/* Table Header */}
      {items.length > 0 && (
        <div className={`grid ${GRID_COLS} border-t border-border bg-muted/40 px-0`}>
          <div className="py-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-center">Priority</div>
          <div className="py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Item</div>
          <div className="py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Reason</div>
          <div className="py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Due / Status</div>
          <div className="py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Owner / Team</div>
          <div className="py-1.5 pr-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-right">Actions</div>
        </div>
      )}

      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="flex items-center gap-2 py-8 justify-center">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <p className="text-sm text-muted-foreground">All clear — no items here.</p>
          </div>
        ) : (
          <>
            <div>
              {visibleItems.map(item => (
                <WorkItemTableRow
                  key={item.id}
                  item={item}
                  highlightId={highlightId}
                  onComplete={onComplete}
                  onSnooze={onSnooze}
                  onReassign={onReassign}
                  onAddNote={onAddNote}
                  onMarkInProgress={onMarkInProgress}
                  isCompleting={completingId === item.id}
                  users={users}
                  teams={teams}
                />
              ))}
            </div>
            {items.length > DEFAULT_VISIBLE && (
              <button
                onClick={() => setShowAll(prev => !prev)}
                data-testid={`button-view-all-${cat.id}`}
                className="w-full flex items-center justify-center gap-1.5 py-2 border-t border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                {showAll ? (
                  <><ChevronUp className="h-3.5 w-3.5" />Collapse</>
                ) : (
                  <><ChevronDown className="h-3.5 w-3.5" />View All ({hiddenCount} more)</>
                )}
              </button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-6 rounded" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-6 rounded-full" />
        </div>
      </CardHeader>
      <div className="border-t border-border bg-muted/40 h-7" />
      <CardContent className="p-0">
        {[...Array(3)].map((_, i) => (
          <div key={i} className={`grid ${GRID_COLS} items-center border-b border-border last:border-0 border-l-4 border-l-border`}>
            <div className="py-2.5 px-2 flex flex-col items-center gap-1">
              <Skeleton className="h-3.5 w-3.5 rounded" />
              <Skeleton className="h-2.5 w-10" />
            </div>
            <div className="py-2.5 pr-3 space-y-1.5">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-2.5 w-1/3" />
            </div>
            <div className="py-2.5 pr-3">
              <Skeleton className="h-3 w-4/5" />
            </div>
            <div className="py-2.5 pr-2">
              <Skeleton className="h-3 w-14" />
            </div>
            <div className="py-2.5 pr-2">
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="py-2 pr-2 flex justify-end gap-0.5">
              {[...Array(6)].map((_, j) => <Skeleton key={j} className="h-7 w-7 rounded-md" />)}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Summary Stat Card ─────────────────────────────────────────────────────────

type StatFilter = "critical" | "due-today" | "overdue" | null;

function SummaryStatCard({
  icon: Icon,
  label,
  value,
  accent,
  isLoading,
  testId,
  onClick,
  isActive,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  accent: string;
  isLoading: boolean;
  testId: string;
  onClick?: () => void;
  isActive?: boolean;
}) {
  return (
    <div
      data-testid={testId}
      onClick={onClick}
      className={[
        "flex items-center gap-3 rounded-md border bg-card px-4 py-3 transition-all",
        onClick ? "cursor-pointer hover-elevate" : "",
        isActive ? "ring-2 ring-primary border-primary/50" : "border-border",
      ].join(" ")}
    >
      <Icon className={`h-4 w-4 shrink-0 ${accent}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground font-medium leading-none mb-1">{label}</p>
        <p className={`text-xl font-bold leading-none ${value > 0 ? accent : "text-muted-foreground"}`}>
          {isLoading ? "—" : value}
        </p>
      </div>
      {onClick && (
        <div className="text-[10px] text-muted-foreground flex items-center gap-0.5 shrink-0">
          {isActive
            ? <><ChevronUp className="h-3 w-3" />Hide</>
            : <><ChevronDown className="h-3 w-3" />View</>}
        </div>
      )}
    </div>
  );
}

// ── My Work Plan View ─────────────────────────────────────────────────────────

const TASK_TYPE_LABELS: Record<string, string> = {
  mvr_expired:       "Expired MVR",
  mvr_expiring:      "MVR Expiring",
  attendance:        "Attendance",
  late_driver:       "Late Driver",
  no_show:           "No Show",
  risk_review:       "Risk Review",
  compliance_review: "Compliance",
  license_review:    "License Review",
  manual:            "Manual Task",
  notification:      "Notification",
};

function overdueThreshold(priority: string): number {
  if (priority === "critical") return 2;
  if (priority === "high")     return 8;
  return 24;
}

function isOverdue(item: WorkPlanItem): boolean {
  if (item.dueDate) return isBefore(parseDateSafe(item.dueDate), new Date());
  return item.ageHours >= overdueThreshold(item.priority);
}

function MyWorkPlanTaskCard({
  item,
  onComplete,
  onMarkInProgress,
  onAddNote,
  isCompleting,
}: {
  item: WorkPlanItem;
  onComplete: (id: string) => void;
  onMarkInProgress: (id: string) => void;
  onAddNote: (item: WorkPlanItem, tab?: "notes" | "activity") => void;
  isCompleting: boolean;
}) {
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const pc = priorityConfig(item.priority, item.effectivePriority);
  const PIcon = pc.icon;
  const overdue = isOverdue(item);
  const inProgress = item.status === "in_progress";

  const borderColor = overdue
    ? "border-l-red-500"
    : inProgress
    ? "border-l-amber-400"
    : pc.border;

  async function submitComment() {
    if (!commentText.trim()) return;
    setIsSubmitting(true);
    try {
      await apiRequest("POST", `/api/work-plan-items/${item.id}/notes`, { note: commentText.trim() });
      queryClient.invalidateQueries({ queryKey: [`/api/work-plan-items/${item.id}/notes`] });
      queryClient.invalidateQueries({ queryKey: [`/api/work-plan-items/${item.id}/activity`] });
      toast({ title: "Comment added" });
      setCommentText("");
      setCommentOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to add comment", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  const taskTypeLabel = TASK_TYPE_LABELS[item.taskType ?? item.eventType] ?? item.taskType ?? item.eventType;

  return (
    <Card
      className={`border-l-4 ${borderColor} ${overdue ? "bg-red-50/30 dark:bg-red-900/10" : ""}`}
      data-testid={`my-task-card-${item.id}`}
    >
      <CardContent className="p-4 space-y-3">
        {/* Top row: priority + title + status badge + overdue chip */}
        <div className="flex items-start gap-3 flex-wrap">
          <div className={`flex items-center gap-1 shrink-0 mt-0.5 ${pc.text}`}>
            <PIcon className="h-3.5 w-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wide">{pc.label}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-snug truncate" data-testid={`text-driver-name-${item.id}`}>
              {item.recordName}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.reason}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {overdue && (
              <Badge variant="outline" className="text-[10px] text-red-600 dark:text-red-400 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 no-default-active-elevate">
                Overdue
              </Badge>
            )}
            <Badge
              variant="outline"
              className={`text-[10px] no-default-active-elevate ${inProgress ? "border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20" : "bg-muted text-muted-foreground"}`}
            >
              {inProgress ? "In Progress" : "Open"}
            </Badge>
          </div>
        </div>

        {/* Meta row: task type + account + age */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <ClipboardList className="h-3 w-3" />
            {taskTypeLabel}
          </span>
          {(item.accountName || item.sourceModule) && (
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {item.accountName ?? item.sourceModule}
            </span>
          )}
          <span className="flex items-center gap-1 ml-auto">
            <Clock className="h-3 w-3" />
            {ageLabel(item.ageHours)}
            <span className="text-[10px] text-muted-foreground/60">
              · {format(parseDateSafe(item.createdAt), "MMM d, h:mm a")}
            </span>
          </span>
        </div>

        {/* Action row */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-border flex-wrap">
          {/* Mark Complete */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                disabled={isCompleting}
                onClick={() => onComplete(item.id)}
                data-testid={`button-my-complete-${item.id}`}
                className="text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 h-7 px-2.5 text-xs"
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Complete
              </Button>
            </TooltipTrigger>
            <TooltipContent>Mark as complete</TooltipContent>
          </Tooltip>

          {/* Toggle In Progress */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                onClick={() => !inProgress ? onMarkInProgress(item.id) : undefined}
                data-testid={`button-my-inprogress-${item.id}`}
                className={`h-7 px-2.5 text-xs ${inProgress ? "text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700" : "text-muted-foreground"}`}
              >
                <Play className="h-3.5 w-3.5 mr-1" />
                {inProgress ? "In Progress" : "Start"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{inProgress ? "Already in progress" : "Mark in progress"}</TooltipContent>
          </Tooltip>

          {/* Inline comment toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={commentOpen ? "default" : "ghost"}
                onClick={() => setCommentOpen(v => !v)}
                data-testid={`button-my-comment-${item.id}`}
                className="h-7 px-2.5 text-xs"
              >
                <MessageSquare className="h-3.5 w-3.5 mr-1" />
                Comment
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add inline comment</TooltipContent>
          </Tooltip>

          {/* View Activity */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onAddNote(item, "activity")}
                data-testid={`button-my-activity-${item.id}`}
                className="h-7 px-2.5 text-xs text-sky-600 dark:text-sky-400"
              >
                <Activity className="h-3.5 w-3.5 mr-1" />
                History
              </Button>
            </TooltipTrigger>
            <TooltipContent>View audit trail</TooltipContent>
          </Tooltip>

          {/* Open Driver */}
          {item.recordUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => window.open(item.recordUrl!, "_blank")}
                  data-testid={`button-my-open-driver-${item.id}`}
                  className="h-7 px-2.5 text-xs ml-auto"
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  Open Driver
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open driver detail</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Inline comment box */}
        {commentOpen && (
          <div className="space-y-2 pt-1">
            <Textarea
              placeholder="Add a comment..."
              className="text-sm resize-none min-h-[72px]"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              data-testid={`textarea-inline-comment-${item.id}`}
            />
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setCommentOpen(false); setCommentText(""); }}
                className="h-7 px-2.5 text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!commentText.trim() || isSubmitting}
                onClick={submitComment}
                className="h-7 px-2.5 text-xs"
                data-testid={`button-submit-comment-${item.id}`}
              >
                {isSubmitting ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type MyStatFilter = "overdue" | "high-priority" | "in-progress" | null;

function MyWorkPlanView({
  items,
  isLoading,
  onComplete,
  onMarkInProgress,
  onAddNote,
  completingId,
}: {
  items: WorkPlanItem[];
  isLoading: boolean;
  onComplete: (id: string) => void;
  onMarkInProgress: (id: string) => void;
  onAddNote: (item: WorkPlanItem, tab?: "notes" | "activity") => void;
  completingId: string | null;
}) {
  const [filterType, setFilterType] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterAccount, setFilterAccount] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("active");
  const [search, setSearch] = useState<string>("");
  const [myStatFilter, setMyStatFilter] = useState<MyStatFilter>(null);

  // Collect unique task types and accounts for filter dropdowns
  const taskTypes = Array.from(new Set(items.map(i => i.taskType || i.eventType).filter(Boolean)));
  const accounts  = Array.from(new Set(items.map(i => i.accountName || i.sourceModule).filter(Boolean))) as string[];

  // Apply filters
  const filtered = items
    .filter(i => {
      const typeKey = i.taskType || i.eventType;
      if (filterType !== "all" && typeKey !== filterType) return false;
      if (filterPriority !== "all" && i.priority !== filterPriority && !(filterPriority === "critical" && i.effectivePriority === 0)) return false;
      if (filterAccount && (i.accountName ?? i.sourceModule) !== filterAccount) return false;
      if (filterStatus === "active" && i.status !== "open" && i.status !== "in_progress") return false;
      if (filterStatus === "open" && i.status !== "open") return false;
      if (filterStatus === "in_progress" && i.status !== "in_progress") return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!i.recordName.toLowerCase().includes(q) && !i.reason.toLowerCase().includes(q)) return false;
      }
      // KPI pill stat filter
      if (myStatFilter === "overdue"       && !isOverdue(i))                     return false;
      if (myStatFilter === "high-priority" && i.effectivePriority > 1)           return false;
      if (myStatFilter === "in-progress"   && i.status !== "in_progress")        return false;
      return true;
    })
    // Sort: effectivePriority ASC (critical first), then oldest first (createdAt ASC)
    .sort((a, b) => {
      if (a.effectivePriority !== b.effectivePriority) return a.effectivePriority - b.effectivePriority;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

  // Counts always computed from the raw items so the KPI pills show real totals
  const overdueCount  = items.filter(i => (i.status === "open" || i.status === "in_progress") && isOverdue(i)).length;
  const highPriCount  = items.filter(i => (i.status === "open" || i.status === "in_progress") && i.effectivePriority <= 1).length;
  const inProgCount   = items.filter(i => i.status === "in_progress").length;
  const hasActiveFilters = filterType !== "all" || filterPriority !== "all" || filterAccount !== "" || filterStatus !== "active" || search.trim() !== "" || myStatFilter !== null;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Skeleton className="h-4 w-16" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="flex gap-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16 ml-auto" />
              </div>
              <div className="flex gap-2 pt-1 border-t border-border">
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-7 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="my-work-plan-view">

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        {([ 
          { key: "overdue"       as MyStatFilter, icon: AlertTriangle, label: "Overdue",       count: overdueCount,  accent: "text-red-500 dark:text-red-400",    iconColor: "text-red-500"   },
          { key: "high-priority" as MyStatFilter, icon: ArrowUp,       label: "High Priority", count: highPriCount,  accent: "text-amber-600 dark:text-amber-400", iconColor: "text-amber-500" },
          { key: "in-progress"   as MyStatFilter, icon: Play,          label: "In Progress",   count: inProgCount,   accent: "text-blue-600 dark:text-blue-400",  iconColor: "text-blue-500"  },
        ] as const).map(({ key, icon: Icon, label, count, accent, iconColor }) => (
          <button
            key={key}
            data-testid={`kpi-my-${key}`}
            onClick={() => setMyStatFilter(prev => prev === key ? null : key)}
            className={[
              "flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-left w-full transition-all cursor-pointer hover-elevate",
              myStatFilter === key ? "ring-2 ring-primary border-primary/50" : "border-border",
            ].join(" ")}
          >
            <Icon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground font-medium">{label}</p>
              <p className={`text-lg font-bold leading-none ${count > 0 ? accent : "text-muted-foreground"}`}>{count}</p>
            </div>
            <span className="text-[9px] text-muted-foreground">
              {myStatFilter === key ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </span>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search tasks..."
            className="pl-8 h-9 text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-my-search"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-9 text-sm" data-testid="select-my-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Open + In Progress</SelectItem>
            <SelectItem value="open">Open Only</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-32 h-9 text-sm" data-testid="select-my-priority">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        {taskTypes.length > 0 && (
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-36 h-9 text-sm" data-testid="select-my-type">
              <SelectValue placeholder="Task Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {taskTypes.map(t => (
                <SelectItem key={t} value={t}>{TASK_TYPE_LABELS[t] ?? t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {accounts.length > 0 && (
          <Select value={filterAccount || "all"} onValueChange={v => setFilterAccount(v === "all" ? "" : v)}>
            <SelectTrigger className="w-36 h-9 text-sm" data-testid="select-my-account">
              <SelectValue placeholder="Account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts</SelectItem>
              {accounts.map(a => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {hasActiveFilters && (
          <Button
            size="sm"
            variant="ghost"
            className="h-9 px-2.5 text-xs text-muted-foreground"
            onClick={() => { setFilterType("all"); setFilterPriority("all"); setFilterAccount(""); setFilterStatus("active"); setSearch(""); setMyStatFilter(null); }}
            data-testid="button-clear-my-filters"
          >
            <XCircle className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Task count header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {filtered.length === 0 ? "No tasks" : `${filtered.length} task${filtered.length !== 1 ? "s" : ""}`}
          {hasActiveFilters && " (filtered)"}
        </p>
        <p className="text-xs text-muted-foreground">Sorted by priority → oldest first</p>
      </div>

      {/* Task cards */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <p className="text-sm font-medium text-foreground">
              {hasActiveFilters ? "No tasks match your filters." : "No active tasks assigned to you."}
            </p>
            {!hasActiveFilters && (
              <p className="text-xs text-muted-foreground">Tasks assigned to you will appear here automatically.</p>
            )}
            {hasActiveFilters && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setFilterType("all"); setFilterPriority("all"); setFilterAccount(""); setFilterStatus("active"); setSearch(""); setMyStatFilter(null); }}
                className="mt-1"
              >
                Clear Filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => (
            <MyWorkPlanTaskCard
              key={item.id}
              item={item}
              onComplete={onComplete}
              onMarkInProgress={onMarkInProgress}
              onAddNote={onAddNote}
              isCompleting={completingId === item.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type PageView = "team" | "my";

export default function DailyWorkPlan() {
  const { toast } = useToast();
  const { category: initialCategory, highlight: highlightId } = parseUrlParams();
  const [activeCategory, setActiveCategory] = useState<CategoryId>(initialCategory);
  const [snoozeTarget, setSnoozeTarget] = useState<WorkPlanItem | null>(null);
  const [reassignTarget, setReassignTarget] = useState<WorkPlanItem | null>(null);
  const [noteTarget, setNoteTarget] = useState<{ item: WorkPlanItem; tab: "notes" | "activity" } | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [pageView, setPageView] = useState<PageView>("team");
  const [statFilter, setStatFilter] = useState<StatFilter>(null);

  const today = format(new Date(), "EEEE, MMMM d, yyyy");

  // ── Data ──────────────────────────────────────────────────────────────────

  const { data, isLoading, dataUpdatedAt } = useQuery<WorkPlanData>({
    queryKey: ["/api/work-plan-items"],
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const { data: users = [] } = useQuery<CorporateUser[]>({
    queryKey: ["/api/users?role=corporate"],
    staleTime: 120_000,
  });

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
    staleTime: 300_000,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const completeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/work-plan-items/${id}/complete`, {}),
    onMutate: (id) => setCompletingId(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-plan-items"] });
      toast({ title: "Item completed" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to complete item", description: err.message, variant: "destructive" });
    },
    onSettled: () => setCompletingId(null),
  });

  const snoozeMutation = useMutation({
    mutationFn: ({ id, snoozeUntil }: { id: string; snoozeUntil: Date }) =>
      apiRequest("PATCH", `/api/work-plan-items/${id}/snooze`, { snoozeUntil: snoozeUntil.toISOString() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-plan-items"] });
      setSnoozeTarget(null);
      toast({ title: "Item snoozed" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to snooze item", description: err.message, variant: "destructive" });
    },
  });

  const reassignMutation = useMutation({
    mutationFn: ({ id, assignedUserId }: { id: string; assignedUserId: string }) =>
      apiRequest("PATCH", `/api/work-plan-items/${id}/reassign`, { assignedUserId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-plan-items"] });
      setReassignTarget(null);
      toast({ title: "Item reassigned" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to reassign item", description: err.message, variant: "destructive" });
    },
  });

  const inProgressMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/work-plan-items/${id}/in-progress`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-plan-items"] });
      toast({ title: "Marked in progress" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/work-plan-items/sync", {}),
    onSuccess: (result: SyncResult) => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-plan-items"] });
      toast({ title: "Work plan synced", description: result.message });
    },
    onError: (err: Error) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Derived Stats ──────────────────────────────────────────────────────────

  const allItems = data?.items || [];
  const byCategory = data?.byCategory || {};
  const totalOpen = data?.totalOpen ?? 0;
  const criticalCount = allItems.filter(i => i.effectivePriority === 0).length;
  const dueTodayCount = allItems.filter(i => i.dueDate && isToday(parseDateSafe(i.dueDate))).length;
  const overdueCount  = allItems.filter(i => i.dueDate && isBefore(parseDateSafe(i.dueDate), new Date()) && i.status !== "snoozed").length;

  // Apply stat filter across all categories
  function matchesStatFilter(item: WorkPlanItem, f: StatFilter): boolean {
    if (!f) return true;
    if (f === "critical")  return item.effectivePriority === 0;
    if (f === "due-today") return !!item.dueDate && isToday(parseDateSafe(item.dueDate));
    if (f === "overdue")   return !!item.dueDate && isBefore(parseDateSafe(item.dueDate), new Date()) && item.status !== "snoozed";
    return true;
  }
  const filteredByCategory: typeof byCategory = statFilter
    ? Object.fromEntries(
        Object.entries(byCategory).map(([k, v]) => [k, (v as WorkPlanItem[]).filter(i => matchesStatFilter(i, statFilter))])
      )
    : byCategory;

  const statFilterLabel: Record<NonNullable<StatFilter>, string> = {
    "critical":  "Critical Priority",
    "due-today": "Due Today",
    "overdue":   "Overdue",
  };

  const handleStatToggle = (f: StatFilter) =>
    setStatFilter(prev => (prev === f ? null : f));

  const activeCat = CATEGORIES.find(c => c.id === activeCategory)!;

  return (
    <div className="max-w-5xl mx-auto space-y-4 p-6">

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-dwp-title">
            <CalendarCheck className="h-6 w-6 text-primary" />
            Daily Work Plan
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{today}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setPageView("team")}
              data-testid="button-view-team"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
                pageView === "team"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Team Plan
            </button>
            <button
              onClick={() => setPageView("my")}
              data-testid="button-view-my"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors border-l border-border ${
                pageView === "my"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              My Work Plan
            </button>
          </div>
          {dataUpdatedAt > 0 && (
            <p className="text-xs text-muted-foreground self-center">
              Updated {format(new Date(dataUpdatedAt), "h:mm a")}
            </p>
          )}
          {pageView === "team" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              data-testid="button-sync-work-plan"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              Sync
            </Button>
          )}
        </div>
      </div>

      {/* ── Summary Bar (team view only) ──────────────────────────────────── */}
      {pageView === "team" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="summary-bar">
          <SummaryStatCard icon={ClipboardList} label="Open Items"  value={totalOpen}      accent="text-foreground"                          isLoading={isLoading} testId="kpi-open-items" />
          <SummaryStatCard icon={ShieldAlert}   label="Critical"    value={criticalCount}  accent="text-red-500 dark:text-red-400"            isLoading={isLoading} testId="kpi-critical"   onClick={() => handleStatToggle("critical")}  isActive={statFilter === "critical"} />
          <SummaryStatCard icon={Clock}         label="Due Today"   value={dueTodayCount}  accent="text-amber-600 dark:text-amber-400"        isLoading={isLoading} testId="kpi-due-today"  onClick={() => handleStatToggle("due-today")} isActive={statFilter === "due-today"} />
          <SummaryStatCard icon={CalendarX}     label="Overdue"     value={overdueCount}   accent="text-red-500 dark:text-red-400"            isLoading={isLoading} testId="kpi-overdue"    onClick={() => handleStatToggle("overdue")}   isActive={statFilter === "overdue"} />
        </div>
      )}

      {/* ── Highlight Banner ──────────────────────────────────────────────── */}
      {pageView === "team" && highlightId && (() => {
        const allCatItems = Object.values(byCategory).flat();
        const matchedItem = allCatItems.find(i => i.id === highlightId || i.recordId === highlightId);
        const label = matchedItem?.recordName || highlightId;
        return (
          <div className="flex items-center gap-2 p-3 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20" data-testid="highlight-banner">
            <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Showing work item for <strong>{label}</strong> below.
            </p>
          </div>
        );
      })()}

      {/* ── My Work Plan View ─────────────────────────────────────────────── */}
      {pageView === "my" && (
        <MyWorkPlanView
          items={allItems.filter(i => i.status === "open" || i.status === "in_progress")}
          isLoading={isLoading}
          onComplete={(id) => completeMutation.mutate(id)}
          onMarkInProgress={(id) => inProgressMutation.mutate(id)}
          onAddNote={(item, tab) => setNoteTarget({ item, tab: tab ?? "notes" })}
          completingId={completingId}
        />
      )}

      {/* ── Category Tabs ─────────────────────────────────────────────────── */}
      {pageView === "team" && (
        <>
          {/* Active stat filter chip */}
          {statFilter && (
            <div className="flex items-center gap-2" data-testid="stat-filter-banner">
              <div className="flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-medium px-3 py-1">
                <ShieldAlert className="h-3 w-3" />
                Filtered: {statFilterLabel[statFilter]}
                <button
                  onClick={() => setStatFilter(null)}
                  data-testid="button-clear-stat-filter"
                  className="ml-1 rounded-full hover:bg-primary/20 p-0.5 transition-colors"
                >
                  <XCircle className="h-3 w-3" />
                </button>
              </div>
              <span className="text-xs text-muted-foreground">
                {Object.values(filteredByCategory).flat().length} matching item{Object.values(filteredByCategory).flat().length !== 1 ? "s" : ""} across all categories
              </span>
            </div>
          )}

          <div className="flex items-center gap-1 border-b border-border pb-0" data-testid="category-tabs">
            {CATEGORIES.map(cat => {
              const count = (filteredByCategory[cat.id] ?? byCategory[cat.id])?.length ?? 0;
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  data-testid={`tab-${cat.id}`}
                  className={[
                    "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                  ].join(" ")}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {cat.label}
                  {count > 0 && (
                    <span className={`text-xs rounded-full px-1.5 py-0 font-semibold leading-5 ${
                      isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Active Category Table ─────────────────────────────────────────── */}
          {isLoading ? (
            <TableSkeleton />
          ) : activeCategory === "driver_ops" ? (
            <DriverOpsTable
              items={filteredByCategory["driver_ops"] || []}
              highlightId={highlightId}
              onComplete={(id) => completeMutation.mutate(id)}
              onSnooze={setSnoozeTarget}
              onReassign={setReassignTarget}
              onAddNote={(item, tab) => setNoteTarget({ item, tab: tab ?? "notes" })}
              onMarkInProgress={(id) => inProgressMutation.mutate(id)}
              completingId={completingId}
              users={users}
              teams={teams}
            />
          ) : activeCategory === "compliance" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 p-3 rounded-md border border-rose-200 bg-rose-50 dark:bg-rose-900/10 dark:border-rose-800/40">
                <div className="flex items-center gap-2">
                  <FileWarning className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  <p className="text-sm text-rose-800 dark:text-rose-300 font-medium">
                    Driver License Compliance Review Queue
                  </p>
                  <span className="text-xs text-rose-600 dark:text-rose-400">
                    — review and approve MNM license update submissions
                  </span>
                </div>
                <a
                  href="/compliance/license-review"
                  data-testid="link-open-license-review-queue"
                  className="flex items-center gap-1.5 text-xs font-medium text-rose-700 dark:text-rose-400 hover:underline shrink-0"
                >
                  Open Full Queue
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <CategoryTable
                cat={activeCat}
                items={filteredByCategory[activeCategory] || []}
                highlightId={highlightId}
                onComplete={(id) => completeMutation.mutate(id)}
                onSnooze={setSnoozeTarget}
                onReassign={setReassignTarget}
                onAddNote={(item, tab) => setNoteTarget({ item, tab: tab ?? "notes" })}
                onMarkInProgress={(id) => inProgressMutation.mutate(id)}
                completingId={completingId}
                users={users}
                teams={teams}
              />
            </div>
          ) : (
            <CategoryTable
              cat={activeCat}
              items={filteredByCategory[activeCategory] || []}
              highlightId={highlightId}
              onComplete={(id) => completeMutation.mutate(id)}
              onSnooze={setSnoozeTarget}
              onReassign={setReassignTarget}
              onAddNote={(item, tab) => setNoteTarget({ item, tab: tab ?? "notes" })}
              onMarkInProgress={(id) => inProgressMutation.mutate(id)}
              completingId={completingId}
              onCreateTask={activeCategory === "tasks" ? () => setShowCreateTask(true) : undefined}
              users={users}
              teams={teams}
            />
          )}
        </>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {snoozeTarget && (
        <SnoozeModal
          item={snoozeTarget}
          onClose={() => setSnoozeTarget(null)}
          onConfirm={(snoozeUntil) => snoozeMutation.mutate({ id: snoozeTarget.id, snoozeUntil })}
          isPending={snoozeMutation.isPending}
        />
      )}
      {reassignTarget && (
        <ReassignModal
          item={reassignTarget}
          onClose={() => setReassignTarget(null)}
          onConfirm={(assignedUserId) => reassignMutation.mutate({ id: reassignTarget.id, assignedUserId })}
          isPending={reassignMutation.isPending}
        />
      )}
      {noteTarget && (
        <AddNoteModal
          item={noteTarget.item}
          defaultTab={noteTarget.tab}
          onClose={() => setNoteTarget(null)}
        />
      )}
      {showCreateTask && (
        <CreateTaskModal
          onClose={() => setShowCreateTask(false)}
          onCreated={() => setShowCreateTask(false)}
        />
      )}
    </div>
  );
}
