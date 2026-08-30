import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import {
  DATA_IMPORT_TYPES, DATA_IMPORT_STATUSES,
  DATA_IMPORT_TYPE_LABELS, DATA_IMPORT_STATUS_LABELS,
} from "@shared/schema";
import type { DataImportBatch } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, Search, RefreshCw, Eye, Play, Trash2, FileSpreadsheet,
  CheckCircle2, AlertTriangle, XCircle, Clock, Loader2, ChevronLeft, ChevronRight,
  FileX, Download, X, RotateCcw, Ban, ShieldAlert, User, Building2, Calendar, DollarSign, Copy, Info,
  ArrowRight, Pencil, Link2, Link2Off, GitMerge, Shuffle, Lock, Send, PauseCircle, TrendingUp,
} from "lucide-react";
import { format, parseISO } from "date-fns";

// ── Types ──────────────────────────────────────────────────────────────────────

interface BatchListItem extends DataImportBatch {
  importedByName?: string;
  validationStatus?: string;
}

interface StagedRow {
  id: string;
  rowIndex: number;
  rawData: Record<string, unknown>;
  mappedData: Record<string, unknown> | null;
  validationStatus: string;
  validationErrors: Array<{ field: string; message: string; severity: string }> | null;
  importStatus: string;
  importError: string | null;
  linkedRecordId: string | null;
}

interface ValidationCategories {
  duplicates: { withinFile: number; crossBatch: number; periodAlreadyImported: boolean; conflictBatchId?: string };
  account:    {
    exact?: number; high?: number; medium?: number; low?: number; unknown: number;
    autoMatch: number; needsReview: number;  // backward-compat aliases
  };
  driver:     {
    exact?: number; high?: number; medium?: number; low?: number; unknown: number;
    autoMatch: number; needsReview: number;  // backward-compat aliases
  };
  dates:      { missing: number; invalid: number; future: number };
  financial:  { negativeValues: number; missingTotals: number; discrepancies: number };
}

interface ValidationResult {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  categories?: ValidationCategories;
  errors: Array<{ row: number; errors: Array<{ field: string; message: string; severity: string; category?: string }> }>;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ENABLED_IMPORT_TYPES = ["move_report", "driver_return", "uber_transaction"] as const;

// Source system auto-selection based on import type
const SOURCE_SYSTEM_FOR_TYPE: Record<string, string> = {
  move_report:      "redcap",
  driver_return:    "redcap",
  uber_transaction: "uber",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  uploaded:                    { label: "Uploaded",                   color: "bg-blue-100 text-blue-700 border-blue-200",       icon: Clock },
  validating:                  { label: "Validating",                 color: "bg-yellow-100 text-yellow-700 border-yellow-200",  icon: Loader2 },
  ready_for_import:            { label: "Ready for Import",           color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  importing:                   { label: "Importing",                  color: "bg-blue-100 text-blue-700 border-blue-200",       icon: Loader2 },
  imported:                    { label: "Imported",                   color: "bg-green-100 text-green-700 border-green-200",    icon: CheckCircle2 },
  completed_with_warnings:     { label: "Completed w/ Warnings",      color: "bg-amber-100 text-amber-700 border-amber-200",    icon: AlertTriangle },
  completed_with_exceptions:   { label: "Completed — Rows Held",      color: "bg-orange-100 text-orange-700 border-orange-200", icon: PauseCircle },
  failed:                      { label: "Failed",                     color: "bg-red-100 text-red-700 border-red-200",          icon: XCircle },
  validation_failed:           { label: "Validation Failed",          color: "bg-orange-100 text-orange-700 border-orange-200", icon: AlertTriangle },
  processing_error:            { label: "Processing Error",           color: "bg-red-100 text-red-800 border-red-300",          icon: ShieldAlert },
};

// ── Status Badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "bg-muted text-muted-foreground border-border", icon: Clock };
  const Icon = cfg.icon;
  const spinning = status === "validating" || status === "importing";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.color}`}>
      <Icon className={`h-3 w-3 ${spinning ? "animate-spin" : ""}`} />
      {cfg.label}
    </span>
  );
}

// ── Validation Status Badge ─────────────────────────────────────────────────────

const VALIDATION_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  not_validated:       { label: "Not Validated",    color: "bg-gray-100 text-gray-500 border-gray-200",          icon: Clock },
  valid:               { label: "Valid",             color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  valid_with_warnings: { label: "Valid w/ Warnings", color: "bg-amber-100 text-amber-700 border-amber-200",      icon: AlertTriangle },
  validation_failed:   { label: "Validation Failed", color: "bg-orange-100 text-orange-700 border-orange-200",   icon: XCircle },
};

function ValidationStatusBadge({ status }: { status?: string | null }) {
  const s = status ?? "not_validated";
  const cfg = VALIDATION_STATUS_CONFIG[s] ?? VALIDATION_STATUS_CONFIG.not_validated;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

// ── File Dropzone ──────────────────────────────────────────────────────────────

function FileDropzone({ onFile, file, disabled }: {
  onFile: (f: File) => void;
  file: File | null;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }, [onFile]);

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
        dragging ? "border-primary bg-primary/5" :
        file ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20" :
        "border-muted-foreground/30 hover:border-primary/50"
      } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }}
        disabled={disabled}
      />
      {file ? (
        <div className="flex flex-col items-center gap-1">
          <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
          <p className="text-sm font-medium text-emerald-700">{file.name}</p>
          <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Upload className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium">Drop file here or click to browse</p>
          <p className="text-xs text-muted-foreground">Excel (.xlsx, .xls) or CSV — max 50 MB</p>
        </div>
      )}
    </div>
  );
}

// ── Upload Drawer ──────────────────────────────────────────────────────────────

function UploadDrawer({ open, onClose, onSuccess, onDuplicate }: {
  open: boolean;
  onClose: () => void;
  onSuccess: (batch: DataImportBatch) => void;
  onDuplicate?: (batchId: string) => void;
}) {
  const { toast } = useToast();
  const { isSuperAdmin } = usePermissions();
  const [importType, setImportType] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // conflictInfo is set when a 409 is returned for a successfully-imported batch.
  // When present, the conflict panel replaces the generic error UI.
  const [conflictInfo, setConflictInfo] = useState<{ batchId: string; status: string } | null>(null);
  const [replaceConfirm, setReplaceConfirm] = useState(false);

  // Derived: source system is auto-selected from import type
  const sourceSystemKey = SOURCE_SYSTEM_FOR_TYPE[importType] ?? "redcap";

  // Statuses that represent a successfully completed import
  const SUCCESS_STATUSES = ["imported", "completed_with_warnings", "completed_with_exceptions"];

  const reset = () => {
    setImportType(""); setFile(null); setPeriodStart(""); setPeriodEnd(""); setNotes("");
    setError(null); setConflictInfo(null); setReplaceConfirm(false);
  };

  const handleClose = () => { reset(); onClose(); };

  // opts allow re-submission with override batchMode / supersedesBatchId for Reprocess / Replace flows.
  const handleSubmit = async (opts?: { batchMode?: string; supersedesBatchId?: string }) => {
    if (!importType) { setError("Please select an import type"); return; }
    if (!file) { setError("Please select a file to upload"); return; }
    setError(null);
    setReplaceConfirm(false);
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("importType", importType);
      fd.append("sourceSystemKey", sourceSystemKey);
      if (periodStart) fd.append("reportingPeriodStart", periodStart);
      if (periodEnd) fd.append("reportingPeriodEnd", periodEnd);
      if (notes) fd.append("notes", notes);
      if (opts?.batchMode) fd.append("batchMode", opts.batchMode);
      if (opts?.supersedesBatchId) fd.append("supersedesBatchId", opts.supersedesBatchId);

      const res = await fetch("/api/data-imports/upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          const existingBatchId: string | null = data.existingBatchId ?? null;
          const existingStatus: string = data.existingStatus ?? "";
          if (existingBatchId && SUCCESS_STATUSES.includes(existingStatus)) {
            // Show the structured conflict panel instead of a raw error string
            setConflictInfo({ batchId: existingBatchId, status: existingStatus });
          } else {
            setError(`Duplicate upload detected. ${data.message ?? ""}`);
            if (existingBatchId) setConflictInfo({ batchId: existingBatchId, status: existingStatus });
          }
        } else {
          setError(data.error ?? "Upload failed");
          // If the server created a batch but then crashed, surface it so the user can find it
          if (data.batchId) setConflictInfo({ batchId: data.batchId, status: "" });
        }
        return;
      }
      toast({ title: "File uploaded", description: `${file.name} has been uploaded and validated.` });
      reset();
      onSuccess(data);
    } catch (err: any) {
      setError(err.message ?? "Upload failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">New Data Import</h2>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* ── Structured conflict panel (success-status duplicate) ──────────────── */}
          {conflictInfo && SUCCESS_STATUSES.includes(conflictInfo.status) ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">An import already exists for this file</p>
                  <p className="text-xs text-amber-700 mt-0.5 space-y-1">
                    {conflictInfo.status === "imported" && (
                      <span className="block">
                        This file has already been successfully imported.{" "}
                        To review the imported records, open the existing batch.{" "}
                        Authorized administrators may intentionally reprocess this batch if operationally required.
                      </span>
                    )}
                    {conflictInfo.status === "completed_with_warnings" && (
                      <span className="block">
                        This file has already been imported.{" "}
                        Warnings were generated during validation.{" "}
                        Open the existing batch to review the warnings before determining whether reprocessing is necessary.
                      </span>
                    )}
                    {conflictInfo.status === "completed_with_exceptions" && (
                      <span className="block">
                        This batch completed with held records.{" "}
                        Open the existing batch and use the <em>Re-Import Held Records</em> workflow after resolving the outstanding mappings.{" "}
                        Uploading the file again is not required.
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Always-visible actions: View + Cancel */}
              <div className="flex gap-2">
                {onDuplicate && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs h-8"
                    onClick={() => { reset(); onClose(); onDuplicate(conflictInfo.batchId); }}
                  >
                    View Existing Import
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 text-xs h-8"
                  onClick={() => { setConflictInfo(null); setReplaceConfirm(false); }}
                >
                  Cancel
                </Button>
              </div>

              {/* Admin-only: Reprocess + Replace */}
              {isSuperAdmin && (
                <div className="space-y-2 pt-1 border-t border-amber-200">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-amber-700">Admin Actions</p>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-8"
                    disabled={submitting}
                    onClick={() => handleSubmit({ batchMode: "reprocess" })}
                  >
                    {submitting ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <RotateCcw className="h-3 w-3 mr-1.5" />}
                    Reprocess Existing Import
                  </Button>

                  {!replaceConfirm ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs h-8 border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => setReplaceConfirm(true)}
                    >
                      <Shuffle className="h-3 w-3 mr-1.5" />
                      Replace Existing Import
                    </Button>
                  ) : (
                    <div className="rounded border border-red-200 bg-red-50 p-3 space-y-2">
                      <p className="text-xs text-red-700 font-medium">
                        This will supersede the existing batch and reconcile all associated records. This action is logged and cannot be undone.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 text-xs h-7 bg-red-600 hover:bg-red-700 text-white"
                          disabled={submitting}
                          onClick={() => handleSubmit({ batchMode: "correction", supersedesBatchId: conflictInfo.batchId })}
                        >
                          {submitting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                          Confirm Replace
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 text-xs h-7"
                          onClick={() => setReplaceConfirm(false)}
                        >
                          Go Back
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : error ? (
            /* ── Generic error (non-success-status 409s and all other errors) ──── */
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <span>{error}</span>
                {conflictInfo && onDuplicate && (
                  <div className="mt-2">
                    <button
                      type="button"
                      className="text-xs font-medium underline underline-offset-2 hover:no-underline"
                      onClick={() => { reset(); onClose(); onDuplicate(conflictInfo.batchId); }}
                    >
                      View existing import →
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Import Type */}
          <div className="space-y-1.5">
            <Label>Import Type <span className="text-destructive">*</span></Label>
            <Select value={importType} onValueChange={setImportType}>
              <SelectTrigger>
                <SelectValue placeholder="Select import type" />
              </SelectTrigger>
              <SelectContent>
                {ENABLED_IMPORT_TYPES.map(t => (
                  <SelectItem key={t} value={t}>{DATA_IMPORT_TYPE_LABELS[t]}</SelectItem>
                ))}
                <div className="px-2 pt-2 pb-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Coming Soon</p>
                  {DATA_IMPORT_TYPES.filter(t => !ENABLED_IMPORT_TYPES.includes(t as any)).map(t => (
                    <div key={t} className="flex items-center px-2 py-1.5 text-sm text-muted-foreground/60 cursor-not-allowed">
                      {DATA_IMPORT_TYPE_LABELS[t]}
                    </div>
                  ))}
                </div>
              </SelectContent>
            </Select>
            {importType && (
              <p className="text-xs text-muted-foreground">
                Source system: <span className="font-medium capitalize">{sourceSystemKey}</span>
                {importType === "uber_transaction" && " · CSV with preamble header (Uber Business Report)"}
              </p>
            )}
          </div>

          {/* Reporting Period */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Period Start</Label>
              <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Period End</Label>
              <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
            </div>
          </div>

          {/* File Upload */}
          <div className="space-y-1.5">
            <Label>File <span className="text-destructive">*</span></Label>
            <FileDropzone onFile={setFile} file={file} disabled={submitting} />
            {file && (
              <button
                className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 mt-1"
                onClick={() => setFile(null)}
              >
                <X className="h-3 w-3" /> Remove file
              </button>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              placeholder="Optional notes about this import…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/30">
          <Button variant="outline" onClick={handleClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !file || !importType}>
            {submitting ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Uploading…</> : <><Upload className="h-4 w-4 mr-1.5" /> Upload & Validate</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Validation Report Component ────────────────────────────────────────────────

const CATEGORY_CONFIG = {
  duplicate: { label: "Duplicates",  icon: Copy,        color: "text-violet-600",  bg: "bg-violet-50 border-violet-200" },
  account:   { label: "Accounts",    icon: Building2,   color: "text-blue-600",    bg: "bg-blue-50 border-blue-200"   },
  driver:    { label: "Drivers",     icon: User,        color: "text-indigo-600",  bg: "bg-indigo-50 border-indigo-200" },
  date:      { label: "Dates",       icon: Calendar,    color: "text-orange-600",  bg: "bg-orange-50 border-orange-200" },
  financial: { label: "Financials",  icon: DollarSign,  color: "text-red-600",     bg: "bg-red-50 border-red-200"     },
} as const;

function ValidationReport({
  validation,
  onFilterCategory,
  activeCategory,
}: {
  validation: ValidationResult;
  onFilterCategory: (cat: string) => void;
  activeCategory: string;
}) {
  const cats = validation.categories;
  if (!cats) {
    // Legacy format — flat list only
    return (
      <div className="space-y-2">
        <div className="flex gap-3 flex-wrap">
          <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded">✓ {validation.validRows} valid</span>
          {validation.warningRows > 0 && <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1 rounded">⚠ {validation.warningRows} warnings</span>}
          {validation.errorRows > 0 && <span className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded">✗ {validation.errorRows} errors</span>}
        </div>
      </div>
    );
  }

  const dupTotal   = (cats.duplicates.withinFile ?? 0) + (cats.duplicates.crossBatch ?? 0);
  const acctIssues = (cats.account.needsReview ?? 0) + (cats.account.unknown ?? 0);
  const drvIssues  = (cats.driver.needsReview ?? 0) + (cats.driver.unknown ?? 0);
  const dateIssues = (cats.dates.missing ?? 0) + (cats.dates.invalid ?? 0) + (cats.dates.future ?? 0);
  const finIssues  = (cats.financial.negativeValues ?? 0) + (cats.financial.missingTotals ?? 0) + (cats.financial.discrepancies ?? 0);

  const categories: Array<{ key: string; count: number; sublines: string[] }> = [
    {
      key: "duplicate",
      count: dupTotal,
      sublines: [
        cats.duplicates.withinFile > 0 ? `${cats.duplicates.withinFile} within-file` : "",
        cats.duplicates.crossBatch > 0 ? `${cats.duplicates.crossBatch} cross-batch` : "",
      ].filter(Boolean),
    },
    {
      key: "account",
      count: acctIssues,
      sublines: [
        cats.account.autoMatch > 0 ? `${cats.account.autoMatch} auto-matched` : "",
        cats.account.needsReview > 0 ? `${cats.account.needsReview} need review` : "",
        cats.account.unknown > 0 ? `${cats.account.unknown} unknown` : "",
      ].filter(Boolean),
    },
    {
      key: "driver",
      count: drvIssues,
      sublines: [
        cats.driver.autoMatch > 0 ? `${cats.driver.autoMatch} auto-matched` : "",
        cats.driver.needsReview > 0 ? `${cats.driver.needsReview} need review` : "",
        cats.driver.unknown > 0 ? `${cats.driver.unknown} unknown` : "",
      ].filter(Boolean),
    },
    {
      key: "date",
      count: dateIssues,
      sublines: [
        cats.dates.missing > 0 ? `${cats.dates.missing} missing` : "",
        cats.dates.invalid > 0 ? `${cats.dates.invalid} invalid` : "",
        cats.dates.future > 0 ? `${cats.dates.future} future` : "",
      ].filter(Boolean),
    },
    {
      key: "financial",
      count: finIssues,
      sublines: [
        cats.financial.negativeValues > 0 ? `${cats.financial.negativeValues} negative values` : "",
        cats.financial.missingTotals > 0 ? `${cats.financial.missingTotals} missing totals` : "",
        cats.financial.discrepancies > 0 ? `${cats.financial.discrepancies} discrepancies` : "",
      ].filter(Boolean),
    },
  ];

  return (
    <div className="space-y-3">
      {/* Row count summary */}
      <div className="flex gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded-full">
          <CheckCircle2 className="h-3 w-3" /> {validation.validRows.toLocaleString()} valid
        </span>
        {validation.warningRows > 0 && (
          <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1 rounded-full">
            <AlertTriangle className="h-3 w-3" /> {validation.warningRows.toLocaleString()} warnings
          </span>
        )}
        {validation.errorRows > 0 && (
          <span className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded-full">
            <XCircle className="h-3 w-3" /> {validation.errorRows.toLocaleString()} errors
          </span>
        )}
        <span className="text-xs text-muted-foreground ml-1">of {validation.totalRows.toLocaleString()} total rows</span>
      </div>

      {/* Category cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {categories.map(({ key, count, sublines }) => {
          const cfg = CATEGORY_CONFIG[key as keyof typeof CATEGORY_CONFIG];
          const Icon = cfg.icon;
          const isActive = activeCategory === key;
          const hasIssues = count > 0;
          return (
            <button
              key={key}
              onClick={() => onFilterCategory(isActive ? "" : key)}
              className={`text-left border rounded-lg p-2.5 transition-all ${
                isActive
                  ? `${cfg.bg} ring-2 ring-offset-1 ring-current ${cfg.color}`
                  : hasIssues
                    ? `${cfg.bg} hover:ring-1 hover:ring-current ${cfg.color}`
                    : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className="h-3 w-3 shrink-0" />
                <span className="text-xs font-medium">{cfg.label}</span>
              </div>
              <p className={`text-lg font-bold tabular-nums ${hasIssues ? cfg.color : "text-muted-foreground"}`}>
                {count}
              </p>
              {sublines.length > 0 && (
                <div className="mt-0.5 space-y-0.5">
                  {sublines.map((s, i) => <p key={i} className="text-[10px] opacity-80">{s}</p>)}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Period conflict banner */}
      {cats.duplicates.periodAlreadyImported && (
        <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded-lg p-3">
          <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Reporting period already imported</p>
            <p className="text-xs mt-0.5">A previous batch has already been imported for this period and import type. Switch to <strong>Correction</strong> mode if you intend to supersede it, or choose a different period.</p>
            {cats.duplicates.conflictBatchId && (
              <p className="text-xs mt-0.5 font-mono opacity-70">Conflict batch: {cats.duplicates.conflictBatchId.slice(0, 8)}…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Confidence Tier Badge ─────────────────────────────────────────────────────

function TierBadge({ tier, score }: { tier?: string | null; score?: number | null }) {
  const cfg: Record<string, { label: string; color: string; dot: string }> = {
    exact:   { label: "Exact",   color: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
    high:    { label: "High",    color: "bg-green-50 text-green-700 border-green-200",       dot: "bg-green-500" },
    medium:  { label: "Medium",  color: "bg-amber-50 text-amber-700 border-amber-200",       dot: "bg-amber-500" },
    low:     { label: "Low",     color: "bg-orange-50 text-orange-700 border-orange-200",    dot: "bg-orange-500" },
    unknown: { label: "Unknown", color: "bg-gray-50 text-gray-500 border-gray-200",          dot: "bg-gray-400" },
  };
  const t = tier ?? "unknown";
  const c = cfg[t] ?? cfg.unknown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${c.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}{score != null && tier !== "exact" ? ` (${score}%)` : ""}
    </span>
  );
}

// ── Batch Detail Dialog ────────────────────────────────────────────────────────

function BatchDetail({ batch, onClose, onImport, onDeleted, onOpenMappings }: {
  batch: BatchListItem;
  onClose: () => void;
  onImport: () => void;
  onDeleted: () => void;
  onOpenMappings?: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"summary" | "rows" | "audit">("summary");
  const [tierFilter, setTierFilter] = useState("all");
  const [rowPage, setRowPage] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const PAGE_SIZE = 25;

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: rowData, isLoading: rowsLoading } = useQuery({
    queryKey: ["/api/data-imports", batch.id, "rows", rowPage, tierFilter],
    queryFn: () => {
      const p = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(rowPage * PAGE_SIZE) });
      if (tierFilter === "error") p.set("status", "error");
      else if (tierFilter && tierFilter !== "all") p.set("tier", tierFilter);
      return apiRequest("GET", `/api/data-imports/${batch.id}/rows?${p}`).then(r => r.json());
    },
    enabled: !!batch.id && activeTab === "rows",
  });

  const { data: auditData } = useQuery({
    queryKey: ["/api/data-imports", batch.id, "audit"],
    queryFn: () => apiRequest("GET", `/api/data-imports/${batch.id}/audit`).then(r => r.json()),
    enabled: !!batch.id && activeTab === "audit",
  });

  const IMPORTED_STATUSES = ["imported", "completed_with_warnings", "completed_with_exceptions"];
  const isMoveImported         = batch.importType === "move_report"      && IMPORTED_STATUSES.includes(batch.status);
  const isDriverReturnImported = batch.importType === "driver_return"     && IMPORTED_STATUSES.includes(batch.status);
  const isUberImported         = batch.importType === "uber_transaction"  && IMPORTED_STATUSES.includes(batch.status);
  const { data: batchSummary } = useQuery({
    queryKey: ["/api/data-imports", batch.id, "summary"],
    queryFn: () => apiRequest("GET", `/api/data-imports/${batch.id}/summary`).then(r => r.json()),
    enabled: isMoveImported || isDriverReturnImported || isUberImported,
  });

  // ── Derived data ─────────────────────────────────────────────────────────────

  const validation  = batch.validationResult as ValidationResult | null;
  const headers     = (batch.columnHeaders as string[] | null) ?? [];
  const rows: StagedRow[] = rowData?.rows ?? [];
  const totalRowsInFilter  = rowData?.total ?? 0;

  const catDriver    = validation?.categories?.driver;
  const catAccount   = validation?.categories?.account;
  const catDuplicates= validation?.categories?.duplicates;
  const catFinancial = validation?.categories?.financial;

  const totalRead    = validation?.totalRows ?? batch.recordsRead ?? 0;
  const exact        = catDriver?.exact    ?? 0;
  const high         = catDriver?.high     ?? 0;
  const medium       = catDriver?.medium   ?? 0;
  const low          = catDriver?.low      ?? 0;
  const unknownDrv   = catDriver?.unknown  ?? 0;
  const blocking     = validation?.errorRows ?? 0;
  const autoAccepted = exact + high;
  const reviewRec    = medium;
  const manualReq    = low + unknownDrv;

  // If we have no tier breakdown yet (pre-pipeline-upgrade batch), fall back to legacy fields
  const hasNewTierData = (catDriver?.exact !== undefined) || (catDriver?.high !== undefined);

  const importResult  = batch.importResult as any;
  const recordsHeld   = importResult?.recordsHeld ?? 0;

  const canImport     = ["ready_for_import", "completed_with_warnings"].includes(batch.status);
  const isImported    = IMPORTED_STATUSES.includes(batch.status);
  const hasHeld       = recordsHeld > 0;
  const canCancel     = !isImported && batch.status !== "importing";

  // Risk level for pre-import banner
  const riskLabel = manualReq > 0 ? { level: "amber", text: "Review required", sub: `${manualReq} rows need manual resolution before they can be imported` }
    : medium > 0 ? { level: "blue", text: "Review recommended", sub: `${medium} rows will import with proposed matches flagged for post-import review` }
    : { level: "green", text: "High confidence", sub: "All drivers matched at high confidence — safe to import" };

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleCancel = async () => {
    if (!confirm("Cancel and delete this import batch? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await apiRequest("DELETE", `/api/data-imports/${batch.id}`);
      toast({ title: "Import cancelled", description: "The batch has been removed." });
      onDeleted();
    } catch {
      toast({ title: "Cancel failed", description: "Could not delete this batch.", variant: "destructive" });
    } finally { setDeleting(false); }
  };

  const handleRevalidate = async () => {
    setRevalidating(true);
    try {
      await apiRequest("POST", `/api/data-imports/${batch.id}/validate`);
      qc.invalidateQueries({ queryKey: ["/api/data-imports"] });
      toast({ title: "Re-validation complete", description: "Validation results have been refreshed." });
    } catch {
      toast({ title: "Re-validation failed", description: "Could not re-run validation.", variant: "destructive" });
    } finally { setRevalidating(false); }
  };

  const handleResolveHeld = async () => {
    setResolving(true);
    try {
      const res = await apiRequest("POST", `/api/data-imports/${batch.id}/resolve-held`);
      const data = await res.json();
      qc.invalidateQueries({ queryKey: ["/api/data-imports"] });
      toast({
        title: "Held rows re-evaluated",
        description: `${data.rowsMadeEligible ?? 0} rows became eligible and were imported.`,
      });
      onImport();
    } catch {
      toast({ title: "Re-import failed", description: "Could not process held rows.", variant: "destructive" });
    } finally { setResolving(false); }
  };

  const tierTabs = [
    { id: "all",           label: "All",                count: totalRead },
    { id: "auto_accepted", label: "Auto-Accepted",      count: autoAccepted },
    { id: "medium",        label: "Review Recommended", count: reviewRec },
    { id: "manual_required",label:"Manual Required",    count: manualReq },
    ...(hasHeld || recordsHeld > 0 ? [{ id: "held", label: "Held", count: recordsHeld }] : []),
    { id: "error",         label: "Errors",             count: blocking },
  ];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0" />
            <span className="truncate max-w-xs">{batch.fileName}</span>
            <StatusBadge status={batch.status} />
            <ValidationStatusBadge status={batch.validationStatus} />
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">

          {/* ── Risk / Status Banner ───────────────────────────────────────────── */}
          {validation && !isImported && (
            <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${
              riskLabel.level === "amber" ? "bg-amber-50 border-amber-200 text-amber-900"
              : riskLabel.level === "blue"  ? "bg-blue-50 border-blue-200 text-blue-900"
              : "bg-emerald-50 border-emerald-200 text-emerald-900"
            }`}>
              <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${riskLabel.level === "amber" ? "text-amber-500" : riskLabel.level === "blue" ? "text-blue-500" : "text-emerald-500"}`} />
              <div>
                <span className="font-semibold">{riskLabel.text}: </span>
                <span className="opacity-90">{riskLabel.sub}</span>
                {blocking > 0 && (
                  <span className="ml-2 opacity-75">• {blocking} blocking rows will be skipped.</span>
                )}
              </div>
            </div>
          )}

          {/* ── Held-rows banner (post-import) ─────────────────────────────────── */}
          {hasHeld && (
            <div className="flex items-start gap-2.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5 text-sm text-orange-900">
              <PauseCircle className="h-4 w-4 mt-0.5 shrink-0 text-orange-500" />
              <div className="flex-1">
                <p className="font-semibold mb-0.5">{recordsHeld} row{recordsHeld !== 1 ? "s" : ""} held — driver identity could not be confirmed automatically</p>
                <p className="text-orange-800 text-xs">
                  Map each unrecognised driver name to a DriverHub driver record, then click{" "}
                  <strong>Re-Import Held Records</strong> to re-evaluate. Saved mappings apply to all future imports.
                </p>
              </div>
              {onOpenMappings && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 border-orange-300 text-orange-800 hover:bg-orange-100 h-7 text-xs"
                  onClick={onOpenMappings}
                >
                  <GitMerge className="h-3 w-3 mr-1.5" />
                  Review Driver Mappings
                </Button>
              )}
            </div>
          )}

          {/* ── Error message — only shown when the FINAL status is an error terminal state.
               Transient errorMessage values from mid-stream failures are suppressed once
               the batch has reached a successful terminal status. ──────────────────── */}
          {batch.errorMessage && ["processing_error", "failed", "validation_failed"].includes(batch.status) && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{batch.errorMessage}</span>
            </div>
          )}
          {batch.notes && (
            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{batch.notes}</span>
            </div>
          )}

          {/* ── Workflow Step Indicator ────────────────────────────────────────── */}
          {(() => {
            type StepState = "pending" | "active" | "complete" | "failed";
            const isError = batch.status === "processing_error" || batch.status === "failed";
            const isValidationFailed = batch.status === "validation_failed";
            const isValidating = batch.status === "validating";
            const isImporting = batch.status === "importing";

            const s1: StepState = "complete";
            const s2: StepState = isValidating ? "active" : isValidationFailed ? "failed" : (isError && !canImport && !isImported) ? "failed" : "complete";
            const s3: StepState = isValidationFailed ? "pending" : isImported ? "complete" : canImport ? "active" : isImporting ? "complete" : "pending";
            const s4: StepState = isImporting ? "active" : isImported ? "complete" : isError && (isImported || batch.status === "processing_error") ? "failed" : "pending";
            const s5: StepState = isImported ? "complete" : "pending";

            const steps: { label: string; state: StepState }[] = [
              { label: "Uploaded",   state: s1 },
              { label: "Validated",  state: s2 },
              { label: "Review",     state: s3 },
              { label: "Import",     state: s4 },
              { label: "Complete",   state: s5 },
            ];

            return (
              <div className="flex items-center gap-0">
                {steps.map((step, i) => (
                  <div key={step.label} className="flex items-center flex-1">
                    <div className="flex flex-col items-center flex-1">
                      <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${
                        step.state === "complete" ? "bg-emerald-500 border-emerald-500 text-white"
                        : step.state === "active"  ? "bg-primary border-primary text-primary-foreground animate-pulse"
                        : step.state === "failed"  ? "bg-red-500 border-red-500 text-white"
                        : "bg-muted border-muted-foreground/30 text-muted-foreground"
                      }`}>
                        {step.state === "complete" ? "✓" : step.state === "failed" ? "✕" : i + 1}
                      </div>
                      <span className={`text-[10px] mt-0.5 font-medium ${
                        step.state === "active" ? "text-primary" : step.state === "failed" ? "text-red-600" : step.state === "complete" ? "text-emerald-700" : "text-muted-foreground"
                      }`}>{step.label}</span>
                    </div>
                    {i < steps.length - 1 && (
                      <div className={`h-px flex-none w-4 -mt-4 ${step.state === "complete" ? "bg-emerald-400" : "bg-muted-foreground/20"}`} />
                    )}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ── Tabs ──────────────────────────────────────────────────────────── */}
          <div className="border-b">
            <div className="flex gap-1">
              {([
                { id: "summary", label: "Import Summary" },
                { id: "rows",    label: "Row Review" },
                { id: "audit",   label: "Audit Trail" },
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Import Summary Tab ───────────────────────────────────────────── */}
          {activeTab === "summary" && (
            <div className="space-y-4">

              {/* Metadata strip */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-xs border rounded-lg p-3 bg-muted/30">
                <div><span className="text-muted-foreground">Type: </span><span className="font-medium">{DATA_IMPORT_TYPE_LABELS[batch.importType as keyof typeof DATA_IMPORT_TYPE_LABELS] ?? batch.importType}</span></div>
                <div><span className="text-muted-foreground">Source: </span><span className="font-medium capitalize">{(batch as any).sourceSystemKey ?? "—"}</span></div>
                <div><span className="text-muted-foreground">Mode: </span><span className="font-medium capitalize">{(batch as any).batchMode ?? "supplement"}</span></div>
                <div><span className="text-muted-foreground">Uploaded by: </span><span className="font-medium">{(batch as any).importedByName ?? "—"}</span></div>
                <div><span className="text-muted-foreground">Date: </span><span className="font-medium">{batch.createdAt ? format(parseISO(String(batch.createdAt)), "MMM d, yyyy h:mm a") : "—"}</span></div>
                {batch.reportingPeriodStart && (
                  <div><span className="text-muted-foreground">Period: </span><span className="font-medium">{batch.reportingPeriodStart} → {batch.reportingPeriodEnd ?? "—"}</span></div>
                )}
              </div>

              {/* Validation engine error */}
              {validation && (validation as any).error && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-200">
                  <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-red-800">Validation engine error</p>
                    <p className="text-xs mt-0.5 text-red-700">The validation engine encountered an unexpected error. Re-validate to retry.</p>
                    <p className="text-xs mt-2 font-mono bg-red-100 border border-red-200 rounded px-2 py-1.5 text-red-800 break-all">{(validation as any).error}</p>
                  </div>
                </div>
              )}

              {/* Records grid */}
              {validation && !(validation as any).error && (
                <>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Records Breakdown</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {[
                        { label: "Read",              value: totalRead,        color: "text-foreground",   note: "all rows in file" },
                        { label: "Auto-Accepted",     value: autoAccepted,     color: "text-emerald-600",  note: "exact + high confidence" },
                        { label: "Review Recommended",value: reviewRec,        color: "text-amber-600",    note: "medium — imports, flagged" },
                        { label: "Manual Required",   value: manualReq,        color: "text-orange-600",   note: "low / unknown — held" },
                        { label: "Blocking",          value: blocking,         color: "text-red-600",      note: "validation errors, skipped" },
                      ].map(c => (
                        <div key={c.label} className="border rounded-lg p-2.5 bg-muted/20 space-y-0.5">
                          <p className="text-[10px] text-muted-foreground">{c.label}</p>
                          <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value.toLocaleString()}</p>
                          <p className="text-[10px] text-muted-foreground/60 leading-tight">{c.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Post-import committed counts */}
                  {isImported && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Import Results</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { label: "Imported",       value: batch.recordsImported ?? 0,  color: "text-emerald-600" },
                          { label: "Updated",        value: batch.recordsUpdated  ?? 0,  color: "text-blue-600"    },
                          { label: "Skipped",        value: batch.recordsSkipped  ?? 0,  color: "text-muted-foreground" },
                          { label: "Held",           value: recordsHeld,                 color: recordsHeld > 0 ? "text-orange-600" : "text-muted-foreground" },
                        ].map(c => (
                          <div key={c.label} className="border rounded-lg p-2.5 bg-muted/20">
                            <p className="text-xs text-muted-foreground">{c.label}</p>
                            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value.toLocaleString()}</p>
                          </div>
                        ))}
                      </div>

                      {/* Business outcome narrative */}
                      <div className="mt-3 rounded-lg border bg-muted/20 px-3 py-2.5 space-y-1">
                        <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">What happened</h4>
                        <ul className="text-xs text-foreground space-y-0.5">
                          {batch.importType === "move_report" && (<>
                            <li className="flex items-start gap-1.5"><span className="text-muted-foreground mt-0.5">•</span>{(totalRead).toLocaleString()} moves received from source file</li>
                            {(batch.recordsImported ?? 0) > 0 && <li className="flex items-start gap-1.5"><span className="text-emerald-500 mt-0.5">•</span><span><strong className="text-emerald-700">{(batch.recordsImported ?? 0).toLocaleString()}</strong> new move records created</span></li>}
                            {(batch.recordsUpdated ?? 0) > 0  && <li className="flex items-start gap-1.5"><span className="text-blue-500 mt-0.5">•</span><span><strong className="text-blue-700">{(batch.recordsUpdated ?? 0).toLocaleString()}</strong> existing records updated</span></li>}
                            {(batch.recordsSkipped ?? 0) > 0  && <li className="flex items-start gap-1.5"><span className="text-muted-foreground mt-0.5">•</span>{(batch.recordsSkipped ?? 0).toLocaleString()} duplicate records skipped</li>}
                            {recordsHeld > 0  && <li className="flex items-start gap-1.5"><span className="text-orange-500 mt-0.5">•</span><span><strong className="text-orange-700">{recordsHeld.toLocaleString()}</strong> rows held — driver identity could not be confirmed automatically</span></li>}
                            {blocking > 0     && <li className="flex items-start gap-1.5"><span className="text-red-500 mt-0.5">•</span>{blocking.toLocaleString()} rows excluded due to validation errors</li>}
                          </>)}
                          {batch.importType === "driver_return" && (<>
                            <li className="flex items-start gap-1.5"><span className="text-muted-foreground mt-0.5">•</span>{(totalRead).toLocaleString()} DriverReturn records received from source file</li>
                            {(batch.recordsImported ?? 0) > 0 && <li className="flex items-start gap-1.5"><span className="text-emerald-500 mt-0.5">•</span><span><strong className="text-emerald-700">{(batch.recordsImported ?? 0).toLocaleString()}</strong> new DriverReturn records created</span></li>}
                            {(batch.recordsUpdated ?? 0) > 0  && <li className="flex items-start gap-1.5"><span className="text-blue-500 mt-0.5">•</span><span><strong className="text-blue-700">{(batch.recordsUpdated ?? 0).toLocaleString()}</strong> existing records matched and updated</span></li>}
                            {recordsHeld > 0  && <li className="flex items-start gap-1.5"><span className="text-orange-500 mt-0.5">•</span><span><strong className="text-orange-700">{recordsHeld.toLocaleString()}</strong> rows held — driver confidence too low for automatic import</span></li>}
                            {blocking > 0     && <li className="flex items-start gap-1.5"><span className="text-red-500 mt-0.5">•</span>{blocking.toLocaleString()} rows excluded due to validation errors</li>}
                          </>)}
                          {batch.importType === "uber_transaction" && (<>
                            <li className="flex items-start gap-1.5"><span className="text-muted-foreground mt-0.5">•</span>{(totalRead).toLocaleString()} Uber transactions received from source file</li>
                            {(batch.recordsImported ?? 0) > 0 && <li className="flex items-start gap-1.5"><span className="text-emerald-500 mt-0.5">•</span><span><strong className="text-emerald-700">{(batch.recordsImported ?? 0).toLocaleString()}</strong> new DriverReturn records created</span></li>}
                            {(batch.recordsUpdated ?? 0) > 0  && <li className="flex items-start gap-1.5"><span className="text-blue-500 mt-0.5">•</span><span><strong className="text-blue-700">{(batch.recordsUpdated ?? 0).toLocaleString()}</strong> existing DriverReturn records matched</span></li>}
                            {(batch.recordsSkipped ?? 0) > 0  && <li className="flex items-start gap-1.5"><span className="text-muted-foreground mt-0.5">•</span>{(batch.recordsSkipped ?? 0).toLocaleString()} transactions excluded (Payment / Service Fee rows)</li>}
                            {recordsHeld > 0  && <li className="flex items-start gap-1.5"><span className="text-orange-500 mt-0.5">•</span><span><strong className="text-orange-700">{recordsHeld.toLocaleString()}</strong> rows held for manual driver review</span></li>}
                            {blocking > 0     && <li className="flex items-start gap-1.5"><span className="text-red-500 mt-0.5">•</span>{blocking.toLocaleString()} rows excluded due to validation errors</li>}
                          </>)}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Driver matching by confidence tier */}
                  {validation?.categories && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Driver Matching</h3>
                      {hasNewTierData ? (
                        <div className="border rounded-lg divide-y bg-card">
                          {[
                            { tier: "exact",   label: "Exact match",             count: exact,      note: "Name matches system record exactly — auto-imported",      dotColor: "bg-emerald-500" },
                            { tier: "high",    label: "High confidence ≥90%",    count: high,       note: "Near-exact match — auto-imported",                         dotColor: "bg-green-500"   },
                            { tier: "medium",  label: "Medium confidence 75–89%",count: medium,     note: "Proposed match flagged for post-import review — imports",  dotColor: "bg-amber-500"   },
                            { tier: "low",     label: "Low confidence <75%",     count: low,        note: "Held until manually resolved",                             dotColor: "bg-orange-500"  },
                            { tier: "unknown", label: "No match found",          count: unknownDrv, note: "Held until a driver is mapped",                            dotColor: "bg-gray-400"    },
                          ].map(row => (
                            <div key={row.tier} className="flex items-center gap-3 px-3 py-2">
                              <span className={`h-2 w-2 rounded-full ${row.dotColor} shrink-0`} />
                              <span className="text-xs font-medium w-44 shrink-0">{row.label}</span>
                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className={`h-full ${row.dotColor} rounded-full`} style={{ width: totalRead > 0 ? `${(row.count / totalRead) * 100}%` : "0%" }} />
                              </div>
                              <span className="text-xs font-medium w-10 text-right tabular-nums">{row.count.toLocaleString()}</span>
                              <span className="text-[10px] text-muted-foreground w-48 truncate hidden sm:block">{row.note}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="border rounded-lg bg-card">
                          <div className="px-4 py-3 flex items-start gap-2.5 text-xs text-muted-foreground">
                            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                            <div>
                              <p className="font-medium text-foreground">Confidence breakdown unavailable for this legacy validation</p>
                              <p className="mt-0.5">This batch was validated before confidence scoring was introduced. Use <span className="font-medium">Re-Validate</span> to generate an updated breakdown.</p>
                              {catDriver && (
                                <div className="mt-2 flex gap-4">
                                  <span>Auto-matched: <span className="font-medium text-emerald-600">{catDriver.autoMatch ?? 0}</span></span>
                                  <span>Needs review: <span className="font-medium text-amber-600">{catDriver.needsReview ?? 0}</span></span>
                                  <span>Unknown: <span className="font-medium text-red-600">{catDriver.unknown ?? 0}</span></span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Account + duplicates + financial row */}
                  {catAccount && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="border rounded-lg p-3 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                          <Building2 className="h-3 w-3" /> Account Matching
                        </div>
                        {(catAccount as any).exact !== undefined ? (
                          // Tier-aware display (new batches)
                          [
                            { label: "Exact match",       value: (catAccount as any).exact   ?? 0, color: "text-emerald-600" },
                            { label: "High ≥90%",         value: (catAccount as any).high    ?? 0, color: "text-green-600"   },
                            { label: "Medium 75–89%",     value: (catAccount as any).medium  ?? 0, color: "text-amber-600"   },
                            { label: "Low / held",        value: ((catAccount as any).low ?? 0) + ((catAccount as any).unknown ?? 0), color: "text-red-600" },
                          ].map(r => (
                            <div key={r.label} className="flex justify-between text-xs">
                              <span className="text-muted-foreground">{r.label}</span>
                              <span className={`font-semibold ${r.color}`}>{r.value.toLocaleString()}</span>
                            </div>
                          ))
                        ) : (
                          // Legacy display
                          [
                            { label: "Auto-matched", value: catAccount.autoMatch,    color: "text-emerald-600" },
                            { label: "Needs review", value: catAccount.needsReview,  color: "text-amber-600" },
                            { label: "Unknown",      value: catAccount.unknown,      color: "text-red-600" },
                          ].map(r => (
                            <div key={r.label} className="flex justify-between text-xs">
                              <span className="text-muted-foreground">{r.label}</span>
                              <span className={`font-semibold ${r.color}`}>{r.value.toLocaleString()}</span>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="border rounded-lg p-3 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                          <Copy className="h-3 w-3" /> Duplicates
                        </div>
                        <div className="flex justify-between text-xs"><span className="text-muted-foreground">Within file</span><span className="font-semibold">{catDuplicates?.withinFile ?? 0}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-muted-foreground">Cross-batch</span><span className="font-semibold">{catDuplicates?.crossBatch ?? 0}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-muted-foreground">Period conflict</span><span className={`font-semibold ${catDuplicates?.periodAlreadyImported ? "text-amber-600" : ""}`}>{catDuplicates?.periodAlreadyImported ? "Yes" : "No"}</span></div>
                      </div>
                      <div className="border rounded-lg p-3 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                          <DollarSign className="h-3 w-3" /> Financial
                        </div>
                        <div className="flex justify-between text-xs"><span className="text-muted-foreground">Negative values</span><span className="font-semibold">{catFinancial?.negativeValues ?? 0}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-muted-foreground">Missing totals</span><span className="font-semibold">{catFinancial?.missingTotals ?? 0}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-muted-foreground">Discrepancies</span><span className="font-semibold">{catFinancial?.discrepancies ?? 0}</span></div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Move Report post-import financial summary */}
              {isMoveImported && batchSummary && (
                <div className="space-y-3 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Move Import Results</h3>
                    <a href={`/trips?importBatchId=${batch.id}`} className="text-xs text-primary hover:underline flex items-center gap-1" target="_blank" rel="noopener noreferrer">
                      View in Moves <ArrowRight className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: "Total Moves",    value: batchSummary.trips?.tripCount ?? batchSummary.stats?.total ?? "—", color: "text-foreground" },
                      { label: "Completed",      value: batchSummary.stats?.completed ?? "—",  color: "text-emerald-600" },
                      { label: "Cancelled",      value: batchSummary.stats?.cancelled ?? "—",  color: "text-amber-600" },
                      { label: "Linked to Move", value: batchSummary.stats?.linked ?? "—",     color: "text-blue-600" },
                    ].map(c => (
                      <div key={c.label} className="border rounded-lg p-2.5 bg-muted/20">
                        <p className="text-xs text-muted-foreground">{c.label}</p>
                        <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
                      </div>
                    ))}
                  </div>
                  {batchSummary.trips?.totalRevenue != null && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: "Revenue",       value: batchSummary.trips?.totalRevenue,             fmt: "currency", color: "text-emerald-700" },
                        { label: "Driver Pay",    value: batchSummary.trips?.totalDriverPay,           fmt: "currency", color: "text-foreground" },
                        { label: "Gross Profit",  value: batchSummary.trips?.totalGrossProfit,         fmt: "currency", color: parseFloat(batchSummary.trips?.totalGrossProfit ?? "0") >= 0 ? "text-emerald-600" : "text-red-600" },
                        { label: "Gross Margin",  value: batchSummary.trips?.grossMarginPct,           fmt: "pct",      color: "text-blue-600" },
                      ].map(c => (
                        <div key={c.label} className="border rounded-lg p-2.5 bg-muted/20">
                          <p className="text-xs text-muted-foreground">{c.label}</p>
                          <p className={`text-xl font-bold tabular-nums ${c.color}`}>
                            {c.value == null ? "—" : c.fmt === "pct" ? `${parseFloat(String(c.value)).toFixed(1)}%` : `$${parseFloat(String(c.value)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Driver Return post-import summary */}
              {isDriverReturnImported && batchSummary && (
                <div className="space-y-3 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Driver Return Import Results</h3>
                    <a href={`/driver-returns?batchId=${batch.id}`} className="text-xs text-primary hover:underline flex items-center gap-1">View in Driver Returns <ArrowRight className="h-3 w-3" /></a>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: "Total",     value: batchSummary.stats?.total     ?? "—", color: "text-foreground" },
                      { label: "Matched",   value: batchSummary.stats?.matched   ?? "—", color: "text-emerald-600" },
                      { label: "Unmatched", value: batchSummary.stats?.unmatched ?? "—", color: "text-red-600" },
                      { label: "Completed", value: batchSummary.stats?.completed ?? "—", color: "text-emerald-600" },
                    ].map(c => (
                      <div key={c.label} className="border rounded-lg p-2.5 bg-muted/20">
                        <p className="text-xs text-muted-foreground">{c.label}</p>
                        <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
                      </div>
                    ))}
                  </div>
                  {(batchSummary.stats?.unmatched ?? 0) > 0 && (
                    <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 rounded-md p-2.5">
                      <Info className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span className="text-amber-800"><strong>{batchSummary.stats.unmatched} unmatched</strong> records are in the exception queue. Import the corresponding Move Report first, then re-import this batch.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Uber post-import summary */}
              {isUberImported && batchSummary && (
                <div className="space-y-3 pt-2 border-t">
                  <h3 className="text-sm font-semibold">Uber Match Results</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: "Unique Trips",   value: batchSummary.stats?.trips?.totalTrips ?? "—",     color: "text-foreground" },
                      { label: "Matched",         value: batchSummary.stats?.trips?.matched ?? "—",        color: "text-emerald-600" },
                      { label: "Low Confidence",  value: batchSummary.stats?.trips?.lowConfidence ?? "—",  color: "text-amber-600" },
                      { label: "Unmatched",       value: batchSummary.stats?.trips?.unmatched ?? "—",      color: "text-red-600" },
                    ].map(c => (
                      <div key={c.label} className="border rounded-lg p-2.5 bg-muted/20">
                        <p className="text-xs text-muted-foreground">{c.label}</p>
                        <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No data yet */}
              {!validation && !isImported && (
                <p className="text-sm text-muted-foreground py-6 text-center">No validation data available. Upload a file to begin.</p>
              )}
            </div>
          )}

          {/* ── Row Review Tab ───────────────────────────────────────────────── */}
          {activeTab === "rows" && (
            <div className="space-y-3">
              {/* Tier filter chips */}
              <div className="flex flex-wrap gap-1.5">
                {tierTabs.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setTierFilter(t.id); setRowPage(0); }}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      tierFilter === t.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {t.label}
                    <span className={`text-[10px] font-bold ${tierFilter === t.id ? "opacity-80" : "opacity-60"}`}>{t.count.toLocaleString()}</span>
                  </button>
                ))}
              </div>

              {/* Severity model note */}
              {tierFilter === "all" && (
                <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/30 border rounded px-2.5 py-1.5">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Only <strong>Low</strong> and <strong>Unknown</strong> confidence rows are held. Blocking errors (invalid data) cause rows to be skipped entirely.</span>
                </div>
              )}

              {rowsLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading rows…</div>
              ) : rows.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {tierFilter === "all" ? "No rows in this batch" : `No rows in this filter`}
                </div>
              ) : (
                <div className="border rounded overflow-auto max-h-80">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-10 text-xs">#</TableHead>
                        <TableHead className="text-xs">Source Driver</TableHead>
                        <TableHead className="text-xs">DriverHub Match</TableHead>
                        <TableHead className="w-32 text-xs">Confidence</TableHead>
                        <TableHead className="w-20 text-xs">Status</TableHead>
                        <TableHead className="text-xs">Issues</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map(row => {
                        const md = row.mappedData as any;
                        const dm = md?.driverMatch;
                        const tier = dm?.confidenceTier as string | null;
                        const score = dm?.confidenceScore as number | null;
                        const rowBg = row.importStatus === "held"
                          ? "bg-orange-50/40"
                          : tier === "medium" ? "bg-amber-50/30"
                          : row.validationStatus === "error" ? "bg-red-50/40"
                          : "";
                        return (
                          <TableRow key={row.id} className={rowBg}>
                            <TableCell className="text-xs text-muted-foreground">{row.rowIndex + 1}</TableCell>
                            <TableCell className="text-xs font-medium">
                              {dm?.sourceName ?? String(row.rawData["Driver"] ?? row.rawData["DriverName"] ?? "—")}
                            </TableCell>
                            <TableCell className="text-xs">
                              {dm?.resolvedName ? (
                                <span className={tier === "exact" || tier === "high" ? "text-emerald-700" : "text-muted-foreground"}>
                                  {dm.resolvedName}
                                </span>
                              ) : (
                                <span className="text-red-500 italic">No match</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <TierBadge tier={tier} score={score} />
                            </TableCell>
                            <TableCell className="text-xs">
                              {row.importStatus === "imported"  && <span className="text-emerald-600 font-medium">Imported</span>}
                              {row.importStatus === "updated"   && <span className="text-blue-600 font-medium">Updated</span>}
                              {row.importStatus === "held"      && <span className="text-orange-600 font-medium">Held</span>}
                              {row.importStatus === "skipped"   && <span className="text-muted-foreground">Skipped</span>}
                              {row.importStatus === "pending"   && <span className="text-muted-foreground">Pending</span>}
                              {row.importStatus === "failed"    && <span className="text-red-500">Failed</span>}
                              {!["imported","updated","held","skipped","pending","failed"].includes(row.importStatus) && (
                                <span className="text-muted-foreground capitalize">{row.importStatus}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs max-w-44 truncate">
                              {row.importError && <span className="text-red-500" title={row.importError}>{row.importError}</span>}
                              {!row.importError && row.validationErrors && row.validationErrors.length > 0 && (
                                <span className="text-muted-foreground" title={row.validationErrors.map(e => e.message).join("; ")}>
                                  {row.validationErrors.length} issue{row.validationErrors.length > 1 ? "s" : ""}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {totalRowsInFilter > PAGE_SIZE && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Showing {rowPage * PAGE_SIZE + 1}–{Math.min((rowPage + 1) * PAGE_SIZE, totalRowsInFilter)} of {totalRowsInFilter.toLocaleString()}</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-6 w-6 p-0" disabled={rowPage === 0} onClick={() => setRowPage(p => p - 1)}><ChevronLeft className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" className="h-6 w-6 p-0" disabled={(rowPage + 1) * PAGE_SIZE >= totalRowsInFilter} onClick={() => setRowPage(p => p + 1)}><ChevronRight className="h-3 w-3" /></Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Audit Trail Tab ──────────────────────────────────────────────── */}
          {activeTab === "audit" && (
            <div className="space-y-4">
              {!auditData ? (
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading audit trail…</div>
              ) : (
                <>
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timeline</h3>
                    <div className="space-y-2">
                      {(auditData.timeline ?? []).map((t: any, i: number) => (
                        <div key={i} className="flex items-start gap-3 text-sm">
                          <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                          <div>
                            <p className="font-medium capitalize">{t.event}</p>
                            <p className="text-xs text-muted-foreground">{t.description}</p>
                            <p className="text-xs text-muted-foreground/60">{t.timestamp ? format(parseISO(String(t.timestamp)), "MMM d, yyyy h:mm:ss a") : ""}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Staged Row Stats</h3>
                    <div className="grid grid-cols-4 gap-2">
                      {Object.entries(auditData.rowStats ?? {}).map(([k, v]: [string, any]) =>
                        k !== "total" ? (
                          <div key={k} className="border rounded p-2 bg-muted/20">
                            <p className="text-xs text-muted-foreground capitalize">{k}</p>
                            <p className="text-sm font-bold">{v}</p>
                          </div>
                        ) : null
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">File Info</h3>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                      <div><span className="text-muted-foreground">File name: </span>{auditData.batch?.fileName}</div>
                      <div><span className="text-muted-foreground">Batch mode: </span><span className="capitalize">{auditData.batch?.batchMode ?? "supplement"}</span></div>
                      <div className="col-span-2"><span className="text-muted-foreground">SHA-256: </span><span className="font-mono text-[10px]">{auditData.batch?.fileHash ?? "—"}</span></div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 pt-3 border-t flex-wrap gap-2">
          <div className="flex gap-2 mr-auto flex-wrap">
            {/* Primary action: Import Valid Records Only (pre-import) */}
            {canImport && (
              <Button onClick={onImport} size="sm" className="bg-primary text-primary-foreground">
                <Play className="h-3.5 w-3.5 mr-1.5" />
                Import Valid Records Only
              </Button>
            )}
            {/* Re-import held rows (post-import with exceptions) */}
            {hasHeld && (
              <Button onClick={handleResolveHeld} size="sm" variant="outline" disabled={resolving} className="border-orange-300 text-orange-700 hover:bg-orange-50">
                {resolving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <PauseCircle className="h-3.5 w-3.5 mr-1.5" />}
                Re-Import Held Records
              </Button>
            )}
            {/* Re-validate (pre-import only) */}
            {!isImported && (
              <Button variant="outline" size="sm" onClick={handleRevalidate} disabled={revalidating || batch.status === "importing"}>
                {revalidating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5 mr-1.5" />}
                Re-Validate
              </Button>
            )}
          </div>
          {canCancel && (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleCancel} disabled={deleting}>
              {deleting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Ban className="h-3.5 w-3.5 mr-1.5" />}
              Cancel Import
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Confidence Badge ──────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const cfg: Record<string, { label: string; className: string }> = {
    exact:    { label: "Exact",    className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    fuzzy:    { label: "Fuzzy",    className: "bg-amber-50 text-amber-700 border-amber-200"       },
    manual:   { label: "Manual",   className: "bg-blue-50 text-blue-700 border-blue-200"          },
    auto:     { label: "Auto",     className: "bg-purple-50 text-purple-700 border-purple-200"    },
  };
  const c = cfg[confidence] ?? { label: confidence, className: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${c.className}`}>
      {c.label}
    </span>
  );
}

// ── Resolve Mapping Dialog ────────────────────────────────────────────────────

interface UnresolvedItem {
  entityType: "account" | "driver";
  sourceName: string;
  sourceSystem?: string;
  occurrenceCount?: number;
  lastSeenAt?: string;
}

interface TargetResult {
  id: string;
  name: string;
  subtitle?: string;
}

function ResolveMappingDialog({
  item,
  onClose,
  onResolved,
}: {
  item: UnresolvedItem | { id: string; entityType: "account" | "driver"; sourceName: string; mappedEntityId?: string; mappedEntityName?: string } | null;
  onClose: () => void;
  onResolved: () => void;
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TargetResult | null>(null);
  const [saving, setSaving] = useState(false);

  const isEdit = item && "id" in item && item.id;
  const entityType = item?.entityType ?? "account";

  const { data: targetData, isLoading: targetLoading } = useQuery({
    queryKey: ["/api/data-imports/entity-mappings/search-targets", entityType, query],
    queryFn: () => apiRequest("GET", `/api/data-imports/entity-mappings/search-targets?entityType=${entityType}&q=${encodeURIComponent(query)}`).then(r => r.json()),
    enabled: query.length >= 2,
  });
  const targets: TargetResult[] = targetData?.results ?? [];

  const handleSave = async () => {
    if (!selected || !item) return;
    setSaving(true);
    try {
      if (isEdit) {
        await apiRequest("PATCH", `/api/data-imports/entity-mappings/${(item as any).id}`, {
          mappedEntityId: selected.id,
          mappedEntityName: selected.name,
          confidence: "manual",
        });
      } else {
        await apiRequest("POST", `/api/data-imports/entity-mappings`, {
          entityType: item.entityType,
          sourceName: item.sourceName,
          sourceSystem: (item as any).sourceSystem ?? "redcap",
          mappedEntityId: selected.id,
          mappedEntityName: selected.name,
          confidence: "manual",
        });
      }
      toast({ title: "Mapping saved", description: `"${item.sourceName}" → "${selected.name}"` });
      onResolved();
    } catch {
      toast({ title: "Failed to save mapping", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!item) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-4 w-4 text-muted-foreground" />
            {isEdit ? "Edit Mapping" : "Resolve Mapping"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Source name */}
          <div className="flex items-center gap-3 p-3 bg-muted/40 border rounded-lg">
            {entityType === "account" ? <Building2 className="h-4 w-4 text-muted-foreground" /> : <User className="h-4 w-4 text-muted-foreground" />}
            <div>
              <p className="text-xs text-muted-foreground">Source {entityType === "account" ? "Account" : "Driver"} Name</p>
              <p className="font-medium text-sm">{item.sourceName}</p>
              {(item as any).occurrenceCount != null && (
                <p className="text-xs text-muted-foreground">{(item as any).occurrenceCount} occurrence{(item as any).occurrenceCount > 1 ? "s" : ""} across imports</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-center">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>

          {/* Target search */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Map to DriverHub {entityType === "account" ? "Account" : "Driver"}
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={`Search ${entityType === "account" ? "accounts" : "drivers"}…`}
                value={query}
                onChange={e => { setQuery(e.target.value); setSelected(null); }}
                className="pl-8 h-8 text-sm"
                autoFocus
              />
            </div>

            {query.length >= 2 && (
              <div className="border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                {targetLoading ? (
                  <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                  </div>
                ) : targets.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-muted-foreground">No results for "{query}"</div>
                ) : (
                  targets.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setSelected(t)}
                      className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-muted/60 transition-colors ${selected?.id === t.id ? "bg-primary/10 text-primary" : ""}`}
                    >
                      {selected?.id === t.id && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{t.name}</p>
                        {t.subtitle && <p className="text-xs text-muted-foreground">{t.subtitle}</p>}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {selected && (
              <div className="flex items-center gap-2 p-2 bg-primary/5 border border-primary/20 rounded-lg text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                <span className="font-medium">{selected.name}</span>
                {selected.subtitle && <span className="text-muted-foreground text-xs">· {selected.subtitle}</span>}
                <button onClick={() => setSelected(null)} className="ml-auto text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={!selected || saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5 mr-1.5" />}
            Save Mapping
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Mapping Manager ───────────────────────────────────────────────────────────

function MappingManager() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [subTab, setSubTab] = useState<"account" | "driver" | "unresolved">("unresolved");
  const [search, setSearch] = useState("");
  const [resolveTarget, setResolveTarget] = useState<any>(null);
  const [editTarget, setEditTarget] = useState<any>(null);

  // Fetch mappings for the active entity type tab
  const { data: mappingData, isLoading: mappingsLoading, refetch: refetchMappings } = useQuery({
    queryKey: ["/api/data-imports/entity-mappings/list", subTab, search],
    queryFn: () => apiRequest("GET", `/api/data-imports/entity-mappings/list?entityType=${subTab === "unresolved" ? "" : subTab}&search=${encodeURIComponent(search)}&limit=200`).then(r => r.json()),
    enabled: subTab !== "unresolved",
  });

  // Fetch unresolved items
  const { data: unresolvedData, isLoading: unresolvedLoading, refetch: refetchUnresolved } = useQuery({
    queryKey: ["/api/data-imports/entity-mappings/unresolved"],
    queryFn: () => apiRequest("GET", "/api/data-imports/entity-mappings/unresolved").then(r => r.json()),
    enabled: subTab === "unresolved",
  });

  const mappings: any[] = mappingData?.mappings ?? [];
  const unresolved: UnresolvedItem[] = unresolvedData?.unresolved ?? [];
  const unresolvedCount = unresolvedData?.total ?? 0;

  const handleDeactivate = async (id: string) => {
    if (!confirm("Deactivate this mapping? It will no longer be used during import validation.")) return;
    try {
      await apiRequest("DELETE", `/api/data-imports/entity-mappings/${id}`);
      toast({ title: "Mapping deactivated" });
      refetchMappings();
    } catch {
      toast({ title: "Failed to deactivate", variant: "destructive" });
    }
  };

  const handleResolved = () => {
    setResolveTarget(null);
    setEditTarget(null);
    qc.invalidateQueries({ queryKey: ["/api/data-imports/entity-mappings"] });
  };

  const filteredUnresolved = search
    ? unresolved.filter(u => u.sourceName.toLowerCase().includes(search.toLowerCase()))
    : unresolved;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Entity Mappings</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage how source system names are matched to DriverHub accounts and drivers.
            Saved mappings persist across future imports and are applied automatically.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => { refetchMappings(); refetchUnresolved(); }}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Sub-tabs */}
      <div className="border-b">
        <div className="flex gap-0">
          {([
            { key: "unresolved", label: "Unresolved", badge: unresolvedCount },
            { key: "account",    label: "Account Mappings"  },
            { key: "driver",     label: "Driver Mappings"   },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => { setSubTab(tab.key); setSearch(""); }}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                subTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              {tab.badge != null && tab.badge > 0 && (
                <span className="inline-flex items-center justify-center h-5 min-w-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-80">
        <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={`Search ${subTab === "unresolved" ? "source names" : "mappings"}…`}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>

      {/* ── Unresolved tab ── */}
      {subTab === "unresolved" && (
        <div className="space-y-3">
          {unresolvedLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading unresolved mappings…
            </div>
          ) : filteredUnresolved.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mb-3 text-emerald-400" />
              <p className="font-medium text-sm">All source names are resolved</p>
              <p className="text-xs mt-1">No unknown accounts or drivers from recent imports</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  <strong>{unresolvedCount} unresolved source name{unresolvedCount > 1 ? "s" : ""}</strong> were encountered during recent imports.
                  Resolve each one to prevent import errors.
                </span>
              </div>

              <Card className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="text-xs font-semibold w-24">Type</TableHead>
                      <TableHead className="text-xs font-semibold">Source Name (in file)</TableHead>
                      <TableHead className="text-xs font-semibold w-24 text-right">Occurrences</TableHead>
                      <TableHead className="text-xs font-semibold w-40">Last Seen</TableHead>
                      <TableHead className="text-xs font-semibold w-32 text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUnresolved.map((item, i) => (
                      <TableRow key={`${item.entityType}-${item.sourceName}-${i}`} className="hover:bg-muted/20">
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border ${item.entityType === "account" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-indigo-50 text-indigo-700 border-indigo-200"}`}>
                            {item.entityType === "account" ? <Building2 className="h-3 w-3" /> : <User className="h-3 w-3" />}
                            {item.entityType === "account" ? "Account" : "Driver"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                            <span className="text-sm font-medium">{item.sourceName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                          {item.occurrenceCount?.toLocaleString() ?? 1}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.lastSeenAt ? format(parseISO(item.lastSeenAt), "MMM d, yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => setResolveTarget(item)}
                          >
                            <Link2 className="h-3 w-3 mr-1" /> Resolve
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ── Account / Driver Mappings tabs ── */}
      {(subTab === "account" || subTab === "driver") && (
        <div className="space-y-3">
          {mappingsLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading mappings…
            </div>
          ) : mappings.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <Shuffle className="h-10 w-10 mb-3 opacity-30" />
              <p className="font-medium text-sm">No {subTab} mappings yet</p>
              <p className="text-xs mt-1">Mappings are created automatically during import validation, or you can add one manually.</p>
            </div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground">{mappingData?.total?.toLocaleString()} mapping{mappingData?.total !== 1 ? "s" : ""}</div>
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="text-xs font-semibold min-w-40">Source Name (in file)</TableHead>
                      <TableHead className="text-xs font-semibold w-8 text-center"></TableHead>
                      <TableHead className="text-xs font-semibold min-w-40">DriverHub Record</TableHead>
                      <TableHead className="text-xs font-semibold w-24">Confidence</TableHead>
                      <TableHead className="text-xs font-semibold w-32">Source System</TableHead>
                      <TableHead className="text-xs font-semibold w-32">Created By</TableHead>
                      <TableHead className="text-xs font-semibold w-28 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappings.map(m => (
                      <TableRow key={m.id} className="hover:bg-muted/20">
                        <TableCell className="text-sm font-medium">{m.sourceName}</TableCell>
                        <TableCell className="text-center">
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground mx-auto" />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            <span className="text-sm">{m.mappedEntityName ?? m.mappedEntityId}</span>
                          </div>
                        </TableCell>
                        <TableCell><ConfidenceBadge confidence={m.confidence ?? "auto"} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground capitalize">{m.sourceSystem ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.createdByName ?? (m.confidence === "fuzzy" || m.confidence === "exact" ? "Auto" : "—")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              title="Edit mapping"
                              onClick={() => setEditTarget(m)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              title="Deactivate mapping"
                              onClick={() => handleDeactivate(m.id)}
                            >
                              <Link2Off className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Resolve / Edit dialog */}
      {(resolveTarget || editTarget) && (
        <ResolveMappingDialog
          item={resolveTarget ?? editTarget}
          onClose={() => { setResolveTarget(null); setEditTarget(null); }}
          onResolved={handleResolved}
        />
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function DataImports() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [pageTab, setPageTab] = useState<"imports" | "mappings">("imports");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<BatchListItem | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const isSuperAdmin = user?.isRootSuperAdmin || ["super_user", "ops_manager", "corporate_admin"].includes(user?.role ?? "");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/data-imports", search, statusFilter, typeFilter, page],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("importType", typeFilter);
      return apiRequest("GET", `/api/data-imports?${params}`).then(r => r.json());
    },
  });

  const importMutation = useMutation({
    mutationFn: (batchId: string) =>
      apiRequest("POST", `/api/data-imports/${batchId}/import`).then(r => r.json()),
    onSuccess: (updated) => {
      toast({
        title: updated.status === "imported" ? "Import complete" : "Import completed with warnings",
        description: `${updated.recordsImported} imported, ${updated.recordsUpdated} updated, ${updated.recordsSkipped} skipped.`,
      });
      qc.invalidateQueries({ queryKey: ["/api/data-imports"] });
      if (selectedBatch?.id === updated.id) setSelectedBatch(updated);
    },
    onError: (err: any) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (batchId: string) =>
      apiRequest("DELETE", `/api/data-imports/${batchId}`).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Import removed" });
      qc.invalidateQueries({ queryKey: ["/api/data-imports"] });
      setSelectedBatch(null);
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const batches: BatchListItem[] = data?.batches ?? [];
  const total: number = data?.total ?? 0;
  const globalCounts = data?.globalCounts ?? { total: 0, validated: 0, ready: 0, failed: 0, completed: 0 };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto">
      <div className="flex-1 p-4 sm:p-6 space-y-5 max-w-screen-2xl mx-auto w-full">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Data Imports</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Upload and manage external data imports into DriverHub</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {pageTab === "imports" && (
              <>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
                </Button>
                <Button size="sm" onClick={() => setUploadOpen(true)}>
                  <Upload className="h-3.5 w-3.5 mr-1.5" /> New Import
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ── Page-level tab bar: Imports | Mappings ── */}
        <div className="border-b -mt-1">
          <div className="flex gap-0">
            {([
              { key: "imports",  label: "Imports",          icon: FileSpreadsheet },
              { key: "mappings", label: "Entity Mappings",  icon: GitMerge },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setPageTab(tab.key)}
                className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                  pageTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Imports tab ── */}
        {pageTab === "imports" && (
          <>
            {/* Summary tiles — server-side global counts (all batches, not just current page/filter) */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: "Total Imports",    value: globalCounts.total,     color: "text-foreground"   },
                { label: "Validated",        value: globalCounts.validated,  color: "text-emerald-600"  },
                { label: "Ready for Import", value: globalCounts.ready,      color: "text-sky-600"      },
                { label: "Failed",           value: globalCounts.failed,     color: "text-red-600"      },
                { label: "Completed",        value: globalCounts.completed,  color: "text-blue-600"     },
              ].map(tile => (
                <Card key={tile.label} className="p-3">
                  <p className="text-xs text-muted-foreground">{tile.label}</p>
                  <p className={`text-2xl font-bold tabular-nums ${tile.color}`}>{tile.value}</p>
                </Card>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-48 max-w-80">
                <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by file name…"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0); }}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(0); }}>
                <SelectTrigger className="h-8 text-sm w-52">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {ENABLED_IMPORT_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{DATA_IMPORT_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status tabs */}
            <Tabs value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
              <TabsList className="h-8 text-xs gap-1 flex-wrap">
                <TabsTrigger value="all" className="text-xs h-7">All</TabsTrigger>
                {([
                  "uploaded", "ready_for_import", "imported",
                  "completed_with_warnings", "failed",
                  "validation_failed", "processing_error",
                ] as const).map(s => (
                  <TabsTrigger key={s} value={s} className="text-xs h-7">{STATUS_CONFIG[s]?.label ?? s}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {/* Table */}
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="text-xs font-semibold w-36">Import Type</TableHead>
                      <TableHead className="text-xs font-semibold min-w-48">File Name</TableHead>
                      <TableHead className="text-xs font-semibold w-36">Reporting Period</TableHead>
                      <TableHead className="text-xs font-semibold w-36">Imported By</TableHead>
                      <TableHead className="text-xs font-semibold w-36">Import Date</TableHead>
                      <TableHead className="text-xs font-semibold w-20 text-right">Read</TableHead>
                      <TableHead className="text-xs font-semibold w-20 text-right">Imported</TableHead>
                      <TableHead className="text-xs font-semibold w-20 text-right">Updated</TableHead>
                      <TableHead className="text-xs font-semibold w-20 text-right">Skipped</TableHead>
                      <TableHead className="text-xs font-semibold w-20 text-right">Errors</TableHead>
                      <TableHead className="text-xs font-semibold w-36">Batch Status</TableHead>
                      <TableHead className="text-xs font-semibold w-40">Validation</TableHead>
                      <TableHead className="text-xs font-semibold w-20 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={13} className="text-center py-12">
                          <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : batches.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={13} className="text-center py-12">
                          <FileX className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                          <p className="text-sm text-muted-foreground">No imports found</p>
                          <p className="text-xs text-muted-foreground/70 mt-1">Click "New Import" to upload your first file</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      batches.map(batch => (
                        <TableRow
                          key={batch.id}
                          className="cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => setSelectedBatch(batch)}
                        >
                          <TableCell className="text-xs font-medium">
                            {DATA_IMPORT_TYPE_LABELS[batch.importType as keyof typeof DATA_IMPORT_TYPE_LABELS] ?? batch.importType}
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="flex items-center gap-1.5 max-w-xs">
                              <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate" title={batch.fileName}>{batch.fileName}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {batch.reportingPeriodStart
                              ? `${batch.reportingPeriodStart}${batch.reportingPeriodEnd ? ` – ${batch.reportingPeriodEnd}` : ""}`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {(batch as any).importedByName ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {batch.createdAt ? format(parseISO(String(batch.createdAt)), "MMM d, yyyy") : "—"}
                            <div className="text-[10px]">{batch.createdAt ? format(parseISO(String(batch.createdAt)), "h:mm a") : ""}</div>
                          </TableCell>
                          <TableCell className="text-xs text-right tabular-nums">{batch.recordsRead}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums text-emerald-600">{batch.recordsImported || "—"}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums text-blue-600">{batch.recordsUpdated || "—"}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums text-amber-600">{batch.recordsSkipped || "—"}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums">
                            {batch.validationErrorCount > 0
                              ? <span className="text-red-600">{batch.validationErrorCount}</span>
                              : <span className="text-muted-foreground">0</span>}
                          </TableCell>
                          <TableCell><StatusBadge status={batch.status} /></TableCell>
                          <TableCell><ValidationStatusBadge status={batch.validationStatus} /></TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7"
                                title="View details"
                                onClick={() => setSelectedBatch(batch)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              {batch.status === "ready_for_import" && (
                                <Button
                                  variant="ghost" size="icon"
                                  className="h-7 w-7 text-emerald-600 hover:text-emerald-700"
                                  title="Execute import"
                                  onClick={() => importMutation.mutate(batch.id)}
                                  disabled={importMutation.isPending}
                                >
                                  <Play className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {!["imported", "completed_with_warnings", "importing"].includes(batch.status) && (
                                <Button
                                  variant="ghost" size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  title="Delete"
                                  onClick={() => {
                                    if (confirm("Delete this import? This cannot be undone.")) {
                                      deleteMutation.mutate(batch.id);
                                    }
                                  }}
                                  disabled={deleteMutation.isPending}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination footer */}
              {total > PAGE_SIZE && (
                <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 text-xs text-muted-foreground">
                  <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} imports</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-7" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-7" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </>
        )}

        {/* ── Mappings tab ── */}
        {pageTab === "mappings" && <MappingManager />}

      </div>

      {/* ── Upload Drawer ── */}
      <UploadDrawer
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={batch => {
          setUploadOpen(false);
          qc.invalidateQueries({ queryKey: ["/api/data-imports"] });
          setSelectedBatch(batch as BatchListItem);
        }}
        onDuplicate={async (batchId) => {
          setUploadOpen(false);
          try {
            const batch = await apiRequest("GET", `/api/data-imports/${batchId}`).then(r => r.json());
            if (batch?.id) setSelectedBatch(batch as BatchListItem);
          } catch {
            // best-effort — if fetch fails, just close the drawer and let user find it in the list
            qc.invalidateQueries({ queryKey: ["/api/data-imports"] });
          }
        }}
      />

      {/* ── Batch Detail ── */}
      {selectedBatch && (
        <BatchDetail
          batch={selectedBatch}
          onClose={() => setSelectedBatch(null)}
          onImport={() => {
            importMutation.mutate(selectedBatch.id);
            setSelectedBatch(null);
          }}
          onDeleted={() => {
            setSelectedBatch(null);
            qc.invalidateQueries({ queryKey: ["/api/data-imports"] });
          }}
          onOpenMappings={() => {
            setSelectedBatch(null);
            setPageTab("mappings");
          }}
        />
      )}
    </div>
  );
}
