/**
 * WhenIWorkSyncPanel  (Hybrid Sync — Scheduled + Webhook)
 *
 * Sections:
 *  1. Connection status header
 *  2. Sync Configuration  — mode selector, webhook secret, endpoint URL
 *  3. Entity Sync Status  — per-entity last run table with Sync Now buttons
 *  4. Date window picker  — for targeted manual re-syncs
 *  5. Manual sync buttons — Sync All shortcut
 *  6. Webhook Events      — recent/failed event log with retry
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  RefreshCw, Loader2, Clock, Database, Calendar, ChevronDown,
  CheckCircle2, AlertTriangle, CalendarClock, Timer, Layers, Info,
  Users, Webhook, Copy, RotateCcw, Shield, XCircle, Activity,
} from "lucide-react";
import { format, parseISO, subDays, formatDistanceToNow } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SyncStatus {
  lastSyncAt:       string | null;
  connectionStatus: string;
  syncEnabled:      boolean;
  syncMode:         "manual" | "scheduled" | "webhook+scheduled";
  hasWebhookSecret: boolean;
  usersCount:       number;
  shiftsCount:      number;
  timesCount:       number;
  locationsCount:   number;
  positionsCount:   number;
  absencesCount:    number;
  noticesCount:     number;
}

interface SyncResult {
  entity: "users" | "locations" | "positions" | "shifts" | "times" | "absences" | "notices" | "all";
  fetched: number;
  inserted: number;
  updated: number;
  errors: number;
  errorMessages: string[];
  syncedAt: string;
  children?: Record<string, SyncResult>;
}

interface EntityRun {
  entity:       string;
  trigger_type: string;
  status:       "running" | "success" | "error";
  started_at:   string;
  completed_at: string | null;
  fetched:      number;
  inserted:     number;
  updated:      number;
  errors:       number;
  error_message: string | null;
  updated_since: string | null;
}

interface WebhookEvent {
  id:                 string;
  event_type:         string;
  external_entity_id: string | null;
  received_at:        string;
  status:             "pending" | "processed" | "failed" | "skipped";
  processed_at:       string | null;
  retry_count:        number;
  last_error:         string | null;
  signature_valid:    boolean | null;
}

type SyncModeOption = "manual" | "scheduled" | "webhook+scheduled";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTs(iso: string | null) {
  if (!iso) return "Never";
  try { return format(parseISO(iso), "MMM d, h:mm a"); }
  catch { return iso; }
}

function fmtRelative(iso: string | null) {
  if (!iso) return "Never";
  try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); }
  catch { return iso; }
}

function isoDate(d: Date) { return d.toISOString().split("T")[0]; }

const ENTITY_LABELS: Record<string, { label: string; cadence: string; icon: React.ElementType }> = {
  users:     { label: "Users",     cadence: "Nightly 3:30 AM",  icon: Users },
  locations: { label: "Locations", cadence: "Nightly 3:35 AM",  icon: Database },
  positions: { label: "Positions", cadence: "Nightly 3:40 AM",  icon: Database },
  shifts:    { label: "Shifts",    cadence: "Every 15 min",      icon: CalendarClock },
  times:     { label: "Times",     cadence: "Every 15 min",      icon: Timer },
  absences:  { label: "Absences",  cadence: "Hourly at :05",     icon: Layers },
  notices:   { label: "Notices",   cadence: "Hourly at :10",     icon: AlertTriangle },
};

const ENTITY_ORDER = ["users", "locations", "positions", "shifts", "times", "absences", "notices"];

function StatusBadge({ status }: { status: "running" | "success" | "error" | string }) {
  if (status === "running") return (
    <Badge className="gap-1 text-xs bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-0">
      <Loader2 className="h-3 w-3 animate-spin" />Running
    </Badge>
  );
  if (status === "success") return (
    <Badge className="gap-1 text-xs bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300 border-0">
      <CheckCircle2 className="h-3 w-3" />OK
    </Badge>
  );
  if (status === "error") return (
    <Badge className="gap-1 text-xs bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-0">
      <XCircle className="h-3 w-3" />Error
    </Badge>
  );
  return <span className="text-xs text-muted-foreground">—</span>;
}

function WebhookStatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    processed: "bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300 border-0",
    failed:    "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-0",
    pending:   "bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-0",
    skipped:   "bg-muted text-muted-foreground border-0",
  };
  return (
    <Badge className={`text-xs capitalize ${classes[status] ?? classes.skipped}`}>
      {status}
    </Badge>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function WhenIWorkSyncPanel() {
  const { toast } = useToast();

  // Date range for targeted sync (default: last 30 days)
  const [startDate, setStartDate] = useState(() => isoDate(subDays(new Date(), 30)));
  const [endDate,   setEndDate]   = useState(() => isoDate(new Date()));
  const [showCustom,  setShowCustom]  = useState(false);
  const [showWebhook, setShowWebhook] = useState(false);

  // Sync mode editor state
  const [editMode,    setEditMode]    = useState<SyncModeOption | null>(null);
  const [webhookSecret, setWebhookSecret] = useState("");
  const [clearSecret, setClearSecret] = useState(false);

  // Active sync tracking
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [activeSync, setActiveSync] = useState<"users" | "shifts" | "times" | "absences" | "notices" | "locations" | "positions" | "all" | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: status, isLoading: statusLoading } = useQuery<SyncStatus>({
    queryKey: ["/api/scheduling/wheniwork/sync/status"],
    queryFn: async () => {
      const res = await fetch("/api/scheduling/wheniwork/sync/status", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load sync status");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const { data: syncRuns, isLoading: runsLoading, refetch: refetchRuns } = useQuery<Record<string, EntityRun | null>>({
    queryKey: ["/api/scheduling/wheniwork/sync/runs"],
    queryFn: async () => {
      const res = await fetch("/api/scheduling/wheniwork/sync/runs", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load sync runs");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const { data: webhookData, isLoading: webhookLoading, refetch: refetchWebhook } = useQuery<{ events: WebhookEvent[]; total: number }>({
    queryKey: ["/api/scheduling/wheniwork/webhook/events"],
    queryFn: async () => {
      const res = await fetch("/api/scheduling/wheniwork/webhook/events?limit=20", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load webhook events");
      return res.json();
    },
    refetchInterval: 30_000,
    enabled: showWebhook,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  function useSyncMutation(entity: typeof activeSync) {
    return useMutation({
      mutationFn: async () => {
        const body = entity === "users" || entity === "locations" || entity === "positions"
          ? {}
          : { start: startDate || undefined, end: endDate || undefined };
        const res = await apiRequest("POST", `/api/scheduling/wheniwork/sync/${entity}`, body);
        return res.json() as Promise<SyncResult>;
      },
      onMutate: () => setActiveSync(entity),
      onSuccess: (result) => {
        setLastResult(result);
        setActiveSync(null);
        queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wheniwork/sync/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wheniwork/sync/runs"] });
        const isOk = result.errors === 0 || result.inserted + result.updated > 0;
        toast({
          title: isOk ? "Sync complete" : "Sync finished with errors",
          description: `${result.inserted} new, ${result.updated} updated, ${result.errors} errors.`,
          variant: isOk ? "default" : "destructive",
        });
      },
      onError: (err: any) => {
        setActiveSync(null);
        toast({ title: "Sync failed", description: err?.message ?? "Unknown error", variant: "destructive" });
      },
    });
  }

  const syncUsersMut     = useSyncMutation("users");
  const syncLocationsMut = useSyncMutation("locations");
  const syncPositionsMut = useSyncMutation("positions");
  const syncShiftsMut    = useSyncMutation("shifts");
  const syncTimesMut     = useSyncMutation("times");
  const syncAbsencesMut  = useSyncMutation("absences");
  const syncNoticesMut   = useSyncMutation("notices");
  const syncAllMut       = useSyncMutation("all");

  const entityMuts: Record<string, ReturnType<typeof useSyncMutation>> = {
    users: syncUsersMut, locations: syncLocationsMut, positions: syncPositionsMut,
    shifts: syncShiftsMut, times: syncTimesMut, absences: syncAbsencesMut, notices: syncNoticesMut,
  };

  const saveSyncModeMut = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = {};
      if (editMode)     body.syncMode = editMode;
      if (webhookSecret) body.webhookSecret = webhookSecret;
      if (clearSecret)   body.webhookSecret = null;
      const res = await apiRequest("PATCH", "/api/scheduling/wheniwork/config/sync-mode", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wheniwork/sync/status"] });
      setEditMode(null);
      setWebhookSecret("");
      setClearSecret(false);
      toast({ title: "Sync configuration saved" });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message, variant: "destructive" });
    },
  });

  const retryEventMut = useMutation({
    mutationFn: async (eventId: string) => {
      const res = await apiRequest("POST", `/api/scheduling/wheniwork/webhook/events/${eventId}/retry`, {});
      return res.json();
    },
    onSuccess: () => {
      refetchWebhook();
      toast({ title: "Event retried" });
    },
    onError: (err: any) => {
      toast({ title: "Retry failed", description: err?.message, variant: "destructive" });
    },
  });

  const isBusy = activeSync !== null;
  const notConnected = status?.connectionStatus !== "connected";
  const currentMode: SyncModeOption = (status?.syncMode ?? "scheduled") as SyncModeOption;
  const pendingMode = editMode ?? currentMode;

  // Webhook endpoint URL
  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/scheduling/wheniwork/webhook`
    : "/api/scheduling/wheniwork/webhook";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5" data-testid="wiw-sync-panel">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-semibold text-sm">Data Sync</p>
            <p className="text-xs text-muted-foreground">
              Pull WIW shifts, times, users, and attendance into DriverHub.
            </p>
          </div>
        </div>
        {status?.connectionStatus && (
          <Badge className={`gap-1 text-xs border-0 ${
            status.connectionStatus === "connected"
              ? "bg-green-600 dark:bg-green-700 text-white"
              : "bg-muted text-muted-foreground"
          }`}>
            <div className={`h-1.5 w-1.5 rounded-full ${
              status.connectionStatus === "connected" ? "bg-white" : "bg-muted-foreground"
            }`} />
            {status.connectionStatus === "connected" ? "API Connected" : "Not Connected"}
          </Badge>
        )}
      </div>

      {/* ── Multi-org notice ───────────────────────────────────────────── */}
      <div className="rounded-md border bg-muted/30 px-4 py-3 text-xs text-muted-foreground flex gap-2 items-start">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-500" />
        <span>
          <span className="font-medium text-foreground">Single-account mode:</span>{" "}
          DriverHub supports one WIW account per deployment. Multi-tenant per-org WIW accounts are not yet supported.
        </span>
      </div>

      <Separator />

      {/* ── Section 1: Sync Configuration ─────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Sync Configuration</p>
        </div>

        {statusLoading ? (
          <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        ) : (
          <div className="space-y-3">
            {/* Mode selector */}
            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs">Sync Mode</Label>
                <Select
                  value={pendingMode}
                  onValueChange={(v) => setEditMode(v as SyncModeOption)}
                  data-testid="select-sync-mode"
                >
                  <SelectTrigger className="text-sm" data-testid="trigger-sync-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual only</SelectItem>
                    <SelectItem value="scheduled">Scheduled (per cadence)</SelectItem>
                    <SelectItem value="webhook+scheduled">Webhook + Scheduled (recommended)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                {(editMode || webhookSecret || clearSecret) && (
                  <Button
                    size="sm"
                    onClick={() => saveSyncModeMut.mutate()}
                    disabled={saveSyncModeMut.isPending}
                    data-testid="button-save-sync-mode"
                  >
                    {saveSyncModeMut.isPending
                      ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                    Save Configuration
                  </Button>
                )}
              </div>
            </div>

            {/* Mode description */}
            <p className="text-xs text-muted-foreground">
              {pendingMode === "manual" && "Syncs only when triggered manually. No background jobs will run."}
              {pendingMode === "scheduled" && "Runs per-entity scheduled jobs (shifts/times every 15 min, absences/notices hourly, reference data nightly)."}
              {pendingMode === "webhook+scheduled" && "WIW pushes changes via webhook for near-real-time updates. Scheduled jobs act as reconciliation backstop for missed events."}
            </p>

            {/* Webhook config (visible when webhook+scheduled) */}
            {pendingMode === "webhook+scheduled" && (
              <div className="rounded-md border bg-muted/20 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Webhook className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-medium">Webhook Configuration</p>
                  {status?.hasWebhookSecret && (
                    <Badge className="text-xs bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300 border-0 gap-1">
                      <Shield className="h-3 w-3" />Secret configured
                    </Badge>
                  )}
                </div>

                {/* Endpoint URL */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Webhook Endpoint URL</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={webhookUrl}
                      className="text-xs font-mono bg-muted/50"
                      data-testid="input-webhook-url"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(webhookUrl);
                        toast({ title: "Copied to clipboard" });
                      }}
                      data-testid="button-copy-webhook-url"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Configure this URL in your WIW account under Developer &gt; Webhooks.
                  </p>
                </div>

                {/* Secret */}
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Webhook Secret {status?.hasWebhookSecret ? "(update)" : "(optional)"}
                  </Label>
                  <Input
                    type="password"
                    placeholder={status?.hasWebhookSecret ? "••••••••  (leave blank to keep)" : "HMAC signing secret from WIW"}
                    value={webhookSecret}
                    onChange={(e) => { setWebhookSecret(e.target.value); setClearSecret(false); }}
                    className="text-sm"
                    data-testid="input-webhook-secret"
                  />
                  {status?.hasWebhookSecret && (
                    <button
                      type="button"
                      className="text-xs text-red-500 hover:text-red-700"
                      onClick={() => { setClearSecret(true); setWebhookSecret(""); }}
                      data-testid="button-clear-webhook-secret"
                    >
                      Remove secret (disable signature validation)
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Separator />

      {/* ── Section 2: Per-entity sync run status ─────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold">Entity Sync Status</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetchRuns()}
            disabled={runsLoading}
            data-testid="button-refresh-runs"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${runsLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {runsLoading ? (
          <div className="space-y-1.5">
            {[1,2,3,4,5,6,7].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-xs" data-testid="table-entity-runs">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Entity</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Last Run</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">Cadence</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">Status</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground hidden md:table-cell">Fetched</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground hidden md:table-cell">New</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground hidden md:table-cell">Updated</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ENTITY_ORDER.map(entity => {
                  const run: EntityRun | null = syncRuns?.[entity] ?? null;
                  const meta = ENTITY_LABELS[entity];
                  const Icon = meta.icon;
                  const mut = entityMuts[entity];
                  const isActive = activeSync === entity;
                  return (
                    <tr key={entity} className="hover:bg-muted/30 transition-colors" data-testid={`row-entity-${entity}`}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 font-medium">
                          <Icon className="h-3 w-3 text-muted-foreground" />
                          {meta.label}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {run ? (
                          <span title={fmtTs(run.started_at)}>{fmtRelative(run.started_at)}</span>
                        ) : "—"}
                        {run?.trigger_type && run.trigger_type !== "scheduled" && (
                          <span className="ml-1 text-muted-foreground/60">({run.trigger_type})</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">{meta.cadence}</td>
                      <td className="px-3 py-2 text-center">
                        {run ? <StatusBadge status={run.status} /> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center hidden md:table-cell text-muted-foreground">{run?.fetched ?? "—"}</td>
                      <td className="px-3 py-2 text-center hidden md:table-cell text-green-600 dark:text-green-400 font-medium">{run ? `+${run.inserted}` : "—"}</td>
                      <td className="px-3 py-2 text-center hidden md:table-cell text-muted-foreground">{run?.updated ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => mut.mutate()}
                          disabled={isBusy || notConnected}
                          data-testid={`button-sync-${entity}`}
                        >
                          {isActive
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <RefreshCw className="h-3.5 w-3.5" />}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Not-connected warning */}
        {!statusLoading && notConnected && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              No API connection. Save a valid API token and test the connection before syncing.
            </p>
          </div>
        )}
      </div>

      <Separator />

      {/* ── Section 3: Date window + Sync All ─────────────────────────── */}
      <div className="space-y-3">
        <Collapsible open={showCustom} onOpenChange={setShowCustom}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-toggle-date-range"
              >
                <Calendar className="h-3.5 w-3.5" />
                Date window: {startDate} → {endDate}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showCustom ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            <Button
              onClick={() => syncAllMut.mutate()}
              disabled={isBusy || notConnected}
              data-testid="button-sync-all"
            >
              {activeSync === "all"
                ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                : <Layers className="h-4 w-4 mr-1.5" />}
              Sync All Now
            </Button>
          </div>

          <CollapsibleContent className="mt-3">
            <div className="grid grid-cols-2 gap-3 pl-3 border-l border-border">
              <div className="space-y-1.5">
                <Label htmlFor="sync-start" className="text-xs">Start date</Label>
                <Input
                  id="sync-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-8 text-sm"
                  data-testid="input-sync-start"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sync-end" className="text-xs">End date</Label>
                <Input
                  id="sync-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-8 text-sm"
                  data-testid="input-sync-end"
                />
              </div>
              <div className="col-span-2 flex gap-2 flex-wrap">
                {[7, 14, 30, 90].map(days => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => {
                      setEndDate(isoDate(new Date()));
                      setStartDate(isoDate(subDays(new Date(), days)));
                    }}
                    className="text-xs px-2 py-1 rounded bg-muted hover-elevate text-muted-foreground"
                    data-testid={`preset-${days}d`}
                  >
                    Last {days}d
                  </button>
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Last result from manual trigger */}
        {lastResult && (
          <div className="rounded-md border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Last Manual Result</p>
              <Badge className={`gap-1 text-xs border-0 ${
                lastResult.errors > 0 && lastResult.inserted + lastResult.updated === 0
                  ? "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300"
                  : "bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300"
              }`}>
                {lastResult.errors > 0 && lastResult.inserted + lastResult.updated === 0
                  ? <><AlertTriangle className="h-3 w-3" />{lastResult.errors} errors</>
                  : <><CheckCircle2 className="h-3 w-3" />+{lastResult.inserted} new · {lastResult.updated} updated</>}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {lastResult.entity} · {lastResult.fetched} fetched · synced {fmtTs(lastResult.syncedAt)}
            </p>
          </div>
        )}
      </div>

      <Separator />

      {/* ── Section 4: Webhook Event Log ──────────────────────────────── */}
      <Collapsible open={showWebhook} onOpenChange={setShowWebhook}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-semibold hover:text-foreground text-muted-foreground transition-colors w-full"
            data-testid="button-toggle-webhook-events"
          >
            <Webhook className="h-4 w-4" />
            Webhook Event Log
            {webhookData?.total != null && (
              <Badge className="text-xs border-0 bg-muted text-muted-foreground ml-1">
                {webhookData.total}
              </Badge>
            )}
            <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${showWebhook ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground">
              Recent inbound events from WIW. Failed events are automatically retried (up to 5 attempts).
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetchWebhook()}
              disabled={webhookLoading}
              data-testid="button-refresh-webhook-events"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${webhookLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {webhookLoading ? (
            <div className="space-y-1.5">
              {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !webhookData?.events?.length ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No webhook events received yet.
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-xs" data-testid="table-webhook-events">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Event Type</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">Received</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">Status</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground hidden md:table-cell">Retries</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {webhookData.events.map(ev => (
                    <tr key={ev.id} className="hover:bg-muted/30 transition-colors" data-testid={`row-webhook-${ev.id}`}>
                      <td className="px-3 py-2">
                        <p className="font-medium">{ev.event_type}</p>
                        {ev.last_error && (
                          <p className="text-red-600 dark:text-red-400 truncate max-w-[200px]" title={ev.last_error}>
                            {ev.last_error}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">
                        <span title={fmtTs(ev.received_at)}>{fmtRelative(ev.received_at)}</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <WebhookStatusBadge status={ev.status} />
                      </td>
                      <td className="px-3 py-2 text-center text-muted-foreground hidden md:table-cell">
                        {ev.retry_count > 0 ? ev.retry_count : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {(ev.status === "failed" || ev.status === "pending") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => retryEventMut.mutate(ev.id)}
                            disabled={retryEventMut.isPending}
                            data-testid={`button-retry-${ev.id}`}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

    </div>
  );
}
