import { useState, useRef, useCallback } from "react";
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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle, CheckCircle2, Info, AlertTriangle, Upload, FileText,
  Plus, Trash2, RefreshCw, Play, RotateCcw, ChevronRight, ArrowLeft,
  Files, ShieldCheck, BarChart3, Clock, X,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type JobStatus =
  | "draft" | "in_progress" | "staged" | "validating"
  | "validated" | "processing" | "completed" | "failed" | "cancelled";

type FileStatus = "pending" | "staged" | "validating" | "validated" | "failed" | "reprocessing";

interface ImportJob {
  id: string;
  datasetType: string;
  jobName: string;
  status: JobStatus;
  createdByUserId: string | null;
  notes: string | null;
  validationSummaryJson: any;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
  fileCount?: number;
  files?: ImportJobFile[];
}

interface ImportJobFile {
  id: string;
  importJobId: string;
  fileType: string;
  sourceFileName: string;
  sourceFileType: string | null;
  status: FileStatus;
  totalRows: number | null;
  stagedRows: number;
  validRows: number;
  invalidRows: number;
  orphanRows: number;
  duplicateRows: number;
  committedRows: number;
  detectedKeyColumn: string | null;
  notes: string | null;
  createdAt: string;
}

interface ValidationIssue {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
  count?: number;
}

interface ReconciliationFile {
  fileId: string;
  fileType: string;
  sourceFileName: string;
  status: string;
  sourceRows: number;
  staged: number;
  validated: number;
  orphan: number;
  duplicate: number;
  committed: number;
  failed: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FILE_TYPES = [
  { value: "moves_master",       label: "Moves Master",        required: true,  description: "Primary move records — required" },
  { value: "move_stops",         label: "Move Stops",          required: false, description: "Stop-level detail per move" },
  { value: "driver_assignments", label: "Driver Assignments",  required: false, description: "Driver-to-move assignments" },
  { value: "revenue",            label: "Revenue",             required: false, description: "Move-level billing/revenue amounts" },
  { value: "status_history",     label: "Status History",      required: false, description: "Move status change events" },
  { value: "other",              label: "Other",               required: false, description: "Other related move data" },
];

const FILE_TYPE_MAP = Object.fromEntries(FILE_TYPES.map(f => [f.value, f]));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

function JobStatusBadge({ status }: { status: JobStatus }) {
  const map: Record<JobStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    draft:       { label: "Draft",       variant: "outline" },
    in_progress: { label: "In Progress", variant: "secondary" },
    staged:      { label: "Staged",      variant: "secondary" },
    validating:  { label: "Validating",  variant: "secondary" },
    validated:   { label: "Validated",   variant: "default" },
    processing:  { label: "Processing",  variant: "secondary" },
    completed:   { label: "Completed",   variant: "default" },
    failed:      { label: "Failed",      variant: "destructive" },
    cancelled:   { label: "Cancelled",   variant: "outline" },
  };
  const { label, variant } = map[status] ?? { label: status, variant: "outline" };
  const color = status === "completed" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200" :
                status === "validated" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200" : "";
  return <Badge variant={variant} className={color}>{label}</Badge>;
}

function FileStatusBadge({ status }: { status: FileStatus | string }) {
  const map: Record<string, string> = {
    pending:      "text-muted-foreground border-muted",
    staged:       "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200",
    validating:   "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200",
    validated:    "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200",
    failed:       "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200",
    reprocessing: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200",
  };
  const labels: Record<string, string> = {
    pending: "Pending", staged: "Staged", validating: "Validating",
    validated: "Validated", failed: "Failed", reprocessing: "Reprocessing",
  };
  return (
    <Badge variant="outline" className={`text-xs ${map[status] ?? ""}`}>
      {labels[status] ?? status}
    </Badge>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function MovesImport() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex h-full">
      {/* ── Left: Job List ───────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 border-r flex flex-col">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
          <div>
            <h2 className="font-semibold text-sm">Moves Imports</h2>
            <p className="text-xs text-muted-foreground">Multi-file import jobs</p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="button-new-import-job">
            <Plus className="h-4 w-4 mr-1" />New Job
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <JobList selectedJobId={selectedJobId} onSelect={setSelectedJobId} />
        </div>
      </div>

      {/* ── Right: Job Detail ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {selectedJobId ? (
          <JobDetail jobId={selectedJobId} onBack={() => setSelectedJobId(null)} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-muted-foreground p-8">
            <Files className="h-12 w-12 opacity-30" />
            <div>
              <p className="font-medium">No import job selected</p>
              <p className="text-sm">Select an existing job from the list, or create a new one.</p>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />Create Import Job
            </Button>
          </div>
        )}
      </div>

      {/* ── Create Job Dialog ──────────────────────────────────────────── */}
      <CreateJobDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => { setSelectedJobId(id); setCreateOpen(false); }}
      />
    </div>
  );
}

// ─── Job List ────────────────────────────────────────────────────────────────

function JobList({ selectedJobId, onSelect }: { selectedJobId: string | null; onSelect: (id: string) => void }) {
  const { data: jobs = [], isLoading } = useQuery<ImportJob[]>({
    queryKey: ["/api/corporate/moves-import/jobs"],
    queryFn: () => fetch("/api/corporate/moves-import/jobs", { credentials: "include" }).then(r => r.json()),
  });

  if (isLoading) return (
    <div className="p-3 space-y-2">
      {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
    </div>
  );

  if (jobs.length === 0) return (
    <div className="p-6 text-center text-sm text-muted-foreground">
      No import jobs yet. Create one to get started.
    </div>
  );

  return (
    <div className="divide-y">
      {jobs.map(job => (
        <button
          key={job.id}
          className={`w-full text-left px-4 py-3 hover-elevate transition-colors ${selectedJobId === job.id ? "bg-muted" : ""}`}
          onClick={() => onSelect(job.id)}
          data-testid={`job-row-${job.id}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{job.jobName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {job.fileCount ?? 0} file{(job.fileCount ?? 0) !== 1 ? "s" : ""} · {fmtDate(job.createdAt).split(",")[0]}
              </p>
            </div>
            <JobStatusBadge status={job.status} />
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Create Job Dialog ────────────────────────────────────────────────────────

function CreateJobDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [jobName, setJobName] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/corporate/moves-import/jobs", { jobName, notes: notes || undefined }),
    onSuccess: (data: any) => {
      toast({ title: "Import job created", description: `"${data.jobName}" is ready for files.` });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/moves-import/jobs"] });
      setJobName(""); setNotes("");
      onCreated(data.id);
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Moves Import Job</DialogTitle>
          <DialogDescription>
            Create a new multi-file import job for the Moves dataset. You will add files after creation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Job Name</Label>
            <Input
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              placeholder="e.g. Moves Import — March 2026"
              data-testid="input-job-name"
              onKeyDown={(e) => { if (e.key === "Enter" && jobName.trim()) createMutation.mutate(); }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Any notes about this import batch…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => createMutation.mutate()} disabled={!jobName.trim() || createMutation.isPending} data-testid="button-create-job">
            {createMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Create Job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Job Detail ───────────────────────────────────────────────────────────────

function JobDetail({ jobId, onBack }: { jobId: string; onBack: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: job, isLoading } = useQuery<ImportJob>({
    queryKey: ["/api/corporate/moves-import/jobs", jobId],
    queryFn: () => fetch(`/api/corporate/moves-import/jobs/${jobId}`, { credentials: "include" }).then(r => r.json()),
    refetchInterval: (query) => {
      const status = (query.state.data as ImportJob | undefined)?.status;
      return status && ["validating", "processing"].includes(status) ? 2000 : false;
    },
  });

  const validateMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/corporate/moves-import/jobs/${jobId}/validate`, {}),
    onSuccess: (data: any) => {
      const msg = data.isReady
        ? `Validation passed. Job is ready to process.`
        : `Validation found ${data.issues.filter((i: any) => i.level === "error").length} error(s).`;
      toast({ title: "Validation complete", description: msg });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/moves-import/jobs", jobId] });
    },
    onError: (err: Error) => toast({ title: "Validation failed", description: err.message, variant: "destructive" }),
  });

  const processMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/corporate/moves-import/jobs/${jobId}/process`, {}),
    onSuccess: (data: any) => {
      toast({ title: "Import processed", description: `${data.committedCount} move(s) committed to the system.` });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/moves-import/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/moves-import/jobs", jobId] });
    },
    onError: (err: Error) => toast({ title: "Processing failed", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (!job) return (
    <div className="p-6 text-center text-muted-foreground">
      <p>Job not found.</p>
      <Button variant="link" onClick={onBack}>Go back</Button>
    </div>
  );

  const files = job.files ?? [];
  const hasFiles = files.length > 0;
  const hasMaster = files.some(f => f.fileType === "moves_master");
  const isCompleted = job.status === "completed";
  const isFailed = job.status === "failed";
  const isProcessing = job.status === "processing";
  const isValidating = job.status === "validating";
  const isValidated = job.status === "validated";
  const canValidate = hasFiles && !["completed", "cancelled", "validating", "processing"].includes(job.status);
  const canProcess = isValidated && hasMaster;

  const validationSummary = job.validationSummaryJson as { isReady?: boolean; issues?: ValidationIssue[] } | null;

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0 -ml-2 mt-0.5">
          <ArrowLeft className="h-4 w-4 mr-1" />Back
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold">{job.jobName}</h1>
            <JobStatusBadge status={job.status} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Created {fmtDate(job.createdAt)}
            {job.processedAt && ` · Processed ${fmtDate(job.processedAt)}`}
          </p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          {canValidate && (
            <Button
              variant="outline"
              onClick={() => validateMutation.mutate()}
              disabled={validateMutation.isPending || isValidating}
              data-testid="button-validate-job"
            >
              {(validateMutation.isPending || isValidating)
                ? <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                : <ShieldCheck className="h-4 w-4 mr-2" />}
              Run Validation
            </Button>
          )}
          {canProcess && (
            <Button
              onClick={() => processMutation.mutate()}
              disabled={processMutation.isPending || isProcessing}
              data-testid="button-process-job"
            >
              {(processMutation.isPending || isProcessing)
                ? <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                : <Play className="h-4 w-4 mr-2" />}
              Process Import
            </Button>
          )}
          {isCompleted && (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 border py-1 px-3">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 inline" />Import Completed
            </Badge>
          )}
        </div>
      </div>

      {/* ── Required Files Checklist ────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Required & Optional Files</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-3">
            {FILE_TYPES.map(ft => {
              const uploaded = files.find(f => f.fileType === ft.value);
              return (
                <div
                  key={ft.value}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm
                    ${uploaded ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800" : ft.required ? "border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900" : "border-dashed text-muted-foreground"}`}
                >
                  {uploaded ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                  ) : ft.required ? (
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 opacity-40" />
                  )}
                  <span className={ft.required && !uploaded ? "text-red-700 dark:text-red-400 font-medium" : ""}>
                    {ft.label}
                    {ft.required && <span className="ml-1 text-xs">(required)</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="files">
        <TabsList>
          <TabsTrigger value="files" className="gap-1.5">
            <Files className="h-4 w-4" />Files
            {hasFiles && <Badge variant="secondary" className="ml-1 text-xs">{files.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="validation" className="gap-1.5">
            <ShieldCheck className="h-4 w-4" />Validation
            {validationSummary?.issues?.some(i => i.level === "error") && (
              <Badge variant="destructive" className="ml-1 text-xs">
                {validationSummary.issues.filter(i => i.level === "error").length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reconciliation" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />Reconciliation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="files" className="mt-4 space-y-4">
          <FilesTab job={job} files={files} />
        </TabsContent>

        <TabsContent value="validation" className="mt-4">
          <ValidationTab job={job} issues={validationSummary?.issues ?? []} isReady={validationSummary?.isReady} />
        </TabsContent>

        <TabsContent value="reconciliation" className="mt-4">
          <ReconciliationTab jobId={jobId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Files Tab ────────────────────────────────────────────────────────────────

function FilesTab({ job, files }: { job: ImportJob; files: ImportJobFile[] }) {
  const [uploadFileType, setUploadFileType] = useState("moves_master");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: ({ file, fileType }: { file: File; fileType: string }) => {
      const form = new FormData();
      form.append("file", file);
      form.append("fileType", fileType);
      return fetch(`/api/corporate/moves-import/jobs/${job.id}/files`, {
        method: "POST",
        body: form,
        credentials: "include",
      }).then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message ?? "Upload failed");
        return data;
      });
    },
    onSuccess: (data: any) => {
      toast({ title: "File uploaded", description: `${data.sourceFileName} staged with ${data.stagedRows} rows.` });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/moves-import/jobs", job.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/moves-import/jobs"] });
    },
    onError: (err: Error) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) =>
      apiRequest("DELETE", `/api/corporate/moves-import/jobs/${job.id}/files/${fileId}`, undefined),
    onSuccess: () => {
      toast({ title: "File removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/moves-import/jobs", job.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/moves-import/jobs"] });
    },
    onError: (err: Error) => toast({ title: "Failed to remove file", description: err.message, variant: "destructive" }),
  });

  const handleFiles = useCallback((droppedFiles: FileList | null) => {
    if (!droppedFiles || droppedFiles.length === 0) return;
    const file = droppedFiles[0];
    uploadMutation.mutate({ file, fileType: uploadFileType });
  }, [uploadFileType, uploadMutation]);

  const isReadOnly = ["completed", "cancelled"].includes(job.status);

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      {!isReadOnly && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap gap-3 items-end mb-3">
              <div className="space-y-1.5 w-52">
                <Label className="text-xs">File Type</Label>
                <Select value={uploadFileType} onValueChange={setUploadFileType}>
                  <SelectTrigger data-testid="select-file-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FILE_TYPES.map(ft => (
                      <SelectItem key={ft.value} value={ft.value}>
                        {ft.label}{ft.required ? " (required)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground pb-1.5 flex-1">
                {FILE_TYPE_MAP[uploadFileType]?.description}
              </p>
            </div>

            {/* Drop zone */}
            <div
              className={`border-2 border-dashed rounded-md p-8 text-center cursor-pointer transition-colors
                ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-muted-foreground/60"}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
              data-testid="drop-zone-upload"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
                data-testid="input-file-upload"
              />
              {uploadMutation.isPending ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <RefreshCw className="h-8 w-8 animate-spin" />
                  <p className="text-sm font-medium">Uploading & staging rows…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Upload className="h-8 w-8 opacity-40" />
                  <p className="text-sm font-medium">Drop a CSV or Excel file here, or click to browse</p>
                  <p className="text-xs">Supports .csv, .xlsx, .xls — max 50 MB</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* File List */}
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No files uploaded yet. Add at least a Moves Master file to get started.
        </p>
      ) : (
        <div className="space-y-3">
          {files.map(file => (
            <FileCard
              key={file.id}
              file={file}
              jobId={job.id}
              isReadOnly={isReadOnly}
              onDelete={(id) => deleteMutation.mutate(id)}
              isDeleting={deleteMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── File Card ────────────────────────────────────────────────────────────────

function FileCard({
  file, jobId, isReadOnly, onDelete, isDeleting,
}: {
  file: ImportJobFile;
  jobId: string;
  isReadOnly: boolean;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const reprocessRef = useRef<HTMLInputElement>(null);

  const reprocessMutation = useMutation({
    mutationFn: (newFile: File) => {
      const form = new FormData();
      form.append("file", newFile);
      return fetch(`/api/corporate/moves-import/jobs/${jobId}/files/${file.id}/reprocess`, {
        method: "POST",
        body: form,
        credentials: "include",
      }).then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message ?? "Reprocess failed");
        return data;
      });
    },
    onSuccess: (data: any) => {
      toast({ title: "File reprocessed", description: `${data.stagedRows} rows re-staged.` });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/moves-import/jobs", jobId] });
    },
    onError: (err: Error) => toast({ title: "Reprocess failed", description: err.message, variant: "destructive" }),
  });

  const ftInfo = FILE_TYPE_MAP[file.fileType];
  const staged = file.stagedRows ?? 0;
  const valid = file.validRows ?? 0;
  const orphan = file.orphanRows ?? 0;
  const dup = file.duplicateRows ?? 0;
  const invalid = file.invalidRows ?? 0;
  const committed = file.committedRows ?? 0;
  const total = file.totalRows ?? staged;

  return (
    <Card data-testid={`file-card-${file.id}`}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <FileText className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-sm truncate">{file.sourceFileName}</p>
                <FileStatusBadge status={file.status} />
                <Badge variant="outline" className="text-xs">{ftInfo?.label ?? file.fileType}</Badge>
                {ftInfo?.required && <Badge className="bg-blue-50 text-blue-700 border-blue-200 border text-xs">Required</Badge>}
              </div>
              {file.detectedKeyColumn && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Key column detected: <code className="bg-muted px-1 rounded text-xs">{file.detectedKeyColumn}</code>
                </p>
              )}
            </div>
          </div>
          {!isReadOnly && (
            <div className="flex gap-1.5 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => reprocessRef.current?.click()}
                disabled={reprocessMutation.isPending}
                data-testid={`button-reprocess-${file.id}`}
                title="Re-upload this file"
              >
                {reprocessMutation.isPending
                  ? <RefreshCw className="h-4 w-4 animate-spin" />
                  : <RotateCcw className="h-4 w-4" />}
              </Button>
              <input
                ref={reprocessRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) reprocessMutation.mutate(f); }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDelete(file.id)}
                disabled={isDeleting}
                data-testid={`button-delete-file-${file.id}`}
                title="Remove file"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Row counts */}
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          {[
            { label: "Source rows", value: total, color: "" },
            { label: "Staged", value: staged, color: "text-blue-600 dark:text-blue-400" },
            { label: "Valid", value: valid, color: "text-green-600 dark:text-green-400" },
            { label: "Orphan", value: orphan, color: orphan > 0 ? "text-amber-600 dark:text-amber-400" : "" },
            { label: "Duplicate", value: dup, color: dup > 0 ? "text-amber-600 dark:text-amber-400" : "" },
            { label: "Invalid", value: invalid, color: invalid > 0 ? "text-red-600 dark:text-red-400" : "" },
            { label: "Committed", value: committed, color: committed > 0 ? "text-green-700 dark:text-green-300 font-semibold" : "" },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex flex-col">
              <span className="text-muted-foreground">{label}</span>
              <span className={`font-medium ${color}`}>{(value ?? 0).toLocaleString()}</span>
            </div>
          ))}
        </div>

        {file.notes && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-2 flex items-center gap-1">
            <AlertCircle className="h-3 w-3 shrink-0" />{file.notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Validation Tab ───────────────────────────────────────────────────────────

function ValidationTab({ job, issues, isReady }: { job: ImportJob; issues: ValidationIssue[]; isReady?: boolean }) {
  const notYetRun = !job.validationSummaryJson;
  const isActive = ["validating"].includes(job.status);

  if (isActive) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
      <RefreshCw className="h-8 w-8 animate-spin" />
      <p className="font-medium">Running validation…</p>
    </div>
  );

  if (notYetRun) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground text-center">
      <ShieldCheck className="h-10 w-10 opacity-30" />
      <div>
        <p className="font-medium">Validation has not been run yet</p>
        <p className="text-sm">Upload your files and click "Run Validation" to check readiness.</p>
      </div>
    </div>
  );

  const errors   = issues.filter(i => i.level === "error");
  const warnings = issues.filter(i => i.level === "warning");
  const infos    = issues.filter(i => i.level === "info");

  const iconFor = (level: string) => {
    if (level === "error")   return <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />;
    if (level === "warning") return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />;
    return <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />;
  };

  return (
    <div className="space-y-4">
      {/* Readiness Banner */}
      <div className={`flex items-center gap-3 p-4 rounded-md border ${isReady
        ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300"
        : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300"}`}
      >
        {isReady
          ? <CheckCircle2 className="h-5 w-5 shrink-0" />
          : <AlertCircle className="h-5 w-5 shrink-0" />}
        <div>
          <p className="font-medium text-sm">{isReady ? "Ready to process" : "Not ready — resolve errors before processing"}</p>
          <p className="text-xs mt-0.5">
            {errors.length} error{errors.length !== 1 ? "s" : ""}, {warnings.length} warning{warnings.length !== 1 ? "s" : ""}, {infos.length} info
          </p>
        </div>
      </div>

      {/* Issue List */}
      {issues.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-4">No issues found. All checks passed.</div>
      ) : (
        <div className="space-y-2">
          {[...errors, ...warnings, ...infos].map((issue, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 p-3 rounded-md border text-sm
                ${issue.level === "error"   ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900" :
                  issue.level === "warning" ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900" :
                                             "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900"}`}
            >
              {iconFor(issue.level)}
              <div className="flex-1">
                <p className={issue.level === "error" ? "text-red-800 dark:text-red-300" :
                              issue.level === "warning" ? "text-amber-800 dark:text-amber-300" :
                              "text-blue-800 dark:text-blue-300"}>{issue.message}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Code: {issue.code}</p>
              </div>
              {issue.count != null && (
                <Badge variant="outline" className="shrink-0 text-xs">{issue.count.toLocaleString()} rows</Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Reconciliation Tab ───────────────────────────────────────────────────────

function ReconciliationTab({ jobId }: { jobId: string }) {
  const { data: recon, isLoading } = useQuery<any>({
    queryKey: ["/api/corporate/moves-import/jobs", jobId, "reconciliation"],
    queryFn: () => fetch(`/api/corporate/moves-import/jobs/${jobId}/reconciliation`, { credentials: "include" }).then(r => r.json()),
  });

  if (isLoading) return (
    <div className="space-y-3">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );

  if (!recon) return <p className="text-sm text-muted-foreground text-center py-8">No reconciliation data available.</p>;

  const totals = recon.totals ?? {};
  const files: ReconciliationFile[] = recon.files ?? [];

  const commitPct = totals.sourceRows > 0 ? Math.round(totals.committed / totals.sourceRows * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Top-level summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Source Rows",  value: totals.sourceRows,  color: "" },
          { label: "Validated",    value: totals.validated,   color: "text-blue-600 dark:text-blue-400" },
          { label: "Committed",    value: totals.committed,   color: "text-green-600 dark:text-green-400" },
          { label: "Orphan",       value: totals.orphan,      color: "text-amber-600 dark:text-amber-400" },
          { label: "Duplicate",    value: totals.duplicate,   color: "text-amber-600 dark:text-amber-400" },
          { label: "Failed",       value: totals.failed,      color: "text-red-600 dark:text-red-400" },
          { label: "Still Staged", value: totals.staged,      color: "" },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="pt-3 pb-3 text-center">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold mt-0.5 ${color}`}>{(value ?? 0).toLocaleString()}</p>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="pt-3 pb-3 text-center">
            <p className="text-xs text-muted-foreground">Commit Rate</p>
            <p className="text-2xl font-bold mt-0.5 text-green-600 dark:text-green-400">{commitPct}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress bar */}
      {totals.sourceRows > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{totals.committed?.toLocaleString()} committed</span>
            <span>{totals.sourceRows?.toLocaleString()} total source rows</span>
          </div>
          <Progress value={commitPct} className="h-2" />
        </div>
      )}

      {/* Per-file breakdown */}
      {files.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Per-File Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium">File</th>
                    <th className="text-left px-3 py-2 font-medium">Type</th>
                    <th className="text-right px-3 py-2 font-medium">Source</th>
                    <th className="text-right px-3 py-2 font-medium">Validated</th>
                    <th className="text-right px-3 py-2 font-medium">Committed</th>
                    <th className="text-right px-3 py-2 font-medium">Orphan</th>
                    <th className="text-right px-3 py-2 font-medium">Dup</th>
                    <th className="text-right px-3 py-2 font-medium">Failed</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {files.map(f => (
                    <tr key={f.fileId} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 max-w-48 truncate text-xs" title={f.sourceFileName}>{f.sourceFileName}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{FILE_TYPE_MAP[f.fileType]?.label ?? f.fileType}</td>
                      <td className="px-3 py-2 text-right">{f.sourceRows.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-blue-600 dark:text-blue-400">{f.validated.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-green-600 dark:text-green-400 font-medium">{f.committed.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-amber-600 dark:text-amber-400">{f.orphan.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-amber-600 dark:text-amber-400">{f.duplicate.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-red-600 dark:text-red-400">{f.failed.toLocaleString()}</td>
                      <td className="px-3 py-2"><FileStatusBadge status={f.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
