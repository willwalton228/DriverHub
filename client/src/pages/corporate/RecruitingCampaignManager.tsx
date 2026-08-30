import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, differenceInCalendarDays } from "date-fns";
import { formatDate, parseDateSafe } from "@/lib/dateFormat";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Megaphone, Search, Loader2, Plus, RefreshCw, Users, Target, DollarSign,
  Clock, TrendingUp, CheckCircle2, Pause, XCircle, BarChart2, Calendar,
  MapPin, User, ChevronRight, ArrowRight, Circle, Activity, Edit2,
  Briefcase, Zap, Award, GitBranch, MoreHorizontal, ExternalLink, Trash2,
  AlertTriangle, Globe,
} from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────────
// Approved statuses per DH-002085: Pending Approval, Active, Paused, Cancelled, Closed.
// "Completed" removed; Closed is now the terminal successful status (green).
const STATUS_META: Record<string, { label: string; badgeClass: string; icon: React.ElementType }> = {
  draft:     { label: "Draft",     icon: Circle,       badgeClass: "bg-muted text-muted-foreground border-border" },
  active:    { label: "Active",    icon: TrendingUp,   badgeClass: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800" },
  paused:    { label: "Paused",    icon: Pause,        badgeClass: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800" },
  closed:    { label: "Closed",    icon: CheckCircle2, badgeClass: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800" },
  cancelled: { label: "Cancelled", icon: XCircle,      badgeClass: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800" },
};

const PRIORITY_META: Record<string, { label: string; cls: string }> = {
  low:      { label: "Low",      cls: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300" },
  medium:   { label: "Medium",   cls: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300" },
  high:     { label: "High",     cls: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300" },
  critical: { label: "Critical", cls: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300" },
};

const AD_SOURCES = [
  "Indeed","LinkedIn","Facebook","Instagram","Craigslist","ZipRecruiter",
  "Google Jobs","Referral","Walk-In","Flyer/Signage","Radio","Other",
];

const DRIVER_TYPES = [
  "Shift Driver","On-Demand Driver","Shuttle Driver","CDL Driver",
  "Fleet Lead","Dispatcher","Seasonal Driver",
];

const CLOSING_STATUSES = new Set(["closed", "cancelled"]);

// ── Campaign form schema ───────────────────────────────────────────────────────
const campaignSchema = z.object({
  campaignName:       z.string().min(1, "Campaign name is required"),
  requestId:          z.string().optional(),
  market:             z.string().optional(),
  network:            z.string().optional(),
  driverTypes:        z.array(z.string()).min(1, "Select at least one driver type"),
  driversNeeded:      z.coerce.number().min(1),
  hiringGoal:         z.coerce.number().min(1),
  startDate:          z.string().optional(),
  endDate:            z.string().optional(),
  budget:             z.string().optional(),
  priority:           z.enum(["low","medium","high","critical"]).default("medium"),
  recruiterId:        z.string().optional(),
  advertisingSources: z.array(z.string()).default([]),
  referralBonus:      z.string().optional(),
  notes:              z.string().optional(),
  status:             z.enum(["draft","active","paused","closed","cancelled"]).default("draft"),
});
type CampaignForm = z.infer<typeof campaignSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number | undefined | null, decimals = 0): string {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function pct(num: number, den: number): string {
  if (!den) return "0%";
  return `${Math.round((num / den) * 100)}%`;
}
function cph(spend: number, hires: number): string {
  if (!hires || !spend) return "—";
  return `$${fmt(spend / hires, 0)}`;
}
function ttf(campaign: any): string {
  if (!campaign.startDate || !campaign.hiresCount) return "—";
  const days = differenceInCalendarDays(new Date(), parseDateSafe(campaign.startDate));
  return `${Math.round(days / Math.max(campaign.hiresCount, 1))}d`;
}
function roi(campaign: any): string {
  const spend = Number(campaign.totalSpend ?? 0);
  const hires = campaign.hiresCount ?? 0;
  const goal  = campaign.hiringGoal ?? 1;
  if (!spend || !hires) return "—";
  const fillValue = (hires / goal) * 100;
  return `${Math.round(fillValue)}%`;
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.draft;
  const Icon = m.icon;
  return (
    <Badge className={`flex items-center gap-1 text-xs border no-default-hover-elevate no-default-active-elevate ${m.badgeClass}`}>
      <Icon className="h-3 w-3" />{m.label}
    </Badge>
  );
}
function PriorityBadge({ priority }: { priority: string }) {
  const m = PRIORITY_META[priority] ?? PRIORITY_META.medium;
  return (
    <Badge className={`text-xs border no-default-hover-elevate no-default-active-elevate ${m.cls}`}>
      {m.label}
    </Badge>
  );
}
function UrgencyBadge() {
  return (
    <Badge className="text-xs border no-default-hover-elevate no-default-active-elevate bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800 flex items-center gap-1">
      <GitBranch className="h-3 w-3" />Maintenance
    </Badge>
  );
}

// ── Metric Card ───────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className={`text-xl font-semibold mt-0.5 ${accent ?? ""}`}>{value}</p>
            {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Campaign Create/Edit Dialog ───────────────────────────────────────────────
function CampaignDialog({
  open, onOpenChange, editCampaign, approvedRequests, users,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editCampaign?: any;
  approvedRequests: any[];
  users: any[];
}) {
  const { toast } = useToast();
  const isEdit = !!editCampaign;

  const form = useForm<CampaignForm>({
    resolver: zodResolver(campaignSchema),
    defaultValues: editCampaign ? {
      campaignName:       editCampaign.campaignName ?? "",
      requestId:          editCampaign.requestId ?? "",
      market:             editCampaign.market ?? "",
      network:            editCampaign.network ?? "",
      driverTypes:        editCampaign.driverTypes ?? [],
      driversNeeded:      editCampaign.driversNeeded ?? 1,
      hiringGoal:         editCampaign.hiringGoal ?? 1,
      startDate:          editCampaign.startDate ?? "",
      endDate:            editCampaign.endDate ?? "",
      budget:             editCampaign.budget ? String(editCampaign.budget) : "",
      priority:           editCampaign.priority ?? "medium",
      recruiterId:        editCampaign.recruiterId ?? "",
      advertisingSources: editCampaign.advertisingSources ?? [],
      referralBonus:      editCampaign.referralBonus ? String(editCampaign.referralBonus) : "",
      notes:              editCampaign.notes ?? "",
      status:             editCampaign.status ?? "draft",
    } : {
      campaignName: "", market: "", network: "", driverTypes: [], driversNeeded: 1, hiringGoal: 1,
      budget: "", priority: "medium", advertisingSources: [], referralBonus: "", notes: "", status: "active",
    },
  });

  // Auto-fill from selected request
  const watchedRequestId = form.watch("requestId");
  const selectedReq = approvedRequests.find((r) => r.id === watchedRequestId);
  if (selectedReq && !isEdit && !form.getValues("market")) {
    form.setValue("market", selectedReq.market ?? "");
    form.setValue("network", selectedReq.network ?? "");
    form.setValue("driverTypes", (selectedReq.driverTypes ?? []).length > 0 ? selectedReq.driverTypes : []);
    form.setValue("driversNeeded", selectedReq.targetDriverCount ?? 1);
    form.setValue("hiringGoal", selectedReq.targetDriverCount ?? 1);
    form.setValue("startDate", selectedReq.campaignStartDate ?? "");
    if (selectedReq.market) {
      form.setValue("campaignName", `${selectedReq.market} — ${(selectedReq.driverTypes ?? []).join("/")||"Driver"} Campaign`);
    }
  }

  const mutation = useMutation({
    mutationFn: (data: CampaignForm) =>
      isEdit
        ? apiRequest("PATCH", `/api/recruiting/campaigns/${editCampaign.id}`, data)
        : apiRequest("POST", "/api/recruiting/campaigns", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/campaigns/metrics"] });
      toast({ title: isEdit ? "Campaign updated" : "Campaign created" });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const watchedDriverTypes = form.watch("driverTypes");
  const watchedAdSources   = form.watch("advertisingSources");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-campaign-form">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Campaign" : "New Recruiting Campaign"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          {/* Campaign Name */}
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Campaign Name *</Label>
            <Input {...form.register("campaignName")} placeholder="e.g. Austin — Shift Driver Campaign" data-testid="input-campaign-name" />
            {form.formState.errors.campaignName && <p className="text-xs text-destructive">{form.formState.errors.campaignName.message}</p>}
          </div>

          {/* Linked Request */}
          {!isEdit && approvedRequests.length > 0 && (
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Link to Approved Request <span className="text-muted-foreground">(optional)</span></Label>
              <Controller name="requestId" control={form.control} render={({ field }) => (
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="Select request…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {approvedRequests.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.market || r.id} — {(r.driverTypes ?? []).join("/") || "Driver"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
          )}

          {/* Market / Network */}
          <div className="space-y-1">
            <Label className="text-xs">Market</Label>
            <Input {...form.register("market")} placeholder="e.g. Austin, TX" data-testid="input-market" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Network</Label>
            <Input {...form.register("network")} placeholder="e.g. Toyota, GM" data-testid="input-network" />
          </div>

          {/* Driver Types */}
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">Driver Types *</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {DRIVER_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox
                    checked={watchedDriverTypes.includes(t)}
                    onCheckedChange={(v) => {
                      const cur = form.getValues("driverTypes");
                      form.setValue("driverTypes", v ? [...cur, t] : cur.filter((x) => x !== t), { shouldValidate: true });
                    }}
                  />
                  {t}
                </label>
              ))}
            </div>
            {form.formState.errors.driverTypes && <p className="text-xs text-destructive">{form.formState.errors.driverTypes.message}</p>}
          </div>

          {/* Drivers Needed / Hiring Goal */}
          <div className="space-y-1">
            <Label className="text-xs">Drivers Needed *</Label>
            <Input type="number" min={1} {...form.register("driversNeeded")} data-testid="input-drivers-needed" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hiring Goal *</Label>
            <Input type="number" min={1} {...form.register("hiringGoal")} data-testid="input-hiring-goal" />
          </div>

          {/* Dates */}
          <div className="space-y-1">
            <Label className="text-xs">Start Date{(selectedReq || editCampaign?.requestId) ? " (Approval Date)" : ""}</Label>
            <Input
              type="date"
              {...form.register("startDate")}
              disabled={Boolean(selectedReq || editCampaign?.requestId)}
              data-testid="input-start-date"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">End Date</Label>
            <Input type="date" {...form.register("endDate")} data-testid="input-end-date" />
          </div>

          {/* Budget / Referral */}
          <div className="space-y-1">
            <Label className="text-xs">Budget ($)</Label>
            <Input type="number" min={0} step={100} {...form.register("budget")} placeholder="0" data-testid="input-budget" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Referral Bonus ($)</Label>
            <Input type="number" min={0} step={50} {...form.register("referralBonus")} placeholder="0" data-testid="input-referral-bonus" />
          </div>

          {/* Priority / Recruiter */}
          <div className="space-y-1">
            <Label className="text-xs">Priority</Label>
            <Controller name="priority" control={form.control} render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="text-sm" data-testid="select-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["low","medium","high","critical"].map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Recruiter</Label>
            <Controller name="recruiterId" control={form.control} render={({ field }) => (
              <Select value={field.value ?? ""} onValueChange={field.onChange}>
                <SelectTrigger className="text-sm" data-testid="select-recruiter"><SelectValue placeholder="Assign recruiter…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )} />
          </div>

          {/* Status (edit only) */}
          {isEdit && (
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Controller name="status" control={form.control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="text-sm" data-testid="select-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["draft","active","paused","closed","cancelled"].map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
          )}

          {/* Advertising Sources */}
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">Advertising Sources</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {AD_SOURCES.map((s) => (
                <label key={s} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox
                    checked={watchedAdSources.includes(s)}
                    onCheckedChange={(v) => {
                      const cur = form.getValues("advertisingSources");
                      form.setValue("advertisingSources", v ? [...cur, s] : cur.filter((x) => x !== s));
                    }}
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Additional Comments / Notes</Label>
            <Textarea {...form.register("notes")} rows={3} placeholder="Campaign notes, special requirements…" data-testid="input-notes" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={form.handleSubmit((d) => mutation.mutate(d))} disabled={mutation.isPending} data-testid="button-save-campaign">
            {mutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            {isEdit ? "Save Changes" : "Create Campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Campaign Detail Panel ─────────────────────────────────────────────────────
function CampaignDetailPanel({
  campaign, onClose, onEdit, onHire, onStatusChanged, onSelectCampaign,
}: {
  campaign: any;
  onClose: () => void;
  onEdit: () => void;
  onHire: () => void;
  onStatusChanged?: (status: string, campaign: any) => void;
  onSelectCampaign?: (id: string) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activePostingsWarnOpen, setActivePostingsWarnOpen]     = useState(false);
  const [activePostingsForWarning, setActivePostingsForWarning] = useState<any[]>([]);
  const canEditPostings = campaign.canManageJobPostings === true;

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      apiRequest("PATCH", `/api/recruiting/campaigns/${campaign.id}`, { status }),
    onSuccess: (_data, status) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/campaigns/metrics"] });
      toast({ title: "Status updated" });
      if (CLOSING_STATUSES.has(status)) {
        // Warn if there are still active external job postings
        const cached = queryClient.getQueryData(["/api/recruiting/campaigns", campaign.id, "postings"]) as any[] | undefined;
        const active = (cached ?? []).filter((p: any) => p.postingStatus === "active");
        if (active.length > 0) { setActivePostingsForWarning(active); setActivePostingsWarnOpen(true); }
        if (onStatusChanged) onStatusChanged(status, campaign);
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const fillPct = Math.min(100, Math.round(((campaign.hiresCount ?? 0) / Math.max(campaign.hiringGoal ?? 1, 1)) * 100));

  return (
    <div className="w-[400px] border-l bg-background flex flex-col overflow-hidden" data-testid="panel-campaign-detail">
      <div className="p-4 border-b">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <StatusBadge status={campaign.status} />
              <PriorityBadge priority={campaign.priority} />
              {campaign.urgencyLevel && <UrgencyBadge />}
            </div>
            <h2 className="text-sm font-semibold mt-1.5 leading-tight">{campaign.campaignName}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {campaign.market}{campaign.network ? ` · ${campaign.network}` : ""}
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="flex gap-2 mt-3">
          <Button size="sm" variant="outline" onClick={onEdit} className="flex-1" data-testid="button-edit-campaign">
            <Edit2 className="h-3.5 w-3.5 mr-1.5" />Edit
          </Button>
          {campaign.status === "active" && (
            <Button size="sm" onClick={onHire} className="flex-1" data-testid="button-record-hire">
              <Award className="h-3.5 w-3.5 mr-1.5" />Record Hire
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">

          {/* Cloned-from banner */}
          {campaign.clonedFromCampaignId && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3 space-y-1.5" data-testid="banner-cloned-from">
              <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                <GitBranch className="h-3.5 w-3.5" />Maintenance / Back Up Role Campaign
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Cloned from an original campaign{campaign.clonedAt ? ` on ${format(new Date(campaign.clonedAt), "MMM d, yyyy")}` : ""}.
              </p>
              {onSelectCampaign && (
                <button
                  className="text-xs underline text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                  onClick={() => onSelectCampaign(campaign.clonedFromCampaignId)}
                  data-testid="link-view-original"
                >
                  View original campaign →
                </button>
              )}
            </div>
          )}

          {/* Maintenance clone created banner */}
          {campaign.maintenanceCloneId && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-md p-3 space-y-1.5" data-testid="banner-maintenance-clone">
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                <GitBranch className="h-3.5 w-3.5" />Maintenance Campaign Created
              </div>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                A Maintenance / Back Up Role campaign was created from this campaign{campaign.maintenanceCloneCreatedAt ? ` on ${format(new Date(campaign.maintenanceCloneCreatedAt), "MMM d, yyyy")}` : ""}.
              </p>
              {onSelectCampaign && (
                <button
                  className="text-xs underline text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-200"
                  onClick={() => onSelectCampaign(campaign.maintenanceCloneId)}
                  data-testid="link-view-clone"
                >
                  View maintenance campaign →
                </button>
              )}
            </div>
          )}

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Fill Progress</span>
              <span className="font-medium">{campaign.hiresCount ?? 0} / {campaign.hiringGoal ?? 1} hires ({fillPct}%)</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${fillPct}%` }}
              />
            </div>
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Applicants",   value: campaign.applicantsCount ?? 0 },
              { label: "Interviews",   value: campaign.interviewsCount ?? 0 },
              { label: "Offers",       value: campaign.offersCount ?? 0 },
              { label: "Hires",        value: campaign.hiresCount ?? 0 },
              { label: "Cost/Hire",    value: cph(Number(campaign.totalSpend ?? 0), campaign.hiresCount ?? 0) },
              { label: "Time to Fill", value: ttf(campaign) },
              { label: "Fill %",       value: pct(campaign.hiresCount ?? 0, campaign.hiringGoal ?? 1) },
              { label: "ROI",          value: roi(campaign) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-muted/50 rounded-md p-2.5 text-center">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-semibold mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          <Separator />

          {/* Details */}
          <div className="space-y-2.5">
            {[
              { label: "Urgency Level",   value: campaign.urgencyLevel || null },
              { label: "Drivers Needed",  value: campaign.driversNeeded },
              { label: "Recruiter",       value: campaign.recruiterName || "—" },
              { label: "Budget",          value: campaign.budget ? `$${fmt(Number(campaign.budget), 0)}` : "—" },
              { label: "Referral Bonus",  value: campaign.referralBonus ? `$${fmt(Number(campaign.referralBonus), 0)}` : "—" },
              { label: "Start Date",      value: formatDate(campaign.startDate) },
              { label: "End Date",        value: formatDate(campaign.endDate) },
            ].filter(({ value }) => value !== null).map(({ label, value }) => (
              <div key={label} className="flex justify-between items-start gap-2">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-xs font-medium text-right">{value ?? "—"}</span>
              </div>
            ))}
          </div>

          {/* Driver Types */}
          {(campaign.driverTypes?.length ?? 0) > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Driver Types</p>
              <div className="flex flex-wrap gap-1">
                {campaign.driverTypes.map((t: string) => (
                  <Badge key={t} className="text-xs no-default-hover-elevate no-default-active-elevate">{t}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Ad Sources */}
          {(campaign.advertisingSources?.length ?? 0) > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Advertising Sources</p>
              <div className="flex flex-wrap gap-1">
                {campaign.advertisingSources.map((s: string) => (
                  <Badge key={s} variant="outline" className="text-xs no-default-hover-elevate no-default-active-elevate">{s}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {campaign.notes && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="text-xs leading-relaxed">{campaign.notes}</p>
            </div>
          )}

          {/* Job Postings */}
          <Separator />
          <JobPostingsSection campaignId={campaign.id} canEdit={canEditPostings} />

          {/* Status controls */}
          <Separator />
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Change Status</p>
            <div className="flex flex-wrap gap-1.5">
              {(["draft","active","paused","closed","cancelled"] as const)
                .filter((s) => s !== campaign.status)
                .map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant="outline"
                    onClick={() => statusMutation.mutate(s)}
                    disabled={statusMutation.isPending}
                    data-testid={`button-set-status-${s}`}
                    className="capitalize text-xs"
                  >
                    {statusMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                    {s}
                  </Button>
                ))}
            </div>
          </div>
        </div>
      </ScrollArea>
      <ActivePostingsWarningDialog
        open={activePostingsWarnOpen}
        onOpenChange={setActivePostingsWarnOpen}
        postings={activePostingsForWarning}
      />
    </div>
  );
}

// ── Record Hire Dialog ────────────────────────────────────────────────────────
function RecordHireDialog({
  open, onOpenChange, campaign,
}: { open: boolean; onOpenChange: (v: boolean) => void; campaign: any }) {
  const { toast } = useToast();
  const [count, setCount] = useState(1);
  const [spend, setSpend] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/recruiting/campaigns/${campaign.id}/record-hire`, {
        count: Number(count),
        spend: spend ? Number(spend) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/campaigns/metrics"] });
      toast({ title: "Hire recorded" });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid="dialog-record-hire">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" />Record Hire
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <p className="text-xs text-muted-foreground">{campaign.campaignName}</p>
          <div className="space-y-1.5">
            <Label className="text-xs">Number of Hires</Label>
            <Input type="number" min={1} value={count} onChange={(e) => setCount(Number(e.target.value))} data-testid="input-hire-count" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Additional Spend ($) <span className="text-muted-foreground">(optional)</span></Label>
            <Input type="number" min={0} step={0.01} value={spend} onChange={(e) => setSpend(e.target.value)} placeholder="0.00" data-testid="input-hire-spend" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || count < 1} data-testid="button-confirm-hire">
            {mutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Award className="h-4 w-4 mr-1.5" />}
            Record Hire
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Maintenance Prompt Dialog ─────────────────────────────────────────────────
// Step 1: simple yes/no prompt shown immediately after a campaign is closed.
function MaintenancePromptDialog({
  open, onOpenChange, campaign, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  campaign: any | null;
  onConfirm: () => void;
}) {
  if (!campaign) return null;
  const alreadyCloned = !!campaign.maintenanceCloneId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid="dialog-maintenance-prompt">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-primary" />
            {alreadyCloned ? "Maintenance Campaign Already Exists" : "Create Maintenance Campaign?"}
          </DialogTitle>
        </DialogHeader>

        {alreadyCloned ? (
          <>
            <p className="text-sm text-muted-foreground">
              A Maintenance / Back Up Role campaign has already been created from this campaign.
            </p>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} data-testid="button-prompt-close">Close</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Would you like to clone this campaign as a Maintenance / Back Up Role campaign?
            </p>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="sm:order-1" data-testid="button-decline-maintenance">
                No, Close Campaign Only
              </Button>
              <Button
                onClick={() => { onOpenChange(false); onConfirm(); }}
                className="sm:order-2"
                data-testid="button-confirm-maintenance"
              >
                <GitBranch className="h-4 w-4 mr-1.5" />
                Create Maintenance Campaign
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Maintenance Clone Review Dialog ───────────────────────────────────────────
// Step 2: pre-populated review form; user must set Target Completion Date.
function MaintenanceCloneReviewDialog({
  open, onOpenChange, sourceCampaign, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sourceCampaign: any | null;
  onCreated: (clone: any) => void;
}) {
  const { toast } = useToast();
  const [cloneName, setCloneName]     = useState("");
  const [targetDate, setTargetDate]   = useState("");
  const [dateError, setDateError]     = useState(false);

  useEffect(() => {
    if (open && sourceCampaign) {
      setCloneName(`${sourceCampaign.campaignName} — Maintenance / Back Up Role`);
      setTargetDate("");
      setDateError(false);
    }
  }, [open, sourceCampaign]);

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/recruiting/campaigns/${sourceCampaign!.id}/clone-maintenance`, {
        targetCompletionDate: targetDate,
        campaignName: cloneName.trim() || undefined,
      }),
    onSuccess: (data: any) => {
      toast({ title: "Maintenance campaign created", description: data.campaignName });
      onOpenChange(false);
      onCreated(data);
    },
    onError: (e: any) => {
      // Handle duplicate gracefully
      if (e.status === 409) {
        toast({ title: "Already cloned", description: "A maintenance campaign already exists for this campaign.", variant: "destructive" });
      } else {
        toast({ title: "Failed to create campaign", description: e.message, variant: "destructive" });
      }
    },
  });

  const handleConfirm = () => {
    if (!targetDate) { setDateError(true); return; }
    setDateError(false);
    mutation.mutate();
  };

  if (!sourceCampaign) return null;
  const today = new Date().toISOString().slice(0, 10);
  const todayDisplay = format(new Date(today + "T12:00:00"), "MMM d, yyyy");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-maintenance-clone-review">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-primary" />
            Create Maintenance Campaign
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <p className="text-sm text-muted-foreground">
            Review the details below. Set the Target Completion Date to create the campaign.
          </p>

          {/* Urgency level highlight */}
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
            <Badge className="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 text-xs border no-default-hover-elevate no-default-active-elevate flex items-center gap-1">
              <GitBranch className="h-3 w-3" />Maintenance / Back Up Role
            </Badge>
            <span className="text-xs text-blue-600 dark:text-blue-400">Urgency level is automatically set</span>
          </div>

          {/* Campaign Name (editable) */}
          <div className="space-y-1">
            <Label className="text-xs">Campaign Name</Label>
            <Input
              value={cloneName}
              onChange={(e) => setCloneName(e.target.value)}
              className="text-sm"
              data-testid="input-clone-name"
            />
          </div>

          {/* Key details grid (read-only) */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs bg-muted/30 rounded-md p-3">
            {[
              { label: "Market",         value: sourceCampaign.market || "—" },
              { label: "Network",        value: sourceCampaign.network || "—" },
              { label: "Drivers Needed", value: sourceCampaign.driversNeeded ?? "—" },
              { label: "Hiring Goal",    value: sourceCampaign.hiringGoal ?? "—" },
              { label: "Priority",       value: sourceCampaign.priority ? sourceCampaign.priority.charAt(0).toUpperCase() + sourceCampaign.priority.slice(1) : "—" },
              { label: "Recruiter",      value: sourceCampaign.recruiterName || "—" },
            ].map(({ label, value }) => (
              <div key={label}>
                <span className="text-muted-foreground">{label}: </span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
          </div>

          <Separator />

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Start Date</Label>
              <div className="h-9 px-3 flex items-center text-sm border rounded-md bg-muted/50 text-muted-foreground gap-1.5">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                {todayDisplay}
                <span className="text-[10px] ml-auto">(auto)</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                Target Completion Date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={targetDate}
                min={today}
                onChange={(e) => { setTargetDate(e.target.value); setDateError(false); }}
                className={`text-sm ${dateError ? "border-destructive" : ""}`}
                data-testid="input-clone-target-date"
              />
              {dateError && <p className="text-xs text-destructive">Target completion date is required</p>}
            </div>
          </div>

          {/* Driver Types (copied, read-only) */}
          {(sourceCampaign.driverTypes?.length ?? 0) > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Driver Types <span className="text-muted-foreground">(copied)</span></Label>
              <div className="flex flex-wrap gap-1">
                {sourceCampaign.driverTypes.map((t: string) => (
                  <Badge key={t} className="text-xs no-default-hover-elevate no-default-active-elevate">{t}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Notes (copied, read-only) */}
          {sourceCampaign.notes && (
            <div className="space-y-1">
              <Label className="text-xs">Notes <span className="text-muted-foreground">(copied)</span></Label>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4 bg-muted/30 rounded-md p-2">
                {sourceCampaign.notes}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={mutation.isPending} data-testid="button-confirm-clone">
            {mutation.isPending
              ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              : <GitBranch className="h-4 w-4 mr-1.5" />}
            Create Maintenance Campaign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Campaign Card ─────────────────────────────────────────────────────────────
// ── Job Posting Status Badge ──────────────────────────────────────────────────
const POSTING_STATUS_META: Record<string, { label: string; cls: string }> = {
  active:  { label: "Active",  cls: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800" },
  paused:  { label: "Paused",  cls: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800" },
  expired: { label: "Expired", cls: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800" },
  removed: { label: "Removed", cls: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400" },
};
function PostingStatusBadge({ status }: { status: string }) {
  const meta = POSTING_STATUS_META[status] ?? { label: status, cls: "" };
  return <Badge className={`text-[10px] border ${meta.cls} no-default-hover-elevate no-default-active-elevate`}>{meta.label}</Badge>;
}

// ── Job Posting Sources ───────────────────────────────────────────────────────
const JOB_POSTING_SOURCES_LIST = [
  "Indeed","Craigslist","Facebook","ZipRecruiter","LinkedIn",
  "Nextdoor","Local / Community Group","Military / Veteran Board","Other",
] as const;
const JOB_POSTING_STATUSES_LIST = ["active","paused","expired","removed"] as const;

// ── Add/Edit Job Posting Dialog ───────────────────────────────────────────────
const postingSchema = z.object({
  source:        z.string().min(1, "Source is required"),
  sourceName:    z.string().optional(),
  postingUrl:    z.string().url("Must be a valid URL (include https://)"),
  postingStatus: z.enum(["active","paused","expired","removed"]).default("active"),
  postedAt:      z.string().min(1, "Posting date is required"),
  expiresAt:     z.string().optional(),
  notes:         z.string().optional(),
});
type PostingForm = z.infer<typeof postingSchema>;

function AddJobPostingDialog({
  open, onOpenChange, campaignId, posting, onSuccess,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  campaignId: string; posting?: any; onSuccess?: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!posting;
  const todayStr = new Date().toISOString().slice(0, 10);
  const form = useForm<PostingForm>({
    resolver: zodResolver(postingSchema),
    defaultValues: {
      source:        posting?.source        ?? "",
      sourceName:    posting?.sourceName    ?? "",
      postingUrl:    posting?.postingUrl    ?? "",
      postingStatus: posting?.postingStatus ?? "active",
      postedAt:      posting?.postedAt      ?? todayStr,
      expiresAt:     posting?.expiresAt     ?? "",
      notes:         posting?.notes         ?? "",
    },
  });
  const source = form.watch("source");

  useEffect(() => {
    if (open) {
      form.reset({
        source:        posting?.source        ?? "",
        sourceName:    posting?.sourceName    ?? "",
        postingUrl:    posting?.postingUrl    ?? "",
        postingStatus: posting?.postingStatus ?? "active",
        postedAt:      posting?.postedAt      ?? todayStr,
        expiresAt:     posting?.expiresAt     ?? "",
        notes:         posting?.notes         ?? "",
      });
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: (data: PostingForm) => {
      if (isEdit) return apiRequest("PATCH", `/api/recruiting/campaigns/${campaignId}/postings/${posting.id}`, data);
      return apiRequest("POST", `/api/recruiting/campaigns/${campaignId}/postings`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/campaigns", campaignId, "postings"] });
      toast({ title: isEdit ? "Posting updated" : "Job posting added" });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (e: any) => toast({
      title: isEdit ? "Unable to Update Job Posting" : "Unable to Save Job Posting",
      description: e?.referenceId
        ? `${e.message} Reference: ${e.referenceId}`
        : (e?.message || "DriverHub could not save this job posting. Your information has been retained. Please try again."),
      variant: "destructive",
    }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-add-job-posting">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            {isEdit ? "Edit Job Posting" : "Add Job Posting"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Source *</Label>
            <Controller control={form.control} name="source" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="h-8 text-sm" data-testid="select-posting-source"><SelectValue placeholder="Select source…" /></SelectTrigger>
                <SelectContent>{JOB_POSTING_SOURCES_LIST.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            )} />
            {form.formState.errors.source && <p className="text-xs text-destructive">{form.formState.errors.source.message}</p>}
          </div>

          {source === "Other" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Source Name *</Label>
              <Input className="h-8 text-sm" placeholder="e.g. Dallas Jobs Board" {...form.register("sourceName")} data-testid="input-posting-source-name" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Posting URL *</Label>
            <Input className="h-8 text-sm" placeholder="https://…" {...form.register("postingUrl")} data-testid="input-posting-url" />
            {form.formState.errors.postingUrl && <p className="text-xs text-destructive">{form.formState.errors.postingUrl.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Posting Date *</Label>
              <Input type="date" className="h-8 text-sm" {...form.register("postedAt")} data-testid="input-posting-date" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Expiration <span className="text-muted-foreground">(opt.)</span></Label>
              <Input type="date" className="h-8 text-sm" {...form.register("expiresAt")} data-testid="input-posting-expires" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Status *</Label>
            <Controller control={form.control} name="postingStatus" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="h-8 text-sm" data-testid="select-posting-status"><SelectValue /></SelectTrigger>
                <SelectContent>{JOB_POSTING_STATUSES_LIST.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
              </Select>
            )} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea className="text-sm resize-none" rows={2} placeholder="e.g. Renew every 30 days, Sponsored posting…" {...form.register("notes")} data-testid="textarea-posting-notes" />
          </div>

          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={mutation.isPending} data-testid="button-save-posting">
              {mutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {isEdit ? "Save Changes" : "Save Posting"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Active Postings Warning Dialog ────────────────────────────────────────────
function ActivePostingsWarningDialog({
  open, onOpenChange, postings,
}: { open: boolean; onOpenChange: (v: boolean) => void; postings: any[] }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid="dialog-active-postings-warning">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />Active Job Postings
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This campaign still has external job postings marked <strong>Active</strong>.
            Please review and remove or deactivate them from the external source if appropriate.
          </p>
          <div className="space-y-1.5 rounded-md border p-2.5 bg-muted/30">
            {postings.filter(p => p.postingStatus === "active").map((p) => (
              <div key={p.id} className="flex items-center justify-between text-xs">
                <span className="font-medium">{p.source === "Other" ? (p.sourceName || "Other") : p.source}</span>
                <a href={p.postingUrl} target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-1 text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" />Open
                </a>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button size="sm" onClick={() => onOpenChange(false)}>Got It</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Job Postings Section (inside Campaign Detail Panel) ───────────────────────
function JobPostingsSection({ campaignId, canEdit }: { campaignId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const [addOpen, setAddOpen]       = useState(false);
  const [editPosting, setEditPosting] = useState<any>(null);

  const { data: postings = [], refetch } = useQuery<any[]>({
    queryKey: ["/api/recruiting/campaigns", campaignId, "postings"],
    queryFn: async () => {
      const response = await fetch(`/api/recruiting/campaigns/${campaignId}/postings`, { credentials: "include" });
      if (!response.ok) throw new Error("Unable to load job postings.");
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 30_000,
  });

  const removeMutation = useMutation({
    mutationFn: (postingId: string) =>
      apiRequest("PATCH", `/api/recruiting/campaigns/${campaignId}/postings/${postingId}`, { postingStatus: "removed" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/campaigns", campaignId, "postings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/campaigns"] });
      toast({ title: "Posting removed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const visible = postings.filter(p => p.postingStatus !== "removed");
  const removedCount = postings.filter(p => p.postingStatus === "removed").length;
  const sourceLabel = (p: any) => p.source === "Other" ? (p.sourceName || "Other") : p.source;

  return (
    <div className="space-y-2" data-testid="section-job-postings">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Job Postings</p>
        {canEdit && (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setAddOpen(true)} data-testid="button-add-posting">
            <Plus className="h-3 w-3 mr-1" />Add
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="text-xs text-muted-foreground py-3 text-center border rounded-md bg-muted/20">
          No job postings yet
          {canEdit && <> · <button className="underline hover:text-foreground" onClick={() => setAddOpen(true)}>add one</button></>}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((p) => (
            <div key={p.id} className="border rounded-md p-2.5 space-y-1.5 bg-background" data-testid={`posting-row-${p.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-medium">{sourceLabel(p)}</span>
                  <PostingStatusBadge status={p.postingStatus} />
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <a href={p.postingUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="icon" variant="ghost" className="h-5 w-5" title="View Posting" data-testid={`button-view-posting-${p.id}`}>
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </a>
                  {canEdit && (
                    <>
                      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setEditPosting(p)} title="Edit" data-testid={`button-edit-posting-${p.id}`}>
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-5 w-5 text-destructive hover:text-destructive"
                              onClick={() => removeMutation.mutate(p.id)} title="Remove" data-testid={`button-remove-posting-${p.id}`}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                <span>Posted {format(new Date(p.postedAt), "MMM d, yyyy")}</span>
                {p.expiresAt && <span>· Expires {format(new Date(p.expiresAt), "MMM d, yyyy")}</span>}
              </div>
              {p.notes && <p className="text-[10px] text-muted-foreground italic leading-relaxed">{p.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {removedCount > 0 && (
        <p className="text-[10px] text-muted-foreground text-center">{removedCount} removed posting{removedCount > 1 ? "s" : ""} not shown</p>
      )}

      <AddJobPostingDialog open={addOpen} onOpenChange={setAddOpen} campaignId={campaignId} onSuccess={refetch} />
      {editPosting && (
        <AddJobPostingDialog
          open={!!editPosting}
          onOpenChange={(v) => { if (!v) setEditPosting(null); }}
          campaignId={campaignId}
          posting={editPosting}
          onSuccess={refetch}
        />
      )}
    </div>
  );
}

// ── Campaign Card ─────────────────────────────────────────────────────────────
function CampaignCard({ campaign, isSelected, isNew, onClick, onAddPosting }: {
  campaign: any; isSelected: boolean; isNew?: boolean; onClick: () => void;
  onAddPosting?: (campaign: any) => void;
}) {
  const fillPct = Math.min(100, Math.round(((campaign.hiresCount ?? 0) / Math.max(campaign.hiringGoal ?? 1, 1)) * 100));
  const jobPostings: any[] = campaign.jobPostings ?? [];
  const activePostings = jobPostings.filter(p => p.postingStatus !== "removed");

  return (
    <div
      className={`p-3.5 border rounded-md cursor-pointer hover-elevate transition-all ${
        isNew
          ? "border-primary bg-primary/5 shadow-sm"
          : isSelected
          ? "border-primary/40 bg-primary/5"
          : "bg-background"
      }`}
      onClick={onClick}
      data-testid={`card-campaign-${campaign.id}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <StatusBadge status={campaign.status} />
            <PriorityBadge priority={campaign.priority} />
            {campaign.urgencyLevel && <UrgencyBadge />}
          </div>
          <p className="text-sm font-medium truncate">{campaign.campaignName}</p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {campaign.market}{campaign.network ? ` · ${campaign.network}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isNew && (
            <Badge className="text-[10px] bg-primary text-primary-foreground no-default-hover-elevate no-default-active-elevate">New</Badge>
          )}
          {onAddPosting && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-6 w-6 opacity-50 hover:opacity-100"
                        onClick={(e) => e.stopPropagation()} data-testid={`button-campaign-actions-${campaign.id}`}>
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={() => onAddPosting(campaign)} data-testid={`action-add-posting-${campaign.id}`}>
                  <Globe className="h-3.5 w-3.5 mr-2" />Add Job Posting
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Mini progress bar */}
      <div className="space-y-1 mb-2">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{campaign.hiresCount ?? 0}/{campaign.hiringGoal ?? 1} hired</span>
          <span>{fillPct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary" style={{ width: `${fillPct}%` }} />
        </div>
      </div>

      <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
        {campaign.recruiterName && (
          <span className="flex items-center gap-1"><User className="h-2.5 w-2.5" />{campaign.recruiterName}</span>
        )}
        {campaign.advertisingSources?.length > 0 && (
          <span className="flex items-center gap-1"><Megaphone className="h-2.5 w-2.5" />{campaign.advertisingSources.length} channels</span>
        )}
        {campaign.startDate && (
          <span className="flex items-center gap-1 ml-auto"><Calendar className="h-2.5 w-2.5" />{formatDate(campaign.startDate)}</span>
        )}
      </div>

      {/* Job posting sources indicator */}
      {activePostings.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t" onClick={(e) => e.stopPropagation()}>
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                      data-testid={`button-posting-sources-${campaign.id}`}>
                <Globe className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">
                  {activePostings.length <= 2
                    ? activePostings.map(p => p.source === "Other" ? (p.sourceName || "Other") : p.source).join(" · ")
                    : `${activePostings[0].source === "Other" ? (activePostings[0].sourceName || "Other") : activePostings[0].source} +${activePostings.length - 1}`}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="space-y-2">
                {activePostings.map((p, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate font-medium">{p.source === "Other" ? (p.sourceName || "Other") : p.source}</span>
                      <PostingStatusBadge status={p.postingStatus} />
                    </div>
                    <a href={p.postingUrl} target="_blank" rel="noopener noreferrer"
                       className="flex items-center gap-0.5 text-[10px] text-primary hover:underline shrink-0">
                      <ExternalLink className="h-2.5 w-2.5" />Open
                    </a>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function RecruitingCampaignManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [createOpen, setCreateOpen]     = useState(false);
  const [editCampaign, setEditCampaign] = useState<any | null>(null);
  const [hireDialogCampaign, setHireDialogCampaign]         = useState<any | null>(null);
  const [addPostingQuickCampaign, setAddPostingQuickCampaign] = useState<any | null>(null);

  // ── Maintenance clone flow ──
  const [maintenancePromptCampaign, setMaintenancePromptCampaign] = useState<any | null>(null);
  const [cloneReviewOpen, setCloneReviewOpen] = useState(false);
  const [newCloneId, setNewCloneId]           = useState<string | null>(null);

  const { data: campaigns = [], isLoading, isFetching, refetch } = useQuery<any[]>({
    queryKey: ["/api/recruiting/campaigns"],
    staleTime: 30_000,
  });

  const { data: metrics } = useQuery<any>({
    queryKey: ["/api/recruiting/campaigns/metrics"],
    staleTime: 30_000,
  });

  const { data: approvedRequests = [] } = useQuery<any[]>({
    queryKey: ["/api/recruiting/requests"],
    select: (data) => data.filter((r) => r.requestStatus === "approved" && !r.campaignId),
    staleTime: 60_000,
  });

  const { data: usersData = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/users"],
    staleTime: 120_000,
  });

  const filtered = useMemo(() => {
    let list = campaigns;
    if (statusFilter !== "all") list = list.filter((c) => c.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.campaignName?.toLowerCase().includes(q) ||
        c.market?.toLowerCase().includes(q) ||
        c.recruiterName?.toLowerCase().includes(q) ||
        c.network?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [campaigns, statusFilter, search]);

  const selectedCampaign = campaigns.find((c) => c.id === selectedId) ?? null;

  // Derived dashboard metrics
  const totalBudget    = campaigns.reduce((s, c) => s + Number(c.budget ?? 0), 0);
  const totalSpend     = campaigns.reduce((s, c) => s + Number(c.totalSpend ?? 0), 0);
  const totalHires     = campaigns.reduce((s, c) => s + (c.hiresCount ?? 0), 0);
  const totalGoal      = campaigns.reduce((s, c) => s + (c.hiringGoal ?? 0), 0);
  const overallFill    = totalGoal > 0 ? Math.round((totalHires / totalGoal) * 100) : 0;
  const avgCph         = totalHires > 0 && totalSpend > 0 ? totalSpend / totalHires : null;

  const mOpen      = metrics?.openCampaigns      ?? campaigns.filter((c) => c.status === "active").length;
  const mCompleted = metrics?.closedCampaigns ?? campaigns.filter((c) => c.status === "closed").length;
  const mApps      = metrics?.totalApplicants     ?? campaigns.reduce((s, c) => s + (c.applicantsCount ?? 0), 0);
  const mInterviews= metrics?.totalInterviews     ?? campaigns.reduce((s, c) => s + (c.interviewsCount ?? 0), 0);
  const mOffers    = metrics?.totalOffers         ?? campaigns.reduce((s, c) => s + (c.offersCount ?? 0), 0);
  const mHires     = metrics?.totalHires          ?? totalHires;

  // Called by CampaignDetailPanel after a successful status change to completed/cancelled.
  // `closedCampaign` is the campaign object at the moment of closing (pre-refetch).
  const handleStatusChanged = (status: string, closedCampaign: any) => {
    setMaintenancePromptCampaign(closedCampaign);
  };

  // Called after the maintenance clone is successfully created.
  const handleCloneCreated = (clone: any) => {
    queryClient.invalidateQueries({ queryKey: ["/api/recruiting/campaigns"] });
    queryClient.invalidateQueries({ queryKey: ["/api/recruiting/campaigns/metrics"] });
    setNewCloneId(clone.id);
    setSelectedId(clone.id);
    setStatusFilter("active");
    // Clear the "New" highlight after 4 seconds
    setTimeout(() => setNewCloneId(null), 4000);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]" data-testid="page-campaign-manager">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b bg-background flex-wrap">
        <div>
          <h1 className="text-sm font-semibold">Campaign Manager</h1>
          <p className="text-xs text-muted-foreground">
            {campaigns.length} campaigns · {mOpen} active · {overallFill}% overall fill rate
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-campaigns">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="button-create-campaign">
            <Plus className="h-3.5 w-3.5 mr-1.5" />New Campaign
          </Button>
        </div>
      </div>

      {/* ── Dashboard Metrics ── */}
      <div className="px-4 py-3 border-b bg-muted/20">
        <div className="grid grid-cols-5 gap-3">
          <MetricCard label="Open Campaigns"     value={mOpen}      icon={Megaphone}    accent="text-green-600 dark:text-green-400" />
          <MetricCard label="Closed"              value={mCompleted} icon={CheckCircle2} accent="text-green-600 dark:text-green-400" />
          <MetricCard label="Applicants"         value={mApps}      icon={Users} />
          <MetricCard label="Interviews"         value={mInterviews}icon={Calendar} />
          <MetricCard label="Offers"             value={mOffers}    icon={Briefcase} />
        </div>
        <div className="grid grid-cols-5 gap-3 mt-3">
          <MetricCard label="Total Hires"        value={mHires}     icon={Award}        accent="text-primary" />
          <MetricCard label="Cost Per Hire"      value={avgCph != null ? `$${fmt(avgCph, 0)}` : "—"} icon={DollarSign} />
          <MetricCard label="Avg Time to Fill"   value={metrics?.avgTimeToFill ?? "—"} icon={Clock} sub="days" />
          <MetricCard label="Fill Rate"          value={`${overallFill}%`}              icon={Target} />
          <MetricCard label="Budget Remaining"   value={totalBudget > 0 ? `$${fmt(totalBudget - totalSpend, 0)}` : "—"} icon={TrendingUp} sub={totalBudget > 0 ? `of $${fmt(totalBudget, 0)} total` : undefined} />
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── List Panel ── */}
        <div className={`flex flex-col ${selectedCampaign ? "w-[480px] border-r" : "flex-1"} bg-background`}>
          <div className="p-3 border-b space-y-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-sm"
                placeholder="Search campaigns by name, market, recruiter…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search-campaigns"
              />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {[
                { key: "all",       label: `All (${campaigns.length})` },
                { key: "active",    label: `Active (${campaigns.filter(c=>c.status==="active").length})` },
                { key: "paused",    label: `Paused (${campaigns.filter(c=>c.status==="paused").length})` },
                { key: "draft",     label: `Draft (${campaigns.filter(c=>c.status==="draft").length})` },
                { key: "closed",    label: `Closed (${campaigns.filter(c=>c.status==="closed").length})` },
                { key: "cancelled", label: `Cancelled (${campaigns.filter(c=>c.status==="cancelled").length})` },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={`flex items-center text-xs px-2.5 py-1 rounded-full border shrink-0 transition-colors ${
                    statusFilter === key ? "bg-primary text-primary-foreground border-primary" : "hover-elevate"
                  }`}
                  data-testid={`filter-${key}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
                  <Loader2 className="h-5 w-5 animate-spin" />Loading campaigns…
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                  <Megaphone className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No campaigns found</p>
                  {!search && statusFilter === "all" && (
                    <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="button-create-first-campaign">
                      <Plus className="h-3.5 w-3.5 mr-1.5" />Create first campaign
                    </Button>
                  )}
                </div>
              ) : (
                filtered.map((c) => (
                  <CampaignCard
                    key={c.id}
                    campaign={c}
                    isSelected={c.id === selectedId}
                    isNew={c.id === newCloneId}
                    onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                    onAddPosting={c.canManageJobPostings === true
                      ? (campaign) => setAddPostingQuickCampaign(campaign)
                      : undefined}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* ── Detail Panel ── */}
        {selectedCampaign && (
          <div className="flex-1 overflow-hidden">
            <CampaignDetailPanel
              campaign={selectedCampaign}
              onClose={() => setSelectedId(null)}
              onEdit={() => setEditCampaign(selectedCampaign)}
              onHire={() => setHireDialogCampaign(selectedCampaign)}
              onStatusChanged={handleStatusChanged}
              onSelectCampaign={(id) => setSelectedId(id)}
            />
          </div>
        )}
      </div>

      {/* ── Dialogs ── */}
      <CampaignDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        approvedRequests={approvedRequests}
        users={usersData}
      />
      {editCampaign && (
        <CampaignDialog
          open={!!editCampaign}
          onOpenChange={(v) => !v && setEditCampaign(null)}
          editCampaign={editCampaign}
          approvedRequests={approvedRequests}
          users={usersData}
        />
      )}
      {hireDialogCampaign && (
        <RecordHireDialog
          open={!!hireDialogCampaign}
          onOpenChange={(v) => !v && setHireDialogCampaign(null)}
          campaign={hireDialogCampaign}
        />
      )}

      {/* Step 1: prompt shown immediately after campaign is closed */}
      <MaintenancePromptDialog
        open={!!maintenancePromptCampaign}
        onOpenChange={(v) => { if (!v) setMaintenancePromptCampaign(null); }}
        campaign={maintenancePromptCampaign}
        onConfirm={() => setCloneReviewOpen(true)}
      />

      {/* Step 2: review form with required target date */}
      <MaintenanceCloneReviewDialog
        open={cloneReviewOpen}
        onOpenChange={(v) => { setCloneReviewOpen(v); if (!v) setMaintenancePromptCampaign(null); }}
        sourceCampaign={maintenancePromptCampaign}
        onCreated={handleCloneCreated}
      />

      {/* Quick-action: Add Job Posting from campaign card ⋯ menu */}
      {addPostingQuickCampaign && (
        <AddJobPostingDialog
          open={!!addPostingQuickCampaign}
          onOpenChange={(v) => { if (!v) setAddPostingQuickCampaign(null); }}
          campaignId={addPostingQuickCampaign.id}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/recruiting/campaigns"] })}
        />
      )}
    </div>
  );
}
