import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Server, FolderInput, CheckCircle2, AlertCircle, Clock, Copy, RotateCcw,
  Plus, Trash2, RefreshCw, Play, Settings, Activity, FileSearch, Wifi,
  WifiOff, AlertTriangle, Info, ChevronDown, ChevronRight,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FileDropConfig {
  id: string;
  name: string;
  datasetType: string;
  enabled: boolean;
  sftpHost: string | null;
  sftpPort: number;
  sftpUsername: string | null;
  sftpPasswordEncrypted: string | null;
  sftpPrivateKeyEncrypted: string | null;
  inboundPath: string;
  archivePath: string | null;
  errorPath: string | null;
  duplicatePath: string | null;
  pollIntervalMinutes: number;
  fileNamePattern: string | null;
  autoProcess: boolean;
  requireAllFileTypes: boolean;
  notes: string | null;
  lastPolledAt: string | null;
  createdAt: string;
  ingestCounts: Record<string, number>;
}

interface IngestionLogEntry {
  id: string;
  fileDropConfigId: string;
  fileName: string;
  remotePath: string | null;
  fileSize: number | null;
  checksum: string | null;
  status: string;
  datasetType: string;
  importJobId: string | null;
  importBatchId: string | null;
  rowsStaged: number | null;
  rowsCommitted: number | null;
  rowsFailed: number | null;
  archivedPath: string | null;
  errorMessage: string | null;
  detectedAt: string;
  processedAt: string | null;
}

interface LogSummary {
  total: number;
  processed: number;
  pending: number;
  processing: number;
  rejected: number;
  duplicate: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtBytes(b: number | null | undefined) {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    processed:  "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200",
    pending:    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200",
    processing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200",
    rejected:   "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200",
    duplicate:  "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200",
  };
  return (
    <Badge variant="outline" className={`text-xs capitalize ${map[status] ?? ""}`}>
      {status}
    </Badge>
  );
}

function DatasetBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    rideshare: "bg-blue-50 text-blue-700 border-blue-200",
    openforce: "bg-orange-50 text-orange-700 border-orange-200",
    moves:     "bg-green-50 text-green-700 border-green-200",
  };
  return <Badge variant="outline" className={`text-xs capitalize ${map[type] ?? ""}`}>{type}</Badge>;
}

const POLL_INTERVALS = [
  { value: "5",  label: "Every 5 minutes" },
  { value: "15", label: "Every 15 minutes" },
  { value: "60", label: "Every hour" },
];

const DATASET_TYPES = [
  { value: "rideshare", label: "Rideshare", description: "Uber / Lyft trip data" },
  { value: "openforce", label: "OpenForce", description: "IC settlement files" },
  { value: "moves",     label: "Moves",     description: "Multi-file moves dataset" },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FileDrop() {
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: configs = [], isLoading: configsLoading } = useQuery<FileDropConfig[]>({
    queryKey: ["/api/corporate/file-drop/configs"],
    queryFn: () => fetch("/api/corporate/file-drop/configs", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30000,
  });

  const { data: summary } = useQuery<LogSummary>({
    queryKey: ["/api/corporate/file-drop/log/summary"],
    queryFn: () => fetch("/api/corporate/file-drop/log/summary", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30000,
  });

  const selectedConfig = configs.find(c => c.id === selectedConfigId) ?? null;

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Server className="h-6 w-6 text-primary" />
            Secure File Drop
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automated SFTP-based inbound file ingestion with staging, validation, and archive routing.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-new-config">
          <Plus className="h-4 w-4 mr-2" />New File Drop
        </Button>
      </div>

      {/* ── Summary KPIs ───────────────────────────────────────────────── */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: "Total",      value: summary.total,      color: "" },
            { label: "Processed",  value: summary.processed,  color: "text-green-600 dark:text-green-400" },
            { label: "Pending",    value: summary.pending,    color: "text-yellow-600 dark:text-yellow-400" },
            { label: "Processing", value: summary.processing, color: "text-blue-600 dark:text-blue-400" },
            { label: "Rejected",   value: summary.rejected,   color: "text-red-600 dark:text-red-400" },
            { label: "Duplicate",  value: summary.duplicate,  color: "text-purple-600 dark:text-purple-400" },
          ].map(({ label, value, color }) => (
            <Card key={label}>
              <CardContent className="pt-3 pb-3 text-center">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value.toLocaleString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Config List + Detail ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: config list */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            Configured File Drops
          </h2>
          {configsLoading
            ? [1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)
            : configs.length === 0
              ? (
                <div className="text-sm text-muted-foreground text-center py-8 border rounded-md border-dashed">
                  No file drops configured yet.
                </div>
              )
              : configs.map(config => (
                <ConfigCard
                  key={config.id}
                  config={config}
                  selected={selectedConfigId === config.id}
                  onSelect={() => setSelectedConfigId(config.id === selectedConfigId ? null : config.id)}
                  onDelete={() => setDeleteId(config.id)}
                />
              ))
          }
        </div>

        {/* Right: detail panel */}
        <div className="lg:col-span-2">
          {selectedConfig
            ? <ConfigDetail config={selectedConfig} />
            : (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground text-center gap-3 rounded-md border border-dashed">
                <FolderInput className="h-10 w-10 opacity-30" />
                <div>
                  <p className="font-medium">Select a file drop to view details</p>
                  <p className="text-sm">Or create a new one to get started.</p>
                </div>
              </div>
            )
          }
        </div>
      </div>

      {/* ── Global Ingestion Log ────────────────────────────────────────── */}
      <Separator />
      <div>
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4" />Global Ingestion Log
        </h2>
        <IngestionLogTable />
      </div>

      {/* ── Create Config Dialog ────────────────────────────────────────── */}
      <ConfigFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={(id) => { setSelectedConfigId(id); setCreateOpen(false); }}
      />

      {/* ── Delete Confirm ──────────────────────────────────────────────── */}
      <DeleteConfigDialog
        configId={deleteId}
        configs={configs}
        onClose={() => setDeleteId(null)}
        onDeleted={() => { if (selectedConfigId === deleteId) setSelectedConfigId(null); setDeleteId(null); }}
      />
    </div>
  );
}

// ─── Config Card ──────────────────────────────────────────────────────────────

function ConfigCard({ config, selected, onSelect, onDelete }: {
  config: FileDropConfig;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const enableMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("POST", `/api/corporate/file-drop/configs/${config.id}/enable`, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/file-drop/configs"] });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const processed = config.ingestCounts["processed"] ?? 0;
  const rejected  = config.ingestCounts["rejected"]  ?? 0;

  return (
    <Card
      className={`cursor-pointer transition-colors ${selected ? "ring-2 ring-primary" : "hover-elevate"}`}
      onClick={onSelect}
      data-testid={`config-card-${config.id}`}
    >
      <CardContent className="pt-3 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-medium text-sm truncate">{config.name}</p>
              <DatasetBadge type={config.datasetType} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {config.sftpHost ? `${config.sftpHost}${config.inboundPath}` : config.inboundPath}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {processed} processed · {rejected > 0 ? <span className="text-red-500">{rejected} rejected</span> : "0 rejected"}
              {config.lastPolledAt && ` · Last: ${fmtDate(config.lastPolledAt).split(",")[0]}`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <Switch
              checked={config.enabled}
              onCheckedChange={(v) => { enableMutation.mutate(v); }}
              onClick={(e) => e.stopPropagation()}
              data-testid={`toggle-enable-${config.id}`}
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-xs text-muted-foreground"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              data-testid={`button-delete-config-${config.id}`}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Config Detail ────────────────────────────────────────────────────────────

function ConfigDetail({ config }: { config: FileDropConfig }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; files?: string[] } | null>(null);

  const pollMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/corporate/file-drop/configs/${config.id}/poll`, {}),
    onSuccess: (data: any) => {
      toast({
        title: "Poll complete",
        description: `Detected: ${data.filesDetected} · Ingested: ${data.filesIngested} · Duplicate: ${data.filesDuplicate} · Errors: ${data.filesErrored}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/file-drop/configs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/file-drop/log"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/file-drop/log/summary"] });
    },
    onError: (err: Error) => toast({ title: "Poll failed", description: err.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/corporate/file-drop/configs/${config.id}/test`, {}),
    onSuccess: (data: any) => {
      setTestResult(data);
      toast({ title: data.success ? "Connection OK" : "Connection failed", description: data.message, variant: data.success ? "default" : "destructive" });
    },
    onError: (err: Error) => { setTestResult({ success: false, message: err.message }); },
  });

  const pollIntervalLabel = POLL_INTERVALS.find(p => String(config.pollIntervalMinutes) === p.value)?.label ?? `${config.pollIntervalMinutes} min`;

  return (
    <div className="space-y-4">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-lg">{config.name}</h2>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <DatasetBadge type={config.datasetType} />
            <Badge variant="outline" className={config.enabled
              ? "bg-green-50 text-green-700 border-green-200 text-xs"
              : "text-muted-foreground text-xs"}>
              {config.enabled ? "Enabled" : "Disabled"}
            </Badge>
            <span className="text-xs text-muted-foreground">{pollIntervalLabel}</span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline" size="sm"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            data-testid="button-test-connection"
          >
            {testMutation.isPending
              ? <RefreshCw className="h-4 w-4 animate-spin mr-1.5" />
              : <Wifi className="h-4 w-4 mr-1.5" />}
            Test Connection
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={() => pollMutation.mutate()}
            disabled={pollMutation.isPending}
            data-testid="button-poll-now"
          >
            {pollMutation.isPending
              ? <RefreshCw className="h-4 w-4 animate-spin mr-1.5" />
              : <Play className="h-4 w-4 mr-1.5" />}
            Poll Now
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Settings className="h-4 w-4 mr-1.5" />Edit
          </Button>
        </div>
      </div>

      {/* ── Connection Test Result ───────────────────────────────────────── */}
      {testResult && (
        <div className={`flex items-start gap-2 p-3 rounded-md border text-sm ${testResult.success
          ? "bg-green-50 dark:bg-green-950/20 border-green-200 text-green-800 dark:text-green-300"
          : "bg-red-50 dark:bg-red-950/20 border-red-200 text-red-800 dark:text-red-300"}`}
        >
          {testResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
          <div className="flex-1">
            <p>{testResult.message}</p>
            {testResult.files && testResult.files.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {testResult.files.slice(0, 8).map(f => (
                  <p key={f} className="text-xs font-mono opacity-80">{f}</p>
                ))}
                {testResult.files.length > 8 && <p className="text-xs opacity-60">…and {testResult.files.length - 8} more</p>}
              </div>
            )}
          </div>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={() => setTestResult(null)}>
            <span className="sr-only">Dismiss</span>×
          </Button>
        </div>
      )}

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings"><Settings className="h-4 w-4 mr-1.5" />Settings</TabsTrigger>
          <TabsTrigger value="log"><Activity className="h-4 w-4 mr-1.5" />Ingestion Log</TabsTrigger>
        </TabsList>

        {/* ── Settings Tab ─────────────────────────────────────────────── */}
        <TabsContent value="settings" className="mt-4 space-y-4">
          {/* SFTP Connection */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">SFTP Connection</CardTitle></CardHeader>
            <CardContent className="pt-0 grid grid-cols-2 gap-3 text-sm">
              {[
                { label: "Host",     value: config.sftpHost      ?? <span className="text-muted-foreground italic">Not set</span> },
                { label: "Port",     value: config.sftpPort },
                { label: "Username", value: config.sftpUsername   ?? <span className="text-muted-foreground italic">Not set</span> },
                { label: "Auth",     value: config.sftpPrivateKeyEncrypted ? "Private Key" : config.sftpPasswordEncrypted ? "Password" : <span className="text-muted-foreground italic">Not set</span> },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-medium mt-0.5">{value}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Folder Paths */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Folder Paths</CardTitle></CardHeader>
            <CardContent className="pt-0 space-y-2">
              {[
                { label: "Inbound",   path: config.inboundPath,   icon: "→" },
                { label: "Processed", path: config.archivePath,   icon: "✓" },
                { label: "Error",     path: config.errorPath,     icon: "✗" },
                { label: "Duplicate", path: config.duplicatePath, icon: "=" },
              ].map(({ label, path, icon }) => (
                <div key={label} className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground w-20 text-xs">{label}</span>
                  <code className="flex-1 bg-muted px-2 py-0.5 rounded text-xs font-mono">
                    {icon} {path ?? "—"}
                  </code>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Processing Settings */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Processing Settings</CardTitle></CardHeader>
            <CardContent className="pt-0 grid grid-cols-2 gap-3 text-sm">
              {[
                { label: "Poll Interval",       value: pollIntervalLabel },
                { label: "Auto-Process",        value: config.autoProcess ? "Enabled" : "Disabled" },
                { label: "Require All Files",   value: config.requireAllFileTypes ? "Yes" : "No" },
                { label: "File Name Pattern",   value: config.fileNamePattern ?? "Any file" },
                { label: "Last Polled",         value: fmtDate(config.lastPolledAt) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-medium mt-0.5">{value}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {config.notes && (
            <Card>
              <CardContent className="pt-3 pb-3 text-sm text-muted-foreground">{config.notes}</CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Ingestion Log Tab ─────────────────────────────────────────── */}
        <TabsContent value="log" className="mt-4">
          <IngestionLogTable configId={config.id} />
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <ConfigFormDialog
        open={editOpen}
        existing={config}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          queryClient.invalidateQueries({ queryKey: ["/api/corporate/file-drop/configs"] });
        }}
      />
    </div>
  );
}

// ─── Ingestion Log Table ──────────────────────────────────────────────────────

function IngestionLogTable({ configId }: { configId?: string }) {
  const url = configId
    ? `/api/corporate/file-drop/log?configId=${configId}&limit=50`
    : `/api/corporate/file-drop/log?limit=100`;

  const { data: logs = [], isLoading } = useQuery<IngestionLogEntry[]>({
    queryKey: ["/api/corporate/file-drop/log", configId ?? "all"],
    queryFn: () => fetch(url, { credentials: "include" }).then(r => r.json()),
    refetchInterval: 15000,
  });

  if (isLoading) return <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  if (logs.length === 0) return (
    <div className="text-sm text-muted-foreground text-center py-8 border rounded-md border-dashed">
      No ingestion events yet. Files will appear here when detected.
    </div>
  );

  return (
    <div className="border rounded-md overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>File</TableHead>
            <TableHead>Dataset</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Size</TableHead>
            <TableHead className="text-right">Rows Staged</TableHead>
            <TableHead>Detected</TableHead>
            <TableHead>Processed</TableHead>
            <TableHead>Archived To</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map(log => (
            <TableRow key={log.id} data-testid={`log-row-${log.id}`}>
              <TableCell className="font-mono text-xs max-w-48 truncate" title={log.fileName}>
                {log.fileName}
              </TableCell>
              <TableCell><DatasetBadge type={log.datasetType} /></TableCell>
              <TableCell>
                <div className="space-y-0.5">
                  <StatusBadge status={log.status} />
                  {log.errorMessage && (
                    <p className="text-xs text-red-500 max-w-40 truncate" title={log.errorMessage}>
                      {log.errorMessage}
                    </p>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right text-xs">{fmtBytes(log.fileSize)}</TableCell>
              <TableCell className="text-right text-xs">{log.rowsStaged?.toLocaleString() ?? "—"}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">{fmtDate(log.detectedAt)}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">{fmtDate(log.processedAt)}</TableCell>
              <TableCell className="font-mono text-xs max-w-40 truncate text-muted-foreground" title={log.archivedPath ?? ""}>
                {log.archivedPath ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Config Form Dialog ───────────────────────────────────────────────────────

function ConfigFormDialog({ open, existing, onClose, onSaved }: {
  open: boolean;
  existing?: FileDropConfig | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!existing;

  const [form, setForm] = useState(() => ({
    name:                existing?.name                ?? "",
    datasetType:         existing?.datasetType         ?? "moves",
    enabled:             existing?.enabled             ?? false,
    sftpHost:            existing?.sftpHost            ?? "",
    sftpPort:            String(existing?.sftpPort     ?? 22),
    sftpUsername:        existing?.sftpUsername        ?? "",
    sftpPassword:        "",
    sftpPrivateKey:      "",
    inboundPath:         existing?.inboundPath         ?? "/inbound/moves/",
    archivePath:         existing?.archivePath         ?? "/archive/processed/",
    errorPath:           existing?.errorPath           ?? "/archive/error/",
    duplicatePath:       existing?.duplicatePath       ?? "/archive/duplicate/",
    pollIntervalMinutes: String(existing?.pollIntervalMinutes ?? 15),
    fileNamePattern:     existing?.fileNamePattern     ?? "",
    autoProcess:         existing?.autoProcess         ?? false,
    requireAllFileTypes: existing?.requireAllFileTypes ?? false,
    notes:               existing?.notes               ?? "",
  }));

  // Sync dataset type to default inbound path
  const handleDatasetChange = (v: string) => {
    setForm(f => ({
      ...f,
      datasetType: v,
      inboundPath: f.inboundPath === "/inbound/moves/" || f.inboundPath === "/inbound/rideshare/" || f.inboundPath === "/inbound/openforce/"
        ? `/inbound/${v}/`
        : f.inboundPath,
    }));
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        sftpPort:            parseInt(form.sftpPort, 10) || 22,
        pollIntervalMinutes: parseInt(form.pollIntervalMinutes, 10) || 15,
      };
      if (isEdit) {
        return apiRequest("PATCH", `/api/corporate/file-drop/configs/${existing!.id}`, payload);
      }
      return apiRequest("POST", "/api/corporate/file-drop/configs", payload);
    },
    onSuccess: (data: any) => {
      toast({ title: isEdit ? "Config updated" : "File drop created", description: `"${data.name}" saved.` });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/file-drop/configs"] });
      onSaved(data.id);
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const f = form;
  const set = (k: keyof typeof form) => (v: string | boolean) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit File Drop Config" : "New File Drop Config"}</DialogTitle>
          <DialogDescription>
            Configure an SFTP inbound folder that DriverHub will poll automatically for new files.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* General */}
          <section className="space-y-3">
            <h3 className="font-medium text-sm">General</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Configuration Name</Label>
                <Input value={f.name} onChange={e => set("name")(e.target.value)} placeholder="e.g. Uber East Inbound" data-testid="input-config-name" />
              </div>
              <div className="space-y-1.5">
                <Label>Dataset Type</Label>
                <Select value={f.datasetType} onValueChange={handleDatasetChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DATASET_TYPES.map(dt => (
                      <SelectItem key={dt.value} value={dt.value}>
                        {dt.label} — <span className="text-muted-foreground">{dt.description}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Poll Interval</Label>
                <Select value={f.pollIntervalMinutes} onValueChange={v => set("pollIntervalMinutes")(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {POLL_INTERVALS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <Separator />

          {/* SFTP Connection */}
          <section className="space-y-3">
            <h3 className="font-medium text-sm">SFTP Connection</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Host</Label>
                <Input value={f.sftpHost} onChange={e => set("sftpHost")(e.target.value)} placeholder="sftp.example.com" data-testid="input-sftp-host" />
              </div>
              <div className="space-y-1.5">
                <Label>Port</Label>
                <Input value={f.sftpPort} onChange={e => set("sftpPort")(e.target.value)} type="number" placeholder="22" />
              </div>
              <div className="space-y-1.5">
                <Label>Username</Label>
                <Input value={f.sftpUsername} onChange={e => set("sftpUsername")(e.target.value)} placeholder="sftp_user" />
              </div>
              <div className="space-y-1.5">
                <Label>Password {isEdit && existing?.sftpPasswordEncrypted && <span className="text-muted-foreground text-xs">(stored — leave blank to keep)</span>}</Label>
                <Input value={f.sftpPassword} onChange={e => set("sftpPassword")(e.target.value)} type="password" placeholder={isEdit ? "••••••••" : "Password or passphrase"} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Private Key {isEdit && existing?.sftpPrivateKeyEncrypted && <span className="text-muted-foreground text-xs">(stored — leave blank to keep)</span>}</Label>
                <Textarea
                  value={f.sftpPrivateKey}
                  onChange={e => set("sftpPrivateKey")(e.target.value)}
                  rows={3}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;(paste PEM key content here)"
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">If provided, private key auth takes priority over password.</p>
              </div>
            </div>
          </section>

          <Separator />

          {/* Folder Paths */}
          <section className="space-y-3">
            <h3 className="font-medium text-sm">Folder Paths</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Inbound Path <span className="text-red-500">*</span></Label>
                <Input value={f.inboundPath} onChange={e => set("inboundPath")(e.target.value)} placeholder="/inbound/moves/" />
              </div>
              <div className="space-y-1.5">
                <Label>Processed Archive</Label>
                <Input value={f.archivePath} onChange={e => set("archivePath")(e.target.value)} placeholder="/archive/processed/" />
              </div>
              <div className="space-y-1.5">
                <Label>Error Archive</Label>
                <Input value={f.errorPath} onChange={e => set("errorPath")(e.target.value)} placeholder="/archive/error/" />
              </div>
              <div className="space-y-1.5">
                <Label>Duplicate Archive</Label>
                <Input value={f.duplicatePath} onChange={e => set("duplicatePath")(e.target.value)} placeholder="/archive/duplicate/" />
              </div>
            </div>
          </section>

          <Separator />

          {/* Processing */}
          <section className="space-y-3">
            <h3 className="font-medium text-sm">Processing Options</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>File Name Pattern (regex, optional)</Label>
                <Input value={f.fileNamePattern} onChange={e => set("fileNamePattern")(e.target.value)} placeholder="\.(csv|xlsx)$" />
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium">Auto-Process after staging</p>
                  <p className="text-xs text-muted-foreground">Automatically commit validated rows without manual review</p>
                </div>
                <Switch checked={f.autoProcess} onCheckedChange={v => set("autoProcess")(v)} />
              </div>
              {f.datasetType === "moves" && (
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">Require all file types before processing</p>
                    <p className="text-xs text-muted-foreground">Wait until master + all expected child files are detected</p>
                  </div>
                  <Switch checked={f.requireAllFileTypes} onCheckedChange={v => set("requireAllFileTypes")(v)} />
                </div>
              )}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium">Enabled</p>
                  <p className="text-xs text-muted-foreground">Start polling on the configured schedule</p>
                </div>
                <Switch checked={f.enabled} onCheckedChange={v => set("enabled")(v)} />
              </div>
            </div>
          </section>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea value={f.notes} onChange={e => set("notes")(e.target.value)} rows={2} placeholder="Any notes about this configuration…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!f.name.trim() || !f.inboundPath.trim() || saveMutation.isPending} data-testid="button-save-config">
            {saveMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
            {isEdit ? "Save Changes" : "Create File Drop"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Config Dialog ─────────────────────────────────────────────────────

function DeleteConfigDialog({ configId, configs, onClose, onDeleted }: {
  configId: string | null;
  configs: FileDropConfig[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const config = configs.find(c => c.id === configId);

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/corporate/file-drop/configs/${configId}`, undefined),
    onSuccess: () => {
      toast({ title: "Config deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/file-drop/configs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/file-drop/log/summary"] });
      onDeleted();
    },
    onError: (err: Error) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  return (
    <AlertDialog open={!!configId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete File Drop Config</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete <strong>"{config?.name}"</strong>?
            All ingestion log entries for this config will also be deleted. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => deleteMutation.mutate()}
            data-testid="button-confirm-delete"
          >
            {deleteMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
