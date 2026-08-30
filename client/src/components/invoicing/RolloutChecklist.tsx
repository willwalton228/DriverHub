import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CheckCircle2, Circle, XCircle, ShieldCheck, RotateCcw, History,
  ChevronDown, ChevronUp, StickyNote, Lock, Plus, Clock, Users,
  TriangleAlert, RefreshCw, ChevronRight, BookOpen, ShieldAlert,
  CircleUser, UserCheck
} from "lucide-react";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

type RequiredRole = "billing_team" | "controller" | "owner";
type ItemStatus   = "not_started" | "completed" | "reopened";

interface ChecklistItem {
  id: string;
  checklist_id: string;
  section: string;
  label: string;
  description: string | null;
  sort_order: number;
  status: ItemStatus;
  required_role: RequiredRole;
  completed_by: string | null;
  completed_by_name: string | null;
  completed_at: string | null;
  notes: string | null;
  reopen_reason: string | null;
}

interface Checklist {
  id: string;
  period_label: string;
  status: "in_progress" | "certified" | "reopened";
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  certified_by: string | null;
  certified_by_name: string | null;
  certified_at: string | null;
  certification_notes: string | null;
  reopened_by: string | null;
  reopened_by_name: string | null;
  reopened_at: string | null;
  reopen_reason: string | null;
}

interface AuditEntry {
  id: string;
  checklist_id: string;
  item_id: string | null;
  action: string;
  actor_id: string;
  actor_name: string | null;
  notes: string | null;
  item_label: string | null;
  item_section: string | null;
  before_status: string | null;
  after_status: string | null;
  checklist_section: string | null;
  created_at: string;
}

interface ChecklistData {
  checklist: Checklist | null;
  items: ChecklistItem[];
  audit: AuditEntry[];
}

interface ChecklistListItem {
  id: string;
  period_label: string;
  status: string;
  created_by_name: string | null;
  certified_by_name: string | null;
  created_at: string;
  certified_at: string | null;
  total_items: number;
  completed_items: number;
}

// ─── Role Constants ───────────────────────────────────────────────────────────

const OWNER_ROLES      = ["super_user", "super_admin", "root_super_admin"];
const CONTROLLER_ROLES = ["finance", "admin", "corporate_admin", ...OWNER_ROLES];
const BILLING_ROLES    = ["billing", "finance", "admin", "corporate_admin", ...OWNER_ROLES];

function isAuthorizedForRole(userRole: string | undefined, requiredRole: RequiredRole): boolean {
  if (!userRole) return false;
  if (OWNER_ROLES.includes(userRole)) return true;
  if (requiredRole === "billing_team") return BILLING_ROLES.includes(userRole);
  if (requiredRole === "controller")   return CONTROLLER_ROLES.includes(userRole);
  if (requiredRole === "owner")        return OWNER_ROLES.includes(userRole);
  return false;
}

// ─── Section Constants ────────────────────────────────────────────────────────

const SECTION_META: Record<string, { label: string; icon: React.ReactNode; requiredRole: RequiredRole }> = {
  invoice_accuracy:     { label: "A. Invoice Accuracy Checks",    icon: <BookOpen className="w-4 h-4" />,      requiredRole: "billing_team" },
  revenue_completeness: { label: "B. Revenue Completeness",       icon: <ShieldCheck className="w-4 h-4" />,   requiredRole: "billing_team" },
  payment_posting:      { label: "C. Payment & Posting",          icon: <CheckCircle2 className="w-4 h-4" />,  requiredRole: "billing_team" },
  deposit_validation:   { label: "D. Deposit Validation",         icon: <Lock className="w-4 h-4" />,          requiredRole: "controller" },
  exception_review:     { label: "E. Exception Review",           icon: <TriangleAlert className="w-4 h-4" />, requiredRole: "controller" },
};

const SECTION_ORDER = ["invoice_accuracy", "revenue_completeness", "payment_posting", "deposit_validation", "exception_review"];

const ROLE_DISPLAY: Record<RequiredRole, { label: string; badgeCls: string; icon: React.ReactNode }> = {
  billing_team: {
    label: "Billing Team",
    badgeCls: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
    icon: <Users className="w-3 h-3 mr-1" />,
  },
  controller: {
    label: "Controller",
    badgeCls: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
    icon: <UserCheck className="w-3 h-3 mr-1" />,
  },
  owner: {
    label: "Owner",
    badgeCls: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
    icon: <ShieldAlert className="w-3 h-3 mr-1" />,
  },
};

const ACTION_LABELS: Record<string, string> = {
  checklist_created:   "Checklist Created",
  checklist_certified: "Certified",
  checklist_reopened:  "Reopened (Full)",
  item_completed:      "Item Completed",
  item_reopened:       "Item Reopened",
};

const SECTION_COLORS: Record<string, string> = {
  invoice_accuracy:     "blue",
  revenue_completeness: "green",
  payment_posting:      "violet",
  deposit_validation:   "orange",
  exception_review:     "red",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return "—";
  try { return format(new Date(d), "MMM d, yyyy h:mm a"); } catch { return d; }
}

function RoleBadge({ role }: { role: RequiredRole }) {
  const rd = ROLE_DISPLAY[role];
  return (
    <Badge className={`text-xs no-default-active-elevate ${rd.badgeCls}`}>
      {rd.icon}{rd.label}
    </Badge>
  );
}

function statusBadge(status: string) {
  if (status === "certified")   return <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 text-xs no-default-active-elevate"><ShieldCheck className="w-3 h-3 mr-1" />Certified</Badge>;
  if (status === "in_progress") return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 text-xs no-default-active-elevate"><Clock className="w-3 h-3 mr-1" />In Progress</Badge>;
  if (status === "reopened")    return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-xs no-default-active-elevate"><RotateCcw className="w-3 h-3 mr-1" />Reopened</Badge>;
  return <Badge className="text-xs">{status}</Badge>;
}

function sectionCardColors(section: string) {
  const c = SECTION_COLORS[section] ?? "default";
  const completedBg: Record<string, string> = {
    blue:    "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
    green:   "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
    violet:  "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800",
    orange:  "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800",
    red:     "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
    default: "bg-muted/40 border-border",
  };
  const iconColor: Record<string, string> = {
    blue: "text-blue-600 dark:text-blue-400", green: "text-green-600 dark:text-green-400",
    violet: "text-violet-600 dark:text-violet-400", orange: "text-orange-600 dark:text-orange-400",
    red: "text-red-600 dark:text-red-400", default: "text-muted-foreground",
  };
  const sectionBadge: Record<string, string> = {
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
    green: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
    violet: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
    orange: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
    red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    default: "bg-muted text-muted-foreground",
  };
  return { completedBg: completedBg[c] ?? completedBg.default, iconColor: iconColor[c] ?? iconColor.default, sectionBadge: sectionBadge[c] ?? sectionBadge.default };
}

// ─── Dialogs ──────────────────────────────────────────────────────────────────

function ReopenItemDialog({ item, open, onClose, onConfirm, loading }: {
  item: ChecklistItem | null; open: boolean; onClose: () => void;
  onConfirm: (reason: string) => void; loading: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setReason(""); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Reopen Checklist Item</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Removing completion from <span className="font-medium text-foreground">"{item?.label}"</span>. This action will be logged to the audit trail.
        </p>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold">Reason for reopening <span className="text-red-500">*</span></label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this item needs to be redone..." className="text-sm min-h-[80px]"
            data-testid="input-reopen-reason" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={() => onConfirm(reason)} disabled={!reason.trim() || loading} data-testid="button-confirm-reopen-item">
            {loading ? "Reopening..." : "Reopen Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NotesDialog({ item, open, onClose, onSave, loading }: {
  item: ChecklistItem | null; open: boolean; onClose: () => void;
  onSave: (notes: string) => void; loading: boolean;
}) {
  const [notes, setNotes] = useState(item?.notes ?? "");
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Notes — {item?.label}</DialogTitle></DialogHeader>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Add completion notes for this checklist item..." className="text-sm min-h-[100px]"
          data-testid="input-item-notes" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={() => onSave(notes)} disabled={loading} data-testid="button-save-notes">
            {loading ? "Saving..." : "Save Notes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CertifyModal({ open, checklist, isOwner, onClose, onConfirm, loading }: {
  open: boolean; checklist: Checklist | null; isOwner: boolean;
  onClose: () => void; onConfirm: (notes: string) => void; loading: boolean;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [notes, setNotes] = useState("");
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setConfirmed(false); setNotes(""); onClose(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-green-600" />Submit for Certification
          </DialogTitle>
        </DialogHeader>
        {!isOwner ? (
          <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-800 dark:text-red-300">
            <p className="font-medium">Owner Access Required</p>
            <p className="mt-1 text-xs">Only an Owner (super_user, super_admin, root_super_admin) can submit final certification. Contact your system owner to proceed.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md bg-muted/50 border px-4 py-3 text-sm space-y-1">
              <p className="font-medium">{checklist?.period_label}</p>
              <p className="text-muted-foreground">All items completed. Certifying will lock this checklist and make it immutable.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Certification Notes (optional)</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Any final notes or observations for the record..." className="text-sm min-h-[70px]"
                data-testid="input-certification-notes" />
            </div>
            <div className="flex items-start gap-3 rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/40 px-3 py-2.5">
              <Checkbox id="certify-confirm" checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} data-testid="checkbox-certify-confirm" className="mt-0.5" />
              <label htmlFor="certify-confirm" className="text-xs cursor-pointer text-green-900 dark:text-green-200 leading-relaxed">
                I certify that all rollout review steps have been completed and reviewed for accuracy. This checklist is accurate to the best of my knowledge and I am authorized to provide final certification.
              </label>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {isOwner ? "Cancel" : "Close"}
          </Button>
          {isOwner && (
            <Button onClick={() => onConfirm(notes)} disabled={!confirmed || loading}
              className="bg-green-700 text-white" data-testid="button-submit-certification">
              {loading ? "Certifying..." : "Certify Checklist"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReopenChecklistDialog({ open, onClose, onConfirm, loading }: {
  open: boolean; onClose: () => void; onConfirm: (reason: string) => void; loading: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setReason(""); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Reopen Certified Checklist</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Reopening a certified checklist removes its locked status. This requires Owner authorization and is permanently logged.
        </p>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold">Reason for reopening <span className="text-red-500">*</span></label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this certified checklist must be reopened..." className="text-sm min-h-[80px]"
            data-testid="input-reopen-checklist-reason" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={() => onConfirm(reason)} disabled={!reason.trim() || loading} data-testid="button-confirm-reopen-checklist">
            {loading ? "Reopening..." : "Reopen Checklist"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Form ──────────────────────────────────────────────────────────────

function CreateChecklistForm({ onCreate, creating }: { onCreate: (label: string) => void; creating: boolean }) {
  const [label, setLabel] = useState(() => {
    const now = new Date();
    return `${now.toLocaleString("default", { month: "long" })} ${now.getFullYear()} Rollout`;
  });
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-5 text-center">
      <div className="flex flex-col items-center gap-2">
        <ShieldCheck className="w-10 h-10 text-primary/40" />
        <h3 className="text-base font-semibold">No Active Checklist</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Create a rollout control checklist for this billing period. All 15 standard control items will be seeded automatically with assigned roles.
        </p>
      </div>
      <div className="flex items-center gap-2 w-full max-w-sm">
        <Input value={label} onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. April 2026 Rollout" className="text-sm" data-testid="input-period-label" />
        <Button onClick={() => onCreate(label)} disabled={!label.trim() || creating} data-testid="button-create-checklist">
          <Plus className="w-4 h-4 mr-1.5" />{creating ? "Creating..." : "Create"}
        </Button>
      </div>
    </div>
  );
}

// ─── History Panel ────────────────────────────────────────────────────────────

function HistoryPanel({ onSelect }: { onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery<{ checklists: ChecklistListItem[] }>({
    queryKey: ["/api/corporate/invoicing/rollout-checklist/all"],
    queryFn: () => apiRequest("GET", "/api/corporate/invoicing/rollout-checklist/all").then(r => r.json()),
    enabled: open,
  });
  return (
    <div>
      <Button size="sm" variant="outline" onClick={() => setOpen(!open)} data-testid="button-toggle-history">
        <History className="w-3.5 h-3.5 mr-1.5" />History
        {open ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
      </Button>
      {open && (
        <div className="mt-3 space-y-2">
          {(data?.checklists ?? []).map(cl => (
            <div key={cl.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 hover-elevate" data-testid={`history-item-${cl.id}`}>
              <div>
                <p className="text-sm font-medium">{cl.period_label}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(cl.created_at)} · {cl.completed_items}/{cl.total_items} complete</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {statusBadge(cl.status)}
                <Button size="sm" variant="ghost" onClick={() => { setOpen(false); onSelect(cl.id); }} data-testid={`button-view-history-${cl.id}`}>View</Button>
              </div>
            </div>
          ))}
          {!data?.checklists?.length && <p className="text-xs text-muted-foreground text-center py-4">No checklist history found.</p>}
        </div>
      )}
    </div>
  );
}

// ─── Audit Log Panel ──────────────────────────────────────────────────────────

function AuditPanel({ checklistId }: { checklistId: string }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery<{ audit: AuditEntry[] }>({
    queryKey: ["/api/corporate/invoicing/rollout-checklist", checklistId, "audit"],
    queryFn: () => apiRequest("GET", `/api/corporate/invoicing/rollout-checklist/${checklistId}/audit`).then(r => r.json()),
    enabled: open,
  });

  return (
    <div>
      <Button size="sm" variant="outline" onClick={() => setOpen(!open)} data-testid="button-toggle-audit">
        <History className="w-3.5 h-3.5 mr-1.5" />{open ? "Hide" : "View"} Audit Log
        {open ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
      </Button>
      {open && (
        <div className="mt-3 rounded-md border overflow-x-auto">
          <table className="w-full text-xs min-w-[700px]">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">When</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Action</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">By</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Before</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">After</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Item</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Notes</th>
              </tr>
            </thead>
            <tbody>
              {(data?.audit ?? []).map((entry) => (
                <tr key={entry.id} className="border-b last:border-0">
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{fmtDate(entry.created_at)}</td>
                  <td className="px-3 py-2">
                    <Badge className={`text-xs no-default-active-elevate ${
                      entry.action === "checklist_certified" ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" :
                      entry.action === "checklist_reopened"  ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" :
                      entry.action === "item_completed"      ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" :
                      entry.action === "item_reopened"       ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{entry.actor_name ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground capitalize">{entry.before_status?.replace(/_/g, " ") ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground capitalize">{entry.after_status?.replace(/_/g, " ") ?? "—"}</td>
                  <td className="px-3 py-2 max-w-[150px] truncate text-muted-foreground">{entry.item_label ?? "—"}</td>
                  <td className="px-3 py-2 max-w-[180px] truncate text-muted-foreground">{entry.notes ?? "—"}</td>
                </tr>
              ))}
              {!data?.audit?.length && (
                <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">No audit entries yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Section Group ────────────────────────────────────────────────────────────

function SectionGroup({
  section, items, locked, userRole,
  onComplete, onRequestReopen, onOpenNotes,
}: {
  section: string;
  items: ChecklistItem[];
  locked: boolean;
  userRole: string | undefined;
  onComplete: (item: ChecklistItem) => void;
  onRequestReopen: (item: ChecklistItem) => void;
  onOpenNotes: (item: ChecklistItem) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const meta = SECTION_META[section] ?? { label: section, icon: null, requiredRole: "billing_team" as RequiredRole };
  const { completedBg, iconColor, sectionBadge } = sectionCardColors(section);
  const completedCount = items.filter(i => i.status === "completed").length;
  const allDone = completedCount === items.length;

  return (
    <Card>
      <CardHeader className="py-3 px-4 cursor-pointer select-none" onClick={() => setCollapsed(!collapsed)}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={iconColor}>{meta.icon}</span>
            <CardTitle className="text-sm font-semibold">{meta.label}</CardTitle>
            <RoleBadge role={meta.requiredRole} />
            <Badge className={`text-xs no-default-active-elevate ${allDone ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : sectionBadge}`}>
              {completedCount}/{items.length}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {allDone && <CheckCircle2 className="w-4 h-4 text-green-500" />}
            {collapsed ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="pt-0 pb-3 px-4 space-y-2">
          {items.map((item) => {
            const done     = item.status === "completed";
            const reopened = item.status === "reopened";
            const canAct   = !locked && isAuthorizedForRole(userRole, item.required_role);
            const roleLabel = ROLE_DISPLAY[item.required_role]?.label ?? item.required_role;

            return (
              <div
                key={item.id}
                className={`rounded-md border px-3 py-2.5 flex items-start gap-3 transition-colors ${done ? completedBg : "border-border bg-background"}`}
                data-testid={`checklist-item-${item.id}`}
              >
                {/* Checkbox / Status indicator */}
                <div className="mt-0.5 shrink-0">
                  {locked ? (
                    done
                      ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                      : <Circle className="w-4 h-4 text-muted-foreground/40" />
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Checkbox
                            checked={done}
                            disabled={!canAct}
                            onCheckedChange={(v) => { if (v) onComplete(item); else onRequestReopen(item); }}
                            data-testid={`checkbox-item-${item.id}`}
                            className={!canAct ? "opacity-40" : ""}
                          />
                        </span>
                      </TooltipTrigger>
                      {!canAct && (
                        <TooltipContent side="right">
                          {locked ? "Checklist is certified and locked." : `Requires ${roleLabel} access to complete.`}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Row 1: label + role badge */}
                  <div className="flex items-start gap-2 flex-wrap">
                    <p className={`text-sm font-medium leading-snug ${reopened ? "text-amber-700 dark:text-amber-400" : ""}`}>
                      {item.label}
                    </p>
                    <RoleBadge role={item.required_role} />
                    {/* Authorization indicator */}
                    {!locked && (
                      <Badge className={`text-xs no-default-active-elevate ${
                        canAct
                          ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {canAct
                          ? <><CheckCircle2 className="w-3 h-3 mr-1" />Authorized</>
                          : <><XCircle className="w-3 h-3 mr-1" />View Only</>
                        }
                      </Badge>
                    )}
                  </div>

                  {/* Description */}
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.description}</p>
                  )}

                  {/* Status row */}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs text-muted-foreground">
                    {done && (
                      <>
                        <span className="text-green-700 dark:text-green-400 font-medium">Completed</span>
                        {item.completed_by_name && (
                          <><span>·</span><Users className="w-3 h-3" /><span>{item.completed_by_name}</span></>
                        )}
                        {item.completed_at && (
                          <><span>·</span><Clock className="w-3 h-3" /><span>{fmtDate(item.completed_at)}</span></>
                        )}
                      </>
                    )}
                    {reopened && (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">
                        Reopened{item.reopen_reason ? `: ${item.reopen_reason}` : ""}
                      </span>
                    )}
                    {item.status === "not_started" && <span className="text-muted-foreground/60">Not started</span>}
                  </div>

                  {/* Notes */}
                  {item.notes && (
                    <div className="flex items-start gap-1 mt-1.5">
                      <StickyNote className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                      <p className="text-xs text-muted-foreground">{item.notes}</p>
                    </div>
                  )}
                </div>

                {/* Action buttons — only shown if authorized */}
                {canAct && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onOpenNotes(item)} data-testid={`button-notes-${item.id}`}>
                          <StickyNote className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{item.notes ? "Edit notes" : "Add notes"}</TooltipContent>
                    </Tooltip>
                    {done && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onRequestReopen(item)} data-testid={`button-reopen-${item.id}`}>
                            <RotateCcw className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Reopen item</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Progress Summary ─────────────────────────────────────────────────────────

function ProgressSummary({ items }: { items: ChecklistItem[] }) {
  const total     = items.length;
  const completed = items.filter(i => i.status === "completed").length;
  const remaining = total - completed;
  const pct       = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone   = remaining === 0 && total > 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: "Total Items",      value: total,     cls: "text-foreground" },
        { label: "Completed",        value: completed,  cls: "text-green-700 dark:text-green-400" },
        { label: "Remaining",        value: remaining,  cls: remaining > 0 ? "text-orange-700 dark:text-orange-400" : "text-green-700 dark:text-green-400" },
        { label: "Progress",         value: `${pct}%`, cls: allDone ? "text-green-700 dark:text-green-400" : "text-foreground" },
      ].map(({ label, value, cls }) => (
        <Card key={label}>
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-xl font-bold mt-0.5 ${cls}`}>{value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function RolloutChecklist() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reopenItemTarget, setReopenItemTarget] = useState<ChecklistItem | null>(null);
  const [notesTarget, setNotesTarget] = useState<ChecklistItem | null>(null);
  const [certifyOpen, setCertifyOpen] = useState(false);
  const [reopenChecklistOpen, setReopenChecklistOpen] = useState(false);

  const userRole  = user?.role as string | undefined;
  const isOwner   = OWNER_ROLES.includes(userRole ?? "");

  const { data, isLoading } = useQuery<ChecklistData>({
    queryKey: ["/api/corporate/invoicing/rollout-checklist", selectedId ?? "current"],
    queryFn: () => apiRequest("GET", "/api/corporate/invoicing/rollout-checklist").then(r => r.json()),
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["/api/corporate/invoicing/rollout-checklist"] });
    qc.invalidateQueries({ queryKey: ["/api/corporate/invoicing/rollout-checklist/all"] });
  }

  const createMutation = useMutation({
    mutationFn: (periodLabel: string) =>
      apiRequest("POST", "/api/corporate/invoicing/rollout-checklist", { periodLabel }).then(r => r.json()),
    onSuccess: () => { invalidate(); toast({ title: "Checklist created", description: "All 15 control items have been seeded with role assignments." }); },
    onError:   () => toast({ title: "Error", description: "Failed to create checklist.", variant: "destructive" }),
  });

  const completeMutation = useMutation({
    mutationFn: ({ itemId, notes }: { itemId: string; notes?: string }) =>
      apiRequest("PATCH", `/api/corporate/invoicing/rollout-checklist/items/${itemId}/complete`, { notes }).then(async r => {
        if (!r.ok) { const e = await r.json(); throw new Error(e.message ?? "Failed"); }
        return r.json();
      }),
    onSuccess: () => invalidate(),
    onError:   (e: any) => toast({ title: "Cannot complete item", description: e.message ?? "Access denied.", variant: "destructive" }),
  });

  const reopenItemMutation = useMutation({
    mutationFn: ({ itemId, reason }: { itemId: string; reason: string }) =>
      apiRequest("PATCH", `/api/corporate/invoicing/rollout-checklist/items/${itemId}/reopen`, { reason }).then(async r => {
        if (!r.ok) { const e = await r.json(); throw new Error(e.message ?? "Failed"); }
        return r.json();
      }),
    onSuccess: () => { invalidate(); setReopenItemTarget(null); toast({ title: "Item reopened", description: "The action has been logged to the audit trail." }); },
    onError:   (e: any) => toast({ title: "Cannot reopen item", description: e.message ?? "Access denied.", variant: "destructive" }),
  });

  const notesMutation = useMutation({
    mutationFn: ({ itemId, notes }: { itemId: string; notes: string }) =>
      apiRequest("PATCH", `/api/corporate/invoicing/rollout-checklist/items/${itemId}/notes`, { notes }).then(r => r.json()),
    onSuccess: () => { invalidate(); setNotesTarget(null); },
    onError:   () => toast({ title: "Error", description: "Failed to save notes.", variant: "destructive" }),
  });

  const certifyMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      apiRequest("POST", `/api/corporate/invoicing/rollout-checklist/${id}/certify`, { notes, confirmed: true }).then(async r => {
        if (!r.ok) { const e = await r.json(); throw new Error(e.message ?? "Failed"); }
        return r.json();
      }),
    onSuccess: () => { invalidate(); setCertifyOpen(false); toast({ title: "Checklist certified", description: "The checklist is now locked and immutable." }); },
    onError:   (e: any) => toast({ title: "Certification failed", description: e.message ?? "An error occurred.", variant: "destructive" }),
  });

  const reopenChecklistMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("POST", `/api/corporate/invoicing/rollout-checklist/${id}/reopen`, { reason }).then(async r => {
        if (!r.ok) { const e = await r.json(); throw new Error(e.message ?? "Failed"); }
        return r.json();
      }),
    onSuccess: () => { invalidate(); setReopenChecklistOpen(false); toast({ title: "Checklist reopened", description: "The certified status has been removed." }); },
    onError:   (e: any) => toast({ title: "Error", description: e.message ?? "Failed to reopen.", variant: "destructive" }),
  });

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-md" />)}</div>;
  }

  const { checklist, items } = data ?? { checklist: null, items: [] };

  if (!checklist) {
    return (
      <div className="space-y-4">
        <HistoryPanel onSelect={setSelectedId} />
        <CreateChecklistForm onCreate={(label) => createMutation.mutate(label)} creating={createMutation.isPending} />
      </div>
    );
  }

  // Group by section
  const grouped: Record<string, ChecklistItem[]> = {};
  for (const item of items) {
    if (!grouped[item.section]) grouped[item.section] = [];
    grouped[item.section].push(item);
  }

  const totalItems     = items.length;
  const completedItems = items.filter(i => i.status === "completed").length;
  const remaining      = totalItems - completedItems;
  const allComplete    = totalItems > 0 && completedItems === totalItems;
  const locked         = checklist.status === "certified";
  const pct            = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold">{checklist.period_label}</h2>
            {statusBadge(checklist.status)}
            {allComplete && !locked && (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 text-xs no-default-active-elevate">
                <ShieldCheck className="w-3 h-3 mr-1" />Ready for Certification
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Created by {checklist.created_by_name ?? "—"} · {fmtDate(checklist.created_at)}
          </p>
          {locked && (
            <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
              <strong>Certified</strong> by {checklist.certified_by_name} · {fmtDate(checklist.certified_at)}
              {checklist.certification_notes && ` — "${checklist.certification_notes}"`}
            </p>
          )}
          {checklist.status === "reopened" && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              Reopened by {checklist.reopened_by_name} · {checklist.reopen_reason}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <HistoryPanel onSelect={(id) => setSelectedId(id)} />
          <Button size="sm" variant="outline" onClick={() => setSelectedId(null)} data-testid="button-new-checklist">
            <Plus className="w-3.5 h-3.5 mr-1.5" />New Period
          </Button>
          {locked && isOwner && (
            <Button size="sm" variant="outline" onClick={() => setReopenChecklistOpen(true)} data-testid="button-reopen-checklist">
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />Reopen
            </Button>
          )}
        </div>
      </div>

      {/* ── Role legend ── */}
      <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
        <span className="font-medium">Role assignments:</span>
        {(Object.keys(ROLE_DISPLAY) as RequiredRole[]).map(r => (
          <span key={r} className="flex items-center gap-1">
            <RoleBadge role={r} />
          </span>
        ))}
        <span>· Your role: <span className="font-semibold capitalize">{userRole?.replace(/_/g, " ") ?? "—"}</span></span>
      </div>

      {/* ── Certified lock banner ── */}
      {locked && (
        <div className="flex items-center gap-2.5 rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 px-4 py-3">
          <Lock className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
          <p className="text-sm text-green-800 dark:text-green-300">
            This checklist is <strong>certified and locked</strong>. All items are read-only.
            {isOwner ? " You can reopen it using the Reopen button above." : " Only an Owner can reopen it."}
          </p>
        </div>
      )}

      {/* ── Progress summary ── */}
      <ProgressSummary items={items} />

      {/* ── Progress bar ── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{completedItems} of {totalItems} items completed</span>
          <span className="font-semibold">{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${allComplete ? "bg-green-500" : "bg-primary"}`}
            style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* ── Section groups ── */}
      <div className="space-y-3">
        {SECTION_ORDER.filter(s => grouped[s]?.length).map(section => (
          <SectionGroup
            key={section}
            section={section}
            items={grouped[section] ?? []}
            locked={locked}
            userRole={userRole}
            onComplete={(item) => completeMutation.mutate({ itemId: item.id })}
            onRequestReopen={setReopenItemTarget}
            onOpenNotes={setNotesTarget}
          />
        ))}
      </div>

      {/* ── Certification action bar ── */}
      {!locked && (
        <div className="flex items-center justify-between gap-3 flex-wrap rounded-md border px-4 py-3 bg-muted/30">
          <div>
            <p className="text-sm font-medium">
              {allComplete ? "All items complete — ready for Owner certification." : `${remaining} item${remaining !== 1 ? "s" : ""} remaining before certification is available.`}
            </p>
            {!isOwner && allComplete && (
              <p className="text-xs text-muted-foreground mt-0.5">Contact your Owner (super_user / super_admin) to submit final certification.</p>
            )}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  onClick={() => setCertifyOpen(true)}
                  disabled={!allComplete}
                  className="bg-green-700 hover:bg-green-800 text-white disabled:opacity-50"
                  data-testid="button-open-certify"
                >
                  <ShieldCheck className="w-4 h-4 mr-1.5" />
                  Submit for Certification
                </Button>
              </span>
            </TooltipTrigger>
            {!allComplete && <TooltipContent>Complete all checklist items before certifying.</TooltipContent>}
          </Tooltip>
        </div>
      )}

      <Separator />

      {/* ── Audit log ── */}
      <AuditPanel checklistId={checklist.id} />

      {/* ── Dialogs ── */}
      <ReopenItemDialog
        item={reopenItemTarget} open={!!reopenItemTarget} onClose={() => setReopenItemTarget(null)}
        onConfirm={(reason) => reopenItemTarget && reopenItemMutation.mutate({ itemId: reopenItemTarget.id, reason })}
        loading={reopenItemMutation.isPending}
      />
      <NotesDialog
        item={notesTarget} open={!!notesTarget} onClose={() => setNotesTarget(null)}
        onSave={(notes) => notesTarget && notesMutation.mutate({ itemId: notesTarget.id, notes })}
        loading={notesMutation.isPending}
      />
      <CertifyModal
        open={certifyOpen} checklist={checklist} isOwner={isOwner}
        onClose={() => setCertifyOpen(false)}
        onConfirm={(notes) => certifyMutation.mutate({ id: checklist.id, notes })}
        loading={certifyMutation.isPending}
      />
      <ReopenChecklistDialog
        open={reopenChecklistOpen} onClose={() => setReopenChecklistOpen(false)}
        onConfirm={(reason) => reopenChecklistMutation.mutate({ id: checklist.id, reason })}
        loading={reopenChecklistMutation.isPending}
      />
    </div>
  );
}
