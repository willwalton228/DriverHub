import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  ClipboardList, Search, User, MapPin, Clock, CheckCircle2, XCircle,
  AlertTriangle, Loader2, ChevronRight, Activity, RefreshCw, Plus,
  Calendar, Users, Tag, MessageSquare, Paperclip, ArrowRight,
  Circle, TrendingUp, Building2, Filter,
} from "lucide-react";

// ── Status config ──────────────────────────────────────────────────────────────
export type RequestStatus =
  | "draft" | "submitted" | "needs_review" | "approved"
  | "rejected" | "on_hold" | "recruiting_active" | "completed";

const STATUS_META: Record<RequestStatus, {
  label: string; badgeClass: string; icon: React.ElementType;
}> = {
  draft:             { label: "Draft",             icon: Circle,       badgeClass: "bg-muted text-muted-foreground border-border" },
  submitted:         { label: "Submitted",         icon: ClipboardList,badgeClass: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800" },
  needs_review:      { label: "Needs Review",      icon: AlertTriangle, badgeClass: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800" },
  approved:          { label: "Approved",          icon: CheckCircle2, badgeClass: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800" },
  rejected:          { label: "Rejected",          icon: XCircle,      badgeClass: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800" },
  on_hold:           { label: "On Hold",           icon: Clock,        badgeClass: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800" },
  recruiting_active: { label: "Recruiting Active", icon: TrendingUp,   badgeClass: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800" },
  completed:         { label: "Completed",         icon: CheckCircle2, badgeClass: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" },
};

const ALL_STATUSES = Object.keys(STATUS_META) as RequestStatus[];

const PRIORITY_LABELS: Record<number, { label: string; class: string }> = {
  1: { label: "Low",      class: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300" },
  2: { label: "Medium",   class: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300" },
  3: { label: "High",     class: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300" },
  4: { label: "Critical", class: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300" },
};

// Admin roles allowed to take approval actions
const ADMIN_ROLES = [
  "super_user","super_admin","root_super_admin","corporate_admin",
  "admin","manager","recruiting_admin","recruiter","hiring_manager",
];

// Allowed status transitions per current status (for admins)
const NEXT_STATUSES: Record<RequestStatus, RequestStatus[]> = {
  draft:             ["submitted"],
  submitted:         ["needs_review","approved","rejected","on_hold"],
  needs_review:      ["approved","rejected","on_hold","submitted"],
  approved:          ["recruiting_active","on_hold"],
  rejected:          ["submitted"],
  on_hold:           ["submitted","needs_review","approved","rejected"],
  recruiting_active: ["completed","on_hold"],
  completed:         [],
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status as RequestStatus];
  if (!meta) return <Badge>{status}</Badge>;
  const Icon = meta.icon;
  return (
    <Badge className={`flex items-center gap-1 text-xs border no-default-hover-elevate no-default-active-elevate ${meta.badgeClass}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </Badge>
  );
}

function PriorityBadge({ urgency }: { urgency: number }) {
  const p = PRIORITY_LABELS[urgency] || PRIORITY_LABELS[2];
  return (
    <Badge className={`text-xs border no-default-hover-elevate no-default-active-elevate ${p.class}`}>
      {p.label}
    </Badge>
  );
}

// ── Activity timeline ──────────────────────────────────────────────────────────
function ActivityTimeline({ requestId }: { requestId: string }) {
  const { data: events = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/recruiting/requests", requestId, "activity"],
    queryFn: () => fetch(`/api/recruiting/requests/${requestId}/activity`).then((r) => r.json()),
    staleTime: 30_000,
  });

  if (isLoading) return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
    </div>
  );

  if (events.length === 0) return (
    <p className="text-xs text-muted-foreground text-center py-4">No activity recorded yet.</p>
  );

  return (
    <div className="space-y-3">
      {events.map((ev: any, i: number) => {
        const fromMeta = STATUS_META[ev.fromStatus as RequestStatus];
        const toMeta   = STATUS_META[ev.toStatus   as RequestStatus];
        return (
          <div key={ev.id ?? i} className="flex gap-2.5">
            <div className="flex flex-col items-center">
              <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <Activity className="h-2.5 w-2.5 text-muted-foreground" />
              </div>
              {i < events.length - 1 && <div className="w-px flex-1 bg-border mt-1 mb-0" />}
            </div>
            <div className="pb-3 flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-medium">{ev.userName || "System"}</span>
                {ev.fromStatus && ev.toStatus && (
                  <>
                    <span className="text-xs text-muted-foreground">moved from</span>
                    <Badge className={`text-[10px] no-default-hover-elevate no-default-active-elevate border ${fromMeta?.badgeClass ?? "bg-muted"}`}>
                      {fromMeta?.label ?? ev.fromStatus}
                    </Badge>
                    <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                    <Badge className={`text-[10px] no-default-hover-elevate no-default-active-elevate border ${toMeta?.badgeClass ?? "bg-muted"}`}>
                      {toMeta?.label ?? ev.toStatus}
                    </Badge>
                  </>
                )}
                {ev.action === "note" && <span className="text-xs text-muted-foreground">added a note</span>}
                {ev.action === "attachment" && <span className="text-xs text-muted-foreground">added an attachment</span>}
              </div>
              {ev.notes && (
                <p className="text-xs text-muted-foreground mt-1 italic">"{ev.notes}"</p>
              )}
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                {ev.createdAt ? format(new Date(ev.createdAt), "MMM d, yyyy 'at' h:mm a") : "—"}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Status Change Dialog ───────────────────────────────────────────────────────
function StatusChangeDialog({
  open, onOpenChange, request, onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request: any;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [targetStatus, setTargetStatus] = useState<RequestStatus | "">("");
  const [notes, setNotes] = useState("");
  const currentStatus = request?.requestStatus as RequestStatus;
  const nextOptions   = NEXT_STATUSES[currentStatus] ?? [];

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/recruiting/requests/${request.id}/status`, {
        requestStatus: targetStatus,
        reviewNotes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requests", request.id, "activity"] });
      toast({ title: "Status updated", description: `Request moved to ${STATUS_META[targetStatus as RequestStatus]?.label}.` });
      onOpenChange(false);
      setTargetStatus("");
      setNotes("");
      onSuccess();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update Request Status</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Current:</span>
            <StatusBadge status={currentStatus} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Move to</Label>
            <Select value={targetStatus} onValueChange={(v) => setTargetStatus(v as RequestStatus)}>
              <SelectTrigger data-testid="select-target-status"><SelectValue placeholder="Select new status…" /></SelectTrigger>
              <SelectContent>
                {nextOptions.map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">
              Notes
              {targetStatus === "rejected" && <span className="text-red-500 ml-1">*</span>}
              {targetStatus !== "rejected" && <span className="text-muted-foreground ml-1">(optional)</span>}
            </Label>
            <Textarea
              rows={3}
              placeholder="Reason for status change, instructions, or notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid="textarea-status-notes"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!targetStatus || mutation.isPending || (targetStatus === "rejected" && !notes.trim())}
            data-testid="button-confirm-status-change"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-1.5" />}
            Update Status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Request Detail Panel ───────────────────────────────────────────────────────
function RequestDetailPanel({
  request, isAdmin, onClose, onStatusChange,
}: {
  request: any; isAdmin: boolean; onClose: () => void; onStatusChange: () => void;
}) {
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const priority = PRIORITY_LABELS[request.urgency] || PRIORITY_LABELS[2];
  const canTransition = isAdmin && (NEXT_STATUSES[request.requestStatus as RequestStatus] ?? []).length > 0;

  return (
    <div className="w-[420px] border-l bg-background flex flex-col overflow-hidden" data-testid="panel-request-detail">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              {request.requestNumber && (
                <span className="text-xs font-mono text-muted-foreground">{request.requestNumber}</span>
              )}
              <StatusBadge status={request.requestStatus} />
              <PriorityBadge urgency={request.urgency} />
            </div>
            <h2 className="text-sm font-semibold mt-1.5" data-testid="text-detail-market">
              {request.market || request.dealershipName || "Unnamed Request"}
            </h2>
            <p className="text-xs text-muted-foreground">
              Submitted {request.submittedAt ? format(new Date(request.submittedAt), "MMM d, yyyy") : "—"}
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        {canTransition && (
          <Button
            size="sm"
            className="mt-3 w-full"
            onClick={() => setStatusDialogOpen(true)}
            data-testid="button-update-status"
          >
            <ArrowRight className="h-3.5 w-3.5 mr-1.5" />
            Update Status
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Submitted By",    value: request.submittedByName || "—" },
              { label: "Market",          value: request.market || "—" },
              { label: "Network",         value: request.network || "—" },
              { label: "Drivers Needed",  value: request.targetDriverCount ?? "—" },
              { label: "Start Date",      value: request.targetDate ? format(new Date(request.targetDate), "MMM d, yyyy") : "—" },
              { label: "Campaign Type",   value: request.campaignType || "—" },
            ].map(({ label, value }) => (
              <div key={label} className="space-y-0.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
                <p className="text-xs font-medium capitalize">{String(value)}</p>
              </div>
            ))}
          </div>

          {/* Driver Types */}
          {request.driverTypes?.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Driver Types</p>
              <div className="flex flex-wrap gap-1">
                {request.driverTypes.map((t: string) => (
                  <Badge key={t} className="text-xs no-default-hover-elevate no-default-active-elevate">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Business Reason */}
          {(request.businessReason || request.additionalComments) && (
            <div className="space-y-1">
              {request.businessReason && (
                <div className="space-y-0.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Business Reason</p>
                  <p className="text-xs">{request.businessReason}</p>
                </div>
              )}
              {request.additionalComments && (
                <div className="space-y-0.5 mt-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Comments</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{request.additionalComments}</p>
                </div>
              )}
            </div>
          )}

          {/* Attachments */}
          {request.attachments?.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Attachments ({request.attachments.length})
              </p>
              {request.attachments.map((url: string, i: number) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <Paperclip className="h-3 w-3" />
                  Attachment {i + 1}
                </a>
              ))}
            </div>
          )}

          {/* Approval info */}
          {(request.reviewedBy || request.approvedBy) && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Review History</p>
                {request.reviewedBy && (
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-muted-foreground">Reviewed by</p>
                    <p className="text-xs font-medium">{request.reviewedBy}</p>
                    {request.reviewNotes && (
                      <p className="text-xs text-muted-foreground italic mt-0.5">"{request.reviewNotes}"</p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Activity log */}
          <Separator />
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Activity Log</p>
            <ActivityTimeline requestId={request.id} />
          </div>
        </div>
      </ScrollArea>

      <StatusChangeDialog
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        request={request}
        onSuccess={onStatusChange}
      />
    </div>
  );
}

// ── Request Card ───────────────────────────────────────────────────────────────
function RequestCard({
  request, isSelected, onClick,
}: { request: any; isSelected: boolean; onClick: () => void }) {
  const priority = PRIORITY_LABELS[request.urgency] || PRIORITY_LABELS[2];
  return (
    <div
      className={`p-3.5 border rounded-md cursor-pointer hover-elevate transition-colors ${
        isSelected ? "border-primary/40 bg-primary/5" : "bg-background"
      }`}
      onClick={onClick}
      data-testid={`card-request-${request.id}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {request.requestNumber && (
              <span className="text-[10px] font-mono text-muted-foreground">{request.requestNumber}</span>
            )}
            <StatusBadge status={request.requestStatus} />
          </div>
          <p className="text-sm font-medium mt-1 truncate">
            {request.market || request.dealershipName || "Unnamed Request"}
          </p>
        </div>
        <PriorityBadge urgency={request.urgency} />
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        {request.submittedByName && (
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />{request.submittedByName}
          </span>
        )}
        {request.targetDriverCount && (
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />{request.targetDriverCount} drivers
          </span>
        )}
        {request.driverTypes?.length > 0 && (
          <span className="flex items-center gap-1">
            <Tag className="h-3 w-3" />{request.driverTypes.slice(0, 2).join(", ")}
            {request.driverTypes.length > 2 && ` +${request.driverTypes.length - 2}`}
          </span>
        )}
        {request.submittedAt && (
          <span className="flex items-center gap-1 ml-auto">
            <Calendar className="h-3 w-3" />
            {format(new Date(request.submittedAt), "MMM d")}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function RecruitingRequestsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = ADMIN_ROLES.includes((user as any)?.role ?? "");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RequestStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: requests = [], isLoading, refetch, isFetching } = useQuery<any[]>({
    queryKey: ["/api/recruiting/requests"],
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    let list = requests;
    if (statusFilter !== "all") {
      list = list.filter((r) => r.requestStatus === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.market?.toLowerCase().includes(q) ||
        r.submittedByName?.toLowerCase().includes(q) ||
        r.requestNumber?.toLowerCase().includes(q) ||
        r.businessReason?.toLowerCase().includes(q) ||
        r.network?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [requests, statusFilter, search]);

  const counts = useMemo(() =>
    ALL_STATUSES.reduce<Record<string, number>>((acc, s) => {
      acc[s] = requests.filter((r) => r.requestStatus === s).length;
      return acc;
    }, { all: requests.length }),
  [requests]);

  const selectedRequest = requests.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]" data-testid="page-recruiting-requests">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b bg-background flex-wrap">
        <div>
          <h1 className="text-sm font-semibold">Recruiting Requests</h1>
          <p className="text-xs text-muted-foreground">{requests.length} total · {counts["submitted"] ?? 0} pending review</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-requests">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── List panel ── */}
        <div className={`flex flex-col ${selectedRequest ? "w-[480px] border-r" : "flex-1"} bg-background`}>

          {/* Search + status filter */}
          <div className="p-3 border-b space-y-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-sm"
                placeholder="Search by market, submitter, or request #…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search-requests"
              />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              <button
                onClick={() => setStatusFilter("all")}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border shrink-0 transition-colors ${
                  statusFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "hover-elevate"
                }`}
                data-testid="filter-all"
              >
                All <span className="tabular-nums">({counts.all})</span>
              </button>
              {ALL_STATUSES.filter((s) => counts[s] > 0 || statusFilter === s).map((s) => {
                const meta = STATUS_META[s];
                const Icon = meta.icon;
                return (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border shrink-0 transition-colors ${
                      statusFilter === s
                        ? "bg-primary text-primary-foreground border-primary"
                        : `hover-elevate ${meta.badgeClass}`
                    }`}
                    data-testid={`filter-${s}`}
                  >
                    <Icon className="h-2.5 w-2.5" />
                    {meta.label}
                    <span className="tabular-nums">({counts[s] ?? 0})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Request list */}
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
                  <Loader2 className="h-5 w-5 animate-spin" /> Loading requests…
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                  <ClipboardList className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No requests found</p>
                  {search && <p className="text-xs">Try adjusting your search or filter</p>}
                </div>
              ) : (
                filtered.map((r) => (
                  <RequestCard
                    key={r.id}
                    request={r}
                    isSelected={r.id === selectedId}
                    onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* ── Detail panel ── */}
        {selectedRequest && (
          <div className="flex-1 overflow-hidden">
            <RequestDetailPanel
              request={selectedRequest}
              isAdmin={isAdmin}
              onClose={() => setSelectedId(null)}
              onStatusChange={() => queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requests"] })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
