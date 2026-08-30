import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  FileBarChart, Plus, LayoutList, ChevronRight, Search, RefreshCw,
  Filter, Eye, Pencil, ScanEye, Send, PauseCircle, Calendar,
  CheckCircle2, XCircle, AlertTriangle, Clock, Loader2, Mail, History,
  ExternalLink, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import AccountReportsDeliveryHistory from "./AccountReportsDeliveryHistory";

// ── Constants ──────────────────────────────────────────────────────────────
const SENDER_PROFILE_EMAILS: Record<string, string> = {
  Reports:    "reports@driverondemand.co",
  Data:       "data@driverondemand.co",
  Support:    "support@driverondemand.co",
  Dispatch:   "dispatch@driverondemand.co",
  Recruiting: "recruiting@driverondemand.co",
};

// ── Types ──────────────────────────────────────────────────────────────────
interface CampaignRow {
  id: string;
  campaign_name: string;
  report_type: string;
  sender_profile: string;
  status: string;
  schedule_type: string;
  schedule_day: string | null;
  schedule_time: string | null;
  timezone: string;
  created_by_user_id: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  account_count: number;
  last_run_id: string | null;
  last_run_status: string | null;
  last_run_started_at: string | null;
  last_run_completed_at: string | null;
  last_run_total_accounts:       number | null;
  last_run_delivered_count:      number | null;
  last_run_failed_count:         number | null;
  last_run_not_sent_count:       number | null;
  last_run_schedule_week_start:  string | null;
  last_run_schedule_week_end:    string | null;
}

interface LastRunDeliveryRow {
  id:             string;
  account_id:     string;
  customer_name:  string;
  status:         string;
  recipient_name:  string | null;
  recipient_email: string | null;
  sent_at:        string | null;
  failure_type:   string | null;
  error_message:  string | null;
  opened:         boolean | null;
  first_opened_at: string | null;
  last_opened_at:  string | null;
  open_count:     number | null;
}

interface NotIncludedAccount {
  account_id:    string;
  customer_name: string;
  reason:        string;
  notes:         string;
  is_eligible:   boolean;
}

interface ReconciliationData {
  eligible_count:    number;
  delivered_count:   number;
  failed_count:      number;
  blocked_count:     number;
  no_schedule_count: number;
  excluded_count:    number;
  not_included:      NotIncludedAccount[];
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtWeekRange(start: string | null, end: string | null): string {
  if (!start) return "—";
  const fmt = (iso: string) => {
    const d = new Date(iso + "T12:00:00Z");
    return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC" });
  };
  return end ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
}

function fmtShortDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function DeliveryStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    delivered: { label: "Delivered", variant: "default"     },
    failed:    { label: "Failed",    variant: "destructive" },
    not_sent:  { label: "Not Sent",  variant: "secondary"   },
    blocked:   { label: "Blocked",   variant: "outline"     },
  };
  const cfg = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function ReasonBadge({ reason }: { reason: string }) {
  const cls =
    ["Missing Recipient", "Generation Error", "Mailbox Blocked"].includes(reason)
      ? "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800"
      : reason === "Campaign Excluded"
        ? "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800"
        : "text-muted-foreground bg-muted/50 border-border";
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md border ${cls}`}>
      {reason}
    </span>
  );
}

function friendlyReportType(raw: string): string {
  const map: Record<string, string> = {
    WEEKLY_ACCOUNT_SCHEDULE: "Weekly Account Schedule",
  };
  return map[raw] ?? raw.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function friendlySchedule(c: CampaignRow): string {
  if (c.schedule_type === "manual") return "Manual Only";
  if (c.schedule_type === "monthly") return "Monthly";
  if (c.schedule_type === "weekly") {
    const day = c.schedule_day ?? "—";
    if (!c.schedule_time) return `Weekly — ${day}`;
    const [h, m] = c.schedule_time.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    return `Weekly — ${day} ${time}`;
  }
  return c.schedule_type;
}

function computeNextRun(c: CampaignRow): string {
  if (c.status !== "active") return "N/A";
  if (c.schedule_type === "manual") return "N/A";
  if (c.schedule_type === "monthly") return "Monthly";
  if (c.schedule_type === "weekly" && c.schedule_day) {
    const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const target = dayNames.indexOf(c.schedule_day);
    if (target === -1) return "—";
    const now = new Date();
    const current = now.getDay();
    let diff = (target - current + 7) % 7;
    if (diff === 0) diff = 7;
    const next = new Date(now);
    next.setDate(next.getDate() + diff);
    if (c.schedule_time) {
      const [h, m] = c.schedule_time.split(":").map(Number);
      next.setHours(h, m, 0, 0);
    }
    return next.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  return "—";
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    active:   { label: "Active",   variant: "default"   },
    paused:   { label: "Paused",   variant: "secondary" },
    disabled: { label: "Disabled", variant: "outline"   },
  };
  const cfg = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={cfg.variant} data-testid={`badge-status-${status}`}>{cfg.label}</Badge>;
}

function RunResultBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">No Runs Yet</span>;
  const map: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
    completed: { label: "Completed", icon: <CheckCircle2 className="h-3 w-3" />,         cls: "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800" },
    failed:    { label: "Failed",    icon: <XCircle className="h-3 w-3" />,               cls: "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800" },
    blocked:   { label: "Blocked",   icon: <AlertTriangle className="h-3 w-3" />,         cls: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800" },
    sending:   { label: "Sending",   icon: <Loader2 className="h-3 w-3 animate-spin" />, cls: "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800" },
    pending:   { label: "Pending",   icon: <Clock className="h-3 w-3" />,                cls: "text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800" },
  };
  const cfg = map[status] ?? { label: status, icon: null, cls: "" };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md border ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function AccountReports() {
  const { toast } = useToast();
  const { isSuperAdmin, user } = useAuth();
  const canAccessAccountReports = isSuperAdmin || user?.role === "corporate" || user?.role === "corporate_admin";

  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState("all");
  const [typeFilter,    setTypeFilter]    = useState("all");
  const [senderFilter,  setSenderFilter]  = useState("all");
  const [selected,      setSelected]      = useState<CampaignRow | null>(null);
  const [accountSearch, setAccountSearch] = useState("");

  // Build query params
  const params = new URLSearchParams();
  if (search)                   params.set("search",        search);
  if (statusFilter !== "all")   params.set("status",        statusFilter);
  if (typeFilter   !== "all")   params.set("reportType",    typeFilter);
  if (senderFilter !== "all")   params.set("senderProfile", senderFilter);

  const { data: lastRunDeliveries = [], isLoading: deliveriesLoading } = useQuery<LastRunDeliveryRow[]>({
    queryKey: ["/api/admin/amr-delivery-history/runs", selected?.last_run_id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/amr-delivery-history/runs/${selected!.last_run_id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selected?.last_run_id,
  });

  const { data: reconciliation } = useQuery<ReconciliationData>({
    queryKey: ["/api/admin/amr-delivery-history/runs/reconciliation", selected?.last_run_id],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/amr-delivery-history/runs/${selected!.last_run_id}/reconciliation`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selected?.last_run_id,
  });

  const { data: campaigns = [], isLoading, refetch } = useQuery<CampaignRow[]>({
    queryKey: ["/api/admin/account-report-campaigns", search, statusFilter, typeFilter, senderFilter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/account-report-campaigns?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load campaigns");
      return res.json();
    },
    enabled: canAccessAccountReports,
  });

  const allReportTypes    = useMemo(() => [...new Set(campaigns.map(c => c.report_type))], [campaigns]);
  const allSenderProfiles = useMemo(() => [...new Set(campaigns.map(c => c.sender_profile))], [campaigns]);

  const filteredDeliveries = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    if (!q) return lastRunDeliveries;
    return lastRunDeliveries.filter(r =>
      r.customer_name.toLowerCase().includes(q) ||
      r.status.toLowerCase().includes(q) ||
      (r.recipient_name  ?? "").toLowerCase().includes(q) ||
      (r.recipient_email ?? "").toLowerCase().includes(q)
    );
  }, [lastRunDeliveries, accountSearch]);

  const deliveryStats = useMemo(() => ({
    delivered: lastRunDeliveries.filter(r => r.status === "delivered").length,
    failed:    lastRunDeliveries.filter(r => r.status === "failed").length,
    blocked:   lastRunDeliveries.filter(r => r.status === "blocked").length,
    not_sent:  lastRunDeliveries.filter(r => r.status === "not_sent").length,
  }), [lastRunDeliveries]);

  const failureStats = useMemo(() => ({
    invalid_email:     lastRunDeliveries.filter(r => r.failure_type === "invalid_email").length,
    mailbox_not_found: lastRunDeliveries.filter(r => r.failure_type === "mailbox_not_found").length,
    bounced:           lastRunDeliveries.filter(r => r.failure_type === "bounced").length,
    blocked:           lastRunDeliveries.filter(r => r.failure_type === "blocked").length,
  }), [lastRunDeliveries]);

  if (!canAccessAccountReports) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <p className="text-sm text-muted-foreground">Access restricted. This module requires Corporate, Corporate Admin, or Super Admin role.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10">
            <FileBarChart className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Account Reports</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage automated report campaigns and view delivery history
            </p>
          </div>
        </div>
        <Button data-testid="button-create-report-campaign" disabled>
          <Plus className="h-4 w-4 mr-2" />
          Create Report Campaign
        </Button>
      </div>

      {/* ── Email Infrastructure Notice ───────────────────────── */}
      <div className="flex items-start gap-3 rounded-md border border-border bg-muted/40 px-4 py-3">
        <Mail className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Email delivery via Microsoft 365</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Report emails are sent through the Microsoft 365 integration managed in
            Communications Center. Mailbox health, credentials, and sender profiles are
            configured there.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild className="shrink-0">
          <a href="/admin/communications/microsoft-365" data-testid="btn-ms365-settings">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />MS365 Settings
          </a>
        </Button>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────── */}
      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns" className="gap-2" data-testid="tab-campaigns">
            <LayoutList className="h-3.5 w-3.5" />
            Campaigns
          </TabsTrigger>
          <TabsTrigger value="delivery-history" className="gap-2" data-testid="tab-delivery-history">
            <History className="h-3.5 w-3.5" />
            Delivery History
          </TabsTrigger>
        </TabsList>

        {/* ── Campaigns Tab ─────────────────────────────────────── */}
        <TabsContent value="campaigns" className="space-y-6 mt-6">

          {/* Campaigns Table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <LayoutList className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Report Campaigns</CardTitle>
                  {campaigns.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{campaigns.length}</Badge>
                  )}
                </div>
                <Button size="icon" variant="ghost" onClick={() => refetch()} data-testid="button-refresh-campaigns">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>

              {/* Search + Filters */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search campaigns…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 h-8 text-sm"
                    data-testid="input-search-campaigns"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 text-sm w-36" data-testid="filter-status">
                    <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="h-8 text-sm w-44" data-testid="filter-report-type">
                    <SelectValue placeholder="Report Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {allReportTypes.map(t => (
                      <SelectItem key={t} value={t}>{friendlyReportType(t)}</SelectItem>
                    ))}
                    {allReportTypes.length === 0 && (
                      <SelectItem value="WEEKLY_ACCOUNT_SCHEDULE">Weekly Account Schedule</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <Select value={senderFilter} onValueChange={setSenderFilter}>
                  <SelectTrigger className="h-8 text-sm w-40" data-testid="filter-sender-profile">
                    <SelectValue placeholder="Sender Profile" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Senders</SelectItem>
                    {["Reports","Data","Support","Dispatch","Recruiting"].map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(statusFilter !== "all" || typeFilter !== "all" || senderFilter !== "all" || search) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    onClick={() => { setSearch(""); setStatusFilter("all"); setTypeFilter("all"); setSenderFilter("all"); }}
                    data-testid="button-clear-filters"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <Table data-testid="table-campaigns">
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Campaign Name</TableHead>
                    <TableHead className="whitespace-nowrap">Report Type</TableHead>
                    <TableHead className="whitespace-nowrap">Sender Profile</TableHead>
                    <TableHead className="whitespace-nowrap">Accounts</TableHead>
                    <TableHead className="whitespace-nowrap">Schedule</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="whitespace-nowrap">Created By</TableHead>
                    <TableHead className="whitespace-nowrap">Created</TableHead>
                    <TableHead className="whitespace-nowrap">Last Run</TableHead>
                    <TableHead className="whitespace-nowrap">Next Run</TableHead>
                    <TableHead className="whitespace-nowrap">Last Result</TableHead>
                    <TableHead className="whitespace-nowrap">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 12 }).map((_, j) => (
                          <TableCell key={j}><div className="h-4 rounded bg-muted animate-pulse w-20" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : campaigns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="h-36 text-center" data-testid="campaigns-empty-state">
                        <div className="flex flex-col items-center gap-3">
                          <FileBarChart className="h-8 w-8 text-muted-foreground/40" />
                          <p className="text-sm text-muted-foreground">No report campaigns have been created yet.</p>
                          <Button size="sm" disabled data-testid="button-create-first-campaign">
                            <Plus className="h-3.5 w-3.5 mr-1.5" />
                            Create Report Campaign
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    campaigns.map(c => (
                      <TableRow
                        key={c.id}
                        className={`cursor-pointer ${selected?.id === c.id ? "bg-accent/50" : ""}`}
                        onClick={() => setSelected(prev => prev?.id === c.id ? null : c)}
                        data-testid={`row-campaign-${c.id}`}
                      >
                        <TableCell>
                          <span className="font-medium text-sm" data-testid={`text-campaign-name-${c.id}`}>
                            {c.campaign_name}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground" data-testid={`text-report-type-${c.id}`}>
                            {friendlyReportType(c.report_type)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm" data-testid={`text-sender-${c.id}`}>{c.sender_profile}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm tabular-nums" data-testid={`text-accounts-${c.id}`}>
                            {c.account_count} {c.account_count === 1 ? "account" : "accounts"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground whitespace-nowrap" data-testid={`text-schedule-${c.id}`}>
                            {friendlySchedule(c)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={c.status} />
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground" data-testid={`text-created-by-${c.id}`}>
                            {c.created_by_name ?? c.created_by_user_id ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground whitespace-nowrap" data-testid={`text-created-at-${c.id}`}>
                            {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground whitespace-nowrap" data-testid={`text-last-run-${c.id}`}>
                            {c.last_run_started_at
                              ? new Date(c.last_run_started_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                              : "Never"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground whitespace-nowrap" data-testid={`text-next-run-${c.id}`}>
                            {computeNextRun(c)}
                          </span>
                        </TableCell>
                        <TableCell data-testid={`text-last-result-${c.id}`}>
                          <RunResultBadge status={c.last_run_status} />
                        </TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setSelected(prev => prev?.id === c.id ? null : c)}
                                  data-testid={`button-view-campaign-${c.id}`}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>View</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" disabled data-testid={`button-edit-campaign-${c.id}`}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit (coming soon)</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" disabled data-testid={`button-preview-campaign-${c.id}`}>
                                  <ScanEye className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Preview (coming soon)</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" disabled data-testid={`button-send-test-campaign-${c.id}`}>
                                  <Send className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Send Test (coming soon)</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" disabled data-testid={`button-pause-campaign-${c.id}`}>
                                  <PauseCircle className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {c.status === "paused" ? "Resume" : "Pause"} (coming soon)
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Campaign Detail Panel */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Campaign Detail</CardTitle>
                {selected && <Badge variant="outline" className="text-xs">{selected.campaign_name}</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              {!selected ? (
                <div
                  className="flex flex-col items-center justify-center h-24 text-sm text-muted-foreground gap-1"
                  data-testid="campaign-detail-empty-state"
                >
                  <p>Select a report campaign to view details</p>
                </div>
              ) : (
                <div className="space-y-4" data-testid="campaign-detail-panel">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Campaign Name</p>
                      <p className="font-medium">{selected.campaign_name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Report Type</p>
                      <p>{friendlyReportType(selected.report_type)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Sender Profile</p>
                      <p>{selected.sender_profile}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Sender Mailbox</p>
                      <p className="text-sm">
                        {SENDER_PROFILE_EMAILS[selected.sender_profile] ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Status</p>
                      <StatusBadge status={selected.status} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Schedule</p>
                      <p>{friendlySchedule(selected)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Timezone</p>
                      <p>{selected.timezone}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Configured Recipients</p>
                      <p>{selected.account_count} {selected.account_count === 1 ? "account" : "accounts"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Next Run</p>
                      <p>{computeNextRun(selected)}</p>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Created By</p>
                      <p>{selected.created_by_name ?? selected.created_by_user_id ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Created</p>
                      <p>{new Date(selected.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Last Run</p>
                      <p>{selected.last_run_started_at ? new Date(selected.last_run_started_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Never"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Last Result</p>
                      <RunResultBadge status={selected.last_run_status} />
                    </div>
                  </div>

                  {selected.last_run_id && (
                    <>
                      <Separator />

                      {/* Last Run Summary */}
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Last Run Summary</p>
                        {selected.last_run_schedule_week_start && (
                          <div className="flex items-center gap-1.5 text-sm mb-3">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">Schedule Week:</span>
                            <span className="font-medium">
                              {fmtWeekRange(selected.last_run_schedule_week_start, selected.last_run_schedule_week_end)}
                            </span>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-4 text-sm">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                            <span>{selected.last_run_delivered_count ?? 0} Accounts Delivered</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <XCircle className="h-3.5 w-3.5 text-red-500" />
                            <span>{selected.last_run_failed_count ?? 0} Failed</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{selected.last_run_not_sent_count ?? 0} Not Sent</span>
                          </div>
                        </div>
                      </div>

                      <Separator />

                      {/* Accounts Included in Last Run */}
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Accounts Included in Last Run
                          </p>
                          {!deliveriesLoading && lastRunDeliveries.length > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {lastRunDeliveries.length}
                            </Badge>
                          )}
                        </div>

                        {deliveriesLoading ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading accounts…
                          </div>
                        ) : lastRunDeliveries.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-2">No delivery records found for this run.</p>
                        ) : (
                          <>
                            {/* Reconciliation Metrics */}
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-3">
                              <div className="rounded-md border bg-card px-3 py-2 text-center">
                                <p className="text-lg font-semibold text-primary">
                                  {reconciliation
                                    ? reconciliation.eligible_count
                                    : deliveryStats.delivered + deliveryStats.failed + deliveryStats.blocked + deliveryStats.not_sent}
                                </p>
                                <p className="text-xs text-muted-foreground">Eligible</p>
                              </div>
                              <div className="rounded-md border bg-card px-3 py-2 text-center">
                                <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                                  {reconciliation ? reconciliation.delivered_count : deliveryStats.delivered}
                                </p>
                                <p className="text-xs text-muted-foreground">Delivered</p>
                              </div>
                              <div className="rounded-md border bg-card px-3 py-2 text-center">
                                <p className="text-lg font-semibold text-red-600 dark:text-red-400">
                                  {reconciliation ? reconciliation.failed_count : deliveryStats.failed}
                                </p>
                                <p className="text-xs text-muted-foreground">Failed</p>
                              </div>
                              <div className="rounded-md border bg-card px-3 py-2 text-center">
                                <p className="text-lg font-semibold text-amber-600 dark:text-amber-400">
                                  {reconciliation ? reconciliation.blocked_count : deliveryStats.blocked}
                                </p>
                                <p className="text-xs text-muted-foreground">Blocked</p>
                              </div>
                              <div className="rounded-md border bg-card px-3 py-2 text-center">
                                <p className="text-lg font-semibold text-muted-foreground">
                                  {reconciliation ? reconciliation.no_schedule_count : deliveryStats.not_sent}
                                </p>
                                <p className="text-xs text-muted-foreground">No Schedule</p>
                              </div>
                              <div className="rounded-md border bg-card px-3 py-2 text-center">
                                <p className="text-lg font-semibold text-orange-600 dark:text-orange-400">
                                  {reconciliation ? reconciliation.excluded_count : 0}
                                </p>
                                <p className="text-xs text-muted-foreground">Excluded</p>
                              </div>
                            </div>

                            {/* Email Quality Dashboard */}
                            <div className="mb-3">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                                Email Quality
                              </p>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="rounded-md border bg-card px-3 py-2 text-center">
                                  <p className={`text-lg font-semibold ${failureStats.invalid_email > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                                    {failureStats.invalid_email}
                                  </p>
                                  <p className="text-xs text-muted-foreground">Invalid Email</p>
                                </div>
                                <div className="rounded-md border bg-card px-3 py-2 text-center">
                                  <p className={`text-lg font-semibold ${failureStats.mailbox_not_found > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                                    {failureStats.mailbox_not_found}
                                  </p>
                                  <p className="text-xs text-muted-foreground">Mailbox Not Found</p>
                                </div>
                                <div className="rounded-md border bg-card px-3 py-2 text-center">
                                  <p className={`text-lg font-semibold ${failureStats.bounced > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                                    {failureStats.bounced}
                                  </p>
                                  <p className="text-xs text-muted-foreground">Bounced</p>
                                </div>
                                <div className="rounded-md border bg-card px-3 py-2 text-center">
                                  <p className={`text-lg font-semibold ${failureStats.blocked > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                                    {failureStats.blocked}
                                  </p>
                                  <p className="text-xs text-muted-foreground">Blocked</p>
                                </div>
                              </div>
                            </div>

                            {/* Search Accounts */}
                            <div className="relative mb-3">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                              <Input
                                placeholder="Search by account, recipient name, or email…"
                                value={accountSearch}
                                onChange={e => setAccountSearch(e.target.value)}
                                className="pl-8 text-sm"
                                data-testid="input-search-accounts"
                              />
                            </div>

                            <div className="rounded-md border overflow-hidden">
                              <div className="max-h-80 overflow-y-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="whitespace-nowrap">Account Name</TableHead>
                                      <TableHead className="whitespace-nowrap">Recipient Name</TableHead>
                                      <TableHead className="whitespace-nowrap">Recipient Email</TableHead>
                                      <TableHead className="whitespace-nowrap">Delivery Status</TableHead>
                                      <TableHead className="whitespace-nowrap">Failure Type</TableHead>
                                      <TableHead className="whitespace-nowrap">Sent At</TableHead>
                                      <TableHead className="whitespace-nowrap">Opened</TableHead>
                                      <TableHead className="whitespace-nowrap">Report</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {filteredDeliveries.length === 0 ? (
                                      <TableRow>
                                        <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">
                                          No accounts match your search.
                                        </TableCell>
                                      </TableRow>
                                    ) : filteredDeliveries.map(row => {
                                      const isHistorical =
                                        row.status === "delivered" &&
                                        row.error_message === "Historical summary only — recipient detail unavailable";
                                      const reportUrl = `/api/admin/amr-delivery-history/deliveries/${row.id}/report`;
                                      return (
                                        <TableRow key={row.id} data-testid={`row-lastrun-${row.id}`}>
                                          <TableCell className="font-medium text-sm py-2">
                                            <Link
                                              to={`/customers/${row.account_id}`}
                                              className="inline-flex items-center gap-1 text-primary hover:underline"
                                              data-testid={`link-account-${row.account_id}`}
                                            >
                                              {row.customer_name}
                                              <ExternalLink className="h-3 w-3 opacity-60" />
                                            </Link>
                                          </TableCell>
                                          <TableCell className="py-2">
                                            {isHistorical ? (
                                              <span className="text-xs text-muted-foreground italic">Unavailable</span>
                                            ) : row.recipient_name ? (
                                              <span className="text-xs font-medium">{row.recipient_name}</span>
                                            ) : (
                                              <span className="text-xs text-muted-foreground">—</span>
                                            )}
                                          </TableCell>
                                          <TableCell className="py-2">
                                            {isHistorical ? (
                                              <span className="text-xs text-muted-foreground italic">Unavailable</span>
                                            ) : row.recipient_email ? (
                                              <span className="text-xs text-muted-foreground">{row.recipient_email}</span>
                                            ) : (
                                              <span className="text-xs text-muted-foreground">—</span>
                                            )}
                                          </TableCell>
                                          <TableCell className="py-2">
                                            <DeliveryStatusBadge status={row.status} />
                                          </TableCell>
                                          <TableCell className="py-2">
                                            {row.failure_type ? (
                                              <span className="text-xs text-red-600 dark:text-red-400 capitalize">
                                                {row.failure_type.replace(/_/g, " ")}
                                              </span>
                                            ) : (
                                              <span className="text-xs text-muted-foreground">—</span>
                                            )}
                                          </TableCell>
                                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap py-2">
                                            {fmtShortDateTime(row.sent_at)}
                                          </TableCell>
                                          <TableCell className="py-2">
                                            <span className="text-xs text-muted-foreground italic">Not Tracked</span>
                                          </TableCell>
                                          <TableCell className="py-2">
                                            {isHistorical ? (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <span>
                                                    <Button
                                                      size="sm"
                                                      variant="outline"
                                                      disabled
                                                      data-testid={`button-view-report-${row.id}`}
                                                    >
                                                      <FileText className="h-3.5 w-3.5 mr-1.5" />
                                                      View Report
                                                    </Button>
                                                  </span>
                                                </TooltipTrigger>
                                                <TooltipContent>Not available for historical runs</TooltipContent>
                                              </Tooltip>
                                            ) : row.status === "delivered" ? (
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                asChild
                                                data-testid={`button-view-report-${row.id}`}
                                              >
                                                <a href={reportUrl} target="_blank" rel="noopener noreferrer">
                                                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                                                  View Report
                                                </a>
                                              </Button>
                                            ) : (
                                              <span className="text-xs text-muted-foreground">—</span>
                                            )}
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                            {lastRunDeliveries.every(r => !r.recipient_email) && (
                              <p className="text-xs text-muted-foreground mt-2">
                                Recipient detail unavailable for this run. Future live runs will capture recipient addresses.
                              </p>
                            )}

                            {/* Accounts Not Included in Last Run */}
                            {reconciliation && reconciliation.not_included.length > 0 && (
                              <>
                                <Separator className="my-4" />
                                <div>
                                  <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                                    <div>
                                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        Accounts Not Included in Last Run
                                      </p>
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        Active driver accounts that did not receive a report in this run
                                      </p>
                                    </div>
                                    <Badge variant="secondary" className="text-xs">
                                      {reconciliation.not_included.length}
                                    </Badge>
                                  </div>
                                  <div className="rounded-md border overflow-hidden">
                                    <div className="max-h-72 overflow-y-auto">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>Account Name</TableHead>
                                            <TableHead>Reason</TableHead>
                                            <TableHead>Notes</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {reconciliation.not_included.map(acc => (
                                            <TableRow
                                              key={acc.account_id}
                                              className={acc.is_eligible ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}
                                              data-testid={`row-not-included-${acc.account_id}`}
                                            >
                                              <TableCell className="font-medium text-sm py-2">
                                                <Link
                                                  to={`/customers/${acc.account_id}`}
                                                  className="inline-flex items-center gap-1 text-primary hover:underline"
                                                >
                                                  {acc.customer_name}
                                                  <ExternalLink className="h-3 w-3 opacity-60" />
                                                </Link>
                                              </TableCell>
                                              <TableCell className="py-2">
                                                <ReasonBadge reason={acc.reason} />
                                              </TableCell>
                                              <TableCell className="text-xs text-muted-foreground py-2 max-w-xs">
                                                {acc.notes}
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>
                                  {reconciliation.not_included.some(a => a.is_eligible) && (
                                    <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-700 dark:text-amber-400">
                                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                                      <span>Highlighted rows are eligible accounts that were not included in this run.</span>
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Delivery History Tab ───────────────────────────────── */}
        <TabsContent value="delivery-history" className="mt-6">
          <AccountReportsDeliveryHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}
