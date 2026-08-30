import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  CheckCircle,
  Upload,
  FileSpreadsheet,
  ChevronRight,
  SkipForward,
  RefreshCw,
  ShieldCheck,
  XCircle,
  Info,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UploadResponse {
  batchId: string;
  fileName: string;
  totalRows: number;
  columnMapping: Record<string, string>;
  detectedFields: string[];
}

interface PreviewField {
  fieldKey: string;
  label: string;
  currentValue: string | null;
  importValue: string | null;
  willUpdate: boolean;
  skippedBlank: boolean;
}

interface PreviewRow {
  stagingRowId: string;
  rowIndex: number;
  email: string;
  driverFound: boolean;
  driverId: string | null;
  driverName: string | null;
  fields: PreviewField[];
  willProcess: boolean;
}

interface PreviewStats {
  total: number;
  matched: number;
  unmatched: number;
  willUpdate: number;
  fieldCounts: { fieldKey: string; label: string; updates: number }[];
}

interface PreviewResponse {
  batchId: string;
  stats: PreviewStats;
  preview: PreviewRow[];
}

interface CommitResponse {
  success: boolean;
  batchId: string;
  updatedDrivers: number;
  skippedNoMatch: number;
  skippedNoChanges: number;
  committedAt: string;
}

interface HistoryBatch {
  id: string;
  source_file_name: string;
  status: string;
  total_rows: number;
  processed_rows: number;
  created_by_username: string;
  committed_at: string | null;
  created_at: string;
  error_message: string | null;
}

// ─── Field label map ──────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  dateOfBirth:       "Date of Birth",
  hireDate:          "Hire Date",
  mvrDate:           "MVR Record Date",
  drugTestDate:      "Drug Test Date",
  dateCertified:     "Certified Date",
  licenseExpiration: "License Expiration",
  terminationDate:   "Termination Date",
  reactivationDate:  "Reactivation Date",
};

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ step, current }: { step: number; current: number }) {
  const done = current > step;
  const active = current === step;
  return (
    <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold
      ${done ? "bg-primary text-primary-foreground" : active ? "bg-primary/20 text-primary border border-primary" : "bg-muted text-muted-foreground"}`}>
      {done ? <CheckCircle className="h-4 w-4" /> : step}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DriverDateCorrectionImport() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResponse | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // History
  const { data: history, isLoading: historyLoading } = useQuery<HistoryBatch[]>({
    queryKey: ["/api/corporate/driver-date-correction/batches"],
    queryFn: () => fetch("/api/corporate/driver-date-correction/batches", { credentials: "include" }).then(r => r.json()),
    enabled: showHistory,
  });

  // Preview
  const { data: preview, isLoading: previewLoading } = useQuery<PreviewResponse>({
    queryKey: ["/api/corporate/driver-date-correction/preview", uploadResult?.batchId],
    queryFn: () => fetch(`/api/corporate/driver-date-correction/preview/${uploadResult!.batchId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!uploadResult?.batchId && step === 2,
    staleTime: 0,
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/corporate/driver-date-correction/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message);
      }
      return res.json() as Promise<UploadResponse>;
    },
    onSuccess: (data) => {
      setUploadResult(data);
      setStep(2);
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  // Commit mutation
  const commitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/corporate/driver-date-correction/commit/${uploadResult!.batchId}`, { confirm: true });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Commit failed" }));
        throw new Error(err.message);
      }
      return res.json() as Promise<CommitResponse>;
    },
    onSuccess: (data) => {
      setCommitResult(data);
      setStep(4);
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/driver-date-correction/batches"] });
    },
    onError: (err: Error) => {
      toast({ title: "Commit failed", description: err.message, variant: "destructive" });
    },
  });

  // File handling
  const handleFile = useCallback((file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext ?? "")) {
      toast({ title: "Invalid file type", description: "Please upload a CSV or Excel file.", variant: "destructive" });
      return;
    }
    uploadMutation.mutate(file);
  }, [uploadMutation, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const reset = () => {
    setStep(1);
    setUploadResult(null);
    setPreviewData(null);
    setCommitResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const stats = preview?.stats;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Driver Date Correction Import</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Bulk-correct date fields on existing driver records. Matches by email only — no new drivers created.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowHistory(v => !v)} data-testid="button-toggle-history">
            <RefreshCw className="h-4 w-4 mr-1.5" />
            {showHistory ? "Hide History" : "Import History"}
          </Button>
          {step > 1 && (
            <Button variant="outline" size="sm" onClick={reset} data-testid="button-start-over">
              Start Over
            </Button>
          )}
        </div>
      </div>

      {/* Safeguards notice */}
      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
        <CardContent className="flex items-start gap-3 pt-4 pb-4">
          <ShieldCheck className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-amber-800 dark:text-amber-300">Safeguards active</p>
            <ul className="text-amber-700 dark:text-amber-400 space-y-0.5 list-disc list-inside">
              <li>Blank values in the file will never overwrite existing data</li>
              <li>Matching is by email only — unmatched rows are skipped</li>
              <li>No new driver records will be created</li>
              <li>System fields (Created Date, First/Last Trip Date) are excluded</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* History */}
      {showHistory && (
        <Card data-testid="card-import-history">
          <CardHeader>
            <CardTitle className="text-base">Import History</CardTitle>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : !history?.length ? (
              <p className="text-sm text-muted-foreground">No correction imports found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Rows</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map(b => (
                    <TableRow key={b.id} data-testid={`row-history-${b.id}`}>
                      <TableCell className="text-sm font-medium">{b.source_file_name}</TableCell>
                      <TableCell>
                        <Badge variant={b.status === "committed" ? "default" : b.status === "failed" ? "destructive" : "secondary"}>
                          {b.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{b.total_rows}</TableCell>
                      <TableCell className="text-sm">{b.processed_rows ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{b.created_by_username}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {b.committed_at
                          ? new Date(b.committed_at).toLocaleDateString()
                          : new Date(b.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[
          { n: 1, label: "Upload" },
          { n: 2, label: "Preview" },
          { n: 3, label: "Confirm" },
          { n: 4, label: "Done" },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            <StepIndicator step={s.n} current={step} />
            <span className={`text-sm ${step === s.n ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
              {s.label}
            </span>
            {i < 3 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* ── STEP 1: Upload ── */}
      {step === 1 && (
        <Card data-testid="card-upload">
          <CardHeader>
            <CardTitle>Upload Correction File</CardTitle>
            <CardDescription>
              Upload a CSV or Excel file with an Email column plus any of the approved date fields.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Approved fields reference */}
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Approved date fields</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {Object.entries(FIELD_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-1.5 text-xs text-foreground">
                    <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                    {label}
                  </div>
                ))}
              </div>
              <Separator className="my-1" />
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Excluded fields (not imported)</p>
                {["Created Date", "First Trip Date", "Last Trip Date"].map(l => (
                  <div key={l} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <XCircle className="h-3 w-3 text-destructive shrink-0" />
                    {l}
                  </div>
                ))}
              </div>
            </div>

            {/* Drop zone */}
            <div
              data-testid="dropzone-upload"
              className={`border-2 border-dashed rounded-md p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors
                ${isDragging ? "border-primary bg-primary/5" : "border-border hover-elevate"}`}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium">Drop file here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">CSV, XLSX, XLS — max 10 MB</p>
              </div>
              {uploadMutation.isPending && (
                <p className="text-xs text-muted-foreground animate-pulse">Uploading and parsing...</p>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              data-testid="input-file-upload"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* ── STEP 2: Preview ── */}
      {step === 2 && (
        <Card data-testid="card-preview">
          <CardHeader>
            <CardTitle>Preview Changes</CardTitle>
            <CardDescription>
              Review what will be updated before committing. Blank values and unmatched emails are automatically skipped.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {previewLoading ? (
              <div className="text-sm text-muted-foreground animate-pulse py-8 text-center">Loading preview...</div>
            ) : preview ? (
              <>
                {/* Stats bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Total Rows", value: stats?.total ?? 0, testId: "stat-total" },
                    { label: "Matched", value: stats?.matched ?? 0, testId: "stat-matched", good: true },
                    { label: "Unmatched", value: stats?.unmatched ?? 0, testId: "stat-unmatched", warn: true },
                    { label: "Will Update", value: stats?.willUpdate ?? 0, testId: "stat-will-update", good: true },
                  ].map(s => (
                    <div key={s.label} className="rounded-md border bg-muted/30 p-3 text-center" data-testid={s.testId}>
                      <p className={`text-2xl font-bold ${s.good && s.value > 0 ? "text-green-600 dark:text-green-400" : s.warn && s.value > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                        {s.value}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Field update counts */}
                {stats?.fieldCounts && stats.fieldCounts.some(f => f.updates > 0) && (
                  <div className="rounded-md border bg-muted/30 p-3 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Field update counts</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {stats.fieldCounts.filter(f => f.updates > 0).map(f => (
                        <Badge key={f.fieldKey} variant="secondary" data-testid={`badge-field-count-${f.fieldKey}`}>
                          {f.label}: {f.updates}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Detected fields */}
                {uploadResult && (
                  <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5 shrink-0" />
                    <span>Detected columns:</span>
                    {uploadResult.detectedFields.map(k => (
                      <Badge key={k} variant="outline" className="text-xs">{FIELD_LABELS[k] ?? k}</Badge>
                    ))}
                  </div>
                )}

                {/* Per-row preview */}
                <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                  {preview.preview.map(row => (
                    <div
                      key={row.stagingRowId}
                      data-testid={`preview-row-${row.rowIndex}`}
                      className={`rounded-md border p-3 space-y-2 ${row.willProcess ? "border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/20" : "bg-muted/20"}`}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        {row.driverFound ? (
                          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive shrink-0" />
                        )}
                        <span className="text-sm font-medium">{row.driverName || row.email}</span>
                        <span className="text-xs text-muted-foreground">{row.email}</span>
                        {!row.driverFound && (
                          <Badge variant="destructive" className="text-xs">No match</Badge>
                        )}
                        {row.driverFound && !row.willProcess && (
                          <Badge variant="secondary" className="text-xs">
                            <SkipForward className="h-3 w-3 mr-1" />
                            All blank / no changes
                          </Badge>
                        )}
                        {row.willProcess && (
                          <Badge variant="default" className="text-xs">
                            {row.fields.filter(f => f.willUpdate).length} field{row.fields.filter(f => f.willUpdate).length !== 1 ? "s" : ""} will update
                          </Badge>
                        )}
                      </div>

                      {row.driverFound && row.fields.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-6">
                          {row.fields.map(field => (
                            <div key={field.fieldKey} className={`flex items-center gap-2 text-xs rounded px-2 py-1
                              ${field.willUpdate ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300" :
                                field.skippedBlank ? "text-muted-foreground" : "text-muted-foreground"}`}
                              data-testid={`field-preview-${row.rowIndex}-${field.fieldKey}`}
                            >
                              <span className="font-medium shrink-0">{field.label}:</span>
                              {field.skippedBlank ? (
                                <span className="italic">blank — skipped</span>
                              ) : field.willUpdate ? (
                                <>
                                  <span className="line-through opacity-60">{field.currentValue ?? "none"}</span>
                                  <ChevronRight className="h-3 w-3 shrink-0" />
                                  <span className="font-semibold">{field.importValue}</span>
                                </>
                              ) : (
                                <span>{field.currentValue ?? "—"} (unchanged)</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    onClick={() => setStep(3)}
                    disabled={(stats?.willUpdate ?? 0) === 0}
                    data-testid="button-proceed-to-confirm"
                  >
                    Proceed to Confirm
                    <ChevronRight className="h-4 w-4 ml-1.5" />
                  </Button>
                  {(stats?.willUpdate ?? 0) === 0 && (
                    <p className="text-xs text-muted-foreground">No updates to apply — all rows are blank or unmatched.</p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Preview data unavailable.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── STEP 3: Confirm ── */}
      {step === 3 && (
        <Card data-testid="card-confirm">
          <CardHeader>
            <CardTitle>Confirm Import</CardTitle>
            <CardDescription>
              This will write date corrections to the database. Review the summary below before confirming.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-semibold">{uploadResult?.fileName}</p>
                  <p className="text-xs text-muted-foreground">{uploadResult?.totalRows} total rows</p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Drivers that will be updated:</span>
                </div>
                <div className="font-semibold text-green-600 dark:text-green-400" data-testid="confirm-will-update">
                  {stats?.willUpdate ?? 0}
                </div>
                <div>
                  <span className="text-muted-foreground">Rows skipped (no email match):</span>
                </div>
                <div className="font-semibold" data-testid="confirm-unmatched">{stats?.unmatched ?? 0}</div>
                <div>
                  <span className="text-muted-foreground">Fields being corrected:</span>
                </div>
                <div className="font-semibold" data-testid="confirm-fields">
                  {uploadResult?.detectedFields.map(k => FIELD_LABELS[k] ?? k).join(", ")}
                </div>
              </div>
            </div>

            <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                This operation will directly update driver records in the database. It can be reviewed in the audit log but cannot be automatically reversed.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={() => commitMutation.mutate()}
                disabled={commitMutation.isPending}
                data-testid="button-confirm-commit"
              >
                {commitMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-1.5" />
                    Confirm and Apply
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={() => setStep(2)} disabled={commitMutation.isPending} data-testid="button-back-to-preview">
                Back to Preview
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 4: Done ── */}
      {step === 4 && commitResult && (
        <Card data-testid="card-results">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: "Drivers Updated", value: commitResult.updatedDrivers, good: true, testId: "result-updated" },
                { label: "Skipped (No Match)", value: commitResult.skippedNoMatch, testId: "result-no-match" },
                { label: "Skipped (Blank / No Change)", value: commitResult.skippedNoChanges, testId: "result-no-change" },
              ].map(s => (
                <div key={s.label} className="rounded-md border bg-muted/30 p-3 text-center" data-testid={s.testId}>
                  <p className={`text-2xl font-bold ${s.good && s.value > 0 ? "text-green-600 dark:text-green-400" : ""}`}>
                    {s.value}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Applied at {new Date(commitResult.committedAt).toLocaleString()}. All updates have been recorded in the audit log.
            </p>

            <Button onClick={reset} variant="outline" data-testid="button-start-another">
              <Upload className="h-4 w-4 mr-1.5" />
              Start Another Import
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
