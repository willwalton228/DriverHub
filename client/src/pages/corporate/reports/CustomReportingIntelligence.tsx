import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus, Star, Play, Edit2, Calendar, MoreHorizontal, Search,
  Clock, Globe, Lock, Settings2, Briefcase, ArrowLeft, Trash2,
  FileBarChart, Users, Truck, Receipt, Building2, DollarSign,
  ShieldAlert, ChevronRight, Sparkles, Copy,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/dateFormat";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CustomReport {
  id: string;
  name: string;
  description: string | null;
  subject: string | null;
  isPublic: boolean;
  isSystem: boolean;
  config: Record<string, unknown> | null;
  ownerId: string;
  ownerName: string | null;
  isFavorite: boolean;
  lastRunAt: string | null;
  scheduledCron: string | null;
  scheduleEnabled: boolean;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SUBJECT_ICONS: Record<string, React.FC<{ className?: string }>> = {
  Drivers:   Users,
  Moves:     Truck,
  Invoices:  Receipt,
  Accounts:  Building2,
  Payroll:   DollarSign,
  General:   FileBarChart,
};

const SUBJECTS = ["Drivers", "Moves", "Invoices", "Accounts", "Payroll", "General"];

function SubjectIcon({ subject, className }: { subject: string | null; className?: string }) {
  const Icon = SUBJECT_ICONS[subject || "General"] ?? FileBarChart;
  return <Icon className={className} />;
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatDate(dateStr);
}

function formatNextRun(dateStr: string | null): string {
  if (!dateStr) return "Not scheduled";
  const d = new Date(dateStr);
  const now = new Date();
  if (d < now) return "Overdue";
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return `In ${diffDays} days`;
}

// ── Subject Selection definitions ─────────────────────────────────────────────

const REPORT_SUBJECTS = [
  {
    key: "Drivers",
    icon: Users,
    description: "Workforce, classification, compliance, and driver-level reporting",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    key: "Moves",
    icon: Truck,
    description: "Move activity, performance, and execution data",
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-500/10",
  },
  {
    key: "Accounts",
    icon: Building2,
    description: "Customer performance and activity",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  {
    key: "Claims",
    icon: ShieldAlert,
    description: "Incidents, frequency, and severity",
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500/10",
  },
  {
    key: "Financials",
    icon: DollarSign,
    description: "Revenue, cost, and gross profit analysis",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
  },
] as const;

// ── Subject Selection Dialog ──────────────────────────────────────────────────

function SubjectSelectionDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [, navigate] = useLocation();
  const [prompt, setPrompt] = useState("");

  const handleSelect = (subject: string) => {
    const params = new URLSearchParams({ subject });
    if (prompt.trim()) params.set("prompt", prompt.trim());
    navigate(`/reports/custom/builder?${params.toString()}`);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setPrompt(""); } }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Create a Report
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Optional prompt */}
          <div className="space-y-1.5">
            <Label htmlFor="report-prompt" className="text-sm font-medium">
              What do you want to see? <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="report-prompt"
              data-testid="input-report-prompt"
              placeholder="e.g. Active drivers by state, grouped by classification"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="h-10"
            />
          </div>

          {/* Subject cards */}
          <div>
            <p className="text-sm font-medium mb-3">What are you reporting on?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {REPORT_SUBJECTS.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.key}
                    onClick={() => handleSelect(s.key)}
                    data-testid={`btn-subject-${s.key.toLowerCase()}`}
                    className="group text-left flex items-start gap-4 p-4 rounded-lg border bg-card hover-elevate active-elevate-2 transition-colors"
                  >
                    <div className={`shrink-0 h-10 w-10 rounded-lg ${s.bg} flex items-center justify-center`}>
                      <Icon className={`h-5 w-5 ${s.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{s.key}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {s.description}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Create/Edit Report Dialog ─────────────────────────────────────────────────

function ReportFormDialog({
  open,
  onClose,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  existing?: CustomReport;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [subject, setSubject] = useState(existing?.subject ?? "General");
  const [isPublic, setIsPublic] = useState(existing?.isPublic ?? false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      existing
        ? apiRequest("PATCH", `/api/reports/custom/${existing.id}`, data)
        : apiRequest("POST", "/api/reports/custom", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports/custom"] });
      toast({ title: existing ? "Report updated" : "Report created" });
      onClose();
    },
    onError: () => toast({ title: "Failed to save report", variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!name.trim()) return;
    mutation.mutate({ name: name.trim(), description: description || null, subject, isPublic });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Report" : "Create Report"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="report-name">Report Name</Label>
            <Input
              id="report-name"
              data-testid="input-report-name"
              placeholder="e.g. Active Drivers by State"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-description">Description</Label>
            <Textarea
              id="report-description"
              data-testid="input-report-description"
              placeholder="What does this report show?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-subject">Subject</Label>
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger id="report-subject" data-testid="select-report-subject">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBJECTS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Make Public</p>
              <p className="text-xs text-muted-foreground">Visible to all corporate users</p>
            </div>
            <Switch
              data-testid="switch-report-public"
              checked={isPublic}
              onCheckedChange={setIsPublic}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            data-testid="button-save-report"
            onClick={handleSubmit}
            disabled={!name.trim() || mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : existing ? "Save Changes" : "Create Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Schedule Dialog ───────────────────────────────────────────────────────────

function ScheduleDialog({ open, onClose, report }: { open: boolean; onClose: () => void; report: CustomReport }) {
  const [enabled, setEnabled] = useState(report.scheduleEnabled);
  const [cron, setCron] = useState(report.scheduledCron ?? "0 8 * * 1");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const PRESETS = [
    { label: "Every Monday at 8 AM", value: "0 8 * * 1" },
    { label: "Daily at 8 AM",         value: "0 8 * * *" },
    { label: "First of every month",   value: "0 8 1 * *" },
  ];

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/reports/custom/${report.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports/custom"] });
      toast({ title: "Schedule saved" });
      onClose();
    },
    onError: () => toast({ title: "Failed to save schedule", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Schedule Report</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Enable Schedule</p>
              <p className="text-xs text-muted-foreground">Run this report automatically</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} data-testid="switch-schedule-enabled" />
          </div>
          {enabled && (
            <>
              <div className="space-y-1.5">
                <Label>Frequency Preset</Label>
                <Select value={cron} onValueChange={setCron}>
                  <SelectTrigger data-testid="select-schedule-preset">
                    <SelectValue placeholder="Choose frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRESETS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                    <SelectItem value="custom">Custom cron…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {cron === "custom" && (
                <div className="space-y-1.5">
                  <Label>Cron Expression</Label>
                  <Input placeholder="0 8 * * 1" data-testid="input-custom-cron" />
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            data-testid="button-save-schedule"
            onClick={() => mutation.mutate({ scheduledCron: enabled ? cron : null, scheduleEnabled: enabled })}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Save Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Report Row ────────────────────────────────────────────────────────────────

function ReportRow({
  report,
  currentUserId,
  onEdit,
  onSchedule,
  onDelete,
}: {
  report: CustomReport;
  currentUserId: string;
  onEdit: (r: CustomReport) => void;
  onSchedule: (r: CustomReport) => void;
  onDelete: (r: CustomReport) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const favMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/reports/custom/${report.id}/favorite`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/reports/custom"] }),
    onError: () => toast({ title: "Could not update favourite", variant: "destructive" }),
  });

  const isOwner = report.ownerId === currentUserId;
  const canEdit  = !report.isSystem && isOwner;
  const isSystem = report.isSystem;

  // Build builder URL from report config.
  // includeId=true links the builder back to this saved report (for Run/Edit).
  // includeId=false creates a fresh unsaved copy (for Use as Template).
  const buildBuilderUrl = (overrideName?: string, includeId = true) => {
    const p = new URLSearchParams({ subject: report.subject || "General" });
    const cfg = (report.config ?? {}) as Record<string, unknown>;
    if (Array.isArray(cfg.fields) && cfg.fields.length)
      p.set("fields", (cfg.fields as string[]).join(","));
    if (cfg.filterField) p.set("filterField", String(cfg.filterField));
    if (cfg.filterValue) p.set("filterValue", String(cfg.filterValue));
    if (Array.isArray(cfg.groupBy) && cfg.groupBy.length)
      p.set("groupBy", (cfg.groupBy as string[]).join(","));
    p.set("reportName", overrideName ?? report.name);
    if (includeId && !report.isSystem) p.set("reportId", report.id);
    return `/reports/custom/builder?${p.toString()}`;
  };

  const handleRun = () => {
    // Record last_run_at (fire-and-forget)
    apiRequest("POST", `/api/reports/custom/${report.id}/run`)
      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/reports/custom"] }))
      .catch(() => {});
    navigate(buildBuilderUrl());
  };

  const handleUseTemplate = () => {
    // Open as a fresh unsaved copy — no reportId in URL
    navigate(buildBuilderUrl("Untitled Report", false));
  };

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b last:border-0 hover:bg-muted/20 transition-colors"
      data-testid={`row-report-${report.id}`}
    >
      {/* Icon */}
      <div className="shrink-0 h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center">
        <SubjectIcon subject={report.subject} className="h-4 w-4 text-primary" />
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate" data-testid={`text-report-name-${report.id}`}>
            {report.name}
          </span>
          {isSystem && (
            <Badge variant="secondary" className="text-xs">System</Badge>
          )}
          {report.isPublic && !isSystem && (
            <Badge variant="outline" className="text-xs gap-1">
              <Globe className="h-3 w-3" />Public
            </Badge>
          )}
          {!report.isPublic && !isSystem && (
            <Badge variant="outline" className="text-xs gap-1">
              <Lock className="h-3 w-3" />Private
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
          {report.subject && (
            <span className="flex items-center gap-1">
              <Briefcase className="h-3 w-3" />{report.subject}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />Last run: {formatRelative(report.lastRunAt)}
          </span>
          {report.scheduleEnabled && (
            <span className="flex items-center gap-1 text-primary">
              <Calendar className="h-3 w-3" />Next: {formatNextRun(report.nextRunAt)}
            </span>
          )}
          {report.ownerName && !isOwner && (
            <span>by {report.ownerName}</span>
          )}
        </div>
      </div>

      {/* ── Standard action set: Run · Edit/Use Template · Schedule · ⋯ ── */}
      <div className="flex items-center gap-1.5 shrink-0">

        {/* Star / Favorite toggle */}
        <button
          onClick={() => favMutation.mutate()}
          className={`h-7 w-7 flex items-center justify-center rounded-md hover-elevate ${
            report.isFavorite ? "text-amber-500" : "text-muted-foreground/40 hover:text-muted-foreground"
          }`}
          data-testid={`btn-favorite-${report.id}`}
          title={report.isFavorite ? "Remove from favourites" : "Add to favourites"}
        >
          <Star className="h-4 w-4" fill={report.isFavorite ? "currentColor" : "none"} />
        </button>

        {/* 1. Run — primary */}
        <Button
          size="sm"
          onClick={handleRun}
          data-testid={`btn-run-${report.id}`}
          className="gap-1"
        >
          <Play className="h-3.5 w-3.5" />
          Run
        </Button>

        {/* 2. Edit (owner) or Use Template (system) */}
        {isSystem ? (
          <Button
            size="sm"
            variant="outline"
            onClick={handleUseTemplate}
            data-testid={`btn-use-template-${report.id}`}
            className="gap-1"
          >
            <Copy className="h-3.5 w-3.5" />Use Template
          </Button>
        ) : canEdit ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(buildBuilderUrl())}
            data-testid={`btn-edit-${report.id}`}
            className="gap-1"
          >
            <Edit2 className="h-3.5 w-3.5" />Edit
          </Button>
        ) : null}

        {/* 3. Schedule */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onSchedule(report)}
          data-testid={`btn-schedule-${report.id}`}
          className="gap-1"
        >
          <Calendar className="h-3.5 w-3.5" />Schedule
        </Button>

        {/* Overflow — delete only (owner, non-system) */}
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" data-testid={`btn-more-${report.id}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => onEdit(report)}
                data-testid={`menu-rename-${report.id}`}
              >
                <Edit2 className="h-4 w-4 mr-2" />Rename / Edit Details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => onDelete(report)}
                data-testid={`menu-delete-${report.id}`}
              >
                <Trash2 className="h-4 w-4 mr-2" />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

// ── Quick Access Card ─────────────────────────────────────────────────────────

function QuickSection({
  title,
  icon: Icon,
  reports,
  emptyText,
  currentUserId,
  onEdit,
  onSchedule,
  onDelete,
  onClick,
}: {
  title: string;
  icon: React.FC<{ className?: string }>;
  reports: CustomReport[];
  emptyText: string;
  currentUserId: string;
  onEdit: (r: CustomReport) => void;
  onSchedule: (r: CustomReport) => void;
  onDelete: (r: CustomReport) => void;
  onClick?: () => void;
}) {
  return (
    <Card
      className={onClick ? "cursor-pointer hover-elevate" : ""}
      onClick={onClick}
      data-testid={`card-quick-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        </div>
        {onClick && (
          <span className="text-xs text-muted-foreground select-none">View all →</span>
        )}
      </CardHeader>
      <CardContent className="p-0" onClick={(e) => e.stopPropagation()}>
        {reports.length === 0 ? (
          <p className="px-4 py-4 text-xs text-muted-foreground italic">{emptyText}</p>
        ) : (
          reports.map((r) => (
            <ReportRow
              key={r.id}
              report={r}
              currentUserId={currentUserId}
              onEdit={(rep) => { onEdit(rep); }}
              onSchedule={(rep) => { onSchedule(rep); }}
              onDelete={(rep) => { onDelete(rep); }}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CustomReportingIntelligence() {
  const { user } = useAuth();
  const currentUserId: string = (user as any)?.claims?.sub ?? (user as any)?.id ?? "";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [subjectSelectOpen, setSubjectSelectOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CustomReport | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<CustomReport | null>(null);
  const [activeTab, setActiveTab] = useState("my-reports");
  const libraryRef = useRef<HTMLDivElement>(null);

  const navigateToTab = (tab: string) => {
    setActiveTab(tab);
    setTimeout(() => {
      libraryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const { data: reports = [], isLoading } = useQuery<CustomReport[]>({
    queryKey: ["/api/reports/custom"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/reports/custom/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports/custom"] });
      toast({ title: "Report deleted" });
    },
    onError: () => toast({ title: "Failed to delete report", variant: "destructive" }),
  });

  const handleDelete = (report: CustomReport) => {
    if (!confirm(`Delete "${report.name}"? This cannot be undone.`)) return;
    deleteMutation.mutate(report.id);
  };

  // ── Derived lists ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return reports;
    return reports.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q) ||
        (r.subject || "").toLowerCase().includes(q)
    );
  }, [reports, search]);

  const mine         = filtered.filter((r) => r.ownerId === currentUserId && !r.isSystem);
  const publicReps   = filtered.filter((r) => r.isPublic && r.ownerId !== currentUserId && !r.isSystem);
  const system       = filtered.filter((r) => r.isSystem);
  const favorites    = filtered.filter((r) => r.isFavorite);
  const scheduled    = filtered.filter((r) => r.scheduleEnabled);
  const recentlyRun  = [...filtered]
    .filter((r) => r.lastRunAt)
    .sort((a, b) => new Date(b.lastRunAt!).getTime() - new Date(a.lastRunAt!).getTime())
    .slice(0, 5);

  const rowProps = {
    currentUserId,
    onEdit:     (r: CustomReport) => setEditTarget(r),
    onSchedule: (r: CustomReport) => setScheduleTarget(r),
    onDelete:   handleDelete,
  };

  const ReportList = ({ items, empty }: { items: CustomReport[]; empty: string }) =>
    items.length === 0 ? (
      <div className="py-10 text-center text-sm text-muted-foreground">{empty}</div>
    ) : (
      <div>
        {items.map((r) => (
          <ReportRow key={r.id} report={r} {...rowProps} />
        ))}
      </div>
    );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/reports">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />Reports
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-page-title">
                Custom Reporting &amp; Intelligence
              </h1>
              <p className="text-muted-foreground text-sm">
                Build, schedule, and manage your reports in one place
              </p>
            </div>
          </div>
          <Button onClick={() => setSubjectSelectOpen(true)} data-testid="button-create-report" className="gap-2">
            <Plus className="h-4 w-4" />Create Report
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-48" />
            <Skeleton className="h-64" />
          </div>
        ) : (
          <>
            {/* Quick Access */}
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Quick Access
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <QuickSection
                  title="Recently Run"
                  icon={Clock}
                  reports={recentlyRun}
                  emptyText="No reports have been run yet."
                  onClick={() => navigateToTab("recent")}
                  {...rowProps}
                />
                <QuickSection
                  title="Favorites"
                  icon={Star}
                  reports={favorites.slice(0, 5)}
                  emptyText="Star a report to see it here."
                  onClick={() => navigateToTab("favorites")}
                  {...rowProps}
                />
                <QuickSection
                  title="Scheduled Reports"
                  icon={Calendar}
                  reports={scheduled.slice(0, 5)}
                  emptyText="No scheduled reports configured."
                  onClick={() => navigateToTab("scheduled")}
                  {...rowProps}
                />
              </div>
            </div>

            {/* Report Library */}
            <div ref={libraryRef}>
              <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Report Library
                </h2>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search reports…"
                    className="pl-8 h-8 w-56"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    data-testid="input-search-reports"
                  />
                </div>
              </div>

              <Card className="p-0">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <div className="px-4 pt-3 border-b">
                    <TabsList className="h-9">
                      <TabsTrigger value="my-reports" data-testid="tab-my-reports">
                        My Reports
                        {mine.length > 0 && (
                          <Badge variant="secondary" className="ml-1.5 text-xs">{mine.length}</Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="public" data-testid="tab-public-reports">
                        Public
                        {publicReps.length > 0 && (
                          <Badge variant="secondary" className="ml-1.5 text-xs">{publicReps.length}</Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="system" data-testid="tab-system-templates">
                        System Templates
                        {system.length > 0 && (
                          <Badge variant="secondary" className="ml-1.5 text-xs">{system.length}</Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="favorites" data-testid="tab-favorites">
                        Favorites
                        {favorites.length > 0 && (
                          <Badge variant="secondary" className="ml-1.5 text-xs">{favorites.length}</Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="scheduled" data-testid="tab-scheduled">
                        Scheduled
                        {scheduled.length > 0 && (
                          <Badge variant="secondary" className="ml-1.5 text-xs">{scheduled.length}</Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="recent" data-testid="tab-recently-run">
                        Recently Run
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="my-reports" className="mt-0">
                    {mine.length === 0 && !search ? (
                      <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <FileBarChart className="h-6 w-6 text-primary" />
                        </div>
                        <p className="text-sm text-muted-foreground">You haven't created any reports yet.</p>
                        <Button size="sm" onClick={() => setSubjectSelectOpen(true)} className="gap-1">
                          <Plus className="h-3.5 w-3.5" />Create your first report
                        </Button>
                      </div>
                    ) : (
                      <ReportList items={mine} empty="No reports match your search." />
                    )}
                  </TabsContent>

                  <TabsContent value="public" className="mt-0">
                    <ReportList
                      items={publicReps}
                      empty={search ? "No public reports match your search." : "No public reports available."}
                    />
                  </TabsContent>

                  <TabsContent value="system" className="mt-0">
                    {system.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 gap-2">
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                          <Settings2 className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          System-provided report templates will appear here.
                        </p>
                        <p className="text-xs text-muted-foreground">Coming soon.</p>
                      </div>
                    ) : (
                      <ReportList items={system} empty="No system templates match your search." />
                    )}
                  </TabsContent>

                  <TabsContent value="favorites" className="mt-0">
                    <ReportList
                      items={favorites}
                      empty={search ? "No favourites match your search." : "Star a report to add it to favourites."}
                    />
                  </TabsContent>

                  <TabsContent value="scheduled" className="mt-0">
                    <ReportList
                      items={scheduled}
                      empty={search ? "No scheduled reports match your search." : "No reports are currently scheduled."}
                    />
                  </TabsContent>

                  <TabsContent value="recent" className="mt-0">
                    <ReportList
                      items={[...filtered]
                        .filter((r) => r.lastRunAt)
                        .sort((a, b) => new Date(b.lastRunAt!).getTime() - new Date(a.lastRunAt!).getTime())}
                      empty={search ? "No recently run reports match your search." : "No reports have been run yet."}
                    />
                  </TabsContent>
                </Tabs>
              </Card>
            </div>
          </>
        )}
      </div>

      {/* Dialogs */}
      <SubjectSelectionDialog open={subjectSelectOpen} onClose={() => setSubjectSelectOpen(false)} />
      {editTarget && (
        <ReportFormDialog open onClose={() => setEditTarget(null)} existing={editTarget} />
      )}
      {scheduleTarget && (
        <ScheduleDialog open onClose={() => setScheduleTarget(null)} report={scheduleTarget} />
      )}
    </div>
  );
}
