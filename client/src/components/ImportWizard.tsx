import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImportAccessGuard } from "@/components/ImportAccessGuard";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Upload, FileSpreadsheet, Download, ArrowRight, ArrowLeft,
  CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw,
  History, FileWarning, PackageOpen, Ban,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type WizardStep = "upload" | "map" | "validate" | "commit" | "results";

const STEPS: { key: WizardStep; label: string; number: number }[] = [
  { key: "upload",   label: "Upload",   number: 1 },
  { key: "map",      label: "Map Fields", number: 2 },
  { key: "validate", label: "Validate",   number: 3 },
  { key: "commit",   label: "Commit",     number: 4 },
  { key: "results",  label: "Results",    number: 5 },
];

interface FieldDef {
  key: string;
  label: string;
  group: string;
  type: string;
  required: boolean;
  aliases: string[];
}

interface MatchKeyOption {
  key: string;
  label: string;
  description: string;
}

interface StagingRow {
  id: string;
  rowIndex: number;
  rawJson: Record<string, any>;
  mappedJson: Record<string, any> | null;
  validationErrors: string[] | null;
  validationWarnings: string[] | null;
  matchAction: "create" | "update" | "skip" | "error" | null;
  status: string;
}

interface ImportBatch {
  id: string;
  sourceFileName: string;
  status: string;
  totalRows: number;
  validRows: number | null;
  errorRows: number | null;
  warningRows: number | null;
  createdRows: number | null;
  updatedRows: number | null;
  failedRows: number | null;
  skippedRows: number | null;
  processedRows: number | null;
  matchKey: string | null;
  createdByUsername: string;
  createdAt: string;
  committedAt: string | null;
  validatedAt: string | null;
  startedAt: string | null;
  errorMessage: string | null;
  rolledBackAt: string | null;
  initialLoadMode: boolean;
  fileHeaders: string[] | null;
  columnMapping: Record<string, string> | null;
}

export interface ImportRowPreviewColumn {
  key: string;
  label: string;
  render?: (row: StagingRow) => React.ReactNode;
}

export interface ImportModuleConfig {
  moduleType: string;
  moduleName: string;
  apiPrefix: string;
  backHref: string;
  description?: string;
  requiredMappings?: string[];
  defaultMatchKey?: string;
  rowPreviewColumns: ImportRowPreviewColumn[];
  invalidateOnCommit?: string[];
  showImportModeSelector?: boolean;
  preflight?: boolean;
}

interface Props {
  moduleConfig: ImportModuleConfig;
}

export function ImportWizard({ moduleConfig }: Props) {
  const { apiPrefix, moduleName, moduleType, backHref, description, requiredMappings = [], defaultMatchKey = "", rowPreviewColumns, invalidateOnCommit = [], showImportModeSelector = false } = moduleConfig;
  const { toast } = useToast();

  const [step, setStep] = useState<WizardStep>("upload");
  const [isCommitReview, setIsCommitReview] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<{ fileName: string; totalRows: number; headers: string[]; sampleRows: Record<string, any>[]; autoMapping: Record<string, string> } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [matchKey, setMatchKey] = useState(defaultMatchKey);
  const [importMode, setImportMode] = useState<"create_update" | "update_only">("create_update");
  const [previewRows, setPreviewRows] = useState<StagingRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingPhase, setProcessingPhase] = useState<"validating" | "committing" | null>(null);
  const [isPreflightChecking, setIsPreflightChecking] = useState(false);
  const [validateStats, setValidateStats] = useState<{ total: number; valid: number; errors: number; warnings: number; skipped: number; willCreate: number; willUpdate: number } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [commitStats, setCommitStats] = useState<{ created: number; updated: number; failed: number; total: number } | null>(null);
  const [rowFilter, setRowFilter] = useState<"all" | "error" | "warning" | "valid" | "skipped">("all");
  const [productionConfirmPhrase, setProductionConfirmPhrase] = useState("");
  const [productionChecked, setProductionChecked] = useState(false);
  const [initialLoadMode, setInitialLoadMode] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [wasCancelled, setWasCancelled] = useState(false);

  // Preflight state
  type PreflightResult = {
    creates: number; updates: number; skips: number; errors: number; conflicts: number;
    totalDriversInDb: number; impactPercent: number;
    blockers: string[]; advisories: string[];
    safe: boolean; hoursStale: number; validatedAt: string | null;
  };
  const [preflightResult, setPreflightResult]       = useState<PreflightResult | null>(null);
  const [preflightLoading, setPreflightLoading]     = useState(false);
  const [preflightError, setPreflightError]         = useState<string | null>(null);
  const [advisoryAcknowledged, setAdvisoryAcknowledged] = useState(false);

  const isProduction = window.location.hostname.endsWith(".replit.app");

  const { data: fieldsData } = useQuery<{ fields: FieldDef[]; matchKeys: MatchKeyOption[] }>({
    queryKey: [`${apiPrefix}/fields`],
  });

  const { data: batches = [] } = useQuery<ImportBatch[]>({
    queryKey: [`${apiPrefix}/batches/list`],
    refetchInterval: 5000,
  });

  const { data: liveBatch } = useQuery<ImportBatch>({
    queryKey: [apiPrefix, batchId, "live"],
    enabled: !!batchId && isProcessing,
    refetchInterval: isProcessing ? 2000 : false,
    queryFn: async () => {
      const res = await fetch(`${apiPrefix}/${batchId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch batch status");
      return res.json();
    },
  });

  const fetchPreviewRows = useCallback(async (bid: string) => {
    const res = await fetch(`${apiPrefix}/${bid}/rows?limit=100`, { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    const rows: StagingRow[] = Array.isArray(data) ? data : (data.rows ?? []);
    setPreviewRows(rows);
  }, [apiPrefix]);

  // Restore uploadResult + mapping when navigating back to map step without a fresh upload
  useEffect(() => {
    if (step !== "map" || uploadResult || !batchId) return;
    fetch(`${apiPrefix}/${batchId}`, { credentials: "include" })
      .then(r => r.json())
      .then((batch: ImportBatch) => {
        const headers = batch.fileHeaders || [];
        if (!headers.length) return;
        setUploadResult({
          fileName: batch.sourceFileName,
          totalRows: batch.totalRows,
          headers,
          sampleRows: [],
          autoMapping: batch.columnMapping || {},
        });
        if (Object.keys(mapping).length === 0 && batch.columnMapping) {
          setMapping(batch.columnMapping);
        }
        if (!matchKey && batch.matchKey) {
          setMatchKey(batch.matchKey);
        }
      })
      .catch(() => {});
  }, [step, uploadResult, batchId]);

  useEffect(() => {
    if (isProcessing || batchId) return;
    const inProgress = batches.find(b => b.status === "validating" || b.status === "committing");
    if (inProgress) {
      setBatchId(inProgress.id);
      setIsProcessing(true);
      setProcessingPhase(inProgress.status === "committing" ? "committing" : "validating");
      setStep(inProgress.status === "committing" ? "commit" : "validate");
      toast({ title: "Import in progress", description: `Resuming "${inProgress.sourceFileName}"` });
      return;
    }
    // Do NOT auto-restore validated batches — user should start fresh at upload.
    // Previously validated batches are accessible via Import History.
  }, [batches]);

  useEffect(() => {
    if (!liveBatch || !isProcessing) return;
    if (liveBatch.status === "validated") {
      setValidateStats({ total: liveBatch.totalRows, valid: liveBatch.validRows ?? 0, errors: liveBatch.errorRows ?? 0, warnings: liveBatch.warningRows ?? 0, skipped: liveBatch.skippedRows ?? 0, willCreate: liveBatch.createdRows ?? 0, willUpdate: liveBatch.updatedRows ?? 0 });
      setIsProcessing(false);
      setProcessingPhase(null);
      fetchPreviewRows(liveBatch.id).catch(() => {});
    } else if (liveBatch.status === "committed") {
      setCommitStats({ created: liveBatch.createdRows ?? 0, updated: liveBatch.updatedRows ?? 0, failed: liveBatch.failedRows ?? 0, total: liveBatch.totalRows });
      setIsProcessing(false);
      setProcessingPhase(null);
      setIsCommitReview(false);
      setStep("results");
      queryClient.invalidateQueries({ queryKey: [`${apiPrefix}/batches/list`] });
      for (const key of invalidateOnCommit) queryClient.invalidateQueries({ queryKey: [key] });
    } else if (liveBatch.status === "cancelled") {
      setCommitStats({ created: liveBatch.createdRows ?? 0, updated: liveBatch.updatedRows ?? 0, failed: liveBatch.failedRows ?? 0, total: liveBatch.totalRows });
      setIsProcessing(false);
      setProcessingPhase(null);
      setIsCommitReview(false);
      setWasCancelled(true);
      setStep("results");
      queryClient.invalidateQueries({ queryKey: [`${apiPrefix}/batches/list`] });
    } else if (liveBatch.status === "failed") {
      const wasValidating = processingPhase === "validating";
      setIsProcessing(false);
      setProcessingPhase(null);
      if (wasValidating) {
        setValidateStats(null);
        const errMsg = liveBatch.errorMessage || "The validation job encountered an unexpected error. Please try again.";
        setValidationError(errMsg);
        toast({ title: "Validation failed", description: errMsg, variant: "destructive" });
      } else {
        toast({ title: "Import failed", description: liveBatch.errorMessage || "The job encountered an error. Please try again.", variant: "destructive" });
      }
    } else if (liveBatch.status === "mapped" || liveBatch.status === "uploaded") {
      // Job was interrupted (e.g. server restart) and the batch was reset back to a pre-job state.
      // Clear the spinner so the user can re-trigger.
      setIsProcessing(false);
      setProcessingPhase(null);
      setValidateStats(null);
      setValidationError(null);
      toast({ title: "Job interrupted", description: "The job was interrupted by a server restart. Click Validate to try again.", variant: "destructive" });
    }
  }, [liveBatch?.status]);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const res = await fetch(`${apiPrefix}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "X-File-Name": file.name },
        credentials: "include",
        body: file,
      });
      if (!res.ok) { const e = await res.json().catch(() => ({ message: res.statusText })); throw new Error(e.message || "Upload failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      setUploadResult(data);
      setBatchId(data.batchId);
      setMapping(data.autoMapping || {});
      if (!matchKey && fieldsData?.matchKeys?.[0]) setMatchKey(fieldsData.matchKeys[0].key);
      setStep("map");
      toast({ title: "File uploaded", description: `${data.totalRows} rows found in ${data.fileName}` });
    },
    onError: (err: Error) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  const mapMutation = useMutation({
    mutationFn: async () => {
      setValidateStats(null);
      setPreviewRows([]);
      const res = await apiRequest("POST", `${apiPrefix}/${batchId}/map`, { mapping, matchKey, updateMode: importMode === "update_only" ? "update_only" : "overwrite_mapped" });
      return res.json();
    },
    onSuccess: () => {
      setStep("validate");
      validateMutation.mutate();
    },
    onError: (err: Error) => toast({ title: "Mapping failed", description: err.message, variant: "destructive" }),
  });

  const validateMutation = useMutation({
    mutationFn: async () => {
      setValidationError(null);
      const res = await apiRequest("POST", `${apiPrefix}/${batchId}/validate`, { initialLoadMode });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.status === "validating") {
        setIsProcessing(true);
        setProcessingPhase("validating");
      }
    },
    onError: (err: Error) => {
      const msg = err.message || "An unexpected error occurred during validation.";
      setValidationError(msg);
      toast({ title: "Validation failed", description: msg, variant: "destructive" });
    },
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${apiPrefix}/${batchId}/commit`, {
        productionConfirmed: isProduction && productionChecked,
        productionConfirmPhrase: isProduction ? productionConfirmPhrase : undefined,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.status === "committing") {
        setIsProcessing(true);
        setProcessingPhase("committing");
      } else {
        setIsCommitReview(false);
        setCommitStats(data.stats || data);
        setStep("results");
        queryClient.invalidateQueries({ queryKey: [`${apiPrefix}/batches/list`] });
        for (const key of invalidateOnCommit) queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
    onError: (err: Error) => {
      const msg = err.message || "";
      const j = msg.indexOf("{");
      let display = msg;
      if (j !== -1) { try { display = JSON.parse(msg.slice(j)).message || msg; } catch (_) {} }
      toast({ title: "Commit failed", description: display, variant: "destructive" });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async (bid: string) => {
      const res = await apiRequest("POST", `${apiPrefix}/${bid}/rollback`);
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        const raw = await res.text();
        console.error("[ImportWizard] Rollback: server returned non-JSON response:", raw.slice(0, 500));
        throw new Error("Server returned an unexpected response. Please check the server logs and try again.");
      }
      return res.json() as Promise<{ ok: boolean; message?: string; driversDeactivated?: number; updateRowsNotReverted?: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`${apiPrefix}/batches/list`] });
      toast({
        title: "Rollback complete",
        description: data?.message || "Import batch has been rolled back.",
      });
    },
    onError: (err: Error) => {
      let description = err.message;
      try {
        const match = description.match(/^\d+: (.+)$/s);
        if (match) {
          const parsed = JSON.parse(match[1]);
          if (parsed?.message) description = parsed.message;
        }
      } catch (_) {}
      toast({ title: "Rollback failed", description, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (bid: string) => {
      const res = await apiRequest("POST", `${apiPrefix}/${bid}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Cancelling import", description: "The import will stop after the current chunk completes." });
    },
    onError: (err: Error) => toast({ title: "Cancel failed", description: err.message, variant: "destructive" }),
  });

  const handleFileSelect = useCallback((file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext || "")) {
      toast({ title: "Invalid file type", description: "Please upload a CSV or XLSX file", variant: "destructive" });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 25MB", variant: "destructive" });
      return;
    }
    uploadMutation.mutate(file);
  }, [uploadMutation, toast]);

  const handleGoToCommit = async () => {
    if (!batchId || isPreflightChecking) return;
    setIsPreflightChecking(true);
    try {
      const res = await fetch(`${apiPrefix}/${batchId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not verify batch status");
      const b: ImportBatch = await res.json();
      if (b.status === "validated") {
        // Enter commit review
        setPreflightResult(null);
        setPreflightError(null);
        setAdvisoryAcknowledged(false);
        setIsCommitReview(true);

        // Run preflight if this module has it enabled
        if (moduleConfig.preflight) {
          setPreflightLoading(true);
          try {
            const pfRes = await fetch(`${apiPrefix}/${batchId}/preflight`, { credentials: "include" });
            if (pfRes.ok) {
              setPreflightResult(await pfRes.json());
            } else {
              setPreflightError("Pre-commit check failed. You may still proceed with caution.");
            }
          } catch {
            setPreflightError("Pre-commit check failed. You may still proceed with caution.");
          } finally {
            setPreflightLoading(false);
          }
        }
      } else if (b.status === "validating" || b.status === "committing") {
        toast({ title: "Job in progress", description: "Validation is still running. Please wait." });
      } else {
        setValidateStats(null);
        toast({ title: "Re-validation required", description: `Batch state is "${b.status}". Re-running validation.`, variant: "destructive" });
        validateMutation.mutate();
      }
    } catch {
      toast({ title: "Error", description: "Could not verify batch status.", variant: "destructive" });
    } finally {
      setIsPreflightChecking(false);
    }
  };

  const handleReset = () => {
    setStep("upload");
    setIsCommitReview(false);
    setBatchId(null);
    setUploadResult(null);
    setMapping({});
    setMatchKey(defaultMatchKey);
    setImportMode("create_update");
    setValidateStats(null);
    setCommitStats(null);
    setPreviewRows([]);
    setProductionConfirmPhrase("");
    setProductionChecked(false);
    setInitialLoadMode(false);
    setWasCancelled(false);
    setPreflightResult(null);
    setPreflightError(null);
    setPreflightLoading(false);
    setAdvisoryAcknowledged(false);
  };

  const displayedStep: WizardStep = (() => {
    const bs = liveBatch?.status;
    if (bs === "committed" || bs === "cancelled") return "results";
    if (bs === "committing" || bs === "cancelling" || isCommitReview) return "commit";
    return step;
  })();

  const currentStepIdx = STEPS.findIndex(s => s.key === displayedStep);
  const fields = fieldsData?.fields || [];
  const matchKeys = fieldsData?.matchKeys || [];
  const mappedFieldKeys = new Set(Object.values(mapping));
  const requiredsMapped = initialLoadMode || importMode === "update_only" || requiredMappings.every(k => mappedFieldKeys.has(k));

  const filteredRows = rowFilter === "all" ? previewRows
    : rowFilter === "error" ? previewRows.filter(r => r.status === "error")
    : rowFilter === "warning" ? previewRows.filter(r => (r.validationWarnings?.length ?? 0) > 0 && r.status !== "error")
    : rowFilter === "skipped" ? previewRows.filter(r => r.status === "skipped")
    : previewRows.filter(r => r.status === "valid");

  return (
    <ImportAccessGuard module={moduleType}>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">{moduleName} Mass Import</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {description || `Upload a CSV or XLSX file to create or update ${moduleName.toLowerCase()} records in bulk`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(batchId || step !== "upload") && displayedStep !== "results" && liveBatch?.status !== "committing" && liveBatch?.status !== "cancelling" && (
              <Button variant="outline" size="sm" onClick={handleReset} data-testid="button-start-over">
                <XCircle className="h-4 w-4 mr-1" />
                Start Over
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)} data-testid="button-toggle-history">
              <History className="h-4 w-4 mr-1" />
              {showHistory ? "Hide History" : "Import History"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.open(`${apiPrefix}/template/download`, "_blank")} data-testid="button-download-template">
              <Download className="h-4 w-4 mr-1" />
              Download Template
            </Button>
          </div>
        </div>

        {showHistory && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-lg">Import History</CardTitle>
              <p className="text-xs text-muted-foreground">Last 50 imports</p>
            </CardHeader>
            <CardContent>
              {batches.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="text-no-history">No imports yet</p>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 pr-3 font-medium">File</th>
                        <th className="pb-2 pr-3 font-medium">Status</th>
                        <th className="pb-2 pr-3 font-medium text-right">Total</th>
                        <th className="pb-2 pr-3 font-medium text-right">Created</th>
                        <th className="pb-2 pr-3 font-medium text-right">Updated</th>
                        <th className="pb-2 pr-3 font-medium text-right">Failed</th>
                        <th className="pb-2 pr-3 font-medium">By</th>
                        <th className="pb-2 pr-3 font-medium">Completed</th>
                        <th className="pb-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batches.map((b) => {
                        const isInProgress = b.status === "validating" || b.status === "committing" || b.status === "cancelling";
                        const isValidated = b.status === "validated";
                        const isFailed = b.status === "failed";
                        const isCommitted = b.status === "committed";
                        const isCancelled = b.status === "cancelled";
                        const isCancelling = b.status === "cancelling";
                        const hasErrors = (b.failedRows ?? 0) > 0;
                        const isCurrentBatch = b.id === batchId;
                        const progressPct = b.totalRows > 0 ? Math.round(((b.processedRows ?? 0) / b.totalRows) * 100) : 0;
                        const canRollback = isCommitted && !b.rolledBackAt && b.committedAt
                          && (Date.now() - new Date(b.committedAt).getTime()) < 86400000;

                        return (
                          <tr key={b.id} className={`border-b ${isCurrentBatch ? "bg-muted/30" : ""}`} data-testid={`row-batch-${b.id}`}>
                            <td className="py-2 pr-3 max-w-[180px]">
                              <span className="block truncate text-xs font-medium" title={b.sourceFileName}>{b.sourceFileName}</span>
                              <span className="text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleDateString()}</span>
                            </td>
                            <td className="py-2 pr-3">
                              <div className="flex flex-col gap-1">
                                <Badge
                                  variant={isCommitted ? "default" : isFailed ? "destructive" : "secondary"}
                                  className={`${isInProgress ? "animate-pulse" : ""} ${isCancelled ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700" : ""} ${isCancelling ? "bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 animate-pulse" : ""}`}
                                >
                                  {(isInProgress && !isCancelling) && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                                  {isCancelling && <Ban className="h-3 w-3 mr-1" />}
                                  {isCancelled && <Ban className="h-3 w-3 mr-1" />}
                                  {b.status}
                                </Badge>
                                {isInProgress && b.totalRows > 0 && (
                                  <div className="w-24">
                                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                                      <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progressPct}%` }} />
                                    </div>
                                    <span className="text-xs text-muted-foreground">{b.processedRows ?? 0}/{b.totalRows}</span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="py-2 pr-3 text-right">{b.totalRows}</td>
                            <td className="py-2 pr-3 text-right">{(isCommitted || isCancelled) ? <span className="text-green-600 dark:text-green-400 font-medium">{b.createdRows ?? 0}</span> : "-"}</td>
                            <td className="py-2 pr-3 text-right">{(isCommitted || isCancelled) ? <span className="text-blue-600 dark:text-blue-400 font-medium">{b.updatedRows ?? 0}</span> : "-"}</td>
                            <td className="py-2 pr-3 text-right">{(isCommitted || isCancelled) ? (hasErrors ? <span className="text-destructive font-medium">{b.failedRows}</span> : <span className="text-muted-foreground">0</span>) : "-"}</td>
                            <td className="py-2 pr-3 text-xs text-muted-foreground">{b.createdByUsername}</td>
                            <td className="py-2 pr-3 text-xs text-muted-foreground">
                              {b.committedAt ? new Date(b.committedAt).toLocaleString()
                                : b.validatedAt ? `Validated ${new Date(b.validatedAt).toLocaleString()}`
                                : b.startedAt ? `Started ${new Date(b.startedAt).toLocaleTimeString()}`
                                : "—"}
                            </td>
                            <td className="py-2">
                              <div className="flex items-center gap-1 flex-wrap">
                                {(b.status === "mapped" || b.status === "uploaded") && !isCurrentBatch && (
                                  <Button size="sm" variant="outline" onClick={() => {
                                    setBatchId(b.id);
                                    setUploadResult({
                                      fileName: b.sourceFileName,
                                      totalRows: b.totalRows,
                                      headers: b.fileHeaders || [],
                                      sampleRows: [],
                                      autoMapping: b.columnMapping || {},
                                    });
                                    setMapping(b.columnMapping || {});
                                    setMatchKey(b.matchKey || defaultMatchKey);
                                    setInitialLoadMode(b.initialLoadMode ?? false);
                                    setStep("map");
                                    setShowHistory(false);
                                  }} data-testid={`button-continue-batch-${b.id}`}>
                                    <ArrowRight className="h-3 w-3 mr-1" /> Continue
                                  </Button>
                                )}
                                {isInProgress && !isCurrentBatch && !isCancelling && (
                                  <Button size="sm" variant="outline" onClick={() => { setBatchId(b.id); setIsProcessing(true); setProcessingPhase(b.status === "committing" ? "committing" : "validating"); setStep(b.status === "committing" ? "commit" : "validate"); setShowHistory(false); }} data-testid={`button-resume-batch-${b.id}`}>
                                    <RefreshCw className="h-3 w-3 mr-1" /> Resume
                                  </Button>
                                )}
                                {isValidated && !isCurrentBatch && (
                                  <Button size="sm" variant="outline" onClick={() => { setBatchId(b.id); setValidateStats({ total: b.totalRows, valid: b.validRows ?? 0, errors: b.errorRows ?? 0, warnings: b.warningRows ?? 0, skipped: b.skippedRows ?? 0, willCreate: b.createdRows ?? 0, willUpdate: b.updatedRows ?? 0 }); setStep("validate"); setShowHistory(false); fetchPreviewRows(b.id).catch(() => {}); }} data-testid={`button-resume-validated-${b.id}`}>
                                    <ArrowRight className="h-3 w-3 mr-1" /> Resume
                                  </Button>
                                )}
                                {isCommitted && hasErrors && (
                                  <Button size="sm" variant="outline" onClick={() => window.open(`${apiPrefix}/${b.id}/export-errors`, "_blank")} data-testid={`button-download-errors-${b.id}`}>
                                    <Download className="h-3 w-3 mr-1" /> Errors
                                  </Button>
                                )}
                                {canRollback && (
                                  <Button size="sm" variant="outline" onClick={() => rollbackMutation.mutate(b.id)} disabled={rollbackMutation.isPending} data-testid={`button-rollback-${b.id}`}>
                                    <RefreshCw className="h-3 w-3 mr-1" /> Rollback
                                  </Button>
                                )}
                                {isFailed && b.errorMessage && (
                                  <span className="text-xs text-destructive max-w-[160px] truncate" title={b.errorMessage}>{b.errorMessage}</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex items-center gap-1" data-testid="stepper">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                i === currentStepIdx ? "bg-primary text-primary-foreground"
                : i < currentStepIdx ? "bg-muted text-muted-foreground"
                : "bg-muted text-muted-foreground opacity-40"
              }`}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs border border-current">
                  {i < currentStepIdx ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.number}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {displayedStep === "upload" && (
          <Card>
            <CardHeader>
              <CardTitle>Upload File</CardTitle>
              <CardDescription>Upload a CSV or XLSX file containing {moduleName.toLowerCase()} data. Maximum 20,000 rows per import.</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
                onClick={() => document.getElementById(`file-input-${moduleType}`)?.click()}
                data-testid="dropzone"
              >
                {uploadMutation.isPending ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Parsing file...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="h-10 w-10 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Drop your file here or click to browse</p>
                      <p className="text-sm text-muted-foreground mt-1">Supports .csv, .xlsx, .xls (max 25MB)</p>
                    </div>
                  </div>
                )}
                <input
                  id={`file-input-${moduleType}`}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ""; }}
                  data-testid="input-file"
                />
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <FileSpreadsheet className="h-4 w-4" />
                <span>Need a template?</span>
                <Button variant="ghost" size="sm" className="px-1 h-auto underline" onClick={() => window.open(`${apiPrefix}/template/download`, "_blank")} data-testid="button-template-inline">
                  Download the import template
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {displayedStep === "map" && !uploadResult && batchId && (
          <Card>
            <CardContent className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading mapping...</span>
            </CardContent>
          </Card>
        )}

        {displayedStep === "map" && uploadResult && (
          <Card>
            <CardHeader>
              <CardTitle>Map Fields</CardTitle>
              <CardDescription>
                Map columns from your file to {moduleName.toLowerCase()} fields. {Object.keys(mapping).length} of {uploadResult.headers.length} columns mapped automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {matchKeys.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Match Existing {moduleName} By</label>
                  <Select value={matchKey} onValueChange={setMatchKey}>
                    <SelectTrigger className="w-full max-w-sm" data-testid="select-match-key">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {matchKeys.map(mk => (
                        <SelectItem key={mk.key} value={mk.key}>{mk.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    When a match is found, the existing record will be updated instead of creating a new one
                  </p>
                </div>
              )}

              {showImportModeSelector && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Import Mode</label>
                  <div className="flex flex-col gap-2">
                    <label className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${importMode === "create_update" ? "border-primary bg-primary/5" : "border-border"}`}>
                      <input
                        type="radio"
                        name="importMode"
                        value="create_update"
                        checked={importMode === "create_update"}
                        onChange={() => setImportMode("create_update")}
                        className="mt-0.5"
                        data-testid="radio-import-mode-create-update"
                      />
                      <div>
                        <div className="text-sm font-medium">Create / Update</div>
                        <div className="text-xs text-muted-foreground">Matched drivers are updated. Unmatched rows create new driver records.</div>
                      </div>
                    </label>
                    <label className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${importMode === "update_only" ? "border-primary bg-primary/5" : "border-border"}`}>
                      <input
                        type="radio"
                        name="importMode"
                        value="update_only"
                        checked={importMode === "update_only"}
                        onChange={() => setImportMode("update_only")}
                        className="mt-0.5"
                        data-testid="radio-import-mode-update-only"
                      />
                      <div>
                        <div className="text-sm font-medium">Update Existing Only</div>
                        <div className="text-xs text-muted-foreground">Only updates matched drivers. Unmatched rows are rejected with a <code className="text-[10px] bg-muted px-1 rounded">DRIVER_NOT_FOUND</code> error — no new drivers are created.</div>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="px-3 py-2 text-left font-medium w-1/3">File Column</th>
                      <th className="px-3 py-2 text-left font-medium w-1/3">Maps To</th>
                      <th className="px-3 py-2 text-left font-medium w-1/3">Sample Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadResult.headers.map((header) => (
                      <tr key={header} className="border-b" data-testid={`row-mapping-${header}`}>
                        <td className="px-3 py-2 font-mono text-xs">{header}</td>
                        <td className="px-3 py-2">
                          <Select
                            value={mapping[header] || "__skip__"}
                            onValueChange={(val) => setMapping(prev => {
                              const next = { ...prev };
                              if (val === "__skip__") delete next[header]; else next[header] = val;
                              return next;
                            })}
                          >
                            <SelectTrigger className="h-8 text-xs" data-testid={`select-mapping-${header}`}>
                              <SelectValue placeholder="Skip this column" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__skip__"><span className="text-muted-foreground">-- Skip --</span></SelectItem>
                              {(() => {
                                const groups: Record<string, typeof fields> = {};
                                fields.forEach(f => { const g = f.group || "Other"; if (!groups[g]) groups[g] = []; groups[g].push(f); });
                                return Object.entries(groups).map(([group, gf]) => (
                                  <div key={group}>
                                    <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{group}</div>
                                    {gf.map(f => (
                                      <SelectItem key={f.key} value={f.key} disabled={mappedFieldKeys.has(f.key) && mapping[header] !== f.key}>
                                        {f.label}{f.required ? " *" : ""}
                                      </SelectItem>
                                    ))}
                                  </div>
                                ));
                              })()}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[200px]">
                          {uploadResult.sampleRows[0]?.[header] ?? ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 flex items-start gap-3">
                <div className="flex items-center gap-2 pt-0.5">
                  <Switch
                    id="initial-load-mode"
                    checked={initialLoadMode}
                    onCheckedChange={setInitialLoadMode}
                    data-testid="switch-initial-load-mode"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <Label htmlFor="initial-load-mode" className="text-sm font-medium cursor-pointer">
                    Initial Load Mode
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    When enabled, missing required fields and unrecognized picklist values become warnings instead of errors — allowing historical data to be imported with minimal fields and completed later.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2">
                <Button variant="outline" onClick={handleReset} data-testid="button-back-upload">
                  <ArrowLeft className="h-4 w-4 mr-1" /> Start Over
                </Button>
                <Button
                  onClick={() => mapMutation.mutate()}
                  disabled={mapMutation.isPending || !requiredsMapped}
                  data-testid="button-validate"
                >
                  {mapMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-1" />}
                  Validate Data
                </Button>
              </div>
              {requiredMappings.length > 0 && !initialLoadMode && !requiredsMapped && (
                <p className="text-sm text-destructive flex items-center gap-1" data-testid="text-required-warning">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Required fields must be mapped: {requiredMappings.map(k => fields.find(f => f.key === k)?.label || k).join(", ")}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {displayedStep === "validate" && (
          <Card>
            <CardHeader>
              <CardTitle>Validate &amp; Preview</CardTitle>
              <CardDescription>Review validation results before committing the import</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {(validateMutation.isPending || (isProcessing && processingPhase === "validating")) ? (
                <div className="flex flex-col items-center gap-4 py-10">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <div className="text-center space-y-1">
                    <p className="text-sm font-medium">Validating your import file...</p>
                    {liveBatch && (liveBatch.processedRows ?? 0) > 0 ? (
                      <p className="text-xs text-muted-foreground">{(liveBatch.processedRows ?? 0).toLocaleString()} of {liveBatch.totalRows.toLocaleString()} rows processed</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Building lookup index, this may take a moment...</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">You can safely stay on this page.</p>
                  </div>
                  {liveBatch && liveBatch.totalRows > 0 && (liveBatch.processedRows ?? 0) > 0 && (
                    <div className="w-full max-w-sm">
                      <div className="w-full bg-muted rounded-full h-2">
                        <div className="bg-primary h-2 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.round(((liveBatch.processedRows ?? 0) / liveBatch.totalRows) * 100))}%` }} />
                      </div>
                      <p className="text-xs text-muted-foreground text-right mt-1">{Math.min(100, Math.round(((liveBatch.processedRows ?? 0) / liveBatch.totalRows) * 100))}%</p>
                    </div>
                  )}
                </div>
              ) : validateStats ? (
                <>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20" data-testid="banner-validated">
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                    <p className="text-sm font-medium text-green-700 dark:text-green-300">Validation complete — ready to review</p>
                  </div>

                  {(liveBatch?.initialLoadMode || initialLoadMode) && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30" data-testid="banner-initial-load-mode">
                      <PackageOpen className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">Initial Load Mode active</p>
                        <p className="text-xs text-yellow-700/80 dark:text-yellow-300/80 mt-0.5">Missing required fields are flagged as warnings only — rows will still commit. Complete missing data via follow-on import or manual edit.</p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      { label: "Total Rows", value: validateStats.total, icon: FileSpreadsheet, color: "" },
                      { label: "Will Create", value: validateStats.willCreate, icon: CheckCircle2, color: "text-green-600 dark:text-green-400" },
                      { label: "Will Update", value: validateStats.willUpdate, icon: RefreshCw, color: "text-blue-600 dark:text-blue-400" },
                      ...(validateStats.skipped > 0 ? [{ label: "Skipped", value: validateStats.skipped, icon: AlertTriangle, color: "text-yellow-600 dark:text-yellow-400" }] : []),
                      { label: "Valid", value: validateStats.valid, icon: CheckCircle2, color: "text-green-600 dark:text-green-400" },
                      { label: "Warnings", value: validateStats.warnings, icon: AlertTriangle, color: "text-yellow-600 dark:text-yellow-400" },
                      { label: "Errors", value: validateStats.errors, icon: XCircle, color: "text-destructive" },
                    ].map(stat => (
                      <div key={stat.label} className="bg-muted/40 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <stat.icon className={`h-3.5 w-3.5 ${stat.color || "text-muted-foreground"}`} />
                          <span className="text-xs text-muted-foreground">{stat.label}</span>
                        </div>
                        <p className={`text-2xl font-bold ${stat.color}`}>{stat.value.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>

                  {previewRows.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">Preview</span>
                        {(["all", "valid", "warning", "skipped", "error"] as const).map(f => (
                          <Button key={f} size="sm" variant={rowFilter === f ? "default" : "outline"}
                            onClick={() => setRowFilter(f)} data-testid={`button-filter-${f}`}>
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                            {f === "error" && validateStats.errors > 0 && <Badge variant="destructive" className="ml-1 text-xs px-1">{validateStats.errors}</Badge>}
                            {f === "warning" && validateStats.warnings > 0 && <Badge variant="secondary" className="ml-1 text-xs px-1">{validateStats.warnings}</Badge>}
                            {f === "skipped" && validateStats.skipped > 0 && <Badge variant="secondary" className="ml-1 text-xs px-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">{validateStats.skipped}</Badge>}
                          </Button>
                        ))}
                        {validateStats.errors > 0 && (
                          <Button size="sm" variant="outline" onClick={() => window.open(`${apiPrefix}/${batchId}/export-errors`, "_blank")} data-testid="button-export-errors">
                            <Download className="h-4 w-4 mr-2" /> Download Error Report
                          </Button>
                        )}
                      </div>

                      <div className="border rounded-lg overflow-auto max-h-[400px]">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-background border-b">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-12">Row</th>
                              {rowPreviewColumns.map(col => (
                                <th key={col.key} className="px-3 py-2 text-left font-medium text-muted-foreground">{col.label}</th>
                              ))}
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Action</th>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Issues</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredRows.slice(0, 100).map(row => {
                              const mapped = row.mappedJson || {};
                              const errors = (row.validationErrors as string[]) || [];
                              const warnings = (row.validationWarnings as string[]) || [];
                              return (
                                <tr key={row.id} className={`border-b ${row.status === "error" ? "bg-destructive/5" : row.status === "skipped" ? "bg-muted/40 opacity-60" : warnings.length > 0 ? "bg-yellow-500/5" : ""}`} data-testid={`row-preview-${row.id}`}>
                                  <td className="px-3 py-2 text-muted-foreground">{row.rowIndex}</td>
                                  {rowPreviewColumns.map(col => (
                                    <td key={col.key} className="px-3 py-2">
                                      {col.render ? col.render(row) : <span className="truncate block max-w-[150px]">{(mapped as any)[col.key] ?? <span className="text-muted-foreground">—</span>}</span>}
                                    </td>
                                  ))}
                                  <td className="px-3 py-2">
                                    {row.matchAction === "create" && <Badge variant="outline" className="text-green-700 dark:text-green-400 border-green-300">Create</Badge>}
                                    {row.matchAction === "update" && <Badge variant="secondary">Update</Badge>}
                                    {row.matchAction === "error" && <Badge variant="destructive">Error</Badge>}
                                    {row.matchAction === "skip" && <Badge variant="secondary">Skip</Badge>}
                                  </td>
                                  <td className="px-3 py-2 text-xs">
                                    {errors.length > 0 && <div className="flex items-start gap-1"><XCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" /><span className="text-destructive">{errors[0]}</span></div>}
                                    {warnings.length > 0 && <div className="flex items-start gap-1 mt-0.5"><FileWarning className="h-3 w-3 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" /><span className="text-yellow-700 dark:text-yellow-300">{warnings[0]}</span></div>}
                                  </td>
                                </tr>
                              );
                            })}
                            {filteredRows.length > 100 && (
                              <tr><td colSpan={rowPreviewColumns.length + 3} className="px-3 py-2 text-xs text-muted-foreground text-center">Showing first 100 of {filteredRows.length} rows</td></tr>
                            )}
                            {filteredRows.length === 0 && (
                              <tr><td colSpan={rowPreviewColumns.length + 3} className="px-3 py-8 text-center text-muted-foreground">No rows match this filter</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <Button variant="outline" onClick={() => { setStep("map"); setIsCommitReview(false); }} data-testid="button-back-map">
                      <ArrowLeft className="h-4 w-4 mr-1" /> Back to Mapping
                    </Button>
                    {(() => {
                      const isILM = initialLoadMode || liveBatch?.initialLoadMode;
                      const committableCount = validateStats.valid + (isILM ? validateStats.warnings : 0);
                      return committableCount === 0 ? (
                        <p className="text-sm text-destructive flex items-center gap-1"><XCircle className="h-4 w-4" /> No rows to import</p>
                      ) : (
                        <Button onClick={handleGoToCommit} disabled={isPreflightChecking} data-testid="button-go-commit">
                          {isPreflightChecking ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-1" />}
                          Review &amp; Commit ({committableCount.toLocaleString()} rows)
                        </Button>
                      );
                    })()}
                  </div>
                </>
              ) : validationError ? (
                <div className="space-y-4" data-testid="validation-error-panel">
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                    <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-semibold text-destructive">Validation failed</p>
                      <p className="text-sm text-destructive/80 break-words">{validationError}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Button
                      variant="outline"
                      onClick={() => setStep("map")}
                      data-testid="button-back-to-map"
                    >
                      <ArrowLeft className="h-4 w-4 mr-1" /> Back to Mapping
                    </Button>
                    <Button
                      onClick={() => { setValidationError(null); validateMutation.mutate(); }}
                      disabled={validateMutation.isPending}
                      data-testid="button-retry-validation"
                    >
                      {validateMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                      Retry Validation
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 py-8" data-testid="validation-idle-panel">
                  <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
                  <div className="text-center space-y-1">
                    <p className="text-sm font-medium">Ready to validate</p>
                    <p className="text-xs text-muted-foreground">Click below to run validation against your mapped columns.</p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Button variant="outline" onClick={() => setStep("map")} data-testid="button-back-to-map">
                      <ArrowLeft className="h-4 w-4 mr-1" /> Back to Mapping
                    </Button>
                    <Button onClick={() => validateMutation.mutate()} disabled={validateMutation.isPending} data-testid="button-run-validation">
                      {validateMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                      Run Validation
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {displayedStep === "commit" && (
          <Card>
            <CardHeader>
              <CardTitle>Confirm Import</CardTitle>
              <CardDescription>
                {isProcessing && processingPhase === "committing"
                  ? "Import is running in the background..."
                  : (() => {
                      const isILM = initialLoadMode || liveBatch?.initialLoadMode;
                      const committable = (validateStats?.valid ?? 0) + (isILM ? (validateStats?.warnings ?? 0) : 0);
                      return isILM
                        ? `You are about to import ${committable.toLocaleString()} rows (${validateStats?.valid ?? 0} valid + ${validateStats?.warnings ?? 0} warnings). Rows with warnings will import with a needs-follow-up flag.`
                        : `You are about to import ${committable.toLocaleString()} valid rows.`;
                    })()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {liveBatch?.status === "cancelling" ? (
                <div className="flex flex-col items-center gap-4 py-10">
                  <Ban className="h-12 w-12 text-amber-500" />
                  <div className="text-center space-y-1">
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Cancelling import...</p>
                    {liveBatch && (liveBatch.processedRows ?? 0) > 0 && (
                      <p className="text-xs text-muted-foreground">{(liveBatch.processedRows ?? 0).toLocaleString()} of {liveBatch.totalRows.toLocaleString()} rows already committed</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">Waiting for the current chunk to finish. This will stop momentarily.</p>
                  </div>
                </div>
              ) : (commitMutation.isPending || (isProcessing && processingPhase === "committing")) ? (
                <div className="flex flex-col items-center gap-4 py-10">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <div className="text-center space-y-1">
                    <p className="text-sm font-medium">Importing {moduleName.toLowerCase()}...</p>
                    {liveBatch && (liveBatch.processedRows ?? 0) > 0 && (
                      <p className="text-xs text-muted-foreground">{(liveBatch.processedRows ?? 0).toLocaleString()} of {liveBatch.totalRows.toLocaleString()} rows processed</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">You can safely stay on this page.</p>
                  </div>
                  {liveBatch && liveBatch.totalRows > 0 && (liveBatch.processedRows ?? 0) > 0 && (
                    <div className="w-full max-w-sm">
                      <div className="w-full bg-muted rounded-full h-2">
                        <div className="bg-primary h-2 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.round(((liveBatch.processedRows ?? 0) / liveBatch.totalRows) * 100))}%` }} />
                      </div>
                      <p className="text-xs text-muted-foreground text-right mt-1">{Math.min(100, Math.round(((liveBatch.processedRows ?? 0) / liveBatch.totalRows) * 100))}%</p>
                    </div>
                  )}
                  {batchId && liveBatch?.status === "committing" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCancelConfirm(true)}
                      disabled={cancelMutation.isPending}
                      data-testid="button-cancel-import"
                    >
                      <Ban className="h-4 w-4 mr-1" /> Cancel Import
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  {validateStats && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-green-500/10 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">{validateStats.willCreate}</p>
                        <p className="text-xs text-muted-foreground">Will Create</p>
                      </div>
                      <div className="bg-blue-500/10 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{validateStats.willUpdate}</p>
                        <p className="text-xs text-muted-foreground">Will Update</p>
                      </div>
                      <div className="bg-yellow-500/10 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{validateStats.skipped}</p>
                        <p className="text-xs text-muted-foreground">Rows Skipped</p>
                      </div>
                    </div>
                  )}

                  {/* Preflight check results */}
                  {moduleConfig.preflight && (preflightLoading || preflightResult || preflightError) && (
                    <div className="space-y-2">
                      {preflightLoading && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground rounded-md border bg-muted/30 px-3 py-2">
                          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                          Running pre-commit checks...
                        </div>
                      )}
                      {!preflightLoading && preflightResult && (
                        <>
                          {preflightResult.blockers.length > 0 && (
                            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1.5">
                              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                                <XCircle className="h-4 w-4 shrink-0" />
                                Commit blocked — resolve these issues first
                              </div>
                              {preflightResult.blockers.map((b, i) => (
                                <p key={i} className="text-xs text-destructive/80 pl-6">{b}</p>
                              ))}
                            </div>
                          )}
                          {preflightResult.advisories.length > 0 && (
                            <div className="rounded-md border border-amber-400/40 bg-amber-400/5 p-3 space-y-1.5">
                              <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                Review before proceeding
                              </div>
                              {preflightResult.advisories.map((a, i) => (
                                <p key={i} className="text-xs text-amber-700/80 dark:text-amber-400/80 pl-6">{a}</p>
                              ))}
                              <label className="flex items-center gap-2 text-xs pl-6 cursor-pointer pt-1">
                                <input
                                  type="checkbox"
                                  checked={advisoryAcknowledged}
                                  onChange={e => setAdvisoryAcknowledged(e.target.checked)}
                                  data-testid="checkbox-advisory-ack"
                                />
                                I have reviewed these advisories and wish to proceed
                              </label>
                            </div>
                          )}
                          {preflightResult.blockers.length === 0 && preflightResult.advisories.length === 0 && (
                            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 rounded-md border border-green-400/30 bg-green-400/5 px-3 py-2">
                              <CheckCircle2 className="h-4 w-4 shrink-0" />
                              Pre-commit checks passed — no issues found
                            </div>
                          )}
                        </>
                      )}
                      {!preflightLoading && preflightError && (
                        <p className="text-xs text-muted-foreground italic px-1">{preflightError}</p>
                      )}
                    </div>
                  )}

                  {isProduction && (
                    <div className="space-y-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                        <p className="text-sm font-medium text-destructive">Production environment — confirmation required</p>
                      </div>
                      <p className="text-xs text-muted-foreground">Type <strong>IMPORT INTO PRODUCTION</strong> to confirm this import:</p>
                      <input
                        className="w-full border rounded-md px-3 py-2 text-sm font-mono bg-background"
                        placeholder="IMPORT INTO PRODUCTION"
                        value={productionConfirmPhrase}
                        onChange={e => setProductionConfirmPhrase(e.target.value)}
                        data-testid="input-confirm-phrase"
                      />
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={productionChecked} onChange={e => setProductionChecked(e.target.checked)} data-testid="checkbox-production-confirm" />
                        I have reviewed the preview and confirm this data is correct
                      </label>
                    </div>
                  )}

                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setIsCommitReview(false)} data-testid="button-back-validate">
                      <ArrowLeft className="h-4 w-4 mr-1" /> Back to Preview
                    </Button>
                    <Button
                      onClick={() => commitMutation.mutate()}
                      disabled={
                        commitMutation.isPending ||
                        preflightLoading ||
                        (preflightResult !== null && (preflightResult.blockers?.length ?? 0) > 0) ||
                        (preflightResult !== null && (preflightResult.advisories?.length ?? 0) > 0 && !advisoryAcknowledged) ||
                        (isProduction && (productionConfirmPhrase !== "IMPORT INTO PRODUCTION" || !productionChecked))
                      }
                      data-testid="button-confirm-import"
                    >
                      {commitMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                      {(() => {
                        const isILM = initialLoadMode || liveBatch?.initialLoadMode;
                        const n = (validateStats?.valid ?? 0) + (isILM ? (validateStats?.warnings ?? 0) : 0);
                        return `Import ${n.toLocaleString()} ${moduleName}`;
                      })()}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {displayedStep === "results" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {wasCancelled
                  ? <><Ban className="h-5 w-5 text-amber-500" /> Import Cancelled</>
                  : <><CheckCircle2 className="h-5 w-5 text-green-600" /> Import Complete</>}
              </CardTitle>
              {wasCancelled && (
                <p className="text-sm text-muted-foreground mt-1">
                  The import was cancelled. Rows processed before cancellation were committed and are not rolled back.
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {commitStats && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-green-500/10 rounded-lg p-4 text-center">
                    <p className="text-3xl font-bold text-green-600 dark:text-green-400">{commitStats.created}</p>
                    <p className="text-sm text-muted-foreground">Created</p>
                  </div>
                  <div className="bg-blue-500/10 rounded-lg p-4 text-center">
                    <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{commitStats.updated}</p>
                    <p className="text-sm text-muted-foreground">Updated</p>
                  </div>
                  <div className={`${commitStats.failed > 0 ? "bg-destructive/10" : "bg-muted/40"} rounded-lg p-4 text-center`}>
                    <p className={`text-3xl font-bold ${commitStats.failed > 0 ? "text-destructive" : "text-muted-foreground"}`}>{commitStats.failed}</p>
                    <p className="text-sm text-muted-foreground">Failed</p>
                  </div>
                </div>
              )}

              {batchId && commitStats && (commitStats.failed > 0 || (liveBatch && liveBatch.errorRows !== null && liveBatch.errorRows > 0)) && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => window.open(`${apiPrefix}/${batchId}/export-errors`, "_blank")} data-testid="button-export-errors">
                    <Download className="h-4 w-4 mr-2" /> Download Error Report
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                <Button variant="outline" onClick={handleReset} data-testid="button-import-another">
                  Import Another File
                </Button>
                <Button onClick={() => window.location.href = backHref} data-testid="button-view-module">
                  View {moduleName}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this import?</AlertDialogTitle>
            <AlertDialogDescription>
              The import worker will stop after the current batch of rows finishes processing. Rows already committed will remain — there is no automatic rollback. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-confirm-dismiss">Keep importing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => { if (batchId) cancelMutation.mutate(batchId); setShowCancelConfirm(false); }}
              data-testid="button-cancel-confirm-proceed"
            >
              Yes, cancel import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ImportAccessGuard>
  );
}
