/**
 * UTC Date Shift Correction Tool
 *
 * Super-Admin-only tool for finding and correcting the off-by-one day date
 * bug that occurs when date-only values are imported as UTC midnight timestamps.
 *
 * Workflow:
 *   1. View all committed import batches and how many drivers have date fields
 *   2. Select a batch that was affected
 *   3. Preview the before/after (+1 day) for a sample of those records
 *   4. Confirm and apply the correction
 *   5. OR: manually correct a single driver's Created Date directly
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle, CheckCircle2, RefreshCw, ChevronRight, CalendarCheck,
  ArrowRight, Shield, Eye, Wrench, FileText, Info, Search, User, Pencil,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ImportBatchRow {
  id: string;
  source_file_name: string;
  status: string;
  total_rows: number | string;
  committed_at: string | null;
  created_at: string;
  created_by_username: string | null;
  driver_count: string | number;
  has_hire_date: string | number;
  has_dob: string | number;
  has_mvr: string | number;
  has_inactive: string | number;
  has_certified: string | number;
}

interface PreviewRecord {
  id: string;
  name: string;
  before: Record<string, string | null>;
  after: Record<string, string | null>;
}

interface PreviewResult {
  batchId: string;
  total: number;
  preview: PreviewRecord[];
}

interface AuditEntry {
  id: string;
  batch_id: string;
  action: string;
  message: string;
  created_at: string;
}

interface DriverSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  openforceId: string;
  network: string;
  status: string;
  createdAt: string | null;
  hireDate: string | null;
  dateOfBirth: string | null;
}

const ALL_FIELDS = [
  { col: "hire_date",       label: "Hire Date" },
  { col: "date_of_birth",   label: "Date of Birth" },
  { col: "mvr_record_date", label: "MVR Record Date" },
  { col: "inactive_date",   label: "Inactive Date" },
  { col: "date_certified",  label: "Date Certified" },
];

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

function dateCount(batch: ImportBatchRow) {
  return (
    Number(batch.has_hire_date) +
    Number(batch.has_dob) +
    Number(batch.has_mvr) +
    Number(batch.has_inactive) +
    Number(batch.has_certified)
  );
}

// ─── Manual Driver Date Correction Panel ──────────────────────────────────────

function ManualDriverCorrection({ auditRefetch }: { auditRefetch: () => void }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedDriver, setSelectedDriver] = useState<DriverSearchResult | null>(null);
  const [newDate, setNewDate] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { toast } = useToast();

  const { data: searchResults = [], isFetching } = useQuery<DriverSearchResult[]>({
    queryKey: ["/api/corporate/date-fix/driver/search", debouncedQuery],
    queryFn: () =>
      fetch(`/api/corporate/date-fix/driver/search?q=${encodeURIComponent(debouncedQuery)}`, { credentials: "include" })
        .then(r => r.json()),
    enabled: debouncedQuery.length >= 2,
  });

  const fixMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/corporate/date-fix/driver/${selectedDriver!.id}/fix-created-date`, {
        newDate,
        confirm: true,
      }),
    onSuccess: (data: any) => {
      toast({
        title: "Created date corrected",
        description: `${selectedDriver!.firstName} ${selectedDriver!.lastName}: ${fmtDate(data.previousValue)} → ${fmtDate(data.newValue)}`,
      });
      setConfirmOpen(false);
      setSelectedDriver(null);
      setQuery("");
      setDebouncedQuery("");
      setNewDate("");
      auditRefetch();
    },
    onError: (err: Error) => toast({
      title: "Correction failed",
      description: err.message,
      variant: "destructive",
    }),
  });

  const handleSearch = () => {
    if (query.trim().length >= 2) setDebouncedQuery(query.trim());
  };

  const selectDriver = (driver: DriverSearchResult) => {
    setSelectedDriver(driver);
    // Pre-fill with the current date extracted from the stored value
    if (driver.createdAt) {
      const m = driver.createdAt.match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) setNewDate(m[1]);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <User className="h-4 w-4" />
          Manual Single-Driver Correction
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Search for a specific driver and set their Created Date directly.
          Use this when only one or a few drivers have incorrect dates.
        </p>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search by name, phone, or OpenForce ID…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                data-testid="input-driver-search"
              />
            </div>
            <Button onClick={handleSearch} disabled={query.length < 2} data-testid="button-driver-search">
              Search
            </Button>
          </div>

          {/* Results */}
          {debouncedQuery.length >= 2 && (
            isFetching
              ? <Skeleton className="h-16 w-full" />
              : searchResults.length === 0
                ? <p className="text-sm text-muted-foreground text-center py-3">No drivers found matching "{debouncedQuery}"</p>
                : (
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Driver</TableHead>
                          <TableHead>Phone / OpenForce</TableHead>
                          <TableHead>Current Created Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {searchResults.map(driver => (
                          <TableRow
                            key={driver.id}
                            className={selectedDriver?.id === driver.id ? "bg-primary/5" : "hover-elevate"}
                            data-testid={`driver-row-${driver.id}`}
                          >
                            <TableCell className="font-medium text-sm">
                              {driver.firstName} {driver.lastName}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {driver.phoneNumber}
                              {driver.openforceId && <span className="ml-2 text-muted-foreground/60">#{driver.openforceId}</span>}
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-xs">{fmtDate(driver.createdAt)}</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{driver.status}</Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => selectDriver(driver)}
                                data-testid={`button-select-driver-${driver.id}`}
                                className="gap-1"
                              >
                                <Pencil className="h-3 w-3" />
                                Fix Date
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )
          )}
        </CardContent>
      </Card>

      {/* Correction form */}
      {selectedDriver && (
        <Card className="ring-2 ring-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              Correct Created Date: {selectedDriver.firstName} {selectedDriver.lastName}
            </CardTitle>
            <CardDescription className="text-xs">
              OpenForce #{selectedDriver.openforceId || "—"} · {selectedDriver.phoneNumber} · {selectedDriver.network}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Current Created Date</p>
                <p className="font-mono text-red-600 dark:text-red-400">{fmtDate(selectedDriver.createdAt)}</p>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">{selectedDriver.createdAt}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Hire Date (for reference)</p>
                <p className="font-mono">{fmtDate(selectedDriver.hireDate)}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-date" className="text-sm">New Created Date</Label>
              <Input
                id="new-date"
                type="date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                className="w-48 font-mono"
                data-testid="input-new-date"
              />
              {newDate && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <ArrowRight className="h-3 w-3" />
                  Will be stored as <code className="bg-muted px-1 rounded">{newDate} 00:00:00</code>
                  — displays as <strong>{fmtDate(newDate)}</strong>
                </p>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => { setSelectedDriver(null); setNewDate(""); }}
                data-testid="button-cancel-fix"
              >
                Cancel
              </Button>
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={!newDate || newDate === selectedDriver.createdAt?.slice(0, 10)}
                data-testid="button-apply-single-fix"
                className="gap-2"
              >
                <CalendarCheck className="h-4 w-4" />
                Apply Correction
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={o => { if (!o) setConfirmOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Manual Date Correction
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>You are about to change the Created Date for:</p>
                <div className="bg-muted px-3 py-2 rounded text-sm">
                  <strong>{selectedDriver?.firstName} {selectedDriver?.lastName}</strong>
                  {selectedDriver?.openforceId && <span className="text-muted-foreground ml-2">OpenForce #{selectedDriver.openforceId}</span>}
                </div>
                <div className="flex items-center gap-3 font-mono text-sm">
                  <span className="text-red-600 dark:text-red-400">{fmtDate(selectedDriver?.createdAt)}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className="text-green-600 dark:text-green-400">{fmtDate(newDate)}</span>
                </div>
                <p className="text-amber-700 dark:text-amber-400 font-medium">
                  This is a permanent data change and will be logged in the audit trail.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => fixMutation.mutate()}
              disabled={fixMutation.isPending}
              data-testid="button-confirm-single-fix"
            >
              {fixMutation.isPending
                ? <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                : <CalendarCheck className="h-4 w-4 mr-2" />}
              Apply Correction
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DateFix() {
  const [selectedBatch, setSelectedBatch] = useState<ImportBatchRow | null>(null);
  const [selectedFields, setSelectedFields] = useState<string[]>(ALL_FIELDS.map(f => f.col));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [appliedBatches, setAppliedBatches] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: batches = [], isLoading: batchesLoading } = useQuery<ImportBatchRow[]>({
    queryKey: ["/api/corporate/date-fix/batches"],
    queryFn: () => fetch("/api/corporate/date-fix/batches", { credentials: "include" }).then(r => r.json()),
  });

  const { data: preview, isLoading: previewLoading } = useQuery<PreviewResult>({
    queryKey: ["/api/corporate/date-fix/preview", selectedBatch?.id],
    queryFn: () => fetch(`/api/corporate/date-fix/preview/${selectedBatch?.id}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedBatch,
  });

  const { data: auditLog = [], refetch: auditRefetch } = useQuery<AuditEntry[]>({
    queryKey: ["/api/corporate/date-fix/audit"],
    queryFn: () => fetch("/api/corporate/date-fix/audit", { credentials: "include" }).then(r => r.json()),
  });

  const applyMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/corporate/date-fix/apply/${selectedBatch!.id}`, {
        confirm: true,
        fields: selectedFields,
      }),
    onSuccess: (data: any) => {
      toast({
        title: "Correction applied",
        description: `${data.recordsUpdated} driver record(s) updated — dates shifted +1 day.`,
      });
      setAppliedBatches(prev => new Set([...prev, selectedBatch!.id]));
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/date-fix/audit"] });
    },
    onError: (err: Error) => toast({
      title: "Correction failed",
      description: err.message,
      variant: "destructive",
    }),
  });

  const toggleField = (col: string) => {
    setSelectedFields(prev =>
      prev.includes(col) ? prev.filter(f => f !== col) : [...prev, col]
    );
  };

  const alreadyApplied = selectedBatch ? appliedBatches.has(selectedBatch.id) : false;
  const auditForBatch = selectedBatch
    ? auditLog.filter(a => a.batch_id === selectedBatch.id)
    : [];
  const wasEverApplied = auditForBatch.length > 0;

  return (
    <div className="p-6 max-w-6xl space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Wrench className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">UTC Date Shift Correction</h1>
          <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">P0 Tool</Badge>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Corrects dates that were imported one day early due to a UTC-to-local timezone shift.
          Use the <strong className="text-foreground">Batch Correction</strong> section for bulk fixes, or
          the <strong className="text-foreground">Manual Correction</strong> section to fix a single driver.
        </p>
      </div>

      {/* ── Warning Banner ─────────────────────────────────────────────── */}
      <div className="flex gap-3 p-4 rounded-md border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200">
        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-amber-600" />
        <div className="text-sm space-y-1">
          <p className="font-medium">All corrections are permanent data modifications. Always verify before applying.</p>
          <p className="text-amber-800 dark:text-amber-300">
            Batch corrections add <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded text-xs">+1 day</code> to each selected date field.
            Manual corrections set the exact date you specify. Every change is recorded in the audit log.
          </p>
        </div>
      </div>

      {/* ── Root Cause Explainer ────────────────────────────────────────── */}
      <details className="border rounded-md">
        <summary className="cursor-pointer flex items-center gap-2 px-4 py-3 text-sm font-medium hover-elevate rounded-md">
          <Info className="h-4 w-4 text-muted-foreground" />
          Root cause explanation
          <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
        </summary>
        <div className="px-4 pb-4 pt-2 text-sm text-muted-foreground space-y-2">
          <p>
            When XLSX files contain date-only values (e.g. <code className="bg-muted px-1 rounded text-xs">12/27/2024</code>),
            the import system converted them to UTC midnight timestamps:
            <code className="bg-muted px-1 rounded text-xs mx-1">2024-12-27T00:00:00.000Z</code>
          </p>
          <p>
            PostgreSQL received that timestamp and, depending on the database server timezone,
            converted it to local time before storing.
            A UTC-6 server converts <code className="bg-muted px-1 rounded text-xs">2024-12-27T00:00:00Z</code> →
            <code className="bg-muted px-1 rounded text-xs mx-1">2024-12-26T18:00:00</code>,
            causing the stored date to be <code className="bg-muted px-1 rounded text-xs">2024-12-26</code> — one day early.
          </p>
          <p>
            <strong className="text-foreground">Prevention fix already applied:</strong> future imports now pass ISO date strings
            directly to PostgreSQL without the UTC midnight conversion.
          </p>
        </div>
      </details>

      <Separator />
      <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
        Batch Correction (by Import Batch)
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Left: Batch List ───────────────────────────────────────────── */}
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Select a committed import batch to preview and apply +1 day correction to all its date fields.</p>
          {batchesLoading
            ? [1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)
            : batches.length === 0
              ? <p className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-md">No committed import batches found.</p>
              : batches.map(batch => {
                const dCount   = dateCount(batch);
                const dDrivers = Number(batch.driver_count);
                const applied  = appliedBatches.has(batch.id) || auditLog.some(a => a.batch_id === batch.id);
                return (
                  <Card
                    key={batch.id}
                    className={`cursor-pointer transition-colors ${selectedBatch?.id === batch.id ? "ring-2 ring-primary" : "hover-elevate"}`}
                    onClick={() => setSelectedBatch(batch)}
                    data-testid={`batch-card-${batch.id}`}
                  >
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{batch.source_file_name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {fmtDate(batch.committed_at)} · {dDrivers.toLocaleString()} driver{dDrivers !== 1 ? "s" : ""}
                            {dCount > 0 && <span className="text-amber-600 dark:text-amber-400"> · {dCount.toLocaleString()} date field{dCount !== 1 ? "s" : ""}</span>}
                          </p>
                          {batch.created_by_username && (
                            <p className="text-xs text-muted-foreground mt-0.5">by {batch.created_by_username}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          {applied
                            ? <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Corrected</Badge>
                            : dCount > 0
                              ? <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200"><AlertTriangle className="h-3 w-3 mr-1" />Needs review</Badge>
                              : <Badge variant="outline" className="text-xs text-muted-foreground">No dates</Badge>
                          }
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
          }
        </div>

        {/* ── Right: Preview + Apply ─────────────────────────────────────── */}
        <div className="space-y-4">
          {!selectedBatch
            ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border border-dashed rounded-md gap-3">
                <CalendarCheck className="h-10 w-10 opacity-30" />
                <p className="text-sm">Select a batch to preview the correction</p>
              </div>
            )
            : (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    {selectedBatch.source_file_name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Committed {fmtDate(selectedBatch.committed_at)} · {Number(selectedBatch.driver_count).toLocaleString()} drivers · ID: <code className="font-mono">{selectedBatch.id}</code>
                  </p>
                </div>

                {wasEverApplied && (
                  <div className="flex gap-2 p-3 rounded-md border bg-green-50 dark:bg-green-950/20 border-green-200 text-sm text-green-800 dark:text-green-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Correction already applied to this batch</p>
                      <p className="text-xs mt-0.5">{auditForBatch[0]?.message}</p>
                    </div>
                  </div>
                )}

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Fields to Correct</CardTitle>
                    <CardDescription className="text-xs">Only non-null values are modified.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    {ALL_FIELDS.map(f => (
                      <div key={f.col} className="flex items-center gap-2">
                        <Checkbox
                          id={`field-${f.col}`}
                          checked={selectedFields.includes(f.col)}
                          onCheckedChange={() => toggleField(f.col)}
                          disabled={wasEverApplied || alreadyApplied}
                          data-testid={`checkbox-field-${f.col}`}
                        />
                        <Label htmlFor={`field-${f.col}`} className="text-sm cursor-pointer">{f.label}</Label>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <h4 className="font-medium text-sm">
                      Preview
                      {preview && <span className="text-muted-foreground font-normal ml-1">(sample of {preview.preview.length} / {preview.total.toLocaleString()} records)</span>}
                    </h4>
                  </div>

                  {previewLoading
                    ? <Skeleton className="h-32 w-full" />
                    : !preview || preview.total === 0
                      ? (
                        <div className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-md">
                          No records with date fields found in this batch.
                        </div>
                      )
                      : (
                        <div className="border rounded-md overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead className="w-36">Driver</TableHead>
                                <TableHead>Field</TableHead>
                                <TableHead>Before</TableHead>
                                <TableHead></TableHead>
                                <TableHead>After (+1 day)</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {preview.preview.slice(0, 5).flatMap(record =>
                                ALL_FIELDS
                                  .filter(f => selectedFields.includes(f.col) && record.before[f.col.replace(/_([a-z])/g, (_,c) => c.toUpperCase())] !== null)
                                  .map((f, fi) => {
                                    const camelKey = f.col.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
                                    const before = record.before[camelKey];
                                    const after  = record.after[camelKey];
                                    if (!before) return null;
                                    return (
                                      <TableRow key={`${record.id}-${f.col}`}>
                                        {fi === 0
                                          ? <TableCell className="font-medium text-sm align-top">{record.name}</TableCell>
                                          : <TableCell />
                                        }
                                        <TableCell className="text-xs text-muted-foreground">{f.label}</TableCell>
                                        <TableCell className="text-xs font-mono text-red-600 dark:text-red-400">{before}</TableCell>
                                        <TableCell><ArrowRight className="h-3 w-3 text-muted-foreground" /></TableCell>
                                        <TableCell className="text-xs font-mono text-green-600 dark:text-green-400">{after}</TableCell>
                                      </TableRow>
                                    );
                                  }).filter(Boolean)
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      )
                  }
                </div>

                {!wasEverApplied && !alreadyApplied && (
                  <div className="flex justify-end">
                    <Button
                      onClick={() => setConfirmOpen(true)}
                      disabled={selectedFields.length === 0 || !preview || preview.total === 0 || previewLoading}
                      data-testid="button-apply-correction"
                      className="gap-2"
                    >
                      <CalendarCheck className="h-4 w-4" />
                      Apply +1 Day Correction
                      {preview && preview.total > 0 && (
                        <Badge variant="secondary" className="ml-1 text-xs">{preview.total.toLocaleString()} records</Badge>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )
          }
        </div>
      </div>

      {/* ── Manual Single-Driver Correction ─────────────────────────────────── */}
      <Separator />
      <ManualDriverCorrection auditRefetch={auditRefetch} />

      {/* ── Audit Log ──────────────────────────────────────────────────────── */}
      {auditLog.length > 0 && (
        <>
          <Separator />
          <div>
            <h2 className="font-semibold mb-3 flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4" />
              Correction Audit Log
            </h2>
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Batch / Driver</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Applied At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLog.map(entry => (
                    <TableRow key={entry.id} data-testid={`audit-row-${entry.id}`}>
                      <TableCell className="font-mono text-xs">{entry.batch_id?.slice(0, 12)}…</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${entry.action === "manual_date_correction"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-green-50 text-green-700 border-green-200"}`}
                        >
                          {entry.action === "manual_date_correction" ? "Manual" : "Batch"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={entry.message}>
                        {entry.message}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{fmtDate(entry.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      {/* ── Batch Confirmation Dialog ─────────────────────────────────────────── */}
      <AlertDialog open={confirmOpen} onOpenChange={(o) => { if (!o) setConfirmOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Date Correction
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  You are about to add <strong>+1 day</strong> to the following date fields for all
                  <strong> {preview?.total?.toLocaleString() ?? "…"} driver records</strong> in batch:
                </p>
                <code className="block bg-muted px-2 py-1 rounded text-xs font-mono">
                  {selectedBatch?.source_file_name} — {selectedBatch?.id}
                </code>
                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                  {selectedFields.map(col => (
                    <li key={col}>{ALL_FIELDS.find(f => f.col === col)?.label}</li>
                  ))}
                </ul>
                <p className="text-amber-700 dark:text-amber-400 font-medium">
                  This change is permanent and cannot be automatically reversed.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => applyMutation.mutate()}
              disabled={applyMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              data-testid="button-confirm-apply"
            >
              {applyMutation.isPending
                ? <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                : <CalendarCheck className="h-4 w-4 mr-2" />}
              Apply Correction
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
