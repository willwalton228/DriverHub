import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Upload, CheckCircle2, XCircle, AlertTriangle,
  Car, Search, RefreshCw, MoreHorizontal, ChevronRight, FileText, Clock,
  Download, TriangleAlert, Trash2, Ban, RotateCcw,
} from "lucide-react";
import { FileDropZone } from "@/components/ui/FileDropZone";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/dateFormat";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Batch {
  id: string;
  provider: string;
  fileName: string;
  fileSizeBytes: number | null;
  status: string;
  totalRecords: number | null;
  matchedRecords: number | null;
  unmatchedRecords: number | null;
  skippedRecords: number | null;
  errorMessage: string | null;
  createdAt: string;
}

interface Ride {
  id: string;
  batchId: string;
  provider: string;
  accountId: string | null;
  accountNumber: string | null;
  accountName: string | null;
  matchStatus: string;
  matchConfidence: string | null;
  matchMethod: string | null;
  providerTripId: string | null;
  rideDate: string | null;
  rideDatetime: string | null;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  passengerName: string | null;
  driverName: string | null;
  fareAmount: string | null;
  totalAmount: string | null;
  rideStatus: string | null;
  rideType: string | null;
  city: string | null;
  state: string | null;
  // Column AB — trip/move linkage
  externalTripMoveRefRaw: string | null;
  externalTripMoveRefNormalized: string | null;
  tripMoveRefType: string | null;
  linkedMoveId: string | null;
  linkedTripId: string | null;
  linkStatus: string | null;
  linkExceptionReason: string | null;
}

interface Exception {
  id: string;
  rideId: string;
  batchId: string;
  reason: string | null;
  resolution: string;
  notes: string | null;
  createdAt: string;
  ride: Ride;
}

interface AccountSearchResult {
  id: string;
  customerNumber: string | null;
  companyName: string | null;
  customerAddress: string | null;
  customerCity: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function ProviderBadge({ provider }: { provider: string }) {
  return (
    <Badge
      className={provider === "uber" ? "bg-black text-white" : "bg-pink-600 text-white"}
    >
      {provider === "uber" ? "Uber" : "Lyft"}
    </Badge>
  );
}

function MatchBadge({ status, confidence }: { status: string; confidence?: string | null }) {
  if (status === "matched") {
    return (
      <Badge className="bg-green-600 text-white gap-1">
        <CheckCircle2 className="h-3 w-3" />
        {confidence ? `Matched · ${confidence}` : "Matched"}
      </Badge>
    );
  }
  if (status === "dismissed") {
    return (
      <Badge variant="secondary" className="gap-1">
        <XCircle className="h-3 w-3" />
        Dismissed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-600 dark:text-yellow-400">
      <AlertTriangle className="h-3 w-3" />
      Unmatched
    </Badge>
  );
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatCurrency(val: string | null): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return `$${n.toFixed(2)}`;
}

// ─── Types for upload result ──────────────────────────────────────────────────
interface UploadRowError {
  rowNumber: number;
  field: string;
  errorCode: string;
  errorReason: string;
  originalData: Record<string, string>;
}

interface UploadResult {
  batchId: string;
  totalRecords: number;
  insertedCount: number;
  skippedCount: number;
  rejectedCount: number;
  successfulRows: number;
  failedRows: number;
  matchedRecords: number;
  unmatchedRecords: number;
  totalImportedAmount: number;
  totalRejectedAmount: number;
  hasErrors: boolean;
  message: string;
  rowErrors: UploadRowError[];
  detectedHeaderRow: number;
  headerConfidence: "high" | "low";
  headerWarning: {
    errorCode: string;
    detectedHeaders: string[];
    expectedHeaders: string[];
    missingRequiredFields: string[];
  } | null;
}

// ─── Error report CSV download ────────────────────────────────────────────────
function downloadErrorReportCsv(result: UploadResult, fileName: string) {
  if (!result.rowErrors.length) return;

  // Gather all original data keys for columns
  const dataKeys = Array.from(
    new Set(result.rowErrors.flatMap(e => Object.keys(e.originalData)))
  );

  const headers = ["Row Number", "Error Code", "Field", "Error Reason", ...dataKeys];
  const rows = result.rowErrors.map(e => [
    String(e.rowNumber),
    e.errorCode,
    e.field,
    e.errorReason,
    ...dataKeys.map(k => e.originalData[k] ?? ""),
  ]);

  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `error-report-${fileName.replace(/\.[^.]+$/, "")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Upload Tab ───────────────────────────────────────────────────────────────
function UploadTab({ onSuccess, onViewRejected }: { onSuccess: () => void; onViewRejected: () => void }) {
  const { toast } = useToast();
  const [provider, setProvider] = useState<"uber" | "lyft">("uber");
  const [headerRow, setHeaderRow] = useState<string>("auto");
  const [file, setFile] = useState<File | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const [result, setResult] = useState<UploadResult | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      const form = new FormData();
      form.append("file", file);
      form.append("provider", provider);
      form.append("headerRow", headerRow);
      const resp = await fetch("/api/corporate/rideshare/upload", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      // Even on non-OK we parse the body for detail
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.message || "Upload failed");
      }
      return data as UploadResult;
    },
    onSuccess: (data) => {
      setResult(data);
      setUploadedFileName(file?.name || "");
      setFile(null);
      if (data.hasErrors) {
        toast({
          title: "Upload completed with errors",
          description: `${data.successfulRows} of ${data.totalRecords} rows processed. ${data.failedRows} failed.`,
          variant: "destructive",
        });
      } else {
        toast({ title: "File processed", description: data.message });
      }
      onSuccess();
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload Rideshare File</CardTitle>
          <CardDescription>
            Upload a CSV or XLSX export from Uber for Business or Lyft Business. All source data will be preserved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={(v) => { setProvider(v as "uber" | "lyft"); setResult(null); }}>
                <SelectTrigger data-testid="select-rideshare-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="uber">Uber for Business</SelectItem>
                  <SelectItem value="lyft">Lyft Business</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Header Row</Label>
              <Select value={headerRow} onValueChange={setHeaderRow}>
                <SelectTrigger data-testid="select-rideshare-header-row">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-detect</SelectItem>
                  {Array.from({ length: 15 }, (_, i) => i + 1).map(n => (
                    <SelectItem key={n} value={String(n)}>Row {n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Auto-detect scans the first 15 rows. Select manually if the file has an unusual layout.
              </p>
            </div>
          </div>

          <FileDropZone
            onFileSelect={setFile}
            selectedFile={file}
            onClear={() => setFile(null)}
            accept=".csv,.xlsx,.xls"
            disabled={uploadMutation.isPending}
            hint="Supports CSV and XLSX exports from Uber for Business or Lyft Business"
            testId="dropzone-rideshare"
            inputTestId="input-rideshare-file"
            browseTestId="button-browse-rideshare"
          />

          <Button
            onClick={() => uploadMutation.mutate()}
            disabled={!file || uploadMutation.isPending}
            data-testid="button-upload-rideshare"
          >
            {uploadMutation.isPending ? (
              <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Processing…</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" /> Upload & Process</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Result card */}
      {result && (
        <div className="space-y-4">
          {/* Header warning — column mismatch */}
          {result.headerWarning && (
            <Card className="border-destructive/50">
              <CardContent className="pt-4">
                <div className="flex gap-3 items-start">
                  <TriangleAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-destructive">Column Mismatch Detected</p>
                    <p className="text-xs text-muted-foreground">
                      None of the file headers matched the expected {provider === "uber" ? "Uber for Business" : "Lyft Business"} columns.
                      Verify you are uploading the correct provider file and that the header row was correctly detected.
                    </p>
                    {result.headerWarning.missingRequiredFields?.length > 0 && (
                      <p className="text-xs font-medium text-destructive">
                        Missing required {provider === "uber" ? "Uber" : "Lyft"} fields:{" "}
                        {result.headerWarning.missingRequiredFields.join(", ")}
                      </p>
                    )}
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Detected headers in file:</p>
                      <p className="text-xs text-muted-foreground break-all">
                        {result.headerWarning.detectedHeaders.join(", ") || "(none)"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium">
                        Core {provider === "uber" ? "Uber for Business" : "Lyft Business"} fields (expected any of):
                      </p>
                      <p className="text-xs text-muted-foreground break-all">
                        {result.headerWarning.expectedHeaders
                          .map(f => f.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "))
                          .join(" · ")}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                {result.hasErrors ? (
                  <>
                    <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0" />
                    Upload Completed with Errors
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                    Upload Complete
                  </>
                )}
              </CardTitle>
              <div className="space-y-1">
                {result.hasErrors && (
                  <p className="text-sm text-muted-foreground">
                    Valid rows were saved. Fix the failed rows and re-upload only those records.
                  </p>
                )}
                {result.detectedHeaderRow && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    {result.headerConfidence === "high" ? (
                      <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-3 w-3 text-yellow-600 shrink-0" />
                    )}
                    Header row detected at row {result.detectedHeaderRow}
                    {result.headerConfidence === "low" && (
                      <span className="text-yellow-600"> — low confidence. If data looks wrong, re-upload with a manual row selection.</span>
                    )}
                  </p>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Row reconciliation counts */}
              <div className="grid gap-3 text-center grid-cols-2 sm:grid-cols-4">
                <div>
                  <p className="text-2xl font-bold">{result.totalRecords}</p>
                  <p className="text-xs text-muted-foreground">Total Rows in File</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">{result.insertedCount ?? result.successfulRows ?? result.totalRecords}</p>
                  <p className="text-xs text-muted-foreground">Successfully Imported</p>
                </div>
                <div>
                  <p className={`text-2xl font-bold ${(result.rejectedCount ?? result.skippedCount) > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {result.rejectedCount ?? result.skippedCount}
                  </p>
                  <p className="text-xs text-muted-foreground">Rejected</p>
                </div>
                <div>
                  <p className={`text-2xl font-bold ${result.matchedRecords > 0 ? "text-foreground" : "text-muted-foreground"}`}>{result.matchedRecords}</p>
                  <p className="text-xs text-muted-foreground">Auto-Matched</p>
                </div>
              </div>

              {/* Financial reconciliation */}
              {(result.totalImportedAmount != null || result.totalRejectedAmount != null) && (
                <div className="rounded-md border bg-muted/30 px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-lg font-bold text-green-600">
                      ${(result.totalImportedAmount ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground">Imported Amount</p>
                  </div>
                  <div>
                    <p className={`text-lg font-bold ${(result.totalRejectedAmount ?? 0) > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      ${(result.totalRejectedAmount ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground">Rejected Amount</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">
                      ${((result.totalImportedAmount ?? 0) + (result.totalRejectedAmount ?? 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground">Total in File</p>
                  </div>
                </div>
              )}

              {/* Rejected rows callout */}
              {(result.rejectedCount ?? result.skippedCount) > 0 && (
                <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 flex-wrap">
                  <div className="flex items-center gap-2 text-sm">
                    <Ban className="h-4 w-4 text-destructive shrink-0" />
                    <span>
                      <span className="font-medium text-destructive">{result.rejectedCount ?? result.skippedCount} row{(result.rejectedCount ?? result.skippedCount) !== 1 ? "s" : ""} rejected</span>
                      {" "}and not imported. Review them to preserve reconciliation integrity.
                    </span>
                  </div>
                  <Button size="sm" variant="outline" onClick={onViewRejected} data-testid="button-view-rejected">
                    View Rejected
                  </Button>
                </div>
              )}

              {result.unmatchedRecords > 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  {result.unmatchedRecords} ride(s) could not be auto-matched. Review them in the Exceptions tab.
                </p>
              )}

              {/* Error table */}
              {result.rowErrors.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="text-sm font-medium">
                      {result.rowErrors.length} row error{result.rowErrors.length !== 1 ? "s" : ""}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadErrorReportCsv(result, uploadedFileName)}
                      data-testid="button-download-error-report"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Error Report
                    </Button>
                  </div>
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-20">Row</TableHead>
                          <TableHead className="w-32">Field</TableHead>
                          <TableHead className="w-44">Code</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.rowErrors.slice(0, 20).map((e, idx) => (
                          <TableRow key={idx} data-testid={`row-upload-error-${e.rowNumber}`}>
                            <TableCell className="font-mono text-sm">{e.rowNumber}</TableCell>
                            <TableCell className="text-sm">{e.field}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs font-mono">
                                {e.errorCode}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{e.errorReason}</TableCell>
                          </TableRow>
                        ))}
                        {result.rowErrors.length > 20 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-3">
                              {result.rowErrors.length - 20} more errors — download the full error report for details.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Format guidance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Uber for Business — Supported Detailed Export Fields</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              {[
                "Trip/Eats ID",
                "Request Date (UTC)",
                "Request Time (UTC)",
                "First Name",
                "Last Name",
                "Email",
                "Employee ID",
                "Service",
                "City",
                "Pickup Address",
                "Drop-off Address",
                "Transaction Type",
                "Distance (mi)",
                "Duration (min)",
                "Total Fare USD",
                "Network Transaction Id",
              ].map(field => (
                <p key={field} className="text-xs text-muted-foreground">{field}</p>
              ))}
            </div>
            <p className="text-xs text-muted-foreground italic">
              Additional detailed export columns are preserved automatically.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Lyft Business — Supported Fields</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-medium">Key fields</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                <li>Trip ID</li>
                <li>Date + Time</li>
                <li>Pickup Location · Drop-off Location</li>
                <li>Ride Type</li>
                <li>Distance · Duration</li>
                <li>Amount · Tip · Requested</li>
                <li>Passenger Name · Driver Name</li>
              </ul>
            </div>
            <p className="text-xs text-muted-foreground italic">
              Standard Lyft Business CSV/XLSX export. All source columns preserved automatically.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Rides Tab ────────────────────────────────────────────────────────────────
function RidesTab() {
  const [search, setSearch] = useState("");
  const [filterProvider, setFilterProvider] = useState("__all__");
  const [filterMatchStatus, setFilterMatchStatus] = useState("__all__");
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
  if (search) params.set("search", search);
  if (filterProvider !== "__all__") params.set("provider", filterProvider);
  if (filterMatchStatus !== "__all__") params.set("matchStatus", filterMatchStatus);

  const { data, isLoading } = useQuery<{ rides: Ride[]; total: number }>({
    queryKey: ["/api/corporate/rideshare/rides", filterProvider, filterMatchStatus, search, offset],
    queryFn: () => fetch(`/api/corporate/rideshare/rides?${params}`, { credentials: "include" }).then(r => r.json()),
  });

  const rides = data?.rides || [];
  const total = data?.total || 0;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search address, passenger, account…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
            className="pl-8"
            data-testid="input-rides-search"
          />
        </div>
        <Select value={filterProvider} onValueChange={(v) => { setFilterProvider(v); setOffset(0); }}>
          <SelectTrigger className="w-36" data-testid="select-rides-provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Providers</SelectItem>
            <SelectItem value="uber">Uber</SelectItem>
            <SelectItem value="lyft">Lyft</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterMatchStatus} onValueChange={(v) => { setFilterMatchStatus(v); setOffset(0); }}>
          <SelectTrigger className="w-40" data-testid="select-rides-match-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Statuses</SelectItem>
            <SelectItem value="matched">Matched</SelectItem>
            <SelectItem value="unmatched">Unmatched</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Total */}
      <p className="text-sm text-muted-foreground">{total.toLocaleString()} ride{total !== 1 ? "s" : ""}</p>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Pickup</TableHead>
              <TableHead>Dropoff</TableHead>
              <TableHead>Passenger</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rides.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  No rides found
                </TableCell>
              </TableRow>
            ) : (
              rides.map((ride) => (
                <TableRow key={ride.id} data-testid={`row-ride-${ride.id}`}>
                  <TableCell><ProviderBadge provider={ride.provider} /></TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {ride.rideDate ? formatDate(ride.rideDate) : "—"}
                  </TableCell>
                  <TableCell className="text-sm max-w-44 truncate" title={ride.pickupAddress || undefined}>
                    {ride.pickupAddress || "—"}
                  </TableCell>
                  <TableCell className="text-sm max-w-44 truncate" title={ride.dropoffAddress || undefined}>
                    {ride.dropoffAddress || "—"}
                  </TableCell>
                  <TableCell className="text-sm">{ride.passengerName || "—"}</TableCell>
                  <TableCell className="text-sm font-medium">{formatCurrency(ride.totalAmount)}</TableCell>
                  <TableCell className="text-sm">
                    {ride.accountName ? (
                      <span className="text-foreground">{ride.accountName}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <MatchBadge status={ride.matchStatus} confidence={ride.matchConfidence} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {total > LIMIT && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Exceptions Tab ───────────────────────────────────────────────────────────
function LinkStatusBadge({ linkStatus, linkExceptionReason }: { linkStatus: string | null; linkExceptionReason: string | null }) {
  if (!linkStatus || linkStatus === "unlinked") return <Badge variant="secondary" className="text-xs">No Ref</Badge>;
  if (linkStatus === "linked") return <Badge className="bg-green-600 text-white text-xs">Linked</Badge>;
  if (linkStatus === "employee_expense") return <Badge className="bg-blue-600 text-white text-xs">Employee</Badge>;
  if (linkStatus === "exception") {
    if (linkExceptionReason === "invalid_trip_move_reference_length")
      return <Badge variant="destructive" className="text-xs">Invalid Ref</Badge>;
    if (linkExceptionReason === "trip_move_reference_not_found")
      return <Badge variant="destructive" className="text-xs">Ref Not Found</Badge>;
    return <Badge variant="destructive" className="text-xs">Exception</Badge>;
  }
  return <Badge variant="outline" className="text-xs">{linkStatus}</Badge>;
}

function ExceptionsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filterResolution, setFilterResolution] = useState("pending");
  const [filterLinkType, setFilterLinkType] = useState("all");
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [activeException, setActiveException] = useState<Exception | null>(null);
  const [accountSearch, setAccountSearch] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<AccountSearchResult | null>(null);
  const [matchNotes, setMatchNotes] = useState("");
  const [dismissModalOpen, setDismissModalOpen] = useState(false);
  const [dismissNotes, setDismissNotes] = useState("");

  const params = new URLSearchParams({ resolution: filterResolution, limit: "200" });

  const { data, isLoading, refetch } = useQuery<{ exceptions: Exception[]; total: number }>({
    queryKey: ["/api/corporate/rideshare/exceptions", filterResolution],
    queryFn: () => fetch(`/api/corporate/rideshare/exceptions?${params}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: accountResults = [] } = useQuery<AccountSearchResult[]>({
    queryKey: ["/api/corporate/rideshare/accounts-search", accountSearch],
    queryFn: () =>
      fetch(`/api/corporate/rideshare/accounts-search?q=${encodeURIComponent(accountSearch)}`, { credentials: "include" }).then(r => r.json()),
    enabled: accountSearch.length >= 2,
  });

  const matchMutation = useMutation({
    mutationFn: (data: { id: string; accountId: string; notes: string }) =>
      apiRequest("POST", `/api/corporate/rideshare/exceptions/${data.id}/match`, { accountId: data.accountId, notes: data.notes }),
    onSuccess: () => {
      toast({ title: "Exception resolved", description: "Ride matched to account." });
      setMatchModalOpen(false);
      setActiveException(null);
      setSelectedAccount(null);
      setAccountSearch("");
      setMatchNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/exceptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/rides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/batches"] });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const dismissMutation = useMutation({
    mutationFn: (data: { id: string; notes: string }) =>
      apiRequest("POST", `/api/corporate/rideshare/exceptions/${data.id}/dismiss`, { notes: data.notes }),
    onSuccess: () => {
      toast({ title: "Exception dismissed" });
      setDismissModalOpen(false);
      setActiveException(null);
      setDismissNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/exceptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/rides"] });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const relinkMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/corporate/rideshare/relink", {}),
    onSuccess: (data: any) => {
      toast({ title: "Relink complete", description: data?.message ?? "Relink finished." });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/exceptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/rides"] });
    },
    onError: (err: Error) => toast({ title: "Relink failed", description: err.message, variant: "destructive" }),
  });

  const allExceptions = data?.exceptions || [];
  const total = data?.total || 0;

  // Client-side filter by link type
  const exceptions = filterLinkType === "all"
    ? allExceptions
    : filterLinkType === "invalid_length"
      ? allExceptions.filter(e => e.ride.linkExceptionReason === "invalid_trip_move_reference_length")
      : filterLinkType === "ref_not_found"
        ? allExceptions.filter(e => e.ride.linkExceptionReason === "trip_move_reference_not_found")
        : filterLinkType === "employee"
          ? allExceptions.filter(e => e.ride.linkStatus === "employee_expense")
          : allExceptions.filter(e => !e.ride.linkStatus || e.ride.linkStatus === "unlinked");

  const refNotFoundCount = allExceptions.filter(e => e.ride.linkExceptionReason === "trip_move_reference_not_found").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center">
          <Select value={filterResolution} onValueChange={setFilterResolution}>
            <SelectTrigger className="w-44" data-testid="select-exc-resolution">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="matched">Resolved — Matched</SelectItem>
              <SelectItem value="dismissed">Resolved — Dismissed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterLinkType} onValueChange={setFilterLinkType}>
            <SelectTrigger className="w-48" data-testid="select-exc-link-type">
              <SelectValue placeholder="Exception type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All exception types</SelectItem>
              <SelectItem value="address_unmatched">Address / account unmatched</SelectItem>
              <SelectItem value="ref_not_found">Ref not found in system</SelectItem>
              <SelectItem value="invalid_length">Invalid reference length</SelectItem>
              <SelectItem value="employee">Employee expense</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">{exceptions.length} of {total} shown</p>
        </div>
        <div className="flex gap-2 items-center">
          {refNotFoundCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => relinkMutation.mutate()}
              disabled={relinkMutation.isPending}
              data-testid="button-relink"
            >
              <RotateCcw className={`h-4 w-4 mr-1.5 ${relinkMutation.isPending ? "animate-spin" : ""}`} />
              Relink ({refNotFoundCount})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-exceptions">
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Passenger</TableHead>
              <TableHead>Trip/Move Ref</TableHead>
              <TableHead>Link Status</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Exception Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-28">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : exceptions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                  {filterResolution === "pending" ? "No pending exceptions — all rides are matched." : "No exceptions found."}
                </TableCell>
              </TableRow>
            ) : (
              exceptions.map((exc) => (
                <TableRow key={exc.id} data-testid={`row-exception-${exc.id}`}>
                  <TableCell><ProviderBadge provider={exc.ride.provider} /></TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {exc.ride.rideDate ? formatDate(exc.ride.rideDate) : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{exc.ride.passengerName || "—"}</TableCell>
                  <TableCell className="text-sm font-mono">
                    {exc.ride.externalTripMoveRefNormalized ? (
                      <span title={`Raw: ${exc.ride.externalTripMoveRefRaw}`}>
                        {exc.ride.externalTripMoveRefNormalized}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    <LinkStatusBadge linkStatus={exc.ride.linkStatus ?? null} linkExceptionReason={exc.ride.linkExceptionReason ?? null} />
                  </TableCell>
                  <TableCell className="text-sm font-medium">{formatCurrency(exc.ride.totalAmount)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-52 truncate" title={exc.ride.linkExceptionReason || exc.reason || undefined}>
                    {exc.ride.linkExceptionReason
                      ? exc.ride.linkExceptionReason.replace(/_/g, " ")
                      : exc.reason || "—"}
                  </TableCell>
                  <TableCell>
                    {exc.resolution === "pending" ? (
                      <Badge variant="outline" className="border-yellow-500 text-yellow-600 dark:text-yellow-400">
                        Pending
                      </Badge>
                    ) : exc.resolution === "matched" ? (
                      <Badge className="bg-green-600 text-white">Matched</Badge>
                    ) : (
                      <Badge variant="secondary">Dismissed</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {exc.resolution === "pending" && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setActiveException(exc); setMatchModalOpen(true); }}
                          data-testid={`button-match-exception-${exc.id}`}
                        >
                          Match
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setActiveException(exc); setDismissModalOpen(true); }}
                          data-testid={`button-dismiss-exception-${exc.id}`}
                        >
                          Dismiss
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Match Modal */}
      <Dialog open={matchModalOpen} onOpenChange={(o) => { if (!o) { setMatchModalOpen(false); setSelectedAccount(null); setAccountSearch(""); setMatchNotes(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Match Ride to Account</DialogTitle>
            <DialogDescription>
              Search for the account this ride belongs to.
            </DialogDescription>
          </DialogHeader>
          {activeException && (
            <div className="space-y-4">
              <div className="bg-muted rounded-md p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Pickup:</span> {activeException.ride.pickupAddress || "—"}</p>
                <p><span className="text-muted-foreground">Dropoff:</span> {activeException.ride.dropoffAddress || "—"}</p>
                {activeException.ride.passengerName && (
                  <p><span className="text-muted-foreground">Passenger:</span> {activeException.ride.passengerName}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Search Accounts</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Company name, account number, or address…"
                    value={accountSearch}
                    onChange={(e) => { setAccountSearch(e.target.value); setSelectedAccount(null); }}
                    className="pl-8"
                    data-testid="input-account-search"
                  />
                </div>
                {accountResults.length > 0 && !selectedAccount && (
                  <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                    {accountResults.map((acct) => (
                      <button
                        key={acct.id}
                        className="w-full text-left px-3 py-2 hover-elevate text-sm"
                        onClick={() => { setSelectedAccount(acct); setAccountSearch(acct.companyName || ""); }}
                        data-testid={`option-account-${acct.id}`}
                      >
                        <p className="font-medium">{acct.companyName}</p>
                        <p className="text-xs text-muted-foreground">
                          {acct.customerNumber} · {[acct.customerAddress, acct.customerCity].filter(Boolean).join(", ")}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
                {selectedAccount && (
                  <div className="border border-green-500 rounded-md px-3 py-2 text-sm flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{selectedAccount.companyName}</p>
                      <p className="text-xs text-muted-foreground">{selectedAccount.customerNumber}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { setSelectedAccount(null); setAccountSearch(""); }}>
                      Change
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  placeholder="Why was this match made manually?"
                  value={matchNotes}
                  onChange={(e) => setMatchNotes(e.target.value)}
                  data-testid="textarea-match-notes"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMatchModalOpen(false)}>Cancel</Button>
            <Button
              disabled={!selectedAccount || matchMutation.isPending}
              onClick={() => {
                if (!activeException || !selectedAccount) return;
                matchMutation.mutate({ id: activeException.id, accountId: selectedAccount.id, notes: matchNotes });
              }}
              data-testid="button-confirm-match"
            >
              {matchMutation.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Saving…</> : "Confirm Match"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dismiss Modal */}
      <Dialog open={dismissModalOpen} onOpenChange={(o) => { if (!o) { setDismissModalOpen(false); setActiveException(null); setDismissNotes(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss Exception</DialogTitle>
            <DialogDescription>
              This ride will be marked as dismissed and removed from the pending exceptions queue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Reason for dismissal…"
              value={dismissNotes}
              onChange={(e) => setDismissNotes(e.target.value)}
              data-testid="textarea-dismiss-notes"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDismissModalOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={dismissMutation.isPending}
              onClick={() => {
                if (!activeException) return;
                dismissMutation.mutate({ id: activeException.id, notes: dismissNotes });
              }}
              data-testid="button-confirm-dismiss"
            >
              {dismissMutation.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Dismissing…</> : "Dismiss"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Audit Log Entry type ─────────────────────────────────────────────────────
interface AuditLogEntry {
  id: string;
  eventType: string;
  actorUserEmail: string | null;
  targetEntityLabel: string | null;
  reason: string | null;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// ─── Batch History Tab ────────────────────────────────────────────────────────
function BatchHistoryTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rematchingId, setRematchingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);

  // Pre-delete impact — fetched as soon as the user clicks Delete on a batch
  const { data: deleteImpact, isLoading: impactLoading } = useQuery<{
    rideCount: number; totalRevenue: number; matchedCount: number; unmatchedCount: number; fileName: string;
  }>({
    queryKey: ["/api/corporate/rideshare/batches", confirmDeleteId, "impact"],
    queryFn: () => fetch(`/api/corporate/rideshare/batches/${confirmDeleteId}/impact`, { credentials: "include" }).then(r => r.json()),
    enabled: !!confirmDeleteId,
    staleTime: 0,
  });

  const { data: batches = [], isLoading } = useQuery<Batch[]>({
    queryKey: ["/api/corporate/rideshare/batches"],
    queryFn: () => fetch("/api/corporate/rideshare/batches", { credentials: "include" }).then(r => r.json()),
  });

  const { data: auditLog = [], isLoading: auditLoading } = useQuery<AuditLogEntry[]>({
    queryKey: ["/api/corporate/rideshare/batches/audit-log"],
    queryFn: () => fetch("/api/corporate/rideshare/batches/audit-log", { credentials: "include" }).then(r => r.json()),
    enabled: showAudit,
  });

  // ── Empty-batch count for cleanup banner ──────────────────────────────────
  const emptyBatches = batches.filter(b => (b.totalRecords ?? 0) === 0 || b.status !== "complete");

  // ── Delete ─────────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/corporate/rideshare/batches/${id}`),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/rides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/exceptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/employee-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/batches/audit-log"] });
      toast({
        title: "Batch deleted",
        description: data?.message ?? "The import batch has been soft-deleted and removed from reporting. Deletion logged to audit trail.",
      });
      setDeletingId(null);
      setConfirmDeleteId(null);
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err.message || "Could not delete the batch.", variant: "destructive" });
      setDeletingId(null);
      setConfirmDeleteId(null);
    },
  });

  // ── Bulk Cleanup ───────────────────────────────────────────────────────────
  const bulkCleanupMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/corporate/rideshare/batches/bulk-cleanup"),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/batches/audit-log"] });
      toast({ title: "Cleanup complete", description: data?.message ?? "Empty batches removed and logged to audit trail." });
    },
    onError: (err: any) => {
      toast({ title: "Cleanup failed", description: err.message || "Could not complete cleanup.", variant: "destructive" });
    },
  });

  // ── Rematch ────────────────────────────────────────────────────────────────
  const rematchMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/corporate/rideshare/batches/${id}/rematch`),
    onSuccess: (data: any, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/rides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/batches/audit-log"] });
      const { nowMatched, nowUnmatched, previouslyMatched, previouslyUnmatched, totalRides } = data ?? {};
      const matchGain = (nowMatched ?? 0) - (previouslyMatched ?? 0);
      const excDrop   = (previouslyUnmatched ?? 0) - (nowUnmatched ?? 0);
      toast({
        title: "Rematch complete",
        description: `${totalRides} rides reprocessed — ${nowMatched} matched, ${nowUnmatched} in exceptions. ${matchGain > 0 ? `${matchGain} newly matched, ${excDrop} fewer exceptions.` : "No new matches found."}`,
      });
      setRematchingId(null);
    },
    onError: (err: any) => {
      toast({ title: "Rematch failed", description: err.message || "Could not rematch the batch.", variant: "destructive" });
      setRematchingId(null);
    },
  });

  const confirmBatch = batches.find(b => b.id === confirmDeleteId);

  const eventTypeLabel = (t: string) => {
    if (t === "rideshare_batch_deleted")      return "Batch Deleted";
    if (t === "rideshare_batch_bulk_cleanup") return "Bulk Cleanup";
    if (t === "rideshare_batch_rematch")      return "Rematch";
    return t;
  };

  const eventTypeBadgeColor = (t: string) => {
    if (t === "rideshare_batch_deleted")      return "bg-destructive text-destructive-foreground";
    if (t === "rideshare_batch_bulk_cleanup") return "bg-orange-500 text-white";
    if (t === "rideshare_batch_rematch")      return "bg-blue-600 text-white";
    return "";
  };

  return (
    <div className="space-y-4">
      {/* Delete confirmation dialog — shows live impact before confirming */}
      <AlertDialog open={!!confirmDeleteId} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Delete Import Batch?
            </AlertDialogTitle>
          </AlertDialogHeader>

          <div className="space-y-3 py-1">
            {/* File name */}
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{confirmBatch?.fileName ?? "This batch"}</span>{" "}
              will be removed from all reporting.
            </p>

            {/* Live impact block */}
            <div className="rounded-md border bg-destructive/5 border-destructive/20 p-4 space-y-2">
              {impactLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ) : deleteImpact ? (
                <>
                  <p className="text-sm font-semibold text-destructive" data-testid="text-delete-impact">
                    This will remove {deleteImpact.rideCount.toLocaleString()} ride{deleteImpact.rideCount !== 1 ? "s" : ""} totaling {formatCurrency(deleteImpact.totalRevenue.toString())} from reporting.
                  </p>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>Matched: {deleteImpact.matchedCount}</span>
                    <span>Unmatched: {deleteImpact.unmatchedCount}</span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Loading impact data…</p>
              )}
            </div>

            {/* Behavior note */}
            <div className="rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">What happens:</p>
              <p>Rides are soft-deleted and immediately excluded from all reporting totals.</p>
              <p>This action is logged to the audit trail with the user, timestamp, and number of affected records.</p>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-batch">Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-delete-batch"
              onClick={() => {
                if (!confirmDeleteId) return;
                setDeletingId(confirmDeleteId);
                deleteMutation.mutate(confirmDeleteId);
              }}
              className="bg-destructive text-destructive-foreground"
              disabled={deleteMutation.isPending || impactLoading}
            >
              {deleteMutation.isPending ? "Deleting…" : "Confirm Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cleanup banner — only shown when empty/failed batches exist */}
      {emptyBatches.length > 0 && (
        <Card className="border-orange-200 dark:border-orange-800">
          <CardContent className="py-3 px-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
                <span>
                  <span className="font-medium">{emptyBatches.length} batch{emptyBatches.length !== 1 ? "es" : ""}</span>
                  {" "}with no ride records detected (failed or duplicate imports).
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                data-testid="button-bulk-cleanup"
                disabled={bulkCleanupMutation.isPending}
                onClick={() => bulkCleanupMutation.mutate()}
              >
                {bulkCleanupMutation.isPending ? (
                  <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Cleaning…</>
                ) : (
                  <><Trash2 className="h-3.5 w-3.5" /> Remove {emptyBatches.length} Empty Batch{emptyBatches.length !== 1 ? "es" : ""}</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Batch table */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File Name</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead>Rides</TableHead>
              <TableHead>Matched</TableHead>
              <TableHead>Exceptions</TableHead>
              <TableHead>Skipped</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : batches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                  No uploads yet. Use the Upload tab to ingest your first file.
                </TableCell>
              </TableRow>
            ) : (
              batches.map((batch) => {
                const hasRides = (batch.totalRecords ?? 0) > 0 && batch.status === "complete";
                const isRematching = rematchingId === batch.id;
                return (
                  <TableRow key={batch.id} data-testid={`row-batch-${batch.id}`}>
                    <TableCell className="text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="truncate max-w-44" title={batch.fileName}>{batch.fileName}</span>
                      </div>
                    </TableCell>
                    <TableCell><ProviderBadge provider={batch.provider} /></TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{formatDate(batch.createdAt)}</TableCell>
                    <TableCell className="text-sm">{batch.totalRecords ?? "—"}</TableCell>
                    <TableCell className="text-sm text-green-600 font-medium">{batch.matchedRecords ?? "—"}</TableCell>
                    <TableCell className="text-sm text-yellow-600 font-medium">{batch.unmatchedRecords ?? "—"}</TableCell>
                    <TableCell className="text-sm text-blue-600 font-medium">
                      {(batch.skippedRecords ?? 0) > 0 ? batch.skippedRecords : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {batch.status === "complete" ? (
                        <Badge className="bg-green-600 text-white">Complete</Badge>
                      ) : batch.status === "processing" ? (
                        <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Processing</Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1" title={batch.errorMessage || undefined}>
                          <XCircle className="h-3 w-3" /> Failed
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {hasRides && (
                          <Button
                            size="icon"
                            variant="ghost"
                            data-testid={`button-rematch-batch-${batch.id}`}
                            disabled={isRematching || rematchMutation.isPending}
                            onClick={() => {
                              setRematchingId(batch.id);
                              rematchMutation.mutate(batch.id);
                            }}
                            title="Re-run address matching on all rides in this batch"
                          >
                            {isRematching ? (
                              <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                            ) : (
                              <RefreshCw className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          data-testid={`button-delete-batch-${batch.id}`}
                          disabled={deletingId === batch.id || deleteMutation.isPending}
                          onClick={() => setConfirmDeleteId(batch.id)}
                          title="Delete this import batch"
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Audit Log section */}
      <div className="space-y-2">
        <button
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover-elevate px-2 py-1 rounded-md"
          data-testid="button-toggle-audit-log"
          onClick={() => setShowAudit(v => !v)}
        >
          <ChevronRight className={`h-4 w-4 transition-transform ${showAudit ? "rotate-90" : ""}`} />
          Cleanup &amp; Rematch Audit Trail
          {auditLog.length > 0 && (
            <Badge variant="outline" className="ml-1 text-xs">{auditLog.length}</Badge>
          )}
        </button>

        {showAudit && (
          <Card className="overflow-hidden">
            {auditLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : auditLog.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No audit events yet for this module.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>File / Target</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Before</TableHead>
                    <TableHead>After</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLog.map((entry) => (
                    <TableRow key={entry.id} data-testid={`row-audit-${entry.id}`}>
                      <TableCell>
                        <Badge className={`text-xs ${eventTypeBadgeColor(entry.eventType)}`}>
                          {eventTypeLabel(entry.eventType)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-48 truncate" title={entry.targetEntityLabel ?? undefined}>
                        {entry.targetEntityLabel ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{entry.actorUserEmail ?? "System"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {entry.eventType === "rideshare_batch_rematch" && entry.previousValue
                          ? `${(entry.previousValue as any).matchedCount ?? 0} matched`
                          : entry.previousValue && (entry.previousValue as any).actualRideCount != null
                          ? `${(entry.previousValue as any).actualRideCount} rides`
                          : entry.previousValue && (entry.previousValue as any).removedBatches
                          ? `${((entry.previousValue as any).removedBatches as any[]).length} batches`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {entry.eventType === "rideshare_batch_rematch" && entry.newValue
                          ? `${(entry.newValue as any).matchedCount ?? 0} matched`
                          : entry.eventType === "rideshare_batch_deleted"
                          ? "Deleted"
                          : entry.eventType === "rideshare_batch_bulk_cleanup" && entry.metadata
                          ? `${(entry.metadata as any).deletedCount} removed`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                        {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Rejected Tab ─────────────────────────────────────────────────────────────
interface RejectedRow {
  id: string;
  batchId: string;
  provider: string;
  rowNumber: number | null;
  providerTripId: string | null;
  rideDate: string | null;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  passengerName: string | null;
  totalAmount: string | null;
  rejectionCode: string;
  rejectionDetail: string | null;
  rejectionReason: string;
  reprocessStatus: string;
  reprocessedRideId: string | null;
  createdAt: string;
}

function RejectionCodeBadge({ code }: { code: string }) {
  const labelMap: Record<string, string> = {
    duplicate_trip_id: "Duplicate Trip ID",
    missing_required_field: "Missing Required Field",
    invalid_date: "Invalid Date",
    invalid_amount: "Invalid Amount",
    failed_parsing: "Failed Parsing",
    address_parsing_failure: "Address Parse Failure",
    unknown_error: "Unknown Error",
  };
  const colorMap: Record<string, string> = {
    duplicate_trip_id: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    missing_required_field: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    invalid_date: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
    invalid_amount: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
    failed_parsing: "bg-destructive/10 text-destructive",
    address_parsing_failure: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    unknown_error: "bg-muted text-muted-foreground",
  };
  return (
    <Badge className={`text-xs font-medium whitespace-nowrap ${colorMap[code] ?? "bg-muted text-muted-foreground"}`}>
      {labelMap[code] ?? code}
    </Badge>
  );
}

function ReprocessStatusBadge({ status }: { status: string }) {
  if (status === "reprocessed") return <Badge className="bg-green-600 text-white text-xs">Reprocessed</Badge>;
  if (status === "dismissed") return <Badge variant="secondary" className="text-xs">Dismissed</Badge>;
  return <Badge variant="outline" className="text-xs border-destructive/50 text-destructive">Rejected</Badge>;
}

function RejectedTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [batchFilter, setBatchFilter] = useState<string>("__all__");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: batches = [] } = useQuery<{ id: string; fileName: string; provider: string; createdAt: string }[]>({
    queryKey: ["/api/corporate/rideshare/batches"],
    queryFn: () => fetch("/api/corporate/rideshare/batches", { credentials: "include" }).then(r => r.json()),
  });

  const { data: rejectedRows = [], isLoading } = useQuery<RejectedRow[]>({
    queryKey: ["/api/corporate/rideshare/rejected", batchFilter],
    queryFn: () => {
      const params = batchFilter !== "__all__" ? `?batchId=${batchFilter}` : "";
      return fetch(`/api/corporate/rideshare/rejected${params}`, { credentials: "include" }).then(r => r.json());
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: (payload: { rejectedIds?: string[]; batchId?: string }) =>
      apiRequest("POST", "/api/corporate/rideshare/rejected/reprocess", payload),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/rejected"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/rides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/exceptions"] });
      setSelectedIds(new Set());
      toast({
        title: "Reprocess complete",
        description: data?.message ?? "Selected rows have been reprocessed.",
      });
    },
    onError: (err: any) => {
      toast({ title: "Reprocess failed", description: err.message, variant: "destructive" });
    },
  });

  const handleExport = () => {
    const params = batchFilter !== "__all__" ? `?batchId=${batchFilter}` : "";
    window.open(`/api/corporate/rideshare/rejected/export${params}`, "_blank");
  };

  const pendingRows = rejectedRows.filter(r => r.reprocessStatus === "pending");
  const totalRejectedAmount = rejectedRows.reduce((s, r) => s + (parseFloat(r.totalAmount || "0") || 0), 0);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === pendingRows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingRows.map(r => r.id)));
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={batchFilter} onValueChange={(v) => { setBatchFilter(v); setSelectedIds(new Set()); }}>
            <SelectTrigger className="w-64" data-testid="select-rejected-batch-filter">
              <SelectValue placeholder="All batches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All batches</SelectItem>
              {batches.map(b => (
                <SelectItem key={b.id} value={b.id}>
                  {b.fileName} — {new Date(b.createdAt).toLocaleDateString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {pendingRows.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {pendingRows.length} pending · ${totalRejectedAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} unreconciled
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {selectedIds.size > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={reprocessMutation.isPending}
              onClick={() => reprocessMutation.mutate({ rejectedIds: Array.from(selectedIds) })}
              data-testid="button-reprocess-selected"
            >
              {reprocessMutation.isPending ? (
                <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Reprocessing…</>
              ) : (
                <><RotateCcw className="h-3.5 w-3.5 mr-1.5" />Reprocess {selectedIds.size} Selected</>
              )}
            </Button>
          )}
          {pendingRows.length > 0 && selectedIds.size === 0 && batchFilter !== "__all__" && (
            <Button
              size="sm"
              variant="outline"
              disabled={reprocessMutation.isPending}
              onClick={() => reprocessMutation.mutate({ batchId: batchFilter })}
              data-testid="button-reprocess-all"
            >
              {reprocessMutation.isPending ? (
                <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Reprocessing…</>
              ) : (
                <><RotateCcw className="h-3.5 w-3.5 mr-1.5" />Reprocess All Pending</>
              )}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
            data-testid="button-export-rejected"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary bar */}
      {rejectedRows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(["pending", "reprocessed", "dismissed"] as const).map(status => {
            const count = rejectedRows.filter(r => r.reprocessStatus === status).length;
            return (
              <Card key={status}>
                <CardContent className="pt-3 pb-3">
                  <p className="text-xl font-bold">{count}</p>
                  <p className="text-xs text-muted-foreground capitalize">{status}</p>
                </CardContent>
              </Card>
            );
          })}
          <Card>
            <CardContent className="pt-3 pb-3">
              <p className="text-xl font-bold text-destructive">
                ${totalRejectedAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground">Total Rejected Amount</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                {pendingRows.length > 0 && (
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded"
                    checked={selectedIds.size === pendingRows.length && pendingRows.length > 0}
                    onChange={toggleSelectAll}
                    data-testid="checkbox-select-all-rejected"
                  />
                )}
              </TableHead>
              <TableHead className="w-16">Row #</TableHead>
              <TableHead>Trip/Eats ID</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Pickup</TableHead>
              <TableHead>Dropoff</TableHead>
              <TableHead>Passenger</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Rejection Reason</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 10 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rejectedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-12">
                  <div className="flex flex-col items-center gap-2">
                    <CheckCircle2 className="h-8 w-8 text-green-500" />
                    <p className="font-medium">No rejected rows</p>
                    <p className="text-xs">All rows from uploaded files have been imported successfully.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rejectedRows.map(row => (
                <TableRow
                  key={row.id}
                  data-testid={`row-rejected-${row.id}`}
                  className={row.reprocessStatus !== "pending" ? "opacity-60" : ""}
                >
                  <TableCell>
                    {row.reprocessStatus === "pending" && (
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded"
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        data-testid={`checkbox-rejected-${row.id}`}
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-sm font-mono text-muted-foreground">{row.rowNumber ?? "—"}</TableCell>
                  <TableCell className="text-xs font-mono max-w-32 truncate" title={row.providerTripId ?? undefined}>
                    {row.providerTripId ? row.providerTripId.slice(0, 12) + "…" : "—"}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{row.rideDate || "—"}</TableCell>
                  <TableCell className="text-sm max-w-36 truncate" title={row.pickupAddress ?? undefined}>
                    {row.pickupAddress || "—"}
                  </TableCell>
                  <TableCell className="text-sm max-w-36 truncate" title={row.dropoffAddress ?? undefined}>
                    {row.dropoffAddress || "—"}
                  </TableCell>
                  <TableCell className="text-sm">{row.passengerName || "—"}</TableCell>
                  <TableCell className="text-sm font-medium">
                    {row.totalAmount ? `$${parseFloat(row.totalAmount).toFixed(2)}` : "—"}
                  </TableCell>
                  <TableCell className="max-w-64">
                    <div className="flex flex-col gap-1">
                      <RejectionCodeBadge code={row.rejectionCode} />
                      {row.rejectionDetail && (
                        <p className="text-xs text-muted-foreground">{row.rejectionDetail}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <ReprocessStatusBadge status={row.reprocessStatus} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// ─── Employee Expenses Tab ────────────────────────────────────────────────────
interface EmployeeExpenseSummary {
  totalSpend: number;
  rideCount: number;
  byPassenger: { passengerName: string | null; totalSpend: string | null; rideCount: string | null }[];
  byMonth: { month: string | null; totalSpend: string | null; rideCount: string | null }[];
  rides: Ride[];
}

function EmployeeExpensesTab() {
  const { data, isLoading, refetch } = useQuery<EmployeeExpenseSummary>({
    queryKey: ["/api/corporate/rideshare/employee-expenses"],
    queryFn: () => fetch("/api/corporate/rideshare/employee-expenses", { credentials: "include" }).then(r => r.json()),
  });

  const byPassenger = data?.byPassenger || [];
  const byMonth = data?.byMonth || [];
  const rides = data?.rides || [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Rides where Column AB is "Employee" — these are personal/employee expenses, not company-billed trips.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-employee-expenses">
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Total Employee Spend</p>
            {isLoading ? <Skeleton className="h-7 w-28 mt-1" /> : (
              <p className="text-2xl font-bold mt-1">{formatCurrency(data?.totalSpend?.toString() ?? null)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Total Rides</p>
            {isLoading ? <Skeleton className="h-7 w-16 mt-1" /> : (
              <p className="text-2xl font-bold mt-1">{(data?.rideCount ?? 0).toLocaleString()}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Unique Passengers</p>
            {isLoading ? <Skeleton className="h-7 w-12 mt-1" /> : (
              <p className="text-2xl font-bold mt-1">{byPassenger.length}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* By Passenger */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">By Passenger</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Passenger</TableHead>
                  <TableHead className="text-right">Rides</TableHead>
                  <TableHead className="text-right">Total Spend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {[1, 2, 3].map(j => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                    </TableRow>
                  ))
                ) : byPassenger.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      No employee expense rides found.
                    </TableCell>
                  </TableRow>
                ) : (
                  byPassenger.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">{row.passengerName || "Unknown"}</TableCell>
                      <TableCell className="text-sm text-right">{Number(row.rideCount).toLocaleString()}</TableCell>
                      <TableCell className="text-sm font-medium text-right">{formatCurrency(row.totalSpend)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* By Month */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">By Month</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Rides</TableHead>
                  <TableHead className="text-right">Total Spend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {[1, 2, 3].map(j => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                    </TableRow>
                  ))
                ) : byMonth.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      No data.
                    </TableCell>
                  </TableRow>
                ) : (
                  byMonth.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">{row.month || "—"}</TableCell>
                      <TableCell className="text-sm text-right">{Number(row.rideCount).toLocaleString()}</TableCell>
                      <TableCell className="text-sm font-medium text-right">{formatCurrency(row.totalSpend)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Recent rides detail */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ride Detail (latest 200)</CardTitle>
          <CardDescription>All rides where Column AB value is "Employee"</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Passenger</TableHead>
                <TableHead>Pickup</TableHead>
                <TableHead>Dropoff</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {[1, 2, 3, 4, 5, 6].map(j => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                  </TableRow>
                ))
              ) : rides.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No employee expense rides found.
                  </TableCell>
                </TableRow>
              ) : (
                rides.map((ride) => (
                  <TableRow key={ride.id} data-testid={`row-employee-expense-${ride.id}`}>
                    <TableCell><ProviderBadge provider={ride.provider} /></TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {ride.rideDate ? formatDate(ride.rideDate) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{ride.passengerName || "—"}</TableCell>
                    <TableCell className="text-sm max-w-40 truncate" title={ride.pickupAddress || undefined}>
                      {ride.pickupAddress || "—"}
                    </TableCell>
                    <TableCell className="text-sm max-w-40 truncate" title={ride.dropoffAddress || undefined}>
                      {ride.dropoffAddress || "—"}
                    </TableCell>
                    <TableCell className="text-sm font-medium text-right">{formatCurrency(ride.totalAmount)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Summary Cards ────────────────────────────────────────────────────────────
function SummaryCards() {
  const { data } = useQuery<{
    batches: { totalBatches: number };
    rides: { totalRides: number; totalRevenue: string | null; matchedRides: number; unmatchedRides: number; uberRides: number; lyftRides: number };
    exceptions: { pendingExceptions: number; resolvedExceptions: number };
  }>({
    queryKey: ["/api/corporate/rideshare/summary"],
    queryFn: () => fetch("/api/corporate/rideshare/summary", { credentials: "include" }).then(r => r.json()),
  });

  const rides = data?.rides;
  const exceptions = data?.exceptions;
  const batches = data?.batches;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground">Total Rides</p>
          <p className="text-2xl font-bold mt-1">{rides?.totalRides?.toLocaleString() ?? "—"}</p>
          <p className="text-xs text-muted-foreground mt-1">{batches?.totalBatches ?? 0} batch{batches?.totalBatches !== 1 ? "es" : ""}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground">Total Revenue</p>
          <p className="text-2xl font-bold mt-1">
            {rides?.totalRevenue ? `$${parseFloat(rides.totalRevenue).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "$0.00"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Uber: {rides?.uberRides ?? 0} · Lyft: {rides?.lyftRides ?? 0}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground">Matched</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{rides?.matchedRides?.toLocaleString() ?? "—"}</p>
          <p className="text-xs text-muted-foreground mt-1">auto + manual</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground">Pending Exceptions</p>
          <p className={`text-2xl font-bold mt-1 ${(exceptions?.pendingExceptions ?? 0) > 0 ? "text-yellow-600" : "text-foreground"}`}>
            {exceptions?.pendingExceptions?.toLocaleString() ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{exceptions?.resolvedExceptions ?? 0} resolved</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RideshareReconciliation() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("upload");

  const handleUploadSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/batches"] });
    queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/summary"] });
    queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/exceptions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/rides"] });
    queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/rejected"] });
    setActiveTab("exceptions");
  };

  const handleViewRejected = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/corporate/rideshare/rejected"] });
    setActiveTab("rejected");
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start gap-3 flex-wrap">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/reports">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Rideshare Reconciliation</h1>
            <Badge variant="outline">Report Type</Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">
            Ingest Uber and Lyft detail files, match rides to accounts, and manage exceptions.
          </p>
        </div>
      </div>

      {/* Summary KPIs */}
      <SummaryCards />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="upload" data-testid="tab-upload">Upload</TabsTrigger>
          <TabsTrigger value="rides" data-testid="tab-rides">Rides</TabsTrigger>
          <TabsTrigger value="exceptions" data-testid="tab-exceptions">Exceptions</TabsTrigger>
          <TabsTrigger value="employee-expenses" data-testid="tab-employee-expenses">Employee Expenses</TabsTrigger>
          <TabsTrigger value="rejected" data-testid="tab-rejected">Rejected</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">Batch History</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="mt-4">
          <UploadTab onSuccess={handleUploadSuccess} onViewRejected={handleViewRejected} />
        </TabsContent>

        <TabsContent value="rides" className="mt-4">
          <RidesTab />
        </TabsContent>

        <TabsContent value="exceptions" className="mt-4">
          <ExceptionsTab />
        </TabsContent>

        <TabsContent value="employee-expenses" className="mt-4">
          <EmployeeExpensesTab />
        </TabsContent>

        <TabsContent value="rejected" className="mt-4">
          <RejectedTab />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <BatchHistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
