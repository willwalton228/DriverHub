import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2, FileText, Smartphone, Mail, Phone, PhoneIncoming, PhoneOutgoing,
  Plus, Search, X, AlertTriangle, ChevronDown, ChevronUp, Clock, CheckCircle2,
  XCircle, AlertCircle, MessageSquare, Pencil, Trash2, Reply, ExternalLink,
} from "lucide-react";
import { DRIVER_NOTE_TYPES } from "@shared/schema";

type TimelineItem = {
  id: string;
  type: "note" | "sms" | "email" | "call";
  timestamp: string;
  content: string;
  author: { name: string; avatar: string | null };
  metadata?: {
    noteType?: string;
    isImported?: boolean;
    direction?: "inbound" | "outbound";
    status?: string;
    provider?: string;
    subject?: string;
    bulkSendId?: string;
    contextModule?: string;
    recipientPhone?: string;
    groupSignature?: string | null;
    callType?: string;
    durationMinutes?: number;
    outcome?: string;
  };
};

type FilterType = "all" | "note" | "sms" | "email" | "call";

const OUTCOME_LABELS: Record<string, string> = {
  connected:  "Connected",
  no_answer:  "No Answer",
  voicemail:  "Voicemail",
  busy:       "Busy",
  other:      "Other",
};

// Notes created before this date show no avatar (historical/imported content).
// Notes on/after this date show the author avatar as normal.
const NOTE_AVATAR_CUTOFF = new Date("2026-03-01T00:00:00Z");

function showNoteAvatar(item: TimelineItem): boolean {
  if (item.type !== "note") return true; // SMS, email, call always show avatar
  if (!item.timestamp) return false;
  return new Date(item.timestamp) >= NOTE_AVATAR_CUTOFF;
}

function toUtcDate(ts: string): Date {
  if (!ts) return new Date(NaN);
  // Already a proper UTC ISO string (most common after backend fix)
  if (ts.endsWith("Z")) return new Date(ts);
  // Has a numeric timezone offset: +HH:MM, +HHMM, or bare +HH (PostgreSQL outputs +00)
  // Normalize to a full ISO string that every browser can parse safely.
  const offsetMatch = ts.match(/([+-])(\d{2}):?(\d{2})?$/);
  if (offsetMatch) {
    const [, sign, hh, mm = "00"] = offsetMatch;
    const normalized = ts.replace(" ", "T").replace(/[+-]\d{2}:?\d{0,2}$/, "") + `${sign}${hh}:${mm}`;
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? new Date(ts.replace(" ", "T")) : d;
  }
  // No timezone info — stored as UTC (driver_notes pattern), append Z
  return new Date(ts.replace(" ", "T") + "Z");
}

function formatTimestamp(ts: string) {
  if (!ts) return "No timestamp available";
  const d = toUtcDate(ts);
  if (isNaN(d.getTime())) return "No timestamp available";
  const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  if (d >= todayStart) return `Today, ${timeStr}`;
  if (d >= yesterdayStart) return `Yesterday, ${timeStr}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  const dateStr = d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
  return `${dateStr}, ${timeStr}`;
}

function TypeBadge({ type, direction }: { type: TimelineItem["type"]; direction?: string }) {
  if (type === "note")  return <Badge variant="outline" className="text-[10px] gap-0.5 py-0"><FileText className="h-2.5 w-2.5" /> Note</Badge>;
  if (type === "sms" && direction === "inbound") return (
    <Badge variant="outline" className="text-[10px] gap-0.5 py-0 border-teal-400/50 text-teal-600 dark:text-teal-400">
      <Reply className="h-2.5 w-2.5" /> Driver Reply
    </Badge>
  );
  if (type === "sms")   return <Badge variant="outline" className="text-[10px] gap-0.5 py-0 border-blue-400/50 text-blue-600 dark:text-blue-400"><Smartphone className="h-2.5 w-2.5" /> SMS</Badge>;
  if (type === "email") return <Badge variant="outline" className="text-[10px] gap-0.5 py-0 border-violet-400/50 text-violet-600 dark:text-violet-400"><Mail className="h-2.5 w-2.5" /> Email</Badge>;
  if (type === "call")  return <Badge variant="outline" className="text-[10px] gap-0.5 py-0 border-green-400/50 text-green-600 dark:text-green-400"><Phone className="h-2.5 w-2.5" /> Call</Badge>;
  return null;
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const map: Record<string, { label: string; className: string; icon: any }> = {
    sent:                { label: "Sent",     className: "text-green-600 dark:text-green-400 border-green-400/50",    icon: CheckCircle2 },
    failed:              { label: "Failed",   className: "text-destructive border-destructive/40",                    icon: XCircle },
    blocked:             { label: "Blocked",  className: "text-orange-600 dark:text-orange-400 border-orange-400/50", icon: AlertCircle },
    pending_integration: { label: "Logged",   className: "text-muted-foreground",                                     icon: Clock },
    queued:              { label: "Queued",   className: "text-blue-600 dark:text-blue-400 border-blue-400/50",       icon: Clock },
    received:            { label: "Received", className: "text-teal-600 dark:text-teal-400 border-teal-400/50",       icon: CheckCircle2 },
  };
  const cfg = map[status] ?? { label: status, className: "text-muted-foreground", icon: Clock };
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`text-[10px] gap-0.5 py-0 ${cfg.className}`}>
      <Icon className="h-2.5 w-2.5" /> {cfg.label}
    </Badge>
  );
}

function NoteAddForm({ driverId, onSuccess }: { driverId: string; onSuccess: () => void }) {
  const { toast } = useToast();
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState("");

  const addMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/corporate/drivers/${driverId}/notes`, {
      noteText: noteText.trim(),
      noteType,
    }).then(r => r.json()),
    onSuccess: () => {
      setNoteText("");
      setNoteType("");
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers", driverId, "notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers", driverId, "communications"] });
      toast({ title: "Note added" });
      onSuccess();
    },
    onError: () => toast({ title: "Failed to add note", variant: "destructive" }),
  });

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <Select value={noteType} onValueChange={setNoteType} data-testid="select-comms-note-type">
        <SelectTrigger className="h-8 text-xs" data-testid="trigger-comms-note-type">
          <SelectValue placeholder="Note type…" />
        </SelectTrigger>
        <SelectContent>
          {DRIVER_NOTE_TYPES.map(t => (
            <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Textarea
        placeholder="Add a note about this driver…"
        value={noteText}
        onChange={e => setNoteText(e.target.value)}
        rows={3}
        data-testid="textarea-comms-add-note"
      />
      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          onClick={() => addMutation.mutate()}
          disabled={!noteText.trim() || !noteType || addMutation.isPending}
          data-testid="button-comms-add-note"
        >
          {addMutation.isPending && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
          <FileText className="h-3 w-3 mr-1.5" />
          Add Note
        </Button>
      </div>
    </div>
  );
}

function LogCallDialog({
  open,
  onOpenChange,
  driverId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  driverId: string;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({ callType: "outbound", outcome: "", durationMinutes: "", notes: "" });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const logMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/corporate/drivers/${driverId}/call-logs`, {
      callType:        form.callType,
      outcome:         form.outcome,
      durationMinutes: form.durationMinutes ? parseInt(form.durationMinutes) : undefined,
      notes:           form.notes || undefined,
    }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers", driverId, "communications"] });
      toast({ title: "Call logged" });
      setForm({ callType: "outbound", outcome: "", durationMinutes: "", notes: "" });
      onOpenChange(false);
    },
    onError: () => toast({ title: "Failed to log call", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Log a Call</DialogTitle>
          <DialogDescription>Record details of a call with this driver.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Direction</label>
            <Select value={form.callType} onValueChange={v => set("callType", v)} data-testid="select-call-type">
              <SelectTrigger data-testid="trigger-call-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="outbound">Outbound</SelectItem>
                <SelectItem value="inbound">Inbound</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Outcome <span className="text-destructive">*</span></label>
            <Select value={form.outcome} onValueChange={v => set("outcome", v)} data-testid="select-call-outcome">
              <SelectTrigger data-testid="trigger-call-outcome">
                <SelectValue placeholder="Select outcome…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="connected">Connected</SelectItem>
                <SelectItem value="no_answer">No Answer</SelectItem>
                <SelectItem value="voicemail">Voicemail</SelectItem>
                <SelectItem value="busy">Busy</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Duration (minutes, optional)</label>
            <Input
              type="number"
              min="0"
              placeholder="e.g. 5"
              value={form.durationMinutes}
              onChange={e => set("durationMinutes", e.target.value)}
              data-testid="input-call-duration"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
            <Textarea
              placeholder="What was discussed?"
              rows={3}
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              data-testid="textarea-call-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} data-testid="button-call-cancel">Cancel</Button>
          <Button
            size="sm"
            disabled={!form.outcome || logMutation.isPending}
            onClick={() => logMutation.mutate()}
            data-testid="button-call-save"
          >
            {logMutation.isPending && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
            <Phone className="h-3 w-3 mr-1.5" />
            Log Call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditNoteDialog({
  open,
  onOpenChange,
  driverId,
  item,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  driverId: string;
  item: TimelineItem | null;
}) {
  const { toast } = useToast();
  const [noteText, setNoteText] = useState(item?.content ?? "");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open && item) {
      setNoteText(item.content ?? "");
      setReason("");
    }
  }, [open, item?.id]);

  const editMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/corporate/drivers/${driverId}/notes/${item!.id}`, {
        noteText: noteText.trim(),
        reason: reason.trim(),
      }).then(async r => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.message ?? "Failed to edit note");
        }
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers", driverId, "communications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers", driverId, "notes"] });
      toast({ title: "Note updated" });
      setReason("");
      onOpenChange(false);
    },
    onError: (err: Error) =>
      toast({ title: "Failed to update note", description: err.message, variant: "destructive" }),
  });

  const reasonValid = reason.trim().length >= 10;
  const textValid   = noteText.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) setReason(""); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Note</DialogTitle>
          <DialogDescription>
            Editing a note creates an immutable audit record. Provide a reason for the change.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {item?.metadata?.noteType && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium">Type:</span>
              <Badge variant="secondary" className="text-[10px] py-0">{item.metadata.noteType}</Badge>
              <span className="ml-auto text-[10px]">Type cannot be changed</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Note content <span className="text-destructive">*</span></Label>
            <Textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              rows={5}
              placeholder="Note content…"
              data-testid="textarea-edit-note-content"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              Reason for edit <span className="text-destructive">*</span>
              <span className="text-muted-foreground font-normal ml-1">(min. 10 characters)</span>
            </Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              placeholder="Explain why this note is being edited…"
              data-testid="textarea-edit-note-reason"
            />
            {reason.length > 0 && !reasonValid && (
              <p className="text-[11px] text-destructive">At least 10 characters required.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setReason(""); onOpenChange(false); }}
            data-testid="button-edit-note-cancel"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!textValid || !reasonValid || editMutation.isPending}
            onClick={() => editMutation.mutate()}
            data-testid="button-edit-note-save"
          >
            {editMutation.isPending && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
            <Pencil className="h-3 w-3 mr-1.5" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteNoteDialog({
  open,
  onOpenChange,
  driverId,
  item,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  driverId: string;
  item: TimelineItem | null;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiRequest("DELETE", `/api/corporate/drivers/${driverId}/notes/${item!.id}`, {
        reason: reason.trim(),
      }).then(async r => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.message ?? "Failed to delete note");
        }
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers", driverId, "communications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers", driverId, "notes"] });
      toast({ title: "Note deleted" });
      setReason("");
      onOpenChange(false);
    },
    onError: (err: Error) =>
      toast({ title: "Failed to delete note", description: err.message, variant: "destructive" }),
  });

  const reasonValid = reason.trim().length >= 10;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) setReason(""); onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Note</DialogTitle>
          <DialogDescription>
            This note will be soft-deleted and an audit record will be created. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {item?.content && (
            <div className="rounded-md bg-muted/50 border p-3 text-xs text-muted-foreground line-clamp-4">
              {item.content}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">
              Reason for deletion <span className="text-destructive">*</span>
              <span className="text-muted-foreground font-normal ml-1">(min. 10 characters)</span>
            </Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              placeholder="Explain why this note is being deleted…"
              data-testid="textarea-delete-note-reason"
            />
            {reason.length > 0 && !reasonValid && (
              <p className="text-[11px] text-destructive">At least 10 characters required.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setReason(""); onOpenChange(false); }}
            data-testid="button-delete-note-cancel"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!reasonValid || deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
            data-testid="button-delete-note-confirm"
          >
            {deleteMutation.isPending && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
            <Trash2 className="h-3 w-3 mr-1.5" />
            Delete Note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TimelineEntry({
  item,
  canEditDelete,
  onEdit,
  onDelete,
  onViewThread,
}: {
  item: TimelineItem;
  canEditDelete: boolean;
  onEdit: (item: TimelineItem) => void;
  onDelete: (item: TimelineItem) => void;
  onViewThread?: (item: TimelineItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = item.content && item.content.length > 220;
  const displayContent = isLong && !expanded ? item.content.slice(0, 220) + "…" : item.content;
  const isNote = item.type === "note";

  return (
    <div className="flex gap-3 group" data-testid={`timeline-entry-${item.id}`}>
      <div className="flex flex-col items-center shrink-0 pt-0.5">
        {showNoteAvatar(item) ? (
          <Avatar className="h-7 w-7">
            <AvatarImage src={item.author.avatar ?? undefined} />
            <AvatarFallback className="text-[10px]">{item.author.name?.[0] ?? "?"}</AvatarFallback>
          </Avatar>
        ) : (
          <div className="h-7 w-7 rounded-full shrink-0 border border-dashed border-muted-foreground/25" />
        )}
        <div className="w-px flex-1 bg-border mt-1.5 min-h-[16px]" />
      </div>

      <div className="pb-4 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          <TypeBadge type={item.type} direction={item.metadata?.direction} />

          {item.type === "note" && item.metadata?.noteType && (
            <Badge variant="secondary" className="text-[10px] py-0">{item.metadata.noteType}</Badge>
          )}
          {item.type === "note" && item.metadata?.isImported && (
            <Badge variant="secondary" className="text-[10px] py-0">Imported</Badge>
          )}

          {(item.type === "sms" || item.type === "email") && (
            <StatusBadge status={item.metadata?.status} />
          )}

          {item.type === "call" && (
            <>
              <Badge variant="outline" className="text-[10px] py-0 gap-0.5">
                {item.metadata?.callType === "inbound"
                  ? <PhoneIncoming className="h-2.5 w-2.5" />
                  : <PhoneOutgoing className="h-2.5 w-2.5" />}
                {item.metadata?.callType === "inbound" ? "Inbound" : "Outbound"}
              </Badge>
              {item.metadata?.outcome && (
                <Badge variant="outline" className="text-[10px] py-0">
                  {OUTCOME_LABELS[item.metadata.outcome] ?? item.metadata.outcome}
                </Badge>
              )}
              {item.metadata?.durationMinutes != null && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <Clock className="h-2.5 w-2.5" />{item.metadata.durationMinutes} min
                </span>
              )}
            </>
          )}

          <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{formatTimestamp(item.timestamp)}</span>

          {item.type === "sms" && onViewThread && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5"
                    onClick={() => onViewThread(item)}
                    data-testid={`button-view-sms-thread-${item.id}`}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">View full thread</TooltipContent>
              </Tooltip>
            </div>
          )}

          {isNote && canEditDelete && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5"
                    onClick={() => onEdit(item)}
                    data-testid={`button-edit-note-${item.id}`}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Edit note</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5 text-destructive hover:text-destructive"
                    onClick={() => onDelete(item)}
                    data-testid={`button-delete-note-${item.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Delete note</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground mb-1">{item.author.name}</p>

        {item.type === "email" && item.metadata?.subject && (
          <p className="text-xs font-medium mb-0.5">{item.metadata.subject}</p>
        )}

        {item.content ? (
          <div>
            <p className="text-sm leading-relaxed">{displayContent}</p>
            {isLong && (
              <button
                className="text-xs text-primary mt-0.5 hover:underline flex items-center gap-0.5"
                onClick={() => setExpanded(e => !e)}
              >
                {expanded ? <><ChevronUp className="h-3 w-3" /> Show less</> : <><ChevronDown className="h-3 w-3" /> Show more</>}
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No content recorded</p>
        )}
      </div>
    </div>
  );
}

// ── SMS Thread Sheet ───────────────────────────────────────────────────────────
type ThreadMessage = {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  status: string;
  senderName: string;
  senderAvatar: string | null;
  groupSignature: string | null;
  providerMessageId: string | null;
  timestamp: string | null;
};

function formatThreadTime(ts: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function SmsThreadSheet({
  open,
  onOpenChange,
  driverId,
  phone,
  driverName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  driverId: string;
  phone: string | null;
  driverName?: string;
}) {
  const { data, isLoading } = useQuery<{ messages: ThreadMessage[]; phone: string | null; total: number }>({
    queryKey: ["/api/corporate/drivers", driverId, "sms-thread", phone ?? "all"],
    queryFn: () => {
      const url = phone
        ? `/api/corporate/drivers/${driverId}/sms-thread?phone=${encodeURIComponent(phone)}`
        : `/api/corporate/drivers/${driverId}/sms-thread`;
      return fetch(url, { credentials: "include" }).then(r => r.json());
    },
    enabled: open && !!driverId,
  });

  const messages = data?.messages ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-4 w-4 text-muted-foreground" />
            SMS Conversation
          </SheetTitle>
          {phone && (
            <p className="text-xs text-muted-foreground">{phone}{driverName ? ` · ${driverName}` : ""}</p>
          )}
          {data && (
            <p className="text-xs text-muted-foreground">{data.total} message{data.total !== 1 ? "s" : ""}</p>
          )}
        </SheetHeader>

        <ScrollArea className="flex-1 px-4 py-3">
          {isLoading && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No messages found</p>
            </div>
          )}

          {!isLoading && messages.length > 0 && (
            <div className="space-y-3">
              {messages.map((msg, idx) => {
                const isOut = msg.direction === "outbound";
                const prevMsg = idx > 0 ? messages[idx - 1] : null;
                const showDateSep = !prevMsg || (
                  msg.timestamp && prevMsg.timestamp &&
                  new Date(msg.timestamp).toDateString() !== new Date(prevMsg.timestamp).toDateString()
                );

                return (
                  <div key={msg.id}>
                    {showDateSep && msg.timestamp && (
                      <div className="flex items-center gap-2 my-3">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {new Date(msg.timestamp).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                        </span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                    )}

                    <div className={`flex gap-2 ${isOut ? "flex-row-reverse" : "flex-row"}`} data-testid={`thread-message-${msg.id}`}>
                      <Avatar className="h-6 w-6 shrink-0 mt-1">
                        <AvatarImage src={msg.senderAvatar ?? undefined} />
                        <AvatarFallback className="text-[9px]">{msg.senderName?.[0] ?? "?"}</AvatarFallback>
                      </Avatar>

                      <div className={`max-w-[75%] space-y-0.5 ${isOut ? "items-end" : "items-start"} flex flex-col`}>
                        <div className="flex items-center gap-1.5">
                          {!isOut && (
                            <span className="text-[11px] font-medium text-foreground">{msg.senderName}</span>
                          )}
                          {isOut && msg.groupSignature && (
                            <span className="text-[10px] text-muted-foreground italic">{msg.groupSignature}</span>
                          )}
                          {isOut && !msg.groupSignature && (
                            <span className="text-[11px] font-medium text-foreground">{msg.senderName}</span>
                          )}
                        </div>

                        <div className={`rounded-xl px-3 py-2 text-sm leading-relaxed ${
                          isOut
                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                            : "bg-muted text-foreground rounded-tl-sm"
                        }`}>
                          {msg.body}
                        </div>

                        <div className="flex items-center gap-1.5 px-0.5">
                          {msg.timestamp && (
                            <span className="text-[10px] text-muted-foreground">{formatThreadTime(msg.timestamp)}</span>
                          )}
                          {isOut && (
                            <span className="text-[10px] text-muted-foreground capitalize">{msg.status}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

const FILTER_TABS: { key: FilterType; label: string; icon: any }[] = [
  { key: "all",   label: "All",    icon: null },
  { key: "note",  label: "Notes",  icon: FileText },
  { key: "sms",   label: "Texts",  icon: Smartphone },
  { key: "email", label: "Emails", icon: Mail },
  { key: "call",  label: "Calls",  icon: Phone },
];

interface Props {
  driverId: string;
  driverName?: string;
}

export function NotesAndCommsTimeline({ driverId, driverName }: Props) {
  const { isCorporate, isSuperAdmin, isRootSuperAdmin } = useAuth();
  // Corporate, Corporate Admin, and Super User can all edit/delete notes.
  // Communications (SMS, email, calls) are never editable — enforced at the TimelineEntry level.
  const canEditDelete = isCorporate || isSuperAdmin || isRootSuperAdmin;

  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [showNoteForm, setShowNoteForm]   = useState(false);
  const [logCallOpen, setLogCallOpen]     = useState(false);
  const [search, setSearch]               = useState("");

  const [editItem, setEditItem]     = useState<TimelineItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<TimelineItem | null>(null);
  const [threadItem, setThreadItem] = useState<TimelineItem | null>(null);

  // ── SMS sub-filters (only applied when activeFilter === "sms") ───────────
  type SmsDateFilter   = "all" | "today" | "7d" | "30d" | "custom";
  type SmsSenderFilter = "all" | "personal" | "group" | "inbound";
  const [smsDateFilter,   setSmsDateFilter]   = useState<SmsDateFilter>("all");
  const [smsSenderFilter, setSmsSenderFilter] = useState<SmsSenderFilter>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd,   setCustomEnd]   = useState("");

  const { data, isLoading } = useQuery<{ items: TimelineItem[] }>({
    queryKey: ["/api/corporate/drivers", driverId, "communications"],
    queryFn: () => fetch(`/api/corporate/drivers/${driverId}/communications`, { credentials: "include" }).then(r => r.json()),
    enabled: !!driverId,
  });

  const items = data?.items ?? [];

  // ── SMS sub-filter helpers ───────────────────────────────────────────────
  const todayStart = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
  const ago7  = new Date(Date.now() - 7  * 86400_000);
  const ago30 = new Date(Date.now() - 30 * 86400_000);

  function passSmsDateFilter(item: TimelineItem): boolean {
    if (smsDateFilter === "all") return true;
    const ts = item.timestamp ? new Date(item.timestamp) : null;
    if (!ts) return false;
    if (smsDateFilter === "today")  return ts >= todayStart;
    if (smsDateFilter === "7d")     return ts >= ago7;
    if (smsDateFilter === "30d")    return ts >= ago30;
    if (smsDateFilter === "custom") {
      if (customStart && ts < new Date(customStart)) return false;
      if (customEnd   && ts > new Date(customEnd + "T23:59:59")) return false;
    }
    return true;
  }

  function passSmsSenderFilter(item: TimelineItem): boolean {
    if (smsSenderFilter === "all") return true;
    const dir = item.metadata?.direction;
    const gs  = item.metadata?.groupSignature;
    if (smsSenderFilter === "inbound")  return dir === "inbound";
    if (smsSenderFilter === "group")    return dir === "outbound" && !!gs;
    if (smsSenderFilter === "personal") return dir === "outbound" && !gs;
    return true;
  }

  const filtered = items.filter(item => {
    if (activeFilter !== "all" && item.type !== activeFilter) return false;
    // SMS sub-filters — only when the "Texts" tab is active or viewing all with SMS items
    if (item.type === "sms" && activeFilter === "sms") {
      if (!passSmsDateFilter(item))   return false;
      if (!passSmsSenderFilter(item)) return false;
    }
    if (search.trim()) {
      const term = search.toLowerCase();
      const inContent = item.content?.toLowerCase().includes(term);
      const inAuthor  = item.author.name?.toLowerCase().includes(term);
      const inMeta    = Object.values(item.metadata ?? {}).some(v => String(v).toLowerCase().includes(term));
      return inContent || inAuthor || inMeta;
    }
    return true;
  });

  const counts: Record<string, number> = { all: items.length };
  for (const item of items) counts[item.type] = (counts[item.type] ?? 0) + 1;

  const smsSubFiltersActive = smsDateFilter !== "all" || smsSenderFilter !== "all";

  return (
    <div className="space-y-4">
      {/* ── Action bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant={showNoteForm ? "default" : "outline"}
          onClick={() => { setShowNoteForm(v => !v); setLogCallOpen(false); }}
          data-testid="button-add-note-toggle"
        >
          <FileText className="h-3.5 w-3.5 mr-1.5" />
          Add Note
          {showNoteForm ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setLogCallOpen(true)}
          data-testid="button-log-call"
        >
          <Phone className="h-3.5 w-3.5 mr-1.5" />
          Log Call
        </Button>
      </div>

      {/* ── Inline note compose ─────────────────────────────────────────────── */}
      {showNoteForm && (
        <NoteAddForm
          driverId={driverId}
          onSuccess={() => setShowNoteForm(false)}
        />
      )}

      {/* ── Filter + Search ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {FILTER_TABS.map(({ key, label, icon: Icon }) => {
            const count = counts[key] ?? 0;
            const isActive = activeFilter === key;
            return (
              <Button
                key={key}
                size="sm"
                variant={isActive ? "default" : "ghost"}
                onClick={() => setActiveFilter(key)}
                data-testid={`filter-${key}`}
                className="h-7 text-xs gap-1"
              >
                {Icon && <Icon className="h-3 w-3" />}
                {label}
                {count > 0 && (
                  <Badge
                    variant={isActive ? "secondary" : "outline"}
                    className="text-[10px] px-1 py-0 min-w-[18px] text-center"
                  >
                    {count}
                  </Badge>
                )}
              </Button>
            );
          })}
        </div>

        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-7 h-7 text-xs w-44"
            data-testid="input-comms-search"
          />
          {search && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover-elevate rounded-sm"
              onClick={() => setSearch("")}
              data-testid="button-comms-search-clear"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* ── SMS sub-filters — date + sender, only visible on Texts tab ─── */}
      {activeFilter === "sms" && (
        <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Date filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-medium text-muted-foreground shrink-0">Date</span>
              {(["all","today","7d","30d","custom"] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setSmsDateFilter(v)}
                  data-testid={`sms-date-filter-${v}`}
                  className={`text-[11px] px-2 py-0.5 rounded-md border transition-colors ${
                    smsDateFilter === v
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover-elevate"
                  }`}
                >
                  {v === "all" ? "All" : v === "today" ? "Today" : v === "7d" ? "Last 7 days" : v === "30d" ? "Last 30 days" : "Custom"}
                </button>
              ))}
            </div>

            {/* Sender filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-medium text-muted-foreground shrink-0">Sender</span>
              {(["all","personal","group","inbound"] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setSmsSenderFilter(v)}
                  data-testid={`sms-sender-filter-${v}`}
                  className={`text-[11px] px-2 py-0.5 rounded-md border transition-colors ${
                    smsSenderFilter === v
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover-elevate"
                  }`}
                >
                  {v === "all" ? "All" : v === "personal" ? "DriverHub user" : v === "group" ? "Group signature" : "From driver"}
                </button>
              ))}
            </div>

            {/* Clear active sub-filters */}
            {smsSubFiltersActive && (
              <button
                onClick={() => { setSmsDateFilter("all"); setSmsSenderFilter("all"); setCustomStart(""); setCustomEnd(""); }}
                className="text-[11px] text-destructive ml-auto flex items-center gap-0.5 hover-elevate rounded-sm px-1"
                data-testid="sms-subfilter-clear"
              >
                <X className="h-2.5 w-2.5" /> Clear filters
              </button>
            )}
          </div>

          {/* Custom date range inputs */}
          {smsDateFilter === "custom" && (
            <div className="flex items-center gap-2 flex-wrap pt-0.5">
              <span className="text-[11px] text-muted-foreground">From</span>
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="text-[11px] border rounded-md px-2 py-0.5 bg-background text-foreground h-6"
                data-testid="sms-date-custom-start"
              />
              <span className="text-[11px] text-muted-foreground">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="text-[11px] border rounded-md px-2 py-0.5 bg-background text-foreground h-6"
                data-testid="sms-date-custom-end"
              />
            </div>
          )}
        </div>
      )}

      <Separator />

      {/* ── Timeline ────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <MessageSquare className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            {search || activeFilter !== "all" ? "No matching entries" : "No activity yet"}
          </p>
          {!search && activeFilter === "all" && (
            <p className="text-xs text-muted-foreground mt-1">
              Add a note or log a call to get started.
            </p>
          )}
          {(search || activeFilter !== "all") && (
            <button
              className="text-xs text-primary mt-2 hover:underline"
              onClick={() => { setSearch(""); setActiveFilter("all"); }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-0">
          {filtered.map(item => (
            <TimelineEntry
              key={item.id}
              item={item}
              canEditDelete={canEditDelete}
              onEdit={setEditItem}
              onDelete={setDeleteItem}
              onViewThread={setThreadItem}
            />
          ))}
        </div>
      )}

      <LogCallDialog open={logCallOpen} onOpenChange={setLogCallOpen} driverId={driverId} />

      <EditNoteDialog
        open={editItem !== null}
        onOpenChange={v => { if (!v) setEditItem(null); }}
        driverId={driverId}
        item={editItem}
      />

      <DeleteNoteDialog
        open={deleteItem !== null}
        onOpenChange={v => { if (!v) setDeleteItem(null); }}
        driverId={driverId}
        item={deleteItem}
      />

      <SmsThreadSheet
        open={threadItem !== null}
        onOpenChange={v => { if (!v) setThreadItem(null); }}
        driverId={driverId}
        phone={threadItem?.metadata?.recipientPhone ?? null}
        driverName={driverName}
      />
    </div>
  );
}
