import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search, RefreshCw, Download, Filter, ChevronDown, ChevronRight, X,
  CheckCircle2, XCircle, Clock, AlertTriangle, Loader2, Users,
  Send, BarChart3, Calendar, Eye, EyeOff, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// ── Types ─────────────────────────────────────────────────────────────────────
interface DeliverySummary {
  total_runs:           number;
  accounts_included:    number;
  recipients_delivered: number;
  failed_recipients:    number;
  not_sent_recipients:  number;
  blocked_sends:        number;
}

interface ReconciliationRow {
  account_id:    string;
  customer_name: string;
  reason:        string;
  notes:         string | null;
  is_eligible:   boolean;
}
interface ReconciliationData {
  eligible_count:    number;
  delivered_count:   number;
  failed_count:      number;
  blocked_count:     number;
  no_schedule_count: number;
  excluded_count:    number;
  not_included:      ReconciliationRow[];
}

interface RunRow {
  id:                 string;
  campaign_id:        string;
  campaign_name:      string;
  report_type:        string;
  sender_profile:     string;
  campaign_created_at: string;
  created_by_name:    string | null;
  run_type:           string;
  status:             string;
  total_accounts:     number;
  delivered_count:    number;
  failed_count:       number;
  not_sent_count:     number;
  blocked_count:      number;
  schedule_week_start: string | null;
  schedule_week_end:   string | null;
  triggered_by:       string | null;
  started_at:         string | null;
  completed_at:       string | null;
  created_at:         string;
}

interface DeliveryDetailRow {
  id:                  string;
  run_id:              string;
  account_id:          string;
  customer_name:       string;
  recipient_name:      string | null;
  recipient_email:     string | null;
  status:              string;
  sent_at:             string | null;
  error_message:       string | null;
  failure_type:        string | null;
  provider_message_id: string | null;
  campaign_name:       string;
  sender_profile:      string;
  report_type:         string;
  schedule_week_start: string | null;
  schedule_week_end:   string | null;
  triggered_by:        string | null;
  run_type:            string;
  run_started_at:      string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function fmtWeek(start: string | null, end: string | null) {
  if (!start) return "—";
  const s = new Date(start + "T12:00:00Z");
  const e = end ? new Date(end + "T12:00:00Z") : null;
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return e ? `${fmt(s)} – ${fmt(e)}` : fmt(s);
}

function fmtDateMDY(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00Z");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getUTCFullYear()}`;
}

// "Driver Schedules — 06/15/2026" for weekly account schedule runs
function runDisplayName(run: Pick<RunRow, "campaign_name" | "report_type" | "schedule_week_start">): string {
  const isWeekly =
    run.report_type === "WEEKLY_ACCOUNT_SCHEDULE" ||
    run.campaign_name === "Automated Weekly Schedule" ||
    run.campaign_name?.toLowerCase().includes("driver schedule");
  if (isWeekly && run.schedule_week_start) {
    return `Driver Schedules — ${fmtDateMDY(run.schedule_week_start)}`;
  }
  return run.campaign_name ?? "—";
}

// ── RunStatusBadge ────────────────────────────────────────────────────────────
function RunStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
    completed: { label: "Completed", icon: <CheckCircle2 className="h-3 w-3" />,         cls: "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800" },
    failed:    { label: "Failed",    icon: <XCircle className="h-3 w-3" />,               cls: "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800" },
    blocked:   { label: "Blocked",   icon: <AlertTriangle className="h-3 w-3" />,         cls: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800" },
    sending:   { label: "Sending",   icon: <Loader2 className="h-3 w-3 animate-spin" />, cls: "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800" },
    pending:   { label: "Pending",   icon: <Clock className="h-3 w-3" />,                 cls: "text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800" },
  };
  const cfg = map[status] ?? { label: status, icon: null, cls: "text-muted-foreground border-border" };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md border ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ── TriggerByLabel ────────────────────────────────────────────────────────────
const TRIGGER_LABELS: Record<string, string> = {
  scheduler:     "Scheduler",
  manual:        "Manual",
  backfill:      "Historical",
  internal_test: "Internal Test",
};
function TriggerByLabel({ value, inline }: { value: string | null; inline?: boolean }) {
  const label = value
    ? (TRIGGER_LABELS[value] ?? value.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()))
    : "—";
  if (inline) return <span className="capitalize">{label}</span>;
  return <span className="text-sm text-muted-foreground">{label}</span>;
}

// ── DeliveryStatusBadge ───────────────────────────────────────────────────────
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

// ── FailureTypeBadge ──────────────────────────────────────────────────────────
const FAILURE_LABELS: Record<string, string> = {
  invalid_email:     "Invalid Email",
  mailbox_not_found: "Mailbox Not Found",
  bounced:           "Bounced",
  blocked:           "Blocked",
  graph_error:       "Graph Error",
  no_recipient:      "No Recipient",
  unknown:           "Unknown",
};
function FailureTypeBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-xs text-muted-foreground">—</span>;
  const label = FAILURE_LABELS[value] ?? value.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-md border text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800">
      {label}
    </span>
  );
}

// ── ReasonBadge ───────────────────────────────────────────────────────────────
function ReasonBadge({ reason }: { reason: string }) {
  const isException = ["Missing Recipient", "Generation Error", "Mailbox Blocked"].includes(reason);
  const cls = isException
    ? "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800"
    : reason === "Campaign Excluded"
    ? "text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800"
    : reason === "No Schedule Data"
    ? "text-muted-foreground border-border bg-muted/40"
    : reason === "Weekly Reports Disabled"
    ? "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"
    : "text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded-md border ${cls}`}>
      {reason}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AccountReportsDeliveryHistory() {
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState("all");
  const [senderFilter,  setSenderFilter]  = useState("all");
  const [triggeredBy,   setTriggeredBy]   = useState("all");
  const [dateFrom,      setDateFrom]      = useState("");
  const [dateTo,        setDateTo]        = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  function buildParams() {
    const p = new URLSearchParams();
    if (search)               p.set("search",        search);
    if (statusFilter !== "all") p.set("status",      statusFilter);
    if (senderFilter !== "all") p.set("senderProfile", senderFilter);
    if (triggeredBy  !== "all") p.set("triggeredBy", triggeredBy);
    if (dateFrom)             p.set("dateFrom",      dateFrom);
    if (dateTo)               p.set("dateTo",        dateTo);
    return p.toString();
  }

  const filterKey = [search, statusFilter, senderFilter, triggeredBy, dateFrom, dateTo];

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
    refetch: refetchSummary,
  } = useQuery<DeliverySummary>({
    queryKey: ["/api/admin/amr-delivery-history/summary", ...filterKey],
    queryFn: async () => {
      const res = await fetch(`/api/admin/amr-delivery-history/summary?${buildParams()}`, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(`${res.status}: ${body?.message ?? res.statusText}`);
      }
      return res.json();
    },
    retry: false,
  });

  const {
    data: runs = [],
    isLoading: runsLoading,
    error: runsError,
    refetch: refetchRuns,
  } = useQuery<RunRow[]>({
    queryKey: ["/api/admin/amr-delivery-history/runs", ...filterKey],
    queryFn: async () => {
      const res = await fetch(`/api/admin/amr-delivery-history/runs?${buildParams()}`, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(`${res.status}: ${body?.message ?? res.statusText}`);
      }
      return res.json();
    },
    retry: false,
  });

  const { data: detail = [], isLoading: detailLoading } = useQuery<DeliveryDetailRow[]>({
    queryKey: ["/api/admin/amr-delivery-history/runs", selectedRunId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/amr-delivery-history/runs/${selectedRunId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedRunId,
  });

  const { data: reconciliation, isLoading: reconcLoading } = useQuery<ReconciliationData>({
    queryKey: ["/api/admin/amr-delivery-history/runs/reconciliation", selectedRunId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/amr-delivery-history/runs/${selectedRunId}/reconciliation`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedRunId,
  });

  const hasFilters = !!(search || statusFilter !== "all" || senderFilter !== "all" || triggeredBy !== "all" || dateFrom || dateTo);

  function clearFilters() {
    setSearch(""); setStatusFilter("all"); setSenderFilter("all");
    setTriggeredBy("all"); setDateFrom(""); setDateTo("");
  }

  function handleExport() {
    window.open(`/api/admin/amr-delivery-history/export?${buildParams()}`, "_blank");
  }

  const selectedRun = runs.find(r => r.id === selectedRunId) ?? null;

  const summaryCards = [
    { label: "Total Runs",        value: summary?.total_runs            ?? 0, icon: <BarChart3     className="h-4 w-4" />, color: "text-primary"          },
    { label: "Accts Included",    value: summary?.accounts_included     ?? 0, icon: <Users         className="h-4 w-4" />, color: "text-blue-500"         },
    { label: "Accts Delivered",   value: summary?.recipients_delivered  ?? 0, icon: <CheckCircle2  className="h-4 w-4" />, color: "text-green-500"        },
    { label: "Failed",            value: summary?.failed_recipients     ?? 0, icon: <XCircle       className="h-4 w-4" />, color: "text-red-500"          },
    { label: "Not Sent",          value: summary?.not_sent_recipients   ?? 0, icon: <Clock         className="h-4 w-4" />, color: "text-muted-foreground" },
    { label: "Blocked",           value: summary?.blocked_sends         ?? 0, icon: <AlertTriangle className="h-4 w-4" />, color: "text-amber-500"        },
  ];

  return (
    <div className="space-y-6">

      {/* ── Summary Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {summaryCards.map(card => (
          <Card key={card.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{card.label}</span>
                <span className={card.color}>{card.icon}</span>
              </div>
              {summaryLoading ? (
                <div className="h-7 w-12 rounded bg-muted animate-pulse" />
              ) : (
                <p className="text-2xl font-semibold tabular-nums"
                   data-testid={`summary-${card.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  {card.value.toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Campaign Runs Table ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Delivery Runs</CardTitle>
              {runs.length > 0 && (
                <Badge variant="secondary" className="text-xs">{runs.length}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={handleExport}
                data-testid="button-export-delivery-csv"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => { refetchSummary(); refetchRuns(); }}
                data-testid="button-refresh-delivery-history"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <div className="relative flex-1 min-w-52">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by run name, account, or recipient…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
                data-testid="input-search-delivery-history"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-sm w-36" data-testid="filter-delivery-status">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="sending">Sending</SelectItem>
              </SelectContent>
            </Select>
            <Select value={senderFilter} onValueChange={setSenderFilter}>
              <SelectTrigger className="h-8 text-sm w-40" data-testid="filter-delivery-sender">
                <SelectValue placeholder="Sender Profile" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Senders</SelectItem>
                {["Reports","Data","Support","Dispatch","Recruiting"].map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={triggeredBy} onValueChange={setTriggeredBy}>
              <SelectTrigger className="h-8 text-sm w-44" data-testid="filter-triggered-by">
                <SelectValue placeholder="Triggered By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Triggers</SelectItem>
                <SelectItem value="scheduler">Scheduler</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="backfill">Backfill (Historical)</SelectItem>
                <SelectItem value="internal_test">Internal Test</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-8 text-sm w-36"
                data-testid="input-date-from"
              />
              <span className="text-xs text-muted-foreground">–</span>
              <Input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="h-8 text-sm w-36"
                data-testid="input-date-to"
              />
            </div>
            {hasFilters && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs gap-1"
                onClick={clearFilters}
                data-testid="button-clear-delivery-filters"
              >
                <X className="h-3 w-3" />
                Clear
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table data-testid="table-delivery-runs">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 pl-3" />
                  <TableHead className="whitespace-nowrap">Run Name</TableHead>
                  <TableHead className="whitespace-nowrap">Schedule Week</TableHead>
                  <TableHead className="whitespace-nowrap">Sender</TableHead>
                  <TableHead className="whitespace-nowrap">Created By</TableHead>
                  <TableHead className="whitespace-nowrap">Run Date</TableHead>
                  <TableHead className="whitespace-nowrap">Triggered By</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Accts Included</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Accts Delivered</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Failed</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Not Sent</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runsLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 12 }).map((_, j) => (
                        <TableCell key={j}>
                          <div className="h-4 rounded bg-muted animate-pulse w-16" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : runs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="h-36 text-center" data-testid="delivery-runs-empty">
                      <div className="flex flex-col items-center gap-2">
                        <Send className="h-8 w-8 text-muted-foreground/40" />
                        {runsError ? (
                          <p className="text-sm text-red-500 font-medium">Error: {(runsError as Error).message}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground">No delivery runs found.</p>
                        )}
                        {hasFilters && (
                          <Button size="sm" variant="ghost" className="text-xs" onClick={clearFilters}>
                            Clear filters
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  runs.map(run => (
                    <TableRow
                      key={run.id}
                      className={`cursor-pointer ${selectedRunId === run.id ? "bg-accent/50" : ""}`}
                      onClick={() => setSelectedRunId(prev => prev === run.id ? null : run.id)}
                      data-testid={`row-run-${run.id}`}
                    >
                      <TableCell className="pl-3 pr-0">
                        {selectedRunId === run.id
                          ? <ChevronDown  className="h-3.5 w-3.5 text-muted-foreground" />
                          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-sm">{runDisplayName(run)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm whitespace-nowrap">
                          {fmtWeek(run.schedule_week_start, run.schedule_week_end)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{run.sender_profile}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{run.created_by_name ?? "—"}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          {fmtDateTime(run.started_at)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <TriggerByLabel value={run.triggered_by} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {run.total_accounts}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-medium text-green-600 dark:text-green-400">
                        {run.delivered_count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-medium">
                        {run.failed_count > 0
                          ? <span className="text-red-600 dark:text-red-400">{run.failed_count}</span>
                          : <span className="text-muted-foreground">{run.failed_count}</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                        {run.not_sent_count}
                      </TableCell>
                      <TableCell>
                        <RunStatusBadge status={run.status} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Run Detail Panel ────────────────────────────────────────────────── */}
      {selectedRunId && selectedRun && (
        <Card data-testid="card-run-detail">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center flex-wrap gap-2">
                  <CardTitle className="text-base">Delivery Detail</CardTitle>
                  <Badge variant="outline" className="text-xs font-normal">
                    {runDisplayName(selectedRun)}
                  </Badge>
                  {selectedRun.schedule_week_start && (
                    <Badge variant="secondary" className="text-xs font-normal gap-1">
                      <Calendar className="h-3 w-3" />
                      {fmtWeek(selectedRun.schedule_week_start, selectedRun.schedule_week_end)}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Run on {fmtDateTime(selectedRun.started_at)}
                  {" · "}Triggered by <TriggerByLabel value={selectedRun.triggered_by} inline />
                  {" · "}Sender: {selectedRun.sender_profile}
                </p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {selectedRun.delivered_count} accts delivered
                </span>
                <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                  <XCircle className="h-3.5 w-3.5" />
                  {selectedRun.failed_count} failed
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {selectedRun.not_sent_count} not sent
                </span>
              </div>
            </div>
          </CardHeader>

          {/* ── Reconciliation Metrics ───────────────────────────────────── */}
          <div className="px-6 py-4 border-b">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">
              Run Reconciliation
            </p>
            {reconcLoading ? (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="rounded-md border bg-card px-3 py-2 text-center">
                    <div className="h-6 w-8 mx-auto rounded bg-muted animate-pulse mb-1" />
                    <div className="h-3 w-16 mx-auto rounded bg-muted animate-pulse" />
                  </div>
                ))}
              </div>
            ) : reconciliation ? (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                <div className="rounded-md border bg-card px-3 py-2 text-center" data-testid="recon-eligible">
                  <p className="text-lg font-semibold text-primary">{reconciliation.eligible_count}</p>
                  <p className="text-xs text-muted-foreground">Eligible</p>
                </div>
                <div className="rounded-md border bg-card px-3 py-2 text-center" data-testid="recon-delivered">
                  <p className="text-lg font-semibold text-green-600 dark:text-green-400">{reconciliation.delivered_count}</p>
                  <p className="text-xs text-muted-foreground">Delivered</p>
                </div>
                <div className="rounded-md border bg-card px-3 py-2 text-center" data-testid="recon-failed">
                  <p className={`text-lg font-semibold ${reconciliation.failed_count > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                    {reconciliation.failed_count}
                  </p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
                <div className="rounded-md border bg-card px-3 py-2 text-center" data-testid="recon-blocked">
                  <p className={`text-lg font-semibold ${reconciliation.blocked_count > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                    {reconciliation.blocked_count}
                  </p>
                  <p className="text-xs text-muted-foreground">Blocked</p>
                </div>
                <div className="rounded-md border bg-card px-3 py-2 text-center" data-testid="recon-no-schedule">
                  <p className="text-lg font-semibold text-muted-foreground">{reconciliation.no_schedule_count}</p>
                  <p className="text-xs text-muted-foreground">No Schedule Data</p>
                </div>
                <div className="rounded-md border bg-card px-3 py-2 text-center" data-testid="recon-excluded">
                  <p className={`text-lg font-semibold ${reconciliation.excluded_count > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"}`}>
                    {reconciliation.excluded_count}
                  </p>
                  <p className="text-xs text-muted-foreground">Excluded</p>
                </div>
              </div>
            ) : null}
          </div>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table data-testid="table-delivery-detail">
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Account / Dealer</TableHead>
                    <TableHead className="whitespace-nowrap">Schedule Week</TableHead>
                    <TableHead className="whitespace-nowrap">Sender Mailbox</TableHead>
                    <TableHead className="whitespace-nowrap">Recipient Name</TableHead>
                    <TableHead className="whitespace-nowrap">Recipient Email</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="whitespace-nowrap">Sent At</TableHead>
                    <TableHead className="whitespace-nowrap">Failure Type</TableHead>
                    <TableHead className="whitespace-nowrap">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-1 cursor-help">
                            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                            Opened
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          Open tracking requires a tracking pixel or tracked link in the email body.
                          Microsoft Graph sendMail does not provide native open tracking.
                          This column will show "Not Tracked" until open tracking is implemented.
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="whitespace-nowrap">Error / Bounce Info</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 10 }).map((_, j) => (
                          <TableCell key={j}>
                            <div className="h-4 rounded bg-muted animate-pulse w-20" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : detail.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-24 text-center">
                        <p className="text-sm text-muted-foreground">No delivery records for this run.</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    detail.map(row => {
                      const isHistorical =
                        row.status === "delivered" &&
                        row.error_message === "Historical summary only — recipient detail unavailable";
                      const showError = !isHistorical && !!row.error_message;

                      return (
                        <TableRow key={row.id} data-testid={`row-delivery-${row.id}`}>
                          <TableCell>
                            <span className="font-medium text-sm">{row.customer_name}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground whitespace-nowrap">
                              {fmtWeek(row.schedule_week_start, row.schedule_week_end)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">{row.sender_profile}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {row.recipient_name ?? <span className="text-muted-foreground">—</span>}
                            </span>
                          </TableCell>
                          <TableCell>
                            {isHistorical ? (
                              <span className="text-xs text-muted-foreground italic">
                                Historical record — recipient detail unavailable
                              </span>
                            ) : row.recipient_email ? (
                              <span className="text-sm text-muted-foreground">{row.recipient_email}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <DeliveryStatusBadge status={row.status} />
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground whitespace-nowrap">
                              {fmtDateTime(row.sent_at)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <FailureTypeBadge value={row.failure_type} />
                          </TableCell>
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex items-center gap-1 text-xs text-muted-foreground cursor-help">
                                  <EyeOff className="h-3 w-3" />
                                  Not Tracked
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs max-w-xs">
                                Open tracking not yet implemented. Add a tracking pixel to enable.
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="max-w-64">
                            {showError ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-xs text-red-600 dark:text-red-400 truncate block max-w-48 cursor-help">
                                    {row.error_message}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-sm text-xs">
                                  {row.error_message}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* ── Accounts Not Included ──────────────────────────────────── */}
            {reconciliation && reconciliation.not_included.length > 0 && (
              <>
                <Separator />
                <div className="px-6 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 text-amber-500" />
                        <p className="text-sm font-medium">Accounts Not Included in This Run</p>
                        <Badge variant="secondary" className="text-xs" data-testid="badge-not-included-count">
                          {reconciliation.not_included.length}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Active accounts that did not receive a report — showing exclusion reason for each
                      </p>
                    </div>
                    {reconciliation.not_included.some(a => a.is_eligible) && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                        <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-100 dark:bg-amber-950 border border-amber-300 dark:border-amber-700" />
                        Highlighted rows are eligible accounts that were not included
                      </div>
                    )}
                  </div>
                  <div className="rounded-md border overflow-hidden">
                    <div className="max-h-72 overflow-y-auto">
                      <Table data-testid="table-not-included">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Account Name</TableHead>
                            <TableHead>Exclusion Reason</TableHead>
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
                                {acc.customer_name}
                              </TableCell>
                              <TableCell className="py-2">
                                <ReasonBadge reason={acc.reason} />
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground py-2">
                                {acc.notes ?? "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              </>
            )}

            {reconciliation && reconciliation.not_included.length === 0 && !reconcLoading && (
              <div className="px-6 py-3 border-t">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  All eligible active accounts were included in this run.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
