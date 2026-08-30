import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertCircle, CheckCircle2, CloudUpload, FileSpreadsheet, Loader2,
  Save, Trash2, ChevronRight, ChevronLeft, RotateCcw, AlertTriangle,
  Info, FileCheck2, ClipboardList, ArrowRight, X, Filter,
  Copy, ShieldAlert,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TargetField {
  key: string;
  label: string;
  required: boolean;
  type: string;
}

interface ImportProfile {
  id: string;
  name: string;
  columnMapping: Record<string, string>;
  createdAt: string;
}

interface UploadResult {
  batchId: string;
  fileName: string;
  sheetNames: string[];
  currentSheet: string;
  headers: string[];
  totalRows: number;
  previewRows: Record<string, unknown>[];
}

interface ValidateResult {
  batchId: string;
  importMode: string;
  matchKey: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  skippedRows: number;
  duplicateWarnings: number;
  errorCategories: Record<string, number>;
  readyToCommit: boolean;
}

interface StagingRow {
  id: string;
  rowIndex: number;
  rawJson: Record<string, unknown>;
  mappedJson: Record<string, unknown> | null;
  validationErrors: string[] | null;
  validationWarnings: string[] | null;
  validationWarningFields: Record<string, string> | null; // field → "error"|"warning"
  matchAction: string | null; // "create" | "update" | "skip"
  existingClaimId: string | null;
  status: string;
}

interface CommitResult {
  success: boolean;
  batchId: string;
  importMode: string;
  created: number;
  updated: number;
  failed: number;
  skipped: number;
  totalValueImported: number;
  errors: Array<{ rowIndex: number; error: string }>;
}

type Step = "upload" | "map" | "validate" | "commit" | "summary";
type StatusFilter = "all" | "valid" | "warning" | "error" | "skipped";
type ImportMode = "create" | "update" | "upsert";
type MatchKey  = "invoiceNumber" | "referenceNumber";

const IMPORT_MODE_OPTIONS: { value: ImportMode; label: string; description: string }[] = [
  { value: "create",  label: "Create only",  description: "Create new invoices; error on duplicate match key" },
  { value: "update",  label: "Update only",  description: "Update existing invoices matched by key; skip unmatched rows" },
  { value: "upsert",  label: "Create or update", description: "Update if matched, create new if not" },
];

const STEPS: { id: Step; label: string; icon: React.ElementType }[] = [
  { id: "upload",   label: "Upload",   icon: CloudUpload },
  { id: "map",      label: "Map",      icon: ClipboardList },
  { id: "validate", label: "Validate", icon: FileCheck2 },
  { id: "commit",   label: "Commit",   icon: CheckCircle2 },
  { id: "summary",  label: "Summary",  icon: FileSpreadsheet },
];

// Row background tints for status (applied to <tr>)
const ROW_BG: Record<string, string> = {
  valid:   "bg-green-50/60 dark:bg-green-950/20",
  warning: "bg-yellow-50/60 dark:bg-yellow-950/20",
  error:   "bg-red-50/60 dark:bg-red-950/20",
};

const STATUS_BADGE: Record<string, string> = {
  valid:     "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400",
  warning:   "border-yellow-500 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  error:     "border-destructive bg-destructive/10 text-destructive",
  pending:   "text-muted-foreground",
  committed: "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-400",
};

// ─── Component ────────────────────────────────────────────────────────────────
export function InvoiceImportEngine() {
  const { toast } = useToast();

  // Wizard state
  const [step, setStep] = useState<Step>("upload");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [validateResult, setValidateResult] = useState<ValidateResult | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [includeWarnings, setIncludeWarnings] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [showSaveProfile, setShowSaveProfile] = useState(false);
  const [stagingRows, setStagingRows] = useState<StagingRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [importMode, setImportMode] = useState<ImportMode>("create");
  const [matchKey, setMatchKey] = useState<MatchKey>("invoiceNumber");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Data fetching ──────────────────────────────────────────────────────────
  const { data: fields = [] } = useQuery<TargetField[]>({
    queryKey: ["/api/corporate/invoices/import/fields"],
    queryFn: () =>
      fetch("/api/corporate/invoices/import/fields", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => d.fields ?? []),
  });

  const { data: profiles = [], refetch: refetchProfiles } = useQuery<ImportProfile[]>({
    queryKey: ["/api/corporate/invoices/import/profiles"],
    queryFn: () =>
      fetch("/api/corporate/invoices/import/profiles", { credentials: "include" }).then((r) => r.json()),
    staleTime: 30_000,
  });

  const fetchStagingRows = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/corporate/invoices/import/${id}`, { credentials: "include" });
      const d = await r.json();
      setStagingRows(d.rows ?? []);
    } catch {
      setStagingRows([]);
    }
  }, []);

  // ─── Derived: duplicate field assignments in mapping ────────────────────────
  const duplicateMappings = (() => {
    const seen: Record<string, string[]> = {};
    for (const [col, target] of Object.entries(columnMapping)) {
      if (target && target !== "__skip__") {
        (seen[target] = seen[target] ?? []).push(col);
      }
    }
    return Object.fromEntries(Object.entries(seen).filter(([, cols]) => cols.length > 1));
  })();

  const hasDuplicateMappings = Object.keys(duplicateMappings).length > 0;

  // ─── Mutations ──────────────────────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch("/api/corporate/invoices/import/upload", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error ?? "Upload failed");
      }
      return r.json() as Promise<UploadResult>;
    },
    onSuccess: (data) => {
      setUploadResult(data);
      setBatchId(data.batchId);
      // Auto-map: fuzzy match header names to field keys/labels
      const autoMap: Record<string, string> = {};
      data.headers.forEach((header) => {
        const lower = header.toLowerCase().replace(/[^a-z0-9]/g, "");
        const match = fields.find((f) => {
          const fk = f.key.toLowerCase().replace(/[^a-z0-9]/g, "");
          const fl = f.label.toLowerCase().replace(/[^a-z0-9]/g, "");
          return fk === lower || fl === lower;
        });
        if (match) autoMap[header] = match.key;
      });
      setColumnMapping(autoMap);
      setStep("map");
    },
    onError: (err: Error) =>
      toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  const validateMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/corporate/invoices/import/${batchId}/validate`, {
        columnMapping,
        importMode,
        matchKey,
      });
      return r.json() as Promise<ValidateResult>;
    },
    onSuccess: async (data) => {
      setValidateResult(data);
      setStatusFilter("all");
      await fetchStagingRows(batchId!);
      setStep("validate");
    },
    onError: (err: Error) =>
      toast({ title: "Validation failed", description: err.message, variant: "destructive" }),
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/corporate/invoices/import/${batchId}/commit`, {
        includeWarnings,
      });
      return r.json() as Promise<CommitResult>;
    },
    onSuccess: (data) => {
      setCommitResult(data);
      setStep("summary");
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices"] });
    },
    onError: (err: Error) =>
      toast({ title: "Commit failed", description: err.message, variant: "destructive" }),
  });

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/corporate/invoices/import/profiles", {
        name: profileName,
        columnMapping,
      });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Template saved" });
      setProfileName("");
      setShowSaveProfile(false);
      refetchProfiles();
    },
    onError: (err: Error) =>
      toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const deleteProfileMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/corporate/invoices/import/profiles/${id}`).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Template deleted" });
      refetchProfiles();
    },
  });

  // ─── File handling ──────────────────────────────────────────────────────────
  const handleFile = useCallback(
    (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!["xlsx", "xls", "csv"].includes(ext ?? "")) {
        toast({
          title: "Unsupported format",
          description: "Please upload a CSV, XLS, or XLSX file.",
          variant: "destructive",
        });
        return;
      }
      uploadMutation.mutate(file);
    },
    [uploadMutation, toast]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  // ─── Reset ──────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setStep("upload");
    setBatchId(null);
    setUploadResult(null);
    setColumnMapping({});
    setValidateResult(null);
    setCommitResult(null);
    setStagingRows([]);
    setIncludeWarnings(true);
    setStatusFilter("all");
    setImportMode("create");
    setMatchKey("invoiceNumber");
  };

  // ─── Derived view state ──────────────────────────────────────────────────────
  const currentStepIdx = STEPS.findIndex((s) => s.id === step);
  const requiredMapped = requiredFieldsMapped(fields, columnMapping);
  // In update mode the only mandatory mapped field is the matchKey itself
  const matchKeyMapped = Object.values(columnMapping).includes(matchKey);
  const canRunValidation =
    !hasDuplicateMappings && (
      importMode === "create" ? requiredMapped :
      importMode === "update" ? matchKeyMapped :
      /* upsert */ requiredMapped && matchKeyMapped
    );

  const filteredRows =
    statusFilter === "all"
      ? stagingRows
      : stagingRows.filter((r) => r.status === statusFilter);

  const importableCount = validateResult
    ? validateResult.validRows + (includeWarnings ? validateResult.warningRows : 0)
    : 0;

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Invoice Import Engine</h2>
          <p className="text-sm text-muted-foreground">
            Upload a CSV or Excel file to bulk-create draft invoices.
          </p>
        </div>
        {step !== "upload" && (
          <Button variant="outline" size="sm" onClick={handleReset} data-testid="button-import-reset">
            <RotateCcw className="w-4 h-4 mr-1.5" />
            Start over
          </Button>
        )}
      </div>

      {/* Step progress bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, idx) => {
          const Icon = s.icon;
          const isDone = idx < currentStepIdx;
          const isCurrent = idx === currentStepIdx;
          return (
            <div key={s.id} className="flex items-center gap-1 shrink-0">
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : isDone
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground"
                }`}
              >
                {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                {s.label}
              </div>
              {idx < STEPS.length - 1 && (
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STEP: UPLOAD                                                          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload File</CardTitle>
            <CardDescription>Accepts CSV, XLS, and XLSX files up to 15 MB and 5,000 rows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-md flex flex-col items-center justify-center gap-3 py-14 cursor-pointer transition-colors ${
                isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"
              } ${uploadMutation.isPending ? "opacity-60 pointer-events-none" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              data-testid="dropzone-invoice-import"
            >
              {uploadMutation.isPending ? (
                <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
              ) : (
                <CloudUpload className="w-8 h-8 text-muted-foreground" />
              )}
              <div className="text-center">
                <p className="text-sm font-medium">
                  {uploadMutation.isPending ? "Uploading & parsing…" : "Drop file here or click to browse"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">CSV · XLS · XLSX — max 5,000 rows</p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xls,.xlsx"
              className="hidden"
              data-testid="input-invoice-import-file"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />
            <RecentImports />
          </CardContent>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STEP: MAP                                                             */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {step === "map" && uploadResult && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Map Columns</CardTitle>
                  <CardDescription>
                    Match each column from{" "}
                    <span className="font-medium">{uploadResult.fileName}</span> to an invoice field.
                    ({uploadResult.totalRows} row{uploadResult.totalRows !== 1 ? "s" : ""} detected)
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  {profiles.length > 0 && (
                    <Select
                      onValueChange={(profileId) => {
                        const p = profiles.find((pr) => pr.id === profileId);
                        if (p) setColumnMapping(p.columnMapping);
                      }}
                    >
                      <SelectTrigger className="w-44 h-8 text-sm" data-testid="select-load-template">
                        <SelectValue placeholder="Load template…" />
                      </SelectTrigger>
                      <SelectContent>
                        {profiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSaveProfile((v) => !v)}
                    data-testid="button-save-template"
                  >
                    <Save className="w-3.5 h-3.5 mr-1.5" />
                    Save template
                  </Button>
                </div>
              </div>

              {showSaveProfile && (
                <div className="flex gap-2 mt-3">
                  <Input
                    placeholder="Template name…"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="max-w-xs"
                    data-testid="input-template-name"
                  />
                  <Button
                    size="sm"
                    disabled={!profileName.trim() || saveProfileMutation.isPending}
                    onClick={() => saveProfileMutation.mutate()}
                    data-testid="button-confirm-save-template"
                  >
                    {saveProfileMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowSaveProfile(false)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </CardHeader>

            <CardContent className="space-y-4">
              {/* ── Import mode selector ──────────────────────────────────── */}
              <div className="rounded-md border p-3 space-y-3">
                <div>
                  <p className="text-xs font-medium mb-1.5">Import mode</p>
                  <div className="flex flex-wrap gap-2">
                    {IMPORT_MODE_OPTIONS.map((opt) => (
                      <Button
                        key={opt.value}
                        size="sm"
                        variant={importMode === opt.value ? "default" : "outline"}
                        onClick={() => setImportMode(opt.value)}
                        data-testid={`button-import-mode-${opt.value}`}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {IMPORT_MODE_OPTIONS.find((o) => o.value === importMode)?.description}
                  </p>
                </div>

                {/* Match key selector — shown for update / upsert */}
                {importMode !== "create" && (
                  <div>
                    <p className="text-xs font-medium mb-1.5">Match existing invoices by</p>
                    <div className="flex gap-2">
                      {(["invoiceNumber", "referenceNumber"] as MatchKey[]).map((k) => {
                        const label = k === "invoiceNumber" ? "Invoice Number" : "Reference Number";
                        return (
                          <Button
                            key={k}
                            size="sm"
                            variant={matchKey === k ? "default" : "outline"}
                            onClick={() => setMatchKey(k)}
                            data-testid={`button-match-key-${k}`}
                          >
                            {label}
                          </Button>
                        );
                      })}
                    </div>
                    {!matchKeyMapped && (
                      <p className="text-xs text-destructive mt-1.5">
                        You must map a column to{" "}
                        <span className="font-medium">
                          {matchKey === "invoiceNumber" ? "Invoice Number" : "Reference Number"}
                        </span>{" "}
                        to use this mode.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Duplicate mapping alert */}
              {hasDuplicateMappings && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" data-testid="alert-duplicate-mapping">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium">Duplicate field assignment detected.</span>
                    {" "}Multiple columns are mapped to the same invoice field. Each field can only
                    receive one source column.
                    <ul className="mt-1.5 space-y-0.5 list-disc list-inside">
                      {Object.entries(duplicateMappings).map(([target, cols]) => {
                        const label = fields.find((f) => f.key === target)?.label ?? target;
                        return (
                          <li key={target} className="text-xs">
                            <span className="font-medium">{label}</span>:{" "}
                            {cols.map((c) => <span key={c} className="font-mono">&quot;{c}&quot;</span>).reduce((a, b) => <>{a}, {b}</>)}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}

              {/* Mapping table */}
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[38%]">Source Column</TableHead>
                      <TableHead className="w-[34%]">Maps to Invoice Field</TableHead>
                      <TableHead>Sample Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uploadResult.headers.map((header) => {
                      const sample = uploadResult.previewRows[0]?.[header];
                      const target = columnMapping[header] ?? "__skip__";
                      const isDupTarget =
                        target !== "__skip__" && (duplicateMappings[target]?.length ?? 0) > 1;

                      return (
                        <TableRow
                          key={header}
                          className={isDupTarget ? "bg-destructive/5" : undefined}
                        >
                          <TableCell className="font-mono text-sm">
                            <div className="flex items-center gap-1.5">
                              {isDupTarget && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    This column's target field is already mapped by another column
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {header}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={target}
                              onValueChange={(val) =>
                                setColumnMapping((prev) => ({ ...prev, [header]: val }))
                              }
                            >
                              <SelectTrigger
                                className={`h-8 text-sm ${isDupTarget ? "border-destructive" : ""}`}
                                data-testid={`select-map-${header}`}
                              >
                                <SelectValue placeholder="Skip this column" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__skip__">— Skip —</SelectItem>
                                {fields.map((f) => (
                                  <SelectItem key={f.key} value={f.key}>
                                    {f.label}
                                    {f.required && <span className="ml-1 text-destructive">*</span>}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground font-mono truncate max-w-[200px]">
                            {sample !== undefined && sample !== "" ? (
                              String(sample)
                            ) : (
                              <span className="italic text-muted-foreground/50">empty</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Required fields status */}
              <div>
                <p className="text-xs text-muted-foreground mb-1.5 font-medium">Required fields</p>
                <div className="flex flex-wrap gap-1.5">
                  {fields
                    .filter((f) => f.required)
                    .map((f) => {
                      const isMapped = Object.values(columnMapping).includes(f.key);
                      return (
                        <Badge
                          key={f.key}
                          variant="outline"
                          className={`text-xs ${
                            isMapped
                              ? "border-green-500 text-green-700 dark:text-green-400"
                              : "border-destructive text-destructive"
                          }`}
                          data-testid={`badge-required-field-${f.key}`}
                        >
                          {isMapped ? (
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                          ) : (
                            <AlertCircle className="w-3 h-3 mr-1" />
                          )}
                          {f.label}
                        </Badge>
                      );
                    })}
                </div>
                {!requiredMapped && (
                  <p className="text-xs text-destructive mt-2">
                    Map all required fields before running validation.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Saved templates */}
          {profiles.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground font-normal">
                  Saved Mapping Templates
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {profiles.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2">
                      <button
                        className="text-sm text-left hover:underline"
                        onClick={() => setColumnMapping(p.columnMapping)}
                        data-testid={`button-apply-template-${p.id}`}
                      >
                        {p.name}
                      </button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground"
                        onClick={() => deleteProfileMutation.mutate(p.id)}
                        data-testid={`button-delete-template-${p.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => setStep("upload")} data-testid="button-back-to-upload">
              <ChevronLeft className="w-4 h-4 mr-1.5" />
              Back
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    onClick={() => validateMutation.mutate()}
                    disabled={validateMutation.isPending || !canRunValidation}
                    data-testid="button-run-validation"
                  >
                    {validateMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <ArrowRight className="w-4 h-4 mr-1.5" />
                    )}
                    Run Validation
                  </Button>
                </span>
              </TooltipTrigger>
              {!canRunValidation && (
                <TooltipContent>
                  {hasDuplicateMappings
                    ? "Resolve duplicate field assignments first"
                    : "Map all required fields first"}
                </TooltipContent>
              )}
            </Tooltip>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STEP: VALIDATE                                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {step === "validate" && validateResult && (
        <div className="space-y-4">
          {/* Summary tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile label="Total Rows" value={validateResult.totalRows} />
            <SummaryTile
              label="Valid"
              value={validateResult.validRows}
              color="text-green-600 dark:text-green-400"
            />
            <SummaryTile
              label="Warnings"
              value={validateResult.warningRows}
              color="text-yellow-600 dark:text-yellow-400"
            />
            <SummaryTile
              label="Errors"
              value={validateResult.errorRows}
              color={validateResult.errorRows > 0 ? "text-destructive" : undefined}
            />
          </div>

          {/* "All errors" hard block */}
          {validateResult.errorRows === validateResult.totalRows && (
            <div
              className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/5 p-3 text-sm text-destructive"
              data-testid="alert-all-rows-error"
            >
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold">Import blocked — every row has errors.</span>
                {" "}Fix the source data and re-upload to proceed.
              </div>
            </div>
          )}

          {/* Duplicate warning banner */}
          {validateResult.duplicateWarnings > 0 && (
            <div
              className="flex items-start gap-2 rounded-md border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-950/30 p-3 text-sm text-yellow-800 dark:text-yellow-300"
              data-testid="alert-duplicate-warnings"
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                <strong>{validateResult.duplicateWarnings}</strong> row
                {validateResult.duplicateWarnings !== 1 ? "s" : ""} may duplicate existing invoices.
                Review before committing.
              </span>
            </div>
          )}

          {/* Error category summary */}
          {Object.keys(validateResult.errorCategories ?? {}).length > 0 && (
            <Card data-testid="card-error-categories">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-destructive" />
                  Error Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {Object.entries(validateResult.errorCategories)
                    .sort(([, a], [, b]) => b - a)
                    .map(([cat, count]) => (
                      <div
                        key={cat}
                        className="flex items-center justify-between text-sm py-0.5"
                      >
                        <span className="text-muted-foreground">{cat}…</span>
                        <Badge
                          variant="outline"
                          className="text-xs border-destructive/50 text-destructive ml-2 shrink-0"
                        >
                          {count} row{count !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Row table with filter tabs */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium">Row-Level Results</CardTitle>
                {/* Status filter */}
                <div className="flex items-center gap-1 flex-wrap" data-testid="filter-status-tabs">
                  {(
                    [
                      { id: "all",     label: "All",      count: stagingRows.length },
                      { id: "valid",   label: "Valid",    count: validateResult.validRows },
                      { id: "warning", label: "Warnings", count: validateResult.warningRows },
                      { id: "error",   label: "Errors",   count: validateResult.errorRows },
                      { id: "skipped", label: "Skipped",  count: validateResult.skippedRows ?? 0 },
                    ] as const
                  ).filter((f) => f.id !== "skipped" || (validateResult.skippedRows ?? 0) > 0)
                  .map((f) => (
                    <Button
                      key={f.id}
                      size="sm"
                      variant={statusFilter === f.id ? "default" : "outline"}
                      className="h-7 text-xs px-2.5"
                      onClick={() => setStatusFilter(f.id)}
                      data-testid={`filter-tab-${f.id}`}
                    >
                      {f.label}
                      {f.count > 0 && (
                        <span
                          className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                            statusFilter === f.id
                              ? "bg-primary-foreground/20 text-primary-foreground"
                              : f.id === "error"
                              ? "bg-destructive/10 text-destructive"
                              : f.id === "warning"
                              ? "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400"
                              : f.id === "valid"
                              ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {f.count}
                        </span>
                      )}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredRows.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No rows match the current filter.
                </div>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Row</TableHead>
                        <TableHead className="w-24">Status</TableHead>
                        {importMode !== "create" && <TableHead className="w-24">Action</TableHead>}
                        <TableHead>Customer</TableHead>
                        <TableHead>Invoice Date</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Issues</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.map((row) => {
                        const m = (row.mappedJson ?? row.rawJson) as Record<string, unknown>;
                        const errs = (row.validationErrors ?? []) as string[];
                        const warns = (row.validationWarnings ?? []) as string[];
                        const fieldMeta = (row.validationWarningFields ?? {}) as Record<string, string>;

                        const matchActionBadge: Record<string, string> = {
                          create: "text-green-700 dark:text-green-400 border-green-300 dark:border-green-700",
                          update: "text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-700",
                          skip:   "text-muted-foreground border-muted",
                          error:  "text-destructive border-destructive/30",
                        };

                        return (
                          <TableRow
                            key={row.id}
                            className={ROW_BG[row.status] ?? ""}
                            data-testid={`row-staging-${row.rowIndex}`}
                          >
                            <TableCell className="text-sm text-muted-foreground font-mono">
                              {row.rowIndex}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`text-xs ${STATUS_BADGE[row.status] ?? ""}`}
                              >
                                {row.status === "valid" && <CheckCircle2 className="w-3 h-3 mr-1" />}
                                {row.status === "warning" && <AlertTriangle className="w-3 h-3 mr-1" />}
                                {row.status === "error" && <AlertCircle className="w-3 h-3 mr-1" />}
                                {row.status}
                              </Badge>
                            </TableCell>
                            {importMode !== "create" && (
                              <TableCell>
                                {row.matchAction ? (
                                  <Badge
                                    variant="outline"
                                    className={`text-xs ${matchActionBadge[row.matchAction] ?? ""}`}
                                  >
                                    {row.matchAction}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            )}
                            <TableCell
                              className={`text-sm ${fieldMeta.customerName === "error" ? "text-destructive font-medium" : fieldMeta.customerName === "warning" ? "text-yellow-700 dark:text-yellow-400" : ""}`}
                            >
                              {String(m.customerName ?? "—")}
                            </TableCell>
                            <TableCell
                              className={`text-sm ${fieldMeta.invoiceDate === "error" ? "text-destructive font-medium" : fieldMeta.invoiceDate === "warning" ? "text-yellow-700 dark:text-yellow-400" : ""}`}
                            >
                              {String(m.invoiceDate ?? "—")}
                            </TableCell>
                            <TableCell
                              className={`text-sm ${fieldMeta.dueDate === "error" ? "text-destructive font-medium" : fieldMeta.dueDate === "warning" ? "text-yellow-700 dark:text-yellow-400" : ""}`}
                            >
                              {String(m.dueDate ?? "—")}
                            </TableCell>
                            <TableCell
                              className={`text-sm ${fieldMeta.totalAmount === "error" ? "text-destructive font-medium" : ""}`}
                            >
                              {m.totalAmount != null
                                ? Number(m.totalAmount).toLocaleString("en-US", {
                                    style: "currency",
                                    currency: "USD",
                                  })
                                : "—"}
                            </TableCell>
                            <TableCell className="max-w-xs">
                              <div className="space-y-0.5">
                                {errs.map((e, i) => (
                                  <div
                                    key={i}
                                    className="flex items-start gap-1 text-xs text-destructive"
                                    data-testid={`error-row-${row.rowIndex}-${i}`}
                                  >
                                    <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                                    <span>{e}</span>
                                  </div>
                                ))}
                                {warns.map((w, i) => (
                                  <div
                                    key={i}
                                    className="flex items-start gap-1 text-xs text-yellow-600 dark:text-yellow-400"
                                    data-testid={`warning-row-${row.rowIndex}-${i}`}
                                  >
                                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                                    <span>{w}</span>
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {stagingRows.length > 10 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Showing {filteredRows.length} of {stagingRows.length} rows
                  {statusFilter !== "all" && ` (filtered to "${statusFilter}")`}.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => setStep("map")} data-testid="button-back-to-map">
              <ChevronLeft className="w-4 h-4 mr-1.5" />
              Adjust Mapping
            </Button>
            <Button
              onClick={() => setStep("commit")}
              disabled={!validateResult.readyToCommit}
              data-testid="button-proceed-to-commit"
            >
              <ArrowRight className="w-4 h-4 mr-1.5" />
              Proceed to Commit
            </Button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STEP: COMMIT                                                          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {step === "commit" && validateResult && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Confirm Import</CardTitle>
              <CardDescription>
                Review the counts below and confirm to create the invoices as drafts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryTile
                  label="Will be created"
                  value={importableCount}
                  color={importableCount > 0 ? "text-primary" : "text-destructive"}
                />
                <SummaryTile
                  label="With warnings"
                  value={validateResult.warningRows}
                  color="text-yellow-600 dark:text-yellow-400"
                />
                <SummaryTile
                  label="Will be skipped"
                  value={validateResult.errorRows}
                  color={validateResult.errorRows > 0 ? "text-destructive" : undefined}
                />
                <SummaryTile label="Source file" value={uploadResult?.fileName ?? "—"} small />
              </div>

              {/* Zero importable rows — hard block */}
              {importableCount === 0 && (
                <div
                  className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/5 p-3 text-sm text-destructive"
                  data-testid="alert-nothing-to-import"
                >
                  <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold">Nothing to import.</span>{" "}
                    {includeWarnings
                      ? "All rows have errors. Go back and fix the source data."
                      : 'All remaining rows have warnings and "import warning rows" is unchecked.'}
                  </div>
                </div>
              )}

              {validateResult.warningRows > 0 && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="include-warnings"
                    checked={includeWarnings}
                    onCheckedChange={(v) => setIncludeWarnings(!!v)}
                    data-testid="checkbox-include-warnings"
                  />
                  <Label htmlFor="include-warnings" className="text-sm cursor-pointer">
                    Import rows with warnings ({validateResult.warningRows} row
                    {validateResult.warningRows !== 1 ? "s" : ""})
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Warning rows passed all required checks but have minor data issues such as
                      potential duplicates or unusual values. Uncheck to skip them.
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}

              {validateResult.errorRows > 0 && (
                <div
                  className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground"
                  data-testid="notice-skipped-rows"
                >
                  <Info className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    <strong>{validateResult.errorRows}</strong> row
                    {validateResult.errorRows !== 1 ? "s" : ""} with validation errors will be
                    skipped automatically. Fix the source data and import them in a separate batch.
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-1">
                <Button
                  variant="outline"
                  onClick={() => setStep("validate")}
                  data-testid="button-back-to-validate"
                >
                  <ChevronLeft className="w-4 h-4 mr-1.5" />
                  Back
                </Button>
                <Button
                  onClick={() => commitMutation.mutate()}
                  disabled={commitMutation.isPending || importableCount === 0}
                  data-testid="button-confirm-commit"
                >
                  {commitMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  )}
                  {commitMutation.isPending
                    ? (importMode === "update" ? "Updating invoices…" : "Importing invoices…")
                    : importMode === "create"
                      ? `Create ${importableCount} Invoice${importableCount !== 1 ? "s" : ""}`
                      : importMode === "update"
                        ? `Update ${importableCount} Invoice${importableCount !== 1 ? "s" : ""}`
                        : `Import ${importableCount} Invoice${importableCount !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STEP: SUMMARY                                                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {step === "summary" && commitResult && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                {commitResult.created > 0 ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-destructive" />
                )}
                <CardTitle className="text-base">
                  {(commitResult.created + (commitResult.updated ?? 0)) > 0
                    ? "Import Complete"
                    : "Import Finished with Errors"}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {/* Always show "Created" tile if mode allows creates */}
                {commitResult.importMode !== "update" && (
                  <SummaryTile
                    label="Invoices Created"
                    value={commitResult.created}
                    color={
                      commitResult.created > 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-muted-foreground"
                    }
                  />
                )}
                {/* Show "Updated" tile for update / upsert modes */}
                {commitResult.importMode !== "create" && (
                  <SummaryTile
                    label="Invoices Updated"
                    value={commitResult.updated ?? 0}
                    color={
                      (commitResult.updated ?? 0) > 0
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-muted-foreground"
                    }
                  />
                )}
                <SummaryTile
                  label="Total Value Imported"
                  value={commitResult.totalValueImported.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 2,
                  })}
                  color={
                    commitResult.totalValueImported > 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-muted-foreground"
                  }
                  small
                />
                <SummaryTile
                  label={commitResult.importMode === "update" ? "Failed to Update" : "Failed to Create"}
                  value={commitResult.failed}
                  color={commitResult.failed > 0 ? "text-destructive" : undefined}
                />
                <SummaryTile label="Skipped" value={commitResult.skipped} />
              </div>

              {commitResult.errors.length > 0 && (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {commitResult.errors.map((e, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm text-muted-foreground">{e.rowIndex}</TableCell>
                          <TableCell className="text-sm text-destructive">{e.error}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={handleReset} data-testid="button-import-another">
                  <RotateCcw className="w-4 h-4 mr-1.5" />
                  Import another file
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function SummaryTile({
  label,
  value,
  color,
  small,
}: {
  label: string;
  value: string | number;
  color?: string;
  small?: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-3 px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`font-semibold mt-0.5 ${small ? "text-sm truncate" : "text-2xl"} ${color ?? ""}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function RecentImports() {
  const { data: batches = [] } = useQuery<any[]>({
    queryKey: ["/api/corporate/invoices/import/batches"],
    queryFn: () =>
      fetch("/api/corporate/invoices/import/batches", { credentials: "include" }).then((r) =>
        r.json()
      ),
    staleTime: 30_000,
  });

  if (batches.length === 0) return null;

  return (
    <div className="mt-2">
      <p className="text-xs text-muted-foreground mb-1.5 font-medium">Recent imports</p>
      <div className="space-y-1">
        {batches.slice(0, 5).map((b: any) => (
          <div
            key={b.id}
            className="flex items-center justify-between text-sm rounded-md px-2 py-1.5 border"
          >
            <div className="flex items-center gap-2 min-w-0">
              <FileSpreadsheet className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{b.sourceFileName}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <span className="text-xs text-muted-foreground">{b.totalRows} rows</span>
              <Badge
                variant="outline"
                className={`text-xs ${STATUS_BADGE[b.status] ?? "text-muted-foreground"}`}
              >
                {b.status}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────
function requiredFieldsMapped(fields: TargetField[], mapping: Record<string, string>): boolean {
  const mappedTargets = new Set(
    Object.values(mapping).filter((v) => v && v !== "__skip__")
  );
  return fields.filter((f) => f.required).every((f) => mappedTargets.has(f.key));
}
