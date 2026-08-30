import { useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Upload, FileText, CheckCircle, AlertTriangle, XCircle, RefreshCw,
  Clock, Building2, User, BarChart3, Eye, MinusCircle, Copy,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Types ──────────────────────────────────────────────────────────────────────
interface ImportBatch {
  id: string;
  fileName: string;
  uploadedAt: string;
  processingStatus: string;
  totalRows: number;
  insertedRows: number;
  updatedRows: number;
  noChangeRows: number;
  rejectedRows: number;
  duplicateRows: number;
  testAccountRows: number;
  unmappedStatusRows: number;
  unmatchedAccountRows: number;
  unmatchedDriverRows: number;
}

interface UploadResult {
  batchId: string;
  fileName: string;
  total: number;
  inserted: number;
  updated: number;
  noChange: number;
  rejected: number;
  duplicates: number;
  testAccount: number;
  unmappedStatus: number;
  unmatchedAccount: number;
  unmatchedDriver: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined) { return (n ?? 0).toLocaleString(); }

function fmtDate(s?: string) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function BatchStatusBadge({ status }: { status: string }) {
  if (status === "completed")
    return <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Completed</Badge>;
  if (status === "failed")
    return <Badge variant="secondary" className="text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">Failed</Badge>;
  return <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">Processing</Badge>;
}

// ── KPI grid ───────────────────────────────────────────────────────────────────
interface KpiItem { label: string; value: number; icon: React.ElementType; color: string; title?: string; }
function KpiGrid({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {items.map(({ label, value, icon: Icon, color, title }) => (
        <Card key={label} title={title}>
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon className={`w-3.5 h-3.5 shrink-0 ${color || "text-muted-foreground"}`} />
              <span className="text-xs text-muted-foreground leading-tight truncate">{label}</span>
            </div>
            <p className={`text-xl font-bold ${color}`}>{fmt(value)}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function buildKpiItems(b: {
  totalRows: number; insertedRows: number; updatedRows: number;
  noChangeRows: number; rejectedRows: number; duplicateRows: number;
  testAccountRows: number; unmappedStatusRows: number;
  unmatchedAccountRows: number; unmatchedDriverRows: number;
}): KpiItem[] {
  return [
    { label: "Total Rows",      value: b.totalRows,            icon: BarChart3,     color: "" },
    { label: "Inserted",        value: b.insertedRows,          icon: CheckCircle,   color: "text-green-600 dark:text-green-400",   title: "New records created" },
    { label: "Updated",         value: b.updatedRows,           icon: RefreshCw,     color: "text-blue-600 dark:text-blue-400",     title: "Existing records with meaningful changes" },
    { label: "No Change",       value: b.noChangeRows,          icon: MinusCircle,   color: "text-muted-foreground",                title: "Already current — no write needed" },
    { label: "Rejected",        value: b.rejectedRows,          icon: XCircle,       color: "text-red-600 dark:text-red-400",       title: "Missing itinerary_id" },
    { label: "Duplicates",      value: b.duplicateRows,         icon: Copy,          color: "text-orange-600 dark:text-orange-400", title: "Same itinerary_id appeared multiple times in this file" },
    { label: "Test Account",    value: b.testAccountRows,       icon: AlertTriangle, color: "text-violet-600 dark:text-violet-400", title: "Rows suppressed by exclusion rule" },
    { label: "Unmapped Status", value: b.unmappedStatusRows,    icon: AlertTriangle, color: "text-orange-600 dark:text-orange-400", title: "Status value not found in status mapping table" },
    { label: "No Account",      value: b.unmatchedAccountRows,  icon: Building2,     color: "text-amber-600 dark:text-amber-400",   title: "Could not match to a DriverHub account" },
    { label: "No Driver",       value: b.unmatchedDriverRows,   icon: User,          color: "text-amber-600 dark:text-amber-400",   title: "Could not match to a DriverHub driver" },
  ];
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function DraiverImport() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [, navigate] = useLocation();

  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [lastResult, setLastResult] = useState<UploadResult | null>(null);

  const { data: batches, isLoading: batchesLoading } = useQuery<ImportBatch[]>({
    queryKey: ["/api/draiver-import/batches"],
    queryFn: () => fetch("/api/draiver-import/batches", { credentials: "include" }).then(r => r.json()),
  });

  const doUpload = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast({ title: "Invalid file", description: "Please upload a CSV file.", variant: "destructive" });
      return;
    }
    setUploading(true);
    setLastResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch("/api/draiver-import/upload", {
        method: "POST", credentials: "include", body: fd,
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Upload failed");
      setLastResult(data);
      qc.invalidateQueries({ queryKey: ["/api/draiver-import/batches"] });
      toast({
        title: "Import complete",
        description: `${fmt(data.inserted)} inserted · ${fmt(data.updated)} updated · ${fmt(data.noChange)} no change`,
      });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [toast, qc]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) doUpload(f);
  };
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) doUpload(f);
  }, [doUpload]);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Draiver Daily Import</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Upload a Draiver cumulative CSV report. The engine uses{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">itinerary_id</code> as the unique key — re-importing the same file is safe and idempotent.
        </p>
      </div>

      {/* Idempotency callout */}
      <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 px-4 py-3 text-sm text-blue-800 dark:text-blue-300 flex flex-col gap-0.5">
        <strong>Cumulative file — always safe to re-import.</strong>
        <span>Insert if new · Update if changed · No Change if already current · Intra-file duplicates are detected and reported · Unmapped statuses are flagged and excluded.</span>
      </div>

      {/* Upload zone */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Upload CSV File
          </CardTitle>
          <CardDescription>Drag and drop a Draiver daily report CSV, or click to browse. Max 50 MB.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-md p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
              isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/20"
            } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            data-testid="drop-zone-draiver"
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={onFileChange}
              data-testid="input-file-draiver"
            />
            {uploading ? (
              <>
                <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                <p className="text-sm font-medium">Processing import…</p>
                <p className="text-xs text-muted-foreground">Matching accounts, drivers, mapping statuses, deduplicating, upserting…</p>
              </>
            ) : (
              <>
                <FileText className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm font-medium">{isDragging ? "Drop to upload" : "Drag & drop or click to upload"}</p>
                <p className="text-xs text-muted-foreground">CSV — itinerary_id · trip_id · account · driver · status · route · financials</p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Last result */}
      {lastResult && (
        <Card data-testid="card-import-result">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Import Complete — <span className="font-mono text-sm font-normal truncate max-w-72">{lastResult.fileName}</span>
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`/reports/draiver-import/${lastResult.batchId}`)}
                data-testid="button-view-last-result"
              >
                <Eye className="w-3.5 h-3.5 mr-1.5" />
                View Results
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <KpiGrid items={buildKpiItems({
              totalRows:            lastResult.total,
              insertedRows:         lastResult.inserted,
              updatedRows:          lastResult.updated,
              noChangeRows:         lastResult.noChange,
              rejectedRows:         lastResult.rejected,
              duplicateRows:        lastResult.duplicates,
              testAccountRows:      lastResult.testAccount ?? 0,
              unmappedStatusRows:   lastResult.unmappedStatus ?? 0,
              unmatchedAccountRows: lastResult.unmatchedAccount,
              unmatchedDriverRows:  lastResult.unmatchedDriver,
            })} />
            {(lastResult.rejected > 0 || lastResult.duplicates > 0 ||
              (lastResult.testAccount ?? 0) > 0 || (lastResult.unmappedStatus ?? 0) > 0) && (
              <p className="text-xs text-muted-foreground">
                {(lastResult.unmappedStatus ?? 0) > 0 && `${fmt(lastResult.unmappedStatus)} unmapped status${lastResult.unmappedStatus !== 1 ? "es" : ""} excluded. `}
                {(lastResult.testAccount ?? 0) > 0 && `${fmt(lastResult.testAccount)} test account row${lastResult.testAccount !== 1 ? "s" : ""} suppressed. `}
                {lastResult.rejected > 0 && `${fmt(lastResult.rejected)} row${lastResult.rejected !== 1 ? "s" : ""} rejected (missing itinerary_id). `}
                {lastResult.duplicates > 0 && `${fmt(lastResult.duplicates)} duplicate${lastResult.duplicates !== 1 ? "s" : ""} skipped. `}
                Click "View Results" for full row-level detail.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Import History table */}
      <Card data-testid="card-import-history">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Import History
          </CardTitle>
          <CardDescription>
            All Draiver CSV imports, most recent first. Click a row to view full results. Re-importing the same cumulative file is always safe.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {batchesLoading ? (
            <div className="space-y-2 p-4">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !batches || batches.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No imports yet. Upload a CSV to get started.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground text-left">
                    <th className="px-4 py-2.5 font-medium">File</th>
                    <th className="px-4 py-2.5 font-medium whitespace-nowrap">Uploaded</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium text-right">Total</th>
                    <th className="px-4 py-2.5 font-medium text-right text-green-700 dark:text-green-400">Insert</th>
                    <th className="px-4 py-2.5 font-medium text-right text-blue-700 dark:text-blue-400">Update</th>
                    <th className="px-4 py-2.5 font-medium text-right text-muted-foreground">No Chg</th>
                    <th className="px-4 py-2.5 font-medium text-right text-red-700 dark:text-red-400">Reject</th>
                    <th className="px-4 py-2.5 font-medium text-right text-orange-600 dark:text-orange-400">Dupes</th>
                    <th className="px-4 py-2.5 font-medium text-right text-violet-600 dark:text-violet-400">Test</th>
                    <th className="px-4 py-2.5 font-medium text-right text-orange-600 dark:text-orange-400">Unmapped</th>
                    <th className="px-4 py-2.5 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr
                      key={batch.id}
                      className="border-b last:border-0 hover-elevate cursor-pointer"
                      onClick={() => navigate(`/reports/draiver-import/${batch.id}`)}
                      data-testid={`row-batch-${batch.id}`}
                    >
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-xs truncate max-w-52">{batch.fileName}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(batch.uploadedAt)}</td>
                      <td className="px-4 py-2.5"><BatchStatusBadge status={batch.processingStatus} /></td>
                      <td className="px-4 py-2.5 text-sm text-right">{fmt(batch.totalRows)}</td>
                      <td className="px-4 py-2.5 text-sm text-right font-medium text-green-600 dark:text-green-400">{fmt(batch.insertedRows)}</td>
                      <td className="px-4 py-2.5 text-sm text-right font-medium text-blue-600 dark:text-blue-400">{fmt(batch.updatedRows)}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-muted-foreground">{fmt(batch.noChangeRows)}</td>
                      <td className="px-4 py-2.5 text-sm text-right font-medium text-red-600 dark:text-red-400">{fmt(batch.rejectedRows)}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-orange-600 dark:text-orange-400">{fmt(batch.duplicateRows)}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-violet-600 dark:text-violet-400">{fmt(batch.testAccountRows)}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-orange-600 dark:text-orange-400">{fmt(batch.unmappedStatusRows ?? 0)}</td>
                      <td className="px-4 py-2.5" onClick={e => { e.stopPropagation(); navigate(`/reports/draiver-import/${batch.id}`); }}>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          data-testid={`button-drilldown-${batch.id}`}
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
