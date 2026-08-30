/**
 * Data Repair — Platform Admin → Data Ops → Data Repair
 *
 * Consolidated date correction and data repair toolkit for Super Admins.
 *
 * Tabs:
 *   1. Date Correction Tool  — general-purpose dataset / field / transform picker
 *   2. UTC Batch Shift       — batch +1 day UTC correction for import batches
 *   3. CSV Import Override   — CSV/Excel bulk date override by email
 *   4. Single Record Fix     — targeted single-driver created-date correction
 *   5. Audit Log             — unified history of all data repair operations
 *
 * Access: Super Admin only
 */

import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatPhone } from "@/lib/phone";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertTriangle, CheckCircle2, RefreshCw, ArrowRight,
  Wrench, Search, User, Upload, FileSpreadsheet,
  CheckCircle, ShieldCheck, CalendarCheck, History, ChevronRight,
  Info, Eye, Database, Calendar, RotateCcw, Replace, Lock,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const s = String(d).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const dt = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  return s;
}

function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  try { return new Date(d).toLocaleString(); } catch { return d; }
}

// Step indicator (shared across tabs)
function StepIndicator({ step, current, label }: { step: number; current: number; label: string }) {
  const done = current > step;
  const active = current === step;
  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold shrink-0
        ${done ? "bg-primary text-primary-foreground" : active ? "bg-primary/20 text-primary border border-primary" : "bg-muted text-muted-foreground"}`}>
        {done ? <CheckCircle className="h-4 w-4" /> : step}
      </div>
      <span className={`text-sm hidden sm:block ${active ? "text-foreground font-medium" : done ? "text-muted-foreground" : "text-muted-foreground/60"}`}>{label}</span>
    </div>
  );
}

// CONFIRM input — shared pattern for destructive operations
function ConfirmInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        Type <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-destructive">CONFIRM</span> to enable execution
      </Label>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="CONFIRM"
        className="font-mono max-w-xs"
        data-testid="input-confirm-text"
      />
    </div>
  );
}

// ─── Tab 1: Date Correction Tool ───────────────────────────────────────────────

interface DatasetInfo {
  key: string;
  label: string;
  fields: { col: string; label: string }[];
  available: boolean;
}

interface CorrectionPreviewRow {
  id: string;
  name: string;
  currentValue: string | null;
  newValue: string | null;
}

interface CorrectionPreviewResult {
  total: number;
  fieldLabel: string;
  preview: CorrectionPreviewRow[];
}

function DateCorrectionTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [dataset, setDataset] = useState("");
  const [dateField, setDateField] = useState("");
  const [transformType, setTransformType] = useState<"shift_days" | "replace_value">("shift_days");
  const [shiftDays, setShiftDays] = useState<string>("1");
  const [replaceValue, setReplaceValue] = useState("");
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<CorrectionPreviewResult | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: datasetsData } = useQuery<{ datasets: DatasetInfo[] }>({
    queryKey: ["/api/corporate/data-correction/datasets"],
    queryFn: () => fetch("/api/corporate/data-correction/datasets", { credentials: "include" }).then(r => r.json()),
  });
  const datasets = datasetsData?.datasets ?? [];
  const selectedDataset = datasets.find(d => d.key === dataset);
  const selectedField = selectedDataset?.fields.find(f => f.col === dateField);

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/corporate/data-correction/preview", {
        dataset, dateField, transformType,
        shiftDays: transformType === "shift_days" ? Number(shiftDays) : undefined,
        replaceValue: transformType === "replace_value" ? replaceValue : undefined,
      });
      return res.json() as Promise<CorrectionPreviewResult>;
    },
    onSuccess: (data) => { setPreview(data); setStep(4); },
    onError: (err: Error) => toast({ title: "Preview failed", description: err.message, variant: "destructive" }),
  });

  const executeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/corporate/data-correction/execute", {
        dataset, dateField, transformType,
        shiftDays: transformType === "shift_days" ? Number(shiftDays) : undefined,
        replaceValue: transformType === "replace_value" ? replaceValue : undefined,
        notes, confirm: true,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Correction applied", description: `${data.recordsAffected} record(s) updated.` });
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["/api/corporate/data-correction/audit"] });
      resetAll();
    },
    onError: (err: Error) => toast({ title: "Execution failed", description: err.message, variant: "destructive" }),
  });

  function resetAll() {
    setStep(1); setDataset(""); setDateField(""); setTransformType("shift_days");
    setShiftDays("1"); setReplaceValue(""); setNotes(""); setPreview(null); setConfirmText("");
  }

  const canPreview =
    !!dataset && !!dateField && (
      (transformType === "shift_days" && shiftDays !== "" && !isNaN(Number(shiftDays))) ||
      (transformType === "replace_value" && !!replaceValue)
    );

  return (
    <div className="space-y-6">
      {/* Warning banner */}
      <Card className="border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-950/20">
        <CardContent className="flex items-start gap-3 pt-4 pb-4">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-red-800 dark:text-red-300">Irreversible Operation — Super Admin Only</p>
            <p className="text-red-700 dark:text-red-400 mt-0.5">
              Date corrections are permanent and applied immediately to all matching records.
              A full audit trail is written for compliance. Preview all changes before executing.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Step indicators */}
      <div className="flex items-center gap-2 flex-wrap">
        <StepIndicator step={1} current={step} label="Dataset" />
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <StepIndicator step={2} current={step} label="Date Field" />
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <StepIndicator step={3} current={step} label="Transformation" />
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <StepIndicator step={4} current={step} label="Preview &amp; Execute" />
      </div>

      {/* Step 1: Dataset */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">1</div>
            <CardTitle className="text-base">Select Dataset</CardTitle>
          </div>
          <CardDescription>Choose which dataset you want to apply the date correction to.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {datasets.map(ds => (
              <button
                key={ds.key}
                onClick={() => { if (ds.available) { setDataset(ds.key); setDateField(""); setStep(2); } }}
                disabled={!ds.available}
                data-testid={`button-dataset-${ds.key}`}
                className={`flex items-center gap-3 p-4 rounded-md border text-left transition-colors
                  ${!ds.available ? "opacity-50 cursor-not-allowed bg-muted/30" : ""}
                  ${dataset === ds.key ? "border-primary bg-primary/5" : "border-border hover-elevate"}`}
              >
                <Database className={`h-5 w-5 shrink-0 ${dataset === ds.key ? "text-primary" : "text-muted-foreground"}`} />
                <div>
                  <p className={`text-sm font-medium ${dataset === ds.key ? "text-primary" : ""}`}>{ds.label}</p>
                  {!ds.available && <p className="text-xs text-muted-foreground">Coming soon</p>}
                </div>
                {dataset === ds.key && <CheckCircle className="h-4 w-4 text-primary ml-auto shrink-0" />}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Date Field */}
      {dataset && selectedDataset && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">2</div>
              <CardTitle className="text-base">Select Date Field</CardTitle>
            </div>
            <CardDescription>Choose which date field to correct in the <strong>{selectedDataset.label}</strong> dataset.</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={dateField} onValueChange={v => { setDateField(v); setStep(3); }}>
              <SelectTrigger className="max-w-sm" data-testid="select-date-field">
                <SelectValue placeholder="Choose a date field…" />
              </SelectTrigger>
              <SelectContent>
                {selectedDataset.fields.map(f => (
                  <SelectItem key={f.col} value={f.col}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Transformation */}
      {dateField && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">3</div>
              <CardTitle className="text-base">Apply Transformation</CardTitle>
            </div>
            <CardDescription>
              Define how to update <strong>{selectedField?.label}</strong> for all {selectedDataset?.label} records.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <RadioGroup
              value={transformType}
              onValueChange={v => setTransformType(v as "shift_days" | "replace_value")}
              className="space-y-3"
            >
              <div className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-colors
                ${transformType === "shift_days" ? "border-primary bg-primary/5" : "border-border"}`}
                onClick={() => setTransformType("shift_days")}
              >
                <RadioGroupItem value="shift_days" id="transform-shift" className="mt-0.5" />
                <div className="flex-1 space-y-2">
                  <Label htmlFor="transform-shift" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                    <RotateCcw className="h-4 w-4 text-primary" /> Shift Date by Days
                  </Label>
                  <p className="text-xs text-muted-foreground">Adds or subtracts a fixed number of days from the current date value.</p>
                  {transformType === "shift_days" && (
                    <div className="flex items-center gap-2 mt-2">
                      <Label htmlFor="shift-days-input" className="text-sm shrink-0">Days to shift:</Label>
                      <Input
                        id="shift-days-input"
                        type="number"
                        value={shiftDays}
                        onChange={e => setShiftDays(e.target.value)}
                        placeholder="e.g. 1 or -1"
                        className="max-w-[120px]"
                        data-testid="input-shift-days"
                      />
                      <span className="text-xs text-muted-foreground">
                        {Number(shiftDays) > 0 ? `+${shiftDays} day(s) forward` : `${shiftDays} day(s) backward`}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-colors
                ${transformType === "replace_value" ? "border-primary bg-primary/5" : "border-border"}`}
                onClick={() => setTransformType("replace_value")}
              >
                <RadioGroupItem value="replace_value" id="transform-replace" className="mt-0.5" />
                <div className="flex-1 space-y-2">
                  <Label htmlFor="transform-replace" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                    <Replace className="h-4 w-4 text-primary" /> Replace Date Value
                  </Label>
                  <p className="text-xs text-muted-foreground">Sets all matching records to a specific date value, replacing whatever was there.</p>
                  {transformType === "replace_value" && (
                    <div className="flex items-center gap-2 mt-2">
                      <Label htmlFor="replace-date-input" className="text-sm shrink-0">New date:</Label>
                      <Input
                        id="replace-date-input"
                        type="date"
                        value={replaceValue}
                        onChange={e => setReplaceValue(e.target.value)}
                        className="max-w-[180px]"
                        data-testid="input-replace-value"
                      />
                    </div>
                  )}
                </div>
              </div>
            </RadioGroup>

            <div className="space-y-1.5">
              <Label htmlFor="correction-notes" className="text-sm">Notes (optional)</Label>
              <Textarea
                id="correction-notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Reason for this correction…"
                rows={2}
                data-testid="input-correction-notes"
              />
            </div>

            <Button
              onClick={() => { previewMutation.mutate(); }}
              disabled={!canPreview || previewMutation.isPending}
              data-testid="button-preview-correction"
            >
              <Eye className="h-4 w-4 mr-2" />
              {previewMutation.isPending ? "Loading preview…" : "Preview Changes"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Preview */}
      {preview && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">4</div>
              <CardTitle className="text-base">
                Preview — <span className="text-primary font-bold">{preview.total.toLocaleString()}</span> record{preview.total !== 1 ? "s" : ""} will be updated
              </CardTitle>
            </div>
            <CardDescription>
              Showing first {preview.preview.length} of {preview.total} affected records for <strong>{preview.fieldLabel}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Record</TableHead>
                    <TableHead>Current Value</TableHead>
                    <TableHead className="w-6"></TableHead>
                    <TableHead>New Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.preview.map(row => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium text-sm">{row.name}</TableCell>
                      <TableCell className="font-mono text-sm text-red-600 dark:text-red-400">{fmtDate(row.currentValue)}</TableCell>
                      <TableCell><ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /></TableCell>
                      <TableCell className="font-mono text-sm text-green-600 dark:text-green-400">{fmtDate(row.newValue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {preview.total > preview.preview.length && (
              <p className="text-xs text-muted-foreground text-center">
                + {(preview.total - preview.preview.length).toLocaleString()} more records not shown
              </p>
            )}

            <Separator />

            <ConfirmInput value={confirmText} onChange={setConfirmText} />

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setPreview(null); setStep(3); setConfirmText(""); }} data-testid="button-cancel-preview">
                Back
              </Button>
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={confirmText !== "CONFIRM" || preview.total === 0}
                variant="destructive"
                data-testid="button-execute-correction"
              >
                <CalendarCheck className="h-4 w-4 mr-2" />
                Execute on All {preview.total.toLocaleString()} Records
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Final confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={o => { if (!o) setConfirmOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Irreversible — Confirm Execution
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <div className="bg-muted rounded p-3 space-y-1">
                  <div className="flex gap-2"><span className="text-muted-foreground w-28">Dataset:</span><strong>{selectedDataset?.label}</strong></div>
                  <div className="flex gap-2"><span className="text-muted-foreground w-28">Field:</span><strong>{selectedField?.label}</strong></div>
                  <div className="flex gap-2"><span className="text-muted-foreground w-28">Transform:</span>
                    <strong>
                      {transformType === "shift_days"
                        ? `Shift by ${Number(shiftDays) > 0 ? "+" : ""}${shiftDays} day(s)`
                        : `Replace with ${fmtDate(replaceValue)}`}
                    </strong>
                  </div>
                  <div className="flex gap-2"><span className="text-muted-foreground w-28">Records:</span><strong className="text-destructive">{preview?.total.toLocaleString()}</strong></div>
                </div>
                <p className="text-destructive font-semibold">
                  This change is permanent and cannot be undone. It will be recorded in the audit log.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-execute">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => executeMutation.mutate()}
              disabled={executeMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-execute"
            >
              {executeMutation.isPending ? "Executing…" : "Execute Correction"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Tab 2: UTC Batch Shift ────────────────────────────────────────────────────

interface ImportBatchRow {
  id: string; source_file_name: string; status: string; total_rows: number | string;
  committed_at: string | null; created_at: string; created_by_username: string | null;
  driver_count: string | number; has_hire_date: string | number; has_dob: string | number;
  has_mvr: string | number; has_inactive: string | number; has_certified: string | number;
}
interface PreviewRecord { id: string; name: string; before: Record<string, string | null>; after: Record<string, string | null>; }
interface PreviewResult { batchId: string; total: number; preview: PreviewRecord[]; }
interface ShiftAuditEntry { id: string; batch_id: string; action: string; message: string; created_at: string; }

const SHIFT_FIELDS = [
  { col: "hire_date", label: "Hire Date" },
  { col: "date_of_birth", label: "Date of Birth" },
  { col: "mvr_record_date", label: "MVR Record Date" },
  { col: "inactive_date", label: "Inactive Date" },
  { col: "date_certified", label: "Date Certified" },
];

function UtcShiftTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedBatch, setSelectedBatch] = useState<ImportBatchRow | null>(null);
  const [selectedFields, setSelectedFields] = useState<string[]>(["hire_date", "date_of_birth"]);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: batches = [], isLoading: batchLoading, refetch: refetchBatches } = useQuery<ImportBatchRow[]>({
    queryKey: ["/api/corporate/date-fix/batches"],
    queryFn: () => fetch("/api/corporate/date-fix/batches", { credentials: "include" }).then(r => r.json()),
  });

  const { data: auditLog = [], refetch: refetchAudit } = useQuery<ShiftAuditEntry[]>({
    queryKey: ["/api/corporate/date-fix/audit"],
    queryFn: () => fetch("/api/corporate/date-fix/audit", { credentials: "include" }).then(r => r.json()),
  });

  const previewMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const res = await apiRequest("POST", `/api/corporate/date-fix/batch/${batchId}/preview`, { fields: selectedFields });
      return res.json() as Promise<PreviewResult>;
    },
    onSuccess: (data) => setPreview(data),
    onError: (err: Error) => toast({ title: "Preview failed", description: err.message, variant: "destructive" }),
  });

  const applyMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const res = await apiRequest("POST", `/api/corporate/date-fix/batch/${batchId}/apply`, { fields: selectedFields, confirm: true });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Date shift applied", description: `Corrected ${preview?.total ?? 0} records.` });
      setConfirmOpen(false); setPreview(null); setSelectedBatch(null); setConfirmText("");
      refetchBatches(); refetchAudit();
      qc.invalidateQueries({ queryKey: ["/api/corporate/date-fix/audit"] });
    },
    onError: (err: Error) => toast({ title: "Apply failed", description: err.message, variant: "destructive" }),
  });

  const toggleField = (col: string) =>
    setSelectedFields(prev => prev.includes(col) ? prev.filter(f => f !== col) : [...prev, col]);

  return (
    <div className="space-y-6">
      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
        <CardContent className="flex items-start gap-3 pt-4 pb-4">
          <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-800 dark:text-amber-300">UTC Midnight Shift Fix</p>
            <p className="text-amber-700 dark:text-amber-400 mt-0.5">
              Corrects off-by-one day errors when date-only values were imported as UTC midnight timestamps.
              Shifts each selected date field forward by +1 day for all drivers in the chosen batch.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Batch selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">1</div>
            <CardTitle className="text-base">Select Import Batch</CardTitle>
          </div>
          <CardDescription>Choose a committed import batch that was affected by the UTC shift bug.</CardDescription>
        </CardHeader>
        <CardContent>
          {batchLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : batches.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No committed import batches found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead><TableHead>Imported By</TableHead>
                  <TableHead>Committed</TableHead><TableHead>Drivers</TableHead>
                  <TableHead>Date Fields</TableHead><TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map(batch => {
                  const dateFieldCount = Number(batch.has_hire_date) + Number(batch.has_dob) + Number(batch.has_mvr) + Number(batch.has_inactive) + Number(batch.has_certified);
                  return (
                    <TableRow key={batch.id} className={selectedBatch?.id === batch.id ? "bg-primary/5" : ""} data-testid={`row-batch-${batch.id}`}>
                      <TableCell className="font-medium text-sm max-w-[180px] truncate">{batch.source_file_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{batch.created_by_username ?? "—"}</TableCell>
                      <TableCell className="text-sm">{batch.committed_at ? fmtDate(batch.committed_at) : "—"}</TableCell>
                      <TableCell className="text-sm">{batch.driver_count}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${dateFieldCount > 0 ? "border-amber-400 text-amber-700 dark:text-amber-400" : ""}`}>
                          {dateFieldCount} field{dateFieldCount !== 1 ? "s" : ""}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant={selectedBatch?.id === batch.id ? "default" : "outline"}
                          onClick={() => { setSelectedBatch(batch); setPreview(null); setConfirmText(""); }}
                          data-testid={`button-select-batch-${batch.id}`}>
                          {selectedBatch?.id === batch.id ? "Selected" : "Select"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Field selection */}
      {selectedBatch && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">2</div>
              <CardTitle className="text-base">Select Date Fields to Correct</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {SHIFT_FIELDS.map(f => (
                <div key={f.col} className="flex items-center gap-2">
                  <Checkbox id={`field-${f.col}`} checked={selectedFields.includes(f.col)}
                    onCheckedChange={() => toggleField(f.col)} data-testid={`checkbox-field-${f.col}`} />
                  <Label htmlFor={`field-${f.col}`} className="text-sm cursor-pointer">{f.label}</Label>
                </div>
              ))}
            </div>
            <Button variant="outline" onClick={() => previewMutation.mutate(selectedBatch.id)}
              disabled={selectedFields.length === 0 || previewMutation.isPending} data-testid="button-preview-shift">
              <Eye className="h-4 w-4 mr-2" />
              {previewMutation.isPending ? "Loading preview…" : "Preview Changes"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Preview + Confirm */}
      {preview && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">3</div>
              <CardTitle className="text-base">Preview — {preview.total} record{preview.total !== 1 ? "s" : ""} will be updated</CardTitle>
            </div>
            <CardDescription>Showing first {preview.preview.length} of {preview.total} impacted records.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Driver</TableHead>
                    {selectedFields.map(col => <TableHead key={col}>{SHIFT_FIELDS.find(x => x.col === col)?.label ?? col}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.preview.map(rec => (
                    <TableRow key={rec.id}>
                      <TableCell className="font-medium text-sm">{rec.name}</TableCell>
                      {selectedFields.map(col => (
                        <TableCell key={col} className="text-xs">
                          <span className="text-red-600 dark:text-red-400 font-mono">{fmtDate(rec.before[col])}</span>
                          <ArrowRight className="h-3 w-3 inline mx-1 text-muted-foreground" />
                          <span className="text-green-600 dark:text-green-400 font-mono">{fmtDate(rec.after[col])}</span>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Separator />
            <ConfirmInput value={confirmText} onChange={setConfirmText} />

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setPreview(null); setConfirmText(""); }} data-testid="button-cancel-preview">Cancel</Button>
              <Button onClick={() => setConfirmOpen(true)} disabled={confirmText !== "CONFIRM" || applyMutation.isPending}
                variant="destructive" data-testid="button-apply-shift">
                <CalendarCheck className="h-4 w-4 mr-2" />
                Apply to All {preview.total} Records
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={o => { if (!o) setConfirmOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Confirm Date Shift Correction
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>Shift date fields <strong>+1 day</strong> for <strong>{preview?.total} drivers</strong> in batch:</p>
                <div className="bg-muted px-3 py-2 rounded font-medium text-sm">{selectedBatch?.source_file_name}</div>
                <p>Fields: <strong>{selectedFields.map(c => SHIFT_FIELDS.find(f => f.col === c)?.label ?? c).join(", ")}</strong></p>
                <p className="text-amber-700 dark:text-amber-400 font-medium">This is permanent and will be recorded in the audit log.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-confirm">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => applyMutation.mutate(selectedBatch!.id)} disabled={applyMutation.isPending}
              data-testid="button-confirm-apply">
              {applyMutation.isPending ? "Applying…" : "Confirm &amp; Apply"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {auditLog.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" /> Shift Correction History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Batch</TableHead><TableHead>Action</TableHead><TableHead>Detail</TableHead><TableHead>When</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {auditLog.slice(0, 20).map(entry => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{entry.batch_id.slice(0, 8)}…</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{entry.action}</Badge></TableCell>
                    <TableCell className="text-sm">{entry.message}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(entry.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Tab 3: CSV Import Override ────────────────────────────────────────────────

interface UploadResponse { batchId: string; fileName: string; totalRows: number; columnMapping: Record<string, string>; detectedFields: string[]; }
interface PreviewField { fieldKey: string; label: string; currentValue: string | null; importValue: string | null; willUpdate: boolean; skippedBlank: boolean; }
interface PreviewRow { stagingRowId: string; rowIndex: number; email: string; driverFound: boolean; driverId: string | null; driverName: string | null; fields: PreviewField[]; willProcess: boolean; }
interface ImportPreviewStats { total: number; matched: number; unmatched: number; willUpdate: number; fieldCounts: { fieldKey: string; label: string; updates: number }[]; }
interface ImportPreviewResponse { batchId: string; stats: ImportPreviewStats; preview: PreviewRow[]; }
interface CommitResponse { success: boolean; batchId: string; updatedDrivers: number; skippedNoMatch: number; skippedNoChanges: number; committedAt: string; }
interface HistoryBatch { id: string; source_file_name: string; status: string; total_rows: number; processed_rows: number; created_by_username: string; committed_at: string | null; created_at: string; error_message: string | null; }

const IMPORT_FIELD_LABELS: Record<string, string> = {
  dateOfBirth: "Date of Birth", hireDate: "Hire Date", mvrDate: "MVR Record Date",
  drugTestDate: "Drug Test Date", dateCertified: "Certified Date",
  licenseExpiration: "License Expiration", terminationDate: "Termination Date", reactivationDate: "Reactivation Date",
};

function ImportCorrectionTab() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResponse | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const { data: history, isLoading: historyLoading } = useQuery<HistoryBatch[]>({
    queryKey: ["/api/corporate/driver-date-correction/batches"],
    queryFn: () => fetch("/api/corporate/driver-date-correction/batches", { credentials: "include" }).then(r => r.json()),
    enabled: showHistory,
  });

  const { data: preview, isLoading: previewLoading } = useQuery<ImportPreviewResponse>({
    queryKey: ["/api/corporate/driver-date-correction/preview", uploadResult?.batchId],
    queryFn: () => fetch(`/api/corporate/driver-date-correction/preview/${uploadResult!.batchId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!uploadResult?.batchId && step === 2,
    staleTime: 0,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/corporate/driver-date-correction/upload", { method: "POST", credentials: "include", body: formData });
      if (!res.ok) { const err = await res.json().catch(() => ({ message: "Upload failed" })); throw new Error(err.message); }
      return res.json() as Promise<UploadResponse>;
    },
    onSuccess: (data) => { setUploadResult(data); setStep(2); },
    onError: (err: Error) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/corporate/driver-date-correction/commit/${uploadResult!.batchId}`, { confirm: true });
      if (!res.ok) { const err = await res.json().catch(() => ({ message: "Commit failed" })); throw new Error(err.message); }
      return res.json() as Promise<CommitResponse>;
    },
    onSuccess: (data) => { setCommitResult(data); setStep(4); setConfirmOpen(false); setConfirmText(""); },
    onError: (err: Error) => toast({ title: "Commit failed", description: err.message, variant: "destructive" }),
  });

  const handleFile = useCallback((file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext ?? "")) {
      toast({ title: "Invalid file type", description: "Please upload a CSV or Excel file.", variant: "destructive" });
      return;
    }
    uploadMutation.mutate(file);
  }, [uploadMutation, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const reset = () => {
    setStep(1); setUploadResult(null); setCommitResult(null); setConfirmText("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const stats = preview?.stats;

  return (
    <div className="space-y-6">
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

      <div className="flex items-center gap-3 flex-wrap">
        {["Upload File", "Preview", "Review & Confirm", "Done"].map((label, i) => (
          <span key={i} className="flex items-center gap-2">
            <StepIndicator step={i + 1} current={step} label={label} />
            {i < 3 && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
          </span>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">1</div>
                <CardTitle className="text-base">Upload Date Correction File</CardTitle>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)} data-testid="button-toggle-history">
                <History className="h-4 w-4 mr-1" /> {showHistory ? "Hide" : "Show"} History
              </Button>
            </div>
            <CardDescription>Upload a CSV or Excel file with columns: email, and any date fields to correct.</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className={`border-2 border-dashed rounded-md p-8 text-center transition-colors cursor-pointer
                ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"}`}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              data-testid="dropzone-file-upload"
            >
              {uploadMutation.isPending ? (
                <div className="space-y-2"><RefreshCw className="h-8 w-8 mx-auto text-primary animate-spin" /><p className="text-sm text-muted-foreground">Uploading…</p></div>
              ) : (
                <div className="space-y-2">
                  <FileSpreadsheet className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm font-medium">Drop CSV/Excel file here, or click to browse</p>
                  <p className="text-xs text-muted-foreground">Accepted: .csv, .xlsx, .xls</p>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              data-testid="input-file-upload" />

            {showHistory && (
              <div className="mt-4 space-y-2">
                <Separator />
                <p className="text-sm font-medium mt-3">Previous Import Batches</p>
                {historyLoading ? <Skeleton className="h-20 w-full" />
                : !history || history.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No previous imports found.</p>
                : (
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>File</TableHead><TableHead>Status</TableHead><TableHead>Updated</TableHead><TableHead>Date</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map(h => (
                        <TableRow key={h.id}>
                          <TableCell className="text-sm max-w-[200px] truncate">{h.source_file_name}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{h.status}</Badge></TableCell>
                          <TableCell className="text-sm">{h.processed_rows ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{fmtDate(h.committed_at ?? h.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview */}
      {step === 2 && uploadResult && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">2</div>
              <CardTitle className="text-base">Preview — {uploadResult.fileName}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {previewLoading ? <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            : preview ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Total Rows", value: stats?.total },
                    { label: "Matched Drivers", value: stats?.matched, color: "text-green-600" },
                    { label: "Unmatched", value: stats?.unmatched, color: stats?.unmatched ? "text-red-600" : "" },
                    { label: "Will Update", value: stats?.willUpdate, color: "text-blue-600" },
                  ].map(s => (
                    <div key={s.label} className="text-center p-3 bg-muted/50 rounded-md">
                      <p className={`text-2xl font-bold ${s.color ?? ""}`}>{s.value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead><TableHead>Email</TableHead>
                        <TableHead>Driver</TableHead><TableHead>Fields</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.preview.slice(0, 50).map(row => (
                        <TableRow key={row.stagingRowId} className={!row.driverFound ? "opacity-50" : ""}>
                          <TableCell className="text-xs text-muted-foreground">{row.rowIndex}</TableCell>
                          <TableCell className="text-xs font-mono">{row.email}</TableCell>
                          <TableCell className="text-sm">{row.driverName ?? <span className="text-muted-foreground italic">Not found</span>}</TableCell>
                          <TableCell className="text-xs">
                            {row.fields.filter(f => f.willUpdate).map(f => (
                              <div key={f.fieldKey} className="flex items-center gap-1">
                                <span className="text-muted-foreground">{IMPORT_FIELD_LABELS[f.fieldKey] ?? f.fieldKey}:</span>
                                <span className="text-red-500 font-mono">{fmtDate(f.currentValue)}</span>
                                <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                                <span className="text-green-600 font-mono">{fmtDate(f.importValue)}</span>
                              </div>
                            ))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={reset} data-testid="button-cancel-import">Cancel</Button>
                  <Button onClick={() => setStep(3)} disabled={!stats?.willUpdate || stats.willUpdate === 0} data-testid="button-proceed-commit">
                    Proceed to Confirm ({stats?.willUpdate ?? 0} updates)
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Confirm */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">3</div>
              <CardTitle className="text-base">Review &amp; Confirm</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Card className="border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20">
              <CardContent className="flex items-start gap-3 pt-4 pb-4">
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-red-800 dark:text-red-300">Irreversible Operation</p>
                  <p className="text-red-700 dark:text-red-400 mt-0.5">
                    You are about to apply date corrections to <strong>{stats?.willUpdate} driver records</strong> from file <strong>{uploadResult?.fileName}</strong>.
                    This is permanent and will be recorded in the audit log.
                  </p>
                </div>
              </CardContent>
            </Card>
            <ConfirmInput value={confirmText} onChange={setConfirmText} />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)} data-testid="button-back-to-preview">Back</Button>
              <Button variant="destructive" onClick={() => setConfirmOpen(true)} disabled={confirmText !== "CONFIRM"} data-testid="button-open-commit-confirm">
                Apply {stats?.willUpdate ?? 0} Corrections
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Done */}
      {step === 4 && commitResult && (
        <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
          <CardContent className="pt-6 pb-6 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto" />
            <h3 className="text-lg font-semibold">Correction Applied</h3>
            <div className="flex justify-center gap-6 text-sm">
              <div><p className="text-2xl font-bold text-green-600">{commitResult.updatedDrivers}</p><p className="text-muted-foreground">Updated</p></div>
              <div><p className="text-2xl font-bold text-muted-foreground">{commitResult.skippedNoMatch}</p><p className="text-muted-foreground">Unmatched</p></div>
              <div><p className="text-2xl font-bold text-muted-foreground">{commitResult.skippedNoChanges}</p><p className="text-muted-foreground">No Changes</p></div>
            </div>
            <Button onClick={reset} data-testid="button-import-done">Start Another Correction</Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={o => { if (!o) setConfirmOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Confirm Date Correction Import
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>Apply date corrections to <strong>{stats?.willUpdate} driver records</strong>.</p>
                <div className="bg-muted px-3 py-2 rounded font-medium text-sm">{uploadResult?.fileName}</div>
                <p className="text-amber-700 dark:text-amber-400 font-medium">This is permanent and will be recorded in the audit log.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-import-cancel-confirm">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => commitMutation.mutate()} disabled={commitMutation.isPending} data-testid="button-import-confirm-commit">
              {commitMutation.isPending ? "Committing…" : "Confirm &amp; Apply"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Tab 4: Single Record Fix ─────────────────────────────────────────────────

interface DriverSearchResult {
  id: string; firstName: string; lastName: string; phoneNumber: string;
  openforceId: string; network: string; status: string; createdAt: string | null;
  hireDate: string | null; dateOfBirth: string | null;
}

function SingleDriverTab() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedDriver, setSelectedDriver] = useState<DriverSearchResult | null>(null);
  const [newDate, setNewDate] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const { data: searchResults = [], isFetching } = useQuery<DriverSearchResult[]>({
    queryKey: ["/api/corporate/date-fix/driver/search", debouncedQuery],
    queryFn: () => fetch(`/api/corporate/date-fix/driver/search?q=${encodeURIComponent(debouncedQuery)}`, { credentials: "include" }).then(r => r.json()),
    enabled: debouncedQuery.length >= 2,
  });

  const fixMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/corporate/date-fix/driver/${selectedDriver!.id}/fix-created-date`, { newDate, confirm: true }),
    onSuccess: () => {
      toast({ title: "Created date corrected", description: `${selectedDriver!.firstName} ${selectedDriver!.lastName} updated.` });
      setConfirmOpen(false); setSelectedDriver(null); setQuery(""); setDebouncedQuery(""); setNewDate(""); setConfirmText("");
    },
    onError: (err: Error) => toast({ title: "Correction failed", description: err.message, variant: "destructive" }),
  });

  const handleSearch = () => { if (query.trim().length >= 2) setDebouncedQuery(query.trim()); };
  const selectDriver = (driver: DriverSearchResult) => {
    setSelectedDriver(driver);
    if (driver.createdAt) { const m = driver.createdAt.match(/^(\d{4}-\d{2}-\d{2})/); if (m) setNewDate(m[1]); }
  };

  return (
    <div className="space-y-6">
      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="flex items-start gap-3 pt-4 pb-4">
          <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-300">
            <p className="font-semibold">Single-Driver Created Date Fix</p>
            <p className="mt-0.5 text-blue-700 dark:text-blue-400">Search for a specific driver and correct their Created Date. Use when only one or a few drivers have incorrect dates.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" /> Find Driver</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search by name, phone, or OpenForce ID…" value={query}
                onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()}
                data-testid="input-single-driver-search" />
            </div>
            <Button onClick={handleSearch} disabled={query.length < 2} data-testid="button-single-driver-search">
              <Search className="h-4 w-4 mr-2" /> Search
            </Button>
          </div>

          {debouncedQuery.length >= 2 && (
            isFetching ? <Skeleton className="h-20 w-full" />
            : searchResults.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No drivers found matching "{debouncedQuery}"</p>
            : (
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Network</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead></TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {searchResults.map(d => (
                    <TableRow key={d.id} className={selectedDriver?.id === d.id ? "bg-primary/5" : ""} data-testid={`row-driver-${d.id}`}>
                      <TableCell className="font-medium text-sm">{d.firstName} {d.lastName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatPhone(d.phoneNumber) || "—"}</TableCell>
                      <TableCell className="text-sm">{d.network || "—"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{d.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(d.createdAt)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant={selectedDriver?.id === d.id ? "default" : "outline"} onClick={() => selectDriver(d)} data-testid={`button-select-driver-${d.id}`}>
                          {selectedDriver?.id === d.id ? "Selected" : "Select"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          )}
        </CardContent>
      </Card>

      {selectedDriver && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Correct Created Date — {selectedDriver.firstName} {selectedDriver.lastName}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">Current Created Date:</span><p className="font-medium mt-0.5">{fmtDate(selectedDriver.createdAt)}</p></div>
              <div><span className="text-muted-foreground">Hire Date:</span><p className="font-medium mt-0.5">{fmtDate(selectedDriver.hireDate)}</p></div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-date-input" className="text-sm">Correct created date to:</Label>
              <Input id="new-date-input" type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="max-w-[200px]" data-testid="input-new-date" />
            </div>
            <Separator />
            <ConfirmInput value={confirmText} onChange={setConfirmText} />
            <Button variant="destructive" onClick={() => setConfirmOpen(true)} disabled={!newDate || confirmText !== "CONFIRM"} data-testid="button-open-fix-confirm">
              <CalendarCheck className="h-4 w-4 mr-2" /> Apply Correction
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={o => { if (!o) setConfirmOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Confirm Created Date Correction
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>Update Created Date for <strong>{selectedDriver?.firstName} {selectedDriver?.lastName}</strong>:</p>
                <div className="flex items-center gap-2">
                  <span className="text-red-600 font-mono">{fmtDate(selectedDriver?.createdAt)}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className="text-green-600 font-mono">{fmtDate(newDate)}</span>
                </div>
                <p className="text-amber-700 dark:text-amber-400 font-medium">This is permanent and will be recorded in the audit log.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-fix">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => fixMutation.mutate()} disabled={fixMutation.isPending} data-testid="button-confirm-fix">
              {fixMutation.isPending ? "Applying…" : "Confirm &amp; Apply"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Tab 5: Audit Log ─────────────────────────────────────────────────────────

interface AuditEntry {
  id: string; executedByName: string | null; executedAt: string;
  dataset: string; dateField: string; transformType: string;
  shiftDays: number | null; replaceValue: string | null;
  recordsAffected: number; status: string; notes: string | null;
}

function AuditLogTab() {
  const { data: entries = [], isLoading } = useQuery<AuditEntry[]>({
    queryKey: ["/api/corporate/data-correction/audit"],
    queryFn: () => fetch("/api/corporate/data-correction/audit", { credentials: "include" }).then(r => r.json()),
  });

  function describeTransform(entry: AuditEntry) {
    if (entry.transformType === "shift_days") return `Shift ${(entry.shiftDays ?? 0) > 0 ? "+" : ""}${entry.shiftDays} day(s)`;
    if (entry.transformType === "replace_value") return `Replace → ${fmtDate(entry.replaceValue)}`;
    return entry.transformType;
  }

  const DATASET_LABELS: Record<string, string> = { drivers: "Drivers", moves: "Moves", payments: "Payments" };
  const FIELD_LABELS: Record<string, string> = {
    hire_date: "Hire Date", date_of_birth: "Date of Birth", mvr_record_date: "MVR Record Date",
    inactive_date: "Inactive Date", date_certified: "Date Certified",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2"><Lock className="h-4 w-4" /> Data Correction Audit Log</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Complete record of all date corrections executed via the Date Correction Tool.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <History className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No corrections have been executed yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Corrections executed via the Date Correction Tool will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Executed By</TableHead>
                <TableHead>Dataset</TableHead>
                <TableHead>Field</TableHead>
                <TableHead>Transformation</TableHead>
                <TableHead className="text-right">Records</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map(entry => (
                <TableRow key={entry.id} data-testid={`row-audit-${entry.id}`}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDateTime(entry.executedAt)}</TableCell>
                  <TableCell className="text-sm">{entry.executedByName ?? "—"}</TableCell>
                  <TableCell className="text-sm">{DATASET_LABELS[entry.dataset] ?? entry.dataset}</TableCell>
                  <TableCell className="text-sm">{FIELD_LABELS[entry.dateField] ?? entry.dateField}</TableCell>
                  <TableCell className="text-sm font-mono">{describeTransform(entry)}</TableCell>
                  <TableCell className="text-right font-semibold">{entry.recordsAffected.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${entry.status === "completed" ? "border-green-500 text-green-700 dark:text-green-400" : "border-red-500 text-red-700 dark:text-red-400"}`}>
                      {entry.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{entry.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DataRepair() {
  const [activeTab, setActiveTab] = useState("date-correction");

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10 shrink-0 mt-0.5">
          <Wrench className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Data Repair</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Super Admin controlled tools for date correction, batch repair, and data integrity operations.
            All changes are logged to the audit trail.
          </p>
        </div>
        <Badge variant="outline" className="ml-auto shrink-0 border-amber-400 text-amber-700 dark:text-amber-400 flex items-center gap-1">
          <Lock className="h-3 w-3" /> Super Admin Only
        </Badge>
      </div>

      <Separator />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="date-correction" data-testid="tab-date-correction" className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" /> Date Correction Tool
          </TabsTrigger>
          <TabsTrigger value="utc-shift" data-testid="tab-utc-shift" className="flex items-center gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" /> UTC Batch Shift
          </TabsTrigger>
          <TabsTrigger value="csv-import" data-testid="tab-csv-import" className="flex items-center gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5" /> CSV Import Override
          </TabsTrigger>
          <TabsTrigger value="single-fix" data-testid="tab-single-fix" className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" /> Single Record Fix
          </TabsTrigger>
          <TabsTrigger value="audit-log" data-testid="tab-audit-log" className="flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" /> Audit Log
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="date-correction"><DateCorrectionTab /></TabsContent>
          <TabsContent value="utc-shift"><UtcShiftTab /></TabsContent>
          <TabsContent value="csv-import"><ImportCorrectionTab /></TabsContent>
          <TabsContent value="single-fix"><SingleDriverTab /></TabsContent>
          <TabsContent value="audit-log"><AuditLogTab /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
