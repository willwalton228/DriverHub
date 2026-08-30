import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  RefreshCw, CheckCircle2, AlertCircle, Clock, XCircle, Play, RotateCcw,
  ShieldCheck, Activity, History, ListChecks, Search, Ban, ChevronDown, ChevronRight,
  Settings2, Zap, Info, Download, Plug, CalendarDays, Layers,
} from "lucide-react";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { FinanceAccessGate } from "@/components/finance/FinanceAccessGate";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SyncHealth {
  last7Days: { syncRuns: Record<string, number> };
  queue: Record<string, number>;
  exceptions: { total: number; byType: Array<{ exception_type: string; count: number }> };
  lastSuccessfulRun: {
    id: string; started_at: string; completed_at: string;
    records_fetched: number; records_upserted: number;
  } | null;
}

interface SyncRun {
  id: string;
  sync_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  date_range_start: string | null;
  date_range_end: string | null;
  records_fetched: number;
  records_upserted: number;
  error_message: string | null;
  duration_seconds: number | null;
}

interface QueueJob {
  id: string;
  job_type: string;
  status: string;
  priority: number;
  scheduled_for: string;
  started_at: string | null;
  completed_at: string | null;
  attempts: number;
  max_attempts: number;
  date_range_start: string | null;
  date_range_end: string | null;
  error_message: string | null;
  created_at: string;
}

interface SyncException {
  id: string;
  exception_type: string;
  entity_type: string | null;
  qbo_txn_id: string | null;
  qbo_txn_type: string | null;
  vendor_name: string | null;
  total_amount: string | null;
  txn_date: string | null;
  description: string;
  resolution_status: string;
  resolution_note: string | null;
  sync_run_id: string | null;
  created_at: string;
}

interface AuditEntry {
  id: string;
  event_type: string;
  entity_type: string | null;
  message: string;
  severity: string;
  sync_run_id: string | null;
  created_at: string;
}

interface SyncSettings {
  isConnected: boolean;
  companyName: string | null;
  realmId: string | null;
  lastSyncedAt: string | null;
  environment: string | null;
}

interface WcSettings {
  configured: boolean;
  username?: string;
  ownerGuid: string;
  fileGuid: string;
}

interface WcSession {
  ticket: string;
  username: string | null;
  company_file: string | null;
  status: string;
  current_query_idx: number;
  queries_total: number;
  records_processed: number;
  date_range_start: string | null;
  date_range_end: string | null;
  error_message: string | null;
  last_heartbeat: string | null;
  completed_at: string | null;
  created_at: string;
}

interface ArAgingBucket {
  label: string;
  days: string;
  count: number;
  amount: number;
}

interface ArAging {
  asOf: string;
  buckets: ArAgingBucket[];
  totalOpenCount: number;
  totalOpenAmount: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(val: number | string | undefined | null): string {
  const n = typeof val === "string" ? parseFloat(val) : (val ?? 0);
  if (isNaN(n)) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: React.ReactNode }> = {
    success:    { color: "text-green-500",    icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    completed:  { color: "text-green-500",    icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    running:    { color: "text-blue-500",     icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" /> },
    processing: { color: "text-blue-500",     icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" /> },
    partial:    { color: "text-yellow-500",   icon: <AlertCircle className="h-3.5 w-3.5" /> },
    failed:     { color: "text-destructive",  icon: <XCircle className="h-3.5 w-3.5" /> },
    pending:    { color: "text-muted-foreground", icon: <Clock className="h-3.5 w-3.5" /> },
    retry:      { color: "text-orange-500",   icon: <RotateCcw className="h-3.5 w-3.5" /> },
    cancelled:  { color: "text-muted-foreground", icon: <Ban className="h-3.5 w-3.5" /> },
    open:       { color: "text-destructive",  icon: <AlertCircle className="h-3.5 w-3.5" /> },
    resolved:   { color: "text-green-500",    icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    ignored:    { color: "text-muted-foreground", icon: <Ban className="h-3.5 w-3.5" /> },
  };
  const cfg = map[status] ?? { color: "text-muted-foreground", icon: <Info className="h-3.5 w-3.5" /> };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium capitalize ${cfg.color}`}>
      {cfg.icon} {status}
    </span>
  );
}

const SEVERITY_COLORS: Record<string, string> = {
  info:     "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  warning:  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  error:    "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  critical: "bg-red-200 text-red-900 dark:bg-red-900/60 dark:text-red-200",
};

// ── Main ───────────────────────────────────────────────────────────────────────

export default function FinanceQBSync() {
  const { toast } = useToast();
  const [tab, setTab] = useState("overview");
  const [exceptionSearch, setExceptionSearch] = useState("");
  const [exceptionFilter, setExceptionFilter] = useState("open");
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [syncSince, setSyncSince] = useState("");
  const [syncUntil, setSyncUntil] = useState("");
  const [wcUsername, setWcUsername] = useState("");
  const [wcPassword, setWcPassword] = useState("");

  const { data: health, isLoading: healthLoading } = useQuery<SyncHealth>({
    queryKey: ["/api/finance/qb/sync/health"],
    queryFn: () => fetch("/api/finance/qb/sync/health", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30000,
  });

  const { data: history, isLoading: historyLoading, refetch: refetchHistory } = useQuery<SyncRun[]>({
    queryKey: ["/api/finance/qb/sync/history"],
    queryFn: () => fetch("/api/finance/qb/sync/history", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 15000,
  });

  const { data: queue, isLoading: queueLoading, refetch: refetchQueue } = useQuery<QueueJob[]>({
    queryKey: ["/api/finance/qb/sync/queue"],
    queryFn: () => fetch("/api/finance/qb/sync/queue", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 10000,
  });

  const { data: exceptions, isLoading: exceptionsLoading } = useQuery<SyncException[]>({
    queryKey: ["/api/finance/qb/sync/exceptions", exceptionFilter],
    queryFn: () => fetch(`/api/finance/qb/sync/exceptions?status=${exceptionFilter}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: auditLog, isLoading: auditLoading } = useQuery<AuditEntry[]>({
    queryKey: ["/api/finance/qb/sync/audit"],
    queryFn: () => fetch("/api/finance/qb/sync/audit", { credentials: "include" }).then(r => r.json()),
  });

  const { data: settings } = useQuery<SyncSettings>({
    queryKey: ["/api/corporate/integrations/quickbooks/settings"],
    queryFn: () => fetch("/api/corporate/integrations/quickbooks/settings", { credentials: "include" }).then(r => r.ok ? r.json() : null),
  });

  const syncMutation = useMutation({
    mutationFn: (opts: { since?: string; until?: string }) =>
      apiRequest("POST", "/api/finance/qb/sync/run", opts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/qb/sync/health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/qb/sync/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/qb/sync/queue"] });
      toast({ title: "Sync started", description: "QuickBooks sync job queued and running." });
    },
    onError: (e: any) => toast({ title: "Sync failed", description: e?.message ?? "Could not start sync.", variant: "destructive" }),
  });

  const retryMutation = useMutation({
    mutationFn: (jobId: string) => apiRequest("POST", `/api/finance/qb/sync/retry/${jobId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/qb/sync/queue"] });
      toast({ title: "Retry queued", description: "Job has been scheduled for retry." });
    },
    onError: (e: any) => toast({ title: "Retry failed", description: e?.message, variant: "destructive" }),
  });

  const resolveExcMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "resolve" | "ignore" }) =>
      apiRequest("PATCH", `/api/finance/qb/sync/exceptions/${id}/${action}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/qb/sync/exceptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/qb/sync/health"] });
      toast({ title: "Exception updated" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const cancelJobMutation = useMutation({
    mutationFn: (jobId: string) => apiRequest("DELETE", `/api/finance/qb/sync/queue/${jobId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/qb/sync/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/qb/sync/health"] });
      toast({ title: "Job cancelled" });
    },
    onError: (e: any) => toast({ title: "Cancel failed", description: e?.message, variant: "destructive" }),
  });

  const saveWcSettingsMutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      apiRequest("PUT", "/api/qbwc/settings", { username, password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/qbwc/settings"] });
      setWcPassword("");
      toast({ title: "QBWC credentials saved", description: "Download the .qwc file and add it to QB Web Connector." });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  const { data: arAging, isLoading: arAgingLoading } = useQuery<ArAging>({
    queryKey: ["/api/finance/qb/ar/aging"],
    queryFn: () => fetch("/api/finance/qb/ar/aging", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30_000,
  });

  const { data: wcSettings, refetch: refetchWcSettings } = useQuery<WcSettings>({
    queryKey: ["/api/qbwc/settings"],
    queryFn: () => fetch("/api/qbwc/settings", { credentials: "include" }).then(r => r.ok ? r.json() : null),
  });

  const { data: wcSessions, isLoading: wcSessionsLoading, refetch: refetchWcSessions } = useQuery<WcSession[]>({
    queryKey: ["/api/qbwc/sessions"],
    queryFn: () => fetch("/api/qbwc/sessions", { credentials: "include" }).then(r => r.ok ? r.json() : []),
    enabled: tab === "setup",
    refetchInterval: tab === "setup" ? 15000 : false,
  });

  const filteredExceptions = (exceptions ?? []).filter(e =>
    !exceptionSearch ||
    e.description.toLowerCase().includes(exceptionSearch.toLowerCase()) ||
    (e.vendor_name ?? "").toLowerCase().includes(exceptionSearch.toLowerCase()) ||
    e.exception_type.toLowerCase().includes(exceptionSearch.toLowerCase())
  );

  const syncRuns = health?.last7Days?.syncRuns ?? {};
  const queueStat = health?.queue ?? {};
  const lastOk = health?.lastSuccessfulRun;
  const openExc = health?.exceptions?.total ?? 0;
  const isConnected = settings?.isConnected ?? false;
  const activeJobs = (queue ?? []).filter(j => j.status === "processing" || j.status === "running");

  return (
    <FinanceAccessGate require="canManageQbSync">
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Run Sync date-range dialog */}
      <Dialog open={showSyncDialog} onOpenChange={setShowSyncDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Run QuickBooks Sync</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Optionally restrict the sync to a date window. Leave blank to sync all available data.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sync-since" className="text-xs">From date</Label>
                <Input id="sync-since" type="date" value={syncSince} onChange={e => setSyncSince(e.target.value)} data-testid="input-sync-since" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sync-until" className="text-xs">To date</Label>
                <Input id="sync-until" type="date" value={syncUntil} onChange={e => setSyncUntil(e.target.value)} data-testid="input-sync-until" />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowSyncDialog(false)}>Cancel</Button>
            <Button size="sm" disabled={syncMutation.isPending}
              onClick={() => {
                syncMutation.mutate({ since: syncSince || undefined, until: syncUntil || undefined });
                setShowSyncDialog(false);
              }}
              data-testid="button-confirm-sync"
            >
              <Play className="h-3.5 w-3.5 mr-1.5" />
              {syncSince || syncUntil ? "Run Ranged Sync" : "Run Full Sync"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">QuickBooks Sync Center</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitor, manage, and audit the QuickBooks → DriverHub synchronization engine
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={isConnected ? "secondary" : "destructive"} className="gap-1">
            <ShieldCheck className="h-3 w-3" />
            {isConnected ? `Connected${settings?.companyName ? ` — ${settings.companyName}` : ""}` : "Not Connected"}
          </Badge>
          {activeJobs.length > 0 && (
            <Badge variant="outline" className="gap-1 animate-pulse">
              <RefreshCw className="h-3 w-3 animate-spin" />
              {activeJobs.length} job{activeJobs.length !== 1 ? "s" : ""} running
            </Badge>
          )}
          <Button size="sm" onClick={() => setShowSyncDialog(true)} disabled={syncMutation.isPending || !isConnected} data-testid="button-run-sync">
            <Play className={`h-3.5 w-3.5 mr-1.5 ${syncMutation.isPending ? "animate-pulse" : ""}`} />
            Run Sync
          </Button>
          <Button size="sm" variant="outline" onClick={() => { refetchHistory(); refetchQueue(); }} data-testid="button-refresh">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Connection warning */}
      {!isConnected && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            QuickBooks is not connected. <a href="/integrations/quickbooks" className="underline font-medium">Configure the connection</a> to enable sync.
          </AlertDescription>
        </Alert>
      )}

      {/* Health KPI strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className={lastOk ? "border-green-500/40" : "border-muted"}>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 flex-wrap">
            <CardTitle className="text-xs font-medium text-muted-foreground">Last Successful Sync</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          </CardHeader>
          <CardContent>
            {healthLoading ? <Skeleton className="h-6 w-32" /> : lastOk ? (
              <>
                <div className="text-sm font-bold">{formatDistanceToNow(parseISO(lastOk.started_at))} ago</div>
                <p className="text-xs text-muted-foreground mt-0.5">{lastOk.records_upserted} records synced</p>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">No successful sync yet</div>
            )}
          </CardContent>
        </Card>

        <Card className={openExc > 0 ? "border-destructive/40" : ""}>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 flex-wrap">
            <CardTitle className="text-xs font-medium text-muted-foreground">Open Exceptions</CardTitle>
            <AlertCircle className={`h-4 w-4 shrink-0 ${openExc > 0 ? "text-destructive" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            {healthLoading ? <Skeleton className="h-6 w-16" /> : (
              <>
                <div className={`text-2xl font-bold ${openExc > 0 ? "text-destructive" : ""}`}>{openExc}</div>
                <p className="text-xs text-muted-foreground mt-0.5">Require attention</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 flex-wrap">
            <CardTitle className="text-xs font-medium text-muted-foreground">Sync Runs (7d)</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent>
            {healthLoading ? <Skeleton className="h-6 w-24" /> : (
              <>
                <div className="text-2xl font-bold">{Object.values(syncRuns).reduce((s, n) => s + n, 0)}</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {syncRuns["success"] ?? 0} ok · {syncRuns["failed"] ?? 0} failed
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 flex-wrap">
            <CardTitle className="text-xs font-medium text-muted-foreground">Queue</CardTitle>
            <ListChecks className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent>
            {healthLoading ? <Skeleton className="h-6 w-24" /> : (
              <>
                <div className="text-2xl font-bold">{Object.values(queueStat).reduce((s, n) => s + n, 0)}</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {queueStat["pending"] ?? 0} pending · {queueStat["processing"] ?? 0} active
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Exception type breakdown */}
      {openExc > 0 && (
        <div className="flex flex-wrap gap-2">
          {(health?.exceptions?.byType ?? []).map(e => (
            <Badge key={e.exception_type} variant="destructive" className="gap-1 cursor-pointer"
              onClick={() => { setTab("exceptions"); setExceptionSearch(e.exception_type); }}>
              <AlertCircle className="h-3 w-3" /> {e.exception_type}: {e.count}
            </Badge>
          ))}
        </div>
      )}

      {/* Main tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview"><Activity className="h-3.5 w-3.5 mr-1.5" />Overview</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <History className="h-3.5 w-3.5 mr-1.5" />Sync History
          </TabsTrigger>
          <TabsTrigger value="queue" data-testid="tab-queue">
            <ListChecks className="h-3.5 w-3.5 mr-1.5" />Queue
            {(queueStat["pending"] ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">{queueStat["pending"]}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="exceptions" data-testid="tab-exceptions">
            <AlertCircle className="h-3.5 w-3.5 mr-1.5" />Exceptions
            {openExc > 0 && <Badge variant="destructive" className="ml-1.5 text-xs">{openExc}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">
            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />Audit Log
          </TabsTrigger>
          <TabsTrigger value="setup" data-testid="tab-setup">
            <Plug className="h-3.5 w-3.5 mr-1.5" />WC Setup
            {wcSettings?.configured && <Badge variant="secondary" className="ml-1.5 text-xs">On</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Last 5 runs */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Recent Sync Runs</CardTitle>
                <CardDescription className="text-xs">Last 5 sync executions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {historyLoading ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />) : (
                  (history ?? []).slice(0, 5).map(run => (
                    <div key={run.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <StatusDot status={run.status} />
                        <div className="min-w-0">
                          <p className="text-xs font-medium">{run.sync_type}</p>
                          <p className="text-xs text-muted-foreground">
                            {run.started_at ? formatDistanceToNow(parseISO(run.started_at)) + " ago" : "—"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-medium">{run.records_upserted} synced</p>
                        {run.duration_seconds != null && (
                          <p className="text-xs text-muted-foreground">{run.duration_seconds}s</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
                <Button variant="ghost" size="sm" className="w-full mt-2 text-xs" onClick={() => setTab("history")}>
                  View full history
                </Button>
              </CardContent>
            </Card>

            {/* Settings & connection */}
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 flex-wrap space-y-0">
                <div>
                  <CardTitle className="text-base">Connection &amp; Configuration</CardTitle>
                  <CardDescription className="text-xs">QuickBooks API settings</CardDescription>
                </div>
                <Settings2 className="h-4 w-4 text-muted-foreground shrink-0" />
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {[
                    { label: "Status",       value: isConnected ? "Connected" : "Disconnected" },
                    { label: "Company",      value: settings?.companyName ?? "—" },
                    { label: "Realm ID",     value: settings?.realmId ? `…${settings.realmId.slice(-6)}` : "—" },
                    { label: "Environment",  value: settings?.environment ?? "—" },
                    { label: "Last Synced",  value: settings?.lastSyncedAt ? formatDistanceToNow(parseISO(settings.lastSyncedAt)) + " ago" : "Never" },
                    { label: "Sync Method",  value: "OAuth 2.0 REST API" },
                  ].map(({ label, value }) => (
                    <div key={label} className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-sm font-medium">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => window.location.href = "/integrations/quickbooks"}>
                    <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Manage Connection
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowSyncDialog(true)} disabled={!isConnected || syncMutation.isPending}>
                    <Zap className="h-3.5 w-3.5 mr-1.5" /> Quick Sync
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* AR Aging panel */}
          <Card className="mt-6">
            <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 flex-wrap space-y-0">
              <div>
                <CardTitle className="text-base">AR Aging Summary</CardTitle>
                <CardDescription className="text-xs">Open invoice balances by aging bucket{arAging ? ` — as of ${arAging.asOf}` : ""}</CardDescription>
              </div>
              <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
            </CardHeader>
            <CardContent>
              {arAgingLoading ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : !arAging ? (
                <p className="text-sm text-muted-foreground py-2">No AR data available.</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {arAging.buckets.map(b => (
                      <div key={b.days} className="rounded-md bg-muted/40 px-3 py-2.5 space-y-1">
                        <p className="text-xs text-muted-foreground font-medium">{b.label}</p>
                        <p className="text-base font-bold">{fmt(b.amount)}</p>
                        <p className="text-xs text-muted-foreground">{b.count} invoice{b.count !== 1 ? "s" : ""}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-md bg-muted/60 px-4 py-2.5 text-sm">
                    <span className="text-muted-foreground font-medium">Total Open AR</span>
                    <span className="text-lg font-bold">{fmt(arAging.totalOpenAmount)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sync History */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead></TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead className="text-right">Fetched</TableHead>
                    <TableHead className="text-right">Synced</TableHead>
                    <TableHead>Date Range</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 8 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : (history ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">No sync history yet</TableCell></TableRow>
                  ) : (history ?? []).map(run => (
                    <>
                      <TableRow key={run.id} className="cursor-pointer" onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)} data-testid={`run-row-${run.id}`}>
                        <TableCell>
                          {expandedRun === run.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </TableCell>
                        <TableCell className="font-medium capitalize text-sm">{run.sync_type}</TableCell>
                        <TableCell><StatusDot status={run.status} /></TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {run.started_at ? format(parseISO(run.started_at), "MMM d, h:mm a") : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {run.duration_seconds != null ? `${run.duration_seconds}s` : "—"}
                        </TableCell>
                        <TableCell className="text-right">{run.records_fetched}</TableCell>
                        <TableCell className="text-right font-medium">{run.records_upserted}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {run.date_range_start ? `${run.date_range_start} → ${run.date_range_end ?? "now"}` : "All time"}
                        </TableCell>
                      </TableRow>
                      {expandedRun === run.id && (
                        <TableRow key={`${run.id}-detail`}>
                          <TableCell colSpan={8} className="bg-muted/30 px-6 py-3">
                            {run.error_message ? (
                              <Alert variant="destructive" className="py-2">
                                <AlertDescription className="text-xs">{run.error_message}</AlertDescription>
                              </Alert>
                            ) : (
                              <p className="text-xs text-muted-foreground">Run ID: {run.id}</p>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Queue */}
        <TabsContent value="queue" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Date Range</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queueLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 8 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : (queue ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">Queue is empty</TableCell></TableRow>
                  ) : (queue ?? []).map(job => (
                    <TableRow key={job.id} data-testid={`job-row-${job.id}`}>
                      <TableCell className="font-medium capitalize text-sm">{job.job_type.replace(/_/g, " ")}</TableCell>
                      <TableCell><StatusDot status={job.status} /></TableCell>
                      <TableCell className="text-sm">{job.priority}</TableCell>
                      <TableCell className="text-sm">{job.attempts}/{job.max_attempts}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {job.scheduled_for ? format(parseISO(job.scheduled_for), "MMM d, h:mm a") : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {job.date_range_start ? `${job.date_range_start} → ${job.date_range_end ?? "now"}` : "—"}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs text-destructive">{job.error_message ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {(job.status === "failed" || job.status === "cancelled") && job.attempts < job.max_attempts && (
                            <Button size="sm" variant="outline" onClick={() => retryMutation.mutate(job.id)} disabled={retryMutation.isPending} data-testid={`button-retry-${job.id}`}>
                              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Retry
                            </Button>
                          )}
                          {(job.status === "pending" || job.status === "processing" || job.status === "running") && (
                            <Button size="sm" variant="ghost" onClick={() => cancelJobMutation.mutate(job.id)} disabled={cancelJobMutation.isPending} data-testid={`button-cancel-${job.id}`}>
                              <XCircle className="h-3.5 w-3.5 mr-1 text-destructive" /> Cancel
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Exceptions */}
        <TabsContent value="exceptions" className="mt-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input placeholder="Search exceptions..." value={exceptionSearch} onChange={e => setExceptionSearch(e.target.value)} className="pl-8" data-testid="input-exception-search" />
            </div>
            <Select value={exceptionFilter} onValueChange={setExceptionFilter}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="ignored">Ignored</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Detected</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exceptionsLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 8 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : filteredExceptions.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                      {exceptionSearch ? "No exceptions match your search" : `No ${exceptionFilter} exceptions`}
                    </TableCell></TableRow>
                  ) : filteredExceptions.map(exc => (
                    <TableRow key={exc.id} data-testid={`exc-row-${exc.id}`}>
                      <TableCell>
                        <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold bg-destructive/10 text-destructive capitalize">
                          {exc.exception_type.replace(/_/g, " ")}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">{exc.description}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{exc.vendor_name ?? "—"}</TableCell>
                      <TableCell className="text-sm font-medium whitespace-nowrap">{exc.total_amount ? fmt(exc.total_amount) : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {exc.txn_date ? format(parseISO(exc.txn_date), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell><StatusDot status={exc.resolution_status} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {exc.created_at ? formatDistanceToNow(parseISO(exc.created_at)) + " ago" : "—"}
                      </TableCell>
                      <TableCell>
                        {exc.resolution_status === "open" && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => resolveExcMutation.mutate({ id: exc.id, action: "resolve" })} disabled={resolveExcMutation.isPending} data-testid={`button-resolve-${exc.id}`}>
                              <CheckCircle2 className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => resolveExcMutation.mutate({ id: exc.id, action: "ignore" })} disabled={resolveExcMutation.isPending} data-testid={`button-ignore-${exc.id}`}>
                              <Ban className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit log */}
        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Sync Run</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLoading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 5 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : (auditLog ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">No audit entries yet. Run a sync to begin logging.</TableCell></TableRow>
                  ) : (auditLog ?? []).map(entry => (
                    <TableRow key={entry.id} data-testid={`audit-row-${entry.id}`}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {entry.created_at ? format(parseISO(entry.created_at), "MMM d, h:mm:ss a") : "—"}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-medium font-mono">{entry.event_type}</span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold capitalize ${SEVERITY_COLORS[entry.severity] ?? "bg-muted text-muted-foreground"}`}>
                          {entry.severity}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-sm">{entry.message}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{entry.sync_run_id ? `…${entry.sync_run_id.slice(-8)}` : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        {/* QBWC Setup */}
        <TabsContent value="setup" className="mt-4 space-y-6">

          {/* Credentials card */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 flex-wrap space-y-0">
              <div>
                <CardTitle className="text-base">QB Web Connector Credentials</CardTitle>
                <CardDescription className="text-xs">
                  Used by QB Desktop Enterprise 24 to authenticate with this server via SOAP.
                  {wcSettings?.configured && <span className="ml-1 text-green-600 dark:text-green-400 font-medium">Configured.</span>}
                </CardDescription>
              </div>
              <Plug className="h-4 w-4 text-muted-foreground shrink-0" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wc-username" className="text-xs">Username</Label>
                  <Input
                    id="wc-username"
                    placeholder={wcSettings?.username ?? "e.g. driverhub-sync"}
                    value={wcUsername}
                    onChange={e => setWcUsername(e.target.value)}
                    data-testid="input-wc-username"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wc-password" className="text-xs">Password{wcSettings?.configured ? " (leave blank to keep current)" : ""}</Label>
                  <Input
                    id="wc-password"
                    type="password"
                    placeholder="Enter password"
                    value={wcPassword}
                    onChange={e => setWcPassword(e.target.value)}
                    data-testid="input-wc-password"
                  />
                </div>
              </div>
              <div className="flex gap-2 flex-wrap pt-1">
                <Button
                  size="sm"
                  disabled={saveWcSettingsMutation.isPending || !wcUsername || !wcPassword}
                  onClick={() => saveWcSettingsMutation.mutate({ username: wcUsername, password: wcPassword })}
                  data-testid="button-save-wc-settings"
                >
                  {saveWcSettingsMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />}
                  Save Credentials
                </Button>
                {wcSettings?.configured && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open("/api/qbwc/qwc", "_blank")}
                    data-testid="button-download-qwc"
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Download .qwc File
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* SOAP endpoint info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">SOAP Endpoint</CardTitle>
              <CardDescription className="text-xs">Configure QB Web Connector to point to this URL</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                {[
                  { label: "SOAP Endpoint",    value: `${window.location.origin}/api/qbwc` },
                  { label: "QB Type",          value: "QBFS (QuickBooks Desktop)" },
                  { label: "QB Product",       value: "Enterprise 24" },
                  { label: "Sync Interval",    value: "Every 60 minutes (configurable)" },
                  { label: "Data Direction",   value: "Read-only (QB → DriverHub)" },
                  { label: "Owner GUID",       value: wcSettings?.ownerGuid ? `{${wcSettings.ownerGuid}}` : "Save credentials first" },
                ].map(({ label, value }) => (
                  <div key={label} className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-sm font-medium font-mono break-all">{value}</p>
                  </div>
                ))}
              </div>
              <Alert className="mt-2">
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  After saving credentials, download the <strong>.qwc</strong> file and open it with QB Web Connector on the machine running QB Desktop Enterprise 24.
                  The connector will automatically sync on the configured schedule.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Session history */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 flex-wrap space-y-0">
              <div>
                <CardTitle className="text-base">Recent QBWC Sessions</CardTitle>
                <CardDescription className="text-xs">Last 20 Web Connector sync sessions</CardDescription>
              </div>
              <Button size="sm" variant="ghost" onClick={() => refetchWcSessions()} data-testid="button-refresh-sessions">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Company File</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead className="text-right">Records</TableHead>
                    <TableHead>Date Range</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wcSessionsLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : !(wcSessions ?? []).length ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                        No QBWC sessions yet. Configure credentials and connect QB Desktop.
                      </TableCell>
                    </TableRow>
                  ) : (wcSessions ?? []).map(s => (
                    <TableRow key={s.ticket} data-testid={`wc-session-${s.ticket.slice(0, 8)}`}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {s.created_at ? format(parseISO(s.created_at), "MMM d, h:mm a") : "—"}
                      </TableCell>
                      <TableCell><StatusDot status={s.status} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">{s.company_file ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {s.queries_total > 0 ? `${s.current_query_idx}/${s.queries_total}` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">{s.records_processed}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {s.date_range_start ? `${s.date_range_start} → ${s.date_range_end ?? "now"}` : "All time"}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs text-destructive">{s.error_message ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
    </FinanceAccessGate>
  );
}
